# 待办事项归档分片 — M23

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-09-30 M33 归档批次预防性分片迁出：M33 段新增前主窗口 655 行 + M33 段新增将超 700 强制分片阈值；M23 是主窗口最早的完整段，按 [archive/index.md](../archive/index.md) §2「主窗口保留 3-5 个已归档阶段」迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

---

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（M23.0+M23.1+M23.2+M23.3+M23.4 全部已闭环 / 2026-09-02 归档）

> **归档日期**：2026-09-02
> **阶段摘要**：承接 M22 闭环 + M22.7 hotfix（CI 33525721103 E2E global-setup ECONNRESET）+ M22.8 hotfix（CI 33533376712 未认证 API 测试 cookie 注入）衍生根因治理债 + [backlog.md §C66 告警视图增强](../backlog.md)（2026-08-25 用户实测反馈"alerts UI 看不到 GHSA/CVE/rule 关键标识"）+ 测试基建清理。按"类型平衡"原则（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）拆 **5 原子条目独立闭环**：
>
> - **M23.0**（P2，🛡️ 治理）治理批次合并 G1+G2+G3 —— G1 M22 neat-freak 收敛（security.md §2.1 为 SQLite 防护规则权威完整声明，development.md §5.1.18 / platform.md §3.7 收敛为引用 + 仅保留差异化信息）；G2 wisdom 蒸馏阈值核验（实测 WISDOM_OK 17 ≤ 20 阈值已合规，无需新增蒸馏）；G3 wisdom 4 条 pattern 挂 standards（[code-auditor.agent.md 主责边界「构建产物 grep 兜底」必查项](../../../.github/agents/code-auditor.agent.md) + [development.md §5.1.20 atomic commit 边界示例](../../../docs/standards/development.md) + [ai-collaboration.md §4 PDTFC+ CI 偶发错误三阶段协议](../../../docs/standards/ai-collaboration.md) + [testing.md §6.4 e2e 未认证 API 调用标准模式](../../../docs/standards/testing.md)）
> - **M23.1**（P1，🛡️ 治理 / 治本）M22.7 ECONNRESET 根因排查 —— 从 backlog §E2E 段 4 候选按 ROI 排查 1 项落地候选 ③ SQLite WAL 模式 + `journal_mode=WAL` + `busy_timeout=5000ms` 治本（commit `2ffaa45` fix(platform)），helper 层 maxRetries 兜底保留不动
> - **M23.2**（P1，🛡️ 治理 / 治本）M22.8 fixture pool cookie 注入根因排查 —— 从 backlog §Playwright 段 3 候选按 ROI 排查 1 项落地候选 ① fixture pool `test.use → browser.newContext` 注入路径源码实证（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯）+ helper 抽取（`apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）
> - **M23.3**（P2，🚀 能力扩展 / UX）C66 告警视图增强 A1+A2+C+D 4 子任务 —— C66-A1 ScanResult ghsaId/cveIds 列 + 类级复合索引 + migration 1750000000000（§3b 教训）；C66-A2 NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher extractIdentifiers helper 透传；C66-C alerts.vue 独立 Identifiers 列（GHSA 优先 + 多 CVE 折叠 + fallback CVE + code-scanning 兜底）；C66-D reuseScanRunId + 立即修复入口（**已在 M16.2 闭环，不计入本批验收**——audit suggest 触发的提前抽取）
> - **M23.4**（P3，🧪 测试补强）cron-preview wall-clock 依赖消除 —— 用 `vi.setSystemTime` 写固定-now 用例 + 改写 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`（cron-parser 实测返回可能值 8 或 160，强制两个分支都被覆盖）
>
> **阶段边界**：M23 严格遵循 [规划规范 §1.1 任务粒度约束](../../standards/planning.md)（5 原子条目 ≤ 5-6 硬上限）+ 类型平衡（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）；不涉及 TypeORM 0.3.x 升级或 PostgreSQL 迁移（M24 候选）；不引入新依赖；不升级 better-auth / Nuxt；不动 M22.7 helper 层 maxRetries 兜底（保留兜底）+ 不动 M22.5/M22.6 双门控体系；C66-D 在 M16.2 已闭环（reuseScanRunId API + scan.post.test.ts 6 用例 + useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts）；C66-B 数据层去重暂缓（应用层去重已实施满足当前需求）。
>
> **非目标**：不重写 Dependabot 详情页；不立即支持自定义 advisory 来源（GitLab Advisory Database 等）；不破坏现有 fixStatus / 修复链路；不修改 better-auth 1.7 库内部逻辑（外部依赖）；不动 M22 hotfix 兜底（保留兜底修复 + 治本修复并存模式）。
>
> **状态**：✅ 全部完成（M23.0 + M23.1 + M23.2 + M23.3 + M23.4 全部 5 原子条目共 **17 atomic commits 全部 ahead=0 已推送至 origin/master**；9 轮独立 Review Gate Pass：M23.3 C66-C standard depth Round 1 Pass（0 blocker / 4 warning / 3 suggest）+ 其余 8 轮 quick depth Pass；含 C66-C standard depth Round 1 W1 typecheck 验证矩阵不完整 git stash 实证非本批引入 + W3 todo.md stale 已本批同步修正 + W4 i18n 9 语言声明错引已本批同步改为双语言现状）

### 阶段闭环清单

#### M23.0 治理批次（合并 G1+G2+G3）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **G1 M22 neat-freak 收敛** | `f8a8640`（docs(standards)） | security.md §2.1 为 SQLite 防护规则权威完整声明（§2.1.1-§2.1.5 五子节），development.md §5.1.18 + platform.md §3.7 第 1/2/3 条收敛为引用 + 仅保留差异化信息 |
| **G2 wisdom 蒸馏核验** | `35b9714`（docs(plan)） | `pnpm distill:wisdom --check` 实测 WISDOM_OK 17 ≤ 20 阈值已合规；wisdom.md header 文本"当前活跃条目 21 条"已 stale 登记 follow-up（本批次仅核验状态合规） |
| **G3 wisdom 4 条 pattern 挂 standards** | `606df17`（docs(standards+agents)） | code-auditor.agent.md 主责边界新增「构建产物 grep 兜底」必查项 + development.md §5.1.20 新增 atomic commit 边界示例 + ai-collaboration.md §4 PDTFC+ 补充 CI 偶发错误三阶段协议 + testing.md 补充 e2e global-setup + 未认证 API 调用标准模式 |
| **G3 commit hash 占位符填入** | `c265205`（docs(plan)） | G3 commit `?` → `606df17` 关联回填 |

#### M23.1 M22.7 根因排查（🛡️ 治理 / 治本）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **SQLite WAL 模式 + busy_timeout 治本** | `2ffaa45`（fix(platform)） | `PRAGMA journal_mode=WAL` + `busy_timeout=5000ms`（SQLite 默认 `journal_mode=delete` 切换为 WAL 模式；hold-tx 时长从 1s 提升到 5s） |
| **经验归档 §五十三 SQLite WAL 教训** | `74d3dd8`（docs(design)） | experience-archive.md §五十三 SQLite WAL 模式 + busy_timeout 治本 M22.7 ECONNRESET 根因候选 ③ 教训完整案例（症状 + 4 候选 ROI 排序 + P0 ③ 治本 + 剩余 3 候选待 CI 复现 + 4 条教训 + 3 项 governance check point） |
| **M23.1 验收闭环** | `9c56fe6`（docs(plan)） | todo.md §M23.1 验收清单全部 [x] + backlog.md §E2E 段部分关闭 + 候选 1/2/4 标注"待 CI 复现确认" |

#### M23.2 M22.8 根因排查（🛡️ 治理 / 治本）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **抽取 unauthenticatedApiContext helper** | `09c3dee`（test(e2e)） | `apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts` 新增（封装 `browser.newContext({ storageState: { cookies: [], origins: [] } })` 标准模式 + JSDoc 记录根因与修复路径）+ 2 处调用方统一重构 |
| **经验归档 §五十四 fixture pool 教训** | `e0f9b29`（docs(design)） | experience-archive.md §五十四 Playwright 1.62 fixture pool 跨 scope 隐式行为源码实证完整案例（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯）+ M23.2 helper 抽取教训（4 项教训 + 3 项 governance check point） |
| **M23.2 验收闭环** | `68b973d` + `aa76ad4`（docs(plan)） | todo.md §M23.2 验收清单全部 [x] + backlog.md §Playwright 段部分关闭 + 验收第 3 项 commit hash 关联 |

#### M23.3 C66 告警视图增强（🚀 能力扩展 / UX）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C66-A2 NormalizedSecurityAlert 接口 + fetcher 透传** | `b6e7716`（feat(core,engine)） | packages/core/src/alerts/index.ts NormalizedSecurityAlert 接口扩展 `ghsaId?` + `cveIds?[]` + packages/engine/src/github/dependabot-fetcher.ts extractCveIds helper + packages/engine/src/alerts/pnpm-audit-fetcher.ts extractIdentifiers helper + 4 处测试断言新增 |
| **C66-A1 ScanResult ghsaId/cveIds 列 + 类级复合索引** | `f44a527`（feat(platform)） | apps/platform/server/entities/scan-result.ts 新增 2 列（ghsaId varchar(32) + cveIds text 存 JSON 序列化字符串）+ 类级复合索引 `@Index('idx_scan_result_repo_ghsa', ['repositoryId', 'ghsaId'])`（§3b 教训）+ migration 1750000000000 + reconcile INSERT/UPDATE 透传 |
| **C66-C alerts 视图独立 Identifiers 列** | `650a0d2`（feat(platform)） | apps/platform/app/pages/alerts.vue AlertView 接口扩展 ghsaId? + cveIds?[] + 新增独立 Identifiers 列在 ruleId 列前（GHSA 优先 → fallback CVE[0] → 多 CVE 折叠 +N → code-scanning/code-quality 兜底 —）+ 5 个 vitest describe 用例（默认响应含字段 / dependabot 透传 / pnpm-audit 透传 / code-scanning 兜底 / 多 CVE 数组）+ /api/alerts 透传 ghsaId + cveIds（DB JSON 字符串反序列化为数组）+ i18n zh-CN + en-US 加 colIdentifiers 键 |
| **C66-D reuseScanRunId + 立即修复入口** | M16.2 闭环（不计入本批） | reuseScanRunId API + scan.post.test.ts 6 测试用例 + useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts 完整链路 |
| **C66-C 经验归档 §五十五 + 验收闭环** | `9c64ee0`（docs(plan+design)） | experience-archive.md §五十五 M23.3 C66-C 完整案例（实施 + 关键设计 + 验证矩阵 + standard depth 审计 4 warning + 3 suggest + 5 项教训 + 3 项 governance check point）+ todo.md §M23.3 验收清单全部 [x] + W3/W4 stale 修正（C66-D 不计入本批 + i18n 9 语言改双语言现状） |
| **C66-C commit hash 回填** | `6e53616`（docs(plan)） | todo.md §M23.3 C66-C commit `?` → `650a0d2` + `9c64ee0` 关联回填 |

#### M23.4 测试补强（🧪 测试补强 / 治理收口）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **cron-preview.test.ts wall-clock 依赖消除** | `df4ba9b`（test(platform)） | `vi.setSystemTime` 写固定-now 用例断言 diffHours === 8（UTC 周六 14:00 now）+ 对照用例固定到 UTC 周日 18:00（Shanghai 周一 02:00 CST）断言 diffHours === 160（cron-parser 实测返回可能值 8 或 160）+ 改 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)` 强制两个分支都被覆盖 |

### 阶段治理记录

- **提交序列**：M23.0 治理批次（`f8a8640` → `35b9714` → `606df17` → `c265205`）→ M23.1 M22.7 根因排查（`2ffaa45` → `74d3dd8` → `9c56fe6`）→ M23.2 M22.8 根因排查（`09c3dee` → `e0f9b29` → `68b973d` + `aa76ad4`）→ M23.3 C66 告警视图增强（`b6e7716` + `f44a527` + `650a0d2` → `9c64ee0` → `6e53616`）→ M23.4 测试补强（`df4ba9b`）共 **17 commits 全部 ahead=0 已推送至 origin/master**
- **审计覆盖**：5 轮独立 Review Gate（M23.3 C66-C standard depth + M23.0 G1 + M23.1 + M23.2 + M23.4 quick depth），全部 Pass；含 C66-C standard depth W1 typecheck 验证矩阵不完整（git stash 实证非本批引入）+ W2 浏览器验证 sandbox chromium 限制（M22.7 同源）+ W3 todo.md stale 已本批同步修正 + W4 i18n 9 语言声明错引已本批同步改为双语言现状
- **关联升级**：M22.0 G1 neat-freak 收敛后 security.md §2.1 为 SQLite 防护规则权威完整声明；M22.1 治本 WAL 模式切到 §3b 类级复合索引支撑 dashboard 按 GHSA 维度查询；M22.8 hotfix 测试层 `storageState: { cookies: [], origins: [] }` 显式隔离保留兜底；M23.3 C66-C standard depth audit W1 monorepo source/dist 不一致教训合并到 wisdom.md 现有 `principle-Nitro-esbuild-process-env-NODE_ENV-静态替换-陷阱` 段（避免重复 pattern）+ 落地 AGENTS.md 提交规范第 6 条「build-before-commit」纪律
- **历史教训**：W1 audit typecheck 验证矩阵不完整——`pnpm exec tsc --noEmit` 通过 ≠ `pnpm run typecheck`（含 nuxt typecheck pipeline）通过；monorepo source-only 改动必须 `pnpm -r build` 重建 dist；W3 todo.md 验收清单 stale——D 阶段开工前 rg 实证依赖项实际状态（git 历史 + i18n locale 目录）避免基于 stale 描述定范围；W4 i18n locale 声明与现状不符——`ls apps/platform/i18n/locales/` 实证实际 locale 数量
- **阶段归档批次衍生治理**（本归档批次落地 3 项 governance check point）：
  1. **AGENTS.md 提交规范新增第 6 条「src/dist 不一致时 build 在先（monorepo 纪律）」**——commit 前实测 `pnpm run typecheck` exit 0；失败则第一动作是 `pnpm -r build` 而非修改源码
  2. **code-auditor.agent.md 主责边界新增「i18n locale 实际状态审计必查项」**——diff 涉及 todo.md / backlog.md / 设计文档声称"X 语言覆盖"时 audit 必须 `ls apps/platform/i18n/locales/` 实证实际 locale 数量
  3. **wisdom.md header 文本 stale 修正 + monorepo rebuild 教训合并到现有 `principle-Nitro-esbuild` 段**——避免与构建产物 / source vs dist 不一致教训重复登记

