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
- [ ] Organization.aiApiKeyEncrypted + aiProvider + aiModel + aiBaseUrl + aiApiUrl 字段
- [ ] Repository.aiEnabled + aiTrigger 字段
- [ ] ScanRun.aiConfigSnapshot 字段
- [ ] TypeORM migration
- [ ] database/index.ts 实体注册
- [ ] 2+ 单元测试（字段定义 + 默认值 + 加解密）

**P0 Schema + Service + 入口**：
- [ ] `apps/platform/server/schemas/scan.ts` Zod schema 扩展 ai 字段（optional + 默认值兜底）
- [ ] `apps/platform/server/services/scan-orchestrator.service.ts` 透传 `RuntimeConfig.ai` 到三执行器
- [ ] `apps/platform/server/api/repos/[id]/scan.post.ts` 校验 + 透传
- [ ] 3+ 单元测试

**P0 三执行器同步透传**：
- [ ] `container-executor.ts` 接收 ai 字段 + 构造 RuntimeConfig（mode 透传）
- [ ] `sandbox-executor.ts` 同款（一致性兜底）
- [ ] `action-trigger-executor.ts` 同款（一致性兜底）
- [ ] 公共 `RuntimeConfig.ai` 类型扩展（与 engine layer 对齐）
- [ ] 6+ 单元测试（三执行器各 2 case）

**跨约束核验**：
- [ ] `pnpm --filter @dependfix/platform run typecheck` exit 0（含 monorepo source/dist 一致性，按 [AGENTS.md §6 src/dist 不一致时 build 在先](https://github.com/CaoMeiYouRen/dependfix/blob/master/AGENTS.md) 纪律）
- [ ] §3b TypeORM 复合索引类级声明（按 [经验归档 §三十](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/design/governance/experience-archive.md)）
- [ ] §3 编号标记扫描 0 命中
- [ ] D 阶段自检三向验证（lint 无 --fix + typecheck + vitest，按 [AI 协作规范 §1.4 + 经验归档 §五十六 教训 1](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/design/governance/experience-archive.md)）

**commit 跟踪**：
- [ ] commit 1: `feat(platform): Organization + Repository + ScanRun AI 配置实体 + migration`（~5 文件 / ~280 行）
- [ ] commit 2: `feat(platform): ScanRequest schema 扩展 + service 透传 RuntimeConfig.ai`（~4 文件 / ~180 行）
- [ ] commit 3: `feat(platform): 三执行器（container/sandbox/github-action）同步透传 ai 字段`（~4 文件 / ~350 行）
- [ ] commit 4: `refactor(platform): RuntimeConfig.ai 工具抽取（resolveAiConfig 合并优先级 + 单测）`（可选，~3 文件 / ~80 行）

**预计 commits**：3-4 / 行净增 ~810 / **类型 🚀 capability** / **audit standard depth**

#### M25.3 apps/platform baseline 16 lint errors 清理

**现状实测（2026-09-08 P 阶段规划）**：
- baseline（git HEAD 含 `void X` 写法）：13 errors `@typescript-eslint/no-meaningless-void-operator`（`void X` 触发）+ 3 errors 其他 = **16 errors total**（与 working tree 数量一致，类型不同）
- working tree（用户已反向修改为 bare `X`）：16 errors `@typescript-eslint/no-unused-expressions`
- ESLint 配置 `apps/platform/eslint.config.js` 未设置 `no-unused-expressions: { allowVoid: true }` 或关闭 `no-meaningless-void-operator`
- **结论**：无论 `void X` 还是 bare `X` 都触发 lint error；正确修复方向是「**删除占位符**」而非改写形式

**P0 修复策略（按文件归类）**：
- [ ] **`apps/platform/server/api/pr-checks/index.get.test.ts:127`** — 删除占位行 `beforeEach`（vitest 全局函数本身 unused；当前是装饰性注释，无实际功能）
- [ ] **`apps/platform/server/database/scripts/backfill-scan-result.ts:48-59`** — 删除 12 个 bare entity class name expressions（保留 entity imports 33-47 行已触发 TypeORM 装饰器注册副作用；bare expressions 冗余）+ 加注释说明 `// entity imports 触发 TypeORM @Entity/@Column 装饰器注册副作用（tsx CLI 不走 Nitro auto-load；import 阶段已生效，bare expressions 仅显式标注）`
- [ ] **`apps/platform/server/services/batch/stale-cleanup.test.ts:191`** — 删除 `_run = await createScanRun(...)` 变量赋值，改用 `await createScanRun(...)` 不接收返回值（语义保留：合法 run 创建但返回值忽略）
- [ ] **`apps/platform/server/services/executor/action-trigger-executor.ts:167`** — 改 `catch (pollError) { ... void pollError }` 为 `catch { ... }` 匿名 catch（删除变量声明 + 删除占位行）
- [ ] **`apps/platform/server/services/scan-reconcile.ts:179`** — 删除 `previousRunId` 占位行（如变量声明在函数顶部未使用则一并删除）

**质量门禁**：
- [ ] `pnpm --filter @dependfix/platform run lint` 输出 `0 errors`（保留 11 warnings 历史遗留）
- [ ] `pnpm --filter @dependfix/platform exec eslint . --no-fix` exit 0
- [ ] `pnpm --filter @dependfix/platform run typecheck` exit 0
- [ ] `pnpm --filter @dependfix/platform test` 全过（修复不破坏既有测试）
- [ ] §3 编号标记扫描 0 命中

**commit 跟踪**：
- [ ] commit 1: `chore(platform): 接受 baseline 16 lint errors 修复（删除 bare expressions 占位符）`

**预计 commits**：1 / 行净增 ~-16（删除占位行）/ **类型 🛡️ governance** / **audit quick depth**

#### M25.4 M24 follow-up 工具化（i18n-anchor-check + zod-helpers parseOptional）

**P0 i18n-anchor-check 工具**：
- [ ] `scripts/i18n-anchor-check.mjs` 工具脚本
- [ ] 检测逻辑：任意 key 在 zh-CN/en-US locale 取值相等时报警（除非是 `{}` placeholder 或 `:number/:date` i18n 复合格式）
- [ ] 配置 `ignorePatterns` 允许列表
- [ ] `pnpm i18n:check:anchor` npm script
- [ ] CI test job 添加该步骤
- [ ] 故意错位测试 fixture 验证 exit 1 + 当前 zh-CN/en-US 全部 keys 对称时 exit 0
- [ ] `pnpm run check:docs` 0 error

**P0 zod-helpers parseOptional<T>**：
- [ ] `apps/platform/server/utils/zod-helpers.ts` 模块 + `parseOptional<T>(schema, query, fieldName)` helper
- [ ] 5+ 单元测试（未传 / 传 undefined / 传合法值 / 传非法值 / 嵌套）
- [ ] 替换 [经验归档 §五十六 Phase 3 W2](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/design/governance/experience-archive.md) 死代码（alerts/index.get.ts `data !== undefined` 双重判断冗余）
- [ ] 替换 [经验归档 §五十六 Phase 2 W6](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/design/governance/experience-archive.md) ack fixture 路径（acknowledgedAt 必填验证）

**P0 文档挂接**：
- [ ] `docs/standards/development.md` 补充「i18n locale 对称性检查」段
- [ ] `docs/standards/development.md` 补充「zod optional 语义区分」段

**commit 跟踪**：
- [ ] commit 1: `feat(platform): i18n-anchor-check 工具脚本 + CI 集成（locale 对称性检查）`（~3 文件 / ~150 行）
- [ ] commit 2: `feat(platform): zod-helpers parseOptional<T> helper + 应用替换 Phase 3 W2 + Phase 2 W6`（~4 文件 / ~180 行）

**预计 commits**：2 / 行净增 ~330 / **类型 🛡️🧪 governance + testing** / **audit quick depth**

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
