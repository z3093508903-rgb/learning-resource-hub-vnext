'use strict';

const { shell } = require('electron');
const { parseReferenceUri } = require('./resource-reference.cjs');

function installFreeformBrowserModifier(plugin, doc = globalThis.document, options = {}) {
  if (!doc?.addEventListener) return null;
  const shellImpl = options.shell || shell;
  const onClick = (event) => {
    if (!event?.ctrlKey) return;
    const target = event.target?.closest?.('a[href]');
    if (!target) return;
    const href = String(target.getAttribute?.('href') || target.href || '');
    if (!href.startsWith('obsidian://go-study')) return;
    let reference;
    try { reference = parseReferenceUri(href); } catch { return; }
    if (reference?.mode !== 'freeform' || !reference.web) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    void shellImpl.openExternal(reference.web);
  };
  doc.addEventListener('click', onClick, true);
  plugin?.register?.(() => doc.removeEventListener?.('click', onClick, true));
  return { onClick };
}

module.exports = {
  installFreeformBrowserModifier
};
