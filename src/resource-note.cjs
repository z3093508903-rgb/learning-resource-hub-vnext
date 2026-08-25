'use strict';

const { buildReferenceUri, normalizeReferencePosition } = require('./resource-reference.cjs');

function formatPositionClock(position) {
  const normalized = normalizeReferencePosition(position);
  const total = Math.floor(normalized.seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
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

function buildPositionMarkdown(resource, position, options = {}) {
  if (!resource?.id) throw new Error('无法为缺少 Resource ID 的资源生成回链。');
  const normalized = normalizeReferencePosition(position);
  const uri = buildReferenceUri({ resourceId: resource.id, position: normalized, version: 1 });
  const time = formatPositionClock(normalized);
  const title = escapeMarkdownLabel(options.title || resource.title || '学习资源');
  return `[↗ ${title} · ${time}](${uri})`;
}

function normalizeUserNote(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function buildNotePositionMarkdown(resource, position, noteText) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, { title: '回到课程' });
  return `${note}\n\n${backlink}`;
}

function buildCaptureMarkdown(resource, position, vaultImagePath) {
  const imagePath = String(vaultImagePath || '').trim().replace(/\\/g, '/');
  if (!imagePath || imagePath.includes('..')) throw new Error('截图 Vault 路径无效。');
  const backlink = buildPositionMarkdown(resource, position, { title: '回到课程' });
  return `![[${imagePath}]]\n\n${backlink}`;
}

function buildCaptureNoteMarkdown(resource, position, vaultImagePath, noteText) {
  const imagePath = String(vaultImagePath || '').trim().replace(/\\/g, '/');
  if (!imagePath || imagePath.includes('..')) throw new Error('截图 Vault 路径无效。');
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, { title: '回到课程' });
  return `![[${imagePath}]]\n\n${note}\n\n${backlink}`;
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
  const clock = formatPositionClock(position).replace(/:/g, '-');
  return `${sanitizeCaptureBaseName(resource?.title)}-${clock}.${safeExtension}`;
}

module.exports = {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown,
  captureFileName,
  escapeMarkdownLabel,
  formatPositionClock,
  normalizeUserNote,
  sanitizeCaptureBaseName
};
