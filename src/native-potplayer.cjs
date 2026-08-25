'use strict';

const { execFile } = require('node:child_process');
const { clipboard } = require('electron');

const DEFAULT_IMMERSIVE_SHORTCUTS = Object.freeze({
  position: 'Alt+1',
  capture: 'Alt+2',
  note: 'Alt+3',
  captureNote: 'Alt+4'
});

const POTPLAYER_PROCESS_NAMES = ['PotPlayerMini64', 'PotPlayerMini'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function immersiveShortcuts(plugin) {
  const saved = plugin?.state?.uiState?.immersiveShortcuts;
  return {
    ...DEFAULT_IMMERSIVE_SHORTCUTS,
    ...(saved && typeof saved === 'object' ? saved : {})
  };
}

function normalizeShortcut(value, fallback = '') {
  const shortcut = String(value || '').trim();
  if (!shortcut) return fallback;
  if (shortcut.length > 40 || /[\r\n\t]/.test(shortcut)) throw new Error('快捷键格式无效。');
  return shortcut;
}

function powershellExecutable(env = process.env) {
  const root = String(env.SystemRoot || env.WINDIR || 'C:\\Windows');
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

function runPowerShell(script, options = {}) {
  const exec = options.execFile || execFile;
  const executable = options.executable || powershellExecutable(options.env || process.env);
  return new Promise((resolve, reject) => {
    exec(executable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', script
    ], {
      windowsHide: true,
      timeout: Number(options.timeoutMs || 4000),
      maxBuffer: 64 * 1024,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || error).trim();
        reject(new Error(detail || 'Windows PotPlayer 控制失败。'));
        return;
      }
      const raw = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      if (!raw) return reject(new Error('PotPlayer 没有返回状态。'));
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error(`PotPlayer 返回了无法解析的状态：${raw.slice(0, 160)}`)); }
    });
  });
}

function potPlayerProbeScript(options = {}) {
  const pause = options.pause ? '$true' : '$false';
  const play = options.play ? '$true' : '$false';
  const foregroundOnly = options.foregroundOnly === false ? '$false' : '$true';
  const copyPath = options.copyPath ? '$true' : '$false';
  const capture = options.capture ? '$true' : '$false';
  const names = POTPLAYER_PROCESS_NAMES.map((name) => `'${name.replace(/'/g, "''")}'`).join(',');
  return `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GoStudyWin32 {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool PostMessage(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$names = @(${names})
$proc = Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw 'PotPlayer 当前没有运行。' }
$hwnd = [IntPtr]$proc.MainWindowHandle
$foreground = [GoStudyWin32]::GetForegroundWindow()
if (${foregroundOnly} -and $foreground -ne $hwnd) { throw 'PotPlayer 当前不是前台窗口。' }
$positionMs = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20484, [IntPtr]0).ToInt64()
$status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
$initialStatus = $status
$pausedByGoStudy = $false
if (${pause} -and $status -eq 2) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]20000, [IntPtr]0)
  Start-Sleep -Milliseconds 45
  $status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
  $pausedByGoStudy = $true
}
if (${play} -and $status -ne 2) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]20000, [IntPtr]0)
  Start-Sleep -Milliseconds 45
  $status = [GoStudyWin32]::SendMessage($hwnd, 1024, [IntPtr]20486, [IntPtr]0).ToInt64()
}
if (${copyPath}) {
  [void][GoStudyWin32]::PostMessage($hwnd, 273, [IntPtr]10928, [IntPtr]0)
  Start-Sleep -Milliseconds 140
}
if (${capture}) {
  [void][GoStudyWin32]::SendMessage($hwnd, 273, [IntPtr]10223, [IntPtr]0)
  Start-Sleep -Milliseconds 120
}
[pscustomobject]@{
  ok = $true
  process = $proc.ProcessName
  title = $proc.MainWindowTitle
  positionMs = $positionMs
  status = $status
  initialStatus = $initialStatus
  pausedByGoStudy = $pausedByGoStudy
  foreground = ($foreground -eq $hwnd)
} | ConvertTo-Json -Compress
`;
}

function validateNativeProbe(probe) {
  if (!probe?.ok) throw new Error('PotPlayer 原生控制不可用。');
  const ms = Number(probe.positionMs);
  if (!Number.isFinite(ms) || ms < 0) throw new Error('PotPlayer 当前播放位置无效。');
  return { ...probe, positionMs: ms, positionSeconds: ms / 1000 };
}

async function nativeCurrent(options = {}) {
  if (process.platform !== 'win32' && !options.allowNonWindows) throw new Error('原生 PotPlayer 控制目前只支持 Windows。');
  const clip = options.clipboard || clipboard;
  const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ pause: options.pause, copyPath: true, foregroundOnly: options.foregroundOnly !== false }),
    options
  ));
  await (options.sleep || sleep)(Number(options.clipboardDelayMs || 40));
  const mediaPath = String(clip?.readText?.() || '').trim();
  if (!mediaPath) throw new Error('无法从 PotPlayer 读取当前媒体路径。');
  return {
    ok: true,
    version: 3,
    bridge: 'go-study-native-windows',
    player: 'potplayer',
    transport: 'native-windows',
    control: {
      initialStatus: Number(probe.initialStatus),
      status: Number(probe.status),
      pausedByGoStudy: Boolean(probe.pausedByGoStudy)
    },
    media: {
      path: mediaPath,
      positionSeconds: probe.positionSeconds,
      status: probe.status,
      title: String(probe.title || '')
    }
  };
}

async function nativeCapture(options = {}) {
  const current = await nativeCurrent(options);
  const clip = options.clipboard || clipboard;
  await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ capture: true, foregroundOnly: options.foregroundOnly !== false }),
    options
  );
  await (options.sleep || sleep)(Number(options.captureDelayMs || 50));
  const image = clip?.readImage?.();
  if (!image || image.isEmpty?.()) throw new Error('无法从 PotPlayer 获取当前视频帧。');
  return { ...current, capture: { transport: 'clipboard', cropped: false } };
}

async function nativePlay(options = {}) {
  const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
    potPlayerProbeScript({ play: true, foregroundOnly: false }),
    options
  ));
  return {
    ok: true,
    version: 3,
    bridge: 'go-study-native-windows',
    player: 'potplayer',
    transport: 'native-windows',
    status: probe.status
  };
}

async function requestNativePotPlayer(action, options = {}) {
  if (action === 'ping') {
    const probe = validateNativeProbe(await (options.runPowerShell || runPowerShell)(
      potPlayerProbeScript({ foregroundOnly: false }),
      options
    ));
    return {
      ok: true,
      version: 3,
      bridge: 'go-study-native-windows',
      player: 'potplayer',
      transport: 'native-windows',
      status: probe.status
    };
  }
  if (action === 'current') return nativeCurrent(options);
  if (action === 'capture') return nativeCapture(options);
  if (action === 'play') return nativePlay(options);
  throw new Error(`不支持的原生 PotPlayer 操作：${String(action || '')}`);
}

function resolveElectronGlobalShortcut(options = {}) {
  if (options.globalShortcut) return options.globalShortcut;
  try {
    const electron = require('electron');
    if (electron.globalShortcut?.register) return electron.globalShortcut;
  } catch {}
  try {
    const remote = require('@electron/remote');
    const mainElectron = remote.require('electron');
    if (mainElectron?.globalShortcut?.register) return mainElectron.globalShortcut;
  } catch {}
  return null;
}

module.exports = {
  DEFAULT_IMMERSIVE_SHORTCUTS,
  POTPLAYER_PROCESS_NAMES,
  immersiveShortcuts,
  nativeCapture,
  nativeCurrent,
  nativePlay,
  normalizeShortcut,
  potPlayerProbeScript,
  powershellExecutable,
  requestNativePotPlayer,
  resolveElectronGlobalShortcut,
  runPowerShell,
  sleep,
  validateNativeProbe
};
