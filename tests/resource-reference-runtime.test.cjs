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
  assert.match(source, /registerGoStudyReferenceProtocol/);
  assert.match(source, /REFERENCE_ACTION/);
  assert.doesNotMatch(source, /registerObsidianProtocolHandler\([^\n]*path/i);
});


test('cross-platform freeform link upgrades to the unique managed Resource by portable file name', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.state = {
      schemaVersion: 2,
      resources: {
        local: { id: 'local', title: 'Lesson 17', kind: 'video', deletedAt: '' }
      },
      sources: {},
      uiState: {}
    };
    plugin.resourceActions = () => ({
      playTarget: { type: 'potplayer', target: 'D:\\Course\\lesson-17.mp4' }
    });
    let positionedCall = null;
    plugin.openPositionedPlayTarget = async (resource, target, playerTime) => {
      positionedCall = { resource, target, playerTime };
      return true;
    };
    plugin.persist = async () => {};

    const opened = await plugin.openResourceReference({
      mode: 'freeform',
      locator: '/Users/zl/Course/lesson-17.mp4',
      name: 'lesson-17.mp4',
      web: '',
      position: { type: 'time', seconds: 18 },
      version: 2
    });

    assert.equal(opened, true);
    assert.equal(positionedCall.resource.id, 'local');
    assert.equal(positionedCall.playerTime, '00:00:18');
  });
});


test('protocol registration failure is fail-safe and keeps Go Study alive', async () => {
  await withPluginModule(async ({ ExportedPlugin, Notice }) => {
    const plugin = new ExportedPlugin();
    plugin.manifest = { id: 'go-study-preview' };
    plugin.app = { plugins: { enabledPlugins: new Set(['go-study-preview', 'learning-resource-hub-next']) } };
    plugin.registerObsidianProtocolHandler = () => { throw new Error('duplicate protocol owner'); };

    const status = plugin.registerGoStudyReferenceProtocol();

    assert.equal(status.registered, false);
    assert.equal(status.legacyConflict, true);
    assert.match(status.error, /duplicate protocol owner/);
    assert.ok(Notice.messages.some((message) => message.includes('Go Study 已继续启动')));
    assert.ok(Notice.messages.some((message) => message.includes('停用旧版')));
  });
});

test('legacy coexistence warns even when protocol registration itself succeeds', async () => {
  await withPluginModule(async ({ ExportedPlugin, Notice }) => {
    const plugin = new ExportedPlugin();
    plugin.manifest = { id: 'go-study-preview' };
    plugin.app = { plugins: { enabledPlugins: new Set(['go-study-preview', 'learning-resource-hub-next']) } };
    let action = '';
    plugin.registerObsidianProtocolHandler = (value) => { action = value; };

    const status = plugin.registerGoStudyReferenceProtocol();

    assert.equal(action, 'go-study');
    assert.equal(status.registered, true);
    assert.equal(status.legacyConflict, true);
    assert.ok(Notice.messages.some((message) => message.includes('旧版 Learning Resource Hub Next')));
  });
});

test('legacy source plugin id does not mistake itself for a coexistence conflict', async () => {
  await withPluginModule(async ({ ExportedPlugin, Notice }) => {
    const plugin = new ExportedPlugin();
    plugin.manifest = { id: 'learning-resource-hub-next' };
    plugin.app = { plugins: { enabledPlugins: new Set(['learning-resource-hub-next']) } };
    plugin.registerObsidianProtocolHandler = () => {};

    const status = plugin.registerGoStudyReferenceProtocol();

    assert.equal(status.registered, true);
    assert.equal(status.legacyConflict, false);
    assert.equal(Notice.messages.length, 0);
  });
});


test('OpenList playback resolver prefers signed URL when API is healthy', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.loginOpenList = async () => 'token';
    plugin.getOpenList = async (_source, remotePath, token) => {
      assert.equal(remotePath, '/课程/第一课 01.mp4');
      assert.equal(token, 'token');
      return { sign: 'abc+123' };
    };

    const result = await plugin.resolveOpenListPlaybackUrl(
      { id: 's1', baseUrl: 'https://openlist.example.com' },
      '/课程/第一课 01.mp4',
      { notice: false }
    );

    assert.equal(result.fallback, false);
    assert.equal(result.signed, true);
    assert.equal(
      result.url,
      'https://openlist.example.com/d/%E8%AF%BE%E7%A8%8B/%E7%AC%AC%E4%B8%80%E8%AF%BE%2001.mp4?sign=abc%2B123'
    );
  });
});

test('OpenList API network refusal falls back to direct /d URL instead of blocking PotPlayer launch', async () => {
  await withPluginModule(async ({ ExportedPlugin, Notice }) => {
    const plugin = new ExportedPlugin();
    plugin.loginOpenList = async () => { throw new Error('net::ERR_CONNECTION_REFUSED'); };

    const result = await plugin.resolveOpenListPlaybackUrl(
      { id: 's1', baseUrl: 'https://openlist.example.com' },
      '/课程/第一课 01.mp4'
    );

    assert.equal(result.fallback, true);
    assert.equal(result.signed, false);
    assert.equal(
      result.url,
      'https://openlist.example.com/d/%E8%AF%BE%E7%A8%8B/%E7%AC%AC%E4%B8%80%E8%AF%BE%2001.mp4'
    );
    assert.ok(Notice.messages.some((message) => message.includes('已尝试直接播放地址')));
  });
});

test('OpenList auth/file errors do not silently fall back to unsigned playback', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.loginOpenList = async () => 'token';
    plugin.getOpenList = async () => { throw new Error('OpenList 请求失败（HTTP 403）。'); };

    await assert.rejects(
      () => plugin.resolveOpenListPlaybackUrl(
        { id: 's1', baseUrl: 'https://openlist.example.com' },
        '/课程/private.mp4',
        { notice: false }
      ),
      /HTTP 403/
    );
  });
});

test('project-page OpenList play uses resilient playback resolver before Native PotPlayer', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.state = {
      resources: {
        r1: { id: 'r1', title: '第一课', kind: 'video', deletedAt: '' }
      },
      sources: {
        s1: { id: 's1', type: 'openlist', baseUrl: 'https://openlist.example.com', deletedAt: '' }
      },
      uiState: {}
    };
    plugin.resolveOpenListPlaybackUrl = async (_source, remotePath) => {
      assert.equal(remotePath, '/课程/01.mp4');
      return { url: 'https://openlist.example.com/d/%E8%AF%BE%E7%A8%8B/01.mp4', fallback: true };
    };
    let launch = null;
    plugin.launchPotPlayerTarget = async (target, position) => { launch = { target, position }; return {}; };
    plugin.markResourceStarted = async () => {};
    plugin.workbenchLeaf = null;

    const opened = await plugin.openResourceAction(
      plugin.state.resources.r1,
      'play',
      { type: 'openlist', sourceId: 's1', remotePath: '/课程/01.mp4' }
    );

    assert.equal(opened, true);
    assert.deepEqual(launch, {
      target: 'https://openlist.example.com/d/%E8%AF%BE%E7%A8%8B/01.mp4',
      position: 0
    });
  });
});

test('managed OpenList timestamp uses the same resilient playback resolver', async () => {
  await withPluginModule(async ({ ExportedPlugin }) => {
    const plugin = new ExportedPlugin();
    plugin.state = {
      resources: { r1: { id: 'r1', title: '第一课', deletedAt: '' } },
      sources: { s1: { id: 's1', type: 'openlist', baseUrl: 'https://openlist.example.com', deletedAt: '' } },
      uiState: {}
    };
    plugin.resolveOpenListPlaybackUrl = async () => ({
      url: 'https://openlist.example.com/d/course/01.mp4',
      fallback: true
    });
    let launch = null;
    plugin.launchPotPlayerTarget = async (target, position) => { launch = { target, position }; return {}; };
    plugin.markResourceStarted = async () => {};

    const opened = await plugin.openPositionedPlayTarget(
      plugin.state.resources.r1,
      { type: 'openlist', sourceId: 's1', remotePath: '/course/01.mp4' },
      '00:01:09'
    );

    assert.equal(opened, true);
    assert.deepEqual(launch, {
      target: 'https://openlist.example.com/d/course/01.mp4',
      position: '00:01:09'
    });
  });
});
