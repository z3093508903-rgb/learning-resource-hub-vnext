'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'learning-controls-ui.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');

test('immersive UI stays lightweight and does not restore the wide control strip', () => {
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

test('settings center exposes workbench, optional video enhancement and data controls', () => {
  for (const label of [
    '进入工作台时自动收起 Obsidian 侧栏',
    '启用视频笔记增强',
    '保存笔记后继续播放',
    '取消笔记后继续播放',
    '显示轻量成功提示',
    '截图保存目录',
    '截图记录测试',
    '恢复默认快捷键',
    '自动备份保留数量'
  ]) assert.match(uiSource, new RegExp(label));
  assert.match(uiSource, /updateProductSetting/);
  assert.match(uiSource, /updateImmersiveShortcut/);
  assert.match(uiSource, /captureFrameAndInsertLearningPosition/);
});

test('disabled video enhancement removes the workbench status dot', () => {
  assert.match(uiSource, /videoEnhancementEnabled/);
  assert.match(uiSource, /existing\?\.remove/);
  assert.match(uiSource, /视频笔记增强已关闭/);
});

test('runtime mounts native hotkeys but no longer starts Companion event polling', () => {
  assert.match(runtimeSource, /registerImmersiveHotkeys\(this\)/);
  assert.match(runtimeSource, /installLearningControls\(this\)/);
  assert.doesNotMatch(runtimeSource, /registerCompanionEventPoller/);
});
