'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  captureActiveNoteTarget,
  rememberNoteTarget,
  resolveRememberedNoteTarget
} = require('../src/note-target.cjs');

function editor(name) {
  return { name, replaceSelection() {} };
}

function workspaceFixture() {
  const events = new Map();
  const leaves = [];
  const workspace = {
    activeEditor: null,
    getActiveFile() { return this.activeEditor?.file || null; },
    getLeavesOfType(type) { return type === 'markdown' ? leaves : []; },
    on(name, handler) { events.set(name, handler); return { name, handler }; }
  };
  return { workspace, leaves, events };
}

test('remembers an active markdown editor and resolves it after focus leaves the note', () => {
  const { workspace, leaves } = workspaceFixture();
  const noteEditor = editor('note');
  const file = { path: 'Notes/Course.md' };
  const plugin = { app: { workspace } };

  workspace.activeEditor = { editor: noteEditor, file };
  leaves.push({ view: { editor: noteEditor, file } });
  assert.equal(captureActiveNoteTarget(plugin), true);

  workspace.activeEditor = null;
  assert.deepEqual(resolveRememberedNoteTarget(plugin), {
    editor: noteEditor,
    filePath: 'Notes/Course.md',
    source: 'remembered'
  });
});

test('prefers the currently active markdown editor and refreshes memory', () => {
  const { workspace, leaves } = workspaceFixture();
  const oldEditor = editor('old');
  const newEditor = editor('new');
  const plugin = { app: { workspace } };

  rememberNoteTarget(plugin, oldEditor, { path: 'Notes/Old.md' });
  workspace.activeEditor = { editor: newEditor, file: { path: 'Notes/New.md' } };
  leaves.push({ view: { editor: newEditor, file: { path: 'Notes/New.md' } } });

  const target = resolveRememberedNoteTarget(plugin);
  assert.equal(target.editor, newEditor);
  assert.equal(target.filePath, 'Notes/New.md');
  assert.equal(target.source, 'active');
  assert.equal(plugin._goStudyNoteTarget.filePath, 'Notes/New.md');
});

test('fails closed instead of redirecting when the remembered note was closed', () => {
  const { workspace } = workspaceFixture();
  const plugin = { app: { workspace } };
  rememberNoteTarget(plugin, editor('closed'), { path: 'Notes/Closed.md' });

  assert.throws(
    () => resolveRememberedNoteTarget(plugin),
    /已经关闭或不可编辑/
  );
  assert.equal(plugin._goStudyNoteTarget, null);
});

test('does not remember non-editable or pathless targets', () => {
  const { workspace } = workspaceFixture();
  const plugin = { app: { workspace } };
  assert.equal(rememberNoteTarget(plugin, {}, { path: 'Notes/A.md' }), false);
  assert.equal(rememberNoteTarget(plugin, editor('x'), {}), false);
  assert.equal(plugin._goStudyNoteTarget, undefined);
});


test('locked companion note target wins over the active main-window editor', () => {
  const { workspace } = workspaceFixture();
  const companionEditor = editor('companion');
  const mainEditor = editor('main');
  const companionFile = { path: 'Notes/Locked.md' };
  const companionLeaf = { view: { editor: companionEditor, file: companionFile } };
  const plugin = {
    app: { workspace },
    _goStudyCompanionTarget: {
      editor: companionEditor,
      filePath: companionFile.path,
      leaf: companionLeaf,
      locked: true
    }
  };
  workspace.activeEditor = { editor: mainEditor, file: { path: 'Notes/Main.md' } };

  assert.deepEqual(resolveRememberedNoteTarget(plugin), {
    editor: companionEditor,
    filePath: 'Notes/Locked.md',
    source: 'companion'
  });
});

test('unlocked or stale companion target falls back to the normal active editor', () => {
  const { workspace } = workspaceFixture();
  const companionEditor = editor('companion');
  const mainEditor = editor('main');
  const plugin = {
    app: { workspace },
    _goStudyCompanionTarget: {
      editor: companionEditor,
      filePath: 'Notes/Locked.md',
      leaf: { view: { editor: companionEditor, file: { path: 'Notes/Other.md' } } },
      locked: true
    }
  };
  workspace.activeEditor = { editor: mainEditor, file: { path: 'Notes/Main.md' } };

  const target = resolveRememberedNoteTarget(plugin);
  assert.equal(target.source, 'active');
  assert.equal(target.filePath, 'Notes/Main.md');
  assert.equal(plugin._goStudyCompanionTarget, null);
});
