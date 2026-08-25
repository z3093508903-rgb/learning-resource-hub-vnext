# Go Study Immersive Controls v1

## Product boundary

Go Study remains fully useful as a standalone resource manager and learning launcher. The Windows/PotPlayer video-note layer is an **optional enhancement** for users who want immersive capture and note workflows.

Normal resource-management functions must not depend on PotPlayer, AutoHotkey, markdown2potplayer, or any external helper.

## Windows immersive controls

When video-note enhancement is enabled:

- `Alt+1` — insert current permanent resource backlink
- `Alt+2` — capture current PotPlayer frame + permanent backlink
- `Alt+3` — pause, open lightweight note input, Enter inserts note + backlink
- `Alt+4` — pause/capture, open lightweight note input, Enter inserts image + note + backlink

`Shift+Enter` adds a newline. `Esc` cancels.

The hotkeys are configurable and can be disabled individually with an empty binding. Duplicate bindings are rejected.

## Native implementation

The normal runtime uses the plugin-owned Windows adapter:

```text
Go Study
  ↓
Electron global shortcut
  ↓
fixed PowerShell/User32 PotPlayer window messages
  ↓
PotPlayer state / position / clipboard frame
  ↓
Go Study resource identity guard
  ↓
remembered Markdown editor cursor
```

The runtime no longer starts the old Companion reverse-event poller. The Companion/File IPC implementation remains in repository history and tests for compatibility/reference while this feature branch is being finalized, but it is not a normal runtime dependency.

## Settings

### Workbench

- show interface tips
- auto-collapse Obsidian sidebars on workbench entry

### Video-note enhancement

- master enable/disable toggle (opt-in)
- configurable Alt+1..Alt+4
- resume after note save
- resume after note cancel
- lightweight success-feedback toggle
- configurable Vault screenshot folder
- native status check
- screenshot acceptance action
- restore default shortcuts

When the master toggle is off, Go Study releases registered immersive hotkeys and hides the workbench status dot.

### Data and safety

- automatic state-backup retention: 3..10 copies

## Note target safety

Go Study remembers the last valid Markdown editor/cursor. It does **not** silently redirect an immersive action into a different note if the remembered note is closed or invalid.

## Media identity safety

The current PotPlayer media must match the active Go Study Resource. Resource ID, locator and learning position remain separate concepts. A mismatch fails closed before modifying the Markdown editor.

## UI rule

Do not restore the beta.7 full-width Learning Controls strip. The main workbench keeps its original layout. Video enhancement appears only as a lightweight status dot when enabled; OpenList relink actions live in the project-page context menu; video diagnostics and configuration live in plugin settings.

## Deferred product polish

Timestamp/backlink templates, note-format templates and related Markdown-format customization are intentionally deferred until this runtime/settings closeout is accepted.
