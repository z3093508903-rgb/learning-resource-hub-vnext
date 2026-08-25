# Go Study beta.9 — settings and immersive closeout

Beta.9 is a product-settings and immersive-workflow closeout build. It intentionally does **not** add timestamp/backlink template customization yet; those content-format details are the next product-polish stage after this acceptance round.

## Workbench settings

- show interface tips (existing setting)
- auto-collapse Obsidian sidebars when entering the Go Study workbench

## Optional video-note enhancement

The Windows/PotPlayer video-note layer is opt-in for normal users.

- master enable/disable toggle
- disabling releases all registered global hotkeys and removes the workbench status dot
- configurable Alt+1 / Alt+2 / Alt+3 / Alt+4 bindings; an empty binding disables that action
- duplicate bindings are rejected
- resume playback after Alt+3/Alt+4 save
- resume playback after Alt+3/Alt+4 cancel
- lightweight success feedback toggle; errors remain visible
- configurable Vault capture folder
- native status check
- screenshot-record acceptance button
- restore default shortcuts

The normal runtime no longer starts the Companion reverse-event poller. Native Windows PotPlayer control is the primary implementation.

## Data and safety settings

- automatic state-backup retention is configurable from 3 to 10 copies
- the existing ten-backup hard cap remains the maximum for this release line

## Acceptance

1. Install beta.9 and reload Obsidian.
2. Open Go Study settings. Video-note enhancement should be off by default for a state that has never configured it.
3. With enhancement off, Alt+1..Alt+4 must not be owned by Go Study and the workbench should show no immersive status dot.
4. Turn enhancement on. The four default shortcuts should register and the workbench status dot should appear.
5. Launch a PotPlayer video from Go Study and verify Alt+1..Alt+4 still work without AutoHotkey/markdown2potplayer.
6. Alt+3 and Alt+4 should resume playback after Enter by default; Esc should also resume by default. Disable each preference and verify the corresponding flow leaves the video paused.
7. Change the screenshot folder and verify the next Alt+2/Alt+4 PNG is created there.
8. Change one shortcut, reload Obsidian and verify it persists. Attempt a duplicate shortcut and verify the setting is rejected.
9. Toggle auto-collapse sidebars and verify workbench entry respects the preference.
10. Change backup retention to a value from 3 to 10 and verify it persists after restart.
