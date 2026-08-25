'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  projectInteractionFixCss,
  safePluginId
} = require('../src/ui-fixes.cjs');

test('project interaction fix is scoped to the active plugin view type', () => {
  const css = projectInteractionFixCss('go-study-preview');
  assert.match(css, /data-type="go-study-preview-workbench"/);
  assert.doesNotMatch(css, /data-type="learning-resource-hub-next-workbench"/);
});

test('wide project board cannot intercept heading clicks outside real cards', () => {
  const css = projectInteractionFixCss('go-study-preview');
  assert.match(css, /\.rh-next-project-heading \{[\s\S]*z-index: 4;[\s\S]*pointer-events: auto;/);
  assert.match(css, /\.rh-next-project-board \{[\s\S]*pointer-events: none;/);
  assert.match(css, /\.rh-next-project-board-item \{[\s\S]*pointer-events: auto;/);
  assert.match(css, /\.is-layout-dragging \.rh-next-project-board-slot \{[\s\S]*pointer-events: auto;/);
});

test('plugin IDs used in CSS scope are validated', () => {
  assert.equal(safePluginId('go-study-preview'), 'go-study-preview');
  assert.throws(() => safePluginId('go-study-preview"] *'), /安全的 UI 修复作用域/);
});
