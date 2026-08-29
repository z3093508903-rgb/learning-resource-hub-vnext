# Go Study Bilibili Bridge

Optional browser helper for Go Study.

## What it does

When a Bilibili video page is the active browser tab, this tiny extension reports only:

- current Bilibili video URL
- page/video title
- current playback time
- pause/visibility/focus state

to the Go Study Obsidian plugin on `127.0.0.1:27124`.

It does **not** read your Obsidian notes and does not send data to the internet.

## Temporary install for Preview testing

Chrome / Edge:

1. Open the extensions management page.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this `bilibili-bridge` folder.
5. Keep Go Study Preview enabled in Obsidian.
6. Open a Bilibili video and keep that tab in the foreground.
7. Use the existing Go Study HUD hotkey.

Web mode currently supports timestamp, note, and note + timestamp actions. Screenshot actions remain PotPlayer-only.
