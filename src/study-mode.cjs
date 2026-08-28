'use strict';

const {
  closeCompanionNoteWindow,
  companionWindowState,
  openCompanionNoteWindow,
  setCompanionAlwaysOnTop,
  setCompanionLocked
} = require('./companion-note-window.cjs');

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function ensureStudyModeState(plugin) {
  if (!plugin?.state) throw new Error('Go Study 状态不可用。');
  plugin.state.uiState ||= {};
  const raw = objectOr(plugin.state.uiState.studyMode);
  const media = objectOr(raw.freeformMedia);
  Object.assign(raw, {
    active: Boolean(raw.active),
    mode: ['managed', 'freeform', 'note'].includes(String(raw.mode || '')) ? String(raw.mode) : 'note',
    notePath: String(raw.notePath || ''),
    resourceId: String(raw.resourceId || ''),
    projectId: String(raw.projectId || ''),
    freeformMedia: media.path ? {
      path: String(media.path || ''),
      title: String(media.title || ''),
      positionSeconds: Number.isFinite(Number(media.positionSeconds)) ? Number(media.positionSeconds) : 0
    } : null,
    alwaysOnTop: raw.alwaysOnTop !== false,
    enteredAt: String(raw.enteredAt || '')
  });
  plugin.state.uiState.studyMode = raw;
  return raw;
}

function studyModeState(plugin) {
  return ensureStudyModeState(plugin);
}

function notePathFrom(options = {}) {
  return String(options.filePath || options.note?.path || '');
}

async function enterStudyMode(plugin, options = {}) {
  const filePath = notePathFrom(options);
  if (!filePath) throw new Error('进入学习模式前需要选择一篇 Markdown 笔记。');

  const state = ensureStudyModeState(plugin);
  const freeformMedia = objectOr(options.freeformMedia, null);
  state.active = true;
  state.notePath = filePath;
  state.resourceId = String(options.resource?.id || options.resourceId || '');
  state.projectId = String(options.projectId || '');
  state.mode = state.resourceId ? 'managed' : freeformMedia?.path ? 'freeform' : 'note';
  state.freeformMedia = freeformMedia?.path ? {
    path: String(freeformMedia.path || ''),
    title: String(freeformMedia.title || ''),
    positionSeconds: Number.isFinite(Number(freeformMedia.positionSeconds)) ? Number(freeformMedia.positionSeconds) : 0
  } : null;
  state.alwaysOnTop = options.alwaysOnTop == null ? state.alwaysOnTop : Boolean(options.alwaysOnTop);
  state.enteredAt = new Date().toISOString();

  const companionState = companionWindowState(plugin);
  companionState.locked = true;
  companionState.alwaysOnTop = state.alwaysOnTop;
  companionState.activeLayoutId = 'right-rail';

  await plugin.persist?.();

  try {
    const result = await openCompanionNoteWindow(plugin, {
      filePath,
      locked: true,
      layoutId: 'right-rail',
      forceLayout: true,
      alwaysOnTop: state.alwaysOnTop,
      studyMode: true
    });
    await setCompanionLocked(plugin, true);
    await setCompanionAlwaysOnTop(plugin, state.alwaysOnTop);
    plugin._goStudyStudyMode = {
      active: true,
      notePath: filePath,
      mode: state.mode,
      resourceId: state.resourceId,
      projectId: state.projectId,
      freeformMedia: state.freeformMedia ? { ...state.freeformMedia } : null,
      enteredAt: Date.now()
    };
    return { ...result, studyMode: true, alwaysOnTop: state.alwaysOnTop };
  } catch (error) {
    state.active = false;
    state.mode = 'note';
    state.notePath = '';
    state.resourceId = '';
    state.projectId = '';
    state.freeformMedia = null;
    state.enteredAt = '';
    plugin._goStudyStudyMode = null;
    await plugin.persist?.();
    throw error;
  }
}

async function exitStudyMode(plugin, options = {}) {
  const state = ensureStudyModeState(plugin);
  state.active = false;
  state.mode = 'note';
  state.notePath = '';
  state.resourceId = '';
  state.projectId = '';
  state.freeformMedia = null;
  state.enteredAt = '';
  plugin._goStudyStudyMode = null;
  if (options.closeCompanion) await closeCompanionNoteWindow(plugin, { persist: false });
  await plugin.persist?.();
  return true;
}

async function setStudyModeAlwaysOnTop(plugin, value) {
  const state = ensureStudyModeState(plugin);
  state.alwaysOnTop = Boolean(value);
  companionWindowState(plugin).alwaysOnTop = state.alwaysOnTop;
  await setCompanionAlwaysOnTop(plugin, state.alwaysOnTop);
  await plugin.persist?.();
  return state.alwaysOnTop;
}

module.exports = {
  ensureStudyModeState,
  enterStudyMode,
  exitStudyMode,
  setStudyModeAlwaysOnTop,
  studyModeState
};
