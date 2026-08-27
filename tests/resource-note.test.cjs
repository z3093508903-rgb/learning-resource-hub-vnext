'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseReferenceUri } = require('../src/resource-reference.cjs');
const {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildFreeformPositionMarkdown,
  buildNotePositionMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
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

test('time display supports smart and fixed HH:MM:SS modes', () => {
  assert.equal(formatPositionClock({ type: 'time', seconds: 5 }), '00:05');
  assert.equal(formatPositionClock({ type: 'time', seconds: 5 }, 'hms'), '00:00:05');
  assert.equal(formatPositionClock({ type: 'time', seconds: 3661 }), '01:01:01');
  assert.equal(formatPositionClock({ type: 'time', seconds: 3661 }, 'hms'), '01:01:01');
});

test('custom backlink template changes presentation without changing permanent URI data', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildPositionMarkdown(resource, { type: 'time', seconds: 65 }, {
    timeFormat: 'hms',
    backlinkTemplate: '🎬 [{time}]({uri}) · {title}'
  });
  assert.ok(markdown.startsWith('🎬 [00:01:05](obsidian://go-study?'));
  assert.ok(markdown.endsWith(' · 高数'));
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.resourceId, 'resource-123');
  assert.equal(parsed.position.seconds, 65);
});

test('custom note and capture-note templates can reorder visible blocks safely', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const note = buildNotePositionMarkdown(resource, { type: 'time', seconds: 90 }, '关键结论', {
    backlinkTemplate: '[{time}]({uri})',
    noteTemplate: '> {note}\n> {backlink}'
  });
  assert.ok(note.startsWith('> 关键结论\n> [01:30](obsidian://go-study?'));

  const captureNote = buildCaptureNoteMarkdown(resource, { type: 'time', seconds: 90 }, 'Shots/a.png', '公式', {
    backlinkTemplate: '[{time}]({uri})',
    captureNoteTemplate: '{note}\n\n{backlink}\n\n{image}'
  });
  assert.ok(captureNote.startsWith('公式\n\n[01:30](obsidian://go-study?'));
  assert.ok(captureNote.endsWith('![[Shots/a.png]]'));
});

test('capture filenames are Windows-safe and position-stable', () => {
  assert.equal(sanitizeCaptureBaseName('课程: 01 / 入门?*'), '课程- 01 - 入门--');
  assert.equal(captureFileName({ title: '课程: 01' }, { type: 'time', seconds: 3661 }), '课程- 01-01-01-01.png');
});


test('freeform position markdown keeps the same visible template while using a locator-based Go Study URI', () => {
  const markdown = buildFreeformPositionMarkdown(
    { path: 'D:\\Loose\\tutorial.mp4', title: 'tutorial - PotPlayer' },
    { type: 'time', seconds: 754 },
    { backlinkTemplate: '[🎬 {title} · {time}]({uri})' }
  );
  assert.match(markdown, /^\[🎬 tutorial · 12:34\]\(obsidian:\/\/go-study\?/);
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.mode, 'freeform');
  assert.equal(parsed.path, 'D:\\Loose\\tutorial.mp4');
  assert.equal(parsed.position.seconds, 754);
});

test('no-timestamp templates can emit pure notes or image notes without backlinks', () => {
  assert.equal(buildPlainNoteMarkdown('灵感', { plainNoteTemplate: '> {note}' }), '> 灵感');
  const mixed = buildPlainCaptureNoteMarkdown('Shots/a.png', '只保留画面', {
    plainCaptureNoteTemplate: '{image}\n> {note}'
  });
  assert.equal(mixed, '![[Shots/a.png]]\n> 只保留画面');
  assert.doesNotMatch(mixed, /obsidian:\/\/go-study/);
});
