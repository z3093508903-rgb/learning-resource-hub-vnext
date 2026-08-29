'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('构建后的插件入口可在 Obsidian/Electron API 形状下加载', () => {
  class Base {}
  class Plugin extends Base {}
  class ItemView extends Base {}
  class Modal extends Base {}
  class Menu extends Base {}
  class Notice extends Base {}
  const obsidian = {
    ItemView, Menu, Modal, Notice, Plugin,
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
    if (request === '@electron/remote') throw new Error('not available in this smoke test');
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const built = path.resolve(__dirname, '..', 'main.js');
    delete require.cache[built];
    const ExportedPlugin = require(built);
    assert.equal(typeof ExportedPlugin, 'function');
    assert.ok(ExportedPlugin.prototype instanceof Plugin);
  } finally {
    Module._load = originalLoad;
  }
});

test('B站请求被客户端拦截时会切换到备用网络通道', async () => {
  class Base {}
  class Plugin extends Base {}
  class ItemView extends Base {}
  class Modal extends Base {}
  class Menu extends Base {}
  class Notice extends Base {}
  const obsidian = {
    ItemView, Menu, Modal, Notice, Plugin,
    requestUrl: async () => { throw new Error('net::ERR_BLOCKED_BY_CLIENT'); },
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
    if (request === '@electron/remote') throw new Error('not available in this smoke test');
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const built = path.resolve(__dirname, '..', 'main.js');
    delete require.cache[built];
    const ExportedPlugin = require(built);
    const plugin = new ExportedPlugin();
    let fallbackCalls = 0;
    plugin.requestBiliDataViaNode = async () => {
      fallbackCalls += 1;
      return { status: 200, json: { code: 0, data: { name: '备用通道成功' } } };
    };
    const result = await plugin.requestBiliData('https://api.bilibili.com/test');
    assert.equal(fallbackCalls, 1);
    assert.deepEqual(result, { name: '备用通道成功' });
  } finally {
    Module._load = originalLoad;
  }
});

test('资源清理前状态可备份并从备份恢复', async () => {
  class Base {}
  class Plugin extends Base {}
  class ItemView extends Base {}
  class Modal extends Base {}
  class Menu extends Base {}
  class Notice extends Base {}
  const obsidian = { ItemView, Menu, Modal, Notice, Plugin, requestUrl: async () => ({ json: {} }), setIcon: () => {} };
  const electron = {
    shell: { openPath: async () => '', openExternal: async () => {} },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => Buffer.from(value).toString('utf8')
    }
  };
  const originalLoad = Module._load;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-next-cleanup-'));
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return obsidian;
    if (request === 'electron') return electron;
    if (request === '@electron/remote') throw new Error('not available in this smoke test');
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const built = path.resolve(__dirname, '..', 'main.js');
    delete require.cache[built];
    const ExportedPlugin = require(built);
    const plugin = new ExportedPlugin();
    plugin.app = { vault: { adapter: { getBasePath: () => tempRoot }, configDir: '.obsidian' } };
    plugin.manifest = { id: 'learning-resource-hub-next', dir: path.join('.obsidian', 'plugins', 'learning-resource-hub-next') };
    plugin.persist = async () => {};
    plugin.state = {
      schemaVersion: 1,
      projects: {}, modules: {}, plans: {}, sources: {}, notes: {}, activity: [], inbox: [],
      resources: { r1: { id: 'r1', title: '保留资源', kind: 'web', deletedAt: '' } },
      uiState: { lastAction: { type: 'cleanup-resources' } }
    };
    const backupName = await plugin.createStateBackup('test');
    plugin.state.resources = {};
    await plugin.restoreStateBackup(backupName);
    assert.equal(plugin.state.resources.r1.title, '保留资源');
    assert.equal(plugin.state.uiState.lastAction, null);
    assert.ok(fs.existsSync(path.join(tempRoot, '.obsidian', 'go-study-recovery', backupName)));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Vault 文件夹重命、删除和同路径重建会同步项目文件引用', async () => {
  class Base {}
  class Plugin extends Base {}
  class ItemView extends Base {}
  class Modal extends Base {}
  class Menu extends Base {}
  class Notice extends Base {}
  const obsidian = { ItemView, Menu, Modal, Notice, Plugin, requestUrl: async () => ({ json: {} }), setIcon: () => {} };
  const electron = { shell: { openPath: async () => '', openExternal: async () => {} }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => Buffer.from(value).toString('utf8') } };
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return obsidian;
    if (request === 'electron') return electron;
    if (request === '@electron/remote') throw new Error('not available in this smoke test');
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const built = path.resolve(__dirname, '..', 'main.js');
    delete require.cache[built];
    const ExportedPlugin = require(built);
    const plugin = new ExportedPlugin();
    plugin.state = {
      projects: {},
      vaultRefs: {
        folder: { id: 'folder', path: '学习/英语', entryType: 'folder', fileKind: 'other', missingAt: '', updatedAt: '' },
        note: { id: 'note', path: '学习/英语/笔记.md', entryType: 'file', fileKind: 'markdown', missingAt: '', updatedAt: '' }
      }
    };
    let persisted = 0;
    plugin.persist = async () => { persisted += 1; };
    plugin.workbenchLeaf = { view: { render: async () => {} } };

    await plugin.handleVaultRename({ path: '课程/英语' }, '学习/英语');
    assert.equal(plugin.state.vaultRefs.folder.path, '课程/英语');
    assert.equal(plugin.state.vaultRefs.note.path, '课程/英语/笔记.md');

    await plugin.handleVaultDelete({ path: '课程/英语' });
    assert.ok(plugin.state.vaultRefs.folder.missingAt);
    assert.ok(plugin.state.vaultRefs.note.missingAt);

    await plugin.handleVaultCreate({ path: '课程/英语/笔记.md' });
    assert.equal(plugin.state.vaultRefs.note.missingAt, '');
    assert.ok(plugin.state.vaultRefs.folder.missingAt);
    assert.equal(persisted, 3);
  } finally {
    Module._load = originalLoad;
  }
});
