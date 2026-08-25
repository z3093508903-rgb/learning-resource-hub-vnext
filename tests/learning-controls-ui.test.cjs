'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'learning-controls-ui.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');

test('immersive UI no longer inserts the wide learning control strip', () => {
  assert.doesNotMatch(uiSource, /rh-next-learning-controls\s*\{/);
  assert.doesNotMatch(uiSource, /createButton\(doc, strip, '记录位置'/);
  assert.match(uiSource, /rh-next-immersive-status/);
  assert.match(uiSource, /renderImmersiveStatus/);
});

test('course relink actions live in project-page right-click management', () => {
  assert.match(uiSource, /contextmenu/);
  assert.match(uiSource, /重新关联 OpenList 课程目录/);
  assert.match(uiSource, /重新关联单个 OpenList 文件（高级）/);
  assert.match(uiSource, /OpenListFolderRemapModal/);
  assert.match(uiSource, /OpenListResourceRelinkModal/);
});

test('screenshot test action is moved into plugin settings enhancement', () => {
  assert.match(uiSource, /视频笔记增强/);
  assert.match(uiSource, /createSettingsButton\(doc, actions, '截图记录'/);
  assert.match(uiSource, /captureFrameAndInsertLearningPosition/);
  assert.match(uiSource, /findSettingsContainer/);
});

test('native immersive hotkeys are mounted before the lightweight UI', () => {
  assert.match(runtimeSource, /registerImmersiveHotkeys\(this\)/);
  assert.match(runtimeSource, /installLearningControls\(this\)/);
  assert.ok(runtimeSource.indexOf('registerImmersiveHotkeys(this)') < runtimeSource.indexOf('installLearningControls(this)'));
});
