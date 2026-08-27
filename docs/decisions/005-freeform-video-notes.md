# ADR-005：Managed 与 Freeform 视频笔记都必须是一等能力

状态：**CONFIRMED**

## 背景

实际使用发现：

- 用户自己打开 PotPlayer；
- 用户自己打开 Markdown；
- 视频增强就无法工作。

如果要求用户：

> “请先把这个视频加入 Project”

会造成不必要摩擦。

## 决策

### Managed
当前媒体能映射到已有 Go Study Resource。

### Freeform
当前媒体不属于 Go Study Resource。

两者都允许 Capture。

## 边界

Freeform 如果 Locator 变化，长期可恢复性比 Managed 弱。

不要伪装成等价的永久 Resource ID。

## beta.15 当前兼容行为

历史 Preview 方案曾考虑继续使用旧 `jv://` 跳转路径；这不是当前 beta.15 的既成事实，也尚未被确认成最终协议。

2026-08-28 真人验收发现：beta.15 的永久 Note Link 使用
`obsidian://go-study?mode=freeform&path=...`，其中 `path` 会被 Obsidian
全局路由误判为 Vault 路径，导致 `Vault not found`。远端 beta.15 尚未修复。

这不改变“Managed 与 Freeform 都允许 Capture”的决策，但具体 reopen 协议仍需确认：

- 保留 `obsidian://go-study` 并改用非保留参数；或
- 仅 Freeform 使用直达 `jv://` 兼容链接。

第二项不得被解释为恢复 AHK / Companion 作为正常 Runtime 的必需依赖；如要改变
ADR-003，必须另行做架构决策并等待用户确认。

## 否决行为

“不先加入 Project 就不能记笔记。”

否决。
