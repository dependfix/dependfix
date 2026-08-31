# M14 + M15 归档分片（已分片 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M14 + M15 段（共约 180 行）已从 `todo-archive.md` 主窗口迁至本分片。M19 段新增后主窗口约 600 行，处于健康窗口（< 700 强制阈值）边缘，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略。
>
> **迁出触发**：todo-archive.md M19 归档批次新增段前主窗口 699 行 + M19 段新增预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M14 + M15 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md) + [backlog.md §已闭环阶段](../backlog.md#已闭环阶段)
> - **roadmap 状态**：[roadmap.md §M14](../roadmap.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环) + [§M15](../roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + Milestone 概述表 M14/M15 行
> - **archive 索引**：[archive/index.md §4 当前基线](index.md) + §5 近期归档批次登记 M14/M15 行
> - **M14 关键 commit 实证**：T1310 `300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d` / `1fd38c1` / M14.1 收口 / M14.2 `81bd8d2` `581e1a9` `1a9eddf` 收口 + `17b5643` / M14.3 `5ccaaf4` / M14.x `92cc348` `ea0e24f` `84b4e1a` `b45f55e` / M14.y dependabot PR commits
> - **M15 关键 commit 实证**：`5c65177` P 阶段 docs + `1112017` UX-R2 实施（5 文件 / +425/-12）+ `0a60e3d` test 覆盖（2 文件 / +251）+ `d517a7f` release.yml CI 修复（不计入 M15 总投入）
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见下方 §M14 段 + §M15 段

---

## M14: platform release 通道闭环 + UX 反馈跟进（M14.1/2/3/x/y 全部已闭环）

> **归档日期**：2026-08-26
> **阶段摘要**：M13 闭环后承接 T1310 F 阶段闭环 + backlog UX-R1 扫描历史分页（用户实测反馈痛点）+ M13.4 T1403 follow-up（轻量收尾）+ neat-freak 批次治理 + 依赖批量治理。按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件需拆分）拆为 **4 子阶段独立闭环 + M14.y 依赖批量治理同步推进**：M14.1 T1310 F 阶段闭环 / M14.2 UX-R1 扫描历史分页 / M14.3 M13.4 T1403 follow-up / M14.x neat-freak 批次（wisdom 蒸馏 17>15 阈值 + C34 挂接盘点 + test 名清理 + git.md 格式修复）/ M14.y 依赖批量治理（4 个 dependabot major PR：#31 octokit/request-error 5→7 / #32 better-auth 1.6→1.7 + 新 PR #53 / #39 conventional-changelog 7→8 加 dependabot ignore / #49 PrimeVue 4→5 暂缓登记 backlog）。
> **状态**：✅ M14.1 全部完成（1 子任务 / 7 commits：T1310 ahead 5 + P 阶段规划 1 + M14.1 收口 1；ahead=0 已推送）/ ✅ M14.2 全部完成（5 commits：4 atomic commits 后端分页 + RepoHistoryDialog Paginator + 次级调用方适配 + i18n + e2e + 收口登记 + M14.2 changelog 钩子 stage 落档 1；ahead=0 已推送）/ ✅ M14.3 全部完成（1 子任务 / 2 commits：`17b5643` M14.2 changelog 钩子 stage 落档 + `5ccaaf4` M14.3 e2e + 收口登记；ahead=0 已推送）/ ✅ M14.x neat-freak 批次全部完成（4 atomic commits：wisdom 蒸馏 + C34 规范挂接 + test 名清理 + git.md 格式修复；ahead=0 已推送）/ ✅ M14.y 依赖批量治理（4 个 dependabot major PR；ahead=0 已推送）

### 阶段闭环清单

#### M14.1 T1310 F 阶段闭环 ✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1310 platform 进入 release 通道**（ahead 实施 + F 阶段闭环） | `300b318` + `1819b59` + `733e198` + `7b40a2c` + `a74d07d` + `1fd38c1` + 收口 commit | `scripts/packages.config.mjs` 新增 apps/platform 条目（`npmPublishable:false`）+ `release-publish.mjs` 新增 tag-only action + `docker.yml` 支持 workflow inputs 读 platform_version + `release.yml` 完成后触发 docker workflow_dispatch + `docs/guide/release.md` 平台独立通道文档 + dependabot 排除 `apps/platform/package.json` + F 阶段完整本地验证（lint/typecheck/test/test:coverage 4 维度全 ≥80% / verify:changelog / changelog 幂等 / release:publish --dry-run platform tag-only 路径 / @dependfix/platform build 成功） |

#### M14.2 UX-R1 扫描历史分页 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R1 扫描历史分页**（后端 + 4 个前端调用方适配 + silent bug 修复 + e2e + i18n） | `81bd8d2` + `581e1a9` + `1a9eddf` + 收口 commit | `/api/runs` 新增 zod safeParse 校验 `page`（默认 1 / 最小 1）/ `pageSize`（默认 100 / 钳制 200）/ `repositoryId` / `ids`（逗号分隔 run id 列表）；返回结构变更为 `{items, total, page, pageSize}`；`findAndCount` 同步应用过滤；向后兼容（pageSize 缺省 = 100 既有 take 行为；items 字段既有结构不变）。前端 4 调用方适配（RepoHistoryDialog 接 PrimeVue 4 lazy + 内置 paginator + paginator-template + current-page-report-template i18n 嵌套占位符 + 跨仓库切换重置 first/pageSize + alerts.vue §openRunSidebar silent bug 修复：原 server 忽略 ids 返回全量 run → 现真正按 ids 过滤返回该告警 affected runs + repos/[id]/runs.vue 适配 + i18n `runs.paginatorInfo` 双语）。后端单测 +6 case（默认分页 / ids 过滤 / page+pageSize / pageSize 钳制 / 400 page / 400 pageSize）；e2e +1 case "Paginator 翻页验证"（seed 11 条 → 默认 pageSize=10 → NextPage → page=2 断言 URL searchParams）；既有 2/2 case 不破坏。A 阶段 standard Round 1 Reject 6 warning + 1 suggest → Round 2 quick Pass |

#### M14.3 M13.4 T1403 follow-up ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T1403 follow-up 首屏默认 dedupe=across 请求 URL 断言** | `17b5643` + M14.3 e2e + 收口 commit | alerts-rowgroup.e2e.test.ts 新增 1 case `首屏默认 dedupe=across → 首次 /api/alerts 请求 URL 含 ?dedupe=true`，复用既有 MOCK_ALERTS + page.route mock 基础设施，与既有"视图切换：dedupe 模式触发 /api/alerts?dedupe=true + 显示聚合列"case 互补（手动切换路径已有覆盖，首屏默认路径此前无 case）；既有 5 active + 2 fixme case 不破坏（第 1 次 7/7 passed 32.0s + 第 2 次 7/7 passed 31.0s 幂等通过）；A 阶段 quick depth Pass（0 blocker / 0 warning / 1 suggest 注释占 4 行可读性提示） |

#### M14.x neat-freak 批次 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **wisdom 蒸馏**（活跃 17 → 14 ≤ 15 阈值，挂接 3 条 M14.x pattern） | `92cc348` | ai-collaboration.md §2.P.1 ahead 状态动态描述原则新增子节 + §4.4 coverage 强制（hard requirement）强化 + planning.md §4.4 §5 ahead commits 实证 + 动态描述强化 + §4.4 §8 算式校对新增子节；3 条 pattern：pattern-F 阶段-coverage-强制（M13.3 CI Coverage 79.98% < 80% 教训）/ pattern-算式校对-archive-批次（M13 归档批次 24 → 26 commits 算式校对教训）/ pattern-P 阶段规划-ahead-动态描述（M14.1 P 阶段规划 commit `1fd38c1` ahead 数字写死 + T1402+T1303 typo 教训）；教训 commit 引用 `1fd38c1` / `e7103f6` / `3621982` / `e9987f9` / `0c57211` / `e63cdb9` |
| **C34 存量规范必级条款挂接盘点 + code-quality-checklist.md 双层对称补挂接** | `ea0e24f` | 5 个新必查项：分级审计协议（audit-depth）/ 单次提交审计阈值（10 文件 / 800 行）/ 验证分级矩阵（最低验证要求）/ F 阶段本地验证必须含 coverage 必查项（hard requirement）/ audit warning 修复决策协议（修复 vs 登记 backlog）；每个必查项含必查场景 + 规范参考链接 + 教训 commit 实证；按 documentation.md §4 规范单点声明原则双层对称 |
| **admin/i18n e2e C65-A1/A2/A3/A4 test 名孤立编号清理** | `84b4e1a` | admin.e2e.test.ts 3 处 + i18n.e2e.test.ts 1 处 = 共 4 处 test name 重命名（仅改 test name 字符串，断言 + mock + 测试逻辑零改动）；22 e2e passed（1.3m）行为不变；编号标记扫描 0 命中 |
| **git.md §3.4 后双空行格式修复** | `b45f55e` | git.md line 107-108 连续 2 空行 → 1 空行（markdownlint MD012 no-multiple-blanks 友好）；其他 standards 段（development / testing / security / ai-collaboration / platform / planning / documentation）扫描 0 处残留 |

### 阶段验收标准（M14.1/2/3/x/y 全部闭环 ✅）

- [x] M14.1 T1310 F 阶段闭环 —— 完整本地验证全绿（lint/typecheck 0 error / test 2230 passed + 5 skipped / test:coverage 4 维度全 ≥80% / verify:changelog exit 0 / changelog 7 段幂等 unchanged / release:publish --dry-run platform tag-only 路径确认 / @dependfix/platform build 成功 23.1 MB）
- [x] M14.2 UX-R1 扫描历史分页 —— 完整本地验证全绿（lint/typecheck 0 error / test 2236 passed + 5 skipped / coverage 4 维度 ≥80% / @dependfix/platform exec playwright test history-dialog 3/3 passed / @dependfix/platform build 成功 23.1 MB）
- [x] M14.3 M13.4 T1403 follow-up —— 完整本地验证全绿（lint/typecheck 0 error / @dependfix/platform exec playwright test alerts-rowgroup 7/7 passed 第 1 次 32.0s + 第 2 次 31.0s 幂等通过 / @dependfix/platform build 成功）
- [x] M14.x neat-freak 批次 —— 完整本地验证全绿（check:docs 99 links + 55 vue-interp OK / lint:md 0 error / typecheck 0 error / lint 0 error / @dependfix/platform exec playwright test admin i18n 22/22 passed / @dependfix/platform build 成功 23.1 MB / distill:wisdom WISDOM_OK 14 ≤ 15 阈值 / 编号标记扫描 0 命中）
- [x] M14.y 依赖批量治理（4 个 dependabot major PR）—— #31 octokit/request-error 5→7 rebase 后自动合 / #32 better-auth 1.6→1.7 + generic OAuth 重写适配已闭 + 新 PR #53 / #39 conventional-changelog 7→8 加 dependabot major ignore / #49 PrimeVue 4→5 暂缓已闭登记 [backlog.md §延期 / 暂缓项](../backlog.md#延期--暂缓项)；commit `bcafa71` M14.y 依赖批量治理进度登记 + 多个 dependabot PR commits
- [x] `pnpm check:docs` 全过（实测验证 OK）

### 阶段治理记录（M14.1/2/3/x/y）

- **M14.1 总投入**：7 commits（T1310 ahead 5 commits + P 阶段规划 1 commit + M14.1 收口 1 commit）/ 1 子任务
  - 注：T1310 5 commits（`300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d`）属于 T1310 子阶段（与 M13 同步推进），ahead 计数不计入 M13 ahead=3；M14.1 ahead=1 仅 P 阶段规划 commit `1fd38c1`（`git rev-list HEAD ^origin/master --count` 实证）
- **M14.2 总投入**：5 atomic commits（后端分页 1 + RepoHistoryDialog Paginator 1 + 次级调用方 + i18n 1 + e2e + 收口登记 1 + M14.2 changelog 钩子 stage 落档 1）/ 1 子任务
  - 注：ahead commits 实证 `git rev-list HEAD ^origin/master --count` 动态核验（不写具体数字以免 staleness，详见 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范)）
- **M14.3 总投入**：2 atomic commits（M14.2 changelog 钩子 stage 落档 1 + M14.3 e2e + 收口登记 1）/ 1 子任务
  - 注：M14.2 changelog 钩子 commit `17b5643` 实质属 M14.2 收口衍生（husky post-commit 钩子 pnpm changelog 自动 stage），归到 M14.3 总投入统计更准确
- **测试覆盖**：vitest 2236 passed + 5 skipped（157 files，baseline 2230 + M14.2 +6 case）/ coverage 4 维度全 ≥80% 阈值
- **e2e 覆盖**：history-dialog 既有 2/2 + M14.2 新增 1/3 case；alerts-rowgroup 既有 5 active + 2 fixme + M14.3 新增 1 case 第 1 次 7/7 + 第 2 次 7/7 幂等通过
- **审计覆盖**：
  - M14.1：F 阶段收口归档未触发新增 A 阶段审计（T1310 5 commits 在 M13 阶段已通过 Review Gate 标准）
  - M14.2：A 阶段 standard Round 1 Reject 6 warning（孤立编号违规）+ 1 suggest（watch 切换仓库未重置 first/pageSize）→ Round 2 quick Pass（W1-W6 编号清理按 "带文档路径的导航指针" 例外规则 + S1 顺手修复）
  - M14.3：A 阶段 quick depth Pass（0 blocker / 0 warning / 1 suggest 注释占 4 行可读性提示）
  - M14.x：A 阶段 standard depth Pass（0 blocker / 2 warning + 1 suggest 闭环 —— W1 §1.1 1.4 文本歧义已修复为三链接分开 + W2 §2.2 第 6 类改动类型已同步规范 + S1 todo.md 计划段"2 条 pattern"差异已在收口 commit 同步更新为 3 条 + scope 扩展理由登记）
- **M14.x 总投入**：4 atomic commits（wisdom 蒸馏 1 + C34 规范挂接 1 + test 名清理 1 + git.md 格式修复 1）+ 收口 commit 1 / 1 子任务
  - 注：ahead commits 实证 `git rev-list HEAD ^origin/master --count` 动态核验（不写具体数字以免 staleness）
- **wisdom 蒸馏统计**：活跃条目 17 → 14（-18%，≤ 15 阈值达标）。3 条 M14.x 新增 pattern 挂接到 standards 权威章节，wisdom 文件本身 gitignored（不入仓库）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M14 段（原主窗口；2026-08-31 M19 归档批次预防性分片迁出至本文件 §M14）
  - `docs/plan/todo.md` §M14.1 [x] + §M14.2 [x] + §M14.3 [x] + §M14.x [x] + 顶部 banner 更新
  - `docs/plan/roadmap.md` M14 状态更新

### 关键决策（M14.1/2/x）

**M14.1：**

**M14.1：**
- **apps/platform 独立通道**：仿 momei 单包"独立 version + 独立 CHANGELOG"精神，适配 dependfix monorepo + docker-only 平台；`scripts/packages.config.mjs` 新增 `npmPublishable:false` 字段（缺省 true 保 5 个现有 npm 包行为 0 改动）
- **tag-only action**：当 `npmPublishable === false` 时跳过 `pnpm publish` 但仍创建 annotated git tag（changelog 历史比较需 prev tag 锚点；不打 tag → 永远孤立首段，history diff 不可用）
- **docker 与 release 触发闭环**：`release.yml` 完成后主动 `workflow_dispatch docker.yml` 传 `platform_version` 入参；`docker.yml` master 自动 push 仍走 `latest+date+sha`，不挂 version tag（保持简洁时序模型：version tag = release 完成事件 = 一次性产物）
- **dependency backflow 预期**：`apps/platform` 依赖 `@dependfix/core/engine/cli`（`workspace:*`），release:version 提升 core/engine 时 `buildDepGraph` 会让 platform 至少 patch 跟随——预期行为，无需防御
- **F 阶段本地验证口径**（[AI 协作规范 §4 修复工作流原则](../../docs/standards/ai-collaboration.md) + §4.4 F 阶段本地验证口径差异 hard requirement）：本次 F 阶段"完整验证"含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度 ≥ 阈值；CI Coverage 79.98% < 80% 二次复发风险已通过 `e63cdb9` 教训固化，本批次验证全部 ≥80%（branches 80.22% / statements 85.13% / functions 84.91% / lines 85.23%）

**M14.2：**
- **API 返回结构 `{items, total, page, pageSize}` 而非 `{data, meta}`**：保持与 [apps/platform/server/api/alerts/index.get.ts](../../apps/platform/server/api/alerts/index.get.ts) 既有风格一致（M13.2 T1306 已闭环）
- **pageSize 静默钳制 200**：zod schema `.transform(v => Math.min(v, PAGE_SIZE_MAX))` 超出自动钳制，不抛错；防止单次拉取过大影响性能；既有调用方不传 pageSize = 默认 100 行为不变
- **4 个前端调用方逐一适配**（规划盲区修订）：M14.2 规划文档列 3 个前端调用方，实施中发现 `apps/platform/app/pages/repos/[id]/runs.vue`（保留 backlog.md §C58 候选删除兼容路径）也调用 `/api/runs?repositoryId=...`，纳入 commit 3 一并适配 —— batch-runs.vue 实际不调用 `/api/runs`（BatchRun 维度与 ScanRun 维度正交）
- **silent bug 一并修复**：实施中实证 alerts.vue §openRunSidebar 此前用 `ids` 参数调用 `/api/runs`，但原 server 忽略 `ids` 返回全量 run —— M14.2 commit 1 server 加 `ids` 支持后，sidebar 真正只返回该告警 affected runs（修复 + 影响范围扩大，但低风险，scope 仍属 UX-R1）
- **pageSize 默认 10 而非 100**：RepoHistoryDialog 在 720px 宽 Dialog 内显示 7 列 DataTable，默认 pageSize=100 会出现 99 行空占位；改用 pageSize=10（DataTable 内部默认）+ options `[10, 25, 50]` + server 钳制 200 上限，三层一致
- **跨仓库切换重置 first/pageSize**：A 阶段审计 suggest#1 —— 用户从 repo A 翻到 page=3 后切换到 repo B，原实现 `first.value` 残留 30 导致 UI 高亮页与 server 数据不一致；在 watch 分支加 `first.value = 0` + `pageSize.value = 10` 重置，与 closeDialog() 对齐

**M14.x：**
- **wisdom 蒸馏阈值预警线策略**：[规划规范 §4.3](../../docs/standards/planning.md) 强制要求活跃 ≥ 20 必须蒸馏；本批次 17 条采用"预警线"策略提前蒸馏避免频繁中断（与 M13.1 T1301 / T1302 蒸馏批次参照模式一致）
- **wisdom 蒸馏 scope 扩展**（3 条 vs 计划 2 条）：原计划仅含 pattern-F 阶段-coverage-强制 + pattern-算式校对-archive-批次；实施中发现 M14.1 P 阶段规划 commit `1fd38c1` ahead 数字写死 + T1402+T1303 typo 是真实教训，由 M14.1 收口 commit `e7103f6` 修正——已超出原计划 2 条需补登记 scope 扩展（todo.md §M14.x line 269 已同步更新）
- **C34 范围控制**：仅补挂"必须级"条款（5 个新必查项），不补"建议级"——避免 checklist 膨胀
- **test 名孤立编号清理策略**：保留功能语义，重命名为业务描述（如 `test('C65-A1：自己 row 的 role Select 含 disabled（防止自我降级）')` → `test('自己 row 的 role Select 含 disabled（防止自我降级）')`）；不删除测试用例
- **git.md 双空行 vs markdownlint MD012**：git.md §3.4 后 line 107-108 连续 2 空行违反 markdownlint MD012 no-multiple-blanks；保留"§3.4 type 选择校准"作为 §3.4 子内容（不单独成节）—— 修复为 1 空行保留与 §4 章节的视觉分隔

### 阶段关键经验（已沉淀至项目知识库）

- **apps/platform docker-only 平台独立通道模式**：依赖 docker workflow 而非 npm publish 的发布单元，独立 version + 独立 CHANGELOG + tag-only action 3 件套，可被其他 monorepo 项目复用
- **`npmPublishable` 字段语义扩展**：`scripts/packages.config.mjs` 新增字段保 npmPublishable=true 缺省行为（5 个现有 npm 包 0 改动），仅显式置 false 的 platform 走 tag-only；通过字段扩展而非新分支逻辑收敛代码路径
- **F 阶段本地验证强制 coverage**（二次固化）：本次 M14.1 F 阶段验证包含完整 test:coverage 4 维度 + ahead=1 待用户推送（与 M13.3 CI Coverage 79.98% 实证教训 + [规划规范 §4.4 大批量归档批次操作规范 §算式校对](../../docs/standards/planning.md#44-大批量归档批次操作规范) 一致）
- **M14.2 silent bug fix during feature implementation**：实施中实证 alerts.vue §openRunSidebar 此前传 `ids` 但 server 不支持（silent bug），建议所有"前端用某个参数但 server 不识别"的代码路径在 feature 实施时主动 grep 实证，避免无声回归
- **M14.2 PrimeVue 4 Paginator + vue-i18n 嵌套占位符**：PrimeVue CurrentPageReport 模板用 `{first}` / `{last}` / `{totalRecords}` 占位符，vue-i18n 先做字面替换（i18n 字符串中 `{first}` → `{first}` 字面），PrimeVue 再做数值替换 —— 嵌套转义机制需保持 i18n 字符串占位符与 PrimeVue 占位符同名同结构
- **M14.x wisdom 蒸馏 scope 扩展协议**：wisdom 蒸馏批次实施时可主动扩展 scope（如 M14.x 从 2 条扩到 3 条），条件是真实 commit 教训触发（M14.1 P 阶段规划 commit `1fd38c1` ahead 数字 + typo 实证），且 todo.md 计划段同步登记 scope 扩展理由；不允许静默扩展
- **M14.x code-quality-checklist 双向同步**：checklist 必查项与 standards 条款**双层对称**（checklist 详版章节 + standards 权威声明）—— 任一方扩展另一方必须同步（如 M14.x audit 实证 §2.2 第 6 类扩展需同步 ai-collaboration.md §2.2 表 + checklist §验证分级矩阵）
- **M14.x audit warning 修复 vs 登记决策**：W1/W2 修复（低成本 + 文本歧义 + 规范扩展——属于"修复"判定）+ S1 登记 todo.md 收口 commit 处理（属于"登记 backlog"判定）。详见 [ai-collaboration.md §4.6 audit warning 修复决策协议](../../docs/standards/ai-collaboration.md) 实证

### 待迁移经验（next neat-freak 候选）

- **M14.x 已闭环**：wisdom 蒸馏（17 → 14）+ C34 挂接盘点（5 个 checklist 必查项）+ test 名清理（4 处 C65-A1/A2/A3/A4）+ git.md 格式修复（双空行）—— M14 阶段全部 4 子阶段闭环完成，下次 neat-freak 批次触发条件为 wisdom 活跃 ≥ 20 阈值（按 [规划规范 §4.3](../../docs/standards/planning.md)）
- **M14.2 silent bug fix 经验沉淀**：本次新增 1 条 M14.2 silent bug fix during feature implementation pattern 经验，建议沉淀到 `docs/standards/platform.md §3.5 TypeORM 查询模式` 或独立段
- **M14.2 PrimeVue Paginator + i18n 嵌套占位符经验**：建议沉淀到 `docs/standards/platform.md §7.1 PrimeVue 4 集成实践`
- **M14.x §3.4 type 选择校准 vs §4 章节边界**：git.md 修复双空行时保留 §3.4 子内容（type 选择校准）作为该 section 子内容，不单独成节——若未来增长可独立成 §3.5
- **T1310 follow-up**：T705（生产级部署 PG+Helm+Sentry）落地后，platform 1.0 节奏评估（已在 todo.md §M14.1 follow-up 登记）
- **T1310 follow-up**：T703（跨平台 GitLab/Bitbucket）落地后，platform release 触发的版本文档是否需要补"跨平台适配"段
- **docker `platform-<x.y.z>` tag 镜像 SBOM / provenance attestation 配合**：当前 ACR 个人版不支持，待官方支持后补

---

## M15: 扫描历史详情侧栏增强（UX-R2）（已闭环）

> **归档日期**: 2026-08-26
> **阶段摘要**: M14.2 UX-R1 闭环后承接 UX-R2，在 alerts 去重视图中增强受影响运行 Sidebar 可辨识度——展示运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间与持续时间，按执行器显示 GitHub Action 外链；新增独立 RunDetailDialog 复用 `GET /api/runs/:id` 与 `requestSequence` 守卫。**不**触碰 `/api/runs` 后端契约、**不**动 `RepoHistoryDialog.vue`、**不**做数据层迁移 / PrimeVue 升级 / C36/C37 i18n。UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属 backlog 候选（高风险，跨 5+ 文件），顺延 M16。
> **阶段边界**: M15 只实现 UX-R2，scope 严格收敛以避免阶段膨胀。
> **状态**: ✅ 全部完成（M15 1 子阶段 / 4 子任务全部闭环 / 2 轮 code-auditor quick depth Pass / ahead 部分待用户推送）

### 阶段闭环清单

#### M15.1 UX-R2 扫描历史详情侧栏增强 ✅（2026-08-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R2-A 扩展 Sidebar 运行视图**（5 列运行元数据 + utility 抽取 + i18n） | `1112017` | `alerts.vue` §RunDetailView 新增运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间与持续时间；复用既有 `/api/runs` 数据 + `requestSequence` 守卫防过期响应；空字段与缺失时间稳定降级。**`1112017` 实际包含（实证 `git show --stat`）**：① `apps/platform/app/components/RunDetailDialog.vue` 新增 279 行 + `apps/platform/app/pages/alerts.vue` 增改 97 行 + `apps/platform/app/utils/run-view.ts` 新增 47 行（5 文件 / +425/-12）；② 抽取 6 工具函数（`shortRunId` / `alertsFound` / `runModeLabel` / `runExecutorLabel` / `runThresholdLabel` / `formatRunDuration`）统一 alerts 与 RunDetailDialog 调用；③ i18n 中英文各新增 7 个 alerts 键（运行 ID / 模式 / 阈值 / 执行器 / 告警数 / 耗时 / 时长格式）+ `runs.statusDegraded` 退化文案 |
| **UX-R2-B 按执行器控制 Run URL**（条件渲染） | `1112017` | Sidebar 运行外链仅 `executorKind === 'github-action'` 且存在 `runUrl` 时显示；容器 + sandbox 隐藏内部 URL；**不**伪造内部 Run URL；既有 GitHub Action 链接保持可点击 |
| **UX-R2-C 补充详情入口**（RunDetailDialog 复用现有详情接口） | `1112017` | 同 A 段：`apps/platform/app/components/RunDetailDialog.vue`（279 行）+ 复用 `GET /api/runs/:id` 与 `requestSequence` 守卫防 stale 覆盖；失败 Error Banner 与 GitHub Action 外链独立展示；**不**在 Sidebar 内重复结果表格；加载失败与空结果不阻塞 Sidebar 列表 |
| **UX-R2-D 回归与收口**（单测 + e2e 覆盖） | `0a60e3d` | `0a60e3d` 实际仅含测试文件（实证 `git show --stat`：2 文件 / +251 行），**不**含 utility / i18n / `runs.statusDegraded`（这些均在 `1112017`）。本 D 段交付物：① `apps/platform/tests/unit/run-view.test.ts` 新增 104 行 / 16 case 单测——覆盖 6 工具函数所有分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期边界）；② `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts` 新增 147 行 / 2 case e2e——覆盖 Sidebar 元数据展示 + GitHub Action / 容器 URL 条件渲染 |
| **M15 P 阶段规划 + docs 切换** | `5c65177` | `todo.md` 顶部切换 M15 + `backlog.md` §扫描历史与详情 UX UX-R2 主条目状态切换 + `roadmap.md` M15 段新增 + `archive/index.md` 基线更新（M15 仅承接 UX-R2，UX-R3 顺延 M16） |

### 阶段验收标准（M15 全部闭环 ✅）

- [x] 4 子任务（UX-R2-A / -B / -C / -D）全部闭环 —— Sidebar 5 列运行元数据 + Run 外链按执行器条件渲染 + RunDetailDialog 详情入口 + i18n + 单测 + e2e
- [x] A 阶段 2 轮 code-auditor quick depth Pass（[code-auditor.agent.md §3 quick depth 协议](../../.github/agents/code-auditor.agent.md)）—— Round 1 Reject 1 blocker（B1 `alertsFound` 误用——函数签名变更未同步调用方；详 Pattern §3 同模式扫描）+ Round 2 Pass（B1 修复 + utility 抽取 + 16 case 覆盖所有分支 + 4 suggest 顺手处理：S1 `runModeLabel` 分支补测 + S2 阈值展示一致性 + S3 alerts.vue 行数 827 未触发 max-lines 规则 + S4 e2e 中文硬编码暂保留与既有 alerts-rowgroup 风格一致）
- [x] `pnpm lint` 0 error / `pnpm typecheck` 0 error
- [x] vitest 单测全过（run-view.test.ts 16 case + 既有 2128+5skip）+ coverage branches 80.12% ≥ 80% 阈值
- [x] `@dependfix/platform exec playwright test alerts-sidebar` 2/2 通过；既有 alerts-rowgroup 5 active + 2 fixme 行为不变
- [x] `pnpm run check:docs` OK（99 md links + 55 vue-interp 全过）
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] **不**修改 `/api/runs` 契约（M14.2 已闭环分页 + `ids` 过滤契约，M15 仅消费既有 contract）；**不**动 `RepoHistoryDialog.vue`；**不**扩数据层；**不**升 PrimeVue；**不**做 C36/C37 i18n

### 阶段治理记录

- **总投入**: 3 commits ahead（M15 实施：`5c65177` M15 P 阶段 docs 切换 + `1112017` M15.1 UX-R2 实施 + `0a60e3d` M15.1 回归覆盖） + 本批次归档 1 个 atomic commit（跨 5 文件）。注：`d517a7f ci: release.yml Create GitHub Release 步骤补 GH_TOKEN env` 属于 release.yml CI 修复，**不**计入 M15 总投入
- **测试覆盖**: +18 case（`run-view.test.ts` 16 case + `alerts-sidebar.e2e.test.ts` 2 case）；既有 alerts-rowgroup 7 case（5 active + 2 fixme）行为不变
- **branches coverage**: 80.12% ≥ 80% 阈值（M15 仅前端 + i18n + utility 抽取 + 单测 + e2e 改动，未触发后端 schema → 不致 Coverage 回归）
- **审计覆盖**: 2 轮独立 Review Gate quick depth Pass（Round 1 1 blocker + Round 2 0 blocker / 0 warning 新增 / 4 suggest）；按 [AI 协作规范 §1.3 分级审计执行协议](../../docs/standards/ai-collaboration.md) 选 quick depth（理由：M15 不涉及架构 / 不跨模块 / 不涉及安全敏感代码，但涉及 utility 抽取 + 跨文件调用方类型契约 → 审计不可降级到最低 depth）
- **ahead commits 实证**: `git rev-list HEAD ^origin/master --count` 当前值为 M15 实施 3 commits + release.yml CI 修复 1 commit 共 4 commits ahead；按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范) ahead 数字动态核验（不写死具体数字以免 staleness）
- **文档落盘**: `docs/plan/todo-archive.md` §M15 段（原主窗口；2026-08-31 M19 归档批次预防性分片迁出至本文件 §M15）+ `docs/plan/todo.md` 顶部 M15 任务清单 → M15 已闭环切换 + `docs/plan/roadmap.md` M15 行/段状态更新（M15 已闭环）+ `docs/plan/backlog.md` §扫描历史与详情 UX UX-R2 闭环迁出至历史归档指针段 + 文档位置速查同步 + `docs/plan/archive/index.md` 基线更新 + M15 归档批次登记
- **本次归档批次附加动作**: §2026-08-20 e2e 修复批次（C62+C63+C64+chore）从 todo-archive.md 主窗口迁出至 [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（主窗口 700 行分片阈值前的预防性迁出，与 §2026-08-20 平台 UI 增强 C59-C61 同源——属 M11 关联批次）

### 关键决策（M15）

- **A 阶段 Quick depth 第 1 轮 Reject B1 root cause 实证**: `alertsFound` 函数签名变更未同步调用方 —— `Code Auditor quick depth` Pass 模式在 M15 小范围改动下命中 1 blocker；本批次 F 阶段本地验证虽通过，**但**审计仍捕获"实现已通过单测但调用方未对齐签名"的盲点（`pnpm typecheck` 0 error **不**捕捉 vitest mock 下的类型错误）—— 审计 depth 选择以"改动是否涉及架构 / 跨模块 / 类型契约"为准，**不**以"改动小"为降级标准
- **不修改后端契约降低风险**: M15 严格限定"消费既有 `/api/runs` 契约"不修改后端 schema —— 既有的 `alerts.vue §openRunSidebar` 调用 `/api/runs?ids=...` + `RepoHistoryDialog` Paginator + `repos/[id]/runs.vue` 等 4 调用方不破坏；M14.2 已有分页 + `ids` 过滤契约即够 UX-R2 消费
- **utility 抽取降低重复**: 实现收尾时 audit suggest 顺手抽出 6 个纯函数到 `run-view.ts`，单测 16 case 一次性覆盖所有分支；后续 M16/M17 如遇类似格式化需求可复用本 pattern（"先实现再看是否需要抽取"的反向顺序在 audit suggest 触发后采纳）
- **Sidebar 字段优先级**: 5 列选运行短 ID / 模式 / 严重级别阈值 / 执行器 / 告警数 / 开始时间 / 持续时间 —— 用户痛点：同一告警关联多次运行时 Sidebar 仅显示仓库名 + 状态，无法区分运行实例；新增字段复用既有 `/api/runs` 数据，零额外请求
- **不实现 UX-R3 scope 严格收敛**: UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属 backlog 候选（高风险，跨 5+ 文件）—— M15 严格限定 UX-R2 scope 以避免阶段膨胀；UX-R3 顺延 M16 启动前需先做 §M16 P 阶段规划（按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md) 拆分子阶段）

### 阶段关键经验（已沉淀至项目知识库）

- **A 阶段 quick depth 在小改动下仍命中 blocker**: M15 改动范围小（alerts.vue + RunDetailDialog + run-view.ts + tests）但 audit quick depth Round 1 Reject 1 blocker（B1 `alertsFound`）—— 审计 depth 选择**不**以改动大小为降级标准，改以"是否涉及架构 / 跨模块 / 类型契约"为准。本批次改动虽小但涉及 utility 抽取 + 跨文件调用方，audit depth 不可降级
- **utility 抽取 vs 实现优先 reverse pattern**: 本批次 audit suggest 顺手抽出 run-view.ts 6 函数（原计划仅实现）—— 说明"先实现再看是否需要抽取"在 audit suggest 触发后可采纳，与 M14.x `test 名孤立编号清理` 同模式（audit suggest 触发顺手处理）
- **`pnpm typecheck` 不捕捉 vitest mock 下类型错误**: A 阶段 B1 命中根因 —— vitest `vi.mock` 可能跳过部分类型检查路径，F 阶段本地验证 `typecheck 0 error` **不**是 audit 替代；audit depth 选择仍需 standard 或 quick + audit agent 独立核验
- **退化 / 边界稳定 design pattern**: 空字段降级（`run.shortId` 缺失不显示 ID cell 而非 `undefined`）+ 加载失败 / 空结果不阻塞 Sidebar 列表 —— 长尾运行数据缺失场景用户体验稳定；建议沉淀到 `docs/standards/platform.md`（待 neat-freak 批次）
- **新增 utility 单测一次性覆盖所有分支**: 抽取 6 函数后单测 16 case 一次到位（不依赖"先测一两个 case 再补"）—— audit S1 suggest 顺手补 `runModeLabel` 分支覆盖即是审计+开发的近距离协作案例

### 待迁移经验（next neat-freak 候选）

- **运行元数据展示一致性**: Sidebar 5 列 + RowGroup 显示的 run 状态/告警数应在 dashboard / batch-runs 也保持一致格式 —— 当前 `alerts.vue` Sidebar 字段格式若与 `batch-runs.vue` 不一致会触发 UX 反馈；建议下次 neat-freak 批次统一抽出 `run-view.ts` 共用（batch-runs 同步抽取）
- **e2e 中文硬编码 vs i18n 决策**: A 阶段 audit S4 暂保留 `alerts-sidebar.e2e.test.ts` 中文硬编码（与既有 alerts-rowgroup 风格一致）—— 项目级 e2e 中文 vs i18n 决策待下次 neat-freak 统一（i18n e2e 维护成本 vs 稳定性收益评估）
- **run-view.ts 抽取 spread 到其他页面**: 当前 utility 仅供 `alerts.vue` 使用 —— `batch-runs.vue` / `repos/[id]/runs.vue` / `RunDetailDialog.vue` 未来如有类似格式化需求可参考本批次抽取模式；建议作为"action: 观察下次相关需求出现"
- **UX-R3 上收时机**: backlog UX-R3（`/scans` 独立页面 + 替代 RepoHistoryDialog）属候选（高风险 / 5+ 文件）—— M16 启动时建议先做 P 阶段规划拆分子阶段（M16.1 summary API + M16.2 页面骨架 + M16.3 RepoHistoryDialog 迁移）