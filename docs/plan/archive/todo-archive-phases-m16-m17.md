# M16 + M17 归档分片

> 本文档包含 M16 平台可用性深化 + M17 安全与可用性收口的完整归档记录。
> 原始位置：todo-archive.md 主窗口（2026-08-28 归档）。
> 迁出日期：2026-08-31 M20 归档批次预防性分片迁出——M20 段新增前主窗口 638 行 + M20 段预估 100-130 行将超 700 强制分片阈值，预防性迁出与 M19/M18/M17/M16 归档批次预防性迁出 M14/M15/M13/M12/M10 同源策略。

## M17: 安全与可用性收口（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 全部已闭环 / 2026-08-28 归档）

> **归档日期**：2026-08-28
> **阶段摘要**：M16 闭环后承接 M16.5 audit W-1（凭据加密路径错配）+ S-2（`authedCookieHeader` 三批次遗留重复）+ S-4（better-auth admin viewer role check 单测补强）+ M16.3 audit suggest 范围外扩展（`/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`）4 条 backlog 候选，按"安全性 P1 优先 + i18n 范围外扩展按模块化分组 + 测试基建顺手做"原则拆 **6 子阶段独立闭环**：M17.1 C38 encryptionKey 标准化（service 直读 env → runtimeConfig）/ M17.2 credentials 服务端 API i18n（10 文件抛错本地化）/ M17.3 schedules 服务端 API i18n（同 M17.2 模式）/ M17.4 batch-runs + repos batch 服务端 API i18n（13 文件拆 2 commits）/ M17.5 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/`（纯重构）/ M17.6 S-4 better-auth admin viewer 403 矩阵补强（`ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点）。
> **阶段边界**：M17 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件超阈值需拆分）+ M16.5 audit backlog 4 条目（安全性 + i18n + 测试基建）一并承接；M16.3 `createLocalizedError` 沉淀模式严格沿用（0 新设计成本）；M17.4 总 13 文件拆 2 commits 避开"4 端口合 1 批"反模式。
> **非目标**：不升级 better-auth 1.x 库；不动 h3 `createError` 行为；不引入新 i18n 工具；不改既有 `e2e helpers/` 目录约定；不扩展 C36 业务字段（`ScanRun.errorJson.message` 等 type=Error 业务字段按 C36 验收"不影响 type=Error"约束**不**本地化）。
> **状态**：✅ 全部完成（M17.1 + M17.2 + M17.3 + M17.4 + M17.5 + M17.6 全部 6 子阶段闭环 / 9 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测；含 M17.4 commit 2 audit Reject 后针对性补修闭环 + M17.5 lint-fix 独立 chore commit + session 收尾治理 commit 1；6 轮独立 Review Gate Pass，M17.4 commit 2 standard depth Reject 1 次 + M17.4 commit 2 audit Reject 后补修闭环）

### 阶段闭环清单

#### M17.1 T1701 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **service 改读 `useRuntimeConfig().encryptionKey`** | `b0d3ac0`（fix(platform)） | `apps/platform/server/services/credential.service.ts:73-76` `getEncryptionKey` 改读 `useRuntimeConfig().encryptionKey`（不再直读 `process.env.ENCRYPTION_KEY`）；`apps/platform/nuxt.config.ts:61` runtimeConfig `encryptionKey` 移除 inline fallback 让 `NUXT_ENCRYPTION_KEY` 成为唯一入口；删除 `playwright.config.ts:34` 临时 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` 兜底（保留 L30 标准 `NUXT_ENCRYPTION_KEY=...` 部署凭据）；同步更新 `docker-compose.yml` / `.env.example` 文档 |
| **21 个调用方测试 ReferenceError 修复** | `b0d3ac0`（含测试修复） | 实施 7 文件 / +33/-29 行；调用方测试不再依赖 `process.env.ENCRYPTION_KEY`（与 M16.5 临时兜底兼容）；21 个调用方测试从 ReferenceError 修复后 853 passed |
| **A 阶段 standard depth Pass** | `b0d3ac0`（含收口） | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 853 passed + 4 skipped；A 阶段 standard depth Pass（warning 3 项：W-1 登记 backlog [C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步](#待迁移经验next-neat-freak-候选) / W-2 登记 backlog [S-5 调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理](#待迁移经验next-neat-freak-候选) / W-3 inline fallback 顺手修复） |

#### M17.2 T1702 服务端 API i18n：credentials ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **throw 改造使用 `createLocalizedError`** | `5f66a08`（refactor(api)） | `apps/platform/server/api/credentials/{index,[id]}.ts` 2 文件 throw 改造使用 `createLocalizedError`（沿用 M16.3 C36 已沉淀模式）；既有测试调整（message→code 断言）；message 按请求 locale 返回；7 文件 / +90/-14 行 |
| **A 阶段 quick depth Pass** | `5f66a08`（含收口） | A 阶段 quick depth Pass（实测 187 秒 ≤ 5 分钟时间盒；0 blocker / 1 suggest 延后到 M17.3 audit 后合并处理：S-1 `ServerErrorCode` 字母序跨 M17.2/M17.3/M17.4 多次延后登记 backlog） |

#### M17.3 T1703 服务端 API i18n：schedules ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **throw 改造使用 `createLocalizedError`** | `90549a0`（refactor(api)） | `apps/platform/server/api/schedules/{index,[id],[id]/trigger.post}.ts` 3 文件 throw 改造使用 `createLocalizedError`（沿用 M17.2 模式）；既有测试调整（call helper 签名扩展接受 headers 模式）；message 按请求 locale 返回；8 文件 / +93/-18 行 |
| **A 阶段 quick depth Pass** | `90549a0`（含收口） | A 阶段 quick depth Pass（实测 314 秒略超 5 分钟时间盒；0 blocker / 2 suggest 登记 backlog：S-1 字母序合并处理 / S-2 测试 helper 签名扩展模式文档化） |

#### M17.4 T1704 服务端 API i18n：batch-runs + repos batch ✅（2026-08-28 闭环 / 拆 2 commits）

> 本子阶段按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md) A3 跨 packages+apps > 10 文件超阈值需拆分原则，**总 13 文件拆 2 commits**：commit 1（`98fd47d`）9 文件字典 + helper + API throw 改造 / commit 2（`a1c7c4e`）4 文件既有测试 message→code 断言调整。commit 2 audit standard depth Reject 1 次（实测 7 个 typecheck error——nuxt typecheck 容忍部分 TS error 但 build 仍阻断；M17 session 关键教训）后针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 afterEach import）。

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit 1：字典 + helper + API throw 改造** | `98fd47d`（refactor(api)） | `apps/platform/server/api/batch-runs/{[id].get,[id]/force-fail.post}.ts` + `apps/platform/server/api/repos/{batch.post,batch-scan.post,importable.get}.ts` 共 5 文件 throw 改造使用 `createLocalizedError`（沿用 M17.2 模式 + 字典扩展 `REPO_*` / `BATCH_RUN_*` 段 + codeSet 测试覆盖新 code）；9 文件 / +125/-27 行 |
| **commit 2：既有测试 message→code 断言调整 + audit Reject 补修** | `a1c7c4e`（test(platform)） | 既有测试 message→code 断言调整（4 文件 / +68/-14 行）；A 阶段 standard depth Round 1 Reject 7 个 typecheck error（`batch.post.test.ts:2` 缺 `afterEach` import + 6 处 `err.data?.code/field/resource` 属性访问 TS2339）→ 针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 `afterEach` import + `afterEach` 测试隔离兜底模式）→ Round 2 standard Pass |
| **A 阶段 standard depth Pass × 2** | `98fd47d` + `a1c7c4e` | `pnpm --filter @dependfix/platform typecheck` 0 error（实测！audit Reject 前宣称 typecheck Done 是错的——nuxt typecheck 不实测不能信 Done 输出——M17 session 关键教训）+ `lint` 0 error + `vitest` 859 passed + 4 skipped；A 阶段 standard depth 2 轮（commit 1 Pass / commit 2 Reject 后补修 Pass） |

#### M17.5 T1705 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/` ✅（2026-08-28 闭环 / 拆 2 commits）

> 本子阶段按"重构独立 commit + lint auto-fix 独立 chore commit"模式，**总 4 文件拆 2 commits**：commit 1（`466b142`）helper 抽取 + 3 e2e 文件 import 切换 / commit 2（`fc0b175`）用户明确指令"接受 lint auto-fix"独立 chore commit。

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit 1：`authedCookieHeader` 抽取 helper** | `466b142`（refactor(e2e)） | `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts` 新建（沿用 `hydration.helper.ts` 极简风格 10 行）+ `apps/platform/tests/e2e/{api-i18n,credentials-crud,repos-crud}.e2e.test.ts` 3 e2e 文件删本地一字不差的 `authedCookieHeader` 函数 + 改 import；JSDoc 注释聚合 3 文件原始注释；零行为变更（rg 字节级比对实证）；4 文件 / +19/-19 行 |
| **commit 2：lint auto-fix 接受策略（chore）** | `fc0b175`（chore(platform)） | `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts:1` ESLint array-type 自动修复接受；按用户指令"应该检查并提交修复"独立 chore commit（不混入 M17.5 主逻辑 commit；历史 commit `64bc1a5` 曾因误带 docs 提交回滚，本次按用户指令反向处理） |
| **A 阶段 quick depth Pass × 2** | `466b142` + `fc0b175` | `@dependfix/platform exec playwright test` 全过；A 阶段 quick depth Pass × 2（实测 169 秒 ≤ 5 分钟时间盒；0 blocker） |

#### M17.6 T1706 S-4 better-auth admin viewer 403 矩阵补强 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **5 端点 viewer 403 单测补强** | `56df374`（test(e2e)） | `apps/platform/tests/e2e/admin-roles-extra.e2e.test.ts` 新建（沿用 M16.5 admin-roles.e2e.test.ts 模式 + `vi.hoisted` + `mockImplementationOnce`）；覆盖 `ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点 viewer 403 矩阵；锁定 better-auth admin 当前版本 role 行为，防升级回归；1 文件 / +98 行 |
| **A 阶段 quick depth Pass** | `56df374`（含收口） | A 阶段 quick depth Pass（实测 119 秒 ≤ 5 分钟时间盒；0 blocker / 0 warning / 2 suggest 登记 backlog：S-1 `update-user` 端点 viewer 403 矩阵延后到 viewer 403 矩阵稳定后追加 + S-2 admin 200 双向断言延后） |

#### M17 session 收尾治理 commit ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **6 子阶段闭环状态登记 + 8 条经验教训沉淀** | `9bdb2dc`（chore(plan+standards)） | `docs/plan/todo.md` L5 banner 切换 + 6 子阶段标题加 ✅ commit 标记；`docs/plan/roadmap.md` L316 当前阶段指针更新；`docs/plan/backlog.md` 8 处旧锚点 hash 修复 + L265 artifacts/ 链接描述化（artifacts/ 在 .gitignore 中不入仓库）；`docs/standards/testing.md` §6 新增 2 条 pattern（测试隔离 afterEach 模式 + test helper 强契约类型契约）；`docs/standards/git.md` §3.5 新增"lint auto-fix 接受策略"段；`docs/standards/ai-collaboration.md` §1.4 commit 拆分增加"依赖关系处理"子节 + §4.4 增加"nuxt typecheck 输出 Done ≠ TS 0 error"实测纪律 + §4.6 增加"audit suggest 跨 batch 累积跟踪 + audit Reject 后针对性补修"2 条 pattern；`.github/agents/code-auditor.agent.md`「证据获取与审查深度」段增加"typecheck 必须实测（不能信执行方 Done 输出）"子节 |

### 阶段验收标准（M17 全部 6 子阶段闭环 ✅）

- [x] **M17.1 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径** —— service 改读 `useRuntimeConfig().encryptionKey` + nuxt.config 移除 inline fallback + playwright 兜底删除 + docker-compose / .env.example 同步更新；21 个调用方测试从 ReferenceError 修复后 853 passed
- [x] **M17.2 credentials 服务端 API i18n** —— throw 改造使用 `createLocalizedError`（沿用 M16.3 C36 模式）+ message 按请求 locale 返回 + 既有测试调整 + 1 case 验证 locale 切换
- [x] **M17.3 schedules 服务端 API i18n** —— 同 M17.2 模式（沿用 `createLocalizedError`）
- [x] **M17.4 batch-runs + repos batch 服务端 API i18n** —— 同 M17.2 模式；总 13 文件拆 2 commits（commit 1 字典 + helper + API throw 改造 9 文件 / commit 2 既有测试 message→code 断言调整 4 文件）；commit 2 audit Reject 7 个 typecheck error 后针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 afterEach import + `afterEach` 测试隔离兜底模式）
- [x] **M17.5 S-2 `authedCookieHeader` 抽取** —— 3 e2e 文件一字不差的 `authedCookieHeader` 函数抽取至 `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts`；零行为变更（rg 字节级比对实证）；e2e 全绿
- [x] **M17.6 S-4 better-auth admin viewer 403 矩阵补强** —— 补 5 端点 viewer 403 单测；锁定 better-auth admin 当前版本 role 行为，防升级回归
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— vitest 859 passed + 4 skipped（baseline 853 + M17.4 commit 2 测试调整 + M17.6 单测补强）
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 6 轮独立 Review Gate Pass（M17.1 standard / M17.2 quick / M17.3 quick / M17.4 standard 2 轮含 1 次 Reject 后补修 / M17.5 quick 2 轮 / M17.6 quick）+ CI run 端到端验证通过

### 阶段治理记录（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 + session 收尾）

- **总投入**：9 commits（M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾治理 1）；含 M17.4 commit 2 audit standard depth Reject 1 次后针对性补修闭环（nuxt typecheck 不实测不能信 Done 输出）+ M17.5 lint-fix 独立 chore commit
- **测试覆盖**：vitest 859 passed + 4 skipped（baseline 853 + M17.4 commit 2 测试调整 0 新增 + M17.6 单测补强）；playwright e2e 新增 M17.5 0 case（纯重构）+ M17.6 viewer 403 矩阵 1 file
- **审计覆盖**：M17.1 standard（实测 ≈ 8 分钟）/ M17.2 quick（实测 187 秒）/ M17.3 quick（实测 314 秒略超 5 分钟时间盒）/ M17.4 standard × 2（commit 1 实测 ≈ 8 分钟 + commit 2 Reject 实测 ≈ 7 分钟 + commit 2 Reject 后补修 quick Pass 实测 ≈ 4 分钟）/ M17.5 quick × 2（实测 169 秒）/ M17.6 quick（实测 119 秒）+ session 收尾 quick（实测 184 秒）—— 6 commits × 8 次 audit（含 1 次 Reject 后补修闭环）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 当前值为 0（ahead=0 已全部推送至 origin/master——M17 全部 9 commits 落地后由用户主动推送；session 文件 `ahead=8` 描述为 stale 已在本批次归档时校正）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M17 段（本段）
  - `docs/plan/todo.md` 顶部 banner 切换 + §M17 任务清单 + §M17 拆分依据与实施路径 整段迁移至 [todo-archive.md §M17](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档) + 文档位置速查表更新（主窗口保留 6 个阶段）
  - `docs/plan/roadmap.md` M17 详细实施状态段 + Milestone 概述表 M17 行状态更新（已完成 2026-08-28 归档）+ 当前阶段任务指针更新（ahead=0 已全部推送）
  - `docs/plan/backlog.md` 顶部"2026-08-28 闭环整理（M17 归档批次）"段新增 + §服务端凭据加密路径 C38 / §测试基础设施清理 S-2 / §测试覆盖补强 S-4 三段"已上收 M17.x"按 backlog 维护规则 5 短期候选正式上收后从 backlog 主条目迁出（保留 [§M17 启动批次](#) 历史归档指针段描述）+ 历史归档指针段 4 条目描述更新（已闭环于 M17.x 归档批次，归档至 todo-archive.md §M17）
  - `docs/plan/archive/index.md` §4 当前基线更新（M17 归档后）+ §5 近期归档批次登记新增 M17 行
  - `docs/standards/development.md` §3 注释规范（编号标记扫描硬要求持续生效）
  - `docs/standards/testing.md` §6 末尾新增 2 条 pattern（测试隔离 afterEach 模式 + test helper 强契约类型契约）
  - `docs/standards/git.md` §3.5 新增"lint auto-fix 接受策略"段
  - `docs/standards/ai-collaboration.md` §1.4 commit 拆分增加"依赖关系处理"子节 + §4.4 增加"nuxt typecheck 输出 Done ≠ TS 0 error"实测纪律 + §4.6 增加"audit suggest 跨 batch 累积跟踪 + audit Reject 后针对性补修"2 条 pattern
  - `.github/agents/code-auditor.agent.md`「证据获取与审查深度」段增加"typecheck 必须实测（不能信执行方 Done 输出）"子节

### 关键决策（M17.1+M17.2-4+M17.5+M17.6）

**M17.1：**

- **服务路径单一权威来源 `useRuntimeConfig().encryptionKey`**：M16.5 audit W-1 根因 = `credential.service.ts:73-76` 直读 `process.env.ENCRYPTION_KEY` 与 `nuxt.config.ts:61` runtimeConfig `encryptionKey` 错配，典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；统一改为 service 走 runtimeConfig（Nuxt 标准部署习惯）+ nuxt.config 移除 inline fallback（避免双入口漂移）+ playwright 临时兜底删除（避免 e2e 测试环境与生产漂移）
- **保留 L30 `NUXT_ENCRYPTION_KEY=...` + 删除 L34 `ENCRYPTION_KEY=...`**（关键澄清）：两条 env line 是独立配置项——L30 标准 NUXT_ 前缀部署凭据是 e2e 测试环境唯一需要的（service 改读 runtimeConfig 后 L30 即可满足 e2e 加密需求）；L34 无 NUXT_ 前缀是 M16.5 临时兜底（service 直读 env 兜底，service 改读 runtimeConfig 后 L34 不再需要）

**M17.2-4：**

- **i18n 改造模式严格沿用 M16.3 `createLocalizedError`**：0 新设计成本——M16.3 audit suggest 范围外扩展（`/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`）10 文件抛错本地化全部沿用既有 helper + 字典 + codeSet 测试同步模式
- **避开"4 端口合 1 批"反模式（M17.4 拆 2 commits 实证）**：M17.4 总 13 文件（5 API throw + 4 测试 + 字典 + helper + codeSet）按"基础设施层（字典 + helper） + 业务 throw 改造（5 API）+ 测试调整（4 case）"拆 3 段，commit 1 字典 + helper + API throw 改造 9 文件（独立可测——codeSet 测试通过）；commit 2 既有测试 message→code 断言调整 4 文件（依赖 commit 1 新 code——commit 2 时 typecheck / test 必须实测确认 commit 1 已落地）
- **`ServerErrorCode` 字母序跨 M17.2/M17.3/M17.4 多次延后登记 backlog（S-1）**：audit suggest 顺手处理原则 vs 跨 batch 累积跟踪原则取舍——字母序整理属 audit suggest 顺手处理范畴但跨多 batch 多次延后不利于稳定追踪，本次按 [规划规范 §4.4 大批量归档批次操作规范](../../docs/standards/planning.md#44-大批量归档批次操作规范) audit suggest 跨 batch 累积跟踪原则登记 backlog，下批次合并处理

**M17.4 commit 2 audit Reject：**

- **nuxt typecheck 输出 "Done" ≠ TS 0 error（M17 session 关键教训）**：nuxt typecheck 走 `vue-tsc` pipeline 在某些情况下容忍 TS error（如 `Record<string, unknown>` 索引访问得到 `{}` 时不报错；strict 模式下访问 `err.data?.code` 仍会 TS2339 但 build 不阻断）。执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error。M17.4 commit 2 audit Reject 实测 7 个 TS2304 + TS2339 error（`batch.post.test.ts:2` 缺 `afterEach` import + 6 处 `err.data?.code/field/resource` 属性访问失败）此前未触发实测；Reject 后针对性补修闭环（api-helper.ts 返回类型放宽 `Record<string, any>` + batch.post.test.ts 加 afterEach import）→ 重跑 typecheck 0 error + test 859 passed → 重新 commit 通过。F 阶段验证必须实测 typecheck 0 error，不能仅看 "Done" 输出
- **audit Reject 后针对性补修 + 重验证三件套**：audit Reject 后必须针对性补修 blocker + 重验证 typecheck + lint + test 三件套确认 0 error 才能重新 commit；不回退到全量重试模式（PDTFC+ 修复工作流"不回退到全量重试模式"）

**M17.5：**

- **重构 vs 实现优先 reverse pattern**：S-2 `authedCookieHeader` 抽取是 M16.5 audit suggest 的"M16.3 / M16.5 三批次遗留重复"——按"先实现再看是否需要抽取"在 audit suggest 触发后采纳，与 M14.x `test 名孤立编号清理` 同模式（audit suggest 触发顺手处理）
- **JSDoc 注释聚合 3 文件原始注释**：避免抽取 helper 后丢失历史注释上下文（虽然 `authedCookieHeader` 函数定义完全一致，但每文件原始注释略有差异——聚合到 helper 顶部 JSDoc 注释保留信息密度）
- **零行为变更 + rg 字节级比对实证**：3 文件 4 处函数定义全文拷贝到 helper 后，3 文件原文逐字节删除——rg 实证 3 文件无残留 `authedCookieHeader` 定义 + e2e 测试全过
- **lint auto-fix 接受策略（独立 chore commit）**：用户指令"应该检查并提交修复"接受 + 独立 chore commit（不混入 M17.5 主逻辑 commit）；与历史 commit `64bc1a5` 曾因误带 docs 提交回滚形成对比——本次按用户指令反向处理（用户明确指令接受 vs 既有"慎带 docs"约束）

**M17.6：**

- **vitest 风格 + playwright 真实 better-auth 端点（不 mock better-auth 库内部逻辑）**：mock better-auth 库内部逻辑后测的不是 better-auth 真实行为，违反"防升级回归"目的——viewer 403 矩阵测的是 better-auth admin 端点角色检查行为，应真实调用 better-auth admin API 断言 viewer 拒绝
- **`vi.hoisted` + `mockImplementationOnce` 模式统一 mock**：M16.5 D 阶段实施的三角色 vi.hoisted 模式在本批次复用——`vi.hoisted` 解 vi.mock factory hoist 问题；`mockImplementationOnce` 单次切换不影响其他 case
- **5 端点 viewer 403 矩阵 + 锁定 better-auth admin 当前版本 role 行为**：防升级回归——better-auth 1.x 升级若行为变化立即触发 viewer 403 矩阵失败；锁定测试是 baseline 而非阻塞（实际升级后矩阵失败则触发迁移评估）

### 阶段关键经验（已沉淀至项目知识库）

- **测试隔离 afterEach 模式（describe 块 cleanup 兜底）**：[testing.md §6 末尾 L87](../../docs/standards/testing.md)（描述：describe 块 cleanup 应统一用 `afterEach` 兜底——vitest 钩子）——而非 it case 末尾手动 cleanup 块——后者在 `expectError` 抛错 / 异常分支时易跳过导致污染后续测试。M17.4 commit 1 后 `repos/batch.post.test.ts:165` 实测：手动 cleanup（L183-187）不在 try/finally，L181 抛错后 cleanup 跳过，L190 后续测试读到外组织凭据导致 `RESOURCE_NOT_IN_ORG` 误抛（audit suggest #2 即源自此）
- **test helper 强契约类型契约**：[testing.md §6 末尾 L88](../../docs/standards/testing.md)（描述：test helper 返回类型应反映测试断言模式）——message 断言可用 `Record<string, unknown>`；code/data 强契约断言需放宽为 `Record<string, any>` 或引入泛型。M17.4 commit 2 实测：`apps/platform/tests/api-helper.ts:32` `expectError` 返回 `Record<string, unknown>` 在 strict 模式下导致 6 处 `err.data?.code` 访问 TS2339
- **lint auto-fix 接受策略**：[git.md §3.5](../../docs/standards/git.md)（描述：lint auto-fix 接受决策需区分"lint 误报（应登记 backlog）"vs"lint 正确（应接受修复）"）——接受修复时按用户指令独立 chore commit（不混入主逻辑 commit）；M17.5 `fc0b175` 实证 + 历史 commit `64bc1a5` 因误带 docs 提交回滚形成对比
- **commit 拆分依赖关系处理**：[ai-collaboration.md §1.4](../../docs/standards/ai-collaboration.md)（描述：拆分后确保 commit 1 独立可测——基础设施层如字典 + helper 同步落地，codeSet 测试覆盖新 code）——commit 2 业务 throw 改造依赖 commit 1（引用新 code）；commit 3 测试调整依赖 commit 2（验证 throw 改造行为）。任何 commit 不可被独立运行验证即拆分错位。M17.4 总 13 文件拆 2 commits 实证
- **nuxt typecheck 输出 "Done" ≠ TS 0 error**：[ai-collaboration.md §4.4](../../docs/standards/ai-collaboration.md)（hard requirement 新增：nuxt typecheck 走 `vue-tsc` pipeline 在某些情况下容忍 TS error）——执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error。M17.4 commit 2 audit Reject 实测 7 个 TS2304 + TS2339 error 此前未触发实测；F 阶段验证必须实测 typecheck 0 error，不能仅看 "Done" 输出
- **audit suggest 跨 batch 累积跟踪**：[ai-collaboration.md §4.6](../../docs/standards/ai-collaboration.md)（pattern 新增：suggest 跨多个 commit 延后处理时必须在每个 commit message 中显式登记 backlog 跟踪项，便于后续追踪 + 跨 session 蒸馏累积）——统一 backlog 跟踪条目（如 audit suggest #2 累积跟踪）优于单次登记——后者容易在多次 commit 中重复登记或遗漏
- **audit Reject 后针对性补修 + 重验证三件套**：[ai-collaboration.md §4.6](../../docs/standards/ai-collaboration.md)（pattern 新增：audit Reject 后必须针对性补修 blocker + 重验证 typecheck + lint + test 三件套确认 0 error 才能重新 commit；不回退到全量重试模式——PDTFC+ 修复工作流"不回退到全量重试模式"）——M17.4 commit 2 audit Reject 后实测：补修 2 个 blocker → 重跑 typecheck 0 error + test 859 passed → 重新 commit 通过
- **typecheck 必须实测（不能信执行方 Done 输出）**：[code-auditor.agent.md 「证据获取与审查深度」段](../../.github/agents/code-auditor.agent.md) 子节新增——A 阶段 audit 必须实测 typecheck 输出 0 error（不依赖执行方"typecheck Done"宣称）；nuxt typecheck 容忍部分 TS error 但 build 仍阻断；F 阶段本地验证"完整验证"必须含实测 typecheck 0 error 声明

### 待迁移经验（next neat-freak 候选）

- **C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步**（M17.1 audit W-1 登记）—— 当前状态：M17.1 实施后 `process.env.ENCRYPTION_KEY` 不再被代码读取（credential.service.ts:78 改读 `useRuntimeConfig().encryptionKey`，单源在 nuxt.config.ts:61 读 `NUXT_ENCRYPTION_KEY`）；但权威规范层仍有 8 处仍用旧 env 名 `ENCRYPTION_KEY`（docs/standards/platform.md:150 + :240 + docs/standards/security.md:83/:123/:131/:132/:138/:145）；修复方向：8 处全部 `ENCRYPTION_KEY` → `NUXT_ENCRYPTION_KEY`（platform.md §5 + §10 + security.md §5.5/§5.2/§5.3 联动更新）；可与 C34 存量规范挂接盘点同批次治理；优先级：P3（不阻塞 M17.1 合并，但强烈建议下批次闭环，避免重新引入运维误配 500）
- **S-5 调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理**（M17.1 audit W-2 登记）—— 当前状态：6 处调用方测试仍写 `process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'`（`apps/platform/server/services/scan-orchestrator.test.ts:115,120,128` + `apps/platform/server/api/credentials/index.test.ts:28,33,71,73` + `apps/platform/server/api/credentials/[id].test.ts:28,39,92-94` + `apps/platform/server/api/repos/importable.get.test.ts:80,91` + `apps/platform/server/api/repos/batch.post.test.ts:31,36`）；service 不再读 `process.env.ENCRYPTION_KEY`，实际密钥来自 `tests/setup-nuxt-server.ts:26` 全局 stub `useRuntimeConfig = () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' })`；调用方测试之所以还能通过，纯属两边恰好都用同一字符串 `'test-encryption-key-32-bytes!!'` 的偶然一致性；修复方向：① 短期 — 5 文件删除 `process.env.ENCRYPTION_KEY` 赋值/清理对，改为显式 `vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' }))` 或统一 helper；② 长期 — 抽 `setTestEncryptionKey(key)` helper（与 `setupMemoryDatabase` 同模式），与 M17.5 S-2 `authedCookieHeader` 抽取同源策略；优先级：P3（建议与 M17.5 同批次合并实施）
- **C34 存量规范严格约束挂接盘点**（backlog 候选；建议与 C39 联动）—— 审查现有 `docs/standards/*.md` 中"必须级"条款是否已在 code-quality-checklist.md / code-reviewer skill 双层对称挂接；现状：部分已挂接 development/testing/security/git/ai-collaboration，部分仅 standards 有 platform.md §7.1/§7.2；触发：下次 neat-freak 批次统一盘点
- **S-1 `SCAN_PENDING_MERGED` 死代码**（M16.3 audit suggest 延后）—— 当前在字典 + 联合类型 + 测试数据中定义但无 throw 消费（`scan.post.ts:95` 仍写死 `'duplicate_scan'` 与字面中文 message）—— 移除或与前端 ScanRun 错误处理对齐另立独立 code
- **S-2 `detectServerLocale` 缺 `?locale=` URL query 支持**（M16.3 audit suggest 延后）—— 与 `localeDetector.ts:15` 现有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **S-3 `update-user` 端点 viewer 403 矩阵**（M17.6 audit suggest 延后）—— M17.6 S-4 实施时排除 `update-user`（与 M16.5 auth-self-guard 5 端点重叠）；下次 viewer 403 矩阵稳定后追加
- **S-4 admin 200 双向断言**（M17.6 audit suggest 延后）—— 与 viewer 403 双向断言；延后到 viewer 403 矩阵稳定后追加

---

## M16: 平台可用性深化（M16.1+M16.2+M16.3+M16.4+M16.5 全部已闭环 / 2026-08-28 归档）

> **归档日期**：2026-08-28
> **阶段摘要**：把 `apps/platform` 从 demo 落地为实际可用项目，覆盖 5 项 UI/API/技术债痛点——M16.1 UX-R3 `/scans` 独立页面（含 `/api/runs` 组织隔离）/ M16.2 C66-D alerts "立即修复此仓库" 入口（reuseScanRunId）/ M16.3 C36 服务端 API 错误消息 i18n（h3 createError + locale 检测 + serverErrors 字典）/ M16.4 PrimeVue hydration 主线 #1 缓解（alerts 迁移 useAsyncData）/ M16.5 T701-e2e 管理端点集成测试补强（三角色鉴权 + 自修改防御 + 3 e2e 闭环）。5 子任务均 D 阶段已实施 + A 阶段 standard depth Pass + 6+ atomic commits。
> **阶段边界**：M16 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ UX-R3 仅占 M16.1 一项；M15 阶段既有的 RunDetailDialog 与 utility + M14.2 `/api/runs` 分页契约 + M13.2 应用层去重 + M13.4 T1403 dedupe 默认全部复用。
> **非目标**：不引入多组织；不重写后端聚合；不动 `dashboard.vue` latestRun 卡片；不动 `batch-runs` 跨仓库视图；不升级 PrimeVue 5；不破坏既有 `alerts-rowgroup` / `history-dialog` / 视图切换 / dedupe 行为。
> **状态**：✅ 全部完成（M16.1 + M16.2 + M16.3 + M16.4 + M16.5 全部 5 子任务闭环 / 5 轮独立 Review Gate Pass；19 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测；CI run #33068271005 Coverage job 触发 80% 阈值失败，已通过 M16 新代码补测批次恢复至 80.27%）

### 阶段闭环清单

#### M16.1 UX-R3 `/scans` 独立页面 + RepoHistoryDialog 迁移 ✅（2026-08-27 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R3 后端 organizationId 隔离 + summary API** | `b8e54a6`（后端 + summary 单测） + 同 P 阶段 docs commit | `/api/runs` 加 `where.repository.organizationId` 过滤（默认取自 session）；新增 `/api/scan-history/summary.get.ts`（byStatus/totals/repositories/window/filtered 五字段）；单测 +6 case（隔离 + 默认 + 边界 + summary 五字段） |
| **UX-R3 前端 `apps/platform/app/pages/scans.vue` + i18n 双语** | `b8e54a6`（前端 + i18n） + 同 P 阶段 docs commit | 新增独立 `/scans` 页面（4 块汇总卡片 + byRepo DataTable + 全运行分页 DataTable + 仓库过滤面包屑）；layout "扫描"菜单项（viewer 可见）；repos.vue pi-history 跳转改 `/scans?repository=`；i18n 双语新增 `scans` 段（37/37 键对称） |
| **UX-R3 RepoHistoryDialog 改造 + e2e 迁移** | `b8e54a6`（RepoHistoryDialog） + `db1f64b`（e2e） | RepoHistoryDialog 新增 `queryKey` prop（'history' \| 'run' 默认 'history'）支持 M16.1 + 兼容性兜底；`history-dialog.e2e.test.ts` 删除并迁移至新建 `scans.e2e.test.ts`（避免 `/repos?history=` 路径成为孤儿）；e2e +5 case（3 query 组合 + viewer × 2） |
| **A 阶段标准 Pass 收口** | `f9cb1da` | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 743 passed + 4 skipped（新增 10 case：runs organizationId 隔离 1 + summary 6 + 既有 e2e 迁移 3） + `e2e` 74 passed + 2 skipped + `build` 成功 + i18n JSON.parse 双语对称 542 键；A 阶段 standard depth Pass（warning 7 项 + suggest 4 项已分级 backlog） |
| **M16.1 后续补测批次** | `acfdc8d8` | CI run #33068271005 Coverage job 失败（branches 79.93% < 80% 阈值）→ 根因为 M16.1 新代码（`summary.get.ts` 81.8% branches + 缺 `apps/platform/app/utils/alerts-view.ts` 配套测试）+ M16.2 新代码（`scan.post.ts` / `runs/index.get.ts` 防御分支未覆盖）累计效应。`runBranchCleanupForRepo` 之外的 M16 新文件测试已补齐（`alerts-view.test.ts` 100% + `summary.get.test.ts` 88.9% + `runs/index.get.test.ts` 100% + `scan.post.test.ts` 96.9%），整体 branches 80.27% / statements 84.91% 通过 80% 阈值 |

#### M16.2 C66-D alerts "立即修复此仓库" 入口 + `reuseScanRunId` ✅（2026-08-27 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **后端 `scanRequestSchema` + `ScanRunOptions.reuse`** | `d656dc3`（后端 + orchestrator） | `/api/repos/[id]/scan.post.ts` 新增 `reuseScanRunId?: string`；handler 三态校验（404/400/409）；`ScanRunOptions.reuse?: boolean` 区分 queue-mode continuation 与 user-reuse；orchestrator 在 reuse=true 时绕过终态校验并 reset finishedAt / errorJson / summaryJson / runUrl + 更新 mode / severityThreshold / executorKind + 清空 ScanResult 子表避免 JOIN 数据不一致；scan-worker 透传 reuse 参数支持 async 队列路径同步语义 |
| **前端 alerts.vue "立即修复此仓库" 按钮 + utility 抽取 + composable** | `ccfa33c`（前端 + utility） + `5a3b31a`（composable + sidebar） | alerts.vue 受影响运行 DataTable 加 "立即修复此仓库" 按钮（`report-only` 模式才显示 + 存在 `affectedRunIds[0]` 时启用）；`AlertRunSidebar.vue` 组件抽取（解 alerts.vue > 800 行 lint warning）；新增 `composables/use-fix-now.ts` 一键修复状态机（fixingRunId / fixError / fixSuccess）；新增 `utils/alerts-view.ts` 抽取 alertsSeverityTagSeverity / alertsRuleIdTagSeverity / alertsRunStatusSeverity / alertsFixStatusLabel；i18n 双语新增 `alerts.fixNow.{action,success,failed}` |
| **单测 + e2e + 收口** | `5e9c3c1`（单测 + e2e） + `8675608`（收口 + kebab-case rename refactor） | 单测 +7 case（scan.post reuse sync/async/404/400/409/pendingScanRun 回归 + orchestrator reuse=true 真实集成）；e2e +3 case（reuse 调用验证 / fix 模式不展示按钮 / 4xx 错误处理）；A 阶段 2 轮 Pass（RG-B1 终态校验契约冲突修复：ScanRunOptions reuse 区分 queue-mode continuation / user-reuse + reset summaryJson 等字段 + 清空 ScanResult 子表；RG-B2 真实集成测试补强；warning 4 项 + RG-W3 ScanResult cleanup 全部修复） |
| **M16.2 后续补测** | `acfdc8d8`（同 M16.1 补测 commit） | `scan.post.test.ts` 增 `queue.add 抛"已处于终态"→409` 与 `缺 id→400` 两个边界用例（`runs/index.get.test.ts` 与 `verification-gate.test.ts` 同批补测），整体覆盖率恢复至 80.27%；i18n JSON.parse 双语对称 545 键；`build` 成功；vitest 750 passed + 4 skipped（新增 7 case 累计）/ e2e 77 passed + 2 skipped（新增 3 case 累计） |

#### M16.3 C36 服务端 API 错误消息 i18n ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **helper 引入 + 单测 + locales 双语字典** | `a573df3`（helper + 单测 + locales） | `apps/platform/server/utils/localized-error.ts` 新增 `createLocalizedError(event, { statusCode, code, params?, data? })` + `detectServerLocale`（优先级 `cookie(i18n_locale) > Accept-Language > 默认 zh-CN`，防御性降级 `event.node?.req?.headers` 缺失）；`params` 模板插值接口预留；i18n locales/en-US.json + zh-CN.json 新增 `serverErrors` 段（16 code × zh-CN/en 双语完整对称 + 顶层段 15/15）；helper 24 case 单测（locale 检测 / 字典 / 兜底 / 双语 / locales 契约） |
| **guard.ts + repos 系列 throw 改造** | `b604f79`（guard + repos） | guard.ts 串接共享错误（401/403/403，`/api/alerts` `/api/scan-history/summary` 借此自动覆盖）；`/api/repos` 系列 14 处 throw 改造（统一本地化入口）；repos/index.get.ts 增强 zod validation 1 case |
| **runs 系列 throw 改造 + ScanRun.errorJson 不本地化决策** | `e9c406e`（runs） | `/api/runs` 系列 3 处 throw 改造；`repos/[id]/scan.post.ts` 是 M16.2 刚改过的文件再动，本地化 7 处 throw 行为不变；`scan.post.ts:95` 的 `ScanRun.errorJson.message` 是 **type=Error 业务字段**（前端从 ScanRun 读取时按前端 i18n 翻译），按 C36 验收"不影响 type=Error"约束**不**本地化 |
| **e2e + 收口** | `ace07a8`（e2e + 收口） | 新增 `tests/e2e/api-i18n.e2e.test.ts` 7 case 全过（Accept-Language: zh-CN / en-US + cookie 优先级 + 未知 locale 兜底 + 404/405 双语对称 + zod validation data.issues 透传）；A 阶段 standard depth Pass（实际用时 4.3 分钟 / 0 blocker / 0 warning / 2 suggest 已登记 backlog） |
| **M16.3 验收** | - | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 805 passed + 4 skipped（新增 31 case：helper 24 + repos/index 验证 zod issues 透传 1 + 既有 e2e 迁移 6） + `e2e` 84 passed + 2 skipped（新增 7 case） + `build` 成功（38.2 MB total） + branches coverage 85.35%（远超 80% 阈值） + locales JSON.parse 顶层段 15/15 + serverErrors 16 code 双语完整 |

#### M16.4 PrimeVue hydration 主线 #1 缓解：alerts 加载迁移 useAsyncData ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **根因分析 + useAsyncData 迁移 + utility 抽取** | `96c8446`（utility 抽取） + `21b2267`（alerts 迁移） | 根因：PrimeVue 4 DataTable rowGroup subheader 在 hydration 后未重新计算 processedData（onMounted 异步赋值时 data.value=[] → mutation 时 PrimeVue 不响应），SSR HTML 已含数据但 PrimeVue JS 渲染依赖响应式 source data；alerts.vue 迁移到 `useAsyncData(key, handler, { watch: [viewMode, filters], default })` + `useRequestFetch()`（Nuxt 4 官方 SSR cookie 转发方案，避免 `$fetch` 在 SSR 不转发 cookie 致 auth middleware 401）；`repositories` / `alerts` 改 computed 派生（`useAsyncData data ?? []` + `withFixStatusRank`/`withSeverityRank` 后处理保留 M15 utility 复用）；`loading`/`error` 派生自 useAsyncData `pending`/`error`；`onMounted(fetchRepositories + fetchAlerts)` 全删；watch 自动 refetch 替代原 3 处手动 `fetchAlerts()` 调用（`onViewModeChange` 删 `void fetchAlerts()` 保留 multiSortMeta + expandedPackages 重置；`onDedupeChange` 整个函数删除；filterApply Button `@click` 改 `refreshAlerts()`）；utility 抽取：apps/platform/app/utils/alerts-view.ts 新增 `buildAlertsQuery(viewMode, filters)` + `AlertsViewMode` / `AlertsFilters` 类型导出 + 9 case 单测 |
| **类型适配 + Button @click 包裹形式** | `21b2267`（含类型适配） | useRequestFetch 调用点显式 generic 标注规避 TS 5.x $fetch overload 路径推断栈深度限制（Nuxt 4 已知问题）；refreshAlerts 类型不兼容 PrimeVue Button @click PointerEvent 用 `() => { void refreshAlerts() }` 包裹（codebase 同类 pattern 多处存在） |
| **e2e fixme 全取消 + SSR 锁定 test** | `039a987`（e2e） | `tests/e2e/alerts-rowgroup.e2e.test.ts` **2 fixme 全取消**（行 132 DataTable rowGroup + 行 145 subheader 折叠展开）；新增 SSR 锁定 test（行 70-98：hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成，反向锁定未来不回退 onMounted 异步赋值模式）；PrimeVue 4.5.5 toggle icon 改用 SVG path 旋转实现（行 162-168 断言展开/折叠路径不一致） |
| **收口 + docs 同步** | `01dc7cd`（收口 + docs） | A 阶段 standard depth Pass（实际用时 8-10 分钟 / 0 blocker / 0 warning / 2 suggest 已登记：`S-1` todo.md 状态 banner 同步本段补 + `S-2` Button @click 包裹形式属成熟约定无需新抽象）；`pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 814 passed + 4 skipped（新增 9 case：alerts-view `buildAlertsQuery` 全分支覆盖） + `e2e alerts-rowgroup` 10 passed + 0 skipped（M16.3 baseline 7 passed + 2 skipped → M16.4 10 passed + 0 skipped） + `e2e alerts-fix-now + alerts-sidebar` 5/5 passed（M15/M16.2 utility 复用不破） + `build` 成功（38.3 MB total） + branches coverage 85.44%（远超 80% 阈值） |

#### M16.5 T701-e2e 管理端点集成测试补强 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **auth-self-guard 5 端点 × 自修改防御矩阵单测** | `3072587`（auth-self-guard 单测） | `apps/platform/server/middleware/auth-self-guard.test.ts` 新增 23 case 覆盖 5 better-auth admin 端点（set-role / ban-user / remove-user / impersonate-user / update-user）× {self-target 403 / non-self last-admin 403 / non-self multi-admin 200} 矩阵 + 快速过滤 + no session + body 防御 + target 不存在；共用 `vi.hoisted` 创建 `mockRequireAuth / mockRequireRole / mockRequireOrgResource`，默认 mock 通过 admin，三角色 case 用 `mockImplementationOnce` 切换 |
| **repos / credentials 三角色鉴权单测** | `6889a74`（三角色鉴权单测） | `server/api/{repos,credentials}/{index,[id]}.test.ts` 各增三角色鉴权 describe 块（共 16 case）：viewer GET 通过 / write 403 / admin + org_admin 全通过 / 未登录 401 |
| **三 e2e 闭环（admin / credentials / repos）** | `a6b2b27`（e2e） | `tests/e2e/admin-roles.e2e.test.ts` 3 case：admin 访问 /users 正常 / viewer 重定向到 /dashboard / viewer 调 admin API 403；`tests/e2e/credentials-crud.e2e.test.ts` 6 case：列表脱敏验证（token 不在 DOM + hasToken Tag）/ 创建 / 编辑（token 留空不修改）/ 删除 / 列表分页 / viewer 拒绝；`tests/e2e/repos-crud.e2e.test.ts` 7 case：列表 / 创建 / 编辑 / 删除 / 列表分页 / viewer POST 403 / viewer 访问列表页 |
| **顺手修复 playwright e2eServerEnv ENCRYPTION_KEY 兜底** | `7c28ac8`（playwright 兜底） | `playwright.config.ts:34` 加 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` e2eServerEnv 项——根因 `credential.service.ts:73-76` `getEncryptionKey` 直接读 `process.env.ENCRYPTION_KEY`（不走 runtimeConfig），与 `nuxt.config.ts:61` runtimeConfig `encryptionKey` 错配；已登记 backlog C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（M16.6+ 候选；2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)） |
| **收口 + docs 同步** | `31bed27`（收口 + docs） + `5064fa6`（backlog 登记） | 测试基础设施：`tests/setup-nuxt-server.ts` 加 `getRequestURL` 注入 globalThis（middleware 测试需要）；viewer storageState 复用：`global-setup.ts` 已注册 viewer → `tests/e2e/.auth/viewer.json`，3 个 e2e 用 `browser.newContext({ storageState })` 隔离 context + `__Secure-` cookie 在 HTTP webServer 下手工拼接；e2e DOM 适配：PrimeVue Password id 透传到外层 div（选择器 `div#token input`）/ repos.vue owner-name 两列独立渲染无 `/` 拼接 / DataTable 0 数据不渲染 paginator；A 阶段 standard depth Pass（实际用时 2 分 14 秒 / 0 blocker / 2 warning / 4 suggest 已登记 backlog） |

### 阶段验收标准（M16.1 + M16.2 + M16.3 + M16.4 + M16.5 全部闭环 ✅）

- [x] **M16.1 UX-R3 `/scans` 独立页面 + RepoHistoryDialog 迁移** —— 三种 query 组合可访问 + 汇总卡片 4 块 + 按仓库聚合 + 全运行分页列表渲染 + viewer 可见 + PrimeVue hydration fixme 不新增 + 既有 `alerts-rowgroup` / `history-dialog` / `batch-runs` / `dashboard` 不回归
- [x] **M16.2 C66-D alerts "立即修复此仓库" 入口 + `reuseScanRunId`** —— 一键复用受影响运行直接进入修复链路 + 空 / 不存在 runId 时按钮降级到常规触发 + 不破坏 fixStatus 修复链路与 batch-runs 跨仓库触发
- [x] **M16.3 C36 服务端 API 错误消息 i18n** —— 中文用户接口下错误响应 `message` 字段为中文 + code 保持英文供客户端判断 + 不影响 type=Error 业务路径 + 老客户端忽略未知键保持向后兼容
- [x] **M16.4 PrimeVue hydration 主线 #1 缓解：alerts 加载迁移 useAsyncData** —— 两个 fixme 取消 + `alerts-rowgroup` e2e 全过（首屏默认数据驱动） + 既有 dedupe / 视图切换 / 跨次去重 case 不破 + M15 utility 仍可复用
- [x] **M16.5 T701-e2e 管理端点集成测试补强** —— 测试覆盖到 admin 角色 + viewer 只读边界 + credential 关联仓库 / 凭据泄露验证 + repo 字段校验 + e2e 在 headless 模式下稳定通过 + 覆盖率不下降
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error（仅 2 pre-existing mailer warning 非本批次）
- [x] `vitest` 单测覆盖 + `playwright` e2e 覆盖 —— vitest 853 passed + 4 skipped（baseline 743 + M16.1 10 + M16.2 7 + M16.3 31 + M16.4 9 + M16.5 39 = +88 case；M16.3 baseline 805 → M16.4 814 → M16.5 853 累计 +48 case）+ e2e 累计新增 17 case（M16.1 5 + M16.2 3 + M16.3 7 + M16.5 16 = 31 累计；其中 M16.5 admin-roles 3 + credentials-crud 6 + repos-crud 7 = 16 case + alerts-rowgroup M16.4 baseline 10）
- [x] branches 覆盖率维持 ≥ 80% —— M16.1 baseline 79.93% → 80.27%（CI 阈值回归修复 `acfdc8d8` 后）/ M16.3 85.35% / M16.4 85.44% / M16.5 85.67%（远超 80% 阈值）
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] **不**引入多组织 / 不重写后端聚合 / 不动 `dashboard.vue` latestRun 卡片 / 不动 `batch-runs` 跨仓库视图 / **不**升级 PrimeVue 5 / 不破坏既有 `alerts-rowgroup` / `history-dialog` / 视图切换 / dedupe 行为
- [x] CI 端到端裁决通过 —— 5 轮独立 Review Gate standard depth Pass（M16.1 standard / M16.2 2 轮 standard / M16.3 standard / M16.4 standard / M16.5 standard）+ CI run #33068271005 Coverage 阈值回归修复 `acfdc8d8` 后 80.27% ≥ 80% 阈值

### 阶段治理记录（M16.1 + M16.2 + M16.3 + M16.4 + M16.5）

- **总投入**：19 commits（M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5）；含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次
- **测试覆盖**：vitest 853 passed + 4 skipped（157 files，baseline 743 + M16.1 10 + M16.2 7 + M16.3 31 + M16.4 9 + M16.5 39 = +96 case 累计；e2e 累计新增 17 case + alerts-rowgroup baseline 10 passed + 0 skipped）
- **branches coverage**：M16.1 baseline 79.93% → 80.27%（CI 阈值回归修复后） → M16.3 85.35% / M16.4 85.44% / M16.5 85.67%（远超 80% 阈值）
- **审计覆盖**：M16.1 standard / M16.2 standard 2 轮（RG-B1 终态校验契约冲突 + RG-B2 真实集成测试补强）/ M16.3 standard（4.3 分钟）/ M16.4 standard（8-10 分钟）/ M16.5 standard（2 分 14 秒）—— 全部 Pass
- **ahead commits 实证**：按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范) `git rev-list HEAD ^origin/master --count` 动态核验（2026-08-28 归档操作时实测 ahead=0：19 commits 已全部推送至 origin/master——M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5；ahead 数字动态核验以免 staleness）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M16 段（本段）
  - `docs/plan/todo.md` §M16 任务清单 → M16 已闭环切换（删除 M16 任务清单段 + 顶部 banner 更新）
  - `docs/plan/roadmap.md` M16 段状态更新（已完成 2026-08-28 归档）+ Milestone 概述表 M16 行新增
  - `docs/plan/backlog.md` 历史归档指针段新增 M16 条目 + §扫描历史与详情 UX 段 UX-R3 状态更新（已由 M16.1 闭环）
  - `docs/plan/archive/index.md` 基线更新（M16 归档后）+ 近期归档批次登记新增 M16 行
  - `docs/standards/development.md` §3 注释规范（编号标记扫描硬要求持续生效）

### 关键决策（M16）

**M16.1：**

- **三种 query 参数设计**（`?repository=<id>` / `?severity=<level>` / `?run=<runId>`）：M14.2 UX-R1 已闭环 `/api/runs` 分页 + `ids` 契约 + summary 聚合；三种 query 互不冲突可叠加，便于深度链接；`?run=` 内部 detail dialog 兜底保留 `RepoHistoryDialog.vue`（不删除，保持 `/scans?run=` 入口兼容）
- **viewer 可见"扫描"菜单**：跨次去重是 viewer 必看视图（监控自身仓库告警）；与 M13.4 T1403 dedupe 默认 'across' 决策一致
- **history-dialog.e2e 删除并入 scans.e2e**：避免 `/repos?history=` 路径成为孤儿——单一入口 `/scans` 替代两套路由

**M16.2：**

- **`reuseScanRunId` 区分 queue-mode continuation 与 user-reuse**（RG-B1 修复）：原 ScanRunOptions.reuse 既支持"async 队列后续阶段"又支持"用户主动复用"，两种语义共用一个布尔值导致终态校验契约冲突；改为 `reuseScanRunId?: string` 显式携带 runId（user-reuse）+ `ScanRunOptions.reuse?: boolean` 仅用于 orchestrator 内部 queue-mode continuation；orchestrator 在 user-reuse 时绕过终态校验并 reset finishedAt / errorJson / summaryJson / runUrl + 更新 mode / severityThreshold / executorKind + 清空 ScanResult 子表避免 JOIN 数据不一致
- **清空 ScanResult 子表**（RG-W3 修复）：reuse=true 时若不清空 ScanResult 子表，reused  ScanRun 与既有 ScanResult 通过 repositoryId JOIN 时数据不一致；A 阶段 audit 实证"reset summaryJson 等字段但未清空 ScanResult 子表"是契约漏洞
- **`AlertRunSidebar.vue` 组件抽取**（audit max-lines 触发）：alerts.vue 实施完成后超 800 行触发 lint warning；抽出 `AlertRunSidebar.vue`（含 affectedRunIds 列表 + fix 入口）；alerts.vue 主页面降回 < 800 行
- **`useFixNow` composable**：内部 `useI18n()` + auto-import `navigateTo` 保持 codebase 现有 pattern；fixingRunId / fixError / fixSuccess 三个 ref 独立响应式

**M16.3：**

- **`code` 强契约位置 `data.code`**（h3 1.15 不透传任意顶层字段）：h3 `createError` 不透传任意顶层字段（`sendError` 响应体仅含 `statusCode/statusMessage/data/stack`——实证 `apps/platform/node_modules/h3/dist/index.mjs:64-139`）；改为 `data.code` 强契约位置（前端从 `error.data.code` 读取判断 + `error.data.message` 读取本地化文案）
- **locale 检测优先级 `cookie(i18n_locale) > Accept-Language > 默认 zh-CN`**：与前端 vue-i18n localeDetector.ts:15 既有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **防御性降级 `event.node?.req?.headers` 缺失**（guard.test.ts mock event 形态）：不依赖 h3 `getHeader` / `getCookie`（单测 mock event 无 node.req 时会抛 TypeError）；直接读 `event.node?.req?.headers`，可选链 + typeof 守卫
- **`repos/[id]/scan.post.ts` 是 M16.2 刚改过的文件再动**：本地化 7 处 throw 行为不变；`scan.post.ts:95` 的 `ScanRun.errorJson.message` 是 **type=Error 业务字段**（前端从 ScanRun 读取时按前端 i18n 翻译），按 C36 验收"不影响 type=Error"约束**不**本地化
- **`params` 模板插值接口预留**：当前无 throw 使用（helper 24 case 单测间接验证 no-op 行为）；未来如需 `{minLength: 8}` / `{maxLength: 32}` 等参数化错误可零成本启用

**M16.4：**

- **PrimeVue 4 DataTable rowGroup subheader hydration 状态机分歧**：onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题（CI run 32383730911 alerts-rowgroup rowGroup 测试遗留）
- **迁移到 useAsyncData 让 SSR 阶段具备数据**：最低成本修复路径（vs 升级 PrimeVue 到修复版本监控周期不可控）；SSR 1 次 fetch + payload 复用 + hydration 后 PrimeVue 立即计算 processedData → rowGroup subheader 即时可见（debug 脚本实证 `Group headers after load: 2`）
- **useRequestFetch（Nuxt 4 官方 SSR cookie 转发方案）**：避免 `$fetch` 在 SSR 不转发 cookie 致 auth middleware 401；alerts 页有 auth middleware 必需 session cookie
- **utility 抽取到 utils/alerts-view.ts**（audit suggest 触发）：单一调用方但 audit suggest 触发的 utility 抽取；M16.2 alerts-view 已有基础扩展，9 case 单测覆盖 viewMode 3 态 × filters 字段 × dedupe on/off × 正交组合
- **alerts-rowgroup.e2e.ts 新增 SSR 锁定 test**（反向锁定未来不回退）：hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成；防止未来 refactor 不慎回退 onMounted 异步赋值模式
- **不升级 PrimeVue**（与主线 #1 已知 bug 风险取舍）：升级 PrimeVue 5 涉及 `@primevue/nuxt-module` 5.x + `@primeuix/themes` 3.x 联动升级 + DataTable 等组件用法评估，工作量与风险远大于 useAsyncData 修复路径；登记 backlog §M14.2 PrimeVue 4 → 5 升级评估延期项恢复条件 ② 与主线 #1 联动决策

**M16.5：**

- **三角色鉴权统一模式 `vi.hoisted` + `mockImplementationOnce`**：vi.mock factory hoist 问题通过 `vi.hoisted` 解（`mockRequireAuth / mockRequireRole / mockRequireOrgResource` 在 mock factory 顶层定义）；默认 mock 通过 admin，三角色 case 用 `mockImplementationOnce` 单次切换不影响其他 case
- **auth-self-guard 5 端点 × 自修改防御矩阵**：覆盖 self-target 403 / non-self last-admin 403 / non-self multi-admin 200 三态 × 5 better-auth admin 端点 = 15 矩阵 + 快速过滤 + no session + body 防御 + target 不存在共 23 case
- **ENCRYPTION_KEY 路径错配根因**：credential.service.ts:73-76 `getEncryptionKey` 直接读 `process.env.ENCRYPTION_KEY`（不走 `useRuntimeConfig()`），与 nuxt.config.ts:61 runtimeConfig `encryptionKey` 错配——典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；M16.5 e2e 测试发现 + 临时 playwright.config.ts:34 加 `ENCRYPTION_KEY=` 兜底；已登记 backlog C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（M16.6+ 候选；2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)）
- **viewer storageState 复用**：global-setup.ts 已注册 viewer → tests/e2e/.auth/viewer.json；3 个 e2e 用 `browser.newContext({ storageState })` 隔离 context + `__Secure-` cookie 在 HTTP webServer 下手工拼接
- **PrimeVue Password id 透传到外层 div**：选择器 `div#token input` 而非 input#token（PrimeVue 内部实现把 id 绑到 div 而非 input）
- **scope creep 防范**：跳过 credentials 关联 repos 删除冲突单测（M16.5 验收只要求"关联仓库/凭据泄露验证"，泄露验证已有，关联冲突不强制要求）+ 跳过 /api/users handler 三角色单测（缺 users handler 不存在，audit suggest 登记 M16.6+ 候选 S-4）

### 阶段关键经验（已沉淀至项目知识库）

- **h3 `createError` 不透传任意顶层字段**（强契约位置 `data.code`）：1.15 版本 `sendError` 响应体仅含 `statusCode/statusMessage/data/stack`；透传顶层 `code` 字段需求必须走 `data.code`——实证 `apps/platform/node_modules/h3/dist/index.mjs:64-139`
- **locale 检测单一权威来源**：服务端 locale 检测优先级与前端 vue-i18n localeDetector.ts:15 `tryQueryLocale` 行为对齐（`cookie(i18n_locale) > Accept-Language > 默认 zh-CN`）；防御性降级 `event.node?.req?.headers` 缺失（guard.test.ts mock event 形态兼容）
- **locales 单一权威来源**：字典必须与 i18n 一致，放 `apps/platform/i18n/locales/*.json` 顶层 `serverErrors` 段；helper 通过相对路径 import（避免与 nuxt-i18n 加载冲突）
- **PrimeVue hydration 修复实证**：useAsyncData SSR 1 次 fetch + payload 复用 + hydration 后 PrimeVue 立即计算 processedData → rowGroup subheader 即时可见（debug 脚本实证 `Group headers after load: 2`）
- **三角色 vi.hoisted 模式统一 mock**（M16.5 D 阶段实施）：vi.mock factory hoist 问题通过 `vi.hoisted` 解；`mockImplementationOnce` 单次切换不影响其他 case
- **PrimeVue Password id 透传到外层 div**：选择器 `div#token input` 而非 input#token（PrimeVue 内部实现）
- **playwright `__Secure-` cookie 手工拼接**：HTTP webServer 下 `__Secure-` cookie 不自动发送，需 `page.context().cookies()` 全部取后手工拼接 Cookie header（借鉴 batch/scans e2e 模式）
- **ENCRYPTION_KEY 路径错配根因**：credential.service.ts 直读 `process.env.ENCRYPTION_KEY` 与 nuxtConfig runtimeConfig `encryptionKey` 错配；典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；M16.6+ 候选 C38 标准化路径

### 待迁移经验（next neat-freak 候选）

- **M16.3 audit suggest backlog**：`S1` `SCAN_PENDING_MERG` 当前在字典 + 联合类型 + 测试数据中定义但无 throw 消费（`scan.post.ts:95` 仍写死 `'duplicate_scan'` 与字面中文 message）—— 移除或与前端 ScanRun 错误处理对齐另立独立 code；`S2` `detectServerLocale` 缺 `?locale=` URL query 支持——与 `localeDetector.ts:15` 现有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **M16.3 范围外扩展**：扩展至 `/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`——M16.6+ 候选
- **M16.5 audit suggest backlog**：`S-4` better-auth admin 端点 viewer role check 单测补强（M16.5 audit suggest）——真实缺口在 `ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` viewer 403 路径（缺 users handler 不存在）；新建 `tests/e2e/admin-roles-extra.e2e.test.ts` 双向断言 viewer + admin；`S-2` `authedCookieHeader` 抽取到 `tests/e2e/helpers/`（M16.3 / M16.5 三批次遗留重复，纯重构零风险）
- **M16.5 audit warning backlog**：`W-1` 已迁出为 C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)）
- **M16.5 顺手修复**：playwright.config.ts:34 加 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` e2eServerEnv 兜底——待 C38 标准化路径落地后删除
- **alerts-rowgroup.e2e.ts SSR 锁定 test**：反向锁定未来不再回退 onMounted 异步赋值模式（hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成）
- **PrimeVue hydration 主线 #1 状态更新**：从"暂停"变"已缓解"——useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog + 评估是否升级到修复版本（依赖 backlog §M14.2 PrimeVue 4 → 5 升级评估恢复条件 ② 与主线 #1 联动决策）
- **run-view.ts / alerts-view.ts / buildAlertsQuery utility 抽取 spread**：当前 utility 已有 alerts / scans 等页面复用，下一波抽取候选 batch-runs.vue / repos/[id]/runs.vue / dashboard.vue 等 run-view 字段展示页面
