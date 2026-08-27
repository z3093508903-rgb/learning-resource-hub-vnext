'use strict';

const REFERENCE_ACTION = 'go-study';
const REFERENCE_VERSION = 1;
const ALLOWED_QUERY_KEYS = new Set(['resource', 'position', 'v', 'mode', 'path', 'web']);
const ALLOWED_PROTOCOL_META_KEYS = new Set(['action']);
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

function normalizeResourceId(value) {
  const resourceId = String(value || '').trim();
  if (!RESOURCE_ID_PATTERN.test(resourceId)) throw new Error('Go Study 回链中的资源 ID 无效。');
  return resourceId;
}

function normalizeReferencePosition(value) {
  if (value && typeof value === 'object' && value.type === 'time') {
    return normalizeReferencePosition(`time:${value.seconds}`);
  }
  const text = String(value || '').trim();
  const match = text.match(/^time:(.+)$/i);
  if (!match) throw new Error('Go Study v1 仅支持 time:<seconds> 学习位置。');
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Go Study 回链中的时间位置无效。');
  return { type: 'time', seconds };
}

function serializeReferencePosition(position) {
  const normalized = normalizeReferencePosition(position);
  return `time:${String(normalized.seconds)}`;
}

function normalizeReferenceVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version !== REFERENCE_VERSION) {
    throw new Error(`不支持的 Go Study 回链版本：${String(value || '') || '缺失'}。`);
  }
  return version;
}

function normalizeFreeformLocator(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 4096 || /[\x00-\x1F]/.test(raw)) throw new Error('Go Study 自由回链中的媒体地址无效。');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    if (!/^[A-Za-z]:[\\/]/.test(raw) && !/^\\\\[^\\]+\\[^\\]+/.test(raw)) {
      throw new Error('Go Study 自由回链只允许 Windows 本地路径或 HTTP(S) 地址。');
    }
    return raw;
  }
}

function normalizeOptionalWebLocator(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('Go Study 自由回链中的网页地址无效。'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Go Study 自由回链网页地址只允许 HTTP(S)。');
  return url.toString();
}

function validateReferenceData(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    resourceId: normalizeResourceId(source.resourceId ?? source.resource),
    position: normalizeReferencePosition(source.position),
    version: normalizeReferenceVersion(source.version ?? source.v ?? REFERENCE_VERSION)
  };
}

function validateFreeformReferenceData(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    mode: 'freeform',
    path: normalizeFreeformLocator(source.path),
    web: normalizeOptionalWebLocator(source.web),
    position: normalizeReferencePosition(source.position),
    version: normalizeReferenceVersion(source.version ?? source.v ?? REFERENCE_VERSION)
  };
}

function buildReferenceUri(input) {
  const reference = validateReferenceData(input);
  const url = new URL(`obsidian://${REFERENCE_ACTION}`);
  url.searchParams.set('resource', reference.resourceId);
  url.searchParams.set('position', serializeReferencePosition(reference.position));
  url.searchParams.set('v', String(reference.version));
  return url.toString();
}

function buildFreeformReferenceUri(input) {
  const reference = validateFreeformReferenceData(input);
  const url = new URL(`obsidian://${REFERENCE_ACTION}`);
  url.searchParams.set('mode', 'freeform');
  url.searchParams.set('path', reference.path);
  if (reference.web) url.searchParams.set('web', reference.web);
  url.searchParams.set('position', serializeReferencePosition(reference.position));
  url.searchParams.set('v', String(reference.version));
  return url.toString();
}

function parseQueryEntries(searchParams) {
  const keys = [...searchParams.keys()];
  for (const key of keys) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new Error(`Go Study 回链包含不允许的参数：${key}。`);
    if (searchParams.getAll(key).length !== 1) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
  }
  if (searchParams.get('mode') === 'freeform') {
    if (searchParams.has('resource')) throw new Error('Go Study 自由回链不能同时包含 Resource ID。');
    return validateFreeformReferenceData({
      mode: 'freeform',
      path: searchParams.get('path'),
      web: searchParams.get('web'),
      position: searchParams.get('position'),
      v: searchParams.get('v')
    });
  }
  if (searchParams.has('mode') || searchParams.has('path') || searchParams.has('web')) {
    throw new Error('Go Study 管理型回链包含不允许的自由回链参数。');
  }
  return validateReferenceData({
    resource: searchParams.get('resource'),
    position: searchParams.get('position'),
    v: searchParams.get('v')
  });
}

function parseReferenceUri(rawUri) {
  let url;
  try { url = new URL(String(rawUri || '').trim()); } catch { throw new Error('Go Study 回链格式无效。'); }
  if (url.protocol !== 'obsidian:' || url.hostname !== REFERENCE_ACTION) {
    throw new Error('这不是 Go Study 回链。');
  }
  if ((url.pathname && url.pathname !== '/') || url.username || url.password || url.port || url.hash) {
    throw new Error('Go Study 回链包含不允许的地址结构。');
  }
  return parseQueryEntries(url.searchParams);
}

function parseProtocolParams(params) {
  const source = params && typeof params === 'object' ? params : {};
  const keys = Object.keys(source);
  for (const key of keys) {
    if (ALLOWED_PROTOCOL_META_KEYS.has(key)) {
      if (Array.isArray(source[key])) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
      if (key === 'action' && source[key] != null && String(source[key]) !== REFERENCE_ACTION) {
        throw new Error('Go Study 回链的协议 action 不匹配。');
      }
      continue;
    }
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new Error(`Go Study 回链包含不允许的参数：${key}。`);
    if (Array.isArray(source[key])) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
  }
  if (String(source.mode || '') === 'freeform') {
    if (source.resource != null) throw new Error('Go Study 自由回链不能同时包含 Resource ID。');
    return validateFreeformReferenceData(source);
  }
  if (source.mode != null || source.path != null || source.web != null) {
    throw new Error('Go Study 管理型回链包含不允许的自由回链参数。');
  }
  return validateReferenceData({
    resource: source.resource,
    position: source.position,
    v: source.v
  });
}

module.exports = {
  ALLOWED_PROTOCOL_META_KEYS,
  ALLOWED_QUERY_KEYS,
  REFERENCE_ACTION,
  REFERENCE_VERSION,
  buildFreeformReferenceUri,
  buildReferenceUri,
  normalizeFreeformLocator,
  normalizeOptionalWebLocator,
  normalizeReferencePosition,
  normalizeReferenceVersion,
  normalizeResourceId,
  parseProtocolParams,
  parseReferenceUri,
  serializeReferencePosition,
  validateFreeformReferenceData,
  validateReferenceData
};
