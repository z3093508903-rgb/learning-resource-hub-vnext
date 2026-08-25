'use strict';

const {
  captureFrameAndInsertLearningPosition,
  commitPreparedCaptureTypedNote,
  commitPreparedTypedNote,
  insertCurrentLearningPosition,
  prepareCaptureLearningPosition,
  prepareCurrentLearningPosition
} = require('./learning-capture.cjs');
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

async function runImmersiveAction(plugin, key, options = {}) {
  if (!currentProductSettings(plugin).videoEnhancementEnabled) return null;
  if (plugin?._goStudyImmersiveBusy) {
    await successFeedback(plugin, 'Go Study：上一项记录还在处理中', options);
    return null;
  }
  plugin._goStudyImmersiveBusy = true;
  try {
    if (key === 'position') {
      const result = await insertCurrentLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      await successFeedback(plugin, `✓ 已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    if (key === 'capture') {
      const result = await captureFrameAndInsertLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      await successFeedback(plugin, `✓ 截图已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    if (key === 'note') {
      const prepared = await prepareCurrentLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await (options.showQuickNoteInput || showQuickNoteInput)(plugin, {
        title: `快速笔记 · ${formatPositionClock(prepared.position)}`,
        subtitle: '视频已暂停 · Enter 保存 · Shift+Enter 换行 · Esc 取消',
        placeholder: '写下这一刻的笔记…',
        ...(options.promptOptions || {})
      });
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消笔记', options);
        return null;
      }
      const result = await commitPreparedTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
      await successFeedback(plugin, `✓ 笔记已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    if (key === 'captureNote') {
      const prepared = await prepareCaptureLearningPosition(plugin, {
        nativeOnly: true,
        pause: true,
        ...options.captureOptions
      });
      const note = await (options.showQuickNoteInput || showQuickNoteInput)(plugin, {
        title: `截图笔记 · ${formatPositionClock(prepared.position)}`,
        subtitle: '当前帧已捕获、视频已暂停 · Enter 保存 · Shift+Enter 换行 · Esc 取消',
        placeholder: '为这一帧写一条笔记…',
        ...(options.promptOptions || {})
      });
      if (!note) {
        await resumePreparedPlayback(plugin, prepared, 'cancel', options);
        await successFeedback(plugin, '已取消截图笔记', options);
        return null;
      }
      const result = await commitPreparedCaptureTypedNote(plugin, prepared, note);
      await resumePreparedPlayback(plugin, prepared, 'save', options);
      await successFeedback(plugin, `✓ 截图笔记已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    throw new Error(`未知沉浸式操作：${String(key || '')}`);
  } catch (error) {
    const message = compactError(error);
    if (!/PotPlayer 当前不是前台窗口/.test(message)) await feedback(`⚠ ${message}`, { ...options, toastOptions: { ...(options.toastOptions || {}), durationMs: 2200 } });
    throw error;
  } finally {
    plugin._goStudyImmersiveBusy = false;
  }
}

function unregisterImmersiveHotkeys(plugin, globalShortcut = null) {
  const api = globalShortcut || plugin?._goStudyGlobalShortcut;
  const accelerators = plugin?._goStudyRegisteredAccelerators || [];
  for (const accelerator of accelerators) {
    try { api?.unregister?.(accelerator); } catch {}
  }
  if (plugin) plugin._goStudyRegisteredAccelerators = [];
}

function registerImmersiveHotkeys(plugin, options = {}) {
  const api = resolveElectronGlobalShortcut(options);
  unregisterImmersiveHotkeys(plugin, api);
  plugin._goStudyGlobalShortcut = api;
  const shortcuts = immersiveShortcuts(plugin);
  const enabled = currentProductSettings(plugin).videoEnhancementEnabled;

  if (!enabled) {
    return setImmersiveStatus(plugin, {
      mode: 'disabled', registered: false, shortcuts, registeredAccelerators: [], error: ''
    });
  }
  const conflict = shortcutConflict(shortcuts);
  if (conflict) {
    return setImmersiveStatus(plugin, {
      mode: 'unavailable', registered: false, shortcuts, registeredAccelerators: [],
      error: `${HOTKEY_ACTIONS[conflict[0]]} 与 ${HOTKEY_ACTIONS[conflict[1]]} 使用了同一个快捷键：${conflict[2]}`
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
  for (const key of Object.keys(HOTKEY_ACTIONS)) {
    let accelerator;
    try { accelerator = normalizeShortcut(shortcuts[key]); }
    catch (error) { failures.push(`${key}: ${compactError(error)}`); continue; }
    if (!accelerator) continue;
    try {
      const ok = api.register(accelerator, () => {
        void runImmersiveAction(plugin, key, options).catch(() => {});
      });
      if (ok === false) failures.push(`${accelerator} 已被其他程序占用`);
      else registered.push(accelerator);
    } catch (error) {
      failures.push(`${accelerator}: ${compactError(error)}`);
    }
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
  compactError,
  feedback,
  immersiveStatus,
  registerImmersiveHotkeys,
  resetImmersiveShortcuts,
  resumePreparedPlayback,
  runImmersiveAction,
  setImmersiveStatus,
  shortcutConflict,
  successFeedback,
  unregisterImmersiveHotkeys,
  updateImmersiveShortcut
};
