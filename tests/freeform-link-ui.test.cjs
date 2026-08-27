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

test('Ctrl-click opens HTTP freeform locator in the browser while old jv links remain compatible', () => {
  assert.match(source, /httpLocator\(reference\.locator\)/);
  assert.match(source, /href\.startsWith\('jv:\/\/open\?'/);
  assert.match(source, /shellImpl\.openExternal\(web\)/);
});

test('runtime upgrades freeform to managed before platform fallback', () => {
  assert.match(entry, /matchingManagedResourceByPortableName/);
  assert.match(entry, /openPortableFreeformReference/);
  assert.match(entry, /resourceId:\s*portableManaged\.id/);
});
