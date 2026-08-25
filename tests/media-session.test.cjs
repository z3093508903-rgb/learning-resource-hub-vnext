'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLocalMediaPath,
  openListMediaMatches,
  resolveActiveMediaSession,
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
