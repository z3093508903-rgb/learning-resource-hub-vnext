# ADR-006：使用 Action HUD，而不是继续无限增加全局快捷键

状态：**CONFIRMED**

## 背景

Capture 有三个基础维度：

- 时间；
- 评论；
- 截图。

仅三个布尔能力就会产生 7 种非空组合。

如果继续：

```text
Alt+1
Alt+2
Alt+3
Alt+4
Alt+5
Alt+6
Alt+7
```

会造成：

- 快捷键冲突；
- 记忆负担；
- 配置复杂；
- 后续模板扩展困难。

## 决策

主入口：

`Alt+S`

HUD：

```text
              ↑
        评论 + 时间戳

← 时间戳        HUD        截图 + 时间戳 →

              ↓
           纯笔记 / 无时间戳

Enter = 截图 + 评论 + 时间戳
```

槽位允许配置。

## Advanced Path

目标：

```text
Alt+S → ↑
```

熟练以后直接执行。

HUD 既是：

- 新用户提示；
- 高级用户键盘 Router。

## Legacy 兼容

不要立刻删除 `Alt+1..Alt+4`。

当前过渡方向：

**Legacy + HUD / Mixed**

## 否决方案

### Alt+5 / Alt+6 / Alt+7
否决：不可持续。

### 强制只使用 HUD
否决：会破坏已有肌肉记忆。
