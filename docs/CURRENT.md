# Go Study — 当前状态

更新时间：**2026-08-28（Asia/Shanghai）**

> 本文件保持短小，并区分远端产品事实、本地候选和真人验收。文档分支 HEAD 不等于产品基线 HEAD 是正常情况。

## 当前唯一权威仓库

`z3093508903-rgb/learning-resource-hub-vnext`

历史仓库 `learning-resource-hub`、`learning-resource-hub-next` 不作为当前开发基线。

## 当前 Milestone

**Go Study `0.3.0-beta.15` — Universal Capture / 真人验收与缺陷收敛**

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

### 项目记忆配置分支

- Local branch：`docs/project-memory-v1`
- Base：`origin/work/universal-capture-beta15` @ `ec854a9`
- Remote：未上传

## 当前 CI / 自动化事实

- `288 / 288` 是 beta.15 的历史自动化 checkpoint，不代表当前 GitHub CI 绿色。
- Preview HEAD `11acbda` 的 GitHub CI run `33065679457` 为 **failure**。
- 失败发生在 release check 生成 `main.js` 后：提交中的生成产物与当前源码构建结果不一致，最终以非零状态结束。
- Preview Release 仍由独立发布流程成功生成；“Release 存在”不能替代 CI 绿色。

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

### 本地修复候选（未上传、未验收）

本机存在 `fix/beta15-freeform-reopen` 候选分支：

- `27d43dc`：Freeform URI 使用 `locator`，并在 Obsidian 内拦截普通点击；
- `105543c`：Windows 换行符测试兼容；
- `92137d8`：旧 Windows PowerShell 部署兼容。

候选曾通过 Freeform targeted tests、HUD targeted tests、bundle/load tests 与 release validation；完整 `release:check` 未在最后状态重新运行。

真人验收未完成。早期手工包曾错误使用 `learning-resource-hub-next` manifest 覆盖 `go-study-preview` 目录，因此不能作为产品行为证据。任何后续 Preview 包必须保持：

```text
folder = go-study-preview
manifest.id = go-study-preview
version = 0.3.0-beta.15（或明确的新版本）
```

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

Freeform 永久回链修复方案仍是 `PROPOSED`：

1. 保留 `obsidian://go-study`，改用非保留 locator 参数并由插件拦截；
2. 仅 Freeform 恢复直达 `jv://` 兼容链接。

不得把第二项扩展成“AHK / Companion 重新成为正常 Runtime 必需依赖”。选择方案前应结合真人复现、兼容范围和 ADR-003/005 决策。

## 下一步

1. 不继续增加大型功能；
2. 确认 Freeform 回链方案；
3. 从正确 beta.15 基线形成最小修复；
4. 使用正确 `go-study-preview` 身份打包；
5. targeted tests 后完成真人 reopen 验收；
6. Meaningful checkpoint 时修复生成产物漂移并执行一次完整 release check；
7. 同步 CURRENT、HANDOFF 和相关 ADR。
