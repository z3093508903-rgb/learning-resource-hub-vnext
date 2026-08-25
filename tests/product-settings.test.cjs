'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  ensureProductSettings,
  normalizeCaptureFolder,
  updateProductSetting
} = require('../src/product-settings.cjs');

test('video enhancement is opt-in while workbench defaults stay conservative', () => {
  const plugin = { state: { uiState: {} } };
  const settings = currentProductSettings(plugin);
  assert.equal(settings.videoEnhancementEnabled, false);
  assert.equal(settings.autoCollapseSidebar, true);
  assert.equal(settings.videoResumeAfterSave, true);
  assert.equal(settings.videoResumeAfterCancel, true);
  assert.equal(settings.videoSuccessFeedback, true);
  assert.equal(settings.captureFolder, 'GoStudy/Captures');
  assert.equal(settings.backupRetention, 10);
});

test('ensureProductSettings persists normalized defaults into legacy state', () => {
  const plugin = { state: { uiState: {} } };
  const result = ensureProductSettings(plugin);
  assert.equal(result.changed, true);
  assert.equal(plugin.state.uiState.videoEnhancementEnabled, false);
  assert.equal(plugin.state.uiState.captureFolder, DEFAULT_PRODUCT_SETTINGS.captureFolder);
});

test('capture folder rejects traversal and Windows-invalid path components', () => {
  assert.equal(normalizeCaptureFolder('Notes\\Video Captures/'), 'Notes/Video Captures');
  assert.throws(() => normalizeCaptureFolder('../outside'), /安全相对路径/);
  assert.throws(() => normalizeCaptureFolder('GoStudy/Bad:*'), /安全相对路径/);
});

test('backup retention is clamped to the current 3-10 safety range', async () => {
  const plugin = {
    state: { uiState: {} },
    async persist() {}
  };
  let settings = await updateProductSetting(plugin, 'backupRetention', 1);
  assert.equal(settings.backupRetention, 3);
  settings = await updateProductSetting(plugin, 'backupRetention', 999);
  assert.equal(settings.backupRetention, 10);
});
