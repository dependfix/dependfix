# scripts — 仓库级脚本

> 本目录存放 dependfix 仓库的**开发与治理级脚本**（非 npm 包代码）：发布链路、文档检查、AI 治理辅助等。
> 通过根 `package.json` 的 `pnpm <command>` 调用，或直接 `node scripts/<file>.mjs` 运行。

## 命令速查

### 发布链路

> 发布流程与规则详见 [发布指南](../docs/guide/release.md) 与 [发布管线设计](../docs/design/governance/release-pipeline.md)。

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm release:auto-version` | `auto-version.mjs` | 定时自动发布版本提升（CI schedule 专属）：release:plan 条件消费 + changelog + 版本选择 + commit + 显式 token URL push；无变更安全 no-op |
| `pnpm release:plan` | `create-release-plan.mjs` | 从 git log 推导各包版本提升级别（feat→minor / fix→patch / BREAKING→0.x minor），生成 `release-plan.md` 供人工 review/修正 |
| `pnpm release:version` | `release-version.mjs` | 消费 `release-plan.md`：依赖传导闭包计算 + 写回各包版本号 + 删除计划文件。`--dry-run` 预览 / `--force` 跳过工作区干净检查 |
| `pnpm changelog` | `changelog.mjs` | 生成/更新根级与包级 CHANGELOG.md（conventional-changelog-cmyr-config，增量追加） |
| `pnpm verify:changelog` | `verify-changelog.mjs` | 发布前校验各份 CHANGELOG（根级 + 包级）已包含当前版本段（缺失即非零退出，禁止发布） |
| `pnpm release:publish` | `release-publish.mjs` | 按 `publishOrder` 发布"本地版本未在 npm registry"的包（`pnpm publish`，OIDC 直通）+ 创建 `<pkg>@<version>` annotated tag + `v<锚版本>` 聚合 tag + 写 `release-publish-result.json`。`--dry-run` 预览；HEAD 锚点校验防误发布 |
| `pnpm release:push-tags` | `push-release-tags.mjs` | 发布 tag 推送 + 核验（CI）：显式 token URL push → 本地/远程集合对比，缺失即报错（教训见 [经验归档 §二十六](../docs/design/governance/experience-archive.md)） |
| `pnpm release:github` | `create-github-release.mjs` | 创建本轮聚合 GitHub Release（消费 `release-publish-result.json`：版本矩阵 + 根 CHANGELOG 段，core-only 取锚包包级段；0.x 标 prerelease；幂等 + 失败 warn 不阻断）。`--dry-run` 预览 notes |
| `pnpm tag:released` | `tag-released-versions.mjs` | 为"npm 已发布但本地无 tag"的版本补打锚点 tag（手动发布辅助）。`--dry-run` / `--at <commit>` |

### 文档与链接

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm check:docs` | `check-docs.mjs` | 校验仓库内 .md 文件规范（links：路径存在、锚点 slug、拒绝绝对路径/目录越界；vue-interp：docs/ 行内代码不触发 VitePress 编译失败）；`--only=<links\|vue-interp>` 单跑 |
| `pnpm docs:check:i18n` | `docs/check-i18n-duplicates.mjs` | 检查 docs 翻译页是否同时存在于旧目录（`docs/<locale>/`）与 `docs/i18n/<locale>/`（回流即报错；详见 [i18n 规范](../docs/standards/i18n.md)） |

### i18n 审计

> 平台 locale 资源位于 `apps/platform/i18n/locales/`（脚本已参数化 `--locale-root`，兼容单文件与模块化两种形态）；治理规范见 [i18n 规范](../docs/standards/i18n.md)。

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm i18n:audit` | `i18n/audit-locale-keys.mjs` | locale key 全量审计（missing parity + unused 候选汇总） |
| `pnpm i18n:audit:missing` | `i18n/audit-locale-keys.mjs --only=missing --fail-on-missing` | 缺词 parity 审计（blocker：任一 locale 缺失 base locale 的 key 即非零退出） |
| `pnpm i18n:audit:unused` | `i18n/audit-locale-keys.mjs --only=unused` | 未使用 key 候选审计（warning，不阻断；动态 key 按 `i18n/dynamic-key-allowlist.mjs` 白名单豁免） |
| `pnpm i18n:audit:duplicates` | `i18n/audit-duplicate-messages.mjs` | 跨语言重复文案候选审计（支持 `--format=markdown|json` 与 `--output` 导出报告） |
| `pnpm lint:i18n` | `@intlify/eslint-plugin-vue-i18n`（根 eslint.config.js `ESLINT_I18N=true` 开关） | vue-i18n 专项规则校验（no-unused-keys 等，执行较慢故独立命令，不并入常规 lint；已接入 CI） |

### AI 治理

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm distill:wisdom` | `distill-wisdom.mjs` | Session Wisdom 蒸馏分析：读取 `.session/wisdom.md` 输出结构化报告与迁移建议；`--check` 供 hook 检查条目数是否超阈值（详见 [Session Wisdom 蒸馏机制](../docs/design/governance/session-wisdom-distillation.md)） |
| `pnpm sync:skills` | `sync-skills.mjs` | 产品 skill 权威源镜像同步（`packages/skills/dependfix-remediator/` → `skills/dependfix-remediator/`，供 npx skills 生态发现；详见 [skill 分发设计](../docs/design/governance/skill-distribution.md)） |

### 配置单点

| 文件 | 用途 |
|---|---|
| `packages.config.mjs` | 发布包清单唯一权威声明（path / pkg / changelog / tags / publishOrder / publishable）。**新增发布包只改此文件**（+ 补包 README），changelog、release 计划映射、发布顺序、CI 校验自动生效 |

## 测试

- `*.test.mjs` 为 vitest 单测（`pnpm test` 自动扫描本目录）；发布链路核心脚本（`create-release-plan` / `release-version` / `release-publish` / `tag-released-versions` / `create-github-release` / `verify-changelog` / `push-release-tags` / `auto-version`）的纯函数均含单测；
- 网络路径（registry 已发布判定）依赖真实环境，由 `--dry-run` 实证而非单测覆盖（教训见 [经验归档 §三十二](../docs/design/governance/experience-archive.md)）。

## setup/

| 文件 | 用途 |
|---|---|
| `setup/setup-ai.mjs` | 一次性 AI 开发环境初始化（本地 skills / agents 符号链接） |

## 新增脚本约定

- 命名 `kebab-case.mjs`（Node 20 ESM，无需构建）；
- 纯函数导出 + `main()` 守卫（`process.argv[1]` 判断）以便 vitest 单测；
- 发布链路脚本必须复用 `packages.config.mjs` 单点配置，禁止硬编码包列表；
- 涉及 git / registry 副作用操作的脚本提供 `--dry-run` 预览；
- 新增脚本后同步更新本 README 命令速查表。
