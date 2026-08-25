'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BRIDGE_BASE_URL = 'http://127.0.0.1:33661';
const BRIDGE_VERSION = 2;
const BRIDGE_HTTP_VERSION = 1;
const BRIDGE_REQUEST_TIMEOUT_MS = 5000;
const BRIDGE_FILE_POLL_MS = 50;
const BRIDGE_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const ROUTES = new Map([
  ['ping', { method: 'GET', path: '/v1/ping' }],
  ['current', { method: 'POST', path: '/v1/current' }],
  ['capture', { method: 'POST', path: '/v1/capture' }]
]);

function bridgeDataDir(env = process.env) {
  const localAppData = String(env?.LOCALAPPDATA || '').trim();
  if (!localAppData) throw new Error('找不到 Windows LOCALAPPDATA，无法访问 Go Study Bridge。');
  return path.join(localAppData, 'GoStudy');
}

function bridgeTokenPath(env = process.env) {
  return path.join(bridgeDataDir(env), 'bridge-token.txt');
}

function bridgeRequestDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'requests');
}

function bridgeResponseDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'responses');
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

function bridgePayloadOk(value) {
  return value === true || value === 1 || value === '1';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUnlink(filePath, unlinkSync = fs.unlinkSync) {
  try { unlinkSync(filePath); }
  catch {}
}

function parseBridgeJsonText(value) {
  const text = String(value ?? '').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function normalizeBridgePayload(payload, route, version = BRIDGE_VERSION) {
  const body = payload && typeof payload === 'object' ? payload : {};
  if (!bridgePayloadOk(body.ok)) {
    const error = String(body.error || 'unknown_error');
    if (error === 'invalid_token') throw new Error('Go Study Bridge 配对失败：本机令牌不匹配，请重启 Bridge 后重试。');
    if (error === 'version_mismatch') throw new Error(`Go Study Bridge 版本不兼容，需要协议 v${version}。`);
    throw new Error(`Go Study Bridge 请求失败：${error}`);
  }
  if (Number(body.version) !== version) throw new Error(`Go Study Bridge 版本不兼容：${String(body.version || '未知')}。`);

  if (route === 'ping') {
    return {
      ok: true,
      version,
      bridge: String(body.bridge || ''),
      player: String(body.player || ''),
      transport: String(body.transport || '')
    };
  }

  const media = normalizeBridgeMedia(body.media);
  if (route === 'capture') {
    if (body.capture?.transport !== 'clipboard') throw new Error('Go Study Bridge 截图传输方式不受支持。');
    return { ok: true, media, capture: { transport: 'clipboard', cropped: body.capture?.cropped !== false } };
  }
  return { ok: true, media };
}

async function requestPotPlayerBridgeFile(route, options = {}) {
  if (!ROUTES.has(String(route || ''))) throw new Error('不允许的 Go Study Bridge 操作。');
  const env = options.env || process.env;
  const token = normalizeBridgeToken(options.token || readBridgeToken({ ...options, env }));
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : BRIDGE_REQUEST_TIMEOUT_MS;
  const pollMs = Number.isFinite(Number(options.pollMs)) && Number(options.pollMs) > 0
    ? Number(options.pollMs)
    : BRIDGE_FILE_POLL_MS;
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  const writeFileSync = options.writeFileSync || fs.writeFileSync;
  const renameSync = options.renameSync || fs.renameSync;
  const readFileSync = options.readFileSync || fs.readFileSync;
  const existsSync = options.existsSync || fs.existsSync;
  const unlinkSync = options.unlinkSync || fs.unlinkSync;
  const requests = options.requestDir || bridgeRequestDir(env);
  const responses = options.responseDir || bridgeResponseDir(env);
  mkdirSync(requests, { recursive: true });
  mkdirSync(responses, { recursive: true });

  const requestId = String(options.requestId || crypto.randomBytes(12).toString('hex')).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(requestId)) throw new Error('Go Study Bridge 请求 ID 无效。');
  const requestPath = path.join(requests, `${requestId}.json`);
  const tempPath = path.join(requests, `${requestId}.tmp-${process.pid}-${Date.now()}`);
  const responsePath = path.join(responses, `${requestId}.json`);
  const requestBody = {
    id: requestId,
    version: BRIDGE_VERSION,
    token,
    action: String(route),
    createdAt: Date.now()
  };

  safeUnlink(requestPath, unlinkSync);
  safeUnlink(responsePath, unlinkSync);
  try {
    writeFileSync(tempPath, JSON.stringify(requestBody), { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, requestPath);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(responsePath)) {
        let payload;
        try { payload = parseBridgeJsonText(readFileSync(responsePath, 'utf8')); }
        catch { throw new Error('Go Study Bridge 返回了损坏的响应文件。'); }
        if (String(payload?.id || '') !== requestId) throw new Error('Go Study Bridge 响应 ID 不匹配。');
        return normalizeBridgePayload(payload, route, BRIDGE_VERSION);
      }
      await sleep(pollMs);
    }
    throw new Error(`Go Study Bridge 请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。File Bridge 没有返回响应，请确认新版 markdown2potplayer 正在运行。`);
  } finally {
    safeUnlink(tempPath, unlinkSync);
    safeUnlink(requestPath, unlinkSync);
    safeUnlink(responsePath, unlinkSync);
  }
}

async function requestWithTimeout(requestPromise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      requestPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Go Study HTTP Bridge 请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestPotPlayerBridgeHttp(requestUrl, route, options = {}) {
  if (typeof requestUrl !== 'function') throw new Error('Obsidian requestUrl 不可用。');
  const spec = ROUTES.get(String(route || ''));
  if (!spec) throw new Error('不允许的 Go Study Bridge 操作。');
  const token = normalizeBridgeToken(options.token || readBridgeToken(options));
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : BRIDGE_REQUEST_TIMEOUT_MS;
  const response = await requestWithTimeout(requestUrl({
    url: `${BRIDGE_BASE_URL}${spec.path}`,
    method: spec.method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    throw: false
  }), timeoutMs);
  const status = Number(response?.status || 0);
  const payload = response?.json && typeof response.json === 'object' ? response.json : {};
  if (status < 200 || status >= 300) throw new Error(`Go Study HTTP Bridge 请求失败：HTTP ${status || '未知'}`);
  return normalizeBridgePayload(payload, route, BRIDGE_HTTP_VERSION);
}

async function requestPotPlayerBridge(_requestUrl, route, options = {}) {
  if (options.transport === 'http') return requestPotPlayerBridgeHttp(_requestUrl, route, options);
  return requestPotPlayerBridgeFile(route, options);
}

module.exports = {
  BRIDGE_BASE_URL,
  BRIDGE_FILE_POLL_MS,
  BRIDGE_HTTP_VERSION,
  BRIDGE_REQUEST_TIMEOUT_MS,
  BRIDGE_TOKEN_PATTERN,
  BRIDGE_VERSION,
  ROUTES,
  bridgeDataDir,
  bridgePayloadOk,
  bridgeRequestDir,
  bridgeResponseDir,
  bridgeTokenPath,
  normalizeBridgeMedia,
  normalizeBridgePayload,
  normalizeBridgeToken,
  parseBridgeJsonText,
  readBridgeToken,
  requestPotPlayerBridge,
  requestPotPlayerBridgeFile,
  requestPotPlayerBridgeHttp,
  requestWithTimeout,
  safeUnlink,
  sleep
};
