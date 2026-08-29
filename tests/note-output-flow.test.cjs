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

function fixture() {
  const inserted = [];
  const resource = {
    id: 'resource-local',
    kind: 'video',
    title: '本地课程',
    launcher: { type: 'file', target: 'C:\\Course\\lesson.mp4' },
    deletedAt: ''
  };
  const plugin = {
    state: {
      resources: { [resource.id]: resource },
      sources: {},
      uiState: {
        timeDisplayFormat: 'hms',
        backlinkTemplate: '🎬 [{time}]({uri}) · {title}',
        noteTemplate: '> {note}\n> {backlink}'
      }
    },
    activeMediaSession: { resourceId: resource.id, startedAt: '2026-08-26T00:00:00Z' },
    resourceActions: () => ({ playTarget: { type: 'potplayer', target: 'C:\\Course\\lesson.mp4' } }),
    app: { workspace: { activeEditor: null } },
    async persist() {},
    workbenchLeaf: null
  };
  return { plugin, resource, inserted };
}

test('Alt+1 capture flow uses configured timestamp and backlink presentation', async () => {
  const { insertCurrentLearningPosition } = loadCaptureModule();
  const { plugin, inserted } = fixture();
  const result = await insertCurrentLearningPosition(plugin, {
    bridgeRequest: async () => ({ ok: true, media: { path: 'C:\\Course\\lesson.mp4', positionSeconds: 65 } }),
    editor: { replaceSelection: (value) => inserted.push(value) }
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0], result.markdown);
  assert.match(result.markdown, /^🎬 \[00:01:05\]\(obsidian:\/\/go-study\?/);
  assert.match(result.markdown, / · 本地课程$/);
});

test('Alt+3 commit flow uses configured note template while keeping a permanent backlink', async () => {
  const { commitPreparedTypedNote } = loadCaptureModule();
  const { plugin, resource, inserted } = fixture();
  const prepared = {
    editor: { replaceSelection: (value) => inserted.push(value) },
    resource,
    position: { type: 'time', seconds: 65 },
    player: { control: {} }
  };
  await commitPreparedTypedNote(plugin, prepared, '关键结论');
  assert.equal(inserted.length, 1);
  assert.match(inserted[0], /^> 关键结论\n> 🎬 \[00:01:05\]\(obsidian:\/\/go-study\?/);
  assert.match(inserted[0], / · 回到课程$/);
});


test('programmatic learning capture reveals the Companion caret without focusing it', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'learning-capture.cjs'), 'utf8');
  assert.match(source, /revealCompanionEditorCursor/);
  assert.match(source, /revealCompanionEditorCursor\(plugin, prepared\.editor, \{ focus: false/);
  assert.match(source, /revealCompanionEditorCursor\(plugin, editor, \{ focus: false/);
});
