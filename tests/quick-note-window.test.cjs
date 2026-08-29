'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadModule() {
  class Modal {}
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'obsidian') return { Modal };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '..', 'src', 'quick-note-window.cjs');
  delete require.cache[modulePath];
  try { return require(modulePath); }
  finally { Module._load = originalLoad; }
}

test('quick note title payload round-trips UTF-8 note text', () => {
  const { decodeTitlePayload, encodeTitlePayload } = loadModule();
  const encoded = encodeTitlePayload('GO_STUDY_SUBMIT', '这一段很重要');
  assert.equal(decodeTitlePayload(encoded, 'GO_STUDY_SUBMIT'), '这一段很重要');
});

test('quick note HTML uses Enter submit, Shift+Enter newline and Escape cancel', () => {
  const { promptHtml } = loadModule();
  const html = promptHtml({ title: '快速笔记' });
  assert.match(html, /event\.key==='Enter'&&!event\.shiftKey/);
  assert.match(html, /event\.key==='Escape'/);
  assert.match(html, /GO_STUDY_SUBMIT/);
  assert.match(html, /GO_STUDY_CANCEL/);
});

test('quick note BrowserWindow disables Node integration', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'quick-note-window.cjs'), 'utf8');
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /alwaysOnTop:\s*true/);
});


test('quick note popup is draggable, remembers geometry and uses a subtle scrollbar', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'quick-note-window.cjs'), 'utf8');
  assert.match(source, /-webkit-app-region:drag/);
  assert.match(source, /::-webkit-scrollbar/);
  assert.match(source, /quickNoteWindowGeometry/);
  assert.match(source, /getBounds/);
  assert.match(source, /area\.height \* 0\.36/);
});


test('quick note prompt forces a strong topmost level before taking focus', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'quick-note-window.cjs'), 'utf8');
  assert.match(source, /setAlwaysOnTop\?\.\(true, 'screen-saver'\)/);
  assert.match(source, /moveTop\?\.\(\)/);
  assert.match(source, /win\.focus\(\)/);
});
