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
const { CAPTURE_ACTIONS, HUD_SLOT_LABELS, HUD_SLOT_ORDER } = require('./capture-actions.cjs');
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
  buildPlainCaptureMarkdown,
  buildPlainCaptureNoteMarkdown,
  buildPlainNoteMarkdown,
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
    captureNoteTemplate: settings.captureNoteTemplate,
    plainNoteTemplate: settings.plainNoteTemplate,
    plainCaptureTemplate: settings.plainCaptureTemplate,
    plainCaptureNoteTemplate: settings.plainCaptureNoteTemplate
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
    `Alt+4 · 截图笔记\n${buildCaptureNoteMarkdown(resource, position, 'GoStudy/Captures/example.png', '这一帧的公式需要重新推导一次。', options)}`,
    `HUD · 纯笔记（不记录时间）\n${buildPlainNoteMarkdown('这是不带时间戳的随手记录。', options)}`,
    `HUD · 仅截图（不记录时间）\n${buildPlainCaptureMarkdown('GoStudy/Captures/example.png', options)}`,
    `HUD · 截图 + 评论（不记录时间）\n${buildPlainCaptureNoteMarkdown('GoStudy/Captures/example.png', '只保存画面和评论。', options)}`
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

    new Setting(containerEl)
      .setName('学习时把光标定位到笔记末尾')
      .setDesc('开始学习或继续学习并打开一篇项目笔记时，自动进入编辑状态并把光标放到文件最后一行；关闭后只打开笔记，不改变光标位置。')
      .addToggle((toggle) => toggle
        .setValue(settings.focusStudyNoteAtEnd)
        .onChange(async (value) => {
          await updateProductSetting(this.plugin, 'focusStudyNoteAtEnd', value);
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

    new Setting(containerEl)
      .setName('未收录视频也启用增强')
      .setDesc('开启后，自己打开的 PotPlayer 视频也能记录；匹配到已收录资源时自动使用 Managed 回链，否则生成可回到当前媒体位置的 Freeform 回链。')
      .addToggle((toggle) => {
        toggle.setValue(settings.freeformVideoNotesEnabled);
        toggle.setDisabled?.(!enabled);
        toggle.onChange(async (value) => {
          await updateProductSetting(this.plugin, 'freeformVideoNotesEnabled', value);
        });
      });

    new Setting(containerEl)
      .setName('快捷键操作方式')
      .setDesc('“混合”保留 Alt+1～Alt+4，同时启用动作盘；也可以只保留其中一种。')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('mixed', '混合 · 动作盘 + 独立快捷键')
          .addOption('hud', '仅动作盘')
          .addOption('legacy', '仅独立快捷键')
          .setValue(settings.shortcutMode)
          .setDisabled?.(!enabled)
          .onChange(async (value) => {
            await updateProductSetting(this.plugin, 'shortcutMode', value);
            registerImmersiveHotkeys(this.plugin);
            this.display();
          });
      });

    if (settings.shortcutMode === 'hud' || settings.shortcutMode === 'mixed') {
      new Setting(containerEl)
        .setName('动作盘主快捷键')
        .setDesc('默认 Alt+S。按下后短暂停顿会显示 HUD；在显示延迟内直接按方向键可跳过 HUD 执行动作。')
        .addText((text) => {
          text.setValue(settings.actionHudShortcut);
          text.setPlaceholder('Alt+S');
          text.setDisabled?.(!enabled);
          const commit = async () => {
            try {
              await updateProductSetting(this.plugin, 'actionHudShortcut', text.getValue());
              registerImmersiveHotkeys(this.plugin);
              this.display();
            } catch (error) {
              text.setValue(currentProductSettings(this.plugin).actionHudShortcut);
              new Notice(commandErrorText('动作盘快捷键更新失败', error), 5000);
            }
          };
          text.inputEl?.addEventListener('change', () => void commit());
        });

      new Setting(containerEl)
        .setName('动作盘显示延迟')
        .setDesc('熟练时可在 HUD 出现前直接按方向执行；停顿超过这个时间才显示提示。')
        .addDropdown((dropdown) => dropdown
          .addOption('0', '立即显示')
          .addOption('200', '200 ms')
          .addOption('300', '300 ms · 推荐')
          .addOption('500', '500 ms')
          .setValue(String(settings.actionHudDelayMs))
          .setDisabled?.(!enabled)
          .onChange(async (value) => {
            await updateProductSetting(this.plugin, 'actionHudDelayMs', Number(value));
          }));

      for (const slot of HUD_SLOT_ORDER) {
        new Setting(containerEl)
          .setName(`动作盘 · ${HUD_SLOT_LABELS[slot]}`)
          .setDesc('为这个方向选择要采集的组合；最终 Markdown 仍由对应模板决定。')
          .addDropdown((dropdown) => {
            for (const action of Object.values(CAPTURE_ACTIONS)) dropdown.addOption(action.id, action.label);
            dropdown
              .setValue(settings.actionHudSlots[slot])
              .setDisabled?.(!enabled)
              .onChange(async (value) => {
                const next = { ...currentProductSettings(this.plugin).actionHudSlots, [slot]: value };
                await updateProductSetting(this.plugin, 'actionHudSlots', next);
              });
          });
      }
    }

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

    if (settings.shortcutMode === 'legacy' || settings.shortcutMode === 'mixed') {
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
        .setName('恢复默认独立快捷键')
        .setDesc('恢复为 Alt+1、Alt+2、Alt+3、Alt+4。')
        .addButton((button) => button
          .setButtonText('恢复默认')
          .setDisabled(!enabled)
          .onClick(async () => {
            await resetImmersiveShortcuts(this.plugin);
            new Notice('已恢复默认视频快捷键。');
            this.display();
          }));
    }

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
      .setDesc('留空时跟随 Obsidian 当前附件设置；填写 Vault 相对路径时由 Go Study 固定保存到该目录。这样也更容易与自定义附件位置插件共存。')
      .addText((text) => {
        text.setValue(settings.captureFolder);
        text.setPlaceholder('留空 = 跟随 Obsidian 附件设置');
        text.setDisabled?.(!enabled);
        const commit = async () => {
          try {
            const next = await updateProductSetting(this.plugin, 'captureFolder', text.getValue());
            text.setValue(next.captureFolder);
            new Notice(next.captureFolder ? `截图目录已更新：${next.captureFolder}` : '截图保存已改为跟随 Obsidian 附件设置。');
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
    this.addTemplateSetting(
      containerEl,
      'plainNoteTemplate',
      '无时间 · 纯笔记模板',
      '可用变量：{note}。用于 HUD 中不记录时间戳的评论动作。'
    );
    this.addTemplateSetting(
      containerEl,
      'plainCaptureTemplate',
      '无时间 · 仅截图模板',
      '可用变量：{image}。用于只保存截图、不生成时间回链的动作。'
    );
    this.addTemplateSetting(
      containerEl,
      'plainCaptureNoteTemplate',
      '无时间 · 截图评论模板',
      '可用变量：{image}、{note}。用于截图 + 评论但不记录时间戳。'
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
