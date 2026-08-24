# Resource Backlinks v1 Test Matrix

This matrix is the acceptance contract for `feature/resource-backlinks`.

Legend:
- **Unit**: pure model/protocol behavior.
- **Integration**: plugin/module interaction in the test harness.
- **Manual**: real Obsidian/Windows/PotPlayer/OpenList acceptance.

## A. Schema v2 migration

| ID | Scenario | Type | Expected |
|---|---|---|---|
| A1 | v1 OpenList resource is normalized to v2 | Unit | Same `resource.id`; locator contains original source/path |
| A2 | v1 non-OpenList resource is normalized | Unit | No unrelated behavior changes |
| A3 | v2 state is normalized again | Unit | Idempotent; no duplicate locator history |
| A4 | Resource title changes | Unit | Resource ID and backlinks remain valid |
| A5 | Path-derived canonicalKey changes | Unit | Durable resource ID remains unchanged |
| A6 | Existing alpha user data loads after migration | Integration | Projects/modules/resources remain linked |
| A7 | Save + reload migrated state | Integration | v2 locator/resume data persists |

## B. Backlink URI format and security

| ID | Scenario | Type | Expected |
|---|---|---|---|
| B1 | Build video backlink | Unit | Stable `obsidian://go-study?...&v=1` URI |
| B2 | Parse valid video backlink | Unit | Returns resource ID + `{type:'time', seconds}` |
| B3 | Zero seconds | Unit | Accepted |
| B4 | Negative seconds | Unit | Rejected |
| B5 | NaN/Infinity/malformed time | Unit | Rejected |
| B6 | Missing resource ID | Unit | Rejected |
| B7 | Unknown protocol version | Unit | Rejected/fails closed |
| B8 | Arbitrary `path` parameter | Unit | Ignored or rejected; never executed |
| B9 | Arbitrary `url` parameter | Unit | Ignored or rejected; never launched directly |
| B10 | `exe`/`command` payload | Unit | Rejected; no process execution |
| B11 | Unknown resource ID | Integration | User-facing notice; no launch |

## C. Resolver / launch lifecycle

| ID | Scenario | Type | Expected |
|---|---|---|---|
| C1 | Valid resource + valid OpenList locator | Integration | Current playable target resolved |
| C2 | Valid resource + time position | Integration | Player adapter receives same resource + seconds |
| C3 | Temporary OpenList URL changes | Integration | Backlink still works because URL is re-resolved |
| C4 | OpenList source connection URL changes | Integration | Resource ID/backlink unchanged |
| C5 | Resource title changes | Integration | Backlink still launches current resource |
| C6 | Obsidian restart | Manual | Existing backlink still resolves |
| C7 | Legacy `jv://` link | Manual | Existing behavior remains usable |

## D. Active media session / note insertion

| ID | Scenario | Type | Expected |
|---|---|---|---|
| D1 | Go Study launches a video | Integration | Active session stores resource ID |
| D2 | Record position on active session | Integration | Correct URI inserted into active editor |
| D3 | Record at 01:24:36 | Integration | Position saved as 5076 seconds |
| D4 | No active editor | Integration | Clear notice; no corrupted write |
| D5 | No active media session | Integration | Does not guess resource; clear notice |
| D6 | Bridge media conflicts with active session | Integration | Fails safely / asks for association, no wrong backlink |
| D7 | Record position | Integration | Resource resume state updates to same position |

## E. Capture lifecycle

| ID | Scenario | Type | Expected |
|---|---|---|---|
| E1 | Capture current frame | Manual | PotPlayer current video frame captured |
| E2 | Capture with full-frame preset | Manual | Full frame saved |
| E3 | Capture with region preset | Manual | Existing crop semantics preserved |
| E4 | Save capture into Vault | Integration | File stored below configured Go Study capture folder |
| E5 | Insert capture + backlink | Integration | Markdown image embed and backlink inserted together |
| E6 | Restart/sync Vault | Manual | Capture remains visible as normal Vault attachment |
| E7 | Capture failure | Integration | No broken Markdown/image placeholder inserted |

## F. Bridge security

| ID | Scenario | Type | Expected |
|---|---|---|---|
| F1 | Bind bridge listener | Manual | Loopback only; not `0.0.0.0` |
| F2 | Request without pairing token | Integration | Rejected |
| F3 | Invalid pairing token | Integration | Rejected |
| F4 | Valid token + `/v1/ping` | Integration | Version response only |
| F5 | Oversized request/body | Integration | Rejected before processing |
| F6 | Unknown endpoint | Integration | Rejected |
| F7 | Arbitrary command/path field | Integration | Never passed to `Run`/process launch |
| F8 | Bridge not running | Integration | Clear recoverable notice |

## G. Single-resource relink

| ID | Scenario | Type | Expected |
|---|---|---|---|
| G1 | OpenList path still exists | Integration | Normal launch; no relink UI |
| G2 | File moved | Integration | Resolver reports missing locator and offers relink |
| G3 | User selects new path | Integration | Same Resource ID, locator updated |
| G4 | Relink succeeds | Integration | Old backlink works without note edit |
| G5 | Old locator history | Unit | Previous locator appended once |
| G6 | More than 10 history entries | Unit | Only 10 newest retained |
| G7 | User cancels relink | Integration | No state mutation |
| G8 | New path belongs to another resource | Integration | Conflict shown; no silent merge |

## H. Folder-prefix remap

| ID | Scenario | Type | Expected |
|---|---|---|---|
| H1 | Preview old-prefix -> new-prefix | Unit | No state mutation |
| H2 | Multiple resources under old prefix | Unit | Correct candidate count |
| H3 | Target missing | Integration | Listed as missing; not silently rewritten |
| H4 | Target conflicts with another resource | Integration | Listed as conflict |
| H5 | User confirms valid preview | Integration | Only approved resources update |
| H6 | User cancels preview | Integration | No state mutation |
| H7 | Remapped resources | Unit | IDs unchanged; locator history updated |
| H8 | Old backlinks after remap | Integration | Resolve through new locators |

## I. Resume behavior

| ID | Scenario | Type | Expected |
|---|---|---|---|
| I1 | Explicit position record | Unit | `resume.position` updated |
| I2 | Backlink launch at explicit time | Integration | Resume updated according to v1 semantics |
| I3 | Resource moved/relinked | Unit | Resume survives locator change |
| I4 | Resource title changed | Unit | Resume survives title change |
| I5 | Restart | Integration | Resume persists |

## J. Cross-ecosystem invariants (architecture acceptance)

These are mostly contract tests in v1; macOS/Linux launch adapters are future work.

| ID | Scenario | Type | Expected |
|---|---|---|---|
| J1 | Backlink contains Windows path | Unit | Must be false |
| J2 | Backlink contains PotPlayer executable/protocol data | Unit | Must be false |
| J3 | Backlink contains temporary OpenList playback URL | Unit | Must be false |
| J4 | Resource stores logical OpenList source + remote path | Unit | True |
| J5 | Player preference changes | Unit | Backlink string unchanged |
| J6 | Future adapter receives generic time position | Unit | No PotPlayer-specific position encoding required |

## K. Existing-product regression

Before feature PR is review-ready:

- all pre-existing tests must remain green;
- release readiness checker must remain green;
- committed `main.js` must match source build;
- Vault rename/delete/create regression tests remain green;
- Anki cold-start logic/tests remain green;
- OpenList browse/play behavior remains green;
- Bilibili fallback behavior remains green;
- backup/restore tests remain green.

Baseline from `release-hardening`: **144 / 144 tests passing**.

## L. Windows manual acceptance checklist

Run in a real Windows + Obsidian Vault before merging:

- [ ] Start plugin from cold Obsidian launch.
- [ ] Start an OpenList video from Go Study.
- [ ] Confirm Quark/Baidu-backed OpenList playback still opens PotPlayer.
- [ ] Record a position and verify backlink Markdown appears at cursor.
- [ ] Click backlink and verify same video + same timestamp.
- [ ] Capture full frame + backlink.
- [ ] Capture configured crop region + backlink.
- [ ] Restart Obsidian and re-open old backlink.
- [ ] Rename resource title and re-open old backlink.
- [ ] Move one OpenList file, confirm failure is recoverable, relink it, re-open old backlink.
- [ ] Move/reorganize one OpenList folder, preview remap, apply remap, verify multiple old backlinks.
- [ ] Confirm existing `jv://` notes still work.
- [ ] Stop the bridge and confirm Go Study shows a recoverable error instead of hanging/crashing.
- [ ] Confirm bridge port is not reachable through non-loopback interfaces.
