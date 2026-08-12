# @dependfix/engine

> dependfix 执行引擎包：编排、采集、修复与研判核心。由 CLI（dependfix）、MCP Server（@dependfix/mcp）与平台（apps/platform）共同依赖，应用层不再互相依赖。

## 内容

| 模块 | 说明 |
|:-----|:-----|
| `src/github/` | GitHub 客户端、Dependabot / Code Scanning 告警采集、PR 创建、仓库发现与名单策略 |
| `src/code-scanning/` | Code Scanning 规则分类（A/B/C）与模板化修复 |
| `src/fixers/` | 依赖升级修复器（直接/间接/版本化 overrides）与 pnpm lockfile 修复 |
| `src/config/` | 运行时配置（RUNTIME_MODES / DEFAULT_RUNTIME_CONFIG / resolveRuntimeConfig） |
| `src/report/` | 报告归档与历史查询（queryRepoHistory / writeArchive） |
| `src/app/` | 编排核心 `DependfixApp` 与分支清理 |
| `src/helpers/` | 共享工具（验证链 / 快照回滚 / 分区） |
| `src/ai/` | AI breaking change 研判（provider / schema / safety-gate / patch-applier） |
| `src/runners/` | 验证执行器与门禁 |
| `src/alerts/` | pnpm-audit 本地回退数据源 |
| `src/multirepo/` | 多仓库并发调度 |
| `src/grouping/` | 依赖升级分组 |

## 本地开发

```bash
pnpm --filter @dependfix/engine build   # 构建 dist
pnpm --filter @dependfix/engine test    # 测试
```

## 相关包

- [dependfix 主项目](https://github.com/dependfix/dependfix) — 本包源码与完整文档
- [@dependfix/core](https://github.com/dependfix/dependfix/blob/master/packages/core/README.md) — 核心领域模型库（本包依赖）
- [dependfix](https://github.com/dependfix/dependfix/blob/master/packages/cli/README.md) — CLI 应用入口（依赖本包）
- [@dependfix/mcp](https://github.com/dependfix/dependfix/blob/master/packages/mcp/README.md) — MCP Server（依赖本包）
- [@dependfix/skills](https://github.com/dependfix/dependfix/blob/master/packages/skills/README.md) — 产品 Agent Skill 权威源
