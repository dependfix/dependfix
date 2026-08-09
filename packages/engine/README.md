# @dependfix/engine

> dependfix 执行引擎包：编排、采集、修复与研判核心。由 CLI（dependfix）、MCP Server（@dependfix/mcp）与平台（apps/platform）共同依赖。

## 内容

| 模块 | 说明 |
|:-----|:-----|
| `src/github/` | GitHub 客户端、Dependabot / Code Scanning 告警采集、PR 创建、仓库发现与名单策略 |
| `src/code-scanning/` | Code Scanning 规则分类（A/B/C）与模板化修复 |

> 后续批次（见 [todo.md 进行中任务](../../docs/plan/todo.md)）将并入 fixers / config / report / app（DependfixApp）等执行核心模块。

## 本地开发

```bash
pnpm --filter @dependfix/engine build   # 构建 dist
pnpm --filter @dependfix/engine test    # 测试
```
