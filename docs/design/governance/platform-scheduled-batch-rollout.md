# 定时扫描与批量处理设计 分片：前端、拆分与验收（platform-scheduled-batch.md §7-§11）

> 本分片自 [platform-scheduled-batch.md](./platform-scheduled-batch.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）；文中 `§N` 除显式标注文件路径者外，均指本分片或主文档的同名章节。

## 7. 前端页面

### 7.1 新增页面

| 页面 | 路径 | 功能 |
|:---|:---|:---|
| 定时计划 | `/schedules` | 列表 + 新建/编辑/删除/手动触发 |
| 批量运行 | `/batch-runs` | 列表 + 详情（聚合统计 + 下属 ScanRun）；深链 `?id=<batchRunId>` 自动翻页并展开目标行，`/batch-runs/<id>` 兼容重定向到该形态 |

### 7.2 仓库页面扩展

- `repos.vue` 表格加复选框列 + 「批量扫描」按钮（勾选后激活）
- 仓库编辑表单加 tags 输入（caomei TagsInput 组件，输入标签回车添加）

### 7.3 导航

`layouts/default.vue` 导航栏新增「定时计划」「批量运行」入口（admin/org_admin 可见，viewer 隐藏定时计划管理但可见批量运行只读）。

---

## 8. 子任务拆分

按 [规划规范 §1.1 任务粒度约束](../../standards/planning.md) 拆分为 3 个独立提交子任务，每批 ≤ 10 文件 / ≤ 800 行：

### T704-1 数据模型 + 仓库标签扩展

- Schedule 实体 + BatchRun 实体
- Repository.tags 字段 + ScanRun.batchRunId 字段
- database/index.ts 注册新实体
- Zod 校验 schema（schedule.ts / batch-scan.ts）
- 仓库更新 API 扩展 tags 字段
- 单测：实体字段、Zod 校验、cron 表达式校验

### T704-2 定时调度服务 + API

- scheduler.service.ts：调度服务单例（async 用 BullMQ upsertJobScheduler / sync 用 node-cron）
- selector.ts：仓库选择策略解析纯函数
- Schedule CRUD API（含 BullMQ scheduler 同步 / node-cron 注册同步）
- 手动触发 API
- 前端 `/schedules` 页面
- 单测：selector 策略、cron 校验、调度注册/销毁

### T704-3 批量执行 + 聚合报告 + 前端

- 批量扫描 API（`POST /api/repos/batch-scan`）
- BatchRun 聚合更新（`GET /api/batch-runs/[id]` 时实时聚合）
- scheduled-scan job processor（Worker 处理定时触发的批量入队）
- 前端 `repos.vue` 复选框 + 批量扫描按钮
- 前端 `/batch-runs` 页面
- e2e：批量触发 → 聚合统计闭环（sync 模式验证）
- 单测：聚合统计纯函数、批量入队逻辑

---

## 9. 降级与边界

### 9.1 降级矩阵（对齐 T702）

`auto`（默认）异步需同时满足「Redis 可用」+「存在消费者」——当前阶段唯一消费者是进程内 worker（`IN_PROCESS_WORKER=true`），独立 worker 进程（多容器）尚未实现；`auto` 在无进程内 worker 时自动降级 sync，避免入队后无人消费的静默挂起（见 §9.2）。`QUEUE_ENABLED=true` 为显式强制异步，不受消费者判据约束（无 worker 时仅 warn，为多容器外部 worker 拓扑预留）。

| 模式 | 触发条件 | 定时调度 | 批量执行 | 聚合报告 |
|:---|:---|:---|:---|:---|
| ✅ async | Redis 可用 +（auto 有消费者 / true 强制） | BullMQ upsertJobScheduler | 逐仓库入队（priority=scheduled） | 详情实时聚合 + 周期兜底对账 |
| ❌ sync | Redis 不可用 / `QUEUE_ENABLED=false` / auto 且无进程内 worker | node-cron 进程内 | 逐仓库同步串行 runScanForRepository | 串行结束立即聚合 + 详情实时聚合 + 周期兜底对账 |

### 9.2 多实例约束

- sync 模式（无 Redis）：多实例部署会重复触发定时任务——**文档明确提示**多实例部署必须 `QUEUE_ENABLED=true` + Redis 可用，且需存在消费者（当前阶段为进程内 worker；独立 worker 进程尚未实现）
- async 模式：BullMQ job scheduler 多实例只一个触发（Redis 原子操作），安全

### 9.3 cron 表达式安全

- 用户输入 cron 表达式经 `cron-parser` 校验，无效即 400 拒绝
- 禁止 `* * * * *`（每分钟）等高频表达式？——**不硬禁**，但 UI 提示最小间隔建议 1 小时，避免队列压力
- timezone 必须是有效 IANA 名称（`Intl.DateTimeFormat.supportedTimezonesOf` 校验）

### 9.4 批量规模上限

- `batchScanSchema.repositoryIds` 限制 max 100（单次批量上限）
- `selectorKind='all'` 时无硬上限（按组织仓库数），但逐仓库入队复用 jobId 去重，不会压垮队列
- 大规模（> 50 仓库）批量触发时，async 模式由 Worker concurrency 控制实际并发；sync 模式逐个串行（可能耗时较长，UI 提示）

---

## 10. 依赖变更

- `node-cron`：sync 降级模式进程内调度（仅 sync 模式加载，async 模式不依赖）
- `cron-parser`：cron 表达式校验（BullMQ 已传递依赖，显式声明避免 pnpm 严格模式提升问题）
- 无新增 BullMQ/ioredis 依赖（T702 已落地）

---

## 11. 验收标准

### 11.1 完成定义

- [ ] 能配置定时任务（cron 表达式 + 仓库选择策略 + 扫描参数）并保存
- [ ] 定时到点自动触发批量扫描（async 用 BullMQ scheduler / sync 用 node-cron）
- [ ] 手动批量选择多个仓库一次触发扫描
- [ ] BatchRun 聚合统计跨仓库结果（告警数 / 修复数 / 成功失败比）
- [ ] 降级矩阵覆盖：无 Redis 时定时 + 批量仍可用（node-cron + 同步串行）

### 11.2 最小验证矩阵

| 验证项 | 方法 |
|:---|:---|
| Schedule CRUD | 单测 + e2e（新建/编辑/删除/启用禁用） |
| cron 校验 | 单测（合法/非法表达式） |
| 仓库选择策略 | 单测（4 种 selectorKind + 权限隔离） |
| 定时触发（async） | 集成测试（BullMQ upsertJobScheduler + 短间隔 every 触发） |
| 定时触发（sync） | 单测（node-cron mock + handler 调用断言） |
| 批量手动触发 | e2e（勾选多仓库 → 批量扫描 → BatchRun 进度 → 聚合统计） |
| 聚合统计 | 单测（纯函数：多 ScanRun → BatchRun summary） |
| 降级路径 | e2e（QUEUE_ENABLED=false 强制 sync，批量扫描闭环） |

### 11.3 非目标

- webhook 触发（T702 已预留 priority=5，webhook 接入登记后续）
- 标签管理独立 UI（本版 tags 通过仓库编辑表单输入，无标签增删改查页面）
- 定时计划执行历史趋势图（本版仅列表 + 详情，趋势统计属仪表板增强后续）
- 邮件通知（定时扫描完成发送邮件通知，依赖 SMTP 配置，登记后续）
- 跨组织批量选择（当前单组织模型，多组织体系随 D3 多租户 backlog 触发）
