'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  legacyJvCompatibilityEnabled,
  parseLegacyJvTime,
  parseLegacyJvUri
} = require('../src/legacy-jv.cjs');

test('legacy JV time parser supports old clock and numeric forms', () => {
  assert.equal(parseLegacyJvTime('00:01:30.500'), 90.5);
  assert.equal(parseLegacyJvTime('01:30'), 90);
  assert.equal(parseLegacyJvTime('27.716'), 27.716);
  assert.equal(parseLegacyJvTime(''), 0);
});

test('legacy jv://open becomes an internal Freeform v2 reference', () => {
  const ref = parseLegacyJvUri(
    'jv://open?path=' + encodeURIComponent('https://www.bilibili.com/video/BV1TEST?p=2') +
    '&time=' + encodeURIComponent('00:00:27.716')
  );
  assert.equal(ref.mode, 'freeform');
  assert.equal(ref.locator, 'https://www.bilibili.com/video/BV1TEST?p=2');
  assert.equal(ref.web, 'https://www.bilibili.com/video/BV1TEST?p=2');
  assert.equal(ref.position.seconds, 27.716);
  assert.equal(ref.version, 2);
});

test('legacy JV compatibility is opt-in', () => {
  assert.equal(legacyJvCompatibilityEnabled({ state: { uiState: {} } }), false);
  assert.equal(legacyJvCompatibilityEnabled({
    state: { uiState: { legacyJvCompatibilityEnabled: true } }
  }), true);
});
