'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  matchingManagedResourceByPortableName,
  normalizeLocalMediaPath,
  openListMediaMatches,
  resolveActiveMediaSession,
  resolveUniversalMediaSession,
  targetMatchesBridgeMedia
} = require('../src/media-session.cjs');

function openListFixture() {
  const resource = {
    id: 'resource-1',
    title: '高数 17',
    kind: 'video',
    locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/百度/高数/17.mp4' },
    launcher: { type: 'openlist', sourceId: 'source-1', remotePath: '/百度/高数/17.mp4' },
    metadata: { remotePath: '/百度/高数/17.mp4' },
    deletedAt: ''
  };
  return {
    state: {
      resources: { 'resource-1': resource },
      sources: { 'source-1': { id: 'source-1', type: 'openlist', baseUrl: 'https://cloud.example.com', deletedAt: '' } }
    },
    resource
  };
}

test('OpenList media matching ignores temporary sign but requires the current logical file path', () => {
  const { state, resource } = openListFixture();
  assert.equal(openListMediaMatches(state, resource, 'https://cloud.example.com/d/%E7%99%BE%E5%BA%A6/%E9%AB%98%E6%95%B0/17.mp4?sign=temporary'), true);
  assert.equal(openListMediaMatches(state, resource, 'https://cloud.example.com/d/%E7%99%BE%E5%BA%A6/%E9%AB%98%E6%95%B0/18.mp4?sign=temporary'), false);
  assert.equal(openListMediaMatches(state, resource, 'https://evil.example.com/d/%E7%99%BE%E5%BA%A6/%E9%AB%98%E6%95%B0/17.mp4'), false);
});

test('local media paths compare case-insensitively with normalized Windows separators', () => {
  assert.equal(normalizeLocalMediaPath('"C:\\Course\\Part 01.MP4"'), 'c:/course/part 01.mp4');
  const resource = { id: 'local', kind: 'video' };
  assert.equal(targetMatchesBridgeMedia({}, resource, { type: 'potplayer', target: 'C:\\Course\\Part 01.MP4' }, 'c:/course/part 01.mp4'), true);
  assert.equal(targetMatchesBridgeMedia({}, resource, { type: 'potplayer', target: 'C:\\Course\\Part 01.MP4' }, 'c:/course/part 02.mp4'), false);
});

test('Bilibili media matching preserves the part number', () => {
  const resource = { id: 'bili', kind: 'video' };
  const target = { type: 'potplayer', target: 'https://www.bilibili.com/video/BV1TEST?p=13' };
  assert.equal(targetMatchesBridgeMedia({}, resource, target, 'https://www.bilibili.com/video/BV1TEST?p=13'), true);
  assert.equal(targetMatchesBridgeMedia({}, resource, target, 'https://www.bilibili.com/video/BV1TEST?p=14'), false);
});

test('active session resolution refuses to guess when PotPlayer is on another resource', () => {
  const { state, resource } = openListFixture();
  const resolveActions = () => ({ playTarget: { type: 'openlist', sourceId: 'source-1', remotePath: '/百度/高数/17.mp4' } });
  const resolved = resolveActiveMediaSession(
    state,
    { resourceId: resource.id, startedAt: '2026-08-24T12:00:00Z' },
    { path: 'https://cloud.example.com/d/%E7%99%BE%E5%BA%A6/%E9%AB%98%E6%95%B0/17.mp4?sign=x', positionSeconds: 5076 },
    resolveActions
  );
  assert.equal(resolved.resource.id, resource.id);
  assert.deepEqual(resolved.position, { type: 'time', seconds: 5076 });

  assert.throws(() => resolveActiveMediaSession(
    state,
    { resourceId: resource.id },
    { path: 'https://cloud.example.com/d/%E7%99%BE%E5%BA%A6/%E9%AB%98%E6%95%B0/18.mp4?sign=x', positionSeconds: 5076 },
    resolveActions
  ), /不一致/);
});


test('universal resolution recognizes a managed resource even when PotPlayer was opened outside Go Study', () => {
  const state = {
    resources: {
      local: { id: 'local', kind: 'video', title: 'Lesson', deletedAt: '' }
    },
    sources: {}
  };
  const resolveActions = () => ({ playTarget: { type: 'potplayer', target: 'D:\\Course\\lesson.mp4' } });
  const resolved = resolveUniversalMediaSession(
    state,
    null,
    { path: 'd:/course/lesson.mp4', positionSeconds: 42, title: 'lesson - PotPlayer' },
    resolveActions
  );
  assert.equal(resolved.mode, 'managed');
  assert.equal(resolved.resource.id, 'local');
  assert.deepEqual(resolved.position, { type: 'time', seconds: 42 });
});

test('universal resolution falls back to freeform only when no managed resource matches', () => {
  const resolved = resolveUniversalMediaSession(
    { resources: {}, sources: {} },
    null,
    { path: 'D:\\Loose\\temporary.mp4', positionSeconds: 15, title: 'temporary - PotPlayer' },
    () => ({}),
    { allowFreeform: true }
  );
  assert.equal(resolved.mode, 'freeform');
  assert.equal(resolved.resource, null);
  assert.equal(resolved.freeform.path, 'D:\\Loose\\temporary.mp4');

  assert.throws(() => resolveUniversalMediaSession(
    { resources: {}, sources: {} },
    null,
    { path: 'D:\\Loose\\temporary.mp4', positionSeconds: 15 },
    () => ({}),
    { allowFreeform: false }
  ), /没有匹配到 Go Study 资源/);
});


test('portable-name upgrade only resolves a unique managed resource across device-specific paths', () => {
  const state = {
    resources: {
      a: { id: 'a', kind: 'video', deletedAt: '' },
      b: { id: 'b', kind: 'video', deletedAt: '' }
    },
    sources: {}
  };
  const targets = {
    a: { type: 'potplayer', target: 'D:\\Courses\\lesson-17.mp4' },
    b: { type: 'potplayer', target: 'D:\\Other\\different.mp4' }
  };
  const resolve = (resource) => ({ playTarget: targets[resource.id] });
  assert.equal(matchingManagedResourceByPortableName(state, 'lesson-17.mp4', resolve)?.id, 'a');

  targets.b = { type: 'potplayer', target: 'E:\\Mirror\\lesson-17.mp4' };
  assert.equal(matchingManagedResourceByPortableName(state, 'lesson-17.mp4', resolve), null);
});
