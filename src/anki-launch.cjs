'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PREFERRED_ANKI_SHORTCUT = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Anki\\Anki.lnk';

function cleanExecutablePath(value) {
  return String(value || '').trim().replace(/^"([\s\S]*)"$/, '$1');
}

function ankiExecutableCandidates(configured = '', env = process.env) {
  const localAppData = String(env.LOCALAPPDATA || '').trim();
  const programFiles = String(env.ProgramFiles || 'C:\\Program Files').trim();
  const programFilesX86 = String(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').trim();
  const installRoots = [
    localAppData ? path.join(localAppData, 'Programs', 'Anki') : '',
    programFiles ? path.join(programFiles, 'Anki') : '',
    programFilesX86 ? path.join(programFilesX86, 'Anki') : ''
  ].filter(Boolean);

  const candidates = [
    PREFERRED_ANKI_SHORTCUT,
    cleanExecutablePath(configured)
  ];
  for (const root of installRoots) {
    candidates.push(
      path.join(root, 'anki.exe'),
      path.join(root, 'launcher.exe'),
      path.join(root, 'anki-console.exe')
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

function resolveAnkiExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next known installation shape. */ }
  }
  return '';
}

function resolveAnkiProfileExecutable(configured = '', options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const env = options.env || process.env;
  for (const candidate of ankiExecutableCandidates(configured, env)) {
    if (!/\.exe$/i.test(candidate)) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* Continue with the next executable candidate. */ }
  }
  return '';
}

function launchAnkiProcess(executable, args = [], options = {}) {
  const spawnProcess = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch (error) {
      reject(new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      child?.removeListener?.('spawn', onSpawn);
      child?.removeListener?.('error', onError);
      callback(value);
    };
    const onSpawn = () => {
      child?.unref?.();
      finish(resolve, child);
    };
    const onError = (error) => finish(reject, new Error(`无法启动 Anki：${error instanceof Error ? error.message : String(error)}`));

    if (typeof child?.once === 'function') {
      child.once('spawn', onSpawn);
      child.once('error', onError);
    } else {
      child?.unref?.();
      finish(resolve, child);
    }
  });
}

module.exports = {
  PREFERRED_ANKI_SHORTCUT,
  ankiExecutableCandidates,
  cleanExecutablePath,
  launchAnkiProcess,
  resolveAnkiExecutable,
  resolveAnkiProfileExecutable
};
