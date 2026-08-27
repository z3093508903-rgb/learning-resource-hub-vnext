# ADR-003：Native Windows/PotPlayer 是主路线，AHK Companion 不再是正常依赖

状态：**CONFIRMED**

## 背景

早期 Immersive Capture 依赖外部 Helper / Companion。

问题：
- 部署复杂；
- 容易被 fallback 掩盖；
- 多一层 IPC；
- 安全边界复杂；
- 用户必须维护额外组件。

beta.8 开始切到插件原生 Windows 控制。

## 决策

Native Windows/PotPlayer 是当前标准路线。

正常 Runtime 不得要求 AutoHotkey / markdown2potplayer Companion。

## 验收规则

测试 Native 路线时：

必须退出 AutoHotkey / markdown2potplayer。

否则 fallback 可能掩盖 Native Bug。

## 上层接口

上层表达意图：

```text
play(resource, position)
getCurrentMedia()
getCurrentPosition()
captureFrame()
```

而不是直接依赖 PotPlayer 参数。

## Fail Closed

以下情况不得猜：

- Note target 无效；
- Current Media 无法安全匹配；
- 用户取消 Capture。
