# pnpm audit Fallback 设计评估（T-G2-4）

> 状态: ✅ 已实现（2026-08-04）
> 日期: 2026-08-04
> 关联: [G2 处置记录](../../plan/archive/todo-archive-phases-m2-m55.md#g2-处置记录-github_token-无法访问-dependabot-alerts)（方案 D）、T-G2-1（fetch 硬失败）、T-G2-3（双 token 落地）

## 1. 目标

在 **无 GitHub token 的本地场景** 提供依赖漏洞审计与修复的可用路径：

- 无 token 也能跑 `dependfix`（本地 `pnpm audit --json` 作为告警数据源）
- 口径归一化：pnpm audit 输出 → 现有告警流水线（filter / fix / report）可直接消费
- 数据源标注：报告与日志必须明确区分"告警来自 GitHub Dependabot API"还是"来自本地 pnpm audit"，保证可归档、可审计

**非目标**：

- 不替代 Code Scanning（audit 只覆盖依赖漏洞）
- 不解决 GITHUB_TOKEN 权限问题（那是 T-G2-1/3 的职责）
- 不做多数据源合并（见 §5.5）

## 2. 现状盘点

### 2.1 已落地能力

| 项 | 现状 | 位置 |
|---|---|---|
| fetch 硬失败 | 401/403 → `AppError` + exit 2 + hint，**杜绝静默空跑** | T-G2-1（a9e61b8） |
| 双 token | `alertsToken`（Dependabot 专用）缺省回退主 token | T-G2-3 |
| 告警流水线 | fetch → filter（severity）→ prioritize → limit → fix | `app.ts` |
| 报告 | 6 节模板，§1 Header / §2 Summary / §4 Repositories 明细 | `markdown-generator.ts` |
| 数据模型 | `source: 'dependabot' \| 'code-scanning'`、`id: number`、`ruleId: string` | `core/src/alerts/index.ts` |

### 2.2 关键约束（设计必须兼容）

1. **T-G2-1 语义**：403 已定义为"配置错误 → 硬失败"。若 fallback 在 403 时静默降级，将**复活静默空跑问题**——设计必须与硬失败语义不冲突（见 §5.1）
2. **`id: number`**：`NormalizedSecurityAlert.id` 是数字，而 audit advisoryId 是字符串（GHSA/CVE/URL）——映射需 hash 或占位（见 §5.3）
3. **`source` 双枚举**：`'dependabot' | 'code-scanning'` 无 audit 位——数据源标注需要扩展（见 §5.4）
4. **repository 语义**：现有 `repositories: ['owner/repo']` 来自 git remote 推断；本地 fallback 无 GitHub 仓库概念（见 §5.2）
5. **CLI 本地默认 mode = `report-only`**，`--repo` 缺省时从 git remote 推断；无 remote 且无 token 时现有行为是配置错误

## 3. 参考实现（已存在且成熟）

`security-alert-remediator` skill 的 `collect-security-alerts.mjs` 已实现完整 fallback 链路，本项目应**对齐其归一化口径**而非另起炉灶：

| 能力 | 参考实现细节 |
|---|---|
| severity 归一 | `SEVERITY_RANK`：`info/note→low`、`low→low`、`warning/moderate/medium→medium`、`high/error→high`、`critical→critical` |
| 结构映射 | `alertNumber: audit:<pkg>:<advisoryId>`、`patchAvailable`、`patchedVersion`、`state: 'open'`、`summary: title`、`source: 'dependabot'`（类型复用）+ 报告级 `sourceStatuses.sourceName: 'pnpm-audit'`（数据源标注） |
| 去重 | key = `packageName:advisoryId:severity`，paths 合并 |
| 双格式兼容 | legacy（`advisories`/`actions`）与 modern（`vulnerabilities`/`via`）两种 pnpm audit 输出 |
| 触发 | Dependabot source 非 `ok`（含 403）时整体回退，**不混合数据** |
| 修复版本 | `fixAvailable`（`{name, version, isSemVerMajor}`）、legacy `action.target`，或 legacy `patched_versions`（无 actions 时，pnpm 11 常见）——**range 字符串（如 `>=0.2.4`）剥离前缀取裸版本**，否则 compareSemver 解析退化为 `[0,0,0]` 导致告警假跳过（T801 实证，2026-08-14 修复） |

**与本项目的关键差异**：参考实现是**收集/快照工具**（只读、报告用途），可接受"403 自动降级"；dependfix 是**修复工具**（写 package.json / lockfile / 建 PR），隐式降级的风险不可接受——这是本评估的核心分歧点（§5.1）。

## 4. 设计决策点

### D1 触发策略（核心决策，推荐方案 B）

**问题**：fallback 何时生效？`GITHUB_TOKEN` 缺失？403？还是显式开关？

| 方案 | 行为 | 评价 |
|---|---|---|
| A. 隐式全降级 | token 缺失 **或 403** 都自动走 audit（对齐参考实现） | ❌ 403 静默降级 → 复活 T-G2-1 刚消灭的静默空跑；用户以为在跑 GitHub 实际在跑本地 audit，权限配置错误被掩盖 |
| B. 显式开关 + 缺失自动（**推荐**） | ① `--alerts-source pnpm-audit` / env 显式指定 → 直接走 audit（**不要求 token、不要求 git remote**）② 无显式指定时：**无 token 且无 git remote** → 配置错误提示（现状不变）；**有 token 但 403** → 硬失败（T-G2-1 语义保留），**错误提示附带"可切换 `--alerts-source pnpm-audit` 本地回退"指引** | ✅ 显式选择 = 知情；403 仍是配置错误而非降级信号；无 remote 本地目录场景有明确入口 |
| C. 无 token 自动 | 仅"token 完全缺失"时自动 fallback，403 仍硬失败 | 🟡 半隐式：用户忘配 token 时静默走 audit，"以为接入了 GitHub 实际没有"的误导仍在；且与"无 remote 目录"场景纠缠 |

**推荐 B**，理由：

- 修复工具的每一次降级都必须是**用户知情**的显式选择（写文件/改依赖的副作用 > 快照工具）
- 403 的语义在 T-G2-1 已定为"配置错误"，不因 fallback 存在而改变
- `--alerts-source pnpm-audit` 同时服务"非 GitHub 仓库目录（无 remote）"场景，一参两用

**失败语义**：显式 `pnpm-audit` 模式下 audit 本身失败（无 lockfile / pnpm 不可用 / JSON 解析失败）→ `AppError` + exit 2（与 T-G2-1 一致的硬失败，绝不空跑）。

**403 提示升级**（用户已确认）：T-G2-1 的 `dependabotAlertsTokenHint` 在 `PERMISSION_DENIED` 分支追加一句"可切换 `--alerts-source pnpm-audit` 使用本地 pnpm audit 回退"——403 仍是硬失败，但为用户指出逃生路径。

### D2 repository 语义（本地目录）

**问题**：audit 扫的是**当前目录**的 lockfile，而流水线与报告的 `repository` 字段是 `owner/repo`。

**决策（2026-08-04 用户确认，修正推荐方案）**：**无 token 不代表没有 remote**——repository 解析优先 git，`local` 仅兜底：

1. **解析优先级**：显式 `--repo`（≤1 个）→ git remote 推断（`inferRepoFromGitRemote`，无 token 也可用）→ `local` 兜底（无 remote 的裸目录）
2. 本地 checkout 场景报告显示**真实 owner/repo**（如 `owner/repo`），审计价值高于笼统的 `local`；无 remote 时报告显示 `Local workspace`
3. **≥2 个 `--repo` 与 pnpm-audit 互斥** → `CONFIG_VALIDATION_ERROR`（audit 只扫当前目录一个 lockfile，无法对应多个仓库，避免假象）；0 或 1 个均合法
4. 修复路径天然适配：fix 模式本就在 `workDir`（当前目录）写 package.json / lockfile，与 audit 扫描对象一致
5. `fix-and-pr` 模式与 pnpm-audit 互斥 → 配置错误（PR 必须 GitHub，audit 数据无对应仓库）；`--commit` 本地提交可用

### D3 alert id 映射

**问题**：`id: number` 与字符串 advisoryId 冲突。

**推荐**：audit alert 的 `id` 用 advisoryId 的稳定哈希（如 `sha256(packageName:advisoryId) % 2^31` 或取 hash 前 8 位转 int，保证同 audit 输出幂等）。`ruleId` 直接放 advisoryId（GHSA/CVE/URL），报告 §4 GHSA 列自然展示。`htmlUrl` 用 audit 的 advisory url。

### D4 数据源标注策略（T-G2-4 核心交付）

**问题**：`source` 枚举只有 `'dependabot' | 'code-scanning'`。

**推荐（两层标注，对齐参考实现）**：

1. **alert 级**：`source` 扩展 `'pnpm-audit'`——不伪装成 dependabot（参考实现复用 `'dependabot'` 是因为它的下游只按 `source === 'dependabot'` 过滤；本项目下游按 source 做统计与去重，伪装会造成口径污染）
   - 模型变更：`AlertSource = 'dependabot' | 'code-scanning' | 'pnpm-audit'`
   - 影响面排查：`filterAlerts`（按 severity 不按 source）、`fix-helpers.ts` 按 `source === 'dependabot'` 判断？→ **需审计所有 `source ===` 比对点**，pnpm-audit 应视同 dependabot 进入修复分支（同为依赖漏洞修复语义）
2. **run 级（报告）**：`RunResult` 新增 `dataSources` 信息，报告 §1 Header 渲染 `> **Alert Source**: pnpm-audit (local) / GitHub Dependabot API`
   - 模型变更：`RunReportConfig` 增加 `alertSource: 'github-dependabot' | 'pnpm-audit'`
   - 报告 §4 Repositories 表头/README 无需改动（source 列已天然区分）

### D5 统计口径差异与处置

**问题**：GitHub Dependabot 有状态机（open → fixed/dismissed），audit 是**全量扫描**（无状态，修复后漏洞从输出中消失）；advisory 数据库也不同（GitHub GHSA vs npmjs registry）。

**推荐**：

- **不混合**：pnpm-audit 模式下整条流水线只用 audit 数据（对齐参考实现）。混合同源去重不可靠（同 CVE 不同库 ID），且 audit 无状态无法与 Dependabot 状态对齐
- **fixed 判定**：audit 模式无"fixed/dismissed"状态——修复后下次跑 audit 该漏洞自然消失；报告不显示"Fixed"状态，而是显示本次扫描结果（与参考实现一致，报告定位为快照而非状态机）
- `alertsSkipped` 统计口径保持现状（按本次扫描的不可修复/收敛/无需升级）

### D6 severity 归一表

对齐参考实现 `SEVERITY_RANK` 并显式化到本项目（audit 实际输出值：`info | low | moderate | high | critical`，legacy 可能含 `warning/error`）：

| pnpm audit | 归一（AlertSeverity） |
|---|---|
| `critical` | `critical` |
| `high` / `error` | `high` |
| `moderate` / `medium` / `warning` | `medium` |
| `low` / `info` / `note` | `low` |
| 其他/缺失 | `unknown`（不 throw，参考实现 throw 但本项目报告模型有 unknown 位） |

### D7 修复语义映射

| pnpm audit 字段 | NormalizedSecurityAlert |
|---|---|
| `fixAvailable.version` / legacy `action.target` | `recommendedVersion` |
| 有修复版本 | `fixable: true`、`fixStrategy: 'upgrade'` |
| 无修复版本（`fixAvailable: false` / `<0.0.0` / `manual review required` / `none` / `unavailable`） | `fixable: false`、`fixStrategy: 'wait-upstream'` |
| `fixAvailable.isSemVerMajor` | `isMajor` 判定走现有 compareSemver 逻辑（app 层） |
| `via[].url` / `advisory.url` | `htmlUrl` |
| `vulnerabilities.<name>.nodes` / legacy `findings[].paths` | `manifestPath`（合并逗号串，可为空） |

**parse 兼容**：必须兼容 pnpm v11 modern（`vulnerabilities`/`via`）与 legacy（`advisories`/`actions`）双格式（直接移植参考实现 `parseAuditReport` 的解析+去重逻辑）。

### D8 配置形态

```text
CLI:  --alerts-source <github-dependabot|pnpm-audit>     # 默认 github-dependabot
Env:  DEPENDFIX_ALERTS_SOURCE
```

- 校验：`pnpm-audit` + `fix-and-pr` → `CONFIG_VALIDATION_ERROR`；`pnpm-audit` + 多 `--repo`（≥2）→ 同上；0/1 个合法
- 与 `alertsToken` 无耦合（audit 模式不建 GitHub client；`githubToken` 仍可能被 `--commit` 的 push 拒绝 → 正常报错）

## 5. 影响面与风险

| 风险 | 级别 | 处置 |
|---|---|---|
| 403 自动降级复活静默空跑 | P0 | D1 方案 B：403 永不走 fallback |
| `source === 'dependabot'` 比对点漏改导致 audit 告警被过滤 | P1 | 实现前 grep 审计全部 `source` 比对点（fix-helpers / app / report） |
| audit JSON 格式漂移（pnpm 版本间） | P1 | 双格式解析 + fixture 测试锁定 legacy/modern；解析失败硬失败 |
| 无 lockfile 目录 | P1 | `pnpm audit` 退出非零 → 明确错误信息 + exit 2（不静默） |
| fix-and-pr 用户误配 audit | P2 | 配置校验互斥 |
| 修复后状态语义（无 fixed 状态机） | P2 | 报告定位为快照；文档说明 |

## 6. 实施任务拆解（评估通过后）

1. ✅ **core**：`AlertSource` 扩展 `'pnpm-audit'`；`RunReportConfig.alertSource`；`SEVERITY_RANK` 归一表 + `normalizeAuditSeverity`
2. ✅ **cli**：`packages/cli/src/alerts/pnpm-audit-fetcher.ts`（移植参考实现 parse/去重/映射 → `NormalizedSecurityAlert[]`，id hash、repository 由调用方注入）
3. ✅ **cli**：config `--alerts-source` + 互斥校验（`fix-and-pr`、`--repo` ≥2）+ 测试
4. ✅ **app**：`alertsClient` 分支——`github-dependabot` 走现路径；`pnpm-audit` 走 fetcher（repository 解析：显式 `--repo` → git remote → `local`）
5. ✅ **fix 链路**：审计并修正 `source === 'dependabot'` 比对点（结论：生产代码无 source 分流，pnpm-audit 自然进入修复流水线，无需修正）
6. ✅ **报告**：§1 Header 渲染 `Alert Source`；`dataSources` 落地
7. ✅ **测试**：audit JSON fixture（legacy + modern）、severity 归一表、id 哈希幂等、互斥校验、app 集成（audit 源走完整 fix 流水线）
8. ✅ **文档**：README / quick-start / configuration / G2 注记更新

## 7. 验收标准

- [x] `dependfix --alerts-source pnpm-audit`（无 token）在**有 git remote 的 checkout** 运行 → 报告 repository 显示真实 `owner/repo`（真实冒烟：dependfix/dependfix）
- [x] `dependfix --alerts-source pnpm-audit`（无 token、无 remote）在裸目录运行 → 报告 repository 显示 `Local workspace`（内部值 `local`）
- [x] audit 告警进入现有 fix 流水线（severity 过滤 / 升级 / 回滚 / 报告）行为与 dependabot 源一致
- [x] 报告 Header 明确标注 `Alert Source: pnpm-audit`；告警 `source` 均为 `pnpm-audit`
- [x] 403（有 token）仍硬失败 exit 2 + hint **附带 `--alerts-source pnpm-audit` 切换指引**，不触发 fallback
- [x] `pnpm-audit` + `fix-and-pr` / `--repo` ≥2 报 `CONFIG_VALIDATION_ERROR`
- [x] legacy + modern 两种 audit JSON fixture 解析正确、去重幂等
- [x] 无 lockfile / pnpm 不可用 → 明确错误 + exit 2（真实冒烟：仓库无 lockfile 场景 AUDIT_FAILED → exit 2）
- [x] lint + typecheck + test 全绿；Review Gate 放行

## 8. 已确认决策（2026-08-04）

| # | 决策点 | 用户确认 |
|---|---|---|
| D1 | 触发策略 | ✅ 方案 B（显式 `--alerts-source pnpm-audit` + 403 保持硬失败），**补充：403 错误提示中提醒用户可切换 pnpm-audit** |
| D4 | source 标注 | ✅ 独立枚举 `'pnpm-audit'`（不伪装 dependabot）+ 报告级数据源标注 |
| D2 | repository 值 | ✅ 修正：**优先 git remote 推断真实 `owner/repo`（无 token 不代表无 remote）**，`local` 仅兜底（无 remote 时） |

## 9. 实现记录（2026-08-04）

- `packages/cli/src/alerts/pnpm-audit-fetcher.ts`：`pnpm audit --json` 执行（**不检查 exit code**——发现漏洞时 exit 1 是正常行为，仅空输出/解析失败为硬失败）+ legacy/modern 双格式解析 + `packageName:advisoryId:severity` 去重 + `normalizeAuditSeverity` 归一 + advisoryId 稳定哈希（id 数字约束）
- config：`--alerts-source` / `DEPENDFIX_ALERTS_SOURCE`；pnpm-audit 下跳过 token 校验、允许 0/1 个 repo、拒绝 `fix-and-pr`
- app：`fetchAlerts` 双源分支；`resolveAlertRepositories`（`--repo` → git remote → `local`）；pnpm-audit 不创建 GitHub client
- 报告：§1 Header 渲染 `Alert Source`；403 hint 追加 `--alerts-source pnpm-audit` 切换指引
- 真实冒烟：dependfix 仓库 `report-only --alerts-source pnpm-audit` → 12 条 high 告警、git remote 推断、报告 GHSA 列正确
- 测试 +33（fetcher 15 / config 10 / app 集成 3 / report 2 / helpers 4），全量 431 通过
