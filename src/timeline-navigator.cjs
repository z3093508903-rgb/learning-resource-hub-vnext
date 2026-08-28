'use strict';

const {
  parseProtocolParams,
  parseReferenceUri
} = require('./resource-reference.cjs');
const { formatPositionClock } = require('./resource-note.cjs');
const {
  matchingManagedResource,
  matchingManagedResourceByPortableName
} = require('./media-session.cjs');


function cleanSourceTitle(value) {
  const title = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!title) return '';
  return title.replace(/\s+-\s+PotPlayer\s*$/i, '').replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '').trim();
}

function extractGoStudyReferenceUris(markdown) {
  const text = String(markdown || '');
  const matches = [];
  const pattern = /obsidian:\/\/go-study\?[^)\s<>"']+/g;
  let match;
  let scannedTo = 0;
  let line = 0;
  while ((match = pattern.exec(text))) {
    const between = text.slice(scannedTo, match.index);
    line += (between.match(/\n/g) || []).length;
    matches.push({ uri: match[0], index: match.index, line });
    scannedTo = match.index;
  }
  return matches;
}

function managedSource(plugin, resource, upgradedFrom = null) {
  return {
    key: `managed:${resource.id}`,
    kind: 'managed',
    title: cleanSourceTitle(resource.title) || '学习视频',
    resourceId: resource.id,
    resource,
    upgradedFrom
  };
}

function freeformSource(reference) {
  let fallback = cleanSourceTitle(reference.title) || cleanSourceTitle(reference.name);
  if (!fallback) {
    try {
      const url = new URL(String(reference.web || reference.locator || ''));
      fallback = url.hostname;
    } catch {}
  }
  return {
    key: `freeform:${String(reference.locator || reference.web || reference.name || '').toLocaleLowerCase()}`,
    kind: 'freeform',
    title: fallback || '临时视频',
    locator: reference.locator,
    web: reference.web || ''
  };
}

function sourceForReference(plugin, reference) {
  if (!reference) return null;
  if (reference.mode !== 'freeform') {
    const resource = plugin?.state?.resources?.[reference.resourceId];
    if (!resource || resource.deletedAt) {
      return {
        key: `managed:${reference.resourceId}`,
        kind: 'managed',
        title: '已收录视频',
        resourceId: reference.resourceId,
        resource: null
      };
    }
    return managedSource(plugin, resource);
  }

  const resolveActions = (resource) => plugin?.resourceActions?.(resource) || {};
  try {
    const exact = matchingManagedResource(plugin?.state, reference.locator, resolveActions);
    const upgraded = exact || matchingManagedResourceByPortableName(plugin?.state, reference.name || '', resolveActions);
    if (upgraded) return managedSource(plugin, upgraded, reference);
  } catch {}

  return freeformSource(reference);
}

function timelineGroupsFromMarkdown(markdown, plugin, diagnostics = null) {
  return timelineGroupsFromMatches(extractGoStudyReferenceUris(markdown), plugin, diagnostics);
}

function timelineGroupsFromView(view, markdown, plugin, diagnostics = null) {
  const fromMarkdown = timelineGroupsFromMarkdown(markdown, plugin, diagnostics);
  if (timelineSummary(fromMarkdown).timestampCount) return fromMarkdown;
  return timelineGroupsFromMatches(renderedReferenceUris(view), plugin, diagnostics);
}

function timelineSummary(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return {
    sourceCount: list.length,
    timestampCount: list.reduce((sum, group) => sum + group.items.length, 0)
  };
}

function timelineSignature(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => [
      group.key,
      group.title,
      group.kind,
      ...(group.items || []).map((item) => `${item.seconds}:${item.line ?? ''}:${item.uri}`)
    ].join('|'))
    .join('||');
}

function markdownViewHost(view) {
  return view?.containerEl?.querySelector?.('.view-content')
    || view?.contentEl
    || view?.containerEl
    || null;
}

function renderedReferenceUris(view) {
  const host = markdownViewHost(view);
  const anchors = host?.querySelectorAll?.('a[href^="obsidian://go-study"]') || [];
  return [...anchors].map((anchor, index) => ({
    uri: String(anchor.getAttribute?.('href') || anchor.href || ''),
    index,
    anchor
  })).filter((entry) => entry.uri);
}

function parseTimelineReferenceUri(rawUri) {
  const raw = String(rawUri || '').trim();
  try {
    return parseReferenceUri(raw);
  } catch (strictError) {
    // Electron/Chromium custom-scheme URL parsing has differed across versions.
    // Timeline only accepts the exact Go Study query form and then delegates
    // validation to the same protocol validator used by Obsidian callbacks.
    const prefix = 'obsidian://go-study?';
    if (!raw.startsWith(prefix) || raw.includes('#')) throw strictError;
    const query = raw.slice(prefix.length);
    const params = new URLSearchParams(query);
    const source = { action: 'go-study' };
    for (const key of new Set([...params.keys()])) {
      const values = params.getAll(key);
      source[key] = values.length === 1 ? values[0] : values;
    }
    return parseProtocolParams(source);
  }
}

function timelineGroupsFromMatches(matches, plugin, diagnostics = null) {
  const groups = new Map();
  for (const match of matches || []) {
    let reference;
    try { reference = parseTimelineReferenceUri(match.uri); }
    catch (error) {
      diagnostics?.parseErrors?.push?.({
        uri: String(match.uri || '').slice(0, 240),
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
    const seconds = Number(reference?.position?.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const source = sourceForReference(plugin, reference);
    if (!source?.key) continue;
    if (!groups.has(source.key)) groups.set(source.key, { ...source, firstIndex: match.index, items: [] });
    groups.get(source.key).items.push({
      uri: match.uri,
      reference,
      seconds,
      time: formatPositionClock(reference.position),
      index: match.index,
      line: Number.isInteger(match.line) ? match.line : null,
      anchor: match.anchor || null
    });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.seconds - b.seconds || a.index - b.index)
    }))
    .sort((a, b) => a.firstIndex - b.firstIndex);
}

function markdownViewText(view) {
  try {
    const text = view?.editor?.getValue?.();
    if (typeof text === 'string') return text;
  } catch {}
  return '';
}

function pulseTimelineTarget(element) {
  if (!element?.classList) return;
  const target = element.closest?.('p, li, blockquote, .cm-line') || element;
  target.classList?.add?.('go-study-timeline-target-pulse');
  const win = target.ownerDocument?.defaultView;
  const later = win?.setTimeout || setTimeout;
  later(() => target.classList?.remove?.('go-study-timeline-target-pulse'), 900);
}

function renderedAnchorForItem(view, item) {
  if (item?.anchor?.isConnected !== false && item?.anchor?.scrollIntoView) return item.anchor;
  const host = markdownViewHost(view);
  const anchors = host?.querySelectorAll?.('a[href^="obsidian://go-study"]') || [];
  return [...anchors].find((anchor) =>
    String(anchor.getAttribute?.('href') || anchor.href || '') === String(item?.uri || '')
  ) || null;
}

function navigateTimelineItem(view, item) {
  if (!view || !item) return { transport: 'note', found: false };

  const line = Number(item.line);
  const editor = view.editor;
  if (editor && Number.isInteger(line) && line >= 0) {
    const target = { line, ch: 0 };
    try {
      editor.scrollIntoView?.({ from: target, to: target }, true);
      editor.setCursor?.(target);
      const anchor = renderedAnchorForItem(view, item);
      if (anchor) pulseTimelineTarget(anchor);
      return { transport: 'note', mode: 'editor', line, found: true };
    } catch {}
  }

  const anchor = renderedAnchorForItem(view, item);
  if (anchor) {
    try {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      pulseTimelineTarget(anchor);
      return { transport: 'note', mode: 'rendered', line: Number.isInteger(line) ? line : null, found: true };
    } catch {}
  }

  return { transport: 'note', line: Number.isInteger(line) ? line : null, found: false };
}

function timelineOwnerId(view) {
  const leafId = String(view?.leaf?.id || view?.containerEl?.dataset?.type || view?.file?.path || 'markdown');
  return leafId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120);
}

function existingTimelineForView(view) {
  const host = markdownViewHost(view);
  const doc = host?.ownerDocument || view?.containerEl?.ownerDocument;
  const owner = timelineOwnerId(view);
  return doc?.querySelector?.(`.go-study-floating-timeline[data-go-study-owner="${owner}"]`) || null;
}

function removeTimelineFromView(view) {
  const host = markdownViewHost(view);
  const doc = host?.ownerDocument || view?.containerEl?.ownerDocument;
  host?.querySelectorAll?.('.go-study-floating-timeline').forEach?.((el) => el.remove?.());
  host?.classList?.remove?.('go-study-timeline-host');
  const owner = timelineOwnerId(view);
  doc?.querySelectorAll?.(`.go-study-floating-timeline[data-go-study-owner="${owner}"]`)
    .forEach?.((el) => el.remove?.());
}

function timelineDocuments(plugin) {
  const docs = new Set();
  for (const leaf of markdownLeaves(plugin)) {
    const doc = markdownViewHost(leaf?.view)?.ownerDocument || leaf?.view?.containerEl?.ownerDocument;
    if (doc) docs.add(doc);
  }
  for (const doc of plugin?._goStudyTimelineNavigator?.observedDocs || []) docs.add(doc);
  return docs;
}

function clearTimelinesExcept(plugin, activeView = null) {
  const activeHost = markdownViewHost(activeView);
  const activeDoc = activeHost?.ownerDocument || activeView?.containerEl?.ownerDocument || null;
  const activeOwner = activeView ? timelineOwnerId(activeView) : '';
  for (const doc of timelineDocuments(plugin)) {
    for (const nav of doc?.querySelectorAll?.('.go-study-floating-timeline') || []) {
      const keep = Boolean(activeView)
        && doc === activeDoc
        && nav.dataset?.goStudyOwner === activeOwner;
      if (!keep) nav.remove?.();
    }
  }
  for (const leaf of markdownLeaves(plugin)) {
    if (leaf?.view !== activeView) markdownViewHost(leaf?.view)?.classList?.remove?.('go-study-timeline-host');
  }
}

function element(doc, tag, cls, text = '') {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function visibleRect(host) {
  try {
    const rect = host?.getBoundingClientRect?.();
    if (!rect || rect.width < 40 || rect.height < 100) return null;
    if (rect.bottom <= 0 || rect.right <= 0) return null;
    return rect;
  } catch {
    return null;
  }
}

function positionTimelineOverlay(nav, host, doc) {
  const rect = visibleRect(host);
  const viewportWidth = Number(doc?.documentElement?.clientWidth || doc?.defaultView?.innerWidth || 0);
  if (!rect || !viewportWidth) return false;
  const top = Math.max(42, rect.top + Math.max(24, rect.height * 0.1));
  const height = Math.max(220, Math.min(rect.height * 0.76, rect.height - 54));
  const right = Math.max(2, viewportWidth - rect.right + 3);
  nav.style.top = `${Math.round(top)}px`;
  nav.style.right = `${Math.round(right)}px`;
  nav.style.height = `${Math.round(height)}px`;
  return true;
}

function renderTimelineIntoView(plugin, view, groups) {
  const host = markdownViewHost(view);
  const doc = host?.ownerDocument || view?.containerEl?.ownerDocument;
  if (!host || !doc) return null;

  const summary = timelineSummary(groups);
  if (!summary.timestampCount) {
    removeTimelineFromView(view);
    return null;
  }

  const signature = timelineSignature(groups);
  const existing = existingTimelineForView(view);
  if (existing?.dataset?.goStudyTimelineSignature === signature) {
    positionTimelineOverlay(existing, host, doc);
    return existing;
  }

  removeTimelineFromView(view);
  host.classList?.add?.('go-study-timeline-host');
  const nav = element(doc, 'div', 'go-study-floating-timeline');
  nav.dataset.goStudyOwner = timelineOwnerId(view);
  nav.dataset.goStudyTimelineSignature = signature;
  nav.setAttribute('aria-label', `Go Study 悬浮时间线 · ${summary.sourceCount} 个来源 · ${summary.timestampCount} 个时间点`);
  nav.setAttribute('data-go-study-timeline-ready', 'true');

  const rail = element(doc, 'div', 'go-study-timeline-rail');
  const flattened = groups.flatMap((group) => group.items.map((item) => ({ group, item })));
  flattened.slice(0, 18).forEach(({ group }, index) => {
    const node = element(doc, 'span', 'go-study-timeline-node');
    node.style.setProperty('--go-study-node-y', `${((index + 1) / (Math.min(flattened.length, 18) + 1)) * 100}%`);
    node.dataset.sourceKind = group.kind;
    rail.appendChild(node);
  });
  nav.appendChild(rail);

  const hover = element(doc, 'div', 'go-study-timeline-hover');
  const head = element(doc, 'div', 'go-study-timeline-head');
  head.appendChild(element(doc, 'span', 'go-study-timeline-title', '悬浮时间线'));
  head.appendChild(element(doc, 'span', 'go-study-timeline-count', `${summary.sourceCount} · ${summary.timestampCount}`));
  hover.appendChild(head);

  for (const group of groups.slice(0, 8)) {
    const groupEl = element(doc, 'div', 'go-study-timeline-group');
    const groupHead = element(doc, 'div', 'go-study-timeline-group-head');
    groupHead.appendChild(element(doc, 'span', 'go-study-timeline-source', group.title));
    groupHead.appendChild(element(doc, 'span', 'go-study-timeline-source-count', String(group.items.length)));
    groupEl.appendChild(groupHead);

    const items = element(doc, 'div', 'go-study-timeline-items');
    for (const item of group.items.slice(0, 14)) {
      const button = element(doc, 'button', 'go-study-timeline-item', item.time);
      button.type = 'button';
      button.title = `${group.title} · ${item.time} · 定位到笔记`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        navigateTimelineItem(view, item);
      });
      items.appendChild(button);
    }
    if (group.items.length > 14) items.appendChild(element(doc, 'span', 'go-study-timeline-more', `+${group.items.length - 14}`));
    groupEl.appendChild(items);
    hover.appendChild(groupEl);
  }

  const hint = element(doc, 'div', 'go-study-timeline-hint', '点击定位到笔记');
  hover.appendChild(hint);
  nav.appendChild(hover);

  // Mount to the owning window document rather than inside CodeMirror/preview.
  // This avoids Obsidian view overflow/stacking contexts hiding the rail.
  const mount = doc.body || host;
  mount.appendChild(nav);
  if (!positionTimelineOverlay(nav, host, doc)) {
    nav.remove?.();
    return null;
  }
  return nav;
}

async function markdownTextForView(plugin, view) {
  const editorText = markdownViewText(view);
  if (editorText) return editorText;
  const file = view?.file;
  if (!file) return '';
  try { return await plugin?.app?.vault?.cachedRead?.(file) || ''; }
  catch { return ''; }
}

async function refreshTimelineView(plugin, view) {
  const enabled = Boolean(plugin?.state?.uiState?.videoEnhancementEnabled)
    && Boolean(plugin?.state?.uiState?.timelineNavigatorEnabled);
  if (!enabled) {
    removeTimelineFromView(view);
    return [];
  }
  const markdown = await markdownTextForView(plugin, view);
  const groups = timelineGroupsFromView(view, markdown, plugin);
  renderTimelineIntoView(plugin, view, groups);
  return groups;
}

function isMarkdownView(view) {
  if (!view) return false;
  try {
    if (view.getViewType?.() === 'markdown') return true;
  } catch {}
  return String(view?.file?.extension || '').toLowerCase() === 'md';
}

function markdownLeaves(plugin) {
  const workspace = plugin?.app?.workspace;
  const leaves = [];
  try {
    for (const leaf of workspace?.getLeavesOfType?.('markdown') || []) {
      if (leaf && !leaves.includes(leaf)) leaves.push(leaf);
    }
  } catch {}
  const activeLeaf = workspace?.activeLeaf;
  if (activeLeaf && isMarkdownView(activeLeaf.view) && !leaves.includes(activeLeaf)) leaves.unshift(activeLeaf);
  return leaves;
}

function activeMarkdownView(plugin) {
  const view = plugin?.app?.workspace?.activeLeaf?.view || null;
  return isMarkdownView(view) ? view : null;
}

async function refreshTimelineNavigator(plugin) {
  const view = activeMarkdownView(plugin);
  clearTimelinesExcept(plugin, view);
  if (!view) return [];
  return [await refreshTimelineView(plugin, view)];
}

async function diagnoseTimelineNavigator(plugin) {
  const settings = plugin?.state?.uiState || {};
  const view = activeMarkdownView(plugin);
  const host = markdownViewHost(view);
  const doc = host?.ownerDocument || view?.containerEl?.ownerDocument || null;
  const markdown = view ? await markdownTextForView(plugin, view) : '';
  const rawMatches = extractGoStudyReferenceUris(markdown);
  const renderedMatches = view ? renderedReferenceUris(view) : [];
  const parserDiagnostics = { parseErrors: [] };
  const groups = view ? timelineGroupsFromView(view, markdown, plugin, parserDiagnostics) : [];
  let mounted = 0;
  clearTimelinesExcept(plugin, view);
  if (view && settings.videoEnhancementEnabled && settings.timelineNavigatorEnabled) {
    renderTimelineIntoView(plugin, view, groups);
    const owner = timelineOwnerId(view);
    mounted = doc?.querySelectorAll?.(`.go-study-floating-timeline[data-go-study-owner="${owner}"]`)?.length || 0;
  }
  const rect = visibleRect(host);
  return {
    videoEnhancementEnabled: Boolean(settings.videoEnhancementEnabled),
    timelineNavigatorEnabled: Boolean(settings.timelineNavigatorEnabled),
    activeMarkdown: Boolean(view),
    activeFile: String(view?.file?.path || ''),
    markdownLength: markdown.length,
    rawLinkCount: rawMatches.length,
    renderedLinkCount: renderedMatches.length,
    sourceCount: groups.length,
    timestampCount: timelineSummary(groups).timestampCount,
    parseErrorCount: parserDiagnostics.parseErrors.length,
    firstParseError: parserDiagnostics.parseErrors[0]?.error || '',
    firstParseErrorUri: parserDiagnostics.parseErrors[0]?.uri || '',
    hostVisible: Boolean(rect),
    hostWidth: rect ? Math.round(rect.width) : 0,
    hostHeight: rect ? Math.round(rect.height) : 0,
    viewportWidth: Number(doc?.documentElement?.clientWidth || doc?.defaultView?.innerWidth || 0),
    mounted
  };
}

function nodeIsTimelineUi(node) {
  if (!node || node.nodeType !== 1) return false;
  try {
    return node.matches?.('.go-study-floating-timeline')
      || Boolean(node.closest?.('.go-study-floating-timeline'));
  } catch {
    return false;
  }
}

function mutationOnlyTouchesTimelineUi(record) {
  if (!record) return true;
  if (nodeIsTimelineUi(record.target)) return true;
  const changed = [...(record.addedNodes || []), ...(record.removedNodes || [])]
    .filter((node) => node?.nodeType === 1);
  return changed.length > 0 && changed.every(nodeIsTimelineUi);
}

function installTimelineNavigator(plugin) {
  const manager = {
    timer: null,
    observers: [],
    observedDocs: new Set(),
    schedule(delay = 70) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void refreshTimelineNavigator(plugin);
      }, delay);
    },
    refresh() { return refreshTimelineNavigator(plugin); },
    ensureDocument(doc) {
      if (!doc?.body || this.observedDocs.has(doc)) return;
      this.observedDocs.add(doc);
      const win = doc.defaultView;
      const onViewport = () => this.schedule(0);
      try {
        win?.addEventListener?.('resize', onViewport, { passive: true });
        doc.addEventListener?.('scroll', onViewport, true);
        const Observer = win?.MutationObserver || globalThis.MutationObserver;
        const observer = Observer ? new Observer((records = []) => {
          if (records.length && records.every(mutationOnlyTouchesTimelineUi)) return;
          this.schedule(90);
        }) : null;
        observer?.observe?.(doc.body, { childList: true, subtree: true });
        this.observers.push(() => {
          observer?.disconnect?.();
          win?.removeEventListener?.('resize', onViewport);
          doc.removeEventListener?.('scroll', onViewport, true);
          this.observedDocs.delete(doc);
        });
      } catch {}
    },
    destroy() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      for (const stop of this.observers.splice(0)) {
        try { stop(); } catch {}
      }
      clearTimelinesExcept(plugin, null);
      for (const leaf of markdownLeaves(plugin)) removeTimelineFromView(leaf?.view);
    }
  };
  plugin._goStudyTimelineNavigator = manager;

  const workspace = plugin?.app?.workspace;
  const vault = plugin?.app?.vault;
  for (const event of ['active-leaf-change', 'layout-change', 'file-open', 'editor-change']) {
    try {
      const ref = workspace?.on?.(event, () => manager.schedule());
      if (ref) plugin.registerEvent?.(ref);
    } catch {}
  }
  for (const event of ['modify', 'rename', 'delete']) {
    try {
      const ref = vault?.on?.(event, () => manager.schedule(110));
      if (ref) plugin.registerEvent?.(ref);
    } catch {}
  }

  for (const leaf of markdownLeaves(plugin)) {
    manager.ensureDocument(markdownViewHost(leaf?.view)?.ownerDocument);
  }

  const originalSchedule = manager.schedule.bind(manager);
  manager.schedule = (delay = 70) => {
    for (const leaf of markdownLeaves(plugin)) {
      manager.ensureDocument(markdownViewHost(leaf?.view)?.ownerDocument);
    }
    return originalSchedule(delay);
  };

  plugin.register?.(() => manager.destroy());
  manager.schedule(0);
  return manager;
}

module.exports = {
  activeMarkdownView,
  cleanSourceTitle,
  clearTimelinesExcept,
  extractGoStudyReferenceUris,
  diagnoseTimelineNavigator,
  existingTimelineForView,
  freeformSource,
  installTimelineNavigator,
  isMarkdownView,
  managedSource,
  markdownViewText,
  navigateTimelineItem,
  mutationOnlyTouchesTimelineUi,
  nodeIsTimelineUi,
  renderedReferenceUris,
  parseTimelineReferenceUri,
  refreshTimelineNavigator,
  renderTimelineIntoView,
  sourceForReference,
  timelineGroupsFromMarkdown,
  timelineGroupsFromMatches,
  timelineGroupsFromView,
  timelineDocuments,
  timelineSignature,
  timelineSummary
};
