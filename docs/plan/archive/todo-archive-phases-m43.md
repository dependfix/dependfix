# 待办事项归档分片：M43

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-19 M45 阶段归档批次：M45 段新增后主窗口超出 500 行健康窗口，按「主窗口保留最近 3-5 个完整段」+ 行数阈值处置；M43 为主窗口次早完整段，随后迁出）。
> 完整段内容与 commits 如下；阶段规划与闭环摘要另见 [archive/index.md](index.md)。

## M43: PR Check 能力补强 + 运行时可靠性与工程治理（2026-10-12 用户决策方案 A / 2026-10-14 归档）

> **归档日期**：2026-10-14
> **阶段摘要**：承接 M42 归档后的「平台能力补强 + 运行时可靠性」两条线。2026-10-12 用户裁定**方案 A**：从 backlog §候选评估中上收 4 项 + §待上收候选上收 2 项（其中两条各合并为 1 原子），收敛为 **6 原子条目**；阶段期间发生 **caomei-ui `0.6.0` 升级回归插队热修**（不占阶段编号，按 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 插队例外清单第 3 类「CI 主链路阻塞」+ 用户授权处置）。**6 原子条目全部闭环**，覆盖 🎨 2 + 🚀 1 + 🛡️ 2 + 🛠️ 1。
>
> - **前置插队热修（不占阶段编号）**：caomei-ui `0.6.0` 升级回归（排序角标全列保留占位 / 弹窗底色改 `bg-elevated` / 样式基线漂移）—— `b7bb300` + `fed1c9a` + `3c99a09`
> - **阶段启动规划**：`68ad47f`
> - **M43.1** [P2 🎨] PR Check 监测列表补齐所属仓库标识（独立「仓库」列 `owner/name` + 服务端 join 同源口径）—— `23ad252` + `9f9b4b2` + `edbe5e0`
> - **M43.2** [P2 🚀] PR 构建 / 部署错误多源采集（PR Check 扩展为信号聚合层；D1 = Option A 三列 / D3 = 全量只报警不阻断）—— 定稿 `3114088`；**M43.2a 采集层** `665fb69` + `6aab820` + `8912cdf` + `f3d9381` + `9a5a489` + `cf96766` + `f95e357` + `1162690` + `a1feab3` + `2790700` + `70f4853`；**M43.2b 持久化与 API** `dc79dbe` + `9d011a8` + `0ac4071` + `bd97b51` + `4a94c8f` + `7110f46` + `4841a3e` + `55d79bb` + `6488a92`；**M43.2c UI 多源展示** `f417ab3` + `1d12803` + `fe6e529` + `9bd0667`；批次登记 `3fc588d` + `f659765`
> - **M43.3** [P2 🛡️] 容器内 `pnpm install` 环境性失败可观测性与归因口径（进程级信号保留 + 不归因 + 零告警仅跳 lockfile repair）—— `4fee403` + `66b7966` + `602f5bd` + `cbadeaa` + `1a6aca1`
> - **M43.4** [P2 🎨] 扫描触发被去重合并时的前端感知（两入口消费顶层 `merged` + warning 提示 + 不跳转）—— `11d7404` + `b7d2256` + `88c6c92`
> - **M43.5** [P3 🛡️] git 边界收口（`hasGitChanges` 非仓库语义 + push 侧 `pre-push` 钩子隔离 + 规范扩为「签名 + hooks」双口径）—— `8a6c84e` + `cae76b8` + `c436a77` + `24529ab`
> - **M43.6** [P3 🛠️] 工程脚本加固（门禁产物排除 + 蒸馏计数假阴性）—— `448ce7b` + `1f234d0` + `8373eba` + `5659bd0`
>
> **commit 数量实证**：`git log master --first-parent --oneline 68ad47f^..HEAD` 去重统计 = 阶段启动 1 + 前置热修 3 + M43.1 3 + M43.2 27 + M43.3 5 + M43.4 3 + M43.5 4 + M43.6 4 = **50 commits**；同区间另有 1 条并行 session 的候选登记（`695065f` 暗色浮层基线非确定性候选）与 1 条 merge（`98a10fe`）不计入本阶段；依赖升级 commits 位于该 merge 的第二父链，不落在首父链范围内（同 M41 惯例）。
>
> **关键决策**（2026-10-12 用户裁定 + 各原子 D 阶段定稿）：
> - **D1（阶段组合）**：方案 A——6 项候选收敛为 6 原子（🎨 2 / 🚀 1 / 🛡️ 2 / 🛠️ 1），🧪 独立条目缺口显式标注（测试随各条目内嵌）。
> - **M43.2 D1-D4**：数据模型 = Option A（`PRCheck` 增 `signalsJson` / `overallStatus` / `failureSourcesJson`，`conclusion` 保留为最坏派生态，既有 API / UI / ack 语义不变）；不做 provider 原生 API 日志富化（留后续增量）；告警关注集 = 全量只报警不阻断（不引入配置面）；provider 凭据承载本批不涉及。
> - **M43.3 D1-D3**：归因口径 = **不归因本次运行**（环境性安装失败不计入失败动作）；审计 R1 blocker 回流后**收窄为「仅跳过 lockfile repair」**（原「零告警整段跳过收尾」会使多仓出口码由 1 退化为 2）；可见性 = 最小实现（执行日志 + 报告，不新增平台环境事件类型与 i18n 键）。
> - **M43.4 D1-D2**：命中去重合并时**不跳转**（避免把用户带到未执行的既有 run）；提示通道 = **新增 warning 状态**（`fixMerged` / `scanMerged` + 共用 i18n 键，两入口口径一致）。
> - **M43.5 D1-D3**：非仓库语义 = **源头收口 + 门禁守卫**（`hasGitChanges` 非仓库返回 `false` + 门禁非仓库跳过回滚）；push 隔离覆盖面 = **全量 4 处**（含 `push --delete`）；backlog「hooks 隔离规范锚点与命名收敛」= **扩展 `git.md §3.8`、不做改名**（改名单独登记为候选）。
> - **M43.6 D1-D2**：产物排除 = **目录名精确排除**（不采用统一 `.gitignore` 策略）；计数格式面 = **两种日期+类型形态都兼容** + 疑似条目 stderr 告警（stdout 契约与退出码语义不变）。
>
> **类型平衡复核**：🎨 用户体验 2（M43.1 / M43.4）/ 🚀 能力扩展 1（M43.2）/ 🛡️ 技术债与可观测性 2（M43.3 / M43.5）/ 🛠️ devEx 1（M43.6）——符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 类型平衡建议；🧪 独立条目缺口显式标注。
>
> **关键实证**（细节见各条目闭环记录与相关设计文档）：
> - **前置热修**：根因 = dependabot 仅改版本号与 lockfile 未做迁移实证 → master `Test` job（E2E + 视觉回归）阻塞；机制 = 排序角标在 `sort-mode=multiple` 下全列渲染占位（断言 `toHaveCount(2)` 失效）/ 弹窗底色改 `bg-elevated`（暗色断言失效）/ Drawer · Popover 底色与圆角变更（基线漂移）；处置 = 断言适配 + `--update-snapshots=all` 强制重建 10 张基线 + 逐基线量化 + 依赖升级合并门禁前置写入规范。
> - **M43.1**：修复审计 warning 时发现真实实现缺陷——列定义 `width` 不约束非冻结列（`table-layout: auto`）→ 截断形同虚设，改为单元内固定上限并移除死 prop。
> - **M43.2**：三源归一化（check runs + commit statuses + deployments）+ provider 归因（含机器人形态归一化）+ 终态静默窗口节流 + 落库三列（前缀感知 + 幂等迁移）；**R1 审计 blocker = 新迁移未登记进数据源迁移数组**（生产路径永不执行、存量库永久缺列，全新库 / 单测 / 空库冒烟全绿构成假绿）→ 修复并补「登记一致性」与「存量库真实迁移链」两层用例 + mutation 标定。
> - **M43.3**：`classifyLockfileFailure` 保留退出码 / 信号 / 超时 / spawn errno + `ENVIRONMENT_ERROR` + `FixAction.environmentalFailure` 非归因 + 零告警仅跳 lockfile repair；mutation 6/6 击杀（含复现被否决的「整段跳过」设计）。
> - **M43.4**：**D 阶段实测拦截真实缺陷**——缺省 i18n 实现延迟求值使 `useI18n()` 在事件处理期被调用抛错 → 三条分支静默失效（单测注入桩不复现、typecheck / lint 0 报错，靠既有 e2e 全量复跑暴露）。
> - **M43.5**：`hasGitChanges` 非仓库语义（消除 fail-open landmine）+ 门禁非仓库跳过回滚 + push 侧 `--no-verify` 全量 4 处覆盖；`ROLLBACK_FAILED` 的可达触发方式改为空仓库（HEAD 不可解析）。
> - **M43.6**：门禁扫描面补排 Playwright 产物（产物在场与移出后结果完全一致）+ `distill-wisdom` 计数由 `0 active entries` → 真实条目数 + 疑似条目显式告警；门禁脚本自身源码会被扫为孤立编号（夹具改运行时拼接 token）。
>
> **审计**：A 阶段覆盖全部 6 原子条目 + 前置热修 —— 前置热修（standard 2 分区并发 Pass → R2 quick Pass → R3 quick Pass）；M43.1（standard Pass（1W）→ 修复 → quick Pass）；M43.2a（standard Pass（3W / 5S）→ R2 → R3）；M43.2b（standard **Reject**（迁移未登记）→ 修复 → quick Pass（1W）→ quick Pass）；M43.2c（standard Pass（1W）→ R2 Pass（1 新 W）→ R3 Pass）；M43.3（standard 2 分区并发 **P1 Reject**（零告警整段跳过致多仓出口码退化）+ P2 Pass → 修复 → 两分区 Pass → R3 Pass）；M43.4（standard 单分区 Pass（2W / 5S）→ R2 Pass（1W / 2S））；M43.5（standard 2 分区并发两分区 Pass（3W / 6S）→ R2 Pass（0W / 3S））；M43.6（standard 2 分区并发两分区 Pass（7W / 8S）→ R2 Pass（0W / 1S））。全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档前 `git rev-list HEAD ^origin/master --count` 实测 = **11**（`git rev-list origin/master ^HEAD --count` = 0 双向核验）；M43.1 / M43.2 / M43.3 及其前已由用户推送（归档前 `origin/master` = `1a6aca1`），剩余 M43.4 / M43.5 / M43.6 共 11 commits 待推送确认；**本归档 + 沉淀批次 commits 另计**，均待用户推送确认。
>
> **关联**：[roadmap.md §M43](roadmap-phases-m39-m48.md#m43-pr-check-能力补强-运行时可靠性与工程治理-2026-10-12-用户决策方案-a-2026-10-14-已闭环-归档) + [archive/index.md](index.md) + [pr-build-deploy-signals.md](../../design/governance/pr-build-deploy-signals.md) + [caomei-ui-migration.md §15.15](../../design/governance/caomei-ui-migration.md) + [run-failure-taxonomy.md](../../design/governance/run-failure-taxonomy.md) + [pnpm-lockfile-fixer.md §2.4](../../design/modules/pnpm-lockfile-fixer.md) + [git.md §3.8](../../standards/git.md) + [session-wisdom-distillation.md §6](../../design/governance/session-wisdom-distillation.md) + [backlog.md](../backlog.md)（M43 衍生候选）
