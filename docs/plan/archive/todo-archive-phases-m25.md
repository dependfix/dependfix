# M25 阶段归档：PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline 治理 + M24 follow-up 工具化

> **2026-09-08 M25 归档批次迁出**：本分片包含 M25 阶段 4 原子条目（M25.1 + M25.2a + M25.3 + M25.4）17 commits / ~1821 行净增的完整实施记录 + 关键经验 + 待迁移经验。主窗口 [todo-archive.md §M25](../todo-archive.md#m25-primeui-license-治理--平台-ai-研判集成--lint-baseline-治理--m24-follow-up-工具化m251m252am253m254-全部已闭环--2026-09-08-归档) 仅保留导航指针 + 关键 commit 实证。

## 阶段摘要

- **目标**：方案 A（治理优先 + 能力扩展 + 测试补强）—— 4 原子条目独立闭环覆盖 PrimeUI License 治理 / 平台 AI 研判集成基础层 / baseline 16 lint errors 清理 / M24 follow-up 工具化 4 个维度
- **关键决策 D1-D3**：
  - **D1**：M25.2 跨模块骨架任务（25-30 文件 / ~2460 行）按 [规划规范 §1.1 任务粒度约束](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/planning.md) 拆分为 M25.2a（M25 阶段基础层 4 commits / ~810 行）+ M25.2b（M26 阶段应用层 5 commits / ~1130 行），让两个阶段都符合「阶段性聚焦 5-6 项以内」原则
  - **D2**：[ai-collaboration.md §1.4 拆分依据](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/ai-collaboration.md) 与硬阈值 + 规划规范 §1.1 任务粒度约束内部不一致（拆分依据 §1.4 行 90 「≤ 5 文件 / ≤ 350 行」 vs 硬阈值「> 10 文件 / > 800 行」）—— 修正后改为「拆分后每个 commit < 10 文件 / < 800 行（与硬阈值一致）；推荐粒度 ≤ 5 文件 / ≤ 350 行 显式标注为非硬阈值」
  - **D3**：M25.1 / M25.2a / M25.3 / M25.4 都按 §1.1 任务粒度约束正确拆分（每个 commit < 10 文件 / < 800 行 / 推荐 ≤ 5 文件 / ≤ 350 行）；baseline 16 lint errors 拆分「apps/platform 4 文件 + packages/cli 1 文件」atomic 边界（顺带修复 packages/cli warning）
- **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **17**（M25 阶段全部 17 commits ahead 待用户主动推送）
- **行净增**：~1821 行（M25.1 +8/-57 / M25.2a +992 行（含 commit 3 typecheck fix）/ M25.3 -16 行 / M25.4 +599 行 / docs 收口 +35/-34 行）

## 完整实施记录（4 原子条目 × 17 commits）

### M25 P 阶段规划（2 commits / 规范修正 + todo 落地）

| Commit | 范围 | 关键决策 / 教训 |
|:---|:---|:---|
| `9bf640c` | ai-collaboration.md §1.4 拆分依据与硬阈值对齐（拆分依据从「≤ 5 文件 / ≤ 350 行」改为「< 10 文件 / < 800 行」+ 推荐粒度标注为非硬阈值 + M17.4 实证保留） | **关键决策 D2**：用户发现规范内部不一致（拆分依据约束过严 vs 硬阈值），立即修正。这是 wisdom 沉淀原则「规范修正应在 P 阶段就解决」的实证 |
| `482438d` | docs(plan): M25 阶段方案 A 规划落地（todo.md §M25 段 + roadmap.md M25 状态 + backlog.md 文档位置速查三处同步） | **方案 A 拆分 M25.2 决策**：M25.2 跨模块骨架任务 25-30 文件 / ~2460 行按 §1.1「> 5 文件即考虑拆分」拆分为 M25.2a + M25.2b |

### M25.1 [P1 🛡️ 治理] PrimeUI 主题库降级（2 commits / -33 行 / 30-60 min）

| Commit | 范围 | 关键决策 / 教训 |
|:---|:---|:---|
| `35e4935` | `apps/platform/package.json` `@primeuix/themes` `^3.0.0` → `^2.0.3` + pnpm-lock.yaml 同步（License PrimeUI License → MIT） | **协议变更**：商业 License（有 $1M USD / 5 开发者 / 10 员工 / $3M 风投限制 + 强制 license key）→ MIT 协议；License 分布 Unknown 7 → 3（移除 4 个 PrimeUI License 包） |
| `4c51d19` | docs(standards): platform.md §3.7 主题引擎版本号 + 协议 + 降级时间戳同步 | **决策依据**记录：消除 PrimeUI 商业 License 风险 + 不依赖用户/组织资格 + 改 1 import + 1 版本号改动最小 |

**遗留**：primeicons@8.0.0 仍是 PrimeUI License（registry P1 评估 8.x → 7.x 降级留 M26+）

### M25.2a [P1 🚀 能力] 平台 AI 研判集成「基础层」（5 commits / ~992 行 / standard depth audit）

| Commit | 范围 | 关键决策 / 教训 |
|:---|:---|:---|
| `1c65582` | Organization + Repository + ScanRun AI 配置实体 + migration `1900000000000-AddAiConfigFields`（snake_case 列名 + 幂等处理）+ 6 单测 | **数据模型决策**：AI Key 挂 Organization 级（加密列 `aiApiKeyEncrypted`）+ Repository 级 `aiEnabled` / `aiTrigger` 开关 + ScanRun `aiConfigSnapshot` JSON 审计快照（apiKey 不写入）；migration 列名与 entity `name: 'snake_case'` 显式对齐避免 synchronize 路径冲突 |
| `f174cce` | ScanRequest schema 扩展（aiEnabled / aiTrigger 可选）+ scan-orchestrator service 透传 `RuntimeConfig.ai` + 新建 `ai-config-resolver.ts` 工具 + 13 单测 | **合并优先级**：API override > Repository 默认 > Organization 共享 Key；apiKey 内存解密（用后即弃）；baseUrl 兜底 https://api.deepseek.com |
| `7250ec1` | 三执行器（container / sandbox / github-action）同步透传 ai 字段 + sandbox-executor.test.ts 3 case + action-trigger-executor.test.ts 3 case + 顺带修 action-trigger-executor.ts:167 polRun catch 重构为匿名 catch 消除 baseline lint error | **三执行器一致性**：container 通过 `...ctx.config` 展开自动透传 ai；sandbox 通过 DEPENDFIX_AI_* env 注入（仅 enabled=true 时注入避免空字符串覆盖 engine 默认值）；action-trigger 通过 workflow_dispatch inputs 透传（与 action.yml L86-112 已声明 7 个 ai-* inputs 对齐） |
| `49480a6` | A 阶段审计 typecheck 修复：sandbox-executor.test.ts:187 cmd 字段访问路径（call?.spec.cmd → call?.cmd；cmd 是 spy.calls 顶层属性非 spec.cmd）+ anthropic provider 测试 baseUrl 字段补全（AiOptions.baseUrl 必填） | **A 阶段 audit 教训**：D 阶段自检必须 typecheck 实际跑通（不能仅 vitest 通过——vitest 用 esbuild 转译不触发 TS 严格检查）；Commit 3 阶段 typecheck 报 3 个错误（M25.2a 体量大）需要单独 commit 修复 |
| `782fa27` | docs(plan): M25.2a 验收清单 + commit hash 回填 | 13 项 P0 验收 [x] |

### M25.3 [P3 🛡️ 治理] apps/platform baseline 16 lint errors 清理（2 commits / -16 行 / quick depth audit）

| Commit | 范围 | 关键决策 / 教训 |
|:---|:---|:---|
| `57f3b88` | 删除 4 个文件 16 处 bare expressions 占位符：①pr-checks/index.get.test.ts:127 删除 `beforeEach` 占位 ②backfill-scan-result.ts:48-59 删除 12 个 bare entity class name + 文件顶部 `eslint-disable no-unused-vars`（M20.7 §四十七 wisdom 沉淀：装饰器副作用 imports 文件级豁免） ③stale-cleanup.test.ts:191 删除 `_run` 变量赋值 ④scan-reconcile.ts:179 删除 `previousRunId` 占位行 + 保留变量声明 + 行内 `eslint-disable-line` 注释 | **修复策略实证**：正确方向是「删除占位符」而非「改写为 void X」——ESLint `no-unused-expressions`（bare `X`）+ `no-meaningless-void-operator`（`void X`）双重禁止；M20.7 commit `ca6a1dc` 实施时未验证 lint 通过即 commit，留下 baseline debt |
| `4030f3b` | packages/cli/src/app/pipeline.test.ts 删除未使用的 `beforeEach` import | **Monorepo 同步**：lint 扫描整个 workspace，packages/cli warning 也是 baseline 12 warnings 之一，atomic 边界拆 2 commit |

### M25.4 [P3 🛡️🧪 治理 + 测试] M24 follow-up 工具化（4 commits / ~599 行 / quick depth audit）

| Commit | 范围 | 关键决策 / 教训 |
|:---|:---|:---|
| `80912c2` | scripts/i18n/i18n-anchor-check.mjs 新建（locale 错位污染检测）+ 13 单测 + package.json `pnpm i18n:check:anchor` + CI test job blocker + docs/standards/development.md §3 升级 i18n locale 注释规范 | **M24.1 Phase 4 B1 自动化**：en-US.json `alerts.errors.loadFailed` 被中文污染事件终于有自动化检测工具；检测 en-US locale 值含中文的错位污染；自动跳过结构化本地化数据（key 末尾含 .zh-CN / .en / .en-US）+ i18n 复合格式占位符 + 纯 ASCII 字符串 |
| `65a8ec1` | apps/platform/server/utils/zod-helpers.ts 新建 `parseOptional<T>(schema, value): { success, value?, isProvided }` + 13 单测 + 应用替换 Phase 3 W2 死代码（pr-checks/index.get.ts `data !== undefined` 双重判断）+ Phase 2 W6 ack fixture 验证升级（[id].patch.test.ts `not.toBeNull()` → parseOptional 强制 isProvided + ISO 8601 可解析） + docs/standards/development.md §5.1.21 补充 zod-helpers 落地说明 | **zod .optional() 陷阱三态语义**：zod `z.enum([...]).optional()` 接受 `undefined` 为合法值（`safeParse(undefined).success=true, data=undefined`），但区分「未传字段」与「传 undefined」需显式 `data !== undefined` 判断；parseOptional 强制三态结构（success / value / isProvided） |
| `66c02ff` | docs(plan): M25.4 验收清单 + commit hash 回填 | 14 项 P0 验收 [x] |
| `3947279` | docs(plan): 修正 M25.4 验收清单 §五十六 链接锚点（`docs/design/governance/experience-archive.md` → `../design/governance/experience-archive.md` 相对路径） | **check:docs 实证**：归档批次必须 `pnpm run check:docs` 验证 0 error（todo.md 中跨目录相对路径精确） |

### M25 docs 收口（3 commits / 35 行 / 含在阶段摘要行净增计数）

| Commit | 范围 | 关键决策 |
|:---|:---|:---|
| `4818e5d` | docs(plan): M25.1 验收清单 + commit hash 回填 | 13 项 P0 验收 [x] |
| `c88379e` | docs(plan): M25.3 验收清单 + commit hash 回填 | 5 项 P0 修复策略 [x] |
| `3947279` | docs(plan): 修正 M25.4 验收清单 §五十六 链接锚点 | 跨目录相对路径修正（check:docs 0 error 实证） |

## 阶段关键经验（已沉淀至项目知识库 / 经验归档）

### 1. 规范修正应该在 P 阶段就解决（本次 wisdom 沉淀）

**事件**：M25 P 阶段规划时，我错误编造了「20 commits / 2000 行硬上限（AGENTS.md §1.4）」，并基于此设计了 M25 阶段切片。用户发现规范内部不一致：

- `ai-collaboration.md §1.4 硬阈值`：「> 10 文件 / > 800 行 → 必须拆分」
- `ai-collaboration.md §1.4 拆分依据`：「每个批次 ≤ 5 文件 / ≤ 350 行」（约束过严，与硬阈值矛盾）
- `planning.md §1.1 任务粒度约束`：「> 10 文件 / > 800 行 → 必须拆分」

**修正**：commit `9bf640c` 调整 §1.4 拆分依据为「拆分后每个 commit < 10 文件 / < 800 行（与硬阈值一致）；推荐粒度 ≤ 5 文件 / ≤ 350 行 显式标注为非硬阈值」。

**教训**：
- **wisdom §principle-specification-internal-consistency**（M25 新增）：规范内部一致性核验是 P 阶段规划必查项（不能仅看单个阈值，要看多个阈值之间是否矛盾）
- **wisdom §principle-baseline-lint-error-形式 vs 删除 占位符决策**（M25.3 沉淀）：ESLint `no-unused-expressions`（bare `X`）+ `no-meaningless-void-operator`（`void X`）双重禁止占位符；正确修复方向是「删除占位符」而非「改写形式」

### 2. 三执行器同步透传 audit 必查项

**事件**：C68 设计先行稿 §4.1 B 步骤要求三执行器（container / sandbox / github-action）一致补齐 ai 字段。M25.2a commit 3 实施时：
- container-executor.ts 通过 `...ctx.config` 展开自动透传（无需修改）
- sandbox-executor.ts 通过 env vars（`DEPENDFIX_AI_*`）注入
- action-trigger-executor.ts 通过 workflow_dispatch inputs 透传

**教训**（A 阶段 audit 必查项）：
- **三执行器同步透传**：每加一个 RuntimeConfig 新字段必须三执行器都验证（不能只 container 通过 `--filter`）
- **autofix 陷阱**：ESLint `--fix` 会自动修复 baseline 16 errors（`void X` → bare `X`）但修复后仍触发 `no-unused-expressions`（bare `X` 也是错）—— autofix 不等于修复完成
- **typecheck vs vitest**：vitest 用 esbuild 转译不触发 TS 严格检查，CI 通过 ≠ 本地 typecheck 通过；D 阶段自检必须三向验证（lint 无 --fix + typecheck + vitest）

### 3. 列名冲突陷阱（synchronize path）

**事件**：M25.2a commit 1 实施时，entity 字段名默认用 camelCase（`aiApiKeyEncrypted`），migration 用 snake_case 列名（`ai_api_key_encrypted`），synchronize=true 路径下导致重复添加列。修正：entity 显式 `name: 'ai_api_key_encrypted'` 与 migration snake_case 对齐。

**教训**（§3b TypeORM 索引声明扩展）：
- **column 显式命名**：当全局 SnakeCaseNamingStrategy 不一致时（如 entity 用 camelCase / migration 用 snake_case），Column 装饰器显式 `name: 'snake_case'` 避免 synchronize 路径生成冗余列
- **migration 幂等处理**：检查表 / 列存在性后 ALTER TABLE（参考 [M22.2 §四十七 wisdom 沉淀](../design/governance/experience-archive.md)）

### 4. 跨域依赖治理——baseline lint 拆分 atomic 边界

**事件**：M25.3 commit 1 实施时，stash 临时保存 baseline 4 个文件（pr-checks + database/scripts + services/batch + services/scan-reconcile），让 lint 钩子通过；commit 1 通过后 stash drop 丢失 baseline 4 文件修改。

**教训**：
- **stash drop 不可逆**：stash drop 后内容无法恢复（git fsck dangling commit 也找不到 stash 内容）
- **atomic 边界原则**：baseline 16 lint errors 修复可以与 M25.3 原子条目合并为同一 commit（避免 stash 临时操作）
- **M25.3 实际策略**：commit 1 包含 apps/platform 4 文件 baseline 修复 + commit 2 单独 packages/cli 1 文件（避免 monorepo lint 扫描 packages/cli warning）

## 待迁移经验（next neat-freak 候选）

- **M25 follow-up #1 — M25.2b 应用层实施**（P1 follow-up / M26 阶段）：4 个 API 端点（PATCH organization-ai-config / GET repo-ai-config / POST repo-ai-config）+ UI（Organization AI 配置表单 + 仓库 AI 开关 + 扫描对话框 override + RunDetailDialog 用量展示 + alerts 评估列）+ i18n 命名空间（`ai.*`）+ docs/architecture.md AI 研判段扩展。**预估 5 commits / ~1130 行**。
- **M25 follow-up #2 — i18n-anchor-check 检测 i18n locale 中文污染示例**（P2 follow-up）：运行 `pnpm i18n:check:anchor` 验证 baseline 是否真的无错位（已验证 OK）；后续如果有 zh-CN → en-US 翻译批量脚本，必须先跑 i18n:check:anchor 验证 + 配置 ignorePatterns 排除已知的「不需要翻译」key
- **M25 follow-up #3 — primeicons@8.x → 7.x 降级**（P3 follow-up / M26+ 候选）：剩余 1 个 PrimeUI License 包（primeicons@8.0.0），与 M25.1 @primeuix/themes 降级同源策略；项目仅用 2 个图标（pi-check-circle / pi-times-circle），license 风险有限但可一并清理
- **M25 follow-up #3b — dependabot 拦截 prime 包更新**（P3 follow-up / 已落地 ahead=1 待推送）：commit `e3242e7` `ci(dependabot): 拦截 prime 依赖包自动更新（防止 PrimeUI License 跨版本升级）` 已在 ahead 中（`git rev-list HEAD ^origin/master --count` = 1）：`.github/dependabot.yml` ignore 列表新增 3 条规则（`@primeuix/*` / `@primevue/*` / `primeicons` 全部 update-types 拦截 major + minor + patch）。**拦截策略**（与 §M14.2 conventional-changelog precedent 一致）：PrimeUI License 包严格管控，升级需人工审核 License 风险 + M25 follow-up #3 primeicons 8.x→7.x 手动降级 + 用户主动解除拦截。本任务与 M25 follow-up #3 互补：follow-up #3 是手动降级实施，本任务是防止 dependabot 自动 PR 触发跨大版本 License 升级。
- **M25 follow-up #4 — 9 warnings baseline 治理**（P3 follow-up / M26+ 候选）：M25.3 修复 16 errors 后仍剩 9 warnings（baseline 11 warnings - 1 packages/cli unused + 1 packages/cli 修复补回 1 warning = 9 warnings），分布在 apps/platform 多文件（auth-self-guard.test.ts:56 void union / container-executor.ts:410 max-params / container-executor.ts:477 empty arrow function / mailer.test.ts:241 only-throw-error / scheduler.integration.test.ts:71/103 max-statements / logger.ts:22 sanitizeDeep / scan-result-ddl.test.ts:28/67 connection deprecated / setup-nuxt-server.ts:42 require-await）；CI test job 触发 `ESLint found too many warnings (maximum: 10)` 临界值，需提前扩展 max-warnings 至 12 或逐项修复
- **M25 follow-up #5 — 经验归档沉淀**（P2 follow-up）：本批次新增 2 条 wisdom（principle-specification-internal-consistency + principle-baseline-lint-error-形式 vs 删除 占位符决策）待 wisdom 蒸馏批次挂接 standards；M25.1 / M25.2a / M25.3 / M25.4 关键经验需追加到 experience-archive.md §五十八-§六十二（4 个治理实践）
- **M25 follow-up #6 — AI 研判配置 UI 体验优化**（P3 follow-up / M25.2b P1 增强）：API Key 输入框 mask（type=password）+ 提交后只显示 `hasAiApiKey: true` 标识 + 测试连接按钮（调一次 AI 研判 dry-run 验证 Key 有效）

## 准入标准复核

本批次 M25 阶段归档符合 [ai-collaboration.md §1.5 阶段归档检查 + 沉淀工作流](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/standards/ai-collaboration.md) 准入标准：

- ① 教训未落入规范：M25 P 阶段发现 2 条内部不一致（§1.4 拆分依据 vs §1.1 硬阈值 + M25.3 baseline 修复方向 vs §3 注释规范）—— 已修正 + 沉淀 2 条 wisdom（principle-specification-internal-consistency + principle-baseline-lint-error-形式 vs 删除 占位符决策），待下批次 wisdom 蒸馏挂 standards
- ② 重大 bugfix 经验未沉淀：M25.2a commit 4 typecheck 修复教训（vitest 不抓 typecheck）+ M25.3 baseline 修复方向教训（删除占位符而非改写形式）已写入本分片「阶段关键经验」段
- ③ 重复违规预警：M25.2a commit 3 三执行器透传 + M25.1 PrimeUI 降级 + M25.3 baseline 修复 + M25.4 i18n-anchor-check 工具化 —— 4 类典型模式（跨包契约同步 / License 治理 / 占位符删除 / 错位污染检测）分别记录
- ④ 工具/环境陷阱：synchronize 路径列名冲突（commit 1 typecheck 通过但 migration 列名与 entity 不匹配）+ M22.6 fixture API h3 polling 行为（M22.7 hotfix）+ stash drop 不可逆（本批次实测丢失 baseline 4 文件）—— 3 类典型陷阱已记录

**M25 阶段增量价值**：M25 是 dependfix 1.0.0 前的 License 治理 + AI 研判集成基础设施阶段。**关键贡献**：
- **License 风险消除**（M25.1）：消除 PrimeUI 商业 License（社区免费版有 $1M USD / 5 开发者 / 10 员工 / $3M 风投限制 + 强制 license key），改用 MIT 协议
- **平台 AI 研判联通**（M25.2a 基础层）：让管理平台点 "扫描" 即可启用 AI 研判，集中管理 AI API Key；M25.2b 应用层留 M26 阶段
- **baseline 治理收口**（M25.3）：恢复 AGENTS.md §3 必要检查「lint 必须通过」基线（从 16 errors → 0 errors + 9 warnings）
- **follow-up 工具化**（M25.4）：把 M24 阶段 follow-up 文档化沉淀转实际工具落地（i18n-anchor-check 自动化检测 + zod-helpers 三态语义 helper）
- **方案 A 拆分实证**：M25.2 跨模块骨架任务按 §1.1「> 5 文件即考虑拆分」拆分为 M25.2a + M25.2b 两个阶段，让两个阶段都符合「阶段性聚焦 5-6 项以内」原则

**M26 阶段候选**已就位（待用户决策启动范围）：
- **M25.2b 应用层**（P1 follow-up）：4 个 API 端点 + UI + i18n + docs（5 commits / ~1130 行）
- **C67 批量导入 Resource owner 化**（P2）：3 commits / ~4h
- **C69 文档站 + 包 README 多语言实施**（P2）：5 commits / 0.5-1 切片
- **M25 follow-up #3 primeicons 降级**（P3）：1 commit
- **M25 follow-up #4 baseline 9 warnings 治理**（P3）：1-2 commits
- **M25 follow-up #5 经验归档沉淀**（P2）：1 commit（experience-archive §五十八-§六十二）

---

> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M25](roadmap.md#m25-primeui-license-治理--平台-ai-研判集成--lint-baseline-治理--m24-follow-up-工具化) + Milestone 概述表 M25 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M25 行
> - **关键 commit 实证**：`9bf640c` §1.4 规范修正 / `482438d` 方案 A 规划 / `35e4935` PrimeUI License 降级 / `4c51d19` platform.md §3.7 同步 / `1c65582` 数据模型 / `f174cce` Schema+Service / `7250ec1` 三执行器透传 / `49480a6` typecheck 修复 / `782fa27` M25.2a 收口 / `57f3b88` baseline lint 修复 / `4030f3b` packages/cli 修复 / `c88379e` M25.3 收口 / `80912c2` i18n-anchor-check / `65a8ec1` zod-helpers / `66c02ff` M25.4 收口 / `3947279` 锚点修正 + `4818e5d` M25.1 收口
> - **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **17** 待用户主动推送
