# Security Policy

## Supported version

Security fixes are targeted at the latest stable Go Study release.

## Reporting a vulnerability

Please do **not** publish sensitive exploit details in a public issue.

Use GitHub's private security reporting feature for this repository when available. If private reporting is unavailable, contact the maintainer through the repository owner's public GitHub contact channel and request a private reporting path.

Include:

- affected Go Study version;
- affected Obsidian / operating system version;
- reproduction steps;
- impact;
- whether the issue involves local files, OpenList credentials, the Bilibili bridge, or custom URI handling.

## Security boundaries

Go Study is desktop-only and uses Node.js / Electron APIs.

It may access:

- files explicitly selected by the user;
- PotPlayer on the local machine;
- user-configured OpenList services;
- Bilibili public endpoints;
- the local Bilibili bridge on `127.0.0.1`;
- local plugin state and recovery backups.

Go Study does not include client-side telemetry.
