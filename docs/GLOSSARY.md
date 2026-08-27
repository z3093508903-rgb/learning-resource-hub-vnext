# Go Study — 概念字典

## Project
学习项目 / 学习上下文。

## Resource
Go Study 管理的一个持久学习资源。

## Resource ID
Resource 的永久身份。

## Locator
Resource 当前在哪里。

例如：
- OpenList source + remote path；
- 本地路径；
- Web URL。

Locator 可以变化。

## Position
学习发生在资源内部的哪个位置。

目前最重要的是：
- 视频时间点。

未来可以扩展：
- PDF page；
- Web selection；
- 其他 anchor。

## canonicalKey
用于发现 / 去重的 Hint，不是永久身份。

## Resolver
把 Resource 当前 Locator 转成真正可启动目标的解析层。

## Resume
把用户送回有意义的上次学习上下文。

## Notes Box
Project 对应的 Vault 笔记文件夹。

不是“自动导入该文件夹所有 Markdown”。

## Recent Note
当前 Project 最近一次实际使用的 Note。

不是某个 Resource 永久绑定的 Note。

## Study Pair
一次具体学习中的：

```text
Resource + Note
```

临时组合。

## Managed
已经被 Go Study Resource 系统管理的媒体。

## Freeform
未被 Go Study 收录，但仍可 Capture 的媒体。

## Capture
快速记录学习信息的动作。

## Capture Action
决定“采集什么”。

例如：
- timestamp；
- comment；
- screenshot。

## Template
决定采集结果“写成什么 Markdown”。

## Action HUD
通过 `Alt+S` 呼出的轻量快捷动作面板。

HUD = Heads-Up Display。

## Preset
绑定在 HUD 某个槽位上的预设 Capture Action。

## Legacy Immersive Shortcuts
旧版 `Alt+1..Alt+4` 快捷动作。

## PotPlayer Adapter
Go Study 对 Windows PotPlayer 的平台适配层。

## Companion
历史上的外部 Helper / File IPC 路线。

当前 Native Windows 实现是主路线。

## Persistence
Obsidian / 插件重启后状态仍然保留。

## Preview
预发布验收版本。

Preview ≠ Stable Release。

## ADR
Architecture Decision Record，架构决策记录。

记录：
> “为什么我们故意这样设计。”
