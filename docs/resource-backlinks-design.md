# Resource Backlinks Design v1

Status: **implementation baseline**

This document defines the first stable contract for Go Study resource backlinks. It is intentionally narrower than the long-term learning-context vision: v1 covers video resources, OpenList locators, PotPlayer bridging on Windows, note backlinks, capture insertion, relinking, and resume state.

## 1. Product goal

A note should remember **which learning resource** and **which learning position** it refers to, not the app, path, machine, or temporary playback URL used when the note was created.

Target flow:

```text
OpenList resource
  -> Go Study starts playback
  -> learner records position or capture + position
  -> Go Study inserts a permanent backlink into the active Obsidian note
  -> backlink is clicked later
  -> Go Study resolves the resource's current locator
  -> current device/player opens the resource at the recorded position
```

The backlink must survive:

- resource title edits;
- Obsidian restarts;
- OpenList connection URL changes;
- OpenList file/folder moves after relinking;
- future player changes (PotPlayer -> IINA/mpv);
- future OS changes (Windows -> macOS/Linux) once adapters exist.

## 2. Non-goals for v1

Do not expand this implementation into:

- macOS/Linux player adapters;
- PDF/page references;
- web selections;
- OCR or AI summaries;
- automatic full-cloud scans for moved files;
- automatic resource merges;
- removal of legacy `jv://` support;
- full removal/rewrite of markdown2potplayer.

The model must allow these later without changing v1 backlink semantics.

## 3. Core invariant: identity != location != position

### Resource identity

A Resource's existing `resource.id` is the durable identity. It must not change because a file is moved, renamed, re-resolved, or opened by a different player.

Do not introduce a second durable resource ID system.

### Locator

A locator answers **where the resource currently lives**. For OpenList v1:

```js
locator: {
  type: 'openlist',
  sourceId: 'source-main',
  remotePath: '/百度/课程/高数/17.mp4'
}
```

Locators are mutable.

### Position

A position answers **where learning happened inside the resource**. For video v1:

```js
position: {
  type: 'time',
  seconds: 5076
}
```

Future position kinds may include PDF pages, web selections, or Obsidian blocks without changing the resource identity contract.

## 4. Schema v2 target

Raise `SCHEMA_VERSION` from 1 to 2.

OpenList video resources should normalize toward:

```js
{
  id: 'res-x83hd92',
  kind: 'video',
  title: '高等数学 第17课',

  locator: {
    type: 'openlist',
    sourceId: 'source-main',
    remotePath: '/百度/课程/高数/17.mp4'
  },

  locatorHistory: [
    {
      type: 'openlist',
      sourceId: 'source-main',
      remotePath: '/百度/旧目录/17.mp4',
      changedAt: '2026-08-24T12:00:00.000Z'
    }
  ],

  identityHints: {
    fileName: '17.mp4',
    size: 5083123901,
    modified: ''
  },

  resume: {
    position: {
      type: 'time',
      seconds: 5076
    },
    updatedAt: '2026-08-24T12:00:00.000Z'
  }
}
```

### Migration rules

1. Existing `resource.id` values are preserved byte-for-byte.
2. Existing OpenList `sourceId` / `remotePath` data is migrated into `locator`.
3. Existing resource fields remain readable during the transition; migration must be additive first, destructive cleanup later.
4. Existing `canonicalKey` may continue to support discovery/deduplication, but must not be treated as the permanent resource identity.
5. Migration must be idempotent: normalizing an already-v2 state does not append duplicate history or change IDs.
6. Unknown/newer fields are preserved where current normalization already permits it.

## 5. Canonical key contract

`canonicalKey` is a **discovery/deduplication hint**, not a durable backlink target.

For an OpenList file, a path-derived canonical key may change after a move. That must not create a new durable identity when the user explicitly relinks the existing resource.

All backlink and resume code must target `resource.id`, never `canonicalKey` or `remotePath`.

## 6. Permanent Obsidian backlink protocol

Protocol action name:

```text
go-study
```

Treat this action name as a public compatibility contract once v1 backlinks are emitted.

v1 URI:

```text
obsidian://go-study?resource=<resourceId>&position=time%3A<seconds>&v=1
```

Example:

```text
obsidian://go-study?resource=res-x83hd92&position=time%3A5076&v=1
```

### Allowed v1 inputs

- `resource`: required existing Go Study resource ID.
- `position`: required `time:<non-negative finite seconds>` for video v1.
- `v`: required protocol version `1`.

### Explicitly forbidden public execution inputs

The handler must not accept arbitrary execution data such as:

- filesystem `path`;
- arbitrary `url`;
- `exe` / executable path;
- arbitrary `command`;
- player command-line fragments;
- OpenList credentials/tokens.

The URI identifies an existing Go Study resource. Resolution and launch happen only through trusted stored state and allowlisted adapters.

Unknown/invalid version, missing resource, malformed position, or missing resource ID must fail closed with a user-facing notice.

## 7. Resolver pipeline

Backlink resolution is always:

```text
Go Study URI
  -> validate protocol data
  -> resource.id lookup
  -> read current locator
  -> source resolver
  -> obtain current playable target
  -> platform/player adapter
  -> apply position
```

A note never resolves a file path directly.

For OpenList, do not persist temporary signed playback URLs as durable backlink data. Resolve the current playable URL when the user launches the resource.

## 8. Player adapter boundary

Go Study owns the user intent:

```js
play(resource, position)
getCurrentMedia()
getCurrentPosition()
captureFrame()
```

v1 implementation is Windows + PotPlayer. The upper layers must not require PotPlayer-specific values.

Future adapters may implement the same intent for IINA/mpv.

Legacy `jv://` remains an implementation/compatibility path on Windows, not the permanent note-link format.

## 9. PotPlayer Bridge boundary

Do not rewrite all markdown2potplayer behavior at once.

The bridge is responsible for player-facing/system-facing capabilities:

- identify current PotPlayer media;
- read current playback time;
- capture the current video frame;
- crop according to existing capture-region presets;
- preserve system-level hotkey capability when needed.

Go Study is responsible for:

- mapping current media/session to a Resource ID;
- creating/validating permanent backlinks;
- saving captures into the Vault;
- inserting Markdown into the active editor;
- updating resume state;
- relinking locators.

### Bridge security requirements before formal integration

The existing helper's listener must not be inherited unchanged. The formal bridge must:

- bind only to loopback (`127.0.0.1`, optionally `::1` later), never `0.0.0.0`;
- expose a fixed versioned API, not an arbitrary backlink runner;
- use structured JSON requests/responses;
- impose request/body size limits;
- authenticate requests with a local pairing/token mechanism;
- reject arbitrary executable/command/path execution.

Initial API target:

```text
GET  /v1/ping
POST /v1/current
POST /v1/capture
```

## 10. Note insertion UX

Commands:

- `Go Study: Insert current learning position`
- `Go Study: Capture frame and insert learning position`

The plugin should insert via the active Obsidian editor instead of simulating Ctrl+V.

Position-only example:

```md
[↗ 高等数学 · 01:24:36](obsidian://go-study?resource=res-x83hd92&position=time%3A5076&v=1)
```

Capture example:

```md
![[GoStudy/Captures/高等数学-01-24-36.png]]

[↗ 回到课程 · 01:24:36](obsidian://go-study?resource=res-x83hd92&position=time%3A5076&v=1)
```

Captures are Vault files so they remain portable with the Vault.

## 11. Media session v1

v1 prioritizes media launched from Go Study.

When Go Study launches a resource, record an active session containing at least:

```js
{
  resourceId: 'res-x83hd92',
  startedAt: '...',
  lastKnownPosition: null
}
```

When a record/capture command runs, verify the bridge's current media is consistent enough with the active session before inserting a backlink.

If media was opened outside Go Study and cannot be matched safely, do not guess. Offer explicit association with an existing resource in a later implementation step.

## 12. Resume v1

Recording a position updates the resource's resume state:

```js
resume: {
  position: { type: 'time', seconds: 5076 },
  updatedAt: '...'
}
```

v1 semantics are **last explicitly recorded/used learning position**, not continuous background playback tracking.

This state becomes the foundation for the later Today/Continue Learning UI.

## 13. Relink behavior

If the current locator fails:

1. show the resource title and old locator;
2. explain that it may have moved or been renamed;
3. allow the user to browse the configured OpenList source and select the new file;
4. preserve `resource.id`;
5. push the previous locator into `locatorHistory`;
6. update the current locator;
7. re-resolve the original backlink without changing note text.

Keep at most the 10 most recent locator-history entries per resource.

## 14. Folder-prefix remap

v1 should support a safe bulk remap for directory reorganizations.

Example:

```text
old: /百度/课程/高数/
new: /百度/大学/数学/高数/
```

Required behavior:

- compute a preview before writing;
- list counts for resolvable resources, missing targets, and conflicts;
- never silently overwrite another resource's locator;
- require explicit confirmation;
- update each resource independently while preserving IDs;
- push old locators into history.

No automatic resource merge in v1.

## 15. Device-local vs portable state

Portable/sync-worthy resource state includes:

- resource IDs;
- locators expressed as logical source + remote path;
- locator history;
- resume positions;
- note references/captures.

Device-specific state must not become part of permanent backlinks:

- player executable paths;
- PotPlayer vs IINA/mpv preference;
- local bridge token;
- Anki executable path;
- machine-specific mount roots;
- OS-protected encrypted credentials.

Do not assume Electron `safeStorage` ciphertext is portable between operating systems.

## 16. Compatibility policy

- Existing `jv://` links remain untouched and usable.
- New Go Study-generated backlinks use `obsidian://go-study` once v1 is enabled.
- Existing resources retain their IDs during schema migration.
- The `go-study` protocol action is treated as permanent once emitted.
- Protocol version `v=1` must remain parseable after future versions are added.

## 17. Implementation sequence

1. Audit every use of `resource.id`, `canonicalKey`, `launcher`, `sourceId`, and `remotePath`.
2. Implement schema v2 locator normalization/migration with regression tests.
3. Implement backlink URI builder/parser/validation with security tests.
4. Implement URI -> resource -> OpenList -> PotPlayer resolution.
5. Add media session state and editor insertion command.
6. Harden/integrate the local PotPlayer bridge.
7. Add capture + backlink insertion.
8. Add single-resource relink.
9. Add previewed folder-prefix remap.
10. Wire resume writes and run full regression/Windows acceptance.

## 18. Definition of done

v1 is done only when all of the following hold:

- OpenList video launched by Go Study still plays through the current Windows/PotPlayer path.
- Position command inserts a Go Study URI into the active note.
- Clicking the URI returns to the same resource and recorded time.
- Capture command saves a Vault image and inserts image + backlink.
- Resource title edits do not break backlinks.
- Obsidian restart does not break backlinks.
- Moving/renaming an OpenList resource causes a recoverable relink flow rather than permanent backlink death.
- Relinking preserves the original Resource ID and restores all old backlinks.
- Folder remap previews and safely updates multiple resources.
- Resume position is updated from the same position model.
- Legacy `jv://` behavior remains compatible.
- Existing tests remain green and new migration/protocol/relink/security tests are added.
