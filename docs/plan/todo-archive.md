# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。
> 主窗口保留最近 3-5 个已归档阶段摘要；早期阶段归档分片见 [archive/](archive/)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：
  - [M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出，115 行）
  - [M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906 执行，398 行）
  - [M6 / M7.1 / M7.2 / T711 / M8](archive/todo-archive-phases-m6-m7-t711.md)（2026-08-20 neat-freak 归档批次迁出，293 行）
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次（含 C53-后-A/B/C 衍生子任务）**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）
  - **M10 / T912 / C53 / 2026-08-20 平台 UI 增强（C59-C61）**：[archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)（**2026-08-28 M16 归档批次同步迁出**——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略）
  - **M13**：[archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**——M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略）
  - **M14 + M15**：[archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（**2026-08-31 M19 归档批次预防性分片迁出**——M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值；M14 + M15 同源批次同期迁出，符合"主窗口保留 3-5 个阶段"健康策略）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块（当前保留 **2026-08-31 M19 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 5 commits 全部推送 ahead=0）/ 2026-08-30 M18 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / ~24 commits 全部推送 ahead=0）/ 2026-08-28 M17 安全与可用性收口（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 全部已闭环 / 9 commits 全部推送 ahead=0）/ 2026-08-28 M16 平台可用性深化（M16.1+M16.2+M16.3+M16.4+M16.5 已实施 / M16 全部闭环）** 共 4 个批次，符合"主窗口保留 3-5 个阶段"健康策略）。**预防性分片**：M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)，保持主窗口行数在 700 强制分片阈值内。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 `todo-archive-phases-m14-m15.md`）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 待推送：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期 ahead 部分待用户推送（ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M19: 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 2026-08-31 归档）

> **归档日期**：2026-08-31
> **阶段摘要**：M18 闭环后承接 backlog 候选池，按"类型平衡"原则（技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项）选取 5 项任务独立闭环。M19.1（P3，技术债）C34 存量规范严格约束挂接盘点 / M19.2（P2，能力扩展）C23 发现规模上限 max-repos / M19.3（P2，用户体验）B1 PR 关闭评论 + label / M19.4（P2，测试覆盖）T701-e2e 管理端点集成测试补强 / M19.5（P2，用户体验）C8 per-source 错误隔离；外加 M19.x 收口（孤立编号清理 commit `ae33671`）+ 配套 commits（M19 规划 `2f9eb38` + M19 任务详情更新 `bee5c3f` + M19.4/M19.5 标记完成 commits `61b3ddc` / `4231ffb`）。
> **阶段边界**：M19 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ 类型平衡；不涉及架构变更（仅 max-repos 上限参数）；不破坏既有 PAT / AuthProvider / GitHub App / viewer role check 等机制。
> **非目标**：不引入新依赖；不升级 better-auth / PrimeVue；不破坏 C22 PAT + App 并存路径；不引入 GitHub Actions API 权限升级之外的额外权限面扩展（B1 仅扩展到 `issues: write`）；fixtures 仍 mock（e2e 真实凭据验证属 T701 真实环境验证任务保留于 backlog）。
> **状态**：✅ 全部完成（M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务闭环 / 5 atomic commits + 配套 commits 已全部推送至 origin/master；ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 standard depth Pass / M19.2 standard depth Pass（含 1 blocker + 3 warning 已全部修复）/ M19.3 standard depth Pass（2 warning 已全部修复）/ M19.4 quick depth Pass（1 blocker + 3 warning 已全部修复）/ M19.5 standard depth Pass（2 warning 已修复 1 项 + 1 项登记 P3）+ 同步配套 commits；本批次清理 backlog 5 个已上收主条目：B1 PR 关闭评论 + label（M19.3 闭环）/ C23 发现规模上限 max-repos（M19.2 闭环）/ C8 per-source 错误隔离（M19.5 闭环）/ T701-e2e（M19.4 闭环）/ C34 存量规范严格约束挂接盘点（M19.1 闭环））

### 阶段闭环清单

#### M19.1 C34 存量规范严格约束挂接盘点 ✅（2026-08-30 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C34 存量规范严格约束挂接盘点** | `0c536c1`（docs(review)） | 补充 8 个强制性条款检查点到 [code-reviewer](../../.github/skills/code-reviewer/SKILL.md) skill + [code-quality-checklist](../../.github/skills/code-reviewer/references/code-quality-checklist.md)（含 audit-depth / commit 拆分 / F 阶段 coverage 强制 / M14.x code-quality-checklist 双向同步 / M17.6 better-auth 锁定 / M18.x 集成外部库 README 标准用法 / 治理规范 audit warning 修复 vs 登记决策 / M18.x audit Reject 后针对性补修）；A 阶段 quick depth Pass |

#### M19.2 C23 发现规模上限 max-repos ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C23 发现规模上限 max-repos** | `c998d58`（feat(engine)） | 15 文件 / +149/-1 行；`packages/engine/src/discovery/` 实现 `maxRepos` 参数按排序截断保证确定性；CLI `--max-repos` 选项 + Action input + Platform UI 三入口统一暴露；默认值 100；单测覆盖：超过上限时截断 / 未超过时不截断 / 默认值生效；A 阶段 standard depth Pass（1 blocker MCP schema 修复 + 3 warning env normalizer / Action input / Platform UI 已全部修复） |

#### M19.3 B1 PR 关闭评论 + label ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **B1 PR 关闭评论 + label** | `5839771`（feat(engine)） | 8 文件 / +492/-5 行；PR 创建前查重逻辑扩展：当同一仓库存在未合并修复 PR 时，在新 PR 添加评论（指向已有 PR 的链接 + 说明）+ 添加 `duplicate` label（可配置）；`GITHUB_TOKEN` 权限扩展到 `issues: write`（比当前 `pull-requests: write` 宽）；A 阶段 standard depth Pass（2 warning 集成测试 + action.yml 已全部修复） |

#### M19.4 T701-e2e 管理端点集成测试补强 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **T701-e2e 管理端点集成测试补强** | `8db2fd4`（test(platform)） | 3 文件 / +841 行；`apps/platform/tests/e2e/` 新增 `users-api.e2e.test.ts` (6 case) + `credentials-api.e2e.test.ts` (19 case) + `repos-api.e2e.test.ts` (25 case) —— 用户管理端点 + 凭据管理端点 + 仓库管理端点 API 集成测试；playwright test 50 passed（users 6 + credentials 19 + repos 25）；A 阶段 quick depth Pass（1 blocker users-api 与 admin-roles 重复 + 3 warning repos 缺扫描/导入 / users 缺 impersonate/unban / credentials data.code 一致性 已全部修复） |

#### M19.5 C8 per-source 错误隔离 ✅（2026-08-31 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C8 per-source 错误隔离** | `a20ea02`（feat(engine)） | 5 文件 / +159/-2 行；`packages/engine/src/` 并行拉取逻辑捕获单源异常并 warn 日志；返回结构扩展 `FixError.source` 字段 + `logPartialSourceFailureSummary` 函数汇总警告可见性；CLI 输出警告（如 `[WARN] Dependabot source failed: timeout, continuing with other sources`）；核心错误隔离机制（Promise.allSettled）此前已存在，本批次主要补强 CLI 汇总警告可见性；A 阶段 standard depth Pass（2 warning：throw 路径重复提示已修复 + pnpm-audit 单源文案登记 P3） |

#### M19.x 收口（孤立编号清理）✅

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M19.x 收口** | `ae33671`（docs(refactor)） | 移除本次提交引入的孤立编号（M19.x → todo.md §M19.x）；编号标记扫描 0 命中（防御 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md)） |

### 阶段验收标准（M19 全部 5 子任务闭环 ✅）

- [x] **M19.1 C34 存量规范挂接盘点** —— 8 个必查项补充到 code-reviewer skill + code-quality-checklist + 双向挂接完整；`pnpm check:docs` 通过（101 md + 57 vue-interp）；`pnpm --filter dependfix-docs build` 通过
- [x] **M19.2 C23 发现规模上限 max-repos** —— `packages/engine/src/discovery/` 实现 `maxRepos` 参数 + CLI/Action/Platform 三入口暴露 + 单测覆盖（超过上限时截断 / 未超过时不截断 / 默认值生效）；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2495 passed / `pnpm run check:docs` 通过
- [x] **M19.3 B1 PR 关闭评论 + label** —— 当同一仓库存在未合并修复 PR 时新 PR 含评论 + `duplicate` label；GitHub API 调用 `issues: write` 权限端点；单测覆盖：重复场景评论 + label / 非重复场景不操作；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2504 passed
- [x] **M19.4 T701-e2e 管理端点集成测试补强** —— 3 个 e2e 文件（users 6 + credentials 19 + repos 25 = 50 case）覆盖用户管理 / 凭据管理 / 仓库管理端点 API 集成；mock 数据不依赖真实 GitHub API；playwright CI 环境稳定无 flaky；`pnpm typecheck` 7 包全 Done / `pnpm lint` 全通过
- [x] **M19.5 C8 per-source 错误隔离** —— 模拟单源失败（Dependabot API 超时），其他源结果正常返回；返回结构 `FixError.source` 字段含失败源名称 + 错误信息；CLI 输出警告信息；单测覆盖：单源失败 / 全部成功 / 全部失败；`pnpm typecheck` 7 包全 Done / `pnpm lint` 0 error / `pnpm test` 2510 passed
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 2510 passed（M19.5 实测 baseline）
- [x] `pnpm check:docs` 全过
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 5 atomic commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：5 atomic commits（M19.1 + M19.2 + M19.3 + M19.4 + M19.5）+ 配套 commits（M19 规划 `2f9eb38` / M19 任务详情 `bee5c3f` / M19.4 标记完成 `61b3ddc` / M19.5 标记完成 `4231ffb` / M19.x 收口 `ae33671`）+ cron-preview 时区修复 `3597dcf` + cron-preview backlog 登记 `52d1649` —— 共 ~12 commits 落地（M19 批次主线 5 + 配套 5 + 顺带 2）
- **测试覆盖**：vitest 2495 → 2510 passed（M19.2 baseline 2495 + M19.3 +9 case + M19.5 +6 case + M19.4 e2e 50 case 单独累计）；playwright e2e 新增 50 case（users 6 + credentials 19 + repos 25）
- **审计覆盖**：M19.1 quick / M19.2 standard（含 1 blocker + 3 warning 全部修复）/ M19.3 standard（2 warning 全部修复）/ M19.4 quick（含 1 blocker + 3 warning 全部修复）/ M19.5 standard（2 warning 修复 1 项 + 1 项登记 P3）—— 5 轮独立 Review Gate Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-31 实测 ahead=0（M19 全部 commits 落地后由用户主动推送或自然包含在 M19 推进批次；session 文件 stale `ahead=16` 描述在校正）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M19 段（本段；2026-08-31 M19 归档批次新增）
  - `docs/plan/todo.md` §M19 任务清单 → M19 全部 [x] 已闭环切换 + 顶部 banner 更新（M19 → M20 active）
  - `docs/plan/todo.md` §M20.1 [x] 状态更新（commit `acb2d35` 已落地，todo.md §M20.1 [ ] → [x]）
  - `docs/plan/roadmap.md` Milestone 概述表 M19 行状态更新（进行中 → 已完成 2026-08-31 归档）+ §M19 详细实施状态段新增
  - `docs/plan/backlog.md` 清理 5 个已上收 M19 主条目（B1 / C23 / C8 / T701-e2e / C34）+ 历史归档指针段新增 M19 条目
  - `docs/plan/archive/index.md` §4 当前基线更新（M19 归档后）+ §5 近期归档批次登记新增 M19 行

### 关键决策

- **类型平衡原则**：M19 按"技术债 1 项 + 能力扩展 1 项 + 用户体验 2 项 + 测试覆盖 1 项"选取 5 项 —— 避免单一类型堆积，确保每阶段多维价值。M18.x 治理批次（已闭环）留给 M20+ 按需触发
- **M19.3 B1 权限升级**：GitHub API 权限从 `pull-requests: write` 扩展到 `issues: write` —— 仅新增 `issues: write`（不影响 `contents: write` 等其他权限面）；用户接受 risk 后实施
- **M19.4 e2e fixtures 仅 mock**：本次 T701-e2e 仍以 mock 数据为主（不依赖真实 GitHub API）—— T701 真实凭据 3 项（GitHub OAuth / Google OAuth / OIDC SSO）保留 backlog 真实环境验证任务（与 M18.x 决策 C 一致：mock 聚焦库契约输出作缓解措施）
- **M19.5 throw 路径重复提示处理**：CLI 警告路径只在部分源失败时输出（避免全部成功 / 全部失败误报）—— FixError.source 字段 + logPartialSourceFailureSummary 函数统一汇总；pnpm-audit 单源文案（"pnpm-audit source failed"）作为 P3 后续优化项登记 backlog
- **M19.2 C23 max-repos 默认值 100**：权衡"覆盖中小型 org（~50 仓库）+ 防止大 org 数百仓库一次性全量发现"—— 默认 100 覆盖 90% 场景；CLI/Action/Platform 三入口可覆盖默认值上限需求

### 阶段关键经验（已沉淀至项目知识库）

- **C34 双层对称挂接协议（M19.1 实证）**：code-reviewer skill + code-quality-checklist 双向挂接 —— 任一方扩展另一方必须同步（M14.x 已固化原则的二次实证）；本次补 8 个必查项同步双层；规范单点声明原则贯穿
- **CLI/Action/Platform 三入口统一参数（M19.2 实证）**：新增参数时三入口同步暴露，避免"代码支持但 UI 不支持"或"代码支持但 CLI 不支持"的偏差 —— M19.2 C23 实施时一次性三入口同步
- **Code Auditor standard depth 捕获未触发自检的契约漏洞（M19.2 blocker 实证）**：M19.2 audit 命中 1 blocker（MCP schema 未同步新参数）—— 实施方未主动验证所有 schema 同步；F 阶段本地验证不能替代 A 阶段审计独立核验
- **Code Auditor quick depth 在小改动 e2e 测试补强下仍命中 blocker（M19.4 实证）**：M19.4 audit quick 命中 1 blocker（users-api.e2e 与既有 admin-roles.e2e.test.ts 测试逻辑重复）—— e2e 测试新增时主动 grep 既有 e2e 文件，避免重复覆盖
- **per-source 错误隔离 throw 路径语义对齐（M19.5 实证）**：CLI 警告只在"部分源失败"路径触发；全部成功 / 全部失败 throw 路径不重复警告 —— 与 M18.x throw 路径语义对齐原则一致

### 待迁移经验（next neat-freak 候选）

- **M19.5 pnpm-audit 单源文案优化**（P3 follow-up）：当前警告文案 "pnpm-audit source failed" 不够友好（缺详细失败原因）—— 后续批次优化为 "pnpm-audit: <error.message>" 格式；与 M18.x FixError 字段模式一致
- **M19.4 e2e fixtures 复用**（P3 follow-up）：M19.4 实施时新建 `users-api.e2e.test.ts` 等 3 个新 e2e 文件 —— 后续批次可考虑抽取 fixtures helper（如 `apps/platform/tests/e2e/helpers/api-roles.helper.ts` 统一封装 viewer/admin/org_admin 三角色 mock），与 M17.5 `authedCookieHeader` 抽取同源策略
- **M19.x 收口 commit 风格一致性**（P3 follow-up）：M19.x 收口 `ae33671` 是 refactor 类型 commit + 编号清理 —— 与 M14.x `b45f55e` git.md 双空行格式修复 + `84b4e1a` test 名孤立编号清理同模式（neat-freak 批次顺手处理）；建议统一为 `chore(refactor)` 类型而非 `docs(refactor)` —— 类型分类微调不影响 commit 内容
- **M19 backlog 候选池（M20+ 可拣选）**：B2（固定分支单线）/ B3（PR 自动合并闭环）/ C24（org 级 alerts 批量拉取）/ C33（MCP P3）/ C9（summary 字段未渲染）/ C13（循环依赖）/ C14（多 cs 告警性能）—— 详见 [backlog.md](backlog.md) §短期 / 一次性候选任务

---

## M18: 平台 GitHub App BYO App 模式（M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部已闭环 / 2026-08-30 归档）

> **归档日期**：2026-08-30
> **阶段摘要**：M17 闭环后承接 C22 GitHub App BYO App 模式（自部署平台 GitHub App 进阶选项；PAT 保留为默认快速上手路径，二者并存不替代）。M18 包含 5 子阶段 + 1 治理批次：M18.0（P0 docs only，PAT 无感升级评估）/ M18.1（P1，C22.1 基础层：credential 扩展 4 字段 + AuthProvider 抽象层 + installation token 缓存）/ M18.2（P1，C22.2 集成层：pushFixBranch token 切换 + commit author 动态化 + 审计字段）/ M18.3（P2，C22.3 表现层：UI GitHub App tab + 文档引导 + Manifest flow 可行性评估）/ M18.4（P1，C22.4 测试层：单测补强 + e2e mock JWT signing 全链路）/ M18.x 治理批次（P3 合并入 C22 子阶段顺手做：S-5/C39/C34/S1/S2/S-3/S-4/W3/W4）。
> **阶段边界**：M18 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ C22 10 原子子任务按依赖关系拆 5 子阶段；PAT 保留为默认路径 + GitHub App 作为自部署平台进阶选项，二者并存不替代；fixtures 仅 mock 无真实 App（用户接受风险）。
> **非目标**：不发布 dependfix 自身为官方 GitHub App（C22-future 单独战略候选）；不立即做 App 多 installation 编排自动化；B 模式（`github-action` executor）App 适配非阻塞；不破坏现有 PAT 路径；Manifest flow 一键创建暂不实施（A7b 仅评估，A7a 文档引导先落地）。
> **状态**：✅ 全部完成（M18.0 + M18.1 + M18.2 + M18.3 + M18.4 + M18.x 全部 6 子阶段 + 1 治理批次闭环 / ~24 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测；含 M18.4 audit round 1 Reject 后针对性补修闭环 + M18.x 治理批次 8 commits）

### 阶段闭环清单

#### M18.0 PAT 无感升级评估报告 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **PAT 无感升级评估报告**（docs only） | `690cc73` | `docs/design/governance/c22-pat-backward-compat.md` 输出 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"，M18.0 仅输出 docs only commit |

#### M18.1 C22.1 基础层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **AuthProvider + PatAuthProvider** | `026078a` | `packages/engine/src/auth/` 新建 AuthProvider 接口（`getOctokit()` / `getGitCredential()` / `getCommitAuthor()`）+ PatAuthProvider 实现 |
| **audit Reject 修复** | `0866830` | audit round 1 Reject 后针对性补修 |
| **调用点改造** | `67a1a2f` | `createGitHubClient` 改为 `{ auth: AuthProvider }` 注入；老 `{ token }` 签名保留为 deprecated 包装 |
| **接口契约 + PatAuthProvider 单测** | `e9b9c0a` | 接口契约定义 + PatAuthProvider 单测覆盖 |
| **AppAuthProvider + InstallationTokenCache + 单测** | `adf370a` | AppAuthProvider 实现 + installation token 缓存层（1h 滑窗 + 5min 提前刷新）+ 单测 |

#### M18.2 C22.2 集成层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit author 动态化** | `e84ff58` | PAT 路径保留硬编码 `dependfix[bot]@users.noreply.github.com`；App 路径动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求） |
| **pushFixBranch 接受 AuthProvider** | `a6a1695` | `pushFixBranch` token 字段动态切换为 installation token，URL 不变 |

#### M18.3 C22.3 表现层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **GitHub App 凭据管理接入实体 + schema + UI tab + PEM 校验** | `b3a2cfb` | Credential 实体扩展 `appId` / `encryptedPrivateKey` / `installationId` / `botLogin` 4 字段 + UI 凭据创建新增 GitHub App tab + PEM 客户端解析 + 公钥指纹校验 |
| **PEM 指纹算法修正** | `c6534fe` | PEM 指纹算法修正 |
| **GitHub App 配置章节 + C39 standards 同步** | `7ef0d73` | `quick-start` 加 "GitHub App 配置" 章节 + `security.md` §5 凭据模型从"PAT 三件套"扩到"PAT + App" + `architecture.md` §认证更新 + C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步（8 处） |
| **C22 Manifest flow 可行性评估** | `25d8682` | A7b 评估报告输出至 `docs/design/governance/c22-manifest-flow-feasibility.md` |
| **Manifest flow 评估修正** | `700ab28` | 评估报告修正 |
| **删除 §2.6 重复小节标题** | `ac21f6f` | 文档格式修复 |

#### M18.4 C22.4 测试层 ✅（2026-08-29 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **M18.4 测试层补强 + app-provider auth 字段 bug 修复** | `b5c23a0` | 单测补强（`auth-provider.test.ts` + `installation-token-cache.test.ts` + `pr-creator.test.ts` App bot email 路径回归）+ e2e mock JWT signing + `getInstallationOctokit` 拦截全链路验证；app-provider auth 字段 bug 修复（`@octokit/auth-app` README 标准用法：`authStrategy: createAppAuth, auth: {appId, privateKey, installationId}` 双字段） |
| **登记 M18.4 audit 教训** | `bc2ee06` | experience-archive §四十三：集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试 |

#### M18.x 治理批次 ✅（2026-08-29 闭环）

| 批次 | commit | 范围 | 验证 |
|:--|:--|:--|:--|
| 1 | `19c0cd8` docs(standards+plan) + `9da26e3` docs(testing) | C39 standards 同步（已由 M18.3 顺带闭环）+ C34 部分盘点（M14.x 5 条 + M18.x 1 条）+ experience-archive §四十三 4 条挂 standards（development.md §5.1.15 + testing.md §6.3 + ai-collaboration.md §D 第 5 条 + code-auditor.agent.md 主责边界必查项） | audit quick Pass + W1 trivial fix |
| 2 | `6866eb7` fix(engine) | **W3** stageAndCommit host 全局 git config 干扰 bug 修复（`stageAndCommit` 显式 `-c user.name=X -c user.email=Y` + `gitConfigExists` 用 `--local` flag）+ 1 个 W3 回归测试 | audit quick Reject + B1 trivial fix（删除重复 it 块） |
| 2 | `fd2a29e` fix(platform) | **S1** `scan.post.ts` + `batch-executor.ts` 字面 `'duplicate_scan'` → 联合类型 `'SCAN_PENDING_MERGED'`（C36 一致性）+ 前端 `repos.vue` 同步 + **S2** `detectServerLocale` 加 `?locale=` URL query 支持（与 `localeDetector.ts:15` `tryQueryLocale` 对齐）+ 3 个 S2 回归测试 | 验证矩阵齐备 |
| 3 | `21f1a9f` test(engine) | audit B1 fix（删除 pr-creator.test.ts 重复 W3 it 块 31 行） | 验证：63 tests passed |
| 4 | `878ae1a` test(platform) | **S-5** 5 文件 14 处 `process.env.ENCRYPTION_KEY` 死代码清理（保留 `setup-nuxt-server.ts:26` `useRuntimeConfig` stub 默认值） | platform vitest 888 passed |
| 5 | `933e578` build(workspace+ci) | **W4** `pnpm.overrides` 钉定 `@octokit/auth-app: 8.3.0`（c22 §5.5 决策 C 缓解措施 4）+ `test.yml` 新增 `pnpm audit --prod --audit-level=moderate` 步骤（不阻断 Test job） | pnpm audit 0 vulnerabilities + lockfile 同步 |
| 6 | `45cae13` test(platform) | **S-3** update-user viewer 403 端点 + **S-4** 6 端点 admin 通过双向断言（补 better-auth admin 插件完整 viewer 403 ↔ admin 通过矩阵） | lint 0 error（e2e 测试需 Playwright build 产物，本地不跑 CI 验证） |

### 阶段验收标准（M18 全部闭环 ✅）

- [x] **M18.0 PAT 无感升级评估报告** —— 3 方案对比 + 推荐 B AuthProvider 注入 + 9 测试 + 2 app 改动清单 + 风险矩阵；决策 A：严格分离"评估"与"实施"
- [x] **M18.1 C22.1 基础层** —— AuthProvider 接口 + PatAuthProvider + AppAuthProvider + InstallationTokenCache + 单测
- [x] **M18.2 C22.2 集成层** —— commit author 动态化 + pushFixBranch 接受 AuthProvider
- [x] **M18.3 C22.3 表现层** —— Credential 实体扩展 + UI GitHub App tab + 文档引导 + Manifest flow 可行性评估 + C39 standards 同步
- [x] **M18.4 C22.4 测试层** —— 单测补强 + e2e mock JWT signing 全链路 + app-provider auth 字段 bug 修复
- [x] **M18.x 治理批次** —— S-5/C39/C34/S1/S2/S-3/S-4/W3/W4 全部闭环
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— 全部通过
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— ~24 commits 已全部推送至 origin/master，ahead=0

### 阶段治理记录

- **总投入**：~24 commits（M18.0 1 + M18.1 5 + M18.2 2 + M18.3 6 + M18.4 2 + M18.x 8）；含 M18.4 audit round 1 Reject 后针对性补修闭环
- **测试覆盖**：单测补强 + e2e mock JWT signing 全链路验证
- **审计覆盖**：M18.0 quick / M18.1 quick × 2（含 1 次 Reject 后补修）/ M18.2 quick / M18.3 standard / M18.4 quick × 2（含 1 次 Reject 后补修）/ M18.x quick × 2 —— 全部 Pass
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-08-30 实测 ahead=0（已全部推送至 origin/master）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M18 段（本段）
  - `docs/plan/todo.md` 顶部 M18 任务清单 → M18 已闭环切换
  - `docs/plan/roadmap.md` M18 段状态更新（已完成 2026-08-30 归档）+ Milestone 概述表 M18 行新增
  - `docs/plan/backlog.md` §org 增强 C22 主条目状态更新（M18 已闭环）+ 历史归档指针段新增 M18 条目
  - `docs/plan/archive/index.md` 基线更新（M18 归档后）+ 近期归档批次登记新增 M18 行
  - `docs/design/governance/c22-pat-backward-compat.md`（M18.0 评估报告）
  - `docs/design/governance/c22-manifest-flow-feasibility.md`（M18.3 评估报告）
  - `docs/guide/quick-start.md` GitHub App 配置章节（M18.3）
  - `docs/design/governance/security.md` §5 凭据模型扩展（M18.3）
  - `docs/design/governance/architecture.md` §认证更新（M18.3）
  - `docs/standards/development.md` §5.1.15（M18.x 经验沉淀）
  - `docs/standards/testing.md` §6.3（M18.x 经验沉淀）
  - `docs/standards/ai-collaboration.md` §D 第 5 条（M18.x 经验沉淀）
  - `.github/agents/code-auditor.agent.md` 主责边界必查项（M18.x 经验沉淀）

### 关键决策

- **PAT 保留 + App 并存** vs 完全替换 PAT：选并存 —— PAT 是 CLI quickstart / Action input / 单仓调试的最低摩擦路径；BYO App 只对自部署平台多仓 org 场景提供增量价值（installation 范围限定 + 1h 短时 token 轮换 + 真实 bot 身份）
- **PAT commit author 保留硬编码** `dependfix[bot]@users.noreply.github.com` —— PAT 路径用户行为零变化；仅 App 路径走动态 bot identity（`{app_id}+{bot_login}[bot]@users.noreply.github.com`）
- **fixtures 仅 mock**（决策 C 风险承担）：mock 必须严格对齐 `@octokit/auth-app` 库契约输出；单测聚焦库 mock 输出契约作为缓解措施
- **Manifest flow 一键创建暂不实施**：A7b 仅评估可行性（GHES 版本支持范围 / manifest URL 构造 / OAuth callback 路径 / CSRF 防护）；A7a 文档引导先落地
- **M18.x 治理批次合并入 C22.x 子阶段顺手做**（决策 B）：按关联性分组（S-5 → M18.1 / C39+C34 → M18.3 / S1+S2 → M18.4 / S-3+S-4 → M18.4 e2e）

### 阶段关键经验（已沉淀至项目知识库）

- **集成外部库前必须读 README 标准用法**（development.md §5.1.15）：M18.1 commit 4 凭直觉写 `auth: createAppAuth(...)` 错误用法 + `vi.mock('@octokit/rest')` 跳真实路径 → M18.4 audit round 1 Reject → round 2 README 标准用法 + 去 mock 化真实路径 e2e 修复
- **测试 stub 命名一致性**（S-5 延伸教训）：调用方测试 `process.env.ENCRYPTION_KEY` 与生产 `NUXT_ENCRYPTION_KEY` 命名不一致，偶然一致性维持能跑但 setup-nuxt-server.ts stub 字符串变更会导致测试突然全挂——单一来源 + 字面量直接引用优于 env 透传

### 待迁移经验（next neat-freak 候选）

- **W1（M18.4 audit round 2）**：stageAndCommit host 全局 config 隔离未覆盖 `--local` flag 路径——仅覆盖 `-c` 显式传。需补 1 个 case 用 `process.env.GIT_CONFIG_GLOBAL=/tmp/synthetic-global-with-user.name` 模拟 host global + 不预设 local config，验证 `ensureGitConfig` 会写入 local config
- **W2（M18.4 audit round 2）**：`detectServerLocale` 不接受 `?locale=EN`（大小写敏感），`tryQueryLocale` 由 `@nuxtjs/i18n` 实现可能归一化为 `en`（BCP 47 lowercasing）。建议下一批次加 `.toLowerCase()` 兼容，或在 todo 登记
- **C34 完整盘点**：standards 中其他"必须级"条款（开发规范 §3 / §4 / §5.1.x / 测试规范 §6 / 安全规范 §5 / git 规范 §3 / AI 协作规范 §1/§4）双层对称挂接完整盘点属于 neat-freak 批次工作，本次 M18.x 治理批次仅做 experience-archive §四十三 4 条新教训挂接；候选下批次会话处理

---

## M17: 安全与可用性收口（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 全部已闭环 / 2026-08-28 归档）

> **归档日期**：2026-08-28
> **阶段摘要**：M16 闭环后承接 M16.5 audit W-1（凭据加密路径错配）+ S-2（`authedCookieHeader` 三批次遗留重复）+ S-4（better-auth admin viewer role check 单测补强）+ M16.3 audit suggest 范围外扩展（`/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`）4 条 backlog 候选，按"安全性 P1 优先 + i18n 范围外扩展按模块化分组 + 测试基建顺手做"原则拆 **6 子阶段独立闭环**：M17.1 C38 encryptionKey 标准化（service 直读 env → runtimeConfig）/ M17.2 credentials 服务端 API i18n（10 文件抛错本地化）/ M17.3 schedules 服务端 API i18n（同 M17.2 模式）/ M17.4 batch-runs + repos batch 服务端 API i18n（13 文件拆 2 commits）/ M17.5 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/`（纯重构）/ M17.6 S-4 better-auth admin viewer 403 矩阵补强（`ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点）。
> **阶段边界**：M17 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限 + A3 跨 packages+apps > 10 文件超阈值需拆分）+ M16.5 audit backlog 4 条目（安全性 + i18n + 测试基建）一并承接；M16.3 `createLocalizedError` 沉淀模式严格沿用（0 新设计成本）；M17.4 总 13 文件拆 2 commits 避开"4 端口合 1 批"反模式。
> **非目标**：不升级 better-auth 1.x 库；不动 h3 `createError` 行为；不引入新 i18n 工具；不改既有 `e2e helpers/` 目录约定；不扩展 C36 业务字段（`ScanRun.errorJson.message` 等 type=Error 业务字段按 C36 验收"不影响 type=Error"约束**不**本地化）。
> **状态**：✅ 全部完成（M17.1 + M17.2 + M17.3 + M17.4 + M17.5 + M17.6 全部 6 子阶段闭环 / 9 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测；含 M17.4 commit 2 audit Reject 后针对性补修闭环 + M17.5 lint-fix 独立 chore commit + session 收尾治理 commit 1；6 轮独立 Review Gate Pass，M17.4 commit 2 standard depth Reject 1 次 + M17.4 commit 2 audit Reject 后补修闭环）

### 阶段闭环清单

#### M17.1 T1701 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **service 改读 `useRuntimeConfig().encryptionKey`** | `b0d3ac0`（fix(platform)） | `apps/platform/server/services/credential.service.ts:73-76` `getEncryptionKey` 改读 `useRuntimeConfig().encryptionKey`（不再直读 `process.env.ENCRYPTION_KEY`）；`apps/platform/nuxt.config.ts:61` runtimeConfig `encryptionKey` 移除 inline fallback 让 `NUXT_ENCRYPTION_KEY` 成为唯一入口；删除 `playwright.config.ts:34` 临时 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` 兜底（保留 L30 标准 `NUXT_ENCRYPTION_KEY=...` 部署凭据）；同步更新 `docker-compose.yml` / `.env.example` 文档 |
| **21 个调用方测试 ReferenceError 修复** | `b0d3ac0`（含测试修复） | 实施 7 文件 / +33/-29 行；调用方测试不再依赖 `process.env.ENCRYPTION_KEY`（与 M16.5 临时兜底兼容）；21 个调用方测试从 ReferenceError 修复后 853 passed |
| **A 阶段 standard depth Pass** | `b0d3ac0`（含收口） | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 853 passed + 4 skipped；A 阶段 standard depth Pass（warning 3 项：W-1 登记 backlog [C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步](#待迁移经验next-neat-freak-候选) / W-2 登记 backlog [S-5 调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理](#待迁移经验next-neat-freak-候选) / W-3 inline fallback 顺手修复） |

#### M17.2 T1702 服务端 API i18n：credentials ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **throw 改造使用 `createLocalizedError`** | `5f66a08`（refactor(api)） | `apps/platform/server/api/credentials/{index,[id]}.ts` 2 文件 throw 改造使用 `createLocalizedError`（沿用 M16.3 C36 已沉淀模式）；既有测试调整（message→code 断言）；message 按请求 locale 返回；7 文件 / +90/-14 行 |
| **A 阶段 quick depth Pass** | `5f66a08`（含收口） | A 阶段 quick depth Pass（实测 187 秒 ≤ 5 分钟时间盒；0 blocker / 1 suggest 延后到 M17.3 audit 后合并处理：S-1 `ServerErrorCode` 字母序跨 M17.2/M17.3/M17.4 多次延后登记 backlog） |

#### M17.3 T1703 服务端 API i18n：schedules ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **throw 改造使用 `createLocalizedError`** | `90549a0`（refactor(api)） | `apps/platform/server/api/schedules/{index,[id],[id]/trigger.post}.ts` 3 文件 throw 改造使用 `createLocalizedError`（沿用 M17.2 模式）；既有测试调整（call helper 签名扩展接受 headers 模式）；message 按请求 locale 返回；8 文件 / +93/-18 行 |
| **A 阶段 quick depth Pass** | `90549a0`（含收口） | A 阶段 quick depth Pass（实测 314 秒略超 5 分钟时间盒；0 blocker / 2 suggest 登记 backlog：S-1 字母序合并处理 / S-2 测试 helper 签名扩展模式文档化） |

#### M17.4 T1704 服务端 API i18n：batch-runs + repos batch ✅（2026-08-28 闭环 / 拆 2 commits）

> 本子阶段按 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md) A3 跨 packages+apps > 10 文件超阈值需拆分原则，**总 13 文件拆 2 commits**：commit 1（`98fd47d`）9 文件字典 + helper + API throw 改造 / commit 2（`a1c7c4e`）4 文件既有测试 message→code 断言调整。commit 2 audit standard depth Reject 1 次（实测 7 个 typecheck error——nuxt typecheck 容忍部分 TS error 但 build 仍阻断；M17 session 关键教训）后针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 afterEach import）。

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit 1：字典 + helper + API throw 改造** | `98fd47d`（refactor(api)） | `apps/platform/server/api/batch-runs/{[id].get,[id]/force-fail.post}.ts` + `apps/platform/server/api/repos/{batch.post,batch-scan.post,importable.get}.ts` 共 5 文件 throw 改造使用 `createLocalizedError`（沿用 M17.2 模式 + 字典扩展 `REPO_*` / `BATCH_RUN_*` 段 + codeSet 测试覆盖新 code）；9 文件 / +125/-27 行 |
| **commit 2：既有测试 message→code 断言调整 + audit Reject 补修** | `a1c7c4e`（test(platform)） | 既有测试 message→code 断言调整（4 文件 / +68/-14 行）；A 阶段 standard depth Round 1 Reject 7 个 typecheck error（`batch.post.test.ts:2` 缺 `afterEach` import + 6 处 `err.data?.code/field/resource` 属性访问 TS2339）→ 针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 `afterEach` import + `afterEach` 测试隔离兜底模式）→ Round 2 standard Pass |
| **A 阶段 standard depth Pass × 2** | `98fd47d` + `a1c7c4e` | `pnpm --filter @dependfix/platform typecheck` 0 error（实测！audit Reject 前宣称 typecheck Done 是错的——nuxt typecheck 不实测不能信 Done 输出——M17 session 关键教训）+ `lint` 0 error + `vitest` 859 passed + 4 skipped；A 阶段 standard depth 2 轮（commit 1 Pass / commit 2 Reject 后补修 Pass） |

#### M17.5 T1705 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/` ✅（2026-08-28 闭环 / 拆 2 commits）

> 本子阶段按"重构独立 commit + lint auto-fix 独立 chore commit"模式，**总 4 文件拆 2 commits**：commit 1（`466b142`）helper 抽取 + 3 e2e 文件 import 切换 / commit 2（`fc0b175`）用户明确指令"接受 lint auto-fix"独立 chore commit。

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **commit 1：`authedCookieHeader` 抽取 helper** | `466b142`（refactor(e2e)） | `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts` 新建（沿用 `hydration.helper.ts` 极简风格 10 行）+ `apps/platform/tests/e2e/{api-i18n,credentials-crud,repos-crud}.e2e.test.ts` 3 e2e 文件删本地一字不差的 `authedCookieHeader` 函数 + 改 import；JSDoc 注释聚合 3 文件原始注释；零行为变更（rg 字节级比对实证）；4 文件 / +19/-19 行 |
| **commit 2：lint auto-fix 接受策略（chore）** | `fc0b175`（chore(platform)） | `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts:1` ESLint array-type 自动修复接受；按用户指令"应该检查并提交修复"独立 chore commit（不混入 M17.5 主逻辑 commit；历史 commit `64bc1a5` 曾因误带 docs 提交回滚，本次按用户指令反向处理） |
| **A 阶段 quick depth Pass × 2** | `466b142` + `fc0b175` | `@dependfix/platform exec playwright test` 全过；A 阶段 quick depth Pass × 2（实测 169 秒 ≤ 5 分钟时间盒；0 blocker） |

#### M17.6 T1706 S-4 better-auth admin viewer 403 矩阵补强 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **5 端点 viewer 403 单测补强** | `56df374`（test(e2e)） | `apps/platform/tests/e2e/admin-roles-extra.e2e.test.ts` 新建（沿用 M16.5 admin-roles.e2e.test.ts 模式 + `vi.hoisted` + `mockImplementationOnce`）；覆盖 `ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点 viewer 403 矩阵；锁定 better-auth admin 当前版本 role 行为，防升级回归；1 文件 / +98 行 |
| **A 阶段 quick depth Pass** | `56df374`（含收口） | A 阶段 quick depth Pass（实测 119 秒 ≤ 5 分钟时间盒；0 blocker / 0 warning / 2 suggest 登记 backlog：S-1 `update-user` 端点 viewer 403 矩阵延后到 viewer 403 矩阵稳定后追加 + S-2 admin 200 双向断言延后） |

#### M17 session 收尾治理 commit ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **6 子阶段闭环状态登记 + 8 条经验教训沉淀** | `9bdb2dc`（chore(plan+standards)） | `docs/plan/todo.md` L5 banner 切换 + 6 子阶段标题加 ✅ commit 标记；`docs/plan/roadmap.md` L316 当前阶段指针更新；`docs/plan/backlog.md` 8 处旧锚点 hash 修复 + L265 artifacts/ 链接描述化（artifacts/ 在 .gitignore 中不入仓库）；`docs/standards/testing.md` §6 新增 2 条 pattern（测试隔离 afterEach 模式 + test helper 强契约类型契约）；`docs/standards/git.md` §3.5 新增"lint auto-fix 接受策略"段；`docs/standards/ai-collaboration.md` §1.4 commit 拆分增加"依赖关系处理"子节 + §4.4 增加"nuxt typecheck 输出 Done ≠ TS 0 error"实测纪律 + §4.6 增加"audit suggest 跨 batch 累积跟踪 + audit Reject 后针对性补修"2 条 pattern；`.github/agents/code-auditor.agent.md`「证据获取与审查深度」段增加"typecheck 必须实测（不能信执行方 Done 输出）"子节 |

### 阶段验收标准（M17 全部 6 子阶段闭环 ✅）

- [x] **M17.1 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径** —— service 改读 `useRuntimeConfig().encryptionKey` + nuxt.config 移除 inline fallback + playwright 兜底删除 + docker-compose / .env.example 同步更新；21 个调用方测试从 ReferenceError 修复后 853 passed
- [x] **M17.2 credentials 服务端 API i18n** —— throw 改造使用 `createLocalizedError`（沿用 M16.3 C36 模式）+ message 按请求 locale 返回 + 既有测试调整 + 1 case 验证 locale 切换
- [x] **M17.3 schedules 服务端 API i18n** —— 同 M17.2 模式（沿用 `createLocalizedError`）
- [x] **M17.4 batch-runs + repos batch 服务端 API i18n** —— 同 M17.2 模式；总 13 文件拆 2 commits（commit 1 字典 + helper + API throw 改造 9 文件 / commit 2 既有测试 message→code 断言调整 4 文件）；commit 2 audit Reject 7 个 typecheck error 后针对性补修闭环（`api-helper.ts:32` 返回类型放宽 `Record<string, any>` + `batch.post.test.ts:2` 加 afterEach import + `afterEach` 测试隔离兜底模式）
- [x] **M17.5 S-2 `authedCookieHeader` 抽取** —— 3 e2e 文件一字不差的 `authedCookieHeader` 函数抽取至 `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts`；零行为变更（rg 字节级比对实证）；e2e 全绿
- [x] **M17.6 S-4 better-auth admin viewer 403 矩阵补强** —— 补 5 端点 viewer 403 单测；锁定 better-auth admin 当前版本 role 行为，防升级回归
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error
- [x] vitest 单测覆盖 + playwright e2e 覆盖 —— vitest 859 passed + 4 skipped（baseline 853 + M17.4 commit 2 测试调整 + M17.6 单测补强）
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] CI 端到端裁决通过 —— 6 轮独立 Review Gate Pass（M17.1 standard / M17.2 quick / M17.3 quick / M17.4 standard 2 轮含 1 次 Reject 后补修 / M17.5 quick 2 轮 / M17.6 quick）+ CI run 端到端验证通过

### 阶段治理记录（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 + session 收尾）

- **总投入**：9 commits（M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾治理 1）；含 M17.4 commit 2 audit standard depth Reject 1 次后针对性补修闭环（nuxt typecheck 不实测不能信 Done 输出）+ M17.5 lint-fix 独立 chore commit
- **测试覆盖**：vitest 859 passed + 4 skipped（baseline 853 + M17.4 commit 2 测试调整 0 新增 + M17.6 单测补强）；playwright e2e 新增 M17.5 0 case（纯重构）+ M17.6 viewer 403 矩阵 1 file
- **审计覆盖**：M17.1 standard（实测 ≈ 8 分钟）/ M17.2 quick（实测 187 秒）/ M17.3 quick（实测 314 秒略超 5 分钟时间盒）/ M17.4 standard × 2（commit 1 实测 ≈ 8 分钟 + commit 2 Reject 实测 ≈ 7 分钟 + commit 2 Reject 后补修 quick Pass 实测 ≈ 4 分钟）/ M17.5 quick × 2（实测 169 秒）/ M17.6 quick（实测 119 秒）+ session 收尾 quick（实测 184 秒）—— 6 commits × 8 次 audit（含 1 次 Reject 后补修闭环）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 当前值为 0（ahead=0 已全部推送至 origin/master——M17 全部 9 commits 落地后由用户主动推送；session 文件 `ahead=8` 描述为 stale 已在本批次归档时校正）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M17 段（本段）
  - `docs/plan/todo.md` 顶部 banner 切换 + §M17 任务清单 + §M17 拆分依据与实施路径 整段迁移至 [todo-archive.md §M17](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档) + 文档位置速查表更新（主窗口保留 6 个阶段）
  - `docs/plan/roadmap.md` M17 详细实施状态段 + Milestone 概述表 M17 行状态更新（已完成 2026-08-28 归档）+ 当前阶段任务指针更新（ahead=0 已全部推送）
  - `docs/plan/backlog.md` 顶部"2026-08-28 闭环整理（M17 归档批次）"段新增 + §服务端凭据加密路径 C38 / §测试基础设施清理 S-2 / §测试覆盖补强 S-4 三段"已上收 M17.x"按 backlog 维护规则 5 短期候选正式上收后从 backlog 主条目迁出（保留 [§M17 启动批次](#) 历史归档指针段描述）+ 历史归档指针段 4 条目描述更新（已闭环于 M17.x 归档批次，归档至 todo-archive.md §M17）
  - `docs/plan/archive/index.md` §4 当前基线更新（M17 归档后）+ §5 近期归档批次登记新增 M17 行
  - `docs/standards/development.md` §3 注释规范（编号标记扫描硬要求持续生效）
  - `docs/standards/testing.md` §6 末尾新增 2 条 pattern（测试隔离 afterEach 模式 + test helper 强契约类型契约）
  - `docs/standards/git.md` §3.5 新增"lint auto-fix 接受策略"段
  - `docs/standards/ai-collaboration.md` §1.4 commit 拆分增加"依赖关系处理"子节 + §4.4 增加"nuxt typecheck 输出 Done ≠ TS 0 error"实测纪律 + §4.6 增加"audit suggest 跨 batch 累积跟踪 + audit Reject 后针对性补修"2 条 pattern
  - `.github/agents/code-auditor.agent.md`「证据获取与审查深度」段增加"typecheck 必须实测（不能信执行方 Done 输出）"子节

### 关键决策（M17.1+M17.2-4+M17.5+M17.6）

**M17.1：**

- **服务路径单一权威来源 `useRuntimeConfig().encryptionKey`**：M16.5 audit W-1 根因 = `credential.service.ts:73-76` 直读 `process.env.ENCRYPTION_KEY` 与 `nuxt.config.ts:61` runtimeConfig `encryptionKey` 错配，典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；统一改为 service 走 runtimeConfig（Nuxt 标准部署习惯）+ nuxt.config 移除 inline fallback（避免双入口漂移）+ playwright 临时兜底删除（避免 e2e 测试环境与生产漂移）
- **保留 L30 `NUXT_ENCRYPTION_KEY=...` + 删除 L34 `ENCRYPTION_KEY=...`**（关键澄清）：两条 env line 是独立配置项——L30 标准 NUXT_ 前缀部署凭据是 e2e 测试环境唯一需要的（service 改读 runtimeConfig 后 L30 即可满足 e2e 加密需求）；L34 无 NUXT_ 前缀是 M16.5 临时兜底（service 直读 env 兜底，service 改读 runtimeConfig 后 L34 不再需要）

**M17.2-4：**

- **i18n 改造模式严格沿用 M16.3 `createLocalizedError`**：0 新设计成本——M16.3 audit suggest 范围外扩展（`/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`）10 文件抛错本地化全部沿用既有 helper + 字典 + codeSet 测试同步模式
- **避开"4 端口合 1 批"反模式（M17.4 拆 2 commits 实证）**：M17.4 总 13 文件（5 API throw + 4 测试 + 字典 + helper + codeSet）按"基础设施层（字典 + helper） + 业务 throw 改造（5 API）+ 测试调整（4 case）"拆 3 段，commit 1 字典 + helper + API throw 改造 9 文件（独立可测——codeSet 测试通过）；commit 2 既有测试 message→code 断言调整 4 文件（依赖 commit 1 新 code——commit 2 时 typecheck / test 必须实测确认 commit 1 已落地）
- **`ServerErrorCode` 字母序跨 M17.2/M17.3/M17.4 多次延后登记 backlog（S-1）**：audit suggest 顺手处理原则 vs 跨 batch 累积跟踪原则取舍——字母序整理属 audit suggest 顺手处理范畴但跨多 batch 多次延后不利于稳定追踪，本次按 [规划规范 §4.4 大批量归档批次操作规范](../../docs/standards/planning.md#44-大批量归档批次操作规范) audit suggest 跨 batch 累积跟踪原则登记 backlog，下批次合并处理

**M17.4 commit 2 audit Reject：**

- **nuxt typecheck 输出 "Done" ≠ TS 0 error（M17 session 关键教训）**：nuxt typecheck 走 `vue-tsc` pipeline 在某些情况下容忍 TS error（如 `Record<string, unknown>` 索引访问得到 `{}` 时不报错；strict 模式下访问 `err.data?.code` 仍会 TS2339 但 build 不阻断）。执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error。M17.4 commit 2 audit Reject 实测 7 个 TS2304 + TS2339 error（`batch.post.test.ts:2` 缺 `afterEach` import + 6 处 `err.data?.code/field/resource` 属性访问失败）此前未触发实测；Reject 后针对性补修闭环（api-helper.ts 返回类型放宽 `Record<string, any>` + batch.post.test.ts 加 afterEach import）→ 重跑 typecheck 0 error + test 859 passed → 重新 commit 通过。F 阶段验证必须实测 typecheck 0 error，不能仅看 "Done" 输出
- **audit Reject 后针对性补修 + 重验证三件套**：audit Reject 后必须针对性补修 blocker + 重验证 typecheck + lint + test 三件套确认 0 error 才能重新 commit；不回退到全量重试模式（PDTFC+ 修复工作流"不回退到全量重试模式"）

**M17.5：**

- **重构 vs 实现优先 reverse pattern**：S-2 `authedCookieHeader` 抽取是 M16.5 audit suggest 的"M16.3 / M16.5 三批次遗留重复"——按"先实现再看是否需要抽取"在 audit suggest 触发后采纳，与 M14.x `test 名孤立编号清理` 同模式（audit suggest 触发顺手处理）
- **JSDoc 注释聚合 3 文件原始注释**：避免抽取 helper 后丢失历史注释上下文（虽然 `authedCookieHeader` 函数定义完全一致，但每文件原始注释略有差异——聚合到 helper 顶部 JSDoc 注释保留信息密度）
- **零行为变更 + rg 字节级比对实证**：3 文件 4 处函数定义全文拷贝到 helper 后，3 文件原文逐字节删除——rg 实证 3 文件无残留 `authedCookieHeader` 定义 + e2e 测试全过
- **lint auto-fix 接受策略（独立 chore commit）**：用户指令"应该检查并提交修复"接受 + 独立 chore commit（不混入 M17.5 主逻辑 commit）；与历史 commit `64bc1a5` 曾因误带 docs 提交回滚形成对比——本次按用户指令反向处理（用户明确指令接受 vs 既有"慎带 docs"约束）

**M17.6：**

- **vitest 风格 + playwright 真实 better-auth 端点（不 mock better-auth 库内部逻辑）**：mock better-auth 库内部逻辑后测的不是 better-auth 真实行为，违反"防升级回归"目的——viewer 403 矩阵测的是 better-auth admin 端点角色检查行为，应真实调用 better-auth admin API 断言 viewer 拒绝
- **`vi.hoisted` + `mockImplementationOnce` 模式统一 mock**：M16.5 D 阶段实施的三角色 vi.hoisted 模式在本批次复用——`vi.hoisted` 解 vi.mock factory hoist 问题；`mockImplementationOnce` 单次切换不影响其他 case
- **5 端点 viewer 403 矩阵 + 锁定 better-auth admin 当前版本 role 行为**：防升级回归——better-auth 1.x 升级若行为变化立即触发 viewer 403 矩阵失败；锁定测试是 baseline 而非阻塞（实际升级后矩阵失败则触发迁移评估）

### 阶段关键经验（已沉淀至项目知识库）

- **测试隔离 afterEach 模式（describe 块 cleanup 兜底）**：[testing.md §6 末尾 L87](../../docs/standards/testing.md)（描述：describe 块 cleanup 应统一用 `afterEach` 兜底——vitest 钩子）——而非 it case 末尾手动 cleanup 块——后者在 `expectError` 抛错 / 异常分支时易跳过导致污染后续测试。M17.4 commit 1 后 `repos/batch.post.test.ts:165` 实测：手动 cleanup（L183-187）不在 try/finally，L181 抛错后 cleanup 跳过，L190 后续测试读到外组织凭据导致 `RESOURCE_NOT_IN_ORG` 误抛（audit suggest #2 即源自此）
- **test helper 强契约类型契约**：[testing.md §6 末尾 L88](../../docs/standards/testing.md)（描述：test helper 返回类型应反映测试断言模式）——message 断言可用 `Record<string, unknown>`；code/data 强契约断言需放宽为 `Record<string, any>` 或引入泛型。M17.4 commit 2 实测：`apps/platform/tests/api-helper.ts:32` `expectError` 返回 `Record<string, unknown>` 在 strict 模式下导致 6 处 `err.data?.code` 访问 TS2339
- **lint auto-fix 接受策略**：[git.md §3.5](../../docs/standards/git.md)（描述：lint auto-fix 接受决策需区分"lint 误报（应登记 backlog）"vs"lint 正确（应接受修复）"）——接受修复时按用户指令独立 chore commit（不混入主逻辑 commit）；M17.5 `fc0b175` 实证 + 历史 commit `64bc1a5` 因误带 docs 提交回滚形成对比
- **commit 拆分依赖关系处理**：[ai-collaboration.md §1.4](../../docs/standards/ai-collaboration.md)（描述：拆分后确保 commit 1 独立可测——基础设施层如字典 + helper 同步落地，codeSet 测试覆盖新 code）——commit 2 业务 throw 改造依赖 commit 1（引用新 code）；commit 3 测试调整依赖 commit 2（验证 throw 改造行为）。任何 commit 不可被独立运行验证即拆分错位。M17.4 总 13 文件拆 2 commits 实证
- **nuxt typecheck 输出 "Done" ≠ TS 0 error**：[ai-collaboration.md §4.4](../../docs/standards/ai-collaboration.md)（hard requirement 新增：nuxt typecheck 走 `vue-tsc` pipeline 在某些情况下容忍 TS error）——执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error。M17.4 commit 2 audit Reject 实测 7 个 TS2304 + TS2339 error 此前未触发实测；F 阶段验证必须实测 typecheck 0 error，不能仅看 "Done" 输出
- **audit suggest 跨 batch 累积跟踪**：[ai-collaboration.md §4.6](../../docs/standards/ai-collaboration.md)（pattern 新增：suggest 跨多个 commit 延后处理时必须在每个 commit message 中显式登记 backlog 跟踪项，便于后续追踪 + 跨 session 蒸馏累积）——统一 backlog 跟踪条目（如 audit suggest #2 累积跟踪）优于单次登记——后者容易在多次 commit 中重复登记或遗漏
- **audit Reject 后针对性补修 + 重验证三件套**：[ai-collaboration.md §4.6](../../docs/standards/ai-collaboration.md)（pattern 新增：audit Reject 后必须针对性补修 blocker + 重验证 typecheck + lint + test 三件套确认 0 error 才能重新 commit；不回退到全量重试模式——PDTFC+ 修复工作流"不回退到全量重试模式"）——M17.4 commit 2 audit Reject 后实测：补修 2 个 blocker → 重跑 typecheck 0 error + test 859 passed → 重新 commit 通过
- **typecheck 必须实测（不能信执行方 Done 输出）**：[code-auditor.agent.md 「证据获取与审查深度」段](../../.github/agents/code-auditor.agent.md) 子节新增——A 阶段 audit 必须实测 typecheck 输出 0 error（不依赖执行方"typecheck Done"宣称）；nuxt typecheck 容忍部分 TS error 但 build 仍阻断；F 阶段本地验证"完整验证"必须含实测 typecheck 0 error 声明

### 待迁移经验（next neat-freak 候选）

- **C39 standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步**（M17.1 audit W-1 登记）—— 当前状态：M17.1 实施后 `process.env.ENCRYPTION_KEY` 不再被代码读取（credential.service.ts:78 改读 `useRuntimeConfig().encryptionKey`，单源在 nuxt.config.ts:61 读 `NUXT_ENCRYPTION_KEY`）；但权威规范层仍有 8 处仍用旧 env 名 `ENCRYPTION_KEY`（docs/standards/platform.md:150 + :240 + docs/standards/security.md:83/:123/:131/:132/:138/:145）；修复方向：8 处全部 `ENCRYPTION_KEY` → `NUXT_ENCRYPTION_KEY`（platform.md §5 + §10 + security.md §5.5/§5.2/§5.3 联动更新）；可与 C34 存量规范挂接盘点同批次治理；优先级：P3（不阻塞 M17.1 合并，但强烈建议下批次闭环，避免重新引入运维误配 500）
- **S-5 调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理**（M17.1 audit W-2 登记）—— 当前状态：6 处调用方测试仍写 `process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'`（`apps/platform/server/services/scan-orchestrator.test.ts:115,120,128` + `apps/platform/server/api/credentials/index.test.ts:28,33,71,73` + `apps/platform/server/api/credentials/[id].test.ts:28,39,92-94` + `apps/platform/server/api/repos/importable.get.test.ts:80,91` + `apps/platform/server/api/repos/batch.post.test.ts:31,36`）；service 不再读 `process.env.ENCRYPTION_KEY`，实际密钥来自 `tests/setup-nuxt-server.ts:26` 全局 stub `useRuntimeConfig = () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' })`；调用方测试之所以还能通过，纯属两边恰好都用同一字符串 `'test-encryption-key-32-bytes!!'` 的偶然一致性；修复方向：① 短期 — 5 文件删除 `process.env.ENCRYPTION_KEY` 赋值/清理对，改为显式 `vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!' }))` 或统一 helper；② 长期 — 抽 `setTestEncryptionKey(key)` helper（与 `setupMemoryDatabase` 同模式），与 M17.5 S-2 `authedCookieHeader` 抽取同源策略；优先级：P3（建议与 M17.5 同批次合并实施）
- **C34 存量规范严格约束挂接盘点**（backlog 候选；建议与 C39 联动）—— 审查现有 `docs/standards/*.md` 中"必须级"条款是否已在 code-quality-checklist.md / code-reviewer skill 双层对称挂接；现状：部分已挂接 development/testing/security/git/ai-collaboration，部分仅 standards 有 platform.md §7.1/§7.2；触发：下次 neat-freak 批次统一盘点
- **S-1 `SCAN_PENDING_MERGED` 死代码**（M16.3 audit suggest 延后）—— 当前在字典 + 联合类型 + 测试数据中定义但无 throw 消费（`scan.post.ts:95` 仍写死 `'duplicate_scan'` 与字面中文 message）—— 移除或与前端 ScanRun 错误处理对齐另立独立 code
- **S-2 `detectServerLocale` 缺 `?locale=` URL query 支持**（M16.3 audit suggest 延后）—— 与 `localeDetector.ts:15` 现有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **S-3 `update-user` 端点 viewer 403 矩阵**（M17.6 audit suggest 延后）—— M17.6 S-4 实施时排除 `update-user`（与 M16.5 auth-self-guard 5 端点重叠）；下次 viewer 403 矩阵稳定后追加
- **S-4 admin 200 双向断言**（M17.6 audit suggest 延后）—— 与 viewer 403 双向断言；延后到 viewer 403 矩阵稳定后追加

---

## M16: 平台可用性深化（M16.1+M16.2+M16.3+M16.4+M16.5 全部已闭环 / 2026-08-28 归档）

> **归档日期**：2026-08-28
> **阶段摘要**：把 `apps/platform` 从 demo 落地为实际可用项目，覆盖 5 项 UI/API/技术债痛点——M16.1 UX-R3 `/scans` 独立页面（含 `/api/runs` 组织隔离）/ M16.2 C66-D alerts "立即修复此仓库" 入口（reuseScanRunId）/ M16.3 C36 服务端 API 错误消息 i18n（h3 createError + locale 检测 + serverErrors 字典）/ M16.4 PrimeVue hydration 主线 #1 缓解（alerts 迁移 useAsyncData）/ M16.5 T701-e2e 管理端点集成测试补强（三角色鉴权 + 自修改防御 + 3 e2e 闭环）。5 子任务均 D 阶段已实施 + A 阶段 standard depth Pass + 6+ atomic commits。
> **阶段边界**：M16 严格遵循 [规划规范 §1.1 任务粒度约束](../../docs/standards/planning.md)（≤5-6 项硬上限）+ UX-R3 仅占 M16.1 一项；M15 阶段既有的 RunDetailDialog 与 utility + M14.2 `/api/runs` 分页契约 + M13.2 应用层去重 + M13.4 T1403 dedupe 默认全部复用。
> **非目标**：不引入多组织；不重写后端聚合；不动 `dashboard.vue` latestRun 卡片；不动 `batch-runs` 跨仓库视图；不升级 PrimeVue 5；不破坏既有 `alerts-rowgroup` / `history-dialog` / 视图切换 / dedupe 行为。
> **状态**：✅ 全部完成（M16.1 + M16.2 + M16.3 + M16.4 + M16.5 全部 5 子任务闭环 / 5 轮独立 Review Gate Pass；19 commits 已全部推送至 origin/master，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测；CI run #33068271005 Coverage job 触发 80% 阈值失败，已通过 M16 新代码补测批次恢复至 80.27%）

### 阶段闭环清单

#### M16.1 UX-R3 `/scans` 独立页面 + RepoHistoryDialog 迁移 ✅（2026-08-27 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **UX-R3 后端 organizationId 隔离 + summary API** | `b8e54a6`（后端 + summary 单测） + 同 P 阶段 docs commit | `/api/runs` 加 `where.repository.organizationId` 过滤（默认取自 session）；新增 `/api/scan-history/summary.get.ts`（byStatus/totals/repositories/window/filtered 五字段）；单测 +6 case（隔离 + 默认 + 边界 + summary 五字段） |
| **UX-R3 前端 `apps/platform/app/pages/scans.vue` + i18n 双语** | `b8e54a6`（前端 + i18n） + 同 P 阶段 docs commit | 新增独立 `/scans` 页面（4 块汇总卡片 + byRepo DataTable + 全运行分页 DataTable + 仓库过滤面包屑）；layout "扫描"菜单项（viewer 可见）；repos.vue pi-history 跳转改 `/scans?repository=`；i18n 双语新增 `scans` 段（37/37 键对称） |
| **UX-R3 RepoHistoryDialog 改造 + e2e 迁移** | `b8e54a6`（RepoHistoryDialog） + `db1f64b`（e2e） | RepoHistoryDialog 新增 `queryKey` prop（'history' \| 'run' 默认 'history'）支持 M16.1 + 兼容性兜底；`history-dialog.e2e.test.ts` 删除并迁移至新建 `scans.e2e.test.ts`（避免 `/repos?history=` 路径成为孤儿）；e2e +5 case（3 query 组合 + viewer × 2） |
| **A 阶段标准 Pass 收口** | `f9cb1da` | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 743 passed + 4 skipped（新增 10 case：runs organizationId 隔离 1 + summary 6 + 既有 e2e 迁移 3） + `e2e` 74 passed + 2 skipped + `build` 成功 + i18n JSON.parse 双语对称 542 键；A 阶段 standard depth Pass（warning 7 项 + suggest 4 项已分级 backlog） |
| **M16.1 后续补测批次** | `acfdc8d8` | CI run #33068271005 Coverage job 失败（branches 79.93% < 80% 阈值）→ 根因为 M16.1 新代码（`summary.get.ts` 81.8% branches + 缺 `apps/platform/app/utils/alerts-view.ts` 配套测试）+ M16.2 新代码（`scan.post.ts` / `runs/index.get.ts` 防御分支未覆盖）累计效应。`runBranchCleanupForRepo` 之外的 M16 新文件测试已补齐（`alerts-view.test.ts` 100% + `summary.get.test.ts` 88.9% + `runs/index.get.test.ts` 100% + `scan.post.test.ts` 96.9%），整体 branches 80.27% / statements 84.91% 通过 80% 阈值 |

#### M16.2 C66-D alerts "立即修复此仓库" 入口 + `reuseScanRunId` ✅（2026-08-27 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **后端 `scanRequestSchema` + `ScanRunOptions.reuse`** | `d656dc3`（后端 + orchestrator） | `/api/repos/[id]/scan.post.ts` 新增 `reuseScanRunId?: string`；handler 三态校验（404/400/409）；`ScanRunOptions.reuse?: boolean` 区分 queue-mode continuation 与 user-reuse；orchestrator 在 reuse=true 时绕过终态校验并 reset finishedAt / errorJson / summaryJson / runUrl + 更新 mode / severityThreshold / executorKind + 清空 ScanResult 子表避免 JOIN 数据不一致；scan-worker 透传 reuse 参数支持 async 队列路径同步语义 |
| **前端 alerts.vue "立即修复此仓库" 按钮 + utility 抽取 + composable** | `ccfa33c`（前端 + utility） + `5a3b31a`（composable + sidebar） | alerts.vue 受影响运行 DataTable 加 "立即修复此仓库" 按钮（`report-only` 模式才显示 + 存在 `affectedRunIds[0]` 时启用）；`AlertRunSidebar.vue` 组件抽取（解 alerts.vue > 800 行 lint warning）；新增 `composables/use-fix-now.ts` 一键修复状态机（fixingRunId / fixError / fixSuccess）；新增 `utils/alerts-view.ts` 抽取 alertsSeverityTagSeverity / alertsRuleIdTagSeverity / alertsRunStatusSeverity / alertsFixStatusLabel；i18n 双语新增 `alerts.fixNow.{action,success,failed}` |
| **单测 + e2e + 收口** | `5e9c3c1`（单测 + e2e） + `8675608`（收口 + kebab-case rename refactor） | 单测 +7 case（scan.post reuse sync/async/404/400/409/pendingScanRun 回归 + orchestrator reuse=true 真实集成）；e2e +3 case（reuse 调用验证 / fix 模式不展示按钮 / 4xx 错误处理）；A 阶段 2 轮 Pass（RG-B1 终态校验契约冲突修复：ScanRunOptions reuse 区分 queue-mode continuation / user-reuse + reset summaryJson 等字段 + 清空 ScanResult 子表；RG-B2 真实集成测试补强；warning 4 项 + RG-W3 ScanResult cleanup 全部修复） |
| **M16.2 后续补测** | `acfdc8d8`（同 M16.1 补测 commit） | `scan.post.test.ts` 增 `queue.add 抛"已处于终态"→409` 与 `缺 id→400` 两个边界用例（`runs/index.get.test.ts` 与 `verification-gate.test.ts` 同批补测），整体覆盖率恢复至 80.27%；i18n JSON.parse 双语对称 545 键；`build` 成功；vitest 750 passed + 4 skipped（新增 7 case 累计）/ e2e 77 passed + 2 skipped（新增 3 case 累计） |

#### M16.3 C36 服务端 API 错误消息 i18n ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **helper 引入 + 单测 + locales 双语字典** | `a573df3`（helper + 单测 + locales） | `apps/platform/server/utils/localized-error.ts` 新增 `createLocalizedError(event, { statusCode, code, params?, data? })` + `detectServerLocale`（优先级 `cookie(i18n_locale) > Accept-Language > 默认 zh-CN`，防御性降级 `event.node?.req?.headers` 缺失）；`params` 模板插值接口预留；i18n locales/en-US.json + zh-CN.json 新增 `serverErrors` 段（16 code × zh-CN/en 双语完整对称 + 顶层段 15/15）；helper 24 case 单测（locale 检测 / 字典 / 兜底 / 双语 / locales 契约） |
| **guard.ts + repos 系列 throw 改造** | `b604f79`（guard + repos） | guard.ts 串接共享错误（401/403/403，`/api/alerts` `/api/scan-history/summary` 借此自动覆盖）；`/api/repos` 系列 14 处 throw 改造（统一本地化入口）；repos/index.get.ts 增强 zod validation 1 case |
| **runs 系列 throw 改造 + ScanRun.errorJson 不本地化决策** | `e9c406e`（runs） | `/api/runs` 系列 3 处 throw 改造；`repos/[id]/scan.post.ts` 是 M16.2 刚改过的文件再动，本地化 7 处 throw 行为不变；`scan.post.ts:95` 的 `ScanRun.errorJson.message` 是 **type=Error 业务字段**（前端从 ScanRun 读取时按前端 i18n 翻译），按 C36 验收"不影响 type=Error"约束**不**本地化 |
| **e2e + 收口** | `ace07a8`（e2e + 收口） | 新增 `tests/e2e/api-i18n.e2e.test.ts` 7 case 全过（Accept-Language: zh-CN / en-US + cookie 优先级 + 未知 locale 兜底 + 404/405 双语对称 + zod validation data.issues 透传）；A 阶段 standard depth Pass（实际用时 4.3 分钟 / 0 blocker / 0 warning / 2 suggest 已登记 backlog） |
| **M16.3 验收** | - | `pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 805 passed + 4 skipped（新增 31 case：helper 24 + repos/index 验证 zod issues 透传 1 + 既有 e2e 迁移 6） + `e2e` 84 passed + 2 skipped（新增 7 case） + `build` 成功（38.2 MB total） + branches coverage 85.35%（远超 80% 阈值） + locales JSON.parse 顶层段 15/15 + serverErrors 16 code 双语完整 |

#### M16.4 PrimeVue hydration 主线 #1 缓解：alerts 加载迁移 useAsyncData ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **根因分析 + useAsyncData 迁移 + utility 抽取** | `96c8446`（utility 抽取） + `21b2267`（alerts 迁移） | 根因：PrimeVue 4 DataTable rowGroup subheader 在 hydration 后未重新计算 processedData（onMounted 异步赋值时 data.value=[] → mutation 时 PrimeVue 不响应），SSR HTML 已含数据但 PrimeVue JS 渲染依赖响应式 source data；alerts.vue 迁移到 `useAsyncData(key, handler, { watch: [viewMode, filters], default })` + `useRequestFetch()`（Nuxt 4 官方 SSR cookie 转发方案，避免 `$fetch` 在 SSR 不转发 cookie 致 auth middleware 401）；`repositories` / `alerts` 改 computed 派生（`useAsyncData data ?? []` + `withFixStatusRank`/`withSeverityRank` 后处理保留 M15 utility 复用）；`loading`/`error` 派生自 useAsyncData `pending`/`error`；`onMounted(fetchRepositories + fetchAlerts)` 全删；watch 自动 refetch 替代原 3 处手动 `fetchAlerts()` 调用（`onViewModeChange` 删 `void fetchAlerts()` 保留 multiSortMeta + expandedPackages 重置；`onDedupeChange` 整个函数删除；filterApply Button `@click` 改 `refreshAlerts()`）；utility 抽取：apps/platform/app/utils/alerts-view.ts 新增 `buildAlertsQuery(viewMode, filters)` + `AlertsViewMode` / `AlertsFilters` 类型导出 + 9 case 单测 |
| **类型适配 + Button @click 包裹形式** | `21b2267`（含类型适配） | useRequestFetch 调用点显式 generic 标注规避 TS 5.x $fetch overload 路径推断栈深度限制（Nuxt 4 已知问题）；refreshAlerts 类型不兼容 PrimeVue Button @click PointerEvent 用 `() => { void refreshAlerts() }` 包裹（codebase 同类 pattern 多处存在） |
| **e2e fixme 全取消 + SSR 锁定 test** | `039a987`（e2e） | `tests/e2e/alerts-rowgroup.e2e.test.ts` **2 fixme 全取消**（行 132 DataTable rowGroup + 行 145 subheader 折叠展开）；新增 SSR 锁定 test（行 70-98：hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成，反向锁定未来不回退 onMounted 异步赋值模式）；PrimeVue 4.5.5 toggle icon 改用 SVG path 旋转实现（行 162-168 断言展开/折叠路径不一致） |
| **收口 + docs 同步** | `01dc7cd`（收口 + docs） | A 阶段 standard depth Pass（实际用时 8-10 分钟 / 0 blocker / 0 warning / 2 suggest 已登记：`S-1` todo.md 状态 banner 同步本段补 + `S-2` Button @click 包裹形式属成熟约定无需新抽象）；`pnpm --filter @dependfix/platform typecheck` 0 error + `lint` 0 error + `vitest` 814 passed + 4 skipped（新增 9 case：alerts-view `buildAlertsQuery` 全分支覆盖） + `e2e alerts-rowgroup` 10 passed + 0 skipped（M16.3 baseline 7 passed + 2 skipped → M16.4 10 passed + 0 skipped） + `e2e alerts-fix-now + alerts-sidebar` 5/5 passed（M15/M16.2 utility 复用不破） + `build` 成功（38.3 MB total） + branches coverage 85.44%（远超 80% 阈值） |

#### M16.5 T701-e2e 管理端点集成测试补强 ✅（2026-08-28 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **auth-self-guard 5 端点 × 自修改防御矩阵单测** | `3072587`（auth-self-guard 单测） | `apps/platform/server/middleware/auth-self-guard.test.ts` 新增 23 case 覆盖 5 better-auth admin 端点（set-role / ban-user / remove-user / impersonate-user / update-user）× {self-target 403 / non-self last-admin 403 / non-self multi-admin 200} 矩阵 + 快速过滤 + no session + body 防御 + target 不存在；共用 `vi.hoisted` 创建 `mockRequireAuth / mockRequireRole / mockRequireOrgResource`，默认 mock 通过 admin，三角色 case 用 `mockImplementationOnce` 切换 |
| **repos / credentials 三角色鉴权单测** | `6889a74`（三角色鉴权单测） | `server/api/{repos,credentials}/{index,[id]}.test.ts` 各增三角色鉴权 describe 块（共 16 case）：viewer GET 通过 / write 403 / admin + org_admin 全通过 / 未登录 401 |
| **三 e2e 闭环（admin / credentials / repos）** | `a6b2b27`（e2e） | `tests/e2e/admin-roles.e2e.test.ts` 3 case：admin 访问 /users 正常 / viewer 重定向到 /dashboard / viewer 调 admin API 403；`tests/e2e/credentials-crud.e2e.test.ts` 6 case：列表脱敏验证（token 不在 DOM + hasToken Tag）/ 创建 / 编辑（token 留空不修改）/ 删除 / 列表分页 / viewer 拒绝；`tests/e2e/repos-crud.e2e.test.ts` 7 case：列表 / 创建 / 编辑 / 删除 / 列表分页 / viewer POST 403 / viewer 访问列表页 |
| **顺手修复 playwright e2eServerEnv ENCRYPTION_KEY 兜底** | `7c28ac8`（playwright 兜底） | `playwright.config.ts:34` 加 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` e2eServerEnv 项——根因 `credential.service.ts:73-76` `getEncryptionKey` 直接读 `process.env.ENCRYPTION_KEY`（不走 runtimeConfig），与 `nuxt.config.ts:61` runtimeConfig `encryptionKey` 错配；已登记 backlog C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（M16.6+ 候选；2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)） |
| **收口 + docs 同步** | `31bed27`（收口 + docs） + `5064fa6`（backlog 登记） | 测试基础设施：`tests/setup-nuxt-server.ts` 加 `getRequestURL` 注入 globalThis（middleware 测试需要）；viewer storageState 复用：`global-setup.ts` 已注册 viewer → `tests/e2e/.auth/viewer.json`，3 个 e2e 用 `browser.newContext({ storageState })` 隔离 context + `__Secure-` cookie 在 HTTP webServer 下手工拼接；e2e DOM 适配：PrimeVue Password id 透传到外层 div（选择器 `div#token input`）/ repos.vue owner-name 两列独立渲染无 `/` 拼接 / DataTable 0 数据不渲染 paginator；A 阶段 standard depth Pass（实际用时 2 分 14 秒 / 0 blocker / 2 warning / 4 suggest 已登记 backlog） |

### 阶段验收标准（M16.1 + M16.2 + M16.3 + M16.4 + M16.5 全部闭环 ✅）

- [x] **M16.1 UX-R3 `/scans` 独立页面 + RepoHistoryDialog 迁移** —— 三种 query 组合可访问 + 汇总卡片 4 块 + 按仓库聚合 + 全运行分页列表渲染 + viewer 可见 + PrimeVue hydration fixme 不新增 + 既有 `alerts-rowgroup` / `history-dialog` / `batch-runs` / `dashboard` 不回归
- [x] **M16.2 C66-D alerts "立即修复此仓库" 入口 + `reuseScanRunId`** —— 一键复用受影响运行直接进入修复链路 + 空 / 不存在 runId 时按钮降级到常规触发 + 不破坏 fixStatus 修复链路与 batch-runs 跨仓库触发
- [x] **M16.3 C36 服务端 API 错误消息 i18n** —— 中文用户接口下错误响应 `message` 字段为中文 + code 保持英文供客户端判断 + 不影响 type=Error 业务路径 + 老客户端忽略未知键保持向后兼容
- [x] **M16.4 PrimeVue hydration 主线 #1 缓解：alerts 加载迁移 useAsyncData** —— 两个 fixme 取消 + `alerts-rowgroup` e2e 全过（首屏默认数据驱动） + 既有 dedupe / 视图切换 / 跨次去重 case 不破 + M15 utility 仍可复用
- [x] **M16.5 T701-e2e 管理端点集成测试补强** —— 测试覆盖到 admin 角色 + viewer 只读边界 + credential 关联仓库 / 凭据泄露验证 + repo 字段校验 + e2e 在 headless 模式下稳定通过 + 覆盖率不下降
- [x] `pnpm lint` / `typecheck` 全绿 —— 0 error（仅 2 pre-existing mailer warning 非本批次）
- [x] `vitest` 单测覆盖 + `playwright` e2e 覆盖 —— vitest 853 passed + 4 skipped（baseline 743 + M16.1 10 + M16.2 7 + M16.3 31 + M16.4 9 + M16.5 39 = +88 case；M16.3 baseline 805 → M16.4 814 → M16.5 853 累计 +48 case）+ e2e 累计新增 17 case（M16.1 5 + M16.2 3 + M16.3 7 + M16.5 16 = 31 累计；其中 M16.5 admin-roles 3 + credentials-crud 6 + repos-crud 7 = 16 case + alerts-rowgroup M16.4 baseline 10）
- [x] branches 覆盖率维持 ≥ 80% —— M16.1 baseline 79.93% → 80.27%（CI 阈值回归修复 `acfdc8d8` 后）/ M16.3 85.35% / M16.4 85.44% / M16.5 85.67%（远超 80% 阈值）
- [x] `pnpm check:docs` 全过 —— 99 md links + 55 vue-interp OK
- [x] `pnpm i18n:audit:missing` 0 missing（中英文双语键齐全）
- [x] 编号标记扫描 0 命中（无孤立 `C\d+` / `T\d+` / `M\d+` / `B\d` / `R\d` 等编号——按 [开发规范 §3 注释规范](../../docs/standards/development.md) 与 [code-auditor.agent.md 主责边界必查项](../../.github/agents/code-auditor.agent.md) 防御）
- [x] **不**引入多组织 / 不重写后端聚合 / 不动 `dashboard.vue` latestRun 卡片 / 不动 `batch-runs` 跨仓库视图 / **不**升级 PrimeVue 5 / 不破坏既有 `alerts-rowgroup` / `history-dialog` / 视图切换 / dedupe 行为
- [x] CI 端到端裁决通过 —— 5 轮独立 Review Gate standard depth Pass（M16.1 standard / M16.2 2 轮 standard / M16.3 standard / M16.4 standard / M16.5 standard）+ CI run #33068271005 Coverage 阈值回归修复 `acfdc8d8` 后 80.27% ≥ 80% 阈值

### 阶段治理记录（M16.1 + M16.2 + M16.3 + M16.4 + M16.5）

- **总投入**：19 commits（M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5）；含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次
- **测试覆盖**：vitest 853 passed + 4 skipped（157 files，baseline 743 + M16.1 10 + M16.2 7 + M16.3 31 + M16.4 9 + M16.5 39 = +96 case 累计；e2e 累计新增 17 case + alerts-rowgroup baseline 10 passed + 0 skipped）
- **branches coverage**：M16.1 baseline 79.93% → 80.27%（CI 阈值回归修复后） → M16.3 85.35% / M16.4 85.44% / M16.5 85.67%（远超 80% 阈值）
- **审计覆盖**：M16.1 standard / M16.2 standard 2 轮（RG-B1 终态校验契约冲突 + RG-B2 真实集成测试补强）/ M16.3 standard（4.3 分钟）/ M16.4 standard（8-10 分钟）/ M16.5 standard（2 分 14 秒）—— 全部 Pass
- **ahead commits 实证**：按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md#44-大批量归档批次操作规范) `git rev-list HEAD ^origin/master --count` 动态核验（2026-08-28 归档操作时实测 ahead=0：19 commits 已全部推送至 origin/master——M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5；ahead 数字动态核验以免 staleness）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M16 段（本段）
  - `docs/plan/todo.md` §M16 任务清单 → M16 已闭环切换（删除 M16 任务清单段 + 顶部 banner 更新）
  - `docs/plan/roadmap.md` M16 段状态更新（已完成 2026-08-28 归档）+ Milestone 概述表 M16 行新增
  - `docs/plan/backlog.md` 历史归档指针段新增 M16 条目 + §扫描历史与详情 UX 段 UX-R3 状态更新（已由 M16.1 闭环）
  - `docs/plan/archive/index.md` 基线更新（M16 归档后）+ 近期归档批次登记新增 M16 行
  - `docs/standards/development.md` §3 注释规范（编号标记扫描硬要求持续生效）

### 关键决策（M16）

**M16.1：**

- **三种 query 参数设计**（`?repository=<id>` / `?severity=<level>` / `?run=<runId>`）：M14.2 UX-R1 已闭环 `/api/runs` 分页 + `ids` 契约 + summary 聚合；三种 query 互不冲突可叠加，便于深度链接；`?run=` 内部 detail dialog 兜底保留 `RepoHistoryDialog.vue`（不删除，保持 `/scans?run=` 入口兼容）
- **viewer 可见"扫描"菜单**：跨次去重是 viewer 必看视图（监控自身仓库告警）；与 M13.4 T1403 dedupe 默认 'across' 决策一致
- **history-dialog.e2e 删除并入 scans.e2e**：避免 `/repos?history=` 路径成为孤儿——单一入口 `/scans` 替代两套路由

**M16.2：**

- **`reuseScanRunId` 区分 queue-mode continuation 与 user-reuse**（RG-B1 修复）：原 ScanRunOptions.reuse 既支持"async 队列后续阶段"又支持"用户主动复用"，两种语义共用一个布尔值导致终态校验契约冲突；改为 `reuseScanRunId?: string` 显式携带 runId（user-reuse）+ `ScanRunOptions.reuse?: boolean` 仅用于 orchestrator 内部 queue-mode continuation；orchestrator 在 user-reuse 时绕过终态校验并 reset finishedAt / errorJson / summaryJson / runUrl + 更新 mode / severityThreshold / executorKind + 清空 ScanResult 子表避免 JOIN 数据不一致
- **清空 ScanResult 子表**（RG-W3 修复）：reuse=true 时若不清空 ScanResult 子表，reused  ScanRun 与既有 ScanResult 通过 repositoryId JOIN 时数据不一致；A 阶段 audit 实证"reset summaryJson 等字段但未清空 ScanResult 子表"是契约漏洞
- **`AlertRunSidebar.vue` 组件抽取**（audit max-lines 触发）：alerts.vue 实施完成后超 800 行触发 lint warning；抽出 `AlertRunSidebar.vue`（含 affectedRunIds 列表 + fix 入口）；alerts.vue 主页面降回 < 800 行
- **`useFixNow` composable**：内部 `useI18n()` + auto-import `navigateTo` 保持 codebase 现有 pattern；fixingRunId / fixError / fixSuccess 三个 ref 独立响应式

**M16.3：**

- **`code` 强契约位置 `data.code`**（h3 1.15 不透传任意顶层字段）：h3 `createError` 不透传任意顶层字段（`sendError` 响应体仅含 `statusCode/statusMessage/data/stack`——实证 `apps/platform/node_modules/h3/dist/index.mjs:64-139`）；改为 `data.code` 强契约位置（前端从 `error.data.code` 读取判断 + `error.data.message` 读取本地化文案）
- **locale 检测优先级 `cookie(i18n_locale) > Accept-Language > 默认 zh-CN`**：与前端 vue-i18n localeDetector.ts:15 既有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **防御性降级 `event.node?.req?.headers` 缺失**（guard.test.ts mock event 形态）：不依赖 h3 `getHeader` / `getCookie`（单测 mock event 无 node.req 时会抛 TypeError）；直接读 `event.node?.req?.headers`，可选链 + typeof 守卫
- **`repos/[id]/scan.post.ts` 是 M16.2 刚改过的文件再动**：本地化 7 处 throw 行为不变；`scan.post.ts:95` 的 `ScanRun.errorJson.message` 是 **type=Error 业务字段**（前端从 ScanRun 读取时按前端 i18n 翻译），按 C36 验收"不影响 type=Error"约束**不**本地化
- **`params` 模板插值接口预留**：当前无 throw 使用（helper 24 case 单测间接验证 no-op 行为）；未来如需 `{minLength: 8}` / `{maxLength: 32}` 等参数化错误可零成本启用

**M16.4：**

- **PrimeVue 4 DataTable rowGroup subheader hydration 状态机分歧**：onMounted 异步赋值 `alerts.value` 后 PrimeVue 不重新计算 `processedData`，rowGroup subheader 永不渲染；`page.reload()` 后能渲染可佐证非业务逻辑问题（CI run 32383730911 alerts-rowgroup rowGroup 测试遗留）
- **迁移到 useAsyncData 让 SSR 阶段具备数据**：最低成本修复路径（vs 升级 PrimeVue 到修复版本监控周期不可控）；SSR 1 次 fetch + payload 复用 + hydration 后 PrimeVue 立即计算 processedData → rowGroup subheader 即时可见（debug 脚本实证 `Group headers after load: 2`）
- **useRequestFetch（Nuxt 4 官方 SSR cookie 转发方案）**：避免 `$fetch` 在 SSR 不转发 cookie 致 auth middleware 401；alerts 页有 auth middleware 必需 session cookie
- **utility 抽取到 utils/alerts-view.ts**（audit suggest 触发）：单一调用方但 audit suggest 触发的 utility 抽取；M16.2 alerts-view 已有基础扩展，9 case 单测覆盖 viewMode 3 态 × filters 字段 × dedupe on/off × 正交组合
- **alerts-rowgroup.e2e.ts 新增 SSR 锁定 test**（反向锁定未来不回退）：hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成；防止未来 refactor 不慎回退 onMounted 异步赋值模式
- **不升级 PrimeVue**（与主线 #1 已知 bug 风险取舍）：升级 PrimeVue 5 涉及 `@primevue/nuxt-module` 5.x + `@primeuix/themes` 3.x 联动升级 + DataTable 等组件用法评估，工作量与风险远大于 useAsyncData 修复路径；登记 backlog §M14.2 PrimeVue 4 → 5 升级评估延期项恢复条件 ② 与主线 #1 联动决策

**M16.5：**

- **三角色鉴权统一模式 `vi.hoisted` + `mockImplementationOnce`**：vi.mock factory hoist 问题通过 `vi.hoisted` 解（`mockRequireAuth / mockRequireRole / mockRequireOrgResource` 在 mock factory 顶层定义）；默认 mock 通过 admin，三角色 case 用 `mockImplementationOnce` 单次切换不影响其他 case
- **auth-self-guard 5 端点 × 自修改防御矩阵**：覆盖 self-target 403 / non-self last-admin 403 / non-self multi-admin 200 三态 × 5 better-auth admin 端点 = 15 矩阵 + 快速过滤 + no session + body 防御 + target 不存在共 23 case
- **ENCRYPTION_KEY 路径错配根因**：credential.service.ts:73-76 `getEncryptionKey` 直接读 `process.env.ENCRYPTION_KEY`（不走 `useRuntimeConfig()`），与 nuxt.config.ts:61 runtimeConfig `encryptionKey` 错配——典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；M16.5 e2e 测试发现 + 临时 playwright.config.ts:34 加 `ENCRYPTION_KEY=` 兜底；已登记 backlog C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（M16.6+ 候选；2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)）
- **viewer storageState 复用**：global-setup.ts 已注册 viewer → tests/e2e/.auth/viewer.json；3 个 e2e 用 `browser.newContext({ storageState })` 隔离 context + `__Secure-` cookie 在 HTTP webServer 下手工拼接
- **PrimeVue Password id 透传到外层 div**：选择器 `div#token input` 而非 input#token（PrimeVue 内部实现把 id 绑到 div 而非 input）
- **scope creep 防范**：跳过 credentials 关联 repos 删除冲突单测（M16.5 验收只要求"关联仓库/凭据泄露验证"，泄露验证已有，关联冲突不强制要求）+ 跳过 /api/users handler 三角色单测（缺 users handler 不存在，audit suggest 登记 M16.6+ 候选 S-4）

### 阶段关键经验（已沉淀至项目知识库）

- **h3 `createError` 不透传任意顶层字段**（强契约位置 `data.code`）：1.15 版本 `sendError` 响应体仅含 `statusCode/statusMessage/data/stack`；透传顶层 `code` 字段需求必须走 `data.code`——实证 `apps/platform/node_modules/h3/dist/index.mjs:64-139`
- **locale 检测单一权威来源**：服务端 locale 检测优先级与前端 vue-i18n localeDetector.ts:15 `tryQueryLocale` 行为对齐（`cookie(i18n_locale) > Accept-Language > 默认 zh-CN`）；防御性降级 `event.node?.req?.headers` 缺失（guard.test.ts mock event 形态兼容）
- **locales 单一权威来源**：字典必须与 i18n 一致，放 `apps/platform/i18n/locales/*.json` 顶层 `serverErrors` 段；helper 通过相对路径 import（避免与 nuxt-i18n 加载冲突）
- **PrimeVue hydration 修复实证**：useAsyncData SSR 1 次 fetch + payload 复用 + hydration 后 PrimeVue 立即计算 processedData → rowGroup subheader 即时可见（debug 脚本实证 `Group headers after load: 2`）
- **三角色 vi.hoisted 模式统一 mock**（M16.5 D 阶段实施）：vi.mock factory hoist 问题通过 `vi.hoisted` 解；`mockImplementationOnce` 单次切换不影响其他 case
- **PrimeVue Password id 透传到外层 div**：选择器 `div#token input` 而非 input#token（PrimeVue 内部实现）
- **playwright `__Secure-` cookie 手工拼接**：HTTP webServer 下 `__Secure-` cookie 不自动发送，需 `page.context().cookies()` 全部取后手工拼接 Cookie header（借鉴 batch/scans e2e 模式）
- **ENCRYPTION_KEY 路径错配根因**：credential.service.ts 直读 `process.env.ENCRYPTION_KEY` 与 nuxtConfig runtimeConfig `encryptionKey` 错配；典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500；M16.6+ 候选 C38 标准化路径

### 待迁移经验（next neat-freak 候选）

- **M16.3 audit suggest backlog**：`S1` `SCAN_PENDING_MERG` 当前在字典 + 联合类型 + 测试数据中定义但无 throw 消费（`scan.post.ts:95` 仍写死 `'duplicate_scan'` 与字面中文 message）—— 移除或与前端 ScanRun 错误处理对齐另立独立 code；`S2` `detectServerLocale` 缺 `?locale=` URL query 支持——与 `localeDetector.ts:15` 现有 `tryQueryLocale` 行为对齐（99% 场景无影响）
- **M16.3 范围外扩展**：扩展至 `/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`——M16.6+ 候选
- **M16.5 audit suggest backlog**：`S-4` better-auth admin 端点 viewer role check 单测补强（M16.5 audit suggest）——真实缺口在 `ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` viewer 403 路径（缺 users handler 不存在）；新建 `tests/e2e/admin-roles-extra.e2e.test.ts` 双向断言 viewer + admin；`S-2` `authedCookieHeader` 抽取到 `tests/e2e/helpers/`（M16.3 / M16.5 三批次遗留重复，纯重构零风险）
- **M16.5 audit warning backlog**：`W-1` 已迁出为 C38 credential.service 标准化 NUXT_ENCRYPTION_KEY 路径（2026-08-28 已由 M17.1 T1701 闭环落地 — 详见 [todo-archive.md §M17.1](#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)）
- **M16.5 顺手修复**：playwright.config.ts:34 加 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` e2eServerEnv 兜底——待 C38 标准化路径落地后删除
- **alerts-rowgroup.e2e.ts SSR 锁定 test**：反向锁定未来不再回退 onMounted 异步赋值模式（hydration 后 `.alerts__group-header` 立即可见 + `/api/alerts` 请求 ≤ 2 次典型为 SSR 1 次完成）
- **PrimeVue hydration 主线 #1 状态更新**：从"暂停"变"已缓解"——useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog + 评估是否升级到修复版本（依赖 backlog §M14.2 PrimeVue 4 → 5 升级评估恢复条件 ② 与主线 #1 联动决策）
- **run-view.ts / alerts-view.ts / buildAlertsQuery utility 抽取 spread**：当前 utility 已有 alerts / scans 等页面复用，下一波抽取候选 batch-runs.vue / repos/[id]/runs.vue / dashboard.vue 等 run-view 字段展示页面

---

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已归档 → 2026-08-30 M18 归档批次预防性分片迁出）

> **2026-08-30 M18 归档批次预防性分片迁出**：M13 段（12 子任务 / 26 commits / T1310 同步推进）已迁至新分片 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)。M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M18 归档批次新增后主窗口将超 700 强制分片阈值；M13 是 2026-08-26 闭环阶段（距今 4 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M13](roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档) + Milestone 概述表 M13 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M13 行
> - **关键 commit 实证**：T1301 `b57b8d8` / T1302 `f43edf1` / T1303 `c2e3d7b` `7282f65` / T1304 `25b46eb` / T1305 `0f08c40` `5269d0a` `9c79fc9` / T1306 `e3d93b7` `4447ff8` `2ae2a77` / T1309 `6023da8` `e9197c1` `1cb0364` `9b536e1` `56de1a1` / T1307 `792e8c8` `7b1ac01` `3cccce0` / T1308 `b0f6e84` `e63cdb9` / T1401 `2dce01d` / T1402+T1403 `bb3b49a` / T1310 `300b318` `1819b59` `733e198` `7b40a2c` `a74d07d`
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)

## M14: platform release 通道闭环 + UX 反馈跟进（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M14 段（4 子阶段 + M14.y 依赖批量治理，约 115 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M14 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md Milestone 概述表 M14 行](roadmap.md) + roadmap.md §M14 段历史上未单独列出（与 §M18 段缺失说明同模式 —— 2026-08-31 M19 归档批次校正）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M14 行
> - **关键 commit 实证**：T1310 `300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d` / `1fd38c1` / M14.1 收口 / M14.2 `81bd8d2` `581e1a9` `1a9eddf` 收口 + `17b5643` / M14.3 `5ccaaf4` / M14.x `92cc348` `ea0e24f` `84b4e1a` `b45f55e` / M14.y dependabot PR commits
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)

## M15: 扫描历史详情侧栏增强（UX-R2）（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M15 段（1 子阶段 4 子任务，约 65 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M15 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M15](roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + Milestone 概述表 M15 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M15 行
> - **关键 commit 实证**：`5c65177` P 阶段 docs + `1112017` UX-R2 实施（5 文件 / +425/-12）+ `0a60e3d` test 覆盖（2 文件 / +251）+ `d517a7f` release.yml CI 修复（不计入 M15 总投入）
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)

---

## M12: 平台 UX 一致性 + i18n 治理（已归档 → 2026-08-28 M17 归档批次预防性分片迁出）

> **2026-08-28 M17 归档批次预防性分片迁出**：M12 段（19 commits / C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）已迁出至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)。M17 段 152 行新增后主窗口接近 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M17 归档批次新增 152 行后主窗口 ≈ 738 行 > 700 强制分片阈值；M12 是 2026-08-21 闭环阶段（距今 7 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M12](roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档) + Milestone 概述表 M12 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M12 行
> - **关键 commit 实证**：C65-A1 `1d7c5c8` / C65-A3 `b10e270` / C65-B1 `789ed2f` / C65-C1+C2 `5dff002` / C65-D1 `348502d` / C65-D2 `132b944` / C65-D3 `374a278` / C65-D4 `ad6ce70` / CI 修复 `0c57211` `4043918` / network-audit `2104b9f` `0eb8704`
> - **关键经验沉淀**：`docs/standards/platform.md §7.2` i18n 单点声明条款 + `docs/standards/development.md §3` 同模式扫描 + `docs/standards/git.md §3` F 阶段本地验证口径差异
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)

---

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交本地待推送。详见分片文档。

---


## C53 / M10 / T912 / 2026-08-20 平台 UI 增强（C59-C61）/ 2026-08-20 M11 推进批次（已归档 → 迁出至分片）

> **2026-08-28 M16 归档批次预防性迁出**：本节段 5 个早期批次（C53 / M10 / T912 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要）已迁至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md) 与既有分片 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C 衍生子任务）。主窗口不再保留完整实施记录，仅保留导航指针与本批次归档背景说明。
>
> **迁出触发**：M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略。

| 批次 | 关键 commit 数 | 详情 |
|:--|:--:|:--|
| **C53** 平台集成模式 fix 修复结果推送远程 | 3 commits（`83ec736` / `46b7c15` / `3ed8303`） | [分片 §C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)（含 C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序；衍生子任务 C53-后-A/B/C 在 [archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次） |
| **M10** 独立沙箱容器 C26 实施规划 | 13 commits（T1001 B1+B2 + T1002 + T1003 + T1004） | [分片 §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档)（含 Docker rootless + 出站白名单代理 + cgroup v2 资源限制 + 文档收口） |
| **T912** SMTP 邮件发送器主体收口 | 3 commits（`edc9c94` / `6f00937` / `6e28207`） | [分片 §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)（T912-3 合并入 C28） |
| **2026-08-20 平台 UI 增强**（C59-C61） | 10 commits（C59 `9949504` + `03ba3b2` / C60 `a1d5bd9` `532ea78` `6b994b5` `5bba3f4` `5fbad71` / C61 `ffacfca` `5abd914` `402dc03`） | [分片 §2026-08-20 平台 UI 增强](archive/todo-archive-phases-m10-c53-c59c61.md#2026-08-20-平台-ui-增强c59--c60--c61)（C59 mixin 修复 + C60 sortable + C61 dashboard 图表） |
| **2026-08-20 M11 推进批次** | 22 commits（M11 推进批次 12 + M11 启动批次 10） | [分片 §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C + T1005-A/B/C/D + C28 + C56/C57 + C58 + C-ENV-CHANGE-ALERT） |

---

