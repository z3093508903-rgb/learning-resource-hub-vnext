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

test('legacy Alt+3 maps into the unified time+note action with pause, prompt and resume semantics', () => {
  assert.match(source, /note:\s*'timeNote'/);
  assert.match(source, /action\.note/);
  assert.match(source, /prepareCurrentLearningPosition/);
  assert.match(source, /pause:\s*true/);
  assert.match(source, /promptForPreparedNote/);
  assert.match(source, /commitPreparedTypedNote/);
  assert.match(source, /resumePreparedPlayback\(plugin, prepared, 'save'/);
  assert.match(source, /resumePreparedPlayback\(plugin, prepared, 'cancel'/);
});

test('legacy Alt+4 maps into the unified all-elements action and captures before prompting', () => {
  assert.match(source, /captureNote:\s*'all'/);
  assert.match(source, /action\.image && action\.note/);
  assert.match(source, /prepareCaptureLearningPosition/);
  assert.match(source, /pause:\s*true/);
  assert.match(source, /promptForPreparedNote/);
  assert.match(source, /commitPreparedCaptureTypedNote/);
  assert.match(source, /resumePreparedPlayback/);
});

test('duplicate configured shortcuts are rejected before registration', () => {
  assert.match(source, /shortcutConflict/);
  assert.match(source, /不能使用同一个快捷键/);
});

test('native hotkeys force the plugin-owned PotPlayer path instead of silently using Companion', () => {
  assert.match(source, /nativeOnly:\s*true/g);
});
