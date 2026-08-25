'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BRIDGE_BASE_URL,
  bridgeTokenPath,
  normalizeBridgeToken,
  readBridgeToken,
  requestPotPlayerBridge
} = require('../src/potplayer-bridge.cjs');

const TOKEN = 'a'.repeat(64);

test('bridge token is device-local under Windows LOCALAPPDATA', () => {
  const tokenPath = bridgeTokenPath({ LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' });
  assert.match(tokenPath.replace(/\\/g, '/'), /AppData\/Local\/GoStudy\/bridge-token\.txt$/);
  assert.throws(() => bridgeTokenPath({}), /LOCALAPPDATA/);
});

test('bridge tokens must be 32-byte hex values', () => {
  assert.equal(normalizeBridgeToken(TOKEN.toUpperCase()), TOKEN);
  assert.throws(() => normalizeBridgeToken('short'), /令牌无效/);
  assert.equal(readBridgeToken({ tokenPath: 'ignored', readFileSync: () => `${TOKEN}\n` }), TOKEN);
  assert.throws(() => readBridgeToken({ tokenPath: 'missing', readFileSync: () => { throw new Error('missing'); } }), /先启动新版/);
});

test('bridge client uses only fixed loopback endpoints and bearer auth', async () => {
  const calls = [];
  const requestUrl = async (options) => {
    calls.push(options);
    return { status: 200, json: { ok: true, version: 1, bridge: 'markdown2potplayer', player: 'potplayer' } };
  };
  const result = await requestPotPlayerBridge(requestUrl, 'ping', { token: TOKEN });
  assert.equal(result.version, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BRIDGE_BASE_URL}/v1/ping`);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].body, undefined);

  await assert.rejects(() => requestPotPlayerBridge(requestUrl, 'run', { token: TOKEN }), /不允许/);
  assert.equal(calls.length, 1);
});

test('bridge client fails fast when the local HTTP bridge accepts TCP but never responds', async () => {
  await assert.rejects(
    () => requestPotPlayerBridge(() => new Promise(() => {}), 'ping', { token: TOKEN, timeoutMs: 20 }),
    /请求超时/
  );
});

test('current and capture responses validate media positions and clipboard transport', async () => {
  const current = await requestPotPlayerBridge(async () => ({
    status: 200,
    json: { ok: true, media: { path: 'C:\\course\\a.mp4', title: 'A', positionMs: 5076500, positionSeconds: 5076.5 } }
  }), 'current', { token: TOKEN });
  assert.equal(current.media.positionSeconds, 5076.5);

  const capture = await requestPotPlayerBridge(async () => ({
    status: 200,
    json: {
      ok: true,
      media: { path: 'C:\\course\\a.mp4', positionSeconds: 12 },
      capture: { transport: 'clipboard', cropped: true }
    }
  }), 'capture', { token: TOKEN });
  assert.equal(capture.capture.transport, 'clipboard');

  await assert.rejects(() => requestPotPlayerBridge(async () => ({
    status: 200,
    json: { ok: true, media: { path: 'x', positionSeconds: -1 } }
  }), 'current', { token: TOKEN }), /播放位置/);

  await assert.rejects(() => requestPotPlayerBridge(async () => ({
    status: 200,
    json: { ok: true, media: { path: 'x', positionSeconds: 1 }, capture: { transport: 'path' } }
  }), 'capture', { token: TOKEN }), /传输方式/);
});

test('bridge client fails closed on authentication and protocol version errors', async () => {
  await assert.rejects(() => requestPotPlayerBridge(async () => ({ status: 401, json: { ok: false, error: 'invalid_token' } }), 'ping', { token: TOKEN }), /配对失败/);
  await assert.rejects(() => requestPotPlayerBridge(async () => ({ status: 200, json: { ok: true, version: 2 } }), 'ping', { token: TOKEN }), /版本不兼容/);
});
