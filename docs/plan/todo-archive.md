# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：[M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出）

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块。
- 当 `todo-archive.md` 超过 500 行时，将早期阶段迁入分片归档。

---

## M2: GitHub Action 接入（已归档）

> 归档日期: 2026-08-05
> 阶段摘要: 参见 [roadmap.md §M2](roadmap.md)
> 状态: 已完成（含 M2 增强批次）
> 最终提交: `c97fe2b` docs: 同步 T213 完成状态（评估发现状态滞后）

**阶段成果**: 消费者仓库可通过 `uses: dependfix/dependfix@v1` 一行接入安全告警自动修复（fix-and-pr 默认、PR 去重、分支清理、分组升级）。M2 全部 13 个任务完成（11 个 ✅ + T205/T206 骨架按设计完成，M5 联调）。G2 处置闭环（T-G2-1~5）。448 tests。

### T201 创建 Composite Action（action.yml）✅
- **交付物**: `action.yml` + `.github/workflows/security-auto-fix.yml`（dogfooding）
- **实现内容**: composite action 6 步（setup pnpm → Node → install+build → run CLI → upload artifact → summary）、`uses: ./` 薄封装、每周一 UTC 6:00 定时
- **验收**: 消费者 `uses: dependfix/dependfix@v1` 可引用、dispatch + schedule 双触发

### T202 Action 输入输出参数对齐 ✅
- **实现内容**: `repos` 输入（留空默认 `github.repository`）、CLI 完整映射、报告写入 `$GITHUB_STEP_SUMMARY`

### T203 报告 Artifact 输出 ✅
- **实现内容**: `writeReport()` 文件名 `dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md|.json`、upload-artifact 上传 `./dependfix-reports/`

### T204 分支与 PR 创建能力 ✅
- **交付物**: `packages/cli/src/github/pr-creator.ts` + fix-and-pr 模式
- **实现内容**: `createFixBranch` / `stageAndCommit` / `pushBranch` / `createPullRequest` / `generatePRBody` / `hasGitChanges`；workflow permissions `contents: write` + `pull-requests: write`

### T205 AI Token 支持（🔶 骨架，M5 T502 联调）
- **实现内容**: action.yml 预留 `ai-api-token` / `ai-api-base-url` 输入，经 env 传递（不出现在日志/summary）；AI 引擎联调延后 M5

### T206 Prompt 注入防护（🔶 骨架，M5 联调）
- **实现内容**: 触发仅 dispatch/schedule（不接受 comment trigger）、触发者权限由消费者 workflow 控制；system prompt 硬编码与输入清洗 M5 落地

### T207 fix 模式本地提交（--commit）✅
- **实现内容**: `--commit` / `AUTO_FIX_GITHUB_SECURITY_COMMIT`、互斥校验（dry-run/create-pr/非 fix）、`ensureGitignore` 前置、提交失败记 `COMMIT_FAILED` 不影响报告

### T208 Action workDir 语义修正 ✅
- **实现内容**: 首步 `actions/checkout`（消费者仓库到 `$GITHUB_WORKSPACE`）、Run 在 workspace 执行、CLI 从 action_path 调用、build 冒烟检查

### T209 Action 默认 fix-and-pr ✅
- **实现内容**: action.yml `mode` 默认 `fix-and-pr`、`dry-run` 默认 `false`；CLI 本地默认 report-only（两场景语义分离）；文档标注破坏性变更

### T210 PR 去重：内容指纹 + 查重跳过 + 关旧开新 ✅
- **实现内容**: `computeFixFingerprint`（结构化升级集 sha256 前 8 位）、`extractFingerprintFromBranch`、`computeFixAndPrPlan`（skip/supersede）、先建新后关旧；测试 +23

### T211 清理模式（cleanup-branches）✅
- **实现内容**: 独立模式（清单分类 + 交互 y/N 非 TTY 拒绝）、只删 `dependfix/` 前缀且仅 merged/closed、`FixAction.type` 扩展 `branch-cleanup`、action 仅报告清单不删除

### T212 分支清理增强（supersede 删旧分支 + cleanup-branches-auto）✅
- **实现内容**: `closeSupersededPRs` 关 PR 后回收 head 分支、`--cleanup-branches-auto` 非交互自动删除（dry-run 仅列）、双 flag 并存跳过报告清单

### T213 依赖分组升级（Dependency Grouping）✅
- **交付物**: `packages/cli/src/grouping/index.ts`（原 fix-grouping.ts）+ app 组级循环 + CLI 参数 + 设计稿
- **实现内容**: dependabot.yml groups 解析 + @types 归并/孤儿检测 + scope/前缀启发式 + 显式分组 `--upgrade-groups`；组级验证 → 整组回滚 → 拆组兜底；`buildUpgradeGroups` / `parseDependabotGroups`；测试 +43（33 分组 + 6 app 集成 + 4 config）；两轮 Review Gate APPROVE

### M2 完成判定（全部通过）
- [x] `action.yml` 可通过 `uses: dependfix/dependfix@v1` 被其他仓库引用
- [x] Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- [x] 定时运行自动产出报告 artifact + workflow summary
- [x] `fix-and-pr` 模式下能在目标仓库创建可审查的 PR
- [x] 工作流参数与本地 CLI 保持一致
- [x] T205 / T206 骨架设计完成（AI 引擎联调延后到 M5）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过

### M2 阶段治理记录（2026-08-04 ~ 2026-08-05）

#### G2 处置记录（GITHUB_TOKEN 无法访问 Dependabot alerts）

- **G2 处置闭环**: T-G2-1 fetch 401/403 硬失败（a9e61b8）→ T-G2-2 Code Scanning 探针验证（GITHUB_TOKEN 可访问，HTTP 200）→ T-G2-3 双 token 方案（alertsToken + `dependabot-alerts-token` input）→ T-G2-4 pnpm audit fallback（`--alerts-source pnpm-audit`，d9fef68）→ T-G2-5 规划文档闭环（b6d04ad）
- **G3 处理**: 同包收敛 + 不降级保护 + 逐包验证回滚（9de0fad）→ T213 分组升级（b962374）→ manifest 归属防护（640fe8c 修复跨 manifest 降级 + pnpm v11 lockfile 解析）→ P0 误伤修正（7b0fbb6，lockfile manifest 的间接依赖回归修复）
- **运行复盘**: run 30929090403（vite 降级 + lockfile 解析失效）与 run 30933266831（P0 误伤全 skip）两轮复盘修复
- **质量治理**: 代码质量 Q1-Q3（eslint 升级、max-lines 约束、严格化规则）、目录结构收敛（bb24ef0）、覆盖率统计 + Codecov 上报（1d76c24）
- **遗留观察点**: G1（PIN_TOOLCHAIN stub，承接 M3 T305）、G3 报告统计口径（alertsConverged）、major overrides 确认机制评估（暂不实现）

---

## M3: Code Scanning 扩展（已归档）

> 归档日期: 2026-08-06
> 阶段摘要: 参见 [roadmap.md §M3](roadmap.md)
> 状态: 已完成（含 M3 收尾修复批次 + 反馈修复）
> 最终提交: `a82f6580` feat: PR body 新增 ✅ Fixed Alerts 告警级明细（用户反馈 PR #27）

**阶段成果**: Code Scanning alerts 与 Dependabot 并行采集（`--code-scanning` / `DEPENDFIX_CODE_SCANNING` / action `code-scanning` input），A/B/C 三级规则分层（自动修复 / 建议修复 / 仅报告），eol-last 自动修复闭环，无法自动修复问题输出报告 + PR body 建议区块，G1 工具链固定（PIN_TOOLCHAIN + corepack + 漂移检测）。574 tests。

### T301 接入 Code Scanning Alerts 拉取 ✅
- **交付物**: `packages/cli/src/github/code-scanning-fetcher.ts`
- **实现内容**: octokit.paginate 分页拉取 open 告警；标准模型（`source: 'code-scanning'`、`ruleId`、`mapCodeScanningSeverity` 安全级别优先）；默认不可自动修复（fixable: false，由 T303 规则模板按规则启用）；与 Dependabot 并行展示
- **验收**: report-only / fix 模式并行展示互不覆盖；拉取失败（401/403）硬失败 + hint
- **演进项**: per-source 错误隔离（warn + 弃该源，暂缓）；fix 模式 code-scanning 告警统计口径与 G3 alertsConverged 一并处理

### T302 规则分层与白名单机制 ✅
- **交付物**: `packages/cli/src/code-scanning/rule-classifier.ts`
- **实现内容**: A/B/C 三级规则分层；A 类白名单（eol-last）；B 类建议列表（CodeQL js/py/java 安全类 + no-unused-vars）；C 类仅报告兜底；分类结果报告 §4 Class 列可见
- **历史决策**: no-unused-vars 因删除变量副作用归 B（Review Gate 认可）；no-trailing-spaces 模板字符串词法歧义 3 轮评审移除（M4+ 词法扫描后恢复）；jsdoc/check-alignment 模板未实现
- **演进项**: B 类覆盖真实仓库样本核对（规则 id 格式与变体分布）；规则分类配置化（M4+ 扩展点）

### T303 实现可模板化规则修复器 ✅
- **交付物**: `packages/cli/src/fixers/code-scanning/` 首批修复模板（替换 M0 stub）
- **实现内容**: eol-last 模板；`FixAction.type` 扩展 `'code-scanning-fix'`（noOp 三态语义）；复用 verification-runner；失败回退建议模式（不静默、可审计）
- **验收**: eol-last 自动修复闭环（修复 → quickVerify → 报告/PR）
- **遗留**: app 层非 dry-run 验证/回滚缺 e2e（组件单测兜底）；多 cs 告警逐告警全项目 lint 性能观察项；报告 Fix Actions 表 noOp 动作显示 ✅ 图标（观感，error 文本可审计）

### T304 实现建议型输出 ✅
- **交付物**: 报告 §Code Scanning Suggestions 区块 + PR body 区块
- **实现内容**: 规则 ID / 位置（文件:行）/ 摘要 / 建议方向（fetcher 注入 suggestionFor）；未修复原因区分（B/C 类 / noOp / 修复失败，reason 优先级链）
- **遗留**: summary 字段已收集未渲染；endLine 死字段（供后续多行范围展示，报告字段清理候选）；大仓库建议区块行数可能使 PR body 接近 64KB 上限

### T305 工具链固定（G1 承接）✅
- **交付物**: `packages/cli/src/fixers/pnpm/index.ts` 的 PIN_TOOLCHAIN 策略接线 + config 输入
- **实现内容**: `toolchainPnpmVersion`（CLI/env，缺省 packageManager 解析，semver 白名单防注入——Review Gate P1）；`corepack pnpm@<version> install --lockfile-only`（corepack 失败 → 裸命令 → REGENERATE 兜底）；lockfileVersion 前后对比漂移标注；测试 +12
- **遗留**: verifyFrozenLockfile 仍用裸 pnpm 验证（可能架空 PIN_TOOLCHAIN）；漂移检测为相对对比弱代理

### M3 完成判定（全部通过）
- [x] report-only / fix 模式并行展示 Dependabot + Code Scanning 告警（Rule/Advisory 列语义化）
- [x] A/B/C 三层规则分类落地：自动修复 / 建议修复 / 仅报告
- [x] 至少一类 Code Scanning 问题自动修复闭环（eol-last）
- [x] 无法自动修复的问题不静默丢失（报告 + PR body 建议区块）
- [x] G1 工具链固定落地（PIN_TOOLCHAIN + corepack + 漂移检测）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过；Review Gate 放行

### M3 阶段治理记录（2026-08-05 ~ 2026-08-06）

- **主交付**: T301~T305 五轮提交（7b8feb3 / 5b3e076 / aebf258+a7fa3a0 / dead17e / 486fea7），每任务独立 Review Gate（T303 经历 4 轮、T305 经历 2 轮），最终全量审查 APPROVE；配套 ed6c7737（action code-scanning input 接线）
- **收尾修复批次（e1aad1e + c20218e，用户确认批次）**: PR 标题动态生成（cs-only 不再误标 "N upgrades"）、partition 限定依赖源告警（cs 噪音）、'unknown' 严重级 cs 源透传、report-only 措辞按模式区分、maxAlertsPerRepository 截断进报告、app/index.ts 行数拆分（helpers.ts + branch-cleanup.ts）
- **环境变量前缀迁移（38722c5，方案 B）**: `AUTO_FIX_GITHUB_SECURITY_` → `DEPENDFIX_`（15 变量 16 处读取），config 抽取 ENV_PREFIX + readEnv 防再漏
- **多版本共存分别 overrides（89d8c508，run 31021398673 复盘）**: readLockfileVersions 多实例读取、applyVersionedOverrides 批量写 + 回滚、partition 根/lockfile 多版本路由、`__fixtures__/lockfile-drift/` 死资产删除；测试 +17
- **版本化 overrides 大版本 key（06843b9d，run 31028234123 复盘）**: 按 major 分组取各线最高推荐（`vite@5: ^5.4.21`）、存在脆弱实例门槛（替代 hasMultipleMajorVersions）、18 条 Skipped 全转可修复
- **反馈修复（a82f6580，PR #27 用户反馈）**: PR body 新增 ✅ Fixed Alerts 告警级明细；buildFixedKeys 单一事实源（依赖升级包级 repo/pkg 匹配——同包多 GHSA + 多目标 toVersion 不漏列；CS 实例级 + noOp 排除）；测试 +4
- **治理基建**: Session Wisdom 蒸馏机制（062ce9ef）+ 首次蒸馏（e6827785）+ 压缩抽象与日期命名规范（3b1bf7f8）+ momei http 引用（6690ed02）
- **遗留登记（转入 backlog）**: pnpm 11 不读 package.json#pnpm.overrides 假成功风险、verifyFrozenLockfile 裸 pnpm、漂移检测弱代理、resolveWithinWorkDir 符号链接逃逸、PR body 64KB 上限、app/helpers ↔ cli/helpers 循环依赖、G3 统计口径与覆盖盲区观察点

---

## M4: 多仓库治理增强（已归档）

> 归档日期: 2026-08-06
> 阶段摘要: 参见 [roadmap.md §M4](roadmap.md)
> 状态: 已完成（含收尾批次 + 增强候选）
> 最终提交: `cf12e381`（增强候选 C2+C6+C7 批次）

**阶段成果**: owner 级仓库自动发现 + 并发控制与失败隔离 + 名单策略 + 报告归档与趋势统计。650 tests。

### T401 实现 owner 级仓库自动发现 ✅

- **交付物**: `packages/cli/src/github/repository-discovery.ts`
- **实现内容**: owner/org 分页拉取（octokit.paginate）+ archived/fork 剔除 + topic 过滤（AND）+ dependabot.yml 存在性探测（仅候选仓库，404 视为不支持）+ 显式列表合并去重（显式优先）+ 排序确定性（runId/指纹稳定）
- **验收**: 同输入多次运行结果一致；探测请求数量受控
- **Review Gate**: PASS（P2 测试缺口当场补齐：config 校验 5 例 + app 接线 2 例）
- **非目标**: 全量内容扫描判断技术栈（登记 backlog C17）

### T402 并发控制与失败隔离 ✅

- **交付物**: `packages/cli/src/multirepo/scheduler.ts`
- **实现内容**: `--max-concurrency` / `DEPENDFIX_MAX_CONCURRENCY`（1-16 默认 1，>1 警告；fix/fix-and-pr 因共享 workDir 禁并发）+ 仓库级失败隔离（单仓库失败记录 failed 不中断）+ 429/403 限流指数退避重试（octokit hook 统一包装，写请求不重试）+ 聚合 RunResult
- **验收**: 注入失败仓库不影响其余；并发配置生效；429 退避重试不丢数据
- **Review Gate**: 首轮 REJECT（P1 并发写共享 workDir 数据竞争 → 修复 maxConcurrency>1 仅 report-only + fail-fast 校验；P2 scheduler 兜底静默吞错 → 补 onError 记录）→ 复审 PASS；残余 R1-R8 处置见 backlog
- **非目标**: 跨进程/分布式调度（M7 BullMQ + Redis）

### T403 仓库白名单 / 黑名单策略 ✅

- **交付物**: discovery 过滤链扩展（include/exclude 合并）
- **实现内容**: `--repo-include` / `--repo-exclude` glob（多次传入）+ 优先级语义（显式列表受 exclude 约束、不受 include 影响；发现结果受两者约束；include 与 exclude 冲突时 exclude 胜出）+ topic 黑名单 + 优先级矩阵写入 configuration.md
- **验收**: 组合矩阵结果确定可预期
- **Review Gate**: PASS（P2 仅 todo 状态同步；P3 topics 大小写敏感/ReDoS 面登记）
- **非目标**: 正则引擎（登记 backlog C18）

### T404 报告归档与趋势统计 ✅

- **交付物**: `packages/cli/src/report/archiver.ts` + 归档索引
- **实现内容**: `dependfix-reports/{YYYY-MM}/{runId}/` 多仓库各自 md/json + 汇总 json + `index.json`（runId/时间/仓库/计数/时长）+ `--history <repo>` 仓库级历史（repoStats 口径）+ 与 RunSummary 同字段口径
- **验收**: 连续 2 次运行 index.json 可查按仓库趋势；现有报告输出与 action artifact 不破坏
- **Review Gate**: 首轮 REJECT（P1 --history 多仓库输出全局计数 → 改 repoStats 仓库级口径；P2 grouping.test.ts 污染 cwd → reportOutputDir 隔离）→ 复审 PASS
- **非目标**: 图表/仪表板（M6 平台）；报告保留策略（登记 backlog C19）

### M4 完成判定（全部通过）

- [x] `--owner` 一次拉取多仓库处理清单
- [x] 显式 + 发现 + 名单组合结果可预期
- [x] 多仓库失败隔离 + 并发可控
- [x] 历史归档可查趋势
- [x] typecheck + lint + 650 tests 全部通过；Review Gate 放行

### M4 阶段治理记录（2026-08-05 ~ 2026-08-06）

- **主交付**: T401-T404 四轮提交（cb801b60 / fedb7200 / 5860fb4d / 2a7fed00），T402/T404 首轮 REJECT 后修复复审 PASS，每任务独立 Review Gate
- **Action 接入（7c39db00）**: owner / repo-* / max-concurrency / max-retries 输入接线；建议每仓库单独配置 action 控制权限范围
- **backlog 修复批次（3d19d499 / ac8ce5c7）**: R1 写请求 429 不重试、R2 `--max-backoff-ms` 可配、R3 Retry-After 解析、R5 topics 大小写归一、R6 glob ReDoS 加固（>200 字符拒绝）、R7 损坏 index 备份重建；P3 五项（小数截断拒绝、merge 大小写去重、repoSlug 碰撞后缀、cleanup-branches 空归档跳过、cleanup-branches maxConcurrency fail-fast）
- **全 ESM（965e68f3）**: 两包单格式 esm（R4 消除），Node 22.12+ 原生 require(ESM) 兜底未来 CJS 消费者
- **增强候选批次**: C5+C1（12af197d，resolveWithinWorkDir 符号链接防护 + pnpm 11 overrides 假成功警告）、C10+C11（10927851，lockfile 告警版本关系细化 + workspace 成员直接依赖识别）、C8（67157985，per-source 错误隔离保留待评估）、C2+C6+C7（cf12e381，toolchainPnpmVersion 验证链 + PR body 64KB 截断 + alertsConverged 口径拆分）
- **编号标记清理（3c714cc1）**: 60 处编号标记清理 + development.md §3 立规（教训 §十六/§十七）
- **遗留登记（转入 backlog）**: C3/C4/C9/C13-C19 等增强候选

---

## M4.5: 跨线升级显式授权（已归档）

> 归档日期: 2026-08-07
> 阶段摘要: 参见 [roadmap.md §M4.5](roadmap.md)
> 状态: 已完成（含编号标记治理闭环）
> 最终提交: `528d1aae`（编号标记残留清理 + Review Gate 必查项）

**阶段成果**: `--allow-major-upgrade` 跨线告警显式授权自动升级（仅 CLI，无 env 通道、Action 结构性禁用）。720 tests。

### T405 实现 --allow-major-upgrade 跨线显式授权 ✅

- **交付物**: `packages/cli/src/app/index.ts` 2.0.2 跨线链路 + CLI 参数
- **实现内容**: 三态布尔 CLI 参数（无 env 通道；action.yml 不暴露 input → Action 结构性禁用）+ config 直通；跨线分流（仅根直接依赖 + lockfile 单版本进入自动跨线）；2.0.2 链路（快照 → upgradeDependency → **升级后实例复核** → **强制完整验证 install+lint+build** → 失败 restoreTrackedFiles 回滚）；同包多跨线告警按包聚合取最高目标；报告 `strategy='major-upgrade'` + `isMajor=true`
- **验收**: 默认行为与 PR #28 完全一致（跨线 skipped 不误标）；开启后仅根直接依赖单版本跨线自动升级；间接依赖/成员独占/多版本共存维持人工；dry-run 不写盘；验证动作入报告
- **Review Gate**: 首轮 REJECT（P1-1 实例残留误标 + P2-1 同包多告警目标选择 + P2-2 成员独占必然失败 + P2-3 验证证据缺失）→ 全部修复复审 PASS
- **残余风险登记（转入 backlog 跟踪）**: 理论降级边（跨线升级后仍可能被未来推荐版本降级？）/ 合并告警计数（同包多告警合并后 skipped/fixed 计数口径）/ node_modules 不回滚（回滚仅 manifest + lockfile，node_modules 残留旧包）/ 自定义 commands 时验证链为用户链（verifyCommands 自定义时完整验证语义由用户命令决定）
- **后续治理**: 用户指出编号标记问题（与 3c714cc1 同类）→ 528d1aae 清理 10 处残留 + code-auditor 必查项 + code-reviewer checklist（教训 §十五/§十六）

### M4.5 完成判定（全部通过）

- [x] `--allow-major-upgrade` 仅 CLI 可用（Action 结构性禁用）
- [x] 开启后仅「根 package.json 直接依赖 + lockfile 单版本」跨线自动升级
- [x] 升级后实例复核 + 强制完整验证，失败/残留回滚计 failed 不误标
- [x] 间接依赖 / 成员独占 / 多版本共存跨线维持人工
- [x] typecheck + lint + 720 tests + build 通过；Review Gate 复审 PASS

---

## M4.6: Monorepo 成员级修复增强（已归档）

> 归档日期: 2026-08-07
> 阶段摘要: 参见 [roadmap.md §M4.6](roadmap.md)
> 状态: 已完成
> 最终提交: `7fb264e3` feat(cli): 支持 workspace 成员级直接依赖自动升级

**阶段成果**: workspace 成员包直接依赖告警自动升级（成员级修复器 + 三桶化分流 + app 2.0.3 链路 + 报告/指纹 manifest 维度）。755 tests。

### 方案细化（2026-08-07 落盘，三项用户决策）

- **D1 修复器扩展**: `UpgradeDependencyParams.manifestDir?`（缺省 = 根 manifest 现状回归）；install 仍在根 workDir 执行（workspace 解析语义）；非 semver 声明 failResult
- **D2 快照扩展**: `snapshotTrackedFiles(workDir, extraPaths?)` 支持成员 manifest 相对路径
- **D3 partition 三桶化**: `{ root, member, sub }`——member 准入 = 成员白名单 + 成员直接声明 + fixable + lockfile 单版本 + 推荐>=锁定 + 非跨线
- **D4 app 2.0.3 链路**: 按「包名 + manifestDir」聚合取最高推荐 → 快照 → 升级 → 实例复核（残留回滚）→ **lint-only 验证**（用户决策 1）→ 失败回滚
- **D5 报告**: FixAction 复用 `filePath` + `strategy='member-upgrade'`（用户决策 3）；多版本共存成员告警维持 sub（用户决策 2）

### T406 成员级直接依赖升级修复器 ✅

- **交付物**: `packages/cli/src/fixers/dependency/index.ts` 扩展
- **实现内容**: `manifestDir` 参数（成员 manifest 解析 / 备份 / install 失败回滚成员 manifest + lockfile）；`isNonSemverDeclaration` 协议防护（workspace/catalog/link/file/npm/github/gitlab/bitbucket/gist/git+ssh/git+https/git+http/git+file/git/http/ssh/portal/patch 等，全集见源码正则）；`fromVersion/toVersion` 保留成员声明前缀
- **验收**: 根直接依赖行为零变化；成员升级成功 / install 失败回滚 / 非 semver failResult（不写盘、不触发 install）

### T407 成员告警分流与 app 接线 ✅

- **交付物**: partition 三桶化 + 快照扩展 + app 2.0.3 链路 + 报告渲染
- **实现内容**: `snapshotTrackedFiles(extraPaths)`；`partitionSubmanifestAlerts` 返回 `{ root, member, sub }`（member 桶准入见 D3）；app 2.0.3（聚合 / dry-run / 快照 / 实例复核 / lint-only / 回滚，残留回滚日志含"其他成员 pin / 根 override"归因）；markdown actionDetails filePath 展示 + PR body `member upgrade` 策略与成员路径列 + `computeFixFingerprint` 纳入 manifest 维度（防根/成员升级指纹碰撞）
- **验收**: 成员直接依赖安全场景自动升级且报告可见成员路径；降级风险 / 无版本信息 / 多版本共存 / 跨线维持人工；失败 / 残留回滚计 failed 不误标 fixed/converged

### M4.6 完成判定（全部通过）

- [x] T406/T407 交付并通过 Review Gate（三审 PASS）
- [x] typecheck + lint + 755 tests + build 通过
- [x] 根直接依赖行为回归无损
- [x] 方案细化三项决策已确认落盘

### M4.6 阶段治理记录（2026-08-07）

- **提交**: 立项（2607b665）+ 方案细化（c19bf091）+ 实现（7fb264e3）
- **Review Gate 三审**: 首轮 REJECT（P1-1 协议正则漏 git+ssh 等 / P2-1 PR 聚合丢成员路径 / P2-2 同包多成员 pin 复核互斥 / P2-3 todo 状态未同步）→ 修复复审 PASS（新增 P2-1 指纹未含 filePath / P2-2 正则漏 gitlab 变体）→ 修复终审 PASS
- **经验沉淀**: 归档 §十八（防护正则按全集核对 + 同类扫描）/ §十九（维度字段传播检查）/ §二十（断言精确到链路身份）/ §二十一（脚本化编辑验证文件内容）+ code-reviewer checklist 新增「协议/枚举全集核对」「维度字段传播检查」两小节
- **残余风险**: 成员验证 lint-only（演进项：成员独立 lint 脚本）；明细表 action 查找粒度；同包多成员精确 pin 场景需人工介入；`latest`/`*` 等 range 的 `^` 归约行为未纳入防护
- **遗留登记**: 无阻塞项，M5 可启动


## M5: AI Breaking Change 研判（已归档）

> 归档日期: 2026-08-07
> 阶段摘要: 参见 [roadmap.md §M5](roadmap.md)
> 状态: 已完成
> 最终提交: `61929613` fix(action): ai-api-key description 去除 secrets 表达式示例（CI 链式修复收口）

**阶段成果**: AI 对依赖升级 breaking change 的自动研判闭环——Changelog 双源采集 → 多 provider 研判 → 结构化 patch 应用 → 安全门 + 完整验证 → app 触发接线 + 报告 aiUsage 聚合。903 tests（38 files）。

### 规划决策（2026-08-07 已确认，用户确认内容）

- **D1 AI 提供商**: OpenAI 兼容端点优先 + Anthropic 双 provider（fetch 封装无 SDK；DeepSeek 等走 `--ai-base-url`；anthropic 模式支持 `--ai-api-url` 自定义兼容端点）
- **D2 触发时机**: 验证失败 + major 升级触发，`--ai-trigger` 可配（both / failure / major）
- **D3 Token 来源与凭据安全**: CLI `DEPENDFIX_AI_API_KEY` env（优先）/ `--ai-api-key`（泄露面文档警示）；action `ai-api-key` input（composite 不支持 `secret` 属性 → 经 env 传递自动打码）；apiKey 不落盘 + maskSecrets 脱敏 + action input 声明；M6 T602 统一凭据管理
- **D4 成本默认关闭 + token 消耗展示**: `--ai` opt-in；每次调用记录 usage（input/output tokens），聚合展示（日志每次调用 + 报告 aiUsage 段 + console run 总计 + 内置单价表标注"估算仅供参考"）

### T501 实现 Changelog / Release Notes 采集 ✅

- **交付物**: `packages/cli/src/ai/changelog-fetcher.ts`（npm registry packument → GitHub Releases 双源）
- **实现内容**: packument 解析 repository 字段 → octokit `repos.listReleases` 取 release body；breaking 段落启发式提取（Breaking changes / ⚠️ / Migration / BREAKING CHANGE）；run 内 Map 缓存（单测断言请求次数）；双源失败降级 null + 原因（不静默）
- **验收**: 双源失败降级路径可测试；缓存命中不重复请求

### T502 实现 AI 研判引擎 ✅

- **交付物**: `packages/cli/src/ai/`（provider / prompt / schema / usage / secrets）
- **实现内容**: `AiProvider` 接口 + `OpenAICompatibleProvider`（/chat/completions）+ `AnthropicProvider`（/v1/messages，x-api-key + anthropic-version header）+ factory；system prompt 硬编码（用户内容仅 data 注入，prompt 注入防护）；Zod 输出 schema（classification / summary / changes / confidence / rationale），校验失败重试 1 次 → 降级建议模式；usage 聚合 + 单价表成本估算；`maskSecrets` 脱敏（provider 层 + 编排层防御纵深）
- **验收**: 非法输出可检测不静默；apiKey 不进报告/日志（含响应体回显 key 场景）

### T503 实现修复方案生成器 ✅

- **交付物**: `packages/cli/src/ai/patch-applier.ts`
- **实现内容**: 结构化 changes 应用（search 精确匹配 + 唯一性校验 → 失败回退建议模式）；快照/回滚（snapshotTrackedFiles + 新文件登记）；version-lock → override 生成；wait-upstream → 说明文档
- **验收**: patch 应用成功/失败/冲突（search 不唯一）矩阵可测；失败可审计回退；默认不自动合并
- **承接登记**: PR 提交由 app 集成（T506）承接

### T504 AI 输出安全校验与质量门 ✅

- **交付物**: `packages/cli/src/ai/safety-gate.ts`
- **实现内容**: patch 范围限制（≤5 文件，超限拒绝可审计）；路径穿越（resolveWithinWorkDir）/ 命令注入（结构化数据不执行 shell，检查危险模式）/ 敏感信息泄露（sk- / ghp_ / private key 模式）检查；完整验证链（install+lint+build，对齐 T405 跨线语义）
- **验收**: 恶意/异常 patch 样本拒绝矩阵（安全单测）；失败回滚 + 记录原因回退建议模式
- **承接登记**: 质量门动态验证接线由 app 集成（T506）承接

### T505 CLI 解耦重构（平台化前置）✅

- **交付物**: `packages/cli/src/app/pipeline.ts`（`createPipeline(deps)` 抽象）
- **实现内容**: runCli() 中 process.env / console.log 紧耦合抽离为可注入依赖（logger / config resolver / io）；local 与 platform 模式共用同一编排核心；C13 循环依赖（app/helpers ↔ cli/helpers）解环
- **验收**: 本地 CLI 行为不变（全量回归）；platform 模式可注入不同 logger / config resolver 复用编排逻辑

### T506 AI 链路 app 接线（收口 M5）✅

- **交付物**: config 接线 + app 触发接入 + 报告展示 + action 输入
- **实现内容**: config（--ai / --ai-provider / --ai-model 默认 deepseek-v4-flash / --ai-base-url 默认 https://api.deepseek.com / --ai-api-key / --ai-trigger / --ai-api-url；开启时 apiKey 缺失 → CONFIG_VALIDATION_ERROR 清晰报错）；app 2.0.2 触发接入（验证失败带 failureLog / major 预防性；ai-patch 成功 → majorOk 升级保留；dry-run 不触发不产生费用）；`runAiIntegration` 分流闭环（code-change → safety-gate → applyChanges → 完整验证 → 回滚；version-lock / wait-upstream / 降级 → 建议 noOp）；计数语义（ai 辅助动作不计 fixed/failed，主动作代表；指纹排除 noOp 防漂移）；报告 aiUsage 聚合段（RunResult.aiUsage / Markdown AI Usage 节 / JSON / console run 总计）；action.yml ai 系列 inputs + DEPENDFIX_AI_* env（api-key 经 env 传递自动打码）
- **验收**: --ai 开启 + apiKey 配置后自动触发研判并产出可审计结果；code-change 通过质量门才提交；未开启 --ai 行为与现状完全一致（回归）；dry-run 不触发

### M5 完成判定（全部通过）

- [x] T501-T506 交付并通过 Review Gate（每任务独立审计，T503 三审 / 其余 PASS + 复审）
- [x] 4 项规划决策已确认落盘（2026-08-07）
- [x] `pnpm typecheck` + `pnpm lint` + 全量测试（903/903）+ `pnpm build` 通过
- [x] 本地 CLI 模式行为回归无损（T505 全量回归 + T506 回归断言）

### M5 阶段治理记录（2026-08-07）

- **提交序列**: T501（21c07b67）→ T502（3475e6e5）→ T503（f9affe5f）→ T504（31997adc）→ T505（e30f2a3e）→ flaky 修复（451cdcc5）→ T506 主实现（7509e3e2）+ 测试补充（9f62a34f）+ 状态回链（1db75efc）→ aiUsage 聚合段（a7530299）→ roadmap 锚点修复（ae93bd2a）→ action.yml manifest 修复（61929613）→ 经验沉淀 docs(governance)（a4dfd884）
- **Review Gate**: T501-T506 每任务独立审计 PASS；T503 三审（首轮 REJECT 写盘回滚/schema 契约/todo 状态 → 二轮 REJECT 编号标记 → 终审 PASS）；T506 复审 PASS（F1 指纹口径 / F2 场景 C exit 语义 / F3 todo 标注）；aiUsage 聚合段独立审查 PASS
- **CI 链式修复（剥洋葱）**: ① lint:md:check 穿透 node_modules（.lintmdrc 显式空排除覆盖工具默认）→ 修复；② check:links roadmap 锚点指向已归档标题 → 修复（改指 todo-archive）；③ Security Scan dogfood workflow 暴露 action.yml description 内嵌 <span v-pre>`${{ secrets.DEEPSEEK_API_KEY }}`</span> manifest 模板校验失败 → 修复。教训沉淀归档 §二十二 / §二十三
- **经验沉淀**: 归档 §二十二（CI 链式暴露 + 本地不可测陷阱）/ §二十三（行尾方向检测 + 特殊字符脚本写临时文件）；规范 ai-collaboration 4.2（剥洋葱）/ 4.3（本地不可测配置纪律）/ 1.2-6（行尾 + 脚本纪律）、documentation 链接检查（归档锚点联动）
- **残余风险**: AI 调用失败路径的 token 计费盲区（provider 响应无 usage）；本地无法完全模拟 CI 环境（依赖 CI 端到端裁决，推送后复跑）；10 个 lint warning 存量临界（max-warnings 顶格）
- **遗留登记**: 报告 aiUsage 聚合段已交付；PR body 展示 AI 消耗登记 M6 增强候选；无阻塞项，M5.5 可启动

---

## M5.5: Skill 编排（CLI 先行）（已归档）

> 归档日期: 2026-08-07
> 阶段摘要: 参见 [roadmap.md §M5.5](roadmap.md)
> 状态: 已完成
> 最终提交: `ba5be12b` refactor(skills): @dependfix/skills 包精简与同步脚本仓库化

**阶段成果**: 产品 skill（`dependfix-remediator`）权威源与 CLI 编排（T506）、npx skills 生态主通道 + 自研兜底安装器（T507）、MCP 双后端扩展点（T508）；`@dependfix/skills` 纳入发布与 CHANGELOG 体系。929 tests（38 files）。

> 编号说明：M5.5 T506-T508 与已归档 M5 的 T506 编号重叠，归档后仍以"阶段 + 编号"全称（如 M5.5 T506）区分。

### 规划决策（2026-08-07 用户确认）

- **D1 CLI 先行、MCP 为增强后端**: CLI 能力面（report/fix/fix-and-pr/cleanup-branches + 多仓库 + 双源 + PR 链路）已覆盖 MCP 规划的 4 个 tool（fetch_alerts / run_scan / fix_dependency / get_last_report）；skill 编排不依赖 MCP，MCP Server 本体随 M6 T605/T606 交付
- **D2 生态主通道**: `npx skills`（vercel-labs/skills）为主安装通道（发布 = git push 仓库根 `skills/` 目录）；自研 `dependfix skills install` 仅离线兜底
- **D3 内部 skill 防发现**: 10 个内部开发 skill 以 `metadata.internal: true` 标记（.github/skills 权威源），不进入生态正常发现（实测矩阵：正常 1 个产品 skill / `INSTALL_INTERNAL_SKILLS=1` 11 个）

### T506 产品 Skill 权威源与 CLI 编排 ✅

- **交付物**: `packages/skills/dependfix-remediator/`（SKILL.md + REFERENCES.md）+ 仓库根 `skills/` 分发目录（npx skills 生态发现）
- **实现内容**: SKILL.md（frontmatter `name`/`description` + 编排步骤 + 决策树）；执行后端 = CLI 命令映射表（report → `dependfix report-only`；fix → `dependfix fix` / `fix-and-pr`；告警查询 → `--history` / 归档）；能力契约解耦预留 MCP tool 映射位；skill 放置规范落盘（[skill-distribution.md](../design/governance/skill-distribution.md)：packages/skills 权威源 / 根 skills/ 生态分发 / .github/skills 内部开发，职责分离）
- **验收**: 本机冒烟通过（npx skills 生态发现 + 安装到 opencode 全局目录）；SKILL.md 无 MCP 依赖
- **Review Gate**: 两轮闭环 PASS

### T507 npx skills 生态接入 + 自研兜底安装器 ✅

- **交付物**: npx skills 主通道 + `dependfix skills install`（兜底）/ doctor + README 安装指引
- **实现内容**: 主通道本地源实证（`npx skills add <source> -s dependfix-remediator -g` 发现 + copied 安装，发布 = git push）；内部 skill 防发现（10 个 metadata.internal: true，可见性矩阵 1/11 实测）；兜底安装器（agent 目录约定检测 → 复制产品 skill → 安装清单；非 TTY 默认拒绝覆盖，--force 强制；幂等可重跑）；doctor（目录约定漂移 + 安装状态/内容一致性 + internal 标记完整性检查）
- **验收**: 兜底本机 3 agent 实测 installed/up-to-date + doctor 0 error；主通道与兜底均幂等可重跑
- **Review Gate**: 首轮 PASS + 复审
- **已知边界**: GitHub 源端到端（`npx skills add dependfix/dependfix`）待推送后 CI 复验（本机 clone github.com 网络受限）

### T508 MCP 双后端扩展点（衔接 T606/T706）✅

- **交付物**: SKILL.md MCP 探测与双后端指引 + REFERENCES.md 一致性断言清单
- **实现内容**: 执行后端探测步骤（Claude Code `claude mcp list` / `.mcp.json`，OpenCode mcp 字段 → MCP tool 优先 / CLI 回退 / MCP 调用失败降级 CLI）；能力契约映射表补齐 MCP tool 列（fetch_alerts / run_scan / fix_dependency / get_last_report 入参要点 + CLI 对应）；双后端一致性断言清单（以 @dependfix/core RunResult / ArchiveRunEntry 契约为基准，4 条能力逐项断言）
- **验收**: 探测/决策/降级规则落 SKILL.md；一致性断言清单已定义（MCP Server 交付后按清单验证，当前无法实测属已知边界）
- **Review Gate**: PASS

### M5.5 完成判定（全部通过）

- [x] T506-T508 交付并通过 Review Gate（每任务独立审计：T506 两轮闭环、T507 首轮 PASS+复审、T508 PASS）
- [x] npx skills 主通道 + 兜底安装器双路径验证通过（主通道本地源实证 + 兜底本机 3 agent 实测；GitHub 源端到端待推送后复验）
- [x] 内部开发 skill 生态不可见（可见性矩阵实测：正常 1 个 / INSTALL_INTERNAL_SKILLS=1 11 个）
- [x] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过（串行 929/929；并行 2 个已知 Windows flaky 与本次改动无关）
- [x] CLI 现状行为回归无损（主命令 positional 命令面 + --help 实测正常）

### M5.5 阶段治理记录（2026-08-07）

- **提交序列**: 规划决策（56a91446 + d177e3b3）→ T506（21fae4d4 + da7d4c95）→ T507（6f9e5eea + 480497b9 + ba5be12b）→ T508（1837f21e）→ 完成判定勾选（84809da4）→ 发布体系（24e5c097 + 1c5bc3c1）
- **Review Gate**: T506 两轮闭环 / T507 首轮 PASS + 复审 / T508 PASS
- **发布体系**: `@dependfix/skills` 纳入发布包清单与 CHANGELOG 体系（24e5c097，release.md 同步）；changeset 自动生成脚本（1c5bc3c1，semantic-release 规则从 git log 推导 bump 级别）
- **已知边界（归档时点）**: GitHub 源端到端复验（主通道 + 全链质量门）依赖 CI 端到端裁决（本地网络受限），推送后复跑确认
- **遗留登记**: MCP Server 本体（M6 T605/T606）；org 增强候选（C22-C24）；无阻塞项

---

## M6: 最小平台 MVP（已归档）

> 归档日期: 2026-08-08
> 阶段摘要: 参见 [roadmap.md §M6](roadmap.md)
> 状态: 已完成（T601-T605 + T607 全部完成；CI Test 端到端裁决通过；Docker 镜像构建 CI 链路未裁决通过，登记 backlog C30）
> 最终提交: `7cb1ad22d` docs(plan): 登记 C29 平台 UI 暗色模式待修复问题（含 M6 收尾修复批次 ec7221fd / 6cfbcb3c / 6edb4ac7）

**阶段成果**: 可独立部署的最小平台 MVP——Nuxt 4 全栈平台（仓库/凭据管理 + 同步扫描 + 仪表板 + 注册登录）+ `@dependfix/mcp` MCP Server（4 tool）+ 执行器设计与沙箱评估文档 + B 模式 Action 触发与结果回填。991 tests（CI Test workflow 实测）。

### 规划决策（2026-08-07 用户确认）

- **D1 执行深度（Q1）**：平台扫描以 A 模式（完整修复链路）为主——平台容器内置 git/node/pnpm 工具链，复用 `DependfixApp` 程序化接口完整执行；B 模式（触发目标仓库 GitHub Action）为降级
- **D2 执行模型（Q2）**：同步执行先行（请求内完成，前端 loading）；阻塞时间过长再演进后台异步（M7 T702 BullMQ 承接）
- **D3 MCP（Q3）**：保留在 M6（原 T605/T606 合并为本阶段 T605，容量约束"进一出一"，同为 `@dependfix/mcp` 交付物）
- **D4 沙箱（Q4=A）**：执行器抽象 + 容器内执行（平台 Docker 容器即沙箱）；独立沙箱容器 / GitHub Action 后端仅设计不实现
- **D5 Action 降级触发（Q5=B）**：平台对已配置 action 的仓库触发 `workflow_dispatch`（需 `actions: write`）；结果回填曾为已知边界 → M6 增强（C25）实现
- **D6 平台定位**：平台 = 触发器/调度器 + 结果展示（控制面）；修复执行（数据面）以 Executor 抽象隔离
- **D7 平台结构参考**：`apps/platform/` 对齐 momei 项目结构（Nuxt 全栈：`server/api` + `server/services` + `server/database` + better-auth + TypeORM + SQLite）

### T601 平台项目骨架搭建 ✅

- **交付物**: `apps/platform/` Nuxt 4 全栈项目 + Dockerfile + docker-compose.yml
- **实现内容**: Nuxt 4 初始化（TypeScript strict、`<script setup>`）+ PrimeVue 4 + `@primeuix/themes` + SCSS（BEM）+ 暗色模式 `.dark` 类；better-auth 集成（邮箱密码登录 + TypeORM Adapter + 会话持久化 30 天 + SMTP 未配置自动跳过邮箱验证 + `REGISTRATION_DISABLED` 关闭注册）；TypeORM + SQLite（`server/database/sqlite/`）；Dockerfile 多阶段 alpine（构建含 git/pnpm 工具链）；env 隔离约束（`PORT` 可配、DB 文件路径独立）
- **非目标**: 页面业务功能（T602-T604）、i18n / PWA / Sentry（M7）
- **验收**: 根 lint/typecheck 通过（含平台，CI 实测）；`pnpm dev` 注册登录闭环本地验证；docker compose 拉起依赖镜像构建（C30 观察）
- **Review Gate / 经验**: T601 单次大 diff 成本失控教训 → 长任务分批提交治理（a808b376 立规，经验归档 §二十四）

### T602 仓库与凭据管理 ✅

- **交付物**: Repository CRUD + Credential 加密存储 + Web UI
- **实现内容**: Repository 实体（owner/repo/platform/defaultBranch/packageManager/credentialId）+ CRUD API（Zod 校验）；Credential 实体（classic-pat / fine-grained-pat / github-app）+ AES-256-GCM 加密存储（`ENCRYPTION_KEY` 平台级密钥，解密仅在执行时 worker 内存中）；Dependabot alerts 读取必须显式凭据（G2 处置）；Web UI 仓库列表/添加/编辑/删除 + 凭据管理页
- **验收**: Web UI 增删改查闭环；DB 中 token 为密文（直查 sqlite 验证）+ 解密单元测试

### T603 扫描触发与结果存储 ✅

- **交付物**: ScanRun/ScanResult 持久化 + 同步扫描执行（ContainerExecutor）+ Web UI 触发与结果查看
- **实现内容**: ScanRun/ScanResult 实体（repoId/mode/severityThreshold/status/startedAt/finishedAt/summary）；Executor 抽象（T607 契约）——`ContainerExecutor`（默认，平台容器内置工具链，clone + 执行 `DependfixApp` + 结果回填）；同步执行模型（请求内执行，失败 → `failed`，原子写不写半截结果）；Web UI 触发单仓库扫描 + 结果/报告查看；同仓库扫描互斥锁（e1ef2a95，M6 轻量版，M7 T702 BullMQ 承接）
- **验收**: Web UI 触发扫描并查看结构化结果；结果持久化 SQLite 重启可查

### T604 仪表板与告警视图 ✅

- **交付物**: 仪表板 + 告警筛选视图 + 扫描历史
- **实现内容**: 仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描）+ 告警视图（按仓库/严重级别/来源筛选）+ 扫描历史列表与详情（仓库级扫描历史页 + 详情 Dialog）
- **非目标**: 趋势图表、通知（M7）、导出
- **验收**: 用户登录后可查看全局告警状态并筛选

### T605 MCP Server（原 T605 + T606 合并）✅

- **交付物**: `packages/mcp`（`@dependfix/mcp`）+ 4 个 tool + CLI 一致性断言
- **实现内容**: `packages/mcp` 初始化（tsdown 构建 ESM + CJS + dts）；集成 `@modelcontextprotocol/sdk`（stdio 传输）；`fetch_alerts`（只读，schema 见 [mcp-server.md](../design/governance/mcp-server.md)）/ `get_last_report`（只读）/ `run_scan`（写入，复用 `DependfixApp` 默认 report-only）/ `fix_dependency`（写入，复用 `overrideTransitiveDependency`）；MCP tool 与 CLI 输出一致性断言（fetch-alerts nock 一致性断言 4 用例）
- **非目标**: npm 发布与 skill 双后端集成（M7 T706）、多传输（http/SSE）
- **验收**: `npx @dependfix/mcp` 启动注册 4 个 tool（`dist/bin.mjs` 生成 + `createMcpServer` 冒烟测试）；一致性断言测试通过

### T607 执行器设计与沙箱评估（设计先行 + Action 触发实现）✅

- **交付物**: 执行器/沙箱设计文档 + `ActionTriggerExecutor` + B 模式接入评估结论
- **实现内容**: 设计文档（恶意依赖升级威胁建模 + 执行器方案矩阵 + Executor 接口契约）——见 [executor-sandbox.md](../design/governance/executor-sandbox.md)；`ActionTriggerExecutor`（对配置 action 的仓库触发 `workflow_dispatch`，凭据复用仓库关联 Credential，workflow 文件名仓库配置声明）；B 模式接入评估（使用方式/体验/成本写入设计文档 §5）；mcp-server.md 里程碑编号修正
- **非目标**: 独立沙箱容器执行实现（M7）、action 结果回填（M6 内由 C25 增强实现）
- **验收**: 设计文档 Review Gate 通过；平台可触发 `workflow_dispatch` 并返回触发结果；B 模式接入成本评估结论落盘

### M6 完成判定（全部通过）

- [x] T601-T605 + T607 全部交付并通过 Review Gate（M6 终审 deep Review Gate，warning 3/4 处置见 C27/C28）
- [x] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过（CI Test workflow 实测 991 passed；本地串行验证）
- [x] `docker compose` 部署链路可构建（镜像构建 CI 端到端未裁决，登记 C30）
- [x] MCP tool 注册冒烟 + CLI 一致性断言通过
- [x] 沙箱设计文档 Review Gate + `workflow_dispatch` 触发实测

### M6 阶段治理记录（2026-08-07 ~ 2026-08-08）

- **提交序列**: M6 规划（681efec5）→ T601（48f9c7eb）→ **T607 设计文档（56b0e518，设计先行于 T602）** → T602（85aca268）→ ActionTriggerExecutor（1c7cdb90）→ T603（3d645b54 数据层 / 209bc48c 执行链路 / 98b3f4ab 前端）→ T604（506dd7c9 API / 2cb941e3 UI）→ T605（014f6d2c + 69f32796）→ server 别名（fb62e259）→ 完成标记（1d2ff14b）→ 发布包清单单点化（83edffc5）+ 经验归档 §二十五（89a2f142）→ REGISTRATION_DISABLED（9a4309cb）→ backlog 登记 C27/C28（216b00cb）→ C25 结果回填（17c5082f + 60d9fd6e 修复）→ 互斥锁（e1ef2a95）→ CI 链式修复（6b41556e / fcc161b4 / e16aeda4）→ **交付后收尾批次**（ec7221fd repositoryUpdateSchema partial 崩溃修复 / 6cfbcb3c platform lint 脚本与 vue 格式 / 6edb4ac7 dashboard stats findOne 缺 where 条件修复 / 7cb1ad22d 登记 C29 平台 UI 暗色模式待修复）
- **Review Gate**: 每任务独立审计 + M6 终审 deep Review Gate（warning：W3 C27 runUrl 状态语义 → 随 C25 实现联动闭环；W4 C28 security.md 凭据加密章节 → 登记 backlog 待评估）
- **M6 增强批次**: C25 B 模式结果回填（`ActionResultFetcher`：轮询 run 完成 → 下载 `dependfix-report-{runId}` artifact → 解析 JSON 落库；orchestrator 三分支 completed/dispatched/failed）；同仓库互斥锁（withRepoLock，进程内 FIFO）；REGISTRATION_DISABLED
- **发布体系**: `@dependfix/mcp` 纳入发布包清单（发布包清单单点化 refactor）
- **CI 端到端裁决（2026-08-08 推送后）**: Test workflow ✅（lint + lint:md + typecheck + 991 tests + nuxt prepare + workspace 预构建）；CodeQL ×2 ✅；Pages ✅；Publish Docker ❌（QA ✅；build 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 的 concurrency cancel-in-progress 取消，登记 C30，根因已定位）
- **经验沉淀**: 归档 §二十四（单次大 diff 成本失控：长任务分批提交）/ §二十五（新增发布包散落遗漏：包清单单点声明）；规范 a808b376（任务粒度约束与提交规模上限）
- **已知边界（归档时点）**: Docker 镜像构建 CI 链路未裁决（C30）；M5.5 GitHub 源端到端复验仍依赖后续 CI 运行；security.md 凭据加密章节待补（C28）；平台 UI 暗色模式不可用待修复（C29）
- **遗留登记（转入 backlog）**: C26（独立沙箱容器实现，M7 候选）、C28（security.md 凭据章节）、C29（平台 UI 暗色模式）、C30（Docker CI build 取消排查）；M7 T701-T706

---

## M7.1: 认证与用户体系（已归档）

> 归档日期: 2026-08-10（T701/T707 代码交付完成，**剩余 3 项真实凭据人工验收**见下方「遗留登记」）
> 阶段摘要: 参见 [roadmap.md §M7](roadmap.md)
> 设计文档: [platform-auth-users.md](../design/governance/platform-auth-users.md)（Review Gate 两轮 Pass）

### T701 RBAC 权限管理 + 用户管理 + 个人界面 ✅

- **交付物**: 角色权限系统 + 用户管理界面 + 个人设置界面
- **实现内容**: 子任务 1（数据层）：单组织归属（Organization 实体 + Repository/Credential.organizationId + 默认组织初始化 + 存量迁移）+ 角色模型（admin/org_admin/viewer 三角色）+ better-auth admin 插件 + 角色迁移 + guard 扩展（requireRole/requireOrgResource）；子任务 2（管理 UI）：用户列表/搜索/启用禁用/角色分配 + 页面守卫；子任务 3（个人界面）：资料/密码/邮箱/绑定账号/语言偏好占位
- **非目标**: 审计日志、邀请注册（backlog）、T707 第三方登录、repo_admin/username/多租户（backlog，决策 D1/D2/D3）
- **验收**: 权限矩阵 guard 11 例 + 浏览器验证 8/8 + organization.test.ts 8 例（存量填充/幂等/并发安全）+ 写操作收紧 admin/org_admin 披露
- **提交**: 5811e524 + 8d515aa8 + 2c2620e6 + dc712df1 + ce36ec37 + a115e351 + 781d3fa5 + 3cc58165 + 08a68315（含平台增强：仓库批量导入 85c6988d + e2e 基建 432c59a1）
- **Review Gate**: 子任务独立审计 + T701 收口审计 Pass（W1 注释编号清理后复审通过）

### T707 认证扩展：OIDC SSO / GitHub·Google OAuth / 邮箱域名黑白名单 ✅（代码交付，3 项人工验收待办）

- **交付物**: 多登录方式 + 部署模式互斥配置 + 注册准入控制
- **实现内容**:
  - 子任务 1（部署模式与准入）：`AUTH_MODE=enterprise|public` 互斥（启动校验非法值拒绝）；注册准入 `user.create.before` hook 单一准入点（REGISTRATION_DISABLED 总开关 + email 缺失 fail-closed + 域名白名单/黑名单）；首用户 admin 短路优先（决策点 11）；`disableSignUp` 不合并 enterprise 空白名单（P1 死锁修复：端点级拦截阻断首用户 bootstrap）
  - 子任务 2（OAuth）：GitHub/Google `socialProviders` 条件化（凭据齐全才启用）；登录页按钮（`resolveSocialProviders` 纯函数 6 例单测）；可用性布尔仅根级 env（前后端通道一致）
  - 子任务 3（OIDC SSO）：`genericOAuth` 插件条件化（discoveryUrl/issuer 二选一 + 手动端点覆盖 + `requireIssuerValidation: true` RFC 9207 防护）；`genericOAuthClient()` 客户端注册；enterprise 登录页按钮
- **决策**: D1 部署模式互斥（enterprise 白名单 / public 黑名单）；决策点 6 修订（enterprise 白名单空 = 完全关闭自动开通）；决策点 11 新增（首用户 admin 优先于准入检查）——2026-08-10 用户确认
- **验收**: 单测 92/92（email-domain 11 + auth-access 集成 10 + social-providers 6）+ e2e 22 用例 + ui-validator 视觉 8/8 + lint/typecheck/build；「未配置登录方式自动隐藏」与「单测/e2e 覆盖项」勾选完成
- **提交**: bd6e9ffc（T707-1）+ 56e56f95（T707-2）+ 6f4b7d1f（T707-3）+ 25ac7540（状态同步）
- **Review Gate**: T707-1 双轮（首轮 REJECT P1 死锁 + P2×3/P3×5 → 修复后复审 APPROVE）；T707-2/3 各 APPROVE
- **遗留登记（待人工验收，真实凭据）**: ① 真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）；② 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持的 IdP）；③ 构建期配置凭据后按钮显示路径实测
