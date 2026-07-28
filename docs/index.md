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
- [待办积压](plan/backlog.md)
- [项目规范](standards/index.md)

## 项目结构

```
dependfix/               # 当前：单包结构（src/）
├── src/
│   ├── cli/            # CLI 参数解析与运行入口
│   ├── config/         # 配置模型与环境变量合并
│   ├── core/           # 日志、错误、告警、过滤、规划、报告
│   ├── github/         # GitHub API 集成（待实现）
│   ├── fixers/         # 依赖升级 / pnpm lockfile / Code Scanning 修复器
│   ├── runners/        # 验证执行器（待实现）
│   └── utils/          # 通用工具
├── docs/               # 项目文档
└── .github/            # CI/CD 工作流与技能定义

# 后续演进为 Monorepo：
# ├── apps/platform/    # Nuxt 全栈独立平台
# ├── packages/         # 多包架构（core/cli/github/action/mcp）
```
