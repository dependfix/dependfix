# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **当前阶段：M27 用户体验 + 治理优先（W1 apps/platform stylelint + W2/W4 coverage 治理 + M22.7 根因排查 + M27.1 重复评估教训治理 / 2026-09-10 用户决策修订方案 B-1 + 2026-09-10 M27.1 重复评估修正）** —— 下一阶段启动由用户在 M27 阶段闭环后触发。

---

## 当前阶段：M27 用户体验 + 治理优先（5 原子条目 / 2026-09-10 用户决策修订方案 B-1 + 2026-09-10 M27.1 重复评估修正）

> **M27 阶段承接 M26 完整闭环**（2026-09-10 已 ahead=0 推送 origin/master / 36 commits / ~3240 行净增）。**类型平衡分布** 🚀 0 + 🛡️ 2 + 🧪 2 + 📚 教训治理 1 = 5 原子，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md)。**P 阶段决策 D1-D5**：
> - **D1**：按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 5 原子
> - **D2**（2026-09-10 修正）：M27.1 重复评估错误归正 —— todo.md §M27 阶段启动 commit `0ddd4e2` 决策 D2 错误地把 C66-C / C66-D 归类为"未落地"；实际 C66-C 已在 M23.3 commit `650a0d2` 闭环 + 经验归档 §五十五 commit `9c64ee0` + commit hash 回填 commit `6e53616`；C66-D 已在 M16.2 闭环（reuseScanRunId API + scan.post.test.ts L144-L260 5 case（sync mode / async queue mode / 404 / 跨仓库 400 / 跨仓库 409）+ useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts 3 case）。M27.1 **无代码改动需求**，修订为 1 docs(plan+governance) atomic commit（详见 M27.1 段修订）
> - **D3**：W1 / W2 / W4 均为 quick depth（单 commit 模式）；M22.7 根因排查为 P1 优先（剩余 ECONNRESET 偶发根因）
> - **D4**：M22 neat-freak 收敛已 M23.0 G1 闭环（不在 M27 复用）；M22.7 根因 follow-up 中 ② Nitro h3 async generator + ③ Playwright 版本对比 + ④ fixtures API 节流留 backlog 后续批次
> - **D5**（2026-09-10 新增）：M27 重复评估教训治理 —— 修订 planning.md §3.4「决策前置交叉核验」硬要求 + ai-collaboration.md §1.7「阶段启动重复评估自检」流程 + backlog.md C66 5 子任务现状明确标注 + experience-archive §六十四 完整教训 + wisdom.md governance check point「阶段启动必须对照 todo-archive.md 最近 3 个阶段表格 + commit history + 实际代码状态三重交叉核验」（详见 M27.5 教训治理段）

### M27.1 [P2 🚀 UX] C66 告警视图增强（已闭环 / 无新增 commit / 1 docs(plan+governance) commit 修正状态）

- **状态**：✅ **已闭环（M23.3 + M16.2 已实施，本批不需新增 commit）** —— 2026-09-10 M27 阶段启动 commit `0ddd4e2` 决策 D2 错误归类已修正（详见本页 §D2 决策 + [experience-archive §六十四 M27.1 重复评估教训](../design/governance/experience-archive-§49-§57-recent-investigation.md#六十四m271c66告警视图增强重复评估教训阶段启动决策时未对照已闭环清单导致规划无效工作20260910commit决策d2错误)）
- **范围（已闭环现状 100% 复核）**：
  - **C66-A1 ScanResult 数据模型扩展**：✅ `f44a527` (M23.3 feat(platform)) — apps/platform/server/entities/scan-result.ts 新增 `ghsaId` / `cveIds` 列 + 类级复合索引 + migration 1750000000000（§3b 教训：TypeORM 1.x 列级复合 `@Index([...])` 生成单列索引，必须类级声明）
  - **C66-A2 fetcher 提取 GHSA + CVE**：✅ `b6e7716` (M23.3 feat(core,engine)) — packages/core/src/alerts/index.ts NormalizedSecurityAlert 接口扩展 + packages/engine fetcher extractIdentifiers helper 透传
  - **C66-B 数据层去重**：⏸️ **暂缓（M23.3 决策）** —— 应用层去重（方案 B2 等价）已实施且满足当前业务需求；如未来需要 fix 复用 / 历史 fixStatus 跨次保留再迁移到 B1（详见 [backlog.md §C66-B](../plan/backlog.md)）
  - **C66-C alerts UI Identifiers 列**：✅ `650a0d2` (M23.3 feat(platform)) — apps/platform/app/pages/alerts.vue L520-562 Column 完整渲染（GHSA 优先 → fallback CVE[0] → 多 CVE 折叠 +N → code-scanning/code-quality 兜底 —）+ alertGhsaUrl / alertCveUrl helper + SCSS 列宽 180px + i18n colIdentifiers / fixNow 双语（zh-CN + en-US）；经验归档 §五十五：`9c64ee0` (M23.3 docs(plan+design))
  - **C66-D fix 模式复用 scanRunId + 立即修复入口**：✅ **M16.2 已闭环**（不计入 M23.3 / M27.1 本批；详见 todo-archive.md §M23.3 表格 L86）—— apps/platform/server/schemas/scan.ts `reuseScanRunId` 字段 + scan.post.ts API 实现 + scan.post.test.ts L144-L260 5 case（sync mode / async queue mode / 404 / 跨仓库 400 / 跨仓库 409）+ apps/platform/app/composables/use-fix-now.ts 87 行（fixingRunId / fixError / fixSuccess 三态 + triggerFix 复用 run_id 跳 /scans）+ apps/platform/app/components/alert-run-sidebar.vue L143-153 `pi pi-bolt` 按钮（report-only 模式守卫 + fixingRunId loading）+ apps/platform/tests/e2e/alerts-fix-now.e2e.test.ts 3 case
- **验收标准**：
  - [x] C66-C alerts 视图 Identifiers 列完整渲染（GHSA 优先 / CVE 兜底 / code-scanning 兜底 / 多 CVE 折叠）；i18n 双语齐全 — M23.3 `650a0d2` 已 ahead=0 推 origin/master
  - [x] C66-D reuseScanRunId API 单测覆盖（跳过重拉逻辑 + fixStatus 审计）；alerts 视图"立即修复此仓库"入口 e2e 覆盖 — M16.2 已闭环 + M23.3 表格 L86 标注
  - [x] `pnpm --filter @dependfix/platform typecheck` 0 error — M27.2 W1 阶段验证已 EXIT=0
  - [x] `pnpm --filter @dependfix/platform test` 全过（contract + UI test + e2e 不回归）— M27.2 W1 A 阶段审计实测 1199 passed / 7 skipped
  - [x] `pnpm --filter @dependfix/platform build` 0 error — 既有 M26.4b / M26.4c 阶段验证继承有效
  - [x] `pnpm run check:docs` 0 error — 既有 M26 归档批次验证继承有效
- **不做什么**：
  - **不在 M27.1 重做 C66-A1/A2/C/D**（已 100% 闭环，仅作状态修正）
  - 不做 C66-B 数据层去重（M23.3 决策暂缓 + 应用层去重已满足需求）
  - 不重写 Dependabot 详情页（详情在 dependabot 那边，UI 只展示关键标识 + 跳链）
  - 不立即支持自定义 advisory 来源（GitLab Advisory Database 等）
  - 不破坏现有 fixStatus / 修复链路
- **关联 commit hash**：
  - M23.3 阶段：`b6e7716` (feat(core,engine)) + `f44a527` (feat(platform)) + `650a0d2` (feat(platform)) + `9c64ee0` (docs(plan+design)) + `6e53616` (docs(plan))
  - M16.2 阶段：reuseScanRunId API + scan.post.test.ts + use-fix-now.ts + alert-run-sidebar.vue + alerts-fix-now.e2e.test.ts
  - 全部 ahead=0 已推 origin/master（M23 整阶段 17 commits + M16 阶段若干 commits）
- **本批唯一 commit**：`docs(plan+governance): M27.1 C66 告警视图增强 重复评估修正 + 教训治理（backlog.md C66 现状标注 / planning.md §3.4 决策前置交叉核验硬要求 / ai-collaboration.md §1.7 重复评估自检流程 / experience-archive §六十四 完整教训 / wisdom.md governance check point）` —— standard depth audit（多文件跨模块治理）
- **教训归档**：详见 [experience-archive §六十四 M27.1 重复评估教训](../design/governance/experience-archive-§49-§57-recent-investigation.md#六十四m271c66告警视图增强重复评估教训阶段启动决策时未对照已闭环清单导致规划无效工作20260910commit决策d2错误)
- **重复评估根因**（commit `0ddd4e2` 决策 D2 错误）：
  1. **决策时未对照 todo-archive.md §M23.3 表格 L79-88** —— 该表格明确列出 C66-A1/A2/C/D 全部 commit hash 与状态
  2. **决策时未对照 commit history** —— M23.3 5 commits（b6e7716 + f44a527 + 650a0d2 + 9c64ee0 + 6e53616）+ M16.2 commits 均在 `git log` 中可查
  3. **决策时未实际打开 alerts.vue 验证** —— 即使读了文档，也应该打开 apps/platform/app/pages/alerts.vue 验证 Identifiers 列实际渲染
  4. **决策时未实际打开 use-fix-now.ts 验证** —— 87 行 composable 已完整实现
  5. **backlog.md C66 描述含糊** —— L143 "保留为后续增强候选"基于 A1+A2 未闭环前提，实际 A1+A2 已闭环；L144 C66-D 无明确"已闭环 + commit hash"标注
- **关键决策**：
  - **D1**（修正）：M27.1 无代码改动需求，仅 docs(plan+governance) 1 atomic commit 修订 todo.md + backlog.md + planning.md + ai-collaboration.md + experience-archive §六十四 + wisdom.md
  - **D2**（治理）：决策前置交叉核验硬要求落地为 governance check point（详见 M27.5 教训治理段）

### M27.2 [P2 🛡️ devEx 治理] W1 apps/platform 增配 stylelint + lint 系列 scripts（1 commit / quick depth audit）

- **目标**：完成 backlog W1 — apps/platform 增配 stylelint + lint:i18n/css/md 三条 npm script，参照 momei 模式。
- **范围**：
  - `apps/platform/package.json` devDeps 加 `stylelint@17.15.0` + `stylelint-config-cmyr@^1.0.0`
  - `apps/platform/package.json` scripts 加 `lint:i18n` / `lint:css` / `lint:md`
  - 新增 `apps/platform/stylelint.config.js`（7 行 extends cmyr）
  - 新增 `apps/platform/.stylelintignore`
  - 根 `package.json` `lint:md` 路径补 `apps/**/*.md`
  - 根 `package.json` `lint-staged` 加 `*.{css,scss,vue}` → `pnpm --filter @dependfix/platform lint:css`
- **验收标准**：
  - [x] `pnpm --filter @dependfix/platform lint` 0 error（保持既有 baseline 0 warning 状态）— 1 warning: repos.vue 806 行超 max-lines 800（D3 决策预期）
  - [x] `pnpm --filter @dependfix/platform lint:i18n` 0 error
  - [x] `pnpm --filter @dependfix/platform lint:css` exit 0（baseline warnings 数量记录）— 修复 28 个 --fix + 6 个手工修复（4 word-break + 2 空注释 + 14 单行多声明展开 + 2 rgba→rgb + 4 @media 范围语法）
  - [x] `pnpm --filter @dependfix/platform lint:md` 0 error
  - [x] `pnpm run lint:md` 0 error（根，覆盖 `apps/**/*.md`）
  - [x] `pnpm install` lockfile 同步
- **commit hash**: `7888435` chore(platform): apps/platform 增配 stylelint + lint 系列 scripts（17 files / ahead=1 待推送）
- **不做什么**：
  - 不做 lint:css baseline 治本（如有 warnings 走 --fix 或留 baseline）
  - 不重写 apps/platform .vue/.scss 贴合 stylelint-config-cmyr
  - 不引入 stylelint-config-standard / stylelint-config-html
  - 不动 eslint.config.js（根 + apps/platform）
- **依赖**：W1 已 2026-09-09 入 backlog；`cd79724` 已 commit 部分落 docs
- **交付物**：1 atomic commit（`chore(platform): apps/platform 增配 stylelint + lint:i18n/lint:css/lint:md`）+ quick depth audit
- **风险与缓解措施**：
  - **风险 1**：lint:css baseline warnings 5-15 个 —— 缓解：`stylelint --fix` 自动修复 + 不可自动修复视为"已有 baseline"不阻塞
  - **风险 2**：stylelint-config-cmyr 与 PrimeVue 4 / UnoCSS 兼容性 —— 缓解：先跑 dry-run 评估 + 必要时加 stylelint-disable 注释
- **关键决策**：
  - **D1**：不动 eslint.config.js（与根 eslint.config.js 语义一致）；lint:i18n 仅为本地便利

### M27.3 [P2 🧪 测试治理] W2 logger.ts 26 branches 100% 未覆盖补单测（1 commit / quick depth audit）

- **目标**：补 apps/platform/server/utils/logger.ts 26 branches 100% 未覆盖，按 CI Coverage 修复同套 isDirectExecution + export + 测试模式（治本但需 mock winston/fs/axiom 副作用）。
- **范围**：
  - `apps/platform/server/utils/logger.ts` 重构：isDirectExecution 守卫 + 导出 3-5 个核心函数（initLogger / log / flush）
  - 新增 `apps/platform/server/utils/logger.test.ts`（30+ cases / mock winston/fs/axiom）
- **验收标准**：
  - [ ] logger.ts 单文件 coverage Stmts ≥ 90% / Branches ≥ 90% / Lines ≥ 90% / Funcs 100%
  - [ ] `pnpm --filter @dependfix/platform test` 全过
  - [ ] `pnpm --filter @dependfix/platform lint` 0 error
  - [ ] `pnpm --filter @dependfix/platform typecheck` 0 error
  - [ ] `pnpm test:coverage` Branches ≥ 80%（全量）
- **不做什么**：
  - 不重写 logger 实现（仅暴露纯函数 + 守卫）
  - 不引入新依赖（winston/fs/axiom mock 用 vitest 内置）
- **依赖**：M26 阶段 + commit `a4a5680` fix(ci) check-readme-i18n 单测模式
- **交付物**：1 atomic commit（`test(platform): 补齐 logger 单测恢复 branches 90% coverage gate`）
- **风险与缓解措施**：
  - **风险 1**：logger.ts 内部依赖 winston transport + axiom sink 副作用难 mock —— 缓解：仅暴露纯函数（init / log / flush）+ 副作用函数 mock
  - **风险 2**：覆盖率提升可能伴随 logger.ts API 变更（isDirectExecution 守卫）—— 缓解：D 阶段自检 typecheck + lint + test
- **关键决策**：
  - **D1**：logger.ts 不重构（保留现有 API），仅补充单测覆盖

### M27.4 [P3 🧪 测试治理] W4 container-executor.ts 35.2% branches 覆盖补测（1 commit / quick depth audit）

- **目标**：补 apps/platform/server/services/executor/container-executor.ts 35.2% branches 覆盖（68 uncovered / 105 total），M26 阶段改动引入。
- **范围**：
  - 新增 `apps/platform/server/services/executor/container-executor.test.ts` 30+ cases（68 uncovered branches 全路径覆盖：clone / pullImage / startContainer / execCommand / cleanup / error handling）
  - mock dockerode / fs / path
- **验收标准**：
  - [ ] container-executor.ts 单文件 coverage Stmts ≥ 80% / Branches ≥ 80% / Lines ≥ 80%
  - [ ] `pnpm --filter @dependfix/platform test` 全过
  - [ ] `pnpm --filter @dependfix/platform lint` 0 error
  - [ ] `pnpm --filter @dependfix/platform typecheck` 0 error
  - [ ] `pnpm test:coverage` Branches ≥ 80%（全量）
- **不做什么**：
  - 不重写 container-executor 实现
  - 不引入新依赖
- **依赖**：M26.1 阶段已落地三执行器同步（container / sandbox / action）
- **交付物**：1 atomic commit（`test(platform): 补齐 container-executor 单测恢复 branches 80% coverage gate`）
- **风险与缓解措施**：
  - **风险 1**：68 uncovered branches 测试编写工作量大 —— 缓解：按 error path 分组（每组 5-10 cases）+ 复用 M26.1 sandbox-executor.test.ts 模式
- **关键决策**：
  - **D1**：不引入 dockerode mock 库（用 vi.mock('dockerode')）

### M27.5 [P1 🛡️ 治理] M22.7 根因 ① better-auth 1.7 transaction 关闭时序（2 commits / standard depth audit）

- **目标**：完成 backlog M22.7/M22.8 根因排查 follow-up —— better-auth 1.7 transaction 关闭时序问题诊断（CI 偶发 ECONNRESET 仍未 100% 根治），为剩余 3 候选（Nitro h3 async generator / fixtures 节流 / Playwright 版本对比）提供排查基线。
- **范围**：
  - `apps/platform/server/auth/` 添加 `[auth] transaction close trace` 日志（在 better-auth 1.7 getAuth() 适配器层打印 ds.transaction begin/commit 时间戳 + 连接释放时序）
  - CI 复现一次：触发 ECONNRESET 后分析 trace 日志，确认 transaction close 与 fixtures DELETE ensureDatabaseInitialized() 时序竞争是否根因
  - A 阶段 audit 验证：是否仍由 ① better-auth 候选触发 ECONNRESET，或可关闭该 follow-up
- **验收标准**：
  - [ ] `[auth] transaction close trace` 日志落地（CI 复现时可定位 transaction close 时间点）
  - [ ] CI 复现一次（含 ECONNRESET 偶发场景）+ trace 日志记录
  - [ ] A 阶段 audit 给出结论（是 / 否 better-auth 1.7 transaction 关闭时序为 ECONNRESET 根因）
  - [ ] 若为根因：修复方案落地 + 完整 commit 序列
  - [ ] 若非根因：A 阶段 audit 关闭该 follow-up，候选 ②/③/④ 评估优先级
  - [ ] `pnpm --filter @dependfix/platform lint` 0 error
  - [ ] `pnpm --filter @dependfix/platform typecheck` 0 error
  - [ ] `pnpm --filter @dependfix/platform test` 全过
- **不做什么**：
  - 不重写 better-auth 库代码（仅适配器层 trace 日志）
  - 不引入新依赖（用 pino/log 仅项目内日志）
  - 不在 M27.5 实施候选 ② Nitro h3 async generator + ③ Playwright 版本对比 + ④ fixtures API 节流（留 backlog 后续批次）
- **依赖**：M22.7 helper 层 maxRetries 兜底（commit `f617b56`）+ M23.1 SQLite WAL 治本（commit `2ffaa45`）；M22.7 hotfix 已落地但 CI 偶发 ECONNRESET 仍存在
- **交付物**：2 atomic commits（按"诊断 + 修复/关闭"双路径拆）：
  - commit 1 = `[auth] transaction close trace` 日志落地 + CI 复现 + A 阶段 audit
  - commit 2 = 根据 audit 结论（修复方案落地 OR audit 关闭 follow-up 文档）
- **风险与缓解措施**：
  - **风险 1**：CI 偶发 ECONNRESET 不一定 100% 复现（trace 日志可能无法触发）—— 缓解：commit 2 接受 audit 关闭 follow-up 路径（即使 CI 未复现，仍保留 trace 日志作为后续排查基础设施）
  - **风险 2**：better-auth 1.7 库内部 API 不可访问（私有方法）—— 缓解：仅在适配器层（apps/platform/server/auth/index.ts）打日志，不依赖库内部 API
  - **风险 3**：trace 日志引入性能开销 —— 缓解：trace 日志仅在 NODE_ENV=development 或 ECONNRESET 错误触发时输出
- **关键决策**：
  - **D1**：commit 2 是"条件性"——根据 A 阶段 audit 结论决定是修复还是关闭 follow-up（修复方案需 P 阶段规划，不在 M27.5 预设路径内）
  - **D2**：保留候选 ②/③/④ 在 backlog（即使 ECONNRESET 由 ① 解决，也可能有其他根因）

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（M26 已 ahead=0 归档；M23 + M22 完整段保留；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md)（**M26 归档批次同步清理**：C67/C68/C69/M25 follow-up #3/#4/#5 移除；M22.7 根因 ② Nitro h3 async generator / ③ Playwright 版本对比 / ④ fixtures API 节流 留 backlog 后续批次） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M26 状态已完成；M27 启动后切换为 active） |
| 历史归档索引 | [archive/index.md](archive/index.md) |