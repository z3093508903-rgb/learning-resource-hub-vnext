'use strict';

const ResourceHubNextPlugin = require('./entry.cjs');
const { installScopedUiFixes } = require('./ui-fixes.cjs');
const { registerRememberedNoteTarget } = require('./note-target.cjs');
const { registerCompanionEventPoller } = require('./companion-events.cjs');
const { registerImmersiveHotkeys } = require('./immersive-hotkeys.cjs');
const { installLearningControls } = require('./learning-controls-ui.cjs');

class ResourceHubNextRuntimePlugin extends ResourceHubNextPlugin {
  async onload() {
    await super.onload();
    registerRememberedNoteTarget(this);
    registerImmersiveHotkeys(this);
    // Compatibility fallback only. Native Windows mode no longer requires the AHK companion.
    registerCompanionEventPoller(this);
    installScopedUiFixes(this);
    installLearningControls(this);
  }
}

module.exports = ResourceHubNextRuntimePlugin;
