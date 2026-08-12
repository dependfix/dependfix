# @dependfix/skills

dependfix 产品 Agent Skill 权威源（`dependfix-remediator`），随 npm 发布。

## 这是什么

`dependfix-remediator` 是面向最终用户的 Agent Skill：把 dependfix 的安全告警修复能力封装为 AI 助手可直接执行的编排指令（拉告警 → 研判 → 修复 → 报告），支持 Claude Code / GitHub Copilot / Cursor / OpenCode 等主流 agent 工具加载。

## 安装方式

主通道（npx skills 生态，推荐）：

```bash
npx skills add dependfix/dependfix -s dependfix-remediator -g -a claude-code -a opencode -a cursor
```

离线兜底（依赖 dependfix CLI，无 npx skills 环境）：

```bash
npx dependfix skills install
```

## 内容

- `dependfix-remediator/SKILL.md` — 编排主体（能力契约 + 执行后端探测 + 决策树 + 场景编排）
- `dependfix-remediator/REFERENCES.md` — CLI 命令参考与 MCP 双后端衔接（一致性断言清单）

仓库根 `skills/dependfix-remediator/` 为 npx skills 生态分发副本，由 `scripts/sync-skills.mjs` 镜像同步（禁止直接编辑，一致性由测试保证）。

## 开发

```bash
pnpm sync:skills    # 同步权威源到仓库根分发目录（scripts/sync-skills.mjs）
pnpm test           # 一致性 / frontmatter 规范 / MCP 契约测试（packages/skills/test/）
```

## 相关包

- [dependfix 主项目](https://github.com/dependfix/dependfix) — 本包源码与完整文档
- [dependfix](https://github.com/dependfix/dependfix/blob/master/packages/cli/README.md) — CLI 应用入口（`dependfix skills install` 安装本包 Skill）
- [@dependfix/core](https://github.com/dependfix/dependfix/blob/master/packages/core/README.md) — 核心领域模型库
- [@dependfix/engine](https://github.com/dependfix/dependfix/blob/master/packages/engine/README.md) — 执行引擎
- [@dependfix/mcp](https://github.com/dependfix/dependfix/blob/master/packages/mcp/README.md) — MCP Server
