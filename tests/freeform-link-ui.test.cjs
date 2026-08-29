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

test('Ctrl-click opens both freeform and managed Go Study browser sources while old jv links remain compatible', () => {
  assert.match(source, /plugin\?\.browserUrlForReference/);
  assert.match(source, /browserUrlAtPosition\(web, reference\.position\)/);
  assert.match(source, /href\.startsWith\('jv:\/\/open\?'/);
  assert.match(source, /parseLegacyJvUri\(href\)/);
  assert.match(source, /legacyJvCompatibilityEnabled\(plugin\)/);
});

test('runtime upgrades freeform to managed before platform fallback', () => {
  assert.match(entry, /matchingManagedResourceByPortableName/);
  assert.match(entry, /openPortableFreeformReference/);
  assert.match(entry, /resourceId:\s*portableManaged\.id/);
  assert.match(entry, /browserModifierActive\(this\)/);
  assert.match(entry, /openReferenceInBrowser/);
});


const {
  bilibiliUrlAtPosition,
  browserUrlAtPosition,
  browserModifierActive,
  installFreeformBrowserModifier,
  makeReferenceClickHandler
} = require('../src/freeform-link-ui.cjs');
const { buildFreeformReferenceUri } = require('../src/resource-reference.cjs');

test('Bilibili browser adapter preserves multi-P and adds captured seconds', () => {
  assert.equal(
    bilibiliUrlAtPosition('https://www.bilibili.com/video/BV1TEST?p=2', { type: 'time', seconds: 65.9 }),
    'https://www.bilibili.com/video/BV1TEST?p=2&t=65'
  );
  assert.equal(
    bilibiliUrlAtPosition('https://www.bilibili.com/video/BV1TEST?t=3', { type: 'time', seconds: 90 }),
    'https://www.bilibili.com/video/BV1TEST?t=90'
  );
});

test('non-Bilibili Ctrl-click browser fallback stays unchanged', () => {
  assert.equal(
    browserUrlAtPosition('https://example.com/video?id=1', { type: 'time', seconds: 65 }),
    'https://example.com/video?id=1'
  );
});


test('Ctrl-click browser modifier binds both main Obsidian document and Companion popout document', async () => {
  const handlers = new Map();
  const fakeDoc = () => ({
    addEventListener(type, handler) { if (type === 'click') handlers.set(this, handler); },
    removeEventListener() {}
  });
  const mainDoc = fakeDoc();
  const companionDoc = fakeDoc();
  const leaf = { view: { containerEl: { ownerDocument: companionDoc } } };
  const opened = [];
  const plugin = {
    app: {
      workspace: {
        activeLeaf: leaf,
        getLeavesOfType() { return [leaf]; },
        on() { return null; }
      }
    },
    register() {}
  };
  const controller = installFreeformBrowserModifier(plugin, mainDoc, {
    shell: { async openExternal(url) { opened.push(url); } }
  });
  assert.equal(controller.bound.size, 2);

  const href = buildFreeformReferenceUri({
    locator: 'https://www.bilibili.com/video/BV1xJ38z3EkX',
    web: 'https://www.bilibili.com/video/BV1xJ38z3EkX',
    position: { type: 'time', seconds: 12.244 }
  });
  const handler = handlers.get(companionDoc);
  handler({
    ctrlKey: true,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
    target: {
      closest() {
        return {
          getAttribute(name) { return name === 'href' ? href : ''; },
          href
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened[0], 'https://www.bilibili.com/video/BV1xJ38z3EkX?t=12');
});

test('Command modifier accepts Meta on macOS-style clicks too', () => {
  const sourceText = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'freeform-link-ui.cjs'), 'utf8');
  assert.match(sourceText, /event\?\.ctrlKey \|\| event\?\.metaKey/);
});


test('legacy JV normal click is intercepted only when compatibility is enabled', async () => {
  const opened = [];
  const href = 'jv://open?path=' + encodeURIComponent('D:\\Course\\lesson.mp4') + '&time=00%3A00%3A18';
  const target = {
    closest() {
      return {
        getAttribute(name) { return name === 'href' ? href : ''; },
        href
      };
    }
  };

  let prevented = 0;
  const disabledPlugin = {
    state: { uiState: { legacyJvCompatibilityEnabled: false } },
    async openFreeformReference(reference) { opened.push(reference); }
  };
  makeReferenceClickHandler(disabledPlugin, { openExternal: async () => {} })({
    target,
    ctrlKey: false,
    preventDefault() { prevented += 1; },
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
  assert.equal(prevented, 0);
  assert.equal(opened.length, 0);

  const enabledPlugin = {
    state: { uiState: { legacyJvCompatibilityEnabled: true } },
    async openFreeformReference(reference) { opened.push(reference); }
  };
  makeReferenceClickHandler(enabledPlugin, { openExternal: async () => {} })({
    target,
    ctrlKey: false,
    preventDefault() { prevented += 1; },
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prevented, 1);
  assert.equal(opened[0].locator, 'D:\\Course\\lesson.mp4');
  assert.equal(opened[0].position.seconds, 18);
});

test('legacy JV Ctrl-click opens Bilibili browser source at captured time', async () => {
  const opened = [];
  const href = 'jv://open?path=' + encodeURIComponent('https://www.bilibili.com/video/BV1TEST?p=3') + '&time=00%3A01%3A05';
  makeReferenceClickHandler(
    { state: { uiState: { legacyJvCompatibilityEnabled: true } } },
    { async openExternal(url) { opened.push(url); } }
  )({
    target: {
      closest() {
        return {
          getAttribute(name) { return name === 'href' ? href : ''; },
          href
        };
      }
    },
    ctrlKey: true,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened[0], 'https://www.bilibili.com/video/BV1TEST?p=3&t=65');
});

test('protocol-level modifier fallback survives keyup race briefly', () => {
  const plugin = {
    _goStudyBrowserModifier: {
      modifierState: { ctrl: false, meta: false, lastPressedAt: 1000 }
    }
  };
  assert.equal(browserModifierActive(plugin, 1500), true);
  assert.equal(browserModifierActive(plugin, 1800), false);
});


test('Ctrl click state is remembered even when Obsidian click target is not a standard anchor', () => {
  let clickHandler = null;
  const doc = {
    addEventListener(type, handler) { if (type === 'click') clickHandler = handler; },
    removeEventListener() {}
  };
  const plugin = {
    app: { workspace: { getLeavesOfType() { return []; }, on() { return null; } } },
    register() {}
  };
  installFreeformBrowserModifier(plugin, doc, {
    shell: { async openExternal() {} }
  });
  clickHandler({
    ctrlKey: true,
    metaKey: false,
    target: { closest() { return null; } }
  });
  assert.equal(browserModifierActive(plugin), true);
});
