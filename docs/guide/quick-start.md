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
# 在 git 仓库内运行时，--repo 可自动推断
cd /path/to/your-repo
dependfix report-only --github-token $GITHUB_TOKEN

# 手动指定仓库
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

报告将生成至 `./dependfix-reports/` 目录（Markdown + JSON 双格式）。

### 修复模式

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high
```

执行依赖升级和 lockfile 修复，修改仅限本地文件，默认不提交。

加 `--commit` 可在修复完成后直接提交到当前分支（不推送、不创建 PR）：

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --commit
```

> 注意：`--commit` 会提交工作区**所有**未提交变更（包括用户已有改动与验证失败的修复），建议在干净工作区上运行。

### 修复并创建 PR

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

执行完整修复流程后，自动创建 `dependfix/auto-fix-{runId尾段}` 分支（尾段为 runId 最后一个 `-` 分隔段，最多 8 字符）、提交变更、推送并创建 Pull Request。PR body 包含修复摘要、变更列表和验证结果。

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
      - uses: dependfix/dependfix@v1
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
| `--repo` | `-r`, `--repository`, `--repositories` | 目标仓库（`owner/repo`）。在 git 仓库内可自动推断 | — |
| `--repos-file` | — | 从文件读取仓库列表（每行一个） | — |
| `--github-token` | — | GitHub PAT | `GITHUB_TOKEN` 环境变量 |
| `--severity-threshold` | — | `critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | — | 试运行，不写入文件。report-only 模式默认 `true` | `false`（fix/fix-and-pr） |
| `--create-pr` | — | 创建 Pull Request | `false` |
| `--commit` | — | 修复完成后在本地当前分支直接提交（仅 fix 模式；不推送、不创建 PR） | `false` |
| `--max-alerts-per-repository` | — | 每仓库最大处理数 | `10` |
| `--commands` | — | 自定义验证命令（逗号分隔） | — |
| `--verbose` | — | 详细日志 | `false` |

## 报告

每次运行生成两种格式的报告：

- **Markdown**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md` — 包含汇总统计、按仓库明细、按严重级别统计、失败原因
- **JSON**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.json` — 结构化完整数据

文件名中的 `HHmmss` 为运行开始时刻（UTC），`{runId尾段}` 为 runId 最后一个 `-` 分隔段（最多 8 字符）。日期 + 时刻保证按文件名排序即按运行时间排序，便于定位最新报告。

报告文件位于 `./dependfix-reports/` 目录。
