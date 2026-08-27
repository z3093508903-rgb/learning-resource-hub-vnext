'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'freeform-link-ui.cjs'), 'utf8');
const entry = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'entry.cjs'), 'utf8');

test('new freeform links use jv and keep Ctrl-click browser behavior for web locators', () => {
  assert.match(source, /href\.startsWith\('jv:\/\/open\?'/);
  assert.match(source, /jvWebLocator/);
  assert.match(source, /shellImpl\.openExternal\(web\)/);
});

test('legacy beta.15 obsidian freeform links are intercepted before default routing', () => {
  assert.match(source, /href\.startsWith\('obsidian:\/\/go-study'/);
  assert.match(source, /parseReferenceUri\(href\)/);
  assert.match(source, /reference\?\.mode !== 'freeform'/);
  assert.match(source, /stopLinkEvent\(event\)/);
  assert.match(source, /plugin\?\.openFreeformReference/);
  assert.match(source, /addEventListener\('click', onClick, true\)/);
});

test('managed backlink runtime remains Resource ID based', () => {
  assert.match(entry, /resolveReferencePlayback/);
  assert.match(entry, /resourceId:\s*managed\.id/);
});
