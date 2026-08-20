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

#### org / 用户自动发现（`--owner`）

通过 `--owner`（或 `DEPENDFIX_OWNER`）自动发现组织 / 用户下的仓库，与显式 `--repo` 合并去重（显式优先）：

```bash
# 自动发现 org 下全部仓库并创建修复 PR
dependfix fix-and-pr --owner your-org --github-token $GITHUB_TOKEN
```

发现机制：先查询 `GET /users/{owner}` 判断主体类型（Organization / User），组织走 `GET /orgs/{org}/repos`、用户走 `GET /users/{user}/repos`；随后按顺序过滤——archived / disabled / fork 剔除 → topic 白名单（AND）→ include / exclude / topicsExclude 名单策略 → 探测 `.github/dependabot.yml`（仅候选仓库，并发受限）。结果按 `owner/repo` 字典序排序，多次运行结果一致。token 权限要求见 [配置说明 → 名单策略](configuration.md#m4-名单策略优先级语义-t403)。

> ⚠️ **SAML SSO 注意**：启用 SAML SSO 的组织，classic PAT 需在 GitHub 网页对组织逐个 **Enable SSO**；fine-grained PAT 需组织管理员授权仓库范围。私有 org 仓库仅返回 token 可见范围内的仓库——`--owner` 发现不保证覆盖全部私有仓库，需按仓库授权。
>
> **限制与边界**：`cleanup-branches` 模式（位置参数）不支持 `--owner`（分支清理需明确目标仓库，配置校验 fail-fast）；`--cleanup-branches` / `--cleanup-branches-auto` 为 fix-and-pr 附加选项，与 `--owner` 兼容。修复分支直接推送到目标仓库（同仓库内创建 PR，无需 fork），org 仓库需确保 token 有 `Contents: write`。

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
name: Daily Security Scan
on:
  schedule:
    - cron: '0 6 * * *'   # 每天 UTC 6:00
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
> **⚠️ 破坏性变更（0.2.0 起，产物格式）**：`dependfix` / `@dependfix/core` 改为**纯 ESM**（移除 CJS 双格式产物）。CLI 命令与 GitHub Action 消费不受影响；编程式消费请使用 `import`；`require()` 需 Node 22.12+（原生 `require(ESM)`）。Node 20.x 的 CJS 编程式消费者需改用动态 `import()`。
>
> 💡 **分支清理建议**：① 在仓库设置开启 **Settings → General → Pull Requests → "Automatically delete head branches"**（PR 合并后自动删除 head 分支）；② 或在 workflow 中开启 `cleanup-branches-auto: true`（每次运行结束后自动删除已合并/已关闭的 `dependfix/` 分支，不删有 open PR 的分支）。

### Action 输入参数

| 参数 | 必填 | 默认值 | 说明 |
|:-----|:----:|:------|:-----|
| `mode` | 否 | `fix-and-pr` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repos` | 否 | `''`（当前仓库） | 目标仓库（逗号分隔）；与 `owner` 同时给出时合并去重（显式优先） |
| `owner` | 否 | `''` | owner / org 自动发现（M4，逗号分隔多个）。⚠️ GITHUB_TOKEN 仅能访问当前仓库，owner 发现其他仓库必须用 PAT（`github-token`）；**建议为每个仓库单独配置 action** 以控制 token 权限范围（见下注） |
| `repo-topics` | 否 | `''` | 发现结果 topic 白名单（逗号分隔，AND 语义；仅影响 owner 发现结果） |
| `repo-include` | 否 | `''` | 仓库白名单 glob（逗号分隔多个，如 `owner/*`、`owner/pkg-*`；仅作用于发现结果） |
| `repo-exclude` | 否 | `''` | 仓库黑名单 glob（逗号分隔多个；显式列表与发现结果均受约束，与 include 冲突时胜出） |
| `repo-topics-exclude` | 否 | `''` | 发现结果 topic 黑名单（排除含任一指定 topic 的仓库） |
| `max-concurrency` | 否 | `1` | 多仓库并发窗口（1-16；>1 仅 `report-only` 允许——fix/fix-and-pr 共享单一工作区，配置校验拒绝并发） |
| `max-retries` | 否 | `3` | GitHub API 限流重试次数（0-10；429/rate limit 指数退避重试） |
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

> **⚠️ M4 建议：为每个仓库单独配置 action（2026-08-06）**：多仓库治理参数虽已接入 Action，但推荐单仓库独立 action：
> - **权限最小化**：单仓库 action 用 `GITHUB_TOKEN` + 该仓库最小权限的 `dependabot-alerts-token` 即可；owner 发现需要跨仓库读取权限的 PAT，泄露影响面更大。
> - **告警源与失败隔离**：Dependabot alerts 始终需专用 PAT；单仓库 action 失败互不影响，而 owner 模式多仓库 PR 汇总在首个仓库。
> - owner 模式（自托管多仓库巡检 / 组织统一治理）更适合本地 CLI 或组织级 PAT 场景。

## 安全注意事项

> dependfix 的核心动作是升级第三方依赖——**执行不可信代码**。更新依赖是为了修复漏洞，但修复过程不能引入新漏洞：dependfix 不能成为恶意依赖扩散的工具。以下为使用侧要点，完整威胁模型与治理见 [沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)。

- **本地 CLI 模式无隔离**：本地模式下依赖的 install/lint/build 脚本直接在**你的机器**上执行（`--commands` 自定义命令同样如此）。恶意脚本可读取你 shell 环境中的所有变量（`GITHUB_TOKEN`、`DEPENDFIX_AI_API_KEY` 等）。建议：在专用环境（容器 / VM / CI runner）运行，或确认目标仓库与依赖来源可信。fix / fix-and-pr 启动时 CLI 会输出本地执行风险警告；已确认风险可设置 `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1` 抑制。
- **Token 使用最小权限**：不要给 dependfix 使用全量 scope 的 PAT。推荐组合：`dependabot-alerts-token` 用仅 `Dependabot alerts: read` 的 fine-grained PAT；`github-token` 仅给目标仓库所需的最小权限（`security-events: read` + `contents`/`pull-requests` 写权限）。owner 模式扫描多个仓库时，token 权限面 = 所有被扫描仓库的信任边界。**启动时会对 token 做权限面检查**：检测到 classic PAT 且含 `repo`（全量仓库）权限时输出警告（不阻断运行）——该 token 一旦被恶意脚本窃取即可接管所有可见仓库。
- **owner 模式扫描范围即信任边界**：`--owner` 发现的仓库会被 clone 并执行其依赖脚本——只扫描可信组织的仓库；对不可信来源先人工 review 再纳入名单（`--repo-include` / `--repo-exclude` 可限制范围）。
- **PR 合入前人工检查**：跨线升级（PR body 带 ⚠️ Major 标记）以及新增/升级包带 lifecycle scripts 且被仓库批准时（供应链信号披露落地后见报告警示区），合入前应人工确认。
- **平台部署**：平台容器执行进程已**非 root 降权**（`dependfix` 用户，entrypoint 自动修复数据卷所有权，[C38](../plan/backlog.md)）；部署时勿挂载 `docker.sock`、勿授予特权；`AUTH_SECRET` / `ENCRYPTION_KEY` 使用强随机值。

#### 启用 rootless sandbox 执行（推荐用于多租户/owner 模式）

> **✅ 状态：M11 T1005 路由接线已就位（2026-08-20）**——`Repository.executorKind` 已接受 `container` / `github-action` / `sandbox` 三值；scan-orchestrator 已接入 sandbox 路由与降级状态机契约（[executor-sandbox.md §7.8 降级状态机契约](../design/governance/executor-sandbox.md)）。平台 Web UI 仓库表单已暴露 sandbox 选项（仓库管理 → 添加/编辑 → 执行方式下拉），管理员可直接在 UI 选择；或经 API 显式指定。
>
> **适用范围**：owner/org 多仓库扫描、`--allow-major-upgrade` 跨线升级、对不可信仓库 owner 模式修复——这些场景下恶意依赖脚本在容器内执行的风险显著高于单可信仓库场景，sandbox 执行把执行隔离在独立 rootless 容器内（与平台容器解耦），详见 [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)。
>
> **不启用**：单可信仓库 + 本地开发场景下默认 `ContainerExecutor` 即可，无 rootless daemon 启动成本。

**前置条件**：

- Linux 内核（cgroup v2 推荐 ≥ 5.8；旧内核降级为 Node V8 软限制）
- 已安装 Docker（≥ 20.10）
- 已安装 `uidmap` 包（提供 `newuidmap` / `newgidmap`）
- `/etc/subuid` 与 `/etc/subgid` 中当前用户有 ≥ 65,536 个从属 UID/GID（`grep ^$(whoami): /etc/subuid` 应返回非空）
- 系统已启用 user namespace（多数发行版默认开启；WSL2 / 容器内运行需额外配置）

**启动 rootless Docker daemon**（参考 [Docker 官方 rootless 文档](https://docs.docker.com/engine/security/rootless/)）：

```bash
# 1. 安装 rootless 工具（Ubuntu/Debian 需 docker-ce-rootless-extras；20.10+ 通常已自带）
sudo apt-get install -y docker-ce-rootless-extras

# 2. 以非 root 用户初始化（生成 systemd user service + 环境变量）
dockerd-rootless-setuptool.sh check     # 前置检查（user namespace / 端口范围）
dockerd-rootless-setuptool.sh install   # 安装 systemd user service

# 3. 启动 + 设置开机自启 + linger（无活动 session 时 systemd user service 不被回收）
systemctl --user start docker.service
systemctl --user enable docker.service
sudo loginctl enable-linger "$USER"      # 关键：logout/重启后 user service 仍存活

# 4. 验证 daemon 可用性（与 platform DockerAdapter.isAvailable() 实现一致）
docker --context rootless info --format '{{.ServerVersion}}'
# 输出如 `24.0.7` 即启动成功

# 5. 确认连接的是 rootless 而非 rootful daemon
docker --context rootless info --format '{{.SecurityOptions}}'
# 输出含 `rootless` 字样 → 真正连到 rootless daemon
```

**在 dependfix 启用 sandbox 执行**：

```bash
# 仓库级覆盖：仅对指定仓库启用 sandbox
curl -X PUT /api/repos/{id} \
  -H 'Content-Type: application/json' \
  -d '{"executorKind": "sandbox"}'

# 环境变量扩展白名单（按需添加私有 registry / GitHub Enterprise）
# 生效进程：平台 Node 进程内的拦截代理判定（packages/engine/src/runners/network-audit.ts）；
# sandbox 容器走 Docker bridge 直出网（本 env 不透传给 sandbox 容器内部）
export DEPENDFIX_ALLOWED_DOMAINS="registry.internal.example.com,artifacts.example.com"

# 自定义运行时（默认 runc；如部署了 Sysbox 可切换）——模块级读取，须在平台启动前设置
export SANDBOX_RUNTIME=sysbox-runc
```

**降级行为**（依据 [executor-sandbox.md §7.8 降级状态机契约](../design/governance/executor-sandbox.md)）：

- **启动时不可用**（开发机无 Docker / 未启用 rootless / user namespace 受限）→ `sandbox.isAvailable()` 返回 false → 自动降级回 `ContainerExecutor` + `degradedReason` 记录 → **run 标 `degraded`**（业务结果完整，UI info 蓝色提示「未启用 rootless，已自动使用平台容器」）
- **运行时失败**（daemon 中途挂掉）→ `sandbox.execute()` 抛 errno → **不静默降级**（避免掩盖环境中途变化）→ **run 标 `failed`**（`error.code = 'sandbox_unavailable'`，UI warn 黄色告警「沙箱执行器运行时不可用，环境配置可能已变化，请联系管理员」）

A/B 场景差异化见 [executor-sandbox.md §7.8.1](../design/governance/executor-sandbox.md)；治理登记见 [sandbox-security-governance.md §5 G5](../design/governance/sandbox-security-governance.md#5-治理决议与登记) + [§7.1 验收段](../design/governance/sandbox-security-governance.md)。

**反模式（绝对禁止）**：

- **挂宿主 `/var/run/docker.sock`**：等价于授予宿主 root 权限（任意用户可起特权容器接管宿主）——违反 [sandbox-security-governance.md §3 路径 D](../design/governance/sandbox-security-governance.md)，属设计使然的等价提权（**不依赖具体漏洞**）
- **DinD `--privileged` 启动 sandbox**：[CVE-2019-5736](https://unit42.paloaltonetworks.com/cve-2019-5736/) runc 覆写 `/proc/self/exe` 逃逸 + [CVE-2024-21626](https://github.com/advisories/GHSA-xfj7-4fh9-h89v) runc `WORKDIR` 文件描述符泄漏——这两条 CVE 与 `--privileged` 强绑定，rootless mode 默认关闭
- **平台容器启动 rootless daemon 自身作为 sandbox**：破坏"独立 PID/Mount namespace"目的，平台漏洞直接蔓延到 sandbox

完整设计、RuntimeAdapter 抽象、K8s+Helm 部署预留见 [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计)；威胁模型与治理登记见 [sandbox-security-governance.md §5 G5](../design/governance/sandbox-security-governance.md#5-治理决议与登记)。

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
| `--owner` | — | owner / org 自动发现（逗号分隔多个或多次传入），与 `--repo` 合并去重（显式优先） | `DEPENDFIX_OWNER` |
| `--repo-topics` | — | 发现结果 topic 白名单（逗号分隔，AND 语义） | `DEPENDFIX_REPO_TOPICS` |
| `--repo-include` | — | 仓库白名单 glob（逗号分隔多个或多次传入；仅作用于发现结果） | `DEPENDFIX_REPO_INCLUDE` |
| `--repo-exclude` | — | 仓库黑名单 glob（显式列表与发现结果均受约束，与 include 冲突时胜出） | `DEPENDFIX_REPO_EXCLUDE` |
| `--repo-topics-exclude` | — | 发现结果 topic 黑名单（排除含任一指定 topic 的仓库） | `DEPENDFIX_REPO_TOPICS_EXCLUDE` |
| `--max-concurrency` | — | 多仓库并发窗口（1-16，默认 1 保守串行；>1 仅 report-only 允许） | `DEPENDFIX_MAX_CONCURRENCY` |
| `--max-retries` | — | GitHub API 限流重试次数（0-10，默认 3） | `DEPENDFIX_MAX_RETRIES` |
| `--history` | — | 查询仓库历史运行摘要（读 `dependfix-reports/index.json`，倒序；不执行扫描） | — |
| `--code-scanning` | — | 同时拉取 Code Scanning alerts（与 Dependabot 并行源；需要 token 具备 `security-events: read`，GITHUB_TOKEN 默认具备） | `false`（env `DEPENDFIX_CODE_SCANNING`） |
| `--allow-major-upgrade` | — | 跨线告警（推荐版本跨大版本，当前线内无修复版本）显式授权自动升级：仅根 package.json 直接依赖（workspace 成员独占声明维持人工）且 lockfile 单版本的告警自动跨线升级，升级后复核脆弱实例消除、强制完整验证（install+lint+build），失败自动回滚；间接依赖 / 多版本共存跨线告警维持人工处理。**仅 CLI 可用，Action 不支持**（详见下方"跨大版本升级"风险章节） | `false`（**无 env 通道**） |
| `--commands` | — | 自定义验证命令（逗号分隔） | — |
| `--verbose` | — | 详细日志 | `false` |

### ⚠️ 跨大版本升级（实验性，风险须知）

`--allow-major-upgrade` 允许 dependfix 在**当前大版本线内没有修复版本**时（如某告警只影响 `<= 6.4.2`，而你锁定的 5.x 线无修复版本，Dependabot 推荐 6.4.3），对满足以下条件的跨线告警执行自动跨大版本升级：

- ✅ **根 package.json 直接依赖**（声明在根 package.json 中；仅成员声明的包维持人工——修复器只改根声明）
- ✅ **lockfile 中该包仅一个版本**（单版本场景）
- ⏭️ 间接依赖 / workspace 成员独占声明 / 多版本共存的跨线告警**仍维持人工处理**（跨线版本化 overrides 会破坏依赖方 range，全局 override 会降级根声明——保守正确）

**处理流程**：改根声明 → `pnpm install` → **升级后实例复核**（确认脆弱实例真实消除；若 workspace 成员同 range / 传递依赖 pin 仍锁旧版本导致残留，则自动回滚并计 failed）→ **强制完整验证**（`pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm build`）→ 全部通过才保留；任一失败自动回滚并计入 failed。

**已知风险与问题**：

1. **API 破坏面**：跨大版本升级必然引入 breaking change。完整验证能兜底编译/类型/构建错误，但 **lint/build 通过 ≠ 运行时功能正确**——建议在合并前人工审查 PR（PR body 中跨线升级带 ⚠️ Major 标记）。
2. **验证耗时**：每个跨线包执行一次完整 install + lint + build（逐包串行），耗时显著高于常规 lint-only 组级验证。
3. **回滚边界**：快照回滚覆盖 package.json / pnpm-lock.yaml 等受跟踪文件；`node_modules` 不还原（临时目录语义，可接受）。
4. **语义变化**：跨线升级会改变依赖声明（如 `^5.4.0` → `^6.4.3`），影响面超出漏洞本身——升级后其他 API 用法可能失效。
5. **Action 不可用**：GitHub Action 刻意**不暴露**该参数，且**无 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 环境变量通道**（结构性禁用，防止 CI 自动跨线引发意外破坏）。

> 默认不开启：不传 `--allow-major-upgrade` 时，跨线告警维持 skipped + 人工处理（PR #28 语义不变）。

## 报告

每次运行生成两种格式的报告：

- **Markdown**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md` — 包含汇总统计、按仓库明细、按严重级别统计、失败原因
- **JSON**：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.json` — 结构化完整数据

文件名中的 `HHmmss` 为运行开始时刻（UTC），`{runId尾段}` 为 runId 最后一个 `-` 分隔段（最多 8 字符）。日期 + 时刻保证按文件名排序即按运行时间排序，便于定位最新报告。

### 归档与趋势（M4）

- **归档结构**：`dependfix-reports/{YYYY-MM}/{runId}/` — `summary.json`（全局汇总）+ 每仓库 `{owner}-{repo}.md|.json`（报告切分），现有平铺报告输出不变（向后兼容）。
- **趋势索引**：`dependfix-reports/index.json` — 每次运行记录 runId、时间、仓库列表、告警/修复/失败计数、时长（幂等更新，同 runId 覆盖）。
- **历史查询**：`dependfix --history <owner/repo>` 列出该仓库历史运行摘要（倒序时间，计数为仓库级口径）。
- 示例：

```bash
# 本地一次 owner 巡检后查询趋势
dependfix --owner your-org --repo-topics node --max-concurrency 4 --max-retries 5
dependfix --history your-org/app
```

报告文件位于 `./dependfix-reports/` 目录。
