'use strict';

const {
  captureFrameAndInsertLearningPosition,
  commitPreparedCaptureTypedNote,
  commitPreparedPlainCapture,
  commitPreparedPlainCaptureTypedNote,
  commitPreparedPlainTypedNote,
  commitPreparedTypedNote,
  insertCurrentLearningPosition,
  prepareCaptureLearningPosition,
  prepareCurrentLearningPosition
} = require('./learning-capture.cjs');
const { CAPTURE_ACTIONS, actionForSlot } = require('./capture-actions.cjs');
const { createNativeActionHud } = require('./action-hud.cjs');
const {
  DEFAULT_IMMERSIVE_SHORTCUTS,
  immersiveShortcuts,
  normalizeShortcut,
  requestNativePotPlayer,
  resolveElectronGlobalShortcut
} = require('./native-potplayer.cjs');
const { currentProductSettings } = require('./product-settings.cjs');
const { formatPositionClock } = require('./resource-note.cjs');
const { showNativeToast, showQuickNoteInput } = require('./quick-note-window.cjs');

const HOTKEY_ACTIONS = Object.freeze({
  position: '记录当前位置',
  capture: '截图并记录',
  note: '输入笔记并记录',
  captureNote: '截图、输入笔记并记录'
});

const LEGACY_ACTION_MAP = Object.freeze({
  position: 'time',
  capture: 'timeImage',
  note: 'timeNote',
  captureNote: 'all'
});

const HUD_ACCELERATORS = Object.freeze({
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right'
});

function immersiveStatus(plugin) {
  return plugin?._goStudyImmersiveStatus || {
    mode: currentProductSettings(plugin).videoEnhancementEnabled ? 'unavailable' : 'disabled',
    registered: false,
    shortcuts: immersiveShortcuts(plugin),
    error: ''
  };
}

function setImmersiveStatus(plugin, patch = {}) {
  plugin._goStudyImmersiveStatus = {
    ...immersiveStatus(plugin),
    ...patch,
    updatedAt: Date.now()
  };
  try { globalThis.document?.dispatchEvent?.(new CustomEvent('go-study-immersive-status')); } catch {}
  return plugin._goStudyImmersiveStatus;
}

function compactError(error) {
  return (error instanceof Error ? error.message : String(error || '未知错误')).replace(/[\r\n\t]+/g, ' ').slice(0, 220);
}

async function feedback(message, options = {}) {
  try { if (await showNativeToast(message, options.toastOptions || {})) return true; } catch {}
  return false;
}

async function successFeedback(plugin, message, options = {}) {
  if (!currentProductSettings(plugin).videoSuccessFeedback) return false;
  return feedback(message, options);
}

function shortcutConflict(shortcuts) {
  const seen = new Map();
  for (const [key, value] of Object.entries(shortcuts || {})) {
    const normalized = normalizeShortcut(value).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) return [seen.get(normalized), key, value];
    seen.set(normalized, key);
  }
  return null;
}

async function resumePreparedPlayback(plugin, prepared, outcome, options = {}) {
  if (!prepared?.player?.control?.pausedByGoStudy) return false;
  const settings = currentProductSettings(plugin);
  const shouldResume = outcome === 'save' ? settings.videoResumeAfterSave : settings.videoResumeAfterCancel;
  if (!shouldResume) return false;
  await (options.nativeRequest || requestNativePotPlayer)('play', {
    ...(options.nativeOptions || {}),
    foregroundOnly: false
  });
  return true;
}

function resultTimeSuffix(action, result) {
  if (!action?.time || !result?.position) return '';
  return ` ${formatPositionClock(result.position)}`;
}

async function promptForPreparedNote(plugin, prepared, action, options = {}) {
  return (options.showQuickNoteInput || showQuickNoteInput)(plugin, {
    title: action.time
      ? `${action.label} · ${formatPositionClock(prepared.position)}`
      : action.label,
    subtitle: '视频已暂停 · Enter 保存 · Shift+Enter 换行 · Esc 取消',
    placeholder: '写下这一刻的笔记…',
    ...(options.promptOptions || {})
  });
}

async function runCaptureAction(plugin, actionValue, options = {}) {
  if (!currentProductSettings(plugin).videoEnhancementEnabled) return null;
  const action = typeof actionValue === 'string' ? CAPTURE_ACTIONS[actionValue] : actionValue;
  if (!action) throw new Error('未知视频笔记动作。');
  if (plugin?._goStudyImmersiveBusy) {
    await successFeedback(plugin, 'Go Study：上一项记录还在处理中', options);
    return null;
  }
  plugin._goStudyImmersiveBusy = true;
  let prepared = null;
  try {
    let result;
    if (action.image && action.note) {
      prepared = await prepareCaptureLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await promptForPreparedNote(plugin, prepared, action, options);
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消笔记', options);
        return null;
      }
      result = action.time
        ? await commitPreparedCaptureTypedNote(plugin, prepared, note)
        : await commitPreparedPlainCaptureTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
    } else if (action.image) {
      if (action.time) {
        result = await captureFrameAndInsertLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      } else {
        prepared = await prepareCaptureLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
        result = await commitPreparedPlainCapture(plugin, prepared);
      }
    } else if (action.note) {
      prepared = await prepareCurrentLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await promptForPreparedNote(plugin, prepared, action, options);
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消笔记', options);
        return null;
      }
      result = action.time
        ? await commitPreparedTypedNote(plugin, prepared, note)
        : await commitPreparedPlainTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
    } else if (action.time) {
      result = await insertCurrentLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
    } else {
      throw new Error('当前动作没有任何采集内容。');
    }

    await successFeedback(plugin, `✓ ${action.label}${resultTimeSuffix(action, result)}`, options);
    return result;
  } catch (error) {
    const message = compactError(error);
    if (!/PotPlayer 当前不是前台窗口/.test(message)) {
      await feedback(`⚠ ${message}`, { ...options, toastOptions: { ...(options.toastOptions || {}), durationMs: 2200 } });
    }
    throw error;
  } finally {
    plugin._goStudyImmersiveBusy = false;
  }
}

async function runImmersiveAction(plugin, key, options = {}) {
  const actionId = LEGACY_ACTION_MAP[key];
  if (!actionId) throw new Error(`未知沉浸式操作：${String(key || '')}`);
  return runCaptureAction(plugin, actionId, options);
}

function closeActionHudSession(plugin) {
  const session = plugin?._goStudyActionHudSession;
  if (!session) return;
  try { session.close?.(); } catch {}
  if (plugin) plugin._goStudyActionHudSession = null;
}

function beginActionHud(plugin, globalShortcut, options = {}) {
  const settings = currentProductSettings(plugin);
  if (!settings.videoEnhancementEnabled) return null;
  closeActionHudSession(plugin);

  const api = globalShortcut || plugin?._goStudyGlobalShortcut;
  if (!api?.register || !api?.unregister) {
    void feedback('⚠ Go Study 动作盘无法使用全局键盘接口', options);
    return null;
  }

  const hud = createNativeActionHud(settings.actionHudSlots, options.hudOptions || {});
  if (!hud) {
    void feedback('⚠ Go Study 动作盘窗口接口不可用', options);
    return null;
  }
  const temporary = [];
  let visible = false;
  let selected = '';
  let closed = false;
  let showTimer = null;
  let expiryTimer = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (showTimer) clearTimeout(showTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    for (const accelerator of temporary) {
      try { api.unregister(accelerator); } catch {}
    }
    try { hud?.close?.(); } catch {}
    if (plugin?._goStudyActionHudSession?.close === cleanup) plugin._goStudyActionHudSession = null;
  };

  const execute = (slot) => {
    const action = actionForSlot(settings.actionHudSlots, slot);
    cleanup();
    void runCaptureAction(plugin, action, options).catch(() => {});
  };

  const chooseDirection = (slot) => {
    if (!visible) return execute(slot);
    selected = slot;
    void hud?.select?.(slot);
  };

  const handlers = {
    Up: () => chooseDirection('up'),
    Down: () => chooseDirection('down'),
    Left: () => chooseDirection('left'),
    Right: () => chooseDirection('right'),
    Enter: () => execute(selected || 'center'),
    Escape: () => cleanup()
  };

  const failures = [];
  for (const [accelerator, handler] of Object.entries(handlers)) {
    try {
      const ok = api.register(accelerator, handler);
      if (ok === false) failures.push(accelerator);
      else temporary.push(accelerator);
    } catch {
      failures.push(accelerator);
    }
  }
  if (failures.length) {
    cleanup();
    void feedback(`⚠ 动作盘无法临时接管：${failures.join('、')}`, options);
    return null;
  }

  const delay = Number(settings.actionHudDelayMs || 0);
  showTimer = setTimeout(() => {
    if (closed) return;
    visible = true;
    void hud?.show?.();
  }, delay);
  expiryTimer = setTimeout(cleanup, Math.max(8000, delay + 5000));

  plugin._goStudyActionHudSession = {
    close: cleanup,
    execute,
    select: chooseDirection,
    get visible() { return visible; }
  };
  return plugin._goStudyActionHudSession;
}

function unregisterImmersiveHotkeys(plugin, globalShortcut = null) {
  closeActionHudSession(plugin);
  const api = globalShortcut || plugin?._goStudyGlobalShortcut;
  const accelerators = plugin?._goStudyRegisteredAccelerators || [];
  for (const accelerator of accelerators) {
    try { api?.unregister?.(accelerator); } catch {}
  }
  if (plugin) plugin._goStudyRegisteredAccelerators = [];
}

function registrationConflict(settings, shortcuts) {
  const mode = settings.shortcutMode;
  if (mode === 'legacy' || mode === 'mixed') {
    const conflict = shortcutConflict(shortcuts);
    if (conflict) {
      return `${HOTKEY_ACTIONS[conflict[0]]} 与 ${HOTKEY_ACTIONS[conflict[1]]} 使用了同一个快捷键：${conflict[2]}`;
    }
  }
  if (mode === 'mixed') {
    const hud = normalizeShortcut(settings.actionHudShortcut).toLowerCase();
    for (const [key, value] of Object.entries(shortcuts)) {
      if (hud && normalizeShortcut(value).toLowerCase() === hud) {
        return `动作盘快捷键与 ${HOTKEY_ACTIONS[key]} 重复：${settings.actionHudShortcut}`;
      }
    }
  }
  return '';
}

function registerImmersiveHotkeys(plugin, options = {}) {
  const api = resolveElectronGlobalShortcut(options);
  unregisterImmersiveHotkeys(plugin, api);
  plugin._goStudyGlobalShortcut = api;
  const shortcuts = immersiveShortcuts(plugin);
  const settings = currentProductSettings(plugin);
  const enabled = settings.videoEnhancementEnabled;

  if (!enabled) {
    return setImmersiveStatus(plugin, {
      mode: 'disabled', registered: false, shortcuts, registeredAccelerators: [], error: ''
    });
  }
  const conflict = registrationConflict(settings, shortcuts);
  if (conflict) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, registeredAccelerators: [], error: conflict
    });
  }
  if (process.platform !== 'win32' && !options.allowNonWindows) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, error: '原生沉浸式快捷键目前只支持 Windows。'
    });
  }
  if (!api?.register) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, error: 'Electron 全局快捷键接口不可用。'
    });
  }

  const registered = [];
  const failures = [];
  const registerOne = (accelerator, callback) => {
    if (!accelerator) return;
    try {
      const ok = api.register(accelerator, callback);
      if (ok === false) failures.push(`${accelerator} 已被其他程序占用`);
      else registered.push(accelerator);
    } catch (error) {
      failures.push(`${accelerator}: ${compactError(error)}`);
    }
  };

  if (settings.shortcutMode === 'legacy' || settings.shortcutMode === 'mixed') {
    for (const key of Object.keys(HOTKEY_ACTIONS)) {
      let accelerator;
      try { accelerator = normalizeShortcut(shortcuts[key]); }
      catch (error) { failures.push(`${key}: ${compactError(error)}`); continue; }
      registerOne(accelerator, () => void runImmersiveAction(plugin, key, options).catch(() => {}));
    }
  }

  if (settings.shortcutMode === 'hud' || settings.shortcutMode === 'mixed') {
    let master = '';
    try { master = normalizeShortcut(settings.actionHudShortcut); }
    catch (error) { failures.push(`HUD: ${compactError(error)}`); }
    registerOne(master, () => beginActionHud(plugin, api, options));
  }

  plugin._goStudyRegisteredAccelerators = registered;
  if (!plugin._goStudyHotkeyUnloadRegistered) {
    plugin._goStudyHotkeyUnloadRegistered = true;
    plugin.register?.(() => unregisterImmersiveHotkeys(plugin, api));
  }
  return setImmersiveStatus(plugin, {
    mode: registered.length ? 'native-windows' : 'unavailable',
    registered: registered.length > 0,
    shortcuts,
    shortcutMode: settings.shortcutMode,
    actionHudShortcut: settings.actionHudShortcut,
    registeredAccelerators: registered,
    error: failures.join('；')
  });
}

async function updateImmersiveShortcut(plugin, key, value, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(HOTKEY_ACTIONS, key)) throw new Error('未知快捷键。');
  const normalized = normalizeShortcut(value);
  const next = {
    ...immersiveShortcuts(plugin),
    [key]: normalized
  };
  const conflict = shortcutConflict(next);
  if (conflict) throw new Error(`${HOTKEY_ACTIONS[conflict[0]]} 与 ${HOTKEY_ACTIONS[conflict[1]]} 不能使用同一个快捷键。`);
  const settings = currentProductSettings(plugin);
  if (settings.shortcutMode === 'mixed' && normalized
    && normalized.toLowerCase() === normalizeShortcut(settings.actionHudShortcut).toLowerCase()) {
    throw new Error('独立快捷键不能与动作盘主快捷键重复。');
  }
  plugin.state.uiState.immersiveShortcuts = next;
  await plugin.persist();
  return registerImmersiveHotkeys(plugin, options);
}

async function resetImmersiveShortcuts(plugin, options = {}) {
  plugin.state.uiState.immersiveShortcuts = { ...DEFAULT_IMMERSIVE_SHORTCUTS };
  await plugin.persist();
  return registerImmersiveHotkeys(plugin, options);
}

module.exports = {
  HOTKEY_ACTIONS,
  LEGACY_ACTION_MAP,
  beginActionHud,
  closeActionHudSession,
  compactError,
  feedback,
  immersiveStatus,
  registerImmersiveHotkeys,
  registrationConflict,
  resetImmersiveShortcuts,
  resumePreparedPlayback,
  runCaptureAction,
  runImmersiveAction,
  setImmersiveStatus,
  shortcutConflict,
  successFeedback,
  unregisterImmersiveHotkeys,
  updateImmersiveShortcut
};
