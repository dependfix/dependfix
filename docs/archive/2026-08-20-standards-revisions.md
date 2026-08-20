# 2026-08-20 standards 文档精简批 — 解释与背景

> 本文件解释 [docs/standards/](../standards/) 与 [.github/skills/full-stack-master/SKILL.md](../skills/full-stack-master/SKILL.md) §七 在 2026-08-20 neat-freak 批次的精简理由。规范本身仅写"做什么 / 不做什么"简洁条款，详细"为什么"在此沉淀。
>
> 适用规范条目（精简前原文 / 精简后定位）：
> - `docs/standards/documentation.md` §7 plan/ 文档范围严格区分
> - `docs/standards/git.md` §3.4 ahead 计数核验（已删除）
> - `docs/standards/testing.md` §6.1 page.route 时序 + CI 失败分析 + PrimeVue hydration
> - `docs/standards/platform.md` §7.1 PrimeVue 类型 vs 运行时
> - `docs/guide/ai-development.md` §5.1 能力怀疑时优先实测
> - `.github/skills/full-stack-master/SKILL.md` §七 PDTFC+ 修复工作流补充
>
> 范围约定：规范条款见目标 docs；本文件只解释"为什么这么规定"。

## 1. plan/ 文档范围严格区分

**为什么**：会话期间曾因归档时把"完成摘要 / commit 序列 / 验证矩阵 / ahead 数"塞入 todo.md 顶部，被用户明确规范驳回："todo.md 只能包含当前阶段待办，其他所有的事项，包括规划、commit 等都不能放。延期的事项返回 backlog，已知边界记在文档或 backlog 中。任何已经完成的条目都不放在 todo 中。"

**适用规范**：[`docs/standards/documentation.md` §7`plan/` 文档范围严格区分](../standards/documentation.md)

**反模式行为**：归档期把 todo.md 当作"项目进度面板"用（塞 M11 闭环 22 commits / 3 轮审计结论 / 验证矩阵 / ahead 8 commits / PrimeVue hydration known-issue 提示），违反"todo.md 只含当前阶段待办"。导致：(1) 双点维护漂移（同一信息在 todo + todo-archive + backlog 重复登记）；(2) todo 失去"待办"的语义纯粹性；(3) 读者无法快速识别"我现在要做什么"。

**判定规则**：新条目按状态分流 → todo.md（当前阶段活跃）/ todo-archive.md（已闭环归档）/ backlog.md（延期 / 远期 / known-issue）/ 对应阶段归档段（known-issue 详细）。

---

## 2. ahead-of-origin 计数核验（已删除）

**为什么**：会话期间归档时曾误称 "ahead 11 commits"，实际 ahead 8 commits（C62 三 commits 已随 M11 收口批次推送）。审计 B1 blocker 暴露后已修复（`c4c2416` commit 重写）。

**最终决策**：用户明确规范——"归档文案 ahead 计数-》不需要 ahead 计数"。原 §3.4 完整删除，不在归档文案维护 ahead 数字。归档以"本批次 commits 列表 + 归档位置"为粒度即可，ahead 数字是 CI/部署元数据，与规划文档职责无关。

**如果未来确实需要 ahead 数字**：用 `git rev-list HEAD ^origin/master --count` 单命令即时计算（不入规范）。

---

## 3. 本机 e2e 实际可跑

**为什么**：会话期间曾误判"本机 e2e 跑不了（需要 playwright + e2e sqlite）"——实际 playwright + chromium + `.output/` + e2e sqlite 全部就绪，本机 `pnpm exec playwright test` 直接可用（54 passed / 2 skipped / 0 failed in 2.9min）。错误判断浪费 1 轮 CI-only 推断。

**根因**：训练数据过期 + 默认假设"复杂环境 = CI 才能跑"。规范不能容忍"凭记忆判断"——能力怀疑时实测。

**适用规范**：[`docs/guide/ai-development.md` §5.1 能力怀疑时优先实测](../guide/ai-development.md)

---

## 4. CI 失败分析必看 `error-context.md`

**为什么**：playwright CI 失败堆栈通常无意义（DOM-based 测试失败时堆栈指向 React render 回调，不是 root cause）。`test-results/<spec>/error-context.md` 包含 playwright accessibility tree（row class / cell text / role attribute），能直接看到实际 DOM 渲染态。本批次 alerts-rowgroup rowGroup 渲染问题通过 page-snapshot 一眼区分 "empty-message 行" vs "rowGroup subheader 行"。

**适用规范**：[`docs/standards/testing.md` §6.1 E2E 实践经验](../standards/testing.md#61-e2e-实践经验playwright)

---

## 5. `page.route` 注册顺序铁律

**为什么**：Vue/Nuxt 应用 `onMounted` 在 hydration 后立即触发 fetch；`page.route` 在 `page.goto` 之后注册时，onMounted 抢跑走真实 API（401/403）→ events 为空 → DataTable 不渲染 wrapper / rowGroup 不显示 subheader。后注册的 mock 即使后续值再变化也不再被已注册的 mock 命中（首次请求已发生）。

**适用规范**：[`docs/standards/testing.md` §6.1 E2E 实践经验](../standards/testing.md#61-e2e-实践经验playwright)

**反模式**：`await page.goto('/alerts')` → `await page.route('**/api/alerts*', ...)`（mock 未生效）。**正确模式**：`test.beforeEach` 中先注册 mock，再 `page.goto`。

---

## 6. PrimeVue 类型 vs 运行时不一致

**为什么**：本批次 `alerts.vue:150` `expandedPackages = ref<Record<string, boolean>>({})` 触发 `TypeError: this.expandedRowGroups.indexOf is not a function`（生产 latent bug——首渲染即抛错，原代码在有数据 + rowGroup 场景下从未跑通过）。TypeScript 类型允许 Record，但 PrimeVue 4 `v-model:expanded-row-groups` 内部 `this.expandedRowGroups.indexOf(...)` 期望数组。

**根因**：PrimeVue 4 类型定义未对齐运行时契约（已知 type bug）。编写 v-model 绑定时不能信 `DataTableExpandedRows` 类型声明，必须直接看 `node_modules/primevue/datatable/index.mjs` 内部 `.indexOf / .filter / .push` 调用反推期望形态。

**适用规范**：[`docs/standards/platform.md` §7.1 PrimeVue 4 集成实践](../standards/platform.md#71-primevue-4-集成实践)

---

## 7. PrimeVue 4 + Nuxt SSR hydration 兼容性 bug（known-issue）

**为什么**：本批次 e2e 修复后仍残留 2 个 alerts-rowgroup.e2e.test.ts rowGroup 测试 `.fixme` 标记（`page.reload()` 后能渲染可佐证非业务逻辑问题）。`onMounted` 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染。

**修复路径**：迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据，或升级 PrimeVue 到修复版本（监控 PrimeVue 4 changelog）。

**适用规范**：[`docs/standards/testing.md` §6.1 E2E 实践经验](../standards/testing.md#61-e2e-实践经验playwright) + [`docs/plan/backlog.md` §已知边界与 known-issue`](../plan/backlog.md)

---

## 8. PDTFC+ 修复工作流补充

**为什么**：跨多个根因链的修复不能一次性全压——必须"先 1 个代表性文件 → 定向 subset 验证 → 确认有效后批量应用"。会话期间曾一次性尝试 `ssr: false` + ClientOnly + `:key` 三种方案全压 → 都失败 → 才退到 P 阶段跑 1 个代表性测试才确认根因（PrimeVue 内部 `processedData` 在 hydration 后未重算）。浪费 1+ 轮 CI-only 推断。

**适用规范**：[`.github/skills/full-stack-master/SKILL.md` §七 PDTFC+ 修复工作流补充](../skills/full-stack-master/SKILL.md)

---

## 9. archive 多文件重排必扫重复段

**为什么**：归档批 audit W1 发现 `docs/plan/backlog.md` L57-81 与 L83-105 是完全重复的 `## 2026-08-19~20 平台 UX/可用性闭环批次汇总` 段——batch edit 误复制。大量 multi-file 重排时容易出现重复段/重复标题，提交前必须 `rg -n "^##"` 扫描标题去重。

**适用规范**：[`.github/skills/full-stack-master/SKILL.md` §七.7.2 第 6 条](../skills/full-stack-master/SKILL.md)（一行链接形式）

---

## 10. PrimeVue 4 wrapper class 重命名

**为什么**：本批次 env-events DataTable scrollable 测试用过时断言 `.p-datatable-wrapper` 找不到元素。PrimeVue 4 已把 scrollable 包裹层 class 从 `.p-datatable-wrapper`（PrimeVue 3）改为 `.p-datatable-table-container`。e2e 断言必须看实际渲染产物（playwright error-context.md 或 `page.evaluate` 输出 classList）。

**适用规范**：[`docs/standards/testing.md` §6.1 E2E 实践经验](../standards/testing.md#61-e2e-实践经验playwright)