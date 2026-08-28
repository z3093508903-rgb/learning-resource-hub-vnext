'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'study-mode.cjs'), 'utf8');
const companionSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'companion-note-window.cjs'), 'utf8');

test('Study Mode binds one session note and opens the right-rail companion locked by default', () => {
  assert.match(source, /state\.active = true/);
  assert.match(source, /state\.notePath = filePath/);
  assert.match(source, /state\.resourceId/);
  assert.match(source, /state\.projectId/);
  assert.match(source, /layoutId: 'right-rail'/);
  assert.match(source, /locked: true/);
  assert.match(source, /forceLayout: true/);
});

test('Study Mode defaults to a topmost companion but preserves a user unpin choice', () => {
  assert.match(source, /alwaysOnTop: raw\.alwaysOnTop !== false/);
  assert.match(source, /setCompanionAlwaysOnTop/);
  assert.match(companionSource, /toggle-companion-note-always-on-top/);
  assert.match(companionSource, /pin-off/);
});

test('closing the companion exits Study Mode without owning player shutdown', () => {
  assert.match(companionSource, /studyMode\.active = false/);
  assert.match(companionSource, /studyMode\.resourceId = ''/);
  assert.doesNotMatch(source, /kill|taskkill|closePotPlayer|stopPotPlayer/i);
});


test('Study Mode can bind a current loose PotPlayer video without turning it into a permanent Resource', () => {
  assert.match(source, /state\.mode = state\.resourceId \? 'managed' : freeformMedia\?\.path \? 'freeform' : 'note'/);
  assert.match(source, /state\.freeformMedia = freeformMedia\?\.path/);
  assert.match(source, /path: String\(freeformMedia\.path/);
  assert.doesNotMatch(source, /createResource|addInboxResource|linkResource/i);
});
