# @dependfix/core

> dependfix 核心领域模型库。提供告警标准化模型、过滤器、优先级排序、报告生成、日志等跨包共享模块。

## 安装

```bash
pnpm add @dependfix/core
```

## 模块概览

| 模块 | 路径 | 说明 |
|:-----|:-----|:-----|
| **alerts** | `@dependfix/core` | `NormalizedSecurityAlert` 告警标准化模型、严重级别映射（Dependabot / Code Scanning） |
| **filters** | `@dependfix/core` | `filterAlerts()` 按严重级别过滤、`prioritizeAlerts()` 优先级排序、`limitAlerts()` 数量限制 |
| **report** | `@dependfix/core` | `generateMarkdownReport()` / `generateJsonReport()` 双格式报告生成、`writeReport()` 文件写入 |
| **errors** | `@dependfix/core` | `AppError` 结构化错误模型、`toAppError()` 错误标准化、错误代码枚举 |
| **logger** | `@dependfix/core` | `createLogger()` 结构化日志（支持 debug / info / warn / error 级别） |
| **toolchain** | `@dependfix/core` | `ToolchainInfo` 工具链信息模型（包管理器、Node 版本等） |
| **planner** | `@dependfix/core` | 修复规划器类型定义 |
| **utils** | `@dependfix/core` | `isValidRepoIdentifier()` 仓库标识符校验、通用工具函数 |

## 使用示例

```ts
import {
    createNormalizedAlert,
    type NormalizedSecurityAlert,
    filterAlerts,
    generateMarkdownReport,
    generateJsonReport,
    writeReport,
    createLogger,
    type RunResult,
} from '@dependfix/core'

// 创建标准化告警
const alert: NormalizedSecurityAlert = createNormalizedAlert({
    id: 1,
    source: 'dependabot',
    repository: 'owner/repo',
    severity: 'high',
    packageName: 'lodash',
    // ...
})

// 按严重级别过滤
const filtered = filterAlerts([alert], { severityThreshold: 'high' })

// 生成报告
const md = generateMarkdownReport(runResult)
const json = generateJsonReport(runResult)

// 写入文件
writeReport(md, json, new Date().toISOString(), 'run-abc123')
```

## 相关包

- [dependfix 主项目](https://github.com/dependfix/dependfix) — 本包源码与完整文档
- [dependfix](https://github.com/dependfix/dependfix/blob/master/packages/cli/README.md) — CLI 应用入口（依赖本包）
- [@dependfix/engine](https://github.com/dependfix/dependfix/blob/master/packages/engine/README.md) — 执行引擎（依赖本包）
- [@dependfix/mcp](https://github.com/dependfix/dependfix/blob/master/packages/mcp/README.md) — MCP Server（依赖本包）
- [@dependfix/skills](https://github.com/dependfix/dependfix/blob/master/packages/skills/README.md) — 产品 Agent Skill 权威源
