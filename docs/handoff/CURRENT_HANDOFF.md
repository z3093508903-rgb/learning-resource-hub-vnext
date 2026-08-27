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

`0.3.0-beta.15 — Universal Capture / 真人验收与缺陷收敛`

## Verified GitHub state（2026-08-28）

- Development：`work/universal-capture-beta15` @ `ec854a9d5ca813e97f5c4f48b80f2afc3bf8de56`
- Preview：`preview/go-study-0.3.0-beta.15` @ `11acbda84255c1df3cdf56b9f46a689c7a5b1066`
- Tag：`go-study-preview-v0.3.0-beta.15`
- Preview Release：已发布
- Preview HEAD CI：失败；构建后的 `main.js` 与提交中的生成产物不一致
- Stable / Merge：HOLD

项目记忆正在本地 `docs/project-memory-v1` 分支建立，基于开发 HEAD `ec854a9`，未上传。

## What changed in the latest acceptance

- 真人复现 Freeform 回链 `Vault not found`；
- 根因定位到 `obsidian://go-study?...&path=...` 与 Obsidian 保留路由参数冲突；
- 确认 GitHub beta.15 仍是修复前代码；
- 本机存在未上传修复候选，但尚未形成可信真人验收；
- 发现 Preview 打包必须保持目录、manifest ID 和 Preview 版本一致。

## What is verified

- 远端 Development / Preview HEAD 与 Release 元数据；
- 远端 Freeform builder 仍使用 `path`；
- Freeform reopen 失败可复现；
- 历史 `288 / 288` checkpoint 存在，但当前 CI 不是绿色；
- 本地候选的 targeted/load 验证有通过记录。

## What is not verified

- 本地候选是否在真实 `go-study-preview` 冷启动成功；
- 修复后的链接是否真正打开 PotPlayer 并 seek；
- HUD、快捷键、Capture、Restart、OpenList、Bilibili、Vault lifecycle 和 Backup Restore 真人验收；
- 完整 release check 的最终绿色状态。

## Known bugs

1. Freeform `path` 链接可能先被 Obsidian 解释为 Vault 路径；
2. Preview 分支的生成 `main.js` 与源码不同步，CI 失败；
3. 本地修复候选尚未成为 GitHub 或正式 Preview 事实。

## Next action

先决定 Freeform 回链策略，然后在正确 beta.15 基线上做最小修复、正确 Preview 打包与真人 reopen 验收。不要继续加大型功能。

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
