# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **当前阶段：M28 完整闭环 + M28.6 归档已落地（2026-09-11）** —— M28.1-M28.5 全部 5 候选已 ahead=11 commits 待用户主动推送；下一阶段待用户决策 M29+ 启动。
>
> **M28 完整闭环证据**（ahead commits 实测 = 11）：
>
> | 候选 | commit hash | 摘要 |
> |:---|:---|:---|
> | M28.1 重编号 | `1a75068` | docs(standards): planning.md §4.4 第 11 条规则强化（§已知边界段部分闭环处理指引） |
> | M28.2 基准 | `395ee29` | test(engine): verification-runner 多 cs 告警性能基准基线 |
> | M28.2 优化 | `eaaa997` | fix(engine): runCodeScanningFixes 批处理 + 测试覆盖（M28.2 优化） |
> | M28.3 第一阶段 | `99302b5` | feat(engine): Code Scanning 真实仓库样本采集脚本 + 报告模板（M28.3 / C15） |
> | M28.4 工具 | `9207481` | feat(mcp): 新增 pnpm_audit 本地回退数据源 tool |
> | M28.4 对齐 | `5cf2d22` | feat(mcp): runScan 返回结构 RunResult 对齐 5 字段 |
> | M28.5 治本 | `d7289df` | docs(platform): better-auth 中间件 Set-Cookie 路径扫描脚本 + 报告 |
> | M28 启动 | `1e68948` | docs(plan): M28 启动决策落地 todo.md + roadmap.md §M28 + §M27 D4 stale 修正 |
> | M28 评估 | `a4abb71` | docs(plan): M28.2-M28.5 P 阶段评估修订 todo.md §M28.4 验收标准 + 类型平衡 + 执行顺序 |
> | backlog 清理 | `608bcac` | docs(plan): backlog.md 治理债清理 + M22.7/M22.8 follow-up stale 同步 |
> | 跨文档同步 | `f5be990` | docs(plan): 跨文档 stale 同步 |

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（M28 + M27 + M26 + M23 已 ahead 归档；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md)（**M28 归档批次同步清理**：C14 / C15 / C33 已闭环条目删除；backlog.md 健康窗口 ~229 行） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M28 状态已完成 2026-09-11 归档；下一阶段待用户决策 M29+ 启动） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M28 完整闭环任务清单（指针段 + 关键 commit 实证）

### M28.1 [P3 📚 治理] backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化（重编号）—— ✅ 已闭环
- **commit hash**：`1a75068`
- **ahead 状态**：已落地 + ahead 待推送
- **归档详情**：见 [todo-archive.md §M28 指针段](todo-archive.md)（指针模式 + 关键决策 D1-D6 + ahead commits 实证）

### M28.2 [P3 🛡️ 技术债] C14 多 cs 告警逐告警全项目 lint 性能 —— ✅ 已闭环
- **commit hash**：`395ee29`（benchmark 基线）+ `eaaa997`（批处理优化）
- **ahead 状态**：已落地 + ahead 待推送
- **批处理决策**：batchSize=10（折中方案，提速 ~10x，vs 合并验证 ~96x 但回滚粒度过粗）

### M28.3 [P2 🛡️ 技术债] C15 Code Scanning B 类规则真实仓库样本核对 —— ⚠️ 第一阶段已闭环（脚本 + 报告模板 + fixture 占位）
- **commit hash**：`99302b5`
- **ahead 状态**：已落地 + ahead 待推送
- **实际采集合**：依赖 CI / staging 环境 `GITHUB_TOKEN` 跑 `node packages/engine/src/code-scanning/scripts/sample-collector.mjs --output=real-samples.json`
- **后续批次**：实际 fixture + 按需规则分级修正（go/* / ruby/* 补 SUGGESTED_RULES）

### M28.4 [P3 🚀 能力扩展] C33 MCP P3（pnpm-audit 本地 tool + RunResult 字段对齐）—— ✅ 已闭环
- **commit hash**：`9207481`（pnpm_audit tool 新增）+ `5cf2d22`（RunResult 对齐 5 字段）
- **ahead 状态**：已落地 + ahead 待推送
- **诚实标注**：`errors.ts` 错误包装 helper 已 M26.x 阶段落地（`ToolError` + `requireToken()` + `toToolError()` 双 helper），本任务不再做错误包装 helper

### M28.5 [P3 🛡️ 治本] M22.8 follow-up ② better-auth 中间件 Set-Cookie 路径扫描 —— ✅ 治本验证通过
- **commit hash**：`d7289df`
- **ahead 状态**：已落地 + ahead 待推送
- **扫描结论**：better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie + 项目代码无显式 setCookie 调用 + M22.8 follow-up ② **实证无影响**

---

## M28 整体统计

- **ahead commits 总数**：11（M28 启动 2 + 治理债清理 3 + M28 完整闭环 6 = 11）
- **完整闭环候选**：M28.1 + M28.2 + M28.3（第一阶段）+ M28.4 + M28.5 = 5 候选
- **类型平衡复核**（[§1.1 L12](../standards/planning.md#11-硬性约束)）：
  - 🛡️ 技术债 / 治本：2 项（M28.2 + M28.5）—— ✅
  - 🚀 能力扩展：1 项（M28.4）—— ✅
  - 🛡️ 技术债：1 项（M28.3）—— ✅
  - 📚 治理：1 项（M28.1）—— ✅
  - 🎨 用户体验：0 项 —— ❌ 缺口（C36 / C37 均已闭环或前置依赖）
  - 🧪 测试覆盖：0 项 —— ❌ 缺口（M28.5 含 e2e helper 验证，但 db-restore S-1/S-2 恢复条件不明确）

---

## ahead commits 实证

`git rev-list HEAD ^origin/master --count` = **11**（M28 完整闭环 ahead 待用户主动推送）

按 [AGENTS.md §5 推送禁令](../../AGENTS.md)："未经用户明确要求，不得执行 `git push`。所有推送操作必须由用户主动触发。"

---

## 待用户决策

- **ahead=11 commits 推送** —— M28 完整闭环 ahead 待用户主动推送
- **下一阶段 M29+ 启动** —— 待用户决策启动时机 + 候选评估
- **M28.3 实际采集合** —— CI/staging 环境 `GITHUB_TOKEN=xxx node sample-collector.mjs` 跑实际 GitHub API 采集合规则分级修正