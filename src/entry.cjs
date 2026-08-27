'use strict';

const model = require('./model.cjs');
const {
  installModelResourceLocatorV2,
  openListLocatorFromResource
} = require('./resource-locator.cjs');
installModelResourceLocatorV2(model);

const BaseResourceHubNextPlugin = require('./main.cjs');
const { Notice } = require('obsidian');
const { shell } = require('electron');
const path = require('node:path');
const {
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = require('./anki-launch.cjs');
const { findOpenVaultLeaf } = require('./usage-polish.cjs');
const {
  DEFAULT_ANKI_ENDPOINT,
  DEFAULT_BACKUP_RETENTION,
  normalizeAnkiEndpoint,
  pruneStateBackups,
  revealLoadedLeaf
} = require('./release-hardening.cjs');
const {
  REFERENCE_ACTION,
  parseProtocolParams
} = require('./resource-reference.cjs');
const {
  formatPotPlayerTime,
  resolveReferencePlayback,
  updateResumePosition
} = require('./resource-resolver.cjs');
const { matchingManagedResource } = require('./media-session.cjs');
const {
  applySafeOpenListPathRemap,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource
} = require('./resource-relink.cjs');
const { registerResourceRelinkCommands } = require('./resource-relink-ui.cjs');
const { registerLearningCaptureCommands } = require('./learning-capture.cjs');

class ResourceHubNextPlugin extends BaseResourceHubNextPlugin {
  async onload() {
    this._vaultLifecycleReady = false;
    this.activeMediaSession = null;
    await super.onload();
    registerResourceRelinkCommands(this);
    registerLearningCaptureCommands(this);

    if (typeof this.registerObsidianProtocolHandler === 'function') {
      this.registerObsidianProtocolHandler(REFERENCE_ACTION, (params) => {
        void this.handleResourceReference(params);
      });
    }

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

  async handleResourceReference(params) {
    try {
      const reference = parseProtocolParams(params);
      return await this.openResourceReference(reference);
    } catch (error) {
      new Notice(`Go Study 回链无法打开：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResourceReference(reference) {
    if (reference?.mode === 'freeform') return this.openFreeformReference(reference);
    const resolved = resolveReferencePlayback(this.state, reference, (resource) => this.resourceActions(resource));
    const opened = await this.openPositionedPlayTarget(resolved.resource, resolved.playTarget, resolved.playerTime);
    if (!opened) return false;

    updateResumePosition(this.state.resources[resolved.resource.id], resolved.position);
    this.activeMediaSession = {
      resourceId: resolved.resource.id,
      startedAt: new Date().toISOString(),
      lastKnownPosition: { ...resolved.position }
    };
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async openFreeformReference(reference) {
    const managed = matchingManagedResource(
      this.state,
      reference.path,
      (resource) => this.resourceActions(resource)
    );
    if (managed) {
      return this.openResourceReference({
        resourceId: managed.id,
        position: reference.position,
        version: reference.version
      });
    }
    try {
      const playerTime = formatPotPlayerTime(reference.position);
      new Notice(`正在跳转临时视频 · ${playerTime}`);
      await shell.openExternal(this.toPotPlayerUri(reference.path, playerTime));
      new Notice(`已跳转临时视频 · ${playerTime}`);
      return true;
    } catch (error) {
      new Notice(`自由回链跳转失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openPositionedPlayTarget(resource, target, playerTime) {
    if (!resource || !target) return false;
    try {
      new Notice(`正在跳转：${resource.title}`);
      if (target.type === 'openlist') {
        const source = this.state.sources[target.sourceId]
          || Object.values(this.state.sources).find((item) => item.type === 'openlist' && !item.deletedAt);
        if (!source) throw new Error('请先配置 OpenList 来源连接。');
        const token = await this.loginOpenList(source);
        const entry = await this.getOpenList(source, target.remotePath, token);
        const baseUrl = String(source.baseUrl).replace(/\/+$/, '');
        const encoded = target.remotePath.split('/').map((part) => encodeURIComponent(part)).join('/');
        const sign = entry?.sign ? `?sign=${encodeURIComponent(entry.sign)}` : '';
        await shell.openExternal(this.toPotPlayerUri(`${baseUrl}/d${encoded}${sign}`, playerTime));
      } else if (target.type === 'potplayer') {
        await shell.openExternal(this.toPotPlayerUri(target.target, playerTime));
      } else if (target.type === 'uri') {
        const legacyBili = model.parseBiliVideoUrl(target.uri);
        if (!legacyBili) throw new Error('当前回链只允许跳转到受支持的视频资源。');
        await shell.openExternal(this.toPotPlayerUri(legacyBili.canonicalUrl, playerTime));
      } else {
        throw new Error('当前资源没有支持定位播放的启动方式。');
      }
      await this.markResourceStarted(resource);
      new Notice(`已跳转：${resource.title} · ${playerTime}`);
      return true;
    } catch (error) {
      new Notice(`跳转失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    const opened = await super.openResourceAction(resource, actionType, target, options);
    if (opened && actionType === 'play' && resource?.id && this.state.resources?.[resource.id]) {
      const resume = this.state.resources[resource.id].resume?.position;
      this.activeMediaSession = {
        resourceId: resource.id,
        startedAt: new Date().toISOString(),
        lastKnownPosition: resume ? { ...resume } : null
      };
    }
    return opened;
  }

  async relinkOpenListResourceToPath(resourceId, remotePath) {
    const resource = this.state.resources?.[String(resourceId || '')];
    if (!resource || resource.deletedAt) throw new Error('找不到需要重新关联的学习资源。');
    const current = openListLocatorFromResource(resource);
    if (!current) throw new Error('当前资源不是 OpenList 资源。');
    const normalizedPath = normalizeStrictOpenListPath(remotePath);
    const source = this.state.sources?.[current.sourceId];
    if (!source || source.deletedAt || source.type !== 'openlist') throw new Error('找不到这条资源对应的 OpenList 来源。');

    const token = await this.loginOpenList(source);
    const entry = await this.getOpenList(source, normalizedPath, token);
    if (!entry || entry.is_dir) throw new Error('目标路径不存在，或目标不是文件。');

    const result = relinkOpenListResource(this.state, resource.id, {
      sourceId: current.sourceId,
      remotePath: normalizedPath
    }, { changedAt: new Date() });

    const size = Number(entry.size);
    const modified = String(entry.modified || entry.updated_at || result.resource.metadata?.modified || '');
    result.resource.metadata = {
      ...(result.resource.metadata || {}),
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(modified ? { modified } : {})
    };
    result.resource.identityHints = {
      ...(result.resource.identityHints || {}),
      fileName: normalizedPath.split('/').filter(Boolean).pop() || result.resource.identityHints?.fileName || '',
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(modified ? { modified } : {})
    };

    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return result;
  }

  async previewOpenListFolderRemap(input = {}) {
    const preview = previewSafeOpenListPathRemap(this.state, input);
    const source = this.state.sources?.[preview.sourceId];
    if (!source || source.deletedAt || source.type !== 'openlist') throw new Error('找不到可用的 OpenList 来源。');
    const token = await this.loginOpenList(source);
    const target = await this.getOpenList(source, preview.newPrefix, token);
    if (!target?.is_dir) throw new Error('新目录不存在，或目标不是文件夹。');
    return preview;
  }

  async applyOpenListFolderRemap(preview) {
    const result = applySafeOpenListPathRemap(this.state, preview, { changedAt: new Date() });
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return result;
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
