'use strict';

const RESOURCE_SCHEMA_VERSION = 2;
const LOCATOR_HISTORY_LIMIT = 10;
const installedModels = new WeakSet();

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeOpenListPathCompat(rawPath) {
  let value = String(rawPath || '/').split(/[?#]/, 1)[0] || '/';
  try { value = decodeURIComponent(value); } catch { /* Keep the original text when legacy data has bad encoding. */ }
  const parts = value.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) return '';
  return `/${parts.join('/')}`.normalize('NFC');
}

function normalizeTimePosition(value) {
  const candidate = value?.type === 'time' ? value.seconds : value;
  if (candidate === '' || candidate === null || candidate === undefined) return null;
  const seconds = Number(candidate);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return { type: 'time', seconds };
}

function normalizeOpenListLocator(value) {
  const locator = objectOr(value);
  const remotePath = normalizeOpenListPathCompat(locator.remotePath || '');
  if (!remotePath) throw new Error('OpenList 资源路径无效。');
  const sourceId = String(locator.sourceId || '').trim();
  if (!sourceId) throw new Error('OpenList 资源缺少来源 ID。');
  return { type: 'openlist', sourceId, remotePath };
}

function openListLocatorFromResource(resource) {
  const source = objectOr(resource);
  const launcher = objectOr(source.launcher);
  const metadata = objectOr(source.metadata);
  const stored = objectOr(source.locator);

  if (stored.type === 'openlist') {
    const remotePath = normalizeOpenListPathCompat(stored.remotePath);
    if (remotePath) {
      return {
        type: 'openlist',
        sourceId: String(stored.sourceId || source.sourceId || launcher.sourceId || ''),
        remotePath
      };
    }
  }

  const legacyOpenList = launcher.type === 'openlist' || launcher.type === 'openlist-file' || Boolean(metadata.remotePath);
  if (!legacyOpenList) return null;
  const remotePath = normalizeOpenListPathCompat(launcher.remotePath || metadata.remotePath || '');
  if (!remotePath) return null;
  return {
    type: 'openlist',
    sourceId: String(launcher.sourceId || source.sourceId || ''),
    remotePath
  };
}

function locatorKey(locator) {
  const normalized = normalizeOpenListLocator(locator);
  return `${normalized.sourceId}\n${normalized.remotePath.toLocaleLowerCase()}`;
}

function sameOpenListLocator(left, right) {
  if (!left || !right) return false;
  try { return locatorKey(left) === locatorKey(right); } catch { return false; }
}

function normalizeLocatorHistory(value) {
  const normalized = [];
  for (const rawEntry of Array.isArray(value) ? value : []) {
    const entry = objectOr(rawEntry);
    if (entry.type !== 'openlist') continue;
    const remotePath = normalizeOpenListPathCompat(entry.remotePath);
    if (!remotePath) continue;
    const item = {
      type: 'openlist',
      sourceId: String(entry.sourceId || ''),
      remotePath,
      changedAt: String(entry.changedAt || '')
    };
    const key = `${item.type}:${item.sourceId}:${item.remotePath}`;
    const existingIndex = normalized.findIndex((candidate) => `${candidate.type}:${candidate.sourceId}:${candidate.remotePath}` === key);
    if (existingIndex >= 0) normalized.splice(existingIndex, 1);
    normalized.push(item);
  }
  return normalized.slice(-LOCATOR_HISTORY_LIMIT);
}

function identityHintsForResource(resource, locator) {
  const source = objectOr(resource);
  const metadata = objectOr(source.metadata);
  const existing = objectOr(source.identityHints);
  const fileName = locator?.remotePath?.split('/').filter(Boolean).pop() || String(existing.fileName || '');
  const sizeCandidate = existing.size ?? metadata.size;
  const size = Number(sizeCandidate);
  return {
    ...existing,
    ...(fileName ? { fileName } : {}),
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
    modified: String(existing.modified ?? metadata.modified ?? '')
  };
}

function resumeForResource(resource) {
  const source = objectOr(resource);
  const existing = objectOr(source.resume);
  const position = normalizeTimePosition(existing.position) || normalizeTimePosition(source.lastPosition);
  if (!position) return Object.keys(existing).length ? { ...existing } : null;
  return {
    ...existing,
    position,
    updatedAt: String(existing.updatedAt || source.lastOpenedAt || source.updatedAt || '')
  };
}

function mirrorOpenListLocator(resource, locator) {
  if (!locator) return resource;
  const launcher = objectOr(resource.launcher);
  const metadata = objectOr(resource.metadata);
  const launcherType = launcher.type === 'openlist' || launcher.type === 'openlist-file'
    ? launcher.type
    : resource.kind === 'video' ? 'openlist' : 'openlist-file';
  resource.sourceId = locator.sourceId;
  resource.launcher = {
    ...launcher,
    type: launcherType,
    sourceId: locator.sourceId,
    remotePath: locator.remotePath
  };
  resource.metadata = {
    ...metadata,
    remotePath: locator.remotePath
  };
  return resource;
}

function normalizeResourceRecord(rawResource, fallbackId = '') {
  const source = objectOr(rawResource);
  const resource = {
    ...source,
    id: String(source.id || fallbackId)
  };
  const locator = openListLocatorFromResource(resource);
  if (locator) {
    resource.locator = locator;
    resource.locatorHistory = normalizeLocatorHistory(source.locatorHistory);
    resource.identityHints = identityHintsForResource(resource, locator);
    mirrorOpenListLocator(resource, locator);
  } else {
    if (Array.isArray(source.locatorHistory)) resource.locatorHistory = normalizeLocatorHistory(source.locatorHistory);
    if (source.identityHints && typeof source.identityHints === 'object') resource.identityHints = { ...source.identityHints };
  }
  const resume = resumeForResource(resource);
  if (resume) resource.resume = resume;
  return resource;
}

function normalizeResourceLocatorState(rawState) {
  const state = objectOr(rawState);
  const resources = {};
  for (const [key, rawResource] of Object.entries(objectOr(state.resources))) {
    resources[key] = normalizeResourceRecord(rawResource, key);
  }
  state.resources = resources;
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  return state;
}

function normalizeFactoryResult(state, result) {
  if (!result?.resource) return result;
  const resourceId = String(result.resource.id || '');
  if (!resourceId) return result;
  const normalized = normalizeResourceRecord(result.resource, resourceId);
  state.resources[resourceId] = normalized;
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  result.resource = normalized;
  return result;
}

function openListCanonicalKey(state, locator) {
  const normalized = normalizeOpenListLocator(locator);
  const source = objectOr(state?.sources)[normalized.sourceId];
  const identity = String(source?.identity || source?.id || normalized.sourceId);
  return `openlist:${identity}:${normalized.remotePath.toLocaleLowerCase()}`;
}

function findOpenListLocatorConflict(state, locator, excludedResourceIds = []) {
  const excluded = new Set(Array.isArray(excludedResourceIds) ? excludedResourceIds : [excludedResourceIds]);
  for (const resource of Object.values(objectOr(state?.resources))) {
    if (!resource?.id || resource.deletedAt || excluded.has(resource.id)) continue;
    const existing = openListLocatorFromResource(resource);
    if (existing && sameOpenListLocator(existing, locator)) return resource;
  }
  return null;
}

function appendLocatorHistory(resource, locator, changedAt) {
  if (!locator) return [];
  const history = normalizeLocatorHistory([
    ...(Array.isArray(resource.locatorHistory) ? resource.locatorHistory : []),
    { ...normalizeOpenListLocator(locator), changedAt: String(changedAt || new Date().toISOString()) }
  ]);
  resource.locatorHistory = history;
  return history;
}

function updateResourceLocator(state, resourceId, nextLocator, options = {}) {
  const resources = objectOr(state?.resources);
  const resource = resources[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
  const normalized = normalizeOpenListLocator(nextLocator);
  const current = openListLocatorFromResource(resource);
  if (current && sameOpenListLocator(current, normalized)) return { resource, changed: false, previousLocator: current };

  const conflict = findOpenListLocatorConflict(state, normalized, [resource.id]);
  if (conflict) throw new Error(`目标位置已关联到另一条资源：${conflict.title || conflict.id}`);

  const changedAt = options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
  if (current) appendLocatorHistory(resource, current, changedAt);
  resource.locator = normalized;
  resource.identityHints = identityHintsForResource(resource, normalized);
  mirrorOpenListLocator(resource, normalized);
  resource.canonicalKey = openListCanonicalKey(state, normalized);
  resource.updatedAt = changedAt;
  if (options.rootPath) resource.metadata.rootPath = normalizeOpenListPathCompat(options.rootPath);
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  return { resource, changed: true, previousLocator: current, locator: normalized };
}

function pathWithinPrefix(remotePath, prefix) {
  return remotePath === prefix || remotePath.startsWith(`${prefix}/`);
}

function remapPathPrefix(remotePath, oldPrefix, newPrefix) {
  const pathValue = normalizeOpenListPathCompat(remotePath);
  const oldValue = normalizeOpenListPathCompat(oldPrefix);
  const newValue = normalizeOpenListPathCompat(newPrefix);
  if (!pathValue || !oldValue || !newValue || !pathWithinPrefix(pathValue, oldValue)) return '';
  const suffix = pathValue.slice(oldValue.length);
  return normalizeOpenListPathCompat(`${newValue}${suffix}`);
}

function previewOpenListPathRemap(state, input = {}) {
  const sourceId = String(input.sourceId || '').trim();
  if (!sourceId) throw new Error('批量迁移缺少 OpenList 来源。');
  const oldPrefix = normalizeOpenListPathCompat(input.oldPrefix || '');
  const newPrefix = normalizeOpenListPathCompat(input.newPrefix || '');
  if (!oldPrefix || !newPrefix) throw new Error('批量迁移目录无效。');
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');

  const resources = Object.values(objectOr(state?.resources)).filter((resource) => {
    if (!resource?.id || resource.deletedAt) return false;
    const locator = openListLocatorFromResource(resource);
    return locator?.sourceId === sourceId && pathWithinPrefix(locator.remotePath, oldPrefix);
  });
  const candidateIds = new Set(resources.map((resource) => resource.id));
  const targetOwners = new Map();
  for (const resource of Object.values(objectOr(state?.resources))) {
    if (!resource?.id || resource.deletedAt || candidateIds.has(resource.id)) continue;
    const locator = openListLocatorFromResource(resource);
    if (locator?.sourceId === sourceId) targetOwners.set(locatorKey(locator), resource);
  }

  const seenTargets = new Map();
  const entries = resources.map((resource) => {
    const from = openListLocatorFromResource(resource);
    const remotePath = remapPathPrefix(from.remotePath, oldPrefix, newPrefix);
    const to = { type: 'openlist', sourceId, remotePath };
    const key = locatorKey(to);
    const externalConflict = targetOwners.get(key);
    const duplicateCandidate = seenTargets.get(key);
    const conflict = externalConflict || duplicateCandidate || null;
    if (!duplicateCandidate) seenTargets.set(key, resource);
    return {
      resourceId: resource.id,
      title: String(resource.title || ''),
      from,
      to,
      status: conflict ? 'conflict' : 'ready',
      conflictResourceId: conflict?.id || '',
      conflictTitle: String(conflict?.title || '')
    };
  });

  return {
    sourceId,
    oldPrefix,
    newPrefix,
    entries,
    readyCount: entries.filter((entry) => entry.status === 'ready').length,
    conflictCount: entries.filter((entry) => entry.status === 'conflict').length
  };
}

function applyOpenListPathRemap(state, preview, options = {}) {
  const changedAt = options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
  const updated = [];
  const skipped = [];
  for (const entry of Array.isArray(preview?.entries) ? preview.entries : []) {
    if (entry.status !== 'ready') {
      skipped.push(entry);
      continue;
    }
    const resource = objectOr(state?.resources)[entry.resourceId];
    if (!resource || resource.deletedAt) {
      skipped.push({ ...entry, status: 'missing-resource' });
      continue;
    }
    const current = openListLocatorFromResource(resource);
    if (!sameOpenListLocator(current, entry.from)) {
      skipped.push({ ...entry, status: 'changed-since-preview' });
      continue;
    }
    const oldRoot = normalizeOpenListPathCompat(resource.metadata?.rootPath || '');
    const nextRoot = oldRoot && pathWithinPrefix(oldRoot, preview.oldPrefix)
      ? remapPathPrefix(oldRoot, preview.oldPrefix, preview.newPrefix)
      : '';
    const result = updateResourceLocator(state, resource.id, entry.to, {
      changedAt,
      ...(nextRoot ? { rootPath: nextRoot } : {})
    });
    if (result.changed) updated.push(resource.id);
  }
  return { updatedResourceIds: updated, skipped };
}

function installModelResourceLocatorV2(model) {
  if (!model || typeof model !== 'object') throw new Error('Resource locator migration requires the model module.');
  if (installedModels.has(model)) return model;

  const legacySchemaVersion = Number(model.SCHEMA_VERSION || 1);
  const legacyNormalizeState = model.normalizeState;
  if (typeof legacyNormalizeState !== 'function') throw new Error('Model normalizeState is unavailable.');

  model.normalizeState = function normalizeStateWithResourceLocators(raw) {
    const input = objectOr(raw);
    const inputVersion = Number(input.schemaVersion || 0);
    if (Number.isFinite(inputVersion) && inputVersion > RESOURCE_SCHEMA_VERSION) {
      throw new Error(`数据版本 ${inputVersion} 高于当前支持的 ${RESOURCE_SCHEMA_VERSION}，已停止加载以避免覆盖较新数据。`);
    }
    const compatibleInput = inputVersion > legacySchemaVersion
      ? { ...input, schemaVersion: legacySchemaVersion }
      : input;
    return normalizeResourceLocatorState(legacyNormalizeState(compatibleInput));
  };

  for (const methodName of ['addResource', 'addInboxResource', 'upsertResourceDescriptor', 'upsertInboxDescriptor']) {
    const legacyMethod = model[methodName];
    if (typeof legacyMethod !== 'function') continue;
    model[methodName] = function resourceFactoryWithLocator(state, ...args) {
      return normalizeFactoryResult(state, legacyMethod(state, ...args));
    };
  }

  model.SCHEMA_VERSION = RESOURCE_SCHEMA_VERSION;
  installedModels.add(model);
  return model;
}

module.exports = {
  LOCATOR_HISTORY_LIMIT,
  RESOURCE_SCHEMA_VERSION,
  appendLocatorHistory,
  applyOpenListPathRemap,
  findOpenListLocatorConflict,
  identityHintsForResource,
  installModelResourceLocatorV2,
  locatorKey,
  mirrorOpenListLocator,
  normalizeLocatorHistory,
  normalizeOpenListLocator,
  normalizeOpenListPathCompat,
  normalizeResourceLocatorState,
  normalizeResourceRecord,
  normalizeTimePosition,
  openListCanonicalKey,
  openListLocatorFromResource,
  pathWithinPrefix,
  previewOpenListPathRemap,
  remapPathPrefix,
  resumeForResource,
  sameOpenListLocator,
  updateResourceLocator
};
