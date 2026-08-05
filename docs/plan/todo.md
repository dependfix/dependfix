# 当前阶段任务（M3）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）已完成，归档见 [todo-archive.md](todo-archive.md)。
> M4 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M3: Code Scanning 扩展

**目标**: 接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

**前置（已解除）**: T-G2-2（2026-08-04 探针验证）——Code Scanning alerts 对 GITHUB_TOKEN 可访问（HTTP 200，`security-events: read` 即可），**M3 无需额外 token 方案**；仅 Dependabot alerts 需要 PAT / GitHub App token（G2 已处置闭环）。

**设计要点（实现前确认）**:
- **数据源并行而非回退**：M3 的 Code Scanning 与 Dependabot 是**并行源**（`fetchAlerts` 扩展为组合获取），区别于 `pnpm-audit` 的互斥回退；`AlertSource` 枚举已含 `'code-scanning'`，`SEVERITY_MAP` 已有 error/warning/note → high/medium/low 映射
- **现状复用**：`packages/cli/src/fixers/code-scanning/index.ts` 已有 stub（M0 遗留）、core `AlertSeverity` 含 `'unknown'` 位
- **报告列语义**：§4 Repositories 的 GHSA 列对 code-scanning 显示的是 `ruleId`（如 `js-sqli`），M3 落地时顺手将列名改为语义化的 "Rule/Advisory"（Review Gate 遗留 P3）

### 建议执行顺序

```
T301（采集器）→ T302（规则分层）→ T303（模板修复器）→ T304（建议输出）
                                      ↘
                          T305（工具链固定 G1，P2 可并行）
```

---

### T301 接入 Code Scanning Alerts 拉取

- **优先级**: P1
- **依赖**: T102（GitHub client）、T004（标准告警模型）；前置 T-G2-2 已完成
- **状态**: ✅ 已完成（2026-08-05，待提交）
- **交付物**: `packages/cli/src/github/code-scanning-fetcher.ts`（参照 dependabot-fetcher 模式）

**任务内容**:

- [x] 拉取 open 状态 Code Scanning 告警（`GET /repos/{owner}/{repo}/code-scanning/alerts`，octokit.paginate 分页）
- [x] 转换为标准告警模型：`source: 'code-scanning'`、`ruleId`（rule.id）、severity 走 `mapCodeScanningSeverity`（`security_severity_level` 优先，缺失时 rule.severity 映射）
- [x] fixable 语义：Code Scanning 告警默认**不可自动修复**（`fixable: false`、`fixStrategy: null`），修复能力由 T303 规则模板按规则启用
- [x] 报告中可展示 Code Scanning 告警（与 Dependabot 并行，§4 表 Rule/Advisory 列）

**完成定义**:

- [x] report-only / fix 模式下 Dependabot 与 Code Scanning 告警并行展示、互不覆盖
- [x] 拉取失败（401/403）沿用 T-G2-1 硬失败语义 + hint

**演进选项（Review Gate 遗留，非阻塞）**:
- per-source 错误隔离：并行源任一失败目前整体硬失败（已拉取的 Dependabot 结果会丢失）；演进为 warn + 仅弃该源（需确认语义，暂缓）
- fix 模式下 code-scanning 告警（manifestPath 非根）经 partitionSubmanifestAlerts 计为 skipped——语义正确，但统计口径与 G3 alertsConverged 一并处理

---

### T302 规则分层与白名单机制

- **优先级**: P1
- **依赖**: T301
- **状态**: ✅ 已完成（2026-08-05，待提交）
- **交付物**: `packages/cli/src/code-scanning/rule-classifier.ts`（规则分类策略）

**任务内容**:

- [x] 定义 A/B/C 三类规则分层：A=自动修复白名单 / B=建议修复 / C=仅报告
- [x] 建立自动修复白名单（当前：`eol-last`；`no-unused-vars` 因删除变量可能有副作用归 B 类——Review Gate 认可偏离；`jsdoc/check-alignment` 模板未实现、`no-trailing-spaces` 模板字符串词法歧义无法保证不改变运行时值——均不列入，详见 T303 历史决策）
- [x] 建立仅建议输出的规则列表（CodeQL js/py/java 安全类 + no-unused-vars）
- [x] 规则分类可配置（常量表 + 注释声明 M4+ 配置化扩展点）

**完成定义**:

- [x] 系统能区分"自动修复""建议修复""仅报告"三类，且分类结果在报告中可见（§4 Class 列 A/B/C）

**Review Gate 遗留（非阻塞）**:
- B 类列表覆盖 js/py/java 精选集，其余语言（go/ruby/csharp/cpp）落 C 兜底；真实仓库 API 样本核对 rule id 格式与变体分布登记为演进项
- ~~no-trailing-spaces 模板字符串例外~~（已关闭：T303 评审移除该模板，M4+ 引入词法扫描后再评估恢复）

---

### T303 实现可模板化规则修复器

- **优先级**: P1
- **依赖**: T302、T107（验证执行器）
- **状态**: ✅ 已完成（2026-08-05，待提交）
- **交付物**: `packages/cli/src/fixers/code-scanning/` 首批修复模板（替换 M0 stub）

**任务内容**:

- [x] 选择一组低风险规则作为首批支持对象（A 类白名单子集：`eol-last`；`no-trailing-spaces` 经 3 轮 Review Gate 因模板字符串词法歧义移除——无解析器无法保证"不改变运行时字符串值"红线，M4+ 引入词法扫描后再评估）
- [x] 实现补丁生成与验证（复用 verification-runner；`FixAction.type` 扩展 `'code-scanning-fix'` 承载修复记录，含 noOp 三态语义）
- [x] 失败时回退到建议模式（不静默、可审计：noOp 动作 + error 原因，Fix Actions 表可见）

**完成定义**:

- [x] 至少一类 Code Scanning 问题可完成自动修复闭环（eol-last：修复 → quickVerify 验证 → 报告/PR）

**Review Gate 遗留（非阻塞）**:
- app 层非 dry-run 验证/回滚路径缺 e2e（组件单测已兜底；真实 lint 环境依赖 CI）
- 多 cs 告警时逐告警全项目 lint（性能观察项，可合并验证）
- 报告 Fix Actions 表 noOp 动作显示 ✅ 图标（观感，error 文本可审计）

---

### T304 实现建议型输出

- **优先级**: P1
- **依赖**: T301、T302、T108（报告）
- **状态**: ✅ 已完成（2026-08-05，待提交）
- **交付物**: Code Scanning 修复建议报告（报告 §Code Scanning Suggestions 区块 + PR body 区块）

**任务内容**:

- [x] 输出规则 ID、位置（文件:行）、摘要、建议修复方向（fetcher 注入 suggestionFor，core 模型扩展 startLine/endLine/suggestion）
- [x] 区分未自动修复原因（B/C 类规则 / noOp / 修复失败，reason 优先级链）
- [x] PR body 中展示 Code Scanning 建议（fix-and-pr 模式，generatePRBody 区块）

**完成定义**:

- [x] 无法自动修复的问题不会静默丢失（报告 §Code Scanning Suggestions 明确可见 + 原因标注）

**Review Gate 遗留（非阻塞）**:
- summary 字段已收集未渲染（JSON 可见；报告/PR body 如需摘要列可加）
- endLine 死字段（供后续多行范围展示）
- 大仓库建议区块行数可能使 PR body 接近 GitHub 64KB 上限（告警级输出无上限）

---

### T305 工具链固定（G1 承接）

- **优先级**: P2
- **依赖**: 无（独立于 T301-T304，可并行）
- **状态**: ✅ 已完成（2026-08-05，待提交）
- **交付物**: `packages/cli/src/fixers/pnpm/index.ts` 的 PIN_TOOLCHAIN 策略接线 + config 输入

**任务内容**:

- [x] config 新增 `toolchainPnpmVersion`（`--toolchain-pnpm-version` / env `AUTO_FIX_GITHUB_SECURITY_TOOLCHAIN_PNPM_VERSION`，缺省从 packageManager 解析；semver 白名单校验防命令注入——Review Gate P1）
- [x] `repairLockfile` 接收 toolchain 并传入策略命令；`getStrategyCommand('PIN_TOOLCHAIN')` 改用 `corepack pnpm@<version> install --lockfile-only`（corepack 不可用/下载失败 → 降级为裸命令，靠策略链 REGENERATE 兜底）
- [x] `tryLockfileRepair` 传递 toolchain；激活 `resolvePnpmVersion`（原死代码）
- [x] 修复成功后校验 lockfile 格式与声明版本一致（lockfileVersion 前后对比 + lockfileVersionChanged 标注——防格式漂移，wisdom 记录 pnpm v11 overrides 迁移教训）
- [x] 测试：corepack 成功 / corepack 缺失降级 / packageManager 解析 / config 解析 / 注入拒绝（+12）

**完成定义**:

- [x] LOCKFILE_VERSION_MISMATCH 场景用声明版本 pnpm 重生成 lockfile（不再是"与 REGENERATE 相同"的 stub）
- [x] corepack 不可用时行为不劣于现状（REGENERATE/REINSTALL 兜底）

**Review Gate 遗留（非阻塞）**:
- verifyFrozenLockfile 仍用裸 pnpm 验证，可能架空 PIN_TOOLCHAIN 固定版本（旧版 runner 场景；建议后续 verify 与策略同版本）
- 漂移检测为相对对比（before/after），非严格"声明版本一致性"校验（弱代理）

---

## M3 完成判定

- [x] report-only / fix 模式并行展示 Dependabot + Code Scanning 告警（Rule/Advisory 列语义化）
- [x] A/B/C 三层规则分类落地：自动修复 / 建议修复 / 仅报告
- [x] 至少一类 Code Scanning 问题自动修复闭环（T303，eol-last）
- [x] 无法自动修复的问题不静默丢失（T304，报告 + PR body 建议区块）
- [x] G1 工具链固定落地（T305，PIN_TOOLCHAIN + corepack + 漂移检测）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过；Review Gate 放行

**M3 完成记录（2026-08-05）**: T301~T305 全部完成，5 轮提交（7b8feb3 / 5b3e076 / aebf258+a7fa3a0 / dead17e / 486fea7），每任务独立 Review Gate（T303 经历 4 轮、T305 经历 2 轮），最终全量审查 APPROVE。

**M3 收尾审查遗留（2026-08-05 已按用户确认全部修复）**:
- ✅ PR 标题口径：cs-only 修复不再误标 "N upgrades"——buildPrTitle 按动作构成动态生成（upgrades / code fixes / 中性标题），lockfile-only 不再 "0 upgrades"
- ✅ partitionSubmanifestAlerts 对 code-scanning 告警的 skip 计数噪音——partition 限定依赖源告警（source !== 'code-scanning'）
- ✅ 'unknown' 严重级静默滤除——code-scanning 源 unknown 恒透传（Dependabot/pnpm-audit 维持过滤语义）
- ✅ report-only 模式 A 类规则建议原因措辞——按 mode 区分（"report-only 模式不执行修复" vs "异常路径"）
- ✅ maxAlertsPerRepository 截断明细不进报告——RunSummary.alertsTruncated + Summary 表行
- ✅ app/index.ts 行数逼近上限——拆分 runCodeScanningFixes（helpers.ts）+ 分支清理家族独立模块 branch-cleanup.ts（helpers re-export 保持兼容）

**M4/backlog 仍登记**:
- verifyFrozenLockfile 仍用裸 pnpm 验证，可能架空 PIN_TOOLCHAIN 固定版本（建议 verify 与策略同版本）
- 漂移检测为相对对比（before/after），非严格"声明版本一致性"校验（弱代理）
- resolveWithinWorkDir 未处理符号链接逃逸（攻击者可控 repo 内容场景）
- 大仓库建议区块行数可能使 PR body 接近 GitHub 64KB 上限
- app/helpers.ts ↔ cli/helpers/index.ts 值级循环依赖（quickVerifyProject ↔ validateVerifyCommands，运行时安全，收尾修复引入反向边——建议 M4 下沉公共层或回调注入）

---

## 已知缺口登记

### G1 PIN_TOOLCHAIN 策略未真正固定 pnpm 版本

- **状态**: ✅ 已闭环（2026-08-05，T305 完成）
- **位置**: `packages/cli/src/fixers/pnpm/index.ts`
- **问题**: `RepairLockfileParams.toolchain`（`toolchain.pnpmVersion`）虽被接受并文档声明"优先于 packageManager"，但 `repairLockfile()` 内部从未调用 `resolvePnpmVersion()`，`PIN_TOOLCHAIN` 策略命令与 `REGENERATE` 完全相同（`pnpm install --lockfile-only`），未按 toolchain 固定版本执行
- **处置**: T305 完成——resolvePnpmVersion 激活（toolchain > packageManager，semver 白名单校验）；PIN_TOOLCHAIN 改用 `corepack pnpm@<version> install --lockfile-only`（corepack 失败 → 裸命令 → REGENERATE 兜底）；lockfileVersion 前后对比漂移标注；config/CLI/env 输入齐备（`toolchainPnpmVersion`）

---

## 已完成登记：M2 阶段治理（2026-08-04 ~ 2026-08-05）

### G2 GITHUB_TOKEN 无法访问 Dependabot alerts API（产品设计级限制）——已闭环

- **结论**: 本质是故意设计（`vulnerability-alerts` 为 GitHub App-only 权限）+ 官方文档缺陷；处置任务 T-G2-1~5 全部完成（fetch 硬失败 / Code Scanning 探针验证 / 双 token 方案 / pnpm audit fallback / 规划文档闭环），详细记录已随 M2 归档至 [todo-archive.md §M2](todo-archive.md#m2-github-action-接入已归档)

### G3 overrides 覆盖策略——已处理 + 遗留观察

- **已落地**: 同包收敛 / 不降级保护 / 逐包验证回滚 / 分组升级（T213）/ manifest 归属防护 / pnpm v11 lockfile 解析（P1）
- **遗留观察点**（不阻塞，随运行反馈再评估）:
  - major overrides 确认机制：暂不实现自动拦截（评估 2026-08-05，逐包验证+回滚已兜底）
  - 报告统计口径：`alertsSkipped` 混合多种语义，需独立字段（如 alertsConverged）
  - 根直接依赖 + lockfile manifest 告警一律跳过有覆盖损失（可细化为"推荐版本 < 根锁定版本才跳过"）
  - monorepo 成员包直接依赖盲区（isRootDirectDependency 仅读根 package.json）
  - pnpm catalog 依赖的 override 行为未实测
