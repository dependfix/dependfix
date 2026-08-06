# 当前阶段任务（M4）

> M0（基线收敛）/ M1（MVP 单仓库修复）/ M2（GitHub Action 接入）/ M3（Code Scanning 扩展）已完成，归档见 [todo-archive.md](todo-archive.md)。
> **M4（多仓库治理增强）已完成（2026-08-06）**：T401-T404 全部交付并通过 Review Gate（提交 cb801b60 / fedb7200 / 5860fb4d / 2a7fed00），全量质量门（typecheck + lint + build + 650 tests）通过。
> M5 及之后阶段的任务见 [backlog.md](backlog.md)。

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
> **残余风险（登记 backlog，2026-08-06 已全部处置）**: 写请求 429 重放（R1 已修复：仅 GET/HEAD 重试）、MAX_BACKOFF_MS 硬编码（R2 已修复：--max-backoff-ms 可配）、Retry-After 未解析（R3 已修复）、CJS require p-queue ESM-only（R4 已修复：动态 import）。

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
