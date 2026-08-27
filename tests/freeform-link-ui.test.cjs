'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'freeform-link-ui.cjs'), 'utf8');
const entry = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'entry.cjs'), 'utf8');

test('freeform web links reserve Ctrl-click for browser as an explicit experiment', () => {
  assert.match(source, /event\?\.ctrlKey/);
  assert.match(source, /reference\?\.mode !== 'freeform'/);
  assert.match(source, /shellImpl\.openExternal\(reference\.web\)/);
  assert.match(source, /addEventListener\('click', onClick, true\)/);
});

test('ordinary freeform protocol activation reopens PotPlayer and upgrades to managed resource when possible', () => {
  assert.match(entry, /openFreeformReference/);
  assert.match(entry, /matchingManagedResource/);
  assert.match(entry, /this\.toPotPlayerUri\(reference\.path, playerTime\)/);
  assert.match(entry, /resourceId:\s*managed\.id/);
});
