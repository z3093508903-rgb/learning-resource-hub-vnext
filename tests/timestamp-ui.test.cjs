'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
const settingsSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'product-settings.cjs'), 'utf8');

test('Go Study timestamps ship with a compact capsule style', () => {
  assert.match(css, /compact timestamp capsule/);
  assert.match(css, /a\[href\^="obsidian:\/\/go-study"\]/);
  assert.match(css, /border-radius:\s*0\.46em/);
  assert.match(css, /background-image:\s*none !important/);
});

test('timestamp-only default contains no instructional label or video title', () => {
  assert.match(settingsSource, /backlinkTemplate:\s*'\[\{time\}\]\(\{uri\}\)'/);
});
