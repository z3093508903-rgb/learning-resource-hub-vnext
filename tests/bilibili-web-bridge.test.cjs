'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BILIBILI_WEB_STATE_MAX_AGE_MS,
  bilibiliTimestampUrl,
  cleanBilibiliTitle,
  currentBilibiliWebState,
  isBilibiliVideoUrl,
  normalizeBilibiliWebState,
  requestBilibiliWebBridge
} = require('../src/bilibili-web-bridge.cjs');

test('Bilibili web bridge accepts only video pages and preserves multipart query', () => {
  assert.equal(isBilibiliVideoUrl('https://www.bilibili.com/video/BV1o9R9B7Ecw?p=2'), true);
  assert.equal(isBilibiliVideoUrl('https://www.bilibili.com/read/cv1'), false);
  assert.equal(isBilibiliVideoUrl('https://evil.example.com/video/BV1'), false);
  assert.equal(
    bilibiliTimestampUrl('https://www.bilibili.com/video/BV1o9R9B7Ecw?p=2&t=1', 69.4),
    'https://www.bilibili.com/video/BV1o9R9B7Ecw?p=2&t=69.4'
  );
});

test('web bridge state keeps exact playback time and strips Bilibili title suffix', () => {
  const state = normalizeBilibiliWebState({
    url: 'https://www.bilibili.com/video/BV1o9R9B7Ecw?t=10',
    title: '摄影入门_哔哩哔哩_bilibili',
    currentTime: 69.4123,
    duration: 300,
    paused: false,
    visible: true,
    focused: true
  }, 1000);
  assert.equal(state.url, 'https://www.bilibili.com/video/BV1o9R9B7Ecw');
  assert.equal(state.positionSeconds, 69.412);
  assert.equal(cleanBilibiliTitle('摄影入门_哔哩哔哩_bilibili'), '摄影入门');
  assert.equal(state.receivedAt, 1000);
});

test('web bridge accepts the active Bilibili tab even when Companion owns OS focus', async () => {
  const plugin = {
    _goStudyBilibiliWebState: normalizeBilibiliWebState({
      url: 'https://www.bilibili.com/video/BV1TEST?p=3',
      title: '课程',
      currentTime: 88.25,
      visible: true,
      focused: false,
      activeTab: true,
      tabId: 17,
      windowId: 3
    }, 1000)
  };
  const response = await requestBilibiliWebBridge(plugin, 'current', { now: 1200 });
  assert.equal(response.transport, 'bilibili-web');
  assert.equal(response.media.source, 'bilibili-web');
  assert.equal(response.media.positionSeconds, 88.25);
  assert.equal(response.media.path, 'https://www.bilibili.com/video/BV1TEST?p=3');
  assert.equal(plugin._goStudyBilibiliWebState.focused, false);
  assert.equal(plugin._goStudyBilibiliWebState.activeTab, true);

  assert.throws(
    () => currentBilibiliWebState(plugin, { now: 1000 + BILIBILI_WEB_STATE_MAX_AGE_MS + 1 }),
    /超时/
  );

  plugin._goStudyBilibiliWebState = {
    ...plugin._goStudyBilibiliWebState,
    receivedAt: 2000,
    activeTab: false
  };
  assert.throws(() => currentBilibiliWebState(plugin, { now: 2100 }), /不是活动视频标签页/);
});

test('web bridge deliberately refuses screenshot/control actions', async () => {
  const plugin = {};
  await assert.rejects(
    () => requestBilibiliWebBridge(plugin, 'capture'),
    /只支持读取当前位置/
  );
});


test('browser extension background reports tab activity separately from document focus', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'browser-extension', 'bilibili-bridge', 'background.js'), 'utf8');
  assert.match(source, /activeTab:\s*Boolean\(sender\?\.tab\?\.active\)/);
  assert.match(source, /tabId/);
  assert.match(source, /windowId/);
});
