# Go Study 0.3.0 — RC Audit

更新时间：2026-08-29（北京时间，UTC+8）

## RC 基线

- Product branch：`release/go-study-0.3.0-rc2`
- Branch HEAD：`79cba03059a2a3777a4a03fd1139f9791cabf55a`
- RC release target：`9a07975df00a29bb54b6b589c93aaf4897621801`
- Release：`Go Study 0.3.0 RC2`
- Tag：`go-study-rc-v0.3.0-rc.2`
- RC ZIP SHA256：`8c4b7e676638cb05e744eb1fcedfb4de7772f1ef7845d24bb0e5381ba94791d6`
- Bilibili Bridge：`0.1.1`
- Bridge ZIP SHA256：`cf7970e76894167945b21427900124feef342de42b8e20e76e1558edc71cb7c4`

自动验证：

- **413 / 413 tests PASS**
- build：38 source modules / 775671 bytes
- committed `main.js` current
- Release readiness PASS

Stable / Merge：**HOLD**

## 审计结论总览

| Area | Static / automated | Windows real-machine | RC status |
|---|---|---|---|
| PotPlayer discovery / local playback / seek | PASS | beta20.9.3 PASS | PASS |
| Bilibili Freeform Ctrl+Browser | PASS | PASS | PASS |
| Legacy JV optional compatibility | PASS | PASS | PASS |
| Native Markdown drag | PASS | beta20.10 PASS | PASS |
| Project Note Box drag | PASS | beta20.11+ behavior accepted | PASS |
| Standalone Companion without PotPlayer | PASS | accepted in later Companion rounds | PASS |
| Companion strong topmost + Web HUD focus | PASS | beta20.12.3 PASS | PASS |
| Browser HUD key isolation | PASS | beta20.12.3 PASS | PASS |
| Bilibili Web Bridge timestamp/note | PASS | beta20.12.x PASS | PASS |
| Timeline grouping / note navigation / stale overlay cleanup | PASS | hover + navigation previously accepted; final scope regression pending | RECHECK |
| Companion caret / long-note jitter | PASS | beta20.12 stabilization used in accepted beta20.12.3 flow; final long-note regression pending | RECHECK |
| data.json fail-closed state safety | PASS | no later zeroing report | RECHECK |
| Restart persistence x2 | cannot replace real restart | pending RC1 | BLOCK until checked |
| Named backup retention | PASS | pending RC1 | BLOCK until checked |
| Backup restore | PASS | pending RC1 | BLOCK until checked |
| Managed v3 fallback | PASS | final RC regression pending | RECHECK |
| Legacy v1 recovery / relink | PASS | final RC regression pending | RECHECK |
| Vault rename / delete / recreate | PASS | historical path behavior accepted; RC smoke pending | RECHECK |
| Light theme modal readability | PASS | final RC regression pending | RECHECK |
| OpenList auth + playback + seek | unit/model coverage PASS | real service required | BLOCK until checked |
| Legacy plugin protocol coexistence | RC1 fail-safe PASS | pending one reload test | RECHECK |
| Clean Vault cold start | load/build PASS | pending RC1 | BLOCK until checked |
| Anki | not part of this non-Anki RC gate | not required for current decision | DEFERRED from this gate |

## Static audit details

### RC2 selectable restore

RC1 UI gap fixed in RC2:

- recovery is no longer limited to the newest snapshot;
- Settings -> Data & Safety now exposes **选择备份恢复**;
- the picker separates named pinned backups from automatic snapshots;
- every entry can be restored independently;
- the current state is protected before restoring the selected entry.

### 1. State safety

Current runtime:

- copies raw `data.json` into `.obsidian/go-study-recovery` before load;
- if Obsidian `loadData()` unexpectedly returns empty while raw data is meaningful, uses protected raw data;
- blocks catastrophic populated → empty persistence;
- protects previous on-disk state before saves;
- named backups are excluded from automatic pruning;
- restore normalizes the backup and refuses a catastrophic migration before overwrite.

Automated coverage includes:

- startup snapshot;
- catastrophic state drop;
- blocked empty overwrite;
- rolling pre-save protection;
- named backup pinning;
- restore integration;
- backup UI.

This is strong enough for RC code review, but **restart x2 + real restore remains mandatory**.

### 2. Reference durability

Automated coverage confirms:

- Managed v3 can degrade to Freeform when Resource state is missing;
- v3 keeps portable source title for Timeline;
- legacy v1 Resource ID can recover from external recovery snapshot;
- legacy alias can map old Resource ID to a newly collected Resource;
- arbitrary executable path injection is rejected;
- Bilibili web-origin capture writes direct native Bilibili `t=` URL.

Final RC still asks for one v3 and one v1 smoke test.

### 3. Timeline

Automated coverage confirms:

- mixed-video timestamps group by source;
- collapsed rail = one dot per source;
- click navigates Markdown line, not media;
- fallback works from rendered links;
- mount is document-level;
- own MutationObserver changes are ignored;
- unchanged source signature reuses DOM;
- stale overlay clears outside active relevant Markdown.

No new Timeline code after accepted beta20.5/20.6 behavior. Final RC needs only a short regression.

### 4. Companion

Automated + accepted behavior:

- real Obsidian Markdown pop-out leaf;
- project/file-tree/tab/note-box drag paths;
- standalone note-only mode;
- Capture lock is explicit;
- CodeMirror CSS zoom removed;
- long-note reveal is event-driven and abandons auto-scroll if user moves caret;
- pinned Companion uses stronger Windows topmost;
- Quick Note uses stronger topmost;
- Bilibili web HUD may own focus without invalidating the active browser video source.

### 5. Bilibili Web Bridge

Boundary remains optional:

- extension only matches Bilibili video pages;
- loopback server binds `127.0.0.1:27124`;
- payload is bounded;
- active-tab identity is separate from Windows/document focus;
- web mode supports timestamp / note / note+timestamp;
- browser screenshot remains PotPlayer-only.

### 6. OpenList

Model/runtime code keeps:

- HTTPS required for remote OpenList; HTTP only for loopback;
- source auth/token runtime;
- signed download URL;
- positioned PotPlayer launch;
- safe strict relink/remap operations.

This still requires a real OpenList source before publish because automated tests cannot prove auth/server compatibility.

### 7. Legacy plugin coexistence

RC1 adds fail-safe protocol registration:

- duplicate `obsidian://go-study` registration no longer aborts the whole Go Study startup;
- old `learning-resource-hub-next` enabled state is detected;
- user receives an explicit warning to disable old version and reload;
- Workbench can continue starting even if protocol ownership is degraded.

Normal published usage should still keep only one generation enabled.

## Final manual checklist

### A. Cold start / restart persistence

1. Note current project/resource counts plus one obvious setting/layout.
2. Fully exit Obsidian.
3. Reopen and verify.
4. Fully exit and reopen a second time.
5. No count loss, no setting reset, no abnormal empty-state warning.

### B. Named backup / restore

1. Create named backup `RC2-before-restore`.
2. Produce at least one newer automatic snapshot after it.
3. Make one obvious reversible change.
4. Click **选择备份恢复**.
5. Choose the older named backup rather than the latest snapshot.
6. Confirm the state rolled back to that exact backup.
7. Confirm the named backup still exists.

### C. OpenList

1. Login/auth real OpenList source.
2. Open a video from Resource Center.
3. Verify PotPlayer playback.
4. Use a saved timestamp/resume and verify seek.

### D. Reference regression

- one Managed v3 fallback;
- one legacy v1 recover/relink;
- one Vault path rename/delete/recreate smoke test.

### E. UI regression

- Light theme major modal/settings readability;
- Timeline mixed-source note + leave-note stale-overlay cleanup;
- long Companion note continuous typing / click caret / HUD insertion.

### F. Legacy coexistence

If old plugin is still installed:
- enable old + RC once;
- reload;
- Go Study must still start and warn;
- disable old plugin immediately after test.

## Stable identity — unresolved release decision

Current source repository manifest is still historical:

- id: `learning-resource-hub-next`
- name: `Learning Resource Hub Next`
- version: `0.2.0-alpha.12.4`

Preview / RC packaging deliberately overrides that to preserve current tester data:

- id: `go-study-preview`
- name: `Go Study RC`
- version: `0.3.0-rc.1`

Before **Stable 0.3.0**, permanent public identity must be confirmed.

Recommended long-term identity:

- id: `go-study`
- name: `Go Study`
- version: `0.3.0`

Do not silently switch RC testers from `go-study-preview` to `go-study` before deciding the Preview → Stable state migration path.

## Publish / Hold

Publish only when:

- all BLOCK rows are PASS;
- RECHECK rows have no regression;
- permanent Stable identity is confirmed;
- strict release validation runs against the final stable manifest/version/tag.

Any data loss, wrong Capture target, wrong media/timestamp, backup overwrite, global overlay residue, broken Markdown caret, or startup crash => **HOLD**.
