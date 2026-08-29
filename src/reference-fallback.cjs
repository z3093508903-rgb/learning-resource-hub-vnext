'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { recoveryEntries } = require('./state-safety.cjs');
const {
  matchingManagedResource,
  matchingManagedResourceByPortableName
} = require('./media-session.cjs');

function httpLocator(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function recoveredStateFiles(plugin) {
  const files = [];
  for (const entry of recoveryEntries(plugin)) files.push(entry.fullPath);

  const basePath = plugin?.app?.vault?.adapter?.getBasePath?.();
  const configDir = plugin?.app?.vault?.configDir || '.obsidian';
  if (basePath) {
    for (const id of [
      plugin?.manifest?.id,
      'go-study-preview',
      'learning-resource-hub-next'
    ].filter(Boolean)) {
      const dir = path.join(basePath, configDir, 'plugins', id);
      const dataPath = path.join(dir, 'data.json');
      if (fs.existsSync(dataPath)) files.push(dataPath);
      const backupDir = path.join(dir, 'backups');
      if (fs.existsSync(backupDir)) {
        try {
          const names = fs.readdirSync(backupDir)
            .filter((name) => /\.json$/i.test(name))
            .sort()
            .reverse();
          for (const name of names) files.push(path.join(backupDir, name));
        } catch {}
      }
    }
  }
  return [...new Set(files)];
}

function recoveredResourceById(plugin, resourceId) {
  const id = String(resourceId || '').trim();
  if (!id) return null;
  for (const filePath of recoveredStateFiles(plugin)) {
    try {
      const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const resource = state?.resources?.[id];
      if (resource && !resource.deletedAt) return { resource, state, filePath };
    } catch {}
  }
  return null;
}

function currentResourceForReference(plugin, reference) {
  const exact = plugin?.state?.resources?.[String(reference?.resourceId || '')];
  if (exact && !exact.deletedAt) return exact;

  const resolveActions = (resource) => plugin?.resourceActions?.(resource) || {};
  if (reference?.locator) {
    try {
      const matched = matchingManagedResource(plugin?.state, reference.locator, resolveActions);
      if (matched) return matched;
    } catch {}
  }
  if (reference?.name) {
    try {
      const matched = matchingManagedResourceByPortableName(plugin?.state, reference.name, resolveActions);
      if (matched) return matched;
    } catch {}
  }
  return null;
}

function fallbackFreeformReference(reference) {
  const locator = String(reference?.locator || reference?.web || '').trim();
  if (!locator) return null;
  return {
    mode: 'freeform',
    locator,
    name: String(reference?.name || '').trim(),
    title: String(reference?.title || '').trim(),
    web: String(reference?.web || httpLocator(locator) || '').trim(),
    position: reference.position,
    version: 2
  };
}

function resourceBrowserUrl(plugin, resource, stateOverride = null) {
  if (!resource) return '';
  const metadata = resource.metadata || {};
  const direct = [
    metadata.sourceUrl,
    metadata.originalUrl,
    metadata.web,
    resource.launcher?.type === 'potplayer' ? resource.launcher.target : '',
    resource.launcher?.type === 'uri' ? resource.launcher.uri : ''
  ].map(httpLocator).find(Boolean);
  if (direct) return direct;

  try {
    if (stateOverride && plugin?.state && stateOverride !== plugin.state) {
      const model = require('./model.cjs');
      const actions = model.resolveResourceActions(resource, stateOverride.sources || {});
      return httpLocator(actions?.webTarget)
        || httpLocator(actions?.playTarget?.target)
        || httpLocator(actions?.playTarget?.uri)
        || '';
    }
    const actions = plugin?.resourceActions?.(resource) || {};
    return httpLocator(actions.webTarget)
      || httpLocator(actions.playTarget?.target)
      || httpLocator(actions.playTarget?.uri)
      || '';
  } catch { return ''; }
}

function browserUrlForReference(plugin, reference) {
  if (reference?.mode === 'freeform') {
    return httpLocator(reference.web) || httpLocator(reference.locator);
  }
  const current = currentResourceForReference(plugin, reference);
  if (current) return resourceBrowserUrl(plugin, current);
  const inline = httpLocator(reference?.web) || httpLocator(reference?.locator);
  if (inline) return inline;
  const recovered = recoveredResourceById(plugin, reference?.resourceId);
  return recovered ? resourceBrowserUrl(plugin, recovered.resource, recovered.state) : '';
}

module.exports = {
  browserUrlForReference,
  currentResourceForReference,
  fallbackFreeformReference,
  httpLocator,
  recoveredResourceById,
  recoveredStateFiles,
  resourceBrowserUrl
};
