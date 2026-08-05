# 快速开始

## 前置要求

- Node.js >= 20
- pnpm（推荐最新稳定版）
- GitHub Token（用于告警拉取和 PR 创建；**本地无 token 也可用 `--alerts-source pnpm-audit` 回退**，见 [本地无 token 场景](#本地无-token-场景pnpm-audit-回退)）
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

执行完整修复流程后，自动创建 `dependfix/auto-fix-{内容指纹}` 分支（指纹为修复内容 sha256 前 8 位）、提交变更、推送并创建 Pull Request。PR body 包含修复摘要、变更列表和验证结果。

**PR 去重（v0.2 起）**：同一修复内容（同告警集）重复运行不会重复提 PR；修复内容变化时自动关闭旧 PR 并创建新 PR（新 PR body 注明 `Supersedes`），同一时刻只有一条最新的 dependfix PR。

### 清理已合并的分支

```bash
dependfix cleanup-branches --repo owner/repo --github-token $GITHUB_TOKEN
```

列出远端 `dependfix/` 前缀分支并按状态分类（已合并 / 已关闭 / open 保留），**交互式确认（y/N）后**才删除。非交互环境（CI/管道）默认拒绝删除。

`fix-and-pr` 模式加 `--cleanup-branches` 可只把已合并分支列为待清理清单（写入报告，不删除）：

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN --cleanup-branches
```

### 批量仓库

```bash
# 逗号分隔多个仓库
dependfix fix --repo owner/repo-a,owner/repo-b --github-token $GITHUB_TOKEN

# 从文件读取仓库列表
dependfix fix --repos-file ./repos.txt --github-token $GITHUB_TOKEN
```

### 本地无 token 场景（pnpm-audit 回退）

无 GitHub token（或无法获得 Dependabot alerts 权限）时，可用本地 `pnpm audit` 作为告警数据源——零凭证、非 GitHub 仓库目录也可用：

```bash
cd /path/to/your-repo
dependfix report-only --alerts-source pnpm-audit
dependfix fix --alerts-source pnpm-audit --commit
```

- repository 解析优先级：显式 `--repo` → git remote（无 token 不代表无 remote）→ `local` 兜底
- 报告 Header 明确标注 `Alert Source: pnpm-audit`；告警 `source` 均为 `pnpm-audit`，与 GitHub 数据源可区分
- 限制：仅 `report-only` / `fix` 模式（`fix-and-pr` 需 GitHub PR）；最多 1 个 `--repo`
- 403（有 token 但权限不足）**不会**自动降级——仍硬失败并提示可切换 `--alerts-source pnpm-audit`
- 详见 [pnpm audit fallback 设计](../design/packages/pnpm-audit-fallback.md)

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
          # mode 默认已是 fix-and-pr（可省略），此处显式声明
          mode: fix-and-pr
          severity-threshold: high
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # ⚠️ GITHUB_TOKEN 无法读取 Dependabot alerts API（GitHub App-only 权限，恒 403）。
          # 需配置最小权限 fine-grained PAT（仅 Dependabot alerts: read）作为专用 token：
          # GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens，
          # Repository permissions → Dependabot alerts → Read-only。
          dependabot-alerts-token: ${{ secrets.GH_PAT }}
          # 可选：同时拉取 Code Scanning alerts（与 Dependabot 并行源；
          # 需权限 security-events: read，GITHUB_TOKEN 默认具备）
          code-scanning: true
```

> **⚠️ 破坏性变更（v0.2 起）**：Action 默认 `mode` 由 `report-only` 改为 `fix-and-pr`（`dry-run` 默认由 `true` 改为 `false`）。存量消费者未显式传参时，行为从"仅生成报告"变为"自动创建修复分支与 PR"（PR 不自动合并，可安全审查）。需要仅报告时可显式传 `mode: report-only` 或 `dry-run: true`。迁移后请确认 workflow `permissions` 已包含 `contents: write` + `pull-requests: write`（见上方示例）。
>
> 💡 **分支清理建议**：① 在仓库设置开启 **Settings → General → Pull Requests → "Automatically delete head branches"**（PR 合并后自动删除 head 分支）；② 或在 workflow 中开启 `cleanup-branches-auto: true`（每次运行结束后自动删除已合并/已关闭的 `dependfix/` 分支，不删有 open PR 的分支）。

### Action 输入参数

| 参数 | 必填 | 默认值 | 说明 |
|:-----|:----:|:------|:-----|
| `mode` | 否 | `fix-and-pr` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repos` | 否 | `''`（当前仓库） | 目标仓库（逗号分隔） |
| `severity-threshold` | 否 | `high` | 严重级别阈值 |
| `dry-run` | 否 | `false` | 试运行模式（Action 默认自动修复并提 PR；CLI 本地默认仅报告，即 report-only 下 dry-run=true） |
| `max-alerts-per-repository` | 否 | `20` | 每仓库最大告警数 |
| `cleanup-branches` | 否 | `false` | （fix-and-pr 模式）结束后将已合并的 dependfix 分支列入报告待清理清单（不自动删除） |
| `cleanup-branches-auto` | 否 | `false` | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） |
| `github-token` | 是 | — | GitHub Token（commit/push/PR 等操作；Dependabot alerts 读取不可用，见下行） |
| `dependabot-alerts-token` | 否 | `''` | Dependabot alerts 专用最小权限 token（fine-grained PAT，仅 `Dependabot alerts: read`；缺省回退 `github-token`。GITHUB_TOKEN 恒 403） |
| `code-scanning` | 否 | `false` | 同时拉取 Code Scanning alerts（与 Dependabot 并行源，默认关闭；需 token 具备 `security-events: read`，GITHUB_TOKEN 默认具备） |
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
| `mode` | （位置参数） | `report-only` / `fix` / `fix-and-pr` / `cleanup-branches` | `report-only` |
| `--repo` | `-r`, `--repository`, `--repositories` | 目标仓库（`owner/repo`）。在 git 仓库内可自动推断 | — |
| `--repos-file` | — | 从文件读取仓库列表（每行一个） | — |
| `--github-token` | — | GitHub PAT | `GITHUB_TOKEN` 环境变量 |
| `--alerts-token` | — | Dependabot alerts 专用最小权限 token（可选，仅 `Dependabot alerts: read`；缺省回退 `--github-token`。GITHUB_TOKEN 无法读取 Dependabot alerts） | `DEPENDFIX_ALERTS_TOKEN` 环境变量 |
| `--alerts-source` | — | 告警数据源：`github-dependabot`（默认）/ `pnpm-audit`（本地无 token 回退，扫描当前工作区 lockfile；不要求 token / git remote；repository 解析 `--repo` → git remote → `local`） | `DEPENDFIX_ALERTS_SOURCE` 环境变量 |
| `--severity-threshold` | — | `critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | — | 试运行，不写入文件。report-only 模式默认 `true` | `false`（fix/fix-and-pr） |
| `--create-pr` | — | 创建 Pull Request | `false` |
| `--commit` | — | 修复完成后在本地当前分支直接提交（仅 fix 模式；不推送、不创建 PR） | `false` |
| `--cleanup-branches` | — | （fix-and-pr 模式）结束后列出已合并的 dependfix 分支到报告，不自动删除 | `false` |
| `--cleanup-branches-auto` | — | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） | `false` |
| `--max-alerts-per-repository` | — | 每仓库最大处理数 | `20` |
| `--code-scanning` | — | 同时拉取 Code Scanning alerts（与 Dependabot 并行源；需要 token 具备 `security-events: read`，GITHUB_TOKEN 默认具备） | `false`（env `DEPENDFIX_CODE_SCANNING`） |
| `--commands` | — | 自定义验证命令（逗号分隔） | — |
| `--verbose` | — | 详细日志 | `false` |

## 报告

每次运行生成两种格式的报告：

- **Markdown**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md` — 包含汇总统计、按仓库明细、按严重级别统计、失败原因
- **JSON**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.json` — 结构化完整数据

文件名中的 `HHmmss` 为运行开始时刻（UTC），`{runId尾段}` 为 runId 最后一个 `-` 分隔段（最多 8 字符）。日期 + 时刻保证按文件名排序即按运行时间排序，便于定位最新报告。

报告文件位于 `./dependfix-reports/` 目录。
