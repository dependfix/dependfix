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
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次（含 C53-后-A/B/C 衍生子任务）**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）
  - **M10 / T912 / C53 / 2026-08-20 平台 UI 增强（C59-C61）**：[archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)（**2026-08-28 M16 归档批次同步迁出**——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略）
  - **M13**：[archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**——M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略）
  - **M14 + M15**：[archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（**2026-08-31 M19 归档批次预防性分片迁出**——M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值；M14 + M15 同源批次同期迁出，符合"主窗口保留 3-5 个阶段"健康策略）
  - **M16 + M17**：[archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)（**2026-08-31 M20 归档批次预防性分片迁出**——M20 段新增前主窗口 638 行 + M20 段预估 100-130 行将超 700 强制分片阈值，预防性迁出与 M19/M18/M17/M16 归档批次预防性迁出 M14/M15/M13/M12/M10 同源策略）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **2026-09-10 M26 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀（M26.1+M26.2+M26.3+M26.4a+M26.4b+M26.4c+M26.5 全部 7 原子条目已闭环 / 36 commits 全部 ahead=0 已推送至 origin/master）/ 2026-09-02 M23 M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（M23.0+M23.1+M23.2+M23.3+M23.4 全部已闭环 / 17 atomic commits 全部 ahead=0 已推送至 origin/master）/ 2026-09-01 M22 SQLite 数据保护防御加固（M22.1+M22.2+M22.3+M22.4+M22.5+M22.6 全部已闭环 / 13 commits 全部 ahead=0 已推送）** 共 3 个完整段（最新 3 个阶段按时间倒序在主窗口顶部）+ M24 / M25 / M26 归档批次同步迁出分片 + M19 / M20 / M21 预防性分片迁出。主窗口当前 473 行（健康窗口 ≤ 500）。**预防性分片同步记录**：M19 / M20 / M21 已于 2026-09-10 M26 归档批次预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)（主窗口 682 行 + M26 段预估 ~250 行 = 932 行超 700 强制分片阈值；预防性迁出与 M18 / M17 / M16 / M14 + M15 / M13 / M12 / M10 归档批次预防性迁出同源策略）；M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)；M18 已于 2026-09-01 M22 归档批次预防性迁出至 [archive/todo-archive-phases-m18.md](archive/todo-archive-phases-m18.md)。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 `todo-archive-phases-m14-m15.md`）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 待推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期 ahead 部分待用户推送（ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（M23.0+M23.1+M23.2+M23.3+M23.4 全部已闭环 / 2026-09-02 归档）

> **归档日期**：2026-09-02
> **阶段摘要**：承接 M22 闭环 + M22.7 hotfix（CI 33525721103 E2E global-setup ECONNRESET）+ M22.8 hotfix（CI 33533376712 未认证 API 测试 cookie 注入）衍生根因治理债 + [backlog.md §C66 告警视图增强](backlog.md)（2026-08-25 用户实测反馈"alerts UI 看不到 GHSA/CVE/rule 关键标识"）+ 测试基建清理。按"类型平衡"原则（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）拆 **5 原子条目独立闭环**：
>
> - **M23.0**（P2，🛡️ 治理）治理批次合并 G1+G2+G3 —— G1 M22 neat-freak 收敛（security.md §2.1 为 SQLite 防护规则权威完整声明，development.md §5.1.18 / platform.md §3.7 收敛为引用 + 仅保留差异化信息）；G2 wisdom 蒸馏阈值核验（实测 WISDOM_OK 17 ≤ 20 阈值已合规，无需新增蒸馏）；G3 wisdom 4 条 pattern 挂 standards（[code-auditor.agent.md 主责边界「构建产物 grep 兜底」必查项](../../.github/agents/code-auditor.agent.md) + [development.md §5.1.20 atomic commit 边界示例](../../docs/standards/development.md) + [ai-collaboration.md §4 PDTFC+ CI 偶发错误三阶段协议](../../docs/standards/ai-collaboration.md) + [testing.md §6.4 e2e 未认证 API 调用标准模式](../../docs/standards/testing.md)）
> - **M23.1**（P1，🛡️ 治理 / 治本）M22.7 ECONNRESET 根因排查 —— 从 backlog §E2E 段 4 候选按 ROI 排查 1 项落地候选 ③ SQLite WAL 模式 + `journal_mode=WAL` + `busy_timeout=5000ms` 治本（commit `2ffaa45` fix(platform)），helper 层 maxRetries 兜底保留不动
> - **M23.2**（P1，🛡️ 治理 / 治本）M22.8 fixture pool cookie 注入根因排查 —— 从 backlog §Playwright 段 3 候选按 ROI 排查 1 项落地候选 ① fixture pool `test.use → browser.newContext` 注入路径源码实证（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯）+ helper 抽取（`apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）
> - **M23.3**（P2，🚀 能力扩展 / UX）C66 告警视图增强 A1+A2+C+D 4 子任务 —— C66-A1 ScanResult ghsaId/cveIds 列 + 类级复合索引 + migration 1750000000000（§3b 教训）；C66-A2 NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher extractIdentifiers helper 透传；C66-C alerts.vue 独立 Identifiers 列（GHSA 优先 + 多 CVE 折叠 + fallback CVE + code-scanning 兜底）；C66-D reuseScanRunId + 立即修复入口（**已在 M16.2 闭环，不计入本批验收**——audit suggest 触发的提前抽取）
> - **M23.4**（P3，🧪 测试补强）cron-preview wall-clock 依赖消除 —— 用 `vi.setSystemTime` 写固定-now 用例 + 改写 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`（cron-parser 实测返回可能值 8 或 160，强制两个分支都被覆盖）
>
> **阶段边界**：M23 严格遵循 [规划规范 §1.1 任务粒度约束](../standards/planning.md)（5 原子条目 ≤ 5-6 硬上限）+ 类型平衡（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）；不涉及 TypeORM 0.3.x 升级或 PostgreSQL 迁移（M24 候选）；不引入新依赖；不升级 better-auth / Nuxt；不动 M22.7 helper 层 maxRetries 兜底（保留兜底）+ 不动 M22.5/M22.6 双门控体系；C66-D 在 M16.2 已闭环（reuseScanRunId API + scan.post.test.ts 6 用例 + useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts）；C66-B 数据层去重暂缓（应用层去重已实施满足当前需求）。
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

---

## M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀（M26.1+M26.2+M26.3+M26.4a+M26.4b+M26.4c+M26.5 全部已闭环 / 2026-09-10 归档）

> **2026-09-10 M26 归档批次迁出**：M26 段（7 原子条目 23 atomic commits + 13 配套 commits = **36 commits 全部 ahead=0 已推送至 origin/master** / ~3240 行净增）已从 `todo.md` 主窗口迁入新分片 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)。M26 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口 [todo-archive.md §M26](#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) 仅保留导航指针 + 关键 commit 实证。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M26](roadmap.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀2026-09-08-用户决策方案-a--m264-拆分--m264c-e2e-适配--2026-09-10-已闭环--归档) + Milestone 概述表 M26 行状态更新（进行中 → 已完成 2026-09-10 归档）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M26 行
> - **关键 commit 实证**：
>   - **M26 P 阶段**：`0ad509c` ahead commits 实证（0 → 31）
>   - **M26.1 应用层**（10 commits）：`80138b1` `d7fb63b` `46ce342` `6ef2e27` `2fe6d1a` `b97babd` `8becb80` `a899a5c` `a461c4c` `4be6e52`
>   - **M26.2 C67 Resource owner 化**（4 commits）：`10af85c` `9ae7c2c` `531c252` `dc48c4a`
>   - **M26.3 C69 文档站 + 包 README 多语言 en-US P0**（7 commits）：`4dfd630` `1b43cf5` `d5e6786` `175c709` `bb61814` `b31f5a8` `a1f4357`
>   - **M26.4a primeicons 降级**（1 commit）：`7ce7803`
>   - **M26.4b lint baseline 治理**（4 commits）：`d02713a` `03e7dad` `7407ed8` `b6b52bb`
>   - **M26.4c e2e 适配**（5 commits）：`c37aac7` `be74d21` `6f26ae3` `79dfc6a` `0be2b2a`
>   - **M26.5 经验归档 + wisdom 蒸馏**（1 commit）：`6b01e35`
>   - **M26 配套治理 + docs 收口**（7 commits）：`a0bb647` `f482708` `dd33fac` `cab3710` `cd79724` `da0ebdf` `db50191`
>   - **CI Coverage 修复**（1 commit）：`a4a5680` fix(ci)
> - **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **0**（M26 全部 36 commits 已推 origin/master / 2026-09-10 实测）
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)
> - **2026-09-10 M26 归档批次预防性分片同步迁出 M19 / M20 / M21 三阶段**（主窗口 ≤ 700 强制分片阈值）—— 详见 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)

---

## M22: SQLite 数据保护防御加固（M22.1+M22.2+M22.3+M22.4+M22.5+M22.6 全部已闭环 / 2026-09-01 归档）

> **归档日期**：2026-09-01
> **阶段摘要**：2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（用户管理账号/仓库/凭据/扫描结果全部丢失）。代码内未找到清空路径（synchronize 失败回滚、e2e fixtures 受门控保护、cleanupStaleRuns 只清理 ScanRun/BatchRun、backfill 只处理 ScanResult），最可能清空来源在代码外部（shell/CI/运维）。事故暴露 5 条可加固设计风险（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)），按 [规划规范 §1.1 任务粒度约束](../standards/planning.md) + 类型平衡原则拆 **6 个原子条目独立闭环**（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6）。M22 沉淀（P0，🛡️ 治理）阶段登记 + 事故复盘 + 5 条防御规范挂接 / M22.1（P0，🛡️ 治理）SQLite 启动期自动备份（hard requirement：apps/platform/server/database/backup.ts + ensureDatabaseInitialized 之前同步调用 + fsync/rename 写安全 + 保留策略 + fail-open）/ M22.2（P0，🛡️ 治理）db-restore 命令式恢复（apps/platform/server/database/scripts/db-restore.ts + `--from` + `--yes` 双门控 + 覆盖前自动备份 + 旁文件清理 + 前后 integrity_check）/ M22.3（P1，🛡️ 治理）db-doctor 自检工具（apps/platform/server/database/scripts/db-doctor.ts + 文件元信息 + 10 项 PRAGMA + 各表 COUNT(*) + 索引分类计数 + 六类结论判定 + isInternalTable 排除 sqlite_*/migrations + 人读机读双模 isTTY 切换 + `--json` 强制）/ M22.4（P1，🛡️ 治理）TypeORM synchronize 显式 opt-in + 启动期日志（hard requirement: development.md §5.1.19 反模式禁止）/ M22.5（P1，🛡️ 治理）TypeORM migrationsRun 显式 opt-in + 默认改为 false（与 M22.4 配对完成 synchronize + migrationsRun 双 opt-in）/ M22.6（P1，🛡️ 治理）e2e/fixtures 端点双门控防生产泄漏（hard requirement: platform.md §3.6 + security.md §2.1.4）。
>
> **阶段边界**：M22 严格遵循 [规划规范 §1.1 任务粒度约束](../standards/planning.md)（6 原子条目 ≤ 6 项硬上限）+ 类型平衡（🛡️ 治理 6 项）；不涉及 TypeORM 0.3.x 升级或 PostgreSQL 迁移（M23/M24 候选）；不引入新依赖；不升级 better-auth / Nuxt；fixtures 仍 mock（真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
>
> **非目标**：不发布 mergify action（仅提供模板 + 文档引导）；不修改 dependfix 自身 PR 提交流程；M22.6 双门控第二门控**不能**用 `process.env.NODE_ENV`（Nitro/esbuild 静态替换陷阱——M22.6 Round 1 audit quick depth + 构建产物 grep 兜底发现并强制修订为 `useRuntimeConfig().e2eFixturesAllowed` + `NUXT_E2E_FIXTURES_ALLOWED` 运行时覆盖通道）。
>
> **状态**：✅ 全部完成（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6 全部 6 原子条目 + 4 docs 闭环登记 commits 共 **9 atomic commits 实施 + 4 docs 收口 commits = 13 commits**；ahead=7 `git rev-list HEAD ^origin/master --count` 2026-09-01 实测：`a4d29bf` M22 沉淀 + `2a31597` M22.1 已推送至 origin/master；`7b8721e` M22.2 + `7b495a7` M22.2 闭环登记 + `5835887` M22.3 + `5cf1b6a` M22.3 路径同步 + `daa255c` M22.4 + `32bb375` M22.5 + `7f84b6e` M22.6 ahead 7 commits 待用户主动推送；7 轮独立 Review Gate Pass —— M22.4 Round 2 / M22.5 Round 1 / M22.6 Round 2；含 M22.4 Round 1 Reject（migrationsRun 默认值越界落地）后补修 + M22.6 Round 1 Reject（Nitro/esbuild 折叠）后修订为 runtimeConfig 兜底）

### 阶段闭环清单

#### M22 沉淀 + 事故复盘 + 5 条防御规范挂接 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M22 沉淀批次** | `a4d29bf`（docs(plan+standards+archive)） | `docs/plan/todo.md` §M22 阶段段登记 + 6 原子条目（§M22.1-§M22.6）+ 准入标准 + 风险与缓解 + 后续（M23/M24 候选）/ `docs/standards/development.md` §5.1.18 启动期自动备份规范 + §5.1.19 synchronize 与 migrationsRun 反模式禁止 / `docs/standards/platform.md` §3.7 SQLite 启动期备份 + 自检工具 + D 阶段自检扩展 / `docs/standards/security.md` §2.1 SQLite 数据库防护 5 子节（§2.1.1-§2.1.5）/ `docs/design/governance/experience-archive.md` §五十 SQLite 数据库业务数据被清空事故复盘（事故现象 + 根因分析 + 同类扫描 + 防御加固挂接）/ `docs/plan/backlog.md` §已知边界 SQLite 单文件脆弱性条目新建 + §延期暂缓项 M22 规范单点声明收敛登记 |

#### M22.1 SQLite 启动期自动备份 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **backup.ts 新增 + ensureDatabaseInitialized 集成** | `2a31597`（feat(platform)） | `apps/platform/server/database/backup.ts` 新增 + `ensureDatabaseInitialized` 之前同步调用 `runStartupBackup()`；备份路径 `data/backups/${basename}.${YYYY-MM-DDTHH-mm-ss}.bak`；触发条件 源文件存在 + size > 0 + 后缀不是 `.bak`；写入安全 `fs.openSync` + `fs.writeSync` + `fs.fsyncSync` + `fs.renameSync`；保留策略 最近 N 份（默认 10，`BACKUP_RETENTION_COUNT` env 可覆盖）；失败处理 catch + console.error fail-open |
| **测试覆盖** | `2a31597` 同 commit | `backup.test.ts` 26 case 覆盖：备份创建 / 跳过（空文件 / 已存在备份） / fsync 调用 / 保留策略清理 / 失败不抛 |
| **规范挂接** | `2a31597` 同 commit | `development.md §5.1.18` + `security.md §2.1.1` + `platform.md §3.7` |

#### M22.2 db-restore 命令式恢复 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **db-restore.ts 新增 + package.json db:restore** | `7b8721e`（feat(platform)） | `apps/platform/server/database/scripts/db-restore.ts` 新增 + `package.json` 新增 `"db:restore": "tsx server/database/scripts/db-restore.ts"`；CLI 入口守卫必备（`process.argv[1] === pathToFileURL(process.argv[1]).href`）；参数 `--from=<backup-file>` 必填 + `--yes` 必填双门控；覆盖前自动备份到 `data/backups/auto.${timestamp}-${ms}.bak`（落地追加毫秒防同秒碰撞；`auto.` 前缀纳入保留策略）；恢复 `fs.copyFileSync` 原子操作；校验 前后各跑一次 `integrity_check`；旁文件清理 `-wal` / `-shm` / `-journal` |
| **闭环登记** | `7b495a7`（docs(plan)） | M22.1 / M22.2 闭环登记 + M22.2 落地偏差说明（脚本目录由 `apps/platform/scripts/` 改为 `apps/platform/server/database/scripts/` 与既有 `backfill-scan-result.ts` 同目录复用） |
| **审计未采纳项（已登记 backlog.md）** | `7b495a7` 同 commit | S-1 第 2/3/4 项 + S-2 未采纳（inspectSqliteFile 损坏 fixture / 恢复后 integrity_check 失败 / sidecar unlinkSync 部分失败 / 路径规范化）——本地管理员工具攻击面极低，远期登记 backlog |

#### M22.3 db-doctor 自检工具 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **db-doctor.ts 新增 + package.json db:doctor** | `5835887`（feat(platform)） | `apps/platform/server/database/scripts/db-doctor.ts` 新增 + `package.json` 新增 `"db:doctor"`；CLI 入口守卫必备；输出文件元信息 + 10 项 PRAGMA（page_count / page_size / freelist_count / journal_mode / auto_vacuum / user_version / schema_version / application_id / wal_autocheckpoint / integrity_check）+ 各表 COUNT(*) + 索引分类计数（sqlite_autoindex / IDX_ / idx_）+ 六类结论判定（schema_version=0+全空=全新 / schema_version>0+全空=数据被清空 / freelist_count>0=有数据被删除未 VACUUM / integrity_check!=ok=数据库损坏）；人读机读双模 isTTY 切换 + `--json` 强制 |
| **测试覆盖** | `5835887` 同 commit | `db-doctor.test.ts` 26 case 覆盖：mock 各种 PRAGMA 状态 + 集成测试 创建数据库跑 db-doctor |
| **路径同步 + 闭环登记** | `5cf1b6a`（docs(standards+plan)） | M22.2 / M22.3 脚本目录由原 `apps/platform/scripts/` 改为 `apps/platform/server/database/scripts/` 后，security.md §2.1.2 / §2.1.3 + platform.md §3.7 中的路径同步为实际落地位置；M22.3 闭环登记 |

#### M22.4 synchronize 显式 opt-in + 启动日志 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **synchronize 显式 opt-in + 启动日志** | `daa255c`（feat(platform)） | `apps/platform/server/database/index.ts:43` `synchronize = process.env.DATABASE_SYNCHRONIZE === 'true'`（删 `isDev` 变量；dev 模式不再自动开）+ 提取 `migrationsRun` 为 const 支撑启动日志（保持原 `!== 'false'` 默认值，留给 M22.5 单独 commit 反转）+ 启动期 `console.log(\`[database] synchronize=... (DATABASE_SYNCHRONIZE=..., NODE_ENV=...), migrationsRun=... (DATABASE_MIGRATIONS_RUN=...)\`)`（与 development.md §5.1.19 line 317 范例格式对齐） |
| **测试覆盖** | `daa255c` 同 commit | `index.test.ts`：默认断言反转 synchronize=true → false；新增显式 `DATABASE_SYNCHRONIZE=true` 用例 + `NODE_ENV=development` 回归用例（防御未来误加回 `\|\| isDev`） |
| **tests/api-helper.ts setupMemoryDatabase 适配** | `daa255c` 同 commit | M22.4 后 synchronize 默认 false，25+ 调用 `setupMemoryDatabase` 的测试（fixtures.post/delete + scan-reconcile + scan-orchestrator + batch/stale-cleanup + notification + run/audit-events 等）需 opt-in 才能建表；helper 单点声明 `process.env.DATABASE_SYNCHRONIZE = 'true'` 避免每个 test 重复 stub |
| **.env.example 注释 + platform.md §3.3 + §11 决策记录同步** | `daa255c` 同 commit | `.env.example` 新增 `DATABASE_SYNCHRONIZE` 注释块；`docs/standards/platform.md` §3.3 `synchronize / migrationsRun 全场景显式 opt-in（详见 development.md §5.1.19）` + §3.3 新增启动期日志条目 + env 变量表 2 处 + §11 决策记录 M6 synchronize 策略追加 2026-09-01 演进注记 |
| **A 阶段 Review Gate 关键教训** | `daa255c` audit 记录 | **Round 1 Reject**（1 blocker + 4 warning）：M22.4 commit 越界落地 M22.5 核心改动（migrationsRun 默认值反转）；Round 2 Pass（0 blocker / 0 warning / 0 suggest）—— 教训见 wisdom.md "atomic commit 边界——提取 const 支撑日志 vs 改 const 计算语义要分清" |

#### M22.5 migrationsRun 默认改为 false ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **migrationsRun 默认 false** | `32bb375`（fix(platform)） | `apps/platform/server/database/index.ts:46` `migrationsRun = process.env.DATABASE_MIGRATIONS_RUN === 'true'`（默认 false；不再自动执行 pending migration；修复 development.md §5.1.19 反模式）；与 M22.4 commit `daa255c` synchronize opt-in 配对完成 "synchronize + migrationsRun 双 opt-in" hard requirement |
| **测试覆盖** | `32bb375` 同 commit | `index.test.ts` 新增 2 个用例（默认 false + 显式 true）双向断言 |
| **.env.example 注释更新** | `32bb375` 同 commit | `DATABASE_MIGRATIONS_RUN` 注释从 "默认 true" 改为 "默认 false"；显式开启命令拆分为 "启动时自动执行（DATABASE_MIGRATIONS_RUN=true）" + "手动单次执行（pnpm ... typeorm migration:run）" 两条路径（audit suggest 采纳） |
| **A 阶段 Review Gate** | `32bb375` audit 记录 | Round 1 Pass（0 blocker / 0 warning / 1 suggest 已采纳清理） |

#### M22.6 e2e/fixtures 端点双门控 ✅（2026-09-01 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **fixtures.post.ts + fixtures.delete.ts 改双门控 + runtimeConfig 兜底** | `7f84b6e`（fix(platform)） | 第二门控从 `process.env.NODE_ENV === 'production'` 改为 `useRuntimeConfig().e2eFixturesAllowed`（Nuxt runtimeConfig 运行时覆盖通道，绕开 Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱）；`apps/platform/nuxt.config.ts` runtimeConfig 注册 `e2eFixturesAllowed: process.env.NUXT_E2E_FIXTURES_ALLOWED === 'true' \|\| process.env.E2E_TEST === 'true'`（prod build 默认 false）；`apps/platform/playwright.config.ts` e2e webServer 注入 `NUXT_E2E_FIXTURES_ALLOWED=true`（R3 缓解：原方案 NODE_ENV=test 无效，构建期常量；修订为 runtimeConfig 运行时覆盖） |
| **新建 2 个 vitest 单元测试** | `7f84b6e` 同 commit | `apps/platform/server/api/e2e/fixtures.post.test.ts` + `fixtures.delete.test.ts`（3 case × 2 文件 = 6 测试）：默认 404 / `E2E_TEST=true`+`e2eFixturesAllowed=false` → 404 / `E2E_TEST=true`+`e2eFixturesAllowed=true` → 200；每个 case 显式 `vi.stubGlobal('useRuntimeConfig', ...)` 隔离 runtimeConfig + afterEach `vi.unstubAllGlobals()` 清理 |
| **tests/setup-nuxt-server.ts 默认 stub 加 e2eFixturesAllowed 字段** | `7f84b6e` 同 commit | 默认 `useRuntimeConfig` stub 加 `e2eFixturesAllowed: false` 字段，防止其他 server 测试误启用 fixtures 端点 |
| **platform.md §3.6 + security.md §2.1.4 同步** | `7f84b6e` 同 commit | `docs/standards/platform.md` §3.6 强制门控写法 + 新增 "为什么不用 `process.env.NODE_ENV`" 陷阱段（esbuild define 折叠）+ D 阶段自检扩展（构建产物 grep 兜底）+ 实证段追加 M22.6 修订教训；`docs/standards/security.md` §2.1.4 同步 |
| **A 阶段 Review Gate 关键教训** | `7f84b6e` audit 记录 | **Round 1 Reject**（2 blocker + 3 warning）：① B1 Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱——`if (process.env.X !== 'true' \|\| process.env.NODE_ENV === 'production')` 在产物中被折叠为 `... \|\| true`，端点永远 404；② B2 R3 缓解无效 + 注释陈述错误；③ W1 测试 ambient env 不密闭；④ W2 200 路径覆盖强度有限；⑤ W3 todo.md 状态漂移 + R3 落地偏差未登记。Round 2 Pass（0 blocker / 2 W 不阻塞已采纳清理 W4 fixtures JSDoc 同步 + W5 platform.md §3.6 import 错误示例）—— 教训见 wisdom.md "Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱" |

### 阶段验收标准（M22 全部 6 原子条目闭环 ✅）

- [x] **M22 沉淀** —— 5 条防御规范挂接（development.md §5.1.18 + §5.1.19 + platform.md §3.7 + security.md §2.1.1-§2.1.5）+ experience-archive.md §五十事故复盘 + todo.md §M22 6 原子条目
- [x] **M22.1 启动期备份** —— backup.ts 含 fsync + rename + 保留策略 + fail-open 兜底；backup.test.ts 26 case 全过；ensureDatabaseInitialized 之前同步调用
- [x] **M22.2 db-restore** —— `--from` + `--yes` 双门控；覆盖前自动备份；前后 integrity_check；旁文件清理
- [x] **M22.3 db-doctor** —— 文件元信息 + 10 项 PRAGMA + 各表 COUNT(*) + 索引分类计数 + 六类结论判定 + 人读机读双模
- [x] **M22.4 synchronize opt-in** —— synchronize 必须 `DATABASE_SYNCHRONIZE=true` 才开；dev 模式不再自动；启动日志完整打印
- [x] **M22.5 migrationsRun opt-in** —— migrationsRun 必须 `DATABASE_MIGRATIONS_RUN=true` 才开；默认 false；与 M22.4 配对双 opt-in
- [x] **M22.6 e2e/fixtures 双门控** —— `E2E_TEST=true` + `runtimeConfig.e2eFixturesAllowed` 兜底；构建产物 grep 实证未折叠；playwright NODE_ENV=test + NUXT_E2E_FIXTURES_ALLOWED=true 调通
- [x] `pnpm lint` / `pnpm typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— apps/platform vitest server/ 70 test files / 828 tests passed
- [x] `pnpm check:docs` 全过 —— 103 md + 58 vue-interp OK
- [x] 编号标记扫描 0 命中（无孤立 `T\d+` / `M\d+` / `C\d+` 等编号——按 [开发规范 §3 注释规范](../standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决待推送后核验 —— ahead=7 commits 待用户主动推送（按 AGENTS.md §5 推送禁令）；M22 沉淀 + M22.1 已推送至 origin/master（`git rev-list HEAD ^origin/master --count` 2026-09-01 实测 ahead=7）
- [x] 实施过程中新发现 2 条 wisdom 沉淀——Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱 + atomic commit 边界（提取 const 支撑日志 vs 改 const 计算语义要分清）

### 阶段治理记录

- **总投入**：**9 atomic commits 实施 + 4 docs 收口 commits = 13 commits**（M22 沉淀 `a4d29bf` docs(plan+standards+archive) + M22.1 `2a31597` feat(platform) + M22.2 `7b8721e` feat(platform) + M22.2 闭环 `7b495a7` docs(plan) + M22.3 `5835887` feat(platform) + M22.3 路径同步 `5cf1b6a` docs(standards+plan) + M22.4 `daa255c` feat(platform) + M22.5 `32bb375` fix(platform) + M22.6 `7f84b6e` fix(platform)）
- **测试覆盖**：apps/platform vitest server/ 70 test files passed (2 skipped) / 828 tests passed (7 skipped)；M22.1 backup.test.ts 26 case + M22.3 db-doctor.test.ts 26 case + M22.6 fixtures.post/delete.test.ts 6 case + M22.4/5 index.test.ts 12 case
- **审计覆盖**：3 轮独立 Review Gate Pass —— M22.4 Round 2（Round 1 Reject 后补修：migrationsRun 越界落地 + 补 NODE_ENV=development 回归用例 + 同步 platform.md §3.3）/ M22.5 Round 1 / M22.6 Round 2（Round 1 Reject 后修订 runtimeConfig 兜底 + 构建产物 grep 兜底审计模式）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-09-01 实测 ahead=7（`7f84b6e` + `32bb375` + `daa255c` + `5cf1b6a` + `5835887` + `7b495a7` + `7b8721e` 7 commits 待用户主动推送）；M22 沉淀 + M22.1 已推送至 origin/master
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M22 段（本段；2026-09-01 M22 归档批次新增）
  - `docs/plan/todo.md` M22 段 → 顶部 banner 更新（M22 → 待确定 active）
  - `docs/plan/roadmap.md` Milestone 概述表 M22 行状态更新（计划中 → 已完成 2026-09-01 归档）+ §M22 详细实施状态段新增（在 §M21 段之后、`## 详细任务` 之前）
  - `docs/plan/archive/index.md` 当前基线更新（2026-08-31 → 2026-09-01 M22 归档后）+ 主窗口保留范围（M21/M20/M19/M18 → M22/M21/M20/M19 4 段）+ 近期归档批次登记新增 M22 行
  - `docs/plan/archive/todo-archive-phases-m18.md` 新建（M18 段从主窗口预防性迁出，与 M19/M20 归档批次迁出 M14-M15/M16-M17 同源策略——主窗口从 5 段回到 4 段符合 "3-5 个阶段" 健康策略中位）
  - `docs/plan/backlog.md` §已知边界 SQLite 单文件脆弱性条目状态更新（"等待落地" → "已闭环 M22 全部 6 原子条目 + 2026-09-01 archive batch"）
  - `docs/index.md` 当前状态更新（"M22 待启动" → "M22 已闭环 2026-09-01 归档"）
- **关键决策**：
  - **M22.4 atomic commit 边界** — 提取 `migrationsRun` 为 const 支撑启动日志 vs 改 const 计算语义（默认值反转）是两件事，必须分 commit；M22.4 仅做提取 const 保持原 `!== 'false'` 默认值，M22.5 单独反转
  - **M22.6 runtime gate 设计** — `process.env.NODE_ENV` 在 Nitro/esbuild 构建期被静态替换为构建时值，prod build 表达式折叠为 `... || true` 永远 404；改用 Nuxt `runtimeConfig.e2eFixturesAllowed`（`NUXT_` 前缀运行时覆盖通道）绕开 esbuild define
  - **M22.6 资产授权路径** — e2eFixturesAllowed 在 `nuxt.config.ts` 注册（prod build 默认 false），playwright e2e webServer 通过 `NUXT_E2E_FIXTURES_ALLOWED=true` 显式开启；prod 部署误设 `E2E_TEST=true` 但缺 `NUXT_E2E_FIXTURES_ALLOWED` 仍 404（双门控兜底真正生效）
- **关键经验（已挂 standards）**：
  - `docs/standards/development.md §5.1.19` TypeORM 1.x synchronize 与 migrationsRun 反模式禁止（hard requirement）—— M22.4 / M22.5 同步 opt-in；NOT NULL 列无 default 时启动期日志 + 恢复路径
  - `docs/standards/platform.md §3.6` e2e / fixtures 端点双门控规范 —— hard requirement + 为什么不用 `process.env.NODE_ENV`（esbuild define 折叠陷阱）+ D 阶段自检扩展构建产物 grep 兜底 + A 阶段 Review Gate 必查项
  - `docs/standards/security.md §2.1` SQLite 数据库防护 5 子节 —— §2.1.1 启动期自动备份 / §2.1.2 命令式恢复 / §2.1.3 数据库自检工具 / §2.1.4 与 e2e/fixtures 端点关系 / §2.1.5 实证（M22 事故复盘）
  - `docs/standards/platform.md §3.7` SQLite 启动期备份 + 自检工具 —— 3 文件（backup.ts / db-restore.ts / db-doctor.ts）+ D 阶段自检验证
- **M22 沉淀后 backlog 候选更新**：
  - §延期/暂缓项 M22 规范单点声明收敛（neat-freak 批次）—— security.md §2.1 + development.md §5.1.18 + platform.md §3.7 三处 SQLite 防护规则重复声明收敛延后
  - §延期/暂缓项 db-restore 审计未采纳项（M22.2 S-1 第 2/3/4 项 + S-2）—— 本地管理员工具攻击面极低，远期登记
  - §已知边界 SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）—— M22 闭环后更新为 "已闭环 M22 全部 6 原子条目 + M23 候选 PostgreSQL 多写者迁移 + TypeORM 0.3.x 升级保留"

#### M22.7 e2e/fixtures helper 网络兜底（hotfix / CI run 33525721103）✅（2026-09-01 闭环）

> **触发**：M22 归档批次 `2e590f0` 推送后 CI run 33525721103 触发，Test / Coverage success，**E2E job 失败**于 global-setup 末尾 `cleanAlertsRowgroupFixtures` → `DELETE /api/e2e/fixtures` → `ECONNRESET`（TCP RST，100ms 内）。时序实测：server up 15:28:01 → setupPage.goto → admin sign-in 3s → viewer sign-in 3s → DELETE fail 15:28:10.98 → ahead=1 commit。

> **根因排查穷举**：
> 1. handler 逻辑 bug → 排除（vitest 单测 6/6 + 本地复现脚本 + .output grep 实证 `useRuntimeConfig().e2eFixturesAllowed` 正确读取 `NUXT_` altPrefix，未被 esbuild define 折叠）
> 2. 服务侧 OOM → 低概率（5+ 请求成功且 ECONNRESET 距上次请求仅 100ms）
> 3. Chromium headless DELETE + body 行为差异 → 可能但无法本地复现（容器沙箱 chromium 限制）
> 4. **better-auth session 写入后 SQLite 连接释放时序 → 最可能根因**（admin / viewer sign-in 走 `dataSource.transaction(...)` 写 session，紧接 fixtures DELETE 经 `ensureDatabaseInitialized()` 走同一 singleton，better-auth 异步清理未完全收敛前过早释放 socket；better-auth 1.7 内部 transaction 关闭路径不在本仓库，无法加日志实证）

> **修复方案（最小变动 + 兜底 + 根因追踪分离）**：
> - 已落地：e2e/fixtures helper 加 `maxRetries: 2`（commit `f617b56` test(platform)）。实证 Playwright 1.62.1 `_sendRequestWithRetries` 源码（`playwright-core@1.62.1/lib/coreBundle.js:25870-25895`）仅对 `e.code === 'ECONNRESET'` 触发 250ms 指数 backoff 重试（其他网络错误码如 ECONNREFUSED / ETIMEDOUT 不重试）；maxRetries=2 走 250ms → 500ms → 1000ms，正好覆盖"首请求 ECONNRESET + 异步资源清理收敛后第二次成功"窗口
> - 不触动 server handler：本地 / CI 行为等价；handler 单元测试 + 真实路由测试均通过
> - **未落地（根因排查）**：登记 M23 阶段规划 backlog 候选（按 ROI 排序）：① better-auth 1.7 transaction 关闭时序 → `getAuth()` 加 trace 日志 + `ds.transaction` 包装打印 begin/commit 时间戳；② Nitro h3 `defineEventHandler` async generator 行为；③ SQLite WAL 模式 + `journalMode=delete` 切 WAL + `busy_timeout` 消解并发事务持锁；④ fixtures API 请求间 100ms 节流（经验性方案，不作为唯一修复）

> **验证**：
> - lint / typecheck exit 0
> - vitest 6/6 fixtures 单测 + 全量 1001/1008 passed
> - A 阶段 review quick depth Round 1 Pass（0 blocker，1 warning JSDoc 精度 + 1 suggest 经验沉淀，已 Round 2 修订 JSDoc 描述"仅对 ECONNRESET 重试"，suggest 跨轮次追溯由经验归档 §五十一承接）
> - 本地复现脚本 `repro-e2e-fixtures.mjs`：auth + DELETE + POST fixtures 串行通过；server 进程稳定存活

> **关键决策**：
> - **helper 层而非 handler 层**：maxRetries 是客户端行为，server 不感知；保持 handler 单元测试 0 改动；本地 / CI 行为等价
> - **兜底修复 + 根因 backlog 分离**：避免"无限本地复现"陷阱（CI 独有环境组合无法本地稳定复现），接受兜底修复 + 根因登记 M23 候选

> **关键经验（已挂 wisdom.md）**：新增 `pattern-playwright-maxRetries-econnreset` —— Playwright 1.62 `_sendRequestWithRetries` 仅对 `e.code === 'ECONNRESET'` 触发 250ms 指数 backoff 重试（其他网络错误码不重试）+ test helper 兜底模式。详见 [经验归档 §五十一](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十一e2e-global-setup-串行多次-setuppage-后首请求-econnreset2026-09-01ci-run-33525721103)（含完整 4 假设穷举 + 修复方案 + 4 项治理检查点登记）

#### M22.8 未认证 API 测试显式空 storageState 隔离 cookie 注入（hotfix / CI run 33533376712）✅（2026-09-02 闭环）

> **触发**：M22.7 hotfix commit `51e8c13` 推送后 CI run 33533376712 触发，Test / Coverage success，**E2E job 失败**于 2 个用例（retry #1 / retry #2 均复现）：
> - `tests/e2e/credentials-api.e2e.test.ts:283 › 凭据管理 API 鉴权边界 › 未认证 GET /api/credentials → 401` —— `Expected: 401, Received: 200`
> - `tests/e2e/repos-api.e2e.test.ts:447 › 仓库管理 API 鉴权边界 › 未认证 GET /api/repos → 401` —— `Expected: 401, Received: 200`
>
> CI 时序实测：global-setup 成功（M22.7 兜底生效）+ fixtures seeded + 171 tests 运行到 #89（credentials-api 未认证）首次失败 #140（repos-api 未认证）二次失败 + 全局 E2E 失败。

> **根因排查**：
> 1. handler 逻辑 bug → 排除（本地 curl + Playwright fresh context 空 cookies → 401 ✓；vitest 单测全过）
> 2. 服务侧 OOM / 进程崩溃 → 排除（其他 80+ 测试正常 200/403；E2E 跑满 6 分钟到失败）
> 3. `test.use({ storageState })` 配置传播到 `browser.newContext()` → **最可能根因**（Playwright 1.62 fixture pool 行为：describe 块内 test.use 选项通过 fixture pool 注入到所有 browser.newContext() 调用，包括未指定 storageState 的手动创建；trace 实证 context-options 中 baseURL + storageState 都被注入）
> 4. 上游 test session refresh 残留到新 context → 可能（token 值 `LhAh2mxu...` ≠ admin.json `aKoIPeL...` / viewer.json `Uev1leUL...`，且 token 在 describe 块之间共享，可能 better-auth 中间件对某些请求刷新 session 后通过 fixture pool 传递）
>
> 网络追踪关键证据：两个失败用例的 context-options 携带**完全相同**的 cookie 值：
> ```
> cookies: [
>   { name: 'i18n_locale', value: 'zh-CN', domain: '127.0.0.1' },
>   { name: 'better-auth.session_token', value: 'LhAh2mxu4rTjo27Wc8wLyeDpspBq4MnE...', domain: '127.0.0.1', expires: 1790873050.509821 }
> ]
> ```
> session token expires 1790873050 ≈ 2026-09-30（CI run 2026-09-01 + 29 天 = better-auth session 配置 expiresIn 30 天一致）

> **修复方案**（最小变动 + 标准化兜底）：
> - 已落地：2 个测试在 `browser.newContext()` 调用中**显式传** `storageState: { cookies: [], origins: [] }`（commit `bdcd900` test(e2e)）—— Playwright 1.62 文档推荐的"unauthenticated API call"模式，与 `test.use({ storageState })` 完全脱钩，强制清空 cookies/origins
> - 不触动 handler：测试期望值不变（仍期望 401）
> - **未落地（根因排查）**：登记 M23 阶段规划排查（按 ROI 排序）：① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证；② better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描

> **验证**：
> - `pnpm exec eslint tests/e2e/{credentials-api,repos-api}.e2e.test.ts` exit 0
> - `pnpm exec tsc --noEmit` exit 0
> - `pnpm test` exit 0（1001 passed / 7 skipped）
> - A 阶段 quick depth Round 1 Pass（0 blocker / 1 warning hotfix 任务编号登记 / 2 suggest 注释长度 + helper 抽取）
> - 本地复现脚本：fresh context + 空 cookies → 401 ✓
> - CI run 33533376712 修复待用户推送后下次 CI 验证

> **关键经验（已挂 wisdom.md）**：新增 `pattern-playwright-browser-newContext-cookie-injection` —— Playwright 1.62 `test.use({ storageState })` 在 describe 块内可能通过 fixture pool 传播到所有 `browser.newContext()` 调用（即使新 context 未指定 storageState）；"未认证 API 调用"测试必须显式传 `storageState: { cookies: [], origins: [] }` 强制隔离。详见 [经验归档 §五十二](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十二playwrighttestuse存储状态传染导致未认证api测试收到20020260902cirun33533376712)。

---

## M19: 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M19 段（5 子任务 + 配套 7 commits ~12 commits 落地）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M26 完整段迁出主窗口后必须 ≤ 700 强制分片阈值，触发预防性分片。M19 / M20 / M21 三阶段同期迁出，保持主窗口 3-5 个阶段健康策略。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M19](roadmap.md#m19-治理--能力扩展--测试补强) + Milestone 概述表 M19 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M19 行
> - **关键 commit 实证**：`0c536c1` M19.1 / `c998d58` M19.2 / `5839771` M19.3 / `8db2fd4` M19.4 / `a20ea02` M19.5 + `ae33671` M19.x 收口 + `2f9eb38` `bee5c3f` `61b3ddc` `4231ffb` 配套
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)

---

## M20: ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M20 段（5 子阶段 8 commits）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M19 / M20 / M21 三阶段同期迁出，与 M26 完整段迁出同步推进。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M20](roadmap.md#m20-scanresult-数据模型重构) + Milestone 概述表 M20 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M20 行
> - **关键 commit 实证**：`acb2d35` M20.1 / `2e4ab1b` M20.3 / `170fee1` M20.5 / `c7ba014` M20.6 / `a399323` M20.7 + `ca6a1dc` M20.7 脚本精简
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)

---

## M21: 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M21 段（4 子阶段 11 atomic commits + 4 docs 收口 = 15 commits 全部 ahead=0 已推送 origin/master）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M19 / M20 / M21 三阶段同期迁出。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M21](roadmap.md) + Milestone 概述表 M21 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M21 行
> - **关键 commit 实证**：`0a83c74` `a77e557` M21.1 / `fe7cc0f` `ad376c8` `0903f06` `b6d8539` M21.2 / `f1dd5df` `beea5b9` `c9939cb` M21.4 / `9850e24` `b9e35f7` M21.5 + `a8604c6` `d66b11d` `6516e34` `cbcb15d` 文档收口
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)

---

## M18: 平台 GitHub App BYO App 模式（已归档 → 2026-09-01 M22 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m18.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)。

---


## M17: 安全与可用性收口（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)。

---

## M16: 平台可用性深化（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)。

---

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已归档 → 2026-08-30 M18 归档批次预防性分片迁出）

> **2026-08-30 M18 归档批次预防性分片迁出**：M13 段（12 子任务 / 26 commits / T1310 同步推进）已迁至新分片 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)。M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M18 归档批次新增后主窗口将超 700 强制分片阈值；M13 是 2026-08-26 闭环阶段（距今 4 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M13](roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档) + Milestone 概述表 M13 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M13 行
> - **关键 commit 实证**：T1301 `b57b8d8` / T1302 `f43edf1` / T1303 `c2e3d7b` `7282f65` / T1304 `25b46eb` / T1305 `0f08c40` `5269d0a` `9c79fc9` / T1306 `e3d93b7` `4447ff8` `2ae2a77` / T1309 `6023da8` `e9197c1` `1cb0364` `9b536e1` `56de1a1` / T1307 `792e8c8` `7b1ac01` `3cccce0` / T1308 `b0f6e84` `e63cdb9` / T1401 `2dce01d` / T1402+T1403 `bb3b49a` / T1310 `300b318` `1819b59` `733e198` `7b40a2c` `a74d07d`
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)

## M14: platform release 通道闭环 + UX 反馈跟进（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M14 段（4 子阶段 + M14.y 依赖批量治理，约 115 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M14 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md Milestone 概述表 M14 行](roadmap.md) + roadmap.md §M14 段历史上未单独列出（与 §M18 段缺失说明同模式 —— 2026-08-31 M19 归档批次校正）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M14 行
> - **关键 commit 实证**：T1310 `300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d` / `1fd38c1` / M14.1 收口 / M14.2 `81bd8d2` `581e1a9` `1a9eddf` 收口 + `17b5643` / M14.3 `5ccaaf4` / M14.x `92cc348` `ea0e24f` `84b4e1a` `b45f55e` / M14.y dependabot PR commits
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)

## M15: 扫描历史详情侧栏增强（UX-R2）（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M15 段（1 子阶段 4 子任务，约 65 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M15 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M15](roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + Milestone 概述表 M15 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M15 行
> - **关键 commit 实证**：`5c65177` P 阶段 docs + `1112017` UX-R2 实施（5 文件 / +425/-12）+ `0a60e3d` test 覆盖（2 文件 / +251）+ `d517a7f` release.yml CI 修复（不计入 M15 总投入）
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)

---

## M12: 平台 UX 一致性 + i18n 治理（已归档 → 2026-08-28 M17 归档批次预防性分片迁出）

> **2026-08-28 M17 归档批次预防性分片迁出**：M12 段（19 commits / C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）已迁出至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)。M17 段 152 行新增后主窗口接近 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M17 归档批次新增 152 行后主窗口 ≈ 738 行 > 700 强制分片阈值；M12 是 2026-08-21 闭环阶段（距今 7 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M12](roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档) + Milestone 概述表 M12 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M12 行
> - **关键 commit 实证**：C65-A1 `1d7c5c8` / C65-A3 `b10e270` / C65-B1 `789ed2f` / C65-C1+C2 `5dff002` / C65-D1 `348502d` / C65-D2 `132b944` / C65-D3 `374a278` / C65-D4 `ad6ce70` / CI 修复 `0c57211` `4043918` / network-audit `2104b9f` `0eb8704`
> - **关键经验沉淀**：`docs/standards/platform.md §7.2` i18n 单点声明条款 + `docs/standards/development.md §3` 同模式扫描 + `docs/standards/git.md §3` F 阶段本地验证口径差异
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)

---

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交本地待推送。详见分片文档。

---


## C53 / M10 / T912 / 2026-08-20 平台 UI 增强（C59-C61）/ 2026-08-20 M11 推进批次（已归档 → 迁出至分片）

> **2026-08-28 M16 归档批次预防性迁出**：本节段 5 个早期批次（C53 / M10 / T912 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要）已迁至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md) 与既有分片 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C 衍生子任务）。主窗口不再保留完整实施记录，仅保留导航指针与本批次归档背景说明。
>
> **迁出触发**：M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略。

| 批次 | 关键 commit 数 | 详情 |
|:--|:--:|:--|
| **C53** 平台集成模式 fix 修复结果推送远程 | 3 commits（`83ec736` / `46b7c15` / `3ed8303`） | [分片 §C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)（含 C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序；衍生子任务 C53-后-A/B/C 在 [archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次） |
| **M10** 独立沙箱容器 C26 实施规划 | 13 commits（T1001 B1+B2 + T1002 + T1003 + T1004） | [分片 §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档)（含 Docker rootless + 出站白名单代理 + cgroup v2 资源限制 + 文档收口） |
| **T912** SMTP 邮件发送器主体收口 | 3 commits（`edc9c94` / `6f00937` / `6e28207`） | [分片 §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)（T912-3 合并入 C28） |
| **2026-08-20 平台 UI 增强**（C59-C61） | 10 commits（C59 `9949504` + `03ba3b2` / C60 `a1d5bd9` `532ea78` `6b994b5` `5bba3f4` `5fbad71` / C61 `ffacfca` `5abd914` `402dc03`） | [分片 §2026-08-20 平台 UI 增强](archive/todo-archive-phases-m10-c53-c59c61.md#2026-08-20-平台-ui-增强c59--c60--c61)（C59 mixin 修复 + C60 sortable + C61 dashboard 图表） |
| **2026-08-20 M11 推进批次** | 22 commits（M11 推进批次 12 + M11 启动批次 10） | [分片 §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C + T1005-A/B/C/D + C28 + C56/C57 + C58 + C-ENV-CHANGE-ALERT） |

---


## M24: PR Check MVP + 治理债 + 测试补强 + 用户体验（M24.1+M24.2+M24.3+M24.4+M24.5 全部已闭环 / 2026-09-03 归档）

> **2026-09-03 M24 归档批次预防性分片迁出**：M24 段（5 原子条目 12 commits / ~2960 行净增 / 方案 B 能力突破优先）已从 `todo-archive.md` 主窗口迁出至新分片 [archive/todo-archive-phases-m24.md](archive/todo-archive-phases-m24.md)。M24 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口仅保留导航指针（与 M18 / M17 / M16 / M13 同源策略）。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M24](roadmap.md#m24-pr-check-mvp--治理债--测试补强--用户体验) + Milestone 概述表 M24 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M24 行
> - **关键 commit 实证**：`36ee026` PRCheck 实体 / `1068d6e` service + scheduler / `89e1344` API + i18n / `e841b82` UI / `19037d5` UI follow-up / `4803372` UI 重构 / `7120533` Phase 5 docs / `bbb8f30` M24.2 根因 / `ad1ab17` CI 修复 / `a0be125` M24.3 cron-preview / `aaf8e7b` M24.4 治理债 / `7c926a9` Wisdom 蒸馏
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m24.md §M24](archive/todo-archive-phases-m24.md)


## M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline 治理 + M24 follow-up 工具化（M25.1+M25.2a+M25.3+M25.4 全部已闭环 / 2026-09-08 归档）

> **2026-09-08 M25 归档批次迁出**：M25 段（4 原子条目 17 commits / ~1821 行净增 / 方案 A 治理优先 + 能力扩展 + 测试补强）已从 `todo.md` 主窗口迁入新分片 [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)。M25 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口 todo.md 仅保留导航指针（与 M24 归档批次同源策略）。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md](roadmap.md)（Milestone 概述表 M25 行 + §M25 段已新增详细实施状态段）+ 状态更新：M25 行从「进行中」→「**已完成**（2026-09-08 完整闭环 4 原子条目 17 commits / ~1821 行净增；ahead=17 待用户主动推送）」
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M25 行
> - **关键 commit 实证**：`9bf640c` §1.4 规范修正 / `482438d` 方案 A 规划 / `35e4935` PrimeUI License 降级 / `4c51d19` platform.md §3.7 同步 / `1c65582` 数据模型 / `f174cce` Schema+Service / `7250ec1` 三执行器透传 / `49480a6` typecheck 修复 / `782fa27` M25.2a 收口 / `57f3b88` baseline lint 修复 / `4030f3b` packages/cli 修复 / `c88379e` M25.3 收口 / `80912c2` i18n-anchor-check / `65a8ec1` zod-helpers / `66c02ff` M25.4 收口 / `3947279` 锚点修正 + `4818e5d` M25.1 收口
> - **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **17** 待用户主动推送
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)
