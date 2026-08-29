'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  localVideoAllowed,
  locatorKind,
  openPortableFreeformReference
} = require('../src/freeform-playback.cjs');

test('portable locator classification recognizes Windows, POSIX and web forms', () => {
  assert.equal(locatorKind('D:\\Course\\lesson.mp4'), 'windows-local');
  assert.equal(locatorKind('\\\\NAS\\Course\\lesson.mp4'), 'windows-local');
  assert.equal(locatorKind('/Users/zl/Course/lesson.mp4'), 'posix-local');
  assert.equal(locatorKind('https://example.com/lesson.mp4'), 'web');
  assert.equal(localVideoAllowed('/Users/zl/Course/lesson.mp4'), true);
  assert.equal(localVideoAllowed('/Users/zl/Course/not-video.exe'), false);
});

test('Windows Freeform playback uses native PotPlayer launcher instead of jv protocol', async () => {
  const calls = [];
  const result = await openPortableFreeformReference({
    locator: 'D:\\Course\\lesson.mp4',
    position: { type: 'time', seconds: 18 }
  }, {
    platform: 'win32',
    launchPotPlayerTarget: async (target, position) => {
      calls.push({ target, position });
      return { transport: 'native-potplayer-cli', positionApplied: true };
    }
  });
  assert.equal(result.transport, 'native-potplayer-cli');
  assert.equal(result.positionApplied, true);
  assert.deepEqual(calls, [{
    target: 'D:\\Course\\lesson.mp4',
    position: { type: 'time', seconds: 18 }
  }]);
});

test('Windows Freeform web playback uses the same native launcher and preserves source URL', async () => {
  const calls = [];
  const result = await openPortableFreeformReference({
    locator: 'https://www.bilibili.com/video/BV1TEST?p=2',
    position: { type: 'time', seconds: 65.5 }
  }, {
    platform: 'win32',
    launchPotPlayerTarget: async (target, position) => {
      calls.push({ target, position });
      return { transport: 'native-potplayer-cli', positionApplied: true };
    }
  });
  assert.equal(result.transport, 'native-potplayer-cli');
  assert.equal(calls[0].target, 'https://www.bilibili.com/video/BV1TEST?p=2');
  assert.equal(calls[0].position.seconds, 65.5);
});

test('macOS/Linux local fallback opens only POSIX video paths and refuses foreign Windows paths', async () => {
  const opened = [];
  const result = await openPortableFreeformReference({
    locator: '/Users/zl/Course/lesson.mp4',
    position: { type: 'time', seconds: 18 }
  }, {
    platform: 'darwin',
    shell: { openExternal: async () => {}, openPath: async (p) => { opened.push(p); return ''; } }
  });
  assert.equal(result.transport, 'system-player');
  assert.equal(result.positionApplied, false);
  assert.deepEqual(opened, ['/Users/zl/Course/lesson.mp4']);

  await assert.rejects(
    () => openPortableFreeformReference({
      locator: 'D:\\Course\\lesson.mp4',
      position: { type: 'time', seconds: 18 }
    }, {
      platform: 'darwin',
      shell: { openExternal: async () => {}, openPath: async () => '' }
    }),
    /来自 Windows/
  );
});

test('non-Windows web fallback stays cross-platform and does not require jv registration', async () => {
  const opened = [];
  const result = await openPortableFreeformReference({
    locator: 'https://example.com/video.mp4',
    position: { type: 'time', seconds: 18 }
  }, {
    platform: 'darwin',
    shell: { openExternal: async (uri) => opened.push(uri), openPath: async () => '' }
  });
  assert.equal(result.transport, 'browser');
  assert.equal(result.positionApplied, false);
  assert.deepEqual(opened, ['https://example.com/video.mp4']);
});
