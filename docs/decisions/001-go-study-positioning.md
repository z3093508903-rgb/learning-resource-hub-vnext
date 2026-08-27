# ADR-001：Go Study 是学习资源工作台，不是完整 Reader / Player

状态：**CONFIRMED**

## 背景

随着资源管理、视频笔记、Resume、Notes 等能力逐渐增加，项目容易被某一个增强功能重新定义。

## 决策

Go Study 的核心定位是：

> Obsidian 桌面端学习资源工作台。

核心价值：
- 组织；
- 启动；
- Resume；
- Note 回到 Source Context。

视频笔记只是可选增强。

## 结果

普通 Project / Resource 不能依赖 PotPlayer 才能使用。

## 当前明确不做

- AI Summary
- Pomodoro
- Statistics
- Calendar
- OCR
- Full PDF Reader
- Full Media Player

## 否决方向

“不断补齐 Reader / Player / AI 功能，最后让 Go Study 承担全部学习过程。”

原因：

会破坏低摩擦 Launcher / Resume 核心。
