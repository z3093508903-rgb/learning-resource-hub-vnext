'use strict';

const DEFAULT_PRODUCT_SETTINGS = Object.freeze({
  autoCollapseSidebar: true,
  videoEnhancementEnabled: false,
  videoResumeAfterSave: true,
  videoResumeAfterCancel: true,
  videoSuccessFeedback: true,
  captureFolder: 'GoStudy/Captures',
  backupRetention: 10
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
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return DEFAULT_PRODUCT_SETTINGS.captureFolder;
  if (parts.some((part) => part === '.' || part === '..' || /[<>:"|?*\x00-\x1F]/.test(part))) {
    throw new Error('截图目录必须是 Vault 内的安全相对路径。');
  }
  return parts.join('/');
}

function currentProductSettings(plugin) {
  const ui = plugin?.state?.uiState || {};
  let captureFolder = DEFAULT_PRODUCT_SETTINGS.captureFolder;
  try { captureFolder = normalizeCaptureFolder(ui.captureFolder || captureFolder); } catch {}
  return {
    autoCollapseSidebar: boolOr(ui.autoCollapseSidebar, DEFAULT_PRODUCT_SETTINGS.autoCollapseSidebar),
    videoEnhancementEnabled: boolOr(ui.videoEnhancementEnabled, DEFAULT_PRODUCT_SETTINGS.videoEnhancementEnabled),
    videoResumeAfterSave: boolOr(ui.videoResumeAfterSave, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterSave),
    videoResumeAfterCancel: boolOr(ui.videoResumeAfterCancel, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterCancel),
    videoSuccessFeedback: boolOr(ui.videoSuccessFeedback, DEFAULT_PRODUCT_SETTINGS.videoSuccessFeedback),
    captureFolder,
    backupRetention: clampInteger(ui.backupRetention, 3, 50, DEFAULT_PRODUCT_SETTINGS.backupRetention)
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
  else if (key === 'backupRetention') next = clampInteger(value, 3, 50, DEFAULT_PRODUCT_SETTINGS.backupRetention);
  else if (typeof DEFAULT_PRODUCT_SETTINGS[key] === 'boolean') next = Boolean(value);
  plugin.state.uiState[key] = next;
  await plugin.persist();
  return currentProductSettings(plugin);
}

module.exports = {
  DEFAULT_PRODUCT_SETTINGS,
  clampInteger,
  currentProductSettings,
  ensureProductSettings,
  normalizeCaptureFolder,
  updateProductSetting
};
