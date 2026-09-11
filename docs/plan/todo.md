# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **当前阶段：M28 治理债清理 + 能力扩展（方案 M28-A + M28.1 重编号 / 2026-09-11 用户决策）** —— M28.1 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化；M28.2-M28.5 待 M28.1 完成后按 §3.4 强化流程重新评估。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（M27 + M26 + M23 + M22 已 ahead 归档；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md)（**M28 启动批次同步清理**：W1 / C9 / C13 / C36 已闭环条目删除；M22.7/M22.8 follow-up stale 同步；backlog.md 健康窗口 ~230 行） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M28 段新增 2026-09-11 启动决策；M27 状态已完成 2026-09-10 归档；下一阶段待 M28.1 完成后启动） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M28 阶段任务清单（方案 M28-A 类型平衡 + M28.1 重编号）

### M28.1 [P3 📚 治理] backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化（重编号）

- **目标**：完成 §4.4 第 11 条"§已知边界段部分闭环处理指引"新增，治本避免未来阶段重复评估 §已知边界段 stale 描述（M27.1 教训复发根因）；backlog.md §已知边界 M22.7 / M22.8 follow-up 已 D 阶段清理批次落地，commit 同步
- **优先级**：P3（治理债，按 §3.1 hard requirement M28 候选需用户明确授权——本任务用户已 2026-09-11 授权方案 M28-A + M28.1 重编号）
- **范围**：`docs/standards/planning.md §4.4 第 11 条` + backlog.md §已知边界 M22.7 / M22.8 follow-up 段（已在 D 阶段清理）+ `.session/wisdom.md` governance check point（session 私有，不 commit）
- **验收标准**：
  - [ ] §4.4 第 11 条新增"§已知边界段部分闭环处理指引"（≥ 8 行 + 双向治理动作描述）
  - [ ] §4.4 第 11 条示例更新：移除 C36 引用（已 M16.3 + M17.x + M24.1 多次闭环）+ 新增 M22.7 follow-up ② 已 M24.2 判定非根因为部分闭环示例
  - [ ] backlog.md §已知边界 M22.7 / M22.8 follow-up 段状态同步（D 阶段清理已落地：候选 ② 已 M24.2 闭环 / 候选 ④ 已 M24.2 登记 follow-up / M22.8 候选 ② 未单独闭环 + 候选 ③ 已因 Playwright 1.62 → 1.63 升级场景变更失效）
  - [ ] .session/wisdom.md 追加 M28 启动教训（session 私有，不 commit；活跃条目维持 ≤ 15 阈值）
  - [ ] `pnpm run lint:md` Exit 0 + `pnpm run check:docs` Exit 0
- **不做什么**：不重写 §4.4 第 11 条其他规则；不动 backlog §已知边界 SQLite 段（已 M27 commit `4e54afd` 清理过）；不触动 backlog §短期候选段（已 D 阶段清理 W1 / C9 / C13 / C36）；不动 M28.2-M28.5 候选（留待 M28.1 完成后按 §3.4 强化流程重新评估）
- **依赖**：D 阶段清理批次（backlog.md / todo-archive.md / archive/index.md / planning.md C36 引用 / session 元数据 ahead 17 → 0 同步）—— 6 文件 modified 待 commit
- **交付物**：1 atomic commit `docs(standards): planning.md §4.4 第 11 条规则强化（C36 引用 + §已知边界段部分闭环处理指引）` + wisdom 教训追加 session 私有
- **风险与缓解措施**：
  - **风险 1**：规则强化需与 §3.1 + §3.4 + §4.4 第 9 条配套——风险是规则间冲突；缓解：新增指引明确"部分闭环时如何更新描述 + 何时升级为整段删除"二元决策
  - **风险 2**：wisdom 活跃条目已 17 条接近 20 阈值——追加 M28 教训可能触发蒸馏；缓解：先 `pnpm distill:wisdom --check` 验证，必要时合并同类 pattern

---

### M28.2 [P3 🛡️ 技术债] C14 多 cs 告警逐告警全项目 lint 性能

- **目标**：解决多 code-scanning 告警时逐个跑全项目 lint 性能瓶颈（合并验证 / 批处理 / 缓存策略任一）
- **优先级**：P3（候选评估完成，详见 P 阶段评估报告——C14 实测未做；`packages/engine/src/runners/verification-runner.ts` 有 `runVerification` 函数 + `app/helpers.ts:483` 显示 cs fix 流程触发 lint；**无 benchmark 文件**——本次新增性能基准）
- **范围**：`packages/engine/src/runners/verification-runner.ts` + 新增 `packages/engine/src/runners/verification-runner.bench.test.ts` 性能基准 + 按需优化方案（合并验证 / 批处理 / 缓存策略）
- **验收标准**：
  - [ ] 性能基准测试 `packages/engine/src/runners/verification-runner.bench.test.ts`（多 cs 告警 N=10/50/100 三档基准）
  - [ ] 性能优化方案实施（合并验证 / 批处理 / 缓存策略任一，按基准结果决策）
  - [ ] T303 Review Gate 触发条件消除
  - [ ] `pnpm --filter @dependfix/engine test` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不升级 pnpm / git 版本；不引入新依赖；不改 cs 告警本身解析逻辑（`app/helpers.ts:483` cs fix 流程不动）；不修改既有 verification-runner.ts 公开 API
- **依赖**：M23.3 C66 闭环（A/B/C 分层已实现）；verification-runner 既有架构稳定（`runVerification` / `formatVerificationError` / `summarizeVerificationOutput` / `sanitizeOutput` 4 个 export 函数）；vitest bench API 可用
- **交付物**：1-2 atomic commits（性能基准 + 优化方案，按 §1.1 L11 推荐粒度 < 5 commits）
- **风险与缓解措施**：
  - **风险 1**：性能瓶颈根因未明，可能优化无效；缓解：先做基准测量再决策方案，不预设优化路径——基准必须包含当前基线 + 优化后对照
  - **风险 2**：缓存策略可能引入 stale 检测结果风险；缓解：缓存 key 必须包含 commit hash + 工作目录 hash 双维度，cache miss 时重跑 lint + cache hit 时跳过但需检测到工作目录变化时强制失效
  - **风险 3**：性能基准测试可能受 CI 环境差异影响；缓解：基准测试仅本地跑通即可（CI 不强制），记录基线数值到 bench 报告注释供后续对比

### M28.3 [P2 🛡️ 技术债] C15 Code Scanning B 类规则真实仓库样本核对

- **目标**：在已实现 A/B/C 分层基础上做真实 GitHub Code Scanning 仓库 API 样本核对（B 类规则 id 格式 + 变体分布 + 误判率）
- **优先级**：P2（候选评估完成，详见 P 阶段评估报告——C15 实测 A/B/C 分层已实现但样本核对未做；`packages/engine/src/code-scanning/` 有 `rule-classifier.ts` + `rule-config.ts` + `templates.ts`；**无真实仓库 API 客户端** + **无样本采集脚本**——本次新增 API 客户端 + 采集脚本）
- **范围**：`packages/engine/src/code-scanning/scripts/sample-collector.mjs`（新增采集脚本） + `packages/engine/src/code-scanning/__fixtures__/real-samples.json`（新增 fixture） + `docs/research/code-scanning-b-class-samples.md`（报告） + `packages/engine/src/code-scanning/rule-classifier.ts`（按需分级修正）
- **验收标准**：
  - [ ] 真实 GitHub Code Scanning 仓库 API 样本采集（≥ 30 个真实仓库，跨 js / py / java / go / ruby 5 语言）
  - [ ] B 类规则 id 格式与变体分布报告（`docs/research/code-scanning-b-class-samples.md`）
  - [ ] 规则分级与真实样本对齐（A/B/C 边界修正，按需）
  - [ ] `pnpm --filter @dependfix/engine test` 全过（含规则分级单测）+ `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不重写 A/B/C 分层基础（M23.3 已落地）；不引入新依赖；不修改 defaultRulesConfig 默认值（M23.3 + M26.4b 已治理）；不动 `apps/platform/server/services/code-scanning/`（路径不存在，无相关代码）；不模拟 GitHub Code Scanning API（必须真实采集）
- **依赖**：M3 Code Scanning 接入（已闭环）+ `packages/engine/src/code-scanning/rule-config.ts` 已具备 + `apps/platform/server/utils/auth.ts` 已具备 GitHub API 凭据模式（OIDC + Personal Access Token）+ GitHub Code Scanning API 文档参考（`https://docs.github.com/en/rest/code-scanning`）
- **交付物**：2-3 atomic commits（采集脚本 + 报告 + 规则分级修正，按 §1.1 L11 推荐粒度 < 5 commits）
- **风险与缓解措施**：
  - **风险 1**：GitHub API 速率限制（5000/h authenticated）；缓解：分批采集 + 离线分析 + rate limit 重试（建议每语言分批，间隔 60s）
  - **风险 2**：样本分布可能不均（js 远多于 go）；缓解：≥ 30 个仓库 + 每语言 ≥ 5 个 + 显式标注样本偏差
  - **风险 3**：GitHub Code Scanning API 数据需要 public 仓库 + Code Scanning alerts 已启用；缓解：选定候选仓库列表时显式标注哪些仓库有 Code Scanning alerts + 哪些无（避免无效采集）

### M28.4 [P3 🚀 能力扩展] C33 MCP P3（pnpm-audit 本地 tool + RunResult 字段对齐）

- **目标**：扩展 `@dependfix/mcp` 包 — 新增 pnpm-audit 本地 tool + 返回结构对齐完整 `RunResult`（补 5 字段：startedAt / finishedAt / config / alerts / actions）。**错误包装 helper 已 M26.x 阶段落地**（`packages/mcp/src/tools/errors.ts` 含 `ToolError` 类型 + `requireToken()` + `toToolError()` 双 helper + 各 tool 已统一 `{ ok: false, error: string }` 模板——本任务**不再做错误包装 helper**）
- **优先级**：P3（候选评估完成，详见 P 阶段评估报告——C33 实测**部分已落地**，错误包装 helper 段已剔除）
- **范围**：`packages/mcp/src/tools/pnpm-audit.tool.ts`（新增）+ `packages/mcp/src/tools/run-scan.ts` RunResult 对齐 5 字段 + `packages/mcp/src/tools/schemas.ts`（同步 schema）
- **验收标准**：
  - [ ] `packages/mcp/src/tools/pnpm-audit.tool.ts` 新增（pnpm-audit 本地 tool 实现 + `requireToken()` token 检查复用 + `toToolError()` 错误包装复用）
  - [ ] MCP runScan 当前 8 字段 →完整 RunResult 12 字段映射（补 5 字段：`startedAt` / `finishedAt` / `config` / `alerts` / `actions`）
  - [ ] MCP 返回结构 RunResult 对齐后**保留现有 8 字段映射**（向后兼容——按 `RunResult` 接口全字段展开，老客户端忽略未知字段）
  - [ ] `pnpm --filter @dependfix/mcp test` 全过 + `pnpm --filter @dependfix/core test` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不引入新依赖；不改 MCP 协议（保留 SDK 兼容性）；不重做错误包装 helper（已 M26.x 阶段落地）；不改底层 pnpm-audit 解析逻辑（`packages/engine/src/alerts/pnpm-audit-fetcher.ts` 稳定）
- **依赖**：`packages/mcp/src/tools/errors.ts` 已具备（错误包装 helper）+ `packages/engine/src/alerts/pnpm-audit-fetcher.ts` 已具备（底层 pnpm-audit 解析逻辑）+ RunResult 接口定义（`packages/core/src/report/types.ts:17-32`）
- **交付物**：2-3 atomic commits（pnpm-audit tool + RunResult 字段对齐，按 §1.1 L11 推荐粒度 < 5 commits 拆分）
- **风险与缓解措施**：
  - **风险 1**：MCP tool 工作量较大（pnpm-audit 调用 + workDir 语义 + 测试覆盖），可能超 5 commits；缓解：pnpm-audit tool 与 RunResult 字段对齐**分 2 个独立 batches**——先 tool 后字段对齐，避免单 commit 过载
  - **风险 2**：返回结构对齐可能破坏现有 MCP 客户端契约；缓解：RunResult 接口对齐采用"全字段展开 + 老客户端忽略未知字段"模式（向后兼容，渐进式迁移）；不在 RunScanResult 类型上做 breaking change

### M28.5 [P3 🛡️ 治本] M22.8 follow-up ② better-auth 中间件 Set-Cookie 路径扫描

- **目标**：确认 better-auth 中间件对非 `/api/auth/*` 端点返回 Set-Cookie 路径是否会污染下游 e2e context；M24.2 commit `bbb8f30` 已判定 better-auth transaction close 时序已治本，但 Set-Cookie 路径扫描未单独闭环
- **优先级**：P3（候选评估完成，详见 P 阶段评估报告——M22.8 follow-up ② 实测未做；M23.2 已闭环候选① fixture pool 源码追溯 + helper 抽取；`apps/platform/server/utils/auth.ts` 有 `additionalFields`；e2e helpers 已具备 `auth-cookie.helper.ts` + `unauthenticated-api.helper.ts` 等 5 个 helper）
- **范围**：`apps/platform/scripts/set-cookie-trace.mjs`（新增扫描脚本） + `apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`（按需改造） + `docs/research/better-auth-set-cookie-path-audit.md`（报告）
- **验收标准**：
  - [ ] better-auth 中间件 Set-Cookie 路径扫描报告（`docs/research/better-auth-set-cookie-path-audit.md`）
  - [ ] 扫描脚本：`scripts/set-cookie-trace.mjs`（CI 环境可运行，输出按路径分组的 Set-Cookie 触发点）
  - [ ] e2e helper 改造（按扫描结果——若 Set-Cookie 路径污染下游 context，则追加显式 cookie 隔离；若未污染，则记录"无影响"实证）
  - [ ] `pnpm --filter @dependfix/platform test:e2e` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不动 better-auth 上游代码；不替换 better-auth adapter（已 M18 + M22 + M24.x 稳定）；不动 M22.8 helper 层兜底（保留兜底修复）；不动 `apps/platform/server/utils/auth.ts` 现有 additionalFields 配置
- **依赖**：M23.2 已闭环基础（`apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）+ M22.8 hotfix helper 层兜底保留 + M27.5 诊断基础设施（`apps/platform/server/database/typeorm-adapter.ts` AUTH_TRACE=1 开关）
- **交付物**：1 atomic commit（依赖非 sandbox 环境 CI 复现一次确认是否仍存在 ECONNRESET / cookie 污染）；若 CI 未复现则 commit 收口为"实证无影响 + 关闭 follow-up"
- **风险与缓解措施**：
  - **风险 1**：依赖 CI 偶发场景触发，本地可能无法稳定复现；缓解：保留 helper 层兜底修复（`unauthenticated-api.helper.ts` 显式空 storageState）+ 治本修复并存；commit message 显式说明"依赖 CI 复现"
  - **风险 2**：扫描脚本可能捕获大量无关 Set-Cookie（如 csrf / session refresh）；缓解：脚本只追踪非 `/api/auth/*` 端点的 Set-Cookie 触发，按 pathname 分组过滤
  - **风险 3**：扫描可能跨多个 better-auth 中间件层（`auth.ts:290 additionalFields` + `typeorm-adapter.ts`）；缓解：脚本按中间件层分组输出，便于定位污染源

---

## 类型平衡复核

按 [§1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)：用户体验 ≥ 2 + 技术债 ≥ 1 + 能力扩展 ≥ 1 + 测试覆盖 ≥ 1

- 🛡️ **技术债 / 治本**：2 项（M28.2 / M28.5）—— ✅ 满足
- 🚀 **能力扩展**：1 项（M28.4 C33 MCP）—— ✅ 满足
- 📚 **治理**：1 项（M28.1 重编号）—— ✅ 满足（M28.1 已闭环）
- 🛡️ **技术债**：1 项（M28.3 C15 B 类规则样本核对）—— ✅ 满足
- 🎨 **用户体验**：**0 项** —— ❌ 缺口（候选池中 C36 / C37 均已闭环或前置依赖）
- 🧪 **测试覆盖**：**0 项** —— ❌ 缺口（M28.5 含 e2e helper 改造，但 db-restore S-1/S-2 恢复条件不明确）

**缺口处理**：M28 启动决策时显式标注 UX / 测试覆盖缺口真实存在；M28.1 完成后按 §3.4 强化流程重新评估候选池时主动扩展（从 backlog 中挑选 UX 痛点 / 技术债 / 能力扩展类候选填充）—— 按 §1.1 L12 "当上一阶段闭环后仅剩单一候选的尴尬局面时，主动扩展"

---

## 关键决策 D1-D5（2026-09-11 用户决策方案 M28-A + M28.1 重编号 / M28.2-M28.5 P 阶段评估）

- **D1**：方案 M28-A 类型平衡原则（5 候选 = 📚 1 + 🛡️ 3 + 🚀 1）—— 按 §1.1 L12 推荐粒度（5-6 原子条目硬上限）
- **D2**：M28.1 重编号为 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— 优先治本 §4.4 第 11 条结构性缺陷，避免 M27.1 教训复发
- **D3**：backlog.md 治理债清理 D 阶段已落地（6 文件 modified → 4 atomic commits ahead）—— W1 / C9 / C13 / C36 已闭环条目整段/行删除 + §已知边界 M22.7/M22.8 follow-up stale 同步 + session 元数据 ahead=17 → 0 同步
- **D4**：M28.4 C33 候选评估诚实修订 —— `packages/mcp/src/tools/errors.ts` 已 M26.x 阶段落地（`ToolError` 类型 + `requireToken()` + `toToolError()` 双 helper），本任务**不再做错误包装 helper**；仅做未落地部分：pnpm-audit 本地 tool + RunResult 5 字段对齐（startedAt / finishedAt / config / alerts / actions）
- **D5**：M28.2-M28.5 P 阶段 §3.4 五步流程核验完成 —— 全部 0 项重复评估 + M28.4 部分已落地（修订 todo.md §M28.4 验收标准）+ 执行顺序建议 M28.5（最轻 / 依赖 CI）→ M28.2（性能基准清晰）→ M28.3（采集脚本清晰）→ M28.4（MCP tool 工作量较大）

---

## M28.2-M28.5 执行顺序建议

按工作量清晰度 + 依赖性：

| 优先级 | M28.x | 工作量 | commits | 依赖性 |
|:---|:---|:---|:---|:---|
| **1** | **M28.5** | ~100-200 行 | 1 atomic commit | 依赖非 sandbox 环境 CI 复现一次 |
| **2** | **M28.2** | ~200-300 行 | 1-2 atomic commits | 性能基准先行，无外部依赖 |
| **3** | **M28.3** | ~300-400 行 | 2-3 atomic commits | GitHub Code Scanning API + ≥ 30 真实仓库 |
| **4** | **M28.4** | ~200-300 行 | 2-3 atomic commits | MCP tool + RunResult 字段对齐 |

**总计**：~800-1200 行 / 6-9 commits——超出 §1.1 L11 推荐粒度（< 5 commits / < 800 行）但未超硬阈值（< 10 文件 / < 800 行），按 §1.1 建议**每个 M28.x 独立批次 PDTFC+ 闭环**（P + D + A + F 4 个独立批次）。

---

## ahead commits 实证

`git rev-list HEAD ^origin/master --count` = **4**（M28 启动批次 4 atomic commits 已落地：`1e68948` M28 启动决策 + `608bcac` backlog 治理债清理 + `f5be990` 跨文档 stale 同步 + `1a75068` §4.4 第 11 条规则强化；M28.2-M28.5 D 阶段实施批次待落地）

---

## 待用户确认

M28.2-M28.5 具体 D 阶段实施计划待用户决策执行顺序（建议按 M28.5 → M28.2 → M28.3 → M28.4 顺序推进；本次 session 实际可完成 1-2 个 M28.x 完整 PDTFC+ 闭环）