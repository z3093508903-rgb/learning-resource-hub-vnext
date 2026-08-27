# Go Study — Roadmap

## Phase 0：beta.15 真人验收（现在）

目标：

证明 Universal Capture + Project Notes 能在真实 Windows + Obsidian 环境稳定工作。

退出条件：

- `CURRENT.md` 的 beta.15 真人验收项全部 PASS，或明确记录 Accepted Limitation；
- 视频增强关闭时普通资源管理仍正常；
- Native PotPlayer 路线不依赖 AutoHotkey / markdown2potplayer；
- Freeform 不要求先加入 Project；
- Restart Persistence 通过；
- Backup Restore 通过；
- Preview 包行为与文档一致；
- 准备 Merge 的分支 release check 通过。

## Phase 1：学习连续性稳定化

围绕：

> **继续学习**

重点：

- Recent Note；
- Resume；
- Resource ID 在 move/relink 后保持；
- Locator 失效时给用户清晰恢复路径；
- 管理操作继续后置。

暂时不要为了“更完整”就直接实现 Study Workspace。

## Phase 2：Capture 系统稳定化

- HUD Focus；
- Alt+S 快速方向执行；
- Preset 配置；
- Legacy Alt+1..4 兼容；
- Action 与 Template 解耦；
- Freeform → Managed 只有真实需求出现时再扩展。

## Phase 3：Integration 稳定性

### PotPlayer
- launch；
- seek；
- current media detection；
- identity ambiguous 时 fail closed。

### OpenList
- auth；
- browse；
- import；
- playback；
- relink；
- folder-prefix remap（如已实现）。

### Bilibili
- import；
- launch；
- network error；
- graceful failure。

### Vault
- rename；
- delete；
- rebuild；
- 删除索引不得误删真实文件。

## Deferred

### Study Workspace

状态：**DEFERRED**

灵感：

类似浏览器 Workspace，为每个 Project 恢复独立学习环境。

暂缓原因：

先验证：

`Resource + Recent Note + Resume`

是否已经解决大部分摩擦。

### Markdown Heading 自动定位

状态：**DEFERRED**

原因：

当前先做到“打开正确笔记 + 可选 focus last line”。

### AI / Stats / Calendar / OCR

状态：**DEFERRED**

当前不在产品范围；除非新产品决策明确开启。
