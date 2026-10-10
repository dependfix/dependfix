# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M42 进行中**——修复交付正确性 + 平台能力与体验补强（6 原子条目，见下方 §M42） |
| 下一阶段（未授权） | 无——本阶段闭环后按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估 [backlog.md](backlog.md) 候选池后由用户决策 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M41 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M41 已归档 + M42 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M42: 修复交付正确性 + 平台能力与体验补强（2026-10-10 用户决策方案 A+B 混合）

> **阶段定位**：贯穿「被 dependfix 管理的仓库的实际受害面」与「平台能力/体验补强」两条线——修复验证阶段镜像源被 deny-by-default 拦死、`.gitignore` 幂等判定失效、扫描复用路径误置既有 run 为 failed 三类影响可用性与数据正确性的缺陷；补齐 PR Check 手动触发能力与平台列表页表格基础能力；收敛严重级别展示口径。
>
> **类型平衡**：🛡️ 2（M42.1 / M42.3）+ 🐛 1（M42.2）+ 🚀 1（M42.4）+ 🎨 2（M42.5 / M42.6）= 6 原子；**🧪 独立条目缺口显式标注**（测试随各条目内嵌，符合 [规划规范 §1.1](../standards/planning.md#11-硬性约束) 类型平衡建议的显式标注惯例）。
>
> **§3.4 三重交叉核验**：0 项重复评估——① `todo-archive.md` + `archive/todo-archive-phases-*.md` 全量扫描（关键词 `ensureGitignore` / `npmmirror` / `DEFAULT_ALLOWED_DOMAINS` / `reuseScanRunId` / `pr-checks/poll` / `scanSeverityOptions`）零命中已闭环修复；② `git log --all` 核验无对应修复 commit（network-audit 最近改动为 `2104b9f` 追加 `rolldown.rs`；`helpers.ts` 无幂等修复；`scan.post.ts` 最近为 `9f9d067` 降级路径透传 reuse，非本缺陷）；③ 代码 anchor 逐项实测未闭环（`network-audit.ts:65` 白名单 6 域无 `npmmirror`；`helpers.ts:668` 仍精确字符串比较；`scan.post.ts:89-105` reused 分支置 failed；无 `pr-checks/poll.post.ts`；`repos.vue:280` / `batch-runs.vue:245` 无分页筛选；`run-view.ts:35` 等 3 类展示面并存）。
>
> **审计 depth 预告**：M42.1 改变执行期网络边界 + 治理定义改动（[security.md §5.3](../standards/security.md) + [sandbox-security-governance.md §4.4](../design/governance/sandbox-security-governance.md) 治理评审为硬前置）→ `standard`（建议 2 分区并发）；M42.3 涉及 run 状态写路径 → `standard`；M42.4 新增公开 API 端点 → `standard`；M42.2 / M42.5 / M42.6 按规模 `quick`。

### M42.1 [P2 🛡️] network-audit 出站白名单：预置常见镜像源 + 动态发现生效 registry

- **目标**：让 verification 阶段出站白名单默认覆盖常见 npm 镜像源，并能从 `workDir` 的 pnpm 配置面动态发现生效 registry，消除「镜像源被 deny-by-default 拦死 → `pnpm install` 失败 → 门禁全量回滚」链路。
- **优先级**：P2
- **范围**：`packages/engine/src/runners/network-audit.ts:65-72`（`DEFAULT_ALLOWED_DOMAINS` 扩充；发现逻辑可抽 `registry-discovery.ts`）+ `packages/engine/src/runners/verification-runner.ts:167-168`（按 `workDir` 发现并传入 `startNetworkAudit({ allowedDomains })`）+ `network-audit.test.ts` / `verification-runner.test.ts` + 文档（[security.md §5.3](../standards/security.md) / [sandbox-security-governance.md §2.2 / §4.4 / §5](../design/governance/sandbox-security-governance.md) / [executor-sandbox.md §2.2](../design/governance/executor-sandbox.md) / [quick-start.md](../guide/quick-start.md) 安全注意事项）。
- **验收标准**：
  - [ ] ① **单测**（`pnpm --filter @dependfix/engine exec vitest run src/runners/network-audit.test.ts`）：预置清单命中镜像域（registry + CDN）+ 动态发现纳入 `registry` 与 `@scope:registry` 的 host + 非法值（`*` / 含 `/` / 空值 / 超长）被拒 + `evil.example.com` 仍不在白名单。
  - [ ] ② **行为回归**（`verification-runner.test.ts`）：既有「非白名单域名 502 + violation」用例不回归；新增「镜像域 CONNECT 不记 violation」用例。
  - [ ] ③ **真实环境（镜像站）**：registry 指向镜像源的机器跑 `dependfix fix-and-pr`（门禁回滚仅此路径与 `fix --commit` 触发，纯 `fix` 不触发）→ 运行日志 **0** 条 `outbound blocked by allowlist: CONNECT registry.npmmirror.com:443`、基线 `pnpm install --frozen-lockfile` 不再 `timed out`、不再出现 `Changes rolled back`。
  - [ ] ④ **真实环境（非预置私服）**：`.npmrc` 指向非预置清单的私服 registry（如本地 Verdaccio）→ 不经 `DEPENDFIX_ALLOWED_DOMAINS` 即可完成安装（验证动态发现路径生效）。
  - [ ] ⑤ **文档门禁**：`pnpm run check:docs` 0 error + `pnpm run lint:md:check` 通过 + `pnpm run check:doc-size` 无新增 warning。
- **不做什么**：不放开 deny-by-default（未知域仍拦）；不做镜像源真实性/完整性校验与镜像源审批流程（用户 2026-10-10 裁定，恶意代码执行风险由沙箱承接）；不放行非安装链路的第三方前端 CDN（`cdn.jsdelivr.net` / `unpkg.com` 等）;不把代理覆盖到 fix 阶段的 `pnpm install`（现状不经代理，另案观察）；不改 `pnpm-audit-fetcher` 强制官方 registry 的口径；不改沙箱网络模式（bridge）与 cgroup 限额；不处理 GitHub 侧 clone / push 不可达（见 backlog §网络优化）。
- **依赖**：治理评审**硬前置**——本改动改变执行期网络边界，须对照 [executor-sandbox.md §2.2 风险定级与缓解](../design/governance/executor-sandbox.md) 逐项评估并登记 [sandbox-security-governance.md §5 治理决议与登记](../design/governance/sandbox-security-governance.md)（未过评审不得进 D 阶段）；用户 2026-10-10 已裁定方案（预置可信镜像源 + 动态发现 + 用户配置默认可信）。**根因证据（测量方 = 执行角色，2026-10-10 排查；可复现）**：`apps/platform/data/dependfix.sqlite` 经只读连接 `sqlite3.connect('file:apps/platform/data/dependfix.sqlite?mode=ro', uri=True)` 查询 `dependfix_scan_run.logs_json`，同时含 `outbound blocked by allowlist` 与 `npmmirror` 的 run = **5 个**（2026-10-02 15:28 / 15:29 / 16:17 / 16:27 / 16:50），其中 **1 个**（`683f617ba4794d95`，status `failed`）复现完整链——日志含 **989×** `[baseline] outbound blocked by allowlist … CONNECT registry.npmmirror.com:443` + `"pnpm install --frozen-lockfile" already failing before this run (timed out)` + `Verification failed …: pnpm test — exit code 1` + `Changes rolled back`，`error_json` = `engine_delivery_failed（VERIFICATION_FAILED）`。旁证：本机 `curl` 实测 `registry.npmmirror.com/vite` → 200、tarball → 302 `cdn.npmmirror.com` → 200（镜像源与 CDN 可达，排除「沙箱无网」）。
- **交付物**：预计 2-3 commits——① engine 实现 + 单测（`network-audit.ts` / `registry-discovery.ts` 新增 + `verification-runner.ts` + 2 测试文件）；② 规范 / 治理 / guide 文档同步（4 文档）；③ 真实环境验证结论回填（可选，1 文档）。预计 8-10 文件 / 300-450 行（单模块 engine + 文档，治理面更新既有 governance 文档、不新建）。
- **风险与缓解**：**R1 白名单扩大 → 攻击面扩大**（第三方镜像被投毒/劫持）——仅 host 粒度 + 预置清单收敛 + 动态来源限「配置面」+ violation 记录不回退 + 沙箱为执行前提；**R2 动态解析过宽**（把通配/异常值当 host）——严格 host 正则 + 单测覆盖非法值；**R3 302 CDN 漏放行**（看似修好实则仍拦）——预置清单 registry + CDN 成对登记 + 验收 ③ 真实 install 实证；**R4 发现子进程失败/超时**——fail-open 到预置清单，仅 warn 不阻断；**R5 fix 阶段 `pnpm install` 不经代理**（既有缺口、非本方案引入）——登记独立观察项候选，不在本方案范围；**R6 规范与实现口径漂移**——以 [security.md §5.3](../standards/security.md) 为唯一事实源 + 审计必查项。

### M42.2 [P2 🐛] 目标仓库 `.gitignore` 幂等判定归一化（消除重复追加）

- **目标**：让 `ensureGitignore()` 的幂等判定识别语义等价的忽略写法，消除目标仓库 `.gitignore` 被重复追加 `dependfix-reports/` 的问题。
- **优先级**：P2
- **范围**：`packages/engine/src/app/helpers.ts:651-670`（幂等判定归一化；canonical 写法选型）+ `packages/engine/src/app/helpers.test.ts`（当前对该函数零覆盖，需补幂等 + 多等价形态单测）。
- **验收标准**：
  - [ ] ① **单测**（`pnpm --filter @dependfix/engine exec vitest run src/app/helpers.test.ts`）：语义等价写法（`/dependfix-reports`、`dependfix-reports`、`/dependfix-reports/`、`**/dependfix-reports/`、带行内注释）判定为「已忽略」不追加。
  - [ ] ② **单测**：真正未忽略的 `.gitignore`（完全无该条目）仍追加 canonical 条目一次，且 canonical 写法与各仓库既有条目对齐口径一致。
  - [ ] ③ **幂等**：连续调用 `ensureGitignore` 两次后 `.gitignore` 内容字节级不变（新增单测）。
  - [ ] ④ **实测**：在复现场景（`/root/projects/caomei-ui` 的 `.gitignore` 已含人工条目 `/dependfix-reports`）跑一次后无重复条目（人工核对）。
  - [ ] ⑤ `pnpm lint` 0 error + `pnpm typecheck` 0 error。
- **不做什么**：不改 `run()` 收尾（`app/index.ts:316`）与本地提交前（`helpers.ts:623`）两个调用点；不引入 `.gitignore` 完整语法解析依赖；不做「删除既有重复条目」的清理（仅防新增）。
- **依赖**：实测复现证据（`/root/projects/caomei-ui/.gitignore` 第 47-50 行人工条目 `/dependfix-reports` + 工具运行后追加 `dependfix-reports/`）；调用点 `helpers.ts:623` + `app/index.ts:316` 各执行一次，任一 run 即复现。
- **交付物**：预计 1-2 commits——① engine 修复 + 单测（`helpers.ts` + `helpers.test.ts`）；② 规范登记（如需，`development.md` 或经验登记）。1-2 文件 / 40-80 行。
- **风险与缓解**：**R1 归一化过宽 → 误判**（如 `dependfix-reports/*` 仅忽略内容却被判为等价）——明确 `.gitignore` 语义等价集 + 误报面单测；**R2 canonical 写法与各仓库既有条目不一致**——首次追加写法与既有约定对齐并单测锁定。

### M42.3 [P2 🛡️] 扫描复用路径与同仓库去重合并叠加时误置既有 run 为 failed 修复

- **目标**：修复 `scan.post` 的 reuse 路径在 `queue.add` 命中同仓库去重合并（`reused: true`）时，把用户指定的既有终态 run 误置 `failed` 的数据正确性缺陷。
- **优先级**：P2
- **范围**：`apps/platform/server/api/repos/[id]/scan.post.ts:80-105`（reused 分支的处置）+ `apps/platform/server/api/repos/[id]/scan.post.test.ts`（补 reuse + 去重合并叠加用例）。
- **验收标准**：
  - [ ] ① **单测**（`pnpm --filter @dependfix/platform exec vitest run server/api/repos`）：`reuseExisting` 非空 + `queue.add` 返回 `reused: true` → 被复用的既有 run 终态**保持不变**（不置 `failed`），响应携带 duplicate 提示。
  - [ ] ② **单测**：新建路径（无 `reuseScanRunId`）+ `reused: true` → 孤儿 pending run 仍置 `failed`（既有行为不回归）。
  - [ ] ③ **单测**：sync / async / failover 三路径 reuse 语义一致（复用 run 不被误改状态）。
  - [ ] ④ `pnpm typecheck` 0 error + 定向 vitest 通过。
- **不做什么**：不改 reuse 校验的其他分支（存在 / 归属 / 非 running）；不改 worker 端 `reuse: true` 透传语义；不引入「同仓库存在进行中任务 → 409 前置拒绝」的新方案（仅在 reused 分支收敛既有 run 状态处置；如需前置拒绝另登记候选）。
- **依赖**：M38.3 `scan.post` failover 透传 reuse（`9f9d067`）为邻近逻辑，本批须保持三路径同源；`scan-queue.ts:58/109` 的 `reused` 语义（同仓库进行中任务去重合并，未新建 job）。
- **交付物**：预计 1-2 commits——① platform 修复 + 单测（`scan.post.ts` + `scan.post.test.ts`）。2 文件 / 30-60 行。
- **风险与缓解**：**R1 改动影响异步入队主路径**——覆盖 sync / async / failover 三路径用例；**R2 与「orphan pending run 置 failed」既有语义混淆**——在 AC 中显式区分「复用既有 run」与「新建孤儿 run」两类主体分别断言。

### M42.4 [P2 🚀] PR Check 手动触发（同步端点 + 总开关门控）

- **目标**：为 PR Check 页面提供「立即检查」入口，无 `pr-check` 计划时也能即时刷新监测链路（同步端点，受 `ACTION_STATUS_MONITOR_ENABLED` 门控）。
- **优先级**：P2
- **范围**：新增 `apps/platform/server/api/pr-checks/poll.post.ts`（`requireRole` admin/org_admin + `requireOrgResource` 组织隔离）+ `apps/platform/server/services/scheduler/scheduler.service.ts:207`（`triggerPrCheckSchedule` 的「按 credential 聚合 → Octokit → `pollOnce`」抽为共享函数复用）+ `apps/platform/app/pages/pr-checks.vue`（「立即检查」按钮 + 结果 toast）+ i18n ×2 + 单测 + e2e。
- **验收标准**：
  - [ ] ① **端点单测**：未启用总开关 → 返回 `skipped` + 提示（与 schedules 触发语义一致）；启用 → 触发 `pollOnce` 并返回 processed / errors 统计。
  - [ ] ② **权限**：非 admin / org_admin → 403；跨组织资源 → 403（`requireOrgResource`）。
  - [ ] ③ **e2e**：pr-checks 页「立即检查」按钮可见 + 点击后 toast 呈现（未启用时提示路径覆盖）。
  - [ ] ④ `pnpm run check:i18n` parity 0 + `pnpm typecheck` 0 error + 定向 vitest 通过。
- **不做什么**：不做异步入队（重方案，暂不采纳）；不新增 admin 设置项 / DB 持久化与迁移（与「不改 ActionStatusMonitor 实体」一致）；不改 `pollOnce` 内部逻辑；不改既有 `POST /api/schedules/[id]/trigger` 语义。
- **依赖**：M39.5（`kind` 落库 + `monitor-status` 只读总开关端点，`3b8e322`）已就位，共享 `isActionStatusMonitorEnabled()`（`scheduler.service.ts:142`）与 `triggerPrCheckSchedule` 的 credential 聚合逻辑；评估结论已完成（用户 2026-10-10 裁定形态 = 同步端点 + 总开关门控）。
- **交付物**：预计 2 commits——① 后端端点 + service 抽共享函数 + 单测（`api/pr-checks/poll.post.ts` + `.test.ts` + `scheduler.service.ts`）；② 前端按钮 + i18n ×2 + e2e。预计 6-8 文件 / 150-250 行。
- **风险与缓解**：**R1 请求路径内直调 GitHub API，仓库多时耗时长**——同步 + 上限/超时，超限返回部分结果并披露；**R2 未启用时前端交互歧义**——复用 `monitor-status` 端点前置判定，按钮态与提示一致。

### M42.5 [P2 🎨] 平台列表页表格基础能力补强（repos / batch-runs 筛选 + 搜索 + 分页）

- **目标**：为 `repos` / `batch-runs` 两个列表页补齐筛选、搜索与分页能力（caomei `DataTable` 无内建 filters / globalFilter，须页面侧实现）。
- **优先级**：P2
- **范围**：`apps/platform/app/pages/repos.vue`（搜索：owner / name / tags / credential；筛选：executorKind / packageManager / credential；分页 10/25/50）+ `apps/platform/app/pages/batch-runs.vue`（筛选：source / status，可选 mode / severity；分页）+（可选）轻量 `useClientTableFilter` composable + i18n ×2 + e2e。
- **验收标准**：
  - [ ] ① **repos 页**：搜索（owner / name / tags / credential）与筛选（executorKind / packageManager / credential）叠加生效 + 分页（10/25/50）切换正确。
  - [ ] ② **batch-runs 页**：筛选（source / status，可选 mode / severity）+ 分页切换正确，保留现有排序。
  - [ ] ③ **e2e**：筛选 / 搜索 / 分页交互用例通过（含「排序 + 分页」叠加分支）。
  - [ ] ④ `pnpm typecheck` 0 error + `pnpm lint` 0 error + `pnpm run check:i18n` parity 0。
- **不做什么**：不改 `/api/repos` 全量返回与 `/api/batch-runs` `take: 50` 的服务端契约（客户端实现）；不延伸至 `users` / `credentials` / `env-events` / `schedules` 等其它表（后续按需另登记）；不引入 `DataTable` 内建之外的第三方表格库。
- **依赖**：评估结论已完成（2026-10-10，推荐客户端实现——repos 服务端返全量、batch-runs 已 `take: 50`）；`repos.vue:280` / `batch-runs.vue:245` 的 `columns` 现有部分列 `sortable`。
- **交付物**：预计 2-3 commits——① repos 页筛选/搜索/分页 + i18n；② batch-runs 页筛选/分页 + i18n；③ e2e。预计 5-8 文件 / 200-350 行。
- **风险与缓解**：**R1 抽 composable 过度抽象**（减法原则）——先页面内实现，重复面 ≥2 处且形态一致时再抽共享；**R2 客户端分页与增量 reconcile / 排序交互**——沿用 M39.1 byRepo 客户端分页既有模式，e2e 覆盖叠加分支。

### M42.6 [P3 🎨] 严重级别展示策略统一（单一事实源）

- **目标**：统一 `severityThreshold` 在各界面的展示策略，收敛到 `scanSeverityOptions` 单一事实源（含 `all` 走 i18n）。
- **优先级**：P3
- **范围**：`apps/platform/app/utils/scan-options.ts:20`（`scanSeverityOptions` 单源）+ `apps/platform/app/utils/run-view.ts:35`（`runThresholdLabel` 小写直通）+ `apps/platform/app/pages/scans.vue:745`（内联小写直通）+ `apps/platform/app/pages/batch-runs.vue:64`（`severityLabel` 大驼峰）+ `apps/platform/app/components/alert-run-sidebar.vue`（raw 直通）+ `apps/platform/app/pages/repos/[id]/runs.vue`（raw 直通，legacy 页）+ `apps/platform/app/components/repo-history-dialog.vue`（raw 直通，在用）。
- **验收标准**：
  - [ ] ① 全部 `severityThreshold` 展示点统一经 `scanSeverityOptions`（或同源查找）渲染，含 `all` 走 i18n。
  - [ ] ② 全仓 `rg` 确认无遗留「raw 直通 / 小写直通」实现（`rg -n "severityThreshold" apps/platform/app` 逐点核对）。
  - [ ] ③ 视觉回归基线重建后幂等（`pnpm --filter @dependfix/platform test:visual`，如展示文案变更需 `--update-snapshots=all` 重建）。
  - [ ] ④ `pnpm typecheck` 0 error + e2e 相关用例通过。
- **不做什么**：不改 `env-events.vue` 的 `severityOptions`（词表 `all/info/warn/error/critical` + 独立 `envEvents.*` 命名空间，属环境事件严重度非同源）；不改 `alerts.vue` 的 `severityOptions`（含 `Low` / `Unknown`）；不删除 legacy `/repos/[id]/runs` 页（属死代码候选，另登记）。
- **依赖**：无前置。现状锚点（3 类展示面并存）——① **大驼峰 + `all` 走 i18n**：`scanSeverityOptions`（`utils/scan-options.ts:20` 单一事实源）/ `batch-runs.vue:64` 的 `severityLabel`；② **小写直通 + `all` 走 i18n**：`run-view.ts:35` 的 `runThresholdLabel` / `scans.vue:745` 内联；③ **raw 直通（连 `all` 都不翻译）**：`alert-run-sidebar.vue` 的 `row.severityThreshold` / `repos/[id]/runs.vue`（legacy 页）/ `repo-history-dialog.vue`（在用，`scans.vue` 挂载）。非同源已排除：`env-events.vue`（独立 `envEvents.*` 命名空间）/ `alerts.vue`（含 `Low` / `Unknown`）。
- **交付物**：预计 1-2 commits——① 统一展示策略 + 视觉基线重建（如需要）；② 文档登记（如需）。预计 4-7 文件 / 40-100 行。
- **风险与缓解**：**R1 在用界面（`repo-history-dialog`）文案变更影响视觉基线**——按 `--update-snapshots=all` 重建并幂等复验；**R2 误改非同源选项表**（env-events / alerts）——AC 显式排除 + `rg` 穷举核对。
