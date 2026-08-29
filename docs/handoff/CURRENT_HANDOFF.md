# Go Study — 当前交接文档

> 新 ChatGPT / Codex / 开发者接手时先读本文件。  
> 更新时间：**2026-08-29（北京时间，UTC+8）**

## 0. 一句话状态

Go Study 已推进到 **beta20.9.3 发布前收口 / PotPlayer Discovery Windows 真人验收阶段**。

核心链路已经成形：

~~~text
Resource / Freeform
→ PotPlayer 学习
→ Alt+S HUD Capture
→ 真实 Markdown Companion
→ timestamp-only 回链
→ 轻量 Timeline 笔记导航
→ Resume / Project Notes
~~~

当前不要继续扩功能。优先完成最后几个真机阻断问题：

1. Bilibili Freeform Ctrl+点击浏览器在 beta20.9.2 已经 Windows 真人 PASS；当前 P0 是 Native PotPlayer executable discovery：新 Freeform 普通点击与 Resource Center 播放均因找不到 PotPlayer .exe 失败，beta20.9.3 已修，等待实机；
2. Obsidian 原生左侧文件树 / 已打开 Markdown 标签页拖入 Study Mode：beta20.7 尝试修复，但用户实机仍报告没有出现拖入小窗入口；
3. Companion 鼠标点击与 caret 落点：beta20.7 已移除 CodeMirror 容器 CSS zoom，但没有收到明确通过结论，需要补一次真机复验；
4. beta20.9 的 Managed v3 fallback / legacy v1 relink / light-mode modal / named backup 需要最终回归。

Stable / Merge：**HOLD**

---

## 1. 阅读顺序

1. ../PROJECT.md
2. ../CURRENT.md
3. 本文件
4. ../product/companion-note-window.md
5. ../decisions/007-portable-freeform-cross-platform.md
6. ../decisions/008-real-obsidian-companion-note-window.md
7. ../decisions/009-hud-first-study-mode.md
8. ../decisions/010-self-describing-backlinks-and-relink-fallback.md
9. ../ideas/IDEA_LEDGER.md
10. ../AI_DEV_RULES.md

Fresh Codex 启动建议：

> 按 AGENTS.md 执行 Context Bootstrap。先恢复项目状态并汇报，不要直接编码。

---

## 2. 唯一权威仓库

z3093508903-rgb/learning-resource-hub-vnext

历史仓库 learning-resource-hub / learning-resource-hub-next 不作为当前开发基线。

---

## 3. 当前开发候选

### 最新 Hotfix

- Branch：fix/potplayer-discovery-beta20-9-3
- Base：fix/legacy-jv-native-beta20-9-2
- Draft PR：尚未创建
- Current HEAD：7414098298f8e71e7ceee0f13ad89385462d47ef
- Preview 发布目标：d946176bcd156d0d6c8d4d358c58838449c98dba
- Preview：Go Study Preview 0.3.0-beta.20.9.3
- Tag：go-study-preview-v0.3.0-beta.20.9.3
- ZIP SHA256：6e60b7a5f2fb5335bb43dd70a3d47b176ab8f2376e0b28909641d47e9000ea53

### 自动验证

- validator run #2：PASS
- Preview publisher：PASS
- **387 / 387 tests PASS**
- build：37 modules / 745157 bytes
- committed main.js current
- Release readiness：PASS

### beta20.9.2 Windows 真人结论

已确认：
- 新 Freeform Ctrl+点击 → Browser：PASS；
- Legacy JV compatibility ON → 旧 `jv://` 可回 PotPlayer：PASS。

未通过：
- 新 Freeform 普通点击 → PotPlayer：FAIL；
- Resource Center 导入视频普通点击 → PotPlayer：FAIL。

共同错误：
- “没有找到 PotPlayer 可执行文件”。

因此 20.9.3 只修 executable discovery，不重开已通过的 browser modifier / legacy parser 设计。


---

## 4. 当前产品边界

北极星：

> Go Study should first make it easier to “continue learning”, and only second make it easier to “record learning”.

核心模型：

~~~text
Project
├─ Resources
├─ Notes Box
│  └─ Recent Note
└─ Resume
~~~

必须保持：

- Resource ID ≠ Locator ≠ Position
- Resource ID = durable identity
- Locator = mutable current location / playback target
- Position = learning position
- Notes Box 是 Project 级，不做永久 Resource ↔ Note 一对一绑定
- Freeform 不要求先收录 Resource
- 视频增强可选，不重新定义整个产品
- Timeline 是导航，不是第二播放器
- Markdown 正文给人看，metadata 给 Go Study 看

---

## 5. 已确认的核心行为

### HUD-first Study Mode

普通视频学习默认：

~~~text
PotPlayer 保持焦点
→ Alt+S
→ HUD
→ Capture
→ 写入锁定 Companion Markdown
→ 继续播放
~~~

主快捷键：Alt+S

支持：
- timestamp
- note
- screenshot
- timestamp + note
- timestamp + screenshot
- screenshot + note
- all
- no-timestamp first-class
- 同方向快速双击确认
- Legacy Alt+1..Alt+4 Mixed 模式兼容

### Companion Note Window

- 使用真实 Obsidian Markdown popout leaf
- 不是自制文本编辑器
- right-rail 为主要布局
- Capture Target 可锁定
- 默认 Always-on-top
- 有 Pin 开关
- 关闭 Companion = 退出 Study Mode，不关闭 PotPlayer
- beta20.7 已移除 CodeMirror 所在容器 CSS zoom，避免视觉坐标和 caret hit-testing 错位

### beta19-A

Windows 用户已经明确确认：
- Study Mode 主流程顺手
- 普通点击与拖入 Study Mode 语义可接受
- Companion 右侧小窗 + 置顶符合预期

状态：**ACCEPTED-AS-BEHAVIOR**

---

## 6. Timeline Navigator：真实问题与修复轨迹

### beta20 初版
- 可选视频增强
- 默认关闭
- 右侧极细透明 rail
- Hover 才展开
- 不做卡片背景

### beta20.1 Mount Hotfix
问题：设置已开、Markdown 有时间戳，但 Timeline 不出现。

修复：
- 从真实 Markdown .view-content / rendered anchors 取数据
- overlay 挂到 document.body
- fixed 对齐 Markdown view
- 避免 overflow / stacking 裁切

### beta20.3 Parser Hotfix
实机诊断曾是：

~~~text
增强 ON
时间线 ON
Markdown YES
原始链接 7
渲染链接 0
来源 0
时间点 0
挂载 0
~~~

修复：
- strict parser + 精确 custom-scheme fallback
- 真实 7 条 Managed URI 加入回归
- 诊断增加解析失败计数

### beta20.4 Hover Stability
问题：Timeline 已显示，但鼠标移入闪烁。

根因：MutationObserver 监听 document.body，而 Timeline 自己 remove/add overlay，形成自激刷新。

修复：
- 忽略自身 mutation
- stable signature
- 数据未变则复用 DOM
- Hover 中不销毁 rail

用户实机确认：**闪烁问题已解决**

### beta20.5 职责确定
用户明确：

> Timeline 应该帮助找到知识点、定位笔记，不应该点击后打开播放器/网页。

最终职责：
- 正文 timestamp → 回视频
- Timeline timestamp → 定位当前 Markdown 对应行
- Timeline 来源标题 → 辅助理解时间点来自哪期视频
- Timeline 只处理 Go Study timestamp
- 非相关页面不显示

### beta20.6 视觉收口
- 默认正文只显示 00:35
- 不再显示“回到课程”
- 不显示视频标题
- 不加 tooltip
- timestamp 小胶囊由仓库 CSS 实现
- Timeline 折叠点数量 = 视频来源数量，不是时间戳数量

---

## 7. Freeform / Managed 回链演化

### Legacy Managed v1
只有：
- Resource ID
- Position
- v=1

Resource state / data.json 丢失后，链接本身无法知道原视频是什么。

### Freeform v2
包含：
- locator
- name
- title（可选）
- web（可选）
- position
- v=2

Freeform 支持：
- 未收录本地视频精确回 PotPlayer
- HTTP/Bilibili 保存浏览器来源
- 后续匹配 Managed Resource 时动态升级

### Managed v3（beta20.9）
新 Managed timestamp：
- Resource ID 仍是首要 identity
- URI 内隐藏保存 fallback metadata：
  - locator
  - name
  - title
  - web
  - position

可见 Markdown 仍只显示时间数字。

Resolver 顺序：
1. exact Resource ID
2. saved legacy alias
3. v3 locator match
4. v3 unique portable-name match
5. v3 degrade → Freeform
6. legacy v1 → recovery / legacy backup lookup
7. legacy v1 → one-time manual relink

旧 v1 如果 Resource、data、recovery 全没了，不可能从 Resource ID + position 凭空反推出原 URL，这是事实边界。

---

## 8. beta20.8 数据安全事故与修复

### 真实事故

~~~text
已有 data.json
→ 重启 Obsidian
→ Go Study 状态归零
→ data.json 被空状态覆盖
~~~

甚至手工复制旧 data.json 回去，再开 Obsidian 仍会被归零。

这是发布阻断级 bug。

### Fail-Closed 修复

已实现：
1. 启动读取前先保护原始 data.json
2. recovery 放到插件目录外：
   <Vault>/.obsidian/go-study-recovery/
3. loadData() 异常返回空，但 raw data 有内容 → 使用 raw data
4. normalize 导致 populated → near-empty → 只读保护
5. 每次 persist 做 catastrophic drop guard
6. 保存前滚动 snapshot
7. restore 前做 migration safety check

设置页显示：
- 当前 data.json 路径
- recovery folder
- 打开备份文件夹
- 恢复最近备份

用户之后允许进入下一轮，**没有再次报告 data.json 自动归零**。

但 RC 前仍应再跑：
- restart ×2
- manual backup
- restore

---

## 9. beta20.9 Named Backup

用户要求：
- 主动备份可命名
- 命名后不能被 3～10 自动 retention 清理

实现：
- named backup 使用 saved-*.json
- named 不参与自动清理
- “新建命名备份”
- “重命名最近快照”
- 自动 retention 只清理非 named snapshots

状态：自动测试通过，实机最终回归未完成。

---

## 10. beta20.9 浅色模式 UI 修复

真实 P2：

“选择保存位置”等独立 Modal 在浅色模式下出现白字白底 / 看起来像空白按钮。

根因：
- --rh-accent / --rh-border / --rh-card 只定义在 Workbench root
- Modal 挂在 DOM 外

修复：
- .modal.rh-next-modal 自己定义主题变量
- button/input/select/textarea 显式使用 Obsidian theme token

状态：等待最终实机复验。

---

## 11. 当前最重要问题：beta20.9.1 Freeform Bilibili Ctrl-click

### 用户真实反馈

从 PotPlayer 直接打开 Bilibili 页面视频 BV1xJ38z3EkX，Go Study 生成 Freeform timestamp 后，Ctrl+点击仍不能跳浏览器。

用户贴出的真实 Markdown / URI 已出现明显 nested linkify 污染：

原本应该是：

~~~text
obsidian://go-study?...locator=https%3A%2F%2Fwww.bilibili.com...
~~~

但 Obsidian 把 query 里的 www.bilibili.com 再识别为网页链接，最终形成类似：

~~~text
[www.bilibili...](http://www.bilibili...)
~~~

嵌在原 Go Study link destination 中。

同时 title 参数出现大量 %EF%BF%BD，也就是 Unicode replacement character “�”。

### beta20.9.1 修复

1. 对 custom protocol query 中嵌套 HTTP(S) value 的 literal dot 做 Markdown-safe 编码：

~~~text
www.bilibili.com
→
www%2Ebilibili%2Ecom
~~~

parse 后仍恢复真实 URL。

2. Browser modifier 不再只绑定 globalThis.document，同时绑定：
- 主 Obsidian document
- active Markdown document
- 所有 Markdown leaf ownerDocument
- Companion popout document

3. Companion 打开后主动 refresh modifier
4. Ctrl + Meta 都支持
5. Bilibili browser URL 保留 p 并写入 t=<floor seconds>
6. PotPlayer title 含 “�” 时丢弃乱码 title，fallback 到 BVID / portable name

### 自动验证

- **372 / 372 tests PASS**
- 已加入用户提供的 BV1xJ38z3EkX 形状回归
- Preview 已发布

### 仍需真机

必须用 beta20.9.1 **重新生成一条新的 timestamp** 再测。

旧的已经被 Markdown parser 污染成 nested link 的文本，不应该作为新编码方案是否成功的唯一判断。

复验：

~~~text
PotPlayer 打开 Bilibili
→ beta20.9.1 新 Capture
→ Markdown 显示 00:12
→ Ctrl+点击
→ 浏览器打开 https://www.bilibili.com/video/BV...?...&t=12
~~~

再在 Companion 中重复一次。


## 11B. beta20.9.2 Native PotPlayer / Legacy JV Compatibility

### 用户确认的兼容目标

历史笔记里的 `jv://open?path=...&time=...` 必须继续可用，但这属于旧笔记兼容；未来新用户正常只使用 Go Study 自有 `obsidian://go-study`。

因此采用单一公开版本，不维护“用户私有版 / 新用户版”两套代码。

### 当前实现

1. 设置新增默认关闭的“旧 JV 链接兼容（高级）”；
2. 新 Go Study Capture 不生成 JV；
3. 新增 `legacy-jv.cjs`，只把旧 JV 解析成内部 Freeform v2 + Position；
4. 开启兼容后，旧 JV 普通点击由 Go Study 接管；
5. Windows Freeform / Managed / OpenList / Bilibili 正常播放不再调用 `shell.openExternal(jv://...)`；
6. Go Study 直接解析 PotPlayer executable，并用 CLI：
   `<target> /current /seek=<seconds>`
7. Ctrl / Meta 状态在 DOM anchor 解析前记录；
8. 如果 Live Preview 没给标准 `<a>`，`obsidian://go-study` Protocol Handler 仍使用短时 modifier state 走 Browser fallback；
9. Bilibili browser URL 保留 `p` 并更新 `t=<floor seconds>`。

### 关键产品边界

~~~text
旧 JV = 可选输入兼容
新 Go Study = 唯一新写入格式
note2potplayer.exe / AHK = 不再是正常 Runtime 必需依赖
~~~

### beta20.9.2 真人验收顺序

A. 新 Go Study Bilibili Freeform
- 普通点击 → PotPlayer 正确定位；
- 全程不出现 note2potplayer.exe；
- 主 Markdown Ctrl+点击 → Browser + t；
- Companion Ctrl+点击 → Browser + t。

B. 历史 JV
- 打开“旧 JV 链接兼容（高级）”；
- 停止旧 note2potplayer / AHK helper；
- 旧本地 JV 普通点击 → Go Study 直接打开 PotPlayer 到保存时间；
- 旧 Bilibili JV 普通点击 → PotPlayer 到保存时间；
- 旧 Bilibili JV Ctrl+点击 → Browser + 保存时间。

C. 新用户边界
- 兼容默认 OFF；
- 新 Capture 不生成 JV；
- 不要求安装 / 启动任何旧 helper。

注意：Native PotPlayer CLI 的真实 Windows 安装路径解析、Bilibili 页面 URL 启动及 seek 必须真人验证；自动测试不能替代。


## 11C. beta20.9.3 PotPlayer Discovery

### Root cause

beta20.9.2 把正常播放迁出 `jv:// → note2potplayer.exe` 后，Go Study 必须自己找到 PotPlayer executable。

初版只覆盖有限的：
- Program Files 常见目录；
- 少量 App Paths；
- PotPlayerMini64 / PotPlayerMini 进程名。

用户机器真实安装未命中，因此所有需要原生启动 PotPlayer 的入口同时失败。

### beta20.9.3

Discovery 顺序：

1. 已配置的 `potPlayerExecutablePath`；
2. 常见 Program Files / LocalAppData 路径；
3. 正在运行的 `PotPlayer*` 进程的真实 executable；
4. Windows App Paths；
5. Uninstall registry 的 DisplayIcon / InstallLocation；
6. Start Menu PotPlayer shortcut；
7. 全部失败时提示用户在设置里自动检测或手动填写 .exe。

设置页新增：
- PotPlayer 程序路径（高级）
- 自动检测
- 手动输入自定义 D/E 盘 / portable .exe

成功自动发现后会持久保存路径，因此 Resource Center、Managed、Freeform、OpenList 共用同一个 Launcher。

### 真人验收

先只测：
1. PotPlayer 保持运行；
2. 设置 → Go Study → 视频笔记增强 → PotPlayer 程序路径（高级） → 自动检测；
3. 是否显示并保存真实 .exe；
4. Resource Center 普通播放；
5. 新 Freeform 普通点击 + seek；
6. Ctrl+点击仍 Browser；
7. Legacy JV 开关 ON 后旧协议仍正常。

如果 Auto Detect 仍失败：
- 直接用 Task Manager / PotPlayer shortcut properties 找到实际 .exe；
- 粘贴完整路径到设置；
- 如果手动路径可用，则下一轮只补该安装形态的自动发现，不允许回退 note2potplayer runtime。

---

## 12. 明确未关闭：Obsidian 原生拖动 Study Mode

### 目标

用户希望下面三种笔记都可拖：
1. Go Study 工作台项目笔记
2. Obsidian 左侧原生文件树 Markdown
3. 顶部已经打开的 Markdown 标签页

拖动后统一出现：

~~~text
拖入
右侧小窗
学习模式
~~~

然后：

~~~text
当前 PotPlayer 已打开零散视频
+
被拖入 Markdown
→ 临时 Freeform Study Mode
→ 不重启播放器
→ 不强制收录 Resource
~~~

### 当前真实状态

- Go Study 工作台项目笔记拖动：用户看到了，可用
- 原生文件树拖动：beta20.7 做过 document-level bridge，**用户仍看不到入口**
- Markdown tab 拖动：同样**未通过真机**

已有尝试：
- data-path
- workspace.getLeavesOfType('markdown')
- leaf.tabHeaderEl
- HTML5 dragstart
- pointerdown/pointermove threshold fallback
- pointerup drop completion

这些没有解决用户当前 Obsidian 版本的真实原生拖动链路。

### 下一任 Agent 不要继续盲猜 selector

推荐先做 Drag Diagnostic，记录真实：
- pointerdown target
- pointermove target
- dragstart 是否触发
- event.composedPath()
- className
- data-path
- draggable
- workspace leaf/tab identity

只在 debug 模式显示一次诊断，然后根据真实 DOM / event source 修。

---

## 13. Companion caret 问题

用户曾报告：

> 小窗很难像正常笔记一样，鼠标点击哪里光标就跟到哪里。

beta20.7 已处理：
- 移除 CodeMirror workspace leaf 的 CSS zoom
- 改为字体尺寸缩放

但之后没有明确收到“完全通过”。

状态：**NEEDS REAL-MACHINE RECHECK**

---

## 14. Cross-device / reinstall sync

状态：**DEFERRED**

用户明确提出未来如果更换设备 / 双端使用 / 只同步 Markdown，也需要同步 Resource state。

候选已记录到 Idea Ledger：
1. Import / Export Go Study State
2. Vault 内 portable resource manifest
3. device-specific multi-locator mapping
4. account / cloud sync

当前决定：
- 不阻塞首发
- 双端用户预计暂时很少
- 先让单条 timestamp 尽可能 self-describing
- 完整同步作为独立能力，不塞进 backlink resolver

---

## 15. 下一任接手后的执行顺序

### 第一优先：复验 beta20.9.3

先测新 Go Study Bilibili Freeform：
1. 普通点击是否由 Go Study 直接启动 PotPlayer 并正确 seek，且不再出现 note2potplayer.exe；
2. 主 Markdown Ctrl+点击是否 Browser + t=<seconds>；
3. Companion Ctrl+点击是否 Browser + t=<seconds>。

再测旧 JV：
1. 开启“旧 JV 链接兼容（高级）”；
2. 停止旧 helper；
3. 旧本地 / Bilibili JV 普通点击是否由 Go Study 直接回 PotPlayer；
4. 旧 Bilibili JV Ctrl+点击是否 Browser + 时间。

若失败：
- 新链接 Browser 失败：先记录真实 click target / composedPath / protocol callback 时 modifier state；
- Native PotPlayer 启动失败：先记录 PotPlayer 安装路径与 CLI 行为，不回退到外部 JV helper；
- 旧 JV 失败：先区分 parser、compat toggle、native launcher 三层。

### 第二优先：原生拖动诊断

不要直接继续写 selector。
先记录用户真实 Obsidian 1.13.x 的 file tree / tab drag event 与 composedPath，再做最小修复。

### 第三优先：RC 回归

- Companion caret
- light mode modal
- named backup
- restart persistence
- backup restore
- Managed v3 resource-loss fallback
- legacy v1 relink
- Timeline scope / source grouping / note navigation
- HUD / Resume / OpenList / PotPlayer

---

## 16. 发布判定

### Publish / RC 条件

必须满足：
- data.json 不再自动归零
- recovery 真正可恢复
- Capture 不写错笔记
- timestamp 不写错视频 / 时间
- Freeform Bilibili Ctrl+点击通过
- Timeline 不在无关页面残留
- Timeline Hover 不闪
- Companion caret 可正常定位
- 原生拖动如果仍不能稳定解决：
  - 要么修复
  - 要么明确从首发功能宣传中撤下，不能继续声称已支持

### Hold 条件

任一出现：
- 数据丢失
- 错写 Capture Target
- 错视频回链
- 自动覆盖 backup
- overlay 全局残留
- 新 v3 URI 被 Obsidian 再次破坏
- Companion 编辑器无法正常点击定位

---

## 17. Git 安全

当前相关 PR 都是 Draft。

未经用户明确批准不要 Merge。

尤其：
- PR #35 beta20.6
- PR #36 beta20.7
- PR #37 beta20.8
- PR #38 beta20.9
- PR #39 beta20.9.1

不要 Force Push / Rewrite History。

当前开发事实以 GitHub remote + 当前 branch/HEAD + docs/CURRENT.md + 本 handoff 为准。

---

## 18. 最后给下一任 Agent 的一句话

**不要再加功能。**

Go Study 的核心体验已经成形。现在价值最高的工作是：

> 用真实 Obsidian + Windows + PotPlayer 把最后几个交互和数据边界钉死，然后进入 RC。
