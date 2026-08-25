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
  const script = potPlayerProbeScript({ pause: true, copyPath: true, capture: true });
  for (const value of ['20484', '20486', '10928', '10223', '20000', 'GetForegroundWindow']) {
    assert.match(script, new RegExp(value));
  }
  assert.doesNotMatch(script, /Invoke-Expression|Start-Process|cmd\.exe/i);
});

test('native current reads PotPlayer time and media path without Companion IPC', async () => {
  const { nativeCurrent } = loadNativeModule();
  const result = await nativeCurrent({
    allowNonWindows: true,
    runPowerShell: async () => ({ ok: true, positionMs: 125500, status: 2, title: 'Lesson - PotPlayer' }),
    clipboard: { readText: () => 'D:\\Course\\lesson.mp4' },
    sleep: async () => {}
  });
  assert.equal(result.transport, 'native-windows');
  assert.equal(result.media.path, 'D:\\Course\\lesson.mp4');
  assert.equal(result.media.positionSeconds, 125.5);
});

test('native capture requests current media then captures a PotPlayer frame', async () => {
  const { nativeCapture } = loadNativeModule();
  let calls = 0;
  const image = { isEmpty: () => false };
  const result = await nativeCapture({
    allowNonWindows: true,
    runPowerShell: async () => {
      calls += 1;
      return { ok: true, positionMs: 90000, status: 1, title: 'Lesson - PotPlayer' };
    },
    clipboard: { readText: () => 'D:\\Course\\lesson.mp4', readImage: () => image },
    sleep: async () => {}
  });
  assert.equal(calls, 2);
  assert.equal(result.media.positionSeconds, 90);
  assert.equal(result.capture.transport, 'clipboard');
});
