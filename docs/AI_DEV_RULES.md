# Go Study — AI 开发规则

适用于：

- ChatGPT
- Codex
- 其他 Agent

## 开工前必须做

1. 阅读 `docs/PROJECT.md`
2. 阅读 `docs/CURRENT.md`
3. 阅读 `docs/handoff/CURRENT_HANDOFF.md`
4. 阅读相关 ADR
5. 搜索 `IDEA_LEDGER.md`
6. 确认仓库：
   `z3093508903-rgb/learning-resource-hub-vnext`
7. Fetch 最新远程状态
8. 确认 Branch + HEAD

## 本地找不到分支 ≠ GitHub 没有

先执行：

```bash
git remote -v
git fetch --all --prune
git branch -a
```

再判断。

## 不得静默重新定义

- Project
- Resource ID
- Locator
- Position
- Notes Box
- Recent Note
- Study Pair
- Managed
- Freeform
- Capture Action
- Template
- Resume

需要改变架构时：

先更新 / 新建 ADR。

## 不允许“顺手优化”加入

- Companion / AHK required dependency
- Path = Resource Identity
- Video Enhancement = Core Dependency
- Permanent Resource ↔ Note
- All Capture must have timestamp
- AI Summary
- Statistics
- Calendar
- OCR
- New global hotkey for every capture combination

## 测试策略

### 小范围修改

优先 targeted tests。

### Meaningful Checkpoint

涉及实现且符合发布检查边界时执行：

```bash
npm run release:check
```

包含：

- Syntax Check
- Build
- Tests
- Release Validation

纯文档任务不运行 build、test 或 `release:check`，只做 Markdown、链接与 diff 检查。

## 真人验收不可被自动测试替代

以下必须真机：

- Windows Global Shortcut
- HUD Focus
- PotPlayer Foreground
- Playback / Seek
- OpenList Auth
- Bilibili Network
- Restart Persistence
- Backup Restore

## Git 规则

- 未经用户明确批准不得 Merge PR；
- 不得擅自 Force Push / Rewrite History；
- 不得随意删除 Branch；
- 不得因为本地没看到 beta15 就重建同名分支；
- PR 编号必须结合当前仓库解释。

## 文档同步规则

重要决定：
→ ADR

新灵感：
→ Idea Ledger

Reject / Defer：
→ Idea Ledger

Checkpoint：
→ CURRENT + CURRENT_HANDOFF

Preview / Release：
→ CURRENT + Session / History

## 面向用户沟通

先用产品语言解释。

重要英文术语给一句中文注释。

每次修改后给：
- 改了什么；
- 为什么；
- 真机怎么验收。
