'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'freeform-link-ui.cjs'), 'utf8');
const entry = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'entry.cjs'), 'utf8');

test('beta.17 freeform links are handled inside Go Study and avoid reserved path routing', () => {
  assert.match(source, /href\.startsWith\('obsidian:\/\/go-study'/);
  assert.match(source, /parseReferenceUri\(href\)/);
  assert.match(source, /reference\?\.mode !== 'freeform'/);
  assert.match(source, /reference\.locator/);
  assert.match(source, /plugin\?\.openFreeformReference/);
  assert.match(source, /addEventListener\('click', onClick, true\)/);
});

test('Ctrl-click opens both freeform and managed Go Study browser sources while old jv links remain compatible', () => {
  assert.match(source, /plugin\?\.browserUrlForReference/);
  assert.match(source, /browserUrlAtPosition\(web, reference\.position\)/);
  assert.match(source, /href\.startsWith\('jv:\/\/open\?'/);
  assert.match(source, /shellImpl\.openExternal\(web\)/);
});

test('runtime upgrades freeform to managed before platform fallback', () => {
  assert.match(entry, /matchingManagedResourceByPortableName/);
  assert.match(entry, /openPortableFreeformReference/);
  assert.match(entry, /resourceId:\s*portableManaged\.id/);
});


const {
  bilibiliUrlAtPosition,
  browserUrlAtPosition
} = require('../src/freeform-link-ui.cjs');

test('Bilibili browser adapter preserves multi-P and adds captured seconds', () => {
  assert.equal(
    bilibiliUrlAtPosition('https://www.bilibili.com/video/BV1TEST?p=2', { type: 'time', seconds: 65.9 }),
    'https://www.bilibili.com/video/BV1TEST?p=2&t=65'
  );
  assert.equal(
    bilibiliUrlAtPosition('https://www.bilibili.com/video/BV1TEST?t=3', { type: 'time', seconds: 90 }),
    'https://www.bilibili.com/video/BV1TEST?t=90'
  );
});

test('non-Bilibili Ctrl-click browser fallback stays unchanged', () => {
  assert.equal(
    browserUrlAtPosition('https://example.com/video?id=1', { type: 'time', seconds: 65 }),
    'https://example.com/video?id=1'
  );
});
