# T201 设计稿：GitHub Composite Action

> 对应任务: [T201 创建 Composite Action](../plan/todo.md)
>
> **选型结论**: 使用 GitHub Composite Action（`action.yml`），通过 `uses: dependfix/dependfix@v1` 被其他仓库引用。Composite Action 可组合多个 workflow steps 为单一可复用单元，无需 Docker 或 JavaScript 封装。

---

## 1. 设计目标

- 将 `dependfix` CLI 封装为可复用的 GitHub Composite Action
- 消费者仓库通过一行 `uses:` 引用即可接入安全告警自动修复
- Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- 输出报告 artifact 和 workflow summary
- 支持 `fix-and-pr` 模式（创建修复分支并提交 PR）

---

## 2. Action 定义（action.yml）

### 2.1 元数据

```yaml
name: 'Dependfix Security Auto Fix'
description: 'Automated remediation of Dependabot security alerts'
author: 'CaoMeiYouRen'
branding:
  icon: 'shield'
  color: 'green'
```

### 2.2 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `mode` | string | `fix-and-pr`（T209 起） | 运行模式：`report-only` / `fix` / `fix-and-pr`；**破坏性变更**：存量消费者未显式传参时从"仅报告"变为"自动提 PR"（不自动合并） |
| `repos` | string | `''`（空=当前仓库） | 逗号分隔的目标仓库 |
| `severity-threshold` | string | `high` | 严重级别阈值 |
| `dry-run` | string | `false`（T209 起，与 fix-and-pr 互斥配套） | 试运行模式 |
| `max-alerts-per-repository` | string | `10` | 每仓库最大告警数 |
| `cleanup-branches` | string | `false`（T211 起） | fix-and-pr 结束后将已合并的 dependfix 分支列入报告待清理清单（不自动删除） |
| `github-token` | string | **必填** | GitHub Token（需 security-events 权限） |

### 2.3 输出

| 输出 | 说明 |
|:---|:---|
| `report-artifact` | 上传的报告 artifact 名称 |

### 2.4 消费方式

```yaml
# 消费者仓库的 .github/workflows/dependfix.yml
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
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **T208 起 action 内置 `actions/checkout@v5`**：消费者仓库自动 checkout 到 `$GITHUB_WORKSPACE`，无需消费者显式写 checkout 步骤（重复 checkout 幂等）。
>
> **注意**：当前版本内置 checkout **无条件执行且使用固定默认参数**（`clean: true`、`fetch-depth: 1`、ref = `github.sha`），会重置并清理工作区；消费者自定义 checkout（`fetch-depth: 0`、submodules、sparse-checkout）**暂不可用**。如未来需要，建议增加 `skip-checkout` 输入或参数透传。

### 2.5 Dogfooding（自举验证）

dependfix 仓库自身通过 `.github/workflows/security-auto-fix.yml` 验证 Action：

```yaml
steps:
  - uses: actions/checkout@v5  # uses: ./ 的前置：action 自身代码需在工作区
  - uses: ./
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

> dogfooding 时 `uses: ./` 的 action_path 即 `$GITHUB_WORKSPACE`；action 内置的 checkout 步骤会再次 checkout 同一仓库（同 ref），行为与改动前一致。

---

## 3. 执行流程

```
┌────────────────────┐
│ Checkout 消费者仓库 │  actions/checkout@v5 → $GITHUB_WORKSPACE（T208 起内置）
└───────┬────────────┘
        ▼
┌────────────────┐
│ Setup pnpm     │  pnpm/action-setup@v4
└───────┬────────┘
        ▼
┌────────────────┐
│ Setup Node.js  │  actions/setup-node@v5 (lts/*)
└───────┬────────┘
        ▼
┌────────────────┐
│ Install+Build  │  cd ${{ github.action_path }} && pnpm i && pnpm build
└───────┬────────┘
        ▼
┌────────────────┐
│ Run dependfix  │  cd $GITHUB_WORKSPACE && node ${{ github.action_path }}/packages/cli/dist/bin.mjs <mode> ...
└───────┬────────┘
        ▼
┌────────────────┐
│ Upload Report  │  actions/upload-artifact@v4（${{ github.workspace }}/dependfix-reports/）
└───────┬────────┘
        ▼
┌────────────────┐
│ Write Summary  │  cat report.md >> $GITHUB_STEP_SUMMARY
└────────────────┘
```

**workDir 语义（T208）**：修复、提交、推送全部作用于 `$GITHUB_WORKSPACE`（消费者仓库 checkout）；`${{ github.action_path }}` 仅承载 action 自身代码（install/build/CLI bin 入口）。修复对象、alerts 来源与 PR 归属仓库三者保持一致。

---

## 4. 权限模型

> Composite Action 继承调用方 workflow 的 `permissions`。建议消费者配置：

```yaml
permissions:
  contents: write          # fix-and-pr 模式需要（创建分支 + 推送 commits）
  pull-requests: write     # fix-and-pr 模式需要（创建 PR）
  security-events: read    # 读取 Dependabot alerts
```

仅 `report-only` / `fix` 模式时可将 `contents`/`pull-requests` 降为 `read`。

## 5. 安全考量

| 维度 | 措施 |
|:---|:---|
| Token 暴露 | 通过 `inputs.github-token` 传入，仅在 `env` 中使用 |
| 输出脱敏 | `sanitizeOutput()` 过滤敏感信息 |
| 权限最小化 | 消费者按需配置 permissions |
| Action 来源 | 固定版本标签（`@v1`），避免跟踪 `@master` |
| Prompt 防护 | 见 T206（M2 后续） |

---

## 7. 边界与异常处理

| 场景 | 预期行为 |
|:---|:---|
| 仓库无 Dependabot 告警 | 报告输出 0 alerts，workflow 成功退出（exit 0） |
| `GITHUB_TOKEN` 权限不足 | `fetchDependabotAlerts` 抛出 `PERMISSION_DENIED`，workflow 失败 |
| pnpm 构建失败 | workflow 在 build 步骤失败，不执行 CLI |
| CLI 运行超时 | `timeout-minutes: 15` 触发，workflow 被取消 |
| `fix-and-pr` 模式 | M2 stub：输出提示 "not implemented in M1"，exit 0 |
| `dry-run=true` | 打印计划操作，不修改文件，报告包含 dry-run 标记 |

---

## 8. 与后续任务的接口

| 后续任务 | 本设计预留 |
|:---|:---|
| T202（参数对齐） | `inputs` 已覆盖 `mode`/`severity-threshold`/`dry-run`/`max-alerts-per-repository` |
| T203（报告 artifact） | `actions/upload-artifact@v4` 已集成，T203 只需调整 retention 和 summary |
| T204（分支与 PR） | `permissions` 区域注释了 `contents: write` + `pull-requests: write`，`fix-and-pr` 模式预留 |
| T205（AI Token） | 可通过 `inputs` 增加 `ai-api-token` 字段，`env` 区传入 CLI |

---

## 9. 实现文件

- 工作流定义: `.github/workflows/security-auto-fix.yml`
- 无需新增代码：完全复用 `packages/cli` 的 `dependfix` CLI
