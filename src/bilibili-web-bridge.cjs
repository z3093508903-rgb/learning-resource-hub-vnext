'use strict';

const http = require('node:http');

const BILIBILI_WEB_BRIDGE_PORT = 27124;
const BILIBILI_WEB_STATE_MAX_AGE_MS = 2500;
const BILIBILI_WEB_MAX_BYTES = 16 * 1024;

function isBilibiliVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    const bilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com');
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && bilibili
      && /^\/video\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeBilibiliPageUrl(value) {
  if (!isBilibiliVideoUrl(value)) throw new Error('invalid_bilibili_url');
  const url = new URL(String(value || '').trim());
  url.hash = '';
  url.searchParams.delete('t');
  return url.toString();
}

function timestampSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('invalid_position');
  return Math.round(seconds * 1000) / 1000;
}

function bilibiliTimestampUrl(value, seconds) {
  const url = new URL(normalizeBilibiliPageUrl(value));
  url.searchParams.set('t', String(timestampSeconds(seconds)));
  return url.toString();
}

function cleanBilibiliTitle(value) {
  return String(value || '')
    .replace(/[_\s-]*哔哩哔哩(?:\s*bilibili)?\s*$/i, '')
    .replace(/\s*[-_–—]\s*bilibili\s*$/i, '')
    .trim()
    .slice(0, 300);
}

function normalizeBilibiliWebState(payload, now = Date.now()) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const url = normalizeBilibiliPageUrl(body.url);
  const positionSeconds = timestampSeconds(body.positionSeconds ?? body.currentTime);
  const duration = Number(body.duration);
  return {
    url,
    title: cleanBilibiliTitle(body.title) || url,
    positionSeconds,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
    paused: Boolean(body.paused),
    visible: body.visible !== false,
    focused: Boolean(body.focused),
    receivedAt: Number(now)
  };
}

function currentBilibiliWebState(plugin, options = {}) {
  const state = plugin?._goStudyBilibiliWebState;
  if (!state) throw new Error('没有检测到 B站网页视频。请确认已安装 Go Study Bilibili Bridge，并让 B站视频标签页保持前台。');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const maxAgeMs = Math.max(500, Number(options.maxAgeMs || BILIBILI_WEB_STATE_MAX_AGE_MS));
  if (now - Number(state.receivedAt || 0) > maxAgeMs) {
    throw new Error('B站网页桥接已超时。请切回正在播放的 B站标签页后重试。');
  }
  if (!state.visible || !state.focused) {
    throw new Error('B站网页当前不是前台标签页。');
  }
  return state;
}

async function requestBilibiliWebBridge(plugin, action = 'current', options = {}) {
  if (action === 'ping') {
    const state = currentBilibiliWebState(plugin, options);
    return { ok: true, transport: 'bilibili-web', version: 1, media: { ...state } };
  }
  if (action !== 'current') throw new Error('B站网页模式目前只支持读取当前位置，不支持网页截图控制。');
  const state = currentBilibiliWebState(plugin, options);
  return {
    ok: true,
    transport: 'bilibili-web',
    version: 1,
    control: { pausedByGoStudy: false },
    media: {
      path: state.url,
      web: state.url,
      title: state.title,
      positionSeconds: state.positionSeconds,
      duration: state.duration,
      paused: state.paused,
      source: 'bilibili-web',
      transport: 'bilibili-web'
    }
  };
}

function bridgeStatus(plugin) {
  const raw = plugin?._goStudyBilibiliWebBridgeStatus || {};
  let connected = false;
  try {
    currentBilibiliWebState(plugin);
    connected = true;
  } catch {}
  return {
    listening: Boolean(raw.listening),
    port: Number(raw.port || BILIBILI_WEB_BRIDGE_PORT),
    error: String(raw.error || ''),
    connected
  };
}

function registerBilibiliWebBridge(plugin, options = {}) {
  if (plugin?._goStudyBilibiliWebServer) return plugin._goStudyBilibiliWebServer;
  const httpImpl = options.http || http;
  const port = Number(options.port || BILIBILI_WEB_BRIDGE_PORT);
  const host = '127.0.0.1';

  const server = httpImpl.createServer((req, res) => {
    res.setHeader?.('Access-Control-Allow-Origin', '*');
    res.setHeader?.('Access-Control-Allow-Headers', 'content-type');
    res.setHeader?.('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/state') {
      res.statusCode = 404;
      res.end('not_found');
      return;
    }

    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > BILIBILI_WEB_MAX_BYTES) {
        res.statusCode = 413;
        res.end('too_large');
        req.destroy?.();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const state = normalizeBilibiliWebState(payload, Date.now());
        if (plugin) plugin._goStudyBilibiliWebState = state;
        res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, version: 1 }));
      } catch {
        res.statusCode = 400;
        res.end('invalid_state');
      }
    });
  });

  if (plugin) {
    plugin._goStudyBilibiliWebServer = server;
    plugin._goStudyBilibiliWebBridgeStatus = { listening: false, port, error: '' };
  }

  server.on?.('listening', () => {
    if (plugin) plugin._goStudyBilibiliWebBridgeStatus = { listening: true, port, error: '' };
  });
  server.on?.('error', (error) => {
    if (plugin) {
      plugin._goStudyBilibiliWebBridgeStatus = {
        listening: false,
        port,
        error: error instanceof Error ? error.message : String(error || '')
      };
    }
  });

  try { server.listen(port, host); }
  catch (error) {
    if (plugin) plugin._goStudyBilibiliWebBridgeStatus = { listening: false, port, error: String(error || '') };
  }

  const cleanup = () => {
    try { server.close?.(); } catch {}
    if (plugin?._goStudyBilibiliWebServer === server) plugin._goStudyBilibiliWebServer = null;
    if (plugin) plugin._goStudyBilibiliWebState = null;
  };
  plugin?.register?.(cleanup);
  return server;
}

module.exports = {
  BILIBILI_WEB_BRIDGE_PORT,
  BILIBILI_WEB_MAX_BYTES,
  BILIBILI_WEB_STATE_MAX_AGE_MS,
  bilibiliTimestampUrl,
  bridgeStatus,
  cleanBilibiliTitle,
  currentBilibiliWebState,
  isBilibiliVideoUrl,
  normalizeBilibiliPageUrl,
  normalizeBilibiliWebState,
  registerBilibiliWebBridge,
  requestBilibiliWebBridge,
  timestampSeconds
};
