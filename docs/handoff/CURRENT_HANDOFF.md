# Go Study — 当前交接文档

> 新 ChatGPT / Codex / 开发者接手时先读本文件。

## 阅读顺序

1. `../PROJECT.md`
2. `../CURRENT.md`
3. 本文件
4. `../GLOSSARY.md`
5. 相关 `../decisions/`
6. `../ideas/IDEA_LEDGER.md`
7. `../AI_DEV_RULES.md`

## Current repository

唯一权威仓库：`z3093508903-rgb/learning-resource-hub-vnext`。

不要与 `learning-resource-hub`、`learning-resource-hub-next` 混淆。

## Current milestone

`0.3.0-beta.16 — Freeform jv:// 回链修复 / 真人验收`

## Verified GitHub state（2026-08-28）

- Development：`work/universal-capture-beta15` @ `ec854a9d5ca813e97f5c4f48b80f2afc3bf8de56`
- Preview：`preview/go-study-0.3.0-beta.15` @ `11acbda84255c1df3cdf56b9f46a689c7a5b1066`
- Tag：`go-study-preview-v0.3.0-beta.15`
- Preview Release：已发布
- Preview HEAD CI：失败；构建后的 `main.js` 与提交中的生成产物不一致
- Stable / Merge：HOLD

## beta.16 validation candidate

- Fix Branch：`fix/freeform-jv-reopen-v1`
- Current Branch HEAD：`7e8a0cc52277bb1f87fbbb3d8168b575964cfba1`
- Draft PR：#24
- Release：`Go Study Preview 0.3.0-beta.16`
- Tag：`go-study-preview-v0.3.0-beta.16`
- Release Target：`7fd6c15bae574af961b45e6263fdfaba07b81659`
- Automation：289/289 tests；full release validation PASS；committed main.js consistency PASS；isolated Preview package + asset verification PASS
- Manual Acceptance：PENDING


项目记忆 v1 已上传到 `origin/docs/project-memory-v1`，基于开发 HEAD `ec854a9`，当前尚未合入 beta.15 开发基线。该文档分支自身 HEAD 为动态状态，接手时应通过 Git / GitHub 实时核对，而不是依赖文档中的固定 SHA。

## What changed in the latest acceptance

- 真人复现 Freeform 回链 `Vault not found`；
- 根因定位到 `obsidian://go-study?...&path=...` 与 Obsidian 保留路由参数冲突；
- 确认 GitHub beta.15 仍是修复前代码；
- 已建立 GitHub 可恢复的 beta.16 Freeform 修复候选：新 Freeform 直接生成 `jv://`；旧 beta.15 Freeform 链接增加兼容拦截；
- 发现 Preview 打包必须保持目录、manifest ID 和 Preview 版本一致。

## What is verified

- 远端 Development / Preview HEAD 与 Release 元数据；
- 远端 Freeform builder 仍使用 `path`；
- Freeform reopen 失败可复现；
- 历史 `288 / 288` checkpoint 存在，但当前 CI 不是绿色；
- beta.16 远程候选已通过 289/289 tests、完整 release validation、`main.js` 一致性检查和 Preview 资产验证；历史 local-only commit 只作为排查线索。

## What is not verified

- beta.16 是否在真实 `go-study-preview` 冷启动成功；
- 修复后的链接是否真正打开 PotPlayer 并 seek；
- HUD、快捷键、Capture、Restart、OpenList、Bilibili、Vault lifecycle 和 Backup Restore 真人验收；
- 完整 release check 的最终绿色状态。

## Known bugs

1. Freeform `path` 链接可能先被 Obsidian 解释为 Vault 路径；
2. Preview 分支的生成 `main.js` 与源码不同步，CI 失败；
3. beta.16 仍只是自动化通过的 Preview 候选；在 Windows 真人验收前不能把直达 `jv://` 宣布为最终产品行为。

## Next action

安装 beta.16 并依次验收：新 Freeform `jv://` → 旧 beta.15 Freeform 兼容 → Managed Resource 回归。三项通过后再确认协议与更新 ADR；不要继续加大型功能。

## Do not change silently

- Go Study 不是纯视频插件；
- 视频增强是可选层；
- `Resource ID ≠ Locator ≠ Position`；
- Notes Box 不等于永久 Resource ↔ Note；
- Freeform 和 No-Timestamp Capture 必须保留；
- 不新增“返回 Obsidian”专属快捷键；
- 不把 AHK / Companion 重新变成正常 Runtime 的必要依赖；
- 不擅自加入 AI / Stats / Calendar / OCR。

## Git safety

未经用户明确批准：不 push、不创建 PR、不 merge、不改写历史、不删除 branch/worktree。分支不存在时先 fetch 和查看远端，不能直接重建。
