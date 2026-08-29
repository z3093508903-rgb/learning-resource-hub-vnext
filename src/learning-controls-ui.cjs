'use strict';

const { Menu, Notice } = require('obsidian');
const { immersiveStatus } = require('./immersive-hotkeys.cjs');
const { currentProductSettings } = require('./product-settings.cjs');
const { bridgeStatus } = require('./bilibili-web-bridge.cjs');
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
${scope} .rh-next-immersive-status.has-web-listening,
${scope} .rh-next-immersive-status.has-web-connected { position: relative; }
${scope} .rh-next-immersive-status.has-web-listening::after,
${scope} .rh-next-immersive-status.has-web-connected::after {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-faint);
  box-shadow: 0 0 0 1px var(--background-primary);
}
${scope} .rh-next-immersive-status.has-web-connected::after {
  background: var(--text-success);
}
.go-study-settings-heading {
  margin-top: 1.6em;
  margin-bottom: .35em;
}
`;
}

function webBridgeStatusText(plugin) {
  const web = bridgeStatus(plugin);
  if (web.connected) return 'B站网页桥接已连接';
  if (web.listening) return 'B站网页桥接已启动 · 等待网页连接';
  if (web.error) return `B站网页桥接异常：${web.error}`;
  return 'B站网页桥接未启动';
}

function statusText(plugin) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return '视频笔记增强已关闭。';
  const status = immersiveStatus(plugin);
  const webText = webBridgeStatusText(plugin);
  if (status.registered) {
    const count = status.registeredAccelerators?.length || 0;
    return `视频笔记增强已就绪 · ${count || 4} 个全局快捷键 · ${webText}`;
  }
  return `${status.error || '视频笔记增强尚未就绪。'} · ${webText}`;
}

function renderImmersiveStatus(plugin, root, doc = globalThis.document) {
  const actions = root?.querySelector?.('.rh-next-header-actions');
  if (!actions) return null;
  const existing = actions.querySelector?.('[data-go-study-immersive-status]');
  if (!currentProductSettings(plugin).videoEnhancementEnabled) {
    existing?.remove?.();
    return null;
  }
  const status = immersiveStatus(plugin);
  const web = bridgeStatus(plugin);
  const webClass = web.connected ? 'has-web-connected' : web.listening ? 'has-web-listening' : '';
  if (existing) {
    existing.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : 'is-error'} ${webClass}`.trim();
    existing.textContent = status.registered ? '●' : '○';
    existing.title = statusText(plugin);
    existing.setAttribute('aria-label', statusText(plugin));
    existing.dataset.goStudyBilibiliStatus = web.connected ? 'connected' : web.listening ? 'listening' : 'off';
    return existing;
  }
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `rh-next-immersive-status ${status.registered ? 'is-ready' : 'is-error'} ${webClass}`.trim();
  button.setAttribute('data-go-study-immersive-status', 'true');
  button.dataset.goStudyBilibiliStatus = web.connected ? 'connected' : web.listening ? 'listening' : 'off';
  button.setAttribute('aria-label', statusText(plugin));
  button.title = statusText(plugin);
  button.textContent = status.registered ? '●' : '○';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
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
  doc.addEventListener?.('go-study-bilibili-bridge-status', statusListener);

  plugin.register?.(() => {
    observer?.disconnect?.();
    doc.removeEventListener?.('go-study-immersive-status', statusListener);
    doc.removeEventListener?.('go-study-bilibili-bridge-status', statusListener);
    style.remove?.();
  });
  return { observer, style, inject };
}

module.exports = {
  bindProjectCourseMenu,
  controlScope,
  installLearningControls,
  learningControlsCss,
  renderImmersiveStatus,
  safePluginId,
  showCourseManagementMenu,
  statusText,
  webBridgeStatusText
};
