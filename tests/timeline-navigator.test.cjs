'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activeMarkdownView,
  diagnoseTimelineNavigator,
  extractGoStudyReferenceUris,
  mutationOnlyTouchesTimelineUi,
  navigateTimelineItem,
  renderedReferenceUris,
  parseTimelineReferenceUri,
  timelineGroupsFromMarkdown,
  timelineGroupsFromView,
  timelineSignature,
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

test('timeline item click navigates to its Markdown line instead of opening media', () => {
  const calls = [];
  const view = {
    editor: {
      scrollIntoView(range, center) { calls.push(['scroll', range, center]); },
      setCursor(cursor) { calls.push(['cursor', cursor]); }
    },
    containerEl: { querySelector() { return null; } }
  };
  const result = navigateTimelineItem(view, {
    uri: 'obsidian://go-study?resource=r1&position=time%3A65&v=1',
    line: 12
  });
  assert.deepEqual(result, { transport: 'note', mode: 'editor', line: 12, found: true });
  assert.deepEqual(calls[0], ['scroll', { from: { line: 12, ch: 0 }, to: { line: 12, ch: 0 } }, true]);
  assert.deepEqual(calls[1], ['cursor', { line: 12, ch: 0 }]);
});

test('timeline rendered fallback scrolls the matching backlink into view', () => {
  const calls = [];
  const anchor = {
    isConnected: true,
    ownerDocument: { defaultView: { setTimeout(fn) { fn(); } } },
    classList: { add() {}, remove() {} },
    closest() { return this; },
    scrollIntoView(options) { calls.push(options); }
  };
  const result = navigateTimelineItem({ containerEl: { querySelector() { return null; } } }, {
    uri: 'obsidian://go-study?resource=r1&position=time%3A65&v=1',
    line: null,
    anchor
  });
  assert.equal(result.transport, 'note');
  assert.equal(result.mode, 'rendered');
  assert.equal(result.found, true);
  assert.equal(calls.length, 1);
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


test('timeline parses the exact managed v1 backlink shape from real Obsidian notes', () => {
  const samples = [
    'obsidian://go-study?resource=resource-mt7g36x5-dcnnpi7&position=time%3A16.594&v=1',
    'obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A14.937&v=1',
    'obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A86.497&v=1',
    'obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A112.945&v=1',
    'obsidian://go-study?resource=resource-mtbx3iac-nusq2e9&position=time%3A8795.174&v=1',
    'obsidian://go-study?resource=resource-mt7g36x5-emnzwlq&position=time%3A20.788&v=1',
    'obsidian://go-study?resource=resource-mt7g36x5-emnzwlq&position=time%3A57.397&v=1'
  ];
  for (const uri of samples) {
    const parsed = parseTimelineReferenceUri(uri);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.position.type, 'time');
    assert.ok(parsed.position.seconds >= 0);
  }
});

test('timeline groups the real seven-link note into four managed sources even if resources are missing', () => {
  const plugin = { state: { resources: {} } };
  const markdown = [
    '[↗ 回到课程 · 00:16](obsidian://go-study?resource=resource-mt7g36x5-dcnnpi7&position=time%3A16.594&v=1)',
    '[↗ 回到课程 · 00:14](obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A14.937&v=1)',
    '[↗ 回到课程 · 01:26](obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A86.497&v=1)',
    '[↗ 回到课程 · 01:52](obsidian://go-study?resource=resource-mt7g36x6-30v540g&position=time%3A112.945&v=1)',
    '[↗ 回到课程 · 02:26:35](obsidian://go-study?resource=resource-mtbx3iac-nusq2e9&position=time%3A8795.174&v=1)',
    '[↗ 回到课程 · 00:20](obsidian://go-study?resource=resource-mt7g36x5-emnzwlq&position=time%3A20.788&v=1)',
    '[↗ 回到课程 · 00:57](obsidian://go-study?resource=resource-mt7g36x5-emnzwlq&position=time%3A57.397&v=1)'
  ].join('\n');
  const groups = timelineGroupsFromMarkdown(markdown, plugin);
  assert.equal(groups.length, 4);
  assert.equal(timelineSummary(groups).timestampCount, 7);
});


test('timeline signature stays stable when the source/time model has not changed', () => {
  const groups = [{
    key: 'managed:r1',
    title: '学习摄影',
    kind: 'managed',
    items: [
      { seconds: 14, uri: 'obsidian://go-study?resource=r1&position=time%3A14&v=1' },
      { seconds: 86, uri: 'obsidian://go-study?resource=r1&position=time%3A86&v=1' }
    ]
  }];
  assert.equal(timelineSignature(groups), timelineSignature(JSON.parse(JSON.stringify(groups))));
});

test('timeline mutation observer ignores its own overlay insertion/removal', () => {
  const timelineNode = {
    nodeType: 1,
    matches(selector) { return selector === '.go-study-floating-timeline'; },
    closest() { return null; }
  };
  const body = { nodeType: 1, matches() { return false; }, closest() { return null; } };
  assert.equal(mutationOnlyTouchesTimelineUi({
    target: body,
    addedNodes: [timelineNode],
    removedNodes: []
  }), true);
  assert.equal(mutationOnlyTouchesTimelineUi({
    target: body,
    addedNodes: [],
    removedNodes: [timelineNode]
  }), true);
});

test('stable timeline render reuses unchanged DOM instead of rebuilding on every refresh', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'timeline-navigator.cjs'), 'utf8');
  assert.match(source, /goStudyTimelineSignature === signature/);
  assert.match(source, /positionTimelineOverlay\(existing, host, doc\)/);
  assert.match(source, /records\.every\(mutationOnlyTouchesTimelineUi\)/);
});


test('raw Go Study matches remember the Markdown line for local knowledge navigation', () => {
  const uri = buildReferenceUri({ resourceId: 'r1', position: { type: 'time', seconds: 16 }, version: 1 });
  const markdown = ['标题', '', '一段说明', `[回到课程](${uri})`, '尾部'].join('\n');
  const matches = extractGoStudyReferenceUris(markdown);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 3);
});

test('timeline runtime renders only the active relevant Markdown note and clears stale overlays', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'timeline-navigator.cjs'), 'utf8');
  assert.match(source, /const view = activeMarkdownView\(plugin\);\s*clearTimelinesExcept\(plugin, view\);\s*if \(!view\) return \[\];/);
  assert.doesNotMatch(source, /for \(const leaf of leaves\)[\s\S]{0,220}refreshTimelineView/);
});

test('Timeline Navigator no longer owns playback or browser-opening semantics', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'timeline-navigator.cjs'), 'utf8');
  assert.doesNotMatch(source, /openExternal|browserUrlAtPosition|openResourceReference/);
  assert.match(source, /点击定位到笔记/);
});


test('collapsed timeline rail uses one dot per video source, not one dot per timestamp', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'timeline-navigator.cjs'), 'utf8');
  assert.match(source, /const sourceNodes = groups\.slice\(0, 18\)/);
  assert.match(source, /sourceNodes\.forEach\(\(group, index\)/);
  assert.doesNotMatch(source, /flattened\.slice\(0, 18\)/);
});


test('portable managed v3 keeps its source title visible in Timeline after Resource state is lost', () => {
  const uri = buildReferenceUri({
    resourceId: 'missing-v3',
    locator: 'https://www.bilibili.com/video/BV1LOST',
    name: 'BV1LOST',
    title: '遗失资源但来源仍可识别',
    web: 'https://www.bilibili.com/video/BV1LOST',
    position: { type: 'time', seconds: 33 },
    version: 3
  });
  const groups = timelineGroupsFromMarkdown(`[00:33](${uri})`, { state: { resources: {} } });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, '遗失资源但来源仍可识别');
  assert.equal(groups[0].items[0].time, '00:33');
});
