'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const {
  PREFERRED_ANKI_SHORTCUT,
  ankiExecutableCandidates,
  cleanExecutablePath,
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
} = require('../src/anki-launch.cjs');

test('Anki executable discovery accepts quoted configured paths', () => {
  assert.equal(cleanExecutablePath('  "D:\\Apps\\Anki\\launcher.exe"  '), 'D:\\Apps\\Anki\\launcher.exe');
});

test('Anki executable discovery prefers the known working Start Menu shortcut', () => {
  const candidates = ankiExecutableCandidates('D:\\Apps\\Anki\\anki.exe', {});
  assert.equal(candidates[0], PREFERRED_ANKI_SHORTCUT);
  const resolved = resolveAnkiExecutable('D:\\Apps\\Anki\\anki.exe', {
    env: {},
    existsSync: (candidate) => candidate === PREFERRED_ANKI_SHORTCUT || candidate === 'D:\\Apps\\Anki\\anki.exe'
  });
  assert.equal(resolved, PREFERRED_ANKI_SHORTCUT);
});

test('Anki executable discovery covers both classic anki.exe and launcher-era installs', () => {
  const env = {
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)'
  };
  const candidates = ankiExecutableCandidates('', env).map((value) => value.replace(/\\/g, '/').toLowerCase());
  assert.ok(candidates.some((value) => value.endsWith('/programs/anki/anki.exe')));
  assert.ok(candidates.some((value) => value.endsWith('/programs/anki/launcher.exe')));
  assert.ok(candidates.some((value) => value.endsWith('/programs/anki/anki-console.exe')));
});

test('Anki executable resolution falls back to launcher.exe when shortcut and anki.exe are absent', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local', ProgramFiles: '', 'ProgramFiles(x86)': '' };
  const expected = ankiExecutableCandidates('', env).find((value) => path.basename(value).toLowerCase() === 'launcher.exe');
  const resolved = resolveAnkiExecutable('', {
    env,
    existsSync: (candidate) => candidate === expected
  });
  assert.equal(resolved, expected);
});

test('Anki profile launch skips shortcuts that cannot receive profile arguments', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local', ProgramFiles: '', 'ProgramFiles(x86)': '' };
  const launcher = ankiExecutableCandidates('', env).find((value) => path.basename(value).toLowerCase() === 'launcher.exe');
  const resolved = resolveAnkiProfileExecutable('', {
    env,
    existsSync: (candidate) => candidate === PREFERRED_ANKI_SHORTCUT || candidate === launcher
  });
  assert.equal(resolved, launcher);
});

test('Anki process launch surfaces spawn success and detaches the child', async () => {
  const child = new EventEmitter();
  let unrefCalled = false;
  child.unref = () => { unrefCalled = true; };
  let invocation = null;
  const promise = launchAnkiProcess('C:\\Anki\\launcher.exe', ['-p', 'User 1'], {
    spawn: (executable, args, options) => {
      invocation = { executable, args, options };
      process.nextTick(() => child.emit('spawn'));
      return child;
    }
  });
  const launched = await promise;
  assert.equal(launched, child);
  assert.equal(invocation.executable, 'C:\\Anki\\launcher.exe');
  assert.deepEqual(invocation.args, ['-p', 'User 1']);
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.stdio, 'ignore');
  assert.equal(unrefCalled, true);
});
