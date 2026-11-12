# 发布指南

本指南说明 `dependfix` 的 npm 发布流程、版本策略与发布自动化配置。

## 发布包清单

> **包清单单点声明**：发布包列表定义在 [scripts/packages.config.mjs](../../scripts/packages.config.mjs)（`publishable: true` 的包进入发布链路，`npmPublishable !== false` 的包进入 npm 发布）。
> 新增发布包时：① 在该文件登记；② 补充包 README；其余（changelog 生成、release 计划映射、CI 校验）自动生效。

当前 Monorepo 的发布单元：

| 包 | 说明 | npm 地址 |
|----|------|----------|
| `dependfix` | CLI 应用入口（含 `dependfix` bin 命令，薄壳：参数解析 + runner） | https://www.npmjs.com/package/dependfix |
| `@dependfix/core` | 核心领域模型库 | https://www.npmjs.com/package/@dependfix/core |
| `@dependfix/engine` | 执行引擎（编排/采集/修复/研判，cli/mcp/platform 共享） | https://www.npmjs.com/package/@dependfix/engine |
| `@dependfix/skills` | 产品 Agent Skill 权威源（`dependfix-remediator`，纯内容包） | https://www.npmjs.com/package/@dependfix/skills |
| `@dependfix/mcp` | MCP Server（stdio 传输，8 个 tool 暴露扫描/修复能力） | https://www.npmjs.com/package/@dependfix/mcp |
| `@dependfix/platform` | Nuxt 管理平台（控制面：仓库/凭据管理、扫描触发、结果展示）—— **不发布到 npm，仅 docker 通道** | — |

> 依赖关系：`dependfix` 依赖 `@dependfix/core`、`@dependfix/engine` 与 `@dependfix/skills`（运行时解析 skill 内容）；`@dependfix/engine` 依赖 `@dependfix/core`；`@dependfix/mcp` 依赖 `@dependfix/core` 与 `@dependfix/engine`；`apps/platform` 依赖 `@dependfix/core`、`@dependfix/engine` 与 `dependfix`（仅 build 期，不进入发布图）。npm 发布顺序：被依赖方先行（`@dependfix/core` → `@dependfix/engine` → `@dependfix/skills` → `dependfix` → `@dependfix/mcp`）。`@dependfix/platform` 走 `npmPublishable: false` 的 tag-only 分支：跳过 `pnpm publish` 但仍创建 annotated tag，与 docker publish 通道协作（详见"platform 发布通道"）。

### platform 发布通道（独立于 npm）

`apps/platform` 是 Nuxt 应用而非 npm 库，参与 release 链路的目的是"版本号 + CHANGELOG + git tag"三件套，与 docker 镜像协作：

- **版本号**：`apps/platform/package.json:version` 独立递增，semver 由 `release:version` 维护（dependency backflow：core/engine/cli 升级时 platform 至少 patch 跟随）
- **CHANGELOG**：`apps/platform/CHANGELOG.md` 由 `pnpm changelog` 按 `path: 'apps/platform'` 过滤生成（与其他 5 个 npm 包走同套 `scripts/changelog.mjs` 流水线）
- **Git tag**：`release:publish` 检测 `npmPublishable === false` → action `tag-only`：跳过 `pnpm publish`、仍创建 `@dependfix/platform@<x.y.z>` annotated tag（保证 changelog 历史可比）
- **Docker tag**：`release.yml` 完成后主动 `workflow_dispatch docker.yml`，传 `platform_version` 入参；docker.yml 仅在 inputs 非空时打 `platform-<x.y.z>` tag（与 `latest` + `YYYY-MM-DD` + `sha-<short>` 三元组并列；master push 触发时 inputs 为空，仅打原三元组）
- **版本号治理**：`apps/platform` 加入 `packages.config.mjs` 的 `PACKAGES` 列表（`publishable: true / rootChangelog: false / publishOrder: 6 / npmPublishable: false`）；依赖 `dependabot` 的 `apps/platform/package.json` 排除（避免 dependabot 接管平台版本）
- **历史背景**：platform 改动历史已聚合进根 CHANGELOG 的 `dependfix@x.y.z` 段（如 `dependfix@0.3.3` 段内 `**platform:**` scope 多条），T1310 后改为独立 `apps/platform/CHANGELOG.md`，根段不再以 platform 内容为主。

## 版本策略

> **1.0 门槛**：1.0.0 的发布条件（G1-G8：安全清零 / 契约冻结 / 真实环境 E2E / CI 稳定性 / 覆盖率 / 文档 / 运维 / 产品指标）与批次计划见 [1.0 发布门槛与就绪度台账](../design/governance/release-1.0-readiness.md)。1.0.0 的**差异清单与发布说明骨架**见 [1.0.0 发布清单与发布说明骨架](release-1.0.md)（版本锚点 / 门禁 / 回滚 / 校验和 / 已知限制）。

- **0.x 即预览版**：当前处于开发阶段，`0.1.0` 及后续 `0.x` 版本直接作为 `latest` 发布，**不加 `beta` 等预发布后缀**。理由：
  - `0.x` 在 semver 中本身就是"初始开发、API 不稳定"语义，已充分表达预览状态；
  - npm 默认不安装带预发布后缀的版本（需显式 `dependfix@beta`），会给预览测试设置障碍。
- **稳定信号来自 `1.0.0`**：`1.0.0` 已于 2026-11-07 发布，`@v1` 滚动 tag 已启用（GitHub Action 引用写作 `@v1`）。
- **tag 推送纪律**：git 默认不推送 tag——本地开发建议 `git config --global push.followTags true`（日常 push 自动带 annotated tag）；补打 tag 后必须显式 `--tags` 推送并核验（教训见 [经验归档 §二十六](../design/governance/experience-archive.md)）。
- 版本号由自研 release 脚本管理：`pnpm release:plan` 基于 git log 自动推导各包 bump 级别（见"release:plan 生成规则"），可人工修正；`pnpm release:version` 执行版本提升（含依赖传导）；CHANGELOG 由 `pnpm changelog` 基于 conventional commits 生成（见"CHANGELOG 策略"）。设计文档见 [release-pipeline.md](../design/governance/release-pipeline.md)。

## 1.0 契约冻结与迁移

`1.0.0` 起对外契约冻结：**CLI 参数与运行模式 / Action inputs / 运行时配置与环境变量 / 报告 JSON 字段 / 平台 DB 表列**，1.x 内只增不改不删。完整清单、机检口径、弃用策略与 0.x→1.0 迁移步骤见[契约冻结清单与迁移指南](contract-freeze.md)。

- **机检**：`pnpm run check:contract-freeze`（已接入 `gates:docs`，Test / Release / 周回归同一集合）——键位从 `argsDef` / `action.yml` / `RuntimeConfig` / `RunResult` / 实体元数据抽取，与清单比对，差异即失败；同时校验 zh / en quick-start 的 CLI 参数表。
- **发布前确认**：发 `1.0.0` 前该门禁必须为绿，且迁移指南已覆盖本轮全部已发生的行为变更（0.x 期间的破坏性变更集中在引擎交付链导出异步化与 `--version` 元数据缺陷）。
- **弃用**：标记后至少保留 1 个 minor，移除只在 `2.0.0`（与[1.0 发布门槛与就绪度台账](../design/governance/release-1.0-readiness.md)的 semver 承诺一致）。

## 发布架构

| 阶段 | 触发方式 | 认证方式 | 发布命令 |
|------|----------|----------|----------|
| 首次发布 `0.1.0` | 手动（一次性） | npm 账号登录（`npm login`） | `pnpm publish`（本地） |
| 后续版本 `0.1.1+`（0.x 阶段） | **`workflow_dispatch` 手动触发** | **OIDC Trusted Publishing**（无 `NPM_TOKEN`） | `pnpm release:publish`（CI） |
| `1.0.0+`（正式版） | **手动 `workflow_dispatch`**；定时自动发布需用户另行授权 | OIDC Trusted Publishing | `pnpm release:publish`（CI） |

> **0.x 阶段仅手动发布**：`release.yml` 未启用 `on.push` / `on.schedule` 自动触发（每次推送触发 release 不符合 0.x 预览期的发布节奏）。定时自动发布配置已按 momei 模式内嵌（每周六 UTC+0 12:00 = UTC+8 20:00），但**1.0.0 发布后仍需用户另行授权**才可取消 `schedule` 注释（M54 明确不启用自动发布；启用前置见「自动发布启用清单」）；发布前安全告警门禁已在 `release.yml` 内强制执行（见「发布前安全检查」），定时发布同样受约束。自动发布逻辑（版本提升 + 日志生成 + 提交推送）无需额外配置。
>
> 发布底层始终是 **`pnpm publish`**（`release:publish` 内部调用它），它会自动把 `workspace:*` 依赖替换为实际版本号，保证发布产物可被消费者正常安装。**不要改用裸 `npm publish`**：npm 不会替换 `workspace:*`，会把字面量发布到 registry。

## 发布前安全检查（安全告警门禁）

每次发布（首次手动发布、`release:version` + `workflow_dispatch`、定时发布）都必须通过安全告警门禁。规则权威声明见 [安全规范 §5.9](../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)；完整阻断顺序清单（含依赖审计与平台构建）与实测时长见 [发布管线设计 §4.5](../design/governance/release-pipeline.md#_4-5-发布前门禁清单与实测时长-2026-11-12-m58-2)。

- **CI 强制**：`release.yml` 在 `Auto version` 之前做只读预检、在 `release:publish` 之前做阻断判定（均为 `pnpm run check:release-security`）；critical 一律阻断（含 dismissed，禁止豁免），high 只有登记在 [`.github/release-security-exemptions.json`](../../.github/release-security-exemptions.json) 台账才放行（dismissed 同样需要），moderate / low 不阻断。token 缺失 / API 401·403·404 / 超时 / 级别无法判定均 fail-closed，不会当作「无告警」。
- **本地备用通道同样强制**：`pnpm release:publish` 在真正执行 `pnpm publish` / 打 tag 前自动运行同一门禁脚本，非零即中止——不再依赖人工「记得先跑一次」。dry-run 与纯跳过轮次（无 npm 发布、无新包 tag）不执行门禁，避免无谓消耗外部 API。**唯一绕过**是 `pnpm release:publish --skip-security=<理由>`：缺理由 / 空理由直接非零退出；带理由时理由进终端摘要，**必须**写入发布证据——绕过不等于通过。
- **本地核对与 secret**：本地可先跑 `GH_PAT=<token> pnpm run check:release-security` 提前暴露问题（不替代 CI）；Dependabot alerts 无法用 `GITHUB_TOKEN` 读取（恒 403），仓库需配 `GH_PAT`（fine-grained 仅 `Dependabot alerts: read`，classic 需 `security_events`）；Code Scanning 用 workflow 的 `GITHUB_TOKEN` + `security-events: read`，不要求 PAT 具备该权限。
- **豁免**：high 需在台账登记 9 个字段并同步 [backlog.md](../plan/backlog.md)；open 告警用 `no-fix` / `hard-fix`，dismissed 误报用 `false-positive`，Code Scanning 必须按实例 `location` 登记（同一 rule 不同文件分别登记）。新增条目须维护者批准（AI 不得自行豁免），见 [§5.9](../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)。复核条件满足（如上游发布修复版本）后立即移除；stale 台账只告警不阻断。

## 前置配置（一次性）

### 1. npmjs.com 配置 Trusted Publisher

为每个包分别配置（**每个包只能配置一个 Trusted Publisher**）：

1. 打开 `https://www.npmjs.com/package/<包名>/access`（注意是包级设置页，不是账号设置页）；
2. 在 **Trusted Publisher** 区域点击添加；
3. 选择 GitHub Actions 并填写：
   - **Organization or user**: `dependfix`
   - **Repository**: `dependfix`
   - **Workflow filename**: `release.yml`
   - **Allowed actions**: `npm publish`
4. 五个包（`dependfix`、`@dependfix/core`、`@dependfix/engine`、`@dependfix/skills` 与 `@dependfix/mcp`）都要配置。

> ⚠️ 包必须已存在于 npm 上才能配置 Trusted Publisher（npm/cli#8544）。因此尚未发布的新包（如 `@dependfix/engine`、`@dependfix/mcp`）的首次发布必须先手动完成（见下），之后才能配置并启用 OIDC。

### 2. package.json 元数据

`repository.url` 建议与 GitHub 仓库保持一致（`dependfix/dependfix`，大小写敏感）：OIDC 的匹配依据是 npmjs.com 上配置的 Trusted Publisher，provenance 依据 GitHub Actions 环境，两者虽不读取该字段，但保持正确有利于 npm 包页展示与发包工具校验：

```json
{
    "homepage": "https://github.com/dependfix/dependfix#readme",
    "repository": {
        "type": "git",
        "url": "git+https://github.com/dependfix/dependfix.git"
    },
    "bugs": {
        "url": "https://github.com/dependfix/dependfix/issues"
    }
}
```

### 3. CI 环境要求

- **pnpm 版本**：发布走 `pnpm publish` 的 OIDC 路径。pnpm 11.0.3 存在 OIDC 回归（pnpm/pnpm#11566，已修复），CI 使用 `pnpm/action-setup@v4` 默认解析的最新 pnpm（11.x 后期 / 12.x）即可；
- `release.yml` 已配置 `permissions: id-token: write` + `security-events: read`（Code Scanning 读取）。
- **`GH_PAT` secret（Dependabot alerts）**：Dependabot alerts API 无法用 `GITHUB_TOKEN` 读取（恒 403 `Resource not accessible by integration`），需在 Settings → Secrets and variables → Actions 配置 `GH_PAT`（fine-grained 仅 `Dependabot alerts: read`，classic 需 `security_events`）。缺失时发布前安全门禁 fail-closed，发布中止。

## 首次发布（0.1.0，手动，一次性）

> 前置条件：`pnpm publish` 默认执行 gitChecks（当前分支为 `master`、工作区干净、与 remote 同步），不满足会中止发布。先确认：

```bash
git branch --show-current            # 期望 master
git status --porcelain               # 期望无输出（工作区干净）
git fetch && git log HEAD..@{u}      # 期望无输出（无落后提交）
```

正式发布：

```bash
# 1. 质量门全绿 + 发布前安全检查通过（告警门禁见「发布前安全检查」一节）
pnpm run lint:check
pnpm run lint:css:check
pnpm typecheck
pnpm test
pnpm build

# 2. 检查包内容（确认 dist / bin / README / LICENSE 都在；@dependfix/skills 为纯内容包，确认 dependfix-remediator/ 与 README 在发布内容中）
pnpm --filter @dependfix/core pack --pack-destination "$env:TEMP"   # Windows PowerShell
pnpm --filter @dependfix/engine pack --pack-destination "$env:TEMP" # Windows PowerShell
pnpm --filter @dependfix/skills pack --pack-destination "$env:TEMP" # Windows PowerShell
pnpm --filter dependfix pack --pack-destination "$env:TEMP"        # Windows PowerShell
pnpm --filter @dependfix/mcp pack --pack-destination "$env:TEMP"   # Windows PowerShell
# bash/zsh 使用：pnpm --filter @dependfix/core pack --pack-destination /tmp

# 3. 本地试跑构建产物
node packages/cli/dist/bin.mjs --help

# 4. npm 登录（一次性，pnpm publish 复用 npm 凭据）
npm login

# 5. 发布（顺序重要：被依赖方先行——@dependfix/core → @dependfix/engine → @dependfix/skills → dependfix → @dependfix/mcp）
#    必须使用 pnpm publish：它会替换 workspace:* 为实际版本
pnpm --filter @dependfix/core publish
pnpm --filter @dependfix/engine publish
pnpm --filter @dependfix/skills publish
pnpm --filter dependfix publish
pnpm --filter @dependfix/mcp publish

# 6. 打 tag（手动发布**不会**自动创建 tag，必须手动补打 `<pkg>@<version>` 格式：
#    changelog 分段锚点与 release:plan 推导基线都依赖它——参照 scripts/changelog.mjs 的
#    tags.prefix（`git rev-parse --verify <prefix><version>`）与 scripts/create-release-plan.mjs
#    的"最新 tag"基线解析；缺失时后续 changelog 分段会把全部历史并入当前版本段）
#    推荐用脚本辅助（自动检测"npm 已发布但本地无 tag"的版本并补打，锚点自动取
#    touch 该包路径的最新 commit，幂等可重跑）：
pnpm tag:released --dry-run    # 预览将创建的 tag（针对当前 package.json 版本，建议每次发布后立即执行）
pnpm tag:released              # 确认后执行补打
#    手动方式（锚点约束：每个 tag 必须指向"同时 touch 该包路径"的 commit，
#    见"CHANGELOG 策略"；锚点查询：git log -1 --format=%H -- packages/<path>）：
git tag @dependfix/core@0.1.0 <core-anchor>   # 指向 touch packages/core 的 commit
git tag @dependfix/engine@0.1.0 <engine-anchor> # 指向 touch packages/engine 的 commit
git tag @dependfix/skills@0.1.0 <skills-anchor> # 指向 touch packages/skills 的 commit
git tag dependfix@0.1.0 <cli-anchor>          # 指向 touch packages/cli 的 commit
git tag @dependfix/mcp@0.1.0 <mcp-anchor>     # 指向 touch packages/mcp 的 commit
git tag v0.1.0                                # （可选）GitHub Release 展示用
git push origin --tags
# 推送后核验（tag 曾因 CI 静默失败/本地漏推而长期不同步，教训见经验归档 §二十六）：
git fetch origin --tags && git tag | while read t; do git ls-remote --tags origin "$t" >/dev/null || echo "未同步: $t"; done

# 7. 验证
npm view dependfix version          # 期望 0.1.0，dist-tags.latest
npm view @dependfix/core version    # 期望 0.1.0
npm view @dependfix/engine version  # 期望 0.1.0
npm view @dependfix/skills version  # 期望 0.1.0
npm view @dependfix/mcp version     # 期望 0.1.0
npm view dependfix dependencies     # 期望 @dependfix/core 与 @dependfix/skills 为具体版本（非 workspace:*）
npm i -g dependfix && dependfix --version   # 或临时目录 npx dependfix --help

# 8.（可选）GitHub Release（仅 alpha / beta / rc 加 --prerelease；0.x 正式版不标，与 npm latest 一致）
gh release create v0.1.0 --generate-notes

# 9. 在 npmjs.com 为五个包配置 Trusted Publisher（见"前置配置"）
```

## 后续版本（0.1.1+）

### release:plan 生成规则

版本提升级别由 `pnpm release:plan`（`scripts/create-release-plan.mjs`）从 git log 自动推导，规则参照 semantic-release / conventionalcommits：

| commit 类型 | bump | 说明 |
|---|---|---|
| `feat` | minor | |
| `fix` / `perf` / `revert` | patch | |
| BREAKING（`!` 后缀或 `BREAKING CHANGE:` footer） | 0.x → minor；1.0.0+ → major | 0.x 阶段不直接跳到 1.0.0（0.x 语义中 minor 即可表达破坏性变更） |
| `refactor` / `docs` / `chore` / `build` / `ci` / `test` / `style` | 不 bump | 变更仍会进入 CHANGELOG，随同轮其他发布附带 |

- **包影响面**：按 commit 改动路径映射（`packages/core` → `@dependfix/core`、`packages/cli` → `dependfix`、`packages/skills` → `@dependfix/skills`）；依赖传导（如 core 升级后 cli 的依赖范围更新）由 `release:version` 的传导闭包自动处理，无需手动声明；
- **每轮只保留一个计划文件**：固定文件名为根目录 `release-plan.md`（gitignore 临时产物：生成 → 人工 review → `release:version` 消费后删除）；脚本检测到该文件已存在时会拒绝覆盖（防止丢失人工修正），需先删除或人工合并；
- **人工兜底（生成后必须 review）**：
  - breaking 判定只识别 commit 中显式标注的 `!` / `BREAKING CHANGE:` footer，未标注的破坏性变更（如以 `build:` 类型提交的纯 ESM 改造）需手动修正计划文件的 bump 级别；
  - 推导基线为最新 git tag，若存在"手动发布但未打 tag"的版本（如 `@dependfix/skills` 0.1.0 手动发布晚于 `v0.1.0` tag），推导会包含已发布内容——按实际发布决策剔除本轮不发布的包；
  - summary 仅为 git 追踪可读说明，不进 CHANGELOG（见"CHANGELOG 策略"），无需精心撰写。

### 常规流程

```bash
# 0.（可选）本地早期核对：无未豁免的 critical / high（CI 会在发布前强制执行同一门禁）
GH_PAT=<token> pnpm run check:release-security

# 1. 自动生成发布计划（从 git log 推导版本提升级别，生成 release-plan.md，见"release:plan 生成规则"）
pnpm release:plan

# 2. 人工 review release-plan.md：检查 bump 级别与包清单，剔除本轮不发布的包，
#    修正未标注 breaking 的破坏性变更；确认无误后继续

# 3. 版本提升（消费 release-plan.md：依赖传导计算 + 更新各包 package.json 版本，删除计划文件）
#    --dry-run 可先预览变更（版本计算 + 传导），不写回
pnpm release:version --dry-run   # 预览
pnpm release:version             # 确认后执行

# 4. 生成 CHANGELOG（基于 conventional commits 重新生成七份日志，见"CHANGELOG 策略"）
pnpm changelog

# 5. 审查并提交（含包级 CHANGELOG.md 与 package.json 版本变更）
git add -A && git commit -m "chore(release): 版本提升至 x.y.z"

# 6. push 到 master（提交本身不触发发布；0.x 阶段发布由手动 workflow_dispatch 触发）
git push origin master

# 7. 手动触发发布：GitHub Actions → Release → Run workflow（workflow_dispatch）
```

> **本地手动发布（备用通道）**：`pnpm release:publish --otp <6-8 位数字>`。脚本固定 `--registry https://registry.npmjs.org/`（不继承本机 pnpm / npm registry 配置，避免被只读镜像配置带偏），并把 OTP 透传给每个包的 `pnpm publish`；发布成功后需用户自行 `git push` + `git push --tags`。CI OIDC 仍是默认通道，本地发布仅用于 CI 不可用时的兜底。OTP 有时效（约 30 秒），过期直接生成新码重跑即可，脚本不缓存 OTP。
> 发布前脚本会自动执行安全告警门禁（与 `release.yml` 同一脚本、同一 fail-closed 口径）；本地缺 `GH_PAT`、网络不可达或存在未豁免 critical / high 时一律中止。确需在可控风险下绕过时用 `--skip-security=<理由>`，理由会打印到终端摘要并须写入发布证据（绕过不构成门禁通过）。

#### 发布链预演与安装实测（本地，不发版）

发布前用**真实 tarball** 走一遍「打包 → 安装 → 版本断言」，把 0.6.0 那类「发出去才发现 `--version` 报 0.1.0」的返工挡在发布前：

```bash
pnpm release:preflight                 # 打包 5 个 npm 包 → 临时工程安装 → 断言 dependfix --version == 包版本
pnpm release:preflight --no-install    # 仅打包 + tarball 内容校验（离线可用）
pnpm release:preflight --out-dir=artifacts/release-preflight   # 额外写 preflight.json
```

脚本断言（`scripts/release/preflight.mjs`）：tarball 内版本 == `package.json`、无残留 `workspace:` 协议、
`bin` / `main` / `exports` 入口都在包内、安装确实用本地 tarball（lockfile 含 `file:` 而非 registry 版本）、
预演前后 `git status` 不变。实测（2026-11-01，HEAD `0ebed2b2`）：

| 路径 | 命令 | 结果 |
|:--|:--|:--|
| tarball 安装 | `pnpm release:preflight` | `dependfix --version` = `0.6.0`（= cli 包版本，元数据修复在打包产物上成立） |
| npx（本地 tarball） | `npx --yes -p ./dependfix-0.6.0.tgz dependfix --version` | `0.6.0` |
| 全局安装 | `npm i -g --prefix <tmp> ./dependfix-0.6.0.tgz` → `<tmp>/bin/dependfix --version` | `0.6.0` |
| Docker | 见下「Docker 镜像复核」 | 本环境不可复核（凭据 / 网络），已记录重试条件 |

已知边界：`pnpm pack` 打包的是当前 `dist`，必须先 `pnpm run build`（`release.yml` 已把 preflight 放在 build 之后）；
外部依赖仍需 registry（默认官方，临时工程用 `.npmrc` 钉住），离线环境用 `--no-install` 只做 tarball 校验。
安装使用 `--ignore-scripts`（当前 5 个包无原生依赖）；若未来引入需构建的原生依赖，应对 cli 补一次不带
`--ignore-scripts` 的安装。脚本依赖系统 `tar`（Linux / macOS / Windows 10+ 自带）；CI 仅在 `ubuntu-latest` 验证。

#### Docker 镜像复核（0.6.0 / 0.7.0）

- **静态检查**：`docker buildx build --check -f apps/platform/Dockerfile .` → `Check complete, no warnings found`。
- **`platform-x.y.z` tag 未落地（已定位）**：0.6.0 的 docker `workflow_dispatch` 运行 `40745976335`（2026-10-28T18:31Z）的 build job 触及 **120 分钟 job 上限**被 kill（build step 已跑 115.5 分钟），`platform-0.4.0` 从未推送。修复：build job `timeout-minutes` 提到 240 分钟（**已由 0.7.0 派发确认：build 22m03s，余量充足**）；发布构建单列并发组并禁用取消（多架构 QEMU 构建耗时长，被后续 push 取代会白烧算力）；`release.yml` 改为 `--ref v<锚版本>` 派发，镜像内容钉在发布提交上。根治方向（原生 arm runner / 按架构拆 job）已于 1.0.0 实施，见「1.0.0 发布记录」镜像段。
- **补发旧版本镜像的约束**：`release.yml` 以 `--ref v<锚版本>` 派发，GitHub 按**该 tag 上的 workflow 文件**执行。对修复前创建的旧 tag（如 `v0.6.0`，其 `docker.yml` 仍是 120 分钟上限 + `cancel-in-progress: true`）不能用该路径补发；也不要用 `--ref master`（构建的是 master HEAD 内容，与版本不对应）——须新建指向该发布提交的临时分支后 `--ref <branch>`，或直接发新 tag。
- **本环境无法复核远端镜像**：GHCR 包为私有且本地 token 缺 `read:packages`；`registry-1.docker.io` 连接超时。重试条件：拿到 `read:packages` token 或 Docker Hub 可达后执行
  `docker buildx imagetools inspect ghcr.io/dependfix/dependfix:platform-<平台版本>`（应见 `linux/amd64` + `linux/arm64`），再以 `docker run --rm` 拉起镜像核对 `/api/health` 的 `version` / `commit`。
- **0.7.0 镜像已由 `workflow_dispatch` 发布，`platform-0.5.0` 存在（2026-11-03 复核）**：运行 `41439905381`（`--ref v0.7.0`，`platform_version=0.5.0`，success）产出四标签 `latest` / `2026-11-02` / `platform-0.5.0` / `sha-a049a56`，Docker Hub 与 GHCR 同步；ACR 为 amd64-only tag（见下）；`BUILD_VERSION=0.5.0` 随构建注入；多架构导出 manifest list `sha256:71f6633…a244f1`（`linux/amd64` + `linux/arm64`）。**build job 实测 22m03s**（11:54:24→12:16:27，预算 240 分钟余量充足，0.6.0 的 115.5 分钟不再复现）。注意：push 路径本身只产 `latest` / 日期 / `sha-*`，**`platform-x.y.z` 必须由 dispatch 带 `platform_version` 产生**。
- **阿里云 ACR 复核（2026-11-05，用户指定通道）**：公开仓库 `registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-0.5.0` 可匿名拉取，`docker run` 冒烟 **PASS**——`/api/health` 返回 `{"version":"0.5.0","commit":"a049a561…"}`、15 张业务表、迁移专用模式通过。**但该 tag 在 ACR 解析为单一 amd64 manifest**（`sha256:a6d5c93…`）：index `sha256:71f6633…` 虽按 digest 可取（内含 amd64 `6f3231a` + arm64 `df1d5a2`），标准客户端在 amd64 主机按 tag 只得到 amd64（0.5.0 样本；1.0.0 起 digest 合成后 registry 回读为双平台 index，arm64 主机实际拉取未实测）→ **ACR 不能作为 arm64 运行证据**；双架构需 GHCR（需 `read:packages`）或 Docker Hub，或按 OCI digest 拉取。**通道定位**：ACR 个人版 = **amd64 备份通道**（健康复核可用），双架构主通道为 GHCR / Docker Hub；口径见[发布管线设计 §4.7](../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5)。
- **GHCR / Docker Hub 复核仍 blocked**：GHCR `failed to fetch anonymous token ... 401 Unauthorized`（token 缺 `read:packages`），Docker Hub `dial tcp ...:443: i/o timeout`；标签与 digest 取自运行日志（metadata 步骤与 buildx 导出），**不是**客户端 `imagetools inspect` 实测。**前置条件**：具备 `read:packages` token 或 Docker Hub 可达。
- **对 1.0.0 的含义**：1.0.0 的 `platform-1.0.0` 同样**必须走 `release.yml` 派发**（本地发布通道不会自动派发）。**注意**：0.7.0 这次 22 分钟**不能**作为 1.0.0 的预算证明——1.0.0 首次 QEMU 构建实测 4 小时超时被取消，已改为原生多架构（见下方「1.0.0 发布记录」）。ACR 侧按 tag 行为依推送路径而变（0.5.0 单 amd64；1.0.0 起回读双平台 index，arm64 主机未实测），arm64 用户应使用 GHCR（需 `read:packages`）或 Docker Hub。

### 0.7.0 发布记录（M54.2，2026-11-02 已执行）

> 目的：补发 `--version` 元数据修复并演练 M53 修正后的发布链；锚版本 `0.7.0` 由 `release:plan` 推导（不人工降级为 patch）。**执行方式 = 本地手动发布**（用户 2026-11-02 执行）：发布 4 个 npm 包 + 六个 tag + GitHub Release；镜像另经 `docker.yml` 派发（`--ref v0.7.0`，`platform_version=0.5.0`，运行 `41439905381` success）补齐 `platform-0.5.0`，GHCR / Docker Hub 客户端复核仍 blocked；ACR health 已通过（见下节）。1.0.0 的差异清单与发布说明骨架见 [1.0.0 发布清单与发布说明骨架](release-1.0.md)。

**发布前门禁（2026-11-01 实测）**

1. `pnpm run check:release-security` PASS：Code Scanning 开放 **0 条**（M53.4 命中的 high `js/incomplete-multi-character-sanitization` = alert 30 已 `fixed`）；Dependabot 开放 2 条 moderate / low（不阻断）。
2. `pnpm verify:changelog` / `pnpm run gates:docs`（20 项）/ `pnpm run lint:check`（0 error）/ `pnpm typecheck`（7 项目）/ 全量 `pnpm test`（5713 passed）全绿。
3. `pnpm release:preflight --out-dir=artifacts/m54.2/preflight` PASS（2026-11-02 复跑留证）：临时工程安装后 `dependfix --version = 0.7.0`（= cli 包版本，元数据修复在打包产物上成立）；`preflight.json` 中 `version` 为 `0.7.0`。

**发布的版本与 tag（2026-11-02）**

| 通道 | 版本 | tag / 产物 |
|:--|:--|:--|
| `dependfix`（CLI，锚版本） | `0.7.0` | `dependfix@0.7.0` + `v0.7.0` |
| `@dependfix/core` | `0.7.0` | `@dependfix/core@0.7.0` |
| `@dependfix/engine` | `0.6.0` | `@dependfix/engine@0.6.0` |
| `@dependfix/mcp` | `0.3.1`（传导） | `@dependfix/mcp@0.3.1` |
| `@dependfix/platform` | `0.5.0`（tag-only） | `@dependfix/platform@0.5.0`；镜像 `platform-0.5.0` 已由 dispatch `41439905381` 发布（含 `latest` / 日期 / `sha-a049a56`）；health 已由 ACR 验证，双架构未验证 |
| `@dependfix/skills` | 无改动不发布 | — |

六个 tag 均指向发布提交 `a049a561`（`chore(release): 0.7.0`）；GitHub Release `v0.7.0` 为 Latest、非 prerelease（`gh release view` `createdAt` = `2026-11-02T10:33:46Z`）。

**发布后复核（2026-11-02 实测）**

- `npx --yes dependfix@0.7.0 --version` → `0.7.0`，**关闭** 0.6.0 的 `--version` 报 `0.1.0` 缺陷候选（tarball / 全局两路由见上方 preflight 与 2026-11-01 预演）。
- 发布物审计：`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org` → exit 0（1 low + 1 被忽略的 moderate = `minimatch`，见[安全规范 §5.7](../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05)）；Dependabot 开放 2 条（`minimatch` medium #126 / `deepmerge` low #125）；Code Scanning 开放 **0** 条 → **非豁免 critical / high = 0**。
- 远端镜像：**`platform-0.5.0` 已发布**（dispatch `41439905381`，`--ref v0.7.0` + `platform_version=0.5.0`；四标签、双架构 manifest `sha256:71f6633…a244f1`、build 22m03s）；本环境无法直连 GHCR / Docker Hub（401 / 超时）；`/api/health` 已经 ACR 冒烟验证，**双架构与客户端 manifest 校验未通过**（ACR tag 单架构，见下节），不记为通过。
- `dependfix@0.6.0` 是否 `npm deprecate`：**未执行**（属用户决策项）。0.7.0 的 Release 正文只含「本轮发布包 + 根 CHANGELOG」，**未包含** 0.6.0 `--version` 缺陷说明与升级指引，也不含指标段。

**产物校验和（`npm view <pkg> dist.integrity`，2026-11-02）**

```text
dependfix@0.7.0          sha512-1yaQaIJ0jr1EeOLS5pXfCN+pHEoYFaWahlQwtIkW87dZOwcD6Yxi4pJnrWrhIFQmroW+SbA/UtelKNCiTHx3OQ==
@dependfix/core@0.7.0    sha512-kDOTkqiz3aae9f/SNyQS6L3Iv1kwpTpA/ZDrnv/Z9U+1DoGarSSPVvZYMREhrhzDLDwKo36cFWG28+wPH9U5jQ==
@dependfix/engine@0.6.0  sha512-stlo8Kg4BheQVTSC54KtKfX4Rgm8TUlPwSbRDmW1hwTKFPCNHPHmG6A2s0yrL/YrkaSwL1LHVHrG+C3lgUH2Gw==
@dependfix/mcp@0.3.1     sha512-9ONe8HKXgFBIUPMoxWTHrlUqH6yUPXq86Uo6Mi8xVmsWfbXVGWBaHCKo4Aq2xeLgv3WBuQAgMiDZyJJAEBRCZA==
```

本轮只采集 `dist.integrity`；tarball `sha256sum` 与 `@dependfix/skills` 预演 tarball **未采集**（手动发布通道未留 tarball 归档），客户端 `RepoDigests` 未取得（manifest list digest 见运行日志 `sha256:71f6633…a244f1`）。三者随 1.0.0 发布一并归档。

**回滚**

- npm：`npm deprecate dependfix@<bad> "<说明>"` 后发修复版；**不要** `npm unpublish`（24 小时限制且破坏已有安装）。
- git tag / Release：删除错 tag（`git push origin :refs/tags/<tag>`）后按修复提交重打；Release 用 `gh release delete` 重建。
- Docker：用 `docker buildx imagetools create` 把 `latest` / `platform-x.y.z` 重指旧 digest，再重跑 docker workflow。
- 数据库：本轮无迁移，不需要备份恢复。

回滚面（npm / git tag / GitHub Release / `@v1` / Docker / 数据库）的逐面演练记录见 [1.0.0 发布清单 §5.1](release-1.0.md#_5-1-演练记录-m54-5-2026-11-02)（M54.5）。

### 1.0.0 发布记录（M54.6，2026-11-07 已执行）

> 目的：发布首个稳定版（semver 承诺生效）。**执行方式 = `release.yml` 的 OIDC dispatch**（用户 2026-11-05 决策），不使用本地手动通道；差异面与发布说明骨架见 [1.0.0 发布清单](release-1.0.md)。

**发布链两次失败与修复（过程记录）**

| run | 失败点 | 归因 | 处置 |
|:--|:--|:--|:--|
| `42332948238` | `Pre-check release security alerts` | 仓库 secret `GH_PAT` 无法读取 Dependabot alerts（HTTP 403 `Resource not accessible by personal access token`，fine-grained 缺 `Dependabot alerts: read`） | 用户重配 `GH_PAT` 后门禁通过 |
| `42350661632` | `Run pnpm run test` | 版本提升后 `scripts/create-release-plan.test.mjs` 的「仓库当前为 0.x」断言失效（用例绑定仓库状态） | `f90c11b7`：`isPreMajor(version?)` 支持显式入参，用例按真实版本推导期望值并显式覆盖 0.x / 1.x |

发布提交链：`86108b60`（`chore(release): 1.0.0`，六包版本 + 七份日志）→ `f90c11b7`（用例修复）→ `83c966fd`（1.0.0 日志补首个稳定版 / 契约与迁移 / G8 / 已知限制，同时满足 `release:publish` 的 HEAD 锚点）。发布 run：`42351775424`（success）。

**版本与 tag（2026-11-07）**

| 通道 | 版本 | tag / 产物 |
|:--|:--|:--|
| `dependfix`（锚版本）+ `@dependfix/core` / `engine` / `skills` / `mcp` | `1.0.0` | 各自的 `<pkg>@1.0.0`；`dependfix@1.0.0` 另打 `v1.0.0` |
| `@dependfix/platform`（tag-only，不发 npm） | `1.0.0` | `@dependfix/platform@1.0.0` + 镜像 `platform-1.0.0` |

六个包 tag + `v1.0.0` 均指向 `83c966fd`；`v1` 滚动标签（annotated `097723a7`）同样解引用到 `83c966fd`，`uses: dependfix/dependfix@v1` 自此可用。GitHub Release `v1.0.0` 为 Latest、非 prerelease（`publishedAt` = `2026-11-07T07:38:22Z`），正文含发布包矩阵 + 根 CHANGELOG 1.0.0 段（首个稳定版 / 入口 / 契约与迁移 / G8 当日复算 / 已知限制 / 已知非目标）。

**发布后复核（2026-11-07）**

- 三路安装：`npx --yes --registry=https://registry.npmjs.org dependfix@1.0.0 --version` → `1.0.0`；全局安装（隔离 prefix）→ `1.0.0`；tarball 路由由 `release:preflight` 覆盖（发布前 `PASS`，`--version = 1.0.0`）。
- 发布物审计：`pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org` → 2 条（1 low + 1 条 §5.7 豁免 moderate = `minimatch`）；`pnpm run check:release-security` → **PASS**（critical 0 / high 0 / moderate 1 / low 1）。口径：该命令审计工作区生产依赖图，不是逐包 tarball 审计；镜像面归 G7 复核。
- 本机 `npm` 默认 registry 为 `registry.npmmirror.com`，发布后短时间内尚未同步 1.0.0（`npm view` 404）；官方 registry 已是最新，复核须显式 `--registry=https://registry.npmjs.org`。

**产物校验和（官方 registry `dist.integrity`，2026-11-07）**

```text
dependfix@1.0.0          sha512-F3KrS2AQjio1kG49zlchTudnr+j8yEq09rcbCfUL804TSt6cUJMUywIWzsYG6x/GP7pyofQWeh90GoHXwYg1GQ==
@dependfix/core@1.0.0    sha512-OBTEZe6MBdoKk54XkhUB2mcLS26sMyii7AMz8iC4Dy7ct+aldiaT/1PhO7TjGpmyqtVHpd/gvmnfAqb6q31z9g==
@dependfix/engine@1.0.0  sha512-Kz9LF1NPzT7lM5OCZtCfFRFL7jEGcu84sk5PZAlkom4ns1TduyhI5oem+LAv/KpG93IYm7PI9ViZz65YiniG9Q==
@dependfix/skills@1.0.0  sha512-dfntb5ntotpnfnR8GBgKDHLhJfgI3nq8g2PERuEFUYLnvZHnIp17FPPOJb6YIbKvMaJf1tPw2yJghVMa6AUwbw==
@dependfix/mcp@1.0.0     sha512-jxwzrIKjuD+kuMn3zWrvreCuNUEWPrcrecsEQU5RHKEM1Lh6Rxp/yzr+dQ69axy3SRUqhvigeDNcMRvmmWiOtA==
```

**归档范围说明**：0.7.0 段承诺「tarball `sha256sum` / `@dependfix/skills` 预演 tarball / 客户端 `RepoDigests` 随 1.0.0 一并归档」，本轮改为以官方 registry 的 5 条 `dist.integrity` 作发布物指纹；tarball `sha256sum` 与 `RepoDigests` 未采集（本地发布通道不产 tarball 归档，镜像客户端 manifest 受 GHCR / ACR 权限限制）。

**镜像（`platform-1.0.0`，2026-11-07 发布）**

- **原 QEMU 方案失败**：`docker.yml` 原在单 job 内用 QEMU 跨架构构建，`42351771958`（push 自动触发）与 `42352117141`（release 派发）同时卡在 Nuxt `Bundling client` 近 4 小时，双双触 240 分钟上限被取消，**未产出任何镜像 tag**。
- **方案改为原生多架构**（参照 caomei-auth，`c13f1714`）：amd64 用 `ubuntu-latest`、arm64 用 `ubuntu-24.04-arm` 原生构建，各自 `push-by-digest`，再由 `merge` job 用 `buildx imagetools create` 合成三个 registry 的 manifest。
- **发布 run 链（镜像流水线三次迭代）**：`42371180834`（三仓库 manifest 均产出，merge 的 README 同步因缺 `actions/checkout` 红）→ `42372575641`（补 checkout 后全绿）→ `42373335914`（新增双架构回读门禁 `f7917cab`，全绿）→ `42375268994`（无 `platform_version` 的验证派发暴露 `imagetools create` 不支持 `--annotation`）→ `42376062304`（改为构建阶段写 OCI 标签后，无版本派发全绿：3 tag × 3 仓库 9/9 双架构、无 `platform-` 标签）→ `42376735406`（全绿，但 OCI `version` 仍取 ref 名 `master`）→ **`42381362295`（最终发布 run，全绿，`version=1.0.0`）**。
- **双架构证据**：`42381362295` 中三个 registry × 4 个 tag（`latest` / `2026-11-07` / `platform-1.0.0` / `sha-5c81058`）经 `imagetools inspect --raw` 回读，**12/12 均为 `linux/amd64 + linux/arm64`**；镜像配置 `org.opencontainers.image.version = 1.0.0`（构建日志实测）。
- 镜像 `BUILD_COMMIT = 5c810587…`（派发时 master HEAD，平台代码即 1.0.0）、`BUILD_VERSION = 1.0.0`；耗时（`42381362295`）：QA 4m09s / arm64 5m09s / amd64 3m38s / merge 1m45s；同流程其他轮次为 `42373335914` 3m30s / 1m10s / 2m21s / 1m50s，`42376735406` amd64 **41m32s**（未命中缓存）——**单架构耗时波动约 1m-42m**，故 `timeout-minutes` 取 90 分钟。
- **已知限制**：ACR 个人版按 tag 行为依推送路径而变（0.5.0 为单一 amd64；1.0.0 起 index 回读为双平台，客户端在 amd64 主机按 tag 只取 amd64，arm64 主机未实测）；provenance 三仓库统一关闭（ACR 拒绝 OCI attestation，`imagetools create` 无法跨 registry 传递），1.0.0 起 GHCR 镜像不带 provenance 证明。

## 定时自动发布（1.0.0+ 可启用，需用户另行授权）

`release.yml` 已内嵌 `schedule` 定时发布（每周六 UTC+0 12:00 = UTC+8 20:00，参照 momei），**1.0.0 正式版发布后不会自动启用**——须用户另行授权后再取消 `schedule` 注释（M54.6 明确不启用自动发布；安全告警门禁已内置于 `release.yml`，见「发布前安全检查」）。定时触发时 CI 自动完成：

1. `release:plan`（推导计划，无推导结果则跳过）+ `release:version`（消费计划提升版本）+ `pnpm changelog`（生成日志）+ 提交并推送 master（semantic-release 风格提交：`chore(release): x.y.z [skip ci]` + 根 CHANGELOG 版本段全文）——全流程由 `pnpm release:auto-version` 脚本化执行（无变更安全 no-op，见 [scripts/README.md](../../scripts/README.md)）；
2. 随后执行与手动发布相同的完整流程：质量门 → changelog 校验 → `release:publish`（OIDC）→ push tags。

手动发布（`workflow_dispatch`）时跳过自动版本提升步骤（版本已在本地提升并提交）。

### 自动发布启用清单（1.0.0 后）

> **现状（2026-11-02）**：`release.yml` 的 `on:` 只有 `workflow_dispatch`；`schedule`（每周六 UTC+0 12:00）与 `push`（master）两段**保留为注释**，0.x 阶段刻意不启用（预览期发布节奏由人控制），1.0.0 发布后也须另行授权。启用前逐项确认下表，**缺一项就不要取消注释**。

| # | 前置项 | 要求 | 现状（2026-11-02 复核） |
|:--|:--|:--|:--|
| 1 | 1.0 门槛 | G1-G8 全绿（见[就绪度台账](../design/governance/release-1.0-readiness.md)） | G2 ✅；G1 · G4 · G5 · G6 · G7 ◐（G7 运维四项已实测，但第 5 项「直推 master」未验证；回滚已 drill 三面、**Docker 面 blocked**；G4 为 1.0 发布豁免，2026-11-02 读数 = 最近 10 次 push 的 Test 9/10、0.6.0 起 30/38）；G3 ❌（待外部资源，1.0 发布豁免）；G8 ◐（2026-11-02 复算：30 PR / 绿率 25/30 · 介入 0% · 误关 0%；发布说明引用后转 ✅） |
| 2 | 安全告警门禁 | 仓库 secret `GH_PAT` 存在（Dependabot alerts 只读）；`check:release-security` 在 release 流程绿 | 已配置并在 `release.yml` 强制（fail-closed） |
| 3 | 发布凭据 | 5 个 npm 包的 Trusted Publisher 指向 `release.yml`；`id-token: write` 就位 | 已配置（首次手动发布后） |
| 4 | Workflow 权限 | `contents: write` / `actions: write` / `security-events: read` | 已就位（`release.yml` permissions） |
| 5 | 直推 master | 自动版本的 `chore(release): x.y.z [skip ci]` 提交需能直推 master（或改为 PR + 自动合并） | **未验证**：仓库当前无 required status checks，直推可行；若日后开启保护需改流程 |
| 6 | 版本与日志一致 | `pnpm verify:changelog` 绿；`release:plan` 能推导计划（无变更时自动 no-op） | 已绿（release 前置步骤 + 本地预演见下） |
| 7 | 回滚预案 | 镜像 tag / npm 版本 / git tag 均可回退；发布后 3 天观察窗口 | 见本文「tag 策略与包版本不同步」与「已知限制与排查」 |
| 8 | `@v1` 滚动 tag | 仅 `1.0.0` 发布后启用；启用前 Action 引用保持具体版本 | **已创建（2026-11-07，`097723a7` → `83c966fd`）**；用户可见示例已切换（README / 首页 / quick-start 中英） |

启用步骤：

1. 取消 `on.schedule` 注释 → 合入 master（`workflow_dispatch` 保留为手动入口）。
2. 观察首个定时窗口：`gh run list --workflow=release.yml --limit 5` 应出现 `schedule` 事件 run；`Auto version & changelog` 步骤产出 `chore(release): x.y.z [skip ci]` 提交，后续步骤走完整质量门与 OIDC 发布。
3. 确认「无待发布变更」轮次是 no-op（日志 `::notice::没有待发布的版本变更`，job 不红）。
4. 需要「提交即发布」时再取消 `on.push` 注释；建议 `schedule` 稳定运行 2 周后再开 `push`（`push` 会让每个 master 提交都尝试发布，无变更时 no-op 但占用 CI 时间）。
5. 回滚开关：先注释掉 `push`，再注释 `schedule`，推送后即恢复手动发布；已发布的版本按「已知限制与排查」回滚（镜像 tag 回退 / `npm deprecate`）。

本地 dry-run 预演（2026-10-31，HEAD `05719601`，未推送）：

```bash
pnpm release:plan                # 基线 tag：@dependfix/mcp@0.3.0 → 计划 @dependfix/{platform,core,engine} minor + dependfix minor
pnpm release:version --dry-run   # platform 0.4.0→0.5.0 / dependfix 0.6.0→0.7.0 / engine 0.5.0→0.6.0
                                 # core 0.6.0→0.7.0 / mcp 0.3.0→0.3.1（传导 patch）
rm release-plan.md               # 计划文件为 gitignore 临时产物；dry-run 不写回任何版本
git status --porcelain           # 空（无版本 / 日志副作用）
```

> **预演范围说明**：`pnpm release:auto-version` 内含 `git commit` + 直推 master，**本地不执行**（会污染远端）；`publish` / tag / GitHub Release 同样不在预演内。因此上表第 5 项的「直推可行性」仍标注未验证，实测证据由首个定时窗口 run 提供。

### CI 发布行为

`release.yml`（`workflow_dispatch` 手动触发；1.0.0 后增加 `schedule` 定时触发）依次执行：

1. `pnpm audit` 两步（全量信号 `|| true` 不阻断 + prod 阻断 `--ignore-registry-errors` + 显式公共 registry，命令同 `test.yml`）与 `Pre-check release security alerts` 只读预检：都在自动版本提升之前——审计红 / 告警红不得先提升版本并推送 master；
2. （仅 `schedule` 触发）`Auto version & changelog`：自动版本提升 + CHANGELOG 生成 + 提交推送（`pnpm release:auto-version` 脚本化执行）；
3. lint → **文档与治理门禁**（`pnpm run gates:docs`，与 `test.yml` 同集合，单点声明见 `scripts/run-doc-gates.mjs`）→ typecheck → test → build（质量门，任一失败即中止）→ `Build platform`（`pnpm --filter @dependfix/platform build`；根 build 只含 `./packages/*`，平台构建必须单独前置）；
4. `Verify changelog is up to date`：校验七份 CHANGELOG（根级 + `packages/cli` / `packages/core` / `packages/engine` / `packages/skills` / `packages/mcp` / `apps/platform`）已包含当前版本段，并用 `--fresh` 按当前 git 历史重算该段条目、拦截「生成后又有新 commit」的陈旧日志；已打 tag 的段允许人工编辑不参与比对，浅克隆 / 无 tag 时 warning 放行（不当通过证据）；该步骤依赖完整历史（`checkout` 为 `fetch-depth: 0`，改浅会使 `--fresh` 降级为 warning 放行）；
5. `Check release security alerts`：发布前安全告警门禁（`pnpm run check:release-security`）——critical 一律阻断（含 dismissed）、high 需台账豁免、API / token 异常 fail-closed（口径见 [安全规范 §5.9](../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)）；
6. `Release preflight`：`pnpm release:preflight` 用真实 tarball 安装并断言 `dependfix --version` 等于包版本（放在便宜门禁之后：被拦下的轮次不必付安装成本；见「发布链预演与安装实测」）；
7. `pnpm release:publish`：
   - **只发布"本地版本未出现在 npm registry"的包**（fetch 直连 registry 对比，见 [经验归档 §三十二](../design/governance/experience-archive.md)），无待发布版本时安全退出（天然处理包版本不同步）；
   - 在 pnpm 项目内部调用 `pnpm publish`：自动替换 `workspace:*` 为实际版本，发布顺序按 `publishOrder`（`@dependfix/core` / `@dependfix/engine` / `@dependfix/skills` 先于 `dependfix` / `@dependfix/mcp`）；
   - 通过 **OIDC trusted publishing** 认证（`id-token: write` + npmjs.com 的 Trusted Publisher 配置），无需 `NPM_TOKEN`；
   - 发布前校验 **HEAD 锚点**（HEAD 必须 touch 待发布包路径，防误在非发布提交执行）；
   - 发布成功后本地创建 `<pkg>@<version>` 格式的 annotated git tag（如 `dependfix@0.1.1`）+ `v<锚版本>` 聚合 tag（锚 = 主交付物优先，见"GitHub Release 自动化"）；
   - **幂等自愈**：npm 已发布但本地无 tag（上次发布中途失败等中间态）时自动补 annotated tag（HEAD 锚点校验通过才打，否则安全跳过），并计入 v tag 锚点解析——重跑 CI 即可全链路恢复，无需手动补打（见"tag 策略与包版本不同步"）；
8. `Push release tags`：将 `release:publish` 创建的本地 tag 推送到 GitHub（`git push <url> --tags`，显式 token URL + 推送后核验，通过 `GITHUB_TOKEN` 认证）；
9. `Create GitHub Release`（`pnpm release:github`）：读 `release-publish-result.json` 为本轮发布创建聚合 GitHub Release——tag 为 `v<锚版本>`，notes 为版本矩阵 + 根 CHANGELOG 最新段（core-only 轮次取锚包包级段）；**alpha / beta / rc 标 pre-release，0.x 正式版不标**（与 npm `latest` 一致）；**追加**：`Trigger Docker build with platform-x.y.z tag` 以 `--ref v<锚版本>` 派发 docker workflow（镜像内容钉在发布提交上，见「Docker 镜像复核」）；Release 已存在则跳过，创建失败仅警告不阻断（npm 已发布完成，可后补 `gh release create`）。docker 工作流在 merge 后自动跑双架构原生冒烟与历史 tag 巡检（失败仅告警，见[发布管线设计 §4.6](../design/governance/release-pipeline.md#_4-6-发布后镜像冒烟与历史-tag-巡检-2026-11-12-m58-4)）。

### GitHub Release 自动化

- **每轮发布创建一个聚合 GitHub Release**（非每包一个）：锚版本 = 主交付物优先（`dependfix` → `@dependfix/core` → `@dependfix/engine` → `@dependfix/skills` → `@dependfix/mcp`，即本轮实际发布列表中 rootChangelog 锚包优先、其余按 publishOrder）；
- **v tag**：`release:publish` 在全部包发布成功后创建 `v<锚版本>` annotated tag（指向发布提交，幂等不覆盖），随 `Push release tags` 全量推送并核验；
- **notes**：本轮发布包版本矩阵 + 根 CHANGELOG 最新版本段（与 release commit body 同源格式）；根段为空（core-only）时取锚包的包级 CHANGELOG 段；两处均无则跳过创建；
- **pre-release**：仅 alpha / beta / rc 版本标记 pre-release（rc 也必须标：npm 对它写 `next` dist-tag）；0.x 正式版不标（npm publish 默认写 `latest`，标 pre-release 会与用户默认安装到的版本不一致，0.6.0 实测为 Latest）。判定式是 `/(alpha|beta|rc)/i`——**其他 pre-release 标识（canary / next 等）暂不识别**，引入时须同步判据与 CHANGELOG 段抽取正则；
- **幂等与失败**：Release 已存在（重跑）跳过；创建失败 `::warning::` 不阻断 CI（可后补 `gh release create v<版本> --notes-file <file>`）；
- 首次手动发布（0.1.0）仍按上文手动 `gh release create`（CI 发布链路自此自动创建）。

## tag 策略与包版本不同步

- **发布不需要手动打 `v*` tag**：`release:publish` 只发布有变更的包，包版本不同步（例如只 bump 了 `dependfix`，`@dependfix/core` 未变）时未变更的包会被自动跳过，不存在"一个 tag 表达不了多版本"的问题；
- `release:publish` 成功后会为每个发布的包创建 `<pkg>@<version>` 格式的 git tag（changesets / lerna 生态惯例，沿用），由 CI 的 `Push release tags` 步骤推送到 GitHub，供 GitHub Release 关联与后续精确回溯；
- `v<锚版本>` 聚合 tag 用于 GitHub Release 关联（锚版本 = 主交付物优先，见"GitHub Release 自动化"）；与 1.0.0 后规划的 `v1` 滚动 tag 命名空间兼容（固定 tag + 移动 tag 共存）；
- 注意：若发布成功但后续步骤失败导致重跑（如 CI git identity 缺失致 tag 创建失败，见 [经验归档 §三十七](../design/governance/experience-archive.md)），`release:publish` 会自动检测"npm 已发布但本地无 tag"的中间态并补打 annotated tag（HEAD 锚点校验通过时，校验失败则安全跳过）——重跑即可全链路恢复（`<pkg>@<version>` tag + `v<锚版本>` tag + GitHub Release）；仅当 HEAD 不 touch 包路径时才需手动 `pnpm tag:released` 补打；
- 首次发布的 `v0.1.0` tag 仅用于 GitHub Release 展示；`uses: dependfix/dependfix@v1` 滚动 tag 已于 `1.0.0` 发布后创建（2026-11-07），用户可见示例已切到 `@v1`。

## CHANGELOG 策略

- **release 脚本不负责生成 changelog**，仅负责版本提升（`release:version`）与发布（`release:publish`）；
- **CHANGELOG 由 `pnpm changelog` 生成**（`scripts/changelog.mjs`），基于 conventional commit 消息 + `conventional-changelog-cmyr-config`（与 momei / semantic-release-cmyr-config 生态同一套格式）：
  - **根级 `CHANGELOG.md`**：全仓库的 feat/fix/refactor 类 commit（chore/ci/docs 等类型由 preset 过滤，不进入日志；全局改动如 CI / 文档 / workspace 配置自然不展示），版本段以 `dependfix@` tag 序列划分（dependfix 为主交付物，core 单独发布的变更会随下一次 dependfix 发布段出现）；
  - **包级 `CHANGELOG.md`**（`packages/cli`、`packages/core`、`packages/skills` 等）：按 `git log -- <path>` 精确过滤——只有实际改动该包路径的 commit 才会进入对应日志（一个 commit 同时改两个包时会同时出现在两包日志中，这是真实影响面的体现）；`@dependfix/skills` 的同步脚本 `scripts/sync-skills.mjs` 属仓库根路径，不匹配任何包，其改动只进根级日志；
  - 分组语言由根 `package.json` 的 `changelog.language: "zh"` 控制（中文 emoji 分组：✨ 新功能 / 🐛 Bug 修复 / 📦 代码重构 等）；
- **全局改动归属约定**：根目录文件（`docs/`、`.github/`、`pnpm-workspace.yaml` 等）不匹配任何包的 path，不会出现在包级日志；若某全局改动确实影响包行为（如 overrides 改依赖解析），应在 commit 中落在包路径内或拆分提交，否则只记录在根级日志；
- **生成是增量追加的**：已存在的 CHANGELOG.md 只更新**未发布版本段**（版本号等于当前 pkg 版本且尚无对应 tag 的段，即最新 tag 之后的全部新增 commit），已发布历史段完整保留文件现状——历史 commit 重写或手动编辑均不被覆盖；文件不存在时首次全量生成；无未发布内容（版本等于最新 tag）时文件保持不变；
- **残留未发布段自动清理**：发布中断（如 CI 打 tag 失败）会遗留"版本低于当前版本、无对应 tag、npm 未发布"的旧版本段，后续再次提升版本时旧段不再被增量逻辑管理，残留会产生内容重复的两个版本段。生成时自动清理此类残留段（经验归档 §三十七）：本地 tag 存在 / npm 已发布（手动发布无 tag 场景）/ npm 查询失败均保守保留，仅确认未发布（registry fetch 三态 false）才删除；
- **生成时机与边界行为**：在 `release:version` 之后、publish 之前运行（此时新版本尚无 tag，未发布段输出全部新增 commit）；若在版本等于最新 tag 时运行（如 core-only 发布后、或发布后立即重跑），未发布段无新增内容（writer 可能产生的空版本段会被自动过滤），文件保持不变；
- **版本标题与 tag**：根级与包级日志的版本段均按 `dependfix@` / `@dependfix/core@` / `@dependfix/skills@` tag 序列划分（`release:publish` 自动创建）。**手动发布补 tag 约束**：分段锚点是"tag 指向的 commit 自身携带的 gitTags"，包级日志还有 `git log -- <path>` 过滤——因此补打历史 tag 时必须指向**同时 touch 该包路径**的 commit（0.1.0 补打 `dependfix@0.1.0` / `@dependfix/core@0.1.0` 指向 dc607026，该 commit 同时改动两包 eslint.config.js）；若 tag 指向纯 docs/全局 commit（如 `v0.1.0` → c213fc21），包级日志因 path 过滤看不到锚点，全部历史会并入当前版本段（表现为 changelog 非增量）；
- **依赖变更提示差异**：changesets 原会在依赖包变更时向依赖方日志写入 `Updated dependencies` 行，本方案不自动生成（npm 安装时会自动带上新依赖版本，不影响使用）；
- **依赖版本**：必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容）。

## 已知限制与排查

| 现象 | 原因与处理 |
|------|-----------|
| 包**首次**发布时 OIDC 报错 | npm 的 Trusted Publisher 要求包已存在才能配置（npm/cli#8544）。初始版本必须手动发布（`pnpm publish` + `npm login`），之后版本可走 OIDC |
| 手动触发发布后所有包都被跳过 | 没有待发布版本（`release:version` 未执行或已发布过）；这是正常行为，不是错误 |
| 定时发布中途失败（质量门/发布挂） | master 可能处于"版本已提升未发布"状态：人工 `workflow_dispatch` 重试发布即可，或等待下一定时周期自愈（release-plan.md 未消费则幂等重跑） |
| `npm publish` 发布产物中带 `workspace:*` | 使用了裸 `npm publish`。npm 不替换 workspace 协议，必须使用 `pnpm publish`（`release:publish` 内部即走此路径） |
| OIDC 发布报 E404 / E401（pnpm 11.0.3） | pnpm 11.0.3 存在 OIDC 回归（pnpm/pnpm#11566，已修复）。升级 pnpm（或改用 `pnpm/action-setup` 默认最新版） |
| OIDC 发布报 E401 / Unable to authenticate | 检查：Trusted Publisher 的 workflow 文件名是否与 `release.yml` 完全一致（大小写敏感）；`id-token: write` 权限是否在发布 job 上；是否使用 GitHub-hosted runner |
| `pnpm changelog` 输出英文分组 | 根 `package.json` 缺少 `changelog.language: "zh"`（cmyr-config 从 cwd 的 package.json 读取语言） |
| `pnpm changelog` 报模板错误 | conventional-changelog 被解析为 8.x。必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容） |
| CI 报 "CHANGELOG 缺少版本段" | 版本已提升但漏跑了 `pnpm changelog`（发布前必须生成并提交日志） |
| 发布被安全告警门禁拦下 | 存在 critical（含 dismissed）、未按状态登记豁免的 high、或 `GH_PAT` / 权限 / 台账问题；按 [安全规范 §5.9](../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 修复或登记台账后，**重新走 `release:plan` → `release:version` → `pnpm changelog` 产生新发布提交**再发（新提交必须 touch 包路径，`release:publish` 的 HEAD 锚点校验会拒绝不 touch 包路径的提交；不要直接重跑 publish 步骤） |
| 包级 CHANGELOG 非增量（0.2.0 段吞掉全部历史） | `<pkg>@<version>` 锚点 tag 缺失，或指向的 commit 未 touch 该包路径（path 过滤后看不到锚点）。处理：补打/移动 tag 到 touch 该包路径的 commit 后重跑 `pnpm changelog` |
| `release:publish` 报 "Committer identity unknown" | CI runner 全局 git config 无 user.name/user.email（annotated tag 创建需要 identity；此前 identity 仅在 schedule-only 的 Auto version 步骤中配置，手动触发时缺失）。处理：release.yml 已在 Release Publish 前显式配置 github-actions[bot] 身份；旧 run 遗留的中间态（npm 已发布但 tag 缺失）直接重跑即可自愈补 tag |
| `release:publish` 报"HEAD 不是 touch `<path>` 的提交" | 在非发布提交上执行了发布（未走 release:version + changelog 提交）。处理：完成版本提升与 changelog 提交后再发布 |
| GitHub Release 未创建（CI 仅警告） | 创建失败不阻断发布（npm 已发布完成）。处理：手动补建 `gh release create v<版本> --notes-file <notes.md>`（仅 alpha / beta / rc 加 `--prerelease`），notes 可从根/包级 CHANGELOG 对应版本段截取 |
| GitHub Release 显示旧版本号 | `v<锚版本>` 以主交付物优先（dependfix 未发布时取 core 等）；core-only 轮次的 Release 版本号代表该轮核心变更包，属预期行为 |

## 关于 provenance

- npm 官方在 trusted publishing（OIDC）下会为 `npm publish` **自动生成 provenance 声明**；`pnpm publish` 的 provenance 需要显式 `--provenance` 标志；
- 0.1.0 预览阶段不强制要求 provenance（不阻塞发布）；后续如需要，可评估在 `release:publish` 中透传 `--provenance`（CI OIDC 环境可用，本地手动发布不可用）。
