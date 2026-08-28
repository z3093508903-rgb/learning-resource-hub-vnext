'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');

test('runtime normalizes settings before immersive hotkey registration', () => {
  assert.match(runtimeSource, /ensureProductSettings\(this\)/);
  assert.match(runtimeSource, /registerImmersiveHotkeys\(this\)/);
  assert.ok(runtimeSource.indexOf('ensureProductSettings(this)') < runtimeSource.indexOf('registerImmersiveHotkeys(this)'));
});

test('auto-collapse preference gates sidebar collapse', () => {
  assert.match(runtimeSource, /autoCollapseSidebar/);
  assert.match(runtimeSource, /return super\.collapseSidebar\(\)/);
});

test('custom backup retention only tightens the existing ten-backup cap', () => {
  assert.match(runtimeSource, /backupRetention/);
  assert.match(runtimeSource, /pruneStateBackups/);
  assert.match(runtimeSource, /retention < 10/);
});

test('Companion reverse-event poller is no longer mounted in normal runtime', () => {
  assert.doesNotMatch(runtimeSource, /registerCompanionEventPoller/);
});


test('runtime registers companion note commands after project state normalization', () => {
  assert.match(runtimeSource, /registerCompanionNoteCommands/);
  assert.ok(runtimeSource.indexOf('ensureProjectNotesState(this.state)') < runtimeSource.indexOf('registerCompanionNoteCommands(this)'));
});


test('runtime enters study mode only for the drag-to-study-mode choice before launching video', () => {
  assert.match(runtimeSource, /choice\?\.studyMode/);
  assert.match(runtimeSource, /enterStudyMode\(this, \{ note: choice\.note, resource, projectId \}\)/);
  assert.ok(runtimeSource.indexOf('enterStudyMode(this') < runtimeSource.indexOf('super.openResourceAction(resource, actionType, target, options)'));
  assert.match(runtimeSource, /exitStudyMode\(this, \{ closeCompanion: true \}\)/);
});
