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
