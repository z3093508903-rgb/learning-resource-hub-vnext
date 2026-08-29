# Contributing to Go Study

Thanks for helping improve Go Study.

## Before you start

Go Study's current product boundary is intentionally narrow:

- make it easier to continue learning;
- keep Markdown as the real note format;
- keep video enhancement optional;
- avoid making external helpers mandatory;
- prefer local-first behavior and recoverable state.

For larger changes, open an issue first so the product boundary can be discussed before implementation.

## Development setup

Requirements:

- Node.js 22
- Obsidian Desktop for real-environment acceptance

Run:

```bash
npm run check
npm test
npm run build
npm run release:check
```

## Pull requests

Please:

1. keep each PR focused;
2. add or update tests for behavioral changes;
3. update user-facing docs when behavior changes;
4. do not commit `data.json`, credentials, tokens, cookies, local backups, or private Vault content;
5. do not add telemetry or network dependencies without explicit discussion.

Automated tests do not replace real Windows/Obsidian testing for PotPlayer, OpenList, global hotkeys, Companion windows, browser focus, or backup restore.

## Compatibility

Stable compatibility promises:

- current Go Study formats;
- historical `jv://open?... ` links when Legacy JV compatibility is enabled.

Intermediate pre-release experiment formats are not permanent compatibility contracts.

## License

By contributing, you agree that your contribution is licensed under the MIT License.
