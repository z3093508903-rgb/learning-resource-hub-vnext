import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const strict = process.argv.includes('--strict') || process.env.RELEASE_STRICT === '1';
const releaseTag = String(process.env.RELEASE_TAG || '').trim();
const failures = [];
const checks = [];

function pass(label) {
  checks.push({ ok: true, label });
}

function fail(label, detail = '') {
  checks.push({ ok: false, label });
  failures.push(detail ? `${label}: ${detail}` : label);
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    fail(`读取 ${relativePath}`, error.message || String(error));
    return null;
  }
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

for (const file of ['README.md', 'LICENSE', 'manifest.json', 'main.js', 'styles.css']) {
  if (exists(file)) pass(`存在 ${file}`);
  else fail(`存在 ${file}`, '发布所需文件缺失');
}

if (manifest && pkg) {
  if (manifest.version === pkg.version) pass('manifest/package 版本一致');
  else fail('manifest/package 版本一致', `${manifest.version} != ${pkg.version}`);

  const semver = strict
    ? /^\d+\.\d+\.\d+$/
    : /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (semver.test(String(manifest.version || ''))) pass(strict ? '正式版本号为 x.y.z' : '版本号格式有效');
  else fail(strict ? '正式版本号为 x.y.z' : '版本号格式有效', String(manifest.version || ''));

  const pluginId = String(manifest.id || '');
  if (/^[a-z0-9-]+$/.test(pluginId) && !pluginId.includes('obsidian')) pass('插件 ID 格式有效');
  else fail('插件 ID 格式有效', pluginId || '<empty>');

  if (manifest.isDesktopOnly === true) pass('桌面端声明已启用');
  else fail('桌面端声明已启用', '当前代码使用 Node/Electron API，应保持 isDesktopOnly=true');

  if (releaseTag) {
    if (releaseTag === manifest.version) pass('Git tag 与 manifest version 一致');
    else fail('Git tag 与 manifest version 一致', `${releaseTag} != ${manifest.version}`);
  } else if (strict) {
    fail('Git tag 与 manifest version 一致', '严格发布检查需要 RELEASE_TAG');
  }
}

const forbiddenExact = [
  'data.json',
  '.deploy.local.json',
  '.env'
];
for (const relativePath of forbiddenExact) {
  if (!exists(relativePath)) pass(`未包含敏感文件 ${relativePath}`);
  else fail(`未包含敏感文件 ${relativePath}`, '请从发布工作区删除');
}

const forbiddenExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.secret']);
function walk(dir, relative = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'deploy-backups') continue;
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, nextRelative);
    else if (forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) {
      fail(`未包含敏感扩展文件`, nextRelative);
    }
  }
}
walk(root);
if (!failures.some((item) => item.startsWith('未包含敏感扩展文件'))) pass('未发现敏感扩展文件');

if (exists('main.js')) {
  const built = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  if (built.includes('src/entry.cjs') || built.includes('ResourceHubNextPlugin')) pass('main.js 看起来是有效插件构建');
  else fail('main.js 看起来是有效插件构建', '未找到预期入口标记');
}

for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.label}`);

if (failures.length) {
  console.error('\nRelease check failed:');
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`\n${strict ? 'Strict release check passed.' : 'Release readiness check passed.'}`);
}
