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

test('HUD time and note actions may fall back to Bilibili web while screenshot actions stay PotPlayer-only', () => {
  assert.match(source, /nativeOnly:\s*false/);
  assert.match(source, /nativeOnly:\s*true/);
  assert.match(source, /B站网页模式/);
  assert.match(source, /截图动作仍需要 PotPlayer/);
});


test('active Bilibili browser workflow may move HUD input into a focused local window', () => {
  assert.match(source, /currentBilibiliWebState/);
  assert.match(source, /companionOwnsDesktopFocus/);
  assert.match(source, /shouldUseFocusedWebHud/);
  assert.match(source, /focusedWebHud/);
  assert.match(source, /focusable:\s*focusedWebHud/);
  assert.match(source, /localInputHandler/);
});
