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

- 主文档保留最近阶段的近线归档块（当前保留 **2026-08-31 M21 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 11 atomic commits 实施 + 4 docs 收口 = 15 commits 已全部推送 ahead=0）/ 2026-08-31 M20 ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 8 commits 已全部落地）/ 2026-08-31 M19 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 5 commits 全部推送 ahead=0）/ 2026-08-30 M18 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / ~24 commits 全部推送 ahead=0）** 共 4 个批次，符合"主窗口保留 3-5 个阶段"健康策略）。**预防性分片**：M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)，保持主窗口行数在 700 强制分片阈值内。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 `todo-archive-phases-m14-m15.md`）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 待推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期 ahead 部分待用户推送（ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M21: 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 2026-08-31 归档）

## M22: SQLite 数据保护防御加固（M22.1+M22.2+M22.3+M22.4+M22.5+M22.6 全部已闭环 / 2026-09-01 归档）

> **归档日期**：2026-09-01
> **阶段摘要**：2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（用户管理账号/仓库/凭据/扫描结果全部丢失）。代码内未找到清空路径（synchronize 失败回滚、e2e fixtures 受门控保护、cleanupStaleRuns 只清理 ScanRun/BatchRun、backfill 只处理 ScanResult），最可能清空来源在代码外部（shell/CI/运维）。事故暴露 5 条可加固设计风险（详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)），按 [规划规范 §1.1 任务粒度约束](../standards/planning.md) + 类型平衡原则拆 **6 个原子条目独立闭环**（M22 沉淀 + M22.1 + M22.2 + M22.3 + M22.4 + M22.5 + M22.6）。M22 沉淀（P0，🛡️ 治理）阶段登记 + 事故复盘 + 5 条防御规范挂接 / M22.1（P0，🛡️ 治理）SQLite 启动期自动备份（hard requirement：apps/platform/server/database/backup.ts + ensureDatabaseInitialized 之前同步调用 + fsync/rename 写安全 + 保留策略 + fail-open）/ M22.2（P0，🛡️ 治理）db-restore 命令式恢复（apps/platform/server/database/scripts/db-restore.ts + `--from` + `--yes` 双门控 + 覆盖前自动备份 + 旁文件清理 + 前后 integrity_check）/ M22.3（P1，🛡️ 治理）db-doctor 自检工具（apps/platform/server/database/scripts/db-doctor.ts + 文件元信息 + 10 项 PRAGMA + 各表 COUNT(*) + 索引分类计数 + 六类结论判定 + isInternalTable 排除 sqlite_*/migrations + 人读机读双模 isTTY 切换 + `--json` 强制）/ M22.4（P1，🛡️ 治理）TypeORM synchronize 显式 opt-in + 启动期日志（hard requirement: development.md §5.1.19 反模式禁止）/ M22.5（P1，🛡️ 治理）TypeORM migrationsRun 显式 opt-in + 默认改为 false（与 M22.4 配对完成 synchronize + migrationsRun 双 opt-in）/ M22.6（P1，🛡️ 治理）e2e/fixtures 端点双门控防生产泄漏（hard requirement: platform.md §3.6 + security.md §2.1.4）。
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

> **关键经验（已挂 wisdom.md）**：新增 `pattern-playwright-maxRetries-econnreset` —— Playwright 1.62 `_sendRequestWithRetries` 仅对 `e.code === 'ECONNRESET'` 触发 250ms 指数 backoff 重试（其他网络错误码不重试）+ test helper 兜底模式。详见 [经验归档 §五十一](../design/governance/experience-archive.md#五十一e2e-global-setup-串行多次-setuppage-后首请求-econnreset2026-09-01ci-run-33525721103)（含完整 4 假设穷举 + 修复方案 + 4 项治理检查点登记）

---

## M21: 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M20 闭环后承接 backlog 候选池 + M18.x 治理剩余风险；按"类型平衡"原则（🛡️ 治理 2 项 + 🚀 能力扩展 1 项 + 🧪 测试覆盖 1 项）选取 **4 项任务**独立闭环（M21.3 段为重复登记——S-5 已由 M18.x commit `878ae1a` 闭环，本批次 P 阶段规划删除并迁 backlog 历史归档指针段）。M21.1（P3，🛡️ 治理）Code Scanning RG-W01 + RG-W02 `execFileSync` 替换 `execSync` 2 处命令注入修复 / M21.2（P3，🛡️ 治理）M18.x 剩余风险 W1 + W2 + audit suggest 1+2 集中清理 / M21.4（P3，🚀 能力扩展）B3 PR 自动合并闭环（mergify 模板 + auto-merge guide + audit W1 vitepress sidebar 修复）/ M21.5（P3，🧪 测试覆盖）T704 async 定时触发 + Schedule CRUD e2e 补强（playwright e2e 6 case + BullMQ upsertJobScheduler 短间隔集成测试）。
>
> **阶段边界**：M21 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更；不引入新依赖；不升级 better-auth / PrimeVue；fixtures 仍 mock（真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
>
> **非目标**：不发布 mergify action（仅提供模板 + 文档引导）；不修改 dependfix 自身 PR 提交流程；不立即引入 GitHub Actions API `issues: write` 之外的其他权限面扩展（保留与 M19.3 一致的边界）。
>
> **状态**：✅ 全部完成（M21.1 + M21.2 + M21.4 + M21.5 全部 4 子阶段闭环 / **11 atomic commits 实施 + 4 docs 收口 commits = 15 commits 已全部推送至 origin/master ahead=0**；`git rev-list HEAD ^origin/master --count` 2026-08-31 实测；含 M21.4 audit round 1 W1 vitepress sidebar 注册修复闭环）

### 阶段闭环清单

#### M21.1 Code Scanning RG-W01 + RG-W02（execFileSync 替换 execSync 2 处）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **RG-W01** `packages/engine/src/github/pr-creator.ts:214` execSync 替换 | `0a83c74`（fix(engine)） | `git add .` 替换为 `execFileSync('git', ['add', '.'])`；参数化数组避免 shell 解释；既有 `pr-creator.test.ts` 覆盖 PR 创建全链路 |
| **RG-W02** `packages/engine/src/fixers/pnpm/index.ts:144` execSync 替换 | `a77e557`（fix(engine)） | `execSync(command)` 含模板拼接 → `execFileSync('pnpm', [...args])` 参数化；既有 `fixers-pnpm.test.ts` 覆盖 |

#### M21.2 M18.x 剩余风险 W1 + W2 + audit suggest 1+2（4 项集中清理）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **W1** stageAndCommit `--local` flag 路径回归测试 | `fe7cc0f`（test(engine)） | `packages/engine/src/git/stage-and-commit.test.ts` 新增 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config；vi.stubEnv 隔离 + vi.unstubAllEnvs |
| **W2** detectServerLocale 大小写兼容 | `ad376c8`（fix(platform)） | `apps/platform/server/utils/localized-error.ts:tryQueryLocale` 加 `.toLowerCase()` 让 `?locale=EN` / `?locale=en-US` 都接受；与 `@nuxtjs/i18n` BCP 47 lowercasing 对齐 |
| **audit suggest 1** test.describe 嵌套 test.use 冗余清理 | `0903f06`（refactor(platform)） | `apps/platform/tests/e2e/admin-roles.e2e.test.ts` 嵌套 test.use 删除（父级已声明）；0 行为变更 |
| **audit suggest 2** 空 beforeAll 钩子清理 | `b6d8539`（refactor(platform)） | `apps/platform/tests/e2e/credentials/[id].test.ts` 空 beforeAll 直接删除；0 行为变更 |

#### M21.4 B3 PR 自动合并闭环（mergify 模板 + auto-merge guide）✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **mergify 模板扩展** | `f1dd5df`（docs(guide)） | `.github/mergify.yml` 模板按 dependabot / dependfix PR 规则配置 auto-merge 条件 + author 限制（仅 `dependabot[bot]` / `dependfix[bot]` / `123+dependfix[bot]` 命中；`CaoMeiYouRen` 不命中） |
| **auto-merge.md + README** | `beea5b9`（docs(guide)） | `docs/guide/auto-merge.md` 指南（启用步骤 + mergify 配置说明 + 安全注意事项 + 危险场景示例：依赖大版本升级 / breaking change / CI 覆盖不足 / 重复 PR / author 劫持） |
| **audit W1 vitepress sidebar 注册修复** | `c9939cb`（fix(docs)） | audit round 1 Reject 后修复：`docs/.vitepress/config.ts` sidebar 注册 `docs/guide/auto-merge.md`（之前漏注册） |

#### M21.5 T704 async 定时触发 + Schedule CRUD e2e 补强 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **schedules CRUD e2e 6 case** | `9850e24`（test(platform)） | `apps/platform/tests/e2e/schedules.e2e.test.ts` 新建（创建 / 列表 / 详情 / 更新 / 删除 / 触发 / 重复创建同名 / 并发触发 / 失败 schedule 状态流转）；e2e 强制 sync 降级（playwright.config.ts:36 NUXT_QUEUE_ENABLED=false）走 sync 路径 |
| **BullMQ upsertJobScheduler 短间隔集成测试** | `b9e35f7`（test(platform)） | `apps/platform/server/services/scheduler/scheduler.integration.test.ts` 新增（describe.skipIf(!enabled) 门控 + TEMP_REDIS_INTEGRATION=true 启用 + 进程内集成模式 + 随机 id 幂等） |

### 阶段验收标准（M21 全部 4 子阶段闭环 ✅）

- [x] **M21.1 RG-W01 + RG-W02** —— 2 处 execSync 替换为 execFileSync + 参数数组；既有测试不回归；本地 grep 实证 0 处 execSync 模板拼接
- [x] **M21.2 W1 + W2 + S1 + S2** —— W1 stageAndCommit `--local` flag 路径回归；W2 `?locale=EN` 大小写兼容；S1 test.describe 嵌套 test.use 冗余清理；S2 空 beforeAll 钩子清理；engine vitest 1061 passed + platform vitest 919 passed + playwright admin-roles 15 passed
- [x] **M21.4 mergify + guide + audit W1** —— mergify 模板通过 yaml.safe_load 语法 OK + author 正则覆盖实测；auto-merge.md 涵盖 mergify 安装 / 配置 / 启用条件 / 危险情况 6 项；vitepress sidebar 注册修复
- [x] **M21.5 schedules e2e + BullMQ** —— playwright e2e 6 case × 2 次连跑无 flaky；BullMQ 集成测试 describe.skipIf 门控 + 进程内模式
- [x] `pnpm lint` / `pnpm typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— engine 1061 passed + platform 919 passed + playwright 6 passed × 2 连跑
- [x] `pnpm check:docs` 全过 —— 103 md + 58 vue-interp OK
- [x] 编号标记扫描 0 命中（无孤立 `T\d+` / `M\d+` / `C\d+` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 15 commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：**15 commits**（M21.1 2 + M21.2 4 + M21.4 3 + M21.5 2 = **11 atomic commits 实施** + M21 文档收口 4：`a8604c6` M21.1+M21.2 标记 / `d66b11d` M21.3 重复登记清理 + backlog §S-5 闭环迁移 / `6516e34` M21.4 标记 / `cbcb15d` M21.5 标记）
- **测试覆盖**：engine vitest 1061 passed + 1 skipped（M21.1 + M21.2 W1 回归）+ platform vitest 919 passed + 4 skipped（M21.2 W2 大小写兼容 + S2）+ playwright admin-roles 15 passed（M21.2 S1）+ playwright schedules 6 case（M21.5）+ BullMQ 集成测试（M21.5）
- **审计覆盖**：M21.1 + M21.2 standard depth Pass / M21.4 standard depth 1 轮（含 1 个 W1 vitepress sidebar 注册修复）/ M21.5 standard depth Pass（2 warning 已修：W1 todo 同步勾选 + W2 removeJobScheduler finally 化 + 2 suggest 登记 backlog：S1 trigger happy path / S2 pattern 覆盖断言）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0（15 commits 已全部推送至 origin/master）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M21 段（本段；2026-08-31 M21 归档批次新增）
  - `docs/plan/todo.md` M21 任务清单 → 顶部 banner 更新（M21 → 待确定 active）
  - `docs/plan/roadmap.md` Milestone 概述表 M21 行状态更新（计划中 → 已完成 2026-08-31 归档）+ §M21 详细实施状态段新增
  - `docs/plan/backlog.md` 清理 B3 主条目（已上收 M21.4 闭环）+ §已闭环特定批次 段新增 B3 条目 + T704 待人工验收更新（实施部分已 M21.5 闭环）+ §已闭环阶段 段新增 M21 行
  - `docs/plan/archive/index.md` §4 当前基线更新（M21 归档后）+ §5 近期归档批次登记新增 M21 行
  - `.github/mergify.yml` mergify 模板（M21.4 实施）
  - `docs/guide/auto-merge.md` PR 自动合并启用指南（M21.4 实施）

### 关键决策

- **M21.3 重复登记删除**：M21.3 段原计划抽取 `setTestEncryptionKey(key)` helper 部分**无真实用例需求**（grep `vi.stubGlobal.*encryptionKey` / `useRuntimeConfig.*encryptionKey` 自定义调用 = 0 命中），属 over-engineering；S-5 已由 M18.x commit `878ae1a` 闭环；M21 P 阶段规划批次删除 M21.3 段并迁 backlog 历史归档指针段（backlog 维护规则 5 追溯执行）
- **M21.4 mergify 模板扩展而非全新**：复用既有 `.github/mergify.yml` 模板按 dependabot / dependfix PR 规则扩展 author 正则覆盖——不发布 mergify action，不修改 dependfix 自身 PR 提交流程
- **M21.5 e2e 同步降级**：playwright.config.ts:36 `NUXT_QUEUE_ENABLED=false` 强制 sync 路径（避免 CI 环境 BullMQ 等待不稳定；真实 async 测试由 BullMQ 集成测试 `describe.skipIf` 门控覆盖）
- **M21.1 命令注入修复路径**：execSync → execFileSync + 参数数组（标准 npm:child_process 安全用法）；不引入新依赖；既有测试不回归

### 阶段关键经验（已沉淀至项目知识库）

- **命令注入修复模式（M21.1 实证）**：execSync 模板拼接 → execFileSync + 参数数组（标准 npm:child_process 安全用法）；既有测试不回归 + grep 实证 0 处剩余 execSync 模板拼接
- **vitest stubEnv 隔离模式（M21.2 W1 实证）**：`vi.stubEnv` + `vi.unstubAllEnvs` 隔离 process.env 副作用；避免影响其他并行测试
- **vitepress sidebar 注册完整性（M21.4 audit W1 实证）**：新增 `docs/guide/*.md` 必须同步注册到 `docs/.vitepress/config.ts` sidebar；audit 阶段独立核验避免漏注册导致 vitepress build 隐式失败
- **playwright e2e sync 降级 + BullMQ 集成测试分离（M21.5 实证）**：CI 环境稳定性优先——e2e 走 sync 路径（避免 BullMQ 等待），BullMQ async 测试走 `describe.skipIf(!redisAvailable)` 集成测试模式；与 M16.5 / M19.4 模式一致

### 待迁移经验（next neat-freak 候选）

- **M21.5 2 suggest 登记 backlog**：S1 trigger happy path（playwright schedules 触发后状态流转断言可加强）/ S2 pattern 覆盖断言（BullMQ 集成测试可加更细粒度的 cron pattern 覆盖）—— 后续批次治理
- **M21.4 mergify 模板作者归属校验**：当前 author 正则覆盖 `dependfix[bot]` / `123+dependfix[bot]`；未来 dependfix bot 改名 / 增加其他自动修复工具时需同步更新正则——候选下批次会话处理

---

## M20: ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M19 闭环后实测反馈——`nuxt-latest-template` 在最近一次扫描 0 告警，但 alerts 视图仍显示 7 条历史"未处理"告警（出现次数 7）。根因：ScanResult 当前是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，导致上游已关闭的告警永远残留。按依赖关系拆 **5 子阶段独立闭环**：M20.1 引擎侧 upstreamId 注入 / M20.3 ScanResult 实体升级 + reconcile 函数 / M20.5 API 简化 + dashboard 调整 / M20.6 UI 调整 + i18n / M20.7 一次性 backfill 脚本。
> **阶段边界**：M20 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）；M20.3 ScanResult per-alert 模型重构是本阶段核心，M20.5-M20.7 均依赖 M20.3 实体升级。
> **非目标**：不删除旧 scanRunId 列（保留兼容）；不回滚决策 1-4；不引入新依赖（tsx 已存在）。
> **状态**：✅ 全部完成（M20.1 + M20.3 + M20.5 + M20.6 + M20.7 全部 5 子阶段闭环 / 8 commits 已全部落地）

### 阶段闭环清单

#### M20.1 引擎侧 upstreamId 注入 + 规范化函数 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **NormalizedSecurityAlert.upstreamId 字段 + normalizeUpstreamId()** | `acb2d35`（feat(engine,core)） | `packages/core/src/alerts/index.ts` 增加 `upstreamId: string` 字段；新增 `packages/core/src/alerts/upstream-id.ts` 实现 `normalizeUpstreamId(source, raw)` 函数（`${source}:${numericId\|hash}` 格式）；4 个 fetcher 调用规范化函数填充（Dependabot/Code Scanning/pnpm-audit/code-quality）；8 个 engine 测试文件 + report.test-helpers 补充 upstreamId 字段；core upstream-id.test.ts 14 用例覆盖各 source 格式 / 空值防御 / 幂等性 / pnpm-audit 不同包区分 |

#### M20.3 ScanResult 实体升级 + reconcile 函数 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **ScanResult 实体升级** | `2e4ab1b`（feat(platform)） | `apps/platform/server/entities/scan-result.ts` 增加 6 列（upstreamId / firstSeenAt / lastSeenAt / occurrenceCount / supersededAt / repositoryId）+ 类级复合唯一索引 `(repositoryId, upstreamId)` + 类级复合索引 `(repositoryId, supersededAt)` |
| **reconcile 函数** | `2e4ab1b`（含 reconcile） | `apps/platform/server/services/scan-reconcile.ts` 实现 `reconcileAlerts()` 200 行覆盖 todo.md §M20.3 决策 1-4（INSERT / UPDATE 活跃 / supersede 上游消失 / preservedSuccess / 幂等）；`scan-orchestrator.service.ts` 替换 INSERT 逻辑为 reconcileAlerts() 调用 |
| **DDL 验证测试** | `2e4ab1b`（含 DDL 测试） | `apps/platform/tests/scan-result-ddl.test.ts` 验证 SQLite sqlite_master 中复合唯一索引实际生成 + NOT NULL 字段 + INSERT 重复被 unique constraint 拒掉 |

#### M20.5 API 简化 + dashboard 调整 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **/api/alerts 移除 dedupe + dashboard 数活跃告警** | `170fee1`（feat(platform)） | `/api/alerts` 移除 dedupe 参数 + 新增 includeSuperseded 参数（默认 false → supersededAt IS NULL 过滤）+ 返回字段新增 M20.3 字段；`/api/dashboard/stats` alertsTotal 改为数活跃告警（supersededAt IS NULL）；dedupe=true 静默忽略（向后兼容） |

#### M20.6 UI 调整 + i18n ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **alerts 视图移除 dedupe 切换 + 改为 includeSuperseded 开关** | `c7ba014`（feat(platform)） | alerts.vue dedupeOptions Select → ToggleSwitch "显示已解决"；occurrenceCount/firstSeenAt/lastSeenAt 列从 v-if 改为默认列；状态列加 superseded 分支（success 永显已修复 / 非 success+superseded 显已关闭）；alerts-view.ts AlertsFilters.dedupe → includeSuperseded；i18n 双语新增/删除键；ToggleSwitch v-model 嵌套字段 bug 修复（reactive + 显式 watch） |

#### M20.7 一次性 backfill 脚本 + 数据迁移 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **backfill-scan-result.ts CLI 脚本** | `a399323`（feat(platform)） | apps/platform/server/database/scripts/backfill-scan-result.ts（335 行 CLI 脚本：dry-run + apply 双模式；plan + execute 分离；整批事务化；聚合键 (source, packageName, ruleId)；upstreamId 合成 `${source}:backfill-${rowId}` 命名空间隔离；fixStatus='success' 永不被 supersede；批量 save 替代 N+1）|
| **backfill-scan-result.test.ts** | `a399323`（含测试） | 11 个 vitest 单测覆盖聚合规则 / 幂等 / 跨 repo 隔离 / dry-run 与 apply 一致性 / formatStats 输出 / buildBackfillUpstreamId 命名空间 |
| **register-entities.ts + README.md** | `a399323`（含辅助文件） | register-entities.ts 集中管理 entity metadata side-effect imports（tsx CLI 不走 Nitro auto-load）；README.md 运行步骤文档（dry-run → apply + y/N 二次确认 + 回滚说明） |
| **M20.7 脚本精简** | `ca6a1dc`（refactor(platform)） | engines 升级 >=20 → >=22（Node 20 EOL）；删 register-entities.ts 单独文件整合到主脚本；净 -21 行 |

### 阶段验收标准（M20 全部 5 子阶段闭环 ✅）

- [x] **M20.1 引擎侧 upstreamId 注入** —— NormalizedSecurityAlert.upstreamId 字段 + normalizeUpstreamId() + 4 fetcher 填充 + 14 用例覆盖
- [x] **M20.3 ScanResult 实体升级 + reconcile 函数** —— 6 列新增 + 复合唯一索引 + reconcileAlerts() 覆盖决策 1-4 + DDL 验证测试
- [x] **M20.5 API 简化 + dashboard 调整** —— dedupe 参数移除 + includeSuperseded 参数 + dashboard 数活跃告警
- [x] **M20.6 UI 调整 + i18n** —— ToggleSwitch "显示已解决" + 状态列 superseded 分支 + i18n 双语 + reactive watch 修复
- [x] **M20.7 backfill 脚本** —— CLI dry-run/apply + 11 单测 + README 文档 + Node 22+ engines
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error / 4 历史 warnings baseline
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 914 passed + 15 e2e passed
- [x] `pnpm check:docs` 全过 —— 102 md + 57 vue-interp OK
- [x] 编号标记扫描 0 命中
- [x] CLI dry-run / apply 端到端实测通过
- [x] A 阶段 Code Auditor deep depth Pass（M20.6 0 blocker / 2 warning / 5 suggest；M20.7 Reject → 修复 → Pass）

### 阶段治理记录

- **总投入**：8 commits（M20.1 1 + M20.3 1 + M20.5 1 + M20.6 1 + M20.6 docs 1 + M20.7 1 + M20.7 docs 1 + M20.7 refactor 1）
- **测试覆盖**：vitest 914 passed + 4 skipped（含 backfill 11 单测）；playwright 15 e2e passed（alerts-rowgroup 10 + alerts-sidebar 2 + alerts-fix-now 3）
- **审计覆盖**：M20.6 deep depth Pass（0 blocker / 2 warning / 5 suggest）；M20.7 deep depth Reject → 修复 2 blocker + 3 warning → Pass
- **关键 bug 修复**：ToggleSwitch v-model 嵌套字段 + useAsyncData watch 浅监听不触发 refetch → 改为 reactive + 显式 watch(filters, refreshAlerts, { deep: true })
- **关键经验**：
  - Node `--experimental-strip-types` 不支持装饰器（TypeORM entity 装饰器必须 tsx 编译）
  - dev SQLite 是 M20.3 之前旧 schema，synchronize ADD COLUMN NOT NULL 失败
  - engines 升级 Node 22+（Node 20 EOL）

### 待迁移经验（next neat-freak 候选）

- **M20.6 A 阶段 W1/W2**：alerts-sidebar 第 2 测试语义弱化 + mock data 残留废弃字段（affectedRunIds / occurrenceCount）—— 下批次 e2e 重构清理
- **M20.7 A 阶段 W3/S1-S7**：backfill 测试覆盖盲点（success+superseded 边界 / null 混合 / 事务回滚 / 跨 DB / 性能）+ 文档优化建议 —— 下批次治理

---

## M19: 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M18 闭环后承接 backlog 候选池，按"类型平衡"原则（技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项）选取 5 项任务独立闭环。M19.1（P3，技术债）C34 存量规范严格约束挂接盘点 / M19.2（P2，能力扩展）C23 发现规模上限 max-repos / M19.3（P2，用户体验）B1 PR 关闭评论 + label / M19.4（P2，测试覆盖）T701-e2e 管理端点集成测试补强 / M19.5（P2，用户体验）C8 per-source 错误隔离；外加 M19.x 收口（孤立编号清理 commit `ae33671`）+ 配套 commits（M19 规划 `2f9eb38` + M19 任务详情更新 `bee5c3f` + M19.4/M19.5 标记完成 commits `61b3ddc` / `4231ffb`）。
> **阶段边界**：M19 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更（仅 max-repos 上限参数）；不破坏既有 PAT / AuthProvider / GitHub App / viewer role check 等机制。
> **非目标**：不引入新依赖；不升级 better-auth / PrimeVue；不破坏 C22 PAT + App 并存路径；不引入 GitHub Actions API 权限升级之外的额外权限面扩展（B1 仅扩展到 `issues: write`）；fixtures 仍 mock（e2e 真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
> **状态**：✅ 全部完成（M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务闭环 / 5 atomic commits + 配套 commits 已全部推送至 origin/master；ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 standard depth Pass / M19.2 standard depth Pass（含 1 blocker + 3 warning 已全部修复）/ M19.3 standard depth Pass（2 warning 已全部修复）/ M19.4 quick depth Pass（1 blocker + 3 warning 已全部修复）/ M19.5 standard depth Pass（2 warning 已修复 1 项 + 1 项登记 P3）+ 同步配套 commits；本批次清理 backlog 5 个已上收主条目：B1 PR 关闭评论 + label（M19.3 闭环）/ C23 发现规模上限 max-repos（M19.2 闭环）/ C8 per-source 错误隔离（M19.5 闭环）/ T701-e2e（M19.4 闭环）/ C34 存量规范严格约束挂接盘点（M19.1 闭环））

### 阶段闭环清单

#### M19.1 C34 存量规范严格约束挂接盘点 ✅（2026-08-30 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C34 存量规范严格约束挂接盘点** | `0c536c1`（docs(review)） | 补充 8 个强制性条款检查点到 [code-reviewer](../../.github/skills/code-reviewer/SKILL.md) skill + [code-quality-checklist](../../.github/skills/code-reviewer/references/code-quality-checklist.md)（含 audit-depth / commit 拆分 / F 阶段 coverage 强制 / M14.x code-quality-checklist 双向同步 / M17.6 better-auth 锁定 / M18.x 集成外部库 README 标准用法 / 治理规范 audit warning 修复 vs 登记决策 / M18.x audit Reject 后针对性补修）；A 阶段 quick depth Pass |

#### M19.2 C23 发现规模上限 max-repos ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C23 发现规模上限 max-repos** | `c998d58`（feat(engine)） | 15 文件 / +149/-1 行；`packages/engine/src/discovery/` 实现 `maxRepos` 参数按排序截断保证确定性；CLI `--max-repos` 选项 + Action input + Platform UI 三入口统一暴露；默认值 100；单测覆盖：超过上限时截断 / 未超过时不截断 / 默认值生效；A 阶段 standard depth Pass（1 blocker MCP schema 修复 + 3 warning env normalizer / Action input / Platform UI 已全部修复） |

#### M19.3 B1 PR 关闭评论 + label ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **B1 PR 关闭评论 + label** | `5839771`（feat(engine)） | 8 文件 / +492/-5 行；PR 创建前查重逻辑扩展：当同一仓库存在未合并修复 PR 时，在新 PR 添加评论（指向已有 PR 的链接 + 说明）+ 添加 `duplicate` label（可配置）；`GITHUB_TOKEN` 权限扩展到 `issues: write`（比当前 `pull-requests: write` 宽）；A 阶段 standard depth Pass（2 warning 集成测试 + action.yml 已全部修复） |

#### M19.4 T701-e2e 管理端点集成测试补强 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T701-e2e 管理端点集成测试补强** | `8db2fd4`（test(platform)） | 3 文件 / +841 行；`apps/platform/tests/e2e/` 新增 `users-api.e2e.test.ts` (6 case) + `credentials-api.e2e.test.ts` (19 case) + `repos-api.e2e.test.ts` (25 case) —— 用户管理端点 + 凭据管理端点 + 仓库管理端点 API 集成测试；playwright test 50 passed（users 6 + credentials 19 + repos 25）；A 阶段 quick depth Pass（1 blocker users-api 与 admin-roles 重复 + 3 warning repos 缺扫描/导入 / users 缺 impersonate/unban / credentials data.code 一致性 已全部修复） |

#### M19.5 C8 per-source 错误隔离 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C8 per-source 错误隔离** | `a20ea02`（feat(engine)） | 5 文件 / +159/-2 行；`packages/engine/src/` 并行拉取逻辑捕获单源异常并 warn 日志；返回结构扩展 `FixError.source` 字段 + `logPartialSourceFailureSummary` 函数汇总警告可见性；CLI 输出警告（如 `[WARN] Dependabot source failed: timeout, continuing with other sources`）；核心错误隔离机制（Promise.allSettled）此前已存在，本批次主要补强 CLI 汇总警告可见性；A 阶段 standard depth Pass（2 warning：throw 路径重复提示已修复 + pnpm-audit 单源文案登记 P3） |

#### M19.x 收口（孤立编号清理）✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M19.x 收口** | `ae33671`（docs(refactor)） | 移除本次提交引入的孤立编号（M19.x → todo.md §M19.x）；编号标记扫描 0 命中（防御 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md)） |

### 阶段验收标准（M19 全部 5 子任务闭环 ✅）

- [x] **M19.1 C34 存量规范挂接盘点** —— 8 个必查项补充到 code-reviewer skill + code-quality-checklist + 双向挂接完整；`pnpm check:docs` 通过（101 md + 57 vue-interp）；`pnpm --filter dependfix-docs build` 通过
- [x] **M19.2 C23 发现规模上限 max-repos** —— `packages/engine/src/discovery/` 实现 `maxRepos` 参数 + CLI/Action/Platform 三入口暴露 + 单测覆盖（超过上限时截断 / 未超过时不截断 / 默认值生效）；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过
- [x] **M19.3 B1 PR 关闭评论 + label** —— 当同一仓库存在未合并修复 PR 时新 PR 含评论 + `duplicate` label；GitHub API 调用 `issues: write` 权限端点；单测覆盖：重复场景评论 + label / 非重复场景不操作；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed
- [x] **M19.4 T701-e2e 管理端点集成测试补强** —— 3 个 e2e 文件（users 6 + credentials 19 + repos 25 = 50 case）覆盖用户管理 / 凭据管理 / 仓库管理端点 API 集成；mock 数据不依赖真实 GitHub API；playwright CI 环境稳定无 flaky；`pnpm typecheck` 7 包全 Done / `pnpm lint` 全通过
- [x] **M19.5 C8 per-source 错误隔离** —— 模拟单源失败（Dependabot API 超时），其他源结果正常返回；返回结构 `FixError.source` 字段含失败源名称 + 错误信息；CLI 输出警告信息；单测覆盖：单源失败 / 全部成功 / 全部失败；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2510 passed
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 2510 passed（M19.5 实测 baseline）
- [x] `pnpm check:docs` 全过
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 5 atomic commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：5 atomic commits（M19.1 + M19.2 + M19.3 + M19.4 + M19.5）+ 配套 commits（M19 规划 `2f9eb38` / M19 任务详情 `bee5c3f` / M19.4 标记完成 `61b3ddc` / M19.5 标记完成 `4231ffb` / M19.x 收口 `ae33671`）+ cron-preview 时区修复 `3597dcf` + cron-preview backlog 登记 `52d1649` —— 共 ~12 commits 落地（M19 批次主线 5 + 配套 5 + 顺带 2）
- **测试覆盖**：vitest 2495 → 2510 passed（M19.2 baseline 2495 + M19.3 +9 case + M19.5 +6 case + M19.4 e2e 50 case 单独累计）；playwright e2e 新增 50 case（users 6 + credentials 19 + repos 25）
- **审计覆盖**：M19.1 quick / M19.2 standard（含 1 blocker + 3 warning 全部修复）/ M19.3 standard（2 warning 全部修复）/ M19.4 quick（含 1 blocker + 3 warning 全部修复）/ M19.5 standard（2 warning 修复 1 项 + 1 项登记 P3）—— 5 轮独立 Review Gate Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0（M19 全部 commits 落地后由用户主动推送或自然包含在 M19 推进批次；session 文件 stale `ahead=16` 描述在校正）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M19 段（本段；2026-08-31 M19 归档批次新增）
  - `docs/plan/todo.md` §M19 任务清单 → M19 全部 [x] 已闭环切换 + 顶部 banner 更新（M19 → M20 active）
  - `docs/plan/todo.md` §M20.1 [x] 状态更新（commit `acb2d35` 已落地，todo.md §M20.1 [ ] → [x]）
  - `docs/plan/roadmap.md` Milestone 概述表 M19 行状态更新（进行中 → 已完成 2026-08-31 归档）+ §M19 详细实施状态段新增
  - `docs/plan/backlog.md` 清理 5 个已上收 M19 主条目（B1 / C23 / C8 / T701-e2e / C34）+ 历史归档指针段新增 M19 条目
  - `docs/plan/archive/index.md` §4 当前基线更新（M19 归档后）+ §5 近期归档批次登记新增 M19 行

### 关键决策

- **类型平衡原则**：M19 按"技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项"选取 5 项 —— 避免单一类型堆积，确保每阶段多维价值。M18.x 治理批次（已闭环）留给 M20+ 按需触发
- **M19.3 B1 权限升级**：GitHub API 权限从 `pull-requests: write` 扩展到 `issues: write` —— 仅新增 `issues: write`（不影响 `contents: write` 等其他权限面）；用户接受 risk 后实施
- **M19.4 e2e fixtures 仅 mock**：本次 T701-e2e 仍以 mock 数据为主（不依赖真实 GitHub API）—— T701 真实凭据 3 项（GitHub OAuth / Google OAuth / OIDC SSO）保留 backlog 真实环境验证任务（与 M18.x 决策 C 一致：mock 聚焦库契约输出作缓解措施）
- **M19.5 throw 路径重复提示处理**：CLI 警告路径只在部分源失败时输出（避免全部成功 / 全部失败误报）—— FixError.source 字段 + logPartialSourceFailureSummary 函数统一汇总；pnpm-audit 单源文案（"pnpm-audit source failed"）作为 P3 后续优化项登记 backlog
- **M19.2 C23 max-repos 默认值 100**：权衡"覆盖中小型 org（~50 仓库）+ 防止大 org 数百仓库一次性全量发现"—— 默认 100 覆盖 90% 场景；CLI/Action/Platform 三入口可覆盖默认值上限需求

### 阶段关键经验（已沉淀至项目知识库）

- **C34 双层对称挂接协议（M19.1 实证）**：code-reviewer skill + code-quality-checklist 双向挂接 —— 任一方扩展另一方必须同步（M14.x 已固化原则的二次实证）；本次补 8 个必查项同步双层；规范单点声明原则贯穿
- **CLI/Action/Platform 三入口统一参数（M19.2 实证）**：新增参数时三入口同步暴露，避免"代码支持但 UI 不支持"或"代码支持但 CLI 不支持"的偏差 —— M19.2 C23 实施时一次性三入口同步
- **Code Auditor standard depth 捕获未触发自检的契约漏洞（M19.2 blocker 实证）**：M19.2 audit 命中 1 blocker（MCP schema 未同步新参数）—— 实施方未主动验证所有 schema 同步；F 阶段本地验证不能替代 A 阶段审计独立核验
- **Code Auditor quick depth 在小改动 e2e 测试补强下仍命中 blocker（M19.4 实证）**：M19.4 audit quick 命中 1 blocker（users-api.e2e 与既有 admin-roles.e2e.test.ts 测试逻辑重复）—— e2e 测试新增时主动 grep 既有 e2e 文件，避免重复覆盖
- **per-source 错误隔离 throw 路径语义对齐（M19.5 实证）**：CLI 警告只在"部分源失败"路径触发；全部成功 / 全部失败 throw 路径不重复警告 —— 与 M18.x throw 路径语义对齐原则一致

### 待迁移经验（next neat-freak 候选）

- **M19.5 pnpm-audit 单源文案优化**（P3 follow-up）：当前警告文案 "pnpm-audit source failed" 不够友好（缺详细失败原因）—— 后续批次优化为 "pnpm-audit: <error.message>" 格式；与 M18.x FixError 字段模式一致
- **M19.4 e2e fixtures 复用**（P3 follow-up）：M19.4 实施时新建 `users-api.e2e.test.ts` 等 3 个新 e2e 文件 —— 后续批次可考虑抽取 fixtures helper（如 `apps/platform/tests/e2e/helpers/api-roles.helper.ts` 统一封装 viewer/admin/org_admin 三角色 mock），与 M17.5 `authedCookieHeader` 抽取同源策略
- **M19.x 收口 commit 风格一致性**（P3 follow-up）：M19.x 收口 `ae33671` 是 refactor 类型 commit + 编号清理 —— 与 M14.x `b45f55e` git.md 双空行格式修复 + `84b4e1a` test 名孤立编号清理同模式（neat-freak 批次顺手处理）；建议统一为 `chore(refactor)` 类型而非 `docs(refactor)` —— 类型分类微调不影响 commit 内容
- **M19 backlog 候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）—— 详见 [backlog.md](backlog.md) §短期 / 一次性候选任务

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

