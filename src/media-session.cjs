'use strict';

const { openListLocatorFromResource } = require('./resource-locator.cjs');
const { freeformLocatorName, normalizePortableMediaName } = require('./resource-reference.cjs');

function normalizeLocalMediaPath(value) {
  return String(value || '')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLocaleLowerCase();
}

function tryUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function comparableWebUrl(value) {
  const url = tryUrl(value);
  if (!url) return null;
  const host = url.hostname.toLocaleLowerCase();
  const pathname = decodeURIComponent(url.pathname || '/').replace(/\/+$/, '') || '/';
  if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) {
    return `bili:${host}:${pathname.toLocaleLowerCase()}:p${url.searchParams.get('p') || '1'}`;
  }
  return `${url.protocol}//${url.host.toLocaleLowerCase()}${pathname}`;
}

function openListMediaMatches(state, resource, mediaPath) {
  const locator = openListLocatorFromResource(resource);
  if (!locator) return false;
  const source = state?.sources?.[locator.sourceId];
  if (!source || source.deletedAt || source.type !== 'openlist' || !source.baseUrl) return false;
  const base = String(source.baseUrl).replace(/\/+$/, '');
  const encoded = locator.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  const expected = tryUrl(`${base}/d${encoded}`);
  const current = tryUrl(mediaPath);
  if (!expected || !current) return false;
  return expected.origin.toLocaleLowerCase() === current.origin.toLocaleLowerCase()
    && decodeURIComponent(expected.pathname).toLocaleLowerCase() === decodeURIComponent(current.pathname).toLocaleLowerCase();
}

function targetMatchesBridgeMedia(state, resource, target, mediaPath) {
  if (!target || !mediaPath) return false;
  if (target.type === 'openlist') return openListMediaMatches(state, resource, mediaPath);
  const expected = target.type === 'potplayer' ? target.target : target.type === 'uri' ? target.uri : '';
  if (!expected) return false;
  const expectedUrl = comparableWebUrl(expected);
  const currentUrl = comparableWebUrl(mediaPath);
  if (expectedUrl || currentUrl) return Boolean(expectedUrl && currentUrl && expectedUrl === currentUrl);
  return normalizeLocalMediaPath(expected) === normalizeLocalMediaPath(mediaPath);
}

function playTargetPortableName(target) {
  if (!target) return '';
  const raw = target.type === 'openlist'
    ? target.remotePath
    : target.type === 'potplayer'
      ? target.target
      : target.type === 'uri'
        ? target.uri
        : '';
  if (!raw) return '';
  try { return freeformLocatorName(raw); } catch { return ''; }
}

function matchingManagedResourceByPortableName(state, mediaName, resolveActions) {
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const expected = normalizePortableMediaName(mediaName).toLocaleLowerCase();
  const matches = Object.values(state?.resources || {})
    .filter((resource) => resource && !resource.deletedAt)
    .filter((resource) => {
      try {
        const actions = resolveActions(resource) || {};
        const name = playTargetPortableName(actions.playTarget);
        return Boolean(name && name.toLocaleLowerCase() === expected);
      } catch { return false; }
    });
  return matches.length === 1 ? matches[0] : null;
}

function validatedBridgePosition(bridgeMedia) {
  if (!bridgeMedia?.path) throw new Error('PotPlayer 当前媒体无法识别。');
  const seconds = Number(bridgeMedia.positionSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('PotPlayer 当前播放位置无效。');
  return { type: 'time', seconds };
}

function matchingManagedResource(state, mediaPath, resolveActions, preferredResourceId = '') {
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const resources = Object.values(state?.resources || {}).filter((resource) => resource && !resource.deletedAt);
  const matches = (resource) => {
    try {
      const actions = resolveActions(resource) || {};
      return Boolean(actions.playTarget && targetMatchesBridgeMedia(state, resource, actions.playTarget, mediaPath));
    } catch {
      return false;
    }
  };
  if (preferredResourceId) {
    const preferred = state?.resources?.[preferredResourceId];
    if (preferred && !preferred.deletedAt && matches(preferred)) return preferred;
  }
  return resources.find((resource) => resource.id !== preferredResourceId && matches(resource)) || null;
}

function resolveUniversalMediaSession(state, activeSession, bridgeMedia, resolveActions, options = {}) {
  const position = validatedBridgePosition(bridgeMedia);
  const preferredResourceId = String(activeSession?.resourceId || '');
  const resource = matchingManagedResource(state, bridgeMedia.path, resolveActions, preferredResourceId);
  if (resource) {
    return {
      mode: 'managed',
      resource,
      position,
      bridgeMedia
    };
  }
  if (options.allowFreeform === false) {
    throw new Error('PotPlayer 当前媒体没有匹配到 Go Study 资源；请先从 Go Study 启动或收录该视频。');
  }
  return {
    mode: 'freeform',
    resource: null,
    position,
    bridgeMedia,
    freeform: {
      path: String(bridgeMedia.path || '').trim(),
      title: String(bridgeMedia.title || '').replace(/\s+-\s+PotPlayer\s*$/i, '').trim()
    }
  };
}

function resolveActiveMediaSession(state, activeSession, bridgeMedia, resolveActions) {
  const resourceId = String(activeSession?.resourceId || '');
  const resource = state?.resources?.[resourceId];
  if (!resource || resource.deletedAt) throw new Error('当前没有有效的 Go Study 学习会话，请先从 Go Study 启动资源。');
  const position = validatedBridgePosition(bridgeMedia);
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const actions = resolveActions(resource) || {};
  if (!actions.playTarget) throw new Error('当前学习资源没有可验证的视频播放目标。');
  if (!targetMatchesBridgeMedia(state, resource, actions.playTarget, bridgeMedia.path)) {
    throw new Error('PotPlayer 当前媒体与 Go Study 最近启动的资源不一致；为避免把笔记记到错误课程，已停止插入。');
  }
  return { resource, position, bridgeMedia };
}

module.exports = {
  comparableWebUrl,
  normalizeLocalMediaPath,
  openListMediaMatches,
  playTargetPortableName,
  matchingManagedResource,
  matchingManagedResourceByPortableName,
  resolveActiveMediaSession,
  resolveUniversalMediaSession,
  targetMatchesBridgeMedia,
  validatedBridgePosition,
  tryUrl
};
