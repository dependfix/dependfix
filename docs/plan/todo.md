# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M37 进行中**——运行可观测性与体验记忆（2026-10-06 用户决策方案 B / 6 原子条目，含补充授权追加 M37.6） |
| 下一阶段（已授权，设计先行，未进入本文件） | **M38 平台执行模型隔离**——2026-10-06 用户授权开阶段，首个交付为方案选型设计先行稿；见 [roadmap.md §M38](roadmap.md) |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M36 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M36 已归档） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M37: 运行可观测性与体验记忆（2026-10-06 用户决策方案 B / M37.1~M37.6）

> **阶段定位**：承接 M36 完整闭环归档后的 backlog 候选池，2026-10-06 用户明确决策**方案 B（可观测性能力优先）**——从 backlog §候选评估中上收 6 项候选（另 1 项 M36.1 CI 门禁自 archive §4 保留清单上收），收敛为 5 原子条目，以「运行失败分类与筛选」（[设计先行稿](../design/governance/run-failure-taxonomy.md)）为主线，配套 UX 偏好记忆 + 治理债残余清仓 + 文档口径 + CI 防护；**同日补充授权追加第 6 项 M37.6**（P1，按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 可用性插队例外——生产交付 blocker），来源为 2026-10-05 / 10-06 生产日志根因分析。
> **类型平衡**：🚀 1 + 🎨 1 + 🛡️ 2 + 📚 1 + 🛠️ 1 = 6 原子，符合 [规划规范 §1.1 类型平衡原则](../standards/planning.md#11-硬性约束)（UX 独立条目 1 项，低于建议值 2，显式标注缺口；M37.1 含 UI 筛选与阶段展示，实际承载 UX）。
> **§3.4 三重交叉核验**（2026-10-06 启动批次实测，0 项重复评估）：① todo-archive 扫描——5 候选均仅以「M36 衍生候选 / 未完成项」形式登记，无闭环标注；② git log——`1b981ee`（运行失败分类设计稿）/ `52d38dc`（扫描偏好候选登记）均为登记 commit，无实现 commit；③ 代码 anchor——`failureStage`/`failureKind` 0 命中、`repos.vue:205-206` + `use-repo-batch-scan.ts:30-31` 硬编码仍在、`batch-executor.ts:105-108` 无条件 `save` 仍在、`tech-stack.md:36` + `platform.md:16` 仍标 `0.3.0`、`check:orphan-ids` 未接入任何 CI workflow。**M37.6 追加批次三重核验**（同日）：① archive 仅含 dependfix 自身仓库 husky identity guard（`f482708`），无目标仓库 hooks 隔离；② git log 仅签名隔离 `fd2280b` / `f6150b0`，无 hooks 隔离 commit；③ `rg -n "core\.hooksPath|--no-verify" packages/engine/src` 0 命中。
> **用户决策点**：① 扫描偏好载体采用**方案 C 混合**（localStorage 上次选择 + 可选配置化默认，含设置入口 / 重置，无服务端实体）；② M37.1 本阶段**仅分类 + 筛选 + 展示**，受约束重试入口延后（登记 backlog）；③ 2026-10-06 授权追加 M37.6（目标仓库 git hooks 隔离），同批次授权 backlog 候选 B（队列执行隔离）开独立阶段先行设计稿（见 roadmap §M38）。
> **不做什么（阶段级）**：不改引擎修复 / 验证逻辑；不引入新执行后端；不改鉴权 / 组织隔离；不做服务端跨设备偏好；不实现重试入口。M37.6 仅隔离目标仓库 git hooks（交付阶段），不改修复 / 验证语义与 push / PR 链路。

- **M37.1**（P2，🚀 能力扩展）运行失败分类与筛选 + 落库回填（3 子任务 a/b/c）
  - **目标**：`/scans` 运行列表能按失败阶段筛选、失败态显示「失败 · {阶段}」，并建立 `failureStage` / `failureKind` 分类的单一事实源（历史运行可回填），使用户一眼区分「网络可重试」与「验证需研判」失败。
  - **优先级**：P2
  - **范围**：
    - **M37.1a** 分类模型 + 落库 + 回填：`apps/platform/server/services/run-failure-classify.ts`（新增纯函数 `classifyRunFailure` + `applyFailureClassification`）/ `apps/platform/server/entities/scan-run.ts`（新增 `failure_code` / `failure_stage` / `failure_kind` 三列）/ 新增前缀感知 migration / `apps/platform/server/database/scripts/backfill-run-failure.ts`（新增，dry-run 默认）——实现期落库覆盖**全部失败写路径**（orchestrator 状态机 + catch-all / `batch-executor.ts` 去重与入队失败 / `stale-cleanup.ts` 孤儿清理 / `scan.post.ts` 去重 / `force-fail.post.ts` 强终），复用既有 run 记录时清空三列
    - **M37.1b** API：`apps/platform/server/api/runs/index.get.ts`（`status` / `failureStage` / `failureKind` 多值 query + 响应三字段）/ `apps/platform/server/api/scan-history/summary.get.ts`（新增 `byFailureStage`）
    - **M37.1c** UI + i18n：`apps/platform/app/pages/scans.vue`（筛选条 + 状态列阶段 Tag + 汇总口径）+ zh-CN / en-US `runs.failureStage.*` / `runs.failureKind.*` 键
  - **验收标准**：
    - [x] `classifyRunFailure` 纯函数覆盖设计稿 §4 全部已知 code / category（含 `unknown` 兜底）；单测覆盖全映射 + 兜底分支
    - [x] migration 前缀感知 + 幂等（非默认 `entityPrefix` 下不静默 no-op）；回填脚本 `--apply` 前默认 dry-run + 幂等 + 无法判定写 `unknown`
    - [x] `GET /api/runs` 三类筛选参数生效且与分页组合正确；组织隔离不回退
    - [x] `GET /api/scan-history/summary` 返回 `byFailureStage`（受同一时间窗约束）
    - [x] `scans.vue` 筛选控件 + 状态列「失败 · {阶段}」Tag + 汇总计数；zh / en-US i18n 双侧键齐全
    - [x] 定向 vitest 全过；`pnpm lint` + `pnpm typecheck` 0 error；`pnpm check:orphan-ids` 0 命中
  - **不做什么**：不含受约束重试入口（`POST /api/repos/[id]/scan` 重试接线延后登记 backlog）；不改引擎修复 / 验证逻辑与跨 major 保护语义；不改 `/api/runs` 既有 `repositoryId` / `ids` / 分页契约；不追求 100% 精确归因（无信息显式 `unknown`）。
  - **依赖**：[run-failure-taxonomy.md §4 分类模型 + §5.2 数据模型 + §5.6 回填](../design/governance/run-failure-taxonomy.md)（2026-10-02 设计先行稿，2026-10-06 上收 M37.1）；M36.3 条件写回层（`persistBatchAggregation`）为终结时写分类的同源上下文。
  - **交付物**：实际 **6 commits**（分类模型+列+迁移 / 落库接线 / 回填脚本 / 读取 API / UI+i18n / 闭环登记）；**实际 38 文件 / 1951 行新增 —— 超 [规划规范 §1.1 任务粒度约束](../standards/planning.md#11-硬性约束) 阈值，拆分依据：本条目已按 a/b/c 三子任务拆分（各有独立验收点与提交批次），且 `run-failure-taxonomy.md` 治理设计先行稿在案 + A 阶段 `deep` 2 分区并发审计**；落库接线覆盖面超出预估（原列 4 个文件，实现期穷举补全 `batch-executor` / `stale-cleanup` / `scan.post` / `force-fail` 全部失败写路径），增量主要来自测试与 i18n 双语；文档 `run-failure-taxonomy.md` 状态更新为「已落地」+ `platform.md §6.2` 运行失败分类口径 + `scripts/README.md` 回填脚本段 + 治理索引双语状态行。
  - **风险与缓解措施**：① 分类漂移（新错误码未纳入映射）→ 集中映射表 + `unknown` 兜底 + 单测守护；② 回填误判 → 仅保守推断，无法判定一律 `unknown`；③ 元数据基线使迁移列在存量库缺列 → 依 [platform.md §3.3](../standards/platform.md) 存量库迁移补齐路径验证。
- **M37.2**（P2，🎨 用户体验）扫描 / 批量扫描记住上次选择 + 自定义默认操作（方案 C 混合）
  - **目标**：单仓库扫描配置弹窗与批量扫描弹窗在会话间保留上次 `mode` / `severity`，并提供可配置「默认扫描操作」与一键重置，消除每次重选的重复操作。
  - **优先级**：P2
  - **范围**：`apps/platform/app/composables/use-scan-preferences.ts`（新增，localStorage 持久化 + 优先级解析 + 管理入口）/ `apps/platform/app/pages/repos.vue`（`scanConfigMode` / `scanConfigSeverity` 改由 composable 提供）/ `apps/platform/app/composables/use-repo-batch-scan.ts`（`batchMode` / `batchSeverityThreshold` 同上）/ `apps/platform/app/components/scan-config-dialog.vue`（无硬编码默认依赖——实现期确认该组件默认值全部来自父级 prop，无需改动）/ 设置入口（`apps/platform/app/pages/settings.vue` 新增「扫描偏好」卡片）+ zh-CN / en-US i18n。
  - **验收标准**：
    - [x] 单仓库 + 批量弹窗 `mode` / `severity` 会话间保留（localStorage，刷新与重开均生效）
    - [x] 无偏好时回退既有硬编码默认（`report-only` / `high`）
    - [x] 「显式配置默认 > 上次选择 > 硬编码兜底」优先级实现 + 提供重置能力
    - [x] zh-CN / en-US i18n 双侧同步
    - [x] composable 单测覆盖优先级解析 / 回退 / 重置三类路径；SSR 首渲染无 hydration 不一致
  - **不做什么**：不改 `/api/repos/{id}/scan` 与 `/api/repos/batch-scan` 契约；不改仓库级 `aiEnabled` / `aiTrigger` 继承语义；不将偏好沿用至 schedule（计划）默认；不做服务端跨设备偏好（方案 B 登记 backlog）。
  - **依赖**：backlog §候选评估中「扫描 / 批量扫描记住上次选择 + 自定义默认操作」条目（2026-10-05 登记，关联 [#136](https://github.com/dependfix/dependfix/issues/136)）；复用 `use-color-mode.ts` 既有 localStorage 模式。
  - **交付物**：实际 **3 commits**（composable + 单测 / 接线 + 设置页 / 闭环登记）；文件 15 / 新增约 1000 行 —— **超 [设计文档硬阈值](../design/governance/spec-and-doc-governance.md)（> 10 文件 / > 800 行）→ 已补 [scan-preferences.md](../design/governance/scan-preferences.md) 治理设计稿**（偏好数据模型 / 优先级 / 写入时机 / SSR 与可测性 / 非目标）并登记治理索引 zh / en；模式 / 严重级别选项抽到 `utils/scan-options.ts` 三处共用（[§7.3 复用边界](../standards/platform.md#73-utility-抽取与跨组件共享)）；偏好语义与 SSR / 可测性约定落入 [platform.md §7.3](../standards/platform.md#73-utility-抽取与跨组件共享) 与 §7.4（caomei Select 空串 value 约束）；e2e 新增两个偏好用例（记忆 + 刷新生效 / 显式默认优先于上次选择 + 「未设置」清除 / 批量弹窗同源 / 重置回退）。
  - **风险与缓解措施**：localStorage 为设备级、SSR 首渲染与客户端初始值可能不一致 → composable 采用 client-only 初始化（`onMounted` 后回填）+ 单测锁定回退分支。
- **M37.3**（P3，🛡️ 治理债）批量写回与告警源错误信号残余治理（2 子任务 a/b）
  - **目标**：消除 M36 审计穷举出的 BatchRun 写回反向竞态 + `stale-cleanup` 对批次的无条件 `save`，并修正「部分源失败」汇总时仓库级错误重复 / 归组不当信号。
  - **优先级**：P3
  - **范围**：
    - **M37.3a** BatchRun 写回残余：`apps/platform/server/services/batch/batch-writeback.ts`（新增 `persistBatchFailedIfRunning`：失败终态条件写回，仅写 `status` / `finishedAt` / `updatedAt`，不动计数与 summary）/ `apps/platform/server/services/batch/batch-executor.ts`（「async 全部入队失败」分支改条件写回）/ `apps/platform/server/services/batch/stale-cleanup.ts`（批次无条件 `save` 改同源条件写回）/ `apps/platform/server/api/batch-runs/[id].get.ts`（未落库一律重读库中状态，覆盖「无字段变化 + 并发 force-fail」瞬时窗口）
    - **M37.3b** 告警源错误信号：`packages/engine/src/app/token-hints.ts`（新增 `alertsFetchTokenHint` 三源合一）/ `packages/engine/src/app/index.ts`（报告模式仓库级 catch 对已有 per-source 信号去重；hint 链同源补全 Code Quality）/ `packages/engine/src/app/repo-fix.ts`（修复模式 catch 改用三源合一 hint）/ `packages/engine/src/app/repo-alerts.ts`（既有 hint 链改用三源合一，行为不变）
  - **验收标准**：
    - [x] `batch-executor.ts` 全部入队失败分支改用条件写回（读取时状态为乐观锁），并发详情 GET 已收敛为 `completed` 时不再覆盖回 `failed`
    - [x] `stale-cleanup.ts` 批次写回改条件更新，不覆盖并发终态
    - [x] 详情 GET 在「无字段变化 + 并发 `force-fail`」场景下响应与库一致（或用例锁定可接受的瞬时窗口语义）
    - [x] 部分源失败汇总不再产生重复仓库级 `FETCH_FAILED` 信号；`unknown` 归组仅保留真实未归类错误
    - [x] 定向 vitest（batch / repo-alerts / index）全过；`pnpm lint` + `pnpm typecheck` 0 error
  - **不做什么**：不改 BatchRun 终态语义与 `force-fail` 契约；不改引擎修复 / 验证链；不重构报告生成器整体。
  - **依赖**：M36.3 共享条件写回层（`persistBatchAggregation`；本批新增失败通道 `persistBatchFailedIfRunning` 并取代原 `persistBatchIfRunning`——后者随三处失败路径收敛后无生产调用方已删除）；M36.4 告警源判据（`failedSources.length > 0 && successfulSources === 0`）；backlog §候选评估中三项残余条目。
  - **交付物**：实际 **3 commits**（a 写回残余 / b 告警源信号 + hint 合一 / 闭环登记）；**文件 19 / 新增 402 行 / 删除 76 行** —— 变更落在既有治理设计稿范围内（[platform-scheduled-batch.md §5.2](../design/governance/platform-scheduled-batch.md#52-聚合更新策略) 增量登记失败路径条件写回与响应一致性；[platform.md §6.1](../standards/platform.md#61-错误码与告警状态口径平台展示消费-engine-错误码) 同步 per-source 去重口径），未新增独立设计稿；三处失败路径（batch-executor / stale-cleanup / batch-reconciler）收敛到同一 `persistBatchFailedIfRunning`，原 `persistBatchIfRunning` 无生产调用方随之删除；新增并发 / 去重用例均经反向 mutation 核验非假绿。
  - **已知边界（审计确认，无需动作）**：报告 / 修复模式仓库级 catch 的 Code Quality 指引属**防御性补全**——`fetchRepoAlerts` 抛错时首个失败源必为 Dependabot（成功源数为 0 意味着 Dependabot 未成功），故 catch 内 hint 恒命中 Dependabot 分支；可达的 Code Quality 指引路径是「部分源失败」时的 per-source 记录（`recordAlertSourceError`），已由 `repo-alerts.test.ts` 的调用点断言守护（message 含 Code Quality 指引）。孤儿批次失败写回已与 stale-cleanup / batch-executor 收敛到同一 `persistBatchFailedIfRunning`（审计 RG-S01 关闭）。
  - **风险与缓解措施**：条件写回条件选取不当可能漏写终态 → 复用 M36.3 已验证的「读取时状态」乐观锁模式 + 并发用例（反向 mutation 核验非假绿）。
- **M37.4**（P3，📚 文档）设计与规范文档 caomei-ui 版本口径同步
  - **目标**：消除设计与规范文档中 caomei-ui 版本陈旧（文档标 `0.3.0`，实际 `apps/platform/package.json` 为 `0.5.0`）。
  - **优先级**：P3
  - **范围**：`docs/guide/tech-stack.md:36`（版本号 `0.3.0` → `0.5.0`）+ `docs/standards/platform.md:16`（同）+ 必要的版本口径一致性复核（同段落相关表述）。
  - **验收标准**：
    - [ ] 两处版本号更新为 `0.5.0`，与 `apps/platform/package.json` 一致
    - [ ] `rg -n "caomei-ui.*0\.3\.0" docs/**` 0 命中（版本类陈旧）
    - [ ] `pnpm check:docs` + `pnpm lint:md` 通过
  - **不做什么**：不改 M31 迁移历史叙述（历史 commit 引用保留 `0.3.0` 上下文）；不扩到其他版本类陈旧（如有则单独登记候选）。
  - **依赖**：M34.2（caomei-ui `0.3.0 → 0.5.0` 升级，`56c1290` + `7363a8d` + `a8e28b5` + `2f10eed`）；M36.2 审计残余记录。
  - **交付物**：1 commit；文件 2（+ 可能的同源复核）。
  - **风险与缓解措施**：版本口径散落 → 同步时用 `rg` 结构化复扫（含双语镜像与设计文档），避免只改命中两处。
- **M37.5**（P3，🛠️ CI 防护）孤立编号检测脚本接入 CI 门禁
  - **目标**：把 `pnpm check:orphan-ids` 纳入 CI 质量门，防止已清理的孤立规划编号回流（M36.1 检测脚本已就绪但未接线）。
  - **优先级**：P3
  - **范围**：`.github/workflows/test.yml`（Test job 增加 `pnpm check:orphan-ids` 步骤）+ 必要的脚本退出码 / 输出文档说明（`scripts/check-orphan-ids.mjs` 已实现，无需改动行为）。
  - **验收标准**：
    - [ ] CI Test job 含 `pnpm check:orphan-ids` 步骤且失败时阻断
    - [ ] 本地 `pnpm check:orphan-ids` 0 命中（627 文件基线）
    - [ ] 负例实证：临时植入一处孤立编号 → 检测 exit 非 0（跑后删除脚手架）
    - [ ] workflow YAML 解析通过 + 与既有步骤顺序不冲突
  - **不做什么**：不改检测脚本判定口径（块级 / 白名单 / 豁免规则维持 M36.1 稳定版）；不扩到 CI 之外的 hook。
  - **依赖**：M36.1 检测脚本（`43ce253` + `9bfcf2c`，22 用例；627 文件 0 命中基线）；M33.2 视觉回归 CI 转阻断的接线模式。
  - **交付物**：1 commit；文件 2（workflow + 可能的文档说明）。
  - **风险与缓解措施**：新增阻断步骤可能因存量豁免误报拉红 CI → 接线前本地全量跑通（0 命中）+ 负例标定退出码语义。
- **M37.6**（P1，🛡️ 交付可靠性）目标仓库 git hooks 隔离（自动 commit 不再被 husky 阻断）
  - **目标**：dependfix 在被修复仓库执行自动 commit 时不再触发目标仓库的 husky / lint-staged 钩子，消除 `npx: not found (code 127)` → `COMMIT_FAILED` → 改动回滚的交付失败链。
  - **优先级**：P1（2026-10-06 用户授权按 [§3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 可用性插队例外追加）
  - **范围**：`packages/engine/src/github/pr-creator.ts:216-228`（`stageAndCommit` 注入 hooks 隔离参数）+ `packages/engine/src/github/git-signing.ts`（新增 hooks 隔离参数常量，对齐 `GIT_COMMIT_SIGNING_ISOLATION_ARGS` 单一事实源范式）+ `packages/engine/src/github/pr-creator.test.ts`（hooks 隔离回归用例）+ `packages/engine/src/github/git-signing.test.ts`（常量契约断言）。
  - **验收标准**：
    - [x] `stageAndCommit` 对目标仓库 hook 完全隔离——落地为 `--no-verify`（`GIT_COMMIT_HOOKS_ISOLATION_ARGS`，置于 `commit` 子命令后）；选型理由：跨平台无需构造目录且覆盖 husky `core.hooksPath` 重定向（Linux 实测 + 选型消解 Windows 路径语义；`post-commit` 不在跳过范围，见常量 JSDoc 边界说明）
    - [x] 新增回归用例：临时仓库植入非 0 退出 pre-commit（写标记 + `exit 1`，比 `npx` 形态更强且不依赖 PATH 构造）→ `stageAndCommit` 成功且标记文件不存在；同环境裸 commit 作反例必失败（防恒真）
    - [x] 签名隔离不回归（`git-signing.test.ts` 既有用例全过）+ 新增常量契约断言
    - [x] `pnpm --filter @dependfix/engine test` 全过（执行角色实测：63 files / 1197 passed）+ `pnpm lint` + `pnpm run typecheck`（7 项目）0 error + `pnpm --filter @dependfix/engine build` 成功
  - **不做什么**：不注入 PATH / 不安装目标仓库依赖；不改 push / PR 交付链（push 侧 `pre-push` 隔离登记 backlog）；不执行目标仓库 hook（语义为「自动提交不受目标仓库本地开发钩子约束」）；不改 host 全局 git 配置；不新增 `docs/standards/git.md` hooks 规范锚点（范围外治理改动，登记 backlog）。
  - **依赖**：`git-signing.ts` 隔离范式（commit `fd2280b`）；2026-10-05 生产日志（多仓库 `COMMIT_FAILED`）。
  - **交付物**：2 commits（fix(engine) 实现 + docs(plan) 收口）；文件 4（`pr-creator.ts` / `git-signing.ts` / `pr-creator.test.ts` / `git-signing.test.ts`）。
  - **风险与缓解措施**：① hooks 隔离选型——最终采用 `--no-verify`（跳过 `pre-commit` / `commit-msg` / `prepare-commit-msg`），比 `core.hooksPath` 空目录更窄且跨平台无路径依赖；`post-commit` 不跳过（其失败不影响 commit 结果）；② Windows 语义未实测（仓库 CI 仅 ubuntu）→ 选型不含路径构造，风险消解；如后续支持原生 Windows 测试需平台化 hook 形态；③ 目标仓库依赖缺失时 hook 本就会失败 → 隔离后该场景与本缺陷解耦。

---

## 当前阶段收口清单（阶段进行中，用于归档前自检）

- [ ] M37.1 / M37.2 / M37.3 / M37.4 / M37.5 / M37.6 全部闭环
- [ ] 每条目 A 阶段 Review Gate Pass（planning / 阶段启动批次按 `standard` 送审）
- [ ] `pnpm lint` / `pnpm typecheck` / 定向测试 / `pnpm check:docs` / `pnpm lint:md` / `pnpm check:orphan-ids` 通过
- [ ] 归档时按 [archive/index.md](archive/index.md) 阈值与主窗口 3-5 段策略评估预防性分片
