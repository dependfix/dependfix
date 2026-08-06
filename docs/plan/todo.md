# 当前阶段任务（M4.6）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M4（多仓库治理增强）已完成（2026-08-06）**：T401-T404 全部交付并通过 Review Gate（提交 cb801b60 / fedb7200 / 5860fb4d / 2a7fed00），全量质量门（typecheck + lint + build + 650 tests）通过。
> **M4.5（跨线升级显式授权）已完成（2026-08-07）**：T405 `--allow-major-upgrade` 交付（提交 edfb9e07），Review Gate 首轮 REJECT 修复后复审 PASS；随后清理编号标记残留并纳入 Review Gate 必查项（提交 528d1aae）。全量质量门（typecheck + lint + build + 720 tests）通过。
> **M4.6（Monorepo 成员级修复增强）为本期任务（2026-08-07 立项，用户决策：完成后再推进 M5）**：T406/T407 详见下文。
> M5 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M4.5: 跨线升级显式授权（T405）

**目标**: 当告警推荐版本跨大版本（当前线内无修复版本，PR #28 场景）时，用户通过 CLI 显式参数授权后，对可安全自动处理的跨线告警执行"跨线升级 → 强制完整验证 → 失败回滚"。默认行为不变（跨线告警维持 skipped + 人工）。

### T405 实现 `--allow-major-upgrade` 跨线显式授权

- **优先级**: P1
- **依赖**: PR #28 复盘结论（跨线告警剔除逻辑）、T105（upgradeDependency）、T107（verifyProject）
- **状态**: 已完成（2026-08-07，提交后回链）
- **交付物**: `packages/cli/src/app/index.ts` 2.0.2 跨线链路 + CLI 参数

**任务内容**:

- [x] `--allow-major-upgrade` CLI 三态布尔参数（**无 env 通道**；action.yml 不暴露 input → Action 结构性禁用）
- [x] config 层：`RuntimeConfig.allowMajorUpgrade`（默认 false）+ `CliConfigOverrides` + resolve 直通；`readEnvConfig` 刻意不读取
- [x] helpers 导出 `isRootDirectDependency`（根声明判定，与修复器能力对齐）
- [x] app 层跨线分流：开启时仅「根直接依赖 + lockfile 单版本」进入 2.0.2；workspace 成员独占声明 / 间接依赖 / 多版本共存维持 skipped + warn（现状回归）
- [x] 2.0.2 跨线链路：快照 → upgradeDependency（改根声明）→ **升级后实例复核**（残留脆弱实例回滚，Review Gate P1-1）→ **强制完整验证**（install+lint+build）→ 失败 restoreTrackedFiles 回滚 → failed；成功 fixed（不误标纪律）；验证动作入报告（P2-3）
- [x] 同包多跨线告警按包聚合取最高目标（P2-1）；PR body strategy 列映射 major-upgrade（P3）
- [x] 报告：`FixAction.strategy='major-upgrade'` + `isMajor=true`（PR body ⚠️ Major 标记天然生效）

**完成定义**:

- [x] 未开启时行为与 PR #28 完全一致（跨线告警 skipped，不误标 fixed/converged）——现状回归测试
- [x] 开启后：根直接依赖单版本跨线自动升级 + 实例复核 + 强制完整验证；残留脆弱实例回滚不标 fixed（workspace 成员/传递依赖 pin 场景）
- [x] 间接依赖 / 成员独占 / 多版本共存仍人工（skipped + warn）
- [x] 验证失败 / 实例残留回滚（manifest + lockfile 恢复），计 failed 而非 fixed
- [x] dry-run 记录计划动作不写盘
- [x] Action 无法启用（无 input、无 env 通道）
- [x] 文档告知风险：API 破坏面 / 验证耗时 / 回滚边界 / 语义变化 / 实例残留（quick-start.md 风险章节）

**非目标**: 间接依赖跨线自动升级（保守范围）；workspace 成员独占声明跨线（修复器仅改根 manifest）；多版本共存跨线自动升级（overrides 技术限制）；C12 major overrides 拦截确认机制（仍不实现）

**测试方案**: config 三态 + env 无通道守卫 + CLI 解析；app 集成 10 例（默认回归 / 直接依赖升级 / 验证失败回滚 / 实例残留回滚 / 同包多告警取最高 / 间接依赖人工 / 成员独占人工 / 多版本共存人工 / dry-run / 验证动作可审计） ✅

> **Review Gate**: 首轮 REJECT（P1-1 实例残留误标 + P2-1 同包多告警目标选择 + P2-2 成员独占必然失败 + P2-3 验证证据缺失），已按复查基线修复（实例复核回滚、包级最高目标聚合、根声明准入、验证动作入报告）。复审：核心 4 项确认修复，P2 文本措辞残留（4 处"根/workspace"旧语义）已统一为"根 package.json 直接依赖"。**PASS（2026-08-07，T405-5）**，残余风险登记（理论降级边 / 合并告警计数 / node_modules 不回滚 / 自定义 commands 时验证链为用户链）。

## M4.5 完成判定

- [x] `--allow-major-upgrade` 仅 CLI 可用（无 env 通道、action.yml 不暴露 input → Action 结构性禁用）
- [x] 开启后仅「根 package.json 直接依赖 + lockfile 单版本」跨线自动升级；默认行为与 PR #28 完全一致（现状回归测试）
- [x] 升级后实例复核 + 强制完整验证（install+lint+build），失败/残留自动回滚计 failed，不误标 fixed/converged
- [x] 间接依赖 / 成员独占 / 多版本共存跨线维持人工（skipped + warn）
- [x] `pnpm typecheck` + `pnpm lint` + 720 tests + `pnpm build` 全部通过；Review Gate 复审 PASS
- [x] 编号标记清理 + Review Gate 必查项落地（528d1aae），经验归档 §十五/§十六

> **M4.5 交付说明（2026-08-07）**：T405 跨线显式授权（edfb9e07）——CLI 参数 + config（无 env 通道）+ 跨线分流（根声明准入）+ 2.0.2 链路（实例复核 + 完整验证 + 回滚）+ 10 集成测试；Review Gate 首轮 REJECT 4 项（P1-1 实例残留误标、P2-1 同包多告警目标选择、P2-2 成员独占必然失败、P2-3 验证证据缺失）全部修复后复审 PASS。随后用户指出 T405 引入与 3c714cc1 同类的编号标记问题 → 528d1aae 清理 10 处残留（8 处本次 + 2 处既有），并将"开发流程编号标记检查"纳入 code-auditor 必查项与 code-reviewer checklist；经验归档新增 §十五（跨线升级假设教训）与 §十六（规范存在 ≠ 被执行）。

---

## M4.6: Monorepo 成员级修复增强（T406/T407）

**目标**: 打通 workspace 成员包直接依赖告警的自动修复链路。当前 `manifest_path = packages/x/package.json`（成员直接依赖，如 `packages/web` 中的 vite）一律归 sub 人工处理（修复器 `upgradeDependency` 仅改根 manifest）；本阶段为成员 manifest 提供与根对齐的升级能力。**本阶段完成后推进 M5**（2026-08-07 用户决策）。

**方案细化（2026-08-07 落盘，用户确认三项决策）**:

- **D1 修复器扩展**：`UpgradeDependencyParams` 新增 `manifestDir?: string`（相对 workDir 的成员目录，缺省 = 根 manifest，现状回归）；`pkgPath` 解析到成员 manifest，`findDependencyVersion` 三段匹配不变；**install 仍在根 workDir 执行**（workspace 解析语义）；非 semver 声明（`workspace:` / `catalog:` / `link:` 等）→ 明确 failResult 计 failed
- **D2 快照扩展**：`snapshotTrackedFiles(workDir, extraPaths?)` 支持额外相对路径（key = 相对路径，如 `packages/web/package.json`），默认根三件套行为不变；`restoreTrackedFiles` 签名同步（相对路径 key join workDir 恢复）
- **D3 partition 三桶化**：`partitionSubmanifestAlerts` 返回 `{ root, member: { alert, manifestDir }[], sub }`——member 桶准入（全部满足）：manifestPath 目录 ∈ `findWorkspaceMembers` 白名单（防路径穿越）+ 包在成员 manifest 直接声明 + lockfile **单版本**且**推荐 ≥ 锁定** + **非跨线**；其余（推荐 < 锁定 / 无版本信息 / 多版本共存 / 跨线 / 非成员路径）维持 sub
- **D4 app 2.0.3 链路**：按「包名 + manifestDir」聚合取最高推荐（镜像 dedupeFixableAlerts）→ dry-run 记录（strategy='member-upgrade'）→ 快照（根三件套 + 成员 manifest）→ `upgradeDependency({ manifestDir })` → **升级后实例复核**（lockfile 残留脆弱实例 → 回滚 + failed，T405 纪律；覆盖根全局 override 冲突场景）→ **quickVerify（lint-only，与 2.0 常规升级一致——用户确认决策 1，跨线才需完整验证）** → 失败回滚 → 成功 fixed
- **D5 报告**：FixAction **复用 `filePath`**（成员 manifest 相对路径）+ `strategy='member-upgrade'`，不新增字段（用户确认决策 3）；T407 确认 markdown-generator / PR body 对 `filePath` 的渲染（code-scanning 已渲染则直接复用）
- **决策 2（用户确认）**：多版本共存成员告警维持 sub 人工，不纳入成员链路

### T406 成员级直接依赖升级修复器

- **优先级**: P1
- **依赖**: T105（upgradeDependency）、C11（workspace 成员识别）
- **状态**: 未开始
- **交付物**: `packages/cli/src/fixers/dependency/index.ts` 扩展（支持成员 manifest 路径）

**任务内容**:

- [ ] `UpgradeDependencyParams` 新增 `manifestDir?: string`；`upgradeDependency` 按 `join(workDir, manifestDir ?? '.', 'package.json')` 解析目标 manifest（缺省 = 根，现状回归）
- [ ] 备份/回滚：成员 manifest + `pnpm-lock.yaml`（install 失败回滚这两者）；根 manifest 理论不被 `--no-frozen-lockfile` 修改，验证失败回滚由 app 层快照兜底
- [ ] 声明非 semver（`workspace:` / `catalog:` / `link:`）→ 明确 failResult（不静默、不误修）
- [ ] 返回 `fromVersion/toVersion` 保留成员声明前缀（复用 `extractPrefix`）

**完成定义**:

- [ ] 根直接依赖行为与现状完全一致（回归）
- [ ] 成员直接依赖升级成功：成员声明更新 + lockfile 更新（install 在根执行）+ 无脆弱实例残留
- [ ] install 失败回滚（成员 manifest + lockfile 恢复），计 failed 而非 fixed
- [ ] dry-run 不落修复器层（app 层处理），修复器保持无验证职责

**非目标**: 成员级跨线升级（T405 跨线语义仅限根直接依赖，成员维持人工）；成员级间接依赖（全局 overrides 已覆盖）；`catalog:` 协议支持（C4 未实测，遇声明直接 failResult 不自动处理）；成员级 overrides 写入（pnpm overrides 仅根生效）

**测试方案**: 修复器单测（成员声明匹配 deps/dev/optional / 前缀保留 / install 失败回滚 / 非 semver failResult / 缺省 manifestDir 回归）

### T407 成员告警分流与 app 接线

- **优先级**: P1
- **依赖**: T406
- **状态**: 未开始
- **交付物**: `partitionSubmanifestAlerts` 三桶化 + 快照扩展 + app 2.0.3 链路 + 报告渲染

**任务内容**:

- [ ] `snapshotTrackedFiles(workDir, extraPaths?)` / `restoreTrackedFiles` 支持额外相对路径（key = 相对路径）
- [ ] `partitionSubmanifestAlerts` 三桶化：`{ root, member: { alert, manifestDir }[], sub }`——member 准入 = 成员目录白名单 + 成员直接声明 + lockfile 单版本 + 推荐 >= 锁定 + 非跨线；sub 计数相应减少（T404 口径回归断言）
- [ ] app 2.0.3 链路：按「包名 + manifestDir」聚合取最高推荐 → dry-run（strategy='member-upgrade'）→ 快照（根三件套 + 成员 manifest）→ 成员升级 → 升级后实例复核（残留回滚）→ quickVerify（根 lint）→ 失败回滚 → 成功 fixed
- [ ] 报告：FixAction `strategy='member-upgrade'` + `filePath=成员 manifest 相对路径`；markdown-generator / PR body 确认或补充 filePath 渲染

**完成定义**:

- [ ] 成员直接依赖安全场景自动升级，报告可见成员 manifest 路径（filePath）
- [ ] 降级风险 / 无版本信息 / 多版本共存 / 跨线场景维持人工（现状回归）
- [ ] 根直接依赖与 lockfile 告警链路行为零变化（回归）
- [ ] 失败 / 残留回滚计 failed，不误标 fixed/converged

**非目标**: 成员级跨线分流；`!` 排除模式 / 符号链接跟随（既有限制，另行评估）；成员独立 lint 脚本验证（根验证为主，演进项）

**测试方案**: partition 三桶判定矩阵（成员直接依赖 × 单/多版本 × 推荐>=/< 锁定 × 无版本信息 × 跨线 × 非成员路径）+ 快照扩展单测 + app 集成（成员升级成功 / 验证失败回滚 / 实例残留回滚 / dry-run / 根回归）

## M4.6 完成判定

- [ ] T406/T407 交付并通过 Review Gate
- [ ] `pnpm typecheck` + `pnpm lint` + 全量测试 + `pnpm build` 通过
- [ ] 根直接依赖行为回归无损
- [ ] 方案细化三项决策已确认落盘（验证链 lint-only / 多版本共存 sub / filePath 复用）

---

## M4: 多仓库治理增强

**目标**: 支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

**前置基础（已具备）**: CLI 已支持 `repositories: string[]` 显式多仓库配置（app 逐仓库循环执行），action 已暴露 `repos` 输入。M4 补齐**自动发现**与**治理能力**，显式列表语义不变。

**设计要点（实现前确认）**:
- **发现与显式共存**：`--owner` 发现结果与显式 `repositories` 列表合并去重，显式优先；显式列表受 exclude 约束但不受 include 影响
- **技术栈探测不做全量内容扫描**（成本与 token 面）：首版基于 topic / 默认分支 `dependabot.yml` 存在性探测（contents API 仅对候选仓库），内容嗅探为演进项
- **并发默认保守**：`--max-concurrency` 默认 1（行为与现状一致），>1 时输出警告
- **失败隔离语义**：单仓库失败记录该仓库结果（failed 状态 + 错误详情），不中断整体；聚合到单一 RunResult
- **归档向后兼容**：现有 `dependfix-report-*.md|.json` 输出不变，新增归档结构仅追加

### 建议执行顺序

```
T401（发现）→ T402（并发/隔离）→ T403（名单策略，依赖发现）
              ↘
T404（归档/趋势，依赖 T402，可并行）
```

---

### T401 实现 owner 级仓库自动发现

- **优先级**: P2
- **依赖**: T102（GitHub client）
- **状态**: 已完成（2026-08-06，提交后回链）
- **交付物**: `packages/cli/src/github/repository-discovery.ts`

**任务内容**:

- [x] 按 owner / org 拉取仓库列表（`GET /users/{owner}/repos` / `GET /orgs/{org}/repos`，octokit.paginate 分页）
- [x] 基础过滤：archived / disabled / fork 剔除，默认分支缺失剔除
- [x] topic 过滤（`--repo-topics node,pnpm`，AND 语义）；dependabot.yml 存在性探测（默认分支 contents API，仅对候选仓库，404 视为不支持）
- [x] 与显式 `repositories` 配置合并去重（显式优先，发现仅补充未出现项）
- [x] 发现结果排序确定性（仓库名排序，保证同输入多次运行结果一致——runId/指纹稳定性前提）

**完成定义**:

- [x] `--owner` 模式生成稳定处理清单：同输入多次运行结果一致
- [x] 自动发现 + 显式列表合并无重复，显式仓库不因探测失败被剔除
- [x] 探测请求数量受控（仅候选仓库触达 contents API，不扫描全部）

**非目标**: 全量内容扫描判断技术栈（首版基于 topic/元数据探测；内容嗅探登记 backlog 演进项）

**测试方案**: mock octokit 分页 + 过滤组合矩阵单测；排序确定性；显式/发现合并优先级；topic 探测 404 语义 ✅（repository-discovery.test.ts 10 例 + config/app 接线 7 例）

> **Review Gate**: 审计 PASS（无 P0/P1；P2 测试缺口已当场补齐：config 校验 5 例 + app 接线 2 例）。

---

### T402 并发控制与失败隔离

- **优先级**: P2
- **依赖**: T401、现有 app 多仓库循环
- **状态**: 已完成（2026-08-06，提交后回链）
- **交付物**: `packages/cli/src/multirepo/scheduler.ts`（并发执行 + 每仓库独立状态）

**任务内容**:

- [x] `--max-concurrency` / `DEPENDFIX_MAX_CONCURRENCY`（默认 1 保守，>1 输出警告），并发上限校验（1-16）
- [x] 仓库级失败隔离：单仓库异常记录该仓库失败结果（failed + 错误详情），其余仓库继续执行
- [x] GitHub API 限流统一处理：429 / 403 secondary rate limit → 指数退避重试（octokit hook 统一包装，退避基数/重试次数可配）
- [x] 聚合 RunResult：多仓库结果合并（repositories 数组 + Summary 汇总行）

**完成定义**:

- [x] 注入单个仓库失败时，其余仓库全部完成且报告可见失败仓库详情
- [x] 并发数配置生效且行为正确（调度日志可见并发窗口）
- [x] 429 模拟下自动退避重试成功，不丢失已拉取数据

**非目标**: 跨进程 / 分布式调度（M7 BullMQ + Redis）

**测试方案**: 调度器并发上限（mock 慢任务）、失败隔离集成测试（注入抛错仓库）、退避重试（mock 429 → 200） ✅（scheduler 4 例 + client retry 12 例 + app 失败隔离 1 例 + config 并发校验 7 例）

> **Review Gate**: 首轮 REJECT（P1：fix/fix-and-pr 并发写共享 workDir 数据竞争——已修复为 maxConcurrency>1 仅限 report-only，fail-fast 校验；P2：scheduler 兜底静默吞错——已补 onError 记录）。复查 PASS。
> **残余风险（登记 backlog，2026-08-06 已全部处置）**: 写请求 429 重放（R1 已修复：仅 GET/HEAD 重试）、MAX_BACKOFF_MS 硬编码（R2 已修复：--max-backoff-ms 可配）、Retry-After 未解析（R3 已修复）、CJS require p-queue ESM-only（R4 已消除：全 ESM 单格式方案）。

---

### T403 仓库白名单 / 黑名单策略

- **优先级**: P2
- **依赖**: T401
- **状态**: 已完成（2026-08-06，提交后回链）
- **交付物**: discovery 过滤链扩展（include/exclude 合并）

**任务内容**:

- [x] `--repo-include` / `--repo-exclude`（glob 模式 `owner/*`、`owner/pkg-*`；支持多次传入）
- [x] 优先级语义：显式 repositories 列表受 exclude 约束、不受 include 影响；发现结果同时受 include + exclude 约束；include 与 exclude 冲突时 exclude 胜出
- [x] topic 黑名单（`--repo-topics-exclude`，排除含任一指定 topic 的仓库）
- [x] 优先级语义写入配置文档（configuration.md）

**完成定义**:

- [x] include / exclude / 显式列表 / topic 组合矩阵结果确定可预期（单测覆盖）
- [x] 文档写明优先级语义，无歧义

**非目标**: 正则表达式引擎（首版 glob 通配；正则演进登记 backlog）

**测试方案**: include/exclude/显式列表/topic 优先级矩阵单测；glob 匹配单测 ✅（repo-policy 16 例 + discovery 策略集成 2 例 + app 接线 2 例 + config 1 例）

> **Review Gate**: 审计 PASS（无 P0/P1；P2 仅 todo 状态同步；P3 已落实 disableNetConnect，topics 大小写敏感/ReDoS 面登记）。

---

### T404 报告归档与趋势统计

- **优先级**: P2
- **依赖**: T203（runId 已有）、T402
- **状态**: 已完成（2026-08-06，提交后回链）
- **交付物**: `packages/cli/src/report/archiver.ts` + 归档索引

**任务内容**:

- [x] 归档结构 `dependfix-reports/{YYYY-MM}/{runId}/`：多仓库各自 md/json + 汇总 json（现有 `writeReport` 输出保留）
- [x] 归档索引 `dependfix-reports/index.json`：runId、时间、仓库列表、告警/修复/失败计数、时长（趋势基础字段）
- [x] `--history <repo>` 命令：列出该仓库历史运行摘要（读 index.json，倒序时间；计数取 repoStats 仓库级口径）
- [x] 汇总 json 与单仓库报告同字段口径（复用 RunSummary 序列化）

**完成定义**:

- [x] 连续 2 次运行后 index.json 可查询按仓库趋势（告警/修复/失败计数随时间变化）
- [x] 现有单仓库报告输出与 action artifact 路径不破坏（向后兼容）

**非目标**: 图表 / 仪表板可视化（M6 平台）；报告保留策略（容量治理登记 backlog）

**测试方案**: 归档写盘结构、index.json 更新幂等、history 输出格式、汇总字段与 RunSummary 对齐 ✅（archiver 10 例 + history 3 例 + app 归档集成 1 例）

> **Review Gate**: 首轮 REJECT（P1：--history 多仓库输出全局计数——已改为 repoStats 仓库级口径；P2：grouping.test.ts 污染 cwd——已补 reportOutputDir 隔离）。复审 PASS（代码级；todo 状态同步后放行）。
> **残余风险（登记 backlog）**: 损坏 index.json 覆盖即丢历史（无保留策略）；多进程并发写 index.json 非原子（单进程语义可接受）。

---

## M4 完成判定

- [x] 通过 `--owner` 一次拉取多仓库处理清单（T401）
- [x] 显式 + 发现 + 名单组合结果可预期（T401+T403）
- [x] 多仓库失败隔离 + 并发可控（T402）
- [x] 历史归档可查趋势（T404）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过；Review Gate 放行

> **M4 交付说明（2026-08-06）**：T401 自动发现（owner/org 分页 + 基础/topic 过滤 + dependabot.yml 探测 + 排序确定性 + 显式优先合并）；T402 并发调度（p-queue 1-16，fix/fix-and-pr 因共享 workDir 禁并发）+ 限流指数退避重试（429/403 primary/secondary，权限 403 不重试）；T403 名单策略（glob include/exclude + topics 黑名单，策略在探测前应用，exclude 冲突胜出，configuration.md 优先级矩阵）；T404 归档与趋势（{YYYY-MM}/{runId}/ 每仓库 md/json + index.json + --history 仓库级计数）。四项均经独立 Review Gate（T402/T404 首轮 REJECT 后修复复审 PASS），4 次单提交落库（本地，未推送）。
