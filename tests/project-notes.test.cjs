'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearProjectNoteFoldersOnDelete,
  ensureProjectNotesState,
  linkProjectNote,
  markProjectNotesMissing,
  playerTimeFromSeconds,
  projectIdForResource,
  projectNoteFolder,
  projectNotes,
  recentProjectNote,
  recentStudy,
  recordRecentStudy,
  restoreProjectNotePath,
  setProjectNoteFolder,
  setRecentProjectNote,
  unlinkProjectNote,
  updateProjectNoteFoldersOnRename,
  updateProjectNotePathsOnRename
} = require('../src/project-notes.cjs');

function fixture() {
  return {
    projects: {
      'project-a': { id: 'project-a', title: '高等数学' },
      'project-b': { id: 'project-b', title: '英语' }
    },
    modules: {
      'module-a': { id: 'module-a', projectId: 'project-a', resourceIds: ['resource-a'] }
    },
    resources: {
      'resource-a': { id: 'resource-a', kind: 'video', title: '极限', resume: { position: { type: 'time', seconds: 1122 } } }
    },
    uiState: { currentProjectId: 'project-a' }
  };
}

test('legacy state gains an empty project note box without changing projects or resources', () => {
  const state = fixture();
  ensureProjectNotesState(state);
  assert.deepEqual(state.projectNotes, {});
  assert.deepEqual(state.uiState.recentProjectNoteIds, {});
  assert.deepEqual(state.uiState.recentStudyByProject, {});
  assert.equal(state.projects['project-a'].title, '高等数学');
});

test('project notes are lightweight Markdown references and reuse the same project/path', () => {
  const state = fixture();
  const first = linkProjectNote(state, 'project-a', '课程/高等数学.md', new Date('2026-08-26T10:00:00Z'));
  const second = linkProjectNote(state, 'project-a', '课程\\高等数学.md', new Date('2026-08-26T10:01:00Z'));
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.note.id, second.note.id);
  assert.equal(projectNotes(state, 'project-a').length, 1);
  assert.throws(() => linkProjectNote(state, 'project-a', '课程/教材.pdf'), /Markdown/);
});

test('recent note and recent study remember what the user actually used, not a permanent resource binding', () => {
  const state = fixture();
  const noteA = linkProjectNote(state, 'project-a', '高等数学.md').note;
  const noteB = linkProjectNote(state, 'project-a', '错题.md').note;
  setRecentProjectNote(state, 'project-a', noteA.id);
  assert.equal(recentProjectNote(state, 'project-a').id, noteA.id);
  recordRecentStudy(state, 'project-a', 'resource-a', noteB.id, new Date('2026-08-26T12:00:00Z'));
  const study = recentStudy(state, 'project-a');
  assert.equal(study.resource.id, 'resource-a');
  assert.equal(study.note.id, noteB.id);
  assert.equal(recentProjectNote(state, 'project-a').id, noteB.id);
});

test('removing a note association never removes the resource and degrades recent study to resource-only', () => {
  const state = fixture();
  const note = linkProjectNote(state, 'project-a', '高数.md').note;
  recordRecentStudy(state, 'project-a', 'resource-a', note.id);
  const result = unlinkProjectNote(state, 'project-a', note.id);
  assert.equal(result.removed, true);
  assert.equal(state.resources['resource-a'].title, '极限');
  assert.equal(recentStudy(state, 'project-a').note, null);
  assert.equal(recentStudy(state, 'project-a').noteId, '');
});

test('note references follow Vault rename and missing/restore lifecycle', () => {
  const state = fixture();
  const note = linkProjectNote(state, 'project-a', '课程/高数.md').note;
  assert.equal(updateProjectNotePathsOnRename(state, '课程', '学习/数学'), 1);
  assert.equal(note.path, '学习/数学/高数.md');
  assert.equal(markProjectNotesMissing(state, '学习/数学/高数.md'), 1);
  assert.ok(note.missingAt);
  assert.equal(restoreProjectNotePath(state, '学习/数学/高数.md'), 1);
  assert.equal(note.missingAt, '');
});

test('project note folder is optional, follows folder rename, and clears safely on deletion', () => {
  const state = fixture();
  assert.equal(projectNoteFolder(state, 'project-a'), '');
  setProjectNoteFolder(state, 'project-a', '20.项目/高等数学');
  assert.equal(projectNoteFolder(state, 'project-a'), '20.项目/高等数学');
  assert.equal(updateProjectNoteFoldersOnRename(state, '20.项目', '30.学习'), 1);
  assert.equal(projectNoteFolder(state, 'project-a'), '30.学习/高等数学');
  assert.equal(clearProjectNoteFoldersOnDelete(state, '30.学习'), 1);
  assert.equal(projectNoteFolder(state, 'project-a'), '');
});

test('resource membership resolves to the current project and player time is stable', () => {
  const state = fixture();
  assert.equal(projectIdForResource(state, 'resource-a'), 'project-a');
  assert.equal(playerTimeFromSeconds(1122), '00:18:42');
  assert.equal(playerTimeFromSeconds(3661.9), '01:01:01');
});
