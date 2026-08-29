'use strict';

const fs = require('node:fs');
const path = require('node:path');

function objectCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function stateCounts(state) {
  const source = state && typeof state === 'object' ? state : {};
  return {
    projects: objectCount(source.projects),
    modules: objectCount(source.modules),
    resources: objectCount(source.resources),
    sources: objectCount(source.sources),
    vaultRefs: objectCount(source.vaultRefs),
    notes: objectCount(source.notes),
    projectNotes: objectCount(source.projectNotes),
    inbox: Array.isArray(source.inbox) ? source.inbox.length : 0
  };
}

function stateWeight(counts) {
  return Object.values(counts || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
}

function meaningfulState(state) {
  const counts = stateCounts(state);
  return stateWeight(counts) > 0;
}

function catastrophicStateDrop(before, after) {
  const a = stateCounts(before);
  const b = stateCounts(after);
  const beforeWeight = stateWeight(a);
  const afterWeight = stateWeight(b);
  if (beforeWeight <= 0) return false;
  if (afterWeight === 0) return true;
  const criticalBefore = a.projects + a.resources + a.modules;
  const criticalAfter = b.projects + b.resources + b.modules;
  return criticalBefore >= 3
    && criticalAfter === 0
    && afterWeight <= Math.max(1, Math.floor(beforeWeight * 0.05));
}

function pluginDirectory(plugin) {
  const basePath = plugin?.app?.vault?.adapter?.getBasePath?.();
  if (!basePath) return '';
  const manifestDir = String(plugin?.manifest?.dir || '').trim();
  if (manifestDir) return path.isAbsolute(manifestDir) ? manifestDir : path.join(basePath, manifestDir);
  const configDir = plugin?.app?.vault?.configDir || '.obsidian';
  const id = plugin?.manifest?.id || 'go-study-preview';
  return path.join(basePath, configDir, 'plugins', id);
}

function pluginDataPath(plugin) {
  const dir = pluginDirectory(plugin);
  return dir ? path.join(dir, 'data.json') : '';
}

function readRawPluginData(plugin) {
  const filePath = pluginDataPath(plugin);
  if (!filePath || !fs.existsSync(filePath)) return { filePath, raw: '', data: null, error: null };
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : null;
    return { filePath, raw, data, error: null };
  } catch (error) {
    return { filePath, raw: '', data: null, error };
  }
}

function recoveryDirectory(plugin) {
  const basePath = plugin?.app?.vault?.adapter?.getBasePath?.();
  if (!basePath) return '';
  const configDir = plugin?.app?.vault?.configDir || '.obsidian';
  return path.join(basePath, configDir, 'go-study-recovery');
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function protectRawPluginData(plugin, label = 'startup') {
  const raw = readRawPluginData(plugin);
  if (!raw.raw) return { ...raw, recoveryPath: '' };
  const dir = recoveryDirectory(plugin);
  if (!dir) return { ...raw, recoveryPath: '' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const recoveryPath = path.join(dir, `data-${safeStamp()}-${String(label || 'startup').replace(/[^a-z0-9_-]+/gi, '-')}.json`);
    fs.writeFileSync(recoveryPath, raw.raw, 'utf8');
    return { ...raw, recoveryPath };
  } catch (error) {
    return { ...raw, recoveryPath: '', protectionError: error };
  }
}

function startupSafetySnapshot(plugin) {
  const protectedRaw = protectRawPluginData(plugin, 'before-load');
  return {
    filePath: protectedRaw.filePath,
    recoveryPath: protectedRaw.recoveryPath,
    rawData: protectedRaw.data,
    rawCounts: stateCounts(protectedRaw.data),
    rawMeaningful: meaningfulState(protectedRaw.data),
    readError: protectedRaw.error || null,
    protectionError: protectedRaw.protectionError || null
  };
}

function assertSafePersist(plugin) {
  const safety = plugin?._goStudyStateSafety;
  if (!safety?.baselineState || safety.allowDestructivePersist) return true;
  if (!catastrophicStateDrop(safety.baselineState, plugin.state)) return true;
  const emergency = protectRawPluginData(plugin, 'blocked-destructive-save');
  const error = new Error(
    'Go Study 检测到状态将从有数据异常变为空状态，已阻止写入 data.json。'
      + (emergency.recoveryPath ? ` 原始数据已保护到：${emergency.recoveryPath}` : '')
  );
  error.code = 'GO_STUDY_STATE_GUARD';
  throw error;
}

function markLoadedBaseline(plugin, rawState = null) {
  const baseline = meaningfulState(rawState) ? rawState : plugin?.state;
  plugin._goStudyStateSafety = {
    ...(plugin._goStudyStateSafety || {}),
    baselineState: baseline ? JSON.parse(JSON.stringify(baseline)) : null,
    baselineCounts: stateCounts(baseline),
    allowDestructivePersist: false
  };
  return plugin._goStudyStateSafety;
}

module.exports = {
  assertSafePersist,
  catastrophicStateDrop,
  markLoadedBaseline,
  meaningfulState,
  pluginDataPath,
  pluginDirectory,
  protectRawPluginData,
  readRawPluginData,
  recoveryDirectory,
  stateCounts,
  stateWeight,
  startupSafetySnapshot
};
