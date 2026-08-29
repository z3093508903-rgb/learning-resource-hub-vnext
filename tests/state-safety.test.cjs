'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assertSafePersist,
  catastrophicStateDrop,
  markLoadedBaseline,
  meaningfulState,
  previewMigrationCandidate,
  protectPreviewMigration,
  protectBeforePersist,
  pruneRecoveryBackups,
  recoveryDirectory,
  recoveryEntries,
  renameRecoveryEntry,
  startupSafetySnapshot,
  writeNamedRecoveryState,
  writeRecoveryState
} = require('../src/state-safety.cjs');

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'go-study-state-safety-'));
  const pluginDir = path.join(base, '.obsidian', 'plugins', 'go-study-preview');
  fs.mkdirSync(pluginDir, { recursive: true });
  const plugin = {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter: { getBasePath: () => base }
      }
    },
    manifest: { id: 'go-study-preview', dir: path.join('.obsidian', 'plugins', 'go-study-preview') },
    state: null
  };
  return { base, pluginDir, plugin };
}

function richState() {
  return {
    schemaVersion: 8,
    projects: { p1: { id: 'p1', title: '摄影' } },
    modules: { m1: { id: 'm1', projectId: 'p1', resourceIds: ['r1'] } },
    resources: { r1: { id: 'r1', title: '视频1' } },
    sources: {},
    vaultRefs: {},
    notes: {},
    inbox: [],
    uiState: {}
  };
}

test('startup snapshot copies raw data.json outside the plugin folder before load', () => {
  const { base, pluginDir, plugin } = fixture();
  const state = richState();
  fs.writeFileSync(path.join(pluginDir, 'data.json'), JSON.stringify(state), 'utf8');

  const snapshot = startupSafetySnapshot(plugin);
  assert.equal(snapshot.rawMeaningful, true);
  assert.ok(snapshot.recoveryPath);
  assert.equal(path.dirname(snapshot.recoveryPath), path.join(base, '.obsidian', 'go-study-recovery'));
  assert.deepEqual(JSON.parse(fs.readFileSync(snapshot.recoveryPath, 'utf8')), state);
});

test('catastrophic state drop detects populated-to-empty replacement', () => {
  assert.equal(meaningfulState(richState()), true);
  assert.equal(catastrophicStateDrop(richState(), { projects: {}, modules: {}, resources: {}, uiState: {} }), true);
  assert.equal(catastrophicStateDrop(richState(), richState()), false);
});

test('persist guard blocks an accidental empty overwrite', () => {
  const { plugin } = fixture();
  plugin.state = richState();
  markLoadedBaseline(plugin, plugin.state);
  plugin.state = { projects: {}, modules: {}, resources: {}, sources: {}, vaultRefs: {}, notes: {}, inbox: [], uiState: {} };
  assert.throws(() => assertSafePersist(plugin), /阻止写入 data\.json/);
});

test('rolling pre-save protection preserves the previous on-disk state', () => {
  const { pluginDir, plugin } = fixture();
  const first = richState();
  fs.writeFileSync(path.join(pluginDir, 'data.json'), JSON.stringify(first), 'utf8');
  const snapshot = startupSafetySnapshot(plugin);
  plugin._goStudyStateSafety = { ...snapshot };
  markLoadedBaseline(plugin, first);

  const second = { ...first, resources: { ...first.resources, r2: { id: 'r2', title: '视频2' } } };
  fs.writeFileSync(path.join(pluginDir, 'data.json'), JSON.stringify(second), 'utf8');
  const protectedResult = protectBeforePersist(plugin, 10);
  assert.equal(protectedResult.protected, true);
  const entries = recoveryEntries(plugin);
  assert.ok(entries.length >= 2);
  assert.ok(entries.some((entry) => JSON.parse(fs.readFileSync(entry.fullPath, 'utf8')).resources?.r2));
});

test('manual backups are real JSON files in the external recovery folder', () => {
  const { plugin } = fixture();
  const state = richState();
  const result = writeRecoveryState(plugin, state, 'manual');
  assert.equal(path.dirname(result.fullPath), recoveryDirectory(plugin));
  assert.deepEqual(JSON.parse(fs.readFileSync(result.fullPath, 'utf8')), state);
});


test('named manual backups are pinned and excluded from automatic retention', () => {
  const { plugin } = fixture();
  const state = richState();
  const named = writeNamedRecoveryState(plugin, state, '发布前稳定版');
  for (let i = 0; i < 8; i += 1) writeRecoveryState(plugin, state, 'auto-' + i);
  pruneRecoveryBackups(plugin, 3);
  const entries = recoveryEntries(plugin);
  assert.ok(entries.some((entry) => entry.name === named.name && entry.named));
  assert.equal(entries.filter((entry) => !entry.named).length, 3);
});

test('renaming any snapshot promotes it to a pinned named backup', () => {
  const { plugin } = fixture();
  const state = richState();
  const automatic = writeRecoveryState(plugin, state, 'before-save');
  const renamed = renameRecoveryEntry(plugin, automatic.name, '长期保留');
  assert.match(renamed.name, /^saved-长期保留-/);
  assert.equal(recoveryEntries(plugin).find((entry) => entry.name === renamed.name)?.named, true);
});


test('stable go-study imports Preview data only when stable data.json does not exist', () => {
  const { base, plugin } = fixture();
  plugin.manifest = { id: 'go-study', dir: path.join('.obsidian', 'plugins', 'go-study') };
  const stableDir = path.join(base, '.obsidian', 'plugins', 'go-study');
  const previewDir = path.join(base, '.obsidian', 'plugins', 'go-study-preview');
  fs.mkdirSync(stableDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, 'data.json'), JSON.stringify(richState()), 'utf8');

  const candidate = previewMigrationCandidate(plugin);
  assert.equal(candidate.eligible, true);
  assert.equal(candidate.pluginId, 'go-study-preview');
  assert.equal(candidate.data.projects.p1.title, '摄影');

  const protectedResult = protectPreviewMigration(plugin, candidate);
  assert.ok(protectedResult.recoveryPath);
  assert.match(path.basename(protectedResult.recoveryPath), /^saved-preview-migration-/);
  assert.deepEqual(JSON.parse(fs.readFileSync(protectedResult.recoveryPath, 'utf8')), richState());
});

test('stable go-study never replaces an existing stable data.json with Preview data', () => {
  const { base, plugin } = fixture();
  plugin.manifest = { id: 'go-study', dir: path.join('.obsidian', 'plugins', 'go-study') };
  const stableDir = path.join(base, '.obsidian', 'plugins', 'go-study');
  const previewDir = path.join(base, '.obsidian', 'plugins', 'go-study-preview');
  fs.mkdirSync(stableDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(stableDir, 'data.json'), JSON.stringify({ schemaVersion: 8, projects: {}, resources: {}, uiState: { initialized: true } }), 'utf8');
  fs.writeFileSync(path.join(previewDir, 'data.json'), JSON.stringify(richState()), 'utf8');

  const candidate = previewMigrationCandidate(plugin);
  assert.equal(candidate.eligible, false);
});
