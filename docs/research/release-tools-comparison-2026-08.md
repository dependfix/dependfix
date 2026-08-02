# Monorepo 发布工具对比调研（2026-08）

> 调研日期：2026-08-02 | 用途：评估 dependfix（pnpm workspace monorepo）的发布工具选型与 changelog 格式方案

## 结论摘要

1. **changesets 的 changelog 自定义能力最弱**：`getReleaseLine`/`getDependencyReleaseLine` 只能定制**条目**，版本标题（`## x.y.z`）与分组标题（`### Major/Minor/Patch Changes`）在 `@changesets/apply-release-plan@7.1.1` 源码（`dist/changesets-apply-release-plan.esm.js:173`、`:120`）中**写死**。
2. **semantic-release 的 changelog 与用户习惯格式天然契合**：`@semantic-release/release-notes-generator` 的 `config` 选项可直接挂载自定义 conventional-changelog preset（如 `conventional-changelog-cmyr-config`），momei 的 CHANGELOG 格式即由此生态生成；**但 semantic-release 原生不支持 monorepo 多包独立版本**，是其硬伤。
3. **Nx Release 自定义能力最强**（自定义 renderer + 分组标题自定义），但要求引入整个 Nx 工具链，对仅需发布能力的项目过重。
4. **对 dependfix 的建议**：保持 changesets（版本管理 + 发布 + OIDC 已落地），changelog 生成采用"禁用 changesets changelog + 用 conventional-changelog-cmyr-config 生成"的混合方案，可获得与 momei 完全一致的日志格式，且不引入新发布工具。

---

## 一、工具总览与活跃度（数据日期：2026-08-02，GitHub API）

| 工具 | 定位 | Stars | 最近活跃 | 周下载量* |
|------|------|------:|----------|----------:|
| [changesets](https://github.com/changesets/changesets) | 文件式版本管理（.changeset/*.md） | 12,210 | 2026-08-02 | ~3M |
| [semantic-release](https://github.com/semantic-release/semantic-release) | 全自动、commit 驱动 | 23,934 | 2026-08-02 | ~2M |
| [release-it](https://github.com/release-it/release-it) | 交互式手动发布 CLI | 9,017 | 2026-07-31 | ~2M |
| [Lerna](https://github.com/lerna/lerna) | 经典 monorepo 版本/发布（现由 Nx 驱动） | 36,053 | 2026-07-31 | — |
| [Nx Release](https://github.com/nrwl/nx) | Nx 内置发布能力 | 29,170 | 2026-08-01 | — |
| [release-please](https://github.com/googleapis/release-please) | Google 的 release PR 自动化 | 7,281 | 2026-07-31 | — |

\* 周下载量为 [pkgpulse 2026-03 对比文章](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026) 引用的 npm registry 数据（2026-02 周均），为第三方数据。

全部工具均为 MIT 许可证（release-please 为 Apache-2.0），均在维护中。Lerna 曾长期维护停滞（2022 年 Nx 团队接管），目前 9.x 由 Nx 引擎驱动、[9.0.7（2026-03-13）](https://github.com/lerna/lerna/blob/main/CHANGELOG.md) 仍在发布。

---

## 二、核心对比矩阵

| 维度 | changesets | semantic-release | release-it | Lerna 8/9 | Nx Release |
|------|-----------|-----------------|-----------|-----------|-----------|
| **Monorepo 多包独立版本** | ✅ 一等公民 | ❌ 原生不支持（[issue #1688](https://github.com/semantic-release/semantic-release/issues/1688)，需 community 插件或逐包 workflow） | ⚠️ 有限（[issue #516](https://github.com/release-it/release-it/issues/516) 多包发布为痛点） | ✅ fixed/independent 两种模式 | ✅ 一等公民（release groups / 独立版本） |
| **Changelog 数据源** | `.changeset/*.md` 开发者意图 | conventional commit 消息 | conventional commit 消息（插件） | conventional commit（`--conventional-commits`）或手动 | conventional commit 消息 + [version plans](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)（changeset 风格文件） |
| **版本状态存放** | `package.json` | git tags（不写 package.json，[运行期取版本困难](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)） | `package.json` | `lerna.json` / `package.json` | `package.json` |
| **Changelog 条目自定义** | ✅ `getReleaseLine`/`getDependencyReleaseLine` 模块 | ✅ `writerOpts`/`parserOpts`/`transform` 扩展 | ✅ `writerOpts` 模板函数（commitPartial 等） | ⚠️ 依赖 conventional-changelog 配置 | ✅ renderOptions + 自定义 commit types |
| **Changelog 版本标题自定义** | ❌ 写死 `## x.y.z` | ✅ preset 模板（headerPartial） | ✅ preset 模板 | ⚠️ 同上 | ✅ `versionTitleDate` 开关 + 自定义 renderer（Nx 22+） |
| **Changelog 分组标题自定义** | ❌ 写死 `### Major/Minor/Patch Changes` | ✅ preset 的 commitGroups（中文 emoji 分组即此机制） | ✅ `preset.types[].section` | ⚠️ 同上 | ✅ [Customize Conventional Commit Types](https://nx.dev/docs/guides/nx-release/configure-changelog-format)（section title 可改） |
| **完全自定义 renderer** | ❌ | ⚠️ 需自建 preset | ⚠️ 模板函数可覆盖大部分 | ⚠️ | ✅ [自定义 ChangelogRenderer 类](https://nx.dev/docs/guides/nx-release/configure-changelog-format)（Nx 22+，`renderMarkdown` 全权控制） |
| **pre-release** | pre 模式 + `--snapshot` | 分支驱动（`beta` 分支） | `--preRelease` 参数 | 内置 | 支持 |
| **发布底层** | `changeset publish`（调 npm/pnpm publish） | `@semantic-release/npm` | npm/yarn/pnpm | `lerna publish`（npm） | `nx release publish` |
| **OIDC trusted publishing** | ✅（底层 npm/pnpm publish 支持） | ✅（npm 插件走 npm CLI） | ✅（走 npm CLI） | ⚠️ 文档称始终用 npm 发布 | ✅ |

---

## 三、Changelog 生成与自定义能力详解

### 3.1 changesets（当前 dependfix 所用）

- **生成机制**：`changeset version` 消费 `.changeset/*.md`，写入**每个包目录**的 `CHANGELOG.md`（`@changesets/apply-release-plan@7.1.1` 源码 `path.resolve(dir, "CHANGELOG.md")`）。
- **自定义边界**（本项目本地 `node_modules` 中 `@changesets/apply-release-plan@7.1.1` 源码实证）：
  - 版本标题：`## ${release.newVersion}`（apply-release-plan esm.js:173，写死）
  - 分组标题：`### ${startCase(type)} Changes` → `### Major Changes` / `### Minor Changes` / `### Patch Changes`（esm.js:120，写死，无 `changelogTypes` 配置）
  - 条目：由配置的 changelog 模块（`@changesets/changelog-github` 或自定义模块路径）输出，可完全定制
- **格式限制根源**：changeset 只有 major/minor/patch 三种类型维度，没有 commit type（feat/fix/refactor）维度，无法还原 conventional-changelog 的 emoji 中文分组。
- **禁用方式**：`.changeset/config.json` 的 `changelog` 字段支持 `false`（[config schema 确认](https://unpkg.com/@changesets/config@3/schema.json)）。
- 参考实现：[react-turnstile](https://github.com/marsidev/react-turnstile)（pnpm + changesets 2.31.1 + OIDC 生产案例）。

### 3.2 semantic-release（用户生态：momei / semantic-release-cmyr-config）

- **生成机制**：`@semantic-release/release-notes-generator` 用 conventional-changelog 从 commit 消息生成 release notes，`@semantic-release/changelog` 写入 `CHANGELOG.md`。
- **自定义能力**（[官方 README](https://github.com/semantic-release/release-notes-generator)）：
  - `config`：**NPM 包名形式的自定义 conventional-changelog preset**——`conventional-changelog-cmyr-config` 直接可用（[semantic-release-cmyr-config](https://github.com/caomeiyouren/semantic-release-cmyr-config) 即如此配置）
  - `parserOpts` / `writerOpts`：在 preset 之上逐项覆盖
  - `linkCompare` / `linkReferences` / `host` / `commit` / `issue`：链接生成控制
- **格式**：由 preset 模板决定——momei 的 `# [1.25.0](compare) (2026-08-01)` + `### ✨ 新功能` + `* **scope:** desc ([hash](链接))` 即 [conventional-changelog-cmyr-config@3.0.0 模板](https://github.com/CaoMeiYouRen/conventional-changelog-cmyr-config)（`templates/header.hbs`、`commit.hbs`）的输出。
- **monorepo 硬伤**：[官方 issue #1688](https://github.com/semantic-release/semantic-release/issues/1688)（NPM 7 workspaces 支持请求）长期 open；多包独立版本需 [semantic-release-monorepo](https://www.npmjs.com/package/semantic-release-monorepo) 等社区方案，配置复杂，且全自动 bump 在 monorepo 中"共享工具包改动会误 bump 无关包"的风险（[pkgpulse 对比](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026)）。
- **安全属性**：两阶段可分离（analyze → publish），官方推荐短时 GITHUB_TOKEN。

### 3.3 release-it

- **机制**：`@release-it/conventional-changelog` 插件包装 conventional-changelog（bump 建议 + changelog 写入）。
- **自定义**（[插件 README](https://github.com/release-it/conventional-changelog)）：
  - `preset.types[]`：type/section/effect（`bump`/`changelog`/`hidden`）三态控制
  - `writerOpts`：`commitPartial`/`headerPartial` 等**渲染函数**直接自定义（Handlebars 模板已废弃）
  - `whatBump` / `ignoreRecommendedBump` / `strictSemVer`：bump 规则细粒度控制
- **monorepo**：非原生（多包需逐包运行或外部编排），不适合作为 monorepo 主发布工具。

### 3.4 Nx Release

- **机制**：conventional commits 自动版本 + changelog；可选 [version plans](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)（文件式，兼容 changeset 风格）。
- **自定义**（[Configure Changelog Format](https://nx.dev/docs/guides/nx-release/configure-changelog-format)）：
  - `renderOptions`：`authors` / `applyUsernameToAuthors` / `commitReferences` / `versionTitleDate`
  - **Customize Conventional Commit Types**：可改分组 section 标题
  - **Nx 22+ 自定义 `ChangelogRenderer`**：继承基类实现 `renderMarkdown`，**完全掌控输出格式**
- **代价**：依赖整个 Nx 工具链（nx.json 生态），纯发布场景引入成本高。

---

## 四、安全审计（供应链事件）

发布工具是供应链攻击的高价值目标，2025-2026 已发生多起直接攻击事件：

| 事件 | 时间 | 与发布工具关系 |
|------|------|---------------|
| [TanStack 事件](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem) | 2025-05 | **changesets + pnpm + OIDC** 发布管线被 GitHub Actions 缓存投毒利用，84 个恶意版本带合法 SLSA provenance 发布 |
| [S1ngularity 事件](https://www.sonatype.com/blog/ongoing-npm-software-supply-chain-attack-exposes-new-risks) | 2025-08-26 | **Nx 仓库的 GitHub Actions workflow 漏洞**被利用，盗取 npm 发布 token，Nx 多个包被推送恶意版本（sonatype-2025-003584） |
| [Shai-Hulud 蠕虫](https://www.sonatype.com/blog/ongoing-npm-software-supply-chain-attack-exposes-new-risks) | 2025-09 | 180+ 包被投毒，窃取凭据并自我复制（含 GitHub Actions workflow 注入） |
| [chalk/debug 事件](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) | 2025-09 | 维护者凭据钓鱼，主流包更新被注入恶意代码 |
| [Axios 事件](https://www.esentire.com/security-advisories/axios-npm-packages-compromised) | 2026-03 | axios 1.14.1 / 0.30.4 恶意版本 |
| [AsyncAPI / miasma](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) | 2026-07 | 发布管线被攻破，5 个官方包被推送恶意版本 |

**对发布工具选型的启示**（多源确认，[Sonatype](https://www.sonatype.com/blog/ongoing-npm-software-supply-chain-attack-exposes-new-risks)、[TanStack postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)、[e18e 建议](https://bsky.app/profile/e18e.dev)）：
1. **OIDC trusted publishing + 最小权限**是当前发布管线的标准安全基线（长期 token 是主要被攻击面）；
2. **changesets 两阶段流程（Version PR 分离发布）**在安全性上有结构性优势：publish 必须经过人工合并 Version PR（[pkgpulse 对比](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026)）；
3. semantic-release 的"全自动即发布"模式在 CI 环境被攻破时**没有人工闸门**，风险面更大；
4. 发布 job 不应与构建/依赖安装共享缓存与凭据（TanStack 教训）。

---

## 五、对 dependfix 的选型建议

### 背景
- 现状：pnpm workspace + changesets 2.31.1，OIDC 发布已落地（[发布指南](../../docs/guide/release.md)），版本 0.1.0 未发布；
- 诉求：CHANGELOG.md 采用用户习惯的 conventional-changelog-cmyr 格式（momei 同款）；
- 约束：两包 monorepo（dependfix / @dependfix/core）、Conventional Commits 提交纪律已建立（commitlint + cz-cmyr）。

### 方案对比

| 方案 | 说明 | 格式达成度 | 工程成本 |
|------|------|-----------|---------|
| **A. changesets + 自定义 changelog 模块** | `changelog` 指向自定义模块，条目输出 cmyr 风格 | ⚠️ 条目像，标题/分组仍为 changesets 默认 | 低 |
| **B. changesets（`changelog: false`）+ conventional-changelog-cmyr-config 生成** | 版本管理仍用 changesets，changelog 用同一 preset 生成（与 momei 完全同构） | ✅ 100% | 中（新增 2 个 devDeps + 生成脚本 + tag 策略配合） |
| **C. 迁移 semantic-release + semantic-release-monorepo** | 全自动 commit 驱动 | ✅ 100%（同生态） | 高（monorepo 插件配置复杂、误 bump 风险、OIDC 流程重做） |
| **D. 迁移 Nx Release** | 自定义 renderer 完全控制 | ✅ 100% | 高（引入整个 Nx 工具链） |

### 推荐：方案 B

理由：
1. **格式 100% 达成**：`conventional-changelog-cmyr-config` 正是 momei 格式的生成器，数据源（conventional commit）与项目提交纪律（cz-cmyr）完全匹配；
2. **保持已落地的发布链路**：OIDC 认证、`changeset publish` 自动 tag、`Push release tags` 等均不受影响（`changelog: false` 只影响 `changeset version` 的 changelog 写入）；
3. **版本管理保留 changesets 的意图驱动优势**（人工选择 bump 类型），规避 semantic-release 在 monorepo 的误 bump 风险；
4. **安全基线不变**：两阶段发布（Version PR 人工合并）继续保留。

方案 B 落地要点（待用户确认后实施）：
- `.changeset/config.json` → `"changelog": false`
- devDependencies 新增：`conventional-changelog`、`conventional-changelog-cmyr-config@^3`
- 新增生成脚本（如 `scripts/changelog.mjs`）：根级 CHANGELOG.md 全仓库生成；包级 CHANGELOG.md 需 `gitRawCommitsOpts.path` 过滤 + 包级 tag 序列（tagPrefix）
- tag 策略：compare 链接需要 `v*` 或 `pkg@version` tag 序列（changeset publish 已打 `pkg@version` tag；根级可用 `v*` 补打）
- 0.1.0 首版：从现有 git 历史真实生成（非手写）

---

## 六、来源清单

- [pkgpulse：semantic-release vs changesets vs release-it 2026](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026)（2026-03，含周下载量与功能对比）
- [Brian Schiller：Changesets vs Semantic Release](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)（2023-09，状态存放/发布流程对比）
- [xNok：Why I Chose Changesets over Semantic-Release](https://xnok.github.io/infra-bootstrap-tools/blog/intentional-releases-changesets/)（2026-06，意图驱动 vs commit 驱动哲学）
- [semantic-release/release-notes-generator（官方）](https://github.com/semantic-release/release-notes-generator)
- [semantic-release issue #1688（monorepo 支持请求）](https://github.com/semantic-release/semantic-release/issues/1688)
- [release-it/conventional-changelog 插件（官方）](https://github.com/release-it/conventional-changelog)
- [release-it issue #516（多包发布）](https://github.com/release-it/release-it/issues/516)
- [Lerna Version and Publish（官方文档）](https://lerna.js.org/docs/features/version-and-publish)
- [Nx Release Configure Changelog Format（官方文档）](https://nx.dev/docs/guides/nx-release/configure-changelog-format)
- [Nx Release File Based Versioning](https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans)
- [Nx Release 主文档](https://nx.dev/docs/guides/nx-release)
- [conventional-changelog-cmyr-config（npm）](https://www.npmjs.com/package/conventional-changelog-cmyr-config) / [GitHub](https://github.com/CaoMeiYouRen/conventional-changelog-cmyr-config)（3.0.0，模板源码已核查）
- [semantic-release-cmyr-config（GitHub）](https://github.com/caomeiyouren/semantic-release-cmyr-config)
- [TanStack 供应链事件 postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)
- [Sonatype：npm 供应链攻击（S1ngularity / Shai-Hulud）](https://www.sonatype.com/blog/ongoing-npm-software-supply-chain-attack-exposes-new-risks)
- [CISA：npm 生态大规模供应链事件通告](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [eSentire：Axios npm 包被攻破](https://www.esentire.com/security-advisories/axios-npm-packages-compromised)
- [Unit 42：AsyncAPI / miasma 事件](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [momei CHANGELOG.md（格式参照）](https://github.com/CaoMeiYouRen/momei/blob/master/CHANGELOG.md)

> 数据时效说明：GitHub stars/活跃度为 2026-08-02 实时抓取；周下载量为 2026-02 第三方数据；安全事件均附官方/安全厂商一手来源。
