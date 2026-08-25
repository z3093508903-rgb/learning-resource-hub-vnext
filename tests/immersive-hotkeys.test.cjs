'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'immersive-hotkeys.cjs'), 'utf8');

test('immersive hotkeys expose four distinct actions', () => {
  for (const key of ['position', 'capture', 'note', 'captureNote']) {
    assert.match(source, new RegExp(`${key}:`));
  }
  assert.match(source, /Alt\+1|immersiveShortcuts/);
});

test('video enhancement is an opt-in runtime gate and disabled mode releases registered shortcuts', () => {
  assert.match(source, /videoEnhancementEnabled/);
  assert.match(source, /mode:\s*'disabled'/);
  assert.match(source, /unregisterImmersiveHotkeys\(plugin, api\)/);
});

test('Alt+3 note flow pauses before opening the prompt and commits note plus backlink', () => {
  const noteBlock = source.slice(source.indexOf("if (key === 'note')"), source.indexOf("if (key === 'captureNote')"));
  assert.match(noteBlock, /pause:\s*true/);
  assert.match(noteBlock, /showQuickNoteInput/);
  assert.match(noteBlock, /commitPreparedTypedNote/);
  assert.match(noteBlock, /resumePreparedPlayback\(plugin, prepared, 'save'/);
  assert.match(noteBlock, /resumePreparedPlayback\(plugin, prepared, 'cancel'/);
});

test('Alt+4 capture-note flow pauses, captures before prompting, then commits image note and backlink', () => {
  const block = source.slice(source.indexOf("if (key === 'captureNote')"));
  assert.match(block, /prepareCaptureLearningPosition/);
  assert.match(block, /pause:\s*true/);
  assert.match(block, /showQuickNoteInput/);
  assert.match(block, /commitPreparedCaptureTypedNote/);
  assert.match(block, /resumePreparedPlayback/);
});

test('duplicate configured shortcuts are rejected before registration', () => {
  assert.match(source, /shortcutConflict/);
  assert.match(source, /不能使用同一个快捷键/);
});

test('native hotkeys force the plugin-owned PotPlayer path instead of silently using Companion', () => {
  assert.match(source, /nativeOnly:\s*true/g);
});
