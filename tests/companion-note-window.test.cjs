'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BUILTIN_LAYOUTS,
  applyCompanionLayout,
  builtinGeometry,
  clampGeometry,
  companionWindowState,
  listCompanionLayouts,
  normalizeCompanionScale,
  openCompanionNoteWindow,
  revealCompanionEditorCursor,
  scheduleCompanionEditorCursorReveal,
  saveCurrentCompanionLayout,
  setCompanionAlwaysOnTop
} = require('../src/companion-note-window.cjs');

function fakeClassList() {
  const values = new Set();
  return {
    add(...items) { for (const item of items) values.add(item); },
    has(item) { return values.has(item); }
  };
}

function fakeWindow() {
  const documentElement = {
    classList: fakeClassList(),
    style: { values: {}, setProperty(key, value) { this.values[key] = value; } }
  };
  const body = { classList: fakeClassList() };
  const win = {
    closed: false,
    screenX: 1260,
    screenY: 70,
    outerWidth: 330,
    outerHeight: 720,
    document: { documentElement, body },
    resizeTo(width, height) { this.outerWidth = width; this.outerHeight = height; },
    moveTo(x, y) { this.screenX = x; this.screenY = y; },
    focus() {},
    addEventListener() {},
    removeEventListener() {},
    setInterval() { return null; },
    clearInterval() {},
    close() { this.closed = true; }
  };
  return win;
}

function pluginFixture() {
  const editor = { replaceSelection() {} };
  const file = { path: 'Notes/Course.md', extension: 'md' };
  const win = fakeWindow();
  const leaf = {
    view: {
      editor,
      file,
      containerEl: { ownerDocument: { defaultView: win } }
    },
    async openFile(nextFile) { this.view.file = nextFile; },
    async loadIfDeferred() {},
    detach() { win.closed = true; }
  };
  const plugin = {
    state: {
      projects: {},
      resources: {},
      projectNotes: {},
      uiState: {}
    },
    activeMediaSession: null,
    persistCount: 0,
    async persist() { this.persistCount += 1; },
    app: {
      vault: {
        getAbstractFileByPath(path) { return path === file.path ? file : null; }
      },
      workspace: {
        activeEditor: { editor, file },
        getActiveFile() { return file; },
        getLeaf(type) {
          assert.equal(type, 'window');
          return leaf;
        },
        async revealLeaf() {}
      }
    }
  };
  return { plugin, editor, file, leaf, win };
}

test('right-rail builtin is narrow, tall and right aligned', () => {
  const area = { x: 0, y: 0, width: 1600, height: 900 };
  const geometry = builtinGeometry(BUILTIN_LAYOUTS['right-rail'], area);
  assert.ok(geometry.width >= 300 && geometry.width <= 380);
  assert.ok(geometry.height >= 700);
  assert.ok(geometry.x >= 1200);
  assert.ok(geometry.y >= 0);
});

test('geometry and compact scale are clamped to safe ranges', () => {
  assert.equal(normalizeCompanionScale(0.1), 0.6);
  assert.equal(normalizeCompanionScale(9), 1.2);
  assert.deepEqual(
    clampGeometry({ x: -900, y: -900, width: 9999, height: 9999 }, { x: 0, y: 0, width: 1600, height: 900 }),
    { x: 0, y: 0, width: 1600, height: 900 }
  );
});

test('companion state preserves builtins and custom layouts separately', async () => {
  const { plugin } = pluginFixture();
  const initial = companionWindowState(plugin);
  assert.equal(initial.activeLayoutId, 'right-rail');
  assert.equal(initial.locked, true);
  const layouts = listCompanionLayouts(plugin, { workArea: { x: 0, y: 0, width: 1600, height: 900 } });
  assert.ok(layouts.some((item) => item.id === 'right-rail'));
  assert.ok(layouts.some((item) => item.id === 'right-half'));

  plugin._goStudyCompanionWindow = {
    win: Object.assign(fakeWindow(), { screenX: 1200, screenY: 50, outerWidth: 350, outerHeight: 760 })
  };
  const custom = await saveCurrentCompanionLayout(plugin, '数学课');
  assert.match(custom.id, /^custom-/);
  assert.equal(custom.name, '数学课');
  assert.ok(companionWindowState(plugin).customLayouts.some((item) => item.id === custom.id));
});

test('opening companion uses a real Markdown popout leaf and locks its editor as capture target', async () => {
  const { plugin, editor, file, win } = pluginFixture();
  const result = await openCompanionNoteWindow(plugin, {
    filePath: file.path,
    workArea: { x: 0, y: 0, width: 1600, height: 900 },
    forceLayout: true
  });

  assert.equal(result.file.path, file.path);
  assert.equal(result.editor, editor);
  assert.equal(plugin._goStudyCompanionTarget.editor, editor);
  assert.equal(plugin._goStudyCompanionTarget.filePath, file.path);
  assert.equal(plugin._goStudyCompanionTarget.locked, true);
  assert.equal(win.document.body.classList.has('go-study-companion-window'), true);
  assert.equal(win.document.documentElement.classList.has('go-study-companion-document'), true);
  assert.equal(win.document.documentElement.style.values['--go-study-companion-scale'], '0.82');
});

test('applying a saved layout updates state and live window geometry', async () => {
  const { plugin, win } = pluginFixture();
  await openCompanionNoteWindow(plugin, {
    filePath: 'Notes/Course.md',
    workArea: { x: 0, y: 0, width: 1600, height: 900 },
    forceLayout: true
  });

  companionWindowState(plugin).customLayouts.push({
    id: 'custom-study',
    name: '外接屏学习',
    geometry: { x: 1000, y: 40, width: 420, height: 780 },
    scale: 0.9
  });
  const layout = await applyCompanionLayout(plugin, 'custom-study', {
    workArea: { x: 0, y: 0, width: 1600, height: 900 }
  });
  assert.equal(layout.id, 'custom-study');
  assert.equal(win.screenX, 1000);
  assert.equal(win.screenY, 40);
  assert.equal(win.outerWidth, 420);
  assert.equal(win.outerHeight, 780);
  assert.equal(companionWindowState(plugin).scale, 0.9);
});


test('companion defaults to topmost, keeps a short note-only title, and can unpin', async () => {
  const { plugin, file, win } = pluginFixture();
  const calls = [];
  const nativeWindow = {
    title: 'old title',
    getBounds() {
      return { x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight };
    },
    getTitle() { return this.title; },
    setTitle(value) { this.title = value; calls.push(['title', value]); },
    setAlwaysOnTop(value) { calls.push(['top', value]); }
  };

  const result = await openCompanionNoteWindow(plugin, {
    filePath: file.path,
    workArea: { x: 0, y: 0, width: 1600, height: 900 },
    forceLayout: true,
    nativeWindow
  });

  assert.equal(result.alwaysOnTop, true);
  assert.equal(win.document.title, 'Course');
  assert.equal(nativeWindow.title, 'Course');
  assert.ok(calls.some(([kind, value]) => kind === 'top' && value === true));

  await setCompanionAlwaysOnTop(plugin, false, { nativeWindow });
  assert.equal(plugin.state.uiState.companionNoteWindow.alwaysOnTop, false);
  assert.ok(calls.some(([kind, value]) => kind === 'top' && value === false));
});


test('Companion does not CSS-zoom CodeMirror, preserving normal mouse-to-caret hit testing', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
  const companionStart = css.indexOf('/* Go Study beta.18 Companion Note Window */');
  const timelineStart = css.indexOf('/* beta20 · optional lightweight floating timeline */', companionStart);
  const block = css.slice(companionStart, timelineStart);
  assert.match(block, /workspace-leaf-content \{[\s\S]*zoom:\s*1 !important/);
  assert.doesNotMatch(block, /zoom:\s*var\(--go-study-companion-scale\)/);
  assert.match(block, /font-size:\s*calc\(1em \* var\(--go-study-companion-scale\)\)/);
});


test('Companion open refreshes document-scoped Go Study browser modifier', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'companion-note-window.cjs'), 'utf8');
  assert.match(source, /_goStudyBrowserModifier\?\.refresh\?\.\(\)/);
});


test('Companion focuses a long Markdown note once at the end and reveals the caret after layout settles', async () => {
  const { plugin, editor, file } = pluginFixture();

  editor.cursor = { line: 0, ch: 0 };
  editor.focused = false;
  editor.scrollCalls = [];
  editor.lastLine = () => 18;
  editor.getLine = (line) => line === 18 ? '最后一行内容' : '';
  editor.setCursor = (cursor) => { editor.cursor = { ...cursor }; };
  editor.getCursor = () => ({ ...editor.cursor });
  editor.focus = () => { editor.focused = true; };
  editor.scrollIntoView = (range, center) => { editor.scrollCalls.push({ range, center }); };

  await openCompanionNoteWindow(plugin, {
    filePath: file.path,
    workArea: { x: 0, y: 0, width: 1600, height: 900 },
    forceLayout: true,
    focusAtEnd: true
  });
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(editor.cursor, { line: 18, ch: '最后一行内容'.length });
  assert.equal(editor.focused, true);
  assert.equal(editor.scrollCalls.length, 1);
});

test('scheduled Companion reveal does not fight user typing or steal focus', async () => {
  const { plugin, editor, file, leaf } = pluginFixture();
  editor.cursor = { line: 9, ch: 4 };
  editor.focusCount = 0;
  editor.scrollCalls = 0;
  editor.getCursor = () => ({ ...editor.cursor });
  editor.focus = () => { editor.focusCount += 1; };
  editor.scrollIntoView = () => { editor.scrollCalls += 1; };

  plugin._goStudyCompanionWindow = { leaf, win: fakeWindow() };
  plugin._goStudyCompanionTarget = { editor, filePath: file.path, leaf, locked: true };

  assert.equal(scheduleCompanionEditorCursorReveal(plugin, editor, { delayMs: 20 }), true);
  editor.cursor = { line: 9, ch: 5 }; // user typed before the scheduled reveal
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(editor.focusCount, 0);
  assert.equal(editor.scrollCalls, 0);

  assert.equal(revealCompanionEditorCursor(plugin, editor, { focus: false }), true);
  assert.equal(editor.focusCount, 0);
  assert.equal(editor.scrollCalls, 1);
});
