'use strict';

const {
  FREEFORM_REFERENCE_VERSION,
  freeformLocatorName,
  validateFreeformReferenceData
} = require('./resource-reference.cjs');

function parseLegacyJvTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) throw new Error('旧 JV 链接中的时间格式无效。');
  const values = parts.map(Number);
  if (values.some((item) => !Number.isFinite(item) || item < 0)) throw new Error('旧 JV 链接中的时间格式无效。');
  const seconds = values.pop();
  const minutes = values.pop() || 0;
  const hours = values.pop() || 0;
  if (seconds >= 60 || minutes >= 60) throw new Error('旧 JV 链接中的时间格式无效。');
  return hours * 3600 + minutes * 60 + seconds;
}

function legacyJvCompatibilityEnabled(plugin) {
  return Boolean(plugin?.state?.uiState?.legacyJvCompatibilityEnabled);
}

function parseLegacyJvUri(rawUri) {
  let uri;
  try { uri = new URL(String(rawUri || '').trim()); }
  catch { throw new Error('旧 JV 链接格式无效。'); }

  if (uri.protocol !== 'jv:' || uri.hostname !== 'open') {
    throw new Error('这不是受支持的旧 JV 链接。');
  }

  const locator = String(uri.searchParams.get('path') || '').trim();
  if (!locator) throw new Error('旧 JV 链接缺少媒体地址。');
  const seconds = parseLegacyJvTime(uri.searchParams.get('time'));
  const web = /^https?:\/\//i.test(locator) ? locator : '';

  return validateFreeformReferenceData({
    mode: 'freeform',
    locator,
    name: freeformLocatorName(locator),
    ...(web ? { web } : {}),
    position: { type: 'time', seconds },
    version: FREEFORM_REFERENCE_VERSION
  });
}

module.exports = {
  legacyJvCompatibilityEnabled,
  parseLegacyJvTime,
  parseLegacyJvUri
};
