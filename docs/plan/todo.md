# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M19 治理 + 能力扩展 + 测试补强（2026-08-30 启动）

> **状态**：P 阶段规划完成，等待用户确认启动。
>
> **范围**：承接 M18 闭环后 backlog 候选池，按"类型平衡"原则选取 5 项任务：技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项。
>
> **依赖关系**：M19.1 独立（治理前置）→ M19.2 / M19.3 / M19.4 / M19.5 可并行
>
> **总投入预估**：~10 commits（M19.1 1-2 + M19.2 2-3 + M19.3 1-2 + M19.4 2-3 + M19.5 1-2）
>
> **下一步候选**：
> - **M19.1 D 阶段**：执行 C34 存量规范挂接盘点（docs only）
> - **backlog 主条目候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）

---

### [x] M19.1 C34 存量规范严格约束挂接盘点 ✅ 已完成（2026-08-30）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P3（技术债） |
| **类型** | 治理 |
| **目标** | 审查 `docs/standards/*.md` 中所有"必须级"条款，确保每个条款都在 `code-quality-checklist.md`（审计检查点）和 `code-reviewer` skill（代码审查）双层对称挂接，消除规范"有但未落地"的盲区 |
| **范围** | **做什么**：① 遍历 `docs/standards/` 下所有 .md 文件，提取含"必须"/"禁止"/"不得"/"强制"等强制性措辞的条款；② 逐一核对是否已在 `code-quality-checklist.md` 对应章节挂接；③ 逐一核对是否已在 `code-reviewer` skill 检查点挂接；④ 缺失项补挂接并注明来源条款编号 |
| | **不做什么**：不修改 `docs/standards/` 规范原文；不新增规范条款；不处理"建议"/"推荐"等非强制性条款 |
| **验收标准** | ① `rg -n "必须\|禁止\|不得\|强制" docs/standards/*.md` 输出的所有条款均有 `code-quality-checklist.md` 对应检查点；② `code-reviewer` skill 检查点列表包含所有强制性条款的审查项；③ 补挂接的条目标注来源（如 `[来源: development.md §3.2]`）；④ `pnpm run check:docs` 通过（无死链） |
| **交付物** | 更新后的 `docs/standards/code-quality-checklist.md` + `code-reviewer` skill 检查点列表 |
| **依赖** | 无（独立，治理前置） |
| **预估** | 1-2 commits |
| **实际** | 1 commit（`c0c559f`），补充 8 个必查项，Code Auditor quick depth Pass |
| **验证** | `pnpm run check:docs` 通过（101 md + 57 vue-interp），`pnpm --filter dependfix-docs build` 通过 |

---

### [x] M19.2 C23 发现规模上限 max-repos ✅ 已完成（2026-08-31）

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（能力扩展） |
| **类型** | 架构 |
| **目标** | 为仓库发现层新增 `max-repos` 配置上限，防止大 org 数百仓库一次性全量发现导致 API 配额不可控消耗和超时 |
| **范围** | **做什么**：① `architecture.md` 已规划 `max-repos` 参数但代码未实现（grep 零命中），需在发现层实现；② 按配置上限截断排序后的仓库列表（确定性：按 repo name 排序后截断）；③ CLI / Action / Platform 三入口统一暴露该参数；④ 默认值合理（建议 100）并文档说明 |
| | **不做什么**：不实现分批处理（当前截断方案已满足需求）；不改变现有并发逻辑（concurrency 16 + 限流重试 + probe 并发 5） |
| **验收标准** | ① `packages/engine/src/discovery/` 相关代码实现 `maxRepos` 参数并按排序截断；② CLI `--max-repos` 选项可传递到发现层；③ 平台 UI 扫描配置可设置 max-repos；④ 单测覆盖：超过上限时截断 + 未超过时不截断 + 默认值生效；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | 发现层代码变更 + CLI/Action/Platform 入口参数 + 单测 + 文档更新 |
| **依赖** | 无（可与 M19.3-M19.5 并行） |
| **预估** | 2-3 commits |
| **实际** | 1 commit（`3b816f4`），15 文件 +149/-1 行 |
| **验证** | `pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过 |
| **审计** | Code Auditor standard depth：1 blocker（MCP schema）+ 3 warning（env normalizer / Action input / Platform UI）已全部修复 |

---

### M19.3 B1 PR 关闭评论 + label

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（用户体验） |
| **类型** | 功能 |
| **目标** | 当 dependfix 发现同一仓库已有未合并的修复 PR 时，在新 PR 上添加评论指明重复 + 添加 label（如 `duplicate`），避免用户手动排查 |
| **范围** | **做什么**：① PR 创建前查重逻辑已存在（`pulls.list`），需在发现重复时添加评论（内容：指向已有 PR 的链接 + 说明）；② 添加 `duplicate` label（可配置）；③ 确保 `GITHUB_TOKEN` 权限包含 `issues: write`（比当前 `pull-requests: write` 宽） |
| | **不做什么**：不自动关闭重复 PR（保留用户决策权）；不实现 PR 列表过滤/搜索 UI（后续候选）；不优化 `pulls.list` 性能（当前量级可接受） |
| **验收标准** | ① 当同一仓库存在未合并修复 PR 时，新创建的 PR 包含指向已有 PR 的评论；② 新 PR 被添加 `duplicate` label；③ GitHub API 调用使用 `issues: write` 权限的端点；④ 单测覆盖：重复场景评论 + label / 非重复场景不操作；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | PR 创建逻辑变更 + 评论模板 + label 配置 + 单测 |
| **依赖** | 无（可与 M19.2/M19.4/M19.5 并行） |
| **预估** | 1-2 commits |

---

### M19.4 T701-e2e 管理端点集成测试补强

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（测试覆盖） |
| **类型** | 测试 |
| **目标** | 补强平台管理端点（用户管理 / 凭据管理 / 仓库管理）的 Playwright e2e 集成测试覆盖，当前主要依赖 vitest 单测，e2e 仅覆盖 admin.vue 页面 |
| **范围** | **做什么**：① 用户管理端点：创建 / 列表 / 删除 / 角色变更的 API 集成测试；② 凭据管理端点：创建 / 列表 / 删除 / 类型验证的 API 集成测试；③ 仓库管理端点：导入 / 列表 / 删除 / 扫描触发的 API 集成测试；④ 测试使用 mock 数据（不依赖真实 GitHub API） |
| | **不做什么**：不覆盖 OAuth / OIDC 登录流程（属于 T701 真实环境验证）；不覆盖定时任务 / BullMQ 集成（属于 T704）；不重写已有单测（补充而非替代） |
| **验收标准** | ① 新增 e2e 测试文件覆盖上述 3 类端点；② 每个端点至少覆盖正常路径 + 错误路径（如权限不足 / 参数缺失）；③ `pnpm --filter @dependfix/platform exec playwright test` 新增测试全部通过；④ 测试可在 CI 环境稳定运行（无 flaky）；⑤ `pnpm typecheck` + `pnpm lint` 全通过 |
| **交付物** | 新增 e2e 测试文件 + 测试 fixtures + CI 验证 |
| **依赖** | 无（可与 M19.2/M19.3/M19.5 并行） |
| **预估** | 2-3 commits |

---

### M19.5 C8 per-source 错误隔离

| 维度 | 内容 |
|:---|:---|
| **优先级** | P2（用户体验） |
| **类型** | 功能 |
| **目标** | 当并行告警源（Dependabot / Code Scanning / pnpm-audit）中任一失败时，不整体硬失败，而是 warn + 仅丢弃该源结果，保留其他已成功的源数据 |
| **范围** | **做什么**：① 修改 `packages/engine/src/` 中并行拉取逻辑，捕获单源异常并 warn 日志；② 已成功的源结果正常返回，失败源返回空数组 + 错误信息；③ 返回结构包含 `errors` 字段列出失败源及原因；④ CLI 输出 / 平台 UI 展示部分失败警告 |
| | **不做什么**：不实现重试逻辑（已有并发 + 限流重试）；不改变成功源的行为；不实现用户可配置的"严格模式"（全失败才失败） |
| **验收标准** | ① 模拟单源失败场景（如 Dependabot API 超时），其他源结果正常返回；② 返回结构 `errors` 数组包含失败源名称 + 错误信息；③ CLI 输出警告信息（如 `[WARN] Dependabot source failed: timeout, continuing with other sources`）；④ 单测覆盖：单源失败 / 全部成功 / 全部失败；⑤ `pnpm typecheck` + `pnpm lint` + `pnpm test` 全通过 |
| **交付物** | 引擎层错误隔离逻辑 + 返回结构扩展 + CLI/UI 警告展示 + 单测 |
| **依赖** | 无（可与 M19.2/M19.3/M19.4 并行） |
| **预估** | 1-2 commits |

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |
