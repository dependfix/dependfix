# 当前阶段任务（M5.5）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）/ M4（多仓库治理增强）/ M4.5（跨线升级显式授权）/ M4.6（Monorepo 成员级修复增强）/ **M5（AI Breaking Change 研判）** 已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M5（2026-08-07 归档）**：T501-T506 全部交付（903 tests），Review Gate 每任务独立审计 PASS（T503 三审），AI 链路闭环 + 报告 aiUsage 聚合段；CI 链式修复（lint-md 穿透 / check-links 锚点 / action manifest 模板）收口。
> **M5.5（Skill 编排，CLI 先行）为本期任务（2026-08-07 决策落盘，M5 归档后启动）**：T506-T508 详见下文。
>
> **编号说明**：本阶段 T506/T507/T508 与已归档 M5 的 T506（AI 链路 app 接线）编号重叠——M5 的 T506 已归档完成，本阶段编号自 M5.5 规划起独立计数，后续如有歧义以"阶段 + 任务编号"全称（如 M5.5 T506）为准。

---

## M5.5: Skill 编排（CLI 先行）

**目标**: 将 dependfix 的自动化修复能力封装为可分发的 Agent Skill（`dependfix-remediator`），通过 CLI 直接调用，支持主流 agent 工具（Claude Code / GitHub Copilot / Cursor / OpenCode）接入；MCP 作为后续增强执行后端（T606/T706），与 CLI 后端并存。

**范围与依赖**:

- 主链路（串行）：T506（Skill 权威源与 CLI 编排）→ T507（npx skills 生态接入 + 兜底安装器）
- 增强（独立）：T508（MCP 双后端扩展点，依赖 M6 T606）
- 复用基础：CLI 命令面（report / fix / fix-and-pr / cleanup-branches）、多仓库治理、双数据源、PR 链路、报告归档、T505 pipeline 解耦
- **生态决策**：`npx skills`（vercel-labs/skills）为主安装通道（发布 = git push 仓库根 `skills/`）；自研 `dependfix skills install` 仅作离线兜底；内部开发 skill（code-reviewer 等 10 个）以 `metadata.internal: true` 标记，不进入生态正常发现

**建议执行顺序**: T506 → T507（主链路）；T508 可与 M6 T601-T602 并行

### 背景与决策（2026-08-07 用户确认）

- **MCP 不等 Skill**: MCP Server 原规划在 M6/M7 才落地，但当前 CLI 能力面（report/fix/fix-and-pr/cleanup-branches + 多仓库 + 双源 + PR 链路）已覆盖 MCP 规划的 4 个 tool（fetch_alerts / run_scan / fix_dependency / get_last_report）。skill 编排不依赖 MCP 即可工作
- **CLI vs MCP 对比结论**: CLI 优势——零配置（`npx dependfix` 开箱即用）、无 shell 客户端外均可用、命令面完整、报告天然落盘可审计、不依赖 T505 解耦；MCP 优势——结构化 schema 返回零解析、覆盖无 shell 客户端（Claude Desktop / Copilot 等）、常驻进程可缓存/增量查询、细粒度读写 tool 安全边界。**两者叠加关系**——skill 编排逻辑不变，执行后端可切换；CLI 先行不阻塞也不被 MCP 阻塞
- **生态决策**: `npx skills`（2026-01 发布，28.1k stars，MIT）支持 70+ agents、自动检测本机工具、无需提交 registry——**主安装通道**；自研安装器仅兜底（离线 / 无 npx 环境）；内部开发 skill 通过 `metadata.internal: true` 隐藏（正常发现不可见、需 `INSTALL_INTERNAL_SKILLS=1` 才显示）

### T506 产品 Skill 权威源与 CLI 编排

- **优先级**: P1（M5 归档后启动，与 M6 T601-T602 并行）
- **依赖**: 无（CLI 命令面已齐备）
- **状态**: 已完成（2026-08-07 交付，Review Gate 复审通过）
- **交付物**: `packages/skills/dependfix-remediator/`（SKILL.md + REFERENCES.md），npm 包 `@dependfix/skills`；仓库根 `skills/dependfix-remediator/` 分发目录（npx skills 生态发现）

**任务内容**:

- [x] SKILL.md（YAML frontmatter：`name` / `description` 必填 + 编排步骤 + 决策树），符合 Agent Skills 共享规范（npx skills / Claude Code / Copilot / Cursor / OpenCode 均可加载）；执行后端 = `dependfix` CLI 命令映射表（report → `dependfix report-only`；fix → `dependfix fix` / `fix-and-pr`；告警查询 → `--history` / 归档）
- [x] 编排逻辑与执行后端解耦：SKILL.md 中步骤只依赖"能力契约"（拉告警/修复/取报告），CLI 子命令为当前实现，预留 MCP tool 映射位（T606/T706 接入）
- [x] skill 放置规范落盘：仓库内权威源 = `packages/skills/`（产品 skill，随 npm 发布）；仓库根 `skills/` = npx skills 生态分发目录（发布 = git push，npx skills 自动发现，与 packages/skills 内容一致）；`.github/skills/` 保持内部开发 skill 权威源（code-reviewer 等 10 个），二者职责分离（规范见 [skill-distribution.md](../design/governance/skill-distribution.md)）

**完成定义**:

- [x] 用户按 README 安装 skill 后，AI 助手可对话式完成"拉告警 → 研判 → 修复 → 报告"闭环（CLI 后端）——本机冒烟通过：`npx skills` 生态发现 + 安装到 opencode 全局目录成功；README 安装指引随 T507 补充
- [x] SKILL.md 中无 MCP 依赖（T706 前不要求 MCP 可用）

**非目标**: MCP Server 本体（M6 T605/T606）；skill 市场提交

**测试方案**: skill 安装到本机 agent 工具的冒烟验证；SKILL.md 规范校验（frontmatter 必填字段）

### T507 npx skills 生态接入 + 自研兜底安装器

- **优先级**: P1
- **依赖**: T506
- **状态**: 已完成（2026-08-07 交付，Review Gate 复审通过）
- **交付物**: npx skills 生态主通道（仓库根 `skills/` 被发现安装）+ `dependfix skills install`（兜底）/ doctor

**任务内容**:

- [x] **主通道**：验证 `npx skills add <source> -s dependfix-remediator -g` 可发现并安装产品 skill 到本机已检测的 agent 工具——本地源实证通过（发现 + copied 安装）；发布 = git push，skills.sh 经 telemetry 自动收录；GitHub 源端到端待推送后验证（本机 clone github.com 网络受限）
- [x] **内部 skill 防发现**：10 个内部开发 skill（code-reviewer 等）SKILL.md frontmatter 加 `metadata.internal: true`（.github/skills 权威源，.agents/skills / .claude/skills junction 副本自动同步 hash 一致）；验证矩阵：正常 `--list` 仅 1 个产品 skill（内部全隐藏），`INSTALL_INTERNAL_SKILLS=1` 11 个全可见
- [x] **兜底安装器**：`dependfix skills install`——检测本机已装 agent 工具（Claude Code / OpenCode / Cursor / Copilot 目录约定与 npx skills 生态对齐）→ 复制产品 skill 到官方目录（内容源 = @dependfix/skills 包）→ 输出安装清单；存在同名 skill 则提示覆盖确认（非 TTY 默认拒绝，--force 强制）；幂等可重跑
- [x] `dependfix skills doctor`：agent 目录约定漂移检测（主目录在但 skills 目录缺失提示）+ 产品 skill 安装状态/内容一致性 + 内部 skill internal 标记完整性检查
- [x] README 安装指引：一行命令 `npx skills add dependfix/dependfix -s dependfix-remediator -g -a claude-code -a opencode -a cursor` 覆盖主流工具；注明兜底离线安装方式

**完成定义**:

- [x] 主通道：在装有任一主流 agent 的机器上 `npx skills add` 一条命令完成安装——本地源实证安装成功；GitHub 源待推送后端到端复验（网络受限边界）
- [x] 兜底：无 npx skills 环境下 `dependfix skills install` 完成同等安装（本机 3 agent 实测 installed/up-to-date + doctor 0 error）
- [x] `npx skills` 正常发现（--list）不出现任何内部开发 skill（实测 1/11 矩阵）
- [x] 主通道与兜底均幂等可重跑（重复 install 全部 up-to-date）

**非目标**: 复刻 npx skills 完整命令矩阵（add/list/update/remove）

**测试方案**: 本机主流 agent 实测（Claude Code / OpenCode / Cursor）；internal 标记可见性矩阵；安装幂等性

### T508 MCP 双后端扩展点（衔接 T606/T706）

- **优先级**: P2
- **依赖**: T506, T606（M6）
- **状态**: 未开始
- **交付物**: SKILL.md 增加 MCP 探测与双后端指引

**任务内容**:

- [ ] SKILL.md 增加"执行后端探测"步骤：检测 `@dependfix/mcp` 是否可用（MCP 配置存在）→ MCP tool 优先 / CLI 回退
- [ ] 能力契约映射表补齐 MCP tool 列（fetch_alerts / run_scan / fix_dependency / get_last_report）
- [ ] 与 T606 一致性验证对齐：MCP tool 输出与 CLI 输出同源断言

**完成定义**:

- [ ] 配置了 MCP 的环境走 tool 调用，未配置的环境走 CLI，两条路径输出一致
- [ ] T706 发布 `@dependfix/mcp` 时 skill 无需改版即可双后端工作

**非目标**: MCP Server 实现（M6 T605/T606）

**测试方案**: 双后端输出一致性断言；探测降级路径

## M5.5 完成判定（草案，方案细化后定稿）

- [ ] T506-T507 交付并通过 Review Gate（每任务独立审计）
- [ ] npx skills 主通道 + 兜底安装器双路径验证通过
- [ ] 内部开发 skill 生态不可见（metadata.internal 验证）
- [ ] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过
- [ ] CLI 现状行为回归无损
