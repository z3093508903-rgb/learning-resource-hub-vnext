'use strict';

const BaseResourceHubNextPlugin = require('./main.cjs');
const { shell } = require('electron');
const {
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = require('./anki-launch.cjs');
const { findOpenVaultLeaf } = require('./usage-polish.cjs');

class ResourceHubNextPlugin extends BaseResourceHubNextPlugin {
  resolveAnkiExecutable(configured = '') {
    return resolveAnkiExecutable(configured);
  }

  async ensureAnkiRunning() {
    const source = Object.values(this.state.sources)
      .find((item) => item.type === 'anki' && !item.deletedAt) || {};
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
