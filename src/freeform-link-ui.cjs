'use strict';

let shell = null;
try { shell = require('electron').shell; } catch {}
const { parseReferenceUri } = require('./resource-reference.cjs');

function stopLinkEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function httpLocator(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function jvWebLocator(rawUri) {
  let uri;
  try { uri = new URL(String(rawUri || '').trim()); } catch { return ''; }
  if (uri.protocol !== 'jv:' || uri.hostname !== 'open') return '';
  return httpLocator(uri.searchParams.get('path'));
}

function positionSeconds(position) {
  const seconds = Number(position?.seconds);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null;
}

function bilibiliUrlAtPosition(rawUrl, position) {
  const source = httpLocator(rawUrl);
  if (!source) return '';
  let url;
  try { url = new URL(source); } catch { return source; }
  const host = url.hostname.toLowerCase();
  const isBilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com');
  if (!isBilibili || !/^\/video\//i.test(url.pathname)) return source;
  const seconds = positionSeconds(position);
  if (seconds == null) return source;
  url.searchParams.set('t', String(seconds));
  return url.toString();
}

function browserUrlAtPosition(rawUrl, position) {
  const source = httpLocator(rawUrl);
  if (!source) return '';
  return bilibiliUrlAtPosition(source, position) || source;
}

function modifierPressed(event) {
  return Boolean(event?.ctrlKey || event?.metaKey);
}

function referenceDocuments(plugin, primaryDoc = globalThis.document) {
  const docs = new Set();
  if (primaryDoc?.addEventListener) docs.add(primaryDoc);

  const companionDoc = plugin?._goStudyCompanionWindow?.win?.document;
  if (companionDoc?.addEventListener) docs.add(companionDoc);

  const activeDoc = plugin?.app?.workspace?.activeLeaf?.view?.containerEl?.ownerDocument;
  if (activeDoc?.addEventListener) docs.add(activeDoc);

  for (const leaf of plugin?.app?.workspace?.getLeavesOfType?.('markdown') || []) {
    const doc = leaf?.view?.containerEl?.ownerDocument
      || leaf?.view?.contentEl?.ownerDocument
      || leaf?.tabHeaderEl?.ownerDocument;
    if (doc?.addEventListener) docs.add(doc);
  }
  return [...docs];
}

function makeReferenceClickHandler(plugin, shellImpl) {
  return (event) => {
    const target = event?.target?.closest?.('a[href]');
    if (!target) return;
    const href = String(target.getAttribute?.('href') || target.href || '');

    if (href.startsWith('jv://open?')) {
      if (!modifierPressed(event)) return;
      const web = jvWebLocator(href);
      if (!web) return;
      stopLinkEvent(event);
      void shellImpl.openExternal(web);
      return;
    }

    if (!href.startsWith('obsidian://go-study')) return;
    let reference;
    try { reference = parseReferenceUri(href); } catch { return; }

    if (modifierPressed(event)) {
      stopLinkEvent(event);
      const fallbackWeb = reference?.mode === 'freeform'
        ? (reference.web || httpLocator(reference.locator))
        : '';
      const resolveWeb = typeof plugin?.browserUrlForReference === 'function'
        ? Promise.resolve(plugin.browserUrlForReference(reference))
        : Promise.resolve(fallbackWeb);
      void resolveWeb.then((web) => {
        if (!web) {
          try {
            const { Notice } = require('obsidian');
            new Notice('这条 Go Study 回链没有可用的网页来源。旧版 Managed 回链如果资源数据已丢失，无法反推出原网页。', 6500);
          } catch {}
          return;
        }
        return shellImpl.openExternal(browserUrlAtPosition(web, reference.position));
      }).catch(() => {});
      return;
    }

    if (reference?.mode !== 'freeform') return;
    stopLinkEvent(event);
    if (typeof plugin?.openFreeformReference === 'function') {
      void Promise.resolve(plugin.openFreeformReference(reference)).catch(() => {});
    }
  };
}

function installFreeformBrowserModifier(plugin, doc = globalThis.document, options = {}) {
  const shellImpl = options.shell || shell;
  if (!shellImpl?.openExternal) return null;

  const bound = new Map();
  const bindDocument = (targetDoc) => {
    if (!targetDoc?.addEventListener || bound.has(targetDoc)) return null;
    const onClick = makeReferenceClickHandler(plugin, shellImpl);
    targetDoc.addEventListener('click', onClick, true);
    bound.set(targetDoc, onClick);
    return onClick;
  };
  const refresh = () => {
    for (const targetDoc of referenceDocuments(plugin, doc)) bindDocument(targetDoc);
    return bound.size;
  };
  const cleanup = () => {
    for (const [targetDoc, onClick] of bound) {
      targetDoc.removeEventListener?.('click', onClick, true);
    }
    bound.clear();
    if (plugin?._goStudyBrowserModifier?.refresh === refresh) plugin._goStudyBrowserModifier = null;
  };

  refresh();
  plugin._goStudyBrowserModifier = { refresh, cleanup, bound };

  const workspace = plugin?.app?.workspace;
  const refs = [];
  for (const eventName of ['layout-change', 'active-leaf-change']) {
    try {
      const ref = workspace?.on?.(eventName, refresh);
      if (ref) refs.push(ref);
    } catch {}
  }
  if (refs.length && typeof plugin?.registerEvent === 'function') {
    for (const ref of refs) plugin.registerEvent(ref);
  }
  plugin?.register?.(cleanup);

  return {
    onClick: bound.get(doc) || null,
    refresh,
    cleanup,
    bound
  };
}

module.exports = {
  bilibiliUrlAtPosition,
  browserUrlAtPosition,
  httpLocator,
  installFreeformBrowserModifier,
  jvWebLocator,
  makeReferenceClickHandler,
  modifierPressed,
  referenceDocuments,
  positionSeconds,
  stopLinkEvent
};
