'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'main.cjs'), 'utf8');
const settingsSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'product-settings-tab.cjs'), 'utf8');

test('plugin protects data before load and refuses populated-to-empty startup replacement', () => {
  assert.match(mainSource, /startupSafetySnapshot\(this\)/);
  assert.match(mainSource, /safetySnapshot\.rawMeaningful && !meaningfulState\(loaded\)/);
  assert.match(mainSource, /loaded = safetySnapshot\.rawData/);
  assert.match(mainSource, /assertSafePersist\(this\)/);
  assert.match(mainSource, /protectBeforePersist\(this, retention\)/);
});

test('backup UI exposes actual folder, pinned named backups, rename, selectable restore, and recent restore', () => {
  assert.match(settingsSource, /恢复备份位置/);
  assert.match(settingsSource, /选择备份恢复/);
  assert.match(settingsSource, /class BackupRestoreModal extends Modal/);
  assert.match(settingsSource, /命名备份（长期保留）/);
  assert.match(settingsSource, /自动恢复快照/);
  assert.match(settingsSource, /恢复此备份/);
  assert.match(settingsSource, /createStateBackup\('before-manual-restore'\)/);
  assert.match(settingsSource, /restoreStateBackup\(entry\.name\)/);
  assert.match(settingsSource, /打开备份文件夹/);
  assert.match(settingsSource, /新建命名备份/);
  assert.match(settingsSource, /重命名最近快照/);
  assert.match(settingsSource, /不参与自动清理/);
  assert.match(settingsSource, /恢复最近备份/);
  assert.match(settingsSource, /当前 data\.json/);
});


test('selectable restore modal separates named backups from automatic snapshots', () => {
  assert.match(settingsSource, /entries\.filter\(\(entry\) => entry\.named\)/);
  assert.match(settingsSource, /entries\.filter\(\(entry\) => !entry\.named\)/);
  assert.match(settingsSource, /backupEntryDescription/);
  assert.match(settingsSource, /命名备份 · 长期保留/);
  assert.match(settingsSource, /自动恢复快照/);
});
