# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M20 ScanResult 数据模型重构（2026-08-31 启动）

> **状态**：D 阶段 M20.1 / M20.3 / M20.5 / M20.6 / M20.7 全部已落地（commit `acb2d35` / `2e4ab1b` / `170fee1` / `c7ba014` / `a399323`）。M20 阶段实施完成，待 M20 + next-phase 触发人工验收。
>
> **背景**：M19 闭环后实测反馈——`nuxt-latest-template` 在最近一次扫描 0 告警，但 alerts 视图仍显示 7 条历史"未处理"告警（出现次数 7）。根因：ScanResult 当前是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，导致上游已关闭的告警永远残留。
>
> **目标**：把 ScanResult 从"per-scan×per-alert"改为"per-alert"（一个独立告警只存一行），以 upstream ID 为唯一键；扫描完成后 reconcile，上游消失的告警标记 `supersededAt`；deleted-archived 整体修复当前 alerts 视图与 dashboard 统计口径不一致问题。
>
> **依赖关系**：M20.1 引擎侧 upstreamId 注入（4 fetcher）→ M20.2 Norm 规范化函数 → M20.3 ScanResult 实体升级 → M20.4 reconcile 函数 → M20.5 API 简化 → M20.6 UI 调整 → M20.7 backfill 一次性脚本
>
> **总投入预估**：~7 commits（M20.1 1 ✅ + M20.2 0-1 与 M20.1 合并 + M20.3-M20.4 各 1-2 + M20.5-M20.6 各 1 + M20.7 1）
>
> **关键决策**（2026-08-31 用户拍板）：
> 1. **fixStatus='success' 永不 supersede** — 保留"已修复"成就（即使上游已无该告警，dashboard "已修复数"不减少）
> 2. **backfill 保留修复记录的来源行** — 同一 fingerprint 聚合时，若有 fixStatus='success' 行则保留该行；否则保留最早 createdAt 行
> 3. **upstreamId 必须规范化** — 单一 canonical 格式 `${source}:${numericId|hash}`，pnpm-audit 用 `hash(packageName|advisoryId)` 保证稳定
> 4. **fixStatus='success' + supersededAt 不影响显示** — UI 仍显示"已修复"，supersededAt 只在"已修复"以外的告警上生效
>
> **下一步候选**：
> - M20.3 + M20.4（ScanResult 实体升级 + reconcile 函数）
> - M20.5（API 简化 / 移除 dedupe 参数 / 加 supersededAt 默认过滤）
> - M20.6（UI 调整 / "包含已解决"开关 + i18n）
> - M20.7（一次性 backfill 脚本 + 数据迁移）

### [x] M20.1 引擎侧 upstreamId 注入 + 规范化函数 ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（数据模型重构） |
| **类型** | 引擎 |
| **目标** | 让每个 `NormalizedSecurityAlert` 都带 `upstreamId: string`（规范化格式），跨次扫描稳定，作为平台端 ScanResult 的唯一键 |
| **范围** | **做什么**：① `packages/core/src/alerts/index.ts` `NormalizedSecurityAlert` 增加 `upstreamId: string` 字段；② 新增 `packages/core/src/alerts/upstream-id.ts` 实现 `normalizeUpstreamId(source, raw)` 函数，统一格式 `${source}:${numericId|hash}`；③ 4 个 fetcher 调用规范化函数填充：Dependabot`${source}:${alertNumber}` / Code Scanning `${source}:${alertNumber}` / pnpm-audit `${source}:hash(pkg@ver|advisoryId)` / code-quality `${source}:${findingId}`；④ 各 fetcher 单元测试断言 upstreamId 稳定（同 alert 多次拉取产生相同 upstreamId） |
| | **不做什么**：不修改 ScanResult 实体（M20.3）；不修改平台 API（M20.5）；不写 backfill（M20.7） |
| **验收标准** | ① `NormalizedSecurityAlert.upstreamId` 字段类型与注释完整；② `normalizeUpstreamId()` 单元测试覆盖 4 source × 边界 case（空字符串、特殊字符、超长字符串）；③ 4 fetcher 单元测试断言输出 upstreamId 与 fixture 匹配；④ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全过 |
| **依赖** | 无（独立） |
| **预估** | 1 commit |
| **实际** | 1 commit（`acb2d35`），`feat(engine,core): NormalizedSecurityAlert 新增 upstreamId 字段（M20.1）` |
| **验证** | 待 D 阶段本批原子 commit 后实测 typecheck + lint + test（建议下批会话先跑通验证再继续 M20.3） |

### [ ] M20.3 ScanResult 实体升级 + reconcile 函数

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（数据模型重构） |
| **类型** | 数据模型 |
| **目标** | ScanResult 从"per-scan×per-alert"改为"per-alert"——一个独立告警只存一行；扫描完成后 reconcile 自动关闭上游已消失的告警 |
| **范围** | **做什么**：① `apps/platform/server/entities/scan-result.ts` 增加列：`upstreamId` / `firstSeenAt` / `lastSeenAt` / `occurrenceCount` / `supersededAt` / `repositoryId`（冗余 scanRun.repositoryId 便于索引）；② 类级复合唯一索引 `(repositoryId, upstreamId)`；③ `apps/platform/server/services/scan-orchestrator.service.ts` 实现 `reconcileAlerts(repositoryId, newRunId, newAlerts)` 函数 + 替换 INSERT 逻辑；④ reconcile 规则：新告警 → INSERT；已存在 + 上游还有 → UPDATE lastSeenAt++/occurrenceCount++/scanRunId/severity；已存在 + 上游消失 + fixStatus≠success → UPDATE supersededAt=NOW()；fixStatus=success 永不被 supersede；⑤ 单元测试覆盖所有 reconcile 路径 + 幂等性（重复扫描不重复 supersede） |
| | **不做什么**：不删除旧 scanRunId 列（保留兼容）；不改 API（M20.5）；不写 backfill（M20.7） |
| **验收标准** | ① 唯一索引 `(repositoryId, upstreamId)` 实际生效（SQLite DDL 验证）；② reconcile 函数 5+ 单元测试用例（INSERT / UPDATE 活跃 / supersede 上游消失 / 保留 success / 幂等）；③ 现有 scan-orchestrator 测试继续过（reconcile 不破坏 fix-and-pr 流程）；④ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全过 |
| **依赖** | M20.1（upstreamId 字段必须存在） |
| **预估** | 2 commits（实体升级 + reconcile 函数） |

### [ ] M20.5 API 简化 + dashboard 调整

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（数据模型重构） |
| **类型** | API |
| **目标** | `/api/alerts` 移除冗余 dedupe 参数（数据天然 deduped），加 `supersededAt IS NULL` 默认过滤；dashboard 告警总数改为只数活跃告警 |
| **范围** | **做什么**：① `apps/platform/server/api/alerts/index.get.ts` 移除 `dedupe` 参数；默认 query 加 `AND supersededAt IS NULL`；新增 `?includeSuperseded=true` 开关；返回字段直接来自 ScanResult（occurrenceCount / firstSeenAt / lastSeenAt）；② `apps/platform/server/api/dashboard/stats.get.ts` alertsTotal 改为 `count where supersededAt IS NULL`；fixedCount 不变（仍数 success）；③ 单元测试更新（移除 dedupe 相关断言，新增 supersededAt 过滤测试） |
| | **不做什么**：不改 UI（M20.6）；不改 fixtures（M20.7）；不改 ScanResult 实体（M20.3） |
| **验收标准** | ① `/api/alerts?includeSuperseded=false`（默认）只返回 supersededAt IS NULL 行；② `/api/alerts?includeSuperseded=true` 返回全量；③ dashboard alertsTotal = 数活跃行；fixedCount = 数 success 行（不变）；④ 单元 + e2e 覆盖 |
| **依赖** | M20.3（reconcile 必须先实现才能验证默认过滤） |
| **预估** | 1 commit |
| **备注** | **M20.3 reconcile 不重新激活已 supersede 告警的业务 gap（M20.3 audit 2026-08-31 W2）**：M20.5 实施时必须补齐"reconcile 重新激活语义"——当已 supersede 告警上游再次出现，应清除 supersededAt + 写 audit_event `suspicious_reactivation`。M20.3 本批次决策仅 supersede（不重新打开）属 audit suggest backlog，详见 `scan-result.ts` JSDoc 与 `scan-reconcile.ts:135-144` 注释。 |

### [x] M20.6 UI 调整 + i18n ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（数据模型重构） |
| **类型** | 前端 |
| **目标** | 删除"跨次去重/关闭"切换（数据天然 deduped），替换为"显示已解决"开关；统一 i18n 键 |
| **范围** | **做什么**：① `apps/platform/app/pages/alerts.vue` 把 `dedupeOptions` 替换为 `includeSuperseded` 单开关；移除 occurrenceCount 聚合逻辑（直接绑 ScanResult 字段）；② `apps/platform/app/utils/alerts-view.ts` 移除 `AlertsFilters.dedupe` 字段，加 `includeSuperseded: boolean`；`buildAlertsQuery` 改为 `if (filters.includeSuperseded) query.includeSuperseded = 'true'`；③ i18n 中英文：新增 `alerts.filter.includeSuperseded` / `common.superseded`；移除 `alerts.dedupeOff` / `alerts.dedupeAcross`；④ `apps/platform/app/pages/alerts.vue` "状态"列：fixStatus='success' 仍显示"已修复"；supersededAt IS NOT NULL 且 fixStatus≠success 显示"已关闭"；⑤ e2e 测试：开关切换验证 |
| | **不做什么**：不改 API（M20.5）；不改后端逻辑（M20.3） |
| **验收标准** | ① "跨次去重 / 关闭" UI 元素消失；② "显示已解决"开关默认 false，开启后看到 supersededAt IS NOT NULL 行；③ "已修复"状态不受 supersededAt 影响；④ 中英文 i18n 完整 + lint:md 通过 |
| **依赖** | M20.5（API 行为先确定） |
| **预估** | 1 commit |
| **实际** | 1 commit（`c7ba014`），`feat(platform): alerts 视图移除 dedupe 切换 + 改为 includeSuperseded 开关（M20.6）` |
| **验证** | T 阶段全过：vitest 903 passed + 4 skipped；vitest --typecheck Type Errors: no errors；pnpm lint 0 error；lint:md Done；playwright alerts-rowgroup 10 passed + alerts-sidebar 2 + alerts-fix-now 3 passed；build 38.5 MB；check:docs 101 md + 57 vue-interp 全过。A 阶段 Code Auditor deep depth Pass（0 blocker / 2 warning + 5 suggest；W1 W2 留 e2e 重构下批次清理） |

### [x] M20.7 一次性 backfill 脚本 + 数据迁移 ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（数据模型重构） |
| **类型** | 脚本 |
| **目标** | 把现存 N×run 重复 ScanResult 行（91 行 → 13 行）迁移到新模型，保留修复记录（决策 2），标记 upstream 已消失的为 superseded |
| **范围** | **做什么**：① `apps/platform/server/database/scripts/backfill-scan-result.ts`（一次性 CLI 脚本）；② 步骤：a. 对每个 repo 找出 (source, packageName, ruleId) 聚合组；b. 组内有 fixStatus='success' → 保留该行；否则保留 createdAt 最早的行；其他行 DELETE；c. 给所有保留的行填 upstreamId（合成 `${source}:${packageName}:${ruleId}`，等下个 run 再被上游真实 ID 替换）；d. 对每个 repo 找出最近一次 completed scan 的 upstreamId 集合；对其他 ScanResult（不在集合中且 fixStatus≠success）SET supersededAt=NOW()；e. 输出统计（X 行 → Y 行 / Z 行已 supersede）；③ 幂等：重复执行结果一致；④ e2e fixtures 同步更新（`fixtures.post.ts` 加 upstreamId 必填字段） |
| | **不做什么**：不改代码（仅数据迁移）；不回滚决策 1-4 |
| **验收标准** | ① 脚本可在 dry-run 模式只输出统计不写库；② 实跑后 alerts 视图显示数量显著下降（如 91 → 13）；③ 已修复告警（fixStatus=success）仍可见且数字不变；④ 幂等执行无副作用；⑤ 文档说明运行步骤（apps/platform/server/database/scripts/README.md） |
| **依赖** | M20.3 + M20.5 + M20.6（必须先上线代码才能跑迁移） |
| **预估** | 1 commit |
| **实际** | 1 commit（`a399323`），`feat(platform): ScanResult backfill 一次性数据迁移脚本（M20.7）` |
| **验证** | T 阶段全过：vitest 914 passed + 4 skipped（11 backfill 单测）；vitest --typecheck Type Errors: no errors；pnpm lint 0 error / 4 历史 baseline；lint:md Done；playwright alerts-rowgroup 10 passed；build 38.5 MB；check:docs 102 md + 57 vue-interp 全过；CLI dry-run 端到端 OK；`echo y \| pnpm db:backfill` apply 端到端 OK（y/N 二次确认 + APPLY stats）；CLI apply + seed data 5→3 行 ALL ASSERTIONS PASSED（含 success 保护 + 幂等 + upstreamId backfill- 前缀）。A 阶段 Code Auditor deep depth Reject → 修复全部 blocker + 关键 warning 后 Pass |

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |
