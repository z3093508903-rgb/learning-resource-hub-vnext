'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hudSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'action-hud.cjs'), 'utf8');
const hotkeySource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'immersive-hotkeys.cjs'), 'utf8');

test('HUD supports both passive PotPlayer mode and focused browser-input mode', () => {
  for (const slot of ['up','left','center','right','down']) assert.match(hudSource, new RegExp(slot));
  assert.match(hudSource, /const focusable = Boolean\(options\.focusable\)/);
  assert.match(hudSource, /before-input-event/);
  assert.match(hudSource, /ArrowUp/);
  assert.match(hudSource, /event\?\.preventDefault/);
  assert.match(hudSource, /showInactive/);
  assert.match(hudSource, /win\.focus/);
  assert.match(hudSource, /setAlwaysOnTop\?\.\(true, 'screen-saver'\)/);
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


test('Bilibili focused HUD uses local key capture and temporary global handlers only as bootstrap', () => {
  assert.match(hotkeySource, /shouldUseFocusedWebHud/);
  assert.match(hotkeySource, /focusable:\s*focusedWebHud/);
  assert.match(hotkeySource, /onInput:\s*\(key\) => localInputHandler/);
  assert.match(hotkeySource, /registerTemporaryHandlers\(false\)/);
  assert.match(hotkeySource, /releaseTemporaryHandlers/);
  assert.match(hotkeySource, /Promise\.resolve\(hud\?\.show\?\.\(\)\)/);
  assert.match(hotkeySource, /focusedWebHud/);
});
