# Go Study — 项目宪法

> 稳定性：高。只有当产品方向本身发生变化时才修改本文件。
> 当前唯一权威仓库：`z3093508903-rgb/learning-resource-hub-vnext`

## 一、产品定位

Go Study 是一个 **运行在 Obsidian 桌面端中的学习资源工作台**。

它的主要目标不是变成完整阅读器、完整播放器或 AI 学习助手，而是帮助用户：

1. 围绕 Project 组织学习资源；
2. 快速回到正确的学习上下文；
3. 从上一次真正的学习位置继续；
4. 让笔记能够低摩擦地回到原始学习资源。

北极星原则：

> **Go Study 首先应该让我更容易“继续学习”，其次才是让我更容易“记录学习”。**

另一种已经形成的表述：

> Go Study 不负责“怎么阅读”，而负责“把你送回学习发生的地方”。

## 二、核心学习循环

```text
Resource
→ Project
→ 开始学习
→ 学习位置
→ Notes
→ 回到来源上下文
→ 继续学习
```

## 三、核心产品模型

```text
Project
├─ Resources
├─ Notes Box
│  └─ Recent Note / 当前学习笔记
└─ Resume
```

### Project

Project 是一个学习上下文。

它负责聚合：
- 学习资源；
- 项目笔记；
- 最近使用状态；
- Continue / Resume。

### Resource

Resource 是 Go Study 认识并管理的一个持久学习对象。

Resource 的身份不能等同于当前路径或 URL。

### Notes Box

每个 Project 可以指定一个 Vault 文件夹作为 Notes Box。

它代表“这个项目的笔记之家”，**不代表文件夹中所有 Markdown 都要自动导入，也不代表每个 Resource 必须永久绑定一篇 Note**。

### Resume

Resume 回答的问题是：

> **“我现在继续这个 Project，应该从哪里开始？”**

可以综合：
- 最近学习资源；
- 学习 Position；
- Recent Note；
- 其他必要上下文。

但不应该要求用户每次手动重建学习环境。

## 四、核心不可变规则

### Resource ID ≠ Locator ≠ Position

```text
Resource ID ≠ Locator ≠ Position
```

- **Resource ID**：持久身份；
- **Locator**：资源现在在哪里，可变化；
- **Position**：学习发生在资源内部的哪个位置。

不要把：
- 路径；
- URL；
- canonicalKey；
- 播放器临时地址；

当成永久 Resource 身份。

### 视频增强是可选层

普通的：
- Project；
- Resource；
- Resume；
- 资源启动；

不能依赖 PotPlayer 或视频笔记增强才能工作。

视频功能是增强层，不是 Go Study 的定义。

### 管理动作收起来，学习动作放前面

优先：
- 低摩擦；
- Continue Learning；
- Resume；
- 快速启动；
- 高频键盘操作。

避免让资源维护 UI 抢占整个工作台。

## 五、当前明确不做

除非新的产品决策明确修改本文件，否则当前阶段不默认加入：

- AI 总结；
- 番茄钟；
- 学习统计；
- 日历；
- OCR；
- 完整 PDF Reader；
- 完整播放器。

这些不是“漏做了的功能”。

## 六、笔记关系原则

默认不要实现：

```text
Resource A → Note A
Resource B → Note B
```

这种永久一对一绑定。

真实学习往往是：

- 一个 Resource 使用多篇 Note；
- 多个 Resource 共用一篇 Note；
- 用户真正关心的是“这个 Project 最近在用哪篇 Note”。

因此优先使用：

- Notes Box；
- Recent Note；
- Study Pair。

## 七、视频 Capture 原则

必须同时支持：

### Managed
当前媒体已经是 Go Study Resource。

### Freeform
用户自己打开视频，没有提前加入 Project / Resource。

Freeform 不能因为“没收录”就禁止记录。

## 八、快捷键原则

优先：

```text
一个主入口
+
少量动作路由
```

而不是不断增加：

```text
Alt+1
Alt+2
Alt+3
Alt+4
Alt+5
Alt+6
Alt+7
...
```

当前主 HUD 入口：

`Alt+S`

Legacy `Alt+1..Alt+4` 暂时保留，不得随意删除。

## 九、返回 Obsidian 原则

当前不新增 Go Study 专属“返回 Obsidian”快捷键。

用户现有：

`Win+Tab`

已经能完成系统级切换。

## 十、架构分层

建议始终把系统理解为：

1. **Project / Resource 层**
2. **Resume / 学习上下文层**
3. **Capture 层**
4. **外部 Integration 层**

PotPlayer、Bilibili、OpenList、Browser 等 Integration 不应该反过来定义核心产品。
