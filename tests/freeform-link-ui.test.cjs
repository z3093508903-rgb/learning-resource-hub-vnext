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
  assert.match(source, /shellImpl\.openExternal\(web\)/);
});

test('runtime upgrades freeform to managed before platform fallback', () => {
  assert.match(entry, /matchingManagedResourceByPortableName/);
  assert.match(entry, /openPortableFreeformReference/);
  assert.match(entry, /resourceId:\s*portableManaged\.id/);
});


const {
  bilibiliUrlAtPosition,
  browserUrlAtPosition,
  installFreeformBrowserModifier
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
