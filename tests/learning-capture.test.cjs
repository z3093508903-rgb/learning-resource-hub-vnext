'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadCaptureModule() {
  class Notice {}
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return { Notice, requestUrl: async () => ({}) };
    if (request === 'electron') return { clipboard: { readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '..', 'src', 'learning-capture.cjs');
  delete require.cache[modulePath];
  try { return require(modulePath); }
  finally { Module._load = originalLoad; }
}

function localPluginFixture() {
  const inserted = [];
  const resource = {
    id: 'resource-local',
    kind: 'video',
    title: '本地课程',
    launcher: { type: 'file', target: 'C:\\Course\\lesson.mp4' },
    deletedAt: ''
  };
  const plugin = {
    state: { resources: { [resource.id]: resource }, sources: {} },
    activeMediaSession: { resourceId: resource.id, startedAt: '2026-08-24T12:00:00Z', lastKnownPosition: null },
    resourceActions: () => ({ playTarget: { type: 'potplayer', target: 'C:\\Course\\lesson.mp4' } }),
    app: {
      workspace: { activeEditor: { editor: { replaceSelection: (text) => inserted.push(text) } } }
    },
    persistCalls: 0,
    async persist() { this.persistCalls += 1; },
    workbenchLeaf: null
  };
  return { plugin, resource, inserted };
}

test('learning capture commands always register ordinary callbacks so failures cannot disappear silently', () => {
  const { registerLearningCaptureCommands } = loadCaptureModule();
  const commands = [];
  registerLearningCaptureCommands({ addCommand: (command) => commands.push(command) });
  assert.deepEqual(commands.map((command) => command.id), [
    'check-potplayer-bridge',
    'insert-current-learning-position',
    'capture-frame-and-insert-learning-position'
  ]);
  assert.equal(typeof commands[0].callback, 'function');
  assert.equal(typeof commands[1].callback, 'function');
  assert.equal(typeof commands[2].callback, 'function');
  assert.equal(commands[1].editorCallback, undefined);
  assert.equal(commands[2].editorCallback, undefined);
});

test('bridge check uses only the ping route', async () => {
  const { checkPotPlayerBridge } = loadCaptureModule();
  const calls = [];
  const result = await checkPotPlayerBridge({
    bridgeRequest: async (_requestUrl, route) => {
      calls.push(route);
      return { ok: true, version: 1 };
    },
    requestUrl: async () => {}
  });
  assert.deepEqual(calls, ['ping']);
  assert.equal(result.version, 1);
});

test('insert current position writes permanent markdown through the editor and updates resume', async () => {
  const { insertCurrentLearningPosition } = loadCaptureModule();
  const { plugin, resource, inserted } = localPluginFixture();
  const bridgeRequest = async (_requestUrl, route) => {
    assert.equal(route, 'current');
    return { ok: true, media: { path: 'c:/course/lesson.mp4', title: 'lesson', positionSeconds: 125.5 } };
  };

  const explicitEditor = { replaceSelection: (text) => inserted.push(text) };
  plugin.app.workspace.activeEditor = null;
  const result = await insertCurrentLearningPosition(plugin, { bridgeRequest, requestUrl: async () => {}, editor: explicitEditor });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0], result.markdown);
  assert.match(result.markdown, /obsidian:\/\/go-study\?/);
  assert.match(result.markdown, /02:05/);
  assert.deepEqual(resource.resume.position, { type: 'time', seconds: 125.5 });
  assert.deepEqual(plugin.activeMediaSession.lastKnownPosition, { type: 'time', seconds: 125.5 });
  assert.equal(plugin.persistCalls, 1);
});

test('insert current position refuses a different PotPlayer media before touching the editor', async () => {
  const { insertCurrentLearningPosition } = loadCaptureModule();
  const { plugin, inserted } = localPluginFixture();
  await assert.rejects(() => insertCurrentLearningPosition(plugin, {
    bridgeRequest: async () => ({ ok: true, media: { path: 'c:/course/another.mp4', positionSeconds: 10 } }),
    requestUrl: async () => {},
    editor: { replaceSelection: (text) => inserted.push(text) }
  }), /不一致/);
  assert.equal(inserted.length, 0);
  assert.equal(plugin.persistCalls, 0);
});

test('capture command saves PNG bytes into Vault then inserts image plus permanent backlink', async () => {
  const { captureFrameAndInsertLearningPosition, CAPTURE_FOLDER } = loadCaptureModule();
  const { plugin, inserted } = localPluginFixture();
  const existing = new Set();
  const binaries = [];
  plugin.app.vault = {
    getAbstractFileByPath: (value) => existing.has(value) ? { path: value } : null,
    createFolder: async (value) => { existing.add(value); },
    createBinary: async (value, bytes) => {
      existing.add(value);
      binaries.push({ path: value, bytes: Buffer.from(bytes) });
    }
  };

  const result = await captureFrameAndInsertLearningPosition(plugin, {
    bridgeRequest: async (_requestUrl, route) => {
      assert.equal(route, 'capture');
      return {
        ok: true,
        media: { path: 'C:\\Course\\lesson.mp4', positionSeconds: 65 },
        capture: { transport: 'clipboard', cropped: true }
      };
    },
    requestUrl: async () => {},
    editor: { replaceSelection: (text) => inserted.push(text) },
    readClipboardPng: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
  });

  assert.equal(binaries.length, 1);
  assert.ok(binaries[0].path.startsWith(`${CAPTURE_FOLDER}/本地课程-01-05`));
  assert.deepEqual([...binaries[0].bytes], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(inserted.length, 1);
  assert.match(inserted[0], /^!\[\[GoStudy\/Captures\//);
  assert.match(inserted[0], /obsidian:\/\/go-study\?/);
  assert.equal(result.vaultPath, binaries[0].path);
});

test('capture validates editor before requesting a screenshot', async () => {
  const { captureFrameAndInsertLearningPosition } = loadCaptureModule();
  const { plugin } = localPluginFixture();
  plugin.app.workspace.activeEditor = null;
  let bridgeCalls = 0;
  await assert.rejects(() => captureFrameAndInsertLearningPosition(plugin, {
    bridgeRequest: async () => { bridgeCalls += 1; return {}; },
    requestUrl: async () => {}
  }), /可编辑的 Markdown/);
  assert.equal(bridgeCalls, 0);
});

test('capture folder creation tolerates a concurrent creator after re-checking the Vault', async () => {
  const { ensureVaultFolder } = loadCaptureModule();
  const existing = new Set();
  let first = true;
  const vault = {
    getAbstractFileByPath: (value) => existing.has(value) ? { path: value } : null,
    createFolder: async (value) => {
      if (first) {
        first = false;
        existing.add(value);
        throw new Error('already exists');
      }
      existing.add(value);
    }
  };
  await ensureVaultFolder(vault, 'GoStudy/Captures');
  assert.ok(existing.has('GoStudy'));
  assert.ok(existing.has('GoStudy/Captures'));
});

test('capture path increments instead of overwriting an existing screenshot', () => {
  const { uniqueCapturePath } = loadCaptureModule();
  const resource = { title: '课程' };
  const position = { type: 'time', seconds: 65 };
  const occupied = new Set(['GoStudy/Captures/课程-01-05.png']);
  const vault = { getAbstractFileByPath: (value) => occupied.has(value) ? { path: value } : null };
  assert.equal(uniqueCapturePath(vault, resource, position), 'GoStudy/Captures/课程-01-05-2.png');
});
