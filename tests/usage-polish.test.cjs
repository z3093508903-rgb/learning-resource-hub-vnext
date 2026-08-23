'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../src/model.cjs');
const {
  clampMemoHeight,
  deleteMemoHeight,
  findMemoProjectId,
  findOpenVaultLeaf,
  getMemoHeight,
  leafVaultPath,
  setMemoHeight
} = require('../src/usage-polish.cjs');

test('findOpenVaultLeaf reuses a leaf from view state', () => {
  const leaf = { getViewState: () => ({ state: { file: 'Notes/Test.md' } }), view: {} };
  const workspace = { iterateAllLeaves(callback) { callback({ getViewState: () => ({ state: { file: 'Other.md' } }) }); callback(leaf); } };
  assert.equal(findOpenVaultLeaf(workspace, 'Notes/Test.md'), leaf);
});

test('leafVaultPath falls back to loaded view file path', () => {
  const leaf = { getViewState: () => ({ state: {} }), view: { file: { path: 'Canvas/Plan.canvas' } } };
  assert.equal(leafVaultPath(leaf), 'Canvas/Plan.canvas');
});

test('memo heights persist per project and memo then clean up', () => {
  const state = { uiState: {} };
  assert.equal(setMemoHeight(state, 'p1', 'm1', 260.4), 260);
  assert.equal(setMemoHeight(state, 'p1', 'm2', 410), 410);
  assert.equal(getMemoHeight(state, 'p1', 'm1'), 260);
  assert.equal(getMemoHeight(state, 'p1', 'm2'), 410);
  assert.equal(deleteMemoHeight(state, 'p1', 'm1'), true);
  assert.equal(getMemoHeight(state, 'p1', 'm1'), 0);
  assert.equal(getMemoHeight(state, 'p1', 'm2'), 410);
  assert.equal(deleteMemoHeight(state, 'p1', 'm2'), true);
  assert.equal(state.uiState.projectMemoHeights.p1, undefined);
});

test('memo height clamps to safe UI bounds', () => {
  assert.equal(clampMemoHeight(40), 92);
  assert.equal(clampMemoHeight(240.6), 241);
  assert.equal(clampMemoHeight(9999), 1200);
});

test('memo lookup derives the owning project from memo identity', () => {
  const state = {
    projects: {
      p1: { id: 'p1', memos: [{ id: 'm1' }] },
      p2: { id: 'p2', memos: [{ id: 'm2' }] }
    }
  };
  assert.equal(findMemoProjectId(state, 'm2'), 'p2');
  assert.equal(findMemoProjectId(state, 'missing'), '');
});

test('normalizeState preserves persisted memo height UI state', () => {
  const state = model.normalizeState({
    uiState: { projectMemoHeights: { p1: { m1: 333 } } }
  });
  assert.equal(state.uiState.projectMemoHeights.p1.m1, 333);
});

test('project board renders memo direct delete without a global DOM patch', () => {
  const entry = fs.readFileSync(path.join(__dirname, '..', 'src', 'entry.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8');
  assert.doesNotMatch(entry, /MutationObserver/);
  assert.doesNotMatch(main, /布局操作/);
  assert.match(main, /iconButton\(head, 'trash-2', '删除便签'/);
});

test('main binds memo resize directly and flushes captured heights on unload', () => {
  const entry = fs.readFileSync(path.join(__dirname, '..', 'src', 'entry.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8');
  assert.doesNotMatch(entry, /ResizeObserver/);
  assert.match(main, /new ResizeObserver\(capture\)/);
  assert.match(main, /setMemoHeight\(this\.state, binding\.projectId, binding\.memoId, height\)/);
  assert.match(main, /await this\.flushMemoHeights\(\)/);
  assert.match(main, /bindMemoHeight\(textarea, project\.id, memo\.id\)/);
});
