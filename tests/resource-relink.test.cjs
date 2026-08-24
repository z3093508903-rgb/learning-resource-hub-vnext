'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/model.cjs');
const {
  installModelResourceLocatorV2,
  updateResourceLocator
} = require('../src/resource-locator.cjs');
const {
  applySafeOpenListPathRemap,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource
} = require('../src/resource-relink.cjs');

installModelResourceLocatorV2(model);

function stateWithResources(paths) {
  const resources = {};
  let index = 0;
  for (const remotePath of paths) {
    index += 1;
    const id = `resource-${index}`;
    resources[id] = {
      id,
      kind: 'video',
      title: `资源 ${index}`,
      canonicalKey: `openlist:http://127.0.0.1:5244:${remotePath.toLowerCase()}`,
      sourceId: 'source-1',
      launcher: { type: 'openlist', sourceId: 'source-1', remotePath },
      metadata: { remotePath, rootPath: remotePath.split('/').slice(0, -1).join('/') || '/' },
      deletedAt: ''
    };
  }
  return model.normalizeState({
    schemaVersion: 1,
    projects: {},
    vaultRefs: {},
    modules: {},
    resourceGroups: {},
    plans: {},
    sources: {
      'source-1': {
        id: 'source-1',
        type: 'openlist',
        identity: 'http://127.0.0.1:5244',
        baseUrl: 'http://127.0.0.1:5244',
        deletedAt: ''
      }
    },
    resources,
    notes: {},
    activity: [],
    inbox: [],
    uiState: {}
  });
}

test('strict relink paths reject empty/root/query/traversal values instead of collapsing them to OpenList root', () => {
  for (const value of ['', '   ', '/', '\\', '/课程/../secret.mp4', '/课程/a.mp4?sign=x', '/课程/a.mp4#part']) {
    assert.throws(() => normalizeStrictOpenListPath(value));
  }
  assert.throws(() => normalizeStrictOpenListPath('%E0%A4%A'), /无效编码/);
  assert.equal(normalizeStrictOpenListPath('\\课程\\高数\\17.mp4'), '/课程/高数/17.mp4');
});

test('single-resource relink preserves Resource ID and records the previous locator', () => {
  const state = stateWithResources(['/百度/课程/高数/17.mp4']);
  const result = relinkOpenListResource(state, 'resource-1', {
    remotePath: '/百度/大学/数学/高数/17.mp4'
  }, { changedAt: '2026-08-24T13:00:00Z' });

  assert.equal(result.changed, true);
  const resource = state.resources['resource-1'];
  assert.equal(resource.id, 'resource-1');
  assert.equal(resource.locator.remotePath, '/百度/大学/数学/高数/17.mp4');
  assert.equal(resource.launcher.remotePath, '/百度/大学/数学/高数/17.mp4');
  assert.equal(resource.metadata.remotePath, '/百度/大学/数学/高数/17.mp4');
  assert.equal(resource.canonicalKey, 'openlist:http://127.0.0.1:5244:/百度/大学/数学/高数/17.mp4');
  assert.deepEqual(resource.locatorHistory.at(-1), {
    type: 'openlist',
    sourceId: 'source-1',
    remotePath: '/百度/课程/高数/17.mp4',
    changedAt: '2026-08-24T13:00:00Z'
  });
});

test('single-resource relink refuses cross-source moves and occupied target locators', () => {
  const state = stateWithResources(['/课程/a.mp4', '/课程/b.mp4']);
  state.sources['source-2'] = { id: 'source-2', type: 'openlist', identity: 'http://127.0.0.1:6244', deletedAt: '' };

  assert.throws(
    () => relinkOpenListResource(state, 'resource-1', { sourceId: 'source-2', remotePath: '/课程/c.mp4' }),
    /同一个 OpenList 来源/
  );
  assert.throws(
    () => relinkOpenListResource(state, 'resource-1', { remotePath: '/课程/b.mp4' }),
    /已关联到另一条资源/
  );
  assert.equal(state.resources['resource-1'].locator.remotePath, '/课程/a.mp4');
});

test('safe folder remap previews then atomically preserves IDs while moving matching locators', () => {
  const state = stateWithResources([
    '/旧课程/a.mp4',
    '/旧课程/章节/b.mp4',
    '/其他/c.mp4'
  ]);
  state.resources['resource-1'].metadata.rootPath = '/旧课程';
  state.resources['resource-2'].metadata.rootPath = '/旧课程';

  const preview = previewSafeOpenListPathRemap(state, {
    sourceId: 'source-1',
    oldPrefix: '/旧课程',
    newPrefix: '/新课程'
  });
  assert.equal(preview.readyCount, 2);
  assert.equal(preview.conflictCount, 0);
  assert.deepEqual(preview.entries.map((entry) => entry.resourceId), ['resource-1', 'resource-2']);

  const result = applySafeOpenListPathRemap(state, preview, { changedAt: '2026-08-24T13:30:00Z' });
  assert.deepEqual(result.updatedResourceIds, ['resource-1', 'resource-2']);
  assert.equal(result.skipped.length, 0);
  assert.equal(state.resources['resource-1'].id, 'resource-1');
  assert.equal(state.resources['resource-1'].locator.remotePath, '/新课程/a.mp4');
  assert.equal(state.resources['resource-2'].locator.remotePath, '/新课程/章节/b.mp4');
  assert.equal(state.resources['resource-3'].locator.remotePath, '/其他/c.mp4');
  assert.equal(state.resources['resource-1'].metadata.rootPath, '/新课程');
  assert.equal(state.resources['resource-2'].metadata.rootPath, '/新课程');
  assert.equal(state.resources['resource-1'].locatorHistory.at(-1).remotePath, '/旧课程/a.mp4');
});

test('folder remap refuses root-directory operations', () => {
  const state = stateWithResources(['/课程/a.mp4']);
  assert.throws(
    () => previewSafeOpenListPathRemap(state, { sourceId: 'source-1', oldPrefix: '/', newPrefix: '/新目录' }),
    /根目录/
  );
  assert.throws(
    () => previewSafeOpenListPathRemap(state, { sourceId: 'source-1', oldPrefix: '/课程', newPrefix: '/' }),
    /根目录/
  );
});

test('folder remap fails closed when state changes after preview', () => {
  const state = stateWithResources(['/旧课程/a.mp4']);
  const preview = previewSafeOpenListPathRemap(state, {
    sourceId: 'source-1', oldPrefix: '/旧课程', newPrefix: '/新课程'
  });

  updateResourceLocator(state, 'resource-1', {
    type: 'openlist', sourceId: 'source-1', remotePath: '/别处/a.mp4'
  }, { changedAt: '2026-08-24T13:40:00Z' });

  assert.throws(() => applySafeOpenListPathRemap(state, preview), /预览后发生变化/);
  assert.equal(state.resources['resource-1'].locator.remotePath, '/别处/a.mp4');
});

test('folder remap detects a target claimed after preview before mutating any candidate', () => {
  const state = stateWithResources(['/旧课程/a.mp4', '/旧课程/b.mp4']);
  const preview = previewSafeOpenListPathRemap(state, {
    sourceId: 'source-1', oldPrefix: '/旧课程', newPrefix: '/新课程'
  });

  state.resources['resource-3'] = {
    id: 'resource-3',
    kind: 'video',
    title: '后来加入的冲突资源',
    sourceId: 'source-1',
    locator: { type: 'openlist', sourceId: 'source-1', remotePath: '/新课程/b.mp4' },
    launcher: { type: 'openlist', sourceId: 'source-1', remotePath: '/新课程/b.mp4' },
    metadata: { remotePath: '/新课程/b.mp4' },
    deletedAt: ''
  };

  assert.throws(() => applySafeOpenListPathRemap(state, preview), /路径冲突/);
  assert.equal(state.resources['resource-1'].locator.remotePath, '/旧课程/a.mp4');
  assert.equal(state.resources['resource-2'].locator.remotePath, '/旧课程/b.mp4');
});
