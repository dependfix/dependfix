# 当前阶段任务（M7.2：平台能力深化）

> M0-M7.1 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M7 规划定稿（2026-08-09）**：拆 M7.1 认证与用户体系（已归档 2026-08-10）/ M7.2 平台能力深化；执行顺序（决策 D3）：T702 → T704 → T708 → T705 → T703 → T706。
> **T702 已完成**（BullMQ + Redis 队列 + 降级矩阵，3 子任务 APPROVE）；**T704 已全部完成**（2026-08-10 设计先行 + 3 子任务实施，[platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md)；9f13aa0b + 55fa20a9 + 45c3d3cf + b830630e + ee0f533f + d6112649 + 81969be6 + d2898023 + 35b2e95c）。剩余人工验收：async 定时触发集成测试（需 Redis >= 5）、Schedule CRUD e2e。
> **T708 规划定稿（2026-08-11）**：i18n 国际化上收（4 子任务），见下方 M7.2 T708 区块；非目标登记 backlog（服务端错误消息 / 偏好多设备同步）。
> **T706 代码前置（C31/C32）已完成**，仅剩发布与文档收口。
> **T709 已完成（2026-08-12）**：治理规范收敛——验证分级矩阵与分级审计执行协议去冲突（单点声明收敛，deep 审计 Pass），见下方 T709 区块。

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

### T708 国际化 i18n（全平台 UI 双语 zh-CN / en-US）

- 优先级：`P2`
- 依赖：M6（文案基线）、T701（settings.vue 语言偏好联动点已预留占位）；建议在 T702/T704 完成后执行（当前阶段）
- 交付物：全平台 UI 双语（zh-CN 默认 / en-US），语言切换 + 检测 + 本地化格式。
- **实现决策（2026-08-11 规划定稿）**：
  - **D1 框架与策略**：`@nuxtjs/i18n` v10+（Nuxt 4 兼容），`strategy: 'prefix_and_default'`——zh-CN 默认无前缀、en-US 加 `/en`；语言包懒加载（`app/i18n/locales/{zh-CN,en-US}.json` 单文件 + 命名空间分层 common/auth/dashboard/repos/schedules/batch 等）
  - **D2 语言检测优先级**：URL 前缀 > Cookie（`i18n_locale`）> 浏览器 Accept-Language > 默认 zh-CN（`defineI18nLocaleDetector`，query/cookie/header 顺序探测）
  - **D3 语言偏好存储**：Cookie 统一存储（登录/未登录一致；导航栏切换器与 settings.vue 选择均经 `setLocale` 写 cookie）；登录用户多设备同步（服务端持久化）登记 backlog C37，本期不做
  - **D4 PrimeVue 联动**：locale 变化同步 `usePrimeVue().config.locale`（官方 `primevue/locale` zh_CN / en），对话框确认/取消按钮、表格空态等组件内置文案随语言切换
  - **D5 本地化格式**：vueI18n `datetimeFormats` / `numberFormats` 按 locale 配置（zh-CN 年月日 / en-US ISO 风格），时间/日期/数字展示随语言切换
- **实现内容**：
  - [x] 子任务 1（i18n 基建）：
    - [x] 依赖：`@nuxtjs/i18n`（apps/platform）+ nuxt.config `i18n` 配置（locales/strategy/defaultLocale/detectBrowserLanguage 关闭由 detector 接管）
    - [x] `app/i18n/localeDetector.ts`：URL > Cookie > Accept-Language > zh-CN 检测纯函数
    - [x] `app/i18n/locales/zh-CN.json` + `en-US.json`：common 命名空间骨架（导航/通用按钮/对话框/空态/错误提示）
    - [x] 导航栏语言切换器（default.vue）+ settings.vue 语言偏好激活（占位 Select 替换为真实切换，写 cookie + setLocale）
    - [x] PrimeVue locale 联动插件（locale 变化 → `usePrimeVue().config.locale` 切换 zh_CN/en）
    - [x] vueI18n datetime/number formats 配置（zh-CN / en-US）
  - [x] 子任务 2（认证与框架文案抽取）：
    - [x] login.vue / register.vue（登录注册 + OAuth/OIDC 按钮 + 注册准入提示）
    - [x] settings.vue / users.vue（个人设置 + 用户管理，含语言偏好文案）
    - [x] default.vue 导航 / app.vue / index.vue / dashboard.vue（框架 + 仪表板）
  - [x] 子任务 3（业务大页文案抽取）：
    - [x] repos.vue（仓库列表/导入/编辑/批量扫描弹窗，含 tags 标签输入）
    - [x] schedules.vue（定时计划列表/编辑/触发/4 策略动态表单）
  - [x] 子任务 4（其余业务 + 收尾）：
    - [x] alerts.vue / credentials.vue / batch-runs.vue / repos/[id]/runs.vue 文案抽取
    - [x] 硬编码文案零命中扫描（模板 + script 用户可见字符串 grep 中文零命中，排除注释/console/测试）
    - [x] e2e：语言切换闭环（切 en-US 断言英文文案 + PrimeVue 对话框按钮 + 回切 zh-CN 断言中文）+ 全量回归
    - [x] 文档收口：README / 部署文档补 i18n 说明
- 非目标：服务端 API 错误消息 i18n（55 处 createError 中文，登记 backlog C36）、语言偏好多设备同步（C37）、zh-TW / ja-JP / ko-KR 第三方语言（结构可扩展，暂不实施）、邮件通知 i18n、报告文档 i18n
- 完成定义：
  - [x] 切换语言后全平台页面文案切换（zh-CN / en-US），无硬编码文案残留（grep 扫描零命中）
  - [x] 默认 zh-CN 无前缀 URL 行为正确，`/en` 前缀路由可用
  - [x] PrimeVue 组件内置文案（对话框按钮/表格空态）随语言切换
- 验收：
  - [x] 语言检测：URL > Cookie > 浏览器 > 默认优先级（单测 resolveLocale 纯函数 7 例）
  - [x] 语言切换器：导航栏 + settings.vue 双入口联动（setLocale + cookie 持久化，刷新保持）——e2e 断言
  - [x] PrimeVue locale 联动：切换后对话框按钮/空态文案变化（e2e 断言 Close/关闭）
  - [x] 时间/日期/数字格式：随 locale 变化（d(new Date(...), 'long') 统一替换 toLocaleString，4 处页面）
  - [x] 硬编码扫描：grep 中文零命中（模板 + script 用户可见字符串 + 全角标点口径）
  - [x] e2e：i18n 切换闭环用例（3 例）+ 全量回归（28 用例全过）
  - [x] 单测 + lint/typecheck/build 全过（单测 186/190 + e2e 28）
- 任务粒度：4 个子任务独立提交（单批 ≤ 10 文件 / ≤ 800 行新增，对齐经验归档 §二十四）。

---

### T709 治理规范收敛：验证分级矩阵与分级审计执行协议去冲突（✅ 已完成）

- 优先级：`P3`（治理）
- **为何插队**：用户直接指出 `docs/standards/ai-collaboration.md` §2.2 验证分级矩阵与 `.github` 下 agent/skill 实际执行的 `audit-depth` 分级审计执行协议两套体系并存冲突（同一张表三处重复抄写且 standard 行措辞已漂移、两维关系未声明、默认 `deep` 规则覆盖不一致）。属治理定义缺陷，直接影响后续所有 Review Gate 执行口径，修复成本低，插队处理。
- 交付物：消除两套分级体系冲突，按 [documentation.md §4 规范单点声明原则](../standards/documentation.md) 收敛为单一权威 + 一行引用。
- 实现内容：
  - [x] `ai-collaboration.md`：§1.3 升级为"分级审计执行协议（audit-depth）"唯一权威（quick/standard/deep + 时间盒，统一 standard 适用改动措辞）；§2.2 补充两维正交关系声明（验证矩阵=最低证据门槛，audit-depth=核验投入）
  - [x] `code-reviewer/SKILL.md`：步骤 2.5 删除重复表格 → 一行引用 + 保留 5 条执行规则 + 补"未声明默认 deep"（此前缺失）
  - [x] `code-auditor.agent.md`：分级审计执行协议收敛为引用（保留"不得自行升级深度"），总结句对齐 audit-depth 术语
  - [x] `full-stack-master` agent + skill：审计调用协议补充 §1.3 引用、删除重复时间盒数值
- 验收：
  - [x] 全库 grep：时间盒数值仅存于 §1.3 一处；三级适用改动措辞四文件一致；默认 deep 规则 5 处一致
  - [x] lint:md + check:links（115 文件）+ 编号标记扫描零命中
  - [x] Review Gate：deep 审计 Pass（无 blocker；warning-1 Todo 登记已补齐、suggest-1 总结句收敛已关闭）
- 任务粒度：单批提交（5 文件 / 16+ 行，对齐经验归档 §二十四）。

---

### T710 CI lint 警告清理（10 → 0）（✅ 已完成）

- 优先级：`P2`（CI 门禁修复，2026-08-12 插队）
- 背景：`pnpm run lint`（`eslint . --fix --max-warnings 10`）在 test/release/docker 三工作流失败——全仓 10 个警告（6 文件 max-lines + 1 max-lines-per-function + 2 unused-vars + 1 no-dynamic-delete）。
- 拆分批次（单批 ≤ 10 文件，对齐经验归档 §二十四）：
  - [x] 批次 1+2（提交 8f95a2ec）：templates.ts 未用参数 ×2 + engine argsIgnorePattern `^_` 口径 + no-dynamic-delete 不可变重建 + dependency fixer IO 组拆 `overrides-io.ts`（max-lines 947→~720）——10→6
  - [x] 批次 3（提交 660362fb）：`app/index.ts` processRepoForFix（681 行）拆 5 步骤函数至 `repo-fix.ts`（max-lines-per-function 681→336），fetch/默认分支/截断提示模块化至 `repo-alerts.ts`，aiUsageAggregate → aiUsageRef 引用回写（max-lines 1331→~590）——6→4
  - [x] 批次 4（提交 e9998354）：3 个测试文件 max-lines（>1000）拆分——`core/report/report.test.ts`（1169）+ `engine/app/index.test.ts`（1241）+ `engine/fixers/dependency/index.test.ts`（1534）拆 describe 至新文件 + 提取 test-helpers——4→1
  - [x] 批次 5（提交 4ee9cf59）：`apps/platform/app/pages/repos.vue` max-lines（980/800）批量导入 Dialog 拆 `ImportReposDialog.vue` 子组件——1→0
- 验收：全仓 `pnpm run lint` **0 警告**（10→0）；各批次 Review Gate Pass；全量测试无回归（core 129 + engine 764 + platform 186/190 + e2e 28）。
- 附带清理：repo-fix 拆出时顺手修正 helpers.ts 注释漂移；i18n 孤儿 key credentialLoadFailed 删除。
- 经验：① PowerShell `git show | Set-Content` 文本管道按 GBK 解码会损坏 UTF-8（改用 cmd 重定向字节安全导出）；② tsconfig exclude `*.test.ts` 会掩盖测试文件类型错误（test-helpers 提取暴露后已修正来源与缺失字段）。

---

### T711 覆盖率口径修正 + 冲刺至 80%（口径已完成，冲刺进行中）

- 优先级：`P2`（质量门禁）
- 背景：`vitest.config.ts` coverage.include 只统计 `packages/*/src`，忽略了 `apps/platform`（server/app 源码 + 25+ 测试文件）与 `scripts/*.mjs`（9 个 `.test.mjs`），覆盖率数字虚高失真。用户要求：优化统计口径 + 目标设为 80%。
- 口径修正（2026-08-12 已完成）：
  - [x] coverage.include 扩展为 5 段：`packages/{core,engine,cli,mcp}/src/**/*.ts` + `apps/platform/app/**/*.ts` + `apps/platform/server/**/*.ts` + `scripts/*.mjs`
  - [x] exclude 追加 `**/*.test.mjs`；`.vue` 组件与 e2e 不纳入（口径声明见 [testing.md §5](../standards/testing.md)）
  - [x] thresholds 四维 80（statements/branches/functions/lines）
  - [x] testing.md §5 目标表同步（整体 60% → 80%，模块目标统一 80%，登记新口径基线）
- **基线（新口径）**：Statements **67.81%**（4382/6462）/ Branches 65.39% / Functions 68.43% / Lines 67.83%——未达门槛，`pnpm run test:coverage` 当前非零退出（CI coverage job 会红，直至冲刺达标）。
- **缺口分析（低覆盖高 ROI 候选）**：
  - `apps/platform`：`server/api/*` 22 个 Nuxt 路由 handler 全 0%、`app/` composables/middleware/plugins 全 0%（e2e 覆盖但单测未覆盖）、`database/typeorm-adapter.ts` 0%、`queue.service.ts` 8%、`scan-orchestrator.service.ts` 5%、`utils/auth.ts` 0%
  - `scripts`：整体 33.66%——check-links 0% / distill-wisdom 0% / sync-skills 0% / auto-version 29% / tag-released-versions 20%
  - `packages/mcp`：整体 35%（bin.ts 0%、index.ts 39%——入口薄壳）
  - `packages/cli`：runner.ts 0%、bin.ts 0%、skills/source.ts 25%
  - `packages/core`：errors/app-error 44%、report/writer 69%、若干 re-export 入口 0%（planner/index、toolchain/index）
  - `packages/engine`：app/branch-cleanup 31%、app/index 62%、runners/verification-gate 73%
- 冲刺执行按 [testing.md §5.1 覆盖率冲刺执行方法](../standards/testing.md)（fresh 基线 → 高 ROI 切片 → 小步快跑 → 全量 checkpoint）。
- 验收：`pnpm run test:coverage` 四维全部 >= 80%（CI coverage job 转绿）。
- 任务粒度：口径修正单批提交（1 配置 + 2 文档）；冲刺按切片分批提交（单批 <= 10 文件）。

---

## 当前状态

- **T711 覆盖率口径修正已完成（2026-08-12）**：coverage.include 从仅 `packages/*/src` 扩展为 5 段口径（packages 四包 + apps/platform app+server + scripts），thresholds 四维 80。新口径基线 Statements 67.81% / Branches 65.39% / Functions 68.43% / Lines 67.83%——未达 80% 门槛，`pnpm run test:coverage` 当前非零退出（CI coverage job 红，冲刺见上 T711 区块；文档见 [testing.md §5](../standards/testing.md)）。

- **T709 治理规范收敛已完成（2026-08-12）**：用户指出 `ai-collaboration.md` §2.2 验证分级矩阵与 `.github` agent/skill 执行的 `audit-depth` 分级审计执行协议冲突——同一张表在 3 处重复抄写（standard 行措辞漂移）、两维关系未声明、默认 `deep` 规则覆盖不一致。修复：§1.3 升级为唯一权威协议（quick/standard/deep + 时间盒）并声明与 §2.2 正交关系（验证矩阵=最低证据门槛 / audit-depth=核验投入），code-reviewer SKILL 步骤 2.5 / code-auditor agent / full-stack-master agent+skill 全部收敛为一行引用（补"未声明默认 deep"）。质量门：lint:md + check:links（115 文件）+ 编号扫描零命中；deep 审计 Pass（无 blocker，warning-1 Todo 登记与 suggest-1 总结句收敛均已关闭）。提交：单批。

- **M7.1 已归档（2026-08-10）**：T701（RBAC + 用户管理 + 个人界面）与 T707（认证扩展：AUTH_MODE 互斥 + OAuth + OIDC SSO）代码交付完成，全部 Review Gate 通过（T707-1 双轮、T707-2/3 各一轮）。质量门：单测 92/92 + e2e 22 用例 + ui-validator 视觉 8/8 + lint/typecheck/build。**剩余 3 项真实凭据人工验收**（OAuth 闭环 / OIDC 闭环 / 配置显示路径），登记 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)。
- **T702 已实施完成（2026-08-10）**：三个子任务全部落地并独立提交——T702-1 队列基础设施（93057088：queue-mode 决策 + jobId 去重 + 优先级 + 重试，双轮 APPROVE）、T702-2 扫描 API 异步化（d909b89c：scan.post 三态 + 轮询 + failover + 终态竞态防护，双轮 APPROVE）、T702-3 部署接线（57a84a1c：compose redis + env + 单容器 worker 形态，APPROVE）。质量门：单测 106/106 + e2e 23 用例 + lint/typecheck/build 全过。**真实环境验收（2026-08-10 补充）**：本地 Redis 7.4.1 + 进程内集成测试（queue-integration.test.ts 4 例：入队→worker 消费 / 去重 / 终态重建）验证 async 队列闭环；降级路径实测（Redis 3.0 version_too_old → sync）。**修复两个冒烟暴露缺陷**：① jobId 含冒号（BullMQ 6 禁止 `:`，add 抛 Custom Id 错误 → failover 同步）→ 改 `scan-` 前缀；② 后台服务冒烟模式在 Windows 不可靠（进程锁/句柄）→ 改进程内集成测试方案。**剩余人工验收项**：HTTP 层 pending→running→completed 状态流转 + 前端轮询体验（需后台服务环境，如 staging 或 CI redis service）。
- **T704 设计先行完成（2026-08-10）**：设计文档 [platform-scheduled-batch.md](../design/governance/platform-scheduled-batch.md) 落盘——双模调度（async 用 BullMQ `upsertJobScheduler` / sync 降级用 node-cron）、4 种仓库选择策略（all/organization/tag/explicit，Repository 加 tags JSON 列）、BatchRun 聚合实体 + 轮询聚合更新策略、3 子任务拆分（数据模型 / 调度服务+API / 批量执行+聚合报告）。复用 T702 队列基础设施（priority=scheduled=10 已预留）。**T704-1 已实施完成（2026-08-10）**：Schedule/BatchRun 实体 + Repository.tags + ScanRun.batchRunId + Zod 校验（scheduleSchema 4 策略交叉校验 + batchScanSchema + cronIsValid 5/6 段 + isValidTimezone），仓库 API tags 读写；双轮 Review Gate APPROVE；质量门 lint/typecheck/单测 129/build 全过。**设计文档两处补强**（organizationId 归属列，支撑列表"当前组织"与权限隔离）。**T704-2 已实施完成（2026-08-10）**：双模调度服务（BullMQ upsertJobScheduler / node-cron 降级 + sync 注册幂等）、selector 4 策略权限隔离、Schedule CRUD API + 手动触发（调度同步：创建注册/更新注销重注册/删除注销）、前端 /schedules 页面 + 导航入口；3 分区并发审计 + 3 轮复审（B1 blocker：PATCH default 覆盖已修复——scheduleFields 无 default + scheduleCreateFields 挂缺省值）；质量门 lint/typecheck/单测 150/build 全过。**登记风险**：async 模式 scheduled-scan job 需 T704-3 processor 落地后才被正确消费（合入前不创建 async 定时计划）；空批次/中断 BatchRun 兜底归 T704-3。**T704-3 已实施完成（2026-08-10 合入，2026-08-11 Review Gate 通过）**：批量执行服务层（batch-aggregate 纯函数 + batch-executor：空批次立即 completed / async 全入队失败 failed / 单仓库失败跳过 / duplicate 孤儿 run 置 failed）+ 批量 API（POST /api/repos/batch-scan + GET /api/batch-runs + GET /api/batch-runs/[id] 轮询聚合写回）+ scan-worker scheduled-scan 分发 + 前端（repos 复选框+批量扫描弹窗、/batch-runs 页面聚合统计+2s 轮询详情、导航）+ e2e 批量闭环；**e2e 根因修复**：NUXT_QUEUE_ENABLED 运行时覆盖经 destr 解析为布尔，parseQueueEnabled 只认字符串导致强制同步失效（本地 Redis 可达 → async 挂起），修复后 sync 模式 e2e 闭环通过、全量 e2e 25 通过；**Review Gate（3 分区并发 + 复审）**：B1 blocker 聚合写回覆盖 failed 终态（shouldWriteBackStatus 保护）、warning 入队失败孤儿 run 回收（enqueue_failed）、warning 未知 job name 显式抛错、编号清理——4 项全部关闭后 Pass；质量门 lint/typecheck/定向单测/build 全过。剩余：无（T704 全部子任务完成）；经验归档 §三十四。**登记人工验收**：① async 定时触发集成测试（BullMQ upsertJobScheduler + 短间隔 every 触发验证，需 Redis >= 5 环境；当前仅 mock 单测）；② Schedule CRUD e2e 补覆盖（当前单测 44 例覆盖，e2e 未覆盖）。
- **发布管线自研化（进行中，2026-08-10）**：移除 changeset，自研 release 脚本体系（双模式：A 本地手动提升 + B CI 定时自动，参照 semantic-release）。设计文档 [release-pipeline.md](../design/governance/release-pipeline.md) 落盘；拆分 4 提交（release-version 执行器 → release-publish 发布器 → 原子切换 → 文档收口）。**进度**：提交 1（`release-version.mjs` 版本提升执行器 + 16 单测，依赖传导替代 `updateInternalDependencies`）、提交 2（`release-publish.mjs` 发布执行器 + 5 单测；含 `isPublishedOnRegistry` fetch 化修复——npm view 在 Windows 下 10s 超时必失效）、提交 3（原子切换：脚本改名 + release.yml 双模式接线 + 移除 @changesets/cli + HEAD 锚点校验）、提交 4（文档收口：release.md 重构 + 经验归档 §三十二 + research 注记）均已完成并 Review Gate Pass。**扩展（2026-08-10）**：GitHub Release 自动化（提交 5）——`release:github` 聚合 Release（v tag 由 release:publish 打 + 随全量推送核验；notes = 版本矩阵 + 根 changelog 段 / core-only 取锚包包级段；prerelease + 幂等 + 失败 warn 不阻断），双轮 Review Gate 通过，全量单测 1192/1196。**剩余**：真实发布轮次（含 engine/mcp 首发）CI 端到端裁决（GitHub Release 创建 + 无发布轮次 no-op）；P3 观察项（main 副作用路径测试）。**CI 修复（2026-08-10，28ba588b）**：Test workflow `pnpm -r build` 与 Pages Deploy `docs:build` 因 release.md 263 行表格裸 HTML `<path>`（缺反引号，markdown-it 按 raw HTML 输出 → Vue 编译器 Element is missing end tag）双双失败；加反引号转义修复（与 262 行 `<pkg>@<version>` 惯例一致），本地 docs build + lint:md 通过，Review Gate Pass（quick）。**CI 脚本化（2026-08-10）**：release.yml 三个长 shell 块提取为脚本（release.yml 183 → ~100 行）——① `verify:changelog`（changelog 版本段校验，正则统一到 extractSection + 根锚单点派生，8 单测）；② `release:push-tags`（tag 推送核验，失败路径 token 脱敏 B1 双轮，5 单测）；③ `release:auto-version`（schedule 自动提升：版本选择统一 resolveAnchorVersion + 段提取精确化 + 显式 URL push，10 单测）；全量单测 1215/1219，全部 Review Gate Pass。**剩余**：真实发布轮次 CI 端到端裁决；P3 观察项（main 副作用路径测试）；release:auto-version 完整流程待 schedule 启用后首个 cron 裁决。**首个真实发布轮次（2026-08-12，run 31561400025）**：`@dependfix/core@0.2.1` OIDC 发布成功但 `git tag -a` 失败（Committer identity unknown）——identity 配置只在 schedule-only 的 Auto version 步骤（auto-version.mjs）中，workflow_dispatch 手动触发时缺失。修复：① release.yml 在 Release Publish 前显式配置 git identity（github-actions[bot]）；② `release-publish.mjs` 幂等自愈——`skip-published` 且本地无 tag 且 HEAD 锚点校验通过时自动补 annotated tag 并计入 v tag 锚点解析（tagRecovered + 2 单测），重跑 CI 全链路恢复（tag + v tag + GitHub Release）；经验归档 §三十七；release.md 已知行为同步。质量门：scripts 全量单测 92/92 + eslint 零问题 + typecheck 全过 + lint:md 通过。**当前发布状态**：core@0.2.1 已发布 npm（tag 待恢复，重跑 CI 时若 HEAD 为发布提交自动补）；engine@0.1.1 / dependfix@0.3.0 / mcp@0.1.0 本地版本已提升待发布（当前 master HEAD=15b4c905 非发布提交，直接重跑会被 HEAD 锚点校验拦截，需先使 HEAD 成为 touch 待发布包路径的提交）。**剩余（更新）**：0.3.0 轮真实发布 CI 端到端裁决（含 engine/mcp 首发 + GitHub Release 创建 + 无发布轮次 no-op）。**changelog 防重复增强（2026-08-12）**：发布中断残留段（0.3.0/0.1.1/0.1.0 等无 tag 未发布段）在再次提升版本后与新段内容重复——`changelog.mjs` 新增 `cleanupUnreleasedSections` 自动清理（低于当前版本 + 无 tag + npm 确认未发布才删；tag/npm 已发布/查询失败保守保留；async 判定修复 + 7 单测 + 注入残留段真实回归验证），release.md CHANGELOG 策略同步。
- **T708 规划定稿（2026-08-11）**：i18n 国际化从 backlog 上收至 M7.2 当前阶段（执行顺序 D3：T702 → T704 已完成，T708 下一项）。现状盘点：平台 13 页面 + 布局 + app.vue 全中文硬编码、无 @nuxtjs/i18n 依赖、settings.vue 已有 T701 预留语言偏好占位（禁用 Select）、PrimeVue 4.5.5 官方 zh_CN/en locale 包可用、服务端 API 55 处 createError 中文消息（非目标）、e2e 23 处中文文本断言（默认 zh-CN 无前缀不受影响）。实现决策 D1-D5（框架 @nuxtjs/i18n v10 + prefix_and_default / 检测优先级 URL>Cookie>浏览器>默认 / 偏好存 Cookie / PrimeVue locale 联动 / vueI18n 格式本地化）；4 子任务拆分（基建 / 认证框架 / 业务大页 repos+schedules / 其余业务+收尾）。非目标登记 backlog：C36 服务端 API 错误消息 i18n、C37 语言偏好多设备同步。**T708-1 已实施完成（2026-08-11）**：@nuxtjs/i18n 10.6.0 + primelocale 2.4.0 接入（prefix_and_default：zh-CN 无前缀 / en 前缀 /en，code 决定前缀故 en-US 用 code 'en' + language 'en-US'）、localeDetector（官方模式：运行时 config 仅 { defaultLocale, fallbackLocale } 无 locales 清单——P0 审计修复点，resolveLocale 纯函数 7 例单测 + tsconfig.i18n.json 定向类型检查 + i18n-detector-env.d.ts 类型补充闭合盲区）、语言包 common 骨架双语 40 键对齐、导航栏切换器 + settings.vue 偏好激活（setLocale 写 i18n_locale cookie）、PrimeVue locale 联动插件、datetime/number formats；两批提交（A 配置 9 文件 / B UI 接线 6 文件）双轮 Review Gate Pass；质量门单测 186/190 + typecheck + lint + build 全过；运行时冒烟 /login、/en/login、?locale=、Accept-Language、cookie 全 200。**已知边界**：detector 执行面当前未激活（@intlify/h3 惰性绑定，平台无服务端 useTranslation 调用；临时日志探测 5 种请求均未触发），TypeError 隐患已消除但端到端触发验证待服务端翻译场景引入时覆盖。**T708-2 已实施完成（2026-08-11）**：语言包扩展 index/auth/dashboard/settings/users 命名空间（153 键双语对齐）、login/register/settings/users/dashboard/index 六页面文案抽取（模板 + script 错误/成功/确认消息全部 t() 化，动态插值 {message}/{email}/{provider}/{total}/{domains}）；质量门 typecheck + lint（0 error）+ 单测 186/190 + build 全过；运行时冒烟 zh/en 双语渲染正确（登录页/注册页中文与英文断言互斥通过）。**T708-3 已实施完成（2026-08-11）**：语言包新增 repos/schedules 命名空间 + common 抽公共选项（scanMode 三态/severity.all，两页面共用），288 键双语对齐；repos.vue（列表/导入/编辑/批量扫描/扫描轮询消息全 t() 化，batchModeOptions/batchSeverityOptions 改 computed 响应 locale）+ schedules.vue（4 策略表单/触发/启用禁用/校验错误 t() 化，throw 校验消息本地化）；质量门 typecheck + lint（0 error）+ 单测 186/190 + build 全过；运行时 /en 页面零中文字符验证通过、repos/schedules 模板与 script 用户可见中文残留零命中。**T708-4 已实施完成（2026-08-11，T708 全部完成）**：alerts/credentials/batch-runs/runs 四页面文案抽取 + common 抽 yes/no/fixStatus + 410 键双语对齐；**S2 日期格式统一**（d() 替换 toLocaleString 4 处，随 locale 变化）；**detectBrowserLanguage 配置修复**（false → { useCookie: true, redirectOn: 'root' }——false 时 setLocale 不写 cookie 导致 D3 偏好持久化失效；'no' 会重置前缀页 locale；'root' 仅根路径检测其余由 URL 决定，三档实测选定）；**e2e 基建修复**（hydration 等待：global-setup/pageSignIn/全部 e2e 文件 goto 后 waitForHydration——SSR 静态 DOM 无事件绑定，点击静默失效；apiSignUp/apiSignIn 补同源 Origin 头——playwright APIRequestContext 发 `Origin: null` 触发 better-auth 403 MISSING_OR_NULL_ORIGIN；test timeout 30s→120s 适配批量扫描 sync 耗时）；i18n.e2e.test.ts 3 用例（登录页双语/切换器 cookie 持久化/PrimeVue 关闭按钮联动）**全量 e2e 28 用例通过**；全平台 Vue 文件用户可见中文零命中（含全角标点口径）；README 功能列表补平台 i18n 说明。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
  - 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
