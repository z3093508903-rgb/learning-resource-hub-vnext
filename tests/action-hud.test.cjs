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

test('master shortcut supports quick direction execution before delayed HUD display', () => {
  assert.match(hotkeySource, /beginActionHud/);
  assert.match(hotkeySource, /actionHudDelayMs/);
  assert.match(hotkeySource, /if \(!visible\) return execute\(slot\)/);
  for (const key of ['Up','Down','Left','Right','Enter','Escape']) assert.match(hotkeySource, new RegExp(key));
  assert.match(hotkeySource, /cleanup\(\);\n\s*void runCaptureAction/);
});

test('legacy actions and HUD actions share one capture-action executor', () => {
  assert.match(hotkeySource, /LEGACY_ACTION_MAP/);
  assert.match(hotkeySource, /runCaptureAction/);
  assert.match(hotkeySource, /timeImage/);
  assert.match(hotkeySource, /commitPreparedPlainCaptureTypedNote/);
});


test('visible HUD supports double-pressing the same direction as direction plus Enter', () => {
  assert.match(hotkeySource, /lastDirectionAt/);
  assert.match(hotkeySource, /directionDoublePressMs/);
  assert.match(hotkeySource, /selected === slot && now - lastDirectionAt <= doublePressMs/);
  assert.match(hotkeySource, /return execute\(slot\)/);
});
