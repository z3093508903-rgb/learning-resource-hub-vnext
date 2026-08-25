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
  *{box-sizing:border-box} body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#17191d;color:#f3f4f6;padding:16px}
  .title{font-size:14px;font-weight:650;margin-bottom:4px}.sub{font-size:12px;color:#9ca3af;margin-bottom:10px}
  textarea{width:100%;height:76px;resize:none;border:1px solid #3b4048;border-radius:9px;background:#22252b;color:#fff;padding:10px 12px;font:14px/1.45 Segoe UI,system-ui,sans-serif;outline:none}
  textarea:focus{border-color:#6b7280}.hint{margin-top:8px;font-size:11px;color:#7f8793;text-align:right}
  </style></head><body><div class="title">${esc(title)}</div><div class="sub">${esc(subtitle)}</div><textarea autofocus placeholder="${esc(placeholder)}"></textarea><div class="hint">Go Study</div><script>
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
  const height = 160;
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.max(60, area.height * 0.24)),
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
      try { if (!win.isDestroyed()) win.close(); } catch {}
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
  const native = showNativeQuickNote(options);
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
