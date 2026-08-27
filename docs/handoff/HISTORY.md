# Go Study — 历史重建

> 本文件来自对话历史 + GitHub 文档的重建，不等同于完整 commit changelog。

## 早期：Learning Resource Hub

项目最初围绕：

- Projects；
- Vault / Local / Web / PDF；
- Bilibili；
- OpenList；
- PotPlayer；
- Anki；
- Archive / Trash / Undo；
- Local Backup。

当前正统仓库已经迁移到：

`z3093508903-rgb/learning-resource-hub-vnext`

## Resource Backlink 架构

形成稳定原则：

```text
Resource ID ≠ Locator ≠ Position
```

目标：

即使资源移动、OpenList 改目录、播放器改变，旧 Note 仍然能通过 Resource ID 找回当前 Locator。

## beta.7：Immersive Control 早期阶段

历史上下文包含：

- 最近 Markdown Target；
- Companion File IPC；
- 初代 Global Capture；
- Visible Learning Controls。

这部分属于历史，不代表当前必须依赖。

## beta.8：Native Immersive

GitHub 文档确认：

从 external-helper-first 转向 plugin-native-first。

Native：

- Alt+1；
- Alt+2；
- Alt+3；
- Alt+4。

验收要求：

退出 AutoHotkey / markdown2potplayer，避免 fallback 掩盖 Native Bug。

## beta.9：Settings + Optional Enhancement

GitHub 文档确认：

- 视频增强默认可选；
- 关闭后释放全局快捷键；
- Alt+1..4 可配置；
- Duplicate binding 会拒绝；
- Screenshot folder 可配置；
- Native status check；
- Backup retention 3~10；
- 正常 Runtime 不再启动 Companion reverse-event poller。

## beta.10 / beta.11

历史聊天显示继续进行了：

- Settings polish；
- Output format / template 方向。

具体每个 beta 的完整 changelog 仍应以 Git History 核对。

## Study Context 演化

产品从“Resource 回链”继续发展为：

```text
Project
+ Resource
+ Position
+ Current Note Context
```

由此出现：

- Recent Note；
- Study Pair。

更完整的 Study Workspace 被暂缓。

## beta.14：Project Note Box

2026-08-27 讨论中发现：

- Screenshot Folder blank 状态问题；
- New Project Note Folder；
- Notes Box 过窄；
- Continue Learning 仍要手动滚动到底部。

beta.14 方向：

- Obsidian Attachment System；
- Project Note Folder；
- Per-create override；
- Full-width rows；
- Optional focus last line。

## beta.15：Universal Capture

真实工作流暴露：

```text
用户自己打开 PotPlayer
+
用户自己打开 Markdown
→ 视频增强无法工作
```

因此决定：

> 视频增强必须成为独立能力层。

形成：

- Managed；
- Freeform。

同时发现快捷键组合开始爆炸。

因此决定：

`Alt+S → Action HUD`

beta.15 重点：

- Action HUD；
- 7 种 Capture；
- No Timestamp；
- Managed / Freeform；
- Freeform link；
- Deep Folder Picker。

当前：

Development：
`work/universal-capture-beta15`
`ec854a9d5ca813e97f5c4f48b80f2afc3bf8de56`

Preview：
`preview/go-study-0.3.0-beta.15`
`11acbda84255c1df3cdf56b9f46a689c7a5b1066`

历史验收记录：

**288 / 288 自动化测试通过**

但仍未等于真人验收完成。
