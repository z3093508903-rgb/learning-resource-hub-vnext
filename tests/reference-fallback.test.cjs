'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  browserUrlForReference,
  fallbackFreeformReference,
  recoveredResourceById
} = require('../src/reference-fallback.cjs');
const { writeRecoveryState } = require('../src/state-safety.cjs');

function pluginFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'go-study-reference-fallback-'));
  const plugin = {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter: { getBasePath: () => base }
      }
    },
    manifest: {
      id: 'go-study-preview',
      dir: path.join('.obsidian', 'plugins', 'go-study-preview')
    },
    state: { resources: {}, sources: {} },
    resourceActions(resource) {
      if (resource.id === 'r1') {
        return {
          playTarget: { type: 'potplayer', target: 'https://www.bilibili.com/video/BV1CURRENT?p=2' },
          webTarget: 'https://www.bilibili.com/video/BV1CURRENT?p=2'
        };
      }
      return {};
    }
  };
  return { base, plugin };
}

test('portable managed reference can degrade into a freeform playback reference when Resource state is missing', () => {
  const fallback = fallbackFreeformReference({
    resourceId: 'missing',
    locator: 'D:\\Course\\lesson.mp4',
    name: 'lesson.mp4',
    title: '课程',
    position: { type: 'time', seconds: 42 },
    version: 3
  });
  assert.equal(fallback.mode, 'freeform');
  assert.equal(fallback.locator, 'D:\\Course\\lesson.mp4');
  assert.equal(fallback.name, 'lesson.mp4');
  assert.equal(fallback.position.seconds, 42);
});

test('managed browser URL resolves from current Resource when available', () => {
  const { base, plugin } = pluginFixture();
  try {
    plugin.state.resources.r1 = { id: 'r1', title: '当前课程' };
    assert.equal(
      browserUrlForReference(plugin, {
        resourceId: 'r1',
        position: { type: 'time', seconds: 65 },
        version: 1
      }),
      'https://www.bilibili.com/video/BV1CURRENT?p=2'
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('legacy v1 Resource IDs can be recovered from external recovery snapshots', () => {
  const { base, plugin } = pluginFixture();
  try {
    writeRecoveryState(plugin, {
      projects: {},
      modules: {},
      resources: {
        legacy: {
          id: 'legacy',
          title: '旧课程',
          launcher: { type: 'potplayer', target: 'https://www.bilibili.com/video/BV1OLD' },
          metadata: { sourceUrl: 'https://www.bilibili.com/video/BV1OLD' }
        }
      },
      sources: {},
      uiState: {}
    }, 'legacy');
    const recovered = recoveredResourceById(plugin, 'legacy');
    assert.equal(recovered.resource.title, '旧课程');
    assert.match(recovered.filePath, /go-study-recovery/);
    assert.equal(
      browserUrlForReference(plugin, {
        resourceId: 'legacy',
        position: { type: 'time', seconds: 9 },
        version: 1
      }),
      'https://www.bilibili.com/video/BV1OLD'
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
