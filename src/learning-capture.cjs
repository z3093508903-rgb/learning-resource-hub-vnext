'use strict';

const { Notice, requestUrl } = require('obsidian');
const { clipboard } = require('electron');
const { resolveActiveMediaSession } = require('./media-session.cjs');
const {
  registerRememberedNoteTarget,
  resolveRememberedNoteTarget
} = require('./note-target.cjs');
const { requestNativePotPlayer } = require('./native-potplayer.cjs');
const { requestPotPlayerBridge } = require('./potplayer-bridge.cjs');
const { currentProductSettings, normalizeCaptureFolder } = require('./product-settings.cjs');
const { updateResumePosition } = require('./resource-resolver.cjs');
const {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown,
  captureFileName
} = require('./resource-note.cjs');

const CAPTURE_FOLDER = 'GoStudy/Captures';

function activeEditor(plugin, preferredEditor = null) {
  if (preferredEditor && typeof preferredEditor.replaceSelection === 'function') return preferredEditor;
  return resolveRememberedNoteTarget(plugin).editor;
}

function resolveLearningContext(plugin, playerMedia) {
  return resolveActiveMediaSession(
    plugin.state,
    plugin.activeMediaSession,
    playerMedia,
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

async function requestLearningPlayer(plugin, action, options = {}) {
  if (typeof options.bridgeRequest === 'function') {
    return options.bridgeRequest(options.requestUrl || requestUrl, action, options.bridgeOptions || {});
  }

  let nativeError = null;
  if (options.native !== false && (process.platform === 'win32' || options.nativeOptions?.allowNonWindows)) {
    try {
      return await (options.nativeRequest || requestNativePotPlayer)(action, {
        ...(options.nativeOptions || {}),
        pause: Boolean(options.pause)
      });
    } catch (error) {
      nativeError = error;
      if (options.nativeOnly) throw error;
    }
  }

  try {
    return await requestPotPlayerBridge(options.requestUrl || requestUrl, action, options.bridgeOptions || {});
  } catch (bridgeError) {
    if (nativeError) {
      const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
      throw new Error(`Go Study 原生视频控制失败：${message}`);
    }
    throw bridgeError;
  }
}

async function prepareCurrentLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const response = await requestLearningPlayer(plugin, 'current', options);
  const context = resolveLearningContext(plugin, response.media);
  return { ...context, editor, player: response };
}

async function insertPreparedMarkdown(plugin, prepared, markdown) {
  if (!prepared?.editor || typeof prepared.editor.replaceSelection !== 'function') {
    throw new Error('最近的学习笔记已经关闭或不可编辑。');
  }
  prepared.editor.replaceSelection(markdown);
  await persistRecordedPosition(plugin, prepared.resource, prepared.position);
  return { ...prepared, markdown };
}

async function insertCurrentLearningPosition(plugin, options = {}) {
  const prepared = await prepareCurrentLearningPosition(plugin, options);
  return insertPreparedMarkdown(plugin, prepared, buildPositionMarkdown(prepared.resource, prepared.position));
}

async function ensureVaultFolder(vault, folderPath = CAPTURE_FOLDER) {
  if (!vault || typeof vault.getAbstractFileByPath !== 'function' || typeof vault.createFolder !== 'function') {
    throw new Error('当前 Vault 不支持创建截图目录。');
  }
  const safeFolder = normalizeCaptureFolder(folderPath);
  const parts = safeFolder.split('/').filter(Boolean);
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
  return safeFolder;
}

function capturePathCandidate(resource, position, index = 1, folderPath = CAPTURE_FOLDER) {
  const folder = normalizeCaptureFolder(folderPath);
  const base = captureFileName(resource, position, 'png');
  if (index <= 1) return `${folder}/${base}`;
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  return `${folder}/${stem}-${index}${ext}`;
}

function uniqueCapturePath(vault, resource, position, folderPath = CAPTURE_FOLDER) {
  for (let index = 1; index <= 999; index += 1) {
    const candidate = capturePathCandidate(resource, position, index, folderPath);
    if (!vault.getAbstractFileByPath(candidate)) return candidate;
  }
  throw new Error('同一位置的截图文件过多，无法生成唯一文件名。');
}

function clipboardPngBuffer(clipboardImpl = clipboard) {
  if (!clipboardImpl?.readImage) throw new Error('Electron 剪贴板图片接口不可用。');
  const image = clipboardImpl.readImage();
  if (!image || image.isEmpty?.()) throw new Error('播放器没有把有效截图写入剪贴板。');
  const png = image.toPNG?.();
  if (!png || !png.length) throw new Error('无法把播放器截图转换为 PNG。');
  return Buffer.from(png);
}

async function saveCaptureToVault(plugin, resource, position, pngBuffer) {
  const vault = plugin?.app?.vault;
  const folder = currentProductSettings(plugin).captureFolder;
  await ensureVaultFolder(vault, folder);
  const vaultPath = uniqueCapturePath(vault, resource, position, folder);
  if (typeof vault.createBinary !== 'function') throw new Error('当前 Vault 不支持写入二进制截图。');
  const bytes = Buffer.from(pngBuffer || []);
  if (!bytes.length) throw new Error('截图数据为空。');
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await vault.createBinary(vaultPath, arrayBuffer);
  return vaultPath;
}

async function prepareCaptureLearningPosition(plugin, options = {}) {
  const editor = activeEditor(plugin, options.editor);
  const response = await requestLearningPlayer(plugin, 'capture', options);
  const context = resolveLearningContext(plugin, response.media);
  const png = options.readClipboardPng ? options.readClipboardPng() : clipboardPngBuffer(options.clipboard || clipboard);
  return { ...context, editor, player: response, png };
}

async function commitPreparedCapture(plugin, prepared, markdownBuilder) {
  const vaultPath = await saveCaptureToVault(plugin, prepared.resource, prepared.position, prepared.png);
  const markdown = markdownBuilder(vaultPath);
  const result = await insertPreparedMarkdown(plugin, prepared, markdown);
  return { ...result, vaultPath };
}

async function captureFrameAndInsertLearningPosition(plugin, options = {}) {
  const prepared = await prepareCaptureLearningPosition(plugin, options);
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildCaptureMarkdown(prepared.resource, prepared.position, vaultPath)
  );
}

async function commitPreparedTypedNote(plugin, prepared, noteText) {
  return insertPreparedMarkdown(
    plugin,
    prepared,
    buildNotePositionMarkdown(prepared.resource, prepared.position, noteText)
  );
}

async function commitPreparedCaptureTypedNote(plugin, prepared, noteText) {
  return commitPreparedCapture(
    plugin,
    prepared,
    (vaultPath) => buildCaptureNoteMarkdown(prepared.resource, prepared.position, vaultPath, noteText)
  );
}

async function checkPotPlayerBridge(options = {}) {
  if (typeof options.bridgeRequest === 'function') {
    return options.bridgeRequest(options.requestUrl || requestUrl, 'ping', options.bridgeOptions || {});
  }
  if (options.native !== false && (process.platform === 'win32' || options.nativeOptions?.allowNonWindows)) {
    try { return await (options.nativeRequest || requestNativePotPlayer)('ping', options.nativeOptions || {}); }
    catch (error) { if (options.nativeOnly) throw error; }
  }
  return requestPotPlayerBridge(options.requestUrl || requestUrl, 'ping', options.bridgeOptions || {});
}

function commandErrorText(prefix, error) {
  return `${prefix}：${error instanceof Error ? error.message : String(error)}`;
}

function registerLearningCaptureCommands(plugin) {
  registerRememberedNoteTarget(plugin);

  plugin.addCommand({
    id: 'check-potplayer-bridge',
    name: '检查视频笔记增强状态',
    callback: () => {
      new Notice('正在检查视频笔记增强…', 1500);
      void checkPotPlayerBridge()
        .then((result) => new Notice(`视频笔记增强已连接 · ${result.transport || `协议 v${result.version}`}`))
        .catch((error) => new Notice(commandErrorText('视频笔记增强不可用', error), 6000));
    }
  });
  plugin.addCommand({
    id: 'insert-current-learning-position',
    name: '插入当前学习位置',
    callback: () => {
      new Notice('正在读取 PotPlayer 当前学习位置…', 1500);
      void insertCurrentLearningPosition(plugin)
        .then((result) => new Notice(`已记录：${result.resource.title} · ${result.markdown.match(/\d{2}:\d{2}(?::\d{2})?/)?.[0] || ''}`))
        .catch((error) => new Notice(commandErrorText('记录学习位置失败', error), 6000));
    }
  });
  plugin.addCommand({
    id: 'capture-frame-and-insert-learning-position',
    name: '截图并插入当前学习位置',
    callback: () => {
      new Notice('正在读取 PotPlayer 当前帧…', 1500);
      void captureFrameAndInsertLearningPosition(plugin)
        .then((result) => new Notice(`截图已保存：${result.vaultPath}`))
        .catch((error) => new Notice(commandErrorText('截图记录失败', error), 6000));
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
  commandErrorText,
  commitPreparedCapture,
  commitPreparedCaptureTypedNote,
  commitPreparedTypedNote,
  ensureVaultFolder,
  insertCurrentLearningPosition,
  insertPreparedMarkdown,
  persistRecordedPosition,
  prepareCaptureLearningPosition,
  prepareCurrentLearningPosition,
  registerLearningCaptureCommands,
  requestLearningPlayer,
  resolveLearningContext,
  saveCaptureToVault,
  uniqueCapturePath
};
