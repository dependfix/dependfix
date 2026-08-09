# 发布指南

本指南说明 `dependfix` 的 npm 发布流程、版本策略与发布自动化配置。

## 发布包清单

> **包清单单点声明**：发布包列表定义在 [scripts/packages.config.mjs](../../scripts/packages.config.mjs)（`publishable: true` 的包进入发布链路）。
> 新增发布包时：① 在该文件登记；② 补充包 README；其余（changelog 生成、changeset 映射、CI 校验）自动生效。

当前 Monorepo 对外发布的 npm 包：

| 包 | 说明 | npm 地址 |
|----|------|----------|
| `dependfix` | CLI 应用入口（含 `dependfix` bin 命令，薄壳：参数解析 + runner） | https://www.npmjs.com/package/dependfix |
| `@dependfix/core` | 核心领域模型库 | https://www.npmjs.com/package/@dependfix/core |
| `@dependfix/engine` | 执行引擎（编排/采集/修复/研判，cli/mcp/platform 共享） | https://www.npmjs.com/package/@dependfix/engine |
| `@dependfix/skills` | 产品 Agent Skill 权威源（`dependfix-remediator`，纯内容包） | https://www.npmjs.com/package/@dependfix/skills |
| `@dependfix/mcp` | MCP Server（stdio 传输，7 个 tool 暴露扫描/修复能力） | https://www.npmjs.com/package/@dependfix/mcp |

> 依赖关系：`dependfix` 依赖 `@dependfix/core`、`@dependfix/engine` 与 `@dependfix/skills`（运行时解析 skill 内容）；`@dependfix/engine` 依赖 `@dependfix/core`；`@dependfix/mcp` 依赖 `@dependfix/core` 与 `@dependfix/engine`。发布顺序：被依赖方先行（`@dependfix/core` → `@dependfix/engine` → `@dependfix/skills` → `dependfix` → `@dependfix/mcp`）。

## 版本策略

- **0.x 即预览版**：当前处于开发阶段，`0.1.0` 及后续 `0.x` 版本直接作为 `latest` 发布，**不加 `beta` 等预发布后缀**。理由：
  - `0.x` 在 semver 中本身就是"初始开发、API 不稳定"语义，已充分表达预览状态；
  - npm 默认不安装带预发布后缀的版本（需显式 `dependfix@beta`），会给预览测试设置障碍；
  - changesets 的 pre 模式会增加每轮发布的维护成本。
- **稳定信号来自 `1.0.0`**：API 稳定后发布 `1.0.0`，届时再启用 `@v1` 滚动 tag（GitHub Action 引用）。
- **tag 推送纪律**：git 默认不推送 tag——本地开发建议 `git config --global push.followTags true`（日常 push 自动带 annotated tag）；补打 tag 后必须显式 `--tags` 推送并核验（教训见 [经验归档 §二十六](../design/governance/experience-archive.md)）。
- 版本号由 Changesets 管理（`.changeset/`），包版本升级语义（patch / minor / major）在发布前由 `pnpm changeset:generate` 基于 conventional commits 自动推导（见"changeset 生成规则"），可人工修正；CHANGELOG 由 `pnpm changelog` 基于 conventional commits 生成（见"CHANGELOG 策略"）。

## 发布架构

| 阶段 | 触发方式 | 认证方式 | 发布命令 |
|------|----------|----------|----------|
| 首次发布 `0.1.0` | 手动（一次性） | npm 账号登录（`npm login`） | `pnpm publish`（本地） |
| 后续版本 `0.1.1+`（0.x 阶段） | **`workflow_dispatch` 手动触发** | **OIDC Trusted Publishing**（无 `NPM_TOKEN`） | `pnpm changeset publish`（CI） |
| `1.0.0+`（正式版，规划） | 手动 + `schedule` 定时自动发布（可选 `push`） | OIDC Trusted Publishing | `pnpm changeset publish`（CI） |

> **0.x 阶段仅手动发布**：`release.yml` 未启用 `on.push` / `on.schedule` 自动触发（每次推送触发 release 不符合 0.x 预览期的发布节奏）。定时自动发布配置已按 momei 模式内嵌（每周六 UTC+0 12:00 = UTC+8 20:00），1.0.0 正式版发布后取消 `schedule` 注释即可启用，自动发布逻辑（版本提升 + 日志生成 + 提交推送）无需额外配置。
>
> 发布底层始终是 **`pnpm publish`**（`changeset publish` 在 pnpm 项目内部调用它），它会自动把 `workspace:*` 依赖替换为实际版本号，保证发布产物可被消费者正常安装。**不要改用裸 `npm publish`**：npm 不会替换 `workspace:*`，会把字面量发布到 registry。

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
- **npm 版本**：`changeset publish` 内部会用 `npm info` 探测 registry，release.yml 中通过 `npm install -g npm@latest` 保持较新；
- `release.yml` 已配置 `permissions: id-token: write`。

## 首次发布（0.1.0，手动，一次性）

> 前置条件：`pnpm publish` 默认执行 gitChecks（当前分支为 `master`、工作区干净、与 remote 同步），不满足会中止发布。先确认：

```bash
git branch --show-current            # 期望 master
git status --porcelain               # 期望无输出（工作区干净）
git fetch && git log HEAD..@{u}      # 期望无输出（无落后提交）
```

正式发布：

```bash
# 1. 质量门全绿
pnpm lint
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
#    changelog 分段锚点与 changeset 推导基线都依赖它——参照 scripts/changelog.mjs 的
#    tags.prefix（`git rev-parse --verify <prefix><version>`）与 scripts/create-changeset.mjs
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

# 8.（可选）GitHub Release（预览版标记 pre-release）
gh release create v0.1.0 --generate-notes --prerelease

# 9. 在 npmjs.com 为五个包配置 Trusted Publisher（见"前置配置"）
```

## 后续版本（0.1.1+）

### changeset 生成规则

版本提升级别由 `pnpm changeset:generate`（`scripts/create-changeset.mjs`）从 git log 自动推导，规则参照 semantic-release / conventionalcommits：

| commit 类型 | bump | 说明 |
|---|---|---|
| `feat` | minor | |
| `fix` / `perf` / `revert` | patch | |
| BREAKING（`!` 后缀或 `BREAKING CHANGE:` footer） | 0.x → minor；1.0.0+ → major | 0.x 阶段不直接跳到 1.0.0（0.x 语义中 minor 即可表达破坏性变更） |
| `refactor` / `docs` / `chore` / `build` / `ci` / `test` / `style` | 不 bump | 变更仍会进入 CHANGELOG，随同轮其他发布附带 |

- **包影响面**：按 commit 改动路径映射（`packages/core` → `@dependfix/core`、`packages/cli` → `dependfix`、`packages/skills` → `@dependfix/skills`）；依赖传导（如 core 升级后 cli 的依赖范围更新）由 changesets 的 `updateInternalDependencies` 自动处理，无需手动声明；
- **每轮只保留一个 changeset**：固定文件名为 `.changeset/release.md`；脚本检测到该文件已存在时会拒绝覆盖（防止丢失人工修正），需先删除或人工合并；
- **人工兜底（生成后必须 review）**：
  - breaking 判定只识别 commit 中显式标注的 `!` / `BREAKING CHANGE:` footer，未标注的破坏性变更（如以 `build:` 类型提交的纯 ESM 改造）需手动修正 bump 级别；
  - 推导基线为最新 git tag，若存在"手动发布但未打 tag"的版本（如 `@dependfix/skills` 0.1.0 手动发布晚于 `v0.1.0` tag），推导会包含已发布内容——按实际发布决策剔除本轮不发布的包；
  - summary 仅为 git 追踪可读说明，不进 CHANGELOG（见"CHANGELOG 策略"），无需精心撰写。

### 常规流程

```bash
# 1. 自动生成发布 changeset（从 git log 推导版本提升级别，生成 .changeset/release.md，见"changeset 生成规则"）
pnpm changeset:generate

# 2. 人工 review release.md：检查 bump 级别与包清单，剔除本轮不发布的包，
#    修正未标注 breaking 的破坏性变更；确保 .changeset/ 下仅保留这一个 changeset

# 3. 版本提升（消费 .changeset/*.md，更新 package.json 版本）
#    changelog 已禁用（"changelog": false），此步骤无需 GITHUB_TOKEN
pnpm changeset version

# 4. 生成 CHANGELOG（基于 conventional commits 重新生成六份日志，见"CHANGELOG 策略"）
pnpm changelog

# 5. 审查并提交（含包级 CHANGELOG.md 与 package.json 版本变更）
git add -A && git commit -m "chore(release): 版本提升至 x.y.z"

# 6. push 到 master（提交本身不触发发布；0.x 阶段发布由手动 workflow_dispatch 触发）
git push origin master

# 7. 手动触发发布：GitHub Actions → Release → Run workflow（workflow_dispatch）
```

### 定时自动发布（1.0.0+ 启用）

`release.yml` 已内嵌 `schedule` 定时发布（每周六 UTC+0 12:00 = UTC+8 20:00，参照 momei），**1.0.0 正式版发布后取消 `schedule` 注释即启用**。定时触发时 CI 自动完成：

1. `changeset version`（消费待发布 changeset，无则无操作）+ `pnpm changelog`（生成日志）+ 提交并推送 master；
2. 随后执行与手动发布相同的完整流程：质量门 → changelog 校验 → `changeset publish`（OIDC）→ push tags。

手动发布（`workflow_dispatch`）时跳过自动版本提升步骤（版本已在本地提升并提交）。

### CI 发布行为

`release.yml`（`workflow_dispatch` 手动触发；1.0.0 后增加 `schedule` 定时触发）依次执行：

1. （仅 `schedule` 触发）`Auto version & changelog`：自动版本提升 + CHANGELOG 生成 + 提交推送；
2. lint → typecheck → test → build（质量门，任一失败即中止）；
3. `Verify changelog is up to date`：校验六份 CHANGELOG（根级 + `packages/cli` / `packages/core` / `packages/engine` / `packages/skills` / `packages/mcp`）已包含当前版本段（防止漏跑 `pnpm changelog` 直接发布；普通提交版本未变时自动通过）；
4. `pnpm changeset publish`：
   - **只发布有 changeset 记录的包**，无变更时安全退出（`No unpublished projects to publish`）；
   - 在 pnpm 项目内部调用 `pnpm publish`：自动替换 `workspace:*` 为实际版本，发布顺序由 changesets 编排（`@dependfix/core` / `@dependfix/skills` 先于 `dependfix`）；
   - 通过 **OIDC trusted publishing** 认证（`id-token: write` + npmjs.com 的 Trusted Publisher 配置），无需 `NPM_TOKEN`；
   - 发布成功后本地创建 `<pkg>@<version>` 格式的 git tag（如 `dependfix@0.1.1`）；
5. `Push release tags`：将 changeset publish 创建的本地 tag 推送到 GitHub（`git push origin --tags`，通过 `GITHUB_TOKEN` 认证）。

## tag 策略与包版本不同步

- **发布不需要手动打 `v*` tag**：`changeset publish` 只发布有变更的包，包版本不同步（例如只 bump 了 `dependfix`，`@dependfix/core` 未变）时未变更的包会被自动跳过，不存在"一个 tag 表达不了多版本"的问题；
- `changeset publish` 成功后会为每个发布的包创建 `<pkg>@<version>` 格式的 git tag（changesets / lerna 生态惯例），由 CI 的 `Push release tags` 步骤推送到 GitHub，供 GitHub Release 关联与后续精确回溯；
- 注意：若发布成功但后续步骤失败导致重跑，已发布的包会被跳过、tag 不会重建（可从 Git 历史手动补打）；
- 首次发布的 `v0.1.0` tag 仅用于 GitHub Release 展示与 Action 引用；文档中的 `uses: dependfix/dependfix@v1` 滚动 tag 待 `1.0.0` 稳定版发布后再启用。

## CHANGELOG 策略

- **changesets 不负责生成 changelog**（`.changeset/config.json` 中 `"changelog": false`），仅负责版本提升与发布；
- **CHANGELOG 由 `pnpm changelog` 生成**（`scripts/changelog.mjs`），基于 conventional commit 消息 + `conventional-changelog-cmyr-config`（与 momei / semantic-release-cmyr-config 生态同一套格式）：
  - **根级 `CHANGELOG.md`**：全仓库的 feat/fix/refactor 类 commit（chore/ci/docs 等类型由 preset 过滤，不进入日志；全局改动如 CI / 文档 / workspace 配置自然不展示），版本段以 `dependfix@` tag 序列划分（dependfix 为主交付物，core 单独发布的变更会随下一次 dependfix 发布段出现）；
  - **包级 `CHANGELOG.md`**（`packages/cli`、`packages/core`、`packages/skills`）：按 `git log -- <path>` 精确过滤——只有实际改动该包路径的 commit 才会进入对应日志（一个 commit 同时改两个包时会同时出现在两包日志中，这是真实影响面的体现）；`@dependfix/skills` 的同步脚本 `scripts/sync-skills.mjs` 属仓库根路径，不匹配任何包，其改动只进根级日志；
  - 分组语言由根 `package.json` 的 `changelog.language: "zh"` 控制（中文 emoji 分组：✨ 新功能 / 🐛 Bug 修复 / 📦 代码重构 等）；
- **全局改动归属约定**：根目录文件（`docs/`、`.github/`、`pnpm-workspace.yaml` 等）不匹配任何包的 path，不会出现在包级日志；若某全局改动确实影响包行为（如 overrides 改依赖解析），应在 commit 中落在包路径内或拆分提交，否则只记录在根级日志；
- **生成是增量追加的**：已存在的 CHANGELOG.md 只更新**未发布版本段**（版本号等于当前 pkg 版本且尚无对应 tag 的段，即最新 tag 之后的全部新增 commit），已发布历史段完整保留文件现状——历史 commit 重写或手动编辑均不被覆盖；文件不存在时首次全量生成；无未发布内容（版本等于最新 tag）时文件保持不变；
- **生成时机与边界行为**：在 `changeset version` 之后、publish 之前运行（此时新版本尚无 tag，未发布段输出全部新增 commit）；若在版本等于最新 tag 时运行（如 core-only 发布后、或发布后立即重跑），未发布段无新增内容（writer 可能产生的空版本段会被自动过滤），文件保持不变；
- **版本标题与 tag**：根级与包级日志的版本段均按 `dependfix@` / `@dependfix/core@` / `@dependfix/skills@` tag 序列划分（changeset publish 自动创建）。**手动发布补 tag 约束**：分段锚点是"tag 指向的 commit 自身携带的 gitTags"，包级日志还有 `git log -- <path>` 过滤——因此补打历史 tag 时必须指向**同时 touch 该包路径**的 commit（0.1.0 补打 `dependfix@0.1.0` / `@dependfix/core@0.1.0` 指向 dc607026，该 commit 同时改动两包 eslint.config.js）；若 tag 指向纯 docs/全局 commit（如 `v0.1.0` → c213fc21），包级日志因 path 过滤看不到锚点，全部历史会并入当前版本段（表现为 changelog 非增量）；
- **依赖变更提示差异**：changesets 原会在依赖包变更时向依赖方日志写入 `Updated dependencies` 行，本方案不自动生成（npm 安装时会自动带上新依赖版本，不影响使用）；
- **依赖版本**：必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容）。

## 已知限制与排查

| 现象 | 原因与处理 |
|------|-----------|
| 包**首次**发布时 OIDC 报错 | npm 的 Trusted Publisher 要求包已存在才能配置（npm/cli#8544）。初始版本必须手动发布（`pnpm publish` + `npm login`），之后版本可走 OIDC |
| 手动触发发布后所有包都被跳过 | 没有未发布的 changeset（`changeset version` 未执行或已发布过）；这是正常行为，不是错误 |
| 定时发布中途失败（质量门/发布挂） | master 可能处于"版本已提升未发布"状态：人工 `workflow_dispatch` 重试发布即可，或等待下一定时周期自愈（changeset 未消费则幂等重跑） |
| `npm publish` 发布产物中带 `workspace:*` | 使用了裸 `npm publish`。npm 不替换 workspace 协议，必须使用 `pnpm publish`（`changeset publish` 内部即走此路径） |
| OIDC 发布报 E404 / E401（pnpm 11.0.3） | pnpm 11.0.3 存在 OIDC 回归（pnpm/pnpm#11566，已修复）。升级 pnpm（或改用 `pnpm/action-setup` 默认最新版） |
| OIDC 发布报 E401 / Unable to authenticate | 检查：Trusted Publisher 的 workflow 文件名是否与 `release.yml` 完全一致（大小写敏感）；`id-token: write` 权限是否在发布 job 上；是否使用 GitHub-hosted runner |
| `pnpm changelog` 输出英文分组 | 根 `package.json` 缺少 `changelog.language: "zh"`（cmyr-config 从 cwd 的 package.json 读取语言） |
| `pnpm changelog` 报模板错误 | conventional-changelog 被解析为 8.x。必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容） |
| CI 报 "CHANGELOG 缺少版本段" | 版本已提升但漏跑了 `pnpm changelog`（发布前必须生成并提交日志） |
| 包级 CHANGELOG 非增量（0.2.0 段吞掉全部历史） | `<pkg>@<version>` 锚点 tag 缺失，或指向的 commit 未 touch 该包路径（path 过滤后看不到锚点）。处理：补打/移动 tag 到 touch 该包路径的 commit 后重跑 `pnpm changelog` |

## 关于 provenance

- npm 官方在 trusted publishing（OIDC）下会为 `npm publish` **自动生成 provenance 声明**；`pnpm publish` 的 provenance 需要显式 `--provenance` 标志（changesets 2.31.1 不透传该参数）；
- 0.1.0 预览阶段不强制要求 provenance（不阻塞发布）；后续如需要，可评估升级 changesets 或在发布前补充 provenance 步骤。
