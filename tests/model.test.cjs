'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/model.cjs');

function fixture() {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, '视频课程');
  return { state, project, module };
}

test('纯净状态不包含旧版项目或资源', () => {
  const state = model.defaultState();
  assert.deepEqual(Object.keys(state.projects), []);
  assert.deepEqual(Object.keys(state.resources), []);
  assert.equal(state.schemaVersion, 1);
});

test('较新 schema 会停止加载，避免旧插件覆盖未来数据', () => {
  assert.throws(() => model.normalizeState({ schemaVersion: 999 }), /高于当前支持/);
});

test('外部地址只允许调用方明确列出的协议', () => {
  assert.equal(model.validateExternalUri('https://example.com/a'), 'https://example.com/a');
  assert.equal(model.validateExternalUri('jv://open?path=test', ['jv:']), 'jv://open?path=test');
  assert.throws(() => model.validateExternalUri('file:///C:/secret.txt'), /不允许打开/);
  assert.throws(() => model.validateExternalUri('javascript:alert(1)'), /不允许打开/);
});

test('OpenList 远程连接要求 HTTPS，但本机回环可使用 HTTP', () => {
  assert.equal(model.normalizeOpenListBaseUrl('http://localhost:5244/path'), 'http://127.0.0.1:5244');
  assert.equal(model.normalizeOpenListBaseUrl('https://openlist.example.com/path'), 'https://openlist.example.com');
  assert.throws(() => model.normalizeOpenListBaseUrl('http://192.168.1.20:5244'), /必须使用 HTTPS/);
});

test('项目、模块和资源形成单一组织链路', () => {
  const { state, project, module } = fixture();
  const { resource, reused } = model.addResource(state, module.id, 'https://example.com/course', '示例课程');
  assert.equal(reused, false);
  assert.equal(resource.title, '示例课程');
  assert.equal(resource.kind, 'web');
  assert.deepEqual(model.projectModules(state, project.id).map((item) => item.id), [module.id]);
  assert.deepEqual(model.moduleResources(state, module.id).map((item) => item.id), [resource.id]);
});

test('同一资源跨模块复用同一个身份', () => {
  const { state, project, module } = fixture();
  const other = model.createModule(state, project.id, '网页资料');
  const first = model.addResource(state, module.id, 'https://example.com/');
  const second = model.addResource(state, other.id, 'https://example.com');
  assert.equal(second.reused, true);
  assert.equal(second.resource.id, first.resource.id);
  assert.equal(Object.keys(state.resources).length, 1);
});

test('重命名项目保留稳定身份并保持模块、资源与计划关系', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, '视频课程');
  const { resource } = model.addResource(state, module.id, 'https://example.com/course');
  const { plan } = model.createPlanForTarget(state, project.id, 'module', module.id, '每日课程');
  const ids = { project: project.id, module: module.id, resource: resource.id, plan: plan.id };
  const at = new Date('2026-08-12T08:00:00Z');

  const renamed = model.renameProject(state, project.id, '英语进阶', at);

  assert.equal(renamed, state.projects[ids.project]);
  assert.equal(renamed.id, ids.project);
  assert.equal(renamed.title, '英语进阶');
  assert.equal(renamed.updatedAt, at.toISOString());
  assert.deepEqual(state.projects[ids.project].moduleIds, [ids.module]);
  assert.equal(state.modules[ids.module].projectId, ids.project);
  assert.deepEqual(state.modules[ids.module].resourceIds, [ids.resource]);
  assert.equal(state.resources[ids.resource].id, ids.resource);
  assert.equal(state.plans[ids.plan].projectId, ids.project);
  assert.equal(state.plans[ids.plan].targetType, 'module');
  assert.deepEqual(state.plans[ids.plan].targetIds, [ids.module]);
});

test('资源动作解析区分 B站、本地视频、OpenList 视频和普通网页', () => {
  const bili = model.inferResource('https://www.bilibili.com/video/BV1XJTT6FEY9?p=2');
  const localVideo = model.inferResource('C:\\Course\\lesson 01.mp4');
  const web = model.inferResource('https://example.com/course/page');
  const openListVideo = {
    kind: 'video',
    title: '第一课',
    sourceId: 'source-openlist',
    canonicalKey: 'openlist:test:/course/part 1/01.mp4',
    launcher: { type: 'openlist', sourceId: 'source-openlist', remotePath: '/course/part 1/01.mp4' },
    metadata: { remotePath: '/course/part 1/01.mp4' }
  };
  const sources = {
    'source-openlist': { id: 'source-openlist', type: 'openlist', baseUrl: 'http://127.0.0.1:5244', deletedAt: '' }
  };

  const biliActions = model.resolveResourceActions(bili);
  assert.equal(biliActions.webTarget, 'https://www.bilibili.com/video/BV1XJTT6FEY9?p=2');
  assert.deepEqual(biliActions.playTarget, {
    type: 'potplayer',
    target: 'https://www.bilibili.com/video/BV1XJTT6FEY9?p=2'
  });
  assert.equal(biliActions.defaultTarget, null);

  const localActions = model.resolveResourceActions(localVideo);
  assert.deepEqual(localActions.playTarget, { type: 'potplayer', target: 'C:\\Course\\lesson 01.mp4' });
  assert.equal(localActions.webTarget, null);
  assert.equal(localActions.defaultTarget, null);

  const openListActions = model.resolveResourceActions(openListVideo, sources);
  assert.deepEqual(openListActions.playTarget, {
    type: 'openlist', sourceId: 'source-openlist', remotePath: '/course/part 1/01.mp4'
  });
  assert.equal(openListActions.webTarget, 'http://127.0.0.1:5244/course/part%201/01.mp4');
  assert.equal(openListActions.defaultTarget, null);

  const webActions = model.resolveResourceActions(web);
  assert.equal(webActions.webTarget, 'https://example.com/course/page');
  assert.equal(webActions.playTarget, null);
  assert.equal(webActions.defaultTarget, null);
});

test('OpenList 非视频文件只提供默认打开动作', () => {
  const resource = {
    id: 'resource-openlist-pdf',
    kind: 'pdf',
    title: '讲义',
    sourceId: 'source-openlist',
    launcher: { type: 'openlist-file', sourceId: 'source-openlist', remotePath: '/course/handout.pdf' },
    metadata: { remotePath: '/course/handout.pdf', category: 'pdf' }
  };

  assert.deepEqual(model.resolveResourceActions(resource, {
    'source-openlist': { id: 'source-openlist', type: 'openlist', baseUrl: 'http://127.0.0.1:5244', deletedAt: '' }
  }), {
    webTarget: null,
    playTarget: null,
    defaultTarget: { type: 'openlist-file', sourceId: 'source-openlist', remotePath: '/course/handout.pdf' }
  });
});

test('旧资源清单整行会提取链接、标题和稳定身份', () => {
  const row = '| 18 分钟搞定助动词 | 这是我们学习的第十二周，全年进度 23% | <https://www.bilibili.com/video/BV1XJTT6FEY9> | bili:BV1XJTT6FEY9:p1 | 合集·英语自学指北 |';
  const parsed = model.extractResourceInput(row);
  const inferred = model.inferResource(row);
  assert.equal(parsed.value, 'https://www.bilibili.com/video/BV1XJTT6FEY9');
  assert.equal(parsed.title, '18 分钟搞定助动词');
  assert.equal(inferred.kind, 'video');
  assert.equal(inferred.title, '18 分钟搞定助动词');
  assert.equal(inferred.canonicalKey, 'bili:BV1XJTT6FEY9:p1');
  assert.equal(inferred.launcher.type, 'potplayer');
  assert.equal(inferred.launcher.target, 'https://www.bilibili.com/video/BV1XJTT6FEY9');
});

test('B站链接去除追踪参数并保留分P身份', () => {
  const parsed = model.parseBiliVideoUrl('https://www.bilibili.com/video/BV1UeuZ6qEtM/?spm_id_from=test&p=3');
  const inferred = model.inferResource('https://www.bilibili.com/video/BV1UeuZ6qEtM/?spm_id_from=test&p=3');
  assert.equal(parsed.bvid, 'BV1UeuZ6qEtM');
  assert.equal(parsed.page, 3);
  assert.equal(inferred.canonicalKey, 'bili:BV1UEUZ6QETM:p3');
  assert.equal(inferred.launcher.target, 'https://www.bilibili.com/video/BV1UeuZ6qEtM?p=3');
});

test('B站UP搜索结果会规范化头像和账号信息', () => {
  const results = model.normalizeBiliUserSearchResults({
    result: [{ mid: 483162496, uname: '英语兔', usign: '轻松学英语', fans: 13292793, videos: 271, upic: '//i2.hdslb.com/avatar.jpg', official_verify: { desc: '知名UP主' } }]
  });
  assert.deepEqual(results, [{
    mid: '483162496', name: '英语兔', description: '轻松学英语', avatar: 'https://i2.hdslb.com/avatar.jpg', followers: 13292793, videos: 271, verified: '知名UP主'
  }]);
});

test('UP名称中的数字不会被误判成UID', () => {
  assert.equal(model.parseBiliUserInput('老师2026'), '');
  assert.equal(model.parseBiliUserInput('483162496'), '483162496');
  assert.equal(model.parseBiliUserInput('https://space.bilibili.com/483162496/'), '483162496');
  assert.equal(model.parseBiliUserInput('https://www.bilibili.com/video/BV1abc'), '');
});

test('普通 OpenList 目录链接会解析为目录而不是网页', () => {
  const source = { id: 'source-openlist', type: 'openlist', baseUrl: 'http://127.0.0.1:5244', deletedAt: '' };
  const parsed = model.parseOpenListUrl('http://localhost:5244/百度网盘/课程%20一', [source]);
  const inferred = model.inferResource('http://localhost:5244/百度网盘/课程%20一');
  assert.equal(parsed.sourceId, source.id);
  assert.equal(parsed.baseUrl, 'http://127.0.0.1:5244');
  assert.equal(parsed.rootPath, '/百度网盘/课程 一');
  assert.equal(parsed.title, '课程 一');
  assert.equal(inferred.kind, 'openlist-folder');
});

test('OpenList 导入根以实际选择为准而不是来源浏览器根目录', () => {
  assert.equal(model.openListImportRoot([
    { is_dir: true, remotePath: '/FREE高考英语/百度网盘/英语相关' }
  ]), '/FREE高考英语/百度网盘/英语相关');
  assert.equal(model.openListImportRoot([
    { is_dir: false, remotePath: '/FREE高考英语/百度网盘/英语相关/01.mp4' },
    { is_dir: false, remotePath: '/FREE高考英语/百度网盘/英语相关/02.mp4' }
  ]), '/FREE高考英语/百度网盘/英语相关');
  assert.equal(model.openListImportRoot([
    { is_dir: true, remotePath: '/FREE高考英语/百度网盘/英语相关' },
    { is_dir: true, remotePath: '/FREE高考英语/百度网盘/专升本英语' }
  ]), '/FREE高考英语/百度网盘');
});

test('Markdown 链接可直接作为添加内容输入', () => {
  const inferred = model.inferResource('[第一课](https://example.com/course/1)');
  assert.equal(inferred.kind, 'web');
  assert.equal(inferred.title, '第一课');
  assert.equal(inferred.launcher.uri, 'https://example.com/course/1');
});

test('底层最近使用记录不隐式改变完成状态，完成由启动用例编排', () => {
  const { state, project, module } = fixture();
  const { resource } = model.addResource(state, module.id, 'anki: 正在学::音标');
  const { plan } = model.createPlanForTarget(state, project.id, 'resource', resource.id, '音标训练');
  const at = new Date('2026-08-09T10:00:00+08:00');
  model.markResourceOpened(state, resource.id, at);
  assert.equal(resource.completedAt, '');
  assert.equal(model.planProgress(plan, at).completed, 0);
  assert.equal(state.activity.at(-1).type, 'resource-opened');
});

test('显式标记资源完成是幂等的，不会覆盖首次完成时间', () => {
  const { state, module } = fixture();
  const { resource } = model.addResource(state, module.id, 'https://example.com/complete');
  const firstAt = new Date('2026-08-12T09:00:00Z');
  const secondAt = new Date('2026-08-12T10:00:00Z');

  const first = model.markResourceComplete(state, resource.id, firstAt);
  const second = model.markResourceComplete(state, resource.id, secondAt);

  assert.equal(first, second);
  assert.equal(second.completedAt, firstAt.toISOString());
  assert.equal(second.updatedAt, secondAt.toISOString());
});

test('明确确认后计划进度即时变化且不会超过目标', () => {
  const { state, project, module } = fixture();
  const { plan } = model.createPlanForTarget(state, project.id, 'module', module.id, '视频课程');
  plan.dailyTarget = 2;
  const at = new Date('2026-08-09T12:00:00+08:00');
  assert.deepEqual(model.incrementPlan(state, plan.id, 1, at), { key: '2026-08-09', completed: 1, target: 2, done: false });
  assert.equal(model.incrementPlan(state, plan.id, 1, at).done, true);
  assert.equal(model.incrementPlan(state, plan.id, 1, at).completed, 2);
});

test('凌晨四点前仍归入上一学习日', () => {
  assert.equal(model.studyDate(new Date(2026, 7, 10, 3, 59, 0), 4), '2026-08-09');
  assert.equal(model.studyDate(new Date(2026, 7, 10, 4, 0, 0), 4), '2026-08-10');
});

test('学习计划只在选择的刷新日出现，并沿用凌晨四点边界', () => {
  const { state, project, module } = fixture();
  const { plan } = model.createPlanForTarget(state, project.id, 'module', module.id, '周一任务');
  plan.schedule.weekdays = [1];
  plan.resetHour = 4;
  assert.equal(model.planScheduledFor(plan, new Date(2026, 7, 10, 10, 0, 0)), true);
  assert.equal(model.planScheduledFor(plan, new Date(2026, 7, 11, 3, 0, 0)), true);
  assert.equal(model.planScheduledFor(plan, new Date(2026, 7, 11, 5, 0, 0)), false);
});

test('normalizeState 保留折叠和滚动状态并清理非法当前项目', () => {
  const state = model.normalizeState({
    uiState: {
      currentProjectId: 'missing',
      collapsedTodayProjects: { p1: true },
      collapsedProjectPlans: { plan1: false },
      scrollPositions: { today: 88 },
      selectedBiliSourceId: 'source-up'
    }
  });
  assert.equal(state.uiState.currentProjectId, '');
  assert.equal(state.uiState.collapsedTodayProjects.p1, true);
  assert.equal(state.uiState.collapsedProjectPlans.plan1, false);
  assert.equal(state.uiState.scrollPositions.today, 88);
  assert.equal(state.uiState.selectedBiliSourceId, 'source-up');
});

test('今日布局归一化并分别记住项目组与辅助卡片顺序', () => {
  const state = model.defaultState();
  const first = model.createProject(state, '英语');
  const second = model.createProject(state, '编程');
  const third = model.createProject(state, '政治');
  state.uiState.todayProjectOrder = [second.id, 'missing'];
  state.uiState.todaySidebarOrder = ['memo', 'unknown', 'current'];
  state.uiState.showInterfaceTips = false;

  const normalized = model.normalizeState(state);
  assert.deepEqual(model.todayProjects(normalized).map((project) => project.id), [second.id, first.id, third.id]);
  assert.deepEqual(normalized.uiState.todaySidebarOrder, ['memo', 'current', 'progress', 'inbox']);
  assert.equal(normalized.uiState.showInterfaceTips, false);

  model.moveTodayProjectBefore(normalized, third.id, first.id);
  model.moveTodaySidebarCardBefore(normalized, 'inbox', 'memo');
  assert.deepEqual(model.todayProjects(normalized).map((project) => project.id), [second.id, third.id, first.id]);
  assert.deepEqual(normalized.uiState.todaySidebarOrder, ['inbox', 'memo', 'current', 'progress']);
  assert.deepEqual(model.activeProjects(normalized).map((project) => project.id), [first.id, second.id, third.id]);
});

test('旧状态归一化为 alpha.10 安全默认值且不提升 schema', () => {
  const state = model.normalizeState({
    schemaVersion: 1,
    projects: { p1: { id: 'p1', title: '旧项目', moduleIds: [] } },
    uiState: { currentProjectId: 'p1' }
  });

  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.vaultRefs, {});
  assert.deepEqual(state.projects.p1.vaultRefIds, []);
  assert.deepEqual(state.projects.p1.pinnedVaultRefIds, []);
  assert.equal(state.projects.p1.memoText, '');
  assert.equal(state.projects.p1.memoUpdatedAt, '');
  assert.deepEqual(state.projects.p1.memos, []);
  assert.deepEqual(state.uiState.projectPanelOrder, ['tasks', 'files', 'memo']);
  assert.deepEqual(state.uiState.projectPanelCollapsedByProject, {});
  assert.deepEqual(state.uiState.projectRecentCollapsedByProject, {});
  assert.deepEqual(state.uiState.recentVaultCreatePaths, []);
  assert.deepEqual(state.uiState.pinnedVaultCreatePaths, []);
  assert.deepEqual(model.normalizeState(state), state);
});

test('alpha.12 首次按模块主区和旧辅助顺序生成 4xn 布局且重复归一化幂等', () => {
  const raw = {
    schemaVersion: 1,
    projects: { p1: { id: 'p1', title: '英语', moduleIds: ['m1', 'm2', 'm3', 'm4'] } },
    modules: {
      m1: { id: 'm1', projectId: 'p1', title: '听力', sortOrder: 0 },
      m2: { id: 'm2', projectId: 'p1', title: '阅读', sortOrder: 1 },
      m3: { id: 'm3', projectId: 'p1', title: '写作', sortOrder: 2 },
      m4: { id: 'm4', projectId: 'p1', title: '口语', sortOrder: 3 }
    },
    uiState: { projectPanelOrder: ['memo', 'files', 'tasks'] }
  };

  const state = model.normalizeState(raw);
  const layout = state.uiState.projectBoardLayouts.p1;
  assert.equal(layout.version, 1);
  assert.deepEqual(layout.items, {
    'module:m1': { column: 1, row: 1 },
    'module:m2': { column: 2, row: 1 },
    'module:m3': { column: 3, row: 1 },
    'module:m4': { column: 1, row: 2 },
    'utility:files': { column: 4, row: 1 },
    'utility:tasks': { column: 4, row: 2 }
  });
  assert.deepEqual(state.projects.p1.moduleIds, raw.projects.p1.moduleIds);
  assert.deepEqual(Object.values(state.modules).map((item) => item.title), ['听力', '阅读', '写作', '口语']);
  assert.deepEqual(model.normalizeState(state), state);
});

test('项目布局保留空格、新项占首个空格、占用锚点交换且可撤回和重置', () => {
  const state = model.defaultState();
  state.uiState.projectPanelOrder = ['memo', 'tasks', 'files'];
  const project = model.createProject(state, '英语');
  const first = model.createModule(state, project.id, '听力');

  model.moveProjectBoardItem(state, project.id, `module:${first.id}`, 3, 5);
  const second = model.createModule(state, project.id, '阅读');
  let layout = model.ensureProjectBoardLayout(state, project.id);
  assert.deepEqual(layout.items[`module:${first.id}`], { column: 3, row: 5 });
  assert.deepEqual(layout.items[`module:${second.id}`], { column: 1, row: 1 });

  const moved = model.moveProjectBoardItem(state, project.id, `module:${second.id}`, 4, 2);
  layout = moved.layout;
  assert.equal(moved.swappedWith, 'utility:files');
  assert.deepEqual(layout.items['utility:files'], { column: 1, row: 1 });
  assert.deepEqual(layout.items[`module:${second.id}`], { column: 4, row: 2 });
  assert.equal(model.undoLastAction(state).restoredProjectBoardLayout, true);
  layout = model.ensureProjectBoardLayout(state, project.id);
  assert.deepEqual(layout.items[`module:${second.id}`], { column: 1, row: 1 });
  assert.deepEqual(layout.items['utility:files'], { column: 4, row: 2 });

  const reset = model.resetProjectBoardLayout(state, project.id);
  assert.deepEqual(reset.items[`module:${first.id}`], { column: 1, row: 1 });
  assert.deepEqual(reset.items[`module:${second.id}`], { column: 2, row: 1 });
  assert.deepEqual(reset.items['utility:files'], { column: 4, row: 1 });
  assert.deepEqual(reset.items['utility:tasks'], { column: 4, row: 2 });
  assert.deepEqual(reset.items[`memo:${project.memos[0].id}`], { column: 4, row: 3, side: 'left' });
  assert.throws(() => model.moveProjectBoardItem(state, project.id, 'module:missing', 1, 1), /找不到布局项/);
  assert.throws(() => model.moveProjectBoardItem(state, project.id, `module:${first.id}`, 5, 1), /布局位置无效/);
});

test('布局归一化清理外部项与重复非法锚点但不压缩有效空格', () => {
  const state = model.normalizeState({
    projects: { p1: { id: 'p1', title: '英语', moduleIds: ['m1', 'm2'] } },
    modules: {
      m1: { id: 'm1', projectId: 'p1', title: '听力', sortOrder: 0 },
      m2: { id: 'm2', projectId: 'p1', title: '阅读', sortOrder: 1 }
    },
    uiState: {
      projectBoardLayouts: {
        p1: {
          version: 99,
          items: {
            'module:m1': { column: 2, row: 8 },
            'module:m2': { column: 2, row: 8 },
            'module:deleted': { column: 3, row: 9 },
            'utility:files': { column: 0, row: -1 }
          }
        },
        missing: { version: 1, items: {} }
      }
    }
  });

  const layout = state.uiState.projectBoardLayouts.p1;
  assert.deepEqual(layout.items['module:m1'], { column: 2, row: 8 });
  assert.deepEqual(layout.items['module:m2'], { column: 1, row: 1 });
  assert.equal(layout.items['module:deleted'], undefined);
  assert.equal(state.uiState.projectBoardLayouts.missing, undefined);
  assert.deepEqual(model.normalizeState(state), state);
  assert.deepEqual(model.projectBoardItems(state, 'p1').map((item) => item.key), [
    'module:m2', 'utility:files', 'utility:tasks', 'module:m1'
  ]);
});

test('旧便签容器锚点迁移给第一张便签且多便签可独立移动', () => {
  const state = model.normalizeState({
    projects: { p1: { id: 'p1', title: '英语', memos: [{ id: 'note-1', text: '一' }, { id: 'note-2', text: '二' }] } },
    uiState: { projectBoardLayouts: { p1: { version: 1, items: { 'utility:memo': { column: 2, row: 4 } } } } }
  });
  const items = state.uiState.projectBoardLayouts.p1.items;
  assert.deepEqual(items['memo:note-1'], { column: 2, row: 4, side: 'left' });
  assert.ok(items['memo:note-2']);
  assert.equal(items['utility:memo'], undefined);
  model.moveProjectBoardItem(state, 'p1', 'memo:note-2', 2, 4, { side: 'right' });
  assert.deepEqual(state.uiState.projectBoardLayouts.p1.items['memo:note-2'], { column: 2, row: 4, side: 'right' });
  model.deleteProjectMemo(state, 'p1', 'note-1');
  assert.equal(state.uiState.projectBoardLayouts.p1.items['memo:note-1'], undefined);
});

test('便签以四列内左右半格配对，移动只交换同侧便签且不覆盖整格组件', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const first = project.memos[0];
  const second = model.createProjectMemo(state, project.id, '第二张');
  const third = model.createProjectMemo(state, project.id, '第三张');
  let layout = model.resetProjectBoardLayout(state, project.id);
  assert.deepEqual(layout.items[`memo:${first.id}`], { column: 4, row: 3, side: 'left' });
  assert.deepEqual(layout.items[`memo:${second.id}`], { column: 4, row: 3, side: 'right' });
  assert.deepEqual(layout.items[`memo:${third.id}`], { column: 4, row: 4, side: 'left' });

  const moved = model.moveProjectBoardItem(state, project.id, `memo:${third.id}`, 4, 3, { side: 'right' });
  assert.equal(moved.swappedWith, `memo:${second.id}`);
  layout = moved.layout;
  assert.deepEqual(layout.items[`memo:${third.id}`], { column: 4, row: 3, side: 'right' });
  assert.deepEqual(layout.items[`memo:${second.id}`], { column: 4, row: 4, side: 'left' });
  assert.throws(() => model.moveProjectBoardItem(state, project.id, `memo:${first.id}`, 4, 1, { side: 'left' }), /整格已被/);
});

test('旧的连续独立便签锚点升级时两两合并为同一四列格的左右两侧', () => {
  const state = model.normalizeState({
    projects: { p1: { id: 'p1', title: '英语', memos: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] } },
    uiState: { projectBoardLayouts: { p1: { items: {
      'memo:m1': { column: 4, row: 3 },
      'memo:m2': { column: 4, row: 4 },
      'memo:m3': { column: 4, row: 5 }
    } } } }
  });
  const items = state.uiState.projectBoardLayouts.p1.items;
  assert.deepEqual(items['memo:m1'], { column: 4, row: 3, side: 'left' });
  assert.deepEqual(items['memo:m2'], { column: 4, row: 3, side: 'right' });
  assert.deepEqual(items['memo:m3'], { column: 4, row: 4, side: 'left' });
  assert.deepEqual(model.normalizeState(state), state);
});

test('便签标题可独立重命名并保留正文与稳定身份', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const memo = project.memos[0];
  model.updateProjectMemo(state, project.id, memo.id, '正文');
  model.updateProjectMemoTitle(state, project.id, memo.id, '复习清单');
  const current = state.projects[project.id].memos.find((candidate) => candidate.id === memo.id);
  assert.equal(memo.id, current.id);
  assert.equal(current.title, '复习清单');
  assert.equal(current.text, '正文');
  const normalized = model.normalizeState(state);
  assert.equal(normalized.projects[project.id].memos[0].title, '复习清单');
  assert.equal(normalized.projects[project.id].memos[0].text, '正文');
});

test('旧单便签迁移到 memos 且重复归一化不新增便签', () => {
  const raw = {
    schemaVersion: 1,
    projects: {
      legacy: {
        id: 'legacy',
        title: '旧项目',
        memoText: '旧便签内容',
        memoUpdatedAt: '2026-08-12T11:00:00.000Z'
      }
    }
  };

  const once = model.normalizeState(raw);
  const migrated = once.projects.legacy.memos;
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].text, '旧便签内容');
  assert.equal(migrated[0].updatedAt, '2026-08-12T11:00:00.000Z');
  assert.deepEqual(model.normalizeState(once), once);

  const whitespace = model.normalizeState({ projects: { legacy: { id: 'legacy', title: '旧项目', memoText: '  ' } } });
  assert.deepEqual(whitespace.projects.legacy.memos.map((memo) => memo.text), ['  ']);

  const sameTextAlreadyPresent = model.normalizeState({
    projects: {
      legacy: {
        id: 'legacy',
        title: '旧项目',
        memoText: '旧便签内容',
        memoUpdatedAt: '2026-08-12T11:00:00.000Z',
        memos: [{ id: 'memo-existing', text: '旧便签内容', updatedAt: '2026-08-11T11:00:00.000Z' }]
      }
    }
  });
  assert.deepEqual(sameTextAlreadyPresent.projects.legacy.memos.map((memo) => memo.id), ['memo-existing']);
});

test('多便签新增、更新、删除保持稳定身份并按项目隔离', () => {
  const state = model.defaultState();
  const firstProject = model.createProject(state, '英语');
  const secondProject = model.createProject(state, '写作');
  const firstMemo = firstProject.memos[0];
  const firstAt = new Date('2026-08-12T12:00:00.000Z');
  const secondAt = new Date('2026-08-12T13:00:00.000Z');

  model.updateProjectMemo(state, firstProject.id, firstMemo.id, '第一张', firstAt);
  const secondMemo = model.createProjectMemo(state, firstProject.id, '第二张', secondAt);
  const secondId = secondMemo.id;
  model.updateProjectMemo(state, firstProject.id, secondId, '第二张·已改', secondAt);

  assert.equal(firstProject.memos[0].id, firstMemo.id);
  assert.equal(firstProject.memos[1].id, secondId);
  assert.equal(firstProject.memos[0].updatedAt, firstAt.toISOString());
  assert.equal(firstProject.memos[1].text, '第二张·已改');
  assert.deepEqual(secondProject.memos.map((memo) => memo.text), ['']);
  assert.notEqual(secondProject.memos[0].id, firstMemo.id);

  const removed = model.deleteProjectMemo(state, firstProject.id, firstMemo.id, secondAt);
  assert.equal(removed.id, firstMemo.id);
  assert.deepEqual(firstProject.memos.map((memo) => memo.id), [secondId]);
  assert.equal(firstProject.memoText, '第二张·已改');
  assert.equal(firstProject.memoUpdatedAt, secondAt.toISOString());
});

test('项目最近修改折叠状态按项目归一化、切换并随永久删除清理', () => {
  const state = model.normalizeState({
    projects: { p1: { id: 'p1', title: '英语' } },
    uiState: { projectRecentCollapsedByProject: { p1: true, missing: true } }
  });
  assert.deepEqual(state.uiState.projectRecentCollapsedByProject, { p1: true });
  assert.equal(model.setProjectRecentCollapsed(state, 'p1', false), false);
  assert.equal(state.uiState.projectRecentCollapsedByProject.p1, false);

  const created = model.createProject(state, '写作');
  model.setProjectRecentCollapsed(state, created.id, true);
  model.deleteProject(state, created.id);
  assert.equal(state.uiState.projectRecentCollapsedByProject[created.id], undefined);
});

test('Vault 路径规范化并按路径与文件类型跨项目复用', () => {
  const state = model.defaultState();
  const firstProject = model.createProject(state, '英语');
  const secondProject = model.createProject(state, '写作');
  const first = model.upsertVaultRef(state, { path: '\\学习\\英语/./路线.canvas', entryType: 'file' });
  const reused = model.upsertVaultRef(state, { path: '/学习/英语/路线.canvas', entryType: 'file' });
  const folder = model.upsertVaultRef(state, { path: '学习/英语/路线.canvas/', entryType: 'folder' });

  assert.equal(model.normalizeVaultPath('\\学习\\英语/./路线.canvas'), '学习/英语/路线.canvas');
  assert.equal(reused.reused, true);
  assert.equal(reused.vaultRef.id, first.vaultRef.id);
  assert.notEqual(folder.vaultRef.id, first.vaultRef.id);
  assert.equal(first.vaultRef.fileKind, 'canvas');
  assert.equal(folder.vaultRef.entryType, 'folder');
  model.linkVaultRefToProject(state, firstProject.id, first.vaultRef.id);
  model.linkVaultRefToProject(state, secondProject.id, reused.vaultRef.id);
  assert.deepEqual(firstProject.vaultRefIds, [first.vaultRef.id]);
  assert.deepEqual(secondProject.vaultRefIds, [first.vaultRef.id]);
  assert.equal(Object.keys(state.vaultRefs).length, 2);
});

test('VaultRef 重命名保持 ID，missing 标记可幂等恢复', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const { vaultRef } = model.upsertVaultRef(state, { path: '学习/旧笔记.md', entryType: 'file' });
  model.linkVaultRefToProject(state, project.id, vaultRef.id);
  const renamedAt = new Date('2026-08-12T08:00:00Z');
  const missingAt = new Date('2026-08-12T09:00:00Z');
  const repeatedAt = new Date('2026-08-12T10:00:00Z');

  const renamed = model.updateVaultRefPath(state, vaultRef.id, '学习/新笔记.md', renamedAt);
  model.markVaultRefMissing(state, vaultRef.id, missingAt);
  model.markVaultRefMissing(state, vaultRef.id, repeatedAt);

  assert.equal(renamed.id, vaultRef.id);
  assert.equal(renamed.path, '学习/新笔记.md');
  assert.deepEqual(project.vaultRefIds, [vaultRef.id]);
  assert.equal(vaultRef.missingAt, missingAt.toISOString());
  model.restoreVaultRef(state, vaultRef.id, repeatedAt);
  assert.equal(vaultRef.missingAt, '');
});

test('VaultRef 重新关联到已有路径时合并身份与项目置顶关系', () => {
  const state = model.defaultState();
  const firstProject = model.createProject(state, '英语');
  const secondProject = model.createProject(state, '写作');
  const oldRef = model.upsertVaultRef(state, { path: '学习/旧笔记.md', entryType: 'file' }).vaultRef;
  const existingRef = model.upsertVaultRef(state, { path: '学习/共用笔记.md', entryType: 'file' }).vaultRef;
  model.linkVaultRefToProject(state, firstProject.id, oldRef.id);
  model.linkVaultRefToProject(state, secondProject.id, existingRef.id);
  model.togglePinnedVaultRef(state, firstProject.id, oldRef.id);

  const merged = model.updateVaultRefPath(state, oldRef.id, existingRef.path, new Date('2026-08-12T09:00:00Z'));

  assert.equal(merged.id, existingRef.id);
  assert.equal(state.vaultRefs[oldRef.id], undefined);
  assert.deepEqual(firstProject.vaultRefIds, [existingRef.id]);
  assert.deepEqual(firstProject.pinnedVaultRefIds, [existingRef.id]);
  assert.deepEqual(secondProject.vaultRefIds, [existingRef.id]);
});

test('解除最后一个项目关联只清理插件引用记录', () => {
  const state = model.defaultState();
  const firstProject = model.createProject(state, '英语');
  const secondProject = model.createProject(state, '写作');
  const { vaultRef } = model.upsertVaultRef(state, { path: '学习/共用.md', entryType: 'file' });
  model.linkVaultRefToProject(state, firstProject.id, vaultRef.id);
  model.linkVaultRefToProject(state, secondProject.id, vaultRef.id);

  assert.equal(model.unlinkVaultRefFromProject(state, firstProject.id, vaultRef.id).cleaned, false);
  assert.ok(state.vaultRefs[vaultRef.id]);
  assert.equal(model.unlinkVaultRefFromProject(state, secondProject.id, vaultRef.id).cleaned, true);
  assert.equal(state.vaultRefs[vaultRef.id], undefined);
});

test('项目文件置顶切换无重复并稳定排在普通引用之前', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const first = model.upsertVaultRef(state, { path: '学习/一.md', entryType: 'file' }).vaultRef;
  const second = model.upsertVaultRef(state, { path: '学习/二.md', entryType: 'file' }).vaultRef;
  const third = model.upsertVaultRef(state, { path: '学习/三.md', entryType: 'file' }).vaultRef;
  [first, second, third].forEach((vaultRef) => model.linkVaultRefToProject(state, project.id, vaultRef.id));

  assert.equal(model.togglePinnedVaultRef(state, project.id, second.id), true);
  assert.equal(model.togglePinnedVaultRef(state, project.id, third.id), true);
  assert.deepEqual(model.projectVaultRefs(state, project.id).map((vaultRef) => vaultRef.id), [second.id, third.id, first.id]);
  assert.equal(model.togglePinnedVaultRef(state, project.id, second.id), false);
  assert.equal(model.togglePinnedVaultRef(state, project.id, second.id), true);
  assert.deepEqual(project.pinnedVaultRefIds, [third.id, second.id]);
  assert.deepEqual(model.projectVaultRefs(state, project.id).map((vaultRef) => vaultRef.id), [second.id, third.id, first.id]);
});

test('项目文件可批量关联、去重并由单步撤回清理本次新增引用', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const existing = model.upsertVaultRef(state, { path: '英语/已有.md', entryType: 'file', fileKind: 'markdown' }).vaultRef;
  model.linkVaultRefToProject(state, project.id, existing.id);

  const result = model.linkVaultEntriesToProject(state, project.id, [
    { path: '英语/已有.md', entryType: 'file', fileKind: 'markdown' },
    { path: '英语/听力.canvas', entryType: 'file', fileKind: 'canvas' },
    { path: '英语/资料', entryType: 'folder' },
    { path: '英语/听力.canvas', entryType: 'file', fileKind: 'canvas' }
  ]);

  assert.equal(result.linkedVaultRefIds.length, 2);
  assert.equal(model.projectVaultRefs(state, project.id).length, 3);
  assert.equal(state.uiState.lastAction.type, 'link-vault-refs');
  const undone = model.undoLastAction(state);
  assert.equal(undone.unlinkedVaultRefCount, 2);
  assert.deepEqual(model.projectVaultRefs(state, project.id).map((ref) => ref.path), ['英语/已有.md']);
  assert.equal(Object.keys(state.vaultRefs).length, 1);
});

test('撤回批量项目文件关联不会删除其他项目正在使用的引用', () => {
  const state = model.defaultState();
  const first = model.createProject(state, '英语');
  const second = model.createProject(state, '复习');
  const shared = model.upsertVaultRef(state, { path: '英语/共享.md', entryType: 'file' }).vaultRef;
  model.linkVaultRefToProject(state, second.id, shared.id);
  model.linkVaultEntriesToProject(state, first.id, [{ path: '英语/共享.md', entryType: 'file' }]);

  model.undoLastAction(state);
  assert.equal(model.projectVaultRefs(state, first.id).length, 0);
  assert.deepEqual(model.projectVaultRefs(state, second.id).map((ref) => ref.id), [shared.id]);
  assert.ok(state.vaultRefs[shared.id]);
});

test('批量项目文件关联遇到非法项时原子回滚', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const before = JSON.parse(JSON.stringify(state));
  assert.throws(() => model.linkVaultEntriesToProject(state, project.id, [
    { path: '英语/有效.md', entryType: 'file' },
    { path: '', entryType: 'file' }
  ]), /Vault 路径不能为空/);
  assert.deepEqual(state, before);
});

test('撤回批量关联会恢复跨项目旧引用的 missing 元数据', () => {
  const state = model.defaultState();
  const first = model.createProject(state, '英语');
  const second = model.createProject(state, '复习');
  const shared = model.upsertVaultRef(state, { path: '英语/移动过.md', entryType: 'file' }).vaultRef;
  model.linkVaultRefToProject(state, second.id, shared.id);
  model.markVaultRefMissing(state, shared.id, new Date('2026-08-13T01:00:00Z'));
  const missingAt = shared.missingAt;

  model.linkVaultEntriesToProject(state, first.id, [{ path: shared.path, entryType: 'file', fileKind: 'markdown' }], new Date('2026-08-13T02:00:00Z'));
  assert.equal(state.vaultRefs[shared.id].missingAt, '');
  model.undoLastAction(state);
  assert.equal(state.vaultRefs[shared.id].missingAt, missingAt);
  assert.deepEqual(model.projectVaultRefs(state, second.id).map((ref) => ref.id), [shared.id]);
});

test('撤回批量关联会完整恢复原本未关联的 Vault 引用快照', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const existing = model.upsertVaultRef(state, {
    path: '英语/旧引用.md', entryType: 'file', fileKind: 'markdown', customLabel: '保留字段'
  }).vaultRef;
  model.markVaultRefMissing(state, existing.id, new Date('2026-08-13T01:00:00Z'));
  const before = JSON.parse(JSON.stringify(existing));

  model.linkVaultEntriesToProject(state, project.id, [
    { path: existing.path, entryType: 'file', fileKind: 'canvas' }
  ], new Date('2026-08-13T02:00:00Z'));
  model.undoLastAction(state);

  assert.deepEqual(state.vaultRefs[existing.id], before);
  assert.deepEqual(project.vaultRefIds, []);
});

test('辅助区顺序只接受白名单并按项目保存折叠状态', () => {
  const state = model.defaultState();
  const first = model.createProject(state, '英语');
  const second = model.createProject(state, '写作');

  assert.deepEqual(model.setProjectPanelOrder(state, ['memo', 'unknown', 'memo']), ['memo', 'tasks', 'files']);
  model.setProjectPanelCollapsed(state, first.id, 'files', true);
  model.setProjectPanelCollapsed(state, second.id, 'files', false);
  assert.equal(state.uiState.projectPanelCollapsedByProject[first.id].files, true);
  assert.equal(state.uiState.projectPanelCollapsedByProject[second.id].files, false);
  assert.throws(() => model.setProjectPanelCollapsed(state, first.id, 'unknown', true), /未知/);
});

test('项目便签保留原文并记录更新时间', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const at = new Date('2026-08-12T11:00:00Z');

  model.setProjectMemo(state, project.id, '  下一步：整理语法图  ', at);
  assert.equal(project.memoText, '  下一步：整理语法图  ');
  assert.equal(project.memoUpdatedAt, at.toISOString());
});

test('最近和置顶创建路径去重、规范化并保留最近五项', () => {
  const state = model.defaultState();
  ['一', '二', '三', '四', '五', '六'].forEach((path) => model.recordRecentVaultCreatePath(state, `学习/${path}`));
  model.recordRecentVaultCreatePath(state, '\\学习\\四');
  assert.deepEqual(state.uiState.recentVaultCreatePaths, ['学习/四', '学习/六', '学习/五', '学习/三', '学习/二']);

  assert.equal(model.togglePinnedVaultCreatePath(state, '学习\\常用'), true);
  assert.equal(model.togglePinnedVaultCreatePath(state, '/学习/常用/'), false);
  assert.deepEqual(state.uiState.pinnedVaultCreatePaths, []);
});

test('收件箱资源可以复用后加入项目模块', () => {
  const { state, module } = fixture();
  const first = model.addInboxResource(state, 'https://example.com/read', '待整理网页');
  const second = model.addInboxResource(state, 'https://example.com/read');
  assert.equal(first.resource.id, second.resource.id);
  assert.equal(state.inbox.length, 1);
  model.linkResourceToModule(state, module.id, first.resource.id);
  assert.equal(state.inbox.length, 0);
  assert.deepEqual(module.resourceIds, [first.resource.id]);
});

test('项目归档与资源回收均可恢复', () => {
  const { state, project, module } = fixture();
  const { resource } = model.addResource(state, module.id, 'C:\\Course\\01.mp4');
  model.archiveProject(state, project.id, new Date('2026-08-10T00:00:00Z'));
  assert.equal(model.activeProjects(state).length, 0);
  model.restoreProject(state, project.id);
  assert.equal(model.activeProjects(state).length, 1);
  model.trashResource(state, resource.id);
  assert.equal(model.moduleResources(state, module.id).length, 0);
  model.restoreResource(state, resource.id);
  assert.equal(model.moduleResources(state, module.id).length, 1);
});

test('永久删除项目会清理模块与计划但保留全局资源', () => {
  const { state, project, module } = fixture();
  const { resource } = model.addResource(state, module.id, 'https://example.com/course');
  model.createPlanForTarget(state, project.id, 'module', module.id, '每日课程');
  const result = model.deleteProject(state, project.id);
  assert.equal(result.removedModuleCount, 1);
  assert.equal(state.projects[project.id], undefined);
  assert.equal(state.modules[module.id], undefined);
  assert.equal(Object.keys(state.plans).length, 0);
  assert.equal(state.resources[resource.id].title, 'example.com');
});

test('OpenList 描述符以远程路径为稳定身份并刷新启动器', () => {
  const { state, module } = fixture();
  const descriptor = {
    kind: 'video', title: '第一课', canonicalKey: 'openlist:test:/course/01.mp4',
    launcher: { type: 'openlist', sourceId: 's1', remotePath: '/course/01.mp4' }
  };
  const first = model.upsertResourceDescriptor(state, module.id, descriptor);
  const second = model.upsertResourceDescriptor(state, module.id, { ...descriptor, title: '第一课（更新）' });
  assert.equal(first.resource.id, second.resource.id);
  assert.equal(second.resource.title, '第一课（更新）');
  assert.equal(Object.keys(state.resources).length, 1);
});

test('OpenList 展示根属于模块资源关联，同一资源可在不同模块使用不同根', () => {
  const { state, project, module } = fixture();
  const other = model.createModule(state, project.id, '精读');
  const descriptor = {
    kind: 'video', title: '第一课', canonicalKey: 'openlist:test:/英语/课程/第一章/01.mp4', sourceId: 's1',
    launcher: { type: 'openlist', sourceId: 's1', remotePath: '/英语/课程/第一章/01.mp4' },
    metadata: { remotePath: '/英语/课程/第一章/01.mp4', rootPath: '/英语/课程' }
  };
  const first = model.upsertResourceDescriptor(state, module.id, descriptor);
  model.linkResourceToModule(state, other.id, first.resource.id, { rootPath: '/英语/课程/第一章' });

  assert.equal(model.moduleResourceRoot(state, module.id, first.resource.id), '/英语/课程');
  assert.equal(model.moduleResourceRoot(state, other.id, first.resource.id), '/英语/课程/第一章');
  assert.equal(state.resources[first.resource.id].canonicalKey, descriptor.canonicalKey);
});

test('旧模块没有关联根时按模块内 OpenList 资源共同父目录即时兼容', () => {
  const raw = model.defaultState();
  raw.projects.p1 = { id: 'p1', title: '英语', moduleIds: ['m1'] };
  raw.resources.r1 = { id: 'r1', sourceId: 's1', launcher: { type: 'openlist', sourceId: 's1', remotePath: '/英语/课程/第一章/01.mp4' } };
  raw.resources.r2 = { id: 'r2', sourceId: 's1', launcher: { type: 'openlist', sourceId: 's1', remotePath: '/英语/课程/第一章/02.mp4' } };
  raw.modules.m1 = { id: 'm1', projectId: 'p1', title: '视频', resourceIds: ['r1', 'r2'] };

  const state = model.normalizeState(raw);

  assert.deepEqual(state.modules.m1.resourceRoots, {});
  assert.equal(model.moduleResourceRoot(state, 'm1', 'r1'), '/英语/课程/第一章');
  assert.equal(model.moduleResourceRoot(state, 'm1', 'r2'), '/英语/课程/第一章');
});

test('本地文件夹资源以所选导入目录为模块展示根而不是磁盘盘符', () => {
  const { state, module } = fixture();
  const descriptor = {
    kind: 'video', title: '第一课', canonicalKey: 'file:f:/教学/四级/课程/第一课.mp4', sourceId: 'local-1',
    launcher: { type: 'file', path: 'F:\\教学\\四级\\课程\\第一课.mp4' },
    metadata: { localPath: 'F:\\教学\\四级\\课程\\第一课.mp4', rootPath: 'F:\\教学\\四级' }
  };

  const resource = model.upsertResourceDescriptor(state, module.id, descriptor).resource;

  assert.equal(model.moduleResourceRoot(state, module.id, resource.id), 'F:/教学/四级');
  assert.equal(state.modules[module.id].resourceRoots[resource.id], 'F:/教学/四级');
  const restored = model.normalizeState(state);
  assert.equal(model.moduleResourceRoot(restored, module.id, resource.id), 'F:/教学/四级');
});

test('旧本地导入缺少模块展示根时回退到资源保存的导入根', () => {
  const raw = model.defaultState();
  raw.projects.p1 = { id: 'p1', title: '英语', moduleIds: ['m1'] };
  raw.resources.r1 = { id: 'r1', kind: 'video', launcher: { type: 'file', path: 'F:\\教学\\四级\\老师资料包\\01.mp4' }, metadata: { localPath: 'F:\\教学\\四级\\老师资料包\\01.mp4', rootPath: 'F:\\教学\\四级' } };
  raw.modules.m1 = { id: 'm1', projectId: 'p1', title: '四级', resourceIds: ['r1'] };

  const state = model.normalizeState(raw);

  assert.equal(model.moduleResourceRoot(state, 'm1', 'r1'), 'F:/教学/四级');
});

test('本地虚拟目录保留所选根文件夹名称并隐藏盘符和上级绝对路径', () => {
  const direct = { launcher: { type: 'file', path: 'F:\\教学\\28天CET4\\第一课.mp4' }, metadata: { localPath: 'F:\\教学\\28天CET4\\第一课.mp4' } };
  const nested = { launcher: { type: 'file', path: 'f:\\教学\\28天CET4\\老师资料包\\第二课.mp4' }, metadata: { localPath: 'f:\\教学\\28天CET4\\老师资料包\\第二课.mp4' } };
  const openList = { launcher: { type: 'openlist', remotePath: '/英语/A老师/第一课.mp4' }, metadata: { remotePath: '/英语/A老师/第一课.mp4' } };

  assert.equal(model.resourceFolderPath(direct, 'F:\\教学\\28天CET4'), '28天CET4');
  assert.equal(model.resourceFolderPath(nested, 'F:\\教学\\28天CET4'), '28天CET4/老师资料包');
  assert.equal(model.resourceFolderPath(openList, '/英语'), 'A老师');
});

test('重复导入已在模块中的 OpenList 资源不会被撤回误移除', () => {
  const { state, module } = fixture();
  const descriptor = {
    kind: 'video', title: '第一课', canonicalKey: 'openlist:test:/课程/01.mp4', sourceId: 's1',
    launcher: { type: 'openlist', sourceId: 's1', remotePath: '/课程/01.mp4' },
    metadata: { remotePath: '/课程/01.mp4', rootPath: '/课程' }
  };
  const first = model.upsertResourceDescriptor(state, module.id, descriptor);
  const repeated = model.upsertResourceDescriptor(state, module.id, descriptor);
  assert.equal(first.linked, true);
  assert.equal(repeated.linked, false);
  model.recordLastAction(state, {
    type: 'add-resources', moduleId: module.id,
    resourceIds: [first.resource.id], linkedResourceIds: [], createdResourceIds: []
  });

  model.undoLastAction(state);

  assert.deepEqual(state.modules[module.id].resourceIds, [first.resource.id]);
  assert.ok(state.resources[first.resource.id]);
});

test('学习模块可调整顺序并同步项目模块列表', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const first = model.createModule(state, project.id, '视频');
  const second = model.createModule(state, project.id, 'Anki');
  const third = model.createModule(state, project.id, '文档');
  model.moveModule(state, project.id, third.id, first.id);
  assert.deepEqual(model.projectModules(state, project.id).map((item) => item.title), ['文档', '视频', 'Anki']);
  assert.deepEqual(state.projects[project.id].moduleIds, [third.id, first.id, second.id]);
});

test('模块归档隐藏模块及相关计划并可完整恢复', () => {
  const { state, project, module } = fixture();
  const plan = model.createPlanForTarget(state, project.id, 'module', module.id, '每日课程').plan;
  model.archiveModule(state, module.id, new Date('2026-08-12T08:00:00Z'));
  assert.deepEqual(model.projectModules(state, project.id), []);
  assert.deepEqual(model.projectPlans(state, project.id), []);
  assert.equal(state.plans[plan.id].moduleArchivedBy, module.id);
  model.restoreModule(state, module.id, new Date('2026-08-12T09:00:00Z'));
  assert.deepEqual(model.projectModules(state, project.id).map((item) => item.id), [module.id]);
  assert.deepEqual(model.projectPlans(state, project.id).map((item) => item.id), [plan.id]);
  assert.equal(state.plans[plan.id].moduleArchivedBy, undefined);
});

test('模块归档保留布局锚点，永久删除清理并由撤回恢复', () => {
  const { state, project, module } = fixture();
  model.moveProjectBoardItem(state, project.id, `module:${module.id}`, 2, 6);
  const anchor = { ...model.ensureProjectBoardLayout(state, project.id).items[`module:${module.id}`] };

  model.archiveModule(state, module.id, new Date('2026-08-12T08:00:00Z'));
  assert.deepEqual(model.ensureProjectBoardLayout(state, project.id).items[`module:${module.id}`], anchor);
  assert.equal(model.projectBoardItems(state, project.id).some((item) => item.key === `module:${module.id}`), false);
  assert.equal(model.projectBoardItems(state, project.id, { includeArchived: true }).some((item) => item.key === `module:${module.id}`), true);
  model.restoreModule(state, module.id, new Date('2026-08-12T09:00:00Z'));
  assert.deepEqual(model.ensureProjectBoardLayout(state, project.id).items[`module:${module.id}`], anchor);

  model.deleteModule(state, module.id, new Date('2026-08-12T10:00:00Z'));
  assert.equal(model.ensureProjectBoardLayout(state, project.id).items[`module:${module.id}`], undefined);
  const undone = model.undoLastAction(state);
  assert.equal(undone.undone, true);
  assert.deepEqual(model.ensureProjectBoardLayout(state, project.id).items[`module:${module.id}`], anchor);
});

test('撤回模块删除会恢复旧锚点并让删除后新增模块保留在首个其他空格', () => {
  const { state, project, module } = fixture();
  const originalKey = `module:${module.id}`;
  const originalAnchor = { ...model.ensureProjectBoardLayout(state, project.id).items[originalKey] };

  model.deleteModule(state, module.id);
  const added = model.createModule(state, project.id, '删除后新增');
  assert.deepEqual(model.ensureProjectBoardLayout(state, project.id).items[`module:${added.id}`], originalAnchor);

  const undone = model.undoLastAction(state);
  assert.equal(undone.undone, true);
  const layout = model.ensureProjectBoardLayout(state, project.id);
  assert.deepEqual(layout.items[originalKey], originalAnchor);
  assert.deepEqual(layout.items[`module:${added.id}`], { column: 2, row: 1 });
});

test('永久删除模块只解除资源关联、删除相关计划并可撤回', () => {
  const { state, project, module } = fixture();
  const resource = model.addResource(state, module.id, 'https://example.com/course').resource;
  const plan = model.createPlanForTarget(state, project.id, 'module', module.id, '每日课程').plan;
  const result = model.deleteModule(state, module.id, new Date('2026-08-12T08:00:00Z'));
  assert.equal(result.removedPlanCount, 1);
  assert.equal(result.detachedResourceCount, 1);
  assert.equal(state.modules[module.id], undefined);
  assert.equal(state.plans[plan.id], undefined);
  assert.ok(state.resources[resource.id]);
  assert.equal(state.resources[resource.id].completedAt, '');
  assert.equal(state.uiState.lastAction.type, 'delete-module');
  const undone = model.undoLastAction(state);
  assert.equal(undone.undone, true);
  assert.equal(undone.restoredModuleCount, 1);
  assert.equal(undone.restoredPlanCount, 1);
  assert.deepEqual(state.modules[module.id].resourceIds, [resource.id]);
  assert.ok(state.plans[plan.id]);
  assert.ok(state.resources[resource.id]);
});

test('撤回模块删除遇到同 ID 模块时不覆盖新状态', () => {
  const { state, module } = fixture();
  model.deleteModule(state, module.id);
  state.modules[module.id] = { id: module.id, projectId: module.projectId, title: '冲突模块', resourceIds: [] };
  const result = model.undoLastAction(state);
  assert.equal(result.undone, false);
  assert.equal(result.reason, 'restore-conflict');
  assert.equal(state.modules[module.id].title, '冲突模块');
  assert.equal(state.uiState.lastAction, null);
});

test('永久删除模块后撤回会恢复 OpenList 模块级展示根', () => {
  const { state, module } = fixture();
  const descriptor = {
    kind: 'video', title: '第一课', canonicalKey: 'openlist:test:/课程/章节/01.mp4', sourceId: 's1',
    launcher: { type: 'openlist', sourceId: 's1', remotePath: '/课程/章节/01.mp4' },
    metadata: { remotePath: '/课程/章节/01.mp4', rootPath: '/课程/章节' }
  };
  const resource = model.upsertResourceDescriptor(state, module.id, descriptor).resource;
  model.deleteModule(state, module.id);

  model.undoLastAction(state);

  assert.equal(model.moduleResourceRoot(state, module.id, resource.id), '/课程/章节');
  assert.equal(state.modules[module.id].resourceRoots[resource.id], '/课程/章节');
});

test('撤回添加会移除模块关联并只清理本次新建的孤立资源', () => {
  const { state, module } = fixture();
  const created = model.addResource(state, module.id, 'https://example.com/new');
  const existing = model.addInboxResource(state, 'https://example.com/existing');
  model.linkResourceToModule(state, module.id, existing.resource.id);
  model.recordLastAction(state, {
    type: 'add-resources', moduleId: module.id,
    resourceIds: [created.resource.id, existing.resource.id],
    createdResourceIds: [created.resource.id], label: '错误导入'
  });
  const result = model.undoLastAction(state);
  assert.equal(result.undone, true);
  assert.equal(state.resources[created.resource.id], undefined);
  assert.ok(state.resources[existing.resource.id]);
  assert.deepEqual(module.resourceIds, []);
  assert.equal(state.uiState.lastAction, null);
});

test('撤回从收件箱加入模块会把资源放回收件箱', () => {
  const { state, module } = fixture();
  const { resource } = model.addInboxResource(state, 'https://example.com/later');
  model.linkResourceToModule(state, module.id, resource.id);
  model.recordLastAction(state, { type: 'add-resources', moduleId: module.id, resourceIds: [resource.id], createdResourceIds: [], restoreInboxIds: [resource.id], label: '从收件箱加入' });
  model.undoLastAction(state);
  assert.deepEqual(module.resourceIds, []);
  assert.deepEqual(state.inbox, [resource.id]);
});

test('带空模块关联列表的收件箱导入仍可正常撤回', () => {
  const state = model.defaultState();
  const { resource } = model.addInboxResource(state, 'https://example.com/inbox-only');
  model.recordLastAction(state, {
    type: 'add-resources', inbox: true, resourceIds: [resource.id], linkedResourceIds: [], createdResourceIds: [resource.id]
  });

  const result = model.undoLastAction(state);

  assert.deepEqual(state.inbox, []);
  assert.deepEqual(result.removedResourceIds, [resource.id]);
  assert.equal(state.resources[resource.id], undefined);
});

test('撤回收件箱批量导入只移除本次真正加入的资源', () => {
  const state = model.defaultState();
  const existing = model.addInboxResource(state, 'https://example.com/existing');
  const reused = model.addInboxResource(state, 'https://example.com/existing');
  const created = model.addInboxResource(state, 'https://example.com/new');
  assert.equal(reused.inboxAdded, false);
  assert.equal(created.inboxAdded, true);
  model.recordLastAction(state, {
    type: 'add-resources', inbox: true,
    resourceIds: [existing.resource.id, created.resource.id],
    inboxAddedResourceIds: [created.resource.id],
    createdResourceIds: [created.resource.id]
  });

  model.undoLastAction(state);

  assert.deepEqual(state.inbox, [existing.resource.id]);
  assert.ok(state.resources[existing.resource.id]);
  assert.equal(state.resources[created.resource.id], undefined);
});

test('永久删除项目保留显式清理孤立资源的旧行为', () => {
  const { state, project, module } = fixture();
  const { resource } = model.addResource(state, module.id, 'https://example.com/only-here');
  const result = model.deleteProject(state, project.id, { deleteOrphans: true });
  assert.deepEqual(result.removedResourceIds, [resource.id]);
  assert.equal(state.resources[resource.id], undefined);
});

test('永久删除项目清理 Vault 引用、便签和折叠键，不影响跨项目引用或资源', () => {
  const { state, project, module } = fixture();
  const otherProject = model.createProject(state, '写作');
  const resource = model.addResource(state, module.id, 'https://example.com/course').resource;
  const shared = model.upsertVaultRef(state, { path: '学习/共用.md', entryType: 'file' }).vaultRef;
  const exclusive = model.upsertVaultRef(state, { path: '学习/英语.canvas', entryType: 'file' }).vaultRef;
  model.linkVaultRefToProject(state, project.id, shared.id);
  model.linkVaultRefToProject(state, project.id, exclusive.id);
  model.linkVaultRefToProject(state, otherProject.id, shared.id);
  model.setProjectMemo(state, project.id, '稍后整理');
  model.setProjectPanelCollapsed(state, project.id, 'files', true);
  model.ensureProjectBoardLayout(state, project.id);

  model.deleteProject(state, project.id);

  assert.equal(state.projects[project.id], undefined);
  assert.equal(state.uiState.projectPanelCollapsedByProject[project.id], undefined);
  assert.equal(state.uiState.projectBoardLayouts[project.id], undefined);
  assert.ok(state.vaultRefs[shared.id]);
  assert.equal(state.vaultRefs[exclusive.id], undefined);
  assert.deepEqual(otherProject.vaultRefIds, [shared.id]);
  assert.ok(state.resources[resource.id]);
});

test('清理预览保留最近打开和已完成资源，只删除真正未利用的索引', () => {
  const { state, module } = fixture();
  const unused = model.addResource(state, module.id, 'https://example.com/unused').resource;
  const opened = model.addResource(state, module.id, 'https://example.com/opened').resource;
  const completed = model.addResource(state, module.id, 'https://example.com/completed').resource;
  module.resourceIds = [];
  model.markResourceOpened(state, opened.id, new Date('2026-08-11T08:00:00Z'));
  completed.completedAt = '2026-08-10T00:00:00Z';

  const preview = model.orphanCleanupPreview(state);
  assert.equal(preview.totalActive, 3);
  assert.equal(preview.candidateCount, 1);
  assert.equal(preview.retainedCount, 2);
  assert.deepEqual(preview.candidates.map((resource) => resource.id), [unused.id]);
  assert.deepEqual(model.deleteOrphanResources(state), [unused.id]);
  assert.ok(state.resources[opened.id]);
  assert.ok(state.resources[completed.id]);
});

test('资源选择索引按 OpenList 课程根目录聚合并预计算搜索文本', () => {
  const sources = {
    source1: { id: 'source1', type: 'openlist', alias: '网盘课程' }
  };
  const resources = [
    {
      id: 'r1', kind: 'video', title: '第一课', sourceId: 'source1',
      launcher: { type: 'openlist', sourceId: 'source1', remotePath: '/夸克网盘/英语课/第一章/01.mp4' }
    },
    {
      id: 'r2', kind: 'video', title: '第二课', sourceId: 'source1',
      launcher: { type: 'openlist', sourceId: 'source1', remotePath: '/夸克网盘/英语课/第二章/02.mp4' }
    }
  ];
  const index = model.buildResourcePickerIndex(resources, sources);
  assert.equal(index.groups.length, 1);
  assert.equal(index.groups[0].label, '英语课');
  assert.equal(index.groups[0].resources.length, 2);
  assert.match(index.entries[0].searchText, /第一课/);
  assert.match(index.entries[0].searchText, /openlist/);
});

function resourceGroupFixture() {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const firstModule = model.createModule(state, project.id, '第一模块');
  const secondModule = model.createModule(state, project.id, '第二模块');
  const first = model.addResource(state, firstModule.id, 'https://example.com/lesson-1', '第一课').resource;
  const second = model.addResource(state, firstModule.id, 'https://example.com/lesson-2', '第二课').resource;
  model.linkResourceToModule(state, secondModule.id, first.id);
  return { state, project, firstModule, secondModule, first, second };
}

test('默认状态和旧状态归一化补空分组集合但不创建虚假分组', () => {
  const clean = model.defaultState();
  assert.deepEqual(clean.resourceGroups, {});
  assert.deepEqual(clean.uiState.collapsedResourceGroupsByModule, {});

  const state = model.normalizeState({
    schemaVersion: 1,
    projects: { p1: { id: 'p1', title: '旧项目', moduleIds: ['m1'] } },
    modules: { m1: { id: 'm1', projectId: 'p1', title: '旧模块', resourceIds: ['r1'], resourceGroupIds: ['ghost'] } },
    resources: { r1: { id: 'r1', title: '旧资源', completedAt: '' } },
    resourceGroups: { ghost: { id: 'ghost', moduleId: 'missing', title: '不应出现', resourceIds: ['r1'] } },
    uiState: { collapsedResourceGroupsByModule: { m1: { ghost: true }, missing: { ghost: true } } }
  });

  assert.deepEqual(state.resourceGroups, {});
  assert.deepEqual(state.modules.m1.resourceGroupIds, []);
  assert.deepEqual(state.uiState.collapsedResourceGroupsByModule, {});
  assert.deepEqual(model.normalizeState(state), state);
});

test('资源分组 CRUD、顺序和成员关系保持模块边界及单组唯一', () => {
  const { state, firstModule, secondModule, first, second } = resourceGroupFixture();
  const firstGroup = model.createResourceGroup(state, firstModule.id, '第一组', [first.id]);
  const secondGroup = model.createResourceGroup(state, firstModule.id, '第二组');
  const otherGroup = model.createResourceGroup(state, secondModule.id, '另一模块');

  assert.deepEqual(model.moduleResourceGroups(state, firstModule.id).map((group) => group.id), [firstGroup.id, secondGroup.id]);
  assert.deepEqual(firstGroup.resourceIds, [first.id]);
  assert.deepEqual(model.renameResourceGroup(state, firstGroup.id, '第一组·已改').title, '第一组·已改');

  model.moveResourceToGroup(state, firstModule.id, first.id, secondGroup.id);
  model.moveResourceToGroup(state, firstModule.id, first.id, secondGroup.id);
  assert.deepEqual(firstGroup.resourceIds, []);
  assert.deepEqual(secondGroup.resourceIds, [first.id]);
  assert.deepEqual(model.moveResourceToGroup(state, firstModule.id, first.id, '').resourceIds, [first.id]);
  assert.deepEqual(secondGroup.resourceIds, []);

  model.moveResourceToGroup(state, firstModule.id, first.id, firstGroup.id);
  model.moveResourceToGroup(state, secondModule.id, first.id, otherGroup.id);
  assert.deepEqual(firstGroup.resourceIds, [first.id]);
  assert.deepEqual(otherGroup.resourceIds, [first.id]);
  assert.deepEqual(firstModule.resourceIds, [first.id, second.id]);
  assert.deepEqual(secondModule.resourceIds, [first.id]);

  const reordered = model.moveResourceGroup(state, firstModule.id, secondGroup.id, firstGroup.id);
  assert.deepEqual(reordered.map((group) => group.id), [secondGroup.id, firstGroup.id]);
  assert.deepEqual(firstModule.resourceGroupIds, [secondGroup.id, firstGroup.id]);
});

test('删除分组只解除成员关系，不删除模块资源或全局 Resource', () => {
  const { state, firstModule, first, second } = resourceGroupFixture();
  const group = model.createResourceGroup(state, firstModule.id, '待删除', [first.id, second.id]);
  const at = new Date('2026-08-13T08:00:00.000Z');

  const result = model.deleteResourceGroup(state, group.id, at);

  assert.deepEqual(result.ungroupedResourceIds, [first.id, second.id]);
  assert.equal(result.group.id, group.id);
  assert.equal(state.resourceGroups[group.id], undefined);
  assert.deepEqual(firstModule.resourceGroupIds, []);
  assert.deepEqual(firstModule.resourceIds, [first.id, second.id]);
  assert.ok(state.resources[first.id]);
  assert.ok(state.resources[second.id]);
});

test('资源分组完成进度由当前有效资源实时派生', () => {
  const { state, firstModule, first, second } = resourceGroupFixture();
  const group = model.createResourceGroup(state, firstModule.id, '进度组', [first.id, second.id]);

  assert.deepEqual(model.resourceGroupProgress(state, group.id), { total: 2, completed: 0, done: false });
  model.markResourceComplete(state, first.id, new Date('2026-08-13T09:00:00.000Z'));
  assert.deepEqual(model.resourceGroupProgress(state, group.id), { total: 2, completed: 1, done: false });
  model.markResourceComplete(state, second.id, new Date('2026-08-13T09:01:00.000Z'));
  assert.deepEqual(model.resourceGroupProgress(state, group.id), { total: 2, completed: 2, done: true });
  model.toggleResourceComplete(state, first.id, new Date('2026-08-13T09:02:00.000Z'));
  assert.deepEqual(model.resourceGroupProgress(state, group.id), { total: 2, completed: 1, done: false });
});

test('资源分组折叠状态按模块和分组隔离并可归一化保留', () => {
  const { state, firstModule, secondModule } = resourceGroupFixture();
  const firstGroup = model.createResourceGroup(state, firstModule.id, '第一模块分组');
  const secondGroup = model.createResourceGroup(state, secondModule.id, '第二模块分组');

  assert.equal(model.setResourceGroupCollapsed(state, firstModule.id, firstGroup.id, true), true);
  assert.equal(model.setResourceGroupCollapsed(state, secondModule.id, secondGroup.id, false), false);
  assert.deepEqual(state.uiState.collapsedResourceGroupsByModule, {
    [firstModule.id]: { [firstGroup.id]: true },
    [secondModule.id]: { [secondGroup.id]: false }
  });

  const restored = model.normalizeState(state);
  assert.deepEqual(restored.uiState.collapsedResourceGroupsByModule, state.uiState.collapsedResourceGroupsByModule);
  assert.equal(restored.uiState.collapsedResourceGroupsByModule[firstModule.id][secondGroup.id], undefined);
});

test('删除模块会删除所属分组和折叠状态，撤回后完整恢复', () => {
  const { state, project, firstModule, first, second } = resourceGroupFixture();
  const firstGroup = model.createResourceGroup(state, firstModule.id, '第一组', [first.id]);
  const secondGroup = model.createResourceGroup(state, firstModule.id, '第二组', [second.id]);
  model.setResourceGroupCollapsed(state, firstModule.id, firstGroup.id, true);
  model.setResourceGroupCollapsed(state, firstModule.id, secondGroup.id, false);
  const before = {
    groupIds: [firstGroup.id, secondGroup.id],
    groupResources: [firstGroup.resourceIds.slice(), secondGroup.resourceIds.slice()],
    collapsed: { ...state.uiState.collapsedResourceGroupsByModule[firstModule.id] }
  };

  const removed = model.deleteModule(state, firstModule.id, new Date('2026-08-13T10:00:00.000Z'));
  assert.equal(removed.removedResourceGroupCount, 2);
  assert.equal(state.modules[firstModule.id], undefined);
  assert.equal(state.resourceGroups[firstGroup.id], undefined);
  assert.equal(state.resourceGroups[secondGroup.id], undefined);
  assert.equal(state.uiState.collapsedResourceGroupsByModule[firstModule.id], undefined);
  assert.ok(state.resources[first.id]);
  assert.ok(state.resources[second.id]);

  const undone = model.undoLastAction(state);
  assert.equal(undone.undone, true);
  assert.ok(state.modules[firstModule.id]);
  assert.deepEqual(state.modules[firstModule.id].resourceGroupIds, before.groupIds);
  assert.deepEqual(state.resourceGroups[firstGroup.id].resourceIds, before.groupResources[0]);
  assert.deepEqual(state.resourceGroups[secondGroup.id].resourceIds, before.groupResources[1]);
  assert.deepEqual(state.uiState.collapsedResourceGroupsByModule[firstModule.id], before.collapsed);
  assert.equal(state.projects[project.id].moduleIds.includes(firstModule.id), true);
});

test('从模块解除资源会同步清理展示根和分组成员但保留全局资源', () => {
  const { state, firstModule, first, second } = resourceGroupFixture();
  const group = model.createResourceGroup(state, firstModule.id, '课程', [first.id, second.id]);
  firstModule.resourceRoots[first.id] = '/课程';

  model.removeResourcesFromModule(state, firstModule.id, [first.id]);

  assert.deepEqual(firstModule.resourceIds, [second.id]);
  assert.deepEqual(group.resourceIds, [second.id]);
  assert.equal(firstModule.resourceRoots[first.id], undefined);
  assert.ok(state.resources[first.id]);
});

test('永久删除项目会同步清理所属模块的资源分组和折叠状态', () => {
  const { state, project, firstModule, first } = resourceGroupFixture();
  const group = model.createResourceGroup(state, firstModule.id, '课程', [first.id]);
  model.setResourceGroupCollapsed(state, firstModule.id, group.id, true);

  model.deleteProject(state, project.id);

  assert.equal(state.resourceGroups[group.id], undefined);
  assert.equal(state.uiState.collapsedResourceGroupsByModule[firstModule.id], undefined);
  assert.ok(state.resources[first.id]);
});

test('归一化重复分组成员时以模块分组顺序为准且保持幂等', () => {
  const raw = model.defaultState();
  raw.projects.p1 = { id: 'p1', title: '项目', moduleIds: ['m1'] };
  raw.resources.r1 = { id: 'r1', title: '第一课', completedAt: '' };
  raw.modules.m1 = { id: 'm1', projectId: 'p1', title: '模块', resourceIds: ['r1'], resourceGroupIds: ['g2', 'g1'] };
  raw.resourceGroups.g1 = { id: 'g1', moduleId: 'm1', title: '第一组', resourceIds: ['r1'], sortOrder: 0 };
  raw.resourceGroups.g2 = { id: 'g2', moduleId: 'm1', title: '第二组', resourceIds: ['r1'], sortOrder: 1 };

  const state = model.normalizeState(raw);

  assert.deepEqual(state.modules.m1.resourceGroupIds, ['g2', 'g1']);
  assert.deepEqual(state.resourceGroups.g2.resourceIds, ['r1']);
  assert.deepEqual(state.resourceGroups.g1.resourceIds, []);
  assert.deepEqual(model.normalizeState(state), state);
});

test('B站多P自动分组默认阈值和中文组名稳定', () => {
  assert.equal(model.defaultResourceAutoGroupEnabled(0), false);
  assert.equal(model.defaultResourceAutoGroupEnabled(20), false);
  assert.equal(model.defaultResourceAutoGroupEnabled(21), true);
  assert.equal(model.resourceGroupTitle(1), '第一组');
  assert.equal(model.resourceGroupTitle(2), '第二组');
});

test('B站164P按原始顺序每20条自动分成9组', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, 'B站课程');
  const orderedResourceIds = Array.from({ length: 164 }, (_, index) => model.addResource(
    state,
    module.id,
    `https://example.com/bili-part-${index + 1}`,
    `P${index + 1}`
  ).resource.id);
  const at = new Date('2026-08-13T12:00:00.000Z');

  const result = model.autoGroupResources(state, module.id, orderedResourceIds, {
    size: 20,
    key: 'bili:BV1TEST164',
    at
  });

  assert.equal(result.groups.length, 9);
  assert.deepEqual(result.groups.map((group) => group.title), [
    '第一组', '第二组', '第三组', '第四组', '第五组',
    '第六组', '第七组', '第八组', '第九组'
  ]);
  assert.deepEqual(result.groups.map((group) => group.resourceIds.length), [20, 20, 20, 20, 20, 20, 20, 20, 4]);
  assert.deepEqual(result.groups.flatMap((group) => group.resourceIds), orderedResourceIds);
  assert.deepEqual(result.skippedResourceIds, []);
});

test('B站自动分组重复执行幂等且保留原组身份与顺序', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, 'B站课程');
  const orderedResourceIds = Array.from({ length: 41 }, (_, index) => model.addResource(
    state,
    module.id,
    `https://example.com/bili-idempotent-${index + 1}`
  ).resource.id);
  const options = { size: 20, key: 'bili:BV1IDEMPOTENT', at: new Date('2026-08-13T12:10:00.000Z') };

  const first = model.autoGroupResources(state, module.id, orderedResourceIds, options);
  const firstGroupSnapshot = first.groups.map((group) => ({
    id: group.id,
    title: group.title,
    resourceIds: [...group.resourceIds],
    autoGroupKey: group.autoGroupKey,
    autoGroupIndex: group.autoGroupIndex,
    autoGroupSize: group.autoGroupSize
  }));
  const second = model.autoGroupResources(state, module.id, orderedResourceIds, options);

  assert.deepEqual(second.groups.map((group) => group.id), first.groups.map((group) => group.id));
  assert.deepEqual(second.groups.map((group) => ({
    id: group.id,
    title: group.title,
    resourceIds: [...group.resourceIds],
    autoGroupKey: group.autoGroupKey,
    autoGroupIndex: group.autoGroupIndex,
    autoGroupSize: group.autoGroupSize
  })), firstGroupSnapshot);
  assert.equal(model.moduleResourceGroups(state, module.id).length, 3);
});

test('B站重复导入自动分组不会覆盖用户手动分组', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, 'B站课程');
  const orderedResourceIds = Array.from({ length: 24 }, (_, index) => model.addResource(
    state,
    module.id,
    `https://example.com/bili-manual-${index + 1}`
  ).resource.id);
  const options = { size: 20, key: 'bili:BV1MANUAL', at: new Date('2026-08-13T12:20:00.000Z') };
  const first = model.autoGroupResources(state, module.id, orderedResourceIds, options);
  const manual = model.createResourceGroup(state, module.id, '我的重点', [], options.at);
  model.moveResourceToGroup(state, module.id, orderedResourceIds[0], manual.id, options.at);

  const second = model.autoGroupResources(state, module.id, orderedResourceIds, options);

  assert.deepEqual(manual.resourceIds, [orderedResourceIds[0]]);
  assert.equal(first.groups[0].resourceIds.includes(orderedResourceIds[0]), false);
  assert.equal(second.groups.length, 2);
  assert.deepEqual(second.groups.map((group) => group.id), first.groups.map((group) => group.id));
  assert.deepEqual(first.groups[0].resourceIds, orderedResourceIds.slice(1, 20));
  assert.deepEqual(second.groups[0].resourceIds, orderedResourceIds.slice(1, 20));
  assert.equal(model.moduleResourceGroups(state, module.id).length, 3);
});

test('撤回自动导入会清理已变为空组的自动分组', () => {
  const state = model.defaultState();
  const project = model.createProject(state, '英语');
  const module = model.createModule(state, project.id, 'B站课程');
  const added = Array.from({ length: 21 }, (_, index) => model.addResource(
    state,
    module.id,
    `https://example.com/bili-undo-${index + 1}`
  ).resource);
  const at = new Date('2026-08-13T12:30:00.000Z');
  const grouped = model.autoGroupResources(state, module.id, added.map((resource) => resource.id), {
    size: 20,
    key: 'bili:BV1UNDO',
    at
  });
  assert.deepEqual(grouped.createdGroupIds, grouped.groups.map((group) => group.id));
  model.recordLastAction(state, {
    type: 'add-resources',
    moduleId: module.id,
    inbox: false,
    resourceIds: added.map((resource) => resource.id),
    linkedResourceIds: added.map((resource) => resource.id),
    createdResourceIds: added.map((resource) => resource.id),
    createdResourceGroupIds: grouped.createdGroupIds,
    label: '导入 B站分P并自动分组'
  });

  const result = model.undoLastAction(state);

  assert.equal(result.undone, true);
  assert.deepEqual(module.resourceIds, []);
  assert.deepEqual(model.moduleResourceGroups(state, module.id), []);
  assert.deepEqual(grouped.groups.map((group) => state.resourceGroups[group.id]), [undefined, undefined]);
  assert.deepEqual(added.map((resource) => state.resources[resource.id]), Array(added.length).fill(undefined));
});

test('撤回文件夹自动整理只恢复对应批次分组且保留资源路径', () => {
  const { state, firstModule } = resourceGroupFixture();
  const resources = Array.from({ length: 41 }, (_, index) => model.addResource(state, firstModule.id, `C:\\课程\\章节一\\${index + 1}.mp4`).resource);
  const autoGroupKey = `module:${firstModule.id}:folder:章节一`;
  const beforeOrder = [...firstModule.resourceGroupIds];
  const grouped = model.autoGroupResources(state, firstModule.id, resources.map((resource) => resource.id), { size: 20, key: autoGroupKey, scopePath: '英语/章节一' });
  assert.equal(grouped.groups.every((group) => group.scopePath === '英语/章节一'), true);
  model.recordLastAction(state, { type: 'auto-group-resources', moduleId: firstModule.id, autoGroupKey, resourceGroupSnapshotsBefore: [], moduleResourceGroupIdsBefore: beforeOrder, collapsedBefore: {}, autoGroupIdsAfter: grouped.groups.map((group) => group.id), label: '整理文件夹：章节一' });

  const undone = model.undoLastAction(state);

  assert.equal(undone.undone, true);
  assert.deepEqual(model.moduleResourceGroups(state, firstModule.id), []);
  assert.equal(firstModule.resourceIds.length, 43);
  assert.equal(resources.every((resource) => state.resources[resource.id]?.launcher?.path.includes('章节一')), true);
});

test('旧文件夹自动组可从稳定批次身份恢复挂载路径', () => {
  const raw = model.defaultState();
  raw.projects.p1 = { id: 'p1', title: '英语', moduleIds: ['m1'] };
  raw.resources.r1 = { id: 'r1', title: '第一课' };
  raw.modules.m1 = { id: 'm1', projectId: 'p1', title: '课程', resourceIds: ['r1'], resourceGroupIds: ['g1'] };
  raw.resourceGroups.g1 = { id: 'g1', moduleId: 'm1', title: '第一组', resourceIds: ['r1'], autoGroupKey: 'module:m1:folder:英语/A老师英语', autoGroupIndex: 1 };

  const state = model.normalizeState(raw);

  assert.equal(state.resourceGroups.g1.scopePath, '英语/A老师英语');
  assert.deepEqual(model.normalizeState(state), state);
});
