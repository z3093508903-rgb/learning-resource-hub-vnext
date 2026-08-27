'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BUILTIN_LAYOUTS,
  applyCompanionLayout,
  builtinGeometry,
  clampGeometry,
  companionWindowState,
  listCompanionLayouts,
  normalizeCompanionScale,
  openCompanionNoteWindow,
  saveCurrentCompanionLayout
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
