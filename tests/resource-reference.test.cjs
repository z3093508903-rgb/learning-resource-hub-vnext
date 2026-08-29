'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FREEFORM_REFERENCE_VERSION,
  PORTABLE_MANAGED_REFERENCE_VERSION,
  REFERENCE_ACTION,
  REFERENCE_VERSION,
  buildFreeformReferenceUri,
  buildReferenceUri,
  parseProtocolParams,
  parseReferenceUri
} = require('../src/resource-reference.cjs');

test('builds and parses a stable Go Study v1 backlink', () => {
  const uri = buildReferenceUri({
    resourceId: 'resource-abc123',
    position: { type: 'time', seconds: 5076 },
    version: REFERENCE_VERSION
  });

  assert.match(uri, new RegExp(`^obsidian://${REFERENCE_ACTION}\\?`));
  assert.equal(uri.includes('resource=resource-abc123'), true);
  assert.equal(uri.includes('position=time%3A5076'), true);
  assert.equal(uri.includes('v=1'), true);
  assert.deepEqual(parseReferenceUri(uri), {
    resourceId: 'resource-abc123',
    position: { type: 'time', seconds: 5076 },
    version: 1
  });
});

test('zero-second positions are valid', () => {
  const reference = parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A0&v=1');
  assert.deepEqual(reference.position, { type: 'time', seconds: 0 });
});

test('negative and non-finite positions are rejected', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A-1&v=1'),
    /时间位置无效/
  );
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3AInfinity&v=1'),
    /时间位置无效/
  );
});

test('missing or malformed resource IDs are rejected', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?position=time%3A10&v=1'),
    /资源 ID 无效/
  );
  assert.throws(
    () => buildReferenceUri({ resourceId: 'resource id with spaces', position: { type: 'time', seconds: 10 } }),
    /资源 ID 无效/
  );
});

test('managed v1 stays compatible, portable managed v3 is supported, and unknown versions fail closed', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A10&v=2'),
    /Managed Go Study 回链只支持 v1 或 v3/
  );
  const v3 = buildReferenceUri({
    resourceId: 'resource-1',
    locator: 'https://www.bilibili.com/video/BV1PORTABLE?p=2',
    name: 'BV1PORTABLE',
    title: '便携课程',
    web: 'https://www.bilibili.com/video/BV1PORTABLE?p=2',
    position: { type: 'time', seconds: 65 },
    version: PORTABLE_MANAGED_REFERENCE_VERSION
  });
  const parsed = parseReferenceUri(v3);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.resourceId, 'resource-1');
  assert.equal(parsed.title, '便携课程');
  assert.equal(parsed.web, 'https://www.bilibili.com/video/BV1PORTABLE?p=2');
  assert.equal(parsed.position.seconds, 65);
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A10&v=99'),
    /不支持的 Go Study 回链版本/
  );
});

test('arbitrary execution parameters are rejected', () => {
  for (const key of ['path', 'url', 'exe', 'command', 'player', 'potplayer']) {
    assert.throws(
      () => parseReferenceUri(`obsidian://go-study?resource=resource-1&position=time%3A10&v=1&${key}=evil`),
      /不允许的参数/
    );
  }
});

test('raw backlink query cannot smuggle action metadata', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A10&v=1&action=go-study'),
    /不允许的参数/
  );
});

test('duplicate parameters are rejected', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&resource=resource-2&position=time%3A10&v=1'),
    /不能重复/
  );
});

test('non-Go-Study Obsidian URIs and unexpected path/hash structures are rejected', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://other-action?resource=resource-1&position=time%3A10&v=1'),
    /不是 Go Study 回链/
  );
  assert.throws(
    () => parseReferenceUri('obsidian://go-study/extra?resource=resource-1&position=time%3A10&v=1'),
    /不允许的地址结构/
  );
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A10&v=1#fragment'),
    /不允许的地址结构/
  );
});

test('Obsidian protocol-handler params accept only the registered action metadata', () => {
  const expected = {
    resourceId: 'resource-1',
    position: { type: 'time', seconds: 12.5 },
    version: 1
  };
  assert.deepEqual(parseProtocolParams({
    resource: 'resource-1',
    position: 'time:12.5',
    v: '1'
  }), expected);
  assert.deepEqual(parseProtocolParams({
    action: 'go-study',
    resource: 'resource-1',
    position: 'time:12.5',
    v: '1'
  }), expected);

  assert.throws(
    () => parseProtocolParams({ action: 'other', resource: 'resource-1', position: 'time:12', v: '1' }),
    /action 不匹配/
  );
  assert.throws(
    () => parseProtocolParams({ resource: 'resource-1', position: 'time:12', v: '1', path: 'C:\\evil.exe' }),
    /不允许的参数/
  );
});

test('freeform v2 backlinks use portable locator/name fields instead of Obsidian reserved path', () => {
  const local = buildFreeformReferenceUri({
    locator: 'D:\\Course\\lesson 01.mp4',
    position: { type: 'time', seconds: 754 }
  });
  assert.match(local, /mode=freeform/);
  assert.match(local, /locator=D%3A%5CCourse%5Clesson\+01\.mp4/);
  assert.match(local, /name=lesson\+01\.mp4/);
  assert.match(local, /v=2/);
  assert.doesNotMatch(local, /[?&]path=/);
  assert.deepEqual(parseReferenceUri(local), {
    mode: 'freeform',
    locator: 'D:\\Course\\lesson 01.mp4',
    name: 'lesson 01.mp4',
    web: '',
    position: { type: 'time', seconds: 754 },
    version: FREEFORM_REFERENCE_VERSION
  });

  const mac = buildFreeformReferenceUri({
    locator: '/Users/zl/Course/lesson 01.mp4',
    position: { type: 'time', seconds: 9 }
  });
  assert.equal(parseReferenceUri(mac).locator, '/Users/zl/Course/lesson 01.mp4');

  const web = buildFreeformReferenceUri({
    locator: 'https://www.bilibili.com/video/BV1TEST?p=2',
    position: { type: 'time', seconds: 65 }
  });
  const parsedWeb = parseReferenceUri(web);
  assert.equal(parsedWeb.mode, 'freeform');
  assert.match(parsedWeb.locator, /^https:\/\/www\.bilibili\.com\/video\/BV1TEST/);
  assert.equal(parsedWeb.name, 'BV1TEST');
});

test('legacy beta.15 path-based freeform links still parse into the v2 runtime shape', () => {
  const legacy = parseReferenceUri('obsidian://go-study?mode=freeform&path=D%3A%5CLoose%5Cold.mp4&position=time%3A18&v=1');
  assert.equal(legacy.mode, 'freeform');
  assert.equal(legacy.locator, 'D:\\Loose\\old.mp4');
  assert.equal(legacy.name, 'old.mp4');
  assert.equal(legacy.version, 1);
});

test('freeform backlinks reject arbitrary custom schemes and mixed managed/freeform identity', () => {
  assert.throws(() => buildFreeformReferenceUri({
    locator: 'javascript:alert(1)',
    position: { type: 'time', seconds: 1 }
  }), /绝对本地路径或 HTTP/);
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?mode=freeform&resource=r1&locator=D%3A%5Cvideo.mp4&position=time%3A1&v=2'),
    /不能同时包含 Resource ID/
  );
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?mode=freeform&locator=D%3A%5Cvideo.mp4&path=D%3A%5Cvideo.mp4&position=time%3A1&v=2'),
    /不能同时包含 locator 与旧 path/
  );
});


test('freeform v2 can preserve an optional browser source beside the playback locator', () => {
  const uri = buildFreeformReferenceUri({
    locator: 'D:\\Loose\\lesson.mp4',
    web: 'https://www.bilibili.com/video/BV1TEST?p=2',
    position: { type: 'time', seconds: 65 }
  });
  assert.match(uri, /web=https%3A%2F%2Fwww%2Ebilibili%2Ecom%2Fvideo%2FBV1TEST%3Fp%3D2/);
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.locator, 'D:\\Loose\\lesson.mp4');
  assert.equal(parsed.web, 'https://www.bilibili.com/video/BV1TEST?p=2');
  assert.equal(parsed.position.seconds, 65);
});


test('freeform v2 can remember a human media title without changing portable identity', () => {
  const uri = buildFreeformReferenceUri({
    locator: 'D:\\Loose\\learning-photo.mp4',
    name: 'learning-photo.mp4',
    title: '学习摄影',
    position: { type: 'time', seconds: 42 }
  });
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.name, 'learning-photo.mp4');
  assert.equal(parsed.title, '学习摄影');
  assert.equal(parsed.locator, 'D:\\Loose\\learning-photo.mp4');
});


test('managed v1 refuses v3 fallback fields so old semantics stay deterministic', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=r1&locator=https%3A%2F%2Fexample.com%2Fv.mp4&position=time%3A1&v=1'),
    /v1 管理型回链不能携带便携来源字段/
  );
});


test('nested Bilibili HTTP values are encoded so Obsidian Markdown cannot auto-link the host inside the Go Study destination', () => {
  const sourceUrl = 'https://www.bilibili.com/video/BV1xJ38z3EkX';
  const uri = buildFreeformReferenceUri({
    locator: sourceUrl,
    web: sourceUrl,
    position: { type: 'time', seconds: 12.244 }
  });
  assert.doesNotMatch(uri, /www\.bilibili\.com/);
  assert.match(uri, /www%2Ebilibili%2Ecom/);
  const parsed = parseReferenceUri(uri);
  assert.equal(parsed.locator, sourceUrl);
  assert.equal(parsed.web, sourceUrl);
  assert.equal(parsed.position.seconds, 12.244);
});
