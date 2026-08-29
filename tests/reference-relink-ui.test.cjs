'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entry = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'entry.cjs'), 'utf8');
const ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'reference-relink-ui.cjs'), 'utf8');

test('legacy missing backlinks offer one-time relink and persist Resource alias', () => {
  assert.match(entry, /chooseReferenceRelinkResource\(this, reference\)/);
  assert.match(entry, /referenceAliases\[String\(reference\.resourceId/);
  assert.match(entry, /return this\.openResourceReference\(reference\)/);
  assert.match(ui, /重新关联旧时间戳/);
  assert.match(ui, /关联并打开/);
  assert.match(ui, /请先重新收录对应资源/);
});
