# Go Study — 当前状态

更新时间：**2026-08-28（北京时间，UTC+8）**

> 本文件保持短小，并区分远端产品事实、本地候选和真人验收。文档分支 HEAD 不等于产品基线 HEAD 是正常情况。

## 当前唯一权威仓库

`z3093508903-rgb/learning-resource-hub-vnext`

历史仓库 `learning-resource-hub`、`learning-resource-hub-next` 不作为当前开发基线。

## 当前 Milestone

**Go Study `0.3.0-beta.16` — Freeform `jv://` 回链修复 / 真人验收**

Stable / Merge：**HOLD**。

## GitHub 产品基线（2026-08-28 已重新核对）

### 开发分支

- Branch：`work/universal-capture-beta15`
- HEAD：`ec854a9d5ca813e97f5c4f48b80f2afc3bf8de56`
- Subject：`polish(notes): clarify folder selection never auto-imports notes`

### Preview 分支与 Release

- Branch：`preview/go-study-0.3.0-beta.15`
- HEAD：`11acbda84255c1df3cdf56b9f46a689c7a5b1066`
- Tag：`go-study-preview-v0.3.0-beta.15`
- Release：`Go Study Preview 0.3.0-beta.15`
- Published：2026-08-27 11:03:32 UTC

Release 已发布且包含 Preview ZIP、`main.js`、`manifest.json`、`styles.css`、`TESTING.md`。

### beta.16 Freeform 修复候选

- Fix Branch：`fix/freeform-jv-reopen-v1`
- 当前远端 HEAD：`7e8a0cc52277bb1f87fbbb3d8168b575964cfba1`
- Validation PR：Draft PR #24，禁止在真人验收前 Merge
- Preview Tag：`go-study-preview-v0.3.0-beta.16`
- Release：`Go Study Preview 0.3.0-beta.16`
- Release Target：`7fd6c15bae574af961b45e6263fdfaba07b81659`
- 新 Freeform 回链：直接生成 `jv://open?path=...&time=HH:MM:SS`
- Managed Resource 回链：继续保持 `obsidian://go-study?resource=...`
- 旧 beta.15 Freeform `obsidian://go-study?...&path=...`：增加 Obsidian 内点击拦截兼容，尽量在默认 Vault 路由前交回 Go Study 处理
- 状态：**自动化通过，等待 Windows + Obsidian + PotPlayer 真人验收**


### 项目记忆配置分支

- Branch：`docs/project-memory-v1`
- Base：`origin/work/universal-capture-beta15` @ `ec854a9`
- Remote：`origin/docs/project-memory-v1`（已上传）
- Merge 状态：尚未合入 beta.15 开发基线
- 说明：项目记忆分支自身 HEAD 会随每次 Memory Sync 提交变化，因此不在 CURRENT 中固化；开工时通过 Git / GitHub 实时核对。

## 当前 CI / 自动化事实

- `288 / 288` 是 beta.15 的历史自动化 checkpoint。
- beta.16 修复候选完整发布验证为 **289 / 289 tests passing**。
- Preview HEAD `11acbda` 的 GitHub CI run `33065679457` 为 **failure**。
- 失败发生在 release check 生成 `main.js` 后：提交中的生成产物与当前源码构建结果不一致，最终以非零状态结束。
- Preview Release 仍由独立发布流程成功生成；“Release 存在”不能替代 CI 绿色。
- beta.16 Fix CI #167：`Run release checks` ✅，`Verify committed main.js is current` ✅。
- beta.16 发布流水线：Full release validation ✅、isolated Preview packaging ✅、prerelease upload ✅、release asset verification ✅。

文档配置任务不运行 build、test 或 `release:check`。

## beta.15 已实现范围

- Universal Capture 与 `Alt+S` Action HUD；
- timestamp / comment / screenshot 的 7 种非空组合；
- No-Timestamp Capture；
- Managed + Freeform 视频笔记；
- Project Notes Box / Deep Folder Picker；
- Legacy `Alt+1..Alt+4` 兼容；
- Native Windows/PotPlayer 为正常 Runtime 主路线。

## 当前已确认 Bug

### Freeform 回链被 Obsidian 路由误判

状态：**REPRODUCED / REMOTE UNFIXED**

beta.15 生成：

```text
obsidian://go-study?mode=freeform&path=...
```

Obsidian 会把保留参数 `path` 当成 Vault 路径，出现 `Vault not found`，未收录视频无法可靠回跳。

远端 `work/universal-capture-beta15` 和 Preview 分支仍使用 `path`，只对 Freeform Web 的 Ctrl+点击做特殊处理。

### 远程修复候选（VALIDATION CANDIDATE）

beta.15 的 local-only 尝试已被新的远程可恢复候选取代：

- Branch：`fix/freeform-jv-reopen-v1`
- Preview：`0.3.0-beta.16`
- 新 Freeform Link：直接使用原 `jv://open?path=...&time=...` 协议，不再先经过带 `path` 的 Obsidian 自定义 URI；
- Managed Resource：不变，仍使用 Resource ID + Resolver；
- 旧 beta.15 Freeform Link：保留兼容拦截尝试；
- 自动化：289/289 tests + build + release validation + committed `main.js` consistency 全部通过；
- 真人验收：**尚未完成**。

该方案只把 `jv://` 用于未收录 / Freeform 视频回链，不等于恢复 AHK / Companion 为整个 Go Study 的正常 Runtime 必需依赖。

## 真人验收状态

已确认：

- Freeform reopen 当前失败，可复现 `Vault not found`。

仍需验收：

- Preview cold start；
- `Alt+S` 注册、HUD Focus 与 7 种 Capture；
- No Timestamp、Managed、Freeform；
- 修复后的 Freeform reopen；
- Legacy `Alt+1..Alt+4`；
- Folder Picker / Project Notes；
- Restart Persistence；
- PotPlayer launch/seek；
- Bilibili、OpenList；
- Vault rename/delete/rebuild；
- Backup creation/retention/restore。

## 当前未决产品选择

Freeform 永久回链最终协议仍是 `PROPOSED`，但 beta.16 已选择方案 2 作为真人验证候选：

1. 保留 `obsidian://go-study`，改用非保留 locator 参数并由插件拦截；
2. **当前 beta.16 候选**：仅 Freeform 直接生成 `jv://` 兼容链接，同时尝试兼容旧 beta.15 Freeform 链接。

不得把第二项扩展成“AHK / Companion 重新成为正常 Runtime 必需依赖”。选择方案前应结合真人复现、兼容范围和 ADR-003/005 决策。

## 下一步

1. 安装隔离 Preview `Go Study 0.3.0-beta.16`，保留现有 `data.json`；
2. 验收新未收录本地视频生成的 `jv://` 回链能否直接打开 PotPlayer 并 seek；
3. 验收旧 beta.15 `obsidian://go-study?mode=freeform&path=...` 链接能否被兼容拦截；
4. 回归 Managed Resource 回链，确认仍是 Resource ID + Resolver；
5. 若三项真人验收通过，再把 Freeform 直达 `jv://` 从 PROPOSED 升级为 CONFIRMED，并更新 ADR；
6. 未经真人验收，不 Merge PR #24，不合入 beta.15/主线。
