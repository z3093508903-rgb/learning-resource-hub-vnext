'use strict';

const { shell } = require('electron');
const { parseReferenceUri } = require('./resource-reference.cjs');

function stopLinkEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function jvWebLocator(rawUri) {
  let uri;
  try { uri = new URL(String(rawUri || '').trim()); } catch { return ''; }
  if (uri.protocol !== 'jv:' || uri.hostname !== 'open') return '';
  const locator = String(uri.searchParams.get('path') || '').trim();
  if (!locator) return '';
  try {
    const web = new URL(locator);
    return web.protocol === 'http:' || web.protocol === 'https:' ? web.toString() : '';
  } catch { return ''; }
}

function installFreeformBrowserModifier(plugin, doc = globalThis.document, options = {}) {
  if (!doc?.addEventListener) return null;
  const shellImpl = options.shell || shell;
  const onClick = (event) => {
    const target = event?.target?.closest?.('a[href]');
    if (!target) return;
    const href = String(target.getAttribute?.('href') || target.href || '');

    if (href.startsWith('jv://open?')) {
      if (!event?.ctrlKey) return;
      const web = jvWebLocator(href);
      if (!web) return;
      stopLinkEvent(event);
      void shellImpl.openExternal(web);
      return;
    }

    if (!href.startsWith('obsidian://go-study')) return;
    let reference;
    try { reference = parseReferenceUri(href); } catch { return; }
    if (reference?.mode !== 'freeform') return;

    stopLinkEvent(event);
    if (event?.ctrlKey && reference.web) {
      void shellImpl.openExternal(reference.web);
      return;
    }
    if (typeof plugin?.openFreeformReference === 'function') {
      void Promise.resolve(plugin.openFreeformReference(reference)).catch(() => {});
    }
  };
  doc.addEventListener('click', onClick, true);
  plugin?.register?.(() => doc.removeEventListener?.('click', onClick, true));
  return { onClick };
}

module.exports = {
  installFreeformBrowserModifier,
  jvWebLocator,
  stopLinkEvent
};
