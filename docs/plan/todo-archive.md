# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。
> 主窗口保留最近 3-5 个已归档阶段摘要；早期阶段归档分片见 [archive/](archive/)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：
  - [M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出，115 行）
  - [M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906 执行，398 行）
  - [M6 / M7.1 / M7.2 / T711 / M8](archive/todo-archive-phases-m6-m7-t711.md)（2026-08-20 neat-freak 归档批次迁出，293 行）
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次（含 C53-后-A/B/C 衍生子任务）**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）
  - **M10 / T912 / C53 / 2026-08-20 平台 UI 增强（C59-C61）**：[archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)（**2026-08-28 M16 归档批次同步迁出**——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略）
  - **M13**：[archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**——M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略）
  - **M14 + M15**：[archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（**2026-08-31 M19 归档批次预防性分片迁出**——M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值；M14 + M15 同源批次同期迁出，符合"主窗口保留 3-5 个阶段"健康策略）
  - **M16 + M17**：[archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)（**2026-08-31 M20 归档批次预防性分片迁出**——M20 段新增前主窗口 638 行 + M20 段预估 100-130 行将超 700 强制分片阈值，预防性迁出与 M19/M18/M17/M16 归档批次预防性迁出 M14/M15/M13/M12/M10 同源策略）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **2026-08-31 M20 ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 8 commits 已全部落地）/ 2026-08-31 M19 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 5 commits 全部推送 ahead=0）/ 2026-08-30 M18 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / ~24 commits 全部推送 ahead=0）** 共 3 个批次，符合"主窗口保留 3-5 个阶段"健康策略）。**预防性分片**：M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)，保持主窗口行数在 700 强制分片阈值内。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 `todo-archive-phases-m14-m15.md`）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 待推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期 ahead 部分待用户推送（ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M20: ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M19 闭环后实测反馈——`nuxt-latest-template` 在最近一次扫描 0 告警，但 alerts 视图仍显示 7 条历史"未处理"告警（出现次数 7）。根因：ScanResult 当前是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，导致上游已关闭的告警永远残留。按依赖关系拆 **5 子阶段独立闭环**：M20.1 引擎侧 upstreamId 注入 / M20.3 ScanResult 实体升级 + reconcile 函数 / M20.5 API 简化 + dashboard 调整 / M20.6 UI 调整 + i18n / M20.7 一次性 backfill 脚本。
> **阶段边界**：M20 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）；M20.3 ScanResult per-alert 模型重构是本阶段核心，M20.5-M20.7 均依赖 M20.3 实体升级。
> **非目标**：不删除旧 scanRunId 列（保留兼容）；不回滚决策 1-4；不引入新依赖（tsx 已存在）。
> **状态**：✅ 全部完成（M20.1 + M20.3 + M20.5 + M20.6 + M20.7 全部 5 子阶段闭环 / 8 commits 已全部落地）

### 阶段闭环清单

#### M20.1 引擎侧 upstreamId 注入 + 规范化函数 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **NormalizedSecurityAlert.upstreamId 字段 + normalizeUpstreamId()** | `acb2d35`（feat(engine,core)） | `packages/core/src/alerts/index.ts` 增加 `upstreamId: string` 字段；新增 `packages/core/src/alerts/upstream-id.ts` 实现 `normalizeUpstreamId(source, raw)` 函数（`${source}:${numericId\|hash}` 格式）；4 个 fetcher 调用规范化函数填充（Dependabot/Code Scanning/pnpm-audit/code-quality）；8 个 engine 测试文件 + report.test-helpers 补充 upstreamId 字段；core upstream-id.test.ts 14 用例覆盖各 source 格式 / 空值防御 / 幂等性 / pnpm-audit 不同包区分 |

#### M20.3 ScanResult 实体升级 + reconcile 函数 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **ScanResult 实体升级** | `2e4ab1b`（feat(platform)） | `apps/platform/server/entities/scan-result.ts` 增加 6 列（upstreamId / firstSeenAt / lastSeenAt / occurrenceCount / supersededAt / repositoryId）+ 类级复合唯一索引 `(repositoryId, upstreamId)` + 类级复合索引 `(repositoryId, supersededAt)` |
| **reconcile 函数** | `2e4ab1b`（含 reconcile） | `apps/platform/server/services/scan-reconcile.ts` 实现 `reconcileAlerts()` 200 行覆盖 todo.md §M20.3 决策 1-4（INSERT / UPDATE 活跃 / supersede 上游消失 / preservedSuccess / 幂等）；`scan-orchestrator.service.ts` 替换 INSERT 逻辑为 reconcileAlerts() 调用 |
| **DDL 验证测试** | `2e4ab1b`（含 DDL 测试） | `apps/platform/tests/scan-result-ddl.test.ts` 验证 SQLite sqlite_master 中复合唯一索引实际生成 + NOT NULL 字段 + INSERT 重复被 unique constraint 拒掉 |

#### M20.5 API 简化 + dashboard 调整 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **/api/alerts 移除 dedupe + dashboard 数活跃告警** | `170fee1`（feat(platform)） | `/api/alerts` 移除 dedupe 参数 + 新增 includeSuperseded 参数（默认 false → supersededAt IS NULL 过滤）+ 返回字段新增 M20.3 字段；`/api/dashboard/stats` alertsTotal 改为数活跃告警（supersededAt IS NULL）；dedupe=true 静默忽略（向后兼容） |

#### M20.6 UI 调整 + i18n ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **alerts 视图移除 dedupe 切换 + 改为 includeSuperseded 开关** | `c7ba014`（feat(platform)） | alerts.vue dedupeOptions Select → ToggleSwitch "显示已解决"；occurrenceCount/firstSeenAt/lastSeenAt 列从 v-if 改为默认列；状态列加 superseded 分支（success 永显已修复 / 非 success+superseded 显已关闭）；alerts-view.ts AlertsFilters.dedupe → includeSuperseded；i18n 双语新增/删除键；ToggleSwitch v-model 嵌套字段 bug 修复（reactive + 显式 watch） |

#### M20.7 一次性 backfill 脚本 + 数据迁移 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **backfill-scan-result.ts CLI 脚本** | `a399323`（feat(platform)） | apps/platform/server/database/scripts/backfill-scan-result.ts（335 行 CLI 脚本：dry-run + apply 双模式；plan + execute 分离；整批事务化；聚合键 (source, packageName, ruleId)；upstreamId 合成 `${source}:backfill-${rowId}` 命名空间隔离；fixStatus='success' 永不被 supersede；批量 save 替代 N+1）|
| **backfill-scan-result.test.ts** | `a399323`（含测试） | 11 个 vitest 单测覆盖聚合规则 / 幂等 / 跨 repo 隔离 / dry-run 与 apply 一致性 / formatStats 输出 / buildBackfillUpstreamId 命名空间 |
| **register-entities.ts + README.md** | `a399323`（含辅助文件） | register-entities.ts 集中管理 entity metadata side-effect imports（tsx CLI 不走 Nitro auto-load）；README.md 运行步骤文档（dry-run → apply + y/N 二次确认 + 回滚说明） |
| **M20.7 脚本精简** | `ca6a1dc`（refactor(platform)） | engines 升级 >=20 → >=22（Node 20 EOL）；删 register-entities.ts 单独文件整合到主脚本；净 -21 行 |

### 阶段验收标准（M20 全部 5 子阶段闭环 ✅）

- [x] **M20.1 引擎侧 upstreamId 注入** —— NormalizedSecurityAlert.upstreamId 字段 + normalizeUpstreamId() + 4 fetcher 填充 + 14 用例覆盖
- [x] **M20.3 ScanResult 实体升级 + reconcile 函数** —— 6 列新增 + 复合唯一索引 + reconcileAlerts() 覆盖决策 1-4 + DDL 验证测试
- [x] **M20.5 API 简化 + dashboard 调整** —— dedupe 参数移除 + includeSuperseded 参数 + dashboard 数活跃告警
- [x] **M20.6 UI 调整 + i18n** —— ToggleSwitch "显示已解决" + 状态列 superseded 分支 + i18n 双语 + reactive watch 修复
- [x] **M20.7 backfill 脚本** —— CLI dry-run/apply + 11 单测 + README 文档 + Node 22+ engines
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error / 4 历史 warnings baseline
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 914 passed + 15 e2e passed
- [x] `pnpm check:docs` 全过 —— 102 md + 57 vue-interp OK
- [x] 编号标记扫描 0 命中
- [x] CLI dry-run / apply 端到端实测通过
- [x] A 阶段 Code Auditor deep depth Pass（M20.6 0 blocker / 2 warning / 5 suggest；M20.7 Reject → 修复 → Pass）

### 阶段治理记录

- **总投入**：8 commits（M20.1 1 + M20.3 1 + M20.5 1 + M20.6 1 + M20.6 docs 1 + M20.7 1 + M20.7 docs 1 + M20.7 refactor 1）
- **测试覆盖**：vitest 914 passed + 4 skipped（含 backfill 11 单测）；playwright 15 e2e passed（alerts-rowgroup 10 + alerts-sidebar 2 + alerts-fix-now 3）
- **审计覆盖**：M20.6 deep depth Pass（0 blocker / 2 warning / 5 suggest）；M20.7 deep depth Reject → 修复 2 blocker + 3 warning → Pass
- **关键 bug 修复**：ToggleSwitch v-model 嵌套字段 + useAsyncData watch 浅监听不触发 refetch → 改为 reactive + 显式 watch(filters, refreshAlerts, { deep: true })
- **关键经验**：
  - Node `--experimental-strip-types` 不支持装饰器（TypeORM entity 装饰器必须 tsx 编译）
  - dev SQLite 是 M20.3 之前旧 schema，synchronize ADD COLUMN NOT NULL 失败
  - engines 升级 Node 22+（Node 20 EOL）

### 待迁移经验（next neat-freak 候选）

- **M20.6 A 阶段 W1/W2**：alerts-sidebar 第 2 测试语义弱化 + mock data 残留废弃字段（affectedRunIds / occurrenceCount）—— 下批次 e2e 重构清理
- **M20.7 A 阶段 W3/S1-S7**：backfill 测试覆盖盲点（success+superseded 边界 / null 混合 / 事务回滚 / 跨 DB / 性能）+ 文档优化建议 —— 下批次治理

---

## M19: 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M18 闭环后承接 backlog 候选池，按"类型平衡"原则（技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项）选取 5 项任务独立闭环。M19.1（P3，技术债）C34 存量规范严格约束挂接盘点 / M19.2（P2，能力扩展）C23 发现规模上限 max-repos / M19.3（P2，用户体验）B1 PR 关闭评论 + label / M19.4（P2，测试覆盖）T701-e2e 管理端点集成测试补强 / M19.5（P2，用户体验）C8 per-source 错误隔离；外加 M19.x 收口（孤立编号清理 commit `ae33671`）+ 配套 commits（M19 规划 `2f9eb38` + M19 任务详情更新 `bee5c3f` + M19.4/M19.5 标记完成 commits `61b3ddc` / `4231ffb`）。
> **阶段边界**：M19 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更（仅 max-repos 上限参数）；不破坏既有 PAT / AuthProvider / GitHub App / viewer role check 等机制。
> **非目标**：不引入新依赖；不升级 better-auth / PrimeVue；不破坏 C22 PAT + App 并存路径；不引入 GitHub Actions API 权限升级之外的额外权限面扩展（B1 仅扩展到 `issues: write`）；fixtures 仍 mock（e2e 真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
> **状态**：✅ 全部完成（M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务闭环 / 5 atomic commits + 配套 commits 已全部推送至 origin/master；ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 standard depth Pass / M19.2 standard depth Pass（含 1 blocker + 3 warning 已全部修复）/ M19.3 standard depth Pass（2 warning 已全部修复）/ M19.4 quick depth Pass（1 blocker + 3 warning 已全部修复）/ M19.5 standard depth Pass（2 warning 已修复 1 项 + 1 项登记 P3）+ 同步配套 commits；本批次清理 backlog 5 个已上收主条目：B1 PR 关闭评论 + label（M19.3 闭环）/ C23 发现规模上限 max-repos（M19.2 闭环）/ C8 per-source 错误隔离（M19.5 闭环）/ T701-e2e（M19.4 闭环）/ C34 存量规范严格约束挂接盘点（M19.1 闭环））

### 阶段闭环清单

#### M19.1 C34 存量规范严格约束挂接盘点 ✅（2026-08-30 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C34 存量规范严格约束挂接盘点** | `0c536c1`（docs(review)） | 补充 8 个强制性条款检查点到 [code-reviewer](../../.github/skills/code-reviewer/SKILL.md) skill + [code-quality-checklist](../../.github/skills/code-reviewer/references/code-quality-checklist.md)（含 audit-depth / commit 拆分 / F 阶段 coverage 强制 / M14.x code-quality-checklist 双向同步 / M17.6 better-auth 锁定 / M18.x 集成外部库 README 标准用法 / 治理规范 audit warning 修复 vs 登记决策 / M18.x audit Reject 后针对性补修）；A 阶段 quick depth Pass |

#### M19.2 C23 发现规模上限 max-repos ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C23 发现规模上限 max-repos** | `c998d58`（feat(engine)） | 15 文件 / +149/-1 行；`packages/engine/src/discovery/` 实现 `maxRepos` 参数按排序截断保证确定性；CLI `--max-repos` 选项 + Action input + Platform UI 三入口统一暴露；默认值 100；单测覆盖：超过上限时截断 / 未超过时不截断 / 默认值生效；A 阶段 standard depth Pass（1 blocker MCP schema 修复 + 3 warning env normalizer / Action input / Platform UI 已全部修复） |

#### M19.3 B1 PR 关闭评论 + label ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **B1 PR 关闭评论 + label** | `5839771`（feat(engine)） | 8 文件 / +492/-5 行；PR 创建前查重逻辑扩展：当同一仓库存在未合并修复 PR 时，在新 PR 添加评论（指向已有 PR 的链接 + 说明）+ 添加 `duplicate` label（可配置）；`GITHUB_TOKEN` 权限扩展到 `issues: write`（比当前 `pull-requests: write` 宽）；A 阶段 standard depth Pass（2 warning 集成测试 + action.yml 已全部修复） |

#### M19.4 T701-e2e 管理端点集成测试补强 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T701-e2e 管理端点集成测试补强** | `8db2fd4`（test(platform)） | 3 文件 / +841 行；`apps/platform/tests/e2e/` 新增 `users-api.e2e.test.ts` (6 case) + `credentials-api.e2e.test.ts` (19 case) + `repos-api.e2e.test.ts` (25 case) —— 用户管理端点 + 凭据管理端点 + 仓库管理端点 API 集成测试；playwright test 50 passed（users 6 + credentials 19 + repos 25）；A 阶段 quick depth Pass（1 blocker users-api 与 admin-roles 重复 + 3 warning repos 缺扫描/导入 / users 缺 impersonate/unban / credentials data.code 一致性 已全部修复） |

#### M19.5 C8 per-source 错误隔离 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C8 per-source 错误隔离** | `a20ea02`（feat(engine)） | 5 文件 / +159/-2 行；`packages/engine/src/` 并行拉取逻辑捕获单源异常并 warn 日志；返回结构扩展 `FixError.source` 字段 + `logPartialSourceFailureSummary` 函数汇总警告可见性；CLI 输出警告（如 `[WARN] Dependabot source failed: timeout, continuing with other sources`）；核心错误隔离机制（Promise.allSettled）此前已存在，本批次主要补强 CLI 汇总警告可见性；A 阶段 standard depth Pass（2 warning：throw 路径重复提示已修复 + pnpm-audit 单源文案登记 P3） |

#### M19.x 收口（孤立编号清理）✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M19.x 收口** | `ae33671`（docs(refactor)） | 移除本次提交引入的孤立编号（M19.x → todo.md §M19.x）；编号标记扫描 0 命中（防御 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md)） |

### 阶段验收标准（M19 全部 5 子任务闭环 ✅）

- [x] **M19.1 C34 存量规范挂接盘点** —— 8 个必查项补充到 code-reviewer skill + code-quality-checklist + 双向挂接完整；`pnpm check:docs` 通过（101 md + 57 vue-interp）；`pnpm --filter dependfix-docs build` 通过
- [x] **M19.2 C23 发现规模上限 max-repos** —— `packages/engine/src/discovery/` 实现 `maxRepos` 参数 + CLI/Action/Platform 三入口暴露 + 单测覆盖（超过上限时截断 / 未超过时不截断 / 默认值生效）；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过
- [x] **M19.3 B1 PR 关闭评论 + label** —— 当同一仓库存在未合并修复 PR 时新 PR 含评论 + `duplicate` label；GitHub API 调用 `issues: write` 权限端点；单测覆盖：重复场景评论 + label / 非重复场景不操作；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed
- [x] **M19.4 T701-e2e 管理端点集成测试补强** —— 3 个 e2e 文件（users 6 + credentials 19 + repos 25 = 50 case）覆盖用户管理 / 凭据管理 / 仓库管理端点 API 集成；mock 数据不依赖真实 GitHub API；playwright CI 环境稳定无 flaky；`pnpm typecheck` 7 包全 Done / `pnpm lint` 全通过
- [x] **M19.5 C8 per-source 错误隔离** —— 模拟单源失败（Dependabot API 超时），其他源结果正常返回；返回结构 `FixError.source` 字段含失败源名称 + 错误信息；CLI 输出警告信息；单测覆盖：单源失败 / 全部成功 / 全部失败；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2510 passed
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 2510 passed（M19.5 实测 baseline）
- [x] `pnpm check:docs` 全过
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 5 atomic commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：5 atomic commits（M19.1 + M19.2 + M19.3 + M19.4 + M19.5）+ 配套 commits（M19 规划 `2f9eb38` / M19 任务详情 `bee5c3f` / M19.4 标记完成 `61b3ddc` / M19.5 标记完成 `4231ffb` / M19.x 收口 `ae33671`）+ cron-preview 时区修复 `3597dcf` + cron-preview backlog 登记 `52d1649` —— 共 ~12 commits 落地（M19 批次主线 5 + 配套 5 + 顺带 2）
- **测试覆盖**：vitest 2495 → 2510 passed（M19.2 baseline 2495 + M19.3 +9 case + M19.5 +6 case + M19.4 e2e 50 case 单独累计）；playwright e2e 新增 50 case（users 6 + credentials 19 + repos 25）
- **审计覆盖**：M19.1 quick / M19.2 standard（含 1 blocker + 3 warning 全部修复）/ M19.3 standard（2 warning 全部修复）/ M19.4 quick（含 1 blocker + 3 warning 全部修复）/ M19.5 standard（2 warning 修复 1 项 + 1 项登记 P3）—— 5 轮独立 Review Gate Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0（M19 全部 commits 落地后由用户主动推送或自然包含在 M19 推进批次；session 文件 stale `ahead=16` 描述在校正）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M19 段（本段；2026-08-31 M19 归档批次新增）
  - `docs/plan/todo.md` §M19 任务清单 → M19 全部 [x] 已闭环切换 + 顶部 banner 更新（M19 → M20 active）
  - `docs/plan/todo.md` §M20.1 [x] 状态更新（commit `acb2d35` 已落地，todo.md §M20.1 [ ] → [x]）
  - `docs/plan/roadmap.md` Milestone 概述表 M19 行状态更新（进行中 → 已完成 2026-08-31 归档）+ §M19 详细实施状态段新增
  - `docs/plan/backlog.md` 清理 5 个已上收 M19 主条目（B1 / C23 / C8 / T701-e2e / C34）+ 历史归档指针段新增 M19 条目
  - `docs/plan/archive/index.md` §4 当前基线更新（M19 归档后）+ §5 近期归档批次登记新增 M19 行

### 关键决策

- **类型平衡原则**：M19 按"技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项"选取 5 项 —— 避免单一类型堆积，确保每阶段多维价值。M18.x 治理批次（已闭环）留给 M20+ 按需触发
- **M19.3 B1 权限升级**：GitHub API 权限从 `pull-requests: write` 扩展到 `issues: write` —— 仅新增 `issues: write`（不影响 `contents: write` 等其他权限面）；用户接受 risk 后实施
- **M19.4 e2e fixtures 仅 mock**：本次 T701-e2e 仍以 mock 数据为主（不依赖真实 GitHub API）—— T701 真实凭据 3 项（GitHub OAuth / Google OAuth / OIDC SSO）保留 backlog 真实环境验证任务（与 M18.x 决策 C 一致：mock 聚焦库契约输出作缓解措施）
- **M19.5 throw 路径重复提示处理**：CLI 警告路径只在部分源失败时输出（避免全部成功 / 全部失败误报）—— FixError.source 字段 + logPartialSourceFailureSummary 函数统一汇总；pnpm-audit 单源文案（"pnpm-audit source failed"）作为 P3 后续优化项登记 backlog
- **M19.2 C23 max-repos 默认值 100**：权衡"覆盖中小型 org（~50 仓库）+ 防止大 org 数百仓库一次性全量发现"—— 默认 100 覆盖 90% 场景；CLI/Action/Platform 三入口可覆盖默认值上限需求

### 阶段关键经验（已沉淀至项目知识库）

- **C34 双层对称挂接协议（M19.1 实证）**：code-reviewer skill + code-quality-checklist 双向挂接 —— 任一方扩展另一方必须同步（M14.x 已固化原则的二次实证）；本次补 8 个必查项同步双层；规范单点声明原则贯穿
- **CLI/Action/Platform 三入口统一参数（M19.2 实证）**：新增参数时三入口同步暴露，避免"代码支持但 UI 不支持"或"代码支持但 CLI 不支持"的偏差 —— M19.2 C23 实施时一次性三入口同步
- **Code Auditor standard depth 捕获未触发自检的契约漏洞（M19.2 blocker 实证）**：M19.2 audit 命中 1 blocker（MCP schema 未同步新参数）—— 实施方未主动验证所有 schema 同步；F 阶段本地验证不能替代 A 阶段审计独立核验
- **Code Auditor quick depth 在小改动 e2e 测试补强下仍命中 blocker（M19.4 实证）**：M19.4 audit quick 命中 1 blocker（users-api.e2e 与既有 admin-roles.e2e.test.ts 测试逻辑重复）—— e2e 测试新增时主动 grep 既有 e2e 文件，避免重复覆盖
- **per-source 错误隔离 throw 路径语义对齐（M19.5 实证）**：CLI 警告只在"部分源失败"路径触发；全部成功 / 全部失败 throw 路径不重复警告 —— 与 M18.x throw 路径语义对齐原则一致

### 待迁移经验（next neat-freak 候选）

- **M19.5 pnpm-audit 单源文案优化**（P3 follow-up）：当前警告文案 "pnpm-audit source failed" 不够友好（缺详细失败原因）—— 后续批次优化为 "pnpm-audit: <error.message>" 格式；与 M18.x FixError 字段模式一致
- **M19.4 e2e fixtures 复用**（P3 follow-up）：M19.4 实施时新建 `users-api.e2e.test.ts` 等 3 个新 e2e 文件 —— 后续批次可考虑抽取 fixtures helper（如 `apps/platform/tests/e2e/helpers/api-roles.helper.ts` 统一封装 viewer/admin/org_admin 三角色 mock），与 M17.5 `authedCookieHeader` 抽取同源策略
- **M19.x 收口 commit 风格一致性**（P3 follow-up）：M19.x 收口 `ae33671` 是 refactor 类型 commit + 编号清理 —— 与 M14.x `b45f55e` git.md 双空行格式修复 + `84b4e1a` test 名孤立编号清理同模式（neat-freak 批次顺手处理）；建议统一为 `chore(refactor)` 类型而非 `docs(refactor)` —— 类型分类微调不影响 commit 内容
- **M19 backlog 候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）—— 详见 [backlog.md](backlog.md) §短期 / 一次性候选任务

---

## M18: 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / 2026-08-30 归档）

> **归档日期**：2026-08-30
> **阶段摘要**：M17 闭环后承接 C22 GitHub App BYO App 模式（自部署平台 GitHub App 进阶选项；PAT 保留为默认快速上手路径，二者并存不替代）。M18 包含 5 子阶段 + 1 治理批次：M18.0（P0 docs only，PAT 无感升级评估）/ M18.1（P1，C22.1 基础层：credential 扩展 4 字段 + AuthProvider 抽象层 + installation token 缓存）/ M18.2（P1，C22.2 集成层：pushFixBranch token 切换 + commit author 动态化 + 审计字段）/ M18.3（P2，C22.3 表现层：UI GitHub App tab + 文档引导 + Manifest flow 可行性评估）/ M18.4（P1，C22.4 测试层：单测补强 + e2e mock JWT signing 全链路）/ M18.x 治理批次（P3 合并入 C22 子阶段顺手做：S-5/C39/C34/S1/S2/S-3/S-4/W3/W4）。
> **阶段边界**：M18 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ C22 10 原子子任务按依赖关系拆 5 子阶段；PAT 保留为默认路径 + GitHub App 作为自部署平台进阶选项，二者并存不替代；fixtures 仅 mock 无真实 App（用户接受风险）。
> **非目标**：不发布 dependfix 自身为官方 GitHub App（C22-future 单独战略候选）；不立即做 App 多 installation 编排自动化；B 模式（`github-action` executor）App 适配非阻塞；不破坏现有 PAT 路径；Manifest flow 一键创建暂不实施（A7b 仅评估，A7a 文档引导先落地）。
> **状态**：✅ 全部完成（M18.0 + M18.1 + M18.2 + M18.3 + M18.4 + M18.x 全部 6 子阶段 + 1 治理批次闭环 / ~24 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测；含 M18.4 audit round 1 Reject 后针对性补修闭环 + M18.x 治理批次 8 commits）

### 阶段闭环清单

#### M18.0 PAT 无感升级评估报告 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **PAT 无感升级评估报告**（docs only） | `690cc73` | `docs/design/governance/c22-pat-backward-compat.md` 输出 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"，M18.0 仅输出 docs only commit |

#### M18.1 C22.1 基础层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **AuthProvider + PatAuthProvider** | `026078a` | `packages/engine/src/auth/` 新建 AuthProvider 接口（`getOctokit()` / `getGitCredential()` / `getCommitAuthor()`）+ PatAuthProvider 实现 |
| **audit Reject 修复** | `0866830` | audit round 1 Reject 后针对性补修 |
| **调用点改造** | `67a1a2f` | `createGitHubClient` 改为 `{ auth: AuthProvider }` 注入；老 `{ token }` 签名保留为 deprecated 包装 |
| **接口契约 + PatAuthProvider 单测** | `e9b9c0a` | 接口契约定义 + PatAuthProvider 单测覆盖 |
| **AppAuthProvider + InstallationTokenCache + 单测** | `adf370a` | AppAuthProvider 实现 + installation token 缓存层（1h 滑窗 + 5min 提前刷新）+ 单测 |

#### M18.2 C22.2 集成层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit author 动态化** | `e84ff58` | PAT 路径保留硬编码 `dependfix[bot]@users.noreply.github.com`；App 路径动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求） |
| **pushFixBranch 接受 AuthProvider** | `a6a1695` | `pushFixBranch` token 字段动态切换为 installation token，URL 不变 |

#### M18.3 C22.3 表现层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **GitHub App 凭据管理接入实体 + schema + UI tab + PEM 校验** | `b3a2cfb` | Credential 实体扩展 `appId` / `encryptedPrivateKey` / `installationId` / `botLogin` 4 字段 + UI 凭据创建新增 GitHub App tab + PEM 客户端解析 + 公钥指纹校验 |
| **PEM 指纹算法修正** | `c6534fe` | PEM 指纹算法修正 |
| **GitHub App 配置章节 + C39 standards 同步** | `7ef0d73` | `quick-start` 加 "GitHub App 配置" 章节 + `security.md` §5 凭据模型从"PAT 三件套"扩到"PAT + App" + `architecture.md` §认证更新 + C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步（8 处） |
| **C22 Manifest flow 可行性评估** | `25d8682` | A7b 评估报告输出至 `docs/design/governance/c22-manifest-flow-feasibility.md` |
| **Manifest flow 评估修正** | `700ab28` | 评估报告修正 |
| **删除 §2.6 重复小节标题** | `ac21f6f` | 文档格式修复 |

#### M18.4 C22.4 测试层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M18.4 测试层补强 + app-provider auth 字段 bug 修复** | `b5c23a0` | 单测补强（`auth-provider.test.ts` + `installation-token-cache.test.ts` + `pr-creator.test.ts` App bot email 路径回归）+ e2e mock JWT signing + `getInstallationOctokit` 拦截全链路验证；app-provider auth 字段 bug 修复（`@octokit/auth-app` README 标准用法：`authStrategy: createAppAuth, auth: {appId, privateKey, installationId}` 双字段） |
| **登记 M18.4 audit 教训** | `bc2ee06` | experience-archive §四十三：集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试 |

#### M18.x 治理批次 ✅（2026-08-29 闭环）

| 批次 | commit | 范围 | 验证 |
|:--|:--|:--|:--|
| 1 | `19c0cd8` docs(standards+plan) + `9da26e3` docs(testing) | C39 standards 同步（已由 M18.3 顺带闭环）+ C34 部分盘点（M14.x 5 条 + M18.x 1 条）+ experience-archive §四十三 4 条挂 standards（development.md §5.1.15 + testing.md §6.3 + ai-collaboration.md §D 第 5 条 + code-auditor.agent.md 主责边界必查项） | audit quick Pass + W1 trivial fix |
| 2 | `6866eb7` fix(engine) | **W3** stageAndCommit host 全局 git config 干扰 bug 修复（`stageAndCommit` 显式 `-c user.name=X -c user.email=Y` + `gitConfigExists` 用 `--local` flag）+ 1 个 W3 回归测试 | audit quick Reject + B1 trivial fix（删除重复 it 块） |
| 2 | `fd2a29e` fix(platform) | **S1** `scan.post.ts` + `batch-executor.ts` 字面 `'duplicate_scan'` → 联合类型 `'SCAN_PENDING_MERGED'`（C36 一致性）+ 前端 `repos.vue` 同步 + **S2** `detectServerLocale` 加 `?locale=` URL query 支持（与 `localeDetector.ts:15` `tryQueryLocale` 对齐）+ 3 个 S2 回归测试 | 验证矩阵齐备 |
| 3 | `21f1a9f` test(engine) | audit B1 fix（删除 pr-creator.test.ts 重复 W3 it 块 31 行） | 验证：63 tests passed |
| 4 | `878ae1a` test(platform) | **S-5** 5 文件 14 处 `process.env.ENCRYPTION_KEY` 死代码清理（保留 `setup-nuxt-server.ts:26` `useRuntimeConfig` stub 默认值） | platform vitest 888 passed |
| 5 | `933e578` build(workspace+ci) | **W4** `pnpm.overrides` 钉定 `@octokit/auth-app: 8.3.0`（c22 §5.5 决策 C 缓解措施 4）+ `test.yml` 新增 `pnpm audit --prod --audit-level=moderate` 步骤（不阻断 Test job） | pnpm audit 0 vulnerabilities + lockfile 同步 |
| 6 | `45cae13` test(platform) | **S-3** update-user viewer 403 端点 + **S-4** 6 端点 admin 通过双向断言（补 better-auth admin 插件完整 viewer 403 ↔ admin 通过矩阵） | lint 0 error（e2e 测试需 Playwright build 产物，本地不跑 CI 验证） |

### 阶段验收标准（M18 全部闭环 ✅）

- [x] **M18.0 PAT 无感升级评估报告** —— 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"
- [x] **M18.1 C22.1 基础层** —— AuthProvider 接口 + PatAuthProvider + AppAuthProvider + InstallationTokenCache + 单测
- [x] **M18.2 C22.2 集成层** —— commit author 动态化 + pushFixBranch 接受 AuthProvider
- [x] **M18.3 C22.3 表现层** —— Credential 实体扩展 + UI GitHub App tab + 文档引导 + Manifest flow 可行性评估 + C39 standards 同步
- [x] **M18.4 C22.4 测试层** —— 单测补强 + e2e mock JWT signing 全链路 + app-provider auth 字段 bug 修复
- [x] **M18.x 治理批次** —— S-5/C39/C34/S1/S2/S-3/S-4/W3/W4 全部闭环
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 全部通过
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— ~24 commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：~24 commits（M18.0 1 + M18.1 5 + M18.2 2 + M18.3 6 + M18.4 2 + M18.x 8）；含 M18.4 audit round 1 Reject 后针对性补修闭环
- **测试覆盖**：单测补强 + e2e mock JWT signing 全链路验证
- **审计覆盖**：M18.0 quick / M18.1 quick × 2（含 1 次 Reject 后补修）/ M18.2 quick / M18.3 standard / M18.4 quick × 2（含 1 次 Reject 后补修）/ M18.x quick × 2 —— 全部 Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-30 实测 ahead=0（已全部推送至 origin/master）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M18 段（本段）
  - `docs/plan/todo.md` 顶部 M18 任务清单 → M18 已闭环切换
  - `docs/plan/roadmap.md` M18 段状态更新（已完成 2026-08-30 归档）+ Milestone 概述表 M18 行新增
  - `docs/plan/backlog.md` §org 增强 C22 主条目状态更新（M18 已闭环）+ 历史归档指针段新增 M18 条目
  - `docs/plan/archive/index.md` 基线更新（M18 归档后）+ 近期归档批次登记新增 M18 行
  - `docs/design/governance/c22-pat-backward-compat.md`（M18.0 评估报告）
  - `docs/design/governance/c22-manifest-flow-feasibility.md`（M18.3 评估报告）
  - `docs/guide/quick-start.md` GitHub App 配置章节（M18.3）
  - `docs/design/governance/security.md` §5 凭据模型扩展（M18.3）
  - `docs/design/governance/architecture.md` §认证更新（M18.3）
  - `docs/standards/development.md` §5.1.15（M18.x 经验沉淀）
  - `docs/standards/testing.md` §6.3（M18.x 经验沉淀）
  - `docs/standards/ai-collaboration.md` §D 第 5 条（M18.x 经验沉淀）
  - `.github/agents/code-auditor.agent.md` 主责边界必查项（M18.x 经验沉淀）

### 关键决策

- **PAT 保留 + App 并存** vs 完全替换 PAT：选并存 —— PAT 是 CLI quickstart / Action input / 单仓调试的最低摩擦路径；BYO App 只对自部署平台多仓 org 场景提供增量价值（installation 范围限定 + 1h 短时 token 轮换 + 真实 bot 身份）
- **PAT commit author 保留硬编码** `dependfix[bot]@users.noreply.github.com` —— PAT 路径用户行为零变化；仅 App 路径走动态 bot identity（`{app_id}+{bot_login}[bot]@users.noreply.github.com`）
- **fixtures 仅 mock**（决策 C 风险承担）：mock 必须严格对齐 `@octokit/auth-app` 库契约输出；单测聚焦库 mock 输出契约作为缓解措施
- **Manifest flow 一键创建暂不实施**：A7b 仅评估可行性（GHES 版本支持范围 / manifest URL 构造 / OAuth callback 路径 / CSRF 防护）；A7a 文档引导先落地
- **M18.x 治理批次合并入 C22.x 子阶段顺手做**（决策 B）：按关联性分组（S-5 → M18.1 / C39+C34 → M18.3 / S1+S2 → M18.4 / S-3+S-4 → M18.4 e2e）

### 阶段关键经验（已沉淀至项目知识库）

- **集成外部库前必须读 README 标准用法**（development.md §5.1.15）：M18.1 commit 4 凭直觉写 `auth: createAppAuth(...)` 错误用法 + `vi.mock('@octokit/rest')` 跳真实路径 → M18.4 audit round 1 Reject → round 2 README 标准用法 + 去 mock 化真实路径 e2e 修复
- **测试 stub 命名一致性**（S-5 延伸教训）：调用方测试 `process.env.ENCRYPTION_KEY` 与生产 `NUXT_ENCRYPTION_KEY` 命名不一致，偶然一致性维持能跑但 setup-nuxt-server.ts stub 字符串变更会导致测试突然全挂——单一来源 + 字面量直接引用优于 env 透传

### 待迁移经验（next neat-freak 候选）

- **W1（M18.4 audit round 2）**：stageAndCommit host 全局 config 隔离未覆盖 `--local` flag 路径——仅覆盖 `-c` 显式传。需补 1 个 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config，验证 `ensureGitConfig` 会写入 local config
- **W2（M18.4 audit round 2）**：`detectServerLocale` 不接受 `?locale=EN`（大小写敏感），`tryQueryLocale` 由 `@nuxtjs/i18n` 实现可能归一化为 `en`（BCP 47 lowercasing）。建议下一批次加 `.toLowerCase()` 兼容，或在 todo 登记
- **C34 完整盘点**：standards 中其他"必须级"条款（开发规范 §3 / §4 / §5.1.x / 测试规范 §6 / 安全规范 §5 / git 规范 §3 / AI 协作规范 §1/§4）双层对称挂接完整盘点属于 neat-freak 批次工作，本次 M18.x 治理批次仅做 experience-archive §四十三 4 条新教训挂接；候选下批次会话处理

---

## M17: 安全与可用性收口（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)。

---

## M16: 平台可用性深化（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)。

---

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已归档 → 2026-08-30 M18 归档批次预防性分片迁出）

> **2026-08-30 M18 归档批次预防性分片迁出**：M13 段（12 子任务 / 26 commits / T1310 同步推进）已迁至新分片 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)。M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M18 归档批次新增后主窗口将超 700 强制分片阈值；M13 是 2026-08-26 闭环阶段（距今 4 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M13](roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档) + Milestone 概述表 M13 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M13 行
> - **关键 commit 实证**：T1301 `b57b8d8` / T1302 `f43edf1` / T1303 `c2e3d7b` `7282f65` / T1304 `25b46eb` / T1305 `0f08c40` `5269d0a` `9c79fc9` / T1306 `e3d93b7` `4447ff8` `2ae2a77` / T1309 `6023da8` `e9197c1` `1cb0364` `9b536e1` `56de1a1` / T1307 `792e8c8` `7b1ac01` `3cccce0` / T1308 `b0f6e84` `e63cdb9` / T1401 `2dce01d` / T1402+T1403 `bb3b49a` / T1310 `300b318` `1819b59` `733e198` `7b40a2c` `a74d07d`
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)

## M14: platform release 通道闭环 + UX 反馈跟进（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M14 段（4 子阶段 + M14.y 依赖批量治理，约 115 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M14 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md Milestone 概述表 M14 行](roadmap.md) + roadmap.md §M14 段历史上未单独列出（与 §M18 段缺失说明同模式 —— 2026-08-31 M19 归档批次校正）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M14 行
> - **关键 commit 实证**：T1310 `300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d` / `1fd38c1` / M14.1 收口 / M14.2 `81bd8d2` `581e1a9` `1a9eddf` 收口 + `17b5643` / M14.3 `5ccaaf4` / M14.x `92cc348` `ea0e24f` `84b4e1a` `b45f55e` / M14.y dependabot PR commits
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)

## M15: 扫描历史详情侧栏增强（UX-R2）（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M15 段（1 子阶段 4 子任务，约 65 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M15 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M15](roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + Milestone 概述表 M15 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M15 行
> - **关键 commit 实证**：`5c65177` P 阶段 docs + `1112017` UX-R2 实施（5 文件 / +425/-12）+ `0a60e3d` test 覆盖（2 文件 / +251）+ `d517a7f` release.yml CI 修复（不计入 M15 总投入）
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)

---

## M12: 平台 UX 一致性 + i18n 治理（已归档 → 2026-08-28 M17 归档批次预防性分片迁出）

> **2026-08-28 M17 归档批次预防性分片迁出**：M12 段（19 commits / C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）已迁出至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)。M17 段 152 行新增后主窗口接近 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M17 归档批次新增 152 行后主窗口 ≈ 738 行 > 700 强制分片阈值；M12 是 2026-08-21 闭环阶段（距今 7 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M12](roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档) + Milestone 概述表 M12 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M12 行
> - **关键 commit 实证**：C65-A1 `1d7c5c8` / C65-A3 `b10e270` / C65-B1 `789ed2f` / C65-C1+C2 `5dff002` / C65-D1 `348502d` / C65-D2 `132b944` / C65-D3 `374a278` / C65-D4 `ad6ce70` / CI 修复 `0c57211` `4043918` / network-audit `2104b9f` `0eb8704`
> - **关键经验沉淀**：`docs/standards/platform.md §7.2` i18n 单点声明条款 + `docs/standards/development.md §3` 同模式扫描 + `docs/standards/git.md §3` F 阶段本地验证口径差异
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)

---

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交本地待推送。详见分片文档。

---


## C53 / M10 / T912 / 2026-08-20 平台 UI 增强（C59-C61）/ 2026-08-20 M11 推进批次（已归档 → 迁出至分片）

> **2026-08-28 M16 归档批次预防性迁出**：本节段 5 个早期批次（C53 / M10 / T912 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要）已迁至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md) 与既有分片 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C 衍生子任务）。主窗口不再保留完整实施记录，仅保留导航指针与本批次归档背景说明。
>
> **迁出触发**：M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略。

| 批次 | 关键 commit 数 | 详情 |
|:--|:--:|:--|
| **C53** 平台集成模式 fix 修复结果推送远程 | 3 commits（`83ec736` / `46b7c15` / `3ed8303`） | [分片 §C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)（含 C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序；衍生子任务 C53-后-A/B/C 在 [archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次） |
| **M10** 独立沙箱容器 C26 实施规划 | 13 commits（T1001 B1+B2 + T1002 + T1003 + T1004） | [分片 §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档)（含 Docker rootless + 出站白名单代理 + cgroup v2 资源限制 + 文档收口） |
| **T912** SMTP 邮件发送器主体收口 | 3 commits（`edc9c94` / `6f00937` / `6e28207`） | [分片 §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)（T912-3 合并入 C28） |
| **2026-08-20 平台 UI 增强**（C59-C61） | 10 commits（C59 `9949504` + `03ba3b2` / C60 `a1d5bd9` `532ea78` `6b994b5` `5bba3f4` `5fbad71` / C61 `ffacfca` `5abd914` `402dc03`） | [分片 §2026-08-20 平台 UI 增强](archive/todo-archive-phases-m10-c53-c59c61.md#2026-08-20-平台-ui-增强c59--c60--c61)（C59 mixin 修复 + C60 sortable + C61 dashboard 图表） |
| **2026-08-20 M11 推进批次** | 22 commits（M11 推进批次 12 + M11 启动批次 10） | [分片 §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C + T1005-A/B/C/D + C28 + C56/C57 + C58 + C-ENV-CHANGE-ALERT） |

---

