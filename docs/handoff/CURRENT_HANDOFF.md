# Go Study — 当前交接文档

> 新 ChatGPT / Codex / 开发者接手时先读本文件。

## 阅读顺序

1. `../PROJECT.md`
2. `../CURRENT.md`
3. 本文件
4. `../product/companion-note-window.md`
5. `../decisions/007-portable-freeform-cross-platform.md`
6. `../decisions/008-real-obsidian-companion-note-window.md`
7. `../ideas/IDEA_LEDGER.md`
8. `../AI_DEV_RULES.md`

## Repository

唯一权威仓库：

`z3093508903-rgb/learning-resource-hub-vnext`

## Current milestone

`0.3.0-beta.18 — Companion Note Window / 真人验收`

## Current candidate

- Branch：`work/companion-note-beta18`
- HEAD：`28208c9e244d0fcbe4fb1c7132bb800da09b0d67`
- Draft PR：#26
- Preview：`Go Study Preview 0.3.0-beta.18`
- Tag：`go-study-preview-v0.3.0-beta.18`
- Release Target：`7eb7fa2f66e7b8df03335e168d0c4ed6e48d6cc0`
- Stable / Merge：**HOLD**

## Automation

Final branch CI #188:

- 307/307 tests PASS
- release:check PASS
- committed main.js consistency PASS

Preview publisher:

- validation PASS
- isolated package PASS
- upload PASS
- asset verification PASS

## What changed

### beta.17 polish

- same-direction HUD double press executes directly;
- Quick Note popup can be moved and remembers geometry;
- popup scrollbar is lighter and default vertical placement is lower;
- Freeform visible backlink title is stable `回到课程`;
- HUD settings use compact mapping rows;
- each Markdown template has an adjacent live rendered preview.

### beta.18

- adds `src/companion-note-window.cjs`;
- opens the **real Markdown file** through an Obsidian pop-out leaf;
- default layout approximates a PotPlayer right-side playlist panel;
- move/resize/scale state persists;
- custom layout presets can be saved;
- locked Companion Note becomes Capture target before ordinary active/remembered note;
- commands + Go Study settings expose the feature;
- companion-only CSS removes unnecessary Obsidian chrome.

## What is verified

Automated:

- geometry / scale clamping;
- built-in/custom layout state;
- pop-out leaf orchestration with a fake workspace;
- locked companion target priority;
- runtime registration;
- beta.17 backlink and capture regressions;
- build/release package integrity.

Human:

- beta.17 Windows Freeform core flow;
- dynamic Freeform → Managed upgrade;
- legacy backlink compatibility;
- Managed Resource backlink regression.

## What is NOT verified

beta.18 real Obsidian behavior:

- actual pop-out creation on the user's installed Obsidian;
- real window movement/resize persistence;
- CSS chrome stripping;
- zoom/editor coordinate correctness;
- locked Capture while PotPlayer is foreground;
- simultaneous main-window + popout editing;
- custom layout UX;
- macOS popout behavior.

These cannot be marked PASS from unit tests.

## Next action

Install beta.18 Preview and run `TESTING.md`.

Prioritize:

1. open current Markdown in Companion Window;
2. edit and save;
3. move/resize/reopen;
4. test Scale;
5. lock Capture and use Alt+S from PotPlayer;
6. HUD double-direction;
7. Quick Note geometry;
8. settings template live preview;
9. Managed/Freeform regression.

## Do not expand scope during acceptance

Do not add:

- Full Study Workspace
- Always-on-top dependency
- Automatic PotPlayer docking
- Path Mapping
- AI notes
- New global shortcuts

Fix only failures inside the confirmed beta.18 boundary.

## Git safety

PR #26 is Draft.

Do not Merge without explicit user approval and real-machine acceptance.
