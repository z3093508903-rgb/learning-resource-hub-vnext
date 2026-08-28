# ADR-009：Study Mode 采用 HUD-first + 拖拽进入

状态：**CONFIRMED**

日期：2026-08-28

## Context

Companion Note Window 技术上已经能提供真实 Markdown 小窗，但如果把它当作频繁点击的第二编辑器，用户仍然需要在 PotPlayer 与 Obsidian 之间反复切焦点，体验会退化为旧的 Alt+Tab 工作流。

同时，“开始学习”笔记选择器已经是用户明确选择本次 Note 的自然入口。

## Decision

1. 普通点击笔记保持原有学习路径。
2. 将笔记拖到“开始学习”弹窗右侧独立 Study Mode 小卡片，代表进入 Study Mode。
3. Study Mode 自动建立本次临时 Resource / Note 学习上下文，但不建立永久 Resource → Note 绑定。
4. Companion 默认置顶、自动锁定 Capture，并使用现有 right-rail 布局。
5. 用户通过图钉自行切换置顶状态。
6. 正常学习以 HUD 快捷键 Capture 为主，小窗以持续可见为主。
7. 点击 Companion 属于主动深度整理；beta19-A 接受此时 PotPlayer 失焦导致 HUD 暂不可用，用户切回播放器恢复。
8. 关闭 Companion 即退出 Study Mode，但不关闭 PotPlayer。
9. Player Binding / 后台 Capture 延后到 beta19-B 再评估。

## Consequences

- Study Mode 的入口不依赖列表剩余空白，因此笔记数量增加后仍稳定。
- 高级能力保持可发现，但不增加额外按钮密度。
- HUD 成为主要记录入口，小窗不是新的焦点切换负担。
- beta19-A 改动集中在 Study Mode shell、置顶和 UI，不同时改 Capture 底层，降低实机验证风险。
