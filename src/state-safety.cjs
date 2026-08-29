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

function siblingPluginData(plugin, pluginId) {
  const basePath = plugin?.app?.vault?.adapter?.getBasePath?.();
  if (!basePath) return { filePath: '', raw: '', data: null, error: null };
  const configDir = plugin?.app?.vault?.configDir || '.obsidian';
  const safeId = String(pluginId || '').trim();
  if (!safeId || safeId === String(plugin?.manifest?.id || '').trim()) {
    return { filePath: '', raw: '', data: null, error: null };
  }
  const filePath = path.join(basePath, configDir, 'plugins', safeId, 'data.json');
  if (!fs.existsSync(filePath)) return { filePath, raw: '', data: null, error: null };
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : null;
    return { filePath, raw, data, error: null };
  } catch (error) {
    return { filePath, raw: '', data: null, error };
  }
}

function previewMigrationCandidate(plugin) {
  if (String(plugin?.manifest?.id || '').trim() !== 'go-study') {
    return { eligible: false, pluginId: '', filePath: '', raw: '', data: null, error: null };
  }
  const current = readRawPluginData(plugin);
  if (current.raw) {
    return { eligible: false, pluginId: '', filePath: current.filePath, raw: '', data: null, error: null };
  }
  const preview = siblingPluginData(plugin, 'go-study-preview');
  const eligible = Boolean(preview.raw && meaningfulState(preview.data));
  return {
    eligible,
    pluginId: eligible ? 'go-study-preview' : '',
    ...preview
  };
}

function protectPreviewMigration(plugin, candidate) {
  if (!candidate?.eligible || !candidate?.raw) return { recoveryPath: '' };
  const dir = recoveryDirectory(plugin);
  if (!dir) return { recoveryPath: '' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const recoveryPath = path.join(dir, `saved-preview-migration-${safeStamp()}.json`);
    fs.writeFileSync(recoveryPath, candidate.raw, 'utf8');
    return { recoveryPath };
  } catch (error) {
    return { recoveryPath: '', error };
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

function isNamedRecoveryEntryName(name) {
  return /^saved-/i.test(String(name || ''));
}

function recoveryEntries(plugin) {
  const dir = recoveryDirectory(plugin);
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        fullPath,
        mtimeMs: Number(stat.mtimeMs || 0),
        size: Number(stat.size || 0),
        named: isNamedRecoveryEntryName(entry.name)
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
}

function pruneRecoveryBackups(plugin, keep = 10) {
  const retention = Math.max(3, Math.min(100, Math.floor(Number(keep) || 10)));
  const automatic = recoveryEntries(plugin).filter((entry) => !entry.named);
  const removed = [];
  for (const entry of automatic.slice(retention)) {
    try {
      fs.unlinkSync(entry.fullPath);
      removed.push(entry.name);
    } catch {}
  }
  return removed;
}

function writeRecoveryState(plugin, state, label = 'manual') {
  const dir = recoveryDirectory(plugin);
  if (!dir) throw new Error('当前 Vault 不支持本地恢复备份。');
  fs.mkdirSync(dir, { recursive: true });
  const safeLabel = String(label || 'manual').replace(/[^a-z0-9_-]+/gi, '-');
  const name = `state-${safeStamp()}-${safeLabel}.json`;
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
  return { name, fullPath };
}

function sanitizeNamedBackupLabel(value) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || '手动备份';
}

function writeNamedRecoveryState(plugin, state, label = '手动备份') {
  const dir = recoveryDirectory(plugin);
  if (!dir) throw new Error('当前 Vault 不支持本地恢复备份。');
  fs.mkdirSync(dir, { recursive: true });
  const safeLabel = sanitizeNamedBackupLabel(label);
  const name = `saved-${safeLabel}-${safeStamp()}.json`;
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
  return { name, fullPath, named: true };
}

function renameRecoveryEntry(plugin, currentName, newLabel) {
  const safeCurrent = path.basename(String(currentName || ''));
  if (!safeCurrent) throw new Error('找不到需要重命名的备份。');
  const dir = recoveryDirectory(plugin);
  const currentPath = path.join(dir, safeCurrent);
  if (!fs.existsSync(currentPath)) throw new Error('备份文件已经不存在。');
  const targetName = `saved-${sanitizeNamedBackupLabel(newLabel)}-${safeStamp()}.json`;
  const targetPath = path.join(dir, targetName);
  fs.renameSync(currentPath, targetPath);
  return { name: targetName, fullPath: targetPath, named: true };
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
    rawText: protectedRaw.raw || '',
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
    lastProtectedRaw: plugin?._goStudyStateSafety?.rawText || '',
    allowDestructivePersist: false
  };
  return plugin._goStudyStateSafety;
}

function refreshPersistBaseline(plugin) {
  if (!plugin?._goStudyStateSafety) return markLoadedBaseline(plugin, plugin?.state);
  plugin._goStudyStateSafety.baselineState = plugin?.state ? JSON.parse(JSON.stringify(plugin.state)) : null;
  plugin._goStudyStateSafety.baselineCounts = stateCounts(plugin?.state);
  return plugin._goStudyStateSafety;
}

function protectBeforePersist(plugin, keep = 10) {
  const safety = plugin?._goStudyStateSafety || (plugin._goStudyStateSafety = {});
  const raw = readRawPluginData(plugin);
  if (!raw.raw) return { protected: false, recoveryPath: '' };
  if (raw.raw === safety.lastProtectedRaw) return { protected: false, recoveryPath: '' };
  const protectedRaw = protectRawPluginData(plugin, 'before-save');
  if (protectedRaw.raw) safety.lastProtectedRaw = protectedRaw.raw;
  pruneRecoveryBackups(plugin, keep);
  return { protected: Boolean(protectedRaw.recoveryPath), recoveryPath: protectedRaw.recoveryPath || '' };
}

module.exports = {
  assertSafePersist,
  catastrophicStateDrop,
  markLoadedBaseline,
  isNamedRecoveryEntryName,
  meaningfulState,
  pluginDataPath,
  pluginDirectory,
  previewMigrationCandidate,
  protectPreviewMigration,
  protectBeforePersist,
  protectRawPluginData,
  pruneRecoveryBackups,
  readRawPluginData,
  recoveryDirectory,
  recoveryEntries,
  renameRecoveryEntry,
  refreshPersistBaseline,
  stateCounts,
  siblingPluginData,
  stateWeight,
  startupSafetySnapshot,
  writeNamedRecoveryState,
  writeRecoveryState
};
