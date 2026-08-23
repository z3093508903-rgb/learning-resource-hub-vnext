# Learning Resource Hub vNext

Learning Resource Hub vNext is a desktop Obsidian plugin for organizing and launching learning resources from one workspace.

The current public snapshot is a pre-release build. It supports project-based organization for videos, Anki decks, Vault files, local files, PDFs, web resources, Bilibili collections, and OpenList directories.

## Status

- Version: `0.2.0-alpha.12.4`
- Platform: Obsidian desktop
- Release stage: public beta preparation
- Mobile support: not available

This repository is not yet an Obsidian Community Plugin release. The final public documentation, screenshots, compatibility matrix, and release notes are still being prepared.

## Main capabilities

- Today, Projects, Library, and Subscriptions workspaces.
- Project, learning module, resource, task, Vault reference, and memo organization.
- Bilibili video, multi-part video, collection, and creator subscription import.
- OpenList directory browsing and explicit resource import.
- Local folder scanning with an import preview.
- AnkiConnect integration with optional Anki Profile launch.
- PotPlayer, local file, Vault file, and browser launch actions.
- Project-page snap layout with persisted card positions.
- Recoverable archive, trash, undo, and orphan-resource cleanup flows.

## Privacy and external access

- Plugin data is stored locally in the Obsidian plugin data file and is not included in this repository.
- The plugin does not include telemetry or advertising.
- Bilibili features access public Bilibili endpoints.
- OpenList features access the service configured by the user. Remote OpenList connections require HTTPS; loopback HTTP remains available for local services.
- AnkiConnect requests are restricted to the local machine (`127.0.0.1`, `localhost`, or `::1`).
- Local-folder import only scans a folder explicitly selected by the user.
- Removing an indexed Vault reference does not delete the underlying Vault file.
- State backups are stored under the plugin's local `backups/` directory; the newest 10 `state-*.json` backups are retained automatically.

Never commit `data.json`, `.deploy.local.json`, credentials, tokens, cookies, local backups, or real user screenshots.

## Development

Requirements:

- Node.js
- Obsidian desktop for manual acceptance

Syntax check:

```powershell
npm run check
```

Build:

```powershell
npm run build
```

Tests:

```powershell
npm test
```

Release check:

```powershell
npm run release:check
```

`npm run release:check` performs syntax checks, rebuilds `main.js`, runs the test suite, and validates the release workspace. GitHub Actions runs the same check for pull requests. A formal `x.y.z` tag additionally runs the strict release gate and, if it passes, publishes `main.js`, `manifest.json`, and `styles.css` as GitHub Release assets.

The generated plugin files are:

```text
main.js
manifest.json
styles.css
```

## Manual installation

Copy the three generated plugin files into an Obsidian plugin directory named `learning-resource-hub-next`, then reload Obsidian and enable the plugin.

## Known pre-release boundaries

Real-environment acceptance is still required for themes, narrow windows, keyboard and accessibility behavior, Anki cold start, OpenList authentication and playback, Bilibili network behavior, PotPlayer launch, restart persistence, and large imports.

## License

MIT License. See [LICENSE](LICENSE).
