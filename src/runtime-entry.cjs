'use strict';

const path = require('node:path');
const ResourceHubNextPlugin = require('./entry.cjs');
const { installScopedUiFixes } = require('./ui-fixes.cjs');
const { registerRememberedNoteTarget } = require('./note-target.cjs');
const { registerImmersiveHotkeys } = require('./immersive-hotkeys.cjs');
const { installLearningControls } = require('./learning-controls-ui.cjs');
const { GoStudySettingsTab } = require('./product-settings-tab.cjs');
const { currentProductSettings, ensureProductSettings } = require('./product-settings.cjs');
const { pruneStateBackups } = require('./release-hardening.cjs');

class ResourceHubNextRuntimePlugin extends ResourceHubNextPlugin {
  addSettingTab(tab) {
    // main.cjs still creates the original one-option setting tab. Intercept that
    // registration and replace it with the real product settings tab instead of
    // trying to inject DOM into Obsidian's settings page after the fact.
    if (!this._goStudySettingsTabRegistered) {
      this._goStudySettingsTabRegistered = true;
      return super.addSettingTab(new GoStudySettingsTab(this.app, this));
    }
    return super.addSettingTab(tab);
  }

  async onload() {
    await super.onload();
    const normalized = ensureProductSettings(this);
    if (normalized.changed) await this.persist();
    registerRememberedNoteTarget(this);
    registerImmersiveHotkeys(this);
    installScopedUiFixes(this);
    installLearningControls(this);
  }

  async collapseSidebar() {
    if (!currentProductSettings(this).autoCollapseSidebar) return false;
    return super.collapseSidebar();
  }

  async createStateBackup(label = 'manual') {
    const backupName = await super.createStateBackup(label);
    const retention = currentProductSettings(this).backupRetention;
    if (retention < 10) {
      try {
        pruneStateBackups(path.join(this.pluginStorageDir(), 'backups'), retention);
      } catch (error) {
        console.warn('Go Study: failed to apply custom backup retention.', error);
      }
    }
    return backupName;
  }
}

module.exports = ResourceHubNextRuntimePlugin;
