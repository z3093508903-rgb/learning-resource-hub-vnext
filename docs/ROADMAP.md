# Go Study — Roadmap

## Phase 0：Pre-RC 发布收口（现在）

目标：

不再增加新功能，把已经形成的核心学习链路在真实 Windows + Obsidian + PotPlayer 环境钉死，然后进入 Release Candidate。

当前核心链：

~~~text
Resource / Freeform
→ Start / Resume
→ PotPlayer
→ Alt+S HUD
→ Companion Markdown
→ timestamp-only backlink
→ Timeline note navigation
~~~

退出条件：

- data.json restart persistence PASS；
- external recovery / backup restore PASS；
- Capture Target 不错写；
- PotPlayer seek / current media / HUD PASS；
- Freeform Bilibili Ctrl+点击浏览器 PASS；
- Managed v3 resource-loss fallback PASS；
- legacy v1 relink PASS；
- Timeline 只出现在相关 Markdown，Hover 稳定，点击只定位笔记；
- Companion caret 行首 / 行中 / 行尾点击正常；
- light mode Add / Import / 保存位置 Modal 可读；
- named backup 不被自动 retention 删除；
- Obsidian 原生 file-tree / Markdown-tab 拖入 Study Mode：
  - 要么修复并真机 PASS；
  - 要么从首发功能声明中撤下，不能声称支持；
- release:check 全绿；
- 未经用户批准不 Merge Draft PR。

当前候选：beta20.9.1，详见 CURRENT.md 与 handoff/CURRENT_HANDOFF.md。

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
