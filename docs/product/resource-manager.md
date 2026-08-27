# 产品说明：Resource Manager

## 目标

让 Project 成为资源组织与启动入口，同时避免资源维护 UI 压过学习本身。

## 当前资源类型

当前仓库 README 描述支持：

- Vault File
- Local File
- PDF
- Web
- Bilibili
- OpenList
- Anki
- Video

## 身份原则

永久关系指向 Resource ID。

不要指向可变 path / URL / canonicalKey。

## 启动原则

产品层表达用户意图。

平台 Adapter 决定具体怎么启动。

## Move / Relink

资源移动后：

应该“可恢复”，而不是“变成新资源”。

## Vault 删除原则

删除索引引用：

不得删除真实 Vault File。

## UX

管理动作后置。

Start / Resume 前置。
