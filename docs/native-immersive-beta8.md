# Native immersive workflow — beta.8

Beta.8 changes the Windows video-note path from an external-helper-first design to a plugin-native-first design.

## Native shortcuts

- Alt+1 — insert permanent backlink at the remembered Markdown cursor
- Alt+2 — capture PotPlayer frame + permanent backlink
- Alt+3 — pause PotPlayer, show lightweight note prompt, Enter inserts note + backlink
- Alt+4 — pause/capture PotPlayer, show lightweight note prompt, Enter inserts image + note + backlink

Shift+Enter adds a newline. Escape cancels the prompt.

## Dependency rule

The immersive hotkey path uses the plugin-owned native Windows adapter (`src/native-potplayer.cjs`) with PowerShell/User32 window messages and Electron global shortcuts. The existing Companion File IPC remains temporarily as compatibility fallback for older Preview builds, but beta.8 acceptance must be performed with markdown2potplayer / AutoHotkey fully exited so native behavior cannot be masked.

## UI rule

The beta.7 full-width Learning Controls strip is removed. Persistent project UI remains unchanged apart from a lightweight status dot in the existing header actions. OpenList course relink actions are exposed from the project heading context menu. Screenshot testing and shortcut editing live in the plugin settings page.

## Fail-closed behavior

- a remembered Markdown target must still be valid
- PotPlayer must be the foreground window for native hotkey operations
- media identity still passes through the existing Resource ↔ current media guard
- Alt+3/Alt+4 do not write anything when the note prompt is cancelled
- Alt+4 keeps the captured frame in memory until the user confirms, so cancel does not create an orphan Vault image
