# Go Study Immersive Controls v1

## Product split

Go Study must remain useful as a standalone desktop learning-resource manager. The optional Windows companion adds immersive video-note controls, but core resource browsing, projects, OpenList, Bilibili, Anki, Resume, backlinks, relink and folder migration must continue to work without the companion.

## v1 user experience

### Standalone mode
- visible Go Study controls for record position, capture+record, course-folder relink, single-file repair and Bridge status
- command palette entries remain as fallback only
- no companion required for normal resource management

### Enhanced video-note mode
- PotPlayer can remain foreground
- Alt+1 records the current learning position into the remembered Markdown note/cursor
- Alt+2 captures the current video frame and inserts image + permanent backlink
- Obsidian must not be foregrounded and no Ctrl+V automation is used
- success feedback should be brief and non-blocking; failure must be explicit

## Architecture

Go Study owns:
- Resource ID / locator / resume position
- backlink format
- note formatting and Vault writes
- remembered Markdown target
- visible controls and status UI
- companion event validation

Go Study Companion owns only:
- Windows global hotkeys
- PotPlayer current media / time
- PotPlayer frame capture
- fixed action events to Go Study

The companion must not send arbitrary commands, executable paths, arbitrary Markdown, or arbitrary filesystem writes.

## IPC

Keep authenticated File IPC v2 for Go Study -> Companion requests.
Add a reverse event queue for Companion -> Go Study actions.
Allowed event actions in v1:
- insert-position
- capture-position

Events use the existing local pairing token and unique IDs. Go Study acknowledges processed events so hotkey feedback can distinguish success/failure.

## Remembered note target

Go Study remembers the most recently focused editable Markdown editor and cursor/selection while Obsidian is active. When Obsidian goes to background, immersive actions target that remembered editor.

Fail closed when:
- the target note is closed or no longer editable
- the remembered editor belongs to a different Vault/session
- the target cannot be resolved safely

Never silently redirect an immersive action into another note.

## Visible controls

A compact Learning Controls area should expose:
- Bridge status
- Record position
- Capture + record
- Relink course folder
- Single-file repair (Advanced)
- Shortcut settings

Ctrl+P commands remain available but are no longer the primary UX.

## Default Windows shortcuts

- Alt+1: Record position
- Alt+2: Capture + record

They are configurable and limited to PotPlayer foreground by default.

## Delivery stages

1. Remembered Markdown editor/cursor target
2. Reverse File IPC event contract + acknowledgement
3. Companion Alt+1 / Alt+2 actions
4. Background note insertion without focus stealing
5. Visible Learning Controls UI
6. Shortcut configuration and Bridge state
7. Non-blocking success/failure feedback
8. Windows acceptance tests and isolated Preview build

## Non-goals for v1

- no AI summaries
- no full player inside Obsidian
- no macOS/Linux global-hotkey implementation yet
- no auto-downloading/installing a companion binary
- no removal of legacy markdown2potplayer behavior until the new companion path is proven stable
