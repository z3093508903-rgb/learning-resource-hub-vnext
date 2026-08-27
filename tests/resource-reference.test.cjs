'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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

test('unknown protocol versions fail closed', () => {
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?resource=resource-1&position=time%3A10&v=2'),
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

test('freeform backlinks preserve a safe local or web locator plus time without inventing a Resource ID', () => {
  const local = buildFreeformReferenceUri({
    path: 'D:\\Course\\lesson 01.mp4',
    position: { type: 'time', seconds: 754 },
    version: 1
  });
  const parsedLocal = parseReferenceUri(local);
  assert.equal(parsedLocal.mode, 'freeform');
  assert.equal(parsedLocal.path, 'D:\\Course\\lesson 01.mp4');
  assert.equal(parsedLocal.web, '');
  assert.deepEqual(parsedLocal.position, { type: 'time', seconds: 754 });

  const web = buildFreeformReferenceUri({
    path: 'https://www.bilibili.com/video/BV1TEST?p=2',
    web: 'https://www.bilibili.com/video/BV1TEST?p=2',
    position: { type: 'time', seconds: 65 }
  });
  const parsedWeb = parseReferenceUri(web);
  assert.equal(parsedWeb.mode, 'freeform');
  assert.match(parsedWeb.path, /^https:\/\/www\.bilibili\.com\/video\/BV1TEST/);
  assert.equal(parsedWeb.web, parsedWeb.path);
});

test('freeform backlinks reject arbitrary executable protocols and mixed managed/freeform identity', () => {
  assert.throws(() => buildFreeformReferenceUri({
    path: 'file:///C:/Windows/System32/calc.exe',
    position: { type: 'time', seconds: 1 }
  }), /只允许 Windows 本地路径或 HTTP/);
  assert.throws(
    () => parseReferenceUri('obsidian://go-study?mode=freeform&resource=r1&path=D%3A%5Cvideo.mp4&position=time%3A1&v=1'),
    /不能同时包含 Resource ID/
  );
});
