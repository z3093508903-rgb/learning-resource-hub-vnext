# Privacy and Data Access

Go Study is designed as a local-first Obsidian Desktop plugin.

## What stays local

Go Study does not include client-side telemetry and does not upload your Markdown notes to a Go Study server.

Project state is stored in the plugin's local Obsidian data. Recovery snapshots are stored under:

```text
<Vault>/.obsidian/go-study-recovery/
```

## Network access

Go Study only uses network access for features you invoke or configure:

- **Bilibili**: public Bilibili pages/endpoints for Bilibili resource workflows.
- **OpenList**: the OpenList server configured by you.
- **Bilibili Bridge**: loopback communication on `127.0.0.1`.

## Files outside the Vault

Some desktop workflows can access files outside the Vault:

- a local folder that you explicitly choose to scan/import;
- PotPlayer executable discovery or a PotPlayer path you configure;
- local video files you explicitly open or collect.

## Sponsorship

The optional “Support Go Study” entry only opens the public project page. It does not gate features and does not track whether you sponsor the project.
