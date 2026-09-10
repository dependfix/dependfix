# M19 / M20 / M21 阶段归档

> **2026-09-10 M26 归档批次预防性分片迁出**：M19 / M20 / M21 三阶段完整段从 `todo-archive.md` 主窗口迁至新分片。M26 完整段迁出主窗口后，主窗口必须 ≤ 700 强制分片阈值，触发预防性分片。M19（2026-08-31 闭环）+ M20（2026-08-31 闭环）+ M21（2026-08-31 闭环）共 3 个早期阶段同期迁出，保持主窗口 3-5 个阶段健康策略。
>
> **M21 段关键导航**：[todo-archive.md §M21 指针段](../todo-archive.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)
>
> **M20 段关键导航**：[todo-archive.md §M20 指针段](../todo-archive.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)
>
> **M19 段关键导航**：[todo-archive.md §M19 指针段](../todo-archive.md#m19-治理-能力扩展--测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)
>
> **迁出触发**：M26 完整段（~250 行）追加至 `todo-archive.md` 主窗口将触发 700 行强制分片阈值（682 + 250 = 932 行）。M19 / M20 / M21 三阶段预防性迁出后，主窗口可容纳 M26 完整段 + M23 / M22 完整段 + 早期阶段指针段（健康窗口 ≤ 700 行）。

## M21: 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M20 闭环后承接 backlog 候选池 + M18.x 治理剩余风险；按"类型平衡"原则（🛡️ 治理 2 项 + 🚀 能力扩展 1 项 + 🧪 测试覆盖 1 项）选取 **4 项任务**独立闭环（M21.3 段为重复登记——S-5 已由 M18.x commit `878ae1a` 闭环，本批次 P 阶段规划删除并迁 backlog 历史归档指针段）。M21.1（P3，🛡️ 治理）Code Scanning RG-W01 + RG-W02 `execFileSync` 替换 `execSync` 2 处命令注入修复 / M21.2（P3，🛡️ 治理）M18.x 剩余风险 W1 + W2 + audit suggest 1+2 集中清理 / M21.4（P3，🚀 能力扩展）B3 PR 自动合并闭环（mergify 模板 + auto-merge guide + audit W1 vitepress sidebar 修复）/ M21.5（P3，🧪 测试覆盖）T704 async 定时触发 + Schedule CRUD e2e 补强（playwright e2e 6 case + BullMQ upsertJobScheduler 短间隔集成测试）。
>
> **阶段边界**：M21 严格遵循 [规划规范 §1.1 任务粒度约束](../../standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更；不引入新依赖；不升级 better-auth / PrimeVue；fixtures 仍 mock（真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
>
> **非目标**：不发布 mergify action（仅提供模板 + 文档引导）；不修改 dependfix 自身 PR 提交流程；不立即引入 GitHub Actions API `issues: write` 之外的其他权限面扩展（保留与 M19.3 一致的边界）。
>
> **状态**：✅ 全部完成（M21.1 + M21.2 + M21.4 + M21.5 全部 4 子阶段闭环 / **11 atomic commits 实施 + 4 docs 收口 commits = 15 commits 已全部推送至 origin/master ahead=0**；`git rev-list HEAD ^origin/master --count` 2026-08-31 实测；含 M21.4 audit round 1 W1 vitepress sidebar 注册修复闭环）

### 阶段闭环清单

#### M21.1 Code Scanning RG-W01 + RG-W02（execFileSync 替换 execSync 2 处）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **RG-W01** `packages/engine/src/github/pr-creator.ts:214` execSync 替换 | `0a83c74`（fix(engine)） | `git add .` 替换为 `execFileSync('git', ['add', '.'])`；参数化数组避免 shell 解释；既有 `pr-creator.test.ts` 覆盖 PR 创建全链路 |
| **RG-W02** `packages/engine/src/fixers/pnpm/index.ts:144` execSync 替换 | `a77e557`（fix(engine)） | `execSync(command)` 含模板拼接 → `execFileSync('pnpm', [...args])` 参数化；既有 `fixers-pnpm.test.ts` 覆盖 |

#### M21.2 M18.x 剩余风险 W1 + W2 + audit suggest 1+2（4 项集中清理）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **W1** stageAndCommit `--local` flag 路径回归测试 | `fe7cc0f`（test(engine)） | `packages/engine/src/git/stage-and-commit.test.ts` 新增 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config；vi.stubEnv 隔离 + vi.unstubAllEnvs |
| **W2** detectServerLocale 大小写兼容 | `ad376c8`（fix(platform)） | `apps/platform/server/utils/localized-error.ts:tryQueryLocale` 加 `.toLowerCase()` 让 `?locale=EN` / `?locale=en-US` 都接受；与 `@nuxtjs/i18n` BCP 47 lowercasing 对齐 |
| **audit suggest 1** test.describe 嵌套 test.use 冗余清理 | `0903f06`（refactor(platform)） | `apps/platform/tests/e2e/admin-roles.e2e.test.ts` 嵌套 test.use 删除（父级已声明）；0 行为变更 |
| **audit suggest 2** 空 beforeAll 钩子清理 | `b6d8539`（refactor(platform)） | `apps/platform/tests/e2e/credentials/[id].test.ts` 空 beforeAll 直接删除；0 行为变更 |

#### M21.4 B3 PR 自动合并闭环（mergify 模板 + auto-merge guide）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **mergify 模板扩展** | `f1dd5df`（docs(guide)） | `.github/mergify.yml` 模板按 dependabot / dependfix PR 规则配置 auto-merge 条件 + author 限制（仅 `dependabot[bot]` / `dependfix[bot]` / `123+dependfix[bot]` 命中；`CaoMeiYouRen` 不命中） |
| **auto-merge.md + README** | `beea5b9`（docs(guide)） | `docs/guide/auto-merge.md` 指南（启用步骤 + mergify 配置说明 + 安全注意事项 + 危险场景示例：依赖大版本升级 / breaking change / CI 覆盖不足 / 重复 PR / author 劫持） |
| **audit W1 vitepress sidebar 注册修复** | `c9939cb`（fix(docs)） | audit round 1 Reject 后修复：`docs/.vitepress/config.ts` sidebar 注册 `docs/guide/auto-merge.md`（之前漏注册） |

#### M21.5 T704 async 定时触发 + Schedule CRUD e2e 补强 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **schedules CRUD e2e 6 case** | `9850e24`（test(platform)） | `apps/platform/tests/e2e/schedules.e2e.test.ts` 新建（创建 / 列表 / 详情 / 更新 / 删除 / 触发 / 重复创建同名 / 并发触发 / 失败 schedule 状态流转）；e2e 强制 sync 降级（playwright.config.ts:36 NUXT_QUEUE_ENABLED=false）走 sync 路径 |
| **BullMQ upsertJobScheduler 短间隔集成测试** | `b9e35f7`（test(platform)） | `apps/platform/server/services/scheduler/scheduler.integration.test.ts` 新增（describe.skipIf(!enabled) 门控 + TEMP_REDIS_INTEGRATION=true 启用 + 进程内集成模式 + 随机 id 幂等） |

### 阶段验收标准（M21 全部 4 子阶段闭环 ✅）

- [x] **M21.1 RG-W01 + RG-W02** —— 2 处 execSync 替换为 execFileSync + 参数数组；既有测试不回归；本地 grep 实证 0 处 execSync 模板拼接
- [x] **M21.2 W1 + W2 + S1 + S2** —— W1 stageAndCommit `--local` flag 路径回归；W2 `?locale=EN` 大小写兼容；S1 test.describe 嵌套 test.use 冗余清理；S2 空 beforeAll 钩子清理；engine vitest 1061 passed + platform vitest 919 passed + playwright admin-roles 15 passed
- [x] **M21.4 mergify + guide + audit W1** —— mergify 模板通过 yaml.safe_load 语法 OK + author 正则覆盖实测；auto-merge.md 涵盖 mergify 安装 / 配置 / 启用条件 / 危险情况 6 项；vitepress sidebar 注册修复
- [x] **M21.5 schedules e2e + BullMQ** —— playwright e2e 6 case × 2 次连跑无 flaky；BullMQ 集成测试 describe.skipIf 门控 + 进程内模式
- [x] `pnpm lint` / `pnpm typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— engine 1061 passed + platform 919 passed + playwright 6 passed × 2 连跑
- [x] `pnpm check:docs` 全过 —— 103 md + 58 vue-interp OK
- [x] 编号标记扫描 0 命中
- [x] CI 端到端裁决通过 —— 15 commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：**15 commits**（M21.1 2 + M21.2 4 + M21.4 3 + M21.5 2 = **11 atomic commits 实施** + M21 文档收口 4：`a8604c6` M21.1+M21.2 标记 / `d66b11d` M21.3 重复登记清理 + backlog §S-5 闭环迁移 / `6516e34` M21.4 标记 / `cbcb15d` M21.5 标记）
- **测试覆盖**：engine vitest 1061 passed + 1 skipped（M21.1 + M21.2 W1 回归）+ platform vitest 919 passed + 4 skipped（M21.2 W2 大小写兼容 + S2）+ playwright admin-roles 15 passed（M21.2 S1）+ playwright schedules 6 case（M21.5）+ BullMQ 集成测试（M21.5）
- **审计覆盖**：M21.1 + M21.2 standard depth Pass / M21.4 standard depth 1 轮（含 1 个 W1 vitepress sidebar 注册修复）/ M21.5 standard depth Pass（2 warning 已修：W1 todo 同步勾选 + W2 removeJobScheduler finally 化 + 2 suggest 登记 backlog：S1 trigger happy path / S2 pattern 覆盖断言）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0

### 关键决策

- **M21.3 重复登记删除**：M21.3 段原计划抽取 `setTestEncryptionKey(key)` helper 部分**无真实用例需求**（grep `vi.stubGlobal.*encryptionKey` / `useRuntimeConfig.*encryptionKey` 自定义调用 = 0 命中），属 over-engineering；S-5 已由 M18.x commit `878ae1a` 闭环；M21 P 阶段规划批次删除 M21.3 段并迁 backlog 历史归档指针段（backlog 维护规则 5 追溯执行）
- **M21.4 mergify 模板扩展而非全新**：复用既有 `.github/mergify.yml` 模板按 dependabot / dependfix PR 规则扩展 author 正则覆盖——不发布 mergify action，不修改 dependfix 自身 PR 提交流程
- **M21.5 e2e 同步降级**：playwright.config.ts:36 `NUXT_QUEUE_ENABLED=false` 强制 sync 路径（避免 CI 环境 BullMQ 等待不稳定；真实 async 测试由 BullMQ 集成测试 `describe.skipIf` 门控覆盖）
- **M21.1 命令注入修复路径**：execSync → execFileSync + 参数数组（标准 npm:child_process 安全用法）；不引入新依赖；既有测试不回归

### 阶段关键经验（已沉淀至项目知识库）

- **命令注入修复模式（M21.1 实证）**：execSync 模板拼接 → execFileSync + 参数数组（标准 npm:child_process 安全用法）；既有测试不回归 + grep 实证 0 处剩余 execSync 模板拼接
- **vitest stubEnv 隔离模式（M21.2 W1 实证）**：`vi.stubEnv` + `vi.unstubAllEnvs` 隔离 process.env 副作用；避免影响其他并行测试
- **vitepress sidebar 注册完整性（M21.4 audit W1 实证）**：新增 `docs/guide/*.md` 必须同步注册到 `docs/.vitepress/config.ts` sidebar；audit 阶段独立核验避免漏注册导致 vitepress build 隐式失败
- **playwright e2e sync 降级 + BullMQ 集成测试分离（M21.5 实证）**：CI 环境稳定性优先——e2e 走 sync 路径（避免 BullMQ 等待），BullMQ async 测试走 `describe.skipIf(!redisAvailable)` 集成测试模式；与 M16.5 / M19.4 模式一致

### 待迁移经验（next neat-freak 候选）

- **M21.5 2 suggest 登记 backlog**：S1 trigger happy path（playwright schedules 触发后状态流转断言可加强）/ S2 pattern 覆盖断言（BullMQ 集成测试可加更细粒度的 cron pattern 覆盖）—— 后续批次治理
- **M21.4 mergify 模板作者归属校验**：当前 author 正则覆盖 `dependfix[bot]` / `123+dependfix[bot]`；未来 dependfix bot 改名 / 增加其他自动修复工具时需同步更新正则——候选下批次会话处理

---

## M20: ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M19 闭环后实测反馈——`nuxt-latest-template` 在最近一次扫描 0 告警，但 alerts 视图仍显示 7 条历史"未处理"告警（出现次数 7）。根因：ScanResult 当前是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，导致上游已关闭的告警永远残留。按依赖关系拆 **5 子阶段独立闭环**：M20.1 引擎侧 upstreamId 注入 / M20.3 ScanResult 实体升级 + reconcile 函数 / M20.5 API 简化 + dashboard 调整 / M20.6 UI 调整 + i18n / M20.7 一次性 backfill 脚本。
> **阶段边界**：M20 严格遵循 [规划规范 §1.1 任务粒度约束](../../standards/planning.md)（≤5-6 项硬上限）；M20.3 ScanResult per-alert 模型重构是本阶段核心，M20.5-M20.7 均依赖 M20.3 实体升级。
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
> **阶段边界**：M19 严格遵循 [规划规范 §1.1 任务粒度约束](../../standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更（仅 max-repos 上限参数）；不破坏既有 PAT / AuthProvider / GitHub App / viewer role check 等机制。
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
| **M19.x 收口** | `ae33671`（docs(refactor)） | 移除本次提交引入的孤立编号（M19.x → todo.md §M19.x）；编号标记扫描 0 命中（防御 [开发规范 §3 注释规范](../../standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md)） |

### 阶段验收标准（M19 全部 5 子任务闭环 ✅）

- [x] **M19.1 C34 存量规范挂接盘点** —— 8 个必查项补充到 code-reviewer skill + code-quality-checklist + 双向挂接完整；`pnpm check:docs` 通过（101 md + 57 vue-interp）；`pnpm --filter dependfix-docs build` 通过
- [x] **M19.2 C23 发现规模上限 max-repos** —— `packages/engine/src/discovery/` 实现 `maxRepos` 参数 + CLI/Action/Platform 三入口暴露 + 单测覆盖；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过
- [x] **M19.3 B1 PR 关闭评论 + label** —— 当同一仓库存在未合并修复 PR 时新 PR 含评论 + `duplicate` label；GitHub API 调用 `issues: write` 权限端点；单测试覆盖：重复场景评论 + label / 非重复场景不操作；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed
- [x] **M19.4 T701-e2e 管理端点集成测试补强** —— 3 个 e2e 文件（users 6 + credentials 19 + repos 25 = 50 case）覆盖用户管理 / 凭据管理 / 仓库管理端点 API 集成；mock 数据不依赖真实 GitHub API；playwright CI 环境稳定无 flaky；`pnpm typecheck` 7 包全 Done / `pnpm lint` 全通过
- [x] **M19.5 C8 per-source 错误隔离** —— 模拟单源失败（Dependabot API 超时），其他源结果正常返回；返回结构 `FixError.source` 字段含失败源名称 + 错误信息；CLI 输出警告信息；单测覆盖：单源失败 / 全部成功 / 全部失败；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2510 passed
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 2510 passed（M19.5 实测 baseline）
- [x] `pnpm check:docs` 全过
- [x] 编号标记扫描 0 命中
- [x] CI 端到端裁决通过 —— 5 atomic commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：5 atomic commits（M19.1 + M19.2 + M19.3 + M19.4 + M19.5）+ 配套 commits（M19 规划 `2f9eb38` / M19 任务详情 `bee5c3f` / M19.4 标记完成 `61b3ddc` / M19.5 标记完成 `4231ffb` / M19.x 收口 `ae33671`）+ cron-preview 时区修复 `3597dcf` + cron-preview backlog 登记 `52d1649` —— 共 ~12 commits 落地（M19 批次主线 5 + 配套 5 + 顺带 2）
- **测试覆盖**：vitest 2495 → 2510 passed（M19.2 baseline 2495 + M19.3 +9 case + M19.5 +6 case + M19.4 e2e 50 case 单独累计）；playwright e2e 新增 50 case（users 6 + credentials 19 + repos 25）
- **审计覆盖**：M19.1 quick / M19.2 standard（含 1 blocker + 3 warning 全部修复）/ M19.3 standard（2 warning 全部修复）/ M19.4 quick（含 1 blocker + 3 warning 全部修复）/ M19.5 standard（2 warning 修复 1 项 + 1 项登记 P3）—— 5 轮独立 Review Gate Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0

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

- **M19.5 pnpm-audit 单源文案优化**（P3 follow-up）：当前警告文案 "pnpm-audit source failed" 不够友好（缺详细失败原因）—— 后续批次优化为 `pnpm-audit: <error.message>` 格式；与 M18.x FixError 字段模式一致
- **M19.4 e2e fixtures 复用**（P3 follow-up）：M19.4 实施时新建 `users-api.e2e.test.ts` 等 3 个新 e2e 文件 —— 后续批次可考虑抽取 fixtures helper（如 `apps/platform/tests/e2e/helpers/api-roles.helper.ts` 统一封装 viewer/admin/org_admin 三角色 mock），与 M17.5 `authedCookieHeader` 抽取同源策略
- **M19.x 收口 commit 风格一致性**（P3 follow-up）：M19.x 收口 `ae33671` 是 refactor 类型 commit + 编号清理 —— 与 M14.x `b45f55e` git.md 双空行格式修复 + `84b4e1a` test 名孤立编号清理同模式（neat-freak 批次顺手处理）；建议统一为 `chore(refactor)` 类型而非 `docs(refactor)` —— 类型分类微调不影响 commit 内容
- **M19 backlog 候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）—— 详见 [backlog.md](backlog.md) §短期 / 一次性候选任务