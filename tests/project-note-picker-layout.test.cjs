'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'project-notes-ui.cjs'), 'utf8');

test('project note pickers keep a stable shell and scroll results internally', () => {
  assert.match(source, /go-study-picker-shell/);
  assert.match(source, /go-study-picker-body/);
  assert.match(source, /scrollbar-gutter:\s*stable/);
  assert.match(source, /height:\s*min\(680px, 84vh\)/);
  assert.match(source, /search\.addEventListener\('input'/);
});
