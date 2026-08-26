# beta.12 UX Feedback + Immersive Note Sidecar Ideas

> Status: Product feedback / future ideas
>
> Recorded: 2026-08-27
>
> Do not fold all of this into Project Note Box v1. Split into near-term UX hardening and later immersive-note experiments.

## 1. Near-term: global shortcut ownership

### Problem

Go Study currently registers system-wide shortcuts while the plugin is active. Even though actions fail closed when PotPlayer is not foreground, the shortcut key combination itself can still be reserved globally and interfere with the user's existing shortcuts.

### Desired product options

Expose shortcut scope as a setting instead of forcing one behavior:

```text
快捷键作用范围
● 仅播放器前台时生效
○ 始终注册为全局快捷键
```

Also keep shortcut customization, so users can solve conflicts by changing keys.

Preferred direction: foreground-only should be the safer product default if it can be implemented without heavy polling / helper-process overhead.

Important implementation constraint: do not naively spawn PowerShell every 100ms to track foreground windows. Measure cost and prefer a lightweight event/focus strategy.

## 2. Near-term: shared picker / search modal redesign

### Problem

The current note picker and other search/bind-file dialogs use a similar large modal pattern. The page feels crowded and the modal height changes while typing because search results appear/disappear immediately.

This creates visible layout jitter / “抽搐”:

```text
input
↓ type
results appear
↓
modal grows
↓ clear / fewer results
modal shrinks
```

### Desired behavior

Create one reusable Go Study picker shell for note selection, Vault file binding and similar search workflows.

```text
┌──────────────────────────────┐
│ 标题                         │
│ 简短说明                     │
│                              │
│ 🔍 固定搜索框                │
│ ┌──────────────────────────┐ │
│ │ 固定高度结果区域         │ │
│ │                          │ │
│ │     scroll / scrollbar   │ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│ 次要动作 / 新建             │
└──────────────────────────────┘
```

Principles:
- fixed modal width and stable content height
- results area scrolls instead of resizing modal
- no layout jump on first keystroke
- search begins immediately while typing
- recent/project items can be shown before search
- keyboard navigation should remain possible later
- reuse the component across “本次学习笔记”, project note box, project files and other Vault binding flows

## 3. Near-term: note action without timestamp

### Problem

Not every quick note needs a visible timestamp. A note stream where every line has a timestamp can become visually noisy.

### Desired action

Add a separate quick-note action that writes the note content without adding a timestamp/backlink block.

Example semantics:

```text
Alt+3 → 笔记 + 时间回链（现有）
New action → 纯笔记，不记录时间戳
```

Exact default shortcut should be decided separately; do not increase default global-shortcut conflicts casually.

This action should still use the current learning note target / remembered note context when available.

## 4. Future idea: segment / range timestamps

### Motivation

Point timestamps are useful for exact return-to-source, but dense point markers can pollute note readability.

A different mental model is **knowledge segments** rather than isolated points:

```text
知识点 A
00:02:10 ───────── 00:05:42

知识点 B
00:05:42 ───────── 00:09:18
```

Possible interaction:

```text
第一次记录
→ marks the start of a knowledge segment

下一次记录
→ closes the previous segment
→ starts the next segment
```

The user only needs to mark the boundary between knowledge points.

Potential Markdown representations:

```markdown
[02:10 → 05:42](...)
知识点说明
```

or a more visual/custom-rendered form later.

Important: do not replace permanent Resource ID semantics. A segment should still resolve to durable resource identity + start/end positions.

## 5. Future idea: note timeline

The segment model can evolve into a lightweight timeline of the note:

```text
00:00 ───────────────────── 11:33
       │      │        │
       A      B        C
```

A timeline item represents note content / knowledge boundaries rather than only player playback position.

Possible future capsule behavior:
- the project-note context capsule can preview the note timeline
- clicking a timeline item primarily navigates the **note** to the corresponding note block
- a secondary action can return to the video time

This is intentionally different from a normal media seek bar.

## 6. Future differentiator: Immersive Note Sidecar

### Inspiration

When PotPlayer is fullscreen-ish / dominant, its right-side playlist/browser area occupies a large vertical strip. Instead of requiring a full Obsidian window beside the player, Go Study could present a purpose-built **note-only sidecar**.

The desired experience resembles Windows split-screen, but with the Obsidian side deliberately reduced to only the learning note content.

```text
┌───────────────────────────────┬──────────────────┐
│                               │ 学习笔记         │
│                               │                  │
│          PotPlayer            │ 当前笔记预览     │
│                               │                  │
│                               │ 02:10  节奏控制  │
│                               │ 05:42  熟悉素材  │
│                               │                  │
└───────────────────────────────┴──────────────────┘
```

### Core product idea

> Instead of exposing the entire Obsidian application during video learning, expose a purpose-built note surface containing only what the learner needs.

This could become a distinctive Go Study experience.

### Safer technical direction

Do **not** modify PotPlayer's internal playlist UI or skin as the primary design. That would be brittle and player-version dependent.

Prefer a Go Study-owned lightweight Electron sidecar window that:
- visually docks beside the PotPlayer window
- follows PotPlayer move/resize when possible
- renders the currently selected Markdown note or a controlled preview/editor surface
- can be hidden completely
- can coexist with ordinary Obsidian without requiring another full Obsidian window

Future research is required for:
- rendering/editing Markdown safely outside the normal Obsidian leaf
- synchronization with the Vault/editor
- focus and keyboard behavior
- PotPlayer window geometry tracking
- DPI / multi-monitor behavior
- avoiding always-on-top annoyances

### Relationship to Context Capsule

```text
Project Note Box
      ↓
Context Capsule
      ↓
Note Timeline
      ↓
Immersive Note Sidecar
      ↓
(optional, much later)
Project Workspace / project-scoped windows
```

The capsule is the light in-Obsidian navigation layer.
The sidecar is the light during-video note layer.
They should consume the same project/note/recent-study data rather than create parallel systems.

## 7. Prioritization

### Next practical hardening round

1. shortcut scope/conflict UX
2. shared fixed-size picker/search modal
3. no-timestamp quick note action
4. retain existing Project Note Box / Continue Learning behavior

### Research later, do not rush into implementation

1. segment/range timestamps
2. note timeline
3. timeline inside context capsule
4. immersive note sidecar
5. project-scoped multi-window/workspace model

## Product principle captured from this feedback

> **Go Study should reduce the amount of UI the learner must keep open. Bring project context and the right note to the user only when needed, instead of asking the user to maintain many tabs and windows manually.**
