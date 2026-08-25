'use strict';

const { Notice } = require('obsidian');
const {
  captureFrameAndInsertLearningPosition,
  checkPotPlayerBridge,
  commandErrorText,
  insertCurrentLearningPosition
} = require('./learning-capture.cjs');
const {
  OpenListFolderRemapModal,
  OpenListResourceRelinkModal
} = require('./resource-relink-ui.cjs');

function safePluginId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('无法为学习控制条生成安全作用域。');
  return id;
}

function controlScope(pluginId) {
  return `.workspace-leaf-content[data-type="${safePluginId(pluginId)}-workbench"]`;
}

function learningControlsCss(pluginId) {
  const scope = controlScope(pluginId);
  return `${scope} .rh-next-learning-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  margin: 0 0 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background: var(--background-secondary);
}
${scope} .rh-next-learning-controls-status {
  min-width: 108px;
  justify-content: center;
}
${scope} .rh-next-learning-controls-status.is-connected {
  color: var(--text-success);
}
${scope} .rh-next-learning-controls-status.is-disconnected {
  color: var(--text-error);
}
${scope} .rh-next-learning-controls-spacer {
  flex: 1 1 12px;
}
${scope} .rh-next-learning-controls .rh-next-button {
  min-height: 30px;
  white-space: nowrap;
}
`;
}

function setStatus(button, text, state = '') {
  if (!button) return;
  button.textContent = text;
  button.classList.remove('is-connected', 'is-disconnected');
  if (state) button.classList.add(state);
}

async function refreshBridgeButton(button) {
  setStatus(button, 'Bridge 检查中…');
  try {
    const result = await checkPotPlayerBridge();
    setStatus(button, `● Bridge v${result.version}`, 'is-connected');
    return result;
  } catch (error) {
    setStatus(button, '○ Bridge 未连接', 'is-disconnected');
    button.title = commandErrorText('PotPlayer Bridge 不可用', error);
    return null;
  }
}

function createButton(doc, parent, text, title, handler, extraClass = '') {
  const button = doc.createElement('button');
  button.className = `rh-next-button ${extraClass}`.trim();
  button.type = 'button';
  button.textContent = text;
  button.title = title || text;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handler(button);
  });
  parent.appendChild(button);
  return button;
}

function renderLearningControls(plugin, root, doc = globalThis.document) {
  if (!root || root.querySelector?.('[data-go-study-learning-controls]')) return null;
  const header = root.querySelector?.('.rh-next-header');
  if (!header || !doc?.createElement) return null;

  const strip = doc.createElement('div');
  strip.className = 'rh-next-learning-controls';
  strip.setAttribute('data-go-study-learning-controls', 'true');

  const bridge = createButton(doc, strip, 'Bridge 检查中…', '检查 Go Study Companion / PotPlayer Bridge', async (button) => {
    const result = await refreshBridgeButton(button);
    if (result) new Notice(`PotPlayer Bridge 已连接 · 协议 v${result.version}`);
    else new Notice('PotPlayer Bridge 未连接。', 4000);
  }, 'rh-next-learning-controls-status');

  createButton(doc, strip, '记录位置', '把 PotPlayer 当前学习位置写入最近的 Markdown 笔记', async () => {
    new Notice('正在记录当前学习位置…', 1200);
    try {
      const result = await insertCurrentLearningPosition(plugin);
      new Notice(`已记录：${result.resource.title}`);
    } catch (error) {
      new Notice(commandErrorText('记录学习位置失败', error), 6000);
    }
  }, 'is-primary');

  createButton(doc, strip, '截图记录', '截图并把图片与永久回链写入最近的 Markdown 笔记', async () => {
    new Notice('正在截图并记录…', 1200);
    try {
      const result = await captureFrameAndInsertLearningPosition(plugin);
      new Notice(`截图已保存：${result.vaultPath}`);
    } catch (error) {
      new Notice(commandErrorText('截图记录失败', error), 6000);
    }
  });

  const spacer = doc.createElement('span');
  spacer.className = 'rh-next-learning-controls-spacer';
  strip.appendChild(spacer);

  createButton(doc, strip, '课程重关联', '整个 OpenList 课程目录移动或改名后使用', () => {
    new OpenListFolderRemapModal(plugin.app, plugin).open();
  });

  createButton(doc, strip, '单文件修复 · 高级', '只重新关联一个 OpenList 文件', () => {
    new OpenListResourceRelinkModal(plugin.app, plugin).open();
  });

  header.insertAdjacentElement('afterend', strip);
  void refreshBridgeButton(bridge);
  return strip;
}

function installLearningControls(plugin, doc = globalThis.document) {
  if (!plugin?.manifest?.id || !doc?.querySelectorAll || !doc?.createElement) return null;
  const scope = controlScope(plugin.manifest.id);
  const inject = () => {
    for (const leaf of doc.querySelectorAll(scope)) {
      const root = leaf.querySelector?.('.rh-next-workbench');
      if (root) renderLearningControls(plugin, root, doc);
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

  plugin.register?.(() => {
    observer?.disconnect?.();
    style.remove?.();
  });
  return { observer, style, inject };
}

module.exports = {
  controlScope,
  createButton,
  installLearningControls,
  learningControlsCss,
  refreshBridgeButton,
  renderLearningControls,
  safePluginId,
  setStatus
};
