# Resource Backlinks Stage 0 Audit

This audit records the pre-v2 coupling points that must remain compatible while Resource identity is separated from location.

## Findings

### 1. Durable references already use `resource.id`

Good: projects/modules/plans/notes/activity generally retain resources through resource IDs rather than paths. `referencedResourceIds()` collects module resource IDs, plan target IDs, note resource IDs, activity resource IDs, and resource lifecycle state.

Implication: existing Resource IDs are the correct durable backlink identity and must be preserved.

### 2. `canonicalKey` is currently an active deduplication key

`addResource`, `addInboxResource`, `upsertResourceDescriptor`, and `upsertInboxDescriptor` all find an existing resource by exact `canonicalKey` equality before creating a new Resource ID.

Implication:

- `canonicalKey` cannot be removed in the first migration.
- It remains useful for discovery/import dedupe.
- A path-derived `canonicalKey` must not become the target stored in permanent note backlinks.
- Explicit relink must update the existing resource rather than run normal import/upsert semantics that could create a second ID.

### 3. OpenList descriptors derive canonical keys from paths

`openListDescriptor()` currently builds:

```text
openlist:<source identity>:<lowercased remotePath>
```

and stores `sourceId` / `remotePath` in `launcher` plus `metadata`.

Implication: moving an OpenList file changes its discovery key. Stable backlinks therefore require a Resource ID layer independent of this key.

### 4. Runtime OpenList path helpers are legacy-field based

`resourceOpenListPath()`, `resourceFolderPath()`, `moduleResourceRoot()` and related grouping/root logic read `launcher.remotePath` and/or `metadata.remotePath`.

Implication: Schema v2 must be additive first. During migration, `locator` becomes authoritative for new backlink/relink code while the legacy launcher/metadata path fields are retained/mirrored so existing grouping and launch behavior does not regress.

### 5. Runtime launch resolution is launcher based

`resolveResourceActions()` dispatches on `launcher.type` (`openlist`, `openlist-file`, `potplayer`, `file`, `anki`, `uri`).

Implication: v1 should not rewrite the launch stack while introducing stable backlinks. The new resolver can resolve Resource ID -> current locator, then keep feeding the existing launch path until a dedicated player/source adapter layer replaces it incrementally.

### 6. `normalizeState()` currently does not normalize resources

Current normalization validates state schema version and normalizes projects/modules/groups/etc., but takes `input.resources` largely as-is.

Implication: resource-locator migration can be introduced as a narrowly scoped compatibility layer without rewriting the large model module. It must still enforce a single v2 state version at plugin load and normalize newly created resources in the same session.

## Migration strategy selected

1. Preserve every existing `resource.id`.
2. Introduce additive OpenList `locator`, `locatorHistory`, `identityHints`, and `resume` fields.
3. Keep existing `canonicalKey`, `launcher`, `metadata`, and top-level `sourceId` during v2.
4. Treat `locator` as the new authoritative field for backlink/relink work.
5. Mirror a v2 OpenList locator back into legacy launcher/metadata fields when required for old runtime behavior.
6. Wrap resource creation/upsert paths so newly imported resources receive v2 fields immediately rather than only after restart.
7. Add tests before any URI/UI work.

## Explicitly deferred cleanup

Do not remove legacy launcher/metadata path storage in this feature. Cleanup is only safe after every old reader has migrated to locator-aware helpers and after real-vault acceptance proves no grouping/import/playback regressions.
