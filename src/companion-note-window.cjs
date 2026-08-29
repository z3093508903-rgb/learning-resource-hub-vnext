'use strict';

let setIcon = () => {};
try {
  const obsidian = require('obsidian');
  setIcon = obsidian.setIcon || setIcon;
} catch {}

function resolveRemote(options = {}) {
  if (options.remote) return options.remote;
  try { return require('@electron/remote'); } catch { return null; }
}

const { projectIdForResource, recentProjectNote } = require('./project-notes.cjs');
const { currentProductSettings } = require('./product-settings.cjs');

const DEFAULT_LAYOUT_ID = 'right-rail';
const BUILTIN_LAYOUTS = Object.freeze({
  'right-rail': Object.freeze({
    id: 'right-rail',
    name: '播放器右侧栏',
    widthRatio: 0.20,
    minWidth: 300,
    maxWidth: 380,
    heightRatio: 0.88,
    scale: 0.82
  }),
  'right-half': Object.freeze({
    id: 'right-half',
    name: '右侧半高',
    widthRatio: 0.23,
    minWidth: 320,
    maxWidth: 430,
    heightRatio: 0.58,
    scale: 0.88
  })
});

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCompanionScale(value) {
  return Math.round(clampNumber(value, 0.6, 1.2, 0.82) * 100) / 100;
}

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function ensureCompanionWindowState(plugin) {
  if (!plugin?.state) throw new Error('Go Study 状态不可用。');
  plugin.state.uiState ||= {};
  const raw = objectOr(plugin.state.uiState.companionNoteWindow);
  const customLayouts = Array.isArray(raw.customLayouts)
    ? raw.customLayouts
      .filter((item) => item && typeof item === 'object' && String(item.id || '').startsWith('custom-'))
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || '自定义布局'),
        geometry: normalizeStoredGeometry(item.geometry),
        scale: normalizeCompanionScale(item.scale)
      }))
      .filter((item) => item.geometry)
    : [];
  const next = {
    notePath: String(raw.notePath || ''),
    locked: raw.locked !== false,
    alwaysOnTop: raw.alwaysOnTop !== false,
    scale: normalizeCompanionScale(raw.scale),
    activeLayoutId: String(raw.activeLayoutId || DEFAULT_LAYOUT_ID),
    lastGeometry: normalizeStoredGeometry(raw.lastGeometry),
    customLayouts
  };
  Object.assign(raw, next);
  plugin.state.uiState.companionNoteWindow = raw;
  return raw;
}

function companionWindowState(plugin) {
  return ensureCompanionWindowState(plugin);
}

function normalizeStoredGeometry(value) {
  const raw = objectOr(value);
  const width = Number(raw.width);
  const height = Number(raw.height);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (![width, height, x, y].every(Number.isFinite)) return null;
  if (width < 180 || height < 220) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function fallbackWorkArea() {
  const screenObj = globalThis.screen;
  return {
    x: 0,
    y: 0,
    width: Math.max(800, Number(screenObj?.availWidth || 1600)),
    height: Math.max(600, Number(screenObj?.availHeight || 900))
  };
}

function activeWorkArea(options = {}) {
  if (options.workArea) return { ...options.workArea };
  const remote = options.remote || resolveRemote(options);
  const screenApi = options.screen || remote?.screen;
  try {
    const point = screenApi?.getCursorScreenPoint?.() || { x: 0, y: 0 };
    return screenApi?.getDisplayNearestPoint?.(point)?.workArea || fallbackWorkArea();
  } catch {
    return fallbackWorkArea();
  }
}

function clampGeometry(rawGeometry, workArea) {
  const area = workArea || fallbackWorkArea();
  const raw = normalizeStoredGeometry(rawGeometry) || {};
  const width = Math.round(clampNumber(raw.width, 260, Math.max(260, area.width), Math.min(340, area.width)));
  const height = Math.round(clampNumber(raw.height, 320, Math.max(320, area.height), Math.min(720, area.height)));
  const x = Math.round(clampNumber(raw.x, area.x, area.x + area.width - width, area.x + area.width - width - 10));
  const y = Math.round(clampNumber(raw.y, area.y, area.y + area.height - height, area.y + Math.max(8, (area.height - height) / 2)));
  return { x, y, width, height };
}

function builtinGeometry(layout, workArea) {
  const area = workArea || fallbackWorkArea();
  const width = Math.round(clampNumber(area.width * layout.widthRatio, layout.minWidth, Math.min(layout.maxWidth, area.width), layout.minWidth));
  const height = Math.round(clampNumber(area.height * layout.heightRatio, 360, Math.max(360, area.height - 8), Math.min(720, area.height)));
  return clampGeometry({
    x: area.x + area.width - width - 8,
    y: area.y + Math.max(4, (area.height - height) / 2),
    width,
    height
  }, area);
}

function listCompanionLayouts(plugin, options = {}) {
  const state = companionWindowState(plugin);
  const area = activeWorkArea(options);
  const builtins = Object.values(BUILTIN_LAYOUTS).map((layout) => ({
    id: layout.id,
    name: layout.name,
    geometry: builtinGeometry(layout, area),
    scale: layout.scale,
    builtin: true
  }));
  return [...builtins, ...state.customLayouts.map((layout) => ({ ...layout, builtin: false }))];
}

function resolveLayout(plugin, layoutId, options = {}) {
  const layouts = listCompanionLayouts(plugin, options);
  return layouts.find((layout) => layout.id === layoutId)
    || layouts.find((layout) => layout.id === DEFAULT_LAYOUT_ID)
    || layouts[0];
}

function currentCompanionWindow(plugin) {
  return plugin?._goStudyCompanionWindow || null;
}

function currentWindowGeometry(plugin) {
  const session = currentCompanionWindow(plugin);
  const win = session?.win;
  if (!win || win.closed) return null;
  try {
    return normalizeStoredGeometry({
      x: Number(win.screenX),
      y: Number(win.screenY),
      width: Number(win.outerWidth),
      height: Number(win.outerHeight)
    });
  } catch {
    return null;
  }
}

async function persistCompanionState(plugin) {
  await plugin?.persist?.();
}

function activeMarkdownPath(plugin) {
  const workspace = plugin?.app?.workspace;
  const active = workspace?.activeEditor;
  const file = active?.file || workspace?.getActiveFile?.();
  if (!file || String(file.extension || '').toLowerCase() !== 'md') return '';
  return String(file.path || '');
}

function recentStudyNotePath(plugin) {
  const resourceId = String(plugin?.activeMediaSession?.resourceId || '');
  if (!resourceId) return '';
  try {
    const projectId = projectIdForResource(plugin.state, resourceId);
    return String(recentProjectNote(plugin.state, projectId)?.path || '');
  } catch {
    return '';
  }
}

function resolveCompanionNotePath(plugin, options = {}) {
  const state = companionWindowState(plugin);
  const explicit = String(options.filePath || '');
  if (explicit) return explicit;
  if (options.preferSaved && state.notePath) return state.notePath;
  return activeMarkdownPath(plugin)
    || state.notePath
    || recentStudyNotePath(plugin);
}

function resolveMarkdownFile(plugin, path) {
  const normalized = String(path || '');
  if (!normalized) return null;
  const file = plugin?.app?.vault?.getAbstractFileByPath?.(normalized);
  if (!file || Array.isArray(file.children) || String(file.extension || '').toLowerCase() !== 'md') return null;
  return file;
}

async function loadedMarkdownView(leaf, timeoutMs = 2500) {
  const deadline = Date.now() + Math.max(300, Number(timeoutMs || 2500));
  while (Date.now() < deadline) {
    try { await leaf?.loadIfDeferred?.(); } catch {}
    const view = leaf?.view;
    if (view?.editor && view?.file) return view;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return leaf?.view || null;
}

function leafWindow(leaf) {
  const el = leaf?.view?.containerEl || leaf?.containerEl;
  return el?.win || el?.ownerDocument?.defaultView || el?.doc?.defaultView || null;
}

function companionTitle(fileOrPath) {
  const path = String(fileOrPath?.path || fileOrPath || '');
  return path.split('/').pop()?.replace(/\.md$/i, '') || '学习笔记';
}

function companionEditorEndPosition(editor) {
  if (!editor) return null;
  try {
    const lastLine = Math.max(0, Number(typeof editor.lastLine === 'function' ? editor.lastLine() : 0));
    const lineText = typeof editor.getLine === 'function' ? String(editor.getLine(lastLine) || '') : '';
    return { line: lastLine, ch: lineText.length };
  } catch {
    return null;
  }
}

function revealCompanionEditorCursor(plugin, editor, options = {}) {
  if (!editor) return false;
  const target = plugin?._goStudyCompanionTarget;
  if (!target?.editor || target.editor !== editor) return false;

  let cursor = null;
  if (options.moveToEnd && typeof editor.setCursor === 'function') {
    const end = companionEditorEndPosition(editor);
    if (end) {
      try {
        editor.setCursor(end);
        cursor = end;
      } catch {}
    }
  }
  if (!cursor && typeof editor.getCursor === 'function') {
    try { cursor = editor.getCursor(); } catch {}
  }
  if (options.focus !== false) {
    try { editor.focus?.(); } catch {}
  }

  const reveal = () => {
    let current = cursor;
    if (typeof editor.getCursor === 'function') {
      try { current = editor.getCursor() || current; } catch {}
    }
    if (current && typeof editor.scrollIntoView === 'function') {
      try {
        editor.scrollIntoView({ from: current, to: current }, Boolean(options.center));
      } catch {
        try { editor.scrollIntoView({ from: current, to: current }); } catch {}
      }
    }

    const leaf = target?.leaf || plugin?._goStudyCompanionWindow?.leaf;
    const scroller = leaf?.view?.containerEl?.querySelector?.('.cm-scroller');
    const end = companionEditorEndPosition(editor);
    if (scroller && current && end && end.line - Number(current.line || 0) <= 2) {
      try { scroller.scrollTop = scroller.scrollHeight; } catch {}
    }
  };

  reveal();
  const win = target?.leaf?.view?.containerEl?.ownerDocument?.defaultView
    || plugin?._goStudyCompanionWindow?.win;
  try {
    if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(reveal);
    else setTimeout(reveal, 0);
  } catch {}
  return true;
}


function nativeWindowScore(nativeWindow, win) {
  if (!nativeWindow?.getBounds || !win) return Number.POSITIVE_INFINITY;
  try {
    const bounds = nativeWindow.getBounds();
    const expected = {
      x: Number(win.screenX),
      y: Number(win.screenY),
      width: Number(win.outerWidth),
      height: Number(win.outerHeight)
    };
    if (!Object.values(expected).every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    return Math.abs(Number(bounds.x) - expected.x)
      + Math.abs(Number(bounds.y) - expected.y)
      + Math.abs(Number(bounds.width) - expected.width)
      + Math.abs(Number(bounds.height) - expected.height);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function resolveNativeCompanionWindow(win, options = {}) {
  if (options.nativeWindow?.setAlwaysOnTop) return options.nativeWindow;
  const remote = options.remote || resolveRemote(options);
  let windows = [];
  try { windows = remote?.BrowserWindow?.getAllWindows?.() || []; } catch {}
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of windows) {
    const score = nativeWindowScore(candidate, win);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore <= 180 ? best : null;
}

function syncCompanionNativeState(plugin, session, options = {}) {
  const win = session?.win;
  if (!win) return false;
  const state = companionWindowState(plugin);
  const title = companionTitle(session.filePath);
  try { if (win.document) win.document.title = title; } catch {}
  try {
    const viewTitle = win.document?.querySelector?.('.view-header-title');
    if (viewTitle) viewTitle.textContent = title;
  } catch {}

  const nativeWindow = session.nativeWindow || resolveNativeCompanionWindow(win, options);
  if (!nativeWindow) return false;
  session.nativeWindow = nativeWindow;
  try {
    if (typeof nativeWindow.setTitle === 'function' && nativeWindow.getTitle?.() !== title) nativeWindow.setTitle(title);
  } catch {}
  try {
    if (typeof nativeWindow.setAlwaysOnTop === 'function') nativeWindow.setAlwaysOnTop(Boolean(state.alwaysOnTop));
  } catch {}
  return true;
}

function updatePinButton(plugin, session) {
  const button = session?.pinButton;
  if (!button) return;
  const pinned = companionWindowState(plugin).alwaysOnTop;
  button.classList?.toggle?.('is-active', pinned);
  button.setAttribute?.('aria-label', pinned ? '取消置顶学习笔记小窗' : '置顶学习笔记小窗');
  button.setAttribute?.('title', pinned ? '已置顶 · 点击取消' : '未置顶 · 点击置顶');
  button.empty?.();
  try { setIcon(button, pinned ? 'pin' : 'pin-off'); } catch {}
}

function installCompanionPinControl(plugin, session) {
  const doc = session?.win?.document;
  if (!doc?.createElement) return null;
  const header = doc.querySelector?.('.view-header');
  const actions = header?.querySelector?.('.view-actions') || header;
  if (!actions) return null;
  const existing = actions.querySelector?.('[data-go-study-companion-pin]');
  if (existing) {
    session.pinButton = existing;
    updatePinButton(plugin, session);
    return existing;
  }
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'clickable-icon go-study-companion-pin';
  button.setAttribute('data-go-study-companion-pin', 'true');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void setCompanionAlwaysOnTop(plugin, !companionWindowState(plugin).alwaysOnTop);
  });
  actions.prepend?.(button);
  session.pinButton = button;
  updatePinButton(plugin, session);
  return button;
}

function applyCompanionChrome(win, scale) {
  const doc = win?.document;
  if (!doc?.body) return false;
  doc.documentElement?.classList?.add('go-study-companion-document');
  doc.body.classList.add('go-study-companion-window');
  doc.documentElement?.style?.setProperty('--go-study-companion-scale', String(normalizeCompanionScale(scale)));
  return true;
}

function applyGeometry(win, geometry) {
  if (!win || !geometry) return false;
  try {
    win.resizeTo?.(geometry.width, geometry.height);
    win.moveTo?.(geometry.x, geometry.y);
    return true;
  } catch {
    return false;
  }
}

function detachCompanionTarget(plugin) {
  if (!plugin) return;
  plugin._goStudyCompanionTarget = null;
}

function cleanupCompanionSession(plugin, session, options = {}) {
  if (!session || session.cleaned) return;
  session.cleaned = true;
  try { if (session.timer) session.win?.clearInterval?.(session.timer); } catch {}
  try { session.win?.removeEventListener?.('resize', session.captureGeometry); } catch {}
  try { session.win?.removeEventListener?.('beforeunload', session.beforeUnload); } catch {}
  const finalGeometry = currentWindowGeometry(plugin);
  if (finalGeometry && plugin?.state) {
    const state = companionWindowState(plugin);
    state.lastGeometry = finalGeometry;
  }
  if (plugin?._goStudyCompanionWindow === session) plugin._goStudyCompanionWindow = null;
  if (plugin?._goStudyCompanionTarget?.leaf === session.leaf) detachCompanionTarget(plugin);
  const studyMode = plugin?.state?.uiState?.studyMode;
  if (studyMode?.active && (!studyMode.notePath || studyMode.notePath === session.filePath)) {
    studyMode.active = false;
    studyMode.mode = 'note';
    studyMode.notePath = '';
    studyMode.resourceId = '';
    studyMode.projectId = '';
    studyMode.freeformMedia = null;
    studyMode.enteredAt = '';
    plugin._goStudyStudyMode = null;
  }
  if (options.persist !== false && plugin?.state) void persistCompanionState(plugin).catch(() => {});
}

function installGeometryTracking(plugin, session) {
  const win = session.win;
  if (!win) return;
  let last = currentWindowGeometry(plugin);
  let dirty = false;
  let persistTimer = null;
  const flush = () => {
    if (!dirty || !plugin?.state) return;
    dirty = false;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    void persistCompanionState(plugin).catch(() => {});
  };
  const captureGeometry = () => {
    syncCompanionNativeState(plugin, session);
    const geometry = currentWindowGeometry(plugin);
    if (!geometry) return;
    const same = last && ['x','y','width','height'].every((key) => geometry[key] === last[key]);
    if (same) return;
    last = geometry;
    const state = companionWindowState(plugin);
    state.lastGeometry = geometry;
    dirty = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, 450);
  };
  const beforeUnload = () => {
    captureGeometry();
    flush();
    cleanupCompanionSession(plugin, session, { persist: true });
  };
  session.captureGeometry = captureGeometry;
  session.beforeUnload = beforeUnload;
  win.addEventListener?.('resize', captureGeometry);
  win.addEventListener?.('beforeunload', beforeUnload);
  session.timer = win.setInterval?.(captureGeometry, 800);
}

async function closeCompanionNoteWindow(plugin, options = {}) {
  const session = currentCompanionWindow(plugin);
  if (!session) return false;
  cleanupCompanionSession(plugin, session, { persist: options.persist !== false });
  try { session.leaf?.detach?.(); } catch {
    try { session.win?.close?.(); } catch {}
  }
  return true;
}

async function openCompanionNoteWindow(plugin, options = {}) {
  const workspace = plugin?.app?.workspace;
  if (!workspace?.getLeaf) throw new Error('当前 Obsidian Workspace 不可用。');
  const state = companionWindowState(plugin);
  const path = resolveCompanionNotePath(plugin, options);
  const file = resolveMarkdownFile(plugin, path);
  if (!file) throw new Error('请先打开一篇可编辑的 Markdown 笔记，或先恢复上次的小窗笔记。');

  await closeCompanionNoteWindow(plugin, { persist: true });

  let leaf = null;
  try { leaf = workspace.getLeaf('window'); }
  catch {}
  if (!leaf || typeof leaf.openFile !== 'function') {
    throw new Error('当前 Obsidian 桌面版无法创建独立笔记窗口。');
  }

  await leaf.openFile(file, { active: true });
  try { await workspace.revealLeaf?.(leaf); } catch {}
  const view = await loadedMarkdownView(leaf, options.loadTimeoutMs);
  if (!view?.editor) {
    try { leaf.detach?.(); } catch {}
    throw new Error('学习笔记小窗没有加载出可编辑 Markdown Editor。');
  }
  const win = leafWindow(leaf);
  if (!win) {
    try { leaf.detach?.(); } catch {}
    throw new Error('无法取得学习笔记小窗的 Window。');
  }

  state.notePath = file.path;
  state.locked = options.locked == null ? state.locked : Boolean(options.locked);
  state.alwaysOnTop = options.alwaysOnTop == null ? state.alwaysOnTop : Boolean(options.alwaysOnTop);
  const layout = resolveLayout(plugin, options.layoutId || state.activeLayoutId, options);
  state.activeLayoutId = layout.id;
  const scale = normalizeCompanionScale(options.scale ?? state.scale ?? layout.scale);
  state.scale = scale;
  const area = activeWorkArea(options);
  const geometry = clampGeometry(
    options.geometry || (options.forceLayout ? layout.geometry : state.lastGeometry) || layout.geometry,
    area
  );
  state.lastGeometry = geometry;

  applyCompanionChrome(win, scale);
  applyGeometry(win, geometry);
  try { win.focus?.(); } catch {}

  const session = { leaf, win, filePath: file.path, cleaned: false, timer: null, nativeWindow: null, pinButton: null };
  plugin._goStudyCompanionWindow = session;
  plugin._goStudyCompanionTarget = {
    editor: view.editor,
    filePath: file.path,
    leaf,
    locked: state.locked,
    openedAt: Date.now()
  };
  const focusAtEnd = options.focusAtEnd == null
    ? currentProductSettings(plugin).focusStudyNoteAtEnd
    : Boolean(options.focusAtEnd);
  revealCompanionEditorCursor(plugin, view.editor, {
    moveToEnd: focusAtEnd,
    focus: options.focusEditor !== false,
    center: false
  });
  syncCompanionNativeState(plugin, session, options);
  installCompanionPinControl(plugin, session);
  installGeometryTracking(plugin, session);
  plugin?._goStudyBrowserModifier?.refresh?.();
  await persistCompanionState(plugin);
  return {
    leaf,
    win,
    file,
    editor: view.editor,
    geometry,
    scale,
    locked: state.locked,
    alwaysOnTop: state.alwaysOnTop,
    layoutId: state.activeLayoutId
  };
}

async function setCompanionAlwaysOnTop(plugin, value, options = {}) {
  const state = companionWindowState(plugin);
  state.alwaysOnTop = Boolean(value);
  const session = currentCompanionWindow(plugin);
  if (session?.win) {
    syncCompanionNativeState(plugin, session, options);
    try { session.nativeWindow?.setAlwaysOnTop?.(state.alwaysOnTop); } catch {}
    updatePinButton(plugin, session);
  }
  if (plugin?.state?.uiState?.studyMode) plugin.state.uiState.studyMode.alwaysOnTop = state.alwaysOnTop;
  await persistCompanionState(plugin);
  return state.alwaysOnTop;
}

async function setCompanionLocked(plugin, value) {
  const state = companionWindowState(plugin);
  state.locked = Boolean(value);
  if (plugin?._goStudyCompanionTarget) plugin._goStudyCompanionTarget.locked = state.locked;
  await persistCompanionState(plugin);
  return state.locked;
}

async function setCompanionScale(plugin, value) {
  const state = companionWindowState(plugin);
  state.scale = normalizeCompanionScale(value);
  const session = currentCompanionWindow(plugin);
  if (session?.win) applyCompanionChrome(session.win, state.scale);
  await persistCompanionState(plugin);
  return state.scale;
}

async function applyCompanionLayout(plugin, layoutId, options = {}) {
  const state = companionWindowState(plugin);
  const layout = resolveLayout(plugin, layoutId, options);
  if (!layout) throw new Error('找不到学习小窗布局。');
  state.activeLayoutId = layout.id;
  state.scale = normalizeCompanionScale(layout.scale ?? state.scale);
  const geometry = clampGeometry(layout.geometry, activeWorkArea(options));
  state.lastGeometry = geometry;
  const session = currentCompanionWindow(plugin);
  if (session?.win) {
    applyCompanionChrome(session.win, state.scale);
    applyGeometry(session.win, geometry);
  }
  await persistCompanionState(plugin);
  return { ...layout, geometry, scale: state.scale };
}

async function saveCurrentCompanionLayout(plugin, name = '') {
  const geometry = currentWindowGeometry(plugin) || companionWindowState(plugin).lastGeometry;
  if (!geometry) throw new Error('请先打开并调整学习笔记小窗，再保存布局。');
  const state = companionWindowState(plugin);
  const index = state.customLayouts.length + 1;
  const id = `custom-${Date.now().toString(36)}-${index}`;
  const layout = {
    id,
    name: String(name || `自定义布局 ${index}`).trim().slice(0, 60) || `自定义布局 ${index}`,
    geometry,
    scale: state.scale
  };
  state.customLayouts.push(layout);
  state.activeLayoutId = id;
  state.lastGeometry = geometry;
  await persistCompanionState(plugin);
  return layout;
}

function companionStatusText(plugin) {
  const state = companionWindowState(plugin);
  const open = Boolean(currentCompanionWindow(plugin)?.win && !currentCompanionWindow(plugin).win.closed);
  const name = state.notePath ? state.notePath.split('/').pop()?.replace(/\.md$/i, '') : '未选择笔记';
  return `${open ? '已打开' : '未打开'} · ${name} · ${state.locked ? '已锁定 Capture' : '未锁定'} · 缩放 ${Math.round(state.scale * 100)}%`;
}

function registerCompanionNoteCommands(plugin) {
  plugin.addCommand?.({
    id: 'open-current-note-in-companion-window',
    name: '在学习笔记小窗中打开当前笔记',
    checkCallback: (checking) => {
      const path = activeMarkdownPath(plugin);
      if (!path) return false;
      if (!checking) void openCompanionNoteWindow(plugin, { filePath: path }).catch((error) => {
        console.error('Go Study companion note window failed.', error);
      });
      return true;
    }
  });
  plugin.addCommand?.({
    id: 'restore-companion-note-window',
    name: '恢复上次学习笔记小窗',
    checkCallback: (checking) => {
      const path = companionWindowState(plugin).notePath;
      if (!path || !resolveMarkdownFile(plugin, path)) return false;
      if (!checking) void openCompanionNoteWindow(plugin, { preferSaved: true }).catch((error) => {
        console.error('Go Study companion note restore failed.', error);
      });
      return true;
    }
  });
  plugin.addCommand?.({
    id: 'toggle-companion-note-lock',
    name: '切换学习笔记小窗 Capture 锁定',
    callback: () => void setCompanionLocked(plugin, !companionWindowState(plugin).locked)
  });
  plugin.addCommand?.({
    id: 'toggle-companion-note-always-on-top',
    name: '切换学习笔记小窗置顶',
    callback: () => void setCompanionAlwaysOnTop(plugin, !companionWindowState(plugin).alwaysOnTop)
  });
  plugin.addCommand?.({
    id: 'save-companion-note-layout',
    name: '保存当前学习笔记小窗布局',
    checkCallback: (checking) => {
      if (!currentWindowGeometry(plugin)) return false;
      if (!checking) void saveCurrentCompanionLayout(plugin);
      return true;
    }
  });
  plugin.register?.(() => { void closeCompanionNoteWindow(plugin, { persist: true }); });
  return true;
}

module.exports = {
  BUILTIN_LAYOUTS,
  DEFAULT_LAYOUT_ID,
  activeMarkdownPath,
  activeWorkArea,
  applyCompanionChrome,
  applyCompanionLayout,
  applyGeometry,
  builtinGeometry,
  clampGeometry,
  closeCompanionNoteWindow,
  companionStatusText,
  companionWindowState,
  currentCompanionWindow,
  currentWindowGeometry,
  ensureCompanionWindowState,
  leafWindow,
  listCompanionLayouts,
  normalizeCompanionScale,
  normalizeStoredGeometry,
  revealCompanionEditorCursor,
  openCompanionNoteWindow,
  registerCompanionNoteCommands,
  resolveCompanionNotePath,
  resolveLayout,
  resolveNativeCompanionWindow,
  saveCurrentCompanionLayout,
  setCompanionAlwaysOnTop,
  setCompanionLocked,
  setCompanionScale,
  syncCompanionNativeState
};
