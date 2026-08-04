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
- **多仓库**：支持单仓库、批量仓库修复

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
```

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
```

> `fix-and-pr` 模式需要 `contents: write` + `pull-requests: write` 权限。仅 `report-only` 模式可降为只读。`dependabot-alerts-token` 缺省时回退使用 `github-token`（本地完整 PAT 场景可用）。
>
> 💡 **分支清理建议**：① 在仓库设置开启 **Settings → General → Pull Requests → "Automatically delete head branches"**（PR 合并后 GitHub 自动删除 head 分支）；② 或在 workflow 中开启 `cleanup-branches-auto: true`（dependfix 在每次运行结束后自动删除已合并/已关闭的 `dependfix/` 分支，不删有 open PR 的分支）。

## CLI 参数

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `mode` | 运行模式：`report-only` / `fix` / `fix-and-pr` | `report-only` |
| `--repo`, `-r` | 目标仓库（`owner/repo`），逗号分隔多个 | — |
| `--repos-file` | 从文件读取仓库列表（每行一个） | — |
| `--github-token` | GitHub Personal Access Token | `GITHUB_TOKEN` 环境变量 |
| `--alerts-token` | Dependabot alerts 专用最小权限 token（可选，仅 `Dependabot alerts: read`；缺省回退 `--github-token`。GITHUB_TOKEN 无法读取 Dependabot alerts） | `AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN` 环境变量 |
| `--severity-threshold` | 严重级别阈值：`critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | 试运行，不实际修改文件（report-only 模式默认 `true`） | 依模式而定 |
| `--create-pr` | 创建 Pull Request（fix-and-pr 模式自动启用） | `false` |
| `--commit` | 修复完成后在本地当前分支直接提交（仅 fix 模式；不推送、不创建 PR） | `false` |
| `--cleanup-branches` | （fix-and-pr 模式）结束后列出已合并的 dependfix 分支到报告，不自动删除 | `false` |
| `--cleanup-branches-auto` | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） | `false` |
| `--max-alerts-per-repository` | 每仓库最大告警处理数 | `20` |
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
- [系统架构](docs/design/architecture.md)
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
