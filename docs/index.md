# dependfix

自动化处理 Dependabot / Code Scanning 安全告警中那些简单、重复、但数量庞大的修复工作。

## 当前状态

**M2（GitHub Action 接入）已完成。** M1（MVP 单仓库修复）和 M0（基线收敛）已归档。

`dependfix` CLI 现已支持三条命令（`report-only` / `fix` / `fix-and-pr`），并通过 GitHub Composite Action（`uses: CaoMeiYouRen/dependfix@v1`）提供零配置的自动化安全修复能力。

## 定位

针对多项目维护者，提供一套可直接运行、也可在 GitHub Actions 中运行的自动化方案：

- ✅ 自动获取 Dependabot alerts
- ✅ 按严重级别过滤并执行可控修复（依赖升级、lockfile 修复）
- ✅ 自动修复 `pnpm i --frozen-lockfile` 类问题
- ✅ 验证修复（lint + build）
- ✅ Markdown + JSON 双格式报告输出
- ✅ `fix-and-pr` 模式下自动创建分支并提交 Pull Request
- 🔶 Code Scanning alerts 接入（M3 规划中）
- 🔶 AI 研判依赖升级 breaking change（M5 规划中）
- 🔶 独立平台部署（闭源场景，M6 规划中）

## 快速导航

- [快速开始](guide/quick-start.md)
- [配置说明](guide/configuration.md)
- [技术栈详解](guide/tech-stack.md)
- [系统架构](design/architecture.md)
- [数据模型](design/data-model.md)
- [安全设计](design/security.md)
- [GitHub Action 设计](design/github-action-workflow.md)
- [.gitignore 自动管理](design/gitignore-management.md)
- [仓库名自动推断](design/repo-auto-inference.md)
- [当前阶段任务](plan/todo.md)
- [路线图](plan/roadmap.md)
- [待办积压](plan/backlog.md)
- [项目规范](standards/index.md)

## 项目结构

```
dependfix/               # pnpm workspace Monorepo
├── packages/
│   ├── core/            # ✅ @dependfix/core — 核心领域模型库
│   │   └── src/         # 告警模型、过滤器、规划器、报告生成、日志、工具函数
│   └── cli/             # ✅ dependfix — CLI 应用入口
│       └── src/         # CLI 参数解析、配置、GitHub 集成、修复器、验证执行器
├── docs/                # ✅ VitePress 文档站
├── action.yml           # ✅ GitHub Composite Action 入口
└── .github/             # ✅ CI/CD 工作流与技能定义

# 后续按需添加：
# ├── apps/platform/     # Nuxt 全栈独立平台（M6）
# ├── packages/mcp/      # MCP Server（M6+）
```

## 快速开始

### CLI

```bash
# 查看告警
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN

# 修复告警
npx dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN

# 修复并创建 PR
npx dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

### GitHub Action

```yaml
name: Weekly Security Scan
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  security-events: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: CaoMeiYouRen/dependfix@v1
        with:
          mode: fix-and-pr
          severity-threshold: high
          github-token: ${{ secrets.GITHUB_TOKEN }}
```
