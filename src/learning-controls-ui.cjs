'use strict';

const { Menu, Notice } = require('obsidian');
const {
  captureFrameAndInsertLearningPosition,
  checkPotPlayerBridge,
  commandErrorText
} = require('./learning-capture.cjs');
const {
  HOTKEY_ACTIONS,
  immersiveStatus,
  registerImmersiveHotkeys,
  resetImmersiveShortcuts,
  updateImmersiveShortcut
} = require('./immersive-hotkeys.cjs');
const { immersiveShortcuts } = require('./native-potplayer.cjs');
const {
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  updateProductSetting
} = require('./product-settings.cjs');
const {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal
} = require('./resource-relink-ui.cjs');

function safePluginId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('无法为沉浸式控件生成安全作用域。');
  return id;
}

function controlScope(pluginId) {
  return `.workspace-leaf-content[data-type="${safePluginId(pluginId)}-workbench"]`;
}

function learningControlsCss(pluginId) {
  const scope = controlScope(pluginId);
  return `${scope} .rh-next-immersive-status {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 24px;
  text-align: center;
  cursor: default;
}
${scope} .rh-next-immersive-status.is-ready { color: var(--text-success); }
${scope} .rh-next-immersive-status.is-error { color: var(--text-error); }
.go-study-settings-section-title {
  margin: 24px 0 4px;
  font-size: 1.05em;
}
.go-study-settings-section-desc {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}
.go-study-setting-status {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--background-secondary);
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}
.go-study-setting-status.is-ready { color: var(--text-success); }
.go-study-setting-status.is-error { color: var(--text-error); }
.go-study-setting-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.go-study-setting-shortcut-grid {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(120px, 180px);
  gap: 8px 14px;
  align-items: center;
  margin: 8px 0 12px;
}
.go-study-setting-shortcut-grid label { color: var(--text-normal); }
.go-study-setting-shortcut-grid input { width: 100%; }
`;
}

function statusText(plugin) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return '视频笔记增强已关闭。';
  const status = immersiveStatus(plugin);
  if (status.registered) {
    const count = status.registeredAccelerators?.length || 0;
    return `Windows 视频笔记增强已就绪 · ${count || 4} 个全局快捷键`;
  }
  return status.error || '视频笔记增强尚未就绪。';
}

function renderImmersiveStatus(plugin, root, doc = globalThis.document) {
  const actions = root?.querySelector?.('.rh-next-header-actions');
  if (!actions) return null;
  const existing = actions.querySelector?.('[data-go-study-immersive-status]');
  if (!currentProductSettings(plugin).videoEnhancementEnabled) {
    existing?.remove?.();
    return null;
  }
  if (existing) return existing;
  const button = doc.createElement('button');
  const status = immersiveStatus(plugin);
  button.type = 'button';
  button.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : 'is-error'}`.trim();
  button.setAttribute('data-go-study-immersive-status', 'true');
  button.setAttribute('aria-label', statusText(plugin));
  button.title = statusText(plugin);
  button.textContent = status.registered ? '●' : '○';
  button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    new Notice(statusText(plugin), 3500);
  });
  actions.prepend(button);
  return button;
}

function showCourseManagementMenu(plugin, event) {
  const menu = new Menu();
  menu.addItem((item) => item
    .setTitle('重新关联 OpenList 课程目录')
    .setIcon('folder-sync')
    .onClick(() => new OpenListFolderRemapModal(plugin.app, plugin).open()));
  menu.addItem((item) => item
    .setTitle('重新关联单个 OpenList 文件（高级）')
    .setIcon('file-cog')
    .onClick(() => new OpenListResourceRelinkModal(plugin.app, plugin).open()));
  menu.showAtMouseEvent(event);
  return menu;
}

function bindProjectCourseMenu(plugin, root) {
  const heading = root?.querySelector?.('.rh-next-project-heading');
  if (!heading || heading.dataset.goStudyCourseMenuBound === 'true') return false;
  heading.dataset.goStudyCourseMenuBound = 'true';
  heading.title = heading.title || '右键打开课程管理';
  heading.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCourseManagementMenu(plugin, event);
  });
  return true;
}

function createButton(doc, label, handler, options = {}) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (options.cta) button.classList.add('mod-cta');
  if (options.warning) button.classList.add('mod-warning');
  button.addEventListener('click', () => void handler(button));
  return button;
}

function createSectionTitle(doc, container, title, description = '') {
  const heading = doc.createElement('h3');
  heading.className = 'go-study-settings-section-title';
  heading.textContent = title;
  container.appendChild(heading);
  if (description) {
    const desc = doc.createElement('p');
    desc.className = 'go-study-settings-section-desc';
    desc.textContent = description;
    container.appendChild(desc);
  }
  return heading;
}

function createSettingRow(doc, container, name, description, controlBuilder) {
  const row = doc.createElement('div');
  row.className = 'setting-item';
  const info = doc.createElement('div'); info.className = 'setting-item-info'; row.appendChild(info);
  const title = doc.createElement('div'); title.className = 'setting-item-name'; title.textContent = name; info.appendChild(title);
  if (description) {
    const desc = doc.createElement('div'); desc.className = 'setting-item-description'; desc.textContent = description; info.appendChild(desc);
  }
  const control = doc.createElement('div'); control.className = 'setting-item-control'; row.appendChild(control);
  controlBuilder?.(control, row);
  container.appendChild(row);
  return row;
}

function createToggle(doc, value, onChange) {
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(value);
  input.className = 'checkbox-container';
  input.addEventListener('change', () => void onChange(input.checked, input));
  return input;
}

function refreshStatusElement(plugin, element) {
  if (!element) return;
  const status = immersiveStatus(plugin);
  element.textContent = statusText(plugin);
  element.classList.toggle('is-ready', Boolean(status.registered));
  element.classList.toggle('is-error', currentProductSettings(plugin).videoEnhancementEnabled && !status.registered);
}

function rerenderSettings(plugin, container, doc) {
  container.querySelector?.('[data-go-study-settings-center]')?.remove?.();
  renderSettingsCenter(plugin, container, doc);
}

function renderSettingsCenter(plugin, container, doc = globalThis.document) {
  if (!container || container.querySelector?.('[data-go-study-settings-center]')) return null;
  const settings = currentProductSettings(plugin);
  const center = doc.createElement('div');
  center.setAttribute('data-go-study-settings-center', 'true');

  createSectionTitle(doc, center, '工作台', '控制 Go Study 进入学习工作台时的界面行为。');
  createSettingRow(doc, center, '进入工作台时自动收起 Obsidian 侧栏', '关闭后 Go Study 不再主动改变左右侧栏状态。', (control) => {
    control.appendChild(createToggle(doc, settings.autoCollapseSidebar, async (value) => {
      await updateProductSetting(plugin, 'autoCollapseSidebar', value);
      new Notice(value ? '已启用自动收起侧栏。' : '已关闭自动收起侧栏。');
    }));
  });

  createSectionTitle(doc, center, '视频笔记增强', '可选的 Windows / PotPlayer 增强层。普通资源管理用户可以完全关闭。');
  createSettingRow(doc, center, '启用视频笔记增强', '启用后注册 Alt+1～Alt+4 全局快捷键；关闭会立即释放这些快捷键。', (control) => {
    control.appendChild(createToggle(doc, settings.videoEnhancementEnabled, async (value) => {
      await updateProductSetting(plugin, 'videoEnhancementEnabled', value);
      registerImmersiveHotkeys(plugin);
      rerenderSettings(plugin, container, doc);
      await plugin.workbenchLeaf?.view?.render?.();
      new Notice(value ? '视频笔记增强已启用。' : '视频笔记增强已关闭。');
    }));
  });

  if (settings.videoEnhancementEnabled) {
    const shortcuts = immersiveShortcuts(plugin);
    const grid = doc.createElement('div'); grid.className = 'go-study-setting-shortcut-grid'; center.appendChild(grid);
    for (const key of Object.keys(HOTKEY_ACTIONS)) {
      const label = doc.createElement('label'); label.textContent = HOTKEY_ACTIONS[key]; grid.appendChild(label);
      const input = doc.createElement('input'); input.type = 'text'; input.value = shortcuts[key] || ''; input.placeholder = '留空表示禁用'; grid.appendChild(input);
      input.addEventListener('change', async () => {
        try {
          await updateImmersiveShortcut(plugin, key, input.value);
          input.value = immersiveShortcuts(plugin)[key] || '';
          refreshStatusElement(plugin, statusBox);
          new Notice(input.value ? `快捷键已更新：${HOTKEY_ACTIONS[key]} → ${input.value}` : `已禁用快捷键：${HOTKEY_ACTIONS[key]}`);
        } catch (error) {
          input.value = immersiveShortcuts(plugin)[key] || '';
          new Notice(commandErrorText('快捷键更新失败', error), 5000);
        }
      });
    }

    createSettingRow(doc, center, '保存笔记后继续播放', 'Alt+3 / Alt+4 保存后自动让刚才由 Go Study 暂停的视频继续播放。', (control) => {
      control.appendChild(createToggle(doc, settings.videoResumeAfterSave, (value) => updateProductSetting(plugin, 'videoResumeAfterSave', value)));
    });
    createSettingRow(doc, center, '取消笔记后继续播放', '按 Esc 取消快速笔记后恢复播放，避免手动切回 PotPlayer。', (control) => {
      control.appendChild(createToggle(doc, settings.videoResumeAfterCancel, (value) => updateProductSetting(plugin, 'videoResumeAfterCancel', value)));
    });
    createSettingRow(doc, center, '显示轻量成功提示', '关闭后成功记录不会弹出短提示；错误仍会显示。', (control) => {
      control.appendChild(createToggle(doc, settings.videoSuccessFeedback, (value) => updateProductSetting(plugin, 'videoSuccessFeedback', value)));
    });
    createSettingRow(doc, center, '截图保存目录', 'Vault 内相对路径。Alt+2 / Alt+4 的截图会保存到这里。', (control) => {
      const input = doc.createElement('input'); input.type = 'text'; input.value = settings.captureFolder; input.placeholder = DEFAULT_PRODUCT_SETTINGS.captureFolder; control.appendChild(input);
      input.addEventListener('change', async () => {
        try {
          const next = await updateProductSetting(plugin, 'captureFolder', input.value);
          input.value = next.captureFolder;
          new Notice(`截图目录已更新：${next.captureFolder}`);
        } catch (error) {
          input.value = currentProductSettings(plugin).captureFolder;
          new Notice(commandErrorText('截图目录无效', error), 5000);
        }
      });
    });

    const statusBox = doc.createElement('div'); statusBox.className = 'go-study-setting-status'; center.appendChild(statusBox); refreshStatusElement(plugin, statusBox);
    const actions = doc.createElement('div'); actions.className = 'go-study-setting-inline-actions'; center.appendChild(actions);
    actions.appendChild(createButton(doc, '检查状态', async (button) => {
      button.disabled = true;
      try {
        const result = await checkPotPlayerBridge({ nativeOnly: true });
        new Notice(`视频笔记增强可用 · ${result.transport || `v${result.version}`}`);
      } catch (error) {
        new Notice(commandErrorText('视频笔记增强不可用', error), 6000);
      } finally { button.disabled = false; refreshStatusElement(plugin, statusBox); }
    }));
    actions.appendChild(createButton(doc, '截图记录测试', async (button) => {
      button.disabled = true;
      try {
        const result = await captureFrameAndInsertLearningPosition(plugin, { nativeOnly: true });
        new Notice(`截图已保存：${result.vaultPath}`);
      } catch (error) {
        new Notice(commandErrorText('截图记录失败', error), 6000);
      } finally { button.disabled = false; }
    }));
    actions.appendChild(createButton(doc, '恢复默认快捷键', async () => {
      await resetImmersiveShortcuts(plugin);
      rerenderSettings(plugin, container, doc);
      new Notice('已恢复 Alt+1～Alt+4 默认快捷键。');
    }));
  }

  createSectionTitle(doc, center, '数据与安全', '控制本地自动备份的保留策略；不会删除你的学习资源原文件。');
  createSettingRow(doc, center, '自动备份保留数量', '保留最近 3～10 份插件状态备份。', (control) => {
    const input = doc.createElement('input'); input.type = 'number'; input.min = '3'; input.max = '10'; input.step = '1'; input.value = String(settings.backupRetention); control.appendChild(input);
    input.addEventListener('change', async () => {
      const next = await updateProductSetting(plugin, 'backupRetention', input.value);
      input.value = String(next.backupRetention);
      new Notice(`自动备份将保留最近 ${next.backupRetention} 份。`);
    });
  });

  container.appendChild(center);
  return center;
}

function findSettingsContainer(doc = globalThis.document) {
  const headings = [...(doc?.querySelectorAll?.('h2') || [])];
  const heading = headings.find((item) => ['学习资源工作台', 'Go Study 设置'].includes(String(item.textContent || '').trim()));
  if (!heading) return null;
  heading.textContent = 'Go Study 设置';
  return heading.parentElement || null;
}

function installLearningControls(plugin, doc = globalThis.document) {
  if (!plugin?.manifest?.id || !doc?.querySelectorAll || !doc?.createElement) return null;
  const scope = controlScope(plugin.manifest.id);
  const inject = () => {
    for (const leaf of doc.querySelectorAll(scope)) {
      const root = leaf.querySelector?.('.rh-next-workbench');
      if (!root) continue;
      renderImmersiveStatus(plugin, root, doc);
      bindProjectCourseMenu(plugin, root);
    }
    const settings = findSettingsContainer(doc);
    if (settings) renderSettingsCenter(plugin, settings, doc);
  };

  const style = doc.createElement('style');
  style.setAttribute('data-go-study-learning-controls-style', safePluginId(plugin.manifest.id));
  style.textContent = learningControlsCss(plugin.manifest.id);
  doc.head?.appendChild?.(style);

  inject();
  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(() => inject()) : null;
  observer?.observe?.(doc.body, { childList: true, subtree: true });
  const statusListener = () => inject();
  doc.addEventListener?.('go-study-immersive-status', statusListener);

  plugin.register?.(() => {
    observer?.disconnect?.();
    doc.removeEventListener?.('go-study-immersive-status', statusListener);
    style.remove?.();
  });
  return { observer, style, inject };
}

module.exports = {
  bindProjectCourseMenu,
  controlScope,
  createButton,
  createSectionTitle,
  createSettingRow,
  createToggle,
  findSettingsContainer,
  installLearningControls,
  learningControlsCss,
  renderImmersiveStatus,
  renderSettingsCenter,
  rerenderSettings,
  safePluginId,
  showCourseManagementMenu,
  statusText
};
