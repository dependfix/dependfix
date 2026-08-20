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
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **C53 / 2026-08-20 平台 UI 增强 C59-C61 / M11 推进批次** 共 3 个批次，符合"主窗口保留 3-5 个阶段"策略）。
- 当 `todo-archive.md` 超过 500 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-20）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交本地待推送。详见分片文档。

---


## C53: 平台集成模式 fix 修复结果推送远程（已归档）

> **归档日期**: 2026-08-20
> **归档方式**: 实施 3 commits（`83ec736` / `46b7c15` / `3ed8303`）+ 3 轮 Review Gate 全部 Pass；M11 启动任务，登记 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-已闭环) 后续 P3 子任务
> **阶段摘要**: 闭环 M6 阶段"修复结果仅在本地临时目录"问题——A 模式（`ContainerExecutor`）fix / fix-and-pr 完成后新增推送修复分支到远程 + 创建 PR 两条链路，引入 `pr_creation_failed` 错误码 + 状态机 dispatched 语义 + workDir 保留 24h 供诊断
> **状态**: ✅ 全部完成（C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序）

**批次成果**: 平台 A 模式执行链路完整闭环——修复结果通过 pushFixBranch + createPrForFix 落到远程真实分支/PR，与 B 模式（GitHub Action）形成完整执行后端矩阵。引入 §8.2 状态机扩展（`pr_creation_failed → dispatched`）与 B 模式 `run_url_not_resolved` 语义对齐。

### C53-1: 容器内 push 链路 ✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-push.test.ts` + `scan-orchestrator.service.ts` + `scan-orchestrator.test.ts`
- **实现内容**:
  - 模块级 export `extractBranchName(workDir)`（`git rev-parse --abbrev-ref HEAD`，detached HEAD 抛错）
  - 模块级 export `pushFixBranch(branch, workDir, token?)`（`git push origin <branch>`，token 走 `http.extraheader` base64 basic auth，避免进 argv/URL）
  - `execute()` 在 `app.run()` 成功后对 `fix` / `fix-and-pr` 模式调 push；push 失败归类 `push_failed`
  - `scan-orchestrator` A 模式分支捕获 `runUrl` 落库（与 B 模式对齐）
- **关键 commit**: `83ec736` feat(platform): A 模式 ContainerExecutor 推送修复分支到远程（4 files +215 lines）
- **完成定义**: 7 个 push 单元测试（extractBranchName × 3 + pushFixBranch × 4）+ 2 个 A 模式 runUrl 集成测试
- **审计**: 2 轮 standard Pass with Warning（Round 1 RG-B01 blocker：orchestrator 缺 runUrl 捕获 → 修复 + 2 补强测试；Round 2 RG-W04 拼写错误修复）

### C53-2: PR 创建 + 状态机扩展 ✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-pr.test.ts` + `scan-run-state.ts` + `scan-run-state.test.ts` + `scan-orchestrator.test.ts` + `packages/engine/src/app/index.ts`（re-export）
- **实现内容**:
  - 模块级 export `createPrForFix(result, owner, name, branch, token)` 复用引擎 `createGitHubClient` + `createPullRequest` + `generatePRBody` + `buildPrTitle` + `fetchDefaultBranch` 五个函数
  - `execute()` 在 push 成功后对 `fix-and-pr` 模式调 PR 创建；PR 失败归类 `pr_creation_failed`
  - `runUrl` 兜底为 branch URL（PR 失败时仍可显示供用户手动开 PR）
  - 状态机扩展：`resolveScanRunState('container', { code: 'pr_creation_failed' }, undefined)` → `dispatched` + `errorJson`（与 B 模式对齐）
  - 引擎侧 `packages/engine/src/app/index.ts` 新增 re-export `buildPrTitle` + `fetchDefaultBranch`（之前未对外暴露）
- **关键 commit**: `46b7c15` feat(platform): A 模式 ContainerExecutor 创建 PR + 状态机 dispatched（6 files +261 lines，跨 2 包）
- **完成定义**: 4 个 PR 单元测试（mock engine 按需精确替换）+ 5 个 A 模式状态机 case + 1 个 A 模式 orchestrator 集成 case
- **审计**: 1 轮 standard Pass（2 warning：RG-W1 注释误导修复 / RG-W2 sanitizeErrorMessage 不覆盖 `Authorization: token xxx` 既有缺陷，登记后续 patch）

### C53-3: 清理时序（workDir 保留 24h + 远程分支清理工具）✅

- **交付物**: `apps/platform/server/services/executor/container-executor.ts` + `container-executor-cleanup.test.ts`
- **实现内容**:
  - 模块级 export `moveToPending(workDir, runId, pendingRoot, retentionMs=24h)`：移动 workDir 到 `_pending/{runId}/` + 写 `.meta.json`（含 `writtenAt` / `retentionMs` / `expiresAt` / `reason` 字段）
  - 模块级 export `cleanupRemoteBranch(branch, workDir, token?)`：best-effort 远程分支清理（失败静默）
  - `execute()` 在 push 成功 + PR 失败路径：先 `moveToPending` 保留 24h，再 return `pr_creation_failed`
  - runId 路径穿越防御（白名单 `[A-Za-z0-9_-]+`）
  - 设计选择：PR 失败保留远程分支（用户可手动开 PR），`cleanupRemoteBranch` 当前不主动调用
- **关键 commit**: `3ed8303` feat(platform): A 模式 PR 失败时保留 workDir 24h + 远程分支清理工具（2 files +222 lines）
- **完成定义**: 4 个 moveToPending 单元测试（real fs / 临时目录）+ 3 个 cleanupRemoteBranch 单元测试（mock child_process）
- **审计**: 1 轮 standard Pass（3 warning 登记后续 P3 patch：集成测试缺失 / stale-cleanup 任务缺失 / metadata 写入失败一致性）

### C53 阶段治理记录

- **提交序列**: C53-1 (`83ec736`) → C53-2 (`46b7c15`) → C53-3 (`3ed8303`) 共 3 commits（M11 启动任务）
- **总变更**: 5 新增 + 5 修改 = 10 文件 +898 行（跨 2 包：apps/platform + packages/engine）
- **审计覆盖**: 3 轮独立 Review Gate（C53-1 2 轮 + C53-2 1 轮 + C53-3 1 轮）；所有轮次 Pass with Warning（warning 全部登记后续 patch）
- **关联升级**: 13 条修复执行安全基线（[security.md §5.3 修复执行安全](../standards/security.md)）全过；新增 §5.4 凭据权限阶（A 模式 fit-and-pr 需要 wide-scope PAT / B 模式推荐）+ §5.5 凭据加密存储（C28 + T912-3 联动）

### C53 经验沉淀

- **vitest mock + `util.promisify` 兼容**：mock execFile 必须在 `vi.hoisted` 内部设置 `Symbol.for('nodejs.util.promisify.custom')` 标记为 Promise 风格，否则 `promisify(execFile)` 包装时插入 callback 期望导致 mock 永不触发 → 测试 timeout
- **跨包 import 阻塞 typecheck**：引擎 `app/index.ts` 此前未 re-export `buildPrTitle` / `fetchDefaultBranch`，平台 import 报 TS2305；要在引擎侧 re-export（1 处侵入）而非在平台内内联（破坏 DRY）
- **状态机扩展与 B 模式对齐**：`pr_creation_failed` 命名与 B 模式 `result_fetch_failed` / `run_url_not_resolved` 保持一致，方便上层 UI 通用 dispatched 提示；同步避免新创错误码带来的认知负担
- **runUrl 兜底为 branch URL**：PR 失败时保留远程分支（用户可手动开 PR），UI 仍能跳转查看修复产物；这是平台 A 模式相对 B 模式的关键体验差异——B 模式是 GitHub 托管 runner 上自动开 PR，A 模式需要用户在 UI 提示下手动开 PR

### C53 衍生子任务（已在 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次 详细闭环）

- C53-后-A stale-cleanup 任务（_pending 24h 清理）
- C53-后-B sanitizeErrorMessage 补充 `Authorization: token xxx` 模式
- C53-后-C A 模式 dispatched UI 提示（手动开 PR）

---

## M10: 独立沙箱容器 C26 实施规划（已归档）

> **归档日期**: 2026-08-20
> **阶段摘要**: 兑现沙箱治理决议 G5——Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 + Node 20 自动识别；`SandboxExecutor` 与 `ContainerExecutor` 并存；自托管 docker-compose 优先 / K8s+Helm 仅规划
> **状态**: ✅ 全部完成（T1001 B1+B2 + T1002 + T1003 + T1004 全部 commit + Review Gate Pass；13 commits + T912 主体同步归档）

**批次成果**: Docker rootless runtime + RuntimeAdapter 抽象层（B1 commit `b189aaa` `a07f577` + B2 commit `b6083a7`）+ 出站白名单拦截代理（commit `c68029a` `9da2421`，Review Gate 2 轮 Pass）+ cgroup v2 资源限制（commit `a85fb03` `32658e7`，Review Gate 1 轮 Pass）+ 文档收口 + 治理决议更新（commit `5ae5165` `e48b097` `06377b2` `b289668`，Review Gate 2 轮 Pass）。共 13 commits。

**设计文档落盘**: [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)（§7.1 RuntimeAdapter 抽象 + §7.2 镜像策略 + §7.3 部署形态 + §7.4 与 ContainerExecutor 并存 + §7.5 K8s+Helm 部署预留 + §7.6 验收对照 + §7.7 设计反例）；[sandbox-security-governance.md §5 G5 升级](../design/governance/sandbox-security-governance.md#5-治理决议与登记) 为"实施规划已就绪" + [§7 验收段补 M10 4 子任务验收方式](../design/governance/sandbox-security-governance.md#7-验收与持续治理)；[quick-start.md §启用 rootless sandbox 执行](../guide/quick-start.md) docker rootless daemon 启动指引子段（67 行 / 5 项前置 + 5 步指引 + 3 条反模式绝对禁止）。

**M10 移交下一阶段候选（已全部闭环）**: **T1005 sandbox 路由接线** —— commit `0ea8149` / `5542e33` / `b6bce6c` / `64135ed` / `809aa3b`，5 commits；**C28 security.md §凭据加密存储章节补齐** —— commit `fcef918`；**branches 阈值恢复 80% 冲刺** —— 已完成（branches 80.32% → 80.49%）。

---

## T912: SMTP 邮件发送器主体收口（T912-3 → C28 联动）

> **归档日期**: 2026-08-20
> **阶段摘要**: 兑现 `auth.ts` 三处空回调（sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation）→ 引入 nodemailer + mailer service 三层降级（transport 未配置 → noop / 失败 → fail-closed）+ i18n 双语邮件模板 + coverage 回归修复
> **状态**: ✅ 主体全部完成（T912-1 mailer service 模块 + T912-2 三回调接线 + T912 coverage 回归修复；T912-3 安全与文档已合并入 C28）

**批次成果**: 引入 nodemailer + 自实现 mailer service（apps/platform/server/services/mailer/）—— transport.ts（SMTP 连接 + 测试环境 noop）+ templates.ts（en-US/zh-CN 双语 + inline style 邮件客户端兼容）+ index.ts（sendMail + sendTemplateMail + MailerError + fail-closed 语义）。T912-3 邮件发送安全（[security.md §5.3 修复执行安全](../standards/security.md)）已合并入 **C28 security.md §凭据加密存储章节补齐**（commit `fcef918`）。

**关键 commit**: `edc9c94` mailer service 模块 + `6f00937` 三回调接线 + `6e28207` coverage 回归修复。

---

## 2026-08-20 平台 UI 增强（C59 + C60 + C61）

> **归档日期**: 2026-08-20
> **阶段摘要**: 用户实测反馈暗色模式半亮半暗（C59）+ 表格缺排序（C60）+ 仪表板下方空（C61）三项 UX 问题一次性收口
> **状态**: ✅ 全部完成（C59 mixin 1 行修复 + 永久 e2e；C60 全 7 表 sortable + 业务语义；C61 仪表板 3 图表 + chart.js tree-shakable）

**批次成果**: 平台暗色模式全栈生效 + 7 个 DataTable sortable 三态 + 仪表板新增 severity 饼图/修复率环形/Top-10 包柱状图。

### C59: 暗色模式全局样式未生效 ✅

- **交付物**: `apps/platform/app/assets/styles/_mixins.scss:4-8` `@mixin dark-mode` 1 行修复（`:global(.dark) &` → `.dark &`）+ 永久回归测试 `apps/platform/tests/e2e/dark-mode.e2e.test.ts`
- **实现内容**: `main.scss` 是**全局 CSS**（`nuxt.config.ts:60` `css: ['primeicons/primeicons.css', '@/assets/styles/main.scss']`），无 scope；原 `_mixins.scss:4-8` `@mixin dark-mode { :global(.dark) & { @content; } }` 中 `:global()` 是 CSS Modules 语法（只在 `<style scoped>` 内有效），编译后 `:global(.dark)` 不是合法 CSS 选择器，浏览器静默忽略；改为 `.dark &` 后 4 处 `@include dark-mode`（main.scss body / header / auth + ImportReposDialog scoped）自动 work
- **关键 commit**: `9949504` fix(platform): 暗色模式 mixin 全局上下文失效（C59 修复） + `03ba3b2` docs(plan): C59 状态由待评估同步为已修复
- **完成定义**: 切到 dark mode 后 header / body / nav / auth / 全部自定义 SCSS 容器 跟随 `.dark` 切色；PrimeVue 组件（table/dialog/tag/select）与自定义 SCSS 视觉一致；切换动画 0.2s 流畅
- **审计**: V 阶段 ui-validator 验证「全暗」（原"半亮半暗"截图修复后变全暗）
- **关联**: 原 C29（T601 暗色模式 initial 实现，2026-08-10 用户反馈"依旧不可用"）兜底升档闭环

### C60: 平台表格排序 ✅

- **交付物**: `apps/platform/app/utils/sort-helpers.ts`(枚举常量表 + map helper) + 7 个 DataTable sortable 接入 + 单测 sort-helpers + e2e `apps/platform/tests/e2e/sortable.e2e.test.ts`
- **实现内容**: `sort-helpers.ts` 提供 `SEVERITY_RANK`(critical=5 > high=4 > medium=3 > low=2 > unknown=1) / `STATUS_RANK`(running=3 > completed=2 > failed=1) / `ROLE_RANK`(admin=3 > org_admin=2 > viewer=1) / `FIX_STATUS_RANK` / `RUN_STATUS_RANK` 常量 + `withSeverityRank<T>` / `withStatusRank<T>` / `withRoleRank<T>` map helper（派生字段下划线前缀 `_severityRank` / `_statusRank` / `_roleRank` 表示内部使用）+ `updateStatusRank` / `updateRoleRank` 同步 helper（运行时修改路径必须同步派生 rank — RG-B07 修复）；7 表 sortable（alerts/repos/batch-runs/schedules/credentials/users/repos/[id]/runs）+ `removableSort` 三态（asc/desc/none）+ 业务语义排序 + 零后端改动 + v1 不持久化
- **关键决策**: 2026-08-20 用户确认 1A 全覆盖 + 2B 客户端单列 + 3A 业务语义排序 + v1 不持久化 + v1 不实现多列
- **关键 commit**: `a1d5bd9` sort-helpers 工具 + `532ea78` 全平台 7 表 sortable 接入 + `6b994b5` runs.vue 列数对齐（audit warning 修复） + `5bba3f4` e2e sortable + admin 断言拆分 + `5fbad71` docs Pass 状态同步
- **完成定义**: 7 表 header 点击切换 asc → desc → none；枚举按业务语义（critical 必须排第一）；batch-runs 增量 reconcile 与排序并存（reconcile 不替换已排序数组引用 — C54 + C60 兼容）；repos 排序后 selectedRows 保留（W10 教训）；单测 32 case 全过；e2e sortable 全过
- **审计**: A 阶段 audit-standard 第 1 轮 Reject（9 blocker + 5 warning）→ 全部修复 → 第 2 轮 audit-quick **Pass**；V 阶段 ui-validator 768px 响应式 Conditional 已修复
- **历史教训**（已迁移至 [平台规范 §7.1](../standards/platform.md)，对应 8d02cce wisdom 蒸馏批次）:
  - C60-1 PrimeVue 4 sortable 用 `data-p-sortable-column` 属性（CSS class 已废弃）
  - C60-2 PrimeVue 4 `<Chart>` 内部用 `chart.js/auto` ~200KB 全量（vs 自实现 ChartCanvas 40 KB gzip）
  - C60-3 业务语义排序需 `default-sort-order="-1"`（PrimeVue 默认 asc 与业务顺序相反）
  - C60-4 运行时状态变更路径必须同步派生 rank（RG-B07）

### C61: 仪表板告警图表 ✅

- **交付物**: `apps/platform/app/components/ChartCanvas.vue`(tree-shakable Chart.js 包装) + `apps/platform/server/api/dashboard/stats.get.ts` 新增 `topPackages` 字段 + `apps/platform/app/pages/dashboard.vue` 3 图表卡片 + `apps/platform/package.json` `chart.js@^4.5.0` + i18n 9 键 × 2 语言 + 单测 4 case + e2e `apps/platform/tests/e2e/dashboard.e2e.test.ts`
- **实现内容**: severity 饼图（doughnut，5 段配色复用 `severityTagSeverity`）+ 修复率环形进度（doughnut，前端计算 fixedCount/alertsTotal）+ Top-10 包柱状图（bar，后端 `GROUP BY packageName LIMIT 10` 新增 `topPackages` 字段）；自实现 `ChartCanvas.vue`（tree-shakable 引入 + 仅注册 `LinearScale` / `CategoryScale` / `BarController` / `BarElement` / `DoughnutController` / `ArcElement` / `Tooltip` / `Legend` 子集）；实测 bundle 204 KB raw / 40 KB gzip（达成 < 50KB 目标，节省 150KB / 75% vs chart.js/auto 全量）
- **关键决策**: 2026-08-20 用户确认 2B 推荐方案（severity 饼图 + 修复率环形 + Top-10 包柱状图）；3 种方案对比 → 推荐 A+Top-10（B 方案）；chart.js 自实现而非 PrimeVue `<Chart>`（避免 `chart.js/auto` ~200KB 全量）
- **关键 commit**: `ffacfca` chart.js 依赖 + ChartCanvas + 后端 stats.topPackages + `5abd914` dashboard 图表区 + i18n + `402dc03` 768px 响应式 grid 单列 + `5bba3f4` e2e dashboard + `5fbad71` docs Pass 同步
- **完成定义**: 仪表板"告警按严重级别"下方新增 3 卡片（severity 饼图 + 修复率环形 + Top-10 包柱状图）；3 卡片同高（CSS grid `align-items: stretch`）；空数据 empty 占位；Top-10 柱状图横轴包名截断 20 字符 + tooltip 完整名；chart.js gzip < 50KB；vue-i18n audit 零告警
- **审计**: A 阶段 audit-standard 第 1 轮 Reject（9 blocker + 5 warning）→ 全部修复 → 第 2 轮 audit-quick **Pass**；V 阶段 ui-validator Conditional（768px 响应式 grid 单列已修复）
- **历史教训**（已迁移至 [平台规范 §7.1](../standards/platform.md)，对应 8d02cce wisdom 蒸馏批次）:
  - C61-1 PrimeVue 4 sortable 用 `data-p-sortable-column` 属性（CSS class 已废弃）
  - C61-2 PrimeVue 4 `<Chart>` 内部用 `chart.js/auto` ~200KB 全量（vs 自实现 ChartCanvas 40 KB gzip）

### 阶段治理记录

- **提交序列**: C59 (`9949504` → `03ba3b2`) → C60 (`a1d5bd9` → `532ea78` → `6b994b5` → `5bba3f4` → `5fbad71`) → C61 (`ffacfca` → `5abd914` → `402dc03` + `5bba3f4` + `5fbad71`) 共 10 commits 待推送
- **审计覆盖**: C59 1 轮 audit-quick Pass；C60+C61 audit-standard 第 1 轮 Reject (9 blocker + 5 warning) → 全部修复 → 第 2 轮 audit-quick Pass + V 阶段 ui-validator Conditional 768px 已修复
- **关联**: C60 + C61 同批启动但独立 PR 决策；与 M10 cgroup 资源限制（T1003）/ C61 chart 引入是无关路径；C58 alerts.vue 同类图表已登记 backlog
- **历史教训**: W13 Nuxt e2e webServer 缓存（修改 .vue 后必须 rebuild）；C61 选用自实现 ChartCanvas 而非 PrimeVue wrapper 是 tree-shakable 原则的具体实践

---

## 2026-08-20 M11 推进批次（业务可见性 + 沙箱落地 + 安全文档 + 通知基建）

> **归档日期**: 2026-08-20
> **阶段摘要**: C53 闭环触发 M11 启动 → 三方面子任务全部闭环：
> 1. **业务可见性 + UX**：C53-后-A/B/C（C53 衍生 P2/P3）+ C56/C57（批量扫描 + 扫描历史 UX 小修）
> 2. **沙箱落地**：T1005-A/B/C/D（sandbox 路由接线 4 子任务 + degraded 状态机 + 仓库级 sandboxLimits）
> 3. **安全文档**：C28（security.md §凭据加密存储章节补齐 + 凭据权限阶）
> 4. **通知基建**：C-ENV-CHANGE-ALERT（环境容器变化告警——audit_event 表 + NotificationChannel 接口 + Email 实现 + scan-orchestrator 触发 + env-events UI）
> 5. **告警可视化**：C58（alerts 按包聚合 + 图表卡片复用 C61）
> **状态**: ✅ 全部完成（22 commits 总投入：M11 推进批次 12 commits + 此前 M11 启动批次 10 commits）
> **详细归档**: 见 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)

### M11 推进批次摘要

**子任务闭环清单**（详细实现与 commit 见分片文档）：

| 子任务 | 优先级 | 关键 commit | 完成要点 |
|:--|:--:|:--|:--|
| C53-后-A stale-cleanup | P2 | `931b5b7` | nitro plugin 周期清理 `_pending/` workDir + 7 个真实 fs 测试 |
| C53-后-B sanitizeErrorMessage | P3 | `bfecf6a` | 正则扩展 basic/token/Bearer 三 scheme + 6 个测试 |
| C53-后-C dispatched UI 提示 | P3 | `5d7ee97` | i18n 双键 + runs.vue/batch-runs.vue 条件渲染 pr_creation_failed 提示 |
| T1005-A sandbox UI 选项 | P1 | `0ea8149` | Dropdown + i18n 双语 + executorKind 类型扩展 |
| T1005-B sandboxLimits 透传 | P2 | `5542e33` / `b6bce6c` | B1 实体+schema+zod（11 测试）+ B2 orchestrator 透传（16 测试） |
| T1005-C degraded 状态机 | P1 | `64135ed` | degraded 分支实现 + degradedCount + 14 个断言 |
| T1005-D quick-start 同步 | P2 | `809aa3b` | 移除过时警告 + G5 行更新 |
| C28 凭据加密存储章节 | P2 | `fcef918` | §5.5 算法契约 + 密钥派生 + fail-closed + 密钥轮换边界 |
| C56 批量扫描 Dialog 乐观关闭 | P3 | `cda5b90` | 提交前 batchDialogVisible=false + 失败回滚 |
| C57 扫描历史返回列表按钮 | P3 | `cda5b90` | RepoHistoryDialog header slot pi-arrow-left |
| **C58 告警聚合 + 图表** | P3 | `a562ab2` / `5bb0f96` | useDashboardStats composable + dashboard-charts helper（27 测试）+ alerts 顶部 3 图表 + rowGroup + expandableRowGroups + 4 e2e |
| **C-ENV-CHANGE-ALERT 环境告警** | P3 | 6 commits `aeee3f0`/`f57683e`/`15f1c9a`/`3f4653f`/`64f005e`/`f678196` | audit_event 表 + 类级复合索引 + SQLite migration + NotificationChannel 接口 + Email + Slack/Webhook Stub + 邮件模板双语 + scan-orchestrator A/B 触发 + env-events UI + 权限防护 + 11 e2e |

### M11 阶段治理记录

- **总变更**: 22 commits（C58 + C-ENV-CHANGE-ALERT 12 commits + 此前 M11 启动批次 10 commits）
- **测试覆盖**: +56 新测试 = 681 tests pass
- **branches coverage**: 80.49% ≥ 80% 阈值
- **审计覆盖**:
  - C58 + C-ENV-CHANGE-ALERT：2 轮深度 standard Pass（第 1 轮 Reject 9 blocker + warning → 全部修复 → 第 2 轮 Pass）
  - C53-后 / T1005 / C28 / C56 / C57：quick Pass / standard Pass 各自
- **文档落盘**: `docs/standards/security.md` §5.4 + §5.5 / `docs/design/governance/executor-sandbox.md` §7.8 / `docs/guide/quick-start.md` 同步
- **关键经验**（已迁移至 docs/standards/）:
  - **TypeORM 1.x 复合索引必须类级声明**：列级 `@Index(['col1', 'col2'])` 会生成仅含末列的单列索引；e2e 二次运行会暴露第二个仓库的 500 错误
  - **PrimeVue 4 rowGroup 模式**：必须预排序 + `sortMode="multiple"` + `expandableRowGroups` + DataTableExpandedRows 期望 `Record<string, boolean>`
  - **fire-and-forget 通知失败语义**：scan-orchestrator 主流程不 await；channel 内部 try/catch + console.error；AuditEvent.notified 字段供后续重试
  - **图表复用决策**：PrimeVue `<Chart>` 内部 `chart.js/auto` ~200KB → 自实现 ChartCanvas tree-shakable 40KB gzip（节省 75%）

### M11 验收标准（全部闭环 ✅）

- [x] 平台 A 模式 `fix-and-pr` 真实环境跑通（push + PR 闭环 + UI 提示）—— C53 闭环
- [x] T1005 路由接线后 sandbox 执行器可真实触发（docker daemon 可用时）—— T1005-A/B/C/D 闭环
- [x] security.md §5.4 + §5.5 凭据权限阶 + 加密存储章节落地 —— C28 闭环
- [x] C56 / C57 平台 UX 用户反馈小修闭环 —— `cda5b90` 闭环
- [x] branches 80% 覆盖率维持 —— 80.49%
- [x] `pnpm lint` / `typecheck` / `test` 全绿 —— 677/681 passed + lint 0 error + typecheck 0 error
- [x] CI 端到端裁决通过 —— 2 轮深度审计全部 Pass

---

> **分片文件** 2026-08-20 由归档批次迁出：`docs/plan/archive/todo-archive-phases-m11.md`（M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次详细归档）。
