# ADR-011 — Optional Bilibili Web Bridge

Status: **PROPOSED / beta20.12 Preview**

Date: 2026-08-29

## Context

Go Study 的 HUD 原本以 PotPlayer 为唯一实时视频位置来源。

对于 Bilibili 用户，这意味着即使用户本来只想在网页里看视频并做笔记，也需要额外配置 PotPlayer 网络播放链路，首用门槛偏高。

Bilibili 网页本身支持 `t=<seconds>` 时间定位，例如：

`https://www.bilibili.com/video/BV...?t=69.4`

但 Obsidian 插件无法直接读取外部 Chrome / Edge 页面的 `HTMLVideoElement.currentTime`。

## Decision

提供一个**可选**的 Manifest V3 浏览器扩展作为 Bilibili Web Bridge。

它不是 Go Study 主插件的硬依赖。

数据流：

~~~text
Bilibili foreground tab
→ content script reads video.currentTime
→ extension background
→ loopback 127.0.0.1:27124
→ Go Study in-memory bridge state
→ existing global HUD / capture pipeline
~~~

## Security / Privacy Boundary

- HTTP server only binds to `127.0.0.1`;
- accepts only strictly validated Bilibili `/video/` URLs;
- payload size is bounded;
- extension content script only matches `https://www.bilibili.com/video/*`;
- data is limited to video URL/title/time/duration/playback and foreground state;
- extension cannot read Obsidian note content;
- no external server or cloud transport is involved.

## Source Selection

1. Foreground Native PotPlayer remains first priority.
2. If PotPlayer is unavailable / not foreground, Go Study may use a fresh foreground Bilibili Web state.
3. Legacy PotPlayer bridge remains fallback for existing compatibility.

A Bilibili web-origin capture is intentionally treated as **Web Freeform**, even if the URL matches a Managed Resource.

This preserves user intent:

> captured from browser → return to browser.

## Backlink Format

Web-origin timestamp backlinks are direct native Bilibili links:

`https://www.bilibili.com/video/BV...?p=2&t=69.4`

They do not use:
- `obsidian://go-study`;
- `jv://`;
- PotPlayer.

## HUD Scope

Initial browser support:
- timestamp;
- plain note;
- note + timestamp.

Not included in beta20.12:
- screenshot;
- screenshot + timestamp;
- screenshot + note;
- all-elements capture.

Those remain PotPlayer-only to avoid adding browser screenshot permissions before RC.

## Compatibility

Users who do not install the browser extension retain all existing Go Study behavior.

Therefore the browser bridge can later be distributed through browser stores without changing the Obsidian plugin's core data model.


## Focus Semantics

A browser document does **not** need `document.hasFocus() === true` to remain the valid learning source.

Reason:

Go Study Companion is intentionally always-on-top and may own Windows OS focus while the user continues watching the same Bilibili tab.

Eligibility is:

- state is fresh;
- page is visible;
- extension background reports `sender.tab.active === true`.

The browser's OS/window focus is diagnostic only.

This separates:
- **active video tab identity**
from
- **which desktop window currently owns keyboard focus**.

## Onboarding

The Obsidian settings page should expose:
- bridge download / install entry;
- connection check;
- started / connected state.

The Workbench's lightweight video-enhancement indicator should include bridge state without turning into a large control strip.

Browser security prevents the Obsidian plugin from silently installing an unpacked extension. Preview builds therefore open the project Releases page and explain Load Unpacked. A production browser-store listing may replace that link later.
