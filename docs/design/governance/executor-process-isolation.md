# 平台执行模型隔离设计（设计先行稿）

> 状态：✅ 已落地（2026-10-09 M38 闭环归档；选型 2026-10-08：方案 ①′ 独立 worker 进程 + 方案 ③ 已落地；见 §3.1 实现路径调整）
>   **追加（2026-10-17）**：§8 执行超时与运行级取消——把「超时」从「放弃等待」升级为「请求取消 + 有界宽限期」，并登记资源口径
> 提出：2026-10-06（生产运行日志根因分析）
> 范围：`apps/platform`（队列执行拓扑 / 执行器路由）；不触碰引擎修复与验证业务语义
> 关联：[executor-sandbox.md §7.2 / §7.4 / §7.8](./executor-sandbox-implementation.md)、[platform.md §3.3 / §10](../../standards/platform.md)、`apps/platform/server/services/queue/scan-worker.ts`、`apps/platform/server/services/executor/container-executor.ts`、`docs/plan/roadmap.md` §M38

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

1. 需要**自包含 subprocess 入口**（可执行 bundle），能在 runtime 镜像中直接运行引擎。当前 runtime 镜像自 2026-10-02 起仅含 Nuxt `.output`、不再随附 workspace `node_modules`；[executor-sandbox.md §7.2](./executor-sandbox-implementation.md) 已登记"独立沙箱真实执行落地时须提供自包含入口（自包含 CLI bundle），不得依赖 workspace `node_modules`"这一缺口——`SandboxExecutor.buildCmd` 目前即为占位实现。
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
- worker 进程会重复启动周期插件（`stale-cleanup` / 启动期备份），均为幂等操作，代价为重复查询。**实施结果（2026-10-16）**：周期清理与部署产物版本戳已按进程角色收敛为 HTTP 主进程单点执行——入口向两进程分别注入 `DEPENDFIX_ROLE`（worker / server），worker 侧据此跳过 HTTP-only 插件；worker 侧仅保留两进程共用的启动期数据源引导；启动期备份的双份副作用（保留窗口减半）登记为已知边界。口径见 [platform.md §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程)。
- worker 进程崩溃后由 entrypoint 看护循环自动重启（M40.4 落地，指数退避 + 连续重启上限，口径见 [platform.md §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程)）；连续重启超上限后由 `stale-cleanup` 兜底。

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

- [executor-sandbox.md](./executor-sandbox.md)：§3 接口契约；[沙箱执行器设计与推送机制分片](./executor-sandbox-implementation.md)：§7.2 镜像策略（自包含入口缺口）/ §7.4 执行器并存路由 / §7.8 降级状态机契约
- [platform.md](../../standards/platform.md)：§3.3 迁移与数据库口径 / §10 运行时与部署
- 代码锚点：`apps/platform/server/services/queue/queue.service.ts`、`scan-worker.ts`、`scan-queue.ts`、`apps/platform/server/services/executor/container-executor.ts`、`apps/platform/server/plugins/stale-cleanup.ts`
- 规划：`docs/plan/roadmap.md` §M38（2026-10-09 已闭环归档，见 [M38](../../plan/archive/todo-archive-phases-m38.md#m38-平台执行模型隔离-m38-1-m38-6-全部已闭环-2026-10-09-归档)）+ [platform.md §10.5 / §10.6](../../standards/platform.md)

## 8. 执行超时与运行级取消（2026-10-17）

### 8.1 症状与证据链

- **症状**：定时批次中大量「有可修告警 / 已修复 0」的仓库在运行列表显示为**已完成**；部分仓库整轮耗时 40 分钟以上。
- **证据（2026-10-16 生产批次，39 仓 / 4 小时 41 分）**：
  - 内核日志 `journalctl -k` 在该窗口内 **41 次** `Out of memory: Killed process … (MainThread)`（UID 1000、`anon-rss` 0.70–1.06 GB），时间戳与引擎日志行**同秒对齐**（例：`10:11:57` ↔ 逐包安装日志、`11:30:29` ↔ 修复前基线 `pnpm lint`、`14:41:26` ↔ 基线安装）。
  - `MainThread` 为 Node 主线程名（本机实测 `/proc/self/comm`），即引擎 spawn 的安装 / 构建 / 测试进程。
  - 63 次「版本化 override 探针」中 **47 次既无成功也无失败留痕**，全部落在环境性安装失败的仓库上（留痕缺口已由 §12.8 同源的 `recordUpgradeFailure` 补齐）。
- **根因链（三环）**：
  1. 引擎内长命令走**同步**子进程 API → 阻塞平台事件循环 → 执行超时定时器与队列锁续期一起停摆（实测超时定时器比设定值晚约 **9.5 分钟**才触发）；
  2. 执行超时只 `Promise.race`（放弃等待、不中断底层工作）→ 平台清理工作目录后引擎仍在写盘，**僵尸安装进程**继续占用内存；
  3. 单仓安装次数被**逐包应用**放大（= 可修包数 K，大仓实测 7–8 次），与 ① ② 叠加 → 僵尸进程与后续仓库争抢 4 GB 内存 → 级联 OOM。

### 8.2 契约（五条，生效面 = 引擎 + 平台）

1. **超时先请求取消**：超时到达时先调用引擎 `abort()`（终止已登记子进程树 + 置位取消标记 + 写 `ABORTED` 审计条目），再抛专属超时错误；取消回调自身抛错不得掩盖超时判定。
2. **取消后不再启动新工作**：仓库边界、验证链每条命令、以及每个安装类命令（受管的取消前置守卫，返回 `started: false`）三重短路；被跳过的仓库显式计数并汇总，不静默。
3. **中止结论独立上报**：安装 / 锁文件修复在取消下的收尾类别为 `ABORTED`（计入非零退出码），**不得**伪装成 `ENVIRONMENT_ERROR`——后者的语义是"不归因目标仓库"，混用会掩盖中止事实。
4. **取消后不交付**：跳过本地提交与 PR 创建（工作区处于"部分修复 + 未完整验证"状态）。
5. **有界宽限期**：平台在清理工作目录前等待引擎落定（缺省 10 秒，可经容器执行器构造参数收窄），并留一条区分"已落定 / 未落定"的日志。
6. **命令落定有界**：安装 / 验证命令不再只等 `close`。直接子进程 `exit` 后等待 stdio 关闭的宽限期为 `STREAM_CLOSE_GRACE_MS`（2 秒）；孙进程仍持有 stdout/stderr 时主动 destroy 管道并用已捕获输出落定。超时路径在终止进程树后同样启动该兜底——否则 `close` 可能被逃逸孙进程无限延后（实测 5 分钟安装超时拖到 12 分钟）。

### 8.3 单次修复的安装预算（合批后）

1 次修复前基线链 + **至多 1 次合批安装**（可修包 ≥ 2 时把 K 次压到 1 次；失败回退逐包最坏 K+1 次）+ 1 次修复后验证链 + 锁文件修复链**最坏 7 次安装类调用**（1 次 frozen 诊断 + ≤3 次策略命令 + ≤3 次策略后 frozen 校验）。合批语义见 [dependency-fixer-records.md §12.10](../modules/dependency-fixer-records.md#_12-10-安装类命令的超时口径与版本化-overrides-合批-2026-10-17)。

**快速失败收敛（2026-10-18）**：上述最坏次数只在"环境可装、单个 override 有问题"时才有归因价值。以下三条短路把环境性失败的预算压到常数级：① pristine 安装基线失败 → 跳过依赖安装链（版本化 overrides / 跨线 / 成员 / 分组），仍保留 lockfile repair 与修复后验证；② 合批安装以信号 / 超时失败 → 跳过逐包重试（记 `ENVIRONMENT_ERROR`，不归因）；③ 逐包安装以信号 / 超时失败 → 记录该包后立即停止本仓库剩余安装尝试。普通 exit 1 仍保留逐包回退，用于隔离单个坏 override。

### 8.4 资源口径与部署建议（2026-10-17 用户裁定：仅观测，不改默认注入；2026-10-21 补启动 / 运行期信号）

**规格分列（不再用「1GB 即可」误导单容器部署）**

- **控制面最低**：1 CPU / 1 GB —— 仅 UI / API / 队列生产，不执行安装与验证。
- **执行面建议**：≥ 2 CPU / **8 GB** —— 默认单容器（`QUEUE_WORKER=1` 仍与 HTTP 同容器）内执行 clone / 安装 / 验证；单次安装常驻约 1 GB 量级，**4 GB 已验证会 OOM**。需要隔离时把 worker 拆到独立主机（compose 预留 `worker` 段）。
- 队列并发保持 1（`DEFAULT_SCAN_CONCURRENCY`，单机同时至多一个引擎运行）。
- 如需硬上限，用**容器内存限制**而非在命令上注入堆大小（后者会把偶发 OOM 换成对大仓构建的确定性误杀）。本批次**不自动调高**任何容器限制、不生成 K8s 资源模板。
- `DEPENDFIX_INSTALL_TIMEOUT_MS`（缺省 5 分钟，越界 / 非法回退默认）可按部署算力调整；权威登记见 `apps/platform/.env.full.example` + [平台配置指南](../../guide/configuration.md)。

**启动期观测（只读、不阻断）**

- Nitro 插件 `server/plugins/resource-probe.ts` 在 HTTP 与 worker 两个进程都执行，输出单行：
  `[resource] role=worker plane=execution memoryLimit=4.0 GiB source=cgroup-v2 hostTotal=16.0 GiB concurrency=1 recommended=8.0 GiB status=low`。
- 上限优先读 cgroup v2 `memory.max`，回退 v1 `memory/memory.limit_in_bytes`；无限制 / 不可读时回退宿主 `os.totalmem()` 并标记 `source=host` / `limitReason`。
- 执行面低于 8 GB / 纯控制面低于 1 GB → `warn` 提示提高容器 / 宿主内存或拆分 worker；**不阻断启动**。
- **同步降级例外**：Redis 不可用 / 入队失败时 HTTP 进程会降级为同步执行（`scan-trigger.service.ts`），此时它不再是「纯控制面」，同样需要执行面 8 GB 规格；启动探测无法预知该运行时降级，部署时应按执行面准备。

**运行期采集（Linux cgroup；其他平台显式降级）**

- 容器执行器在 `execute()` 包装层启动 `startResourceMonitor()`：每 5 秒采样 `memory.current` 跟踪峰值，执行前后读取 `memory.events` 的 `oom_kill` 计数增量；cgroup v1 对应 `memory.usage_in_bytes` / `memory.oom_control`。
- 落库 `scan_run` 四列：
  - `memory_max_bytes` bigint NULL：cgroup 上限；无限制 / 不可读为 NULL（`limitReason`）。
  - `peak_rss_bytes` bigint NULL：执行窗口 `memory.current` 采样峰值（cgroup working set，**含页缓存**，不是单进程 RSS）。
  - `oom_killed` boolean NULL：`oom_kill` 计数增加为 true，未增加为 false，不可采集为 **NULL**（不得推断 false）。
  - `resource_json` text NULL：`source` / `samples` / `degradedReason` / `limitReason` / `sigkillDetected`。
- 非 Linux、无 cgroup、权限不足、字段缺失一律写 NULL + `degradedReason`；**不伪造 0**。B 模式（github-action）/ sandbox 执行器未接入采集时写 `executor does not collect resource usage: <kind>`。
- 归因边界：容器 cgroup 的 `oom_kill` 只覆盖 cgroup 限额触发的 OOM；**宿主级 OOM（未设容器 memory limit）不保证增加该计数**。此时结合 `resource_json.sigkillDetected`（引擎错误文本中的 SIGKILL）与宿主 `journalctl -k`；不把 SIGKILL 单独断言为 OOM。**注意**：引擎自身的安装 / 验证超时也会渲染 `signal SIGKILL, timed out`，因此 `sigkillDetected=true` 不能反推 OOM。
- 采集开销：只读小文件 + 5 秒定时器（`unref`），不进入引擎热路径；启动监控不改变安装 / 验证命令与堆参数。

### 8.5 不做什么

- 不把引擎迁出平台进程（子进程化改造成本远超本批次粒度，登记为残余候选）。
- 不在默认命令上注入 `--child-concurrency` / 堆上限（见 §8.4 末条）。
- 不改验证链条数与顺序、不改 `execution_timeout` 的状态机分类口径。
- 不改锁文件修复策略链的语义（仅将其纳入统一超时与取消面）。
- **覆盖边界（2026-10-30 更新）**：本契约的"长命令"已覆盖安装 / 锁文件修复 / 验证三类 + **交付类 git 调用**（分支切换、提交、推送、整仓回滚、checkpoint 建立与恢复）——后者改经 `github/git-run.ts` 的受管异步执行（进程登记 / 进程树终止 / abort 前置守卫），弱网 push 与提交不再阻塞事件循环。仍保持同步的是**短状态查询**，例如 `git rev-parse --git-dir` / `git rev-parse --git-common-dir` / `git diff --quiet` / `git remote get-url origin`（非穷举；`git status` 已随交付链改为异步）。它们通常毫秒级返回，且处在门禁判定路径上（改成异步需要把判定链整体异步化，收益不成比例）。

**预算接口契约（M51.5 b）**

- 预算由**上层计算**为绝对截止时间：平台执行器在构造引擎 config 时注入 `deadlineAt = now + timeoutMs`（`RuntimeConfig.deadlineAt`，epoch ms）；引擎只消费不解析，CLI 本地运行不设置 ⇒ 不限预算。
- 引擎把 `deadlineAt` 暴露为 `AppContext.deadlineAt`，并在**启动新工作前**检查剩余预算：剩余 ≥ `MIN_STEP_BUDGET_MS`（1 分钟）才启动；命中即跳过并写一条 `BUDGET_EXHAUSTED` 审计（跳过类白名单，不影响 exit code）。
- 检查点：修复前基线采样、lockfile repair（含选择性回滚后的重做）、合批版本化 overrides、逐包（多版本 / 分组内 / 成员 / 跨线）、修复后验证。
- **交付口径**：预算只跳过**未开始**的工作；已经跑完并全绿的终验按结果交付。若**终验本身**被预算跳过，则视为「未验证」——`verificationPassed` 保持 `undefined`、`RepositoryResult.verificationSkipped = 'budget'`，门禁**不交付**且**不回滚**（保留已通过单元供人工复核），不写 `VERIFICATION_FAILED`。
- 预算与取消互不替代：预算只减少"启动新工作"，取消仍会终止在跑进程树。预算跳过属跳过类白名单（不参与 exit code / 不驱动仓库失败）；取消以 `ABORTED` 记录并可计入非零退出码（运行级，不归因具体仓库）。
- **破坏性变更（0.x 内部 API）**：交付链导出的 `createFixBranch` / `stageAndCommit` / `pushBranch` / `commitStaged` / `stageScopedChanges` / `listChangedPaths` / `computeCommitScope` / `ensureGitConfig` / `branchExists` / `rollbackChanges` / `enforceVerificationGate` / `recordVerificationCheckpoint` / `commitLocalChanges` / `skipDeliveryForInstallFailure` / `rollbackForSkippedDelivery` 由同步改为异步；外部消费者必须 `await`（未 await 时 `Promise` 恒真，TypeScript 不报错）。发布说明需标注该项。
- 时钟与窗口：预算按**墙钟** epoch ms 计算（依赖宿主时钟单调性，NTP 回跳会让引擎晚于平台超时停手）；窗口只覆盖引擎 `run()`（clone 与平台交付的 push / PR 不在其中），单次总墙钟上限约为 `timeoutMs + clone + delivery`。

### 8.6 残余与观察项

- 引擎子进程化（彻底消除"引擎与平台同进程"的阻塞面）—— 未立项。
- 取消发生时工作区可能残留**部分修复**（未提交，随运行目录清理消失；CLI 就地运行场景需人工 `git restore`）。
- 宽限期内的引擎落定与否只写日志，未落库为结构化字段（如需按 run 统计"僵尸率"，需补信号）。
- **宽限期结束后仍会清理工作目录**（`finally` 的 `rm`），此时引擎若仍在写盘存在"写 / 删并发"窗口——已用日志留痕区分，未做互斥。
- 短状态查询（`git rev-parse` / `git diff --quiet` / `git remote get-url`，非穷举）仍为同步调用：极慢的巨型仓库下仍可能造成秒级事件循环停顿（非分钟级）。
- 混合运行（同一 workDir 内 A 仓预算跳过终验 + B 仓真实验证失败）：存在真实失败时按失败路径整仓回滚，预算跳过仓随之回滚（真实失败优先，不回滚会留下未声明的坏改动）；「跳过不回滚」只适用于**全部**失败仓库都是预算跳过的情况。
- 预算跳过终验时**不交付也不回滚**：已完成的修复留在工作区（平台删运行目录、CLI 由用户复核），报告记 `verificationSkipped`（平台运行详情暂不单独展示该字段）。
- 单条交付 git 命令的上限固定 5 分钟，不随剩余预算收缩（剩余不足时仍可能「启动合规、执行中被平台砍断」）。
- 取消态下的回滚被前置守卫拦下（不启动子进程）：工作区保持"部分修复"状态，由调用方清理（平台删运行目录；CLI 用户自行 `git restore` / `git reset`），日志显式说明且不记 `ROLLBACK_FAILED`。
- 预算粒度是「步骤」而非「命令」：`MIN_STEP_BUDGET_MS` 只保证"启动时还有 1 分钟"，单条命令仍可能超出剩余预算并被平台超时中止（此时按 `execution_timeout` 收尾）。
- 平台侧只注入 `deadlineAt`，未做仓库级 / 分阶段预算（登记为 backlog 候选，避免与执行器超时耦合）。
