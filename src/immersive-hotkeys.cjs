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
  immersiveShortcuts,
  normalizeShortcut,
  resolveElectronGlobalShortcut
} = require('./native-potplayer.cjs');
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
    mode: 'unavailable',
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

async function runImmersiveAction(plugin, key, options = {}) {
  if (plugin?._goStudyImmersiveBusy) {
    await feedback('Go Study：上一项记录还在处理中', options);
    return null;
  }
  plugin._goStudyImmersiveBusy = true;
  try {
    if (key === 'position') {
      const result = await insertCurrentLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      await feedback(`✓ 已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    if (key === 'capture') {
      const result = await captureFrameAndInsertLearningPosition(plugin, { nativeOnly: true, ...options.captureOptions });
      await feedback(`✓ 截图已记录 ${formatPositionClock(result.position)}`, options);
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
        await feedback('已取消笔记', options);
        return null;
      }
      const result = await commitPreparedTypedNote(plugin, prepared, note);
      await feedback(`✓ 笔记已记录 ${formatPositionClock(result.position)}`, options);
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
        await feedback('已取消截图笔记', options);
        return null;
      }
      const result = await commitPreparedCaptureTypedNote(plugin, prepared, note);
      await feedback(`✓ 截图笔记已记录 ${formatPositionClock(result.position)}`, options);
      return result;
    }

    throw new Error(`未知沉浸式操作：${String(key || '')}`);
  } catch (error) {
    const message = compactError(error);
    // Hotkeys are reserved globally by Electron. Do not show an error toast when
    // the user presses them outside PotPlayer; just leave other failures visible.
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
  plugin.register?.(() => unregisterImmersiveHotkeys(plugin, api));
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
  plugin.state.uiState.immersiveShortcuts = {
    ...immersiveShortcuts(plugin),
    [key]: normalized
  };
  await plugin.persist();
  return registerImmersiveHotkeys(plugin, options);
}

module.exports = {
  HOTKEY_ACTIONS,
  compactError,
  feedback,
  immersiveStatus,
  registerImmersiveHotkeys,
  runImmersiveAction,
  setImmersiveStatus,
  unregisterImmersiveHotkeys,
  updateImmersiveShortcut
};
