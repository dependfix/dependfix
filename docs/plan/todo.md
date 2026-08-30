# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M20 ScanResult 数据模型重构（2026-08-31 启动）

> **状态**：P 阶段设计完成，D 阶段待启动。
>
> **背景**：M19 闭环后实测反馈——`nuxt-latest-template` 在最近一次扫描 0 告警，但 alerts 视图仍显示 7 条历史"未处理"告警（出现次数 7）。根因：ScanResult 当前是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，导致上游已关闭的告警永远残留。
>
> **目标**：把 ScanResult 从"per-scan×per-alert"改为"per-alert"（一个独立告警只存一行），以 upstream ID 为唯一键；扫描完成后 reconcile，上游消失的告警标记 `supersededAt`；deleted-archived 整体修复当前 alerts 视图与 dashboard 统计口径不一致问题。
>
> **依赖关系**：M20.1 引擎侧 upstreamId 注入（4 fetcher）→ M20.2 Norm 规范化函数 → M20.3 ScanResult 实体升级 → M20.4 reconcile 函数 → M20.5 API 简化 → M20.6 UI 调整 → M20.7 backfill 一次性脚本
>
> **总投入预估**：~7 commits（M20.1 1 + M20.2 0-1 与 M20.1 合并 + M20.3-M20.4 各 1-2 + M20.5-M20.6 各 1 + M20.7 1）
>
> **关键决策**（2026-08-31 用户拍板）：
> 1. **fixStatus='success' 永不 supersede** — 保留"已修复"成就（即使上游已无该告警，dashboard "已修复数"不减少）
> 2. **backfill 保留修复记录的来源行** — 同一 fingerprint 聚合时，若有 fixStatus='success' 行则保留该行；否则保留最早 createdAt 行
> 3. **upstreamId 必须规范化** — 单一 canonical 格式 `${source}:${numericId|hash}`，pnpm-audit 用 `hash(packageName|advisoryId)` 保证稳定
> 4. **fixStatus='success' + supersededAt 不影响显示** — UI 仍显示"已修复"，supersededAt 只在"已修复"以外的告警上生效
>
> **下一步候选**：
> - M20.1 + M20.2（引擎侧 upstreamId 规范化）+ 单元测试
> - M20.3 + M20.4（ScanResult 实体升级 + reconcile 函数）
> - M20.5（API 简化 / 移除 dedupe 参数 / 加 supersededAt 默认过滤）
> - M20.6（UI 调整 / "包含已解决"开关 + i18n）
> - M20.7（一次性 backfill 脚本 + 数据迁移）

### [ ] M20.1 引擎侧 upstreamId 注入 + 规范化函数

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

### [ ] M20.6 UI 调整 + i18n

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

### [ ] M20.7 一次性 backfill 脚本 + 数据迁移

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

---

## 当前阶段：M19 治理 + 能力扩展 + 测试补强（2026-08-30 启动）

> **状态**：P 阶段规划完成，等待用户确认启动。
>
> **范围**：承接 M18 闭环后 backlog 候选池，按"类型平衡"原则选取 5 项任务：技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项。
>
> **依赖关系**：M19.1 独立（治理前置）→ M19.2 / M19.3 / M19.4 / M19.5 可并行
>
> **总投入预估**：~10 commits（M19.1 1-2 + M19.2 2-3 + M19.3 1-2 + M19.4 2-3 + M19.5 1-2）
>
> **下一步候选**：
> - **M19.1 D 阶段**：执行 C34 存量规范挂接盘点（docs only）
> - **backlog 主条目候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）

---

### [x] M19.1 C34 存量规范严格约束挂接盘点 ✅ 已完成（2026-08-30）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P3（技术债） |
| **类型** | 治理 |
| **目标** | 审查 `docs/standards/*.md` 中所有"必须级"条款，确保每个条款都在 `code-quality-checklist.md`（审计检查点）和 `code-reviewer` skill（代码审查）双层对称挂接，消除规范"有但未落地"的盲区 |
| **范围** | **做什么**：① 遍历 `docs/standards/` 下所有 .md 文件，提取含"必须"/"禁止"/"不得"/"强制"等强制性措辞的条款；② 逐一核对是否已在 `code-quality-checklist.md` 对应章节挂接；③ 逐一核对是否已在 `code-reviewer` skill 检查点挂接；④ 缺失项补挂接并注明来源条款编号 |
| | **不做什么**：不修改 `docs/standards/` 规范原文；不新增规范条款；不处理"建议"/"推荐"等非强制性条款 |
| **验收标准** | ① `rg -n "必须\|禁止\|不得\|强制" docs/standards/*.md` 输出的所有条款均有 `code-quality-checklist.md` 对应检查点；② `code-reviewer` skill 检查点列表包含所有强制性条款的审查项；③ 补挂接的条目标注来源（如 `[来源: development.md §3.2]`）；④ `pnpm run check:docs` 通过（无死链） |
| **交付物** | 更新后的 `docs/standards/code-quality-checklist.md` + `code-reviewer` skill 检查点列表 |
| **依赖** | 无（独立，治理前置） |
| **预估** | 1-2 commits |
| **实际** | 1 commit（`c0c559f`），补充 8 个必查项，Code Auditor quick depth Pass |
| **验证** | `pnpm run check:docs` 通过（101 md + 57 vue-interp），`pnpm --filter dependfix-docs build` 通过 |

---

### [x] M19.2 C23 发现规模上限 max-repos ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（能力扩展） |
| **类型** | 架构 |
| **目标** | 为仓库发现层新增 `max-repos` 配置上限，防止大 org 数百仓库一次性全量发现导致 API 配额不可控消耗和超时 |
| **范围** | **做什么**：① `architecture.md` 已规划 `max-repos` 参数但代码未实现（grep 零命中），需在发现层实现；② 按配置上限截断排序后的仓库列表（确定性：按 repo name 排序后截断）；③ CLI / Action / Platform 三入口统一暴露该参数；④ 默认值合理（建议 100）并文档说明 |
| | **不做什么**：不实现分批处理（当前截断方案已满足需求）；不改变现有并发逻辑（concurrency 16 + 限流重试 + probe 并发 5） |
| **验收标准** | ① `packages/engine/src/discovery/` 相关代码实现 `maxRepos` 参数并按排序截断；② CLI `--max-repos` 选项可传递到发现层；③ 平台 UI 扫描配置可设置 max-repos；④ 单测覆盖：超过上限时截断 + 未超过时不截断 + 默认值生效；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | 发现层代码变更 + CLI/Action/Platform 入口参数 + 单测 + 文档更新 |
| **依赖** | 无（可与 M19.3-M19.5 并行） |
| **预估** | 2-3 commits |
| **实际** | 1 commit（`3b816f4`），15 文件 +149/-1 行 |
| **验证** | `pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过 |
| **审计** | Code Auditor standard depth：1 blocker（MCP schema）+ 3 warning（env normalizer / Action input / Platform UI）已全部修复 |

---

### [x] M19.3 B1 PR 关闭评论 + label ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（用户体验） |
| **类型** | 功能 |
| **目标** | 当 dependfix 发现同一仓库已有未合并的修复 PR 时，在新 PR 上添加评论指明重复 + 添加 label（如 `duplicate`），避免用户手动排查 |
| **范围** | **做什么**：① PR 创建前查重逻辑已存在（`pulls.list`），需在发现重复时添加评论（内容：指向已有 PR 的链接 + 说明）；② 添加 `duplicate` label（可配置）；③ 确保 `GITHUB_TOKEN` 权限包含 `issues: write`（比当前 `pull-requests: write` 宽） |
| | **不做什么**：不自动关闭重复 PR（保留用户决策权）；不实现 PR 列表过滤/搜索 UI（后续候选）；不优化 `pulls.list` 性能（当前量级可接受） |
| **验收标准** | ① 当同一仓库存在未合并修复 PR 时，新创建的 PR 包含指向已有 PR 的评论；② 新 PR 被添加 `duplicate` label；③ GitHub API 调用使用 `issues: write` 权限的端点；④ 单测覆盖：重复场景评论 + label / 非重复场景不操作；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | PR 创建逻辑变更 + 评论模板 + label 配置 + 单测 |
| **依赖** | 无（可与 M19.2/M19.4/M19.5 并行） |
| **预估** | 1-2 commits |
| **实际** | 1 commit（`618484b`），8 文件 +492/-5 行 |
| **验证** | `pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed / `pnpm run check:docs` 通过 |
| **审计** | Code Auditor standard depth：2 warning（集成测试 + action.yml）已全部修复 |

---

### [x] M19.4 T701-e2e 管理端点集成测试补强 ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（测试覆盖） |
| **类型** | 测试 |
| **目标** | 补强平台管理端点（用户管理 / 凭据管理 / 仓库管理）的 Playwright e2e 集成测试覆盖，当前主要依赖 vitest 单测，e2e 仅覆盖 admin.vue 页面 |
| **范围** | **做什么**：① 用户管理端点：创建 / 列表 / 删除 / 角色变更的 API 集成测试；② 凭据管理端点：创建 / 列表 / 删除 / 类型验证的 API 集成测试；③ 仓库管理端点：导入 / 列表 / 删除 / 扫描触发的 API 集成测试；④ 测试使用 mock 数据（不依赖真实 GitHub API） |
| | **不做什么**：不覆盖 OAuth / OIDC 登录流程（属于 T701 真实环境验证）；不覆盖定时任务 / BullMQ 集成（属于 T704）；不重写已有单测（补充而非替代） |
| **验收标准** | ① 新增 e2e 测试文件覆盖上述 3 类端点；② 每个端点至少覆盖正常路径 + 错误路径（如权限不足 / 参数缺失）；③ `pnpm --filter @dependfix/platform exec playwright test` 新增测试全部通过；④ 测试可在 CI 环境稳定运行（无 flaky）；⑤ `pnpm typecheck` + `pnpm lint` 全通过 |
| **交付物** | 新增 e2e 测试文件 + 测试 fixtures + CI 验证 |
| **依赖** | 无（可与 M19.2/M19.3/M19.5 并行） |
| **预估** | 2-3 commits |
| **实际** | 1 commit（`8db2fd4`），3 文件 +841 行 |
| **验证** | `pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed / playwright test 50 passed（users 6 + credentials 19 + repos 25）/ `pnpm run check:docs` 通过 |
| **审计** | Code Auditor quick depth：1 blocker（users-api 与 admin-roles 重复）+ 3 warning（repos 缺扫描/导入 / users 缺 impersonate/unban / credentials data.code 一致性）已全部修复 |

---

### [x] M19.5 C8 per-source 错误隔离 ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（用户体验） |
| **类型** | 功能 |
| **目标** | 当并行告警源（Dependabot / Code Scanning / pnpm-audit）中任一失败时，不整体硬失败，而是 warn + 仅丢弃该源结果，保留其他已成功的源数据 |
| **范围** | **做什么**：① 修改 `packages/engine/src/` 中并行拉取逻辑，捕获单源异常并 warn 日志；② 已成功的源结果正常返回，失败源返回空数组 + 错误信息；③ 返回结构包含 `errors` 字段列出失败源及原因；④ CLI 输出 / 平台 UI 展示部分失败警告 |
| | **不做什么**：不实现重试逻辑（已有并发 + 限流重试）；不改变成功源的行为；不实现用户可配置的"严格模式"（全失败才失败） |
| **验收标准** | ① 模拟单源失败场景（如 Dependabot API 超时），其他源结果正常返回；② 返回结构 `errors` 数组包含失败源名称 + 错误信息；③ CLI 输出警告信息（如 `[WARN] Dependabot source failed: timeout, continuing with other sources`）；④ 单测覆盖：单源失败 / 全部成功 / 全部失败；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | 引擎层错误隔离逻辑 + 返回结构扩展 + CLI/UI 警告展示 + 单测 |
| **依赖** | 无（可与 M19.2/M19.3/M19.4 并行） |
| **预估** | 1-2 commits |
| **实际** | 1 commit（`a20ea02`），5 文件 +159/-2 行 |
| **验证** | `pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2510 passed |
| **审计** | Code Auditor standard depth：2 warning（throw 路径语义对齐 + pnpm-audit 单源文案）已修复 1 项 + 1 项登记 P3 |
| **备注** | 核心错误隔离机制（Promise.allSettled）此前已存在，本次主要补强 CLI 汇总警告可见性（FixError.source 字段 + logPartialSourceFailureSummary 函数）。Throw 路径重复提示问题已修复（仅在部分源失败时输出）。 |

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |
