# 当前阶段任务（M7.2：平台能力深化）

> M0-M7.1 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M7 规划定稿（2026-08-09）**：拆 M7.1 认证与用户体系（已归档 2026-08-10）/ M7.2 平台能力深化；执行顺序（决策 D3）：T702 → T704 → T708 → T705 → T703 → T706。
> **T702 已完成**（BullMQ + Redis 队列 + 降级矩阵，3 子任务 APPROVE）；**T704 已全部完成**（2026-08-10 设计先行 + 3 子任务实施，[platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md)；9f13aa0b + 55fa20a9 + 45c3d3cf + b830630e + ee0f533f + d6112649 + 81969be6 + d2898023 + 35b2e95c）。剩余人工验收：async 定时触发集成测试（需 Redis >= 5）、Schedule CRUD e2e。
> **T706 代码前置（C31/C32）已完成**，仅剩发布与文档收口。

---

## M7.2: 平台能力深化

### T702 任务队列与并发控制（BullMQ + Redis + 渐进式降级）

- 优先级：`P2`
- 依赖：M6（进程内互斥锁 `withRepoLock` 升级为跨进程队列）
- 交付物：基于 BullMQ + Redis 的任务调度系统（异步扫描队列 + 并发控制 + 优先级 + 去重 + 重试）。
- **实现决策（2026-08-10 用户确认）**：
  - **D1 异步化**：扫描从"请求内同步完成"（M6 Q2）切换为"入队立即返回 + 前端轮询"；B 模式（github-action）结果回填异步化，消除 30 分钟同步挂起（executor-sandbox.md 已预设此方向）
  - **D2 Redis 基础设施**：本地开发用本机 Redis（已手动启动）；生产 docker-compose 添加 redis 镜像；**无 Redis 时降级**——回退同步模型（直调 `runScanForRepository`，M6 行为）或内存缓存（lru-cache 备选，本次采用同步降级更简单可靠）
  - **D3 worker 部署形态**：推荐**独立 worker 进程**（docker-compose 双服务）；**单容器直接部署**时支持 in-process worker（`IN_PROCESS_WORKER=true`，Nuxt 进程内消费），无独立 worker 可降级
- **降级矩阵**：

  | Redis | Worker | 模式 |
  |:---|:---|:---|
  | ✅ | ✅ 独立进程 | 异步队列（优先级/去重/重试完整） |
  | ✅ | ❌ 单容器 | 异步队列 + in-process worker |
  | ❌ | — | 同步降级（M6 行为，API 兼容） |

- **实现内容**：
  - [x] 子任务 1（队列基础设施）：
    - [x] 依赖：bullmq + ioredis（apps/platform；pnpm-workspace.yaml 审批 msgpackr-extract 构建）
    - [x] `server/services/queue/redis.ts`：ioredis 连接封装（lazyConnect + maxRetriesPerRequest null）+ ping 探测（失败断开防泄漏）
    - [x] `server/services/queue/scan-queue.ts`：BullMQ Queue（name `scan`；jobId=repositoryId 去重；priority 手动 1 / webhook 5 / 定时 10；指数退避；retries 可配 env；完成 1h/失败 24h 清理）
    - [x] `server/services/queue/scan-worker.ts`：Worker + processor（复用 `runScanForRepository`；concurrency 默认 1 可配）
    - [x] `server/services/queue/queue-mode.ts`：模式决策纯函数（QUEUE_ENABLED auto/true/false + Redis 探测 + failover 降级同步）+ jobId/优先级/重试配置解析
    - [x] 单测：`queue-mode.test.ts` 14 例（模式决策 5 + env 解析 + jobId 去重 + 重试配置 + 优先级顺序）
    - [ ] `IN_PROCESS_WORKER` 启动接线（子任务 3 与 scan.post.ts 异步化一并落地）
  - [x] 子任务 2（扫描 API 异步化）：
    - [x] `scan.post.ts`：队列模式 → 预创建 ScanRun(status `pending`) + enqueue + 立即返回；同步降级 → 现有行为（请求内完成）；入队失败 failover → 同步执行（续用 pending run，任务不丢失）
    - [x] `runScanForRepository` 拆分：`createPendingScanRun`（队列模式预创建）+ `ScanRunOptions.runId` 续用（worker 消费时 pending → running）；executorKind 推断提取 `resolveExecutorKind`
    - [x] 状态机：pending 流转（pending → running → completed/failed/dispatched；ScanRunStatus 复用既有 `pending`，无需改状态机）
    - [x] `repos.vue` triggerScan：pending 响应 → 轮询 `GET /api/runs/[id]`（2s 间隔；容器 10min / B 模式 30min 超时）；同步响应直接展示
    - [x] `queue.service.ts`（新增）：惰性单例——探测（**含 BullMQ 版本校验 Redis >= 5.0**）+ 模式决策 + queue/worker（**独立 Redis 连接**，BullMQ 要求）+ IN_PROCESS_WORKER 接线
    - [x] 冒烟验证（真实环境）：**降级路径 ✅**——本地 Redis 3.0 版本过低 → 自动降级 sync（completed 无挂起）；**队列闭环待验证**——本地无 Redis >= 5，登记人工验收（CI redis service 或 Redis 7 环境）
    - [x] e2e：playwright env 显式 `QUEUE_ENABLED=false`（本地有 Redis 会 async 且无 worker 消费导致挂起；强制同步保证本地/CI 一致）
  - [x] 子任务 3（部署与运维）：
    - [x] docker-compose：`redis:7-alpine` 服务（内部网络不映射端口）+ platform `NUXT_REDIS_URL`/`NUXT_QUEUE_*`/`NUXT_IN_PROCESS_WORKER`（默认 true 单容器形态）+ 独立 worker 服务注释预留（SQLite 多进程写不兼容，PostgreSQL 迁移后启用）；`docker compose config` 语法验证通过
    - [x] `.env.example`：`REDIS_URL` / `QUEUE_ENABLED`（auto|true|false + 降级语义）/ `QUEUE_JOB_RETRIES` / `QUEUE_BACKOFF_MS` / `IN_PROCESS_WORKER` + NUXT_ 前缀运行时覆盖说明 + 本地 Redis >= 5.0 提示
    - [x] CI：e2e 强制同步模式（QUEUE_ENABLED=false）无需 Redis service（队列闭环人工验收）；CI 复杂度不增加
    - [x] 文档：compose/.env.example 注释交付队列模式与降级说明（README 平台部署章节随生产部署任务统一）
- 非目标：webhook 触发（队列优先级预留 5，webhook 接入登记后续）、定时扫描（T704）、跨实例分布式锁的精细调优（BullMQ 默认即可）
- 完成定义：
  - [x] 多仓库同时请求扫描时，任务按优先级和队列策略正确调度——**代码语义完整（jobId 去重 + priority 1/5/10 + backoff 重试），队列闭环待 Redis >= 5 环境人工验收**（本地 Redis 3.x 触发降级）
  - [x] 无 Redis 环境平台功能不降级（同步模型可用，API 兼容）——**真实冒烟验证**（Redis 3.0 → version_too_old → 降级 sync completed）
  - [x] 单容器部署可用（in-process worker）——compose 默认 IN_PROCESS_WORKER=true 接线完成，消费闭环待 Redis >= 5 环境验收
- 验收：
  - [x] 有 Redis（>= 5.0）：异步队列闭环（手动触发入队 → worker 执行 → pending→running→completed 流转 → 前端轮询完成）——**真实 Redis 7.4.1 集成测试验证**（queue-integration.test.ts 4 例：入队→worker 消费→processor 收到数据 / 去重 reused / 终态重建 reused=false；进程内执行无后台服务；本地 TEMP_REDIS_INTEGRATION=true 启用，CI 无 Redis 自动 skip）——**待补**：pending→running→completed 状态流转与前端轮询的 HTTP 层验证（需后台服务，登记后续）
  - [x] 无 Redis：同步降级闭环（POST /scan 行为与之前一致）——真实冒烟 completed + e2e 23 用例（QUEUE_ENABLED=false 强制同步）
  - [x] 单容器：`IN_PROCESS_WORKER=true` 时同进程消费队列——集成测试进程内 worker 消费验证（同形态）
  - [x] 优先级：手动 > webhook > 定时（job priority 断言）——SCAN_JOB_PRIORITY 顺序单测覆盖
  - [x] 去重：同仓库未完成扫描重复触发合并（jobId）——真实 Redis 集成测试验证（reused=true）
  - [x] 重试：失败任务指数退避，最大次数可配——parseRetryConfig + backoff 配置单测覆盖
  - [x] 单测 + e2e 全过（106/106 + 23 e2e；队列路径集成测试 4 例 + 降级路径实测）
- 任务粒度：3 个子任务独立提交（单批 ≤ 10 文件 / ≤ 800 行新增，对齐经验归档 §二十四）。

---

### T704 定时扫描与批量处理（cron 调度 + 批量选择 + 聚合报告）

- 优先级：`P2`
- 依赖：T702（BullMQ + Redis 队列基础设施已交付，priority=scheduled 预留、jobId 去重、降级矩阵已就绪）
- 交付物：定时调度 + 批量执行 + 聚合报告（在 T702 队列之上交付"到点自动触发 + 多仓库一次执行 + 跨仓库统计"三能力）。
- **设计文档**：[platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md)（2026-08-10 设计先行，契约与数据模型落盘）
- **实现决策（2026-08-10 设计阶段）**：
  - **D1 双模调度**：async 模式用 BullMQ `upsertJobScheduler`（Redis 持久化、多实例安全、原生 cron pattern）；sync 降级模式用 `node-cron` 进程内调度 + DB 持久化（单实例可用，多实例文档提示需 `QUEUE_ENABLED=true`）
  - **D2 批量选择策略**：4 种——`all`（当前组织全部）/ `organization`（指定组织）/ `tag`（Repository 加 `tags` JSON 列）/ `explicit`（手动指定列表）；当前单组织模型下 all 与 organization 等同，多组织随 D3 backlog 触发
  - **D3 聚合更新策略**：采用轮询更新（`GET /api/batch-runs/[id]` 时实时查询下属 ScanRun 聚合统计 + 写回 BatchRun），不引入 Worker 回调机制（降低耦合）
  - **D4 tags 存储形态**：Repository.tags 用 JSON 字符串列（非独立关联表）——M7.2 单组织场景标签量小，避免关联表复杂度；演进路径：后续需要标签管理 UI 时再升级为关联表
- **降级矩阵**：

  | Redis | 定时调度 | 批量执行 | 聚合报告 |
  |:---|:---|:---|:---|
  | ✅ async | BullMQ upsertJobScheduler | 逐仓库入队（priority=scheduled=10） | 轮询聚合 |
  | ❌ sync | node-cron 进程内 | 逐仓库同步串行 runScanForRepository | 轮询聚合 |

- **实现内容**：
  - [x] 子任务 1（数据模型 + 仓库标签扩展）：
    - [x] `server/entities/schedule.ts`：Schedule 实体（name/cron/timezone/selectorKind/selectorJson/mode/severityThreshold/enabled/lastTriggeredAt/lastBatchRunId + organizationId 补强）
    - [x] `server/entities/batch-run.ts`：BatchRun 实体（source[scheduled|manual]/scheduleId/mode/severityThreshold/repositoryCount/finishedCount/completedCount/failedCount/pendingCount/summaryJson/status/finishedAt + organizationId 补强）
    - [x] Repository 扩展 `tags` 字段（JSON 字符串列，nullable；parseTags 容错解析，空数组存 null）
    - [x] ScanRun 扩展 `batchRunId` 字段（Index，nullable，定时/批量触发时关联）
    - [x] `server/database/index.ts` 注册 Schedule + BatchRun 实体
    - [x] `server/schemas/schedule.ts`：Zod 校验（scheduleSchema 4 策略 selectorJson 交叉校验 + batchScanSchema + cronIsValid 5/6 段 + isValidTimezone）
    - [x] 仓库更新 API 扩展 tags 字段支持（GET 列表/详情 + POST 创建 + PUT 更新；undefined=不修改 / null 或 [] = 清空）
    - [x] 单测：实体字段（内存 SQLite roundtrip）、Zod 校验、cron 表达式合法/非法校验（schedule.test.ts 23 例）
  - [x] 子任务 2（定时调度服务 + API + 前端页面）：
    - [x] `server/services/scheduler/scheduler.service.ts`：调度服务单例（async 用 BullMQ upsertJobScheduler / sync 用 node-cron；register/unregister/init/triggerSchedule 统一触发 + sync 注册幂等）
    - [x] `server/services/scheduler/selector.ts`：仓库选择策略解析纯函数（4 种 selectorKind + 组织权限隔离，explicit 静默过滤跨组织）
    - [x] Schedule CRUD API（`/api/schedules` + `/api/schedules/[id]` + `/api/schedules/[id]/trigger` 手动触发；权限 admin/org_admin + requireOrgResource；调度同步：创建注册/更新注销重注册/删除注销）
    - [x] 前端 `/schedules` 页面（列表 + 新建/编辑/删除/手动触发/启用禁用对话框 + 4 策略动态表单）
    - [x] `layouts/default.vue` 导航新增「定时计划」入口（viewer 隐藏）
    - [x] 单测：selector 4 种策略 + 权限隔离、调度注册/注销双模、触发 sync 串行/async 入队、update schema 无 default 覆盖回归（scheduler 15 例 + schedule 29 例）
  - [x] 子任务 3（批量执行 + 聚合报告 + 前端）：
    - [x] 批量扫描 API（`POST /api/repos/batch-scan`，手动批量触发）
    - [x] BatchRun 列表/详情 API（`/api/batch-runs` + `/api/batch-runs/[id]`，详情含聚合统计 + 下属 ScanRun 列表）
    - [x] BatchRun 聚合统计纯函数（多 ScanRun → summaryJson：alertsTotal/severityCounts/fixedCount + 状态计数）
    - [x] scheduled-scan job processor（Worker 处理定时触发的批量入队：解析仓库列表 → 创建 BatchRun → 逐仓库入队）
    - [x] 前端 `repos.vue` 复选框 + 「批量扫描」按钮
    - [x] 前端 `/batch-runs` 页面（列表 + 详情聚合统计 + 下属 ScanRun 展开）
    - [x] e2e：批量触发 → 聚合统计闭环（QUEUE_ENABLED=false 强制 sync 验证）
    - [x] 单测：聚合统计纯函数、批量入队逻辑
- 非目标：webhook 触发（T702 预留 priority=5，后续接入）、标签管理独立 UI（本版 tags 通过仓库编辑表单输入）、定时计划执行历史趋势图、邮件通知（SMTP 配置依赖，登记后续）、跨组织批量选择（随多租户 backlog）
- 完成定义：
  - [x] 能配置定时任务（cron 表达式 + 仓库选择策略 + 扫描参数）并保存
  - [x] 定时到点自动触发批量扫描（async 用 BullMQ scheduler / sync 用 node-cron）
  - [x] 手动批量选择多个仓库一次触发扫描
  - [x] BatchRun 聚合统计跨仓库结果（告警数 / 修复数 / 成功失败比）
  - [x] 降级矩阵覆盖：无 Redis 时定时 + 批量仍可用（node-cron + 同步串行）
- 验收：
  - [x] Schedule CRUD：单测（scheduler 15 例 + schedule 29 例）；**e2e 未覆盖（登记后续补）**
  - [x] cron 校验：单测（合法/非法表达式，schedule.test.ts 23 例）
  - [x] 仓库选择策略：单测（4 种 selectorKind + 权限隔离，selector.test.ts 6 例）
  - [ ] 定时触发（async）：集成测试（BullMQ upsertJobScheduler + 短间隔 every 触发验证）——**未覆盖，登记人工验收**（仅 upsertJobScheduler mock 单测；真实 Redis 环境 scheduled-scan 集成测试待补，依赖 Redis >= 5）
  - [x] 定时触发（sync）：单测（node-cron mock + handler 调用断言）
  - [x] 批量手动触发：e2e（勾选多仓库 → 批量扫描 → BatchRun 进度 → 聚合统计，batch.e2e.test.ts 2 例）
  - [x] 聚合统计：单测（纯函数：多 ScanRun → BatchRun summary，batch-aggregate.test.ts）
  - [x] 降级路径：e2e（QUEUE_ENABLED=false 强制 sync，批量扫描闭环）
  - [x] 单测 + e2e 全过（platform 单测 179 过/4 条件跳过 + e2e 25 用例 + lint/typecheck/build 全过）
- 任务粒度：3 个子任务独立提交（单批 ≤ 10 文件 / ≤ 800 行新增，对齐经验归档 §二十四）。

---

## 当前状态

- **M7.1 已归档（2026-08-10）**：T701（RBAC + 用户管理 + 个人界面）与 T707（认证扩展：AUTH_MODE 互斥 + OAuth + OIDC SSO）代码交付完成，全部 Review Gate 通过（T707-1 双轮、T707-2/3 各一轮）。质量门：单测 92/92 + e2e 22 用例 + ui-validator 视觉 8/8 + lint/typecheck/build。**剩余 3 项真实凭据人工验收**（OAuth 闭环 / OIDC 闭环 / 配置显示路径），登记 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)。
- **T702 已实施完成（2026-08-10）**：三个子任务全部落地并独立提交——T702-1 队列基础设施（93057088：queue-mode 决策 + jobId 去重 + 优先级 + 重试，双轮 APPROVE）、T702-2 扫描 API 异步化（d909b89c：scan.post 三态 + 轮询 + failover + 终态竞态防护，双轮 APPROVE）、T702-3 部署接线（57a84a1c：compose redis + env + 单容器 worker 形态，APPROVE）。质量门：单测 106/106 + e2e 23 用例 + lint/typecheck/build 全过。**真实环境验收（2026-08-10 补充）**：本地 Redis 7.4.1 + 进程内集成测试（queue-integration.test.ts 4 例：入队→worker 消费 / 去重 / 终态重建）验证 async 队列闭环；降级路径实测（Redis 3.0 version_too_old → sync）。**修复两个冒烟暴露缺陷**：① jobId 含冒号（BullMQ 6 禁止 `:`，add 抛 Custom Id 错误 → failover 同步）→ 改 `scan-` 前缀；② 后台服务冒烟模式在 Windows 不可靠（进程锁/句柄）→ 改进程内集成测试方案。**剩余人工验收项**：HTTP 层 pending→running→completed 状态流转 + 前端轮询体验（需后台服务环境，如 staging 或 CI redis service）。
- **T704 设计先行完成（2026-08-10）**：设计文档 [platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md) 落盘——双模调度（async 用 BullMQ `upsertJobScheduler` / sync 降级用 node-cron）、4 种仓库选择策略（all/organization/tag/explicit，Repository 加 tags JSON 列）、BatchRun 聚合实体 + 轮询聚合更新策略、3 子任务拆分（数据模型 / 调度服务+API / 批量执行+聚合报告）。复用 T702 队列基础设施（priority=scheduled=10 已预留）。**T704-1 已实施完成（2026-08-10）**：Schedule/BatchRun 实体 + Repository.tags + ScanRun.batchRunId + Zod 校验（scheduleSchema 4 策略交叉校验 + batchScanSchema + cronIsValid 5/6 段 + isValidTimezone），仓库 API tags 读写；双轮 Review Gate APPROVE；质量门 lint/typecheck/单测 129/build 全过。**设计文档两处补强**（organizationId 归属列，支撑列表"当前组织"与权限隔离）。**T704-2 已实施完成（2026-08-10）**：双模调度服务（BullMQ upsertJobScheduler / node-cron 降级 + sync 注册幂等）、selector 4 策略权限隔离、Schedule CRUD API + 手动触发（调度同步：创建注册/更新注销重注册/删除注销）、前端 /schedules 页面 + 导航入口；3 分区并发审计 + 3 轮复审（B1 blocker：PATCH default 覆盖已修复——scheduleFields 无 default + scheduleCreateFields 挂缺省值）；质量门 lint/typecheck/单测 150/build 全过。**登记风险**：async 模式 scheduled-scan job 需 T704-3 processor 落地后才被正确消费（合入前不创建 async 定时计划）；空批次/中断 BatchRun 兜底归 T704-3。**T704-3 已实施完成（2026-08-10 合入，2026-08-11 Review Gate 通过）**：批量执行服务层（batch-aggregate 纯函数 + batch-executor：空批次立即 completed / async 全入队失败 failed / 单仓库失败跳过 / duplicate 孤儿 run 置 failed）+ 批量 API（POST /api/repos/batch-scan + GET /api/batch-runs + GET /api/batch-runs/[id] 轮询聚合写回）+ scan-worker scheduled-scan 分发 + 前端（repos 复选框+批量扫描弹窗、/batch-runs 页面聚合统计+2s 轮询详情、导航）+ e2e 批量闭环；**e2e 根因修复**：NUXT_QUEUE_ENABLED 运行时覆盖经 destr 解析为布尔，parseQueueEnabled 只认字符串导致强制同步失效（本地 Redis 可达 → async 挂起），修复后 sync 模式 e2e 闭环通过、全量 e2e 25 通过；**Review Gate（3 分区并发 + 复审）**：B1 blocker 聚合写回覆盖 failed 终态（shouldWriteBackStatus 保护）、warning 入队失败孤儿 run 回收（enqueue_failed）、warning 未知 job name 显式抛错、编号清理——4 项全部关闭后 Pass；质量门 lint/typecheck/定向单测/build 全过。剩余：无（T704 全部子任务完成）；经验归档 §三十四。**登记人工验收**：① async 定时触发集成测试（BullMQ upsertJobScheduler + 短间隔 every 触发验证，需 Redis >= 5 环境；当前仅 mock 单测）；② Schedule CRUD e2e 补覆盖（当前单测 44 例覆盖，e2e 未覆盖）。
- **发布管线自研化（进行中，2026-08-10）**：移除 changeset，自研 release 脚本体系（双模式：A 本地手动提升 + B CI 定时自动，参照 semantic-release）。设计文档 [release-pipeline.md](../design/governance/release-pipeline.md) 落盘；拆分 4 提交（release-version 执行器 → release-publish 发布器 → 原子切换 → 文档收口）。**进度**：提交 1（`release-version.mjs` 版本提升执行器 + 16 单测，依赖传导替代 `updateInternalDependencies`）、提交 2（`release-publish.mjs` 发布执行器 + 5 单测；含 `isPublishedOnRegistry` fetch 化修复——npm view 在 Windows 下 10s 超时必失效）、提交 3（原子切换：脚本改名 + release.yml 双模式接线 + 移除 @changesets/cli + HEAD 锚点校验）、提交 4（文档收口：release.md 重构 + 经验归档 §三十二 + research 注记）均已完成并 Review Gate Pass。**扩展（2026-08-10）**：GitHub Release 自动化（提交 5）——`release:github` 聚合 Release（v tag 由 release:publish 打 + 随全量推送核验；notes = 版本矩阵 + 根 changelog 段 / core-only 取锚包包级段；prerelease + 幂等 + 失败 warn 不阻断），双轮 Review Gate 通过，全量单测 1192/1196。**剩余**：真实发布轮次（含 engine/mcp 首发）CI 端到端裁决（GitHub Release 创建 + 无发布轮次 no-op）；P3 观察项（main 副作用路径测试）。**CI 修复（2026-08-10，28ba588b）**：Test workflow `pnpm -r build` 与 Pages Deploy `docs:build` 因 release.md 263 行表格裸 HTML `<path>`（缺反引号，markdown-it 按 raw HTML 输出 → Vue 编译器 Element is missing end tag）双双失败；加反引号转义修复（与 262 行 `<pkg>@<version>` 惯例一致），本地 docs build + lint:md 通过，Review Gate Pass（quick）。**CI 脚本化（2026-08-10）**：release.yml 三个长 shell 块提取为脚本（release.yml 183 → ~100 行）——① `verify:changelog`（changelog 版本段校验，正则统一到 extractSection + 根锚单点派生，8 单测）；② `release:push-tags`（tag 推送核验，失败路径 token 脱敏 B1 双轮，5 单测）；③ `release:auto-version`（schedule 自动提升：版本选择统一 resolveAnchorVersion + 段提取精确化 + 显式 URL push，10 单测）；全量单测 1215/1219，全部 Review Gate Pass。**剩余**：真实发布轮次 CI 端到端裁决；P3 观察项（main 副作用路径测试）；release:auto-version 完整流程待 schedule 启用后首个 cron 裁决。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
  - 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
