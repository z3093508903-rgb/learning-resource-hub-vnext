'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf,
  stateBackupEntries
} = require('../src/release-hardening.cjs');

test('normalizeAnkiEndpoint accepts only local AnkiConnect endpoints', () => {
  assert.equal(normalizeAnkiEndpoint('http://127.0.0.1:8765'), 'http://127.0.0.1:8765');
  assert.equal(normalizeAnkiEndpoint('http://localhost:8765'), 'http://127.0.0.1:8765');
  assert.equal(normalizeAnkiEndpoint('http://[::1]:8765'), 'http://[::1]:8765');

  assert.throws(() => normalizeAnkiEndpoint('https://example.com/anki'), /只允许连接本机/);
  assert.throws(() => normalizeAnkiEndpoint('ftp://127.0.0.1:8765'), /HTTP 或 HTTPS/);
  assert.throws(() => normalizeAnkiEndpoint('http://user:pass@127.0.0.1:8765'), /不能包含用户名或密码/);
  assert.throws(() => normalizeAnkiEndpoint('not a url'), /地址无效/);
});

test('pruneStateBackups keeps the newest ten state backups and ignores unrelated files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrh-backups-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const baseSeconds = 1_700_000_000;
  for (let index = 0; index < 12; index += 1) {
    const name = `state-2026-08-24T00-00-${String(index).padStart(2, '0')}-manual.json`;
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, '{}', 'utf8');
    fs.utimesSync(filePath, baseSeconds + index, baseSeconds + index);
  }
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me', 'utf8');

  const removed = pruneStateBackups(dir, 10);
  assert.equal(removed.length, 2);
  assert.equal(stateBackupEntries(dir).length, 10);
  assert.equal(fs.existsSync(path.join(dir, 'notes.txt')), true);
  assert.equal(fs.existsSync(path.join(dir, 'state-2026-08-24T00-00-00-manual.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'state-2026-08-24T00-00-01-manual.json')), false);
});

test('revealLoadedLeaf waits for a deferred view before returning leaf.view', async () => {
  const leaf = { view: { kind: 'deferred' } };
  const workspace = {
    async revealLeaf(target) {
      assert.equal(target, leaf);
      await Promise.resolve();
      target.view = { kind: 'loaded' };
    }
  };

  const view = await revealLoadedLeaf(workspace, leaf);
  assert.deepEqual(view, { kind: 'loaded' });
});

test('revealLoadedLeaf falls back to loadIfDeferred when revealLeaf is unavailable', async () => {
  const leaf = {
    view: { kind: 'deferred' },
    async loadIfDeferred() {
      this.view = { kind: 'loaded-by-leaf' };
    }
  };

  const view = await revealLoadedLeaf({}, leaf);
  assert.deepEqual(view, { kind: 'loaded-by-leaf' });
});

test('entry delays vault lifecycle work until layout ready', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'entry.cjs'), 'utf8');
  assert.match(source, /_vaultLifecycleReady = false/);
  assert.match(source, /onLayoutReady/);
  assert.match(source, /if \(!this\._vaultLifecycleReady\) return false/);
  assert.match(source, /if \(!this\._vaultLifecycleReady\) return;/);
});
