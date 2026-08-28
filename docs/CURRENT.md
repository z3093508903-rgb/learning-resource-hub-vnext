# Go Study — 当前状态

更新时间：**2026-08-28（北京时间，UTC+8）**

> 本文件只保存“现在”的可恢复事实。历史过程见 `handoff/HISTORY.md` 与 `sessions/`。

## 唯一权威仓库

`z3093508903-rgb/learning-resource-hub-vnext`

历史仓库 `learning-resource-hub`、`learning-resource-hub-next` 不作为当前开发基线。

## 当前 Milestone

**Go Study `0.3.0-beta.18` — Companion Note Window / 真人验收**

Stable / Merge：**HOLD**

## 当前开发候选

- Branch：`work/companion-note-beta18`
- HEAD：`28208c9e244d0fcbe4fb1c7132bb800da09b0d67`
- Draft PR：**#26**
- Base：`work/portable-freeform-beta17`
- Preview：`Go Study Preview 0.3.0-beta.18`
- Tag：`go-study-preview-v0.3.0-beta.18`
- Release Target：`7eb7fa2f66e7b8df03335e168d0c4ed6e48d6cc0`

## 自动化状态

最终分支 CI #188：

- `npm run release:check` ✅
- committed `main.js` consistency ✅
- **307 / 307 tests passing**
- Build ✅
- Release validation ✅

beta.18 发布流水线：

- Full release validation ✅
- isolated `go-study-preview` packaging ✅
- prerelease upload ✅
- release asset verification ✅

## beta.17 Windows 验收

已确认：

- Freeform v2 `locator=` / `v=2` 回链可用；
- 未收录视频可以回到播放器与时间位置；
- 视频后来被收录后，历史 Freeform Link 可以动态升级为 Managed；
- beta.16 `jv://` 与 beta.15 legacy Freeform Link 兼容；
- 已收录 Resource 继续使用 Resource ID + Resolver；
- macOS / cross-device local path 仍延期。

## beta.17 Polish — 已进入 beta.18 Preview

- Freeform 可见标题统一为 `回到课程`，不再使用乱码播放器标题；
- HUD：同一方向快速双击可直接执行，保留原“方向 + Enter”；
- Quick Note Popup：可拖动、位置记忆、默认位置下移、滚动条弱化；
- Settings：HUD 映射压缩为紧凑面板；
- Template：编辑器与实时渲染预览相邻，输入时即时刷新，可折叠查看原始 Markdown。

## beta.18 Companion Note Window — 已实现 Preview 候选

### Window

- 使用 **真实 Obsidian Markdown pop-out leaf**；
- 默认 `播放器右侧栏` 窄高布局；
- 另有 `右侧半高` 布局；
- 支持 move / resize；
- 保存最后 Geometry（x/y/width/height）；
- 支持 70% / 80% / 82% / 90% / 100% Scale；
- 支持保存自定义 Layout；
- Companion Window 使用独立 CSS 隐藏 Ribbon / Sidebars / Status Bar / Tab chrome。

### Capture Target

优先级现在是：

```text
Locked Companion Note
→ Active Markdown
→ Remembered Markdown
```

小窗锁定后，即使 PotPlayer 或主 Obsidian 窗口获得焦点，Capture 仍应写入小窗中的真实 Markdown。

### Commands

- 在学习笔记小窗中打开当前笔记
- 恢复上次学习笔记小窗
- 切换学习笔记小窗 Capture 锁定
- 保存当前学习笔记小窗布局

### Settings

Go Study 设置页新增“学习笔记小窗”：

- 打开当前笔记
- 恢复上次
- Capture 锁定
- Layout 选择
- Scale
- 保存当前布局

## beta.18 真人验收仍需完成

### 高优先级

1. Preview cold start；
2. 从设置/命令打开真实 Markdown 小窗；
3. 小窗确实是可编辑的真实 Vault Note；
4. 默认宽高和位置是否接近 PotPlayer 右侧栏体验；
5. Move / resize / close / restore Geometry；
6. Scale 的光标、输入、选择、滚动是否正常；
7. Locked Companion Capture：PotPlayer 前台时 Alt+S 是否稳定写入该 Note；
8. Unlock 后是否恢复普通 Active/Remembered targeting；
9. 自定义 Layout 保存与恢复；
10. 主窗口与小窗编辑同一 Note 时的数据一致性。

### beta.17 Polish

- `Alt+S → ↑↑` 只执行一次；
- 原 `Alt+S → ↑ → Enter` 仍正常；
- Quick Note Popup 位置记忆；
- Freeform 标题不再乱码；
- Settings 模板实时预览的实际 UI；
- HUD 设置区域是否明显更紧凑。

### Regression

- Managed / Freeform backlink；
- Legacy Alt+1..Alt+4；
- Project Notes / Recent Note；
- No-Timestamp Capture；
- HUD 在没有 Companion Window 时仍正常。

## 明确延期

- macOS 本地视频精确 Player Adapter；
- cross-device Path Mapping / multi-locator / content fingerprint；
- Always-on-top（可选增强，非 beta.18 阻塞）；
- 自动吸附 PotPlayer；
- 完整 Study Workspace。

## 下一步

**不要继续加 beta.19 功能。**

先安装 beta.18 Preview，完成 Windows 真人验收。出现问题时只修当前 beta.18 边界。

真人验收通过后：

1. 将 beta.17 Polish 标记 accepted behavior；
2. 将 Companion Note Window MVP 标记 accepted behavior；
3. 更新 ADR-008；
4. 再决定是否 Merge / 进入下一轮。


## Legacy Next 共存冲突

Windows 实机发现：

- `go-study-preview` 与 `learning-resource-hub-next` 同时启用时，Go Study 可能无法完成启动；
- 关闭 `learning-resource-hub-next` 后，Go Study 可立即正常启用；
- 新 Vault 仅启用 Go Study 时同一 Preview 正常。

用户本地代码排查定位到：

```text
REFERENCE_ACTION = 'go-study'
registerObsidianProtocolHandler('go-study', ...)
```

两代插件均注册同一 Obsidian protocol action，冷启动 / 完整 reload 时可能发生重复注册冲突。

这解释了“昨晚曾共存、今天重载后失败”：之前的会话可能没有触发相同冷启动顺序，或其中一方没有重新执行 protocol registration。

当前临时策略：

- **只启用一个版本**；
- 推荐停用 legacy `learning-resource-hub-next`，保留 Go Study Preview；
- 不通过重命名现有 `obsidian://go-study` 协议来仓促修复，因为会影响已有笔记回链兼容。

后续最小修复候选：

1. Go Study 启动时检测 legacy Next 共存；
2. protocol registration 必须 fail-safe，重复注册不能让整个插件启动失败；
3. 检测到冲突时显示明确的兼容提示；
4. 再决定是否为 legacy Next 做条件注册 / 兼容迁移。

在真实兼容方案确定前，不声称两个插件支持共存。


## Companion HUD-first Study Mode

beta18 实机验收暴露的体验问题：

- PotPlayer 置顶/获焦点后，普通 Companion popout 会被压到后方；
- 若反复点击笔记和播放器，则回到 Alt+Tab / 焦点切换工作流，削弱小窗价值；
- 当前 Capture 仍把 PotPlayer 前台状态当作学习上下文的一部分。

已确认产品方向：

- 学习模式期间 Companion 应支持 Always-on-top，保持可见但不抢焦点；
- “播放视频 → 选择笔记”处增加“一键进入学习模式”；
- 一键流程自动打开右侧 Companion、锁定 Capture Target、打开视频并建立 Study Pair；
- 日常学习以 HUD 快捷键为主，小窗负责实时显示，深度编辑才主动获取焦点；
- Player Target / 后台 Capture 作为后续稳健性补全，避免用户偶尔点击小窗后 HUD 失效。

当前优先级：先验证 Windows 下 Companion Always-on-top + PotPlayer 置顶的真实 Z-order，再决定是否需要更高窗口层级。


## beta19-A：Study Mode Shell 已实现

开发分支：

`work/study-mode-beta19a`

Draft PR：

`#27 Go Study beta19-A: HUD-first Study Mode shell`

最终当前分支 HEAD：

`7002b1c14fcd97e15f4578dbd921e41e5c06a999`

CI：

- run #195 ✅
- release checks ✅
- committed `main.js` current ✅
- **314 / 314 tests PASS**

### 已实现

- “开始学习”现有 UI 保持主体结构不变；
- 点击笔记仍走普通学习模式；
- 最近笔记、项目笔记、Vault 搜索结果均可拖动；
- 弹窗右侧增加一个独立的小型 Study Mode Drop Target：
  - 拖入
  - 右侧小窗
  - 学习模式
- 将笔记拖到该小卡片后：
  - 选择该笔记作为本次学习目标；
  - 打开真实 Markdown Companion Window；
  - 应用现有 right-rail 布局；
  - 自动锁定 Capture Target；
  - 默认 Always-on-top；
  - 随后启动视频，使最终焦点自然回到 PotPlayer。
- Companion 增加图钉控制：
  - 默认置顶；
  - 可手动取消 / 恢复置顶；
  - 同时增加命令“切换学习笔记小窗置顶”。
- Companion native title 尝试缩短为纯笔记名，不再显示 Vault / Obsidian 冗余标题。
- 关闭 Companion = 退出 Study Mode；
- 退出 Study Mode 不关闭 PotPlayer。

### 明确未做

beta19-A 不实现 Player Session / 后台 Capture。

因此如果用户主动点击 Companion 并把焦点交给笔记窗口，当前 HUD 仍可能因为 PotPlayer 不在前台而拒绝 Capture。这是已确认的方案 A 边界，后续是否进入 beta19-B 再根据真实使用频率决定。
