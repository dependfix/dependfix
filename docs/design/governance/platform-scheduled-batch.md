# 定时扫描与批量处理设计

> 状态：🔶 设计先行（T704，2026-08-10）——契约与数据模型落盘，供实现阶段参考。
> 依赖：T702 任务队列与并发控制（已交付，BullMQ + Redis + 渐进式降级）。
> 相关文档：[架构设计 §扫描调度策略](./architecture.md)、[安全设计 §批量处理](./security.md)、[执行器设计与沙箱评估](./executor-sandbox.md)、[T702 实现记录](../../plan/todo.md)

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
| ❌ sync | 进程内 `node-cron` + DB | DB（Schedule 实体） | ⚠️ 单实例（多实例会重复触发） | 降级单实例可用；多实例部署需配 `QUEUE_ENABLED=true`（强制 Redis） |

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

**ScanQueue 封装扩展**：T702 的 `ScanQueue` 接口当前仅暴露 `add/close`，T704-2 实现时需扩展 `upsertJobScheduler` / `removeJobScheduler` 透传（BullMQ Queue 原生方法），保持封装一致性。

**Worker 处理**：Worker processor 收到 `scheduled-scan` job 时：
1. 读取 Schedule 实体 → 解析 selectorKind + selectorJson → 查询目标仓库列表
2. 创建 BatchRun（source='scheduled'）
3. 逐仓库 `createPendingScanRun` + `queue.add`（priority=scheduled，runId 关联 batchRunId）
4. 返回（BatchRun 聚合由异步回调或轮询更新，见 §5）

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
- 多实例部署时 sync 模式会重复触发（每个实例都跑 cron）——文档明确提示：多实例部署必须配置 `QUEUE_ENABLED=true` + Redis 可用
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

BatchRun 的 `finishedCount / completedCount / failedCount / summaryJson` 需要随下属 ScanRun 完成而更新。两种方案：

| 方案 | 机制 | 优缺点 |
|:---|:---|:---|
| **A. 轮询更新**（采用） | 前端轮询 `GET /api/batch-runs/[id]` 时，后端实时查询下属 ScanRun 统计并更新 BatchRun | 实现简单，无需额外回调机制；缺点是聚合更新滞后于轮询频率 |
| B. Worker 回调 | ScanRun 完成时 Worker 回调更新 BatchRun | 实时性好；缺点是 Worker 需感知 BatchRun 上下文，增加耦合 |

**采用方案 A**：`GET /api/batch-runs/[id]` 时聚合统计——查询 `ScanRun where batchRunId = ?`，计算 finishedCount/completedCount/failedCount/pendingCount + summaryJson（跨仓库 alertsTotal/severityCounts/fixedCount），写回 BatchRun 并返回。聚合计算是只读推导，无需 Worker 回调。

**终态判定**：`pendingCount === 0` 时 BatchRun.status → `completed`（有 failed 也算 completed，整体完成而非全部成功）；写回 `finishedAt`。

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

## 7. 前端页面

### 7.1 新增页面

| 页面 | 路径 | 功能 |
|:---|:---|:---|
| 定时计划 | `/schedules` | 列表 + 新建/编辑/删除/手动触发 |
| 批量运行 | `/batch-runs` | 列表 + 详情（聚合统计 + 下属 ScanRun） |

### 7.2 仓库页面扩展

- `repos.vue` 表格加复选框列 + 「批量扫描」按钮（勾选后激活）
- 仓库编辑表单加 tags 输入（PrimeVue Chips 组件，输入标签回车添加）

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

| Redis | 定时调度 | 批量执行 | 聚合报告 |
|:---|:---|:---|:---|
| ✅ async | BullMQ upsertJobScheduler | 逐仓库入队（priority=scheduled） | 轮询聚合 |
| ❌ sync | node-cron 进程内 | 逐仓库同步串行 runScanForRepository | 轮询聚合 |

### 9.2 多实例约束

- sync 模式（无 Redis）：多实例部署会重复触发定时任务——**文档明确提示**多实例部署必须 `QUEUE_ENABLED=true` + Redis 可用
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
