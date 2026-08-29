# Go Study

> 把“打开资源 → 进入学习 → 记录笔记 → 回到原位置继续”压缩成一个稳定的学习工作流。

Go Study 是一个面向 **Obsidian Desktop** 的学习工作台。

它解决的不是“把视频放进 Obsidian”，而是一个更日常的问题：

> **我明明只是想继续昨天的视频、记一句笔记，为什么每次都要重新找资源、打开播放器、切窗口、找笔记、手动写时间？**

Go Study 把资源、项目、播放位置和 Markdown 笔记连接起来，让你更快回到学习现场。

---

## 为什么做 Go Study

传统的视频学习流程通常像这样：

1. 找到课程文件或网页；
2. 打开 PotPlayer / 浏览器；
3. 找到上次看到的位置；
4. 打开 Obsidian；
5. 找到对应项目；
6. 找到对应笔记；
7. 手动记录时间；
8. 再切回视频继续。

Go Study 希望把它变成：

**项目 → 点资源 → 开始学习。**

需要记笔记时：

**Alt + S → 选动作 → 写一句话。**

就这么简单。

---

## 核心能力

### 1. 项目式学习资源工作台

把一个学习目标相关的内容放在同一个项目里：

- 本地视频
- OpenList 视频
- Bilibili
- Vault Markdown
- PDF / 网页 / 本地文件
- 任务与备忘

Go Study 不是单纯的视频插件，而是围绕“继续学习”设计的资源工作台。

### 2. 一键回到播放器

支持：

- PotPlayer 本地视频
- OpenList 视频
- Bilibili Freeform
- Bilibili 网页学习增强

保存时间点后，可以从 Markdown 直接回到对应视频与位置。

### 3. Companion 轻量笔记小窗

任意 Markdown 都可以拖入右侧 Companion 小窗：

- 可置顶
- 是真实 Obsidian Markdown
- 不要求必须打开 PotPlayer
- 可作为纯轻量笔记小窗
- Study Mode 下可锁定为 Capture 目标

### 4. HUD 快捷记录

按下：

`Alt + S`

可快速记录：

- 时间戳
- 纯笔记
- 评论 + 时间戳
- PotPlayer 截图类动作

视频继续在原来的播放器中，笔记写回真实 Markdown。

### 5. Bilibili 网页学习

安装可选的 **Go Study Bilibili Bridge** 后，可以直接在 Chrome / Edge 的 B站网页里学习：

- 读取当前网页视频时间
- Alt + S 记录时间戳
- 写入 Companion / Markdown
- 生成 Bilibili 原生 `t=` 时间链接

不需要为了 B站网页学习先配置 PotPlayer 网络播放。

### 6. 轻量 Timeline

视频笔记可以显示轻量时间线：

- 默认收起
- 一条视频 / 来源一个轻量节点
- hover 展开
- 点击定位到 Markdown 对应行
- 正文里的时间戳负责打开视频

Timeline 用来“看笔记结构”，不是再造一个视频播放器。

### 7. 数据安全

Go Study 会：

- 在加载和保存前保护 `data.json`
- 阻止异常的“有数据 → 空数据”覆盖
- 创建自动恢复快照
- 支持命名长期备份
- 支持从备份列表中选择任意历史备份恢复

数据仍保存在你的本地 Obsidian 环境中。

---

## 两种使用方式

### 轻量用户

```text
Bilibili 网页
+ Go Study Bilibili Bridge
+ Companion
+ Alt + S
```

不需要 PotPlayer。

### 进阶用户

```text
PotPlayer
+ 本地视频 / OpenList
+ Companion
+ HUD
+ 截图
+ 时间戳
```

适合需要播放器控制和更完整视频学习工作流的用户。

---

## 安装

Go Study 当前是 Desktop-only 插件。

推荐通过 GitHub Releases 下载正式版本。

正式版目录建议为：

```text
<Vault>/.obsidian/plugins/go-study/
├─ main.js
├─ manifest.json
└─ styles.css
```

然后：

1. 重启或重新加载 Obsidian；
2. 设置 → 第三方插件；
3. 启用 Go Study。

### Bilibili 网页增强

如果需要 B站网页时间戳/HUD：

1. 下载 `Go Study Bilibili Bridge`；
2. 解压；
3. Chrome / Edge → 扩展管理；
4. 开启开发者模式；
5. 加载解压缩的扩展；
6. Go Study 设置页会显示桥接“已启动 / 已连接”。

目前浏览器桥接通过“加载解压缩的扩展”安装；后续如有正式商店版本会再简化。

---

## Free & Open Source

**Go Study is free and open source.**

**Core features will not be locked behind a paywall.**  
If this project saves you time, you can optionally support its continued development.

> **Go Study 免费且开源，当前核心学习功能将永久免费且开源，不会在未来被移到付费墙后。**
>
> 如果它确实帮你节省了一些时间，可以选择赞助项目继续开发。

未来只有在新增**需要持续运营成本**的能力时，例如：

- AI 服务
- 云同步
- 托管服务
- 其他需要持续服务器 / API 成本的在线能力

才可能提供**可选付费服务**。

这些未来服务不会改变 0.3.0 已经提供的核心功能的免费与开源承诺。

### Support Go Study

如果你愿意支持项目，可以从正式项目主页查看赞助方式：

`https://github.com/z3093508903-rgb/go-study`

赞助完全自愿，不会影响功能、更新或使用体验。

---

## 关于 Bilibili 与 YouTube

Go Study 0.3.0 的网页视频增强首先针对 **Bilibili** 做了专门适配，因为首版主要围绕已经实际验证的中国用户视频学习工作流开发。

当前：

- Bilibili Web Bridge：有专门适配与实机验证；
- YouTube：**暂时没有专门的视频时间戳 / HUD Bridge 适配**；
- 其他网页视频：可以继续把 Companion 当作独立置顶 Markdown 小窗使用，但不承诺自动读取网页播放器时间。

这不是永久限制，也不是 0.3.0 的缺陷修复项。

如果未来有足够的海外用户需求，会再基于真实使用习惯设计 YouTube / 其他平台 Adapter，而不是为了首发“支持平台更多”仓促加入未经验证的实现。

---

## 兼容边界

正式兼容承诺：

- 当前 Go Study 资源 / 回链格式；
- 历史 `jv://open?... ` 链接（开启 Legacy JV Compatibility 后）。

开发阶段中间 beta 产生的实验型 PotPlayer 链接，不作为长期 Stable 兼容承诺。

---

## 权限与网络访问

Go Study 是 Desktop-only 插件，会使用 Node.js / Electron 能力完成本地学习工作流。

它可能访问：

- 你明确选择的本地文件或文件夹；
- PotPlayer 可执行文件，用于启动本地 / OpenList 视频；
- 你自己配置的 OpenList 服务；
- Bilibili 公共页面 / 接口；
- 本机 `127.0.0.1`，用于可选的 Bilibili Bridge；
- Vault 的插件目录与 `.obsidian/go-study-recovery`，用于状态和恢复备份。

Go Study 不包含客户端遥测，也不会把你的 Markdown 笔记上传到 Go Study 服务器。

---

## 隐私

- 无广告
- 无遥测
- 不上传你的 Obsidian 笔记
- Bilibili Bridge 只通过 `127.0.0.1` 与本机 Go Study 通讯
- OpenList 只访问用户自己配置的服务
- 本地文件扫描只扫描用户明确选择的位置

---

## 当前版本

**Go Study 0.3.0** 是第一个公开稳定版本。

已经覆盖：

- 资源中心 / 项目学习
- PotPlayer
- OpenList
- Bilibili Freeform
- Bilibili Web Bridge
- Companion
- HUD
- Timeline
- Native Markdown Drag
- Backup / Restore
- Legacy JV compatibility

完整用户说明见：

`docs/USER_GUIDE.md`

单页产品介绍见：

`docs/index.html`

---

## License

MIT License.
