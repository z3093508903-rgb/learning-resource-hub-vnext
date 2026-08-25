'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

function loadModule() {
  class Notice {}
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return { Notice, requestUrl: async () => ({}) };
    if (request === 'electron') return { clipboard: { readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const targets = ['companion-events.cjs', 'learning-capture.cjs'];
  for (const name of targets) delete require.cache[path.resolve(__dirname, '..', 'src', name)];
  try { return require(path.resolve(__dirname, '..', 'src', 'companion-events.cjs')); }
  finally { Module._load = originalLoad; }
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-study-companion-events-'));
  const env = { ...process.env, LOCALAPPDATA: root };
  const dataDir = path.join(root, 'GoStudy');
  fs.mkdirSync(dataDir, { recursive: true });
  const token = 'ab'.repeat(32);
  fs.writeFileSync(path.join(dataDir, 'bridge-token.txt'), token, 'utf8');
  return {
    root,
    env,
    token,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

test('reverse event contract accepts only fresh authenticated fixed actions', () => {
  const {
    COMPANION_EVENT_VERSION,
    validateCompanionEvent
  } = loadModule();
  const token = 'cd'.repeat(32);
  const now = Date.now();
  const base = {
    id: '0123456789abcdef01234567',
    version: COMPANION_EVENT_VERSION,
    token,
    action: 'insert-position',
    createdAt: now
  };
  assert.equal(validateCompanionEvent(base, token, { now }).action, 'insert-position');
  assert.equal(validateCompanionEvent({ ...base, action: 'capture-position' }, token, { now }).action, 'capture-position');
  assert.throws(() => validateCompanionEvent({ ...base, action: 'run-command' }, token, { now }), /unsupported_action/);
  assert.throws(() => validateCompanionEvent({ ...base, token: 'ef'.repeat(32) }, token, { now }), /invalid_token/);
  assert.throws(() => validateCompanionEvent({ ...base, createdAt: now - 60000 }, token, { now }), /stale_event/);
});

test('Go Study consumes a companion event exactly once and writes an acknowledgement', async () => {
  const fx = fixture();
  try {
    const {
      companionAckDir,
      companionEventDir,
      ensureCompanionDirs,
      processCompanionEvents
    } = loadModule();
    ensureCompanionDirs({ env: fx.env });
    const id = '111111111111111111111111';
    fs.writeFileSync(path.join(companionEventDir(fx.env), `${id}.json`), JSON.stringify({
      id,
      version: 1,
      token: fx.token,
      action: 'insert-position',
      createdAt: Date.now()
    }), 'utf8');
    let calls = 0;
    const result = await processCompanionEvents({}, {
      env: fx.env,
      handlers: {
        'insert-position': async () => { calls += 1; return { resourceId: 'resource-1', positionSeconds: 42 }; },
        'capture-position': async () => ({})
      }
    });
    assert.equal(result.processed, 1);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(path.join(companionEventDir(fx.env), `${id}.json`)), false);
    const ack = JSON.parse(fs.readFileSync(path.join(companionAckDir(fx.env), `${id}.json`), 'utf8'));
    assert.equal(ack.ok, true);
    assert.equal(ack.action, 'insert-position');
    assert.equal(ack.result.positionSeconds, 42);

    const second = await processCompanionEvents({}, {
      env: fx.env,
      handlers: { 'insert-position': async () => { calls += 1; return {}; } }
    });
    assert.equal(second.processed, 0);
    assert.equal(calls, 1);
  } finally { fx.cleanup(); }
});

test('unsupported companion events are deleted and acknowledged as failure without executing a handler', async () => {
  const fx = fixture();
  try {
    const { companionAckDir, companionEventDir, ensureCompanionDirs, processCompanionEvents } = loadModule();
    ensureCompanionDirs({ env: fx.env });
    const id = '222222222222222222222222';
    fs.writeFileSync(path.join(companionEventDir(fx.env), `${id}.json`), JSON.stringify({
      id,
      version: 1,
      token: fx.token,
      action: 'powershell',
      createdAt: Date.now()
    }), 'utf8');
    let called = false;
    await processCompanionEvents({}, {
      env: fx.env,
      handlers: { powershell: async () => { called = true; } }
    });
    assert.equal(called, false);
    assert.equal(fs.existsSync(path.join(companionEventDir(fx.env), `${id}.json`)), false);
    const ack = JSON.parse(fs.readFileSync(path.join(companionAckDir(fx.env), `${id}.json`), 'utf8'));
    assert.equal(ack.ok, false);
    assert.match(ack.error, /unsupported_action/);
  } finally { fx.cleanup(); }
});
