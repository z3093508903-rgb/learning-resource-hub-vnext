# ADR-007：Freeform 永久笔记协议必须跨平台，平台播放器协议只能留在执行层

状态：**PROPOSED / Windows validation passed; macOS pending**

## 背景

beta.16 证明 Windows 的 `jv://open?path=...&time=...` 对 PotPlayer 跳转可靠，但 `jv://` 是 Windows 环境协议，不适合作为永久写进 Markdown 的跨平台链接。

同时 beta.15 的 `obsidian://go-study?...&path=...` 与 Obsidian 自身 `path` 路由参数发生冲突。

## 决策候选

beta.17 使用：

```text
obsidian://go-study
?mode=freeform
&locator=<media locator>
&name=<portable filename hint>
&position=time:<seconds>
&v=2
```

原则：

- 笔记协议归 Go Study 所有；
- 不使用 Obsidian 保留 `path=`；
- 不把 `jv://`、PotPlayer、IINA、VLC 等平台播放器协议写成永久笔记身份；
- 点击时先尝试解析为 Managed Resource；
- 找不到 Managed 时再交给平台 Player Adapter / compatibility fallback。

## 跨设备边界

协议跨平台 ≠ 本地绝对路径天然跨设备。

例如 macOS 与 Windows 的同一视频可能位于完全不同路径。

因此：

- exact locator match 优先；
- 唯一文件名可以作为受限升级 Hint；
- 不唯一时 fail closed；
- 无 Managed match 且本地路径属于另一平台时不得猜测；
- 未来如需求成立，再设计 Path Mapping / multi-locator / content fingerprint。

## 兼容

- beta.16 旧 `jv://` 链接继续可用；
- beta.15 `path=` Freeform 链接继续解析兼容；
- Managed Resource v1 链接不变。

### beta20.9.2 兼容细化

用户确认旧 `jv://open?... ` 主要用于其历史 Obsidian 笔记；未来新用户不需要承担这套历史依赖。

因此兼容边界进一步明确为：

- **Backward-compatible reader**：Go Study 可选读取旧 JV；
- **Modern writer**：新 Capture 永远继续写 Go Study 自有 `obsidian://go-study`；
- **Native runtime**：读取旧 JV 后转成内部 Freeform / Position，再交给当前 PotPlayer Adapter；不要求 `note2potplayer.exe` / AHK 成为正常 Runtime 依赖；
- 旧 JV 兼容通过高级开关显式启用，默认关闭，新用户无感；
- 兼容开关关闭时，不把 Legacy JV 行为混入正常 Go Study 链路。

beta20.9.2 已实现上述候选并通过自动验证，Windows 真人验收尚未完成，因此 ADR 总状态仍保持 PROPOSED。

## 验收

Windows beta.17 真人验证已通过：新 Freeform reopen、后续收录后的 Managed upgrade、beta.16 / beta.15 旧链接兼容、Managed Resource 回链回归。

macOS 与跨设备本地路径仍未真人验证，因此本 ADR 暂不升为 CONFIRMED。

跨设备 Path Mapping 明确延期，不阻塞 beta.17 Windows 收尾。
