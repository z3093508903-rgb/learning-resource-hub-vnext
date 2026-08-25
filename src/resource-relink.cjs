'use strict';

const {
  applyOpenListPathRemap,
  normalizeOpenListPathCompat,
  openListLocatorFromResource,
  pathWithinPrefix,
  previewOpenListPathRemap,
  remapPathPrefix,
  sameOpenListLocator,
  updateResourceLocator
} = require('./resource-locator.cjs');

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeStrictOpenListPath(rawPath, options = {}) {
  if (rawPath === null || rawPath === undefined) throw new Error('OpenList 路径不能为空。');
  const raw = String(rawPath).trim();
  if (!raw) throw new Error('OpenList 路径不能为空。');
  if (/[?#]/.test(raw)) throw new Error('OpenList 路径不能包含查询参数或片段。');

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { throw new Error('OpenList 路径包含无效编码。'); }
  const slashPath = decoded.replace(/\\/g, '/');
  const parts = slashPath.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('OpenList 路径不能包含 ..。');

  const normalized = `/${parts.join('/')}`.normalize('NFC');
  if (normalized === '/' && options.allowRoot !== true) {
    throw new Error('为避免误操作，重新关联和批量迁移不能使用 OpenList 根目录。');
  }
  return normalized;
}

function requireOpenListSource(state, sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) throw new Error('缺少 OpenList 来源 ID。');
  const source = objectOr(state?.sources)[id];
  if (!source || source.deletedAt || source.type !== 'openlist') {
    throw new Error('找不到可用的 OpenList 来源。');
  }
  return source;
}

function changedAtIso(options = {}) {
  return options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
}

function parentOpenListPath(remotePath) {
  const normalized = normalizeOpenListPathCompat(remotePath);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function inferMovedRoot(oldRoot, oldPath, newPath) {
  const root = normalizeOpenListPathCompat(oldRoot || '');
  const from = normalizeOpenListPathCompat(oldPath || '');
  const to = normalizeOpenListPathCompat(newPath || '');
  if (root && from && to && pathWithinPrefix(from, root)) {
    const suffix = from.slice(root.length);
    if (suffix && to.endsWith(suffix)) {
      const candidate = to.slice(0, -suffix.length) || '/';
      return normalizeOpenListPathCompat(candidate);
    }
  }
  return parentOpenListPath(to);
}

function syncSingleResourceAssociationRoots(state, resourceId, fromLocator, toLocator, previousMetadataRoot, options = {}) {
  const resource = objectOr(state?.resources)[resourceId];
  if (!resource) return { moduleRootCount: 0 };
  const timestamp = changedAtIso(options);
  const resourceRoot = inferMovedRoot(previousMetadataRoot, fromLocator.remotePath, toLocator.remotePath);
  resource.metadata = { ...(resource.metadata || {}), rootPath: resourceRoot };

  let moduleRootCount = 0;
  for (const module of Object.values(objectOr(state?.modules))) {
    if (!(module?.resourceIds || []).includes(resourceId)) continue;
    const storedRoot = module.resourceRoots?.[resourceId];
    if (!storedRoot) continue;
    const nextRoot = inferMovedRoot(storedRoot, fromLocator.remotePath, toLocator.remotePath);
    module.resourceRoots = objectOr(module.resourceRoots);
    if (module.resourceRoots[resourceId] !== nextRoot) {
      module.resourceRoots[resourceId] = nextRoot;
      module.updatedAt = timestamp;
      if (state.projects?.[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
      moduleRootCount += 1;
    }
  }
  return { moduleRootCount };
}

function syncFolderAssociationPaths(state, preview, updatedResourceIds, options = {}) {
  const updated = new Set(updatedResourceIds || []);
  const timestamp = changedAtIso(options);
  let moduleRootCount = 0;
  let groupScopeCount = 0;

  for (const module of Object.values(objectOr(state?.modules))) {
    let touched = false;
    module.resourceRoots = objectOr(module.resourceRoots);
    for (const resourceId of module.resourceIds || []) {
      if (!updated.has(resourceId)) continue;
      const storedRoot = normalizeOpenListPathCompat(module.resourceRoots[resourceId] || '');
      if (!storedRoot || !pathWithinPrefix(storedRoot, preview.oldPrefix)) continue;
      const nextRoot = remapPathPrefix(storedRoot, preview.oldPrefix, preview.newPrefix);
      if (!nextRoot || nextRoot === storedRoot) continue;
      module.resourceRoots[resourceId] = nextRoot;
      moduleRootCount += 1;
      touched = true;
    }
    if (touched) {
      module.updatedAt = timestamp;
      if (state.projects?.[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
    }
  }

  for (const group of Object.values(objectOr(state?.resourceGroups))) {
    const scopePath = normalizeOpenListPathCompat(group?.scopePath || '');
    if (!scopePath || !pathWithinPrefix(scopePath, preview.oldPrefix)) continue;
    if (!(group.resourceIds || []).some((resourceId) => updated.has(resourceId))) continue;
    const nextScope = remapPathPrefix(scopePath, preview.oldPrefix, preview.newPrefix);
    if (!nextScope || nextScope === scopePath) continue;
    group.scopePath = nextScope;
    group.updatedAt = timestamp;
    groupScopeCount += 1;
  }

  return { moduleRootCount, groupScopeCount };
}

function relinkOpenListResource(state, resourceId, input = {}, options = {}) {
  const resource = objectOr(state?.resources)[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
  const current = openListLocatorFromResource(resource);
  if (!current) throw new Error('当前资源不是可重新关联的 OpenList 资源。');

  const sourceId = String(input.sourceId || current.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  if (sourceId !== current.sourceId) {
    throw new Error('v1 重新关联只允许在同一个 OpenList 来源内移动资源。');
  }
  const remotePath = normalizeStrictOpenListPath(input.remotePath);
  const previousMetadataRoot = resource.metadata?.rootPath || '';
  const result = updateResourceLocator(state, resource.id, {
    type: 'openlist',
    sourceId,
    remotePath
  }, options);
  if (result.changed) {
    result.associationSync = syncSingleResourceAssociationRoots(
      state,
      resource.id,
      current,
      result.locator,
      previousMetadataRoot,
      options
    );
  }
  return result;
}

function previewSafeOpenListPathRemap(state, input = {}) {
  const sourceId = String(input.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  const oldPrefix = normalizeStrictOpenListPath(input.oldPrefix);
  const newPrefix = normalizeStrictOpenListPath(input.newPrefix);
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');
  return previewOpenListPathRemap(state, { sourceId, oldPrefix, newPrefix });
}

function remapFingerprint(preview) {
  return (Array.isArray(preview?.entries) ? preview.entries : [])
    .map((entry) => [
      String(entry.resourceId || ''),
      String(entry.status || ''),
      String(entry.from?.sourceId || ''),
      String(entry.from?.remotePath || ''),
      String(entry.to?.sourceId || ''),
      String(entry.to?.remotePath || ''),
      String(entry.conflictResourceId || '')
    ].join('\u0000'))
    .sort()
    .join('\n');
}

function applySafeOpenListPathRemap(state, preview, options = {}) {
  const sourceId = String(preview?.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  const oldPrefix = normalizeStrictOpenListPath(preview?.oldPrefix);
  const newPrefix = normalizeStrictOpenListPath(preview?.newPrefix);
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');

  const fresh = previewSafeOpenListPathRemap(state, { sourceId, oldPrefix, newPrefix });
  if (fresh.conflictCount > 0) {
    throw new Error(`批量迁移存在 ${fresh.conflictCount} 个路径冲突，请先处理冲突后再确认。`);
  }
  if (remapFingerprint(fresh) !== remapFingerprint(preview)) {
    throw new Error('资源位置在预览后发生变化，请重新生成迁移预览。');
  }

  const result = applyOpenListPathRemap(state, fresh, options);
  if (result.skipped.length) {
    throw new Error('批量迁移未能完整应用，请重新生成迁移预览。');
  }
  result.associationSync = syncFolderAssociationPaths(state, fresh, result.updatedResourceIds, options);
  return result;
}

function isCurrentRelinkTarget(resource, locator) {
  return sameOpenListLocator(openListLocatorFromResource(resource), locator);
}

module.exports = {
  applySafeOpenListPathRemap,
  inferMovedRoot,
  isCurrentRelinkTarget,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource,
  remapFingerprint,
  requireOpenListSource,
  syncFolderAssociationPaths,
  syncSingleResourceAssociationRoots
};
