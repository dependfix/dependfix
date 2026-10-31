# 告警级修复结果回写设计（1.0-F1 / M51.1）

> 状态：✅ 已实施（2026-10-30，M51.1；Review Gate R1 deep 两分区 Reject → R2 quick Pass）
>
> 跨模块设计（`packages/core` 契约 → `packages/engine` 产出 → `apps/platform` 落库 → 通知口径），
> 字段与表结构见 [data-model.md §告警级修复结果回写](../modules/data-model.md#告警级修复结果回写-m51-1)。

## 1. 问题

`ScanResult.fixStatus` 自 per-alert 模型（M20）起只写 `not-tried`，修复结果从不回写。后果：

- 平台明细无法区分「本地已满足（converged）」「本次失败」「主动跳过」——按明细聚合的通知
  （`security_critical` / `security_high` / 周报）把已收敛告警当成「未修复」长期上报；
- 引擎报告里的收敛数（`RunSummary.alertsConverged`）与平台明细两套口径，无法对账；
- 告警列表 / dashboard 的「已修复数」只剩 supersede 一种来源。

## 2. 契约

`RunResult.alertOutcomes?: AlertFixOutcome[]`（可选字段，向后兼容）。要点：

- **只列有结论的告警**：`not-tried` 不落条目，缺键即 `not-tried` —— 存量 run / 旧引擎报告行为不变。
- **匹配键** `(repository, source, upstreamId, manifestPath)`，两侧共用 `alertOutcomeKey`。
  `repository` 必需：`upstreamId` 是 per-repo 标识（两仓都有 `dependabot:42`），单次运行可处理多仓；
  `manifestPath` 消歧同号位多清单实例。
- **状态白名单**：`success` / `converged` / `failed` / `skipped`（落库侧按 `ALERT_OUTCOME_STATUSES` 校验——4 值，不含 `not-tried`；
  未知值不写库——未知状态会落在「未修复」集合之外，静默退出通知明细）。

## 3. 产生面（引擎）

修复链路只在**无法由 actions 反推**的判定点写显式记录；其余状态由 `buildAlertOutcomes` 推导。

| 优先级 | 判定 | 结果 | 来源 |
|:--|:--|:--|:--|
| 1 | 显式记录（收敛 / 跨 major / 清单分区 / 不可修复） | 原样 | `recordConvergedAlerts` / `recordSkippedAlerts` |
| 2 | `isAlertFixedByActions` | `success` | 与 `alertsUnfixed` 同一谓词 |
| 3 | Code Scanning `noOp` **且无 `error`**（模板已应用、文件无改动） | `converged` | actions 推导 |
| 4 | 同告警失败动作 | `failed` | 排除 `environmentalFailure` / `preExisting` / `noOp` / AI 辅助动作 |
| 5 | `override-protected` / `repeated-failure` 的 `noOp` 动作 | `skipped` | actions 推导 |
| 6 | `fixable === false` | `skipped('not-fixable')` | 告警属性 |

**显式记录优先于派生 `success`**：依赖升级的成功谓词是**包级**（同包任一清单升级到达标即命中），
会把「同包另一清单已被主动跳过」的实例误判为已修复（如根清单 `vite` 升级成功、
`docs/package.json` 的同名告警属子目录清单跳过）——方向是 fail-open（少报未修复），故显式判定优先。

**可对账**：两个收敛点用**同一数组**同时累加 `summary.alertsConverged` 与写显式记录，故
`converged` 明细数与汇总数逐条对齐。`alertsSkipped` 是 action 级计数（同包多告警共用一个 `noOp` 动作），
`skipped` 明细可多于该计数，消费方不得据此对账。

**触发前提**：`success` / `converged` / `failed` 只在修复链路（`fix` / `fix-and-pr`）产生；
`report-only` 无修复动作，但不可修复的告警仍会以 `skipped('not-fixable')` 落条目（与运行模式无关）。

## 4. 写回面（平台 reconcile）

| 场景 | 行为 |
|:--|:--|
| 新行 | `fixStatus` 取本次结论，缺键 `not-tried`；`errorMessage` 仅 `failed` 写 `reason` |
| 活跃行 + 有结论 | 改写 `fixStatus`（含 `success` → `failed`、`failed` → `converged`）；`errorMessage` 随结论重置 |
| 活跃行 + 无结论 | 保持原值（本次未下结论 ≠ 回到 `not-tried`） |
| 已 supersede 行 | 不参与（只读 `supersededAt IS NULL`）；重新激活语义未实现（既有缺口） |
| `dryRun` | 不回写（计划态 `success` 未真实交付） |

活跃行可覆盖 `success` 的理由：该行仍在上游告警列表里，本次结论就是该实例的最新事实；
决策 1 的「修复成就保留」只作用于**上游消失**时的 supersede 判定，不阻止活跃行更新。
反例（被拒绝的方案）：把 `success` 做成粘性守卫，会让后续失败 / 跳过被静默丢弃且不可计数——
与「`fixStatus` 反映真实结果」的目标直接冲突。

## 5. 下游影响

- `security_critical` / `security_high` / 周报「未修复」按 `fixStatus in (not-tried, failed, skipped)`
  查询 → `converged` 与 `success` 天然退出明细。**这是本设计的主目标**（AC1）。
- `success` 的排除规则**首次真正生效**：此前生产路径恒写 `not-tried`；落地后 `fix` 运行产出修复即退出
  未修复明细（即使上游未关闭）。属行为变更，发布说明需披露。
- `success` 行永不被 supersede（决策 1），因此 dashboard「活跃告警 / 按严重级别」与 `/api/alerts`
  默认视图会把这批已修复但上游未关闭的告警**长期计入**（此前生产从不写 `success`，该语义空转）；
  本批只披露口径，不调整活跃定义（是否排除 `success` 属后续候选）。
- 周报 `exempted` 仍取 `RunSummary.alertsConverged`（只披露「引擎汇总另有 N 条本地已满足」），
  取数为「快照仍有无修复行时，这些行所属运行的已收敛数之和」——全部收敛时不单列（不虚构来源）。

## 6. 边界与未覆盖

- 存量行不回填（回写前的 run 保持 `not-tried`）。
- `RunSummary.alertsUnfixed` 仍按 `found − fixed − converged` 计算（既有算术未调整；同包多清单可能低估，
  方向为少报未修复，需后续单独修）。
- 依赖升级失败归因为**包级**（`FixAction` 无清单维度）；Code Quality findings 不参与归因。
- `skipped` 原因只进报告 `reason`，平台 `errorMessage` 仅承载 `failed` 文案（UI 显示「已跳过」）。
- summary 的 `alertsSkippedByReason['not-fixable']` 仍含「`fixable=true` 但暂无推荐版本」的告警（既有计数口径未调整），故该计数可多于 `not-fixable` 明细条目。
- `fixable=true` 但无推荐版本（等上游）的告警**不落条目**（保持 `not-tried`），避免「不可修复」与「暂无修复版本」混为一谈。
- Code Scanning 的 `success + noOp` 有 6 类来源，只有 compliant 分支不带 `error`；带 `error` 的 `noOp`（无模板 / 路径越界 / 读不到文件 / 模板不适用）不判 `converged`。
- 活跃行可被后续运行覆盖（含 `success` → `failed`）⇒ dashboard「已修复数」非单调；「修复成就保留」只保证已 supersede 的 `success` 行不被改写。
