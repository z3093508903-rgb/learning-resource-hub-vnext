'use strict';

const DEFAULT_PRODUCT_SETTINGS = Object.freeze({
  autoCollapseSidebar: true,
  videoEnhancementEnabled: false,
  videoResumeAfterSave: true,
  videoResumeAfterCancel: true,
  videoSuccessFeedback: true,
  focusStudyNoteAtEnd: true,
  captureFolder: 'GoStudy/Captures',
  backupRetention: 10,
  timeDisplayFormat: 'smart',
  backlinkTemplate: '[↗ {title} · {time}]({uri})',
  noteTemplate: '{note}\n\n{backlink}',
  captureTemplate: '{image}\n\n{backlink}',
  captureNoteTemplate: '{image}\n\n{note}\n\n{backlink}'
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
    videoResumeAfterSave: boolOr(ui.videoResumeAfterSave, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterSave),
    videoResumeAfterCancel: boolOr(ui.videoResumeAfterCancel, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterCancel),
    videoSuccessFeedback: boolOr(ui.videoSuccessFeedback, DEFAULT_PRODUCT_SETTINGS.videoSuccessFeedback),
    focusStudyNoteAtEnd: boolOr(ui.focusStudyNoteAtEnd, DEFAULT_PRODUCT_SETTINGS.focusStudyNoteAtEnd),
    captureFolder,
    backupRetention: clampInteger(ui.backupRetention, 3, 10, DEFAULT_PRODUCT_SETTINGS.backupRetention),
    timeDisplayFormat: normalizeTimeDisplayFormat(ui.timeDisplayFormat),
    backlinkTemplate: safeOutputTemplate('backlinkTemplate', ui.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate),
    noteTemplate: safeOutputTemplate('noteTemplate', ui.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate),
    captureTemplate: safeOutputTemplate('captureTemplate', ui.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate),
    captureNoteTemplate: safeOutputTemplate('captureNoteTemplate', ui.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate)
  };
}

function ensureProductSettings(plugin) {
  if (!plugin?.state) return { changed: false, settings: { ...DEFAULT_PRODUCT_SETTINGS } };
  plugin.state.uiState ||= {};
  const normalized = currentProductSettings(plugin);
  let changed = false;
  for (const [key, value] of Object.entries(normalized)) {
    if (plugin.state.uiState[key] !== value) {
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
  TEMPLATE_RULES,
  clampInteger,
  currentProductSettings,
  ensureProductSettings,
  normalizeCaptureFolder,
  normalizeOutputTemplate,
  normalizeTimeDisplayFormat,
  outputTemplateTokens,
  resetOutputTemplates,
  updateProductSetting
};
