'use strict';

const { Modal, Notice } = require('obsidian');
const { openListLocatorFromResource } = require('./resource-locator.cjs');

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
    this.contentEl.createEl('h2', { text: '重新关联 OpenList 资源' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: 'Resource ID 和已有笔记回链保持不变；仅更新这条资源当前指向的 OpenList 文件。'
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
    createButton(actions, '验证并重新关联', async () => {
      try {
        await this.plugin.relinkOpenListResourceToPath(this.resourceId, this.remotePath);
        new Notice('OpenList 资源已重新关联；Resource ID 与旧笔记回链保持不变。', 5000);
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
    this.sourceId = '';
    this.oldPrefix = '';
    this.newPrefix = '';
    this.preview = null;
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  render() {
    const sources = activeOpenListSources(this.plugin);
    if (!this.sourceId || !sources.some((source) => source.id === this.sourceId)) this.sourceId = sources[0]?.id || '';

    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '迁移 OpenList 文件夹路径' });
    this.contentEl.createEl('p', {
      cls: 'rh-next-interface-tip',
      text: '适用于网盘中整个课程目录被移动/改名。必须先预览；根目录、冲突和过期预览都会被拒绝。'
    });

    if (!sources.length) {
      this.contentEl.createEl('p', { text: '当前没有可用的 OpenList 来源。' });
      const actions = createActions(this.contentEl);
      createButton(actions, '关闭', () => this.close());
      return;
    }

    const sourceSelect = createField(this.contentEl, 'OpenList 来源', '', { select: true });
    for (const source of sources) {
      const option = sourceSelect.createEl('option', { text: source.alias || source.baseUrl || source.id });
      option.value = source.id;
    }
    sourceSelect.value = this.sourceId;
    sourceSelect.addEventListener('change', () => {
      this.sourceId = sourceSelect.value;
      this.preview = null;
    });

    const oldInput = createField(this.contentEl, '旧目录', this.oldPrefix, { placeholder: '/百度/课程/高数' });
    const newInput = createField(this.contentEl, '新目录', this.newPrefix, { placeholder: '/百度/大学/数学/高数' });
    oldInput.addEventListener('input', () => { this.oldPrefix = oldInput.value; this.preview = null; });
    newInput.addEventListener('input', () => { this.newPrefix = newInput.value; this.preview = null; });

    if (this.preview) {
      const summary = this.contentEl.createDiv({ cls: 'rh-next-card' });
      summary.createEl('strong', { text: `预览：可更新 ${this.preview.readyCount} 条 · 冲突 ${this.preview.conflictCount} 条` });
      summary.createEl('small', { text: `${this.preview.oldPrefix} → ${this.preview.newPrefix}` });
      const list = summary.createEl('ul');
      for (const entry of this.preview.entries.slice(0, 20)) {
        const suffix = entry.status === 'conflict' ? ` ⚠ 与 ${entry.conflictTitle || entry.conflictResourceId} 冲突` : '';
        list.createEl('li', { text: `${entry.from.remotePath} → ${entry.to.remotePath}${suffix}` });
      }
      if (this.preview.entries.length > 20) summary.createEl('small', { text: `另有 ${this.preview.entries.length - 20} 条未展开。` });
    }

    const actions = createActions(this.contentEl);
    createButton(actions, '取消', () => this.close());
    createButton(actions, '生成预览', async () => {
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
        new Notice(`无法生成迁移预览：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    });
    if (this.preview) {
      const apply = createButton(actions, '确认迁移', async () => {
        try {
          const result = await this.plugin.applyOpenListFolderRemap(this.preview);
          new Notice(`已迁移 ${result.updatedResourceIds.length} 条资源路径；Resource ID 未改变。`, 6000);
          this.close();
        } catch (error) {
          new Notice(`迁移失败：${error instanceof Error ? error.message : String(error)}`, 6000);
        }
      }, true);
      apply.disabled = this.preview.conflictCount > 0 || this.preview.readyCount < 1;
    }
  }
}

function registerResourceRelinkCommands(plugin) {
  plugin.addCommand({
    id: 'relink-openlist-resource',
    name: '重新关联 OpenList 资源',
    callback: () => new OpenListResourceRelinkModal(plugin.app, plugin).open()
  });
  plugin.addCommand({
    id: 'remap-openlist-folder-paths',
    name: '迁移 OpenList 文件夹路径',
    callback: () => new OpenListFolderRemapModal(plugin.app, plugin).open()
  });
}

module.exports = {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal,
  activeOpenListResources,
  activeOpenListSources,
  registerResourceRelinkCommands
};
