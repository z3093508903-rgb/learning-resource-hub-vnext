'use strict';

const __rhModules = {
"action-hud.cjs": (module, exports, require) => {
'use strict';

const { resolveRemote } = __rhLoad("quick-note-window.cjs");
const { CAPTURE_ACTIONS, HUD_SLOT_LABELS, HUD_SLOT_ORDER, normalizeHudSlots } = __rhLoad("capture-actions.cjs");

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function slotCopy(slots, slot) {
  const action = CAPTURE_ACTIONS[slots[slot]];
  return {
    slot,
    direction: HUD_SLOT_LABELS[slot] || slot,
    label: action?.label || slots[slot] || '未设置'
  };
}

function hudHtml(rawSlots) {
  const slots = normalizeHudSlots(rawSlots);
  const copies = Object.fromEntries(HUD_SLOT_ORDER.map((slot) => [slot, slotCopy(slots, slot)]));
  const cell = (slot) => `<div class="slot ${slot}" data-slot="${slot}"><span class="dir">${escapeHtml(copies[slot].direction)}</span><strong>${escapeHtml(copies[slot].label)}</strong></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:transparent;font-family:Segoe UI,system-ui,sans-serif;color:#f4f4f5;overflow:hidden}
  .hud{width:100%;height:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(20,22,27,.94);box-shadow:0 18px 50px rgba(0,0,0,.38);display:grid;grid-template-columns:1fr 1.25fr 1fr;grid-template-rows:1fr 1.15fr 1fr;gap:8px;padding:15px;backdrop-filter:blur(18px)}
  .slot{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.035);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;transition:.12s ease}
  .slot .dir{font-size:10px;color:#9ca3af}.slot strong{font-size:12px;font-weight:620;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 4px}
  .slot.is-selected{border-color:rgba(167,139,250,.85);background:rgba(124,58,237,.25);transform:scale(1.025)}
  .up{grid-column:2;grid-row:1}.left{grid-column:1;grid-row:2}.center{grid-column:2;grid-row:2}.right{grid-column:3;grid-row:2}.down{grid-column:2;grid-row:3}
  .brand{position:absolute;right:18px;bottom:10px;font-size:9px;color:#71717a}
  </style></head><body><div class="hud">${cell('up')}${cell('left')}${cell('center')}${cell('right')}${cell('down')}</div><div class="brand">Go Study · ↑↓←→ · Enter · Esc</div></body></html>`;
}

function createNativeActionHud(rawSlots, options = {}) {
  const remote = resolveRemote(options);
  const BrowserWindow = options.BrowserWindow || remote?.BrowserWindow;
  if (!BrowserWindow) return null;
  const screen = options.screen || remote?.screen;
  const point = screen?.getCursorScreenPoint?.() || { x: 0, y: 0 };
  const display = screen?.getDisplayNearestPoint?.(point);
  const area = display?.workArea || { x: 0, y: 0, width: 1280, height: 720 };
  const width = 460;
  const height = 300;
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.max(60, area.height * 0.24)),
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  let shown = false;
  let closed = false;
  const ready = win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(hudHtml(rawSlots))}`).catch(() => {});
  return {
    async show() {
      if (closed || shown) return false;
      await ready;
      if (closed || win.isDestroyed?.()) return false;
      shown = true;
      try { win.showInactive?.(); } catch { try { win.show(); } catch {} }
      return true;
    },
    async select(slot) {
      if (closed || !HUD_SLOT_ORDER.includes(slot)) return false;
      await ready;
      if (closed || win.isDestroyed?.()) return false;
      const safe = JSON.stringify(slot);
      try {
        await win.webContents.executeJavaScript(`document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('is-selected',x.dataset.slot===${safe}))`);
        return true;
      } catch { return false; }
    },
    close() {
      if (closed) return;
      closed = true;
      try { if (!win.isDestroyed?.()) win.close(); } catch {}
    },
    get shown() { return shown; }
  };
}

module.exports = {
  createNativeActionHud,
  escapeHtml,
  hudHtml,
  slotCopy
};

},
"anki-launch.cjs": (module, exports, require) => {
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PREFERRED_ANKI_SHORTCUT = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Anki\\Anki.lnk';

function cleanExecutablePath(value) {
  return String(value || '').trim().replace(/^"([\s\S]*)"$/, '$1');
}

function ankiExecutableCandidates(configured = '', env = process.env) {
  const localAppData = String(env.LOCALAPPDATA || '').trim();
  const programFiles = String(env.ProgramFiles || 'C:\\Program Files').trim();
  const programFilesX86 = String(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').trim();
  const installRoots = [
    localAppData ? path.join(localAppData, 'Programs', 'Anki') : '',
    programFiles ? path.join(programFiles, 'Anki') : '',
    programFilesX86 ? path.join(programFilesX86, 'Anki') : ''
  ].filter(Boolean);

  const candidates = [
    PREFERRED_ANKI_SHORTCUT,
    cleanExecutablePath(configured)
  ];
  for (const root of installRoots) {
    candidates.push(
      path.join(root, 'anki.exe'),
      path.join(root, 'launcher.exe'),
      path.join(root, 'anki-console.exe')
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

function resolveAnkiExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next known installation shape. */ }
  }
  return '';
}

function resolveAnkiProfileExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    if (!/\.exe$/i.test(candidate)) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next executable candidate. */ }
  }
  return '';
}

function launchAnkiProcess(executable, args = [], options = {}) {
  const spawnProcess = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch (error) {
      reject(new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      child?.removeListener?.('spawn', onSpawn);
      child?.removeListener?.('error', onError);
      callback(value);
    };
    const onSpawn = () => {
      child?.unref?.();
      finish(resolve, child);
    };
    const onError = (error) => finish(reject, new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));

    if (typeof child?.once === 'function') {
      child.once('spawn', onSpawn);
      child.once('error', onError);
    } else {
      child?.unref?.();
      finish(resolve, child);
    }
  });
}

module.exports = {
  PREFERRED_ANKI_SHORTCUT,
  ankiExecutableCandidates,
  cleanExecutablePath,
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
};

},
"capture-actions.cjs": (module, exports, require) => {
'use strict';

const CAPTURE_ACTIONS = Object.freeze({
  time: Object.freeze({ id: 'time', label: '仅时间戳', time: true, note: false, image: false }),
  note: Object.freeze({ id: 'note', label: '纯笔记', time: false, note: true, image: false }),
  image: Object.freeze({ id: 'image', label: '仅截图', time: false, note: false, image: true }),
  timeNote: Object.freeze({ id: 'timeNote', label: '评论 + 时间戳', time: true, note: true, image: false }),
  timeImage: Object.freeze({ id: 'timeImage', label: '截图 + 时间戳', time: true, note: false, image: true }),
  imageNote: Object.freeze({ id: 'imageNote', label: '截图 + 评论', time: false, note: true, image: true }),
  all: Object.freeze({ id: 'all', label: '截图 + 评论 + 时间戳', time: true, note: true, image: true })
});

const HUD_SLOT_ORDER = Object.freeze(['left', 'up', 'right', 'down', 'center']);
const HUD_SLOT_LABELS = Object.freeze({
  left: '← 左',
  up: '↑ 上',
  right: '→ 右',
  down: '↓ 下',
  center: 'Enter 中心'
});

const DEFAULT_HUD_SLOTS = Object.freeze({
  left: 'time',
  up: 'timeNote',
  right: 'timeImage',
  down: 'note',
  center: 'all'
});

function normalizeCaptureActionId(value, fallback = 'time') {
  const id = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(CAPTURE_ACTIONS, id) ? id : fallback;
}

function normalizeHudSlots(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const slot of HUD_SLOT_ORDER) {
    result[slot] = normalizeCaptureActionId(source[slot], DEFAULT_HUD_SLOTS[slot]);
  }
  return result;
}

function actionForSlot(slots, slot) {
  const normalized = normalizeHudSlots(slots);
  return CAPTURE_ACTIONS[normalized[slot] || DEFAULT_HUD_SLOTS[slot]];
}

module.exports = {
  CAPTURE_ACTIONS,
  DEFAULT_HUD_SLOTS,
  HUD_SLOT_LABELS,
  HUD_SLOT_ORDER,
  actionForSlot,
  normalizeCaptureActionId,
  normalizeHudSlots
};

},
"companion-note-window.cjs": (module, exports, require) => {
'use strict';

function resolveRemote(options = {}) {
  if (options.remote) return options.remote;
  try { return require('@electron/remote'); } catch { return null; }
}

const { projectIdForResource, recentProjectNote } = __rhLoad("project-notes.cjs");

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

},
"entry.cjs": (module, exports, require) => {
'use strict';

const model = __rhLoad("model.cjs");
const {
  installModelResourceLocatorV2,
  openListLocatorFromResource
} = __rhLoad("resource-locator.cjs");
installModelResourceLocatorV2(model);

const BaseResourceHubNextPlugin = __rhLoad("main.cjs");
const { Notice } = require('obsidian');
const { shell } = require('electron');
const path = require('node:path');
const {
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = __rhLoad("anki-launch.cjs");
const { findOpenVaultLeaf } = __rhLoad("usage-polish.cjs");
const {
  DEFAULT_ANKI_ENDPOINT,
  DEFAULT_BACKUP_RETENTION,
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf
} = __rhLoad("release-hardening.cjs");
const {
  REFERENCE_ACTION,
  parseProtocolParams
} = __rhLoad("resource-reference.cjs");
const {
  formatPotPlayerTime,
  resolveReferencePlayback,
  updateResumePosition
} = __rhLoad("resource-resolver.cjs");
const { matchingManagedResource, matchingManagedResourceByPortableName } = __rhLoad("media-session.cjs");
const { openPortableFreeformReference } = __rhLoad("freeform-playback.cjs");
const {
  applySafeOpenListPathRemap,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource
} = __rhLoad("resource-relink.cjs");
const { registerResourceRelinkCommands } = __rhLoad("resource-relink-ui.cjs");
const { registerLearningCaptureCommands } = __rhLoad("learning-capture.cjs");

class ResourceHubNextPlugin extends BaseResourceHubNextPlugin {
  async onload() {
    this._vaultLifecycleReady = false;
    this.activeMediaSession = null;
    await super.onload();
    registerResourceRelinkCommands(this);
    registerLearningCaptureCommands(this);

    if (typeof this.registerObsidianProtocolHandler === 'function') {
      this.registerObsidianProtocolHandler(REFERENCE_ACTION, (params) => {
        void this.handleResourceReference(params);
      });
    }

    const activateVaultLifecycle = async () => {
      if (this._vaultLifecycleReady) return;
      this._vaultLifecycleReady = true;
      await super.validateVaultRefs();
    };

    if (typeof this.app.workspace?.onLayoutReady === 'function') {
      this.app.workspace.onLayoutReady(() => {
        void activateVaultLifecycle().catch((error) => console.error('Learning Resource Hub: vault validation failed after layout ready.', error));
      });
    } else {
      await activateVaultLifecycle();
    }
  }

  async handleResourceReference(params) {
    try {
      const reference = parseProtocolParams(params);
      return await this.openResourceReference(reference);
    } catch (error) {
      new Notice(`Go Study 回链无法打开：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResourceReference(reference) {
    if (reference?.mode === 'freeform') return this.openFreeformReference(reference);
    const resolved = resolveReferencePlayback(this.state, reference, (resource) => this.resourceActions(resource));
    const opened = await this.openPositionedPlayTarget(resolved.resource, resolved.playTarget, resolved.playerTime);
    if (!opened) return false;

    updateResumePosition(this.state.resources[resolved.resource.id], resolved.position);
    this.activeMediaSession = {
      resourceId: resolved.resource.id,
      startedAt: new Date().toISOString(),
      lastKnownPosition: { ...resolved.position }
    };
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async openFreeformReference(reference) {
    const locator = reference?.locator || reference?.path;
    const resolveActions = (resource) => this.resourceActions(resource);
    const exactManaged = matchingManagedResource(this.state, locator, resolveActions);
    const portableManaged = exactManaged || matchingManagedResourceByPortableName(
      this.state,
      reference?.name || '',
      resolveActions
    );
    if (portableManaged) {
      return this.openResourceReference({
        resourceId: portableManaged.id,
        position: reference.position,
        version: 1
      });
    }
    try {
      const playerTime = formatPotPlayerTime(reference.position);
      new Notice(`正在跳转临时视频 · ${playerTime}`);
      const opened = await openPortableFreeformReference(reference, { shell, platform: process.platform });
      const suffix = opened.positionApplied ? ` · ${playerTime}` : ' · 当前平台暂未应用精确时间';
      new Notice(`已打开临时视频${suffix}`);
      return true;
    } catch (error) {
      new Notice(`自由回链跳转失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openPositionedPlayTarget(resource, target, playerTime) {
    if (!resource || !target) return false;
    try {
      new Notice(`正在跳转：${resource.title}`);
      if (target.type === 'openlist') {
        const source = this.state.sources[target.sourceId]
          || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(this.toPotPlayerUri(`${baseUrl}/d${encoded}${sign}`, playerTime));
      } else if (target.type === 'potplayer') {
        await shell.openExternal(this.toPotPlayerUri(target.target, playerTime));
      } else if (target.type === 'uri') {
        const legacyBili = model.parseBiliVideoUrl(target.uri);
        if (!legacyBili) throw new Error('当前回链只允许跳转到受支持的视频资源。');
        await shell.openExternal(this.toPotPlayerUri(legacyBili.canonicalUrl, playerTime));
      } else {
        throw new Error('当前资源没有支持定位播放的启动方式。');
      }
      await this.markResourceStarted(resource);
      new Notice(`已跳转：${resource.title} · ${playerTime}`);
      return true;
    } catch (error) {
      new Notice(`跳转失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    const opened = await super.openResourceAction(resource, actionType, target, options);
    if (opened && actionType === 'play' && resource?.id && this.state.resources?.[resource.id]) {
      const resume = this.state.resources[resource.id].resume?.position;
      this.activeMediaSession = {
        resourceId: resource.id,
        startedAt: new Date().toISOString(),
        lastKnownPosition: resume ? { ...resume } : null
      };
    }
    return opened;
  }

  async relinkOpenListResourceToPath(resourceId, remotePath) {
    const resource = this.state.resources?.[String(resourceId || '')];
    if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
    const current = openListLocatorFromResource(resource);
    if (!current) throw new Error('当前资源不是 OpenList 资源。');
    const normalizedPath = normalizeStrictOpenListPath(remotePath);
    const source = this.state.sources?.[current.sourceId];
    if (!source || source.deletedAt || source.type !== 'openlist') throw new Error('找不到这条资源对应的 OpenList 来源。');

    const token = await this.loginOpenList(source);
    const entry = await this.getOpenList(source, normalizedPath, token);
    if (!entry || entry.is_dir) throw new Error('目标路径不存在，或目标不是文件。');

    const result = relinkOpenListResource(this.state, resource.id, {
      sourceId: current.sourceId,
      remotePath: normalizedPath
    }, { changedAt: new Date() });

    const size = Number(entry.size);
    const modified = String(entry.modified || entry.updated_at || result.resource.metadata?.modified || '');
    result.resource.metadata = {
      ...(result.resource.metadata || {}),
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(modified ? { modified } : {})
    };
    result.resource.identityHints = {
      ...(result.resource.identityHints || {}),
      fileName: normalizedPath.split('/').filter(Boolean).pop() || result.resource.identityHints?.fileName || '',
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(modified ? { modified } : {})
    };

    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return result;
  }

  async previewOpenListFolderRemap(input = {}) {
    const preview = previewSafeOpenListPathRemap(this.state, input);
    const source = this.state.sources?.[preview.sourceId];
    if (!source || source.deletedAt || source.type !== 'openlist') throw new Error('找不到可用的 OpenList 来源。');
    const token = await this.loginOpenList(source);
    const target = await this.getOpenList(source, preview.newPrefix, token);
    if (!target?.is_dir) throw new Error('新目录不存在，或目标不是文件夹。');
    return preview;
  }

  async applyOpenListFolderRemap(preview) {
    const result = applySafeOpenListPathRemap(this.state, preview, { changedAt: new Date() });
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return result;
  }

  async validateVaultRefs() {
    if (this._vaultLifecycleReady === false) return false;
    return super.validateVaultRefs();
  }

  async handleVaultRename(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultRename(...args);
  }

  async handleVaultDelete(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultDelete(...args);
  }

  async handleVaultCreate(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultCreate(...args);
  }

  async openWorkbench(options = {}) {
    const requestedRoute = options.route;
    const initialView = await super.openWorkbench(requestedRoute ? { ...options, route: '' } : options);
    const leaf = this.workbenchLeaf;
    const loadedView = await revealLoadedLeaf(this.app.workspace, leaf);
    if (requestedRoute && typeof loadedView?.navigate === 'function') {
      await loadedView.navigate(requestedRoute, options);
    }
    return loadedView || initialView;
  }

  async revealVaultEntry(entry) {
    const leaf = this.app.workspace.getLeavesOfType?.('file-explorer')?.[0];
    if (leaf) {
      const explorer = await revealLoadedLeaf(this.app.workspace, leaf);
      if (explorer?.revealInFolder) {
        await explorer.revealInFolder(entry);
        return true;
      }
    }
    return super.revealVaultEntry(entry);
  }

  async invokeAnki(action, params = {}) {
    const source = Object.values(this.state.sources || {})
      .find((item) => item.type === 'anki' && !item.deletedAt);
    const endpoint = normalizeAnkiEndpoint(source?.endpoint || DEFAULT_ANKI_ENDPOINT);
    if (source) {
      source.endpoint = endpoint;
      source.identity = endpoint.toLowerCase();
    }
    return super.invokeAnki(action, params);
  }

  async createStateBackup(label = 'manual') {
    const backupName = await super.createStateBackup(label);
    const backupDir = path.join(this.pluginStorageDir(), 'backups');
    try {
      pruneStateBackups(backupDir, DEFAULT_BACKUP_RETENTION);
    } catch (error) {
      console.warn('Learning Resource Hub: failed to prune old state backups.', error);
    }
    return backupName;
  }

  resolveAnkiExecutable(configured = '') {
    return resolveAnkiExecutable(configured);
  }

  async ensureAnkiRunning() {
    const source = Object.values(this.state.sources)
      .find((item) => item.type === 'anki' && !item.deletedAt) || {};
    const endpoint = normalizeAnkiEndpoint(source.endpoint || DEFAULT_ANKI_ENDPOINT);
    if (source.id) {
      source.endpoint = endpoint;
      source.identity = endpoint.toLowerCase();
    }

    try {
      await this.invokeAnki('version');
      return;
    } catch { /* Start Anki below. */ }
    const profile = String(source.profile || '').trim();
    const executable = profile
      ? resolveAnkiProfileExecutable(source.executablePath)
      : this.resolveAnkiExecutable(source.executablePath);
    if (!executable) {
      throw new Error(profile
        ? '已配置 Anki Profile，但没有找到支持 Profile 参数的 anki.exe / launcher.exe；请在来源连接中重新选择 Anki 程序。'
        : '没有找到可启动的 Anki 程序（anki.exe / launcher.exe / Anki.lnk）；请在来源连接中重新选择 Anki 程序。');
    }

    if (profile) await launchAnkiProcess(executable, ['-p', profile]);
    else {
      const openError = await shell.openPath(executable);
      if (openError) throw new Error(`Windows 无法打开 Anki：${openError}`);
    }

    const deadline = Date.now() + Math.max(5000, Number(source.startupTimeout || 30000));
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        await this.invokeAnki('version');
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const detail = lastError instanceof Error && lastError.message ? ` 最后一次连接错误：${lastError.message}` : '';
    throw new Error(`Anki 已尝试打开，但 AnkiConnect 未在等待时间内响应。请确认 AnkiConnect 已启用并监听当前配置地址。${detail}`);
  }

  async openVaultEntry(entry, options = {}) {
    if (!options.newLeaf) {
      const existingLeaf = findOpenVaultLeaf(this.app.workspace, entry?.path);
      if (existingLeaf) {
        await this.app.workspace.revealLeaf(existingLeaf);
        return;
      }
    }
    await super.openVaultEntry(entry, options);
  }
}

module.exports = ResourceHubNextPlugin;

},
"freeform-link-ui.cjs": (module, exports, require) => {
'use strict';

const { shell } = require('electron');
const { parseReferenceUri } = __rhLoad("resource-reference.cjs");

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
    const web = reference.web || httpLocator(reference.locator);
    if (event?.ctrlKey && web) {
      void shellImpl.openExternal(web);
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
  httpLocator,
  installFreeformBrowserModifier,
  jvWebLocator,
  stopLinkEvent
};

},
"freeform-playback.cjs": (module, exports, require) => {
'use strict';

const { formatPotPlayerTime } = __rhLoad("resource-resolver.cjs");
const { normalizeFreeformLocator } = __rhLoad("resource-reference.cjs");

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'
]);

function locatorKind(locator) {
  const raw = normalizeFreeformLocator(locator);
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'web';
  } catch {}
  if (/^[A-Za-z]:[\\/]/.test(raw) || /^\\\\[^\\]+\\[^\\]+/.test(raw)) return 'windows-local';
  if (/^\//.test(raw)) return 'posix-local';
  return 'unknown';
}

function localVideoAllowed(locator) {
  const name = String(locator || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  const ext = name.includes('.') ? name.split('.').pop().toLocaleLowerCase() : '';
  return VIDEO_EXTENSIONS.has(ext);
}

function buildJvPlaybackUri(locator, position) {
  const target = normalizeFreeformLocator(locator);
  const playerTime = formatPotPlayerTime(position);
  return `jv://open?path=${encodeURIComponent(target)}&time=${encodeURIComponent(playerTime)}`;
}

async function openPortableFreeformReference(reference, options = {}) {
  const locator = normalizeFreeformLocator(reference?.locator ?? reference?.path);
  const kind = locatorKind(locator);
  const platform = String(options.platform || process.platform);
  const shellImpl = options.shell || (() => {
    try { return require('electron').shell; }
    catch { throw new Error('当前运行环境无法访问系统打开能力。'); }
  })();

  if (kind === 'web') {
    if (platform === 'win32') {
      await shellImpl.openExternal(buildJvPlaybackUri(locator, reference.position));
      return { transport: 'windows-jv', positionApplied: true, locator };
    }
    await shellImpl.openExternal(locator);
    return { transport: 'browser', positionApplied: false, locator };
  }

  if (!localVideoAllowed(locator)) throw new Error('Go Study 自由回链只允许打开受支持的视频文件。');

  if (platform === 'win32') {
    if (kind !== 'windows-local') {
      throw new Error('这个本地视频链接来自另一平台；请先在当前设备收录同一视频，或等待路径映射功能。');
    }
    await shellImpl.openExternal(buildJvPlaybackUri(locator, reference.position));
    return { transport: 'windows-jv', positionApplied: true, locator };
  }

  if (platform === 'darwin' || platform === 'linux') {
    if (kind !== 'posix-local') {
      throw new Error('这个本地视频链接来自 Windows；请先在当前设备收录同一视频，或等待路径映射功能。');
    }
    const error = await shellImpl.openPath(locator);
    if (error) throw new Error(error);
    return { transport: 'system-player', positionApplied: false, locator };
  }

  throw new Error(`当前平台暂不支持直接打开未收录本地视频：${platform}`);
}

module.exports = {
  VIDEO_EXTENSIONS,
  buildJvPlaybackUri,
  localVideoAllowed,
  locatorKind,
  openPortableFreeformReference
};

},
"immersive-hotkeys.cjs": (module, exports, require) => {
'use strict';

const {
  captureFrameAndInsertLearningPosition,
  commitPreparedCaptureTypedNote,
  commitPreparedPlainCapture,
  commitPreparedPlainCaptureTypedNote,
  commitPreparedPlainTypedNote,
  commitPreparedTypedNote,
  insertCurrentLearningPosition,
  prepareCaptureLearningPosition,
  prepareCurrentLearningPosition
} = __rhLoad("learning-capture.cjs");
const { CAPTURE_ACTIONS, actionForSlot } = __rhLoad("capture-actions.cjs");
const { createNativeActionHud } = __rhLoad("action-hud.cjs");
const {
  DEFAULT_IMMERSIVE_SHORTCUTS,
  immersiveShortcuts,
  normalizeShortcut,
  requestNativePotPlayer,
  resolveElectronGlobalShortcut
} = __rhLoad("native-potplayer.cjs");
const { currentProductSettings } = __rhLoad("product-settings.cjs");
const { formatPositionClock } = __rhLoad("resource-note.cjs");
const { showNativeToast, showQuickNoteInput } = __rhLoad("quick-note-window.cjs");

const HOTKEY_ACTIONS = Object.freeze({
  position: '记录当前位置',
  capture: '截图并记录',
  note: '输入笔记并记录',
  captureNote: '截图、输入笔记并记录'
});

const LEGACY_ACTION_MAP = Object.freeze({
  position: 'time',
  capture: 'timeImage',
  note: 'timeNote',
  captureNote: 'all'
});

const HUD_ACCELERATORS = Object.freeze({
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right'
});

function immersiveStatus(plugin) {
  return plugin?._goStudyImmersiveStatus || {
    mode: currentProductSettings(plugin).videoEnhancementEnabled ? 'unavailable' : 'disabled',
    registered: false,
    shortcuts: immersiveShortcuts(plugin),
    error: ''
  };
}

function setImmersiveStatus(plugin, patch = {}) {
  plugin._goStudyImmersiveStatus = {
    ...immersiveStatus(plugin),
    ...patch,
    updatedAt: Date.now()
  };
  try { globalThis.document?.dispatchEvent?.(new CustomEvent('go-study-immersive-status')); } catch {}
  return plugin._goStudyImmersiveStatus;
}

function compactError(error) {
  return (error instanceof Error ? error.message : String(error || '未知错误')).replace(/[\r\n\t]+/g, ' ').slice(0, 220);
}

async function feedback(message, options = {}) {
  try { if (await showNativeToast(message, options.toastOptions || {})) return true; } catch {}
  return false;
}

async function successFeedback(plugin, message, options = {}) {
  if (!currentProductSettings(plugin).videoSuccessFeedback) return false;
  return feedback(message, options);
}

function shortcutConflict(shortcuts) {
  const seen = new Map();
  for (const [key, value] of Object.entries(shortcuts || {})) {
    const normalized = normalizeShortcut(value).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) return [seen.get(normalized), key, value];
    seen.set(normalized, key);
  }
  return null;
}

async function resumePreparedPlayback(plugin, prepared, outcome, options = {}) {
  if (!prepared?.player?.control?.pausedByGoStudy) return false;
  const settings = currentProductSettings(plugin);
  const shouldResume = outcome === 'save' ? settings.videoResumeAfterSave : settings.videoResumeAfterCancel;
  if (!shouldResume) return false;
  await (options.nativeRequest || requestNativePotPlayer)('play', {
    ...(options.nativeOptions || {}),
    foregroundOnly: false
  });
  return true;
}

function resultTimeSuffix(action, result) {
  if (!action?.time || !result?.position) return '';
  return ` ${formatPositionClock(result.position)}`;
}

async function promptForPreparedNote(plugin, prepared, action, options = {}) {
  return (options.showQuickNoteInput || showQuickNoteInput)(plugin, {
    title: action.time
      ? `${action.label} · ${formatPositionClock(prepared.position)}`
      : action.label,
    subtitle: '视频已暂停 · Enter 保存 · Shift+Enter 换行 · Esc 取消',
    placeholder: '写下这一刻的笔记…',
    ...(options.promptOptions || {})
  });
}

async function runCaptureAction(plugin, actionValue, options = {}) {
  if (!currentProductSettings(plugin).videoEnhancementEnabled) return null;
  const action = typeof actionValue === 'string' ? CAPTURE_ACTIONS[actionValue] : actionValue;
  if (!action) throw new Error('未知视频笔记动作。');
  if (plugin?._goStudyImmersiveBusy) {
    await successFeedback(plugin, 'Go Study：上一项记录还在处理中', options);
    return null;
  }
  plugin._goStudyImmersiveBusy = true;
  let prepared = null;
  try {
    let result;
    if (action.image && action.note) {
      prepared = await prepareCaptureLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await promptForPreparedNote(plugin, prepared, action, options);
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消笔记', options);
        return null;
      }
      result = action.time
        ? await commitPreparedCaptureTypedNote(plugin, prepared, note)
        : await commitPreparedPlainCaptureTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
    } else if (action.image) {
      if (action.time) {
        result = await captureFrameAndInsertLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      } else {
        prepared = await prepareCaptureLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
        result = await commitPreparedPlainCapture(plugin, prepared);
      }
    } else if (action.note) {
      prepared = await prepareCurrentLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await promptForPreparedNote(plugin, prepared, action, options);
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消笔记', options);
        return null;
      }
      result = action.time
        ? await commitPreparedTypedNote(plugin, prepared, note)
        : await commitPreparedPlainTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
    } else if (action.time) {
      result = await insertCurrentLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
    } else {
      throw new Error('当前动作没有任何采集内容。');
    }

    await successFeedback(plugin, `✓ ${action.label}${resultTimeSuffix(action, result)}`, options);
    return result;
  } catch (error) {
    const message = compactError(error);
    if (!/PotPlayer 当前不是前台窗口/.test(message)) {
      await feedback(`⚠ ${message}`, { ...options, toastOptions: { ...(options.toastOptions || {}), durationMs: 2200 } });
    }
    throw error;
  } finally {
    plugin._goStudyImmersiveBusy = false;
  }
}

async function runImmersiveAction(plugin, key, options = {}) {
  const actionId = LEGACY_ACTION_MAP[key];
  if (!actionId) throw new Error(`未知沉浸式操作：${String(key || '')}`);
  return runCaptureAction(plugin, actionId, options);
}

function closeActionHudSession(plugin) {
  const session = plugin?._goStudyActionHudSession;
  if (!session) return;
  try { session.close?.(); } catch {}
  if (plugin) plugin._goStudyActionHudSession = null;
}

function beginActionHud(plugin, globalShortcut, options = {}) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return null;
  closeActionHudSession(plugin);

  const api = globalShortcut || plugin?._goStudyGlobalShortcut;
  if (!api?.register || !api?.unregister) {
    void feedback('⚠ Go Study 动作盘无法使用全局键盘接口', options);
    return null;
  }

  const hud = createNativeActionHud(settings.actionHudSlots, options.hudOptions || {});
  if (!hud) {
    void feedback('⚠ Go Study 动作盘窗口接口不可用', options);
    return null;
  }
  const temporary = [];
  let visible = false;
  let selected = '';
  let lastDirectionAt = 0;
  let closed = false;
  let showTimer = null;
  let expiryTimer = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (showTimer) clearTimeout(showTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    for (const accelerator of temporary) {
      try { api.unregister(accelerator); } catch {}
    }
    try { hud?.close?.(); } catch {}
    if (plugin?._goStudyActionHudSession?.close === cleanup) plugin._goStudyActionHudSession = null;
  };

  const execute = (slot) => {
    const action = actionForSlot(settings.actionHudSlots, slot);
    cleanup();
    void runCaptureAction(plugin, action, options).catch(() => {});
  };

  const chooseDirection = (slot) => {
    if (!visible) return execute(slot);
    const now = Date.now();
    const doublePressMs = Math.max(180, Math.min(650, Number(options.directionDoublePressMs || 420)));
    if (selected === slot && now - lastDirectionAt <= doublePressMs) return execute(slot);
    selected = slot;
    lastDirectionAt = now;
    void hud?.select?.(slot);
  };

  const handlers = {
    Up: () => chooseDirection('up'),
    Down: () => chooseDirection('down'),
    Left: () => chooseDirection('left'),
    Right: () => chooseDirection('right'),
    Enter: () => execute(selected || 'center'),
    Escape: () => cleanup()
  };

  const failures = [];
  for (const [accelerator, handler] of Object.entries(handlers)) {
    try {
      const ok = api.register(accelerator, handler);
      if (ok === false) failures.push(accelerator);
      else temporary.push(accelerator);
    } catch {
      failures.push(accelerator);
    }
  }
  if (failures.length) {
    cleanup();
    void feedback(`⚠ 动作盘无法临时接管：${failures.join('、')}`, options);
    return null;
  }

  const delay = Number(settings.actionHudDelayMs || 0);
  showTimer = setTimeout(() => {
    if (closed) return;
    visible = true;
    void hud?.show?.();
  }, delay);
  expiryTimer = setTimeout(cleanup, Math.max(8000, delay + 5000));

  plugin._goStudyActionHudSession = {
    close: cleanup,
    execute,
    select: chooseDirection,
    get visible() { return visible; }
  };
  return plugin._goStudyActionHudSession;
}

function unregisterImmersiveHotkeys(plugin, globalShortcut = null) {
  closeActionHudSession(plugin);
  const api = globalShortcut || plugin?._goStudyGlobalShortcut;
  const accelerators = plugin?._goStudyRegisteredAccelerators || [];
  for (const accelerator of accelerators) {
    try { api?.unregister?.(accelerator); } catch {}
  }
  if (plugin) plugin._goStudyRegisteredAccelerators = [];
}

function registrationConflict(settings, shortcuts) {
  const mode = settings.shortcutMode;
  if (mode === 'legacy' || mode === 'mixed') {
    const conflict = shortcutConflict(shortcuts);
    if (conflict) {
      return `${HOTKEY_ACTIONS[conflict[0]]} 与 ${HOTKEY_ACTIONS[conflict[1]]} 使用了同一个快捷键：${conflict[2]}`;
    }
  }
  if (mode === 'mixed') {
    const hud = normalizeShortcut(settings.actionHudShortcut).toLowerCase();
    for (const [key, value] of Object.entries(shortcuts)) {
      if (hud && normalizeShortcut(value).toLowerCase() === hud) {
        return `动作盘快捷键与 ${HOTKEY_ACTIONS[key]} 重复：${settings.actionHudShortcut}`;
      }
    }
  }
  return '';
}

function registerImmersiveHotkeys(plugin, options = {}) {
  const api = resolveElectronGlobalShortcut(options);
  unregisterImmersiveHotkeys(plugin, api);
  plugin._goStudyGlobalShortcut = api;
  const shortcuts = immersiveShortcuts(plugin);
  const settings = currentProductSettings(plugin);
  const enabled = settings.videoEnhancementEnabled;

  if (!enabled) {
    return setImmersiveStatus(plugin, {
      mode: 'disabled', registered: false, shortcuts, registeredAccelerators: [], error: ''
    });
  }
  const conflict = registrationConflict(settings, shortcuts);
  if (conflict) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, registeredAccelerators: [], error: conflict
    });
  }
  if (process.platform !== 'win32' && !options.allowNonWindows) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, error: '原生沉浸式快捷键目前只支持 Windows。'
    });
  }
  if (!api?.register) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, error: 'Electron 全局快捷键接口不可用。'
    });
  }

  const registered = [];
  const failures = [];
  const registerOne = (accelerator, callback) => {
    if (!accelerator) return;
    try {
      const ok = api.register(accelerator, callback);
      if (ok === false) failures.push(`${accelerator} 已被其他程序占用`);
      else registered.push(accelerator);
    } catch (error) {
      failures.push(`${accelerator}: ${compactError(error)}`);
    }
  };

  if (settings.shortcutMode === 'legacy' || settings.shortcutMode === 'mixed') {
    for (const key of Object.keys(HOTKEY_ACTIONS)) {
      let accelerator;
      try { accelerator = normalizeShortcut(shortcuts[key]); }
      catch (error) { failures.push(`${key}: ${compactError(error)}`); continue; }
      registerOne(accelerator, () => void runImmersiveAction(plugin, key, options).catch(() => {}));
    }
  }

  if (settings.shortcutMode === 'hud' || settings.shortcutMode === 'mixed') {
    let master = '';
    try { master = normalizeShortcut(settings.actionHudShortcut); }
    catch (error) { failures.push(`HUD: ${compactError(error)}`); }
    registerOne(master, () => beginActionHud(plugin, api, options));
  }

  plugin._goStudyRegisteredAccelerators = registered;
  if (!plugin._goStudyHotkeyUnloadRegistered) {
    plugin._goStudyHotkeyUnloadRegistered = true;
    plugin.register?.(() => unregisterImmersiveHotkeys(plugin, api));
  }
  return setImmersiveStatus(plugin, {
    mode: registered.length ? 'native-windows' : 'unavailable',
    registered: registered.length > 0,
    shortcuts,
    shortcutMode: settings.shortcutMode,
    actionHudShortcut: settings.actionHudShortcut,
    registeredAccelerators: registered,
    error: failures.join('；')
  });
}

async function updateImmersiveShortcut(plugin, key, value, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(HOTKEY_ACTIONS, key)) throw new Error('未知快捷键。');
  const normalized = normalizeShortcut(value);
  const next = {
    ...immersiveShortcuts(plugin),
    [key]: normalized
  };
  const conflict = shortcutConflict(next);
  if (conflict) throw new Error(`${HOTKEY_ACTIONS[conflict[0]]} 与 ${HOTKEY_ACTIONS[conflict[1]]} 不能使用同一个快捷键。`);
  const settings = currentProductSettings(plugin);
  if (settings.shortcutMode === 'mixed' && normalized
    && normalized.toLowerCase() === normalizeShortcut(settings.actionHudShortcut).toLowerCase()) {
    throw new Error('独立快捷键不能与动作盘主快捷键重复。');
  }
  plugin.state.uiState.immersiveShortcuts = next;
  await plugin.persist();
  return registerImmersiveHotkeys(plugin, options);
}

async function resetImmersiveShortcuts(plugin, options = {}) {
  plugin.state.uiState.immersiveShortcuts = { ...DEFAULT_IMMERSIVE_SHORTCUTS };
  await plugin.persist();
  return registerImmersiveHotkeys(plugin, options);
}

module.exports = {
  HOTKEY_ACTIONS,
  LEGACY_ACTION_MAP,
  beginActionHud,
  closeActionHudSession,
  compactError,
  feedback,
  immersiveStatus,
  registerImmersiveHotkeys,
  registrationConflict,
  resetImmersiveShortcuts,
  resumePreparedPlayback,
  runCaptureAction,
  runImmersiveAction,
  setImmersiveStatus,
  shortcutConflict,
  successFeedback,
  unregisterImmersiveHotkeys,
  updateImmersiveShortcut
};

},
"learning-capture.cjs": (module, exports, require) => {
'use strict';

const { Notice, requestUrl } = require('obsidian');
const { clipboard } = require('electron');
const { resolveUniversalMediaSession } = __rhLoad("media-session.cjs");
const {
  registerRememberedNoteTarget,
  resolveRememberedNoteTarget
} = __rhLoad("note-target.cjs");
const { requestNativePotPlayer } = __rhLoad("native-potplayer.cjs");
const { requestPotPlayerBridge } = __rhLoad("potplayer-bridge.cjs");
const { currentProductSettings, normalizeCaptureFolder } = __rhLoad("product-settings.cjs");
const { updateResumePosition } = __rhLoad("resource-resolver.cjs");
const {
  buildContextCaptureMarkdown,
  buildContextCaptureNoteMarkdown,
  buildContextNoteMarkdown,
  buildContextPositionMarkdown,
  buildPlainCaptureMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
  captureFileName,
  freeformMediaTitle
} = __rhLoad("resource-note.cjs");

const CAPTURE_FOLDER = 'GoStudy/Captures';

function activeEditor(plugin, preferredEditor = null) {
  if (preferredEditor && typeof preferredEditor.replaceSelection === 'function') return preferredEditor;
  return resolveRememberedNoteTarget(plugin).editor;
}

function resolveLearningContext(plugin, playerMedia) {
  const settings = currentProductSettings(plugin);
  return resolveUniversalMediaSession(
    plugin.state,
    plugin.activeMediaSession,
    playerMedia,
    (resource) => plugin.resourceActions(resource),
    { allowFreeform: settings.freeformVideoNotesEnabled }
  );
}

function noteOutputOptions(plugin) {
  const settings = currentProductSettings(plugin);
  return {
    timeFormat: settings.timeDisplayFormat,
    backlinkTemplate: settings.backlinkTemplate,
    noteTemplate: settings.noteTemplate,
    captureTemplate: settings.captureTemplate,
    captureNoteTemplate: settings.captureNoteTemplate,
    plainNoteTemplate: settings.plainNoteTemplate,
    plainCaptureTemplate: settings.plainCaptureTemplate,
    plainCaptureNoteTemplate: settings.plainCaptureNoteTemplate
  };
}

async function persistRecordedPosition(plugin, resource, position) {
  if (!resource?.id || !plugin.state.resources?.[resource.id]) return false;
  updateResumePosition(plugin.state.resources[resource.id], position);
  plugin.activeMediaSession = {
    ...(plugin.activeMediaSession || {}),
    resourceId: resource.id,
    lastKnownPosition: { ...position },
    updatedAt: new Date().toISOString()
  };
  await plugin.persist();
  await plugin.workbenchLeaf?.view?.render?.();
  return true;
}

async function requestLearningPlayer(plugin, action, options = {}) {
  if (typeof options.bridgeRequest === 'function') {
    return options.bridgeRequest(options.requestUrl || requestUrl, action, options.bridgeOptions || {});
  }

  let nativeError = null;
  if (options.native !== false && (process.platform === 'win32' || options.nativeOptions?.allowNonWindows)) {
    try {
      return await (options.nativeRequest || requestNativePotPlayer)(action, {
        ...(options.nativeOptions || {}),
        pause: Boolean(options.pause)
      });
    } catch (error) {
      nativeError = error;
      if (options.nativeOnly) throw error;
    }
  }

  try {
    return await requestPotPlayerBridge(options.requestUrl || requestUrl, action, options.bridgeOptions || {});
  } catch (bridgeError) {
    if (nativeError) {
      const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
      throw new Error(`Go Study 原生视频控制失败：${message}`);
    }
    throw bridgeError;
  }
}

async function prepareCurrentLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const response = await requestLearningPlayer(plugin, 'current', options);
  const context = resolveLearningContext(plugin, response.media);
  return { ...context, editor, player: response };
}

async function insertPreparedMarkdown(plugin, prepared, markdown) {
  if (!prepared?.editor || typeof prepared.editor.replaceSelection !== 'function') {
    throw new Error('最近的学习笔记已经关闭或不可编辑。');
  }
  prepared.editor.replaceSelection(markdown);
  await persistRecordedPosition(plugin, prepared.resource, prepared.position);
  return { ...prepared, markdown };
}

async function insertCurrentLearningPosition(plugin, options = {}) {
  const prepared = await prepareCurrentLearningPosition(plugin, options);
  return insertPreparedMarkdown(
    plugin,
    prepared,
    buildContextPositionMarkdown(prepared, noteOutputOptions(plugin))
  );
}

async function ensureVaultFolder(vault, folderPath = CAPTURE_FOLDER) {
  if (!vault || typeof vault.getAbstractFileByPath !== 'function' || typeof vault.createFolder !== 'function') {
    throw new Error('当前 Vault 不支持创建截图目录。');
  }
  const safeFolder = normalizeCaptureFolder(folderPath);
  if (!safeFolder) return '';
  const parts = safeFolder.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (vault.getAbstractFileByPath(current)) continue;
    try {
      await vault.createFolder(current);
    } catch (error) {
      if (!vault.getAbstractFileByPath(current)) throw error;
    }
  }
  return safeFolder;
}

function capturePathCandidate(resource, position, index = 1, folderPath = CAPTURE_FOLDER) {
  const folder = normalizeCaptureFolder(folderPath);
  const base = captureFileName(resource, position, 'png');
  const join = (name) => folder ? `${folder}/${name}` : name;
  if (index <= 1) return join(base);
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  return join(`${stem}-${index}${ext}`);
}

function uniqueCapturePath(vault, resource, position, folderPath = CAPTURE_FOLDER) {
  for (let index = 1; index <= 999; index += 1) {
    const candidate = capturePathCandidate(resource, position, index, folderPath);
    if (!vault.getAbstractFileByPath(candidate)) return candidate;
  }
  throw new Error('同一位置的截图文件过多，无法生成唯一文件名。');
}

function clipboardPngBuffer(clipboardImpl = clipboard) {
  if (!clipboardImpl?.readImage) throw new Error('Electron 剪贴板图片接口不可用。');
  const image = clipboardImpl.readImage();
  if (!image || image.isEmpty?.()) throw new Error('播放器没有把有效截图写入剪贴板。');
  const png = image.toPNG?.();
  if (!png || !png.length) throw new Error('无法把播放器截图转换为 PNG。');
  return Buffer.from(png);
}

function learningNoteSourcePath(plugin) {
  try { return String(resolveRememberedNoteTarget(plugin).filePath || ''); }
  catch { return String(plugin?.app?.workspace?.getActiveFile?.()?.path || ''); }
}

async function systemAttachmentCapturePath(plugin, resource, position) {
  const vault = plugin?.app?.vault;
  const fileManager = plugin?.app?.fileManager;
  const filename = captureFileName(resource, position, 'png');
  const sourcePath = learningNoteSourcePath(plugin);
  if (typeof fileManager?.getAvailablePathForAttachment === 'function') {
    const resolved = String(await fileManager.getAvailablePathForAttachment(filename, sourcePath) || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (resolved) {
      const parent = resolved.includes('/') ? resolved.slice(0, resolved.lastIndexOf('/')) : '';
      if (parent) await ensureVaultFolder(vault, parent);
      return resolved;
    }
  }
  return uniqueCapturePath(vault, resource, position, '');
}

function captureSubject(resource, context = {}) {
  if (resource?.title) return resource;
  return { title: freeformMediaTitle(context.bridgeMedia || context.freeform || {}) };
}

async function saveCaptureToVault(plugin, resource, position, pngBuffer, context = {}) {
  const vault = plugin?.app?.vault;
  const subject = captureSubject(resource, context);
  const folder = currentProductSettings(plugin).captureFolder;
  let vaultPath;
  if (folder) {
    await ensureVaultFolder(vault, folder);
    vaultPath = uniqueCapturePath(vault, subject, position, folder);
  } else {
    vaultPath = await systemAttachmentCapturePath(plugin, subject, position);
  }
  if (typeof vault.createBinary !== 'function') throw new Error('当前 Vault 不支持写入二进制截图。');
  const bytes = Buffer.from(pngBuffer || []);
  if (!bytes.length) throw new Error('截图数据为空。');
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await vault.createBinary(vaultPath, arrayBuffer);
  return vaultPath;
}

async function prepareCaptureLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const response = await requestLearningPlayer(plugin, 'capture', options);
  const context = resolveLearningContext(plugin, response.media);
  const png = options.readClipboardPng ? options.readClipboardPng() : clipboardPngBuffer(options.clipboard || clipboard);
  return { ...context, editor, player: response, png };
}

async function commitPreparedCapture(plugin, prepared, markdownBuilder) {
  const vaultPath = await saveCaptureToVault(plugin, prepared.resource, prepared.position, prepared.png, prepared);
  const markdown = markdownBuilder(vaultPath);
  const result = await insertPreparedMarkdown(plugin, prepared, markdown);
  return { ...result, vaultPath };
}

async function captureFrameAndInsertLearningPosition(plugin, options = {}) {
  const prepared = await prepareCaptureLearningPosition(plugin, options);
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildContextCaptureMarkdown(prepared, vaultPath, noteOutputOptions(plugin))
  );
}

async function commitPreparedTypedNote(plugin, prepared, noteText) {
  return insertPreparedMarkdown(
    plugin,
    prepared,
    buildContextNoteMarkdown(prepared, noteText, noteOutputOptions(plugin))
  );
}

async function commitPreparedCaptureTypedNote(plugin, prepared, noteText) {
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildContextCaptureNoteMarkdown(
      prepared,
      vaultPath,
      noteText,
      noteOutputOptions(plugin)
    )
  );
}

async function insertPlainTypedNote(plugin, noteText, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const markdown = buildPlainNoteMarkdown(noteText, noteOutputOptions(plugin));
  editor.replaceSelection(markdown);
  return { mode: 'plain', editor, markdown };
}
async function commitPreparedPlainTypedNote(plugin, prepared, noteText) {
  return insertPreparedMarkdown(
    plugin,
    prepared,
    buildPlainNoteMarkdown(noteText, noteOutputOptions(plugin))
  );
}


async function commitPreparedPlainCapture(plugin, prepared) {
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildPlainCaptureMarkdown(vaultPath, noteOutputOptions(plugin))
  );
}

async function commitPreparedPlainCaptureTypedNote(plugin, prepared, noteText) {
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildPlainCaptureNoteMarkdown(vaultPath, noteText, noteOutputOptions(plugin))
  );
}

async function checkPotPlayerBridge(options = {}) {
  if (typeof options.bridgeRequest === 'function') {
    return options.bridgeRequest(options.requestUrl || requestUrl, 'ping', options.bridgeOptions || {});
  }
  if (options.native !== false && (process.platform === 'win32' || options.nativeOptions?.allowNonWindows)) {
    try { return await (options.nativeRequest || requestNativePotPlayer)('ping', options.nativeOptions || {}); }
    catch (error) { if (options.nativeOnly) throw error; }
  }
  return requestPotPlayerBridge(options.requestUrl || requestUrl, 'ping', options.bridgeOptions || {});
}

function commandErrorText(prefix, error) {
  return `${prefix}：${error instanceof Error ? error.message : String(error)}`;
}

function registerLearningCaptureCommands(plugin) {
  registerRememberedNoteTarget(plugin);

  plugin.addCommand({
    id: 'check-potplayer-bridge',
    name: '检查视频笔记增强状态',
    callback: () => {
      new Notice('正在检查视频笔记增强…', 1500);
      void checkPotPlayerBridge()
        .then((result) => new Notice(`视频笔记增强已连接 · ${result.transport || `协议 v${result.version}`}`))
        .catch((error) => new Notice(commandErrorText('视频笔记增强不可用', error), 6000));
    }
  });
  plugin.addCommand({
    id: 'insert-current-learning-position',
    name: '插入当前学习位置',
    callback: () => {
      new Notice('正在读取 PotPlayer 当前学习位置…', 1500);
      void insertCurrentLearningPosition(plugin)
        .then((result) => {
          const title = result.resource?.title || freeformMediaTitle(result.bridgeMedia || result.freeform || {});
          new Notice(`已记录：${title} · ${result.markdown.match(/\d{2}:\d{2}(?::\d{2})?/)?.[0] || ''}`);
        })
        .catch((error) => new Notice(commandErrorText('记录学习位置失败', error), 6000));
    }
  });
  plugin.addCommand({
    id: 'capture-frame-and-insert-learning-position',
    name: '截图并插入当前学习位置',
    callback: () => {
      new Notice('正在读取 PotPlayer 当前帧…', 1500);
      void captureFrameAndInsertLearningPosition(plugin)
        .then((result) => new Notice(`截图已保存：${result.vaultPath}`))
        .catch((error) => new Notice(commandErrorText('截图记录失败', error), 6000));
    }
  });
}

module.exports = {
  CAPTURE_FOLDER,
  activeEditor,
  captureFrameAndInsertLearningPosition,
  capturePathCandidate,
  checkPotPlayerBridge,
  clipboardPngBuffer,
  commandErrorText,
  commitPreparedCapture,
  commitPreparedCaptureTypedNote,
  commitPreparedPlainCapture,
  commitPreparedPlainCaptureTypedNote,
  commitPreparedPlainTypedNote,
  commitPreparedTypedNote,
  ensureVaultFolder,
  insertCurrentLearningPosition,
  insertPlainTypedNote,
  insertPreparedMarkdown,
  noteOutputOptions,
  persistRecordedPosition,
  prepareCaptureLearningPosition,
  prepareCurrentLearningPosition,
  registerLearningCaptureCommands,
  requestLearningPlayer,
  resolveLearningContext,
  saveCaptureToVault,
  captureSubject,
  systemAttachmentCapturePath,
  uniqueCapturePath
};

},
"learning-controls-ui.cjs": (module, exports, require) => {
'use strict';

const { Menu, Notice } = require('obsidian');
const { immersiveStatus } = __rhLoad("immersive-hotkeys.cjs");
const { currentProductSettings } = __rhLoad("product-settings.cjs");
const {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal
} = __rhLoad("resource-relink-ui.cjs");

function safePluginId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('无法为沉浸式控件生成安全作用域。');
  return id;
}

function controlScope(pluginId) {
  return `.workspace-leaf-content[data-type="${safePluginId(pluginId)}-workbench"]`;
}

function learningControlsCss(pluginId) {
  const scope = controlScope(pluginId);
  return `${scope} .rh-next-immersive-status {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 24px;
  text-align: center;
  cursor: default;
}
${scope} .rh-next-immersive-status.is-ready { color: var(--text-success); }
${scope} .rh-next-immersive-status.is-error { color: var(--text-error); }
.go-study-settings-heading {
  margin-top: 1.6em;
  margin-bottom: .35em;
}
`;
}

function statusText(plugin) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return '视频笔记增强已关闭。';
  const status = immersiveStatus(plugin);
  if (status.registered) {
    const count = status.registeredAccelerators?.length || 0;
    return `Windows 视频笔记增强已就绪 · ${count || 4} 个全局快捷键`;
  }
  return status.error || '视频笔记增强尚未就绪。';
}

function renderImmersiveStatus(plugin, root, doc = globalThis.document) {
  const actions = root?.querySelector?.('.rh-next-header-actions');
  if (!actions) return null;
  const existing = actions.querySelector?.('[data-go-study-immersive-status]');
  if (!currentProductSettings(plugin).videoEnhancementEnabled) {
    existing?.remove?.();
    return null;
  }
  const status = immersiveStatus(plugin);
  if (existing) {
    existing.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : 'is-error'}`;
    existing.textContent = status.registered ? '●' : '○';
    existing.title = statusText(plugin);
    existing.setAttribute('aria-label', statusText(plugin));
    return existing;
  }
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : 'is-error'}`;
  button.setAttribute('data-go-study-immersive-status', 'true');
  button.setAttribute('aria-label', statusText(plugin));
  button.title = statusText(plugin);
  button.textContent = status.registered ? '●' : '○';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    new Notice(statusText(plugin), 3500);
  });
  actions.prepend(button);
  return button;
}

function showCourseManagementMenu(plugin, event) {
  const menu = new Menu();
  menu.addItem((item) => item
    .setTitle('重新关联 OpenList 课程目录')
    .setIcon('folder-sync')
    .onClick(() => new OpenListFolderRemapModal(plugin.app, plugin).open()));
  menu.addItem((item) => item
    .setTitle('重新关联单个 OpenList 文件（高级）')
    .setIcon('file-cog')
    .onClick(() => new OpenListResourceRelinkModal(plugin.app, plugin).open()));
  menu.showAtMouseEvent(event);
  return menu;
}

function bindProjectCourseMenu(plugin, root) {
  const heading = root?.querySelector?.('.rh-next-project-heading');
  if (!heading || heading.dataset.goStudyCourseMenuBound === 'true') return false;
  heading.dataset.goStudyCourseMenuBound = 'true';
  heading.title = heading.title || '右键打开课程管理';
  heading.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCourseManagementMenu(plugin, event);
  });
  return true;
}

function installLearningControls(plugin, doc = globalThis.document) {
  if (!plugin?.manifest?.id || !doc?.querySelectorAll || !doc?.createElement) return null;
  const scope = controlScope(plugin.manifest.id);
  const inject = () => {
    for (const leaf of doc.querySelectorAll(scope)) {
      const root = leaf.querySelector?.('.rh-next-workbench');
      if (!root) continue;
      renderImmersiveStatus(plugin, root, doc);
      bindProjectCourseMenu(plugin, root);
    }
  };

  const style = doc.createElement('style');
  style.setAttribute('data-go-study-learning-controls-style', safePluginId(plugin.manifest.id));
  style.textContent = learningControlsCss(plugin.manifest.id);
  doc.head?.appendChild?.(style);

  inject();
  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(() => inject()) : null;
  observer?.observe?.(doc.body, { childList: true, subtree: true });
  const statusListener = () => inject();
  doc.addEventListener?.('go-study-immersive-status', statusListener);

  plugin.register?.(() => {
    observer?.disconnect?.();
    doc.removeEventListener?.('go-study-immersive-status', statusListener);
    style.remove?.();
  });
  return { observer, style, inject };
}

module.exports = {
  bindProjectCourseMenu,
  controlScope,
  installLearningControls,
  learningControlsCss,
  renderImmersiveStatus,
  safePluginId,
  showCourseManagementMenu,
  statusText
};

},
"main.cjs": (module, exports, require) => {
'use strict';

const {
  ItemView,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab = class {},
  requestUrl,
  Setting = class {},
  setIcon
} = require('obsidian');
const electron = require('electron');
const { shell, webUtils } = electron;
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
let safeStorage = electron.safeStorage;
let dialog = electron.dialog || electron.remote?.dialog;
try {
  const remote = require('@electron/remote');
  safeStorage = safeStorage || remote.require('electron').safeStorage;
  dialog = dialog || remote.dialog;
} catch { /* Current Obsidian versions expose Electron directly. */ }
const model = __rhLoad("model.cjs");
const {
  clampMemoHeight,
  deleteMemoHeight,
  getMemoHeight,
  setMemoHeight
} = __rhLoad("usage-polish.cjs");

const VIEW_TYPE = 'learning-resource-hub-next-workbench';
const ROUTES = ['today', 'project', 'library', 'subscriptions'];

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function isClientBlockedError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /ERR_BLOCKED_BY_CLIENT/i.test(message);
}

function iconButton(parent, icon, label, handler, cls = '') {
  const button = parent.createEl('button', { cls: `rh-next-icon-button ${cls}`.trim(), attr: { 'aria-label': label, title: label } });
  setIcon(button, icon);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handler(event);
  });
  return button;
}

function textButton(parent, label, icon, handler, cls = '') {
  const button = parent.createEl('button', { cls: `rh-next-button ${cls}`.trim() });
  if (icon) setIcon(button.createSpan({ cls: 'rh-next-button-icon' }), icon);
  button.createSpan({ text: label });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handler(event);
  });
  return button;
}

function kindIcon(kind) {
  return ({ video: 'clapperboard', anki: 'layers-3', pdf: 'file-text', file: 'file', web: 'globe-2' })[kind] || 'link';
}

function kindLabel(kind) {
  return ({ video: '视频', anki: 'Anki', pdf: 'PDF', file: '文件', web: '网页' })[kind] || '资源';
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return '';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const rest = Math.floor(value % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
}

const OPENLIST_CATEGORY_LABELS = {
  video: '可播放视频', pdf: 'PDF', document: '文档', image: '图片', audio: '音频', other: '其他'
};

function openListEntryCategory(entry) {
  const extension = String(entry?.name || '').split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension)) return 'video';
  if (extension === 'pdf') return 'pdf';
  if (['epub', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'rtf'].includes(extension)) return 'document';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image';
  if (['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'opus'].includes(extension)) return 'audio';
  return 'other';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '大小未知';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function openListDescriptor(source, entry, rootPath = '/') {
  const category = openListEntryCategory(entry);
  const remotePath = model.normalizeOpenListPath(entry.remotePath || `${rootPath}/${entry.name}`);
  const video = category === 'video';
  return {
    kind: video ? 'video' : category === 'pdf' ? 'pdf' : 'file',
    title: String(entry.name || remotePath.split('/').pop() || remotePath).replace(/\.[^.]+$/, ''),
    canonicalKey: `openlist:${source.identity || source.id}:${remotePath.toLowerCase()}`,
    sourceId: source.id,
    launcher: { type: video ? 'openlist' : 'openlist-file', sourceId: source.id, remotePath },
    metadata: { remotePath, rootPath, size: entry.size || 0, modified: entry.modified || entry.updated_at || '', category }
  };
}

function biliVideoDescriptor(video) {
  const parsed = model.parseBiliVideoUrl(video.url);
  const bvid = String(video.bvid || parsed?.bvid || '').toUpperCase();
  const page = Number(video.page || parsed?.page || 1);
  return {
    kind: 'video', title: video.title || '未命名视频',
    canonicalKey: bvid ? `bili:${bvid}:p${page}` : `url:${String(video.url || '').toLowerCase()}`,
    sourceId: '', launcher: { type: 'potplayer', target: video.url },
    metadata: { bvid, page, originalUrl: video.url, sourceUrl: video.url, cover: video.cover || '' }
  };
}

function input(parent, options = {}) {
  const el = parent.createEl(options.multiline ? 'textarea' : 'input', {
    cls: options.cls || 'rh-next-input',
    attr: { placeholder: options.placeholder || '' }
  });
  if (!options.multiline) el.type = options.type || 'text';
  el.value = options.value || '';
  return el;
}

class ResourceHubNextPlugin extends Plugin {
  async onload() {
    this.state = model.normalizeState(await this.loadData());
    this.memoResizeBindings = new Set();
    this.workbenchLeaf = null;
    this.sidebarWasCollapsed = null;
    this.openListTokens = new Map();
    this.openListLoginTasks = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new ResourceHubNextView(leaf, this));
    this.registerHoverLinkSource?.(VIEW_TYPE, { display: 'Learning Resource Hub Next', defaultMod: true });
    this.addRibbonIcon('library-big', '打开学习资源工作台 Next', () => void this.openWorkbench());
    this.addCommand({ id: 'open-workbench', name: '打开工作台', callback: () => void this.openWorkbench() });
    this.addCommand({ id: 'quick-add', name: '添加资源', callback: () => void this.openAddModal() });
    this.addSettingTab?.(new ResourceHubNextSettingTab(this.app, this));
    this.addCommand({ id: 'link-current-file-to-project', name: '将当前文件关联到学习项目', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile?.();
      if (!file) return false;
      if (!checking) new ProjectLinkModal(this.app, this, file).open();
      return true;
    } });
    this.addCommand({ id: 'open-project-for-current-file', name: '打开当前文件关联的学习项目', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile?.();
      const projects = file ? this.projectsForVaultPath(file.path) : [];
      if (!projects.length) return false;
      if (!checking) {
        if (projects.length === 1) void this.openWorkbench({ route: 'project', projectId: projects[0].id });
        else new LinkedProjectPickerModal(this.app, this, projects).open();
      }
      return true;
    } });
    if (this.app.workspace?.on) this.registerEvent(this.app.workspace.on('file-menu', (menu, entry) => this.addVaultFileMenu(menu, entry)));
    if (this.app.vault?.on) {
      this.registerEvent(this.app.vault.on('rename', (entry, oldPath) => void this.handleVaultRename(entry, oldPath)));
      this.registerEvent(this.app.vault.on('delete', (entry) => void this.handleVaultDelete(entry)));
      this.registerEvent(this.app.vault.on('create', (entry) => void this.handleVaultCreate(entry)));
    }
    await this.validateVaultRefs();
  }

  async onunload() {
    try {
      await this.flushMemoHeights();
    } finally {
      for (const binding of this.memoResizeBindings || []) binding.observer?.disconnect?.();
      this.memoResizeBindings?.clear?.();
      this.unregisterHoverLinkSource?.(VIEW_TYPE);
      await this.restoreSidebar();
      this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    }
  }

  async persist() {
    await this.saveData(this.state);
  }

  bindMemoHeight(textarea, projectId, memoId) {
    if (!textarea || !projectId || !memoId || textarea.dataset.rhMemoHeightBound === 'true') return;
    this.cleanupMemoResizeBindings();
    const savedHeight = getMemoHeight(this.state, projectId, memoId);
    if (savedHeight) textarea.style.height = `${savedHeight}px`;
    const binding = {
      textarea,
      projectId,
      memoId,
      observer: null,
      lastHeight: clampMemoHeight(textarea.getBoundingClientRect?.().height || textarea.offsetHeight || savedHeight),
      dirty: false
    };
    const capture = () => this.captureMemoHeight(binding);
    if (typeof ResizeObserver === 'function') {
      binding.observer = new ResizeObserver(capture);
      binding.observer.observe(textarea);
    }
    const flush = () => void this.flushMemoHeights();
    textarea.dataset.rhMemoHeightBound = 'true';
    textarea.addEventListener('pointerup', flush);
    textarea.addEventListener('mouseup', flush);
    textarea.addEventListener('blur', flush);
    this.memoResizeBindings.add(binding);
  }

  captureMemoHeight(binding) {
    if (!binding?.textarea) return false;
    const height = clampMemoHeight(binding.textarea.isConnected
      ? binding.textarea.getBoundingClientRect?.().height || binding.textarea.offsetHeight
      : binding.lastHeight);
    if (!height || (binding.lastHeight && Math.abs(height - binding.lastHeight) < 2)) return false;
    binding.lastHeight = height;
    setMemoHeight(this.state, binding.projectId, binding.memoId, height);
    binding.dirty = true;
    return true;
  }

  cleanupMemoResizeBindings() {
    for (const binding of [...(this.memoResizeBindings || [])]) {
      if (binding.textarea?.isConnected || binding.dirty) continue;
      binding.observer?.disconnect?.();
      this.memoResizeBindings.delete(binding);
    }
  }

  async flushMemoHeights() {
    if (!this.memoResizeBindings?.size) return;
    let dirty = false;
    for (const binding of this.memoResizeBindings) {
      if (binding.textarea?.isConnected) this.captureMemoHeight(binding);
      if (binding.dirty) dirty = true;
    }
    if (!dirty) return this.cleanupMemoResizeBindings();
    await this.persist();
    for (const binding of this.memoResizeBindings) binding.dirty = false;
    this.cleanupMemoResizeBindings();
  }

  vaultEntry(pathValue) {
    const normalized = model.normalizeVaultPath(pathValue);
    return this.app.vault.getAbstractFileByPath?.(normalized) || null;
  }

  allVaultEntries() {
    return (this.app.vault.getAllLoadedFiles?.() || []).filter((entry) => entry?.path && entry.path !== '/');
  }

  projectsForVaultPath(pathValue) {
    const ref = Object.values(this.state.vaultRefs || {}).find((item) => !item.deletedAt && model.normalizeVaultPath(item.path) === model.normalizeVaultPath(pathValue));
    if (!ref) return [];
    return model.activeProjects(this.state).filter((project) => (project.vaultRefIds || []).includes(ref.id));
  }

  async validateVaultRefs() {
    let changed = false;
    for (const ref of Object.values(this.state.vaultRefs || {})) {
      const exists = Boolean(this.vaultEntry(ref.path));
      if (!exists && !ref.missingAt) { model.markVaultRefMissing(this.state, ref.id); changed = true; }
      else if (exists && ref.missingAt) { model.restoreVaultRef(this.state, ref.id); changed = true; }
    }
    if (changed) await this.persist();
    return changed;
  }

  addVaultFileMenu(menu, entry) {
    if (!entry?.path) return;
    const projects = this.projectsForVaultPath(entry.path);
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(projects.length ? `管理学习项目关联（${projects.length}）` : '关联到学习项目…').setIcon('folder-symlink').onClick(() => new ProjectLinkModal(this.app, this, entry).open()));
    if (projects.length === 1) menu.addItem((item) => item.setTitle(`打开项目：${projects[0].title}`).setIcon('panel-top-open').onClick(() => void this.openWorkbench({ route: 'project', projectId: projects[0].id })));
    else if (projects.length > 1) menu.addItem((item) => item.setTitle('选择关联项目并打开…').setIcon('panel-top-open').onClick(() => new LinkedProjectPickerModal(this.app, this, projects).open()));
  }

  async handleVaultRename(entry, oldPath) {
    const oldNormalized = model.normalizeVaultPath(oldPath);
    const newNormalized = model.normalizeVaultPath(entry.path);
    const refs = Object.values(this.state.vaultRefs || {}).filter((item) => !item.deletedAt && (model.normalizeVaultPath(item.path) === oldNormalized || model.normalizeVaultPath(item.path).startsWith(`${oldNormalized}/`)));
    if (!refs.length) return;
    for (const ref of refs) {
      const current = model.normalizeVaultPath(ref.path);
      const nextPath = current === oldNormalized ? newNormalized : `${newNormalized}${current.slice(oldNormalized.length)}`;
      model.updateVaultRefPath(this.state, ref.id, nextPath);
    }
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  async handleVaultDelete(entry) {
    const deletedPath = model.normalizeVaultPath(entry.path);
    const refs = Object.values(this.state.vaultRefs || {}).filter((item) => !item.deletedAt && (model.normalizeVaultPath(item.path) === deletedPath || model.normalizeVaultPath(item.path).startsWith(`${deletedPath}/`)));
    if (!refs.length) return;
    for (const ref of refs) model.markVaultRefMissing(this.state, ref.id);
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  async handleVaultCreate(entry) {
    const createdPath = model.normalizeVaultPath(entry.path);
    const ref = Object.values(this.state.vaultRefs || {}).find((item) => item.missingAt && model.normalizeVaultPath(item.path) === createdPath);
    if (!ref) return;
    model.restoreVaultRef(this.state, ref.id);
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  vaultEntryType(entry) { return Array.isArray(entry?.children) ? 'folder' : 'file'; }

  vaultFileKind(entry) {
    if (this.vaultEntryType(entry) === 'folder') return 'folder';
    const extension = String(entry?.extension || entry?.path?.split('.').pop() || '').toLowerCase();
    if (extension === 'md') return /\.excalidraw\.md$/i.test(entry.path) ? 'plugin-file' : 'markdown';
    if (extension === 'canvas') return 'canvas';
    if (extension === 'base') return 'base';
    if (extension === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
    return 'other';
  }

  async openVaultRef(ref, options = {}) {
    const entry = this.vaultEntry(ref.path);
    if (!entry) {
      model.markVaultRefMissing(this.state, ref.id);
      await this.persist();
      new Notice('这个项目文件已移动或删除，请重新关联。', 5000);
      return false;
    }
    if (this.vaultEntryType(entry) === 'folder') {
      new VaultFolderBrowserModal(this.app, this, entry, ref).open();
      return true;
    }
    await this.openVaultEntry(entry, options);
    return true;
  }

  async openVaultEntry(entry, options = {}) {
    const leaf = this.app.workspace.getLeaf(options.newLeaf ? 'tab' : false);
    await leaf.openFile(entry, { active: true });
  }

  async revealVaultEntry(entry) {
    const explorer = this.app.workspace.getLeavesOfType?.('file-explorer')?.[0]?.view;
    if (explorer?.revealInFolder) {
      await explorer.revealInFolder(entry);
      return true;
    }
    new Notice('请先打开 Obsidian 文件列表，再尝试定位。');
    return false;
  }

  async createVaultProjectFile(projectId, kind) {
    new VaultFolderPickerModal(this.app, this, async (folderPath) => {
      const label = kind === 'canvas' ? '新建 Canvas' : '新建笔记';
      new TextPromptModal(this.app, label, kind === 'canvas' ? 'Canvas 名称' : '笔记名称', async (title) => {
        try {
          const extension = kind === 'canvas' ? '.canvas' : '.md';
          const baseName = safeText(title).replace(/[\\/:*?"<>|]/g, '-');
          const prefix = folderPath ? `${folderPath}/` : '';
          let candidate = `${prefix}${baseName}${extension}`;
          let suffix = 2;
          while (this.vaultEntry(candidate)) candidate = `${prefix}${baseName} ${suffix++}${extension}`;
          const content = kind === 'canvas' ? JSON.stringify({ nodes: [], edges: [] }, null, 2) : `# ${baseName}\n`;
          const file = await this.app.vault.create(candidate, content);
          const result = model.upsertVaultRef(this.state, { path: file.path, entryType: 'file', fileKind: kind === 'canvas' ? 'canvas' : 'markdown' });
          model.linkVaultRefToProject(this.state, projectId, result.vaultRef.id);
          model.recordRecentVaultCreatePath(this.state, folderPath || '');
          await this.persist();
          await this.workbenchLeaf?.view?.render?.();
          await this.openVaultRef(result.vaultRef);
        } catch (error) { new Notice(`创建失败：${error.message || String(error)}`, 6000); }
      }).open();
    }).open();
  }

  pluginStorageDir() {
    const basePath = this.app?.vault?.adapter?.getBasePath?.();
    if (!basePath) throw new Error('当前仓库不支持本地备份。');
    const configDir = this.app?.vault?.configDir || '.obsidian';
    const fallback = path.join(basePath, configDir, 'plugins', this.manifest?.id || 'learning-resource-hub-next');
    const manifestDir = String(this.manifest?.dir || '').trim();
    if (!manifestDir) return fallback;
    const candidate = path.isAbsolute(manifestDir) ? manifestDir : path.join(basePath, manifestDir);
    return fs.existsSync(candidate) ? candidate : fallback;
  }

  async createStateBackup(label = 'manual') {
    const safeLabel = String(label || 'manual').replace(/[^a-z0-9_-]+/gi, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `state-${timestamp}-${safeLabel}.json`;
    const backupDir = path.join(this.pluginStorageDir(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(this.state), 'utf8');
    return backupName;
  }

  async restoreStateBackup(backupName) {
    const safeName = path.basename(String(backupName || ''));
    if (!safeName) throw new Error('找不到清理前备份。');
    const backupPath = path.join(this.pluginStorageDir(), 'backups', safeName);
    if (!fs.existsSync(backupPath)) throw new Error('清理前备份已经不存在。');
    const restored = model.normalizeState(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
    restored.uiState.lastAction = null;
    this.state = restored;
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return restored;
  }

  async mutate(callback, { render = true } = {}) {
    const result = await callback(this.state);
    await this.persist();
    if (render) await this.workbenchLeaf?.view?.render?.();
    return result;
  }

  async openWorkbench(options = {}) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.workbenchLeaf = leaf;
    await this.collapseSidebar();
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ResourceHubNextView && options.route) await view.navigate(options.route, options);
    return view;
  }

  async undoLastAction() {
    const action = this.state.uiState.lastAction;
    if (action?.type === 'cleanup-resources' && action.backupName) {
      await this.restoreStateBackup(action.backupName);
      new Notice(`已撤回：${action.label || '资源清理'}，资源索引已从备份恢复。`, 6000);
      return;
    }
    const result = await this.mutate((state) => model.undoLastAction(state), { render: false });
    if (!result.undone) return new Notice('没有可以撤回的操作。');
    new Notice(`已撤回：${result.action.label || '上一步添加'}${result.removedResourceIds.length ? `，并清理 ${result.removedResourceIds.length} 条新建资源` : ''}`);
    await this.workbenchLeaf?.view?.render?.();
  }

  async collapseSidebar() {
    const split = this.app.workspace.leftSplit;
    if (!split || this.sidebarWasCollapsed !== null) return;
    this.sidebarWasCollapsed = Boolean(split.collapsed);
    if (!split.collapsed) await this.app.commands.executeCommandById('app:toggle-left-sidebar');
  }

  async restoreSidebar() {
    const split = this.app.workspace.leftSplit;
    if (!split || this.sidebarWasCollapsed === null) return;
    if (!this.sidebarWasCollapsed && split.collapsed) await this.app.commands.executeCommandById('app:toggle-left-sidebar');
    this.sidebarWasCollapsed = null;
  }

  async toggleSidebar() {
    await this.app.commands.executeCommandById('app:toggle-left-sidebar');
  }

  openAddModal(context = {}) {
    new UnifiedAddModal(this.app, this, context).open();
  }

  findOpenListSource(input) {
    const baseUrl = typeof input === 'string' ? input : input?.baseUrl;
    if (!baseUrl) return null;
    let normalized;
    try { normalized = model.normalizeOpenListBaseUrl(baseUrl); } catch { return null; }
    return Object.values(this.state.sources).find((source) => {
      if (source.type !== 'openlist' || source.deletedAt) return false;
      try { return model.normalizeOpenListBaseUrl(source.baseUrl) === normalized; } catch { return false; }
    }) || null;
  }

  toPotPlayerUri(target, time = '00:00:00') {
    return `jv://open?path=${encodeURIComponent(String(target || '').trim())}&time=${encodeURIComponent(time)}`;
  }

  resourceActions(resource) {
    return model.resolveResourceActions(resource, this.state.sources);
  }

  async markResourceStarted(resource) {
    if (!resource?.id || !this.state.resources[resource.id]) return;
    await this.mutate((state) => {
      model.markResourceOpened(state, resource.id);
      model.markResourceComplete(state, resource.id);
    }, { render: false });
  }

  async tryOpenInObsidian(target) {
    const registry = this.app?.viewRegistry;
    if (!registry?.getViewCreatorByType?.('webviewer')) return false;
    try {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: 'webviewer', active: true, state: { url: target } });
      this.app.workspace.revealLeaf(leaf);
      return true;
    } catch { return false; }
  }

  async openWebTarget(target, preference = '') {
    const safeTarget = model.validateExternalUri(target, ['https:', 'http:']);
    const mode = preference || this.state.uiState.webOpenPreference || 'system';
    if (mode === 'obsidian') {
      if (await this.tryOpenInObsidian(safeTarget)) return;
      new Notice('当前 Obsidian 未提供可用的内置网页浏览器，已回退系统浏览器。', 5000);
    }
    await shell.openExternal(safeTarget);
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    if (!resource || !target) return false;
    try {
      new Notice(`正在启动：${resource.title}`);
      if (actionType === 'web') {
        await this.openWebTarget(String(target), options.webPreference || '');
      } else if (target.type === 'file') {
        const error = await shell.openPath(target.path);
        if (error) throw new Error(error);
      } else if (target.type === 'anki') {
        await this.ensureAnkiRunning();
        await this.invokeAnki('guiDeckReview', { name: target.deck });
      } else if (target.type === 'openlist') {
        const source = this.state.sources[target.sourceId] || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(this.toPotPlayerUri(`${baseUrl}/d${encoded}${sign}`));
      } else if (target.type === 'openlist-file') {
        const source = this.state.sources[target.sourceId] || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(`${baseUrl}/d${encoded}${sign}`);
      } else if (target.type === 'potplayer') {
        await shell.openExternal(this.toPotPlayerUri(target.target));
      } else if (target.type === 'uri') {
        const legacyBili = model.parseBiliVideoUrl(target.uri);
        const legacyOpenListFolder = model.parseOpenListUrl(target.uri, Object.values(this.state.sources));
        if (legacyBili) await shell.openExternal(this.toPotPlayerUri(legacyBili.canonicalUrl));
        else if (legacyOpenListFolder) {
          new Notice('检测到旧版 OpenList 目录条目，请重新导入为可播放的视频合集。', 5000);
          this.openAddModal({ mode: 'source', sourceType: 'openlist', openListInput: target.uri, projectId: this.state.uiState.currentProjectId || '' });
          return false;
        } else await shell.openExternal(model.validateExternalUri(target.uri, ['https:', 'http:', 'jv:']));
      } else throw new Error('没有可用的启动地址。');
      await this.markResourceStarted(resource);
      new Notice(`已启动并默认完成：${resource.title}`);
      await this.workbenchLeaf?.view?.render?.();
      return true;
    } catch (error) {
      new Notice(`启动失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResource(resource) {
    const actions = this.resourceActions(resource);
    if (actions.playTarget) return this.openResourceAction(resource, 'play', actions.playTarget);
    if (actions.webTarget) return this.openResourceAction(resource, 'web', actions.webTarget);
    if (actions.defaultTarget) return this.openResourceAction(resource, 'default', actions.defaultTarget);
    new Notice('没有可用的启动地址。');
    return false;
  }

  showWebOpenMenu(event, resource, target) {
    const menu = new Menu();
    const current = this.state.uiState.webOpenPreference || 'system';
    menu.addItem((item) => item.setTitle(`系统浏览器${current === 'system' ? '（默认）' : ''}`).setIcon('external-link').onClick(() => void this.openResourceAction(resource, 'web', target, { webPreference: 'system' })));
    menu.addItem((item) => item.setTitle(`Obsidian 内置浏览器${current === 'obsidian' ? '（默认）' : ''}`).setIcon('panel-top-open').onClick(() => void this.openResourceAction(resource, 'web', target, { webPreference: 'obsidian' })));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('记住：系统浏览器').setIcon('check').onClick(async () => {
      this.state.uiState.webOpenPreference = 'system'; await this.persist(); new Notice('已把系统浏览器设为网页默认方式。');
    }));
    menu.addItem((item) => item.setTitle('记住：Obsidian 内置浏览器').setIcon('check').onClick(async () => {
      this.state.uiState.webOpenPreference = 'obsidian'; await this.persist(); new Notice('已把 Obsidian 内置浏览器设为网页默认方式。');
    }));
    menu.showAtMouseEvent(event);
  }

  encryptSecret(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('当前系统无法使用安全存储。');
    return safeStorage.encryptString(text).toString('base64');
  }

  decryptSecret(value) {
    if (!value) return '';
    if (!safeStorage?.isEncryptionAvailable?.()) return '';
    try { return safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { return ''; }
  }

  async invokeAnki(action, params = {}) {
    const source = Object.values(this.state.sources).find((item) => item.type === 'anki' && !item.deletedAt);
    const endpoint = source?.endpoint || 'http://127.0.0.1:8765';
    const response = await requestUrl({
      url: endpoint,
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ action, version: 6, params })
    });
    const payload = response.json;
    if (payload?.error) throw new Error(payload.error);
    return payload?.result;
  }

  resolveAnkiExecutable(configured = '') {
    const candidates = [
      configured,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Anki', 'anki.exe') : '',
      'C:\\Program Files\\Anki\\anki.exe',
      'C:\\Program Files (x86)\\Anki\\anki.exe'
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
  }

  async ensureAnkiRunning() {
    try { await this.invokeAnki('version'); return; } catch { /* start Anki below */ }
    const source = Object.values(this.state.sources).find((item) => item.type === 'anki' && !item.deletedAt) || {};
    const executable = this.resolveAnkiExecutable(source.executablePath);
    if (!executable) throw new Error('Anki 未启动，也没有找到 anki.exe；请先在来源连接中配置。');
    const args = source.profile ? ['-p', source.profile] : [];
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    const deadline = Date.now() + Math.max(5000, Number(source.startupTimeout || 30000));
    while (Date.now() < deadline) {
      try { await this.invokeAnki('version'); return; } catch { await new Promise((resolve) => window.setTimeout(resolve, 500)); }
    }
    throw new Error('Anki 已尝试启动，但 AnkiConnect 未在等待时间内响应。');
  }

  async loginOpenList(source) {
    const cached = this.openListTokens.get(source?.id);
    if (cached) return cached;
    const password = this.decryptSecret(source.encryptedPassword);
    if (!source.username || !password) return '';
    if (this.openListLoginTasks.has(source.id)) return this.openListLoginTasks.get(source.id);
    const task = this.withTimeout((async () => {
      const response = await requestUrl({
        url: `${String(source.baseUrl).replace(/\/+$/, '')}/api/auth/login`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ username: source.username, password }),
        throw: false
      });
      const payload = response.json;
      if (response.status >= 400 || payload?.code !== 200 || !payload?.data?.token) throw new Error(payload?.message || `OpenList 登录失败（HTTP ${response.status}）。`);
      this.openListTokens.set(source.id, payload.data.token);
      return payload.data.token;
    })(), 15000, 'OpenList 登录超过 15 秒，请检查服务是否在线。');
    this.openListLoginTasks.set(source.id, task);
    try { return await task; } finally { this.openListLoginTasks.delete(source.id); }
  }

  async withTimeout(promise, timeoutMs, message) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async requestOpenList(source, endpoint, body, token = '') {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = token;
    const invoke = (authHeaders) => this.withTimeout(requestUrl({
      url: `${String(source.baseUrl).replace(/\/+$/, '')}${endpoint}`,
      method: 'POST', headers: authHeaders,
      body: JSON.stringify(body),
      throw: false
    }), 15000, `OpenList 请求超过 15 秒：${body?.path || endpoint}`);
    let response = await invoke(headers);
    if ((response.status === 401 || Number(response.json?.code) === 401) && source.username) {
      this.openListTokens.delete(source.id);
      const freshToken = await this.loginOpenList(source);
      response = await invoke({ ...headers, Authorization: freshToken });
    }
    const payload = response.json;
    const code = Number(payload?.code || response.status);
    if (response.status >= 400 || code < 200 || code >= 300) throw new Error(payload?.message || `OpenList 请求失败（HTTP ${response.status}）。`);
    return payload?.data || {};
  }

  async listOpenList(source, remotePath, token, refresh = false) {
    const content = [];
    let page = 1;
    let total = 0;
    do {
      const data = await this.requestOpenList(source, '/api/fs/list', { path: remotePath, password: '', refresh: Boolean(refresh && page === 1), page, per_page: 200 }, token);
      const rows = Array.isArray(data?.content) ? data.content : [];
      content.push(...rows);
      total = Number(data?.total || content.length);
      page += 1;
      if (!rows.length) break;
    } while (content.length < total && page <= 10000);
    return content;
  }

  async getOpenList(source, remotePath, token) {
    return this.requestOpenList(source, '/api/fs/get', { path: remotePath, password: '' }, token);
  }

  async resolveOpenListPath(source, parsed) {
    if (!parsed?.isShare) return parsed?.rootPath || '/';
    const token = await this.loginOpenList(source);
    const headers = token ? { Authorization: token } : {};
    const response = await this.withTimeout(requestUrl({
      url: `${String(source.baseUrl).replace(/\/+$/, '')}/api/share/get?id=${encodeURIComponent(parsed.shareId)}`,
      method: 'GET', headers, throw: false
    }), 15000, '解析 OpenList 分享链接超时。');
    const payload = response.json;
    if (response.status >= 400 || Number(payload?.code || response.status) !== 200) throw new Error(payload?.message || '无法解析 OpenList 分享链接，请改用普通目录链接。');
    const directPath = payload?.data?.path;
    if (directPath) return model.normalizeOpenListPath(`${directPath}/${parsed.sharePath || ''}`);
    const files = Array.isArray(payload?.data?.files) ? payload.data.files : [];
    if (files.length !== 1) throw new Error('分享链接无法还原为唯一目录，请改用普通 OpenList 目录链接。');
    return model.normalizeOpenListPath(`${files[0]}/${parsed.sharePath || ''}`);
  }

  async scanOpenList(source, rootPath, options = {}) {
    if (typeof options === 'boolean') options = { refresh: options };
    const token = await this.loginOpenList(source);
    const results = [];
    const failures = [];
    const visited = new Set();
    const queue = [model.normalizeOpenListPath(rootPath || '/')];
    const videoExt = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts']);
    const maxDirectories = Math.max(1, Number(options.maxDirectories || 5000));
    const maxFiles = Math.max(1, Number(options.maxFiles || 20000));
    while (queue.length) {
      if (options.isCancelled?.()) throw new Error('扫描已取消。');
      const batch = queue.splice(0, Math.max(1, Math.min(6, Number(options.concurrency || 4))));
      const listings = await Promise.all(batch.map(async (current) => {
        if (options.isCancelled?.()) return null;
        if (visited.has(current)) return null;
        visited.add(current);
        try { return { current, entries: await this.listOpenList(source, current, token, Boolean(options.refresh && visited.size === 1)) }; }
        catch (error) { failures.push({ path: current, error }); return null; }
      }));
      for (const listing of listings.filter(Boolean)) {
        for (const entry of listing.entries) {
          if (options.isCancelled?.()) throw new Error('扫描已取消。');
          const fullPath = model.normalizeOpenListPath(`${listing.current}/${entry.name}`);
          if (entry.is_dir) {
            if (visited.size + queue.length < maxDirectories) queue.push(fullPath);
            else failures.push({ path: fullPath, error: new Error(`目录数量超过 ${maxDirectories} 个。`) });
            continue;
          }
          const ext = entry.name.split('.').pop()?.toLowerCase();
          const accepted = options.acceptEntry ? options.acceptEntry({ ...entry, remotePath: fullPath }) : videoExt.has(ext);
          if (accepted) {
            if (results.length >= maxFiles) throw new Error(`文件数量超过 ${maxFiles} 个，请选择更小的目录后重试。`);
            results.push({ ...entry, remotePath: fullPath });
          }
        }
        options.onProgress?.({ path: listing.current, found: results.length, directories: visited.size });
      }
    }
    if (!results.length && failures.length) throw failures[0].error;
    results.sort((left, right) => String(left.remotePath).localeCompare(String(right.remotePath), 'zh-CN', { numeric: true }));
    results.failures = failures;
    results.scannedDirectories = visited.size;
    return results;
  }

  async scanLocalFolder(rootPath, options = {}) {
    const results = [];
    const failures = [];
    const allowed = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts', 'pdf', 'epub', 'doc', 'docx', 'ppt', 'pptx']);
    const resolvedRoot = path.resolve(rootPath);
    const stat = await fs.promises.stat(resolvedRoot);
    if (!stat.isDirectory()) throw new Error('选择的路径不是文件夹。');
    const queue = [resolvedRoot];
    const maxDirectories = Math.max(1, Number(options.maxDirectories || 5000));
    const maxFiles = Math.max(1, Number(options.maxFiles || 20000));
    let scannedDirectories = 0;
    let ignoredCount = 0;
    while (queue.length) {
      if (options.isCancelled?.()) throw new Error('扫描已取消。');
      const current = queue.shift();
      if (scannedDirectories >= maxDirectories) throw new Error(`目录数量超过 ${maxDirectories} 个，请选择更小的文件夹后重试。`);
      let entries;
      try { entries = await fs.promises.readdir(current, { withFileTypes: true }); }
      catch (error) { failures.push({ path: current, error }); continue; }
      scannedDirectories += 1;
      for (const entry of entries) {
        if (options.isCancelled?.()) throw new Error('扫描已取消。');
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (scannedDirectories + queue.length >= maxDirectories) throw new Error(`目录数量超过 ${maxDirectories} 个，请选择更小的文件夹后重试。`);
          queue.push(fullPath);
        }
        else if (entry.isFile() && allowed.has(entry.name.split('.').pop()?.toLowerCase())) {
          if (results.length >= maxFiles) throw new Error(`文件数量超过 ${maxFiles} 个，请选择更小的文件夹后重试。`);
          results.push(fullPath);
        }
        else if (entry.isFile()) ignoredCount += 1;
      }
      options.onProgress?.({ path: current, found: results.length, directories: scannedDirectories, failures: failures.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    results.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    results.failures = failures;
    results.scannedDirectories = scannedDirectories;
    results.ignoredCount = ignoredCount;
    return results;
  }

  async requestBiliDataViaNode(url, headers, redirectCount = 0) {
    if (redirectCount > 3) throw new Error('B站备用请求重定向次数过多。');
    const requestTarget = new URL(url);
    if (requestTarget.protocol !== 'https:' || !(requestTarget.hostname === 'bilibili.com' || requestTarget.hostname.endsWith('.bilibili.com'))) {
      throw new Error('B站备用请求拒绝了非 Bilibili HTTPS 地址。');
    }
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers }, (response) => {
        const status = Number(response.statusCode || 0);
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          resolve(this.requestBiliDataViaNode(nextUrl, headers, redirectCount + 1));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > 5 * 1024 * 1024) {
            response.destroy(new Error('B站备用请求响应超过 5 MB。'));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on('error', (error) => reject(new Error(`B站备用请求失败：${error.message || String(error)}`)));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status, json: JSON.parse(body) }); }
          catch { reject(new Error(`B站备用请求返回了无法解析的数据（HTTP ${status}）。`)); }
        });
      });
      request.setTimeout(15000, () => request.destroy(new Error('B站备用请求超过 15 秒。')));
      request.on('error', (error) => reject(new Error(`B站备用请求失败：${error.message || String(error)}`)));
    });
  }

  async requestBiliData(url, source = {}) {
    const headers = {
      Referer: source.mid ? `https://space.bilibili.com/${encodeURIComponent(source.mid)}/` : 'https://www.bilibili.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    let response;
    try {
      response = await requestUrl({ url, method: 'GET', headers, throw: false });
    } catch (error) {
      if (!isClientBlockedError(error)) throw error;
      response = await this.requestBiliDataViaNode(url, headers);
    }
    const payload = response.json;
    if (response.status >= 400) throw new Error(`B站请求失败：HTTP ${response.status}`);
    if (payload?.code !== 0) throw new Error(`B站接口 ${payload?.code ?? '未知'}：${payload?.message || '请求失败'}`);
    return payload?.data;
  }

  async fetchBiliVideo(bvid) {
    const [view, parts] = await Promise.all([
      this.requestBiliData(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`),
      this.requestBiliData(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`)
    ]);
    const list = Array.isArray(parts) ? parts : [];
    const items = list.length <= 1
      ? [{ title: String(view?.title || bvid), url: `https://www.bilibili.com/video/${bvid}`, page: 1, duration: Number(view?.duration || 0) }]
      : list.map((part) => ({ title: String(part.part || `${view?.title || bvid} P${part.page}`), url: `https://www.bilibili.com/video/${bvid}?p=${part.page}`, page: Number(part.page || 1), duration: Number(part.duration || 0) }));
    const season = view?.ugc_season;
    const collectionItems = [];
    for (const section of season?.sections || []) {
      for (const episode of section.episodes || []) {
        const episodeBvid = String(episode.bvid || episode.arc?.bvid || '');
        if (!episodeBvid) continue;
        collectionItems.push({
          bvid: episodeBvid,
          title: String(episode.title || episode.arc?.title || episodeBvid),
          url: `https://www.bilibili.com/video/${episodeBvid}`,
          cover: String(episode.arc?.pic || episode.cover || ''),
          duration: Number(episode.arc?.duration || episode.duration || 0),
          page: 1
        });
      }
    }
    const uniqueCollection = [...new Map(collectionItems.map((item) => [item.bvid.toUpperCase(), item])).values()];
    return {
      title: String(view?.title || bvid), owner: String(view?.owner?.name || ''), cover: String(view?.pic || ''),
      description: String(view?.desc || ''), items,
      collection: season ? { id: String(season.id || ''), title: String(season.title || '所属合集'), items: uniqueCollection } : null
    };
  }

  async searchBiliUsers(keyword) {
    const query = safeText(keyword);
    if (!query) return [];
    const data = await this.requestBiliData(`https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(query)}&page=1`);
    return model.normalizeBiliUserSearchResults(data).slice(0, 20);
  }

  async fetchBiliCollections(source) {
    const result = [];
    let page = 1;
    let seen = 0;
    let total = 0;
    do {
      const data = await this.requestBiliData(`https://api.bilibili.com/x/polymer/web-space/seasons_series_list?mid=${encodeURIComponent(source.mid)}&page_num=${page}&page_size=20`, source);
      const seasons = data?.items_lists?.seasons_list || [];
      const series = data?.items_lists?.series_list || [];
      for (const entry of seasons) {
        const meta = entry.meta || {};
        if (Number(meta.total || 0) > 0) result.push({ type: 'season', id: String(meta.season_id), name: String(meta.name || '未命名合集'), total: Number(meta.total || 0), cover: String(meta.cover || meta.cover_url || '') });
      }
      for (const entry of series) {
        const meta = entry.meta || {};
        if (Number(meta.total || 0) > 0) result.push({ type: 'series', id: String(meta.series_id), name: String(meta.name || '未命名系列'), total: Number(meta.total || 0), cover: String(meta.cover || meta.cover_url || '') });
      }
      seen += seasons.length + series.length;
      total = Number(data?.items_lists?.page?.total || 0);
      page += 1;
    } while (seen < total && page <= 20);
    return result;
  }

  async fetchBiliCollectionItems(source, collection) {
    const items = [];
    let page = 1;
    let total = 0;
    do {
      const url = collection.type === 'series'
        ? `https://api.bilibili.com/x/series/archives?mid=${encodeURIComponent(source.mid)}&series_id=${encodeURIComponent(collection.id)}&only_normal=true&sort=asc&pn=${page}&ps=30`
        : `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${encodeURIComponent(source.mid)}&season_id=${encodeURIComponent(collection.id)}&sort_reverse=false&page_num=${page}&page_size=30`;
      const data = await this.requestBiliData(url, source);
      for (const video of data?.archives || []) {
        if (!video?.bvid) continue;
        const cover = String(video.pic || video.cover || '');
        items.push({ bvid: String(video.bvid), title: String(video.title || '未命名视频'), cover: cover.startsWith('//') ? `https:${cover}` : cover, url: `https://www.bilibili.com/video/${video.bvid}` });
      }
      total = Number(data?.page?.total || 0);
      page += 1;
    } while (items.length < total && page <= 100);
    return items;
  }

  async fetchBiliRecentVideos(source) {
    const data = await this.requestBiliData(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${encodeURIComponent(source.mid)}`, source);
    const result = [];
    for (const entry of data?.items || []) {
      const archive = entry?.modules?.module_dynamic?.major?.archive;
      if (!archive?.bvid) continue;
      const cover = String(archive.cover || '');
      result.push({
        bvid: String(archive.bvid),
        title: String(archive.title || '未命名视频'),
        cover: cover.startsWith('//') ? `https:${cover}` : cover,
        publishedAt: Number(entry?.modules?.module_author?.pub_ts || 0) * 1000,
        url: `https://www.bilibili.com/video/${archive.bvid}`
      });
    }
    return result.slice(0, 24);
  }

  async fetchBiliCollectionPreviewVideos(source, collections, limit = 24) {
    const byBvid = new Map();
    for (const collection of (collections || []).slice(0, 8)) {
      if (byBvid.size >= limit) break;
      const url = collection.type === 'series'
        ? `https://api.bilibili.com/x/series/archives?mid=${encodeURIComponent(source.mid)}&series_id=${encodeURIComponent(collection.id)}&only_normal=true&sort=desc&pn=1&ps=30`
        : `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${encodeURIComponent(source.mid)}&season_id=${encodeURIComponent(collection.id)}&sort_reverse=true&page_num=1&page_size=30`;
      const data = await this.requestBiliData(url, source);
      for (const video of data?.archives || []) {
        if (!video?.bvid || byBvid.has(String(video.bvid))) continue;
        const cover = String(video.pic || video.cover || '');
        byBvid.set(String(video.bvid), {
          bvid: String(video.bvid), title: String(video.title || '未命名视频'),
          cover: cover.startsWith('//') ? `https:${cover}` : cover,
          publishedAt: Number(video.pubdate || video.created || 0) * 1000,
          url: `https://www.bilibili.com/video/${video.bvid}`
        });
        if (byBvid.size >= limit) break;
      }
    }
    return [...byBvid.values()];
  }

  async refreshBiliProfile(source) {
    const errors = [];
    let succeeded = 0;
    try {
      const profile = await this.requestBiliData(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(source.mid)}`, source);
      const card = profile?.card || {};
      Object.assign(source, {
        alias: String(card.name || source.alias || `UP ${source.mid}`),
        avatar: String(card.face || source.avatar || ''),
        description: String(card.sign || source.description || ''),
        followers: Number(profile?.follower || source.followers || 0),
        profileUpdatedAt: new Date().toISOString()
      });
      succeeded += 1;
    } catch (error) { errors.push(`主页：${error.message || String(error)}`); }
    try { source.collections = await this.fetchBiliCollections(source); succeeded += 1; }
    catch (error) { errors.push(`合集：${error.message || String(error)}`); }
    try {
      let recent;
      try {
        recent = await this.fetchBiliRecentVideos(source);
        source.recentSyncMode = '动态投稿';
      } catch (error) {
        recent = await this.fetchBiliCollectionPreviewVideos(source, source.collections, 24);
        source.recentSyncMode = '合集补全';
        if (!recent.length) throw error;
      }
      if (recent.length) source.recentVideos = recent;
      succeeded += 1;
    } catch (error) { errors.push(`投稿：${error.message || String(error)}`); }
    source.lastSyncAt = new Date().toISOString();
    source.lastError = errors.join('；');
    await this.persist();
    if (!succeeded) throw new Error(source.lastError || 'B站主页资料读取失败。');
    return source;
  }
}

class ResourceHubNextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: '学习资源工作台' });
    new Setting(this.containerEl)
      .setName('显示辅助说明')
      .setDesc('显示页面副标题和卡片中的解释文字；进度、状态、错误和操作文字不会隐藏。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.state.uiState.showInterfaceTips !== false)
        .onChange(async (value) => {
          this.plugin.state.uiState.showInterfaceTips = value;
          await this.plugin.persist();
          await this.plugin.workbenchLeaf?.view?.render?.();
        }));
  }
}

class ResourceHubNextView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.route = plugin.state.uiState.route || 'today';
    this.currentProjectId = plugin.state.uiState.currentProjectId || '';
    this.drawerModuleId = '';
    this.rendering = false;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() {
    const labels = { today: '今日', project: '项目', library: '资料库', subscriptions: '订阅' };
    return `学习资源工作台 - ${labels[this.route] || '今日'}`;
  }
  getIcon() { return 'library-big'; }

  async onOpen() {
    this.plugin.workbenchLeaf = this.leaf;
    await this.plugin.collapseSidebar();
    await this.render();
  }

  async onClose() {
    await this.flushProjectMemo?.();
    this.projectBoardResizeObserver?.disconnect();
    this.projectBoardResizeObserver = null;
    this.saveScroll();
    this.contentEl.empty();
    if (this.plugin.workbenchLeaf === this.leaf) this.plugin.workbenchLeaf = null;
    await this.plugin.restoreSidebar();
  }

  routeKey() {
    return this.route === 'project' ? `project:${this.currentProjectId || 'none'}` : this.route;
  }

  saveScroll() {
    const scroller = this.contentEl.querySelector('.rh-next-workbench');
    if (scroller) this.plugin.state.uiState.scrollPositions[this.routeKey()] = scroller.scrollTop;
  }

  async navigate(route, options = {}) {
    this.saveScroll();
    this.route = ROUTES.includes(route) ? route : 'today';
    if (options.projectId !== undefined) this.currentProjectId = options.projectId || '';
    this.plugin.state.uiState.route = this.route;
    this.plugin.state.uiState.currentProjectId = this.currentProjectId;
    await this.plugin.persist();
    await this.render();
  }

  async render() {
    if (this.rendering) return;
    this.rendering = true;
    try {
      const flushMemo = this.flushProjectMemo;
      this.flushProjectMemo = null;
      await flushMemo?.();
      const state = this.plugin.state;
      const projects = model.activeProjects(state);
      if (!this.currentProjectId || !state.projects[this.currentProjectId]) this.currentProjectId = projects[0]?.id || '';
      state.uiState.currentProjectId = this.currentProjectId;
      this.projectBoardResizeObserver?.disconnect();
      this.projectBoardResizeObserver = null;
      this.contentEl.empty();
      this.contentEl.addClass('rh-next-view-host');
      const root = this.contentEl.createDiv({ cls: 'rh-next-workbench' });
      root.toggleClass('is-hiding-interface-tips', state.uiState.showInterfaceTips === false);
      this.renderHeader(root);
      const main = root.createDiv({ cls: 'rh-next-page' });
      if (this.route === 'project') this.renderProject(main, projects);
      else if (this.route === 'library') this.renderLibrary(main);
      else if (this.route === 'subscriptions') this.renderSubscriptions(main);
      else this.renderToday(main, projects);
      this.renderSidebarRestore(root);
      if (this.drawerModuleId && state.modules[this.drawerModuleId]) this.renderDrawer(root, this.drawerModuleId);
      const restore = Number(state.uiState.scrollPositions[this.routeKey()] || 0);
      requestAnimationFrame(() => { root.scrollTop = restore; });
      this.leaf.updateHeader?.();
    } finally {
      this.rendering = false;
    }
  }

  renderHeader(root) {
    const header = root.createDiv({ cls: 'rh-next-header' });
    const brand = header.createDiv({ cls: 'rh-next-brand' });
    const logo = brand.createDiv({ cls: 'rh-next-logo' });
    setIcon(logo, 'library-big');
    const brandText = brand.createDiv();
    brandText.createEl('strong', { text: '学习资源管理站' });
    brandText.createEl('small', { text: '收集、编排与启动中心' });
    const nav = header.createDiv({ cls: 'rh-next-nav' });
    for (const [route, label, icon] of [['today', '今日', 'sun'], ['project', '项目', 'folder-kanban'], ['library', '资料库', 'library'], ['subscriptions', '订阅', 'rss']]) {
      textButton(nav, label, icon, () => this.navigate(route), this.route === route ? 'is-active' : '');
    }
    const actions = header.createDiv({ cls: 'rh-next-header-actions' });
    const lastAction = this.plugin.state.uiState.lastAction;
    if (lastAction) iconButton(actions, 'undo-2', `撤回：${lastAction.label || '上一步添加'}`, () => this.plugin.undoLastAction(), 'is-subtle');
    iconButton(actions, 'search', '搜索资源', () => this.openSearch());
    textButton(actions, '添加', 'plus', () => this.plugin.openAddModal({ projectId: this.currentProjectId }), 'is-primary');
  }

  renderSidebarRestore(root) {
    const button = root.createEl('button', { cls: 'rh-next-sidebar-restore', attr: { title: '显示或隐藏 Obsidian 侧栏', 'aria-label': '显示或隐藏 Obsidian 侧栏' } });
    setIcon(button, 'panel-left');
    button.addEventListener('click', () => void this.plugin.toggleSidebar());
  }

  renderToday(main, projects) {
    const state = this.plugin.state;
    const hero = main.createDiv({ cls: 'rh-next-page-heading' });
    const title = hero.createDiv();
    title.createEl('h1', { text: '今天，从这里开始' });
    title.createEl('p', { cls: 'rh-next-interface-tip', text: '只显示今天要执行的计划；项目负责收集，今日负责行动。' });
    textButton(hero, '添加学习计划', 'plus', () => this.plugin.openAddModal({ mode: 'plan', projectId: this.currentProjectId }), 'is-primary');

    const layout = main.createDiv({ cls: 'rh-next-today-layout' });
    const taskArea = layout.createDiv({ cls: 'rh-next-task-area' });
    const activePlans = Object.values(state.plans).filter((plan) => !plan.archivedAt && !plan.deletedAt && model.planScheduledFor(plan));
    if (!activePlans.length) this.renderEmpty(taskArea, 'calendar-plus', '还没有今日计划', '在项目里将模块或资源加入学习计划。', '前往项目', () => this.navigate('project'));
    for (const project of model.todayProjects(state)) {
      const plans = model.projectPlans(state, project.id).filter((plan) => model.planScheduledFor(plan));
      if (!plans.length) continue;
      const collapsed = Boolean(state.uiState.collapsedTodayProjects[project.id]);
      const group = taskArea.createDiv({ cls: `rh-next-task-group ${collapsed ? 'is-collapsed' : ''}`, attr: { 'data-today-order-kind': 'project', 'data-today-order-key': project.id } });
      const progress = plans.map((plan) => model.planProgress(plan));
      const done = progress.filter((item) => item.done).length;
      const groupHead = group.createDiv({ cls: 'rh-next-task-group-head' });
      const left = groupHead.createDiv({ cls: 'rh-next-task-group-title' });
      const drag = left.createSpan({ cls: 'rh-next-today-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${project.title}顺序`, 'aria-label': `拖动调整${project.title}顺序` } });
      setIcon(drag, 'grip-vertical');
      const chevron = left.createSpan();
      setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
      left.createEl('strong', { text: project.title });
      left.createSpan({ text: `${done}/${plans.length}` });
      const next = plans.find((plan) => !model.planProgress(plan).done) || plans[0];
      groupHead.createEl('small', { text: next ? `下一项：${next.title}` : '今日已完成' });
      groupHead.addEventListener('click', async () => {
        state.uiState.collapsedTodayProjects[project.id] = !collapsed;
        await this.plugin.persist();
        await this.render();
      });
      this.attachTodayReorder(group, drag, 'project', project.id);
      if (!collapsed) {
        const body = group.createDiv({ cls: 'rh-next-task-list' });
        for (const plan of plans) this.renderPlanRow(body, plan, { projectContext: project });
      }
    }
    this.renderTodaySidebar(layout.createDiv({ cls: 'rh-next-action-sidebar' }), projects, activePlans);
  }

  renderTodaySidebar(sidebar, projects, plans) {
    const state = this.plugin.state;
    const unfinished = plans.find((plan) => !model.planProgress(plan).done);
    const recent = [...state.activity].reverse().find((entry) => entry.type === 'resource-opened');
    const recentResource = recent ? state.resources[recent.resourceId] : null;
    const done = plans.filter((plan) => model.planProgress(plan).done).length;
    const renderers = {
      current: () => {
        const card = this.createTodaySideCard(sidebar, 'current', '当前任务', 'is-accent');
        card.createEl('h3', { text: unfinished?.title || recentResource?.title || '今天尚未开始' });
        card.createEl('p', { cls: recentResource ? '' : 'rh-next-interface-tip', text: recentResource ? `上次打开：${recentResource.title}` : '从一个明确的动作开始，不必整理全部资料。' });
        if (recentResource) textButton(card, '继续学习', 'play', () => this.plugin.openResource(recentResource), 'is-primary');
        else if (unfinished) textButton(card, '查看任务', 'arrow-right', () => this.focusPlan(unfinished.id));
      },
      progress: () => {
        const card = this.createTodaySideCard(sidebar, 'progress', '今日进度');
        const metrics = card.createDiv({ cls: 'rh-next-metrics' });
        for (const [value, label] of [[new Set(plans.map((plan) => plan.projectId)).size, '项目'], [plans.length, '任务'], [done, '完成']]) {
          const item = metrics.createDiv(); item.createEl('strong', { text: String(value) }); item.createEl('small', { text: label });
        }
      },
      inbox: () => {
        const card = this.createTodaySideCard(sidebar, 'inbox', '待利用资源');
        card.createEl('h3', { text: `${state.inbox.length} 条在收件箱` });
        card.createEl('p', { cls: 'rh-next-interface-tip', text: '加入项目后才进入长期组织，不强迫每次收集都立即分类。' });
        textButton(card, '整理收件箱', 'inbox', () => this.navigate('library', { libraryPage: 'inbox' }));
      },
      memo: () => {
        const card = this.createTodaySideCard(sidebar, 'memo', '今日便签', 'rh-next-sticky');
        const textarea = input(card, { multiline: true, placeholder: '写一条临时备注，不进入任务系统……', value: state.notes.today?.text || '' });
        textarea.addEventListener('change', async () => {
          state.notes.today = { id: 'today', text: textarea.value, updatedAt: new Date().toISOString() };
          await this.plugin.persist();
        });
      }
    };
    for (const cardId of state.uiState.todaySidebarOrder) renderers[cardId]?.();
  }

  createTodaySideCard(sidebar, cardId, label, cls = '') {
    const card = sidebar.createDiv({ cls: `rh-next-side-card ${cls}`.trim(), attr: { 'data-today-order-kind': 'sidebar', 'data-today-order-key': cardId } });
    const head = card.createDiv({ cls: 'rh-next-side-card-head' });
    const drag = head.createSpan({ cls: 'rh-next-today-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${label}顺序`, 'aria-label': `拖动调整${label}顺序` } });
    setIcon(drag, 'grip-vertical');
    head.createEl(cardId === 'progress' ? 'h3' : 'small', { text: label });
    this.attachTodayReorder(card, drag, 'sidebar', cardId);
    return card;
  }

  attachTodayReorder(element, handle, kind, key) {
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      this.draggedTodayOrder = { kind, key };
      event.dataTransfer?.setData('text/plain', `${kind}:${key}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      element.addClass('is-dragging');
    });
    handle.addEventListener('dragend', () => {
      this.draggedTodayOrder = null;
      element.removeClass('is-dragging');
      this.contentEl.querySelectorAll('.is-today-drag-target').forEach((target) => target.removeClass('is-today-drag-target'));
    });
    element.addEventListener('dragover', (event) => {
      if (!this.draggedTodayOrder || this.draggedTodayOrder.kind !== kind || this.draggedTodayOrder.key === key) return;
      event.preventDefault();
      element.addClass('is-today-drag-target');
    });
    element.addEventListener('dragleave', () => element.removeClass('is-today-drag-target'));
    element.addEventListener('drop', async (event) => {
      const source = this.draggedTodayOrder;
      if (!source || source.kind !== kind || source.key === key) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      this.draggedTodayOrder = null;
      element.removeClass('is-today-drag-target');
      await this.moveTodayOrder(kind, source.key, key, { after });
    });
    handle.addEventListener('keydown', async (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const order = kind === 'project'
        ? model.todayProjects(this.plugin.state).filter((project) => model.projectPlans(this.plugin.state, project.id).some((plan) => model.planScheduledFor(plan))).map((project) => project.id)
        : this.plugin.state.uiState.todaySidebarOrder;
      const index = order.indexOf(key);
      const adjacent = event.key === 'ArrowUp' ? order[index - 1] : order[index + 1];
      if (!adjacent) return;
      event.preventDefault(); event.stopPropagation();
      await this.moveTodayOrder(kind, key, adjacent, { focus: true, after: event.key === 'ArrowDown' });
    });
  }

  async moveTodayOrder(kind, sourceKey, targetKey, options = {}) {
    if (kind === 'project') model.moveTodayProjectBefore(this.plugin.state, sourceKey, targetKey, { after: options.after });
    else model.moveTodaySidebarCardBefore(this.plugin.state, sourceKey, targetKey, { after: options.after });
    await this.plugin.persist();
    await this.render();
    const focusKey = options.focusKey || sourceKey;
    if (options.focus) requestAnimationFrame(() => this.contentEl.querySelector(`[data-today-order-kind="${kind}"][data-today-order-key="${CSS.escape(focusKey)}"] .rh-next-today-drag`)?.focus());
  }

  renderPlanRow(parent, plan, options = {}) {
    const progress = model.planProgress(plan);
    const row = parent.createDiv({ cls: `rh-next-plan-row ${progress.done ? 'is-done' : ''}`, attr: { 'data-plan-id': plan.id } });
    const button = row.createEl('button', { cls: 'rh-next-plan-check', attr: { title: progress.done ? '减少一次' : '确认完成一次' } });
    setIcon(button, progress.done ? 'circle-check-big' : 'circle');
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.mutate((state) => model.incrementPlan(state, plan.id, progress.done ? -1 : 1));
    });
    const icon = row.createDiv({ cls: 'rh-next-plan-icon' });
    setIcon(icon, plan.targetType === 'module' ? 'blocks' : 'link');
    const text = row.createDiv({ cls: 'rh-next-plan-copy' });
    text.createEl('strong', { text: plan.title });
    text.createEl('small', { text: `今日进度 ${progress.completed}/${progress.target} · ${this.scheduleLabel(plan)}` });
    const bar = row.createDiv({ cls: 'rh-next-progress' });
    bar.createDiv({ cls: 'rh-next-progress-fill', attr: { style: `width:${Math.min(100, progress.completed / progress.target * 100)}%` } });
    iconButton(row, 'chevron-right', '打开学习内容', () => this.openPlanTarget(plan));
  }

  scheduleLabel(plan) {
    const weekdays = Array.isArray(plan.schedule?.weekdays) ? plan.schedule.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 0];
    const ordered = [1, 2, 3, 4, 5, 6, 0];
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const dayText = weekdays.length === 7 ? '每天' : ordered.map((day, index) => weekdays.includes(day) ? labels[index] : '').filter(Boolean).join('、');
    return `${dayText || '未选择刷新日'} · ${String(Number(plan.resetHour ?? 4)).padStart(2, '0')}:00 刷新`;
  }

  focusPlan(planId) {
    const target = this.contentEl.querySelector(`[data-plan-id="${CSS.escape(planId)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('is-highlighted');
    window.setTimeout(() => target?.classList.remove('is-highlighted'), 1200);
  }

  openPlanTarget(plan) {
    const targetId = plan.targetIds?.[0];
    if (plan.targetType === 'module') {
      this.drawerModuleId = targetId;
      void this.render();
      return;
    }
    const resource = this.plugin.state.resources[targetId];
    if (resource) void this.plugin.openResource(resource);
  }

  renderProject(main, projects) {
    const state = this.plugin.state;
    main.addClass('rh-next-project-page');
    const project = state.projects[this.currentProjectId] || projects[0] || null;
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv();
    const pageTitle = copy.createEl('h1', { text: project?.title || '项目', attr: project ? { title: '双击重命名项目' } : {} });
    if (project) pageTitle.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameProjectInline(pageTitle, project); });
    copy.createEl('p', { cls: 'rh-next-interface-tip', text: '学习模块、项目文件、待办和便签共享同一块可调整工作台。' });
    textButton(heading, '新建项目', 'folder-plus', () => this.promptProject(), 'is-primary');
    if (!projects.length) {
      this.renderEmpty(main, 'folder-plus', '还没有项目', '创建第一个项目，再从收件箱或链接添加资源。', '新建项目', () => this.promptProject());
      return;
    }
    const switcher = main.createDiv({ cls: 'rh-next-project-switcher' });
    for (const project of projects) textButton(switcher, project.title, 'folder', () => this.navigate('project', { projectId: project.id }), project.id === this.currentProjectId ? 'is-active' : '');
    const layout = main.createDiv({ cls: 'rh-next-project-layout' });
    const title = layout.createDiv({ cls: 'rh-next-section-heading rh-next-project-heading' });
    const titleCopy = title.createDiv();
    titleCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '双击模块名可改名；右键模块可加入待办任务。' });
    const titleActions = title.createDiv({ cls: 'rh-next-section-actions' });
    textButton(titleActions, '新建模块', 'blocks', () => this.promptModule(project.id));
    textButton(titleActions, '添加内容', 'plus', () => this.plugin.openAddModal({ projectId: project.id }), 'is-primary');
    iconButton(title, 'more-horizontal', '项目操作', (event) => {
      const menu = new Menu();
      menu.addItem((item) => item.setTitle('重命名项目').setIcon('pencil').onClick(() => void this.renameProjectInline(pageTitle, project)));
      const archivedModuleCount = Object.values(state.modules).filter((module) => module.projectId === project.id && module.archivedAt && !module.deletedAt).length;
      menu.addItem((item) => item.setTitle(`已归档模块${archivedModuleCount ? `（${archivedModuleCount}）` : ''}`).setIcon('archive-restore').onClick(() => new ArchivedModulesModal(this.app, this.plugin, project.id).open()));
      menu.addItem((item) => item.setTitle('恢复默认布局').setIcon('layout-grid').onClick(async () => {
        await this.resetProjectBoardLayout(project.id);
      }));
      menu.addItem((item) => item.setTitle('新建便签').setIcon('sticky-note').onClick(() => void this.createProjectMemoCard(project.id)));
      menu.addItem((item) => item.setTitle('归档项目').setIcon('archive').onClick(async () => {
        await this.plugin.mutate((next) => model.archiveProject(next, project.id), { render: false });
        this.currentProjectId = model.activeProjects(this.plugin.state)[0]?.id || '';
        await this.navigate('project', { projectId: this.currentProjectId });
      }));
      menu.addSeparator();
      menu.addItem((item) => item.setTitle('永久删除项目').setIcon('trash-2').onClick(() => {
        new ConfirmActionModal(this.app, {
          title: `永久删除“${project.title}”？`,
          message: '项目、学习模块和相关计划会被删除。你可以同时清理删除后不再被任何项目、计划或收件箱引用的资源。',
          checkboxLabel: '同时删除仅属于此项目的孤立资源',
          checkboxDefault: true,
          confirmLabel: '永久删除',
          onConfirm: async ({ checked }) => {
            const result = await this.plugin.mutate((next) => model.deleteProject(next, project.id, { deleteOrphans: checked }), { render: false });
            if (result.removedResourceIds.length) new Notice(`已同步清理 ${result.removedResourceIds.length} 条孤立资源。`);
            this.currentProjectId = model.activeProjects(this.plugin.state)[0]?.id || '';
            await this.navigate(this.currentProjectId ? 'project' : 'today', { projectId: this.currentProjectId });
          }
        }).open();
      }));
      menu.showAtMouseEvent(event);
    });
    const modules = model.projectModules(state, project.id);
    const board = layout.createDiv({ cls: 'rh-next-project-board', attr: { 'aria-label': `${project.title} 项目布局` } });
    const boardItems = model.projectBoardItems(state, project.id);
    const boardItemByKey = new Map(boardItems.map((item) => [item.key, item]));
    const mediumOrder = new Map([
      ...boardItems.filter((item) => item.kind === 'module').sort((left, right) => left.row - right.row || left.column - right.column).map((item) => item.key),
      ...boardItems.filter((item) => item.kind !== 'module').sort((left, right) => left.row - right.row || left.column - right.column).map((item) => item.key)
    ].map((key, index) => [key, index + 1]));
    for (const module of modules) {
      const item = boardItemByKey.get(`module:${module.id}`);
      if (item) this.renderModuleCard(board, module, { projectBoardItem: item, mediumOrder: mediumOrder.get(item.key) });
    }
    this.renderProjectUtilities(board, project, boardItemByKey, mediumOrder);
    this.renderProjectMemos(board, project, boardItemByKey, mediumOrder);
    this.renderProjectBoardDropSlots(board, project, boardItems);
    this.observeProjectBoard(board);
  }

  renderProjectUtilities(parent, project, boardItemByKey, mediumOrder) {
    const order = ['files', 'tasks'];
    const labels = { tasks: ['待办任务', 'list-todo'], files: ['项目文件', 'files'], memo: ['便签备注', 'sticky-note'] };
    for (const panelType of order) {
      const boardItem = boardItemByKey.get(`utility:${panelType}`);
      if (!boardItem) continue;
      const [label, icon] = labels[panelType] || labels.tasks;
      const collapsed = Boolean(this.plugin.state.uiState.projectPanelCollapsedByProject?.[project.id]?.[panelType]);
      const panel = parent.createDiv({ cls: `rh-next-utility-panel rh-next-project-board-item ${collapsed ? 'is-collapsed' : ''}`, attr: { 'data-panel-type': panelType } });
      this.setProjectBoardItemPosition(panel, boardItem, mediumOrder.get(boardItem.key));
      const head = panel.createDiv({ cls: 'rh-next-utility-panel-head' });
      const drag = head.createSpan({ cls: 'rh-next-utility-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${label}位置`, 'aria-label': `拖动调整${label}位置` } }); setIcon(drag, 'grip-vertical');
      const title = head.createDiv({ cls: 'rh-next-utility-title' }); setIcon(title.createSpan(), icon); title.createEl('strong', { text: label });
      const summary = this.projectPanelSummary(panelType, project); if (summary) title.createEl('small', { text: summary });
      iconButton(head, 'plus', panelType === 'tasks' ? '添加待办' : panelType === 'files' ? '添加项目文件' : '新建便签', (event) => this.addProjectUtilityItem(event, panelType, project));
      iconButton(head, collapsed ? 'chevron-down' : 'chevron-up', collapsed ? `展开${label}` : `折叠${label}`, async () => {
        model.setProjectPanelCollapsed(this.plugin.state, project.id, panelType, !collapsed); await this.plugin.persist(); await this.render();
      });
      this.attachProjectBoardDrag(panel, drag, project, boardItem);
      if (collapsed) continue;
      const body = panel.createDiv({ cls: 'rh-next-utility-panel-body' });
      if (panelType === 'files') this.renderProjectFiles(body, project);
      else this.renderProjectPlanStack(body, project, { compact: true });
    }
  }

  setProjectBoardItemPosition(element, item, mediumOrder = 1) {
    element.dataset.boardKey = item.key;
    element.dataset.boardColumn = String(item.column);
    element.dataset.boardRow = String(item.row);
    element.style.setProperty('--rh-board-column', String(item.column));
    element.style.setProperty('--rh-board-medium-order', String(mediumOrder || 1));
  }

  attachProjectBoardDrag(element, handle, project, item) {
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      this.draggedProjectBoardKey = item.key;
      this.draggedProjectBoardKind = item.kind;
      this.suppressProjectBoardClickUntil = Date.now() + 400;
      event.dataTransfer?.setData('text/plain', item.key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      element.addClass('is-dragging');
      const board = element.closest('.rh-next-project-board');
      board?.addClass('is-layout-dragging');
      requestAnimationFrame(() => this.layoutProjectBoard(board));
    });
    handle.addEventListener('dragend', () => this.finishProjectBoardDrag(element));
    element.addEventListener('dragover', (event) => {
      if (!this.draggedProjectBoardKey || this.draggedProjectBoardKey === item.key) return;
      if ((this.draggedProjectBoardKind === 'memo') !== (item.kind === 'memo')) return;
      event.preventDefault();
      element.addClass('is-drag-target');
    });
    element.addEventListener('dragleave', () => element.removeClass('is-drag-target'));
    element.addEventListener('drop', async (event) => {
      if (!this.draggedProjectBoardKey || this.draggedProjectBoardKey === item.key) return;
      if ((this.draggedProjectBoardKind === 'memo') !== (item.kind === 'memo')) return;
      event.preventDefault(); event.stopPropagation();
      element.removeClass('is-drag-target');
      const source = this.draggedProjectBoardKey;
      this.finishProjectBoardDrag(element);
      await this.moveProjectBoardItem(project.id, source, item.column, item.row, { side: item.side });
    });
  }

  finishProjectBoardDrag(element = null) {
    this.draggedProjectBoardKey = '';
    this.draggedProjectBoardKind = '';
    this.suppressProjectBoardClickUntil = Date.now() + 250;
    element?.removeClass('is-dragging');
    const board = element?.closest('.rh-next-project-board') || this.contentEl.querySelector('.rh-next-project-board');
    board?.removeClass('is-layout-dragging');
    board?.querySelectorAll('.is-drag-target').forEach((target) => target.removeClass('is-drag-target'));
    board?.querySelectorAll('.is-dragging').forEach((target) => target.removeClass('is-dragging'));
    requestAnimationFrame(() => this.layoutProjectBoard(board));
  }

  renderProjectBoardDropSlots(board, project, boardItems) {
    const occupied = new Set(boardItems.map((item) => `${item.column}:${item.row}`));
    const maxRow = Math.max(1, ...boardItems.map((item) => item.row));
    for (let row = 1; row <= maxRow + 1; row += 1) {
      for (let column = 1; column <= 4; column += 1) {
        if (occupied.has(`${column}:${row}`)) continue;
        const slot = board.createDiv({
          cls: `rh-next-project-board-slot ${row > maxRow ? 'is-extension-slot' : ''}`,
          attr: { 'data-board-column': String(column), 'data-board-row': String(row), 'aria-hidden': 'true' }
        });
        slot.style.setProperty('--rh-board-column', String(column));
        const memoSides = slot.createDiv({ cls: 'rh-next-project-board-memo-slots' });
        for (const side of ['left', 'right']) {
          const half = memoSides.createDiv({ cls: `rh-next-project-board-memo-slot is-${side}` });
          half.addEventListener('dragover', (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation(); half.addClass('is-drag-target');
          });
          half.addEventListener('dragleave', () => half.removeClass('is-drag-target'));
          half.addEventListener('drop', async (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation();
            const source = this.draggedProjectBoardKey;
            this.finishProjectBoardDrag(slot);
            await this.moveProjectBoardItem(project.id, source, column, row, { side });
          });
        }
        slot.addEventListener('dragover', (event) => {
          if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind === 'memo') return;
          event.preventDefault(); slot.addClass('is-drag-target');
        });
        slot.addEventListener('dragleave', () => slot.removeClass('is-drag-target'));
        slot.addEventListener('drop', async (event) => {
          if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind === 'memo') return;
          event.preventDefault(); event.stopPropagation();
          const source = this.draggedProjectBoardKey;
          this.finishProjectBoardDrag(slot);
          await this.moveProjectBoardItem(project.id, source, column, row);
        });
      }
    }
    board.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.draggedProjectBoardKey) return;
      event.preventDefault(); this.finishProjectBoardDrag();
    });
  }

  observeProjectBoard(board) {
    const schedule = () => {
      if (this.projectBoardLayoutFrame) cancelAnimationFrame(this.projectBoardLayoutFrame);
      this.projectBoardLayoutFrame = requestAnimationFrame(() => this.layoutProjectBoard(board));
    };
    if (typeof ResizeObserver === 'function') {
      this.projectBoardResizeObserver = new ResizeObserver(schedule);
      board.querySelectorAll('.rh-next-project-board-item').forEach((item) => this.projectBoardResizeObserver.observe(item));
    }
    schedule();
  }

  layoutProjectBoard(board) {
    if (!board?.isConnected) return;
    const rowHeight = 8; const rowGap = 4; const slotSpan = 9;
    const wideLayout = getComputedStyle(board).gridAutoRows !== 'auto';
    const heading = board.previousElementSibling?.hasClass('rh-next-project-heading') ? board.previousElementSibling : null;
    const headingHeight = wideLayout ? Math.ceil(heading?.getBoundingClientRect().height || 0) : 0;
    const headingSpan = headingHeight ? Math.ceil((headingHeight + 18 + rowGap) / (rowHeight + rowGap)) : 0;
    board.style.minHeight = headingHeight ? `${headingHeight}px` : '';
    for (let column = 1; column <= 4; column += 1) {
      // 宽窗口前三列为学习主区，先为项目标题留位；第四列从顶部即是可吸附网格。
      let nextRow = wideLayout && column <= 3 ? headingSpan + 1 : 1;
      let previousLogicalRow = 0;
      const entries = [...board.querySelectorAll(`[data-board-column="${column}"]`)]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .sort((left, right) => Number(left.dataset.boardRow) - Number(right.dataset.boardRow));
      for (const element of entries) {
        const logicalRow = Number(element.dataset.boardRow);
        nextRow += Math.max(0, logicalRow - previousLogicalRow - 1) * slotSpan;
        const measured = element.hasClass('rh-next-project-board-slot') ? 0 : element.getBoundingClientRect().height;
        const span = Math.max(slotSpan, Math.ceil((measured + rowGap) / (rowHeight + rowGap)));
        element.style.gridColumn = String(column);
        element.style.gridRow = `${nextRow} / span ${span}`;
        element.style.transform = wideLayout && column === 4 ? 'translateY(-20px)' : '';
        nextRow += span;
        previousLogicalRow = logicalRow;
      }
    }
  }

  async moveProjectBoardItem(projectId, itemKey, column, row, options = {}) {
    const hadLayout = Boolean(this.plugin.state.uiState.projectBoardLayouts?.[projectId]);
    const layoutBefore = hadLayout ? JSON.parse(JSON.stringify(this.plugin.state.uiState.projectBoardLayouts[projectId])) : null;
    const actionBefore = this.plugin.state.uiState.lastAction;
    try {
      model.moveProjectBoardItem(this.plugin.state, projectId, itemKey, column, row, { side: options.side });
      await this.plugin.persist();
      if (options.focus) this.projectBoardFocusKey = itemKey;
      await this.render();
      if (options.focus) requestAnimationFrame(() => this.contentEl.querySelector(`[data-board-key="${CSS.escape(itemKey)}"] [draggable="true"]`)?.focus());
      new Notice(`布局已移动到第 ${column} 列、第 ${row} 行${options.side ? ` ${options.side === 'right' ? '右' : '左'}侧` : ''}。`);
    } catch (error) {
      if (layoutBefore) this.plugin.state.uiState.projectBoardLayouts[projectId] = layoutBefore;
      else if (!hadLayout) delete this.plugin.state.uiState.projectBoardLayouts[projectId];
      this.plugin.state.uiState.lastAction = actionBefore;
      try { await this.plugin.persist(); } catch { /* 保留原错误，界面状态已经回滚。 */ }
      new Notice(`布局保存失败：${error.message || String(error)}`, 6000);
      await this.render();
    }
  }

  async resetProjectBoardLayout(projectId) {
    const layoutBefore = JSON.parse(JSON.stringify(this.plugin.state.uiState.projectBoardLayouts?.[projectId] || null));
    const actionBefore = this.plugin.state.uiState.lastAction;
    try {
      model.resetProjectBoardLayout(this.plugin.state, projectId);
      await this.plugin.persist();
      await this.render();
      new Notice('已恢复默认项目布局，可从顶部撤回。');
    } catch (error) {
      if (layoutBefore) this.plugin.state.uiState.projectBoardLayouts[projectId] = layoutBefore;
      this.plugin.state.uiState.lastAction = actionBefore;
      try { await this.plugin.persist(); } catch { /* 保留原错误，界面状态已经回滚。 */ }
      new Notice(`恢复默认布局失败：${error.message || String(error)}`, 6000);
      await this.render();
    }
  }

  projectPanelSummary(panelType, project) {
    if (panelType === 'tasks') return `${model.projectPlans(this.plugin.state, project.id).length} 项`;
    if (panelType === 'files') return `${model.projectVaultRefs(this.plugin.state, project.id).length} 项`;
    return '';
  }

  async addProjectUtilityItem(event, panelType, project) {
    if (panelType === 'tasks') return this.plugin.openAddModal({ mode: 'plan', projectId: project.id });
    if (panelType === 'files') return this.showProjectFileAddMenu(event, project);
    return this.createProjectMemoCard(project.id);
  }

  renderProjectFiles(parent, project) {
    const refs = model.projectVaultRefs(this.plugin.state, project.id);
    if (!refs.length) {
      const empty = parent.createDiv({ cls: 'rh-next-compact-empty' }); empty.createEl('strong', { text: '还没有项目文件' });
      return;
    }
    const list = parent.createDiv({ cls: 'rh-next-project-file-list' });
    for (const ref of refs) this.renderProjectFileTreeRow(list, project, ref, 0, true);
    const recent = this.recentProjectVaultEntries(refs);
    if (recent.length) {
      const recentCollapsed = Boolean(this.plugin.state.uiState.projectRecentCollapsedByProject?.[project.id]);
      const recentHead = parent.createEl('button', { cls: 'rh-next-project-file-section-head', attr: { type: 'button', 'aria-expanded': String(!recentCollapsed) } });
      setIcon(recentHead.createSpan(), recentCollapsed ? 'chevron-right' : 'chevron-down');
      recentHead.createSpan({ text: '最近修改' });
      recentHead.createEl('small', { text: `${recent.length} 项` });
      recentHead.addEventListener('click', async () => { model.setProjectRecentCollapsed(this.plugin.state, project.id, !recentCollapsed); await this.plugin.persist(); await this.render(); });
      if (recentCollapsed) return;
      const recentList = parent.createDiv({ cls: 'rh-next-project-file-list is-recent' });
      for (const entry of recent.slice(0, 3)) {
        const row = recentList.createDiv({ cls: 'rh-next-project-file-row is-recent' });
        const icon = row.createSpan({ cls: 'rh-next-project-file-icon' }); setIcon(icon, this.plugin.vaultFileKind(entry) === 'canvas' ? 'layout-dashboard' : 'file-text');
        const copy = row.createDiv({ cls: 'rh-next-project-file-copy' }); copy.createSpan({ text: entry.name || entry.path.split('/').pop() });
        copy.createEl('small', { text: `${entry.path} · ${new Date(entry.stat.mtime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` });
        row.addEventListener('click', () => void this.plugin.openVaultEntry(entry));
        row.addEventListener('mouseover', (event) => this.app.workspace.trigger?.('hover-link', { event, source: VIEW_TYPE, hoverParent: row, targetEl: row, linktext: entry.path, sourcePath: '' }));
      }
    }
  }

  recentProjectVaultEntries(refs) {
    const byPath = new Map();
    for (const ref of refs) {
      const entry = this.plugin.vaultEntry(ref.path);
      if (!entry) continue;
      if (this.plugin.vaultEntryType(entry) === 'folder') {
        for (const child of Array.isArray(entry.children) ? entry.children : []) {
          if (this.plugin.vaultEntryType(child) === 'file' && child.stat?.mtime) byPath.set(child.path, child);
        }
      }
    }
    return [...byPath.values()].sort((left, right) => Number(right.stat?.mtime || 0) - Number(left.stat?.mtime || 0)).slice(0, 3);
  }

  showProjectFileAddMenu(event, project) {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('关联已有文件').setIcon('file-plus').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: 'file', multiple: true, onChooseMany: (entries) => this.linkVaultEntries(project.id, entries) }).open()));
    menu.addItem((item) => item.setTitle('关联已有文件夹').setIcon('folder-plus').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: 'folder', multiple: true, onChooseMany: (entries) => this.linkVaultEntries(project.id, entries) }).open()));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('新建普通笔记').setIcon('file-text').onClick(() => void this.plugin.createVaultProjectFile(project.id, 'markdown')));
    menu.addItem((item) => item.setTitle('新建 Canvas').setIcon('layout-dashboard').onClick(() => void this.plugin.createVaultProjectFile(project.id, 'canvas')));
    menu.showAtMouseEvent(event);
  }

  async linkVaultEntry(projectId, entry) {
    await this.linkVaultEntries(projectId, [entry]);
  }

  async linkVaultEntries(projectId, entries) {
    const uniqueEntries = [...new Map((entries || []).filter((entry) => entry?.path).map((entry) => [entry.path, entry])).values()];
    if (!uniqueEntries.length) return;
    const stateBefore = JSON.parse(JSON.stringify(this.plugin.state));
    let result;
    try {
      result = model.linkVaultEntriesToProject(this.plugin.state, projectId, uniqueEntries.map((entry) => ({ path: entry.path, entryType: this.plugin.vaultEntryType(entry), fileKind: this.plugin.vaultFileKind(entry) })));
      await this.plugin.persist();
    } catch (error) {
      this.plugin.state = stateBefore;
      throw error;
    }
    await this.render();
    new Notice(result.linkedVaultRefIds.length ? `已关联 ${result.linkedVaultRefIds.length} 个项目文件，可从顶部撤回。` : '所选项目文件均已关联。');
  }

  renderProjectFileTreeRow(parent, project, ref, depth = 0, linkedRoot = false) {
    const entry = this.plugin.vaultEntry(ref.path); const missing = !entry || ref.missingAt; const pinned = (project.pinnedVaultRefIds || []).includes(ref.id);
    const folder = ref.entryType === 'folder';
    this.expandedProjectVaultFolders ||= new Set();
    const expanded = folder && this.expandedProjectVaultFolders.has(ref.path);
    const row = parent.createDiv({ cls: `rh-next-project-file-row ${missing ? 'is-missing' : ''}`, attr: { 'data-depth': String(depth) } });
    row.style.setProperty('--rh-file-depth', String(depth));
    const disclosure = row.createSpan({ cls: 'rh-next-project-file-disclosure' });
    if (folder && !missing) setIcon(disclosure, expanded ? 'chevron-down' : 'chevron-right');
    const icon = row.createSpan({ cls: 'rh-next-project-file-icon' }); setIcon(icon, ref.entryType === 'folder' ? 'folder' : ref.fileKind === 'canvas' ? 'layout-dashboard' : ref.fileKind === 'markdown' ? 'file-text' : ref.fileKind === 'image' ? 'image' : 'file');
    const copy = row.createDiv({ cls: 'rh-next-project-file-copy' }); copy.createSpan({ text: ref.path.split('/').pop() || ref.path, attr: { title: ref.path } });
    const modified = entry?.stat?.mtime ? new Date(entry.stat.mtime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const childCount = ref.entryType === 'folder' && Array.isArray(entry?.children) ? entry.children.length : 0;
    copy.createEl('small', { text: missing ? '文件已移动或删除' : ref.entryType === 'folder' ? `${childCount} 项` : modified });
    row.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (folder && !missing) {
        if (expanded) this.expandedProjectVaultFolders.delete(ref.path); else this.expandedProjectVaultFolders.add(ref.path);
        void this.render();
      } else void this.plugin.openVaultRef(ref, { newLeaf: event.ctrlKey || event.metaKey });
    });
    if (!missing && ref.entryType === 'file') row.addEventListener('mouseover', (event) => this.app.workspace.trigger?.('hover-link', { event, source: VIEW_TYPE, hoverParent: row, targetEl: row, linktext: ref.path, sourcePath: '' }));
    if (linkedRoot) iconButton(row, 'pin', pinned ? '取消置顶' : '置顶', async () => { model.togglePinnedVaultRef(this.plugin.state, project.id, ref.id); await this.plugin.persist(); await this.render(); }, pinned ? 'is-primary' : 'is-subtle');
    if (linkedRoot) iconButton(row, 'more-horizontal', '项目文件操作', (event) => {
      const menu = new Menu();
      if (!missing && ref.entryType === 'file') menu.addItem((item) => item.setTitle('打开').setIcon('external-link').onClick(() => void this.plugin.openVaultRef(ref)));
      if (!missing && ref.entryType === 'file') menu.addItem((item) => item.setTitle('在新标签打开').setIcon('panel-top-open').onClick(() => void this.plugin.openVaultRef(ref, { newLeaf: true })));
      if (!missing) menu.addItem((item) => item.setTitle('在文件列表中显示').setIcon('folder-search').onClick(() => void this.plugin.revealVaultEntry(entry)));
      if (missing) menu.addItem((item) => item.setTitle('重新关联…').setIcon('link').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: ref.entryType, onChoose: async (replacement) => { model.updateVaultRefPath(this.plugin.state, ref.id, replacement.path); await this.plugin.persist(); await this.render(); } }).open()));
      menu.addSeparator(); menu.addItem((item) => item.setTitle('解除项目关联').setIcon('unlink').onClick(async () => { model.unlinkVaultRefFromProject(this.plugin.state, project.id, ref.id); await this.plugin.persist(); await this.render(); }));
      menu.showAtMouseEvent(event);
    });
    if (expanded && Array.isArray(entry?.children)) {
      const children = [...entry.children].sort((left, right) => Number(this.plugin.vaultEntryType(right) === 'folder') - Number(this.plugin.vaultEntryType(left) === 'folder') || left.name.localeCompare(right.name, 'zh-CN', { numeric: true }));
      for (const child of children.slice(0, 300)) {
        const childRef = { id: ref.id, path: child.path, entryType: this.plugin.vaultEntryType(child), fileKind: this.plugin.vaultFileKind(child), missingAt: '' };
        this.renderProjectFileTreeRow(parent, project, childRef, depth + 1, false);
      }
      if (children.length > 300) parent.createDiv({ cls: 'rh-next-project-file-limit', text: `还有 ${children.length - 300} 项，请在 Obsidian 文件列表中继续浏览` }).style.setProperty('--rh-file-depth', String(depth + 1));
    }
  }

  async createProjectMemoCard(projectId, preferredAnchor = null) {
    const memo = model.createProjectMemo(this.plugin.state, projectId);
    if (preferredAnchor) {
      try {
        model.moveProjectBoardItem(this.plugin.state, projectId, `memo:${memo.id}`, preferredAnchor.column, preferredAnchor.row, { side: preferredAnchor.side });
      } catch { /* 目标半格在点击后被占用时保留模型分配的首个空半格。 */ }
    }
    await this.plugin.persist();
    await this.render();
    requestAnimationFrame(() => this.contentEl.querySelector(`[data-memo-id="${CSS.escape(memo.id)}"] textarea`)?.focus());
  }

  async deleteProjectMemoCard(projectId, memoId) {
    await this.flushProjectMemo?.(); this.flushProjectMemo = null;
    model.deleteProjectMemo(this.plugin.state, projectId, memoId);
    await this.plugin.persist();
    await this.render();
  }

  renderProjectMemos(parent, project, boardItemByKey, mediumOrder) {
    const memos = Array.isArray(project.memos) ? project.memos : [];
    const flushers = [];
    const memoById = new Map(memos.map((memo, index) => [memo.id, { memo, index }]));
    const groups = new Map();
    for (const boardItem of boardItemByKey.values()) {
      if (boardItem.kind !== 'memo') continue;
      const key = `${boardItem.column}:${boardItem.row}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(boardItem);
    }
    for (const [coordinate, items] of [...groups.entries()].sort(([left], [right]) => {
      const [lc, lr] = left.split(':').map(Number); const [rc, rr] = right.split(':').map(Number);
      return lr - rr || lc - rc;
    })) {
      const [column, row] = coordinate.split(':').map(Number);
      const occupiedSides = items.map((item) => item.side || 'left');
      const group = parent.createDiv({
        cls: `rh-next-project-memo-group rh-next-project-board-item ${items.length === 1 ? `is-single is-${occupiedSides[0]}` : 'is-paired'}`
      });
      this.setProjectBoardItemPosition(group, { key: `memo-group:${coordinate}`, column, row }, Math.min(...items.map((item) => mediumOrder.get(item.key) || 1)));
      const body = group.createDiv({ cls: 'rh-next-project-memo-group-body' });
      const vacantSide = items.some((item) => (item.side || 'left') === 'left') ? 'right' : 'left';
      for (const side of ['left', 'right']) {
        const boardItem = items.find((item) => (item.side || 'left') === side);
        if (!boardItem) {
          const empty = body.createDiv({ cls: `rh-next-project-memo-half-drop is-${side}`, attr: { 'aria-hidden': 'true' } });
          empty.addEventListener('dragover', (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation(); empty.addClass('is-drag-target');
          });
          empty.addEventListener('dragleave', () => empty.removeClass('is-drag-target'));
          empty.addEventListener('drop', async (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation();
            const source = this.draggedProjectBoardKey;
            this.finishProjectBoardDrag(group);
            await this.moveProjectBoardItem(project.id, source, column, row, { side });
          });
          continue;
        }
        const record = memoById.get(boardItem.memoId); if (!record) continue;
        const { memo, index } = record;
        const card = body.createDiv({ cls: `rh-next-project-memo-card is-${side}`, attr: { 'data-memo-id': memo.id, 'data-board-key': boardItem.key } });
        const head = card.createDiv({ cls: 'rh-next-project-memo-card-head' });
        const drag = head.createSpan({ cls: 'rh-next-utility-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整便签 ${index + 1} 位置`, 'aria-label': `拖动调整便签 ${index + 1} 位置` } }); setIcon(drag, 'grip-vertical');
        const title = head.createEl('small', { cls: 'rh-next-project-memo-title', text: memo.title || `便签 ${index + 1}`, attr: { title: '双击重命名便签' } });
        title.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameProjectMemoInline(title, project, memo, index); });
        iconButton(head, 'plus', '新建便签', () => void this.createProjectMemoCard(project.id, items.length < 2 ? { column, row, side: vacantSide } : null), 'is-subtle rh-next-project-memo-add');
        iconButton(head, 'trash-2', '删除便签', async () => {
          const previousHeight = getMemoHeight(this.plugin.state, project.id, memo.id);
          deleteMemoHeight(this.plugin.state, project.id, memo.id);
          try {
            await this.deleteProjectMemoCard(project.id, memo.id);
          } catch (error) {
            if (previousHeight) setMemoHeight(this.plugin.state, project.id, memo.id, previousHeight);
            new Notice(`删除便签失败：${error instanceof Error ? error.message : String(error)}`, 5000);
          }
        }, 'is-subtle');
        this.attachProjectBoardDrag(card, drag, project, boardItem);
        const textarea = input(card, { multiline: true, cls: 'rh-next-project-memo-input', placeholder: '写下当前项目的临时想法……', value: memo.text || '' });
        this.plugin.bindMemoHeight(textarea, project.id, memo.id);
        const status = card.createEl('small', { cls: 'rh-next-project-memo-status', text: memo.updatedAt ? new Date(memo.updatedAt).toLocaleDateString('zh-CN') : '' });
        let timer = null;
        const save = async () => {
          if (!this.plugin.state.projects[project.id]) return;
          model.updateProjectMemo(this.plugin.state, project.id, memo.id, textarea.value);
          await this.plugin.persist();
          status.setText(new Date().toLocaleDateString('zh-CN'));
        };
        const flush = async () => { if (timer) window.clearTimeout(timer); timer = null; await save(); };
        flushers.push(flush);
        textarea.addEventListener('input', () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => void flush(), 500); });
        textarea.addEventListener('blur', () => void flush());
      }
    }
    this.flushProjectMemo = async () => Promise.all(flushers.map((flush) => flush()));
  }

  async renameProjectMemoInline(titleEl, project, memo, index) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor rh-next-project-memo-title-editor';
    editor.value = memo.title || `便签 ${index + 1}`;
    titleEl.replaceWith(editor); editor.focus(); editor.select();
    let completed = false;
    const commit = async (cancel = false) => {
      if (completed) return; completed = true;
      if (!cancel) model.updateProjectMemoTitle(this.plugin.state, project.id, memo.id, editor.value);
      if (!cancel) await this.plugin.persist();
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  renderModuleCard(parent, module, options = {}) {
    const resources = model.moduleResources(this.plugin.state, module.id);
    const boardItem = options.projectBoardItem;
    const card = parent.createDiv({ cls: `rh-next-module-card ${boardItem ? 'rh-next-project-board-item' : ''}` });
    if (boardItem) this.setProjectBoardItemPosition(card, boardItem, options.mediumOrder);
    card.dataset.moduleId = module.id;
    card.addEventListener('click', (event) => {
      if (event.target.closest('.rh-next-module-drag') || Date.now() < Number(this.suppressProjectBoardClickUntil || 0)) return;
      this.drawerModuleId = module.id; void this.render();
    });
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => item.setTitle('加入待办任务').setIcon('list-todo').onClick(() => void this.addPlanFromModule(module)));
      menu.addItem((item) => item.setTitle('添加资源').setIcon('plus').onClick(() => this.plugin.openAddModal({ projectId: module.projectId, moduleId: module.id })));
      if (boardItem) {
        menu.addSeparator();
        const moves = [
          ['向左移动', 'arrow-left', boardItem.column - 1, boardItem.row],
          ['向右移动', 'arrow-right', boardItem.column + 1, boardItem.row],
          ['向上移动', 'arrow-up', boardItem.column, boardItem.row - 1],
          ['向下移动', 'arrow-down', boardItem.column, boardItem.row + 1]
        ];
        for (const [title, icon, column, row] of moves) {
          if (column < 1 || column > 4 || row < 1) continue;
          menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => void this.moveProjectBoardItem(module.projectId, boardItem.key, column, row, { focus: true })));
        }
      }
      menu.addSeparator();
      menu.addItem((item) => item.setTitle('归档模块').setIcon('archive').onClick(async () => {
        await this.plugin.mutate((state) => model.archiveModule(state, module.id));
        new Notice(`已归档模块：${module.title}`);
      }));
      menu.addItem((item) => item.setTitle('永久删除模块').setIcon('trash-2').onClick(() => this.confirmDeleteModule(module)));
      menu.showAtMouseEvent(event);
    });
    const drag = card.createDiv({ cls: 'rh-next-module-drag', attr: { draggable: 'true', tabindex: '0', title: '拖动调整模块位置', 'aria-label': '拖动调整模块位置' } });
    setIcon(drag, 'grip-vertical');
    if (boardItem) this.attachProjectBoardDrag(card, drag, this.plugin.state.projects[module.projectId], boardItem);
    const icon = card.createDiv({ cls: 'rh-next-module-card-icon' }); setIcon(icon, resources.length ? kindIcon(resources[0].kind) : 'blocks');
    const body = card.createDiv({ cls: 'rh-next-module-card-body' });
    const name = body.createEl('strong', { text: module.title });
    name.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameModuleInline(name, module); });
    body.createEl('small', { text: `${resources.length} 条资源` });
    const complete = resources.filter((resource) => resource.completedAt).length;
    const progress = body.createDiv({ cls: 'rh-next-progress' });
    progress.createDiv({ cls: 'rh-next-progress-fill', attr: { style: `width:${resources.length ? complete / resources.length * 100 : 0}%` } });
    iconButton(card, 'chevron-right', '查看资源', () => { this.drawerModuleId = module.id; return this.render(); });
    return card;
  }

  async renameModuleInline(nameEl, module) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor';
    editor.value = module.title;
    nameEl.replaceWith(editor);
    editor.focus(); editor.select();
    const commit = async (cancel = false) => {
      const value = safeText(editor.value);
      if (!cancel && value) {
        module.title = value; module.updatedAt = new Date().toISOString();
        await this.plugin.persist();
      }
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  confirmDeleteModule(module, onDone = null) {
    const resourceCount = (module.resourceIds || []).filter((resourceId) => this.plugin.state.resources[resourceId]).length;
    const planCount = Object.values(this.plugin.state.plans).filter((plan) => plan.targetType === 'module' && plan.targetIds?.includes(module.id) && !plan.deletedAt).length;
    new ConfirmActionModal(this.app, {
      title: `永久删除模块“${module.title}”？`,
      message: `将删除这个模块和 ${planCount} 个相关计划，并解除 ${resourceCount} 条资源关联。全局资源、完成记录和其他模块不会被删除；操作后可从顶部撤回一次。`,
      confirmLabel: '永久删除模块',
      onConfirm: async () => {
        const result = await this.plugin.mutate((state) => model.deleteModule(state, module.id), { render: false });
        if (this.drawerModuleId === module.id) this.drawerModuleId = '';
        new Notice(`已删除模块；移除 ${result.removedPlanCount} 个计划，解除 ${result.detachedResourceCount} 条资源关联。可从顶部撤回。`, 7000);
        await onDone?.();
        await this.render();
      }
    }).open();
  }

  async renameProjectInline(nameEl, project) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor rh-next-project-inline-editor';
    editor.value = project.title;
    nameEl.replaceWith(editor);
    editor.focus(); editor.select();
    let settled = false;
    const commit = async (cancel = false) => {
      if (settled) return;
      settled = true;
      const value = safeText(editor.value);
      if (!cancel && value && value !== project.title) model.renameProject(this.plugin.state, project.id, value);
      if (!cancel && !value) new Notice('项目名称不能为空。');
      await this.plugin.persist();
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  promptModule(projectId) {
    new TextPromptModal(this.app, '新建学习模块', '模块名称', async (value) => {
      const module = await this.plugin.mutate((state) => model.createModule(state, projectId, value), { render: false });
      new Notice(`已创建模块：${module.title}`);
      await this.render();
    }, { initialValue: '学习材料' }).open();
  }

  async addPlanFromModule(module) {
    const result = await this.plugin.mutate((state) => model.createPlanForTarget(state, module.projectId, 'module', module.id, module.title));
    new Notice(result.reused ? '这个模块已在待办中。' : '已加入右侧待办。');
  }

  renderProjectPlanStack(parent, project, options = {}) {
    const state = this.plugin.state;
    if (!options.compact) {
      const head = parent.createDiv({ cls: 'rh-next-section-heading' });
      const copy = head.createDiv(); copy.createEl('h2', { text: '待办任务' }); copy.createEl('p', { text: '引用项目中的模块；折叠状态会被记住。' });
      textButton(head, '添加', 'plus', () => this.plugin.openAddModal({ mode: 'plan', projectId: project.id }));
    }
    const plans = model.projectPlans(state, project.id);
    if (!plans.length) {
      if (options.compact) { const empty = parent.createDiv({ cls: 'rh-next-compact-empty' }); empty.createEl('strong', { text: '尚未设置待办' }); }
      else this.renderEmpty(parent, 'list-todo', '尚未设置待办', '右键学习模块，选择“加入待办任务”。');
    }
    for (const plan of plans) {
      const collapsed = state.uiState.collapsedProjectPlans[plan.id] !== false;
      const wrap = parent.createDiv({ cls: `rh-next-project-plan ${collapsed ? 'is-collapsed' : ''}` });
      const top = wrap.createDiv({ cls: 'rh-next-project-plan-head' });
      const icon = top.createSpan(); setIcon(icon, collapsed ? 'chevron-right' : 'chevron-down');
      const text = top.createDiv(); text.createEl('strong', { text: plan.title });
      const progress = model.planProgress(plan); text.createEl('small', { text: `今日 ${progress.completed}/${progress.target}` });
      top.addEventListener('click', async () => {
        state.uiState.collapsedProjectPlans[plan.id] = !collapsed;
        await this.plugin.persist(); await this.render();
      });
      if (!collapsed) {
        const body = wrap.createDiv({ cls: 'rh-next-project-plan-body' });
        this.renderPlanRow(body, plan);
      }
    }
  }

  renderDrawer(root, moduleId) {
    const state = this.plugin.state;
    const module = state.modules[moduleId];
    if (!module) return;
    if (this.drawerResourceModuleId !== moduleId) { this.drawerResourceModuleId = moduleId; this.drawerResourcePath = ''; }
    const overlay = root.createDiv({ cls: 'rh-next-drawer-overlay' });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) { this.drawerModuleId = ''; this.drawerResourcePath = ''; void this.render(); } });
    const drawer = overlay.createDiv({ cls: 'rh-next-drawer' });
    const header = drawer.createDiv({ cls: 'rh-next-drawer-head' });
    const copy = header.createDiv(); copy.createEl('small', { text: state.projects[module.projectId]?.title || '项目' }); copy.createEl('h2', { text: module.title });
    iconButton(header, 'x', '关闭', () => { this.drawerModuleId = ''; this.drawerResourcePath = ''; return this.render(); });
    const toolbar = drawer.createDiv({ cls: 'rh-next-drawer-toolbar' });
    const search = input(toolbar, { placeholder: '搜索这个模块中的资源……' });
    textButton(toolbar, '新建分组', 'folder-plus', () => new TextPromptModal(this.app, '新建资源分组', '分组名称', async (value) => {
      await this.plugin.mutate((next) => { const group = model.createResourceGroup(next, moduleId, value); group.scopePath = this.drawerResourcePath || ''; return group; });
    }, { initialValue: '新分组' }).open());
    const organizeButton = textButton(toolbar, '整理当前文件夹', 'folder-cog', async () => {
      const currentPath = this.drawerResourcePath || '';
      if (!currentPath) return new Notice('请先进入需要整理的文件夹。');
      const scopedVideos = model.moduleResources(state, moduleId).filter((resource) => resource.kind === 'video' && (() => { const folderPath = this.resourceVirtualFolderPath(resource, moduleId); return folderPath === currentPath || folderPath.startsWith(`${currentPath}/`); })());
      if (scopedVideos.length <= 20) return new Notice('当前文件夹不超过 20 个视频，无需自动分组。');
      const autoGroupKey = `module:${moduleId}:folder:${currentPath}`;
      await this.plugin.mutate((next) => {
        const beforeGroups = model.moduleResourceGroups(next, moduleId).filter((group) => group.autoGroupKey === autoGroupKey).map((group) => ({ ...group, resourceIds: [...(group.resourceIds || [])] }));
        const beforeOrder = [...(next.modules[moduleId]?.resourceGroupIds || [])];
        const collapsedBefore = { ...(next.uiState.collapsedResourceGroupsByModule?.[moduleId] || {}) };
        const result = model.autoGroupResources(next, moduleId, scopedVideos.map((resource) => resource.id), { size: 20, key: autoGroupKey, scopePath: currentPath });
        model.recordLastAction(next, { type: 'auto-group-resources', moduleId, autoGroupKey, resourceGroupSnapshotsBefore: beforeGroups, moduleResourceGroupIdsBefore: beforeOrder, collapsedBefore, autoGroupIdsAfter: result.groups.map((group) => group.id), label: `整理文件夹：${currentPath}` });
      });
      new Notice(`仅整理当前文件夹中的 ${scopedVideos.length} 个视频；可从顶部撤回。`);
    }); organizeButton.setAttr('aria-label', '整理当前文件夹中的视频（适用于 OpenList、本地文件夹及其他目录来源）');
    organizeButton.style.display = 'none';
    const legacyAutoKey = `module:${moduleId}:video`;
    if (model.moduleResourceGroups(state, moduleId).some((group) => group.autoGroupKey === legacyAutoKey)) textButton(toolbar, '恢复原文件夹', 'undo-2', () => new ConfirmActionModal(this.app, {
      title: '恢复自动整理前的文件夹结构？',
      message: '只删除这次错误创建的“第一组、第二组……”自动分组；不会删除资源，也不会修改原始路径。',
      confirmLabel: '恢复原文件夹',
      onConfirm: async () => {
        await this.plugin.mutate((next) => { for (const group of model.moduleResourceGroups(next, moduleId).filter((item) => item.autoGroupKey === legacyAutoKey)) model.deleteResourceGroup(next, group.id); });
        new Notice('已移除错误自动分组，原相对文件夹结构已恢复。');
      }
    }).open(), 'is-danger');
    textButton(toolbar, '添加资源', 'plus', () => this.plugin.openAddModal({ projectId: module.projectId, moduleId }), 'is-primary');
    const list = drawer.createDiv({ cls: 'rh-next-resource-list' });
    const renderRows = () => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const allResources = model.moduleResources(state, moduleId);
      const resources = allResources.filter((resource) => !query || `${resource.title} ${resource.metadata?.remotePath || ''}`.toLowerCase().includes(query));
      const currentFolderVideoCount = this.drawerResourcePath ? allResources.filter((resource) => resource.kind === 'video' && (() => { const folderPath = this.resourceVirtualFolderPath(resource, moduleId); return folderPath === this.drawerResourcePath || folderPath.startsWith(`${this.drawerResourcePath}/`); })()).length : 0;
      organizeButton.style.display = !query && this.drawerResourcePath && currentFolderVideoCount > 20 ? '' : 'none';
      if (!resources.length) this.renderEmpty(list, 'search-x', query ? '没有匹配资源' : '模块中还没有资源', query ? '换一个关键词。' : '从链接、文件或收件箱添加。');
      if (query) {
        for (const resource of resources) this.renderDrawerResourceRow(list, resource, { showRemotePath: true, moduleId });
        return;
      }
      const currentPath = this.drawerResourcePath || '';
      const resourceGroups = model.moduleResourceGroups(state, moduleId);
      const visibleGroups = resourceGroups.filter((group) => String(group.scopePath || '') === currentPath);
      const groupedIds = new Set(visibleGroups.flatMap((group) => group.resourceIds || []));
      const breadcrumbs = list.createDiv({ cls: 'rh-next-resource-breadcrumbs' });
      const rootCrumb = breadcrumbs.createEl('button', { text: module.title, attr: { type: 'button' } });
      rootCrumb.addEventListener('click', () => { this.drawerResourcePath = ''; renderRows(); });
      let built = '';
      for (const segment of currentPath.split('/').filter(Boolean)) {
        breadcrumbs.createSpan({ text: '/' });
        built = built ? `${built}/${segment}` : segment;
        const target = built;
        const crumb = breadcrumbs.createEl('button', { text: segment, attr: { type: 'button' } });
        crumb.addEventListener('click', () => { this.drawerResourcePath = target; renderRows(); });
      }
      if (visibleGroups.length) {
        for (const group of visibleGroups) {
          const progress = model.resourceGroupProgress(state, group.id);
          const collapsed = state.uiState.collapsedResourceGroupsByModule?.[moduleId]?.[group.id] !== false;
          const wrap = list.createDiv({ cls: `rh-next-resource-group ${collapsed ? 'is-collapsed' : ''} ${progress.done ? 'is-complete' : ''}` });
          const groupRow = wrap.createDiv({ cls: 'rh-next-resource-group-row' });
          groupRow.setAttr('role', 'button'); groupRow.setAttr('tabindex', '0'); groupRow.setAttr('aria-expanded', String(!collapsed));
          setIcon(groupRow.createSpan(), collapsed ? 'chevron-right' : 'chevron-down');
          setIcon(groupRow.createSpan({ cls: 'rh-next-resource-group-icon' }), 'folder');
          const groupCopy = groupRow.createDiv(); groupCopy.createEl('strong', { text: group.title }); groupCopy.createEl('small', { text: `${progress.completed}/${progress.total} 已完成` });
          iconButton(groupRow, 'more-horizontal', '分组操作', (event) => {
            event.stopPropagation();
            const menu = new Menu();
            const groupIndex = visibleGroups.findIndex((candidate) => candidate.id === group.id);
            if (groupIndex > 0) menu.addItem((item) => item.setTitle('上移').setIcon('arrow-up').onClick(async () => { await this.plugin.mutate((next) => model.moveResourceGroup(next, moduleId, group.id, visibleGroups[groupIndex - 1].id)); }));
            if (groupIndex < visibleGroups.length - 1) menu.addItem((item) => item.setTitle('下移').setIcon('arrow-down').onClick(async () => { await this.plugin.mutate((next) => model.moveResourceGroup(next, moduleId, visibleGroups[groupIndex + 1].id, group.id)); }));
            menu.addItem((item) => item.setTitle('重命名').setIcon('pencil').onClick(() => new TextPromptModal(this.app, '重命名资源分组', '分组名称', async (value) => {
              await this.plugin.mutate((next) => model.renameResourceGroup(next, group.id, value));
            }, { initialValue: group.title }).open()));
            menu.addItem((item) => item.setTitle('删除分组').setIcon('folder-x').onClick(async () => {
              await this.plugin.mutate((next) => model.deleteResourceGroup(next, group.id));
              new Notice('已删除分组；组内资源已回到未分组。');
            }));
            menu.showAtMouseEvent(event);
          });
          groupRow.addEventListener('click', async () => {
            model.setResourceGroupCollapsed(state, moduleId, group.id, !collapsed);
            await this.plugin.persist(); renderRows();
          });
          groupRow.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); groupRow.click(); }
          });
          if (!collapsed) {
            const groupBody = wrap.createDiv({ cls: 'rh-next-resource-group-body' });
            const members = (group.resourceIds || []).map((resourceId) => state.resources[resourceId]).filter(Boolean);
            for (const resource of members) this.renderDrawerResourceRow(groupBody, resource, { moduleId });
            if (!members.length) groupBody.createEl('small', { cls: 'rh-next-help', text: '这个分组还没有资源。' });
          }
        }
      }
      const folders = new Map();
      const direct = [];
      for (const resource of resources) {
        if (groupedIds.has(resource.id)) continue;
        const folderPath = this.resourceVirtualFolderPath(resource, moduleId);
        const relative = currentPath ? (folderPath === currentPath ? '' : folderPath.startsWith(`${currentPath}/`) ? folderPath.slice(currentPath.length + 1) : null) : folderPath;
        if (relative === null) continue;
        if (!relative) { direct.push(resource); continue; }
        const folderName = relative.split('/')[0];
        const folderTarget = currentPath ? `${currentPath}/${folderName}` : folderName;
        if (!folders.has(folderName)) folders.set(folderName, { path: folderTarget, count: 0 });
        folders.get(folderName).count += 1;
      }
      for (const [name, folder] of [...folders.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN', { numeric: true }))) {
        const row = list.createEl('button', { cls: 'rh-next-resource-folder-row', attr: { type: 'button' } });
        setIcon(row.createSpan(), 'folder');
        const text = row.createDiv(); text.createEl('strong', { text: name }); text.createEl('small', { text: `${folder.count} 项` });
        setIcon(row.createSpan(), 'chevron-right');
        row.addEventListener('click', () => { this.drawerResourcePath = folder.path; renderRows(); });
      }
      for (const resource of direct) this.renderDrawerResourceRow(list, resource, { moduleId });
      if (!folders.size && !direct.length && !visibleGroups.length && (currentPath || !resourceGroups.length)) this.renderEmpty(list, 'folder-open', '这个文件夹是空的', '返回上一层继续查看。');
    };
    search.addEventListener('input', renderRows);
    renderRows();
  }

  resourceVirtualFolderPath(resource, moduleId = '') {
    const rootPath = String(moduleId ? model.moduleResourceRoot(this.plugin.state, moduleId, resource.id) || resource?.metadata?.rootPath || '' : resource?.metadata?.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    return model.resourceFolderPath(resource, rootPath);
  }

  renderDrawerResourceRow(parent, resource, options = {}) {
    const row = parent.createDiv({ cls: `rh-next-resource-row ${resource.completedAt ? 'is-complete' : ''}` });
    const icon = row.createDiv({ cls: 'rh-next-resource-icon' }); setIcon(icon, kindIcon(resource.kind));
    const text = row.createDiv({ cls: 'rh-next-resource-copy' }); text.createEl('strong', { text: resource.title });
    const pathDetail = options.showRemotePath && resource.metadata?.remotePath ? ` · ${resource.metadata.remotePath}` : '';
    text.createEl('small', { text: `${kindLabel(resource.kind)}${resource.lastOpenedAt ? ' · 最近打开过' : ' · 尚未打开'}${pathDetail}` });
    const actions = row.createDiv({ cls: 'rh-next-resource-actions' });
    this.renderResourceActionButtons(actions, resource);
    const complete = iconButton(row, resource.completedAt ? 'circle-check-big' : 'circle', resource.completedAt ? '取消完成' : '确认完成', async () => {
      await this.plugin.mutate((next) => model.toggleResourceComplete(next, resource.id));
    });
    complete.addClass('rh-next-complete-button');
    iconButton(row, 'more-horizontal', '资源操作', (event) => {
      const menu = new Menu();
      if (options.moduleId) {
        const groups = model.moduleResourceGroups(this.plugin.state, options.moduleId);
        const current = groups.find((group) => (group.resourceIds || []).includes(resource.id));
        if (current) menu.addItem((item) => item.setTitle('移出分组').setIcon('folder-minus').onClick(async () => {
          await this.plugin.mutate((next) => model.moveResourceToGroup(next, options.moduleId, resource.id, ''));
        }));
        for (const group of groups.filter((candidate) => candidate.id !== current?.id)) {
          menu.addItem((item) => item.setTitle(`移到：${group.title}`).setIcon('folder-input').onClick(async () => {
            await this.plugin.mutate((next) => model.moveResourceToGroup(next, options.moduleId, resource.id, group.id));
          }));
        }
      }
      menu.addItem((item) => item.setTitle('移到回收站').setIcon('trash-2').onClick(async () => {
        await this.plugin.mutate((next) => model.trashResource(next, resource.id));
      }));
      menu.showAtMouseEvent(event);
    });
  }

  renderResourceActionButtons(parent, resource) {
    const actions = this.plugin.resourceActions(resource);
    if (actions.playTarget) iconButton(parent, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(resource, 'play', actions.playTarget), 'is-primary');
    if (actions.webTarget) iconButton(parent, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, resource, actions.webTarget));
    if (actions.defaultTarget) {
      const label = actions.defaultTarget.type === 'anki' ? '打开 Anki 卡组' : actions.defaultTarget.type === 'file' ? '用默认程序打开文件' : '打开资源';
      iconButton(parent, actions.defaultTarget.type === 'anki' ? 'layers-3' : 'external-link', label, () => this.plugin.openResourceAction(resource, 'default', actions.defaultTarget), actions.playTarget || actions.webTarget ? '' : 'is-primary');
    }
  }

  renderLibrary(main) {
    const state = this.plugin.state;
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv(); copy.createEl('h1', { text: '资料库' }); copy.createEl('p', { cls: 'rh-next-interface-tip', text: '低频整理集中在这里；OpenList、Anki 与订阅降为后台来源连接。' });
    const headingActions = heading.createDiv({ cls: 'rh-next-section-actions' });
    const orphanCount = model.orphanResources(state).length;
    const legacyBiliCount = model.legacyBiliHomepageResources(state).length;
    if (legacyBiliCount) textButton(headingActions, `整理旧订阅主页 ${legacyBiliCount}`, 'list-checks', () => new LegacyBiliHomepageCleanupModal(this.app, this.plugin).open(), 'is-subtle');
    if (orphanCount) textButton(headingActions, `清理未利用资源 ${orphanCount}`, 'eraser', () => new CleanupResourcesModal(this.app, this.plugin).open(), 'is-subtle');
    textButton(headingActions, '添加资源', 'plus', () => this.plugin.openAddModal({ projectId: this.currentProjectId }), 'is-primary');
    const tiles = main.createDiv({ cls: 'rh-next-library-grid' });
    const entries = [
      ['收件箱', `${state.inbox.length} 条待整理`, 'inbox', () => this.plugin.openAddModal({ mode: 'inbox', projectId: this.currentProjectId })],
      ['全局资源', `${Object.values(state.resources).filter((r) => !r.deletedAt).length} 条`, 'search', () => this.openSearch()],
      ['来源连接', `${Object.values(state.sources).filter((s) => !s.deletedAt).length} 个连接`, 'plug-zap', () => this.plugin.openAddModal({ mode: 'source', projectId: this.currentProjectId })],
      ['回收站', `${Object.values(state.resources).filter((r) => r.deletedAt).length} 条`, 'trash-2', () => new ArchiveModal(this.app, this.plugin, 'trash').open()],
      ['归档与旧资源', `${Object.values(state.projects).filter((p) => p.archivedAt).length} 个项目`, 'archive', () => new ArchiveModal(this.app, this.plugin, 'archive').open()]
    ];
    for (const [title, detail, icon, action] of entries) {
      const card = tiles.createDiv({ cls: 'rh-next-library-card' }); setIcon(card.createSpan(), icon);
      const text = card.createDiv(); text.createEl('strong', { text: title }); text.createEl('small', { text: detail }); setIcon(card.createSpan(), 'arrow-up-right');
      card.addEventListener('click', () => void action());
    }
    const source = main.createDiv({ cls: 'rh-next-source-panel' });
    const sourceHead = source.createDiv({ cls: 'rh-next-section-heading' });
    const sourceCopy = sourceHead.createDiv(); sourceCopy.createEl('h2', { text: '来源连接' }); sourceCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '只在配置时出现技术信息，日常项目只显示视频、卡组、文档。' });
    const sourceGrid = source.createDiv({ cls: 'rh-next-source-grid' });
    for (const [name, icon, detail, type] of [['OpenList', 'cloud', '网盘文件结构与视频', 'openlist'], ['Anki', 'layers-3', '本地卡组与一键刷卡', 'anki'], ['本地文件夹', 'folder', '课程目录动态扫描', 'local-folder'], ['B站订阅', 'rss', 'UP主页与合集更新', 'bilibili']]) {
      const card = sourceGrid.createDiv({ cls: 'rh-next-source-card' }); setIcon(card.createSpan(), icon); const t = card.createDiv(); t.createEl('strong', { text: name }); t.createEl('small', { text: detail }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => this.plugin.openAddModal({ mode: 'source', sourceType: type, projectId: this.currentProjectId }));
    }
  }

  renderSubscriptions(main) {
    const state = this.plugin.state;
    const creators = Object.values(state.sources).filter((item) => item.type === 'bilibili' && !item.deletedAt);
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv();
    copy.createEl('h1', { text: '订阅' });
    copy.createEl('p', { cls: 'rh-next-interface-tip', text: '点头像切换已添加的 UP；投稿直接启动 PotPlayer，合集可展开后加入项目。' });
    textButton(heading, '添加 UP', 'user-plus', () => this.plugin.openAddModal({ mode: 'source', sourceType: 'bilibili', projectId: this.currentProjectId }), 'is-primary');
    if (!creators.length) {
      this.renderEmpty(main, 'rss', '还没有订阅 UP', '添加一个 B 站 UP 主页后，这里会显示头像、投稿和公开合集。', '添加 UP', () => this.plugin.openAddModal({ mode: 'source', sourceType: 'bilibili', projectId: this.currentProjectId }));
      return;
    }
    this.renderBiliHome(main, creators);
  }

  renderBiliHome(parent, creators) {
    const state = this.plugin.state;
    const source = parent.createDiv({ cls: 'rh-next-subscription-panel' });
    const selectedId = creators.some((item) => item.id === state.uiState.selectedBiliSourceId) ? state.uiState.selectedBiliSourceId : creators[0].id;
    const creatorGrid = source.createDiv({ cls: 'rh-next-creator-switcher' });
    for (const creator of creators) {
      const button = creatorGrid.createEl('button', { cls: `rh-next-creator-switch ${creator.id === selectedId ? 'is-selected' : ''}`, attr: { title: creator.alias || `UP ${creator.mid}`, 'aria-label': `切换到 ${creator.alias || `UP ${creator.mid}`}` } });
      if (creator.avatar) button.createEl('img', { attr: { src: creator.avatar, alt: '', referrerpolicy: 'no-referrer' } }); else button.createSpan({ text: (creator.alias || 'U').slice(0, 1) });
      button.addEventListener('click', async () => { state.uiState.selectedBiliSourceId = creator.id; await this.plugin.persist(); await this.render(); });
    }
    const creator = creators.find((item) => item.id === selectedId) || creators[0];
    const home = source.createDiv({ cls: 'rh-next-creator-home' });
    const profile = home.createDiv({ cls: 'rh-next-creator-profile' });
    const avatar = profile.createDiv({ cls: 'rh-next-creator-avatar is-large' });
    if (creator.avatar) avatar.createEl('img', { attr: { src: creator.avatar, alt: creator.alias || `UP ${creator.mid}`, referrerpolicy: 'no-referrer' } }); else avatar.setText((creator.alias || 'U').slice(0, 1));
    const profileText = profile.createDiv({ cls: 'rh-next-creator-copy' }); profileText.createEl('h3', { text: creator.alias || `UP ${creator.mid}` }); profileText.createEl('small', { text: `UID ${creator.mid}${creator.followers ? ` · ${Number(creator.followers).toLocaleString()} 粉丝` : ''}` });
    if (creator.description) profileText.createEl('p', { text: creator.description });
    const actions = profile.createDiv({ cls: 'rh-next-creator-actions' });
    iconButton(actions, 'refresh-cw', '刷新主页资料', async () => {
      try {
        const refreshed = await this.plugin.refreshBiliProfile(creator);
        new Notice(refreshed.lastError ? `主页已刷新，部分资料未同步：${refreshed.lastError}` : 'UP 主页资料已刷新。', 6000);
        await this.render();
      } catch (error) { new Notice(`刷新失败：${error.message || String(error)}`, 6000); }
    });
    iconButton(actions, 'external-link', '打开B站主页', () => shell.openExternal(creator.homepage));
    if (creator.lastError) home.createEl('p', { cls: 'rh-next-source-warning', text: `部分资料未同步：${creator.lastError}` });
    const recentHead = home.createDiv({ cls: 'rh-next-section-heading is-compact' }); const recentCopy = recentHead.createDiv(); recentCopy.createEl('h3', { text: '主页视频' }); recentCopy.createEl('p', { cls: 'rh-next-interface-tip', text: `${creator.recentSyncMode === '合集补全' ? '投稿接口受限，当前用公开合集补全内容' : '缓存最近公开投稿'}；点击卡片直接启动 PotPlayer。` });
    const videoGrid = home.createDiv({ cls: 'rh-next-bili-video-grid' });
    const recentVideos = Array.isArray(creator.recentVideos) ? creator.recentVideos.slice(0, 12) : [];
    if (!recentVideos.length) videoGrid.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有缓存投稿，点击右上角刷新。' });
    for (const video of recentVideos) this.renderBiliVideoCard(videoGrid, video);
    const collectionHead = home.createDiv({ cls: 'rh-next-section-heading is-compact' }); const collectionCopy = collectionHead.createDiv(); collectionCopy.createEl('h3', { text: '公开合集' }); collectionCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '点击合集查看完整视频列表。' });
    const collectionGrid = home.createDiv({ cls: 'rh-next-bili-collection-grid' });
    const collections = Array.isArray(creator.collections) ? creator.collections : [];
    if (!collections.length) collectionGrid.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有缓存公开合集。' });
    for (const collection of collections) {
      const card = collectionGrid.createEl('button', { cls: 'rh-next-bili-collection-card' });
      const copy = card.createDiv(); copy.createEl('strong', { text: collection.name }); copy.createEl('small', { text: `${collection.type === 'season' ? '合集' : '系列'} · ${collection.total || 0} 条` }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => new BiliCollectionModal(this.app, this.plugin, creator, collection).open());
    }
  }

  renderBiliVideoCard(parent, video) {
    const card = parent.createDiv({ cls: 'rh-next-bili-video-card' });
    if (video.cover) card.createEl('img', { attr: { src: video.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } });
    const copy = card.createDiv({ cls: 'rh-next-bili-video-copy' }); copy.createEl('strong', { text: video.title || '未命名视频' });
    if (video.publishedAt) copy.createEl('small', { text: new Date(video.publishedAt).toLocaleDateString('zh-CN') });
    const actions = card.createDiv({ cls: 'rh-next-bili-video-actions' });
    const transient = { title: video.title || '未命名视频', kind: 'video', launcher: { type: 'potplayer', target: video.url }, metadata: { originalUrl: video.url, sourceUrl: video.url } };
    this.renderResourceActionButtons(actions, transient);
    iconButton(actions, 'inbox', '加入收件箱', async () => {
      const result = model.addInboxResource(this.plugin.state, video.url, video.title);
      model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入收件箱：${video.title}` });
      await this.plugin.persist(); new Notice(result.reused ? '收件箱中已有这条视频。' : '已加入收件箱。'); await this.render();
    });
    iconButton(actions, 'folder-plus', '加入项目', () => {
      new ImportDestinationModal(this.app, this.plugin, {
        suggestedTitle: video.title,
        onChoose: async (destination) => {
          const descriptor = biliVideoDescriptor(video);
          const result = destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
          model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], linkedResourceIds: result.linked ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入项目：${video.title}` });
          await this.plugin.persist(); new Notice(destination.inbox ? '已加入收件箱。' : '已加入项目。'); await this.render();
        }
      }).open();
    });
  }

  renderEmpty(parent, icon, title, detail, actionLabel, action) {
    const empty = parent.createDiv({ cls: 'rh-next-empty' });
    const iconEl = empty.createDiv(); setIcon(iconEl, icon);
    empty.createEl('strong', { text: title }); empty.createEl('p', { text: detail });
    if (actionLabel && action) textButton(empty, actionLabel, 'arrow-right', action);
    return empty;
  }

  promptProject() {
    new TextPromptModal(this.app, '新建项目', '项目名称', async (value) => {
      const project = await this.plugin.mutate((state) => model.createProject(state, value), { render: false });
      this.currentProjectId = project.id;
      await this.navigate('project', { projectId: project.id });
    }).open();
  }

  openSearch() {
    const resources = Object.values(this.plugin.state.resources).filter((resource) => !resource.deletedAt);
    new ResourceSearchModal(this.app, this.plugin, resources).open();
  }
}

class TextPromptModal extends Modal {
  constructor(app, title, placeholder, onSubmit, options = {}) {
    super(app);
    this.heading = title;
    this.placeholder = placeholder;
    this.onSubmitValue = onSubmit;
    this.initialValue = options.initialValue || '';
    this.onCancel = options.onCancel;
    this.submitted = false;
  }
  onOpen() {
    this.modalEl.addClass('rh-next-modal');
    const { contentEl } = this; contentEl.empty(); contentEl.createEl('h2', { text: this.heading });
    const field = input(contentEl, { placeholder: this.placeholder, value: this.initialValue });
    const actions = contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '确认', 'check', async () => {
      const value = safeText(field.value);
      if (!value) return;
      this.submitted = true;
      await this.onSubmitValue(value);
      this.close();
    }, 'is-primary');
    field.addEventListener('keydown', (event) => { if (event.key === 'Enter') void actions.querySelector('.is-primary')?.click(); });
    window.setTimeout(() => { field.focus(); field.select(); }, 0);
  }
  onClose() {
    if (!this.submitted) this.onCancel?.();
    this.contentEl.empty();
  }
}

class ConfirmActionModal extends Modal {
  constructor(app, options = {}) { super(app); this.options = options; this.confirmed = false; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-confirm-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.options.title || '确认操作' }); copy.createEl('p', { text: this.options.message || '' });
    iconButton(head, 'x', '关闭', () => this.close());
    let checkbox = null;
    if (this.options.checkboxLabel) {
      const option = this.contentEl.createEl('label', { cls: 'rh-next-confirm-option' });
      checkbox = option.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.options.checkboxDefault !== false;
      option.createSpan({ text: this.options.checkboxLabel });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, this.options.confirmLabel || '确认', 'trash-2', async () => {
      try { await this.options.onConfirm?.({ checked: Boolean(checkbox?.checked) }); this.confirmed = true; this.close(); }
      catch (error) { new Notice(error.message || String(error), 6000); }
    }, 'is-danger');
  }
  onClose() { if (!this.confirmed) this.options.onCancel?.(); this.contentEl.empty(); }
}

class ProjectLinkModal extends Modal {
  constructor(app, plugin, entry) { super(app); this.plugin = plugin; this.entry = entry; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-project-link-modal');
    const projects = model.activeProjects(this.plugin.state); const linked = new Set(this.plugin.projectsForVaultPath(this.entry.path).map((project) => project.id));
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: '关联到学习项目' }); copy.createEl('p', { text: this.entry.path }); iconButton(head, 'x', '关闭', () => this.close());
    if (!projects.length) {
      this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有可关联的学习项目。' });
      return;
    }
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const project of projects) {
      const row = list.createEl('label', { cls: `rh-next-picker-row ${linked.has(project.id) ? 'is-selected' : ''}` }); const box = row.createEl('input', { type: 'checkbox' }); box.checked = linked.has(project.id);
      const body = row.createDiv(); body.createEl('strong', { text: project.title }); body.createEl('small', { text: linked.has(project.id) ? '已关联' : '未关联' });
      box.addEventListener('change', () => { box.checked ? linked.add(project.id) : linked.delete(project.id); row.toggleClass('is-selected', box.checked); body.querySelector('small')?.setText(box.checked ? '已关联' : '未关联'); });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' }); textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '保存关联', 'check', async () => {
      const result = model.upsertVaultRef(this.plugin.state, { path: this.entry.path, entryType: this.plugin.vaultEntryType(this.entry), fileKind: this.plugin.vaultFileKind(this.entry) });
      for (const projectId of linked) model.linkVaultRefToProject(this.plugin.state, projectId, result.vaultRef.id);
      for (const project of projects.filter((item) => !linked.has(item.id))) model.unlinkVaultRefFromProject(this.plugin.state, project.id, result.vaultRef.id);
      await this.plugin.persist(); await this.plugin.workbenchLeaf?.view?.render?.(); new Notice(`已更新 ${this.entry.name || this.entry.path} 的项目关联。`); this.close();
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class LinkedProjectPickerModal extends Modal {
  constructor(app, plugin, projects) { super(app); this.plugin = plugin; this.projects = projects; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal'); this.contentEl.createEl('h2', { text: '打开关联项目' }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const project of this.projects) { const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), 'folder'); const copy = row.createDiv(); copy.createEl('strong', { text: project.title }); row.addEventListener('click', () => { void this.plugin.openWorkbench({ route: 'project', projectId: project.id }); this.close(); }); }
  }
  onClose() { this.contentEl.empty(); }
}

class VaultEntryPickerModal extends Modal {
  constructor(app, plugin, options = {}) { super(app); this.plugin = plugin; this.options = options; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-vault-picker-modal');
    const typeLabel = this.options.entryType === 'folder' ? '文件夹' : '文件';
    const multiple = Boolean(this.options.multiple);
    const selected = new Set((this.options.selectedPaths || []).map((pathValue) => String(pathValue || '')));
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: `选择 Obsidian ${typeLabel}` }); copy.createEl('p', { text: multiple ? '可多选；只按路径和名称搜索，不读取文件正文。' : '只按路径和名称搜索，不读取文件正文。' }); iconButton(head, 'x', '关闭', () => this.close());
    const search = input(this.contentEl, { placeholder: `搜索 Vault ${typeLabel}路径…` }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    let summary = null;
    const updateSummary = () => { if (summary) summary.setText(`已选择 ${selected.size} 项`); };
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase(); const entries = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === this.options.entryType && (!query || entry.path.toLowerCase().includes(query))).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })).slice(0, 300);
      for (const entry of entries) {
        const row = list.createEl(multiple ? 'label' : 'button', { cls: `rh-next-picker-row ${selected.has(entry.path) ? 'is-selected' : ''}` });
        let box = null;
        if (multiple) { box = row.createEl('input', { type: 'checkbox' }); box.checked = selected.has(entry.path); }
        setIcon(row.createSpan(), this.options.entryType === 'folder' ? 'folder' : this.plugin.vaultFileKind(entry) === 'canvas' ? 'layout-dashboard' : 'file');
        const body = row.createDiv(); body.createEl('strong', { text: entry.name || entry.path.split('/').pop() }); body.createEl('small', { text: entry.path });
        if (multiple) box.addEventListener('change', () => { box.checked ? selected.add(entry.path) : selected.delete(entry.path); row.toggleClass('is-selected', box.checked); updateSummary(); });
        else row.addEventListener('click', () => { this.options.onChoose?.(entry); this.close(); });
      }
      if (!entries.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有匹配结果。' });
    };
    if (multiple) {
      const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions rh-next-vault-picker-actions' });
      summary = actions.createSpan({ cls: 'rh-next-picker-summary' });
      textButton(actions, '取消', 'x', () => this.close());
      textButton(actions, '关联所选', 'check', async () => {
        const chosen = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === this.options.entryType && selected.has(entry.path));
        try { await this.options.onChooseMany?.(chosen); this.close(); }
        catch (error) { new Notice(`关联失败：${error.message || String(error)}`, 6000); }
      }, 'is-primary');
      updateSummary();
    }
    search.addEventListener('input', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class VaultFolderPickerModal extends Modal {
  constructor(app, plugin, onChoose) { super(app); this.plugin = plugin; this.onChoose = onChoose; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-vault-picker-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: '选择创建路径' }); copy.createEl('p', { text: '以搜索为主；最近和置顶路径只是快捷入口。' }); iconButton(head, 'x', '关闭', () => this.close());
    const search = input(this.contentEl, { placeholder: '搜索 Vault 文件夹…' }); const quick = this.contentEl.createDiv({ cls: 'rh-next-vault-path-quick' }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const choose = (pathValue) => { this.onChoose?.(pathValue); this.close(); };
    const paint = () => {
      quick.empty(); const pinned = this.plugin.state.uiState.pinnedVaultCreatePaths || []; const recent = this.plugin.state.uiState.recentVaultCreatePaths || [];
      for (const value of [...new Set([...pinned, ...recent])].filter((item) => item === '' || this.plugin.vaultEntry(item))) { const row = quick.createDiv({ cls: 'rh-next-vault-path-chip' }); textButton(row, value || 'Vault 根目录', pinned.includes(value) ? 'pin' : 'history', () => choose(value)); iconButton(row, 'pin', pinned.includes(value) ? '取消固定路径' : '固定路径', async () => { model.togglePinnedVaultCreatePath(this.plugin.state, value); await this.plugin.persist(); paint(); }, pinned.includes(value) ? 'is-primary' : 'is-subtle'); }
      list.empty(); const query = search.value.trim().toLowerCase(); const folders = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === 'folder' && (!query || entry.path.toLowerCase().includes(query))).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })).slice(0, 300);
      const root = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(root.createSpan(), 'home'); const rootCopy = root.createDiv(); rootCopy.createEl('strong', { text: 'Vault 根目录' }); root.addEventListener('click', () => choose(''));
      for (const folder of folders) { const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), 'folder'); const body = row.createDiv(); body.createEl('strong', { text: folder.name }); body.createEl('small', { text: folder.path }); row.addEventListener('click', () => choose(folder.path)); }
    };
    search.addEventListener('input', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class VaultFolderBrowserModal extends Modal {
  constructor(app, plugin, folder, ref) { super(app); this.plugin = plugin; this.folder = folder; this.ref = ref; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-vault-folder-modal'); this.render(); }
  render() {
    this.contentEl.empty(); const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    if (this.folder.path !== this.ref.path) iconButton(head, 'arrow-left', '返回上一层', () => { const parentPath = this.folder.path.split('/').slice(0, -1).join('/'); this.folder = this.plugin.vaultEntry(parentPath.startsWith(this.ref.path) ? parentPath : this.ref.path) || this.plugin.vaultEntry(this.ref.path); this.render(); });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.folder.name || '项目文件夹' }); copy.createEl('p', { text: `${this.folder.path} · 只显示当前一层` }); iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' }); const children = Array.isArray(this.folder.children) ? [...this.folder.children].sort((a, b) => this.plugin.vaultEntryType(b).localeCompare(this.plugin.vaultEntryType(a)) || a.path.localeCompare(b.path, 'zh-CN')) : [];
    if (!children.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '这个文件夹是空的。' });
    for (const entry of children.slice(0, 300)) { const folder = this.plugin.vaultEntryType(entry) === 'folder'; const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), folder ? 'folder' : 'file'); const body = row.createDiv(); body.createEl('strong', { text: entry.name }); body.createEl('small', { text: entry.path }); row.addEventListener('click', async () => { if (folder) { this.folder = entry; this.render(); } else await this.plugin.openVaultEntry(entry); }); }
  }
  onClose() { this.contentEl.empty(); }
}

class CleanupResourcesModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-cleanup-modal');
    this.render();
  }
  onClose() { this.contentEl.empty(); }

  render() {
    this.contentEl.empty();
    const preview = model.orphanCleanupPreview(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv();
    copy.createEl('h2', { text: '清理未利用资源' });
    copy.createEl('p', { text: '先看预览，再备份并清理索引；不会删除本地文件、网盘内容、B站视频或 Anki 卡组。' });
    iconButton(head, 'x', '关闭', () => this.close());

    const metrics = this.contentEl.createDiv({ cls: 'rh-next-metrics rh-next-cleanup-metrics' });
    for (const [value, label] of [[preview.totalActive, '当前正式资源'], [preview.candidateCount, '可清理'], [preview.retainedCount, '保留']]) {
      const card = metrics.createDiv(); card.createEl('strong', { text: String(value) }); card.createEl('small', { text: label });
    }
    this.contentEl.createEl('p', {
      cls: 'rh-next-help',
      text: '会保留：项目模块、收件箱、学习计划、笔记引用、最近打开记录，以及已经明确完成过的资源。'
    });

    if (!preview.candidateCount) {
      const empty = this.contentEl.createDiv({ cls: 'rh-next-empty' });
      setIcon(empty.createDiv(), 'circle-check-big');
      empty.createEl('strong', { text: '没有需要清理的资源' });
      empty.createEl('p', { text: '当前资源都仍有用途或使用记录。' });
      return;
    }

    const list = this.contentEl.createDiv({ cls: 'rh-next-cleanup-groups' });
    const groups = [...preview.groups].sort((left, right) => right.resources.length - left.resources.length);
    for (const group of groups.slice(0, 20)) {
      const row = list.createDiv({ cls: 'rh-next-cleanup-group' });
      const icon = row.createSpan(); setIcon(icon, group.detail.startsWith('OpenList') ? 'cloud' : 'folder');
      const text = row.createDiv(); text.createEl('strong', { text: group.label }); text.createEl('small', { text: group.detail });
      row.createEl('span', { cls: 'rh-next-cleanup-count', text: `${group.resources.length} 条` });
    }
    if (groups.length > 20) list.createEl('p', { cls: 'rh-next-help', text: `另外还有 ${groups.length - 20} 个较小分组。` });

    const warning = this.contentEl.createDiv({ cls: 'rh-next-cleanup-warning' });
    setIcon(warning.createSpan(), 'shield-check');
    warning.createEl('p', { text: '确认后会先在插件目录生成完整状态备份。顶部会出现低调的撤回按钮，可一键恢复到清理前。' });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    const confirm = textButton(actions, `备份并清理 ${preview.candidateCount} 条`, 'eraser', async () => {
      confirm.disabled = true;
      try {
        const candidateIds = preview.candidates.map((resource) => resource.id);
        const backupName = await this.plugin.createStateBackup('before-resource-cleanup');
        const removed = await this.plugin.mutate((state) => {
          const removedIds = model.deleteOrphanResources(state, candidateIds);
          model.recordLastAction(state, {
            type: 'cleanup-resources',
            backupName,
            resourceIds: removedIds,
            label: `清理 ${removedIds.length} 条未利用资源`
          });
          return removedIds;
        }, { render: false });
        new Notice(`已清理 ${removed.length} 条资源索引；原始资料未删除，可从顶部撤回。`, 7000);
        this.close();
        await this.plugin.workbenchLeaf?.view?.render?.();
      } catch (error) {
        confirm.disabled = false;
        new Notice(`清理失败：${error.message || String(error)}`, 7000);
      }
    }, 'is-danger');
  }
}

class UnifiedAddModal extends Modal {
  constructor(app, plugin, context = {}) {
    super(app); this.plugin = plugin; this.context = context; this.mode = context.mode || 'paste'; this.sourceType = context.sourceType || 'openlist';
    this.selectedResourceIds = new Set();
    this.expandedResourceGroups = new Set();
    this.resourceRenderLimit = 80;
    this.importCollection = false;
    this.autoGroupParts = false;
    this.autoGroupSize = 20;
  }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-add-modal');
    this.render();
  }
  onClose() {
    if (this.searchDebounceTimer) window.clearTimeout(this.searchDebounceTimer);
    this.localScanCancelled = true;
    this.contentEl.empty();
  }

  render() {
    const state = this.plugin.state;
    const projects = model.activeProjects(state);
    const projectId = this.context.projectId && state.projects[this.context.projectId] ? this.context.projectId : projects[0]?.id || '';
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.mode === 'plan' ? '添加学习计划' : '添加内容' }); copy.createEl('p', { text: '所有入口在同一个弹窗中直接使用，不再进入二级菜单。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const modes = this.contentEl.createDiv({ cls: 'rh-next-add-modes' });
    const options = this.mode === 'plan'
      ? [['plan', '选择项目内容', 'list-todo']]
      : [['paste', '粘贴或文件', 'clipboard-paste'], ['inbox', '从收件箱', 'inbox'], ['library', '从资源库', 'library'], ['source', '从来源连接', 'plug-zap']];
    for (const [id, label, icon] of options) textButton(modes, label, icon, () => {
      this.mode = id; this.context.projectId = this.projectSelect?.value || projectId;
      this.selectedResourceIds.clear(); this.expandedResourceGroups.clear(); this.resourceRenderLimit = 80;
      this.render();
    }, this.mode === id ? 'is-active' : '');
    const form = this.contentEl.createDiv({ cls: 'rh-next-add-form' });
    if (!projects.length && this.mode !== 'paste' && this.mode !== 'source') {
      this.renderEmptyState(form, '先创建项目，才能把资源加入长期组织。');
      textButton(form, '新建项目', 'folder-plus', () => new TextPromptModal(this.app, '新建项目', '项目名称', async (value) => { const project = await this.plugin.mutate((s) => model.createProject(s, value), { render: false }); this.context.projectId = project.id; this.render(); }).open(), 'is-primary');
      return;
    }
    if (this.mode === 'paste') this.renderPaste(form, projectId, projects);
    else if (this.mode === 'inbox') this.renderExisting(form, projectId, projects, state.inbox.map((id) => state.resources[id]).filter(Boolean), '收件箱还没有资源。');
    else if (this.mode === 'library') this.renderExisting(form, projectId, projects, Object.values(state.resources).filter((resource) => !resource.deletedAt), '资源库还是空的。');
    else if (this.mode === 'plan') this.renderPlanPicker(form, projectId, projects);
    else this.renderSources(form, projectId, projects);
  }

  projectAndModuleFields(parent, projectId, projects) {
    const row = parent.createDiv({ cls: 'rh-next-form-grid' });
    const projectField = row.createDiv({ cls: 'rh-next-field' }); projectField.createEl('label', { text: '项目' });
    const projectSelect = projectField.createEl('select', { cls: 'rh-next-input' }); this.projectSelect = projectSelect;
    for (const project of projects) projectSelect.createEl('option', { text: project.title, value: project.id });
    projectSelect.value = projectId || projects[0]?.id || '';
    const moduleField = row.createDiv({ cls: 'rh-next-field' }); moduleField.createEl('label', { text: '学习模块' });
    const moduleSelect = moduleField.createEl('select', { cls: 'rh-next-input' }); this.moduleSelect = moduleSelect;
    const fillModules = () => {
      moduleSelect.empty();
      for (const module of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: module.title, value: module.id });
      moduleSelect.createEl('option', { text: '＋ 新建模块', value: '__new__' });
      if (this.context.moduleId && this.plugin.state.modules[this.context.moduleId]?.projectId === projectSelect.value) moduleSelect.value = this.context.moduleId;
    };
    projectSelect.addEventListener('change', fillModules); fillModules();
    return { projectSelect, moduleSelect };
  }

  async resolveModule(projectId, moduleValue, suggestedTitle = '学习材料') {
    if (moduleValue && moduleValue !== '__new__') return moduleValue;
    const title = await new Promise((resolve) => {
      new TextPromptModal(this.app, '新建学习模块', '模块名称', resolve, {
        initialValue: suggestedTitle,
        onCancel: () => resolve('')
      }).open();
    });
    if (!safeText(title)) throw new Error('已取消新建模块。');
    const module = model.createModule(this.plugin.state, projectId, title);
    return module.id;
  }

  requestDestination(suggestedTitle = '学习材料') {
    return new Promise((resolve) => {
      new ImportDestinationModal(this.app, this.plugin, { suggestedTitle, onChoose: resolve, onCancel: () => resolve(null) }).open();
    });
  }

  async previewLocalFolder(rootPath, status = null) {
    const resolvedRoot = path.resolve(rootPath);
    const stat = await fs.promises.stat(resolvedRoot);
    if (!stat.isDirectory()) throw new Error('选择的路径不是文件夹。');
    this.localScanCancelled = false;
    const files = await this.plugin.scanLocalFolder(resolvedRoot, {
      isCancelled: () => this.localScanCancelled,
      onProgress: ({ found, directories, failures }) => status?.setText(`正在扫描：${directories} 个目录 · ${found} 个支持文件 · ${failures} 个失败`)
    });
    if (!files.length) throw new Error(files.failures?.length ? `没有找到支持的文件；${files.failures.length} 个目录读取失败。` : '没有找到支持的文件。');
    new LocalFolderImportPreviewModal(this.app, this.plugin, resolvedRoot, files).open();
    return files;
  }

  recordAddAction(results, options = {}) {
    const resourceIds = [...new Set((results || []).map((result) => result?.resource?.id).filter(Boolean))];
    const linkedResourceIds = [...new Set((results || []).filter((result) => result?.linked).map((result) => result.resource.id))];
    const createdResourceIds = [...new Set((results || []).filter((result) => !result?.reused).map((result) => result.resource.id))];
    const inboxAddedResourceIds = [...new Set((results || []).filter((result) => result?.inboxAdded).map((result) => result.resource.id))];
    if (!resourceIds.length) return;
    model.recordLastAction(this.plugin.state, {
      type: 'add-resources',
      moduleId: options.moduleId || '',
      inbox: Boolean(options.inbox),
      resourceIds,
      linkedResourceIds,
      createdResourceIds,
      inboxAddedResourceIds,
      createdResourceGroupIds: [...new Set(options.createdResourceGroupIds || [])],
      label: options.label || `添加 ${resourceIds.length} 条资源`
    });
  }

  async handlePaste(fields, rawValue, titleOverride, inboxOnly, status) {
    const value = safeText(rawValue);
    if (!value) throw new Error('请先粘贴链接或填写文件路径。');
    const sources = Object.values(this.plugin.state.sources);
    const openListInput = model.parseOpenListUrl(value, sources);
    if (openListInput) {
      const source = this.plugin.findOpenListSource(openListInput);
      if (!source) {
        this.context.openListInput = openListInput;
        this.context.projectId = fields.projectSelect.value;
        this.context.moduleId = fields.moduleSelect.value;
        this.mode = 'source'; this.sourceType = 'openlist';
        new Notice('已识别 OpenList 目录，请先保存这个来源连接；保存连接不会扫描或创建资源。', 6000);
        this.render();
        return { redirected: true };
      }
      const rootPath = await this.plugin.resolveOpenListPath(source, openListInput);
      status.setText(`已打开目录浏览：${rootPath}`);
      new OpenListBrowserModal(this.app, this.plugin, source, rootPath).open();
      this.close();
      return { redirected: true };
    }

    const bili = model.parseBiliVideoUrl(value);
    if (bili) {
      status.setText(`正在读取 B站标题与分P：${bili.bvid}`);
      const cached = this.previewResolved?.key === bili.bvid.toUpperCase() ? this.previewResolved.result : null;
      const result = cached || await this.plugin.fetchBiliVideo(bili.bvid);
      if (!cached) {
        this.autoGroupParts = model.defaultResourceAutoGroupEnabled(result.items.length);
        this.autoGroupSize = 20;
      }
      const selectedItems = bili.page > 1 ? result.items.filter((item) => item.page === bili.page) : result.items;
      const items = this.importCollection && result.collection?.items?.length
        ? result.collection.items
        : (selectedItems.length ? selectedItems : result.items);
      const moduleId = inboxOnly ? '' : await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value, titleOverride || result.title);
      const addedResults = [];
      for (const item of items) {
        const itemBvid = String(item.bvid || bili.bvid).toUpperCase();
        const descriptor = {
          kind: 'video', title: items.length === 1 ? titleOverride || item.title : item.title,
          canonicalKey: `bili:${itemBvid}:p${item.page || 1}`,
          sourceId: '', launcher: { type: 'potplayer', target: item.url },
          metadata: { bvid: itemBvid, page: item.page || 1, originalUrl: item.url, owner: result.owner, cover: item.cover || result.cover, collectionTitle: this.importCollection ? result.collection?.title || '' : '' }
        };
        addedResults.push(inboxOnly
          ? model.upsertInboxDescriptor(this.plugin.state, descriptor)
          : model.upsertResourceDescriptor(this.plugin.state, moduleId, descriptor));
      }
      let grouping = null;
      const shouldAutoGroup = !inboxOnly && !this.importCollection && bili.page <= 1 && result.items.length > 1 && this.autoGroupParts;
      if (shouldAutoGroup) {
        grouping = model.autoGroupResources(this.plugin.state, moduleId, addedResults.map((item) => item.resource.id), {
          size: this.autoGroupSize,
          key: `bili:${bili.bvid.toUpperCase()}`
        });
      }
      this.recordAddAction(addedResults, {
        moduleId,
        inbox: inboxOnly,
        createdResourceGroupIds: grouping?.createdGroupIds || [],
        label: this.importCollection ? `导入合集：${result.collection?.title || result.title}` : `添加 B站视频：${result.title}`
      });
      await this.plugin.persist();
      new Notice(this.importCollection ? `已导入合集中的 ${items.length} 个视频。` : items.length > 1 ? `已按分P导入 ${items.length} 个视频。` : `已添加：${titleOverride || items[0].title}`);
      return { count: items.length, projectId: fields.projectSelect.value };
    }

    let moduleId = '';
    let addResult;
    if (inboxOnly) addResult = model.addInboxResource(this.plugin.state, value, titleOverride);
    else {
      moduleId = await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value);
      addResult = model.addResource(this.plugin.state, moduleId, value, titleOverride);
    }
    this.recordAddAction([addResult], { moduleId, inbox: inboxOnly, label: `添加资源：${addResult.resource.title}` });
    await this.plugin.persist();
    return { count: 1, projectId: fields.projectSelect.value };
  }

  renderPaste(parent, projectId, projects) {
    if (!projects.length) {
      const create = parent.createDiv({ cls: 'rh-next-field' }); create.createEl('label', { text: '先创建项目' });
      const name = input(create, { placeholder: '例如：英语学习' });
      textButton(parent, '创建并继续', 'folder-plus', async () => { const project = await this.plugin.mutate((state) => model.createProject(state, name.value), { render: false }); this.context.projectId = project.id; this.render(); }, 'is-primary');
      return;
    }
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    const workspace = parent.createDiv({ cls: 'rh-next-paste-workspace' });
    const inputs = workspace.createDiv({ cls: 'rh-next-paste-inputs' });
    const details = workspace.createDiv({ cls: 'rh-next-preview-panel' });
    const resourceField = inputs.createDiv({ cls: 'rh-next-field' }); resourceField.createEl('label', { text: '链接、Anki 卡组或本地文件路径' });
    const raw = input(resourceField, { multiline: true, placeholder: '粘贴 https://…、jv://…、anki: 卡组名，或 C:\\课程\\01.mp4' });
    const dropZone = resourceField.createDiv({ cls: 'rh-next-local-drop-zone' }); setIcon(dropZone.createSpan(), 'folder-input'); dropZone.createSpan({ text: '拖入本地文件或文件夹；文件夹会先扫描并预览' });
    const preview = resourceField.createDiv({ cls: 'rh-next-parse-preview' });
    const titleField = inputs.createDiv({ cls: 'rh-next-field' }); titleField.createEl('label', { text: '显示名称（可选）' });
    const title = input(titleField, { placeholder: '留空则自动读取标题' });
    const groupSettings = inputs.createDiv({ cls: 'rh-next-bili-group-settings' });
    const paintBiliGrouping = (result) => {
      groupSettings.empty();
      const count = Number(result?.items?.length || 0);
      groupSettings.style.display = count > 1 ? '' : 'none';
      if (count <= 1) return;
      const heading = groupSettings.createDiv({ cls: 'rh-next-bili-group-heading' });
      const copy = heading.createDiv(); copy.createEl('strong', { text: '自动分组' }); copy.createEl('small', { text: '按 B站原始 P 序号整理到当前学习模块' });
      const toggle = heading.createEl('label', { cls: 'rh-next-switch' });
      const checkbox = toggle.createEl('input', { type: 'checkbox' }); checkbox.checked = this.autoGroupParts;
      toggle.createSpan();
      const grid = groupSettings.createDiv({ cls: 'rh-next-bili-group-grid' });
      const sizeField = grid.createDiv({ cls: 'rh-next-field' }); sizeField.createEl('label', { text: '每组数量' });
      const sizeInput = sizeField.createEl('input', { cls: 'rh-next-input', type: 'number', attr: { min: '1', max: '200', step: '1' } }); sizeInput.value = String(this.autoGroupSize);
      const summary = grid.createDiv({ cls: 'rh-next-bili-group-summary' });
      const paintSummary = () => {
        const size = Math.max(1, Math.min(200, Math.floor(Number(this.autoGroupSize || 20))));
        const enabled = this.autoGroupParts && !this.importCollection;
        summary.empty(); summary.createEl('small', { text: '预计结果' });
        summary.createEl('strong', { text: enabled ? `${Math.ceil(count / size)} 组 · ${count}P` : `未分组 · ${count}P` });
        summary.createEl('span', { text: this.importCollection ? '合集导入暂不创建分组' : enabled ? '第一组、第二组……' : '保持原始顺序' });
        checkbox.disabled = this.importCollection;
        sizeInput.disabled = !enabled;
      };
      checkbox.addEventListener('change', () => { this.autoGroupParts = checkbox.checked; paintSummary(); });
      sizeInput.addEventListener('change', () => { this.autoGroupSize = Math.max(1, Math.min(200, Math.floor(Number(sizeInput.value || 20)))); sizeInput.value = String(this.autoGroupSize); paintSummary(); });
      paintSummary();
    };
    const paintDetailsEmpty = (titleText = '解析预览', detail = '粘贴链接后，这里会显示标题、封面、分P或合集内容。') => {
      details.empty();
      const empty = details.createDiv({ cls: 'rh-next-preview-empty' });
      setIcon(empty.createSpan(), 'scan-search');
      empty.createEl('strong', { text: titleText });
      empty.createEl('small', { text: detail });
    };
    const paintBiliDetails = (result) => {
      details.empty();
      const hero = details.createDiv({ cls: 'rh-next-preview-hero' });
      if (result.cover) hero.createEl('img', { attr: { src: result.cover, alt: '' } });
      const copy = hero.createDiv(); copy.createEl('small', { text: result.owner ? `UP · ${result.owner}` : 'B站视频' }); copy.createEl('strong', { text: result.title });
      if (result.description) copy.createEl('p', { text: result.description });
      const sections = [];
      if (result.items?.length > 1) sections.push({ title: `分P · ${result.items.length} 条`, items: result.items });
      if (result.collection?.items?.length) sections.push({ title: `${result.collection.title} · ${result.collection.items.length} 条`, items: result.collection.items, collection: true });
      if (!sections.length) {
        const single = details.createDiv({ cls: 'rh-next-preview-single' }); setIcon(single.createSpan(), 'play-circle');
        const text = single.createDiv(); text.createEl('strong', { text: '单个视频' }); text.createEl('small', { text: '将作为一条可直接启动 PotPlayer 的资源添加。' });
      }
      for (const section of sections) {
        const header = details.createDiv({ cls: 'rh-next-preview-section-head' }); header.createEl('strong', { text: section.title });
        if (section.collection) {
          const option = header.createEl('label', { cls: 'rh-next-preview-import-toggle' });
          const checkbox = option.createEl('input', { type: 'checkbox' }); checkbox.checked = this.importCollection;
          option.createSpan({ text: '导入整个合集' });
          checkbox.addEventListener('change', () => { this.importCollection = checkbox.checked; paintBiliGrouping(result); });
        }
        const list = details.createDiv({ cls: 'rh-next-preview-video-list' });
        for (const item of section.items.slice(0, 12)) {
          const row = list.createDiv({ cls: 'rh-next-preview-video-row' });
          setIcon(row.createSpan(), 'play');
          const text = row.createDiv(); text.createEl('strong', { text: item.title });
          text.createEl('small', { text: item.duration ? formatDuration(item.duration) : item.bvid || `P${item.page || 1}` });
        }
        if (section.items.length > 12) list.createEl('small', { cls: 'rh-next-preview-more', text: `还有 ${section.items.length - 12} 条，导入后可在模块中查看。` });
      }
    };
    paintDetailsEmpty();
    const paintPreview = (icon, label, detail, error = false) => {
      preview.empty(); setIcon(preview.createSpan({ cls: 'rh-next-parse-preview-icon' }), icon);
      const copy = preview.createDiv(); copy.createEl('strong', { text: label }); copy.createEl('small', { text: detail });
      preview.toggleClass('is-error', error);
    };
    const updatePreview = () => {
      if (this.previewTimer) window.clearTimeout(this.previewTimer);
      const requestId = (this.previewRequestId || 0) + 1; this.previewRequestId = requestId;
      const value = safeText(raw.value);
      preview.style.display = value ? 'flex' : 'none';
      if (!value) { this.importCollection = false; this.autoGroupParts = false; groupSettings.empty(); groupSettings.style.display = 'none'; paintDetailsEmpty(); return; }
      groupSettings.empty(); groupSettings.style.display = 'none';
      try {
        const openList = model.parseOpenListUrl(value, Object.values(this.plugin.state.sources));
        if (openList) {
          paintPreview('cloud', '已识别：OpenList 目录', `${openList.title} · ${openList.rootPath}`);
          details.empty();
          const cloud = details.createDiv({ cls: 'rh-next-preview-source' }); setIcon(cloud.createSpan(), 'cloud');
          const text = cloud.createDiv(); text.createEl('small', { text: 'OpenList 目录' }); text.createEl('strong', { text: openList.title || '远程视频目录' }); text.createEl('code', { text: openList.rootPath });
          details.createEl('p', { cls: 'rh-next-help', text: this.plugin.findOpenListSource(openList) ? '连接已匹配。添加后会递归读取视频，并按目录折叠成资源组。' : '尚未匹配连接。添加时会先进入同一弹窗中的 OpenList 配置。' });
          return;
        }
        const bili = model.parseBiliVideoUrl(value);
        if (bili) {
          this.importCollection = false;
          paintPreview('clapperboard', '已识别：B站视频', `${bili.bvid} · 正在读取标题……`);
          paintDetailsEmpty('正在读取视频详情', `${bili.bvid} · 获取封面、分P与所属合集…`);
          this.previewTimer = window.setTimeout(async () => {
            try {
              const result = await this.plugin.fetchBiliVideo(bili.bvid);
              if (this.previewRequestId !== requestId) return;
              if (this.previewResolved?.key !== bili.bvid.toUpperCase()) {
                this.autoGroupParts = model.defaultResourceAutoGroupEnabled(result.items.length);
                this.autoGroupSize = 20;
              }
              this.previewResolved = { key: bili.bvid.toUpperCase(), result };
              paintPreview('clapperboard', result.items.length > 1 ? `已识别：B站分P视频（${result.items.length}P）` : '已识别：B站视频', result.title);
              paintBiliGrouping(result);
              paintBiliDetails(result);
            } catch (error) {
              if (this.previewRequestId === requestId) {
                paintPreview('clapperboard', '已识别：B站视频', `${bili.bvid} · 标题读取失败：${error.message || String(error)}`, true);
                paintDetailsEmpty('详情读取失败', error.message || String(error));
              }
            }
          }, 450);
          return;
        }
        const inferred = model.inferResource(value);
        paintPreview(kindIcon(inferred.kind), `已识别：${kindLabel(inferred.kind)}`, inferred.title);
        details.empty();
        const generic = details.createDiv({ cls: 'rh-next-preview-source' }); setIcon(generic.createSpan(), kindIcon(inferred.kind));
        const text = generic.createDiv(); text.createEl('small', { text: kindLabel(inferred.kind) }); text.createEl('strong', { text: inferred.title }); text.createEl('code', { text: value });
      } catch (error) {
        paintPreview('circle-help', '尚未识别为可添加资源', error.message || String(error), true);
        paintDetailsEmpty('等待有效资源', '可粘贴 B站视频、OpenList 目录、网页、Anki 卡组或本地文件。');
      }
    };
    raw.addEventListener('input', updatePreview);
    const localPathFromFile = (file) => webUtils?.getPathForFile?.(file) || file?.path || '';
    const handleLocalDrop = async (event) => {
      event.preventDefault(); event.stopPropagation(); dropZone.removeClass('is-dragging');
      const file = event.dataTransfer?.files?.[0]; const droppedPath = localPathFromFile(file);
      if (!droppedPath) return new Notice('无法读取拖入项目的本地路径。', 5000);
      try {
        const stat = await fs.promises.stat(droppedPath);
        if (stat.isDirectory()) {
          dropZone.addClass('is-busy'); dropZone.querySelector('span:last-child')?.setText('正在扫描文件夹；点击这里可取消');
          await this.previewLocalFolder(droppedPath);
        } else {
          raw.value = droppedPath; raw.dispatchEvent(new Event('input'));
        }
      } catch (error) { new Notice(`无法解析拖入内容：${error.message || String(error)}`, 6000); }
      finally { dropZone.removeClass('is-busy'); dropZone.querySelector('span:last-child')?.setText('拖入本地文件或文件夹；文件夹会先扫描并预览'); }
    };
    for (const target of [dropZone, raw]) {
      target.addEventListener('dragover', (event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); event.stopPropagation(); dropZone.addClass('is-dragging'); } });
      target.addEventListener('dragleave', () => dropZone.removeClass('is-dragging'));
      target.addEventListener('drop', handleLocalDrop);
    }
    dropZone.addEventListener('click', () => { if (dropZone.hasClass('is-busy')) this.localScanCancelled = true; });
    updatePreview();
    const status = parent.createEl('p', { cls: 'rh-next-help', text: 'B站会读取标题、分P和所属合集；OpenList 目录会递归导入视频，并在打开时刷新签名。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    const run = async (inboxOnly) => {
      if (this.busy) return;
      this.busy = true; actions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      try {
        const result = await this.handlePaste(fields, raw.value, title.value, inboxOnly, status);
        if (result?.redirected) return;
        this.close();
        if (inboxOnly) { new Notice('已放入收件箱。'); await this.plugin.workbenchLeaf?.view?.render?.(); }
        else await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: result.projectId });
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
      finally { this.busy = false; actions.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
    };
    textButton(actions, '仅放入收件箱', 'inbox', () => run(true));
    textButton(actions, '添加到项目', 'plus', () => run(false), 'is-primary');
  }

  resourceGroupInfo(resource) {
    return model.resourcePickerGroupInfo(resource, this.plugin.state.sources);
  }

  renderExisting(parent, projectId, projects, resources, emptyText) {
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    const toolbar = parent.createDiv({ cls: 'rh-next-picker-toolbar' });
    const search = input(toolbar, { placeholder: '搜索标题、类型或来源目录……' });
    const summary = toolbar.createEl('span', { cls: 'rh-next-picker-summary' });
    const list = parent.createDiv({ cls: 'rh-next-resource-groups' });
    const selected = this.selectedResourceIds;
    const pickerIndex = model.buildResourcePickerIndex(resources, this.plugin.state.sources);
    const resourceRow = (container, resource, repaint) => {
      const row = container.createDiv({ cls: `rh-next-picker-row ${selected.has(resource.id) ? 'is-selected' : ''}` });
      const mark = row.createSpan(); setIcon(mark, selected.has(resource.id) ? 'circle-check-big' : kindIcon(resource.kind));
      const text = row.createDiv(); text.createEl('strong', { text: resource.title }); text.createEl('small', { text: `${kindLabel(resource.kind)}${resource.lastOpenedAt ? ' · 最近打开过' : ''}` });
      row.addEventListener('click', () => { selected.has(resource.id) ? selected.delete(resource.id) : selected.add(resource.id); repaint(); });
    };
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      summary.setText(`已选 ${selected.size} · 共 ${resources.length} 条 / ${pickerIndex.groups.length} 组`);
      if (query) {
        const matches = pickerIndex.entries.filter((entry) => entry.searchText.includes(query)).map((entry) => entry.resource);
        if (!matches.length) return this.renderEmptyState(list, '没有找到匹配资源。');
        const visible = matches.slice(0, this.resourceRenderLimit);
        for (const resource of visible) resourceRow(list, resource, paint);
        if (matches.length > visible.length) textButton(list, `继续加载（剩余 ${matches.length - visible.length} 条）`, 'chevrons-down', () => { this.resourceRenderLimit += 80; paint(); }, 'is-subtle');
        return;
      }
      if (!resources.length) return this.renderEmptyState(list, emptyText);
      for (const group of pickerIndex.groups) {
        if (group.resources.length === 1) { resourceRow(list, group.resources[0], paint); continue; }
        const expanded = this.expandedResourceGroups.has(group.key);
        const card = list.createDiv({ cls: `rh-next-picker-group ${expanded ? 'is-expanded' : ''}` });
        const header = card.createDiv({ cls: 'rh-next-picker-group-head' });
        setIcon(header.createSpan(), expanded ? 'chevron-down' : 'chevron-right');
        const copy = header.createDiv(); copy.createEl('strong', { text: group.label }); copy.createEl('small', { text: `${group.detail} · ${group.resources.length} 条` });
        const selectedCount = group.resources.filter((resource) => selected.has(resource.id)).length;
        const selectAll = header.createEl('button', { cls: 'clickable-icon rh-next-group-select', attr: { type: 'button', 'aria-label': '选择整个资源组' } });
        setIcon(selectAll, selectedCount === group.resources.length ? 'circle-check-big' : 'circle');
        selectAll.createSpan({ text: selectedCount ? `${selectedCount}/${group.resources.length}` : '全选' });
        selectAll.addEventListener('click', (event) => {
          event.stopPropagation();
          const shouldSelect = selectedCount !== group.resources.length;
          for (const resource of group.resources) shouldSelect ? selected.add(resource.id) : selected.delete(resource.id);
          paint();
        });
        header.addEventListener('click', () => { expanded ? this.expandedResourceGroups.delete(group.key) : this.expandedResourceGroups.add(group.key); paint(); });
        if (expanded) {
          const body = card.createDiv({ cls: 'rh-next-picker-group-body' });
          const limitKey = `groupLimit:${group.key}`;
          const limit = this[limitKey] || 80;
          for (const resource of group.resources.slice(0, limit)) resourceRow(body, resource, paint);
          if (group.resources.length > limit) textButton(body, `继续加载（剩余 ${group.resources.length - limit} 条）`, 'chevrons-down', () => { this[limitKey] = limit + 80; paint(); }, 'is-subtle');
        }
      }
    };
    search.addEventListener('input', () => {
      if (this.searchDebounceTimer) window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = window.setTimeout(() => { this.resourceRenderLimit = 80; paint(); }, 180);
    });
    paint();
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '加入所选资源', 'plus', async () => {
      if (!selected.size) return new Notice('请先选择资源。');
      try {
        const moduleId = await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value);
        const module = this.plugin.state.modules[moduleId];
        const existingIds = new Set(module.resourceIds || []);
        const addedIds = [...selected].filter((id) => !existingIds.has(id));
        if (!addedIds.length) return new Notice('所选资源已经在这个模块中。');
        model.linkResourcesToModule(this.plugin.state, moduleId, addedIds);
        this.plugin.state.inbox = this.plugin.state.inbox.filter((id) => !selected.has(id));
        model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId, inbox: false, resourceIds: addedIds, linkedResourceIds: addedIds, createdResourceIds: [], restoreInboxIds: this.mode === 'inbox' ? addedIds : [], label: `${this.mode === 'inbox' ? '从收件箱' : '从资源库'}加入 ${addedIds.length} 条资源` });
        await this.plugin.persist(); new Notice(`已加入 ${addedIds.length} 条资源。`); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: fields.projectSelect.value });
      } catch (error) { new Notice(error.message || String(error)); }
    }, 'is-primary');
  }

  renderPlanPicker(parent, projectId, projects) {
    if (!projects.length) return this.renderEmptyState(parent, '还没有项目。');
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    fields.moduleSelect.querySelector('option[value="__new__"]')?.remove();
    const target = parent.createDiv({ cls: 'rh-next-field' }); target.createEl('label', { text: '每日目标次数' });
    const amount = input(target, { type: 'number', value: '1' }); amount.min = '1'; amount.max = '99';
    const schedule = parent.createDiv({ cls: 'rh-next-field' }); schedule.createEl('label', { text: '刷新日' });
    const weekdayRow = schedule.createDiv({ cls: 'rh-next-weekday-row' });
    const weekdayInputs = new Map();
    for (const [day, label] of [[1, '一'], [2, '二'], [3, '三'], [4, '四'], [5, '五'], [6, '六'], [0, '日']]) {
      const chip = weekdayRow.createEl('label', { cls: 'rh-next-weekday-chip' });
      const checkbox = chip.createEl('input', { type: 'checkbox' }); checkbox.checked = true;
      chip.createSpan({ text: label }); weekdayInputs.set(day, checkbox);
    }
    const reset = parent.createDiv({ cls: 'rh-next-field' }); reset.createEl('label', { text: '每日刷新时间（整点）' });
    const resetHour = input(reset, { type: 'number', value: '4' }); resetHour.min = '0'; resetHour.max = '23';
    reset.createEl('small', { text: '默认凌晨 4 点；凌晨 4 点前仍算前一个学习日。', cls: 'rh-next-help' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '创建计划', 'repeat-2', async () => {
      const moduleId = fields.moduleSelect.value;
      if (!moduleId) return new Notice('这个项目还没有模块。');
      const weekdays = [...weekdayInputs.entries()].filter(([, checkbox]) => checkbox.checked).map(([day]) => day);
      if (!weekdays.length) return new Notice('请至少选择一个刷新日。');
      const module = this.plugin.state.modules[moduleId];
      const result = model.createPlanForTarget(this.plugin.state, fields.projectSelect.value, 'module', moduleId, module.title);
      result.plan.dailyTarget = Math.max(1, Number(amount.value || 1));
      result.plan.schedule = { type: 'weekly', weekdays };
      result.plan.resetHour = Math.max(0, Math.min(23, Number(resetHour.value || 4)));
      await this.plugin.persist(); new Notice(result.reused ? '已有相同计划，已更新目标。' : '已创建学习计划。'); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('today');
    }, 'is-primary');
  }

  renderSources(parent, projectId, projects) {
    parent.createEl('p', { text: '连接配置保存在插件后台；密码由 Windows 安全存储加密，项目里只显示普通资源。', cls: 'rh-next-help' });
    const grid = parent.createDiv({ cls: 'rh-next-source-grid' });
    for (const [type, name, icon, detail] of [['openlist', 'OpenList', 'cloud', '导入远程目录'], ['anki', 'Anki', 'layers-3', '选择本地卡组'], ['local-folder', '本地文件夹', 'folder', '扫描课程目录'], ['bilibili', 'B站订阅', 'rss', '保存UP主页']]) {
      const card = grid.createDiv({ cls: `rh-next-source-card ${this.sourceType === type ? 'is-selected' : ''}` }); setIcon(card.createSpan(), icon); const text = card.createDiv(); text.createEl('strong', { text: name }); text.createEl('small', { text: detail }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => { this.sourceType = type; this.context.projectId = projectId; this.render(); });
    }
    const panel = parent.createDiv({ cls: 'rh-next-source-config' });
    if (this.sourceType === 'anki') this.renderAnkiSource(panel);
    else if (this.sourceType === 'local-folder') this.renderLocalFolderSource(panel);
    else if (this.sourceType === 'bilibili') this.renderBilibiliSource(panel);
    else this.renderOpenListSource(panel);
  }

  renderOpenListSource(parent) {
    const draft = this.context.openListInput || null;
    const existing = (draft ? this.plugin.findOpenListSource(draft) : null) || Object.values(this.plugin.state.sources).find((source) => source.type === 'openlist' && !source.deletedAt) || {};
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const baseField = grid.createDiv({ cls: 'rh-next-field' }); baseField.createEl('label', { text: 'OpenList 地址' }); const baseUrl = input(baseField, { value: draft?.baseUrl || existing.baseUrl || 'http://127.0.0.1:5244' });
    const rootField = grid.createDiv({ cls: 'rh-next-field' }); rootField.createEl('label', { text: '远程目录' }); const rootPath = input(rootField, { value: draft?.rootPath || existing.rootPath || '/', placeholder: '/夸克网盘/课程' });
    const userField = grid.createDiv({ cls: 'rh-next-field' }); userField.createEl('label', { text: '只读用户名（可选）' }); const username = input(userField, { value: existing.username || '' });
    const passField = grid.createDiv({ cls: 'rh-next-field' }); passField.createEl('label', { text: '密码（留空保留已保存密码）' }); const password = input(passField, { type: 'password', placeholder: existing.encryptedPassword ? '已安全保存' : '' });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '保存连接不会扫描或创建资源；浏览目录后由你明确选择要导入的内容。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    const buildSourceInput = () => {
      const normalizedBase = model.normalizeOpenListBaseUrl(baseUrl.value.trim());
      const encryptedPassword = password.value ? this.plugin.encryptSecret(password.value) : existing.encryptedPassword || '';
      return { type: 'openlist', baseUrl: normalizedBase, rootPath: rootPath.value.trim() || '/', username: username.value.trim(), encryptedPassword, identity: existing.identity || normalizedBase.toLowerCase() };
    };
    textButton(actions, '测试连接', 'plug-zap', async () => {
      try {
        const draftSource = { id: existing.id || 'openlist-test', ...buildSourceInput() };
        this.plugin.openListTokens.delete(draftSource.id);
        const token = await this.plugin.loginOpenList(draftSource);
        await this.plugin.getOpenList(draftSource, model.normalizeOpenListPath(rootPath.value || '/'), token);
        status.setText('连接成功；尚未扫描或创建任何资源。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    });
    textButton(actions, '保存连接', 'save', async () => {
      try {
        const sourceInput = buildSourceInput();
        const draftSource = { id: existing.id || 'openlist-save-test', ...sourceInput };
        this.plugin.openListTokens.delete(draftSource.id);
        const token = await this.plugin.loginOpenList(draftSource);
        await this.plugin.getOpenList(draftSource, model.normalizeOpenListPath(draftSource.rootPath || '/'), token);
        const { source } = model.upsertSource(this.plugin.state, sourceInput);
        if (token) this.plugin.openListTokens.set(source.id, token);
        await this.plugin.persist();
        status.setText('连接已保存；没有扫描或创建资源。');
        new Notice('OpenList 连接已保存。');
        new OpenListBrowserModal(this.app, this.plugin, source, draft?.rootPath || source.rootPath || '/').open();
      } catch (error) { status.setText(`保存失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    }, 'is-primary');
    if (existing.id) textButton(actions, '浏览目录', 'folder-open', () => new OpenListBrowserModal(this.app, this.plugin, existing, draft?.rootPath || existing.rootPath || '/').open());
  }

  renderAnkiSource(parent) {
    const existing = Object.values(this.plugin.state.sources).find((source) => source.type === 'anki' && !source.deletedAt) || {};
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const endpointField = grid.createDiv({ cls: 'rh-next-field' }); endpointField.createEl('label', { text: 'AnkiConnect 地址' }); const endpoint = input(endpointField, { value: existing.endpoint || 'http://127.0.0.1:8765' });
    const exeField = grid.createDiv({ cls: 'rh-next-field' }); exeField.createEl('label', { text: 'anki.exe（未启动时自动打开）' }); const executable = input(exeField, { value: existing.executablePath || this.plugin.resolveAnkiExecutable(''), placeholder: 'C:\\Program Files\\Anki\\anki.exe' });
    const profileField = grid.createDiv({ cls: 'rh-next-field' }); profileField.createEl('label', { text: 'Profile（可选）' }); const profile = input(profileField, { value: existing.profile || '' });
    const timeoutField = grid.createDiv({ cls: 'rh-next-field' }); timeoutField.createEl('label', { text: '启动等待毫秒' }); const timeout = input(timeoutField, { type: 'number', value: String(existing.startupTimeout || 30000) });
    const resultBox = parent.createDiv({ cls: 'rh-next-picker-list' });
    const selected = new Set();
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '读取卡组', 'refresh-cw', async () => {
      try {
        const { source } = model.upsertSource(this.plugin.state, { type: 'anki', endpoint: endpoint.value.trim(), executablePath: executable.value.trim(), profile: profile.value.trim(), startupTimeout: Number(timeout.value || 30000), identity: endpoint.value.trim().toLowerCase() });
        await this.plugin.persist();
        await this.plugin.ensureAnkiRunning();
        const decks = await this.plugin.invokeAnki('deckNames');
        resultBox.empty();
        for (const deck of decks || []) {
          const row = resultBox.createDiv({ cls: 'rh-next-picker-row' }); const mark = row.createSpan(); setIcon(mark, 'layers-3'); row.createEl('strong', { text: deck });
          row.addEventListener('click', () => { selected.has(deck) ? selected.delete(deck) : selected.add(deck); row.toggleClass('is-selected', selected.has(deck)); setIcon(mark, selected.has(deck) ? 'circle-check-big' : 'layers-3'); });
        }
        new Notice(`读取到 ${decks?.length || 0} 个卡组。`);
      } catch (error) { new Notice(`Anki 连接失败：${error.message || String(error)}`, 6000); }
    });
    textButton(actions, '导入选中卡组', 'plus', async () => {
      if (!selected.size) return new Notice('请先读取并选择卡组。');
      const destination = await this.requestDestination('Anki 卡组');
      if (!destination) return;
      const source = Object.values(this.plugin.state.sources).find((item) => item.type === 'anki' && !item.deletedAt);
      const addedResults = [];
      for (const deck of selected) {
        const descriptor = { kind: 'anki', title: deck.split('::').pop() || deck, canonicalKey: `anki:${deck.toLowerCase()}`, sourceId: source?.id || '', launcher: { type: 'anki', deck }, metadata: { deck } };
        addedResults.push(destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor));
      }
      this.recordAddAction(addedResults, { moduleId: destination.moduleId, inbox: destination.inbox, label: `导入 Anki 卡组 ${selected.size} 个` });
      await this.plugin.persist(); new Notice(`已导入 ${selected.size} 个卡组。`); this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    }, 'is-primary');
  }

  renderLocalFolderSource(parent) {
    const existing = Object.values(this.plugin.state.sources).find((source) => source.type === 'local-folder' && !source.deletedAt) || {};
    const field = parent.createDiv({ cls: 'rh-next-field' }); field.createEl('label', { text: '本地课程文件夹' });
    const row = field.createDiv({ cls: 'rh-next-path-row' }); const folder = input(row, { value: existing.path || '', placeholder: '选择或填写文件夹路径' });
    textButton(row, '选择', 'folder-open', async () => {
      const result = await dialog?.showOpenDialog?.({ properties: ['openDirectory'] });
      if (!result?.canceled && result.filePaths?.[0]) folder.value = result.filePaths[0];
    });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '保存来源不会扫描；只有点击“扫描并导入”后才读取文件。不会复制原文件。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '保存来源', 'save', async () => {
      try {
        if (!fs.existsSync(folder.value) || !fs.statSync(folder.value).isDirectory()) throw new Error('文件夹不存在或路径不是目录。');
        model.upsertSource(this.plugin.state, { type: 'local-folder', path: folder.value, identity: path.resolve(folder.value).toLowerCase() });
        await this.plugin.persist(); status.setText('来源已保存；尚未扫描或创建资源。'); new Notice('本地文件夹来源已保存。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    });
    const cancelScan = textButton(actions, '取消扫描', 'x', () => { this.localScanCancelled = true; status.setText('正在取消扫描……'); }); cancelScan.style.display = 'none';
    const scanButton = textButton(actions, '扫描并预览', 'folder-sync', async () => {
      try {
        scanButton.disabled = true; cancelScan.style.display = '';
        await this.previewLocalFolder(folder.value, status);
        status.setText('扫描完成；请在预览中选择收件箱或项目。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
      finally { scanButton.disabled = false; cancelScan.style.display = 'none'; }
    }, 'is-primary');
  }

  renderBilibiliSource(parent) {
    let selectedUser = null;
    let searchResults = [];
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const midField = grid.createDiv({ cls: 'rh-next-field' }); midField.createEl('label', { text: 'UP UID、主页链接或名称' });
    const searchRow = midField.createDiv({ cls: 'rh-next-path-row' });
    const midInput = input(searchRow, { placeholder: '例如：英语兔、483162496 或 B站主页链接' });
    const searchButton = textButton(searchRow, '搜索', 'search', () => void runSearch());
    const aliasField = grid.createDiv({ cls: 'rh-next-field' }); aliasField.createEl('label', { text: '显示名称（可选）' }); const alias = input(aliasField, { placeholder: '选择搜索结果后自动填写' });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '输入名称可搜索UP；输入UID或主页链接可直接保存。' });
    const resultList = parent.createDiv({ cls: 'rh-next-bili-user-results' });
    const paintResults = () => {
      resultList.empty();
      if (!searchResults.length) return;
      for (const user of searchResults) {
        const row = resultList.createEl('button', { cls: `rh-next-bili-user-result ${selectedUser?.mid === user.mid ? 'is-selected' : ''}`, attr: { type: 'button', 'aria-label': `选择UP ${user.name}` } });
        const avatar = row.createDiv({ cls: 'rh-next-bili-user-avatar' });
        if (user.avatar) avatar.createEl('img', { attr: { src: user.avatar, alt: '', referrerpolicy: 'no-referrer' } }); else avatar.setText(user.name.slice(0, 1));
        const copy = row.createDiv({ cls: 'rh-next-bili-user-copy' });
        copy.createEl('strong', { text: user.name });
        copy.createEl('small', { text: `UID ${user.mid} · ${user.followers.toLocaleString()} 粉丝 · ${user.videos} 个视频` });
        if (user.description) copy.createEl('p', { text: user.description });
        const mark = row.createSpan(); setIcon(mark, selectedUser?.mid === user.mid ? 'circle-check-big' : 'chevron-right');
        row.addEventListener('click', () => {
          selectedUser = user;
          midInput.value = user.mid;
          if (!alias.value.trim()) alias.value = user.name;
          paintResults();
        });
      }
    };
    const runSearch = async () => {
      const raw = midInput.value.trim();
      if (!raw) return new Notice('请先输入UP名称、UID或主页链接。');
      const directMid = model.parseBiliUserInput(raw);
      if (directMid) {
        selectedUser = null; searchResults = []; paintResults();
        status.setText(`已识别 UID ${directMid}，可以直接保存订阅。`);
        return;
      }
      searchButton.disabled = true;
      status.setText(`正在搜索：${raw}`);
      try {
        searchResults = await this.plugin.searchBiliUsers(raw);
        selectedUser = searchResults.length === 1 ? searchResults[0] : null;
        if (selectedUser) { midInput.value = selectedUser.mid; if (!alias.value.trim()) alias.value = selectedUser.name; }
        status.setText(searchResults.length ? `找到 ${searchResults.length} 个UP，请选择正确账号。` : '没有找到匹配UP，可改用UID或主页链接。');
        paintResults();
      } catch (error) {
        searchResults = []; selectedUser = null; paintResults();
        status.setText(`搜索失败：${error.message || String(error)}`);
        new Notice(status.textContent, 6000);
      } finally { searchButton.disabled = false; }
    };
    midInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '添加订阅', 'rss', async () => {
      const mid = model.parseBiliUserInput(midInput.value);
      if (!mid) return new Notice('请先搜索并选择UP，或填写UID/主页链接。');
      const chosen = selectedUser?.mid === mid ? selectedUser : null;
      const { source } = model.upsertSource(this.plugin.state, {
        type: 'bilibili', mid, alias: alias.value.trim() || chosen?.name || `UP ${mid}`, identity: mid,
        homepage: `https://space.bilibili.com/${mid}`, avatar: chosen?.avatar || '', description: chosen?.description || '', followers: chosen?.followers || 0
      });
      await this.plugin.persist();
      try { await this.plugin.refreshBiliProfile(source); } catch (error) { source.lastError = error.message || String(error); await this.plugin.persist(); }
      new Notice(`已添加订阅：${source.alias}`); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('subscriptions');
    }, 'is-primary');
  }

  renderEmptyState(parent, text) { parent.createEl('p', { text, cls: 'rh-next-empty-inline' }); }
}

class LegacyBiliHomepageCleanupModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.selected = new Set(); }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-cleanup-modal');
    const candidates = model.legacyBiliHomepageResources(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '整理旧订阅主页资源' }); copy.createEl('p', { text: '这些条目来自旧版“添加 UP 同时创建主页资源”。这里只做预览，勾选确认后移入可恢复的回收站。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const resource of candidates) {
      const row = list.createEl('label', { cls: 'rh-next-picker-row' });
      const box = row.createEl('input', { type: 'checkbox' }); box.addEventListener('change', () => { box.checked ? this.selected.add(resource.id) : this.selected.delete(resource.id); row.toggleClass('is-selected', box.checked); });
      const body = row.createDiv(); body.createEl('strong', { text: resource.title }); body.createEl('small', { text: resource.launcher?.uri || resource.metadata?.originalUrl || 'B站主页' });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '移入回收站', 'trash-2', async () => {
      if (!this.selected.size) return new Notice('请先勾选要整理的旧主页资源。');
      await this.plugin.mutate((state) => { for (const resourceId of this.selected) model.trashResource(state, resourceId); });
      new Notice(`已将 ${this.selected.size} 条旧订阅主页移入回收站，可随时恢复。`); this.close();
    }, 'is-danger');
  }
  onClose() { this.contentEl.empty(); }
}

class ImportDestinationModal extends Modal {
  constructor(app, plugin, options = {}) { super(app); this.plugin = plugin; this.options = options; this.chosen = false; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-destination-modal');
    const projects = model.activeProjects(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '选择保存位置' }); copy.createEl('p', { text: '来源连接保持全局；只有这一步会创建正式资源。' });
    iconButton(head, 'x', '关闭', () => this.close());
    let projectSelect = null; let moduleSelect = null;
    if (projects.length) {
      const grid = this.contentEl.createDiv({ cls: 'rh-next-form-grid' });
      const projectField = grid.createDiv({ cls: 'rh-next-field' }); projectField.createEl('label', { text: '项目' });
      projectSelect = projectField.createEl('select', { cls: 'rh-next-input' });
      for (const project of projects) projectSelect.createEl('option', { text: project.title, value: project.id });
      const moduleField = grid.createDiv({ cls: 'rh-next-field' }); moduleField.createEl('label', { text: '学习模块' });
      moduleSelect = moduleField.createEl('select', { cls: 'rh-next-input' });
      const fillModules = () => {
        moduleSelect.empty();
        for (const item of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: item.title, value: item.id });
        moduleSelect.createEl('option', { text: '＋ 新建模块', value: '__new__' });
      };
      projectSelect.addEventListener('change', fillModules); fillModules();
    } else this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有项目；可以先放入收件箱。' });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '放入收件箱', 'inbox', () => { this.chosen = true; this.options.onChoose?.({ inbox: true, projectId: '', moduleId: '' }); this.close(); });
    if (projects.length) textButton(actions, '加入项目', 'folder-plus', async () => {
      let moduleId = moduleSelect.value;
      if (moduleId === '__new__') {
        const title = await new Promise((resolve) => new TextPromptModal(this.app, '新建学习模块', '模块名称', resolve, { initialValue: this.options.suggestedTitle || '学习材料', onCancel: () => resolve('') }).open());
        if (!safeText(title)) return;
        moduleId = model.createModule(this.plugin.state, projectSelect.value, title).id;
      }
      this.chosen = true;
      this.options.onChoose?.({ inbox: false, projectId: projectSelect.value, moduleId });
      this.close();
    }, 'is-primary');
  }
  onClose() { if (!this.chosen) this.options.onCancel?.(); this.contentEl.empty(); }
}

class LocalFolderImportPreviewModal extends Modal {
  constructor(app, plugin, rootPath, files) { super(app); this.plugin = plugin; this.rootPath = rootPath; this.files = files; this.selected = new Set(files); }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-local-preview-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '本地文件夹导入预览' }); copy.createEl('p', { text: `${this.files.length} 个支持 · ${this.files.ignoredCount || 0} 个忽略 · ${this.files.failures?.length || 0} 个失败 · 确认前不会创建资源` });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-local-preview-list' });
    for (const filePath of this.files.slice(0, 200)) {
      const inferred = model.inferResource(filePath); const row = list.createDiv({ cls: 'rh-next-picker-row' }); const checkbox = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${path.basename(filePath)}` } }); checkbox.checked = true; checkbox.addEventListener('change', () => { checkbox.checked ? this.selected.add(filePath) : this.selected.delete(filePath); }); setIcon(row.createSpan(), kindIcon(inferred.kind));
      const body = row.createDiv(); body.createEl('strong', { text: path.basename(filePath) }); body.createEl('small', { text: path.relative(this.rootPath, filePath) || path.basename(filePath) });
    }
    if (this.files.length > 200) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `仅预览前 200 条；另有 ${this.files.length - 200} 条。` });
    if (this.files.failures?.length) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `${this.files.failures.length} 个目录无权限或读取失败，其他文件仍可导入。` });
    const commit = async (destination) => {
      const chosen = this.files.filter((filePath) => this.selected.has(filePath));
      if (!chosen.length) return new Notice('请至少选择一个文件。');
      const { source } = model.upsertSource(this.plugin.state, { type: 'local-folder', path: this.rootPath, identity: path.resolve(this.rootPath).toLowerCase() });
      const results = chosen.map((filePath) => {
        const inferred = model.inferResource(filePath);
        const descriptor = { ...inferred, sourceId: source.id, metadata: { ...inferred.metadata, rootPath: this.rootPath, localPath: filePath } };
        return destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
      });
      model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: results.map((item) => item.resource.id), inboxAddedResourceIds: results.filter((item) => item.inboxAdded).map((item) => item.resource.id), linkedResourceIds: results.filter((item) => item.linked).map((item) => item.resource.id), createdResourceIds: results.filter((item) => !item.reused).map((item) => item.resource.id), label: `导入本地文件夹：${path.basename(this.rootPath)}` });
      await this.plugin.persist(); new Notice(`已导入 ${results.length} 个本地资源。`); this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    };
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '仅放入收件箱', 'inbox', () => commit({ inbox: true, projectId: '', moduleId: '' }));
    textButton(actions, '加入项目', 'folder-plus', async () => {
      const destination = await new Promise((resolve) => new ImportDestinationModal(this.app, this.plugin, { suggestedTitle: path.basename(this.rootPath), onChoose: resolve, onCancel: () => resolve(null) }).open());
      if (destination) await commit(destination);
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class OpenListImportPreviewModal extends Modal {
  constructor(app, plugin, source, entries, options = {}) { super(app); this.plugin = plugin; this.source = source; this.entries = entries; this.options = options; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-openlist-preview-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '确认导入预览' }); copy.createEl('p', { text: `${this.entries.length} 个文件 · 导入根 ${this.options.rootPath || '/'} · 确认前不会创建任何资源` });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-openlist-preview-list' });
    for (const entry of this.entries.slice(0, 200)) {
      const row = list.createDiv({ cls: 'rh-next-picker-row' });
      const mark = row.createSpan(); setIcon(mark, kindIcon(openListEntryCategory(entry) === 'video' ? 'video' : openListEntryCategory(entry) === 'pdf' ? 'pdf' : 'file'));
      const body = row.createDiv(); body.createEl('strong', { text: entry.name }); body.createEl('small', { text: `${entry.remotePath} · ${formatBytes(entry.size)}` });
    }
    if (this.entries.length > 200) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `预览前 200 条，另有 ${this.entries.length - 200} 条将在确认后导入。` });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '确认保存', 'check', async () => {
      let destination = this.options.destination || null;
      if (!destination) destination = await new Promise((resolve) => new ImportDestinationModal(this.app, this.plugin, { suggestedTitle: this.options.suggestedTitle, onChoose: resolve, onCancel: () => resolve(null) }).open());
      if (!destination) return;
      const results = this.entries.map((entry) => {
        const descriptor = openListDescriptor(this.source, entry, this.options.rootPath);
        return destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
      });
      const resourceIds = results.map((result) => result.resource.id);
      model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds, inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), linkedResourceIds: results.filter((result) => result.linked).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `导入 OpenList：${this.options.suggestedTitle || this.source.label}` });
      await this.plugin.persist();
      new Notice(`已保存 ${results.length} 个 OpenList 资源。`);
      this.options.onSuccess?.();
      this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class OpenListBrowserModal extends Modal {
  constructor(app, plugin, source, rootPath = '/') {
    super(app); this.plugin = plugin; this.source = source; this.rootPath = model.normalizeOpenListPath(rootPath || '/'); this.currentPath = this.rootPath;
    this.cache = new Map(); this.entries = []; this.selected = new Map(); this.categories = new Set(['video']); this.details = null; this.loading = false; this.cancelScan = false; this.renderLimit = 240;
  }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-openlist-browser-modal'); void this.load(this.currentPath); }
  async load(remotePath, refresh = false) {
    this.currentPath = model.normalizeOpenListPath(remotePath || '/'); this.renderLimit = 240; this.loading = true; this.render();
    try {
      const key = `${this.source.id}:${this.currentPath}`;
      if (!refresh && this.cache.has(key)) this.entries = this.cache.get(key);
      else {
        const token = await this.plugin.loginOpenList(this.source);
        const rows = await this.plugin.listOpenList(this.source, this.currentPath, token, refresh);
        this.entries = rows.map((entry) => ({ ...entry, remotePath: model.normalizeOpenListPath(`${this.currentPath}/${entry.name}`) }));
        this.cache.set(key, this.entries);
      }
    } catch (error) { new Notice(`读取目录失败：${error.message || String(error)}`, 6000); this.entries = []; }
    finally { this.loading = false; this.render(); }
  }
  filteredEntries() { return this.entries.filter((entry) => entry.is_dir || this.categories.has(openListEntryCategory(entry))); }
  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.source.label || 'OpenList 浏览' }); copy.createEl('p', { text: '按需读取当前层级；浏览不会写入资源库。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const toolbar = this.contentEl.createDiv({ cls: 'rh-next-openlist-toolbar' });
    const parentCandidate = model.normalizeOpenListPath(this.currentPath.split('/').slice(0, -1).join('/') || '/');
    const atRoot = this.currentPath === this.rootPath;
    const parentPath = atRoot || !parentCandidate.startsWith(this.rootPath === '/' ? '/' : `${this.rootPath}/`) ? this.rootPath : parentCandidate;
    const backButton = iconButton(toolbar, 'arrow-left', '返回上级', () => { if (!atRoot) void this.load(parentPath); }, atRoot ? 'is-disabled' : '');
    backButton.disabled = atRoot;
    const crumbs = toolbar.createDiv({ cls: 'rh-next-openlist-breadcrumbs' });
    textButton(crumbs, this.source.label || '根目录', 'hard-drive', () => void this.load(this.rootPath));
    let built = this.rootPath === '/' ? '' : this.rootPath;
    const relativeSegments = this.currentPath.slice(this.rootPath === '/' ? 0 : this.rootPath.length).split('/').filter(Boolean);
    for (const segment of relativeSegments) { built += `/${segment}`; const target = built; textButton(crumbs, segment, 'chevron-right', () => void this.load(target)); }
    iconButton(toolbar, 'refresh-cw', '刷新当前目录', () => void this.load(this.currentPath, true));
    const filters = this.contentEl.createDiv({ cls: 'rh-next-openlist-filters' });
    for (const [category, label] of Object.entries(OPENLIST_CATEGORY_LABELS)) {
      const option = filters.createEl('label'); const box = option.createEl('input', { type: 'checkbox' }); box.checked = this.categories.has(category);
      option.createSpan({ text: label }); box.addEventListener('change', () => { box.checked ? this.categories.add(category) : this.categories.delete(category); this.render(); });
    }
    const body = this.contentEl.createDiv({ cls: 'rh-next-openlist-browser-body' });
    const list = body.createDiv({ cls: 'rh-next-picker-list rh-next-openlist-list' });
    if (this.loading) list.createEl('p', { cls: 'rh-next-empty-inline', text: '正在读取当前目录…' });
    else if (!this.filteredEntries().length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '当前筛选下没有可见内容。' });
    const filtered = this.filteredEntries();
    for (const entry of filtered.slice(0, this.renderLimit)) {
      const row = list.createDiv({ cls: `rh-next-picker-row ${this.selected.has(entry.remotePath) ? 'is-selected' : ''}` });
      const checkbox = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${entry.name}` } }); checkbox.checked = this.selected.has(entry.remotePath);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => { checkbox.checked ? this.selected.set(entry.remotePath, entry) : this.selected.delete(entry.remotePath); this.render(); });
      const open = row.createEl('button', { cls: 'rh-next-openlist-entry', attr: { type: 'button' } });
      const mark = open.createSpan(); setIcon(mark, entry.is_dir ? 'folder' : kindIcon(openListEntryCategory(entry) === 'video' ? 'video' : openListEntryCategory(entry) === 'pdf' ? 'pdf' : 'file'));
      const entryCopy = open.createDiv(); entryCopy.createEl('strong', { text: entry.name }); entryCopy.createEl('small', { text: entry.is_dir ? '文件夹 · 点击进入' : `${OPENLIST_CATEGORY_LABELS[openListEntryCategory(entry)]} · ${formatBytes(entry.size)}` });
      open.addEventListener('click', () => entry.is_dir ? void this.load(entry.remotePath) : (this.details = entry, this.render()));
      iconButton(row, 'info', `查看 ${entry.name} 详情`, () => { this.details = entry; this.render(); });
    }
    if (filtered.length > this.renderLimit) textButton(list, `继续显示 ${Math.min(240, filtered.length - this.renderLimit)} 项`, 'chevron-down', () => { this.renderLimit += 240; this.render(); });
    const detail = body.createDiv({ cls: 'rh-next-openlist-details' });
    if (this.details) {
      detail.createEl('strong', { text: this.details.name }); detail.createEl('p', { text: this.details.remotePath });
      detail.createEl('small', { text: `${this.details.is_dir ? '文件夹' : OPENLIST_CATEGORY_LABELS[openListEntryCategory(this.details)]} · ${formatBytes(this.details.size)}${this.details.modified ? ` · ${this.details.modified}` : ''}` });
      if (!this.details.is_dir && openListEntryCategory(this.details) === 'video') {
        const previewResource = { title: this.details.name, kind: 'video', sourceId: this.source.id, launcher: { type: 'openlist', sourceId: this.source.id, remotePath: this.details.remotePath }, metadata: { remotePath: this.details.remotePath } };
        textButton(detail, '试播 PotPlayer', 'play', () => this.plugin.openResourceAction(previewResource, 'play', this.plugin.resourceActions(previewResource).playTarget), 'is-primary');
      }
    } else detail.createEl('p', { cls: 'rh-next-empty-inline', text: '选择条目查看路径、类型与大小。' });
    const footer = this.contentEl.createDiv({ cls: 'rh-next-modal-actions rh-next-openlist-footer' });
    footer.createSpan({ text: `已选择 ${this.selected.size} 项` });
    textButton(footer, '取消扫描', 'square', () => { this.cancelScan = true; }, this.cancelScan ? 'is-disabled' : '');
    textButton(footer, '放入收件箱', 'inbox', () => void this.prepareImport({ inbox: true, projectId: '', moduleId: '' }));
    textButton(footer, '加入项目', 'folder-plus', () => void this.prepareImport(null), 'is-primary');
  }
  async prepareImport(destination) {
    if (!this.selected.size) return new Notice('请先勾选文件或文件夹。');
    const selectedEntries = [...this.selected.values()];
    const selectedFolders = selectedEntries.filter((entry) => entry.is_dir);
    const importRootPath = model.openListImportRoot(selectedEntries);
    if (selectedFolders.length) {
      const confirmed = await new Promise((resolve) => new ConfirmActionModal(this.app, {
        title: '递归扫描所选文件夹？',
        message: `将按当前类型筛选递归读取 ${selectedFolders.length} 个文件夹。扫描可取消；完成后仍会先显示预览，不会直接写入资源库。`,
        confirmLabel: '开始扫描',
        onConfirm: () => resolve(true), onCancel: () => resolve(false)
      }).open());
      if (!confirmed) return;
    }
    this.cancelScan = false;
    const files = []; const seen = new Set();
    const add = (entry) => { if (!seen.has(entry.remotePath)) { seen.add(entry.remotePath); files.push(entry); } };
    try {
      for (const entry of selectedEntries) {
        if (!entry.is_dir) { if (this.categories.has(openListEntryCategory(entry))) add(entry); continue; }
        const scanned = await this.plugin.scanOpenList(this.source, entry.remotePath, {
          isCancelled: () => this.cancelScan,
          acceptEntry: (item) => this.categories.has(openListEntryCategory(item)),
          onProgress: ({ directories, found }) => { const footer = this.contentEl.querySelector('.rh-next-openlist-footer > span'); footer?.setText(`扫描 ${directories} 个目录 · 找到 ${found} 个文件`); }
        });
        for (const item of scanned) add(item);
      }
      if (!files.length) throw new Error('所选范围内没有符合当前筛选的文件。');
      const importLabel = importRootPath.split('/').filter(Boolean).pop() || this.source.label;
      new OpenListImportPreviewModal(this.app, this.plugin, this.source, files, {
        destination, rootPath: importRootPath, suggestedTitle: importLabel,
        onSuccess: () => { for (const entry of selectedEntries) this.selected.delete(entry.remotePath); this.details = null; this.render(); }
      }).open();
    } catch (error) { new Notice(error.message || String(error), 6000); }
  }
  onClose() { this.cancelScan = true; this.contentEl.empty(); }
}

class BiliCollectionModal extends Modal {
  constructor(app, plugin, source, collection) { super(app); this.plugin = plugin; this.source = source; this.collection = collection; this.items = []; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-bili-collection-modal');
    this.renderLoading();
    void this.load();
  }
  renderLoading() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.collection.name }); copy.createEl('p', { text: `${this.collection.type === 'season' ? '合集' : '系列'} · ${this.collection.total || 0} 条` });
    this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '正在读取合集内容…' });
  }
  async load() {
    try { this.items = await this.plugin.fetchBiliCollectionItems(this.source, this.collection); this.renderItems(); }
    catch (error) { this.contentEl.createEl('p', { cls: 'rh-next-source-warning', text: `读取失败：${error.message || String(error)}` }); }
  }
  renderItems() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.collection.name }); copy.createEl('p', { text: `${this.items.length} 条视频 · 点击播放直接启动 PotPlayer` });
    textButton(head, '全部加入收件箱', 'inbox', async () => {
      let added = 0; const results = [];
      for (const video of this.items) { const result = model.addInboxResource(this.plugin.state, video.url, video.title); results.push(result); if (!result.reused) added += 1; }
      model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: results.map((result) => result.resource.id), inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `合集加入收件箱：${this.collection.name}` });
      await this.plugin.persist(); new Notice(`已新增 ${added} 条到收件箱。`);
    });
    textButton(head, '整个合集加入项目', 'folder-plus', () => {
      new ImportDestinationModal(this.app, this.plugin, {
        suggestedTitle: this.collection.name,
        onChoose: async (destination) => {
          const results = this.items.map((video) => destination.inbox
            ? model.upsertInboxDescriptor(this.plugin.state, biliVideoDescriptor(video))
            : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, biliVideoDescriptor(video)));
          model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: results.map((result) => result.resource.id), inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), linkedResourceIds: results.filter((result) => result.linked).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `合集加入项目：${this.collection.name}` });
          await this.plugin.persist(); new Notice(`已保存 ${results.length} 条视频。`);
        }
      }).open();
    }, 'is-primary');
    const search = input(this.contentEl, { placeholder: '搜索合集中的视频…' });
    const list = this.contentEl.createDiv({ cls: 'rh-next-bili-collection-list' });
    const draw = () => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const values = this.items.filter((item) => !query || item.title.toLowerCase().includes(query));
      for (const video of values) {
        const row = list.createDiv({ cls: 'rh-next-bili-collection-row' });
        const copy = row.createDiv(); copy.createEl('strong', { text: video.title }); copy.createEl('small', { text: video.bvid });
        const transient = { title: video.title || '未命名视频', kind: 'video', launcher: { type: 'potplayer', target: video.url }, metadata: { originalUrl: video.url, sourceUrl: video.url } };
        const actionHost = row.createDiv({ cls: 'rh-next-resource-actions' });
        const actions = this.plugin.resourceActions(transient);
        if (actions.playTarget) iconButton(actionHost, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(transient, 'play', actions.playTarget), 'is-primary');
        if (actions.webTarget) iconButton(actionHost, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, transient, actions.webTarget));
        iconButton(row, 'inbox', '加入收件箱', async () => {
          const result = model.addInboxResource(this.plugin.state, video.url, video.title);
          model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入收件箱：${video.title}` });
          await this.plugin.persist(); new Notice(result.reused ? '收件箱中已有这条视频。' : '已加入收件箱。');
        });
        iconButton(row, 'folder-plus', '加入项目', () => new ImportDestinationModal(this.app, this.plugin, {
          suggestedTitle: video.title,
          onChoose: async (destination) => {
            const result = destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, biliVideoDescriptor(video)) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, biliVideoDescriptor(video));
            model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], linkedResourceIds: result.linked ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入项目：${video.title}` });
            await this.plugin.persist(); new Notice(destination.inbox ? '已加入收件箱。' : '已加入项目。');
          }
        }).open());
      }
      if (!values.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有匹配的视频。' });
    };
    search.addEventListener('input', draw); draw();
  }
}

class ResourceSearchModal extends Modal {
  constructor(app, plugin, resources) { super(app); this.plugin = plugin; this.resources = resources; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-search-modal'); this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '搜索全部资源' });
    const search = input(this.contentEl, { placeholder: '输入标题或类型……' });
    const scope = this.contentEl.createDiv({ cls: 'rh-next-search-scope' });
    const projectSelect = scope.createEl('select', { cls: 'rh-next-input' });
    projectSelect.createEl('option', { text: '全部项目', value: '' });
    for (const project of model.activeProjects(this.plugin.state)) projectSelect.createEl('option', { text: project.title, value: project.id });
    const moduleSelect = scope.createEl('select', { cls: 'rh-next-input' });
    const fillModules = () => {
      moduleSelect.empty(); moduleSelect.createEl('option', { text: projectSelect.value ? '项目内全部模块' : '选择项目后可管理分组', value: '' });
      if (projectSelect.value) for (const module of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: module.title, value: module.id });
    };
    projectSelect.addEventListener('change', () => { fillModules(); paint(); }); fillModules();
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      const projectModuleIds = projectSelect.value ? new Set(model.projectModules(this.plugin.state, projectSelect.value).map((module) => module.id)) : null;
      const scopedIds = moduleSelect.value
        ? new Set(this.plugin.state.modules[moduleSelect.value]?.resourceIds || [])
        : projectModuleIds ? new Set([...projectModuleIds].flatMap((moduleId) => this.plugin.state.modules[moduleId]?.resourceIds || [])) : null;
      for (const resource of this.resources.filter((item) => (!scopedIds || scopedIds.has(item.id)) && (!query || `${item.title} ${item.kind}`.toLowerCase().includes(query))).slice(0, 100)) {
        const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, kindIcon(resource.kind));
        const text = row.createDiv(); text.createEl('strong', { text: resource.title });
        const memberships = Object.values(this.plugin.state.modules).filter((module) => (module.resourceIds || []).includes(resource.id));
        text.createEl('small', { text: `${kindLabel(resource.kind)}${memberships.length ? ` · ${memberships.map((module) => module.title).slice(0, 2).join('、')}` : ' · 未加入模块'}` });
        const host = row.createDiv({ cls: 'rh-next-resource-actions' });
        const actions = this.plugin.resourceActions(resource);
        if (actions.playTarget) iconButton(host, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(resource, 'play', actions.playTarget), 'is-primary');
        if (actions.webTarget) iconButton(host, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, resource, actions.webTarget));
        if (actions.defaultTarget) iconButton(host, actions.defaultTarget.type === 'anki' ? 'layers-3' : 'external-link', '打开资源', () => this.plugin.openResourceAction(resource, 'default', actions.defaultTarget), 'is-primary');
        if (moduleSelect.value) iconButton(host, 'folder-input', '管理当前模块分组', (event) => {
          const groups = model.moduleResourceGroups(this.plugin.state, moduleSelect.value);
          const current = groups.find((group) => (group.resourceIds || []).includes(resource.id));
          const menu = new Menu();
          if (current) menu.addItem((item) => item.setTitle('移出分组').setIcon('folder-minus').onClick(async () => { await this.plugin.mutate((state) => model.moveResourceToGroup(state, moduleSelect.value, resource.id, '')); paint(); }));
          for (const group of groups.filter((candidate) => candidate.id !== current?.id)) menu.addItem((item) => item.setTitle(`移到：${group.title}`).setIcon('folder-input').onClick(async () => { await this.plugin.mutate((state) => model.moveResourceToGroup(state, moduleSelect.value, resource.id, group.id)); paint(); }));
          menu.addItem((item) => item.setTitle('新建分组并移入').setIcon('folder-plus').onClick(() => new TextPromptModal(this.app, '新建资源分组', '分组名称', async (value) => {
            await this.plugin.mutate((state) => { const group = model.createResourceGroup(state, moduleSelect.value, value); model.moveResourceToGroup(state, moduleSelect.value, resource.id, group.id); }); paint();
          }, { initialValue: '新分组' }).open()));
          menu.showAtMouseEvent(event);
        });
      }
    };
    let timer = null;
    search.addEventListener('input', () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(paint, 120); });
    moduleSelect.addEventListener('change', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class ArchivedModulesModal extends Modal {
  constructor(app, plugin, projectId) { super(app); this.plugin = plugin; this.projectId = projectId; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-archive-modal'); this.render(); }
  onClose() { this.contentEl.empty(); }
  render() {
    this.contentEl.empty();
    const project = this.plugin.state.projects[this.projectId];
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '已归档模块' }); copy.createEl('p', { text: project ? `${project.title} · 归档保留资源关联与历史，可随时恢复。` : '项目已不存在。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-archive-list' });
    const modules = Object.values(this.plugin.state.modules)
      .filter((module) => module.projectId === this.projectId && module.archivedAt && !module.deletedAt)
      .sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)));
    if (!modules.length) { list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有归档模块。' }); return; }
    for (const module of modules) {
      const resourceCount = (module.resourceIds || []).filter((resourceId) => this.plugin.state.resources[resourceId]).length;
      const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, 'blocks');
      const text = row.createDiv(); text.createEl('strong', { text: module.title }); text.createEl('small', { text: `${resourceCount} 条资源关联 · 已归档` });
      textButton(row, '恢复', 'archive-restore', async () => {
        await this.plugin.mutate((state) => model.restoreModule(state, module.id), { render: false });
        this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
      }, 'is-primary');
      textButton(row, '永久删除', 'trash-2', () => this.plugin.workbenchLeaf?.view?.confirmDeleteModule(module, async () => this.render()), 'is-danger');
    }
  }
}

class ArchiveModal extends Modal {
  constructor(app, plugin, mode = 'archive') { super(app); this.plugin = plugin; this.mode = mode; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-archive-modal'); this.render(); }
  onClose() { this.contentEl.empty(); }
  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '归档与恢复' }); copy.createEl('p', { text: '归档项目可恢复；回收站用于误删资源；旧链接只按需选择导入。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const tabs = this.contentEl.createDiv({ cls: 'rh-next-add-modes' });
    for (const [mode, title, icon] of [['archive', '归档项目', 'archive'], ['trash', '资源回收站', 'trash-2'], ['legacy', '旧资源清单', 'file-input']]) textButton(tabs, title, icon, () => { this.mode = mode; this.render(); }, this.mode === mode ? 'is-active' : '');
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-archive-list' });
    if (this.mode === 'legacy') {
      const empty = list.createDiv({ cls: 'rh-next-empty' }); const icon = empty.createDiv(); setIcon(icon, 'file-input');
      empty.createEl('strong', { text: '从只读清单按需重新添加' });
      empty.createEl('p', { text: '不会迁移旧内部结构、旧完成记录或旧 Markdown 块。' });
      textButton(empty, '选择清单文件', 'folder-open', () => new LegacyImportModal(this.app, this.plugin).open(), 'is-primary');
      return;
    }
    const entries = this.mode === 'archive'
      ? Object.values(this.plugin.state.projects).filter((item) => item.archivedAt && !item.deletedAt)
      : Object.values(this.plugin.state.resources).filter((item) => item.deletedAt);
    if (!entries.length) { list.createEl('p', { cls: 'rh-next-empty-inline', text: this.mode === 'archive' ? '没有归档项目。' : '回收站是空的。' }); return; }
    for (const entry of entries) {
      const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, this.mode === 'archive' ? 'folder-archive' : kindIcon(entry.kind));
      const text = row.createDiv(); text.createEl('strong', { text: entry.title }); text.createEl('small', { text: this.mode === 'archive' ? '已归档项目' : `${kindLabel(entry.kind)} · 已移到回收站` });
      textButton(row, '恢复', 'archive-restore', async () => {
        await this.plugin.mutate((state) => this.mode === 'archive' ? model.restoreProject(state, entry.id) : model.restoreResource(state, entry.id), { render: false });
        this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
      }, 'is-primary');
      if (this.mode === 'archive') {
        textButton(row, '永久删除', 'trash-2', () => new ConfirmActionModal(this.app, {
          title: `永久删除“${entry.title}”？`,
          message: '项目、学习模块和相关计划会被删除；可以同时清理删除后不再被引用的资源索引。',
          checkboxLabel: '同时删除仅属于此项目的孤立资源',
          checkboxDefault: true,
          confirmLabel: '永久删除',
          onConfirm: async ({ checked }) => {
            const result = await this.plugin.mutate((state) => model.deleteProject(state, entry.id, { deleteOrphans: checked }), { render: false });
            if (result.removedResourceIds.length) new Notice(`已同步清理 ${result.removedResourceIds.length} 条孤立资源。`);
            this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
          }
        }).open(), 'is-danger');
      }
    }
  }
}

class LegacyImportModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.entries = []; this.selected = new Set(); }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-legacy-modal'); this.render(); void this.pickFile(); }
  onClose() { this.contentEl.empty(); }

  async pickFile() {
    const defaultPath = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Documents', '惯性', 'ResourceHubPlugin', '现有资源链接清单.md') : '';
    let filePath = fs.existsSync(defaultPath) ? defaultPath : '';
    if (!filePath) {
      const result = await dialog?.showOpenDialog?.({ title: '选择现有资源链接清单', properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md'] }] });
      filePath = result?.canceled ? '' : result?.filePaths?.[0] || '';
    }
    if (!filePath) return;
    try {
      this.entries = this.parseReport(fs.readFileSync(filePath, 'utf8'));
      this.filePath = filePath; this.render();
    } catch (error) { new Notice(`清单读取失败：${error.message || String(error)}`, 6000); }
  }

  parseReport(markdown) {
    const results = [];
    const seen = new Set();
    for (const line of markdown.split(/\r?\n/)) {
      if (!line.startsWith('| ') || line.startsWith('|---') || line.includes('| 标题 |')) continue;
      const cells = line.slice(1, -1).split(' | ').map((cell) => cell.trim());
      if (cells.length < 3) continue;
      const title = cells[0].replace(/^`|`$/g, '').replace(/\\\|/g, '|').trim();
      const openListKeyCell = cells.find((cell) => /^`openlist:/i.test(cell));
      const remoteCell = cells.find((cell) => /^`\/.*`$/.test(cell));
      const linkCell = cells.find((cell) => /^<[^>]+>$/.test(cell));
      const localCell = cells.find((cell) => /^`[a-zA-Z]:\\.*`$/.test(cell));
      let entry = null;
      if (openListKeyCell && remoteCell) {
        const remotePath = remoteCell.slice(1, -1);
        entry = { type: 'openlist', title, value: remotePath, canonicalKey: openListKeyCell.slice(1, -1) };
      } else if (linkCell) {
        const value = linkCell.slice(1, -1);
        if (/^obsidian:\/\/learning-resource-hub/i.test(value)) {
          try {
            const deck = new URL(value).searchParams.get('deck');
            if (deck) entry = { type: 'anki', title, value: deck, canonicalKey: `anki:${deck.toLowerCase()}` };
          } catch { /* skip malformed legacy URI */ }
        } else if (/^https?:\/\//i.test(value)) entry = { type: 'link', title, value };
      } else if (localCell) entry = { type: 'file', title, value: localCell.slice(1, -1) };
      if (!entry) continue;
      const identity = entry.canonicalKey || `${entry.type}:${entry.value.toLowerCase()}`;
      if (seen.has(identity)) continue;
      seen.add(identity); results.push({ ...entry, id: identity });
    }
    return results;
  }

  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '选择旧资源' }); copy.createEl('p', { text: this.entries.length ? `已读取 ${this.entries.length} 条可重新添加的稳定链接；默认不选。` : '正在读取只读清单……' });
    iconButton(head, 'x', '关闭', () => this.close());
    if (!this.entries.length) return;
    const search = input(this.contentEl, { placeholder: '搜索标题、类型或路径……' });
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      const visible = this.entries.filter((entry) => !query || `${entry.title} ${entry.type} ${entry.value}`.toLowerCase().includes(query)).slice(0, 300);
      for (const entry of visible) {
        const row = list.createDiv({ cls: `rh-next-picker-row ${this.selected.has(entry.id) ? 'is-selected' : ''}` }); const mark = row.createSpan(); setIcon(mark, this.selected.has(entry.id) ? 'circle-check-big' : entry.type === 'anki' ? 'layers-3' : entry.type === 'openlist' ? 'cloud' : entry.type === 'file' ? 'file' : 'link');
        const text = row.createDiv(); text.createEl('strong', { text: entry.title }); text.createEl('small', { text: entry.type === 'openlist' ? `OpenList · ${entry.value}` : entry.type });
        row.addEventListener('click', () => { this.selected.has(entry.id) ? this.selected.delete(entry.id) : this.selected.add(entry.id); paint(); });
      }
    };
    search.addEventListener('input', paint); paint();
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, `加入收件箱（${this.selected.size}）`, 'inbox', async () => {
      if (!this.selected.size) return new Notice('请先选择要重新添加的资源。');
      for (const entry of this.entries.filter((item) => this.selected.has(item.id))) {
        if (entry.type === 'openlist') model.upsertInboxDescriptor(this.plugin.state, { kind: 'video', title: entry.title, canonicalKey: entry.canonicalKey, sourceId: '', launcher: { type: 'openlist', sourceId: '', remotePath: entry.value }, metadata: { remotePath: entry.value, importedFromLegacy: true } });
        else if (entry.type === 'anki') model.upsertInboxDescriptor(this.plugin.state, { kind: 'anki', title: entry.title, canonicalKey: entry.canonicalKey, sourceId: '', launcher: { type: 'anki', deck: entry.value }, metadata: { deck: entry.value, importedFromLegacy: true } });
        else model.addInboxResource(this.plugin.state, entry.value, entry.title);
      }
      await this.plugin.persist(); new Notice(`已把 ${this.selected.size} 条旧资源加入收件箱。`); this.close(); await this.plugin.workbenchLeaf?.view?.render?.();
    }, 'is-primary');
  }
}

module.exports = ResourceHubNextPlugin;

},
"media-session.cjs": (module, exports, require) => {
'use strict';

const { openListLocatorFromResource } = __rhLoad("resource-locator.cjs");
const { freeformLocatorName, normalizePortableMediaName } = __rhLoad("resource-reference.cjs");

function normalizeLocalMediaPath(value) {
  return String(value || '')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLocaleLowerCase();
}

function tryUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function comparableWebUrl(value) {
  const url = tryUrl(value);
  if (!url) return null;
  const host = url.hostname.toLocaleLowerCase();
  const pathname = decodeURIComponent(url.pathname || '/').replace(/\/+$/, '') || '/';
  if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) {
    return `bili:${host}:${pathname.toLocaleLowerCase()}:p${url.searchParams.get('p') || '1'}`;
  }
  return `${url.protocol}//${url.host.toLocaleLowerCase()}${pathname}`;
}

function openListMediaMatches(state, resource, mediaPath) {
  const locator = openListLocatorFromResource(resource);
  if (!locator) return false;
  const source = state?.sources?.[locator.sourceId];
  if (!source || source.deletedAt || source.type !== 'openlist' || !source.baseUrl) return false;
  const base = String(source.baseUrl).replace(/\/+$/, '');
  const encoded = locator.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  const expected = tryUrl(`${base}/d${encoded}`);
  const current = tryUrl(mediaPath);
  if (!expected || !current) return false;
  return expected.origin.toLocaleLowerCase() === current.origin.toLocaleLowerCase()
    && decodeURIComponent(expected.pathname).toLocaleLowerCase() === decodeURIComponent(current.pathname).toLocaleLowerCase();
}

function targetMatchesBridgeMedia(state, resource, target, mediaPath) {
  if (!target || !mediaPath) return false;
  if (target.type === 'openlist') return openListMediaMatches(state, resource, mediaPath);
  const expected = target.type === 'potplayer' ? target.target : target.type === 'uri' ? target.uri : '';
  if (!expected) return false;
  const expectedUrl = comparableWebUrl(expected);
  const currentUrl = comparableWebUrl(mediaPath);
  if (expectedUrl || currentUrl) return Boolean(expectedUrl && currentUrl && expectedUrl === currentUrl);
  return normalizeLocalMediaPath(expected) === normalizeLocalMediaPath(mediaPath);
}

function playTargetPortableName(target) {
  if (!target) return '';
  const raw = target.type === 'openlist'
    ? target.remotePath
    : target.type === 'potplayer'
      ? target.target
      : target.type === 'uri'
        ? target.uri
        : '';
  if (!raw) return '';
  try { return freeformLocatorName(raw); } catch { return ''; }
}

function matchingManagedResourceByPortableName(state, mediaName, resolveActions) {
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const expected = normalizePortableMediaName(mediaName).toLocaleLowerCase();
  const matches = Object.values(state?.resources || {})
    .filter((resource) => resource && !resource.deletedAt)
    .filter((resource) => {
      try {
        const actions = resolveActions(resource) || {};
        const name = playTargetPortableName(actions.playTarget);
        return Boolean(name && name.toLocaleLowerCase() === expected);
      } catch { return false; }
    });
  return matches.length === 1 ? matches[0] : null;
}

function validatedBridgePosition(bridgeMedia) {
  if (!bridgeMedia?.path) throw new Error('PotPlayer 当前媒体无法识别。');
  const seconds = Number(bridgeMedia.positionSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('PotPlayer 当前播放位置无效。');
  return { type: 'time', seconds };
}

function matchingManagedResource(state, mediaPath, resolveActions, preferredResourceId = '') {
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const resources = Object.values(state?.resources || {}).filter((resource) => resource && !resource.deletedAt);
  const matches = (resource) => {
    try {
      const actions = resolveActions(resource) || {};
      return Boolean(actions.playTarget && targetMatchesBridgeMedia(state, resource, actions.playTarget, mediaPath));
    } catch {
      return false;
    }
  };
  if (preferredResourceId) {
    const preferred = state?.resources?.[preferredResourceId];
    if (preferred && !preferred.deletedAt && matches(preferred)) return preferred;
  }
  return resources.find((resource) => resource.id !== preferredResourceId && matches(resource)) || null;
}

function resolveUniversalMediaSession(state, activeSession, bridgeMedia, resolveActions, options = {}) {
  const position = validatedBridgePosition(bridgeMedia);
  const preferredResourceId = String(activeSession?.resourceId || '');
  const resource = matchingManagedResource(state, bridgeMedia.path, resolveActions, preferredResourceId);
  if (resource) {
    return {
      mode: 'managed',
      resource,
      position,
      bridgeMedia
    };
  }
  if (options.allowFreeform === false) {
    throw new Error('PotPlayer 当前媒体没有匹配到 Go Study 资源；请先从 Go Study 启动或收录该视频。');
  }
  return {
    mode: 'freeform',
    resource: null,
    position,
    bridgeMedia,
    freeform: {
      path: String(bridgeMedia.path || '').trim(),
      title: String(bridgeMedia.title || '').replace(/\s+-\s+PotPlayer\s*$/i, '').trim()
    }
  };
}

function resolveActiveMediaSession(state, activeSession, bridgeMedia, resolveActions) {
  const resourceId = String(activeSession?.resourceId || '');
  const resource = state?.resources?.[resourceId];
  if (!resource || resource.deletedAt) throw new Error('当前没有有效的 Go Study 学习会话，请先从 Go Study 启动资源。');
  const position = validatedBridgePosition(bridgeMedia);
  if (typeof resolveActions !== 'function') throw new Error('资源启动解析器不可用。');
  const actions = resolveActions(resource) || {};
  if (!actions.playTarget) throw new Error('当前学习资源没有可验证的视频播放目标。');
  if (!targetMatchesBridgeMedia(state, resource, actions.playTarget, bridgeMedia.path)) {
    throw new Error('PotPlayer 当前媒体与 Go Study 最近启动的资源不一致；为避免把笔记记到错误课程，已停止插入。');
  }
  return { resource, position, bridgeMedia };
}

module.exports = {
  comparableWebUrl,
  normalizeLocalMediaPath,
  openListMediaMatches,
  playTargetPortableName,
  matchingManagedResource,
  matchingManagedResourceByPortableName,
  resolveActiveMediaSession,
  resolveUniversalMediaSession,
  targetMatchesBridgeMedia,
  validatedBridgePosition,
  tryUrl
};

},
"model.cjs": (module, exports, require) => {
'use strict';

const SCHEMA_VERSION = 1;
const PROJECT_PANEL_IDS = ['tasks', 'files', 'memo'];
const TODAY_SIDEBAR_CARD_IDS = ['current', 'progress', 'inbox', 'memo'];
const PROJECT_BOARD_VERSION = 1;
const PROJECT_BOARD_COLUMNS = 4;
const PROJECT_BOARD_UTILITY_IDS = ['files', 'tasks'];
const VAULT_FILE_KINDS = ['markdown', 'canvas', 'base', 'pdf', 'image', 'plugin-file', 'other'];

function createId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: {},
    vaultRefs: {},
    modules: {},
    resourceGroups: {},
    resources: {},
    plans: {},
    sources: {},
    notes: {},
    activity: [],
    inbox: [],
    uiState: {
      route: 'today',
      currentProjectId: '',
      collapsedTodayProjects: {},
      todayProjectOrder: [],
      todaySidebarOrder: TODAY_SIDEBAR_CARD_IDS.slice(),
      showInterfaceTips: true,
      collapsedProjectPlans: {},
      scrollPositions: {},
      currentResourceModuleId: '',
      selectedBiliSourceId: '',
      webOpenPreference: '',
      projectPanelOrder: PROJECT_PANEL_IDS.slice(),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: {},
      projectRecentCollapsedByProject: {},
      collapsedResourceGroupsByModule: {},
      recentVaultCreatePaths: [],
      pinnedVaultCreatePaths: [],
      lastAction: null
    }
  };
}

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string'))];
}

function normalizeProjectPanelOrder(value) {
  const allowed = uniqueStrings(value).filter((panelId) => PROJECT_PANEL_IDS.includes(panelId));
  return [...allowed, ...PROJECT_PANEL_IDS.filter((panelId) => !allowed.includes(panelId))];
}

function normalizeTodaySidebarOrder(value) {
  const allowed = uniqueStrings(value).filter((cardId) => TODAY_SIDEBAR_CARD_IDS.includes(cardId));
  return [...allowed, ...TODAY_SIDEBAR_CARD_IDS.filter((cardId) => !allowed.includes(cardId))];
}

function normalizeTodayProjectOrder(value, projects) {
  const projectIds = (Array.isArray(projects) ? projects : []).map((project) => project.id);
  const saved = uniqueStrings(value).filter((projectId) => projectIds.includes(projectId));
  return [...saved, ...projectIds.filter((projectId) => !saved.includes(projectId))];
}

function moveRelative(order, sourceId, targetId, after = false) {
  const next = uniqueStrings(order);
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return next;
  next.splice(sourceIndex, 1);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
  return next;
}

function projectBoardModuleKeys(state, projectId, includeArchived = true) {
  return Object.values(objectOr(state.modules))
    .filter((module) => module.projectId === projectId && !module.deletedAt && (includeArchived || !module.archivedAt))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      || String(left.id).localeCompare(String(right.id)))
    .map((module) => `module:${module.id}`);
}

function projectBoardUtilityKeys(panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const order = normalizeProjectPanelOrder(panelOrder).filter((panelId) => PROJECT_BOARD_UTILITY_IDS.includes(panelId));
  return order.map((panelId) => `utility:${panelId}`);
}

function projectBoardMemoKeys(state, projectId) {
  return normalizeProjectMemos(state.projects?.[projectId]?.memos, projectId).map((memo) => `memo:${memo.id}`);
}

function cloneProjectBoardLayout(layout) {
  return {
    version: PROJECT_BOARD_VERSION,
    items: Object.fromEntries(Object.entries(objectOr(layout?.items)).map(([key, anchor]) => [key, {
      column: anchor.column,
      row: anchor.row,
      ...(key.startsWith('memo:') ? { side: anchor.side === 'right' ? 'right' : 'left' } : {})
    }]))
  };
}

function validProjectBoardAnchor(anchor) {
  return Number.isInteger(anchor?.column) && anchor.column >= 1 && anchor.column <= PROJECT_BOARD_COLUMNS
    && Number.isInteger(anchor?.row) && anchor.row >= 1;
}

function projectBoardMemoSide(value) {
  return value === 'right' ? 'right' : 'left';
}

function projectBoardCellOccupants(items, column, row, excludedKey = '') {
  return Object.entries(objectOr(items)).filter(([key, anchor]) => key !== excludedKey
    && validProjectBoardAnchor(anchor) && anchor.column === column && anchor.row === row);
}

function firstAvailableProjectBoardMemoAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      const occupants = projectBoardCellOccupants(items, column, row);
      if (occupants.some(([key]) => !key.startsWith('memo:'))) continue;
      for (const side of ['left', 'right']) {
        if (!occupants.some(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === side)) {
          return { column, row, side };
        }
      }
    }
  }
}

function firstAvailableProjectBoardAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      if (!projectBoardCellOccupants(items, column, row).length) return { column, row };
    }
  }
}

function defaultProjectBoardLayout(state, projectId, panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const items = {};
  projectBoardModuleKeys(state, projectId).forEach((key, index) => {
    items[key] = { column: (index % 3) + 1, row: Math.floor(index / 3) + 1 };
  });
  projectBoardUtilityKeys(panelOrder).forEach((key, index) => {
    items[key] = { column: PROJECT_BOARD_COLUMNS, row: index + 1 };
  });
  projectBoardMemoKeys(state, projectId).forEach((key, index) => {
    items[key] = {
      column: PROJECT_BOARD_COLUMNS,
      row: projectBoardUtilityKeys(panelOrder).length + Math.floor(index / 2) + 1,
      side: index % 2 ? 'right' : 'left'
    };
  });
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayout(rawLayout, state, projectId, panelOrder) {
  const rawItems = objectOr(rawLayout?.items);
  const memoKeys = projectBoardMemoKeys(state, projectId);
  const legacyMemoAnchor = validProjectBoardAnchor(rawItems['utility:memo']) ? rawItems['utility:memo'] : null;
  const allowedKeys = [...projectBoardModuleKeys(state, projectId), ...projectBoardUtilityKeys(), ...memoKeys];
  const fullKeys = allowedKeys.filter((key) => !key.startsWith('memo:'));
  const items = {};
  for (const key of fullKeys) {
    const anchor = rawItems[key];
    if (!validProjectBoardAnchor(anchor) || projectBoardCellOccupants(items, anchor.column, anchor.row).length) continue;
    items[key] = { column: anchor.column, row: anchor.row };
  }
  const legacyByColumn = new Map();
  for (const key of memoKeys) {
    const rawAnchor = rawItems[key] || (key === memoKeys[0] ? legacyMemoAnchor : null);
    if (!validProjectBoardAnchor(rawAnchor)) continue;
    let anchor = { column: rawAnchor.column, row: rawAnchor.row, side: projectBoardMemoSide(rawAnchor.side) };
    if (!rawAnchor.side) {
      const previous = legacyByColumn.get(anchor.column);
      if (previous && anchor.row === previous.originalRow + 1) {
        anchor = {
          column: previous.column,
          row: previous.baseRow + Math.floor(previous.count / 2),
          side: previous.count % 2 ? 'right' : 'left'
        };
        previous.originalRow = rawAnchor.row;
        previous.count += 1;
      } else {
        legacyByColumn.set(anchor.column, { column: anchor.column, baseRow: anchor.row, originalRow: rawAnchor.row, count: 1 });
      }
    }
    const occupants = projectBoardCellOccupants(items, anchor.column, anchor.row);
    if (occupants.some(([candidateKey]) => !candidateKey.startsWith('memo:'))
      || occupants.some(([candidateKey, candidateAnchor]) => candidateKey.startsWith('memo:') && projectBoardMemoSide(candidateAnchor.side) === anchor.side)) continue;
    items[key] = anchor;
  }
  if (!Object.keys(items).length) return defaultProjectBoardLayout(state, projectId, panelOrder);
  for (const key of fullKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardAnchor(items);
  }
  for (const key of memoKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardMemoAnchor(items);
  }
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayouts(value, state, panelOrder) {
  const rawLayouts = objectOr(value);
  return Object.fromEntries(Object.keys(state.projects).map((projectId) => [
    projectId,
    normalizeProjectBoardLayout(rawLayouts[projectId], state, projectId, panelOrder)
  ]));
}

function normalizeVaultPath(rawPath) {
  const parts = String(rawPath || '').trim().replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('Vault 路径不能包含 ..。');
  return parts.join('/').normalize('NFC');
}

function normalizeVaultPathList(value) {
  const normalized = [];
  for (const rawPath of Array.isArray(value) ? value : []) {
    try {
      const path = normalizeVaultPath(rawPath);
      if (!normalized.includes(path)) normalized.push(path);
    } catch { /* 忽略旧状态中的非法路径。 */ }
  }
  return normalized;
}

function normalizeVaultFileKind(value) {
  const fileKind = String(value || 'other');
  return VAULT_FILE_KINDS.includes(fileKind) ? fileKind : 'other';
}

function normalizeVaultRefs(value) {
  const normalized = {};
  for (const [id, rawVaultRef] of Object.entries(objectOr(value))) {
    const vaultRef = objectOr(rawVaultRef);
    try {
      const path = normalizeVaultPath(vaultRef.path);
      if (!path) continue;
      normalized[id] = {
        ...vaultRef,
        id,
        path,
        entryType: vaultRef.entryType === 'folder' ? 'folder' : 'file',
        fileKind: normalizeVaultFileKind(vaultRef.fileKind),
        missingAt: String(vaultRef.missingAt || '')
      };
    } catch { /* 忽略旧状态中的非法引用。 */ }
  }
  return normalized;
}

function normalizeProjectMemos(value, projectId = 'project') {
  const normalized = [];
  const usedIds = new Set();
  const rawMemos = Array.isArray(value) ? value : [];
  rawMemos.forEach((rawMemo, index) => {
    const source = typeof rawMemo === 'string' ? { text: rawMemo } : objectOr(rawMemo);
    const baseId = String(source.id || '').trim() || `memo-${projectId}-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    const text = String(source.text ?? source.memoText ?? source.content ?? '');
    const createdAt = String(source.createdAt ?? source.updatedAt ?? source.memoUpdatedAt ?? '');
    const updatedAt = String(source.updatedAt ?? source.memoUpdatedAt ?? source.createdAt ?? '');
    normalized.push({ ...source, id, title: String(source.title || '').trim(), text, createdAt, updatedAt });
    usedIds.add(id);
  });
  return normalized;
}

function normalizeProjectRecentCollapsedByProject(value, projects) {
  const input = objectOr(value);
  const normalized = {};
  for (const [projectId, collapsed] of Object.entries(input)) {
    if (!projects[projectId]) continue;
    normalized[projectId] = Boolean(collapsed);
  }
  return normalized;
}

function normalizeModules(value, resources) {
  return Object.fromEntries(Object.entries(objectOr(value)).map(([id, rawModule]) => {
    const module = objectOr(rawModule);
    const resourceIds = uniqueStrings(module.resourceIds).filter((resourceId) => resources[resourceId]);
    const resourceRoots = {};
    for (const [resourceId, rootPath] of Object.entries(objectOr(module.resourceRoots))) {
      if (!resourceIds.includes(resourceId) || (!resourceOpenListPath(resources[resourceId]) && !resourceLocalPath(resources[resourceId]))) continue;
      resourceRoots[resourceId] = normalizeResourceRoot(resources[resourceId], rootPath);
    }
    return [id, { ...module, id, resourceIds, resourceRoots, resourceGroupIds: uniqueStrings(module.resourceGroupIds) }];
  }));
}

function normalizeResourceGroups(value, modules, resources) {
  const normalized = {};
  const candidateResourceIds = new Map();
  for (const [id, rawGroup] of Object.entries(objectOr(value))) {
    const group = objectOr(rawGroup);
    const module = modules[group.moduleId];
    const title = String(group.title || '').trim();
    if (!module || !title) continue;
    candidateResourceIds.set(id, uniqueStrings(group.resourceIds));
    normalized[id] = {
      ...group,
      id,
      moduleId: module.id,
      title,
      scopePath: normalizeResourceGroupScopePath(group.scopePath || String(group.autoGroupKey || '').split(':folder:').slice(1).join(':folder:')),
      resourceIds: [],
      sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 0
    };
  }
  for (const module of Object.values(modules)) {
    const listed = uniqueStrings(module.resourceGroupIds).filter((groupId) => normalized[groupId]?.moduleId === module.id);
    const remaining = Object.values(normalized)
      .filter((group) => group.moduleId === module.id && !listed.includes(group.id))
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
      .map((group) => group.id);
    module.resourceGroupIds = [...listed, ...remaining];
    const assigned = new Set();
    module.resourceGroupIds.forEach((groupId, index) => {
      const group = normalized[groupId];
      group.sortOrder = index;
      group.resourceIds = (candidateResourceIds.get(groupId) || []).filter((resourceId) => {
        if (!resources[resourceId] || !module.resourceIds.includes(resourceId) || assigned.has(resourceId)) return false;
        assigned.add(resourceId);
        return true;
      });
    });
  }
  return normalized;
}

function normalizeResourceGroupScopePath(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

function normalizeCollapsedResourceGroups(value, modules, resourceGroups) {
  const normalized = {};
  for (const [moduleId, rawGroups] of Object.entries(objectOr(value))) {
    if (!modules[moduleId]) continue;
    const groups = {};
    for (const [groupId, collapsed] of Object.entries(objectOr(rawGroups))) {
      if (resourceGroups[groupId]?.moduleId === moduleId) groups[groupId] = Boolean(collapsed);
    }
    if (Object.keys(groups).length) normalized[moduleId] = groups;
  }
  return normalized;
}

function normalizeProjectMemoFields(project, projectId) {
  const legacyText = String(project.memoText ?? '');
  const legacyUpdatedAt = String(project.memoUpdatedAt ?? '');
  const memos = normalizeProjectMemos(project.memos, projectId);
  if (legacyText.length > 0) {
    const existing = memos.find((memo) => memo.text === legacyText);
    if (!existing) {
      const blankDefault = memos.length === 1 && !memos[0].text;
      if (blankDefault) {
        memos[0] = {
          ...memos[0],
          title: String(memos[0].title || '').trim(),
          text: legacyText,
          createdAt: memos[0].createdAt || legacyUpdatedAt,
          updatedAt: legacyUpdatedAt
        };
      } else {
        const baseId = `memo-${projectId}-legacy`;
        const usedIds = new Set(memos.map((memo) => memo.id));
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        memos.push({ id, title: '', text: legacyText, createdAt: legacyUpdatedAt, updatedAt: legacyUpdatedAt });
      }
    }
  }
  const firstMemo = memos[0];
  const memoText = legacyText || String(firstMemo?.text || '');
  const memoUpdatedAt = legacyUpdatedAt || String(firstMemo?.updatedAt || '');
  return { memos, memoText, memoUpdatedAt };
}

function normalizeState(raw) {
  const base = defaultState();
  const input = objectOr(raw);
  const inputSchemaVersion = Number(input.schemaVersion || 0);
  if (Number.isFinite(inputSchemaVersion) && inputSchemaVersion > SCHEMA_VERSION) {
    throw new Error(`数据版本 ${inputSchemaVersion} 高于当前支持的 ${SCHEMA_VERSION}，已停止加载以避免覆盖较新数据。`);
  }
  const inputProjects = objectOr(input.projects);
  const vaultRefs = normalizeVaultRefs(input.vaultRefs);
  const projects = Object.fromEntries(Object.entries(inputProjects).map(([id, rawProject]) => {
    const project = objectOr(rawProject);
    const memoFields = normalizeProjectMemoFields(project, id);
    const vaultRefIds = uniqueStrings(project.vaultRefIds).filter((vaultRefId) => vaultRefs[vaultRefId]);
    return [id, {
      ...project,
      vaultRefIds,
      pinnedVaultRefIds: uniqueStrings(project.pinnedVaultRefIds).filter((vaultRefId) => vaultRefIds.includes(vaultRefId)),
      memos: memoFields.memos,
      memoText: memoFields.memoText,
      memoUpdatedAt: memoFields.memoUpdatedAt
    }];
  }));
  const resources = objectOr(input.resources);
  const modules = normalizeModules(input.modules, resources);
  const resourceGroups = normalizeResourceGroups(input.resourceGroups, modules, resources);
  const state = {
    ...base,
    ...input,
    projects,
    vaultRefs,
    modules,
    resourceGroups,
    resources,
    plans: objectOr(input.plans),
    sources: objectOr(input.sources),
    notes: objectOr(input.notes),
    activity: Array.isArray(input.activity) ? input.activity.slice(-500) : [],
    inbox: Array.isArray(input.inbox) ? input.inbox : [],
    uiState: {
      ...base.uiState,
      ...objectOr(input.uiState),
      collapsedTodayProjects: objectOr(input.uiState?.collapsedTodayProjects),
      todayProjectOrder: uniqueStrings(input.uiState?.todayProjectOrder),
      todaySidebarOrder: normalizeTodaySidebarOrder(input.uiState?.todaySidebarOrder),
      showInterfaceTips: input.uiState?.showInterfaceTips !== false,
      collapsedProjectPlans: objectOr(input.uiState?.collapsedProjectPlans),
      scrollPositions: objectOr(input.uiState?.scrollPositions),
      projectPanelOrder: normalizeProjectPanelOrder(input.uiState?.projectPanelOrder),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: objectOr(input.uiState?.projectPanelCollapsedByProject),
      projectRecentCollapsedByProject: normalizeProjectRecentCollapsedByProject(input.uiState?.projectRecentCollapsedByProject, projects),
      collapsedResourceGroupsByModule: normalizeCollapsedResourceGroups(input.uiState?.collapsedResourceGroupsByModule, modules, resourceGroups),
      recentVaultCreatePaths: normalizeVaultPathList(input.uiState?.recentVaultCreatePaths).slice(0, 5),
      pinnedVaultCreatePaths: normalizeVaultPathList(input.uiState?.pinnedVaultCreatePaths)
    }
  };
  state.uiState.projectBoardLayouts = normalizeProjectBoardLayouts(
    input.uiState?.projectBoardLayouts,
    state,
    state.uiState.projectPanelOrder
  );
  state.uiState.todayProjectOrder = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.schemaVersion = SCHEMA_VERSION;
  if (!state.uiState.currentProjectId || !state.projects[state.uiState.currentProjectId]) {
    state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  }
  return state;
}

function nowIso() {
  return new Date().toISOString();
}

function activeProjects(state) {
  return Object.values(state.projects)
    .filter((project) => !project.archivedAt && !project.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function todayProjects(state) {
  const projects = activeProjects(state);
  const order = normalizeTodayProjectOrder(state.uiState?.todayProjectOrder, projects);
  const byId = new Map(projects.map((project) => [project.id, project]));
  return order.map((projectId) => byId.get(projectId)).filter(Boolean);
}

function moveTodayProjectBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.uiState.todayProjectOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todayProjectOrder;
}

function moveTodaySidebarCardBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodaySidebarOrder(state.uiState.todaySidebarOrder);
  state.uiState.todaySidebarOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todaySidebarOrder;
}

function projectModules(state, projectId) {
  return Object.values(state.modules)
    .filter((module) => module.projectId === projectId && !module.archivedAt && !module.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function ensureProjectBoardLayout(state, projectId) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  state.uiState = objectOr(state.uiState);
  state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
  const rawLayout = state.uiState.projectBoardLayouts[projectId];
  const layout = normalizeProjectBoardLayout(rawLayout, state, projectId, state.uiState.projectPanelOrder);
  state.uiState.projectBoardLayouts[projectId] = layout;
  return layout;
}

function projectBoardItems(state, projectId, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  const visibleKeys = new Set([
    ...projectBoardModuleKeys(state, projectId, Boolean(options.includeArchived)),
    ...projectBoardUtilityKeys(),
    ...projectBoardMemoKeys(state, projectId)
  ]);
  return Object.entries(layout.items)
    .filter(([key]) => visibleKeys.has(key))
    .map(([key, anchor]) => {
      if (key.startsWith('module:')) {
        const moduleId = key.slice('module:'.length);
        return { key, kind: 'module', moduleId, module: state.modules[moduleId], ...anchor };
      }
      if (key.startsWith('memo:')) {
        const memoId = key.slice('memo:'.length);
        return { key, kind: 'memo', memoId, memo: state.projects[projectId]?.memos?.find((memo) => memo.id === memoId), ...anchor };
      }
      return { key, kind: 'utility', utilityId: key.slice('utility:'.length), ...anchor };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column || left.key.localeCompare(right.key));
}

function moveProjectBoardItem(state, projectId, itemKey, column, row, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  if (!layout.items[itemKey]) throw new Error('找不到布局项。');
  const memoItem = itemKey.startsWith('memo:');
  const target = {
    column: Number(column),
    row: Number(row),
    ...(memoItem ? { side: projectBoardMemoSide(options.side) } : {})
  };
  if (!validProjectBoardAnchor(target)) throw new Error('布局位置无效。');
  const source = layout.items[itemKey];
  if (source.column === target.column && source.row === target.row
    && (!memoItem || projectBoardMemoSide(source.side) === target.side)) return { layout, itemKey, swappedWith: '' };
  const layoutBefore = cloneProjectBoardLayout(layout);
  const targetOccupants = projectBoardCellOccupants(layout.items, target.column, target.row, itemKey);
  let occupied = null;
  if (memoItem) {
    if (targetOccupants.some(([key]) => !key.startsWith('memo:'))) throw new Error('目标整格已被其他组件占用。');
    occupied = targetOccupants.find(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === target.side) || null;
  } else {
    if (targetOccupants.some(([key]) => key.startsWith('memo:'))) throw new Error('目标格包含便签，请先移动便签。');
    occupied = targetOccupants[0] || null;
  }
  layout.items[itemKey] = target;
  if (occupied) layout.items[occupied[0]] = {
    column: source.column,
    row: source.row,
    ...(occupied[0].startsWith('memo:') ? { side: projectBoardMemoSide(source.side) } : {})
  };
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '调整项目布局',
    projectId,
    layoutBefore
  });
  return { layout, itemKey, swappedWith: occupied?.[0] || '' };
}

function resetProjectBoardLayout(state, projectId) {
  const layoutBefore = cloneProjectBoardLayout(ensureProjectBoardLayout(state, projectId));
  const layout = defaultProjectBoardLayout(state, projectId);
  state.uiState.projectBoardLayouts[projectId] = layout;
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '恢复默认项目布局',
    projectId,
    layoutBefore
  });
  return layout;
}

function moduleResources(state, moduleId) {
  const resourceIds = state.modules[moduleId]?.resourceIds || [];
  return resourceIds.map((id) => state.resources[id]).filter((resource) => resource && !resource.deletedAt);
}

function moduleResourceGroups(state, moduleId) {
  const module = state.modules[moduleId];
  if (!module) return [];
  const listed = uniqueStrings(module.resourceGroupIds)
    .map((groupId) => state.resourceGroups[groupId])
    .filter((group) => group?.moduleId === moduleId);
  const listedIds = new Set(listed.map((group) => group.id));
  const remaining = Object.values(objectOr(state.resourceGroups))
    .filter((group) => group.moduleId === moduleId && !listedIds.has(group.id));
  return [...listed, ...remaining]
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
}

function resourceGroupProgress(state, groupId) {
  const group = state.resourceGroups[groupId];
  if (!group || !state.modules[group.moduleId]) throw new Error('找不到资源分组。');
  const moduleIds = new Set(state.modules[group.moduleId].resourceIds || []);
  const resources = uniqueStrings(group.resourceIds)
    .filter((resourceId) => moduleIds.has(resourceId))
    .map((resourceId) => state.resources[resourceId])
    .filter((resource) => resource && !resource.deletedAt);
  const completed = resources.filter((resource) => resource.completedAt).length;
  return { total: resources.length, completed, done: resources.length > 0 && completed === resources.length };
}

function touchModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) return '';
  const timestamp = at.toISOString();
  module.updatedAt = timestamp;
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return timestamp;
}

function createResourceGroup(state, moduleId, title, resourceIds = [], at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  const id = createId('resource-group');
  const timestamp = at.toISOString();
  const sortOrder = moduleResourceGroups(state, moduleId).length;
  state.resourceGroups = objectOr(state.resourceGroups);
  state.resourceGroups[id] = {
    id,
    moduleId,
    title: value,
    resourceIds: [],
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  module.resourceGroupIds = [...new Set([...(module.resourceGroupIds || []), id])];
  if (resourceIds.length) moveResourcesToGroup(state, moduleId, resourceIds, id, at);
  else touchModule(state, moduleId, at);
  return state.resourceGroups[id];
}

function renameResourceGroup(state, groupId, title, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  group.title = value;
  group.updatedAt = touchModule(state, group.moduleId, at);
  return group;
}

function moveResourceGroup(state, moduleId, groupId, targetGroupId, at = new Date()) {
  const ordered = moduleResourceGroups(state, moduleId);
  const from = ordered.findIndex((group) => group.id === groupId);
  const to = ordered.findIndex((group) => group.id === targetGroupId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = touchModule(state, moduleId, at);
  ordered.forEach((group, index) => {
    group.sortOrder = index;
    group.updatedAt = timestamp;
  });
  state.modules[moduleId].resourceGroupIds = ordered.map((group) => group.id);
  return ordered;
}

function moveResourcesToGroup(state, moduleId, resourceIds, groupId = '', at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const target = groupId ? state.resourceGroups[groupId] : null;
  if (groupId && target?.moduleId !== moduleId) throw new Error('找不到目标资源分组。');
  const moduleIds = new Set(module.resourceIds || []);
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter((resourceId) => moduleIds.has(resourceId) && state.resources[resourceId]))];
  const affected = new Set(ids);
  const timestamp = touchModule(state, moduleId, at);
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = uniqueStrings(group.resourceIds).filter((resourceId) => !affected.has(resourceId));
    if (nextIds.length !== uniqueStrings(group.resourceIds).length) {
      group.resourceIds = nextIds;
      group.updatedAt = timestamp;
    }
  }
  if (target) {
    target.resourceIds = [...new Set([...(target.resourceIds || []), ...ids])];
    target.updatedAt = timestamp;
  }
  return { group: target, resourceIds: ids };
}

function moveResourceToGroup(state, moduleId, resourceId, groupId = '', at = new Date()) {
  return moveResourcesToGroup(state, moduleId, [resourceId], groupId, at);
}

function deleteResourceGroup(state, groupId, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const module = state.modules[group.moduleId];
  const snapshot = { ...group, resourceIds: [...(group.resourceIds || [])] };
  delete state.resourceGroups[groupId];
  if (module) {
    module.resourceGroupIds = (module.resourceGroupIds || []).filter((id) => id !== groupId);
    const ordered = moduleResourceGroups(state, module.id);
    ordered.forEach((item, index) => { item.sortOrder = index; });
    touchModule(state, module.id, at);
  }
  delete state.uiState.collapsedResourceGroupsByModule?.[group.moduleId]?.[groupId];
  if (state.uiState.collapsedResourceGroupsByModule?.[group.moduleId] && !Object.keys(state.uiState.collapsedResourceGroupsByModule[group.moduleId]).length) {
    delete state.uiState.collapsedResourceGroupsByModule[group.moduleId];
  }
  return { group: snapshot, ungroupedResourceIds: snapshot.resourceIds };
}

function setResourceGroupCollapsed(state, moduleId, groupId, collapsed) {
  if (state.resourceGroups[groupId]?.moduleId !== moduleId) throw new Error('找不到资源分组。');
  state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
  state.uiState.collapsedResourceGroupsByModule[moduleId] = {
    ...objectOr(state.uiState.collapsedResourceGroupsByModule[moduleId]),
    [groupId]: Boolean(collapsed)
  };
  return state.uiState.collapsedResourceGroupsByModule[moduleId][groupId];
}

function defaultResourceAutoGroupEnabled(resourceCount) {
  return Number(resourceCount || 0) > 20;
}

function resourceGroupTitle(index) {
  const value = Math.max(1, Math.floor(Number(index || 1)));
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const chineseNumber = value < 10
    ? digits[value]
    : value < 20
      ? `十${value % 10 ? digits[value % 10] : ''}`
      : value < 100
        ? `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ''}`
        : String(value);
  return `第${chineseNumber}组`;
}

function autoGroupResources(state, moduleId, orderedResourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const size = Math.max(1, Math.min(200, Math.floor(Number(options.size || 20))));
  const key = String(options.key || '').trim();
  const scopePath = normalizeResourceGroupScopePath(options.scopePath);
  if (!key) throw new Error('自动分组缺少稳定批次身份。');
  const ids = [...new Set((Array.isArray(orderedResourceIds) ? orderedResourceIds : []).filter((resourceId) => (module.resourceIds || []).includes(resourceId) && state.resources[resourceId]))];
  const assigned = new Map();
  for (const group of moduleResourceGroups(state, moduleId)) {
    for (const resourceId of group.resourceIds || []) assigned.set(resourceId, group);
  }
  const groups = [];
  const createdGroupIds = [];
  const timestamp = options.at instanceof Date ? options.at : new Date();
  for (let offset = 0; offset < ids.length; offset += size) {
    const index = Math.floor(offset / size) + 1;
    const chunk = ids.slice(offset, offset + size);
    let group = moduleResourceGroups(state, moduleId).find((candidate) => candidate.autoGroupKey === key && Number(candidate.autoGroupIndex) === index);
    const available = chunk.filter((resourceId) => !assigned.has(resourceId) || assigned.get(resourceId)?.id === group?.id);
    if (!group && !available.length) continue;
    if (!group) {
      group = createResourceGroup(state, moduleId, options.titleForIndex?.(index) || resourceGroupTitle(index), [], timestamp);
      group.autoGroupKey = key;
      group.autoGroupIndex = index;
      group.autoGroupSize = size;
      group.scopePath = scopePath;
      createdGroupIds.push(group.id);
    }
    if (!group.scopePath && scopePath) group.scopePath = scopePath;
    if (available.length) {
      moveResourcesToGroup(state, moduleId, available, group.id, timestamp);
      for (const resourceId of available) assigned.set(resourceId, group);
    }
    groups.push(group);
  }
  return { groups, createdGroupIds, resourceIds: ids, skippedResourceIds: ids.filter((resourceId) => !groups.some((group) => group.resourceIds.includes(resourceId))) };
}

function removeResourcesFromModule(state, moduleId, resourceIds, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const removed = new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter(Boolean));
  module.resourceIds = (module.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
  for (const resourceId of removed) delete module.resourceRoots?.[resourceId];
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = (group.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
    if (nextIds.length !== (group.resourceIds || []).length) {
      group.resourceIds = nextIds;
      group.updatedAt = at.toISOString();
    }
  }
  touchModule(state, moduleId, at);
  return [...removed];
}

function resourceOpenListPath(resource) {
  return resource?.launcher?.type === 'openlist' || resource?.launcher?.type === 'openlist-file' || resource?.metadata?.remotePath
    ? normalizeOpenListPath(resource.launcher?.remotePath || resource.metadata?.remotePath || '/')
    : '';
}

function resourceLocalPath(resource) {
  return resource?.launcher?.type === 'file' ? String(resource.launcher.path || resource.metadata?.localPath || '') : String(resource?.metadata?.localPath || '');
}

function normalizeResourceRoot(resource, rootPath) {
  if (resourceOpenListPath(resource)) return normalizeOpenListPath(rootPath || '/');
  if (resourceLocalPath(resource)) return String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return '';
}

function commonOpenListParent(resources) {
  const parents = (Array.isArray(resources) ? resources : []).map((resource) => {
    const remotePath = resourceOpenListPath(resource);
    if (!remotePath) return null;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return parts;
  }).filter(Boolean);
  if (!parents.length) return '';
  const common = [];
  for (let index = 0; index < parents[0].length; index += 1) {
    const segment = parents[0][index];
    if (!parents.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function moduleResourceRoot(state, moduleId, resourceId) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module || (!resourceOpenListPath(resource) && !resourceLocalPath(resource))) return '';
  const stored = module.resourceRoots?.[resourceId];
  if (stored) return normalizeResourceRoot(resource, stored);
  if (resourceLocalPath(resource)) return normalizeResourceRoot(resource, resource.metadata?.rootPath);
  const peers = moduleResources(state, moduleId).filter((candidate) => resourceOpenListPath(candidate) && String(candidate.sourceId || candidate.launcher?.sourceId || '') === String(resource.sourceId || resource.launcher?.sourceId || ''));
  return commonOpenListParent(peers) || normalizeOpenListPath(resource.metadata?.rootPath || '/');
}

function resourceFolderPath(resource, rootPathValue = '') {
  const resourcePath = String(resource?.metadata?.remotePath || resource?.launcher?.remotePath || resource?.metadata?.localPath || (resource?.launcher?.type === 'file' ? resource.launcher.path : '') || '').replace(/\\/g, '/');
  if (!resourcePath) return '';
  const rootPath = String(rootPathValue || resource?.metadata?.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const localResource = Boolean(resource?.metadata?.localPath || resource?.launcher?.type === 'file');
  const rootMatches = rootPath && rootPath !== '/' && (localResource
    ? resourcePath.toLowerCase() === rootPath.toLowerCase() || resourcePath.toLowerCase().startsWith(`${rootPath.toLowerCase()}/`)
    : resourcePath === rootPath || resourcePath.startsWith(`${rootPath}/`));
  const relative = rootMatches ? resourcePath.slice(rootPath.length).replace(/^\/+/, '') : resourcePath.replace(/^\/+/, '');
  const relativeFolder = relative.split('/').filter(Boolean).slice(0, -1).join('/');
  if (!localResource || !rootMatches) return relativeFolder;
  const rootLabel = rootPath.split('/').filter(Boolean).at(-1) || rootPath;
  return [rootLabel, relativeFolder].filter(Boolean).join('/');
}

function linkResourcesToModule(state, moduleId, resourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).filter((resourceId) => state.resources[resourceId] && !state.resources[resourceId].deletedAt))];
  const existing = new Set(module.resourceIds || []);
  const linkedResourceIds = ids.filter((resourceId) => !existing.has(resourceId));
  module.resourceIds = [...new Set([...(module.resourceIds || []), ...ids])];
  module.resourceRoots = objectOr(module.resourceRoots);
  if (options.rootPath) {
    for (const resourceId of ids) {
      const rootPath = normalizeResourceRoot(state.resources[resourceId], options.rootPath);
      if (rootPath) module.resourceRoots[resourceId] = rootPath;
    }
  } else {
    const groups = new Map();
    for (const resourceId of ids) {
      const resource = state.resources[resourceId];
      if (!resourceOpenListPath(resource)) continue;
      const key = String(resource.sourceId || resource.launcher?.sourceId || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(resource);
    }
    for (const resources of groups.values()) {
      const rootPath = commonOpenListParent(resources);
      if (rootPath) for (const resource of resources) module.resourceRoots[resource.id] = rootPath;
    }
  }
  module.updatedAt = nowIso();
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = module.updatedAt;
  return { module, resourceIds: ids, linkedResourceIds };
}

function projectPlans(state, projectId) {
  return Object.values(state.plans)
    .filter((plan) => plan.projectId === projectId && !plan.archivedAt && !plan.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function createProject(state, title) {
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  const id = createId('project');
  const timestamp = nowIso();
  const memoId = createId('memo');
  state.projects[id] = {
    id,
    title: value,
    moduleIds: [],
    noteIds: [],
    vaultRefIds: [],
    pinnedVaultRefIds: [],
    memos: [{ id: memoId, text: '', createdAt: timestamp, updatedAt: '' }],
    memoText: '',
    memoUpdatedAt: '',
    sortOrder: activeProjects(state).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.uiState.currentProjectId = id;
  return state.projects[id];
}

function inferVaultFileKind(path, entryType) {
  if (entryType === 'folder') return 'other';
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.excalidraw.md')) return 'plugin-file';
  const extension = lower.split('.').pop();
  if (extension === 'md') return 'markdown';
  if (extension === 'canvas') return 'canvas';
  if (extension === 'base') return 'base';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return 'image';
  return 'other';
}

function projectVaultRefs(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) return [];
  const pinnedIds = new Set(project.pinnedVaultRefIds || []);
  return (project.vaultRefIds || [])
    .map((vaultRefId, index) => ({ vaultRef: state.vaultRefs[vaultRefId], index }))
    .filter(({ vaultRef }) => vaultRef)
    .sort((left, right) => Number(pinnedIds.has(right.vaultRef.id)) - Number(pinnedIds.has(left.vaultRef.id)) || left.index - right.index)
    .map(({ vaultRef }) => vaultRef);
}

function upsertVaultRef(state, input, at = new Date()) {
  const path = normalizeVaultPath(input?.path);
  if (!path) throw new Error('Vault 路径不能为空。');
  const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
  if (!entryType) throw new Error('项目文件类型必须是 file 或 folder。');
  const existing = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === path && vaultRef.entryType === entryType);
  const timestamp = at.toISOString();
  if (existing) {
    if (input.fileKind) existing.fileKind = normalizeVaultFileKind(input.fileKind);
    existing.missingAt = '';
    existing.updatedAt = timestamp;
    return { vaultRef: existing, reused: true };
  }
  const id = createId('vault-ref');
  const vaultRef = {
    id,
    path,
    entryType,
    fileKind: normalizeVaultFileKind(input?.fileKind || inferVaultFileKind(path, entryType)),
    createdAt: timestamp,
    updatedAt: timestamp,
    missingAt: ''
  };
  state.vaultRefs[id] = vaultRef;
  return { vaultRef, reused: false };
}

function linkVaultRefToProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!state.vaultRefs[vaultRefId]) throw new Error('找不到项目文件引用。');
  const wasLinked = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = uniqueStrings([...(project.vaultRefIds || []), vaultRefId]);
  project.updatedAt = at.toISOString();
  return { vaultRef: state.vaultRefs[vaultRefId], reused: wasLinked };
}

function linkVaultEntriesToProject(state, projectId, inputs, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRefsBefore = Object.fromEntries(Object.entries(state.vaultRefs).map(([id, vaultRef]) => [id, { ...vaultRef }]));
  const projectBefore = { vaultRefIds: [...(project.vaultRefIds || [])], pinnedVaultRefIds: [...(project.pinnedVaultRefIds || [])], updatedAt: project.updatedAt };
  const lastActionBefore = state.uiState.lastAction;
  const linkedVaultRefIds = [];
  const createdVaultRefIds = [];
  const reusedVaultRefSnapshots = [];
  try {
    for (const input of Array.isArray(inputs) ? inputs : []) {
      const normalizedPath = normalizeVaultPath(input?.path);
      const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
      const existingBefore = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === normalizedPath && vaultRef.entryType === entryType);
      const result = upsertVaultRef(state, input, at);
      if (!result.reused) createdVaultRefIds.push(result.vaultRef.id);
      const linked = linkVaultRefToProject(state, projectId, result.vaultRef.id, at);
      if (!linked.reused) {
        linkedVaultRefIds.push(result.vaultRef.id);
        if (existingBefore && !reusedVaultRefSnapshots.some((snapshot) => snapshot.id === existingBefore.id)) reusedVaultRefSnapshots.push({ ...vaultRefsBefore[existingBefore.id] });
      }
    }
    if (linkedVaultRefIds.length) {
      recordLastAction(state, {
        type: 'link-vault-refs',
        label: `关联 ${linkedVaultRefIds.length} 个项目文件`,
        projectId,
        linkedVaultRefIds,
        createdVaultRefIds,
        reusedVaultRefSnapshots
      });
    }
  } catch (error) {
    state.vaultRefs = vaultRefsBefore;
    project.vaultRefIds = projectBefore.vaultRefIds;
    project.pinnedVaultRefIds = projectBefore.pinnedVaultRefIds;
    project.updatedAt = projectBefore.updatedAt;
    state.uiState.lastAction = lastActionBefore;
    throw error;
  }
  return { linkedVaultRefIds, createdVaultRefIds };
}

function unlinkVaultRefFromProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRef = state.vaultRefs[vaultRefId] || null;
  const removed = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = (project.vaultRefIds || []).filter((id) => id !== vaultRefId);
  project.pinnedVaultRefIds = (project.pinnedVaultRefIds || []).filter((id) => id !== vaultRefId);
  project.updatedAt = at.toISOString();
  const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
  if (vaultRef && !stillReferenced) delete state.vaultRefs[vaultRefId];
  return { vaultRef, removed, cleaned: Boolean(vaultRef && !stillReferenced) };
}

function updateVaultRefPath(state, vaultRefId, path, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) throw new Error('Vault 路径不能为空。');
  const existing = Object.values(state.vaultRefs).find((candidate) => candidate.id !== vaultRefId && candidate.path === normalizedPath && candidate.entryType === vaultRef.entryType);
  if (existing) {
    for (const project of Object.values(state.projects)) {
      if (!(project.vaultRefIds || []).includes(vaultRefId)) continue;
      project.vaultRefIds = uniqueStrings((project.vaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id));
      project.pinnedVaultRefIds = uniqueStrings((project.pinnedVaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id)).filter((id) => project.vaultRefIds.includes(id));
      project.updatedAt = at.toISOString();
    }
    existing.missingAt = '';
    existing.updatedAt = at.toISOString();
    delete state.vaultRefs[vaultRefId];
    return existing;
  }
  vaultRef.path = normalizedPath;
  const inferredFileKind = inferVaultFileKind(normalizedPath, vaultRef.entryType);
  if (inferredFileKind !== 'other' || vaultRef.fileKind === 'other') vaultRef.fileKind = inferredFileKind;
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function markVaultRefMissing(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  if (!vaultRef.missingAt) vaultRef.missingAt = at.toISOString();
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function restoreVaultRef(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  vaultRef.missingAt = '';
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function togglePinnedVaultRef(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!(project.vaultRefIds || []).includes(vaultRefId)) throw new Error('项目尚未关联该项目文件。');
  const pinned = new Set(project.pinnedVaultRefIds || []);
  if (pinned.has(vaultRefId)) pinned.delete(vaultRefId);
  else pinned.add(vaultRefId);
  project.pinnedVaultRefIds = [...pinned].filter((id) => (project.vaultRefIds || []).includes(id));
  project.updatedAt = at.toISOString();
  return pinned.has(vaultRefId);
}

function projectForMemo(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  return project;
}

function isoAt(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.toISOString();
}

function memoTextValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return String(value.text ?? value.memoText ?? value.content ?? '');
  }
  return String(value ?? '');
}

function ensureProjectMemos(project) {
  project.memos = normalizeProjectMemos(project.memos, project.id || 'project');
  return project.memos;
}

function syncLegacyProjectMemo(project) {
  const firstMemo = Array.isArray(project.memos) ? project.memos[0] : null;
  project.memoText = String(firstMemo?.text || '');
  project.memoUpdatedAt = String(firstMemo?.updatedAt || '');
}

function createProjectMemo(state, projectId, text = '', at = new Date()) {
  const project = projectForMemo(state, projectId);
  const timestamp = isoAt(at);
  const memo = {
    id: createId('memo'),
    title: '',
    text: memoTextValue(text),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  ensureProjectMemos(project).push(memo);
  project.updatedAt = timestamp;
  if (project.memos.length === 1) syncLegacyProjectMemo(project);
  ensureProjectBoardLayout(state, projectId);
  return memo;
}

function updateProjectMemoTitle(state, projectId, memoId, title, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.title = String(title || '').trim();
  memo.updatedAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function updateProjectMemo(state, projectId, memoId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function deleteProjectMemo(state, projectId, memoId, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const index = memos.findIndex((candidate) => candidate.id === memoId);
  if (index < 0) throw new Error('找不到项目便签。');
  const [removed] = memos.splice(index, 1);
  const layout = state.uiState?.projectBoardLayouts?.[projectId];
  if (layout?.items) delete layout.items[`memo:${memoId}`];
  project.updatedAt = isoAt(at);
  syncLegacyProjectMemo(project);
  return removed;
}

function setProjectMemo(state, projectId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const timestamp = isoAt(at);
  if (!memos.length) {
    memos.push({ id: createId('memo'), text: '', createdAt: timestamp, updatedAt: '' });
  }
  const memo = memos[0];
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.memoText = memo.text;
  project.memoUpdatedAt = timestamp;
  project.updatedAt = timestamp;
  return project;
}

function setProjectPanelOrder(state, panelIds) {
  state.uiState.projectPanelOrder = normalizeProjectPanelOrder(panelIds);
  return state.uiState.projectPanelOrder;
}

function setProjectPanelCollapsed(state, projectId, panelId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  if (!PROJECT_PANEL_IDS.includes(panelId)) throw new Error('未知的项目辅助区组件。');
  const byProject = objectOr(state.uiState.projectPanelCollapsedByProject);
  byProject[projectId] = { ...objectOr(byProject[projectId]), [panelId]: Boolean(collapsed) };
  state.uiState.projectPanelCollapsedByProject = byProject;
  return byProject[projectId];
}

function setProjectRecentCollapsed(state, projectId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  const byProject = objectOr(state.uiState?.projectRecentCollapsedByProject);
  byProject[projectId] = Boolean(collapsed);
  state.uiState.projectRecentCollapsedByProject = byProject;
  return byProject[projectId];
}

function recordRecentVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  state.uiState.recentVaultCreatePaths = [
    normalizedPath,
    ...normalizeVaultPathList(state.uiState.recentVaultCreatePaths).filter((item) => item !== normalizedPath)
  ].slice(0, 5);
  return state.uiState.recentVaultCreatePaths;
}

function togglePinnedVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  const pinned = normalizeVaultPathList(state.uiState.pinnedVaultCreatePaths);
  state.uiState.pinnedVaultCreatePaths = pinned.includes(normalizedPath)
    ? pinned.filter((item) => item !== normalizedPath)
    : [...pinned, normalizedPath];
  return state.uiState.pinnedVaultCreatePaths.includes(normalizedPath);
}

function renameProject(state, projectId, title, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  project.title = value;
  project.updatedAt = at.toISOString();
  return project;
}

function createModule(state, projectId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('模块名称不能为空。');
  const id = createId('module');
  const timestamp = nowIso();
  const siblings = projectModules(state, projectId);
  state.modules[id] = {
    id,
    projectId,
    title: value,
    resourceIds: [],
    resourceRoots: {},
    resourceGroupIds: [],
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: ''
  };
  state.projects[projectId].moduleIds = [...new Set([...(state.projects[projectId].moduleIds || []), id])];
  state.projects[projectId].updatedAt = timestamp;
  ensureProjectBoardLayout(state, projectId);
  return state.modules[id];
}

function moveModule(state, projectId, moduleId, targetModuleId) {
  const ordered = projectModules(state, projectId);
  const from = ordered.findIndex((module) => module.id === moduleId);
  const to = ordered.findIndex((module) => module.id === targetModuleId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = nowIso();
  ordered.forEach((module, index) => {
    module.sortOrder = index;
    module.updatedAt = timestamp;
  });
  state.projects[projectId].moduleIds = ordered.map((module) => module.id);
  state.projects[projectId].updatedAt = timestamp;
  return ordered;
}

function modulePlans(state, moduleId) {
  return Object.values(state.plans).filter((plan) => plan.targetType === 'module' && plan.targetIds?.includes(moduleId) && !plan.deletedAt);
}

function archiveModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  if (module.archivedAt) return module;
  const timestamp = at.toISOString();
  module.archivedAt = timestamp;
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.archivedAt) continue;
    plan.archivedAt = timestamp;
    plan.moduleArchivedBy = moduleId;
    plan.updatedAt = timestamp;
  }
  if (state.modules[moduleId]?.projectId && state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function restoreModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const timestamp = at.toISOString();
  module.archivedAt = '';
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.moduleArchivedBy !== moduleId) continue;
    plan.archivedAt = '';
    delete plan.moduleArchivedBy;
    plan.updatedAt = timestamp;
  }
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function deleteModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const project = state.projects[module.projectId];
  const planSnapshots = modulePlans(state, moduleId).map((plan) => ({ ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule }));
  const moduleSnapshot = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
  const resourceGroupSnapshots = moduleResourceGroups(state, moduleId).map((group) => ({ ...group, resourceIds: [...(group.resourceIds || [])] }));
  const collapsedResourceGroups = { ...objectOr(state.uiState.collapsedResourceGroupsByModule?.[moduleId]) };
  const boardLayout = project ? ensureProjectBoardLayout(state, module.projectId) : null;
  const projectBoardLayoutBefore = boardLayout ? cloneProjectBoardLayout(boardLayout) : null;
  const detachedResourceCount = moduleSnapshot.resourceIds.filter((resourceId) => state.resources[resourceId]).length;
  for (const plan of planSnapshots) delete state.plans[plan.id];
  for (const group of resourceGroupSnapshots) delete state.resourceGroups[group.id];
  delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  if (boardLayout) delete boardLayout.items[`module:${moduleId}`];
  delete state.modules[moduleId];
  if (project) {
    project.moduleIds = (project.moduleIds || []).filter((id) => id !== moduleId);
    project.updatedAt = at.toISOString();
  }
  recordLastAction(state, {
    type: 'delete-module',
    label: `删除模块：${module.title}`,
    projectId: module.projectId,
    moduleSnapshot,
    planSnapshots,
    resourceGroupSnapshots,
    collapsedResourceGroups,
    projectBoardLayoutBefore
  });
  return { module: moduleSnapshot, removedPlanCount: planSnapshots.length, removedResourceGroupCount: resourceGroupSnapshots.length, detachedResourceCount };
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function validateExternalUri(raw, allowedProtocols = ['https:', 'http:']) {
  const value = String(raw || '').trim();
  let url;
  try { url = new URL(value); } catch { throw new Error('外部地址无效。'); }
  if (!allowedProtocols.includes(url.protocol.toLowerCase())) {
    throw new Error(`不允许打开 ${url.protocol || '未知'} 协议。`);
  }
  return value;
}

function normalizeOpenListBaseUrl(raw) {
  const url = new URL(String(raw || '').trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error('OpenList 地址必须使用 HTTP 或 HTTPS。');
  const hostname = url.hostname.toLowerCase() === 'localhost' ? '127.0.0.1' : url.hostname.toLowerCase();
  const isLoopback = hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error('远程 OpenList 必须使用 HTTPS；HTTP 仅允许本机回环地址。');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const defaultPort = (url.protocol === 'http:' && port === '80') || (url.protocol === 'https:' && port === '443');
  return `${url.protocol}//${hostname}${defaultPort ? '' : `:${port}`}`;
}

function normalizeOpenListPath(rawPath) {
  const decoded = decodeURIComponent(String(rawPath || '/').split(/[?#]/, 1)[0] || '/');
  const parts = decoded.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('OpenList 路径不能包含 ..。');
  return `/${parts.join('/')}`.normalize('NFC');
}

function openListImportRoot(entries) {
  const roots = (Array.isArray(entries) ? entries : []).map((entry) => {
    const remotePath = normalizeOpenListPath(entry?.remotePath || '/');
    if (entry?.is_dir) return remotePath;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return normalizeOpenListPath(`/${parts.join('/')}`);
  });
  if (!roots.length) return '/';
  const segments = roots.map((rootPath) => rootPath.split('/').filter(Boolean));
  const common = [];
  for (let index = 0; index < segments[0].length; index += 1) {
    const segment = segments[0][index];
    if (!segments.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function sourceForResource(resource, sources = {}) {
  if (!resource?.sourceId) return null;
  if (Array.isArray(sources)) return sources.find((source) => source?.id === resource.sourceId) || null;
  return objectOr(sources)[resource.sourceId] || null;
}

function resourcePickerGroupInfo(resource, sources = {}) {
  const metadata = objectOr(resource?.metadata);
  const launcher = objectOr(resource?.launcher);
  const source = sourceForResource(resource, sources);
  const sourceName = String(source?.alias || source?.title || '').trim();

  if (launcher.type === 'openlist' || metadata.remotePath) {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '').replace(/\\/g, '/');
    const parts = remotePath.split('/').filter(Boolean);
    const storedRoot = String(metadata.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const fallbackRoot = parts.length > 1 ? `/${parts.slice(0, 2).join('/')}` : `/${parts.join('/')}`;
    const groupRoot = storedRoot && storedRoot !== '/' ? storedRoot : fallbackRoot || '/';
    const rootParts = groupRoot.split('/').filter(Boolean);
    const label = rootParts.at(-1) || sourceName || 'OpenList 视频';
    return {
      key: `openlist:${resource.sourceId || source?.id || ''}:${groupRoot.toLowerCase()}`,
      label,
      detail: `OpenList · ${groupRoot}`
    };
  }

  if (metadata.collectionTitle || metadata.collectionId) {
    const identity = String(metadata.collectionId || metadata.collectionTitle).toLowerCase();
    return {
      key: `bili-collection:${resource.sourceId || ''}:${identity}`,
      label: String(metadata.collectionTitle || sourceName || 'B站合集'),
      detail: sourceName ? `B站合集 · ${sourceName}` : 'B站合集'
    };
  }

  if (metadata.bvid || source?.type === 'bilibili') {
    return {
      key: `bili-source:${resource.sourceId || metadata.mid || 'standalone'}`,
      label: sourceName || source?.alias || 'B站视频',
      detail: 'B站投稿'
    };
  }

  if (launcher.type === 'file' || /^file:/i.test(resource?.canonicalKey || '')) {
    const filePath = String(launcher.path || resource.canonicalKey?.slice(5) || '').replace(/\//g, '\\');
    const parts = filePath.split('\\').filter(Boolean);
    const parentPath = parts.slice(0, -1).join('\\');
    return {
      key: `file:${resource.sourceId || ''}:${parentPath.toLowerCase()}`,
      label: parts.at(-2) || sourceName || '本地文件',
      detail: parentPath || '本地文件'
    };
  }

  if (resource?.kind === 'anki' || launcher.type === 'anki') {
    const deck = String(launcher.deck || metadata.deck || resource.title || 'Anki');
    const parentDeck = deck.split('::')[0] || 'Anki';
    return { key: `anki:${resource.sourceId || ''}:${parentDeck.toLowerCase()}`, label: parentDeck, detail: 'Anki 卡组' };
  }

  const kind = String(resource?.kind || 'other');
  const label = ({ video: '视频', anki: 'Anki', pdf: 'PDF', file: '文件', web: '网页' })[kind] || '其他资源';
  return { key: `kind:${kind}`, label, detail: '其他资源' };
}

function buildResourcePickerIndex(resources = [], sources = {}) {
  const entries = [];
  const groupMap = new Map();
  for (const resource of resources) {
    const group = resourcePickerGroupInfo(resource, sources);
    const entry = {
      resource,
      groupKey: group.key,
      searchText: `${resource.title || ''} ${resource.kind || ''} ${group.label} ${group.detail}`.toLocaleLowerCase()
    };
    entries.push(entry);
    if (!groupMap.has(group.key)) groupMap.set(group.key, { ...group, resources: [] });
    groupMap.get(group.key).resources.push(resource);
  }
  const groups = [...groupMap.values()].sort((left, right) =>
    String(left.label).localeCompare(String(right.label), 'zh-CN', { numeric: true, sensitivity: 'base' })
  );
  return { entries, groups };
}

function parseOpenListUrl(raw, sources = []) {
  const extracted = extractResourceInput(raw);
  let url;
  try { url = new URL(extracted.value); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const rootPath = normalizeOpenListPath(url.pathname);
  if (/^\/(?:api|d|dav)(?:\/|$)/i.test(rootPath)) return null;
  const baseUrl = normalizeOpenListBaseUrl(url.origin);
  const matchingSource = (sources || []).find((source) => {
    if (source?.type !== 'openlist' || source.deletedAt) return false;
    try { return normalizeOpenListBaseUrl(source.baseUrl) === baseUrl; } catch { return false; }
  });
  const localService = /^(?:localhost|127\.0\.0\.1)$/i.test(url.hostname) && (url.port === '5244' || Boolean(matchingSource));
  if (!matchingSource && !localService) return null;
  const share = rootPath.match(/^\/@s\/([^/]+)(\/.*)?$/i);
  return {
    baseUrl,
    rootPath,
    sourceId: matchingSource?.id || '',
    sourceUrl: url.toString(),
    isShare: Boolean(share),
    shareId: share?.[1] || '',
    sharePath: share?.[2] || '/',
    title: extracted.title || rootPath.split('/').filter(Boolean).pop() || 'OpenList 目录'
  };
}

function parseBiliVideoUrl(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!/^https?:\/\//i.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
  const bvid = url.pathname.match(/\/(BV[0-9A-Za-z]+)/i)?.[1];
  if (!bvid) return null;
  const page = Math.max(1, Number(url.searchParams.get('p') || 1));
  const canonicalUrl = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`;
  return { bvid, page, canonicalUrl, title: extracted.title || '' };
}

function normalizeBiliUserSearchResults(data) {
  const results = Array.isArray(data?.result) ? data.result : [];
  return results
    .filter((item) => item && item.mid && item.uname)
    .map((item) => {
      const avatar = String(item.upic || '');
      return {
        mid: String(item.mid),
        name: String(item.uname),
        description: String(item.usign || item.official_verify?.desc || ''),
        avatar: avatar.startsWith('//') ? `https:${avatar}` : avatar,
        followers: Math.max(0, Number(item.fans || 0)),
        videos: Math.max(0, Number(item.videos || 0)),
        verified: String(item.official_verify?.desc || '')
      };
    });
}

function parseBiliUserInput(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return '';
    return url.hostname.toLowerCase() === 'space.bilibili.com'
      ? (url.pathname.match(/^\/(\d+)/)?.[1] || '')
      : '';
  } catch { return ''; }
}

function extractResourceInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { value: '', title: '' };

  const tableCells = /^\s*\|/.test(text)
    ? text.split('|').map((cell) => cell.trim()).filter(Boolean)
    : [];
  let title = tableCells[0] || '';

  const markdownLink = text.match(/\[([^\]]+)\]\(\s*((?:https?:\/\/|jv:\/\/)[^)\s]+)\s*\)/i);
  if (markdownLink) {
    return {
      value: markdownLink[2].trim(),
      title: title || markdownLink[1].trim()
    };
  }

  const angleLink = text.match(/<((?:https?:\/\/|jv:\/\/)[^>\s]+)>/i);
  if (angleLink) return { value: angleLink[1].trim(), title };

  if (tableCells.length) {
    const structured = tableCells.find((cell) => /^(?:https?:\/\/|jv:\/\/|anki\s*:|[a-zA-Z]:[\\/]|\\\\)/i.test(cell));
    if (structured) return { value: structured.trim(), title };
  }

  const bareLink = text.match(/(?:https?:\/\/|jv:\/\/)[^\s|<>]+/i);
  if (bareLink) return { value: bareLink[0].replace(/[),.;，。；]+$/, ''), title };

  return { value: text, title: '' };
}

function inferResource(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!value) throw new Error('资源内容不能为空。');
  const anki = value.match(/^anki\s*:\s*(.+)$/i);
  if (anki) {
    const deck = anki[1].trim();
    return { kind: 'anki', title: extracted.title || deck, canonicalKey: `anki:${deck.toLowerCase()}`, launcher: { type: 'anki', deck } };
  }
  if (/^jv:\/\//i.test(value)) {
    return { kind: 'video', title: extracted.title || '视频资源', canonicalKey: `uri:${value}`, launcher: { type: 'uri', uri: value } };
  }
  if (/^https?:\/\//i.test(value)) {
    const openList = parseOpenListUrl(raw);
    if (openList) {
      return {
        kind: 'openlist-folder',
        title: openList.title,
        canonicalKey: `openlist-folder:${openList.baseUrl}:${openList.rootPath.toLowerCase()}`,
        launcher: { type: 'openlist-folder', baseUrl: openList.baseUrl, rootPath: openList.rootPath },
        metadata: openList
      };
    }
    const bili = parseBiliVideoUrl(raw);
    if (bili) {
      return {
        kind: 'video',
        title: bili.title || bili.bvid,
        canonicalKey: `bili:${bili.bvid.toUpperCase()}:p${bili.page}`,
        launcher: { type: 'potplayer', target: bili.canonicalUrl },
        metadata: { bvid: bili.bvid, page: bili.page, originalUrl: bili.canonicalUrl }
      };
    }
    const normalized = normalizeUrl(value);
    let title = extracted.title || normalized;
    try { title = new URL(normalized).hostname; } catch { /* keep input */ }
    if (extracted.title) title = extracted.title;
    const extension = normalized.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    const kind = ['pdf'].includes(extension) ? 'pdf' : /bilibili\.com|youtube\.com|youtu\.be|\.mp4(?:$|[?#])|\.mkv(?:$|[?#])/i.test(normalized) ? 'video' : 'web';
    return { kind, title, canonicalKey: `url:${normalized.toLowerCase()}`, launcher: { type: 'uri', uri: normalized } };
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    const normalized = value.replace(/\//g, '\\');
    const name = normalized.split('\\').filter(Boolean).pop() || normalized;
    const extension = name.split('.').pop()?.toLowerCase();
    const kind = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension) ? 'video' : extension === 'pdf' ? 'pdf' : 'file';
    return { kind, title: extracted.title || name, canonicalKey: `file:${normalized.toLowerCase()}`, launcher: { type: 'file', path: normalized } };
  }
  throw new Error(`暂时无法识别：${value}`);
}

function resolveResourceActions(resource, sources = {}) {
  const launcher = objectOr(resource?.launcher);
  const metadata = objectOr(resource?.metadata);
  const source = sourceForResource(resource, sources);
  const actions = { webTarget: null, playTarget: null, defaultTarget: null };

  if (launcher.type === 'openlist') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.playTarget = { type: 'openlist', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    const baseUrl = String(source?.baseUrl || '').replace(/\/+$/, '');
    if (metadata.sourceUrl) actions.webTarget = String(metadata.sourceUrl);
    else if (baseUrl && remotePath) actions.webTarget = `${baseUrl}${remotePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    return actions;
  }

  if (launcher.type === 'openlist-file') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.defaultTarget = { type: 'openlist-file', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    return actions;
  }

  if (launcher.type === 'potplayer') {
    actions.playTarget = { type: 'potplayer', target: launcher.target };
    actions.webTarget = String(metadata.sourceUrl || metadata.originalUrl || (/^https?:\/\//i.test(launcher.target || '') ? launcher.target : '')) || null;
    return actions;
  }

  if (launcher.type === 'file') {
    const extension = String(launcher.path || '').split('.').pop()?.toLowerCase();
    if (resource?.kind === 'video' || ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension)) {
      actions.playTarget = { type: 'potplayer', target: launcher.path };
    } else actions.defaultTarget = { type: 'file', path: launcher.path };
    return actions;
  }

  if (launcher.type === 'anki') {
    actions.defaultTarget = { type: 'anki', deck: launcher.deck };
    return actions;
  }

  if (launcher.type === 'uri' || launcher.uri) {
    const uri = String(launcher.uri || '');
    const bili = parseBiliVideoUrl(uri);
    if (bili) {
      actions.webTarget = bili.canonicalUrl;
      actions.playTarget = { type: 'potplayer', target: bili.canonicalUrl };
    } else if (/^https?:\/\//i.test(uri)) actions.webTarget = uri;
    else actions.defaultTarget = { type: 'uri', uri };
  }
  return actions;
}

function legacyBiliHomepageResources(state) {
  const sources = Object.values(objectOr(state?.sources)).filter((source) => source.type === 'bilibili' && !source.deletedAt);
  const keys = new Set(sources.flatMap((source) => [source.homepage, source.mid ? `https://space.bilibili.com/${source.mid}` : ''].filter(Boolean).map((value) => String(value).replace(/\/+$/, '').toLowerCase())));
  return Object.values(objectOr(state?.resources)).filter((resource) => {
    if (resource.deletedAt) return false;
    const uri = String(resource.launcher?.uri || resource.metadata?.originalUrl || '').replace(/\/+$/, '').toLowerCase();
    return keys.has(uri) || (resource.sourceId && sources.some((source) => source.id === resource.sourceId) && /^https:\/\/space\.bilibili\.com\/\d+$/i.test(uri));
  });
}

function addResource(state, moduleId, input, titleOverride = '') {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id]);
  return { resource, reused: Boolean(duplicate), linked: linked.linkedResourceIds.includes(resource.id) };
}

function addInboxResource(state, input, titleOverride = '') {
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(duplicate), inboxAdded };
}

function upsertResourceDescriptor(state, moduleId, descriptor) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id], { rootPath: descriptor.metadata?.rootPath });
  return { resource, reused: Boolean(existing), linked: linked.linkedResourceIds.includes(resource.id) };
}

function upsertInboxDescriptor(state, descriptor) {
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(existing), inboxAdded };
}

function linkResourceToModule(state, moduleId, resourceId, options = {}) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module) throw new Error('找不到目标模块。');
  if (!resource || resource.deletedAt) throw new Error('找不到可用资源。');
  linkResourcesToModule(state, moduleId, [resourceId], options);
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function archiveProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = at.toISOString();
  project.updatedAt = at.toISOString();
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  return project;
}

function restoreProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = '';
  project.updatedAt = at.toISOString();
  return project;
}

function referencedResourceIds(state) {
  const referenced = new Set(state.inbox || []);
  for (const module of Object.values(state.modules)) {
    if (module.deletedAt) continue;
    for (const resourceId of module.resourceIds || []) referenced.add(resourceId);
  }
  for (const plan of Object.values(state.plans)) {
    if (plan.deletedAt || plan.archivedAt || plan.targetType !== 'resource') continue;
    for (const resourceId of plan.targetIds || []) referenced.add(resourceId);
  }
  for (const note of Object.values(state.notes)) {
    if (note.deletedAt) continue;
    if (note.resourceId) referenced.add(note.resourceId);
    for (const resourceId of note.resourceIds || []) referenced.add(resourceId);
  }
  for (const entry of state.activity || []) {
    if (entry?.resourceId) referenced.add(entry.resourceId);
  }
  for (const resource of Object.values(state.resources)) {
    if (resource.lastOpenedAt || resource.completedAt) referenced.add(resource.id);
  }
  return referenced;
}

function orphanResources(state) {
  const referenced = referencedResourceIds(state);
  return Object.values(state.resources).filter((resource) => !resource.deletedAt && !referenced.has(resource.id));
}

function orphanCleanupPreview(state) {
  const active = Object.values(state.resources).filter((resource) => !resource.deletedAt);
  const candidates = orphanResources(state);
  const index = buildResourcePickerIndex(candidates, state.sources);
  return {
    totalActive: active.length,
    candidateCount: candidates.length,
    retainedCount: active.length - candidates.length,
    candidates,
    groups: index.groups
  };
}

function deleteOrphanResources(state, candidateIds = null) {
  const referenced = referencedResourceIds(state);
  const candidates = candidateIds ? new Set(candidateIds) : null;
  const removedIds = [];
  for (const [resourceId, resource] of Object.entries(state.resources)) {
    if (referenced.has(resourceId) || (candidates && !candidates.has(resourceId))) continue;
    delete state.resources[resourceId];
    removedIds.push(resourceId);
  }
  state.inbox = (state.inbox || []).filter((resourceId) => state.resources[resourceId]);
  return removedIds;
}

function deleteProject(state, projectId, options = {}) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  const moduleIds = new Set(Object.values(state.modules).filter((module) => module.projectId === projectId).map((module) => module.id));
  const candidateResourceIds = new Set();
  for (const moduleId of moduleIds) {
    for (const resourceId of state.modules[moduleId]?.resourceIds || []) candidateResourceIds.add(resourceId);
  }
  for (const [groupId, group] of Object.entries(objectOr(state.resourceGroups))) {
    if (moduleIds.has(group.moduleId)) delete state.resourceGroups[groupId];
  }
  for (const moduleId of moduleIds) delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  for (const moduleId of moduleIds) delete state.modules[moduleId];
  for (const [planId, plan] of Object.entries(state.plans)) {
    if (plan.projectId === projectId || (plan.targetType === 'module' && plan.targetIds?.some((id) => moduleIds.has(id)))) delete state.plans[planId];
  }
  for (const [noteId, note] of Object.entries(state.notes)) {
    if (note.projectId === projectId) delete state.notes[noteId];
  }
  const vaultRefIds = [...(project.vaultRefIds || [])];
  delete state.projects[projectId];
  for (const vaultRefId of vaultRefIds) {
    const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
    if (!stillReferenced) delete state.vaultRefs[vaultRefId];
  }
  delete state.uiState.collapsedTodayProjects[projectId];
  delete state.uiState.projectPanelCollapsedByProject[projectId];
  delete state.uiState.projectRecentCollapsedByProject[projectId];
  delete state.uiState.projectBoardLayouts[projectId];
  state.uiState.todayProjectOrder = uniqueStrings(state.uiState.todayProjectOrder).filter((id) => id !== projectId);
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  // 保留旧 API 的显式孤立资源清理语义；Vault 引用清理始终只删索引，不操作真实文件。
  const removedResourceIds = options.deleteOrphans ? deleteOrphanResources(state, candidateResourceIds) : [];
  return { project, removedModuleCount: moduleIds.size, removedResourceIds };
}

function recordLastAction(state, action) {
  state.uiState.lastAction = action ? { ...action, at: action.at || nowIso() } : null;
  return state.uiState.lastAction;
}

function undoLastAction(state) {
  const action = state.uiState.lastAction;
  if (!action) return { undone: false, removedResourceIds: [] };
  if (action.type === 'link-vault-refs') {
    const project = state.projects[action.projectId];
    if (!project || project.deletedAt) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    let unlinkedVaultRefCount = 0;
    for (const vaultRefId of action.linkedVaultRefIds || []) {
      const result = unlinkVaultRefFromProject(state, action.projectId, vaultRefId);
      if (result.removed) unlinkedVaultRefCount += 1;
    }
    for (const snapshot of action.reusedVaultRefSnapshots || []) {
      state.vaultRefs[snapshot.id] = { ...snapshot };
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], unlinkedVaultRefCount };
  }
  if (action.type === 'project-board-layout') {
    if (!state.projects[action.projectId]) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[action.projectId] = normalizeProjectBoardLayout(
      action.layoutBefore,
      state,
      action.projectId,
      state.uiState.projectPanelOrder
    );
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredProjectBoardLayout: true };
  }
  if (action.type === 'auto-group-resources') {
    const module = state.modules[action.moduleId];
    if (!module) { state.uiState.lastAction = null; return { undone: false, action, removedResourceIds: [], reason: 'module-missing' }; }
    for (const group of moduleResourceGroups(state, module.id).filter((candidate) => candidate.autoGroupKey === action.autoGroupKey)) deleteResourceGroup(state, group.id);
    state.resourceGroups = objectOr(state.resourceGroups);
    for (const snapshot of action.resourceGroupSnapshotsBefore || []) state.resourceGroups[snapshot.id] = { ...snapshot, resourceIds: [...(snapshot.resourceIds || [])] };
    const currentIds = moduleResourceGroups(state, module.id).map((group) => group.id);
    module.resourceGroupIds = [...new Set([...(action.moduleResourceGroupIdsBefore || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id), ...currentIds])];
    const collapsed = objectOr(state.uiState.collapsedResourceGroupsByModule?.[module.id]);
    for (const groupId of action.autoGroupIdsAfter || []) delete collapsed[groupId];
    Object.assign(collapsed, objectOr(action.collapsedBefore));
    state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
    if (Object.keys(collapsed).length) state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    else delete state.uiState.collapsedResourceGroupsByModule[module.id];
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredResourceGroupCount: (action.resourceGroupSnapshotsBefore || []).length };
  }
  if (action.type === 'delete-module') {
    const module = action.moduleSnapshot;
    const groupConflict = (action.resourceGroupSnapshots || []).some((group) => state.resourceGroups[group.id]);
    if (!module || state.modules[module.id] || !state.projects[module.projectId] || groupConflict) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: groupConflict ? 'group-restore-conflict' : 'restore-conflict' };
    }
    state.modules[module.id] = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
    const project = state.projects[module.projectId];
    project.moduleIds = [...new Set([...(project.moduleIds || []), module.id])];
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[module.projectId] = normalizeProjectBoardLayout(
      action.projectBoardLayoutBefore,
      state,
      module.projectId,
      state.uiState.projectPanelOrder
    );
    project.updatedAt = nowIso();
    let restoredPlanCount = 0;
    for (const plan of action.planSnapshots || []) {
      if (state.plans[plan.id]) continue;
      state.plans[plan.id] = { ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule };
      restoredPlanCount += 1;
    }
    state.resourceGroups = objectOr(state.resourceGroups);
    let restoredResourceGroupCount = 0;
    for (const group of action.resourceGroupSnapshots || []) {
      state.resourceGroups[group.id] = { ...group, resourceIds: [...(group.resourceIds || [])] };
      restoredResourceGroupCount += 1;
    }
    state.modules[module.id].resourceGroupIds = (state.modules[module.id].resourceGroupIds || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id);
    const collapsed = {};
    for (const [groupId, value] of Object.entries(objectOr(action.collapsedResourceGroups))) {
      if (state.resourceGroups[groupId]?.moduleId === module.id) collapsed[groupId] = Boolean(value);
    }
    if (Object.keys(collapsed).length) {
      state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
      state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredModuleCount: 1, restoredPlanCount, restoredResourceGroupCount };
  }
  const moduleAffected = new Set(action.linkedResourceIds ?? action.resourceIds ?? []);
  const inboxAffected = new Set(action.inboxAddedResourceIds ?? action.resourceIds ?? []);
  if (action.type === 'add-resources') {
    if (action.moduleId && state.modules[action.moduleId]) {
      removeResourcesFromModule(state, action.moduleId, [...moduleAffected]);
    }
    if (action.inbox) state.inbox = (state.inbox || []).filter((id) => !inboxAffected.has(id));
    if (action.restoreInboxIds?.length) state.inbox = [...new Set([...(state.inbox || []), ...action.restoreInboxIds.filter((id) => state.resources[id])])];
    for (const groupId of action.createdResourceGroupIds || []) {
      const group = state.resourceGroups[groupId];
      if (group && group.moduleId === action.moduleId && !(group.resourceIds || []).length) deleteResourceGroup(state, groupId);
    }
  }
  const removedResourceIds = deleteOrphanResources(state, action.createdResourceIds || []);
  state.uiState.lastAction = null;
  return { undone: true, action, removedResourceIds };
}

function trashResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function restoreResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = '';
  resource.updatedAt = at.toISOString();
  return resource;
}

function upsertSource(state, input) {
  const type = String(input?.type || '').trim();
  if (!type) throw new Error('来源类型不能为空。');
  const identity = String(input.identity || input.baseUrl || input.path || input.endpoint || input.mid || type).trim().toLowerCase();
  const existing = Object.values(state.sources).find((source) => source.type === type && source.identity === identity && !source.deletedAt);
  const timestamp = nowIso();
  const source = existing || {
    id: createId('source'),
    type,
    identity,
    createdAt: timestamp,
    deletedAt: ''
  };
  Object.assign(source, input, { id: source.id, type, identity, updatedAt: timestamp });
  state.sources[source.id] = source;
  return { source, reused: Boolean(existing) };
}

function createPlanForTarget(state, projectId, targetType, targetId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  if (targetType === 'module' && !state.modules[targetId]) throw new Error('找不到目标模块。');
  if (targetType === 'resource' && !state.resources[targetId]) throw new Error('找不到目标资源。');
  const existing = Object.values(state.plans).find((plan) => plan.projectId === projectId && plan.targetType === targetType && plan.targetIds?.includes(targetId) && !plan.deletedAt && !plan.archivedAt);
  if (existing) return { plan: existing, reused: true };
  const id = createId('plan');
  const timestamp = nowIso();
  const plan = {
    id,
    projectId,
    title: String(title || '学习计划').trim(),
    targetType,
    targetIds: [targetId],
    schedule: { type: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 0] },
    dailyTarget: 1,
    resetHour: 4,
    history: {},
    sortOrder: projectPlans(state, projectId).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.plans[id] = plan;
  return { plan, reused: false };
}

function studyDate(now = new Date(), resetHour = 4) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(resetHour || 0));
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function planScheduledFor(plan, now = new Date()) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(plan?.resetHour || 0));
  const weekdays = Array.isArray(plan?.schedule?.weekdays) && plan.schedule.weekdays.length
    ? plan.schedule.weekdays.map(Number)
    : [1, 2, 3, 4, 5, 6, 0];
  return weekdays.includes(shifted.getDay());
}

function planProgress(plan, now = new Date()) {
  const key = studyDate(now, plan.resetHour);
  const entry = objectOr(plan.history?.[key]);
  const completed = Math.max(0, Number(entry.completed || 0));
  const target = Math.max(1, Number(plan.dailyTarget || 1));
  return { key, completed, target, done: completed >= target };
}

function incrementPlan(state, planId, delta = 1, now = new Date()) {
  const plan = state.plans[planId];
  if (!plan) throw new Error('找不到学习计划。');
  const progress = planProgress(plan, now);
  plan.history = objectOr(plan.history);
  plan.history[progress.key] = {
    completed: Math.max(0, Math.min(progress.target, progress.completed + Number(delta || 0))),
    updatedAt: now.toISOString()
  };
  plan.updatedAt = now.toISOString();
  return planProgress(plan, now);
}

function markResourceOpened(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.lastOpenedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.activity.push({ id: createId('activity'), type: 'resource-opened', resourceId, at: at.toISOString() });
  state.activity = state.activity.slice(-500);
  return resource;
}

function toggleResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.completedAt = resource.completedAt ? '' : at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

function markResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  if (!resource.completedAt) resource.completedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

module.exports = {
  SCHEMA_VERSION,
  activeProjects,
  addInboxResource,
  addResource,
  autoGroupResources,
  archiveProject,
  archiveModule,
  buildResourcePickerIndex,
  createId,
  createModule,
  createPlanForTarget,
  createProjectMemo,
  createProject,
  createResourceGroup,
  deleteProjectMemo,
  deleteOrphanResources,
  deleteProject,
  deleteModule,
  deleteResourceGroup,
  defaultState,
  defaultResourceAutoGroupEnabled,
  extractResourceInput,
  incrementPlan,
  inferResource,
  ensureProjectBoardLayout,
  linkResourceToModule,
  linkResourcesToModule,
  linkVaultEntriesToProject,
  linkVaultRefToProject,
  markResourceOpened,
  markResourceComplete,
  markVaultRefMissing,
  moveModule,
  moveTodayProjectBefore,
  moveTodaySidebarCardBefore,
  moveProjectBoardItem,
  moveResourceGroup,
  moveResourceToGroup,
  moveResourcesToGroup,
  moduleResources,
  moduleResourceGroups,
  moduleResourceRoot,
  normalizeState,
  validateExternalUri,
  normalizeVaultPath,
  normalizeOpenListBaseUrl,
  openListImportRoot,
  normalizeOpenListPath,
  normalizeBiliUserSearchResults,
  orphanCleanupPreview,
  parseBiliUserInput,
  orphanResources,
  parseBiliVideoUrl,
  parseOpenListUrl,
  planScheduledFor,
  planProgress,
  projectModules,
  projectBoardItems,
  projectPlans,
  projectVaultRefs,
  recordRecentVaultCreatePath,
  recordLastAction,
  removeResourcesFromModule,
  renameResourceGroup,
  resourcePickerGroupInfo,
  resourceGroupProgress,
  resourceGroupTitle,
  resourceFolderPath,
  renameProject,
  resetProjectBoardLayout,
  resolveResourceActions,
  legacyBiliHomepageResources,
  restoreProject,
  restoreModule,
  restoreResource,
  restoreVaultRef,
  setProjectRecentCollapsed,
  setProjectMemo,
  setProjectPanelCollapsed,
  setProjectPanelOrder,
  setResourceGroupCollapsed,
  studyDate,
  todayProjects,
  trashResource,
  toggleResourceComplete,
  togglePinnedVaultRef,
  togglePinnedVaultCreatePath,
  undoLastAction,
  updateProjectMemo,
  updateProjectMemoTitle,
  upsertResourceDescriptor,
  upsertInboxDescriptor,
  unlinkVaultRefFromProject,
  updateVaultRefPath,
  upsertSource,
  upsertVaultRef
};

},
"native-potplayer.cjs": (module, exports, require) => {
'use strict';

const { execFile } = require('node:child_process');
const { clipboard } = require('electron');

const DEFAULT_IMMERSIVE_SHORTCUTS = Object.freeze({
  position: 'Alt+1',
  capture: 'Alt+2',
  note: 'Alt+3',
  captureNote: 'Alt+4'
});

const POTPLAYER_PROCESS_NAMES = ['PotPlayerMini64', 'PotPlayerMini'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function immersiveShortcuts(plugin) {
  const saved = plugin?.state?.uiState?.immersiveShortcuts;
  return {
    ...DEFAULT_IMMERSIVE_SHORTCUTS,
    ...(saved && typeof saved === 'object' ? saved : {})
  };
}

function normalizeShortcut(value, fallback = '') {
  const shortcut = String(value || '').trim();
  if (!shortcut) return fallback;
  if (shortcut.length > 40 || /[\r\n\t]/.test(shortcut)) throw new Error('快捷键格式无效。');
  return shortcut;
}

function powershellExecutable(env = process.env) {
  const root = String(env.SystemRoot || env.WINDIR || 'C:\\Windows');
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

function runPowerShell(script, options = {}) {
  const exec = options.execFile || execFile;
  const executable = options.executable || powershellExecutable(options.env || process.env);
  return new Promise((resolve, reject) => {
    exec(executable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', script
    ], {
      windowsHide: true,
      timeout: Number(options.timeoutMs || 4000),
      maxBuffer: 64 * 1024,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || error).trim();
        reject(new Error(detail || 'Windows PotPlayer 控制失败。'));
        return;
      }
      const raw = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      if (!raw) return reject(new Error('PotPlayer 没有返回状态。'));
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error(`PotPlayer 返回了无法解析的状态：${raw.slice(0, 160)}`)); }
    });
  });
}

function potPlayerProbeScript(options = {}) {
  const pause = options.pause ? '$true' : '$false';
  const play = options.play ? '$true' : '$false';
  const foregroundOnly = options.foregroundOnly === false ? '$false' : '$true';
  const copyPath = options.copyPath ? '$true' : '$false';
  const capture = options.capture ? '$true' : '$false';
  const names = POTPLAYER_PROCESS_NAMES.map((name) => `'${name.replace(/'/g, "''")}'`).join(',');
  return `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GoStudyWin32 {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool PostMessage(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$names = @(${names})
$proc = Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw 'PotPlayer 当前没有运行。' }
$hwnd = [IntPtr]$proc.MainWindowHandle
$foreground = [GoStudyWin32]::GetForegroundWindow()
if (${foregroundOnly} -and $foreground -ne $hwnd) { throw 'PotPlayer 当前不是前台窗口。' }
$positionMs = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20484, [IntPtr]0).ToInt64()
$status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
$initialStatus = $status
$pausedByGoStudy = $false
if (${pause} -and $status -eq 2) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]20000, [IntPtr]0)
  Start-Sleep -Milliseconds 45
  $status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
  $pausedByGoStudy = $true
}
if (${play} -and $status -ne 2) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]20000, [IntPtr]0)
  Start-Sleep -Milliseconds 45
  $status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
}
if (${copyPath}) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]10928, [IntPtr]0)
  Start-Sleep -Milliseconds 140
}
if (${capture}) {
  [void][GoStudyWin32]::SendMessage($hwnd, 273, [IntPtr]10223, [IntPtr]0)
  Start-Sleep -Milliseconds 120
}
[pscustomobject]@{
  ok = $true
  process = $proc.ProcessName
  title = $proc.MainWindowTitle
  positionMs = $positionMs
  status = $status
  initialStatus = $initialStatus
  pausedByGoStudy = $pausedByGoStudy
  foreground = ($foreground -eq $hwnd)
} | ConvertTo-Json -Compress
`;
}

function validateNativeProbe(probe) {
  if (!probe?.ok) throw new Error('PotPlayer 原生控制不可用。');
  const ms = Number(probe.positionMs);
  if (!Number.isFinite(ms) || ms < 0) throw new Error('PotPlayer 当前播放位置无效。');
  return { ...probe, positionMs: ms, positionSeconds: ms / 1000 };
}

async function nativeCurrent(options = {}) {
  if (process.platform !== 'win32' && !options.allowNonWindows) throw new Error('原生 PotPlayer 控制目前只支持 Windows。');
  const clip = options.clipboard || clipboard;
  const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ pause: options.pause, copyPath: true, foregroundOnly: options.foregroundOnly !== false }),
    options
  ));
  await (options.sleep || sleep)(Number(options.clipboardDelayMs || 40));
  const mediaPath = String(clip?.readText?.() || '').trim();
  if (!mediaPath) throw new Error('无法从 PotPlayer 读取当前媒体路径。');
  return {
    ok: true,
    version: 3,
    bridge: 'go-study-native-windows',
    player: 'potplayer',
    transport: 'native-windows',
    control: {
      initialStatus: Number(probe.initialStatus),
      status: Number(probe.status),
      pausedByGoStudy: Boolean(probe.pausedByGoStudy)
    },
    media: {
      path: mediaPath,
      positionSeconds: probe.positionSeconds,
      status: probe.status,
      title: String(probe.title || '')
    }
  };
}

async function nativeCapture(options = {}) {
  const current = await nativeCurrent(options);
  const clip = options.clipboard || clipboard;
  await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ capture: true, foregroundOnly: options.foregroundOnly !== false }),
    options
  );
  await (options.sleep || sleep)(Number(options.captureDelayMs || 50));
  const image = clip?.readImage?.();
  if (!image || image.isEmpty?.()) throw new Error('无法从 PotPlayer 获取当前视频帧。');
  return { ...current, capture: { transport: 'clipboard', cropped: false } };
}

async function nativePlay(options = {}) {
  const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ play: true, foregroundOnly: false }),
    options
  ));
  return {
    ok: true,
    version: 3,
    bridge: 'go-study-native-windows',
    player: 'potplayer',
    transport: 'native-windows',
    status: probe.status
  };
}

async function requestNativePotPlayer(action, options = {}) {
  if (action === 'ping') {
    const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
      potPlayerProbeScript({ foregroundOnly: false }),
      options
    ));
    return {
      ok: true,
      version: 3,
      bridge: 'go-study-native-windows',
      player: 'potplayer',
      transport: 'native-windows',
      status: probe.status
    };
  }
  if (action === 'current') return nativeCurrent(options);
  if (action === 'capture') return nativeCapture(options);
  if (action === 'play') return nativePlay(options);
  throw new Error(`不支持的原生 PotPlayer 操作：${String(action || '')}`);
}

function resolveElectronGlobalShortcut(options = {}) {
  if (options.globalShortcut) return options.globalShortcut;
  try {
    const electron = require('electron');
    if (electron.globalShortcut?.register) return electron.globalShortcut;
  } catch {}
  try {
    const remote = require('@electron/remote');
    const mainElectron = remote.require('electron');
    if (mainElectron?.globalShortcut?.register) return mainElectron.globalShortcut;
  } catch {}
  return null;
}

module.exports = {
  DEFAULT_IMMERSIVE_SHORTCUTS,
  POTPLAYER_PROCESS_NAMES,
  immersiveShortcuts,
  nativeCapture,
  nativeCurrent,
  nativePlay,
  normalizeShortcut,
  potPlayerProbeScript,
  powershellExecutable,
  requestNativePotPlayer,
  resolveElectronGlobalShortcut,
  runPowerShell,
  sleep,
  validateNativeProbe
};

},
"note-target.cjs": (module, exports, require) => {
'use strict';

function isEditableMarkdownEditor(editor) {
  return !!editor && typeof editor.replaceSelection === 'function';
}

function normalizeFilePath(file) {
  return String(file?.path || '').trim();
}

function rememberNoteTarget(plugin, editor, file) {
  if (!plugin || !isEditableMarkdownEditor(editor)) return false;
  const filePath = normalizeFilePath(file);
  if (!filePath) return false;
  plugin._goStudyNoteTarget = {
    editor,
    filePath,
    rememberedAt: Date.now()
  };
  return true;
}

function captureActiveNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  const active = workspace?.activeEditor;
  const editor = active?.editor;
  const file = active?.file || workspace?.getActiveFile?.();
  return rememberNoteTarget(plugin, editor, file);
}

function markdownLeaves(workspace) {
  if (!workspace?.getLeavesOfType) return [];
  try { return workspace.getLeavesOfType('markdown') || []; }
  catch { return []; }
}

function targetLeaf(workspace, target) {
  if (!target?.filePath || !target?.editor) return null;
  return markdownLeaves(workspace).find((leaf) => {
    const view = leaf?.view;
    return String(view?.file?.path || '') === target.filePath
      && view?.editor === target.editor
      && isEditableMarkdownEditor(view.editor);
  }) || null;
}

function resolveCompanionNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  const target = plugin?._goStudyCompanionTarget;
  if (!target?.locked || !target.filePath || !isEditableMarkdownEditor(target.editor)) return null;
  const leaf = target.leaf;
  const view = leaf?.view;
  const valid = String(view?.file?.path || '') === target.filePath
    && view?.editor === target.editor
    && isEditableMarkdownEditor(view.editor);
  if (!valid) {
    plugin._goStudyCompanionTarget = null;
    return null;
  }
  return {
    editor: target.editor,
    filePath: target.filePath,
    source: 'companion'
  };
}

function resolveRememberedNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  const companion = resolveCompanionNoteTarget(plugin);
  if (companion) return companion;
  const active = workspace?.activeEditor;
  if (isEditableMarkdownEditor(active?.editor) && normalizeFilePath(active?.file || workspace?.getActiveFile?.())) {
    rememberNoteTarget(plugin, active.editor, active.file || workspace.getActiveFile?.());
    return {
      editor: active.editor,
      filePath: normalizeFilePath(active.file || workspace.getActiveFile?.()),
      source: 'active'
    };
  }

  const target = plugin?._goStudyNoteTarget;
  const leaf = targetLeaf(workspace, target);
  if (!leaf) {
    if (plugin) plugin._goStudyNoteTarget = null;
    throw new Error('最近的学习笔记已经关闭或不可编辑，请先打开一个可编辑的 Markdown 笔记，并把光标放到目标正文中。');
  }
  return {
    editor: target.editor,
    filePath: target.filePath,
    source: 'remembered'
  };
}

function registerRememberedNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  if (!workspace?.on) return false;

  captureActiveNoteTarget(plugin);

  const onActiveLeafChange = () => {
    captureActiveNoteTarget(plugin);
  };
  const onEditorChange = (editor, info) => {
    const file = info?.file || workspace.activeEditor?.file || workspace.getActiveFile?.();
    rememberNoteTarget(plugin, editor, file);
  };
  const onFileOpen = () => {
    captureActiveNoteTarget(plugin);
  };

  for (const [event, handler] of [
    ['active-leaf-change', onActiveLeafChange],
    ['editor-change', onEditorChange],
    ['file-open', onFileOpen]
  ]) {
    try {
      const ref = workspace.on(event, handler);
      if (ref && typeof plugin.registerEvent === 'function') plugin.registerEvent(ref);
    } catch {
      // Older Obsidian versions may not expose every workspace event.
    }
  }
  return true;
}

module.exports = {
  captureActiveNoteTarget,
  isEditableMarkdownEditor,
  markdownLeaves,
  normalizeFilePath,
  registerRememberedNoteTarget,
  rememberNoteTarget,
  resolveCompanionNoteTarget,
  resolveRememberedNoteTarget,
  targetLeaf
};

},
"potplayer-bridge.cjs": (module, exports, require) => {
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BRIDGE_BASE_URL = 'http://127.0.0.1:33661';
const BRIDGE_VERSION = 2;
const BRIDGE_HTTP_VERSION = 1;
const BRIDGE_REQUEST_TIMEOUT_MS = 5000;
const BRIDGE_FILE_POLL_MS = 50;
const BRIDGE_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const ROUTES = new Map([
  ['ping', { method: 'GET', path: '/v1/ping' }],
  ['current', { method: 'POST', path: '/v1/current' }],
  ['capture', { method: 'POST', path: '/v1/capture' }]
]);

function bridgeDataDir(env = process.env) {
  const localAppData = String(env?.LOCALAPPDATA || '').trim();
  if (!localAppData) throw new Error('找不到 Windows LOCALAPPDATA，无法访问 Go Study Bridge。');
  return path.join(localAppData, 'GoStudy');
}

function bridgeTokenPath(env = process.env) {
  return path.join(bridgeDataDir(env), 'bridge-token.txt');
}

function bridgeRequestDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'requests');
}

function bridgeResponseDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'responses');
}

function normalizeBridgeToken(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!BRIDGE_TOKEN_PATTERN.test(token)) throw new Error('Go Study Bridge 配对令牌无效，请重启 Bridge 重新生成。');
  return token;
}

function readBridgeToken(options = {}) {
  const readFileSync = options.readFileSync || fs.readFileSync;
  const tokenPath = options.tokenPath || bridgeTokenPath(options.env || process.env);
  let raw;
  try { raw = readFileSync(tokenPath, 'utf8'); }
  catch { throw new Error('没有找到 Go Study Bridge 配对令牌，请先启动新版 markdown2potplayer Bridge。'); }
  return normalizeBridgeToken(raw);
}

function normalizeBridgeMedia(value) {
  const media = value && typeof value === 'object' ? value : {};
  const mediaPath = String(media.path || '').trim();
  if (!mediaPath) throw new Error('Go Study Bridge 没有返回当前媒体地址。');
  const positionSeconds = Number(media.positionSeconds);
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) throw new Error('Go Study Bridge 返回了无效播放位置。');
  const positionMs = Number(media.positionMs);
  return {
    path: mediaPath,
    title: String(media.title || ''),
    positionSeconds,
    positionMs: Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : positionSeconds * 1000
  };
}

function bridgePayloadOk(value) {
  return value === true || value === 1 || value === '1';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUnlink(filePath, unlinkSync = fs.unlinkSync) {
  try { unlinkSync(filePath); }
  catch {}
}

function parseBridgeJsonText(value) {
  const text = String(value ?? '').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function normalizeBridgePayload(payload, route, version = BRIDGE_VERSION) {
  const body = payload && typeof payload === 'object' ? payload : {};
  if (!bridgePayloadOk(body.ok)) {
    const error = String(body.error || 'unknown_error');
    if (error === 'invalid_token') throw new Error('Go Study Bridge 配对失败：本机令牌不匹配，请重启 Bridge 后重试。');
    if (error === 'version_mismatch') throw new Error(`Go Study Bridge 版本不兼容，需要协议 v${version}。`);
    throw new Error(`Go Study Bridge 请求失败：${error}`);
  }
  if (Number(body.version) !== version) throw new Error(`Go Study Bridge 版本不兼容：${String(body.version || '未知')}。`);

  if (route === 'ping') {
    return {
      ok: true,
      version,
      bridge: String(body.bridge || ''),
      player: String(body.player || ''),
      transport: String(body.transport || '')
    };
  }

  const media = normalizeBridgeMedia(body.media);
  if (route === 'capture') {
    if (body.capture?.transport !== 'clipboard') throw new Error('Go Study Bridge 截图传输方式不受支持。');
    return { ok: true, media, capture: { transport: 'clipboard', cropped: body.capture?.cropped !== false } };
  }
  return { ok: true, media };
}

async function requestPotPlayerBridgeFile(route, options = {}) {
  if (!ROUTES.has(String(route || ''))) throw new Error('不允许的 Go Study Bridge 操作。');
  const env = options.env || process.env;
  const token = normalizeBridgeToken(options.token || readBridgeToken({ ...options, env }));
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : BRIDGE_REQUEST_TIMEOUT_MS;
  const pollMs = Number.isFinite(Number(options.pollMs)) && Number(options.pollMs) > 0
    ? Number(options.pollMs)
    : BRIDGE_FILE_POLL_MS;
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  const writeFileSync = options.writeFileSync || fs.writeFileSync;
  const renameSync = options.renameSync || fs.renameSync;
  const readFileSync = options.readFileSync || fs.readFileSync;
  const existsSync = options.existsSync || fs.existsSync;
  const unlinkSync = options.unlinkSync || fs.unlinkSync;
  const requests = options.requestDir || bridgeRequestDir(env);
  const responses = options.responseDir || bridgeResponseDir(env);
  mkdirSync(requests, { recursive: true });
  mkdirSync(responses, { recursive: true });

  const requestId = String(options.requestId || crypto.randomBytes(12).toString('hex')).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(requestId)) throw new Error('Go Study Bridge 请求 ID 无效。');
  const requestPath = path.join(requests, `${requestId}.json`);
  const tempPath = path.join(requests, `${requestId}.tmp-${process.pid}-${Date.now()}`);
  const responsePath = path.join(responses, `${requestId}.json`);
  const requestBody = {
    id: requestId,
    version: BRIDGE_VERSION,
    token,
    action: String(route),
    createdAt: Date.now()
  };

  safeUnlink(requestPath, unlinkSync);
  safeUnlink(responsePath, unlinkSync);
  try {
    writeFileSync(tempPath, JSON.stringify(requestBody), { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, requestPath);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(responsePath)) {
        let payload;
        try { payload = parseBridgeJsonText(readFileSync(responsePath, 'utf8')); }
        catch { throw new Error('Go Study Bridge 返回了损坏的响应文件。'); }
        if (String(payload?.id || '') !== requestId) throw new Error('Go Study Bridge 响应 ID 不匹配。');
        return normalizeBridgePayload(payload, route, BRIDGE_VERSION);
      }
      await sleep(pollMs);
    }
    throw new Error(`Go Study Bridge 请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。File Bridge 没有返回响应，请确认新版 markdown2potplayer 正在运行。`);
  } finally {
    safeUnlink(tempPath, unlinkSync);
    safeUnlink(requestPath, unlinkSync);
    safeUnlink(responsePath, unlinkSync);
  }
}

async function requestWithTimeout(requestPromise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      requestPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Go Study HTTP Bridge 请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestPotPlayerBridgeHttp(requestUrl, route, options = {}) {
  if (typeof requestUrl !== 'function') throw new Error('Obsidian requestUrl 不可用。');
  const spec = ROUTES.get(String(route || ''));
  if (!spec) throw new Error('不允许的 Go Study Bridge 操作。');
  const token = normalizeBridgeToken(options.token || readBridgeToken(options));
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : BRIDGE_REQUEST_TIMEOUT_MS;
  const response = await requestWithTimeout(requestUrl({
    url: `${BRIDGE_BASE_URL}${spec.path}`,
    method: spec.method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    throw: false
  }), timeoutMs);
  const status = Number(response?.status || 0);
  const payload = response?.json && typeof response.json === 'object' ? response.json : {};
  if (status < 200 || status >= 300) throw new Error(`Go Study HTTP Bridge 请求失败：HTTP ${status || '未知'}`);
  return normalizeBridgePayload(payload, route, BRIDGE_HTTP_VERSION);
}

async function requestPotPlayerBridge(_requestUrl, route, options = {}) {
  if (options.transport === 'http') return requestPotPlayerBridgeHttp(_requestUrl, route, options);
  return requestPotPlayerBridgeFile(route, options);
}

module.exports = {
  BRIDGE_BASE_URL,
  BRIDGE_FILE_POLL_MS,
  BRIDGE_HTTP_VERSION,
  BRIDGE_REQUEST_TIMEOUT_MS,
  BRIDGE_TOKEN_PATTERN,
  BRIDGE_VERSION,
  ROUTES,
  bridgeDataDir,
  bridgePayloadOk,
  bridgeRequestDir,
  bridgeResponseDir,
  bridgeTokenPath,
  normalizeBridgeMedia,
  normalizeBridgePayload,
  normalizeBridgeToken,
  parseBridgeJsonText,
  readBridgeToken,
  requestPotPlayerBridge,
  requestPotPlayerBridgeFile,
  requestPotPlayerBridgeHttp,
  requestWithTimeout,
  safeUnlink,
  sleep
};

},
"product-settings-tab.cjs": (module, exports, require) => {
'use strict';

const {
  MarkdownRenderer,
  Notice,
  PluginSettingTab = class {},
  Setting = class {}
} = require('obsidian');
const {
  captureFrameAndInsertLearningPosition,
  checkPotPlayerBridge,
  commandErrorText
} = __rhLoad("learning-capture.cjs");
const { CAPTURE_ACTIONS, HUD_SLOT_LABELS, HUD_SLOT_ORDER } = __rhLoad("capture-actions.cjs");
const {
  HOTKEY_ACTIONS,
  immersiveStatus,
  registerImmersiveHotkeys,
  resetImmersiveShortcuts,
  updateImmersiveShortcut
} = __rhLoad("immersive-hotkeys.cjs");
const { immersiveShortcuts } = __rhLoad("native-potplayer.cjs");
const {
  applyCompanionLayout,
  companionStatusText,
  companionWindowState,
  listCompanionLayouts,
  openCompanionNoteWindow,
  saveCurrentCompanionLayout,
  setCompanionLocked,
  setCompanionScale
} = __rhLoad("companion-note-window.cjs");
const {
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  resetOutputTemplates,
  updateProductSetting
} = __rhLoad("product-settings.cjs");
const {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPlainCaptureMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
  buildPositionMarkdown
} = __rhLoad("resource-note.cjs");

function section(containerEl, title, description = '') {
  const heading = containerEl.createEl('h3', { text: title });
  heading.addClass?.('go-study-settings-heading');
  if (description) containerEl.createEl('p', { text: description, cls: 'setting-item-description' });
}

function videoStatusText(plugin) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return '已关闭。Go Study 不会注册视频笔记快捷键，也不会显示视频增强状态点。';
  const status = immersiveStatus(plugin);
  if (status.registered) return `已就绪 · ${status.registeredAccelerators?.length || 0} 个全局快捷键已注册。`;
  return status.error || '已开启，但当前没有成功注册全局快捷键。';
}

async function setInterfaceTips(plugin, value) {
  plugin.state.uiState ||= {};
  plugin.state.uiState.showInterfaceTips = Boolean(value);
  await plugin.persist();
  await plugin.workbenchLeaf?.view?.render?.();
}

function noteOutputOptions(settings) {
  return {
    timeFormat: settings.timeDisplayFormat,
    backlinkTemplate: settings.backlinkTemplate,
    noteTemplate: settings.noteTemplate,
    captureTemplate: settings.captureTemplate,
    captureNoteTemplate: settings.captureNoteTemplate,
    plainNoteTemplate: settings.plainNoteTemplate,
    plainCaptureTemplate: settings.plainCaptureTemplate,
    plainCaptureNoteTemplate: settings.plainCaptureNoteTemplate
  };
}

function noteOutputPreview(settings) {
  const resource = { id: 'preview-resource', title: '高等数学' };
  const position = { type: 'time', seconds: 754 };
  const options = noteOutputOptions(settings);
  return [
    `Alt+1 · 仅回链\n${buildPositionMarkdown(resource, position, options)}`,
    `Alt+2 · 截图回链\n${buildCaptureMarkdown(resource, position, 'GoStudy/Captures/example.png', options)}`,
    `Alt+3 · 快速笔记\n${buildNotePositionMarkdown(resource, position, '这里老师讲的是极限存在的必要条件。', options)}`,
    `Alt+4 · 截图笔记\n${buildCaptureNoteMarkdown(resource, position, 'GoStudy/Captures/example.png', '这一帧的公式需要重新推导一次。', options)}`,
    `HUD · 纯笔记（不记录时间）\n${buildPlainNoteMarkdown('这是不带时间戳的随手记录。', options)}`,
    `HUD · 仅截图（不记录时间）\n${buildPlainCaptureMarkdown('GoStudy/Captures/example.png', options)}`,
    `HUD · 截图 + 评论（不记录时间）\n${buildPlainCaptureNoteMarkdown('GoStudy/Captures/example.png', '只保存画面和评论。', options)}`
  ].join('\n\n');
}

function templatePreviewMarkdown(key, settings) {
  const resource = { id: 'preview-resource', title: '高等数学' };
  const position = { type: 'time', seconds: 754 };
  const options = noteOutputOptions(settings);
  if (key === 'backlinkTemplate') return buildPositionMarkdown(resource, position, options);
  if (key === 'noteTemplate') return buildNotePositionMarkdown(resource, position, '这里老师讲的是极限存在的必要条件。', options);
  if (key === 'captureTemplate') return buildCaptureMarkdown(resource, position, 'GoStudy/Captures/example.png', options);
  if (key === 'captureNoteTemplate') return buildCaptureNoteMarkdown(resource, position, 'GoStudy/Captures/example.png', '这一帧的公式需要重新推导一次。', options);
  if (key === 'plainNoteTemplate') return buildPlainNoteMarkdown('这是不带时间戳的随手记录。', options);
  if (key === 'plainCaptureTemplate') return buildPlainCaptureMarkdown('GoStudy/Captures/example.png', options);
  if (key === 'plainCaptureNoteTemplate') return buildPlainCaptureNoteMarkdown('GoStudy/Captures/example.png', '只保存画面和评论。', options);
  return '';
}

class GoStudySettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.outputPreviewEl = null;
    this.templatePreviewRefreshers = [];
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.templatePreviewRefreshers = [];
    containerEl.createEl('h2', { text: 'Go Study' });
    containerEl.createEl('p', {
      text: '资源管理保持轻量；视频笔记增强和笔记输出格式都可以按需定制。',
      cls: 'setting-item-description'
    });

    this.renderWorkbenchSettings(containerEl);
    this.renderCompanionWindowSettings(containerEl);
    this.renderVideoSettings(containerEl);
    this.renderNoteOutputSettings(containerEl);
    this.renderDataSettings(containerEl);
  }

  refreshOutputPreview() {
    if (!this.outputPreviewEl) return;
    try {
      this.outputPreviewEl.setText?.(noteOutputPreview(currentProductSettings(this.plugin)));
      if (!this.outputPreviewEl.setText) this.outputPreviewEl.textContent = noteOutputPreview(currentProductSettings(this.plugin));
    } catch (error) {
      const message = commandErrorText('模板预览失败', error);
      this.outputPreviewEl.setText?.(message);
      if (!this.outputPreviewEl.setText) this.outputPreviewEl.textContent = message;
    }
  }

  renderWorkbenchSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '工作台', '控制 Go Study 自身界面行为，不影响资源数据。');

    new Setting(containerEl)
      .setName('显示界面说明')
      .setDesc('在工作台中保留辅助说明文字。关闭后界面更紧凑。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.state.uiState?.showInterfaceTips !== false)
        .onChange(async (value) => {
          await setInterfaceTips(this.plugin, value);
        }));

    new Setting(containerEl)
      .setName('进入工作台时自动收起左侧栏')
      .setDesc('为 Go Study 腾出更大的横向空间；离开插件时仍会恢复原来的侧栏状态。')
      .addToggle((toggle) => toggle
        .setValue(settings.autoCollapseSidebar)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'autoCollapseSidebar', value);
          if (!value) await this.plugin.restoreSidebar?.();
        }));

    new Setting(containerEl)
      .setName('学习时把光标定位到笔记末尾')
      .setDesc('开始学习或继续学习并打开一篇项目笔记时，自动进入编辑状态并把光标放到文件最后一行；关闭后只打开笔记，不改变光标位置。')
      .addToggle((toggle) => toggle
        .setValue(settings.focusStudyNoteAtEnd)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'focusStudyNoteAtEnd', value);
        }));
  }

  renderCompanionWindowSettings(containerEl) {
    const state = companionWindowState(this.plugin);
    const layouts = listCompanionLayouts(this.plugin);
    section(
      containerEl,
      '学习笔记小窗',
      '把真实 Markdown 笔记弹成一个极简窄窗，适合覆盖播放器右侧栏；窗口位置、尺寸和缩放会保留。'
    );

    const status = new Setting(containerEl)
      .setName('当前小窗')
      .setDesc(companionStatusText(this.plugin));
    status.addButton((button) => button
      .setButtonText('打开当前笔记')
      .onClick(async () => {
        button.setDisabled(true);
        try {
          await openCompanionNoteWindow(this.plugin, {
            filePath: String(this.app.workspace?.getActiveFile?.()?.path || '')
          });
          new Notice('学习笔记小窗已打开。');
        } catch (error) {
          new Notice(commandErrorText('打开学习笔记小窗失败', error), 6000);
        } finally {
          button.setDisabled(false);
          this.display();
        }
      }));
    status.addButton((button) => button
      .setButtonText('恢复上次')
      .setDisabled(!state.notePath)
      .onClick(async () => {
        button.setDisabled(true);
        try {
          await openCompanionNoteWindow(this.plugin, { preferSaved: true });
          new Notice('已恢复上次学习笔记小窗。');
        } catch (error) {
          new Notice(commandErrorText('恢复学习笔记小窗失败', error), 6000);
        } finally {
          button.setDisabled(false);
          this.display();
        }
      }));

    new Setting(containerEl)
      .setName('锁定为 Capture 目标')
      .setDesc('开启后，即使 PotPlayer 或 Obsidian 主窗口获得焦点，Alt+S 仍优先写入这篇小窗笔记。')
      .addToggle((toggle) => toggle
        .setValue(state.locked)
        .onChange(async (value) => {
          await setCompanionLocked(this.plugin, value);
          this.display();
        }));

    new Setting(containerEl)
      .setName('小窗布局')
      .setDesc('“播放器右侧栏”是默认窄高布局；也可以拖动调整后保存为自定义布局。')
      .addDropdown((dropdown) => {
        for (const layout of layouts) dropdown.addOption(layout.id, layout.name);
        dropdown.setValue(state.activeLayoutId);
        dropdown.onChange(async (value) => {
          try {
            await applyCompanionLayout(this.plugin, value);
            this.display();
          } catch (error) {
            new Notice(commandErrorText('应用小窗布局失败', error), 5000);
          }
        });
      });

    new Setting(containerEl)
      .setName('小窗缩放')
      .setDesc('只压缩小窗里的 Obsidian 编辑区密度，不改变 Markdown 文件本身。')
      .addDropdown((dropdown) => dropdown
        .addOption('0.70', '70% · 极紧凑')
        .addOption('0.80', '80%')
        .addOption('0.82', '82% · 右侧栏推荐')
        .addOption('0.90', '90%')
        .addOption('1', '100%')
        .setValue(String(state.scale))
        .onChange(async (value) => {
          await setCompanionScale(this.plugin, Number(value));
          this.display();
        }));

    new Setting(containerEl)
      .setName('保存当前布局')
      .setDesc('保存当前 x / y / 宽 / 高 / 缩放，之后可以从“布局”下拉框恢复。')
      .addButton((button) => button
        .setButtonText('保存为自定义布局')
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const layout = await saveCurrentCompanionLayout(this.plugin);
            new Notice(`已保存：${layout.name}`);
            this.display();
          } catch (error) {
            new Notice(commandErrorText('保存小窗布局失败', error), 5000);
            button.setDisabled(false);
          }
        }));
  }

  renderVideoSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    const enabled = settings.videoEnhancementEnabled;
    const shortcuts = immersiveShortcuts(this.plugin);

    section(containerEl, '视频笔记增强', 'Windows + PotPlayer 原生增强。关闭时 Go Study 仍然可以作为普通资源管理器完整使用。');

    new Setting(containerEl)
      .setName('启用视频笔记增强')
      .setDesc('开启后注册全局快捷键，并启用 PotPlayer 时间点、截图和快速笔记能力。无需 markdown2potplayer / AutoHotkey。')
      .addToggle((toggle) => toggle
        .setValue(enabled)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoEnhancementEnabled', value);
          registerImmersiveHotkeys(this.plugin);
          this.display();
        }));

    new Setting(containerEl)
      .setName('未收录视频也启用增强')
      .setDesc('开启后，自己打开的 PotPlayer 视频也能记录；匹配到已收录资源时自动使用 Managed 回链，否则生成可回到当前媒体位置的 Freeform 回链。')
      .addToggle((toggle) => {
        toggle.setValue(settings.freeformVideoNotesEnabled);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'freeformVideoNotesEnabled', value);
        });
      });

    new Setting(containerEl)
      .setName('快捷键操作方式')
      .setDesc('“混合”保留 Alt+1～Alt+4，同时启用动作盘；也可以只保留其中一种。')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('mixed', '混合 · 动作盘 + 独立快捷键')
          .addOption('hud', '仅动作盘')
          .addOption('legacy', '仅独立快捷键')
          .setValue(settings.shortcutMode);
        dropdown.setDisabled?.(!enabled);
        dropdown.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'shortcutMode', value);
          registerImmersiveHotkeys(this.plugin);
          this.display();
        });
      });

    if (settings.shortcutMode === 'hud' || settings.shortcutMode === 'mixed') {
      new Setting(containerEl)
        .setName('动作盘主快捷键')
        .setDesc('默认 Alt+S。按下后短暂停顿会显示 HUD；在显示延迟内直接按方向键可跳过 HUD 执行动作。')
        .addText((text) => {
          text.setValue(settings.actionHudShortcut);
          text.setPlaceholder('Alt+S');
          text.setDisabled?.(!enabled);
          const commit = async () => {
            try {
              await updateProductSetting(this.plugin, 'actionHudShortcut', text.getValue());
              registerImmersiveHotkeys(this.plugin);
              this.display();
            } catch (error) {
              text.setValue(currentProductSettings(this.plugin).actionHudShortcut);
              new Notice(commandErrorText('动作盘快捷键更新失败', error), 5000);
            }
          };
          text.inputEl?.addEventListener('change', () => void commit());
        });

      new Setting(containerEl)
        .setName('动作盘显示延迟')
        .setDesc('熟练时可在 HUD 出现前直接按方向执行；停顿超过这个时间才显示提示。')
        .addDropdown((dropdown) => {
          dropdown
            .addOption('0', '立即显示')
            .addOption('200', '200 ms')
            .addOption('300', '300 ms · 推荐')
            .addOption('500', '500 ms')
            .setValue(String(settings.actionHudDelayMs));
          dropdown.setDisabled?.(!enabled);
          dropdown.onChange(async (value) => {
            await updateProductSetting(this.plugin, 'actionHudDelayMs', Number(value));
          });
        });

      const map = containerEl.createDiv({ cls: 'go-study-hud-map' });
      const mapHead = map.createDiv({ cls: 'go-study-hud-map-head' });
      mapHead.createDiv({ text: '动作盘映射', cls: 'go-study-hud-map-title' });
      mapHead.createDiv({ text: '同一方向快速连按两次可直接执行，无需再按 Enter。', cls: 'setting-item-description' });
      for (const slot of HUD_SLOT_ORDER) {
        const row = map.createDiv({ cls: 'go-study-hud-map-row' });
        row.createSpan({ text: HUD_SLOT_LABELS[slot], cls: 'go-study-hud-map-key' });
        const select = row.createEl('select', { cls: 'dropdown go-study-hud-map-select' });
        for (const action of Object.values(CAPTURE_ACTIONS)) {
          const option = select.createEl('option', { text: action.label });
          option.value = action.id;
        }
        select.value = settings.actionHudSlots[slot];
        select.disabled = !enabled;
        select.addEventListener('change', () => {
          const next = { ...currentProductSettings(this.plugin).actionHudSlots, [slot]: select.value };
          void updateProductSetting(this.plugin, 'actionHudSlots', next);
        });
      }
    }

    const status = new Setting(containerEl)
      .setName('当前状态')
      .setDesc(videoStatusText(this.plugin));
    status.addButton((button) => button
      .setButtonText('检查状态')
      .setDisabled(!enabled)
      .onClick(async () => {
        button.setDisabled(true);
        try {
          const result = await checkPotPlayerBridge({ nativeOnly: true });
          new Notice(`视频笔记增强可用 · ${result.transport || 'native-windows'}`);
        } catch (error) {
          new Notice(commandErrorText('视频笔记增强不可用', error), 6000);
        } finally {
          button.setDisabled(false);
          this.display();
        }
      }));

    if (settings.shortcutMode === 'legacy' || settings.shortcutMode === 'mixed') {
      const shortcutKeys = ['position', 'capture', 'note', 'captureNote'];
      for (const key of shortcutKeys) {
        new Setting(containerEl)
          .setName(HOTKEY_ACTIONS[key])
          .setDesc('留空可禁用这一动作；重复快捷键会被拒绝。')
          .addText((text) => {
            text.setValue(shortcuts[key] || '');
            text.setPlaceholder('例如 Alt+1');
            text.setDisabled?.(!enabled);
            const commit = async () => {
              try {
                await updateImmersiveShortcut(this.plugin, key, text.getValue());
                new Notice(`快捷键已更新：${HOTKEY_ACTIONS[key]}`);
              } catch (error) {
                text.setValue(immersiveShortcuts(this.plugin)[key] || '');
                new Notice(commandErrorText('快捷键更新失败', error), 5000);
              }
              this.display();
            };
            text.inputEl?.addEventListener('change', () => void commit());
            text.inputEl?.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                text.inputEl.blur();
              }
            });
          });
      }

      new Setting(containerEl)
        .setName('恢复默认快捷键')
        .setDesc('恢复为 Alt+1、Alt+2、Alt+3、Alt+4。')
        .addButton((button) => button
          .setButtonText('恢复默认')
          .setDisabled(!enabled)
          .onClick(async () => {
            await resetImmersiveShortcuts(this.plugin);
            new Notice('已恢复默认视频快捷键。');
            this.display();
          }));
    }

    new Setting(containerEl)
      .setName('保存笔记后继续播放')
      .setDesc('Alt+3 / Alt+4 按 Enter 保存后，自动让 PotPlayer 继续播放。')
      .addToggle((toggle) => {
        toggle.setValue(settings.videoResumeAfterSave);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterSave', value);
        });
      });

    new Setting(containerEl)
      .setName('取消笔记后继续播放')
      .setDesc('Alt+3 / Alt+4 按 Esc 取消后，自动让 PotPlayer 继续播放。')
      .addToggle((toggle) => {
        toggle.setValue(settings.videoResumeAfterCancel);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterCancel', value);
        });
      });

    new Setting(containerEl)
      .setName('显示成功提示')
      .setDesc('成功记录后在屏幕角落短暂显示轻量提示；错误提示始终保留。')
      .addToggle((toggle) => {
        toggle.setValue(settings.videoSuccessFeedback);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoSuccessFeedback', value);
        });
      });

    new Setting(containerEl)
      .setName('截图保存目录')
      .setDesc('留空时跟随 Obsidian 当前附件设置；填写 Vault 相对路径时由 Go Study 固定保存到该目录。这样也更容易与自定义附件位置插件共存。')
      .addText((text) => {
        text.setValue(settings.captureFolder);
        text.setPlaceholder('留空 = 跟随 Obsidian 附件设置');
        text.setDisabled?.(!enabled);
        const commit = async () => {
          try {
            const next = await updateProductSetting(this.plugin, 'captureFolder', text.getValue());
            text.setValue(next.captureFolder);
            new Notice(next.captureFolder ? `截图目录已更新：${next.captureFolder}` : '截图保存已改为跟随 Obsidian 附件设置。');
          } catch (error) {
            text.setValue(currentProductSettings(this.plugin).captureFolder);
            new Notice(commandErrorText('截图目录更新失败', error), 5000);
          }
        };
        text.inputEl?.addEventListener('change', () => void commit());
      });

    new Setting(containerEl)
      .setName('截图记录测试')
      .setDesc('用于确认当前 PotPlayer 帧、Vault 截图写入和永久回链是否正常。')
      .addButton((button) => button
        .setButtonText('执行截图记录')
        .setDisabled(!enabled)
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await captureFrameAndInsertLearningPosition(this.plugin, { nativeOnly: true });
            new Notice(`截图已保存：${result.vaultPath}`);
          } catch (error) {
            new Notice(commandErrorText('截图记录失败', error), 6000);
          } finally {
            button.setDisabled(false);
          }
        }));
  }

  renderNoteOutputSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '笔记输出格式', '只改变写进 Markdown 的显示形式；永久 Resource ID 回链本身不会被改成临时路径。');

    new Setting(containerEl)
      .setName('时间显示格式')
      .setDesc('“自动”在不足 1 小时时显示 MM:SS；“固定”始终显示 HH:MM:SS。')
      .addDropdown((dropdown) => dropdown
        .addOption('smart', '自动 · 12:34 / 01:12:34')
        .addOption('hms', '固定 · 00:12:34')
        .setValue(settings.timeDisplayFormat)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'timeDisplayFormat', value);
          this.refreshOutputPreview();
        }));

    this.addTemplateSetting(
      containerEl,
      'backlinkTemplate',
      '回链模板',
      '可用变量：{title}、{time}、{uri}。必须保留 {uri}，否则会失去回到课程的能力。'
    );
    this.addTemplateSetting(
      containerEl,
      'noteTemplate',
      'Alt+3 快速笔记模板',
      '可用变量：{note}、{backlink}。两者都必须保留。'
    );
    this.addTemplateSetting(
      containerEl,
      'captureTemplate',
      'Alt+2 截图模板',
      '可用变量：{image}、{backlink}。两者都必须保留。'
    );
    this.addTemplateSetting(
      containerEl,
      'captureNoteTemplate',
      'Alt+4 截图笔记模板',
      '可用变量：{image}、{note}、{backlink}。三者都必须保留。'
    );
    this.addTemplateSetting(
      containerEl,
      'plainNoteTemplate',
      '无时间 · 纯笔记模板',
      '可用变量：{note}。用于 HUD 中不记录时间戳的评论动作。'
    );
    this.addTemplateSetting(
      containerEl,
      'plainCaptureTemplate',
      '无时间 · 仅截图模板',
      '可用变量：{image}。用于只保存截图、不生成时间回链的动作。'
    );
    this.addTemplateSetting(
      containerEl,
      'plainCaptureNoteTemplate',
      '无时间 · 截图评论模板',
      '可用变量：{image}、{note}。用于截图 + 评论但不记录时间戳。'
    );

    new Setting(containerEl)
      .setName('恢复默认输出格式')
      .setDesc('恢复后，每张模板卡片右侧的实时效果会一起更新。')
      .addButton((button) => button
        .setButtonText('恢复默认')
        .onClick(async () => {
          await resetOutputTemplates(this.plugin);
          new Notice('已恢复默认笔记输出格式。');
          this.display();
        }));
  }

  addTemplateSetting(containerEl, key, name, description) {
    const initial = currentProductSettings(this.plugin);
    const card = containerEl.createDiv({ cls: 'go-study-template-card' });
    const head = card.createDiv({ cls: 'go-study-template-card-head' });
    head.createDiv({ text: name, cls: 'go-study-template-title' });
    head.createDiv({ text: description, cls: 'setting-item-description' });
    const body = card.createDiv({ cls: 'go-study-template-card-body' });
    const editorPane = body.createDiv({ cls: 'go-study-template-editor-pane' });
    editorPane.createDiv({ text: '模板', cls: 'go-study-template-pane-label' });
    const input = editorPane.createEl('textarea', { cls: 'go-study-template-textarea' });
    input.value = initial[key];
    input.placeholder = DEFAULT_PRODUCT_SETTINGS[key];
    input.rows = Math.min(7, Math.max(3, initial[key].split('\n').length + 1));
    const previewPane = body.createDiv({ cls: 'go-study-template-preview-pane' });
    previewPane.createDiv({ text: '实时效果', cls: 'go-study-template-pane-label' });
    const rendered = previewPane.createDiv({ cls: 'go-study-template-rendered' });
    const details = previewPane.createEl('details', { cls: 'go-study-template-markdown-details' });
    details.createEl('summary', { text: '查看最终 Markdown' });
    const raw = details.createEl('pre', { cls: 'go-study-template-markdown' });

    const refresh = async () => {
      try {
        const settings = { ...currentProductSettings(this.plugin), [key]: input.value };
        const markdown = templatePreviewMarkdown(key, settings);
        raw.textContent = markdown;
        rendered.empty?.();
        if (MarkdownRenderer?.render) {
          await MarkdownRenderer.render(this.app, markdown, rendered, '', this);
        } else {
          rendered.textContent = markdown;
        }
        card.removeClass?.('is-invalid');
      } catch (error) {
        card.addClass?.('is-invalid');
        rendered.empty?.();
        rendered.setText?.(`模板暂时无效：${error instanceof Error ? error.message : String(error)}`);
        if (!rendered.setText) rendered.textContent = `模板暂时无效：${error instanceof Error ? error.message : String(error)}`;
        raw.textContent = input.value;
      }
    };
    this.templatePreviewRefreshers.push(() => { void refresh(); });
    input.addEventListener('input', () => { void refresh(); });
    input.addEventListener('change', async () => {
      try {
        const next = await updateProductSetting(this.plugin, key, input.value);
        input.value = next[key];
        await refresh();
      } catch (error) {
        input.value = currentProductSettings(this.plugin)[key];
        await refresh();
        new Notice(commandErrorText(`${name}无效`, error), 6000);
      }
    });
    void refresh();
  }

  renderDataSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '数据与安全', '只影响 Go Study 自己的状态备份，不会删除 Vault、OpenList、B站或 Anki 原始资料。');

    new Setting(containerEl)
      .setName('自动备份保留数量')
      .setDesc('保留最近 3～10 份 Go Study 状态备份。')
      .addDropdown((dropdown) => {
        for (let value = 3; value <= 10; value += 1) dropdown.addOption(String(value), `${value} 份`);
        dropdown.setValue(String(settings.backupRetention));
        dropdown.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'backupRetention', Number(value));
        });
      });

    new Setting(containerEl)
      .setName('当前插件版本')
      .setDesc(this.plugin.manifest?.version || '未知版本');
  }
}

module.exports = {
  GoStudySettingsTab,
  noteOutputOptions,
  noteOutputPreview,
  section,
  setInterfaceTips,
  videoStatusText
};

},
"product-settings.cjs": (module, exports, require) => {
'use strict';

const { DEFAULT_HUD_SLOTS, normalizeHudSlots } = __rhLoad("capture-actions.cjs");

const DEFAULT_PRODUCT_SETTINGS = Object.freeze({
  autoCollapseSidebar: true,
  videoEnhancementEnabled: false,
  videoResumeAfterSave: true,
  videoResumeAfterCancel: true,
  videoSuccessFeedback: true,
  focusStudyNoteAtEnd: true,
  freeformVideoNotesEnabled: true,
  shortcutMode: 'mixed',
  actionHudShortcut: 'Alt+S',
  actionHudDelayMs: 300,
  actionHudSlots: { ...DEFAULT_HUD_SLOTS },
  captureFolder: 'GoStudy/Captures',
  backupRetention: 10,
  timeDisplayFormat: 'smart',
  backlinkTemplate: '[↗ {title} · {time}]({uri})',
  noteTemplate: '{note}\n\n{backlink}',
  captureTemplate: '{image}\n\n{backlink}',
  captureNoteTemplate: '{image}\n\n{note}\n\n{backlink}',
  plainNoteTemplate: '{note}',
  plainCaptureTemplate: '{image}',
  plainCaptureNoteTemplate: '{image}\n\n{note}'
});

const TEMPLATE_RULES = Object.freeze({
  backlinkTemplate: Object.freeze({
    allowed: Object.freeze(['title', 'time', 'uri']),
    required: Object.freeze(['uri'])
  }),
  noteTemplate: Object.freeze({
    allowed: Object.freeze(['note', 'backlink']),
    required: Object.freeze(['note', 'backlink'])
  }),
  captureTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'backlink']),
    required: Object.freeze(['image', 'backlink'])
  }),
  captureNoteTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'note', 'backlink']),
    required: Object.freeze(['image', 'note', 'backlink'])
  }),
  plainNoteTemplate: Object.freeze({
    allowed: Object.freeze(['note']),
    required: Object.freeze(['note'])
  }),
  plainCaptureTemplate: Object.freeze({
    allowed: Object.freeze(['image']),
    required: Object.freeze(['image'])
  }),
  plainCaptureNoteTemplate: Object.freeze({
    allowed: Object.freeze(['image', 'note']),
    required: Object.freeze(['image', 'note'])
  })
});

function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCaptureFolder(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[<>:"|?*\x00-\x1F]/.test(part))) {
    throw new Error('截图目录必须是 Vault 内的安全相对路径。');
  }
  return parts.join('/');
}

function normalizeTimeDisplayFormat(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'smart' || normalized === 'hms') return normalized;
  return DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat;
}
function normalizeShortcutMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['mixed', 'hud', 'legacy'].includes(normalized) ? normalized : DEFAULT_PRODUCT_SETTINGS.shortcutMode;
}

function normalizeActionHudShortcut(value) {
  const shortcut = String(value || '').trim();
  if (!shortcut) return DEFAULT_PRODUCT_SETTINGS.actionHudShortcut;
  if (shortcut.length > 40 || /[\r\n\t]/.test(shortcut)) throw new Error('动作盘快捷键格式无效。');
  return shortcut;
}

function normalizeActionHudDelayMs(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRODUCT_SETTINGS.actionHudDelayMs;
  return Math.min(1000, Math.max(0, parsed));
}


function outputTemplateTokens(value) {
  return [...String(value || '').matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g)].map((match) => match[1]);
}

function normalizeOutputTemplate(key, value) {
  const rule = TEMPLATE_RULES[key];
  if (!rule) throw new Error('未知笔记模板。');
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) throw new Error('模板不能为空。');
  if (normalized.length > 4000) throw new Error('模板过长，请控制在 4000 个字符以内。');
  const tokens = outputTemplateTokens(normalized);
  const unknown = [...new Set(tokens.filter((token) => !rule.allowed.includes(token)))];
  if (unknown.length) throw new Error(`模板包含未知变量：${unknown.map((token) => `{${token}}`).join('、')}。`);
  const missing = rule.required.filter((token) => !tokens.includes(token));
  if (missing.length) throw new Error(`模板必须保留：${missing.map((token) => `{${token}}`).join('、')}。`);
  return normalized;
}

function safeOutputTemplate(key, value) {
  try { return normalizeOutputTemplate(key, value); }
  catch { return DEFAULT_PRODUCT_SETTINGS[key]; }
}

function currentProductSettings(plugin) {
  const ui = plugin?.state?.uiState || {};
  let captureFolder = DEFAULT_PRODUCT_SETTINGS.captureFolder;
  try {
    captureFolder = Object.prototype.hasOwnProperty.call(ui, 'captureFolder')
      ? normalizeCaptureFolder(ui.captureFolder)
      : DEFAULT_PRODUCT_SETTINGS.captureFolder;
  } catch {}
  return {
    autoCollapseSidebar: boolOr(ui.autoCollapseSidebar, DEFAULT_PRODUCT_SETTINGS.autoCollapseSidebar),
    videoEnhancementEnabled: boolOr(ui.videoEnhancementEnabled, DEFAULT_PRODUCT_SETTINGS.videoEnhancementEnabled),
    videoResumeAfterSave: boolOr(ui.videoResumeAfterSave, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterSave),
    videoResumeAfterCancel: boolOr(ui.videoResumeAfterCancel, DEFAULT_PRODUCT_SETTINGS.videoResumeAfterCancel),
    videoSuccessFeedback: boolOr(ui.videoSuccessFeedback, DEFAULT_PRODUCT_SETTINGS.videoSuccessFeedback),
    focusStudyNoteAtEnd: boolOr(ui.focusStudyNoteAtEnd, DEFAULT_PRODUCT_SETTINGS.focusStudyNoteAtEnd),
    freeformVideoNotesEnabled: boolOr(ui.freeformVideoNotesEnabled, DEFAULT_PRODUCT_SETTINGS.freeformVideoNotesEnabled),
    shortcutMode: normalizeShortcutMode(ui.shortcutMode),
    actionHudShortcut: (() => {
      try { return normalizeActionHudShortcut(ui.actionHudShortcut); }
      catch { return DEFAULT_PRODUCT_SETTINGS.actionHudShortcut; }
    })(),
    actionHudDelayMs: normalizeActionHudDelayMs(ui.actionHudDelayMs),
    actionHudSlots: normalizeHudSlots(ui.actionHudSlots),
    captureFolder,
    backupRetention: clampInteger(ui.backupRetention, 3, 10, DEFAULT_PRODUCT_SETTINGS.backupRetention),
    timeDisplayFormat: normalizeTimeDisplayFormat(ui.timeDisplayFormat),
    backlinkTemplate: safeOutputTemplate('backlinkTemplate', ui.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate),
    noteTemplate: safeOutputTemplate('noteTemplate', ui.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate),
    captureTemplate: safeOutputTemplate('captureTemplate', ui.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate),
    captureNoteTemplate: safeOutputTemplate('captureNoteTemplate', ui.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate),
    plainNoteTemplate: safeOutputTemplate('plainNoteTemplate', ui.plainNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainNoteTemplate),
    plainCaptureTemplate: safeOutputTemplate('plainCaptureTemplate', ui.plainCaptureTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureTemplate),
    plainCaptureNoteTemplate: safeOutputTemplate('plainCaptureNoteTemplate', ui.plainCaptureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureNoteTemplate)
  };
}

function ensureProductSettings(plugin) {
  if (!plugin?.state) return { changed: false, settings: { ...DEFAULT_PRODUCT_SETTINGS } };
  plugin.state.uiState ||= {};
  const normalized = currentProductSettings(plugin);
  let changed = false;
  for (const [key, value] of Object.entries(normalized)) {
    const current = plugin.state.uiState[key];
    const same = value && typeof value === 'object'
      ? JSON.stringify(current) === JSON.stringify(value)
      : current === value;
    if (!same) {
      plugin.state.uiState[key] = value;
      changed = true;
    }
  }
  return { changed, settings: normalized };
}

async function updateProductSetting(plugin, key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_PRODUCT_SETTINGS, key)) throw new Error('未知设置项。');
  plugin.state.uiState ||= {};
  let next = value;
  if (key === 'captureFolder') next = normalizeCaptureFolder(value);
  else if (key === 'backupRetention') next = clampInteger(value, 3, 10, DEFAULT_PRODUCT_SETTINGS.backupRetention);
  else if (key === 'timeDisplayFormat') next = normalizeTimeDisplayFormat(value);
  else if (key === 'shortcutMode') next = normalizeShortcutMode(value);
  else if (key === 'actionHudShortcut') next = normalizeActionHudShortcut(value);
  else if (key === 'actionHudDelayMs') next = normalizeActionHudDelayMs(value);
  else if (key === 'actionHudSlots') next = normalizeHudSlots(value);
  else if (TEMPLATE_RULES[key]) next = normalizeOutputTemplate(key, value);
  else if (typeof DEFAULT_PRODUCT_SETTINGS[key] === 'boolean') next = Boolean(value);
  plugin.state.uiState[key] = next;
  await plugin.persist();
  return currentProductSettings(plugin);
}

async function resetOutputTemplates(plugin) {
  plugin.state.uiState ||= {};
  for (const key of ['timeDisplayFormat', ...Object.keys(TEMPLATE_RULES)]) {
    plugin.state.uiState[key] = DEFAULT_PRODUCT_SETTINGS[key];
  }
  await plugin.persist();
  return currentProductSettings(plugin);
}

module.exports = {
  DEFAULT_PRODUCT_SETTINGS,
  TEMPLATE_RULES,
  clampInteger,
  currentProductSettings,
  ensureProductSettings,
  normalizeActionHudDelayMs,
  normalizeActionHudShortcut,
  normalizeCaptureFolder,
  normalizeOutputTemplate,
  normalizeShortcutMode,
  normalizeTimeDisplayFormat,
  outputTemplateTokens,
  resetOutputTemplates,
  updateProductSetting
};

},
"project-notes-ui.cjs": (module, exports, require) => {
'use strict';

const {
  Modal = class {},
  Notice = class {},
  setIcon = () => {}
} = require('obsidian');
const {
  findProjectNoteByPath,
  linkProjectNote,
  normalizeNoteFolder,
  projectNoteFolder,
  projectNotes,
  recentProjectNote,
  recentStudy,
  setProjectNoteFolder,
  setRecentProjectNote,
  unlinkProjectNote
} = __rhLoad("project-notes.cjs");
const { currentProductSettings } = __rhLoad("product-settings.cjs");
const { rememberNoteTarget } = __rhLoad("note-target.cjs");

function markdownFiles(plugin) {
  const vault = plugin?.app?.vault;
  const files = typeof vault?.getMarkdownFiles === 'function'
    ? vault.getMarkdownFiles()
    : (vault?.getFiles?.() || []).filter((file) => String(file.extension || '').toLowerCase() === 'md');
  return [...files].sort((a, b) => String(a.basename || a.name || a.path).localeCompare(String(b.basename || b.name || b.path), 'zh-CN'));
}

function noteDisplayName(noteOrFile) {
  const path = String(noteOrFile?.path || '');
  return String(noteOrFile?.basename || noteOrFile?.name || path.split('/').pop() || '未命名笔记').replace(/\.md$/i, '');
}

function resolveNoteFile(plugin, note) {
  if (!note?.path) return null;
  const file = plugin.app.vault.getAbstractFileByPath?.(note.path) || null;
  if (!file || Array.isArray(file.children) || String(file.extension || '').toLowerCase() !== 'md') return null;
  return file;
}

function markdownLeafForFile(plugin, file) {
  const leaves = plugin?.app?.workspace?.getLeavesOfType?.('markdown') || [];
  return leaves.find((leaf) => String(leaf?.view?.file?.path || '') === String(file?.path || '')) || null;
}

async function focusProjectNoteAtEnd(plugin, file) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const leaf = markdownLeafForFile(plugin, file);
  const editor = leaf?.view?.editor;
  if (!editor || typeof editor.setCursor !== 'function') return false;
  const lastLine = Math.max(0, Number(typeof editor.lastLine === 'function' ? editor.lastLine() : 0));
  const lineText = typeof editor.getLine === 'function' ? String(editor.getLine(lastLine) || '') : '';
  editor.setCursor({ line: lastLine, ch: lineText.length });
  rememberNoteTarget(plugin, editor, file);
  editor.focus?.();
  return true;
}

async function openProjectNote(plugin, note, options = {}) {
  const file = resolveNoteFile(plugin, note);
  if (!file) {
    if (note) note.missingAt ||= new Date().toISOString();
    await plugin.persist?.();
    new Notice('这篇项目笔记已经移动或删除。', 4500);
    return false;
  }
  note.missingAt = '';
  setRecentProjectNote(plugin.state, note.projectId, note.id);
  await plugin.persist?.();
  await plugin.openVaultEntry(file, { newLeaf: Boolean(options.newLeaf) });
  if (options.prepareForStudy && currentProductSettings(plugin).focusStudyNoteAtEnd) {
    await focusProjectNoteAtEnd(plugin, file);
  }
  return true;
}

function safeNewNoteTitle(value) {
  const title = String(value || '').trim().replace(/[\\/:*?"<>|\x00-\x1F]/g, '-').replace(/[. ]+$/g, '');
  if (!title) throw new Error('请输入笔记名称。');
  return title.slice(0, 120);
}

function newNoteParentPath(plugin) {
  try {
    const parent = plugin.app.fileManager?.getNewFileParent?.('');
    const path = String(parent?.path || '').trim().replace(/^\/+|\/+$/g, '');
    return path === '/' ? '' : path;
  } catch {
    return '';
  }
}

function uniqueNewNotePath(plugin, title, folderOverride = undefined) {
  const parent = folderOverride === undefined ? newNoteParentPath(plugin) : normalizeNoteFolder(folderOverride);
  const stem = safeNewNoteTitle(title);
  for (let index = 1; index <= 999; index += 1) {
    const name = index === 1 ? `${stem}.md` : `${stem} ${index}.md`;
    const path = parent ? `${parent}/${name}` : name;
    if (!plugin.app.vault.getAbstractFileByPath?.(path)) return path;
  }
  throw new Error('同名笔记过多，无法创建新笔记。');
}

async function createProjectNote(plugin, projectId, title, options = {}) {
  const projectFolder = projectNoteFolder(plugin.state, projectId);
  const folder = Object.prototype.hasOwnProperty.call(options, 'folder') ? options.folder : (projectFolder || undefined);
  const path = uniqueNewNotePath(plugin, title, folder);
  const heading = safeNewNoteTitle(title);
  const file = await plugin.app.vault.create(path, `# ${heading}\n\n`);
  const result = linkProjectNote(plugin.state, projectId, file.path);
  setRecentProjectNote(plugin.state, projectId, result.note.id);
  await plugin.persist?.();
  await plugin.openVaultEntry(file);
  await plugin.workbenchLeaf?.view?.render?.();
  return result.note;
}

function vaultFolders(plugin) {
  const root = plugin?.app?.vault?.getRoot?.();
  const result = [];
  const visit = (folder) => {
    for (const child of Array.isArray(folder?.children) ? folder.children : []) {
      if (!Array.isArray(child?.children)) continue;
      const path = String(child.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (path) result.push({ path, name: String(child.name || path.split('/').pop() || path) });
      visit(child);
    }
  };
  visit(root);
  return result.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
}

class ProjectNoteFolderPickerModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.options = options;
    this.settled = false;
    this.currentPath = normalizeNoteFolder(options.initialPath || '');
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-project-note-folder-modal');
    this.render();
  }

  choose(path) {
    if (this.settled) return;
    this.settled = true;
    this.options.onChoose?.(path);
    this.close();
  }

  directChildren(all, currentPath) {
    const prefix = currentPath ? `${currentPath}/` : '';
    return all.filter((folder) => {
      if (!folder.path.startsWith(prefix)) return false;
      const rest = folder.path.slice(prefix.length);
      return rest && !rest.includes('/');
    });
  }

  breadcrumbPaths() {
    const parts = this.currentPath.split('/').filter(Boolean);
    const result = [{ label: 'Vault', path: '' }];
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      result.push({ label: part, path });
    }
    return result;
  }

  render() {
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: this.options.title || '选择笔记文件夹',
      description: this.options.description || '逐层进入 Vault 文件夹，或搜索完整路径；只决定新建笔记保存位置，不会自动收录整个文件夹。',
      searchLabel: '搜索 Vault 文件夹',
      placeholder: '搜索任意层级文件夹…'
    });
    const all = vaultFolders(this.plugin);

    let paint = () => {
      ui.body.empty();
      const query = String(ui.search.value || '').trim().toLocaleLowerCase('zh-CN');
      const section = ui.body.createDiv({ cls: 'go-study-picker-section' });
      if (!query) {
        const crumbs = section.createDiv({ cls: 'go-study-folder-breadcrumbs' });
        for (const [index, crumb] of this.breadcrumbPaths().entries()) {
          if (index) crumbs.createSpan({ text: '›', cls: 'go-study-folder-breadcrumb-sep' });
          const button = crumbs.createEl('button', { cls: 'go-study-folder-breadcrumb' });
          button.textContent = crumb.label;
          button.addEventListener('click', () => {
            this.currentPath = crumb.path;
            paint();
          });
        }
      } else {
        section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索结果 · 点击进入文件夹' });
      }

      const list = section.createDiv({ cls: 'rh-next-picker-list' });
      const folders = query
        ? all.filter((item) => item.path.toLocaleLowerCase('zh-CN').includes(query)).slice(0, 160)
        : this.directChildren(all, this.currentPath);

      if (!folders.length) {
        list.createEl('p', {
          cls: 'rh-next-empty-inline',
          text: query ? '没有找到匹配文件夹。' : '当前文件夹没有子文件夹，可以直接选择当前文件夹。'
        });
      }

      for (const folder of folders) {
        const row = list.createEl('button', { cls: 'rh-next-picker-row go-study-folder-row' });
        setIcon(row.createSpan(), 'folder');
        const copy = row.createDiv();
        copy.createEl('strong', { text: folder.name });
        copy.createEl('small', { text: folder.path });
        row.addEventListener('click', () => {
          this.currentPath = folder.path;
          ui.search.value = '';
          paint();
        });
      }
    };

    ui.search.addEventListener('input', paint);

    const system = ui.footer.createEl('button', { cls: 'rh-next-button' });
    system.textContent = '跟随 Obsidian 默认位置';
    system.addEventListener('click', () => this.choose(''));

    const current = ui.footer.createEl('button', { cls: 'rh-next-button is-primary' });
    const updateCurrentButton = () => {
      current.textContent = this.currentPath ? `选择：${this.currentPath}` : '请进入要使用的文件夹';
      current.title = this.currentPath || '项目默认文件夹留空时由 Obsidian 决定';
      current.disabled = !this.currentPath;
    };
    current.addEventListener('click', () => this.choose(this.currentPath));

    const cancel = ui.footer.createEl('button', { cls: 'rh-next-button' });
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => this.close());

    const originalPaint = paint;
    const wrappedPaint = () => { originalPaint(); updateCurrentButton(); };
    ui.search.removeEventListener?.('input', paint);
    ui.search.addEventListener('input', wrappedPaint);
    paint = wrappedPaint;
    paint();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.options.onCancel?.();
    }
  }
}

function chooseProjectNoteFolder(plugin, options = {}) {
  return new Promise((resolve) => new ProjectNoteFolderPickerModal(plugin.app, plugin, {
    ...options,
    onChoose: (path) => resolve({ cancelled: false, path }),
    onCancel: () => resolve({ cancelled: true, path: '' })
  }).open());
}

function createActionButton(doc, label, icon, className = '') {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `rh-next-button ${className}`.trim();
  if (icon) {
    const iconHost = doc.createElement('span');
    iconHost.className = 'rh-next-button-icon';
    try { setIcon(iconHost, icon); } catch {}
    button.appendChild(iconHost);
  }
  const text = doc.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  return button;
}

function rowButton(container, file, secondary, onClick) {
  const row = container.createEl('button', { cls: 'rh-next-picker-row' });
  setIcon(row.createSpan(), 'file-text');
  const body = row.createDiv();
  body.createEl('strong', { text: noteDisplayName(file) });
  body.createEl('small', { text: secondary || file.path });
  row.addEventListener('click', () => void onClick());
  return row;
}

function pickerHeading(container, title, description) {
  const heading = container.createDiv({ cls: 'rh-next-modal-heading go-study-picker-heading' });
  const copy = heading.createDiv();
  copy.createEl('h2', { text: title });
  if (description) copy.createEl('p', { text: description });
  return heading;
}

function createPickerShell(contentEl, options = {}) {
  const shell = contentEl.createDiv({ cls: 'go-study-picker-shell' });
  pickerHeading(shell, options.title || '选择', options.description || '');
  const searchWrap = shell.createDiv({ cls: 'go-study-picker-search' });
  if (options.searchLabel) searchWrap.createEl('span', { text: options.searchLabel, cls: 'go-study-picker-label' });
  const search = searchWrap.createEl('input', {
    cls: 'rh-next-input',
    attr: { type: 'search', placeholder: options.placeholder || '搜索…' }
  });
  const body = shell.createDiv({ cls: 'go-study-picker-body' });
  const footer = shell.createDiv({ cls: 'go-study-picker-footer' });
  return { shell, search, body, footer };
}

function installPickerUxStyles(plugin, doc = globalThis.document) {
  if (!doc?.createElement) return null;
  const styleId = `go-study-picker-ux-${String(plugin?.manifest?.id || 'plugin')}`;
  const existing = doc.getElementById?.(styleId);
  if (existing) return existing;
  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
.modal.go-study-project-note-box-modal,
.modal.go-study-study-note-picker-modal,
.modal.go-study-project-note-folder-modal,
.modal.rh-next-vault-picker-modal {
  width: min(760px, 92vw);
  height: min(680px, 84vh);
}
.modal.go-study-project-note-box-modal .modal-content,
.modal.go-study-study-note-picker-modal .modal-content,
.modal.go-study-project-note-folder-modal .modal-content,
.modal.rh-next-vault-picker-modal .modal-content {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.go-study-picker-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.go-study-picker-heading { min-width: 0; }
.go-study-picker-search { display: grid; gap: 6px; }
.go-study-picker-label { color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-picker-body {
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
}
.go-study-picker-section + .go-study-picker-section { border-top: 1px solid var(--background-modifier-border); }
.go-study-picker-section-title { display: block; padding: 10px 12px 4px; color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-picker-body .rh-next-picker-list {
  min-height: 0;
  max-height: none;
  margin-top: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
}
.go-study-picker-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 38px; }
.go-study-picker-footer.is-note-box-footer { display: grid; grid-template-columns: 1fr; align-items: stretch; }
.go-study-note-folder-default { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-note-folder-default > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-picker-footer .go-study-note-create-row { display: flex; min-width: 0; flex: 1; gap: 8px; }
.go-study-picker-footer .go-study-note-create-row .rh-next-input { min-width: 0; flex: 1; }
.go-study-note-create-location { flex: 0 1 220px; min-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-picker-body .rh-next-picker-row { width: 100%; box-sizing: border-box; }
.go-study-note-management-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 0; border: 0; border-bottom: 1px solid var(--background-modifier-border); background: transparent; }
.go-study-note-management-row:last-child { border-bottom: 0; }
.go-study-note-management-row:hover { background: var(--background-modifier-hover); }
.go-study-note-management-row > div:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.go-study-note-management-row > div:nth-child(2) strong,
.go-study-note-management-row > div:nth-child(2) small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-note-management-row .rh-next-resource-actions { justify-self: end; }
.go-study-folder-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; text-align: left; }
.go-study-folder-breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 9px 12px; border-bottom: 1px solid var(--background-modifier-border); }
.go-study-folder-breadcrumb { border: 0; background: transparent; color: var(--text-accent); padding: 2px 4px; border-radius: 5px; cursor: pointer; }
.go-study-folder-breadcrumb:hover { background: var(--background-modifier-hover); }
.go-study-folder-breadcrumb-sep { color: var(--text-faint); }
.rh-next-vault-picker-modal .rh-next-picker-list {
  min-height: 0;
  max-height: none;
  flex: 1 1 auto;
  overflow: auto;
  scrollbar-gutter: stable;
}
.rh-next-vault-picker-modal .rh-next-vault-path-quick { max-height: 86px; overflow: auto; scrollbar-gutter: stable; }
@media (max-width: 620px) {
  .modal.go-study-project-note-box-modal,
  .modal.go-study-study-note-picker-modal,
  .modal.go-study-project-note-folder-modal,
  .modal.rh-next-vault-picker-modal { width: 96vw; height: min(720px, 90vh); }
  .go-study-picker-footer { align-items: stretch; flex-direction: column; }
  .go-study-picker-footer > .rh-next-button { width: 100%; }
}
`;
  doc.head?.appendChild?.(style);
  plugin?.register?.(() => style.remove?.());
  return style;
}

class ProjectNoteBoxModal extends Modal {
  constructor(app, plugin, projectId) {
    super(app);
    this.plugin = plugin;
    this.projectId = projectId;
    this.query = '';
    this.bodyEl = null;
    this.createFolderOverride = null;
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-project-note-box-modal');
    this.render();
  }

  render() {
    const project = this.plugin.state.projects?.[this.projectId];
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: `${project?.title || '项目'} · 笔记`,
      description: '这里只保存项目与 Markdown 的关联，不会移动或复制原文件。',
      searchLabel: '关联已有笔记',
      placeholder: '搜索整个 Vault 的 Markdown…'
    });
    this.bodyEl = ui.body;
    ui.search.value = this.query;
    ui.search.addEventListener('input', () => {
      this.query = ui.search.value;
      this.renderBody();
    });

    ui.footer.addClass?.('is-note-box-footer');
    const projectFolder = projectNoteFolder(this.plugin.state, this.projectId);
    const folderDefault = ui.footer.createDiv({ cls: 'go-study-note-folder-default' });
    const folderText = folderDefault.createSpan({ text: projectFolder ? `项目笔记文件夹：${projectFolder}` : '项目笔记文件夹：未设置 · 新建时跟随 Obsidian' });
    folderText.title = projectFolder || '跟随 Obsidian 默认新建位置';
    const folderButton = folderDefault.createEl('button', { cls: 'rh-next-button' });
    folderButton.textContent = projectFolder ? '更改项目默认' : '设置项目默认';
    folderButton.addEventListener('click', async () => {
      const choice = await chooseProjectNoteFolder(this.plugin, { title: '设置项目笔记文件夹', initialPath: projectNoteFolder(this.plugin.state, this.projectId) });
      if (!choice || choice.cancelled) return;
      setProjectNoteFolder(this.plugin.state, this.projectId, choice.path);
      await this.plugin.persist();
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.createFolderOverride = null;
      this.render();
    });

    const createRow = ui.footer.createDiv({ cls: 'go-study-note-create-row' });
    const name = createRow.createEl('input', { cls: 'rh-next-input', attr: { placeholder: '新建项目笔记，例如：高等数学课堂笔记' } });
    const location = createRow.createEl('button', { cls: 'rh-next-button go-study-note-create-location' });
    const refreshLocationLabel = () => {
      const effective = this.createFolderOverride === null ? projectNoteFolder(this.plugin.state, this.projectId) : this.createFolderOverride;
      location.textContent = effective ? `位置：${effective}` : '位置：跟随 Obsidian';
      location.title = this.createFolderOverride === null ? '默认使用项目设置；点击可仅修改本次位置' : '仅修改本次新建位置';
    };
    location.addEventListener('click', async () => {
      const choice = await chooseProjectNoteFolder(this.plugin, { title: '选择本次新建位置', initialPath: this.createFolderOverride === null ? projectNoteFolder(this.plugin.state, this.projectId) : this.createFolderOverride });
      if (!choice || choice.cancelled) return;
      this.createFolderOverride = choice.path;
      refreshLocationLabel();
    });
    refreshLocationLabel();
    const create = createRow.createEl('button', { cls: 'rh-next-button is-primary' });
    create.textContent = '新建并打开';
    const submit = async () => {
      try {
        create.disabled = true;
        const options = this.createFolderOverride === null ? {} : { folder: this.createFolderOverride };
        await createProjectNote(this.plugin, this.projectId, name.value, options);
        this.close();
      } catch (error) {
        new Notice(`创建笔记失败：${error instanceof Error ? error.message : String(error)}`, 5000);
        create.disabled = false;
      }
    };
    create.addEventListener('click', () => void submit());
    name.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } });
    this.renderBody();
  }

  renderBody() {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();
    const query = String(this.query || '').trim().toLocaleLowerCase('zh-CN');
    if (query) return this.renderSearchResults(container, query);

    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId);
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: `项目笔记 · ${notes.length}` });
    const list = section.createDiv({ cls: 'rh-next-picker-list' });
    if (!notes.length) {
      list.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有项目笔记。直接在上方搜索 Vault，或在下方新建项目笔记。' });
      return;
    }
    for (const note of notes) {
      const file = resolveNoteFile(this.plugin, note);
      const row = list.createDiv({ cls: `rh-next-picker-row go-study-note-management-row ${note.missingAt || !file ? 'is-missing' : ''}`.trim() });
      setIcon(row.createSpan(), file ? 'file-text' : 'file-warning');
      const body = row.createDiv();
      const name = body.createEl('strong', { text: noteDisplayName(file || note) });
      if (recent?.id === note.id) name.appendText?.(' · 最近使用');
      body.createEl('small', { text: file ? note.path : `${note.path} · 已丢失` });
      const actions = row.createDiv({ cls: 'rh-next-resource-actions' });
      if (file) {
        const open = actions.createEl('button', { cls: 'rh-next-icon-button', attr: { 'aria-label': '打开笔记', title: '打开笔记' } });
        setIcon(open, 'external-link');
        open.addEventListener('click', (event) => { event.stopPropagation(); void openProjectNote(this.plugin, note).then(() => this.close()); });
      }
      const remove = actions.createEl('button', { cls: 'rh-next-icon-button', attr: { 'aria-label': '从项目移除', title: '从项目移除；不会删除文件' } });
      setIcon(remove, 'unlink');
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        unlinkProjectNote(this.plugin.state, this.projectId, note.id);
        await this.plugin.persist();
        await this.plugin.workbenchLeaf?.view?.render?.();
        this.renderBody();
      });
      if (file) row.addEventListener('click', () => void openProjectNote(this.plugin, note).then(() => this.close()));
    }
  }

  renderSearchResults(container, query = String(this.query || '').trim().toLocaleLowerCase('zh-CN')) {
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索 Vault' });
    const list = section.createDiv({ cls: 'rh-next-picker-list go-study-note-search-results' });
    const linked = new Set(projectNotes(this.plugin.state, this.projectId).map((note) => note.path.toLowerCase()));
    const matches = markdownFiles(this.plugin)
      .filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query))
      .slice(0, 80);
    if (!matches.length) {
      list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配的 Markdown。' });
      return;
    }
    for (const file of matches) {
      const already = linked.has(file.path.toLowerCase());
      rowButton(list, file, already ? `${file.path} · 已在笔记盒` : `${file.path} · 点击关联`, async () => {
        const result = linkProjectNote(this.plugin.state, this.projectId, file.path);
        setRecentProjectNote(this.plugin.state, this.projectId, result.note.id);
        await this.plugin.persist();
        await this.plugin.openVaultEntry(file);
        await this.plugin.workbenchLeaf?.view?.render?.();
        this.close();
      });
    }
  }

  onClose() { this.contentEl.empty(); }
}

class StudyNotePickerModal extends Modal {
  constructor(app, plugin, projectId, resource, resolve) {
    super(app);
    this.plugin = plugin;
    this.projectId = projectId;
    this.resource = resource;
    this.resolveChoice = resolve;
    this.query = '';
    this.settled = false;
    this.bodyEl = null;
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-study-note-picker-modal');
    this.render();
  }

  finish(choice) {
    if (this.settled) return;
    this.settled = true;
    this.resolveChoice(choice);
    this.close();
  }

  async chooseNote(note, file = null) {
    try {
      let selected = note;
      if (!selected && file) selected = linkProjectNote(this.plugin.state, this.projectId, file.path).note;
      if (!selected) return this.finish({ cancelled: false, note: null });
      const opened = await openProjectNote(this.plugin, selected, { prepareForStudy: true });
      if (!opened) return;
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.finish({ cancelled: false, note: selected });
    } catch (error) {
      new Notice(`打开学习笔记失败：${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }

  render() {
    const project = this.plugin.state.projects?.[this.projectId];
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: '开始学习',
      description: `${project?.title || '项目'} · ${this.resource?.title || '学习资源'} · 选择这次学习要带上的笔记，不会建立永久的资源绑定。`,
      searchLabel: '搜索 Vault',
      placeholder: '搜索 Markdown…'
    });
    this.bodyEl = ui.body;
    ui.search.value = this.query;
    ui.search.addEventListener('input', () => {
      this.query = ui.search.value;
      this.renderBody();
    });

    const manage = ui.footer.createEl('button', { cls: 'rh-next-button' }); manage.textContent = '管理笔记盒';
    manage.addEventListener('click', () => { new ProjectNoteBoxModal(this.app, this.plugin, this.projectId).open(); });
    const none = ui.footer.createEl('button', { cls: 'rh-next-button' }); none.textContent = '这次不使用笔记';
    none.addEventListener('click', () => this.finish({ cancelled: false, note: null }));
    const cancel = ui.footer.createEl('button', { cls: 'rh-next-button' }); cancel.textContent = '取消';
    cancel.addEventListener('click', () => this.finish({ cancelled: true, note: null }));
    this.renderBody();
  }

  renderBody() {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();
    const query = String(this.query || '').trim().toLocaleLowerCase('zh-CN');
    if (query) return this.renderSearchResults(container, query);

    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId).filter((note) => !note.missingAt && resolveNoteFile(this.plugin, note));
    if (recent && !recent.missingAt) {
      const recentSection = container.createDiv({ cls: 'go-study-picker-section' });
      recentSection.createEl('strong', { cls: 'go-study-picker-section-title', text: '最近使用' });
      const list = recentSection.createDiv({ cls: 'rh-next-picker-list' });
      const file = resolveNoteFile(this.plugin, recent);
      if (file) rowButton(list, file, `${recent.path} · 上次使用`, () => this.chooseNote(recent));
    }

    const projectSection = container.createDiv({ cls: 'go-study-picker-section' });
    projectSection.createEl('strong', { cls: 'go-study-picker-section-title', text: '项目笔记盒' });
    const list = projectSection.createDiv({ cls: 'rh-next-picker-list' });
    const visible = notes.filter((note) => note.id !== recent?.id);
    if (!visible.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: recent ? '没有其他项目笔记。输入上方搜索框可从整个 Vault 选择。' : '笔记盒还是空的。输入上方搜索框可从整个 Vault 选择。' });
    for (const note of visible) {
      const file = resolveNoteFile(this.plugin, note);
      if (file) rowButton(list, file, note.path, () => this.chooseNote(note));
    }
  }

  renderSearchResults(container, query) {
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索 Vault' });
    const results = section.createDiv({ cls: 'rh-next-picker-list' });
    const matches = markdownFiles(this.plugin)
      .filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query))
      .slice(0, 80);
    if (!matches.length) {
      results.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配笔记。' });
      return;
    }
    for (const file of matches) {
      const linked = findProjectNoteByPath(this.plugin.state, this.projectId, file.path);
      rowButton(results, file, linked ? `${file.path} · 已在笔记盒` : `${file.path} · 选择后加入笔记盒`, () => this.chooseNote(linked, file));
    }
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveChoice({ cancelled: true, note: null });
    }
  }
}

function chooseStudyNote(plugin, projectId, resource) {
  return new Promise((resolve) => new StudyNotePickerModal(plugin.app, plugin, projectId, resource, resolve).open());
}

function installProjectNoteEntryPoints(plugin, doc = globalThis.document) {
  if (!doc?.querySelectorAll || !plugin?.manifest?.id) return null;
  installPickerUxStyles(plugin, doc);
  const selector = `.workspace-leaf-content[data-type="${plugin.manifest.id}-workbench"]`;
  const inject = () => {
    const projectId = String(plugin.state?.uiState?.currentProjectId || '');
    if (plugin.state?.uiState?.route !== 'project' || !plugin.state?.projects?.[projectId]) return;
    const study = recentStudy(plugin.state, projectId);
    const noteCount = projectNotes(plugin.state, projectId).length;
    for (const leaf of doc.querySelectorAll(selector)) {
      const actions = leaf.querySelector?.('.rh-next-project-heading .rh-next-section-actions');
      if (!actions || actions.querySelector?.('[data-go-study-project-notes]')) continue;
      const noteButton = createActionButton(doc, noteCount ? `笔记 ${noteCount}` : '笔记', 'notebook-tabs');
      noteButton.setAttribute('data-go-study-project-notes', 'true');
      noteButton.addEventListener('click', () => new ProjectNoteBoxModal(plugin.app, plugin, projectId).open());
      actions.appendChild(noteButton);
      if (study) {
        const continueButton = createActionButton(doc, '继续学习', 'play', 'is-primary');
        continueButton.setAttribute('data-go-study-continue-study', 'true');
        continueButton.title = `${study.resource?.title || '上次资源'}${study.note ? ` + ${noteDisplayName(study.note)}` : ''}`;
        continueButton.addEventListener('click', () => void plugin.continueRecentProjectStudy?.(projectId));
        actions.insertBefore(continueButton, noteButton);
      }
    }
  };
  inject();
  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(inject) : null;
  observer?.observe?.(doc.body, { childList: true, subtree: true });
  plugin.register?.(() => observer?.disconnect?.());
  return { inject, observer };
}

module.exports = {
  ProjectNoteBoxModal,
  ProjectNoteFolderPickerModal,
  StudyNotePickerModal,
  chooseProjectNoteFolder,
  chooseStudyNote,
  createPickerShell,
  createProjectNote,
  installPickerUxStyles,
  focusProjectNoteAtEnd,
  installProjectNoteEntryPoints,
  markdownFiles,
  newNoteParentPath,
  noteDisplayName,
  openProjectNote,
  resolveNoteFile,
  safeNewNoteTitle,
  uniqueNewNotePath,
  vaultFolders
};

},
"project-notes.cjs": (module, exports, require) => {
'use strict';

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function createId(prefix = 'note-ref') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function normalizeNoteFolder(rawPath) {
  const raw = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[<>:"|?*\x00-\x1F]/.test(part))) {
    throw new Error('项目笔记文件夹必须是 Vault 内的安全相对路径。');
  }
  return parts.join('/').normalize('NFC');
}

function normalizeNotePath(rawPath) {
  const parts = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..')) throw new Error('笔记路径无效。');
  const normalized = parts.join('/').normalize('NFC');
  if (!/\.md$/i.test(normalized)) throw new Error('项目笔记必须是 Markdown 文件。');
  return normalized;
}

function ensureProjectNotesState(state) {
  if (!state || typeof state !== 'object') throw new Error('Go Study 状态不可用。');
  state.projectNotes = objectOr(state.projectNotes);
  state.uiState = objectOr(state.uiState);
  state.uiState.recentProjectNoteIds = objectOr(state.uiState.recentProjectNoteIds);
  state.uiState.recentStudyByProject = objectOr(state.uiState.recentStudyByProject);
  for (const project of Object.values(objectOr(state.projects))) {
    try { project.noteFolder = normalizeNoteFolder(project.noteFolder); }
    catch { project.noteFolder = ''; }
  }

  const normalized = {};
  const seen = new Set();
  for (const [id, raw] of Object.entries(state.projectNotes)) {
    const item = objectOr(raw);
    if (!state.projects?.[item.projectId] || state.projects[item.projectId].deletedAt) continue;
    try {
      const path = normalizeNotePath(item.path);
      const key = `${item.projectId}\u0000${path.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Normalize the existing object in place. Runtime code may still hold a
      // reference to the selected project note while Vault lifecycle events
      // update its path, so replacing every object during normalization would
      // leave that reference stale even though state.projectNotes was correct.
      item.id = id;
      item.projectId = String(item.projectId);
      item.path = path;
      item.missingAt = String(item.missingAt || '');
      item.createdAt = String(item.createdAt || '');
      item.updatedAt = String(item.updatedAt || '');
      normalized[id] = item;
    } catch {}
  }
  state.projectNotes = normalized;

  for (const [projectId, noteId] of Object.entries(state.uiState.recentProjectNoteIds)) {
    if (!state.projects?.[projectId] || !normalized[noteId] || normalized[noteId].projectId !== projectId) {
      delete state.uiState.recentProjectNoteIds[projectId];
    }
  }
  for (const [projectId, rawStudy] of Object.entries(state.uiState.recentStudyByProject)) {
    const study = objectOr(rawStudy);
    if (!state.projects?.[projectId] || !state.resources?.[study.resourceId]) {
      delete state.uiState.recentStudyByProject[projectId];
      continue;
    }
    const noteId = String(study.noteId || '');
    if (noteId && (!normalized[noteId] || normalized[noteId].projectId !== projectId)) study.noteId = '';
    state.uiState.recentStudyByProject[projectId] = {
      projectId,
      resourceId: String(study.resourceId),
      noteId: String(study.noteId || ''),
      updatedAt: String(study.updatedAt || '')
    };
  }
  return state;
}

function projectNoteFolder(state, projectId) {
  ensureProjectNotesState(state);
  return String(state.projects?.[projectId]?.noteFolder || '');
}

function setProjectNoteFolder(state, projectId, rawFolder, at = new Date()) {
  ensureProjectNotesState(state);
  const project = state.projects?.[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  project.noteFolder = normalizeNoteFolder(rawFolder);
  project.updatedAt = at.toISOString();
  return project.noteFolder;
}

function projectNotes(state, projectId) {
  ensureProjectNotesState(state);
  return Object.values(state.projectNotes)
    .filter((note) => note.projectId === projectId)
    .sort((a, b) => Number(Boolean(a.missingAt)) - Number(Boolean(b.missingAt))
      || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
      || String(a.path).localeCompare(String(b.path), 'zh-CN'));
}

function findProjectNoteByPath(state, projectId, rawPath) {
  const path = normalizeNotePath(rawPath);
  return projectNotes(state, projectId).find((note) => note.path.toLowerCase() === path.toLowerCase()) || null;
}

function linkProjectNote(state, projectId, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const project = state.projects?.[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const path = normalizeNotePath(rawPath);
  const existing = findProjectNoteByPath(state, projectId, path);
  const timestamp = at.toISOString();
  if (existing) {
    existing.missingAt = '';
    existing.updatedAt = timestamp;
    return { note: existing, reused: true };
  }
  const id = createId('project-note');
  const note = {
    id,
    projectId,
    path,
    missingAt: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  state.projectNotes[id] = note;
  return { note, reused: false };
}

function unlinkProjectNote(state, projectId, noteId) {
  ensureProjectNotesState(state);
  const note = state.projectNotes?.[noteId];
  if (!note || note.projectId !== projectId) return { removed: false, note: null };
  delete state.projectNotes[noteId];
  if (state.uiState.recentProjectNoteIds[projectId] === noteId) delete state.uiState.recentProjectNoteIds[projectId];
  const study = state.uiState.recentStudyByProject[projectId];
  if (study?.noteId === noteId) study.noteId = '';
  return { removed: true, note };
}

function setRecentProjectNote(state, projectId, noteId, at = new Date()) {
  ensureProjectNotesState(state);
  const note = state.projectNotes?.[noteId];
  if (!note || note.projectId !== projectId) throw new Error('找不到项目笔记。');
  state.uiState.recentProjectNoteIds[projectId] = note.id;
  note.updatedAt = at.toISOString();
  return note;
}

function recentProjectNote(state, projectId) {
  ensureProjectNotesState(state);
  const noteId = String(state.uiState.recentProjectNoteIds?.[projectId] || '');
  const note = noteId ? state.projectNotes?.[noteId] : null;
  return note && note.projectId === projectId ? note : null;
}

function projectIdForResource(state, resourceId) {
  const id = String(resourceId || '');
  if (!id || !state.resources?.[id] || state.resources[id].deletedAt) return '';
  const currentProjectId = String(state.uiState?.currentProjectId || '');
  const memberships = Object.values(objectOr(state.modules))
    .filter((module) => !module.deletedAt && (module.resourceIds || []).includes(id) && state.projects?.[module.projectId] && !state.projects[module.projectId].deletedAt);
  if (!memberships.length) return '';
  if (currentProjectId && memberships.some((module) => module.projectId === currentProjectId)) return currentProjectId;
  memberships.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.id).localeCompare(String(b.id)));
  return String(memberships[0].projectId || '');
}

function recordRecentStudy(state, projectId, resourceId, noteId = '', at = new Date()) {
  ensureProjectNotesState(state);
  if (!state.projects?.[projectId] || state.projects[projectId].deletedAt) throw new Error('找不到项目。');
  if (!state.resources?.[resourceId] || state.resources[resourceId].deletedAt) throw new Error('找不到学习资源。');
  const safeNoteId = String(noteId || '');
  if (safeNoteId) {
    const note = state.projectNotes?.[safeNoteId];
    if (!note || note.projectId !== projectId) throw new Error('学习笔记不属于当前项目。');
    setRecentProjectNote(state, projectId, safeNoteId, at);
  }
  state.uiState.recentStudyByProject[projectId] = {
    projectId,
    resourceId,
    noteId: safeNoteId,
    updatedAt: at.toISOString()
  };
  return state.uiState.recentStudyByProject[projectId];
}

function recentStudy(state, projectId) {
  ensureProjectNotesState(state);
  const study = state.uiState.recentStudyByProject?.[projectId];
  if (!study || !state.resources?.[study.resourceId] || state.resources[study.resourceId].deletedAt) return null;
  const note = study.noteId ? state.projectNotes?.[study.noteId] || null : null;
  return { ...study, resource: state.resources[study.resourceId], note };
}

function updateProjectNotePathsOnRename(state, oldRawPath, newRawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const oldPath = String(oldRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  const newPath = String(newRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!oldPath || !newPath) return 0;
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    const current = note.path;
    if (current !== oldPath && !current.startsWith(`${oldPath}/`)) continue;
    const next = current === oldPath ? newPath : `${newPath}${current.slice(oldPath.length)}`;
    try {
      note.path = normalizeNotePath(next);
      note.missingAt = '';
      note.updatedAt = at.toISOString();
      changed += 1;
    } catch {
      note.missingAt = at.toISOString();
      note.updatedAt = at.toISOString();
    }
  }
  return changed;
}

function updateProjectNoteFoldersOnRename(state, oldRawPath, newRawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const oldPath = String(oldRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  const newPath = String(newRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!oldPath || !newPath) return 0;
  let changed = 0;
  for (const project of Object.values(objectOr(state.projects))) {
    const current = String(project.noteFolder || '');
    if (!current || (current !== oldPath && !current.startsWith(`${oldPath}/`))) continue;
    const next = current === oldPath ? newPath : `${newPath}${current.slice(oldPath.length)}`;
    try { project.noteFolder = normalizeNoteFolder(next); }
    catch { project.noteFolder = ''; }
    project.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function clearProjectNoteFoldersOnDelete(state, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const path = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!path) return 0;
  let changed = 0;
  for (const project of Object.values(objectOr(state.projects))) {
    const current = String(project.noteFolder || '');
    if (!current || (current !== path && !current.startsWith(`${path}/`))) continue;
    project.noteFolder = '';
    project.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function markProjectNotesMissing(state, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const path = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!path) return 0;
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    if (note.path !== path && !note.path.startsWith(`${path}/`)) continue;
    if (!note.missingAt) note.missingAt = at.toISOString();
    note.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function restoreProjectNotePath(state, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  let path;
  try { path = normalizeNotePath(rawPath); } catch { return 0; }
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    if (note.path !== path || !note.missingAt) continue;
    note.missingAt = '';
    note.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function playerTimeFromSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

module.exports = {
  clearProjectNoteFoldersOnDelete,
  ensureProjectNotesState,
  findProjectNoteByPath,
  linkProjectNote,
  markProjectNotesMissing,
  normalizeNoteFolder,
  normalizeNotePath,
  playerTimeFromSeconds,
  projectNoteFolder,
  projectIdForResource,
  projectNotes,
  recentProjectNote,
  recentStudy,
  recordRecentStudy,
  restoreProjectNotePath,
  setProjectNoteFolder,
  setRecentProjectNote,
  unlinkProjectNote,
  updateProjectNoteFoldersOnRename,
  updateProjectNotePathsOnRename
};

},
"quick-note-window.cjs": (module, exports, require) => {
'use strict';

const { Modal } = require('obsidian');

function resolveRemote(options = {}) {
  if (options.remote) return options.remote;
  try { return require('@electron/remote'); } catch { return null; }
}

function encodeTitlePayload(prefix, value = '') {
  return `${prefix}:${Buffer.from(String(value), 'utf8').toString('base64')}`;
}

function decodeTitlePayload(title, prefix) {
  const marker = `${prefix}:`;
  if (!String(title || '').startsWith(marker)) return null;
  try { return Buffer.from(String(title).slice(marker.length), 'base64').toString('utf8'); }
  catch { return null; }
}

function promptHtml(options = {}) {
  const title = String(options.title || '快速笔记');
  const subtitle = String(options.subtitle || 'Enter 保存 · Shift+Enter 换行 · Esc 取消');
  const placeholder = String(options.placeholder || '写下这一刻的笔记…');
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#17191d;color:#f3f4f6;padding:13px 14px 12px;overflow:hidden}
  .drag{padding:1px 2px 8px;-webkit-app-region:drag;cursor:move;user-select:none}
  .title{font-size:14px;font-weight:650;margin-bottom:3px}.sub{font-size:11.5px;color:#8f96a3}
  textarea{-webkit-app-region:no-drag;width:100%;height:82px;resize:none;border:1px solid rgba(148,163,184,.22);border-radius:10px;background:#22252b;color:#fff;padding:10px 12px;font:14px/1.45 Segoe UI,system-ui,sans-serif;outline:none;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.32) transparent}
  textarea:focus{border-color:rgba(167,139,250,.62);box-shadow:0 0 0 2px rgba(124,58,237,.10)}
  textarea::-webkit-scrollbar{width:5px}textarea::-webkit-scrollbar-track{background:transparent}textarea::-webkit-scrollbar-thumb{background:rgba(148,163,184,.28);border-radius:999px}textarea::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,.45)}
  .hint{margin-top:5px;font-size:10px;color:#666d78;text-align:right}
  </style></head><body><div class="drag"><div class="title">${esc(title)}</div><div class="sub">${esc(subtitle)} · 拖动顶部可调整位置</div></div><textarea autofocus placeholder="${esc(placeholder)}"></textarea><div class="hint">Go Study</div><script>
  const box=document.querySelector('textarea');
  const submit=()=>{ const text=box.value.trim(); if(!text) return; document.title='GO_STUDY_SUBMIT:'+btoa(unescape(encodeURIComponent(text))); };
  box.addEventListener('keydown',(event)=>{ if(event.key==='Escape'){event.preventDefault();document.title='GO_STUDY_CANCEL:';} else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();} });
  window.addEventListener('load',()=>{box.focus();box.select();});
  </script></body></html>`;
}

function showNativeQuickNote(options = {}) {
  const remote = resolveRemote(options);
  const BrowserWindow = options.BrowserWindow || remote?.BrowserWindow;
  if (!BrowserWindow) return null;
  const screen = options.screen || remote?.screen;
  const point = screen?.getCursorScreenPoint?.() || { x: 0, y: 0 };
  const display = screen?.getDisplayNearestPoint?.(point);
  const area = display?.workArea || { x: 0, y: 0, width: 1280, height: 720 };
  const width = 520;
  const height = 176;
  const remembered = options.geometry && typeof options.geometry === 'object' ? options.geometry : {};
  const safeX = Number.isFinite(Number(remembered.x))
    ? Math.min(area.x + area.width - width, Math.max(area.x, Number(remembered.x)))
    : Math.round(area.x + (area.width - width) / 2);
  const safeY = Number.isFinite(Number(remembered.y))
    ? Math.min(area.y + area.height - height, Math.max(area.y, Number(remembered.y)))
    : Math.round(area.y + Math.max(90, area.height * 0.36));
  const win = new BrowserWindow({
    width,
    height,
    x: safeX,
    y: safeY,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        if (!win.isDestroyed()) {
          const bounds = win.getBounds?.();
          if (bounds && typeof options.onGeometryChange === 'function') {
            void Promise.resolve(options.onGeometryChange({
              x: Number(bounds.x),
              y: Number(bounds.y),
              width: Number(bounds.width),
              height: Number(bounds.height)
            })).catch(() => {});
          }
          win.close();
        }
      } catch {}
      resolve(value);
    };
    win.on('closed', () => finish(null));
    win.webContents.on('page-title-updated', (event, title) => {
      if (String(title).startsWith('GO_STUDY_CANCEL:')) { event.preventDefault(); finish(null); return; }
      const text = decodeTitlePayload(title, 'GO_STUDY_SUBMIT');
      if (text !== null) { event.preventDefault(); finish(text.trim() || null); }
    });
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(promptHtml(options))}`);
  });
}

class FallbackNoteModal extends Modal {
  constructor(app, options, resolve) {
    super(app); this.options = options; this.resolve = resolve; this.settled = false;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl('h3', { text: this.options.title || '快速笔记' });
    const input = this.contentEl.createEl('textarea', { attr: { placeholder: this.options.placeholder || '写下这一刻的笔记…' } });
    input.style.width = '100%'; input.style.minHeight = '110px';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.finish(null); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.finish(input.value.trim() || null); }
    });
    setTimeout(() => input.focus(), 0);
  }
  finish(value) { if (this.settled) return; this.settled = true; this.resolve(value); this.close(); }
  onClose() { if (!this.settled) { this.settled = true; this.resolve(null); } this.contentEl.empty(); }
}

function showQuickNoteInput(plugin, options = {}) {
  const remembered = plugin?.state?.uiState?.quickNoteWindowGeometry || null;
  const native = showNativeQuickNote({
    ...options,
    geometry: options.geometry || remembered,
    onGeometryChange: options.onGeometryChange || (async (geometry) => {
      if (!plugin?.state) return;
      plugin.state.uiState ||= {};
      plugin.state.uiState.quickNoteWindowGeometry = geometry;
      await plugin.persist?.();
    })
  });
  if (native) return native;
  return new Promise((resolve) => new FallbackNoteModal(plugin.app, options, resolve).open());
}

async function showNativeToast(message, options = {}) {
  const remote = resolveRemote(options);
  const BrowserWindow = options.BrowserWindow || remote?.BrowserWindow;
  if (!BrowserWindow) return false;
  const screen = options.screen || remote?.screen;
  const point = screen?.getCursorScreenPoint?.() || { x: 0, y: 0 };
  const display = screen?.getDisplayNearestPoint?.(point);
  const area = display?.workArea || { x: 0, y: 0, width: 1280, height: 720 };
  const width = 300; const height = 56;
  const win = new BrowserWindow({
    width, height,
    x: Math.round(area.x + area.width - width - 28),
    y: Math.round(area.y + area.height - height - 42),
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, resizable: false, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const safe = String(message || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const html = `<!doctype html><html><body style="margin:0;background:rgba(20,22,26,.92);color:#fff;border-radius:10px;font:13px Segoe UI,system-ui,sans-serif;display:flex;align-items:center;padding:0 16px;height:56px">${safe}</body></html>`;
  win.once('ready-to-show', () => win.showInactive?.() || win.show());
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  setTimeout(() => { try { if (!win.isDestroyed()) win.close(); } catch {} }, Number(options.durationMs || 1200));
  return true;
}

module.exports = {
  FallbackNoteModal,
  decodeTitlePayload,
  encodeTitlePayload,
  promptHtml,
  resolveRemote,
  showNativeQuickNote,
  showNativeToast,
  showQuickNoteInput
};

},
"release-hardening.cjs": (module, exports, require) => {
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ANKI_ENDPOINT = 'http://127.0.0.1:8765';
const DEFAULT_BACKUP_RETENTION = 10;

function normalizeLoopbackHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' ? '127.0.0.1' : value;
}

function normalizeAnkiEndpoint(rawEndpoint = DEFAULT_ANKI_ENDPOINT) {
  const raw = String(rawEndpoint || DEFAULT_ANKI_ENDPOINT).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('AnkiConnect 地址无效，请使用本机地址，例如 http://127.0.0.1:8765。');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('AnkiConnect 地址只能使用 HTTP 或 HTTPS。');
  }
  if (url.username || url.password) {
    throw new Error('AnkiConnect 地址不能包含用户名或密码。');
  }

  const hostname = normalizeLoopbackHostname(url.hostname);
  if (hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error('为避免把 AnkiConnect 暴露到远程网络，当前版本只允许连接本机 127.0.0.1、localhost 或 ::1。');
  }

  url.hostname = hostname === '::1' ? '[::1]' : hostname;
  url.hash = '';
  const normalized = url.toString();
  return normalized.endsWith('/') && url.pathname === '/' && !url.search
    ? normalized.slice(0, -1)
    : normalized;
}

function stateBackupEntries(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^state-[a-z0-9._-]+\.json$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name, fullPath, mtimeMs: Number(stat.mtimeMs || 0) };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
}

function pruneStateBackups(backupDir, keep = DEFAULT_BACKUP_RETENTION) {
  const retention = Math.max(1, Math.min(100, Math.floor(Number(keep) || DEFAULT_BACKUP_RETENTION)));
  const entries = stateBackupEntries(backupDir);
  const removed = [];
  for (const entry of entries.slice(retention)) {
    fs.unlinkSync(entry.fullPath);
    removed.push(entry.name);
  }
  return removed;
}

async function revealLoadedLeaf(workspace, leaf) {
  if (!leaf) return null;
  if (typeof workspace?.revealLeaf === 'function') await workspace.revealLeaf(leaf);
  else if (typeof leaf.loadIfDeferred === 'function') await leaf.loadIfDeferred();
  return leaf.view || null;
}

module.exports = {
  DEFAULT_ANKI_ENDPOINT,
  DEFAULT_BACKUP_RETENTION,
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf,
  stateBackupEntries
};

},
"resource-locator.cjs": (module, exports, require) => {
'use strict';

const RESOURCE_SCHEMA_VERSION = 2;
const LOCATOR_HISTORY_LIMIT = 10;
const installedModels = new WeakSet();

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeOpenListPathCompat(rawPath) {
  let value = String(rawPath || '/').split(/[?#]/, 1)[0] || '/';
  try { value = decodeURIComponent(value); } catch { /* Keep the original text when legacy data has bad encoding. */ }
  const parts = value.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) return '';
  return `/${parts.join('/')}`.normalize('NFC');
}

function normalizeTimePosition(value) {
  const candidate = value?.type === 'time' ? value.seconds : value;
  if (candidate === '' || candidate === null || candidate === undefined) return null;
  const seconds = Number(candidate);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return { type: 'time', seconds };
}

function normalizeOpenListLocator(value) {
  const locator = objectOr(value);
  const remotePath = normalizeOpenListPathCompat(locator.remotePath || '');
  if (!remotePath) throw new Error('OpenList 资源路径无效。');
  const sourceId = String(locator.sourceId || '').trim();
  if (!sourceId) throw new Error('OpenList 资源缺少来源 ID。');
  return { type: 'openlist', sourceId, remotePath };
}

function openListLocatorFromResource(resource) {
  const source = objectOr(resource);
  const launcher = objectOr(source.launcher);
  const metadata = objectOr(source.metadata);
  const stored = objectOr(source.locator);

  if (stored.type === 'openlist') {
    const remotePath = normalizeOpenListPathCompat(stored.remotePath);
    if (remotePath) {
      return {
        type: 'openlist',
        sourceId: String(stored.sourceId || source.sourceId || launcher.sourceId || ''),
        remotePath
      };
    }
  }

  const legacyOpenList = launcher.type === 'openlist' || launcher.type === 'openlist-file' || Boolean(metadata.remotePath);
  if (!legacyOpenList) return null;
  const remotePath = normalizeOpenListPathCompat(launcher.remotePath || metadata.remotePath || '');
  if (!remotePath) return null;
  return {
    type: 'openlist',
    sourceId: String(launcher.sourceId || source.sourceId || ''),
    remotePath
  };
}

function locatorKey(locator) {
  const normalized = normalizeOpenListLocator(locator);
  return `${normalized.sourceId}\n${normalized.remotePath.toLocaleLowerCase()}`;
}

function sameOpenListLocator(left, right) {
  if (!left || !right) return false;
  try { return locatorKey(left) === locatorKey(right); } catch { return false; }
}

function normalizeLocatorHistory(value) {
  const normalized = [];
  for (const rawEntry of Array.isArray(value) ? value : []) {
    const entry = objectOr(rawEntry);
    if (entry.type !== 'openlist') continue;
    const remotePath = normalizeOpenListPathCompat(entry.remotePath);
    if (!remotePath) continue;
    const item = {
      type: 'openlist',
      sourceId: String(entry.sourceId || ''),
      remotePath,
      changedAt: String(entry.changedAt || '')
    };
    const key = `${item.type}:${item.sourceId}:${item.remotePath}`;
    const existingIndex = normalized.findIndex((candidate) => `${candidate.type}:${candidate.sourceId}:${candidate.remotePath}` === key);
    if (existingIndex >= 0) normalized.splice(existingIndex, 1);
    normalized.push(item);
  }
  return normalized.slice(-LOCATOR_HISTORY_LIMIT);
}

function identityHintsForResource(resource, locator) {
  const source = objectOr(resource);
  const metadata = objectOr(source.metadata);
  const existing = objectOr(source.identityHints);
  const fileName = locator?.remotePath?.split('/').filter(Boolean).pop() || String(existing.fileName || '');
  const sizeCandidate = existing.size ?? metadata.size;
  const size = Number(sizeCandidate);
  return {
    ...existing,
    ...(fileName ? { fileName } : {}),
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
    modified: String(existing.modified ?? metadata.modified ?? '')
  };
}

function resumeForResource(resource) {
  const source = objectOr(resource);
  const existing = objectOr(source.resume);
  const position = normalizeTimePosition(existing.position) || normalizeTimePosition(source.lastPosition);
  if (!position) return Object.keys(existing).length ? { ...existing } : null;
  return {
    ...existing,
    position,
    updatedAt: String(existing.updatedAt || source.lastOpenedAt || source.updatedAt || '')
  };
}

function mirrorOpenListLocator(resource, locator) {
  if (!locator) return resource;
  const launcher = objectOr(resource.launcher);
  const metadata = objectOr(resource.metadata);
  const launcherType = launcher.type === 'openlist' || launcher.type === 'openlist-file'
    ? launcher.type
    : resource.kind === 'video' ? 'openlist' : 'openlist-file';
  resource.sourceId = locator.sourceId;
  resource.launcher = {
    ...launcher,
    type: launcherType,
    sourceId: locator.sourceId,
    remotePath: locator.remotePath
  };
  resource.metadata = {
    ...metadata,
    remotePath: locator.remotePath
  };
  return resource;
}

function normalizeResourceRecord(rawResource, fallbackId = '') {
  const source = objectOr(rawResource);
  const resource = {
    ...source,
    id: String(source.id || fallbackId)
  };
  const locator = openListLocatorFromResource(resource);
  if (locator) {
    resource.locator = locator;
    resource.locatorHistory = normalizeLocatorHistory(source.locatorHistory);
    resource.identityHints = identityHintsForResource(resource, locator);
    mirrorOpenListLocator(resource, locator);
  } else {
    if (Array.isArray(source.locatorHistory)) resource.locatorHistory = normalizeLocatorHistory(source.locatorHistory);
    if (source.identityHints && typeof source.identityHints === 'object') resource.identityHints = { ...source.identityHints };
  }
  const resume = resumeForResource(resource);
  if (resume) resource.resume = resume;
  return resource;
}

function normalizeResourceLocatorState(rawState) {
  const state = objectOr(rawState);
  const resources = {};
  for (const [key, rawResource] of Object.entries(objectOr(state.resources))) {
    resources[key] = normalizeResourceRecord(rawResource, key);
  }
  state.resources = resources;
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  return state;
}

function normalizeFactoryResult(state, result) {
  if (!result?.resource) return result;
  const resourceId = String(result.resource.id || '');
  if (!resourceId) return result;
  const normalized = normalizeResourceRecord(result.resource, resourceId);
  state.resources[resourceId] = normalized;
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  result.resource = normalized;
  return result;
}

function openListCanonicalKey(state, locator) {
  const normalized = normalizeOpenListLocator(locator);
  const source = objectOr(state?.sources)[normalized.sourceId];
  const identity = String(source?.identity || source?.id || normalized.sourceId);
  return `openlist:${identity}:${normalized.remotePath.toLocaleLowerCase()}`;
}

function findOpenListLocatorConflict(state, locator, excludedResourceIds = []) {
  const excluded = new Set(Array.isArray(excludedResourceIds) ? excludedResourceIds : [excludedResourceIds]);
  for (const resource of Object.values(objectOr(state?.resources))) {
    if (!resource?.id || resource.deletedAt || excluded.has(resource.id)) continue;
    const existing = openListLocatorFromResource(resource);
    if (existing && sameOpenListLocator(existing, locator)) return resource;
  }
  return null;
}

function appendLocatorHistory(resource, locator, changedAt) {
  if (!locator) return [];
  const history = normalizeLocatorHistory([
    ...(Array.isArray(resource.locatorHistory) ? resource.locatorHistory : []),
    { ...normalizeOpenListLocator(locator), changedAt: String(changedAt || new Date().toISOString()) }
  ]);
  resource.locatorHistory = history;
  return history;
}

function updateResourceLocator(state, resourceId, nextLocator, options = {}) {
  const resources = objectOr(state?.resources);
  const resource = resources[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
  const normalized = normalizeOpenListLocator(nextLocator);
  const current = openListLocatorFromResource(resource);
  if (current && sameOpenListLocator(current, normalized)) return { resource, changed: false, previousLocator: current };

  const conflict = findOpenListLocatorConflict(state, normalized, [resource.id]);
  if (conflict) throw new Error(`目标位置已关联到另一条资源：${conflict.title || conflict.id}`);

  const changedAt = options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
  if (current) appendLocatorHistory(resource, current, changedAt);
  resource.locator = normalized;
  resource.identityHints = identityHintsForResource(resource, normalized);
  mirrorOpenListLocator(resource, normalized);
  resource.canonicalKey = openListCanonicalKey(state, normalized);
  resource.updatedAt = changedAt;
  if (options.rootPath) resource.metadata.rootPath = normalizeOpenListPathCompat(options.rootPath);
  state.schemaVersion = RESOURCE_SCHEMA_VERSION;
  return { resource, changed: true, previousLocator: current, locator: normalized };
}

function pathWithinPrefix(remotePath, prefix) {
  return remotePath === prefix || remotePath.startsWith(`${prefix}/`);
}

function remapPathPrefix(remotePath, oldPrefix, newPrefix) {
  const pathValue = normalizeOpenListPathCompat(remotePath);
  const oldValue = normalizeOpenListPathCompat(oldPrefix);
  const newValue = normalizeOpenListPathCompat(newPrefix);
  if (!pathValue || !oldValue || !newValue || !pathWithinPrefix(pathValue, oldValue)) return '';
  const suffix = pathValue.slice(oldValue.length);
  return normalizeOpenListPathCompat(`${newValue}${suffix}`);
}

function previewOpenListPathRemap(state, input = {}) {
  const sourceId = String(input.sourceId || '').trim();
  if (!sourceId) throw new Error('批量迁移缺少 OpenList 来源。');
  const oldPrefix = normalizeOpenListPathCompat(input.oldPrefix || '');
  const newPrefix = normalizeOpenListPathCompat(input.newPrefix || '');
  if (!oldPrefix || !newPrefix) throw new Error('批量迁移目录无效。');
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');

  const resources = Object.values(objectOr(state?.resources)).filter((resource) => {
    if (!resource?.id || resource.deletedAt) return false;
    const locator = openListLocatorFromResource(resource);
    return locator?.sourceId === sourceId && pathWithinPrefix(locator.remotePath, oldPrefix);
  });
  const candidateIds = new Set(resources.map((resource) => resource.id));
  const targetOwners = new Map();
  for (const resource of Object.values(objectOr(state?.resources))) {
    if (!resource?.id || resource.deletedAt || candidateIds.has(resource.id)) continue;
    const locator = openListLocatorFromResource(resource);
    if (locator?.sourceId === sourceId) targetOwners.set(locatorKey(locator), resource);
  }

  const seenTargets = new Map();
  const entries = resources.map((resource) => {
    const from = openListLocatorFromResource(resource);
    const remotePath = remapPathPrefix(from.remotePath, oldPrefix, newPrefix);
    const to = { type: 'openlist', sourceId, remotePath };
    const key = locatorKey(to);
    const externalConflict = targetOwners.get(key);
    const duplicateCandidate = seenTargets.get(key);
    const conflict = externalConflict || duplicateCandidate || null;
    if (!duplicateCandidate) seenTargets.set(key, resource);
    return {
      resourceId: resource.id,
      title: String(resource.title || ''),
      from,
      to,
      status: conflict ? 'conflict' : 'ready',
      conflictResourceId: conflict?.id || '',
      conflictTitle: String(conflict?.title || '')
    };
  });

  return {
    sourceId,
    oldPrefix,
    newPrefix,
    entries,
    readyCount: entries.filter((entry) => entry.status === 'ready').length,
    conflictCount: entries.filter((entry) => entry.status === 'conflict').length
  };
}

function applyOpenListPathRemap(state, preview, options = {}) {
  const changedAt = options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
  const updated = [];
  const skipped = [];
  for (const entry of Array.isArray(preview?.entries) ? preview.entries : []) {
    if (entry.status !== 'ready') {
      skipped.push(entry);
      continue;
    }
    const resource = objectOr(state?.resources)[entry.resourceId];
    if (!resource || resource.deletedAt) {
      skipped.push({ ...entry, status: 'missing-resource' });
      continue;
    }
    const current = openListLocatorFromResource(resource);
    if (!sameOpenListLocator(current, entry.from)) {
      skipped.push({ ...entry, status: 'changed-since-preview' });
      continue;
    }
    const oldRoot = normalizeOpenListPathCompat(resource.metadata?.rootPath || '');
    const nextRoot = oldRoot && pathWithinPrefix(oldRoot, preview.oldPrefix)
      ? remapPathPrefix(oldRoot, preview.oldPrefix, preview.newPrefix)
      : '';
    const result = updateResourceLocator(state, resource.id, entry.to, {
      changedAt,
      ...(nextRoot ? { rootPath: nextRoot } : {})
    });
    if (result.changed) updated.push(resource.id);
  }
  return { updatedResourceIds: updated, skipped };
}

function installModelResourceLocatorV2(model) {
  if (!model || typeof model !== 'object') throw new Error('Resource locator migration requires the model module.');
  if (installedModels.has(model)) return model;

  const legacySchemaVersion = Number(model.SCHEMA_VERSION || 1);
  const legacyNormalizeState = model.normalizeState;
  if (typeof legacyNormalizeState !== 'function') throw new Error('Model normalizeState is unavailable.');

  model.normalizeState = function normalizeStateWithResourceLocators(raw) {
    const input = objectOr(raw);
    const inputVersion = Number(input.schemaVersion || 0);
    if (Number.isFinite(inputVersion) && inputVersion > RESOURCE_SCHEMA_VERSION) {
      throw new Error(`数据版本 ${inputVersion} 高于当前支持的 ${RESOURCE_SCHEMA_VERSION}，已停止加载以避免覆盖较新数据。`);
    }
    const compatibleInput = inputVersion > legacySchemaVersion
      ? { ...input, schemaVersion: legacySchemaVersion }
      : input;
    return normalizeResourceLocatorState(legacyNormalizeState(compatibleInput));
  };

  for (const methodName of ['addResource', 'addInboxResource', 'upsertResourceDescriptor', 'upsertInboxDescriptor']) {
    const legacyMethod = model[methodName];
    if (typeof legacyMethod !== 'function') continue;
    model[methodName] = function resourceFactoryWithLocator(state, ...args) {
      return normalizeFactoryResult(state, legacyMethod(state, ...args));
    };
  }

  model.SCHEMA_VERSION = RESOURCE_SCHEMA_VERSION;
  installedModels.add(model);
  return model;
}

module.exports = {
  LOCATOR_HISTORY_LIMIT,
  RESOURCE_SCHEMA_VERSION,
  appendLocatorHistory,
  applyOpenListPathRemap,
  findOpenListLocatorConflict,
  identityHintsForResource,
  installModelResourceLocatorV2,
  locatorKey,
  mirrorOpenListLocator,
  normalizeLocatorHistory,
  normalizeOpenListLocator,
  normalizeOpenListPathCompat,
  normalizeResourceLocatorState,
  normalizeResourceRecord,
  normalizeTimePosition,
  openListCanonicalKey,
  openListLocatorFromResource,
  pathWithinPrefix,
  previewOpenListPathRemap,
  remapPathPrefix,
  resumeForResource,
  sameOpenListLocator,
  updateResourceLocator
};

},
"resource-note.cjs": (module, exports, require) => {
'use strict';

const { buildFreeformReferenceUri, buildReferenceUri, freeformLocatorName, normalizeReferencePosition } = __rhLoad("resource-reference.cjs");
const {
  DEFAULT_PRODUCT_SETTINGS,
  normalizeOutputTemplate,
  normalizeTimeDisplayFormat
} = __rhLoad("product-settings.cjs");

function formatPositionClock(position, mode = 'smart') {
  const normalized = normalizeReferencePosition(position);
  const total = Math.floor(normalized.seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const format = normalizeTimeDisplayFormat(mode);
  if (format === 'hms') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeMarkdownLabel(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
    .replace(/\[/g, '\\[')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function renderOutputTemplate(template, values = {}) {
  return String(template || '').replace(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(values, token)) return match;
    return String(values[token] ?? '');
  });
}

function buildPositionMarkdown(resource, position, options = {}) {
  if (!resource?.id) throw new Error('无法为缺少 Resource ID 的资源生成回链。');
  const normalized = normalizeReferencePosition(position);
  const uri = buildReferenceUri({ resourceId: resource.id, position: normalized, version: 1 });
  const time = formatPositionClock(normalized, options.timeFormat || DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat);
  const title = escapeMarkdownLabel(options.title || resource.title || '学习资源');
  const template = normalizeOutputTemplate(
    'backlinkTemplate',
    options.template ?? options.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate
  );
  return renderOutputTemplate(template, { title, time, uri });
}

function freeformMediaTitle(media = {}) {
  const explicit = String(media.title || '').replace(/\s+-\s+PotPlayer\s*$/i, '').trim();
  if (explicit && explicit.toLowerCase() !== 'potplayer') return explicit;
  const raw = String(media.path || '').trim();
  try {
    const url = new URL(raw);
    const tail = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname || '临时视频');
    return tail || url.hostname || '临时视频';
  } catch {}
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.pop() || '临时视频';
}

function freeformWebLocator(media = {}) {
  const raw = String(media.web || media.path || '').trim();
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function buildFreeformPositionMarkdown(media, position, options = {}) {
  const normalized = normalizeReferencePosition(position);
  const locator = String(media?.path || '').trim();
  const uri = buildFreeformReferenceUri({
    locator,
    name: freeformLocatorName(locator),
    position: normalized
  });
  const time = formatPositionClock(normalized, options.timeFormat || DEFAULT_PRODUCT_SETTINGS.timeDisplayFormat);
  const title = escapeMarkdownLabel(options.title || '回到课程');
  const template = normalizeOutputTemplate(
    'backlinkTemplate',
    options.template ?? options.backlinkTemplate ?? DEFAULT_PRODUCT_SETTINGS.backlinkTemplate
  );
  return renderOutputTemplate(template, { title, time, uri });
}

function buildContextPositionMarkdown(context, options = {}) {
  if (context?.mode === 'freeform') {
    return buildFreeformPositionMarkdown(context.bridgeMedia || context.freeform || {}, context.position, options);
  }
  return buildPositionMarkdown(context?.resource, context?.position, options);
}

function normalizeUserNote(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function buildNotePositionMarkdown(resource, position, noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('noteTemplate', options.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate);
  return renderOutputTemplate(template, { note, backlink });
}

function normalizeCaptureImage(vaultImagePath) {
  const imagePath = String(vaultImagePath || '').trim().replace(/\\/g, '/');
  if (!imagePath || imagePath.includes('..')) throw new Error('截图 Vault 路径无效。');
  return `![[${imagePath}]]`;
}
function buildPlainNoteMarkdown(noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const template = normalizeOutputTemplate('plainNoteTemplate', options.plainNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainNoteTemplate);
  return renderOutputTemplate(template, { note });
}

function buildPlainCaptureMarkdown(vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const template = normalizeOutputTemplate('plainCaptureTemplate', options.plainCaptureTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureTemplate);
  return renderOutputTemplate(template, { image });
}

function buildPlainCaptureNoteMarkdown(vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const template = normalizeOutputTemplate(
    'plainCaptureNoteTemplate',
    options.plainCaptureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.plainCaptureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note });
}


function buildCaptureMarkdown(resource, position, vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('captureTemplate', options.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate);
  return renderOutputTemplate(template, { image, backlink });
}

function buildCaptureNoteMarkdown(resource, position, vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildPositionMarkdown(resource, position, {
    title: options.backlinkTitle || '回到课程',
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate(
    'captureNoteTemplate',
    options.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note, backlink });
}
function contextBacklinkTitle(_context, options = {}) {
  if (options.backlinkTitle) return options.backlinkTitle;
  return '回到课程';
}

function buildContextNoteMarkdown(context, noteText, options = {}) {
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('noteTemplate', options.noteTemplate ?? DEFAULT_PRODUCT_SETTINGS.noteTemplate);
  return renderOutputTemplate(template, { note, backlink });
}

function buildContextCaptureMarkdown(context, vaultImagePath, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate('captureTemplate', options.captureTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureTemplate);
  return renderOutputTemplate(template, { image, backlink });
}

function buildContextCaptureNoteMarkdown(context, vaultImagePath, noteText, options = {}) {
  const image = normalizeCaptureImage(vaultImagePath);
  const note = normalizeUserNote(noteText);
  if (!note) throw new Error('笔记内容不能为空。');
  const backlink = buildContextPositionMarkdown(context, {
    title: contextBacklinkTitle(context, options),
    timeFormat: options.timeFormat,
    backlinkTemplate: options.backlinkTemplate
  });
  const template = normalizeOutputTemplate(
    'captureNoteTemplate',
    options.captureNoteTemplate ?? DEFAULT_PRODUCT_SETTINGS.captureNoteTemplate
  );
  return renderOutputTemplate(template, { image, note, backlink });
}


function sanitizeCaptureBaseName(value) {
  const cleaned = String(value || '学习资源')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || '学习资源').slice(0, 80);
}

function captureFileName(resource, position, extension = 'png') {
  const safeExtension = String(extension || 'png').toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(safeExtension)) throw new Error('截图扩展名无效。');
  const clock = formatPositionClock(position, 'smart').replace(/:/g, '-');
  return `${sanitizeCaptureBaseName(resource?.title)}-${clock}.${safeExtension}`;
}

module.exports = {
  buildCaptureMarkdown,
  buildContextCaptureMarkdown,
  buildContextCaptureNoteMarkdown,
  buildContextNoteMarkdown,
  buildContextPositionMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown,
  buildFreeformPositionMarkdown,
  buildPlainCaptureMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
  captureFileName,
  contextBacklinkTitle,
  freeformMediaTitle,
  freeformWebLocator,
  escapeMarkdownLabel,
  formatPositionClock,
  normalizeCaptureImage,
  normalizeUserNote,
  renderOutputTemplate,
  sanitizeCaptureBaseName
};

},
"resource-reference.cjs": (module, exports, require) => {
'use strict';

const REFERENCE_ACTION = 'go-study';
const REFERENCE_VERSION = 1;
const FREEFORM_REFERENCE_VERSION = 2;
const ALLOWED_QUERY_KEYS = new Set(['resource', 'position', 'v', 'mode', 'locator', 'name', 'path', 'web']);
const ALLOWED_PROTOCOL_META_KEYS = new Set(['action']);
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

function normalizeResourceId(value) {
  const resourceId = String(value || '').trim();
  if (!RESOURCE_ID_PATTERN.test(resourceId)) throw new Error('Go Study 回链中的资源 ID 无效。');
  return resourceId;
}

function normalizeReferencePosition(value) {
  if (value && typeof value === 'object' && value.type === 'time') {
    return normalizeReferencePosition(`time:${value.seconds}`);
  }
  const text = String(value || '').trim();
  const match = text.match(/^time:(.+)$/i);
  if (!match) throw new Error('Go Study v1 仅支持 time:<seconds> 学习位置。');
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Go Study 回链中的时间位置无效。');
  return { type: 'time', seconds };
}

function serializeReferencePosition(position) {
  const normalized = normalizeReferencePosition(position);
  return `time:${String(normalized.seconds)}`;
}

function normalizeReferenceVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || ![REFERENCE_VERSION, FREEFORM_REFERENCE_VERSION].includes(version)) {
    throw new Error(`不支持的 Go Study 回链版本：${String(value || '') || '缺失'}。`);
  }
  return version;
}

function normalizeFreeformLocator(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 4096 || /[\x00-\x1F]/.test(raw)) throw new Error('Go Study 自由回链中的媒体地址无效。');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    const windowsDrive = /^[A-Za-z]:[\\/]/.test(raw);
    const windowsUnc = /^\\\\[^\\]+\\[^\\]+/.test(raw);
    const posixAbsolute = /^\//.test(raw);
    if (!windowsDrive && !windowsUnc && !posixAbsolute) {
      throw new Error('Go Study 自由回链只允许 Windows/macOS/Linux 绝对本地路径或 HTTP(S) 地址。');
    }
    return raw;
  }
}

function normalizePortableMediaName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 512 || /[\x00-\x1F]/.test(name) || /[\\/]/.test(name)) {
    throw new Error('Go Study 自由回链中的媒体名称无效。');
  }
  return name;
}

function freeformLocatorName(value) {
  const locator = normalizeFreeformLocator(value);
  try {
    const url = new URL(locator);
    const tail = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname || '');
    return normalizePortableMediaName(tail);
  } catch {}
  const tail = locator.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  return normalizePortableMediaName(tail);
}

function normalizeOptionalWebLocator(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('Go Study 自由回链中的网页地址无效。'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Go Study 自由回链网页地址只允许 HTTP(S)。');
  return url.toString();
}

function validateReferenceData(input) {
  const source = input && typeof input === 'object' ? input : {};
  const version = normalizeReferenceVersion(source.version ?? source.v ?? REFERENCE_VERSION);
  if (version !== REFERENCE_VERSION) throw new Error(`Managed Go Study 回链只支持 v${REFERENCE_VERSION}。`);
  return {
    resourceId: normalizeResourceId(source.resourceId ?? source.resource),
    position: normalizeReferencePosition(source.position),
    version
  };
}

function validateFreeformReferenceData(input) {
  const source = input && typeof input === 'object' ? input : {};
  const locator = normalizeFreeformLocator(source.locator ?? source.path);
  const version = normalizeReferenceVersion(source.version ?? source.v ?? FREEFORM_REFERENCE_VERSION);
  return {
    mode: 'freeform',
    locator,
    name: normalizePortableMediaName(source.name || freeformLocatorName(locator)),
    web: normalizeOptionalWebLocator(source.web),
    position: normalizeReferencePosition(source.position),
    version
  };
}

function buildReferenceUri(input) {
  const reference = validateReferenceData(input);
  const url = new URL(`obsidian://${REFERENCE_ACTION}`);
  url.searchParams.set('resource', reference.resourceId);
  url.searchParams.set('position', serializeReferencePosition(reference.position));
  url.searchParams.set('v', String(reference.version));
  return url.toString();
}

function buildFreeformReferenceUri(input) {
  const reference = validateFreeformReferenceData({ ...input, version: input?.version ?? input?.v ?? FREEFORM_REFERENCE_VERSION });
  const url = new URL(`obsidian://${REFERENCE_ACTION}`);
  url.searchParams.set('mode', 'freeform');
  url.searchParams.set('locator', reference.locator);
  url.searchParams.set('name', reference.name);
  url.searchParams.set('position', serializeReferencePosition(reference.position));
  url.searchParams.set('v', String(reference.version));
  return url.toString();
}

function parseQueryEntries(searchParams) {
  const keys = [...searchParams.keys()];
  for (const key of keys) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new Error(`Go Study 回链包含不允许的参数：${key}。`);
    if (searchParams.getAll(key).length !== 1) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
  }
  if (searchParams.get('mode') === 'freeform') {
    if (searchParams.has('resource')) throw new Error('Go Study 自由回链不能同时包含 Resource ID。');
    if (searchParams.has('locator') && searchParams.has('path')) throw new Error('Go Study 自由回链不能同时包含 locator 与旧 path 参数。');
    return validateFreeformReferenceData({
      mode: 'freeform',
      locator: searchParams.get('locator') || searchParams.get('path'),
      name: searchParams.get('name') || '',
      web: searchParams.get('web'),
      position: searchParams.get('position'),
      v: searchParams.get('v')
    });
  }
  if (searchParams.has('mode') || searchParams.has('locator') || searchParams.has('name') || searchParams.has('path') || searchParams.has('web')) {
    throw new Error('Go Study 管理型回链包含不允许的参数：自由回链字段。');
  }
  return validateReferenceData({
    resource: searchParams.get('resource'),
    position: searchParams.get('position'),
    v: searchParams.get('v')
  });
}

function parseReferenceUri(rawUri) {
  let url;
  try { url = new URL(String(rawUri || '').trim()); } catch { throw new Error('Go Study 回链格式无效。'); }
  if (url.protocol !== 'obsidian:' || url.hostname !== REFERENCE_ACTION) {
    throw new Error('这不是 Go Study 回链。');
  }
  if ((url.pathname && url.pathname !== '/') || url.username || url.password || url.port || url.hash) {
    throw new Error('Go Study 回链包含不允许的地址结构。');
  }
  return parseQueryEntries(url.searchParams);
}

function parseProtocolParams(params) {
  const source = params && typeof params === 'object' ? params : {};
  const keys = Object.keys(source);
  for (const key of keys) {
    if (ALLOWED_PROTOCOL_META_KEYS.has(key)) {
      if (Array.isArray(source[key])) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
      if (key === 'action' && source[key] != null && String(source[key]) !== REFERENCE_ACTION) {
        throw new Error('Go Study 回链的协议 action 不匹配。');
      }
      continue;
    }
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new Error(`Go Study 回链包含不允许的参数：${key}。`);
    if (Array.isArray(source[key])) throw new Error(`Go Study 回链参数 ${key} 不能重复。`);
  }
  if (String(source.mode || '') === 'freeform') {
    if (source.resource != null) throw new Error('Go Study 自由回链不能同时包含 Resource ID。');
    if (source.locator != null && source.path != null) throw new Error('Go Study 自由回链不能同时包含 locator 与旧 path 参数。');
    return validateFreeformReferenceData(source);
  }
  if (source.mode != null || source.locator != null || source.name != null || source.path != null || source.web != null) {
    throw new Error('Go Study 管理型回链包含不允许的参数：自由回链字段。');
  }
  return validateReferenceData({
    resource: source.resource,
    position: source.position,
    v: source.v
  });
}

module.exports = {
  ALLOWED_PROTOCOL_META_KEYS,
  ALLOWED_QUERY_KEYS,
  FREEFORM_REFERENCE_VERSION,
  REFERENCE_ACTION,
  REFERENCE_VERSION,
  buildFreeformReferenceUri,
  buildReferenceUri,
  freeformLocatorName,
  normalizeFreeformLocator,
  normalizeOptionalWebLocator,
  normalizePortableMediaName,
  normalizeReferencePosition,
  normalizeReferenceVersion,
  normalizeResourceId,
  parseProtocolParams,
  parseReferenceUri,
  serializeReferencePosition,
  validateFreeformReferenceData,
  validateReferenceData
};

},
"resource-relink-ui.cjs": (module, exports, require) => {
'use strict';

const { Modal, Notice } = require('obsidian');
const { normalizeOpenListPathCompat, openListLocatorFromResource, pathWithinPrefix } = __rhLoad("resource-locator.cjs");

function activeOpenListResources(plugin) {
  return Object.values(plugin?.state?.resources || {})
    .filter((resource) => !resource?.deletedAt && openListLocatorFromResource(resource))
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN', { numeric: true }));
}

function activeOpenListSources(plugin) {
  return Object.values(plugin?.state?.sources || {})
    .filter((source) => source?.type === 'openlist' && !source.deletedAt)
    .sort((left, right) => String(left.alias || left.baseUrl || left.id).localeCompare(String(right.alias || right.baseUrl || right.id), 'zh-CN'));
}

function createField(parent, label, value, options = {}) {
  const wrap = parent.createDiv({ cls: 'rh-next-field' });
  wrap.createEl('label', { text: label });
  const input = wrap.createEl(options.select ? 'select' : 'input', { cls: 'rh-next-input' });
  if (!options.select) {
    input.type = 'text';
    input.value = value || '';
    input.placeholder = options.placeholder || '';
  }
  return input;
}

function createActions(parent) {
  return parent.createDiv({ cls: 'rh-next-modal-actions' });
}

function createButton(parent, label, handler, primary = false) {
  const button = parent.createEl('button', { cls: `rh-next-button${primary ? ' is-primary' : ''}`, text: label });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    void handler();
  });
  return button;
}

function parentOpenListPath(remotePath) {
  const normalized = normalizeOpenListPathCompat(remotePath || '');
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function suggestedCourseRoot(plugin, resource) {
  const locator = openListLocatorFromResource(resource);
  if (!locator) return '';
  const resourceRoot = normalizeOpenListPathCompat(resource?.metadata?.rootPath || '');
  if (resourceRoot && resourceRoot !== '/' && pathWithinPrefix(locator.remotePath, resourceRoot)) return resourceRoot;

  for (const module of Object.values(plugin?.state?.modules || {})) {
    if (!(module?.resourceIds || []).includes(resource.id)) continue;
    const stored = normalizeOpenListPathCompat(module.resourceRoots?.[resource.id] || '');
    if (stored && stored !== '/' && pathWithinPrefix(locator.remotePath, stored)) return stored;
  }
  return parentOpenListPath(locator.remotePath);
}

class OpenListResourceRelinkModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.resourceId = '';
    this.remotePath = '';
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  render() {
    const resources = activeOpenListResources(this.plugin);
    if (!this.resourceId || !resources.some((resource) => resource.id === this.resourceId)) {
      this.resourceId = resources[0]?.id || '';
      this.remotePath = this.resourceId ? openListLocatorFromResource(this.plugin.state.resources[this.resourceId])?.remotePath || '' : '';
    }

    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '重新关联单个 OpenList 文件' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: '高级修复入口：只修改当前这一条资源。如果整个课程文件夹被移动或改名，请使用“重新关联 OpenList 课程目录”，不要逐个处理视频。'
    });

    if (!resources.length) {
      this.contentEl.createEl('p', { text: '当前没有可重新关联的 OpenList 资源。' });
      const actions = createActions(this.contentEl);
      createButton(actions, '关闭', () => this.close());
      return;
    }

    const resourceSelect = createField(this.contentEl, '资源', '', { select: true });
    for (const resource of resources) {
      const locator = openListLocatorFromResource(resource);
      const option = resourceSelect.createEl('option', { text: `${resource.title || resource.id} · ${locator.remotePath}` });
      option.value = resource.id;
    }
    resourceSelect.value = this.resourceId;
    resourceSelect.addEventListener('change', () => {
      this.resourceId = resourceSelect.value;
      this.remotePath = openListLocatorFromResource(this.plugin.state.resources[this.resourceId])?.remotePath || '';
      this.render();
    });

    const current = openListLocatorFromResource(this.plugin.state.resources[this.resourceId]);
    this.contentEl.createEl('small', { text: `当前路径：${current?.remotePath || '未知'}` });
    const pathInput = createField(this.contentEl, '新的文件路径', this.remotePath, {
      placeholder: '/课程/新目录/17.mp4'
    });
    pathInput.addEventListener('input', () => { this.remotePath = pathInput.value; });

    const actions = createActions(this.contentEl);
    createButton(actions, '取消', () => this.close());
    createButton(actions, '验证并重新关联单文件', async () => {
      try {
        await this.plugin.relinkOpenListResourceToPath(this.resourceId, this.remotePath);
        new Notice('单个 OpenList 文件已重新关联；Resource ID 与旧笔记回链保持不变。', 5000);
        this.close();
      } catch (error) {
        new Notice(`重新关联失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    }, true);
  }
}

class OpenListFolderRemapModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.resourceId = '';
    this.sourceId = '';
    this.oldPrefix = '';
    this.newPrefix = '';
    this.preview = null;
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  selectResource(resourceId, resources) {
    const resource = resources.find((candidate) => candidate.id === resourceId) || resources[0] || null;
    this.resourceId = resource?.id || '';
    const locator = openListLocatorFromResource(resource);
    this.sourceId = locator?.sourceId || '';
    this.oldPrefix = resource ? suggestedCourseRoot(this.plugin, resource) : '';
    this.preview = null;
  }

  render() {
    const resources = activeOpenListResources(this.plugin);
    if (!this.resourceId || !resources.some((resource) => resource.id === this.resourceId)) this.selectResource('', resources);

    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '重新关联 OpenList 课程目录' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: '适用于整个课程目录被移动或改名。选择课程中的任意一个视频，Go Study 会识别旧目录并一次更新目录下全部已关联资源，同时同步模块展示根和路径分组。'
    });

    if (!resources.length) {
      this.contentEl.createEl('p', { text: '当前没有可用的 OpenList 资源。' });
      const actions = createActions(this.contentEl);
      createButton(actions, '关闭', () => this.close());
      return;
    }

    const resourceSelect = createField(this.contentEl, '选择这个课程中的任意资源', '', { select: true });
    for (const resource of resources) {
      const locator = openListLocatorFromResource(resource);
      const option = resourceSelect.createEl('option', { text: `${resource.title || resource.id} · ${locator.remotePath}` });
      option.value = resource.id;
    }
    resourceSelect.value = this.resourceId;
    resourceSelect.addEventListener('change', () => {
      this.selectResource(resourceSelect.value, resources);
      this.newPrefix = '';
      this.render();
    });

    const currentResource = this.plugin.state.resources[this.resourceId];
    const currentLocator = openListLocatorFromResource(currentResource);
    const source = this.plugin.state.sources?.[this.sourceId];
    this.contentEl.createEl('small', {
      text: `当前资源：${currentLocator?.remotePath || '未知'}${source ? ` · 来源：${source.alias || source.baseUrl || source.id}` : ''}`
    });

    const oldInput = createField(this.contentEl, '旧课程目录（已自动识别，可修改）', this.oldPrefix, { placeholder: '/百度/课程/高数' });
    const newInput = createField(this.contentEl, '移动后的新课程目录', this.newPrefix, { placeholder: '/百度/大学/数学/高数' });
    oldInput.addEventListener('input', () => { this.oldPrefix = oldInput.value; this.preview = null; });
    newInput.addEventListener('input', () => { this.newPrefix = newInput.value; this.preview = null; });

    if (this.preview) {
      const summary = this.contentEl.createDiv({ cls: 'rh-next-card' });
      summary.createEl('strong', { text: `预览：将更新 ${this.preview.readyCount} 条资源 · 冲突 ${this.preview.conflictCount} 条` });
      summary.createEl('small', { text: `${this.preview.oldPrefix} → ${this.preview.newPrefix}` });
      const list = summary.createEl('ul');
      for (const entry of this.preview.entries.slice(0, 20)) {
        const suffix = entry.status === 'conflict' ? ` ⚠ 与 ${entry.conflictTitle || entry.conflictResourceId} 冲突` : '';
        list.createEl('li', { text: `${entry.from.remotePath} → ${entry.to.remotePath}${suffix}` });
      }
      if (this.preview.entries.length > 20) summary.createEl('small', { text: `另有 ${this.preview.entries.length - 20} 条未展开；确认后会一次性迁移。` });
    }

    const actions = createActions(this.contentEl);
    createButton(actions, '取消', () => this.close());
    createButton(actions, '预览整目录重新关联', async () => {
      try {
        this.preview = await this.plugin.previewOpenListFolderRemap({
          sourceId: this.sourceId,
          oldPrefix: this.oldPrefix,
          newPrefix: this.newPrefix
        });
        this.oldPrefix = this.preview.oldPrefix;
        this.newPrefix = this.preview.newPrefix;
        this.render();
      } catch (error) {
        this.preview = null;
        new Notice(`无法生成目录重新关联预览：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    });
    if (this.preview) {
      const apply = createButton(actions, '确认重新关联整个目录', async () => {
        try {
          const result = await this.plugin.applyOpenListFolderRemap(this.preview);
          const sync = result.associationSync || {};
          new Notice(`已重新关联 ${result.updatedResourceIds.length} 条资源；同步 ${sync.moduleRootCount || 0} 条模块展示根，Resource ID 均未改变。`, 7000);
          this.close();
        } catch (error) {
          new Notice(`目录重新关联失败：${error instanceof Error ? error.message : String(error)}`, 6000);
        }
      }, true);
      apply.disabled = this.preview.conflictCount > 0 || this.preview.readyCount < 1;
    }
  }
}

function registerResourceRelinkCommands(plugin) {
  plugin.addCommand({
    id: 'remap-openlist-folder-paths',
    name: '重新关联 OpenList 课程目录',
    callback: () => new OpenListFolderRemapModal(plugin.app, plugin).open()
  });
  plugin.addCommand({
    id: 'relink-openlist-resource',
    name: '重新关联单个 OpenList 文件（高级）',
    callback: () => new OpenListResourceRelinkModal(plugin.app, plugin).open()
  });
}

module.exports = {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal,
  activeOpenListResources,
  activeOpenListSources,
  parentOpenListPath,
  registerResourceRelinkCommands,
  suggestedCourseRoot
};

},
"resource-relink.cjs": (module, exports, require) => {
'use strict';

const {
  applyOpenListPathRemap,
  normalizeOpenListPathCompat,
  openListLocatorFromResource,
  pathWithinPrefix,
  previewOpenListPathRemap,
  remapPathPrefix,
  sameOpenListLocator,
  updateResourceLocator
} = __rhLoad("resource-locator.cjs");

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeStrictOpenListPath(rawPath, options = {}) {
  if (rawPath === null || rawPath === undefined) throw new Error('OpenList 路径不能为空。');
  const raw = String(rawPath).trim();
  if (!raw) throw new Error('OpenList 路径不能为空。');
  if (/[?#]/.test(raw)) throw new Error('OpenList 路径不能包含查询参数或片段。');

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { throw new Error('OpenList 路径包含无效编码。'); }
  const slashPath = decoded.replace(/\\/g, '/');
  const parts = slashPath.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('OpenList 路径不能包含 ..。');

  const normalized = `/${parts.join('/')}`.normalize('NFC');
  if (normalized === '/' && options.allowRoot !== true) {
    throw new Error('为避免误操作，重新关联和批量迁移不能使用 OpenList 根目录。');
  }
  return normalized;
}

function requireOpenListSource(state, sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) throw new Error('缺少 OpenList 来源 ID。');
  const source = objectOr(state?.sources)[id];
  if (!source || source.deletedAt || source.type !== 'openlist') {
    throw new Error('找不到可用的 OpenList 来源。');
  }
  return source;
}

function changedAtIso(options = {}) {
  return options.changedAt instanceof Date
    ? options.changedAt.toISOString()
    : String(options.changedAt || new Date().toISOString());
}

function parentOpenListPath(remotePath) {
  const normalized = normalizeOpenListPathCompat(remotePath);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function inferMovedRoot(oldRoot, oldPath, newPath) {
  const root = normalizeOpenListPathCompat(oldRoot || '');
  const from = normalizeOpenListPathCompat(oldPath || '');
  const to = normalizeOpenListPathCompat(newPath || '');
  if (root && from && to && pathWithinPrefix(from, root)) {
    const suffix = from.slice(root.length);
    if (suffix && to.endsWith(suffix)) {
      const candidate = to.slice(0, -suffix.length) || '/';
      return normalizeOpenListPathCompat(candidate);
    }
  }
  return parentOpenListPath(to);
}

function syncSingleResourceAssociationRoots(state, resourceId, fromLocator, toLocator, previousMetadataRoot, options = {}) {
  const resource = objectOr(state?.resources)[resourceId];
  if (!resource) return { moduleRootCount: 0 };
  const timestamp = changedAtIso(options);
  const resourceRoot = inferMovedRoot(previousMetadataRoot, fromLocator.remotePath, toLocator.remotePath);
  resource.metadata = { ...(resource.metadata || {}), rootPath: resourceRoot };

  let moduleRootCount = 0;
  for (const module of Object.values(objectOr(state?.modules))) {
    if (!(module?.resourceIds || []).includes(resourceId)) continue;
    const storedRoot = module.resourceRoots?.[resourceId];
    if (!storedRoot) continue;
    const nextRoot = inferMovedRoot(storedRoot, fromLocator.remotePath, toLocator.remotePath);
    module.resourceRoots = objectOr(module.resourceRoots);
    if (module.resourceRoots[resourceId] !== nextRoot) {
      module.resourceRoots[resourceId] = nextRoot;
      module.updatedAt = timestamp;
      if (state.projects?.[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
      moduleRootCount += 1;
    }
  }
  return { moduleRootCount };
}

function syncFolderAssociationPaths(state, preview, updatedResourceIds, options = {}) {
  const updated = new Set(updatedResourceIds || []);
  const timestamp = changedAtIso(options);
  let moduleRootCount = 0;
  let groupScopeCount = 0;

  for (const module of Object.values(objectOr(state?.modules))) {
    let touched = false;
    module.resourceRoots = objectOr(module.resourceRoots);
    for (const resourceId of module.resourceIds || []) {
      if (!updated.has(resourceId)) continue;
      const storedRoot = normalizeOpenListPathCompat(module.resourceRoots[resourceId] || '');
      if (!storedRoot || !pathWithinPrefix(storedRoot, preview.oldPrefix)) continue;
      const nextRoot = remapPathPrefix(storedRoot, preview.oldPrefix, preview.newPrefix);
      if (!nextRoot || nextRoot === storedRoot) continue;
      module.resourceRoots[resourceId] = nextRoot;
      moduleRootCount += 1;
      touched = true;
    }
    if (touched) {
      module.updatedAt = timestamp;
      if (state.projects?.[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
    }
  }

  for (const group of Object.values(objectOr(state?.resourceGroups))) {
    const scopePath = normalizeOpenListPathCompat(group?.scopePath || '');
    if (!scopePath || !pathWithinPrefix(scopePath, preview.oldPrefix)) continue;
    if (!(group.resourceIds || []).some((resourceId) => updated.has(resourceId))) continue;
    const nextScope = remapPathPrefix(scopePath, preview.oldPrefix, preview.newPrefix);
    if (!nextScope || nextScope === scopePath) continue;
    group.scopePath = nextScope;
    group.updatedAt = timestamp;
    groupScopeCount += 1;
  }

  return { moduleRootCount, groupScopeCount };
}

function relinkOpenListResource(state, resourceId, input = {}, options = {}) {
  const resource = objectOr(state?.resources)[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
  const current = openListLocatorFromResource(resource);
  if (!current) throw new Error('当前资源不是可重新关联的 OpenList 资源。');

  const sourceId = String(input.sourceId || current.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  if (sourceId !== current.sourceId) {
    throw new Error('v1 重新关联只允许在同一个 OpenList 来源内移动资源。');
  }
  const remotePath = normalizeStrictOpenListPath(input.remotePath);
  const previousMetadataRoot = resource.metadata?.rootPath || '';
  const result = updateResourceLocator(state, resource.id, {
    type: 'openlist',
    sourceId,
    remotePath
  }, options);
  if (result.changed) {
    result.associationSync = syncSingleResourceAssociationRoots(
      state,
      resource.id,
      current,
      result.locator,
      previousMetadataRoot,
      options
    );
  }
  return result;
}

function previewSafeOpenListPathRemap(state, input = {}) {
  const sourceId = String(input.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  const oldPrefix = normalizeStrictOpenListPath(input.oldPrefix);
  const newPrefix = normalizeStrictOpenListPath(input.newPrefix);
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');
  return previewOpenListPathRemap(state, { sourceId, oldPrefix, newPrefix });
}

function remapFingerprint(preview) {
  return (Array.isArray(preview?.entries) ? preview.entries : [])
    .map((entry) => [
      String(entry.resourceId || ''),
      String(entry.status || ''),
      String(entry.from?.sourceId || ''),
      String(entry.from?.remotePath || ''),
      String(entry.to?.sourceId || ''),
      String(entry.to?.remotePath || ''),
      String(entry.conflictResourceId || '')
    ].join('\u0000'))
    .sort()
    .join('\n');
}

function applySafeOpenListPathRemap(state, preview, options = {}) {
  const sourceId = String(preview?.sourceId || '').trim();
  requireOpenListSource(state, sourceId);
  const oldPrefix = normalizeStrictOpenListPath(preview?.oldPrefix);
  const newPrefix = normalizeStrictOpenListPath(preview?.newPrefix);
  if (oldPrefix === newPrefix) throw new Error('新旧目录不能相同。');

  const fresh = previewSafeOpenListPathRemap(state, { sourceId, oldPrefix, newPrefix });
  if (fresh.conflictCount > 0) {
    throw new Error(`批量迁移存在 ${fresh.conflictCount} 个路径冲突，请先处理冲突后再确认。`);
  }
  if (remapFingerprint(fresh) !== remapFingerprint(preview)) {
    throw new Error('资源位置在预览后发生变化，请重新生成迁移预览。');
  }

  const result = applyOpenListPathRemap(state, fresh, options);
  if (result.skipped.length) {
    throw new Error('批量迁移未能完整应用，请重新生成迁移预览。');
  }
  result.associationSync = syncFolderAssociationPaths(state, fresh, result.updatedResourceIds, options);
  return result;
}

function isCurrentRelinkTarget(resource, locator) {
  return sameOpenListLocator(openListLocatorFromResource(resource), locator);
}

module.exports = {
  applySafeOpenListPathRemap,
  inferMovedRoot,
  isCurrentRelinkTarget,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource,
  remapFingerprint,
  requireOpenListSource,
  syncFolderAssociationPaths,
  syncSingleResourceAssociationRoots
};

},
"resource-resolver.cjs": (module, exports, require) => {
'use strict';

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function requireReferenceResource(state, resourceId) {
  const resource = objectOr(state?.resources)[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('Go Study 找不到这条回链对应的学习资源。');
  return resource;
}

function normalizePlaybackPosition(position) {
  if (!position || position.type !== 'time') throw new Error('当前资源回链不包含可播放的时间位置。');
  const seconds = Number(position.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('学习位置中的播放时间无效。');
  return { type: 'time', seconds };
}

function formatPotPlayerTime(position) {
  const normalized = normalizePlaybackPosition(position);
  const totalSeconds = Math.floor(normalized.seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveReferencePlayback(state, reference, resolveActions) {
  if (typeof resolveActions !== 'function') throw new Error('Go Study 资源启动器不可用。');
  const resource = requireReferenceResource(state, reference?.resourceId);
  const position = normalizePlaybackPosition(reference?.position);
  const actions = resolveActions(resource) || {};
  if (!actions.playTarget) throw new Error('这条学习资源当前没有可用的视频播放方式。');
  return {
    resource,
    position,
    playerTime: formatPotPlayerTime(position),
    playTarget: actions.playTarget
  };
}

function updateResumePosition(resource, position, now = new Date()) {
  if (!resource || typeof resource !== 'object') throw new Error('无法更新不存在的学习资源。');
  const normalized = normalizePlaybackPosition(position);
  const updatedAt = now instanceof Date ? now.toISOString() : String(now || new Date().toISOString());
  resource.resume = {
    ...(resource.resume && typeof resource.resume === 'object' ? resource.resume : {}),
    position: normalized,
    updatedAt
  };
  resource.lastPosition = normalized.seconds;
  return resource.resume;
}

module.exports = {
  formatPotPlayerTime,
  normalizePlaybackPosition,
  requireReferenceResource,
  resolveReferencePlayback,
  updateResumePosition
};

},
"runtime-entry.cjs": (module, exports, require) => {
'use strict';

const path = require('node:path');
const ResourceHubNextPlugin = __rhLoad("entry.cjs");
const { installScopedUiFixes } = __rhLoad("ui-fixes.cjs");
const { registerRememberedNoteTarget } = __rhLoad("note-target.cjs");
const { registerImmersiveHotkeys } = __rhLoad("immersive-hotkeys.cjs");
const { installLearningControls } = __rhLoad("learning-controls-ui.cjs");
const { installFreeformBrowserModifier } = __rhLoad("freeform-link-ui.cjs");
const { GoStudySettingsTab } = __rhLoad("product-settings-tab.cjs");
const { currentProductSettings, ensureProductSettings } = __rhLoad("product-settings.cjs");
const { registerCompanionNoteCommands } = __rhLoad("companion-note-window.cjs");
const { pruneStateBackups } = __rhLoad("release-hardening.cjs");
const {
  clearProjectNoteFoldersOnDelete,
  ensureProjectNotesState,
  markProjectNotesMissing,
  playerTimeFromSeconds,
  projectIdForResource,
  recentStudy,
  recordRecentStudy,
  restoreProjectNotePath,
  updateProjectNoteFoldersOnRename,
  updateProjectNotePathsOnRename
} = __rhLoad("project-notes.cjs");
const {
  chooseStudyNote,
  installProjectNoteEntryPoints,
  openProjectNote
} = __rhLoad("project-notes-ui.cjs");

class ResourceHubNextRuntimePlugin extends ResourceHubNextPlugin {
  addSettingTab(tab) {
    // main.cjs still creates the original one-option setting tab. Intercept that
    // registration and replace it with the real product settings tab instead of
    // trying to inject DOM into Obsidian's settings page after the fact.
    if (!this._goStudySettingsTabRegistered) {
      this._goStudySettingsTabRegistered = true;
      return super.addSettingTab(new GoStudySettingsTab(this.app, this));
    }
    return super.addSettingTab(tab);
  }

  async onload() {
    await super.onload();
    const normalized = ensureProductSettings(this);
    const hadProjectNotes = Boolean(this.state.projectNotes && this.state.uiState?.recentStudyByProject);
    ensureProjectNotesState(this.state);
    if (normalized.changed || !hadProjectNotes) await this.persist();
    registerRememberedNoteTarget(this);
    registerCompanionNoteCommands(this);
    registerImmersiveHotkeys(this);
    installScopedUiFixes(this);
    installLearningControls(this);
    installFreeformBrowserModifier(this);
    installProjectNoteEntryPoints(this);
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    const storedResource = resource?.id && this.state.resources?.[resource.id] && !this.state.resources[resource.id].deletedAt;
    const projectId = storedResource ? projectIdForResource(this.state, resource.id) : '';
    const shouldChooseNote = !options.skipProjectNotePrompt
      && actionType === 'play'
      && resource?.kind === 'video'
      && projectId;

    if (!shouldChooseNote) return super.openResourceAction(resource, actionType, target, options);

    const choice = await chooseStudyNote(this, projectId, resource);
    if (choice?.cancelled) return false;
    const opened = await super.openResourceAction(resource, actionType, target, options);
    if (!opened) return false;

    recordRecentStudy(this.state, projectId, resource.id, choice?.note?.id || '');
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async continueRecentProjectStudy(projectId) {
    const study = recentStudy(this.state, projectId);
    if (!study) return false;

    if (study.note) await openProjectNote(this, study.note, { prepareForStudy: true });

    const resource = study.resource;
    const actions = this.resourceActions(resource);
    const resume = resource.resume?.position;
    let opened = false;

    if (actions.playTarget && resume?.type === 'time' && Number(resume.seconds) > 0) {
      const playerTime = playerTimeFromSeconds(resume.seconds);
      opened = await this.openPositionedPlayTarget(resource, actions.playTarget, playerTime);
      if (opened) {
        this.activeMediaSession = {
          resourceId: resource.id,
          startedAt: new Date().toISOString(),
          lastKnownPosition: { type: 'time', seconds: Number(resume.seconds) }
        };
      }
    } else if (actions.playTarget) {
      opened = await super.openResourceAction(resource, 'play', actions.playTarget, { skipProjectNotePrompt: true });
    } else if (actions.webTarget) {
      opened = await super.openResourceAction(resource, 'web', actions.webTarget, { skipProjectNotePrompt: true });
    } else if (actions.defaultTarget) {
      opened = await super.openResourceAction(resource, 'default', actions.defaultTarget, { skipProjectNotePrompt: true });
    }

    if (!opened) return false;
    recordRecentStudy(this.state, projectId, resource.id, study.note?.id || '');
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async handleVaultRename(entry, oldPath) {
    const result = await super.handleVaultRename(entry, oldPath);
    const changedNotes = updateProjectNotePathsOnRename(this.state, oldPath, entry?.path);
    const changedFolders = updateProjectNoteFoldersOnRename(this.state, oldPath, entry?.path);
    if (changedNotes || changedFolders) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
  }

  async handleVaultDelete(entry) {
    const result = await super.handleVaultDelete(entry);
    const changedNotes = markProjectNotesMissing(this.state, entry?.path);
    const changedFolders = clearProjectNoteFoldersOnDelete(this.state, entry?.path);
    if (changedNotes || changedFolders) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
  }

  async handleVaultCreate(entry) {
    const result = await super.handleVaultCreate(entry);
    const changed = restoreProjectNotePath(this.state, entry?.path);
    if (changed) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
  }

  async collapseSidebar() {
    if (!currentProductSettings(this).autoCollapseSidebar) return false;
    return super.collapseSidebar();
  }

  async createStateBackup(label = 'manual') {
    const backupName = await super.createStateBackup(label);
    const retention = currentProductSettings(this).backupRetention;
    if (retention < 10) {
      try {
        pruneStateBackups(path.join(this.pluginStorageDir(), 'backups'), retention);
      } catch (error) {
        console.warn('Go Study: failed to apply custom backup retention.', error);
      }
    }
    return backupName;
  }
}

module.exports = ResourceHubNextRuntimePlugin;

},
"ui-fixes.cjs": (module, exports, require) => {
'use strict';

function safePluginId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('无法为当前插件生成安全的 UI 修复作用域。');
  return id;
}

function projectInteractionFixCss(pluginId) {
  const viewType = `${safePluginId(pluginId)}-workbench`;
  const scope = `.workspace-leaf-content[data-type="${viewType}"]`;
  return `${scope} .rh-next-project-heading {
  z-index: 4;
  pointer-events: auto;
}
${scope} .rh-next-project-board {
  z-index: 1;
  pointer-events: none;
}
${scope} .rh-next-project-board-item {
  pointer-events: auto;
}
${scope} .rh-next-project-board-slot {
  pointer-events: none;
}
${scope} .rh-next-project-board.is-layout-dragging .rh-next-project-board-slot {
  pointer-events: auto;
}
`;
}

function installScopedUiFixes(plugin, doc = globalThis.document) {
  if (!plugin?.manifest?.id || !doc?.createElement || !doc?.head?.appendChild) return null;
  const style = doc.createElement('style');
  style.setAttribute('data-go-study-ui-fixes', safePluginId(plugin.manifest.id));
  style.textContent = projectInteractionFixCss(plugin.manifest.id);
  doc.head.appendChild(style);
  plugin.register?.(() => style.remove());
  return style;
}

module.exports = {
  installScopedUiFixes,
  projectInteractionFixCss,
  safePluginId
};

},
"usage-polish.cjs": (module, exports, require) => {
'use strict';

function normalizeVaultPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function leafVaultPath(leaf) {
  const viewStatePath = leaf?.getViewState?.()?.state?.file;
  const loadedPath = leaf?.view?.file?.path;
  return normalizeVaultPath(viewStatePath || loadedPath || '');
}

function findOpenVaultLeaf(workspace, targetPath) {
  const target = normalizeVaultPath(targetPath);
  if (!target) return null;
  let found = null;
  const visit = (leaf) => {
    if (!found && leafVaultPath(leaf) === target) found = leaf;
  };
  if (typeof workspace?.iterateAllLeaves === 'function') workspace.iterateAllLeaves(visit);
  else if (typeof workspace?.rootSplit?.iterateAllLeaves === 'function') workspace.rootSplit.iterateAllLeaves(visit);
  return found;
}

function clampMemoHeight(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1200, Math.max(92, numeric));
}

function memoHeightStore(state) {
  state.uiState ||= {};
  state.uiState.projectMemoHeights ||= {};
  return state.uiState.projectMemoHeights;
}

function getMemoHeight(state, projectId, memoId) {
  return clampMemoHeight(state?.uiState?.projectMemoHeights?.[projectId]?.[memoId]);
}

function setMemoHeight(state, projectId, memoId, heightPx) {
  const height = clampMemoHeight(heightPx);
  if (!projectId || !memoId || !height) return 0;
  const store = memoHeightStore(state);
  store[projectId] ||= {};
  store[projectId][memoId] = height;
  return height;
}

function deleteMemoHeight(state, projectId, memoId) {
  const projectStore = state?.uiState?.projectMemoHeights?.[projectId];
  if (!projectStore || !memoId) return false;
  const existed = Object.prototype.hasOwnProperty.call(projectStore, memoId);
  delete projectStore[memoId];
  if (!Object.keys(projectStore).length) delete state.uiState.projectMemoHeights[projectId];
  return existed;
}

function findMemoProjectId(state, memoId) {
  if (!memoId) return '';
  for (const [projectId, project] of Object.entries(state?.projects || {})) {
    if (project?.deletedAt) continue;
    if ((Array.isArray(project?.memos) ? project.memos : []).some((memo) => memo?.id === memoId)) return projectId;
  }
  return '';
}

module.exports = {
  clampMemoHeight,
  deleteMemoHeight,
  findMemoProjectId,
  findOpenVaultLeaf,
  getMemoHeight,
  leafVaultPath,
  normalizeVaultPath,
  setMemoHeight
};

}
};
const __rhCache = new Map();

function __rhLoad(id) {
  if (__rhCache.has(id)) return __rhCache.get(id).exports;
  const factory = __rhModules[id];
  if (!factory) throw new Error(`Bundled module not found: ${id}`);
  const bundledModule = { exports: {} };
  __rhCache.set(id, bundledModule);
  factory(bundledModule, bundledModule.exports, require);
  return bundledModule.exports;
}

module.exports = __rhLoad("runtime-entry.cjs");
