# M28: 治理债清理 + 能力扩展（2026-09-11 M28.6 归档批次预防性分片迁出）

> **2026-09-11 M28.6 归档批次预防性分片迁出**：M28 段（5 候选完整闭环 + 11 ahead commits 待用户主动推送 + M28.6 归档批次 1 commit）已从 `todo-archive.md` 主窗口迁入本分片。主窗口仅保留导航指针（与 M26 / M27 归档批次同源策略）。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M28](../roadmap.md#m28-治理债清理--能力扩展2026-09-11-用户决策方案-m28-a--m281-重编号--m286-归档已落地)（Milestone 概述表 M28 行 + §M28 段 D6 决策增补 + ahead commits 关联表）
> - **archive 索引**：[archive/index.md §4 当前基线](index.md) + §5 近期归档批次登记 M28 行
> - **todo.md 同步**：[todo.md](../todo.md)（M28 完整闭环 ahead=11 commits 待用户主动推送 + 下一阶段待用户决策 M29+ 启动）
> - **backlog.md 同步**：[backlog.md](../backlog.md)（M28 归档批次同步清理 C14 / C15 / C33 3 个已闭环候选，健康窗口 ~229 行）
>
> **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **11** 待用户主动推送（按 [AGENTS.md §5 推送禁令](../../../AGENTS.md) 未经用户明确要求不得执行 `git push`）
>
> **M28 ahead commits 关联表**（按提交顺序 / 完整闭环 5 候选 + M28 启动批次 + 治理债清理 + §4.4 规则强化）：
>
> | 候选 / 类别 | commit | subject |
> |:---|:---|:---|
> | M28 启动 | `1e68948` | docs(plan): M28 启动决策落地 todo.md + roadmap.md §M28 + §M27 D4 stale 修正 |
> | M28 评估 | `a4abb71` | docs(plan): M28.2-M28.5 P 阶段评估修订 todo.md §M28.4 验收标准 + 类型平衡 + 执行顺序 |
> | backlog 清理 | `608bcac` | docs(plan): backlog.md 治理债清理 + M22.7/M22.8 follow-up stale 同步 |
> | 跨文档同步 | `f5be990` | docs(plan): 跨文档 stale 同步（todo-archive.md §M22.7/§M22.8 + archive/index.md 健康窗口 + planning.md §4.4 第 11 条 C36 引用） |
> | M28.1 | `1a75068` | docs(standards): planning.md §4.4 第 11 条规则强化（§已知边界段部分闭环处理指引） |
> | M28.5 | `d7289df` | docs(platform): better-auth 中间件 Set-Cookie 路径扫描脚本 + 报告 |
> | M28.2 benchmark | `395ee29` | test(engine): verification-runner 多 cs 告警性能基准基线 |
> | M28.2 优化 | `eaaa997` | fix(engine): runCodeScanningFixes 批处理 + 测试覆盖（M28.2 优化） |
> | M28.3 | `99302b5` | feat(engine): Code Scanning 真实仓库样本采集脚本 + 报告模板（M28.3 / C15） |
> | M28.4 tool | `9207481` | feat(mcp): 新增 pnpm_audit 本地回退数据源 tool |
> | M28.4 对齐 | `5cf2d22` | feat(mcp): runScan 返回结构 RunResult 对齐 5 字段 |
>
> **关键决策 D1-D6**（2026-09-11 用户决策 + M28 完整闭环后）：
>
> - **D1**：方案 M28-A 类型平衡原则（5 候选 = 📚 1 + 🛡️ 3 + 🚀 1）—— 按 §1.1 L12 推荐粒度（5-6 原子条目硬上限）；UX / 测试覆盖缺口真实存在显式标注
> - **D2**：M28.1 重编号为 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— **优先治本 §4.4 第 11 条结构性缺陷**，避免 M27.1 教训复发
> - **D3**：backlog.md 治理债清理 D 阶段已落地（6 文件 modified → 4 atomic commits ahead）—— W1 / C9 / C13 / C36 已闭环条目整段/行删除 + §已知边界 M22.7/M22.8 follow-up stale 同步 + session 元数据 ahead=17 → 0 同步
> - **D4**（M28.4 诚实修订）：`packages/mcp/src/tools/errors.ts` 已 M26.x 阶段落地（`ToolError` + `requireToken()` + `toToolError()` 双 helper），本任务不再做错误包装 helper；仅做未落地部分：pnpm-audit 本地 tool + RunResult 5 字段对齐
> - **D5**（§3.4 五步流程完整执行）：M28.2-M28.5 P 阶段 §3.4 五步流程核验全部 0 项重复评估 + M28.4 部分已落地修订 todo.md §M28.4 验收标准 + 执行顺序建议按"用户决策方案"实际推进
> - **D6**（M28 完整闭环）：5 候选 ahead commits 实测 = 11（含 M28 启动 2 + 治理债清理 3 + M28 完整闭环 6 = 11）—— M28.6 归档批次落地指针模式 + ahead commits 待用户主动推送
>
> **类型平衡复核**：
> - 🛡️ 技术债 / 治本：2 项（M28.2 / M28.5）—— ✅ 满足
> - 🚀 能力扩展：1 项（M28.4 C33 MCP）—— ✅ 满足
> - 🛡️ 技术债：1 项（M28.3 C15）—— ✅ 满足
> - 📚 治理：1 项（M28.1 重编号）—— ✅ 满足
> - 🎨 用户体验：**0 项** —— ❌ 缺口（C36 / C37 均已闭环或前置依赖）
> - 🧪 测试覆盖：**0 项** —— ❌ 缺口（db-restore S-1/S-2 恢复条件不明确）
>
> **关键经验**：
> - **M28.1 §4.4 第 11 条规则强化治本 §4.4 第 11 条结构性缺陷**（粗粒度触发 vs 细粒度触发 + 二元决策 vs 三元决策）——避免 M27.1 教训复发（重复评估）
> - **M28.2 批处理折中方案**（batchSize=10 / 提速 ~10x / 回滚粒度 = batchSize）——比合并验证保守（回滚粒度更细）
> - **M28.3 第一阶段脚本 + fixture + 报告框架就绪**——实际 GitHub API 采集合 CI/staging 环境跑 `GITHUB_TOKEN=xxx node sample-collector.mjs`
> - **M28.4 RunResult 对齐保持向后兼容**（8 字段保留 + 5 字段新增 + 2 可选字段按需）——不破坏现有 MCP 客户端契约
> - **M28.5 治本验证通过**（better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie）——M22.8 follow-up ② 建议关闭
> - **§3.4 五步流程完整执行**（todo-archive + git log + 代码侧 anchor + git log --grep 候选 ID + 关联决策交叉核验）——避免本次踩中的"M27.1 教训复发"
>
> **完整实施记录 / 关键经验 / 待迁移经验**：
> - **M28.1 详细记录**：见 commit `1a75068` —— planning.md §4.4 第 11 条新增"§已知边界段部分闭环处理指引"（4 种状态决策 + 触发条件 + 合规核验）+ C36 引用移除 + M22.7 follow-up ② 部分闭环示例
> - **M28.2 详细记录**：见 commits `395ee29` + `eaaa997` —— vitest bench API N=10/50/100 baseline（实测 N=100 平均 2593 ms / N=1 平均 27 ms / 96x 性能差距证明顺序 spawn 瓶颈）+ 批处理优化（batchSize=10 / 10 个测试用例覆盖边界）
> - **M28.3 详细记录**：见 commit `99302b5` —— sample-collector.mjs 461 行 / 32 种子仓库跨 5 语言（js/ts: 8 / py: 6 / java: 6 / go: 6 / ruby: 6）/ 3 模式（采集 + 离线分析 + fixture 模板）/ 报告 docs/research/code-scanning-b-class-samples.md / fixture 占位
> - **M28.4 详细记录**：见 commits `9207481` + `5cf2d22` —— pnpm_audit MCP tool（74 行实现 + 158 行测试 / 7 测试用例 / 复用 errors.ts 错误包装 helper / MCP 7 tool → 8 tool）+ RunResult 对齐 5 字段（startedAt / finishedAt / config / alerts / actions / 保留 8 字段向后兼容 / 2 可选字段按需）
> - **M28.5 详细记录**：见 commit `d7289df` —— apps/platform/scripts/set-cookie-trace.mjs 420 行（静态扫描 + 离线分析模式 + rate limit 重试 + 404 跳过）/ 报告 docs/research/better-auth-set-cookie-path-audit.md 77 行 / 结论 better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie + M22.8 follow-up ② 实证无影响建议关闭
>
> **ahead 状态**：`git rev-list HEAD ^origin/master --count` = **11** 待用户主动推送（按 [AGENTS.md §5 推送禁令](../../../AGENTS.md) 未经用户明确要求不得执行 `git push`）