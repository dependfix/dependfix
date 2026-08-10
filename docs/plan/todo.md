# 当前阶段任务（M7.2：平台能力深化）

> M0-M7.1 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M7 规划定稿（2026-08-09）**：拆 M7.1 认证与用户体系（已归档 2026-08-10）/ M7.2 平台能力深化；执行顺序（决策 D3）：T702 → T704 → T708 → T705 → T703 → T706。
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
  - [ ] 有 Redis（>= 5.0）：异步队列闭环（手动触发入队 → worker 执行 → pending→running→completed 流转 → 前端轮询完成）——**待人工验收**（需 Redis 7 或 CI redis service）
  - [x] 无 Redis：同步降级闭环（POST /scan 行为与之前一致）——真实冒烟 completed + e2e 23 用例（QUEUE_ENABLED=false 强制同步）
  - [ ] 单容器：`IN_PROCESS_WORKER=true` 时同进程消费队列——**接线完成待验收**（同上 Redis 环境）
  - [ ] 优先级：手动 > webhook > 定时（job priority 断言）——**代码 + 单测覆盖**（SCAN_JOB_PRIORITY 顺序断言），队列运行时行为待 Redis 环境
  - [ ] 去重：同仓库未完成扫描重复触发合并（jobId）——**代码语义完整**（add 返回 reused + 孤儿 run 置 failed），运行时待 Redis 环境
  - [ ] 重试：失败任务指数退避，最大次数可配——**代码 + 单测覆盖**（parseRetryConfig + backoff 配置），运行时待 Redis 环境
  - [x] 单测 + e2e 全过（106/106 + 23 e2e；队列模式与降级模式双路径——降级路径已实测，队列路径代码/单测覆盖）
- 任务粒度：3 个子任务独立提交（单批 ≤ 10 文件 / ≤ 800 行新增，对齐经验归档 §二十四）。

---

## 当前状态

- **M7.1 已归档（2026-08-10）**：T701（RBAC + 用户管理 + 个人界面）与 T707（认证扩展：AUTH_MODE 互斥 + OAuth + OIDC SSO）代码交付完成，全部 Review Gate 通过（T707-1 双轮、T707-2/3 各一轮）。质量门：单测 92/92 + e2e 22 用例 + ui-validator 视觉 8/8 + lint/typecheck/build。**剩余 3 项真实凭据人工验收**（OAuth 闭环 / OIDC 闭环 / 配置显示路径），登记 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)。
- **T702 已实施完成（2026-08-10）**：三个子任务全部落地并独立提交——T702-1 队列基础设施（93057088：queue-mode 决策 + jobId 去重 + 优先级 + 重试，双轮 APPROVE）、T702-2 扫描 API 异步化（d909b89c：scan.post 三态 + 轮询 + failover + 终态竞态防护，双轮 APPROVE）、T702-3 部署接线（57a84a1c：compose redis + env + 单容器 worker 形态，APPROVE）。质量门：单测 106/106 + e2e 23 用例 + lint/typecheck/build 全过；**降级路径真实冒烟验证**（本地 Redis 3.0 → version_too_old → 自动降级 sync）。**剩余人工验收项**：async 队列闭环（需 Redis >= 5.0 环境——本地 3.x 与 CI 无 Redis 均触发降级），含去重/优先级/重试运行时行为验证。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
  - 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
