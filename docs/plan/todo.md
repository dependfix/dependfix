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
- **优先级**：P3（候选评估完成，详见 F 阶段候选清单真实性核验——C14 实测未做）
- **范围**：`packages/engine/src/runners/verification-runner.ts` + `packages/engine/src/runners/network-audit.test.ts` + 性能基准测试
- **验收标准**：
  - [ ] 性能基准测试 `packages/engine/src/runners/verification-runner.bench.test.ts`（多 cs 告警 N=10/50/100 三档基准）
  - [ ] 性能优化方案实施（合并验证 / 批处理 / 缓存策略任一，按基准结果决策）
  - [ ] T303 Review Gate 触发条件消除
  - [ ] `pnpm --filter @dependfix/engine test` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不升级 pnpm / git 版本；不引入新依赖；不改 cs 告警本身解析逻辑
- **依赖**：M23.3 C66 闭环（A/B/C 分层已实现）；verification-runner 既有架构稳定
- **交付物**：1-2 atomic commits（性能基准 + 优化方案）
- **风险与缓解措施**：
  - **风险 1**：性能瓶颈根因未明，可能优化无效；缓解：先做基准测量再决策方案，不预设优化路径
  - **风险 2**：缓存策略可能引入 stale 检测结果风险；缓解：缓存 key 必须包含 commit hash + 工作目录 hash 双维度

### M28.3 [P2 🛡️ 技术债] C15 Code Scanning B 类规则真实仓库样本核对

- **目标**：在已实现 A/B/C 分层基础上做真实 GitHub Code Scanning 仓库 API 样本核对（B 类规则 id 格式 + 变体分布 + 误判率）
- **优先级**：P2（候选评估完成，详见 F 阶段候选清单真实性核验——C15 实测 A/B/C 分层已实现但样本核对未做）
- **范围**：`packages/engine/src/code-scanning/rule-classifier.ts` + 真实仓库样本采集脚本 + 规则分级与样本对齐报告
- **验收标准**：
  - [ ] 真实 GitHub Code Scanning 仓库 API 样本采集（≥ 30 个真实仓库，跨 js / py / java / go / ruby 5 语言）
  - [ ] B 类规则 id 格式与变体分布报告（`docs/research/code-scanning-b-class-samples.md`）
  - [ ] 规则分级与真实样本对齐（A/B/C 边界修正，按需）
  - [ ] `pnpm --filter @dependfix/engine test` 全过（含规则分级单测）+ `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不重写 A/B/C 分层基础（M23.3 已落地）；不引入新依赖；不修改 defaultRulesConfig 默认值（M23.3 + M26.4b 已治理）
- **依赖**：M3 Code Scanning 接入（已闭环）+ `packages/engine/src/code-scanning/rule-config.ts` 已具备
- **交付物**：1-2 atomic commits（样本采集脚本 + 报告 + 规则分级修正）
- **风险与缓解措施**：
  - **风险 1**：GitHub API 速率限制（5000/h authenticated）；缓解：分批采集 + 离线分析 + rate limit 重试
  - **风险 2**：样本分布可能不均（js 远多于 go）；缓解：≥ 30 个仓库 + 每语言 ≥ 5 个 + 显式标注样本偏差

### M28.4 [P3 🚀 能力扩展] C33 MCP P3（pnpm-audit 本地 tool + 错误包装 helper + 返回结构对齐）

- **目标**：扩展 `@dependfix/mcp` 包 — 新增 pnpm-audit 本地 tool + 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）+ 返回结构对齐完整 `RunResult`（当前 run_scan 只映射 8 字段，保持简化 + 文档声明）
- **优先级**：P3（候选评估完成，详见 F 阶段候选清单真实性核验——C33 实测未做）
- **范围**：`packages/mcp/src/tools/` + `packages/core/src/errors/` helper + `packages/core/src/mcp/types.ts` RunResult 对齐
- **验收标准**：
  - [ ] `packages/mcp/src/tools/pnpm-audit.tool.ts` 新增（pnpm-audit 本地 tool 实现）
  - [ ] `packages/core/src/errors/mcp-error-wrapper.ts` helper（token 检查 + try/catch → ok:false 模板）
  - [ ] MCP 返回结构对齐完整 `RunResult`（run_scan 当前 8 字段 → 完整 RunResult 字段映射）
  - [ ] `pnpm --filter @dependfix/mcp test` 全过 + `pnpm --filter @dependfix/core test` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不引入新依赖；不改 MCP 协议（保留 SDK 兼容性）；不改现有工具（run_scan 等保持不变，仅扩展）
- **依赖**：`packages/engine/src/alerts/pnpm-audit-fetcher.ts` 已具备（底层 pnpm-audit 解析逻辑）
- **交付物**：2-3 atomic commits（helper + tool + RunResult 对齐拆 3 commits 粒度可控）
- **风险与缓解措施**：
  - **风险 1**：MCP tool 工作量较大（pnpm-audit 调用 + workDir 语义 + 错误包装），可能超 5 commits；缓解：先 helper 再 tool 再 RunResult 对齐，拆 3 commits 粒度可控
  - **风险 2**：返回结构对齐可能破坏现有 MCP 客户端契约；缓解：保留现有 8 字段映射，新增 RunResult 字段作为可选扩展（向后兼容）

### M28.5 [P3 🛡️ 治本] M22.8 follow-up ② better-auth 中间件 Set-Cookie 路径扫描

- **目标**：确认 better-auth 中间件对非 `/api/auth/*` 端点返回 Set-Cookie 路径是否会污染下游 e2e context；M24.2 commit `bbb8f30` 已判定 better-auth transaction close 时序已治本，但 Set-Cookie 路径扫描未单独闭环
- **优先级**：P3（候选评估完成，详见 F 阶段候选清单真实性核验——M22.8 follow-up ② 实测未做；M23.2 已闭环候选① fixture pool 源码追溯 + helper 抽取）
- **范围**：`apps/platform/server/utils/auth.ts` + e2e helper + `apps/platform/tests/e2e/` Set-Cookie 追踪脚本
- **验收标准**：
  - [ ] better-auth 中间件 Set-Cookie 路径扫描报告（`docs/research/better-auth-set-cookie-path-audit.md`）
  - [ ] 扫描脚本：`scripts/set-cookie-trace.mjs`（CI 环境可运行，输出按路径分组的 Set-Cookie 触发点）
  - [ ] e2e helper 改造（按扫描结果——若 Set-Cookie 路径污染下游 context，则追加显式 cookie 隔离；若未污染，则记录"无影响"实证）
  - [ ] `pnpm --filter @dependfix/platform test:e2e` 全过 + `pnpm lint` + `pnpm typecheck` 0 error
- **不做什么**：不动 better-auth 上游代码；不替换 better-auth adapter（已 M18 + M22 + M24.x 稳定）；不动 M22.8 helper 层兜底（保留兜底修复）
- **依赖**：M23.2 已闭环基础（`apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）+ M22.8 hotfix helper 层兜底保留
- **交付物**：1 atomic commit（依赖非 sandbox 环境 CI 复现一次确认是否仍存在 ECONNRESET / cookie 污染）；若 CI 未复现则 commit 收口为"实证无影响 + 关闭 follow-up"
- **风险与缓解措施**：
  - **风险 1**：依赖 CI 偶发场景触发，本地可能无法稳定复现；缓解：保留 helper 层兜底修复（`unauthenticated-api.helper.ts` 显式空 storageState）+ 治本修复并存；commit message 显式说明"依赖 CI 复现"
  - **风险 2**：扫描脚本可能捕获大量无关 Set-Cookie（如 csrf / session refresh）；缓解：脚本只追踪非 `/api/auth/*` 端点的 Set-Cookie 触发，按 pathname 分组过滤

---

## 类型平衡复核

按 [§1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)：用户体验 ≥ 2 + 技术债 ≥ 1 + 能力扩展 ≥ 1 + 测试覆盖 ≥ 1

- 🛡️ **技术债 / 治本**：3 项（M28.1 / M28.2 / M28.5）—— ✅ 满足
- 🚀 **能力扩展**：1 项（M28.4 C33 MCP）—— ✅ 满足
- 📚 **治理**：1 项（M28.1 重编号）—— ✅ 满足
- 🎨 **用户体验**：**0 项** —— ❌ 缺口（候选池中 C36 / C37 均已闭环或前置依赖）
- 🧪 **测试覆盖**：**0 项** —— ❌ 缺口（db-restore S-1/S-2 恢复条件不明确 + 工程价值低于其他候选）

**缺口处理**：M28 启动决策时显式标注 UX / 测试覆盖缺口真实存在；M28.1 完成后按 §3.4 强化流程重新评估候选池时主动扩展（从 backlog 中挑选 UX 痛点 / 技术债 / 能力扩展类候选填充）—— 按 §1.1 L12 "当上一阶段闭环后仅剩单一候选的尴尬局面时，主动扩展"

---

## 关键决策 D1-D3（2026-09-11 用户决策方案 M28-A + M28.1 重编号）

- **D1**：方案 M28-A 类型平衡原则（5 候选 = 📚 1 + 🛡️ 3 + 🚀 1）—— 按 §1.1 L12 推荐粒度（5-6 原子条目硬上限）
- **D2**：M28.1 重编号为 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— 优先治本 §4.4 第 11 条结构性缺陷，避免 M27.1 教训复发（M28.2-M28.5 留待 M28.1 完成后按 §3.4 强化流程重新评估）
- **D3**：backlog.md 治理债清理 D 阶段已落地（6 文件 modified 待 commit）—— W1 / C9 / C13 / C36 已闭环条目整段/行删除 + §已知边界 M22.7/M22.8 follow-up stale 同步 + session 元数据 ahead=17 → 0 同步

---

## ahead commits 实证

`git rev-list HEAD ^origin/master --count` = **0**（M27 全部 11 commits + 历史阶段均 ahead=0 已推送；本次 M28 启动批次 4 atomic commits 待落地）

---

## 待用户确认

M28.2-M28.5 具体 D 阶段实施计划待 M28.1 完成后按 §3.4 强化流程重新评估 —— 避免本次踩中的"未做候选 ID / 关键词 git log --grep 实证"重复