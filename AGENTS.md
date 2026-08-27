# Go Study Agent Bootstrap

## Canonical repository

唯一权威仓库：`z3093508903-rgb/learning-resource-hub-vnext`。

历史仓库 `learning-resource-hub`、`learning-resource-hub-next` 不得作为当前开发基线。

## Context bootstrap

任何 Agent 开工前按顺序读取：

1. `docs/PROJECT.md`
2. `docs/CURRENT.md`
3. `docs/handoff/CURRENT_HANDOFF.md`
4. `docs/GLOSSARY.md`
5. 与任务有关的 `docs/decisions/`
6. `docs/ideas/IDEA_LEDGER.md`
7. `docs/AI_DEV_RULES.md`

然后确认：

```bash
git remote -v
git fetch --all --prune
git branch --show-current
git status
git rev-parse HEAD
```

修改前向用户报告 Repository、Branch、HEAD、Milestone、已验证/未验证、Next Action 和相关产品边界。

`docs/CURRENT.md` 记录的是具名产品基线与 Preview 分支，不要求文档分支 HEAD 等于产品基线 HEAD。发现记录值与对应远端分支不一致时，先调查，不得静默回退或重建分支。

## Source of truth

长期事实优先级：

```text
当前 Git / GitHub 状态 + 仓库项目记忆文档 > 旧聊天摘要
```

聊天用于讨论；GitHub 用于保存经过确认的长期事实。动态字段必须重新核对。

项目文档中的人类可读日期与时间统一使用 **北京时间（UTC+8）**。GitHub / CI 原始时间戳如为 UTC，可保留原始值作为外部事实，但在项目状态说明中应同时给出或转换为北京时间，避免多套时区名称并存。

## Project memory protocol

只记录会影响未来开发或决策的信息，不复制完整聊天。

- 产品长期方向：`docs/PROJECT.md`
- 当前状态、Bug、测试和下一步：`docs/CURRENT.md`
- 重要设计决策：`docs/decisions/`
- 灵感和 Scope 状态：`docs/ideas/IDEA_LEDGER.md`
- 阶段交接：`docs/handoff/CURRENT_HANDOFF.md`

正式决策与 Idea 状态只使用 `CONFIRMED`、`PROPOSED`、`DEFERRED`、`REJECTED`；历史方案被替代时使用 `REJECTED` 并在正文注明替代关系。提出不等于进入 Roadmap。

Meaningful checkpoint（Feature、成组 Bug 修复、Architecture Decision、真人验收、Preview、Milestone 或主目标变化）必须同步检查 Code、Tests、CURRENT、HANDOFF、相关 ADR 和 Idea Ledger。

## Product boundaries

不得静默改变：

- Go Study 是学习资源工作台，不是纯视频笔记插件；
- 视频增强是 Optional Layer；
- `Resource ID ≠ Locator ≠ Position`；
- Notes Box 不代表永久 Resource ↔ Note 绑定；
- Freeform Video 必须允许 Capture；
- No-Timestamp Capture 是一等能力；
- 默认不增加“返回 Obsidian”专属快捷键；
- AHK / Companion 不得重新成为正常 Runtime 的必要依赖；
- 未经 Scope Decision 不加入 AI Summary / Statistics / Calendar / OCR。

需要改变这些原则时，先说明现有设计为何不足、会破坏什么和替代方案，更新 ADR，并等待用户确认。

## Testing and safety

- 小范围修改优先 targeted tests；完整 `release:check` 只在 Meaningful Checkpoint、发布准备或用户明确要求时运行，默认最多一次。
- 文档任务只做 Markdown、链接和 diff 检查，不运行 build/test/release:check。
- 自动测试不能替代 Windows Global Hotkey、HUD Focus、PotPlayer、OpenList、Bilibili、Restart Persistence 和 Backup Restore 真人验收。
- 只有用户明确提出时才增加或单独执行 SHA/hash 验证；不得删除已有发布/部署安全措施。
- 未经用户明确批准，不得 push、创建 PR、merge、force push、rewrite history 或删除 branch/worktree。
- 不读取、复制、修改或提交真实插件 `data.json`。

## Definition of done

```text
Code complete
+ relevant tests pass
+ manual acceptance status recorded when needed
+ CURRENT/HANDOFF synchronized at meaningful checkpoints
+ ADR/Idea Ledger synchronized when decisions or scope change
```

结束前确认：产品行为、CURRENT、ADR、Idea 状态和 HANDOFF 是否需要同步，以及无聊天上下文的新 Agent 能否继续。
