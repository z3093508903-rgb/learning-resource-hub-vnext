'use strict';

const { resolveRemote } = require('./quick-note-window.cjs');
const { CAPTURE_ACTIONS, HUD_SLOT_LABELS, HUD_SLOT_ORDER, normalizeHudSlots } = require('./capture-actions.cjs');

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
  const focusable = Boolean(options.focusable);
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
    focusable,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  let shown = false;
  let closed = false;
  if (focusable && typeof options.onInput === 'function') {
    win.webContents?.on?.('before-input-event', (event, input) => {
      if (closed || input?.type !== 'keyDown' || input?.isAutoRepeat) return;
      const key = String(input?.key || '');
      const mapped = {
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        Enter: 'Enter',
        Escape: 'Escape'
      }[key];
      if (!mapped) return;
      try { event?.preventDefault?.(); } catch {}
      try { options.onInput(mapped); } catch {}
    });
  }
  const ready = win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(hudHtml(rawSlots))}`).catch(() => {});
  return {
    async show() {
      if (closed || shown) return false;
      await ready;
      if (closed || win.isDestroyed?.()) return false;
      shown = true;
      try { win.setAlwaysOnTop?.(true, 'screen-saver'); } catch {}
      if (focusable) {
        try { win.show?.(); } catch {}
        try { win.moveTop?.(); } catch {}
        try { win.focus?.(); } catch {}
      } else {
        try { win.showInactive?.(); } catch { try { win.show(); } catch {} }
      }
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
    get shown() { return shown; },
    get focusable() { return focusable; }
  };
}

module.exports = {
  createNativeActionHud,
  escapeHtml,
  hudHtml,
  slotCopy
};
