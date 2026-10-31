# 路线图阶段详情：M39-M48

> 本分片由 2026-10-26 文档治理批次从 [roadmap.md](../roadmap.md) 迁出；正文逐字保留；相对链接按新位置重指。
> 对应阶段正文见 [todo-archive.md](../todo-archive.md) 索引指向的分片。

---

## M39: 平台视图体验与可观测补强（2026-10-09 用户决策方案 A / 2026-10-10 已闭环 + 归档）

承接 M38 平台执行模型隔离归档后的平台视图体验与可观测阶段。2026-10-08 定时扫描批量失败的排查过程中，用户在同一批反馈 8 项平台问题，经 2026-10-09 用户决策（方案 A）归并为 6 原子进入本阶段；同批排查另有「既有基线失败被误判为运行失败」的引擎口径缺陷 1 项，已按 [§3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 可用性插队例外先行修复（`e5c59b8`，口径见 [dependency-fixer.md §12.9](../../design/modules/dependency-fixer-records.md)），不计入本阶段；其衍生的 3 项运行时可靠性候选（部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）留 [backlog.md](../backlog.md) 待评估。

**6 原子条目**（覆盖 🎨 3 + 🚀 2 + 🛡️ 1，接近 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束)；🧪 无独立条目，缺口已显式标注）：

- **M39.1** [P2 🎨 用户体验] 扫描页筛选与分页优化（byRepo 聚合表状态筛选 + 分页 / 分区 + `scan-history/summary` 端点参数）
- **M39.2** [P3 🎨 用户体验] 扫描历史弹窗体验（移除冗余 body 关闭按钮 + 日志区自适应高度）
- **M39.3** [P2 🎨 用户体验] 告警视图「按包」聚合跨 severity 重复分组修正（含视觉 / e2e 基线与三处文档口径）
- **M39.4** [P2 🚀 能力扩展] 运行日志下载与批量下载（单 run 导出 + 按筛选批量导出）
- **M39.5** [P2 🚀 能力扩展] PR Check 监测启用链路打通（`kind` 落库 + 表单 + 总开关入口 + env 文档）
- **M39.6** [P3 🛡️ 可观测与治理] 环境事件覆盖扩展（container 执行器事件源 + 死类型处置 + 类型口径统一）

**类型平衡复核**：🎨 用户体验 3（M39.1 / M39.2 / M39.3）+ 🚀 能力扩展 2（M39.4 / M39.5）+ 🛡️ 可观测与治理 1（M39.6）；🧪 测试无独立条目（随 M39.3 视觉 / e2e 基线重建与各条目内嵌），显式标注缺口。

**建议顺序**：M39.3（先定聚合判据，测试 / 文档面最广）→ M39.1（UX 核心 + 后端参数）→ M39.2（最小体验）→ M39.5（能力打通）→ M39.4（能力扩展）→ M39.6（可观测）。

**范围边界（不做什么）**：不改引擎修复 / 验证业务语义；不改 `/api/runs` 既有契约与 runs 列表三筛选语义；不引入新组件库 / 对象存储 / 外部告警系统；不实现 GitHub App 的 pr-check 路径（当前仅 PAT）；不改 sandbox 执行器行为。

**§3.4 交叉核验**：6 项候选经 todo-archive 表格扫描 + git log + 代码 anchor 三重核验，**0 项重复评估**（逐项证据见 [todo-archive.md §M39](todo-archive-phases-m39-m40.md#m39-平台视图体验与可观测补强-m39-1-m39-6-全部已闭环-2026-10-10-归档) 阶段摘要）。

**commits 状态**：阶段启动前的 `e5c59b8`（运行时口径修复）+ `da148f8`（候选登记）已随 `origin/master` 推送（实证：双向核验均为 0）；本阶段全部 commits 归档时为本地 ahead——`git rev-list HEAD ^origin/master --count` 实测 = **23**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），待用户推送确认。

> 详细任务与 8 要素见 [todo-archive.md §M39](todo-archive-phases-m39-m40.md#m39-平台视图体验与可观测补强-m39-1-m39-6-全部已闭环-2026-10-10-归档)（2026-10-10 已闭环归档）；上一阶段（M38）见 [todo-archive.md §M38](todo-archive-phases-m38.md#m38-平台执行模型隔离-m38-1-m38-6-全部已闭环-2026-10-09-归档)。

---

## M40: 运行时可靠性与可观测性深化（2026-10-10 用户决策方案 A / 2026-10-10 已闭环 + 归档）

承接 M39 平台视图体验与可观测补强归档后的运行时可靠性阶段。来源为 2026-10-08 定时扫描批量失败排查中暴露、且经 M38/M39 归档后仍保留在 [backlog.md](../backlog.md) 的运行时缺口（陈旧产物不可辨 / 失败 run 告警数误导 / 执行超时写死 / worker 崩溃无自愈 / 降级回退无日志），以及同批次审计 / 复核衍生的门禁工具缺口（本地门禁被 Playwright 产物污染）。经 2026-10-10 用户决策（方案 A）从 backlog §候选评估中上收 6 项候选；**同日追加用户决策 D2**：以「平台环境变量文档完整性治理」（用户直接提出的配置 / 文档治理需求）替换原 M40.6（门禁脚本产物排除 → 回退 backlog），维持 6 原子容量。

**6 原子条目**（覆盖 🚀 1 + 🎨 1 + 🛠️ 1 + 🛡️ 1 + 🐛 1 + 📚 1；🎨 独立条目 1 项低于 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束) 建议值 2，缺口已显式标注）：

- **M40.1** [P2 🚀 能力扩展] 部署产物版本戳 / 陈旧校验（构建期注入 commit + 健康端点 + 启动日志）
- **M40.2** [P2 🎨 用户体验] 失败 run 落 summary 快照（failed 分支写 `summaryJson`，仅快照不 reconcile）
- **M40.3** [P2 🛠️ 技术债] 执行超时可配置化（`EXECUTION_TIMEOUT_MS` env + 队列锁时长联动）
- **M40.4** [P2 🛡️ 可靠性] 队列 worker 进程崩溃自动重启（entrypoint 看护循环 + TERM 协同）
- **M40.5** [P2 🐛 缺陷修复] sandbox 降级回退路径落执行日志（回退分支消费 `logsJson`）
- **M40.6** [P2 📚 文档治理] 平台环境变量文档完整性与配置结构治理（`.env.example` 极简 + `.env.full.example` 完整 + `configuration.md` 平台段重构 + `trustedOrigins` 变量兼容）

**类型平衡复核**：🚀 能力扩展 1（M40.1）+ 🎨 用户体验 1（M40.2）+ 🛠️ 技术债 1（M40.3）+ 🛡️ 可靠性 1（M40.4）+ 🐛 缺陷修复 1（M40.5）+ 📚 文档治理 1（M40.6）；🎨 独立条目 1 项低于建议值 2，本阶段以可靠性主线优先，缺口显式标注。

**建议顺序**：M40.6（文档，隔离低风险）→ M40.5（最小缺陷修复）→ M40.2（服务端小改）→ M40.3（配置）→ M40.4（entrypoint 可靠性）→ M40.1（构建 / 基础设施，联动面最广）。

**条目调整**：2026-10-10 用户决策 D2——以「平台环境变量文档完整性治理」（用户直接提出）替换原 M40.6（门禁脚本排除 Playwright 产物 → 回退 [backlog.md](../backlog.md)），维持 6 原子容量。

**范围边界（不做什么）**：不改引擎修复 / 验证业务语义与告警模型；不改 `/api/runs` 既有契约；不引入完整 versioning 框架 / 进程管理器（除非 M40.4 D 阶段裁定）；不实现执行可取消（属既有边界）；不改 CLI（`DEPENDFIX_*`）配置项语义与平台 env 的既有权重默认值。

**§3.4 交叉核验**：原 6 项候选经 todo-archive 表格扫描 + git log + 代码 anchor 三重核验，**0 项重复评估**（逐项证据见 [todo-archive.md §M40](todo-archive-phases-m39-m40.md#m40-运行时可靠性与可观测性深化-m40-1-m40-6-全部已闭环-2026-10-10-归档) 阶段摘要）；其中 ⑥（门禁脚本产物排除）已随同日 D2 回退 backlog，新 M40.6（平台环境变量文档完整性治理）另行三重核验亦 0 项重复。

**commits 状态**：本阶段全部 commits 归档时为本地 ahead——`git rev-list HEAD ^origin/master --count` 实测 = **20**（阶段启动 1 + M40.6 5 + M40.5 2 + M40.2 2 + M40.3 4 + M40.4 3 + M40.1 3；`git rev-list origin/master ^HEAD --count` = 0 双向核验），待用户推送确认。

> 详细任务与 8 要素见 [todo-archive.md §M40](todo-archive-phases-m39-m40.md#m40-运行时可靠性与可观测性深化-m40-1-m40-6-全部已闭环-2026-10-10-归档)（2026-10-10 已闭环归档）；上一阶段（M39）见 [todo-archive.md §M39](todo-archive-phases-m39-m40.md#m39-平台视图体验与可观测补强-m39-1-m39-6-全部已闭环-2026-10-10-归档)。

---

## M42: 修复交付正确性 + 平台能力与体验补强（2026-10-10 用户决策方案 A+B 混合 / 2026-10-11 已闭环 + 归档）

承接 M41 规范与经验管理体系重构归档后的「缺陷修复 + 平台补强」阶段。阶段定位为贯穿两条线——**修复被 dependfix 管理仓库的实际受害面**（验证阶段镜像源被 deny-by-default 拦死 → `pnpm install` 失败 → 门禁全量回滚；目标仓库 `.gitignore` 幂等判定失效致重复追加；扫描复用路径与同仓库去重合并叠加时误置既有 run 为 failed）与**平台能力/体验补强**（PR Check 手动触发；列表页表格筛选/搜索/分页；严重级别展示口径统一）。经 2026-10-10 用户决策（方案 A+B 混合）从 [backlog.md](../backlog.md) §待上收候选 + §候选评估中上收 6 项，砍掉门禁脚本产物排除与 hooks 隔离锚点（P3 小项）换入 PL（平台）能力项。

**6 原子条目**（覆盖 🛡️ 2 + 🐛 1 + 🚀 1 + 🎨 2；🧪 独立条目缺口已显式标注，测试随条目内嵌）：

- **M42.1** [P2 🛡️ 安全治理] network-audit 出站白名单：预置常见镜像源 + 动态发现生效 registry（消除镜像源被 deny-by-default 拦死 → install 失败 → 全量回滚链路）
- **M42.2** [P2 🐛 缺陷] 目标仓库 `.gitignore` 幂等判定归一化（语义等价写法识别，消除重复追加 `dependfix-reports/`）
- **M42.3** [P2 🛡️ 数据正确性] 扫描复用路径与同仓库去重合并叠加时误置既有 run 为 failed 修复
- **M42.4** [P2 🚀 能力扩展] PR Check 手动触发（同步端点 + 总开关门控）
- **M42.5** [P2 🎨 体验] 平台列表页表格基础能力补强（repos / batch-runs 筛选 + 搜索 + 分页）
- **M42.6** [P3 🎨 体验] 严重级别展示策略统一（收敛到 `scanSeverityOptions` 单一事实源）

**类型平衡复核**：🛡️ 2（M42.1 / M42.3）+ 🐛 1（M42.2）+ 🚀 1（M42.4）+ 🎨 2（M42.5 / M42.6）；🧪 独立条目缺口显式标注（测试随各条目内嵌）——符合 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束)。

**建议顺序**：M42.1（安全治理，治理评审硬前置）→ M42.2 / M42.3（缺陷修复）→ M42.4（能力扩展）→ M42.5 / M42.6（体验收敛，可并行）。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限；M42.5 预估 5-8 文件 / 200-350 行未超单条 > 10 文件 / > 800 行阈值。

**范围边界（不做什么）**：不放开 network-audit deny-by-default（未知域仍拦）；不做镜像源真实性校验与审批流程（用户裁定，恶意代码执行风险由沙箱承接）；不引入 `.gitignore` 完整语法解析依赖；不做「同仓库有进行中任务 → 409 前置拒绝」新方案；不做 PR Check 异步入队（重方案）；不改列表页服务端契约（客户端实现）；不改 env-events / alerts 的严重级别选项表（非同源）；不删除 legacy `/repos/[id]/runs` 页（死代码候选另登记）。

**§3.4 交叉核验**：6 项候选经 todo-archive 表格扫描（`rg` 关键词零命中已闭环修复）+ git log（无对应修复 commit：network-audit 最近 `2104b9f` 追加 `rolldown.rs` / `helpers.ts` 无幂等修复 / `scan.post.ts` 最近 `9f9d067` 降级路径透传 reuse）+ 代码 anchor（`network-audit.ts:65` 白名单 6 域无 `npmmirror` / `helpers.ts:668` 精确字符串比较 / `scan.post.ts:89-105` reused 置 failed / 无 `pr-checks/poll.post.ts` / `repos.vue:280` / `batch-runs.vue:245` 无分页筛选 / `run-view.ts:35` 等 3 类展示面并存）三重核验，**0 项重复评估**。

**审计 depth 预告**：M42.1 改变执行期网络边界 + 治理定义改动（[security.md §5.3](../../standards/security.md) + [sandbox-security-governance.md §4.4](../../design/governance/sandbox-security-governance.md) 治理评审为硬前置）→ `standard`（建议 2 分区并发）；M42.3 涉及 run 状态写路径 → `standard`；M42.4 新增公开 API 端点 → `standard`；M42.2 / M42.5 / M42.6 按规模 `quick`。

**commits 状态**：本阶段 commits 归档时为本地 ahead——`git rev-list HEAD ^origin/master --count` 实测 = **12**（M42.3 三个 + M42.4 三个 + M42.5 三个 + M42.6 三个；M42.1 / M42.2 及其前的阶段启动共 6 commits 已由用户推送，`origin/master` 顶端 = `e6f3857`），本归档 + 蒸馏批次 commits 另计，待用户推送确认。

> 详细任务与 8 要素见 [M42 归档分片](todo-archive-phases-m42.md#m42-修复交付正确性-平台能力与体验补强-m42-1-m42-6-全部已闭环-2026-10-11-归档)（2026-10-11 已闭环归档；**6 原子 18 commits**）；上一阶段（M41）见 [todo-archive.md §M41](todo-archive-phases-m41.md#m41-规范与经验管理体系重构-m41-1-m41-5-全部已闭环-2026-10-10-归档)。

---

## M41: 规范与经验管理体系重构（2026-10-10 用户决策方案 B / 2026-10-10 已闭环 + 归档）

承接 M40 运行时可靠性与可观测性深化归档后的治理体系重构阶段。根因为「**有规则无门禁 → 必 drift**」——规范混入实现与教训、经验体系体量膨胀且无退出路径、阈值声明双事实源且无脚本计量、规则与执行分离。设计依据为 [standards-experience-refactor.md](../../design/governance/standards-experience-refactor.md)（v2 先行稿，170 行；承接 [spec-and-doc-governance.md](../../design/governance/spec-and-doc-governance.md) 的未竟部分）。经 2026-10-10 用户决策（方案 B）从 [backlog.md](../backlog.md) §候选评估中上收整卡，A-E 五批对应 M41.1~M41.5。

**5 原子条目**（覆盖 📚 1 + 🛠️ 1 + 🧪 1 + 🎨 1 + 🛡️ 1；🎨 独立条目 1 项低于 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束) 建议值 2，且无能力扩展独立条目，缺口已显式标注）：

- **M41.1** [P2 📚 规范治理] 规范去实现化瘦身（standards 剥离实现细节 / 教训 / 实证 → 代码注释 / 设计文档 / L3 索引；`--strict` 归零 + 全部 ≤ 200 行或分片）
- **M41.2** [P2 🛠️ 经验治理] 经验体系三层收敛与精简（L1 门禁 / L2 检查点 / L3 索引；单分片 ≤ 400 行 + 「四者之一」准入）
- **M41.3** [P2 🧪 测试基建] 规范 / 经验门禁落地（`--strict` 接 CI 阻断 + `check-doc-size` 阈值计量 + 经验落点字段校验）
- **M41.4** [P3 🎨 文档体验] 文档站导航分层（侧栏不挂 `design/governance/**` 与 `plan/archive/**`；首页仅引导对外入口）
- **M41.5** [P3 🛡️ 治理同步] 阈值与事实源唯一化（`documentation.md §3` 为唯一权威；`spec-and-doc-governance §2.3` 收敛为一行引用）

**类型平衡复核**：📚 规范治理 1（M41.1）+ 🛠️ 经验治理 1（M41.2）+ 🧪 测试基建 1（M41.3）+ 🎨 文档体验 1（M41.4）+ 🛡️ 治理同步 1（M41.5）；🎨 独立条目 1 项低于建议值 2 且无能力扩展独立条目，本阶段以治理主线优先，缺口显式标注。

**建议顺序**：M41.1（规范瘦身，A1 → A2 → A3）→ M41.2（经验收敛，迁移目标就位后）→ M41.3（门禁接线，依赖 A/B 达标）→ M41.4（导航分层，可与 A 并行）∥ M41.5（阈值统一，依赖 A 达标）。

**批次粒度**：M41.1 预估 8-14 文件 / 净瘦 ~1200 行，超过 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 > 10 文件 / > 800 行阈值 → 内部拆 3 个可独立提交批次（A1 `platform.md` / A2 `development.md` + `ai-collaboration.md` / A3 其余 11 文件），每批独立验收 + 独立审计。

**条目调整**：无（整卡上收，无替换 / 无追加）。

**范围边界（不做什么）**：不做 `srcExclude` 物理隔离 / 不拆双站点（发布策略不变）；不删除历史归档原始信息；不改规则的事实权威（单点声明保留）；不修改 `AGENTS.md`（实测其「硬阈值」为设计文档必要性阈值、与文档行数阈值表异源，如确需改动须用户明确确认）；不引入新工具链。

**§3.4 交叉核验**：整卡候选经 todo-archive 表格扫描（`rg` 0 命中）+ git log（无瘦身 / 经验重构 / 接线 commit）+ 代码 anchor（standards 3211 行 / experience-archive 2409 行 / `check:standards-redundant` 166 处命中且 CI 未接线 / `documentation.md §3` 缺 standards·design 行 / `spec-and-doc-governance §2.3` 双事实源 / 侧栏仍挂 6 篇治理设计稿）三重核验，**0 项重复评估**。

**审计 depth 预告**：本阶段为治理定义改动，按 [AGENTS.md §审计触发](../../../AGENTS.md) + [spec-and-doc-governance §2.4](../../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement) 触发强制审计；M41.1（A 批 > 10 文件 / ~1200 行）适用 `deep`，建议 2 分区并发。

**commits 状态**：阶段启动规划 commit 落地后实测（`git rev-list HEAD ^origin/master --count` 双向核验），本阶段 commits 归档前均为本地 ahead，待用户推送确认。

> 详细任务与 8 要素见 [todo-archive.md §M41](todo-archive-phases-m41.md#m41-规范与经验管理体系重构-m41-1-m41-5-全部已闭环-2026-10-10-归档)（2026-10-10 已闭环归档；**5 原子 15 commits**：阶段启动 1 + M41.1 5 + M41.2 2 + M41.3 3 + M41.4 2 + M41.5 2；审计 5 原子全覆盖，M41.2 / M41.3 各经 Reject 后修复复审通过；同期范围内另有 1 commit 属并行 session 的候选登记）；上一阶段（M40）见 [todo-archive.md §M40](todo-archive-phases-m39-m40.md#m40-运行时可靠性与可观测性深化-m40-1-m40-6-全部已闭环-2026-10-10-归档)。

---

## M43: PR Check 能力补强 + 运行时可靠性与工程治理（2026-10-12 用户决策方案 A / 2026-10-14 已闭环 + 归档）

承接 M42 归档后的「平台能力补强 + 运行时可靠性」两条线。**PR Check 能力补强**线——① 列表行内补齐所属仓库标识（2026-10-12 用户反馈：跨仓库 PR 编号重号、行内无从判断归属）；② 把 PR Check 从单一 `Test` check 扩展为 GitHub 三源（Checks + Commit Statuses + Deployments）构建 / 部署信号聚合（设计先行稿 [pr-build-deploy-signals.md](../../design/governance/pr-build-deploy-signals.md) 已定稿）。**运行时可靠性与工程治理**线——③ 容器内 `pnpm install` 环境性失败（非零退出且无 stderr）的可观测性与归因口径（消除 `engine_exit_2` 误归因）；④ 扫描触发被去重合并时的前端感知；⑤ git 非仓库目录语义与 push 侧 `pre-push` 钩子隔离收口；⑥ 门禁脚本 Playwright 产物排除与 `distill-wisdom` 计数假阴性修复。

经 2026-10-12 用户决策（方案 A）从 [backlog.md](../backlog.md) §候选评估中 + §待上收候选上收 6 项。

**6 原子条目**（覆盖 🎨 2 + 🚀 1 + 🛡️ 2 + 🛠️ 1；🧪 独立条目缺口已显式标注，测试随条目内嵌）：

- **M43.1** [P2 🎨 体验] PR Check 监测列表补齐所属仓库标识（`owner/name`，消除跨仓库同号 PR 不可辨）
- **M43.2** [P2 🚀 能力扩展] PR 构建 / 部署错误多源采集（GitHub 三源聚合 + 归一化 + 告警沿用；**预估超任务粒度阈值，须拆 M43.2a / M43.2b**）
- **M43.3** [P2 🛡️ 可观测性 / 归因] 容器内 `pnpm install` 环境性失败的可观测性与归因口径（保留 stderr / exit code / signal + UI 文案分层）
- **M43.4** [P2 🎨 体验] 扫描触发被去重合并（`merged`）时的前端感知（消除「点了修复但没跑」）
- **M43.5** [P3 🛡️ 治本] git 边界收口：`hasGitChanges` 非仓库语义 + push 侧 `pre-push` 钩子隔离
- **M43.6** [P3 🛠️ devEx] 工程脚本加固：门禁产物排除（`playwright-report` / `test-results`）+ `distill-wisdom` 计数假阴性

**类型平衡复核**：🎨 2（M43.1 / M43.4）+ 🚀 1（M43.2）+ 🛡️ 2（M43.3 / M43.5）+ 🛠️ 1（M43.6）；🧪 独立条目缺口显式标注（测试随各条目内嵌）——符合 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束)。

**建议顺序**：M43.1（前端先行，避免 M43.2 同表两次改动）→ M43.2（大项，D 阶段先定稿子任务拆分）→ M43.3 → M43.4 → M43.5 → M43.6。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限；**M43.2 预估 > 10 文件 / > 800 行，须拆 M43.2a（采集层）/ M43.2b（聚合 + 实体 + API/UI）**，拆分依据登记 `todo.md §M43.2`；其余条目未超单条阈值。**M43.1 与 M43.2 同表（`pr-checks`），仓库标识口径宜一并设计以避免两次改表。**

**范围边界（不做什么）**：不改 PRCheck 数据模型 / 状态机与 ack 语义（M43.1）；不改 engine 本地构建 / 验证逻辑、不新建 GitHub App、不做 webhook、首批不含 provider 原生日志富化（M43.2）；不改 `pnpm install` 执行方式与锁文件修复策略语义（M43.3）；不改 `POST /api/repos/[id]/scan` 去重合并语义与响应结构（M43.4）；不改 `--no-verify` 选型与签名隔离常量取值（M43.5）；不改编号正则 / 真常量白名单（M43.6）。

**§3.4 交叉核验**：6 项候选经 todo-archive 表格扫描（关键词零命中已闭环修复，唯一命中为 M24 PR Check MVP——属单 `Test` check MVP，非多源扩展）+ git log（`pr-checks.vue` 最近 `4aa1f7b` 手动触发入口无仓库列 / `services/monitor/**` 无 Deployments / Commit Statuses 采集 / `fixers/pnpm/index.ts` 无 signal 上报 / `pr-creator.ts` push 侧仅签名隔离）+ 代码 anchor（`pr-checks.vue:115-120` 6 列无仓库列 + `pr-checks/index.get.ts:33` 仅 `repositoryId` / `polling-source.ts` 仅单 check 名 / `use-fix-now.ts:65-84` 不消费 `merged` / `helpers.ts:669` 非仓库恒 `true` / `pushBranch` 无 hooks 隔离 / 两门禁脚本排除面缺产物目录 + `distill-wisdom.mjs:145` 正则不容忍「日期+类型」）三重核验，**0 项重复评估**。

**审计 depth 预告**：M43.2（数据模型 / migration / 公开 API / 外部调用）→ `standard`（建议 2 分区并发）；M43.3（归因口径 + 展示映射）→ `standard`；M43.5（engine git 行为 + 平台 push 路径）→ `standard`；M43.1 / M43.4（前端）→ `quick`；M43.6（脚本 + 单测）→ `quick`。

**commits 状态**：阶段启动规划 1 + 前置插队热修 3 + M43.1 3 + M43.2 27 + M43.3 5 + M43.4 3 + M43.5 4 + M43.6 4 = **50 commits**（`git log master --first-parent --oneline 68ad47f^..HEAD` 去重统计）；归档前 `git rev-list HEAD ^origin/master --count` 实测 = 11（`origin/master ^HEAD` = 0 双向核验；M43.1 / M43.2 / M43.3 及其前已推送），待用户推送确认。

> 详细任务与 8 要素见 [todo-archive.md §M43](todo-archive-phases-m43.md#m43-pr-check-能力补强-运行时可靠性与工程治理-2026-10-12-用户决策方案-a-2026-10-14-归档)（2026-10-14 已闭环归档；**6 原子 50 commits** + 阶段期间 caomei-ui `0.6.0` 升级回归插队热修 3 commits）；上一阶段（M42）见 [M42 归档分片](todo-archive-phases-m42.md#m42-修复交付正确性-平台能力与体验补强-m42-1-m42-6-全部已闭环-2026-10-11-归档)。

---

## M44: 验证链治本 + 文档门禁可信度收口（2026-10-14 用户决策方案 A / 2026-10-15 已闭环 + 归档）

承接 M43 归档后的「**对质量的承诺与实际执行之间的落差**」主线，同一根因在两条线各暴露一次——**交付侧**：验证链 `DEFAULT_VERIFY_COMMANDS` 四条命令互不重叠地都不做类型检查（lint 只跑规则 / tsdown `dts` 只发射声明 / vitest 走 esbuild 转译）→ 类型面破坏被判 `verificationPassed = true` 并交付成 PR（用户实证：nodemailer 10.x 升级后 `nodemailer.Transporter` 报 TS2503；M30.3 C84 `21bf8bb` 当年改文档而非补链路，使缺口在文档层被抹平）；**文档侧**：`check-docs.mjs:131-169` 只校验锚点存在性、`.vitepress/config.ts:147` `ignoreDeadLinks: true`，四类「合法文本但语义漂移」缺陷长期无门禁。经 2026-10-14 用户决策（方案 A）从 [backlog.md](../backlog.md) §待上收候选（C95）+ §候选评估中上收 10 项候选，收敛为 6 原子条目。

**6 原子条目**（🛡️ 1 + 🛠️ 1 + 📚 3 + 🎨 1；🚀 与 🧪 独立条目缺口显式标注——候选池内两项能力候选同域且与 M43.2 强耦合，宜独立批次串行推进）：

- **M44.1** [P2 🛡️ 治本] 验证命令链纳入 `typecheck`（同级直接阻断；顺序 `install → lint → build → typecheck → test`——typecheck 依赖 workspace `dist`，实测移出 dist 后平台 typecheck exit 2 + 大量 TS2307，故必须在 build 之后、test 之前）
- **M44.2** [P3 🛠️ devEx] 文档门禁机检缺口收敛（链接文本 §N ↔ 锚点一致性 / VitePress 站点绝对链接 / 未成对 `](` / 强调标记配对，四类各带负例标定）
- **M44.3** [P3 📚 治理] 文档口径与命名一致性收口（`design/packages` 残留 3 处 + `ai-collaboration.md` 跨段重复编号 + 经验归档 `§49-§57` 分片文件名与内容范围不符）
- **M44.4** [P3 📚 治理] 设计文档存量超健康窗口分批拆分（warning 带 13 文件 + 强制分片线豁免 1 文件，分 3 批独立验收）
- **M44.5** [P3 🎨 体验] 站点语言切换器未翻译页 404 兜底（M41.4 导航分层后剩余唯一非导航面死链来源）
- **M44.6** [P3 📚 治理] `tech-stack` 平台依赖表行级一致性（版本口径不一致 + 无引用占位行）

**建议顺序**：M44.1（治本主线）→ M44.2（门禁就位，防后续文档批次回归）→ M44.3（命名 / 编号收口，牵动锚点面先于拆分）→ M44.4（存量拆分，在门禁就位后分批）→ M44.5（可并行）∥ M44.6。**条目容量**：6 原子（5-6 项上限内）；M44.1 与 M44.3 均触及 > 10 文件面——M44.1 命中[设计文档硬阈值](../../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement)，承载面经用户裁定为 [dependency-fixer.md](../../design/modules/dependency-fixer-records.md) 验证链章节；M44.3 的承载面为该文件自身编号结构与分片命名。

**范围边界（不做什么）**：不改 `quickVerifyProject` 的 lint-only 定位、不做脚本名探测 / 非阻断观察期 / 从目标仓库 CI 反推验证链（M44.1）；不做外链存活检查与文档全文渲染校验（M44.2）；不改 standards 规则语义（M44.3）；不缩小计量面、不新增豁免表条目（M44.4）；不做全量 en 翻译、不改 `ignoreDeadLinks`（M44.5）；不做依赖实际升降级（M44.6）。

**§3.4 交叉核验**：**0 项重复评估**——归档表格扫描零命中已闭环项（唯一同族命中为 M41 归档段自身的「未完成项」清单，即本批候选来源）+ git log 无对应实现 commit（`scripts/check-docs.mjs` 最近为 `d315840`）+ 代码 anchor 逐项实证未闭环（`DEFAULT_VERIFY_COMMANDS` 4 条命令无 typecheck / `check-docs.mjs:131-169` 仅校验锚点存在 / `config.ts:147` `ignoreDeadLinks: true` / `distill-wisdom.mjs:61` + `docs-and-readme-i18n.md:123` + `modules/index.md:1` 旧目录名 / `ai-collaboration.md` L82/91/99/109 跨段编号 / `experience-archive-§49-§57-…md` H1 为「§四十九 - §六十八」/ `apps/platform/package.json:44` 版本口径与无声明行）。

**审计 depth 预告**：M44.1 → `deep`（建议 2 分区并发：P1 引擎与默认链 + 测试 / P2 文案口径与平台同步）；M44.2 / M44.3 / M44.4 → `standard`；M44.5 / M44.6 → `quick`。

**commits 状态**：阶段启动规划 commit 落地后按 [规划规范 §4.4 第 5 条](../../standards/planning.md#_4-4-大批量归档批次操作规范) 用 `git rev-list HEAD ^origin/master --count` 双向核验并动态描述，不写死数字。**本批实测登记的已知边界（已闭环）**：`roadmap.md` 因本段新增一度达 906 行 → 超「强制分片阈值（>900）」触发 `check-doc-size` error；本批先以**压缩本段回落到 warning 带**处置，完整拆分（M0–M38 段迁出至 `archive/roadmap-phases-m0-m38.md` + 全仓锚点重指）**已于 2026-10-15 随 M44.4 批次③ 落地**（`roadmap.md` 898 → 252 行，`check-doc-size` warning 带归零；原「待用户决策后立项」已兑现，见 [archive/index.md §4](index.md)）。

**阶段期间插队热修（不占阶段编号）**：entrypoint 双进程信号处置顺序竞态（CI 偶发红；[规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 插队例外清单第 3 类「CI 主链路阻塞」+ 用户 2026-10-14 授权）—— 规则与检查点落 [platform.md §10.6](../../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程)，批次记录见 [archive/index.md §4](index.md)。

> 详细任务与 8 要素见 [todo-archive.md §M44](todo-archive-phases-m44.md#m44-验证链治本-文档门禁可信度收口-m44-1-m44-6-全部已闭环-2026-10-15-归档)；上一阶段（M43）见 [todo-archive.md §M43](todo-archive-phases-m43.md#m43-pr-check-能力补强-运行时可靠性与工程治理-2026-10-12-用户决策方案-a-2026-10-14-归档)。

---

## M45: 运行可靠性与交付链收口（2026-10-15 用户决策方案 A / 2026-10-19 已闭环 + 归档）

承接 M44 归档后的「**跑得对、跑得省、看得见**」阶段。M44 已把「验证链不含类型检查」与「文档门禁形同虚设」两条假绿链路治本，本阶段转向**交付链自身残留的可靠性、成本与可观测缺口**——① 本仓库自用 `commands` 链与引擎默认链长期存在面差（自用链缺 `test`，且 `--commands` 为整链替换，默认链每扩展一次即漂移一次）——**已由 M45.1 闭环**（补齐测试段 + 新增一致性门禁）；② 零告警仓库虽已跳过 lockfile repair，修复前基线采样仍执行一次完整验证链——**已由 M45.2 闭环**（按需采样 + 无改动即豁免归因）；③ 独立 worker 进程与 HTTP 进程共享同一 Nitro 产物，重复启动 `stale-cleanup` / 启动期引导等周期插件——**已由 M45.3 闭环**（按进程角色跳过 HTTP-only 插件；承接段标记补登）；④ 运行失败已具备「分类 + 筛选 + 展示」，缺设计稿 §5.5 的「受约束重试入口」——**已由 M45.4 闭环**（专用端点 + 双守卫 + 来源列 + 详情弹窗入口与二次确认）；⑤ 浮层类组件落点页无像素门禁——**已由 M45.5 闭环**（4 类落点页纳入视口级像素门禁 + 运行时派生值钉死 + 反例标定；执行顺序改为先于 M45.6，连带重建口径见 [visual/README.md](../../../apps/platform/tests/visual/README.md)）；⑥ PR Check「全量只报警不阻断」缺降噪配置面——**已由 M45.6 闭环**（仓库级三维白名单 + 聚合 / 告警层过滤，全量信号仍落库可审计）。经 2026-10-15 用户决策（**方案 A**）从 [backlog.md](../backlog.md) §候选评估中上收 6 项候选。

**6 原子条目**（覆盖 🛠️ 3 + 🎨 1 + 🚀 1 + 🧪 1；**🎨 独立条目仅 1 项，低于 [规划规范 §1.1 L12 类型平衡建议](../../standards/planning.md#_1-1-硬性约束) 建议值 2，缺口已显式标注**）：

- **M45.1** [P2 🛠️ 技术债] 自用 dependfix 验证链面差收口（补 `test` 与 `commands` 语义契约化）——**已闭环**
- **M45.2** [P2 🛠️ 技术债] 零告警仓库修复前基线采样成本（拆 `prepareRepoFix` 只读抓取 / 写盘两段）——**已闭环**
- **M45.3** [P2 🛠️ 技术债] 队列 worker 进程按 role 跳过周期插件（`DEPENDFIX_ROLE`）——**已闭环**
- **M45.4** [P2 🎨 用户体验] 运行失败「受约束重试入口」（设计稿 §5.5）——**已闭环**
- **M45.5** [P3 🧪 测试覆盖] 浮层类组件视觉覆盖扩面（Drawer / Tabs / Popover / Toast 落点页）——**已闭环**（4 类落点页 5 张基线；Popover 与 Tabs 无/未纳入落点，缺项在 [visual/README.md](../../../apps/platform/tests/visual/README.md) 登记）
- **M45.6** [P3 🚀 能力扩展] PR Check 告警关注集（可配置面）——**已闭环**（仓库级三维白名单 + 聚合 / 告警层过滤 + 仓库表单配置；设计稿 §9）

**类型平衡复核**：🛠️ 3（M45.1 / M45.2 / M45.3）+ 🎨 1（M45.4）+ 🚀 1（M45.6）+ 🧪 1（M45.5）——🎨 独立条目 1 项低于建议值 2，本阶段以运行可靠性与成本主线优先，缺口显式标注（候选池内 UX 类可上收项仅「受约束重试入口」与「平台死代码清理」，后者规模不足以独立成原子）。

**建议顺序**：M45.1（最小、隔离面清晰，先消除自用链漂移）→ M45.3（platform 插件守卫，无耦合）→ M45.2（engine 归因，D 阶段先做被跳过步骤语义清单）→ M45.4（平台能力，端点 / 落库形态需裁定）→ M45.6（数据模型 + 配置面，面最广）→ **M45.5 放最后**（视觉基线须在 UI 变更后建立，避免 M45.4 / M45.6 使新基线立即失效）。**实际执行（2026-10-19 用户裁定）**：M45.5 先于 M45.6 落地；顺序偏离的风险与连带重建口径已登记（[todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档) §M45.5 风险 R4 + [visual/README.md](../../../apps/platform/tests/visual/README.md)「顺序约束」段）。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限；**M45.6 预估 8-12 文件 / 200-380 行**，若 D 阶段裁定含数据模型变更则内部拆「配置承载层 / 生效与展示层」两批（拆分依据登记 [todo-archive.md §M45.6](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)）；其余条目均未超单条阈值。

**范围边界（不做什么）**：不改引擎默认链条数与顺序（M45.1）；不改 `enforceVerificationGate` 回滚语义与 `preExistingDirty` 保护面（M45.2）；不改插件清理 / 对账逻辑与 entrypoint 看护与信号处置（M45.3）；不做批量重试、不放开非 `transient`、不改 failure taxonomy 分类（M45.4）；不改视觉门禁阈值、不做全站覆盖（M45.5）；不引入阻断语义、不做 provider 日志富化与通知集成（M45.6）。

**§3.4 交叉核验**：6 项候选经 todo-archive 表格扫描（关键词 `commands` / 自用链 / `prepareRepoFix` / 基线采样 / `DEPENDFIX_ROLE` / `inProcessWorker` / `retriedFromRunId` / 受约束重试 / 视觉覆盖 / `popover` / 关注集 零命中已闭环项）+ git log（`security-auto-fix.yml` 最近 `2188b16` 文档口径同步 / `packages/engine/src/app/repo-fix.ts` 最近 `4fee403` 信号保留 / `apps/platform/server/plugins/**` 最近 `0f73645` 注释重指 / `apps/platform/tests/visual/**` 最近 `1d12803` 无浮层落点页 / `pr-check.ts` 无关注集列）+ 代码 anchor（`security-auto-fix.yml:90` 回退链不含 `test` / `repo-fix.ts:140` + `:175` `prepareRepoFix` 单段形态 / 全仓 `DEPENDFIX_ROLE` 零命中且 `plugins/stale-cleanup.ts` 无守卫 / 全仓 `retriedFromRunId` 零命中 / `tests/visual/platform-pages.visual.test.ts` 仅 5 个既有页面 / `pr-check.ts:71-120` 无关注集字段）三重核验，**0 项重复评估**。

**审计 depth 预告**：M45.1 / M45.2 / M45.3 / M45.4 → `standard`；M45.5 → `quick`；M45.6 → `standard`（若含数据模型变更建议 2 分区并发）。

**阶段期间追加临时待办（不占阶段条目编号，2026-10-16 用户授权）**：批量日志导出范围口径（默认导出当前页 + 保留「全部筛选结果」入口）——追加于 §M45 段落末尾（标记口径以 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 为唯一权威声明）；规则与检查点落 [development.md §5.1.43](../../standards/development.md)，任务与闭环记录见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)，批次记录见 [archive/index.md §4](index.md)。**不计入本阶段原子条目数与类型平衡**。

**阶段期间追加临时待办（不占阶段条目编号，2026-10-16 用户授权）**：CI 双红收口（视觉基线连带失配重建 + 自验链代理 env 假红修复 + `quick-verify` 失败留痕）——同为追加于 §M45 段落末尾（标记口径同上）；规则落 [testing.md §6.7](../../standards/testing.md)（文案类改动连带失配 + update 落盘帧须由 no-update 连跑复核）与 [dependency-fixer-records.md §12.9](../../design/modules/dependency-fixer-records.md)（验证链注入 env 与目标仓库测试断言的冲突面），任务与闭环记录见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)，批次记录见 [archive/index.md §4](index.md)。**不计入本阶段原子条目数与类型平衡**。

**阶段期间追加临时待办（不占阶段条目编号，2026-10-17 用户授权）**：执行超时真中断与单仓内存口径 + 依赖升级探针次数与安装超时口径收敛（内核 OOM 实证驱动）——两条同为追加于 §M45 段落末尾（标记口径同上）。处置面：① 执行超时从「放弃等待」升级为「请求运行级取消 + 有界宽限期」（契约落 [executor-process-isolation.md §8](../../design/governance/executor-process-isolation.md#_8-执行超时与运行级取消-2026-10-17)）；② 安装类命令超时收敛到单一事实源（缺省 5 分钟，`DEPENDFIX_INSTALL_TIMEOUT_MS` 可覆盖，权威登记见 `.env.full.example` + [平台配置指南](../../guide/configuration.md)）；③ 版本化 overrides 合批把单仓安装次数由 K 压到 1（失败回退逐包，语义不变，见 [dependency-fixer-records.md §12.10](../../design/modules/dependency-fixer-records.md#_12-10-安装类命令的超时口径与版本化-overrides-合批-2026-10-17)）；④ 工程规则落 [development.md §5.1.44](../../standards/development.md)（长命令须异步且可取消）。内存防按用户裁定**仅文档化部署口径**（建议 ≥ 8 GB / 并发 1 / 用容器内存限制而非注入堆上限），不改默认命令注入。任务与闭环记录见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)，批次记录见 [archive/index.md §4](index.md)。**不计入本阶段原子条目数与类型平衡**。

**阶段期间追加临时待办（不占阶段条目编号，2026-10-17）**：CI 双红收口（周回归 `security:audit-deps` 阻断 + `entrypoint.test.mjs`「角色归一化」用例竞态）——追加于 §M45 段落末尾（标记口径同上）。处置面：① 依赖链锁文件提升闭合 3 critical / 5 high（`@nuxt/devtools` 3.4.3 已移除 `simple-git` 依赖 + `shell-quote` 1.12.0 + `seroval` 1.6.9，**未新增** `audit.ignore` 豁免）；② 用例在取快照前等待 worker 角色标记（消除「只等 http 标记就断言 worker」的时序窗口，不改 `entrypoint.sh` 的进程编排与信号处置）。任务与闭环记录见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)，批次记录见 [archive/index.md §5](index.md)。

**阶段期间追加临时待办（不占阶段条目编号，2026-10-18 用户授权）**：交付正确性（零修复不交付 / 修复后安装既有失败不交付 / override 生效校验 / 收敛判定按全部实例）——追加于 §M45 段落末尾（标记口径同上）。处置面：① `app/delivery.ts` + `app/skipped-delivery.ts` 新增交付守卫；② `helpers.ts` / `index.ts` / `repo-fix.ts` / `verify-project.ts` / `fixers/pnpm/index.ts` / `fixers/dependency/**` 接入；③ 拆出 `fixers/dependency/{semver,lockfile-versions,override-verification}.ts` 控制文件行数；④ 设计口径落 [dependency-fixer-records.md §12.12](../../design/modules/dependency-fixer-records.md) 与 [pnpm-lockfile-fixer.md §4.1](../../design/modules/pnpm-lockfile-fixer.md)。剩余 P1/P2 候选（CI 命令对齐 / draft-issue 降级 / 内存下限 / UI 披露）已登记 [backlog.md](../backlog.md)。任务与闭环记录见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)，批次记录见 [archive/index.md §4](index.md)。**不计入本阶段原子条目数与类型平衡**。

**commits 状态**：阶段启动规划 commit 落地后按 [规划规范 §4.4 第 5 条](../../standards/planning.md#_4-4-大批量归档批次操作规范) 用 `git rev-list HEAD ^origin/master --count` 双向核验并动态描述，不写死数字。

> 详细任务与 8 要素见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)；上一阶段（M44）见 [todo-archive.md §M44](todo-archive-phases-m44.md#m44-验证链治本-文档门禁可信度收口-m44-1-m44-6-全部已闭环-2026-10-15-归档)。

---

## M46: 运行结果可信度与可观测性（2026-10-20 用户决策方案 A / 2026-10-22 已闭环 + 归档）

承接 M45 归档后的「**跑得对、看得见、不打扰**」阶段。M45 已把执行取消、交付守卫、基线快速失败与重试入口补齐；本阶段转向**结果可信度与可观测性**——① 环境性失败既不归因也不可见，列表把「有告警 / 0 修复」显示为完成（**M46.1**）；② 跨 major / 截断 / 子目录跳过只在引擎日志里，UI 与 PR 正文读不出「部分修复」（**M46.2**）；③ 基线首失败即停使 `test` 从未进基线，门禁整仓回滚连带丢弃已通过探针（**M46.3**）；④ 控制面 1GB 与执行面 ≥8GB 口径冲突，且无启动期 / 运行期 OOM 信号（**M46.4**）；⑤ 通知只有环境事件，业务结果不可配置、无降噪（**M46.5**，issue #190）；⑥ 本地视觉库残留非 fixtures 仓库会伪装成代码回归（**M46.6**）。

**6 原子条目**（🎨 2 + 🛠️ 2 + 🚀 1 + 🧪 1）：

- **M46.1** [P1 🎨] 环境性失败与「有告警未修」的可见性 —— **已闭环**
- **M46.2** [P2 🎨] 跨 major / 截断 / 子目录跳过的披露 —— **已闭环**
- **M46.3** [P2 🛠️] 基线采样完整链与门禁回滚粒度 —— **已闭环**
- **M46.4** [P1 🛠️] 执行容器内存下限与 OOM 归因 —— **已闭环**
- **M46.5** [P2 🚀] 平台通知与邮件推送（issue #190，设计稿 [platform-notification.md](../../design/governance/platform-notification.md)）—— **B1-B4 已闭环；B5 周汇总已随 M47.5 上收**
- **M46.6** [P3 🧪] 视觉套件测试库 fixtures 前置断言 —— **已闭环**

**建议顺序**：M46.6 → M46.1 → M46.2 → M46.5 → M46.3 → M46.4。M46.6 最小且先清本地视觉噪声；M46.1 / M46.2 共用 `summaryJson` 承载面，连续落地可只付一次契约成本；M46.5 消费未修复高危口径；M46.3 / M46.4 相互独立，放在后段避免与数据层迁移交织。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限。**阶段基线工作量（§3.1.1 再平衡分母）**：6 条目「交付物」下限和 ~ 上限和为 **81-116 文件 / 3020-4800 行**（取整 80-120 / 3000-4800；文件跨批复用，去重后偏低）；M46.5 单体最大（41-58 文件 / 1800-2850 行，含可选 B5；移出后 36-50 文件 / 1600-2500 行），按设计稿 B1-B5 内部拆批次；M46.3 涉及回滚语义变更，D 阶段先落设计结论。

**范围边界（不做什么）**：不改 exit code 语义与 failure taxonomy（M46.1）；不改跨 major 跳过策略、不加仓库级 `allowMajorUpgrade` 开关（M46.2）；不做探针合批、不改默认验证命令链（M46.3）；不自动调高容器限制、不做 K8s 资源模板（M46.4）；不实现 Slack / Webhook 真实投递、不做仓库订阅与一键退订令牌（M46.5）；不改视觉阈值、不做全站基线（M46.6）。

**§3.4 交叉核验**：6 项经 todo-archive 表格扫描（关键词 `环境性失败` / `alertsSkipped` / `首失败即停` / `内存下限` / `邮件通知` / `视觉库` 仅命中来源批次与残余观察项）+ `git log --oneline -- <路径>`（`scan-run.ts` 最近 `741b72c` / `verify-project.ts` 最近 `eb9f094` / `verification-gate.ts` 最近 `7f01d3b` / `notification/policy.ts` 最近 `e80b7b0` / `tests/visual/global-setup.ts` 最近 `1969ad5` 均未覆盖本阶段范围）+ 代码 anchor（`scan-run.ts` 无 exitCode 列 / `run-detail-dialog.vue` 无跳过展示 / `verify-project.ts:100` 首失败即停 / `deployment.md:10` 仍写 1GB / `policy.ts` 仅 3 类环境事件 / `global-setup.ts` 无集合断言），**0 项重复评估**。

**审计 depth 预告**：M46.1 / M46.2 / M46.4 / M46.5 → `standard`（M46.5 建议 2 分区并发）；M46.3 → `standard`（回滚语义变更；计划曾按 deep，实际按 standard 执行）；M46.6 → `quick`。

> **闭环记录（2026-10-22）**：M46 六原子条目均已完成既定范围（M46.5 B1-B4 闭环、B5 周汇总延期 backlog）。实现 / 测试 / 文档 commits 见 [todo-archive.md §M46](todo-archive-phases-m46.md#m46-运行结果可信度与可观测性-2026-10-20-用户决策方案-a-2026-10-22-归档)；审计逐条目 R1/R2 均以 Pass 放行（M46.2 / M46.3 曾 Reject，收口后 Pass；M46.5 B1-B4 R1 A Reject → R2 quick Pass）。**门禁**：M46.1 定向 141 + core/report 98；M46.2 定向 257 + e2e 干净库 200 + visual 16×2；M46.3 engine 1437 / platform 2039 / root 复跑 exit 0；M46.4 platform 2063 + visual 17 + platform build + 启动冒烟；M46.5 定向 280 + e2e 202 + visual 17×2；M46.6 定向 26 + visual 16。全阶段 `lint` 0 error、`typecheck` 7 包、文档 / i18n / orphan / verify-chain 门禁通过。**残余**：M46.1 常规升级链路环境性归因、M46.2 batch-aggregate、M46.3 基线成本 / 非最近单元降级、M46.4 宿主 OOM / sandbox / action 采集、M46.5 B5 周汇总（已随 M47.5 上收）、M46.6 视觉库 schedule 引用；均已登记 backlog 或各条目归档块。

> 详细任务与 8 要素见 [todo-archive.md §M46](todo-archive-phases-m46.md#m46-运行结果可信度与可观测性-2026-10-20-用户决策方案-a-2026-10-22-归档)；上一阶段（M45）见 [todo-archive.md §M45](todo-archive-phases-m45.md#m45-运行可靠性与交付链收口-2026-10-15-用户决策方案-a-2026-10-19-归档)。

---

## M47: 交付判定可信与运行自证（2026-10-22 用户决策方案 A′ / 2026-10-24 已闭环 + 归档）

承接 M46 归档后的「**判定可信、运行可自证**」阶段。M46 已把「有告警未修 / 环境性失败 / 跳过与截断」变成可见；本阶段转向**交付判定的自证能力**——① PR 正文的验证红字与目标仓库 CI 的绿 / 红不是同一口径，用户无法判断「PR 是否真的过 CI」（**M47.1**，2026-10-18 生产复盘）；② 日志缺行时无法区分「线上构建旧」与「代码路径未覆盖」，且 `Lockfile repaired` 文案把「本就合规」读成「修好未提交」（**M47.2**，2026-10-17 生产复盘）；③ 环境性失败计数只覆盖部分路径、分类语义未收窄，真实安装失败仍可能被误归因仓库（**M47.3**，M46.1 明文残余）；④ pnpm store 随 run 清理导致冷安装，且 `git add .` 可能误收 store（**M47.4**，2026-10-18 安装失败复盘）；⑤ M46.5 B5 周汇总按阶段容量延期（**M47.5**）；⑥ 三条门禁 / 提交卫生缺口（**M47.6**）。

**6 原子条目**（🎨 1 + 🛠️ 2 + 🚀 2 + 🧪 1）：

- **M47.1** [P1 🎨] 验证链与目标仓库 CI 口径对齐（差异披露 + 默认分支 workflow 健康预检）
- **M47.2** [P1 🛠️] 构建版本回执与安装日志语义订正
- **M47.3** [P2 🛠️] 环境性失败归因收口（分类收窄 + 常规升级链路）
- **M47.4** [P2 🚀] pnpm store 持久化与提交卫生
- **M47.5** [P2 🚀] 通知周汇总（`weekly_digest`，M46.5 B5）
- **M47.6** [P3 🧪] 工程门禁与提交卫生收口

**类型平衡复核**：🎨 1（M47.1）+ 🛠️ 2（M47.2 / M47.3）+ 🚀 2（M47.4 / M47.5）+ 🧪 1（M47.6）；🎨 独立条目 1 项低于建议值 2（M47.2 含用户可见面），缺口显式标注。

**建议顺序**：M47.6 → M47.2 → M47.1 → M47.3 → M47.4 → M47.5。M47.6 最小且先清门禁噪声；M47.2 建立「本次运行由哪个构建执行」的诊断基线；M47.1 最大且需设计结论，依赖 M47.2 的诊断面；M47.3 语义变更待前两项稳定；M47.4 部署形态变更；M47.5 独立周期插件。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限。**阶段基线工作量（§3.1.1 再平衡分母）**：6 条目「交付物」区间和为 **41-59 文件 / 1600-2650 行**（取整 40-60 / 1600-2700；执行角色按候选锚点计数的量级预估，D 阶段按实际 diff 复测）。M47.1 单体最大（10-14 文件 / 450-700 行）；若实际 diff 触发 [设计文档硬阈值](../../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement)，须补 governance 设计稿后再进入 D 阶段。

**范围边界（不做什么）**：不按 workflow 动态替换 `verifyCommands`、不解析 matrix / secrets / services 完整语义（M47.1）；不做部署回执与历史 run 回填（M47.2）；不改 `failure_kind` 枚举、不回填历史数据（M47.3）；不做 store 自动 GC 与多仓共享并发控制（M47.4）；不做通用摘要调度器 / 周报历史页 / 逐用户时区（M47.5）；不做全仓编号重命名、不改 husky 其他钩子（M47.6）。

**§3.4 交叉核验**：6 项经 todo-archive 表格扫描（关键词 `环境性失败` / `构建版本` / `CI 口径` / `workflow 对齐` / `pnpm store` / `weekly_digest` / `check-orphan-ids` / `check-experience-landing` / `lint-staged` 仅命中来源批次与残余观察项）+ `git log --oneline -- <路径>`（`verify-project.ts` 最近 `d76dcea8` / `pr-creator.ts` 最近 `37c93068` / `repo-fix.ts` 最近 `dd195219` / `Dockerfile` 最近 `957bc58f` / `package.json` 最近 `89fdb6ce` 均未覆盖本阶段范围）+ 代码 anchor（`verify-project.ts:40` 只消费默认链 / 仓库 `verifyCommands` / engine / platform 无读取目标仓库 workflow 的代码（`scripts/check-verify-chain.mjs` 仅解析 dependfix 自身 workflow）；`build-info` 插件仅向平台 stdout 打版本戳、engine 运行日志无版本，`ScanRun` 无构建版本列；`result-assembly.ts:22-25` 自述升级路径未消费 `environmental`；engine / platform 产品代码无 `store-dir` 配置；`package.json:90/94/98` 裸 `git add` 仍在（规划时点）），**0 项重复评估**。

**审计 depth 预告**：M47.1 / M47.2 / M47.3 / M47.4 / M47.5 → `standard`（M47.1 跨 engine + platform + PR 契约建议 2 分区并发；M47.2 含迁移建议 2 分区）；M47.6 → `quick`。

> **闭环记录（2026-10-24）**：M47 六原子全部闭环并归档（首父链 35 commits）。M47.1 新增 governance 专项稿 verification-ci-alignment；M47.2 / M47.3 / M47.4 / M47.5 触发阈值后复用既有设计稿；审计逐条目 R1 均以 Pass 或收口后 Pass 放行；全阶段 lint / typecheck / 全仓 308 文件 4725 passed / platform 2142 passed / 视觉 17 passed ×3 / 文档与 i18n 门禁通过。归档前 `git rev-list` 双向核验 ahead 0 / behind 0（origin/master = `327a02e0`）。
> 详细任务与 8 要素见 [todo-archive.md §M47](todo-archive-phases-m47.md#m47-交付判定可信与运行自证-2026-10-22-用户决策方案-a′-2026-10-24-归档)；M45 段已迁出至 [archive/todo-archive-phases-m45.md](todo-archive-phases-m45.md)。

---

## M48: 对外 PR 交付闭环（2026-10-24 用户决策 D+E / 2026-10-25 已闭环 + 归档）

承接 M47 归档后的交付可信链。2026-10-24 对外 PR 巡检（60 个已建 PR / 60 个已合并 PR；66 为含历史可查 PR）给出完整根因链：**写入侧不做家族约束**（`vitest@4` + `@vitest/coverage-v8@3` 混装 → CI 覆盖率阶段崩）→ **验证侧只跑固定四语义项**（目标仓 CI 的 `coverage` / `e2e` 永不执行 → 本地假绿）→ **交付侧不记尝试**（PR 关闭后原样重开）→ **提交面过宽**（`git add .` 混入 `.nuxtrc` / `auto-imports.d.ts` / `CHANGELOG.md`）→ **回环缺失**（红 PR 无人收）→ **归因缺失**（合并后外部作业红与本次修复同列）。设计依据 [pr-delivery-closure.md](../../design/governance/pr-delivery-closure.md)。

**阶段基线工作量（§3.1.1 再平衡分母）**：6 条目「交付物」区间和为 **35-55 文件 / 2200-3700 行**（量级估算，D 阶段按实际 diff 复测）。

**6 原子条目**（🛠️ 5 + 🚀 1；🎨 / 🧪 独立条目缺口显式标注，测试随各条目内嵌）：

- **M48.1** [P0 🛠️] 兄弟包 / peer 家族锁步升级（vitest / typescript-eslint / jest / react；`eslint` 只做 peer range 校验）—— **已闭环**（2026-10-25）
- **M48.2** [P0 🛠️] CI 独有脚本纳入验证链（`--mirror-ci-scripts`，只执行 `pnpm/npm/yarn run` 子集）—— **已闭环**（2026-10-25）
- **M48.3** [P0 🛠️] 同告警尝试指纹去重与降级（PR 正文计数 + 第 3 次尝试起跳过）—— **已闭环**（2026-10-25）
- **M48.4** [P1 🛠️] 提交面白名单与 `pnpm-workspace.yaml` 定点编辑（`git add -- <paths>` + `parseDocument`）—— **已闭环**（2026-10-25）
- **M48.5** [P1 🛠️] PR 创建后 CI 回环（CLI / Action 侧：可选等待 + comment / close）—— **已闭环**（2026-10-25；归因分类器切片随本条前置落地）
- **M48.6** [P1 🚀] 外部作业归因与合并门禁（五类分类 + mergify 同批 job 条件）—— **已闭环**（2026-10-25；归因分类器随 M48.5 前置，本批补报告渲染 / 平台视图 / 门禁机检）

**类型平衡复核**：🛠️ 5 + 🚀 1；🎨 / 🧪 独立条目缺口显式标注（UX 由已授权的 E 阶段承担，测试随各条目内嵌）。不新增第 7 原子以避免越过 5-6 项上限。

**建议顺序**：M48.4 → M48.1 → M48.2 → M48.3 → M48.6 → M48.5。M48.4 最小且独立，先降后续 PR 的 diff 噪声；M48.1 断根因；M48.2 让验证结果可信；M48.3 收敛重复失败；M48.6 的分类纯函数先落地（无副作用），M48.5 的回环再消费它，避免循环依赖。

**条目容量**：6 原子符合 [规划规范 §1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限。M48.4 单体最大（6-10 文件 / 400-700 行），在上界附近；实际 > 10 文件即按 a/b 拆分。实际 diff 触发 [设计文档硬阈值](../../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement) 时复用 [pr-delivery-closure.md](../../design/governance/pr-delivery-closure.md)，不另立专项稿。

**范围边界（不做什么）**：不做通用依赖图 / 自动家族推导；不执行 `docker build` / 任意 shell；不建平台尝试指纹表；不做聚合 issue；不新增合并后 check 采集；不自动在目标仓启用 mergify；归因不绕过 mergify `check-success` 门禁；平台侧建 PR 后回环不在本阶段；不改 exit code 语义与 `PRE_EXISTING_FAILURE` 口径。

**§3.4 交叉核验**：6 项经 todo-archive 表格扫描（关键词 `锁步` / `peer` / `check-runs` / `git add .` / `失败指纹` / `external_noise` / `unrecognized` / `自动合并` / `mergify` 仅命中 M21.4 mergify 模板与 auto-merge 指南、M21 RG-W01 `git add .` 的 shell 注入修复、M24.1 PR Check open-only MVP——均为前置能力，非本阶段范围）+ `git log --all --grep=锁步`（命中 `8627edcb` 的 dependency-grouping 设计稿，已作为 M48.1 前置遗留项登记）+ `git log --oneline -- <路径>`（`ci-alignment.ts` 仅 `8888999e`；`pr-creator.ts` 最近 `612a457b` / `37c93068` / `8a6c84ef` / `cb5c1468`；`fixers/dependency/index.ts` 最近 `0d1dd455` / `873735d6` / `9f747fea`——均未覆盖本阶段范围（仅列最近条目，非穷举））+ 代码 anchor（`pr-creator.ts:230` 仍 `git add .`；`ci-alignment.ts:159/214` 仅记展示态 `unrecognized`；`findDependfixOpenPR` 仅 `state:'open'`；`fixers/dependency/index.ts:481/526` 仍 `YAML.stringify`；engine / cli 无 `check-runs` 调用；`external_noise` / `checkAttribution` 0 命中；`mergify.yml` dependfix 规则仅 `check-success=Test`），**0 项重复评估**。

**审计 depth 预告**：M48.1 / M48.3 / M48.4 / M48.5 → `standard`（M48.3 / M48.5 跨 engine + cli + action，建议 2 分区并发）；M48.2 → `standard`（engine + cli，2 分区）；M48.6 → `deep`（core + platform + CI 模板，含治理定义与外部调用；实际按 `standard` 执行，两分区）。

**后续阶段（已授权，待规划）**：**E：通知可信度收口**（4 项：`critical` 必选不可关闭 / 通知严重级别术语与阈值命名 / 周报投递重试与窗口锁 / `/settings` 与通知页 dark 视觉）。用户 2026-10-24 决策 D+E；M48 已归档，E 待启动 P 阶段，不占 M48 条目容量与编号；启动时按 §1.1 评估是否补足至 5 项。

> **闭环记录（2026-10-25）**：六原子全部闭环并归档，设计口径统一在 [pr-delivery-closure.md](../../design/governance/pr-delivery-closure.md)（未另立专项稿）；审计 / mutation / 容量校准明细见 [todo-archive.md §M48](todo-archive-phases-m48.md#m48-对外-pr-交付闭环-2026-10-24-用户决策-d-e-2026-10-25-归档)。
> 详细任务与 8 要素见 [todo-archive.md §M48](todo-archive-phases-m48.md#m48-对外-pr-交付闭环-2026-10-24-用户决策-d-e-2026-10-25-归档)；上一阶段（M47）见 [todo-archive.md §M47](todo-archive-phases-m47.md#m47-交付判定可信与运行自证-2026-10-22-用户决策方案-a′-2026-10-24-归档)。

---
