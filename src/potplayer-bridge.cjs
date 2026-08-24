'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BRIDGE_BASE_URL = 'http://127.0.0.1:33661';
const BRIDGE_VERSION = 1;
const BRIDGE_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const ROUTES = new Map([
  ['ping', { method: 'GET', path: '/v1/ping' }],
  ['current', { method: 'POST', path: '/v1/current' }],
  ['capture', { method: 'POST', path: '/v1/capture' }]
]);

function bridgeTokenPath(env = process.env) {
  const localAppData = String(env?.LOCALAPPDATA || '').trim();
  if (!localAppData) throw new Error('找不到 Windows LOCALAPPDATA，无法读取 Go Study Bridge 配对令牌。');
  return path.join(localAppData, 'GoStudy', 'bridge-token.txt');
}

function normalizeBridgeToken(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!BRIDGE_TOKEN_PATTERN.test(token)) throw new Error('Go Study Bridge 配对令牌无效，请重启 Bridge 重新生成。');
  return token;
}

function readBridgeToken(options = {}) {
  const readFileSync = options.readFileSync || fs.readFileSync;
  const tokenPath = options.tokenPath || bridgeTokenPath(options.env || process.env);
  let raw;
  try { raw = readFileSync(tokenPath, 'utf8'); }
  catch { throw new Error('没有找到 Go Study Bridge 配对令牌，请先启动新版 markdown2potplayer Bridge。'); }
  return normalizeBridgeToken(raw);
}

function normalizeBridgeMedia(value) {
  const media = value && typeof value === 'object' ? value : {};
  const mediaPath = String(media.path || '').trim();
  if (!mediaPath) throw new Error('Go Study Bridge 没有返回当前媒体地址。');
  const positionSeconds = Number(media.positionSeconds);
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) throw new Error('Go Study Bridge 返回了无效播放位置。');
  const positionMs = Number(media.positionMs);
  return {
    path: mediaPath,
    title: String(media.title || ''),
    positionSeconds,
    positionMs: Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : positionSeconds * 1000
  };
}

async function requestPotPlayerBridge(requestUrl, route, options = {}) {
  if (typeof requestUrl !== 'function') throw new Error('Obsidian requestUrl 不可用。');
  const spec = ROUTES.get(String(route || ''));
  if (!spec) throw new Error('不允许的 Go Study Bridge 操作。');
  const token = normalizeBridgeToken(options.token || readBridgeToken(options));
  const response = await requestUrl({
    url: `${BRIDGE_BASE_URL}${spec.path}`,
    method: spec.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    throw: false
  });
  const status = Number(response?.status || 0);
  const payload = response?.json && typeof response.json === 'object' ? response.json : {};
  if (status === 401) throw new Error('Go Study Bridge 配对失败：本机令牌不匹配，请重启 Bridge 后重试。');
  if (status < 200 || status >= 300 || payload.ok !== true) {
    throw new Error(`Go Study Bridge 请求失败：${String(payload.error || `HTTP ${status || '未知'}`)}`);
  }

  if (route === 'ping') {
    if (Number(payload.version) !== BRIDGE_VERSION) throw new Error(`Go Study Bridge 版本不兼容：${String(payload.version || '未知')}。`);
    return { ok: true, version: BRIDGE_VERSION, bridge: String(payload.bridge || ''), player: String(payload.player || '') };
  }

  const media = normalizeBridgeMedia(payload.media);
  if (route === 'capture') {
    if (payload.capture?.transport !== 'clipboard') throw new Error('Go Study Bridge 截图传输方式不受支持。');
    return { ok: true, media, capture: { transport: 'clipboard', cropped: payload.capture?.cropped !== false } };
  }
  return { ok: true, media };
}

module.exports = {
  BRIDGE_BASE_URL,
  BRIDGE_TOKEN_PATTERN,
  BRIDGE_VERSION,
  ROUTES,
  bridgeTokenPath,
  normalizeBridgeMedia,
  normalizeBridgeToken,
  readBridgeToken,
  requestPotPlayerBridge
};
