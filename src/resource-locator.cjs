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
  identityHintsForResource,
  installModelResourceLocatorV2,
  mirrorOpenListLocator,
  normalizeLocatorHistory,
  normalizeOpenListPathCompat,
  normalizeResourceLocatorState,
  normalizeResourceRecord,
  normalizeTimePosition,
  openListLocatorFromResource,
  resumeForResource
};
