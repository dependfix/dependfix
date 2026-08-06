# dependfix

自动化处理 Dependabot / Code Scanning 安全告警中那些简单、重复、但数量庞大的修复工作。

## 当前状态

**M4（多仓库治理增强）已完成（2026-08-06），M4.5 跨线升级显式授权已完成（2026-08-07）。** M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）已完成并归档。

`dependfix` CLI 支持四类命令（`report-only` / `fix` / `fix-and-pr` / `cleanup-branches`），可通过 GitHub Composite Action（`uses: dependfix/dependfix@v1`）提供零配置的自动化安全修复能力。

## 定位

针对多项目维护者，提供一套可直接运行、也可在 GitHub Actions 中运行的自动化方案：

- ✅ 自动获取 Dependabot alerts（需 PAT / GitHub App token，GITHUB_TOKEN 恒 403）
- ✅ 本地无 token 回退：`pnpm audit` 数据源（`--alerts-source pnpm-audit`）
- ✅ 按严重级别过滤并执行可控修复（依赖升级、lockfile 修复、依赖分组升级）
- ✅ 自动修复 `pnpm i --frozen-lockfile` 类问题（7 类失败分类 + 多策略修复链）
- ✅ 验证修复（install + lint + build）
- ✅ Markdown + JSON 双格式报告输出（GHSA 审计粒度、数据源标注）
- ✅ `fix-and-pr` 模式下自动创建分支并提交 Pull Request（PR 去重：内容指纹 + 关旧开新）
- ✅ 分支清理（`cleanup-branches` / `--cleanup-branches-auto`）
- ✅ Code Scanning alerts 接入（`code-scanning` / `--code-scanning` / `DEPENDFIX_CODE_SCANNING`，A/B/C 规则分层自动修复，M3 已完成）
- ✅ owner 级仓库自动发现 / 多仓库并发治理 / 报告归档（M4 已完成，2026-08-06）
- ✅ 跨线告警显式授权自动升级（`--allow-major-upgrade`，仅 CLI；M4.5 已完成，2026-08-07）
- 🔶 AI 研判依赖升级 breaking change（M5 规划中）
- 🔶 独立平台部署（闭源场景，M6 规划中）

## 快速导航

- [快速开始](guide/quick-start.md)
- [配置说明](guide/configuration.md)
- [技术栈详解](guide/tech-stack.md)
- 设计文档：[模块设计索引](design/packages/index.md) / [专项设计与治理索引](design/governance/index.md)
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
      - uses: dependfix/dependfix@v1
        with:
          mode: fix-and-pr
          severity-threshold: high
          github-token: ${{ secrets.GITHUB_TOKEN }}
```
