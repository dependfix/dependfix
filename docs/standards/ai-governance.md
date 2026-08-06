# AI 资产治理规范

本文档定义项目内 Skills / Agents 资产的分层、命名、生命周期与清理规则。

## 1. 权责边界

1. **项目级规则来源**: `AGENTS.md` 负责定义项目级角色矩阵、冲突顺序与安全红线。
2. **治理规范职责**: 本文负责定义 Skills / Agents 的目录边界、命名、生命周期与清理口径。
3. **平台适配文件**: `.claude/`、`.cursor/` 等入口文件只负责平台差异，不得重写项目级规则。

## 2. 资产分层

### 2.1 项目内部维护资产

以下定义属于项目内部维护资产，由仓库负责版本控制：

- `.github/agents/*.agent.md`
- `.github/skills/<skill-name>/SKILL.md`
- `.github/skills/<skill-name>/references/`
- `.github/skills/<skill-name>/scripts/`

约束：
1. `.github/` 是主定义目录。
2. 任何内部定义调整都必须先改主定义。
3. 内部维护的 skill 须在 frontmatter 中声明 `metadata.internal: true`。

### 2.2 平台副本同步机制

`.claude/agents`、`.claude/skills`、`.agents/skills`、`.opencode/agents` 均是由 [scripts/setup/setup-ai.mjs](../../scripts/setup/setup-ai.mjs) 创建的指向 `.github/agents`、`.github/skills` 的符号链接（junction），**不是独立副本**：

- **审查/审计范围**：只审查 `.github/agents`、`.github/skills` 源目录即可，平台副本无需逐个审查（改源目录即全平台生效）。
- **同步命令**：新增工作树或平台目录缺失时运行 `node scripts/setup/setup-ai.mjs` 重建符号链接。
- **禁止**：直接修改 `.claude/`、`.agents/`、`.opencode/` 下的 agent / skill 文件（它们是符号链接，改源目录才是正确入口）。

### 2.3 外部平台提供资产

编辑器或扩展自带的外部 skill 只作为参考来源或调用入口，不纳入项目内部库存，不镜像到 `.github/`。

## 3. 命名规范

### 3.1 Skills
- 目录名使用 `kebab-case`，与 `SKILL.md` frontmatter `name` 一致。
- `references/` 存放清单、模板、示例。
- `scripts/` 存放该 skill 独占的辅助脚本。

### 3.2 Agents
- 文件名使用 `kebab-case.agent.md`。
- `description` 必须能成为真实触发面。

## 4. 生命周期

| 状态 | 含义 |
|------|------|
| `proposed` | 已有需求或方案，尚未成为正式资产 |
| `active` | 正式在库并纳入治理检查 |
| `deprecated` | 仍存在但不再推荐扩写，须写明替代方案和移除条件 |
| `removed` | 已从主定义清除，同步清理入口引用 |

## 5. 清理触发条件

- 无引用定义长期保留
- 职责高度重叠的重复 skill / agent
- 外部模板被直接复制进仓库后未项目化改造
- `description`、frontmatter、链接导致发现失败

## 6. 相关文档

- [外部 Skills 准入清单](./external-skills-intake.md)
- [AI 协同开发指南](../guide/ai-development.md)
