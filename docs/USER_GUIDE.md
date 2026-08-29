# Go Study 用户说明书

## 1. Go Study 是什么

Go Study 是一个 Obsidian Desktop 学习工作台。

它的目标不是替代播放器，也不是把所有学习内容塞进一个新系统，而是把你已经在使用的工具连接起来：

- Obsidian 负责知识与 Markdown
- PotPlayer 负责本地 / OpenList 视频播放
- Bilibili 网页负责网页视频
- Go Study 负责“从学习资源进入学习、记录位置、把笔记写回 Markdown、再回到原位置继续”

核心原则：

> **先让继续学习更容易，再让记录学习更容易。**

---

## 2. Free & Open Source / 免费开源承诺

**Go Study is free and open source.**

**Core features will not be locked behind a paywall.**  
If this project saves you time, you can optionally support its continued development.

> **Go Study 免费且开源，0.3.0 已有的核心学习功能将永久免费且开源，不会在后续版本中被移到付费墙后。**
>
> 如果它确实帮你节省了一些时间，可以选择赞助项目继续开发。

未来如果新增必须持续承担运营成本的能力，例如：

- AI 服务；
- 云同步；
- 托管服务；
- 持续产生服务器、存储或 API 成本的在线功能；

这些新增服务**可能**作为可选付费能力提供。

但这不会改变当前核心功能的免费与开源承诺。

赞助完全自愿，也不会影响功能、更新或使用体验。

---

## 3. 它解决什么问题

### 传统工作流

假设你昨天看到一个课程的 37:20。

第二天继续时，你可能要：

1. 找到课程文件；
2. 打开播放器；
3. 找到 37:20；
4. 打开 Obsidian；
5. 找到项目；
6. 找到这门课的笔记；
7. 调整播放器和 Obsidian 的窗口；
8. 开始学习。

想记一句话时，又需要：

1. 看当前时间；
2. 切 Obsidian；
3. 找到输入位置；
4. 手动写时间；
5. 写内容；
6. 切回播放器。

### Go Study 工作流

继续学习：

**打开项目 → 点击资源。**

记录：

**Alt + S → 选择动作 → 输入。**

所以 Go Study 真正减少的是：

- 找资源的次数
- 切窗口的次数
- 手动找播放位置的次数
- 手动写时间戳的次数
- “这条笔记到底属于哪个视频”的记忆负担

---

## 4. 第一次使用

### 3.1 创建项目

在 Go Study 中创建一个项目，例如：

- 摄影基础
- 专升本英语
- 剪辑课程
- 机器学习入门

项目是一个学习目标的容器，不要求一门课一个项目。

### 3.2 加入学习资源

资源可以来自：

- Vault
- 本地文件
- 本地视频
- OpenList
- Bilibili
- 网页
- PDF

把真正会继续学习的资源加入项目即可，不需要把所有收藏都导入。

### 3.3 开始学习

从项目页点击一个视频资源。

本地 / OpenList 视频会按当前配置交给 PotPlayer。

Bilibili 可以：

- 使用 PotPlayer / Freeform 路线；
- 或安装 Bilibili Bridge，直接在网页中学习。

---

## 5. Companion 笔记小窗

Companion 是一个轻量的 Obsidian Markdown 小窗。

### 打开方式

可以把 Markdown 从：

- Obsidian 文件树
- 已打开的 Markdown 标签页
- Go Study 项目页面
- 项目笔记盒

拖到 Go Study 的右侧 Drop Target。

### 两种模式

#### 纯笔记模式

不需要 PotPlayer。

适合：

- 临时置顶 Markdown
- 边看网页边记笔记
- 写提纲
- 做轻量待办

#### Study Mode

当存在当前视频上下文时：

- Companion 可以锁定 Capture
- Alt + S 写入这篇 Markdown
- 时间戳与视频上下文保持一致

### Pin

Pin 开启后，Companion 会保持在浏览器 / 播放器上方。

---

## 6. Alt + S HUD

默认主快捷键：

`Alt + S`

HUD 是 Go Study 的快速记录动作盘。

常见动作：

- 只记录时间点
- 纯文本笔记
- 评论 + 时间点
- 截图
- 截图 + 时间点
- 截图 + 评论

不同视频来源支持范围不同。

### PotPlayer

支持完整动作，包括截图类动作。

### Bilibili 网页

首版支持：

- 时间戳
- 纯笔记
- 评论 + 时间戳

网页截图仍需要 PotPlayer 路线。

---

## 7. Bilibili Web Bridge

Bilibili Bridge 是可选增强。

### 为什么需要它

Obsidian 插件无法直接读取 Chrome / Edge 页面里的：

`video.currentTime`

Bridge 只负责把前台 B站视频的：

- URL
- 标题
- 当前时间
- 视频时长
- 播放状态
- 当前标签状态

传给本机 Go Study。

### 数据流

```text
Bilibili <video>
→ Browser Bridge
→ 127.0.0.1
→ Go Study
→ Alt + S
→ Markdown
```

不会把笔记上传到网络。

### 时间戳格式

例如：

```text
https://www.bilibili.com/video/BVxxxx?t=69.4
```

分 P 会保留：

```text
?p=2&t=69.4
```

---

## 8. Timeline

Timeline 是一个可选的视频笔记增强。

设计目标：

> 看一眼这篇笔记里有哪些视频来源、有哪些记录点。

它不会替代正文。

### 行为

- 默认是一根轻量轨道
- 不同视频来源各有节点
- hover 展开
- 点击 Timeline → 跳到 Markdown 对应行
- 点击 Markdown 正文时间戳 → 打开媒体

因此：

**Timeline 管“笔记导航”，正文时间戳管“媒体跳转”。**

---

## 9. 项目笔记盒

项目笔记盒是项目级 Markdown 集合。

它不是：

> 一个 Resource 永久绑定一篇 Note。

而是：

> 这个项目经常会用到哪些笔记。

这样同一篇笔记可以自由参与项目工作流，而不会被视频资源锁死。

---

## 10. OpenList

OpenList 适合把远程 / NAS / 网盘映射的视频加入学习项目。

使用前请确保：

- OpenList 服务正常；
- 对应存储已挂载；
- 当前用户配置正确；
- 远程服务建议使用 HTTPS。

如果底层网盘没有挂载，OpenList 播放失败是预期的外部依赖错误，不应被 Go Study 隐藏。

---

## 11. 数据与备份

Go Study 会在插件数据目录外维护恢复快照。

### 自动备份

用于：

- 启动前
- 保存前
- 异常状态保护

### 命名备份

可以手动创建，例如：

`正式版发布前`

命名备份：

- 长期保留
- 不参与自动备份数量清理

### 选择恢复

设置 → 数据与安全 → **选择备份恢复**

可以选择：

- 任意命名备份
- 任意自动恢复快照

恢复前 Go Study 会先保护当前状态。

---

## 12. 历史链接兼容

Go Study 正式保留：

### 当前 Go Study 链接

继续支持。

### 最早 JV 脚本链接

设置中打开：

**旧 JV 链接兼容（高级）**

之后，历史：

`jv://open?...`

可由 Go Study 接管。

新的笔记不会再生成 JV。

中间 beta 开发阶段产生的实验型链接不属于长期兼容承诺。

---

## 13. 常见问题

### Q：必须安装 PotPlayer 吗？

不必须。

如果你只是：

- B站网页学习
- 纯 Markdown Companion

可以完全不使用 PotPlayer。

PotPlayer 是高级视频能力适配器。

### Q：Companion 是独立编辑器吗？

不是。

它是实际的 Obsidian Markdown leaf，所以修改仍发生在真实 Vault 文件中。

### Q：为什么没有 YouTube 专门适配？

0.3.0 首发优先适配了已经实际验证的 Bilibili 学习工作流。

目前 YouTube 没有专门的网页时间戳 / HUD Bridge。你仍然可以把 Companion 当作独立的置顶 Markdown 小窗使用，但 Go Study 不会承诺自动读取 YouTube 播放进度。

后续如果有真实海外用户需求，会再根据 YouTube 用户的实际学习方式设计 Adapter，而不是为了首发平台数量仓促加入。

### Q：为什么 B站网页截图不支持？

网页截图需要额外浏览器截图权限和控制通道。

为了首版权限更小、更稳定，目前截图类动作留给 PotPlayer。

### Q：为什么 Timeline 点击不是打开视频？

这是刻意设计。

Timeline 用来定位笔记内容；正文时间戳负责打开媒体。

### Q：为什么不永久绑定“资源 ↔ 笔记”？

因为真实学习笔记经常跨资源、跨视频、跨章节。

Go Study 保持 Project-level Notes Box，而不是强行一对一绑定。

---

## 14. 推荐工作流

### B站轻量学习

```text
B站网页
→ Companion
→ Alt + S
→ 评论 + 时间戳
→ 继续播放
```

### 本地课程

```text
项目
→ 本地视频
→ PotPlayer
→ Companion
→ Alt + S
→ 时间戳 / 截图 / 评论
```

### OpenList

```text
项目
→ OpenList 资源
→ PotPlayer
→ Companion
→ HUD
```

---

## 15. Go Study 的设计边界

Go Study 当前刻意不做：

- AI 自动总结
- 学习统计
- 日历系统
- OCR
- 强制 Resource ↔ Note 一对一绑定
- 强制外部脚本 Runtime
- 首发前临时加入未经真实用户验证的 YouTube 专门适配

这些未来可以讨论，但不会为了“看起来功能多”而破坏当前学习闭环。

---

## 16. 最重要的一句话

Go Study 的价值不是多一个“资源管理器”。

而是：

> **当你想继续学习时，不需要重新搭建昨天的学习现场。**


---

## 17. 从 Preview 升级到正式版

Go Study 0.3.0 的永久插件 ID 是：

`go-study`

如果当前 Vault 曾经安装过测试版：

`go-study-preview`

正式版第一次启动时会在以下条件下自动迁移：

- 正式版自己的 `data.json` 还不存在；
- Preview 的 `data.json` 中存在有效项目 / 资源数据。

迁移时：

1. 原 Preview `data.json` **不会被修改或删除**；
2. Go Study 会额外创建一份 `saved-preview-migration-...` 恢复备份；
3. 数据写入正式版 `go-study/data.json`；
4. 确认正式版项目和设置都正常后，再停用 / 删除 Preview。

如果正式版已经拥有自己的 `data.json`，Go Study **不会**再自动用 Preview 覆盖它。

---

## 18. 开源与贡献

Go Study 使用 MIT License。

欢迎：

- 提交 Bug；
- 提交功能建议；
- 改进说明文档；
- 提交 Pull Request；
- 为其他视频平台设计 Adapter。

0.3.0 不会因为“国际化功能数量”临时加入未经验证的 YouTube 适配。未来平台支持优先由真实用户工作流推动。
