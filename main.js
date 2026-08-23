'use strict';

const __rhModules = {
"anki-launch.cjs": (module, exports, require) => {
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PREFERRED_ANKI_SHORTCUT = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Anki\\Anki.lnk';

function cleanExecutablePath(value) {
  return String(value || '').trim().replace(/^"([\s\S]*)"$/, '$1');
}

function ankiExecutableCandidates(configured = '', env = process.env) {
  const localAppData = String(env.LOCALAPPDATA || '').trim();
  const programFiles = String(env.ProgramFiles || 'C:\\Program Files').trim();
  const programFilesX86 = String(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').trim();
  const installRoots = [
    localAppData ? path.join(localAppData, 'Programs', 'Anki') : '',
    programFiles ? path.join(programFiles, 'Anki') : '',
    programFilesX86 ? path.join(programFilesX86, 'Anki') : ''
  ].filter(Boolean);

  const candidates = [
    PREFERRED_ANKI_SHORTCUT,
    cleanExecutablePath(configured)
  ];
  for (const root of installRoots) {
    candidates.push(
      path.join(root, 'anki.exe'),
      path.join(root, 'launcher.exe'),
      path.join(root, 'anki-console.exe')
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

function resolveAnkiExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next known installation shape. */ }
  }
  return '';
}

function resolveAnkiProfileExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    if (!/\.exe$/i.test(candidate)) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next executable candidate. */ }
  }
  return '';
}

function launchAnkiProcess(executable, args = [], options = {}) {
  const spawnProcess = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch (error) {
      reject(new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      child?.removeListener?.('spawn', onSpawn);
      child?.removeListener?.('error', onError);
      callback(value);
    };
    const onSpawn = () => {
      child?.unref?.();
      finish(resolve, child);
    };
    const onError = (error) => finish(reject, new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));

    if (typeof child?.once === 'function') {
      child.once('spawn', onSpawn);
      child.once('error', onError);
    } else {
      child?.unref?.();
      finish(resolve, child);
    }
  });
}

module.exports = {
  PREFERRED_ANKI_SHORTCUT,
  ankiExecutableCandidates,
  cleanExecutablePath,
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
};

},
"entry.cjs": (module, exports, require) => {
'use strict';

const BaseResourceHubNextPlugin = __rhLoad("main.cjs");
const { shell } = require('electron');
const path = require('node:path');
const {
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = __rhLoad("anki-launch.cjs");
const { findOpenVaultLeaf } = __rhLoad("usage-polish.cjs");
const {
  DEFAULT_ANKI_ENDPOINT,
  DEFAULT_BACKUP_RETENTION,
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf
} = __rhLoad("release-hardening.cjs");

class ResourceHubNextPlugin extends BaseResourceHubNextPlugin {
  async onload() {
    this._vaultLifecycleReady = false;
    await super.onload();

    const activateVaultLifecycle = async () => {
      if (this._vaultLifecycleReady) return;
      this._vaultLifecycleReady = true;
      await super.validateVaultRefs();
    };

    if (typeof this.app.workspace?.onLayoutReady === 'function') {
      this.app.workspace.onLayoutReady(() => {
        void activateVaultLifecycle().catch((error) => console.error('Learning Resource Hub: vault validation failed after layout ready.', error));
      });
    } else {
      await activateVaultLifecycle();
    }
  }

  async validateVaultRefs() {
    if (this._vaultLifecycleReady === false) return false;
    return super.validateVaultRefs();
  }

  async handleVaultRename(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultRename(...args);
  }

  async handleVaultDelete(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultDelete(...args);
  }

  async handleVaultCreate(...args) {
    if (this._vaultLifecycleReady === false) return;
    return super.handleVaultCreate(...args);
  }

  async openWorkbench(options = {}) {
    const requestedRoute = options.route;
    const initialView = await super.openWorkbench(requestedRoute ? { ...options, route: '' } : options);
    const leaf = this.workbenchLeaf;
    const loadedView = await revealLoadedLeaf(this.app.workspace, leaf);
    if (requestedRoute && typeof loadedView?.navigate === 'function') {
      await loadedView.navigate(requestedRoute, options);
    }
    return loadedView || initialView;
  }

  async revealVaultEntry(entry) {
    const leaf = this.app.workspace.getLeavesOfType?.('file-explorer')?.[0];
    if (leaf) {
      const explorer = await revealLoadedLeaf(this.app.workspace, leaf);
      if (explorer?.revealInFolder) {
        await explorer.revealInFolder(entry);
        return true;
      }
    }
    return super.revealVaultEntry(entry);
  }

  async invokeAnki(action, params = {}) {
    const source = Object.values(this.state.sources || {})
      .find((item) => item.type === 'anki' && !item.deletedAt);
    const endpoint = normalizeAnkiEndpoint(source?.endpoint || DEFAULT_ANKI_ENDPOINT);
    if (source) {
      source.endpoint = endpoint;
      source.identity = endpoint.toLowerCase();
    }
    return super.invokeAnki(action, params);
  }

  async createStateBackup(label = 'manual') {
    const backupName = await super.createStateBackup(label);
    const backupDir = path.join(this.pluginStorageDir(), 'backups');
    try {
      pruneStateBackups(backupDir, DEFAULT_BACKUP_RETENTION);
    } catch (error) {
      console.warn('Learning Resource Hub: failed to prune old state backups.', error);
    }
    return backupName;
  }

  resolveAnkiExecutable(configured = '') {
    return resolveAnkiExecutable(configured);
  }

  async ensureAnkiRunning() {
    const source = Object.values(this.state.sources)
      .find((item) => item.type === 'anki' && !item.deletedAt) || {};
    const endpoint = normalizeAnkiEndpoint(source.endpoint || DEFAULT_ANKI_ENDPOINT);
    if (source.id) {
      source.endpoint = endpoint;
      source.identity = endpoint.toLowerCase();
    }

    try {
      await this.invokeAnki('version');
      return;
    } catch { /* Start Anki below. */ }
    const profile = String(source.profile || '').trim();
    const executable = profile
      ? resolveAnkiProfileExecutable(source.executablePath)
      : this.resolveAnkiExecutable(source.executablePath);
    if (!executable) {
      throw new Error(profile
        ? '已配置 Anki Profile，但没有找到支持 Profile 参数的 anki.exe / launcher.exe；请在来源连接中重新选择 Anki 程序。'
        : '没有找到可启动的 Anki 程序（anki.exe / launcher.exe / Anki.lnk）；请在来源连接中重新选择 Anki 程序。');
    }

    if (profile) await launchAnkiProcess(executable, ['-p', profile]);
    else {
      const openError = await shell.openPath(executable);
      if (openError) throw new Error(`Windows 无法打开 Anki：${openError}`);
    }

    const deadline = Date.now() + Math.max(5000, Number(source.startupTimeout || 30000));
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        await this.invokeAnki('version');
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const detail = lastError instanceof Error && lastError.message ? ` 最后一次连接错误：${lastError.message}` : '';
    throw new Error(`Anki 已尝试打开，但 AnkiConnect 未在等待时间内响应。请确认 AnkiConnect 已启用并监听当前配置地址。${detail}`);
  }

  async openVaultEntry(entry, options = {}) {
    if (!options.newLeaf) {
      const existingLeaf = findOpenVaultLeaf(this.app.workspace, entry?.path);
      if (existingLeaf) {
        await this.app.workspace.revealLeaf(existingLeaf);
        return;
      }
    }
    await super.openVaultEntry(entry, options);
  }
}

module.exports = ResourceHubNextPlugin;

},
"main.cjs": (module, exports, require) => {
'use strict';

const {
  ItemView,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab = class {},
  requestUrl,
  Setting = class {},
  setIcon
} = require('obsidian');
const electron = require('electron');
const { shell, webUtils } = electron;
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
let safeStorage = electron.safeStorage;
let dialog = electron.dialog || electron.remote?.dialog;
try {
  const remote = require('@electron/remote');
  safeStorage = safeStorage || remote.require('electron').safeStorage;
  dialog = dialog || remote.dialog;
} catch { /* Current Obsidian versions expose Electron directly. */ }
const model = __rhLoad("model.cjs");
const {
  clampMemoHeight,
  deleteMemoHeight,
  getMemoHeight,
  setMemoHeight
} = __rhLoad("usage-polish.cjs");

const VIEW_TYPE = 'learning-resource-hub-next-workbench';
const ROUTES = ['today', 'project', 'library', 'subscriptions'];

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function isClientBlockedError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /ERR_BLOCKED_BY_CLIENT/i.test(message);
}

function iconButton(parent, icon, label, handler, cls = '') {
  const button = parent.createEl('button', { cls: `rh-next-icon-button ${cls}`.trim(), attr: { 'aria-label': label, title: label } });
  setIcon(button, icon);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handler(event);
  });
  return button;
}

function textButton(parent, label, icon, handler, cls = '') {
  const button = parent.createEl('button', { cls: `rh-next-button ${cls}`.trim() });
  if (icon) setIcon(button.createSpan({ cls: 'rh-next-button-icon' }), icon);
  button.createSpan({ text: label });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handler(event);
  });
  return button;
}

function kindIcon(kind) {
  return ({ video: 'clapperboard', anki: 'layers-3', pdf: 'file-text', file: 'file', web: 'globe-2' })[kind] || 'link';
}

function kindLabel(kind) {
  return ({ video: '视频', anki: 'Anki', pdf: 'PDF', file: '文件', web: '网页' })[kind] || '资源';
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return '';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const rest = Math.floor(value % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
}

const OPENLIST_CATEGORY_LABELS = {
  video: '可播放视频', pdf: 'PDF', document: '文档', image: '图片', audio: '音频', other: '其他'
};

function openListEntryCategory(entry) {
  const extension = String(entry?.name || '').split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension)) return 'video';
  if (extension === 'pdf') return 'pdf';
  if (['epub', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'rtf'].includes(extension)) return 'document';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image';
  if (['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'opus'].includes(extension)) return 'audio';
  return 'other';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '大小未知';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function openListDescriptor(source, entry, rootPath = '/') {
  const category = openListEntryCategory(entry);
  const remotePath = model.normalizeOpenListPath(entry.remotePath || `${rootPath}/${entry.name}`);
  const video = category === 'video';
  return {
    kind: video ? 'video' : category === 'pdf' ? 'pdf' : 'file',
    title: String(entry.name || remotePath.split('/').pop() || remotePath).replace(/\.[^.]+$/, ''),
    canonicalKey: `openlist:${source.identity || source.id}:${remotePath.toLowerCase()}`,
    sourceId: source.id,
    launcher: { type: video ? 'openlist' : 'openlist-file', sourceId: source.id, remotePath },
    metadata: { remotePath, rootPath, size: entry.size || 0, modified: entry.modified || entry.updated_at || '', category }
  };
}

function biliVideoDescriptor(video) {
  const parsed = model.parseBiliVideoUrl(video.url);
  const bvid = String(video.bvid || parsed?.bvid || '').toUpperCase();
  const page = Number(video.page || parsed?.page || 1);
  return {
    kind: 'video', title: video.title || '未命名视频',
    canonicalKey: bvid ? `bili:${bvid}:p${page}` : `url:${String(video.url || '').toLowerCase()}`,
    sourceId: '', launcher: { type: 'potplayer', target: video.url },
    metadata: { bvid, page, originalUrl: video.url, sourceUrl: video.url, cover: video.cover || '' }
  };
}

function input(parent, options = {}) {
  const el = parent.createEl(options.multiline ? 'textarea' : 'input', {
    cls: options.cls || 'rh-next-input',
    attr: { placeholder: options.placeholder || '' }
  });
  if (!options.multiline) el.type = options.type || 'text';
  el.value = options.value || '';
  return el;
}

class ResourceHubNextPlugin extends Plugin {
  async onload() {
    this.state = model.normalizeState(await this.loadData());
    this.memoResizeBindings = new Set();
    this.workbenchLeaf = null;
    this.sidebarWasCollapsed = null;
    this.openListTokens = new Map();
    this.openListLoginTasks = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new ResourceHubNextView(leaf, this));
    this.registerHoverLinkSource?.(VIEW_TYPE, { display: 'Learning Resource Hub Next', defaultMod: true });
    this.addRibbonIcon('library-big', '打开学习资源工作台 Next', () => void this.openWorkbench());
    this.addCommand({ id: 'open-workbench', name: '打开工作台', callback: () => void this.openWorkbench() });
    this.addCommand({ id: 'quick-add', name: '添加资源', callback: () => void this.openAddModal() });
    this.addSettingTab?.(new ResourceHubNextSettingTab(this.app, this));
    this.addCommand({ id: 'link-current-file-to-project', name: '将当前文件关联到学习项目', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile?.();
      if (!file) return false;
      if (!checking) new ProjectLinkModal(this.app, this, file).open();
      return true;
    } });
    this.addCommand({ id: 'open-project-for-current-file', name: '打开当前文件关联的学习项目', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile?.();
      const projects = file ? this.projectsForVaultPath(file.path) : [];
      if (!projects.length) return false;
      if (!checking) {
        if (projects.length === 1) void this.openWorkbench({ route: 'project', projectId: projects[0].id });
        else new LinkedProjectPickerModal(this.app, this, projects).open();
      }
      return true;
    } });
    if (this.app.workspace?.on) this.registerEvent(this.app.workspace.on('file-menu', (menu, entry) => this.addVaultFileMenu(menu, entry)));
    if (this.app.vault?.on) {
      this.registerEvent(this.app.vault.on('rename', (entry, oldPath) => void this.handleVaultRename(entry, oldPath)));
      this.registerEvent(this.app.vault.on('delete', (entry) => void this.handleVaultDelete(entry)));
      this.registerEvent(this.app.vault.on('create', (entry) => void this.handleVaultCreate(entry)));
    }
    await this.validateVaultRefs();
  }

  async onunload() {
    try {
      await this.flushMemoHeights();
    } finally {
      for (const binding of this.memoResizeBindings || []) binding.observer?.disconnect?.();
      this.memoResizeBindings?.clear?.();
      this.unregisterHoverLinkSource?.(VIEW_TYPE);
      await this.restoreSidebar();
      this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    }
  }

  async persist() {
    await this.saveData(this.state);
  }

  bindMemoHeight(textarea, projectId, memoId) {
    if (!textarea || !projectId || !memoId || textarea.dataset.rhMemoHeightBound === 'true') return;
    this.cleanupMemoResizeBindings();
    const savedHeight = getMemoHeight(this.state, projectId, memoId);
    if (savedHeight) textarea.style.height = `${savedHeight}px`;
    const binding = {
      textarea,
      projectId,
      memoId,
      observer: null,
      lastHeight: clampMemoHeight(textarea.getBoundingClientRect?.().height || textarea.offsetHeight || savedHeight),
      dirty: false
    };
    const capture = () => this.captureMemoHeight(binding);
    if (typeof ResizeObserver === 'function') {
      binding.observer = new ResizeObserver(capture);
      binding.observer.observe(textarea);
    }
    const flush = () => void this.flushMemoHeights();
    textarea.dataset.rhMemoHeightBound = 'true';
    textarea.addEventListener('pointerup', flush);
    textarea.addEventListener('mouseup', flush);
    textarea.addEventListener('blur', flush);
    this.memoResizeBindings.add(binding);
  }

  captureMemoHeight(binding) {
    if (!binding?.textarea) return false;
    const height = clampMemoHeight(binding.textarea.isConnected
      ? binding.textarea.getBoundingClientRect?.().height || binding.textarea.offsetHeight
      : binding.lastHeight);
    if (!height || (binding.lastHeight && Math.abs(height - binding.lastHeight) < 2)) return false;
    binding.lastHeight = height;
    setMemoHeight(this.state, binding.projectId, binding.memoId, height);
    binding.dirty = true;
    return true;
  }

  cleanupMemoResizeBindings() {
    for (const binding of [...(this.memoResizeBindings || [])]) {
      if (binding.textarea?.isConnected || binding.dirty) continue;
      binding.observer?.disconnect?.();
      this.memoResizeBindings.delete(binding);
    }
  }

  async flushMemoHeights() {
    if (!this.memoResizeBindings?.size) return;
    let dirty = false;
    for (const binding of this.memoResizeBindings) {
      if (binding.textarea?.isConnected) this.captureMemoHeight(binding);
      if (binding.dirty) dirty = true;
    }
    if (!dirty) return this.cleanupMemoResizeBindings();
    await this.persist();
    for (const binding of this.memoResizeBindings) binding.dirty = false;
    this.cleanupMemoResizeBindings();
  }

  vaultEntry(pathValue) {
    const normalized = model.normalizeVaultPath(pathValue);
    return this.app.vault.getAbstractFileByPath?.(normalized) || null;
  }

  allVaultEntries() {
    return (this.app.vault.getAllLoadedFiles?.() || []).filter((entry) => entry?.path && entry.path !== '/');
  }

  projectsForVaultPath(pathValue) {
    const ref = Object.values(this.state.vaultRefs || {}).find((item) => !item.deletedAt && model.normalizeVaultPath(item.path) === model.normalizeVaultPath(pathValue));
    if (!ref) return [];
    return model.activeProjects(this.state).filter((project) => (project.vaultRefIds || []).includes(ref.id));
  }

  async validateVaultRefs() {
    let changed = false;
    for (const ref of Object.values(this.state.vaultRefs || {})) {
      const exists = Boolean(this.vaultEntry(ref.path));
      if (!exists && !ref.missingAt) { model.markVaultRefMissing(this.state, ref.id); changed = true; }
      else if (exists && ref.missingAt) { model.restoreVaultRef(this.state, ref.id); changed = true; }
    }
    if (changed) await this.persist();
    return changed;
  }

  addVaultFileMenu(menu, entry) {
    if (!entry?.path) return;
    const projects = this.projectsForVaultPath(entry.path);
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(projects.length ? `管理学习项目关联（${projects.length}）` : '关联到学习项目…').setIcon('folder-symlink').onClick(() => new ProjectLinkModal(this.app, this, entry).open()));
    if (projects.length === 1) menu.addItem((item) => item.setTitle(`打开项目：${projects[0].title}`).setIcon('panel-top-open').onClick(() => void this.openWorkbench({ route: 'project', projectId: projects[0].id })));
    else if (projects.length > 1) menu.addItem((item) => item.setTitle('选择关联项目并打开…').setIcon('panel-top-open').onClick(() => new LinkedProjectPickerModal(this.app, this, projects).open()));
  }

  async handleVaultRename(entry, oldPath) {
    const oldNormalized = model.normalizeVaultPath(oldPath);
    const newNormalized = model.normalizeVaultPath(entry.path);
    const refs = Object.values(this.state.vaultRefs || {}).filter((item) => !item.deletedAt && (model.normalizeVaultPath(item.path) === oldNormalized || model.normalizeVaultPath(item.path).startsWith(`${oldNormalized}/`)));
    if (!refs.length) return;
    for (const ref of refs) {
      const current = model.normalizeVaultPath(ref.path);
      const nextPath = current === oldNormalized ? newNormalized : `${newNormalized}${current.slice(oldNormalized.length)}`;
      model.updateVaultRefPath(this.state, ref.id, nextPath);
    }
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  async handleVaultDelete(entry) {
    const deletedPath = model.normalizeVaultPath(entry.path);
    const refs = Object.values(this.state.vaultRefs || {}).filter((item) => !item.deletedAt && (model.normalizeVaultPath(item.path) === deletedPath || model.normalizeVaultPath(item.path).startsWith(`${deletedPath}/`)));
    if (!refs.length) return;
    for (const ref of refs) model.markVaultRefMissing(this.state, ref.id);
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  async handleVaultCreate(entry) {
    const createdPath = model.normalizeVaultPath(entry.path);
    const ref = Object.values(this.state.vaultRefs || {}).find((item) => item.missingAt && model.normalizeVaultPath(item.path) === createdPath);
    if (!ref) return;
    model.restoreVaultRef(this.state, ref.id);
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
  }

  vaultEntryType(entry) { return Array.isArray(entry?.children) ? 'folder' : 'file'; }

  vaultFileKind(entry) {
    if (this.vaultEntryType(entry) === 'folder') return 'folder';
    const extension = String(entry?.extension || entry?.path?.split('.').pop() || '').toLowerCase();
    if (extension === 'md') return /\.excalidraw\.md$/i.test(entry.path) ? 'plugin-file' : 'markdown';
    if (extension === 'canvas') return 'canvas';
    if (extension === 'base') return 'base';
    if (extension === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
    return 'other';
  }

  async openVaultRef(ref, options = {}) {
    const entry = this.vaultEntry(ref.path);
    if (!entry) {
      model.markVaultRefMissing(this.state, ref.id);
      await this.persist();
      new Notice('这个项目文件已移动或删除，请重新关联。', 5000);
      return false;
    }
    if (this.vaultEntryType(entry) === 'folder') {
      new VaultFolderBrowserModal(this.app, this, entry, ref).open();
      return true;
    }
    await this.openVaultEntry(entry, options);
    return true;
  }

  async openVaultEntry(entry, options = {}) {
    const leaf = this.app.workspace.getLeaf(options.newLeaf ? 'tab' : false);
    await leaf.openFile(entry, { active: true });
  }

  async revealVaultEntry(entry) {
    const explorer = this.app.workspace.getLeavesOfType?.('file-explorer')?.[0]?.view;
    if (explorer?.revealInFolder) {
      await explorer.revealInFolder(entry);
      return true;
    }
    new Notice('请先打开 Obsidian 文件列表，再尝试定位。');
    return false;
  }

  async createVaultProjectFile(projectId, kind) {
    new VaultFolderPickerModal(this.app, this, async (folderPath) => {
      const label = kind === 'canvas' ? '新建 Canvas' : '新建笔记';
      new TextPromptModal(this.app, label, kind === 'canvas' ? 'Canvas 名称' : '笔记名称', async (title) => {
        try {
          const extension = kind === 'canvas' ? '.canvas' : '.md';
          const baseName = safeText(title).replace(/[\\/:*?"<>|]/g, '-');
          const prefix = folderPath ? `${folderPath}/` : '';
          let candidate = `${prefix}${baseName}${extension}`;
          let suffix = 2;
          while (this.vaultEntry(candidate)) candidate = `${prefix}${baseName} ${suffix++}${extension}`;
          const content = kind === 'canvas' ? JSON.stringify({ nodes: [], edges: [] }, null, 2) : `# ${baseName}\n`;
          const file = await this.app.vault.create(candidate, content);
          const result = model.upsertVaultRef(this.state, { path: file.path, entryType: 'file', fileKind: kind === 'canvas' ? 'canvas' : 'markdown' });
          model.linkVaultRefToProject(this.state, projectId, result.vaultRef.id);
          model.recordRecentVaultCreatePath(this.state, folderPath || '');
          await this.persist();
          await this.workbenchLeaf?.view?.render?.();
          await this.openVaultRef(result.vaultRef);
        } catch (error) { new Notice(`创建失败：${error.message || String(error)}`, 6000); }
      }).open();
    }).open();
  }

  pluginStorageDir() {
    const basePath = this.app?.vault?.adapter?.getBasePath?.();
    if (!basePath) throw new Error('当前仓库不支持本地备份。');
    const configDir = this.app?.vault?.configDir || '.obsidian';
    const fallback = path.join(basePath, configDir, 'plugins', this.manifest?.id || 'learning-resource-hub-next');
    const manifestDir = String(this.manifest?.dir || '').trim();
    if (!manifestDir) return fallback;
    const candidate = path.isAbsolute(manifestDir) ? manifestDir : path.join(basePath, manifestDir);
    return fs.existsSync(candidate) ? candidate : fallback;
  }

  async createStateBackup(label = 'manual') {
    const safeLabel = String(label || 'manual').replace(/[^a-z0-9_-]+/gi, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `state-${timestamp}-${safeLabel}.json`;
    const backupDir = path.join(this.pluginStorageDir(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(this.state), 'utf8');
    return backupName;
  }

  async restoreStateBackup(backupName) {
    const safeName = path.basename(String(backupName || ''));
    if (!safeName) throw new Error('找不到清理前备份。');
    const backupPath = path.join(this.pluginStorageDir(), 'backups', safeName);
    if (!fs.existsSync(backupPath)) throw new Error('清理前备份已经不存在。');
    const restored = model.normalizeState(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
    restored.uiState.lastAction = null;
    this.state = restored;
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return restored;
  }

  async mutate(callback, { render = true } = {}) {
    const result = await callback(this.state);
    await this.persist();
    if (render) await this.workbenchLeaf?.view?.render?.();
    return result;
  }

  async openWorkbench(options = {}) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.workbenchLeaf = leaf;
    await this.collapseSidebar();
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ResourceHubNextView && options.route) await view.navigate(options.route, options);
    return view;
  }

  async undoLastAction() {
    const action = this.state.uiState.lastAction;
    if (action?.type === 'cleanup-resources' && action.backupName) {
      await this.restoreStateBackup(action.backupName);
      new Notice(`已撤回：${action.label || '资源清理'}，资源索引已从备份恢复。`, 6000);
      return;
    }
    const result = await this.mutate((state) => model.undoLastAction(state), { render: false });
    if (!result.undone) return new Notice('没有可以撤回的操作。');
    new Notice(`已撤回：${result.action.label || '上一步添加'}${result.removedResourceIds.length ? `，并清理 ${result.removedResourceIds.length} 条新建资源` : ''}`);
    await this.workbenchLeaf?.view?.render?.();
  }

  async collapseSidebar() {
    const split = this.app.workspace.leftSplit;
    if (!split || this.sidebarWasCollapsed !== null) return;
    this.sidebarWasCollapsed = Boolean(split.collapsed);
    if (!split.collapsed) await this.app.commands.executeCommandById('app:toggle-left-sidebar');
  }

  async restoreSidebar() {
    const split = this.app.workspace.leftSplit;
    if (!split || this.sidebarWasCollapsed === null) return;
    if (!this.sidebarWasCollapsed && split.collapsed) await this.app.commands.executeCommandById('app:toggle-left-sidebar');
    this.sidebarWasCollapsed = null;
  }

  async toggleSidebar() {
    await this.app.commands.executeCommandById('app:toggle-left-sidebar');
  }

  openAddModal(context = {}) {
    new UnifiedAddModal(this.app, this, context).open();
  }

  findOpenListSource(input) {
    const baseUrl = typeof input === 'string' ? input : input?.baseUrl;
    if (!baseUrl) return null;
    let normalized;
    try { normalized = model.normalizeOpenListBaseUrl(baseUrl); } catch { return null; }
    return Object.values(this.state.sources).find((source) => {
      if (source.type !== 'openlist' || source.deletedAt) return false;
      try { return model.normalizeOpenListBaseUrl(source.baseUrl) === normalized; } catch { return false; }
    }) || null;
  }

  toPotPlayerUri(target, time = '00:00:00') {
    return `jv://open?path=${encodeURIComponent(String(target || '').trim())}&time=${encodeURIComponent(time)}`;
  }

  resourceActions(resource) {
    return model.resolveResourceActions(resource, this.state.sources);
  }

  async markResourceStarted(resource) {
    if (!resource?.id || !this.state.resources[resource.id]) return;
    await this.mutate((state) => {
      model.markResourceOpened(state, resource.id);
      model.markResourceComplete(state, resource.id);
    }, { render: false });
  }

  async tryOpenInObsidian(target) {
    const registry = this.app?.viewRegistry;
    if (!registry?.getViewCreatorByType?.('webviewer')) return false;
    try {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: 'webviewer', active: true, state: { url: target } });
      this.app.workspace.revealLeaf(leaf);
      return true;
    } catch { return false; }
  }

  async openWebTarget(target, preference = '') {
    const safeTarget = model.validateExternalUri(target, ['https:', 'http:']);
    const mode = preference || this.state.uiState.webOpenPreference || 'system';
    if (mode === 'obsidian') {
      if (await this.tryOpenInObsidian(safeTarget)) return;
      new Notice('当前 Obsidian 未提供可用的内置网页浏览器，已回退系统浏览器。', 5000);
    }
    await shell.openExternal(safeTarget);
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    if (!resource || !target) return false;
    try {
      new Notice(`正在启动：${resource.title}`);
      if (actionType === 'web') {
        await this.openWebTarget(String(target), options.webPreference || '');
      } else if (target.type === 'file') {
        const error = await shell.openPath(target.path);
        if (error) throw new Error(error);
      } else if (target.type === 'anki') {
        await this.ensureAnkiRunning();
        await this.invokeAnki('guiDeckReview', { name: target.deck });
      } else if (target.type === 'openlist') {
        const source = this.state.sources[target.sourceId] || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(this.toPotPlayerUri(`${baseUrl}/d${encoded}${sign}`));
      } else if (target.type === 'openlist-file') {
        const source = this.state.sources[target.sourceId] || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(`${baseUrl}/d${encoded}${sign}`);
      } else if (target.type === 'potplayer') {
        await shell.openExternal(this.toPotPlayerUri(target.target));
      } else if (target.type === 'uri') {
        const legacyBili = model.parseBiliVideoUrl(target.uri);
        const legacyOpenListFolder = model.parseOpenListUrl(target.uri, Object.values(this.state.sources));
        if (legacyBili) await shell.openExternal(this.toPotPlayerUri(legacyBili.canonicalUrl));
        else if (legacyOpenListFolder) {
          new Notice('检测到旧版 OpenList 目录条目，请重新导入为可播放的视频合集。', 5000);
          this.openAddModal({ mode: 'source', sourceType: 'openlist', openListInput: target.uri, projectId: this.state.uiState.currentProjectId || '' });
          return false;
        } else await shell.openExternal(model.validateExternalUri(target.uri, ['https:', 'http:', 'jv:']));
      } else throw new Error('没有可用的启动地址。');
      await this.markResourceStarted(resource);
      new Notice(`已启动并默认完成：${resource.title}`);
      await this.workbenchLeaf?.view?.render?.();
      return true;
    } catch (error) {
      new Notice(`启动失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResource(resource) {
    const actions = this.resourceActions(resource);
    if (actions.playTarget) return this.openResourceAction(resource, 'play', actions.playTarget);
    if (actions.webTarget) return this.openResourceAction(resource, 'web', actions.webTarget);
    if (actions.defaultTarget) return this.openResourceAction(resource, 'default', actions.defaultTarget);
    new Notice('没有可用的启动地址。');
    return false;
  }

  showWebOpenMenu(event, resource, target) {
    const menu = new Menu();
    const current = this.state.uiState.webOpenPreference || 'system';
    menu.addItem((item) => item.setTitle(`系统浏览器${current === 'system' ? '（默认）' : ''}`).setIcon('external-link').onClick(() => void this.openResourceAction(resource, 'web', target, { webPreference: 'system' })));
    menu.addItem((item) => item.setTitle(`Obsidian 内置浏览器${current === 'obsidian' ? '（默认）' : ''}`).setIcon('panel-top-open').onClick(() => void this.openResourceAction(resource, 'web', target, { webPreference: 'obsidian' })));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('记住：系统浏览器').setIcon('check').onClick(async () => {
      this.state.uiState.webOpenPreference = 'system'; await this.persist(); new Notice('已把系统浏览器设为网页默认方式。');
    }));
    menu.addItem((item) => item.setTitle('记住：Obsidian 内置浏览器').setIcon('check').onClick(async () => {
      this.state.uiState.webOpenPreference = 'obsidian'; await this.persist(); new Notice('已把 Obsidian 内置浏览器设为网页默认方式。');
    }));
    menu.showAtMouseEvent(event);
  }

  encryptSecret(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('当前系统无法使用安全存储。');
    return safeStorage.encryptString(text).toString('base64');
  }

  decryptSecret(value) {
    if (!value) return '';
    if (!safeStorage?.isEncryptionAvailable?.()) return '';
    try { return safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { return ''; }
  }

  async invokeAnki(action, params = {}) {
    const source = Object.values(this.state.sources).find((item) => item.type === 'anki' && !item.deletedAt);
    const endpoint = source?.endpoint || 'http://127.0.0.1:8765';
    const response = await requestUrl({
      url: endpoint,
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ action, version: 6, params })
    });
    const payload = response.json;
    if (payload?.error) throw new Error(payload.error);
    return payload?.result;
  }

  resolveAnkiExecutable(configured = '') {
    const candidates = [
      configured,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Anki', 'anki.exe') : '',
      'C:\\Program Files\\Anki\\anki.exe',
      'C:\\Program Files (x86)\\Anki\\anki.exe'
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
  }

  async ensureAnkiRunning() {
    try { await this.invokeAnki('version'); return; } catch { /* start Anki below */ }
    const source = Object.values(this.state.sources).find((item) => item.type === 'anki' && !item.deletedAt) || {};
    const executable = this.resolveAnkiExecutable(source.executablePath);
    if (!executable) throw new Error('Anki 未启动，也没有找到 anki.exe；请先在来源连接中配置。');
    const args = source.profile ? ['-p', source.profile] : [];
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    const deadline = Date.now() + Math.max(5000, Number(source.startupTimeout || 30000));
    while (Date.now() < deadline) {
      try { await this.invokeAnki('version'); return; } catch { await new Promise((resolve) => window.setTimeout(resolve, 500)); }
    }
    throw new Error('Anki 已尝试启动，但 AnkiConnect 未在等待时间内响应。');
  }

  async loginOpenList(source) {
    const cached = this.openListTokens.get(source?.id);
    if (cached) return cached;
    const password = this.decryptSecret(source.encryptedPassword);
    if (!source.username || !password) return '';
    if (this.openListLoginTasks.has(source.id)) return this.openListLoginTasks.get(source.id);
    const task = this.withTimeout((async () => {
      const response = await requestUrl({
        url: `${String(source.baseUrl).replace(/\/+$/, '')}/api/auth/login`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ username: source.username, password }),
        throw: false
      });
      const payload = response.json;
      if (response.status >= 400 || payload?.code !== 200 || !payload?.data?.token) throw new Error(payload?.message || `OpenList 登录失败（HTTP ${response.status}）。`);
      this.openListTokens.set(source.id, payload.data.token);
      return payload.data.token;
    })(), 15000, 'OpenList 登录超过 15 秒，请检查服务是否在线。');
    this.openListLoginTasks.set(source.id, task);
    try { return await task; } finally { this.openListLoginTasks.delete(source.id); }
  }

  async withTimeout(promise, timeoutMs, message) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async requestOpenList(source, endpoint, body, token = '') {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = token;
    const invoke = (authHeaders) => this.withTimeout(requestUrl({
      url: `${String(source.baseUrl).replace(/\/+$/, '')}${endpoint}`,
      method: 'POST', headers: authHeaders,
      body: JSON.stringify(body),
      throw: false
    }), 15000, `OpenList 请求超过 15 秒：${body?.path || endpoint}`);
    let response = await invoke(headers);
    if ((response.status === 401 || Number(response.json?.code) === 401) && source.username) {
      this.openListTokens.delete(source.id);
      const freshToken = await this.loginOpenList(source);
      response = await invoke({ ...headers, Authorization: freshToken });
    }
    const payload = response.json;
    const code = Number(payload?.code || response.status);
    if (response.status >= 400 || code < 200 || code >= 300) throw new Error(payload?.message || `OpenList 请求失败（HTTP ${response.status}）。`);
    return payload?.data || {};
  }

  async listOpenList(source, remotePath, token, refresh = false) {
    const content = [];
    let page = 1;
    let total = 0;
    do {
      const data = await this.requestOpenList(source, '/api/fs/list', { path: remotePath, password: '', refresh: Boolean(refresh && page === 1), page, per_page: 200 }, token);
      const rows = Array.isArray(data?.content) ? data.content : [];
      content.push(...rows);
      total = Number(data?.total || content.length);
      page += 1;
      if (!rows.length) break;
    } while (content.length < total && page <= 10000);
    return content;
  }

  async getOpenList(source, remotePath, token) {
    return this.requestOpenList(source, '/api/fs/get', { path: remotePath, password: '' }, token);
  }

  async resolveOpenListPath(source, parsed) {
    if (!parsed?.isShare) return parsed?.rootPath || '/';
    const token = await this.loginOpenList(source);
    const headers = token ? { Authorization: token } : {};
    const response = await this.withTimeout(requestUrl({
      url: `${String(source.baseUrl).replace(/\/+$/, '')}/api/share/get?id=${encodeURIComponent(parsed.shareId)}`,
      method: 'GET', headers, throw: false
    }), 15000, '解析 OpenList 分享链接超时。');
    const payload = response.json;
    if (response.status >= 400 || Number(payload?.code || response.status) !== 200) throw new Error(payload?.message || '无法解析 OpenList 分享链接，请改用普通目录链接。');
    const directPath = payload?.data?.path;
    if (directPath) return model.normalizeOpenListPath(`${directPath}/${parsed.sharePath || ''}`);
    const files = Array.isArray(payload?.data?.files) ? payload.data.files : [];
    if (files.length !== 1) throw new Error('分享链接无法还原为唯一目录，请改用普通 OpenList 目录链接。');
    return model.normalizeOpenListPath(`${files[0]}/${parsed.sharePath || ''}`);
  }

  async scanOpenList(source, rootPath, options = {}) {
    if (typeof options === 'boolean') options = { refresh: options };
    const token = await this.loginOpenList(source);
    const results = [];
    const failures = [];
    const visited = new Set();
    const queue = [model.normalizeOpenListPath(rootPath || '/')];
    const videoExt = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts']);
    const maxDirectories = Math.max(1, Number(options.maxDirectories || 5000));
    const maxFiles = Math.max(1, Number(options.maxFiles || 20000));
    while (queue.length) {
      if (options.isCancelled?.()) throw new Error('扫描已取消。');
      const batch = queue.splice(0, Math.max(1, Math.min(6, Number(options.concurrency || 4))));
      const listings = await Promise.all(batch.map(async (current) => {
        if (options.isCancelled?.()) return null;
        if (visited.has(current)) return null;
        visited.add(current);
        try { return { current, entries: await this.listOpenList(source, current, token, Boolean(options.refresh && visited.size === 1)) }; }
        catch (error) { failures.push({ path: current, error }); return null; }
      }));
      for (const listing of listings.filter(Boolean)) {
        for (const entry of listing.entries) {
          if (options.isCancelled?.()) throw new Error('扫描已取消。');
          const fullPath = model.normalizeOpenListPath(`${listing.current}/${entry.name}`);
          if (entry.is_dir) {
            if (visited.size + queue.length < maxDirectories) queue.push(fullPath);
            else failures.push({ path: fullPath, error: new Error(`目录数量超过 ${maxDirectories} 个。`) });
            continue;
          }
          const ext = entry.name.split('.').pop()?.toLowerCase();
          const accepted = options.acceptEntry ? options.acceptEntry({ ...entry, remotePath: fullPath }) : videoExt.has(ext);
          if (accepted) {
            if (results.length >= maxFiles) throw new Error(`文件数量超过 ${maxFiles} 个，请选择更小的目录后重试。`);
            results.push({ ...entry, remotePath: fullPath });
          }
        }
        options.onProgress?.({ path: listing.current, found: results.length, directories: visited.size });
      }
    }
    if (!results.length && failures.length) throw failures[0].error;
    results.sort((left, right) => String(left.remotePath).localeCompare(String(right.remotePath), 'zh-CN', { numeric: true }));
    results.failures = failures;
    results.scannedDirectories = visited.size;
    return results;
  }

  async scanLocalFolder(rootPath, options = {}) {
    const results = [];
    const failures = [];
    const allowed = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts', 'pdf', 'epub', 'doc', 'docx', 'ppt', 'pptx']);
    const resolvedRoot = path.resolve(rootPath);
    const stat = await fs.promises.stat(resolvedRoot);
    if (!stat.isDirectory()) throw new Error('选择的路径不是文件夹。');
    const queue = [resolvedRoot];
    const maxDirectories = Math.max(1, Number(options.maxDirectories || 5000));
    const maxFiles = Math.max(1, Number(options.maxFiles || 20000));
    let scannedDirectories = 0;
    let ignoredCount = 0;
    while (queue.length) {
      if (options.isCancelled?.()) throw new Error('扫描已取消。');
      const current = queue.shift();
      if (scannedDirectories >= maxDirectories) throw new Error(`目录数量超过 ${maxDirectories} 个，请选择更小的文件夹后重试。`);
      let entries;
      try { entries = await fs.promises.readdir(current, { withFileTypes: true }); }
      catch (error) { failures.push({ path: current, error }); continue; }
      scannedDirectories += 1;
      for (const entry of entries) {
        if (options.isCancelled?.()) throw new Error('扫描已取消。');
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (scannedDirectories + queue.length >= maxDirectories) throw new Error(`目录数量超过 ${maxDirectories} 个，请选择更小的文件夹后重试。`);
          queue.push(fullPath);
        }
        else if (entry.isFile() && allowed.has(entry.name.split('.').pop()?.toLowerCase())) {
          if (results.length >= maxFiles) throw new Error(`文件数量超过 ${maxFiles} 个，请选择更小的文件夹后重试。`);
          results.push(fullPath);
        }
        else if (entry.isFile()) ignoredCount += 1;
      }
      options.onProgress?.({ path: current, found: results.length, directories: scannedDirectories, failures: failures.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    results.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    results.failures = failures;
    results.scannedDirectories = scannedDirectories;
    results.ignoredCount = ignoredCount;
    return results;
  }

  async requestBiliDataViaNode(url, headers, redirectCount = 0) {
    if (redirectCount > 3) throw new Error('B站备用请求重定向次数过多。');
    const requestTarget = new URL(url);
    if (requestTarget.protocol !== 'https:' || !(requestTarget.hostname === 'bilibili.com' || requestTarget.hostname.endsWith('.bilibili.com'))) {
      throw new Error('B站备用请求拒绝了非 Bilibili HTTPS 地址。');
    }
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers }, (response) => {
        const status = Number(response.statusCode || 0);
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          resolve(this.requestBiliDataViaNode(nextUrl, headers, redirectCount + 1));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > 5 * 1024 * 1024) {
            response.destroy(new Error('B站备用请求响应超过 5 MB。'));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on('error', (error) => reject(new Error(`B站备用请求失败：${error.message || String(error)}`)));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status, json: JSON.parse(body) }); }
          catch { reject(new Error(`B站备用请求返回了无法解析的数据（HTTP ${status}）。`)); }
        });
      });
      request.setTimeout(15000, () => request.destroy(new Error('B站备用请求超过 15 秒。')));
      request.on('error', (error) => reject(new Error(`B站备用请求失败：${error.message || String(error)}`)));
    });
  }

  async requestBiliData(url, source = {}) {
    const headers = {
      Referer: source.mid ? `https://space.bilibili.com/${encodeURIComponent(source.mid)}/` : 'https://www.bilibili.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    let response;
    try {
      response = await requestUrl({ url, method: 'GET', headers, throw: false });
    } catch (error) {
      if (!isClientBlockedError(error)) throw error;
      response = await this.requestBiliDataViaNode(url, headers);
    }
    const payload = response.json;
    if (response.status >= 400) throw new Error(`B站请求失败：HTTP ${response.status}`);
    if (payload?.code !== 0) throw new Error(`B站接口 ${payload?.code ?? '未知'}：${payload?.message || '请求失败'}`);
    return payload?.data;
  }

  async fetchBiliVideo(bvid) {
    const [view, parts] = await Promise.all([
      this.requestBiliData(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`),
      this.requestBiliData(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`)
    ]);
    const list = Array.isArray(parts) ? parts : [];
    const items = list.length <= 1
      ? [{ title: String(view?.title || bvid), url: `https://www.bilibili.com/video/${bvid}`, page: 1, duration: Number(view?.duration || 0) }]
      : list.map((part) => ({ title: String(part.part || `${view?.title || bvid} P${part.page}`), url: `https://www.bilibili.com/video/${bvid}?p=${part.page}`, page: Number(part.page || 1), duration: Number(part.duration || 0) }));
    const season = view?.ugc_season;
    const collectionItems = [];
    for (const section of season?.sections || []) {
      for (const episode of section.episodes || []) {
        const episodeBvid = String(episode.bvid || episode.arc?.bvid || '');
        if (!episodeBvid) continue;
        collectionItems.push({
          bvid: episodeBvid,
          title: String(episode.title || episode.arc?.title || episodeBvid),
          url: `https://www.bilibili.com/video/${episodeBvid}`,
          cover: String(episode.arc?.pic || episode.cover || ''),
          duration: Number(episode.arc?.duration || episode.duration || 0),
          page: 1
        });
      }
    }
    const uniqueCollection = [...new Map(collectionItems.map((item) => [item.bvid.toUpperCase(), item])).values()];
    return {
      title: String(view?.title || bvid), owner: String(view?.owner?.name || ''), cover: String(view?.pic || ''),
      description: String(view?.desc || ''), items,
      collection: season ? { id: String(season.id || ''), title: String(season.title || '所属合集'), items: uniqueCollection } : null
    };
  }

  async searchBiliUsers(keyword) {
    const query = safeText(keyword);
    if (!query) return [];
    const data = await this.requestBiliData(`https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(query)}&page=1`);
    return model.normalizeBiliUserSearchResults(data).slice(0, 20);
  }

  async fetchBiliCollections(source) {
    const result = [];
    let page = 1;
    let seen = 0;
    let total = 0;
    do {
      const data = await this.requestBiliData(`https://api.bilibili.com/x/polymer/web-space/seasons_series_list?mid=${encodeURIComponent(source.mid)}&page_num=${page}&page_size=20`, source);
      const seasons = data?.items_lists?.seasons_list || [];
      const series = data?.items_lists?.series_list || [];
      for (const entry of seasons) {
        const meta = entry.meta || {};
        if (Number(meta.total || 0) > 0) result.push({ type: 'season', id: String(meta.season_id), name: String(meta.name || '未命名合集'), total: Number(meta.total || 0), cover: String(meta.cover || meta.cover_url || '') });
      }
      for (const entry of series) {
        const meta = entry.meta || {};
        if (Number(meta.total || 0) > 0) result.push({ type: 'series', id: String(meta.series_id), name: String(meta.name || '未命名系列'), total: Number(meta.total || 0), cover: String(meta.cover || meta.cover_url || '') });
      }
      seen += seasons.length + series.length;
      total = Number(data?.items_lists?.page?.total || 0);
      page += 1;
    } while (seen < total && page <= 20);
    return result;
  }

  async fetchBiliCollectionItems(source, collection) {
    const items = [];
    let page = 1;
    let total = 0;
    do {
      const url = collection.type === 'series'
        ? `https://api.bilibili.com/x/series/archives?mid=${encodeURIComponent(source.mid)}&series_id=${encodeURIComponent(collection.id)}&only_normal=true&sort=asc&pn=${page}&ps=30`
        : `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${encodeURIComponent(source.mid)}&season_id=${encodeURIComponent(collection.id)}&sort_reverse=false&page_num=${page}&page_size=30`;
      const data = await this.requestBiliData(url, source);
      for (const video of data?.archives || []) {
        if (!video?.bvid) continue;
        const cover = String(video.pic || video.cover || '');
        items.push({ bvid: String(video.bvid), title: String(video.title || '未命名视频'), cover: cover.startsWith('//') ? `https:${cover}` : cover, url: `https://www.bilibili.com/video/${video.bvid}` });
      }
      total = Number(data?.page?.total || 0);
      page += 1;
    } while (items.length < total && page <= 100);
    return items;
  }

  async fetchBiliRecentVideos(source) {
    const data = await this.requestBiliData(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${encodeURIComponent(source.mid)}`, source);
    const result = [];
    for (const entry of data?.items || []) {
      const archive = entry?.modules?.module_dynamic?.major?.archive;
      if (!archive?.bvid) continue;
      const cover = String(archive.cover || '');
      result.push({
        bvid: String(archive.bvid),
        title: String(archive.title || '未命名视频'),
        cover: cover.startsWith('//') ? `https:${cover}` : cover,
        publishedAt: Number(entry?.modules?.module_author?.pub_ts || 0) * 1000,
        url: `https://www.bilibili.com/video/${archive.bvid}`
      });
    }
    return result.slice(0, 24);
  }

  async fetchBiliCollectionPreviewVideos(source, collections, limit = 24) {
    const byBvid = new Map();
    for (const collection of (collections || []).slice(0, 8)) {
      if (byBvid.size >= limit) break;
      const url = collection.type === 'series'
        ? `https://api.bilibili.com/x/series/archives?mid=${encodeURIComponent(source.mid)}&series_id=${encodeURIComponent(collection.id)}&only_normal=true&sort=desc&pn=1&ps=30`
        : `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${encodeURIComponent(source.mid)}&season_id=${encodeURIComponent(collection.id)}&sort_reverse=true&page_num=1&page_size=30`;
      const data = await this.requestBiliData(url, source);
      for (const video of data?.archives || []) {
        if (!video?.bvid || byBvid.has(String(video.bvid))) continue;
        const cover = String(video.pic || video.cover || '');
        byBvid.set(String(video.bvid), {
          bvid: String(video.bvid), title: String(video.title || '未命名视频'),
          cover: cover.startsWith('//') ? `https:${cover}` : cover,
          publishedAt: Number(video.pubdate || video.created || 0) * 1000,
          url: `https://www.bilibili.com/video/${video.bvid}`
        });
        if (byBvid.size >= limit) break;
      }
    }
    return [...byBvid.values()];
  }

  async refreshBiliProfile(source) {
    const errors = [];
    let succeeded = 0;
    try {
      const profile = await this.requestBiliData(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(source.mid)}`, source);
      const card = profile?.card || {};
      Object.assign(source, {
        alias: String(card.name || source.alias || `UP ${source.mid}`),
        avatar: String(card.face || source.avatar || ''),
        description: String(card.sign || source.description || ''),
        followers: Number(profile?.follower || source.followers || 0),
        profileUpdatedAt: new Date().toISOString()
      });
      succeeded += 1;
    } catch (error) { errors.push(`主页：${error.message || String(error)}`); }
    try { source.collections = await this.fetchBiliCollections(source); succeeded += 1; }
    catch (error) { errors.push(`合集：${error.message || String(error)}`); }
    try {
      let recent;
      try {
        recent = await this.fetchBiliRecentVideos(source);
        source.recentSyncMode = '动态投稿';
      } catch (error) {
        recent = await this.fetchBiliCollectionPreviewVideos(source, source.collections, 24);
        source.recentSyncMode = '合集补全';
        if (!recent.length) throw error;
      }
      if (recent.length) source.recentVideos = recent;
      succeeded += 1;
    } catch (error) { errors.push(`投稿：${error.message || String(error)}`); }
    source.lastSyncAt = new Date().toISOString();
    source.lastError = errors.join('；');
    await this.persist();
    if (!succeeded) throw new Error(source.lastError || 'B站主页资料读取失败。');
    return source;
  }
}

class ResourceHubNextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: '学习资源工作台' });
    new Setting(this.containerEl)
      .setName('显示辅助说明')
      .setDesc('显示页面副标题和卡片中的解释文字；进度、状态、错误和操作文字不会隐藏。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.state.uiState.showInterfaceTips !== false)
        .onChange(async (value) => {
          this.plugin.state.uiState.showInterfaceTips = value;
          await this.plugin.persist();
          await this.plugin.workbenchLeaf?.view?.render?.();
        }));
  }
}

class ResourceHubNextView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.route = plugin.state.uiState.route || 'today';
    this.currentProjectId = plugin.state.uiState.currentProjectId || '';
    this.drawerModuleId = '';
    this.rendering = false;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() {
    const labels = { today: '今日', project: '项目', library: '资料库', subscriptions: '订阅' };
    return `学习资源工作台 - ${labels[this.route] || '今日'}`;
  }
  getIcon() { return 'library-big'; }

  async onOpen() {
    this.plugin.workbenchLeaf = this.leaf;
    await this.plugin.collapseSidebar();
    await this.render();
  }

  async onClose() {
    await this.flushProjectMemo?.();
    this.projectBoardResizeObserver?.disconnect();
    this.projectBoardResizeObserver = null;
    this.saveScroll();
    this.contentEl.empty();
    if (this.plugin.workbenchLeaf === this.leaf) this.plugin.workbenchLeaf = null;
    await this.plugin.restoreSidebar();
  }

  routeKey() {
    return this.route === 'project' ? `project:${this.currentProjectId || 'none'}` : this.route;
  }

  saveScroll() {
    const scroller = this.contentEl.querySelector('.rh-next-workbench');
    if (scroller) this.plugin.state.uiState.scrollPositions[this.routeKey()] = scroller.scrollTop;
  }

  async navigate(route, options = {}) {
    this.saveScroll();
    this.route = ROUTES.includes(route) ? route : 'today';
    if (options.projectId !== undefined) this.currentProjectId = options.projectId || '';
    this.plugin.state.uiState.route = this.route;
    this.plugin.state.uiState.currentProjectId = this.currentProjectId;
    await this.plugin.persist();
    await this.render();
  }

  async render() {
    if (this.rendering) return;
    this.rendering = true;
    try {
      const flushMemo = this.flushProjectMemo;
      this.flushProjectMemo = null;
      await flushMemo?.();
      const state = this.plugin.state;
      const projects = model.activeProjects(state);
      if (!this.currentProjectId || !state.projects[this.currentProjectId]) this.currentProjectId = projects[0]?.id || '';
      state.uiState.currentProjectId = this.currentProjectId;
      this.projectBoardResizeObserver?.disconnect();
      this.projectBoardResizeObserver = null;
      this.contentEl.empty();
      this.contentEl.addClass('rh-next-view-host');
      const root = this.contentEl.createDiv({ cls: 'rh-next-workbench' });
      root.toggleClass('is-hiding-interface-tips', state.uiState.showInterfaceTips === false);
      this.renderHeader(root);
      const main = root.createDiv({ cls: 'rh-next-page' });
      if (this.route === 'project') this.renderProject(main, projects);
      else if (this.route === 'library') this.renderLibrary(main);
      else if (this.route === 'subscriptions') this.renderSubscriptions(main);
      else this.renderToday(main, projects);
      this.renderSidebarRestore(root);
      if (this.drawerModuleId && state.modules[this.drawerModuleId]) this.renderDrawer(root, this.drawerModuleId);
      const restore = Number(state.uiState.scrollPositions[this.routeKey()] || 0);
      requestAnimationFrame(() => { root.scrollTop = restore; });
      this.leaf.updateHeader?.();
    } finally {
      this.rendering = false;
    }
  }

  renderHeader(root) {
    const header = root.createDiv({ cls: 'rh-next-header' });
    const brand = header.createDiv({ cls: 'rh-next-brand' });
    const logo = brand.createDiv({ cls: 'rh-next-logo' });
    setIcon(logo, 'library-big');
    const brandText = brand.createDiv();
    brandText.createEl('strong', { text: '学习资源管理站' });
    brandText.createEl('small', { text: '收集、编排与启动中心' });
    const nav = header.createDiv({ cls: 'rh-next-nav' });
    for (const [route, label, icon] of [['today', '今日', 'sun'], ['project', '项目', 'folder-kanban'], ['library', '资料库', 'library'], ['subscriptions', '订阅', 'rss']]) {
      textButton(nav, label, icon, () => this.navigate(route), this.route === route ? 'is-active' : '');
    }
    const actions = header.createDiv({ cls: 'rh-next-header-actions' });
    const lastAction = this.plugin.state.uiState.lastAction;
    if (lastAction) iconButton(actions, 'undo-2', `撤回：${lastAction.label || '上一步添加'}`, () => this.plugin.undoLastAction(), 'is-subtle');
    iconButton(actions, 'search', '搜索资源', () => this.openSearch());
    textButton(actions, '添加', 'plus', () => this.plugin.openAddModal({ projectId: this.currentProjectId }), 'is-primary');
  }

  renderSidebarRestore(root) {
    const button = root.createEl('button', { cls: 'rh-next-sidebar-restore', attr: { title: '显示或隐藏 Obsidian 侧栏', 'aria-label': '显示或隐藏 Obsidian 侧栏' } });
    setIcon(button, 'panel-left');
    button.addEventListener('click', () => void this.plugin.toggleSidebar());
  }

  renderToday(main, projects) {
    const state = this.plugin.state;
    const hero = main.createDiv({ cls: 'rh-next-page-heading' });
    const title = hero.createDiv();
    title.createEl('h1', { text: '今天，从这里开始' });
    title.createEl('p', { cls: 'rh-next-interface-tip', text: '只显示今天要执行的计划；项目负责收集，今日负责行动。' });
    textButton(hero, '添加学习计划', 'plus', () => this.plugin.openAddModal({ mode: 'plan', projectId: this.currentProjectId }), 'is-primary');

    const layout = main.createDiv({ cls: 'rh-next-today-layout' });
    const taskArea = layout.createDiv({ cls: 'rh-next-task-area' });
    const activePlans = Object.values(state.plans).filter((plan) => !plan.archivedAt && !plan.deletedAt && model.planScheduledFor(plan));
    if (!activePlans.length) this.renderEmpty(taskArea, 'calendar-plus', '还没有今日计划', '在项目里将模块或资源加入学习计划。', '前往项目', () => this.navigate('project'));
    for (const project of model.todayProjects(state)) {
      const plans = model.projectPlans(state, project.id).filter((plan) => model.planScheduledFor(plan));
      if (!plans.length) continue;
      const collapsed = Boolean(state.uiState.collapsedTodayProjects[project.id]);
      const group = taskArea.createDiv({ cls: `rh-next-task-group ${collapsed ? 'is-collapsed' : ''}`, attr: { 'data-today-order-kind': 'project', 'data-today-order-key': project.id } });
      const progress = plans.map((plan) => model.planProgress(plan));
      const done = progress.filter((item) => item.done).length;
      const groupHead = group.createDiv({ cls: 'rh-next-task-group-head' });
      const left = groupHead.createDiv({ cls: 'rh-next-task-group-title' });
      const drag = left.createSpan({ cls: 'rh-next-today-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${project.title}顺序`, 'aria-label': `拖动调整${project.title}顺序` } });
      setIcon(drag, 'grip-vertical');
      const chevron = left.createSpan();
      setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
      left.createEl('strong', { text: project.title });
      left.createSpan({ text: `${done}/${plans.length}` });
      const next = plans.find((plan) => !model.planProgress(plan).done) || plans[0];
      groupHead.createEl('small', { text: next ? `下一项：${next.title}` : '今日已完成' });
      groupHead.addEventListener('click', async () => {
        state.uiState.collapsedTodayProjects[project.id] = !collapsed;
        await this.plugin.persist();
        await this.render();
      });
      this.attachTodayReorder(group, drag, 'project', project.id);
      if (!collapsed) {
        const body = group.createDiv({ cls: 'rh-next-task-list' });
        for (const plan of plans) this.renderPlanRow(body, plan, { projectContext: project });
      }
    }
    this.renderTodaySidebar(layout.createDiv({ cls: 'rh-next-action-sidebar' }), projects, activePlans);
  }

  renderTodaySidebar(sidebar, projects, plans) {
    const state = this.plugin.state;
    const unfinished = plans.find((plan) => !model.planProgress(plan).done);
    const recent = [...state.activity].reverse().find((entry) => entry.type === 'resource-opened');
    const recentResource = recent ? state.resources[recent.resourceId] : null;
    const done = plans.filter((plan) => model.planProgress(plan).done).length;
    const renderers = {
      current: () => {
        const card = this.createTodaySideCard(sidebar, 'current', '当前任务', 'is-accent');
        card.createEl('h3', { text: unfinished?.title || recentResource?.title || '今天尚未开始' });
        card.createEl('p', { cls: recentResource ? '' : 'rh-next-interface-tip', text: recentResource ? `上次打开：${recentResource.title}` : '从一个明确的动作开始，不必整理全部资料。' });
        if (recentResource) textButton(card, '继续学习', 'play', () => this.plugin.openResource(recentResource), 'is-primary');
        else if (unfinished) textButton(card, '查看任务', 'arrow-right', () => this.focusPlan(unfinished.id));
      },
      progress: () => {
        const card = this.createTodaySideCard(sidebar, 'progress', '今日进度');
        const metrics = card.createDiv({ cls: 'rh-next-metrics' });
        for (const [value, label] of [[new Set(plans.map((plan) => plan.projectId)).size, '项目'], [plans.length, '任务'], [done, '完成']]) {
          const item = metrics.createDiv(); item.createEl('strong', { text: String(value) }); item.createEl('small', { text: label });
        }
      },
      inbox: () => {
        const card = this.createTodaySideCard(sidebar, 'inbox', '待利用资源');
        card.createEl('h3', { text: `${state.inbox.length} 条在收件箱` });
        card.createEl('p', { cls: 'rh-next-interface-tip', text: '加入项目后才进入长期组织，不强迫每次收集都立即分类。' });
        textButton(card, '整理收件箱', 'inbox', () => this.navigate('library', { libraryPage: 'inbox' }));
      },
      memo: () => {
        const card = this.createTodaySideCard(sidebar, 'memo', '今日便签', 'rh-next-sticky');
        const textarea = input(card, { multiline: true, placeholder: '写一条临时备注，不进入任务系统……', value: state.notes.today?.text || '' });
        textarea.addEventListener('change', async () => {
          state.notes.today = { id: 'today', text: textarea.value, updatedAt: new Date().toISOString() };
          await this.plugin.persist();
        });
      }
    };
    for (const cardId of state.uiState.todaySidebarOrder) renderers[cardId]?.();
  }

  createTodaySideCard(sidebar, cardId, label, cls = '') {
    const card = sidebar.createDiv({ cls: `rh-next-side-card ${cls}`.trim(), attr: { 'data-today-order-kind': 'sidebar', 'data-today-order-key': cardId } });
    const head = card.createDiv({ cls: 'rh-next-side-card-head' });
    const drag = head.createSpan({ cls: 'rh-next-today-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${label}顺序`, 'aria-label': `拖动调整${label}顺序` } });
    setIcon(drag, 'grip-vertical');
    head.createEl(cardId === 'progress' ? 'h3' : 'small', { text: label });
    this.attachTodayReorder(card, drag, 'sidebar', cardId);
    return card;
  }

  attachTodayReorder(element, handle, kind, key) {
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      this.draggedTodayOrder = { kind, key };
      event.dataTransfer?.setData('text/plain', `${kind}:${key}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      element.addClass('is-dragging');
    });
    handle.addEventListener('dragend', () => {
      this.draggedTodayOrder = null;
      element.removeClass('is-dragging');
      this.contentEl.querySelectorAll('.is-today-drag-target').forEach((target) => target.removeClass('is-today-drag-target'));
    });
    element.addEventListener('dragover', (event) => {
      if (!this.draggedTodayOrder || this.draggedTodayOrder.kind !== kind || this.draggedTodayOrder.key === key) return;
      event.preventDefault();
      element.addClass('is-today-drag-target');
    });
    element.addEventListener('dragleave', () => element.removeClass('is-today-drag-target'));
    element.addEventListener('drop', async (event) => {
      const source = this.draggedTodayOrder;
      if (!source || source.kind !== kind || source.key === key) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      this.draggedTodayOrder = null;
      element.removeClass('is-today-drag-target');
      await this.moveTodayOrder(kind, source.key, key, { after });
    });
    handle.addEventListener('keydown', async (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const order = kind === 'project'
        ? model.todayProjects(this.plugin.state).filter((project) => model.projectPlans(this.plugin.state, project.id).some((plan) => model.planScheduledFor(plan))).map((project) => project.id)
        : this.plugin.state.uiState.todaySidebarOrder;
      const index = order.indexOf(key);
      const adjacent = event.key === 'ArrowUp' ? order[index - 1] : order[index + 1];
      if (!adjacent) return;
      event.preventDefault(); event.stopPropagation();
      await this.moveTodayOrder(kind, key, adjacent, { focus: true, after: event.key === 'ArrowDown' });
    });
  }

  async moveTodayOrder(kind, sourceKey, targetKey, options = {}) {
    if (kind === 'project') model.moveTodayProjectBefore(this.plugin.state, sourceKey, targetKey, { after: options.after });
    else model.moveTodaySidebarCardBefore(this.plugin.state, sourceKey, targetKey, { after: options.after });
    await this.plugin.persist();
    await this.render();
    const focusKey = options.focusKey || sourceKey;
    if (options.focus) requestAnimationFrame(() => this.contentEl.querySelector(`[data-today-order-kind="${kind}"][data-today-order-key="${CSS.escape(focusKey)}"] .rh-next-today-drag`)?.focus());
  }

  renderPlanRow(parent, plan, options = {}) {
    const progress = model.planProgress(plan);
    const row = parent.createDiv({ cls: `rh-next-plan-row ${progress.done ? 'is-done' : ''}`, attr: { 'data-plan-id': plan.id } });
    const button = row.createEl('button', { cls: 'rh-next-plan-check', attr: { title: progress.done ? '减少一次' : '确认完成一次' } });
    setIcon(button, progress.done ? 'circle-check-big' : 'circle');
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.mutate((state) => model.incrementPlan(state, plan.id, progress.done ? -1 : 1));
    });
    const icon = row.createDiv({ cls: 'rh-next-plan-icon' });
    setIcon(icon, plan.targetType === 'module' ? 'blocks' : 'link');
    const text = row.createDiv({ cls: 'rh-next-plan-copy' });
    text.createEl('strong', { text: plan.title });
    text.createEl('small', { text: `今日进度 ${progress.completed}/${progress.target} · ${this.scheduleLabel(plan)}` });
    const bar = row.createDiv({ cls: 'rh-next-progress' });
    bar.createDiv({ cls: 'rh-next-progress-fill', attr: { style: `width:${Math.min(100, progress.completed / progress.target * 100)}%` } });
    iconButton(row, 'chevron-right', '打开学习内容', () => this.openPlanTarget(plan));
  }

  scheduleLabel(plan) {
    const weekdays = Array.isArray(plan.schedule?.weekdays) ? plan.schedule.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 0];
    const ordered = [1, 2, 3, 4, 5, 6, 0];
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const dayText = weekdays.length === 7 ? '每天' : ordered.map((day, index) => weekdays.includes(day) ? labels[index] : '').filter(Boolean).join('、');
    return `${dayText || '未选择刷新日'} · ${String(Number(plan.resetHour ?? 4)).padStart(2, '0')}:00 刷新`;
  }

  focusPlan(planId) {
    const target = this.contentEl.querySelector(`[data-plan-id="${CSS.escape(planId)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('is-highlighted');
    window.setTimeout(() => target?.classList.remove('is-highlighted'), 1200);
  }

  openPlanTarget(plan) {
    const targetId = plan.targetIds?.[0];
    if (plan.targetType === 'module') {
      this.drawerModuleId = targetId;
      void this.render();
      return;
    }
    const resource = this.plugin.state.resources[targetId];
    if (resource) void this.plugin.openResource(resource);
  }

  renderProject(main, projects) {
    const state = this.plugin.state;
    main.addClass('rh-next-project-page');
    const project = state.projects[this.currentProjectId] || projects[0] || null;
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv();
    const pageTitle = copy.createEl('h1', { text: project?.title || '项目', attr: project ? { title: '双击重命名项目' } : {} });
    if (project) pageTitle.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameProjectInline(pageTitle, project); });
    copy.createEl('p', { cls: 'rh-next-interface-tip', text: '学习模块、项目文件、待办和便签共享同一块可调整工作台。' });
    textButton(heading, '新建项目', 'folder-plus', () => this.promptProject(), 'is-primary');
    if (!projects.length) {
      this.renderEmpty(main, 'folder-plus', '还没有项目', '创建第一个项目，再从收件箱或链接添加资源。', '新建项目', () => this.promptProject());
      return;
    }
    const switcher = main.createDiv({ cls: 'rh-next-project-switcher' });
    for (const project of projects) textButton(switcher, project.title, 'folder', () => this.navigate('project', { projectId: project.id }), project.id === this.currentProjectId ? 'is-active' : '');
    const layout = main.createDiv({ cls: 'rh-next-project-layout' });
    const title = layout.createDiv({ cls: 'rh-next-section-heading rh-next-project-heading' });
    const titleCopy = title.createDiv();
    titleCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '双击模块名可改名；右键模块可加入待办任务。' });
    const titleActions = title.createDiv({ cls: 'rh-next-section-actions' });
    textButton(titleActions, '新建模块', 'blocks', () => this.promptModule(project.id));
    textButton(titleActions, '添加内容', 'plus', () => this.plugin.openAddModal({ projectId: project.id }), 'is-primary');
    iconButton(title, 'more-horizontal', '项目操作', (event) => {
      const menu = new Menu();
      menu.addItem((item) => item.setTitle('重命名项目').setIcon('pencil').onClick(() => void this.renameProjectInline(pageTitle, project)));
      const archivedModuleCount = Object.values(state.modules).filter((module) => module.projectId === project.id && module.archivedAt && !module.deletedAt).length;
      menu.addItem((item) => item.setTitle(`已归档模块${archivedModuleCount ? `（${archivedModuleCount}）` : ''}`).setIcon('archive-restore').onClick(() => new ArchivedModulesModal(this.app, this.plugin, project.id).open()));
      menu.addItem((item) => item.setTitle('恢复默认布局').setIcon('layout-grid').onClick(async () => {
        await this.resetProjectBoardLayout(project.id);
      }));
      menu.addItem((item) => item.setTitle('新建便签').setIcon('sticky-note').onClick(() => void this.createProjectMemoCard(project.id)));
      menu.addItem((item) => item.setTitle('归档项目').setIcon('archive').onClick(async () => {
        await this.plugin.mutate((next) => model.archiveProject(next, project.id), { render: false });
        this.currentProjectId = model.activeProjects(this.plugin.state)[0]?.id || '';
        await this.navigate('project', { projectId: this.currentProjectId });
      }));
      menu.addSeparator();
      menu.addItem((item) => item.setTitle('永久删除项目').setIcon('trash-2').onClick(() => {
        new ConfirmActionModal(this.app, {
          title: `永久删除“${project.title}”？`,
          message: '项目、学习模块和相关计划会被删除。你可以同时清理删除后不再被任何项目、计划或收件箱引用的资源。',
          checkboxLabel: '同时删除仅属于此项目的孤立资源',
          checkboxDefault: true,
          confirmLabel: '永久删除',
          onConfirm: async ({ checked }) => {
            const result = await this.plugin.mutate((next) => model.deleteProject(next, project.id, { deleteOrphans: checked }), { render: false });
            if (result.removedResourceIds.length) new Notice(`已同步清理 ${result.removedResourceIds.length} 条孤立资源。`);
            this.currentProjectId = model.activeProjects(this.plugin.state)[0]?.id || '';
            await this.navigate(this.currentProjectId ? 'project' : 'today', { projectId: this.currentProjectId });
          }
        }).open();
      }));
      menu.showAtMouseEvent(event);
    });
    const modules = model.projectModules(state, project.id);
    const board = layout.createDiv({ cls: 'rh-next-project-board', attr: { 'aria-label': `${project.title} 项目布局` } });
    const boardItems = model.projectBoardItems(state, project.id);
    const boardItemByKey = new Map(boardItems.map((item) => [item.key, item]));
    const mediumOrder = new Map([
      ...boardItems.filter((item) => item.kind === 'module').sort((left, right) => left.row - right.row || left.column - right.column).map((item) => item.key),
      ...boardItems.filter((item) => item.kind !== 'module').sort((left, right) => left.row - right.row || left.column - right.column).map((item) => item.key)
    ].map((key, index) => [key, index + 1]));
    for (const module of modules) {
      const item = boardItemByKey.get(`module:${module.id}`);
      if (item) this.renderModuleCard(board, module, { projectBoardItem: item, mediumOrder: mediumOrder.get(item.key) });
    }
    this.renderProjectUtilities(board, project, boardItemByKey, mediumOrder);
    this.renderProjectMemos(board, project, boardItemByKey, mediumOrder);
    this.renderProjectBoardDropSlots(board, project, boardItems);
    this.observeProjectBoard(board);
  }

  renderProjectUtilities(parent, project, boardItemByKey, mediumOrder) {
    const order = ['files', 'tasks'];
    const labels = { tasks: ['待办任务', 'list-todo'], files: ['项目文件', 'files'], memo: ['便签备注', 'sticky-note'] };
    for (const panelType of order) {
      const boardItem = boardItemByKey.get(`utility:${panelType}`);
      if (!boardItem) continue;
      const [label, icon] = labels[panelType] || labels.tasks;
      const collapsed = Boolean(this.plugin.state.uiState.projectPanelCollapsedByProject?.[project.id]?.[panelType]);
      const panel = parent.createDiv({ cls: `rh-next-utility-panel rh-next-project-board-item ${collapsed ? 'is-collapsed' : ''}`, attr: { 'data-panel-type': panelType } });
      this.setProjectBoardItemPosition(panel, boardItem, mediumOrder.get(boardItem.key));
      const head = panel.createDiv({ cls: 'rh-next-utility-panel-head' });
      const drag = head.createSpan({ cls: 'rh-next-utility-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整${label}位置`, 'aria-label': `拖动调整${label}位置` } }); setIcon(drag, 'grip-vertical');
      const title = head.createDiv({ cls: 'rh-next-utility-title' }); setIcon(title.createSpan(), icon); title.createEl('strong', { text: label });
      const summary = this.projectPanelSummary(panelType, project); if (summary) title.createEl('small', { text: summary });
      iconButton(head, 'plus', panelType === 'tasks' ? '添加待办' : panelType === 'files' ? '添加项目文件' : '新建便签', (event) => this.addProjectUtilityItem(event, panelType, project));
      iconButton(head, collapsed ? 'chevron-down' : 'chevron-up', collapsed ? `展开${label}` : `折叠${label}`, async () => {
        model.setProjectPanelCollapsed(this.plugin.state, project.id, panelType, !collapsed); await this.plugin.persist(); await this.render();
      });
      this.attachProjectBoardDrag(panel, drag, project, boardItem);
      if (collapsed) continue;
      const body = panel.createDiv({ cls: 'rh-next-utility-panel-body' });
      if (panelType === 'files') this.renderProjectFiles(body, project);
      else this.renderProjectPlanStack(body, project, { compact: true });
    }
  }

  setProjectBoardItemPosition(element, item, mediumOrder = 1) {
    element.dataset.boardKey = item.key;
    element.dataset.boardColumn = String(item.column);
    element.dataset.boardRow = String(item.row);
    element.style.setProperty('--rh-board-column', String(item.column));
    element.style.setProperty('--rh-board-medium-order', String(mediumOrder || 1));
  }

  attachProjectBoardDrag(element, handle, project, item) {
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      this.draggedProjectBoardKey = item.key;
      this.draggedProjectBoardKind = item.kind;
      this.suppressProjectBoardClickUntil = Date.now() + 400;
      event.dataTransfer?.setData('text/plain', item.key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      element.addClass('is-dragging');
      const board = element.closest('.rh-next-project-board');
      board?.addClass('is-layout-dragging');
      requestAnimationFrame(() => this.layoutProjectBoard(board));
    });
    handle.addEventListener('dragend', () => this.finishProjectBoardDrag(element));
    element.addEventListener('dragover', (event) => {
      if (!this.draggedProjectBoardKey || this.draggedProjectBoardKey === item.key) return;
      if ((this.draggedProjectBoardKind === 'memo') !== (item.kind === 'memo')) return;
      event.preventDefault();
      element.addClass('is-drag-target');
    });
    element.addEventListener('dragleave', () => element.removeClass('is-drag-target'));
    element.addEventListener('drop', async (event) => {
      if (!this.draggedProjectBoardKey || this.draggedProjectBoardKey === item.key) return;
      if ((this.draggedProjectBoardKind === 'memo') !== (item.kind === 'memo')) return;
      event.preventDefault(); event.stopPropagation();
      element.removeClass('is-drag-target');
      const source = this.draggedProjectBoardKey;
      this.finishProjectBoardDrag(element);
      await this.moveProjectBoardItem(project.id, source, item.column, item.row, { side: item.side });
    });
  }

  finishProjectBoardDrag(element = null) {
    this.draggedProjectBoardKey = '';
    this.draggedProjectBoardKind = '';
    this.suppressProjectBoardClickUntil = Date.now() + 250;
    element?.removeClass('is-dragging');
    const board = element?.closest('.rh-next-project-board') || this.contentEl.querySelector('.rh-next-project-board');
    board?.removeClass('is-layout-dragging');
    board?.querySelectorAll('.is-drag-target').forEach((target) => target.removeClass('is-drag-target'));
    board?.querySelectorAll('.is-dragging').forEach((target) => target.removeClass('is-dragging'));
    requestAnimationFrame(() => this.layoutProjectBoard(board));
  }

  renderProjectBoardDropSlots(board, project, boardItems) {
    const occupied = new Set(boardItems.map((item) => `${item.column}:${item.row}`));
    const maxRow = Math.max(1, ...boardItems.map((item) => item.row));
    for (let row = 1; row <= maxRow + 1; row += 1) {
      for (let column = 1; column <= 4; column += 1) {
        if (occupied.has(`${column}:${row}`)) continue;
        const slot = board.createDiv({
          cls: `rh-next-project-board-slot ${row > maxRow ? 'is-extension-slot' : ''}`,
          attr: { 'data-board-column': String(column), 'data-board-row': String(row), 'aria-hidden': 'true' }
        });
        slot.style.setProperty('--rh-board-column', String(column));
        const memoSides = slot.createDiv({ cls: 'rh-next-project-board-memo-slots' });
        for (const side of ['left', 'right']) {
          const half = memoSides.createDiv({ cls: `rh-next-project-board-memo-slot is-${side}` });
          half.addEventListener('dragover', (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation(); half.addClass('is-drag-target');
          });
          half.addEventListener('dragleave', () => half.removeClass('is-drag-target'));
          half.addEventListener('drop', async (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation();
            const source = this.draggedProjectBoardKey;
            this.finishProjectBoardDrag(slot);
            await this.moveProjectBoardItem(project.id, source, column, row, { side });
          });
        }
        slot.addEventListener('dragover', (event) => {
          if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind === 'memo') return;
          event.preventDefault(); slot.addClass('is-drag-target');
        });
        slot.addEventListener('dragleave', () => slot.removeClass('is-drag-target'));
        slot.addEventListener('drop', async (event) => {
          if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind === 'memo') return;
          event.preventDefault(); event.stopPropagation();
          const source = this.draggedProjectBoardKey;
          this.finishProjectBoardDrag(slot);
          await this.moveProjectBoardItem(project.id, source, column, row);
        });
      }
    }
    board.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.draggedProjectBoardKey) return;
      event.preventDefault(); this.finishProjectBoardDrag();
    });
  }

  observeProjectBoard(board) {
    const schedule = () => {
      if (this.projectBoardLayoutFrame) cancelAnimationFrame(this.projectBoardLayoutFrame);
      this.projectBoardLayoutFrame = requestAnimationFrame(() => this.layoutProjectBoard(board));
    };
    if (typeof ResizeObserver === 'function') {
      this.projectBoardResizeObserver = new ResizeObserver(schedule);
      board.querySelectorAll('.rh-next-project-board-item').forEach((item) => this.projectBoardResizeObserver.observe(item));
    }
    schedule();
  }

  layoutProjectBoard(board) {
    if (!board?.isConnected) return;
    const rowHeight = 8; const rowGap = 4; const slotSpan = 9;
    const wideLayout = getComputedStyle(board).gridAutoRows !== 'auto';
    const heading = board.previousElementSibling?.hasClass('rh-next-project-heading') ? board.previousElementSibling : null;
    const headingHeight = wideLayout ? Math.ceil(heading?.getBoundingClientRect().height || 0) : 0;
    const headingSpan = headingHeight ? Math.ceil((headingHeight + 18 + rowGap) / (rowHeight + rowGap)) : 0;
    board.style.minHeight = headingHeight ? `${headingHeight}px` : '';
    for (let column = 1; column <= 4; column += 1) {
      // 宽窗口前三列为学习主区，先为项目标题留位；第四列从顶部即是可吸附网格。
      let nextRow = wideLayout && column <= 3 ? headingSpan + 1 : 1;
      let previousLogicalRow = 0;
      const entries = [...board.querySelectorAll(`[data-board-column="${column}"]`)]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .sort((left, right) => Number(left.dataset.boardRow) - Number(right.dataset.boardRow));
      for (const element of entries) {
        const logicalRow = Number(element.dataset.boardRow);
        nextRow += Math.max(0, logicalRow - previousLogicalRow - 1) * slotSpan;
        const measured = element.hasClass('rh-next-project-board-slot') ? 0 : element.getBoundingClientRect().height;
        const span = Math.max(slotSpan, Math.ceil((measured + rowGap) / (rowHeight + rowGap)));
        element.style.gridColumn = String(column);
        element.style.gridRow = `${nextRow} / span ${span}`;
        element.style.transform = wideLayout && column === 4 ? 'translateY(-20px)' : '';
        nextRow += span;
        previousLogicalRow = logicalRow;
      }
    }
  }

  async moveProjectBoardItem(projectId, itemKey, column, row, options = {}) {
    const hadLayout = Boolean(this.plugin.state.uiState.projectBoardLayouts?.[projectId]);
    const layoutBefore = hadLayout ? JSON.parse(JSON.stringify(this.plugin.state.uiState.projectBoardLayouts[projectId])) : null;
    const actionBefore = this.plugin.state.uiState.lastAction;
    try {
      model.moveProjectBoardItem(this.plugin.state, projectId, itemKey, column, row, { side: options.side });
      await this.plugin.persist();
      if (options.focus) this.projectBoardFocusKey = itemKey;
      await this.render();
      if (options.focus) requestAnimationFrame(() => this.contentEl.querySelector(`[data-board-key="${CSS.escape(itemKey)}"] [draggable="true"]`)?.focus());
      new Notice(`布局已移动到第 ${column} 列、第 ${row} 行${options.side ? ` ${options.side === 'right' ? '右' : '左'}侧` : ''}。`);
    } catch (error) {
      if (layoutBefore) this.plugin.state.uiState.projectBoardLayouts[projectId] = layoutBefore;
      else if (!hadLayout) delete this.plugin.state.uiState.projectBoardLayouts[projectId];
      this.plugin.state.uiState.lastAction = actionBefore;
      try { await this.plugin.persist(); } catch { /* 保留原错误，界面状态已经回滚。 */ }
      new Notice(`布局保存失败：${error.message || String(error)}`, 6000);
      await this.render();
    }
  }

  async resetProjectBoardLayout(projectId) {
    const layoutBefore = JSON.parse(JSON.stringify(this.plugin.state.uiState.projectBoardLayouts?.[projectId] || null));
    const actionBefore = this.plugin.state.uiState.lastAction;
    try {
      model.resetProjectBoardLayout(this.plugin.state, projectId);
      await this.plugin.persist();
      await this.render();
      new Notice('已恢复默认项目布局，可从顶部撤回。');
    } catch (error) {
      if (layoutBefore) this.plugin.state.uiState.projectBoardLayouts[projectId] = layoutBefore;
      this.plugin.state.uiState.lastAction = actionBefore;
      try { await this.plugin.persist(); } catch { /* 保留原错误，界面状态已经回滚。 */ }
      new Notice(`恢复默认布局失败：${error.message || String(error)}`, 6000);
      await this.render();
    }
  }

  projectPanelSummary(panelType, project) {
    if (panelType === 'tasks') return `${model.projectPlans(this.plugin.state, project.id).length} 项`;
    if (panelType === 'files') return `${model.projectVaultRefs(this.plugin.state, project.id).length} 项`;
    return '';
  }

  async addProjectUtilityItem(event, panelType, project) {
    if (panelType === 'tasks') return this.plugin.openAddModal({ mode: 'plan', projectId: project.id });
    if (panelType === 'files') return this.showProjectFileAddMenu(event, project);
    return this.createProjectMemoCard(project.id);
  }

  renderProjectFiles(parent, project) {
    const refs = model.projectVaultRefs(this.plugin.state, project.id);
    if (!refs.length) {
      const empty = parent.createDiv({ cls: 'rh-next-compact-empty' }); empty.createEl('strong', { text: '还没有项目文件' });
      return;
    }
    const list = parent.createDiv({ cls: 'rh-next-project-file-list' });
    for (const ref of refs) this.renderProjectFileTreeRow(list, project, ref, 0, true);
    const recent = this.recentProjectVaultEntries(refs);
    if (recent.length) {
      const recentCollapsed = Boolean(this.plugin.state.uiState.projectRecentCollapsedByProject?.[project.id]);
      const recentHead = parent.createEl('button', { cls: 'rh-next-project-file-section-head', attr: { type: 'button', 'aria-expanded': String(!recentCollapsed) } });
      setIcon(recentHead.createSpan(), recentCollapsed ? 'chevron-right' : 'chevron-down');
      recentHead.createSpan({ text: '最近修改' });
      recentHead.createEl('small', { text: `${recent.length} 项` });
      recentHead.addEventListener('click', async () => { model.setProjectRecentCollapsed(this.plugin.state, project.id, !recentCollapsed); await this.plugin.persist(); await this.render(); });
      if (recentCollapsed) return;
      const recentList = parent.createDiv({ cls: 'rh-next-project-file-list is-recent' });
      for (const entry of recent.slice(0, 3)) {
        const row = recentList.createDiv({ cls: 'rh-next-project-file-row is-recent' });
        const icon = row.createSpan({ cls: 'rh-next-project-file-icon' }); setIcon(icon, this.plugin.vaultFileKind(entry) === 'canvas' ? 'layout-dashboard' : 'file-text');
        const copy = row.createDiv({ cls: 'rh-next-project-file-copy' }); copy.createSpan({ text: entry.name || entry.path.split('/').pop() });
        copy.createEl('small', { text: `${entry.path} · ${new Date(entry.stat.mtime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` });
        row.addEventListener('click', () => void this.plugin.openVaultEntry(entry));
        row.addEventListener('mouseover', (event) => this.app.workspace.trigger?.('hover-link', { event, source: VIEW_TYPE, hoverParent: row, targetEl: row, linktext: entry.path, sourcePath: '' }));
      }
    }
  }

  recentProjectVaultEntries(refs) {
    const byPath = new Map();
    for (const ref of refs) {
      const entry = this.plugin.vaultEntry(ref.path);
      if (!entry) continue;
      if (this.plugin.vaultEntryType(entry) === 'folder') {
        for (const child of Array.isArray(entry.children) ? entry.children : []) {
          if (this.plugin.vaultEntryType(child) === 'file' && child.stat?.mtime) byPath.set(child.path, child);
        }
      }
    }
    return [...byPath.values()].sort((left, right) => Number(right.stat?.mtime || 0) - Number(left.stat?.mtime || 0)).slice(0, 3);
  }

  showProjectFileAddMenu(event, project) {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('关联已有文件').setIcon('file-plus').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: 'file', multiple: true, onChooseMany: (entries) => this.linkVaultEntries(project.id, entries) }).open()));
    menu.addItem((item) => item.setTitle('关联已有文件夹').setIcon('folder-plus').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: 'folder', multiple: true, onChooseMany: (entries) => this.linkVaultEntries(project.id, entries) }).open()));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('新建普通笔记').setIcon('file-text').onClick(() => void this.plugin.createVaultProjectFile(project.id, 'markdown')));
    menu.addItem((item) => item.setTitle('新建 Canvas').setIcon('layout-dashboard').onClick(() => void this.plugin.createVaultProjectFile(project.id, 'canvas')));
    menu.showAtMouseEvent(event);
  }

  async linkVaultEntry(projectId, entry) {
    await this.linkVaultEntries(projectId, [entry]);
  }

  async linkVaultEntries(projectId, entries) {
    const uniqueEntries = [...new Map((entries || []).filter((entry) => entry?.path).map((entry) => [entry.path, entry])).values()];
    if (!uniqueEntries.length) return;
    const stateBefore = JSON.parse(JSON.stringify(this.plugin.state));
    let result;
    try {
      result = model.linkVaultEntriesToProject(this.plugin.state, projectId, uniqueEntries.map((entry) => ({ path: entry.path, entryType: this.plugin.vaultEntryType(entry), fileKind: this.plugin.vaultFileKind(entry) })));
      await this.plugin.persist();
    } catch (error) {
      this.plugin.state = stateBefore;
      throw error;
    }
    await this.render();
    new Notice(result.linkedVaultRefIds.length ? `已关联 ${result.linkedVaultRefIds.length} 个项目文件，可从顶部撤回。` : '所选项目文件均已关联。');
  }

  renderProjectFileTreeRow(parent, project, ref, depth = 0, linkedRoot = false) {
    const entry = this.plugin.vaultEntry(ref.path); const missing = !entry || ref.missingAt; const pinned = (project.pinnedVaultRefIds || []).includes(ref.id);
    const folder = ref.entryType === 'folder';
    this.expandedProjectVaultFolders ||= new Set();
    const expanded = folder && this.expandedProjectVaultFolders.has(ref.path);
    const row = parent.createDiv({ cls: `rh-next-project-file-row ${missing ? 'is-missing' : ''}`, attr: { 'data-depth': String(depth) } });
    row.style.setProperty('--rh-file-depth', String(depth));
    const disclosure = row.createSpan({ cls: 'rh-next-project-file-disclosure' });
    if (folder && !missing) setIcon(disclosure, expanded ? 'chevron-down' : 'chevron-right');
    const icon = row.createSpan({ cls: 'rh-next-project-file-icon' }); setIcon(icon, ref.entryType === 'folder' ? 'folder' : ref.fileKind === 'canvas' ? 'layout-dashboard' : ref.fileKind === 'markdown' ? 'file-text' : ref.fileKind === 'image' ? 'image' : 'file');
    const copy = row.createDiv({ cls: 'rh-next-project-file-copy' }); copy.createSpan({ text: ref.path.split('/').pop() || ref.path, attr: { title: ref.path } });
    const modified = entry?.stat?.mtime ? new Date(entry.stat.mtime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const childCount = ref.entryType === 'folder' && Array.isArray(entry?.children) ? entry.children.length : 0;
    copy.createEl('small', { text: missing ? '文件已移动或删除' : ref.entryType === 'folder' ? `${childCount} 项` : modified });
    row.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (folder && !missing) {
        if (expanded) this.expandedProjectVaultFolders.delete(ref.path); else this.expandedProjectVaultFolders.add(ref.path);
        void this.render();
      } else void this.plugin.openVaultRef(ref, { newLeaf: event.ctrlKey || event.metaKey });
    });
    if (!missing && ref.entryType === 'file') row.addEventListener('mouseover', (event) => this.app.workspace.trigger?.('hover-link', { event, source: VIEW_TYPE, hoverParent: row, targetEl: row, linktext: ref.path, sourcePath: '' }));
    if (linkedRoot) iconButton(row, 'pin', pinned ? '取消置顶' : '置顶', async () => { model.togglePinnedVaultRef(this.plugin.state, project.id, ref.id); await this.plugin.persist(); await this.render(); }, pinned ? 'is-primary' : 'is-subtle');
    if (linkedRoot) iconButton(row, 'more-horizontal', '项目文件操作', (event) => {
      const menu = new Menu();
      if (!missing && ref.entryType === 'file') menu.addItem((item) => item.setTitle('打开').setIcon('external-link').onClick(() => void this.plugin.openVaultRef(ref)));
      if (!missing && ref.entryType === 'file') menu.addItem((item) => item.setTitle('在新标签打开').setIcon('panel-top-open').onClick(() => void this.plugin.openVaultRef(ref, { newLeaf: true })));
      if (!missing) menu.addItem((item) => item.setTitle('在文件列表中显示').setIcon('folder-search').onClick(() => void this.plugin.revealVaultEntry(entry)));
      if (missing) menu.addItem((item) => item.setTitle('重新关联…').setIcon('link').onClick(() => new VaultEntryPickerModal(this.app, this.plugin, { entryType: ref.entryType, onChoose: async (replacement) => { model.updateVaultRefPath(this.plugin.state, ref.id, replacement.path); await this.plugin.persist(); await this.render(); } }).open()));
      menu.addSeparator(); menu.addItem((item) => item.setTitle('解除项目关联').setIcon('unlink').onClick(async () => { model.unlinkVaultRefFromProject(this.plugin.state, project.id, ref.id); await this.plugin.persist(); await this.render(); }));
      menu.showAtMouseEvent(event);
    });
    if (expanded && Array.isArray(entry?.children)) {
      const children = [...entry.children].sort((left, right) => Number(this.plugin.vaultEntryType(right) === 'folder') - Number(this.plugin.vaultEntryType(left) === 'folder') || left.name.localeCompare(right.name, 'zh-CN', { numeric: true }));
      for (const child of children.slice(0, 300)) {
        const childRef = { id: ref.id, path: child.path, entryType: this.plugin.vaultEntryType(child), fileKind: this.plugin.vaultFileKind(child), missingAt: '' };
        this.renderProjectFileTreeRow(parent, project, childRef, depth + 1, false);
      }
      if (children.length > 300) parent.createDiv({ cls: 'rh-next-project-file-limit', text: `还有 ${children.length - 300} 项，请在 Obsidian 文件列表中继续浏览` }).style.setProperty('--rh-file-depth', String(depth + 1));
    }
  }

  async createProjectMemoCard(projectId, preferredAnchor = null) {
    const memo = model.createProjectMemo(this.plugin.state, projectId);
    if (preferredAnchor) {
      try {
        model.moveProjectBoardItem(this.plugin.state, projectId, `memo:${memo.id}`, preferredAnchor.column, preferredAnchor.row, { side: preferredAnchor.side });
      } catch { /* 目标半格在点击后被占用时保留模型分配的首个空半格。 */ }
    }
    await this.plugin.persist();
    await this.render();
    requestAnimationFrame(() => this.contentEl.querySelector(`[data-memo-id="${CSS.escape(memo.id)}"] textarea`)?.focus());
  }

  async deleteProjectMemoCard(projectId, memoId) {
    await this.flushProjectMemo?.(); this.flushProjectMemo = null;
    model.deleteProjectMemo(this.plugin.state, projectId, memoId);
    await this.plugin.persist();
    await this.render();
  }

  renderProjectMemos(parent, project, boardItemByKey, mediumOrder) {
    const memos = Array.isArray(project.memos) ? project.memos : [];
    const flushers = [];
    const memoById = new Map(memos.map((memo, index) => [memo.id, { memo, index }]));
    const groups = new Map();
    for (const boardItem of boardItemByKey.values()) {
      if (boardItem.kind !== 'memo') continue;
      const key = `${boardItem.column}:${boardItem.row}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(boardItem);
    }
    for (const [coordinate, items] of [...groups.entries()].sort(([left], [right]) => {
      const [lc, lr] = left.split(':').map(Number); const [rc, rr] = right.split(':').map(Number);
      return lr - rr || lc - rc;
    })) {
      const [column, row] = coordinate.split(':').map(Number);
      const occupiedSides = items.map((item) => item.side || 'left');
      const group = parent.createDiv({
        cls: `rh-next-project-memo-group rh-next-project-board-item ${items.length === 1 ? `is-single is-${occupiedSides[0]}` : 'is-paired'}`
      });
      this.setProjectBoardItemPosition(group, { key: `memo-group:${coordinate}`, column, row }, Math.min(...items.map((item) => mediumOrder.get(item.key) || 1)));
      const body = group.createDiv({ cls: 'rh-next-project-memo-group-body' });
      const vacantSide = items.some((item) => (item.side || 'left') === 'left') ? 'right' : 'left';
      for (const side of ['left', 'right']) {
        const boardItem = items.find((item) => (item.side || 'left') === side);
        if (!boardItem) {
          const empty = body.createDiv({ cls: `rh-next-project-memo-half-drop is-${side}`, attr: { 'aria-hidden': 'true' } });
          empty.addEventListener('dragover', (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation(); empty.addClass('is-drag-target');
          });
          empty.addEventListener('dragleave', () => empty.removeClass('is-drag-target'));
          empty.addEventListener('drop', async (event) => {
            if (!this.draggedProjectBoardKey || this.draggedProjectBoardKind !== 'memo') return;
            event.preventDefault(); event.stopPropagation();
            const source = this.draggedProjectBoardKey;
            this.finishProjectBoardDrag(group);
            await this.moveProjectBoardItem(project.id, source, column, row, { side });
          });
          continue;
        }
        const record = memoById.get(boardItem.memoId); if (!record) continue;
        const { memo, index } = record;
        const card = body.createDiv({ cls: `rh-next-project-memo-card is-${side}`, attr: { 'data-memo-id': memo.id, 'data-board-key': boardItem.key } });
        const head = card.createDiv({ cls: 'rh-next-project-memo-card-head' });
        const drag = head.createSpan({ cls: 'rh-next-utility-drag', attr: { draggable: 'true', tabindex: '0', title: `拖动调整便签 ${index + 1} 位置`, 'aria-label': `拖动调整便签 ${index + 1} 位置` } }); setIcon(drag, 'grip-vertical');
        const title = head.createEl('small', { cls: 'rh-next-project-memo-title', text: memo.title || `便签 ${index + 1}`, attr: { title: '双击重命名便签' } });
        title.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameProjectMemoInline(title, project, memo, index); });
        iconButton(head, 'plus', '新建便签', () => void this.createProjectMemoCard(project.id, items.length < 2 ? { column, row, side: vacantSide } : null), 'is-subtle rh-next-project-memo-add');
        iconButton(head, 'trash-2', '删除便签', async () => {
          const previousHeight = getMemoHeight(this.plugin.state, project.id, memo.id);
          deleteMemoHeight(this.plugin.state, project.id, memo.id);
          try {
            await this.deleteProjectMemoCard(project.id, memo.id);
          } catch (error) {
            if (previousHeight) setMemoHeight(this.plugin.state, project.id, memo.id, previousHeight);
            new Notice(`删除便签失败：${error instanceof Error ? error.message : String(error)}`, 5000);
          }
        }, 'is-subtle');
        this.attachProjectBoardDrag(card, drag, project, boardItem);
        const textarea = input(card, { multiline: true, cls: 'rh-next-project-memo-input', placeholder: '写下当前项目的临时想法……', value: memo.text || '' });
        this.plugin.bindMemoHeight(textarea, project.id, memo.id);
        const status = card.createEl('small', { cls: 'rh-next-project-memo-status', text: memo.updatedAt ? new Date(memo.updatedAt).toLocaleDateString('zh-CN') : '' });
        let timer = null;
        const save = async () => {
          if (!this.plugin.state.projects[project.id]) return;
          model.updateProjectMemo(this.plugin.state, project.id, memo.id, textarea.value);
          await this.plugin.persist();
          status.setText(new Date().toLocaleDateString('zh-CN'));
        };
        const flush = async () => { if (timer) window.clearTimeout(timer); timer = null; await save(); };
        flushers.push(flush);
        textarea.addEventListener('input', () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => void flush(), 500); });
        textarea.addEventListener('blur', () => void flush());
      }
    }
    this.flushProjectMemo = async () => Promise.all(flushers.map((flush) => flush()));
  }

  async renameProjectMemoInline(titleEl, project, memo, index) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor rh-next-project-memo-title-editor';
    editor.value = memo.title || `便签 ${index + 1}`;
    titleEl.replaceWith(editor); editor.focus(); editor.select();
    let completed = false;
    const commit = async (cancel = false) => {
      if (completed) return; completed = true;
      if (!cancel) model.updateProjectMemoTitle(this.plugin.state, project.id, memo.id, editor.value);
      if (!cancel) await this.plugin.persist();
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  renderModuleCard(parent, module, options = {}) {
    const resources = model.moduleResources(this.plugin.state, module.id);
    const boardItem = options.projectBoardItem;
    const card = parent.createDiv({ cls: `rh-next-module-card ${boardItem ? 'rh-next-project-board-item' : ''}` });
    if (boardItem) this.setProjectBoardItemPosition(card, boardItem, options.mediumOrder);
    card.dataset.moduleId = module.id;
    card.addEventListener('click', (event) => {
      if (event.target.closest('.rh-next-module-drag') || Date.now() < Number(this.suppressProjectBoardClickUntil || 0)) return;
      this.drawerModuleId = module.id; void this.render();
    });
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => item.setTitle('加入待办任务').setIcon('list-todo').onClick(() => void this.addPlanFromModule(module)));
      menu.addItem((item) => item.setTitle('添加资源').setIcon('plus').onClick(() => this.plugin.openAddModal({ projectId: module.projectId, moduleId: module.id })));
      if (boardItem) {
        menu.addSeparator();
        const moves = [
          ['向左移动', 'arrow-left', boardItem.column - 1, boardItem.row],
          ['向右移动', 'arrow-right', boardItem.column + 1, boardItem.row],
          ['向上移动', 'arrow-up', boardItem.column, boardItem.row - 1],
          ['向下移动', 'arrow-down', boardItem.column, boardItem.row + 1]
        ];
        for (const [title, icon, column, row] of moves) {
          if (column < 1 || column > 4 || row < 1) continue;
          menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => void this.moveProjectBoardItem(module.projectId, boardItem.key, column, row, { focus: true })));
        }
      }
      menu.addSeparator();
      menu.addItem((item) => item.setTitle('归档模块').setIcon('archive').onClick(async () => {
        await this.plugin.mutate((state) => model.archiveModule(state, module.id));
        new Notice(`已归档模块：${module.title}`);
      }));
      menu.addItem((item) => item.setTitle('永久删除模块').setIcon('trash-2').onClick(() => this.confirmDeleteModule(module)));
      menu.showAtMouseEvent(event);
    });
    const drag = card.createDiv({ cls: 'rh-next-module-drag', attr: { draggable: 'true', tabindex: '0', title: '拖动调整模块位置', 'aria-label': '拖动调整模块位置' } });
    setIcon(drag, 'grip-vertical');
    if (boardItem) this.attachProjectBoardDrag(card, drag, this.plugin.state.projects[module.projectId], boardItem);
    const icon = card.createDiv({ cls: 'rh-next-module-card-icon' }); setIcon(icon, resources.length ? kindIcon(resources[0].kind) : 'blocks');
    const body = card.createDiv({ cls: 'rh-next-module-card-body' });
    const name = body.createEl('strong', { text: module.title });
    name.addEventListener('dblclick', (event) => { event.stopPropagation(); void this.renameModuleInline(name, module); });
    body.createEl('small', { text: `${resources.length} 条资源` });
    const complete = resources.filter((resource) => resource.completedAt).length;
    const progress = body.createDiv({ cls: 'rh-next-progress' });
    progress.createDiv({ cls: 'rh-next-progress-fill', attr: { style: `width:${resources.length ? complete / resources.length * 100 : 0}%` } });
    iconButton(card, 'chevron-right', '查看资源', () => { this.drawerModuleId = module.id; return this.render(); });
    return card;
  }

  async renameModuleInline(nameEl, module) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor';
    editor.value = module.title;
    nameEl.replaceWith(editor);
    editor.focus(); editor.select();
    const commit = async (cancel = false) => {
      const value = safeText(editor.value);
      if (!cancel && value) {
        module.title = value; module.updatedAt = new Date().toISOString();
        await this.plugin.persist();
      }
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  confirmDeleteModule(module, onDone = null) {
    const resourceCount = (module.resourceIds || []).filter((resourceId) => this.plugin.state.resources[resourceId]).length;
    const planCount = Object.values(this.plugin.state.plans).filter((plan) => plan.targetType === 'module' && plan.targetIds?.includes(module.id) && !plan.deletedAt).length;
    new ConfirmActionModal(this.app, {
      title: `永久删除模块“${module.title}”？`,
      message: `将删除这个模块和 ${planCount} 个相关计划，并解除 ${resourceCount} 条资源关联。全局资源、完成记录和其他模块不会被删除；操作后可从顶部撤回一次。`,
      confirmLabel: '永久删除模块',
      onConfirm: async () => {
        const result = await this.plugin.mutate((state) => model.deleteModule(state, module.id), { render: false });
        if (this.drawerModuleId === module.id) this.drawerModuleId = '';
        new Notice(`已删除模块；移除 ${result.removedPlanCount} 个计划，解除 ${result.detachedResourceCount} 条资源关联。可从顶部撤回。`, 7000);
        await onDone?.();
        await this.render();
      }
    }).open();
  }

  async renameProjectInline(nameEl, project) {
    const editor = document.createElement('input');
    editor.className = 'rh-next-inline-editor rh-next-project-inline-editor';
    editor.value = project.title;
    nameEl.replaceWith(editor);
    editor.focus(); editor.select();
    let settled = false;
    const commit = async (cancel = false) => {
      if (settled) return;
      settled = true;
      const value = safeText(editor.value);
      if (!cancel && value && value !== project.title) model.renameProject(this.plugin.state, project.id, value);
      if (!cancel && !value) new Notice('项目名称不能为空。');
      await this.plugin.persist();
      await this.render();
    };
    editor.addEventListener('blur', () => void commit());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); editor.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); void commit(true); }
    });
  }

  promptModule(projectId) {
    new TextPromptModal(this.app, '新建学习模块', '模块名称', async (value) => {
      const module = await this.plugin.mutate((state) => model.createModule(state, projectId, value), { render: false });
      new Notice(`已创建模块：${module.title}`);
      await this.render();
    }, { initialValue: '学习材料' }).open();
  }

  async addPlanFromModule(module) {
    const result = await this.plugin.mutate((state) => model.createPlanForTarget(state, module.projectId, 'module', module.id, module.title));
    new Notice(result.reused ? '这个模块已在待办中。' : '已加入右侧待办。');
  }

  renderProjectPlanStack(parent, project, options = {}) {
    const state = this.plugin.state;
    if (!options.compact) {
      const head = parent.createDiv({ cls: 'rh-next-section-heading' });
      const copy = head.createDiv(); copy.createEl('h2', { text: '待办任务' }); copy.createEl('p', { text: '引用项目中的模块；折叠状态会被记住。' });
      textButton(head, '添加', 'plus', () => this.plugin.openAddModal({ mode: 'plan', projectId: project.id }));
    }
    const plans = model.projectPlans(state, project.id);
    if (!plans.length) {
      if (options.compact) { const empty = parent.createDiv({ cls: 'rh-next-compact-empty' }); empty.createEl('strong', { text: '尚未设置待办' }); }
      else this.renderEmpty(parent, 'list-todo', '尚未设置待办', '右键学习模块，选择“加入待办任务”。');
    }
    for (const plan of plans) {
      const collapsed = state.uiState.collapsedProjectPlans[plan.id] !== false;
      const wrap = parent.createDiv({ cls: `rh-next-project-plan ${collapsed ? 'is-collapsed' : ''}` });
      const top = wrap.createDiv({ cls: 'rh-next-project-plan-head' });
      const icon = top.createSpan(); setIcon(icon, collapsed ? 'chevron-right' : 'chevron-down');
      const text = top.createDiv(); text.createEl('strong', { text: plan.title });
      const progress = model.planProgress(plan); text.createEl('small', { text: `今日 ${progress.completed}/${progress.target}` });
      top.addEventListener('click', async () => {
        state.uiState.collapsedProjectPlans[plan.id] = !collapsed;
        await this.plugin.persist(); await this.render();
      });
      if (!collapsed) {
        const body = wrap.createDiv({ cls: 'rh-next-project-plan-body' });
        this.renderPlanRow(body, plan);
      }
    }
  }

  renderDrawer(root, moduleId) {
    const state = this.plugin.state;
    const module = state.modules[moduleId];
    if (!module) return;
    if (this.drawerResourceModuleId !== moduleId) { this.drawerResourceModuleId = moduleId; this.drawerResourcePath = ''; }
    const overlay = root.createDiv({ cls: 'rh-next-drawer-overlay' });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) { this.drawerModuleId = ''; this.drawerResourcePath = ''; void this.render(); } });
    const drawer = overlay.createDiv({ cls: 'rh-next-drawer' });
    const header = drawer.createDiv({ cls: 'rh-next-drawer-head' });
    const copy = header.createDiv(); copy.createEl('small', { text: state.projects[module.projectId]?.title || '项目' }); copy.createEl('h2', { text: module.title });
    iconButton(header, 'x', '关闭', () => { this.drawerModuleId = ''; this.drawerResourcePath = ''; return this.render(); });
    const toolbar = drawer.createDiv({ cls: 'rh-next-drawer-toolbar' });
    const search = input(toolbar, { placeholder: '搜索这个模块中的资源……' });
    textButton(toolbar, '新建分组', 'folder-plus', () => new TextPromptModal(this.app, '新建资源分组', '分组名称', async (value) => {
      await this.plugin.mutate((next) => { const group = model.createResourceGroup(next, moduleId, value); group.scopePath = this.drawerResourcePath || ''; return group; });
    }, { initialValue: '新分组' }).open());
    const organizeButton = textButton(toolbar, '整理当前文件夹', 'folder-cog', async () => {
      const currentPath = this.drawerResourcePath || '';
      if (!currentPath) return new Notice('请先进入需要整理的文件夹。');
      const scopedVideos = model.moduleResources(state, moduleId).filter((resource) => resource.kind === 'video' && (() => { const folderPath = this.resourceVirtualFolderPath(resource, moduleId); return folderPath === currentPath || folderPath.startsWith(`${currentPath}/`); })());
      if (scopedVideos.length <= 20) return new Notice('当前文件夹不超过 20 个视频，无需自动分组。');
      const autoGroupKey = `module:${moduleId}:folder:${currentPath}`;
      await this.plugin.mutate((next) => {
        const beforeGroups = model.moduleResourceGroups(next, moduleId).filter((group) => group.autoGroupKey === autoGroupKey).map((group) => ({ ...group, resourceIds: [...(group.resourceIds || [])] }));
        const beforeOrder = [...(next.modules[moduleId]?.resourceGroupIds || [])];
        const collapsedBefore = { ...(next.uiState.collapsedResourceGroupsByModule?.[moduleId] || {}) };
        const result = model.autoGroupResources(next, moduleId, scopedVideos.map((resource) => resource.id), { size: 20, key: autoGroupKey, scopePath: currentPath });
        model.recordLastAction(next, { type: 'auto-group-resources', moduleId, autoGroupKey, resourceGroupSnapshotsBefore: beforeGroups, moduleResourceGroupIdsBefore: beforeOrder, collapsedBefore, autoGroupIdsAfter: result.groups.map((group) => group.id), label: `整理文件夹：${currentPath}` });
      });
      new Notice(`仅整理当前文件夹中的 ${scopedVideos.length} 个视频；可从顶部撤回。`);
    }); organizeButton.setAttr('aria-label', '整理当前文件夹中的视频（适用于 OpenList、本地文件夹及其他目录来源）');
    organizeButton.style.display = 'none';
    const legacyAutoKey = `module:${moduleId}:video`;
    if (model.moduleResourceGroups(state, moduleId).some((group) => group.autoGroupKey === legacyAutoKey)) textButton(toolbar, '恢复原文件夹', 'undo-2', () => new ConfirmActionModal(this.app, {
      title: '恢复自动整理前的文件夹结构？',
      message: '只删除这次错误创建的“第一组、第二组……”自动分组；不会删除资源，也不会修改原始路径。',
      confirmLabel: '恢复原文件夹',
      onConfirm: async () => {
        await this.plugin.mutate((next) => { for (const group of model.moduleResourceGroups(next, moduleId).filter((item) => item.autoGroupKey === legacyAutoKey)) model.deleteResourceGroup(next, group.id); });
        new Notice('已移除错误自动分组，原相对文件夹结构已恢复。');
      }
    }).open(), 'is-danger');
    textButton(toolbar, '添加资源', 'plus', () => this.plugin.openAddModal({ projectId: module.projectId, moduleId }), 'is-primary');
    const list = drawer.createDiv({ cls: 'rh-next-resource-list' });
    const renderRows = () => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const allResources = model.moduleResources(state, moduleId);
      const resources = allResources.filter((resource) => !query || `${resource.title} ${resource.metadata?.remotePath || ''}`.toLowerCase().includes(query));
      const currentFolderVideoCount = this.drawerResourcePath ? allResources.filter((resource) => resource.kind === 'video' && (() => { const folderPath = this.resourceVirtualFolderPath(resource, moduleId); return folderPath === this.drawerResourcePath || folderPath.startsWith(`${this.drawerResourcePath}/`); })()).length : 0;
      organizeButton.style.display = !query && this.drawerResourcePath && currentFolderVideoCount > 20 ? '' : 'none';
      if (!resources.length) this.renderEmpty(list, 'search-x', query ? '没有匹配资源' : '模块中还没有资源', query ? '换一个关键词。' : '从链接、文件或收件箱添加。');
      if (query) {
        for (const resource of resources) this.renderDrawerResourceRow(list, resource, { showRemotePath: true, moduleId });
        return;
      }
      const currentPath = this.drawerResourcePath || '';
      const resourceGroups = model.moduleResourceGroups(state, moduleId);
      const visibleGroups = resourceGroups.filter((group) => String(group.scopePath || '') === currentPath);
      const groupedIds = new Set(visibleGroups.flatMap((group) => group.resourceIds || []));
      const breadcrumbs = list.createDiv({ cls: 'rh-next-resource-breadcrumbs' });
      const rootCrumb = breadcrumbs.createEl('button', { text: module.title, attr: { type: 'button' } });
      rootCrumb.addEventListener('click', () => { this.drawerResourcePath = ''; renderRows(); });
      let built = '';
      for (const segment of currentPath.split('/').filter(Boolean)) {
        breadcrumbs.createSpan({ text: '/' });
        built = built ? `${built}/${segment}` : segment;
        const target = built;
        const crumb = breadcrumbs.createEl('button', { text: segment, attr: { type: 'button' } });
        crumb.addEventListener('click', () => { this.drawerResourcePath = target; renderRows(); });
      }
      if (visibleGroups.length) {
        for (const group of visibleGroups) {
          const progress = model.resourceGroupProgress(state, group.id);
          const collapsed = state.uiState.collapsedResourceGroupsByModule?.[moduleId]?.[group.id] !== false;
          const wrap = list.createDiv({ cls: `rh-next-resource-group ${collapsed ? 'is-collapsed' : ''} ${progress.done ? 'is-complete' : ''}` });
          const groupRow = wrap.createDiv({ cls: 'rh-next-resource-group-row' });
          groupRow.setAttr('role', 'button'); groupRow.setAttr('tabindex', '0'); groupRow.setAttr('aria-expanded', String(!collapsed));
          setIcon(groupRow.createSpan(), collapsed ? 'chevron-right' : 'chevron-down');
          setIcon(groupRow.createSpan({ cls: 'rh-next-resource-group-icon' }), 'folder');
          const groupCopy = groupRow.createDiv(); groupCopy.createEl('strong', { text: group.title }); groupCopy.createEl('small', { text: `${progress.completed}/${progress.total} 已完成` });
          iconButton(groupRow, 'more-horizontal', '分组操作', (event) => {
            event.stopPropagation();
            const menu = new Menu();
            const groupIndex = visibleGroups.findIndex((candidate) => candidate.id === group.id);
            if (groupIndex > 0) menu.addItem((item) => item.setTitle('上移').setIcon('arrow-up').onClick(async () => { await this.plugin.mutate((next) => model.moveResourceGroup(next, moduleId, group.id, visibleGroups[groupIndex - 1].id)); }));
            if (groupIndex < visibleGroups.length - 1) menu.addItem((item) => item.setTitle('下移').setIcon('arrow-down').onClick(async () => { await this.plugin.mutate((next) => model.moveResourceGroup(next, moduleId, visibleGroups[groupIndex + 1].id, group.id)); }));
            menu.addItem((item) => item.setTitle('重命名').setIcon('pencil').onClick(() => new TextPromptModal(this.app, '重命名资源分组', '分组名称', async (value) => {
              await this.plugin.mutate((next) => model.renameResourceGroup(next, group.id, value));
            }, { initialValue: group.title }).open()));
            menu.addItem((item) => item.setTitle('删除分组').setIcon('folder-x').onClick(async () => {
              await this.plugin.mutate((next) => model.deleteResourceGroup(next, group.id));
              new Notice('已删除分组；组内资源已回到未分组。');
            }));
            menu.showAtMouseEvent(event);
          });
          groupRow.addEventListener('click', async () => {
            model.setResourceGroupCollapsed(state, moduleId, group.id, !collapsed);
            await this.plugin.persist(); renderRows();
          });
          groupRow.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); groupRow.click(); }
          });
          if (!collapsed) {
            const groupBody = wrap.createDiv({ cls: 'rh-next-resource-group-body' });
            const members = (group.resourceIds || []).map((resourceId) => state.resources[resourceId]).filter(Boolean);
            for (const resource of members) this.renderDrawerResourceRow(groupBody, resource, { moduleId });
            if (!members.length) groupBody.createEl('small', { cls: 'rh-next-help', text: '这个分组还没有资源。' });
          }
        }
      }
      const folders = new Map();
      const direct = [];
      for (const resource of resources) {
        if (groupedIds.has(resource.id)) continue;
        const folderPath = this.resourceVirtualFolderPath(resource, moduleId);
        const relative = currentPath ? (folderPath === currentPath ? '' : folderPath.startsWith(`${currentPath}/`) ? folderPath.slice(currentPath.length + 1) : null) : folderPath;
        if (relative === null) continue;
        if (!relative) { direct.push(resource); continue; }
        const folderName = relative.split('/')[0];
        const folderTarget = currentPath ? `${currentPath}/${folderName}` : folderName;
        if (!folders.has(folderName)) folders.set(folderName, { path: folderTarget, count: 0 });
        folders.get(folderName).count += 1;
      }
      for (const [name, folder] of [...folders.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN', { numeric: true }))) {
        const row = list.createEl('button', { cls: 'rh-next-resource-folder-row', attr: { type: 'button' } });
        setIcon(row.createSpan(), 'folder');
        const text = row.createDiv(); text.createEl('strong', { text: name }); text.createEl('small', { text: `${folder.count} 项` });
        setIcon(row.createSpan(), 'chevron-right');
        row.addEventListener('click', () => { this.drawerResourcePath = folder.path; renderRows(); });
      }
      for (const resource of direct) this.renderDrawerResourceRow(list, resource, { moduleId });
      if (!folders.size && !direct.length && !visibleGroups.length && (currentPath || !resourceGroups.length)) this.renderEmpty(list, 'folder-open', '这个文件夹是空的', '返回上一层继续查看。');
    };
    search.addEventListener('input', renderRows);
    renderRows();
  }

  resourceVirtualFolderPath(resource, moduleId = '') {
    const rootPath = String(moduleId ? model.moduleResourceRoot(this.plugin.state, moduleId, resource.id) || resource?.metadata?.rootPath || '' : resource?.metadata?.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    return model.resourceFolderPath(resource, rootPath);
  }

  renderDrawerResourceRow(parent, resource, options = {}) {
    const row = parent.createDiv({ cls: `rh-next-resource-row ${resource.completedAt ? 'is-complete' : ''}` });
    const icon = row.createDiv({ cls: 'rh-next-resource-icon' }); setIcon(icon, kindIcon(resource.kind));
    const text = row.createDiv({ cls: 'rh-next-resource-copy' }); text.createEl('strong', { text: resource.title });
    const pathDetail = options.showRemotePath && resource.metadata?.remotePath ? ` · ${resource.metadata.remotePath}` : '';
    text.createEl('small', { text: `${kindLabel(resource.kind)}${resource.lastOpenedAt ? ' · 最近打开过' : ' · 尚未打开'}${pathDetail}` });
    const actions = row.createDiv({ cls: 'rh-next-resource-actions' });
    this.renderResourceActionButtons(actions, resource);
    const complete = iconButton(row, resource.completedAt ? 'circle-check-big' : 'circle', resource.completedAt ? '取消完成' : '确认完成', async () => {
      await this.plugin.mutate((next) => model.toggleResourceComplete(next, resource.id));
    });
    complete.addClass('rh-next-complete-button');
    iconButton(row, 'more-horizontal', '资源操作', (event) => {
      const menu = new Menu();
      if (options.moduleId) {
        const groups = model.moduleResourceGroups(this.plugin.state, options.moduleId);
        const current = groups.find((group) => (group.resourceIds || []).includes(resource.id));
        if (current) menu.addItem((item) => item.setTitle('移出分组').setIcon('folder-minus').onClick(async () => {
          await this.plugin.mutate((next) => model.moveResourceToGroup(next, options.moduleId, resource.id, ''));
        }));
        for (const group of groups.filter((candidate) => candidate.id !== current?.id)) {
          menu.addItem((item) => item.setTitle(`移到：${group.title}`).setIcon('folder-input').onClick(async () => {
            await this.plugin.mutate((next) => model.moveResourceToGroup(next, options.moduleId, resource.id, group.id));
          }));
        }
      }
      menu.addItem((item) => item.setTitle('移到回收站').setIcon('trash-2').onClick(async () => {
        await this.plugin.mutate((next) => model.trashResource(next, resource.id));
      }));
      menu.showAtMouseEvent(event);
    });
  }

  renderResourceActionButtons(parent, resource) {
    const actions = this.plugin.resourceActions(resource);
    if (actions.playTarget) iconButton(parent, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(resource, 'play', actions.playTarget), 'is-primary');
    if (actions.webTarget) iconButton(parent, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, resource, actions.webTarget));
    if (actions.defaultTarget) {
      const label = actions.defaultTarget.type === 'anki' ? '打开 Anki 卡组' : actions.defaultTarget.type === 'file' ? '用默认程序打开文件' : '打开资源';
      iconButton(parent, actions.defaultTarget.type === 'anki' ? 'layers-3' : 'external-link', label, () => this.plugin.openResourceAction(resource, 'default', actions.defaultTarget), actions.playTarget || actions.webTarget ? '' : 'is-primary');
    }
  }

  renderLibrary(main) {
    const state = this.plugin.state;
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv(); copy.createEl('h1', { text: '资料库' }); copy.createEl('p', { cls: 'rh-next-interface-tip', text: '低频整理集中在这里；OpenList、Anki 与订阅降为后台来源连接。' });
    const headingActions = heading.createDiv({ cls: 'rh-next-section-actions' });
    const orphanCount = model.orphanResources(state).length;
    const legacyBiliCount = model.legacyBiliHomepageResources(state).length;
    if (legacyBiliCount) textButton(headingActions, `整理旧订阅主页 ${legacyBiliCount}`, 'list-checks', () => new LegacyBiliHomepageCleanupModal(this.app, this.plugin).open(), 'is-subtle');
    if (orphanCount) textButton(headingActions, `清理未利用资源 ${orphanCount}`, 'eraser', () => new CleanupResourcesModal(this.app, this.plugin).open(), 'is-subtle');
    textButton(headingActions, '添加资源', 'plus', () => this.plugin.openAddModal({ projectId: this.currentProjectId }), 'is-primary');
    const tiles = main.createDiv({ cls: 'rh-next-library-grid' });
    const entries = [
      ['收件箱', `${state.inbox.length} 条待整理`, 'inbox', () => this.plugin.openAddModal({ mode: 'inbox', projectId: this.currentProjectId })],
      ['全局资源', `${Object.values(state.resources).filter((r) => !r.deletedAt).length} 条`, 'search', () => this.openSearch()],
      ['来源连接', `${Object.values(state.sources).filter((s) => !s.deletedAt).length} 个连接`, 'plug-zap', () => this.plugin.openAddModal({ mode: 'source', projectId: this.currentProjectId })],
      ['回收站', `${Object.values(state.resources).filter((r) => r.deletedAt).length} 条`, 'trash-2', () => new ArchiveModal(this.app, this.plugin, 'trash').open()],
      ['归档与旧资源', `${Object.values(state.projects).filter((p) => p.archivedAt).length} 个项目`, 'archive', () => new ArchiveModal(this.app, this.plugin, 'archive').open()]
    ];
    for (const [title, detail, icon, action] of entries) {
      const card = tiles.createDiv({ cls: 'rh-next-library-card' }); setIcon(card.createSpan(), icon);
      const text = card.createDiv(); text.createEl('strong', { text: title }); text.createEl('small', { text: detail }); setIcon(card.createSpan(), 'arrow-up-right');
      card.addEventListener('click', () => void action());
    }
    const source = main.createDiv({ cls: 'rh-next-source-panel' });
    const sourceHead = source.createDiv({ cls: 'rh-next-section-heading' });
    const sourceCopy = sourceHead.createDiv(); sourceCopy.createEl('h2', { text: '来源连接' }); sourceCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '只在配置时出现技术信息，日常项目只显示视频、卡组、文档。' });
    const sourceGrid = source.createDiv({ cls: 'rh-next-source-grid' });
    for (const [name, icon, detail, type] of [['OpenList', 'cloud', '网盘文件结构与视频', 'openlist'], ['Anki', 'layers-3', '本地卡组与一键刷卡', 'anki'], ['本地文件夹', 'folder', '课程目录动态扫描', 'local-folder'], ['B站订阅', 'rss', 'UP主页与合集更新', 'bilibili']]) {
      const card = sourceGrid.createDiv({ cls: 'rh-next-source-card' }); setIcon(card.createSpan(), icon); const t = card.createDiv(); t.createEl('strong', { text: name }); t.createEl('small', { text: detail }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => this.plugin.openAddModal({ mode: 'source', sourceType: type, projectId: this.currentProjectId }));
    }
  }

  renderSubscriptions(main) {
    const state = this.plugin.state;
    const creators = Object.values(state.sources).filter((item) => item.type === 'bilibili' && !item.deletedAt);
    const heading = main.createDiv({ cls: 'rh-next-page-heading' });
    const copy = heading.createDiv();
    copy.createEl('h1', { text: '订阅' });
    copy.createEl('p', { cls: 'rh-next-interface-tip', text: '点头像切换已添加的 UP；投稿直接启动 PotPlayer，合集可展开后加入项目。' });
    textButton(heading, '添加 UP', 'user-plus', () => this.plugin.openAddModal({ mode: 'source', sourceType: 'bilibili', projectId: this.currentProjectId }), 'is-primary');
    if (!creators.length) {
      this.renderEmpty(main, 'rss', '还没有订阅 UP', '添加一个 B 站 UP 主页后，这里会显示头像、投稿和公开合集。', '添加 UP', () => this.plugin.openAddModal({ mode: 'source', sourceType: 'bilibili', projectId: this.currentProjectId }));
      return;
    }
    this.renderBiliHome(main, creators);
  }

  renderBiliHome(parent, creators) {
    const state = this.plugin.state;
    const source = parent.createDiv({ cls: 'rh-next-subscription-panel' });
    const selectedId = creators.some((item) => item.id === state.uiState.selectedBiliSourceId) ? state.uiState.selectedBiliSourceId : creators[0].id;
    const creatorGrid = source.createDiv({ cls: 'rh-next-creator-switcher' });
    for (const creator of creators) {
      const button = creatorGrid.createEl('button', { cls: `rh-next-creator-switch ${creator.id === selectedId ? 'is-selected' : ''}`, attr: { title: creator.alias || `UP ${creator.mid}`, 'aria-label': `切换到 ${creator.alias || `UP ${creator.mid}`}` } });
      if (creator.avatar) button.createEl('img', { attr: { src: creator.avatar, alt: '', referrerpolicy: 'no-referrer' } }); else button.createSpan({ text: (creator.alias || 'U').slice(0, 1) });
      button.addEventListener('click', async () => { state.uiState.selectedBiliSourceId = creator.id; await this.plugin.persist(); await this.render(); });
    }
    const creator = creators.find((item) => item.id === selectedId) || creators[0];
    const home = source.createDiv({ cls: 'rh-next-creator-home' });
    const profile = home.createDiv({ cls: 'rh-next-creator-profile' });
    const avatar = profile.createDiv({ cls: 'rh-next-creator-avatar is-large' });
    if (creator.avatar) avatar.createEl('img', { attr: { src: creator.avatar, alt: creator.alias || `UP ${creator.mid}`, referrerpolicy: 'no-referrer' } }); else avatar.setText((creator.alias || 'U').slice(0, 1));
    const profileText = profile.createDiv({ cls: 'rh-next-creator-copy' }); profileText.createEl('h3', { text: creator.alias || `UP ${creator.mid}` }); profileText.createEl('small', { text: `UID ${creator.mid}${creator.followers ? ` · ${Number(creator.followers).toLocaleString()} 粉丝` : ''}` });
    if (creator.description) profileText.createEl('p', { text: creator.description });
    const actions = profile.createDiv({ cls: 'rh-next-creator-actions' });
    iconButton(actions, 'refresh-cw', '刷新主页资料', async () => {
      try {
        const refreshed = await this.plugin.refreshBiliProfile(creator);
        new Notice(refreshed.lastError ? `主页已刷新，部分资料未同步：${refreshed.lastError}` : 'UP 主页资料已刷新。', 6000);
        await this.render();
      } catch (error) { new Notice(`刷新失败：${error.message || String(error)}`, 6000); }
    });
    iconButton(actions, 'external-link', '打开B站主页', () => shell.openExternal(creator.homepage));
    if (creator.lastError) home.createEl('p', { cls: 'rh-next-source-warning', text: `部分资料未同步：${creator.lastError}` });
    const recentHead = home.createDiv({ cls: 'rh-next-section-heading is-compact' }); const recentCopy = recentHead.createDiv(); recentCopy.createEl('h3', { text: '主页视频' }); recentCopy.createEl('p', { cls: 'rh-next-interface-tip', text: `${creator.recentSyncMode === '合集补全' ? '投稿接口受限，当前用公开合集补全内容' : '缓存最近公开投稿'}；点击卡片直接启动 PotPlayer。` });
    const videoGrid = home.createDiv({ cls: 'rh-next-bili-video-grid' });
    const recentVideos = Array.isArray(creator.recentVideos) ? creator.recentVideos.slice(0, 12) : [];
    if (!recentVideos.length) videoGrid.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有缓存投稿，点击右上角刷新。' });
    for (const video of recentVideos) this.renderBiliVideoCard(videoGrid, video);
    const collectionHead = home.createDiv({ cls: 'rh-next-section-heading is-compact' }); const collectionCopy = collectionHead.createDiv(); collectionCopy.createEl('h3', { text: '公开合集' }); collectionCopy.createEl('p', { cls: 'rh-next-interface-tip', text: '点击合集查看完整视频列表。' });
    const collectionGrid = home.createDiv({ cls: 'rh-next-bili-collection-grid' });
    const collections = Array.isArray(creator.collections) ? creator.collections : [];
    if (!collections.length) collectionGrid.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有缓存公开合集。' });
    for (const collection of collections) {
      const card = collectionGrid.createEl('button', { cls: 'rh-next-bili-collection-card' });
      const copy = card.createDiv(); copy.createEl('strong', { text: collection.name }); copy.createEl('small', { text: `${collection.type === 'season' ? '合集' : '系列'} · ${collection.total || 0} 条` }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => new BiliCollectionModal(this.app, this.plugin, creator, collection).open());
    }
  }

  renderBiliVideoCard(parent, video) {
    const card = parent.createDiv({ cls: 'rh-next-bili-video-card' });
    if (video.cover) card.createEl('img', { attr: { src: video.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } });
    const copy = card.createDiv({ cls: 'rh-next-bili-video-copy' }); copy.createEl('strong', { text: video.title || '未命名视频' });
    if (video.publishedAt) copy.createEl('small', { text: new Date(video.publishedAt).toLocaleDateString('zh-CN') });
    const actions = card.createDiv({ cls: 'rh-next-bili-video-actions' });
    const transient = { title: video.title || '未命名视频', kind: 'video', launcher: { type: 'potplayer', target: video.url }, metadata: { originalUrl: video.url, sourceUrl: video.url } };
    this.renderResourceActionButtons(actions, transient);
    iconButton(actions, 'inbox', '加入收件箱', async () => {
      const result = model.addInboxResource(this.plugin.state, video.url, video.title);
      model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入收件箱：${video.title}` });
      await this.plugin.persist(); new Notice(result.reused ? '收件箱中已有这条视频。' : '已加入收件箱。'); await this.render();
    });
    iconButton(actions, 'folder-plus', '加入项目', () => {
      new ImportDestinationModal(this.app, this.plugin, {
        suggestedTitle: video.title,
        onChoose: async (destination) => {
          const descriptor = biliVideoDescriptor(video);
          const result = destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
          model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], linkedResourceIds: result.linked ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入项目：${video.title}` });
          await this.plugin.persist(); new Notice(destination.inbox ? '已加入收件箱。' : '已加入项目。'); await this.render();
        }
      }).open();
    });
  }

  renderEmpty(parent, icon, title, detail, actionLabel, action) {
    const empty = parent.createDiv({ cls: 'rh-next-empty' });
    const iconEl = empty.createDiv(); setIcon(iconEl, icon);
    empty.createEl('strong', { text: title }); empty.createEl('p', { text: detail });
    if (actionLabel && action) textButton(empty, actionLabel, 'arrow-right', action);
    return empty;
  }

  promptProject() {
    new TextPromptModal(this.app, '新建项目', '项目名称', async (value) => {
      const project = await this.plugin.mutate((state) => model.createProject(state, value), { render: false });
      this.currentProjectId = project.id;
      await this.navigate('project', { projectId: project.id });
    }).open();
  }

  openSearch() {
    const resources = Object.values(this.plugin.state.resources).filter((resource) => !resource.deletedAt);
    new ResourceSearchModal(this.app, this.plugin, resources).open();
  }
}

class TextPromptModal extends Modal {
  constructor(app, title, placeholder, onSubmit, options = {}) {
    super(app);
    this.heading = title;
    this.placeholder = placeholder;
    this.onSubmitValue = onSubmit;
    this.initialValue = options.initialValue || '';
    this.onCancel = options.onCancel;
    this.submitted = false;
  }
  onOpen() {
    this.modalEl.addClass('rh-next-modal');
    const { contentEl } = this; contentEl.empty(); contentEl.createEl('h2', { text: this.heading });
    const field = input(contentEl, { placeholder: this.placeholder, value: this.initialValue });
    const actions = contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '确认', 'check', async () => {
      const value = safeText(field.value);
      if (!value) return;
      this.submitted = true;
      await this.onSubmitValue(value);
      this.close();
    }, 'is-primary');
    field.addEventListener('keydown', (event) => { if (event.key === 'Enter') void actions.querySelector('.is-primary')?.click(); });
    window.setTimeout(() => { field.focus(); field.select(); }, 0);
  }
  onClose() {
    if (!this.submitted) this.onCancel?.();
    this.contentEl.empty();
  }
}

class ConfirmActionModal extends Modal {
  constructor(app, options = {}) { super(app); this.options = options; this.confirmed = false; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-confirm-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.options.title || '确认操作' }); copy.createEl('p', { text: this.options.message || '' });
    iconButton(head, 'x', '关闭', () => this.close());
    let checkbox = null;
    if (this.options.checkboxLabel) {
      const option = this.contentEl.createEl('label', { cls: 'rh-next-confirm-option' });
      checkbox = option.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.options.checkboxDefault !== false;
      option.createSpan({ text: this.options.checkboxLabel });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, this.options.confirmLabel || '确认', 'trash-2', async () => {
      try { await this.options.onConfirm?.({ checked: Boolean(checkbox?.checked) }); this.confirmed = true; this.close(); }
      catch (error) { new Notice(error.message || String(error), 6000); }
    }, 'is-danger');
  }
  onClose() { if (!this.confirmed) this.options.onCancel?.(); this.contentEl.empty(); }
}

class ProjectLinkModal extends Modal {
  constructor(app, plugin, entry) { super(app); this.plugin = plugin; this.entry = entry; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-project-link-modal');
    const projects = model.activeProjects(this.plugin.state); const linked = new Set(this.plugin.projectsForVaultPath(this.entry.path).map((project) => project.id));
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: '关联到学习项目' }); copy.createEl('p', { text: this.entry.path }); iconButton(head, 'x', '关闭', () => this.close());
    if (!projects.length) {
      this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有可关联的学习项目。' });
      return;
    }
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const project of projects) {
      const row = list.createEl('label', { cls: `rh-next-picker-row ${linked.has(project.id) ? 'is-selected' : ''}` }); const box = row.createEl('input', { type: 'checkbox' }); box.checked = linked.has(project.id);
      const body = row.createDiv(); body.createEl('strong', { text: project.title }); body.createEl('small', { text: linked.has(project.id) ? '已关联' : '未关联' });
      box.addEventListener('change', () => { box.checked ? linked.add(project.id) : linked.delete(project.id); row.toggleClass('is-selected', box.checked); body.querySelector('small')?.setText(box.checked ? '已关联' : '未关联'); });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' }); textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '保存关联', 'check', async () => {
      const result = model.upsertVaultRef(this.plugin.state, { path: this.entry.path, entryType: this.plugin.vaultEntryType(this.entry), fileKind: this.plugin.vaultFileKind(this.entry) });
      for (const projectId of linked) model.linkVaultRefToProject(this.plugin.state, projectId, result.vaultRef.id);
      for (const project of projects.filter((item) => !linked.has(item.id))) model.unlinkVaultRefFromProject(this.plugin.state, project.id, result.vaultRef.id);
      await this.plugin.persist(); await this.plugin.workbenchLeaf?.view?.render?.(); new Notice(`已更新 ${this.entry.name || this.entry.path} 的项目关联。`); this.close();
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class LinkedProjectPickerModal extends Modal {
  constructor(app, plugin, projects) { super(app); this.plugin = plugin; this.projects = projects; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal'); this.contentEl.createEl('h2', { text: '打开关联项目' }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const project of this.projects) { const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), 'folder'); const copy = row.createDiv(); copy.createEl('strong', { text: project.title }); row.addEventListener('click', () => { void this.plugin.openWorkbench({ route: 'project', projectId: project.id }); this.close(); }); }
  }
  onClose() { this.contentEl.empty(); }
}

class VaultEntryPickerModal extends Modal {
  constructor(app, plugin, options = {}) { super(app); this.plugin = plugin; this.options = options; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-vault-picker-modal');
    const typeLabel = this.options.entryType === 'folder' ? '文件夹' : '文件';
    const multiple = Boolean(this.options.multiple);
    const selected = new Set((this.options.selectedPaths || []).map((pathValue) => String(pathValue || '')));
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: `选择 Obsidian ${typeLabel}` }); copy.createEl('p', { text: multiple ? '可多选；只按路径和名称搜索，不读取文件正文。' : '只按路径和名称搜索，不读取文件正文。' }); iconButton(head, 'x', '关闭', () => this.close());
    const search = input(this.contentEl, { placeholder: `搜索 Vault ${typeLabel}路径…` }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    let summary = null;
    const updateSummary = () => { if (summary) summary.setText(`已选择 ${selected.size} 项`); };
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase(); const entries = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === this.options.entryType && (!query || entry.path.toLowerCase().includes(query))).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })).slice(0, 300);
      for (const entry of entries) {
        const row = list.createEl(multiple ? 'label' : 'button', { cls: `rh-next-picker-row ${selected.has(entry.path) ? 'is-selected' : ''}` });
        let box = null;
        if (multiple) { box = row.createEl('input', { type: 'checkbox' }); box.checked = selected.has(entry.path); }
        setIcon(row.createSpan(), this.options.entryType === 'folder' ? 'folder' : this.plugin.vaultFileKind(entry) === 'canvas' ? 'layout-dashboard' : 'file');
        const body = row.createDiv(); body.createEl('strong', { text: entry.name || entry.path.split('/').pop() }); body.createEl('small', { text: entry.path });
        if (multiple) box.addEventListener('change', () => { box.checked ? selected.add(entry.path) : selected.delete(entry.path); row.toggleClass('is-selected', box.checked); updateSummary(); });
        else row.addEventListener('click', () => { this.options.onChoose?.(entry); this.close(); });
      }
      if (!entries.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有匹配结果。' });
    };
    if (multiple) {
      const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions rh-next-vault-picker-actions' });
      summary = actions.createSpan({ cls: 'rh-next-picker-summary' });
      textButton(actions, '取消', 'x', () => this.close());
      textButton(actions, '关联所选', 'check', async () => {
        const chosen = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === this.options.entryType && selected.has(entry.path));
        try { await this.options.onChooseMany?.(chosen); this.close(); }
        catch (error) { new Notice(`关联失败：${error.message || String(error)}`, 6000); }
      }, 'is-primary');
      updateSummary();
    }
    search.addEventListener('input', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class VaultFolderPickerModal extends Modal {
  constructor(app, plugin, onChoose) { super(app); this.plugin = plugin; this.onChoose = onChoose; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-vault-picker-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' }); const copy = head.createDiv(); copy.createEl('h2', { text: '选择创建路径' }); copy.createEl('p', { text: '以搜索为主；最近和置顶路径只是快捷入口。' }); iconButton(head, 'x', '关闭', () => this.close());
    const search = input(this.contentEl, { placeholder: '搜索 Vault 文件夹…' }); const quick = this.contentEl.createDiv({ cls: 'rh-next-vault-path-quick' }); const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const choose = (pathValue) => { this.onChoose?.(pathValue); this.close(); };
    const paint = () => {
      quick.empty(); const pinned = this.plugin.state.uiState.pinnedVaultCreatePaths || []; const recent = this.plugin.state.uiState.recentVaultCreatePaths || [];
      for (const value of [...new Set([...pinned, ...recent])].filter((item) => item === '' || this.plugin.vaultEntry(item))) { const row = quick.createDiv({ cls: 'rh-next-vault-path-chip' }); textButton(row, value || 'Vault 根目录', pinned.includes(value) ? 'pin' : 'history', () => choose(value)); iconButton(row, 'pin', pinned.includes(value) ? '取消固定路径' : '固定路径', async () => { model.togglePinnedVaultCreatePath(this.plugin.state, value); await this.plugin.persist(); paint(); }, pinned.includes(value) ? 'is-primary' : 'is-subtle'); }
      list.empty(); const query = search.value.trim().toLowerCase(); const folders = this.plugin.allVaultEntries().filter((entry) => this.plugin.vaultEntryType(entry) === 'folder' && (!query || entry.path.toLowerCase().includes(query))).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })).slice(0, 300);
      const root = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(root.createSpan(), 'home'); const rootCopy = root.createDiv(); rootCopy.createEl('strong', { text: 'Vault 根目录' }); root.addEventListener('click', () => choose(''));
      for (const folder of folders) { const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), 'folder'); const body = row.createDiv(); body.createEl('strong', { text: folder.name }); body.createEl('small', { text: folder.path }); row.addEventListener('click', () => choose(folder.path)); }
    };
    search.addEventListener('input', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class VaultFolderBrowserModal extends Modal {
  constructor(app, plugin, folder, ref) { super(app); this.plugin = plugin; this.folder = folder; this.ref = ref; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-vault-folder-modal'); this.render(); }
  render() {
    this.contentEl.empty(); const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    if (this.folder.path !== this.ref.path) iconButton(head, 'arrow-left', '返回上一层', () => { const parentPath = this.folder.path.split('/').slice(0, -1).join('/'); this.folder = this.plugin.vaultEntry(parentPath.startsWith(this.ref.path) ? parentPath : this.ref.path) || this.plugin.vaultEntry(this.ref.path); this.render(); });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.folder.name || '项目文件夹' }); copy.createEl('p', { text: `${this.folder.path} · 只显示当前一层` }); iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' }); const children = Array.isArray(this.folder.children) ? [...this.folder.children].sort((a, b) => this.plugin.vaultEntryType(b).localeCompare(this.plugin.vaultEntryType(a)) || a.path.localeCompare(b.path, 'zh-CN')) : [];
    if (!children.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '这个文件夹是空的。' });
    for (const entry of children.slice(0, 300)) { const folder = this.plugin.vaultEntryType(entry) === 'folder'; const row = list.createEl('button', { cls: 'rh-next-picker-row' }); setIcon(row.createSpan(), folder ? 'folder' : 'file'); const body = row.createDiv(); body.createEl('strong', { text: entry.name }); body.createEl('small', { text: entry.path }); row.addEventListener('click', async () => { if (folder) { this.folder = entry; this.render(); } else await this.plugin.openVaultEntry(entry); }); }
  }
  onClose() { this.contentEl.empty(); }
}

class CleanupResourcesModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-cleanup-modal');
    this.render();
  }
  onClose() { this.contentEl.empty(); }

  render() {
    this.contentEl.empty();
    const preview = model.orphanCleanupPreview(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv();
    copy.createEl('h2', { text: '清理未利用资源' });
    copy.createEl('p', { text: '先看预览，再备份并清理索引；不会删除本地文件、网盘内容、B站视频或 Anki 卡组。' });
    iconButton(head, 'x', '关闭', () => this.close());

    const metrics = this.contentEl.createDiv({ cls: 'rh-next-metrics rh-next-cleanup-metrics' });
    for (const [value, label] of [[preview.totalActive, '当前正式资源'], [preview.candidateCount, '可清理'], [preview.retainedCount, '保留']]) {
      const card = metrics.createDiv(); card.createEl('strong', { text: String(value) }); card.createEl('small', { text: label });
    }
    this.contentEl.createEl('p', {
      cls: 'rh-next-help',
      text: '会保留：项目模块、收件箱、学习计划、笔记引用、最近打开记录，以及已经明确完成过的资源。'
    });

    if (!preview.candidateCount) {
      const empty = this.contentEl.createDiv({ cls: 'rh-next-empty' });
      setIcon(empty.createDiv(), 'circle-check-big');
      empty.createEl('strong', { text: '没有需要清理的资源' });
      empty.createEl('p', { text: '当前资源都仍有用途或使用记录。' });
      return;
    }

    const list = this.contentEl.createDiv({ cls: 'rh-next-cleanup-groups' });
    const groups = [...preview.groups].sort((left, right) => right.resources.length - left.resources.length);
    for (const group of groups.slice(0, 20)) {
      const row = list.createDiv({ cls: 'rh-next-cleanup-group' });
      const icon = row.createSpan(); setIcon(icon, group.detail.startsWith('OpenList') ? 'cloud' : 'folder');
      const text = row.createDiv(); text.createEl('strong', { text: group.label }); text.createEl('small', { text: group.detail });
      row.createEl('span', { cls: 'rh-next-cleanup-count', text: `${group.resources.length} 条` });
    }
    if (groups.length > 20) list.createEl('p', { cls: 'rh-next-help', text: `另外还有 ${groups.length - 20} 个较小分组。` });

    const warning = this.contentEl.createDiv({ cls: 'rh-next-cleanup-warning' });
    setIcon(warning.createSpan(), 'shield-check');
    warning.createEl('p', { text: '确认后会先在插件目录生成完整状态备份。顶部会出现低调的撤回按钮，可一键恢复到清理前。' });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    const confirm = textButton(actions, `备份并清理 ${preview.candidateCount} 条`, 'eraser', async () => {
      confirm.disabled = true;
      try {
        const candidateIds = preview.candidates.map((resource) => resource.id);
        const backupName = await this.plugin.createStateBackup('before-resource-cleanup');
        const removed = await this.plugin.mutate((state) => {
          const removedIds = model.deleteOrphanResources(state, candidateIds);
          model.recordLastAction(state, {
            type: 'cleanup-resources',
            backupName,
            resourceIds: removedIds,
            label: `清理 ${removedIds.length} 条未利用资源`
          });
          return removedIds;
        }, { render: false });
        new Notice(`已清理 ${removed.length} 条资源索引；原始资料未删除，可从顶部撤回。`, 7000);
        this.close();
        await this.plugin.workbenchLeaf?.view?.render?.();
      } catch (error) {
        confirm.disabled = false;
        new Notice(`清理失败：${error.message || String(error)}`, 7000);
      }
    }, 'is-danger');
  }
}

class UnifiedAddModal extends Modal {
  constructor(app, plugin, context = {}) {
    super(app); this.plugin = plugin; this.context = context; this.mode = context.mode || 'paste'; this.sourceType = context.sourceType || 'openlist';
    this.selectedResourceIds = new Set();
    this.expandedResourceGroups = new Set();
    this.resourceRenderLimit = 80;
    this.importCollection = false;
    this.autoGroupParts = false;
    this.autoGroupSize = 20;
  }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-add-modal');
    this.render();
  }
  onClose() {
    if (this.searchDebounceTimer) window.clearTimeout(this.searchDebounceTimer);
    this.localScanCancelled = true;
    this.contentEl.empty();
  }

  render() {
    const state = this.plugin.state;
    const projects = model.activeProjects(state);
    const projectId = this.context.projectId && state.projects[this.context.projectId] ? this.context.projectId : projects[0]?.id || '';
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.mode === 'plan' ? '添加学习计划' : '添加内容' }); copy.createEl('p', { text: '所有入口在同一个弹窗中直接使用，不再进入二级菜单。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const modes = this.contentEl.createDiv({ cls: 'rh-next-add-modes' });
    const options = this.mode === 'plan'
      ? [['plan', '选择项目内容', 'list-todo']]
      : [['paste', '粘贴或文件', 'clipboard-paste'], ['inbox', '从收件箱', 'inbox'], ['library', '从资源库', 'library'], ['source', '从来源连接', 'plug-zap']];
    for (const [id, label, icon] of options) textButton(modes, label, icon, () => {
      this.mode = id; this.context.projectId = this.projectSelect?.value || projectId;
      this.selectedResourceIds.clear(); this.expandedResourceGroups.clear(); this.resourceRenderLimit = 80;
      this.render();
    }, this.mode === id ? 'is-active' : '');
    const form = this.contentEl.createDiv({ cls: 'rh-next-add-form' });
    if (!projects.length && this.mode !== 'paste' && this.mode !== 'source') {
      this.renderEmptyState(form, '先创建项目，才能把资源加入长期组织。');
      textButton(form, '新建项目', 'folder-plus', () => new TextPromptModal(this.app, '新建项目', '项目名称', async (value) => { const project = await this.plugin.mutate((s) => model.createProject(s, value), { render: false }); this.context.projectId = project.id; this.render(); }).open(), 'is-primary');
      return;
    }
    if (this.mode === 'paste') this.renderPaste(form, projectId, projects);
    else if (this.mode === 'inbox') this.renderExisting(form, projectId, projects, state.inbox.map((id) => state.resources[id]).filter(Boolean), '收件箱还没有资源。');
    else if (this.mode === 'library') this.renderExisting(form, projectId, projects, Object.values(state.resources).filter((resource) => !resource.deletedAt), '资源库还是空的。');
    else if (this.mode === 'plan') this.renderPlanPicker(form, projectId, projects);
    else this.renderSources(form, projectId, projects);
  }

  projectAndModuleFields(parent, projectId, projects) {
    const row = parent.createDiv({ cls: 'rh-next-form-grid' });
    const projectField = row.createDiv({ cls: 'rh-next-field' }); projectField.createEl('label', { text: '项目' });
    const projectSelect = projectField.createEl('select', { cls: 'rh-next-input' }); this.projectSelect = projectSelect;
    for (const project of projects) projectSelect.createEl('option', { text: project.title, value: project.id });
    projectSelect.value = projectId || projects[0]?.id || '';
    const moduleField = row.createDiv({ cls: 'rh-next-field' }); moduleField.createEl('label', { text: '学习模块' });
    const moduleSelect = moduleField.createEl('select', { cls: 'rh-next-input' }); this.moduleSelect = moduleSelect;
    const fillModules = () => {
      moduleSelect.empty();
      for (const module of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: module.title, value: module.id });
      moduleSelect.createEl('option', { text: '＋ 新建模块', value: '__new__' });
      if (this.context.moduleId && this.plugin.state.modules[this.context.moduleId]?.projectId === projectSelect.value) moduleSelect.value = this.context.moduleId;
    };
    projectSelect.addEventListener('change', fillModules); fillModules();
    return { projectSelect, moduleSelect };
  }

  async resolveModule(projectId, moduleValue, suggestedTitle = '学习材料') {
    if (moduleValue && moduleValue !== '__new__') return moduleValue;
    const title = await new Promise((resolve) => {
      new TextPromptModal(this.app, '新建学习模块', '模块名称', resolve, {
        initialValue: suggestedTitle,
        onCancel: () => resolve('')
      }).open();
    });
    if (!safeText(title)) throw new Error('已取消新建模块。');
    const module = model.createModule(this.plugin.state, projectId, title);
    return module.id;
  }

  requestDestination(suggestedTitle = '学习材料') {
    return new Promise((resolve) => {
      new ImportDestinationModal(this.app, this.plugin, { suggestedTitle, onChoose: resolve, onCancel: () => resolve(null) }).open();
    });
  }

  async previewLocalFolder(rootPath, status = null) {
    const resolvedRoot = path.resolve(rootPath);
    const stat = await fs.promises.stat(resolvedRoot);
    if (!stat.isDirectory()) throw new Error('选择的路径不是文件夹。');
    this.localScanCancelled = false;
    const files = await this.plugin.scanLocalFolder(resolvedRoot, {
      isCancelled: () => this.localScanCancelled,
      onProgress: ({ found, directories, failures }) => status?.setText(`正在扫描：${directories} 个目录 · ${found} 个支持文件 · ${failures} 个失败`)
    });
    if (!files.length) throw new Error(files.failures?.length ? `没有找到支持的文件；${files.failures.length} 个目录读取失败。` : '没有找到支持的文件。');
    new LocalFolderImportPreviewModal(this.app, this.plugin, resolvedRoot, files).open();
    return files;
  }

  recordAddAction(results, options = {}) {
    const resourceIds = [...new Set((results || []).map((result) => result?.resource?.id).filter(Boolean))];
    const linkedResourceIds = [...new Set((results || []).filter((result) => result?.linked).map((result) => result.resource.id))];
    const createdResourceIds = [...new Set((results || []).filter((result) => !result?.reused).map((result) => result.resource.id))];
    const inboxAddedResourceIds = [...new Set((results || []).filter((result) => result?.inboxAdded).map((result) => result.resource.id))];
    if (!resourceIds.length) return;
    model.recordLastAction(this.plugin.state, {
      type: 'add-resources',
      moduleId: options.moduleId || '',
      inbox: Boolean(options.inbox),
      resourceIds,
      linkedResourceIds,
      createdResourceIds,
      inboxAddedResourceIds,
      createdResourceGroupIds: [...new Set(options.createdResourceGroupIds || [])],
      label: options.label || `添加 ${resourceIds.length} 条资源`
    });
  }

  async handlePaste(fields, rawValue, titleOverride, inboxOnly, status) {
    const value = safeText(rawValue);
    if (!value) throw new Error('请先粘贴链接或填写文件路径。');
    const sources = Object.values(this.plugin.state.sources);
    const openListInput = model.parseOpenListUrl(value, sources);
    if (openListInput) {
      const source = this.plugin.findOpenListSource(openListInput);
      if (!source) {
        this.context.openListInput = openListInput;
        this.context.projectId = fields.projectSelect.value;
        this.context.moduleId = fields.moduleSelect.value;
        this.mode = 'source'; this.sourceType = 'openlist';
        new Notice('已识别 OpenList 目录，请先保存这个来源连接；保存连接不会扫描或创建资源。', 6000);
        this.render();
        return { redirected: true };
      }
      const rootPath = await this.plugin.resolveOpenListPath(source, openListInput);
      status.setText(`已打开目录浏览：${rootPath}`);
      new OpenListBrowserModal(this.app, this.plugin, source, rootPath).open();
      this.close();
      return { redirected: true };
    }

    const bili = model.parseBiliVideoUrl(value);
    if (bili) {
      status.setText(`正在读取 B站标题与分P：${bili.bvid}`);
      const cached = this.previewResolved?.key === bili.bvid.toUpperCase() ? this.previewResolved.result : null;
      const result = cached || await this.plugin.fetchBiliVideo(bili.bvid);
      if (!cached) {
        this.autoGroupParts = model.defaultResourceAutoGroupEnabled(result.items.length);
        this.autoGroupSize = 20;
      }
      const selectedItems = bili.page > 1 ? result.items.filter((item) => item.page === bili.page) : result.items;
      const items = this.importCollection && result.collection?.items?.length
        ? result.collection.items
        : (selectedItems.length ? selectedItems : result.items);
      const moduleId = inboxOnly ? '' : await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value, titleOverride || result.title);
      const addedResults = [];
      for (const item of items) {
        const itemBvid = String(item.bvid || bili.bvid).toUpperCase();
        const descriptor = {
          kind: 'video', title: items.length === 1 ? titleOverride || item.title : item.title,
          canonicalKey: `bili:${itemBvid}:p${item.page || 1}`,
          sourceId: '', launcher: { type: 'potplayer', target: item.url },
          metadata: { bvid: itemBvid, page: item.page || 1, originalUrl: item.url, owner: result.owner, cover: item.cover || result.cover, collectionTitle: this.importCollection ? result.collection?.title || '' : '' }
        };
        addedResults.push(inboxOnly
          ? model.upsertInboxDescriptor(this.plugin.state, descriptor)
          : model.upsertResourceDescriptor(this.plugin.state, moduleId, descriptor));
      }
      let grouping = null;
      const shouldAutoGroup = !inboxOnly && !this.importCollection && bili.page <= 1 && result.items.length > 1 && this.autoGroupParts;
      if (shouldAutoGroup) {
        grouping = model.autoGroupResources(this.plugin.state, moduleId, addedResults.map((item) => item.resource.id), {
          size: this.autoGroupSize,
          key: `bili:${bili.bvid.toUpperCase()}`
        });
      }
      this.recordAddAction(addedResults, {
        moduleId,
        inbox: inboxOnly,
        createdResourceGroupIds: grouping?.createdGroupIds || [],
        label: this.importCollection ? `导入合集：${result.collection?.title || result.title}` : `添加 B站视频：${result.title}`
      });
      await this.plugin.persist();
      new Notice(this.importCollection ? `已导入合集中的 ${items.length} 个视频。` : items.length > 1 ? `已按分P导入 ${items.length} 个视频。` : `已添加：${titleOverride || items[0].title}`);
      return { count: items.length, projectId: fields.projectSelect.value };
    }

    let moduleId = '';
    let addResult;
    if (inboxOnly) addResult = model.addInboxResource(this.plugin.state, value, titleOverride);
    else {
      moduleId = await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value);
      addResult = model.addResource(this.plugin.state, moduleId, value, titleOverride);
    }
    this.recordAddAction([addResult], { moduleId, inbox: inboxOnly, label: `添加资源：${addResult.resource.title}` });
    await this.plugin.persist();
    return { count: 1, projectId: fields.projectSelect.value };
  }

  renderPaste(parent, projectId, projects) {
    if (!projects.length) {
      const create = parent.createDiv({ cls: 'rh-next-field' }); create.createEl('label', { text: '先创建项目' });
      const name = input(create, { placeholder: '例如：英语学习' });
      textButton(parent, '创建并继续', 'folder-plus', async () => { const project = await this.plugin.mutate((state) => model.createProject(state, name.value), { render: false }); this.context.projectId = project.id; this.render(); }, 'is-primary');
      return;
    }
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    const workspace = parent.createDiv({ cls: 'rh-next-paste-workspace' });
    const inputs = workspace.createDiv({ cls: 'rh-next-paste-inputs' });
    const details = workspace.createDiv({ cls: 'rh-next-preview-panel' });
    const resourceField = inputs.createDiv({ cls: 'rh-next-field' }); resourceField.createEl('label', { text: '链接、Anki 卡组或本地文件路径' });
    const raw = input(resourceField, { multiline: true, placeholder: '粘贴 https://…、jv://…、anki: 卡组名，或 C:\\课程\\01.mp4' });
    const dropZone = resourceField.createDiv({ cls: 'rh-next-local-drop-zone' }); setIcon(dropZone.createSpan(), 'folder-input'); dropZone.createSpan({ text: '拖入本地文件或文件夹；文件夹会先扫描并预览' });
    const preview = resourceField.createDiv({ cls: 'rh-next-parse-preview' });
    const titleField = inputs.createDiv({ cls: 'rh-next-field' }); titleField.createEl('label', { text: '显示名称（可选）' });
    const title = input(titleField, { placeholder: '留空则自动读取标题' });
    const groupSettings = inputs.createDiv({ cls: 'rh-next-bili-group-settings' });
    const paintBiliGrouping = (result) => {
      groupSettings.empty();
      const count = Number(result?.items?.length || 0);
      groupSettings.style.display = count > 1 ? '' : 'none';
      if (count <= 1) return;
      const heading = groupSettings.createDiv({ cls: 'rh-next-bili-group-heading' });
      const copy = heading.createDiv(); copy.createEl('strong', { text: '自动分组' }); copy.createEl('small', { text: '按 B站原始 P 序号整理到当前学习模块' });
      const toggle = heading.createEl('label', { cls: 'rh-next-switch' });
      const checkbox = toggle.createEl('input', { type: 'checkbox' }); checkbox.checked = this.autoGroupParts;
      toggle.createSpan();
      const grid = groupSettings.createDiv({ cls: 'rh-next-bili-group-grid' });
      const sizeField = grid.createDiv({ cls: 'rh-next-field' }); sizeField.createEl('label', { text: '每组数量' });
      const sizeInput = sizeField.createEl('input', { cls: 'rh-next-input', type: 'number', attr: { min: '1', max: '200', step: '1' } }); sizeInput.value = String(this.autoGroupSize);
      const summary = grid.createDiv({ cls: 'rh-next-bili-group-summary' });
      const paintSummary = () => {
        const size = Math.max(1, Math.min(200, Math.floor(Number(this.autoGroupSize || 20))));
        const enabled = this.autoGroupParts && !this.importCollection;
        summary.empty(); summary.createEl('small', { text: '预计结果' });
        summary.createEl('strong', { text: enabled ? `${Math.ceil(count / size)} 组 · ${count}P` : `未分组 · ${count}P` });
        summary.createEl('span', { text: this.importCollection ? '合集导入暂不创建分组' : enabled ? '第一组、第二组……' : '保持原始顺序' });
        checkbox.disabled = this.importCollection;
        sizeInput.disabled = !enabled;
      };
      checkbox.addEventListener('change', () => { this.autoGroupParts = checkbox.checked; paintSummary(); });
      sizeInput.addEventListener('change', () => { this.autoGroupSize = Math.max(1, Math.min(200, Math.floor(Number(sizeInput.value || 20)))); sizeInput.value = String(this.autoGroupSize); paintSummary(); });
      paintSummary();
    };
    const paintDetailsEmpty = (titleText = '解析预览', detail = '粘贴链接后，这里会显示标题、封面、分P或合集内容。') => {
      details.empty();
      const empty = details.createDiv({ cls: 'rh-next-preview-empty' });
      setIcon(empty.createSpan(), 'scan-search');
      empty.createEl('strong', { text: titleText });
      empty.createEl('small', { text: detail });
    };
    const paintBiliDetails = (result) => {
      details.empty();
      const hero = details.createDiv({ cls: 'rh-next-preview-hero' });
      if (result.cover) hero.createEl('img', { attr: { src: result.cover, alt: '' } });
      const copy = hero.createDiv(); copy.createEl('small', { text: result.owner ? `UP · ${result.owner}` : 'B站视频' }); copy.createEl('strong', { text: result.title });
      if (result.description) copy.createEl('p', { text: result.description });
      const sections = [];
      if (result.items?.length > 1) sections.push({ title: `分P · ${result.items.length} 条`, items: result.items });
      if (result.collection?.items?.length) sections.push({ title: `${result.collection.title} · ${result.collection.items.length} 条`, items: result.collection.items, collection: true });
      if (!sections.length) {
        const single = details.createDiv({ cls: 'rh-next-preview-single' }); setIcon(single.createSpan(), 'play-circle');
        const text = single.createDiv(); text.createEl('strong', { text: '单个视频' }); text.createEl('small', { text: '将作为一条可直接启动 PotPlayer 的资源添加。' });
      }
      for (const section of sections) {
        const header = details.createDiv({ cls: 'rh-next-preview-section-head' }); header.createEl('strong', { text: section.title });
        if (section.collection) {
          const option = header.createEl('label', { cls: 'rh-next-preview-import-toggle' });
          const checkbox = option.createEl('input', { type: 'checkbox' }); checkbox.checked = this.importCollection;
          option.createSpan({ text: '导入整个合集' });
          checkbox.addEventListener('change', () => { this.importCollection = checkbox.checked; paintBiliGrouping(result); });
        }
        const list = details.createDiv({ cls: 'rh-next-preview-video-list' });
        for (const item of section.items.slice(0, 12)) {
          const row = list.createDiv({ cls: 'rh-next-preview-video-row' });
          setIcon(row.createSpan(), 'play');
          const text = row.createDiv(); text.createEl('strong', { text: item.title });
          text.createEl('small', { text: item.duration ? formatDuration(item.duration) : item.bvid || `P${item.page || 1}` });
        }
        if (section.items.length > 12) list.createEl('small', { cls: 'rh-next-preview-more', text: `还有 ${section.items.length - 12} 条，导入后可在模块中查看。` });
      }
    };
    paintDetailsEmpty();
    const paintPreview = (icon, label, detail, error = false) => {
      preview.empty(); setIcon(preview.createSpan({ cls: 'rh-next-parse-preview-icon' }), icon);
      const copy = preview.createDiv(); copy.createEl('strong', { text: label }); copy.createEl('small', { text: detail });
      preview.toggleClass('is-error', error);
    };
    const updatePreview = () => {
      if (this.previewTimer) window.clearTimeout(this.previewTimer);
      const requestId = (this.previewRequestId || 0) + 1; this.previewRequestId = requestId;
      const value = safeText(raw.value);
      preview.style.display = value ? 'flex' : 'none';
      if (!value) { this.importCollection = false; this.autoGroupParts = false; groupSettings.empty(); groupSettings.style.display = 'none'; paintDetailsEmpty(); return; }
      groupSettings.empty(); groupSettings.style.display = 'none';
      try {
        const openList = model.parseOpenListUrl(value, Object.values(this.plugin.state.sources));
        if (openList) {
          paintPreview('cloud', '已识别：OpenList 目录', `${openList.title} · ${openList.rootPath}`);
          details.empty();
          const cloud = details.createDiv({ cls: 'rh-next-preview-source' }); setIcon(cloud.createSpan(), 'cloud');
          const text = cloud.createDiv(); text.createEl('small', { text: 'OpenList 目录' }); text.createEl('strong', { text: openList.title || '远程视频目录' }); text.createEl('code', { text: openList.rootPath });
          details.createEl('p', { cls: 'rh-next-help', text: this.plugin.findOpenListSource(openList) ? '连接已匹配。添加后会递归读取视频，并按目录折叠成资源组。' : '尚未匹配连接。添加时会先进入同一弹窗中的 OpenList 配置。' });
          return;
        }
        const bili = model.parseBiliVideoUrl(value);
        if (bili) {
          this.importCollection = false;
          paintPreview('clapperboard', '已识别：B站视频', `${bili.bvid} · 正在读取标题……`);
          paintDetailsEmpty('正在读取视频详情', `${bili.bvid} · 获取封面、分P与所属合集…`);
          this.previewTimer = window.setTimeout(async () => {
            try {
              const result = await this.plugin.fetchBiliVideo(bili.bvid);
              if (this.previewRequestId !== requestId) return;
              if (this.previewResolved?.key !== bili.bvid.toUpperCase()) {
                this.autoGroupParts = model.defaultResourceAutoGroupEnabled(result.items.length);
                this.autoGroupSize = 20;
              }
              this.previewResolved = { key: bili.bvid.toUpperCase(), result };
              paintPreview('clapperboard', result.items.length > 1 ? `已识别：B站分P视频（${result.items.length}P）` : '已识别：B站视频', result.title);
              paintBiliGrouping(result);
              paintBiliDetails(result);
            } catch (error) {
              if (this.previewRequestId === requestId) {
                paintPreview('clapperboard', '已识别：B站视频', `${bili.bvid} · 标题读取失败：${error.message || String(error)}`, true);
                paintDetailsEmpty('详情读取失败', error.message || String(error));
              }
            }
          }, 450);
          return;
        }
        const inferred = model.inferResource(value);
        paintPreview(kindIcon(inferred.kind), `已识别：${kindLabel(inferred.kind)}`, inferred.title);
        details.empty();
        const generic = details.createDiv({ cls: 'rh-next-preview-source' }); setIcon(generic.createSpan(), kindIcon(inferred.kind));
        const text = generic.createDiv(); text.createEl('small', { text: kindLabel(inferred.kind) }); text.createEl('strong', { text: inferred.title }); text.createEl('code', { text: value });
      } catch (error) {
        paintPreview('circle-help', '尚未识别为可添加资源', error.message || String(error), true);
        paintDetailsEmpty('等待有效资源', '可粘贴 B站视频、OpenList 目录、网页、Anki 卡组或本地文件。');
      }
    };
    raw.addEventListener('input', updatePreview);
    const localPathFromFile = (file) => webUtils?.getPathForFile?.(file) || file?.path || '';
    const handleLocalDrop = async (event) => {
      event.preventDefault(); event.stopPropagation(); dropZone.removeClass('is-dragging');
      const file = event.dataTransfer?.files?.[0]; const droppedPath = localPathFromFile(file);
      if (!droppedPath) return new Notice('无法读取拖入项目的本地路径。', 5000);
      try {
        const stat = await fs.promises.stat(droppedPath);
        if (stat.isDirectory()) {
          dropZone.addClass('is-busy'); dropZone.querySelector('span:last-child')?.setText('正在扫描文件夹；点击这里可取消');
          await this.previewLocalFolder(droppedPath);
        } else {
          raw.value = droppedPath; raw.dispatchEvent(new Event('input'));
        }
      } catch (error) { new Notice(`无法解析拖入内容：${error.message || String(error)}`, 6000); }
      finally { dropZone.removeClass('is-busy'); dropZone.querySelector('span:last-child')?.setText('拖入本地文件或文件夹；文件夹会先扫描并预览'); }
    };
    for (const target of [dropZone, raw]) {
      target.addEventListener('dragover', (event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); event.stopPropagation(); dropZone.addClass('is-dragging'); } });
      target.addEventListener('dragleave', () => dropZone.removeClass('is-dragging'));
      target.addEventListener('drop', handleLocalDrop);
    }
    dropZone.addEventListener('click', () => { if (dropZone.hasClass('is-busy')) this.localScanCancelled = true; });
    updatePreview();
    const status = parent.createEl('p', { cls: 'rh-next-help', text: 'B站会读取标题、分P和所属合集；OpenList 目录会递归导入视频，并在打开时刷新签名。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    const run = async (inboxOnly) => {
      if (this.busy) return;
      this.busy = true; actions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      try {
        const result = await this.handlePaste(fields, raw.value, title.value, inboxOnly, status);
        if (result?.redirected) return;
        this.close();
        if (inboxOnly) { new Notice('已放入收件箱。'); await this.plugin.workbenchLeaf?.view?.render?.(); }
        else await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: result.projectId });
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
      finally { this.busy = false; actions.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
    };
    textButton(actions, '仅放入收件箱', 'inbox', () => run(true));
    textButton(actions, '添加到项目', 'plus', () => run(false), 'is-primary');
  }

  resourceGroupInfo(resource) {
    return model.resourcePickerGroupInfo(resource, this.plugin.state.sources);
  }

  renderExisting(parent, projectId, projects, resources, emptyText) {
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    const toolbar = parent.createDiv({ cls: 'rh-next-picker-toolbar' });
    const search = input(toolbar, { placeholder: '搜索标题、类型或来源目录……' });
    const summary = toolbar.createEl('span', { cls: 'rh-next-picker-summary' });
    const list = parent.createDiv({ cls: 'rh-next-resource-groups' });
    const selected = this.selectedResourceIds;
    const pickerIndex = model.buildResourcePickerIndex(resources, this.plugin.state.sources);
    const resourceRow = (container, resource, repaint) => {
      const row = container.createDiv({ cls: `rh-next-picker-row ${selected.has(resource.id) ? 'is-selected' : ''}` });
      const mark = row.createSpan(); setIcon(mark, selected.has(resource.id) ? 'circle-check-big' : kindIcon(resource.kind));
      const text = row.createDiv(); text.createEl('strong', { text: resource.title }); text.createEl('small', { text: `${kindLabel(resource.kind)}${resource.lastOpenedAt ? ' · 最近打开过' : ''}` });
      row.addEventListener('click', () => { selected.has(resource.id) ? selected.delete(resource.id) : selected.add(resource.id); repaint(); });
    };
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      summary.setText(`已选 ${selected.size} · 共 ${resources.length} 条 / ${pickerIndex.groups.length} 组`);
      if (query) {
        const matches = pickerIndex.entries.filter((entry) => entry.searchText.includes(query)).map((entry) => entry.resource);
        if (!matches.length) return this.renderEmptyState(list, '没有找到匹配资源。');
        const visible = matches.slice(0, this.resourceRenderLimit);
        for (const resource of visible) resourceRow(list, resource, paint);
        if (matches.length > visible.length) textButton(list, `继续加载（剩余 ${matches.length - visible.length} 条）`, 'chevrons-down', () => { this.resourceRenderLimit += 80; paint(); }, 'is-subtle');
        return;
      }
      if (!resources.length) return this.renderEmptyState(list, emptyText);
      for (const group of pickerIndex.groups) {
        if (group.resources.length === 1) { resourceRow(list, group.resources[0], paint); continue; }
        const expanded = this.expandedResourceGroups.has(group.key);
        const card = list.createDiv({ cls: `rh-next-picker-group ${expanded ? 'is-expanded' : ''}` });
        const header = card.createDiv({ cls: 'rh-next-picker-group-head' });
        setIcon(header.createSpan(), expanded ? 'chevron-down' : 'chevron-right');
        const copy = header.createDiv(); copy.createEl('strong', { text: group.label }); copy.createEl('small', { text: `${group.detail} · ${group.resources.length} 条` });
        const selectedCount = group.resources.filter((resource) => selected.has(resource.id)).length;
        const selectAll = header.createEl('button', { cls: 'clickable-icon rh-next-group-select', attr: { type: 'button', 'aria-label': '选择整个资源组' } });
        setIcon(selectAll, selectedCount === group.resources.length ? 'circle-check-big' : 'circle');
        selectAll.createSpan({ text: selectedCount ? `${selectedCount}/${group.resources.length}` : '全选' });
        selectAll.addEventListener('click', (event) => {
          event.stopPropagation();
          const shouldSelect = selectedCount !== group.resources.length;
          for (const resource of group.resources) shouldSelect ? selected.add(resource.id) : selected.delete(resource.id);
          paint();
        });
        header.addEventListener('click', () => { expanded ? this.expandedResourceGroups.delete(group.key) : this.expandedResourceGroups.add(group.key); paint(); });
        if (expanded) {
          const body = card.createDiv({ cls: 'rh-next-picker-group-body' });
          const limitKey = `groupLimit:${group.key}`;
          const limit = this[limitKey] || 80;
          for (const resource of group.resources.slice(0, limit)) resourceRow(body, resource, paint);
          if (group.resources.length > limit) textButton(body, `继续加载（剩余 ${group.resources.length - limit} 条）`, 'chevrons-down', () => { this[limitKey] = limit + 80; paint(); }, 'is-subtle');
        }
      }
    };
    search.addEventListener('input', () => {
      if (this.searchDebounceTimer) window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = window.setTimeout(() => { this.resourceRenderLimit = 80; paint(); }, 180);
    });
    paint();
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '加入所选资源', 'plus', async () => {
      if (!selected.size) return new Notice('请先选择资源。');
      try {
        const moduleId = await this.resolveModule(fields.projectSelect.value, fields.moduleSelect.value);
        const module = this.plugin.state.modules[moduleId];
        const existingIds = new Set(module.resourceIds || []);
        const addedIds = [...selected].filter((id) => !existingIds.has(id));
        if (!addedIds.length) return new Notice('所选资源已经在这个模块中。');
        model.linkResourcesToModule(this.plugin.state, moduleId, addedIds);
        this.plugin.state.inbox = this.plugin.state.inbox.filter((id) => !selected.has(id));
        model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId, inbox: false, resourceIds: addedIds, linkedResourceIds: addedIds, createdResourceIds: [], restoreInboxIds: this.mode === 'inbox' ? addedIds : [], label: `${this.mode === 'inbox' ? '从收件箱' : '从资源库'}加入 ${addedIds.length} 条资源` });
        await this.plugin.persist(); new Notice(`已加入 ${addedIds.length} 条资源。`); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: fields.projectSelect.value });
      } catch (error) { new Notice(error.message || String(error)); }
    }, 'is-primary');
  }

  renderPlanPicker(parent, projectId, projects) {
    if (!projects.length) return this.renderEmptyState(parent, '还没有项目。');
    const fields = this.projectAndModuleFields(parent, projectId, projects);
    fields.moduleSelect.querySelector('option[value="__new__"]')?.remove();
    const target = parent.createDiv({ cls: 'rh-next-field' }); target.createEl('label', { text: '每日目标次数' });
    const amount = input(target, { type: 'number', value: '1' }); amount.min = '1'; amount.max = '99';
    const schedule = parent.createDiv({ cls: 'rh-next-field' }); schedule.createEl('label', { text: '刷新日' });
    const weekdayRow = schedule.createDiv({ cls: 'rh-next-weekday-row' });
    const weekdayInputs = new Map();
    for (const [day, label] of [[1, '一'], [2, '二'], [3, '三'], [4, '四'], [5, '五'], [6, '六'], [0, '日']]) {
      const chip = weekdayRow.createEl('label', { cls: 'rh-next-weekday-chip' });
      const checkbox = chip.createEl('input', { type: 'checkbox' }); checkbox.checked = true;
      chip.createSpan({ text: label }); weekdayInputs.set(day, checkbox);
    }
    const reset = parent.createDiv({ cls: 'rh-next-field' }); reset.createEl('label', { text: '每日刷新时间（整点）' });
    const resetHour = input(reset, { type: 'number', value: '4' }); resetHour.min = '0'; resetHour.max = '23';
    reset.createEl('small', { text: '默认凌晨 4 点；凌晨 4 点前仍算前一个学习日。', cls: 'rh-next-help' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '创建计划', 'repeat-2', async () => {
      const moduleId = fields.moduleSelect.value;
      if (!moduleId) return new Notice('这个项目还没有模块。');
      const weekdays = [...weekdayInputs.entries()].filter(([, checkbox]) => checkbox.checked).map(([day]) => day);
      if (!weekdays.length) return new Notice('请至少选择一个刷新日。');
      const module = this.plugin.state.modules[moduleId];
      const result = model.createPlanForTarget(this.plugin.state, fields.projectSelect.value, 'module', moduleId, module.title);
      result.plan.dailyTarget = Math.max(1, Number(amount.value || 1));
      result.plan.schedule = { type: 'weekly', weekdays };
      result.plan.resetHour = Math.max(0, Math.min(23, Number(resetHour.value || 4)));
      await this.plugin.persist(); new Notice(result.reused ? '已有相同计划，已更新目标。' : '已创建学习计划。'); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('today');
    }, 'is-primary');
  }

  renderSources(parent, projectId, projects) {
    parent.createEl('p', { text: '连接配置保存在插件后台；密码由 Windows 安全存储加密，项目里只显示普通资源。', cls: 'rh-next-help' });
    const grid = parent.createDiv({ cls: 'rh-next-source-grid' });
    for (const [type, name, icon, detail] of [['openlist', 'OpenList', 'cloud', '导入远程目录'], ['anki', 'Anki', 'layers-3', '选择本地卡组'], ['local-folder', '本地文件夹', 'folder', '扫描课程目录'], ['bilibili', 'B站订阅', 'rss', '保存UP主页']]) {
      const card = grid.createDiv({ cls: `rh-next-source-card ${this.sourceType === type ? 'is-selected' : ''}` }); setIcon(card.createSpan(), icon); const text = card.createDiv(); text.createEl('strong', { text: name }); text.createEl('small', { text: detail }); setIcon(card.createSpan(), 'chevron-right');
      card.addEventListener('click', () => { this.sourceType = type; this.context.projectId = projectId; this.render(); });
    }
    const panel = parent.createDiv({ cls: 'rh-next-source-config' });
    if (this.sourceType === 'anki') this.renderAnkiSource(panel);
    else if (this.sourceType === 'local-folder') this.renderLocalFolderSource(panel);
    else if (this.sourceType === 'bilibili') this.renderBilibiliSource(panel);
    else this.renderOpenListSource(panel);
  }

  renderOpenListSource(parent) {
    const draft = this.context.openListInput || null;
    const existing = (draft ? this.plugin.findOpenListSource(draft) : null) || Object.values(this.plugin.state.sources).find((source) => source.type === 'openlist' && !source.deletedAt) || {};
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const baseField = grid.createDiv({ cls: 'rh-next-field' }); baseField.createEl('label', { text: 'OpenList 地址' }); const baseUrl = input(baseField, { value: draft?.baseUrl || existing.baseUrl || 'http://127.0.0.1:5244' });
    const rootField = grid.createDiv({ cls: 'rh-next-field' }); rootField.createEl('label', { text: '远程目录' }); const rootPath = input(rootField, { value: draft?.rootPath || existing.rootPath || '/', placeholder: '/夸克网盘/课程' });
    const userField = grid.createDiv({ cls: 'rh-next-field' }); userField.createEl('label', { text: '只读用户名（可选）' }); const username = input(userField, { value: existing.username || '' });
    const passField = grid.createDiv({ cls: 'rh-next-field' }); passField.createEl('label', { text: '密码（留空保留已保存密码）' }); const password = input(passField, { type: 'password', placeholder: existing.encryptedPassword ? '已安全保存' : '' });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '保存连接不会扫描或创建资源；浏览目录后由你明确选择要导入的内容。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    const buildSourceInput = () => {
      const normalizedBase = model.normalizeOpenListBaseUrl(baseUrl.value.trim());
      const encryptedPassword = password.value ? this.plugin.encryptSecret(password.value) : existing.encryptedPassword || '';
      return { type: 'openlist', baseUrl: normalizedBase, rootPath: rootPath.value.trim() || '/', username: username.value.trim(), encryptedPassword, identity: existing.identity || normalizedBase.toLowerCase() };
    };
    textButton(actions, '测试连接', 'plug-zap', async () => {
      try {
        const draftSource = { id: existing.id || 'openlist-test', ...buildSourceInput() };
        this.plugin.openListTokens.delete(draftSource.id);
        const token = await this.plugin.loginOpenList(draftSource);
        await this.plugin.getOpenList(draftSource, model.normalizeOpenListPath(rootPath.value || '/'), token);
        status.setText('连接成功；尚未扫描或创建任何资源。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    });
    textButton(actions, '保存连接', 'save', async () => {
      try {
        const sourceInput = buildSourceInput();
        const draftSource = { id: existing.id || 'openlist-save-test', ...sourceInput };
        this.plugin.openListTokens.delete(draftSource.id);
        const token = await this.plugin.loginOpenList(draftSource);
        await this.plugin.getOpenList(draftSource, model.normalizeOpenListPath(draftSource.rootPath || '/'), token);
        const { source } = model.upsertSource(this.plugin.state, sourceInput);
        if (token) this.plugin.openListTokens.set(source.id, token);
        await this.plugin.persist();
        status.setText('连接已保存；没有扫描或创建资源。');
        new Notice('OpenList 连接已保存。');
        new OpenListBrowserModal(this.app, this.plugin, source, draft?.rootPath || source.rootPath || '/').open();
      } catch (error) { status.setText(`保存失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    }, 'is-primary');
    if (existing.id) textButton(actions, '浏览目录', 'folder-open', () => new OpenListBrowserModal(this.app, this.plugin, existing, draft?.rootPath || existing.rootPath || '/').open());
  }

  renderAnkiSource(parent) {
    const existing = Object.values(this.plugin.state.sources).find((source) => source.type === 'anki' && !source.deletedAt) || {};
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const endpointField = grid.createDiv({ cls: 'rh-next-field' }); endpointField.createEl('label', { text: 'AnkiConnect 地址' }); const endpoint = input(endpointField, { value: existing.endpoint || 'http://127.0.0.1:8765' });
    const exeField = grid.createDiv({ cls: 'rh-next-field' }); exeField.createEl('label', { text: 'anki.exe（未启动时自动打开）' }); const executable = input(exeField, { value: existing.executablePath || this.plugin.resolveAnkiExecutable(''), placeholder: 'C:\\Program Files\\Anki\\anki.exe' });
    const profileField = grid.createDiv({ cls: 'rh-next-field' }); profileField.createEl('label', { text: 'Profile（可选）' }); const profile = input(profileField, { value: existing.profile || '' });
    const timeoutField = grid.createDiv({ cls: 'rh-next-field' }); timeoutField.createEl('label', { text: '启动等待毫秒' }); const timeout = input(timeoutField, { type: 'number', value: String(existing.startupTimeout || 30000) });
    const resultBox = parent.createDiv({ cls: 'rh-next-picker-list' });
    const selected = new Set();
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '读取卡组', 'refresh-cw', async () => {
      try {
        const { source } = model.upsertSource(this.plugin.state, { type: 'anki', endpoint: endpoint.value.trim(), executablePath: executable.value.trim(), profile: profile.value.trim(), startupTimeout: Number(timeout.value || 30000), identity: endpoint.value.trim().toLowerCase() });
        await this.plugin.persist();
        await this.plugin.ensureAnkiRunning();
        const decks = await this.plugin.invokeAnki('deckNames');
        resultBox.empty();
        for (const deck of decks || []) {
          const row = resultBox.createDiv({ cls: 'rh-next-picker-row' }); const mark = row.createSpan(); setIcon(mark, 'layers-3'); row.createEl('strong', { text: deck });
          row.addEventListener('click', () => { selected.has(deck) ? selected.delete(deck) : selected.add(deck); row.toggleClass('is-selected', selected.has(deck)); setIcon(mark, selected.has(deck) ? 'circle-check-big' : 'layers-3'); });
        }
        new Notice(`读取到 ${decks?.length || 0} 个卡组。`);
      } catch (error) { new Notice(`Anki 连接失败：${error.message || String(error)}`, 6000); }
    });
    textButton(actions, '导入选中卡组', 'plus', async () => {
      if (!selected.size) return new Notice('请先读取并选择卡组。');
      const destination = await this.requestDestination('Anki 卡组');
      if (!destination) return;
      const source = Object.values(this.plugin.state.sources).find((item) => item.type === 'anki' && !item.deletedAt);
      const addedResults = [];
      for (const deck of selected) {
        const descriptor = { kind: 'anki', title: deck.split('::').pop() || deck, canonicalKey: `anki:${deck.toLowerCase()}`, sourceId: source?.id || '', launcher: { type: 'anki', deck }, metadata: { deck } };
        addedResults.push(destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor));
      }
      this.recordAddAction(addedResults, { moduleId: destination.moduleId, inbox: destination.inbox, label: `导入 Anki 卡组 ${selected.size} 个` });
      await this.plugin.persist(); new Notice(`已导入 ${selected.size} 个卡组。`); this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    }, 'is-primary');
  }

  renderLocalFolderSource(parent) {
    const existing = Object.values(this.plugin.state.sources).find((source) => source.type === 'local-folder' && !source.deletedAt) || {};
    const field = parent.createDiv({ cls: 'rh-next-field' }); field.createEl('label', { text: '本地课程文件夹' });
    const row = field.createDiv({ cls: 'rh-next-path-row' }); const folder = input(row, { value: existing.path || '', placeholder: '选择或填写文件夹路径' });
    textButton(row, '选择', 'folder-open', async () => {
      const result = await dialog?.showOpenDialog?.({ properties: ['openDirectory'] });
      if (!result?.canceled && result.filePaths?.[0]) folder.value = result.filePaths[0];
    });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '保存来源不会扫描；只有点击“扫描并导入”后才读取文件。不会复制原文件。' });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '保存来源', 'save', async () => {
      try {
        if (!fs.existsSync(folder.value) || !fs.statSync(folder.value).isDirectory()) throw new Error('文件夹不存在或路径不是目录。');
        model.upsertSource(this.plugin.state, { type: 'local-folder', path: folder.value, identity: path.resolve(folder.value).toLowerCase() });
        await this.plugin.persist(); status.setText('来源已保存；尚未扫描或创建资源。'); new Notice('本地文件夹来源已保存。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
    });
    const cancelScan = textButton(actions, '取消扫描', 'x', () => { this.localScanCancelled = true; status.setText('正在取消扫描……'); }); cancelScan.style.display = 'none';
    const scanButton = textButton(actions, '扫描并预览', 'folder-sync', async () => {
      try {
        scanButton.disabled = true; cancelScan.style.display = '';
        await this.previewLocalFolder(folder.value, status);
        status.setText('扫描完成；请在预览中选择收件箱或项目。');
      } catch (error) { status.setText(`失败：${error.message || String(error)}`); new Notice(status.textContent, 6000); }
      finally { scanButton.disabled = false; cancelScan.style.display = 'none'; }
    }, 'is-primary');
  }

  renderBilibiliSource(parent) {
    let selectedUser = null;
    let searchResults = [];
    const grid = parent.createDiv({ cls: 'rh-next-form-grid' });
    const midField = grid.createDiv({ cls: 'rh-next-field' }); midField.createEl('label', { text: 'UP UID、主页链接或名称' });
    const searchRow = midField.createDiv({ cls: 'rh-next-path-row' });
    const midInput = input(searchRow, { placeholder: '例如：英语兔、483162496 或 B站主页链接' });
    const searchButton = textButton(searchRow, '搜索', 'search', () => void runSearch());
    const aliasField = grid.createDiv({ cls: 'rh-next-field' }); aliasField.createEl('label', { text: '显示名称（可选）' }); const alias = input(aliasField, { placeholder: '选择搜索结果后自动填写' });
    const status = parent.createEl('p', { cls: 'rh-next-help', text: '输入名称可搜索UP；输入UID或主页链接可直接保存。' });
    const resultList = parent.createDiv({ cls: 'rh-next-bili-user-results' });
    const paintResults = () => {
      resultList.empty();
      if (!searchResults.length) return;
      for (const user of searchResults) {
        const row = resultList.createEl('button', { cls: `rh-next-bili-user-result ${selectedUser?.mid === user.mid ? 'is-selected' : ''}`, attr: { type: 'button', 'aria-label': `选择UP ${user.name}` } });
        const avatar = row.createDiv({ cls: 'rh-next-bili-user-avatar' });
        if (user.avatar) avatar.createEl('img', { attr: { src: user.avatar, alt: '', referrerpolicy: 'no-referrer' } }); else avatar.setText(user.name.slice(0, 1));
        const copy = row.createDiv({ cls: 'rh-next-bili-user-copy' });
        copy.createEl('strong', { text: user.name });
        copy.createEl('small', { text: `UID ${user.mid} · ${user.followers.toLocaleString()} 粉丝 · ${user.videos} 个视频` });
        if (user.description) copy.createEl('p', { text: user.description });
        const mark = row.createSpan(); setIcon(mark, selectedUser?.mid === user.mid ? 'circle-check-big' : 'chevron-right');
        row.addEventListener('click', () => {
          selectedUser = user;
          midInput.value = user.mid;
          if (!alias.value.trim()) alias.value = user.name;
          paintResults();
        });
      }
    };
    const runSearch = async () => {
      const raw = midInput.value.trim();
      if (!raw) return new Notice('请先输入UP名称、UID或主页链接。');
      const directMid = model.parseBiliUserInput(raw);
      if (directMid) {
        selectedUser = null; searchResults = []; paintResults();
        status.setText(`已识别 UID ${directMid}，可以直接保存订阅。`);
        return;
      }
      searchButton.disabled = true;
      status.setText(`正在搜索：${raw}`);
      try {
        searchResults = await this.plugin.searchBiliUsers(raw);
        selectedUser = searchResults.length === 1 ? searchResults[0] : null;
        if (selectedUser) { midInput.value = selectedUser.mid; if (!alias.value.trim()) alias.value = selectedUser.name; }
        status.setText(searchResults.length ? `找到 ${searchResults.length} 个UP，请选择正确账号。` : '没有找到匹配UP，可改用UID或主页链接。');
        paintResults();
      } catch (error) {
        searchResults = []; selectedUser = null; paintResults();
        status.setText(`搜索失败：${error.message || String(error)}`);
        new Notice(status.textContent, 6000);
      } finally { searchButton.disabled = false; }
    };
    midInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } });
    const actions = parent.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '添加订阅', 'rss', async () => {
      const mid = model.parseBiliUserInput(midInput.value);
      if (!mid) return new Notice('请先搜索并选择UP，或填写UID/主页链接。');
      const chosen = selectedUser?.mid === mid ? selectedUser : null;
      const { source } = model.upsertSource(this.plugin.state, {
        type: 'bilibili', mid, alias: alias.value.trim() || chosen?.name || `UP ${mid}`, identity: mid,
        homepage: `https://space.bilibili.com/${mid}`, avatar: chosen?.avatar || '', description: chosen?.description || '', followers: chosen?.followers || 0
      });
      await this.plugin.persist();
      try { await this.plugin.refreshBiliProfile(source); } catch (error) { source.lastError = error.message || String(error); await this.plugin.persist(); }
      new Notice(`已添加订阅：${source.alias}`); this.close(); await this.plugin.workbenchLeaf?.view?.navigate?.('subscriptions');
    }, 'is-primary');
  }

  renderEmptyState(parent, text) { parent.createEl('p', { text, cls: 'rh-next-empty-inline' }); }
}

class LegacyBiliHomepageCleanupModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.selected = new Set(); }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-cleanup-modal');
    const candidates = model.legacyBiliHomepageResources(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '整理旧订阅主页资源' }); copy.createEl('p', { text: '这些条目来自旧版“添加 UP 同时创建主页资源”。这里只做预览，勾选确认后移入可恢复的回收站。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    for (const resource of candidates) {
      const row = list.createEl('label', { cls: 'rh-next-picker-row' });
      const box = row.createEl('input', { type: 'checkbox' }); box.addEventListener('change', () => { box.checked ? this.selected.add(resource.id) : this.selected.delete(resource.id); row.toggleClass('is-selected', box.checked); });
      const body = row.createDiv(); body.createEl('strong', { text: resource.title }); body.createEl('small', { text: resource.launcher?.uri || resource.metadata?.originalUrl || 'B站主页' });
    }
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '移入回收站', 'trash-2', async () => {
      if (!this.selected.size) return new Notice('请先勾选要整理的旧主页资源。');
      await this.plugin.mutate((state) => { for (const resourceId of this.selected) model.trashResource(state, resourceId); });
      new Notice(`已将 ${this.selected.size} 条旧订阅主页移入回收站，可随时恢复。`); this.close();
    }, 'is-danger');
  }
  onClose() { this.contentEl.empty(); }
}

class ImportDestinationModal extends Modal {
  constructor(app, plugin, options = {}) { super(app); this.plugin = plugin; this.options = options; this.chosen = false; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-destination-modal');
    const projects = model.activeProjects(this.plugin.state);
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '选择保存位置' }); copy.createEl('p', { text: '来源连接保持全局；只有这一步会创建正式资源。' });
    iconButton(head, 'x', '关闭', () => this.close());
    let projectSelect = null; let moduleSelect = null;
    if (projects.length) {
      const grid = this.contentEl.createDiv({ cls: 'rh-next-form-grid' });
      const projectField = grid.createDiv({ cls: 'rh-next-field' }); projectField.createEl('label', { text: '项目' });
      projectSelect = projectField.createEl('select', { cls: 'rh-next-input' });
      for (const project of projects) projectSelect.createEl('option', { text: project.title, value: project.id });
      const moduleField = grid.createDiv({ cls: 'rh-next-field' }); moduleField.createEl('label', { text: '学习模块' });
      moduleSelect = moduleField.createEl('select', { cls: 'rh-next-input' });
      const fillModules = () => {
        moduleSelect.empty();
        for (const item of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: item.title, value: item.id });
        moduleSelect.createEl('option', { text: '＋ 新建模块', value: '__new__' });
      };
      projectSelect.addEventListener('change', fillModules); fillModules();
    } else this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有项目；可以先放入收件箱。' });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '放入收件箱', 'inbox', () => { this.chosen = true; this.options.onChoose?.({ inbox: true, projectId: '', moduleId: '' }); this.close(); });
    if (projects.length) textButton(actions, '加入项目', 'folder-plus', async () => {
      let moduleId = moduleSelect.value;
      if (moduleId === '__new__') {
        const title = await new Promise((resolve) => new TextPromptModal(this.app, '新建学习模块', '模块名称', resolve, { initialValue: this.options.suggestedTitle || '学习材料', onCancel: () => resolve('') }).open());
        if (!safeText(title)) return;
        moduleId = model.createModule(this.plugin.state, projectSelect.value, title).id;
      }
      this.chosen = true;
      this.options.onChoose?.({ inbox: false, projectId: projectSelect.value, moduleId });
      this.close();
    }, 'is-primary');
  }
  onClose() { if (!this.chosen) this.options.onCancel?.(); this.contentEl.empty(); }
}

class LocalFolderImportPreviewModal extends Modal {
  constructor(app, plugin, rootPath, files) { super(app); this.plugin = plugin; this.rootPath = rootPath; this.files = files; this.selected = new Set(files); }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-local-preview-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '本地文件夹导入预览' }); copy.createEl('p', { text: `${this.files.length} 个支持 · ${this.files.ignoredCount || 0} 个忽略 · ${this.files.failures?.length || 0} 个失败 · 确认前不会创建资源` });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-local-preview-list' });
    for (const filePath of this.files.slice(0, 200)) {
      const inferred = model.inferResource(filePath); const row = list.createDiv({ cls: 'rh-next-picker-row' }); const checkbox = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${path.basename(filePath)}` } }); checkbox.checked = true; checkbox.addEventListener('change', () => { checkbox.checked ? this.selected.add(filePath) : this.selected.delete(filePath); }); setIcon(row.createSpan(), kindIcon(inferred.kind));
      const body = row.createDiv(); body.createEl('strong', { text: path.basename(filePath) }); body.createEl('small', { text: path.relative(this.rootPath, filePath) || path.basename(filePath) });
    }
    if (this.files.length > 200) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `仅预览前 200 条；另有 ${this.files.length - 200} 条。` });
    if (this.files.failures?.length) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `${this.files.failures.length} 个目录无权限或读取失败，其他文件仍可导入。` });
    const commit = async (destination) => {
      const chosen = this.files.filter((filePath) => this.selected.has(filePath));
      if (!chosen.length) return new Notice('请至少选择一个文件。');
      const { source } = model.upsertSource(this.plugin.state, { type: 'local-folder', path: this.rootPath, identity: path.resolve(this.rootPath).toLowerCase() });
      const results = chosen.map((filePath) => {
        const inferred = model.inferResource(filePath);
        const descriptor = { ...inferred, sourceId: source.id, metadata: { ...inferred.metadata, rootPath: this.rootPath, localPath: filePath } };
        return destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
      });
      model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: results.map((item) => item.resource.id), inboxAddedResourceIds: results.filter((item) => item.inboxAdded).map((item) => item.resource.id), linkedResourceIds: results.filter((item) => item.linked).map((item) => item.resource.id), createdResourceIds: results.filter((item) => !item.reused).map((item) => item.resource.id), label: `导入本地文件夹：${path.basename(this.rootPath)}` });
      await this.plugin.persist(); new Notice(`已导入 ${results.length} 个本地资源。`); this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    };
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '仅放入收件箱', 'inbox', () => commit({ inbox: true, projectId: '', moduleId: '' }));
    textButton(actions, '加入项目', 'folder-plus', async () => {
      const destination = await new Promise((resolve) => new ImportDestinationModal(this.app, this.plugin, { suggestedTitle: path.basename(this.rootPath), onChoose: resolve, onCancel: () => resolve(null) }).open());
      if (destination) await commit(destination);
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class OpenListImportPreviewModal extends Modal {
  constructor(app, plugin, source, entries, options = {}) { super(app); this.plugin = plugin; this.source = source; this.entries = entries; this.options = options; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-openlist-preview-modal');
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '确认导入预览' }); copy.createEl('p', { text: `${this.entries.length} 个文件 · 导入根 ${this.options.rootPath || '/'} · 确认前不会创建任何资源` });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-openlist-preview-list' });
    for (const entry of this.entries.slice(0, 200)) {
      const row = list.createDiv({ cls: 'rh-next-picker-row' });
      const mark = row.createSpan(); setIcon(mark, kindIcon(openListEntryCategory(entry) === 'video' ? 'video' : openListEntryCategory(entry) === 'pdf' ? 'pdf' : 'file'));
      const body = row.createDiv(); body.createEl('strong', { text: entry.name }); body.createEl('small', { text: `${entry.remotePath} · ${formatBytes(entry.size)}` });
    }
    if (this.entries.length > 200) this.contentEl.createEl('p', { cls: 'rh-next-help', text: `预览前 200 条，另有 ${this.entries.length - 200} 条将在确认后导入。` });
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, '取消', 'x', () => this.close());
    textButton(actions, '确认保存', 'check', async () => {
      let destination = this.options.destination || null;
      if (!destination) destination = await new Promise((resolve) => new ImportDestinationModal(this.app, this.plugin, { suggestedTitle: this.options.suggestedTitle, onChoose: resolve, onCancel: () => resolve(null) }).open());
      if (!destination) return;
      const results = this.entries.map((entry) => {
        const descriptor = openListDescriptor(this.source, entry, this.options.rootPath);
        return destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, descriptor) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, descriptor);
      });
      const resourceIds = results.map((result) => result.resource.id);
      model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds, inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), linkedResourceIds: results.filter((result) => result.linked).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `导入 OpenList：${this.options.suggestedTitle || this.source.label}` });
      await this.plugin.persist();
      new Notice(`已保存 ${results.length} 个 OpenList 资源。`);
      this.options.onSuccess?.();
      this.close();
      if (!destination.inbox) await this.plugin.workbenchLeaf?.view?.navigate?.('project', { projectId: destination.projectId });
    }, 'is-primary');
  }
  onClose() { this.contentEl.empty(); }
}

class OpenListBrowserModal extends Modal {
  constructor(app, plugin, source, rootPath = '/') {
    super(app); this.plugin = plugin; this.source = source; this.rootPath = model.normalizeOpenListPath(rootPath || '/'); this.currentPath = this.rootPath;
    this.cache = new Map(); this.entries = []; this.selected = new Map(); this.categories = new Set(['video']); this.details = null; this.loading = false; this.cancelScan = false; this.renderLimit = 240;
  }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-openlist-browser-modal'); void this.load(this.currentPath); }
  async load(remotePath, refresh = false) {
    this.currentPath = model.normalizeOpenListPath(remotePath || '/'); this.renderLimit = 240; this.loading = true; this.render();
    try {
      const key = `${this.source.id}:${this.currentPath}`;
      if (!refresh && this.cache.has(key)) this.entries = this.cache.get(key);
      else {
        const token = await this.plugin.loginOpenList(this.source);
        const rows = await this.plugin.listOpenList(this.source, this.currentPath, token, refresh);
        this.entries = rows.map((entry) => ({ ...entry, remotePath: model.normalizeOpenListPath(`${this.currentPath}/${entry.name}`) }));
        this.cache.set(key, this.entries);
      }
    } catch (error) { new Notice(`读取目录失败：${error.message || String(error)}`, 6000); this.entries = []; }
    finally { this.loading = false; this.render(); }
  }
  filteredEntries() { return this.entries.filter((entry) => entry.is_dir || this.categories.has(openListEntryCategory(entry))); }
  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.source.label || 'OpenList 浏览' }); copy.createEl('p', { text: '按需读取当前层级；浏览不会写入资源库。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const toolbar = this.contentEl.createDiv({ cls: 'rh-next-openlist-toolbar' });
    const parentCandidate = model.normalizeOpenListPath(this.currentPath.split('/').slice(0, -1).join('/') || '/');
    const atRoot = this.currentPath === this.rootPath;
    const parentPath = atRoot || !parentCandidate.startsWith(this.rootPath === '/' ? '/' : `${this.rootPath}/`) ? this.rootPath : parentCandidate;
    const backButton = iconButton(toolbar, 'arrow-left', '返回上级', () => { if (!atRoot) void this.load(parentPath); }, atRoot ? 'is-disabled' : '');
    backButton.disabled = atRoot;
    const crumbs = toolbar.createDiv({ cls: 'rh-next-openlist-breadcrumbs' });
    textButton(crumbs, this.source.label || '根目录', 'hard-drive', () => void this.load(this.rootPath));
    let built = this.rootPath === '/' ? '' : this.rootPath;
    const relativeSegments = this.currentPath.slice(this.rootPath === '/' ? 0 : this.rootPath.length).split('/').filter(Boolean);
    for (const segment of relativeSegments) { built += `/${segment}`; const target = built; textButton(crumbs, segment, 'chevron-right', () => void this.load(target)); }
    iconButton(toolbar, 'refresh-cw', '刷新当前目录', () => void this.load(this.currentPath, true));
    const filters = this.contentEl.createDiv({ cls: 'rh-next-openlist-filters' });
    for (const [category, label] of Object.entries(OPENLIST_CATEGORY_LABELS)) {
      const option = filters.createEl('label'); const box = option.createEl('input', { type: 'checkbox' }); box.checked = this.categories.has(category);
      option.createSpan({ text: label }); box.addEventListener('change', () => { box.checked ? this.categories.add(category) : this.categories.delete(category); this.render(); });
    }
    const body = this.contentEl.createDiv({ cls: 'rh-next-openlist-browser-body' });
    const list = body.createDiv({ cls: 'rh-next-picker-list rh-next-openlist-list' });
    if (this.loading) list.createEl('p', { cls: 'rh-next-empty-inline', text: '正在读取当前目录…' });
    else if (!this.filteredEntries().length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '当前筛选下没有可见内容。' });
    const filtered = this.filteredEntries();
    for (const entry of filtered.slice(0, this.renderLimit)) {
      const row = list.createDiv({ cls: `rh-next-picker-row ${this.selected.has(entry.remotePath) ? 'is-selected' : ''}` });
      const checkbox = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${entry.name}` } }); checkbox.checked = this.selected.has(entry.remotePath);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => { checkbox.checked ? this.selected.set(entry.remotePath, entry) : this.selected.delete(entry.remotePath); this.render(); });
      const open = row.createEl('button', { cls: 'rh-next-openlist-entry', attr: { type: 'button' } });
      const mark = open.createSpan(); setIcon(mark, entry.is_dir ? 'folder' : kindIcon(openListEntryCategory(entry) === 'video' ? 'video' : openListEntryCategory(entry) === 'pdf' ? 'pdf' : 'file'));
      const entryCopy = open.createDiv(); entryCopy.createEl('strong', { text: entry.name }); entryCopy.createEl('small', { text: entry.is_dir ? '文件夹 · 点击进入' : `${OPENLIST_CATEGORY_LABELS[openListEntryCategory(entry)]} · ${formatBytes(entry.size)}` });
      open.addEventListener('click', () => entry.is_dir ? void this.load(entry.remotePath) : (this.details = entry, this.render()));
      iconButton(row, 'info', `查看 ${entry.name} 详情`, () => { this.details = entry; this.render(); });
    }
    if (filtered.length > this.renderLimit) textButton(list, `继续显示 ${Math.min(240, filtered.length - this.renderLimit)} 项`, 'chevron-down', () => { this.renderLimit += 240; this.render(); });
    const detail = body.createDiv({ cls: 'rh-next-openlist-details' });
    if (this.details) {
      detail.createEl('strong', { text: this.details.name }); detail.createEl('p', { text: this.details.remotePath });
      detail.createEl('small', { text: `${this.details.is_dir ? '文件夹' : OPENLIST_CATEGORY_LABELS[openListEntryCategory(this.details)]} · ${formatBytes(this.details.size)}${this.details.modified ? ` · ${this.details.modified}` : ''}` });
      if (!this.details.is_dir && openListEntryCategory(this.details) === 'video') {
        const previewResource = { title: this.details.name, kind: 'video', sourceId: this.source.id, launcher: { type: 'openlist', sourceId: this.source.id, remotePath: this.details.remotePath }, metadata: { remotePath: this.details.remotePath } };
        textButton(detail, '试播 PotPlayer', 'play', () => this.plugin.openResourceAction(previewResource, 'play', this.plugin.resourceActions(previewResource).playTarget), 'is-primary');
      }
    } else detail.createEl('p', { cls: 'rh-next-empty-inline', text: '选择条目查看路径、类型与大小。' });
    const footer = this.contentEl.createDiv({ cls: 'rh-next-modal-actions rh-next-openlist-footer' });
    footer.createSpan({ text: `已选择 ${this.selected.size} 项` });
    textButton(footer, '取消扫描', 'square', () => { this.cancelScan = true; }, this.cancelScan ? 'is-disabled' : '');
    textButton(footer, '放入收件箱', 'inbox', () => void this.prepareImport({ inbox: true, projectId: '', moduleId: '' }));
    textButton(footer, '加入项目', 'folder-plus', () => void this.prepareImport(null), 'is-primary');
  }
  async prepareImport(destination) {
    if (!this.selected.size) return new Notice('请先勾选文件或文件夹。');
    const selectedEntries = [...this.selected.values()];
    const selectedFolders = selectedEntries.filter((entry) => entry.is_dir);
    const importRootPath = model.openListImportRoot(selectedEntries);
    if (selectedFolders.length) {
      const confirmed = await new Promise((resolve) => new ConfirmActionModal(this.app, {
        title: '递归扫描所选文件夹？',
        message: `将按当前类型筛选递归读取 ${selectedFolders.length} 个文件夹。扫描可取消；完成后仍会先显示预览，不会直接写入资源库。`,
        confirmLabel: '开始扫描',
        onConfirm: () => resolve(true), onCancel: () => resolve(false)
      }).open());
      if (!confirmed) return;
    }
    this.cancelScan = false;
    const files = []; const seen = new Set();
    const add = (entry) => { if (!seen.has(entry.remotePath)) { seen.add(entry.remotePath); files.push(entry); } };
    try {
      for (const entry of selectedEntries) {
        if (!entry.is_dir) { if (this.categories.has(openListEntryCategory(entry))) add(entry); continue; }
        const scanned = await this.plugin.scanOpenList(this.source, entry.remotePath, {
          isCancelled: () => this.cancelScan,
          acceptEntry: (item) => this.categories.has(openListEntryCategory(item)),
          onProgress: ({ directories, found }) => { const footer = this.contentEl.querySelector('.rh-next-openlist-footer > span'); footer?.setText(`扫描 ${directories} 个目录 · 找到 ${found} 个文件`); }
        });
        for (const item of scanned) add(item);
      }
      if (!files.length) throw new Error('所选范围内没有符合当前筛选的文件。');
      const importLabel = importRootPath.split('/').filter(Boolean).pop() || this.source.label;
      new OpenListImportPreviewModal(this.app, this.plugin, this.source, files, {
        destination, rootPath: importRootPath, suggestedTitle: importLabel,
        onSuccess: () => { for (const entry of selectedEntries) this.selected.delete(entry.remotePath); this.details = null; this.render(); }
      }).open();
    } catch (error) { new Notice(error.message || String(error), 6000); }
  }
  onClose() { this.cancelScan = true; this.contentEl.empty(); }
}

class BiliCollectionModal extends Modal {
  constructor(app, plugin, source, collection) { super(app); this.plugin = plugin; this.source = source; this.collection = collection; this.items = []; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-bili-collection-modal');
    this.renderLoading();
    void this.load();
  }
  renderLoading() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.collection.name }); copy.createEl('p', { text: `${this.collection.type === 'season' ? '合集' : '系列'} · ${this.collection.total || 0} 条` });
    this.contentEl.createEl('p', { cls: 'rh-next-empty-inline', text: '正在读取合集内容…' });
  }
  async load() {
    try { this.items = await this.plugin.fetchBiliCollectionItems(this.source, this.collection); this.renderItems(); }
    catch (error) { this.contentEl.createEl('p', { cls: 'rh-next-source-warning', text: `读取失败：${error.message || String(error)}` }); }
  }
  renderItems() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: this.collection.name }); copy.createEl('p', { text: `${this.items.length} 条视频 · 点击播放直接启动 PotPlayer` });
    textButton(head, '全部加入收件箱', 'inbox', async () => {
      let added = 0; const results = [];
      for (const video of this.items) { const result = model.addInboxResource(this.plugin.state, video.url, video.title); results.push(result); if (!result.reused) added += 1; }
      model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: results.map((result) => result.resource.id), inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `合集加入收件箱：${this.collection.name}` });
      await this.plugin.persist(); new Notice(`已新增 ${added} 条到收件箱。`);
    });
    textButton(head, '整个合集加入项目', 'folder-plus', () => {
      new ImportDestinationModal(this.app, this.plugin, {
        suggestedTitle: this.collection.name,
        onChoose: async (destination) => {
          const results = this.items.map((video) => destination.inbox
            ? model.upsertInboxDescriptor(this.plugin.state, biliVideoDescriptor(video))
            : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, biliVideoDescriptor(video)));
          model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: results.map((result) => result.resource.id), inboxAddedResourceIds: results.filter((result) => result.inboxAdded).map((result) => result.resource.id), linkedResourceIds: results.filter((result) => result.linked).map((result) => result.resource.id), createdResourceIds: results.filter((result) => !result.reused).map((result) => result.resource.id), label: `合集加入项目：${this.collection.name}` });
          await this.plugin.persist(); new Notice(`已保存 ${results.length} 条视频。`);
        }
      }).open();
    }, 'is-primary');
    const search = input(this.contentEl, { placeholder: '搜索合集中的视频…' });
    const list = this.contentEl.createDiv({ cls: 'rh-next-bili-collection-list' });
    const draw = () => {
      list.empty();
      const query = search.value.trim().toLowerCase();
      const values = this.items.filter((item) => !query || item.title.toLowerCase().includes(query));
      for (const video of values) {
        const row = list.createDiv({ cls: 'rh-next-bili-collection-row' });
        const copy = row.createDiv(); copy.createEl('strong', { text: video.title }); copy.createEl('small', { text: video.bvid });
        const transient = { title: video.title || '未命名视频', kind: 'video', launcher: { type: 'potplayer', target: video.url }, metadata: { originalUrl: video.url, sourceUrl: video.url } };
        const actionHost = row.createDiv({ cls: 'rh-next-resource-actions' });
        const actions = this.plugin.resourceActions(transient);
        if (actions.playTarget) iconButton(actionHost, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(transient, 'play', actions.playTarget), 'is-primary');
        if (actions.webTarget) iconButton(actionHost, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, transient, actions.webTarget));
        iconButton(row, 'inbox', '加入收件箱', async () => {
          const result = model.addInboxResource(this.plugin.state, video.url, video.title);
          model.recordLastAction(this.plugin.state, { type: 'add-resources', inbox: true, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入收件箱：${video.title}` });
          await this.plugin.persist(); new Notice(result.reused ? '收件箱中已有这条视频。' : '已加入收件箱。');
        });
        iconButton(row, 'folder-plus', '加入项目', () => new ImportDestinationModal(this.app, this.plugin, {
          suggestedTitle: video.title,
          onChoose: async (destination) => {
            const result = destination.inbox ? model.upsertInboxDescriptor(this.plugin.state, biliVideoDescriptor(video)) : model.upsertResourceDescriptor(this.plugin.state, destination.moduleId, biliVideoDescriptor(video));
            model.recordLastAction(this.plugin.state, { type: 'add-resources', moduleId: destination.moduleId || '', inbox: destination.inbox, resourceIds: [result.resource.id], inboxAddedResourceIds: result.inboxAdded ? [result.resource.id] : [], linkedResourceIds: result.linked ? [result.resource.id] : [], createdResourceIds: result.reused ? [] : [result.resource.id], label: `加入项目：${video.title}` });
            await this.plugin.persist(); new Notice(destination.inbox ? '已加入收件箱。' : '已加入项目。');
          }
        }).open());
      }
      if (!values.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有匹配的视频。' });
    };
    search.addEventListener('input', draw); draw();
  }
}

class ResourceSearchModal extends Modal {
  constructor(app, plugin, resources) { super(app); this.plugin = plugin; this.resources = resources; }
  onOpen() {
    this.modalEl.addClass('rh-next-modal', 'rh-next-search-modal'); this.contentEl.empty();
    this.contentEl.createEl('h2', { text: '搜索全部资源' });
    const search = input(this.contentEl, { placeholder: '输入标题或类型……' });
    const scope = this.contentEl.createDiv({ cls: 'rh-next-search-scope' });
    const projectSelect = scope.createEl('select', { cls: 'rh-next-input' });
    projectSelect.createEl('option', { text: '全部项目', value: '' });
    for (const project of model.activeProjects(this.plugin.state)) projectSelect.createEl('option', { text: project.title, value: project.id });
    const moduleSelect = scope.createEl('select', { cls: 'rh-next-input' });
    const fillModules = () => {
      moduleSelect.empty(); moduleSelect.createEl('option', { text: projectSelect.value ? '项目内全部模块' : '选择项目后可管理分组', value: '' });
      if (projectSelect.value) for (const module of model.projectModules(this.plugin.state, projectSelect.value)) moduleSelect.createEl('option', { text: module.title, value: module.id });
    };
    projectSelect.addEventListener('change', () => { fillModules(); paint(); }); fillModules();
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      const projectModuleIds = projectSelect.value ? new Set(model.projectModules(this.plugin.state, projectSelect.value).map((module) => module.id)) : null;
      const scopedIds = moduleSelect.value
        ? new Set(this.plugin.state.modules[moduleSelect.value]?.resourceIds || [])
        : projectModuleIds ? new Set([...projectModuleIds].flatMap((moduleId) => this.plugin.state.modules[moduleId]?.resourceIds || [])) : null;
      for (const resource of this.resources.filter((item) => (!scopedIds || scopedIds.has(item.id)) && (!query || `${item.title} ${item.kind}`.toLowerCase().includes(query))).slice(0, 100)) {
        const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, kindIcon(resource.kind));
        const text = row.createDiv(); text.createEl('strong', { text: resource.title });
        const memberships = Object.values(this.plugin.state.modules).filter((module) => (module.resourceIds || []).includes(resource.id));
        text.createEl('small', { text: `${kindLabel(resource.kind)}${memberships.length ? ` · ${memberships.map((module) => module.title).slice(0, 2).join('、')}` : ' · 未加入模块'}` });
        const host = row.createDiv({ cls: 'rh-next-resource-actions' });
        const actions = this.plugin.resourceActions(resource);
        if (actions.playTarget) iconButton(host, 'play', '用 PotPlayer 播放', () => this.plugin.openResourceAction(resource, 'play', actions.playTarget), 'is-primary');
        if (actions.webTarget) iconButton(host, 'external-link', '选择网页打开方式', (event) => this.plugin.showWebOpenMenu(event, resource, actions.webTarget));
        if (actions.defaultTarget) iconButton(host, actions.defaultTarget.type === 'anki' ? 'layers-3' : 'external-link', '打开资源', () => this.plugin.openResourceAction(resource, 'default', actions.defaultTarget), 'is-primary');
        if (moduleSelect.value) iconButton(host, 'folder-input', '管理当前模块分组', (event) => {
          const groups = model.moduleResourceGroups(this.plugin.state, moduleSelect.value);
          const current = groups.find((group) => (group.resourceIds || []).includes(resource.id));
          const menu = new Menu();
          if (current) menu.addItem((item) => item.setTitle('移出分组').setIcon('folder-minus').onClick(async () => { await this.plugin.mutate((state) => model.moveResourceToGroup(state, moduleSelect.value, resource.id, '')); paint(); }));
          for (const group of groups.filter((candidate) => candidate.id !== current?.id)) menu.addItem((item) => item.setTitle(`移到：${group.title}`).setIcon('folder-input').onClick(async () => { await this.plugin.mutate((state) => model.moveResourceToGroup(state, moduleSelect.value, resource.id, group.id)); paint(); }));
          menu.addItem((item) => item.setTitle('新建分组并移入').setIcon('folder-plus').onClick(() => new TextPromptModal(this.app, '新建资源分组', '分组名称', async (value) => {
            await this.plugin.mutate((state) => { const group = model.createResourceGroup(state, moduleSelect.value, value); model.moveResourceToGroup(state, moduleSelect.value, resource.id, group.id); }); paint();
          }, { initialValue: '新分组' }).open()));
          menu.showAtMouseEvent(event);
        });
      }
    };
    let timer = null;
    search.addEventListener('input', () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(paint, 120); });
    moduleSelect.addEventListener('change', paint); paint(); window.setTimeout(() => search.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

class ArchivedModulesModal extends Modal {
  constructor(app, plugin, projectId) { super(app); this.plugin = plugin; this.projectId = projectId; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-archive-modal'); this.render(); }
  onClose() { this.contentEl.empty(); }
  render() {
    this.contentEl.empty();
    const project = this.plugin.state.projects[this.projectId];
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '已归档模块' }); copy.createEl('p', { text: project ? `${project.title} · 归档保留资源关联与历史，可随时恢复。` : '项目已不存在。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-archive-list' });
    const modules = Object.values(this.plugin.state.modules)
      .filter((module) => module.projectId === this.projectId && module.archivedAt && !module.deletedAt)
      .sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)));
    if (!modules.length) { list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有归档模块。' }); return; }
    for (const module of modules) {
      const resourceCount = (module.resourceIds || []).filter((resourceId) => this.plugin.state.resources[resourceId]).length;
      const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, 'blocks');
      const text = row.createDiv(); text.createEl('strong', { text: module.title }); text.createEl('small', { text: `${resourceCount} 条资源关联 · 已归档` });
      textButton(row, '恢复', 'archive-restore', async () => {
        await this.plugin.mutate((state) => model.restoreModule(state, module.id), { render: false });
        this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
      }, 'is-primary');
      textButton(row, '永久删除', 'trash-2', () => this.plugin.workbenchLeaf?.view?.confirmDeleteModule(module, async () => this.render()), 'is-danger');
    }
  }
}

class ArchiveModal extends Modal {
  constructor(app, plugin, mode = 'archive') { super(app); this.plugin = plugin; this.mode = mode; }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-archive-modal'); this.render(); }
  onClose() { this.contentEl.empty(); }
  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '归档与恢复' }); copy.createEl('p', { text: '归档项目可恢复；回收站用于误删资源；旧链接只按需选择导入。' });
    iconButton(head, 'x', '关闭', () => this.close());
    const tabs = this.contentEl.createDiv({ cls: 'rh-next-add-modes' });
    for (const [mode, title, icon] of [['archive', '归档项目', 'archive'], ['trash', '资源回收站', 'trash-2'], ['legacy', '旧资源清单', 'file-input']]) textButton(tabs, title, icon, () => { this.mode = mode; this.render(); }, this.mode === mode ? 'is-active' : '');
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list rh-next-archive-list' });
    if (this.mode === 'legacy') {
      const empty = list.createDiv({ cls: 'rh-next-empty' }); const icon = empty.createDiv(); setIcon(icon, 'file-input');
      empty.createEl('strong', { text: '从只读清单按需重新添加' });
      empty.createEl('p', { text: '不会迁移旧内部结构、旧完成记录或旧 Markdown 块。' });
      textButton(empty, '选择清单文件', 'folder-open', () => new LegacyImportModal(this.app, this.plugin).open(), 'is-primary');
      return;
    }
    const entries = this.mode === 'archive'
      ? Object.values(this.plugin.state.projects).filter((item) => item.archivedAt && !item.deletedAt)
      : Object.values(this.plugin.state.resources).filter((item) => item.deletedAt);
    if (!entries.length) { list.createEl('p', { cls: 'rh-next-empty-inline', text: this.mode === 'archive' ? '没有归档项目。' : '回收站是空的。' }); return; }
    for (const entry of entries) {
      const row = list.createDiv({ cls: 'rh-next-picker-row' }); const icon = row.createSpan(); setIcon(icon, this.mode === 'archive' ? 'folder-archive' : kindIcon(entry.kind));
      const text = row.createDiv(); text.createEl('strong', { text: entry.title }); text.createEl('small', { text: this.mode === 'archive' ? '已归档项目' : `${kindLabel(entry.kind)} · 已移到回收站` });
      textButton(row, '恢复', 'archive-restore', async () => {
        await this.plugin.mutate((state) => this.mode === 'archive' ? model.restoreProject(state, entry.id) : model.restoreResource(state, entry.id), { render: false });
        this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
      }, 'is-primary');
      if (this.mode === 'archive') {
        textButton(row, '永久删除', 'trash-2', () => new ConfirmActionModal(this.app, {
          title: `永久删除“${entry.title}”？`,
          message: '项目、学习模块和相关计划会被删除；可以同时清理删除后不再被引用的资源索引。',
          checkboxLabel: '同时删除仅属于此项目的孤立资源',
          checkboxDefault: true,
          confirmLabel: '永久删除',
          onConfirm: async ({ checked }) => {
            const result = await this.plugin.mutate((state) => model.deleteProject(state, entry.id, { deleteOrphans: checked }), { render: false });
            if (result.removedResourceIds.length) new Notice(`已同步清理 ${result.removedResourceIds.length} 条孤立资源。`);
            this.render(); await this.plugin.workbenchLeaf?.view?.render?.();
          }
        }).open(), 'is-danger');
      }
    }
  }
}

class LegacyImportModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.entries = []; this.selected = new Set(); }
  onOpen() { this.modalEl.addClass('rh-next-modal', 'rh-next-legacy-modal'); this.render(); void this.pickFile(); }
  onClose() { this.contentEl.empty(); }

  async pickFile() {
    const defaultPath = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Documents', '惯性', 'ResourceHubPlugin', '现有资源链接清单.md') : '';
    let filePath = fs.existsSync(defaultPath) ? defaultPath : '';
    if (!filePath) {
      const result = await dialog?.showOpenDialog?.({ title: '选择现有资源链接清单', properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md'] }] });
      filePath = result?.canceled ? '' : result?.filePaths?.[0] || '';
    }
    if (!filePath) return;
    try {
      this.entries = this.parseReport(fs.readFileSync(filePath, 'utf8'));
      this.filePath = filePath; this.render();
    } catch (error) { new Notice(`清单读取失败：${error.message || String(error)}`, 6000); }
  }

  parseReport(markdown) {
    const results = [];
    const seen = new Set();
    for (const line of markdown.split(/\r?\n/)) {
      if (!line.startsWith('| ') || line.startsWith('|---') || line.includes('| 标题 |')) continue;
      const cells = line.slice(1, -1).split(' | ').map((cell) => cell.trim());
      if (cells.length < 3) continue;
      const title = cells[0].replace(/^`|`$/g, '').replace(/\\\|/g, '|').trim();
      const openListKeyCell = cells.find((cell) => /^`openlist:/i.test(cell));
      const remoteCell = cells.find((cell) => /^`\/.*`$/.test(cell));
      const linkCell = cells.find((cell) => /^<[^>]+>$/.test(cell));
      const localCell = cells.find((cell) => /^`[a-zA-Z]:\\.*`$/.test(cell));
      let entry = null;
      if (openListKeyCell && remoteCell) {
        const remotePath = remoteCell.slice(1, -1);
        entry = { type: 'openlist', title, value: remotePath, canonicalKey: openListKeyCell.slice(1, -1) };
      } else if (linkCell) {
        const value = linkCell.slice(1, -1);
        if (/^obsidian:\/\/learning-resource-hub/i.test(value)) {
          try {
            const deck = new URL(value).searchParams.get('deck');
            if (deck) entry = { type: 'anki', title, value: deck, canonicalKey: `anki:${deck.toLowerCase()}` };
          } catch { /* skip malformed legacy URI */ }
        } else if (/^https?:\/\//i.test(value)) entry = { type: 'link', title, value };
      } else if (localCell) entry = { type: 'file', title, value: localCell.slice(1, -1) };
      if (!entry) continue;
      const identity = entry.canonicalKey || `${entry.type}:${entry.value.toLowerCase()}`;
      if (seen.has(identity)) continue;
      seen.add(identity); results.push({ ...entry, id: identity });
    }
    return results;
  }

  render() {
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv(); copy.createEl('h2', { text: '选择旧资源' }); copy.createEl('p', { text: this.entries.length ? `已读取 ${this.entries.length} 条可重新添加的稳定链接；默认不选。` : '正在读取只读清单……' });
    iconButton(head, 'x', '关闭', () => this.close());
    if (!this.entries.length) return;
    const search = input(this.contentEl, { placeholder: '搜索标题、类型或路径……' });
    const list = this.contentEl.createDiv({ cls: 'rh-next-picker-list' });
    const paint = () => {
      list.empty(); const query = search.value.trim().toLowerCase();
      const visible = this.entries.filter((entry) => !query || `${entry.title} ${entry.type} ${entry.value}`.toLowerCase().includes(query)).slice(0, 300);
      for (const entry of visible) {
        const row = list.createDiv({ cls: `rh-next-picker-row ${this.selected.has(entry.id) ? 'is-selected' : ''}` }); const mark = row.createSpan(); setIcon(mark, this.selected.has(entry.id) ? 'circle-check-big' : entry.type === 'anki' ? 'layers-3' : entry.type === 'openlist' ? 'cloud' : entry.type === 'file' ? 'file' : 'link');
        const text = row.createDiv(); text.createEl('strong', { text: entry.title }); text.createEl('small', { text: entry.type === 'openlist' ? `OpenList · ${entry.value}` : entry.type });
        row.addEventListener('click', () => { this.selected.has(entry.id) ? this.selected.delete(entry.id) : this.selected.add(entry.id); paint(); });
      }
    };
    search.addEventListener('input', paint); paint();
    const actions = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    textButton(actions, `加入收件箱（${this.selected.size}）`, 'inbox', async () => {
      if (!this.selected.size) return new Notice('请先选择要重新添加的资源。');
      for (const entry of this.entries.filter((item) => this.selected.has(item.id))) {
        if (entry.type === 'openlist') model.upsertInboxDescriptor(this.plugin.state, { kind: 'video', title: entry.title, canonicalKey: entry.canonicalKey, sourceId: '', launcher: { type: 'openlist', sourceId: '', remotePath: entry.value }, metadata: { remotePath: entry.value, importedFromLegacy: true } });
        else if (entry.type === 'anki') model.upsertInboxDescriptor(this.plugin.state, { kind: 'anki', title: entry.title, canonicalKey: entry.canonicalKey, sourceId: '', launcher: { type: 'anki', deck: entry.value }, metadata: { deck: entry.value, importedFromLegacy: true } });
        else model.addInboxResource(this.plugin.state, entry.value, entry.title);
      }
      await this.plugin.persist(); new Notice(`已把 ${this.selected.size} 条旧资源加入收件箱。`); this.close(); await this.plugin.workbenchLeaf?.view?.render?.();
    }, 'is-primary');
  }
}

module.exports = ResourceHubNextPlugin;

},
"model.cjs": (module, exports, require) => {
'use strict';

const SCHEMA_VERSION = 1;
const PROJECT_PANEL_IDS = ['tasks', 'files', 'memo'];
const TODAY_SIDEBAR_CARD_IDS = ['current', 'progress', 'inbox', 'memo'];
const PROJECT_BOARD_VERSION = 1;
const PROJECT_BOARD_COLUMNS = 4;
const PROJECT_BOARD_UTILITY_IDS = ['files', 'tasks'];
const VAULT_FILE_KINDS = ['markdown', 'canvas', 'base', 'pdf', 'image', 'plugin-file', 'other'];

function createId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: {},
    vaultRefs: {},
    modules: {},
    resourceGroups: {},
    resources: {},
    plans: {},
    sources: {},
    notes: {},
    activity: [],
    inbox: [],
    uiState: {
      route: 'today',
      currentProjectId: '',
      collapsedTodayProjects: {},
      todayProjectOrder: [],
      todaySidebarOrder: TODAY_SIDEBAR_CARD_IDS.slice(),
      showInterfaceTips: true,
      collapsedProjectPlans: {},
      scrollPositions: {},
      currentResourceModuleId: '',
      selectedBiliSourceId: '',
      webOpenPreference: '',
      projectPanelOrder: PROJECT_PANEL_IDS.slice(),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: {},
      projectRecentCollapsedByProject: {},
      collapsedResourceGroupsByModule: {},
      recentVaultCreatePaths: [],
      pinnedVaultCreatePaths: [],
      lastAction: null
    }
  };
}

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string'))];
}

function normalizeProjectPanelOrder(value) {
  const allowed = uniqueStrings(value).filter((panelId) => PROJECT_PANEL_IDS.includes(panelId));
  return [...allowed, ...PROJECT_PANEL_IDS.filter((panelId) => !allowed.includes(panelId))];
}

function normalizeTodaySidebarOrder(value) {
  const allowed = uniqueStrings(value).filter((cardId) => TODAY_SIDEBAR_CARD_IDS.includes(cardId));
  return [...allowed, ...TODAY_SIDEBAR_CARD_IDS.filter((cardId) => !allowed.includes(cardId))];
}

function normalizeTodayProjectOrder(value, projects) {
  const projectIds = (Array.isArray(projects) ? projects : []).map((project) => project.id);
  const saved = uniqueStrings(value).filter((projectId) => projectIds.includes(projectId));
  return [...saved, ...projectIds.filter((projectId) => !saved.includes(projectId))];
}

function moveRelative(order, sourceId, targetId, after = false) {
  const next = uniqueStrings(order);
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return next;
  next.splice(sourceIndex, 1);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
  return next;
}

function projectBoardModuleKeys(state, projectId, includeArchived = true) {
  return Object.values(objectOr(state.modules))
    .filter((module) => module.projectId === projectId && !module.deletedAt && (includeArchived || !module.archivedAt))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      || String(left.id).localeCompare(String(right.id)))
    .map((module) => `module:${module.id}`);
}

function projectBoardUtilityKeys(panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const order = normalizeProjectPanelOrder(panelOrder).filter((panelId) => PROJECT_BOARD_UTILITY_IDS.includes(panelId));
  return order.map((panelId) => `utility:${panelId}`);
}

function projectBoardMemoKeys(state, projectId) {
  return normalizeProjectMemos(state.projects?.[projectId]?.memos, projectId).map((memo) => `memo:${memo.id}`);
}

function cloneProjectBoardLayout(layout) {
  return {
    version: PROJECT_BOARD_VERSION,
    items: Object.fromEntries(Object.entries(objectOr(layout?.items)).map(([key, anchor]) => [key, {
      column: anchor.column,
      row: anchor.row,
      ...(key.startsWith('memo:') ? { side: anchor.side === 'right' ? 'right' : 'left' } : {})
    }]))
  };
}

function validProjectBoardAnchor(anchor) {
  return Number.isInteger(anchor?.column) && anchor.column >= 1 && anchor.column <= PROJECT_BOARD_COLUMNS
    && Number.isInteger(anchor?.row) && anchor.row >= 1;
}

function projectBoardMemoSide(value) {
  return value === 'right' ? 'right' : 'left';
}

function projectBoardCellOccupants(items, column, row, excludedKey = '') {
  return Object.entries(objectOr(items)).filter(([key, anchor]) => key !== excludedKey
    && validProjectBoardAnchor(anchor) && anchor.column === column && anchor.row === row);
}

function firstAvailableProjectBoardMemoAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      const occupants = projectBoardCellOccupants(items, column, row);
      if (occupants.some(([key]) => !key.startsWith('memo:'))) continue;
      for (const side of ['left', 'right']) {
        if (!occupants.some(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === side)) {
          return { column, row, side };
        }
      }
    }
  }
}

function firstAvailableProjectBoardAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      if (!projectBoardCellOccupants(items, column, row).length) return { column, row };
    }
  }
}

function defaultProjectBoardLayout(state, projectId, panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const items = {};
  projectBoardModuleKeys(state, projectId).forEach((key, index) => {
    items[key] = { column: (index % 3) + 1, row: Math.floor(index / 3) + 1 };
  });
  projectBoardUtilityKeys(panelOrder).forEach((key, index) => {
    items[key] = { column: PROJECT_BOARD_COLUMNS, row: index + 1 };
  });
  projectBoardMemoKeys(state, projectId).forEach((key, index) => {
    items[key] = {
      column: PROJECT_BOARD_COLUMNS,
      row: projectBoardUtilityKeys(panelOrder).length + Math.floor(index / 2) + 1,
      side: index % 2 ? 'right' : 'left'
    };
  });
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayout(rawLayout, state, projectId, panelOrder) {
  const rawItems = objectOr(rawLayout?.items);
  const memoKeys = projectBoardMemoKeys(state, projectId);
  const legacyMemoAnchor = validProjectBoardAnchor(rawItems['utility:memo']) ? rawItems['utility:memo'] : null;
  const allowedKeys = [...projectBoardModuleKeys(state, projectId), ...projectBoardUtilityKeys(), ...memoKeys];
  const fullKeys = allowedKeys.filter((key) => !key.startsWith('memo:'));
  const items = {};
  for (const key of fullKeys) {
    const anchor = rawItems[key];
    if (!validProjectBoardAnchor(anchor) || projectBoardCellOccupants(items, anchor.column, anchor.row).length) continue;
    items[key] = { column: anchor.column, row: anchor.row };
  }
  const legacyByColumn = new Map();
  for (const key of memoKeys) {
    const rawAnchor = rawItems[key] || (key === memoKeys[0] ? legacyMemoAnchor : null);
    if (!validProjectBoardAnchor(rawAnchor)) continue;
    let anchor = { column: rawAnchor.column, row: rawAnchor.row, side: projectBoardMemoSide(rawAnchor.side) };
    if (!rawAnchor.side) {
      const previous = legacyByColumn.get(anchor.column);
      if (previous && anchor.row === previous.originalRow + 1) {
        anchor = {
          column: previous.column,
          row: previous.baseRow + Math.floor(previous.count / 2),
          side: previous.count % 2 ? 'right' : 'left'
        };
        previous.originalRow = rawAnchor.row;
        previous.count += 1;
      } else {
        legacyByColumn.set(anchor.column, { column: anchor.column, baseRow: anchor.row, originalRow: rawAnchor.row, count: 1 });
      }
    }
    const occupants = projectBoardCellOccupants(items, anchor.column, anchor.row);
    if (occupants.some(([candidateKey]) => !candidateKey.startsWith('memo:'))
      || occupants.some(([candidateKey, candidateAnchor]) => candidateKey.startsWith('memo:') && projectBoardMemoSide(candidateAnchor.side) === anchor.side)) continue;
    items[key] = anchor;
  }
  if (!Object.keys(items).length) return defaultProjectBoardLayout(state, projectId, panelOrder);
  for (const key of fullKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardAnchor(items);
  }
  for (const key of memoKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardMemoAnchor(items);
  }
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayouts(value, state, panelOrder) {
  const rawLayouts = objectOr(value);
  return Object.fromEntries(Object.keys(state.projects).map((projectId) => [
    projectId,
    normalizeProjectBoardLayout(rawLayouts[projectId], state, projectId, panelOrder)
  ]));
}

function normalizeVaultPath(rawPath) {
  const parts = String(rawPath || '').trim().replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('Vault 路径不能包含 ..。');
  return parts.join('/').normalize('NFC');
}

function normalizeVaultPathList(value) {
  const normalized = [];
  for (const rawPath of Array.isArray(value) ? value : []) {
    try {
      const path = normalizeVaultPath(rawPath);
      if (!normalized.includes(path)) normalized.push(path);
    } catch { /* 忽略旧状态中的非法路径。 */ }
  }
  return normalized;
}

function normalizeVaultFileKind(value) {
  const fileKind = String(value || 'other');
  return VAULT_FILE_KINDS.includes(fileKind) ? fileKind : 'other';
}

function normalizeVaultRefs(value) {
  const normalized = {};
  for (const [id, rawVaultRef] of Object.entries(objectOr(value))) {
    const vaultRef = objectOr(rawVaultRef);
    try {
      const path = normalizeVaultPath(vaultRef.path);
      if (!path) continue;
      normalized[id] = {
        ...vaultRef,
        id,
        path,
        entryType: vaultRef.entryType === 'folder' ? 'folder' : 'file',
        fileKind: normalizeVaultFileKind(vaultRef.fileKind),
        missingAt: String(vaultRef.missingAt || '')
      };
    } catch { /* 忽略旧状态中的非法引用。 */ }
  }
  return normalized;
}

function normalizeProjectMemos(value, projectId = 'project') {
  const normalized = [];
  const usedIds = new Set();
  const rawMemos = Array.isArray(value) ? value : [];
  rawMemos.forEach((rawMemo, index) => {
    const source = typeof rawMemo === 'string' ? { text: rawMemo } : objectOr(rawMemo);
    const baseId = String(source.id || '').trim() || `memo-${projectId}-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    const text = String(source.text ?? source.memoText ?? source.content ?? '');
    const createdAt = String(source.createdAt ?? source.updatedAt ?? source.memoUpdatedAt ?? '');
    const updatedAt = String(source.updatedAt ?? source.memoUpdatedAt ?? source.createdAt ?? '');
    normalized.push({ ...source, id, title: String(source.title || '').trim(), text, createdAt, updatedAt });
    usedIds.add(id);
  });
  return normalized;
}

function normalizeProjectRecentCollapsedByProject(value, projects) {
  const input = objectOr(value);
  const normalized = {};
  for (const [projectId, collapsed] of Object.entries(input)) {
    if (!projects[projectId]) continue;
    normalized[projectId] = Boolean(collapsed);
  }
  return normalized;
}

function normalizeModules(value, resources) {
  return Object.fromEntries(Object.entries(objectOr(value)).map(([id, rawModule]) => {
    const module = objectOr(rawModule);
    const resourceIds = uniqueStrings(module.resourceIds).filter((resourceId) => resources[resourceId]);
    const resourceRoots = {};
    for (const [resourceId, rootPath] of Object.entries(objectOr(module.resourceRoots))) {
      if (!resourceIds.includes(resourceId) || (!resourceOpenListPath(resources[resourceId]) && !resourceLocalPath(resources[resourceId]))) continue;
      resourceRoots[resourceId] = normalizeResourceRoot(resources[resourceId], rootPath);
    }
    return [id, { ...module, id, resourceIds, resourceRoots, resourceGroupIds: uniqueStrings(module.resourceGroupIds) }];
  }));
}

function normalizeResourceGroups(value, modules, resources) {
  const normalized = {};
  const candidateResourceIds = new Map();
  for (const [id, rawGroup] of Object.entries(objectOr(value))) {
    const group = objectOr(rawGroup);
    const module = modules[group.moduleId];
    const title = String(group.title || '').trim();
    if (!module || !title) continue;
    candidateResourceIds.set(id, uniqueStrings(group.resourceIds));
    normalized[id] = {
      ...group,
      id,
      moduleId: module.id,
      title,
      scopePath: normalizeResourceGroupScopePath(group.scopePath || String(group.autoGroupKey || '').split(':folder:').slice(1).join(':folder:')),
      resourceIds: [],
      sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 0
    };
  }
  for (const module of Object.values(modules)) {
    const listed = uniqueStrings(module.resourceGroupIds).filter((groupId) => normalized[groupId]?.moduleId === module.id);
    const remaining = Object.values(normalized)
      .filter((group) => group.moduleId === module.id && !listed.includes(group.id))
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
      .map((group) => group.id);
    module.resourceGroupIds = [...listed, ...remaining];
    const assigned = new Set();
    module.resourceGroupIds.forEach((groupId, index) => {
      const group = normalized[groupId];
      group.sortOrder = index;
      group.resourceIds = (candidateResourceIds.get(groupId) || []).filter((resourceId) => {
        if (!resources[resourceId] || !module.resourceIds.includes(resourceId) || assigned.has(resourceId)) return false;
        assigned.add(resourceId);
        return true;
      });
    });
  }
  return normalized;
}

function normalizeResourceGroupScopePath(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

function normalizeCollapsedResourceGroups(value, modules, resourceGroups) {
  const normalized = {};
  for (const [moduleId, rawGroups] of Object.entries(objectOr(value))) {
    if (!modules[moduleId]) continue;
    const groups = {};
    for (const [groupId, collapsed] of Object.entries(objectOr(rawGroups))) {
      if (resourceGroups[groupId]?.moduleId === moduleId) groups[groupId] = Boolean(collapsed);
    }
    if (Object.keys(groups).length) normalized[moduleId] = groups;
  }
  return normalized;
}

function normalizeProjectMemoFields(project, projectId) {
  const legacyText = String(project.memoText ?? '');
  const legacyUpdatedAt = String(project.memoUpdatedAt ?? '');
  const memos = normalizeProjectMemos(project.memos, projectId);
  if (legacyText.length > 0) {
    const existing = memos.find((memo) => memo.text === legacyText);
    if (!existing) {
      const blankDefault = memos.length === 1 && !memos[0].text;
      if (blankDefault) {
        memos[0] = {
          ...memos[0],
          title: String(memos[0].title || '').trim(),
          text: legacyText,
          createdAt: memos[0].createdAt || legacyUpdatedAt,
          updatedAt: legacyUpdatedAt
        };
      } else {
        const baseId = `memo-${projectId}-legacy`;
        const usedIds = new Set(memos.map((memo) => memo.id));
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        memos.push({ id, title: '', text: legacyText, createdAt: legacyUpdatedAt, updatedAt: legacyUpdatedAt });
      }
    }
  }
  const firstMemo = memos[0];
  const memoText = legacyText || String(firstMemo?.text || '');
  const memoUpdatedAt = legacyUpdatedAt || String(firstMemo?.updatedAt || '');
  return { memos, memoText, memoUpdatedAt };
}

function normalizeState(raw) {
  const base = defaultState();
  const input = objectOr(raw);
  const inputSchemaVersion = Number(input.schemaVersion || 0);
  if (Number.isFinite(inputSchemaVersion) && inputSchemaVersion > SCHEMA_VERSION) {
    throw new Error(`数据版本 ${inputSchemaVersion} 高于当前支持的 ${SCHEMA_VERSION}，已停止加载以避免覆盖较新数据。`);
  }
  const inputProjects = objectOr(input.projects);
  const vaultRefs = normalizeVaultRefs(input.vaultRefs);
  const projects = Object.fromEntries(Object.entries(inputProjects).map(([id, rawProject]) => {
    const project = objectOr(rawProject);
    const memoFields = normalizeProjectMemoFields(project, id);
    const vaultRefIds = uniqueStrings(project.vaultRefIds).filter((vaultRefId) => vaultRefs[vaultRefId]);
    return [id, {
      ...project,
      vaultRefIds,
      pinnedVaultRefIds: uniqueStrings(project.pinnedVaultRefIds).filter((vaultRefId) => vaultRefIds.includes(vaultRefId)),
      memos: memoFields.memos,
      memoText: memoFields.memoText,
      memoUpdatedAt: memoFields.memoUpdatedAt
    }];
  }));
  const resources = objectOr(input.resources);
  const modules = normalizeModules(input.modules, resources);
  const resourceGroups = normalizeResourceGroups(input.resourceGroups, modules, resources);
  const state = {
    ...base,
    ...input,
    projects,
    vaultRefs,
    modules,
    resourceGroups,
    resources,
    plans: objectOr(input.plans),
    sources: objectOr(input.sources),
    notes: objectOr(input.notes),
    activity: Array.isArray(input.activity) ? input.activity.slice(-500) : [],
    inbox: Array.isArray(input.inbox) ? input.inbox : [],
    uiState: {
      ...base.uiState,
      ...objectOr(input.uiState),
      collapsedTodayProjects: objectOr(input.uiState?.collapsedTodayProjects),
      todayProjectOrder: uniqueStrings(input.uiState?.todayProjectOrder),
      todaySidebarOrder: normalizeTodaySidebarOrder(input.uiState?.todaySidebarOrder),
      showInterfaceTips: input.uiState?.showInterfaceTips !== false,
      collapsedProjectPlans: objectOr(input.uiState?.collapsedProjectPlans),
      scrollPositions: objectOr(input.uiState?.scrollPositions),
      projectPanelOrder: normalizeProjectPanelOrder(input.uiState?.projectPanelOrder),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: objectOr(input.uiState?.projectPanelCollapsedByProject),
      projectRecentCollapsedByProject: normalizeProjectRecentCollapsedByProject(input.uiState?.projectRecentCollapsedByProject, projects),
      collapsedResourceGroupsByModule: normalizeCollapsedResourceGroups(input.uiState?.collapsedResourceGroupsByModule, modules, resourceGroups),
      recentVaultCreatePaths: normalizeVaultPathList(input.uiState?.recentVaultCreatePaths).slice(0, 5),
      pinnedVaultCreatePaths: normalizeVaultPathList(input.uiState?.pinnedVaultCreatePaths)
    }
  };
  state.uiState.projectBoardLayouts = normalizeProjectBoardLayouts(
    input.uiState?.projectBoardLayouts,
    state,
    state.uiState.projectPanelOrder
  );
  state.uiState.todayProjectOrder = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.schemaVersion = SCHEMA_VERSION;
  if (!state.uiState.currentProjectId || !state.projects[state.uiState.currentProjectId]) {
    state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  }
  return state;
}

function nowIso() {
  return new Date().toISOString();
}

function activeProjects(state) {
  return Object.values(state.projects)
    .filter((project) => !project.archivedAt && !project.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function todayProjects(state) {
  const projects = activeProjects(state);
  const order = normalizeTodayProjectOrder(state.uiState?.todayProjectOrder, projects);
  const byId = new Map(projects.map((project) => [project.id, project]));
  return order.map((projectId) => byId.get(projectId)).filter(Boolean);
}

function moveTodayProjectBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.uiState.todayProjectOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todayProjectOrder;
}

function moveTodaySidebarCardBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodaySidebarOrder(state.uiState.todaySidebarOrder);
  state.uiState.todaySidebarOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todaySidebarOrder;
}

function projectModules(state, projectId) {
  return Object.values(state.modules)
    .filter((module) => module.projectId === projectId && !module.archivedAt && !module.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function ensureProjectBoardLayout(state, projectId) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  state.uiState = objectOr(state.uiState);
  state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
  const rawLayout = state.uiState.projectBoardLayouts[projectId];
  const layout = normalizeProjectBoardLayout(rawLayout, state, projectId, state.uiState.projectPanelOrder);
  state.uiState.projectBoardLayouts[projectId] = layout;
  return layout;
}

function projectBoardItems(state, projectId, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  const visibleKeys = new Set([
    ...projectBoardModuleKeys(state, projectId, Boolean(options.includeArchived)),
    ...projectBoardUtilityKeys(),
    ...projectBoardMemoKeys(state, projectId)
  ]);
  return Object.entries(layout.items)
    .filter(([key]) => visibleKeys.has(key))
    .map(([key, anchor]) => {
      if (key.startsWith('module:')) {
        const moduleId = key.slice('module:'.length);
        return { key, kind: 'module', moduleId, module: state.modules[moduleId], ...anchor };
      }
      if (key.startsWith('memo:')) {
        const memoId = key.slice('memo:'.length);
        return { key, kind: 'memo', memoId, memo: state.projects[projectId]?.memos?.find((memo) => memo.id === memoId), ...anchor };
      }
      return { key, kind: 'utility', utilityId: key.slice('utility:'.length), ...anchor };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column || left.key.localeCompare(right.key));
}

function moveProjectBoardItem(state, projectId, itemKey, column, row, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  if (!layout.items[itemKey]) throw new Error('找不到布局项。');
  const memoItem = itemKey.startsWith('memo:');
  const target = {
    column: Number(column),
    row: Number(row),
    ...(memoItem ? { side: projectBoardMemoSide(options.side) } : {})
  };
  if (!validProjectBoardAnchor(target)) throw new Error('布局位置无效。');
  const source = layout.items[itemKey];
  if (source.column === target.column && source.row === target.row
    && (!memoItem || projectBoardMemoSide(source.side) === target.side)) return { layout, itemKey, swappedWith: '' };
  const layoutBefore = cloneProjectBoardLayout(layout);
  const targetOccupants = projectBoardCellOccupants(layout.items, target.column, target.row, itemKey);
  let occupied = null;
  if (memoItem) {
    if (targetOccupants.some(([key]) => !key.startsWith('memo:'))) throw new Error('目标整格已被其他组件占用。');
    occupied = targetOccupants.find(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === target.side) || null;
  } else {
    if (targetOccupants.some(([key]) => key.startsWith('memo:'))) throw new Error('目标格包含便签，请先移动便签。');
    occupied = targetOccupants[0] || null;
  }
  layout.items[itemKey] = target;
  if (occupied) layout.items[occupied[0]] = {
    column: source.column,
    row: source.row,
    ...(occupied[0].startsWith('memo:') ? { side: projectBoardMemoSide(source.side) } : {})
  };
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '调整项目布局',
    projectId,
    layoutBefore
  });
  return { layout, itemKey, swappedWith: occupied?.[0] || '' };
}

function resetProjectBoardLayout(state, projectId) {
  const layoutBefore = cloneProjectBoardLayout(ensureProjectBoardLayout(state, projectId));
  const layout = defaultProjectBoardLayout(state, projectId);
  state.uiState.projectBoardLayouts[projectId] = layout;
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '恢复默认项目布局',
    projectId,
    layoutBefore
  });
  return layout;
}

function moduleResources(state, moduleId) {
  const resourceIds = state.modules[moduleId]?.resourceIds || [];
  return resourceIds.map((id) => state.resources[id]).filter((resource) => resource && !resource.deletedAt);
}

function moduleResourceGroups(state, moduleId) {
  const module = state.modules[moduleId];
  if (!module) return [];
  const listed = uniqueStrings(module.resourceGroupIds)
    .map((groupId) => state.resourceGroups[groupId])
    .filter((group) => group?.moduleId === moduleId);
  const listedIds = new Set(listed.map((group) => group.id));
  const remaining = Object.values(objectOr(state.resourceGroups))
    .filter((group) => group.moduleId === moduleId && !listedIds.has(group.id));
  return [...listed, ...remaining]
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
}

function resourceGroupProgress(state, groupId) {
  const group = state.resourceGroups[groupId];
  if (!group || !state.modules[group.moduleId]) throw new Error('找不到资源分组。');
  const moduleIds = new Set(state.modules[group.moduleId].resourceIds || []);
  const resources = uniqueStrings(group.resourceIds)
    .filter((resourceId) => moduleIds.has(resourceId))
    .map((resourceId) => state.resources[resourceId])
    .filter((resource) => resource && !resource.deletedAt);
  const completed = resources.filter((resource) => resource.completedAt).length;
  return { total: resources.length, completed, done: resources.length > 0 && completed === resources.length };
}

function touchModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) return '';
  const timestamp = at.toISOString();
  module.updatedAt = timestamp;
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return timestamp;
}

function createResourceGroup(state, moduleId, title, resourceIds = [], at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  const id = createId('resource-group');
  const timestamp = at.toISOString();
  const sortOrder = moduleResourceGroups(state, moduleId).length;
  state.resourceGroups = objectOr(state.resourceGroups);
  state.resourceGroups[id] = {
    id,
    moduleId,
    title: value,
    resourceIds: [],
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  module.resourceGroupIds = [...new Set([...(module.resourceGroupIds || []), id])];
  if (resourceIds.length) moveResourcesToGroup(state, moduleId, resourceIds, id, at);
  else touchModule(state, moduleId, at);
  return state.resourceGroups[id];
}

function renameResourceGroup(state, groupId, title, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  group.title = value;
  group.updatedAt = touchModule(state, group.moduleId, at);
  return group;
}

function moveResourceGroup(state, moduleId, groupId, targetGroupId, at = new Date()) {
  const ordered = moduleResourceGroups(state, moduleId);
  const from = ordered.findIndex((group) => group.id === groupId);
  const to = ordered.findIndex((group) => group.id === targetGroupId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = touchModule(state, moduleId, at);
  ordered.forEach((group, index) => {
    group.sortOrder = index;
    group.updatedAt = timestamp;
  });
  state.modules[moduleId].resourceGroupIds = ordered.map((group) => group.id);
  return ordered;
}

function moveResourcesToGroup(state, moduleId, resourceIds, groupId = '', at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const target = groupId ? state.resourceGroups[groupId] : null;
  if (groupId && target?.moduleId !== moduleId) throw new Error('找不到目标资源分组。');
  const moduleIds = new Set(module.resourceIds || []);
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter((resourceId) => moduleIds.has(resourceId) && state.resources[resourceId]))];
  const affected = new Set(ids);
  const timestamp = touchModule(state, moduleId, at);
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = uniqueStrings(group.resourceIds).filter((resourceId) => !affected.has(resourceId));
    if (nextIds.length !== uniqueStrings(group.resourceIds).length) {
      group.resourceIds = nextIds;
      group.updatedAt = timestamp;
    }
  }
  if (target) {
    target.resourceIds = [...new Set([...(target.resourceIds || []), ...ids])];
    target.updatedAt = timestamp;
  }
  return { group: target, resourceIds: ids };
}

function moveResourceToGroup(state, moduleId, resourceId, groupId = '', at = new Date()) {
  return moveResourcesToGroup(state, moduleId, [resourceId], groupId, at);
}

function deleteResourceGroup(state, groupId, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const module = state.modules[group.moduleId];
  const snapshot = { ...group, resourceIds: [...(group.resourceIds || [])] };
  delete state.resourceGroups[groupId];
  if (module) {
    module.resourceGroupIds = (module.resourceGroupIds || []).filter((id) => id !== groupId);
    const ordered = moduleResourceGroups(state, module.id);
    ordered.forEach((item, index) => { item.sortOrder = index; });
    touchModule(state, module.id, at);
  }
  delete state.uiState.collapsedResourceGroupsByModule?.[group.moduleId]?.[groupId];
  if (state.uiState.collapsedResourceGroupsByModule?.[group.moduleId] && !Object.keys(state.uiState.collapsedResourceGroupsByModule[group.moduleId]).length) {
    delete state.uiState.collapsedResourceGroupsByModule[group.moduleId];
  }
  return { group: snapshot, ungroupedResourceIds: snapshot.resourceIds };
}

function setResourceGroupCollapsed(state, moduleId, groupId, collapsed) {
  if (state.resourceGroups[groupId]?.moduleId !== moduleId) throw new Error('找不到资源分组。');
  state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
  state.uiState.collapsedResourceGroupsByModule[moduleId] = {
    ...objectOr(state.uiState.collapsedResourceGroupsByModule[moduleId]),
    [groupId]: Boolean(collapsed)
  };
  return state.uiState.collapsedResourceGroupsByModule[moduleId][groupId];
}

function defaultResourceAutoGroupEnabled(resourceCount) {
  return Number(resourceCount || 0) > 20;
}

function resourceGroupTitle(index) {
  const value = Math.max(1, Math.floor(Number(index || 1)));
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const chineseNumber = value < 10
    ? digits[value]
    : value < 20
      ? `十${value % 10 ? digits[value % 10] : ''}`
      : value < 100
        ? `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ''}`
        : String(value);
  return `第${chineseNumber}组`;
}

function autoGroupResources(state, moduleId, orderedResourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const size = Math.max(1, Math.min(200, Math.floor(Number(options.size || 20))));
  const key = String(options.key || '').trim();
  const scopePath = normalizeResourceGroupScopePath(options.scopePath);
  if (!key) throw new Error('自动分组缺少稳定批次身份。');
  const ids = [...new Set((Array.isArray(orderedResourceIds) ? orderedResourceIds : []).filter((resourceId) => (module.resourceIds || []).includes(resourceId) && state.resources[resourceId]))];
  const assigned = new Map();
  for (const group of moduleResourceGroups(state, moduleId)) {
    for (const resourceId of group.resourceIds || []) assigned.set(resourceId, group);
  }
  const groups = [];
  const createdGroupIds = [];
  const timestamp = options.at instanceof Date ? options.at : new Date();
  for (let offset = 0; offset < ids.length; offset += size) {
    const index = Math.floor(offset / size) + 1;
    const chunk = ids.slice(offset, offset + size);
    let group = moduleResourceGroups(state, moduleId).find((candidate) => candidate.autoGroupKey === key && Number(candidate.autoGroupIndex) === index);
    const available = chunk.filter((resourceId) => !assigned.has(resourceId) || assigned.get(resourceId)?.id === group?.id);
    if (!group && !available.length) continue;
    if (!group) {
      group = createResourceGroup(state, moduleId, options.titleForIndex?.(index) || resourceGroupTitle(index), [], timestamp);
      group.autoGroupKey = key;
      group.autoGroupIndex = index;
      group.autoGroupSize = size;
      group.scopePath = scopePath;
      createdGroupIds.push(group.id);
    }
    if (!group.scopePath && scopePath) group.scopePath = scopePath;
    if (available.length) {
      moveResourcesToGroup(state, moduleId, available, group.id, timestamp);
      for (const resourceId of available) assigned.set(resourceId, group);
    }
    groups.push(group);
  }
  return { groups, createdGroupIds, resourceIds: ids, skippedResourceIds: ids.filter((resourceId) => !groups.some((group) => group.resourceIds.includes(resourceId))) };
}

function removeResourcesFromModule(state, moduleId, resourceIds, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const removed = new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter(Boolean));
  module.resourceIds = (module.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
  for (const resourceId of removed) delete module.resourceRoots?.[resourceId];
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = (group.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
    if (nextIds.length !== (group.resourceIds || []).length) {
      group.resourceIds = nextIds;
      group.updatedAt = at.toISOString();
    }
  }
  touchModule(state, moduleId, at);
  return [...removed];
}

function resourceOpenListPath(resource) {
  return resource?.launcher?.type === 'openlist' || resource?.launcher?.type === 'openlist-file' || resource?.metadata?.remotePath
    ? normalizeOpenListPath(resource.launcher?.remotePath || resource.metadata?.remotePath || '/')
    : '';
}

function resourceLocalPath(resource) {
  return resource?.launcher?.type === 'file' ? String(resource.launcher.path || resource.metadata?.localPath || '') : String(resource?.metadata?.localPath || '');
}

function normalizeResourceRoot(resource, rootPath) {
  if (resourceOpenListPath(resource)) return normalizeOpenListPath(rootPath || '/');
  if (resourceLocalPath(resource)) return String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return '';
}

function commonOpenListParent(resources) {
  const parents = (Array.isArray(resources) ? resources : []).map((resource) => {
    const remotePath = resourceOpenListPath(resource);
    if (!remotePath) return null;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return parts;
  }).filter(Boolean);
  if (!parents.length) return '';
  const common = [];
  for (let index = 0; index < parents[0].length; index += 1) {
    const segment = parents[0][index];
    if (!parents.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function moduleResourceRoot(state, moduleId, resourceId) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module || (!resourceOpenListPath(resource) && !resourceLocalPath(resource))) return '';
  const stored = module.resourceRoots?.[resourceId];
  if (stored) return normalizeResourceRoot(resource, stored);
  if (resourceLocalPath(resource)) return normalizeResourceRoot(resource, resource.metadata?.rootPath);
  const peers = moduleResources(state, moduleId).filter((candidate) => resourceOpenListPath(candidate) && String(candidate.sourceId || candidate.launcher?.sourceId || '') === String(resource.sourceId || resource.launcher?.sourceId || ''));
  return commonOpenListParent(peers) || normalizeOpenListPath(resource.metadata?.rootPath || '/');
}

function resourceFolderPath(resource, rootPathValue = '') {
  const resourcePath = String(resource?.metadata?.remotePath || resource?.launcher?.remotePath || resource?.metadata?.localPath || (resource?.launcher?.type === 'file' ? resource.launcher.path : '') || '').replace(/\\/g, '/');
  if (!resourcePath) return '';
  const rootPath = String(rootPathValue || resource?.metadata?.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const localResource = Boolean(resource?.metadata?.localPath || resource?.launcher?.type === 'file');
  const rootMatches = rootPath && rootPath !== '/' && (localResource
    ? resourcePath.toLowerCase() === rootPath.toLowerCase() || resourcePath.toLowerCase().startsWith(`${rootPath.toLowerCase()}/`)
    : resourcePath === rootPath || resourcePath.startsWith(`${rootPath}/`));
  const relative = rootMatches ? resourcePath.slice(rootPath.length).replace(/^\/+/, '') : resourcePath.replace(/^\/+/, '');
  const relativeFolder = relative.split('/').filter(Boolean).slice(0, -1).join('/');
  if (!localResource || !rootMatches) return relativeFolder;
  const rootLabel = rootPath.split('/').filter(Boolean).at(-1) || rootPath;
  return [rootLabel, relativeFolder].filter(Boolean).join('/');
}

function linkResourcesToModule(state, moduleId, resourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).filter((resourceId) => state.resources[resourceId] && !state.resources[resourceId].deletedAt))];
  const existing = new Set(module.resourceIds || []);
  const linkedResourceIds = ids.filter((resourceId) => !existing.has(resourceId));
  module.resourceIds = [...new Set([...(module.resourceIds || []), ...ids])];
  module.resourceRoots = objectOr(module.resourceRoots);
  if (options.rootPath) {
    for (const resourceId of ids) {
      const rootPath = normalizeResourceRoot(state.resources[resourceId], options.rootPath);
      if (rootPath) module.resourceRoots[resourceId] = rootPath;
    }
  } else {
    const groups = new Map();
    for (const resourceId of ids) {
      const resource = state.resources[resourceId];
      if (!resourceOpenListPath(resource)) continue;
      const key = String(resource.sourceId || resource.launcher?.sourceId || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(resource);
    }
    for (const resources of groups.values()) {
      const rootPath = commonOpenListParent(resources);
      if (rootPath) for (const resource of resources) module.resourceRoots[resource.id] = rootPath;
    }
  }
  module.updatedAt = nowIso();
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = module.updatedAt;
  return { module, resourceIds: ids, linkedResourceIds };
}

function projectPlans(state, projectId) {
  return Object.values(state.plans)
    .filter((plan) => plan.projectId === projectId && !plan.archivedAt && !plan.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function createProject(state, title) {
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  const id = createId('project');
  const timestamp = nowIso();
  const memoId = createId('memo');
  state.projects[id] = {
    id,
    title: value,
    moduleIds: [],
    noteIds: [],
    vaultRefIds: [],
    pinnedVaultRefIds: [],
    memos: [{ id: memoId, text: '', createdAt: timestamp, updatedAt: '' }],
    memoText: '',
    memoUpdatedAt: '',
    sortOrder: activeProjects(state).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.uiState.currentProjectId = id;
  return state.projects[id];
}

function inferVaultFileKind(path, entryType) {
  if (entryType === 'folder') return 'other';
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.excalidraw.md')) return 'plugin-file';
  const extension = lower.split('.').pop();
  if (extension === 'md') return 'markdown';
  if (extension === 'canvas') return 'canvas';
  if (extension === 'base') return 'base';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return 'image';
  return 'other';
}

function projectVaultRefs(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) return [];
  const pinnedIds = new Set(project.pinnedVaultRefIds || []);
  return (project.vaultRefIds || [])
    .map((vaultRefId, index) => ({ vaultRef: state.vaultRefs[vaultRefId], index }))
    .filter(({ vaultRef }) => vaultRef)
    .sort((left, right) => Number(pinnedIds.has(right.vaultRef.id)) - Number(pinnedIds.has(left.vaultRef.id)) || left.index - right.index)
    .map(({ vaultRef }) => vaultRef);
}

function upsertVaultRef(state, input, at = new Date()) {
  const path = normalizeVaultPath(input?.path);
  if (!path) throw new Error('Vault 路径不能为空。');
  const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
  if (!entryType) throw new Error('项目文件类型必须是 file 或 folder。');
  const existing = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === path && vaultRef.entryType === entryType);
  const timestamp = at.toISOString();
  if (existing) {
    if (input.fileKind) existing.fileKind = normalizeVaultFileKind(input.fileKind);
    existing.missingAt = '';
    existing.updatedAt = timestamp;
    return { vaultRef: existing, reused: true };
  }
  const id = createId('vault-ref');
  const vaultRef = {
    id,
    path,
    entryType,
    fileKind: normalizeVaultFileKind(input?.fileKind || inferVaultFileKind(path, entryType)),
    createdAt: timestamp,
    updatedAt: timestamp,
    missingAt: ''
  };
  state.vaultRefs[id] = vaultRef;
  return { vaultRef, reused: false };
}

function linkVaultRefToProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!state.vaultRefs[vaultRefId]) throw new Error('找不到项目文件引用。');
  const wasLinked = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = uniqueStrings([...(project.vaultRefIds || []), vaultRefId]);
  project.updatedAt = at.toISOString();
  return { vaultRef: state.vaultRefs[vaultRefId], reused: wasLinked };
}

function linkVaultEntriesToProject(state, projectId, inputs, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRefsBefore = Object.fromEntries(Object.entries(state.vaultRefs).map(([id, vaultRef]) => [id, { ...vaultRef }]));
  const projectBefore = { vaultRefIds: [...(project.vaultRefIds || [])], pinnedVaultRefIds: [...(project.pinnedVaultRefIds || [])], updatedAt: project.updatedAt };
  const lastActionBefore = state.uiState.lastAction;
  const linkedVaultRefIds = [];
  const createdVaultRefIds = [];
  const reusedVaultRefSnapshots = [];
  try {
    for (const input of Array.isArray(inputs) ? inputs : []) {
      const normalizedPath = normalizeVaultPath(input?.path);
      const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
      const existingBefore = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === normalizedPath && vaultRef.entryType === entryType);
      const result = upsertVaultRef(state, input, at);
      if (!result.reused) createdVaultRefIds.push(result.vaultRef.id);
      const linked = linkVaultRefToProject(state, projectId, result.vaultRef.id, at);
      if (!linked.reused) {
        linkedVaultRefIds.push(result.vaultRef.id);
        if (existingBefore && !reusedVaultRefSnapshots.some((snapshot) => snapshot.id === existingBefore.id)) reusedVaultRefSnapshots.push({ ...vaultRefsBefore[existingBefore.id] });
      }
    }
    if (linkedVaultRefIds.length) {
      recordLastAction(state, {
        type: 'link-vault-refs',
        label: `关联 ${linkedVaultRefIds.length} 个项目文件`,
        projectId,
        linkedVaultRefIds,
        createdVaultRefIds,
        reusedVaultRefSnapshots
      });
    }
  } catch (error) {
    state.vaultRefs = vaultRefsBefore;
    project.vaultRefIds = projectBefore.vaultRefIds;
    project.pinnedVaultRefIds = projectBefore.pinnedVaultRefIds;
    project.updatedAt = projectBefore.updatedAt;
    state.uiState.lastAction = lastActionBefore;
    throw error;
  }
  return { linkedVaultRefIds, createdVaultRefIds };
}

function unlinkVaultRefFromProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRef = state.vaultRefs[vaultRefId] || null;
  const removed = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = (project.vaultRefIds || []).filter((id) => id !== vaultRefId);
  project.pinnedVaultRefIds = (project.pinnedVaultRefIds || []).filter((id) => id !== vaultRefId);
  project.updatedAt = at.toISOString();
  const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
  if (vaultRef && !stillReferenced) delete state.vaultRefs[vaultRefId];
  return { vaultRef, removed, cleaned: Boolean(vaultRef && !stillReferenced) };
}

function updateVaultRefPath(state, vaultRefId, path, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) throw new Error('Vault 路径不能为空。');
  const existing = Object.values(state.vaultRefs).find((candidate) => candidate.id !== vaultRefId && candidate.path === normalizedPath && candidate.entryType === vaultRef.entryType);
  if (existing) {
    for (const project of Object.values(state.projects)) {
      if (!(project.vaultRefIds || []).includes(vaultRefId)) continue;
      project.vaultRefIds = uniqueStrings((project.vaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id));
      project.pinnedVaultRefIds = uniqueStrings((project.pinnedVaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id)).filter((id) => project.vaultRefIds.includes(id));
      project.updatedAt = at.toISOString();
    }
    existing.missingAt = '';
    existing.updatedAt = at.toISOString();
    delete state.vaultRefs[vaultRefId];
    return existing;
  }
  vaultRef.path = normalizedPath;
  const inferredFileKind = inferVaultFileKind(normalizedPath, vaultRef.entryType);
  if (inferredFileKind !== 'other' || vaultRef.fileKind === 'other') vaultRef.fileKind = inferredFileKind;
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function markVaultRefMissing(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  if (!vaultRef.missingAt) vaultRef.missingAt = at.toISOString();
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function restoreVaultRef(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  vaultRef.missingAt = '';
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function togglePinnedVaultRef(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!(project.vaultRefIds || []).includes(vaultRefId)) throw new Error('项目尚未关联该项目文件。');
  const pinned = new Set(project.pinnedVaultRefIds || []);
  if (pinned.has(vaultRefId)) pinned.delete(vaultRefId);
  else pinned.add(vaultRefId);
  project.pinnedVaultRefIds = [...pinned].filter((id) => (project.vaultRefIds || []).includes(id));
  project.updatedAt = at.toISOString();
  return pinned.has(vaultRefId);
}

function projectForMemo(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  return project;
}

function isoAt(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.toISOString();
}

function memoTextValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return String(value.text ?? value.memoText ?? value.content ?? '');
  }
  return String(value ?? '');
}

function ensureProjectMemos(project) {
  project.memos = normalizeProjectMemos(project.memos, project.id || 'project');
  return project.memos;
}

function syncLegacyProjectMemo(project) {
  const firstMemo = Array.isArray(project.memos) ? project.memos[0] : null;
  project.memoText = String(firstMemo?.text || '');
  project.memoUpdatedAt = String(firstMemo?.updatedAt || '');
}

function createProjectMemo(state, projectId, text = '', at = new Date()) {
  const project = projectForMemo(state, projectId);
  const timestamp = isoAt(at);
  const memo = {
    id: createId('memo'),
    title: '',
    text: memoTextValue(text),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  ensureProjectMemos(project).push(memo);
  project.updatedAt = timestamp;
  if (project.memos.length === 1) syncLegacyProjectMemo(project);
  ensureProjectBoardLayout(state, projectId);
  return memo;
}

function updateProjectMemoTitle(state, projectId, memoId, title, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.title = String(title || '').trim();
  memo.updatedAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function updateProjectMemo(state, projectId, memoId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function deleteProjectMemo(state, projectId, memoId, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const index = memos.findIndex((candidate) => candidate.id === memoId);
  if (index < 0) throw new Error('找不到项目便签。');
  const [removed] = memos.splice(index, 1);
  const layout = state.uiState?.projectBoardLayouts?.[projectId];
  if (layout?.items) delete layout.items[`memo:${memoId}`];
  project.updatedAt = isoAt(at);
  syncLegacyProjectMemo(project);
  return removed;
}

function setProjectMemo(state, projectId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const timestamp = isoAt(at);
  if (!memos.length) {
    memos.push({ id: createId('memo'), text: '', createdAt: timestamp, updatedAt: '' });
  }
  const memo = memos[0];
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.memoText = memo.text;
  project.memoUpdatedAt = timestamp;
  project.updatedAt = timestamp;
  return project;
}

function setProjectPanelOrder(state, panelIds) {
  state.uiState.projectPanelOrder = normalizeProjectPanelOrder(panelIds);
  return state.uiState.projectPanelOrder;
}

function setProjectPanelCollapsed(state, projectId, panelId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  if (!PROJECT_PANEL_IDS.includes(panelId)) throw new Error('未知的项目辅助区组件。');
  const byProject = objectOr(state.uiState.projectPanelCollapsedByProject);
  byProject[projectId] = { ...objectOr(byProject[projectId]), [panelId]: Boolean(collapsed) };
  state.uiState.projectPanelCollapsedByProject = byProject;
  return byProject[projectId];
}

function setProjectRecentCollapsed(state, projectId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  const byProject = objectOr(state.uiState?.projectRecentCollapsedByProject);
  byProject[projectId] = Boolean(collapsed);
  state.uiState.projectRecentCollapsedByProject = byProject;
  return byProject[projectId];
}

function recordRecentVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  state.uiState.recentVaultCreatePaths = [
    normalizedPath,
    ...normalizeVaultPathList(state.uiState.recentVaultCreatePaths).filter((item) => item !== normalizedPath)
  ].slice(0, 5);
  return state.uiState.recentVaultCreatePaths;
}

function togglePinnedVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  const pinned = normalizeVaultPathList(state.uiState.pinnedVaultCreatePaths);
  state.uiState.pinnedVaultCreatePaths = pinned.includes(normalizedPath)
    ? pinned.filter((item) => item !== normalizedPath)
    : [...pinned, normalizedPath];
  return state.uiState.pinnedVaultCreatePaths.includes(normalizedPath);
}

function renameProject(state, projectId, title, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  project.title = value;
  project.updatedAt = at.toISOString();
  return project;
}

function createModule(state, projectId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('模块名称不能为空。');
  const id = createId('module');
  const timestamp = nowIso();
  const siblings = projectModules(state, projectId);
  state.modules[id] = {
    id,
    projectId,
    title: value,
    resourceIds: [],
    resourceRoots: {},
    resourceGroupIds: [],
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: ''
  };
  state.projects[projectId].moduleIds = [...new Set([...(state.projects[projectId].moduleIds || []), id])];
  state.projects[projectId].updatedAt = timestamp;
  ensureProjectBoardLayout(state, projectId);
  return state.modules[id];
}

function moveModule(state, projectId, moduleId, targetModuleId) {
  const ordered = projectModules(state, projectId);
  const from = ordered.findIndex((module) => module.id === moduleId);
  const to = ordered.findIndex((module) => module.id === targetModuleId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = nowIso();
  ordered.forEach((module, index) => {
    module.sortOrder = index;
    module.updatedAt = timestamp;
  });
  state.projects[projectId].moduleIds = ordered.map((module) => module.id);
  state.projects[projectId].updatedAt = timestamp;
  return ordered;
}

function modulePlans(state, moduleId) {
  return Object.values(state.plans).filter((plan) => plan.targetType === 'module' && plan.targetIds?.includes(moduleId) && !plan.deletedAt);
}

function archiveModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  if (module.archivedAt) return module;
  const timestamp = at.toISOString();
  module.archivedAt = timestamp;
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.archivedAt) continue;
    plan.archivedAt = timestamp;
    plan.moduleArchivedBy = moduleId;
    plan.updatedAt = timestamp;
  }
  if (state.modules[moduleId]?.projectId && state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function restoreModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const timestamp = at.toISOString();
  module.archivedAt = '';
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.moduleArchivedBy !== moduleId) continue;
    plan.archivedAt = '';
    delete plan.moduleArchivedBy;
    plan.updatedAt = timestamp;
  }
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function deleteModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const project = state.projects[module.projectId];
  const planSnapshots = modulePlans(state, moduleId).map((plan) => ({ ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule }));
  const moduleSnapshot = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
  const resourceGroupSnapshots = moduleResourceGroups(state, moduleId).map((group) => ({ ...group, resourceIds: [...(group.resourceIds || [])] }));
  const collapsedResourceGroups = { ...objectOr(state.uiState.collapsedResourceGroupsByModule?.[moduleId]) };
  const boardLayout = project ? ensureProjectBoardLayout(state, module.projectId) : null;
  const projectBoardLayoutBefore = boardLayout ? cloneProjectBoardLayout(boardLayout) : null;
  const detachedResourceCount = moduleSnapshot.resourceIds.filter((resourceId) => state.resources[resourceId]).length;
  for (const plan of planSnapshots) delete state.plans[plan.id];
  for (const group of resourceGroupSnapshots) delete state.resourceGroups[group.id];
  delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  if (boardLayout) delete boardLayout.items[`module:${moduleId}`];
  delete state.modules[moduleId];
  if (project) {
    project.moduleIds = (project.moduleIds || []).filter((id) => id !== moduleId);
    project.updatedAt = at.toISOString();
  }
  recordLastAction(state, {
    type: 'delete-module',
    label: `删除模块：${module.title}`,
    projectId: module.projectId,
    moduleSnapshot,
    planSnapshots,
    resourceGroupSnapshots,
    collapsedResourceGroups,
    projectBoardLayoutBefore
  });
  return { module: moduleSnapshot, removedPlanCount: planSnapshots.length, removedResourceGroupCount: resourceGroupSnapshots.length, detachedResourceCount };
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function validateExternalUri(raw, allowedProtocols = ['https:', 'http:']) {
  const value = String(raw || '').trim();
  let url;
  try { url = new URL(value); } catch { throw new Error('外部地址无效。'); }
  if (!allowedProtocols.includes(url.protocol.toLowerCase())) {
    throw new Error(`不允许打开 ${url.protocol || '未知'} 协议。`);
  }
  return value;
}

function normalizeOpenListBaseUrl(raw) {
  const url = new URL(String(raw || '').trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error('OpenList 地址必须使用 HTTP 或 HTTPS。');
  const hostname = url.hostname.toLowerCase() === 'localhost' ? '127.0.0.1' : url.hostname.toLowerCase();
  const isLoopback = hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error('远程 OpenList 必须使用 HTTPS；HTTP 仅允许本机回环地址。');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const defaultPort = (url.protocol === 'http:' && port === '80') || (url.protocol === 'https:' && port === '443');
  return `${url.protocol}//${hostname}${defaultPort ? '' : `:${port}`}`;
}

function normalizeOpenListPath(rawPath) {
  const decoded = decodeURIComponent(String(rawPath || '/').split(/[?#]/, 1)[0] || '/');
  const parts = decoded.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('OpenList 路径不能包含 ..。');
  return `/${parts.join('/')}`.normalize('NFC');
}

function openListImportRoot(entries) {
  const roots = (Array.isArray(entries) ? entries : []).map((entry) => {
    const remotePath = normalizeOpenListPath(entry?.remotePath || '/');
    if (entry?.is_dir) return remotePath;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return normalizeOpenListPath(`/${parts.join('/')}`);
  });
  if (!roots.length) return '/';
  const segments = roots.map((rootPath) => rootPath.split('/').filter(Boolean));
  const common = [];
  for (let index = 0; index < segments[0].length; index += 1) {
    const segment = segments[0][index];
    if (!segments.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function sourceForResource(resource, sources = {}) {
  if (!resource?.sourceId) return null;
  if (Array.isArray(sources)) return sources.find((source) => source?.id === resource.sourceId) || null;
  return objectOr(sources)[resource.sourceId] || null;
}

function resourcePickerGroupInfo(resource, sources = {}) {
  const metadata = objectOr(resource?.metadata);
  const launcher = objectOr(resource?.launcher);
  const source = sourceForResource(resource, sources);
  const sourceName = String(source?.alias || source?.title || '').trim();

  if (launcher.type === 'openlist' || metadata.remotePath) {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '').replace(/\\/g, '/');
    const parts = remotePath.split('/').filter(Boolean);
    const storedRoot = String(metadata.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const fallbackRoot = parts.length > 1 ? `/${parts.slice(0, 2).join('/')}` : `/${parts.join('/')}`;
    const groupRoot = storedRoot && storedRoot !== '/' ? storedRoot : fallbackRoot || '/';
    const rootParts = groupRoot.split('/').filter(Boolean);
    const label = rootParts.at(-1) || sourceName || 'OpenList 视频';
    return {
      key: `openlist:${resource.sourceId || source?.id || ''}:${groupRoot.toLowerCase()}`,
      label,
      detail: `OpenList · ${groupRoot}`
    };
  }

  if (metadata.collectionTitle || metadata.collectionId) {
    const identity = String(metadata.collectionId || metadata.collectionTitle).toLowerCase();
    return {
      key: `bili-collection:${resource.sourceId || ''}:${identity}`,
      label: String(metadata.collectionTitle || sourceName || 'B站合集'),
      detail: sourceName ? `B站合集 · ${sourceName}` : 'B站合集'
    };
  }

  if (metadata.bvid || source?.type === 'bilibili') {
    return {
      key: `bili-source:${resource.sourceId || metadata.mid || 'standalone'}`,
      label: sourceName || source?.alias || 'B站视频',
      detail: 'B站投稿'
    };
  }

  if (launcher.type === 'file' || /^file:/i.test(resource?.canonicalKey || '')) {
    const filePath = String(launcher.path || resource.canonicalKey?.slice(5) || '').replace(/\//g, '\\');
    const parts = filePath.split('\\').filter(Boolean);
    const parentPath = parts.slice(0, -1).join('\\');
    return {
      key: `file:${resource.sourceId || ''}:${parentPath.toLowerCase()}`,
      label: parts.at(-2) || sourceName || '本地文件',
      detail: parentPath || '本地文件'
    };
  }

  if (resource?.kind === 'anki' || launcher.type === 'anki') {
    const deck = String(launcher.deck || metadata.deck || resource.title || 'Anki');
    const parentDeck = deck.split('::')[0] || 'Anki';
    return { key: `anki:${resource.sourceId || ''}:${parentDeck.toLowerCase()}`, label: parentDeck, detail: 'Anki 卡组' };
  }

  const kind = String(resource?.kind || 'other');
  const label = ({ video: '视频', anki: 'Anki', pdf: 'PDF', file: '文件', web: '网页' })[kind] || '其他资源';
  return { key: `kind:${kind}`, label, detail: '其他资源' };
}

function buildResourcePickerIndex(resources = [], sources = {}) {
  const entries = [];
  const groupMap = new Map();
  for (const resource of resources) {
    const group = resourcePickerGroupInfo(resource, sources);
    const entry = {
      resource,
      groupKey: group.key,
      searchText: `${resource.title || ''} ${resource.kind || ''} ${group.label} ${group.detail}`.toLocaleLowerCase()
    };
    entries.push(entry);
    if (!groupMap.has(group.key)) groupMap.set(group.key, { ...group, resources: [] });
    groupMap.get(group.key).resources.push(resource);
  }
  const groups = [...groupMap.values()].sort((left, right) =>
    String(left.label).localeCompare(String(right.label), 'zh-CN', { numeric: true, sensitivity: 'base' })
  );
  return { entries, groups };
}

function parseOpenListUrl(raw, sources = []) {
  const extracted = extractResourceInput(raw);
  let url;
  try { url = new URL(extracted.value); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const rootPath = normalizeOpenListPath(url.pathname);
  if (/^\/(?:api|d|dav)(?:\/|$)/i.test(rootPath)) return null;
  const baseUrl = normalizeOpenListBaseUrl(url.origin);
  const matchingSource = (sources || []).find((source) => {
    if (source?.type !== 'openlist' || source.deletedAt) return false;
    try { return normalizeOpenListBaseUrl(source.baseUrl) === baseUrl; } catch { return false; }
  });
  const localService = /^(?:localhost|127\.0\.0\.1)$/i.test(url.hostname) && (url.port === '5244' || Boolean(matchingSource));
  if (!matchingSource && !localService) return null;
  const share = rootPath.match(/^\/@s\/([^/]+)(\/.*)?$/i);
  return {
    baseUrl,
    rootPath,
    sourceId: matchingSource?.id || '',
    sourceUrl: url.toString(),
    isShare: Boolean(share),
    shareId: share?.[1] || '',
    sharePath: share?.[2] || '/',
    title: extracted.title || rootPath.split('/').filter(Boolean).pop() || 'OpenList 目录'
  };
}

function parseBiliVideoUrl(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!/^https?:\/\//i.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
  const bvid = url.pathname.match(/\/(BV[0-9A-Za-z]+)/i)?.[1];
  if (!bvid) return null;
  const page = Math.max(1, Number(url.searchParams.get('p') || 1));
  const canonicalUrl = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`;
  return { bvid, page, canonicalUrl, title: extracted.title || '' };
}

function normalizeBiliUserSearchResults(data) {
  const results = Array.isArray(data?.result) ? data.result : [];
  return results
    .filter((item) => item && item.mid && item.uname)
    .map((item) => {
      const avatar = String(item.upic || '');
      return {
        mid: String(item.mid),
        name: String(item.uname),
        description: String(item.usign || item.official_verify?.desc || ''),
        avatar: avatar.startsWith('//') ? `https:${avatar}` : avatar,
        followers: Math.max(0, Number(item.fans || 0)),
        videos: Math.max(0, Number(item.videos || 0)),
        verified: String(item.official_verify?.desc || '')
      };
    });
}

function parseBiliUserInput(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return '';
    return url.hostname.toLowerCase() === 'space.bilibili.com'
      ? (url.pathname.match(/^\/(\d+)/)?.[1] || '')
      : '';
  } catch { return ''; }
}

function extractResourceInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { value: '', title: '' };

  const tableCells = /^\s*\|/.test(text)
    ? text.split('|').map((cell) => cell.trim()).filter(Boolean)
    : [];
  let title = tableCells[0] || '';

  const markdownLink = text.match(/\[([^\]]+)\]\(\s*((?:https?:\/\/|jv:\/\/)[^)\s]+)\s*\)/i);
  if (markdownLink) {
    return {
      value: markdownLink[2].trim(),
      title: title || markdownLink[1].trim()
    };
  }

  const angleLink = text.match(/<((?:https?:\/\/|jv:\/\/)[^>\s]+)>/i);
  if (angleLink) return { value: angleLink[1].trim(), title };

  if (tableCells.length) {
    const structured = tableCells.find((cell) => /^(?:https?:\/\/|jv:\/\/|anki\s*:|[a-zA-Z]:[\\/]|\\\\)/i.test(cell));
    if (structured) return { value: structured.trim(), title };
  }

  const bareLink = text.match(/(?:https?:\/\/|jv:\/\/)[^\s|<>]+/i);
  if (bareLink) return { value: bareLink[0].replace(/[),.;，。；]+$/, ''), title };

  return { value: text, title: '' };
}

function inferResource(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!value) throw new Error('资源内容不能为空。');
  const anki = value.match(/^anki\s*:\s*(.+)$/i);
  if (anki) {
    const deck = anki[1].trim();
    return { kind: 'anki', title: extracted.title || deck, canonicalKey: `anki:${deck.toLowerCase()}`, launcher: { type: 'anki', deck } };
  }
  if (/^jv:\/\//i.test(value)) {
    return { kind: 'video', title: extracted.title || '视频资源', canonicalKey: `uri:${value}`, launcher: { type: 'uri', uri: value } };
  }
  if (/^https?:\/\//i.test(value)) {
    const openList = parseOpenListUrl(raw);
    if (openList) {
      return {
        kind: 'openlist-folder',
        title: openList.title,
        canonicalKey: `openlist-folder:${openList.baseUrl}:${openList.rootPath.toLowerCase()}`,
        launcher: { type: 'openlist-folder', baseUrl: openList.baseUrl, rootPath: openList.rootPath },
        metadata: openList
      };
    }
    const bili = parseBiliVideoUrl(raw);
    if (bili) {
      return {
        kind: 'video',
        title: bili.title || bili.bvid,
        canonicalKey: `bili:${bili.bvid.toUpperCase()}:p${bili.page}`,
        launcher: { type: 'potplayer', target: bili.canonicalUrl },
        metadata: { bvid: bili.bvid, page: bili.page, originalUrl: bili.canonicalUrl }
      };
    }
    const normalized = normalizeUrl(value);
    let title = extracted.title || normalized;
    try { title = new URL(normalized).hostname; } catch { /* keep input */ }
    if (extracted.title) title = extracted.title;
    const extension = normalized.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    const kind = ['pdf'].includes(extension) ? 'pdf' : /bilibili\.com|youtube\.com|youtu\.be|\.mp4(?:$|[?#])|\.mkv(?:$|[?#])/i.test(normalized) ? 'video' : 'web';
    return { kind, title, canonicalKey: `url:${normalized.toLowerCase()}`, launcher: { type: 'uri', uri: normalized } };
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    const normalized = value.replace(/\//g, '\\');
    const name = normalized.split('\\').filter(Boolean).pop() || normalized;
    const extension = name.split('.').pop()?.toLowerCase();
    const kind = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension) ? 'video' : extension === 'pdf' ? 'pdf' : 'file';
    return { kind, title: extracted.title || name, canonicalKey: `file:${normalized.toLowerCase()}`, launcher: { type: 'file', path: normalized } };
  }
  throw new Error(`暂时无法识别：${value}`);
}

function resolveResourceActions(resource, sources = {}) {
  const launcher = objectOr(resource?.launcher);
  const metadata = objectOr(resource?.metadata);
  const source = sourceForResource(resource, sources);
  const actions = { webTarget: null, playTarget: null, defaultTarget: null };

  if (launcher.type === 'openlist') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.playTarget = { type: 'openlist', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    const baseUrl = String(source?.baseUrl || '').replace(/\/+$/, '');
    if (metadata.sourceUrl) actions.webTarget = String(metadata.sourceUrl);
    else if (baseUrl && remotePath) actions.webTarget = `${baseUrl}${remotePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    return actions;
  }

  if (launcher.type === 'openlist-file') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.defaultTarget = { type: 'openlist-file', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    return actions;
  }

  if (launcher.type === 'potplayer') {
    actions.playTarget = { type: 'potplayer', target: launcher.target };
    actions.webTarget = String(metadata.sourceUrl || metadata.originalUrl || (/^https?:\/\//i.test(launcher.target || '') ? launcher.target : '')) || null;
    return actions;
  }

  if (launcher.type === 'file') {
    const extension = String(launcher.path || '').split('.').pop()?.toLowerCase();
    if (resource?.kind === 'video' || ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension)) {
      actions.playTarget = { type: 'potplayer', target: launcher.path };
    } else actions.defaultTarget = { type: 'file', path: launcher.path };
    return actions;
  }

  if (launcher.type === 'anki') {
    actions.defaultTarget = { type: 'anki', deck: launcher.deck };
    return actions;
  }

  if (launcher.type === 'uri' || launcher.uri) {
    const uri = String(launcher.uri || '');
    const bili = parseBiliVideoUrl(uri);
    if (bili) {
      actions.webTarget = bili.canonicalUrl;
      actions.playTarget = { type: 'potplayer', target: bili.canonicalUrl };
    } else if (/^https?:\/\//i.test(uri)) actions.webTarget = uri;
    else actions.defaultTarget = { type: 'uri', uri };
  }
  return actions;
}

function legacyBiliHomepageResources(state) {
  const sources = Object.values(objectOr(state?.sources)).filter((source) => source.type === 'bilibili' && !source.deletedAt);
  const keys = new Set(sources.flatMap((source) => [source.homepage, source.mid ? `https://space.bilibili.com/${source.mid}` : ''].filter(Boolean).map((value) => String(value).replace(/\/+$/, '').toLowerCase())));
  return Object.values(objectOr(state?.resources)).filter((resource) => {
    if (resource.deletedAt) return false;
    const uri = String(resource.launcher?.uri || resource.metadata?.originalUrl || '').replace(/\/+$/, '').toLowerCase();
    return keys.has(uri) || (resource.sourceId && sources.some((source) => source.id === resource.sourceId) && /^https:\/\/space\.bilibili\.com\/\d+$/i.test(uri));
  });
}

function addResource(state, moduleId, input, titleOverride = '') {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id]);
  return { resource, reused: Boolean(duplicate), linked: linked.linkedResourceIds.includes(resource.id) };
}

function addInboxResource(state, input, titleOverride = '') {
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(duplicate), inboxAdded };
}

function upsertResourceDescriptor(state, moduleId, descriptor) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id], { rootPath: descriptor.metadata?.rootPath });
  return { resource, reused: Boolean(existing), linked: linked.linkedResourceIds.includes(resource.id) };
}

function upsertInboxDescriptor(state, descriptor) {
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(existing), inboxAdded };
}

function linkResourceToModule(state, moduleId, resourceId, options = {}) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module) throw new Error('找不到目标模块。');
  if (!resource || resource.deletedAt) throw new Error('找不到可用资源。');
  linkResourcesToModule(state, moduleId, [resourceId], options);
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function archiveProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = at.toISOString();
  project.updatedAt = at.toISOString();
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  return project;
}

function restoreProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = '';
  project.updatedAt = at.toISOString();
  return project;
}

function referencedResourceIds(state) {
  const referenced = new Set(state.inbox || []);
  for (const module of Object.values(state.modules)) {
    if (module.deletedAt) continue;
    for (const resourceId of module.resourceIds || []) referenced.add(resourceId);
  }
  for (const plan of Object.values(state.plans)) {
    if (plan.deletedAt || plan.archivedAt || plan.targetType !== 'resource') continue;
    for (const resourceId of plan.targetIds || []) referenced.add(resourceId);
  }
  for (const note of Object.values(state.notes)) {
    if (note.deletedAt) continue;
    if (note.resourceId) referenced.add(note.resourceId);
    for (const resourceId of note.resourceIds || []) referenced.add(resourceId);
  }
  for (const entry of state.activity || []) {
    if (entry?.resourceId) referenced.add(entry.resourceId);
  }
  for (const resource of Object.values(state.resources)) {
    if (resource.lastOpenedAt || resource.completedAt) referenced.add(resource.id);
  }
  return referenced;
}

function orphanResources(state) {
  const referenced = referencedResourceIds(state);
  return Object.values(state.resources).filter((resource) => !resource.deletedAt && !referenced.has(resource.id));
}

function orphanCleanupPreview(state) {
  const active = Object.values(state.resources).filter((resource) => !resource.deletedAt);
  const candidates = orphanResources(state);
  const index = buildResourcePickerIndex(candidates, state.sources);
  return {
    totalActive: active.length,
    candidateCount: candidates.length,
    retainedCount: active.length - candidates.length,
    candidates,
    groups: index.groups
  };
}

function deleteOrphanResources(state, candidateIds = null) {
  const referenced = referencedResourceIds(state);
  const candidates = candidateIds ? new Set(candidateIds) : null;
  const removedIds = [];
  for (const [resourceId, resource] of Object.entries(state.resources)) {
    if (referenced.has(resourceId) || (candidates && !candidates.has(resourceId))) continue;
    delete state.resources[resourceId];
    removedIds.push(resourceId);
  }
  state.inbox = (state.inbox || []).filter((resourceId) => state.resources[resourceId]);
  return removedIds;
}

function deleteProject(state, projectId, options = {}) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  const moduleIds = new Set(Object.values(state.modules).filter((module) => module.projectId === projectId).map((module) => module.id));
  const candidateResourceIds = new Set();
  for (const moduleId of moduleIds) {
    for (const resourceId of state.modules[moduleId]?.resourceIds || []) candidateResourceIds.add(resourceId);
  }
  for (const [groupId, group] of Object.entries(objectOr(state.resourceGroups))) {
    if (moduleIds.has(group.moduleId)) delete state.resourceGroups[groupId];
  }
  for (const moduleId of moduleIds) delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  for (const moduleId of moduleIds) delete state.modules[moduleId];
  for (const [planId, plan] of Object.entries(state.plans)) {
    if (plan.projectId === projectId || (plan.targetType === 'module' && plan.targetIds?.some((id) => moduleIds.has(id)))) delete state.plans[planId];
  }
  for (const [noteId, note] of Object.entries(state.notes)) {
    if (note.projectId === projectId) delete state.notes[noteId];
  }
  const vaultRefIds = [...(project.vaultRefIds || [])];
  delete state.projects[projectId];
  for (const vaultRefId of vaultRefIds) {
    const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
    if (!stillReferenced) delete state.vaultRefs[vaultRefId];
  }
  delete state.uiState.collapsedTodayProjects[projectId];
  delete state.uiState.projectPanelCollapsedByProject[projectId];
  delete state.uiState.projectRecentCollapsedByProject[projectId];
  delete state.uiState.projectBoardLayouts[projectId];
  state.uiState.todayProjectOrder = uniqueStrings(state.uiState.todayProjectOrder).filter((id) => id !== projectId);
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  // 保留旧 API 的显式孤立资源清理语义；Vault 引用清理始终只删索引，不操作真实文件。
  const removedResourceIds = options.deleteOrphans ? deleteOrphanResources(state, candidateResourceIds) : [];
  return { project, removedModuleCount: moduleIds.size, removedResourceIds };
}

function recordLastAction(state, action) {
  state.uiState.lastAction = action ? { ...action, at: action.at || nowIso() } : null;
  return state.uiState.lastAction;
}

function undoLastAction(state) {
  const action = state.uiState.lastAction;
  if (!action) return { undone: false, removedResourceIds: [] };
  if (action.type === 'link-vault-refs') {
    const project = state.projects[action.projectId];
    if (!project || project.deletedAt) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    let unlinkedVaultRefCount = 0;
    for (const vaultRefId of action.linkedVaultRefIds || []) {
      const result = unlinkVaultRefFromProject(state, action.projectId, vaultRefId);
      if (result.removed) unlinkedVaultRefCount += 1;
    }
    for (const snapshot of action.reusedVaultRefSnapshots || []) {
      state.vaultRefs[snapshot.id] = { ...snapshot };
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], unlinkedVaultRefCount };
  }
  if (action.type === 'project-board-layout') {
    if (!state.projects[action.projectId]) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[action.projectId] = normalizeProjectBoardLayout(
      action.layoutBefore,
      state,
      action.projectId,
      state.uiState.projectPanelOrder
    );
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredProjectBoardLayout: true };
  }
  if (action.type === 'auto-group-resources') {
    const module = state.modules[action.moduleId];
    if (!module) { state.uiState.lastAction = null; return { undone: false, action, removedResourceIds: [], reason: 'module-missing' }; }
    for (const group of moduleResourceGroups(state, module.id).filter((candidate) => candidate.autoGroupKey === action.autoGroupKey)) deleteResourceGroup(state, group.id);
    state.resourceGroups = objectOr(state.resourceGroups);
    for (const snapshot of action.resourceGroupSnapshotsBefore || []) state.resourceGroups[snapshot.id] = { ...snapshot, resourceIds: [...(snapshot.resourceIds || [])] };
    const currentIds = moduleResourceGroups(state, module.id).map((group) => group.id);
    module.resourceGroupIds = [...new Set([...(action.moduleResourceGroupIdsBefore || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id), ...currentIds])];
    const collapsed = objectOr(state.uiState.collapsedResourceGroupsByModule?.[module.id]);
    for (const groupId of action.autoGroupIdsAfter || []) delete collapsed[groupId];
    Object.assign(collapsed, objectOr(action.collapsedBefore));
    state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
    if (Object.keys(collapsed).length) state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    else delete state.uiState.collapsedResourceGroupsByModule[module.id];
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredResourceGroupCount: (action.resourceGroupSnapshotsBefore || []).length };
  }
  if (action.type === 'delete-module') {
    const module = action.moduleSnapshot;
    const groupConflict = (action.resourceGroupSnapshots || []).some((group) => state.resourceGroups[group.id]);
    if (!module || state.modules[module.id] || !state.projects[module.projectId] || groupConflict) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: groupConflict ? 'group-restore-conflict' : 'restore-conflict' };
    }
    state.modules[module.id] = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
    const project = state.projects[module.projectId];
    project.moduleIds = [...new Set([...(project.moduleIds || []), module.id])];
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[module.projectId] = normalizeProjectBoardLayout(
      action.projectBoardLayoutBefore,
      state,
      module.projectId,
      state.uiState.projectPanelOrder
    );
    project.updatedAt = nowIso();
    let restoredPlanCount = 0;
    for (const plan of action.planSnapshots || []) {
      if (state.plans[plan.id]) continue;
      state.plans[plan.id] = { ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule };
      restoredPlanCount += 1;
    }
    state.resourceGroups = objectOr(state.resourceGroups);
    let restoredResourceGroupCount = 0;
    for (const group of action.resourceGroupSnapshots || []) {
      state.resourceGroups[group.id] = { ...group, resourceIds: [...(group.resourceIds || [])] };
      restoredResourceGroupCount += 1;
    }
    state.modules[module.id].resourceGroupIds = (state.modules[module.id].resourceGroupIds || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id);
    const collapsed = {};
    for (const [groupId, value] of Object.entries(objectOr(action.collapsedResourceGroups))) {
      if (state.resourceGroups[groupId]?.moduleId === module.id) collapsed[groupId] = Boolean(value);
    }
    if (Object.keys(collapsed).length) {
      state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
      state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredModuleCount: 1, restoredPlanCount, restoredResourceGroupCount };
  }
  const moduleAffected = new Set(action.linkedResourceIds ?? action.resourceIds ?? []);
  const inboxAffected = new Set(action.inboxAddedResourceIds ?? action.resourceIds ?? []);
  if (action.type === 'add-resources') {
    if (action.moduleId && state.modules[action.moduleId]) {
      removeResourcesFromModule(state, action.moduleId, [...moduleAffected]);
    }
    if (action.inbox) state.inbox = (state.inbox || []).filter((id) => !inboxAffected.has(id));
    if (action.restoreInboxIds?.length) state.inbox = [...new Set([...(state.inbox || []), ...action.restoreInboxIds.filter((id) => state.resources[id])])];
    for (const groupId of action.createdResourceGroupIds || []) {
      const group = state.resourceGroups[groupId];
      if (group && group.moduleId === action.moduleId && !(group.resourceIds || []).length) deleteResourceGroup(state, groupId);
    }
  }
  const removedResourceIds = deleteOrphanResources(state, action.createdResourceIds || []);
  state.uiState.lastAction = null;
  return { undone: true, action, removedResourceIds };
}

function trashResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function restoreResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = '';
  resource.updatedAt = at.toISOString();
  return resource;
}

function upsertSource(state, input) {
  const type = String(input?.type || '').trim();
  if (!type) throw new Error('来源类型不能为空。');
  const identity = String(input.identity || input.baseUrl || input.path || input.endpoint || input.mid || type).trim().toLowerCase();
  const existing = Object.values(state.sources).find((source) => source.type === type && source.identity === identity && !source.deletedAt);
  const timestamp = nowIso();
  const source = existing || {
    id: createId('source'),
    type,
    identity,
    createdAt: timestamp,
    deletedAt: ''
  };
  Object.assign(source, input, { id: source.id, type, identity, updatedAt: timestamp });
  state.sources[source.id] = source;
  return { source, reused: Boolean(existing) };
}

function createPlanForTarget(state, projectId, targetType, targetId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  if (targetType === 'module' && !state.modules[targetId]) throw new Error('找不到目标模块。');
  if (targetType === 'resource' && !state.resources[targetId]) throw new Error('找不到目标资源。');
  const existing = Object.values(state.plans).find((plan) => plan.projectId === projectId && plan.targetType === targetType && plan.targetIds?.includes(targetId) && !plan.deletedAt && !plan.archivedAt);
  if (existing) return { plan: existing, reused: true };
  const id = createId('plan');
  const timestamp = nowIso();
  const plan = {
    id,
    projectId,
    title: String(title || '学习计划').trim(),
    targetType,
    targetIds: [targetId],
    schedule: { type: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 0] },
    dailyTarget: 1,
    resetHour: 4,
    history: {},
    sortOrder: projectPlans(state, projectId).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.plans[id] = plan;
  return { plan, reused: false };
}

function studyDate(now = new Date(), resetHour = 4) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(resetHour || 0));
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function planScheduledFor(plan, now = new Date()) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(plan?.resetHour || 0));
  const weekdays = Array.isArray(plan?.schedule?.weekdays) && plan.schedule.weekdays.length
    ? plan.schedule.weekdays.map(Number)
    : [1, 2, 3, 4, 5, 6, 0];
  return weekdays.includes(shifted.getDay());
}

function planProgress(plan, now = new Date()) {
  const key = studyDate(now, plan.resetHour);
  const entry = objectOr(plan.history?.[key]);
  const completed = Math.max(0, Number(entry.completed || 0));
  const target = Math.max(1, Number(plan.dailyTarget || 1));
  return { key, completed, target, done: completed >= target };
}

function incrementPlan(state, planId, delta = 1, now = new Date()) {
  const plan = state.plans[planId];
  if (!plan) throw new Error('找不到学习计划。');
  const progress = planProgress(plan, now);
  plan.history = objectOr(plan.history);
  plan.history[progress.key] = {
    completed: Math.max(0, Math.min(progress.target, progress.completed + Number(delta || 0))),
    updatedAt: now.toISOString()
  };
  plan.updatedAt = now.toISOString();
  return planProgress(plan, now);
}

function markResourceOpened(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.lastOpenedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.activity.push({ id: createId('activity'), type: 'resource-opened', resourceId, at: at.toISOString() });
  state.activity = state.activity.slice(-500);
  return resource;
}

function toggleResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.completedAt = resource.completedAt ? '' : at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

function markResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  if (!resource.completedAt) resource.completedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

module.exports = {
  SCHEMA_VERSION,
  activeProjects,
  addInboxResource,
  addResource,
  autoGroupResources,
  archiveProject,
  archiveModule,
  buildResourcePickerIndex,
  createId,
  createModule,
  createPlanForTarget,
  createProjectMemo,
  createProject,
  createResourceGroup,
  deleteProjectMemo,
  deleteOrphanResources,
  deleteProject,
  deleteModule,
  deleteResourceGroup,
  defaultState,
  defaultResourceAutoGroupEnabled,
  extractResourceInput,
  incrementPlan,
  inferResource,
  ensureProjectBoardLayout,
  linkResourceToModule,
  linkResourcesToModule,
  linkVaultEntriesToProject,
  linkVaultRefToProject,
  markResourceOpened,
  markResourceComplete,
  markVaultRefMissing,
  moveModule,
  moveTodayProjectBefore,
  moveTodaySidebarCardBefore,
  moveProjectBoardItem,
  moveResourceGroup,
  moveResourceToGroup,
  moveResourcesToGroup,
  moduleResources,
  moduleResourceGroups,
  moduleResourceRoot,
  normalizeState,
  validateExternalUri,
  normalizeVaultPath,
  normalizeOpenListBaseUrl,
  openListImportRoot,
  normalizeOpenListPath,
  normalizeBiliUserSearchResults,
  orphanCleanupPreview,
  parseBiliUserInput,
  orphanResources,
  parseBiliVideoUrl,
  parseOpenListUrl,
  planScheduledFor,
  planProgress,
  projectModules,
  projectBoardItems,
  projectPlans,
  projectVaultRefs,
  recordRecentVaultCreatePath,
  recordLastAction,
  removeResourcesFromModule,
  renameResourceGroup,
  resourcePickerGroupInfo,
  resourceGroupProgress,
  resourceGroupTitle,
  resourceFolderPath,
  renameProject,
  resetProjectBoardLayout,
  resolveResourceActions,
  legacyBiliHomepageResources,
  restoreProject,
  restoreModule,
  restoreResource,
  restoreVaultRef,
  setProjectRecentCollapsed,
  setProjectMemo,
  setProjectPanelCollapsed,
  setProjectPanelOrder,
  setResourceGroupCollapsed,
  studyDate,
  todayProjects,
  trashResource,
  toggleResourceComplete,
  togglePinnedVaultRef,
  togglePinnedVaultCreatePath,
  undoLastAction,
  updateProjectMemo,
  updateProjectMemoTitle,
  upsertResourceDescriptor,
  upsertInboxDescriptor,
  unlinkVaultRefFromProject,
  updateVaultRefPath,
  upsertSource,
  upsertVaultRef
};

},
"release-hardening.cjs": (module, exports, require) => {
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ANKI_ENDPOINT = 'http://127.0.0.1:8765';
const DEFAULT_BACKUP_RETENTION = 10;

function normalizeLoopbackHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' ? '127.0.0.1' : value;
}

function normalizeAnkiEndpoint(rawEndpoint = DEFAULT_ANKI_ENDPOINT) {
  const raw = String(rawEndpoint || DEFAULT_ANKI_ENDPOINT).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('AnkiConnect 地址无效，请使用本机地址，例如 http://127.0.0.1:8765。');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('AnkiConnect 地址只能使用 HTTP 或 HTTPS。');
  }
  if (url.username || url.password) {
    throw new Error('AnkiConnect 地址不能包含用户名或密码。');
  }

  const hostname = normalizeLoopbackHostname(url.hostname);
  if (hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error('为避免把 AnkiConnect 暴露到远程网络，当前版本只允许连接本机 127.0.0.1、localhost 或 ::1。');
  }

  url.hostname = hostname === '::1' ? '[::1]' : hostname;
  url.hash = '';
  const normalized = url.toString();
  return normalized.endsWith('/') && url.pathname === '/' && !url.search
    ? normalized.slice(0, -1)
    : normalized;
}

function stateBackupEntries(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^state-[a-z0-9._-]+\.json$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name, fullPath, mtimeMs: Number(stat.mtimeMs || 0) };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
}

function pruneStateBackups(backupDir, keep = DEFAULT_BACKUP_RETENTION) {
  const retention = Math.max(1, Math.min(100, Math.floor(Number(keep) || DEFAULT_BACKUP_RETENTION)));
  const entries = stateBackupEntries(backupDir);
  const removed = [];
  for (const entry of entries.slice(retention)) {
    fs.unlinkSync(entry.fullPath);
    removed.push(entry.name);
  }
  return removed;
}

async function revealLoadedLeaf(workspace, leaf) {
  if (!leaf) return null;
  if (typeof workspace?.revealLeaf === 'function') await workspace.revealLeaf(leaf);
  else if (typeof leaf.loadIfDeferred === 'function') await leaf.loadIfDeferred();
  return leaf.view || null;
}

module.exports = {
  DEFAULT_ANKI_ENDPOINT,
  DEFAULT_BACKUP_RETENTION,
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf,
  stateBackupEntries
};

},
"usage-polish.cjs": (module, exports, require) => {
'use strict';

function normalizeVaultPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function leafVaultPath(leaf) {
  const viewStatePath = leaf?.getViewState?.()?.state?.file;
  const loadedPath = leaf?.view?.file?.path;
  return normalizeVaultPath(viewStatePath || loadedPath || '');
}

function findOpenVaultLeaf(workspace, targetPath) {
  const target = normalizeVaultPath(targetPath);
  if (!target) return null;
  let found = null;
  const visit = (leaf) => {
    if (!found && leafVaultPath(leaf) === target) found = leaf;
  };
  if (typeof workspace?.iterateAllLeaves === 'function') workspace.iterateAllLeaves(visit);
  else if (typeof workspace?.rootSplit?.iterateAllLeaves === 'function') workspace.rootSplit.iterateAllLeaves(visit);
  return found;
}

function clampMemoHeight(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1200, Math.max(92, numeric));
}

function memoHeightStore(state) {
  state.uiState ||= {};
  state.uiState.projectMemoHeights ||= {};
  return state.uiState.projectMemoHeights;
}

function getMemoHeight(state, projectId, memoId) {
  return clampMemoHeight(state?.uiState?.projectMemoHeights?.[projectId]?.[memoId]);
}

function setMemoHeight(state, projectId, memoId, heightPx) {
  const height = clampMemoHeight(heightPx);
  if (!projectId || !memoId || !height) return 0;
  const store = memoHeightStore(state);
  store[projectId] ||= {};
  store[projectId][memoId] = height;
  return height;
}

function deleteMemoHeight(state, projectId, memoId) {
  const projectStore = state?.uiState?.projectMemoHeights?.[projectId];
  if (!projectStore || !memoId) return false;
  const existed = Object.prototype.hasOwnProperty.call(projectStore, memoId);
  delete projectStore[memoId];
  if (!Object.keys(projectStore).length) delete state.uiState.projectMemoHeights[projectId];
  return existed;
}

function findMemoProjectId(state, memoId) {
  if (!memoId) return '';
  for (const [projectId, project] of Object.entries(state?.projects || {})) {
    if (project?.deletedAt) continue;
    if ((Array.isArray(project?.memos) ? project.memos : []).some((memo) => memo?.id === memoId)) return projectId;
  }
  return '';
}

module.exports = {
  clampMemoHeight,
  deleteMemoHeight,
  findMemoProjectId,
  findOpenVaultLeaf,
  getMemoHeight,
  leafVaultPath,
  normalizeVaultPath,
  setMemoHeight
};

}
};
const __rhCache = new Map();

function __rhLoad(id) {
  if (__rhCache.has(id)) return __rhCache.get(id).exports;
  const factory = __rhModules[id];
  if (!factory) throw new Error(`Bundled module not found: ${id}`);
  const bundledModule = { exports: {} };
  __rhCache.set(id, bundledModule);
  factory(bundledModule, bundledModule.exports, require);
  return bundledModule.exports;
}

module.exports = __rhLoad('entry.cjs');
