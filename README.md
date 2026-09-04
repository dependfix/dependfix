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

> 自动化处理 GitHub Dependabot / Code Scanning 安全告警中那些简单、重复但数量庞大的修复工作。

## 功能

- **告警获取**：自动拉取 Dependabot / Code Scanning alerts，按严重级别过滤
- **自动修复**：依赖升级、pnpm frozen-lockfile 修复与验证（lint / build）
- **报告输出**：Markdown + JSON 双格式报告，可归档、可审计
- **PR 创建**：`fix-and-pr` 模式自动创建修复分支并提交 Pull Request
- **多仓库支持**：按 owner / org 自动发现仓库（topic / glob 过滤），支持批量修复
- **多入口**：CLI、GitHub Action、MCP Server、Agent Skill、管理平台（i18n）

## 快速开始

```bash
# 无需安装直接运行
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN

# 全局安装后修复并创建 PR
pnpm add -g dependfix
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

完整命令与参数说明见 [CLI 包 README](packages/cli/README.md)。

## 使用方式

| 方式 | 说明 | 文档 |
| |:-----|:-----|:-----|
| CLI | 命令行工具，支持 `report-only` / `fix` / `fix-and-pr` 三种模式 | [packages/cli/README.md](packages/cli/README.md) |
| GitHub Action | 通过 `uses: dependfix/dependfix@v1` 一行接入 CI，支持定时与手动触发 | [快速开始 → GitHub Action](docs/guide/quick-start.md#github-action-使用) |
| MCP Server | 将扫描 / 修复能力暴露给 AI 编程助手（Claude / Copilot / Cursor 等） | [packages/mcp/README.md](packages/mcp/README.md) |
| Agent Skill | `dependfix-remediator` 可分发给主流 AI 编码工具，对话式驱动修复闭环 | [packages/skills/README.md](packages/skills/README.md) |
| 管理平台 | 集中管理平台，支持简体中文 / English 双语 | [系统架构 → 平台架构](docs/design/governance/architecture.md#平台架构-apps-platform) |
| **PR Check 监测**（M24.1）| 管理平台内置模块：监测 dependfix / dependabot PR 的 CI Test check 状态，CI 跑挂时通过 alerts firing + UI ack；与 mergify 自动合并互不干扰 | [archive/todo-archive-phases-m24.md §M24.1](docs/plan/archive/todo-archive-phases-m24.md#m241-p1--能力-pr-check-状态监测-mvp7-commits--5-phase-串行--2637-行) |

## 仓库结构

dependfix 采用 pnpm workspace Monorepo 布局：`packages/` 为核心库与可分发入口（core / engine / cli / mcp / skills），`apps/platform` 为管理平台，`docs/` 为 VitePress 文档站。详细结构见 [系统架构 → 项目组成](docs/design/governance/architecture.md#项目组成)。

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
- [PR 自动合并配置](docs/guide/auto-merge.md)
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
