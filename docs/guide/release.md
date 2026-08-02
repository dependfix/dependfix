# 发布指南

本指南说明 `dependfix` 的 npm 发布流程、版本策略与发布自动化配置。

## 发布包清单

当前 Monorepo 对外发布两个 npm 包：

| 包 | 说明 | npm 地址 |
|----|------|----------|
| `dependfix` | CLI 应用入口（含 `dependfix` bin 命令） | https://www.npmjs.com/package/dependfix |
| `@dependfix/core` | 核心领域模型库 | https://www.npmjs.com/package/@dependfix/core |

## 版本策略

- **0.x 即预览版**：当前处于开发阶段，`0.1.0` 及后续 `0.x` 版本直接作为 `latest` 发布，**不加 `beta` 等预发布后缀**。理由：
  - `0.x` 在 semver 中本身就是"初始开发、API 不稳定"语义，已充分表达预览状态；
  - npm 默认不安装带预发布后缀的版本（需显式 `dependfix@beta`），会给预览测试设置障碍；
  - changesets 的 pre 模式会增加每轮发布的维护成本。
- **稳定信号来自 `1.0.0`**：API 稳定后发布 `1.0.0`，届时再启用 `@v1` 滚动 tag（GitHub Action 引用）。
- 版本号由 Changesets 管理（`.changeset/`），包版本升级语义（patch / minor / major）在提交时通过 changeset 声明；CHANGELOG 由 `pnpm changelog` 基于 conventional commits 生成（见"CHANGELOG 策略"）。

## 发布架构

| 阶段 | 触发方式 | 认证方式 | 发布命令 |
|------|----------|----------|----------|
| 首次发布 `0.1.0` | 手动（一次性） | npm 账号登录（`npm login`） | `pnpm publish`（本地） |
| 后续版本 `0.1.1+` | push 到 `master` | **OIDC Trusted Publishing**（无 `NPM_TOKEN`） | `pnpm changeset publish`（CI） |

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
4. 两个包（`dependfix` 与 `@dependfix/core`）都要配置。

> ⚠️ 包必须已存在于 npm 上才能配置 Trusted Publisher（npm/cli#8544）。因此 `@dependfix/core` 的首次发布必须先手动完成（见下），之后才能配置并启用 OIDC。

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

# 2. 检查包内容（确认 dist / bin / README / LICENSE 都在）
pnpm --filter @dependfix/core pack --pack-destination "$env:TEMP"   # Windows PowerShell
pnpm --filter dependfix pack --pack-destination "$env:TEMP"        # Windows PowerShell
# bash/zsh 使用：pnpm --filter @dependfix/core pack --pack-destination /tmp

# 3. 本地试跑构建产物
node packages/cli/dist/bin.mjs --help

# 4. npm 登录（一次性，pnpm publish 复用 npm 凭据）
npm login

# 5. 发布（顺序重要：先被依赖方 @dependfix/core，再 dependfix）
#    必须使用 pnpm publish：它会替换 workspace:* 为实际版本
pnpm --filter @dependfix/core publish
pnpm --filter dependfix publish

# 6. 打 tag（供 GitHub Release 关联与 Action 引用）
git tag v0.1.0
git push origin v0.1.0

# 7. 验证
npm view dependfix version          # 期望 0.1.0，dist-tags.latest
npm view @dependfix/core version    # 期望 0.1.0
npm view dependfix dependencies     # 期望 @dependfix/core 为具体版本（非 workspace:*）
npm i -g dependfix && dependfix --version   # 或临时目录 npx dependfix --help

# 8.（可选）GitHub Release（预览版标记 pre-release）
gh release create v0.1.0 --generate-notes --prerelease

# 9. 在 npmjs.com 为两个包配置 Trusted Publisher（见"前置配置"）
```

## 后续版本（0.1.1+）

### 常规流程

```bash
# 1. 代码变更时创建 changeset（选择受影响包 + 版本类型 + 变更描述）
pnpm changeset

# 2. 版本提升（消费 .changeset/*.md，更新 package.json 版本）
#    changelog 已禁用（"changelog": false），此步骤无需 GITHUB_TOKEN
pnpm changeset version

# 3. 生成 CHANGELOG（基于 conventional commits 重新生成三份日志，见"CHANGELOG 策略"）
pnpm changelog

# 4. 审查并提交（含包级 CHANGELOG.md 与 package.json 版本变更）
git add -A && git commit -m "chore(release): 版本提升至 x.y.z"

# 5. push 到 master —— 触发 .github/workflows/release.yml 自动发布
git push origin master
```

### CI 自动发布行为

`release.yml`（push master 触发）依次执行：

1. lint → typecheck → test → build（质量门，任一失败即中止）；
2. `pnpm changeset publish`：
   - **只发布有 changeset 记录的包**，无变更时安全退出（`No unpublished projects to publish`）；
   - 在 pnpm 项目内部调用 `pnpm publish`：自动替换 `workspace:*` 为实际版本，发布顺序由 changesets 编排（`@dependfix/core` 先于 `dependfix`）；
   - 通过 **OIDC trusted publishing** 认证（`id-token: write` + npmjs.com 的 Trusted Publisher 配置），无需 `NPM_TOKEN`；
   - 发布成功后本地创建 `<pkg>@<version>` 格式的 git tag（如 `dependfix@0.1.1`）；
3. `Push release tags`：将 changeset publish 创建的本地 tag 推送到 GitHub（`git push origin --tags`，通过 `GITHUB_TOKEN` 认证）。

## tag 策略与包版本不同步

- **发布不需要手动打 `v*` tag**：`changeset publish` 只发布有变更的包，包版本不同步（例如只 bump 了 `dependfix`，`@dependfix/core` 未变）时未变更的包会被自动跳过，不存在"一个 tag 表达不了多版本"的问题；
- `changeset publish` 成功后会为每个发布的包创建 `<pkg>@<version>` 格式的 git tag（changesets / lerna 生态惯例），由 CI 的 `Push release tags` 步骤推送到 GitHub，供 GitHub Release 关联与后续精确回溯；
- 注意：若发布成功但后续步骤失败导致重跑，已发布的包会被跳过、tag 不会重建（可从 Git 历史手动补打）；
- 首次发布的 `v0.1.0` tag 仅用于 GitHub Release 展示与 Action 引用；文档中的 `uses: dependfix/dependfix@v1` 滚动 tag 待 `1.0.0` 稳定版发布后再启用。

## CHANGELOG 策略

- **changesets 不负责生成 changelog**（`.changeset/config.json` 中 `"changelog": false`），仅负责版本提升与发布；
- **CHANGELOG 由 `pnpm changelog` 生成**（`scripts/changelog.mjs`），基于 conventional commit 消息 + `conventional-changelog-cmyr-config`（与 momei / semantic-release-cmyr-config 生态同一套格式）：
  - **根级 `CHANGELOG.md`**：全仓库的 feat/fix/refactor 类 commit（chore/ci/docs 等类型由 preset 过滤，不进入日志；全局改动如 CI / 文档 / workspace 配置自然不展示），版本段以 `dependfix@` tag 序列划分（dependfix 为主交付物，core 单独发布的变更会随下一次 dependfix 发布段出现）；
  - **包级 `CHANGELOG.md`**（`packages/cli`、`packages/core`）：按 `git log -- <path>` 精确过滤——只有实际改动该包路径的 commit 才会进入对应日志（一个 commit 同时改两个包时会同时出现在两包日志中，这是真实影响面的体现）；
  - 分组语言由根 `package.json` 的 `changelog.language: "zh"` 控制（中文 emoji 分组：✨ 新功能 / 🐛 Bug 修复 / 📦 代码重构 等）；
- **全局改动归属约定**：根目录文件（`docs/`、`.github/`、`pnpm-workspace.yaml` 等）不匹配任何包的 path，不会出现在包级日志；若某全局改动确实影响包行为（如 overrides 改依赖解析），应在 commit 中落在包路径内或拆分提交，否则只记录在根级日志；
- **生成是幂等的**：脚本每次全量重新生成（`releaseCount: 0`），不依赖历史 changelog 内容；
- **生成时机与边界行为**：在 `changeset version` 之后、publish 之前运行（此时新版本尚无 tag，当前版本段输出全部新增 commit）；若在版本等于最新 tag 时运行（如 core-only 发布后、或发布后立即重跑），顶层段会复用该版本号并生成自引用 compare 链接，属正常现象，下一版本发布段会自动归位；
- **版本标题与 tag**：根级与包级日志的版本段均按 `dependfix@` / `@dependfix/core@` tag 序列划分（changeset publish 自动创建）；无 tag 的首版（0.1.0）从仓库最早 commit 生成；
- **依赖变更提示差异**：changesets 原会在依赖包变更时向依赖方日志写入 `Updated dependencies` 行，本方案不自动生成（npm 安装时会自动带上新依赖版本，不影响使用）；
- **依赖版本**：必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容）。

## 已知限制与排查

| 现象 | 原因与处理 |
|------|-----------|
| 包**首次**发布时 OIDC 报错 | npm 的 Trusted Publisher 要求包已存在才能配置（npm/cli#8544）。初始版本必须手动发布（`pnpm publish` + `npm login`），之后版本可走 OIDC |
| push master 后所有包都被跳过 | 没有未发布的 changeset（`changeset version` 未执行或已发布过）；这是正常行为，不是错误 |
| `npm publish` 发布产物中带 `workspace:*` | 使用了裸 `npm publish`。npm 不替换 workspace 协议，必须使用 `pnpm publish`（`changeset publish` 内部即走此路径） |
| OIDC 发布报 E404 / E401（pnpm 11.0.3） | pnpm 11.0.3 存在 OIDC 回归（pnpm/pnpm#11566，已修复）。升级 pnpm（或改用 `pnpm/action-setup` 默认最新版） |
| OIDC 发布报 E401 / Unable to authenticate | 检查：Trusted Publisher 的 workflow 文件名是否与 `release.yml` 完全一致（大小写敏感）；`id-token: write` 权限是否在发布 job 上；是否使用 GitHub-hosted runner |
| `pnpm changelog` 输出英文分组 | 根 `package.json` 缺少 `changelog.language: "zh"`（cmyr-config 从 cwd 的 package.json 读取语言） |
| `pnpm changelog` 报模板错误 | conventional-changelog 被解析为 8.x。必须使用 `conventional-changelog@^7`（8.x 模板引擎与 cmyr-config 3.x 不兼容） |

## 关于 provenance

- npm 官方在 trusted publishing（OIDC）下会为 `npm publish` **自动生成 provenance 声明**；`pnpm publish` 的 provenance 需要显式 `--provenance` 标志（changesets 2.31.1 不透传该参数）；
- 0.1.0 预览阶段不强制要求 provenance（不阻塞发布）；后续如需要，可评估升级 changesets 或在发布前补充 provenance 步骤。
