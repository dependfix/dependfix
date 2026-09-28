# M22: SQLite 数据保护防御加固（分片）

> **2026-09-28 M30 归档批次预防性分片迁出**：本分片包含 M22 阶段（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6）完整实施记录。主窗口 [todo-archive.md](../todo-archive.md) 仅保留导航指针。
> M22 全部 6 原子条目已闭环，commits 已推送 `origin/master`。

---

## M22: SQLite 数据保护防御加固（M22.1+M22.2+M22.3+M22.4+M22.5+M22.6 全部已闭环 / 2026-09-01 归档）

> **归档日期**：2026-09-01
> **阶段摘要**：2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（用户管理账号/仓库/凭据/扫描结果全部丢失）。代码内未找到清空路径（synchronize 失败回滚、e2e fixtures 受门控保护、cleanupStaleRuns 只清理 ScanRun/BatchRun、backfill 只处理 ScanResult），最可能清空来源在代码外部（shell/CI/运维）。事故暴露 5 条可加固设计风险（详见 [经验归档 §五十](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)），按 [规划规范 §1.1 任务粒度约束](../../standards/planning.md) + 类型平衡原则拆 **6 个原子条目独立闭环**（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6）。M22 沉淀（P0，🛡️ 治理）阶段登记 + 事故复盘 + 5 条防御规范挂接 / M22.1（P0，🛡️ 治理）SQLite 启动期自动备份（hard requirement：apps/platform/server/database/backup.ts + ensureDatabaseInitialized 之前同步调用 + fsync/rename 写安全 + 保留策略 + fail-open）/ M22.2（P0，🛡️ 治理）db-restore 命令式恢复（apps/platform/server/database/scripts/db-restore.ts + `--from` + `--yes` 双门控 + 覆盖前自动备份 + 旁文件清理 + 前后 integrity_check）/ M22.3（P1，🛡️ 治理）db-doctor 自检工具（apps/platform/server/database/scripts/db-doctor.ts + 文件元信息 + 10 项 PRAGMA + 各表 COUNT(*) + 索引分类计数 + 六类结论判定 + isInternalTable 排除 sqlite_*/migrations + 人读机读双模 isTTY 切换 + `--json` 强制）/ M22.4（P1，🛡️ 治理）TypeORM synchronize 显式 opt-in + 启动期日志（hard requirement: development.md §5.1.19 反模式禁止）/ M22.5（P1，🛡️ 治理）TypeORM migrationsRun 显式 opt-in + 默认改为 false（与 M22.4 配对完成 synchronize + migrationsRun 双 opt-in）/ M22.6（P1，🛡️ 治理）e2e/fixtures 端点双门控防生产泄漏（hard requirement: platform.md §3.6 + security.md §2.1.4）。
>
> **阶段边界**：M22 严格遵循 [规划规范 §1.1 任务粒度约束](../../standards/planning.md)（6 原子条目 ≤ 6 项硬上限）+ 类型平衡（🛡️ 治理 6 项）；不涉及 TypeORM 0.3.x 升级或 PostgreSQL 迁移（M23/M24 候选）；不引入新依赖；不升级 better-auth / Nuxt；fixtures 仍 mock（真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
>
> **非目标**：不发布 mergify action（仅提供模板 + 文档引导）；不修改 dependfix 自身 PR 提交流程；M22.6 双门控第二门控**不能**用 `process.env.NODE_ENV`（Nitro/esbuild 静态替换陷阱——M22.6 Round 1 audit quick depth + 构建产物 grep 兜底发现并强制修订为 `useRuntimeConfig().e2eFixturesAllowed` + `NUXT_E2E_FIXTURES_ALLOWED` 运行时覆盖通道）。
>
> **状态**：✅ 全部完成（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6 全部 6 原子条目 + 4 docs 闭环登记 commits 共 **9 atomic commits 实施 + 4 docs 收口 commits = 13 commits**；ahead=7 `git rev-list HEAD ^origin/master --count` 2026-09-01 实测：`a4d29bf` M22 沉淀 + `2a31597` M22.1 已推送至 origin/master；`7b8721e` M22.2 + `7b495a7` M22.2 闭环登记 + `5835887` M22.3 + `5cf1b6a` M22.3 路径同步 + `daa255c` M22.4 + `32bb375` M22.5 + `7f84b6e` M22.6 ahead 7 commits（2026-09-01 当时实测，后续已推送 origin/master）；7 轮独立 Review Gate Pass —— M22.4 Round 2 / M22.5 Round 1 / M22.6 Round 2；含 M22.4 Round 1 Reject（migrationsRun 默认值越界落地）后补修 + M22.6 Round 1 Reject（Nitro/esbuild 折叠）后修订为 runtimeConfig 兜底）

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
- [x] 编号标记扫描 0 命中（无孤立 `T\d+` / `M\d+` / `C\d+` 等编号——按 [开发规范 §3 注释规范](../../standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决待推送后核验 —— ahead=7 commits（2026-09-01 当时实测，后续已推送 origin/master；按 AGENTS.md §5 推送禁令）；M22 沉淀 + M22.1 已推送至 origin/master（`git rev-list HEAD ^origin/master --count` 2026-09-01 实测 ahead=7）
- [x] 实施过程中新发现 2 条 wisdom 沉淀——Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱 + atomic commit 边界（提取 const 支撑日志 vs 改 const 计算语义要分清）

### 阶段治理记录

- **总投入**：**9 atomic commits 实施 + 4 docs 收口 commits = 13 commits**（M22 沉淀 `a4d29bf` docs(plan+standards+archive) + M22.1 `2a31597` feat(platform) + M22.2 `7b8721e` feat(platform) + M22.2 闭环 `7b495a7` docs(plan) + M22.3 `5835887` feat(platform) + M22.3 路径同步 `5cf1b6a` docs(standards+plan) + M22.4 `daa255c` feat(platform) + M22.5 `32bb375` fix(platform) + M22.6 `7f84b6e` fix(platform)）
- **测试覆盖**：apps/platform vitest server/ 70 test files passed (2 skipped) / 828 tests passed (7 skipped)；M22.1 backup.test.ts 26 case + M22.3 db-doctor.test.ts 26 case + M22.6 fixtures.post/delete.test.ts 6 case + M22.4/5 index.test.ts 12 case
- **审计覆盖**：3 轮独立 Review Gate Pass —— M22.4 Round 2（Round 1 Reject 后补修：migrationsRun 越界落地 + 补 NODE_ENV=development 回归用例 + 同步 platform.md §3.3）/ M22.5 Round 1 / M22.6 Round 2（Round 1 Reject 后修订 runtimeConfig 兜底 + 构建产物 grep 兜底审计模式）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-09-01 实测 ahead=7（`7f84b6e` + `32bb375` + `daa255c` + `5cf1b6a` + `5835887` + `7b495a7` + `7b8721e` 7 commits 当时待推送（后续已推送 origin/master））；M22 沉淀 + M22.1 已推送至 origin/master
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
> - **未落地（根因排查）**：登记 M23 阶段规划 backlog 候选（按 ROI 排序）：① better-auth 1.7 transaction 关闭时序 → `getAuth()` 加 trace 日志 + `ds.transaction` 包装打印 begin/commit 时间戳（M27.5 commit `b252f93` feat(platform) 已落地 better-auth transaction trace 诊断基础设施——`AUTH_TRACE=1` / `E2E_TEST=true` 双开关，待 CI 复现一次确认是否仍存在 ECONNRESET）；② Nitro h3 `defineEventHandler` async generator 行为（**2026-09-03 M24.2 commit `bbb8f30` 闭环**——源码判定非根因：`apps/platform/server/api/e2e/fixtures.{post,delete}.ts` 均为 `async (event) => {}` 普通 async function 非 `async function*`；h3 `_callHandler` 走 `await handler(event)` 返回 `Promise<value>`；详见 [经验归档 §五十七 M24.2 候选 ②](../../design/governance/experience-archive-§49-§57-recent-investigation.md)）；③ SQLite WAL 模式 + `journalMode=delete` 切 WAL + `busy_timeout` 消解并发事务持锁（**2026-09-02 M23.1 commit `2ffaa45` 闭环**——落地 WAL + busy_timeout 优化）；④ fixtures API 请求间 100ms 节流（**2026-09-03 M24.2 commit `bbb8f30` 判定"fixtures handler 无节流靠 global-setup 串行调用避免并发"**——经验性方案登记 follow-up：调用频次低 ≤ 2 次不存在资源竞态；如未来 e2e 复现 fixture 并发问题按经验性模板 `apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流；详见 [docs/standards/platform.md §3.7.1 fixtures API 无节流默认 + 经验性节流方案](../../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)）

> **验证**：
> - lint / typecheck exit 0
> - vitest 6/6 fixtures 单测 + 全量 1001/1008 passed
> - A 阶段 review quick depth Round 1 Pass（0 blocker，1 warning JSDoc 精度 + 1 suggest 经验沉淀，已 Round 2 修订 JSDoc 描述"仅对 ECONNRESET 重试"，suggest 跨轮次追溯由经验归档 §五十一承接）
> - 本地复现脚本 `repro-e2e-fixtures.mjs`：auth + DELETE + POST fixtures 串行通过；server 进程稳定存活

> **关键决策**：
> - **helper 层而非 handler 层**：maxRetries 是客户端行为，server 不感知；保持 handler 单元测试 0 改动；本地 / CI 行为等价
> - **兜底修复 + 根因 backlog 分离**：避免"无限本地复现"陷阱（CI 独有环境组合无法本地稳定复现），接受兜底修复 + 根因登记 M23 候选

> **关键经验（已挂 wisdom.md）**：新增 `pattern-playwright-maxRetries-econnreset` —— Playwright 1.62 `_sendRequestWithRetries` 仅对 `e.code === 'ECONNRESET'` 触发 250ms 指数 backoff 重试（其他网络错误码不重试）+ test helper 兜底模式。详见 [经验归档 §五十一](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十一e2e-global-setup-串行多次-setuppage-后首请求-econnreset2026-09-01ci-run-33525721103)（含完整 4 假设穷举 + 修复方案 + 4 项治理检查点登记）

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
> - **未落地（根因排查）**：登记 M23 阶段规划排查（按 ROI 排序）：① Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证（**2026-09-02 M23.2 commit `09c3dee + e0f9b29` 闭环**——workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯 + helper 抽取落地 `apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）；② better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描（**2026-09-11 M28.5 commit `d7289df` 闭环**——实证 better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie + 项目代码无显式 setCookie 调用，M22.8 follow-up ② 实证无影响；CI 偶发场景下 helper 层兜底保留）；③ Playwright 1.62 vs 1.61/1.60 fixture pool 行为对比（**已因 Playwright 1.62 → 1.63 升级场景变更而失效**——改为持续观察 1.63 fixture pool 行为是否仍存在跨 scope 隐式传播，待 CI 偶发场景复现时同步验证）

> **验证**：
> - `pnpm exec eslint tests/e2e/{credentials-api,repos-api}.e2e.test.ts` exit 0
> - `pnpm exec tsc --noEmit` exit 0
> - `pnpm test` exit 0（1001 passed / 7 skipped）
> - A 阶段 quick depth Round 1 Pass（0 blocker / 1 warning hotfix 任务编号登记 / 2 suggest 注释长度 + helper 抽取）
> - 本地复现脚本：fresh context + 空 cookies → 401 ✓
> - CI run 33533376712 修复（已推送 origin/master）后下次 CI 验证

> **关键经验（已挂 wisdom.md）**：新增 `pattern-playwright-browser-newContext-cookie-injection` —— Playwright 1.62 `test.use({ storageState })` 在 describe 块内可能通过 fixture pool 传播到所有 `browser.newContext()` 调用（即使新 context 未指定 storageState）；"未认证 API 调用"测试必须显式传 `storageState: { cookies: [], origins: [] }` 强制隔离。详见 [经验归档 §五十二](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十二playwright-testuse-存储状态传染导致未认证api-测试收到-2002026-09-02ci-run-33533376712)。

---
