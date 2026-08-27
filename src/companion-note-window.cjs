'use strict';

const { resolveRemote } = require('./quick-note-window.cjs');
const { projectIdForResource, recentProjectNote } = require('./project-notes.cjs');

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
    scale: normalizeCompanionScale(raw.scale),
    activeLayoutId: String(raw.activeLayoutId || DEFAULT_LAYOUT_ID),
    lastGeometry: normalizeStoredGeometry(raw.lastGeometry),
    customLayouts
  };
  plugin.state.uiState.companionNoteWindow = next;
  return next;
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

  const session = { leaf, win, filePath: file.path, cleaned: false, timer: null };
  plugin._goStudyCompanionWindow = session;
  plugin._goStudyCompanionTarget = {
    editor: view.editor,
    filePath: file.path,
    leaf,
    locked: state.locked,
    openedAt: Date.now()
  };
  installGeometryTracking(plugin, session);
  await persistCompanionState(plugin);
  return { leaf, win, file, editor: view.editor, geometry, scale, locked: state.locked, layoutId: state.activeLayoutId };
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
  openCompanionNoteWindow,
  registerCompanionNoteCommands,
  resolveCompanionNotePath,
  resolveLayout,
  saveCurrentCompanionLayout,
  setCompanionLocked,
  setCompanionScale
};
