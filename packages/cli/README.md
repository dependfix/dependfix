# dependfix

> 自动化处理 GitHub Dependabot / Code Scanning 安全告警的 CLI 工具。

## 安装

```bash
# 全局安装
pnpm add -g dependfix

# 或直接运行（无需安装）
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

## 命令

### `report-only` — 查看告警（默认）

拉取告警并生成 Markdown + JSON 双格式报告，不修改任何文件。

```bash
dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

### `fix` — 修复告警

执行依赖升级、lockfile 修复和验证（lint / build），修改仅限本地文件，不创建分支或 PR。

```bash
dependfix fix --repo owner/repo --github-token $GITHUB_TOKEN --severity-threshold high
```

### `fix-and-pr` — 修复并创建 PR

执行完整修复流程后，自动创建修复分支、提交变更、推送并创建 Pull Request。

```bash
dependfix fix-and-pr --repo owner/repo --github-token $GITHUB_TOKEN
```

> 需要 `GITHUB_TOKEN` 具备 `contents: write` 和 `pull-requests: write` 权限。

## CLI 参数

| 参数 | 别名 | 说明 | 默认 |
|:-----|:-----|:-----|:-----|
| `mode` | （位置参数） | 运行模式：`report-only` / `fix` / `fix-and-pr` | `report-only` |
| `--repo` | `-r`, `--repository`, `--repositories` | 目标仓库（`owner/repo`），逗号分隔 | — |
| `--repos-file` | — | 从文件读取仓库列表（每行一个 `owner/repo`） | — |
| `--github-token` | — | GitHub Personal Access Token | `GITHUB_TOKEN` 环境变量 |
| `--severity-threshold` | — | 严重级别：`critical` / `high` / `medium` / `all` | `high` |
| `--dry-run` | — | 试运行模式，不实际写入文件 | `false` |
| `--create-pr` | — | 创建 Pull Request（`fix-and-pr` 模式自动启用） | `false` |
| `--max-alerts-per-repository` | — | 每仓库最大告警处理数 | `10` |
| `--commands` | — | 自定义验证命令（逗号分隔），覆盖默认的 `install/lint/build` | — |
| `--verbose` | — | 详细日志输出 | `false` |

### 环境变量

| 环境变量 | 说明 |
|:---------|:-----|
| `GITHUB_TOKEN` | GitHub 认证 Token |

## 程序化调用

```ts
import { DependfixApp, runCli } from 'dependfix'

// 解析 CLI 参数
const { config } = runCli(process.argv.slice(2))

// 程序化执行
const app = new DependfixApp({ config, verbose: true })
const { result, exitCode } = await app.run()
```

## 修复流程

1. **拉取告警** — 通过 GitHub API 获取 Dependabot alerts
2. **过滤排序** — 按严重级别过滤、优先级排序、数量限制
3. **依赖升级** — `pnpm update <package>` 升级到推荐版本
4. **lockfile 修复** — 检测并修复 `pnpm frozen-lockfile` 问题
5. **验证** — 执行 `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build`
6. **分支与 PR** — `fix-and-pr` 模式下，创建分支、commit、push、PR

## 相关包

- [@dependfix/core](../core/README.md) — 核心领域模型库（本包依赖）
