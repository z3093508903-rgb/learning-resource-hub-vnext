'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'project-notes-ui.cjs'), 'utf8');
const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');

test('project note box exposes only lightweight Markdown association actions', () => {
  for (const label of ['项目笔记', '关联已有笔记', '新建项目笔记', '从项目移除']) {
    assert.match(uiSource, new RegExp(label));
  }
  assert.match(uiSource, /不会移动或复制原文件/);
  assert.doesNotMatch(uiSource, /delete\(file|trash|removeFile/i);
});

test('study launch picker describes a temporary learning note instead of permanent resource binding', () => {
  assert.match(uiSource, /选择这次学习要带上的笔记/);
  assert.match(uiSource, /不会建立永久的资源绑定/);
  assert.match(uiSource, /最近使用/);
  assert.match(uiSource, /项目笔记盒/);
  assert.match(uiSource, /搜索 Vault/);
  assert.match(uiSource, /这次不使用笔记/);
});

test('project page receives compact Notes and Continue Learning entry points rather than a new board strip', () => {
  assert.match(uiSource, /data-go-study-project-notes/);
  assert.match(uiSource, /data-go-study-continue-study/);
  assert.match(uiSource, /\.rh-next-project-heading \.rh-next-section-actions/);
  assert.doesNotMatch(uiSource, /rh-next-project-board-item/);
});

test('runtime prompts only for stored project videos and records the recent resource-note combination after launch', () => {
  assert.match(runtimeSource, /actionType === 'play'/);
  assert.match(runtimeSource, /resource\?\.kind === 'video'/);
  assert.match(runtimeSource, /chooseStudyNote\(this, projectId, resource\)/);
  assert.match(runtimeSource, /recordRecentStudy\(this\.state, projectId, resource\.id/);
});

test('continue learning restores the recent note before reopening the resource at Resume position', () => {
  const start = runtimeSource.indexOf('async continueRecentProjectStudy');
  const end = runtimeSource.indexOf('async handleVaultRename', start);
  const block = runtimeSource.slice(start, end);
  assert.match(block, /openProjectNote\(this, study\.note\)/);
  assert.match(block, /resource\.resume\?\.position/);
  assert.match(block, /openPositionedPlayTarget/);
  assert.match(block, /playerTimeFromSeconds/);
});

test('project note paths reuse the existing Vault rename/delete/create lifecycle', () => {
  assert.match(runtimeSource, /updateProjectNotePathsOnRename/);
  assert.match(runtimeSource, /markProjectNotesMissing/);
  assert.match(runtimeSource, /restoreProjectNotePath/);
});
