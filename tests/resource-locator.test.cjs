'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/model.cjs');
const {
  LOCATOR_HISTORY_LIMIT,
  RESOURCE_SCHEMA_VERSION,
  installModelResourceLocatorV2,
  normalizeLocatorHistory,
  normalizeResourceRecord
} = require('../src/resource-locator.cjs');

installModelResourceLocatorV2(model);

function legacyOpenListState() {
  return {
    schemaVersion: 1,
    projects: {},
    vaultRefs: {},
    modules: {},
    resourceGroups: {},
    plans: {},
    sources: {
      'source-1': { id: 'source-1', type: 'openlist', identity: 'http://127.0.0.1:5244' }
    },
    resources: {
      'resource-1': {
        id: 'resource-1',
        kind: 'video',
        title: '高等数学 第17课',
        canonicalKey: 'openlist:http://127.0.0.1:5244:/百度/课程/高数/17.mp4',
        sourceId: 'source-1',
        launcher: {
          type: 'openlist',
          sourceId: 'source-1',
          remotePath: '/百度/课程/高数/17.mp4'
        },
        metadata: {
          remotePath: '/百度/课程/高数/17.mp4',
          rootPath: '/百度/课程/高数',
          size: 5083123901,
          modified: '2026-08-20T10:00:00Z'
        },
        lastPosition: '',
        lastOpenedAt: '',
        updatedAt: '2026-08-20T10:00:00Z'
      }
    },
    notes: {},
    activity: [],
    inbox: [],
    uiState: {}
  };
}

test('schema v2 migration preserves existing resource id and adds an OpenList locator', () => {
  const state = model.normalizeState(legacyOpenListState());
  const resource = state.resources['resource-1'];

  assert.equal(state.schemaVersion, RESOURCE_SCHEMA_VERSION);
  assert.equal(model.SCHEMA_VERSION, RESOURCE_SCHEMA_VERSION);
  assert.equal(resource.id, 'resource-1');
  assert.deepEqual(resource.locator, {
    type: 'openlist',
    sourceId: 'source-1',
    remotePath: '/百度/课程/高数/17.mp4'
  });
  assert.equal(resource.identityHints.fileName, '17.mp4');
  assert.equal(resource.identityHints.size, 5083123901);
  assert.equal(resource.identityHints.modified, '2026-08-20T10:00:00Z');
});

test('schema v2 migration keeps canonicalKey as a compatibility/dedupe hint', () => {
  const raw = legacyOpenListState();
  const originalKey = raw.resources['resource-1'].canonicalKey;
  const state = model.normalizeState(raw);
  assert.equal(state.resources['resource-1'].canonicalKey, originalKey);
});

test('schema v2 normalization is idempotent', () => {
  const once = model.normalizeState(legacyOpenListState());
  once.resources['resource-1'].locatorHistory = [{
    type: 'openlist',
    sourceId: 'source-1',
    remotePath: '/百度/旧目录/17.mp4',
    changedAt: '2026-08-21T10:00:00Z'
  }];

  const twice = model.normalizeState(once);
  assert.equal(twice.schemaVersion, RESOURCE_SCHEMA_VERSION);
  assert.equal(twice.resources['resource-1'].id, 'resource-1');
  assert.equal(twice.resources['resource-1'].locatorHistory.length, 1);
  assert.deepEqual(twice.resources['resource-1'].locator, once.resources['resource-1'].locator);
});

test('a v2 locator is mirrored into legacy launcher/metadata fields for current runtime compatibility', () => {
  const raw = legacyOpenListState();
  raw.schemaVersion = 2;
  raw.resources['resource-1'] = {
    id: 'resource-1',
    kind: 'video',
    title: '已迁移视频',
    canonicalKey: 'legacy-key-is-still-present',
    locator: {
      type: 'openlist',
      sourceId: 'source-1',
      remotePath: '/百度/新目录/17.mp4'
    }
  };

  const state = model.normalizeState(raw);
  const resource = state.resources['resource-1'];
  assert.equal(resource.launcher.type, 'openlist');
  assert.equal(resource.launcher.sourceId, 'source-1');
  assert.equal(resource.launcher.remotePath, '/百度/新目录/17.mp4');
  assert.equal(resource.metadata.remotePath, '/百度/新目录/17.mp4');
});

test('new OpenList descriptors receive locator fields immediately without a restart', () => {
  const state = model.normalizeState({ schemaVersion: 1 });
  const project = model.createProject(state, '测试项目');
  const module = model.createModule(state, project.id, '测试模块');
  const result = model.upsertResourceDescriptor(state, module.id, {
    kind: 'video',
    title: '新导入视频',
    canonicalKey: 'openlist:source-1:/课程/new.mp4',
    sourceId: 'source-1',
    launcher: { type: 'openlist', sourceId: 'source-1', remotePath: '/课程/new.mp4' },
    metadata: { remotePath: '/课程/new.mp4', size: 100 }
  });

  assert.equal(state.schemaVersion, RESOURCE_SCHEMA_VERSION);
  assert.equal(result.resource.id, state.resources[result.resource.id].id);
  assert.deepEqual(result.resource.locator, {
    type: 'openlist',
    sourceId: 'source-1',
    remotePath: '/课程/new.mp4'
  });
});

test('numeric legacy lastPosition migrates into generic resume time position', () => {
  const resource = normalizeResourceRecord({
    id: 'resource-1',
    kind: 'video',
    lastPosition: '5076',
    updatedAt: '2026-08-24T12:00:00Z'
  }, 'resource-1');

  assert.deepEqual(resource.resume.position, { type: 'time', seconds: 5076 });
  assert.equal(resource.resume.updatedAt, '2026-08-24T12:00:00Z');
});

test('invalid legacy lastPosition does not fabricate resume state', () => {
  const resource = normalizeResourceRecord({ id: 'resource-1', lastPosition: '01:24:36' }, 'resource-1');
  assert.equal(resource.resume, undefined);
});

test('locator history is deduplicated and capped to the newest entries', () => {
  const history = Array.from({ length: LOCATOR_HISTORY_LIMIT + 4 }, (_, index) => ({
    type: 'openlist',
    sourceId: 'source-1',
    remotePath: `/课程/${index}.mp4`,
    changedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`
  }));
  history.push({ ...history.at(-1), changedAt: '2026-08-24T00:00:00Z' });

  const normalized = normalizeLocatorHistory(history);
  assert.equal(normalized.length, LOCATOR_HISTORY_LIMIT);
  assert.equal(normalized.at(-1).remotePath, `/课程/${LOCATOR_HISTORY_LIMIT + 3}.mp4`);
  assert.equal(normalized.at(-1).changedAt, '2026-08-24T00:00:00Z');
});

test('state versions newer than the resource locator schema fail closed', () => {
  assert.throws(
    () => model.normalizeState({ schemaVersion: RESOURCE_SCHEMA_VERSION + 1 }),
    /高于当前支持/
  );
});
