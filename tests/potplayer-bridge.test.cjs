'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BRIDGE_BASE_URL,
  BRIDGE_VERSION,
  bridgeRequestDir,
  bridgeResponseDir,
  bridgeTokenPath,
  normalizeBridgePayload,
  normalizeBridgeToken,
  readBridgeToken,
  requestPotPlayerBridge,
  requestPotPlayerBridgeHttp
} = require('../src/potplayer-bridge.cjs');

const TOKEN = 'a'.repeat(64);
const REQUEST_ID = '0123456789abcdef01234567';

function tempBridgeDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-study-bridge-'));
  const requests = path.join(root, 'requests');
  const responses = path.join(root, 'responses');
  return { root, requests, responses };
}

function startFakeFileBridge(requests, responses, responder) {
  return setInterval(() => {
    if (!fs.existsSync(requests)) return;
    const name = fs.readdirSync(requests).find((value) => value.endsWith('.json'));
    if (!name) return;
    const request = JSON.parse(fs.readFileSync(path.join(requests, name), 'utf8'));
    fs.mkdirSync(responses, { recursive: true });
    const response = responder(request);
    // Reproduce the AutoHotkey UTF-8 BOM that triggered the Windows beta.4 failure.
    fs.writeFileSync(path.join(responses, `${request.id}.json`), `\uFEFF${JSON.stringify(response)}`, 'utf8');
  }, 5);
}

test('bridge paths are device-local under Windows LOCALAPPDATA', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' };
  assert.match(bridgeTokenPath(env).replace(/\\/g, '/'), /AppData\/Local\/GoStudy\/bridge-token\.txt$/);
  assert.match(bridgeRequestDir(env).replace(/\\/g, '/'), /AppData\/Local\/GoStudy\/requests$/);
  assert.match(bridgeResponseDir(env).replace(/\\/g, '/'), /AppData\/Local\/GoStudy\/responses$/);
  assert.throws(() => bridgeTokenPath({}), /LOCALAPPDATA/);
});

test('bridge tokens must be 32-byte hex values', () => {
  assert.equal(normalizeBridgeToken(TOKEN.toUpperCase()), TOKEN);
  assert.throws(() => normalizeBridgeToken('short'), /令牌无效/);
  assert.equal(readBridgeToken({ tokenPath: 'ignored', readFileSync: () => `${TOKEN}\n` }), TOKEN);
  assert.throws(() => readBridgeToken({ tokenPath: 'missing', readFileSync: () => { throw new Error('missing'); } }), /先启动新版/);
});

test('default bridge transport is file IPC v2, accepts BOM responses, and only emits fixed actions', async () => {
  const { root, requests, responses } = tempBridgeDirs();
  let observed = null;
  const timer = startFakeFileBridge(requests, responses, (request) => {
    observed = request;
    return {
      id: request.id,
      version: 2,
      ok: 1,
      bridge: 'markdown2potplayer',
      player: 'potplayer',
      transport: 'file-ipc'
    };
  });
  try {
    const result = await requestPotPlayerBridge(null, 'ping', {
      token: TOKEN,
      requestDir: requests,
      responseDir: responses,
      requestId: REQUEST_ID,
      timeoutMs: 500,
      pollMs: 5
    });
    assert.equal(result.version, BRIDGE_VERSION);
    assert.equal(result.transport, 'file-ipc');
    assert.deepEqual(observed, {
      id: REQUEST_ID,
      version: 2,
      token: TOKEN,
      action: 'ping',
      createdAt: observed.createdAt
    });
    assert.equal(typeof observed.createdAt, 'number');
    assert.equal(fs.existsSync(path.join(requests, `${REQUEST_ID}.json`)), false);
    assert.equal(fs.existsSync(path.join(responses, `${REQUEST_ID}.json`)), false);
    await assert.rejects(() => requestPotPlayerBridge(null, 'run', {
      token: TOKEN,
      requestDir: requests,
      responseDir: responses
    }), /不允许/);
  } finally {
    clearInterval(timer);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file IPC times out with an explicit helper message instead of hanging forever', async () => {
  const { root, requests, responses } = tempBridgeDirs();
  try {
    await assert.rejects(() => requestPotPlayerBridge(null, 'ping', {
      token: TOKEN,
      requestDir: requests,
      responseDir: responses,
      requestId: REQUEST_ID,
      timeoutMs: 30,
      pollMs: 5
    }), /File Bridge 没有返回响应/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('current and capture payloads validate media positions and clipboard transport', () => {
  const current = normalizeBridgePayload({
    ok: 1,
    version: 2,
    media: { path: 'C:\\course\\a.mp4', title: 'A', positionMs: 5076500, positionSeconds: 5076.5 }
  }, 'current', 2);
  assert.equal(current.media.positionSeconds, 5076.5);

  const capture = normalizeBridgePayload({
    ok: true,
    version: 2,
    media: { path: 'C:\\course\\a.mp4', positionSeconds: 12 },
    capture: { transport: 'clipboard', cropped: true }
  }, 'capture', 2);
  assert.equal(capture.capture.transport, 'clipboard');

  assert.throws(() => normalizeBridgePayload({
    ok: 1,
    version: 2,
    media: { path: 'x', positionSeconds: -1 }
  }, 'current', 2), /播放位置/);

  assert.throws(() => normalizeBridgePayload({
    ok: 1,
    version: 2,
    media: { path: 'x', positionSeconds: 1 },
    capture: { transport: 'path' }
  }, 'capture', 2), /传输方式/);
});

test('file bridge fails closed on authentication and protocol version errors', () => {
  assert.throws(() => normalizeBridgePayload({ ok: 0, version: 2, error: 'invalid_token' }, 'ping', 2), /配对失败/);
  assert.throws(() => normalizeBridgePayload({ ok: 1, version: 1 }, 'ping', 2), /版本不兼容/);
});

test('legacy HTTP bridge remains explicit compatibility only', async () => {
  const calls = [];
  const result = await requestPotPlayerBridgeHttp(async (options) => {
    calls.push(options);
    return { status: 200, json: { ok: true, version: 1, bridge: 'markdown2potplayer', player: 'potplayer' } };
  }, 'ping', { token: TOKEN });
  assert.equal(result.version, 1);
  assert.equal(calls[0].url, `${BRIDGE_BASE_URL}/v1/ping`);
  assert.equal(calls[0].method, 'GET');
});
