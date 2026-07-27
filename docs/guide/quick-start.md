# 快速开始

## 前置要求

- Node.js >= 20
- pnpm（推荐最新稳定版）
- GitHub Token（用于告警拉取和 PR 创建）

## 安装

```bash
npm install -g dependfix
# 或
pnpm add -g dependfix
# 或
npx dependfix
```

## 基本使用

### 报告模式（仅查看告警）

```bash
dependfix report --repo owner/repo --token $GITHUB_TOKEN
```

### 修复模式

```bash
dependfix fix --repo owner/repo --token $GITHUB_TOKEN --severity high
```

### 修复并创建 PR

```bash
dependfix fix-and-pr --repo owner/repo --token $GITHUB_TOKEN
```

## GitHub Action 使用

```yaml
# .github/workflows/security-auto-fix.yml
name: Auto Fix Security
on:
  schedule:
    - cron: '0 8 * * 1'
  workflow_dispatch:
jobs:
  auto-fix:
    uses: dependfix/action/.github/workflows/security-auto-fix.yml@main
    with:
      severity_threshold: high
      create_pr: true
    secrets:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## CLI 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--repo` | 目标仓库（owner/repo） | — |
| `--token` | GitHub Token | `GITHUB_TOKEN` 环境变量 |
| `--severity` | 严重级别阈值 | `high` |
| `--mode` | 运行模式 | `report-only` |
| `--dry-run` | 预演模式 | `false` |
| `--max-alerts` | 每仓库最大告警数 | `20` |
