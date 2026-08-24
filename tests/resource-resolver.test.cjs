'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatPotPlayerTime,
  requireReferenceResource,
  resolveReferencePlayback,
  updateResumePosition
} = require('../src/resource-resolver.cjs');

test('reference playback resolves by durable Resource ID, not locator path', () => {
  const state = {
    resources: {
      'resource-1': {
        id: 'resource-1',
        title: '高等数学 第17课',
        locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/新目录/17.mp4' }
      }
    }
  };
  const result = resolveReferencePlayback(
    state,
    { resourceId: 'resource-1', position: { type: 'time', seconds: 5076 } },
    (resource) => ({ playTarget: { type: 'openlist', sourceId: resource.locator.sourceId, remotePath: resource.locator.remotePath } })
  );

  assert.equal(result.resource.id, 'resource-1');
  assert.equal(result.playTarget.remotePath, '/新目录/17.mp4');
  assert.equal(result.playerTime, '01:24:36');
});

test('missing and deleted resources fail closed', () => {
  assert.throws(() => requireReferenceResource({ resources: {} }, 'missing'), /找不到/);
  assert.throws(
    () => requireReferenceResource({ resources: { r1: { id: 'r1', deletedAt: '2026-08-24T00:00:00Z' } } }, 'r1'),
    /找不到/
  );
});

test('resources without a playable action do not fall back to arbitrary URLs', () => {
  assert.throws(
    () => resolveReferencePlayback(
      { resources: { r1: { id: 'r1', title: 'PDF' } } },
      { resourceId: 'r1', position: { type: 'time', seconds: 10 } },
      () => ({ webTarget: 'https://example.com' })
    ),
    /没有可用的视频播放方式/
  );
});

test('PotPlayer time formatting uses stable HH:MM:SS and floors sub-second positions', () => {
  assert.equal(formatPotPlayerTime({ type: 'time', seconds: 0 }), '00:00:00');
  assert.equal(formatPotPlayerTime({ type: 'time', seconds: 65.9 }), '00:01:05');
  assert.equal(formatPotPlayerTime({ type: 'time', seconds: 5076 }), '01:24:36');
  assert.equal(formatPotPlayerTime({ type: 'time', seconds: 100 * 3600 + 2 }), '100:00:02');
});

test('resume updates use the same generic time position and preserve unrelated resume fields', () => {
  const resource = { id: 'r1', resume: { note: 'keep-me' } };
  const resume = updateResumePosition(resource, { type: 'time', seconds: 5076.5 }, new Date('2026-08-24T12:00:00Z'));

  assert.deepEqual(resume, {
    note: 'keep-me',
    position: { type: 'time', seconds: 5076.5 },
    updatedAt: '2026-08-24T12:00:00.000Z'
  });
  assert.equal(resource.lastPosition, 5076.5);
});

test('invalid playback positions are rejected instead of coerced', () => {
  for (const position of [null, { type: 'page', page: 1 }, { type: 'time', seconds: -1 }, { type: 'time', seconds: Infinity }]) {
    assert.throws(() => formatPotPlayerTime(position), /(时间位置|播放时间)/);
  }
});
