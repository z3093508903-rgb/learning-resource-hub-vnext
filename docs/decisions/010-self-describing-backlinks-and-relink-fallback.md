# ADR-010：Managed 回链采用“Resource ID 优先 + 自描述兜底”

状态：**CONFIRMED**

日期：2026-08-29

## Context

Go Study 的 legacy Managed v1 回链只保存：

- Resource ID
- Position

这在同一份完整插件状态内很稳定，但当出现以下情况时会失效：

- 重装插件但没有带回 data.json；
- 只同步 Vault Markdown，没有同步 Resource state；
- 更换设备；
- Resource 被删除后旧 ID 不再存在。

旧 v1 链接如果已经失去 Resource state，本身无法凭 Resource ID + Position 反推出原始本地路径或网页 URL。

完整的跨设备 / 账号同步属于独立产品能力，本阶段明确延期，不能要求它成为每条时间戳可用的前置条件。

## Decision

### 1. Resource ID 仍然是 Managed 主身份

不把 locator 重新升级为 durable identity。

新 Managed v3 仍以：

`resource=<ResourceID>`

作为首要身份。

### 2. 新回链同时隐藏保存来源兜底

Managed v3 可以附带：

- locator
- portable name
- title
- web
- position

这些字段不改变可见 Markdown。默认仍只显示时间戳，例如：

`00:35`

### 3. Resolver 按可信度逐级恢复

1. exact Resource ID
2. 已保存 legacy alias
3. v3 locator match
4. v3 unique portable-name match
5. v3 degrade to Freeform
6. legacy v1 recovery snapshot lookup
7. legacy v1 manual one-time relink

不根据模糊标题自动猜 Resource。

### 4. Legacy v1 一次性重新关联

如果旧 v1：

- 当前 Resource 已不存在；
- recovery 也找不到；

用户可以先重新收录对应视频，再从候选视频中明确选择一次。

保存：

`referenceAliases[oldResourceId] = currentResourceId`

以后同一旧 ID 的回链统一复用，不修改原 Markdown。

### 5. Ctrl+点击与正文普通点击共用同一来源恢复逻辑

普通点击：
- 回到播放器 / Freeform fallback。

Ctrl+点击：
- 尽量恢复 browser source；
- Bilibili 保留分 P 并应用时间位置。

Timeline 不参与播放，它只消费这些 metadata 做当前笔记内来源分组和知识点导航。

### 6. 完整同步保持独立

Import/Export、Vault manifest、multi-locator、account sync 不进入本 ADR 的 Runtime 依赖。

## Consequences

优点：

- 新时间戳即使 Resource state 丢失，也更有机会独立工作；
- Markdown 可见层保持极简；
- 仍保留 Resource ID 的稳定管理身份；
- 旧 v1 有 recovery + manual relink 兜底；
- 不必等待账号同步才能首发。

限制：

- 已经生成的 v1 链接不会凭空获得 locator/web；
- 如果 Resource state、recovery 和原始来源信息全部消失，只能人工重新关联；
- 本地绝对路径仍不是跨设备 locator，需要后续 device mapping / multi-locator。
