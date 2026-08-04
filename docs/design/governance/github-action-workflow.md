# T201 设计稿：GitHub Composite Action

> 对应任务: [T201 创建 Composite Action](../../plan/todo.md)
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
| `max-alerts-per-repository` | string | `20` | 每仓库最大告警数 |
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
│ Checkout 消费者仓库 │  actions/checkout@v7 → $GITHUB_WORKSPACE（T208 起内置）
└───────┬────────────┘
        ▼
┌────────────────┐
│ Setup pnpm     │  pnpm/action-setup@v6.0.9（版本读 packageManager 字段）
└───────┬────────┘
        ▼
┌────────────────┐
│ Setup Node.js  │  actions/setup-node@v7 (lts/*)
└───────┬────────┘
        ▼
┌────────────────┐
│ Install+Build  │  cd $GITHUB_ACTION_PATH && pnpm i && pnpm build
└───────┬────────┘
        ▼
┌────────────────┐
│ Run dependfix  │  cd $GITHUB_WORKSPACE && node $GITHUB_ACTION_PATH/packages/cli/dist/bin.mjs <mode> ...
└───────┬────────┘
        ▼
┌────────────────┐
│ Upload Report  │  actions/upload-artifact@v4（$GITHUB_WORKSPACE/dependfix-reports/）
└───────┬────────┘
        ▼
┌────────────────┐
│ Write Summary  │  cat report.md >> $GITHUB_STEP_SUMMARY
└────────────────┘
```

**workDir 语义（T208）**：修复、提交、推送全部作用于 `$GITHUB_WORKSPACE`（消费者仓库 checkout）；`$GITHUB_ACTION_PATH`（即 Actions 表达式 `github.action_path` 的值）仅承载 action 自身代码（install/build/CLI bin 入口）。修复对象、alerts 来源与 PR 归属仓库三者保持一致。

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
| Token 暴露 | 通过 `inputs.github-token` / `inputs.dependabot-alerts-token` 传入，仅在 `env` 中使用（alerts token 不经命令行，避免进程列表泄露） |
| 输出脱敏 | `sanitizeOutput()` 过滤敏感信息 |
| 权限最小化 | 消费者按需配置 permissions；Dependabot alerts 用最小权限专用 token（G2 双 token 设计） |
| Action 来源 | 固定版本标签（`@v1`），避免跟踪 `@master` |
| Prompt 防护 | 见 T206（M2 后续） |

---

## 6. 告警数据源与 Token 策略（G2）

> 完整调研与方案矩阵见 [G2](../../plan/todo-archive.md#g2-处置记录-github_token-无法访问-dependabot-alerts) 与 [调研文档](../../research/2026-08-04-github-token-dependabot-bug-or-design.md)。

**核心事实**：`GITHUB_TOKEN` **永远无法**访问 Dependabot alerts API——`vulnerability-alerts` 是 GitHub App-only 权限，Actions 权限模型从未支持（故意设计 + 官方文档误导）。

| 数据源 | Token 要求 | 状态 |
|:---|:---|:---|
| Dependabot alerts API | PAT（classic `security_events` / fine-grained `Dependabot alerts: read`）或 GitHub App installation token | 需要消费者提供；GITHUB_TOKEN 不可用（恒 403） |
| Code Scanning alerts API | `security-events: read`（GITHUB_TOKEN 可用） | ✅ 已验证（探针 2026-08-04：HTTP 200），M3 无需额外 token 方案 |
| pnpm audit（fallback） | 无 | 本地数据源候选：`pnpm audit --json` 归一化接入（severity 映射 + alert 结构映射 + 去重，参考 security-alert-remediator 的 `collect-security-alerts.mjs`） |

**设计原则**：
- ✅ 双 token 设计已落地（T-G2-3）：`dependabot-alerts-token` input（最小权限 fine-grained PAT，仅 `Dependabot alerts: read`）经 env 传递，CLI 内 fetch alerts 用专用 client，其余操作走 `github-token`（GITHUB_TOKEN）；缺省回退主 token
- action 文档必须明确告知消费者：Dependabot alerts 需要 PAT / GitHub App token，仅给 GITHUB_TOKEN 会静默空跑
- ✅ fetch 阶段 401/403 已硬失败（T-G2-1，commit a9e61b8）：退出码非零（无成功 → 2）+ `dependabotAlertsTokenHint` 指引
- pnpm audit 回退（若采纳）标注数据源，不与 GitHub API 数据混同去重

---

## 7. 边界与异常处理

| 场景 | 预期行为 |
|:---|:---|
| 仓库无 Dependabot 告警 | 报告输出 0 alerts，workflow 成功退出（exit 0） |
| `GITHUB_TOKEN` 访问 Dependabot alerts | ⚠️ **恒 403 `Resource not accessible by integration`**：Actions App 无 Dependabot alerts 权限，`permissions: security-events` 无法授予（与官方文档矛盾，社区 #60612 未修复）。必须使用带 `security_events`（classic PAT）/ `Dependabot alerts: read`（fine-grained PAT）或 GitHub App token。详见 [G2](../../plan/todo-archive.md#g2-处置记录-github_token-无法访问-dependabot-alerts) |
| 其他 fetch 权限错误（401/403，非 GITHUB_TOKEN 固有限制） | ✅ 已修复（T-G2-1）：CLI 硬失败退出（无成功 → exit 2），错误信息附 token 指引 |
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
