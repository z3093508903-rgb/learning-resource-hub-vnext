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

test('project note box offers an optional project folder plus a per-create location override', () => {
  assert.match(uiSource, /项目笔记文件夹/);
  assert.match(uiSource, /设置项目默认/);
  assert.match(uiSource, /选择本次新建位置/);
  assert.match(uiSource, /位置：跟随 Obsidian/);
  assert.match(uiSource, /不会自动收录整个文件夹/);
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
  assert.match(block, /openProjectNote\(this, study\.note, \{ prepareForStudy: true \}\)/);
  assert.match(block, /resource\.resume\?\.position/);
  assert.match(block, /openPositionedPlayTarget/);
  assert.match(block, /playerTimeFromSeconds/);
});

test('study note preparation can focus the Markdown editor at the last line without changing ordinary note opens', () => {
  assert.match(uiSource, /focusProjectNoteAtEnd/);
  assert.match(uiSource, /editor\.setCursor\(\{ line: lastLine, ch: lineText\.length \}\)/);
  assert.match(uiSource, /prepareForStudy/);
  assert.match(uiSource, /focusStudyNoteAtEnd/);
});

test('project note paths reuse the existing Vault rename/delete/create lifecycle', () => {
  assert.match(runtimeSource, /updateProjectNotePathsOnRename/);
  assert.match(runtimeSource, /markProjectNotesMissing/);
  assert.match(runtimeSource, /restoreProjectNotePath/);
  assert.match(runtimeSource, /updateProjectNoteFoldersOnRename/);
  assert.match(runtimeSource, /clearProjectNoteFoldersOnDelete/);
});


test('study launch picker exposes drag-to-study-mode without changing normal click selection', () => {
  assert.match(uiSource, /go-study-study-mode-drop-target/);
  assert.match(uiSource, /拖入/);
  assert.match(uiSource, /右侧小窗/);
  assert.match(uiSource, /学习模式/);
  assert.match(uiSource, /draggable/);
  assert.match(uiSource, /chooseStudyMode/);
  assert.match(uiSource, /studyMode: true/);
  assert.match(uiSource, /studyMode: false/);
});

test('search results and project notes share the same draggable study-mode entry', () => {
  const occurrences = (uiSource.match(/studyRowButton\(/g) || []).length;
  assert.ok(occurrences >= 4);
});


test('project navigation Markdown rows can be dragged into the same right-rail Study Mode for current loose video', () => {
  const mainSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'main.cjs'), 'utf8');
  assert.match(mainSource, /data-go-study-study-note-path/);
  assert.match(mainSource, /draggable: 'true'/);
  assert.match(uiSource, /workbenchStudyDropTarget/);
  assert.match(uiSource, /is-workbench/);
  assert.match(uiSource, /requestNativePotPlayer\('current', \{ foregroundOnly: false \}\)/);
  assert.match(uiSource, /enterStudyMode\(plugin, \{/);
  assert.match(uiSource, /freeformMedia: current\.media/);
  assert.match(uiSource, /进入零散视频学习模式失败/);
});

test('dragging a navigation note into freeform Study Mode does not reopen or restart PotPlayer', () => {
  const start = uiSource.indexOf('async function enterCurrentPotPlayerStudyMode');
  const end = uiSource.indexOf('function workbenchStudyDropTarget', start);
  const block = uiSource.slice(start, end);
  assert.match(block, /requestNativePotPlayer\('current'/);
  assert.doesNotMatch(block, /openResource|openPositionedPlayTarget|nativePlay|requestNativePotPlayer\('play'/);
});
