# M24 阶段归档：PR Check MVP + 治理债 + 测试补强 + 用户体验

> **2026-09-03 M24 归档批次预防性分片迁出**：本分片包含 M24 阶段 5 原子条目（M24.1 / M24.2 / M24.3 / M24.4 / M24.5）12 commits / ~2960 行净增的完整实施记录 + 关键经验 + 待迁移经验。主窗口 [todo-archive.md §M24](../todo-archive.md#m24-pr-check-mvp--治理债--测试补强--用户体验m241m242m243m244m245-全部已闭环--2026-09-03-归档) 仅保留导航指针。

## 阶段摘要

- **目标**：方案 B（能力突破优先）—— 5 原子条目独立闭环覆盖能力扩展 / 治理收口 / 测试补强 / 用户体验 4 个维度
- **关键决策 D1-D8**：PRCheck 实体设计（per-PR-head 模型） + 5min polling + 失败 firing + 手动 schedule + webhook 接口预留 + per-org scope + env 开关 + mergify 解耦
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = 3（4 commits 已推 origin/master）—— M24 阶段 12 commits ahead/已推混合
- **行净增**：~2960 行（PRCheck 实体 230 + service 940 + API 730 + UI 490 + UI follow-up 30 + UI 重构 90 + Phase 5 docs 127 + M24.2 docs 195 + CI 修复 5 + M24.3 docs 25 + M24.4 docs 25 + Wisdom 蒸馏 75）

## 完整实施记录（5 原子条目 × 12 commits）

### M24.1 [P1 🚀 能力] PR Check 状态监测 MVP（7 commits / 5 phase 串行 / ~2637 行）

| Phase | Commit | 范围 | 关键决策 / 风险 / 教训 |
|:---|:---|:---|:---|
| **Phase 1** PRCheck 实体 | `36ee026` | entity + 3 复合索引 + migration + register（230 行） | §3b 类级复合索引类级声明（避免 synchronize 路径下双声明生成冗余索引） |
| **Phase 2** service + scheduler | `1068d6e` | types + polling-source + action-status-monitor + Schedule.kind + scheduler 分支 + 22 单测 + .env.example（940 行） | 2 次 audit Reject 内联修复（B1 import 错误 + B2 `Array<T>` + 5 warning） |
| **Phase 3** API + i18n | `89e1344` | 4 端点 + 3 PR_CHECK_* 错误码 + ServerErrorCode 扩展 + i18n + 17 单测（730 行） | 1 次 audit Pass（W2 zod .optional() 内联修复） |
| **Phase 4** UI | `e841b82` | pr-checks.vue 单页 + nav + 22 i18n 键（490 行） | 1 次 audit Reject 内联修复（B1 en-US 中文污染 + B2 `:sort-meta` silent ignore） |
| **Phase 4.1** UI follow-up | `19037d5` | 仓库过滤 Dropdown + nav 命名统一（30 行） | — |
| **Phase 4 收尾** 重构 | `4803372` | 命名一致性 + 守卫 DRY + conclusionTagSeverity util 下沉 + 9 单测（90 行） | — |
| **Phase 5** docs 收口 | `7120533` | todo.md 验收 + mergify.yml 注释 + README + experience-archive §五十六（127 行） | D8 mergify 解耦三处同步 |

**M24.1 关键决策 D1-D8 落地**：
- **D1** PRCheck 实体位于 `apps/platform/server/entities/pr-check.ts`（per-PR-head 模型）
- **D2** Polling 间隔默认 5min/仓（service 不内置 timer，由 scheduler 触发）
- **D3** 失败 PR firing alert + ack UI（ack 不修改 conclusion）
- **D4** Schedule.entity 加 `kind: 'scan' | 'pr-check'` 字段
- **D5** webhook 接口预留（PRCheckSyncSource interface + PollingSource implements；WebhookSource 留位）
- **D6** per-org scope（service `pollOnce({ organizationId })`）
- **D7** env 开关 `ACTION_STATUS_MONITOR_ENABLED` 默认 false（triggerPrCheckSchedule runtime check + `skipped: true` 标识）
- **D8** mergify 仍主控（PRCheck 仅监测 + 告警 + ack UI，不阻断 mergify 决策）

### M24.2 [P2 🛡️ 治理] M22.7+M22.8 根因 4 项残留源码排查（1 commit / 195 行）

| Commit | 范围 | 4 项根因候选最终状态 |
|:---|:---|:---|
| `bbb8f30` | todo.md 验收 + experience-archive §五十七 + 3 教训 | ① better-auth transaction 已治本（typeorm-adapter L237-241 走真事务）<br>② Nitro h3 async generator 非根因（fixtures 均为 `async (event) => {}`）<br>③ SQLite WAL M23.1 `2ffaa45` 已闭环<br>④ fixtures 节流经验性方案登记 follow-up |

### CI 修复（1 commit / 5 行）

| Commit | 范围 | 根因 |
|:---|:---|:---|
| `ad1ab17` | pr-checks.vue SCSS 未定义变量修复 | Phase 4 e841b82 commit 未跑本地 `nuxt build` 自检（仅 ESLint + typecheck + vitest）；SCSS 编译错误仅在 build 阶段暴露；`$font-size-2xl` 改 `$font-size-xl` + `$font-family-monospace` 改 `monospace` |

### M24.3 [P3 🧪 测试] cron-preview wall-clock 依赖消除（1 commit / 25 行）

| Commit | 范围 | 关键发现 |
|:---|:---|:---|
| `a0be125` | cron-preview.ts 顶部注释新增"测试 helper 模式评估"段 + todo.md 验收 | M24.3 大部分工作已由 M23.4 commit `df4ba9b` 部分落地（S1 + S2），本批次仅补 S3 注释 + 验收更新 + 5 次跑跨日边界 flaky 验证 |

### M24.4 [P3 🛡️ 治理] M18.x W1+W2 + Code Scanning RG-W01/W02 集中清理（1 commit / 25 行）

| Commit | 范围 | 4 项治理债最终状态 |
|:---|:---|:---|
| `aaf8e7b` | fixers/pnpm L81 + L337 execSync → execFileSync + todo.md 验收 | W1 / W2 / RG-W01 已由 M18.4 / M16.3 / M18.4 阶段闭环（描述 stale 修正）<br>RG-W02 本批次实际修复（todo.md 描述"L144"是 stale，实际 L81 + L337 两处需改） |

### M24.5 [P2 🎨 体验] C36 服务端 API i18n 扩展（已由 M24.1 Phase 3 commit `89e1344` 落地）

- 4 端点 + 3 错误码 + i18n 双语 + 17 单测 + locale 检测（沿用 M16.3）
- todo.md 验收清单 stale 状态同步修正（验收 [ ] → [x] + commit 实证）

### Wisdom 蒸馏（1 commit / 75 行）

| Commit | 范围 | 8 条新 pattern 挂接 |
|:---|:---|:---|
| `7c926a9` | 8 条 M24 pattern 挂接 standards/ + 链接路径修正 | ① pattern-D-stage-self-check-three-commands → ai-collaboration.md §2.0<br>② pattern-i18n-insert-anchor-target-locale → development.md §3<br>③ pattern-PrimeVue-4-multi-sort-meta-prop → platform.md §7.1<br>④ pattern-zod-optional-undefined-trap → development.md §5.1.21<br>⑤ principle-monitoring-vs-merge-decoupling → architecture.md<br>⑥ pattern-better-auth-adapter-transaction-required → platform.md §4.2<br>⑦ pattern-h3-defineEventHandler-async-vs-generator → platform.md §6<br>⑧ pattern-fixtures-no-throttle-by-default → platform.md §3.7.1 |

## 阶段关键经验（已沉淀至项目知识库 / 经验归档）

- **D 阶段自检三向验证纪律**（M24.1 Phase 2 Reject 实证）：D 阶段自检不能仅依赖 `pnpm exec eslint --fix`（自动修复 import/order + eol-last 等警告级问题），必须分别跑 `pnpm exec eslint` 无 --fix + `pnpm --filter @dependfix/platform run typecheck` + `pnpm exec vitest run` 三向独立命令并取 0 error 证据。**根因**：vitest 用 esbuild 转译不触发 TS 严格检查，CI 通过 ≠ 本地 typecheck 通过；CI 自动 rebuild workspace dist 掩盖本地 dev 过期 → 已挂 [ai-collaboration.md §2.0 D 阶段自检三向验证纪律](../standards/ai-collaboration.md#20-d-阶段自检三向验证纪律)
- **i18n locale 文件 insert anchor 必须用目标 locale 实际文本**（M24.1 Phase 4 B1 实证）：locale 文件多段对称（`zh-CN.json` + `en-US.json`），edit 工具 insert anchor 必须用**目标 locale 实际文本**。**根因**：JSON.parse 容忍重复键 last-key-wins，anchor 错位（用 zh-CN 中文文本插入 en-US.json）导致后续段被改写但前端未触发 lint 检测。**M24.1 Phase 4 B1 实证**：en-US.json `alerts.errors.loadFailed` 被中文污染为 `"加载失败：{message}"` → 已挂 [development.md §3 注释规范](../standards/development.md#3-注释规范)
- **PrimeVue 4 DataTable 不支持 `:sort-meta` prop**（M24.1 Phase 4 B2 silent ignore 陷阱）：PrimeVue 4 DataTable 的 sort 状态 prop **仅**有 `v-model:multi-sort-meta`（v-model 形式），**没有** `:sort-meta` / `sortMeta` 等命名。Vue 模板解析时未知 prop 被静默忽略（无运行时错误但也无功能效果——默认排序失效 + 用户点击列头排序无法持久）。**M24.1 Phase 4 B2 实证**：pr-checks.vue `:sort-meta="sortMeta"` 写错导致默认排序 + 用户排序均失效 → 已挂 [platform.md §7.1 PrimeVue 4 集成实践](../standards/platform.md#71-primevue-4-集成实践)
- **zod `.optional()` 接受 undefined 为合法值陷阱**（M24.1 Phase 3 W2 dead code 实证）：`z.enum([...]).optional()` 接受 `undefined` 为合法值（`safeParse(undefined).success = true, data = undefined`），区分「未传字段」与「传 undefined」需**显式** `data !== undefined` 判断。**修正后**：`string` 字段可简化（`safeParse.success ? data : undefined` + 下方 `if (value)` 过滤 falsy），`boolean` 字段必须保留 `!== undefined` 区分「未传」与「false」 → 已挂 [development.md §5.1.21 zod `.optional()` 接受 undefined 为合法值（陷阱模式）](../standards/development.md#5121-zod-optional-接受-undefined-为合法值陷阱模式)
- **监测系统 vs 自动合并解耦原则**（M24.1 关键决策 D8）：依赖监测系统（PRCheck）**不**阻断 mergify 自动合并决策：`mergify 负责通过即合`（按 `check-success=Test` 单条件触发 rebase merge）；`PRCheck 负责失败即显`（监测 + alert firing + ack UI）——两条链路**互不干扰**。**根因**：监测系统目标是"用户感知"（失败即显 + ack），合并系统目标是"通过即合"（check 通过即合）——两类系统目标正交 → 已挂 [architecture.md 主要风险与应对（监测系统 vs 自动合并解耦）](../design/governance/architecture.md#主要风险与应对) + `.github/mergify.yml` 注释 + dependfix README + experience-archive §五十六 三处同步
- **better-auth adapter 必须显式实现 `transaction`（隐性技术债陷阱）**（M24.2 候选 ① 源码追溯）：better-auth 1.7.2 `getBaseAdapter`（`node_modules/.pnpm/better-auth@*/dist/db/adapter-base.mjs:18`）在 adapter 不实现 `transaction` 时**自动 patch fallback** `cb => cb(adapter)`（**非真事务**，仅同步回调）+ logger warn 但**不阻断**业务运行。**M24.2 源码追溯结论**：项目 `typeorm-adapter.ts:237-241` 已实现真事务 `dataSource.transaction(async manager => ...)`，better-auth 走真事务路径（fallback 不适用） → 已挂 [platform.md §4.2 better-auth 认证规范](../standards/platform.md#42-typeorm-adapterserverdatabase-typeorm-adapterts)
- **h3 `defineEventHandler` 行为：handler 是 `async function` 而非 `async function*` generator**（M24.2 候选 ② 源码追溯）：h3 `_callHandler` `await handler(event)` —— handler 返回 `Promise<value>`（普通 async function）或 `AsyncGenerator<T>`（`async function*` generator，不可 await 自动迭代）。**M24.2 源码追溯判定**：fixtures.{post,delete}.ts 与 pr-checks/index.get.ts 等均明确为 `async (event) => { ... }` 普通 async function，**与 M22.7 ECONNRESET 无因果关系** → 已挂 [platform.md §6 API 规范](../standards/platform.md#6-api-规范serverapi)
- **fixtures handler 无节流默认 + 经验性节流方案**（M24.2 候选 ④ 源码追溯）：fixtures handler（`apps/platform/server/api/e2e/fixtures.{post,delete}.ts`）**当前无任何节流 / debounce / rate-limit 代码**，依赖调用方（`tests/e2e/global-setup.ts`）按顺序串行调用。调用频次低（global-setup 阶段 ≤ 2 次），不存在并发资源竞态。经验性节流方案（`apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流）登记 M24.2 follow-up → 已挂 [platform.md §3.7.1 fixtures API 无节流默认 + 经验性节流方案](../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)
- **todo.md stale 状态修正工作流**（M24.2 / M24.3 / M24.4 / M24.5 4 项 stale 同步修正实证）：D 阶段开工前先 rg 实证依赖项实际状态（避免基于 stale 描述定范围）。M24 阶段 5 原子条目有 4 个（M24.2 / M24.3 / M24.4 / M24.5）验收清单在 todo.md 落档时为 `[ ]`，但实际已由 M16.3 / M18.4 / M23.4 / M24.1 Phase 3 阶段部分或全部闭环。**M24.2 / M24.3 / M24.4 实证**："todo.md 描述行号是 stale" / "todo.md 描述 stale" 需在 D 阶段主动 rg `git log --oneline <files>` 验证。
- **nuxt build SCSS 变量必查**（CI 修复 commit `ad1ab17` 实证）：pr-checks.vue scoped style 用 `$font-size-2xl` 与 `$font-family-monospace` 两个未定义 SCSS 变量——SCSS 编译错误仅在 `nuxt build` 阶段暴露（`vite:css` plugin），lint/typecheck/vitest 不会捕获。**Phase 4 e841b82 commit 未跑本地 `nuxt build` 自检**——按 [AGENTS.md §3 必要检查](../AGENTS.md) build 应作为基线。
- **Wisdom 蒸馏触发条件超阈值**（M24 阶段 8 条新 pattern 累积）：M24 阶段累积 8 条新 pattern（3 条 M24.2 + 5 条 M24.1）超过 20 阈值 → 已在 commit `7c926a9` 一次性挂接 standards/ 4 文件 75 行净增。**教训**：M24 阶段 5 原子条目实施过程中按"类型平衡"原则沉淀 8 条 pattern —— 治理批次（M24.2 / M24.4 / Wisdom 蒸馏）密集新增 pattern，能力批次（M24.1）也按"教训未落入规范"标准沉淀 pattern；M25 阶段 P 阶段规划前应先做 wisdom 状态检查。

## 待迁移经验（next neat-freak 候选）

- **M24.2 follow-up #1 — fixtures 经验性节流方案**（P3 follow-up）：`apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流 + helper 单测（与 M23.2 fixture pool helper 抽取风格一致）。**触发条件**：CI 偶现 fixtures DELETE 502/503 + 资源释放竞态时优先复现 → 启用节流而非加复杂锁。
- **M24.2 follow-up #2 — better-auth adapter transaction 单测**（P3 follow-up）：`apps/platform/server/utils/__tests__/better-auth-adapter-transaction.test.ts` 写单测验证项目 typeorm-adapter.transaction 是真事务（mock adapter + 验证 callback commit 时序），不依赖 better-auth 上游 fallback。**根因**：better-auth 1.7.2 `getBaseAdapter:18` 自动 patch fallback 是隐性技术债，未来重构可能引入回退。
- **M24.1 follow-up #3 — i18n-anchor-check 自动化工具**（P3 follow-up）：写 `scripts/i18n-anchor-check.mjs` 工具，编辑 locale 文件后跑一遍 anchor 一致性 + 双语键集对称（en-US/zh-CN 段键集相同 + 文本不同属正常态；anchor 用错位文本属异常态）。
- **M24.1 follow-up #4 — zod-helpers 统一封装**（P3 follow-up）：写 `server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, value, fieldName): { success: boolean, value?: T }` helper 强制语义区分（避免每个 query 解析写 `data !== undefined` 三元）。
- **M24 阶段 follow-up #5 — nuxt build 必查项加固**（P2 follow-up）：D 阶段自检 checklist 增加 `pnpm --filter @dependfix/platform build`（含 SCSS 编译验证）—— 当前 CI Test job + E2E job 失败时会跳过下游 steps，CI 失败时本地必须先 build 兜底。**M24.1 Phase 4 e841b82 commit 实证**：SCSS 未定义变量在 `nuxt build` 阶段暴露但 lint/typecheck/vitest 不捕获。
- **M24 阶段 follow-up #6 — e2e 真实环境重跑 CI**（P3 follow-up）：M22.7 hotfix + M23.1 WAL + M23.2 fixture pool 三层治本在 sandbox chromium 限制下未本地复现，待非 sandbox 环境（如本地 docker / 真实 CI runner）重跑 e2e 验证治本有效性，避免 M22.7 类隐性回归。

## M25 阶段 P 阶段规划候选

- **候选池来源**：[backlog.md §短期 / 一次性候选任务](../backlog.md) + 历次 M22 / M23 / M24 audit suggest backlog
- **类型平衡原则**（与 M24 阶段方案 B 一致）：🚀 能力 1 + 🛡️ 治理 2 + 🧪 测试 1 + 🎨 体验 1 = 5 原子条目
- **M25 启动决策**：依赖用户输入 M25 阶段范围（候选池众多，需用户决策选 5 原子条目）
- **M25 P 阶段规划前强制检查**（按 [ai-collaboration.md §1.5 阶段归档检查 + 沉淀工作流](../standards/ai-collaboration.md#15-阶段归档检查--沉淀工作流pdtfc-闭环后必经) + [session-wisdom-distillation.md §2.1 阶段开工前归档检查](../design/governance/session-wisdom-distillation.md#21-阶段开工前归档检查pdtfc-衔接工作流)）：
  1. todo.md `[ ]` 数据漂移信号检查
  2. session Wisdom 活跃条目数检查（本批次蒸馏后 WISDOM_OK 17 ≤ 20）
  3. experience-archive.md 最新§号连续性
  4. 沉淀本阶段新 pattern 到 docs/standards/ + experience-archive.md（本批次已沉淀）
  5. `pnpm run check:docs` 验证 0 error（本批次 OK 103 md + 58 vue-interp）

## 准入标准复核

本批次 M24 阶段归档符合 [ai-collaboration.md §1.5 阶段归档检查 + 沉淀工作流](../standards/ai-collaboration.md#15-阶段归档检查--沉淀工作流pdtfc-闭环后必经) 准入标准：
- ① 教训未落入规范：5 条 M24.1 教训（自检纪律 / i18n-anchor / PrimeVue multi-sort-meta / zod optional / monitoring-vs-merge）+ 3 条 M24.2 教训（better-auth transaction / h3 async / fixtures throttle）= 8 条全部挂接 standards（`pnpm distill:wisdom --check` WISDOM_OK 17 ≤ 20）
- ② 重大 bugfix 经验未沉淀：CI 修复 commit `ad1ab17` SCSS 未定义变量教训已挂接 §3c 大批量归档批次规范（6 项 D 阶段自检必查）+ 阶段关键经验段
- ③ 重复违规预警：M24 阶段 4 个原子条目（M24.2 / M24.3 / M24.4 / M24.5）验收清单 stale 状态反复出现（todo.md 描述与实际状态漂移），与 M23.3 §五十五 教训 4 同模式；本批次同步修正 4 处
- ④ 工具/环境陷阱：nuxt build SCSS 变量未定义（CI 修复）+ PrimeVue 4 silent ignore（Phase 4 B2）+ zod optional undefined 陷阱（Phase 3 W2）= 3 类典型陷阱已分别挂接 standards

**M24 阶段增量价值**：M24 是 dependfix 1.0.0 前最后一个核心能力扩展 + 治理收口批次（PRCheck 监测填补了"dependfix 自身 PR 失败"沉默失败场景）。方案 B 5 原子条目独立闭环 + 12 commits 实施记录 + 11 项 follow-up + 8 条 standards 挂接 pattern + 2 次 audit Reject 修复经验 —— 形成 M24 完整治理闭环。**M25 阶段候选**已就位，待用户决策启动范围。
