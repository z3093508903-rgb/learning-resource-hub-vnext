import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(projectRoot, 'src');
const entryPath = path.join(sourceRoot, 'entry.cjs');
const outputPath = path.join(projectRoot, 'main.js');
const localRequirePattern = /require\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g;

const modules = new Map();

function toModuleId(filePath) {
  return path.relative(sourceRoot, filePath).split(path.sep).join('/');
}

function assertInsideSourceRoot(filePath) {
  const relative = path.relative(sourceRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Local module escapes src/: ${filePath}`);
  }
}

function resolveLocalModule(fromPath, request) {
  const resolved = path.resolve(path.dirname(fromPath), request);
  assertInsideSourceRoot(resolved);
  return resolved;
}

async function collectModule(filePath) {
  const id = toModuleId(filePath);
  if (modules.has(id)) return;

  const source = await readFile(filePath, 'utf8');
  const dependencies = [];
  for (const match of source.matchAll(localRequirePattern)) {
    dependencies.push(resolveLocalModule(filePath, match[2]));
  }

  for (const dependency of dependencies) {
    await collectModule(dependency);
  }

  const transformed = source.replace(localRequirePattern, (_match, _quote, request) => {
    const dependency = resolveLocalModule(filePath, request);
    return `__rhLoad(${JSON.stringify(toModuleId(dependency))})`;
  });

  modules.set(id, transformed);
}

await collectModule(entryPath);

const moduleTable = [...modules.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([id, source]) => `${JSON.stringify(id)}: (module, exports, require) => {\n${source}\n}`)
  .join(',\n');

const output = `'use strict';\n\nconst __rhModules = {\n${moduleTable}\n};\nconst __rhCache = new Map();\n\nfunction __rhLoad(id) {\n  if (__rhCache.has(id)) return __rhCache.get(id).exports;\n  const factory = __rhModules[id];\n  if (!factory) throw new Error(\`Bundled module not found: \${id}\`);\n  const bundledModule = { exports: {} };\n  __rhCache.set(id, bundledModule);\n  factory(bundledModule, bundledModule.exports, require);\n  return bundledModule.exports;\n}\n\nmodule.exports = __rhLoad('entry.cjs');\n`;

await writeFile(outputPath, output, 'utf8');
console.log(`Built main.js from ${modules.size} source modules (${Buffer.byteLength(output)} bytes)`);
