'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  ensureProductSettings,
  normalizeCaptureFolder,
  normalizeOutputTemplate,
  resetOutputTemplates,
  updateProductSetting
} = require('../src/product-settings.cjs');

test('video enhancement is opt-in while workbench and note-output defaults stay conservative', () => {
  const plugin = { state: { uiState: {} } };
  const settings = currentProductSettings(plugin);
  assert.equal(settings.videoEnhancementEnabled, false);
  assert.equal(settings.autoCollapseSidebar, true);
  assert.equal(settings.videoResumeAfterSave, true);
  assert.equal(settings.videoResumeAfterCancel, true);
  assert.equal(settings.videoSuccessFeedback, true);
  assert.equal(settings.focusStudyNoteAtEnd, true);
  assert.equal(settings.captureFolder, 'GoStudy/Captures');
  assert.equal(settings.backupRetention, 10);
  assert.equal(settings.timeDisplayFormat, 'smart');
  assert.equal(settings.backlinkTemplate, DEFAULT_PRODUCT_SETTINGS.backlinkTemplate);
  assert.equal(settings.noteTemplate, DEFAULT_PRODUCT_SETTINGS.noteTemplate);
});

test('ensureProductSettings persists normalized defaults into legacy state', () => {
  const plugin = { state: { uiState: {} } };
  const result = ensureProductSettings(plugin);
  assert.equal(result.changed, true);
  assert.equal(plugin.state.uiState.videoEnhancementEnabled, false);
  assert.equal(plugin.state.uiState.captureFolder, DEFAULT_PRODUCT_SETTINGS.captureFolder);
  assert.equal(plugin.state.uiState.backlinkTemplate, DEFAULT_PRODUCT_SETTINGS.backlinkTemplate);
});

test('capture folder can be cleared to hand attachment placement back to Obsidian', async () => {
  assert.equal(normalizeCaptureFolder(''), '');
  const plugin = { state: { uiState: {} }, async persist() {} };
  const settings = await updateProductSetting(plugin, 'captureFolder', '');
  assert.equal(settings.captureFolder, '');
  assert.equal(plugin.state.uiState.captureFolder, '');
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

test('output templates reject unknown variables and preserve required semantic slots', () => {
  assert.equal(
    normalizeOutputTemplate('backlinkTemplate', '[{time}]({uri})'),
    '[{time}]({uri})'
  );
  assert.throws(() => normalizeOutputTemplate('backlinkTemplate', '[{time}](https://example.com)'), /必须保留.*\{uri\}/);
  assert.throws(() => normalizeOutputTemplate('noteTemplate', '{note}\n{mystery}\n{backlink}'), /未知变量.*\{mystery\}/);
  assert.throws(() => normalizeOutputTemplate('captureNoteTemplate', '{note}\n{backlink}'), /必须保留.*\{image\}/);
});

test('custom output settings persist and can be reset as one formatting group', async () => {
  const plugin = { state: { uiState: {} }, persistCalls: 0, async persist() { this.persistCalls += 1; } };
  await updateProductSetting(plugin, 'timeDisplayFormat', 'hms');
  await updateProductSetting(plugin, 'backlinkTemplate', '🎬 [{time}]({uri}) · {title}');
  await updateProductSetting(plugin, 'noteTemplate', '> {note}\n> {backlink}');
  let settings = currentProductSettings(plugin);
  assert.equal(settings.timeDisplayFormat, 'hms');
  assert.equal(settings.backlinkTemplate, '🎬 [{time}]({uri}) · {title}');
  assert.equal(settings.noteTemplate, '> {note}\n> {backlink}');

  settings = await resetOutputTemplates(plugin);
  assert.equal(settings.timeDisplayFormat, DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat);
  assert.equal(settings.backlinkTemplate, DEFAULT_PRODUCT_SETTINGS.backlinkTemplate);
  assert.equal(settings.noteTemplate, DEFAULT_PRODUCT_SETTINGS.noteTemplate);
  assert.ok(plugin.persistCalls >= 3);
});
