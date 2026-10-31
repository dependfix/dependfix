# 平台 PR 回环反馈设计（1.0-F1 / M51.3）

> 状态：✅ 已实施（2026-10-30）——a（观察态）`2d0c9930` + b（评论与关闭）；重试（retry）按用户 2026-10-30 裁定延后（§8）
>
> 依赖：[M51.2 结论口径](./pr-build-deploy-signals.md#_3-10-结论口径统一与同-ref-多轮收敛-m51-2-2026-10-30)、
> [对外 PR 交付闭环](./pr-delivery-closure.md)、[平台通知与邮件推送](./platform-notification.md)。

## 1. 问题

平台 `fix-and-pr` 交付会创建 PR（`platform-delivery.ts`），但创建后没有任何回环：

- 引擎侧的 `--wait-pr-checks` 回环（`github/pr-check-watch.ts`）只跑在 CLI / Action 的**单次运行内**，
  平台 run 结束后进程退出，不续等；
- 平台的 PR Check 监测器（`monitor/`）只做「采集 → 落 `PRCheck` → 告警 firing」，**不评论、不关闭**；
- 结果是「PR 红了无人收」：告警只在平台页面里，PR 上没有说明，红 PR 会一直挂着。

## 2. 目标与非目标

**目标**

1. 平台创建的 PR 进入**观察态**：由监测器节拍驱动，结果落 `PRCheck` 且 run 详情可见。
2. checks 失败时按 `headSha` **幂等评论一次**（说明失败 job + 归因）。
3. `closeFailedPr` 显式开启时关闭 PR 并写审计。
4. 观察有上限（PR 终态 / 配置窗口），**不阻塞 worker、不长时间持锁**。
5. 关闭与重试**默认关**，开启后行为逐条可测。

**非目标**

- 不做自动二次修复：重试只是**重新触发既有修复链**（一次 / headSha），不引入新的修复逻辑。
- 不改 CLI 交互式确认路径与 `--close-failed-pr` 的 `self_caused` 判据。
- 不在平台侧做父提交比对（因此平台没有 `self_caused` 归因，关闭判据见 §5）。
- 不做 webhook 实时反馈（沿用轮询节拍，webhook 属既有候选）。

## 3. 触发点与数据链

```text
deliverFixAndPr（创建 / 命中同内容 PR）
  └─ ScanRun.prNumber + ScanRun.prUrl 落库（新列，可空 = 非 PR 交付）
       └─ 观察态判定：prNumber 非空 ∧ 未超窗口 ∧ PR 仍 open（监测器数据面）
            └─ 监测器每轮：PollingSource → PRCheck（已有）→ pr-feedback 副作用（新增）
                 ├─ comment（失败终态，一次 / headSha）
                 ├─ close（显式开启）
                 └─ retry（显式开启，待裁定）
```

- **观察态的唯一事实源是数据库**（`ScanRun.prNumber` + `PRCheck`），不依赖进程内状态——worker 重启、
  多副本都不会丢观察。
- `prNumber` 只在 `fix-and-pr` 且实际交付（新建或命中同内容 PR）时写入；`fix` / `report-only` 保持 `null`。

## 4. 幂等与节流

| 对象 | 幂等键 | 载体 |
|:--|:--|:--|
| 评论 | `(repositoryId, prNumber, headSha)` | 评论区 HTML marker：`<!-- dependfix:pr-feedback headSha=<sha> -->`（b 批只有「评论」一种副作用，故不带 `kind`；新增副作用时再加） |
| 关闭 | `(repositoryId, prNumber, headSha)` | **动作前查 PR 状态**（`pulls.get`，非 open 即跳过）+ `audit_event(pr_feedback_closed)` |
| 重试 | `(repositoryId, prNumber, headSha)` | `audit_event(pr_feedback_retried)` |

- 评论幂等**以 GitHub 侧 marker 为准**（列表评论判断），不新增列：重启后仍幂等，且与 CLI 侧评论风格一致
  （CLI 用 attempt marker）。
- **残余风险（多副本）**：「读列表 → 判定 → 评论」是 TOCTOU，两个 worker 同时处理同一 PR 可能各评论一次；
  当前部署为单 worker 消费，登记为已知边界（可后续用审计占位或 `issue comment` 幂等键收敛）。
- **marker 可被伪造**：公开仓库任何可评论者贴出 marker 即可**抑制**平台评论（无法触发关闭）；
  登记为已知边界（后续可限定 `comment.user.type === 'Bot'`）。
- 每轮每个 PR 最多一次动作尝试；动作失败只 warn，**不改变** run 结论、不重试本轮。

## 5. 决策规则

对每个「观察态 PR」的**最新** `PRCheck` 行（`headSha` 取该 PR 的最新行）：

1. **窗口**：`now - PR 创建时间 > windowHours` → 停止观察（不评论 / 不关闭），记 debug 日志。
   时间源优先 `ScanRun.finishedAt`（平台交付时刻），缺失回退 `PRCheck.createdAt`。
2. **PR 终态即停止**：动作前查 `pulls.get`，`state !== 'open'` → 跳过（关闭过 / 人工合并后不再评论、不重复关闭）。
3. **评论**：`conclusion ∈ (failure, timed_out, action_required)` → 评论一次（§4 marker）。
   评论正文：结论 + 失败来源（provider/name，来自 `PRCheck.failureSourcesJson`，最多 5 条）+ 自动评论说明
   + 关闭提示（若开启）。**不含归因标签**（平台侧归因见 M51.2，评论区不重复展示）。
4. **关闭**：`closeFailed` 开启 ∧ 上述失败状 ∧ PR 仍 open → 关闭并写审计。
   **平台不使用 `self_caused` 判据**（无父提交比对），因此关闭门槛比 CLI 低——这是本设计的显式取舍：
   默认关闭、开启后审计可追溯、PR 正文与评论均标注「自动关闭」。要求用户在仓库级配置中显式开启。
5. **重试**（用户已裁定本批不实施）：`retryFailed` 开启 ∧ 失败 ∧ 同 `headSha` 未重试过 → 重新触发既有修复链一次。
   需要平台对外暴露队列触发面（当前无 API），故 **a/b 不实现**，接口契约见 §8。
6. `neutral` / `skipped` / `cancelled` **不触发**任何动作（与 M51.2 结论口径一致）。
7. 窗口参照：`ScanRun.finishedAt`（查询已按 `>= now - windowHours` 过滤）；`PRCheck.createdAt` 回退在
   当前查询下不可达，仅作为 `observation.ts` 的防御性能力保留。

## 6. 与监测器 / 通知的分工

- **监测器**（`monitor/`）：采集三源信号 → 落 `PRCheck` → 告警状态机。不知道也不需要知道反馈策略。
- **反馈服务**（新增 `services/pr-feedback/`）：只消费「监测器刚写入的 `PRCheck` + 观察态 PR」，
  产出 PR 侧副作用（评论 / 关闭 / 审计）。**接在 `scheduler.runPrCheckPoll` 的每轮 poll 之后**
  （同一节拍；不改 `ActionStatusMonitor` 的职责，也不新增调度器、不阻塞 worker）。失败降级为
  `errors` 计数 + warn 汇总，不改变 `pollOnce` 结果。
- **通知**：反馈不改变通知口径；关闭 PR 时写 `pr_feedback_closed` 审计，通知系统按既有规则决定是否提示。

## 7. 配置

仓库级 `Repository.prFeedback`（JSON 文本列，缺省 = 全默认值，无迁移风险）：

```jsonc
{
  "comment": true,          // 失败时评论（默认开：本特性的主价值）
  "closeFailed": false,     // 失败时关闭 PR（默认关，不可逆）
  "retryFailed": false,     // 失败时重试（默认关；待实施）
  "windowHours": 24         // 观察窗口（默认 24h；0 = 停止观察）
}
```

- 未知键**忽略**（不 warn、不阻断）；非法值回退该键默认；解析失败整体回退默认（fail-safe）。
- 配置键名以本文件为准（`comment` / `closeFailed` / `retryFailed` / `windowHours`）；与 CLI 的
  `--wait-pr-checks` / `--close-failed-pr` / `--retry-failed` 同名语义，但平台侧是「跨轮次持续观察」
  而不是「单次等待」，故独立配置。
- **当前只有库内写入面**（`Repository.prFeedback` JSON 列）：仓库设置 API / UI 与逐仓库开关属后续候选；
  本批未暴露写接口，改动需直接更新该列。

## 8. 重试接口契约（未实施）

```ts
export interface FeedbackRetryDispatcher {
    /** 重新触发一次既有修复链（fix-and-pr）；返回是否受理（去重 / 配额拒绝时 false） */
    dispatch(input: { repositoryId: string, prNumber: number, headSha: string }): Promise<boolean>
}
```

- 曾考虑直接复用 `ScanQueue.add`：其 jobId 去重键是 `scan-<repositoryId>`，与「同 PR 重试」语义不完全等价
  （同仓库并发 run 会被合并）。因此重试需要先确认「无同仓库进行中 run」，并在受理后写审计。
- 该能力依赖平台对外触发面与配额策略，**用户 2026-10-30 裁定本批不实施**；
  当前 `retryFailed` 只做配置解析，开启时每轮打一次 warn（明确「未实现」而非静默忽略）。

## 9. 风险与边界

| 风险 | 缓解 |
|:--|:--|
| 评论噪音 | 只在失败终态评论；同 `headSha` 一次；窗口上限 |
| 关闭不可逆 | 默认关 + 仓库级显式开启 + 审计 + 评论与 PR 文案标注 |
| 长轮询占锁 | 由监测器节拍驱动，无长生命周期任务；失败只 warn |
| API 限流 | 复用监测器 client 与 429 退避；每轮每 PR 最多 1 次评论 + 1 次关闭 |
| 观察态丢失 | 唯一事实源在库（`ScanRun.prNumber`），不依赖进程内状态 |
| 平台无 `self_caused` | 关闭门槛比 CLI 低，已在 §5 显式登记取舍 |
| 历史行 | `ScanRun.prNumber` 为 `null` 的存量 run 不进入观察态（不回填） |
| 多副本并发评论 | 单 worker 部署下不发生；多副本时存在 TOCTOU（§4 已知边界） |
| 人工 reopen 后再次关闭 | 被自动关闭的 PR 若被人工重新打开，最新 `PRCheck` 仍是失败 → 下一节拍会再次关闭（每次一条审计）；属「状态对齐」的有意行为，如需豁免可后续引入「同 PR 已关闭过」判据 |
| 查询成本 | 每轮每失败 PR 一次 `pulls.get` + 一次评论分页；PR 数极多时可按仓库限量（后续候选） |
