# Go Study 0.3.0 — Release Notes

## 让“继续学习”少一点阻力

Go Study 0.3.0 是第一个以完整学习闭环为目标的公开版本。

我们关注的不是“在 Obsidian 里再放一个播放器”，而是一个更实际的问题：

> 昨天已经学过一次，为什么今天继续时还要重新找视频、找位置、找笔记、调窗口？

Go Study 把这些分散动作连接成一条路径。

---

## 主要变化

### 项目 → 资源 → 开始学习

一个项目可以同时组织：

- 本地视频
- OpenList
- Bilibili
- Vault Markdown
- PDF
- 网页
- 本地文件
- 任务与备忘

从项目页直接回到学习资源。

### Companion 轻量 Markdown 小窗

Markdown 可以从 Obsidian 文件树、标签页、项目页面、项目笔记盒直接拖入 Companion。

它可以：

- 置顶在播放器 / 浏览器上方
- 作为纯笔记小窗独立使用
- 在 Study Mode 中锁定为 Capture 目标
- 保持真实 Obsidian Markdown 编辑体验

### Alt + S 快捷记录

通过全局 HUD 快速记录：

- 时间戳
- 纯笔记
- 评论 + 时间戳
- PotPlayer 截图类动作

不再为了记一句话反复切播放器和 Obsidian。

### Bilibili 网页学习

可选的 Go Study Bilibili Bridge 支持直接从 Chrome / Edge 的 B站视频读取当前时间。

网页学习可以：

- 记录原生 Bilibili 时间链接
- 写入 Companion / Markdown
- 使用 Alt + S HUD

这意味着 B站用户不必为了基础时间戳笔记先配置 PotPlayer 网络播放。

### 轻量 Timeline

一篇视频笔记可以按来源展示轻量时间线。

- 多视频来源分组
- hover 展开
- 点击跳到 Markdown 对应位置
- 正文时间戳继续负责打开媒体

### 数据恢复

0.3.0 把恢复当成正式功能，而不是隐藏在文件夹里的保险：

- 自动恢复快照
- 命名长期备份
- 自动保护保存前状态
- 异常“有数据 → 空数据”覆盖保护
- 选择任意历史备份恢复

---

## 更短的学习路径

传统方式：

```text
找视频
→ 打开播放器
→ 找播放位置
→ 打开 Obsidian
→ 找项目
→ 找笔记
→ 手动记录时间
→ 再切回视频
```

Go Study：

```text
项目 → 点资源 → 学习
```

需要记录：

```text
Alt + S → 写
```

---

## Free & Open Source

**Go Study is free and open source.**

**Core features will not be locked behind a paywall.**  
If this project saves you time, you can optionally support its continued development.

> **Go Study 免费且开源，0.3.0 的核心功能将永久免费且开源，不会在未来被移到付费墙后。**
>
> 如果它确实帮你节省了一些时间，可以选择赞助项目继续开发。

未来只有 AI、云同步、托管服务等需要持续运营成本的新能力，才可能作为可选付费服务提供。

---

## 视频平台范围

0.3.0 首发专门适配并验证：

- Bilibili Web Bridge
- PotPlayer
- OpenList

YouTube 暂无专门网页学习适配，也不作为 0.3.0 发布阻断。

如果未来出现真实海外用户需求，会再按实际使用习惯设计 YouTube / 其他平台 Adapter。

---

## Preview → Stable 迁移

0.3.0 使用永久插件 ID `go-study`。

如果首次安装正式版时检测到当前 Stable 还没有数据，而同一 Vault 中存在有效的 `go-study-preview/data.json`，Go Study 会：

- 保留 Preview 原文件；
- 额外创建迁移恢复备份；
- 一次性把 Preview 项目和设置迁入 Stable。

已经存在 Stable `data.json` 时绝不会自动覆盖。

---

## 兼容

长期兼容：

- 当前 Go Study 资源 / 回链格式
- 历史 `jv://open?... `（开启高级 Legacy JV Compatibility）

开发阶段中间 beta 版本产生的实验型 PotPlayer 链接不属于 Stable 长期兼容承诺。

---

## 平台

- Obsidian Desktop
- Windows 是 0.3.0 的主要实机验证平台
- Bilibili Bridge 支持 Chromium 系浏览器（Chrome / Edge）
- Mobile 暂不支持

---

## 隐私

Go Study：

- 无广告
- 无遥测
- 不上传 Obsidian 笔记
- Bilibili Bridge 通过本机 `127.0.0.1` 工作
- OpenList 只连接用户自己的配置
- 数据保存在用户本地 Obsidian 环境

---

## 0.3.0 不做什么

为了让第一版保持可控，以下能力没有进入 0.3.0：

- AI 自动总结
- 学习统计
- 日历
- OCR
- 强制 Resource ↔ Note 一对一绑定
- 浏览器网页截图
- 跨设备状态同步

这些可能属于未来版本，但不是 0.3.0 的发布前提。

---

## 致谢

这个版本经过多轮真实 Windows / Obsidian 工作流验收，包括：

- PotPlayer
- OpenList
- Bilibili
- Companion
- Native Drag
- HUD
- Timeline
- Backup / Restore
- Legacy Link Compatibility

0.3.0 的目标不是“功能最多”，而是：

> **打开得快、记得顺、回得去、坏了能恢复。**
