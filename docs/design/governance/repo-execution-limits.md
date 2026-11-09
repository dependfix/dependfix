# 仓库级执行预算与超时配置设计

> **状态**：✅ 已落地（2026-11-08，M55.4 闭环归档；实现记录见 [归档 M55.4](../../plan/archive/todo-archive-phases-m55.md)）——设计定稿 2026-10-30（用户裁定 D1-D3）；批 0 已按预算前置把 `platform.md` §10.6 外移到 [executor-process-isolation.md §9](./executor-process-isolation.md)。
> **范围**：`apps/platform`（实体 / 迁移 / schema / API / 编排 / 队列 / 清理 / 前端表单）+ `packages/engine`（验证 / 安装 / clone 超时透传）；不改修复策略与验证链条数
> **目标**：把「只能整平台调」的四个超时改为「仓库可覆盖 + 平台封顶」，并让生效值可见、越界可判、变更可审计
> **上游**：[运行失败分类与筛选设计](./run-failure-taxonomy.md)（失败归因）、[平台执行模型隔离设计](./executor-process-isolation.md)（锁与取消面）、[队列僵尸任务终结与去重键释放设计](./queue-stale-recovery.md)（孤儿阈值）
> **下游**：`apps/platform/server/services/executor/container-executor.ts`、`services/queue/scan-worker.ts`、`services/batch/stale-cleanup.ts`、`packages/engine/src/runners/verification-runner.ts`

## 1. 背景与问题

### 1.1 触发证据（2026-10-29 批量运行，10 条运行 2 条 `execution_timeout`）

| 运行 | 形态 | 关键耗时 |
|:--|:--|:--|
| `CaoMeiYouRen/momei` | 基线全红（lint OOM / build / typecheck / test 超时）→ 合批验证 OOM → 逐包重试 | 基线 20m14s（67%）+ 合批 5m10s + 逐包 4m31s → 30m00s 被 abort |
| `CaoMeiYouRen/rss-impact-server` | 0 写入（跨 major 跳过 + lockfile 已合规）仍跑全量验证 | 基线 18m36s + 后验证 16m53s → 35m38s（含定时器延迟） |

两次运行的共同点：**单仓 30 分钟对「红仓库 / 慢测试仓」偏紧，且没有任何按仓库调参的出口**。rss-impact-server 的 `pnpm test` 恰好卡在 10 分钟单命令上限边界，同一仓库一次 `exit 1` 通过、一次 `timed out` 失败——结果取决于抖动而非代码。

### 1.2 现状：四个超时，全部只能整平台调

| 超时 | 默认 | 单一事实源 | 影响面 |
|:--|:--|:--|:--|
| `EXECUTION_TIMEOUT_MS` | 30 min | `container-executor.ts:76` | 执行器 `withTimeout` **同时**决定 Worker `lockDuration/lockRenewTime`（`scan-worker.ts:71-72`）与 stale-cleanup 阈值（`plugins/stale-cleanup.ts:73`） |
| `DEPENDFIX_VERIFY_TIMEOUT_MS` | 10 min | `verification-runner.ts:155` | 默认链 / CI 镜像脚本 / 自定义命令同源 |
| `DEPENDFIX_INSTALL_TIMEOUT_MS` | 5 min | `fixers/install-timeouts.ts:43` | 安装 / lockfile 诊断 / frozen 校验 |
| `CLONE_TIMEOUT_MS` | 5 min | `container-executor.ts:252` | clone（日志已回显 `[clone] timeout=`） |

### 1.3 缺口

| 缺口 | 说明 |
|:--|:--|
| G1 无仓库级出口 | 一个慢测试仓把整平台默认值拖到 20 分钟，其他仓库跟着付代价 |
| G2 无生效值回执 | 运行详情只有 `[clone] timeout=` 一行，无法区分「超时」与「预算本来就是 5 分钟」 |
| G3 上限与锁强耦合 | 仓库级上限一旦可超过 30 分钟，Worker 锁与孤儿阈值必须同步，否则误杀 |
| G4 前端零入口 | `repo-form-dialog.vue` 无任何超时字段 |

## 2. 目标与非目标

**目标**

1. 四个超时支持仓库级覆盖，`null` = 继承全局，前端可设置并看到生效值。
2. 平台封顶默认 60 分钟、可经 env 调整；上限与 Worker 锁、stale-cleanup 保持单一事实源。
3. 变更走 `admin/org_admin` + `AuditEvent`，与 `verifyCommands` 同口径。
4. 同步修复 `repositoryUpdateSchema.partial()` 注入默认值导致 PUT 静默重置（否则新列会被部分更新清空）。

**非目标**

- 不放开 24 小时量级的仓库级上限（封顶 `[30min, 240min]`，见 §6.2）。
- 不改验证链条数 / 顺序 / 短路语义，不改归因规则（基线豁免与预算夹取逻辑见 [归档 M55.2](../../plan/archive/todo-archive-phases-m55.md#m55-2-p1-🚀-运行预算夹取与双跑成本收敛-已闭环-97d92c0b-a753e2fd)，与本设计同阶段执行）。
- 不做「全局超时在 UI 里写 env」（`lockDuration` 在 worker 启动期固定，UI 写 env 必然出现「界面显示 60、实际 30」）。
- 不改 CLI `--commands` / `--timeout` 语义（CLI 侧继续走 env 与参数）。

## 3. 决策（2026-10-30 用户裁定）

| 编号 | 决策 | 影响 |
|:--|:--|:--|
| **D1** | 仓库级执行上限**封顶默认 60 分钟，且封顶值可配置** | 新增 `DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS`（默认 3600000）；Worker 锁与孤儿阈值同步改按封顶值 |
| **D2** | 编辑权限**沿用 `admin/org_admin`** | 与 `verifyCommands` 同一守卫（`api/repos/index.ts:54` / `[id].ts:47`），审计类型 `execution_limits_update` |
| **D3** | 与「PUT partial 默认注入」修复**同批** | 先拆 create / update schema 基线，再落新列，避免新列被静默重置 |

## 4. 数据模型

### 4.1 `Repository` 新增列（全部 nullable，`null` = 继承）

| 列 | 类型 | 单位 | 语义 |
|:--|:--|:--|:--|
| `executionTimeoutMs` | integer nullable | 毫秒（库内） | 单仓执行上限，覆盖 `EXECUTION_TIMEOUT_MS` |
| `verifyCommandTimeoutMs` | integer nullable | 毫秒 | 单条验证命令超时，覆盖 `DEPENDFIX_VERIFY_TIMEOUT_MS` |
| `installTimeoutMs` | integer nullable | 毫秒 | 安装类命令超时，覆盖 `DEPENDFIX_INSTALL_TIMEOUT_MS` |
| `cloneTimeoutMs` | integer nullable | 毫秒 | clone 超时，覆盖 `CLONE_TIMEOUT_MS` |

**单位口径**：库内与引擎全链一律毫秒（与既有常量同源）；**前端输入与展示一律分钟**（`min=1`），API 层接收毫秒整数，由前端做 `分钟 × 60000` 换算。理由：引擎侧已有 `MIN_*` / `MAX_*` 毫秒常量，库内再存分钟会产生二次换算点。

### 4.2 `ScanRun` 新增快照列

| 列 | 类型 | 语义 |
|:--|:--|:--|
| `executionTimeoutMs` | integer nullable | 本次运行**实际生效**的执行上限（快照），存量行为 `null` |

**写入时点（硬约束）**：在编排层**启动执行之前**写入（与 `status = running` / `startedAt` 同一次 save），不得等到 `execute()` 结束回填——否则进程在执行中死亡时快照缺失，stale-cleanup 会退回全局默认（30 分钟）并在 35 分钟误杀按 60 分钟配置的运行。

理由：① stale-cleanup 的候选查询不加载 `repository` 关联（`stale-cleanup.ts:138` 的 `find`），加 join 会扩大清理热路径；② 仓库配置后续变更不应追溯改写历史运行的超时解释；③ 运行详情可直接回显，无需二次解析。

### 4.3 迁移

新增 `3000000000000-AddRepositoryExecutionLimits.ts`，并在 `server/database/index.ts` 的 `migrations` 数组登记（`schema-guard.test.ts` 会校验实体 / 迁移一致性）。

## 5. 取值、边界与有效值解析

### 5.1 优先级（单一事实源 `server/utils/execution-limits.ts`）

```
仓库值（非 null） > env > 内置默认
```

解析函数为**纯函数 + 显式 env 注入**，便于单测无环境依赖：

| 函数 | 职责 |
|:--|:--|
| `resolveExecutionCeilingMs(env)` | 封顶值：`DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS`，默认 3600000，范围 `[1800000, 14400000]`，越界回退默认 |
| `resolveExecutionLimits(repo, env)` | 返回 `{ executionTimeoutMs, verifyCommandTimeoutMs, installTimeoutMs, cloneTimeoutMs, ceilingMs }`，逐项 clamp 并汇总 `warnings[]` |
| `clampToBounds(value, min, max)` | 运行期越界处理（ceiling 下调后存量配置） |

### 5.2 边界表

| 项 | 下限 | 上限 | 越界处置 |
|:--|:--|:--|:--|
| 执行上限 | 1 min（`MIN_EXECUTION_TIMEOUT_MS`） | 封顶值（默认 60 min） | 写入 400；运行期 clamp + warn |
| 验证命令超时 | 10 s（`MIN_COMMAND_TIMEOUT_MS`） | 30 min（`MAX_COMMAND_TIMEOUT_MS`）且 ≤ 有效执行上限 | 写入 400；运行期 clamp |
| 安装超时 | 10 s（`MIN_INSTALL_TIMEOUT_MS`） | 30 min（`MAX_INSTALL_TIMEOUT_MS`）且 ≤ 有效执行上限 | 同上 |
| clone 超时 | 1 min | 30 min 且 ≤ 有效执行上限 | 同上 |

**不变量**：`verifyCommandTimeoutMs / installTimeoutMs / cloneTimeoutMs ≤ executionTimeoutMs`（写入时交叉校验，错误挂在 `executionTimeoutMs` 字段上提示「小于子项超时」）。

**全局默认与封顶的关系**：若 `EXECUTION_TIMEOUT_MS > 封顶值`（运维把默认调到 2h 而封顶仍是 60min），启动期以封顶值截断全局默认并 `warn` 一次；不 fail-closed（避免配置漂移导致平台不可用）。

## 6. 三处同源联动（关键，禁止只改一处）

| 消费点 | 现值来源 | 改后 | 备注 |
|:--|:--|:--|:--|
| `ContainerExecutor.timeoutMs` | `resolveExecutionTimeoutMs()` | 构造参数 `timeoutMs` 由编排层传入有效值 | 已有构造参数，仅改调用方 |
| `scan-worker` 锁参数 | `resolveExecutionTimeoutMs()` | `lockDuration = 封顶值`、`lockRenewTime = 封顶值 / 2` | **单测与 [platform.md §10.5](../../standards/platform.md) 的「同源 = 执行默认值」口径同步改为封顶值** |
| `stale-cleanup` 阈值 | `resolveExecutionTimeoutMs()` | 候选查询用全局默认做下界，逐 run 按 `run.executionTimeoutMs ?? 全局` 精判 | 保留 `runningGraceMs` 5 分钟宽限 |

**锁时长变长的代价**（D1 的直接后果）：stalled 检测窗口从 30 分钟抬到封顶值（默认 60 分钟），真崩溃的 job 恢复变慢；缓解手段是 `lockRenewTime = 封顶值 / 2`（存活 worker 仍定期续期），并在 `stalled` / `lockRenewalFailed` 事件日志里保留 `runId`（既有能力）。封顶值 env 调大（如 240 分钟）需同时接受该恢复延迟——`guide/configuration.md` 必须写明。

## 7. 引擎透传

### 7.1 验证命令超时

`VerificationParams.commandTimeoutMs` **已存在**（`verification-runner.ts:57`），只缺上层透传：

```
Repository.verifyCommandTimeoutMs
  → scan-orchestrator（ctx）
  → new DependfixApp({ verifyCommandTimeoutMs })
  → AppContext.verifyCommandTimeoutMs
  → runVerification({ commandTimeoutMs })   // 3 个调用点：基线 / 后验证 / quick-verify
```

- CI 镜像脚本共用同一超时（既有契约，见 `DEFAULT_COMMAND_TIMEOUT_MS` 注释），不引入第二个计时器。
- `resolveCommandTimeoutMs(env, fallback)` 保留为兜底：显式值优先，未提供时回退 env → 默认。

### 7.2 安装超时

`resolveInstallTimeoutMs(env, fallback)` 增加显式覆盖参数（`overrideMs?: number`），调用方传 `ctx.installTimeoutMs`；不清空 env 通道（CLI / Action 仍靠 env）。

### 7.3 clone 超时

`ContainerExecutor` 构造参数的 `cloneTimeoutMs` 已支持覆盖，编排层传仓库有效值即可；日志 `[clone] ... timeout=` 自动回显生效值。

### 7.4 不做

- 不为每个仓库再写一份 `resolve*` 包装（全部收敛到 `execution-limits.ts`）。
- 不改 `packages/core` 的 `RuntimeConfig` 形态（超时是执行面参数，不进报告配置）。

## 8. API、权限与审计

### 8.1 写入与校验

- `repositorySchema` / `repositoryUpdateSchema` 增加 4 个 `z.number().int().min(...).max(...).nullable().optional()` 字段 + 交叉校验（§5.2 不变量）。
- 写入门禁沿用 `requireRole(['admin', 'org_admin'])`（`api/repos/index.ts:54`、`api/repos/[id].ts:47`），不新增角色口径。
- **D3 同批修复**：把 `repositoryBase` 拆为「无默认值字段集」+「create 专用 `.default()`」，`repositoryUpdateSchema` 用 `.partial()` 且不再注入 `platform / defaultBranch / packageManager / executorKind`；补回归用例「PUT `{ note }` 不改动 `executorKind` / 四个超时」。

### 8.2 审计

`services/repository-audit.ts` 新增 `recordExecutionLimitsAudit`（沿用 `recordVerifyCommandsAudit` 的「审计失败只日志」策略）：

```json
{ "type": "execution_limits_update", "severity": "info",
  "payload": { "repository": "owner/name",
               "previous": { "executionTimeoutMs": null, "verifyCommandTimeoutMs": null },
               "next": { "executionTimeoutMs": 2700000, "verifyCommandTimeoutMs": 1200000 } } }
```

只在**实际发生变化**时登记（创建时非全空 / 更新时与旧值不同）。

### 8.3 只读默认值端点（前端「继承全局」必须可见）

`GET /api/settings/execution-limits`（`requireAuth`）→

```json
{ "executionTimeoutMs": 1800000, "maxExecutionTimeoutMs": 3600000,
  "verifyCommandTimeoutMs": 600000, "installTimeoutMs": 300000, "cloneTimeoutMs": 300000,
  "bounds": {
    "execution": { "minMs": 60000, "maxMs": 3600000 },
    "verifyCommand": { "minMs": 10000, "maxMs": 1800000 },
    "install": { "minMs": 10000, "maxMs": 1800000 },
    "clone": { "minMs": 60000, "maxMs": 1800000 }
  } }
```

返回解析后的数值与客户端校验边界（`bounds`，见 [时长输入与环境变量单位设计](./duration-input-and-env-units.md) §3.4），不含 token / 路径等敏感信息；不做写入口。

## 9. 前端交互

### 9.1 位置与形态

`repo-form-dialog.vue` 在「自定义验证命令」下方新增**默认折叠**的「执行预算（高级）」区：折叠行显示摘要（「N 项已覆盖」或「全部继承全局」），展开后为 2×2 字段网格（执行上限 / 验证命令超时 / 安装超时 / clone 超时）。

### 9.2 继承与回显

- 输入留空 → 提交 `null`（继承），**占位符显示生效默认值**（数据来自 §8.3，禁止前端硬编码 30 / 10 / 5）。
- 编辑态：仓库值非空时填入可读单位（`30m` / `1h` / `90s`，见 [时长输入与环境变量单位设计](./duration-input-and-env-units.md)）；折叠行摘要同步显示覆盖项数与最大值。
- 保存后重新拉取列表，回显生效值（沿用父组件 `saved` 刷新链路）。

### 9.3 校验与错误

- 文本输入接受 `30m` / `1h` / `90s` / `2.5m`，纯数字按分钟（兼容旧写法）；空串归一为 `null`。
- 客户端范围校验（边界由 `/api/settings/execution-limits` 的 `bounds` 下发，与 §5.2 同值）+ 服务端 400 的**字段级错误**展示（issues path → 字段，红框 + 行内文案 + 顶部摘要，首个错误自动聚焦；不再上抛表格上方）。
- 提交体改为**显式构造**（不再 `...form.value` 展开），避免夹带无关键扩大 PUT 面。

### 9.4 i18n 与可访问性

`zh-CN` / `en-US` 各补 4 个字段标签 + 范围 / 单位 hint + 校验文案 + 折叠区标题 / 摘要（项目有缺词门禁）；`label for` 绑定，hint 通过 `aria-describedby` 关联，折叠按钮用 `aria-expanded`。

### 9.5 运行回显

运行详情（`/api/runs/[id]` 已有 `resource` 段）追加 `executionTimeoutMs`；日志在 `[executor]` 起跑行追加 `timeout=...ms source=repo|global`，与 `[clone]` 行同风格。

## 10. 失败与降级

| 场景 | 处置 |
|:--|:--|
| 存量脏数据（非整数 / 负数 / 超出封顶） | `resolveExecutionLimits` clamp 到合法区间 + `warn`，不中断运行 |
| 封顶值下调导致存量仓库越界 | 运行期 clamp（不写库）+ 日志与报告披露「配置被封顶截断」 |
| 封顶值上调后 Worker 未重启 | 锁参数在模块加载期读取；重启前按旧封顶运行，文档标注「env 变更需重启」 |
| stale-cleanup 误杀风险 | 逐 run 按快照判定；快照缺失（存量 run）回退全局默认（与当前行为一致） |
| 审计写入失败 | 只日志不抛错（沿用既有策略），不阻断配置保存 |

## 11. 规范与文档增量（与实现同批）

| 文档 | 变更 |
|:--|:--|
| [platform.md §10.5 与运行类 env 清单](../../standards/platform.md) | 锁参数口径由「= 执行默认值」改为「= 封顶值」，`lockRenewTime` 取其一半；写明 stalled 窗口变长的代价；env 清单补 `DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS` |
| [configuration.md](../../guide/configuration.md) | 新增 `DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS` 行；四个超时补「仓库级可覆盖」说明 |
| [queue-stale-recovery.md](./queue-stale-recovery.md) 与 [deployment.md](../../guide/deployment.md) | 孤儿阈值描述由「执行超时 + 宽限（全局）」改为「运行快照值 + 宽限（存量回退全局）」 |
| 本文档 | 落地后状态改为「✅ 已落地（阶段 / 批次）」 |

## 12. 验收标准（可证伪）

| # | 验收 | 判定方式 |
|:--|:--|:--|
| AC1 | 仓库配 45 min，运行实际按 45 min 执行 | 单测断言编排层传给 `ContainerExecutor` 的 `timeoutMs`；运行日志 `timeout=2700000ms source=repo` |
| AC2 | 仓库值 > 封顶 → 400 且不落库 | schema 单测 + API 用例（消息含封顶分钟数） |
| AC3 | 封顶下调后存量配置在运行期被截断 | 单测：repo 45 min + 封顶 30 min → 有效值 30 min + `warnings` 非空 |
| AC4 | 长预算运行不被 stale-cleanup 误杀 | 单测：`executionTimeoutMs=60min` 的 running run 在 40 min 时不判孤儿；`30min` 的在 40 min 时判孤儿 |
| AC4b | 快照在启动前写入 | 单测：执行抛错 / 进程中断路径下 `scan_run.executionTimeoutMs` 仍为仓库值（非 null） |
| AC5 | 锁参数与封顶同源 | 既有「同源联动」单测改为封顶值断言；`[scan-worker]` 起跑日志可见 |
| AC6 | 验证命令超时按仓库值生效 | 单测断言 3 个调用点（基线 / 后验证 / quick-verify）的 `commandTimeoutMs` |
| AC7 | PUT 部分更新不重置字段 | 用例：`github-action` 仓库 PUT `{ note }` 后 `executorKind` 与四个超时不变 |
| AC8 | 前端可设置 / 继承 / 越界拦截 | `repo-form-dialog` 组件测 + 一条 e2e（折叠 → 填值 → 保存 → 重开回显） |
| AC9 | 审计留痕且无噪声 | 用例：变更产生 `execution_limits_update`（含前后值）；无变更不产生 |

## 13. 分批与文件清单

**批 1（执行上限 + 验证命令超时 + PUT 修复）**

| 层 | 文件 |
|:--|:--|
| 数据 | `entities/repository.ts`、`entities/scan-run.ts`、`database/migrations/3000000000000-AddRepositoryExecutionLimits.ts`、`database/index.ts` |
| 契约 | `schemas/repository.ts`、`utils/execution-limits.ts`（新） |
| API | `api/repos/index.ts`、`api/repos/[id].ts`、`api/settings/execution-limits.get.ts`（新）、`services/repository-audit.ts` |
| 编排 / 队列 | `services/scan-orchestrator.service.ts`、`services/executor/container-executor.ts`（调用方）、`services/queue/scan-worker.ts`、`services/batch/stale-cleanup.ts`、`plugins/stale-cleanup.ts` |
| 引擎 | `packages/engine/src/app/index.ts`、`app/helpers.ts`、`app/verify-project.ts`、`helpers/index.ts` |
| 前端 | `app/components/repo-form-dialog.vue`、`app/types/platform.ts`、`i18n/locales/{zh-CN,en-US}.json` |
| 文档 | 本文档（状态）、`standards/platform.md §10.5`、`guide/configuration.md` |
| 测试 | `execution-limits.test.ts`、`repository-schema.test.ts`、`stale-cleanup.test.ts`、`scan-worker` 锁参数用例、e2e 一条 |

按 `AGENTS.md` 的 D 阶段要求：`packages/*/src` 改动后先 `pnpm -r build` 再 `pnpm run typecheck`。

**批 2（安装 / clone 超时 + 只读卡片）**：`fixers/install-timeouts.ts` override 参数、clone 值透传、设置页「当前运行限制」只读卡片、剩余 i18n 与文档。

## 14. 风险与缓解

| 风险 | 缓解 |
|:--|:--|
| 封顶 60 min + 慢仓库叠加，单批耗时显著上升 | 保持 `maxConcurrency` 与批次预算不变；运营侧以「按仓库只调高不调低」为纪律，默认值不动 |
| 锁窗口变长 → 真崩溃恢复变慢 | `lockRenewTime = 封顶/2`；`stalled` 事件日志保留 `runId`；文档标注可观测信号 |
| `stale-cleanup` 改逐 run 判定引入回归 | 保留「下界查询 + JS 精判」两步结构，补 AC4 单测；存量 run 快照为 null 时行为与现状一致 |
| 新列被 PUT 部分更新清空（D3 未落） | D3 同批先拆 schema 再落列；AC7 回归用例守护 |
| 前端提交体改造引入字段遗漏 | 显式 payload + 组件测断言 key 集合 |

## 15. 开放问题

1. 设置页只读卡片是否需要展示「上一次变更审计」（当前只读数值）。
2. 是否允许仓库值低于全局默认（如 5 min 快速失败）——本设计允许（下限 1 min），需确认不存在「过短导致必然超时」的误配风险。
3. 批量导入（`/api/repos/batch`）是否支持超时字段——本设计**不支持**，保持 `null` 继承。
