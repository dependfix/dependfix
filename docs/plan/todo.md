# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
---

## 当前阶段：M26 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀（M26.1+M26.2+M26.3+M26.4a+M26.4b+M26.5 共 6 原子条目 / 2026-09-08 用户决策方案 A + M26.4 拆分决策）

> **M26 阶段承接 M25.2b**：方案 A 治理优先 + 能力扩展 + UX + 测试补强，6 原子条目独立闭环覆盖平台 AI 研判集成「应用层」（P1 follow-up，承接 M25.2a 基础层）+ 批量导入 Resource owner 化（P2 能力扩展，承接 C67）+ 文档站 + 包 README 多语言 en-US P0（P2 治理，承接 C69）+ License 收口（P3 治理，承接 M25 follow-up #3）+ baseline 9 warnings 治理（P3 治理，承接 M25 follow-up #4）+ 经验归档沉淀（P2 治理，承接 M25 follow-up #5）。类型分布 🚀 2 + 🛡️ 2 + 📚 2 + UX 隐含在 M26.1/M26.2/M26.3，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md)。
>
> **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **31**（M26 P 阶段规划 2 + M26.1 8 + M26.2 3 + M26.3 7 + M26 修复 5 + M26.4a 1 + M26.4b 3 + M26.4 docs 1 + M26.5 1 = 31 commits，待用户主动推送）；当前 HEAD = `6b01e35` docs(governance): M26.5 经验归档 + wisdom 蒸馏双轨制落地
>
> **关键决策 D1-D4**：
> - **D1**：M26 6 原子条目按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 6 原子；每原子独立验证矩阵（lint + typecheck + 定向测试）
> - **D2**：**M26.4 拆分**为 M26.4a（primeicons 降级 1 commit License 治理）+ M26.4b（baseline 9 warnings 治理 1-2 commits lint baseline）—— 不相干内容不合并原子条目（用户决策 2026-09-08）
> - **D3**：**M26.3 C69 仅落地 P0**（5 commits / 0.5-1 切片），P1 增强（语言切换入口增强 + SEO 基础 + 翻译自动化脚手架 + 其他语言接入评估）留 M27+ —— 避免一次性大改动
> - **D4**：**M26.5 范围 b**（wisdom 蒸馏 + experience-archive §五十八-§六十二 双轨制）—— 覆盖 M25 沉淀的 2 条新 wisdom（principle-specification-internal-consistency + principle-baseline-lint-error-形式 vs 删除 占位符决策）+ M25 → 当前 commit 之间 25 commits 文档治理批次新增 pattern（如有）

---

### M26.1 [P1 🚀 能力 + UX] M25.2b 应用层（5 commits / ~1130 行 / standard depth audit）

- **目标**：落地平台 AI 研判集成 P1 增强（4 API 端点 + UI 改造 + i18n + docs），承接 M25.2a 基础层完成 apps/platform 端到端联通
- **范围**：
  - 4 个 API 端点：
    - `PATCH /api/organizations/[id]/ai-config`（admin / org_admin）
    - `GET /api/repos/[id]/ai-config`（viewable，不返回 apiKey 明文）
    - `POST /api/repos/[id]/ai-config`（admin / org_admin）
    - 扩展 `POST /api/repos/[id]/scan` 接受 `aiEnabled` / `aiTrigger` 运行时 override
  - UI 改造：
    - Organization AI 配置表单（Provider / Model / API Key Password / Base URL / Anthropic URL）
    - 仓库详情页 AI 研判开关 + trigger 选择
    - 扫描对话框 AI override 折叠面板
    - RunDetailDialog AI 用量 section（calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd）
    - alerts 视图 AI 评估列 + 展开 AI 评估摘要（confidence / patch suggestion / breaking risks）
  - i18n：zh-CN + en-US 加 `ai.*` 命名空间（enable/disable/provider/model/trigger 标签 + 错误消息 + 用量展示）
  - docs：`docs/design/governance/architecture.md` AI 研判段扩展（含 4 端点契约 + 合并优先级 + ScanRun.aiConfigSnapshot 字段）
- **验收标准**：
  - [ ] 4 个 API 端点通过 contract test（admin 权限 + 错误响应 + 字段约束）
  - [ ] 5 个 UI 模块完成 + PrimeVue Select / ToggleSwitch / DataTable 集成
  - [ ] zh-CN + en-US `ai.*` 命名空间齐全 + `pnpm i18n:audit:missing` 0 缺失
  - [ ] `pnpm --filter @dependfix/platform typecheck` 0 error（含 ai-config-resolver 路径）
  - [ ] `pnpm --filter @dependfix/platform test` 全过（contract test + UI test + 既有 test 不回归）
  - [ ] `pnpm --filter @dependfix/platform build` 0 error
  - [ ] `pnpm run check:docs` 0 error（architecture.md §AI 研判段扩展）
  - [ ] `pnpm licenses list --prod --json | jq '.["Unknown"] | length'` 不引入新 License 风险
  - [ ] architecture.md §AI 研判误判处理 段扩展（含 4 端点契约 + 合并优先级 + ScanRun.aiConfigSnapshot 字段）
- **不做什么**：
  - 不重写 AI 研判引擎本身（engine 层 M5 已闭环，本设计只做平台集成）
  - 不引入新 AI provider（OpenAI 兼容 + Anthropic 双 provider 足够）
  - 不立即支持"个人层"配置（按 §3.4 触发条件评估）
  - 不修改 CLI / MCP / GitHub Action 已有的 AI 参数（避免回归）
  - 不破坏现有 ScanRequest schema（仅扩展字段，向后兼容）
- **依赖**：
  - M25.2a 已闭环基础层（commit `1c65582` 数据模型 + `f174cce` Schema+Service + `7250ec1` 三执行器透传 + `49480a6` typecheck 修复）
  - [design 先行稿](../design/governance/platform-ai-integration.md) §4.1 / §4.2 / §6 API 契约 / §7 UI 详情
- **交付物**：5 atomic commits（按依赖关系拆，commit 1 = 4 API 端点 + 单测；commit 2 = Organization AI 配置表单 + 仓库 AI 开关 + 扫描对话框 override；commit 3 = RunDetailDialog + alerts 评估列；commit 4 = i18n zh-CN + en-US `ai.*`；commit 5 = docs architecture.md 扩展）
- **风险与缓解措施**：
  - **风险 1**：API Key 加密 + 内存解密 + maskSecrets 日志脱敏（复用现有 Credential.encryptedToken AES-256-GCM）—— 风险等级低，已验证加密链路
  - **风险 2**：UI 状态机变更需 e2e 覆盖（repos.vue 扫描对话框 + alerts 评估列）—— 缓解：每个 UI 模块独立单测 + e2e 抽 1 个关键路径覆盖
  - **风险 3**：architecture.md §AI 研判段扩展需谨慎避免破坏现有描述（与 §AI 研判误判处理治理基线一致）

---

### M26.2 [P2 🚀 能力 + UX] C67 批量导入 Resource owner 化（3 commits / ~4h / standard depth audit）

- **目标**：把 apps/platform 批量导入从"硬编码 `affiliation='owner'`"演进为 Resource owner 抽象（沿用 GitHub 官方 user / org 概念），与 MCP `discover_repos` `owner: string[]` 参数 + engine `fetchOwnerRepositories` auto-detect user/org 模式对齐
- **范围**：
  - 数据模型扩展：`apps/platform/server/entities/credential.ts` 新增 `ownerLogin: string | null` 列 + TypeORM migration（data migration 路径同 `synchronize opt-in` 策略，参考 [platform.md §3.6](../../docs/standards/platform.md) + [development.md §5.1.19](../../docs/standards/development.md)）
  - Schema 同步：`apps/platform/server/schemas/credential.ts` Zod discriminated union 扩展（`type='fine-grained-pat'` → ownerLogin 必填；`type='github-app'` → ownerLogin 可选从 installationId 解析；`type='classic-pat'` → ownerLogin 可选运行时发现）
  - API 单端点：`apps/platform/server/api/repos/importable.get.ts` 重构为 `?credentialId=X&include=owners|repos` 路由 + 向后兼容 `affiliation` 参数 deprecated；缓存策略 TTL=5min（`owners:${credentialId}` / `repos:${credentialId}:${ownerLogin}`）
  - UI 改造：`apps/platform/app/components/import-repos-dialog.vue` 新增 Resource owner 选择器（PrimeVue Select，与现有 credential 选择器风格一致）+ 凭据切换联动逻辑（先 load owners → 默认选第一个 → load 该 owner 的 repos）
  - i18n：5 个 key 齐全（`repos.importOwner` / `importOwnerPlaceholder` / `importOwnerPersonalBadge` / `importOwnerOrgBadge` / `errors.ownersFetchFailed`，zh-CN + en-US 各一份）
- **验收标准**：
  - [ ] `Credential.ownerLogin` 列加 TypeORM migration + schema 同步
  - [ ] 3 种 credential type 行为正确：fine-grained 静态记录 / github-app 运行时解析（`GET /app/installations/{id}`） / classic-pat 运行时发现（`GET /user` + `GET /user/orgs`）
  - [ ] `importable.get.ts` 单端点 + `include` 参数 + 向后兼容（`affiliation` deprecated 但保留；`owner` 与 `affiliation` 同时存在时 `owner` 胜出）
  - [ ] `import-repos-dialog.vue` Resource owner 选择器 + 凭据切换联动逻辑 + 当 owner 列表仅 1 项时降级为只读 chip
  - [ ] i18n 5 key 齐全（zh-CN + en-US）+ `pnpm i18n:audit:missing` 0 缺失
  - [ ] `pnpm --filter @dependfix/platform typecheck` 0 error（含 schema 扩展路径）
  - [ ] `pnpm --filter @dependfix/platform test` 全过（`importable.get` 单测 + UI test + 既有 test 不回归）
  - [ ] `pnpm --filter @dependfix/platform build` 0 error
  - [ ] `pnpm run check:docs` 0 error（如有 docs 同步）
- **不做什么**：
  - 不重写 repos 列表现有 fork / visibility / search 三维过滤（保持不变）
  - 不重写 `batch.post` 批量导入提交链路（仅修改 `importable.get` 拉取链路）
  - 不立即支持"全部 owner 合并视图"选项（用户原话：做一层 Resource owner 级别的隔离会更好）
  - 不破坏现有 `affiliation` 参数行为（仅标记 deprecated，保留向后兼容）
- **依赖**：无前置（独立 feature；MCP `discover_repos` `owner: string[]` 入参已就位）
- **交付物**：3 atomic commits（commit 1 = schema + migration + 单测；commit 2 = `importable.get` 单端点重构 + 单测；commit 3 = `import-repos-dialog` UI + i18n + 联动逻辑）
- **风险与缓解措施**：
  - **风险 1**：owner 自动发现逻辑对 Classic PAT 多 org 用户必须测试覆盖（5+ 组织场景）—— 缓解：新增单测覆盖 multi-org fixture
  - **风险 2**：`affiliation` deprecation 警告需用户明确知晓 —— 缓解：API 响应 header + 文档同步标记 deprecated
  - **风险 3**：credential 切换联动时序（load owners 异步 + 默认选第一个 + load repos）—— 缓解：loading 状态机 + Promise 链串行

---

### M26.3 [P2 📚 治理 / UX] C69 文档站 + 包 README 多语言 en-US P0（5 commits / 0.5-1 切片 / standard depth audit）

- **目标**：完成 VitePress 文档站 en-US 接入 + 包 README 双语化 P0 范围（首批 8 个 md 文件 + 2 个 README 完整双语 + 3 个包 README 头部切换链接 + `check:readme-i18n` 同步门禁脚本 + CI 步骤）；P1 增强留 M27+
- **范围**：
  - **VitePress 脚手架**：
    - `docs/i18n/en-US/` 物理目录创建（mirror 中文根目录结构）
    - `docs/.vitepress/config.ts` 加 `locales` + `rewrites` 函数去掉 `i18n/<locale>/` 前缀（对外 URL 保持 `/<locale>/...`）
    - nav / sidebar 双语策略（与 momei 一致，按 [i18n.md §6.2](../../docs/standards/i18n.md) 双语 nav 策略选 #1）
  - **首批 en-US 翻译**（按 [i18n.md §2.1 freshness 分层](../../docs/standards/i18n.md)）：
    - `must-sync`（30 天软上限）：`docs/i18n/en-US/index.md` / `docs/i18n/en-US/guide/{quick-start,configuration,tech-stack}.md` / `docs/i18n/en-US/standards/i18n.md` 共 4 个
    - `summary-sync`（45 天软上限）：`docs/i18n/en-US/design/governance/index.md` / `docs/i18n/en-US/design/governance/platform-ai-integration.md` 共 2 个
    - 另加 2 个（design/governance/{spec-and-doc-governance,architecture}.md 入口）
  - **包 README 双语化**：
    - 完整双语：`packages/cli/README.md` + `packages/cli/README.en-US.md` / `packages/mcp/README.md` + `packages/mcp/README.en-US.md`
    - 仅头部双语：`packages/core` / `packages/engine` / `packages/skills` —— 仅 README 头部含 `[简体中文] | [English]` 切换链接
  - **同步门禁**：新增 `scripts/check-readme-i18n.mjs`（双向链接 + 章节结构比对）+ `pnpm check:readme-i18n` npm script
  - **CI workflow 更新**：`.github/workflows/test.yml` test job 步骤加 `pnpm check:readme-i18n`
- **验收标准**：
  - [ ] `docs/i18n/en-US/` 目录存在 + VitePress `rewrites` 工作（访问 `/en-US/` 自动重写内部路径为 `/<en-us-path>.html`）
  - [ ] 首批 8 个 en-US md 文件翻译完成（含 i18n.md 规范同步 + 与中文版结构一致）
  - [ ] cli / mcp 完整双语 + core / engine / skills README 头部切换链接
  - [ ] `pnpm check:readme-i18n` 脚本可验证双向链接 + 章节结构一致（README.md 与 README.en-US.md 章节标题完全对齐）
  - [ ] CI test job 跑通 `pnpm check:readme-i18n` 步骤
  - [ ] `pnpm run check:docs` 0 error（含 docs/i18n/ 新建 + README 切换链接无死链）
  - [ ] `pnpm docs:build` 0 error（VitePress build 出 en-US 静态站）
  - [ ] 翻译方式：手动翻译 + 人工 review（不引入 AI 自动翻译工具）
- **不做什么**：
  - 不引入 AI 自动翻译工具（momei 经验：技术术语 + 代码块 + Markdown 表格自动翻译质量不稳定）
  - 不重写 `apps/platform` 现有 i18n 体系（已落地）
  - 不修改 `docs/standards/i18n.md` 既有规范（除非落地过程中发现矛盾）
  - 不立即支持 `zh-TW` / `ja-JP` / `ko-KR`（先聚焦 zh-CN + en-US 双语）
  - 不翻译 `plan/` 与 `research/` 子目录（中文事实源优先）
  - 不翻译 CHANGELOG.md（自动生成且高频变更）
  - 不做 P1 增强（语言切换入口增强 / SEO 基础 / 翻译自动化脚手架 / 其他语言接入评估）—— 留 M27+
- **依赖**：无前置（独立 feature）
- **交付物**：5 atomic commits（commit 1 = VitePress 脚手架 + rewrites + locales + nav/sidebar；commit 2 = 首批 8 个 en-US md 文件翻译；commit 3 = 包 README 双语化（cli/mcp 完整双语 + core/engine/skills 头部切换）；commit 4 = `check-readme-i18n` 脚本 + npm script；commit 5 = CI workflow test job 步骤）
- **风险与缓解措施**：
  - **风险 1**：en-US 翻译质量（手动翻译 + 人工 review 避免 AI 翻译不稳定）—— 缓解：commit 2 分批翻译，每批 2 个 md 文件独立 PR review
  - **风险 2**：CI 步骤新增不能破坏现有 `check:docs` / `check-links` / `lint:md` —— 缓解：本地先实测全套 check 命令通过再 commit
  - **风险 3**：VitePress rewrites 函数对深路径的支持需实测（`i18n/en-US/standards/i18n.md` 重写为 `/standards/i18n.html`）—— 缓解：本地 `pnpm docs:dev` 验证 `/en-US/standards/i18n` 路径可访问

---

### M26.4a [P3 🛡️ License 治理] primeicons@8.x → 7.x 降级（1 commit / quick depth audit）

- **闭环状态**（2026-09-09）：✅ 已闭环 commit `7ce7803` chore(deps): 平台 primeicons 8.x → 7.x 降级
- **目标**：消除最后 1 个 PrimeUI License 包（primeicons@8.0.0），项目仅用 2 个图标（`pi-check-circle` / `pi-times-circle`），license 风险有限但可一并清理；与 M25.1 `@primeuix/themes` 3.x → 2.x 降级同源策略
- **范围**：
  - `apps/platform/package.json` `primeicons` 版本约束 `^8.0.0` → `^7.0.0`
  - `pnpm install` 同步 `pnpm-lock.yaml`
  - 全仓库 `grep -rn "pi-" apps/platform/` 扫描图标引用确认与 v7 API 一致（v7/v8 icon class 命名一致，理论上无需改代码）
  - `pnpm view primeicons@7.0.0 license` 验证 MIT
- **验收标准**：
  - [ ] `primeicons` 8.x → 7.x 版本约束变更 + pnpm-lock.yaml 同步
  - [ ] `pnpm view primeicons@7.0.0 license` 输出 MIT
  - [ ] `pnpm list primeicons --filter @dependfix/platform` 输出 `7.x`
  - [ ] 全仓库 `pi-check-circle` / `pi-times-circle` 引用验证（v7 icons.css 中存在）
  - [ ] `pnpm --filter @dependfix/platform build` 0 error（图标字体加载正常）
  - [ ] `pnpm licenses list --prod --json | jq '.["Unknown"] | length'` 验证 PrimeUI License 数量减少（移除 1 个）
  - [ ] `docs/standards/platform.md §3.7` 主题引擎版本号 + 协议 + 降级时间戳同步
- **不做什么**：
  - 不升级 PrimeVue 5.x（避免全栈 PrimeUI License）
  - 不申请 PrimeUI 商业 license
  - 不迁移其他 UI 库（Element Plus / Naive UI / Vuetify 成本极高）
  - 不重写图标组件（仅依赖 CSS class，v7/v8 命名一致）
- **依赖**：
  - M25.1 已闭环 `@primeuix/themes` 3.x → 2.x 降级（同源策略）
  - M25 follow-up #3b 已落地 dependabot 拦截（commit `e3242e7` `ci(dependabot): 拦截 prime 依赖包自动更新`）—— 本次手动降级与依赖拦截互补
- **交付物**：1 atomic commit（chore(deps) primeicons 8.x → 7.x 降级）+ 配套 docs/standards/platform.md §3.7 同步
- **风险与缓解措施**：
  - **风险 1**：v7/v8 icon class 命名需 `pnpm build` 验证字体加载 —— 缓解：本地 build + dev server HTTP 200 + 浏览器目视确认图标渲染
  - **风险 2**：v7 缺某个图标需降级为 v7.0.0 之前版本 —— 缓解：实测若缺图标则 pin `primeicons@7.0.0` 之前 minor 版本

---

### M26.4b [P3 🧪 治理] baseline 22 warnings 治理（3 commits / quick depth audit）—— 实际范围 9 → 22 扩展说明

- **闭环状态**（2026-09-09）：✅ 已闭环 commit `d02713a` + `03e7dad` + `7407ed8`（共 3 atomic commits）；warnings 22 → 0
- **实际范围说明**：todo.md P 阶段规划时 baseline 9 warnings（M25.3 闭环后），M26.1 实施期间（AI 研判应用层 5 commits）新增 9 个 await-thenable（3 个 M26.1 ai-config test 文件）+ 2 个未用 import（pr-checks beforeEach + container-executor.test vi）+ 2 个既有文件 warnings 累计 = 22 warnings。本批次按"治本 vs 临时"原则逐一修复，未扩展 `max-warnings` 临时方案（与 M25.3 「删除占位符」治本思路一致）
- **目标**：清除 M25.3 后剩余 9 warnings（CI test job 触发 `ESLint found too many warnings (maximum: 10)` 临界值），逐项修复避免扩展 `max-warnings` 临时方案（与 M25.3 baseline 16 errors 「删除占位符」治本思路一致）
- **范围**（22 warnings 分布 11 文件 —— M26.1 阶段新增 13 warnings）：
  - M26.1 新增 ai-config test 文件（3 个文件 × 3 await-thenable = 9 个）：
    - `apps/platform/server/api/organizations/[id]/ai-config.patch.test.ts:33/37/38` — `await-thenable`（await 同步函数 `setupMemoryDatabase`）
    - `apps/platform/server/api/repos/[id]/ai-config.get.test.ts:46/50/51` — 同上
    - `apps/platform/server/api/repos/[id]/ai-config.post.test.ts:46/50/51` — 同上
  - M26 既有未用 import（2 个）：
    - `apps/platform/server/api/pr-checks/index.get.test.ts:2` — `no-unused-vars`（`beforeEach` import 未用）
    - `apps/platform/server/services/executor/container-executor.test.ts:1` — `no-unused-vars`（`vi` import 未用）
  - M25.3 既有 baseline（11 个）：
    - `apps/platform/server/middleware/auth-self-guard.test.ts:56` — `no-invalid-void-type`（void union）
    - `apps/platform/server/services/executor/container-executor.ts:410` — `max-params`（cloneRepository 6 参数）
    - `apps/platform/server/services/executor/container-executor.ts:477` — `no-empty-function`（empty catch handler）
    - `apps/platform/server/services/mailer/mailer.test.ts:241` — `only-throw-error`（throw 字符串覆盖 fallback 分支）
    - `apps/platform/server/services/scheduler/scheduler.integration.test.ts:71/103` — `max-statements-per-line`（try/catch 同行 + 后续语句）
    - `apps/platform/server/utils/logger.ts:22` — `no-unused-vars`（`sanitizeDeep` import 冗余，line 44 已 re-export）
    - `apps/platform/server/utils/zod-helpers.test.ts:112` — `max-statements-per-line`（三元链同行）
    - `apps/platform/tests/setup-nuxt-server.ts:42` — `require-await`（async function 无 await）
    - `apps/platform/tests/scan-result-ddl.test.ts:28/67` — `no-deprecated`（TypeORM 1.x `connection` 改 `dataSource`）
- **验收标准**（已闭环后回填）：
  - [x] 22 warnings 全部修复（`pnpm --filter @dependfix/platform lint` 0 error + 0 warnings，远低于临界值 10）
  - [x] 每个 warning 修复有针对性（仅 1 处 `// eslint-disable-next-line` 用于 `mailer.test.ts:241` 测试代码必须 throw 非 Error 覆盖 fallback 分支——commit message 显式说明是测试设计意图而非代码缺陷；未扩展 `max-warnings` 临时方案）
  - [x] `pnpm --filter @dependfix/platform typecheck` 0 error
  - [x] `pnpm --filter @dependfix/platform test` 全过（1199 passed / 7 skipped）
  - [x] `pnpm --filter @dependfix/platform build` 0 error
- **不做什么**：
  - 不扩展 `max-warnings` 临时方案（违反治本 vs 临时原则）
  - 不重写 `logger.ts` `sanitizeDeep` 实现（仅类型调整）
  - 不重构 `container-executor` 函数签名（保持现有架构，DTO 抽取留后续评估）
  - 不修改 ESLint 配置规则（仅修复违规）
- **依赖**：
  - M25.3 已闭环 baseline 16 errors（基线 `0 errors + 9 warnings`）
- **交付物**：3 atomic commits（按规则类型拆 + 兼顾 M26.1 vs M25 baseline 来源）：
  - commit 1 = `d02713a` test(platform): 修复 M26.1 ai-config test 9 处 await-thenable + 清理 2 处未用 import（11 warnings：3 个 M26.1 文件 × 3 await + pr-checks beforeEach + container-executor.test vi）
  - commit 2 = `03e7dad` test(platform): 修复 M26.4b 既有 server/ 文件 9 处 lint warning（9 warnings：auth-self-guard + container-executor 2 + mailer + scheduler 2 + logger + zod-helpers + setup-nuxt-server）
  - commit 3 = `7407ed8` test(platform): 修复 M26.4b TypeORM 1.x `connection` deprecated 收尾（2 warnings：scan-result-ddl × 2）
- **风险与缓解措施**：
  - **风险 1**：`container-executor` `max-params` 修复可能需要 DTO 抽取（保留改造范围可控）—— 缓解：如需 DTO 抽取则拆为单独原子条目，本次仅调整函数签名顺序或合并相邻参数
  - **风险 2**：empty arrow function 修复需明确意图注释（vs 删除）—— 缓解：如确无副作用则删除 + 加注释说明「设计如此」
  - **风险 3**：CI max-warnings 临界值提前扩展到 12 作临时方案 —— 缓解：本次治本，不扩展 max-warnings

---

### M26.5 [P2 📚 治理] 经验归档沉淀（wisdom 蒸馏 + experience-archive §五十八-§六十二）（1 commit / quick depth audit）

- **闭环状态**（2026-09-09）：✅ 已闭环（commit 待提交）—— experience-archive-§49-§57-recent-investigation.md 追加 §五十八-§六十二 共 5 节（~1500 行净增） + wisdom 蒸馏 4 条新挂 standards（specification-internal-consistency / baseline-lint-error-decision / i18n-anchor-check-bidirectional / zod-parseOptional-three-state）+ 压缩 5 条已挂接活跃条目到已蒸馏段（PrimeVue-multisortMeta / OR 链 + M20 阶段 3 条） + 6 个挂接点写入 standards（ai-collaboration.md §1.4 跨文档一致性 / development.md §5.1.22 baseline lint 治理 / i18n.md §3.X locale anchor / testing.md §6 zod parseOptional / planning.md §1.1 跨文档一致性 / experience-archive 主窗口分片索引表更新）
- **目标**：M25 阶段 4 原子条目 + M25 → 当前 commit 之间 25 commits 文档治理批次沉淀经验追加到 `experience-archive.md` + 蒸馏 `.session/wisdom.md` 活跃条目挂接到 standards；wisdom 活跃条目数从当前 ~18 降至 ≤ 15（按 `pnpm distill:wisdom --check --threshold=15` 验证）
- **范围**：
  - **experience-archive §五十八-§六十二 共 5 节**（每节含案例背景 + 实施路径 + 教训 + 挂接治理检查点）：
    - §五十八：M25.1 PrimeUI License 降级实施（决策依据 + 协议变更 + 兼容性验证 + License 分布 Unknown 7 → 3）
    - §五十九：M25.2a 三执行器同步透传教训（container `...ctx.config` 自动透传 + sandbox `DEPENDFIX_AI_*` env 注入 + action `workflow_dispatch` inputs 透传 + typecheck 必须实测）+ §三执行器同步 audit 必查项
    - §六十：M25.3 baseline lint 修复方向（删除占位符 vs 改写为 `void X` 的实证）+ §ESLint autofix 陷阱
    - §六十一：M25.4 i18n-anchor-check 工具化（locale 错位污染检测 + `zod-helpers.ts` `parseOptional<T>` 三态语义）+ §zod `.optional()` 陷阱
    - §六十二：M25 → 当前 commit 之间 25 commits 文档治理批次（规范精简 + experience-archive 分片 + dependabot 拦截策略 + §1.4 内部一致性修正）
  - **wisdom 蒸馏**（活跃条目 ~18 → ≤ 15）：
    - `principle-specification-internal-consistency`（M25 P 阶段新增）→ 挂接 [ai-collaboration.md §1.4](../../docs/standards/ai-collaboration.md) / [planning.md §1.1](../../docs/standards/planning.md)（规范内部一致性核验）
    - `principle-baseline-lint-error-形式 vs 删除 占位符决策`（M25.3 沉淀）→ 挂接 [development.md §5.1.x](../../docs/standards/development.md)（ESLint `no-unused-expressions` + `no-meaningless-void-operator` 双重禁止）
    - M22.4/M22.5/M22.6/M22.7/M22.8/M23.3/M25.x 累计 5-10 条活跃 pattern 蒸馏挂接（按 [Session Wisdom 蒸馏机制](../../docs/design/governance/session-wisdom-distillation.md)）
- **验收标准**（已闭环后回填）：
  - [x] `experience-archive-§49-§57-recent-investigation.md` 追加 §五十八-§六十二 共 5 节齐全（每节含 4 要素：案例背景 + 实施路径 + A 阶段审计 + 教训 + 挂接治理检查点 + 准入标准复核），按"时间连续性归入既有分片"路径（按 M26.5 风险 3 缓解措施）
  - [x] `.session/wisdom.md` 活跃条目数从 17 降至 **7**（按 `pnpm distill:wisdom --check` 验证 WISDOM_OK ≤ 20 ≤ 15 已合规）—— 4 条新挂 standards + 5 条已挂接活跃条目压缩到已蒸馏段
  - [x] 蒸馏的 4 条新 pattern/principle 全部挂接到对应 standards（`ai-collaboration.md §1.4` / `development.md §5.1.22` / `i18n.md §3.X` / `testing.md §6` / `planning.md §1.1`）—— 5 个挂接点（principle-specification-internal-consistency 双挂 ai-collaboration.md + planning.md）
  - [x] `pnpm run check:docs` exit 0（[check-docs] OK：120 个 md 文件 / vue-interp: 75 个 md 文件全部通过）—— 8 处死链已修复（commit hash 部分被反引号过滤 + 标点移除规则需按 looseNorm 实证）
  - [x] 分片位置合理：§五十八-§六十二 归入 `experience-archive-§49-§57-recent-investigation.md`（按 §58-§62 编号顺延；分片文件 842 → ~1500 行，< 2000 行阈值）
- **不做什么**：
  - 不重写现有 experience-archive §1-§57
  - 不删除 wisdom 历史条目（仅从「当前条目」迁移到「已蒸馏条目」段）
  - 不批量重写 standards（仅追加挂接）
  - 不引入新治理检查点（仅合并现有）
- **依赖**：
  - M25 阶段已闭环（提供经验源）
  - M25 → 当前 commit 之间 25 commits 已推送（提供 §六十二 文档治理批次素材）
  - wisdom 活跃条目接近阈值 20（17 条 banner 标 + 实际未及时蒸馏可能更高）
- **交付物**：1 atomic commit（docs + wisdom 蒸馏合并；commit message 显式说明双轨制）
- **风险与缓解措施**：
  - **风险 1**：经验归档需要具体 commit hash 实证 + 教训抽象粒度（不要过细也不要过粗）—— 缓解：每节引用具体 commit + 教训可挂接到至少 1 个 standards 文件
  - **风险 2**：wisdom 蒸馏需保持 pattern 单源语义（避免与构建产物 / source vs dist 不一致教训重复登记）—— 缓解：与现有 pattern 比对后再决定合并 / 独立
  - **风险 3**：experience-archive 分片位置决策（归入 §49-§57 vs 新建 §58-§64）—— 缓解：按时间连续性归入 §49-§57 分片并保持编号顺延（§五十八-§六十二）

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 阶段：M25 / M24 / M23 / M22 / M21 / M20；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md)（**M26 P 阶段同步清理**：C68 状态调整（M26.1 承接应用层）+ C70 已闭环移除 + C67 / C69 已上收移除） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（**M26 段新增**：2026-09-08 用户决策启动方案 A + 6 原子条目 + M25 状态从「进行中」→「已闭环」 + M26 ahead commits 实证 31 待推送） |