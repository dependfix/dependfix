# 配置说明

## 配置来源（按优先级）

1. CLI 参数
2. 环境变量（`DEPENDFIX_*` + `GITHUB_TOKEN`）
3. 配置文件（`dependfix.config.json` / `dependfix.config.yaml`，**尚未支持**）
4. 默认值

## 全部配置项

> **范围说明**：本节为 **CLI（`dependfix` 命令 / GitHub Action）** 的配置项。**管理平台（`apps/platform`）** 的环境变量（数据库 / 认证 / 队列 / 执行器沙箱 / 备份 / 通知等）见文末 [平台配置](#平台配置-apps-platform) 段。

| 配置项 | 环境变量 | 类型 | 默认值 | 说明 |
|:-------|:---------|:-----|:-------|:-----|
| `mode` | `DEPENDFIX_MODE` | `string` | `report-only` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repositories` | `DEPENDFIX_REPOSITORIES` | `string[]` | `[]` | 目标仓库列表（逗号分隔） |
| `reposFilePath` | —（仅 CLI `--repos-file`） | `string` | — | 从文件读取仓库列表（每行一个 `owner/repo`） |
| `owner` | `DEPENDFIX_OWNER` | `string[]` | — | owner / org 列表（逗号分隔多个或 CLI 多次传入），按 owner 自动发现仓库（M4 T401）；与显式 `repositories` 合并去重（显式优先，发现仅补充未出现项）。仅 `github-dependabot` 数据源可用；`cleanup-branches` 模式不可用 |
| `repoTopics` | `DEPENDFIX_REPO_TOPICS` | `string[]` | — | 发现结果 topic 白名单（逗号分隔，**AND 语义**：仓库必须包含全部指定 topics）。仅影响发现结果，不影响显式列表 |
| `repoInclude` | `DEPENDFIX_REPO_INCLUDE` | `string[]` | — | 仓库白名单 glob（逗号分隔多个或 CLI 多次传入，如 `owner/*`、`owner/pkg-*`）。**仅作用于发现结果**；显式列表不受 include 影响（显式优先） |
| `repoExclude` | `DEPENDFIX_REPO_EXCLUDE` | `string[]` | — | 仓库黑名单 glob。**显式列表与发现结果均受 exclude 约束**；与 include 冲突时 **exclude 胜出** |
| `repoTopicsExclude` | `DEPENDFIX_REPO_TOPICS_EXCLUDE` | `string[]` | — | 发现结果 topic 黑名单（排除含任一指定 topic 的仓库）。仅作用于发现结果（显式列表无 topics 元数据） |
| `severityThreshold` | `DEPENDFIX_SEVERITY_THRESHOLD` | `string` | `high` | 严重级别阈值：`critical` / `high` / `medium` / `all` |
| `dryRun` | `DEPENDFIX_DRY_RUN` | `boolean` | `false` | 预演模式，不实际修改文件 |
| `createPullRequest` | `DEPENDFIX_CREATE_PR` | `boolean` | `false` | 是否创建 PR（`fix-and-pr` 模式自动启用） |
| `commit` | `DEPENDFIX_COMMIT` | `boolean` | `false` | 修复完成后在本地当前分支直接提交（仅 `fix` 模式生效；与 `--dry-run` / `--create-pr` 互斥） |
| `cleanupBranches` | `DEPENDFIX_CLEANUP_BRANCHES` | `boolean` | `false` | （fix-and-pr 模式）结束后将已合并的 dependfix 分支列入报告待清理清单（不自动删除；删除需 `cleanup-branches` 模式交互确认） |
| `cleanupBranchesAuto` | `DEPENDFIX_CLEANUP_BRANCHES_AUTO` | `boolean` | `false` | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） |
| `githubToken` | `DEPENDFIX_GITHUB_TOKEN` / `GITHUB_TOKEN` | `string` | — | GitHub 认证 Token（`pnpm-audit` 数据源下可省略） |
| `alertsToken` | `DEPENDFIX_ALERTS_TOKEN` | `string` | — | Dependabot alerts 专用 token（可选，最小权限 fine-grained PAT，仅 `Dependabot alerts: read`；缺省回退 `githubToken`。GITHUB_TOKEN 无法读取 Dependabot alerts） |
| `alertSource` | `DEPENDFIX_ALERTS_SOURCE` | `string` | `github-dependabot` | 告警数据源：`github-dependabot`（GitHub Dependabot alerts API）/ `pnpm-audit`（本地无 token 回退，扫描当前工作区 lockfile；repository 解析优先显式 `--repo` → git remote → `local` 兜底）。`pnpm-audit` 下不要求 token、不支持 `fix-and-pr` 模式与多个 `--repo`。详见 [pnpm audit fallback 设计](../design/modules/pnpm-audit-fallback.md) |
| `codeScanningEnabled` | `DEPENDFIX_CODE_SCANNING` | `boolean` | `false` | 是否同时拉取 Code Scanning alerts（与 Dependabot **并行源**，非回退；默认关闭，行为与 M2 一致）。开启后 Dependabot + Code Scanning 并行拉取、互不覆盖；Code Scanning 告警默认不可自动修复（A/B/C 规则分层按规则启用）。需要 token 具备 `security-events: read` 权限（GITHUB_TOKEN 默认具备）；`pnpm-audit` 本地数据源下不可用。详见 [Code Scanning 设计](../design/modules/data-model.md) |
| `overrideProtect` | `DEPENDFIX_OVERRIDE_PROTECT` | `string` | — | overrides 保护名单（**按仓库粒度**）：`repo-glob:pkg1,pkg2;repo-glob2:pkg3`。命中时 dependfix **不写入**该包的 override，并记 `OVERRIDE_PROTECTED` 审计（防历史上被人工移除的破坏性 override 复发，实证 PR #1095）。仓库 glob 与 `repo-include/exclude` 同语义（单星号不跨斜杠，全局兜底需写两段通配）。详见 [overrides 保护名单设计](../design/governance/override-protect-policy.md)；该名单也可由目标仓库在 `.github/dependfix.yml` 中声明（**中央配置优先**：中央一旦指定即整体忽略仓库声明，防目标仓库绕过；见 [修复器设计 §12.7](../design/modules/dependency-fixer-records.md)） |
| `allowMajorUpgrade` | **无 env 通道**（仅 CLI `--allow-major-upgrade`） | `boolean` | `false` | 跨线告警（推荐版本跨大版本，当前线内无修复版本）显式授权自动升级：仅根 package.json 直接依赖（workspace 成员独占声明维持人工）且 lockfile 单版本的告警自动跨线升级，升级后复核脆弱实例消除、强制完整验证（install+lint+build+typecheck+test），失败自动回滚；间接依赖 / 多版本共存跨线告警维持人工处理。**刻意不提供 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 环境变量**（配合 action.yml 不暴露 input → GitHub Action 结构性禁用，防止 CI 自动跨线引发意外破坏）。风险详见 [quick-start.md 跨大版本升级章节](../guide/quick-start.md) |
| `maxAlertsPerRepository` | `DEPENDFIX_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | 每仓库最大告警处理数 |
| `maxConcurrency` | `DEPENDFIX_MAX_CONCURRENCY` | `number` | `1` | 多仓库并发窗口（1-16，默认 1 保守串行）。`>1` 时输出警告（可能触发 GitHub 限流）；**仅 `report-only` 模式允许并发**——`fix` / `fix-and-pr` 共享单一 workDir，并发写存在快照覆盖 / 互踩回滚 / install 竞争，配置校验 fail-fast 拒绝 |
| `maxRetries` | `DEPENDFIX_MAX_RETRIES` | `number` | `3` | GitHub API 限流重试次数（0-10；0=关闭）。对 429 / primary rate limit（403 + remaining=0）/ secondary rate limit（403/429 特征）指数退避重试（reset 头优先，上限 30s）；权限类 403 不重试 |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | 用户显式依赖分组（覆盖自动分组），格式 `name1:pkg1,pkg2;name2:pkg3`（分号分隔组、冒号分隔组名与包列表、逗号分隔包名）。缺省时使用自动分组：`dependabot.yml groups` → `@types` 归并 → scope/前缀启发式 → 单包。详见 [依赖分组设计](../design/modules/dependency-grouping.md) |
| `verbose` | — | `boolean` | `false` | 详细日志输出（仅 CLI `--verbose`） |
| `commands` | — | `string[]` | — | 自定义验证命令（仅 CLI `--commands`）；**整链替换**默认链，不做合并 |
| `rollbackGranularity` | `DEPENDFIX_ROLLBACK_GRANULARITY` | `unit` / `repo` | `unit` | 验证失败回滚粒度：`unit` 回退最近一个已通过 probe 的变更单元并重验一次（保留更早单元）；`repo` 保持整仓 `git reset --hard` 逃生语义。对应 CLI `--rollback-granularity` |
| `mirrorCiScripts` | `DEPENDFIX_MIRROR_CI_SCRIPTS` | `boolean` | `false` | 把目标仓库 CI 独有的 `pnpm` / `npm` / `yarn` 脚本追加到验证链（CLI `--mirror-ci-scripts`；Action `mirror-ci-scripts`）。开启后在默认链**之后**执行，最多 3 条、首失败即停；`docker build` / `gh` / 任意 shell 与非单一形态片段（flag / env 赋值 / 额外参数；install 类命令视为已覆盖）只记 `mirrorSkipped` 不执行；**只校验命令形态与脚本存在性，不审计脚本体**（脚本内命令与 `pre`/`post` 钩子照常执行）；与默认链共用同一超时（`DEPENDFIX_VERIFY_TIMEOUT_MS`）与运行级取消面，并同样纳入修复前基线采样（基线已红 → 既有失败，不回滚、不改 exit code）。显式 `commands` 整链替换，**不与 mirror 叠加**；平台沿用默认关闭。详见 [对外 PR 交付闭环设计 §5](../design/governance/pr-delivery-closure.md) |
| `retryFailed` | `DEPENDFIX_RETRY_FAILED` | `boolean` | `false` | 忽略同告警尝试上限并强制再试（CLI `--retry-failed`；Action `retry-failed`）。仅 `fix-and-pr` 生效：同一告警 / 同一目标版本 / 同一修复策略连续两次关闭后，第 3 次起**不执行升级、不建 PR**，落 `alertsSkippedByReason['repeated-failure']`（报告 `Skipped: Repeated failure`）；开启后仍执行并在报告 `Repeated Failure Attempts` 段标注 `forced (manual retry)`。计数载体是 PR 正文 HTML 注释（只计未合并的关闭 PR，最近 50 条，读取失败 fail-open）；全部命中时与零告警仓库同语义（不采样修复前基线）。详见 [对外 PR 交付闭环设计 §6](../design/governance/pr-delivery-closure.md#_6-m48-3-同告警尝试指纹去重) |
| `onBaselineRed` | `DEPENDFIX_ON_BASELINE_RED` | `skip` / `issue` / `draft` | `skip` | 修复后安装验证仍为既有失败（基线红）时的交付降级档位。`skip` 回滚并留痕（默认，行为与引入前一致）；`issue` 按「仓库集 + 失败命令集」指纹开 issue（同一指纹只开一次，关闭后不重开，需 `issues: write`），改动仍回滚；`draft` 不回滚，照常提交并创建**草稿** PR（正文带既有失败说明，`--wait-pr-checks` 不等待）。仅 `fix-and-pr` 生效；平台执行链只记录 `summary.deliverySkipped` 并在运行列表 / 详情展示「交付跳过」。三档均不改变 exit code（`PRE_EXISTING_FAILURE` 仍在跳过类白名单）。详见 [对外 PR 交付闭环设计 §16](../design/governance/pr-delivery-closure.md#_16-m51-4-基线红-安装失败的交付降级-2026-10-30) |
| `waitPrChecks` | `DEPENDFIX_WAIT_PR_CHECKS` | `boolean` | `false` | 创建 PR 后等待 check 终态（CLI `--wait-pr-checks`；Action `wait-pr-checks`）。仅 `fix-and-pr` 生效：失败时默认评论失败 job 名 + URL + 尝试标记；宽限期（≥60s 且至少两轮）后仍无 check → `no_ci_detected`，**绝不判通过**；轮询 / 评论 / 关闭失败只记录，不改变修复结果与 exit code。详见 [对外 PR 交付闭环设计 §8](../design/governance/pr-delivery-closure.md#_8-m48-5-pr-创建后-ci-回环-cli-action-侧) |
| `closeFailedPr` | `DEPENDFIX_CLOSE_FAILED_PR` | `boolean` | `false` | check 失败且聚合归因 `self_caused` 时关闭 PR 并删除分支（CLI `--close-failed-pr`；Action `close-failed-pr`）。需同时开启 `waitPrChecks`（配置校验拒绝单独开启）；`unknown` / `external_noise` / `pre_existing` 只评论不关闭，混合归因按 `unknown` 处理 |
| `prCheckTimeoutMs` | `DEPENDFIX_PR_CHECK_TIMEOUT_MS` | `number` | `900000` | 单个 PR 的 check 等待上限（毫秒；60000-1800000）。超时记 `checksTimedOut`，保留 PR 交给后续运行 / 平台 |
| `prCheckRunBudgetMs` | `DEPENDFIX_PR_CHECK_RUN_BUDGET_MS` | `number` | `1200000` | 运行级等待总预算（毫秒；60000-1800000），实际等待还受「剩余 job 预算 × 70%」约束 |
| `jobBudgetMs` | `DEPENDFIX_JOB_BUDGET_MS` | `number` | 未设置 | job 总预算基线（毫秒；60000-7200000）。缺省只在 `GITHUB_ACTIONS=true` 时按 25 分钟套用（与 `security-auto-fix.yml` 的 `timeout-minutes` 对齐）；本地 / 平台执行不臆造 job 上限，显式设置后按其折算。注意 `startedAt` 从引擎启动计起，不含 Actions setup 步骤耗时 |
| `history` | —（仅 CLI `--history`） | `string` | — | 查询仓库历史运行摘要（读 `dependfix-reports/index.json`，倒序时间，计数为仓库级口径），**不执行扫描**、不要求 token/仓库配置；与运行参数并存时 history 优先、其余参数忽略 |

## GitHub 认证 Token 权限映射

> **推荐使用 [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new)**（classic PAT 仍兼容但缺少细粒度权限控制）。本节按依赖模式列出 **Fine-grained PAT 最小权限**，帮助按场景授予最小必要权限。

### 各模式最小权限矩阵

| 模式 | 触发的 GitHub API / 操作 | **Classic PAT scopes** | **Fine-grained PAT permissions**（Repository 维度） | Token 范围 |
|:---|:---|:---|:---|:---|
| **`report-only`**（Dependabot alerts） | `repos.get` + `dependabot.listAlertsForRepo` | `security_events`（Dependabot alerts 在此 scope 下，**非 `repo`**）+ `repo`（repos.get 需要） | Contents: **Read-only** + Dependabot alerts: **Read-only** | Classic：自己的全部 + 加入的协作；Fine-grained：目标仓库 |
| **`report-only`** + Code Scanning | + `code-scanning.listAlertsForRepo` | `security_events`（Dependabot + Code Scanning 都用此 scope）+ `repo` | + Code scanning alerts: **Read-only** | 同上 |
| **`fix`**（仅本地 commit，不 push） | 同 `report-only` | 同 `report-only` | 同 `report-only` | 同 `report-only` |
| **`fix-and-pr`**（git push + 创建 PR） | + `git push`（HTTPS credential）+ `pulls.create` + `pulls.list` + `pulls.update` | `repo`（git push / pulls / deleteRef / 分支管理）+ `security_events`（**必需**：Dependabot + Code Scanning alerts 读取） | Contents: **Read and write** + Pull requests: **Read and write** + Dependabot alerts: **Read-only** + Code scanning alerts: **Read-only**（仅 Code Scanning 时） | 同上 |
| **`cleanup-branches`** | + `git.listMatchingRefs` + `git.deleteRef` + `pulls.update` | `repo` + `security_events`（清理分支前需读 alert 状态） | Contents: **Read and write** + Pull requests: **Read and write** + Dependabot alerts: **Read-only** | 同上 |

> **核心差异**：
> - **Classic PAT**：`repo` scope 覆盖 git push / pulls / 分支管理 / 协作权限；**`security_events` scope 单独覆盖 Dependabot + Code Scanning alerts 读取**。`fix-and-pr` 模式 **2 个 scope 都必需**（不要以为 `repo` 是"万能 scope"——Dependabot alerts 不在 `repo` 内）。
> - **Fine-grained PAT**：必须 **逐项勾选** 4 个 permissions（Contents:Write + Pull requests:Write + Dependabot alerts:Read + Code scanning alerts:Read，Code Scanning 数据源时）。两者都是必需的。
>
> 上述 Fine-grained PAT 中所有 `Metadata: Read-only` 权限（baseline）由 Fine-grained PAT 自动启用，无需手动勾选。

### Fine-grained PAT 创建步骤（以 `fix-and-pr` 为例）

1. 打开 `https://github.com/settings/personal-access-tokens/new`（**Personal access tokens → Fine-grained tokens**）
2. **Token name**：例如 `dependfix-fix-and-pr-<env>`（env 区分 dev / staging / prod）
3. **Expiration**：建议 **90 天**（避免永久 token；依赖 GitHub 提醒机制 + 自家 secret rotation 流程）
4. **Resource owner**：选择目标 owner / org。**私有 org 需组织管理员在 org 设置中预先授权该 token**（SAML SSO 组织需额外 SSO 授权，详见 [quick-start.md](../guide/quick-start.md) §安全注意事项）
5. **Repository access**：选择 **Only select repositories** → 列出目标仓库（**Fine-grained PAT 一次只能覆盖一个 org 内的指定仓库，不能跨 org**；多 org 扫描需 multiple tokens 或迁移到 GitHub App）
6. **Repository permissions** 勾选：
   - Contents: **Read and write**（git push 创建 fix branch 必需）
   - Pull requests: **Read and write**（`pulls.create` + `pulls.update` 必需）
   - Dependabot alerts: **Read-only**（`dependabot.listAlertsForRepo` 必需）
   - Code scanning alerts: **Read-only**（如启用 `--code-scanning` 数据源时）
   - Metadata: **Read-only**（自动启用，baseline）
7. **Account permissions**：通常无需调整（默认 read-only）
8. 生成 → 复制 token（**仅显示一次**）→ 设置为环境变量：
   ```bash
   export GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
   ```

### Classic PAT 创建步骤（以 `fix-and-pr` 为例）

1. 打开 `https://github.com/settings/tokens/new`（**Personal access tokens → Tokens (classic)**）
2. **Note**：例如 `dependfix-fix-and-pr-<env>`
3. **Expiration**：建议 **90 天**（**可设更短**，但 classic PAT 不强制过期）
4. **Select scopes**（勾选最少的必需 scope）：
   - ☑️ `repo` — **必需**（覆盖 git push / pulls / deleteRef / 分支管理 / Contents 读写 / 协作权限；**不覆盖 Dependabot alerts**）
   - ☑️ `security_events` — **必需**（只要使用 Dependabot alerts 或 Code Scanning 数据源；覆盖 Dependabot + Code Scanning alerts 读取）
   - ❌ `public_repo` — **不要勾选**（除非显式需要访问公开仓库；`repo` 已覆盖）
   - ❌ `workflow` — **不要勾选**（dependfix 不管理 Actions workflow）
   - ❌ `read:packages` / `write:packages` — **不要勾选**（dependfix 不下载/发布私有 npm 包）
   - ❌ `admin:org` — **不要勾选**（最小权限原则，绝不授权组织管理权限）
5. **Generate token** → 复制 token（**仅显示一次**）→ 设置为环境变量：
   ```bash
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

### Classic PAT vs Fine-grained PAT 对比

| 维度 | Classic PAT | Fine-grained PAT（推荐） |
|:---|:---|:---|
| 权限粒度 | coarse（`repo` / `security_events` 等 OAuth scope，每个 scope 内部为 bundle） | 细粒度（Contents / Pull requests / Dependabot alerts / Code scanning alerts 各自独立勾选） |
| `fix-and-pr` 必需 scope/permission 数 | **2 个 scope**（`repo` + `security_events`，两者都是必需的——`repo` 不覆盖 Dependabot alerts） | **4 个 permissions**（Contents:Write + Pull requests:Write + Dependabot alerts:Read + Code scanning alerts:Read） |
| 仓库范围 | 公开仓库 + 自己的私有 + 加入协作的私有 | **必须显式选择**目标仓库（无 broad access） |
| 过期时间 | 可选（不强制） | **必须设置**过期时间 |
| OAuth scope 推荐 | `repo` + `security_events` | 等价细粒度权限组合（见上表） |
| 私有 org 仓库 | 需 `repo` + `security_events` + 组织管理员预授权 | 需组织管理员预授权 |
| Audit log 显示 | token owner（粗粒度） | token owner + repository-level（细粒度） |
| 推荐场景 | 简单一次性脚本 + 已有 classic token 复用 | **生产环境 + 最小权限原则 + 安全审计** |

### 特殊场景

- **GitHub Actions 内运行**：默认 `secrets.GITHUB_TOKEN` 自带 Contents:Write + Pull requests:Write，但**无 Dependabot alerts:Read**（详见 [roadmap.md M2 段](../plan/roadmap.md)，或 [archive/todo-archive-phases-m2-m55.md G2 处置记录](../plan/archive/todo-archive-phases-m2-m55.md#g2-处置记录-github-token-无法访问-dependabot-alerts)）。两种方案：
  1. 额外配置 `DEPENDFIX_ALERTS_TOKEN` 使用 Fine-grained PAT（仅 Dependabot alerts:Read，最小权限）
  2. 切换到 `pnpm-audit` 数据源（`DEPENDFIX_ALERTS_SOURCE=pnpm-audit`，不依赖 token 读 alerts）
- **SAML SSO 组织**：classic PAT 需在 GitHub 网页对组织逐个 **Enable SSO**；Fine-grained PAT 需组织管理员在 org 设置中预授权仓库范围。私有 org 仓库仅返回 token 可见范围内的仓库——`--owner` 发现不保证覆盖全部私有仓库，需按仓库授权
- **跨组织扫描**：Fine-grained PAT 一次只能授权一个 org 内的仓库。多 org 场景方案：
  1. 多个 PAT（CLI 多 pass，每个 org 一次）
  2. 迁移到 GitHub App（推荐：跨 org + 细粒度权限 + 短期 token 自动轮换）
- **git push 认证细节**：`git push` 走 HTTPS credential（用户名 = token owner，密码 = PAT），**不依赖** Fine-grained PAT 本身的 specific scopes（只要 Contents:Read+write 授权 HTTPS 推送）。SSH key 走另一条路径（需 `git remote set-url origin git@github.com:...`）

### 验证 Token 权限

最小验证脚本（确认 Dependabot alerts 可读）：

```bash
# Fine-grained PAT 应能列 alerts：
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/dependabot/alerts?state=open"
# 期望：200 + JSON 数组
# 失败：403 / "Resource not accessible by integration" → 缺 Dependabot alerts:Read 或仓库不在 token 范围
```

```bash
# Code Scanning 数据源验证（如启用）：
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/code-scanning/alerts?state=open"
# 期望：200 + JSON 数组
```

```bash
# PR 创建权限验证（如启用 fix-and-pr）：
curl -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/{owner}/{repo}/pulls" \
  -d '{"title":"[verify] token scope check","head":"<some-branch>","base":"main","body":"verification only"}'
# 期望：201（成功后建议删除该 PR）；422 / 403 → 权限不足或仓库未授权
```

### 常见问题

| 症状 | 根因 | 解决 |
|:---|:---|:---|
| `403 / Resource not accessible by integration` | Token 缺 `Dependabot alerts: Read` 或仓库不在 token 范围 | 重新创建 PAT，确认勾选 Dependabot alerts:Read + 仓库授权 |
| `401 / Bad credentials` | Token 过期 / 撤销 / 拼写错误 | 重新生成 + 核对 `ghp_xxx` / `github_pat_xxx` 前缀 |
| `git push` 卡在 `Username for 'https://github.com':` | 缺 HTTPS credential；dependfix 用 `stdio: 'pipe'`（详见 [engine/src/runners/process-control.ts](../../packages/engine/src/runners/process-control.ts)）导致 stdin 不可达 → 永久挂起 | 设置 `GITHUB_TOKEN` 环境变量或配置 git credential helper（不推荐交互式输入） |
| `pulls.create` 报 `422 Validation Failed: head` | token 缺 Contents:Write 或分支已存在 | 升级 Contents:Read+write 或换不同分支名 |
| `secondary rate limit` 403/429 | 短时间内高频 API 调用 | 调整 `DEPENDFIX_MAX_CONCURRENCY`（默认 1 保守串行）+ `DEPENDFIX_MAX_RETRIES`（默认 3 次指数退避）|

### 相关资源

- [GitHub Docs · Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub Docs · Dependabot alerts API](https://docs.github.com/en/rest/dependabot/alerts)
- [GitHub Docs · Code Scanning API](https://docs.github.com/en/rest/code-scanning)
- [quick-start.md](../guide/quick-start.md) — 完整 CLI 命令清单 + SAML SSO 注意
- [security.md §5.2 供应链信任边界](../standards/security.md) — AI 推荐包 / MCP / skill 来源验证 + Token 信任级别

### M4 名单策略优先级语义（T403）

| 来源 | include 白名单 | exclude 黑名单 | topicsExclude |
|:-----|:---|:---|:---|
| 显式 `repositories`（`--repo` / `--repos-file`） | **不受影响**（显式优先） | 受约束（命中即剔除） | 不适用（显式列表无 topics 元数据） |
| `--owner` 发现结果 | 受约束（include 非空时必须命中其一） | 受约束（命中即剔除） | 受约束（含任一指定 topic 即剔除） |

- 冲突规则：include 与 exclude 同时命中时 **exclude 胜出**（仓库被剔除）。
- 过滤时机：策略在发现阶段、dependabot.yml 探测**之前**应用——被排除仓库不触达 contents API（探测请求数量受控）。
- glob 语法：`*` 匹配任意非 `/` 字符序列（不跨仓库分隔符），`?` 匹配单个非 `/` 字符，其余字符按字面量；匹配对象为完整 `owner/repo`（大小写敏感）。

> **AI 研判配置已落地**：Action 侧使用 `ai` / `ai-api-key` / `ai-provider` / `ai-model` / `ai-base-url` / `ai-api-url` / `ai-trigger` 输入；平台侧按组织级 AI 配置注入 `DEPENDFIX_AI_*`（见下文「平台配置（apps/platform）」）。

## 配置文件示例

> **尚未支持**：配置文件加载器未实现、也未排期，当前仅支持 CLI 参数和环境变量。

```yaml
# dependfix.config.yaml
repositories:
  - owner/repo-a
  - owner/repo-b
severityThreshold: high
mode: fix-and-pr
maxAlertsPerRepository: 20
commit: false
```

## 环境变量

```bash
export GITHUB_TOKEN=ghp_xxx
export DEPENDFIX_MODE=report-only
export DEPENDFIX_SEVERITY_THRESHOLD=high
export DEPENDFIX_REPOSITORIES=owner/repo-a,owner/repo-b
export DEPENDFIX_DRY_RUN=true
export DEPENDFIX_MAX_ALERTS_PER_REPOSITORY=20
export DEPENDFIX_COMMIT=false
export DEPENDFIX_CLEANUP_BRANCHES=false
# M4 多仓库治理（可选）
# owner 级自动发现（与 DEPENDFIX_REPOSITORIES 合并去重，显式优先）
export DEPENDFIX_OWNER=owner-a,owner-b
# 发现结果 topic 白名单（AND 语义）与黑名单（排除含任一 topic 的仓库）
export DEPENDFIX_REPO_TOPICS=node,pnpm
export DEPENDFIX_REPO_TOPICS_EXCLUDE=deprecated,archived
# 仓库白名单 / 黑名单 glob（仅白名单作用于发现结果；黑名单对显式列表同样生效）
export DEPENDFIX_REPO_INCLUDE=owner-a/*,owner-b/pkg-*
export DEPENDFIX_REPO_EXCLUDE=owner-a/legacy-*
# 并发与限流（默认 1 保守串行；>1 仅 report-only 模式允许；限流退避默认 3 次）
export DEPENDFIX_MAX_CONCURRENCY=4
export DEPENDFIX_MAX_RETRIES=3
# 用户显式依赖分组（可选；缺省时自动分组）
# 格式：name1:pkg1,pkg2;name2:pkg3
export DEPENDFIX_UPGRADE_GROUPS="eslint-stack:eslint,eslint-plugin-vue;nuxt-stack:@nuxt/eslint,nuxt"
# 仅当 GitHub token 无法读取 Dependabot alerts（如 Action 内 GITHUB_TOKEN）时配置，
# 使用最小权限 fine-grained PAT（仅 Dependabot alerts: read）
export DEPENDFIX_ALERTS_TOKEN=github_pat_xxx
# 本地无 token 回退：使用 pnpm audit 扫描当前工作区 lockfile
# （不要求 GITHUB_TOKEN / 不要求 git remote；repository 显示 git remote 或 local）
export DEPENDFIX_ALERTS_SOURCE=pnpm-audit
# 验证链：把目标仓库 CI 独有的包管理器脚本追加到默认链之后（默认关闭；最多 3 条）
export DEPENDFIX_MIRROR_CI_SCRIPTS=false
# 同告警尝试上限：默认第 3 次起跳过；置 true 强制再试（仅 fix-and-pr 生效）
export DEPENDFIX_RETRY_FAILED=false
# 基线红（修复后安装仍既有失败）的交付降级：skip（默认）/ issue / draft
# export DEPENDFIX_ON_BASELINE_RED=skip
# 单条验证命令超时（默认 10 分钟；默认链与 CI 镜像脚本共用，默认链内的 pnpm install 仍按本条计时；修复器安装链超时不受影响）
# export DEPENDFIX_VERIFY_TIMEOUT_MS=600000
```

> `GITHUB_TOKEN` 环境变量会被自动识别，无需额外配置前缀。`DEPENDFIX_GITHUB_TOKEN` 优先级高于 `GITHUB_TOKEN`。

## 平台配置（apps/platform）

管理平台（`apps/platform`）通过 compose 的 `apps/platform/.env` 注入环境变量。

- **快速启动（极简）**：`cp apps/platform/.env.example .env` → 至少设置 `AUTH_SECRET`（+ 用凭据功能时 `NUXT_ENCRYPTION_KEY`）。
- **完整变量**：`apps/platform/.env.full.example`（含全部变量 + 默认值 + 分节）。
- **完整部署步骤**：见 [Docker 部署](./deployment.md)。

> ⚠️ **注入方式（关键）**：默认 `docker-compose.yml` **无 `env_file`**，仅把一组白名单变量经 `${...}` 插值转发进容器（**compose 名 → 容器名**）：
> `PORT` · `PUID`/`PGID` · `AUTH_SECRET`→`NUXT_AUTH_SECRET` · `DATABASE_PATH` · `DATABASE_MIGRATIONS_RUN` · `NUXT_ENCRYPTION_KEY` · `REGISTRATION_DISABLED`→`NUXT_REGISTRATION_DISABLED` · `NUXT_PUBLIC_BETTER_AUTH_URL` · `NUXT_REDIS_URL`（硬编码） · `QUEUE_ENABLED`/`QUEUE_JOB_RETRIES`/`QUEUE_BACKOFF_MS`→`NUXT_*` · `QUEUE_WORKER`→`DEPENDFIX_QUEUE_WORKER` · `IN_PROCESS_WORKER`→`NUXT_IN_PROCESS_WORKER` · `PNPM_CONFIG_STORE_DIR` · `LOG_DIR`/`LOG_LEVEL`/`LOGFILES` · `DEPENDFIX_IMAGE`/`DEPENDFIX_BUILD_IMAGE`。
> 下方表中**白名单之外**的变量（邮件 / OAuth / OIDC / `AUTH_MODE` / `DATABASE_TYPE|URL|SSL|SYNCHRONIZE` / `BACKUP_*` / `RUN_WORK_ROOT` / `SANDBOX_*` / `DEPENDFIX_AI_*` / `ACTION_STATUS_MONITOR_ENABLED` / 通知类等）**默认不会进容器**，需自行追加到 compose 的 `environment:`（Nuxt runtimeConfig 变量须用 `NUXT_` 前缀）或用 `docker run -e` 注入。
>
> ⚠️ **Nuxt 运行时覆盖前缀**：平台是 Nuxt 应用，`runtimeConfig` 运行时覆盖**只认 `NUXT_` 前缀**——compose 变量 `AUTH_SECRET` → 容器 `NUXT_AUTH_SECRET`；`REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`。构建期烘焙的 env（如 `AUTH_MODE`）运行期须用 `NUXT_` 前缀覆盖，否则静默回退默认值。直读 `process.env` 的服务端变量（`DATABASE_*` / `CLONE_*` / `DEPENDFIX_*` 等）按原名注入。

### 基础与必填

| 变量（compose / 容器名） | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `AUTH_SECRET` → `NUXT_AUTH_SECRET` | ✅ 生产 | `change-me-to-a-random-secret` | better-auth 会话签名密钥；生产必须设为强随机值（`openssl rand -hex 32`） |
| `NUXT_ENCRYPTION_KEY` | ✅ 用凭据功能 | 空 | 凭据 AES-256-GCM 加密密钥（32 字节随机值）；留空禁用凭据管理功能 |
| `PORT` | — | `3000` | 平台监听端口 |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | 建议（反代 / HTTPS 必填） | `http://localhost:3000` | 对外访问地址；OAuth 回调与 better-auth `trustedOrigins` 收紧依赖它（未设置走通配兜底） |
| `NUXT_PUBLIC_BASE_URL` | — | 空 | 兼容旧变量名（`trustedOrigins` 读取回退）；新部署统一用 `NUXT_PUBLIC_BETTER_AUTH_URL` |
| `NUXT_PUBLIC_DEFAULT_BRANCH` / `DEFAULT_BRANCH` | — | `main` | 新建仓库默认分支（构建期注入） |
| `MACHINE_ID` | — | 进程 PID % 1024 | 雪花 ID 机器 ID（0-1023）；多实例建议显式指定 |

### 数据库与备份

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `DATABASE_PATH` | — | `data/dependfix.sqlite` | SQLite 数据库文件路径（compose 注入 `/app/data/dependfix.sqlite`） |
| `DATABASE_TYPE` / `DATABASE_URL` | — | 自动推断 | 非 SQLite 后端（PostgreSQL 等） |
| `DATABASE_SSL` / `DATABASE_CHARSET` / `DATABASE_TIMEZONE` / `DATABASE_ENTITY_PREFIX` | — | 空 | 数据库连接调节 |
| `DATABASE_SYNCHRONIZE` | — | `false` | TypeORM 自动同步；⚠️ 生产禁止开启（[工程实践判例 EP-17](../design/governance/engineering-practice-notes.md)） |
| `DATABASE_MIGRATIONS_RUN` | — | 镜像内 `true` | 启动时自动执行 pending migration（全新库自动建表） |
| `DEPENDFIX_MIGRATIONS_ONLY` | — | `false` | 内部：迁移专用模式（`docker/init-db.sh` 使用） |
| `BACKUP_SKIP` | — | `false` | 跳过启动期备份（仅 e2e 等场景） |
| `BACKUP_RETENTION_COUNT` | — | `5` | 启动期备份保留份数 |

### 认证与社交登录

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `AUTH_MODE` | — | `public` | 认证模式：`enterprise`（OIDC SSO + 邮箱域名白名单）/ `public`（GitHub/Google OAuth + 邮箱域名黑名单） |
| `REGISTRATION_DISABLED` | — | `false` | 关闭注册（保留登录）；首个管理员注册后再设为 `true` |
| `ALLOWED_EMAIL_DOMAINS` | — | 空 | enterprise 白名单（逗号分隔）；空 = 关闭自动开通 |
| `BLOCKED_EMAIL_DOMAINS` | — | 空 | public 黑名单（逗号分隔） |
| `NUXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | — | 空 | 前端白名单提示（黑名单不暴露） |
| `BETTER_AUTH_TRUSTED_ORIGINS` | — | 空 | trustedOrigins 显式列表（逗号分隔，反代 / 多域） |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | 空 | GitHub OAuth（public 模式；两者齐备才启用） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | 空 | Google OAuth（public 模式；两者齐备才启用） |
| `OIDC_DISCOVERY_URL` / `OIDC_ISSUER` | — | 空 | OIDC SSO（enterprise；discovery/issuer + clientId + clientSecret 齐备才启用） |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | 空 | OIDC 客户端凭据 |
| `OIDC_AUTHORIZATION_URL` / `OIDC_TOKEN_URL` / `OIDC_USERINFO_URL` / `OIDC_SCOPES` | — | 空 / `openid,profile,email` | 无 discovery 的 IdP 手动端点覆盖 |

### 邮件（SMTP）

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | 空 / `587` | 配置后启用邮箱验证与密码重置；未配置自动跳过 |

### 扫描队列与 Redis

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `REDIS_URL` | — | `redis://127.0.0.1:6379` | BullMQ 队列；Redis 可达 + 版本 ≥ 5.0 + 有消费者时异步，否则降级同步。默认 compose 将容器内 `NUXT_REDIS_URL` 硬编码为 `redis://redis:6379`（指向内置 redis），本变量仅自行编排 / 直连进程时生效 |
| `QUEUE_ENABLED` | — | `auto` | `auto` / `true`（强制异步）/ `false`（强制同步）。compose 白名单内（→ `NUXT_QUEUE_ENABLED`） |
| `QUEUE_JOB_RETRIES` / `QUEUE_BACKOFF_MS` | — | 空 | 队列任务重试次数 / 退避毫秒（compose 白名单内 → `NUXT_*`） |
| `QUEUE_WORKER` → `DEPENDFIX_QUEUE_WORKER` | — | compose `1` / 入口 `0` | 独立 worker 进程消费队列（消除 BullMQ 锁续期失败）；`0` 回退单进程。⚠️ **compose 侧名为 `QUEUE_WORKER`** |
| `DEPENDFIX_QUEUE_WORKER_SOCKET` | — | `/tmp/dependfix-queue-worker.sock` | worker 内部 socket 路径（白名单外，容器内名） |
| `DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS` | — | `300` | worker 连续快速失败超上限后的慢重试间隔（秒，范围 1-3600，非法 / 0 回退 300）；不永久放弃重启，避免任务无声挂起。compose 已转发 |
| `DEPENDFIX_ROLE` | — | 入口按进程注入（worker / server） | 进程角色：`worker` 跳过 HTTP-only 插件（周期清理 / 版本戳），避免重复 DB 查询与日志噪声；单进程形态由入口归一化为 `server`（等价于未设置：不跳过任何插件）；直连进程不设置。白名单外，容器内名；口径见 [platform.md §10.6](../standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程) |
| `IN_PROCESS_WORKER` → `NUXT_IN_PROCESS_WORKER` | — | `true`（compose）/ `false`（直连进程） | 进程内 worker（单进程部署唯一消费者）；默认值以 compose 转发为准 |
| `STALE_CLEANUP_INTERVAL_MS` | — | `300000` | 孤儿任务清理节拍（毫秒） |
| `STALE_CLEANUP_RUNNING_GRACE_MS` | — | `300000` | running run 超过执行超时后的宽限期（毫秒，> 0；非法 / 0 回退默认）；超过即判 `orphan_run`。compose 已转发 |
| `STALE_CLEANUP_PENDING_GRACE_MS` | — | `300000` | pending run 在「无消费者 / job 归属终态」时进入孤儿判定前的最短等待（毫秒，> 0；非法 / 0 回退默认）；无消费者分支额外要求 job 年龄 ≥ 2× 该值。compose 已转发 |

### 执行器 / 沙箱 / 扫描

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `RUN_WORK_ROOT` | — | `data/runs` | 运行工作根目录（clone / 执行产物） |
| `EXECUTION_TIMEOUT_MS` | — | `1800000`（30 分钟） | 单仓库执行超时；容器执行器与队列 Worker 锁时长同源联动（`resolveExecutionTimeoutMs()`）。越界（< 1 分钟 / > 24 小时）/ 非法值回退默认 |
| `DEPENDFIX_INSTALL_TIMEOUT_MS` | — | `300000`（5 分钟） | 安装类命令超时（引擎内依赖安装与锁文件修复链共用一处解析器）；越界（< 10 秒 / > 30 分钟）/ 非法值回退默认。超时后引擎按运行级取消终止子进程树 |
| `DEPENDFIX_VERIFY_TIMEOUT_MS` | — | `600000`（10 分钟） | 验证链单命令超时（默认链与 CI 镜像脚本共用，**默认链内的 `pnpm install` 仍按本条计时**；修复器安装链的 `DEPENDFIX_INSTALL_TIMEOUT_MS` 不受影响）；严格正整数且落在 10 秒–30 分钟，越界 / 非法回退默认 |
| `CLONE_TIMEOUT_MS` | — | `300000` | git clone 超时（毫秒） |
| `CLONE_MAX_RETRIES` | — | `3` | clone 最大重试次数 |
| `PNPM_CONFIG_STORE_DIR` | — | `/app/data/pnpm-store`（入口派生） | 目标仓库依赖安装共用的 pnpm store 目录：默认在数据卷内，跨 run / 容器重建复用。入口以**运行身份写探针**判定可用性（覆盖只读挂载）；不可用（只读 / 权限不足 / 非绝对路径）时 warn 并回退 `$HOME` 下 pnpm 默认位置（每次冷安装，不阻断）。自定义路径的父目录须对 `PUID`/`PGID` 可进入，且与 `RUN_WORK_ROOT` 同文件系统才走硬链接。清理用 `pnpm store prune`（见 [pnpm store 与依赖缓存](./deployment.md#pnpm-store-与依赖缓存)） |
| `SANDBOX_RUNTIME` | — | `runc` | 沙箱 OCI runtime |
| `SANDBOX_IMAGE` | — | `dependfix-platform:latest` | 沙箱镜像 |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | — | 空 | 出站代理（引擎验证阶段） |
| `DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING` | — | `false` | 抑制「本地非容器执行」安全警告（仅本地排障） |
| `ACTION_STATUS_MONITOR_ENABLED` | — | `false` | 依赖更新 PR check 状态监测总开关；启用前需 PAT credential + 有 PR 活动 |
| `DEPENDFIX_AI_PROVIDER` / `_MODEL` / `_BASE_URL` / `_API_URL` / `_API_KEY` / `_TRIGGER` | — | 空 | 平台扫描内引擎的 AI 研判配置（按组织级 AI 配置注入） |

> **资源建议**：控制面（仅 UI / API）最低 1 CPU / 1 GB；默认单容器 / worker 执行安装与验证时建议 ≥ 2 CPU / 8 GB（4 GB 已验证会 OOM）。启动日志 `[resource]` 会打印 cgroup / 宿主内存上限与并发；低于建议仅 `warn`，不阻断。运行记录 `scan_run` 的 `memory_max_bytes` / `peak_rss_bytes` / `oom_killed` 可查询，不可采集时为 `NULL` 且原因见 `resource_json.degradedReason`。Redis 不可用 / 入队失败时 HTTP 进程会降级同步执行，此时同样按执行面 8 GB 准备。详见 [Docker 部署 → 资源规格](./deployment.md#资源规格)。

### 通知

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `DEPENDFIX_NOTIFICATION_ENABLED` | — | `true` | 通知总开关；`false` 熔断全部邮件（含平台事件） |
| `DEPENDFIX_NOTIFICATION_RECIPIENT_CAP` | — | `50` | 单封邮件收件人上限 |
| `DEPENDFIX_ENV_ALERT_RECIPIENTS` | — | 组织内 admin/org_admin 邮箱 | 环境告警邮件收件人（逗号分隔，覆盖默认） |
| `DEPENDFIX_WEEKLY_DIGEST_HOUR` | — | `9` | 周汇总触发小时（0-23，服务器时区；非法值回退 9）；组织与个人同时开启后生效 |
| `DEPENDFIX_LOCALE` | — | `zh-CN` | 通知邮件语言（`zh-CN` / `en-US`） |

### 日志

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `LOG_DIR` | — | `/app/data/logs`（入口派生 `$DATA_DIR/logs`） | 进程级日志目录（按日轮转 + 31 天保留；错误另落 `YYYY-MM-DD.errors.log`）。自定义 `DATA_DIR` 时跟随数据卷；自定义路径建议用绝对路径 |
| `LOG_LEVEL` | — | `info` | 日志级别：`error` / `warn` / `info` / `http` / `verbose` / `debug` / `silly`；控制台与文件同级过滤；非法值回退 `info` 并输出 warn |
| `LOGFILES` | — | `true` | 是否写文件（`true/false` · `1/0` · `yes/no` · `on/off`）；`false` 时仅保留 stdout / stderr（`docker logs` 仍可用），非法值回退默认并 warn。目录不可写时自动回退控制台并 warn |

> 通道分工：进程级日志（启动 / 队列 / 执行器 / 通知）走统一 logger 落文件；单次 run 的引擎输出仍由 `MemoryLogger` 收集到 `ScanRun.logsJson`（控制台可见，不重复写日志文件）。排障命令与保留策略见 [Docker 部署 → 日志文件](./deployment.md#日志文件)。

### Docker / 部署

| 变量 | 必填 | 默认值 | 说明 |
|:---|:---:|:---|:---|
| `PUID` / `PGID` | — | `100` / `101` | 运行身份（数据卷与 `$HOME` 所有权）；为 `0` 时入口 fail-closed 拒绝启动 |
| `RUN_USER` | — | `dependfix` | 运行用户名 |
| `DEPENDFIX_ALLOW_ANY_DIR` | — | `0` | 放开 chown 作用域到 `/app` 与 `/home` 之外（高级用法） |
| `DEPENDFIX_IMAGE` / `DEPENDFIX_BUILD_IMAGE` | — | `caomeiyouren/dependfix:latest` / `:local` | 镜像选择 / 本地构建镜像名 |
| `DEPENDFIX_USE_LOCAL_BUILD` | — | `0` | 部署脚本使用本地构建镜像 |
| `NUXT_BUILD_VERSION` / `NUXT_BUILD_COMMIT` | — | `unknown` | 部署产物版本戳（构建期 `--build-arg` 注入，运行时只读，经 `GET /api/health` 与启动日志核对；同一值作为每次 run 的构建版本回执落库并在运行详情展示；部署侧一般无需设置） |

> **内部 / 测试变量**（生产勿设）：`NODE_ENV` / `E2E_TEST` / `NUXT_E2E_FIXTURES_ALLOWED` / `AUTH_TRACE` / `CI`——口径见 `apps/platform/.env.full.example` §10。CLI 与 MCP 的变量（`DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_MCP_REPORT_DIR` / `PNPM_VERSION` 等）见本文档前文与对应包 README。
