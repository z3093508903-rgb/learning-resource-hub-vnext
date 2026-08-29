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

test('custom backup retention applies to the external recovery history', () => {
  assert.match(runtimeSource, /backupRetention/);
  assert.match(runtimeSource, /pruneRecoveryBackups/);
  assert.match(runtimeSource, /currentProductSettings\(this\)\.backupRetention/);
});

test('Companion reverse-event poller is no longer mounted in normal runtime', () => {
  assert.doesNotMatch(runtimeSource, /registerCompanionEventPoller/);
});


test('runtime registers companion note commands after project state normalization', () => {
  assert.match(runtimeSource, /registerCompanionNoteCommands/);
  assert.ok(runtimeSource.indexOf('ensureProjectNotesState(this.state)') < runtimeSource.indexOf('registerCompanionNoteCommands(this)'));
});


test('runtime enters study mode only for the drag-to-study-mode choice before launching video', () => {
  const start = runtimeSource.indexOf('const choice = await chooseStudyNote');
  const end = runtimeSource.indexOf('recordRecentStudy(this.state, projectId, resource.id', start);
  const block = runtimeSource.slice(start, end);
  assert.match(block, /choice\?\.studyMode/);
  assert.match(block, /enterStudyMode\(this, \{ note: choice\.note, resource, projectId \}\)/);
  assert.ok(block.indexOf('enterStudyMode(this') < block.indexOf('super.openResourceAction(resource, actionType, target, options)'));
  assert.match(block, /exitStudyMode\(this, \{ closeCompanion: true \}\)/);
});


test('runtime mounts optional floating timeline after settings normalization', () => {
  assert.match(runtimeSource, /installTimelineNavigator/);
  assert.ok(runtimeSource.indexOf('ensureProductSettings(this)') < runtimeSource.indexOf('installTimelineNavigator(this)'));
});
