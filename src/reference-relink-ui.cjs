'use strict';

const { Modal } = require('obsidian');

function activeVideoResources(plugin) {
  return Object.values(plugin?.state?.resources || {})
    .filter((resource) => resource && !resource.deletedAt && resource.kind === 'video')
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN'));
}

class MissingReferenceRelinkModal extends Modal {
  constructor(app, plugin, reference, onChoose) {
    super(app);
    this.plugin = plugin;
    this.reference = reference;
    this.onChoose = onChoose;
    this.chosen = false;
  }

  onOpen() {
    this.modalEl.addClass?.('go-study-reference-relink-modal');
    this.contentEl.createEl('h3', { text: '重新关联旧时间戳' });
    this.contentEl.createEl('p', {
      text: '这是一条旧版 Managed 回链，只保存了 Resource ID。当前资源库里已经没有这个 ID，因此需要手动选择一次对应的视频。之后同一旧 Resource ID 的时间戳都会自动使用这条关联。'
    });

    const resources = activeVideoResources(this.plugin);
    if (!resources.length) {
      this.contentEl.createEl('p', {
        cls: 'setting-item-description',
        text: '当前没有可选视频。请先重新收录对应资源，再点击这条旧时间戳进行关联。'
      });
      const close = this.contentEl.createEl('button', { text: '知道了' });
      close.addEventListener('click', () => this.close());
      return;
    }

    const select = this.contentEl.createEl('select', { cls: 'dropdown go-study-reference-relink-select' });
    for (const resource of resources) {
      select.createEl('option', {
        text: resource.title || resource.id,
        value: resource.id
      });
    }

    const actions = this.contentEl.createDiv({ cls: 'go-study-reference-relink-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    const confirm = actions.createEl('button', { text: '关联并打开', cls: 'mod-cta' });
    cancel.addEventListener('click', () => this.close());
    confirm.addEventListener('click', () => {
      const resource = this.plugin?.state?.resources?.[select.value];
      if (!resource || resource.deletedAt) return;
      this.chosen = true;
      this.onChoose?.(resource);
      this.close();
    });
  }

  onClose() {
    if (!this.chosen) this.onChoose?.(null);
    this.contentEl.empty();
  }
}

function chooseReferenceRelinkResource(plugin, reference) {
  return new Promise((resolve) => {
    new MissingReferenceRelinkModal(plugin.app, plugin, reference, resolve).open();
  });
}

module.exports = {
  MissingReferenceRelinkModal,
  activeVideoResources,
  chooseReferenceRelinkResource
};
