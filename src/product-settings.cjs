'use strict';

const { DEFAULT_HUD_SLOTS, normalizeHudSlots } = require('./capture-actions.cjs');

const DEFAULT_PRODUCT_SETTINGS = Object.freeze({
  autoCollapseSidebar: true,
  videoEnhancementEnabled: false,
  timelineNavigatorEnabled: false,
  videoResumeAfterSave: true,
  videoResumeAfterCancel: true,
  videoSuccessFeedback: true,
  focusStudyNoteAtEnd: true,
  freeformVideoNotesEnabled: true,
  shortcutMode: 'mixed',
  actionHudShortcut: 'Alt+S',
  actionHudDelayMs: 300,
  actionHudSlots: { ...DEFAULT_HUD_SLOTS },
  captureFolder: 'GoStudy/Captures',
  backupRetention: 10,
  timeDisplayFormat: 'smart',
  backlinkTemplate: '[{time}]({uri})',
  noteTemplate: '{note}\n\n{backlink}',
  captureTemplate: '{image}\n\n{backlink}',
  captureNoteTemplate: '{image}\n\n{note}\n\n{backlink}',
  plainNoteTemplate: '{note}',
  plainCaptureTemplate: '{image}',
  plainCaptureNoteTemplate: '{image}\n\n{note}'
});

const TEMPLATE_RULES = Object.freeze({
  backlinkTemplate: Object.freeze({
    allowed: Object.freeze(['title', 'time', 'uri']),
    required: Object.freeze(['uri'])
  }),
  noteTemplate: Object.freeze({
    allowed: Object.freeze(['note', 'backlink']),
    required: Object.freeze(['note', 'backlink'])
  }),
  captureTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'backlink']),
    required: Object.freeze(['image', 'backlink'])
  }),
  captureNoteTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'note', 'backlink']),
    required: Object.freeze(['image', 'note', 'backlink'])
  }),
  plainNoteTemplate: Object.freeze({
    allowed: Object.freeze(['note']),
    required: Object.freeze(['note'])
  }),
  plainCaptureTemplate: Object.freeze({
    allowed: Object.freeze(['image']),
    required: Object.freeze(['image'])
  }),
  plainCaptureNoteTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'note']),
    required: Object.freeze(['image', 'note'])
  })
});

function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCaptureFolder(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[<>:"|?*\x00-\x1F]/.test(part))) {
    throw new Error('截图目录必须是 Vault 内的安全相对路径。');
  }
  return parts.join('/');
}

function normalizeTimeDisplayFormat(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'smart' || normalized === 'hms') return normalized;
  return DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat;
}
function normalizeShortcutMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['mixed', 'hud', 'legacy'].includes(normalized) ? normalized : DEFAULT_PRODUCT_SETTINGS.shortcutMode;
}

function normalizeActionHudShortcut(value) {
  const shortcut = String(value || '').trim();
  if (!shortcut) return DEFAULT_PRODUCT_SETTINGS.actionHudShortcut;
  if (shortcut.length > 40 || /[\r\n\t]/.test(shortcut)) throw new Error('动作盘快捷键格式无效。');
  return shortcut;
}

function normalizeActionHudDelayMs(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRODUCT_SETTINGS.actionHudDelayMs;
  return Math.min(1000, Math.max(0, parsed));
}


function outputTemplateTokens(value) {
  return [...String(value || '').matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g)].map((match) => match[1]);
}

function normalizeOutputTemplate(key, value) {
  const rule = TEMPLATE_RULES[key];
  if (!rule) throw new Error('未知笔记模板。');
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) throw new Error('模板不能为空。');
  if (normalized.length > 4000) throw new Error('模板过长，请控制在 4000 个字符以内。');
  const tokens = outputTemplateTokens(normalized);
  const unknown = [...new Set(tokens.filter((token) => !rule.allowed.includes(token)))];
  if (unknown.length) throw new Error(`模板包含未知变量：${unknown.map((token) => `{${token}}`).join('、')}。`);
  const missing = rule.required.filter((token) => !tokens.includes(token));
  if (missing.length) throw new Error(`模板必须保留：${missing.map((token) => `{${token}}`).join('、')}。`);
  return normalized;
}

function safeOutputTemplate(key, value) {
  try { return normalizeOutputTemplate(key, value); }
  catch { return DEFAULT_PRODUCT_SETTINGS[key]; }
}

const LEGACY_DEFAULT_BACKLINK_TEMPLATE = '[↗ {title} · {time}]({uri})';

function normalizedBacklinkTemplate(value) {
  const raw = String(value ?? '');
  if (raw === LEGACY_DEFAULT_BACKLINK_TEMPLATE) return DEFAULT_PRODUCT_SETTINGS.backlinkTemplate;
  return safeOutputTemplate('backlinkTemplate', raw || DEFAULT_PRODUCT_SETTINGS.backlinkTemplate);
}

function currentProductSettings(plugin) {
  const ui = plugin?.state?.uiState || {};
  let captureFolder = DEFAULT_PRODUCT_SETTINGS.captureFolder;
  try {
    captureFolder = Object.prototype.hasOwnProperty.call(ui, 'captureFolder')
      ? normalizeCaptureFolder(ui.captureFolder)
      : DEFAULT_PRODUCT_SETTINGS.captureFolder;
  } catch {}
  return {
    autoCollapseSidebar: boolOr(ui.autoCollapseSidebar, DEFAULT_PRODUCT_SETTINGS.autoCollapseSidebar),
    videoEnhancementEnabled: boolOr(ui.videoEnhancementEnabled, DEFAULT_PRODUCT_SETTINGS.videoEnhancementEnabled),
    timelineNavigatorEnabled: boolOr(ui.timelineNavigatorEnabled, DEFAULT_PRODUCT_SETTINGS.timelineNavigatorEnabled),
    videoResumeAfterSave: boolOr(ui.videoResumeAfterSave, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterSave),
    videoResumeAfterCancel: boolOr(ui.videoResumeAfterCancel, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterCancel),
    videoSuccessFeedback: boolOr(ui.videoSuccessFeedback, DEFAULT_PRODUCT_SETTINGS.videoSuccessFeedback),
    focusStudyNoteAtEnd: boolOr(ui.focusStudyNoteAtEnd, DEFAULT_PRODUCT_SETTINGS.focusStudyNoteAtEnd),
    freeformVideoNotesEnabled: boolOr(ui.freeformVideoNotesEnabled, DEFAULT_PRODUCT_SETTINGS.freeformVideoNotesEnabled),
    shortcutMode: normalizeShortcutMode(ui.shortcutMode),
    actionHudShortcut: (() => {
      try { return normalizeActionHudShortcut(ui.actionHudShortcut); }
      catch { return DEFAULT_PRODUCT_SETTINGS.actionHudShortcut; }
    })(),
    actionHudDelayMs: normalizeActionHudDelayMs(ui.actionHudDelayMs),
    actionHudSlots: normalizeHudSlots(ui.actionHudSlots),
    captureFolder,
    backupRetention: clampInteger(ui.backupRetention, 3, 10, DEFAULT_PRODUCT_SETTINGS.backupRetention),
    timeDisplayFormat: normalizeTimeDisplayFormat(ui.timeDisplayFormat),
    backlinkTemplate: normalizedBacklinkTemplate(ui.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate),
    noteTemplate: safeOutputTemplate('noteTemplate', ui.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate),
    captureTemplate: safeOutputTemplate('captureTemplate', ui.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate),
    captureNoteTemplate: safeOutputTemplate('captureNoteTemplate', ui.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate),
    plainNoteTemplate: safeOutputTemplate('plainNoteTemplate', ui.plainNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainNoteTemplate),
    plainCaptureTemplate: safeOutputTemplate('plainCaptureTemplate', ui.plainCaptureTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureTemplate),
    plainCaptureNoteTemplate: safeOutputTemplate('plainCaptureNoteTemplate', ui.plainCaptureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureNoteTemplate)
  };
}

function ensureProductSettings(plugin) {
  if (!plugin?.state) return { changed: false, settings: { ...DEFAULT_PRODUCT_SETTINGS } };
  plugin.state.uiState ||= {};
  const normalized = currentProductSettings(plugin);
  let changed = false;
  for (const [key, value] of Object.entries(normalized)) {
    const current = plugin.state.uiState[key];
    const same = value && typeof value === 'object'
      ? JSON.stringify(current) === JSON.stringify(value)
      : current === value;
    if (!same) {
      plugin.state.uiState[key] = value;
      changed = true;
    }
  }
  return { changed, settings: normalized };
}

async function updateProductSetting(plugin, key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_PRODUCT_SETTINGS, key)) throw new Error('未知设置项。');
  plugin.state.uiState ||= {};
  let next = value;
  if (key === 'captureFolder') next = normalizeCaptureFolder(value);
  else if (key === 'backupRetention') next = clampInteger(value, 3, 10, DEFAULT_PRODUCT_SETTINGS.backupRetention);
  else if (key === 'timeDisplayFormat') next = normalizeTimeDisplayFormat(value);
  else if (key === 'shortcutMode') next = normalizeShortcutMode(value);
  else if (key === 'actionHudShortcut') next = normalizeActionHudShortcut(value);
  else if (key === 'actionHudDelayMs') next = normalizeActionHudDelayMs(value);
  else if (key === 'actionHudSlots') next = normalizeHudSlots(value);
  else if (TEMPLATE_RULES[key]) next = normalizeOutputTemplate(key, value);
  else if (typeof DEFAULT_PRODUCT_SETTINGS[key] === 'boolean') next = Boolean(value);
  plugin.state.uiState[key] = next;
  await plugin.persist();
  return currentProductSettings(plugin);
}

async function resetOutputTemplates(plugin) {
  plugin.state.uiState ||= {};
  for (const key of ['timeDisplayFormat', ...Object.keys(TEMPLATE_RULES)]) {
    plugin.state.uiState[key] = DEFAULT_PRODUCT_SETTINGS[key];
  }
  await plugin.persist();
  return currentProductSettings(plugin);
}

module.exports = {
  DEFAULT_PRODUCT_SETTINGS,
  LEGACY_DEFAULT_BACKLINK_TEMPLATE,
  TEMPLATE_RULES,
  clampInteger,
  currentProductSettings,
  ensureProductSettings,
  normalizeActionHudDelayMs,
  normalizeActionHudShortcut,
  normalizeCaptureFolder,
  normalizeOutputTemplate,
  normalizedBacklinkTemplate,
  normalizeShortcutMode,
  normalizeTimeDisplayFormat,
  outputTemplateTokens,
  resetOutputTemplates,
  updateProductSetting
};
