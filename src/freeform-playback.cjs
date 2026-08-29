'use strict';

const { normalizeFreeformLocator } = require('./resource-reference.cjs');
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'
]);

function locatorKind(locator) {
  const raw = normalizeFreeformLocator(locator);
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'web';
  } catch {}
  if (/^[A-Za-z]:[\\/]/.test(raw) || /^\\\\[^\\]+\\[^\\]+/.test(raw)) return 'windows-local';
  if (/^\//.test(raw)) return 'posix-local';
  return 'unknown';
}

function localVideoAllowed(locator) {
  const name = String(locator || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  const ext = name.includes('.') ? name.split('.').pop().toLocaleLowerCase() : '';
  return VIDEO_EXTENSIONS.has(ext);
}

async function openPortableFreeformReference(reference, options = {}) {
  const locator = normalizeFreeformLocator(reference?.locator ?? reference?.path);
  const kind = locatorKind(locator);
  const platform = String(options.platform || process.platform);

  if (platform === 'win32') {
    if (kind !== 'web' && kind !== 'windows-local') {
      throw new Error('这个本地视频链接来自另一平台；请先在当前设备收录同一视频，或等待路径映射功能。');
    }
    if (kind === 'windows-local' && !localVideoAllowed(locator)) {
      throw new Error('Go Study 自由回链只允许打开受支持的视频文件。');
    }
    const launcher = options.launchPotPlayerTarget || require('./native-potplayer.cjs').launchPotPlayerTarget;
    const launched = await launcher(locator, reference.position, options.launchOptions || {});
    return {
      transport: launched?.transport || 'native-potplayer-cli',
      positionApplied: launched?.positionApplied !== false,
      locator
    };
  }

  const shellImpl = options.shell || (() => {
    try { return require('electron').shell; }
    catch { throw new Error('当前运行环境无法访问系统打开能力。'); }
  })();

  if (kind === 'web') {
    await shellImpl.openExternal(locator);
    return { transport: 'browser', positionApplied: false, locator };
  }

  if (!localVideoAllowed(locator)) throw new Error('Go Study 自由回链只允许打开受支持的视频文件。');

  if (platform === 'darwin' || platform === 'linux') {
    if (kind !== 'posix-local') {
      throw new Error('这个本地视频链接来自 Windows；请先在当前设备收录同一视频，或等待路径映射功能。');
    }
    const error = await shellImpl.openPath(locator);
    if (error) throw new Error(error);
    return { transport: 'system-player', positionApplied: false, locator };
  }

  throw new Error('当前平台暂不支持直接打开未收录本地视频：' + platform);
}

module.exports = {
  VIDEO_EXTENSIONS,
  localVideoAllowed,
  locatorKind,
  openPortableFreeformReference
};
