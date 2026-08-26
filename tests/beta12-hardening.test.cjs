'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', 'src', file), 'utf8');
const settings = read('product-settings.cjs');
const settingsUi = read('product-settings-tab.cjs');
const hotkeys = read('immersive-hotkeys.cjs');
const capture = read('learning-capture.cjs');
const picker = read('project-notes-ui.cjs');

test('beta.12 hardening defaults shortcut ownership to PotPlayer foreground with an explicit global option', () => {
  assert.match(settings, /videoShortcutScope:\s*'potplayer'/);
  assert.match(settings, /normalized === 'potplayer' \|\| normalized === 'global'/);
  assert.match(settingsUi, /快捷键作用范围/);
  assert.match(settingsUi, /仅 PotPlayer 前台时生效/);
  assert.match(settingsUi, /始终作为全局快捷键/);
  assert.match(hotkeys, /startPotPlayerForegroundWatcher/);
  assert.match(hotkeys, /videoShortcutScope === 'global'/);
  assert.match(hotkeys, /unregisterImmersiveHotkeys\(plugin, api\)/);
});

test('plain-note action is opt-in and writes no visible timestamp or backlink', () => {
  assert.match(hotkeys, /plainNote:\s*'纯笔记（不记录时间戳）'/);
  assert.match(hotkeys, /commitPreparedPlainNote/);
  assert.match(hotkeys, /不写入时间戳或回链/);
  assert.match(capture, /async function commitPreparedPlainNote/);
  assert.match(capture, /normalizeUserNote\(noteText\)/);
  assert.match(settingsUi, /默认留空，不额外占用系统快捷键/);
});

test('note and Vault binding pickers keep a stable shell and scroll results internally', () => {
  assert.match(picker, /go-study-picker-shell/);
  assert.match(picker, /go-study-picker-body/);
  assert.match(picker, /scrollbar-gutter:\s*stable/);
  assert.match(picker, /modal\.rh-next-vault-picker-modal/);
  assert.match(picker, /height:\s*min\(680px, 84vh\)/);
  assert.match(picker, /search\.addEventListener\('input'/);
});
