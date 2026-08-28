'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activateTimelineReference,
  activeMarkdownView,
  diagnoseTimelineNavigator,
  extractGoStudyReferenceUris,
  renderedReferenceUris,
  timelineGroupsFromMarkdown,
  timelineGroupsFromView,
  timelineSummary
} = require('../src/timeline-navigator.cjs');
const {
  buildFreeformReferenceUri,
  buildReferenceUri
} = require('../src/resource-reference.cjs');

function pluginFixture() {
  return {
    state: {
      resources: {
        r1: { id: 'r1', title: '学习摄影', kind: 'video' },
        r2: { id: 'r2', title: '构图基础', kind: 'video' }
      }
    },
    resourceActions(resource) {
      if (resource.id === 'r1') {
        return {
          playTarget: { type: 'uri', uri: 'https://www.bilibili.com/video/BV1PHOTO' },
          webTarget: 'https://www.bilibili.com/video/BV1PHOTO'
        };
      }
      return { playTarget: { type: 'potplayer', target: 'D:\\Video\\composition.mp4' } };
    },
    async openResourceReference(reference) {
      this.lastReference = reference;
      return true;
    }
  };
}

test('timeline extracts Go Study links and groups mixed-video timestamps by source', () => {
  const plugin = pluginFixture();
  const a = buildReferenceUri({ resourceId: 'r1', position: { type: 'time', seconds: 86 }, version: 1 });
  const b = buildReferenceUri({ resourceId: 'r2', position: { type: 'time', seconds: 42 }, version: 1 });
  const c = buildReferenceUri({ resourceId: 'r1', position: { type: 'time', seconds: 14 }, version: 1 });
  const markdown = [
    `[第一处](${a})`,
    `[第二处](${b})`,
    `[第三处](${c})`
  ].join('\n');

  assert.equal(extractGoStudyReferenceUris(markdown).length, 3);
  const groups = timelineGroupsFromMarkdown(markdown, plugin);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, '学习摄影');
  assert.deepEqual(groups[0].items.map((item) => item.time), ['00:14', '01:26']);
  assert.equal(groups[1].title, '构图基础');
  assert.deepEqual(timelineSummary(groups), { sourceCount: 2, timestampCount: 3 });
});

test('freeform timeline uses hidden media title metadata instead of exposing the locator', () => {
  const plugin = pluginFixture();
  const uri = buildFreeformReferenceUri({
    locator: 'D:\\Loose\\learning-photo.mp4',
    name: 'learning-photo.mp4',
    title: '学习摄影',
    position: { type: 'time', seconds: 65 }
  });
  const groups = timelineGroupsFromMarkdown(`[回到课程](${uri})`, plugin);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'freeform');
  assert.equal(groups[0].title, '学习摄影');
  assert.equal(groups[0].items[0].time, '01:05');
});

test('Ctrl-click on a managed Bilibili timeline item opens browser at the captured time', async () => {
  const plugin = pluginFixture();
  const opened = [];
  const reference = { resourceId: 'r1', position: { type: 'time', seconds: 65 }, version: 1 };
  const result = await activateTimelineReference(plugin, reference, { ctrlKey: true }, {
    shell: { openExternal: async (url) => opened.push(url) }
  });
  assert.equal(result.transport, 'browser');
  assert.equal(opened[0], 'https://www.bilibili.com/video/BV1PHOTO?t=65');
});

test('ordinary timeline click reuses Go Study reference playback', async () => {
  const plugin = pluginFixture();
  const reference = { resourceId: 'r2', position: { type: 'time', seconds: 42 }, version: 1 };
  const result = await activateTimelineReference(plugin, reference, {});
  assert.equal(result.transport, 'go-study');
  assert.deepEqual(plugin.lastReference, reference);
});


test('timeline falls back to rendered Obsidian links when editor/source text is unavailable', () => {
  const plugin = pluginFixture();
  const uri = buildReferenceUri({ resourceId: 'r1', position: { type: 'time', seconds: 16 }, version: 1 });
  const anchor = {
    getAttribute(name) { return name === 'href' ? uri : ''; }
  };
  const host = {
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href^="obsidian://go-study"]');
      return [anchor];
    }
  };
  const view = {
    containerEl: {
      querySelector(selector) {
        return selector === '.view-content' ? host : null;
      }
    }
  };
  assert.equal(renderedReferenceUris(view).length, 1);
  const groups = timelineGroupsFromView(view, '', plugin);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, '学习摄影');
  assert.equal(groups[0].items[0].time, '00:16');
});

test('timeline implementation mounts to document body so CodeMirror overflow cannot hide it', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'timeline-navigator.cjs'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(source, /const mount = doc\.body \|\| host/);
  assert.match(source, /positionTimelineOverlay\(nav, host, doc\)/);
  assert.match(css, /\.go-study-floating-timeline\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /z-index:\s*2147482000/);
});


test('active Markdown leaf is accepted even when getLeavesOfType misses it', async () => {
  const plugin = pluginFixture();
  const uri = buildReferenceUri({ resourceId: 'r1', position: { type: 'time', seconds: 16 }, version: 1 });
  const host = {
    ownerDocument: {
      documentElement: { clientWidth: 1200 },
      defaultView: { innerWidth: 1200 },
      body: { appendChild() {} },
      querySelectorAll() { return []; }
    },
    classList: { add() {}, remove() {} },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { top: 40, right: 1100, bottom: 800, width: 900, height: 760 };
    }
  };
  const view = {
    file: { path: '视频学习笔记.md', extension: 'md' },
    editor: { getValue: () => `[回到课程](${uri})` },
    containerEl: {
      querySelector(selector) { return selector === '.view-content' ? host : null; }
    }
  };
  plugin.app = {
    workspace: {
      activeLeaf: { view },
      getLeavesOfType() { return []; }
    },
    vault: {}
  };
  assert.equal(activeMarkdownView(plugin), view);
  const d = await diagnoseTimelineNavigator({
    ...plugin,
    state: {
      ...plugin.state,
      uiState: { videoEnhancementEnabled: false, timelineNavigatorEnabled: false }
    }
  });
  assert.equal(d.activeMarkdown, true);
  assert.equal(d.rawLinkCount, 1);
  assert.equal(d.timestampCount, 1);
});

test('runtime source installs timeline before later DOM entry-point hooks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'runtime-entry.cjs'), 'utf8');
  assert.ok(source.indexOf('installTimelineNavigator(this)') < source.indexOf('installProjectNoteEntryPoints(this)'));
});
