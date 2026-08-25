'use strict';

const { Notice, PluginSettingTab, Setting } = require('obsidian');
const {
  captureFrameAndInsertLearningPosition,
  checkPotPlayerBridge,
  commandErrorText
} = require('./learning-capture.cjs');
const {
  HOTKEY_ACTIONS,
  immersiveStatus,
  registerImmersiveHotkeys,
  resetImmersiveShortcuts,
  updateImmersiveShortcut
} = require('./immersive-hotkeys.cjs');
const { immersiveShortcuts } = require('./native-potplayer.cjs');
const {
  currentProductSettings,
  updateProductSetting
} = require('./product-settings.cjs');

function section(containerEl, title, description = '') {
  const heading = containerEl.createEl('h3', { text: title });
  heading.addClass?.('go-study-settings-heading');
  if (description) containerEl.createEl('p', { text: description, cls: 'setting-item-description' });
}

function videoStatusText(plugin) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return '已关闭。Go Study 不会注册 Alt+1～Alt+4，也不会显示视频增强状态点。';
  const status = immersiveStatus(plugin);
  if (status.registered) return `已就绪 · ${status.registeredAccelerators?.length || 0} 个全局快捷键已注册。`;
  return status.error || '已开启，但当前没有成功注册全局快捷键。';
}

async function setInterfaceTips(plugin, value) {
  plugin.state.uiState ||= {};
  plugin.state.uiState.showInterfaceTips = Boolean(value);
  await plugin.persist();
  await plugin.workbenchLeaf?.view?.render?.();
}

class GoStudySettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Go Study' });
    containerEl.createEl('p', {
      text: '资源管理保持轻量；视频笔记增强按需开启。后续时间戳、回链和笔记模板会继续收纳在这里。',
      cls: 'setting-item-description'
    });

    this.renderWorkbenchSettings(containerEl);
    this.renderVideoSettings(containerEl);
    this.renderDataSettings(containerEl);
  }

  renderWorkbenchSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '工作台', '控制 Go Study 自身界面行为，不影响资源数据。');

    new Setting(containerEl)
      .setName('显示界面说明')
      .setDesc('在工作台中保留辅助说明文字。关闭后界面更紧凑。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.state.uiState?.showInterfaceTips !== false)
        .onChange(async (value) => {
          await setInterfaceTips(this.plugin, value);
        }));

    new Setting(containerEl)
      .setName('进入工作台时自动收起左侧栏')
      .setDesc('为 Go Study 腾出更大的横向空间；离开插件时仍会恢复原来的侧栏状态。')
      .addToggle((toggle) => toggle
        .setValue(settings.autoCollapseSidebar)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'autoCollapseSidebar', value);
          if (!value) await this.plugin.restoreSidebar?.();
        }));
  }

  renderVideoSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    const enabled = settings.videoEnhancementEnabled;
    const shortcuts = immersiveShortcuts(this.plugin);

    section(containerEl, '视频笔记增强', 'Windows + PotPlayer 原生增强。关闭时 Go Study 仍然可以作为普通资源管理器完整使用。');

    new Setting(containerEl)
      .setName('启用视频笔记增强')
      .setDesc('开启后注册全局快捷键，并启用 PotPlayer 时间点、截图和快速笔记能力。无需 markdown2potplayer / AutoHotkey。')
      .addToggle((toggle) => toggle
        .setValue(enabled)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoEnhancementEnabled', value);
          registerImmersiveHotkeys(this.plugin);
          this.display();
        }));

    const status = new Setting(containerEl)
      .setName('当前状态')
      .setDesc(videoStatusText(this.plugin));
    status.addButton((button) => button
      .setButtonText('检查状态')
      .setDisabled(!enabled)
      .onClick(async () => {
        button.setDisabled(true);
        try {
          const result = await checkPotPlayerBridge({ nativeOnly: true });
          new Notice(`视频笔记增强可用 · ${result.transport || 'native-windows'}`);
        } catch (error) {
          new Notice(commandErrorText('视频笔记增强不可用', error), 6000);
        } finally {
          button.setDisabled(false);
          this.display();
        }
      }));

    const shortcutKeys = ['position', 'capture', 'note', 'captureNote'];
    for (const key of shortcutKeys) {
      new Setting(containerEl)
        .setName(HOTKEY_ACTIONS[key])
        .setDesc('留空可禁用这一动作；重复快捷键会被拒绝。')
        .addText((text) => {
          text.setValue(shortcuts[key] || '');
          text.setPlaceholder('例如 Alt+1');
          text.setDisabled?.(!enabled);
          const commit = async () => {
            try {
              await updateImmersiveShortcut(this.plugin, key, text.getValue());
              new Notice(`快捷键已更新：${HOTKEY_ACTIONS[key]}`);
            } catch (error) {
              text.setValue(immersiveShortcuts(this.plugin)[key] || '');
              new Notice(commandErrorText('快捷键更新失败', error), 5000);
            }
            this.display();
          };
          text.inputEl?.addEventListener('change', () => void commit());
          text.inputEl?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              text.inputEl.blur();
            }
          });
        });
    }

    new Setting(containerEl)
      .setName('恢复默认快捷键')
      .setDesc('恢复为 Alt+1、Alt+2、Alt+3、Alt+4。')
      .addButton((button) => button
        .setButtonText('恢复默认')
        .setDisabled(!enabled)
        .onClick(async () => {
          await resetImmersiveShortcuts(this.plugin);
          new Notice('已恢复默认视频快捷键。');
          this.display();
        }));

    new Setting(containerEl)
      .setName('保存笔记后继续播放')
      .setDesc('Alt+3 / Alt+4 按 Enter 保存后，自动让 PotPlayer 继续播放。')
      .addToggle((toggle) => toggle
        .setValue(settings.videoResumeAfterSave)
        .setDisabled?.(!enabled)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterSave', value);
        }));

    new Setting(containerEl)
      .setName('取消笔记后继续播放')
      .setDesc('Alt+3 / Alt+4 按 Esc 取消后，自动让 PotPlayer 继续播放。')
      .addToggle((toggle) => toggle
        .setValue(settings.videoResumeAfterCancel)
        .setDisabled?.(!enabled)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterCancel', value);
        }));

    new Setting(containerEl)
      .setName('显示成功提示')
      .setDesc('成功记录后在屏幕角落短暂显示轻量提示；错误提示始终保留。')
      .addToggle((toggle) => toggle
        .setValue(settings.videoSuccessFeedback)
        .setDisabled?.(!enabled)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoSuccessFeedback', value);
        }));

    new Setting(containerEl)
      .setName('截图保存目录')
      .setDesc('Vault 内的相对路径，例如 GoStudy/Captures 或 Notes/Video Captures。')
      .addText((text) => {
        text.setValue(settings.captureFolder);
        text.setPlaceholder('GoStudy/Captures');
        text.setDisabled?.(!enabled);
        const commit = async () => {
          try {
            const next = await updateProductSetting(this.plugin, 'captureFolder', text.getValue());
            text.setValue(next.captureFolder);
            new Notice(`截图目录已更新：${next.captureFolder}`);
          } catch (error) {
            text.setValue(currentProductSettings(this.plugin).captureFolder);
            new Notice(commandErrorText('截图目录更新失败', error), 5000);
          }
        };
        text.inputEl?.addEventListener('change', () => void commit());
      });

    new Setting(containerEl)
      .setName('截图记录测试')
      .setDesc('用于确认当前 PotPlayer 帧、Vault 截图写入和永久回链是否正常。')
      .addButton((button) => button
        .setButtonText('执行截图记录')
        .setDisabled(!enabled)
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await captureFrameAndInsertLearningPosition(this.plugin, { nativeOnly: true });
            new Notice(`截图已保存：${result.vaultPath}`);
          } catch (error) {
            new Notice(commandErrorText('截图记录失败', error), 6000);
          } finally {
            button.setDisabled(false);
          }
        }));
  }

  renderDataSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '数据与安全', '只影响 Go Study 自己的状态备份，不会删除 Vault、OpenList、B站或 Anki 原始资料。');

    new Setting(containerEl)
      .setName('自动备份保留数量')
      .setDesc('保留最近 3～10 份 Go Study 状态备份。')
      .addDropdown((dropdown) => {
        for (let value = 3; value <= 10; value += 1) dropdown.addOption(String(value), `${value} 份`);
        dropdown.setValue(String(settings.backupRetention));
        dropdown.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'backupRetention', Number(value));
        });
      });

    new Setting(containerEl)
      .setName('当前插件版本')
      .setDesc(this.plugin.manifest?.version || '未知版本');
  }
}

module.exports = {
  GoStudySettingsTab,
  section,
  setInterfaceTips,
  videoStatusText
};
