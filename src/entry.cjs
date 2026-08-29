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
const {
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = require('./anki-launch.cjs');
const { findOpenVaultLeaf } = require('./usage-polish.cjs');
const {
  DEFAULT_ANKI_ENDPOINT,
  normalizeAnkiEndpoint,
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
const { matchingManagedResource, matchingManagedResourceByPortableName } = require('./media-session.cjs');
const { openPortableFreeformReference } = require('./freeform-playback.cjs');
const { browserModifierActive, browserUrlAtPosition } = require('./freeform-link-ui.cjs');
const {
  browserUrlForReference,
  currentResourceForReference,
  fallbackFreeformReference,
  recoveredResourceById
} = require('./reference-fallback.cjs');
const { chooseReferenceRelinkResource } = require('./reference-relink-ui.cjs');
const {
  applySafeOpenListPathRemap,
  normalizeStrictOpenListPath,
  previewSafeOpenListPathRemap,
  relinkOpenListResource
} = require('./resource-relink.cjs');
const { registerResourceRelinkCommands } = require('./resource-relink-ui.cjs');
const { registerLearningCaptureCommands } = require('./learning-capture.cjs');

const LEGACY_GO_STUDY_PLUGIN_ID = 'learning-resource-hub-next';

class ResourceHubNextPlugin extends BaseResourceHubNextPlugin {
  async onload() {
    this._vaultLifecycleReady = false;
    this.activeMediaSession = null;
    await super.onload();
    registerResourceRelinkCommands(this);
    registerLearningCaptureCommands(this);

    this.registerGoStudyReferenceProtocol();

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

  enabledPluginIds() {
    const enabled = this.app?.plugins?.enabledPlugins;
    if (enabled instanceof Set) return new Set(enabled);
    if (Array.isArray(enabled)) return new Set(enabled.map((value) => String(value || '')));
    if (enabled && typeof enabled === 'object') {
      return new Set(Object.keys(enabled).filter((key) => enabled[key]));
    }
    return new Set();
  }

  legacyGoStudyProtocolConflict() {
    const currentId = String(this.manifest?.id || '').trim();
    if (!currentId || currentId === LEGACY_GO_STUDY_PLUGIN_ID) return false;
    return this.enabledPluginIds().has(LEGACY_GO_STUDY_PLUGIN_ID);
  }

  registerGoStudyReferenceProtocol() {
    const legacyConflict = this.legacyGoStudyProtocolConflict();
    let registered = false;
    let error = '';

    if (typeof this.registerObsidianProtocolHandler !== 'function') {
      error = '当前 Obsidian 不提供协议注册接口。';
    } else {
      try {
        this.registerObsidianProtocolHandler(REFERENCE_ACTION, (params) => {
          void this.handleResourceReference(params);
        });
        registered = true;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught || '未知错误');
        console.error('Go Study: protocol registration failed; continuing without owning obsidian://go-study.', caught);
      }
    }

    const status = {
      registered,
      action: REFERENCE_ACTION,
      legacyConflict,
      error,
      updatedAt: Date.now()
    };
    this._goStudyReferenceProtocolStatus = status;

    if ((legacyConflict || !registered) && !this._goStudyProtocolWarningShown) {
      this._goStudyProtocolWarningShown = true;
      const message = legacyConflict
        ? 'Go Study 检测到旧版 Learning Resource Hub Next 同时启用。Go Study 已继续启动，但旧版可能争用时间戳回链协议；请停用旧版并重新加载 Obsidian。'
        : `Go Study 已继续启动，但时间戳回链协议注册失败：${error || '协议可能已被其他插件占用'}。资源工作台仍可使用，请检查是否同时启用了旧版插件。`;
      new Notice(message, 10000);
    }

    return status;
  }

  async handleResourceReference(params) {
    try {
      const reference = parseProtocolParams(params);
      if (browserModifierActive(this)) return await this.openReferenceInBrowser(reference);
      return await this.openResourceReference(reference);
    } catch (error) {
      new Notice(`Go Study 回链无法打开：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openReferenceInBrowser(reference) {
    try {
      const web = await Promise.resolve(this.browserUrlForReference(reference));
      if (!web) {
        new Notice('这条 Go Study 回链没有可用的网页来源。', 6000);
        return false;
      }
      await shell.openExternal(browserUrlAtPosition(web, reference.position));
      return true;
    } catch (error) {
      new Notice(`Go Study 浏览器跳转失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      return false;
    }
  }

  async openResourceReference(reference) {
    if (reference?.mode === 'freeform') return this.openFreeformReference(reference);

    const current = currentResourceForReference(this, reference);
    if (current) {
      const resolved = resolveReferencePlayback(this.state, {
        ...reference,
        resourceId: current.id
      }, (resource) => this.resourceActions(resource));
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

    const portable = fallbackFreeformReference(reference);
    if (portable) {
      new Notice('Go Study 当前没有这条 Resource，但回链自带来源信息，将按临时视频打开。', 5000);
      return this.openFreeformReference(portable);
    }

    const recovered = recoveredResourceById(this, reference?.resourceId);
    if (recovered?.resource) {
      try {
        const actions = model.resolveResourceActions(recovered.resource, recovered.state?.sources || {});
        if (!actions.playTarget) throw new Error('恢复快照中的资源没有可用播放方式。');
        const playerTime = formatPotPlayerTime(reference.position);
        const opened = await this.openPositionedPlayTarget(recovered.resource, actions.playTarget, playerTime);
        if (opened) {
          new Notice('已从恢复快照识别这条旧回链；资源尚未重新收录到当前库。', 6000);
          return true;
        }
      } catch (error) {
        console.warn('Go Study: recovered backlink resource could not be opened.', error);
      }
    }

    const chosen = await chooseReferenceRelinkResource(this, reference);
    if (chosen?.id) {
      this.state.uiState ||= {};
      this.state.uiState.referenceAliases ||= {};
      this.state.uiState.referenceAliases[String(reference.resourceId || '')] = chosen.id;
      await this.persist();
      new Notice(`旧回链已重新关联：${chosen.title || chosen.id}`, 5000);
      return this.openResourceReference(reference);
    }

    throw new Error('Go Study 找不到这条旧回链对应的学习资源，而且旧链接没有携带可恢复的来源信息。可先重新收录对应视频，再普通点击旧时间戳进行一次性重新关联。');
  }

  browserUrlForReference(reference) {
    return browserUrlForReference(this, reference);
  }

  async openFreeformReference(reference) {
    const locator = reference?.locator || reference?.path;
    const resolveActions = (resource) => this.resourceActions(resource);
    const exactManaged = matchingManagedResource(this.state, locator, resolveActions);
    const portableManaged = exactManaged || matchingManagedResourceByPortableName(
      this.state,
      reference?.name || '',
      resolveActions
    );
    if (portableManaged) {
      return this.openResourceReference({
        resourceId: portableManaged.id,
        position: reference.position,
        version: 1
      });
    }
    try {
      const playerTime = formatPotPlayerTime(reference.position);
      new Notice(`正在跳转临时视频 · ${playerTime}`);
      const opened = await openPortableFreeformReference(reference, {
        shell,
        platform: process.platform,
        launchPotPlayerTarget: (target, position) => this.launchPotPlayerTarget(target, position)
      });
      const suffix = opened.positionApplied ? ` · ${playerTime}` : ' · 当前平台暂未应用精确时间';
      new Notice(`已打开临时视频${suffix}`);
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
        await this.launchPotPlayerTarget(`${baseUrl}/d${encoded}${sign}`, playerTime);
      } else if (target.type === 'potplayer') {
        await this.launchPotPlayerTarget(target.target, playerTime);
      } else if (target.type === 'uri') {
        const legacyBili = model.parseBiliVideoUrl(target.uri);
        if (!legacyBili) throw new Error('当前回链只允许跳转到受支持的视频资源。');
        await this.launchPotPlayerTarget(legacyBili.canonicalUrl, playerTime);
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
    return super.createStateBackup(label);
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
