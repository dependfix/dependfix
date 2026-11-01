# 真实环境验证矩阵（G3）

> **定位**：1.0 门槛 G3 的**执行清单与证据规范**。本页回答「每条路径要准备什么、怎么跑、留什么证据、算不算通过」，不替代实跑。
> **现状（2026-11-01）**：执行框架已就绪（本页 + `pnpm check:real-env` + `artifacts/real-env/` 模板），G3.8 有本地预演证据（`partial`）；**其余九条仍待外部资源**（其中 G3.0 的 Google 入口因无可用 Google 账号暂不可测，先只跑 GitHub），**G3 整体未通过**。模板就绪 / `pending` 不等于通过。
> **台账**：[1.0 就绪度台账 §4](../design/governance/release-1.0-readiness.md#_4-真实环境验证矩阵-g3)。

## 1. 状态语义

| status | 含义 | 必填字段（除 `path` / `status`） |
|:--|:--|:--|
| `pending` | 仅模板，尚未执行 | `next_action` |
| `partial` | 跑通了部分验收项 | `executed_at` / `operator` / `environment` / `commands` / `evidence` / `result` |
| `passed` | 验收判据全部满足 | 同上 |
| `blocked` | 已尝试但被外部资源阻断 | `executed_at` / `operator` / `environment` / `commands` / `result` + `blocked_reason` / `retry_condition`（**不要求 evidence**） |
| `failed` | 执行完成但验收未通过 | 同 `partial` |

**硬约束**：`passed` 必须能在没有原作者的情况下复现（命令 + 环境 + 证据文件齐全）；证据必须是真实存在的**非空文件**；`pending` / `partial` 一律不得写成 G3 通过。

## 2. 证据格式与校验

证据文件放 `artifacts/real-env/<path>.md`（`artifacts/` 已 gitignore，不入库），YAML frontmatter + 步骤正文：

```md
---
path: G3.1
status: passed
executed_at: 2026-11-01T10:00:00+08:00
operator: 执行角色
environment: linux / Node 22 / pnpm 11.28.5
resources:
  - owner/repo 只读 token（Dependabot alerts: read + security-events: read）
commands:
  - pnpm dependfix report-only --repo=<owner/repo> --code-scanning
evidence:
  - artifacts/real-env/evidence/g3.1-report.md
result: 告警 12 条；MD / JSON 报告 alertsFound 一致
---

## 步骤
...
```

```bash
pnpm check:real-env --init                 # 生成十条模板（已存在跳过；--init-force 覆盖）
pnpm check:real-env                        # 校验字段 / 状态 / 证据文件存在性
pnpm check:real-env --require=G3.1,G3.8    # 要求这些路径 passed
pnpm check:real-env --require-all          # 十条全部 passed（1.0 发布前 G3 专项检查）
```

校验脚本 `scripts/docs/check-real-env-evidence.mjs`：缺 frontmatter、`path` 与文件名不一致、状态非法、必填字段为空、`executed_at` 不是 2000–2100 年间的 ISO 时间、证据路径不存在 / 是目录 / 是空文件 → 非零退出。

**模板重建会覆盖已填内容**：`--init-force` 只与 `--init` 同时生效；`--init --init-force` 会重写**全部 10 条**模板（含已填 `partial` / `passed` frontmatter，实测 G3.8 证据被覆盖后需按原证据回填）。带证据的条目重建前先备份目标文件，或只删除目标单条后 `--init` 重建；重建后复跑 `pnpm check:real-env` 并核对 `status` / `evidence` 未回退。

证据路径相对**仓库根**解析：越出仓库根（如 `../x`）会被拒绝；也接受绝对路径（便于临时证据），但落在仓库外时会打 WARN（干净检出无法复核，发布说明不得引用）。`--no-check-files` / frontmatter `check_files: false` 只用于迁移场景，命中时输出 WARN 且**不得作为通过依据**。

**本脚本不接入 `gates:docs`**（证据在 gitignored 目录，CI 无内容可校验）；`--require-all` 属 **1.0 发布前**的 G3 专项检查，0.7.0 发布不适用。

## 3. 各路径（前置资源 / 最小可执行命令 / 证据字段 / 验收判据）

### G3.0 平台登录（GitHub / Google OAuth、IdP OIDC、构建期凭据按钮）

- **前置资源**：GitHub OAuth App、Google OAuth 凭据（**当前不可用**，见下）（`AUTH_MODE=public`）；IdP OIDC client（`AUTH_MODE=enterprise` + `ALLOWED_EMAIL_DOMAINS`）。两种模式**互斥**，需两次启动。
- **当前可测范围（2026-11-01 用户说明）**：**Google OAuth 凭据不可用**——缺少可正常使用的 Google 账号，无法登录 Google Cloud Console 创建 / 验证凭据，故第三方登录当前**只测 GitHub**。**G3.0 当前为 `pending`（无证据）**；未来执行时若 GitHub 通过而 Google 未测，按路径级 `partial` 记录并在 `result` 写明「GitHub 通过 / Google 未验证（凭据不可用，待补测）」。**不要**把 Google 子项写成路径级 `status: blocked`——§1 的 `blocked` 会免除 `evidence` 要求，连 GitHub 证据也丢掉。**1.0 是否接受 Google 未测已于 2026-11-01 决策：接受并披露**；但 G3.0 仍不得写成通过，`pnpm check:real-env --require-all` 不会通过。
- **最小可执行命令**：
  ```bash
  # 第一轮：public（GitHub；Google 凭据就绪后补测）
  AUTH_MODE=public <OAuth env> pnpm --filter @dependfix/platform dev
  # 第二轮：enterprise（OIDC）
  AUTH_MODE=enterprise <OIDC env> pnpm --filter @dependfix/platform dev
  ```
  每轮浏览器分别登录一次 → 登出 → 再登录。
- **部署形态注意**：`AUTH_MODE` 是**构建期**配置——预构建镜像上再用 `AUTH_MODE=…` 二次启动会静默回退 `public`；容器形态须用 `NUXT_AUTH_MODE` / `NUXT_PUBLIC_AUTH_MODE` 覆盖运行期读值，且登录按钮的可用性是构建期布尔（`githubAvailable` / `googleAvailable` / `oidcAvailable`），换模式需重建镜像。
- **证据字段**：启动命令（含模式）+ 登录页截图（可见实际登录方式）+ `GET /api/auth/get-session` 脱敏响应。**不需要**「启动日志含 AUTH_MODE」——仓库没有该日志行。
- **验收判据**：GitHub / OIDC 各成功一次；Google 入口在凭据就绪后补测（当前未验证：无可用 Google 账号）；未登录访问受保护**页面**重定向 `/login`、受保护 **API** 返回 401；构建期凭据按钮仅在配置齐全时出现。

### G3.1 CLI report-only（GitHub + pnpm-audit）

- **前置资源**：测试仓 token（`Dependabot alerts: read`；启用 `--code-scanning` 时另需 `security-events: read`）。
- **最小可执行命令**：`DEPENDFIX_GITHUB_TOKEN=<token> pnpm dependfix report-only --repo=<owner/repo> --code-scanning`。
- **证据字段**：stdout 摘要、报告文件（`dependfix-report-*.md|json`，或 `dependfix-reports/<YYYY-MM>/<runId>/` 归档）、按严重级别的告警计数。
- **验收判据**：退出码 0；MD 与 JSON 的 `alertsFound` 一致；`--alerts-source=pnpm-audit` 无 token 路径同样跑通一次。

### G3.2 CLI fix / fix-and-pr

- **前置资源**：可写测试仓 + token（`Dependabot alerts: read` + `contents: write` + `pull_requests: write`）。
- **最小可执行命令**：`DEPENDFIX_GITHUB_TOKEN=<token> pnpm dependfix fix-and-pr --repo=<owner/repo> --max-alerts-per-repository=1`。
- **证据字段**：分支名、commit SHA、PR URL、验证链输出（`install → lint → build → typecheck → test`）、报告文件。
- **验收判据**：PR 真实创建且 CI 绿；报告 `exitCode=0`；失败路径（人为造红）能回滚且不留脏分支。

### G3.3 GitHub Action

- **前置资源**：消费者测试仓；Action 输入 `github-token` / `dependabot-alerts-token`（分别对应只读与 Dependabot 专用 token）。
- **最小可执行命令**：在测试仓 `.github/workflows/dependfix.yml` 配 `workflow_dispatch` → `gh workflow run dependfix.yml`。
- **证据字段**：run id、失败/成功步骤日志、产出 PR URL、Action 输入输出摘要。
- **验收判据**：`workflow_dispatch` 全绿并产出 PR（`fix-and-pr` 需 `github-token` 具备 `contents` / `pull-requests` 写权限，重复 PR 还需 `issues: write`）；仅配置只读 `github-token`（无 Dependabot / 写权限）时**硬失败并在日志提示权限不足**（不自动降级、不误报成功；Action 无 `--alerts-source` 输入，提示面向本地 CLI 回退）。

### G3.4 平台：扫描 / 批量 / 定时

- **前置资源**：staging 部署（Docker + SQLite 或 Postgres）+ Redis（队列）+ admin / org_admin 会话。
- **最小可执行命令**：
  ```bash
  # 单仓扫描（body: { mode, severityThreshold }）
  curl -fsS -X POST "<staging>/api/repos/<repoId>/scan" -H 'content-type: application/json' -b "<session cookie>" -d '{"mode":"fix","severityThreshold":"high"}'
  # 批量扫描（body: { repositoryIds: [...] }）
  curl -fsS -X POST "<staging>/api/repos/batch-scan" -H 'content-type: application/json' -b "<session cookie>" -d '{"repositoryIds":["<id1>","<id2>"]}'
  # 手动触发定时计划
  curl -fsS -X POST "<staging>/api/schedules/<scheduleId>/trigger" -b "<session cookie>"
  ```
- **证据字段**：run id、状态流转（pending → running → completed）、队列消费日志、批量运行聚合进度、定时触发记录。
- **验收判据**：单仓与批量各跑通一次；定时触发一次；`running` 中被杀后收敛为 `orphan_run`。

### G3.5 平台：PR Check / 通知

- **前置资源**：真实 PR（测试仓）+ `ACTION_STATUS_MONITOR_ENABLED=true`（PR Check polling 默认关闭）+ SMTP / 收件邮箱。
- **最小可执行命令**：
  ```bash
  curl -fsS -X POST "<staging>/api/pr-checks/poll" -b "<session cookie>"
  # 再触发一次通知（平台通知页 / 组织通知设置）
  ```
- **证据字段**：PR Check 落库记录（含 head SHA 与结论）、邮件原文（脱敏）、`ACTION_STATUS_MONITOR_ENABLED` 生效日志。
- **验收判据**：polling 结论与 GitHub 实际一致；邮件真实送达一次。**重试记录**只对周报路径（30 分钟退避）要求，一次性通知不作等价要求。

### G3.6 MCP Server（8 tool）

- **前置资源**：MCP 客户端（Claude Desktop / Copilot / Cursor 任一）+ `GITHUB_TOKEN` 环境变量（MCP 只读该变量）+ `fix_dependency` 需要的本地 `workDir`。
- **最小可执行命令**：客户端 `mcpServers` 配 `npx -y @dependfix/mcp` → 调用 **`run_scan`** 与 **`fix_dependency`** 各一次。
- **证据字段**：客户端配置片段（脱敏）、tool 调用记录、生成的报告路径。
- **验收判据**：`run_scan` / `fix_dependency` 各成功一次；缺 token 返回结构化错误而非崩溃（8 个 tool 清单以 `packages/mcp/src/index.ts` 为准）。

### G3.7 Agent Skill

- **前置资源**：支持 skill 的 AI 编码工具 + 可写测试仓。
- **最小可执行命令**：`npx skills add dependfix/dependfix -s dependfix-remediator -g` → 对话触发一次修复。
- **证据字段**：安装输出、对话记录（含工具调用）、产出 PR URL。
- **验收判据**：安装成功且对话能完成一次修复闭环；无 token 时给出配置指引而非静默失败。

### G3.8 安装与升级

- **前置资源**：npm registry（发布后 `@latest`）+ Docker registry 读权限（`read:packages`）。
- **最小可执行命令**（前置：`pnpm run build`，否则 `pnpm pack` 会打包过期 `dist`）：
  ```bash
  pnpm run build
  pnpm release:preflight --out-dir=artifacts/release-preflight
  pnpm --filter dependfix pack --pack-destination /tmp/dependfix-pack   # 保留 tarball（preflight 用完即删）
  npx --yes -p /tmp/dependfix-pack/dependfix-<v>.tgz dependfix --version
  npm i -g --prefix /tmp/dependfix-global /tmp/dependfix-pack/dependfix-<v>.tgz
  /tmp/dependfix-global/bin/dependfix --version
  # health-only 冒烟（临时数据卷；升级验证用下面的持久卷）
  docker run --rm -p 3000:3000 <registry>/dependfix:platform-<平台版本> &
  curl -fsS localhost:3000/api/health
  npx --yes dependfix@<v> --version             # 发布后 @latest 复核
  ```
  升级路径（用持久卷，先跑旧版再换新版镜像）：

  ```bash
  docker run -d --name dependfix-upgrade -p 3000:3000 -v dependfix-data:/app/data <registry>/dependfix:platform-<旧平台版本>
  # 写入一条业务数据 / 记下 run 数与表数，然后换成新镜像
  docker rm -f dependfix-upgrade && docker run -d --name dependfix-upgrade -p 3000:3000 -v dependfix-data:/app/data <registry>/dependfix:platform-<新平台版本>
  curl -fsS localhost:3000/api/health && docker logs dependfix-upgrade | tail -20
  ```
- **证据字段**：`artifacts/release-preflight/preflight.json`、三条安装路径的 `--version` 输出、镜像 manifest（amd64 + arm64）、`/api/health` 响应、0.5.x→1.0 升级后的配置与 DB 兼容记录。
- **验收判据**：三条安装路径 `--version` 均等于包版本；镜像双架构存在且 `/api/health` 版本戳与发布一致；**0.5.x→1.0 升级**可用（0.7.0 只作中间验证，不据此判 G3.8 通过）。
- **现状**：本地预演 `partial`（见 §5）；`@latest`、Docker 远端镜像与升级三项未完成。

### G3.9 AI 研判（横切 G3.1–G3.5）

- **前置资源**：2 家 provider 的 Key（如 DeepSeek / Anthropic）+ 预算（**单次 ≤ ¥20**）。
- **最小可执行命令**：`DEPENDFIX_AI_API_KEY=<key> pnpm dependfix report-only --repo=<owner/repo> --ai --ai-provider=<provider> --ai-model=<model>`。
- **证据字段**：**2 家 × 5 场景**的耗时 / token / 估算费用、降级行为与提示。5 个场景 = 成功 / 限流（429）/ 超时 / 非法 JSON / 未配密钥（后者预期 0 次调用、只留提示）。
- **验收判据**：两家 provider 各自覆盖 5 个场景且可复现；单次费用 ≤ ¥20（超限即中止并记录）；`--ai` 关闭时零调用。限流 / 超时 / 非法 JSON 用 `--ai-base-url`（`DEPENDFIX_AI_BASE_URL`）指向本地 stub / 代理制造，不得用「没触发」代替。

## 4. 需要用户提供的资源清单

| 资源 | 影响的路径 | 获取方式 | 状态 |
|:--|:--|:--|:--|
| GitHub OAuth App（client id/secret） | G3.0（`AUTH_MODE=public`） | GitHub → Settings → Developer settings → OAuth Apps | 未提供 |
| Google OAuth 凭据 | G3.0（`AUTH_MODE=public`） | Google Cloud Console → Credentials | 不可用（无可用 Google 账号，无法登录 Cloud Console 获取凭据） |
| IdP OIDC client（issuer / client id / secret） | G3.0（`AUTH_MODE=enterprise`） | 自建 IdP（Keycloak / Auth0 等） | 未提供 |
| GitHub token（只读：`Dependabot alerts: read` + `security-events: read`） | G3.1 / G3.6 | PAT（fine-grained） | 未提供 |
| GitHub token（可写：+ `contents: write` / `pull_requests: write`） | G3.2 | PAT（fine-grained） | 未提供 |
| 测试仓（可写）+ Action 输入 token | G3.2 / G3.3 / G3.5 | 独立于生产的测试仓库 | 未提供 |
| staging 部署 + Redis + admin 会话 | G3.4 / G3.5 | 用户提供可访问的 staging 与队列服务 | 未提供 |
| 收件邮箱 / SMTP | G3.5 | 通知投递目标 | 未提供 |
| MCP 客户端 / AI 编码工具 | G3.6 / G3.7 | 本地安装 | 部分可用 |
| AI Key × 2 + 预算（单次 ≤ ¥20） | G3.9 | provider 控制台 | 未提供 |
| Docker registry 读权限（`read:packages`） | G3.8 | GHCR / Docker Hub token | 未提供 |

> 未提供的资源对应路径一律保持 `pending` / `blocked`，**不影响**其他路径的实跑与回填。

## 5. G3.8 本地预演证据（2026-11-01，`partial`）

M53.4 的发布链预演已产出以下可复核证据（详见 `artifacts/real-env/G3.8.md`；命令与失败排查见 [release.md §发布链预演](release.md#发布链预演与安装实测-本地-不发版)）：

| 项 | 结果 | 证据 |
|:--|:--|:--|
| tarball 临时工程安装 | `dependfix --version` = `0.6.0`（= 包版本） | `artifacts/release-preflight/preflight.json` |
| `npx -p <tarball>` | `0.6.0` | `artifacts/real-env/evidence/g3.8-install-paths.txt` |
| `npm i -g --prefix <tmp>` | `0.6.0` | 同上 |
| Dockerfile 静态检查 | `Check complete, no warnings found` | `docker buildx build --check` 输出 |
| Docker 远端多架构镜像 + `/api/health` | **未复核**（GHCR 私有 + 无 `read:packages`；Docker Hub 不可达） | — |
| 发布后 `@latest` 复核 | **未执行**（0.7.0 未发布） | — |
| 0.5.x→1.0 升级 | **未执行** | — |

> 因此 G3.8 记 `partial`：**本地 tarball / 安装路径已实证，镜像、`@latest` 与升级三项未完成，不构成 G3.8 通过**。
