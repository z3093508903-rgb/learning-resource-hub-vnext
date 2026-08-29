'use strict';

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
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


function potPlayerExecutableCandidates(env = process.env) {
  const roots = [
    String(env.ProgramW6432 || '').trim(),
    String(env.ProgramFiles || '').trim(),
    String(env['ProgramFiles(x86)'] || '').trim(),
    String(env.LOCALAPPDATA || '').trim()
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    for (const relative of [
      ['DAUM', 'PotPlayer', 'PotPlayerMini64.exe'],
      ['DAUM', 'PotPlayer', 'PotPlayerMini.exe'],
      ['PotPlayer', 'PotPlayerMini64.exe'],
      ['PotPlayer', 'PotPlayerMini.exe']
    ]) candidates.push(path.join(root, ...relative));
  }
  return [...new Set(candidates)];
}

function normalizeSeekSeconds(position) {
  if (position && typeof position === 'object') {
    const seconds = Number(position.seconds);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const raw = String(position ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const seconds = values.pop();
  const minutes = values.pop() || 0;
  const hours = values.pop() || 0;
  if (seconds >= 60 || minutes >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function normalizePotPlayerTarget(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 8192 || /[\x00-\x1F]/.test(raw)) throw new Error('PotPlayer 启动目标无效。');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {}
  const windowsDrive = /^[A-Za-z]:[\\/]/.test(raw);
  const windowsUnc = /^\\\\[^\\]+\\[^\\]+/.test(raw);
  if (!windowsDrive && !windowsUnc) throw new Error('PotPlayer 只允许打开 HTTP(S) 地址或 Windows 绝对媒体路径。');
  return raw;
}

async function resolvePotPlayerExecutable(options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const explicit = String(options.executable || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  const candidates = options.candidates || potPlayerExecutableCandidates(options.env || process.env);
  const found = candidates.find((candidate) => {
    try { return existsSync(candidate); } catch { return false; }
  });
  if (found) return found;

  try {
    const probeScript = `
$ErrorActionPreference = 'SilentlyContinue'
$exe = ''
$names = @('PotPlayerMini64','PotPlayerMini')
$proc = Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.Path } | Select-Object -First 1
if ($proc -and $proc.Path) { $exe = [string]$proc.Path }
if (-not $exe) {
  foreach ($key in @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PotPlayerMini64.exe',
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PotPlayerMini.exe',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PotPlayerMini64.exe',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PotPlayerMini.exe'
  )) {
    $value = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).'(default)'
    if ($value -and (Test-Path -LiteralPath $value)) { $exe = [string]$value; break }
  }
}
[pscustomobject]@{ ok = $true; executable = $exe } | ConvertTo-Json -Compress
`;
    const probe = await (options.runPowerShell || runPowerShell)(probeScript, options);
    const executable = String(probe?.executable || '').trim();
    if (executable && existsSync(executable)) return executable;
  } catch {}

  throw new Error('没有找到 PotPlayer 可执行文件。请确认已安装 PotPlayer；Go Study 不再依赖 note2potplayer.exe。');
}

async function launchPotPlayerTarget(target, position = null, options = {}) {
  if (process.platform !== 'win32' && !options.allowNonWindows) {
    throw new Error('Go Study 原生 PotPlayer 启动目前只支持 Windows。');
  }
  const normalizedTarget = normalizePotPlayerTarget(target);
  const executable = await resolvePotPlayerExecutable(options);
  const seconds = normalizeSeekSeconds(position);
  const args = [normalizedTarget, '/current'];
  if (seconds != null) args.push('/seek=' + String(seconds));

  const spawnImpl = options.spawn || spawn;
  const child = spawnImpl(executable, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    shell: false
  });
  child?.unref?.();
  return {
    ok: true,
    transport: 'native-potplayer-cli',
    executable,
    target: normalizedTarget,
    positionApplied: seconds != null,
    positionSeconds: seconds
  };
}

module.exports = {
  DEFAULT_IMMERSIVE_SHORTCUTS,
  POTPLAYER_PROCESS_NAMES,
  immersiveShortcuts,
  launchPotPlayerTarget,
  nativeCapture,
  nativeCurrent,
  nativePlay,
  normalizePotPlayerTarget,
  normalizeSeekSeconds,
  normalizeShortcut,
  potPlayerExecutableCandidates,
  potPlayerProbeScript,
  powershellExecutable,
  requestNativePotPlayer,
  resolvePotPlayerExecutable,
  resolveElectronGlobalShortcut,
  runPowerShell,
  sleep,
  validateNativeProbe
};
