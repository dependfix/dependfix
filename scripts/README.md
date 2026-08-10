# scripts — 仓库级脚本

> 本目录存放 dependfix 仓库的**开发与治理级脚本**（非 npm 包代码）：发布链路、文档检查、AI 治理辅助等。
> 通过根 `package.json` 的 `pnpm <command>` 调用，或直接 `node scripts/<file>.mjs` 运行。

## 命令速查

### 发布链路

> 发布流程与规则详见 [发布指南](../docs/guide/release.md) 与 [发布管线设计](../docs/design/governance/release-pipeline.md)。

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm release:plan` | `create-release-plan.mjs` | 从 git log 推导各包版本提升级别（feat→minor / fix→patch / BREAKING→0.x minor），生成 `release-plan.md` 供人工 review/修正 |
| `pnpm release:version` | `release-version.mjs` | 消费 `release-plan.md`：依赖传导闭包计算 + 写回各包版本号 + 删除计划文件。`--dry-run` 预览 / `--force` 跳过工作区干净检查 |
| `pnpm changelog` | `changelog.mjs` | 生成/更新根级与包级 CHANGELOG.md（conventional-changelog-cmyr-config，增量追加） |
| `pnpm release:publish` | `release-publish.mjs` | 按 `publishOrder` 发布"本地版本未在 npm registry"的包（`pnpm publish`，OIDC 直通）+ 创建 `<pkg>@<version>` annotated tag + `v<锚版本>` 聚合 tag + 写 `release-publish-result.json`。`--dry-run` 预览；HEAD 锚点校验防误发布 |
| `pnpm release:github` | `create-github-release.mjs` | 创建本轮聚合 GitHub Release（消费 `release-publish-result.json`：版本矩阵 + 根 CHANGELOG 段，core-only 取锚包包级段；0.x 标 prerelease；幂等 + 失败 warn 不阻断）。`--dry-run` 预览 notes |
| `pnpm tag:released` | `tag-released-versions.mjs` | 为"npm 已发布但本地无 tag"的版本补打锚点 tag（手动发布辅助）。`--dry-run` / `--at <commit>` |

### 文档与链接

| pnpm 命令 | 脚本 | 用途 |
|---|---|---|
| `pnpm check:links` | `check-links.mjs` | 校验仓库内 .md 文件的本地链接（路径存在、锚点 slug 匹配、拒绝绝对路径与目录越界） |

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

- `*.test.mjs` 为 vitest 单测（`pnpm test` 自动扫描本目录）；发布链路核心脚本（`create-release-plan` / `release-version` / `release-publish` / `tag-released-versions`）的纯函数均含单测；
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
