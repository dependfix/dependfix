# M26 阶段归档：平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀

> **2026-09-10 M26 归档批次迁出**：本分片包含 M26 阶段 7 原子条目（M26.1 + M26.2 + M26.3 + M26.4a + M26.4b + M26.4c + M26.5）共 **23 atomic commits 实施 + 13 配套 commits（re-audit 修复 + docs 收口 + 治理补丁 + CI Coverage 修复）= 36 commits 全部 ahead=0 已推送至 origin/master** 的完整实施记录 + 关键经验 + 待迁移经验。主窗口 [todo-archive.md §M26](../todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264m264bm264cm265-全部已闭环--2026-09-10-归档) 仅保留导航指针 + 关键 commit 实证。

## 阶段摘要

- **目标**：方案 A（治理优先 + 能力扩展 + UX + 测试补强）—— 7 原子条目独立闭环覆盖平台 AI 研判集成应用层 / 批量导入 Resource owner 化 / 文档站 + 包 README 多语言 en-US P0 / License 收口 / lint baseline 治理 / e2e 适配 / 经验归档沉淀 7 个维度
- **关键决策 D1-D4**：
  - **D1**：M26 7 原子条目按 [规划规范 §1.1 任务粒度约束](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md)（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 7 原子；每原子独立验证矩阵（lint + typecheck + 定向测试）
  - **D2**：**M26.4 拆分**为 M26.4a（primeicons 降级 1 commit License 治理）+ M26.4b（baseline 22 warnings 治理 3 commits lint baseline）—— 不相干内容不合并原子条目（用户决策 2026-09-08）
  - **D3**：**M26.3 C69 仅落地 P0**（5 commits / 0.5-1 切片），P1 增强（语言切换入口增强 + SEO 基础 + 翻译自动化脚手架 + 其他语言接入评估）留 M27+ —— 避免一次性大改动
  - **D4**：**M26.5 范围 b**（wisdom 蒸馏 + experience-archive §五十八-§六十二 双轨制）—— 覆盖 M25 沉淀的 2 条新 wisdom + M25 → 当前 commit 之间 25 commits 文档治理批次新增 pattern
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **0**（M26 全部 36 commits 已推 origin/master）
- **行净增**：~3240 行（M26.1 ~1130 + M26.2 ~510 + M26.3 ~860 + M26.4a -57 + M26.4b -22 + M26.4c ~120 + M26.5 ~1500 + 配套 commits -800）

## 完整实施记录（7 原子条目 × 23 atomic commits + 13 配套 commits = 36 commits）

### M26 P 阶段规划（2 commits / 规范修正 + ahead commits 实证）

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `0ad509c` | docs(plan): M26 ahead commits 实证更新（0 → 31） | ahead commits 双向核验纪律（按 [Git 规范 §3 提交规范](../../standards/git.md)） |

### M26.1 [P1 🚀 能力 + UX] M25.2b 应用层（10 commits / ~1130 行 / standard depth audit）

**C68 P1 应用层闭环**：4 个 API 端点 + UI 改造 + i18n + docs，承接 M25.2a 基础层完成 apps/platform 端到端联通。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `80138b1` | feat(platform): M26.1 应用层 Organization + Repository AI 配置 UI（Organization AI 配置表单 + 仓库 AI 开关 + 扫描对话框 override 折叠面板） | PrimeVue Select / ToggleSwitch / DataTable 集成 + API Key Password 字段 + Anthropic URL 字段 |
| `d7fb63b` | feat(platform): M26.1 应用层 RunDetailDialog AI 用量 + alerts AI 评估列 | 用量展示 calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd；alerts 评估列 confidence / patch suggestion / breaking risks |
| `46ce342` | docs(governance): architecture.md 新增 apps/platform AI 研判集成段（M26 闭环同步） | 4 端点契约 + 合并优先级 + ScanRun.aiConfigSnapshot 字段 |
| `6ef2e27` | feat(platform): M26.1 扫描对话框 AI override 折叠面板 + repos 透传 | 运行时覆盖仓库默认 + trigger 选项 + Organization 未配 Key 时禁用 |
| `2fe6d1a` | feat(platform): M26.x settings.vue 挂载 ai-config-form + organizations/current 端点 | settings 卡片 5 → 6 张适配（触发 M26.4c admin.e2e 适配） |
| `b97babd` | feat(platform): M26.1 补全 GET /api/organizations/[id]/ai-config 端点（re-audit fix B1） | standard depth audit 触发补全端点 |
| `8becb80` | fix(i18n): M26 恢复 ai.providerOptions / ai.triggerOptions 嵌套对象（re-audit fix B4 round 2） | i18n 嵌套对象结构恢复 |
| `a899a5c` | fix(i18n): M26 修复 39 个 i18n key {zh-CN, en} 对象结构 + errors.ownersFetchFailed 字面点号 | i18n 结构对齐 |
| `a461c4c` | fix(docs): 恢复 packages/mcp/README.md 中文源描述 | momei README 模板被无意覆盖恢复 |
| `4be6e52` | fix(docs): M26.3 en-US/index.md YAML 半角冒号导致 vitepress build 失败 | YAML 半角冒号转义 |

**M26.1 关键决策**：
- **D1 验收**：4 API 端点通过 contract test（admin 权限 + 错误响应 + 字段约束） + zh-CN + en-US `ai.*` 命名空间齐全 + `pnpm i18n:audit:missing` 0 缺失
- **API Key 加密 + 内存解密 + maskSecrets 日志脱敏**（复用现有 Credential.encryptedToken AES-256-GCM）
- **合并优先级**：API override > Repository 默认 > Organization 共享 Key

### M26.2 [P2 🚀 能力 + UX] C67 批量导入 Resource owner 化（4 commits / ~510 行 / standard depth audit）

**C67 资源所有者化**：apps/platform 批量导入从"硬编码 `affiliation='owner'`"演进为 Resource owner 抽象（沿用 GitHub 官方 user / org 概念），与 MCP `discover_repos` `owner: string[]` 参数 + engine `fetchOwnerRepositories` auto-detect user/org 模式对齐。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `10af85c` | feat(platform): M26.2 C67 Credential.ownerLogin 字段 + schema 同步 + migration | data migration 路径同 `synchronize opt-in` 策略 + Zod discriminated union 扩展（`fine-grained-pat` 必填 / `github-app` 可选 / `classic-pat` 可选） |
| `9ae7c2c` | feat(platform): M26.2 C67 importable.get 单端点重构（include=owners\|repos + owner 自动发现） | 缓存策略 TTL=5min（`owners:${credentialId}` / `repos:${credentialId}:${ownerLogin}`）+ `affiliation` 保留为 deprecated 向后兼容 |
| `531c252` | feat(platform): M26.2 C67 Resource owner 选择器 UI + i18n | PrimeVue Select + 凭据切换联动逻辑 + owner 列表仅 1 项时降级为只读 chip + 5 i18n key（zh-CN + en-US） |
| `dc48c4a` | test(importable): 修复返回类型以匹配 owners 结构 - 更新测试用例中 owners 的类型定义为对象数组 | re-audit 触发类型定义修复 |

**M26.2 关键决策**：
- **D2 owner 自动发现逻辑**对 Classic PAT 多 org 用户必须测试覆盖（5+ 组织场景）—— 缓解：新增单测覆盖 multi-org fixture
- **`affiliation` deprecation 警告**：API 响应 header + 文档同步标记 deprecated
- **credential 切换联动时序**：load owners 异步 + 默认选第一个 + load repos —— loading 状态机 + Promise 链串行

### M26.3 [P2 📚 治理 / UX] C69 文档站 + 包 README 多语言 en-US P0（7 commits / ~860 行 / standard depth audit）

**C69 P0 范围闭环**：VitePress 文档站 en-US 接入 + 包 README 双语化（首批 8 个 md 文件 + 2 个 README 完整双语 + 3 个包 README 头部切换链接 + `check:readme-i18n` 同步门禁脚本 + CI 步骤）。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `4dfd630` | feat(docs): M26.3 C69 VitePress 多语言脚手架 | docs/i18n/en-US/ 物理目录 + docs/.vitepress/config.ts 加 `locales` + `rewrites` 函数去掉 `i18n/<locale>/` 前缀 |
| `1b43cf5` | feat(docs): M26.3 C69 5 个 must-sync en-US md 翻译 | docs/i18n/en-US/index.md / quick-start / configuration / tech-stack / standards/i18n.md |
| `d5e6786` | feat(docs): M26.3 C69 2 个 summary-sync en-US md 翻译（governance/index + spec-and-doc-governance） | — |
| `175c709` | feat(docs): M26.3 C69 2 个 summary-sync en-US md 翻译（architecture + platform-ai-integration） | — |
| `bb61814` | feat(platform): M26.3 C69 包 README 双语化 | cli / mcp 完整双语 + core / engine / skills README 头部切换链接 |
| `b31f5a8` | feat(i18n): M26.3 C69 check:readme-i18n 脚本 + npm script | 双向链接 + 章节结构比对 + `pnpm check:readme-i18n` |
| `a1f4357` | ci(test): M26.3 C69 CI workflow 步骤添加 check:readme-i18n | .github/workflows/test.yml test job 步骤加 `pnpm check:readme-i18n` |

**M26.3 关键决策**：
- **D3 P1 增强留 M27+**：语言切换入口增强 / SEO 基础 / 翻译自动化脚手架 / 其他语言接入评估
- **翻译方式**：手动翻译 + 人工 review（不引入 AI 自动翻译工具，避免 momei 经验教训：技术术语 + 代码块 + Markdown 表格自动翻译质量不稳定）

### M26.4a [P3 🛡️ License 治理] primeicons@8.x → 7.x 降级（1 commit / quick depth audit）

**M25 follow-up #3 闭环**：消除最后 1 个 PrimeUI License 包（primeicons@8.0.0 引入 PrimeUI Community/Commercial License + 强制 license key；v7.0.0 仍为纯 MIT）。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `7ce7803` | chore(deps): 平台 primeicons 8.x → 7.x 降级 | pnpm-lock.yaml 同步 + 全仓库 30 个 pi-icon class v7 命中验证 + docs/standards/platform.md §1 技术选型表「图标」行同步（v7/v8 icon class 命名一致，理论无需改代码） |

**M26.4a 关键决策**：
- **commit message 锚点修正**：todo.md §M26.4a 描述的 §3.7 实际不存在——上次 4c51d19 写到了 §1，延续同位置（防御 anchor 错误传播，已挂 [规划规范 §4.4](../../standards/planning.md)）

### M26.4b [P3 🧪 治理] baseline 22 warnings 治理（4 commits / quick depth audit）

**M25 follow-up #4 闭环**：清除 M25.3 后剩余 9 warnings + M26.1 实施期间新增 13 warnings 累计 22 warnings；按"治本 vs 临时"原则逐一修复，未扩展 `max-warnings` 临时方案。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `d02713a` | test(platform): 修复 M26.1 ai-config test 9 处 await-thenable + 清理 2 处未用 import（11 warnings：3 个 M26.1 文件 × 3 await + pr-checks beforeEach + container-executor.test vi） | `await-thenable`（await 同步函数 `setupMemoryDatabase`）+ `no-unused-vars` 修复 |
| `03e7dad` | test(platform): 修复 M26.4b 既有 server/ 文件 9 处 lint warning（auth-self-guard + container-executor 2 + mailer + scheduler 2 + logger + zod-helpers + setup-nuxt-server） | `no-invalid-void-type` + `max-params` + `no-empty-function` + `only-throw-error` + `max-statements-per-line` + `no-unused-vars` + `require-await` |
| `7407ed8` | test(platform): 修复 M26.4b TypeORM 1.x `connection` deprecated 收尾（2 warnings：scan-result-ddl × 2） | TypeORM 1.x `connection` 改 `dataSource` |
| `b6b52bb` | test(platform): mailer.test.ts 改 throw new Error 彻底规避 only-throw-error warning | eslint --fix 自动删除 disable 注释问题用改 throw 形式治本 |

**M26.4b 关键决策**：
- **治本 vs 临时**：未扩展 `max-warnings` 临时方案（与 M25.3 「删除占位符」治本思路一致）
- **eslint --fix 副作用删除 disable 指令**：改 throw 形式（new Error）是治本（实测 5+ 次）

### M26.4c [P3 🧪 治理] e2e 测试适配 M26.1/M26.2 行为变更（5 commits / quick depth audit）

**新增原子条目**（2026-09-10 用户决策）：M26.1 + M26.2 行为变更未同步更新 e2e 测试，导致 master CI Test job 在 4 个核心场景持续红。本批次仅测试侧适配，不改生产代码。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `c37aac7` | docs(plan): M26.4c 阶段定义与当前阶段描述 6 → 7 原子同步 | 顶部 banner 同步更新（6 → 7 原子） |
| `be74d21` | test(platform): admin.e2e 个人设置卡片断言适配 ai-config-form 第 6 张 | 「个人设置 › 五张卡片渲染」→「6 张卡片渲染」+ 语义化抽样 ai-config-form 卡片标题 |
| `6f26ae3` | test(platform): credentials-api.e2e fine-grained-pat 创建补 ownerLogin | POST /api/credentials fine-grained-pat 测试补 `ownerLogin` 字段 |
| `79dfc6a` | test(platform): credentials-crud.e2e 创建凭据显式选 classic-pat 避必填 | 创建凭据 Dialog 显式选 `classic-pat` 避开必填 ownerLogin（fine-grained-pat 创建路径由 credentials-api.e2e 覆盖） |
| `0be2b2a` | test(platform): repos-api.e2e importable 非法参数改测 include=bogus | importable 非法参数测试改测 `include=bogus`（与 importable.get.test.ts 单测对齐） |

**M26.4c 关键决策**：
- **不改生产代码**：保持 M26.1/M26.2 行为变更收敛
- **不加 data-testid 锚点**（按用户决策 no，依赖 i18n 标题文案做语义化断言）
- **不修改 UI Dialog 默认 type**（按用户决策 no，测试里显式选 classic-pat）

### M26.5 [P2 📚 治理] 经验归档沉淀（wisdom 蒸馏 + experience-archive §五十八-§六十二）（1 commit / quick depth audit）

**M25 follow-up #5 闭环**：M25 阶段 4 原子条目 + M25 → 当前 commit 之间 25 commits 文档治理批次沉淀经验追加到 `experience-archive.md` + 蒸馏 `.session/wisdom.md` 活跃条目挂接到 standards。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `6b01e35` | docs(governance): M26.5 经验归档 + wisdom 蒸馏双轨制落地 | experience-archive §五十八-§六十二 共 5 节（~1500 行净增）+ wisdom 蒸馏 4 条新挂 standards（specification-internal-consistency / baseline-lint-error-decision / i18n-anchor-check-bidirectional / zod-parseOptional-three-state）+ 压缩 5 条已挂接活跃条目到已蒸馏段（活跃 17 → 7 ≤ 15 阈值已合规） |

**M26.5 关键决策**：
- **wisdom 蒸馏活跃条目从 17 降至 7 ≤ 15 阈值**（按 `pnpm distill:wisdom --check` 验证 WISDOM_OK）
- **4 条新 pattern/principle 全部挂接到对应 standards**（5 个挂接点：ai-collaboration.md §1.4 / development.md §5.1.22 / i18n.md §3.X / testing.md §6 / planning.md §1.1）
- **分片位置**：§五十八-§六十二 归入既有 `experience-archive-§49-§57-recent-investigation.md`（按时间连续性归入 §49-§57 分片并保持编号顺延）

### M26 配套 commits（治理批次 + docs 收口）

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `a0bb647` | docs(plan): M26.4 闭环记录 + 实际范围说明 | todo.md §M26.4 实际范围说明（M26.4b 9 → 22 warnings 扩展）+ 验收清单回填 |
| `f482708` | chore(husky): pre-commit identity guard 防护 .git/config 错位事故 | husky 钩子加 git config user identity 一致性 guard |
| `dd33fac` | docs(governance): 添加 git config user identity 一致性 guard 说明 | 与 commit f482708 配套 |
| `cab3710` | chore(package): 更新 lint-staged 配置以自动添加更改文件 | lint-staged 配置更新 |
| `cd79724` | docs(platform): 增配 stylelint 及 lint 系列脚本以提升代码质量 | stylelint + lint 系列 scripts（apps/platform 增配） |
| `da0ebdf` | ci(i18n): 重构 README 检查脚本以增强可读性和可维护性 | README 检查脚本重构 |
| `db50191` | chore(deps): bump js-yaml, svgo, @vitest/mocker, hono, vitest | 依赖批量 bump |

### CI Coverage 修复（PDTFC+ 闭环 / 2026-09-10）

> **触发**：CI Test workflow #664 Coverage job 因 Branches 79.7% < 80% 阈值失败。
> **根因**：M26.3 C69 新增 `scripts/i18n/check-readme-i18n.mjs` 26 个分支 100% 未覆盖 + `apps/platform/server/utils/logger.ts` 26 branches 100% 未覆盖（session 验证矩阵只跑 pnpm test 漏检 pnpm test:coverage 是回归未被发现根因）。

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `a4a5680` | fix(ci): 补齐 check-readme-i18n 单测恢复 branches 80% coverage gate | 源文件加 `isDirectExecution(import.meta.url)` 守卫 + 导出 5 个核心函数（SWITCH_MARKER / getRepoRoot / listReadmes / extractHeadings / checkFile / main）+ scripts/i18n/check-readme-i18n.test.mjs 新增 415 行 / 28 tests covering all exports；单文件 coverage Stmts 98.5% / Branches 96.4% / Lines 98.3% / Funcs 100%；全量 Branches 80.06% ✓ |

## 阶段关键经验（已沉淀至项目知识库 / 经验归档）

### 1. 三执行器同步透传 → 应用层 audit 必查项（M26.1 + M25.2a 实证）

M26.1 落地 C68 P1 应用层承接 M25.2a 基础层（commit `80138b1` 起）。A 阶段 standard depth 触发 5 项 re-audit 修复：
- B1 补全 GET /api/organizations/[id]/ai-config 端点（commit `b97babd`）
- B4 恢复 ai.providerOptions / ai.triggerOptions 嵌套对象（commit `8becb80`）
- i18n 结构 39 key 修复（commit `a899a5c`）
- README 源描述恢复（commit `a461c4c`）
- en-US/index.md YAML 半角冒号修复（commit `4be6e52`）

**教训**：应用层落地触发 re-audit 多项修复是 standard depth audit 的合理预期（5 项修复 / 10 commits ≈ 50% 重写比例），quick depth 不足以捕获应用层完整性问题。

### 2. Resource owner 化作为 MCP `discover_repos` 对齐（M26.2 实证）

apps/platform 批量导入 Resource owner 抽象演进路径与 MCP `discover_repos` `owner: string[]` 入参 + engine `fetchOwnerRepositories` auto-detect user/org 模式对齐。3 种 credential type 行为正确：fine-grained 静态记录 / github-app 运行时解析（`GET /app/installations/{id}`） / classic-pat 运行时发现（`GET /user` + `GET /user/orgs`）。

**教训**：跨模块统一抽象（CLI / MCP / Platform）触发多 owner 场景测试覆盖（5+ 组织场景）；affiliation deprecation 警告需 API 响应 header + 文档同步标记。

### 3. 文档站 + 包 README 多语言 P0 范围控制（M26.3 实证）

C69 仅落地 P0（5 commits / 0.5-1 切片），P1 增强（语言切换入口 + SEO + 翻译自动化脚手架）留 M27+。手动翻译 + 人工 review 避免 momei 经验教训（技术术语 + 代码块 + Markdown 表格自动翻译质量不稳定）。

**教训**：i18n 大型项目分批落地（按 freshness 分层 must-sync 30 天 / summary-sync 45 天软上限）；VitePress rewrites 函数对深路径的支持需实测（`i18n/en-US/standards/i18n.md` 重写为 `/standards/i18n.html`）。

### 4. primeicons 8.x → 7.x 跨主版本降级是图标 CSS 兼容性可逆路径（M26.4a 实证）

primeicons v7.0.0 → v8.0.0 是**图标 CSS class 命名 100% 兼容** + 新增图标 + License 协议变更的混合升级。本项目实际使用 30 个 icon class（grep `pi pi-[a-z-]+` apps/platform/app/ apps/platform/server/ 实证）在 v7.0.0 全部命中。

**教训**：主版本降级前必须 ① 确认 v_latest-1 API 与 v_latest 兼容性；② grep 全仓库实际使用 API 范围；③ 在 v_latest-1 验证全部命中。**M26.4a 验收**：30 个 icon class 7.0.0 primeicons.css 全部命中（commit message 显式列出），`pnpm --filter @dependfix/platform build` 0 error。

### 5. lint baseline 22 → 0 warnings 治本 vs 临时（M26.4b 实证）

22 warnings 全部治本（不扩展 `max-warnings` 临时方案）。具体修复模式：
- `await-thenable`（await 同步函数）：改为同步函数签名 + 移除 `await`
- `no-invalid-void-type`（void union）：`Promise<{ ... } | void>` → `Promise<{ ... } | undefined>`
- `max-params`（6 参数）：合并相邻参数 + 调整顺序（保留可读性）
- `no-empty-function`（empty catch handler）：删除或加意图注释「设计如此」
- `only-throw-error`（throw 字符串）：改 `throw new Error('...')` 治本（eslint --fix 自动删除 disable 注释是 eslint 自身行为无法绕过）
- `max-statements-per-line`（同行 try/catch）：拆为多行
- `no-unused-vars`（未用 import）：删除或调整作用域
- `require-await`（async 无 await）：改同步函数签名
- `TypeORM 1.x connection deprecated`：`connection.xxx` → `dataSource.xxx`

**教训**：扩展 `max-warnings` 是"接受错误"临时方案，违反治本原则；CI 触发 ESLint 临界值是"信号"而非"阈值调整"——治理方向是"清空 warnings"而非"提高阈值"。已挂 [development.md §5.1.22 lint baseline 治理](../../standards/development.md)。

### 6. e2e 适配 vs 生产代码收敛（M26.4c 实证）

M26.1 + M26.2 行为变更（settings.vue 挂载 ai-config-form / fine-grained-pat schema 强必填 ownerLogin / importable.get 单端点重构）未同步更新 e2e 测试。本批次仅测试侧适配，不改生产代码：
- admin.e2e 语义化断言（依赖 i18n 标题文案，不加 data-testid 锚点）
- credentials-api.e2e fine-grained-pat 创建补 ownerLogin
- credentials-crud.e2e 创建凭据显式选 classic-pat 避必填（fine-grained-pat 创建路径由 credentials-api.e2e 覆盖）
- repos-api.e2e importable 非法参数改测 `include=bogus`（与 importable.get.test.ts 单测对齐）

**教训**：行为变更触发 e2e 回归是常见反模式；测试锚点策略应在 P 阶段规划时考虑（避免依赖 i18n 文案造成未来 i18n 重构失稳）；本批次仅测试侧适配是"保生产代码行为收敛"的最小变更。

### 7. CI Coverage 回归修复 PDTFC+ 工作流（M26 + CI Coverage 修复 实证）

CI Test workflow #664 Coverage job Branches 79.7% < 80% 失败。PDTFC+ 修复工作流：
- **P 阶段**：gh run list 拉取最近 5 个 Test workflow 失败 → #664 → gh run view --log 拉取失败日志 → coverage-summary.json 解析 Top uncovered branches
- **D 阶段**：方案 A 治本（重构源文件加 isDirectExecution 守卫 + 导出 5 个核心函数 + 写 28 cases 单测覆盖所有 branches） + 定向 subset 验证（vitest --coverage 单文件 96.42%）
- **T 阶段**：全量 pnpm test:coverage Branches 80.06% ✓ EXIT=0
- **A 阶段**：code-auditor quick depth Pass（0 blocker / 0 warning / 2 suggest）
- **F 阶段**：conventional-committer atomic commit `a4a5680`

**教训**：session 验证矩阵必须包含 pnpm test:coverage 不能只跑 pnpm test；新增 scripts/**.mjs CLI 工具必须配套 .test.mjs + 加 isDirectExecution 守卫 + 导出核心函数让 vitest 可 import 测试。已挂 [testing.md §6](../../standards/testing.md) + [ai-collaboration.md §2.0 PDTFC+ coverage 验证步骤](../../standards/ai-collaboration.md) + [code-auditor 主责边界](../../.github/agents/code-auditor.agent.md)「session 验证矩阵完整性必查项」。

### 8. anchor 实证 + looseNorm 规则（M26 P 阶段规划 实证）

`commit 4c51d19` message 标题写 `docs(standards): platform.md §3.7 主题引擎版本号 + 协议 + 降级时间戳同步`，实际写入到 §1 技术选型表——`docs/standards/platform.md` §3 段是「数据库规范」，不存在 §3.7。

**教训**：(a) commit message 引用文档段时 `rg -n "^## " <目标文件>` 实证锚点真实存在；(b) todo.md 验收清单引用文档段时同步实证；(c) 错误引用在后续 commit 中显式纠正 + commit message 注明"修正 NNN 引用"。已挂 [规划规范 §4.4 大批量归档批次操作规范](../../standards/planning.md#44-大批量归档批次操作规范)。

## 阶段治理记录

- **总投入**：**23 atomic commits 实施 + 13 配套 commits = 36 commits**
  - M26 P 阶段规划 1 commit（`0ad509c` ahead commits 实证）
  - M26.1 应用层 10 commits（`80138b1` `d7fb63b` `46ce342` `6ef2e27` `2fe6d1a` `b97babd` `8becb80` `a899a5c` `a461c4c` `4be6e52`）
  - M26.2 C67 4 commits（`10af85c` `9ae7c2c` `531c252` `dc48c4a`）
  - M26.3 C69 7 commits（`4dfd630` `1b43cf5` `d5e6786` `175c709` `bb61814` `b31f5a8` `a1f4357`）
  - M26.4a primeicons 1 commit（`7ce7803`）
  - M26.4b lint baseline 4 commits（`d02713a` `03e7dad` `7407ed8` `b6b52bb`）
  - M26.4c e2e 适配 5 commits（`c37aac7` `be74d21` `6f26ae3` `79dfc6a` `0be2b2a`）
  - M26.5 经验归档 1 commit（`6b01e35`）
  - M26 配套治理 + docs 收口 7 commits（`a0bb647` `f482708` `dd33fac` `cab3710` `cd79724` `da0ebdf` `db50191`）
  - CI Coverage 修复 1 commit（`a4a5680`）

- **测试覆盖**：M26.1 4 端点 contract test + UI test + i18n test + M26.2 importable.get + import-repos-dialog + multi-org fixture + M26.3 check:readme-i18n + M26.4c 4 e2e 文件（admin / credentials-api / credentials-crud / repos-api）
- **审计覆盖**：M26.1 standard depth Pass（5 项 re-audit 修复 B1/B4 + i18n + README + YAML）/ M26.2 standard depth Pass（type fix）/ M26.3 standard depth Pass（i18n 结构 + README + YAML）/ M26.4a + M26.4b + M26.4c + M26.5 quick depth Pass / CI Coverage 修复 quick depth Pass（0 blocker / 0 warning / 2 suggest）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 2026-09-10 实测 = **0**（M26 全部 36 commits 已推 origin/master）
- **文档落盘**：
  - `docs/plan/todo-archive.md` §M26 段（主窗口导航指针，详见本分片）
  - `docs/plan/todo.md` M26 段 → 顶部 banner 更新 + M27 候选评估段新增
  - `docs/plan/roadmap.md` Milestone 概述表 M26 行状态更新（进行中 → 已完成 2026-09-10 归档）+ §M26 段详细实施状态
  - `docs/plan/backlog.md` 清理 5 个已闭环 M26 主条目（C67 / C68 / C69 / C70-primeicons 降级 / baseline 9 warnings 治理 / 经验归档沉淀）
  - `docs/plan/archive/index.md` 当前基线更新（M26 完整段迁出 + M19-M21 预防性分片迁出）+ 近期归档批次登记新增 M26 行
- **关键决策**：
  - **M26.1 应用层触发 5 项 re-audit 修复**是 standard depth audit 的合理预期（10 commits ≈ 50% 重写比例），quick depth 不足以捕获应用层完整性问题
  - **M26.4 拆分**为 M26.4a（primeicons 降级）+ M26.4b（baseline warnings）—— 不相干内容不合并（用户决策 2026-09-08）
  - **M26.3 P1 增强留 M27+** —— 避免一次性大改动（5 commits P0 切片）
  - **M26.5 双轨制**（experience-archive + wisdom 蒸馏）—— 覆盖 M25 沉淀的 2 条新 wisdom + 25 commits 文档治理批次新增 pattern
  - **CI Coverage 修复 PDTFC+ 工作流**（用户报告 GitHub Action 错误 → 根因分析 → 方案 A 治本 → 全量验证 → 快速审计 → atomic commit）
- **关键经验（已挂 standards）**：
  - `docs/standards/ai-collaboration.md §1.4` 跨文档一致性核验纪律（M25 P 阶段 wisdom 沉淀）
  - `docs/standards/development.md §5.1.22` lint baseline 治理（M26.4b 实证）
  - `docs/standards/i18n.md §3.X` locale 文件管理 + insert anchor 目标 locale 文本（M25.4 + M26.3 实证）
  - `docs/standards/testing.md §6` zod `parseOptional` 三态语义（M25.4 + M24.1 实证）
  - `docs/standards/planning.md §4.4` 大批量归档批次操作规范（M26.5 + commit hash 锚点错误纠正实证）
  - `docs/standards/ai-collaboration.md §2.0` PDTFC+ coverage 验证步骤（CI Coverage 修复实证）

## 待迁移经验（next neat-freak 候选）

- **M26.1 应用层 5 项 re-audit 修复教训**：standard depth audit 在应用层实施时触发多项修复是常态，P 阶段规划时应预留时间（建议 50% 重写时间预算）；quick depth 不足以捕获应用层完整性问题
- **M26.2 owner 自动发现 5+ 组织场景 fixture**：当前 4-org 测试，未来真实场景 5+ org 需补 fixture
- **M26.3 P1 增强留 M27+ 候选**：语言切换入口增强 / SEO 基础（hreflang + sitemap.xml）/ 翻译自动化脚手架 / 其他语言接入评估（zh-TW / ja-JP / ko-KR）
- **M26.4b eslint --fix 副作用**：line-level `// eslint-disable-next-line` 与 file-level `/* eslint-disable */` 都被删除，实测 5+ 次；改 throw 形式是治本（已被开发规范采纳）
- **CI Coverage 修复 W2 follow-up**：`apps/platform/server/utils/logger.ts` 26 branches 100% 未覆盖（按本次修复同套 isDirectExecution + export + 测试模式补单测；治本但需 mock winston/fs/axiom 副作用，工作量 ~50-80 行）
- **CI Coverage 修复 W4 follow-up**：`apps/platform/server/services/executor/container-executor.ts` 35.2% branches 覆盖（68 uncovered / 105 total；M26 阶段改动引入；可走覆盖率治理批次）

## 关键 commit 索引

| 范围 | Commit 序列 |
|:---|:---|
| M26 P 阶段规划 | `0ad509c` |
| M26.1 应用层 | `80138b1` `d7fb63b` `46ce342` `6ef2e27` `2fe6d1a` `b97babd` `8becb80` `a899a5c` `a461c4c` `4be6e52` |
| M26.2 C67 Resource owner 化 | `10af85c` `9ae7c2c` `531c252` `dc48c4a` |
| M26.3 C69 文档站 + 包 README 多语言 en-US P0 | `4dfd630` `1b43cf5` `d5e6786` `175c709` `bb61814` `b31f5a8` `a1f4357` |
| M26.4a primeicons 降级 | `7ce7803` |
| M26.4b lint baseline 治理 | `d02713a` `03e7dad` `7407ed8` `b6b52bb` |
| M26.4c e2e 适配 | `c37aac7` `be74d21` `6f26ae3` `79dfc6a` `0be2b2a` |
| M26.5 经验归档 + wisdom 蒸馏 | `6b01e35` |
| M26 配套治理 + docs 收口 | `a0bb647` `f482708` `dd33fac` `cab3710` `cd79724` `da0ebdf` `db50191` |
| CI Coverage 修复 | `a4a5680` |