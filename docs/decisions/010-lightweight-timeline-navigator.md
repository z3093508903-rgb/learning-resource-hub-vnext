# ADR-010：悬浮时间线必须是可选、透明、Hover 扩展

状态：**CONFIRMED**

日期：2026-08-28

## Context

Go Study 已经可以在 Markdown 中生成可回到视频位置的永久回链。一个笔记可能包含多个视频来源，因此单纯按时间数字合并会制造错误语义。

同时 Timeline 并不是所有用户都需要；如果做成常驻面板或卡片，会增加视觉负担并违背 Go Study 的轻量工作流。

## Decision

1. Timeline 放在“视频笔记增强”中作为独立可选设置，默认关闭。
2. 只在包含 Go Study timestamp backlinks 的 Markdown 中出现。
3. 默认 UI 只显示右边缘极细 rail + subtle nodes。
4. Hover / focus 才轻微展开。
5. 展开区域保持 transparent background，不使用 card-style container。
6. 多视频时间戳按 source identity 分组，不混成一根假时间轴。
7. 点击时间点复用现有 Go Study playback；Ctrl/Cmd 点击复用网页时间跳转。
8. Freeform URI 可以隐藏保存 human media title，但可见 Markdown 不增加来源噪音。

## Consequences

- Timeline 是对现有永久回链的视觉索引，不产生第二套播放协议。
- 用户可以关闭该增强并得到完全干净的普通 Markdown 工作流。
- 多视频笔记仍可正确区分来源。
- Freeform 记录为未来 Media → Notes 反向索引提供基础 metadata。
