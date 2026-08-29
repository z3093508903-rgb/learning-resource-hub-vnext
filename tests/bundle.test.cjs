'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('manifest uses permanent Go Study identity and keeps desktop-only boundary', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.id, 'go-study');
  assert.equal(manifest.name, 'Go Study');
  assert.equal(manifest.version, '0.3.0');
  assert.equal(manifest.isDesktopOnly, true);
});

test('构建结果内联模型且不依赖源码目录', () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe' });
  const output = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(output, /class ResourceHubNextPlugin extends Plugin/);
  assert.match(output, /function defaultState\(\)/);
  assert.doesNotMatch(output, /require\('\.\/model\.cjs'\)/);
});

test('新版本不扫描旧插件数据或项目 Markdown 块，但允许保护当前插件 data.json', () => {
  const files = ['src/main.cjs', 'src/model.cjs', 'src/state-safety.cjs', 'styles.css'];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /resource-hub:block/);
  assert.doesNotMatch(source, /\.obsidian[\\/]+plugins[\\/]+learning-resource-hub(?:[^-]|$)/);
  assert.match(source, /go-study-recovery/);
  assert.match(source, /data\.json/);
});

test('添加链路不再调用 Obsidian 不支持的原生 prompt', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.doesNotMatch(source, /window\.prompt\s*\(/);
});

test('订阅是工作台一级入口并复用 UP 微型主页', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.match(source, /\['subscriptions', '订阅', 'rss'\]/);
  assert.match(source, /renderSubscriptions\(main\)/);
  assert.match(source, /renderBiliHome\(main, creators\)/);
});

test('添加订阅支持按名称搜索UP并返回订阅页', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'main.cjs'), 'utf8');
  assert.match(source, /searchBiliUsers\(keyword\)/);
  assert.match(source, /search_type=bili_user/);
  assert.match(source, /找到 \$\{searchResults\.length\} 个UP/);
  assert.match(source, /navigate\?\.\('subscriptions'\)/);
});

test('B站请求被 Electron 客户端拦截时使用 Node HTTPS 备用通道', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'main.cjs'), 'utf8');
  assert.match(source, /ERR_BLOCKED_BY_CLIENT/);
  assert.match(source, /requestBiliDataViaNode/);
  assert.match(source, /require\('node:https'\)/);
});

test('构建产物包含永久删除、OpenList 目录扫描和 PotPlayer 启动链路', () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe' });
  const output = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(output, /永久删除项目/);
  assert.match(output, /api\/fs\/list/);
  assert.match(output, /x\/web-interface\/view/);
  assert.match(output, /native-potplayer-cli/);
  assert.match(output, /launchPotPlayerTarget/);
  assert.doesNotMatch(output, /return `jv:\/\/open\?path=/);
  assert.match(output, /launcher\.type === 'potplayer'/);
  assert.match(output, /legacyBili/);
  assert.match(output, /旧版 OpenList 目录条目/);
});

test('工作台使用单例标签页并包含撤回、解析详情和按需资源分组', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.match(source, /getLeaf\('tab'\)/);
  assert.match(source, /undoLastAction/);
  assert.match(source, /导入整个合集/);
  assert.match(source, /rh-next-preview-panel/);
  assert.match(source, /rh-next-picker-group/);
  assert.match(source, /resourceRenderLimit = 80/);
});

test('alpha.9 来源保存与正式导入保持分离', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const openListSource = source.slice(source.indexOf('renderOpenListSource(parent)'), source.indexOf('renderAnkiSource(parent)'));
  const biliSource = source.slice(source.indexOf('renderBilibiliSource(parent)'), source.indexOf('renderEmptyState(parent'));
  assert.match(openListSource, /连接已保存；没有扫描或创建资源/);
  assert.doesNotMatch(openListSource, /scanOpenList\(/);
  assert.match(source, /class OpenListBrowserModal extends Modal/);
  assert.match(source, /class OpenListImportPreviewModal extends Modal/);
  assert.doesNotMatch(biliSource, /resolveModule\(/);
  assert.doesNotMatch(biliSource, /addResource\(/);
});

test('alpha.9 统一启动成功后记录最近使用并默认完成资源', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const action = source.slice(source.indexOf('async markResourceStarted(resource)'), source.indexOf('async openResource(resource)'));
  assert.match(action, /markResourceOpened\(state, resource\.id\)/);
  assert.match(action, /markResourceComplete\(state, resource\.id\)/);
  assert.match(action, /await this\.markResourceStarted\(resource\)/);
  assert.match(action, /已启动并默认完成/);
});

test('alpha.9 OpenList 浏览按当前层缓存并在确认后才写入资源', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const browser = source.slice(source.indexOf('class OpenListBrowserModal extends Modal'), source.indexOf('class BiliCollectionModal extends Modal'));
  assert.match(browser, /this\.plugin\.listOpenList\(this\.source, this\.currentPath/);
  assert.match(browser, /this\.cache\.set\(key, this\.entries\)/);
  assert.match(browser, /isCancelled: \(\) => this\.cancelScan/);
  assert.match(browser, /new OpenListImportPreviewModal/);
  assert.doesNotMatch(browser, /upsertResourceDescriptor\(/);
  assert.doesNotMatch(browser, /upsertInboxDescriptor\(/);
});

test('OpenList 导入预览使用本次勾选内容的共同根目录', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const browser = source.slice(source.indexOf('class OpenListBrowserModal extends Modal'), source.indexOf('class BiliCollectionModal extends Modal'));
  assert.match(browser, /model\.openListImportRoot\(selectedEntries\)/);
  assert.match(browser, /rootPath: importRootPath/);
  assert.doesNotMatch(browser, /rootPath: this\.rootPath/);
  assert.match(browser, /onSuccess: \(\) => \{ for \(const entry of selectedEntries\) this\.selected\.delete\(entry\.remotePath\)/);
});

test('模块抽屉和所有现有资源入口使用模块级关联根', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.match(source, /model\.moduleResourceRoot\(this\.plugin\.state, moduleId, resource\.id\)/);
  const picker = source.slice(source.indexOf('renderExisting(parent, projectId'), source.indexOf('renderPlanPicker(parent, projectId'));
  assert.match(picker, /model\.linkResourcesToModule\(this\.plugin\.state, moduleId, addedIds\)/);
  assert.doesNotMatch(picker, /module\.resourceIds\s*=/);
});

test('alpha.10 项目文件使用 Vault 引用而不提供真实文件删除链路', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.match(source, /link-current-file-to-project/);
  assert.match(source, /open-project-for-current-file/);
  assert.match(source, /workspace\.on\('file-menu'/);
  assert.match(source, /class VaultEntryPickerModal extends Modal/);
  assert.match(source, /class VaultFolderBrowserModal extends Modal/);
  assert.match(source, /this\.app\.vault\.create\(candidate, content\)/);
  assert.doesNotMatch(source, /(?:app|this\.app)\.vault\.(?:delete|trash|modify)\s*\(/);
});

test('alpha.12 项目文件选择支持多选并在统一确认后批量关联', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const picker = source.slice(source.indexOf('class VaultEntryPickerModal extends Modal'), source.indexOf('class VaultFolderPickerModal extends Modal'));
  assert.match(source, /multiple: true/);
  assert.match(source, /onChooseMany: \(entries\) => this\.linkVaultEntries/);
  assert.doesNotMatch(source, /onChooseMany: \(entries\) => void this\.linkVaultEntries/);
  assert.match(source, /async linkVaultEntries\(projectId, entries\)/);
  assert.match(source, /model\.linkVaultEntriesToProject/);
  assert.match(picker, /type: 'checkbox'/);
  assert.match(picker, /关联所选/);
  assert.match(picker, /await this\.options\.onChooseMany\?\.\(chosen\)/);
  assert.match(styles, /\.rh-next-vault-picker-actions/);
});

test('alpha.12 学习主区恢复背景层级且待办不再显示重复解释', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styles, /\.rh-next-project-layout::before/);
  assert.match(styles, /width: calc\(75% - 3px\)/);
  assert.match(styles, /\.rh-next-page\.rh-next-project-page \{ padding-top: clamp\(14px, 1\.6vw, 22px\); \}/);
  assert.match(styles, /\.rh-next-project-heading \.rh-next-section-actions \{ margin-left: auto; \}/);
  assert.doesNotMatch(source, /该任务引用项目中的现有内容，不复制资源。/);
});

test('alpha.12 项目页 DOM 在窄窗口保持全部学习模块先于三个辅助组件', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const project = source.slice(source.indexOf('renderProject(main, projects)'), source.indexOf('renderProjectUtilities(parent, project, boardItemByKey, mediumOrder)'));
  assert.ok(project.indexOf('for (const module of modules)') < project.indexOf('this.renderProjectUtilities(board'));
  assert.match(source, /const order = \['files', 'tasks'\]/);
  assert.match(source, /renderProjectMemos\(board, project/);
  assert.doesNotMatch(styles, /order\s*:\s*-1/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.rh-next-project-board \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.rh-next-project-board-item \{ order: initial; \}/);
});

test('alpha.12 共享网格只有模块与三种辅助组件并保留折叠、把手拖动与快捷置顶', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  assert.match(source, /model\.projectBoardItems/);
  assert.match(source, /model\.moveProjectBoardItem/);
  assert.match(source, /model\.resetProjectBoardLayout/);
  assert.match(source, /setProjectPanelCollapsed/);
  assert.match(source, /draggedProjectBoardKey/);
  assert.match(source, /attachProjectBoardDrag/);
  assert.match(source, /togglePinnedVaultRef/);
  assert.match(source, /togglePinnedVaultCreatePath/);
  assert.match(source, /flushProjectMemo/);
});

test('alpha.12 宽中窄窗口分别使用四列、两列、单列且不引入卡片内滚动', () => {
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styles, /\.rh-next-project-board\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.rh-next-project-board \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(styles, /\.rh-next-utility-panel\[data-panel-type="tasks"\][^{]*\{[^}]*max-height/);
});

test('alpha.12 布局仅由把手启动并支持空格落位、占用交换与撤回', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const board = source.slice(source.indexOf('  setProjectBoardItemPosition('), source.indexOf('\n  projectPanelSummary('));
  assert.match(board, /handle\.addEventListener\('dragstart'/);
  assert.doesNotMatch(board, /element\.setAttribute\('draggable'/);
  assert.match(board, /rh-next-project-board-slot/);
  assert.match(board, /is-drag-target/);
  assert.match(board, /event\.key !== 'Escape'/);
  assert.doesNotMatch(board, /布局操作/);
  assert.match(source, /恢复默认布局/);
  assert.match(source, /撤回/);
});

test('alpha.12 动态高度只向下推并按逻辑行差保留用户空洞', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const layout = source.slice(source.indexOf('  layoutProjectBoard(board)'), source.indexOf('\n  async moveProjectBoardItem('));
  assert.match(layout, /logicalRow - previousLogicalRow - 1/);
  assert.match(layout, /Math\.max\(slotSpan, Math\.ceil\(\(measured \+ rowGap\)/);
  assert.match(layout, /previousLogicalRow = logicalRow/);
  assert.match(layout, /wideLayout && column <= 3 \? headingSpan \+ 1 : 1/);
  assert.match(layout, /column === 4 \? 'translateY\(-20px\)'/);
  assert.match(layout, /board\.style\.minHeight = headingHeight/);
  assert.doesNotMatch(layout, /dataset\.boardColumn\s*=/);
});

test('alpha.10 项目辅助区标题栏统一新增入口并采用多便签', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const utilities = source.slice(source.indexOf('\n  renderProjectUtilities(parent, project, boardItemByKey, mediumOrder)'), source.indexOf('\n  setProjectBoardItemPosition(element, item'));
  assert.match(utilities, /iconButton\(head, 'plus'/);
  assert.match(utilities, /addProjectUtilityItem/);
  const addUtility = source.slice(source.indexOf('\n  async addProjectUtilityItem('), source.indexOf('\n  renderProjectFiles(parent, project)'));
  assert.match(addUtility, /createProjectMemo/);
  const files = source.slice(source.indexOf('\n  renderProjectFiles(parent, project)'), source.indexOf('\n  showProjectFileAddMenu(event, project)'));
  assert.doesNotMatch(files, /textButton\([^\n]*添加项目文件/);
  const memo = source.slice(source.indexOf('\n  renderProjectMemos(parent, project'), source.indexOf('\n  renderModuleCard(parent, module, options'));
  assert.match(memo, /updateProjectMemo/);
  assert.match(memo, /updateProjectMemoTitle/);
  assert.match(memo, /deleteProjectMemo/);
  assert.match(memo, /attachProjectBoardDrag/);
  assert.match(memo, /boardItem\.key/);
  assert.match(memo, /rh-next-project-memo-group-body/);
  assert.match(memo, /items\.length === 1/);
  assert.match(memo, /\['left', 'right'\]/);
  assert.match(memo, /rh-next-project-memo-add/);
  assert.match(memo, /iconButton\(head, 'trash-2', '删除便签'/);
  assert.doesNotMatch(memo, /selectedProjectMemoId/);
  assert.doesNotMatch(memo, /rh-next-project-memo-tools/);
  assert.match(memo, /toLocaleDateString\('zh-CN'\)/);
  assert.doesNotMatch(memo, /已保存 ·/);
  assert.match(styles, /\.rh-next-project-memo-group-body \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(styles, /\.rh-next-project-memo-group\.is-single \{[^}]*width: calc\(50% - 4px\)/);
  assert.match(styles, /\.rh-next-project-memo-group\.is-single\.is-right \{[^}]*justify-self: end/);
  assert.match(styles, /\.rh-next-project-board\.is-layout-dragging \.rh-next-project-memo-group\.is-single \{[^}]*width: 100%/);
  assert.match(styles, /\.rh-next-project-memo-input \{[^}]*resize: vertical[^}]*scrollbar-width: none/);
  assert.match(styles, /\.rh-next-project-memo-input::\-webkit-scrollbar \{[^}]*display: none/);
  assert.doesNotMatch(styles, /\.rh-next-project-memo-card\.is-selected/);
  assert.match(source, /item\.kind !== 'module'/);
  assert.match(source, /setTitle\('新建便签'\)/);
});

test('alpha.10 最近修改最多三项且可按项目折叠', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const files = source.slice(source.indexOf('\n  renderProjectFiles(parent, project)'), source.indexOf('\n  showProjectFileAddMenu(event, project)'));
  assert.match(files, /projectRecentCollapsedByProject/);
  assert.match(files, /setProjectRecentCollapsed/);
  assert.match(files, /recent\.slice\(0, 3\)/);
  assert.match(files, /entry\.stat\.mtime/);
});

test('项目文件采用原地折叠的 Obsidian 风格轻量文件树', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const files = source.slice(source.indexOf('\n  renderProjectFiles(parent, project)'), source.indexOf('\n  renderProjectMemos(parent, project'));
  assert.match(files, /renderProjectFileTreeRow/);
  assert.match(files, /expandedProjectVaultFolders/);
  assert.match(files, /chevron-down/);
  assert.match(files, /entry\.children/);
  assert.doesNotMatch(files, /new VaultFolderBrowserModal/);
  assert.match(files, /children\.slice\(0, 300\)/);
  assert.match(files, /ref\.entryType === 'file'\) menu\.addItem/);
  assert.match(styles, /\.rh-next-project-file-row \{[^}]*min-height: 28px/);
  assert.match(styles, /\.rh-next-project-file-copy > span \{ min-width: 0; font-weight: 400; \}/);
});

test('alpha.10 模块抽屉从 OpenList 路径派生文件夹层级', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const drawer = source.slice(source.indexOf('\n  renderDrawer(root, moduleId)'), source.indexOf('\n  renderLibrary(main)'));
  assert.match(drawer, /rh-next-resource-breadcrumbs/);
  assert.match(drawer, /rh-next-resource-folder-row/);
  assert.match(drawer, /resourceVirtualFolderPath/);
  assert.match(drawer, /metadata\?\.remotePath/);
  assert.match(drawer, /metadata\?\.rootPath/);
});

test('alpha.11 本地文件夹层级优先使用导入根而不是完整磁盘路径', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const modelSource = fs.readFileSync(path.join(root, 'src/model.cjs'), 'utf8');
  const helper = source.slice(source.indexOf('  resourceVirtualFolderPath(resource'), source.indexOf('\n  renderDrawerResourceRow'));
  assert.match(helper, /model\.moduleResourceRoot/);
  assert.match(helper, /resource\?\.metadata\?\.rootPath/);
  assert.match(helper, /model\.resourceFolderPath\(resource, rootPath\)/);
  assert.match(modelSource, /resource\?\.metadata\?\.localPath/);
  assert.match(modelSource, /resourceFolderPath/);
});

test('模块支持独立归档、恢复、永久删除预览和撤回入口', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const card = source.slice(source.indexOf('\n  renderModuleCard(parent, module, options'), source.indexOf('\n  async renameModuleInline'));
  assert.match(card, /归档模块/);
  assert.match(card, /永久删除模块/);
  assert.match(source, /class ArchivedModulesModal extends Modal/);
  assert.match(source, /model\.restoreModule/);
  assert.match(source, /model\.deleteModule/);
  assert.match(source, /相关计划/);
  assert.match(source, /资源关联/);
  assert.match(source, /可从顶部撤回/);
});

test('alpha.11 B站分P预览提供自动分组设置并只在加入项目时分组', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const unifiedAdd = source.slice(source.indexOf('class UnifiedAddModal extends Modal'), source.indexOf('class LegacyBiliHomepageCleanupModal extends Modal'));
  const paste = unifiedAdd.slice(unifiedAdd.indexOf('  renderPaste(parent, projectId, projects)'), unifiedAdd.indexOf('\n  resourceGroupInfo(resource)'));
  const handlePaste = unifiedAdd.slice(unifiedAdd.indexOf('  async handlePaste('), unifiedAdd.indexOf('\n  renderPaste(parent, projectId, projects)'));

  assert.match(unifiedAdd, /defaultResourceAutoGroupEnabled/);
  assert.match(paste, /自动分组/);
  assert.match(paste, /每组数量/);
  assert.match(paste, /预计(?:结果|组数)/);
  assert.match(paste, /autoGroupParts/);
  assert.match(paste, /autoGroupSize/);
  assert.match(handlePaste, /model\.autoGroupResources/);
  assert.match(handlePaste, /createdResourceGroupIds/);

  const biliBranch = handlePaste.slice(handlePaste.indexOf('const bili ='), handlePaste.indexOf('\n    let moduleId'));
  const groupingBlock = biliBranch.slice(
    biliBranch.indexOf('const shouldAutoGroup'),
    biliBranch.indexOf('this.recordAddAction')
  );
  assert.match(groupingBlock, /!inboxOnly/);
  assert.match(groupingBlock, /model\.autoGroupResources/);
  assert.doesNotMatch(groupingBlock, /inboxOnly\s*\?/);
});

test('alpha.11 模块抽屉按一层资源分组展示并提供安全管理入口', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const drawer = source.slice(source.indexOf('  renderDrawer(root, moduleId)'), source.indexOf('\n  resourceVirtualFolderPath'));
  const row = source.slice(source.indexOf('  renderDrawerResourceRow(parent, resource'), source.indexOf('\n  renderResourceActionButtons'));
  assert.match(drawer, /model\.moduleResourceGroups/);
  assert.match(drawer, /model\.resourceGroupProgress/);
  assert.match(drawer, /model\.setResourceGroupCollapsed/);
  assert.match(drawer, /model\.createResourceGroup/);
  assert.match(drawer, /model\.renameResourceGroup/);
  assert.match(drawer, /model\.deleteResourceGroup/);
  assert.match(drawer, /model\.moveResourceGroup/);
  assert.match(drawer, /整理当前文件夹/);
  assert.match(drawer, /model\.autoGroupResources/);
  assert.match(drawer, /type: 'auto-group-resources'/);
  assert.match(drawer, /module:\$\{moduleId\}:folder:/);
  assert.match(drawer, /scopePath: currentPath/);
  assert.match(drawer, /适用于 OpenList、本地文件夹及其他目录来源/);
  assert.doesNotMatch(drawer, /resource\.sourceId\s*===/);
  assert.match(drawer, /visibleGroups = resourceGroups\.filter/);
  assert.match(drawer, /groupedIds = new Set\(visibleGroups/);
  assert.match(drawer, /恢复原文件夹/);
  assert.doesNotMatch(drawer, /const moduleVideos = model\.moduleResources/);
  assert.match(row, /model\.moveResourceToGroup/);
  assert.match(drawer, /progress\.done/);
});

test('alpha.11 全局搜索只有在模块范围内才提供分组管理', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const search = source.slice(source.indexOf('class ResourceSearchModal extends Modal'), source.indexOf('class ArchivedModulesModal extends Modal'));
  assert.match(search, /全部项目/);
  assert.match(search, /选择项目后可管理分组/);
  assert.match(search, /if \(moduleSelect\.value\)/);
  assert.match(search, /model\.moveResourceToGroup/);
  assert.match(search, /window\.setTimeout\(paint, 120\)/);
});

test('alpha.11 本地来源扫描先异步预览再明确提交到收件箱或项目', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const scanner = source.slice(source.indexOf('  async scanLocalFolder(rootPath'), source.indexOf('\n  async requestBiliDataViaNode'));
  const localSource = source.slice(source.indexOf('  renderLocalFolderSource(parent)'), source.indexOf('\n  renderBilibiliSource(parent)'));
  const preview = source.slice(source.indexOf('class LocalFolderImportPreviewModal extends Modal'), source.indexOf('class OpenListImportPreviewModal extends Modal'));
  assert.match(scanner, /fs\.promises\.readdir/);
  assert.match(scanner, /options\.isCancelled/);
  assert.match(scanner, /failures/);
  assert.match(scanner, /ignoredCount/);
  assert.doesNotMatch(scanner, /readdirSync/);
  assert.match(localSource, /扫描并预览/);
  assert.match(localSource, /previewLocalFolder/);
  assert.doesNotMatch(localSource, /upsertResourceDescriptor/);
  assert.match(preview, /确认前不会创建资源/);
  assert.match(preview, /this\.selected/);
  assert.match(preview, /仅放入收件箱/);
  assert.match(preview, /加入项目/);
  assert.match(preview, /model\.upsertSource/);
});

test('alpha.11 粘贴入口拦截本地文件夹拖放并复用统一预览', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
  const paste = source.slice(source.indexOf('  renderPaste(parent, projectId, projects)'), source.indexOf('\n  resourceGroupInfo(resource)'));
  assert.match(paste, /webUtils\?\.getPathForFile/);
  assert.match(paste, /dragover/);
  assert.match(paste, /event\.preventDefault\(\)/);
  assert.match(paste, /stat\.isDirectory\(\)/);
  assert.match(paste, /this\.previewLocalFolder\(droppedPath\)/);
});
