# ADR-002：Resource ID 是永久身份，Locator 和 Position 必须分离

状态：**CONFIRMED**

## 背景

路径、URL、OpenList 目录、播放器临时地址都可能变化。

但 Note 与 Resume 不能因此失效。

## 决策

```text
Resource ID ≠ Locator ≠ Position
```

- Resource ID：持久身份；
- Locator：当前位置；
- Position：资源内部学习位置。

`canonicalKey` 只能用于发现 / 去重。

## 解析流程

```text
Go Study Link
→ Validate
→ Resource ID Lookup
→ Current Locator
→ Resolver
→ Player / Platform Adapter
→ Apply Position
```

## 结果

- Relink 不改变 Resource ID；
- Locator 变化不要求重写历史 Note；
- Player-specific 数据不进入永久 backlink；
- 未来可替换播放器 / OS Adapter。

## 否决方案

### Path = Identity
否决：移动文件会导致身份死亡。

### 临时 Signed URL = Identity
否决：不可持久。

### 再建立第二套 Resource ID
否决：与现有 `resource.id` 重复。
