'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadUiModule() {
  class Modal {
    constructor(app) { this.app = app; }
    open() {}
    close() {}
  }
  class Notice {}
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return { Modal, Notice };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '..', 'src', 'resource-relink-ui.cjs');
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('directory relink is the primary maintenance command and single-file repair is clearly advanced', () => {
  const { registerResourceRelinkCommands } = loadUiModule();
  const commands = [];
  const plugin = { app: {}, addCommand: (command) => commands.push(command) };
  registerResourceRelinkCommands(plugin);

  assert.deepEqual(commands.map((command) => command.id), [
    'remap-openlist-folder-paths',
    'relink-openlist-resource'
  ]);
  assert.deepEqual(commands.map((command) => command.name), [
    '重新关联 OpenList 课程目录',
    '重新关联单个 OpenList 文件（高级）'
  ]);
});

test('relink UI lists only active OpenList resources and sources', () => {
  const { activeOpenListResources, activeOpenListSources } = loadUiModule();
  const plugin = {
    state: {
      resources: {
        b: {
          id: 'b', title: 'B 课程', kind: 'video', deletedAt: '',
          launcher: { type: 'openlist', sourceId: 'source-1', remotePath: '/b.mp4' },
          metadata: { remotePath: '/b.mp4' }
        },
        a: {
          id: 'a', title: 'A 课程', kind: 'video', deletedAt: '',
          locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/a.mp4' }
        },
        deleted: {
          id: 'deleted', title: '已删除', deletedAt: '2026-08-24T00:00:00Z',
          locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/deleted.mp4' }
        },
        web: { id: 'web', title: '网页', kind: 'web', deletedAt: '', launcher: { type: 'uri', uri: 'https://example.com' } }
      },
      sources: {
        'source-1': { id: 'source-1', type: 'openlist', alias: '主网盘', deletedAt: '' },
        'source-2': { id: 'source-2', type: 'openlist', alias: '旧网盘', deletedAt: '2026-08-24T00:00:00Z' },
        anki: { id: 'anki', type: 'anki', alias: 'Anki', deletedAt: '' }
      }
    }
  };

  assert.deepEqual(activeOpenListResources(plugin).map((resource) => resource.id), ['a', 'b']);
  assert.deepEqual(activeOpenListSources(plugin).map((source) => source.id), ['source-1']);
});

test('course-directory relink suggests the stored import root instead of the selected video parent when available', () => {
  const { suggestedCourseRoot } = loadUiModule();
  const resource = {
    id: 'r1',
    locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/百度/课程/高数/章节一/17.mp4' },
    metadata: { rootPath: '/百度/课程/高数' }
  };
  const plugin = {
    state: {
      modules: {
        m1: {
          id: 'm1',
          resourceIds: ['r1'],
          resourceRoots: { r1: '/百度/课程/高数/章节一' }
        }
      }
    }
  };

  assert.equal(suggestedCourseRoot(plugin, resource), '/百度/课程/高数');
});
