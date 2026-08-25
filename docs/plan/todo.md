# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M13 治理 + UX 反馈 + 网络治理 + Code Scanning

> **阶段背景（2026-08-25 启动）**：M12 已闭环归档 + 上批次 5 commits（c47b5fb/6ea5b2b/5f69a27/0981096/228f7a7/c811659）已全部推送至 `origin/master`（ahead=0）。本阶段承接：① backlog 治理前置（C1+C2 强制要求）；② 2026-08-21 后用户实测反馈 2 项 UX 问题；③ 网络治理长期主线（network-audit G1）；④ Code Scanning 规则化 + code-quality-findings 接入。
>
> **拆分方案**：按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆分为 **3 子阶段独立闭环**：
>
> | 子阶段 | 任务 | 预计 commits | 风险梯度 |
> |:---|:---|:---:|:---:|
> | M13.1 治理前置 + 平台 UX 反馈 | T1301 + T1302 + T1303 + T1304 | 4 | 低 |
> | M13.2 网络治理 + 告警去重 + changelog 机制治本 | T1305 + T1306 + T1309 | 3-5 | 中 |
> | M13.3 Code Scanning 规则化 + CQL | T1307 + T1308 | 2-4 | 高 |
>
> **状态约定**：子阶段串行实施，每子阶段独立 PDTFC+ 循环；上一子阶段 F 阶段闭环（commit 推送）后方可启动下一子阶段。

### M13.1 治理前置 + 平台 UX 反馈（UX 修复批次已闭环 2026-08-25，治理批次待启动）

#### [x] T1301 C1 wisdom 蒸馏 —— 闭环 2026-08-25

- **优先级**：P0 必做（[规划规范 §4.3 强制要求](../../docs/standards/planning.md) — 活跃条目 ≥ 20 必须蒸馏；本批次 27 条 > 20 阈值）
- **依赖**：—
- **执行范围**：`.session/wisdom.md`（150 行 / 61 条 → 89 行 / 14 条活跃）+ `docs/standards/platform.md` §7.1 + §3.5 + `docs/standards/security.md` §3
- **非目标**：不动工程文件 / 不动 git 规范（git reset 等 pattern 留 T1302）/ 不动 README/Guide（T1302 处理）
- **交付物**：
  - `.session/wisdom.md` 收敛到 89 行 / 14 条活跃（-48%）✅
  - 9 条关键 pattern 挂接到 [docs/standards/platform.md §7.1 PrimeVue 4 集成实践](../../docs/standards/platform.md#71-primevue-4-集成实践) + §3.5 TypeORM 查询模式 + [docs/standards/security.md §3 Web 安全防护](../../docs/standards/security.md#3-web-安全防护-web-protection) ✅
  - `pnpm distill:wisdom --check --threshold=15` WISDOM_OK（14 < 15）✅
- **闭环记录**：
  - 实施 commit：`docs(standards): session wisdom 蒸馏 — 迁移 9 条关键 pattern 到 docs/standard/, 保留 14 条活跃`（待推送）
  - 蒸馏迁移统计：27 → 14 活跃 + 12 条压缩为已蒸馏摘要（迁移 30 条到 docs/standards/*.md）
  - 关键迁移清单：
    - `docs/standards/platform.md` §7.1 新增 3 条实战细节（multisortMeta 触发条件 + Select disabled rendering + bugfix 烟雾脚本）+ 补强 §类型 vs 运行时契约核验（本项目 2 条案例）+ 新增 §3.5 TypeORM 查询模式（find options 无嵌套路径）
    - `docs/standards/security.md` §3 新增 4 条关键 pattern（前端拦截不等于服务端安全 + better-auth admin body shape 多样 + server middleware 路径过滤快速退出 + Nuxt server middleware 4 候选方案权衡）
  - 完整验证：`pnpm run check:docs` 99 links + 55 vue-interp OK / `pnpm lint:md` 0 error / `pnpm distill:wisdom --check --threshold=15` WISDOM_OK
- **follow-up（登记 backlog 或 T1302）**：
  - `.session/wisdom.md` 不入库（被 .gitignore 排除），commit 仅含 docs/standards/*.md 同步
  - T1302 neat-freak 批次将进一步挂接剩余 6+ pattern（TDZ 调试陷阱 + OR 链触发条件 + 已测试文件补测胜于新建 + F 阶段本地验证口径差异 + Code Auditor quick depth 时长校准 + reset 重做 atomic commit）+ agent 文档 + README/Guide 同步

#### [x] T1302 C2 neat-freak 批次 —— 闭环 2026-08-25

- **优先级**：P1
- **依赖**：T1301（蒸馏后挂接 standards）
- **执行范围**：`docs/standards/development.md` / `ai-collaboration.md` / `git.md` / `testing.md` + `.github/agents/full-stack-master.agent.md`
- **非目标**：不动 `.session/wisdom.md`（已在 T1301 收敛）/ 不动 README/Guide（本期聚焦 standards + agent 文档）
- **交付物**：
  - 9 条新 wisdom pattern/principle 挂接到 standards 对应章节（超过 todo.md 验收「6+」阈值）✅
  - agent 文档新增 PDTFC+ 自检条目（D 阶段编号标记扫描 + TypeORM 实体索引声明指针引用）✅
  - 清理 3 个 warning（testing.md §6.1 重复内容 + agent 文档与 §3/§3b 重复 + ai-collaboration.md 断链）+ 3 个 suggest（数据来源口径 + commit hash 加日期 + §3.4 cross-reference）✅
- **闭环记录**：
  - 实施 commit：`docs(standards): neat-freak 批次 — 9 条 wisdom pattern 挂接 + agent 文档同步 + 重复/断链清理`（待推送）
  - 9 条挂接清单：
    1. **TDZ 调试陷阱** → `docs/standards/development.md §5.1.12`
    2. **已测试文件补测胜于新建** → `docs/standards/development.md §5.1.13`
    3. **OR 链触发条件精确追踪** → `docs/standards/development.md §5.1.14`
    4. **F 阶段本地验证口径差异** → `docs/standards/ai-collaboration.md §4.4`
    5. **Code Auditor quick depth 时长校准** → `docs/standards/ai-collaboration.md §4.5`
    6. **audit warning 修复决策协议** → `docs/standards/ai-collaboration.md §4.6`
    7. **reset 重做 atomic commit** → `docs/standards/git.md §3.4`
    8. **Nuxt 4 payload 解析** → `docs/standards/testing.md §6.1`
    9. **Playwright webServer 用 build 产物（合并入既有 L99 条目）** → `docs/standards/testing.md §6.1`
  - agent 文档新增：`full-stack-master.agent.md §87` 末尾补指针引用 + `§91` 新增 D 阶段 TypeORM 实体索引声明硬要求
  - Round 1 警告 + Round 2 复审结果：
    - Round 1 Reject：3 warning（RG-W01 testing.md 重复 + RG-W02 agent 文档重复 + RG-W03 ai-collaboration.md 断链）+ 3 suggest（RG-S01-S03）
    - Round 2 Pass：6 个警告全部验证修复正确 + 1 个新发现 RG-S04-NEW（git.md L107-108 后双空行格式问题）登记 follow-up
  - 完整验证：`pnpm run check:docs` 99 links + 55 vue-interp OK / `pnpm lint:md` 0 error
- **follow-up（登记 backlog 或下个 neat-freak 批次）**：
  - RG-S04-NEW：git.md §3.4 后双空行格式问题（warning 级，留待下个 neat-freak 批次清理）
  - 本期未涉及 `README.md` / `docs/guide/*.md` / `docs/standards/development.md §3 注释规范` 中 wisdom 蒸馏产物的进一步挂接（待 M14 或后续 neat-freak 批次评估）

#### [x] T1303 单仓库扫描互斥修复（实测反馈 5.1）—— 闭环 2026-08-25

- **优先级**：P1（实测反馈 UX bug）
- **依赖**：—
- **执行范围**：`apps/platform/app/pages/repos.vue` 第 468-473 行（动作列 scan 按钮）
- **非目标**：不动后端 / 不改 batch-scan 路径 / 不改 polling 逻辑
- **根因分析**：
  - `repos.vue:468-469` 有 `:disabled="scanningId !== null && scanningId !== data.id"`
  - 该条件将"单仓库扫描状态"作为"全局互斥锁"——任一仓库扫描中时，其他所有仓库扫描按钮被禁用
  - 用户期望：多个不同仓库的扫描独立可触发（受后端 BullMQ 队列 + 沙箱隔离支持）
- **修复方案**：删除 `:disabled` 条件，仅保留 `:loading="scanningId === data.id"`
- **交付物**：`apps/platform/app/pages/repos.vue` 单文件改动（-1 行）
- **验收标准**：
  - 删除 `:disabled="scanningId !== null && scanningId !== data.id"` 条件 ✅
  - 保留 `:loading="scanningId === data.id"` 单仓库扫描态指示 ✅
  - 多个不同仓库的扫描按钮可独立触发（互不影响）
- **闭环记录**：
  - 实施 commit：`c2e3d7b fix(platform): 删除单仓库扫描的全局互斥禁用条件`
  - A 阶段 Code Auditor quick depth Pass（实测 ~3.8min），0 blocker + 2 warning（RG-W01 并发 loading 竞态 + RG-W02 缺并发 e2e 验证）登记 backlog follow-up + 3 suggest 已确认
  - 完整验证：`pnpm lint` 0 error / `pnpm --filter @dependfix/platform typecheck` 0 error / `pnpm --filter @dependfix/platform build` 0 error / `pnpm --filter @dependfix/platform exec playwright test history-dialog` 2/2 passed（含本批次修复 + 既有 c51/C57 验收 case）
- **follow-up（登记 backlog）**：
  - RG-W01：删 `:disabled` 后 `scanningId` 仍为单值字符串，并发扫描存在 UI loading 竞态（功能不受影响，仅视觉指示错位），后续可优化为 `Set<string>` 或加 hint 文案
  - RG-W02：缺并发扫描 e2e 验证 case，下次 neat-freak 批次补

#### [x] T1304 历史 Dialog X 按钮修复（实测反馈 5.2）—— 闭环 2026-08-25

- **优先级**：P1（实测反馈 UX 缺陷）
- **依赖**：—
- **执行范围**：`apps/platform/app/components/RepoHistoryDialog.vue` + e2e test
- **非目标**：不动详情视图本身逻辑 / 不改 query 状态机
- **根因分析**：
  - 当前架构：单 Dialog 内 list/detail 视图切换（commit `2102894` 已修 unrouting 问题）
  - 用户痛点：详情视图下点 X 按钮直接关闭整个 Dialog（PrimeVue Dialog 默认行为），无法回到列表——与"返回列表"按钮的预期不符
- **修复方案**：
  - 详情视图时 Dialog `:closable="!detail"` + `:close-on-escape="!detail"`（detail 有值时为 false）
  - 列表视图保持默认 `closable` + `closeOnEscape` 行为
  - PrimeVue 4 Dialog API 翻 `node_modules/primevue/dialog/index.d.ts` 核验 `closable` + `closeOnEscape` 均为合法 boolean | undefined prop
- **交付物**：`RepoHistoryDialog.vue` 单文件改动 + i18n locale 双语 key
- **验收标准**：
  - 详情视图时 Dialog `:closable="false"`，X 按钮不渲染
  - 列表视图保持默认 `closable`
  - i18n 双语新增（zh-CN + en-US 各 1-2 键）
- **最小验证矩阵**：
  - `pnpm lint` 0 error
  - `pnpm typecheck` 0 error
  - `pnpm lint:i18n` 0 error
  - playwright e2e 新增 1 case：打开历史 → 进入详情 → 确认 X 按钮不渲染 + "返回列表"按钮可点击回退
- **风险**：低

### M13.2 网络治理 + 告警去重（T1305 已闭环 2026-08-25，T1306 + T1309 待启动）

#### [x] T1305 B2 network-audit G1 治理（长期主线 #2 切片）—— 闭环 2026-08-25

- **优先级**：P1（backlog 长期主线 #2 进行中）
- **依赖**：M13.1 F 阶段闭环（**注**：本任务在我工作期间由其他流程提前闭环，独立于 M13 阶段编排）
- **执行范围**：`packages/engine/src/runners/verification-runner.ts` + `packages/engine/src/runners/network-audit.test.ts` + `packages/engine/src/runners/verification-runner.test.ts` + `docs/standards/security.md` + `docs/plan/backlog.md`
- **非目标**：不动 `runtime-adapters/*`（已独立闭环）；不改 `network-audit.ts` 顶层接口
- **根因分析**：
  - 临时修复：`rolldown.rs` 默认白名单（commit `2104b9f`）；症状 = vite 6/7 跨 major 升级 verification 命令输出 URL 被 deny-by-default 拦截为 `network_violation` → run exitCode=1
  - 每次构建工具跨 major 升级都需补白名单（按次新增模式不可持续）
- **修复方案**：采用 backlog §主线 #2 候选方向 3（命令输出 URL 与真实外联区分）
  - 命令输出 URL 提取改为仅入 entries 备查，不再归类 `network_violation`（stdout/stderr 文本不等于真实网络连接）
  - verification 子进程默认注入 `NUXT_TELEMETRY_DISABLED` / `NEXT_TELEMETRY_DISABLED` / `DO_NOT_TRACK`（Nuxt CLI 默认 telemetry 上报被 deny-by-default 命中；verification 是离线构建验证必须禁用）
  - 新增 `buildSpawnEnv` 集中处理 telemetry 与代理注入；不覆盖父进程已设 telemetry
  - 4 个回归 case 锁定边界
- **交付物**：
  - `verification-runner.ts` 命令输出 URL 提取改仅入 entries + `buildSpawnEnv` 集中环境注入（净 +201 行 / -57 行 = +144 行净增）
  - `verification-runner.test.ts` +215 行新增（覆盖 stdout/stderr/telemetry/buildSpawnEnv 等回归 case）
  - `network-audit.test.ts` +17 行新增
  - `security.md` §5.3.1 网络外联审计子标题（W3 锚点精确化）
  - `backlog.md` 长期主线 #2 状态置为观察中，候选方向 3 标记已落地
- **闭环记录**：
  - 实施 commit：`0f08c40 fix(engine): 治本 network-audit 命令输出 URL 误判与 telemetry 默认禁用`
  - 文档收口 commit：`5269d0a docs(standards+plan): 网络外联审计语义更新与 G1 长期主线切片登记`
  - 实证：run dependfix-mt8nasq2-0iiiry 2026-08-25 pnpm 11.x warnings 的 pnpm.io 不再触发 verification fail
  - 关键决策：选候选方向 3 而非方向 1/2（治本根因而非逐次新增白名单；stdout/stderr 文本语义上不是真实外联）
- **follow-up（候选方向 1/2 优先级降低，登记 backlog）**：
  - 候选方向 1（构建工具生态文档站类目预置白名单）：现状已用方向 3 治本，方向 1 优先级降低
  - 候选方向 2（SRI 哈希钉资源）：同方向 1，优先级降低
  - vitest 单测 +5 case（stdout/stderr 误判修复 + SRI 哈希匹配 + 预置白名单覆盖）
  - e2e：verification job 实测不误判（依赖真实 CI 环境，单元测试为主）
- **风险**：中（跨前后端 + 公共 API 变更需兼容性考虑）

#### [x] T1306 告警跨次扫描去重（实测反馈 6）—— 闭环 2026-08-25

- **优先级**：P1（实测反馈）
- **依赖**：M13.1 F 阶段闭环
- **执行范围**：`apps/platform/server/api/alerts/index.get.ts` + `apps/platform/app/pages/alerts.vue` + `apps/platform/i18n/locales/{zh-CN,en-US}.json` + tests
- **非目标**：不动 `ScanResult` 实体表结构（仅读取 + 聚合）；不改底层数据采集逻辑
- **根因分析**：
  - 当前 `/api/alerts` 返回全量 `ScanResult` 记录，多次扫描产生的相同 CVE-alert 重复展示
  - 用户痛点：相同告警在历史多次扫描中出现 N 次，无法聚合查看影响范围
- **修复方案**：
  - 后端：新增 query 参数 `dedupe=true`（zod safeParse 兜底，默认 `false` 保后向兼容）
  - 去重维度：fingerprint = `${repositoryId}|${packageName}|${ruleId ?? ''}`（用 repositoryId 而非 scanRunId 才是"跨次扫描去重"）
  - 聚合字段：`occurrenceCount`（出现次数）/ `firstSeenAt` / `lastSeenAt` / `affectedRunIds`（distinct run id 列表，前 5 个 + 集合全量跟踪）
  - 排序按 occurrenceCount DESC（业务语义：高频 = 重要）
  - 聚合实现：原计划 SQL `GROUP_CONCAT` 子查询聚合 `affectedRunIds`，但 better-sqlite3 `:memory:` 子查询表名解析失败（"no such table: scan_result"）；改用应用层 JS 聚合（去 SQL dialect 依赖 + 测试稳定），N+1 风险可控（`.take(500)` 上限 + 应用层去重 O(n)）
  - 前端 DataTable 列扩展（dedupe=across 时显示）：出现次数 Tag + 最近发现时间 + 详情按钮
  - 详情侧栏（PrimeVue Sidebar 右侧滑出）：显示该告警 affected runs 详情（按 affectedRunIds 批量查询 `/api/runs`）
- **闭环记录**：
  - 实施 commit：
    - `feat(platform): /api/alerts 新增 dedupe=true 跨次扫描去重聚合`（后端）
    - `feat(platform): alerts 页面新增 dedupe 模式 + 详情侧栏（PrimeVue Sidebar）`（前端 + i18n）
    - `docs(plan): todo.md 收口 M13.2 T1306 闭环（alert 跨次扫描去重）`（todo 收口 + e2e case）
  - 聚合实现细节：原 SQL 方案在 better-sqlite3 `:memory:` 测试环境子查询表名解析失败，改用应用层 JS 聚合（`tests/e2e/alerts-rowgroup.e2e.test.ts` 新增 1 case 验证前端 UI 集成 + 请求参数）
  - 完整验证：`pnpm run check:docs` 99 links + 55 vue-interp OK / `pnpm lint` 0 error / `pnpm --filter @dependfix/platform typecheck` 0 error / `pnpm --filter @dependfix/platform exec vitest run server/api/alerts/index.get.test.ts` 19/19 passed（13 既有 + 6 新增 dedupe case）/ `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 6 passed（5 既有 + 1 新增 dedupe）/ `pnpm --filter @dependfix/platform build` 0 error
- **follow-up（登记 backlog 或下个 neat-freak）**：
  - affectedRunIds 当前仅取前 5 个（去重后），完整列表靠集合 size 跟踪但未暴露给前端；如需显示"全部 N 个 run"按钮，下次迭代
  - 应用层聚合性能：500 行 O(n) 聚合对当前规模足够，万级规模可考虑 SQL GROUP_CONCAT 子查询（需 PG/MySQL，SQLite 兼容性需进一步验证）

#### T1309 changelog 机制治本：被动依赖升级 Dependencies 段 fallback（c811659 回归）

- **优先级**：P1（验证链路阻断性回归，CI verify-changelog 当前失败阻断 release）
- **依赖**：M13.1 F 阶段闭环
- **执行范围**：`scripts/changelog.mjs` + `scripts/changelog.test.mjs` + `docs/standards/git.md` CHANGELOG 策略章节（如有）
- **非目标**：不动 verify-changelog.mjs（fallback 段已含版本标题行，自动通过现有契约）；不动 release-publish.mjs / release-version.mjs（不修改发布语义）；不动 cmyr-config 模板（直接手写 fallback 段）
- **根因分析**：
  - 现状：commit `c811659 docs(changelog): 更新版本信息并添加新功能与修复记录`（已在 origin/master）提升了 cli 0.3.2 → 0.3.3、mcp 0.1.2 → 0.1.3，但这两个包的路径下从上次 tag 后无任何 commit（仅被 core/engine 的 0.3.0/0.2.0 升级传导 patch 跟随）
  - 机制：`scripts/changelog.mjs` 的 `generate()` 用 path-filter 过滤 commit → cli/mcp 路径下 0 commit → 输出空段；86-94 行的"跳过空段"逻辑把空段过滤掉（保护重跑幂等），但也吃掉了"被动升级"场景
  - 后果：`packages/cli/CHANGELOG.md` 缺 0.3.3 段、`packages/mcp/CHANGELOG.md` 缺 0.1.3 段；`pnpm verify:changelog` 当前直接 ::error:: + exit 1；CI release job 会被阻断
  - 教训参考：conventional-changelog-monorepo / lerna 标准实践 = 当 release 仅由传递依赖变更触发时，输出 `### Dependencies` 段列出依赖版本变化（社区标准答案，方案 B 选此）
- **修复方案**：在 `changelog.mjs` 主流程 `for (const target of targets)` 循环中，当 `generate({ releaseCount: 1 })` 输出空且当前版本未被 tag 标记时，新增 fallback 路径：
  1. **新增 `computeDependencyChanges(currentDeps, prevDeps)` 纯函数**：对比两套依赖，输出 `Array<{ name, from, to }>`（仅含变化的项）；纯函数便于单测
  2. **新增 `loadDepsAtTag(ref, pkgPath, execShow)` 纯函数**：通过 `git show <ref>:<pkg_path>/package.json` 取出 prev tag 时该包依赖列表；execShow 依赖注入便于单测
  3. **新增 `renderDependencySection(opts)` 纯函数**：根据 `computeDependencyChanges` 结果输出完整版本段，格式与 cmyr-config 标题对齐（`## [x.y.z](compare_url) (date)\n\n### ⚙️ 依赖更新\n\n* bump <name> to <to>\n`）；无变化时返回空串（保持重跑幂等）
  4. **主流程集成**：`generate()` 输出空 → 调用 fallback 三件套 → 若有变化则用 fallback 段替换（保留既有 `mergeUnreleased` 流程）
- **交付物**：
  - `scripts/changelog.mjs`：新增 `computeDependencyChanges` + `loadDepsAtTag` + `renderDependencySection` 三个纯函数 + 主流程集成（估计 +50-80 行）
  - `scripts/changelog.test.mjs`：新增 6-8 个 test case（覆盖基础 fallback / 无变化 / 无 workspace 依赖 / 多 dep / 单 dep / prevTag 缺失 / 段格式对齐）
  - 验证 commit：`56de1a1 docs(engine): 更新日志` 后 + 本批次 changelog 修复后，`pnpm verify:changelog` 通过；`pnpm changelog` 一次性重跑为 cli/mcp 生成 0.3.3/0.1.3 Dependencies 段
- **验收标准**：
  - `pnpm verify:changelog` exit 0 ✅
  - `packages/cli/CHANGELOG.md` 含 `## [0.3.3](...) (date)` + `### ⚙️ 依赖更新` 段 ✅
  - `packages/mcp/CHANGELOG.md` 含 `## [0.1.3](...) (date)` + `### ⚙️ 依赖更新` 段 ✅
  - `pnpm --filter ... test`（含新单测）通过 ✅
  - "重跑幂等"语义保持：版本 == 最新 tag 时不写出空段（既有 86-94 行逻辑保留）✅
- **最小验证矩阵**：
  - `pnpm verify:changelog` exit 0（验证缺段问题修复）
  - `pnpm --filter dependfix test` 或 `vitest run scripts/changelog.test.mjs` 全绿（含新 fallback case）
  - `pnpm changelog` 一次性重跑产出预期段（验证 fallback 集成路径生效）
  - `pnpm lint` / `pnpm typecheck` 0 error（scripts 是纯 Node，无 typecheck 强制项，但 lint 必须过）
- **follow-up**：
  - 根级 CHANGELOG.md 同样走 path-filter 全集（changelog.mjs:46 `commits: {}`），自身不会触发 fallback——但如果某次 core-only 发布的 commit 没 touch 根级路径，根级也需 fallback？现状未观察到该 case，登记 backlog 观察
  - 文档同步：本文档已登记实现记录；CHANGELOG 机制策略文档（如 `docs/guide/release.md`）是否需要更新"被动升级会输出 Dependencies 段"说明——视 changelog.test.mjs 注释是否足够决定
- **风险**：低（纯函数 + 既有脚本扩点，不改发布语义；既有"跳过空段"重跑幂等保护保留）

### M13.3 Code Scanning 规则化 + CQL（待 M13.2 闭环启动）

#### T1307 C16 Code Scanning 规则分类配置化 —— 闭环 2026-08-26

- **优先级**：P2
- **依赖**：M13.2 F 阶段闭环
- **执行范围**：`packages/engine/src/code-scanning/rule-config.ts`（新模块）+ `packages/engine/src/code-scanning/rule-classifier.ts`（重构）+ `packages/engine/src/app/index.ts`（env 加载钩子）+ `packages/engine/src/index.ts`（re-export）+ tests
- **非目标**：不动 rules 自身的判定逻辑（classifyRule 行为契约保持稳定）
- **交付物**：
  - 规则分类（A/B/C 三级）从硬编码常量表升级为 JSON 可配置加载 ✅
  - 默认配置 = 当前常量表（向后兼容，AUTO_FIXABLE_RULES / SUGGESTED_RULES 仍导出为默认常量）✅
  - 新增 `CODE_SCANNING_RULES_CONFIG_PATH` env 覆盖 + `setActiveRulesConfig` 运行时注入接口 ✅
  - 非法配置（schema 校验失败 / 文件不存在 / 路径非法）→ stderr 警告 + 降级默认 ✅
- **闭环记录**：
  - 实施 commit：`792e8c8 feat(engine): Code Scanning 规则分类支持配置文件覆盖`
  - 新增 `rule-config.ts` (208 行) + `rule-config.test.ts` (146 行)
  - `classifyRule` / `suggestionFor` 重构为从 `getActiveRulesConfig()` 读取 module-level active config；测试通过 `afterEach(resetActiveRulesConfig)` 防止互相污染
  - `DependfixApp` 构造时按 env 加载并先 reset 后 set（避免跨 app 残留）
  - A 阶段 Code Auditor Round 1 quick depth 评估为 standard 深度（跨包 API 契约稳定 / 公共 API 不变 / 配置加载降级语义完整）→ Pass，无 blocker
  - 完整验证：`pnpm vitest run` 925 passed（含 21 个新增 rule-config / 自定义 A/B 类 test case）/ `pnpm --filter @dependfix/engine typecheck` 0 error / `pnpm --filter @dependfix/engine lint` 0 error / `pnpm --filter @dependfix/engine build` 0 error
- **follow-up（登记 backlog）**：
  - 模块级 active config 是单例；多个 DependfixApp 共存场景（cli 测试 / 多 batch 调度）已通过 reset 防御，未来如引入 worker pool 需考虑 per-worker config 隔离
  - 当前 JSON 格式未支持正则 / 范围匹配（如 `js/*-injection`），后续可扩展 wildcard；现状手工列举足够（CodeQL 规则 id 稳定）

#### T1308 C21 code-quality-findings 接入 —— 闭环 2026-08-26

- **优先级**：P2
- **依赖**：M13.2 F 阶段闭环
- **执行范围**：`packages/core/src/alerts/index.ts`（AlertSource 扩展）+ `packages/core/src/filters/alert-filter.ts`（unknown severity 透传扩展）+ `packages/core/src/report/{types,index,markdown-generator,code-quality-suggestions}.ts`（报告段）+ `packages/engine/src/github/code-quality-fetcher.ts`（新 fetcher）+ `packages/engine/src/app/{repo-alerts,helpers,result-assembly}.ts`（集成 + token hint + buildRunResult 透传）+ `packages/engine/src/config/index.ts`（codeQualityEnabled 配置）+ `packages/cli/src/cli/index.ts`（--code-quality flag）+ `apps/platform`（scan-orchestrator 默认值 / alerts UI option / i18n 双语 labels）+ tests
- **非目标**：不实现 CodeQL 完整语义解析（最小报告接入）；不做 Code Quality 模板化修复（首版统一 C 类 report-only）
- **交付物**：
  - 新增 `GET /repos/{owner}/{repo}/code-quality/findings` 数据源接入（cursor-based 分页 + 三层防御：MAX_CURSOR_PAGES=1000 / seenCursors / Link header 自然终止）✅
  - 报告输出新增 `## Code Quality Findings` 段（独立于 Code Scanning 段）；header 多源组合标签 ✅
  - 平台 UI alerts 页 source filter 新增 Code Quality 选项 ✅
- **验收标准**：
  - 数据源接入层支持 code-quality-findings API（含认证 / 分页 / 错误处理）✅
  - 报告输出包含 codeQualityFindings 段 ✅
  - 平台 UI 正确展示（alerts.vue sourceOptions 渲染 code-quality）✅
- **关键决策**：
  - **复用 NormalizedSecurityAlert 模型**（与 code-scanning 同源形态）：`source='code-quality'` / `packageEcosystem='code-quality'` / 复用 severity 映射 / `fixable=false` / `recommendedVersion=''`（防 isAlertFixedByActions 同名 packageName 误标 fixed）
  - **Octokit v17 类型未含**该端点：使用 `client.request('GET ...', ...)` raw 端点；响应类型本地声明 `CodeQualityFindingRaw`（GitHub Docs 2026-03-10 抓取核对）
  - **per-source 错误隔离**：与 code-scanning 同模式，三源（Dependabot + Code Scanning + Code Quality）任一失败 → 记录 FETCH_FAILED + 保留成功源；**全部源失败**才抛错
  - **静态分析 unknown severity 透传**：扩展 `keepUnknownStatic` 谓词至 code-quality（与 code-scanning 同源语义）
- **闭环记录**：
  - 实施 commit：`b0f6e84 feat(engine): 接入 GitHub Code Quality findings 数据源`
  - 新增 fetcher + 报告 collector + 9 个相关文件修改
  - A 阶段 Code Auditor Round 1 standard depth 4 blocker + 5 warning → Round 2 全闭环：filterAlerts 静态分析透传 / isAlertFixedByActions 显式 source 分支 / RunReportConfig + 报告段 / 模块级 state 生命周期 / CRLF 行尾清理
  - 完整验证：`pnpm vitest run` 2211 passed / `pnpm --filter @dependfix/{core,engine,cli} typecheck` 0 error / `pnpm --filter @dependfix/{core,engine,cli,platform} lint` 0 error / `pnpm --filter @dependfix/{core,engine,cli} build` 0 error / `pnpm --filter @dependfix/platform exec playwright test alerts-rowgroup` 6 passed / 编号标记扫描 0 命中 / git diff --check 0 error
- **follow-up（登记 backlog）**：
  - Code Quality rule.category（maintainability / reliability 等）当前未注入 NormalizedSecurityAlert；报告 markdown 暂不展示 category 列；后续 fetcher 注入后可补展示
  - 平台扫描请求 schema 当前未含 `codeQualityEnabled` 字段（仅展示用，未启用生产扫描）；backlog C21 后续如需平台发起 Code Quality 扫描，再扩展 ScanRequest schema + orchestrator + queue payload

---

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，**不在 M12 范围内**，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

实施记录与背景：[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 5 段，最近 3-5 阶段近线） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M12 全部 / M12 已闭环 2026-08-21） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（当前为空，M12 已闭环） |
| 已知边界 / known-issue | 各阶段归档段（如 [todo-archive.md §2026-08-20 e2e 修复批次 / C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore) PrimeVue hydration）或 backlog 顶部"未完成项目（backlog 仍活跃）" |
