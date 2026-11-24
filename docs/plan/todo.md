# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | M66 执行结果可信与失败归因（2026-11-23 规划，6 原子） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M65 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M65 已归档，M66 规划中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M66 执行结果可信与失败归因（2026-11-23 规划）

> **目标**：把「同 major 可修但交付不了」「checkpoint 偶发 unknown」「PR 关闭后分支残留 / push 失败不可归因」三类执行结果问题收敛为稳定结论与可判读证据；同时把验证跳过在交付载体中的可观测性与视觉基线的亚像素抖动收口。（原第四类「无补丁告警每天出现在跳过清单」已于 2026-11-24 阶段容量再平衡移出至 [backlog.md](backlog.md)，见下方容量再平衡记录。）
>
> **来源**：用户 2026-11-23 选定主题 A。上收 6 条候选——peer-only 同 major 回退到 manifest 直接依赖（P2）、无补丁版本告警的稳定结论（P3，区间部分已随 M62.3 上收；2026-11-24 再平衡移出）、checkpoint `unknown` 重试与证据（P3）、关闭 PR 分支清理与 `push_failed` 细分（P2）、验证跳过的交付可观测性残余（P3 🎨）、门户面板左缘亚像素抖动（P2 🧪）。直接输入为 2026-11-13 / 11-16 运行日志复盘、M52.4 视觉残余与 M48.4 交付边界。
>
> **§3.4 五步交叉核验（2026-11-23 实测；已有实现只列缺口，不重复上收）**：
> ① 归档扫描 `peer-only|first_patched_version|stash create|push_failed|deliverySkips|dialog-select-open-dark` → 已有「peer-only manualReview 归因」「checkpoint freshLock 重试」「supersede 分支回收」「交付跳过契约」「亚像素登记」；缺口分别是：无补丁无稳定结论、非 `freshLock` unknown 无处置、平台 PR 反馈关闭未删分支、`push_failed` 固定 unknown、验证跳过未进交付载体；
> ② `git log --all --grep`：peer-only 归因 `7f2c28f4` / `06f6b580`；checkpoint freshLock 重试 `ea323c1c`；supersede 删分支 `04c6689a`（T212；`e1aad1e4` 为模块迁移）；交付跳过 `aa900622` / `67a75964`；亚像素登记 `b436030f`——均为部分实现，无整项重复；
> ③ 代码 anchor：`packages/engine/src/github/dependabot-fetcher.ts:95-96` 以 `first_patched_version !== null` 判 fixable；`packages/engine/src/fixers/dependency/index.ts:333-346` 对 peer-only 只给 `manualReview`；`packages/engine/src/app/verification-checkpoint.ts:242-252` 仅 `freshLock` 时重试；`packages/engine/src/app/branch-cleanup.ts:112-146` 在 supersede 关闭后删分支，而 `apps/platform/server/services/pr-feedback/service.ts:190-192` 只关闭不删；`apps/platform/server/services/run-failure-classify.ts:165` 固定 `deliver` + `unknown`（[taxonomy §7](../design/governance/run-failure-taxonomy.md#_7-风险与开放问题) M37.1 决策）；`deliverySkips` 与 `verificationSkippedByReason` 并存；`apps/platform/tests/visual/README.md:136` 记录 1/10 抖动；
> ④ 决策前提：用户已选主题 A；peer-only 回退形态（D1）、无补丁结论承载（D2，已随 M66.2 移出撤销）、非 freshLock unknown 处置（D3）、平台关闭分支与 `push_failed` 映射（D4）、`deliverySkips` 归属（D5）、视觉根因（D6）均留 D 阶段；
> ⑤ backlog 同步：6 条上收（候选池 28 → 22；2026-11-24 再平衡回补 → 23），保留「批次续跑并发原子性」等未上收项；同批清理已上收历史口径（Axiom 决策注 / installer 括注 / T705 Sentry 括注）与空派生段，`check-doc-governance` 无新增 warning。
>
> **容量基线（逐原子交付物求和，规划轮估算；行 = diff 改动量含删除；测量方 = 规划角色）**：原子基线 commits 16-22 / files 30-47 / 行 1,170-2,070（M66.1 / M66.3-M66.6 五原子 + M66.7 插队原子）；**含「pnpm store 双份并存治理」临时批的执行预算 19-26 / 37-57 / 1,420-2,520**；剔除已闭环 M66.7 / pnpm store 临时批 / M66.1 / M66.3 后的剩余执行预算（M66.4-M66.6）8-11 commits / 15-24 files / 600-1,050 行。pnpm store 临时批实际 3 commits / 10 files / +261 −53（预算内，文件数触顶）。2026-11-24 再平衡前为 19-27 / 36-59 / 1,370-2,520（移出 M66.2 3-5 / 6-12 / 200-450、回补 pnpm 批 3-4 / 7-10 / 250-450）。
> 类型（按主类型计数）：🛠️3（M66.1 / M66.3 / M66.4）+ 🎨2（M66.5 / M66.7）+ 🧪1（M66.6）；🛠️ 内嵌「pnpm store 双份并存治理」临时批（磁盘 / 运维面）、🛡️ 内嵌 M66.4 与 API 安全审计临时批、🚀 内嵌 M66.1 / M66.7（交付能力）。
> **插队（2026-11-23 / 11-24 用户授权）**：M66.7 API 密钥管理入口（3-4 commits / 5-8 files / 200-350 行）+「API 安全审计闭环」临时批（2-3 / 4-6 / 120-220）+「pnpm store 双份并存治理」临时批（3-4 / 7-10 / 250-450，2026-11-24 追加）。**累计 3 批命中 [§3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 阈值 1（≥ 3 批）→ 已再平衡**（50% 阈值因容量基线端点歧义不计）。剩余窗口：M66.4-M66.6 未开始；M66.7、安全审计配套、pnpm store 治理临时批、M66.1、M66.3 已于 2026-11-24 闭环。
>
> **容量再平衡：移出 M66.2「无补丁版本告警的稳定结论」→ [backlog.md](backlog.md)；插队 3 批（2026-11-23 / 11-24）；用户 2026-11-24 确认。**
>
> **执行顺序**：M66.7（可用性插队，已闭环）→「API 安全审计闭环」临时批（已闭环）→「pnpm store 双份并存治理」临时批（已闭环）→ M66.1（已闭环）→ M66.3（已闭环）→ M66.4 → M66.5 → M66.6（先恢复 MCP remote 可用性与审计，再修可修性 / 交付证据；M66.6 放最后，避免 UI / 基线连带）。
>
> **D 阶段决策点**：D1（M66.1）回退形态（根 manifest vs 成员 manifest 直接依赖）、锁定范围与回滚单元；D3（M66.3）非 `freshLock` unknown 是否补一次有界重试、证据字段；D4（M66.4）平台 PR 反馈关闭后删分支的时机、`push_failed` 前缀映射与 M37.1 决策翻转记录；D5（M66.5）`deliverySkips` 家族登记 vs 保持独立字段；D6（M66.6）根因（门户定位取整 / 滚动条宽度）与处置（亚像素修正 vs 元素级取景）。（D2 随 M66.2 移出，编号保留不复用。）
>
> **前置 / 风险**：peer-only 回退涉及目标仓库 manifest 写入，必须限定单包字段 + 原文件回滚；checkpoint 只对非 freshLock unknown 增量处置；平台删分支仅限 `dependfix/auto-fix-*` 且带 headSha / 归属校验；`push_failed` 只在明确前缀映射，未知保持 `unknown`；视觉处置若改元素级取景，须用反例标定保留灵敏度；pnpm store 治理的入口检出必须保持 fail-open（读目录失败只 warn 不阻断）。

### 进度总览

| 大条目 | 小条目 | 状态 | 提交 | 审计 | 容量 |
|:--|:--|:--|:--|:--|:--|
| M66.1 peer-only 同 major 回退 | — | ✅ 已闭环（2026-11-24） | `b95754ed`..`0c247c7c`（3，含文档） | fixer deep R1 Reject → R2 Reject → R3 Reject → R4 Pass；编排 deep R1 Pass → R2 Pass | 计划 3-4 commits / 6-9 files / 250-450 行；实际 3 commits / 13 files / +1,626 −39（超 files / 行预算，新增模块 + 夹具密集型用例；已按 fixer / 编排 / 文档三批分提交） |
| M66.3 checkpoint 非 `freshLock` unknown 处置 | — | ✅ 已闭环（2026-11-24） | 2（代码 / 文档） | standard R1 Pass（0B / 3W / 3S，W1-W3 + S1/S2 已收口） | 计划 2-3 commits / 4-6 files / 120-220 行；实际 2 commits / 4 files / +183 −18 |
| M66.4 平台分支回收与 `push_failed` 细分 | — | ⬜ 待开始 | — | — | 3-4 commits / 6-10 files / 250-450 行 |
| M66.5 验证跳过的交付可观测性 | — | ⬜ 待开始 | — | — | 3-4 commits / 5-8 files / 200-350 行 |
| M66.6 门户面板左缘亚像素抖动 | — | ⬜ 待开始 | — | — | 2-3 commits / 4-6 files / 150-250 行 |
| M66.7 API 密钥管理入口（插队） | — | ✅ 已闭环（2026-11-24） | `382b782a`..`9f4da628`（5，含安全审计配套） | UI deep R1/R2 Reject → R3 Pass；服务端 deep R1/R2 Reject → R3 Pass | 计划 3-4 commits / 5-8 files / 200-350 行；实际 5 commits / 38 files（含 19 张视觉基线）/ +807 −19 |

> `提交` 列为首末 commit 区间与**该条目自身** commit 数；`审计` 列为 Review Gate 轮次结论；小条目列在原子内拆分子任务时填写。
> M66.2「无补丁版本告警的稳定结论」已于 2026-11-24 按 §3.1.1 阶段容量再平衡移出至 [backlog.md](backlog.md)（候选池 +1），编号不复用；剩余 5 原子 + 1 临时批见阶段头「执行顺序」。

### M66.1 peer-only 同 major 修复回退到 manifest 直接依赖（P2 🛠️）

- **目标**：同 major 可修告警在 versioned overrides 对 peer-only 实例无效时，改为提升声明该包的 manifest 直接依赖并完成验证；无可提升点时输出「需人工」结论与文件 / 版本建议，而不是回滚后无结论。
- **优先级**：P2（2026-11-13 运行复盘：`rss-to-memos-sync` 的 vite 8.3.1 → ^8.3.3 以 peer-only 失败回滚；`sharp-cloud-uploader` 同形态再次出现，同 major 可修却交付不了）。
- **范围**：
  - `packages/engine/src/fixers/dependency/manifest.ts` / `manifest-upgrades.ts`：override 未覆盖 peer-only 时的直接依赖提升路径（根 / 成员 manifest 定位、锁定范围、单包字段写回）；
  - `packages/engine/src/fixers/dependency/index.ts:333-346`：`manualReview` / peer-only 分流点（先尝试 manifest 提升，再落 `needs_manual`）；
  - `packages/engine/src/app/upgrade-alert.ts`：`peer-only` skipped 与「需人工」结论的分流（不把可修形态记为跳过）；
  - 回滚单元与无写入结论：提升失败时恢复原 manifest，沿用既有 checkpoint / 回滚链；
  - 报告与运行详情：提升点、结论或需人工原因可判读。
- **验收标准**：
  - AC1：在 `packages/engine/src/fixers/dependency/peer-only-promotion.test.ts` 构造 peer-only 夹具（override 不生效）→ 自动提升声明该包的 manifest 直接依赖并验证通过（从 `dependency-upgrade.test.ts` 拆出以满足 max-lines）；
  - AC2：无可提升 manifest / 多包冲突时输出 `needs_manual`，附文件与版本建议，不落「无写入」空结论；
  - AC3：提升失败或验证失败时原 manifest 逐字节恢复，回滚单元与既有 override 路径一致；
  - AC4：既有 `peer-only` 跳过口径与 `override-protected` 归因零回归；
  - AC5：报告与运行详情可区分「已提升 / 需人工 / 跳过」三态。
- **不做什么**：不改 overrides 优先级；不自动修改 `peerDependencies`；不扩大到跨 major；不改锁文件解析器。
- **依赖**：M62.3 跨 major 判定；M64.3 预算透传；[dependency-fixer-records.md §12](../design/modules/dependency-fixer-records.md)。
- **交付物**：3-4 commits / 6-9 files（manifest 写回 + 结论分流 + 用例 + 文档）/ 250-450 行；单 commit ≤ 10 files。
- **风险与缓解**：manifest 写入混入无关改动 → 只改目标包字段并逐字节回滚；多成员 manifest 提升点不确定 → 先按依赖树可达性排序并输出理由；提升后 peer 约束冲突 → 验证失败即回滚并落 `needs_manual`。

### M66.3 checkpoint 非 `freshLock` unknown 的处置与证据（P3 🛠️）

- **目标**：`git stash create` 失败但 probe 未发现 `freshLock`（unknown）时，按 D3 补一次有界重试或补足证据后降级；不改变既有 `freshLock` 重试语义。
- **优先级**：P3（2026-11-16 复盘：dependfix ×3 + sharp-cloud-uploader 报 unknown，probe 无锁 / 权限 / 磁盘异常）。
- **范围**：
  - `packages/engine/src/app/verification-checkpoint.ts:232-258`：非 `freshLock` unknown 分支的处置（重试或证据）；
  - 降级证据：`git version`、并发 git 提示与失败命令回显；
  - 用例：`freshLock` 有 / 无两向，重试成功与持续失败。
- **验收标准**：
  - AC1：既有 `freshLock` 触发的一次重试零回归（`LOCK_RETRY_DELAY_MS` 口径不变）；
  - AC2：非 `freshLock` unknown 按 D3 决策有断言（重试成功不落 unknown，或直接降级且证据可判读）；
  - AC3：重试总耗时 ≤ 250ms × 1 或 D3 设定上限，不放大执行预算；
  - AC4：选择性回滚与既有 checkpoint 用例零回归。
- **不做什么**：不把 `unknown` 升级为 abort；不改 `git stash create` 命令语义；不引入全局重试框架。
- **依赖**：`verification-checkpoint-degraded.test.ts`；M64.3 预算透传。
- **交付物**：2-3 commits / 4-6 files（处置 + 证据 + 用例）/ 120-220 行。
- **风险与缓解**：重试掩盖真实锁竞争 → 仅在 D3 允许的路径且单次；测试注入时序不稳 → 用可注入 sleep / 命令桩。

### M66.4 平台 PR 反馈分支回收与 `push_failed` 细分（P2 🛠️）

- **目标**：平台 PR 反馈按 `closeFailed` 关闭 PR 后回收 head 分支（对齐引擎 supersede 路径）；`push_failed` 至少区分 non-FF / auth / network，并把 M37.1「保持 unknown、不解析 message」的决策翻转记录到 taxonomy。
- **优先级**：P2（`pr-feedback` 关闭后残留 `dependfix/auto-fix-*` 分支；`push_failed` 需人工翻 `error.message`）。
- **范围**：
  - `apps/platform/server/services/pr-feedback/service.ts:190-192`：关闭后删除 head 分支（`deleteRemoteBranch` 定义于 `packages/engine/src/github/pr-creator.ts:470`，复用 `branch-cleanup.ts:112-146` 的调用口径）；
  - `apps/platform/server/services/run-failure-classify.ts:165` / `:233-249` + `platform-delivery.ts:119,210`（D4 二选一：新错误码或前缀解析）：`push_failed` 细分为 non-FF / auth / network，其余 unknown；重试入口 `api/runs/[id]/retry.post.ts:58` 与 `services/batch/batch-resume.ts:50` 仅 transient 生效；
  - 删除结果复用 `recordDeliveryCleanupEvent`（`sandbox-delivery-cleanup.ts:48`）或明确新审计类型；
  - `docs/design/governance/run-failure-taxonomy.md §7`：M37.1 决策翻转与依据；UI / 报告口径同步。
- **验收标准**：
  - AC1：`closeFailed` 关闭 PR 后，仅当 `pull.head.sha === prCheck.headSha` 且分支名匹配 `dependfix/auto-fix-*` 时删除 head 分支，否则落清理记录 / 跳过；非自有分支零误删；
  - AC2：三类映射定 stage / kind（建议 non-FF / auth = `deliver` + `deterministic`、network = `deliver` + `transient`），并写明对重试入口的影响；未知保持 `unknown`；
  - AC3：taxonomy 决策记录更新（M37.1 翻转）+ taxonomy / 运行详情 / 报告三处一致；
  - AC4：引擎 supersede 分支回收路径零回归。
- **不做什么**：不自动关闭 / 合并 PR（`closeFailed` 为既有配置）；不解析非自有分支；不做模糊正则猜测。
- **依赖**：T212 `branch-cleanup.ts`；M37.1 失败分类；`pr-delivery-closure.md §6`（尝试计数边界）。
- **交付物**：3-4 commits / 6-10 files（平台删分支 + 分类映射 + 决策记录 + 用例）/ 250-450 行。
- **风险与缓解**：删分支竞态 → 先比对 headSha 与 `dependfix/auto-fix-*` 归属；stderr 前缀漂移 → 仅白名单前缀映射；决策翻转遗漏 → taxonomy 与检查点矩阵同批更新。

### M66.5 验证跳过的交付可观测性（P3 🎨）

- **目标**：验证跳过原因在交付载体与运行详情中可判读——明确「是否登记到 `deliverySkips` 家族」的单一结论，并让「修了 N 条、交付 0 条」可直接解释。
- **优先级**：P3（报告与详情已有独立 `verificationSkippedByReason`，但交付载体缺少同源解释）。
- **范围**：
  - `packages/core/src/report/types.ts`：`deliverySkips` 家族登记决策（登记 or 明确不登记 + 理由）；
  - `packages/core/src/report/markdown-generator.ts` 与平台运行详情：跳过原因与交付结论同源展示；
  - issue / 草稿 PR 载体文案：附带跳过原因（若 D5 选择登记）。
- **验收标准**：
  - AC1：报告、运行详情与交付载体对同一跳过原因口径一致（或明确标注「仅运行级」）；
  - AC2：`budget` / `no-write` 与验证跳过的区分保持可判读；
  - AC3：既有 `verificationSkippedByReason` 契约零回归；
  - AC4：组件 / 快照用例覆盖新文案或新字段。
- **不做什么**：不改跳过判定本身；不新增独立通知通道；不合并两套字段而不留迁移说明。
- **依赖**：M51.4 交付跳过契约（`aa900622` / `67a75964`）；`deliverySkips` 现有报告段。
- **交付物**：3-4 commits / 5-8 files（契约决策 + 报告 / 详情 + 用例 + 文档）/ 200-350 行。
- **风险与缓解**：双字段语义重叠 → D5 单点决策并写迁移说明；UI 空间不足 → tooltip / 折叠明细，不改信息层级。

### M66.6 门户面板左缘亚像素抖动（P2 🧪）

- **目标**：定位 `dialog-select-open-dark` 左缘 99 px / maxΔ2 抖动来源并消除，或改用元素级取景同时保留灵敏度。
- **优先级**：P2（仅剩 1 px 预算，抖动放大会偶发红）。
- **范围**：
  - `apps/platform/tests/visual/`：门户定位 / 滚动条宽度排查与处置（亚像素修正或元素级取景）；
  - 基线重建与反例标定；README 记录根因与边界。
- **验收标准**：
  - AC1：连续 10 次 `--update-snapshots=all` 稳定（0 次 99 px 抖动；手动 / 夜间批次执行，单轮约 25s，估算）；
  - AC2：反例注入仍能触发失败（灵敏度不降）；
  - AC3：不遮罩目标内容边缘，不改门禁阈值；
  - AC4：视觉 README 记录根因、处置与残余边界。
- **不做什么**：不靠放大 `maxDiffPixels` / `threshold` 绕过；不删除该基线；不引入全局等待加长。
- **依赖**：M52.4 视觉确定性口径；`waitForVisualStable` 两帧检查。
- **交付物**：2-3 commits / 4-6 files（定位 / 处置 + 基线 + README）/ 150-250 行。
- **风险与缓解**：根因在浏览器亚像素 → 元素级取景兜底并保留视口级反例；基线重建引入新差异 → 逐字节比对 + 两轮复跑。

### M66.7 API 密钥管理入口（P0 🎨，2026-11-23 插队）

- **目标**：平台提供 API 密钥管理页（列表 / 创建 / 一次性明文 / 吊销），使 MCP remote 用户可在 UI 自助创建 `dfk_` key；当前只有 `POST /api/v1/keys` 接口、无任何页面入口，MCP remote 实际不可用。
- **优先级**：P0（直接影响 MCP remote 可用性；用户 2026-11-23 判定为严重故障并授权插队）。
- **范围**：
  - 新增 `apps/platform/app/pages/api-keys.vue`：列表（name / 前缀 / 创建 / 过期 / 最近使用）、创建、一次性明文弹窗 + 复制、吊销二次确认；
  - `apps/platform/app/layouts/default.vue`：导航入口仅 `admin` / `org_admin` 可见；
  - `apps/platform/app/types/platform.ts` 与 i18n zh / en：Key 视图类型与文案；
  - `apps/platform/app/pages/settings.vue` 或导航说明指向该页（不新增重复入口）。
- **验收标准**：
  - AC1：`admin` / `org_admin` 可从导航进入并在 UI 创建 key，创建响应的一次性明文可见且可复制；
  - AC2：列表显示前缀 / 创建时间 / 过期时间 / 最近使用；吊销二次确认后从列表消失，且该 key 再请求 v1 返回 401；
  - AC3：非 `admin` / `org_admin` 无导航入口，直接访问时服务端 403 且页面给出明确提示；
  - AC4：明文只存在组件内存，不写 localStorage / sessionStorage / 日志；关闭弹窗或刷新后不可再取；
  - AC5：i18n zh / en 键完整；用例覆盖「创建 → 列表 → 吊销」主路径（e2e 或组件级）。
- **不做什么**：不改 key 格式 / TTL / scope 模型；不做 key 重命名 / 禁用；不做多组织切换；不把明文写入任何持久化。
- **依赖**：M63.2 / M63.3 的 `/api/v1/keys` 端点与 `requireRole`；caomei-ui 现有表格 / 弹窗组件。
- **交付物**：3-4 commits / 5-8 files（页面 + 导航 + 类型 + i18n + 用例）/ 200-350 行。
- **风险与缓解**：明文泄露 → 仅内存 + 复制按钮 + 关闭即清；角色判断漂移 → 服务端 403 仍为准，UI 只做入口隐藏；页面体量 → 复用 credentials 页模式，超 800 行前拆组件。

### 追加临时待办（不占阶段条目编号）

- **API 安全审计闭环（2026-11-23 用户授权插队；可用性修复配套）** —— 目标：key 创建 / 吊销落 AuditEvent；无效 key 的 401 尝试按 IP 限速记录（同 IP + keyHint 去重、每 IP 每分钟最多 5 条）；会话回退边界写入文档。范围：`apps/platform/server/entities/audit-event.ts`（新增 `api_key_created` / `api_key_deleted` 类型）、`apps/platform/server/services/api-key-audit.ts`、`api/v1/keys/index.post.ts` 与 `[id].delete.ts`、`apps/platform/server/utils/api-key-guard.ts`（401 日志）、`docs/guide/api-v1.md` 与 `platform-public-api.md §5`。验收：① 创建 / 吊销各产生 1 条 AuditEvent（payload 无明文 / 哈希）；② 无效 key 请求产生限速日志（IP / keyHint / 路径，不含完整 key；同 IP + keyHint 1 分钟去重、每 IP 每分钟最多 5 条）；③ 文档声明会话回退无 scope / 限流 / 访问日志；④ 既有 keys / guard 用例零回归。不做：不改 key TTL / scope；不引入 Redis 多实例限流；不改 `api_request_log` schema（401 走进程日志）。交付物：2-3 commits / 4-6 files / 120-220 行。**闭环（2026-11-24）**：`ca9fc249` / `8df962f5` / `7bf19000`；审计 deep R1/R2 Reject → R3 Pass；mutation 2/2（去掉每 IP 上限、keyHint 改回 `dfk_` 前缀均使用例变红）。
- **pnpm store 双份并存与无界增长治理（2026-11-24 用户授权追加；严重磁盘问题）** —— 目标：消除数据卷内「受管 store + pnpm 自动 per-filesystem store」双份并存导致的占用翻倍，并让该类遗留可被发现、可被判据清理；设计口径见 [pnpm-store-hygiene.md](../design/governance/pnpm-store-hygiene.md)。背景：2026-11-24 宿主机实测 `/root/projects/dependfix` 16 GB = `data/pnpm-store` 8.7 GB + `data/.pnpm-store` 6.6 GB（同一批依赖两份，`data/runs` 仅 85 MB）。范围：① `apps/platform/docker/entrypoint.sh` 启动时检出 `$DATA_DIR/.pnpm-store`（存在且 ≠ 受管 store → 恰一条 warn，含路径与清理命令，不自动删除）+ 回退分支文案更正为 pnpm 实际落点；② `apps/platform/docker/entrypoint.test.mjs` 用例（遗留目录存在 / 不存在 / 与受管 store 同路径三态 + 不触碰该目录的断言）；③ `docs/guide/deployment.md` 与 `docs/i18n/en-US/guide/deployment.md` 新增「双份 store 成因与判定」，备份 `--exclude` 覆盖 `./pnpm-store` 与 `./.pnpm-store`；④ `docs/guide/configuration.md` 与 en-US 的 `PNPM_CONFIG_STORE_DIR` 行更正回退口径。验收：① 数据卷根存在遗留 `.pnpm-store` 时入口输出恰一条 warn，且不删除 / 不 prune / 不建目录 / 不写入（root 启动的整卷属主归一化属既有行为，见设计 §3 I2），不存在时零输出；② 回退文案不再声称回退到 `$HOME`；③ zh / en 结构可映射 + 备份排除项两种目录名齐备；④ `gates:docs` 全绿；⑤ 运维清理 runbook（prune → 停容器 → 单路径删除 → 复核 `pnpm store path`）落在设计文档 §5.1。不做：不自动删除 / 自动 prune 用户数据卷目录；不做 store 体积指标接口与阈值告警（按规划规范 §3.1 评估后登记 backlog，先观察清理后的增长曲线）；不改 `RUN_WORK_ROOT` 与镜像分层。交付物：3-4 commits / 7-10 files / 250-450 行。**风险与依赖**：入口新增检出必须保持 fail-open（读目录失败只 warn 不阻断）；已完成的 [`pnpm-store-hygiene.md`](../design/governance/pnpm-store-hygiene.md) 与 governance 索引为本批前置。**交付形态（§2.6）**：无头（入口 `warn` + 运维 runbook，经 `docker logs` 可达）；不新增 UI / API，理由：诊断面属部署运维，界面化无额外可达性收益。**§3.4 交叉核验（2026-11-24）**：① 归档仅 M47.4「pnpm store 持久化与提交卫生」，无遗留检出 / 清理内容；② M47.4 清单 5 个 commit（`6acaf252` / `083b7a66` / `50e55e61` / `64f10c57` / `1dd677e3`）逐条 `git show` 无 `.pnpm-store` 检出；③ anchor：`apps/platform/docker/entrypoint.sh:81` 只派生受管路径、无 `.pnpm-store` 探测；`docs/guide/deployment.md:146`（默认落点）与 `docs/guide/configuration.md:355`（回退口径）仍按 `$HOME` 表述——缺口成立。**容量**：累计插队达 3 批，命中 §3.1.1 阈值 1 → **再平衡已于 2026-11-24 经用户确认执行**：移出 M66.2「无补丁版本告警的稳定结论」至 `backlog.md`（三处一致：① 阶段头「容量再平衡」行 / ② 本条 / ③ 阶段归档时在 `archive/archive-log.md` 批次记录登记「插队 3 批 / 再平衡移出 1 项」）。**闭环（2026-11-24）**：`b7f58e33` / `6e7cdad5` / `0ad6e214`（入口检出告警 + zh / en 文档 + 治理登记）；审计 deep 两分区（代码 / 文档）：R1 代码 Pass·文档 Reject → R2 双 Pass → R3 双 Pass；mutation 实测（删 readlink 真实路径比较 → 2 例变红；删 root 分支调用 → 1 例变红）；`entrypoint.test.mjs` 新增 6 例全绿 ×3 轮；`gates:docs` 22 项；deployment.md 500 行 / en 497 行（健康窗口内）。运维清理（设计 §5.1）待宿主执行，不随代码发布。
