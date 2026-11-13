# 队列僵尸任务终结与去重键释放设计

> 状态：✅ 已落地（2026-10-18，Review Gate R2 Pass）
> 关联：[平台规范 §10.4](../../standards/platform.md) / [执行进程隔离 §9](./executor-process-isolation.md#_9-队列执行进程隔离-运行时形态) · [运行失败分类](./run-failure-taxonomy.md) · [定时扫描与批量处理](./platform-scheduled-batch.md)

## 1. 背景与现象

生产批量运行期间宿主机重启 / 平台容器停止后出现两类现象：

1. 部分 ScanRun 长期停在 `running` / `pending`，页面状态不更新；
2. 重新触发同一仓库时被判定为「已有进行中的扫描任务，本次触发已合并」，新任务实际上没有入队。

Redis 中可见 `bull:scan:*` 的 job 长期处于 `waiting` / `active`，去重键 `scan-<repositoryId>` 被持续占用。手动「强制完成」批次只改数据库，不释放 job，因此仍无法重新执行。

## 2. 根因链

1. **去重语义依赖 job 生命周期**：`ScanQueue.add` 只在 job 已终态时 remove 重建；`waiting` / `active` 一律返回 `reused = true`。
2. **孤儿清理被队列状态一票否决**：旧 `stale-cleanup` 的 pending 判定是 `!hasLiveJob(repositoryId)`，而 `hasLiveJob` 只看 job 状态、不看归属 run，也看不出「无人消费的僵尸 waiting」。worker 死后 job 永远非终态 → pending 永远不被判失败。
3. **释放范围只覆盖本轮失败的 run**：被跳过的 pending run 不进 `orphanedRuns`，其 job 不会被释放；手动 `force-fail` 完全不接触队列。
4. **worker 看护循环永久放弃**：入口连续 5 次快速重启失败后停止重启，并误以为 `stale-cleanup` 能兜底；后者只能改 DB，不能消费队列。

## 3. 不变量

- **I1 状态必须收敛**：非终态 ScanRun 不得无限期停留；超过「执行超时 + 宽限」或可确定无人消费时必须落 `failed`。
- **I2 归属优先**：释放 job 时不得误删「已被新触发替换」的去重键；只有 job 归属的 run 已终态 / 不存在，或归属当前孤儿 run 时才释放。
- **I3 合法排队不误杀**：有消费者且 job 归属自身、仍处于 `waiting` 的 pending run 视为合法排队，保留。
- **I4 去重键可回收**：任何被判定为孤儿并落 `failed` 的 run，其 job 必须在同一轮或锁过期后的下一轮被移除。
- **I5 新触发可自愈**：即使周期清理尚未跑到，新触发命中僵尸 job 时也必须能替换并成功入队。
- **I6 消费者不消失**：worker 快速失败超上限后必须继续慢重试，不得永久退出。

## 4. 检测规则

### 4.1 running

- 阈值 = 该 run 的**执行上限快照**（`scan_run.execution_timeout_ms`；存量行回退 `resolveExecutionTimeoutMs()`）+ `STALE_CLEANUP_RUNNING_GRACE_MS`（缺省 5m）。候选查询仍以全局默认做下界（走索引），命中后逐 run 按快照精判——避免长预算运行被误杀。
- `startedAt` 为 NULL 的脏数据回退 `createdAt` 判断（避免 SQL `NULL < cutoff` 永不命中）。
- 超阈值直接 `failed` + `orphan_run`（`runtime` / `transient`，可重试），不依赖队列状态。

### 4.2 pending

按确定性从高到低：

1. job 不存在；
2. job 已终态（`completed` / `failed`）；
3. job 归属另一个 run，且该 run 已终态 / 不存在；
4. 队列无消费者（`queue.getWorkersCount() === 0`）且 **job 年龄** ≥ 2 × `STALE_CLEANUP_PENDING_GRACE_MS`（缺省 10m）——
   要求双倍窗口是为了避免 worker 滚动重启 / 连接短暂为 0 时误杀刚入队或尚在恢复窗口内的任务；
5. 其余 → 合法排队，保留。

`queue.getWorkersCount()` 依赖 BullMQ 为 Worker 的 blocking connection 设置的 `CLIENT SETNAME`：未显式传 Worker `name` 时名称为 `bull:<base64(queue)>`（有 `name` 时为 `bull:<base64(queue)>:w:<name>`）。BullMQ 6 在 `CLIENT` 命令不可用时（如部分托管 Redis）会返回一条伪 worker，使探测结果为 **true**（保守但可能假阳性）；因此 `consumers=yes` 不是强保证，排障时需结合 `bull:scan:wait` 堆积与 `active` 计数判断。探测抛错（非 CLIENT 命令受限）时返回 `null`，按保守方向跳过。

### 4.3 BatchRun

沿用既有规则：`status = running` 且创建超过 30 分钟，且本轮至少有一个子 run 被判孤儿 → `failed`。子 run 被清理后由 `batch-reconciler` 聚合计数与终态。

## 5. 释放语义

`releaseOrphanQueueJobs(queue, orphanedRuns)` 按三档处理：

| job 现场 | 行为 |
|:---|:---|
| `runId === 孤儿 run` | 按孤儿 run 归属释放 |
| 无 `runId`（旧 job） | 以原始 runId 空串（`runIdKey`）作归属哨兵释放：`remove` 内部再比对，避免 inspect 与 remove 之间被新触发替换 |
| 归属另一个 run，该 run 已终态 / 不存在 | 按该 run 归属释放（僵尸 job） |
| 归属另一个非终态 run | 保留（它自己的清理轮次会处理） |

- `active` 且锁未过期时 `remove` 失败 → 仅告警；本轮失败候选会由「近期 `orphan_run` 查询」在后续轮次继续尝试（窗口 2h / 上限 200）。
- `force-fail` 端点对被打死的子 run 调用同一释放逻辑，并在响应中返回 `queueReleased`（`null` = 同步模式 / 队列不可用）。

## 6. 触发路径自愈

`enqueueScanJob`（单仓 / 批量共用）在 `add` 返回 `reused` 后检查既有 job 的 owner run：

- owner 已终态 / 不存在 → `remove` 后重试一次入队；
- owner 非终态 → 保持既有「合并」语义；
- job 无 `runId` → 无法判定归属，保持合并（由周期清理兜底）。

该路径只解决「新触发被僵尸 job 阻塞」，不改变「真正进行中的同仓库任务去重合并」语义。

## 7. 消费者看护

- 入口看护循环：连续 5 次快速失败后转为慢重试（`DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS`，缺省 300s，1-3600；空 / 非法 / 0 回退 300），不再永久退出；稳定运行 60s 后重置快速计数与慢重试状态。
- 快速退避与慢重试的 `sleep` 均以 `sleep ... & wait $!` 执行：前台 `sleep` 会阻塞 trap（dash / busybox 语义），容器 TERM 最长要等满退避 / 慢重试间隔才退出（`docker stop` 10s 宽限下会被 SIGKILL，破坏 143 退出语义）。
- stale-cleanup 每轮日志输出 `consumers=yes|no|unknown`，便于判断「无消费者」还是「任务真慢」；`yes` 在 `CLIENT LIST` 受限时可能是伪 worker（假阳性），需结合 `waiting` 堆积判断。

## 8. 配置

| env | 缺省 | 说明 |
|:---|:---|:---|
| `STALE_CLEANUP_INTERVAL_MS` | `300000` | 周期清理间隔 |
| `STALE_CLEANUP_RUNNING_GRACE_MS` | `300000` | running 超过执行超时后的宽限期（> 0；非法 / 0 回退默认） |
| `STALE_CLEANUP_PENDING_GRACE_MS` | `300000` | 无消费者 / 归属终态时 pending 的最短等待（> 0；非法 / 0 回退默认）；无消费者分支要求 job 年龄 ≥ 2× 该值 |
| `DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS` | `300` | worker 慢重试间隔（1-3600；非法 / 空 / 0 回退 300） |

`EXECUTION_TIMEOUT_MS` 仍与队列锁时长、running 基础阈值同源联动。

## 9. 边界与残余风险

1. **worker 存活但暂停 / 消费停滞**：`hasConsumers = true` 时 pending 不会被无消费者规则清理；当前不设绝对 pending 上限（批量 100 仓库 × 30 分钟可能合法排队数十小时）。观察信号为 `consumers=yes` + `waiting` 长期不降。
2. **迟到 worker 覆盖终态（已闭环，2026-11-10）**：清理把 run 置 `failed` 后，仍在执行的 worker 若随后完成，`runScanInternal` 的最终保存可能覆盖为 `completed` / `failed`。现编排层两处终态写回（正常完成 / catch-all）均改为条件更新——只写终态迁移列，`WHERE id = :id AND status IN ('pending','running')`，`affected = 0` 时保留库内终态行、跳过终态通知（清理侧已就同一 run 发过）并输出结构化告警 `run_terminal_write_skipped`（含 attempted / observed 状态）。清理侧（`stale-cleanup`）本就以同一条件更新口径写入，两侧不再互相覆盖。「留痕走进程日志而非 `audit_event`」的判据：`AuditEvent` 只收执行器 / 环境健康、配置留痕与对外副作用，单次 run 的并发事实不在其语义边界内（见 `entities/audit-event.ts` 顶部说明）。残余：① 条件更新之前的 `reconcileAlerts` 仍会按本次执行结果写告警明细（终态行不承载该快照），跨 run 一致性由下一次扫描 reconcile 收敛；② 本次执行已产生的分支 / PR 副作用不回滚，由 PR 回环与下一次扫描收敛。**启动续用写已改条件更新（2026-11-13）**：`scan-run-start.ts#beginScanRunExecution` 以「读取时状态」为乐观锁基值，非复用路径额外限制 `pending` / `running`，`affected = 0` 时输出 `run_start_write_skipped` 并放弃本次起点写回——清理侧刚判超时后，起点写不再把 `failed` 复活为 `running`。
3. **手动 force-fail 与执行竞态（单向已覆盖，2026-11-10）**：worker → force-fail 方向已覆盖——force-fail 先行落 `failed` 后，迟到 worker 的终态写回被跳过，不覆盖失败归因。**反向已覆盖（2026-11-13）**：`force-fail` 端点改为逐 run 条件更新（`WHERE id = ? AND status IN ('running','pending')`）并对批次行做 `status = 'running'` 条件写，`affected = 0` 时输出 `force_fail_write_skipped`（run 级）/ `force-fail skipped (batch already terminal)`（批次级） 且不改库、不释放队列键（仅对实际写回的 run 释放）。
4. **取消未落定的工作目录清理（2026-11-13）**：超时后引擎在宽限期（10s）内未落定时，执行器记录「存活受管子进程数 + 最后受管命令 + 取消原因」（`describeUnsettledRun`），工作目录不再当场 `rm`，而是移入 `_pending/{runId}`（`.meta.json` 的 reason = `execution_timeout_unsettled`，24h 保留）延迟清理——改为保留期到期后清理（不做无限宽限），并在 `.meta.json` 与执行日志留下可判读证据。绝对超长悬挂（进程永不死）仍由 `_pending` 保留期与 stale-cleanup 兜底，不引入无限宽限。
5. **`CLIENT LIST` 受限**：托管 Redis 禁用该命令时 BullMQ 可能返回伪 worker（探测为 `true`，假阳性但保守），不会误判为「无消费者」；需依赖 job 缺失 / 归属终态两条规则兜底。
