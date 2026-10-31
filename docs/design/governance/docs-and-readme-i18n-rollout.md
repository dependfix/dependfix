# 文档站 + 包 README 多语言实施设计 分片：落地规范与验收记录（docs-and-readme-i18n.md §7-§13）

> 本分片自 [docs-and-readme-i18n.md](./docs-and-readme-i18n.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）；文中 `§N` 除显式标注文件路径者外，均指本分片或主文档的同名章节。

## 7. 包 README 双语结构

### 7.1 完整双语版本（cli / mcp）

`packages/cli/README.md`（中文原版）：

```markdown
# dependfix CLI

[简体中文](./README.md) | [English](./README.en-US.md)

> 自动化处理 GitHub Dependabot / Code Scanning 安全告警的 CLI 工具。

## 安装

```bash
pnpm add -g dependfix
# 或
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

## 命令

... (中文说明 + 中文代码注释)
```

`packages/cli/README.en-US.md`（英文翻译版）：

```markdown
# dependfix CLI

[简体中文](./README.md) | [English](./README.en-US.md)

> Auto-fix GitHub Dependabot / Code Scanning security alerts from the command line.

## Installation

```bash
pnpm add -g dependfix
# or
npx dependfix report-only --repo owner/repo --github-token $GITHUB_TOKEN
```

## Commands

... (英文说明 + 英文代码注释)
```

### 7.2 仅头部双语版本（core / engine / skills）

`packages/core/README.md`（中文原版，结构基本不变）：

```markdown
# @dependfix/core

[简体中文](./README.md) | [English](./README.en-US.md)

> dependfix 核心领域模型库。

详情见 [docs/design/modules/data-model.md](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/data-model.md)。

## 安装

...
```

`packages/core/README.en-US.md`（英文翻译版）：

```markdown
# @dependfix/core

[简体中文](./README.md) | [English](./README.en-US.md)

> dependfix core domain model library.

See [docs/design/modules/data-model.md](https://github.com/dependfix/dependfix/blob/master/docs/design/modules/data-model.md) for details.

## Installation

...
```

### 7.3 双语同步门禁

新增 `scripts/i18n/check-readme-i18n.mjs`：

```javascript
// 检查每个 packages/*/README.md：
// 1. 顶部必须含 [简体中文] | [English] 切换链接
// 2. README.md 与 README.en-US.md 的二级标题（##）必须完全对齐
// 3. 切换链接必须双向互链（README.md → README.en-US.md，README.en-US.md → README.md）
// 4. .gitignore 必须跟踪 README.*.md（避免 .gitignore *.md 误排除）
```

注册到 `package.json` scripts：`"check:readme-i18n": "node scripts/i18n/check-readme-i18n.mjs"`

CI test job 增加步骤：`pnpm check:readme-i18n`（与现有 `pnpm docs:check:i18n` 并列）。

## 8. 翻译流程与质量门禁

### 8.1 翻译流程（参照 [`docs/standards/i18n.md §6`](../../standards/i18n.md#_6-贡献流程)）

**翻译前**：
1. 明确目标语言（en-US）+ 阶段目标（`ui-ready` 首批）
2. 检查对应路径是否已有 `docs/i18n/en-US/<path>.md`
3. 更新 [backlog.md](../../plan/backlog.md) 当前进度

**翻译中**：
1. 优先翻译 `must-sync` 高频路径（首页 / 快速开始 / 配置 / i18n 规范）
2. 翻译文档的物理路径统一落在 `docs/i18n/en-US/`（与 momei 一致）
3. 合并前必须通过 `pnpm docs:check:i18n`（检查旧目录回流 / 重复翻译页）
4. 段落级翻译，**不重写结构**（标题层级 / 章节顺序保持与中文版一致）
5. 代码块保持原样（仅翻译注释）
6. 链接保持中文版链接（VitePress rewrites 已做 URL 重写）

**翻译后**：
```bash
pnpm lint:md:check
pnpm docs:check:i18n
pnpm check:readme-i18n   # 新增
pnpm lint
pnpm typecheck
```

### 8.2 术语约束（沿用 [`docs/standards/i18n.md §5`](../../standards/i18n.md#_5-术语约束)）

- 保留产品名：`dependfix` /`Dependabot` /`Code Scanning` /`GitHub` /`pnpm` /`TypeORM`
- 治理术语：`locale` /`fallback` /`readiness` 优先与现有英文一致
- 状态词：enabled / disabled / published / failed / succeeded 统一
- 设置键：repository / credential / scan / alert / schedule / batch / sync

### 8.3 质量门禁（CI 整合）

`.github/workflows/test.yml` test job 增加步骤（在 `pnpm docs:check:i18n` 之后）：

```yaml
- run: pnpm check:readme-i18n
```

`pnpm run` test job 完整 i18n 链路：

```yaml
- run: pnpm run lint:i18n              # 平台 UI（已有）
- run: pnpm run i18n:audit:missing    # 平台 UI（已有）
- run: pnpm run docs:check:i18n       # 文档站（已有）
- run: pnpm run check:readme-i18n     # 包 README（本设计新增）
```

## 9. 验收标准

### 9.1 P0 落地验收

- 文档站 `pnpm --filter dependfix-docs build` 通过
- 文档站运行时 `https://docs.dependfix.com` 显示语言切换入口（简体中文 / English）
- 切换后 URL 变 `/en-US/...`，对应翻译页正确渲染
- `docs/i18n/en-US/` 首批 8 个 md 文件落地（首页 + 4 guide + 1 standard + 2 governance）
- 所有 `packages/*/README.md` 含 `[简体中文] | [English]` 切换链接
- `cli` / `mcp` 包 `README.en-US.md` 完整翻译，其他包 README.en-US.md 头部翻译
- `pnpm check:readme-i18n` 通过
- `pnpm docs:check:i18n` 通过（无旧目录回流 / 重复翻译页）
- `pnpm lint:md:check` 通过
- CI test job 新增 `pnpm check:readme-i18n` 步骤且通过

### 9.2 P1 增强验收

- 语言切换入口增强（顶部 badge / 弹窗式选择）
- `hreflang` 标签 + `sitemap_<locale>.xml` + `canonical` URL 配置完整
- 翻译自动化脚手架 `scripts/i18n/sync-readme-structure.mjs` 通过
- 其他语言（zh-TW / ja-JP / ko-KR）评估 backlog 条目

### 9.3 治理验收

- 文档站 i18n 与 [`docs/standards/i18n.md`](../../standards/i18n.md) 规范对齐
- 包 README 双语与 [`docs/standards/i18n.md §4`](../../standards/i18n.md#_4-readme-多语言规范) 对齐
- 翻译流程与 [`docs/standards/i18n.md §6`](../../standards/i18n.md#_6-贡献流程) 对齐
- 术语约束与 [`docs/standards/i18n.md §5`](../../standards/i18n.md#_5-术语约束) 对齐

## 10. 上收触发条件（何时纳入 [todo.md](../../plan/todo.md) 当前阶段）

任一条件触发时，从 backlog 上收到 todo.md §当前阶段：

1. 用户实测反馈需要 en-US 文档（典型：海外 GitHub 用户询问 dependfix 但不会中文）
2. 用户实测反馈需要英文 npm README（npm 平台 UI 多英文用户）
3. momei 多语言架构验证稳定（参考周期：6 个月观察期）
4. 与 C68 AI 研判平台集成联动（M28 阶段合并实施）
5. 用户明确触发上收

## 11. 关键决策回顾

（待用户上收阶段时填充）

- **目录结构**：`docs/i18n/<locale>/` 镜像结构（vs `docs/<locale>/` 平行结构 / 共享单文件结构）
- **包 README**：手动翻译 + 人工 review（vs AI 自动翻译 / GitHub Action 自动翻译）
- **首批范围**：仅 en-US（vs 同时 zh-TW / ja-JP / ko-KR）
- **freshness 策略**：直接沿用 [`docs/standards/i18n.md §2.1`](../../standards/i18n.md#_2-1-文档翻译-freshness-分层) 三层（vs 全部 must-sync / 全部 source-only）
- **同步门禁**：新增 `pnpm check:readme-i18n`（vs 仅靠人工 review / 仅 lint:md）
- **本次只文档**：先文档沉淀 + 评估（与 C68 决策一致，避免一次性大改动）

## 12. 关联文档

- [`docs/standards/i18n.md`](../../standards/i18n.md) — i18n 规范（本文档遵循的唯一权威规范）
- [`docs/design/governance/platform-ai-integration.md`](./platform-ai-integration.md) — 平行设计先行稿（C68，本文档即 C69 候选）
- [`docs/standards/git.md §3 atomic commit 边界`](../../standards/git.md) — commit 拆分依据
- [`docs/standards/documentation.md`](../../standards/documentation.md) — 文档规范
- [`apps/platform/i18n/locales/`](../../../apps/platform/i18n/locales) — 平台 UI i18n 现有实现（参照组织方式）
- [momei translation-governance.md](https://github.com/CaoMeiYouRen/momei/blob/master/docs/guide/translation-governance.md) — 多语言治理参考
- [momei docs/.vitepress/config.ts](https://github.com/CaoMeiYouRen/momei/blob/master/docs/.vitepress/config.ts) — VitePress locales 配置参考
- [backlog.md](../../plan/backlog.md) — 候选条目登记
- [roadmap.md](../../plan/roadmap.md) — 远期候选

## 13. 文档元数据

- **设计先行稿创建时间**：2026-09-08
- **触发**：用户调研"文档国际化的需求，主要支持 zh-CN 和 en-US，具体范围包括文档站和每个包的 README.md，做法也参照墨梅项目"
- **关联阶段**：M26.3 已实施并归档（文档站 + 包 README en-US P0；见 [M26](../../plan/archive/todo-archive-phases-m26.md)）
- **审计依据**：本文档作为 P0 落地的设计依据，未走 A 阶段 audit（与 design docs 治理惯例一致）