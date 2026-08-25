'use strict';

const ResourceHubNextPlugin = require('./entry.cjs');
const { installScopedUiFixes } = require('./ui-fixes.cjs');

class ResourceHubNextRuntimePlugin extends ResourceHubNextPlugin {
  async onload() {
    await super.onload();
    installScopedUiFixes(this);
  }
}

module.exports = ResourceHubNextRuntimePlugin;
