'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  bridgeDataDir,
  normalizeBridgeToken,
  parseBridgeJsonText,
  readBridgeToken
} = require('./potplayer-bridge.cjs');
const {
  captureFrameAndInsertLearningPosition,
  insertCurrentLearningPosition
} = require('./learning-capture.cjs');

const COMPANION_EVENT_VERSION = 1;
const COMPANION_EVENT_POLL_MS = 100;
const COMPANION_EVENT_MAX_BYTES = 16384;
const COMPANION_EVENT_MAX_AGE_MS = 30000;
const COMPANION_EVENT_FUTURE_SKEW_MS = 5000;
const COMPANION_EVENT_ACTIONS = new Set(['insert-position', 'capture-position']);

function companionEventDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'events');
}

function companionAckDir(env = process.env) {
  return path.join(bridgeDataDir(env), 'acks');
}

function ensureCompanionDirs(options = {}) {
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  const env = options.env || process.env;
  const events = options.eventDir || companionEventDir(env);
  const acks = options.ackDir || companionAckDir(env);
  mkdirSync(events, { recursive: true });
  mkdirSync(acks, { recursive: true });
  return { events, acks };
}

function validEventId(value) {
  return /^[0-9a-f]{24}$/.test(String(value || '').toLowerCase());
}

function validateCompanionEvent(payload, expectedToken, options = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const id = String(body.id || '').toLowerCase();
  if (!validEventId(id)) throw new Error('invalid_id');
  if (Number(body.version) !== COMPANION_EVENT_VERSION) throw new Error('version_mismatch');
  const token = normalizeBridgeToken(body.token || '');
  if (token !== normalizeBridgeToken(expectedToken || '')) throw new Error('invalid_token');
  const action = String(body.action || '');
  if (!COMPANION_EVENT_ACTIONS.has(action)) throw new Error('unsupported_action');
  const createdAt = Number(body.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) throw new Error('invalid_created_at');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  if (createdAt < now - COMPANION_EVENT_MAX_AGE_MS) throw new Error('stale_event');
  if (createdAt > now + COMPANION_EVENT_FUTURE_SKEW_MS) throw new Error('future_event');
  return { id, version: COMPANION_EVENT_VERSION, action, createdAt };
}

function safeEventError(error) {
  const value = error instanceof Error ? error.message : String(error || 'unknown_error');
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 240) || 'unknown_error';
}

function defaultCompanionHandlers(plugin) {
  return {
    'insert-position': async () => {
      const result = await insertCurrentLearningPosition(plugin);
      return {
        resourceId: String(result.resource?.id || ''),
        title: String(result.resource?.title || '').slice(0, 160),
        positionSeconds: Number(result.position?.seconds || 0)
      };
    },
    'capture-position': async () => {
      const result = await captureFrameAndInsertLearningPosition(plugin);
      return {
        resourceId: String(result.resource?.id || ''),
        title: String(result.resource?.title || '').slice(0, 160),
        positionSeconds: Number(result.position?.seconds || 0),
        vaultPath: String(result.vaultPath || '').slice(0, 300)
      };
    }
  };
}

function writeCompanionAck(ack, options = {}) {
  if (!validEventId(ack?.id)) return false;
  const fsImpl = options.fs || fs;
  const dirs = ensureCompanionDirs(options);
  const finalPath = path.join(dirs.acks, `${ack.id}.json`);
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  fsImpl.writeFileSync(tempPath, JSON.stringify(ack), { encoding: 'utf8', flag: 'wx' });
  fsImpl.renameSync(tempPath, finalPath);
  return true;
}

function eventFiles(dir, options = {}) {
  const readdirSync = options.readdirSync || fs.readdirSync;
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry?.isFile?.() && /^[0-9a-f]{24}\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function processCompanionEvents(plugin, options = {}) {
  if (plugin?._goStudyCompanionEventProcessing) return { processed: 0, busy: true };
  if (plugin) plugin._goStudyCompanionEventProcessing = true;
  const fsImpl = options.fs || fs;
  let processed = 0;
  try {
    const dirs = ensureCompanionDirs(options);
    const files = eventFiles(dirs.events, { ...options, readdirSync: options.readdirSync || fsImpl.readdirSync?.bind(fsImpl) });
    if (!files.length) return { processed: 0 };
    let expectedToken;
    try {
      expectedToken = normalizeBridgeToken(options.token || readBridgeToken({ ...options, env: options.env || process.env }));
    } catch {
      return { processed: 0, unavailable: true };
    }
    const handlers = options.handlers || defaultCompanionHandlers(plugin);

    for (const fileName of files.slice(0, 20)) {
      const fileId = fileName.slice(0, -5).toLowerCase();
      const eventPath = path.join(dirs.events, fileName);
      let ack = null;
      try {
        if (Number(fsImpl.statSync(eventPath).size) > COMPANION_EVENT_MAX_BYTES) throw new Error('event_too_large');
        const payload = parseBridgeJsonText(fsImpl.readFileSync(eventPath, 'utf8'));
        const event = validateCompanionEvent(payload, expectedToken, options);
        if (event.id !== fileId) throw new Error('event_id_mismatch');
        const handler = handlers[event.action];
        if (typeof handler !== 'function') throw new Error('unsupported_action');
        const result = await handler(event);
        ack = {
          id: event.id,
          version: COMPANION_EVENT_VERSION,
          action: event.action,
          ok: true,
          completedAt: Date.now(),
          result: result && typeof result === 'object' ? result : {}
        };
      } catch (error) {
        ack = {
          id: fileId,
          version: COMPANION_EVENT_VERSION,
          ok: false,
          completedAt: Date.now(),
          error: safeEventError(error)
        };
      } finally {
        try { if (fsImpl.existsSync(eventPath)) fsImpl.unlinkSync(eventPath); } catch {}
      }
      if (ack && validEventId(ack.id)) {
        try { writeCompanionAck(ack, { ...options, fs: fsImpl, eventDir: dirs.events, ackDir: dirs.acks }); } catch {}
      }
      processed += 1;
    }
    return { processed };
  } finally {
    if (plugin) plugin._goStudyCompanionEventProcessing = false;
  }
}

function registerCompanionEventPoller(plugin, options = {}) {
  ensureCompanionDirs(options);
  const intervalFn = options.setIntervalFn || globalThis.setInterval;
  if (typeof intervalFn !== 'function') return false;
  const timer = intervalFn(() => {
    void processCompanionEvents(plugin, options).catch((error) => {
      console.warn('Go Study Companion event poll failed.', error);
    });
  }, Number(options.pollMs || COMPANION_EVENT_POLL_MS));
  if (typeof plugin?.registerInterval === 'function') plugin.registerInterval(timer);
  return timer;
}

module.exports = {
  COMPANION_EVENT_ACTIONS,
  COMPANION_EVENT_FUTURE_SKEW_MS,
  COMPANION_EVENT_MAX_AGE_MS,
  COMPANION_EVENT_MAX_BYTES,
  COMPANION_EVENT_POLL_MS,
  COMPANION_EVENT_VERSION,
  companionAckDir,
  companionEventDir,
  defaultCompanionHandlers,
  ensureCompanionDirs,
  eventFiles,
  processCompanionEvents,
  registerCompanionEventPoller,
  safeEventError,
  validEventId,
  validateCompanionEvent,
  writeCompanionAck
};
