'use strict';

const model = require('./model.cjs');
const { installModelResourceLocatorV2 } = require('./resource-locator.cjs');
installModelResourceLocatorV2(model);

const BaseResourceHubNextPlugin = require('./main.cjs');
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
