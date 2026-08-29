'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadNativeModule() {
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'electron') return { clipboard: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '..', 'src', 'native-potplayer.cjs');
  delete require.cache[modulePath];
  try { return require(modulePath); }
  finally { Module._load = originalLoad; }
}

test('native Windows defaults expose Alt+1 through Alt+4', () => {
  const { DEFAULT_IMMERSIVE_SHORTCUTS } = loadNativeModule();
  assert.deepEqual(DEFAULT_IMMERSIVE_SHORTCUTS, {
    position: 'Alt+1',
    capture: 'Alt+2',
    note: 'Alt+3',
    captureNote: 'Alt+4'
  });
});

test('PowerShell probe uses fixed PotPlayer window messages and foreground guard', () => {
  const { potPlayerProbeScript } = loadNativeModule();
  const script = potPlayerProbeScript({ pause: true, copyPath: true, capture: true, play: true });
  for (const value of ['20484', '20486', '10928', '10223', '20000', 'GetForegroundWindow', 'pausedByGoStudy']) {
    assert.match(script, new RegExp(value));
  }
  assert.doesNotMatch(script, /Invoke-Expression|Start-Process|cmd\.exe/i);
});

test('native current reads PotPlayer time, media path and pause ownership without Companion IPC', async () => {
  const { nativeCurrent } = loadNativeModule();
  const result = await nativeCurrent({
    allowNonWindows: true,
    runPowerShell: async () => ({
      ok: true,
      positionMs: 125500,
      status: 1,
      initialStatus: 2,
      pausedByGoStudy: true,
      title: 'Lesson - PotPlayer'
    }),
    clipboard: { readText: () => 'D:\\Course\\lesson.mp4' },
    sleep: async () => {}
  });
  assert.equal(result.transport, 'native-windows');
  assert.equal(result.media.path, 'D:\\Course\\lesson.mp4');
  assert.equal(result.media.positionSeconds, 125.5);
  assert.equal(result.control.initialStatus, 2);
  assert.equal(result.control.pausedByGoStudy, true);
});

test('native capture requests current media then captures a PotPlayer frame', async () => {
  const { nativeCapture } = loadNativeModule();
  let calls = 0;
  const image = { isEmpty: () => false };
  const result = await nativeCapture({
    allowNonWindows: true,
    runPowerShell: async () => {
      calls += 1;
      return { ok: true, positionMs: 90000, status: 1, initialStatus: 1, pausedByGoStudy: false, title: 'Lesson - PotPlayer' };
    },
    clipboard: { readText: () => 'D:\\Course\\lesson.mp4', readImage: () => image },
    sleep: async () => {}
  });
  assert.equal(calls, 2);
  assert.equal(result.media.positionSeconds, 90);
  assert.equal(result.capture.transport, 'clipboard');
});

test('native play uses the same fixed PotPlayer window-message adapter', async () => {
  const { nativePlay } = loadNativeModule();
  let script = '';
  const result = await nativePlay({
    allowNonWindows: true,
    runPowerShell: async (value) => {
      script = value;
      return { ok: true, positionMs: 90000, status: 2, initialStatus: 1, pausedByGoStudy: false };
    }
  });
  assert.equal(result.status, 2);
  assert.match(script, /\$true -and \$status -ne 2/);
  assert.match(script, /20000/);
});


test('native launcher passes target and exact seek directly to PotPlayer without shell protocol', async () => {
  const { launchPotPlayerTarget } = loadNativeModule();
  const calls = [];
  const child = { unref() { calls.push(['unref']); } };
  const result = await launchPotPlayerTarget(
    'https://www.bilibili.com/video/BV1TEST?p=2',
    { type: 'time', seconds: 27.716 },
    {
      allowNonWindows: true,
      executable: 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
      existsSync: () => true,
      spawn(executable, args, options) {
        calls.push([executable, args, options]);
        return child;
      }
    }
  );
  assert.equal(result.transport, 'native-potplayer-cli');
  assert.equal(result.positionApplied, true);
  assert.deepEqual(calls[0][1], [
    'https://www.bilibili.com/video/BV1TEST?p=2',
    '/current',
    '/seek=27.716'
  ]);
  assert.equal(calls[0][2].shell, false);
  assert.deepEqual(calls[1], ['unref']);
});

test('native launcher accepts HH:MM:SS seek values used by managed resume paths', async () => {
  const { normalizeSeekSeconds } = loadNativeModule();
  assert.equal(normalizeSeekSeconds('00:01:30.500'), 90.5);
  assert.equal(normalizeSeekSeconds('02:00:00'), 7200);
  assert.equal(normalizeSeekSeconds({ seconds: 12.25 }), 12.25);
});

test('native PotPlayer target validation rejects arbitrary protocols and relative paths', () => {
  const { normalizePotPlayerTarget } = loadNativeModule();
  assert.equal(normalizePotPlayerTarget('D:\\Course\\lesson.mp4'), 'D:\\Course\\lesson.mp4');
  assert.equal(normalizePotPlayerTarget('https://example.com/video'), 'https://example.com/video');
  assert.throws(() => normalizePotPlayerTarget('jv://open?path=x'), /只允许/);
  assert.throws(() => normalizePotPlayerTarget('relative.mp4'), /只允许/);
});


test('PotPlayer discovery covers running process, registry, uninstall metadata and Start Menu shortcuts', () => {
  const { potPlayerDiscoveryScript, POTPLAYER_PROCESS_NAMES } = loadNativeModule();
  const script = potPlayerDiscoveryScript();
  assert.ok(POTPLAYER_PROCESS_NAMES.includes('PotPlayerMini64'));
  assert.ok(POTPLAYER_PROCESS_NAMES.includes('PotPlayer'));
  assert.match(script, /ProcessName -like 'PotPlayer\*'/);
  assert.match(script, /App Paths/);
  assert.match(script, /CurrentVersion\\Uninstall/);
  assert.match(script, /DisplayIcon/);
  assert.match(script, /InstallLocation/);
  assert.match(script, /Start Menu\\Programs/);
  assert.match(script, /WScript\.Shell/);
});

test('PotPlayer resolver accepts a custom executable discovered outside Program Files', async () => {
  const { resolvePotPlayerExecutable } = loadNativeModule();
  const custom = 'D:\\Tools\\PotPlayer\\PotPlayerMini64.exe';
  const result = await resolvePotPlayerExecutable({
    candidates: [],
    existsSync(value) { return value === custom; },
    runPowerShell: async () => ({ ok: true, executable: custom })
  });
  assert.equal(result, custom);
});

test('PotPlayer resolver ignores stale configured path and can recover through discovery', async () => {
  const { resolvePotPlayerExecutable } = loadNativeModule();
  const stale = 'C:\\Missing\\PotPlayer.exe';
  const discovered = 'E:\\Portable\\PotPlayer\\PotPlayer.exe';
  const result = await resolvePotPlayerExecutable({
    executable: stale,
    candidates: [],
    existsSync(value) { return value === discovered; },
    runPowerShell: async () => ({ ok: true, executable: discovered })
  });
  assert.equal(result, discovered);
});
