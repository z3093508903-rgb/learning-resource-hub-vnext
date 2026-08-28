# Go Study · 发布前最终验收收尾清单

状态：VALIDATING  
适用基线：beta20.6 P0 收口版  
首发边界：Windows + Obsidian Desktop + PotPlayer

---

## 0. 发布原则

本轮不再增加新产品方向，只确认核心工作流稳定、视觉边界清晰、重启后状态可恢复。

产品职责固定：

- 正文时间戳 = 回到视频位置
- 悬浮时间线 = 当前笔记内的知识点导航
- Timeline 来源标题 = 辅助理解时间点来自哪期视频
- Study Mode = 当前视频 + 当前笔记的小窗学习会话
- Resource / Note 不建立永久一对一绑定

---

## 1. P0 · 时间戳正文

### 1.1 新时间戳显示
- [ ] Managed 视频生成时间戳后，正文只显示数字，例如 `00:35`
- [ ] Freeform / 零散视频生成时间戳后，正文只显示数字
- [ ] 长视频正确显示 `HH:MM:SS`
- [ ] 正文不显示“回到课程”
- [ ] 正文不显示视频标题
- [ ] 不额外增加 tooltip 文案

通过标准：正文只保留可点击的紧凑时间胶囊。

### 1.2 时间戳点击
- [ ] Managed 时间戳点击仍能回到正确视频与时间
- [ ] Freeform 本地视频时间戳点击仍能回到正确位置
- [ ] 旧 beta15 / beta16 / beta17 兼容链接至少不被新 UI 破坏

### 1.3 时间戳 CSS
- [ ] 深色主题下胶囊清晰但不抢眼
- [ ] 浅色主题下对比正常
- [ ] Hover 只有轻微反馈
- [ ] Obsidian 外链图标不污染胶囊
- [ ] 编辑正文时不影响普通 Markdown 输入

---

## 2. P0 · 悬浮时间线

### 2.1 出现范围
- [ ] 当前 Markdown 有 Go Study 时间戳 → Timeline 出现
- [ ] 普通 Markdown 无时间戳 → Timeline 不出现
- [ ] Go Study 工作台 → Timeline 不出现
- [ ] Settings / 其他非 Markdown 页面 → Timeline 不出现
- [ ] 切换页面后旧 Timeline 不残留

### 2.2 折叠状态
- [ ] 默认仅显示细线 + 来源点
- [ ] 1 个视频来源 → 1 个点
- [ ] 2 个视频来源 → 2 个点
- [ ] N 个视频来源 → N 个点（当前 UI 上限内）
- [ ] 点的数量不随同一视频的时间戳数量增加

### 2.3 Hover 展开
- [ ] 鼠标移入后稳定展开
- [ ] 不闪烁
- [ ] 在来源标题与时间点之间移动不会收起
- [ ] 鼠标移出整个区域后正常收起
- [ ] 背景保持透明 / 轻量，不出现大卡片

### 2.4 多视频来源
- [ ] 同一笔记中的不同 Resource ID 分组正确
- [ ] 同一视频多个时间点归到同一来源
- [ ] Freeform 标题可作为来源名称显示
- [ ] Freeform 后续匹配 Managed 时不会重复成两个来源
- [ ] 相同文件名、不同 locator 不被错误合并

### 2.5 Timeline 点击职责
- [ ] 点击 Timeline 时间点 → 跳到当前笔记对应行
- [ ] 定位后目标知识点有轻微短暂提示
- [ ] Timeline 点击不会直接打开 PotPlayer
- [ ] Timeline 点击不会直接打开网页
- [ ] 真正的视频回跳继续由正文时间戳负责

---

## 3. P0 · 零散视频 Study Mode

前置：用户已经自己在 PotPlayer 打开一个未收录视频。

### 3.1 导航页拖动
- [ ] Go Study 项目导航页中的 Markdown 笔记可拖动
- [ ] 开始拖动后出现与“开始学习”一致的“右侧小窗 / 学习模式”入口
- [ ] 拖入入口后打开 Companion Note
- [ ] Companion 默认使用 right-rail
- [ ] Companion 自动锁定为 Capture Target
- [ ] Companion 默认 Always-on-top
- [ ] 不重新启动 PotPlayer
- [ ] 不把零散视频强制收录为 Resource
- [ ] 当前 PotPlayer 视频被记录为临时 Freeform Study Mode 上下文

### 3.2 HUD 采集
- [ ] 回到 PotPlayer 后 Alt+S 正常
- [ ] 时间戳写入刚刚拖入的小窗笔记
- [ ] Freeform 时间戳后台记录 locator / name / title / position
- [ ] 收录后的同一媒体仍可动态升级为 Managed
- [ ] 关闭 Companion 退出 Study Mode，但不关闭 PotPlayer

---

## 4. HUD / 快捷键回归

- [ ] Alt+S 可呼出 HUD
- [ ] ← / ↑ / → / ↓ / Enter 映射正确
- [ ] 同方向双击确认正常
- [ ] 旧 Alt+1..Alt+4 在 Mixed 模式仍正常
- [ ] 纯笔记动作不生成时间戳
- [ ] 截图 + 时间戳正常
- [ ] 文字 + 时间戳正常
- [ ] 截图 + 文字 + 时间戳正常
- [ ] 取消快速笔记后按设置恢复播放
- [ ] 保存快速笔记后按设置恢复播放

---

## 5. Companion 小窗回归

- [ ] 从 Managed Study Mode 打开
- [ ] 从 Freeform Study Mode 打开
- [ ] 标题栏只显示笔记名
- [ ] 图钉 ON/OFF 正常
- [ ] 小窗位置与尺寸保存
- [ ] 重启 Obsidian 后状态不异常
- [ ] 关闭小窗后 Capture Target 不残留错误锁定
- [ ] 小窗编辑不会导致 Markdown 损坏

---

## 6. Resource / Resume / Vault 生命周期

- [ ] Managed Resource Resume 正常
- [ ] Resource title 重命名后 Timeline 显示新标题
- [ ] Vault 笔记重命名后 Study Mode / Notes Box 路径更新
- [ ] Vault 笔记删除后不产生死循环或崩溃
- [ ] 笔记恢复 / 重建后可重新工作
- [ ] Resource 删除后旧回链仍可安全失败，不崩溃

---

## 7. 外部来源回归

### OpenList
- [ ] 资源发现
- [ ] 打开 / 播放
- [ ] Resume
- [ ] 重启后仍可用

### Bilibili
- [ ] 普通资源启动
- [ ] 分 P 视频
- [ ] 网页来源 metadata 保留
- [ ] 老的 Ctrl+点击正文 Freeform 链接行为不被 Timeline 改动影响

### PotPlayer
- [ ] 冷启动
- [ ] 已打开视频识别
- [ ] 前台 HUD
- [ ] 后台进入 Freeform Study Mode 时只读取当前媒体，不重启视频

---

## 8. 数据与持久化

- [ ] `data.json` 升级不丢项目
- [ ] 旧 backlinkTemplate 默认值自动迁移到时间戳-only 默认
- [ ] 用户自定义 backlinkTemplate 不被覆盖
- [ ] Timeline 开关持久化
- [ ] 视频增强开关持久化
- [ ] Study Mode 关闭后无脏状态
- [ ] 备份可创建
- [ ] 备份可恢复

---

## 9. 安装与升级

### 全新安装
- [ ] 插件可加载
- [ ] 设置页可打开
- [ ] 默认不开启可选视频增强
- [ ] 无控制台致命错误

### 覆盖升级
- [ ] 保留原 `data.json`
- [ ] 替换 `main.js / manifest.json / styles.css`
- [ ] Obsidian Reload 后正常
- [ ] 旧项目 / Resource / Notes Box / HUD 配置存在

---

## 10. 发布文档

- [ ] README 写清产品定位
- [ ] 安装步骤
- [ ] Windows + PotPlayer 首发边界
- [ ] Alt+S HUD 使用说明
- [ ] Managed / Freeform 说明
- [ ] Study Mode 说明
- [ ] Timeline 说明
- [ ] 已知限制
- [ ] 不与旧 learning-resource-hub-next 保证共存
- [ ] 隐私 / 本地数据边界说明

---

## 11. Publish / Hold 判定

### Publish
满足：
- P0 三条主链全部 PASS
- 无数据丢失
- 无崩溃
- 无高频闪烁 / 残留 overlay
- HUD / Companion / Resume 无阻断性回归
- CI / release checker 全绿

### Hold
任一出现：
- 时间戳写错视频 / 写错时间
- Capture 写入错误笔记
- 零散视频 Study Mode 会重启 / 替换用户当前视频
- Timeline 在无关页面残留
- Companion 关闭后仍锁错 Capture Target
- 升级导致 data.json / 项目 / Resource 丢失
- 备份恢复失败
