# 运行结论语义与锁文件前置不变式（2026-11-13）

> 本文件是「本次无写入」「按包聚合的拦截构成」「基线已判安装失败的锁文件修复」「收尾异常不翻转成功结论」四项口径的权威说明；模块设计细节回指 [dependency-fixer-records.md §12.15](../modules/dependency-fixer-records.md#_12-15-lockfile-修复日志的「已合规」与「修复生效」语义-m47-2-2026-10-23)、[pnpm-lockfile-fixer.md](../modules/pnpm-lockfile-fixer.md) 与 [queue-stale-recovery.md §9](./queue-stale-recovery.md)。

## 1. 「本次无写入」只描述未验证

- `RepositoryResult.verificationSkipped = 'no-write'` 的语义**不变**：该仓库本次没有任何写操作，后验证没有对象，因此记「未验证」而不是「验证通过」。
- 它**不是**运行级结论。存在 blocked / failed 告警的运行必须在报告与运行详情给出处置构成（未修复数、按原因跳过、截断），平台侧由 `run-outcome-breakdown` 承担；「未修复 > 0」时该区块必须渲染，不允许只剩「本次无写入」。

## 2. 按包聚合的拦截构成

- `@dependfix/core#summarizeSkippedByPackage(alerts, outcomes)` 把 `status='skipped'` 的告警按 `(repository, packageName)` 收敛为「条数 + 同包最高目标版本 + 原因集合」，原因去重后按 `SKIP_REASONS` 顺序输出，未知原因原样展示。
- 报告在 `Skipped & Truncated` 之后追加 `Skipped by Package` 表；引擎收官日志输出 `[summary] N alert(s) blocked across M package group(s): repo:pkg→ver target ×count (reasons) …`（最多 8 个包组）。
- 无 skipped 结果但有未修复告警（典型：基线安装失败后整条依赖链跳过）时，日志回退为 `N alert(s) not fixed — no skipped outcome recorded`。`summary.alertsSkippedByReason` 的按原因计数不变，两者互补。

## 3. 基线已判安装失败的锁文件修复

- 触发面收窄：只有基线安装失败的诊断带**锁文件特征**（`ERR_PNPM_BROKEN_LOCKFILE` / `ERR_PNPM_OUTDATED_LOCKFILE` / `duplicated mapping key` / `lockfileVersion` 等，见 `isLockfileBaselineFailure`）才把证据作为 `knownBrokenLockfile` 传入修复器；超时 / OOM / 网络等纯环境性失败退回既有分类链，避免与告警无关的解析漂移。
- 已知损坏时禁止「已合规」捷径：即便诊断复检通过，也按 `REGENERATE_FROM_MANIFEST`（移出锁文件 → `pnpm install --lockfile-only` 按 manifest 重建 → `pnpm install --frozen-lockfile` 验证）兜底；全部策略失败时以 `PRECONDITION_FAILED` 上报，`failureDetail` 带基线命令与诊断特征。
- 成功判据只有一个：frozen 安装通过。策略命令 exit 0 不算修复。结构兜底失败时，只有成功把 `.bak` 恢复回锁文件后才清理 `<lockfile>.broken`，宁可留下证据也不让锁文件消失。
- `FixAction.changed` 显式表达是否真正改写；与 `noOp` 构成 `success+changed` / `success+noOp`（复检通过或已合规）/ `!success` 三态，报告与日志同源。

## 4. 收尾异常不翻转成功结论（平台）

- `scan-orchestrator` 先用状态机判定终态（`completed` / `degraded`），随后才发生的收尾异常（reconcile / 落库 / 通知准备）**不得**把运行翻成 `failed / orchestration_failed`。
- 保留成功状态、`summaryJson`、`runUrl`、PR 号与失败分类清空；`degraded` 的 `errorJson` 仍保留降级原因（`sandbox_unavailable` 等），并继续记录 `sandbox_degraded` / `sandbox_unavailable` 环境事件。
- 异常本身追加进 `logsJson`（`LogEntry[]` 末尾一条 error），运行记录可直接看到原因；终态条件写回守卫不变，清理侧已置终态时仍以库内状态为准且不重复通知。

## 5. 外联审计与运行结论

- 每次 `DependfixApp.run()` 启动一个运行级审计代理（`runners/egress-audit.ts`）：受管命令（安装 / 验证 / 交付 git）默认注入代理 env；环境已有代理时仅收集命令输出 URL，不覆盖用户代理（`DEPENDFIX_NETWORK_AUDIT=false` 可关闭）。
- deny-by-default：白名单 = 默认清单 + `DEPENDFIX_ALLOWED_DOMAINS` + workDir 配置面 registry 发现；非白名单目标被 502 拒绝并记为违规。
- 违规使运行**不得为成功**：引擎记 `NETWORK_VIOLATION` 审计错误 → 出口码非 0 → 平台状态机判 `failed`（`network_violation`），报告 `Network Violations` 段、运行详情与日志导出披露最小化目标。
- 命令输出中的 URL 只入审计记录、不构成违规（口径见 [security.md §5.3.1](../../standards/security.md)）；undici 直连绕过代理 env 属已知边界（见 backlog）。
- 仓库配置可扩展 registry 域（`.npmrc`）：这是 install 链的必需行为，同时也意味着「仓库能把自有域加入白名单」——按受控越权面登记；发现域只体现在审计记录的目标里（记录本身不含「白名单来源」字段）。

## 6. 已知边界

- 平台守卫只在状态机已判定成功且已产出 result 时生效；decision 之前的异常仍落 `orchestration_failed`。
- 逐告警 `fixStatus` 回写依赖 `reconcileAlerts`；收尾异常时可能未回写（`summaryJson` 仍是权威计数），需人工复核时以日志中的 `post-completion error` 行为线索。
- 真实 4 仓库的锁文件重放未在本批内置执行，真实 pnpm 的两条路径由 `index-real-pnpm.test.ts` 覆盖（`duplicated mapping key` 修复 + known-broken 重建）。
