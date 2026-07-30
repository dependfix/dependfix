# 快速开始

## 前置要求

- Node.js >= 20
- pnpm（推荐最新稳定版）
- GitHub Token（用于告警拉取和 PR 创建）
  - `report-only` / `fix` 模式：需 `security-events: read` 权限
  - `fix-and-pr` 模式：额外需 `contents: write` + `pull-requests: write` 权限

## 安装

```bash
# 全局安装
pnpm add -g dependfix

# 或直接运行（无需安装）
npx dependfix report --repo owner/repo --github-token $GITHUB_TOKEN
```

## 基本使用

### 报告模式（仅查看告警）

```bash
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

报告将生成至 `./dependfix-reports/` 目录（Markdown + JSON 双格式）。

### 修复模式

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high
```

执行依赖升级和 lockfile 修复，修改仅限本地文件。

### 修复并创建 PR

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

执行完整修复流程后，自动创建 `dependfix/auto-fix-{runId}` 分支、提交变更、推送并创建 Pull Request。PR body 包含修复摘要、变更列表和验证结果。

### 批量仓库

```bash
# 逗号分隔多个仓库
dependfix fix --repo owner/repo-a,owner/repo-b --github-token $GITHUB_TOKEN

# 从文件读取仓库列表
dependfix fix --repos-file ./repos.txt --github-token $GITHUB_TOKEN
```

### 试运行

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --dry-run
```

`--dry-run` 模式下不实际修改文件，仅输出计划操作。

## GitHub Action 使用

在你的仓库中创建 `.github/workflows/dependfix.yml`：

```yaml
name: Weekly Security Scan
on:
  schedule:
    - cron: '0 6 * * 1'   # 每周一 UTC 6:00
  workflow_dispatch:        # 手动触发

permissions:
  contents: write          # fix-and-pr 模式需要
  pull-requests: write     # fix-and-pr 模式需要
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

### Action 输入参数

| 参数 | 必填 | 默认值 | 说明 |
|:-----|:----:|:------|:-----|
| `mode` | 否 | `report-only` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repos` | 否 | `''`（当前仓库） | 目标仓库（逗号分隔） |
| `severity-threshold` | 否 | `high` | 严重级别阈值 |
| `dry-run` | 否 | `true` | 试运行模式（Action 默认安全优先，CLI 默认 `false`） |
| `max-alerts-per-repository` | 否 | `10` | 每仓库最大告警数 |
| `github-token` | 是 | — | GitHub Token |
| `ai-api-token` | 否 | `''` | AI API Token（M5 联调） |
| `ai-api-base-url` | 否 | `''` | AI API Base URL（M5 联调） |

### Action 输出

| 输出 | 说明 |
|:-----|:-----|
| `report-artifact` | 上传的报告 artifact 名称 |

运行结束后，报告内容会写入 workflow summary，可从 `$GITHUB_STEP_SUMMARY` 查看。报告 artifact（保留 30 天）可在 Actions 运行页下载。

## CLI 参数

| 参数 | 别名 | 说明 | 默认值 |
|:-----|:-----|:-----|:-------|
| `mode` | （位置参数） | `report-only` / `fix` / `fix-and-pr` | `report-only` |
| `--repo` | `-r`, `--repository`, `--repositories` | 目标仓库（`owner/repo`），逗号分隔 | — |
| `--repos-file` | — | 从文件读取仓库列表（每行一个） | — |
| `--github-token` | — | GitHub PAT | `GITHUB_TOKEN` 环境变量 |
| `--severity-threshold` | — | `critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | — | 试运行，不写入文件。report-only 模式默认 `true` | `false`（fix/fix-and-pr） |
| `--create-pr` | — | 创建 Pull Request | `false` |
| `--max-alerts-per-repository` | — | 每仓库最大处理数 | `10` |
| `--commands` | — | 自定义验证命令（逗号分隔） | — |
| `--verbose` | — | 详细日志 | `false` |

## 报告

每次运行生成两种格式的报告：

- **Markdown**：`dependfix-report-YYYYMMDD-{runId}.md` — 包含汇总统计、按仓库明细、按严重级别统计、失败原因
- **JSON**：`dependfix-report-YYYYMMDD-{runId}.json` — 结构化完整数据

报告文件位于 `./dependfix-reports/` 目录。
