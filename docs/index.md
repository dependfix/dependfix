# dependfix

自动化处理 Dependabot / Code Scanning 安全告警中那些简单、重复、但数量庞大的修复工作。

## 定位

针对多项目维护者，提供一套可直接运行、也可在 GitHub Actions 中运行的自动化方案：

- 自动获取 Dependabot alerts
- 自动获取 Code Scanning alerts
- 按严重级别过滤并执行可控修复
- 自动修复 `pnpm i --frozen-lockfile` 类问题
- AI 研判依赖升级 breaking change 并生成修复方案
- 支持开源项目（GitHub Action）和闭源项目（独立平台部署）

## 快速导航

- [快速开始](guide/quick-start.md)
- [技术栈详解](guide/tech-stack.md)
- [配置说明](guide/configuration.md)
- [系统架构](design/architecture.md)
- [数据模型](design/data-model.md)
- [安全设计](design/security.md)
- [当前阶段任务](plan/todo.md)
- [路线图](plan/roadmap.md)

## 项目结构

```
dependfix/
├── apps/platform/       # Nuxt 全栈独立平台
├── packages/
│   ├── core/           # 核心业务逻辑
│   ├── cli/            # CLI 入口
│   ├── github/         # GitHub API 集成
│   ├── action/         # GitHub Action 入口
│   └── mcp/            # MCP Server
└── docs/               # VitePress 文档站
```
