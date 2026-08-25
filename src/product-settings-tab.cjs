'use strict';

const {
  Notice,
  PluginSettingTab = class {},
  Setting = class {}
} = require('obsidian');
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
  DEFAULT_PRODUCT_SETTINGS,
  currentProductSettings,
  resetOutputTemplates,
  updateProductSetting
} = require('./product-settings.cjs');
const {
  buildCaptureMarkdown,
  buildCaptureNoteMarkdown,
  buildNotePositionMarkdown,
  buildPositionMarkdown
} = require('./resource-note.cjs');

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

function noteOutputOptions(settings) {
  return {
    timeFormat: settings.timeDisplayFormat,
    backlinkTemplate: settings.backlinkTemplate,
    noteTemplate: settings.noteTemplate,
    captureTemplate: settings.captureTemplate,
    captureNoteTemplate: settings.captureNoteTemplate
  };
}

function noteOutputPreview(settings) {
  const resource = { id: 'preview-resource', title: '高等数学' };
  const position = { type: 'time', seconds: 754 };
  const options = noteOutputOptions(settings);
  return [
    `Alt+1 · 仅回链\n${buildPositionMarkdown(resource, position, options)}`,
    `Alt+2 · 截图回链\n${buildCaptureMarkdown(resource, position, 'GoStudy/Captures/example.png', options)}`,
    `Alt+3 · 快速笔记\n${buildNotePositionMarkdown(resource, position, '这里老师讲的是极限存在的必要条件。', options)}`,
    `Alt+4 · 截图笔记\n${buildCaptureNoteMarkdown(resource, position, 'GoStudy/Captures/example.png', '这一帧的公式需要重新推导一次。', options)}`
  ].join('\n\n');
}

class GoStudySettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.outputPreviewEl = null;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Go Study' });
    containerEl.createEl('p', {
      text: '资源管理保持轻量；视频笔记增强和笔记输出格式都可以按需定制。',
      cls: 'setting-item-description'
    });

    this.renderWorkbenchSettings(containerEl);
    this.renderVideoSettings(containerEl);
    this.renderNoteOutputSettings(containerEl);
    this.renderDataSettings(containerEl);
  }

  refreshOutputPreview() {
    if (!this.outputPreviewEl) return;
    try {
      this.outputPreviewEl.setText?.(noteOutputPreview(currentProductSettings(this.plugin)));
      if (!this.outputPreviewEl.setText) this.outputPreviewEl.textContent = noteOutputPreview(currentProductSettings(this.plugin));
    } catch (error) {
      const message = commandErrorText('模板预览失败', error);
      this.outputPreviewEl.setText?.(message);
      if (!this.outputPreviewEl.setText) this.outputPreviewEl.textContent = message;
    }
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
      .addToggle((toggle) => {
        toggle.setValue(settings.videoResumeAfterSave);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterSave', value);
        });
      });

    new Setting(containerEl)
      .setName('取消笔记后继续播放')
      .setDesc('Alt+3 / Alt+4 按 Esc 取消后，自动让 PotPlayer 继续播放。')
      .addToggle((toggle) => {
        toggle.setValue(settings.videoResumeAfterCancel);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoResumeAfterCancel', value);
        });
      });

    new Setting(containerEl)
      .setName('显示成功提示')
      .setDesc('成功记录后在屏幕角落短暂显示轻量提示；错误提示始终保留。')
      .addToggle((toggle) => {
        toggle.setValue(settings.videoSuccessFeedback);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'videoSuccessFeedback', value);
        });
      });

    new Setting(containerEl)
      .setName('截图保存目录')
      .setDesc('Vault 内的相对路径，例如 GoStudy/Captures 或 Notes/Video Captures。使用独立附件管理插件的用户也可以继续交给自己的附件工作流管理。')
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

  renderNoteOutputSettings(containerEl) {
    const settings = currentProductSettings(this.plugin);
    section(containerEl, '笔记输出格式', '只改变写进 Markdown 的显示形式；永久 Resource ID 回链本身不会被改成临时路径。');

    new Setting(containerEl)
      .setName('时间显示格式')
      .setDesc('“自动”在不足 1 小时时显示 MM:SS；“固定”始终显示 HH:MM:SS。')
      .addDropdown((dropdown) => dropdown
        .addOption('smart', '自动 · 12:34 / 01:12:34')
        .addOption('hms', '固定 · 00:12:34')
        .setValue(settings.timeDisplayFormat)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'timeDisplayFormat', value);
          this.refreshOutputPreview();
        }));

    this.addTemplateSetting(
      containerEl,
      'backlinkTemplate',
      '回链模板',
      '可用变量：{title}、{time}、{uri}。必须保留 {uri}，否则会失去回到课程的能力。'
    );
    this.addTemplateSetting(
      containerEl,
      'noteTemplate',
      'Alt+3 快速笔记模板',
      '可用变量：{note}、{backlink}。两者都必须保留。'
    );
    this.addTemplateSetting(
      containerEl,
      'captureTemplate',
      'Alt+2 截图模板',
      '可用变量：{image}、{backlink}。两者都必须保留。'
    );
    this.addTemplateSetting(
      containerEl,
      'captureNoteTemplate',
      'Alt+4 截图笔记模板',
      '可用变量：{image}、{note}、{backlink}。三者都必须保留。'
    );

    new Setting(containerEl)
      .setName('恢复默认输出格式')
      .setDesc('恢复 Go Study 默认的时间显示和四种 Markdown 输出模板。')
      .addButton((button) => button
        .setButtonText('恢复默认')
        .onClick(async () => {
          await resetOutputTemplates(this.plugin);
          new Notice('已恢复默认笔记输出格式。');
          this.display();
        }));

    containerEl.createEl('h4', { text: '实时示例' });
    containerEl.createEl('p', {
      text: '下面只展示最终 Markdown 文本。真实回链中的 Resource ID 与位置仍由 Go Study 自动生成。',
      cls: 'setting-item-description'
    });
    this.outputPreviewEl = containerEl.createEl('pre', { cls: 'go-study-note-output-preview' });
    this.refreshOutputPreview();
  }

  addTemplateSetting(containerEl, key, name, description) {
    const settings = currentProductSettings(this.plugin);
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addTextArea((text) => {
        text.setValue(settings[key]);
        text.setPlaceholder(DEFAULT_PRODUCT_SETTINGS[key]);
        if (text.inputEl) text.inputEl.rows = Math.min(7, Math.max(2, settings[key].split('\n').length + 1));
        const commit = async () => {
          try {
            const next = await updateProductSetting(this.plugin, key, text.getValue());
            text.setValue(next[key]);
            this.refreshOutputPreview();
            new Notice(`${name}已更新。`);
          } catch (error) {
            text.setValue(currentProductSettings(this.plugin)[key]);
            new Notice(commandErrorText(`${name}无效`, error), 6000);
          }
        };
        text.inputEl?.addEventListener('change', () => void commit());
      });
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
  noteOutputOptions,
  noteOutputPreview,
  section,
  setInterfaceTips,
  videoStatusText
};
