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

当前验证候选（beta.17）：

- 新未收录 / Freeform 视频使用 Go Study 自有 `obsidian://go-study?...locator=...&v=2`；
- Managed Resource 继续使用 Resource ID + Resolver；
- 旧 beta.15 `obsidian://go-study?...&path=...` 增加点击拦截兼容；
- 自动化与 Preview 打包已通过；
- Windows 真人功能链路已通过；
- macOS / cross-device local path 尚未验收，因此本条仍保持 `PROPOSED`。

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


---

## Cross-device local path mapping

状态：**PROPOSED**

背景：

beta.17 已使 Freeform 回链协议本身脱离 Windows `jv://`，但本地未收录视频仍可能携带设备绝对路径，例如：

- Windows：`D:\Course\lesson.mp4`
- macOS：`/Users/zl/Course/lesson.mp4`

单一绝对路径无法在另一台设备上凭空定位同一文件。

beta.17 当前策略：

1. 先 exact Managed match；
2. 再使用唯一媒体文件名进行 Managed upgrade；
3. 当前设备本地路径有效时走平台 fallback；
4. 外平台本地路径且无 Managed match 时明确失败，不猜路径。

未来候选：

- Device-specific path root mapping；
- Resource-level multi-locator；
- portable content fingerprint / media identity。

在真实跨设备需求验证前，不直接加入 Roadmap。

---

## beta.17 Polish

状态：**CONFIRMED / IMPLEMENTED IN beta.18 Preview, acceptance pending**

- HUD：同一方向键双击可直接执行，等价于方向 + Enter；
- 笔记弹窗：弱化滚动条 / 滑块，支持位置调整与记忆；
- 设置页：模板编辑器与实时实例预览相邻，并随输入实时更新；
- 设置页：HUD 映射 / 模板 / 示例重新分组，减少长页面堆叠；
- Freeform 可见标题乱码：统一为稳定的人类可读标签，不让 PotPlayer / Bridge title 污染笔记。

---

## Companion Note Window / 分屏小窗笔记

状态：**CONFIRMED — beta.18 scope / IMPLEMENTED IN PREVIEW, acceptance pending**

用户目标：

> 不依赖 Windows 系统分屏，能和 PotPlayer 边看边记，并让笔记结构更稳定。

视觉参考已经确认：默认大小接近 PotPlayer 右侧播放列表区域；小窗可以非常窄，但应通过 compact scale 保持完整真实 Markdown 编辑能力。用户可自由 resize，并保存多套布局。

当前已知边界：

- 必须编辑真实 Markdown Note，不创建第二套私有笔记格式；
- 与 `Project → Notes Box → Recent Note` 模型兼容；
- Capture 应明确写入“当前锁定的小窗笔记”，不能依赖哪个 Obsidian 窗口偶然获得焦点；
- 小窗应可独立拖动 / 调整尺寸，并恢复 geometry；
- 不新增专属“返回 Obsidian”快捷键；
- 不第一步就扩成完整 Study Workspace。

详细产品规格已进入 `docs/product/companion-note-window.md`。Always-on-top 仍作为可选项；具体 Obsidian popout/new-window 技术路线在实现前验证。
