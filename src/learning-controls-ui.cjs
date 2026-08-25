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
  updateImmersiveShortcut
} = require('./immersive-hotkeys.cjs');
const { immersiveShortcuts } = require('./native-potplayer.cjs');
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
${scope} .rh-next-immersive-status.is-ready {
  color: var(--text-success);
}
${scope} .rh-next-immersive-status.is-error {
  color: var(--text-error);
}
.go-study-immersive-settings {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--background-modifier-border);
}
.go-study-immersive-settings h3 { margin: 0 0 6px; }
.go-study-immersive-settings > p { margin: 0 0 12px; color: var(--text-muted); }
.go-study-immersive-setting-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(120px, 180px);
  gap: 12px;
  align-items: center;
  margin: 9px 0;
}
.go-study-immersive-setting-row input {
  width: 100%;
}
.go-study-immersive-settings-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.go-study-immersive-settings-status {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}
`;
}

function statusText(plugin) {
  const status = immersiveStatus(plugin);
  if (status.registered) {
    const count = status.registeredAccelerators?.length || 0;
    return `原生 Windows 视频笔记增强已启用 · ${count || 4} 个快捷键`;
  }
  return status.error || '视频笔记增强尚未启用。';
}

function renderImmersiveStatus(plugin, root, doc = globalThis.document) {
  const actions = root?.querySelector?.('.rh-next-header-actions');
  if (!actions || actions.querySelector?.('[data-go-study-immersive-status]')) return null;
  const button = doc.createElement('button');
  const status = immersiveStatus(plugin);
  button.type = 'button';
  button.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : status.error ? 'is-error' : ''}`.trim();
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

function createSettingsButton(doc, parent, label, handler) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => void handler(button));
  parent.appendChild(button);
  return button;
}

function updateSettingsStatus(plugin, element) {
  if (element) element.textContent = statusText(plugin);
}

function renderSettingsEnhancement(plugin, container, doc = globalThis.document) {
  if (!container || container.querySelector?.('[data-go-study-immersive-settings]')) return null;
  const section = doc.createElement('section');
  section.className = 'go-study-immersive-settings';
  section.setAttribute('data-go-study-immersive-settings', 'true');
  const title = doc.createElement('h3'); title.textContent = '视频笔记增强'; section.appendChild(title);
  const desc = doc.createElement('p');
  desc.textContent = 'Windows 原生模式：PotPlayer 保持前台即可记录、截图或输入笔记；不要求单独运行 markdown2potplayer。';
  section.appendChild(desc);

  const shortcuts = immersiveShortcuts(plugin);
  for (const key of Object.keys(HOTKEY_ACTIONS)) {
    const row = doc.createElement('label'); row.className = 'go-study-immersive-setting-row';
    const copy = doc.createElement('span'); copy.textContent = HOTKEY_ACTIONS[key]; row.appendChild(copy);
    const input = doc.createElement('input'); input.type = 'text'; input.value = shortcuts[key] || ''; input.setAttribute('aria-label', `${HOTKEY_ACTIONS[key]}快捷键`); row.appendChild(input);
    input.addEventListener('change', async () => {
      try {
        await updateImmersiveShortcut(plugin, key, input.value);
        input.value = immersiveShortcuts(plugin)[key] || '';
        updateSettingsStatus(plugin, status);
        new Notice(`快捷键已更新：${HOTKEY_ACTIONS[key]} → ${input.value}`);
      } catch (error) {
        input.value = immersiveShortcuts(plugin)[key] || '';
        new Notice(commandErrorText('快捷键更新失败', error), 5000);
      }
    });
    section.appendChild(row);
  }

  const actions = doc.createElement('div'); actions.className = 'go-study-immersive-settings-actions'; section.appendChild(actions);
  createSettingsButton(doc, actions, '截图记录', async (button) => {
    button.disabled = true;
    try {
      const result = await captureFrameAndInsertLearningPosition(plugin);
      new Notice(`截图已保存：${result.vaultPath}`);
    } catch (error) {
      new Notice(commandErrorText('截图记录失败', error), 6000);
    } finally { button.disabled = false; }
  });
  createSettingsButton(doc, actions, '检查状态', async (button) => {
    button.disabled = true;
    try {
      const result = await checkPotPlayerBridge();
      new Notice(`视频笔记增强可用 · ${result.transport || `v${result.version}`}`);
    } catch (error) {
      new Notice(commandErrorText('视频笔记增强不可用', error), 6000);
    } finally { button.disabled = false; updateSettingsStatus(plugin, status); }
  });
  const status = doc.createElement('div'); status.className = 'go-study-immersive-settings-status'; section.appendChild(status);
  updateSettingsStatus(plugin, status);
  container.appendChild(section);
  return section;
}

function findSettingsContainer(doc = globalThis.document) {
  const headings = [...(doc?.querySelectorAll?.('h2') || [])];
  const heading = headings.find((item) => String(item.textContent || '').trim() === '学习资源工作台');
  return heading?.parentElement || null;
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
    if (settings) renderSettingsEnhancement(plugin, settings, doc);
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
  createSettingsButton,
  findSettingsContainer,
  installLearningControls,
  learningControlsCss,
  renderImmersiveStatus,
  renderSettingsEnhancement,
  safePluginId,
  showCourseManagementMenu,
  statusText,
  updateSettingsStatus
};
