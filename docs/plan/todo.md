# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | M67 交付与发布链可信残余（5 原子，2026-11-25 规划） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M66 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M66 已归档，M67 执行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M67 交付与发布链可信残余（2026-11-25 规划）

> **目标**：把已评估但未落地的五处交付 / 发布链残余一次收敛——不可修复告警的「无补丁」结论可判读、平台基线红交付有可跟踪载体与仓库级配置、无变更周不再付全量发布成本、破坏性提交从人工核对转为机检、备份临时文件清扫不再误删并发写入。
>
> **来源**：用户 2026-11-25 选定主题 A。上收 5 条候选——无补丁版本告警的稳定结论（P3 🛠️，2026-11-24 阶段容量再平衡移出项）、平台侧交付载体 issue / 草稿 PR（P2 🎨）、发布工作流无变更周的空跑短路（P3 🚀）、破坏性提交机检落地（P2 🛡️，待上收候选）、备份 `.tmp` 清扫年龄门槛（P3 🛠️）。直接输入为 2026-11-15 定时发布评估、2026-11-21 破坏性提交评估、M53.2 备份收口登记与 M66 交付跳过可观测性。
>
> **§3.4 五步交叉核验（2026-11-25 实测；已有实现只列缺口，不重复上收）**：
> ① 归档扫描：`rg -c "无补丁|first_patched|交付载体|ON_BASELINE_RED|空跑短路|无变更周|Breaking-Review|破坏性提交机检|bak.tmp"` 于 `docs/plan/archive/` + `todo-archive.md` 命中 30（无补丁 11 / first_patched 2 / 交付载体 15 / ON_BASELINE_RED 1 / 空跑短路 0 / 无变更周 0 / Breaking-Review 1 / 破坏性提交机检 0 / bak.tmp 0）；最近 3-5 个阶段表格「已闭环 / 不计入本批」扫描 31 处，均为报告口径 / 设计决策登记，无五条候选的原子闭环记录；
> ② `git log --all --grep`：无补丁 `817c27cb`（M66 再平衡登记）/ `2457b516`（候选登记）；交付载体 `880445a4`（仅设计口径，平台执行链未实现）；空跑 `9b16a35a`（定时发布评估登记）；Breaking-Review `8478f120`（规范条款）/ `6527b608`（`no-diff-stats` ISO 日期修复，机检脚本本身未实现）；`bak.tmp` `fafb2faa` / `4d8e5532`（快照原子化，未加年龄门槛）——均为登记或前置修复，无整项重复；
> ③ 代码 anchor：`packages/engine/src/github/dependabot-fetcher.ts:95-96` 仅以 `first_patched_version !== null` 判 fixable，`packages/core/src/report/alert-outcomes.ts:213` 只落 `not-fixable`；`packages/engine/src/app/helpers.ts:584-596` 在 fix + commit 路径只记录 `carrier: { mode: 'skip' }`，`apps/platform/server/services/executor/platform-delivery.ts` 只创建 PR，无 issue / 草稿载体分支；`.github/workflows/release.yml:33-90` 在 install 之后才出现发布相关步骤，`scripts/create-release-plan.mjs:270-286` 生成计划文件且已存在时 exit 1；`.husky/commit-msg` 仅调用 commitlint，`.github/workflows/test.yml` 无破坏性提交检查；`apps/platform/server/database/backup.ts:245-250` 对 `*.bak.tmp` 无条件删除；
> ④ 决策前提：用户已选主题 A；无补丁承载形态（D1）、平台载体路径与配置层级（D2）、发布探测形态（D3）、机检脚本落点与 CI 范围（D4）、备份年龄门槛形态与取值（D5）留 D 阶段；
> ⑤ backlog 同步：5 条上收（候选池 23 → 19、待上收 3 → 2，合计 26 → 21），删除上收正文并同步「定时发布启用」前置措辞；无新增候选、无阶段编号外溢。
>
> **容量基线（逐原子交付物求和，规划轮估算；行 = diff 改动量含删除；测量方 = 规划角色；执行期以 `git diff --shortstat` 校准）**：17-24 commits / 33-48 files / 1,040-2,070 行（较主题比选粗估上调，原因是 M67.2 按 §2.6 同批补仓库级配置 UI 与 UI 证据）。**类型（按主类型计数）**：🛠️2（M67.1 / M67.5）+ 🎨1（M67.2）+ 🚀1（M67.3）+ 🛡️1（M67.4）；用户可见面 2（M67.1 运行详情、M67.2 仓库配置与交付载体），测试覆盖随各原子同批交付。
>
> **用户可达性判定（规划规范 §2.6）**：M67.1 为 UI（运行详情既有入口 + 报告文案）；M67.2 为 UI（仓库表单配置字段 + 运行详情载体链接 + e2e）；M67.3 / M67.4 为 API-only ③（CI / commit hook 消费，脚本提供帮助与退出码）；M67.5 无用户可见面（内部维护能力，不适用 §2.6）。
>
> **执行顺序**：M67.1（报告口径）→ M67.5（内部清理，小步）→ M67.4（提交门禁）→ M67.3（发布门控）→ M67.2（跨端交付载体，最后，避免 UI / 配置连带）。
>
> **D 阶段决策点**：D1（M67.1）复用 `not-fixable` 子状态 vs 新增跳过原因、dismiss 建议承载位置；D2（M67.2）平台载体路径（平台自行提交 vs 引擎 fix 模式支持 draft）与配置层级（仓库级 vs 组织级）；D3（M67.3）探测 job 拆分 vs 步骤级 `if` 门控；D4（M67.4）脚本落点、CI 范围取法与失败输出格式；D5（M67.5）年龄门槛 vs PID 命名、门槛取值。
>
> **前置 / 风险**：平台载体涉及 push / issue 写操作，必须复用既有凭据链与失败指纹幂等；发布 workflow 改动必须 `workflow_dispatch` 回归且探测失败 fail-open；机检脚本只校验本次范围、不回补历史提交；备份清理保持 fail-open（清理失败不阻断备份创建）。

### 进度总览

| 大条目 | 小条目 | 状态 | 提交 | 审计 | 容量 |
|:--|:--|:--|:--|:--|:--|
| M67.1 无补丁版本告警的稳定结论 | — | ✅ 已完成 | 4（d22b8af7 / a5c2a4b8 / f92bd9db / 本条登记） | standard R1 Pass（3W）→ R2 Reject（W2）→ R3 Pass | 计划 3-4 commits / 8-10 files / 220-400 行；实际 4 commits / 26 files / +278 −35（测试、双语与设计稿同源扩散） |
| M67.2 平台基线红交付载体与仓库级配置 | 3（M67.2.1-M67.2.3） | ✅ 已完成（3 子条目均闭环） | 7（2aaabcfa / 8a2e7881 / 21f2b705 / 9a7c127c / 218ff3b4 / 795a3b2e / 231b761e） | deep 后端 R1 Reject（B1/B2）→ R2 Pass；前端 R1 Pass（4W）→ R2 Pass；收口 R3 Pass | 计划 7-10 commits / 13-20 files / 460-930 行；实际 7 commits / 45 files / +849 −38（测试、i18n、e2e 与文档同源扩散） |
| M67.3 发布工作流无变更周空跑短路 | — | ✅ 已完成 | 4（2fb2f052 / 6d3b2060 / 7cc7dabe / 本条登记） | deep R1 Pass（3W）→ R2 Pass | 计划 2-3 commits / 3-5 files / 100-220 行；实际 4 commits / 8 files / +229 −12（含自愈补扫与测试） |
| M67.4 破坏性提交机检 | — | ✅ 已完成 | 4（09448936 / c621d41e / 7715e323 / 本条登记） | deep R1 Pass（3W）→ R2 Reject（B1）→ R3 Reject（B2）→ R4 Pass | 计划 3-4 commits / 6-8 files / 180-360 行；实际 4 commits / 10 files / +496 −9（footer 容错与负例标定） |
| M67.5 备份 `.tmp` 清扫年龄门槛 | — | ✅ 已完成 | 3（6a178ef2 / e2300fef / 本条登记） | standard R1 Pass（3W）→ R2 Pass | 计划 2-3 commits / 3-5 files / 80-160 行；实际 3 commits / 6 files / +107 −8（含规范与登记） |

> 状态 / 提交 / 审计由执行与归档批次回填；`提交` 列填该条目自身 commit 区间与数量，`审计` 列填 Review Gate 轮次结论。

### M67.1 无补丁版本告警的稳定结论（P3 🛠️）

- **目标**：`first_patched_version=null` 的 Dependabot 告警在 `not-fixable` 内可区分「无补丁版本」与其他不可自动修复形态，报告与运行详情可判读并给出 dismiss 建议，同时保持跳过家族计数守恒。
- **优先级**：P3（2026-11-24 由 M66.2 按 §3.1.1 阶段容量再平衡移出；跳过清单长期不区分「等上游」与「无补丁」）。
- **范围**：
  - `packages/engine/src/github/dependabot-fetcher.ts:95-96`：保留 `first_patched_version !== null` 的 fixable 语义，补充「无补丁」标记；
  - `packages/core/src/alerts/index.ts:15-29`（若选新增字段）/ `packages/core/src/report/alert-outcomes.ts:205-215`：`not-fixable` 子状态或新跳过原因；
  - `packages/engine/src/app/repo-fix.ts:359-363`、`packages/core/src/report/types.ts:12-31`、`packages/core/src/report/summary-counters.ts:125`：计数与文案表；
  - `packages/core/src/report/markdown-generator.ts`：报告跳过清单可判读；
  - `apps/platform/app/utils/run-view.ts:46-73`、`apps/platform/app/components/run-detail-dialog.vue`、`apps/platform/i18n/locales/{zh-CN,en-US}.json`：运行详情与 zh / en 文案。
- **验收标准**：
  - AC1：构造 `first_patched_version=null` 的告警 → 在 `not-fixable` 内落可区分子状态（或新跳过原因），同一告警一轮只计一次（用例断言）；
  - AC2：报告与运行详情显示「无补丁版本」并给出 dismiss 建议（仅建议，不自动 dismiss），zh / en 文案同时存在；
  - AC3：`sum(alertsSkippedByReason) === alertsSkipped` 保持，`belowTarget` 区间过滤与既有 `not-fixable` 归因零回归（`pnpm --filter @dependfix/core exec vitest run` + `pnpm --filter @dependfix/engine test -- alert` 定向）；
  - AC4：`pnpm run i18n:audit:missing` 与 `pnpm run i18n:check:anchor` 通过；旧 summaryJson 缺新键时回落「其他 / 未分类」仍成立；
  - AC5：平台展示有组件级或 e2e 证据——扩展 `apps/platform/app/utils/run-view.test.ts` 锁定新原因映射，并在 `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts:98-150`（run-detail-dialog 挂载点）或新增组件测试中断言「无补丁版本」文案与旧 summaryJson 回落，不以 core 单测替代 UI 证据。
- **不做什么**：不自动 dismiss；不改 advisory 数据源；不重做 M62.3 的 `belowTarget` 区间过滤；不改 skipped 家族总计数语义。
- **依赖**：M62.3 区间过滤（回归基线）；`'not-fixable'` 现有跳过家族；候选原文与移出记录见 [M66 归档分片](archive/todo-archive-phases-m66.md)「容量再平衡」段与 [archive-log](archive/archive-log.md) 2026-11-25 批记录中的 2026-11-24 再平衡段。
- **交付物**：3-4 commits / 8-10 files / 220-400 行；建议分组——① core 归因与计数（按 `source === 'dependabot' && !fixable && recommendedVersion === ''` 推导，优先不新增字段）② 报告 / 运行详情 / i18n ③ core / engine / platform 回归用例与设计文档。
- **风险与缓解**：子状态与总数漂移 → 守恒断言锁定；旧 summaryJson 无新键 → 展示层回退；平台文案漏配 → AC4 机检。
- **执行记录（2026-11-25）**：D1 选「新增跳过原因」而非子状态——`SKIP_REASONS` 新增 `no-patch`，判定单点化为 `source === 'dependabot' && !fixable && recommendedVersion === ''`；`fixable=true` 但无推荐版本（等上游）仍计 `not-fixable` 且不落明细（`not-tried`）。报告在跳过表后追加 dismiss 建议块；运行详情在分组下追加建议行；PR 正文仅行标签（不追加完整块）。已知边界：仅根清单桶，成员清单 / 子目录 / 单链文件桶仍归 `subdirectory-manifest`。commits `d22b8af7` / `a5c2a4b8` / `f92bd9db` / 本条登记。审计 standard R1 Pass（3W）→ R2 Reject（明细写入缺判别用例）→ R3 Pass；关键验证：core 304、engine 定向 15、platform 2933、lint 0 error / 6 warning、typecheck 7 项目、i18n 双检、gates:docs 22 项、e2e alerts-sidebar 6 passed。

### M67.2 平台基线红交付载体与仓库级配置（P2 🎨）

- **目标**：平台 `fix + commit` 路径在「修复后安装仍为既有失败」时，按仓库级配置产出可跟踪载体（issue / 草稿 PR）或明确 skip，不再只有 `deliverySkipped` 计数。
- **优先级**：P2（平台用户反馈「基线红只有标签、没有可跟踪载体」；当前仅 `DEPENDFIX_ON_BASELINE_RED` env，UI / API 不暴露）。
- **范围**：
  - 交付决策：`apps/platform/server/services/executor/container-executor.ts:430-470`（RuntimeConfig / needsPush / 交付接管）、`apps/platform/server/services/executor/platform-delivery.ts`（复用 `createPullRequest`，并接 issue 载体）；
  - 引擎现状：`packages/engine/src/app/helpers.ts:584-596`（fix + commit 只记 `carrier: { mode: 'skip' }`）、`packages/engine/src/app/skipped-delivery.ts:145-200`、`packages/engine/src/github/delivery-issue.ts`；
  - 仓库级配置：`apps/platform/server/entities/repository.ts:141`（沿用 `verifyCommands` 形态新增枚举字段 + 迁移）、仓库创建 / 更新 API、`apps/platform/app/components/repo-form-dialog.vue:39-110`；
  - 展示与文案：`apps/platform/app/components/run-detail-dialog.vue:360-363`、`deliverySkippedHint` zh / en（当前声明载体只在引擎 fix-and-pr 路径，需随能力更新）。
- **验收标准**：
  - AC1：仓库配置为 `issue` 且基线红 → 按「仓库集 + 失败命令集」指纹开 issue（同指纹不重复、关闭后不重开），运行详情可跳转；配置 `skip` 时不产生载体（与现状一致）；
  - AC2：配置为 `draft` 且基线红 → 产出草稿 PR（`draft: true`），正文标注「CI 将因既有失败为红」；push / 创建失败按既有 `pr_creation_failed` 语义记录，不误标成功；
  - AC3：仓库级配置有 UI 入口（仓库表单字段 + 帮助文案），主路径可写回并生效；zh / en i18n 齐全，`pnpm run i18n:audit:missing` 通过；
  - AC4：默认值保持 `skip`，既有运行结果与展示零回归；载体创建幂等（同一失败指纹重复运行不重复开）；
  - AC5：e2e 覆盖「配置 → 运行 → 载体」主路径，并覆盖非法枚举 / 迁移失败在表单的错误态（若受限于基线红夹具，须以 server 单测 + 组件测试组合替代并在条目内写明理由）。
- **不做什么**：不改引擎 fix-and-pr 既有载体语义；不自动 dismiss / 自动关闭 issue；不新增组织级配置（先仓库级）；不改 PR 内容指纹算法。
- **依赖**：M66.5 交付跳过可观测性（`deliverySkips` 展示）；`packages/engine/src/github/delivery-issue.ts` / `pr-creator.ts`；[pr-delivery-closure §16.7](../design/governance/pr-delivery-closure-history.md#_16-7-已知边界)。
- **交付物**：7-10 commits / 13-20 files / 460-930 行；按下方三个子条目分批，单子条目 ≤8 files / ≤420 行。
- **风险与缓解**：fix 模式不提交导致草稿 PR 无内容 → D2 明确「平台提交」或「引擎 fix 模式支持 draft」并写回设计；配置改后运行快照不一致 → 运行时读取仓库实体快照并在结果内回显；issue 指纹随日志漂移 → 只取失败命令名，不取错误文本（沿用 §16 口径）。
- **执行记录（2026-11-25/26）**：D2 选「平台接管 + 引擎 fix 模式在 draft 档继续提交」——新增内部 `deliveryOwner='platform'`（无 env / CLI）避免扩大 CLI 语义；仓库级 `baselineRedCarrier`（默认 `skip`）+ 迁移 `3600000000000`；执行器按实际 `deliverySkips` 激活 draft（成功运行仍走原扫描模式），issue 复用 `deliverSkipIssue` 指纹，草稿 PR `draft: true` 且正文带既有失败说明；`summary.deliverySkipCarriers` 提供运行详情跳转。AC5 替代证据：基线红需目标仓安装链本身为红，e2e 无稳定夹具，故以 `attachBaselineRedIssueCarriers` / draft PR / snapshot 单测 + 「配置落库回显」与「载体链接」两条 e2e 组合替代（非法枚举由 schema 单测覆盖）。commits `2aaabcfa` / `8a2e7881` / `21f2b705` / `9a7c127c` / `218ff3b4` / `795a3b2e` / `231b761e`。审计 deep 后端 R1 Reject（B1 配置未透传 / B2 draft 未按实际基线红）→ R2 Pass（W1-W4/W7 收口）；前端 R1 Pass（4W）→ R2 Pass。验证：platform 2950 passed / 10 skipped、engine 全量、typecheck 7 项目、lint 0 error / 8 warning、i18n 双检、gates:docs 22、contract-freeze 11 项、e2e repos-crud + alerts-sidebar 19 passed。

#### M67.2.1 载体创建与幂等（issue / 草稿 PR 复用引擎能力）

- **目标**：平台在 `deliverySkips` 命中基线红时，按配置创建 issue 或草稿 PR，并保证同失败指纹幂等。
- **验收标准**：issue 指纹去重 / 关闭后不重开；草稿 PR `draft: true` 且正文标注既有失败；失败按 `pr_creation_failed` 记录；单测覆盖两条载体路径。
- **交付物**：3-4 commits / 5-8 files / 220-420 行（交付决策 + 引擎能力复用 + 单测）。
- **依赖**：`packages/engine/src/github/delivery-issue.ts` / `pr-creator.ts`；M66.5 `deliverySkips` 展示。

#### M67.2.2 仓库级配置字段 + API + 迁移

- **目标**：仓库实体新增基线红载体配置（`skip` / `issue` / `draft`，默认 `skip`），经 API 读写并随运行生效。
- **验收标准**：迁移可重复执行；默认值 `skip`；API 校验枚举与权限；读取失败回落 `skip` 且不阻断运行。
- **交付物**：2-3 commits / 4-6 files / 120-250 行（实体 + 迁移 + API + 单测）。
- **依赖**：M67.2.1 的载体语义；`repository.ts:141` 既有字段形态（`verifyCommands`）。

#### M67.2.3 仓库表单与 i18n + e2e

- **目标**：仓库表单可配置载体模式，运行详情展示载体链接与「交付跳过」更新文案。
- **验收标准**：表单主路径可写回并回显；zh / en 文案齐全；e2e 或「server 单测 + 组件测试」覆盖配置 → 运行 → 载体（替代需写明理由）。
- **交付物**：2-3 commits / 4-6 files / 120-260 行（表单 + i18n + 测试）。
- **依赖**：M67.2.2 的 API 与枚举；`repo-form-dialog.vue:39-110` 既有表单模式。

### M67.3 发布工作流无变更周空跑短路（P3 🚀）

- **目标**：`release.yml` 在无版本变更的定时轮次于 install 之前结束，`workflow_dispatch` 保持全量执行。
- **优先级**：P3（定时发布启用前置；无变更周当前仍付 20-30 分钟全量成本，测量方 = 2026-11-15 评估会话按 job 步骤清单估算）。
- **范围**：
  - `.github/workflows/release.yml:17-130`：新增发布计划探测（job 拆分或步骤级门控）；
  - `scripts/create-release-plan.mjs:255-300`：新增只读探测模式 / 入口，不写 `release-plan.md`；
  - `scripts/packages.config.mjs` 复用包影响面映射；`scripts/**/*.test.mjs` 新增探测用例；
  - 发布管线设计文档状态同步。
- **验收标准**：
  - AC1：无变更轮次在 install 之前结束，日志含 `::notice::` 与跳过原因；run 时长与步骤数可佐证（对比同仓库一次有变更轮次）；
  - AC2：探测不写 `release-plan.md`（只读），重复执行幂等；已存在计划文件时不误判「有变更」或 exit 1；
  - AC3：`workflow_dispatch` 全量执行；有变更轮次与现流程步骤集合等价；
  - AC4：`verify:changelog` 与 `check:release-security` 相对顺序不变；探测失败（git 不可用 / 无 tag / 脚本异常）fail-open 走全量，不误短路。
- **不做什么**：不改版本推导与发布判定；不合并 schedule 与 dispatch 的步骤集；不引入第三方 action。
- **依赖**：定时发布启用（backlog 待上收，本项为其前置）；`release:plan` 现有推导逻辑（`scripts/create-release-plan.mjs`）；发布管线设计 §4。
- **交付物**：2-3 commits / 3-5 files / 100-220 行；① 只读探测 + 单测 ② workflow 门控 ③ 文档。
- **风险与缓解**：漏跑发布 → 仅「无计划」短路且探测异常 fail-open；probe 与 release 之间 tag / 分支漂移 → release job 重新 checkout 后照常推导；计划文件残留 → 只读模式断言文件不存在。
- **执行记录（2026-11-25）**：D3 选 job 拆分——schedule 增加只读 `probe` job，`plan.size === 0` 时 release job 经 job 级 `!cancelled()` 条件整体跳过；dispatch 不运行 probe，全量执行。`--check` 不写计划文件、不读存在性、幂等；无新 bump 但 core 版本未打 `v<version>` / `*@<version>` tag 时仍全量（范围有限，tag 丢失由 `pnpm tag:released` 兜底）；探测异常 `::warning::` + `has_changes=true` fail-open。`verify:changelog` 与 `check:release-security` 相对顺序不变。已知未证实：schedule 仍注释，真实无变更 / 有变更轮次 run 时长对照与 dispatch 下 probe-skipped + `!cancelled()` 求值待启用定时发布后回填。commits `2fb2f052` / `6d3b2060` / `7cc7dabe` / 本条登记。审计 deep R1 Pass（3W）→ R2 Pass；验证：create-release-plan 43 passed、真实只读 probe（3 包 minor、无计划文件）、lint 0 error / 6 warning、typecheck 7 项目、gates:docs 22、YAML 可解析。

### M67.4 破坏性提交机检（P2 🛡️）

- **目标**：破坏性提交的 `Breaking-Review:` 记录从人工核对转为 `commit-msg` + CI 共用脚本机检。
- **优先级**：P2（[git.md §3.9](../standards/git.md#_3-9-破坏性提交人工审查) 已落地规范，机检缺失；当前全靠人工）。
- **范围**：
  - `scripts/` 新增 `check-breaking-commit.mjs` + 单测（沿用 `scripts/commitlint/*.test.mjs` 模式）；
  - `.husky/commit-msg`：commitlint 之后调用 `--message-file`；
  - `.github/workflows/test.yml:1-90`：`--range` 接入（push 用 `github.event.before..HEAD`，PR 用 `pull_request.base.sha..HEAD`，`workflow_dispatch` 跳过）；
  - `docs/standards/git.md §3.9` 实施状态、`package.json` script。
- **验收标准**：
  - AC1：`--message-file` 对「破坏性缺记录 / 记录在 `BREAKING CHANGE:` 之后 / 只写 `!` 无 footer / `BREAKING-CHANGE:` / 标识非单 token / 日期非法 / 结论不在枚举 / `approved-with-migration` 无迁移路径」逐条 exit≠0；合规消息 exit 0；非破坏性与 merge / 空消息跳过；`--help` 输出非空并列出 `--message-file` / `--range` 两种入口；
  - AC2：`--range a..b` 对范围内每笔提交复用同一判定，任一笔失败 exit≠0 并输出 commit hash；push / PR 事件取正确范围，dispatch 跳过；
  - AC3：husky 在 commitlint 之后调用，非破坏性提交零额外阻塞；CI 步骤接入 Test job（workflow 级阻断）；
  - AC4：单测覆盖上述规则（正例 + 反例 + 边界），`pnpm vitest run scripts/` 通过；既有 4 笔历史 footer 提交不被追溯拦截。
- **不做什么**：不回补历史 commit；不新增结论枚举（保持 `approved` / `approved-with-migration`）；不改 commitlint 既有插件语义；不改 `no-diff-stats`。
- **依赖**：2026-11-21 评估结论；`no-diff-stats` ISO 日期修复（`6527b608`）；[git.md §3.9](../standards/git.md#_3-9-破坏性提交人工审查)。
- **交付物**：3-4 commits / 6-8 files / 180-360 行；① 脚本 + 单测 ② husky + CI ③ 规范实施状态。
- **风险与缓解**：误拦合规消息 → 先用真实历史范围回归，再按「任一命中」严格判定；force push 后范围失真 → 只校验本次事件范围；本地无 node → 沿用 `npx --no-install` 失败即阻断（与 commitlint 一致）。
- **执行记录（2026-11-25）**：`scripts/check-breaking-commit.mjs` 同时服务 `--message-file`（husky）与 `--range`（CI）；footer 只取末尾 trailer 区，兼容 `-s` 的 `Signed-off-by` 与 `-v` 的注释 / 剪刀线裸 diff；`BREAKING-CHANGE:` 按缺 footer 处理；`approved-with-migration` 要求 footer 区非空 `Migration:` 行（git.md 已同步）。CI 在 Test job frozen install 后按 push `before..HEAD` / PR `base.sha..HEAD` 校验，dispatch 与全零 before 跳过；husky 在 commitlint 之后调用。已知边界：`core.commentChar` 非 `#` 时注释识别失效；无空行分隔的裸 footer 不视为合法 footer（文档已声明，发布链可能仍按 breaking 推导）。commits `09448936` / `c621d41e` / `7715e323` / 本条登记。审计 deep R1 Pass（3W）→ R2 Reject（signoff 尾块）→ R3 Reject（verbose 剪刀线）→ R4 Pass；验证：脚本 20 passed、scripts 全量 1224、真实 hook 正反向、lint 0 error / 6 warning、typecheck 7 项目、gates:docs 22、ai-governance 0 warning、YAML 可解析。

### M67.5 备份 `.tmp` 清扫年龄门槛（P3 🛠️）

- **目标**：`cleanupOldBackups` 不再无条件删除 `*.bak.tmp`，避免并发恢复 / 多实例共卷时删掉对端正在写的临时文件。
- **优先级**：P3（单实例串行路径不可达冲突；并发恢复或多实例共卷时可能 rename ENOENT 丢失该轮快照）。
- **范围**：
  - `apps/platform/server/database/backup.ts:235-265`：`.bak.tmp` 回收增加 mtime 年龄门槛（默认 10 分钟，可注入 now）；
  - `apps/platform/server/database/backup.test.ts:237+`：新鲜 / 陈旧 / 混合 / 目录缺失 / retention=0 用例。
- **验收标准**：
  - AC1：mtime 在门槛内的 `.bak.tmp` 保留，超过门槛的残留删除，边界用注入 now 做确定性断言；
  - AC2：`.bak` 保留策略（按 mtime 倒序保留 N 份）与返回删除计数零回归；目录不存在返回 0；
  - AC3：单测覆盖五种形态，`pnpm --filter @dependfix/platform test -- backup` 通过。
- **不做什么**：不改备份文件名格式；不引入 PID 命名（作为 D5 备选，不在本原子默认实施）；不改 retention 语义。
- **依赖**：M53.2 现有清理实现（`fafb2faa` / `4d8e5532`）；`backup.test.ts`。
- **交付物**：2-3 commits / 3-5 files / 80-160 行；① 实现 + 单测 ② 数据库设计 / 运维说明（如行为可见）。
- **风险与缓解**：时钟偏移导致陈旧 tmp 永留 → 门槛只影响删除、不影响新建；多实例时钟差异 → 取保守 10 分钟并在文档标注；清理失败 → 保持 fail-open，不阻断备份创建。
- **执行记录（2026-11-25）**：D5 决策采年龄门槛（不引入 PID 命名），`TEMP_FILE_RETENTION_MS` 取 10 分钟并允许注入 `now`；`age >= 门槛` 才回收，stat 失败保守保留；返回计数仍只含 `.bak`。已知边界：单次备份超过 10 分钟的超大库仍可能被对端视为过期，文档标注后续按需引入 env。commits `6a178ef2` / `e2300fef` / 本条登记。审计 standard R1 Pass（3W）→ R2 Pass；验证：backup 27 passed（含边界 / 混合 / retention=0 / 悬空软链）、lint 0 error / 6 warning、typecheck 7 项目、gates:docs 22 项。
