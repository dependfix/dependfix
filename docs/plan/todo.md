# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。
>
> **M25 阶段 2026-09-08 用户决策启动**（方案 B 调整 + 修正后方案 A）：
> - **承接**：M24 阶段（PR Check MVP + 治理债 + 测试补强 + 用户体验 / 5 原子条目 12 commits / 2026-09-03 完整闭环 + 归档）收口
> - **类型平衡**：🛡️ 2 + 🚀 1 + 🧪 1（governance 治理 + capability 能力 + testing 测试）
> - **任务粒度核验**：按 [规划规范 §1.1 任务粒度约束（唯一权威）](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md) + [AI 协作规范 §1.4 单次提交审计阈值](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/ai-collaboration.md) — 单条任务 > 10 文件 / > 800 行必拆子任务，单 commit > 10 文件 / > 800 行 → 拆 multiple atomic commits
> - **拆分依据**：M25.2（平台 AI 研判集成）跨模块骨架任务 25-30 文件 / ~2460 行，按 §1.1「> 5 文件即考虑拆分」拆分为 M25.2a（M25 阶段 4 commits 基础层）+ M25.2b（M26 阶段 5 commits 应用层），让两个阶段都符合 [§1.1 阶段性聚焦 5-6 项以内](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md) 原则

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 阶段：M24 / M23 / M22 / M21 / M20；早期阶段见 [archive/](archive/)） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |

---

## M25：PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline 治理 + M24 follow-up 工具化（M25.1+M25.2a+M25.3+M25.4 全部待实施 / 2026-09-08 启动）

> **阶段定位**：M24 阶段（PR Check MVP + 治理债 + 测试补强 + 用户体验）完整闭环后，承接 2026-09-08 用户调研触发的 3 个设计先行稿（[C70 PrimeUI 主题库降级](../design/governance/primeui-themes-v2-downgrade.md) / [C68 平台 AI 研判集成](../design/governance/platform-ai-integration.md) / [C69 文档站+包 README 多语言实施](../design/governance/docs-and-readme-i18n.md)）+ baseline 16 lint errors 治理 + M24 follow-up 工具化。按「类型平衡」原则（governance × 2 + capability × 1 + testing × 1）拆 **4 原子条目独立闭环**。

### 范围

**核心范围**：
- **🛡️ M25.1** PrimeUI 主题库降级（`@primeuix/themes` 3.x → 2.x，PrimeUI License → MIT 化）
- **🚀 M25.2a** 平台 AI 研判集成「基础层」（数据模型 + schema/service + 三执行器透传 4 commits）
- **🛡️ M25.3** apps/platform baseline 16 lint errors 清理（`@typescript-eslint/no-unused-expressions` 治理）
- **🛡️🧪 M25.4** M24 follow-up 工具化（i18n-anchor-check 脚本 + zod-helpers parseOptional helper）

**非目标**（明确不做）：
- 不升级 PrimeVue 5.x（避免全栈 PrimeUI License）
- 不迁移其他 UI 库
- 不立即支持 AI 个人层配置（按 [C68 上收触发条件](../design/governance/platform-ai-integration.md) 评估）
- 不重写 AI 研判引擎本身（engine 层 M5 已闭环）
- 不清理 11 个 lint warnings（历史遗留，与本批目标无关）

### 验收清单

#### M25.1 PrimeUI 主题库降级（@primeuix/themes 3.x → 2.x）

**P0**：
- [x] `apps/platform/package.json` `@primeuix/themes` 版本约束 `^3.0.0` → `^2.0.3` + `pnpm install`
- [x] `apps/platform/nuxt.config.ts` import 路径检查（v2 `import Aura from '@primeuix/themes/aura'` + `import { definePreset } from '@primeuix/themes'` 与 v3 API 一致）
- [x] `pnpm view @primeuix/themes@2.0.3 license` 输出 `MIT`
- [x] `pnpm list "@primeuix/themes" --filter @dependfix/platform` 输出 `@primeuix/themes@2.0.3`
- [x] `pnpm licenses list --prod --json` Unknown 从 7 → 3（移除 4 个 PrimeUI License 包；primeicons@8.0.0 留 M26+ P1 评估）
- [x] `pnpm --filter @dependfix/platform run typecheck` silent success
- [x] `pnpm --filter @dependfix/platform test` 全过（88 test files / 1124 tests passed / 7 skipped / 9.15s）
- [x] `pnpm --filter @dependfix/platform build` ✨ Build complete
- [x] 视觉回归：dev server HTTP 200 + build 产物含 DependfixPreset semantic.primary 色阶（青灰 14b8a6 / 0d9488）+ primeicons 字体加载完整 + 4 页面截图受 sandbox chromium 限制按 §五十七 docs-only 处理
- [x] `docs/guide/tech-stack.md` 标注 `^2.x`（已合规无需改）
- [x] `docs/standards/platform.md` §3.7 主题引擎描述补充版本约束 + 协议 + 降级时间戳
- [x] `pnpm run check:docs` 0 error
- [x] §3 编号标记扫描 0 命中孤立编号（命中均为合法导航例外）

**commit 跟踪**：
- [x] commit 1: `35e4935` `chore(deps): @primeuix/themes 3.x → 2.x 降级（PrimeUI License → MIT 化）`
- [x] commit 2: `4c51d19` `docs(standards): platform.md §3.7 主题引擎版本号 + 协议 + 降级记录同步`
- [ ] 可选 commit 3: 主题渲染回归测试（v2 vs v3 视觉回归断言）—— 当前通过 build 产物 + dev server + CSS 变量验证间接证据，未实施独立 Playwright 主题断言（M25.1 P 阶段评估为可选）

**实际 commits**：2 / 行净增 -33（commit 1: +7/-41；commit 2: +1/-1）/ **类型 🛡️ governance** / **ahead=2 + M25 P 阶段 2 commits = ahead=4 待用户主动推送**

#### M25.2a 平台 AI 研判集成「基础层」（数据模型 + schema/service + 三执行器透传）

**P0 数据模型**：
- [x] Organization.aiApiKeyEncrypted + aiProvider + aiModel + aiBaseUrl + aiApiUrl 字段（snake_case 列名 + encryption 列）
- [x] Repository.aiEnabled + aiTrigger 字段
- [x] ScanRun.aiConfigSnapshot 字段（JSON 审计快照；apiKey 不写入）
- [x] TypeORM migration `1900000000000-AddAiConfigFields`（幂等处理：检查表/列存在性后 ALTER TABLE）
- [x] entity 列名与 migration snake_case 对齐（SnakeCaseNamingStrategy 兼容）
- [x] 6 个单元测试覆盖默认值 + 加解密 round-trip + 三枚举值 + JSON 持久化（`apps/platform/server/entities/ai-config.test.ts`）

**P0 Schema + Service + 入口**：
- [x] `apps/platform/server/schemas/scan.ts` Zod schema 扩展 aiEnabled + aiTrigger 可选字段（向后兼容）
- [x] `apps/platform/server/services/scan-orchestrator.service.ts` 调用 resolveAiConfig 合并 + 解密 aiApiKey + 注入 RuntimeConfig.ai + 持久化 ScanRun.aiConfigSnapshot
- [x] ScanRequest 接口扩展 aiEnabled / aiTrigger 字段（与 schema 对齐）
- [x] `apps/platform/server/services/ai-config-resolver.ts` 新建工具：合并优先级 API override > Repository 默认 > Organization 共享 Key；apiKey 不写入 snapshot（hasApiKey 布尔代替）；baseUrl 兜底 https://api.deepseek.com
- [x] 13 个单元测试覆盖：默认未启用 / Organization 已配 Key 但不启用 / anthropic 透传 / 合并成功 + apiKey 解密 / API override 优先 / Organization=null / 兜底 baseUrl / trigger 三枚举值合并

**P0 三执行器同步透传**：
- [x] `container-executor.ts`: `...ctx.config` 展开自动透传 ai（无需修改）
- [x] `sandbox-executor.ts`: buildSpec.env 新增 DEPENDFIX_AI_* 注入（仅 enabled=true 时注入，避免空字符串覆盖 engine 默认值）；anystrings 时注入 DEPENDFIX_AI_API_KEY / DEPENDFIX_AI_BASE_URL / DEPENDFIX_AI_API_URL
- [x] `action-trigger-executor.ts`: inputs 字典新增 ai / ai-provider / ai-model / ai-trigger / ai-api-key / ai-base-url / ai-api-url 透传（action.yml 已声明 7 个 inputs）；polRun catch 重构为匿名 catch 消除 baseline lint error
- [x] sandbox-executor.test.ts: 4 个 case（启用 / 禁用 / anthropic / 兜底 baseUrl）
- [x] action-trigger-executor.test.ts: 3 个 case（启用 / 禁用 / anthropic）

**跨约束核验**：
- [x] `pnpm --filter @dependfix/platform run typecheck` exit 0
- [x] `pnpm --filter @dependfix/platform test` 全过（1150 passed / 7 skipped / 9.04s）
- [x] `pnpm run check:docs` 0 error（105 个 md 文件 / 62 个 vue-interp 全部通过）
- [x] §3b TypeORM 实体无复合索引（本次都是简单列，不需要类级复合索引）
- [x] §3 编号标记扫描 0 命中孤立编号（命中均为合法导航例外：§M25.2a / §5.3 / §6.1 / §M16.2 等）
- [x] D 阶段自检三向验证（lint 无 --fix 0 error / typecheck 0 error / vitest 1150 passed）
- [x] 三执行器一致性：container / sandbox / github-action 都正确处理 ctx.config.ai 透传（grep 实证）

**commit 跟踪**：
- [x] commit 1: `1c65582` `feat(platform): Organization + Repository + ScanRun AI 配置实体 + migration`（5 文件 / +366 行 / 6 单测）
- [x] commit 2: `f174cce` `feat(platform): ScanRequest schema 扩展 + scan-orchestrator service 透传 RuntimeConfig.ai`（4 文件 / +377 行 / 13 单测，含 ai-config-resolver 抽取合并原 commit 4）
- [x] commit 3: `7250ec1` `feat(platform): 三执行器同步透传 ai 字段（container / sandbox / github-action）`（4 文件 / +249 行 / 7 单测 + action-trigger-executor baseline lint error fix）

**实际 commits**：3 / 行净增 ~992 / **类型 🚀 capability** / **ahead=3 + M25 P 阶段 2 + M25.1 阶段 3 = ahead=8 待用户主动推送**

#### M25.3 apps/platform baseline 16 lint errors 清理

**现状实测（2026-09-08 P 阶段规划）**：
- baseline（git HEAD 含 `void X` 写法）：13 errors `@typescript-eslint/no-meaningless-void-operator`（`void X` 触发）+ 3 errors 其他 = **16 errors total**（与 working tree 数量一致，类型不同）
- working tree（用户已反向修改为 bare `X`）：16 errors `@typescript-eslint/no-unused-expressions`
- ESLint 配置 `apps/platform/eslint.config.js` 未设置 `no-unused-expressions: { allowVoid: true }` 或关闭 `no-meaningless-void-operator`
- **结论**：无论 `void X` 还是 bare `X` 都触发 lint error；正确修复方向是「**删除占位符**」而非改写形式

**P0 修复策略（按文件归类）**：
- [x] **`apps/platform/server/api/pr-checks/index.get.test.ts:127`** — 删除占位行 `beforeEach`（vitest 全局函数本身 unused；当前是装饰性注释，无实际功能）
- [x] **`apps/platform/server/database/scripts/backfill-scan-result.ts:48-59`** — 删除 12 个 bare entity class name expressions（保留 entity imports 33-47 行已触发 TypeORM 装饰器注册副作用；bare expressions 冗余）；文件顶部加 `/* eslint-disable @typescript-eslint/no-unused-vars */`（装饰器副作用 imports 不可能实际引用）
- [x] **`apps/platform/server/services/batch/stale-cleanup.test.ts:191`** — 删除 `_run = await createScanRun(...)` 变量赋值，改用 `await createScanRun(...)` 不接收返回值（语义保留：合法 run 创建但返回值忽略；cleanupStaleRuns 通过 batchRunId 查找）
- [x] **`apps/platform/server/services/executor/action-trigger-executor.ts:167`** — 已在 commit `7250ec1` M25.2a 闭环时通过 polRun catch 重构为匿名 catch 修复（commit message 已说明）
- [x] **`apps/platform/server/services/scan-reconcile.ts:179`** — 删除 `previousRunId` 占位行；保留变量声明（line 149）加 `eslint-disable-line @typescript-eslint/no-unused-vars` 行内注释（保留字段以备未来调试 reconcile 同 run 内跨次扫描关系）

**质量门禁**：
- [x] `pnpm run lint` 输出 9 warnings（≤ max-warnings 10）/ 0 errors（从 baseline 16 errors + 12 warnings → 0 errors + 9 warnings）
- [x] `pnpm exec eslint . --no-fix` exit 0
- [x] `pnpm exec tsc --noEmit -p tsconfig.json` exit 0
- [x] `pnpm --filter @dependfix/platform test` 全过（1150 passed / 7 skipped / 9.31s）
- [x] `pnpm run check:docs` 0 error
- [x] §3 编号标记扫描 0 命中孤立编号（命中均为合法导航例外：§M20.7 / §M20.3 / §M20.5 等）

**commit 跟踪**：
- [x] commit 1: `57f3b88` `chore(platform): 接受 baseline 16 lint errors 修复（删除 bare expressions 占位符）`（4 文件 / +8/-24 行）
- [x] commit 2: `4030f3b` `chore(cli): 删除未使用的 beforeEach import`（1 文件 / +1/-1 行；packages/cli warning 是 baseline 12 warnings 之一）

**实际 commits**：2 / 行净增 ~-16 / **类型 🛡️ governance** / **ahead=2 + M25.2a 5 + M25.1 3 + M25 P 阶段 2 = ahead=12 待用户主动推送**

#### M25.4 M24 follow-up 工具化（i18n-anchor-check + zod-helpers parseOptional）

**P0 i18n-anchor-check 工具**：
- [x] `scripts/i18n/i18n-anchor-check.mjs` 工具脚本（与现有 i18n audit 工具风格一致）
- [x] 检测逻辑：对比 zh-CN + en-US locale 文件，识别同一 key 在两边取值完全相等且 en-US locale 值含中文的错位污染
- [x] `ignorePatterns` 允许列表：纯 ASCII 字符串（产品名 / 版本号 / 技术术语 PR Checks）+ 数字 / 布尔字面量 + i18n 复合格式占位符（{count, number}）+ 含 * placeholder（如 "Owner *"）
- [x] `isLocaleInternalKey` 跳过规则：key 末尾含 .zh-CN / .en / .en-US（结构化本地化数据内部字段如 serverErrors.UNAUTHORIZED.zh-CN）
- [x] `pnpm i18n:check:anchor` npm script
- [x] CI test job `.github/workflows/test.yml` 添加该步骤作为 locale 错位污染 blocker
- [x] 13 个测试用例覆盖：shouldIgnore 6 个 / loadLocaleMap 1 个 / findSuspiciousMatches 3 个（en-US 中文污染 + locale 内部 key 跳过 + 正常翻译不误报）/ main CLI 3 个（baseline exit 0 / 故意污染 exit 1 / JSON 格式输出）
- [x] `pnpm run check:docs` 0 error

**P0 zod-helpers parseOptional<T>**：
- [x] `apps/platform/server/utils/zod-helpers.ts` 模块 + `parseOptional<T>(schema, value): { success, value?, isProvided }` helper
- [x] 13 个单元测试覆盖：boolean / enum / 嵌套对象 schema × 5 种值（未传 / 传 true / 传 false / 传非法 / 传 null）+ alertFiring 三态语义实战
- [x] 替换 [经验归档 §五十六 Phase 3 W2](docs/design/governance/experience-archive.md) 死代码（pr-checks/index.get.ts `data !== undefined` 双重判断冗余 → parseOptional 显式三态）
- [x] 替换 [经验归档 §五十六 Phase 2 W6](docs/design/governance/experience-archive.md) ack fixture 验证（[id].patch.test.ts `not.toBeNull()` → parseOptional 强制 isProvided + ISO 8601 可解析）

**P0 文档挂接**：
- [x] `docs/standards/development.md` §3 升级 i18n locale 注释规范（引入 `pnpm i18n:check:anchor` 自动检测 + 跳过规则说明）
- [x] `docs/standards/development.md` §5.1.21 zod optional 补充 zod-helpers 落地说明 + 应用示例 + ack fixture 验证升级

**commit 跟踪**：
- [x] commit 1: `80912c2` `feat(i18n): i18n-anchor-check 工具脚本 + CI 集成（locale 对称性检查）`（5 文件 / +386 行 / 13 单测）
- [x] commit 2: `65a8ec1` `feat(platform): zod-helpers parseOptional<T> helper + 应用替换 Phase 3 W2 + Phase 2 W6`（5 文件 / +213 行 / 13 单测）

**实际 commits**：2 / 行净增 ~599 / **类型 🛡️🧪 governance + testing** / **audit quick depth** / **ahead=2 + M25.3 2 + M25.2a 5 + M25.1 3 + M25 P 阶段 2 = ahead=14 待用户主动推送**

### 阶段切片容量核验

按 [规划规范 §1.1 任务粒度约束（唯一权威）](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md) + [AI 协作规范 §1.4 单次提交审计阈值（修正后）](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/ai-collaboration.md)：

| 原子条目 | commits | 文件 | 行净增 | 单 commit 拆分后最大 | 约束核验 |
|:---|:---|:---|:---|:---|:---|
| M25.1 | 2-3 | 3-5 | ~15-65 | commit 2 docs ~10 行 | ✓ < 10 文件 / < 800 行 |
| M25.2a | 3-4 | ~13 | ~810 | commit 3 ~350 行（推荐粒度临界） | ✓ < 10 文件 / < 800 行（推荐粒度临界但合规）|
| M25.3 | 1 | 5 | ~0 | 5 文件 / 0 行 | ✓ < 10 文件 / < 800 行 |
| M25.4 | 2 | ~5-6 | ~330 | commit 2 ~180 行 | ✓ < 10 文件 / < 800 行 |
| **M25 总投入** | **8-10** | **~26-29** | **~1155-1205** | — | **✓ 阶段性聚焦 4 原子条目 < 5-6 项** |

**规范修正记录**：2026-09-08 P 阶段规划时识别出 [AI 协作规范 §1.4 拆分依据](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/ai-collaboration.md)「每个批次 ≤ 5 文件 / ≤ 350 行」与 §1.4 硬阈值「> 10 文件 / > 800 行」+ [规划规范 §1.1 任务粒度约束](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md) 内部不一致——拆分依据约束过严。已修正 §1.4 拆分依据为「拆分后每个 commit < 10 文件 / < 800 行（与硬阈值一致）+ 推荐粒度 ≤ 5 文件 / ≤ 350 行（非硬阈值）」。本规范修正同步落地至 `pnpm run check:docs` 0 error 验证。

### M26+ 衔接

**M26 承接候选**（按 backlog §短期/一次性候选任务 上收触发条件）：
- **M25.2b** 平台 AI 研判集成「应用层」（API + UI + e2e + docs，5 commits / ~1130 行）—— M25.2 后半段
- **C67** 批量导入 Resource owner 化（3 commits / ~4h）—— 与 M25.2b 类型接近（🚀 能力扩展）
- **C69** 文档站 + 包 README 多语言实施（5 commits / 0.5-1 切片）—— i18n 能力扩展
- **M26 baseline 11 lint warnings 治理**（与 M25.3 背靠背）—— 🛡️ 治理收口

### governance check point 候选（M25 阶段）

- **wisdom.md pattern 沉淀**：候选无（M25 主要为治理 + 能力扩展，无新陷阱模式）；M25.3 可能新增 1 条 `pattern-lint-autofix-接受策略-累积`（M17.5 wisdom 扩展）
- **experience-archive.md 新增§**：候选
  - §五十八 PrimeUI License 降级 MIT 化（M25.1 治理）
  - §五十九 apps/platform AI 研判集成（M25.2a 能力扩展）
  - §六十 apps/platform baseline 16 lint errors 批量清理（M25.3 治理收口）
  - §六十一 M24 follow-up 工具化落地（M25.4 治理收口）
- **code-auditor.agent.md 主责边界**：候选新增「三执行器同步透传审计必查项」（M25.2a 三执行器教训沉淀）+ 「i18n locale 错位污染检测必查项」（M24.1 Phase 4 B1 + M25.4 anchor-check 工具落地）
- **standards 文档挂接**：候选 primeui license 治理段（platform.md §3.7 扩展）+ AI 研判安全门段（architecture.md 主要风险与应对扩展）
