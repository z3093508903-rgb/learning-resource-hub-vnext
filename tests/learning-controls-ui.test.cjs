'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'learning-controls-ui.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');
const settingsSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'product-settings-tab.cjs'), 'utf8');

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

test('settings use a real PluginSettingTab and no longer scrape Obsidian settings DOM', () => {
  assert.match(settingsSource, /class GoStudySettingsTab extends PluginSettingTab/);
  assert.match(runtimeSource, /addSettingTab\(tab\)/);
  assert.match(runtimeSource, /new GoStudySettingsTab\(this\.app, this\)/);
  assert.doesNotMatch(uiSource, /findSettingsContainer|renderSettingsCenter|querySelectorAll\?\.\('h2'\)/);
});

test('native settings tab exposes workbench, optional video enhancement, output formatting and data controls', () => {
  for (const label of [
    '显示界面说明',
    '进入工作台时自动收起左侧栏',
    '启用视频笔记增强',
    '当前状态',
    '保存笔记后继续播放',
    '取消笔记后继续播放',
    '显示成功提示',
    '截图保存目录',
    '截图记录测试',
    '恢复默认快捷键',
    '未收录视频也启用增强',
    '快捷键操作方式',
    '动作盘主快捷键',
    '动作盘显示延迟',
    '无时间 · 纯笔记模板',
    '无时间 · 截图评论模板',
    '笔记输出格式',
    '时间显示格式',
    '回链模板',
    'Alt+3 快速笔记模板',
    'Alt+2 截图模板',
    'Alt+4 截图笔记模板',
    '恢复默认输出格式',
    '实时示例',
    '自动备份保留数量',
    '当前插件版本'
  ]) assert.match(settingsSource, new RegExp(label.replace(/[+]/g, '\\+')));
  assert.match(settingsSource, /updateProductSetting/);
  assert.match(settingsSource, /resetOutputTemplates/);
  assert.match(settingsSource, /updateImmersiveShortcut/);
  assert.match(settingsSource, /captureFrameAndInsertLearningPosition/);
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
