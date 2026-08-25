'use strict';

const ResourceHubNextPlugin = require('./entry.cjs');
const { installScopedUiFixes } = require('./ui-fixes.cjs');
const { registerRememberedNoteTarget } = require('./note-target.cjs');
const { registerCompanionEventPoller } = require('./companion-events.cjs');

class ResourceHubNextRuntimePlugin extends ResourceHubNextPlugin {
  async onload() {
    await super.onload();
    registerRememberedNoteTarget(this);
    registerCompanionEventPoller(this);
    installScopedUiFixes(this);
  }
}

module.exports = ResourceHubNextRuntimePlugin;
