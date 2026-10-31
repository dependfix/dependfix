# 文档站 + 包 README 多语言实施设计（i18n）

> 本文档为 **dependfix 文档站（VitePress docs）+ 包 README 多语言实施**的专项设计先行稿。`docs/standards/i18n.md`（191 行）已建立完整的多语言规范与回归门禁，平台 UI 国际化（`apps/platform/i18n/locales/` zh-CN / en-US）已落地；本文档聚焦于**补齐文档站 + 包 README 两条尚未实施链路**，实施方式参照 [momei](https://github.com/CaoMeiYouRen/momei) 项目的多语言架构（`docs/i18n/<locale>/` + VitePress locales + 顶部切换链接）。
>
> **状态**：✅ 已实施（M26.3 文档站 + 包 README en-US P0）。原挂载于 [backlog.md 短期/一次性候选任务](../../plan/backlog.md)，已由 M26 阶段实施并归档（见 [M26](../../plan/archive/todo-archive-phases-m26.md)）。

## 1. 背景与目标

### 1.1 背景

dependfix 是面向**全球开发者社区**的 GitHub 安全告警自动修复工具，目标用户包含 GitHub 国际用户与国内开发者。国际化是产品长期承诺（参见 [AGENTS.md §项目简介](../../../AGENTS.md) 与 [standards/index.md §定位](../../standards/index.md)），但当前实施严重不完整：

- ✅ **平台 UI i18n**：`apps/platform/i18n/locales/zh-CN.json` + `en-US.json` 已落地
- ✅ **多语言规范**：`docs/standards/i18n.md` 191 行完整规范（freshness 分层 + 5 类门禁 + 回归检查清单）
- ✅ **审计工具链**：`pnpm i18n:audit:missing` / `pnpm i18n:audit:unused` / `pnpm i18n:audit:duplicates` / `pnpm docs:check:i18n` / `pnpm lint:i18n`
- ❌ **文档站 i18n**：`docs/.vitepress/config.ts` 无 `locales` 配置；`docs/i18n/<locale>/` 目录不存在；仅 zh-CN（root 默认）
- ❌ **包 README 双语**：所有 `packages/*/README.md` 单语，未配 `README.en-US.md`

### 1.2 目标

1. **文档站支持 en-US 切换**：参照 momei 的 `docs/i18n/<locale>/` 结构 + VitePress `locales` + `rewrites` 模式，对外 URL 保持 `/<locale>/...` 形式。
2. **包 README 双语**：每个 `packages/*/README.md` 配套 `README.en-US.md`，顶部含语言切换链接，遵循 [`docs/standards/i18n.md §4` README 多语言规范](../../standards/i18n.md#_4-readme-多语言规范)。
3. **纳入 CI 回归门禁**：依赖现有 `pnpm docs:check:i18n` + 新增 README 双语链接检查（防止 `README.md` / `README.en-US.md` 不同步）。
4. **过渡期策略**：首批 `ui-ready` 仅覆盖"高频公开入口"（首页 / 快速开始 / 部署 / 翻译治理），深层 Standards 与低频 Guide 保持 `source-only`（按 §2.1 分层治理）。

## 2. 现状盘点

### 2.1 文档站 i18n 现状

**`docs/` 结构**（仅 zh-CN）：

```
docs/
├── design/                # 设计文档（系统架构 / 数据模型 / 治理）
├── guide/                 # 使用指南（快速开始 / 配置说明 / 发布指南等）
├── plan/                  # 规划（todo / roadmap / backlog / 归档）
├── research/              # 调研（竞品 / 策略 / 成本估算）
├── standards/             # 项目规范（10 项规范 + i18n 标准）
├── public/                # 静态资源（brand assets 副本）
├── reports/               # 回归报告
├── archive/               # 归档
├── eslint.config.js
├── package.json
├── tsconfig.json
└── index.md               # 仅中文
```

**`docs/.vitepress/config.ts` 现状**：

```typescript
export default defineConfig({
    title: 'dependfix',
    description: '自动化处理 Dependabot / Code Scanning 安全告警',
    lang: 'zh-CN',
    lastUpdated: true,
    cleanUrls: true,
    ignoreDeadLinks: true,
    themeConfig: { /* nav + sidebar + socialLinks + footer */ },
})
```

**缺口**：
- 无 `locales` 配置（默认仅 root = zh-CN）
- 无 `rewrites` 函数
- 无 `docs/i18n/<locale>/` 物理目录
- 无语言切换入口（VitePress 默认 nav 右上角）

### 2.2 包 README 现状

| 包 | README.md | README.en-US.md | 顶部切换链接 |
|:---|:---:|:---:|:---:|
| `packages/core/README.md` | ✅ | ❌ | ❌ |
| `packages/engine/README.md` | ✅ | ❌ | ❌ |
| `packages/cli/README.md` | ✅ | ❌ | ❌ |
| `packages/mcp/README.md` | ✅ | ❌ | ❌ |
| `packages/skills/README.md` | ✅ | ❌ | ❌ |

**缺口**：所有包 README 单语，违背 [`docs/standards/i18n.md §4` README 多语言规范](../../standards/i18n.md#_4-readme-多语言规范)（"中文原版固定为 `README.md`，翻译版使用 `README.<locale>.md`"）。

### 2.3 已有基础设施（可复用）

| 模块 | 状态 | 本设计复用方式 |
|:---|:---|:---|
| [`docs/standards/i18n.md`](../../standards/i18n.md) | ✅ 191 行完整规范 | 直接遵循，无需重复声明 |
| `pnpm i18n:audit:missing` | ✅ 缺词 parity 审计（平台 UI） | 文档站 i18n 沿用类似 audit 模式 |
| `pnpm docs:check:i18n` | ✅ 旧目录回流 / 重复翻译页检测 | 直接复用 |
| `pnpm lint:i18n` | ✅ vue-i18n 平台 lint | 不适用（文档站不走 vue-i18n）|
| 平台 UI 词条组织（命名空间 + 共享）| ✅ `apps/platform/i18n/locales/` | 设计参考；文档站走独立目录 |

## 3. 范围

### 3.1 P0 文档站 en-US 接入（建议首批落地）

**A. 物理目录创建**

```
docs/i18n/
└── en-US/
    ├── index.md             # 翻译版首页（hero + features 与中文版一致）
    ├── guide/
    │   ├── index.md         # guide 索引
    │   ├── quick-start.md   # 快速开始（最高频）
    │   ├── configuration.md # 配置说明（高频）
    │   └── tech-stack.md    # 技术栈（高频）
    ├── design/
    │   └── governance/
    │       ├── index.md     # 治理索引
    │       └── platform-ai-integration.md  # 设计文档（高频，未来可翻译）
    └── standards/
        └── i18.md           # i18n 规范（治理入口，自身必译）
```

**首批 en-US 范围**（按 §2.1 freshness `must-sync`）：
- ✅ `index.md`（首页）
- ✅ `guide/quick-start.md`（最高频入口）
- ✅ `guide/configuration.md`
- ✅ `guide/tech-stack.md`
- ✅ `standards/i18n.md`（治理入口，自身必译）
- ✅ `design/governance/index.md`（治理入口）
- ✅ `design/governance/platform-ai-integration.md`（AI 研判集成文档近期评审）

`source-only` 范围（首批不翻译）：
- 设计文档（`design/modules/*` / `design/governance/*` 除已列）—— 仅提供中文事实源入口
- 低频 Guide（`auto-merge.md` / `release.md` 等）—— 不承诺持续维护
- 所有 `plan/` 与 `research/` —— 中文事实源优先

### 3.2 P0 包 README 双语（建议首批落地）

| 包 | 首批翻译范围 |
|:---|:---|
| `packages/cli/README.md` | ✅ 完整双语（cli 是用户最常 npm install 的入口） |
| `packages/mcp/README.md` | ✅ 完整双语（MCP Server 是面向 AI 助手的关键入口） |
| `packages/core/README.md` | ⏳ 仅 README 头部 + 一句话简介（domain model 库，详情看 docs） |
| `packages/engine/README.md` | ⏳ 仅 README 头部 + 一句话简介（执行引擎库，详情看 docs） |
| `packages/skills/README.md` | ⏳ 仅 README 头部（skill 包作为 npm 入口，文档由 skill markdown 自带） |

**`packages/cli` 完整翻译范围**（参照 momei 的 [packages/cli/README.md](https://github.com/CaoMeiYouRen/momei/tree/master/packages/cli)）：
- 功能介绍
- 安装命令
- 子命令清单与示例
- 配置说明
- 关联包引用

### 3.3 P1 增强（建议第二批落地）

- **B. 语言切换入口增强**：VitePress nav 右上角语言切换 → 顶部 logo 旁 badge / 弹窗式选择
- **C. SEO 基础**：`hreflang` 标签 + `sitemap_<locale>.xml` + `canonical` URL
- **D. README 同步门禁**：新增 `pnpm check:readme-i18n` 脚本（检查 `README.md` 与 `README.en-US.md` 头部链接互链 + 章节结构差异）
- **E. 翻译自动化脚手架**：`scripts/i18n/sync-readme-structure.mjs`（自动比对两个 README 的章节结构，告警缺失章节）
- **F. 其他语言接入**：评估 `zh-TW` / `ja-JP` / `ko-KR`（按 momei 模板，每个语言单独 backlog 条目）

### 3.4 不做什么

- 不引入 AI 自动翻译工具（momei 经验：自动翻译质量不稳定，依赖人工 review + 术语约束）
- 不重写 `apps/platform` 现有 i18n 体系（已落地且与本文档无关）
- 不修改 `docs/standards/i18n.md` 既有规范（除非落地过程中发现矛盾）
- 不立即支持 `zh-TW` / `ja-JP` / `ko-KR`（先聚焦 zh-CN + en-US 双语）
- 不翻译 `plan/` 与 `research/` 子目录（中文事实源优先，按 §2.2 `source-only`）
- 不翻译 CHANGELOG.md（自动生成且高频变更，维护成本不匹配收益）

## 4. 架构决策

### 4.1 文档站目录结构（参照 momei）

**决策**：**`docs/i18n/<locale>/` 镜像中文根目录结构** + VitePress `rewrites` 函数去掉 `i18n/<locale>/` 前缀，对外 URL 保持 `/<locale>/...`。

```
docs/
├── index.md                      # 中文原版（默认 root）
├── guide/
├── design/
├── standards/
├── ...
└── i18n/
    └── en-US/
        ├── index.md              # 翻译版（对外 URL: /en-US/）
        ├── guide/
        │   ├── quick-start.md
        │   └── ...
        ├── design/
        └── standards/
```

**VitePress 配置**（参照 momei [`docs/.vitepress/config.ts`](https://github.com/CaoMeiYouRen/momei/blob/master/docs/.vitepress/config.ts)）：

```typescript
const translatedDocSourcePattern = /^i18n\/(en-US)\//

export default defineConfig({
    rewrites(id) {
        return id.replace(translatedDocSourcePattern, '$1/')
    },
    locales: {
        root: {
            label: '简体中文',
            lang: 'zh-CN',
            title: 'dependfix',
            description: '自动化处理 Dependabot / Code Scanning 安全告警',
        },
        'en-US': {
            label: 'English',
            lang: 'en-US',
            title: 'dependfix',
            description: 'Auto-fix GitHub Dependabot / Code Scanning security alerts',
        },
    },
    themeConfig: {
        // nav + sidebar 每个 locale 都配（与 momei 一致）
        nav: [
            { text: '首页', link: '/' },           // zh-CN
            { text: 'Home', link: '/en-US/' },     // en-US
            // ... 共用 nav 结构
        ],
    },
})
```

**不选的方案**：
- **`docs/en-US/` 平行结构** —— 已被 [`docs/standards/i18n.md §6.2` 第 4 条](../../standards/i18n.md#_6-贡献流程) 明确禁止（"旧目录回流或重复翻译页即阻塞"）
- **URL 前缀 `i18n/en-US/`** —— URL 暴露内部组织，违反 momei 实践

### 4.2 包 README 双语命名

**决策**：**`README.md`（中文原版）+ `README.en-US.md`（英文翻译版）** + 顶部切换链接 `[简体中文](./README.md) | [English](./README.en-US.md)`（与 momei 完全一致）。

**理由**：
- 遵循 [`docs/standards/i18n.md §4`](../../standards/i18n.md#_4-readme-多语言规范)（"中文原版固定为 `README.md`，翻译版使用 `README.<locale>.md`"）
- 与 momei 模板一致（[packages/cli/README.md](https://github.com/CaoMeiYouRen/momei/blob/master/packages/cli/README.md)）
- npm registry 显示 README 渲染（GitHub 直接渲染仓库根 `README.md`）

**翻译方式**：**手动翻译 + 人工 review**，不引入 AI 自动翻译工具。
- AI 翻译质量不稳定（技术术语、代码块、Markdown 表格）
- momei 实践已验证手动翻译可控（[translation-governance.md §6.2 贡献流程](https://github.com/CaoMeiYouRen/momei/blob/master/docs/guide/translation-governance.md)）
- `pnpm docs:check:i18n` + 后续 `pnpm check:readme-i18n` 已能门禁旧目录回流与双向链接

### 4.3 语言范围与发布阶段

**决策**：**首批仅 en-US**，按 [`docs/standards/i18n.md §2` 语言发布分级](../../standards/i18n.md#_2-语言发布分级) 三阶段准入：

| Locale | 阶段 | 首批范围 |
|:---|:---|:---|
| `zh-CN`（root）| `seo-ready`（已落地） | 全量（中文事实源） |
| `en-US` | `ui-ready`（本设计目标） | 高频公开入口（首页 / 快速开始 / 配置 / i18n 规范） |
| `zh-TW` / `ja-JP` / `ko-KR` | `draft`（暂不实施）| 仅语言入口预留 |

**不立即多语言并进**：先验证 en-US 流程跑通，再评估其他语言。

### 4.4 freshness 分层映射（直接采用 [i18n 规范 §2.1](../../standards/i18n.md#_2-1-文档翻译-freshness-分层)）

| 文档 | Tier | freshness 软上限 |
|:---|:---|:---|
| `docs/index.md` / `docs/i18n/en-US/index.md` | `must-sync` | 30 天 |
| `docs/guide/quick-start.md` | `must-sync` | 30 天 |
| `docs/guide/configuration.md` | `must-sync` | 30 天 |
| `docs/guide/tech-stack.md` | `must-sync` | 30 天 |
| `docs/standards/i18n.md` | `must-sync` | 30 天 |
| `docs/design/governance/index.md` | `summary-sync` | 45 天 |
| `docs/design/governance/platform-ai-integration.md` | `summary-sync` | 45 天 |
| 其他 `design/*` / 低频 `guide/*` / `plan/*` / `research/*` | `source-only` | 不做 SLA（仅提供中文事实源入口）|

## 5. 实施步骤与 commit 拆分

| 步骤 | 内容 | 工作量 | commit 数 |
|:---|:---|:---:|:---:|
| 1 | 文档站目录脚手架（`docs/i18n/en-US/` + VitePress locales + rewrites + nav/sidebar 双语） | 0.5 commit | 1 |
| 2 | 文档站首批 en-US 翻译（首页 / 4 个 guide / 1 个 standards / 1 个 governance index / 1 个 design doc = 8 个 md 文件） | 1 commit（含全部翻译）| 1 |
| 3 | 包 README 双语化（cli + mcp 完整双语 + 其他 3 个 README 头部 + 切换链接） | 1 commit | 1 |
| 4 | `pnpm check:readme-i18n` 同步门禁脚本（双向链接 + 章节结构比对） | 1 commit | 1 |
| 5 | CI workflow 更新（test.yml 添加 `pnpm check:readme-i18n` 步骤） | 1 commit | 1 |
| **合计** | — | — | **5 commits** |

每步独立 commit 允许 review Gate 与回滚，符合 [`standards/git.md` §3 atomic commit 边界](../../standards/git.md) 要求。

## 6. VitePress 配置详解

### 6.1 locales 与 rewrites

参照 [momei docs/.vitepress/config.ts](https://github.com/CaoMeiYouRen/momei/blob/master/docs/.vitepress/config.ts) 第 1-7 行：

```typescript
const translatedDocSourcePattern = /^i18n\/(en-US)\//

export default defineConfig({
    title: 'dependfix',
    description: '自动化处理 Dependabot / Code Scanning 安全告警',
    lang: 'zh-CN',
    lastUpdated: true,
    cleanUrls: true,
    ignoreDeadLinks: true,

    rewrites(id) {
        // docs/i18n/en-US/guide/foo.md → en-US/guide/foo.md（对外 URL 去掉 i18n/ 前缀）
        return id.replace(translatedDocSourcePattern, '$1/')
    },

    locales: {
        root: {
            label: '简体中文',
            lang: 'zh-CN',
            title: 'dependfix',
            description: '自动化处理 Dependabot / Code Scanning 安全告警',
            themeConfig: { /* nav + sidebar + socialLinks + footer */ },
        },
        'en-US': {
            label: 'English',
            lang: 'en-US',
            title: 'dependfix',
            description: 'Auto-fix GitHub Dependabot / Code Scanning security alerts',
            themeConfig: { /* nav + sidebar 翻译版 */ },
        },
    },
})
```

### 6.2 nav 与 sidebar 双语策略

**两种实现方式**（与 momei 一致，本设计选 #1）：

1. **每个 locale 独立 themeConfig**（推荐）：`locales.<locale>.themeConfig.nav/sidebar` 完全独立，结构可以略有差异（适合 nav 文本长差异）
2. **共享 themeConfig + i18n key**：VitePress 不内置 i18n key 系统，需自定义方案

本设计采用 #1，与 momei 一致（参照 [momei config.ts 第 9-114 行](https://github.com/CaoMeiYouRen/momei/blob/master/docs/.vitepress/config.ts)）。

### 6.3 语言切换入口

VitePress 自动在 nav 右上角渲染语言切换 Dropdown（基于 `locales` 字段），无需额外配置。落地后访问 `https://docs.dependfix.com` 会自动看到「简体中文 / English」切换入口。

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [docs-and-readme-i18n-rollout.md](./docs-and-readme-i18n-rollout.md) | §7 - §13 | 包 README 双语结构 / 翻译流程与质量门禁 / 验收标准 / 上收触发条件 / 关键决策回顾 / 关联文档 / 文档元数据 |
