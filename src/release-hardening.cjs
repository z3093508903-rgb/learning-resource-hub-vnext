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
