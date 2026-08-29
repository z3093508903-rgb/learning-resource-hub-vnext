# beta20.8 · Data Safety Recovery Contract

Status: VALIDATING

## Release blocker

A real-machine restart showed that a populated Go Study state could be replaced by a fresh empty state. Manually copying an older data.json back could still be followed by another empty overwrite on startup.

## Safety contract

1. Protect raw data.json before startup load/normalization.
2. Recovery snapshots live outside the plugin install directory:
   `<Vault>/.obsidian/go-study-recovery/`
3. If Obsidian `loadData()` returns empty while raw data.json is populated, prefer the protected raw data.
4. If migration/normalization would collapse a populated state into effectively empty state, refuse to overwrite.
5. Every persist checks for catastrophic populated → empty loss.
6. Previous on-disk state is snapshotted before later saves.
7. Manual backup and restore use the same external recovery directory.
8. Settings must expose the actual data.json path, actual recovery folder, manual backup, and recent restore.

## Acceptance

- create project/resource → restart twice → data survives
- recovery folder exists and contains JSON snapshots
- manual backup → mutate state → restore recent backup → prior state returns
- replacing data.json with a populated backup must not be overwritten to empty on startup
- accidental populated → empty persist must be blocked
