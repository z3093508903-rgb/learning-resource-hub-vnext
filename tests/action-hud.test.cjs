'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hudSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'action-hud.cjs'), 'utf8');
const hotkeySource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'immersive-hotkeys.cjs'), 'utf8');

test('HUD renders five configurable slots without taking foreground focus', () => {
  for (const slot of ['up','left','center','right','down']) assert.match(hudSource, new RegExp(slot));
  assert.match(hudSource, /focusable:\s*false/);
  assert.match(hudSource, /showInactive/);
});

test('master shortcut uses deterministic direction selection before delayed HUD display', () => {
  assert.match(hotkeySource, /beginActionHud/);
  assert.match(hotkeySource, /actionHudDelayMs/);
  assert.doesNotMatch(hotkeySource, /if \(!visible\) return execute\(slot\)/);
  assert.match(hotkeySource, /revealHudNow/);
  assert.match(hotkeySource, /selected = slot/);
  assert.match(hotkeySource, /lastDirectionAt = now/);
  for (const key of ['Up','Down','Left','Right','Enter','Escape']) assert.match(hotkeySource, new RegExp(key));
  assert.match(hotkeySource, /cleanup\(\);\n\s*void runCaptureAction/);
});

test('legacy actions and HUD actions share one capture-action executor', () => {
  assert.match(hotkeySource, /LEGACY_ACTION_MAP/);
  assert.match(hotkeySource, /runCaptureAction/);
  assert.match(hotkeySource, /timeImage/);
  assert.match(hotkeySource, /commitPreparedPlainCaptureTypedNote/);
});


test('HUD supports double-pressing the same direction as direction plus Enter regardless of display timing', () => {
  assert.match(hotkeySource, /lastDirectionAt/);
  assert.match(hotkeySource, /directionDoublePressMs/);
  assert.match(hotkeySource, /selected === slot && now - lastDirectionAt <= doublePressMs/);
  assert.match(hotkeySource, /return execute\(slot\)/);
});


test('first direction press reveals and selects instead of executing immediately', () => {
  const start = hotkeySource.indexOf('const chooseDirection = (slot) => {');
  const end = hotkeySource.indexOf('const handlers = {', start);
  const block = hotkeySource.slice(start, end);
  assert.match(block, /selected = slot/);
  assert.match(block, /revealHudNow\(\)/);
  assert.match(block, /hud\?\.select/);
  assert.doesNotMatch(block, /!visible.*execute/);
});
