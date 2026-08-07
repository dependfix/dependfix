<h1 align="center">dependfix</h1>
<p>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/dependfix/dependfix.svg" />
  <a href="https://github.com/dependfix/dependfix/actions?query=workflow%3ARelease" target="_blank">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/dependfix/dependfix/release.yml?branch=master">
  </a>
  <a href="https://app.codecov.io/gh/dependfix/dependfix" target="_blank">
    <img alt="Codecov" src="https://img.shields.io/codecov/c/github/dependfix/dependfix?branch=master">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" />
  <a href="https://github.com/dependfix/dependfix#readme" target="_blank">
    <img alt="Documentation" src="https://img.shields.io/badge/documentation-yes-brightgreen.svg" />
  </a>
  <a href="https://github.com/dependfix/dependfix/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/dependfix/dependfix/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/dependfix/dependfix?color=yellow" />
  </a>
</p>

> 自动化处理 Dependabot / Code Scanning 安全告警中那些简单、重复但数量庞大的修复工作。

## 功能

- **告警获取**：自动拉取 GitHub Dependabot alerts，按严重级别过滤
- **自动修复**：依赖升级、`pnpm frozen-lockfile` 修复、验证（lint/build）
- **报告输出**：Markdown + JSON 双格式报告，包含修复摘要与失败原因
- **PR 创建**：`fix-and-pr` 模式下自动创建修复分支并提交 Pull Request
- **GitHub Action**：通过 `uses: dependfix/dependfix@v1` 一行接入，支持定时和手动触发
- **多仓库**：支持单仓库、批量仓库修复，可对 GitHub Organization / 用户自动发现仓库（`--owner`，含 topic / glob 过滤）
- **Agent Skill**：`dependfix-remediator` 可分发给主流 AI 编码工具（Claude Code / Copilot / Cursor / OpenCode），对话式驱动修复闭环

## 快速开始

```bash
# 直接运行（无需安装）
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN

# 全局安装
pnpm add -g dependfix

# 查看报告
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN

# 修复告警
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high

# 修复并创建 PR
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN

# GitHub Organization / 用户自动发现仓库（与 --repo 合并去重，显式优先）
dependfix fix-and-pr --owner your-org --github-token $GITHUB_TOKEN
```

## Agent Skill 安装

dependfix 提供可分发的 Agent Skill（`dependfix-remediator`），安装后 AI 助手可直接对话式完成"拉告警 → 研判 → 修复 → 报告"闭环，无需手工执行命令。

### 主通道（推荐，npx skills 生态）

```bash
npx skills add dependfix/dependfix -s dependfix-remediator -g -a claude-code -a opencode -a cursor
```

一条命令完成安装，自动写入本机已检测 agent 工具的官方 skills 目录（支持 70+ agents，`-a` 可省略以自动选择）。发布即 git push——仓库根 `skills/` 目录由 npx skills 生态自动发现，无需提交 registry。

### 兜底安装（离线 / 无 npx skills 环境）

```bash
npx dependfix skills install     # 检测本机已装 agent 工具并安装（默认全局；--project 装到当前项目）
npx dependfix skills doctor      # 检查安装状态、目录约定漂移与内部 skill 标记完整性
```

`skills install` 不依赖 npx skills：复制产品 skill 到各 agent 官方目录并输出安装清单，可重复执行（幂等）；目标存在内容不一致的同名 skill 时会要求确认覆盖（非交互环境默认跳过，用 `--force` 强制覆盖）。flag 请写在子命令之后（标准写法 `skills install --project`）。

## GitHub Action 使用

在你的仓库中创建 `.github/workflows/dependfix.yml`：

```yaml
name: Weekly Security Scan
on:
  schedule:
    - cron: '0 6 * * 1'   # 每周一 UTC 6:00
  workflow_dispatch:        # 手动触发

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
          # ⚠️ GITHUB_TOKEN 无法读取 Dependabot alerts API（GitHub App-only 权限）。
          # 建议配置最小权限 fine-grained PAT（仅 Dependabot alerts: read）：
          # GitHub → Settings → Developer settings → Fine-grained tokens，
          # Repository permissions → Dependabot alerts → Read-only。
          dependabot-alerts-token: ${{ secrets.GH_PAT }}
          # 可选：同时拉取 Code Scanning alerts（与 Dependabot 并行源；
          # 需权限 security-events: read，GITHUB_TOKEN 默认具备）
          code-scanning: true
```

> `fix-and-pr` 模式需要 `contents: write` + `pull-requests: write` 权限。仅 `report-only` 模式可降为只读。`dependabot-alerts-token` 缺省时回退使用 `github-token`（本地完整 PAT 场景可用）。
>
> 💡 **分支清理建议**：① 在仓库设置开启 **Settings → General → Pull Requests → "Automatically delete head branches"**（PR 合并后 GitHub 自动删除 head 分支）；② 或在 workflow 中开启 `cleanup-branches-auto: true`（dependfix 在每次运行结束后自动删除已合并/已关闭的 `dependfix/` 分支，不删有 open PR 的分支）。

## GitHub Organization 支持

通过 `--owner`（或 `DEPENDFIX_OWNER`）自动发现组织 / 用户下的仓库，与显式 `--repo` 合并去重（显式优先）：

```bash
# 自动发现 org 下全部仓库：报告 → 修复 → 创建 PR
dependfix fix-and-pr --owner your-org --github-token $GITHUB_TOKEN

# 多个 owner / org 混合（用户 + 组织）
dependfix fix-and-pr --owner your-org,your-user --github-token $GITHUB_TOKEN

# 限定发现范围：topic 白名单（AND）+ 仓库 glob 白名单
dependfix fix-and-pr --owner your-org --repo-topics security-tracked --repo-include "your-org/*" --github-token $GITHUB_TOKEN

# 先报告确认范围，再执行修复
dependfix report-only --owner your-org --github-token $GITHUB_TOKEN
```

**发现机制**：先查询 `GET /users/{owner}` 判断主体类型（Organization / User），组织走 `GET /orgs/{org}/repos`、用户走 `GET /users/{user}/repos`；随后按顺序过滤——archived / disabled / fork 剔除 → topic 白名单（AND）→ include / exclude / topicsExclude 名单策略 → 探测 `.github/dependabot.yml`（仅候选仓库，并发受限）。结果按 `owner/repo` 字典序排序，多次运行结果一致（runId / 报告指纹稳定性前提）。

**token 权限要求**（org 场景）：

| 能力 | classic PAT | fine-grained PAT |
|:---|:---|:---|
| 发现 + 修复 + PR | `repo`（含 `security_events`） | `Contents: read/write` + `Pull requests: read/write`（自动附带 `Metadata: read`） |
| Dependabot alerts | `security_events` | `Dependabot alerts: read`（GITHUB_TOKEN 无法读取该 API，见 [G2 处置记录](docs/plan/todo-archive.md#g2-处置记录-github_token-无法访问-dependabot-alerts)） |
| Code Scanning（可选） | `security_events` | `Security events: read` |

> 启用 SAML SSO 的组织：classic PAT 需在 GitHub 网页对组织逐个 **Enable SSO**；fine-grained PAT 需组织管理员授权仓库范围。私有 org 仓库仅返回 token 可见范围内的仓库——`--owner` 发现不保证覆盖全部私有仓库，需按仓库授权。

**限制与边界**：

- GitHub Action 内 `GITHUB_TOKEN` 仅能访问当前仓库——跨仓库 org 发现 / 修复必须提供独立 PAT（`github-token` 输入），或为每个仓库单独配置 action。
- `cleanup-branches` 模式不支持 `--owner`（分支清理需明确目标仓库，配置校验 fail-fast）。
- 修复分支直接推送到目标仓库（同仓库内创建 PR，无需 fork）；org 仓库需确保 token 有 `Contents: write`。
- 当前仅支持 PAT 认证（classic / fine-grained）；GitHub App / installation token 认证、发现规模上限（max-repos）、org 级 alerts API 已在 [backlog.md](docs/plan/backlog.md) 登记为增强候选。

## CLI 参数

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `mode` | 运行模式：`report-only` / `fix` / `fix-and-pr` | `report-only` |
| `--repo`, `-r` | 目标仓库（`owner/repo`），逗号分隔多个 | — |
| `--repos-file` | 从文件读取仓库列表（每行一个） | — |
| `--owner` | owner / org 自动发现仓库（逗号分隔多个或多次传入；与 `--repo` 合并去重，显式优先；仅 github-dependabot 数据源可用） | `DEPENDFIX_OWNER` 环境变量 |
| `--repo-topics` | 发现结果 topic 白名单（逗号分隔，AND 语义；仅影响 `--owner` 发现结果） | `DEPENDFIX_REPO_TOPICS` 环境变量 |
| `--repo-include` | 仓库白名单 glob（如 `owner/*`、`owner/pkg-*`；仅作用于发现结果） | `DEPENDFIX_REPO_INCLUDE` 环境变量 |
| `--repo-exclude` | 仓库黑名单 glob（显式列表与发现结果均受约束；与 include 冲突时 exclude 胜出） | `DEPENDFIX_REPO_EXCLUDE` 环境变量 |
| `--repo-topics-exclude` | 发现结果 topic 黑名单（排除含任一指定 topic 的仓库；仅作用于发现结果） | `DEPENDFIX_REPO_TOPICS_EXCLUDE` 环境变量 |
| `--github-token` | GitHub Personal Access Token | `GITHUB_TOKEN` 环境变量 |
| `--alerts-token` | Dependabot alerts 专用最小权限 token（可选，仅 `Dependabot alerts: read`；缺省回退 `--github-token`。GITHUB_TOKEN 无法读取 Dependabot alerts） | `DEPENDFIX_ALERTS_TOKEN` 环境变量 |
| `--severity-threshold` | 严重级别阈值：`critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | 试运行，不实际修改文件（report-only 模式默认 `true`） | 依模式而定 |
| `--create-pr` | 创建 Pull Request（fix-and-pr 模式自动启用） | `false` |
| `--commit` | 修复完成后在本地当前分支直接提交（仅 fix 模式；不推送、不创建 PR） | `false` |
| `--cleanup-branches` | （fix-and-pr 模式）结束后列出已合并的 dependfix 分支到报告，不自动删除 | `false` |
| `--cleanup-branches-auto` | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） | `false` |
| `--max-alerts-per-repository` | 每仓库最大告警处理数 | `20` |
| `--code-scanning` | 同时拉取 Code Scanning alerts（与 Dependabot 并行源；需要 token 具备 `security-events: read`，GITHUB_TOKEN 默认具备） | `false`（env `DEPENDFIX_CODE_SCANNING`） |
| `--upgrade-groups` | 用户显式依赖分组（覆盖自动分组），格式 `"name1:pkg1,pkg2;name2:pkg3"`（分号分隔组、冒号分隔组名与包列表、逗号分隔包名） | 自动分组（dependabot.yml groups → @types 归并 → scope/前缀启发式） |
| `--commands` | 自定义验证命令（逗号分隔） | — |
| `--verbose` | 详细日志输出 | `false` |

## 项目结构

```
dependfix/                          # pnpm workspace Monorepo
├── packages/
│   ├── core/                       # @dependfix/core — 核心领域模型库
│   │   └── src/                    # 告警模型、过滤器、规划器、报告生成、日志
│   └── cli/                        # dependfix — CLI 应用入口
│       └── src/                    # 命令行参数解析、GitHub 集成、依赖修复、验证执行
├── docs/                           # VitePress 文档站
├── .github/                        # CI/CD 工作流与 Action 定义
└── action.yml                      # GitHub Composite Action 入口
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm typecheck

# Lint
pnpm lint

# 测试
pnpm test
```

## 文档

详细文档请访问 [VitePress 文档站](https://dependfix.cmyr.dev)，或直接查看：

- [快速开始](docs/guide/quick-start.md)
- [配置说明](docs/guide/configuration.md)
- [技术栈详解](docs/guide/tech-stack.md)
- [系统架构](docs/design/governance/architecture.md)
- [路线图](docs/plan/roadmap.md)
- [当前阶段任务](docs/plan/todo.md)

## 作者

**CaoMeiYouRen**

* GitHub: [@CaoMeiYouRen](https://github.com/CaoMeiYouRen)

## 贡献

欢迎贡献、提问或提出新功能！<br />
如有问题请查看 [issues page](https://github.com/dependfix/dependfix/issues)。<br />
贡献或提出新功能请查看 [contributing guide](https://github.com/dependfix/dependfix/blob/master/CONTRIBUTING.md)。

## 支持

如果觉得这个项目有用的话请给一颗 ⭐️，非常感谢

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=dependfix/dependfix&type=Date)](https://star-history.com/#dependfix/dependfix&Date)

## License

Copyright © 2026 [CaoMeiYouRen](https://github.com/CaoMeiYouRen).<br />
This project is [MIT](https://github.com/dependfix/dependfix/blob/master/LICENSE) licensed.
