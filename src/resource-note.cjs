'use strict';

const {
  PORTABLE_MANAGED_REFERENCE_VERSION,
  buildFreeformReferenceUri,
  buildReferenceUri,
  freeformLocatorName,
  normalizeOptionalManagedLocator,
  normalizeOptionalWebLocator,
  normalizeReferencePosition
} = require('./resource-reference.cjs');
const {
  DEFAULT_PRODUCT_SETTINGS,
  normalizeOutputTemplate,
  normalizeTimeDisplayFormat
} = require('./product-settings.cjs');

function formatPositionClock(position, mode = 'smart') {
  const normalized = normalizeReferencePosition(position);
  const total = Math.floor(normalized.seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const format = normalizeTimeDisplayFormat(mode);
  if (format === 'hms') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeMarkdownLabel(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
    .replace(/\[/g, '\\[')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function renderOutputTemplate(template, values = {}) {
  return String(template || '').replace(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(values, token)) return match;
    return String(values[token] ?? '');
  });
}

function firstHttpLocator(values) {
  for (const value of values || []) {
    try {
      const normalized = normalizeOptionalWebLocator(value);
      if (normalized) return normalized;
    } catch {}
  }
  return '';
}

function firstManagedLocator(values) {
  for (const value of values || []) {
    try {
      const normalized = normalizeOptionalManagedLocator(value);
      if (normalized) return normalized;
    } catch {}
  }
  return '';
}

function managedReferenceFallback(resource = {}) {
  const metadata = resource?.metadata || {};
  const launcher = resource?.launcher || {};
  const launcherHttp = launcher.type === 'potplayer'
    ? launcher.target
    : launcher.type === 'uri'
      ? launcher.uri
      : '';
  const web = firstHttpLocator([
    metadata.sourceUrl,
    metadata.originalUrl,
    metadata.web,
    launcherHttp
  ]);
  const locator = firstManagedLocator([
    metadata.localPath,
    launcher.type === 'file' ? launcher.path : '',
    launcher.type === 'potplayer' ? launcher.target : '',
    launcher.type === 'uri' ? launcher.uri : '',
    web
  ]);
  let name = '';
  if (locator) {
    try { name = freeformLocatorName(locator); } catch {}
  }
  const title = String(resource?.title || '').replace(/[\r\n\t]+/g, ' ').trim();
  return {
    ...(locator ? { locator } : {}),
    ...(name ? { name } : {}),
    ...(title ? { title } : {}),
    ...(web ? { web } : {})
  };
}

function buildPositionMarkdown(resource, position, options = {}) {
  if (!resource?.id) throw new Error('无法为缺少 Resource ID 的资源生成回链。');
  const normalized = normalizeReferencePosition(position);
  const uri = buildReferenceUri({
    resourceId: resource.id,
    ...managedReferenceFallback(resource),
    position: normalized,
    version: PORTABLE_MANAGED_REFERENCE_VERSION
  });
  const time = formatPositionClock(normalized, options.timeFormat || DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat);
  const title = escapeMarkdownLabel(options.title || resource.title || '学习资源');
  const template = normalizeOutputTemplate(
    'backlinkTemplate',
    options.template ?? options.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate
  );
  return renderOutputTemplate(template, { title, time, uri });
}

function freeformMediaTitle(media = {}) {
  const explicit = String(media.title || '').replace(/\s+-\s+PotPlayer\s*$/i, '').trim();
  if (explicit && explicit.toLowerCase() !== 'potplayer') return explicit;
  const raw = String(media.path || '').trim();
  try {
    const url = new URL(raw);
    const tail = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname || '临时视频');
    return tail || url.hostname || '临时视频';
  } catch {}
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.pop() || '临时视频';
}

function freeformWebLocator(media = {}) {
  const raw = String(media.web || media.path || '').trim();
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function buildFreeformPositionMarkdown(media, position, options = {}) {
  const normalized = normalizeReferencePosition(position);
  const locator = String(media?.path || '').trim();
  const uri = buildFreeformReferenceUri({
    locator,
    name: freeformLocatorName(locator),
    title: freeformMediaTitle(media),
    web: freeformWebLocator(media),
    position: normalized
  });
  const time = formatPositionClock(normalized, options.timeFormat || DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat);
  const title = escapeMarkdownLabel(options.title || '回到课程');
  const template = normalizeOutputTemplate(
    'backlinkTemplate',
    options.template ?? options.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate
  );
  return renderOutputTemplate(template, { title, time, uri });
}

function buildContextPositionMarkdown(context, options = {}) {
  if (context?.mode === 'freeform') {
    return buildFreeformPositionMarkdown(context.bridgeMedia || context.freeform || {}, context.position, options);
  }
  return buildPositionMarkdown(context?.resource, context?.position, options);
}

function normalizeUserNote(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function buildNotePositionMarkdown(resource, position, noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('noteTemplate', options.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate);
  return renderOutputTemplate(template, { note, backlink });
}

function normalizeCaptureImage(vaultImagePath) {
  const imagePath = String(vaultImagePath || '').trim().replace(/\\/g, '/');
  if (!imagePath || imagePath.includes('..')) throw new Error('截图 Vault 路径无效。');
  return `![[${imagePath}]]`;
}
function buildPlainNoteMarkdown(noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const template = normalizeOutputTemplate('plainNoteTemplate', options.plainNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainNoteTemplate);
  return renderOutputTemplate(template, { note });
}

function buildPlainCaptureMarkdown(vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const template = normalizeOutputTemplate('plainCaptureTemplate', options.plainCaptureTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureTemplate);
  return renderOutputTemplate(template, { image });
}

function buildPlainCaptureNoteMarkdown(vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const template = normalizeOutputTemplate(
    'plainCaptureNoteTemplate',
    options.plainCaptureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note });
}


function buildCaptureMarkdown(resource, position, vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('captureTemplate', options.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate);
  return renderOutputTemplate(template, { image, backlink });
}

function buildCaptureNoteMarkdown(resource, position, vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate(
    'captureNoteTemplate',
    options.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note, backlink });
}
function contextBacklinkTitle(_context, options = {}) {
  if (options.backlinkTitle) return options.backlinkTitle;
  return '回到课程';
}

function buildContextNoteMarkdown(context, noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('noteTemplate', options.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate);
  return renderOutputTemplate(template, { note, backlink });
}

function buildContextCaptureMarkdown(context, vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('captureTemplate', options.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate);
  return renderOutputTemplate(template, { image, backlink });
}

function buildContextCaptureNoteMarkdown(context, vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate(
    'captureNoteTemplate',
    options.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note, backlink });
}


function sanitizeCaptureBaseName(value) {
  const cleaned = String(value || '学习资源')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || '学习资源').slice(0, 80);
}

function captureFileName(resource, position, extension = 'png') {
  const safeExtension = String(extension || 'png').toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(safeExtension)) throw new Error('截图扩展名无效。');
  const clock = formatPositionClock(position, 'smart').replace(/:/g, '-');
  return `${sanitizeCaptureBaseName(resource?.title)}-${clock}.${safeExtension}`;
}

module.exports = {
  buildCaptureMarkdown,
  buildContextCaptureMarkdown,
  buildContextCaptureNoteMarkdown,
  buildContextNoteMarkdown,
  buildContextPositionMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown,
  buildFreeformPositionMarkdown,
  buildPlainCaptureMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
  captureFileName,
  contextBacklinkTitle,
  freeformMediaTitle,
  freeformWebLocator,
  managedReferenceFallback,
  escapeMarkdownLabel,
  formatPositionClock,
  normalizeCaptureImage,
  normalizeUserNote,
  renderOutputTemplate,
  sanitizeCaptureBaseName
};
