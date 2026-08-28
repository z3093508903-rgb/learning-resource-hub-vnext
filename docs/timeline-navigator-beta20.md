# beta20 · Lightweight Timeline Navigator

Status: VALIDATING

## Product intent

The floating timeline is an **optional video enhancement**, not a required Go Study surface.

- Default: off.
- Normal state: a very thin right-edge rail with subtle dots.
- Hover: expands only slightly.
- Background: transparent.
- No card-style container.
- Only appears in Markdown notes that actually contain Go Study timestamp backlinks.

## Mixed-video notes

One note may contain timestamps from multiple videos. The navigator parses the hidden Go Study backlink metadata and groups timestamps by source instead of merging unrelated video clocks into one fake timeline.

Sources resolve in this order:

1. Managed Resource ID → current resource title.
2. Freeform that uniquely upgrades to a Managed Resource → current resource title.
3. Freeform hidden media title.
4. Freeform portable filename / web host fallback.

## Click behavior

- Click → existing Go Study playback path.
- Ctrl/Cmd + click → supported browser source at captured time.
- Bilibili → preserve `p` and apply `t=<seconds>`.

## Markdown boundary

Visible Markdown stays clean. New Freeform captures may store an optional hidden `title` field inside the `obsidian://go-study` URI so the navigator can remember where a timestamp came from.

## Acceptance focus

1. rail is visually quiet;
2. hover expansion is lightweight;
3. mixed-video grouping is correct;
4. click jump is correct;
5. Ctrl-click Bilibili jump is correct;
6. toggle removes/restores the rail immediately;
7. Companion window remains usable and uncluttered.
