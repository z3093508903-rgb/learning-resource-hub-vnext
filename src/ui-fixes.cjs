'use strict';

function safePluginId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('无法为当前插件生成安全的 UI 修复作用域。');
  return id;
}

function projectInteractionFixCss(pluginId) {
  const viewType = `${safePluginId(pluginId)}-workbench`;
  const scope = `.workspace-leaf-content[data-type="${viewType}"]`;
  return `${scope} .rh-next-project-heading {
  z-index: 4;
  pointer-events: auto;
}
${scope} .rh-next-project-board {
  z-index: 1;
  pointer-events: none;
}
${scope} .rh-next-project-board-item {
  pointer-events: auto;
}
${scope} .rh-next-project-board-slot {
  pointer-events: none;
}
${scope} .rh-next-project-board.is-layout-dragging .rh-next-project-board-slot {
  pointer-events: auto;
}
`;
}

function installScopedUiFixes(plugin, doc = globalThis.document) {
  if (!plugin?.manifest?.id || !doc?.createElement || !doc?.head?.appendChild) return null;
  const style = doc.createElement('style');
  style.setAttribute('data-go-study-ui-fixes', safePluginId(plugin.manifest.id));
  style.textContent = projectInteractionFixCss(plugin.manifest.id);
  doc.head.appendChild(style);
  plugin.register?.(() => style.remove());
  return style;
}

module.exports = {
  installScopedUiFixes,
  projectInteractionFixCss,
  safePluginId
};
