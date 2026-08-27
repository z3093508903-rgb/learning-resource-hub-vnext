# ADR-008：Companion Note Window 必须复用真实 Obsidian Markdown，而不是创建第二套编辑器

状态：**CONFIRMED SCOPE / implementation validation**

## 背景

beta.18 的目标是在 PotPlayer 旁维持一个约播放列表宽度的窄高笔记小窗。

最容易出现的错误方向是：

```text
Go Study 自己做一个 textarea / Rich Text 小窗
→ 维护私有文本状态
→ 再同步回 Vault Markdown
```

这会制造：

- 第二套编辑状态；
- 保存与同步冲突；
- Markdown / Live Preview 能力退化；
- 插件需要重新实现 Obsidian 编辑器行为；
- Capture Target 与真实 Note 身份更复杂。

## 决策

Companion Note Window 必须打开 **Vault 中真实的 Markdown 文件**，并优先复用 Obsidian 自身的 Markdown View / Editor。

beta.18 实现候选使用：

```text
workspace.getLeaf('window')
→ open real Markdown file
→ reveal/load view
→ obtain the pop-out window from the leaf element
→ apply companion-only layout / scale / chrome CSS
```

Capture 锁定的是这个真实 Markdown Editor。

## Capture Target

当小窗锁定时：

```text
Locked Companion Note
→ Active Markdown
→ Remembered Markdown
```

不能因为 PotPlayer 或 Obsidian 主窗口焦点变化就把 Capture 写到另一篇 Note。

## Window state

保存：

- Note path
- locked
- x / y
- width / height
- scale
- active layout
- custom layouts

如果屏幕布局变化，应把恢复后的 Geometry 限制在可见 Work Area。

## 边界

beta.18 不把以下能力设为必须：

- Always-on-top
- automatic PotPlayer docking
- complete Study Workspace
- custom file browser
- private editor format

## 跨平台

Obsidian pop-out 是产品抽象；Windows/macOS 的真实窗口行为需要分别真人验证。

不能把 Win32 特性写成 Companion Note Window 的永久身份。

## 验收门槛

本 ADR 的实现只有在真实 Obsidian 验证以下行为后才视为行为确认：

- pop-out 真正打开；
- Markdown 编辑正常；
- move/resize/restore 正常；
- scale 不破坏光标/选择/滚动；
- locked Capture Target 正常；
- main window / popout 同 Note 不产生错误状态。
