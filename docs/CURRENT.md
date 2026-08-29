# Go Study — 当前状态

更新时间：**2026-08-29（北京时间，UTC+8）**

> 本文件只保存“现在”的可恢复事实。历史过程见 `handoff/HISTORY.md` 与 `sessions/`。

## 唯一权威仓库

`z3093508903-rgb/learning-resource-hub-vnext`

历史仓库 `learning-resource-hub`、`learning-resource-hub-next` 不作为当前开发基线。

## 当前 Milestone

**Go Study 0.3.0-beta.20.11 — Pre-RC / Companion Polish & Standalone Note Window**

Stable / Merge：**HOLD**

当前不是功能扩展阶段。核心产品链路已经形成，主要剩真机收尾与发布阻断项。

## 当前开发候选

- Branch：fix/companion-polish-beta20-11
- Base：fix/native-obsidian-drag-beta20-10
- Draft PR：尚未创建
- Current HEAD：2d0015ab52fbb7aaed2ec16e85391f312b376b0d
- Preview 发布目标：e0a68f259274fe737da4fb874ae77695132bfb19
- Preview：Go Study Preview 0.3.0-beta.20.11
- Tag：go-study-preview-v0.3.0-beta.20.11
- ZIP SHA256：4f2f5a25d7592306b8240aff45cd47613ac20b15c35329b8b924afb935287cda

## 自动化状态

- beta20.11 validator run #2 ✅
- Preview publisher ✅
- **394 / 394 tests PASS**
- build：37 modules / 752289 bytes ✅
- committed main.js consistency ✅
- release validation ✅
- Release readiness check ✅

第一次 validator 仅有 1 个测试断言仍检查旧函数边界，代码逻辑本身已通过其余 393 项；修正测试后第 2 次全绿。


## 当前发布阻断 / 未关闭

1. beta20.9.3 Windows 真人验收已全部 PASS：PotPlayer 自动发现 / Resource Center 播放 / Freeform 普通点击与 seek / Ctrl+点击 Browser / Legacy JV compatibility 均正常；当前最高优先级转为 Obsidian 原生左侧文件树 / 已打开 Markdown tab 拖入 Study Mode；
2. beta20.10 Native Obsidian Drag 已真人确认可用，并保持普通 Obsidian 拖动边界；beta20.11 正在收口 Companion 体验：项目笔记盒拖入、无 PotPlayer 纯笔记小窗、成功提示乱码、长笔记焦点/滚动；
3. Companion caret 点击定位在 beta20.7 修复后缺少最终实机确认；
4. Managed v3 fallback、legacy v1 relink、light-mode modal、named backup 需要最终 RC 回归；
5. data.json 自动归零事故已做 fail-closed + external recovery；用户后续未再次报告归零，但 RC 前仍需 restart ×2 + restore 复验。

详细交接：docs/handoff/CURRENT_HANDOFF.md

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


## beta19-A Windows 实机验收通过

用户在 Windows / Obsidian 实机确认 beta19-A：

- Study Mode 拖拽入口工作正常；
- Companion 右侧小窗流程顺手；
- 默认置顶 + 图钉切换符合预期；
- 普通点击与拖拽学习模式语义没有冲突；
- 当前整体工作流已符合预期，可进入下一阶段。

结论：

**beta19-A core = ACCEPTED-AS-BEHAVIOR（Windows）**

后续不再继续扩展 beta19-A 功能，进入 beta19-B：
- Freeform / 未收录零散视频工作流补齐；
- Web 时间戳兼容性，优先 Bilibili；
- 继续保持 HUD-first，不引入 Player Session，除非实机再次证明必要。


## beta19-B Freeform Web Timeline

开发分支：

`work/study-mode-beta19b`

Draft PR：

`#28 Go Study beta19-B: Freeform web timeline compatibility`

当前已完成第一切片：

- Freeform v2 可在永久回链中保存可选 `web` source；
- Ctrl+点击 Freeform HTTP(S) 仍打开浏览器；
- Bilibili 常规视频 URL 会保留现有 query（包括 `p`）并写入 `t=<captured seconds>`；
- 非 Bilibili HTTP(S) Ctrl+点击保持原 URL，不冒充支持时间跳转；
- 普通点击的 Windows PotPlayer/JV 精确回链行为不变。

最终当前 HEAD：

`ee0b7fc8f3045ecaf92bda75745f7d634b3cd849`

CI：

- run #202 ✅
- **318 / 318 tests PASS**
- committed `main.js` current ✅

仍未完成：

- 未收录零散视频如何通过 Study Mode UI 绑定当前已打开的 PotPlayer，会在下一切片处理；
- 如果 PotPlayer 只暴露 Bilibili CDN/媒体流 URL，而不是 Bilibili 页面 URL，当前无法凭空恢复 canonical page。


## beta20：Lightweight Timeline Navigator

开发分支：

`work/timeline-navigator-beta20`

Draft PR：

`#29 Go Study beta20: Lightweight Timeline Navigator`

当前开发 HEAD：

`91916d440b30ca5c95bd191ee2bc9258949aa12c`

CI：

- run #209 ✅
- **325 / 325 tests PASS**
- committed `main.js` current ✅

Preview：

- `Go Study Preview 0.3.0-beta.20`
- tag `go-study-preview-v0.3.0-beta.20`
- ZIP SHA256 `3500cf42965fcd0c7dc4278421104b683d6a34d73d262147ad4e2984c773f035`

### 产品决定

悬浮时间线属于 **可选的视频功能增强**，默认关闭。

视觉规则：

- 平时只显示 Markdown 右边缘的一根极细线和少量点；
- 鼠标移动到指定区域才轻微展开；
- 展开仍保持透明背景；
- 不做卡片式时间线；
- 不抢占 Companion 的阅读空间；
- 没有 Go Study 时间戳的普通 Markdown 不显示任何时间线 UI。

### 多视频笔记

同一 Markdown 可以包含多个不同视频的时间戳。

Timeline 不把所有时间混为一根伪时间轴，而是读取 Go Study 回链中的来源元数据并按视频分组：

1. Managed Resource ID → 当前 Resource title；
2. Freeform 若可唯一升级为 Managed → 合并到 Resource；
3. Freeform hidden media title；
4. portable filename / web host fallback。

### 时间戳来源 metadata

新 Freeform 回链可在 URI 内隐藏保存：

- `locator`
- `name`
- `title`
- `web`
- `position`

其中 `title` 用于记住本地视频 / PotPlayer 当前媒体的人类可读标题。可见 Markdown 仍保持简洁的“回到课程 · time”，不会额外污染正文。

### 点击语义

- 普通点击 Timeline 时间点 → 复用现有 Go Study 精确回链；
- Ctrl/Cmd + 点击 → 若存在网页来源则浏览器打开；
- Bilibili → 保留 `p` 并应用 `t=<seconds>`。

当前仍处于真实 Obsidian UI 验收阶段，PR 不合并。


## beta20.1：Timeline Mount Hotfix

Windows 实机反馈：beta20 中“启用视频笔记增强”和“悬浮时间线”均已开启，当前 Markdown 也包含多条 Go Study 时间戳，但右侧 rail 完全没有出现。

已按 Obsidian 实机挂载问题修复：

- 优先使用真实 Markdown `.view-content`；
- 当 editor/source text 不可用时，从渲染后的 `obsidian://go-study` anchors 回退解析；
- Timeline 不再挂在 CodeMirror / Markdown preview 内部，而是挂到对应窗口的 `document.body`；
- 使用 fixed positioning 对齐当前 Markdown view rect，避免 overflow / stacking context 把 rail 裁掉或压在编辑器下；
- scroll / resize 时重新定位；
- 透明、Hover 轻展开的视觉规则保持不变。

Hotfix：
- branch `fix/timeline-mount-beta20-1`
- Draft PR #30
- Preview `Go Study Preview 0.3.0-beta.20.1`
- CI #213 PASS
- **327 / 327 tests PASS**
- ZIP SHA256 `d7d6f9fe2c868e168b4086fee52809f26452dcb6e99d1ffa52a3f3d554ec18d4`

仍需用户 Windows / Obsidian 实机复验，PR 不合并。


## beta20.3：Timeline Parser Hotfix

Windows 实机 beta20.2 诊断结果：

- 视频增强 ON
- Timeline ON
- Markdown YES
- 原始 Go Study 链接 7
- 渲染链接 0
- 来源 0
- 时间点 0
- 挂载 0

这把故障范围从“设置 / UI 挂载”进一步缩小到 **Timeline reference parsing / grouping**。

用户上传的真实笔记包含 7 条 Managed v1 回链、4 个不同 Resource ID。已将这 7 条真实 URI 形状加入回归测试。

修复：
- Timeline 先使用严格 `parseReferenceUri`；
- 若真实 Electron/Chromium custom-scheme URL 解析失败，则只对精确的 `obsidian://go-study?` query 形式启用 fallback；
- fallback 使用 `URLSearchParams` 拆 query，再交给已有 `parseProtocolParams` 校验，因此不放宽原有安全边界；
- 诊断新增 `解析失败 N` 与首个解析错误。

Hotfix：
- branch `fix/timeline-parser-beta20-3`
- Draft PR #32
- Preview `Go Study Preview 0.3.0-beta.20.3`
- CI #227 PASS
- **331 / 331 tests PASS**
- ZIP SHA256 `2fdfb9833a208df549d47ea92327b272ed8c43726a65020718cdb8e6fbf53e37`

对用户上传的测试笔记，修复后的预期诊断：
- 原始链接 7
- 来源 4
- 时间点 7
- 解析失败 0
- 挂载 1


## beta20.4：Timeline Hover Stability Hotfix

Windows 实机 beta20.3 已能正常显示悬浮时间线，但鼠标移入后出现快速闪烁 / 展开收起循环。

根因确认：
- beta20.2 为了追踪 Markdown DOM 变化，对整个 document.body 使用 MutationObserver；
- Timeline 自己在刷新时 remove/add overlay；
- 这些自身 DOM 变化又触发 MutationObserver；
- observer 再次 schedule refresh，形成自激刷新循环；
- Hover 中 DOM 被反复重建，因此表现为闪烁。

修复：
- MutationObserver 忽略仅由 Timeline 自身 overlay 引起的 mutation；
- 为当前 source/time 模型生成稳定 signature；
- signature 未变化时复用已有 Timeline DOM，只做位置同步；
- routine refresh 不再销毁正在 hover 的 rail；
- 视觉方案保持透明、轻量、Hover 展开。

Hotfix：
- branch `fix/timeline-hover-stability-beta20-4`
- Draft PR #33
- Preview `Go Study Preview 0.3.0-beta.20.4`
- CI #232 PASS
- **334 / 334 tests PASS**
- ZIP SHA256 `4a54df0bfd288fdb47709b2fda740cc1656e92b56d4afc23623f405a49e7a6b0`


## beta20.5：Timeline 改为笔记内导航

用户实机确认 beta20.4 的 Hover 稳定性问题已解决，并进一步明确 Timeline Navigator 的产品职责：

> 悬浮时间线用于更快找到知识点、定位笔记位置，而不是作为第二个视频 / 网页启动入口。

因此 beta20.5 修改：

- 点击 Timeline 时间点 → 导航到当前 Markdown 中对应的时间戳行；
- 定位后做轻微视觉 pulse，帮助用户找到知识点；
- Timeline 不再负责 Ctrl+点击网页或直接启动视频；
- 真正的视频回跳仍由正文中的“回到课程” backlink 负责；
- Timeline 只允许出现在**当前 active Markdown 且该笔记本身包含 Go Study 时间戳**时；
- 切换到普通笔记、Go Study Workbench、Settings 或其他非相关页面时，旧 overlay 立即清除；
- 保留 beta20.4 的稳定 Hover DOM 复用机制。

Hotfix：
- branch `fix/timeline-note-navigation-beta20-5`
- Draft PR #34
- Preview `Go Study Preview 0.3.0-beta.20.5`
- CI #238 PASS
- **337 / 337 tests PASS**
- ZIP SHA256 `869652f154512285e88f2a933dfe37564aecb488899161108449ac60ccbae61a`


## beta20.6：发布前 P0 收口

用户确认 Timeline 的产品职责最终固定为：

- 正文时间戳 = 回到视频位置；
- 悬浮时间线 = 当前笔记内知识点导航；
- Timeline 只负责 Go Study 时间戳；
- Timeline 右侧展开辅助显示视频来源；
- 正文不需要显示视频标题，来源 metadata 保留在 URI / Resource 中；
- Timeline 折叠 rail 的点数 = 视频来源数量，而不是时间戳数量。

### 时间戳视觉

默认 backlink template 改为：

`[{time}]({uri})`

即默认正文只显示：

`00:35`

不再显示“↗ 回到课程”，也不默认显示视频标题，不增加 tooltip。

仓库 `styles.css` 增加 Go Study 时间戳小胶囊样式，并去掉自定义协议链接的外链图标视觉污染。

为避免破坏用户配置：
- 旧默认模板 `[↗ {title} · {time}]({uri})` 自动迁移为新 timestamp-only 默认；
- 用户自己修改过的模板不会被覆盖。

### Timeline rail

折叠状态改为：
- 1 个视频来源 → 1 个点；
- N 个视频来源 → N 个点；
- 同一来源存在多个时间戳也只占 1 个点。

Hover 展开后仍显示：
- 来源标题；
- 该来源对应的时间点；
- 点击时间点只定位到当前笔记对应行。

### 零散视频 Study Mode

补齐导航页入口：

- Go Study 项目导航中的 Markdown 项目文件现在可拖动；
- Drag 开始时出现与“开始学习”相同的右侧小窗 Study Mode drop target；
- Drop 时读取**已经打开的当前 PotPlayer 媒体**，使用 `foregroundOnly: false`；
- 不重新启动 / 替换 PotPlayer 当前视频；
- 不强制把媒体收录为 Resource；
- 打开 Companion right-rail，锁定该 Markdown 为 Capture Target；
- Study Mode state 保存临时 `freeformMedia` context；
- HUD 后续仍通过当前 PotPlayer 媒体解析 Managed / Freeform。

### 发布验收

新增：

`docs/release-final-acceptance-checklist.md`

覆盖：
- timestamp capsule；
- Timeline scope / hover / multi-source / note navigation；
- Freeform Study Mode；
- HUD / Companion；
- Resume / Vault lifecycle；
- OpenList / Bilibili / PotPlayer；
- persistence / backup restore；
- fresh install / upgrade；
- Publish / Hold 判定。

开发：
- branch `work/release-p0-beta20-6`
- Draft PR #35
- Preview `Go Study Preview 0.3.0-beta.20.6`
- release target `74b2fd41d405f6c70bb9d561dcae1d8e1785218f`
- **345 / 345 tests PASS**
- CI #244 PASS（P0 bundle current）
- ZIP SHA256 `a5a6ebe78d3bf4d24627900831c2f75df646ac0fef74bf3e2676b084893cb5bf`

状态：VALIDATING。等待 Windows 实机 P0 验收，不合并。


## beta20.7：Obsidian 原生拖动 + Companion 光标修复

beta20.6 Windows 实机发现两个发布前阻断体验：

1. Study Mode 拖入入口只覆盖 Go Study 工作台项目笔记，Obsidian 原生左侧文件树与已打开 Markdown 标签页拖动时不会出现入口；
2. Companion 小窗虽然是真实 Markdown Editor，但鼠标点击位置与光标落点存在明显错位感，难以像普通笔记一样控制输入位置。

### 原生 Obsidian Markdown 拖动

新增 document-level Study Mode drag bridge：

- 原生文件树通过 `data-path` 识别 Markdown；
- 已打开标签页通过 `workspace.getLeavesOfType('markdown') + leaf.tabHeaderEl` 解析真实文件路径；
- 正常 HTML5 `dragstart` 可直接触发；
- 对可能采用 pointer drag 的标签页额外加入 8px pointer-move threshold fallback；
- pointer 模式释放在 drop target 内也可完成 Drop；
- 出现与已有 Study Mode 相同的右侧浮动入口；
- Drop 后读取当前已经打开的 PotPlayer 媒体（`foregroundOnly: false`）；
- 不重启 PotPlayer，不强制收录 Resource；
- Go Study 工作台自身拖动行被 native bridge 排除，避免双 drop target。

### Companion 光标错位

根因高度指向 beta18 Companion CSS：

`workspace-leaf-content { zoom: var(--go-study-companion-scale) }`

CSS zoom 会缩放 CodeMirror 所在容器，在 Electron / Chromium 下可能造成可视坐标与 editor hit-testing 坐标不同步。

修复：
- CodeMirror 所在 workspace leaf 强制 `zoom: 1 !important`；
- 不再缩放交互坐标系；
- 视觉紧凑改为仅通过字体尺寸 `calc(1em * var(--go-study-companion-scale))` 实现；
- 目标：鼠标点哪里，Caret 就落到哪里，行为与普通 Obsidian Markdown 一致。

Hotfix：
- branch `fix/native-drag-companion-cursor-beta20-7`
- Draft PR #36
- Preview `Go Study Preview 0.3.0-beta.20.7`
- release target `d80de6eaf529ea1701064964feb222e8f3ea317b`
- CI #252 PASS
- **349 / 349 tests PASS**
- ZIP SHA256 `c43d4aa855f11682a20fc5a5b6f34909d9ba4f9f8da0fc131cb8a30403fcb95b`

状态：VALIDATING。重点等待 Windows 实机确认：
- 左文件树 Markdown 拖动入口；
- 已打开 Markdown tab 拖动入口；
- Companion 行首 / 行中 / 行尾点击光标落点。


## beta20.8：Fail-Closed 数据安全修复

Windows 实机发现发布阻断级数据事故：

- 重启 Obsidian 后，原本有项目/资源的 `data.json` 可能被覆盖成空状态；
- 手工把旧 `data.json` 复制回去，再打开 Obsidian 仍可能再次被归零；
- 旧“自动备份保留数量”设置具有误导性：实际上主要只在资源清理前创建插件目录内备份，并非真正自动快照。

### 新安全边界

1. 插件启动读取之前，先直接保护当前原始 `data.json`；
2. 恢复快照移到插件目录之外：
   `<Vault>/.obsidian/go-study-recovery/`
3. 若 Obsidian `loadData()` 返回空状态，但原始 `data.json` 明明有项目/资源，则优先使用已保护的原始状态；
4. 若 normalize/migration 会导致“有数据 → 近似全空”，进入只读安全状态并拒绝写入；
5. 每次 persist 前执行 populated → empty catastrophe guard；
6. 后续保存前滚动保护上一份磁盘状态；
7. 手动备份也写入同一个外部 recovery 目录；
8. Restore 在覆盖前重新做迁移安全检查；
9. 设置页现在明确显示：
   - 恢复备份位置
   - 当前 data.json 路径
   - 打开备份文件夹
   - 立即备份
   - 恢复最近备份
10. recovery 数量按现有 3–10 retention 设置实际裁剪。

### 当前开发

- branch `fix/state-safety-native-drag-beta20-8`
- Draft PR #37
- latest validated HEAD `115e4da66157a07135a4207317b441d2566ec8b8`
- CI #264 PASS
- **356 / 356 tests PASS**
- Preview `Go Study Preview 0.3.0-beta.20.8`
- release target `c886e1afb4df93623834d83f200898332de7ce6f`
- ZIP SHA256 `770c168a79dd3f16cbbc4ba8afa69e77f31a3f60a291298a8f73b39dedbb083e`

状态：VALIDATING。发布前必须通过“重启两次 + 手工备份恢复 + 原 data.json 不再被空状态覆盖”实机验收。


## beta20.9：Portable Backlink / Legacy Relink / Named Backup

beta20.8 数据安全轮用户实机确认可继续进入下一轮。随后暴露新的发布前兼容问题：

1. 旧 Managed 回链仅保存 Resource ID；如果重装插件 / 更换设备 / data.json 丢失，Markdown 虽然还在，但 Resource ID 无法解析；
2. Managed Bilibili 回链 Ctrl+点击不能像 Freeform 一样打开浏览器；
3. 浅色模式下部分独立 Modal（尤其添加 / 导入 / “选择保存位置”）因 CSS 变量只定义在 Workbench root，出现白字白底；
4. 手动备份需要可命名 / 重命名，并且不能被自动 3～10 份 retention 清理；
5. 完整跨设备 / 账号同步需求存在，但当前明确延期，只记录方案，不在本轮实现。

### 新 Managed v3 回链

新增 `PORTABLE_MANAGED_REFERENCE_VERSION = 3`。

新的 Managed 时间戳继续以 Resource ID 为首要身份，同时在 URI 内隐藏携带可恢复来源：

- `locator`
- `name`
- `title`
- `web`
- `position`

可见 Markdown 仍然只有时间戳胶囊，例如：

`00:35`

不显示视频标题或来源 metadata。

恢复顺序：

1. 当前 Resource ID；
2. 已保存的 legacy alias；
3. v3 locator 精确匹配当前 Resource；
4. v3 portable name 唯一匹配；
5. v3 直接降级为 Freeform 打开，不强制重新收录；
6. legacy v1 尝试从 recovery / legacy backup 中按旧 Resource ID 找回；
7. 若仍找不到，弹出“重新关联旧时间戳”，用户重新收录一次对应视频并选择 Resource；
8. 保存 `uiState.referenceAliases[oldResourceId] = currentResourceId`，以后同一旧 ID 的回链自动复用。

重要事实边界：

> 旧 v1 回链本身只有 Resource ID + position。如果当前 Resource、data.json、recovery / backup 都已消失，就无法从链接本身数学上反推出原始 URL / 本地路径。因此必须依赖重新收录后的“一次性 relink”或未来同步层。

### Ctrl+点击浏览器

Ctrl+点击现在覆盖所有 Go Study timestamp：

- Freeform → 现有 web / HTTP locator；
- Managed 当前 Resource → Resource browser target；
- Managed v3 丢 Resource → hidden `web` / HTTP locator；
- legacy v1 → alias / recovery Resource 的 web target（若存在）；
- Bilibili 保留 `p` 并写入 `t=<seconds>`。

Timeline 仍然只负责**笔记内导航**，不重新承担浏览器 / 播放器职责。

### Timeline source fallback

Managed v3 即使当前 Resource 已经不存在，Timeline 仍可以通过 hidden `title / name / web host` 显示来源标题，而不是只显示“已收录视频”。

### Light Mode Modal

根因：
- `--rh-accent / --rh-border / --rh-card` 过去只定义在 `.rh-next-view-host`；
- Obsidian Modal 挂在 Workbench DOM 外；
- primary button 使用 `var(--rh-accent)` 时背景失效，但 `var(--text-on-accent)` 仍是浅色文字，导致浅色模式白字白底。

修复：
- `.modal.rh-next-modal` 自己定义完整 theme variables；
- primary / active button 直接使用 Obsidian accent variables；
- modal input / select / textarea 显式使用 `text-normal` + form background。

### Named Manual Backup

新增长期保留备份：

- 命名手动备份使用 `saved-*.json`；
- `saved-*` 不参与自动快照 retention；
- 可以“新建命名备份”；
- 可以把最近任意 snapshot “重命名最近快照”，升级为长期命名备份；
- 自动 3～10 份限制只清理非 named snapshots。

### 开发状态

- branch `work/portable-reference-fallback-beta20-9`
- Draft PR #38
- validated CI #274 / publish CI #275 PASS
- **367 / 367 tests PASS**
- Preview `Go Study Preview 0.3.0-beta.20.9`
- release target `71773c2f54550d0d59f991c09ba3de2c80171da9`
- current PR head after one-shot publisher cleanup `73feb696e6892d6b4f5aa17cd8fb31dfb723e2f5`
- ZIP SHA256 `9513c5bd4d04a0bc8b3f431ae646d4b9fa131b34e33f58fe7bc1c1fadc78f691`

状态：VALIDATING。重点实机验收：
- 新 Managed v3 丢 Resource 后仍可 fallback；
- legacy v1 recovery / one-time relink；
- Managed Bilibili Ctrl+点击浏览器；
- 浅色 Add / Import / 保存位置 Modal；
- named backup 不被 retention 删除。

Obsidian 原生文件树 / Markdown tab 拖入 Study Mode 仍是独立未关闭问题，不因 beta20.9 自动视为修复。


## beta20.9.1：Freeform Bilibili Ctrl-click Hotfix

Windows 实机反馈：从 PotPlayer 打开的 Bilibili Freeform 视频生成时间戳后，Ctrl+点击仍不能打开浏览器。

用户提供的真实 URI 暴露两个问题：

1. Go Study 自定义协议 query 内嵌了：
   `https%3A%2F%2Fwww.bilibili.com...`
   Obsidian Markdown / Live Preview 可能把其中的 `www.bilibili.com` 再次自动识别为网页链接，导致原本的 `obsidian://go-study` destination 被嵌套 / 污染；
2. `installFreeformBrowserModifier` 过去只绑定 `globalThis.document`，Companion / Markdown popout 是独立 document，因此在小窗中 Ctrl+点击不会进入 Go Study handler。

修复：
- 新生成 reference URI 对内嵌 HTTP(S) query value 的 literal dot 做 Markdown-safe 编码，例如：
  `www%2Ebilibili%2Ecom`
- parse 后仍恢复成正常：
  `https://www.bilibili.com/...`
- browser modifier 同时绑定：
  - 主 Obsidian document
  - active Markdown document
  - 所有 Markdown leaves 的 ownerDocument
  - Companion popout document
- Companion 创建后立即 refresh browser modifier；
- Ctrl / Meta 均支持；
- Bilibili 继续保留 `p` 并增加 `t=<captured seconds>`；
- PotPlayer title 含 Unicode replacement character `�` 时，不再把乱码 title 写入 hidden metadata，回退到 portable BVID/name。

开发：
- branch `fix/freeform-bili-ctrlclick-beta20-9-1`
- Draft PR #39
- validated CI #281 / publish CI #282 PASS
- **372 / 372 tests PASS**
- Preview `Go Study Preview 0.3.0-beta.20.9.1`
- release target `70670f1c0cdeb2866a8acc598de2f8d84d8fb225`
- current PR head after publisher cleanup `ae0bcfd74662366433f4d1ea655f81f9eb72ae44`
- ZIP SHA256 `6b66f64fe9dc8edc1e0a69e62cf033ca822b9848f919bbad1d5d71d82450f3c9`

重点实机复验：
1. 主 Obsidian Markdown Ctrl+点击 Freeform Bilibili timestamp；
2. Companion 小窗 Ctrl+点击同一 timestamp；
3. 浏览器 URL 应为 `/video/BV...?...&t=<seconds>`；
4. 新 URI 不再出现 literal `www.bilibili.com` 嵌在 Go Study destination 内。


## beta20.9.2：Native PotPlayer + Legacy JV Compatibility

beta20.9.1 真人复验得到两个新事实：

1. 新 URI 的 Markdown-safe 编码已生效，真实链接已使用 `www%2Ebilibili%2Ecom`，因此 nested-linkify 修复 PASS；
2. Ctrl+点击仍回到 PotPlayer，且 Obsidian 外部打开路径会触发 `note2potplayer.exe`，说明 Browser Modifier 在真实 Live Preview DOM 中仍可能漏接，同时 Go Study Runtime 仍存在旧 JV transport 耦合。

用户确认：历史笔记中的 `jv://open?... ` 必须继续可用，但这只是旧笔记兼容，不应成为新用户或新链接的正常 Runtime 依赖。

beta20.9.2 候选实现：

- 新增默认关闭的“旧 JV 链接兼容（高级）”开关；
- 新用户继续只生成 / 使用 `obsidian://go-study`，不会生成新的 `jv://`；
- 旧 `jv://open?path=...&time=...` 作为只读 Legacy Adapter 解析成内部 Freeform v2；
- 兼容开关开启时，旧 JV 普通点击由 Go Study 接管；
- Windows Freeform / Managed / OpenList / Bilibili 播放改为 Go Study 直接启动 PotPlayer CLI，使用 `/current` + `/seek=<seconds>`；
- 正常 Runtime 不再通过 `shell.openExternal('jv://...')` 调用 `note2potplayer.exe`；
- Ctrl / Meta 状态在 DOM anchor 识别之前记录；即使 Live Preview 点击目标不是标准 `<a>`，随后 `obsidian://go-study` Protocol Handler 仍可通过短时 modifier state 走 Browser fallback；
- Bilibili Browser fallback 继续保留 `p` 并写入 `t=<floor seconds>`。

自动验证：

- 383 / 383 tests PASS；
- Release readiness PASS；
- Preview publisher PASS；
- Preview：`Go Study Preview 0.3.0-beta.20.9.2`；
- Tag：`go-study-preview-v0.3.0-beta.20.9.2`；
- ZIP SHA256：`e290e0b5bb243b9f5289dda353123920d74d9992864406ac763f702dd8bdae24`。

仍需 Windows 真人验证：

- 新 Go Study Bilibili Freeform 普通点击 → PotPlayer 正确定位，且不再弹 `note2potplayer.exe`；
- 主 Obsidian Markdown Ctrl+点击 → Browser + `t=<seconds>`；
- Companion Ctrl+点击 → 同上；
- 开启 Legacy JV 兼容并停止旧 helper 后，旧本地 / Bilibili `jv://` 普通点击仍能由 Go Study 打开 PotPlayer 到正确时间；
- 旧 Bilibili JV Ctrl+点击 → Browser + 正确时间；
- 关闭 Legacy JV 兼容后，不应让这层私人历史兼容影响新用户正常 Go Study 链路。


## beta20.9.3：PotPlayer Discovery Hotfix

beta20.9.2 Windows 真人结果：

- 新 Bilibili Freeform Ctrl+点击 → Browser：**PASS**；
- 开启“旧 JV 链接兼容（高级）”后，历史 `jv://` → PotPlayer：**PASS**；
- 新 Freeform 普通点击 → PotPlayer：**FAIL**；
- Resource Center 导入视频普通播放 → PotPlayer：**FAIL**；
- 两条失败共享同一错误：`没有找到 PotPlayer 可执行文件`。

因此问题已缩小到 Native PotPlayer Launcher 的 executable discovery，而不是 Reference / Ctrl modifier / Legacy JV parser。

20.9.3 候选：

1. PotPlayer process name 支持：
   - PotPlayerMini64
   - PotPlayerMini
   - PotPlayer64
   - PotPlayer
2. 常见路径扫描扩展；
3. 正在运行的 `PotPlayer*` 进程优先读取 `Path` / `MainModule.FileName`；
4. Windows App Paths；
5. Uninstall metadata：
   - DisplayIcon
   - InstallLocation
6. Start Menu shortcut 解析；
7. 新增 `potPlayerExecutablePath` 持久设置；
8. 设置页新增“PotPlayer 程序路径（高级）”：
   - 自动检测
   - 手动填写绝对 .exe 路径
9. 成功自动发现后，Go Study 会保存该 executable，之后 Resource / Freeform / Managed / OpenList 共用同一个启动器。

自动验证：
- 387 / 387 tests PASS；
- Release readiness PASS；
- Preview `Go Study Preview 0.3.0-beta.20.9.3`；
- ZIP SHA256：`6e60b7a5f2fb5335bb43dd70a3d47b176ab8f2376e0b28909641d47e9000ea53`。

下一步真人只先测播放器路径：
1. 最好先让 PotPlayer 保持运行；
2. Settings → Go Study → 视频笔记增强 → “PotPlayer 程序路径（高级）” → 自动检测；
3. Resource Center 普通点击视频；
4. 新 Freeform 普通点击；
5. 再确认 Ctrl+点击 Browser 没回归；
6. Legacy JV 开关行为不变。


## beta20.9.3 Windows 真人验收：PASS

用户确认 beta20.9.3 所有本轮测试通过：

- PotPlayer executable discovery 正常；
- Resource Center 导入视频普通播放正常；
- 新 Freeform 普通点击 → PotPlayer + 正确 seek 正常；
- Ctrl+点击 → Browser 正常；
- Legacy JV compatibility ON → 历史 jv:// 正常；
- 不再需要 note2potplayer.exe 作为正常 Runtime 依赖。

结论：

**beta20.9.3 = ACCEPTED-AS-BEHAVIOR（Windows）**

下一轮进入 beta20.10：Native Obsidian Drag Bridge。


## beta20.10：Native Obsidian Drag Bridge

用户明确产品边界：

> Go Study 不得抢占 / 替代 Obsidian 原生拖动。文件树移动、排序、Tab 重排仍由 Obsidian 负责；只有指针真正进入 Go Study 的“拖入 / 右侧小窗 / 学习模式”小目标后，该次 drop 才由 Go Study 接管。

因此 beta20.10 首轮实现采用 **non-invasive observer**：

- 移除 Native Drag Bridge 的全局 `pointerdown / pointermove / pointerup` fallback；
- 仅监听 Obsidian 原生 `dragstart / dragend / drop`；
- 普通 dragstart 不调用 `preventDefault / stopPropagation`；
- 普通区域 drop 不调用 `preventDefault / stopPropagation`；
- 只有 Go Study 小 Drop Target 自己的 `dragover / drop` 才阻止默认行为；
- 文件树 / Tab 原生拖动继续由 Obsidian 自己处理；
- 识别层新增 `event.composedPath()`；
- 支持 `data-path / data-file-path / data-source-path`；
- 继续支持 `workspace.getLeavesOfType('markdown') + tabHeaderEl` 反查；
- 读取 `dataTransfer.types` 与文本 payload；
- 每次 Native dragstart 输出 `Go Study native drag diagnostic` 到 Console；
- 若来源像 Obsidian file tree / tab 但没识别到 Markdown path，弹一次轻量诊断 Notice，不接管拖动。

Preview：
- `Go Study Preview 0.3.0-beta.20.10`
- ZIP SHA256：`ab3d97d7ee9e1c3f7d9bf6a2a4d40f0ae1e7136836ebb0768c20d3dd82511080`

真人验收：
1. 左侧 Markdown 原生拖动 → 小 Drop Target 是否出现；
2. 拖到普通 Obsidian 位置 → 原生移动 / 排序不受影响；
3. 拖到 Go Study 小 Target → Companion Study Mode；
4. 顶部 Markdown Tab 同样测试；
5. 若 Target 不出现，打开 DevTools Console，截图 `Go Study native drag diagnostic`。


## beta20.10 Windows 真人验收：PASS

用户确认：

- Obsidian 原生文件树 Markdown 拖动可召唤 Go Study 小 Drop Target；
- Native Drag Bridge 已可工作；
- 用户进一步强调边界：普通 Obsidian 移动 / 排序不能被 Go Study 抢占，只有 Drop Target 范围内才由 Go Study 接管。

结论：

**beta20.10 Native Drag 基础能力 = ACCEPTED-AS-BEHAVIOR（Windows）**

后续不再恢复 pointer hijack。


## beta20.11：Companion Polish & Standalone Note Window

用户明确认为核心功能层面已经基本完成，本轮只做体验收口，不再扩展大功能。

真人反馈 / 新边界：

1. Native Drag 成功后 Notice 会带 PotPlayer 原始 title，部分机器出现乱码；
2. 项目页面文件可拖，但“项目笔记盒”内已关联笔记不能拖；
3. Companion 小窗不应强依赖 PotPlayer；用户可能只想把它当轻量置顶 Markdown 小窗；
4. 长笔记需要更可靠的编辑焦点与光标可见性。

beta20.11 候选实现：

- 成功 Notice 不再显示任何 raw PotPlayer media title，只显示稳定笔记名；
- Project Note Box 已关联笔记与搜索结果可拖入同一个 Companion Target；
- 新增 Optional PotPlayer probe：
  - 有当前 PotPlayer 媒体 → 原 Study Mode；
  - 没有 PotPlayer / 读取失败 → 直接打开纯 Companion Note Window；
- 纯笔记小窗：
  - 不要求 PotPlayer；
  - 不强制 Capture lock；
  - 保持 right-rail / always-on-top 能力；
- Direct Drag Target 文案泛化为“笔记小窗”，不再承诺必须有视频；
- Companion 打开时默认依据 focusStudyNoteAtEnd 把光标聚焦到正文末尾；
- 长笔记打开后自动 reveal caret；
- HUD / 程序化 Capture 插入后，仅让 Companion 当前 caret 滚回可见范围，不抢回 PotPlayer 焦点；
- 普通 CodeMirror 手工编辑继续使用 Obsidian 自己的滚动行为。

Preview：
- `Go Study Preview 0.3.0-beta.20.11`
- ZIP SHA256：`4f2f5a25d7592306b8240aff45cd47613ac20b15c35329b8b924afb935287cda`
- 394 / 394 tests PASS。

本轮真人验收通过后，下一阶段不再开发功能，进入 **Full RC Audit / Polish**。
