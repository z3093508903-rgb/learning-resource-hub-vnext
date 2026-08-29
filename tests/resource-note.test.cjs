'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseReferenceUri } = require('../src/resource-reference.cjs');
const {
  buildContextPositionMarkdown,
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
  assert.ok(markdown.startsWith('[01:24:36](obsidian://go-study?'));
  const uri = markdown.slice(markdown.indexOf('(') + 1, -1);
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.resourceId, 'resource-123');
  assert.equal(parsed.position.seconds, 5076.9);
});

test('capture markdown combines a Vault image embed with the same permanent resource backlink', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildCaptureMarkdown(resource, { type: 'time', seconds: 65 }, 'GoStudy/Captures/高数-01-05.png');
  assert.ok(markdown.startsWith('![[GoStudy/Captures/高数-01-05.png]]\n\n[01:05](obsidian://go-study?'));
  assert.throws(() => buildCaptureMarkdown(resource, { type: 'time', seconds: 65 }, '../outside.png'), /Vault 路径/);
});

test('typed note markdown places user text immediately before the permanent backlink', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildNotePositionMarkdown(resource, { type: 'time', seconds: 88 }, '这里老师解释了导数的几何意义');
  assert.ok(markdown.startsWith('这里老师解释了导数的几何意义\n\n[01:28](obsidian://go-study?'));
  assert.throws(() => buildNotePositionMarkdown(resource, { type: 'time', seconds: 88 }, '   '), /不能为空/);
});

test('capture note markdown keeps screenshot, typed note and backlink together', () => {
  const resource = { id: 'resource-123', title: '高数' };
  const markdown = buildCaptureNoteMarkdown(resource, { type: 'time', seconds: 90 }, 'GoStudy/Captures/高数-01-30.png', '这一帧是关键公式');
  assert.ok(markdown.startsWith('![[GoStudy/Captures/高数-01-30.png]]\n\n这一帧是关键公式\n\n[01:30](obsidian://go-study?'));
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


test('freeform position markdown uses the portable Go Study v2 link and a clean visible label', () => {
  const markdown = buildFreeformPositionMarkdown(
    { path: 'D:\\Loose\\tutorial.mp4', title: '乱码 title - PotPlayer' },
    { type: 'time', seconds: 754 },
    { backlinkTemplate: '[↗ {title} · {time}]({uri})' }
  );
  assert.match(markdown, /^\[↗ 回到课程 · 12:34\]\(obsidian:\/\/go-study\?/);
  assert.match(markdown, /mode=freeform/);
  assert.match(markdown, /locator=D%3A%5CLoose%5Ctutorial\.mp4/);
  assert.match(markdown, /name=tutorial\.mp4/);
  assert.match(markdown, /v=2/);
  assert.doesNotMatch(markdown, /jv:\/\//);
  assert.doesNotMatch(markdown, /乱码 title/);
});

test('no-timestamp templates can emit pure notes or image notes without backlinks', () => {
  assert.equal(buildPlainNoteMarkdown('灵感', { plainNoteTemplate: '> {note}' }), '> 灵感');
  const mixed = buildPlainCaptureNoteMarkdown('Shots/a.png', '只保留画面', {
    plainCaptureNoteTemplate: '{image}\n> {note}'
  });
  assert.equal(mixed, '![[Shots/a.png]]\n> 只保留画面');
  assert.doesNotMatch(mixed, /obsidian:\/\/go-study/);
});


test('freeform context backlinks use a stable human label instead of player title text', () => {
  const markdown = buildContextPositionMarkdown({
    mode: 'freeform',
    bridgeMedia: { path: 'https://example.com/video.mp4', title: 'bl��e��� - PotPlayer' },
    position: { type: 'time', seconds: 18 }
  }, {
    backlinkTemplate: '[↗ {title} · {time}]({uri})'
  });
  assert.match(markdown, /^\[↗ 回到课程 · 00:18\]/);
  assert.doesNotMatch(markdown, /bl��e/);
});


test('freeform web captures keep their browser URL in the permanent v2 backlink', () => {
  const markdown = buildFreeformPositionMarkdown(
    { path: 'https://www.bilibili.com/video/BV1TEST?p=2', title: '课程 - PotPlayer' },
    { type: 'time', seconds: 65 }
  );
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.mode, 'freeform');
  assert.equal(parsed.web, 'https://www.bilibili.com/video/BV1TEST?p=2');
  assert.equal(parsed.position.seconds, 65);
});


test('freeform generated backlink stores the player media title as hidden metadata', () => {
  const markdown = buildFreeformPositionMarkdown(
    { path: 'D:\\Loose\\learning-photo.mp4', title: '学习摄影 - PotPlayer' },
    { type: 'time', seconds: 42 }
  );
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.title, '学习摄影');
  assert.equal(parsed.name, 'learning-photo.mp4');
});


test('default managed and freeform backlinks show only the time while source metadata stays hidden', () => {
  const managed = buildPositionMarkdown({ id: 'resource-1', title: '剪辑课第一期' }, { type: 'time', seconds: 35 });
  assert.match(managed, /^\[00:35\]\(obsidian:\/\/go-study\?/);
  assert.doesNotMatch(managed, /回到课程|剪辑课第一期/);

  const freeform = buildFreeformPositionMarkdown(
    { path: 'D:\\Loose\\lesson.mp4', title: '零散视频标题 - PotPlayer' },
    { type: 'time', seconds: 128 }
  );
  assert.match(freeform, /^\[02:08\]\(obsidian:\/\/go-study\?/);
  assert.doesNotMatch(freeform, /回到课程/);
  const uri = freeform.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.title, '零散视频标题');
});


test('new managed timestamps hide source details visually but embed a self-describing v3 fallback', () => {
  const resource = {
    id: 'resource-bili',
    title: '剪辑第一课',
    launcher: { type: 'potplayer', target: 'https://www.bilibili.com/video/BV1EDIT?p=2' },
    metadata: { sourceUrl: 'https://www.bilibili.com/video/BV1EDIT?p=2' }
  };
  const markdown = buildPositionMarkdown(resource, { type: 'time', seconds: 95 });
  assert.match(markdown, /^\[01:35\]\(obsidian:\/\/go-study\?/);
  assert.doesNotMatch(markdown, /剪辑第一课/);
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.resourceId, 'resource-bili');
  assert.equal(parsed.title, '剪辑第一课');
  assert.equal(parsed.web, 'https://www.bilibili.com/video/BV1EDIT?p=2');
  assert.match(parsed.locator, /^https:\/\/www\.bilibili\.com\/video\/BV1EDIT/);
});


test('corrupted PotPlayer replacement-character title falls back to portable Bilibili identity instead of polluting hidden metadata', () => {
  const markdown = buildFreeformPositionMarkdown(
    {
      path: 'https://www.bilibili.com/video/BV1xJ38z3EkX',
      title: '��课程��� - PotPlayer'
    },
    { type: 'time', seconds: 12.244 }
  );
  const uri = markdown.match(/\((obsidian:\/\/go-study\?[^)]+)\)/)?.[1];
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.title, 'BV1xJ38z3EkX');
  assert.equal(parsed.web, 'https://www.bilibili.com/video/BV1xJ38z3EkX');
});
