# 配置说明

## 配置来源（按优先级）

1. CLI 参数
2. 环境变量（`DEPENDFIX_*` + `GITHUB_TOKEN`）
3. 配置文件（`dependfix.config.json` / `dependfix.config.yaml`，计划中 M4+）
4. 默认值

## 全部配置项

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
| `alertSource` | `DEPENDFIX_ALERTS_SOURCE` | `string` | `github-dependabot` | 告警数据源：`github-dependabot`（GitHub Dependabot alerts API）/ `pnpm-audit`（本地无 token 回退，扫描当前工作区 lockfile；repository 解析优先显式 `--repo` → git remote → `local` 兜底）。`pnpm-audit` 下不要求 token、不支持 `fix-and-pr` 模式与多个 `--repo`。详见 [pnpm audit fallback 设计](../design/packages/pnpm-audit-fallback.md) |
| `codeScanningEnabled` | `DEPENDFIX_CODE_SCANNING` | `boolean` | `false` | 是否同时拉取 Code Scanning alerts（与 Dependabot **并行源**，非回退；默认关闭，行为与 M2 一致）。开启后 Dependabot + Code Scanning 并行拉取、互不覆盖；Code Scanning 告警默认不可自动修复（A/B/C 规则分层按规则启用）。需要 token 具备 `security-events: read` 权限（GITHUB_TOKEN 默认具备）；`pnpm-audit` 本地数据源下不可用。详见 [Code Scanning 设计](../design/packages/data-model.md) |
| `allowMajorUpgrade` | **无 env 通道**（仅 CLI `--allow-major-upgrade`） | `boolean` | `false` | 跨线告警（推荐版本跨大版本，当前线内无修复版本）显式授权自动升级：仅根 package.json 直接依赖（workspace 成员独占声明维持人工）且 lockfile 单版本的告警自动跨线升级，升级后复核脆弱实例消除、强制完整验证（install+lint+build），失败自动回滚；间接依赖 / 多版本共存跨线告警维持人工处理。**刻意不提供 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 环境变量**（配合 action.yml 不暴露 input → GitHub Action 结构性禁用，防止 CI 自动跨线引发意外破坏）。风险详见 [quick-start.md 跨大版本升级章节](../guide/quick-start.md) |
| `maxAlertsPerRepository` | `DEPENDFIX_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | 每仓库最大告警处理数 |
| `maxConcurrency` | `DEPENDFIX_MAX_CONCURRENCY` | `number` | `1` | 多仓库并发窗口（1-16，默认 1 保守串行）。`>1` 时输出警告（可能触发 GitHub 限流）；**仅 `report-only` 模式允许并发**——`fix` / `fix-and-pr` 共享单一 workDir，并发写存在快照覆盖 / 互踩回滚 / install 竞争，配置校验 fail-fast 拒绝 |
| `maxRetries` | `DEPENDFIX_MAX_RETRIES` | `number` | `3` | GitHub API 限流重试次数（0-10；0=关闭）。对 429 / primary rate limit（403 + remaining=0）/ secondary rate limit（403/429 特征）指数退避重试（reset 头优先，上限 30s）；权限类 403 不重试 |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | 用户显式依赖分组（覆盖自动分组），格式 `name1:pkg1,pkg2;name2:pkg3`（分号分隔组、冒号分隔组名与包列表、逗号分隔包名）。缺省时使用自动分组：`dependabot.yml groups` → `@types` 归并 → scope/前缀启发式 → 单包。详见 [依赖分组设计](../design/packages/dependency-grouping.md) |
| `verbose` | — | `boolean` | `false` | 详细日志输出（仅 CLI `--verbose`） |
| `commands` | — | `string[]` | — | 自定义验证命令（仅 CLI `--commands`） |
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

- **GitHub Actions 内运行**：默认 `secrets.GITHUB_TOKEN` 自带 Contents:Write + Pull requests:Write，但**无 Dependabot alerts:Read**（详见 [roadmap.md M2 段](../plan/roadmap.md)，或 [archive/todo-archive-phases-m2-m55.md G2 处置记录](../plan/archive/todo-archive-phases-m2-m55.md#g2-处置记录github_token-无法访问-dependabot-alerts)）。两种方案：
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
| `git push` 卡在 `Username for 'https://github.com':` | 缺 HTTPS credential；dependfix 用 `stdio: 'pipe'`（详见 [engine/src/github/pr-creator.ts:201](../../packages/engine/src/github/pr-creator.ts)）导致 stdin 不可达 → 永久挂起 | 设置 `GITHUB_TOKEN` 环境变量或配置 git credential helper（不推荐交互式输入） |
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

> **计划中（M5）**：AI 研判相关配置（`AI_API_TOKEN`、`AI_API_BASE_URL`、`AI_MODEL`）将在 M5 与 AI 引擎联调时落地。

## 配置文件示例

> **计划中（M4+）**：配置文件支持尚未实现，当前仅支持 CLI 参数和环境变量。

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
```

> `GITHUB_TOKEN` 环境变量会被自动识别，无需额外配置前缀。`DEPENDFIX_GITHUB_TOKEN` 优先级高于 `GITHUB_TOKEN`。
