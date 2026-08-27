# Go Study — 想法账本

状态统一使用：

- PROPOSED
- CONFIRMED
- DEFERRED
- REJECTED

---

## Study Workspace

状态：**DEFERRED**

灵感：

类似浏览器 Workspace，为每个 Project 恢复专属 Obsidian 学习环境。

可能实现：

- 第二个 Obsidian Window；
- Go Study Workspace View；
- 恢复相关 Leaves / Tabs。

暂缓原因：

先验证：

`Resource + Recent Note + Resume`

是否已经解决大多数摩擦。

---

## Markdown Heading 自动 Target

状态：**DEFERRED**

设想：

```text
Resource → Note → Heading Anchor
```

暂缓原因：

复杂度较高。

当前先验证：
- 打开正确 Note；
- Optional focus last line。

---

## Resource 永久绑定 Note

状态：**REJECTED**

原因：

真实学习关系是 many-to-many。

采用：
- Recent Note；
- Study Pair。

---

## AHK / Companion 作为必须依赖

状态：**REJECTED**

该“必须依赖”方案已被以下方案替代：

**Native Windows Implementation**

---

## 专属“返回 Obsidian”快捷键

状态：**REJECTED**

原因：

`Win+Tab` 已经解决。

---

## AI Summary / Stats / Calendar / OCR

状态：**DEFERRED**

当前为 Out of Scope，不是“忘记开发”；只有新的产品决策才能重新进入 Roadmap。

---

## Freeform 回链 reopen 协议

状态：**PROPOSED**

Decision gate：**NEEDS USER ACCEPTANCE**

当前验证候选（beta.16）：

- 新未收录 / Freeform 视频直接生成 `jv://open?path=...&time=...`；
- Managed Resource 继续使用 Resource ID + Resolver；
- 旧 beta.15 `obsidian://go-study?...&path=...` 增加点击拦截兼容；
- 自动化与 Preview 打包已通过，等待 Windows 真人验收；
- 真人验收通过前，本条状态保持 `PROPOSED`。

背景：

beta.15 使用 `obsidian://go-study?mode=freeform&path=...`，真人验收出现
`Vault not found`，因为 Obsidian 把 `path` 解释为 Vault 路由字段。

候选方案：

1. 继续使用 Go Study 自有 `obsidian://` 协议，改成非保留 locator 参数，并由插件处理普通点击；
2. 仅对未收录 Freeform 视频生成直达 `jv://` 兼容链接。

约束：

- Managed Resource 仍使用 Resource ID + Resolver；
- Freeform 仍必须允许 Capture；
- 不得把 AHK / Companion 恢复为整个 Go Study 的正常 Runtime 必需依赖；
- 旧链接兼容范围、跨设备性和 Web fallback 必须在决定前说明。
