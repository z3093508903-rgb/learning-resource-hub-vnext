'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');

test('Go Study modal theme variables exist outside the workbench in light mode', () => {
  assert.match(css, /\.modal\.rh-next-modal\s*\{[\s\S]*--rh-accent:\s*var\(--interactive-accent\)/);
  assert.match(css, /\.modal\.rh-next-modal\s*\{[\s\S]*color:\s*var\(--text-normal\)/);
  assert.match(css, /\.modal\.rh-next-modal \.rh-next-button\.is-primary[\s\S]*background:\s*var\(--interactive-accent\)/);
  assert.match(css, /\.modal\.rh-next-modal \.rh-next-input[\s\S]*color:\s*var\(--text-normal\)/);
});
