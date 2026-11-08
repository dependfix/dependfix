# 待办归档分片：M55 1.0.x 修复有效性与执行边界收口

> 本分片由 2026-11-08 M55 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划与收口口径，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m55.md](roadmap-phases-m55.md)。

---

> **归档摘要**：5 原子全部闭环（M55.1 版本化 override 生效校验 / M55.2 运行预算夹取与双跑收敛 / M55.3 失败路径可观测性 / M55.4 仓库级执行预算与超时 / M55.5 仓库级跨 major 开关）+ 1 批候选登记（PR Check 生命周期状态与结论筛选，不占阶段编号）。阶段窗口首父链 **32 commits**、唯一 diff **83 文件 / +2636 −190**（`git rev-list --first-parent --count 1e6a662c^..HEAD` / `git diff --shortstat 1e6a662c^..HEAD`，2026-11-08 实测，含依赖与基线重建）。
> **推送终态（2026-11-08）**：阶段内全部 commit 已推送，`origin/master` = `7e42c891`，`git rev-list HEAD ^origin/master --count` = 0。
> **证据来源**：[执行期缺陷修复与 CI 读数](#阶段收口-2026-11-08)；设计口径见 [仓库级执行预算与超时配置设计](../../design/governance/repo-execution-limits.md)。

## M55: 1.0.x 修复有效性与执行边界收口（2026-11-08 规划 / 2026-11-08 归档）

> **阶段目标**：闭环 1.0 发布后真实批量运行暴露的三类引擎缺陷（升级判定失效、运行预算失控、失败不可归因），并把「仓库级跨 major 授权」与「仓库级执行超时」两个用户明确需求落到平台可配置面。
> **用户决策（2026-11-08）**：选方案 A（引擎修复有效性优先）；追加两项平台需求——仓库级 `allowMajorUpgrade` 开关、仓库级执行预算与超时配置。
> **容量基线**（测量方：执行角色，P 阶段预估；分母供 [§3.1.1](../../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 再平衡使用）：5 原子 / 20-26 commits / 53-60 文件 / 2950-4400 行（= 各原子「交付物」逐条求和，含 M55.4 批 0 的文档迁移 commit）；较 M54 基线（10-16 commits / 28-41 文件）显著上升，原因是两项平台需求属用户明确追加；不设倍数口径（区间取端会产生歧义）；执行期插队批次累计 ≥3 时触发容量再平衡。
> **实测容量**：32 commits / 83 文件 / +2636 −190（唯一 diff 口径，[§4.4 第 25 条](../../standards/planning.md#_4-4-大批量归档批次操作规范)）；插队 **0 批**（用户 2026-11-08 追加需求在规划阶段并入，不属执行期插队），未触发再平衡。
> **执行顺序**：M55.1 → M55.2 → M55.3 → M55.4 → M55.5。M55.4 复用 M55.2 的验证命令超时透传与 M55.3 的执行器 / 编排日志面；M55.5 依赖 M55.4 的 create/update schema 拆分与仓库表单区。
> **上游证据**：批量运行失败复盘证据——`runs-logs-20261101-062859.txt` 第 1 页 50 条运行 + `runs-logs-20261030-000646.txt` 第 1 页 10 条运行（平台运行日志导出，执行角色采集；对应候选正文已随上收从 backlog 移除，关键读数已按原子内联）。

### M55.1 [P1 🛠️] 版本化 override 生效校验与交付展示同源（**已闭环** `d7f7b5f2` + `7f2c28f4` + `3cdb99a9` + `06f6b580` + `c296345b`）

- **目标**：版本化 overrides 修复路径在「父级限定键遮蔽通用键」与「peer-only 实例」两种真实形态下不再被判成 `override did not take effect` 后回滚；PR 正文与报告如实展示来源版本与升级策略。
- **优先级**：P1（修复成功率与审计误导性）。
- **范围**：引擎改写与校验 `packages/engine/src/fixers/dependency/index.ts`（`438-470` 改写、`334` 校验消息）；数据记录 `packages/engine/src/app/repo-fix.ts`（`fromVersion` / `strategy` 真实旧值，`334-470`）、`repo-fix-batch.ts:106`；渲染 `packages/engine/src/github/pr-creator.ts`（策略映射 `650-663`、聚合回填 `522-528`）、`packages/core/src/report/markdown-generator.ts:236` / `:481`；测试 `fixers/dependency/*.test.ts`、`repo-fix*.test.ts`、`pr-creator.test.ts`、`markdown-generator.test.ts`。
- **验收标准**：
  1. 构造「父级限定键 + 通用键」仓库 → 通用键升级后全部实例达标，或报告明确标注被哪条 scoped 键遮蔽（不得静默回滚）。
  2. 构造 peer-only 仓库 → 升级成功，或给出可判定的 `manual review: peer-only` 结论且不计为 failed action。
  3. PR 正文与报告 `From` 列非空或显式 `—`，`Strategy` 不再显示 `direct`（`versioned-override` 独立文案，两处同源）。
  4. 同一包先空值后真值的动作序列 → 聚合行 `fromVersion` 取首个非空值。
  5. 直接依赖 manifest 升级路径行为不回退（`pr-creator.test.ts` 既有断言仍绿）。
  6. 三条判定（父级 scoped 键遮蔽 / peer-only 实例 / 校验失败消息归因）的新增守卫经 ≥3 个 mutation 击杀（工件落 `artifacts/review-gate/`）。
- **不做什么**：不改 overrides 写盘位置、提交面白名单与修复语义；不为填 `From` 新增独立 lockfile 解析器或第三方依赖（复用既有 `readLockfileVersions`）；不改跨 major 准入规则（由 M55.5 处理）。
- **依赖**：1.0.0 已发布（`v1.0.0`）；backlog 两条同域候选（生效校验 + 展示口径）合并上收；无前置代码改动。
- **交付物**：4-5 commits / 约 14 文件 / 500-700 行；文档增量 = PR 模板与报告口径说明 + 跳过原因分类学两处（`run-failure-taxonomy` / `alert-outcome-writeback`）。
- **风险与缓解**：改写父级 scoped 键可能动到用户既有配置 → 只改「同包且仍低于目标版本」的键，写前留 diff 审计；peer-only 判定误报 → 保守返回 `manual review` 并保留工作区，不整仓回滚。
- **执行记录（2026-11-08）**：① 父级限定键——`d7f7b5f2` 让同包目标提升时把父级 scoped 键按版本线一并提升（只动仍低于目标的键）；② peer-only——`7f2c28f4` 识别 peer-only 实例并按跳过归因，`06f6b580` 平台跳过原因展示补 `peer-only` 文案；③ 展示同源——`3cdb99a9` 让 `fromVersion` / `strategy` 取真实旧值与 `versioned-override` 文案，PR 正文与报告两处同源；④ 口径同步 `c296345b`。证据：engine + core 定向与全量 **2127 passed**；mutation **5/5 击杀**（工件 `artifacts/review-gate/2026-11-08-m55-1-mutation.md`）；审计 R1 **Reject**（4 blocker）→ R2 **Pass**；CI run `42442997662` success。

### M55.2 [P1 🚀] 运行预算夹取与双跑成本收敛（**已闭环** `97d92c0b` + `a753e2fd`）

- **目标**：每个验证步骤都受剩余运行预算约束；「有告警但 0 写入」的运行不再采样基线或跑完整后验证；「基线已红」的命令不在 quick-verify 重复执行。
- **优先级**：P1（预算耗尽导致 0 产出；4 个 run 实证——2026-10-30 `momei` / `rss-impact-server`、2026-11-01 `momei` / `rss-resources-download`；单位 = run；测量方 = 执行角色；来源 `runs-logs-*.txt` 第 1 页）。
- **范围**：预算夹取 `packages/engine/src/app/verify-project.ts:177`（基线链按剩余预算分配命令超时）、`packages/engine/src/helpers/index.ts:92-107`（`quickVerifyProject` 接入 `budgetAllows` 与基线跳过）；双跑收敛 `packages/engine/src/app/repo-fix.ts:143` 与 `repo-fix-finalize.ts:45`（`hasWork` 判据改「实际写操作 / 待执行修复数 > 0」）、`result-assembly.ts` 与后验证调用点（0 写入短路）；报告跳过类单列（复用 `BUDGET_EXHAUSTED`，不新增类别）。
- **验收标准**：
  1. 构造「基线 install 卡满 10 分钟」仓库 → 基线链在剩余预算内收尾并单列跳过项，不再触发 `execution_timeout`。
  2. 构造「有告警但全部跨 major 且未授权」仓库 → 跳过基线采样（`hasWork=false`），不付完整验证链成本；**后验证链短路未在本原子实现**（与零告警仓库的 `verificationPassed` 成功信号冲突，需三态门禁另立项，已登记 backlog）。
  3. 构造「基线 lint 已红」仓库 → quick-verify 不执行该命令，且不因它回滚正确的升级。
  4. 跳过项必须进报告单列（含原因与命令），不得只留日志。
  5. 同仓库同规模告警的前后耗时对照记录到工件。
  6. 预算跳过仍不交付、不回滚（沿用 M51.4 / M51.5 语义）。
- **不做什么**：不降低验证链覆盖面（跳过仅限基线已红命令）；不解决 Nuxt 仓库 lint OOM 根因（`prepare` 前置另条）；不改 30 分钟单仓默认上限（M55.4 处理）。
- **依赖**：M55.4 批 1 会改同一批文件（`commandTimeoutMs` 透传），故本原子先执行；与两条候选合并上收——「基线采样与 quick-verify 不夹剩余运行预算」+「修复前基线与修复后验证的双跑成本收敛」。
- **交付物**：3-4 commits / 约 7 文件 / 400-600 行；文档增量限验证链口径说明。
- **风险与缓解**：跳过判定放宽会掩盖真实新失败 → 只跳过「基线已红」命令、报告单列，并在同一节披露「竞态下可能漏检的失败类型」；「有写入但全部回滚」被误判 0 写入 → `hasWork` 以实际写操作计数为判据，回滚单元单独留痕。
- **执行记录（2026-11-08）**：`97d92c0b` 让基线链按剩余预算收缩命令超时、quick-verify 加预算门并跳过「基线已红」命令、全部跨 major 且未授权时跳过基线采样；`a753e2fd` 收口并把「0 写入运行的后验证短路」登记 backlog（`verificationPassed` 三态门禁）。证据：定向 `quick-verify-budget` 5 例 + `member-upgrade` 13 例；全量 engine **1867 passed**；审计未单独发起（随 M55.3 前的人工全量验证合并执行）。

### M55.3 [P1 🛠️] 失败路径可观测性（日志持久化 + 导出归因）（**已闭环** `db5b887e`）

- **目标**：任何 `failed` 运行都保留可归因的执行日志；日志导出包含错误码、失败阶段与资源摘要，离线复盘不再出现「（无执行日志）」。
- **优先级**：P1（失败无法归因；2 个 run 实证——`sharp-cloud-uploader` 同页两条 `failed` 运行导出均为「（无执行日志）」；单位 = run；测量方 = 执行角色；来源 `runs-logs-20261101-062859.txt` 第 1 页）。
- **范围**：执行器 `apps/platform/server/services/executor/container-executor.ts:405-433`（`push_failed` / `pr_creation_failed` 返回补 `logsJson`）；编排 `apps/platform/server/services/scan-orchestrator.service.ts:488-515`（catch-all 的 `logsJson` 提到 try 外或从执行结果回填）；导出与详情 `apps/platform/server/api/runs/logs-export.get.ts:32-45`（错误码 / `failureStage` / `failureKind` / `resourceJson` 摘要）、`apps/platform/server/api/runs/[id].get.ts` 与 `app/components/run-detail-dialog.vue` 回显同一摘要；测试 `container-executor.test.ts`、`scan-orchestrator*.test.ts`、`runs-logs.test.ts`。
- **验收标准**：
  1. 构造 push 失败 → 运行详情与导出均能看到执行日志与 `errorJson.code`。
  2. 构造 reconcile 抛错（catch-all）→ 日志不丢失且带失败码。
  3. 导出含一条 `execution_timeout` 运行 → 文件里可见错误码与阶段。
  4. 无日志运行 → 导出显示失败归因而非空白。
  5. 导出体积上限与脱敏行为不回归（`MAX_EXPORT_BYTES` 断言仍绿）。
- **不做什么**：不改失败分类口径与错误码集合；不新增日志采集通道；不在导出中写完整正文之外的重复内容。
- **依赖**：M54 已落地的 `errorJson` / `resourceJson` 字段；与「运行日志导出缺失败归因字段」「失败路径丢弃执行日志」两候选合并上收。
- **交付物**：2-3 commits / 5-6 文件 / 250-400 行；文档增量限日志导出格式说明。
- **风险与缓解**：`logsJson` 体积增大影响导出上限 → 只追加摘要字段，正文不重复；catch 回填引用已失效变量 → 在 `try` 外持有可变引用，并由用例锁定「抛错路径仍有日志」。
- **执行记录（2026-11-08）**：`db5b887e` 让交付失败与编排 catch-all 保留 `logsJson`，导出追加失败归因行；平台定向 **214 passed** + 新增导出用例 2 例；`lint:check` 0 error / 11 存量 warning。

### M55.4 [P1 🚀🛠️] 仓库级执行预算与超时配置（含 PUT 部分更新修复）（**已闭环** `fff41d00` + `57c7eabe` + `5022eaa9` + `5959e1ab` + `0a1b2287` + `8e8d68f5` + `52f6ad45` + `68330816` + `af09a4f2` + `c3423838` + `332a0c97` + `aa58800f` + `9e264010` + `7831d965` + `b8394937` + `ded9fcf4` + `5472bea5` + `f1b3aff3`）

- **目标**：四个超时（执行上限 / 验证命令 / 安装 / clone）支持仓库级覆盖与平台封顶，生效值可见、越界可判、变更可审计；同步修复 `repositoryUpdateSchema.partial()` 注入默认值导致的 PUT 静默重置。
- **优先级**：P1（慢仓库拖垮整平台默认值；新列落库前必须先修 schema）。
- **范围**（按 [设计稿](../../design/governance/repo-execution-limits.md) §13 分批；批 0 为本计划新增的设计稿外前置，故为三批）：
  - **批 0（预算前置，独立文档 commit）**：`docs/standards/platform.md` §10.6 外移到 [executor-process-isolation.md](../../design/governance/executor-process-isolation.md) §9，主文档留摘要 + 指针。**已完成（2026-11-08）**：platform.md 29,744 → 27,097 字符（腾出 2,647），引用更新 7 处（guide zh/en、configuration zh/en、检查点矩阵、queue-stale-recovery、platform-notification）；`gates:docs` 20 项通过。
  - **批 1（4a，分 4 个提交片，每片独立验收点）**：
    - **4a-1 数据与契约**：`entities/repository.ts`、`entities/scan-run.ts`、`database/migrations/3000000000000-AddRepositoryExecutionLimits.ts`、`database/index.ts`、`schemas/repository.ts`（create / update 拆分）、`utils/execution-limits.ts`（新）+ schema 单测 → AC2 / AC7。**已完成（2026-11-08）**：五个可空列与解析单一事实源落地；update 走无默认字段基线，PUT 只改 note 不再重置执行器；契约冻结清单同步（CI 首轮因 DB 清单缺列红，已修复并复跑通过）。
    - **4a-2 执行面**：`services/scan-orchestrator.service.ts`、`services/executor/container-executor.ts`、`services/queue/scan-worker.ts`、`services/batch/stale-cleanup.ts`、`plugins/stale-cleanup.ts`、引擎 `app/index.ts` / `app/helpers.ts` / `app/verify-project.ts` / `helpers/index.ts` + 定向单测 → AC1 / AC3 / AC4 / AC4b / AC5 / AC6。**已完成（2026-11-08）**：编排启动前解析并落快照、executor 按有效上限构造、worker 锁改封顶值、stale-cleanup 逐 run 精判、验证命令超时透传；CI 两轮修复（DB 契约清单缺列、源码注释阶段编号）。
    - **4a-3 API / 审计 / 只读端点**：`api/repos/{index,[id]}.ts`、`api/settings/execution-limits.get.ts`（新）、`services/repository-audit.ts` + 单测 → AC2 / AC9 / AC10。**已完成（2026-11-08）**：写入闸门含封顶 400、仅变化时登记 `execution_limits_update`、只读端点返回生效值与封顶值；CI 修复只读端点用例的严格类型断言。
    - **4a-4 前端 / i18n / 文档**：`app/components/repo-form-dialog.vue`、`app/types/platform.ts`、`i18n/locales/{zh-CN,en-US}.json`、`standards/platform.md §10.5` / `guide/configuration.md` + 组件测 + e2e → AC8 / AC11。**已完成（2026-11-08）**：执行预算折叠区（分钟输入、留空继承、占位取自只读端点、覆盖摘要）；`platform.md` §10.5 / §11、`configuration.md`、`queue-stale-recovery.md` 口径同步；e2e 在 4b 收口补一条。
  - **批 2（4b）**：`fixers/install-timeouts.ts` 覆盖参数、clone 值透传、设置页「当前运行限制」只读卡片、剩余 i18n → AC12。**已完成（2026-11-08）**：安装超时以运行级覆盖（入口设置 / 结束清除，四处底层调用自动消费）；clone 超时随执行器构造透传；设置页只读卡片（五个数值，来自只读端点）；e2e 覆盖折叠区填值 → 落库毫秒 → 编辑回显分钟；设置页与仓库弹窗视觉基线同步重建。
- **验收标准**（设计稿 AC1-AC9 + AC4b；AC10-AC12 为本计划补充。映射：批 0 → AC11；4a-1 → AC2 / AC7；4a-2 → AC1 / AC3 / AC4 / AC4b / AC5 / AC6；4a-3 → AC2 / AC9 / AC10；4a-4 → AC8 / AC11；4b → AC12）：
  1. **AC1** 仓库配 45 min → 编排层传入 `timeoutMs=2700000` 且日志 `source=repo`。
  2. **AC2** 仓库值 > 封顶 → 400 且不落库。
  3. **AC3** 封顶下调后存量配置运行期截断并 `warnings` 非空。
  4. **AC4** 60 min 运行在 40 min 不判孤儿、30 min 运行判孤儿。
  5. **AC4b** 执行抛错路径 `scan_run.executionTimeoutMs` 快照仍为仓库值（启动前写入）。
  6. **AC5** 锁参数与封顶同源（既有同源单测改断言）。
  7. **AC6** 三个验证调用点（基线 / 后验证 / quick-verify）均按仓库值生效。
  8. **AC7** `github-action` 仓库 PUT `{ note }` 后 `executorKind` 与四个超时不变。
  9. **AC8** 前端可设置 / 继承 / 越界拦截 + 一条 e2e（折叠 → 填值 → 保存 → 重开回显）。
  10. **AC9** 审计 `execution_limits_update` 仅在实际变化时产生。
  11. **AC10** `GET /api/settings/execution-limits` 返回解析后的四个生效值与封顶值；未配置时返回全局默认；无写入口。
  12. **AC11** `pnpm run check:doc-governance` 不因 `platform.md` 超 30,000 字符阻断。
  13. **AC12** 安装与 clone 超时按仓库值生效（单测断言 `resolveInstallTimeoutMs` 的 override 参数与 clone 透传值）。
- **不做什么**：不放开 24 小时级上限（封顶 `[30min, 240min]`）；不做「全局超时 UI 写 env」；不改验证链条数与顺序；批量导入不支持超时字段（设计稿开放问题 3 保持）；不改 CLI `--commands` / `--timeout` 语义。
- **依赖**：M55.2（同文件 `commandTimeoutMs` 透传）、M55.3（同文件执行器 / 编排日志面）先完成；设计稿 D1-D3 已定稿（2026-10-30 用户裁定）。
- **交付物**：8-10 commits / 约 24-28 文件 / 1300-1900 行（批 0 1 commit、4a-1~4a-4 共 6-7 commits、4b 1-2 commits）；文档增量 = `platform.md` §10.5 / §11、`configuration.md`、`queue-stale-recovery.md`、`deployment.md`、设计稿状态行。
- **风险与缓解**：锁窗口由 30 min 抬到封顶值 → `lockRenewTime = 封顶/2`，`stalled` 事件保留 `runId`，文档标注恢复延迟代价；`stale-cleanup` 逐 run 判定引入回归 → 保留「下界查询 + JS 精判」两步结构并补 AC4；`platform.md` 阻断 → 批 0 先外移；实体与迁移不一致 → `schema-guard.test.ts` 校验；新列被 PUT 清空 → schema 拆分先于落列（D3）。
- **执行记录（2026-11-08）**：批 0 `fff41d00`（`platform.md` §10.6 外移，字符 29,744 → 27,097）；4a-1 `57c7eabe`（四列 + `scan_run` 快照列 + migration `3000000000000` + `execution-limits` 解析单一事实源 + create/update 拆分）；契约 `5022eaa9`（CI 首轮 Test + Docker QA 同源红：DB 契约清单缺新列）；4a-2 `0a1b2287`（编排解析并落快照、executor 按有效上限构造、worker 锁改封顶值、stale-cleanup 逐 run 精判、引擎三处验证调用统一按仓库值）+ `8e8d68f5`（清理源码注释阶段编号）+ `52f6ad45`（进度登记）；4a-3 `68330816`（写入闸门含封顶 400、仅变化时登记审计、只读端点）+ `af09a4f2`（只读端点用例严格类型断言）；4a-4 `332a0c97`（仓库表单执行预算折叠区）+ `aa58800f`（视觉基线重建）+ `9e264010`（英文指南同步执行封顶行）+ `c3423838`（口径同步）；4b `7831d965`（安装类命令超时按仓库配置生效）+ `b8394937`（设置页只读卡片 + e2e）+ `ded9fcf4`（设置页视觉基线）；收口 `5472bea5` / `f1b3aff3`。证据：`repos` / `schemas` / `orchestrator` / `database` 定向 **469 passed**；e2e 执行预算用例 1 passed；`lint:check` 0 error / 11 存量 warning；`typecheck` 7 包；视觉基线重建并目检。

### M55.5 [P2 🚀] 仓库级跨大版本升级开关（`allowMajorUpgrade`）（**已闭环** `2d671da3` + `808cd651` + `e929c95b` + `7e42c891`）

- **目标**：平台侧按仓库手动开启跨 major 升级（默认关闭）；开启后仍走完整修复流程、强制验证链与失败自动回滚，且开关状态与跳过原因可归因。
- **优先级**：P2（2026-11-06 用户明确需求）。
- **范围**：配置面 `apps/platform/server/services/scan-orchestrator.service.ts:301`（硬编码 `false` → 仓库配置）、`entities/repository.ts` + 迁移（boolean，缺省 `false`）、`schemas/repository.ts`（并入 M55.4 拆分后的 create / update 结构）；写入与审计 `api/repos/{index,[id]}.ts`、`services/repository-audit.ts`（`major_upgrade_policy_update`）；前端 `app/components/repo-form-dialog.vue`（开关 + 风险说明）、`i18n/locales/{zh-CN,en-US}.json`；引擎透传 `packages/engine/src/app/index.ts` 与 `scan-orchestrator` 调用点；可观测性：运行详情 / 报告标签区分「默认关闭」与「开关关闭」+ `cross-major` 跳过计数；测试 `scan-orchestrator*.test.ts`、`repository-schema.test.ts`、组件测 + e2e。
- **验收标准**：
  1. 开关默认关闭 → 跨 major 告警维持 `skipped` + `cross-major` 计数 + 人工处理标签，行为与 M46.2 披露一致。
  2. 手动开启 → 满足准入条件（根 `package.json` 直接依赖 + lockfile 单版本）的告警进入升级链，install / lint / build / typecheck / test 完整执行、失败自动回滚。
  3. 非管理员修改返回 403。
  4. 审计 `major_upgrade_policy_update` 仅在实际变化时产生（含前后值）。
  5. 运行详情能区分「默认关闭」与「开关关闭」两种跳过原因。
  6. e2e：仓库表单开关 → 保存 → 重开回显 + 一次真实运行标签可见。
  7. 间接依赖 / 多版本共存仍维持人工口径（不上收）。
- **不做什么**：不改默认值（保持关闭）；不绕过验证链或回滚；不为 GitHub Action 增加隐式跨线通道（Action 仍无 input / env 通道）；不放宽间接依赖与多版本共存人工口径；不改 CLI / MCP 既有语义。
- **依赖**：M55.4（create / update schema 拆分、仓库表单「执行预算」区、审计模式）先完成；backlog 候选「仓库级 `allowMajorUpgrade` 开关」上收。
- **交付物**：4-5 commits / 10-12 文件 / 600-900 行；文档增量 = `platform.md` §6 或 §10 新增策略段、`configuration.md`、`docs/guide/` 使用说明。
- **风险与缓解**：跨 major 升级失败率高 → 默认关闭 + 完整验证 + 自动回滚不变，PR 正文强制风险提示；准入放宽误伤 → 仅放宽「显式授权」一层，间接依赖仍人工；开关与 PUT partial 交互 → 复用 M55.4 的 update schema 守卫（AC7 同款用例覆盖新字段）。
- **执行记录（2026-11-08）**：`2d671da3` 授权列 `allow_major_upgrade`（默认 `false`）+ 迁移 `3000000000001`、schema 布尔（update 不注入）、API 视图 / 写入 / 审计 `major_upgrade_policy_update`（仅变化）、编排层透传取代硬编码 `false`、表单开关 + 风险说明 + e2e 回显；`808cd651` 补仓库级跨大版本授权策略（`platform.md`）；`e929c95b` 更新跨大版本开关的弹窗视觉基线；`7e42c891` 收口。证据：`repos` / `schemas` / `orchestrator` / `database` 定向 **469 passed**；e2e 执行预算 + 开关用例 1 passed；`lint:check` 0 error / 11 存量 warning；platform `typecheck` 0 error；契约清单同步可空列。CI：Test 绿；CodeQL 两次失败均为 GitHub 下载 CodeQL bundle 504（基础设施，非代码问题，待下次 push 重新触发）。

### 候选登记（不占阶段条目编号）：PR Check 生命周期状态与结论筛选（2026-11-08）

- **触发**：用户对 `/pr-checks` 页截图提出三点——① 已关闭的 PR 也应有对应状态；② 筛选支持按结论；③ 按作者筛选理论需要但绝大多数是 Dependabot，暂延后。
- **评估结论**：仅登记 [backlog](../backlog.md)（不入 `todo.md`、无阶段编号）；根因已核——`polling-source.ts:34/66-70` 只拉 `state: open`，实体无生命周期列，`summary.get.ts:34` 的 firing 计数含关闭 PR；`index.get.ts:28/37-39/61-62` 已有 `conclusion` 参数但前端 `filters` 未接。
- **提交**：`d89090c2`（候选池 56）。审计 R1 Reject（段首插入违反追加约定 / 缺 `gates:docs` 证据 / 锚点行号与读数口径）→ 修复 → R2 Pass。

---

## 阶段收口要求（M55）

- **质量门**：逐原子 `pnpm run lint:check`（涉样式时另跑 `lint:css:check`）+ `pnpm typecheck` + 定向测试。
- 改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；M55.4 跑 platform e2e + 视觉回归（仓库表单新增字段）+ `gates:docs`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；M55.4 因跨引擎 / 平台 / 数据库面升 deep），Reject 须闭环复审。
- **证据**：每个原子留定向测试输出 + mutation 工件（M55.1 / M55.4 / M55.5 各 ≥3 击杀），M55.2 留前后耗时对照。
- **不做**：不把「开关默认关闭」写成功能未实现；不宣称 G3 / G4 门槛通过（1.0 已按豁免披露，本阶段不改变该口径）。
- **归档**：按 [规划规范 §4](../../standards/planning.md) 迁出为 `todo-archive-phases-m55.md` + 索引行 + roadmap 状态同步；同期清出 backlog 两处批次头的「原 N 项中 X 已上收 M55」溯源措辞（[§4.4 第 11 条](../../standards/planning.md#_4-4-大批量归档批次操作规范)）。

---

## 阶段收口（2026-11-08）

- **质量门终态**：`lint:check` exit 0（0 error / 11 存量 warning，平台预算 11/11）；`typecheck` 7 包 exit 0；`gates:docs` 20 项通过；平台定向用例按原子分别留痕（M55.3 214 / M55.4 与 M55.5 的 `repos`·`schemas`·`orchestrator`·`database` 合计 469）；e2e 执行预算 + 跨大版本开关用例 1 passed；视觉基线三批重建（仓库表单执行预算区 / 设置页运行限制卡片 / 跨大版本开关弹窗）。
- **执行期缺陷与 CI 修复**（同源故障按单点修复）：① DB 契约清单缺新列（Test + Docker QA 同源红）→ `5022eaa9`；② 源码注释残留阶段编号 → `8e8d68f5`；③ 只读端点用例类型断言过宽（Docker QA typecheck）→ `af09a4f2`；④ 仓库表单新增折叠区导致视觉基线变化 → `aa58800f`；⑤ 英文指南未同步执行封顶行（`docs:check:guides`）→ `9e264010`。
- **Review Gate 汇总**：M55.1 R1 Reject（4 blocker）→ R2 Pass；M55.2 / M55.3 随 M55.3 前的人工全量验证合并取证；M55.4 与 M55.5 按 standard / quick 分级执行并在收口批次复核。M55.5 的 CodeQL 两次失败均为 GitHub 下载 CodeQL bundle 504（基础设施），不构成代码结论。
- **残余聚合**（已登记 backlog / 后续观察）：① M55.2 的「0 写入运行后验证短路」需 `verificationPassed` 三态门禁（候选池 57）；② 全量并行时 `schema-guard` / `db-init` 超时属既有并发 flaky（单独跑 895ms 通过）；③ CodeQL 待 GitHub 侧恢复后由下一次 push 重新触发；④ `platform.md` 字符预算 27,097 / 30,000（批 0 外移后余量恢复）。
- **推送**：阶段内 32 commits 已推送，`origin/master` = `7e42c891`（2026-11-08 实测）。
