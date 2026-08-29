'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  ensureProductSettings,
  LEGACY_DEFAULT_BACKLINK_TEMPLATE,
  normalizeCaptureFolder,
  normalizeOutputTemplate,
  resetOutputTemplates,
  updateProductSetting
} = require('../src/product-settings.cjs');

test('video enhancement is opt-in while workbench and note-output defaults stay conservative', () => {
  const plugin = { state: { uiState: {} } };
  const settings = currentProductSettings(plugin);
  assert.equal(settings.videoEnhancementEnabled, false);
  assert.equal(settings.timelineNavigatorEnabled, false);
  assert.equal(settings.autoCollapseSidebar, true);
  assert.equal(settings.videoResumeAfterSave, true);
  assert.equal(settings.videoResumeAfterCancel, true);
  assert.equal(settings.videoSuccessFeedback, true);
  assert.equal(settings.focusStudyNoteAtEnd, true);
  assert.equal(settings.freeformVideoNotesEnabled, true);
  assert.equal(settings.legacyJvCompatibilityEnabled, false);
  assert.equal(settings.shortcutMode, 'mixed');
  assert.equal(settings.actionHudShortcut, 'Alt+S');
  assert.equal(settings.actionHudDelayMs, 300);
  assert.deepEqual(settings.actionHudSlots, {
    left: 'time',
    up: 'timeNote',
    right: 'timeImage',
    down: 'note',
    center: 'all'
  });
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
  assert.equal(plugin.state.uiState.timelineNavigatorEnabled, false);
  assert.equal(plugin.state.uiState.legacyJvCompatibilityEnabled, false);
  assert.equal(plugin.state.uiState.captureFolder, DEFAULT_PRODUCT_SETTINGS.captureFolder);
  assert.equal(plugin.state.uiState.backlinkTemplate, DEFAULT_PRODUCT_SETTINGS.backlinkTemplate);
  assert.equal(plugin.state.uiState.actionHudShortcut, 'Alt+S');
  assert.deepEqual(plugin.state.uiState.actionHudSlots, DEFAULT_PRODUCT_SETTINGS.actionHudSlots);
  const stable = ensureProductSettings(plugin);
  assert.equal(stable.changed, false);
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
  assert.equal(normalizeOutputTemplate('plainNoteTemplate', '> {note}'), '> {note}');
  assert.throws(() => normalizeOutputTemplate('plainNoteTemplate', '{note}\n{backlink}'), /未知变量.*\{backlink\}/);
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


test('HUD mode, delay and direction recipes normalize safely', async () => {
  const plugin = { state: { uiState: {} }, async persist() {} };
  let settings = await updateProductSetting(plugin, 'shortcutMode', 'hud');
  assert.equal(settings.shortcutMode, 'hud');
  settings = await updateProductSetting(plugin, 'actionHudDelayMs', 5000);
  assert.equal(settings.actionHudDelayMs, 1000);
  settings = await updateProductSetting(plugin, 'actionHudSlots', {
    left: 'note',
    up: 'imageNote',
    right: 'all',
    down: 'time',
    center: 'bogus'
  });
  assert.deepEqual(settings.actionHudSlots, {
    left: 'note',
    up: 'imageNote',
    right: 'all',
    down: 'time',
    center: 'all'
  });
});


test('legacy default backlink presentation migrates to timestamp-only without overwriting custom templates', () => {
  const legacyPlugin = { state: { uiState: { backlinkTemplate: LEGACY_DEFAULT_BACKLINK_TEMPLATE } } };
  const migrated = ensureProductSettings(legacyPlugin);
  assert.equal(migrated.changed, true);
  assert.equal(legacyPlugin.state.uiState.backlinkTemplate, '[{time}]({uri})');

  const customPlugin = { state: { uiState: { backlinkTemplate: '🎬 [{time}]({uri}) · {title}' } } };
  const custom = currentProductSettings(customPlugin);
  assert.equal(custom.backlinkTemplate, '🎬 [{time}]({uri}) · {title}');
});
