'use strict';

const { Modal, Notice } = require('obsidian');
const { normalizeOpenListPathCompat, openListLocatorFromResource, pathWithinPrefix } = require('./resource-locator.cjs');

function activeOpenListResources(plugin) {
  return Object.values(plugin?.state?.resources || {})
    .filter((resource) => !resource?.deletedAt && openListLocatorFromResource(resource))
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN', { numeric: true }));
}

function activeOpenListSources(plugin) {
  return Object.values(plugin?.state?.sources || {})
    .filter((source) => source?.type === 'openlist' && !source.deletedAt)
    .sort((left, right) => String(left.alias || left.baseUrl || left.id).localeCompare(String(right.alias || right.baseUrl || right.id), 'zh-CN'));
}

function createField(parent, label, value, options = {}) {
  const wrap = parent.createDiv({ cls: 'rh-next-field' });
  wrap.createEl('label', { text: label });
  const input = wrap.createEl(options.select ? 'select' : 'input', { cls: 'rh-next-input' });
  if (!options.select) {
    input.type = 'text';
    input.value = value || '';
    input.placeholder = options.placeholder || '';
  }
  return input;
}

function createActions(parent) {
  return parent.createDiv({ cls: 'rh-next-modal-actions' });
}

function createButton(parent, label, handler, primary = false) {
  const button = parent.createEl('button', { cls: `rh-next-button${primary ? ' is-primary' : ''}`, text: label });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    void handler();
  });
  return button;
}

function parentOpenListPath(remotePath) {
  const normalized = normalizeOpenListPathCompat(remotePath || '');
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function suggestedCourseRoot(plugin, resource) {
  const locator = openListLocatorFromResource(resource);
  if (!locator) return '';
  const resourceRoot = normalizeOpenListPathCompat(resource?.metadata?.rootPath || '');
  if (resourceRoot && resourceRoot !== '/' && pathWithinPrefix(locator.remotePath, resourceRoot)) return resourceRoot;

  for (const module of Object.values(plugin?.state?.modules || {})) {
    if (!(module?.resourceIds || []).includes(resource.id)) continue;
    const stored = normalizeOpenListPathCompat(module.resourceRoots?.[resource.id] || '');
    if (stored && stored !== '/' && pathWithinPrefix(locator.remotePath, stored)) return stored;
  }
  return parentOpenListPath(locator.remotePath);
}

class OpenListResourceRelinkModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.resourceId = '';
    this.remotePath = '';
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  render() {
    const resources = activeOpenListResources(this.plugin);
    if (!this.resourceId || !resources.some((resource) => resource.id === this.resourceId)) {
      this.resourceId = resources[0]?.id || '';
      this.remotePath = this.resourceId ? openListLocatorFromResource(this.plugin.state.resources[this.resourceId])?.remotePath || '' : '';
    }

    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '重新关联单个 OpenList 文件' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: '高级修复入口：只修改当前这一条资源。如果整个课程文件夹被移动或改名，请使用“重新关联 OpenList 课程目录”，不要逐个处理视频。'
    });

    if (!resources.length) {
      this.contentEl.createEl('p', { text: '当前没有可重新关联的 OpenList 资源。' });
      const actions = createActions(this.contentEl);
      createButton(actions, '关闭', () => this.close());
      return;
    }

    const resourceSelect = createField(this.contentEl, '资源', '', { select: true });
    for (const resource of resources) {
      const locator = openListLocatorFromResource(resource);
      const option = resourceSelect.createEl('option', { text: `${resource.title || resource.id} · ${locator.remotePath}` });
      option.value = resource.id;
    }
    resourceSelect.value = this.resourceId;
    resourceSelect.addEventListener('change', () => {
      this.resourceId = resourceSelect.value;
      this.remotePath = openListLocatorFromResource(this.plugin.state.resources[this.resourceId])?.remotePath || '';
      this.render();
    });

    const current = openListLocatorFromResource(this.plugin.state.resources[this.resourceId]);
    this.contentEl.createEl('small', { text: `当前路径：${current?.remotePath || '未知'}` });
    const pathInput = createField(this.contentEl, '新的文件路径', this.remotePath, {
      placeholder: '/课程/新目录/17.mp4'
    });
    pathInput.addEventListener('input', () => { this.remotePath = pathInput.value; });

    const actions = createActions(this.contentEl);
    createButton(actions, '取消', () => this.close());
    createButton(actions, '验证并重新关联单文件', async () => {
      try {
        await this.plugin.relinkOpenListResourceToPath(this.resourceId, this.remotePath);
        new Notice('单个 OpenList 文件已重新关联；Resource ID 与旧笔记回链保持不变。', 5000);
        this.close();
      } catch (error) {
        new Notice(`重新关联失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    }, true);
  }
}

class OpenListFolderRemapModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.resourceId = '';
    this.sourceId = '';
    this.oldPrefix = '';
    this.newPrefix = '';
    this.preview = null;
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  selectResource(resourceId, resources) {
    const resource = resources.find((candidate) => candidate.id === resourceId) || resources[0] || null;
    this.resourceId = resource?.id || '';
    const locator = openListLocatorFromResource(resource);
    this.sourceId = locator?.sourceId || '';
    this.oldPrefix = resource ? suggestedCourseRoot(this.plugin, resource) : '';
    this.preview = null;
  }

  render() {
    const resources = activeOpenListResources(this.plugin);
    if (!this.resourceId || !resources.some((resource) => resource.id === this.resourceId)) this.selectResource('', resources);

    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '重新关联 OpenList 课程目录' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: '适用于整个课程目录被移动或改名。选择课程中的任意一个视频，Go Study 会识别旧目录并一次更新目录下全部已关联资源，同时同步模块展示根和路径分组。'
    });

    if (!resources.length) {
      this.contentEl.createEl('p', { text: '当前没有可用的 OpenList 资源。' });
      const actions = createActions(this.contentEl);
      createButton(actions, '关闭', () => this.close());
      return;
    }

    const resourceSelect = createField(this.contentEl, '选择这个课程中的任意资源', '', { select: true });
    for (const resource of resources) {
      const locator = openListLocatorFromResource(resource);
      const option = resourceSelect.createEl('option', { text: `${resource.title || resource.id} · ${locator.remotePath}` });
      option.value = resource.id;
    }
    resourceSelect.value = this.resourceId;
    resourceSelect.addEventListener('change', () => {
      this.selectResource(resourceSelect.value, resources);
      this.newPrefix = '';
      this.render();
    });

    const currentResource = this.plugin.state.resources[this.resourceId];
    const currentLocator = openListLocatorFromResource(currentResource);
    const source = this.plugin.state.sources?.[this.sourceId];
    this.contentEl.createEl('small', {
      text: `当前资源：${currentLocator?.remotePath || '未知'}${source ? ` · 来源：${source.alias || source.baseUrl || source.id}` : ''}`
    });

    const oldInput = createField(this.contentEl, '旧课程目录（已自动识别，可修改）', this.oldPrefix, { placeholder: '/百度/课程/高数' });
    const newInput = createField(this.contentEl, '移动后的新课程目录', this.newPrefix, { placeholder: '/百度/大学/数学/高数' });
    oldInput.addEventListener('input', () => { this.oldPrefix = oldInput.value; this.preview = null; });
    newInput.addEventListener('input', () => { this.newPrefix = newInput.value; this.preview = null; });

    if (this.preview) {
      const summary = this.contentEl.createDiv({ cls: 'rh-next-card' });
      summary.createEl('strong', { text: `预览：将更新 ${this.preview.readyCount} 条资源 · 冲突 ${this.preview.conflictCount} 条` });
      summary.createEl('small', { text: `${this.preview.oldPrefix} → ${this.preview.newPrefix}` });
      const list = summary.createEl('ul');
      for (const entry of this.preview.entries.slice(0, 20)) {
        const suffix = entry.status === 'conflict' ? ` ⚠ 与 ${entry.conflictTitle || entry.conflictResourceId} 冲突` : '';
        list.createEl('li', { text: `${entry.from.remotePath} → ${entry.to.remotePath}${suffix}` });
      }
      if (this.preview.entries.length > 20) summary.createEl('small', { text: `另有 ${this.preview.entries.length - 20} 条未展开；确认后会一次性迁移。` });
    }

    const actions = createActions(this.contentEl);
    createButton(actions, '取消', () => this.close());
    createButton(actions, '预览整目录重新关联', async () => {
      try {
        this.preview = await this.plugin.previewOpenListFolderRemap({
          sourceId: this.sourceId,
          oldPrefix: this.oldPrefix,
          newPrefix: this.newPrefix
        });
        this.oldPrefix = this.preview.oldPrefix;
        this.newPrefix = this.preview.newPrefix;
        this.render();
      } catch (error) {
        this.preview = null;
        new Notice(`无法生成目录重新关联预览：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    });
    if (this.preview) {
      const apply = createButton(actions, '确认重新关联整个目录', async () => {
        try {
          const result = await this.plugin.applyOpenListFolderRemap(this.preview);
          const sync = result.associationSync || {};
          new Notice(`已重新关联 ${result.updatedResourceIds.length} 条资源；同步 ${sync.moduleRootCount || 0} 条模块展示根，Resource ID 均未改变。`, 7000);
          this.close();
        } catch (error) {
          new Notice(`目录重新关联失败：${error instanceof Error ? error.message : String(error)}`, 6000);
        }
      }, true);
      apply.disabled = this.preview.conflictCount > 0 || this.preview.readyCount < 1;
    }
  }
}

function registerResourceRelinkCommands(plugin) {
  plugin.addCommand({
    id: 'remap-openlist-folder-paths',
    name: '重新关联 OpenList 课程目录',
    callback: () => new OpenListFolderRemapModal(plugin.app, plugin).open()
  });
  plugin.addCommand({
    id: 'relink-openlist-resource',
    name: '重新关联单个 OpenList 文件（高级）',
    callback: () => new OpenListResourceRelinkModal(plugin.app, plugin).open()
  });
}

module.exports = {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal,
  activeOpenListResources,
  activeOpenListSources,
  parentOpenListPath,
  registerResourceRelinkCommands,
  suggestedCourseRoot
};
