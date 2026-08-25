'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseReferenceUri } = require('../src/resource-reference.cjs');
const {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown,
  captureFileName,
  formatPositionClock,
  sanitizeCaptureBaseName
} = require('../src/resource-note.cjs');

test('position markdown uses the permanent Go Study URI and readable clock', () => {
  const resource = { id: 'resource-123', title: '高等数学 [极限]' };
  const markdown = buildPositionMarkdown(resource, { type: 'time', seconds: 5076.9 });
  assert.ok(markdown.startsWith('[↗ 高等数学 \\[极限\\] · 01:24:36](obsidian://go-study?'));
  const uri = markdown.slice(markdown.indexOf('(') + 1, -1);
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.resourceId, 'resource-123');
  assert.equal(parsed.position.seconds, 5076.9);
});

test('capture markdown combines a Vault image embed with the same permanent resource backlink', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildCaptureMarkdown(resource, { type: 'time', seconds: 65 }, 'GoStudy/Captures/高数-01-05.png');
  assert.ok(markdown.startsWith('![[GoStudy/Captures/高数-01-05.png]]\n\n[↗ 回到课程 · 01:05](obsidian://go-study?'));
  assert.throws(() => buildCaptureMarkdown(resource, { type: 'time', seconds: 65 }, '../outside.png'), /Vault 路径/);
});

test('typed note markdown places user text immediately before the permanent backlink', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildNotePositionMarkdown(resource, { type: 'time', seconds: 88 }, '这里老师解释了导数的几何意义');
  assert.ok(markdown.startsWith('这里老师解释了导数的几何意义\n\n[↗ 回到课程 · 01:28](obsidian://go-study?'));
  assert.throws(() => buildNotePositionMarkdown(resource, { type: 'time', seconds: 88 }, '   '), /不能为空/);
});

test('capture note markdown keeps screenshot, typed note and backlink together', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildCaptureNoteMarkdown(resource, { type: 'time', seconds: 90 }, 'GoStudy/Captures/高数-01-30.png', '这一帧是关键公式');
  assert.ok(markdown.startsWith('![[GoStudy/Captures/高数-01-30.png]]\n\n这一帧是关键公式\n\n[↗ 回到课程 · 01:30](obsidian://go-study?'));
});

test('capture filenames are Windows-safe and position-stable', () => {
  assert.equal(formatPositionClock({ type: 'time', seconds: 5 }), '00:05');
  assert.equal(formatPositionClock({ type: 'time', seconds: 3661 }), '01:01:01');
  assert.equal(sanitizeCaptureBaseName('课程: 01 / 入门?*'), '课程- 01 - 入门--');
  assert.equal(captureFileName({ title: '课程: 01' }, { type: 'time', seconds: 3661 }), '课程- 01-01-01-01.png');
});
