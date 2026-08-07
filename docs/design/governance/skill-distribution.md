# Skill 分发治理（M5.5）

> 本文档定义 dependfix 仓库中三类 Skill 目录的职责边界、同步机制与命名规范，防止目录职责混淆与内容漂移。

## 三类目录职责分离

| 目录 | 职责 | 对外可见性 | 维护方式 |
|------|------|-----------|---------|
| `.github/skills/` | **内部开发 skill 权威源**（code-reviewer 等 10 个，供本仓库 AI 协作使用） | 生态不可见（目标态：frontmatter `metadata.internal: true`；当前 2/10 已标记，全量补齐在 T507 任务中） | 直接编辑；本机 agent 加载经 `scripts/setup/setup-ai.mjs` 链接到 `.claude/skills` / `.agents/skills`（gitignore，不入库） |
| `packages/skills/dependfix-remediator/` | **产品 skill 权威源**（`dependfix-remediator`，面向最终用户） | 随 npm 包 `@dependfix/skills` 发布 | 直接编辑（唯一编辑点） |
| `skills/dependfix-remediator/` | **npx skills 生态分发目录**（发布 = git push，`npx skills` 自动发现） | 生态可见（正常发现） | **禁止直接编辑**；由同步脚本镜像权威源 |

## 同步机制

产品 skill 权威源与生态分发目录必须保持文件集合与内容 hash 一致：

- 同步脚本：`scripts/sync-skills.mjs`（`pnpm sync:skills`，仓库级治理工具，不随 npm 包发布）
- 一致性测试：`packages/skills/test/sync-consistency.test.mjs`（文件集合 + sha256 双断言）
- 自动同步：lint-staged 命中 `packages/skills/dependfix-remediator/**` 时自动执行同步并暂存 `skills/`（改权威源 = 自动同步分发）
- 改动产品 skill 后必须执行同步脚本（或经 lint-staged 自动同步），测试失败即 CI 拦截，不允许带漂移提交

## 命名规范

- skill 目录名必须等于 SKILL.md frontmatter `name`（小写字母/数字/连字符，≤64 字符）。
- 产品 skill 名：`dependfix-remediator`。
- 内部开发 skill 名沿用现状（`code-reviewer`、`full-stack-master` 等 10 个）。

## 内部 skill 防发现

- 内部开发 skill 的 SKILL.md frontmatter 必须包含 `metadata.internal: true`，使 `npx skills` 正常发现不可见（`INSTALL_INTERNAL_SKILLS=1` 时才可见）。
- 该字段对主流 agent（Claude Code / OpenCode / Cursor）本地加载无影响，可保留。
- 新增内部 skill 时同步补齐该标记；由 `dependfix skills doctor`（T507）负责完整性检查。

## 相关任务

- T506（产品 Skill 权威源与 CLI 编排）：本规范落盘 + `packages/skills` 交付（详见 [todo.md §M5.5](../../plan/todo.md#m55-skill-编排cli-先行)）
- T507（npx skills 生态接入 + 兜底安装器）：主通道验证、内部 skill 全量标记、`dependfix skills install` / `doctor`（详见 [todo.md §M5.5](../../plan/todo.md#m55-skill-编排cli-先行)）
- T508（MCP 双后端扩展点）：SKILL.md 能力契约映射表补齐 MCP 列（详见 [todo.md §M5.5](../../plan/todo.md#m55-skill-编排cli-先行)）
