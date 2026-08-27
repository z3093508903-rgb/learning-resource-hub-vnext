# 产品规格：Companion Note Window / 学习笔记小窗

状态：**CONFIRMED — beta.18 scope / Preview implemented, human acceptance pending**

## 一、产品目标

用户在 PotPlayer 学习视频时，不依赖 Windows 系统分屏，就能在播放器旁边维持一个稳定、极简、真实 Markdown 的学习笔记窗口。

核心体验：

```text
PotPlayer 主画面
+
覆盖 / 贴靠在右侧播放列表区域大小的 Go Study 笔记小窗
+
Alt+S Capture 持续写入当前锁定 Note
```

这个功能不是完整 Study Workspace，也不是第二套笔记系统。

## 二、尺寸参考

默认视觉参考：PotPlayer 右侧“播放列表”栏。

用户提供的 1600×900 参考图中，右侧栏约为屏幕宽度的 18%~20%，因此 beta.18 可先以约 300~340 px 宽作为“右侧栏布局”的默认视觉基准。

实际尺寸必须允许用户自由调整，不把像素值写死为产品限制。

默认布局目标：

- 窄；
- 高；
- 可以覆盖 PotPlayer 右侧播放列表区域；
- 不明显遮挡主要课程画面；
- 内容虽然缩小，但编辑功能完整。

## 三、窗口只显示 Note 区域

小窗默认隐藏所有与当前笔记无关的 Obsidian Chrome：

- Ribbon；
- 左/右 Sidebar；
- Status Bar；
- 大型 Tab Bar；
- 文件浏览器；
- Search；
- Go Study 主工作台；
- 其他普通 Obsidian 导航。

保留：

- 当前真实 Markdown Note；
- 编辑器；
- 滚动；
- 光标；
- Markdown / Live Preview 必要能力。

可以保留一个极轻量 Hover Header：

```text
Note 名称 | 锁定 | 布局 | 关闭
```

平时尽量弱化或自动隐藏。

## 四、真实 Markdown，不创建第二套编辑器数据

小窗必须编辑 Vault 中真实的 `.md` 文件。

禁止设计成：

```text
私有小窗文本
→ 定时同步
→ Markdown
```

避免双状态、冲突与格式漂移。

优先复用 Obsidian 自身 Markdown View / Editor。

## 五、“强行缩放”的定义

用户希望：

> 窗口可以很小，但内容仍然完整，是一个强行缩放的只有笔记区的 Obsidian 小窗。

beta.18 应提供独立的“小窗缩放比例”，例如：

- 70%
- 80%
- 90%
- 100%
- 自定义

缩放目标包括：

- Markdown 字体；
- 行距；
- 编辑器 Padding；
- Callout / Heading / List 间距；
- 极简 Header。

原则：

- 小，而不是裁掉功能；
- 允许缩小视觉密度；
- 不应通过简单截图/只读缩略图伪装成编辑器；
- 光标、选择、输入、滚动坐标必须保持可靠。

## 六、Geometry 记忆

Geometry = 窗口几何信息。

至少保存：

- x
- y
- width
- height
- scale
- display / monitor identifier（可安全获取时）

重新打开后恢复最后位置与尺寸。

如果显示器变化、分辨率变化或原位置已经在屏幕外：

自动钳制回当前可见区域。

## 七、多套布局 Preset

用户明确希望：

> 用户自定义大小以及保存各种布局。

beta.18 至少支持：

### 预设 1：PotPlayer 右侧栏

窄高窗口，覆盖 / 替代播放列表区域。

### 预设 2：右侧半高

适合只记短笔记。

### 预设 3：自定义

用户手动拖动 / resize 后：

`保存为布局…`

允许多个自定义布局，例如：

- 数学课
- 剪辑课
- 竖屏
- 外接显示器

每个布局保存 Geometry + Scale。

## 八、Note Target / 锁定

打开小窗后，应有明确的“当前锁定 Note”。

Capture Target 优先级：

```text
Companion Note Window 锁定 Note
→ Project Recent Note
→ 当前可编辑 Markdown
→ 创建 / 选择 Note
```

PotPlayer 在前台时，Alt+S Capture 不应该因为 Obsidian 主窗口焦点变化就写错文件。

## 九、Note 切换

beta.18 最小版需要：

- 显示当前 Note 名；
- 一键锁定 / 解锁；
- 从 Project Notes Box 选择 Note；
- 新建 Project Note；
- Recent Note 快速切回。

不要求 beta.18 首版提供完整文件浏览器。

## 十、与 Project / Resume 的关系

小窗不是独立产品。

它应继续服从：

```text
Project
→ Notes Box
→ Recent Note
→ Companion Note Window
```

未来 Resume 可以恢复：

- Resource；
- Position；
- Companion Note；
- Window Layout。

但 beta.18 首版不直接扩成完整 Study Workspace。

## 十一、Always on Top

“始终置顶”可以作为可选项，而不是硬编码。

需要分别验证：

- Windows；
- macOS。

如果平台行为不稳定，应允许普通独立小窗工作，不让 Always-on-top 成为 beta.18 的阻塞依赖。

## 十二、跨平台原则

笔记小窗的产品模型必须跨平台。

不能把 Windows 独有 Electron / Win32 行为写成永久产品要求。

平台能力应隐藏在 Window Adapter / Obsidian Pop-out 层。

## 十三、beta.18 MVP 验收

### Window

- 能从 Go Study 打开 Note 小窗；
- 只显示笔记核心区域；
- 可移动；
- 可 resize；
- 可调整 scale；
- 关闭再打开恢复 geometry；
- 保存 / 切换 Layout Preset。

### Markdown

- 编辑的是真实 Vault Markdown；
- 主窗口与小窗内容保持一致；
- 修改即时持久化；
- 不生成第二套 note state。

### Capture

- PotPlayer 前台时 Capture 稳定写入锁定 Note；
- Screenshot / Comment / Timestamp / No-Timestamp 行为不因小窗改变；
- 小窗失效或关闭时有明确 Target fallback。

### Regression

- 普通 Obsidian 主窗口仍可编辑；
- Project Notes / Recent Note 不退化；
- Managed / Freeform backlink 不退化；
- HUD 不依赖小窗存在。

## 十四、明确不做（beta.18）

- 完整 Study Workspace；
- 多窗口工作区自动编排；
- 内置文件浏览器克隆；
- 私有 Rich Text 编辑器；
- AI 笔记；
- 自动总结；
- 多人协作；
- 强依赖 Windows 系统分屏。


## 十五、当前 beta.18 Preview 实现

实现分支：

`work/companion-note-beta18`

Draft PR：

`#26`

Preview：

`Go Study Preview 0.3.0-beta.18`

当前已经实现：

- Obsidian pop-out Markdown leaf；
- Right Rail / Right Half builtin layouts；
- move / resize / last geometry persistence；
- compact scale；
- custom layout save；
- locked Companion Capture Target；
- commands；
- settings entry；
- companion-only compact CSS。

自动化：

- 307 / 307 tests；
- release:check PASS；
- main.js consistency PASS；
- Preview package validation PASS。

未实现 / 延期：

- Always-on-top；
- automatic PotPlayer docking；
- complete Study Workspace；
- macOS real-machine acceptance。

**注意：自动化只能证明状态逻辑与构建完整性，不能证明真实 Obsidian pop-out 的窗口几何、CSS、编辑器光标与 OS 行为。**
