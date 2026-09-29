# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M32 能力扩展优先**（2026-09-29 用户决策方案 B 启动） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M31 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M31 已归档，M32 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

### M32: 能力扩展优先（2026-09-29 用户决策方案 B / 进行中）

**目标**：把「平台侧配置能力 / 目标仓库配置生态 / 告警口径对齐」三类能力扩展补齐，同时收口一处交付链路治本项（git 签名污染）与一处视觉兜底缺口（像素级回归缺失）。

**类型平衡**：🚀 能力扩展 3 项（M32.1 / M32.2 / M32.3）+ 🛡️ 技术债 1 项（M32.4）+ 🧪 测试基建 1 项（M32.5）= 5 原子条目，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)；**🎨 纯 UX 0 项独立条目——候选池缺 UX 类候选，缺口显式标注**（M32.5 兼作视觉层兜底，与 M28-M31 同型处理）。

**执行顺序建议**（建议，最终以用户确认为准；按风险 / 独立度排序，可并行度见各条目「依赖」）：M32.4（最小、完全独立）→ M32.3（engine 单侧）→ M32.1（平台后端 + migration + UI）→ M32.5（独立测试工程）→ M32.2（新增读取层，方案面最宽）。

**P 阶段决策记录（2026-09-29 用户裁定）**：

| 条目 | 决策点 | 裁定 |
|:--|:--|:--|
| M32.1 | C76 配置粒度 | **每仓库 Repository 字段**（需 TypeORM migration） |
| M32.2 | C85 文件路径 + 冲突优先级 | **`.github/dependfix.yml`，中央配置优先**（防目标仓库绕过保护策略） |
| M32.3 | C89 错误码口径 | 复用 `ALERTS_DISABLED` + source 区分（不新增独立码） |
| M32.4 | C82 是否提供签名 opt-in | **不提供 opt-in**（仅 push 隔离 + 记录决策依据） |
| M32.5 | C92 基线落位 + CI 接入 | **入仓库基线 + 独立 CI job** |

**§3.4 三重交叉核验**（2026-09-29 实测，0 项重复评估）：① todo-archive 历史表格——5 候选仅「登记候选留 backlog」无闭环标注；② `git log --all --grep="<Cxx>"`——命中均为登记 / 文档 commit，无实现 commit；③ 代码侧 anchor——`apps/platform` 侧 `commands` 0 命中 / `dependfix.yml` 0 命中 / `token-hints.ts` 对 `PERMISSION_DENIED` 仍统一提示 / 仅 commit 侧 `-c commit.gpgsign=false`（4 处 push 调用点未隔离）/ `toHaveScreenshot` 0 命中。

---

#### M32.1（P3，🚀 能力扩展）C76 平台侧暴露验证命令配置（每仓库 Repository 字段）✅ 已完成

> **闭环记录（2026-09-29）**：5 commits（`0c79845` 存储与校验层 / `1da2774` 写入链路与审计留痕 / `6e5c86a` 单测 / `0e5b21e` UI 表单与 e2e / `95935e1` 规范与已知边界）；A 阶段两分区（deep + standard）**第 1 轮 Reject → 修复 → 第 2 轮 Pass**。
> **验证证据**（测量方：执行角色）：全量单测 1336 项（`pnpm --filter @dependfix/platform test`，1329 passed / 7 skipped 为 Redis 集成门控）；e2e 175 passed（`TMPDIR=/dev/shm playwright test --workers=1`，CI 等价串行，连跑两遍）；root `pnpm run typecheck` 7 包全绿；非 `--fix` eslint 0 problem；`check:docs` / `lint:md:check` 通过。
> **落地差异**：① migration 改为**前缀感知**（既有 7 个迁移前缀不统一，已登记 backlog §已知边界）；② `repos.vue` 触达 eslint max-lines（800）→ 弹窗拆出 `repo-form-dialog.vue`；③ e2e 走预构建 `.output`，取证前需先 `build`（已登记 backlog 操作提醒）。

- **目标**：平台发起的修复可配置验证命令（与 CLI `--commands` 对齐），使平台场景能追加 `test` 等命令，而不必等默认链变更或改代码。
- **优先级**：P3
- **范围**：
  - `apps/platform/server/entities/repository.ts`（新增 `verifyCommands` 字段）
  - `apps/platform/server/database/migrations/`（新增 migration，按既有 M22.4 / M22.5 双向 opt-in 流程）
  - `apps/platform/server/schemas/`（Repository 配置 schema + zod 校验：命令数组、拒绝空串 / 超长）
  - `apps/platform/server/services/executor/container-executor.ts`（`RuntimeConfig` 组装注入 `commands`；当前仅 `...ctx.config` 透传 → 平台恒用引擎默认链）
  - `apps/platform/server/services/executor/types.ts`（`ScanExecutorContext.repository.verifyCommands` 字段）；其他执行器（`sandbox-executor.ts` 为最小占位 / `action-trigger-executor.ts` 走目标仓库 workflow）经该字段已可获得配置，但**本批不接线**——实测唯一构造 `DependfixApp` 的透传点是 `container-executor.ts`
  - `apps/platform/app` 仓库配置表单（最小字段：多行命令输入）+ i18n 双语
  - `docs/standards/platform.md`（配置项 + 执行风险声明）
- **验收标准**：
  - [ ] 仓库级 `verifyCommands` 可经 API 写入 / 读取，并在执行器侧透传至 `RuntimeConfig.commands`（单测断言实际调用参数，不止断言「无异常」）
  - [ ] 未配置时行为不变（沿用引擎 `DEFAULT_VERIFY_COMMANDS`；新增回归 case）
  - [ ] 权限门槛：仅 admin / org_admin 可写；写入留 `audit-event` 记录
  - [ ] zod 校验：非空数组 / 每项非空字符串 / 长度上限；非法输入返回 400
  - [ ] migration 幂等（二次运行不报错）；`pnpm --filter @dependfix/platform test:e2e` 连跑两遍全绿（二次运行覆盖幂等与索引 / 列声明正确性）
  - [ ] `pnpm lint` + `pnpm typecheck` + platform 定向测试通过
- **不做什么**：不落地沙箱真实执行序列（`sandbox-executor.ts` 仍为最小占位）；不开放任意 shell（仅接受命令数组）；不改 CLI 侧 `--commands` 语义；不改 `DEFAULT_VERIFY_COMMANDS`
- **依赖**：关联 M29.3（默认链唯一事实源）+ M29.2（同属修复交付链路）；沙箱路由已 M11 T1005 落地但容器内真实序列未实现，本批不为它兜底；关联 [docs/standards/platform.md](../standards/platform.md)
- **交付物**：5 atomic commits（`feat(platform)` 存储与校验层 / `feat(platform)` API + 审计 + 执行器透传 / `test(platform)` 单测 / `feat(platform)` UI + i18n + e2e / `docs` 规范与已知边界）—— 因 [§1.1 任务粒度约束](../standards/planning.md#11-硬性约束)「单 commit ≤ 10 文件」而按层拆分
- **风险与缓解**：平台自定义命令等价于远程命令执行面；缓解：权限门槛 + audit 留痕 + 文档风险声明 + 仅接受数组（不接 shell 字符串）。文件面接近 10 个（entity / migration / schema / 4 executor / UI / i18n / tests / docs）——若实测超 10 文件按 [§1.1 任务粒度约束](../standards/planning.md#11-硬性约束)拆为「后端透传」+「UI」两子批次

#### M32.2（P3，🚀 能力扩展）C85 目标仓库专属配置 `.github/dependfix.yml`（中央优先）

- **目标**：支持在目标仓库内声明 dependfix 专属配置（`.github/dependfix.yml`），与 `dependabot.yml` / `mergify.yml` 同范式——配置随仓库走，管理大量仓库时无需中央维护名单。
- **优先级**：P3
- **范围**：
  - 新增配置读取层（clone 后读取 `.github/dependfix.yml`）
  - `packages/engine/src/github/repository-discovery.ts`（复用 `DEPENDABOT_CONFIG_PATH` 的 contents API 探测模式）
  - zod schema 校验 + 错误降级（非法配置 → 警告 + 回退中央配置，不中断修复）
  - 优先级规则落地：**中央配置优先**
  - `docs/standards/platform.md` + `docs/design/modules/dependency-fixer.md`
- **验收标准**：
  - [ ] 目标仓库 `.github/dependfix.yml` 声明的配置项在修复链路生效（优先级规则有测试证伪）
  - [ ] 与中央配置冲突时「中央优先」行为有测试覆盖
  - [ ] 无该文件 / 非法 YAML / schema 不匹配时行为与现状一致（回归 + 降级警告，不抛错中断）
  - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
- **不做什么**：不替代中央配置（两者并存）；不改 `dependabot.yml` 语义；不做全量配置项迁移——**首批仅支持 `overrideProtect`**（与中央配置同名同语义，中央优先时目标仓库声明仅在中央未指定时生效）
- **依赖**：关联 M29.4（中央配置 `overrideProtect` 已落地，本候选为其目标仓库侧演进）；关联 `repository-discovery` 的 dependabot.yml 探测路径
- **交付物**：2-4 atomic commits（`feat(engine)` 读取层 + schema / `feat(engine)` 优先级合并 / `test(engine)` case / `docs`）
- **风险与缓解**：新增配置约定需目标仓库采纳，短期覆盖率低；缓解：与中央配置并存，按仓库渐进采纳

#### M32.3（P3，🚀 能力扩展）C89 Code Scanning / Code Quality「未启用」与「获取失败」区分 ✅ 已完成

> **闭环记录（2026-09-29）**：3 commits（`00a11ff` `fix(engine)` 403 判定与源感知文案 / `c7e5cce` `fix(core)` 报告指引源无关 / `0a9516e` `docs(standards)` 口径登记）+ 本闭环登记；A 阶段两分区（deep + standard）**第 1 轮均 Pass**（0 blocker），并按 warning / suggest 收敛（集成层断言改锁 hint 独有子串 / 匹配口径补 `code security` / 删除无调用点入口 / 报告测试正向锁指引句 / 匹配口径权威单点迁至 `github-client.md §5.3`）。

- **目标**：Code Scanning（Advanced Security 未启用时 403）与 Code Quality 的「未启用」状态从 `PERMISSION_DENIED` 中区分出来，与 Dependabot 的 `ALERTS_DISABLED` 口径一致（未启用 ≠ 失败：单列计数 + 准确文案）。
- **优先级**：P3
- **范围**（落地后校正：判定**集中**在共用映射层，而非两个 fetcher 各自实现）：`packages/engine/src/github/errors.ts`（403「功能未启用」匹配：Dependabot 精确文案 + GHAS / Code Security 容忍匹配）/ `packages/engine/src/app/token-hints.ts`（`alertSourceLabel` / `alertsDisabledHint(source)` 按源文案）/ `packages/engine/src/app/repo-alerts.ts`（未启用分支按源记录与提示）/ `packages/core/src/report/markdown-generator.ts` + `types.ts`（报告指引源无关 + 明细注释）/ `docs/standards/platform.md §6.1` + `docs/design/modules/github-client.md §5.3`
- **决策（P 阶段裁定）**：复用 `ALERTS_DISABLED` 错误码 + source 区分，**不新增独立错误码**——与 C78 方案 A 口径一致，避免错误码增殖
- **验收标准**：
  - [ ] Code Scanning 403 + Advanced Security 未启用 message 可与权限失败区分，报告 / 日志文案准确
  - [ ] 单测覆盖未启用 / 权限不足 / 限流三类（断言错误码与文案，不止断言抛出）
  - [ ] 未启用仓库单列计数，不影响 `exitCode`（与 C78 方案 A 口径一致）
  - [ ] Code Quality 判定信号未明时退回 `PERMISSION_DENIED`（不误判）
  - [ ] `pnpm lint` + `pnpm typecheck` + engine 定向测试通过
- **不做什么**：不改 `alertsSource` 默认值；不自动开启目标仓库 Advanced Security；不引入新依赖；不落地前端 Code Scanning 扫描消费场景
- **依赖**：关联 C78（已落地的 Dependabot 未启用口径，含 `isAlertsDisabledError`）；关联前端 Code Scanning 扫描落地（消费场景前置，本批仅为口径对齐）
- **交付物**：2-3 atomic commits（`feat(engine)` 错误细分 + `test(engine)` case + 报告字段 / 文档同步）
- **风险与缓解**：Code Quality「未启用」无官方 message 文案（官方文档仅描述 403 语义）；缓解：采用「产品名片段 + 否定启用词」双片段容忍匹配（覆盖 `advanced security` / 新称 `code security`），匹配失败退 `PERMISSION_DENIED`（不误判）；若未来取到真实文案可固化为 fixture。另：未启用源与其余源全失败时的仓库级粒度退化已登记 backlog §已知边界。
- **验证证据**（测量方：执行角色）：root `pnpm test` 3354 项（`pnpm test`，3346 passed / 8 skipped）；mutation 实证 2 项（去掉 GHAS 容忍匹配 → 6 用例失败；提示硬编码回 Dependabot → 源感知用例失败）；root `typecheck` 7 包全绿；非 `--fix` eslint 0 problem；`check:docs` / `lint:md` 通过；`pnpm run build` 重建 dist

#### M32.4（P3，🛡️ 技术债 / 治本）C82 git 签名语义边界（push 隔离 + 不提供 opt-in）✅ 已完成

> **闭环记录（2026-09-29）**：5 commits（`fix(engine)` 单一事实源常量与 push 隔离 / `test(engine)` 真实 git 回归 / `fix(platform)` 3 处调用点 / `test(platform)` argv 断言 / `docs(standards)` 策略与检查点登记）；A 阶段两分区（deep + deep）**第 1 轮均 Pass**（无 blocker），并按 warning / suggest 收敛（修正恒真断言 → 改用 `--get` 可击破断言；配置查找顺序措辞精确化；JSDoc 收敛为指针）。
> **验证证据**（测量方：执行角色）：root `pnpm test` 3336 项（`pnpm test`，3328 passed / 8 skipped）；引擎 `git-signing.test.ts` 真实 git 回归（同环境裸 push 必失败作反例对照）+ mutation 实证（去掉隔离参数 → 该用例失败于 `does not support --signed push`；写入 local config → 落盘断言失败）；平台 argv 三文件 72 passed；root `typecheck` 7 包全绿；非 `--fix` eslint 0 problem；`check:docs` / `lint:md` 通过；`pnpm run build` 重建 dist（engine src → dist 一致性）。
> **落地差异**：① 单一事实源落在 `packages/engine/src/github/git-signing.ts`（engine + 平台共用）；② 「不提供 opt-in」策略与重开条件记入 [git.md §3.8](../standards/git.md)；③ 该约束的 review 检查点缺口登记入 backlog `C91`（待挂接）；④ e2e 未跑（无 UI 改动且套件不覆盖 push 路径，理由见交付说明）。

- **目标**：push 链路同 commit 链路一样不受宿主 `push.gpgSign` 污染；并把「不提供 commit 签名 opt-in」作为显式策略记录，而非隐式默认。
- **优先级**：P3
- **范围**（4 处 push 调用点统一加 `-c push.gpgSign=false`）：
  - `packages/engine/src/github/pr-creator.ts`（`pushBranch`，当前无隔离）
  - `apps/platform/server/services/executor/platform-delivery.ts`（`pushFixBranchWithCredential`，平台接管交付路径）
  - `apps/platform/server/services/executor/container-executor.ts`（`pushFixBranch` + `cleanupRemoteBranch` 的 `--delete`）
  - 抽统一常量（如 `GIT_SIGNING_ISOLATION_ARGS`）避免 commit / push 两处漂移
  - `docs/standards/git.md`（记录「不提供 opt-in」决策依据 + 重开条件）
- **验收标准**：
  - [ ] 宿主 `push.gpgSign=true` 时 push 仍成功（新增 case；实测触发条件与服务端 `receive-pack` 证书协商相关，不涉及 `gpg.program`）
  - [ ] 4 处调用点全覆盖，`rg` 实证无遗漏 push 调用
  - [ ] 四层暴露面（CLI / env / action / 文档）口径一致，且显式记录「不提供 opt-in」的决策依据
  - [ ] 隔离参数以单一常量声明，无字面量重复
  - [ ] `pnpm lint` + `pnpm typecheck` + engine / platform 定向测试通过
- **不做什么**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名；不回溯已产生的 commit / push；不做签名 opt-in；不做目标仓库保护规则预检
- **依赖**：关联 M29.2（commit 侧 `-c commit.gpgsign=false` 已闭环，本候选为同根因的 push 侧）；关联 M30.4（commit author 变更可能触发仓库保护规则，含「要求签名 commit」风险，与本条目互引）
- **交付物**：2-3 atomic commits（`fix(engine)` + `fix(platform)` 隔离 + `test` case + `docs(git)`）
- **风险与缓解**：若未来目标仓库强制签名 commit，需回到本决策；缓解：文档记录重开条件（密钥来源 / 失败语义 / 暴露层三项待定）

#### M32.5（P3，🧪 测试基建 / 视觉兜底）C92 apps/platform 视觉回归最小集 ✅ 已完成

> **闭环记录（2026-09-29）**：7 commits（`114611f` fixtures 端点标签支持 / `ec3d236` alerts 视觉遮罩属性 / `cddeda2` vitest 排除视觉目录 / `1969ad5` 视觉回归独立工程 + 用例 + 入仓库基线 / `589db12` CI 接入与基线入库例外 / `01aa519` 规范与候选登记 / 本闭环登记）；A 阶段两分区（standard = platform 代码 / 测试；deep = CI / 配置 / 文档）**第 1 轮 1 Pass + 1 Reject**（RG-B1 blocker：验收项「M31 已裁定差异写入基线说明」未落地）→ 修复 → 第 2 轮 standard 复审 **Pass**（新增 RG-N1 引用归属 warning 已同步修正）。
> **验证证据**（测量方：执行角色）：`TMPDIR=/dev/shm pnpm run test:visual` **7 passed**，基线采集后连跑两次零 diff（确定性）；反例验证 2 组——① 改 `_variables.scss` `$color-primary` → **2/7 失败**（pr-checks 226px / login 215px，其余页受影响面积 ≤200px 阈值未被检出）② 改 nuxt caomei 主题 `theme.primary` → **5/7 失败**（全部亮色用例 957-13658px，暗色用例不受影响因暗色档单独覆盖 `--caomei-color-primary`），还原 + 重建后 7/7 绿；e2e 175 passed（`--workers=1` 串行，2m24s，无回归）；根 `pnpm test` 3355 项（3347 passed / 8 skipped，含 fixtures 标签新用例）；root `pnpm run typecheck` 7 包 exit 0；非 `--fix` eslint（root + platform）0 problem；`check:docs` / `lint:md:check` 通过；视觉比对步骤实测约 12-13s（含 webServer 启动），远低于 1.5-2 min 预算。
> **落地差异**：① 视觉套件改跑**独立 SQLite 库**（`data/visual.sqlite`）而非 e2e 库——e2e 库被用例累积写入（`repos-crud` 留记录、`scanRuns` 每次新建）会让基线必然漂移；② fixtures 端点新增可选 `tags`（视觉「标签录入」列需确定性数据，向后兼容 + 双门控不变）；③ `alerts` 时间列加 `data-visual-mask`；④ 根 `vitest.config.ts` 排除 `**/tests/visual/**`（新 spec 名命中 vitest 默认 include，首轮 `pnpm test` 因此失败）；⑤ CI job 初期 `continue-on-error`（基线为本地容器采集）+ 转阻断判定条件固化于 workflow 注释与 §6.7；⑥ `pr-checks` 行级 / `alerts` 右端列两处覆盖盲区登记 backlog（C93 / C94）。
> **范围说明（A 类配套扩展）**：`server/api/e2e/fixtures.post.ts`（+`tags`）/ `tests/e2e/helpers/fixtures.helper.ts`（类型）/ `app/pages/alerts.vue`（遮罩属性）/ `package.json` / `tsconfig.json` / `vitest.config.ts` 属「补足 M32.5 验收标准的配套工作」，非独立能力扩展；交付物 commit 类型相应含 `feat(platform)`（fixtures 端点）与 `test(platform)`（视觉工程 + 基线）。

- **目标**：为 `apps/platform` 建立像素级视觉兜底，使组件库版本升级 / 主题 token 变更 / 关键页样式改动导致的非预期视觉漂移可被自动检出，而不是依赖一次性人工（视觉模型）判读。
- **优先级**：P3
- **范围**：
  - `apps/platform/playwright.visual.config.ts`（独立配置，**不并入** `test:e2e` 的 `testMatch`）
  - `apps/platform/tests/visual/`（helper + 用例）
  - 基线快照**入仓库**（可回溯、可在 PR 中 review 差异）
  - `apps/platform/package.json` 新增 `test:visual` script
  - CI 独立 job（隔离耗时与报告）
  - `docs/standards/testing.md` + `docs/standards/platform.md`
- **最小集清单**：亮色 4-5 张（`alerts` 分组 + 多列排序 / `repos` 行选择 + 标签录入 / `pr-checks` 密度例外页 / `dialog-import-repos` 浮层 / `login`）+ 暗色 2 张（`alerts` / `repos`）
- **环境固定**：chromium / 1440×900 / DSF1 / zh-CN / Asia-Shanghai；`animations: 'disabled'` + `caret: 'hide'`；`workers: 1` + `retries: 0`；动态区域以 `[data-visual-mask]` 遮蔽；阈值 `maxDiffPixels: 200` + `threshold: 0.2`
- **验收标准**：
  - [ ] `pnpm --filter @dependfix/platform test:visual` 独立入口可用，且**不改变**既有 `test:e2e` 的 `testMatch` 与断言语义
  - [ ] 覆盖亮 / 暗两态；动态区域以 `mask` 显式遮蔽（不靠像素容差兜底）
  - [ ] 反例验证：人为注入一处 token / 样式改动可被检出（证明阈值有效、非恒真）
  - [ ] CI 独立 job 接入，并实测增量耗时（预算约 1.5-2 min）
  - [ ] M31 已裁定差异写入基线说明——8 条裁定项（7 项接受 + 1 项已修复；测量方 M31 执行角色 + `ui-validator`，逐项索引见 [caomei-ui-migration.md §15.13](../design/governance/caomei-ui-migration.md#1513-b3-收尾实证m3152026-09-29)）+ 表头不吸顶 + 6 处 `neutral` 实底按钮 / `Message` soft 无边框，避免后人误判为新回归
  - [ ] 基线采集环境（浏览器渠道 / viewport / locale / 时区）在配置注释中固化可复现；`pnpm lint` + `pnpm typecheck` 通过
- **不做什么**：不做全量页面 × 多浏览器 × 多 viewport 矩阵；不替代 `ui-validator` 的交互 / 可用性审查；不修改 e2e 功能层语义；不为让测试变绿放宽阈值或用 `mask` 掩盖真实差异；不在本条目内处理 M31 已裁定的视觉差异本身
- **依赖**：关联 M31（触发来源，[caomei-ui-migration.md §15.13](../design/governance/caomei-ui-migration.md)）；消费者为 backlog 延期项「caomei-ui 0.x → 1.0 升级回归」；关联 [测试规范 §6.1 E2E 实践模式](../standards/testing.md)；外部参照 momei 的 `playwright.visual.config.ts` / `tests/visual/helpers/visual.ts`
- **交付物**（收口后校正为 7 atomic commits，按 [§1.1 任务粒度约束](../standards/planning.md#11-硬性约束)「单 commit ≤ 10 文件」与「提交态自洽」共同拆分）：① `test(platform)` fixtures 端点标签支持（端点 + 单测 + e2e 类型）② `test(platform)` alerts 时间列视觉遮罩属性 ③ `test` 排除视觉回归目录避免 vitest 误收集 ④ `test(platform)` 视觉回归独立工程 + 用例 + 入仓库基线 ⑤ `ci` 独立任务 + 基线入库例外 ⑥ `docs(standards)` 口径与候选登记 ⑦ `docs(plan)` 验收闭环登记。其中 ④ 含 15 文件（8 个代码/配置/文档 + 7 张二进制基线快照）——基线须与用例同 commit，否则该提交态下视觉套件必失败（提交态自洽优先于文件数阈值；二进制快照不计入代码审查负载）
- **风险与缓解**：① 像素抖动导致 flaky → `workers: 1` + `retries: 0` + 关动画 + 字体就绪等待 + `mask`；② 跨 OS / 字体渲染差异 → 基线只在 CI 或固定容器采集（本仓 e2e 已有容器 `TMPDIR=/dev/shm` 前置）；③ 基线体积与维护成本 → 只取最小集 + 提供增量更新入口；④ 阈值过宽掩盖真实回归 / 过窄误报 → 用「注入式反例验证」标定

---

### 阶段约定

- 每个原子条目闭环前必须通过 `pnpm lint` + `pnpm typecheck` + 定向测试；涉及打包 / 入口 / 导出变更时追加 `pnpm build`。
- 每条改动进入 A 阶段 `Code Auditor (代码审计员)` Review Gate；放行后方可进入 V / T / F。
- 提交按 [AGENTS.md §提交规范](../../AGENTS.md)（`conventional-committer` skill + 原子粒度）；推送仅限用户明确要求。
