# T201 设计稿：GitHub Action 工作流

> 对应任务: [T201 新增 GitHub Action 工作流](../plan/backlog.md#t201-新增-github-action-工作流)
>
> **选型结论**: 使用标准 GitHub Actions YAML 工作流，构建于 `ubuntu-latest`，通过 `workflow_dispatch` + `schedule` 双触发，复用 `dependfix` CLI 编排管线。

---

## 1. 设计目标

- 将 M1 完成的 `dependfix` CLI 能力接入 GitHub Actions，支持手动触发和定时运行
- 工作流在目标仓库内运行，扫描当前仓库自身的 Dependabot 告警
- 使用 GitHub Actions 自动注入的 `GITHUB_TOKEN` 完成 API 认证（零额外配置）
- 输出 Markdown / JSON 报告为 workflow artifact，可在 Actions 页面下载
- 为 T204（分支与 PR 创建）预留 `contents: write` + `pull-requests: write` 权限扩展点

---

## 2. 触发方式

### 2.1 workflow_dispatch（手动触发）

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `mode` | choice | `report-only` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `severity-threshold` | choice | `high` | 严重级别阈值：`critical` / `high` / `medium` / `all` |
| `dry-run` | boolean | `true` | 仅在 `fix` 模式下生效；`true` 时不修改文件 |
| `max-alerts-per-repository` | string | `10` | 每仓库最多处理的告警数 |
| `repos` | string | `''`（空 = 当前仓库） | 逗号分隔的目标仓库（`owner/repo`），留空使用 `github.repository` |

> `fix-and-pr` 模式在 M2 阶段仍为 stub，选择后将输出提示信息但不创建 PR（T204 实现后可用）。

### 2.2 schedule（定时触发）

- **cron**: `0 6 * * 1`（每周一 UTC 6:00，北京时间 14:00）
- 定时运行时使用默认参数：`mode=report-only, severity-threshold=high, dry-run=true`
- 目的：每周自动生成安全告警报告，不自动修改代码

---

## 3. 权限模型

### 3.1 最小权限（M2 当前）

```yaml
permissions:
  contents: read          # 读取仓库代码（checkout + 构建）
  security-events: read   # 读取 Dependabot alerts API
```

### 3.2 扩展权限（T204 实现后）

```yaml
permissions:
  contents: write         # 创建分支 + 推送 commits
  pull-requests: write    # 创建 PR
  security-events: read   # 读取 Dependabot alerts
```

> `GITHUB_TOKEN` 由 GitHub Actions 自动注入，无需用户配置。Token 仅在当前仓库内有效（不可跨仓库扫描）。

---

## 4. 运行环境

| 组件 | 版本 | 说明 |
|:---|:---|:---|
| `runs-on` | `ubuntu-latest` | GitHub Actions 标准 Linux 镜像 |
| Node.js | `>= 20` | 通过 `actions/setup-node@v4` 安装 |
| pnpm | latest | 通过 `pnpm/action-setup@v4` 安装，自动读 `packageManager` |
| `timeout-minutes` | `15` | 超时保护，避免长时间运行的修复流程卡死 |

`GITHUB_TOKEN` 通过 `${{ secrets.GITHUB_TOKEN }}` 传入 CLI 环境变量。

---

## 5. 执行流程

```
┌──────────────┐
│   Checkout   │  actions/checkout@v4
└──────┬───────┘
       ▼
┌──────────────┐
│ Setup pnpm   │  pnpm/action-setup@v4
└──────┬───────┘
       ▼
┌──────────────┐
│ Setup Node   │  actions/setup-node@v4 (node 20, cache: pnpm)
└──────┬───────┘
       ▼
┌──────────────┐
│  pnpm i -f   │  安装依赖（frozen-lockfile）
└──────┬───────┘
       ▼
┌──────────────┐
│  pnpm build  │  构建 core + cli 两个包
└──────┬───────┘
       ▼
┌──────────────┐
│   Run CLI    │  pnpm dependfix <mode> --repo $REPO ...
└──────┬───────┘
       ▼
┌──────────────┐
│ Upload Rep.  │  actions/upload-artifact@v4
└──────────────┘
```

### 5.1 CLI 参数映射

工作流输入参数通过 shell 传递给 `pnpm dependfix`：

```bash
pnpm dependfix ${{ inputs.mode || 'report-only' }} \
  --repo ${{ github.repository }} \
  --severity-threshold ${{ inputs.severity-threshold || 'high' }} \
  --max-alerts-per-repository ${{ inputs.max-alerts-per-repository || '10' }} \
  ${{ inputs.dry-run && '--dry-run' || '' }} \
  --verbose
```

- `--repo` 固定使用 `github.repository`（当前仓库，格式 `owner/repo`）
- `--verbose` 在 CI 环境始终开启，方便排查问题
- 定时运行（schedule）时所有参数使用默认值

### 5.2 报告上传

无论修复成功或失败，报告 artifact 始终上传（`if: always()`）：

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: dependfix-report-${{ github.run_id }}
    path: ./dependfix-reports/
    retention-days: 30
```

文件名格式：`dependfix-report-YYYYMMDD-{runId}.md|.json`（由 `writeReport()` 生成）。

### 5.3 Workflow Summary

Markdown 报告内容同步写入 `$GITHUB_STEP_SUMMARY`，在 Actions 运行页直接可见：

```yaml
- name: Write workflow summary
  if: always()
  run: |
    for f in ./dependfix-reports/dependfix-report-*.md; do
      [ -f "$f" ] && cat "$f" >> "$GITHUB_STEP_SUMMARY"
    done
```

报告无文件时输出 "⚠️ No report generated." 占位提示。

---

## 6. 安全考量

| 维度 | 措施 |
|:---|:---|
| Token 暴露 | `GITHUB_TOKEN` 仅在 `env` 中传递，不出现在日志 |
| 输出脱敏 | `sanitizeOutput()` 过滤 `GITHUB_TOKEN`/`NPM_TOKEN`/`token=` 等模式 |
| 权限最小化 | `contents: read` + `security-events: read`，无写权限（M2 阶段） |
| 定时运行安全 | schedule 默认 `dry-run=true`，不自动修改代码 |
| 并发控制 | 使用 `concurrency` group 防止同一 workflow 重复运行 |

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
