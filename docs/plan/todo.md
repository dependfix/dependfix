# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。

## 当前阶段

> 当前阶段：**M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强**（2026-09-02 用户决策启动；候选池从 [backlog.md](backlog.md) §短期 / 一次性候选任务 + §已知边界 选取，按"类型平衡"原则拆 **5 原子条目**独立闭环：M23.0 治理批次 + M23.1 M22.7 根因排查 + M23.2 M22.8 根因排查 + M23.3 C66 告警视图增强 + M23.4 测试补强；详见 [roadmap.md §M23](roadmap.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强启动-2026-09-02)）
>
> **前置**：M22 hotfix commits（M22.7 `f617b56 + 51e8c13` + M22.8 `bdcd900 + 2472b05`）已全部推送到 origin/master；ahead 数字实证 `git rev-list HEAD ^origin/master --count`（M23 D 阶段开工前重新实证）
>
> **待人工验收**：T701 真实凭据 3 项 / T702 HTTP 层状态流转 / T704 async 定时触发（实施部分已由 M21.5 闭环）随真实环境推进；详见 [backlog.md §待人工验收](backlog.md#待人工验收真实环境随可用性推进)。

### M23.0 治理批次（合并 G1+G2+G3，🛡️ 治理）

- **目标**：消化 M22 沉淀批次审计 W-2/W-3/W-4 标记的 neat-freak 治理债 + wisdom 蒸馏核验 + wisdom 4 条 pattern 挂 standards（commit `43f40b5` 已落地「commit message 信息密度」必查项）
- **范围**：① **G1** M22 neat-freak 收敛（[backlog.md §延期 / 暂缓项 §M22 规范单点声明收敛](backlog.md#延期--暂缓项)）—— security.md §2.1 为 SQLite 防护规则权威完整声明，development.md §5.1.18 / platform.md §3.7 第 1/2/3 条收敛为引用 + 仅保留差异化信息；② **G2** wisdom 蒸馏核验（实测 `pnpm distill:wisdom --check` 输出 WISDOM_OK：17 active entries < 20 阈值已合规；wisdom.md 蒸馏日志最近记录为 2026-09-02 M22.8 hotfix（active 20 → 21），本次实测 17 条表明存在未登记的精简——属 wisdom 文档自身一致性瑕疵，header 文本"当前活跃条目 21 条"已 stale，登记 follow-up；本批次仅做状态核验，无新增蒸馏动作）；③ **G3** wisdom 4 条 pattern 挂 standards：
  - code-auditor.agent.md 主责边界新增「构建产物 grep 兜底」必查项（涉 runtime env 条件判断 / server/api 端点 / 安全门控 改动时 audit 必 rebuild + grep 实测产物）
  - development.md §5.1.20 新增 atomic commit 边界示例（提取 const 重构支撑 vs 改 const 计算语义业务行为变更必须分 commit）
  - ai-collaboration.md §4 PDTFC+ 补充 CI 偶发错误三阶段协议（① handler / 单测 / 本地复现穷举 → ② helper 层兜底修复 → ③ 根因 backlog 分离 + M 阶段规划时优先排查）
  - testing.md 补充 e2e global-setup 串行场景网络抗性最佳实践 + e2e 未认证 API 调用测试标准模式（`storageState: { cookies: [], origins: [] }` 强制隔离）
- **优先级**：P2（治理）
- **验收**：
  - [ ] security.md §2.1 为权威完整声明，development.md §5.1.18 + platform.md §3.7 收敛为引用 + 仅保留差异化信息（差异化信息段不重复 SQLite 防护规则全文）
  - [ ] wisdom 活跃条目 ≤ 20（蒸馏后实证 `pnpm distill:wisdom --check`）
  - [ ] 4 条 pattern 正式挂入对应 standards / agent 文档（含交叉引用链接）
  - [ ] `pnpm run lint:md` + `pnpm run check:docs` 0 error
- **依赖**：M22 全部 commit 已推送至 origin/master（M22.7 hotfix `f617b56 + 51e8c13` + M22.8 hotfix `bdcd900 + 2472b05`）；commit `43f40b5` 已落地信息密度规范强化
- **交付物**：security.md §2.1 + development.md §5.1.18 + platform.md §3.7 三 文档同步修订 + `.session/wisdom.md` 蒸馏 + 4 条 standards 挂接 + 1-2 atomic commits
- **风险与缓解措施**：neat-freak 收敛涉及 3 个文档同步编辑，避免漏改 → D 阶段开工前先 `rg -n "SQLite 启动期备份|db-restore|db-doctor"` 全仓库扫描引用位置；wisdom 蒸馏可能误删高价值条目 → 蒸馏前 `wisdom.md` 快照备份 + 关键 pattern 单独保留
- **不做什么**：不修改 SQLite 防护规则实质内容（仅做单点声明收敛）；不实施 M23.0 G3 之外的 wisdom 挂接条目

### M23.1 M22.7 根因排查（🛡️ 治理 / 治本）

- **目标**：找到 M22.7 E2E global-setup ECONNRESET 真实根因 + 落地治本修复（替代 M22.7 helper 层 maxRetries 兜底）
- **范围**：从 [backlog.md §E2E global-setup 串行场景 ECONNRESET 根因（M22.7 hotfix 衍生）](backlog.md#e2e-global-setup-串行场景-econnreset-根因m227-hotfix-衍生) 4 候选按 ROI 排查 1 项（**推荐 P0 = ③ SQLite WAL 模式 + `journalMode=delete` → `journalMode=wal` + busy_timeout 优化**：治本收益最大 + 风险最低 + 与 M22 防御加固体系一致）；如 P0 排查失败降级 P1 = ① better-auth 1.7 transaction 关闭时序
- **优先级**：P1（治理 / 治本）
- **验收**：
  - [ ] 选定根因结论（实证证据 + 失败模式分析）登记到 backlog.md + experience-archive.md
  - [ ] 若产生修复代码（如 WAL 模式切换），按 [PDTFC+ 修复工作流] 落地 atomic commit + CI run 验证
  - [ ] 关闭 [backlog.md §E2E global-setup 串行场景 ECONNRESET 根因 候选根因排查 M23 优先](backlog.md#e2e-global-setup-串行场景-econnreset-根因m227-hotfix-衍生) 段
  - [ ] wisdom.md 新增 pattern 沉淀（如 SQLite WAL 模式切换 / better-auth transaction 时序）
- **依赖**：M23.0 G1/G2/G3 治理批次完成；M22.7 commit `f617b56 + 51e8c13` 已推送；M22 防御加固体系（backup / db-restore / db-doctor）已闭环
- **交付物**：根因结论登记 backlog.md §E2E global-setup 串行场景 ECONNRESET 根因 + experience-archive.md 新增§ + wisdom.md 新增 pattern + 治本 atomic commit（若产生修复）
- **风险与缓解措施**：SQLite WAL 模式切换可能影响 e2e 测试稳定性 → 切换前先小范围验证 + 保留 rollback 路径（journalMode=delete 切换前备份 PRAGMA 配置）；better-auth transaction 时序排查涉及跨进程边界，需 CI 复现日志而非本地
- **不做什么**：不动 M22.7 helper 层 maxRetries 兜底（保留兜底）；不动 M22.5 / M22.6 双门控体系；不修改 better-auth 1.7 库内部逻辑（外部依赖）

### M23.2 M22.8 根因排查（🛡️ 治理 / 治本）

- **目标**：找到 M22.8 未认证 API 测试 cookie 注入真实根因 + 落地治本修复（如 Playwright fixture isolation helper / 平台级 setup pattern）
- **范围**：从 [backlog.md §Playwright 1.62 fixture pool 注入 cookie 根因（M22.8 hotfix 衍生）](backlog.md#playwright-1.62-fixture-pool-注入-cookie-根因m228-hotfix-衍生) 3 候选按 ROI 排查 1 项（**推荐 P0 = ① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证**：直接验证 fixture pool 行为假设 + 可产出测试层防御加固）；如 P0 排查失败降级 P1 = ② better-auth 中间件对非 /api/auth/* 端点 Set-Cookie 路径扫描
- **优先级**：P1（治理 / 治本）
- **验收**：
  - [ ] 选定根因结论（源码追溯证据 + 测试复现脚本）登记到 backlog.md + experience-archive.md
  - [ ] 若产生修复代码（如 Playwright fixture 隔离 helper / 平台级 setup pattern），按 [PDTFC+ 修复工作流] 落地 atomic commit
  - [ ] 关闭 [backlog.md §Playwright 1.62 fixture pool 注入 cookie 根因 候选根因排查 M23 优先](backlog.md#playwright-1.62-fixture-pool-注入-cookie-根因m228-hotfix-衍生) 段
  - [ ] wisdom.md 新增 pattern 沉淀（如 Playwright fixture pool 隐式传播 / fixture isolation helper）
- **依赖**：M23.0 G1/G2/G3 治理批次完成；M22.8 commit `bdcd900 + 2472b05` 已推送；testing.md e2e 未认证 API 调用标准模式（commit `43f40b5` §3.6 + §1.6 配套规范）已落地
- **交付物**：根因结论登记 backlog.md §Playwright 1.62 fixture pool 注入 cookie 根因 + experience-archive.md 新增§ + wisdom.md 新增 pattern + fixture isolation helper commit（若产生）
- **风险与缓解措施**：Playwright fixture isolation helper 抽取需兼容既有 6+ e2e 测试描述块 → 改造前先做 1 个代表性用例验证；better-auth 中间件 Set-Cookie 路径扫描可能引入新测试面 → 风险登记 backlog
- **不做什么**：不动 M22.8 测试层 `storageState: { cookies: [], origins: [] }` 显式隔离（保留兜底）；不升级 Playwright 版本（仅实证 + 加固）；不动 better-auth 库内部逻辑

### M23.3 C66 告警视图增强（🚀 能力扩展 / UX）

- **目标**：实现 C66-A1+A2+C+D 4 子任务（GHSA/CVE 列展示 + 跨次扫描复用），让告警唯一标识（GHSA ID）可在平台 UI 直接查看 + 修复模式复用 scanRunId
- **范围**：承接 2026-08-25 用户实测反馈；按 [backlog.md §远期登记 / 未排期增强候选 §C66 告警视图增强](backlog.md#远期登记--未排期增强候选) 5 子任务中 **A1+A2+C+D 4 子任务**实施（B 数据层去重 B1 暂缓，应用层去重已实施满足当前需求）：
  - **C66-A1** ScanResult 数据模型扩展：加 `ghsaId` / `cveIds` 列 + TypeORM 1.x 类级复合索引迁移（按 §3b D 阶段自检强制项）
  - **C66-A2** fetcher 提取 GHSA + CVE：Dependabot API `cve_id` + `identifiers[]` 透传 / pnpm-audit `cves[]` 透传；`NormalizedSecurityAlert` 接口加字段
  - **C66-C** alerts UI 增加 GHSA / CVE 列：单列智能 `Identifiers` 列（GHSA 优先，fallback CVE，多 CVE 展开）+ 复用 alerts-rowgroup 视觉
  - **C66-D** fix 模式复用 scanRunId：`POST /api/repos/[id]/scan` 接受 `reuseScanRunId` 跳过重拉 + alerts 视图加 "立即修复此仓库" 入口
- **优先级**：P2（能力扩展 / UX）
- **验收**：
  - [ ] ScanResult 实体 ghsaId/cveIds 列 + TypeORM 1.x 复合索引迁移（**类级声明**，§3b 教训）
  - [ ] NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher 透传字段
  - [ ] alerts.vue Identifiers 列渲染（GHSA 优先 + 多 CVE 展开） + i18n 键全语言覆盖
  - [ ] POST /api/repos/[id]/scan 接受 `reuseScanRunId` 跳过重拉（schema 校验 + 复用现有 ScanResult alerts）
  - [ ] alerts 视图加 "立即修复此仓库" 入口（reuseScanRunId 透传）
  - [ ] e2e 二轮验证复合索引（按 §3b D 阶段自检强制项：`pnpm --filter @dependfix/platform test:e2e` 连跑两遍验证幂等）
  - [ ] A 阶段 code-auditor standard depth Pass（跨 packages/core + apps/platform，文件数 > 8 触发并发审计）
- **依赖**：packages/core 接口扩展 → apps/platform fetcher 同步 → apps/platform UI 改造（顺序实施，跨包契约先于实现）；i18n 9 语言覆盖现状（zh-CN / en-US / 其他 7 语言由 M9 基建同步落地）；alerts-rowgroup e2e 视觉模式（M16.4 useAsyncData 迁移已落地）
- **交付物**：ScanResult 实体迁移 + NormalizedSecurityAlert 接口扩展 + Dependabot fetcher 透传 + pnpm-audit fetcher 透传 + alerts.vue Identifiers 列 + scan.post.ts reuseScanRunId 参数 + i18n 9 语言键 + e2e + 1-2 atomic commits
- **风险与缓解措施**：TypeORM 1.x 复合索引迁移必须类级声明（§3b 教训，e2e 二次运行暴露）→ e2e 二轮验证复合索引 + D 阶段开工前 SQLite DDL grep 实证；跨 packages/core + apps/platform 文件数 > 8 → 触发并发审计；alerts.vue 复用 alerts-rowgroup 视觉需 i18n 全语言覆盖 → D 阶段开工前 i18n 键清单核对
- **不做什么**：C66-B 数据层去重（B1 暂缓，应用层去重已实施满足当前需求）；独立 `Identifiers` 列 vs `ruleId` 列分离保留为后续增强候选；不重写 Dependabot 详情页；不立即支持自定义 advisory 来源（GitLab Advisory Database 等）；不破坏现有 fixStatus / 修复链路

### M23.4 测试补强（🧪 测试补强 / 治理收口）

> **注**：原计划 T2（M18.x W1+W2）+ T3（Code Scanning RG-W01+RG-W02）已分别由 M21.2 commit `fe7cc0f + ad376c8` + M21.1 commit `0a83c74 + a77e557` 闭环，本段范围收敛仅保留未闭环的 T1。

- **目标**：消除 cron-preview 测试对真实 wall clock 的依赖（16h / 8h 分支 flaky test fix），固定-now 断言 + 强化分支覆盖
- **范围**：
  - **T1** [backlog.md §测试基础设施清理 §cron-preview 时区测试 wall-clock 依赖消除](backlog.md#测试基础设施清理) S1+S2 两条：S1 用 `vi.setSystemTime` 写固定-now 用例断言 `diffHours === 16` + 对照用例固定到 8h 窗口断言 `diffHours === 8`（强制两个分支都被覆盖）；S2 改 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`
- **优先级**：P3（测试补强 / 治理收口）
- **验收**：
  - [ ] cron-preview.test.ts 0 真实 wall clock 依赖（`vi.setSystemTime` 固定-now 断言）
  - [ ] vitest 单测通过 + lint + typecheck 0 error
  - [ ] 编号标记扫描 0 命中（按 §3 D 阶段自检强制项 + code-auditor 主责边界必查项）
- **依赖**：M23.0 治理批次完成；commit `3597dcf`（cron-preview flaky test fix audit suggest 登记）作为基线
- **交付物**：cron-preview.test.ts 修改（vi.setSystemTime 固定-now 用例 + 断言改写）+ 1 atomic commit
- **风险与缓解措施**：固定-now 测试可能错过未来 cron-parser 行为退化 → 加分支断言（diffHours === 8 或 160）强制两个分支都被覆盖；vi.setSystemTime + cron-parser currentDate 参数语义对齐需测试复跑验证
- **不做什么**：不修改 cron-preview.ts 实现（仅测试改动）；不升级 cron-parser；不动其他测试基础设施

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 4 阶段：M23 / M22 / M21 / M20；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |