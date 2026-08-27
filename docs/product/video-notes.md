# 产品说明：Video Notes

## 产品位置

视频笔记是可选增强。

关闭视频增强后：

Go Study 的普通 Project / Resource 工作台必须仍可完整使用。

## Native Windows

当前 Windows Player：

PotPlayer。

当前主路线：

Native plugin control。

External AHK / Companion 不得成为正常依赖。

## Legacy

Alt+1..Alt+4 继续保留。

## Universal Capture

主入口：

`Alt+S`

HUD 里的 Action 由：

- Timestamp
- Comment
- Screenshot

组合。

No Timestamp 必须是 first-class。

## Managed

使用 Resource ID + Resolver。

## Freeform

即使没有先加入 Go Study，也允许 Capture。

但 Locator 变化时持久性弱于 Managed。

## Focus 风险

Global Shortcut + PotPlayer + Obsidian 会出现真实 OS Focus 问题。

自动测试无法完全证明 HUD 方向键真的由 HUD 接收。

必须真机验收。
