# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **M24 阶段 2026-09-03 用户决策启动**（**方案 B：能力突破优先**），按"类型平衡"原则拆 **5 原子条目独立闭环**：M24.1 [P1 🚀 能力] PR Check 状态监测 MVP（~1100 行新建 + ~70 行修改 + 5 phase 串行）/ M24.2 [P2 🛡️ 治理] M22.7+M22.8 根因 4 项残留源码排查（~150 行 + 文档 + 部分验证依赖非 sandbox 环境）/ M24.3 [P3 🧪 测试] cron-preview wall-clock 依赖消除（M23.4 commit `df4ba9b` 后续 audit suggest 1+2+3 闭环）/ M24.4 [P3 🛡️ 治理] M18.x W1+W2 + Code Scanning RG-W01/W02 集中清理（~110 行 + 3 测）/ M24.5 [P2 🎨 体验] C36 服务端 API i18n 扩展（沿用 M17 已沉淀 createLocalizedError 模式 + ~300 行 + i18n 键）。详见 [roadmap.md §M24](roadmap.md#m24-pr-check-mvp--治理债--测试补强--用户体验)。
>
> **关键决策（2026-09-03 用户决策）**：
> - 方案选择 = 方案 B（能力突破优先：PR Check MVP 单条目 + 配套治理 + 测试补强 + 体验扩展）
> - M24.5 体验扩展 = C36 服务端 API i18n（而非 UX-R3 `/scans` 页面深化）
> - PR Check MVP 保持在 M24.1 内（不独立 M25 阶段；5 phase 串行严格按 M24.1.1-5 顺序）
> - M24.2 候选替换 = M22.7+M22.8 根因 4 项残留源码排查（原方案 B 的 M24.2「M22 neat-freak 收敛」已被 M23.0 G1 commit `f8a8640` 闭环，从候选池替换）
> - wisdom 蒸馏：本批次不主动启动（WISDOM_OK 17 ≤ 20 阈值已合规，无强需求）
>
> **待人工验收**：T701 真实凭据 3 项 / T702 HTTP 层状态流转 / T704 async 定时触发（实施部分已由 M21.5 闭环）随真实环境推进；详见 [backlog.md §待人工验收](backlog.md#待人工验收真实环境随可用性推进)。

---

## M24: PR Check MVP + 治理债 + 测试补强 + 用户体验

> **背景**：M23 闭环后承接 backlog 候选池，2026-09-03 用户决策启动方案 B（能力突破优先）。方案 B = PR Check MVP 单条目（占 M24 总规模 ~58%） + 配套治理（M22.7+M22.8 根因排查 + M18.x+Code Scanning 集中清理）+ 测试补强（cron-preview wall-clock）+ 体验扩展（C36 服务端 API i18n）。类型平衡：🚀 1 + 🛡️ 2 + 🧪 1 + 🎨 1 = 5 原子条目；总规模预估 ~1860 行新建 + ~70 行修改 + ~14 commits。

### M24.1 [P1 🚀 能力] PR Check 状态监测 MVP

> **背景**：dependfix 已"发起"依赖更新链路（创建 PR、触发 workflow_dispatch、回填扫描结果），但缺反向通道——**这些 PR 上跑的 GitHub Action 失败没人主动知道**。失败后果：dependfix 升级修复 PR 跑挂 → 升级状态停滞 + 用户不知情；dependabot PR 跑挂 → mergify 不合并（依赖 `check-success=Test`）+ 用户不知情。两条链路的 CI 失败都属于"沉默失败"，破坏 dependfix 的自动化承诺。**业务价值**：补全"发出去"与"反馈回来"的闭环，让依赖治理失败信号可见、可追溯、可告警。

**范围**：

- **Phase 1** 实体 + 索引（PRCheck entity + migration + 二轮 e2e 验证复合索引）
- **Phase 2** service + scheduler 接入（ActionStatusMonitor + PollingSource + Schedule type='pr-check'）
- **Phase 3** API 层（4 端点 + ack PATCH + 测试）
- **Phase 4** UI 层（页面 + ack 按钮 + 复用 alerts-rowgroup 视觉）
- **Phase 5** docs 收口（experience-archive + wisdom.md + 依赖更新 PR 监测最佳实践章节）

**关键决策（2026-09-02 用户决策落地）**：

- **D1**：PRCheck 实体位于 `apps/platform/server/entities/pr-check.ts`（独立于 ScanResult，状态语义不同）
- **D2**：Polling 间隔默认 5min/仓（实测后调；GitHub `actions: read` 不计入主限流）
- **D3**：失败 PR firing alert + ack UI（失败时 firing，UI 提供 ack 按钮；回归 success 时自动 ack）
- **D4**：用户手动创建 schedule 启用（不创建默认 schedule，避免无 App installation 用户报错；用户在 Schedule UI 创建 `pr-check` 类型 schedule 启用）
- **D5**：webhook MVP 仅接口预留（`PRCheckSyncSource` interface + PollingSource implements + WebhookSource 留位），webhook handler 文件不挂路由
- **D6**：仅 per-org scope（per-org 监测；跨组织聚合留作后续）
- **D7**：env 开关 `ACTION_STATUS_MONITOR_ENABLED` 默认 false（schedule 启用后启动时检查）
- **D8**：必须在文档中明确 mergify 仍是主控（dependfix README + `.github/mergify.yml` 注释 + PRCheck 设计文档："mergify 负责通过即合（按 `check-success=Test`）；PRCheck 负责失败即显（监测 + alert）。互不干扰。"）

**核心架构（Polling + 接口预留 Webhook）**：

- **数据层**：新建 `apps/platform/server/entities/pr-check.ts`（PRCheck 实体）；类级复合唯一索引 `(repositoryId, prNumber, headSha)`；类级复合索引 `(repositoryId, conclusion)`（dashboard 活跃失败查询）；类级复合索引 `(repositoryId, createdAt)`（仓库详情时间线）
- **service 层**：新建 `apps/platform/server/services/monitor/`（独立目录）
  - `types.ts`：`PRCheckSyncSource` interface（PollingSource + WebhookSource 互换点）
  - `polling-source.ts`：实现 PRCheckSyncSource；复用 `packages/engine/src/github/client.ts` Octokit（retry/rate-limit 已实现）+ AuthProvider（M18+） + `actions: read` scope
  - `action-status-monitor.ts`：核心 service；调用 `PRCheckSyncSource` + 落库 + alert 状态机（失败 firing / 回归 success 自动 ack）
- **调度层**：复用 `apps/platform/server/services/scheduler/scheduler.service.ts`（M22.5 既有 node-cron + BullMQ 双模式）；新增 schedule type='pr-check'；用户在 Schedule UI 创建 + 启停
- **API 层**：新建 `apps/platform/server/api/pr-checks/`（4 端点：`index.get.ts` 列表 + `[id].get.ts` 单 PR 时间线 + `summary.get.ts` dashboard 概览 + `../webhooks/github-check-run.post.ts` 接口预留，MVP 不挂路由）
- **UI 层**：新建 `apps/platform/pages/pr-checks/index.vue`（复用 alerts-rowgroup 视觉模式 + 单独标签区分；不复用 ScanResult alerts）；ack 按钮在 PRCheck 行内
- **alert 联动**：复用 alerts-rowgroup 视觉（PRCheck 单独 API + 单独 UI 标签避免与 ScanResult alerts 混淆）；ack 操作通过 `PATCH /api/pr-checks/[id]` `{ alertFiring: false }`

**关键风险与缓解**：

- PRCheck 实体初次 e2e 二跑暴露复合索引声明错误（§3b 教训）→ Phase 1 必跑 `pnpm --filter @dependfix/platform test:e2e` 二轮验证；声明类级复合唯一索引
- Polling 间隔过短触发 GitHub API 限流 → MVP 默认 5min/仓；429 response 自动 backoff（复用 `packages/engine/src/github/client.ts` 既有 retry）
- 用户未注册 App 时 Octokit 调用 401 → service 启动时 sanity-check（拉一次 user repo 列表）；失败时降级 skip + log warn（不影响其他 polling 任务）
- dependfix 自身 PR 的 head_sha 与 dependabot PR 字段不一致 → 抽象 `DependencyPR` interface + 统一规范化
- Scheduler 与 queue 启动顺序（sync 模式直接 node-cron / async 模式需 BullMQ ready）→ 复用 M22.5 scheduler init 顺序；失败时 log error + 后续 retry
- ack 操作被绕过（用户 ack 后实际 CI 仍失败）→ ack 仅关闭 alert firing，不修改 `conclusion`；alert 状态机严格基于 polling 结果

**验收标准**：

- [ ] dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR（author=`dependabot[bot]`）的最新 `Test` check 状态可被定时抓取并落库
- [ ] 状态变化时（pending → success / failure）落 `PRCheck` 行（复合唯一索引 `(repositoryId, prNumber, headSha)` 幂等）
- [ ] 失败 PR 通过 alerts 系统 firing（**D3**）；UI 提供 ack 按钮；回归 success 时自动 ack
- [ ] polling 任务可关闭（schedule 启停 + env 开关 `ACTION_STATUS_MONITOR_ENABLED`）；关闭时保留历史 PRCheck 但停止新轮询
- [ ] 用户手动在 Schedule UI 创建 `pr-check` 类型 schedule 启用（**D4**）；默认未启用
- [ ] UI 提供 `/api/pr-checks` 列表（支持 `repositoryId` / `conclusion` / `alertFiring` 过滤）+ 单 PR 时间线
- [ ] mergify 不受影响（监测失败不阻止 mergify 决策；**D8** 在文档中明确说明）
- [ ] webhook 接口预留（`PRCheckSyncSource` abstract + PollingSource implements）但 MVP 不实现
- [ ] 编号标记扫描 0 命中（按 [开发规范 §3 注释规范](../standards/development.md) + [code-auditor 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）

**范围 / 非目标**：

- **MVP 不做**：① 监测所有 check-runs（仅 Test job）；② 监测所有 PR 作者（仅 dependfix + dependabot）；③ 自动 retry / 关闭失败 PR（仅监测 + 告警 + ack UI）；④ 实时 webhook（仅 polling + 接口预留）；⑤ 跨组织聚合视图（仅 per-org）
- **未来扩展候选**（评估时点视 backlog 演化而定）：① webhook 实现替换 polling（MVP 接口已预留）；② 监测其他 check（lint / e2e / coverage）；③ 跨组织聚合 dashboard；④ Slack/邮件通知集成；⑤ 自动 retry 失败的 PR 关联工作流

**预估**：~1100 行新建 + ~70 行修改；commits 预估 ~7-10 commits（按 5 phase × 1-2 commits 拆分）

### M24.2 [P2 🛡️ 治理] M22.7+M22.8 根因 4 项残留源码排查

> **背景**：M22.7 hotfix（commit `f617b56`）已落地 helper 层 maxRetries 兜底 + M22.8 hotfix（commit `bdcd900`）已落地 fixture pool helper 抽取；M23.1（commit `2ffaa45`）+ M23.2（commit `09c3dee`）已治本 SQLite WAL + fixture pool cookie 注入。但 M22.7+M22.8 根因 4 项残留候选仍有 4 项未完全治本：
> - **① better-auth 1.7 transaction close 时序** —— 在 `getAuth()` 加 `[auth] transaction close trace` 日志 + `ds.transaction` 包装打印 begin/commit 时间戳；CI 复现一次确认是否仍存在
> - **② Nitro h3 `defineEventHandler` async generator 行为** —— 检查 fixtures.delete handler 是否被识别为 generator（`async function*`）导致提前 close socket；CI 复现一次确认
> - **③ ~~SQLite WAL 模式~~** —— M23.1 commit `2ffaa45` 已闭环
> - **④ fixtures API 请求间节流** —— 经验性方案，避免作为唯一修复（依赖非 sandbox 环境重跑 e2e 验证）
>
> **关键决策**：本批次仅启动**源码层面排查**（不依赖非 sandbox 环境），如需 CI 复现确认可登记 follow-up 由下批次执行。

**范围**：

- ① better-auth 1.7 transaction close 时序源码追溯（找 `getAuth()` 入口 + transaction 包装 trace 注入点）
- ② Nitro h3 `defineEventHandler` async generator 行为源码追溯（检查 fixtures.delete handler 是否会被识别为 generator）
- ④ fixtures API 请求间节流源码追溯（fixtures handler 是否有并发请求节流逻辑）
- 输出：4 项根因排查报告 + wisdom.md 新增 N 条 pattern（如有） + experience-archive.md §新增案例（如有）

**关键决策**：

- 源码排查：本批次**仅做源码追溯**，不依赖非 sandbox 环境 CI 复现
- 已治本候选（M23.1 / M23.2）不重复登记，本批次仅 4 项残留候选 ①/②/④
- 经验性方案（④）作为兜底保留，不强制替代治本修复

**验收标准**：

- [ ] better-auth 1.7 transaction close 时序源码追溯报告（输出排查结论 + trace 注入点推荐位置）
- [ ] Nitro h3 `defineEventHandler` async generator 行为源码追溯报告（输出 fixtures.delete handler 行为判定）
- [ ] fixtures API 请求间节流源码追溯报告（输出 fixtures handler 是否有节流逻辑 + 建议）
- [ ] wisdom.md 新增 pattern（如适用，活跃条目 17 ≤ 20 阈值已合规）
- [ ] experience-archive.md 新增案例（如适用）
- [ ] follow-up 登记（如本批次无法本地验证，登记 follow-up 候选）
- [ ] 编号标记扫描 0 命中

**范围 / 非目标**：

- 不做：CI 复现确认（依赖非 sandbox 环境）
- 不做：根因治本修复（仅源码排查 + 报告；如发现根因，登记下批次实施）

**预估**：~150 行 + 文档（commit `f617b56 + bdcd900 + 2ffaa45 + 09c3dee` 4 处源码 read + 排查报告）；commits 预估 1 commit

### M24.3 [P3 🧪 测试] cron-preview wall-clock 依赖消除

> **背景**：M23.4 commit `df4ba9b`（2026-09-02 落地 cron-preview.test.ts wall-clock 依赖消除）已部分闭环；当前状态 `apps/platform/app/utils/cron-preview.test.ts:89` 已接受 `diffHours % 24 ∈ {8, 16}` 两个值（消除跨日边界 flaky），但仍依赖真实 wall clock（`cron-preview.ts:65` `CronExpressionParser.parse` 未传 `currentDate`）。本批次闭环 audit suggest 1+2+3。

**范围**：

- **S1** 用 `vi.setSystemTime(new Date('2026-08-30T18:56:00Z'))` 写一个固定-now 用例断言 `diffHours === 16`，再加一个对照用例固定到 8h 窗口断言 `diffHours === 8`
- **S2** 把当前 L89 断言改为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`
- **S3** 评估是否能复用 `setupMemoryDatabase` 等测试 helper 模式（结论：cron-preview 是前端工具，不涉及 DB；不适用，文档化说明）

**关键决策**：

- 复用 M23.4 commit `df4ba9b` 既有代码（不再重新设计）
- S3 helper 模式评估结论：**不适用**（cron-preview 是前端工具函数，无 DB 依赖）；按 [testing.md §6 补充](../standards/testing.md) 文档化说明

**验收标准**：

- [ ] S1 双分支固定-now 用例（8h + 16h 各 1 case）
- [ ] S2 表达式简化（`=== 8 || === 160` 替换 `% 24 ∈ {8, 16}`）
- [ ] S3 helper 模式评估结论文档化（不适用 + 理由）
- [ ] 跨日边界 flaky 0（连续 5 次跑 cron-preview.test.ts 全绿）
- [ ] 编号标记扫描 0 命中

**预估**：~50 行测；commits 预估 1 commit

### M24.4 [P3 🛡️ 治理] M18.x W1+W2 + Code Scanning RG-W01/W02 集中清理

> **背景**：4 项治理债从 M18.x audit round 2 + Code Scanning audit 累积：
> - **W1** stageAndCommit --local flag 路径回归测试未覆盖（M18.x audit round 2 W1）
> - **W2** detectServerLocale 大小写值敏感（?locale=EN 不接受）
> - **RG-W01** pr-creator.ts:214 execSync('git add .') 建议替换为 execFileSync（Code Scanning #26）
> - **RG-W02** fixers/pnpm/index.ts:144 execSync(queryCommand) 含模板拼接（Code Scanning #27）

**范围**：

- **W1** 补 1 个 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config 验证 ensureGitConfig 会写入 local config
- **W2** 修复 detectServerLocale 大小写值敏感（?locale=EN 等同 ?locale=en）+ 补测
- **RG-W01** pr-creator.ts:214 execSync('git add .') → execFileSync('git', ['add', '.'])
- **RG-W02** fixers/pnpm/index.ts:144 execSync(queryCommand) 含模板拼接 → execFileSync 数组传参

**关键决策**：

- 合并为单条目 1 commit（治理债集中清理；与 M21.1 + M21.2 同模式）
- execFileSync 替换沿用 [experience-archive §四十四](../../docs/design/governance/experience-archive.md#四十四code-scanning-命令注入漏洞修复--execfilesync-替代-execsync2026-08-30) 经验

**验收标准**：

- [ ] W1 stageAndCommit --local flag 路径回归测试覆盖（`process.env.GIT_CONFIG_GLOBAL` 模拟 + 不预设 local config）
- [ ] W2 detectServerLocale 大小写值接受（?locale=EN 等同 ?locale=en）
- [ ] RG-W01 pr-creator.ts:214 execSync 替换为 execFileSync
- [ ] RG-W02 fixers/pnpm/index.ts:144 execSync 替换为 execFileSync
- [ ] Code Scanning 0 告警（依赖 github-code-scanning 工具实测或本地 grep 兜底）
- [ ] 编号标记扫描 0 命中

**预估**：~110 行 + 3 测；commits 预估 1 commit

### M24.5 [P2 🎨 体验] C36 服务端 API i18n 扩展

> **背景**：当前 API 错误消息硬编码英文如 `error.code.field_required`；用户体验：中文用户看不懂；触发：M8 国际化后未覆盖服务端。M17.2-4 已沉淀 createLocalizedError 模式（10 文件分 3 子阶段 credentials / schedules / batch-runs + repos batch），本批次扩展 M17 未覆盖的 pr-checks 模块（与 M24.1 同步实施，避免 pr-checks API 错误消息硬编码英文）。

**范围**：

- **pr-checks 模块**（M24.1 同步实施）：所有 error code/message 走 createLocalizedError
- i18n 键命名沿用 `error.<code>.message` 模板
- locale 检测策略沿用 M16.3：`cookie(i18n_locale) > Accept-Language > 默认 zh-CN`

**关键决策**：

- 范围控制：本批次**仅 pr-checks 模块**（≤ 4 端口避免"4 端口合 1 批"反模式，M17.4 教训）
- 复用 createLocalizedError 模式（M17 沉淀）：code 强契约位置 `data.code`（h3 1.15 `createError` 不透传任意顶层字段）
- 与 M24.1 同步实施：避免 pr-checks API 错误消息硬编码英文

**验收标准**：

- [ ] pr-checks 模块所有 error code/message 走 createLocalizedError
- [ ] i18n 键 zh-CN + en-US 双语言覆盖（`error.not_found.message` / `error.forbidden.message` / `error.internal_error.message` 等）
- [ ] 单测覆盖（每个 code 至少 1 个中英文断言）
- [ ] locale 检测：cookie(i18n_locale) > Accept-Language > 默认 zh-CN
- [ ] 编号标记扫描 0 命中

**范围 / 非目标**：

- 不做：M17 已覆盖模块（credentials / schedules / batch-runs + repos batch）的二次扩展
- 不做：多语言扩展（zh-TW / ko-KR / ja-JP，留待 backlog §C36 后续阶段）

**预估**：~300 行 + i18n 键；commits 预估 2 commits（按 M17.4 经验"业务 throw 改造"+"测试调整"拆分）

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 阶段：M24 / M23 / M22 / M21 / M20；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |