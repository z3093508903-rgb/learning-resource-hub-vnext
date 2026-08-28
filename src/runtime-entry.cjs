'use strict';

const path = require('node:path');
const ResourceHubNextPlugin = require('./entry.cjs');
const { installScopedUiFixes } = require('./ui-fixes.cjs');
const { registerRememberedNoteTarget } = require('./note-target.cjs');
const { registerImmersiveHotkeys } = require('./immersive-hotkeys.cjs');
const { installLearningControls } = require('./learning-controls-ui.cjs');
const { installFreeformBrowserModifier } = require('./freeform-link-ui.cjs');
const { GoStudySettingsTab } = require('./product-settings-tab.cjs');
const { currentProductSettings, ensureProductSettings } = require('./product-settings.cjs');
const { registerCompanionNoteCommands } = require('./companion-note-window.cjs');
const { enterStudyMode, exitStudyMode, studyModeState } = require('./study-mode.cjs');
const { pruneStateBackups } = require('./release-hardening.cjs');
const {
  clearProjectNoteFoldersOnDelete,
  ensureProjectNotesState,
  markProjectNotesMissing,
  playerTimeFromSeconds,
  projectIdForResource,
  recentStudy,
  recordRecentStudy,
  restoreProjectNotePath,
  updateProjectNoteFoldersOnRename,
  updateProjectNotePathsOnRename
} = require('./project-notes.cjs');
const {
  chooseStudyNote,
  installProjectNoteEntryPoints,
  openProjectNote
} = require('./project-notes-ui.cjs');

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
    const hadProjectNotes = Boolean(this.state.projectNotes && this.state.uiState?.recentStudyByProject);
    ensureProjectNotesState(this.state);
    if (normalized.changed || !hadProjectNotes) await this.persist();
    registerRememberedNoteTarget(this);
    registerCompanionNoteCommands(this);
    registerImmersiveHotkeys(this);
    installScopedUiFixes(this);
    installLearningControls(this);
    installFreeformBrowserModifier(this);
    installProjectNoteEntryPoints(this);
  }

  async openResourceAction(resource, actionType, target, options = {}) {
    const storedResource = resource?.id && this.state.resources?.[resource.id] && !this.state.resources[resource.id].deletedAt;
    const projectId = storedResource ? projectIdForResource(this.state, resource.id) : '';
    const shouldChooseNote = !options.skipProjectNotePrompt
      && actionType === 'play'
      && resource?.kind === 'video'
      && projectId;

    if (!shouldChooseNote) return super.openResourceAction(resource, actionType, target, options);

    const choice = await chooseStudyNote(this, projectId, resource);
    if (choice?.cancelled) return false;

    let enteredStudyMode = false;
    if (choice?.studyMode && choice?.note) {
      await enterStudyMode(this, { note: choice.note, resource, projectId });
      enteredStudyMode = true;
    } else if (studyModeState(this).active) {
      await exitStudyMode(this, { closeCompanion: true });
    }

    const opened = await super.openResourceAction(resource, actionType, target, options);
    if (!opened) {
      if (enteredStudyMode) await exitStudyMode(this, { closeCompanion: true });
      return false;
    }

    recordRecentStudy(this.state, projectId, resource.id, choice?.note?.id || '');
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async continueRecentProjectStudy(projectId) {
    const study = recentStudy(this.state, projectId);
    if (!study) return false;

    if (study.note) await openProjectNote(this, study.note, { prepareForStudy: true });

    const resource = study.resource;
    const actions = this.resourceActions(resource);
    const resume = resource.resume?.position;
    let opened = false;

    if (actions.playTarget && resume?.type === 'time' && Number(resume.seconds) > 0) {
      const playerTime = playerTimeFromSeconds(resume.seconds);
      opened = await this.openPositionedPlayTarget(resource, actions.playTarget, playerTime);
      if (opened) {
        this.activeMediaSession = {
          resourceId: resource.id,
          startedAt: new Date().toISOString(),
          lastKnownPosition: { type: 'time', seconds: Number(resume.seconds) }
        };
      }
    } else if (actions.playTarget) {
      opened = await super.openResourceAction(resource, 'play', actions.playTarget, { skipProjectNotePrompt: true });
    } else if (actions.webTarget) {
      opened = await super.openResourceAction(resource, 'web', actions.webTarget, { skipProjectNotePrompt: true });
    } else if (actions.defaultTarget) {
      opened = await super.openResourceAction(resource, 'default', actions.defaultTarget, { skipProjectNotePrompt: true });
    }

    if (!opened) return false;
    recordRecentStudy(this.state, projectId, resource.id, study.note?.id || '');
    await this.persist();
    await this.workbenchLeaf?.view?.render?.();
    return true;
  }

  async handleVaultRename(entry, oldPath) {
    const result = await super.handleVaultRename(entry, oldPath);
    const changedNotes = updateProjectNotePathsOnRename(this.state, oldPath, entry?.path);
    const changedFolders = updateProjectNoteFoldersOnRename(this.state, oldPath, entry?.path);
    if (changedNotes || changedFolders) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
  }

  async handleVaultDelete(entry) {
    const result = await super.handleVaultDelete(entry);
    const changedNotes = markProjectNotesMissing(this.state, entry?.path);
    const changedFolders = clearProjectNoteFoldersOnDelete(this.state, entry?.path);
    if (changedNotes || changedFolders) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
  }

  async handleVaultCreate(entry) {
    const result = await super.handleVaultCreate(entry);
    const changed = restoreProjectNotePath(this.state, entry?.path);
    if (changed) {
      await this.persist();
      await this.workbenchLeaf?.view?.render?.();
    }
    return result;
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
