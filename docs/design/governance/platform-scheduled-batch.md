# 定时扫描与批量处理设计

> 状态：✅ 已落地（T704 实现 + M21.5 async 定时触发 / Schedule CRUD e2e 补强）；真实环境验收跟踪见 [backlog T704](../../plan/backlog.md#t704-async-定时触发)。
> 依赖：T702 任务队列与并发控制（已交付，BullMQ + Redis + 渐进式降级）。
> 相关文档：[架构设计 §扫描调度策略](./architecture-platform.md)、[安全设计 §批量处理](./security.md)、[执行器设计与沙箱评估](./executor-sandbox.md)、[T702 待人工验收（真实环境）记录](../../plan/backlog.md#t702-http-层状态流转)

---

## 1. 定位

T704 在 T702 队列基础设施之上交付三项能力：

1. **定时调度**：管理员配置 cron 表达式定时扫描计划，到点自动触发批量扫描任务入队。
2. **批量选择**：按组织 / 标签 / 全部仓库 / 手动指定列表四种策略选择多个仓库，一次触发批量扫描。
3. **聚合报告**：一次定时或批量触发产生的多个 ScanRun 汇总为 BatchRun，跨仓库统计告警数 / 修复数 / 成功失败比。

**非自动修复执行**：T704 只负责"调度 + 入队 + 聚合"，实际扫描执行复用 T702 的 `runScanForRepository` + Worker（A 模式 ContainerExecutor / B 模式 ActionTriggerExecutor），不引入新执行器。

---

## 2. 用户终态（Working Backwards）

### 2.1 定时扫描

```
管理员 → 平台「定时计划」页面
  → 新建计划：填写名称、cron 表达式（如 0 2 * * 1 = 每周一凌晨 2 点）
  → 选择仓库策略：全部仓库 / 按组织 / 按标签 / 手动指定列表
  → 配置扫描参数：mode（report-only 默认）、severityThreshold（high 默认）
  → 启用/禁用开关
  → 保存

到点 → 调度器自动触发
  → 按策略解析目标仓库列表
  → 逐仓库入队（priority = scheduled=10，复用 T702 Queue + jobId 去重）
  → 创建 BatchRun 记录（聚合本次触发的所有 ScanRun）
  → 前端「批量运行」页面可查看进度与聚合结果
```

### 2.2 批量触发（手动）

```
管理员 → 平台「仓库」页面
  → 勾选多个仓库（复选框）
  → 点击「批量扫描」按钮
  → 弹窗确认扫描参数（mode / severityThreshold）
  → 提交 → 逐仓库入队 + 创建 BatchRun
  → 跳转「批量运行」页面查看进度
```

### 2.3 聚合报告

```
管理员 → 平台「批量运行」页面
  → 列表：BatchRun 记录（时间、触发来源 scheduled/manual、仓库数、完成数、失败数）
  → 点击详情 → 展开下属各 ScanRun（仓库、状态、summary）
  → 跨仓库聚合统计：总告警数 / 按严重级别 / 总修复数 / 成功率
```

---

## 3. 数据模型

### 3.1 Schedule 实体（定时计划）

```typescript
// apps/platform/server/entities/schedule.ts

@Entity('schedule')
export class Schedule extends BaseEntity {
    /** 计划名称（用户可读） */
    @Column({ type: 'varchar', length: 100 })
    name!: string

    /** cron 表达式（5 段或 6 段，cron-parser 解析） */
    @Column({ type: 'varchar', length: 100 })
    cron!: string

    /** 时区（IANA 名称，如 Asia/Shanghai；空则用服务器本地时区） */
    @Column({ type: 'varchar', length: 50, nullable: true })
    timezone!: string | null

    /** 仓库选择策略 */
    @Index()
    @Column({ type: 'varchar', length: 32 })
    selectorKind!: ScheduleSelectorKind  // 'all' | 'organization' | 'tag' | 'explicit'

    /** 选择策略参数（JSON：selectorKind 语义化）
     * - all: {}
     * - organization: { organizationId: string }
     * - tag: { tag: string }
     * - explicit: { repositoryIds: string[] }
     */
    @Column({ type: 'text', nullable: true })
    selectorJson!: string | null

    /** 扫描模式（report-only / fix / fix-and-pr） */
    @Column({ type: 'varchar', length: 32, default: 'report-only' })
    mode!: string

    /** 严重级别阈值 */
    @Column({ type: 'varchar', length: 32, default: 'high' })
    severityThreshold!: string

    /** 启用/禁用 */
    @Index()
    @Column({ type: 'boolean', default: true })
    enabled!: boolean

    /** 最近触发时间 */
    @Column({ type: 'datetime', nullable: true })
    lastTriggeredAt!: Date | null

    /** 最近触发创建的 BatchRun id */
    @Column({ type: 'varchar', length: 36, nullable: true })
    lastBatchRunId!: string | null
}

export type ScheduleSelectorKind = 'all' | 'organization' | 'tag' | 'explicit'
```

### 3.2 BatchRun 实体（批量运行聚合）

```typescript
// apps/platform/server/entities/batch-run.ts

@Entity('batch_run')
export class BatchRun extends BaseEntity {
    /** 触发来源 */
    @Index()
    @Column({ type: 'varchar', length: 32 })
    source!: BatchRunSource  // 'scheduled' | 'manual'

    /** 关联的 Schedule id（source=scheduled 时；manual 时为 null） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    scheduleId!: string | null

    /** 扫描模式 */
    @Column({ type: 'varchar', length: 32 })
    mode!: string

    /** 严重级别阈值 */
    @Column({ type: 'varchar', length: 32 })
    severityThreshold!: string

    /** 目标仓库总数 */
    @Column({ type: 'int', default: 0 })
    repositoryCount!: number

    /** 已完成数（completed + failed + dispatched 终态） */
    @Column({ type: 'int', default: 0 })
    finishedCount!: number

    /** 成功数（completed） */
    @Column({ type: 'int', default: 0 })
    completedCount!: number

    /** 失败数（failed） */
    @Column({ type: 'int', default: 0 })
    failedCount!: number

    /** 仍进行中数（pending + running） */
    @Column({ type: 'int', default: 0 })
    pendingCount!: number

    /** 跨仓库聚合统计（JSON：{ alertsTotal, severityCounts, fixedCount }） */
    @Column({ type: 'text', nullable: true })
    summaryJson!: string | null

    /** 批量运行整体状态 */
    @Index()
    @Column({ type: 'varchar', length: 32, default: 'running' })
    status!: BatchRunStatus  // 'running' | 'completed' | 'failed'

    @Column({ type: 'datetime', nullable: true })
    finishedAt!: Date | null
}

export type BatchRunSource = 'scheduled' | 'manual'
export type BatchRunStatus = 'running' | 'completed' | 'failed'
```

### 3.3 Repository 扩展：tags 字段

```typescript
// apps/platform/server/entities/repository.ts 扩展

/** 仓库标签（JSON 数组字符串，如 '["frontend","critical"]'；用于批量选择策略） */
@Column({ type: 'text', nullable: true })
tags!: string | null  // JSON.stringify(string[])，空数组存 null
```

**设计决策**：tags 用 JSON 字符串列而非独立关联表——
- 标签仅用于批量选择过滤（`selectorKind='tag'` 时按 `LIKE '%"tag"%'` 或应用层解析匹配），不需要反向查询"某标签下有哪些仓库"的高频场景
- 避免 `repository_tag` 关联表 + `tag` 实体表的额外复杂度（M7.2 单组织场景标签量小）
- 演进路径：若后续需要标签管理 UI（增删改查、按标签分组视图），再升级为独立关联表

### 3.4 ScanRun 扩展：batchRunId 关联

```typescript
// apps/platform/server/entities/scan-run.ts 扩展

/** 所属批量运行 id（定时/批量触发时关联；单独手动触发为 null） */
@Index()
@Column({ type: 'varchar', length: 36, nullable: true })
batchRunId!: string | null
```

**关联语义**：BatchRun 1 — N ScanRun（一对多），ScanRun 通过 `batchRunId` 反向关联。不使用 TypeORM `ManyToOne` 关系加载（避免 N+1），BatchRun 聚合时按 `batchRunId` 查询 ScanRun 列表。

---

## 4. 调度策略

### 4.1 双模调度矩阵

| Redis | 调度机制 | 持久化 | 多实例安全 | 降级说明 |
|:---|:---|:---|:---|:---|
| ✅ async | BullMQ `upsertJobScheduler` | Redis 持久化 | ✅ 多实例只一个触发 | BullMQ 原生 repeat job，到点自动 add 新 job |
| ❌ sync | 进程内 `node-cron` + DB | DB（Schedule 实体） | ⚠️ 单实例（多实例会重复触发） | 降级单实例可用；多实例部署需配 `QUEUE_ENABLED=true`（强制 Redis）+ 存在消费者 |

### 4.2 async 模式：BullMQ Job Scheduler

```typescript
// 定时计划保存时 upsert BullMQ job scheduler
// schedulerId = `schedule-${schedule.id}`（与 scan jobId 同前缀规范，禁冒号）
await queue.upsertJobScheduler(
    `schedule-${schedule.id}`,
    { pattern: schedule.cron, tz: schedule.timezone ?? undefined },
    {
        name: 'scheduled-scan',  // 区分手动触发的 'scan' job name
        data: { scheduleId: schedule.id },
        opts: { priority: SCAN_JOB_PRIORITY.scheduled },
    },
)

// 定时计划禁用/删除时 removeJobScheduler
await queue.removeJobScheduler(`schedule-${schedule.id}`)
```

**ScanQueue 封装扩展**：T702 的 `ScanQueue` 已扩展 `upsertJobScheduler` / `removeJobScheduler` 透传（BullMQ Queue 原生方法），由 `scheduler.service.ts` 实际调用，保持封装一致性。

**Worker 处理**：Worker processor 收到 `scheduled-scan` job 时：
1. 读取 Schedule 实体 → 解析 selectorKind + selectorJson → 查询目标仓库列表
2. 创建 BatchRun（source='scheduled'）
3. 逐仓库 `createPendingScanRun` + `queue.add`（priority=scheduled，runId 关联 batchRunId）
4. 返回（BatchRun 聚合由详情实时聚合 + 周期兜底对账，见 §5）

**jobId 规范**：`scheduled-scan` job 不设自定义 jobId（BullMQ job scheduler 自动生成），避免与单仓库 scan jobId 冲突。每个 scheduler 产生的 job 是独立的，无需去重（到点触发一次即一次）。

### 4.3 sync 降级模式：node-cron 进程内调度

```typescript
// apps/platform/server/services/scheduler/scheduler.service.ts
import cron from 'node-cron'

// ScheduleService 单例：启动时加载所有 enabled Schedule，注册 cron 任务
// Schedule 增删改时同步更新注册表
const scheduledTasks = new Map<string, cron.ScheduledTask>()  // scheduleId → task

// 注册：node-cron.validate(cron) 校验表达式 → cron.schedule(cron, handler, { scheduled, timezone })
// handler：解析仓库列表 → 同步执行 runScanForRepository（逐仓库串行，复用 withRepoLock）
// 销毁：scheduledTasks.get(id)?.stop() → delete
```

**降级约束**：
- sync 模式下扫描仍为同步执行（复用 T702 同步降级路径），定时触发会在进程内逐仓库串行扫描
- 多实例部署时 sync 模式会重复触发（每个实例都跑 cron）——文档明确提示：多实例部署必须配置 `QUEUE_ENABLED=true` + Redis 可用，且需存在消费者（当前阶段为进程内 worker）
- BullMQ `upsertJobScheduler` 与 node-cron 共存策略：`getQueueService().mode === 'async'` 时用 BullMQ，否则用 node-cron；两者不混用

---

## 5. 批量执行与聚合

### 5.1 批量触发流程

```
触发源（scheduled-scan job / 手动批量 API）
  → 解析目标仓库列表（selectorKind → repositoryIds[]）
  → 创建 BatchRun（source, repositoryCount, status='running'）
  → 逐仓库：
     async 模式：createPendingScanRun(batchRunId) + queue.add(priority=scheduled)
     sync 模式：runScanForRepository(batchRunId) 逐个串行
  → 返回 BatchRun id
```

### 5.2 聚合更新策略

BatchRun 的 `finishedCount / completedCount / failedCount / summaryJson / status / finishedAt` 需要随下属 ScanRun 完成而更新。**采用「详情实时聚合 + 周期兜底对账」双通道**：

| 通道 | 机制 | 定位 |
|:---|:---|:---|
| **详情实时聚合** | 用户打开 `GET /api/batch-runs/[id]` 时，后端实时查询下属 ScanRun 统计并写回 BatchRun | 用户查看时即时收敛；不引入 Worker 回调 |
| **周期兜底对账** | `stale-cleanup` 插件每 5 分钟调用 `reconcileRunningBatchRuns()`，扫描全部 `running` BatchRun 聚合写回 | 覆盖「子项已全部终态但父批次从未被查看」与「零子项孤儿」两类盲区，摆脱「看才发生」 |

**实现口径**（`batch-aggregate.ts` 纯推导 + `batch-writeback.ts` 单一写回，详情接口 / 周期对账 / sync 立即终结三处共用）：

- `aggregateScanRuns(runs, results)`：`pendingCount === 0` 时整体状态 → `completed`（含部分失败，整体完成而非全部成功）；计数与 `summary` 按下属 run 派生。
- `finishedAt`：首次到达 `completed` 时取 `resolveBatchFinishedAt(runs)` = **`max(子项 finishedAt)`**（真实完成时间），而非聚合触发时刻——避免把「首次查看时间」误记为完成时间。无带 `finishedAt` 的子项时回退当前时刻。
- 状态流转复用 `shouldWriteBackStatus`：仅 `running` 允许流转，`failed` 终态受保护（executor 显式落库的 async 全部入队失败）。
- **零子项兜底**：`running` 且无任何下属 ScanRun，创建超过 30 分钟 → 判定为孤儿 `failed`（触发进程在建子项前异常 / 子仓库级联删除）；未超阈值（async 正在逐个建子项）保持不动。
- **sync 模式**：逐仓库串行结束后立即聚合终态化，不等周期对账；零子项时不在此终结（异常场景交由周期对账按孤儿处理，避免误标 completed）。
- **失败路径条件写回**：`persistBatchFailedIfRunning`（仅 `running` 命中）用于两处持有**创建期 / 读取期内存实体**的失败写回——「async 全部入队失败」与 `stale-cleanup` 孤儿批次；只写 `status` / `finishedAt` / `updatedAt`（可选空 `summaryJson` 兜底），**不写计数与 summary 快照**，避免整行 `save()` 把并发详情 GET 已聚合的计数覆盖回初值；并发 admin `force-fail` 抢先时条件不匹配 → 不改库、也不改内存实体。
- **详情 GET 响应一致性**：条件写回未落库（无字段变化，或并发终态保护跳过）时一律重读库中状态再组装响应，消除「无字段变化 + 并发 `force-fail`」下响应停留在旧状态的瞬时窗口。

**兼容性说明**：历史 `finished_at` 可能被旧的「查看时刻」口径污染；存量订正由 `database/scripts/` 一次性脚本按 `max(子项 finishedAt)` 重算（详见 [M35.5](../../plan/archive/todo-archive-phases-m35.md#m35-批量运行终态兜底对账-进度可见性修复-m35-1-m35-6-全部已闭环-2026-10-02-归档)）。

### 5.3 仓库选择策略解析

```typescript
// apps/platform/server/services/scheduler/selector.ts

interface SelectorInput {
    kind: ScheduleSelectorKind
    data: ScheduleSelectorData  // selectorJson 解析
    organizationId?: string  // 当前组织上下文（权限隔离）
}

interface ScheduleSelectorData {
    organizationId?: string
    tag?: string
    repositoryIds?: string[]
}

// 解析 → repositoryIds[]（应用层过滤 + 权限校验）
export const resolveRepositoryIds = async (input: SelectorInput): Promise<string[]>
```

**策略语义**：
- `all`：当前组织下全部仓库（`where organizationId = ?`）
- `organization`：指定组织下全部仓库（当前单组织模型等同 all；多组织时按 organizationId 过滤）
- `tag`：`tags` 列 JSON 包含指定标签（应用层解析：读出全部仓库 → JSON.parse(tags) → includes(tag)）
- `explicit`：手动指定 repositoryIds 列表（校验归属当前组织）

**权限隔离**：所有策略解析均经 `requireOrgResource` 校验，跨组织仓库不可选。

---

## 6. API 契约

### 6.1 定时计划 CRUD

| 方法 | 路径 | 权限 | 说明 |
|:---|:---|:---|:---|
| GET | `/api/schedules` | admin/org_admin | 列表（当前组织） |
| POST | `/api/schedules` | admin/org_admin | 新建（upsert BullMQ scheduler / 注册 node-cron） |
| GET | `/api/schedules/[id]` | admin/org_admin | 详情 |
| PATCH | `/api/schedules/[id]` | admin/org_admin | 更新（cron/enabled 变更时同步更新调度） |
| DELETE | `/api/schedules/[id]` | admin/org_admin | 删除（removeJobScheduler / stop node-cron） |
| POST | `/api/schedules/[id]/trigger` | admin/org_admin | 手动触发一次（测试用，不等待 cron 到点） |

### 6.2 批量运行

| 方法 | 路径 | 权限 | 说明 |
|:---|:---|:---|:---|
| GET | `/api/batch-runs` | admin/org_admin/viewer | 列表（分页，按时间倒序） |
| GET | `/api/batch-runs/[id]` | admin/org_admin/viewer | 详情（含聚合统计 + 下属 ScanRun 列表） |
| POST | `/api/repos/batch-scan` | admin/org_admin | 手动批量扫描（body: `{ repositoryIds: string[], mode, severityThreshold }`） |

### 6.3 仓库标签

| 方法 | 路径 | 权限 | 说明 |
|:---|:---|:---|:---|
| PATCH | `/api/repos/[id]` | admin/org_admin | 扩展 body 含 `tags: string[]`（复用现有更新端点） |

### 6.4 Zod 校验

```typescript
// apps/platform/server/schemas/schedule.ts
export const scheduleSchema = z.object({
    name: z.string().min(1).max(100),
    cron: z.string().refine((v) => cronParserIsValid(v), '无效的 cron 表达式'),
    timezone: z.string().optional(),  // IANA 名称，空则服务器本地
    selectorKind: z.enum(['all', 'organization', 'tag', 'explicit']),
    selectorJson: z.string().optional(),  // JSON 字符串，按 selectorKind 校验
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
    enabled: z.boolean().default(true),
})

// apps/platform/server/schemas/batch-scan.ts
export const batchScanSchema = z.object({
    repositoryIds: z.array(z.string().min(1)).min(1).max(100),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
})
```

**cron 校验**：使用 `cron-parser`（BullMQ 已依赖）的 `parseExpression` 校验表达式有效性，5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周）均支持。

---

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [platform-scheduled-batch-rollout.md](./platform-scheduled-batch-rollout.md) | §7 - §11 | 前端页面 / 子任务拆分 / 降级与边界 / 依赖变更 / 验收标准 |
