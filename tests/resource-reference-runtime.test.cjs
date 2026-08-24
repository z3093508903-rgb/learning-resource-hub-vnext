'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

function withPluginModule(run) {
  class Base {}
  class Plugin extends Base {}
  class ItemView extends Base {}
  class Modal extends Base {}
  class Menu extends Base {}
  class Notice extends Base {
    constructor(message) {
      super();
      Notice.messages.push(String(message));
    }
  }
  Notice.messages = [];
  const obsidian = {
    ItemView,
    Menu,
    Modal,
    Notice,
    Plugin,
    requestUrl: async () => ({ json: {} }),
    setIcon: () => {}
  };
  const electron = {
    shell: { openPath: async () => '', openExternal: async () => {} },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => Buffer.from(value).toString('utf8')
    }
  };
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return obsidian;
    if (request === 'electron') return electron;
    if (request === '@electron/remote') throw new Error('not available in backlink runtime test');
    return originalLoad.call(this, request, parent, isMain);
  };

  const entry = path.resolve(__dirname, '..', 'src', 'entry.cjs');
  const main = path.resolve(__dirname, '..', 'src', 'main.cjs');
  delete require.cache[entry];
  delete require.cache[main];
  try {
    const ExportedPlugin = require(entry);
    return run({ ExportedPlugin, Notice });
  } finally {
    delete require.cache[entry];
    delete require.cache[main];
    Module._load = originalLoad;
  }
}

test('runtime backlink resolves Resource ID, passes position to playback, and updates resume', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.state = {
      schemaVersion: 2,
      resources: {
        'resource-1': {
          id: 'resource-1',
          title: '高等数学 第17课',
          kind: 'video',
          locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/课程/17.mp4' }
        }
      },
      sources: {},
      uiState: {}
    };
    plugin.resourceActions = () => ({
      playTarget: { type: 'openlist', sourceId: 'source-1', remotePath: '/课程/17.mp4' }
    });
    let positionedCall = null;
    plugin.openPositionedPlayTarget = async (resource, target, playerTime) => {
      positionedCall = { resource, target, playerTime };
      return true;
    };
    let persisted = 0;
    plugin.persist = async () => { persisted += 1; };

    const opened = await plugin.handleResourceReference({
      resource: 'resource-1',
      position: 'time:5076',
      v: '1'
    });

    assert.equal(opened, true);
    assert.equal(positionedCall.resource.id, 'resource-1');
    assert.equal(positionedCall.target.remotePath, '/课程/17.mp4');
    assert.equal(positionedCall.playerTime, '01:24:36');
    assert.deepEqual(plugin.state.resources['resource-1'].resume.position, { type: 'time', seconds: 5076 });
    assert.equal(plugin.state.resources['resource-1'].lastPosition, 5076);
    assert.equal(plugin.activeMediaSession.resourceId, 'resource-1');
    assert.deepEqual(plugin.activeMediaSession.lastKnownPosition, { type: 'time', seconds: 5076 });
    assert.equal(persisted, 1);
  });
});

test('runtime backlink rejects arbitrary path execution before playback resolution', async () => {
  await withPluginModule(async ({ ExportedPlugin, Notice }) => {
    const plugin = new ExportedPlugin();
    plugin.state = { resources: {}, sources: {}, uiState: {} };
    let launchCalls = 0;
    plugin.openPositionedPlayTarget = async () => { launchCalls += 1; return true; };

    const opened = await plugin.handleResourceReference({
      resource: 'resource-1',
      position: 'time:10',
      v: '1',
      path: 'C:\\Windows\\System32\\cmd.exe'
    });

    assert.equal(opened, false);
    assert.equal(launchCalls, 0);
    assert.ok(Notice.messages.some((message) => message.includes('不允许的参数')));
  });
});

test('entry registers only the fixed go-study Obsidian protocol action', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'entry.cjs'), 'utf8');
  assert.match(source, /registerObsidianProtocolHandler\(REFERENCE_ACTION/);
  assert.match(source, /REFERENCE_ACTION/);
  assert.doesNotMatch(source, /registerObsidianProtocolHandler\([^\n]*path/i);
});
