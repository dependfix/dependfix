# 平台执行模型隔离设计（设计先行稿）

> 状态：✅ 已落地（2026-10-09 M38 闭环归档；选型 2026-10-08：方案 ①′ 独立 worker 进程 + 方案 ③ 已落地；见 §3.1 实现路径调整）
> 提出：2026-10-06（生产运行日志根因分析）
> 范围：`apps/platform`（队列执行拓扑 / 执行器路由）；不触碰引擎修复与验证业务语义
> 关联：[executor-sandbox.md §7.2 / §7.4 / §7.8](./executor-sandbox.md)、[platform.md §3.3 / §10](../../standards/platform.md)、`apps/platform/server/services/queue/scan-worker.ts`、`apps/platform/server/services/executor/container-executor.ts`、`docs/plan/roadmap.md` §M38

## 1. 背景与问题

### 1.1 现象（生产日志）

平台在生产运行中出现 BullMQ 锁续期失败：

- `could not renew lock`
- `Missing lock (code -2)`

后果链：job 的锁过期 → BullMQ 判定 job 为 *stalled* → job 被移回 waiting 重新派发（或达到 `maxStalledCount` 后判 failed）。由于平台扫描 job 的 processor 内含不可重入的执行副作用（clone / 安装 / 修复 / push），stalled 重排存在**重复执行**风险。同一时段可观测到 `stale-cleanup` 的 5 分钟节拍漂移 2~3 倍，指向同一根因（主进程 event loop 被占满）。

### 1.2 现状拓扑（As-Is）

```text
HTTP 触发 / 定时计划触发
      │
      ▼
scan-queue.add(jobId = scan-<repositoryId>)   [scan-queue.ts]
      │  (Redis)
      ▼
平台主进程 in-process Worker                    [queue.service.ts:85-89 → scan-worker.ts:56-62]
  defaultProcessor(data, jobName)
      │
      ▼
  runScanForRepository()                        [scan-orchestrator.service.ts]
      │
      ▼
  ContainerExecutor.execute()                   [container-executor.ts:222]
      │
      ▼
  await withTimeout(app.run(), this.timeoutMs)  [container-executor.ts:284；默认 30 分钟]
      │
      ▼
  引擎同步执行（execSync / execFileSync ×18）    [见 §1.3 清单]
```

关键事实：in-process Worker 与 Nitro 应用**共享同一 event loop**；BullMQ 的锁续期由该 event loop 上的定时器驱动。

### 1.3 根因链（逐环可复现证据）

| # | 环节 | 证据锚点 |
|:--|:--|:--|
| 1 | Worker 在主进程 event loop 运行 processor，未启用 sandbox，未显式配置 `lockDuration` | `apps/platform/server/services/queue/scan-worker.ts:56-62`（示意：`new Worker(SCAN_QUEUE_NAME, async (job) => ..., { connection, concurrency })`；实际带泛型实参 `Worker<ScanWorkerJobData>`） |
| 2 | processor 同步链路直达引擎执行 | `scan-worker.ts:32-49` → `scan-orchestrator.service.ts` `runScanForRepository` |
| 3 | 引擎执行在进程内 `await`，最长窗口 30 分钟 | `container-executor.ts:284`（`await withTimeout(app.run(), this.timeoutMs)`） |
| 4 | 引擎内部含 18 处**同步**子进程调用，阻塞 event loop | `rg -n "execSync\(\|execFileSync\(" packages/engine/src --glob '!*.test.ts'` = 18 处：`fixers/dependency/overrides-io.ts:22`、`fixers/pnpm/index.ts:81/144/337`、`github/pr-creator.ts:189/193/224/225/245/739/755/758/767`、`app/helpers.ts:636/637`、`runners/verification-gate.ts:34`、`config/index.ts:758`、`fixers/dependency/index.ts:783` |
| 5 | BullMQ 锁续期由主进程定时器驱动（默认 `lockRenewTime=15s` / `lockDuration=30s`） | `bullmq@^6.3.11` 默认值；event loop 被步骤 4 占满时续期定时器延后执行 |
| 6 | 续期请求晚于锁 TTL → Redis 拒绝续期 → job 被判 stalled 重排 | 现象 `could not renew lock` / `Missing lock (code -2)` |
| 7 | 同一 event loop 阻塞旁证：周期任务节拍漂移 | `apps/platform/server/plugins/stale-cleanup.ts:124`（示意：`setInterval(() => { void runStaleCleanupOnce() }, intervalMs)`，默认 5 分钟，实测漂移 2~3 倍） |

> **可复现口径**：步骤 1/3/7 为静态代码锚点（行号以本稿提交时的 `HEAD` 为准）；步骤 4 用上方 `rg` 命令复算；步骤 5 见 BullMQ 官方 [Stalled Jobs](https://docs.bullmq.io/guide/workers/stalled-jobs) 与 [Sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors) 文档。

### 1.4 影响面

- **正确性**：stalled 重排可能重复执行扫描 / 修复链路（副作用链：clone → install → fix → commit → push → PR）。
- **可观测性**：运行状态出现非预期翻转（running → stalled 重排 → 二次执行）。
- **旁路**：同进程其他周期任务（`stale-cleanup` / 批次对账 / 备份）节拍漂移，放大孤儿判定与对账延迟。
- **覆盖范围**：`scan` 与 `scheduled-scan` 两类 job 同链路受影响。

## 2. 方案设计

### 2.1 方案 ①：BullMQ sandboxed processor

**机制**：Worker 的 processor 参数由内联函数改为**独立 processor 文件路径**，BullMQ 通过 Node 子进程（默认 `spawn`，可选 `useWorkerThreads`）加载并执行 processor；job 的 bookkeeping（含锁续期）保留在主进程 event loop。主进程不再承载业务同步调用，锁续期定时器按时执行。

**官方依据**：BullMQ 文档 [Sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors) 明确将此列为 CPU 密集 job 的推荐形态——"When your workers perform CPU-heavy operations, they will inevitably keep the NodeJS event loop busy, which prevents BullMQ from doing job bookkeeping such as extending job locks, ultimately leading to 'stalled' jobs. Since sandboxed workers run the processor in a different process than the bookkeeping code, they will not result in stalled jobs as easily as standard workers."

**落地要点**：

1. 新增 processor 入口文件（形如 `module.exports = async (job) => {...}`），承载现有 `defaultProcessor` 的 `job.name` 分发逻辑（`scan` / `scheduled-scan`）。
2. processor 子进程需要独立初始化应用上下文：TypeORM 数据源（SQLite/PostgreSQL）、Redis 连接、`@dependfix/engine` 导入。BullMQ 为每个 Worker 实例复用同一个子进程池，故初始化成本为**每 Worker 一次**而非每 job 一次。
3. Nitro `.output` 自包含产物下 `processorFile` 的定位：需 build 期确保该文件进入产物，并在 runtime 用绝对路径传入（`pathToFileURL` 兼容形态见官方文档 URL Support 一节）。
4. 日志与错误跨进程回传（子进程 stdout/stderr 收敛到平台日志；job 返回值需可序列化——`ScanJobData` 为纯 JSON，满足）。
5. worker 超时语义需与 `ContainerExecutor` 内层 30 分钟超时统一，避免双超时。

**风险**：

- Nitro 打包路径解析是本方案最大不确定点，需在 D 阶段前置实证（见 §5 验证计划）。
- 子进程需重新建立 DB / Redis 连接（连接数 +2 至 +3；单容器部署可接受）。
- BullMQ 的 sandboxed TTL 机制存在已知边界（官方 [Timeout for Sandboxed processors](https://docs.bullmq.io/patterns/timeout-for-sandboxed-processors) 明确指出：若 processor 因无限循环**完全**占满 event loop，TTL 定时器同样不会触发）——但本场景 processor 在子进程内，其 event loop 阻塞不影响主进程 bookkeeping，故不构成锁续期失败路径。

**隔离强度**：中（隔离 BullMQ processor 执行层；覆盖 `scan` + `scheduled-scan`）。

### 2.2 方案 ②：独立子进程执行引擎（复用 ScanExecutor 抽象）

**机制**：新增一个进程隔离执行器（暂称 `ProcessExecutor`，与 `ContainerExecutor` 并列实现 `ScanExecutor` 契约），把 `app.run()` 放到 `spawn` 的独立 node 子进程中执行，通过 IPC（stdio NDJSON / `process.send`）回传 `ScanExecutorResult`。主进程 worker processor 仍为 `await executor.execute()`——等待的是子进程完成（异步），主进程 event loop 不被阻塞。

**落地要点**：

1. 需要**自包含 subprocess 入口**（可执行 bundle），能在 runtime 镜像中直接运行引擎。当前 runtime 镜像自 2026-10-02 起仅含 Nuxt `.output`、不再随附 workspace `node_modules`；[executor-sandbox.md §7.2](./executor-sandbox.md) 已登记"独立沙箱真实执行落地时须提供自包含入口（自包含 CLI bundle），不得依赖 workspace `node_modules`"这一缺口——`SandboxExecutor.buildCmd` 目前即为占位实现。
2. 序列化协议：`ScanExecutorContext` → 子进程（凭据经 env / stdin，不进 argv）；`ScanExecutorResult`（含 `result` / `logsJson`）→ 主进程。
3. 执行器路由接入 `scan-orchestrator.service.ts` 的 `resolveExecutorKind` 分支。
4. 幂等兜底：子进程异常退出时主进程需将 run 归入 `execution_failed`（复用既有错误分类）。

**风险**：

- 自包含入口是本方案的最大落地障碍（与 M10 独立沙箱共享同一缺口），实现成本与不确定性高于方案 ①。
- 每 job 一次 spawn 的冷启动成本（引擎 bundle 加载）。
- 与方案 ① 相比隔离更彻底（引擎崩溃不影响平台主进程），但本阶段收益增量有限。

**隔离强度**：强（引擎完全独立进程）。

**演进价值**：与 `SandboxExecutor` 演进方向及未来"独立 worker 进程 / 多容器"拓扑对齐。

### 2.3 方案 ③：缓解（提高 lockDuration + 注册 stalled/error 监听）

**机制**：显式提高 Worker `lockDuration`（例如对齐最长执行窗口 30 分钟）+ 调整 `lockRenewTime`；注册 `worker.on('stalled')` / `worker.on('error')` 监听并输出结构化告警，暴露问题而非静默。

**落地要点**：仅改 `scan-worker.ts` 的 Worker 选项与事件监听；配套单测。

**局限（治标）**：

- event loop 阻塞本身未解决——`stale-cleanup` 节拍漂移、其他定时器延迟仍然存在。
- `lockDuration` 提至 30 分钟后，真崩溃 / 容器重启时 job 的 stalled 检测窗口同倍拉长，恢复变慢。
- 若单次 event loop 阻塞超过 `lockDuration`，续期失败仍会发生；BullMQ 官方不推荐把 `lockDuration` 提到远超单 job 时长。
- 与 M38 目标（消除锁续期失败根因）不符，仅作止血与观测补强。

**隔离强度**：无（仅参数与观测）。

### 2.4 对比矩阵

| 维度 | ① sandboxed processor | ② 独立子进程引擎 | ③ 缓解 |
|:--|:--|:--|:--|
| 治本（锁续期根因） | ✅ | ✅ | ❌ 治标 |
| 隔离强度 | 中 | 强 | 无 |
| 改动面（估算） | 4-6 文件 | 8-12 文件 | 1-2 文件 |
| 与既有抽象契合 | 中（新增 processor 入口文件） | 高（复用 `ScanExecutor` 契约） | 高（Worker 选项） |
| Nitro `.output` 兼容风险 | 中（processorFile 路径需实证） | 高（自包含入口缺口） | 无 |
| 覆盖范围 | `scan` + `scheduled-scan` | container 执行路径 | 全部（仅参数） |
| 冷启动成本 | 每 Worker 一个子进程（复用） | 每 job 一次 spawn | 无 |
| 多容器 / 独立 worker 拓扑兼容 | ✅ | ✅（更强） | ✅ |
| 上线速度 | 中 | 慢 | 快 |
| 风险 | 中 | 中高 | 低 |

## 3. 推荐路径

**建议以方案 ① 为主线，方案 ③ 作为阶段内即时止血与观测补强，方案 ② 作为长期演进候选登记 backlog。**

理由：

1. 方案 ① 是 BullMQ 官方对"CPU 密集 job 导致 stalled"的推荐解，直接消除"主进程 event loop 被业务同步调用占满"这一根因；改动面可控（processor 入口 + Worker 构造 + 打包路径），且覆盖 `scan` / `scheduled-scan` 两类 job。
2. 方案 ③ 改动最小，可在 ① 落地前先止血，并补齐当前完全缺失的 `stalled` / `error` 观测（**无论 D1 选哪个方案，该项观测都应落地**——它把"静默锁过期"变成"可告警事件"）。
3. 方案 ② 的隔离强度与演进价值最高，但其依赖的自包含 subprocess 入口与 M10 独立沙箱共享同一未闭环缺口（runtime 镜像不含 workspace `node_modules`），作为本阶段主线的落地风险过高。建议在 ① 落地并验证后，将其作为独立候选重新评估（届时可与独立 worker 进程拓扑一并切片）。

> **决策留白**：若用户更看重"引擎崩溃不影响平台主进程"的强隔离，或希望一步到位对齐未来多容器拓扑，可改选方案 ② 为主线、方案 ① 降级为过渡；两者在"消除锁续期失败"上等效，差异在隔离层级与实现成本。

### 3.1 实现路径调整（2026-10-08 前置实证后）

**背景**：2026-10-08 用户裁定方案 ① 为主线后，D 阶段前置实证（§5.1「打包路径实证」）在本仓库的 Nitro 构建体系下**未能通过**——方案 ① 无法原样落地。据实证结论，经用户再次裁定改用**方案 ①′（独立 worker 进程）**。

**实证结论（4 条硬事实，均可复现）**：

1. **Nitro 产物是单 server bundle**：平台业务代码（含 `createScanWorker` / `runScanForRepository`）全部内联进 `chunks/nitro/nitro.mjs`，无稳定可指向的 processor 模块。
   - 复现：`rg -l "createScanWorker" apps/platform/.output/server/`
2. **导入平台产物会顶层启动 HTTP server**，故产物不能作为纯模块加载（无法当作 BullMQ processor 入口）。
   - 复现：`apps/platform/.output/server/chunks/nitro/nitro.mjs` 顶层 `server.listen(...)`；`.output/server/index.mjs` 仅 `export { aF as default } from './chunks/nitro/nitro.mjs'`
3. **BullMQ sandboxed processor 要求 processor 文件 `export default fn`**，而 Nitro 不提供"额外入口"机制。
   - 复现：`bullmq/dist/esm/classes/child-processor.js`（`const { default: processorFn } = await import(processorFile)`）
4. **`packages/cli/dist` 不自包含**：`bin.mjs` external 了 `@dependfix/core`，当前产物不能直接放进 runtime 镜像（runtime 镜像只含 `.output`）当子进程入口。

**因此方案 ① 原样落地需**「额外构建链」（复刻 Nitro alias / `#imports` shim / runtimeConfig 解析）或「processor 薄壳 + 平台 exec 模式」（每个 job 起一个完整平台进程，会 listen + 跑全套 plugins），成本远超本稿 §2.4 预估。

**调整后路径（方案 ①′：独立 worker 进程）**：

- **拓扑**：同一镜像启动**两个进程**——HTTP 进程（`NUXT_IN_PROCESS_WORKER=false`，不消费队列）与队列 worker 进程（`NUXT_IN_PROCESS_WORKER=true`）。扫描在 worker 进程执行，**HTTP 进程的 event loop 完全不承载引擎同步调用**，锁续期不再被阻塞。
- **开关**：entrypoint 新增 `DEPENDFIX_QUEUE_WORKER=1`（默认 0，向后兼容）；启用时主进程强制 `NUXT_QUEUE_ENABLED=true` + `NUXT_IN_PROCESS_WORKER=false`，worker 进程 `NUXT_QUEUE_ENABLED=true` + `NUXT_IN_PROCESS_WORKER=true`。
- **worker 进程 HTTP 监听收敛**：经 `NITRO_UNIX_SOCKET` 收敛到容器内 socket（不占端口、不对外暴露），避免与主进程端口冲突。
- **降级语义不变**：Redis 不可用时两进程各自按既有矩阵降级 `sync`（可用性优先）；`auto` 模式与开发环境不受影响（不设开关即保持现状）。
- **与方案 ① 的差异**：隔离层级从"BullMQ processor 子进程"变为"独立 Node 进程"。根因（主进程 event loop 被引擎同步调用占满 → 锁续期失败）**同样消除**，且**无需新增任何构建产物**（CI / Docker 构建链不变，仅 entrypoint 启两进程），并与 `queue-mode.ts` 既有 `inProcessWorker` 开关天然契合。

**残余边界（登记，不阻断）**：

- 两进程共享 SQLite（多进程写）——依赖既有 WAL + `busy_timeout`（M23.1 落地）；需运行期验证。
- worker 进程会重复启动周期插件（`stale-cleanup` / 启动期备份），均为幂等操作，代价为重复查询。
- worker 进程崩溃后由 entrypoint 看护循环自动重启（M40.4 落地，指数退避 + 连续重启上限，口径见 [platform.md §10.6](../../standards/platform.md#106-队列执行进程隔离独立-worker-进程)）；连续重启超上限后由 `stale-cleanup` 兜底。

## 4. 决策点（待用户裁定）

| 编号 | 决策点 | 备选 | 建议 |
|:--|:--|:--|:--|
| D1 | 本阶段主线方案 | ① / ② / ③ / 组合 | ①（③ 同行止血） |
| D2 | ③ 是否作为阶段内先行止血条目 | 是 / 否 | 是（独立小条目，先落地观测） |
| D3 | ① 的 runtime 形态 | `spawn` / `useWorkerThreads` | `spawn`（默认；`useWorkerThreads` 作可配项） |
| D4 | processor 子进程应用上下文初始化时机 | 每 Worker 一次 / 每 job | 每 Worker 一次（BullMQ 复用子进程） |
| D5 | 方案 ② 的登记去向 | backlog 候选 / 本阶段实施 | backlog 候选（本阶段不实施） |

## 5. 验证计划（D 阶段前置，供方案 ① 用）

1. **打包路径实证**：构建 `apps/platform/.output` 后确认 processor 入口文件存在且可被 runtime 绝对路径定位；若 Nitro 未自动纳入，确认显式 copy / build 配置方案。
2. **锁续期复现与消除对照**：本地 Redis + 构造长时同步阻塞（模拟 `pnpm install` 级阻塞）→ 旧形态复现 `Missing lock`；新形态（sandboxed processor）同期无续期失败。作为方案 ① 的核心验收证据。
3. **端到端回归**：`scan` + `scheduled-scan` 两条链路在 sandboxed processor 下结果与落库字段与现状一致（复用既有 e2e / 单测）。
4. **观测补强验收**：`stalled` / `error` 事件在触发时产生结构化日志与告警。

## 6. 不做什么

- 不改引擎修复 / 验证业务语义。
- 不改 `/api/runs` 等接口契约。
- 不做执行器整体重构。
- 不把引擎全部同步调用改异步（大范围改造，改由进程隔离兜底）。
- 不在本阶段内改动 M37 交付面。
- 不引入本设计未选定的新执行后端。

## 7. 关联文档

- [executor-sandbox.md](./executor-sandbox.md)：§3 接口契约 / §7.2 镜像策略（自包含入口缺口）/ §7.4 执行器并存路由 / §7.8 降级状态机契约
- [platform.md](../../standards/platform.md)：§3.3 迁移与数据库口径 / §10 运行时与部署
- 代码锚点：`apps/platform/server/services/queue/queue.service.ts`、`scan-worker.ts`、`scan-queue.ts`、`apps/platform/server/services/executor/container-executor.ts`、`apps/platform/server/plugins/stale-cleanup.ts`
- 规划：`docs/plan/roadmap.md` §M38（2026-10-09 已闭环归档，见 [todo-archive.md §M38](../../plan/todo-archive.md#m38-平台执行模型隔离m381m386-全部已闭环--2026-10-09-归档)）+ [platform.md §10.5 / §10.6](../../standards/platform.md)
