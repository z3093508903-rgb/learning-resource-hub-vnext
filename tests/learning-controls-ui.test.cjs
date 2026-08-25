'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'learning-controls-ui.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');

test('immersive learning controls expose primary actions without relying on Ctrl+P', () => {
  for (const label of ['记录位置', '截图记录', '课程重关联', '单文件修复 · 高级']) {
    assert.match(uiSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(uiSource, /insertCurrentLearningPosition/);
  assert.match(uiSource, /captureFrameAndInsertLearningPosition/);
  assert.match(uiSource, /OpenListFolderRemapModal/);
  assert.match(uiSource, /OpenListResourceRelinkModal/);
});

test('learning controls stay scoped to the active plugin workbench and are mounted at runtime', () => {
  assert.match(uiSource, /workspace-leaf-content\[data-type=/);
  assert.match(uiSource, /plugin\.manifest\.id/);
  assert.match(uiSource, /data-go-study-learning-controls/);
  assert.match(runtimeSource, /installLearningControls\(this\)/);
});

test('Bridge state is visible and can be refreshed from the control strip', () => {
  assert.match(uiSource, /Bridge 检查中/);
  assert.match(uiSource, /Bridge 未连接/);
  assert.match(uiSource, /checkPotPlayerBridge/);
  assert.match(uiSource, /is-connected/);
  assert.match(uiSource, /is-disconnected/);
});
