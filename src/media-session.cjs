'use strict';

const { openListLocatorFromResource } = require('./resource-locator.cjs');

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

function resolveActiveMediaSession(state, activeSession, bridgeMedia, resolveActions) {
  const resourceId = String(activeSession?.resourceId || '');
  const resource = state?.resources?.[resourceId];
  if (!resource || resource.deletedAt) throw new Error('当前没有有效的 Go Study 学习会话，请先从 Go Study 启动资源。');
  if (!bridgeMedia?.path) throw new Error('PotPlayer 当前媒体无法识别。');
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const actions = resolveActions(resource) || {};
  if (!actions.playTarget) throw new Error('当前学习资源没有可验证的视频播放目标。');
  if (!targetMatchesBridgeMedia(state, resource, actions.playTarget, bridgeMedia.path)) {
    throw new Error('PotPlayer 当前媒体与 Go Study 最近启动的资源不一致；为避免把笔记记到错误课程，已停止插入。');
  }
  const seconds = Number(bridgeMedia.positionSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('PotPlayer 当前播放位置无效。');
  return {
    resource,
    position: { type: 'time', seconds },
    bridgeMedia
  };
}

module.exports = {
  comparableWebUrl,
  normalizeLocalMediaPath,
  openListMediaMatches,
  resolveActiveMediaSession,
  targetMatchesBridgeMedia,
  tryUrl
};
