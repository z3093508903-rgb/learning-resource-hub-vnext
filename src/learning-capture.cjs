'use strict';

const { Notice, requestUrl } = require('obsidian');
const { clipboard } = require('electron');
const { resolveActiveMediaSession } = require('./media-session.cjs');
const { requestPotPlayerBridge } = require('./potplayer-bridge.cjs');
const { updateResumePosition } = require('./resource-resolver.cjs');
const {
  buildCaptureMarkdown,
  buildPositionMarkdown,
  captureFileName
} = require('./resource-note.cjs');

const CAPTURE_FOLDER = 'GoStudy/Captures';

function activeEditor(plugin, preferredEditor = null) {
  const editor = preferredEditor || plugin?.app?.workspace?.activeEditor?.editor;
  if (!editor || typeof editor.replaceSelection !== 'function') {
    throw new Error('请先把光标放到一个可编辑的 Markdown 笔记中。');
  }
  return editor;
}

function resolveLearningContext(plugin, bridgeMedia) {
  return resolveActiveMediaSession(
    plugin.state,
    plugin.activeMediaSession,
    bridgeMedia,
    (resource) => plugin.resourceActions(resource)
  );
}

async function persistRecordedPosition(plugin, resource, position) {
  updateResumePosition(plugin.state.resources[resource.id], position);
  plugin.activeMediaSession = {
    ...(plugin.activeMediaSession || {}),
    resourceId: resource.id,
    lastKnownPosition: { ...position },
    updatedAt: new Date().toISOString()
  };
  await plugin.persist();
  await plugin.workbenchLeaf?.view?.render?.();
}

async function insertCurrentLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const bridgeRequest = options.bridgeRequest || requestPotPlayerBridge;
  const response = await bridgeRequest(options.requestUrl || requestUrl, 'current', options.bridgeOptions || {});
  const context = resolveLearningContext(plugin, response.media);
  const markdown = buildPositionMarkdown(context.resource, context.position);
  editor.replaceSelection(markdown);
  await persistRecordedPosition(plugin, context.resource, context.position);
  return { ...context, markdown };
}

async function ensureVaultFolder(vault, folderPath = CAPTURE_FOLDER) {
  if (!vault || typeof vault.getAbstractFileByPath !== 'function' || typeof vault.createFolder !== 'function') {
    throw new Error('当前 Vault 不支持创建截图目录。');
  }
  const parts = String(folderPath || '').split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (vault.getAbstractFileByPath(current)) continue;
    try {
      await vault.createFolder(current);
    } catch (error) {
      if (!vault.getAbstractFileByPath(current)) throw error;
    }
  }
  return folderPath;
}

function capturePathCandidate(resource, position, index = 1) {
  const base = captureFileName(resource, position, 'png');
  if (index <= 1) return `${CAPTURE_FOLDER}/${base}`;
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  return `${CAPTURE_FOLDER}/${stem}-${index}${ext}`;
}

function uniqueCapturePath(vault, resource, position) {
  for (let index = 1; index <= 999; index += 1) {
    const candidate = capturePathCandidate(resource, position, index);
    if (!vault.getAbstractFileByPath(candidate)) return candidate;
  }
  throw new Error('同一位置的截图文件过多，无法生成唯一文件名。');
}

function clipboardPngBuffer() {
  if (!clipboard?.readImage) throw new Error('Electron 剪贴板图片接口不可用。');
  const image = clipboard.readImage();
  if (!image || image.isEmpty?.()) throw new Error('Bridge 没有把有效截图写入剪贴板。');
  const png = image.toPNG?.();
  if (!png || !png.length) throw new Error('无法把 Bridge 截图转换为 PNG。');
  return Buffer.from(png);
}

async function saveCaptureToVault(plugin, resource, position, pngBuffer) {
  const vault = plugin?.app?.vault;
  await ensureVaultFolder(vault);
  const vaultPath = uniqueCapturePath(vault, resource, position);
  if (typeof vault.createBinary !== 'function') throw new Error('当前 Vault 不支持写入二进制截图。');
  const bytes = Buffer.from(pngBuffer || []);
  if (!bytes.length) throw new Error('截图数据为空。');
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await vault.createBinary(vaultPath, arrayBuffer);
  return vaultPath;
}

async function captureFrameAndInsertLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const bridgeRequest = options.bridgeRequest || requestPotPlayerBridge;
  const response = await bridgeRequest(options.requestUrl || requestUrl, 'capture', options.bridgeOptions || {});
  const context = resolveLearningContext(plugin, response.media);
  const png = options.readClipboardPng ? options.readClipboardPng() : clipboardPngBuffer();
  const vaultPath = await saveCaptureToVault(plugin, context.resource, context.position, png);
  const markdown = buildCaptureMarkdown(context.resource, context.position, vaultPath);
  editor.replaceSelection(markdown);
  await persistRecordedPosition(plugin, context.resource, context.position);
  return { ...context, markdown, vaultPath };
}

async function checkPotPlayerBridge(options = {}) {
  const bridgeRequest = options.bridgeRequest || requestPotPlayerBridge;
  return bridgeRequest(options.requestUrl || requestUrl, 'ping', options.bridgeOptions || {});
}

function registerLearningCaptureCommands(plugin) {
  plugin.addCommand({
    id: 'check-potplayer-bridge',
    name: '检查 PotPlayer Bridge',
    callback: () => {
      void checkPotPlayerBridge()
        .then((result) => new Notice(`PotPlayer Bridge 已连接 · 协议 v${result.version}`))
        .catch((error) => new Notice(`PotPlayer Bridge 不可用：${error instanceof Error ? error.message : String(error)}`, 6000));
    }
  });
  plugin.addCommand({
    id: 'insert-current-learning-position',
    name: '插入当前学习位置',
    editorCallback: (editor) => {
      void insertCurrentLearningPosition(plugin, { editor })
        .then((result) => new Notice(`已记录：${result.resource.title} · ${result.markdown.match(/\d{2}:\d{2}(?::\d{2})?/)?.[0] || ''}`))
        .catch((error) => new Notice(`记录学习位置失败：${error instanceof Error ? error.message : String(error)}`, 6000));
    }
  });
  plugin.addCommand({
    id: 'capture-frame-and-insert-learning-position',
    name: '截图并插入当前学习位置',
    editorCallback: (editor) => {
      void captureFrameAndInsertLearningPosition(plugin, { editor })
        .then((result) => new Notice(`截图已保存：${result.vaultPath}`))
        .catch((error) => new Notice(`截图记录失败：${error instanceof Error ? error.message : String(error)}`, 6000));
    }
  });
}

module.exports = {
  CAPTURE_FOLDER,
  activeEditor,
  captureFrameAndInsertLearningPosition,
  capturePathCandidate,
  checkPotPlayerBridge,
  clipboardPngBuffer,
  ensureVaultFolder,
  insertCurrentLearningPosition,
  persistRecordedPosition,
  registerLearningCaptureCommands,
  resolveLearningContext,
  saveCaptureToVault,
  uniqueCapturePath
};
