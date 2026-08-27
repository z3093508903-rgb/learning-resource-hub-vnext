# ADR-004：使用 Project Notes Box + Recent Note，而不是永久 Resource ↔ Note 绑定

状态：**CONFIRMED**

## 背景

看起来最简单的模型是：

```text
Resource A → Note A
```

但真实学习关系不是稳定一对一。

## 决策

使用：

```text
Project
→ Notes Box
→ Recent Note
```

某次学习中的：

```text
Resource + Note
```

称为 Study Pair，是临时上下文。

## 关键 UX

选择 Notes Box：

**不代表自动导入该目录全部笔记。**

## beta.14 相关行为

- Project Note Folder；
- per-create folder override；
- full-width note rows；
- optional focus last line。

## 否决

永久默认 Resource ↔ Note 绑定。

## Deferred

Markdown Heading Anchor 自动定位。
