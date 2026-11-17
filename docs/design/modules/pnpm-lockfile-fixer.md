# pnpm frozen-lockfile 修复器设计

## 1. 设计目标

`repairLockfile()` 在 `pnpm i --frozen-lockfile` 失败时诊断根因，按修复策略矩阵逐级尝试修复，并用同一条命令验证修复结果，最终输出结构化修复报告。

核心原则：

- **最小扰动**：优先尝试仅更新 lockfile，不触及 node_modules
- **逐级升级**：轻量策略失败后才尝试更重的修复手段
- **可观测**：失败原因可分类，修复前后 lockfile diff 可审计

---

## 2. 失败诊断

### 2.1 诊断流程

```
pnpm i --frozen-lockfile
    ↓ 失败
前置判定：信号终止 / 超时 / 无 stderr 诊断？ → 是 → ENVIRONMENT_ERROR（不归因，见 §2.4）
    ↓ 否（有 stderr 诊断）
按关键词匹配分类（顺序见 §2.3）
```

### 2.2 分类模型

通过解析 pnpm 错误输出匹配以下分类（**行序 = 匹配优先级**，见 §2.3）：

| FailureCategory | 触发特征 | 根因 |
|---|---|---|
| `LOCKFILE_NOT_FOUND` | `"no lockfile"` / `"Cannot find"` + `"pnpm-lock.yaml"` / ENOENT | lockfile 文件不存在 |
| `MANIFEST_MISMATCH` | `"ERR_PNPM_OUTDATED_LOCKFILE"` / `"out of sync"` / `"needs update"` | package.json 已修改但 lockfile 未更新 |
| `CREDENTIAL_ERROR` | `"E401"` / `"authentication"` / `"403"` / `"Could not resolve"` + 私有源 | 无法访问 npm registry 或私有源 |
| `CORRUPTED_LOCKFILE` | `"broken"` / `"corrupted"` / `"Cannot read"` + lockfile | lockfile 格式损坏或条目不完整 |
| `LOCKFILE_VERSION_MISMATCH` | `"lockfileVersion"` 不兼容 + pnpm 版本差异 | lockfile 由不同 pnpm 主版本生成 |
| `MINIMUM_RELEASE_AGE` | `"ERR_PNPM_NO_MATURE_MATCHING_VERSION"` / `"ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION"` / `"minimumReleaseAge"` | 目标仓库配置冷却期约束，锁定版本过新 |
| `RESOLVE_ERROR` | `"ERR_PNPM_NO_MATCHING_VERSION"` / `"resolution"` / lockfile 与 manifest 引用不匹配 | 依赖版本约束无法解析 |
| `ENVIRONMENT_ERROR` | **前置判定**（先于关键词匹配）：信号终止 / 超时 / 无 stderr 诊断（stdout 诊断会作为证据保留） | 执行环境问题而非 lockfile 内容问题；**不归因目标仓库**（见 §2.4） |
| `UNKNOWN` | 不匹配以上任何特征 | 未分类 |

**进程级信号保留**：每次诊断 / 策略执行都从子进程错误中提取 `exitCode`（退出码）、`signal`（终止信号，如 `SIGKILL` / `SIGTERM`）、`timedOut`（`ETIMEDOUT`）与 `errno`（`ENOENT` 等 spawn 级错误）并随结果上抛——外部不再只看到 `Command failed: pnpm install --no-frozen-lockfile` 这类无定位信息的结果。`ENVIRONMENT_ERROR` 的失败详情形如 `environmental install failure (exit code 1): no stderr/stdout diagnostics`（有 stderr 或 stdout 证据时改为 `… (signal SIGKILL): diagnostics: <文本>`）。**stdout 证据**：pnpm 11 把安装脚本错误写到 stdout，`getInstallDiagnostics` 会同时读取 stderr / stdout，两路都有时按 `stderr:` / `--- stdout ---` 标注。

### 2.3 分类优先级

部分错误可能同时触发的关键词（如 manifest mismatch 可能同时出现 "out of sync" 和 `ERR_PNPM_OUTDATED_LOCKFILE`），此时**取第一个匹配**，顺序同 §2.2 表（与实现 `FAILURE_PATTERNS` 同序）。**环境性判定前置**：一旦命中信号终止 / 超时 / 无 stderr 诊断，直接归 `ENVIRONMENT_ERROR`（进程可能在吐出部分 stderr 后被杀死，此时关键词分类不可信）。**运行级取消优先**：未启动（`started:false`）或运行中被取消（`aborted:true`）在环境性判定之前映射 `ABORTED`，不伪装成 `ENVIRONMENT_ERROR`。

### 2.4 环境性失败与非归因口径

`ENVIRONMENT_ERROR` 表示**执行环境**问题（OOM 杀死、超时、静默非零退出；stderr 为空但 stdout 有安装脚本错误时仍按环境性处理，stdout 作为证据保留），此时锁文件内容是否合规无从判断。判定单一事实源为 `fixers/process-signals.ts#isEnvironmentalInstallError`（本链与依赖升级链共用的判据）：运行级取消 → 非环境性；信号终止 / 超时 → 环境性；有 stderr 诊断 → 非环境性；stderr 为空 → 环境性；stdout 只作证据、不参与归因判定（见 [dependency-fixer-records.md §12.16](./dependency-fixer-records.md)）：

- 分类结果携带 `environmental: true`，并在 `RepairLockfileResult.environmental` 上透出；
- 调用方 `tryLockfileRepair` 据此把该 action 标记为 `environmentalFailure`、并记 `ENVIRONMENT_ERROR` 审计条目（`stage: 'repair'`）；
- 引擎 `computeExitCode` 将 `ENVIRONMENT_ERROR` 纳入 `SKIPPED_AUDIT_CATEGORIES`、且 `environmentalFailure` action 不计失败动作——与「既有失败基线」（`PRE_EXISTING_FAILURE`）同族的**不归因本次运行**口径；
- 平台侧 `run-failure-classify` 防御性映射 `ENVIRONMENT_ERROR → install + transient`（可重试）——在当前编排路径上**不可达**（非归因故不驱动 `status=failed`），保留以防内部回退读 `result.errors` 的路径将来可达时落入 `runtime + engine_exit_2` 的笼统归因（详见 [run-failure-taxonomy.md §4.3](../governance/run-failure-taxonomy.md)）；
- 调用方 `finalizeRepoFix` 对**零告警仓库跳过 lockfile repair**（无升级改动即无锁文件待修复），但保留修复后验证链（其 `verificationPassed` 是零告警仓库唯一的「处理成功」信号）——详见 [dependency-fixer.md](./dependency-fixer-records.md)。

---

## 3. 修复策略矩阵

| FailureCategory | 策略链（按此顺序尝试） | 说明 |
|---|---|---|
| `LOCKFILE_NOT_FOUND` | `REGENERATE` → `REINSTALL` | 新建 lockfile |
| `MANIFEST_MISMATCH` | `REGENERATE` → `REINSTALL` | 根据 package.json 重新生成 |
| `CREDENTIAL_ERROR` | （空链） | 非代码问题，无法自动修复 |
| `CORRUPTED_LOCKFILE` | `FIX_ENTRIES` → `REGENERATE` → `REGENERATE_FROM_MANIFEST` → `REINSTALL` | 原地策略无法解析原文件时，末尾「移出后按 manifest 重建」兜底 |
| `LOCKFILE_VERSION_MISMATCH` | `PIN_TOOLCHAIN` → `REGENERATE` → `REINSTALL` | 对齐 pnpm 版本后重新生成 |
| `MINIMUM_RELEASE_AGE` | `REGENERATE` → `REINSTALL` | 重解析可能选中满足冷却期约束的旧版本 |
| `RESOLVE_ERROR` | `REGENERATE` → `FIX_ENTRIES` → `REINSTALL` | 重解析 → 修条目 → 全量重解析 |
| `ENVIRONMENT_ERROR` | `REGENERATE` → `REINSTALL` | 环境性失败；保留尝试以捕获「环境已恢复」的机会性修复（与 `UNKNOWN` 同链） |
| `PRECONDITION_FAILED` | `REGENERATE_FROM_MANIFEST` → `REGENERATE` → `REINSTALL` | 基线已判安装失败但复检通过：不信任「已合规」，强制结构重建 |
| `UNKNOWN` | `REGENERATE` → `REINSTALL` | 最后手段 |

命令对照：`REGENERATE` = `pnpm install --lockfile-only`；`FIX_ENTRIES` = `pnpm install --fix-lockfile --lockfile-only`；`PIN_TOOLCHAIN` = `corepack pnpm@<version> install --lockfile-only`（无声明版本时回退裸 `pnpm install --lockfile-only`）；`REINSTALL` = `pnpm install --no-frozen-lockfile`。

### 3.1 策略执行顺序

按从轻到重的顺序尝试：

```
1. REGENERATE (最轻: 仅更新 lockfile)
    ↓ 失败
2. FIX_ENTRIES (修复损坏条目)
    ↓ 失败或不适用的分类
3. PIN_TOOLCHAIN (仅 LOCKFILE_VERSION_MISMATCH)
    ↓ 仍失败
4. REINSTALL (最重: 全量重解析)
```

其中策略 3 仅在分类为 `LOCKFILE_VERSION_MISMATCH` 时介入。

### 3.2 为什么是 `--lockfile-only` 优先

- `pnpm install --lockfile-only` 仅更新 `pnpm-lock.yaml`，不安装任何包到 `node_modules`
- 速度快、副作用小，适合 CI 场景中快速修复
- 失败率更低：不会因网络问题导致安装失败
- 验证只需再跑一次 `pnpm i --frozen-lockfile`

### 3.3 成功判据：命令退出 0 之外还必须有可用产物（2026-11-17 事故）

`pnpm` 在 `node_modules` 已是最新（`node_modules/.pnpm/lock.yaml` 与 `.modules.yaml` 命中）时会对
`install` 直接输出 `Already up to date` 并返回 0：既可能在 `--lockfile-only` 下**不重建**被移出的
root lockfile，也会让 `--frozen-lockfile` 在锁文件缺失 / 结构损坏时**短路通过**。只以退出码 +
frozen 安装结果判成功，会把「锁文件被移出且未重建」当修复生效：`diff` 记为整文件删除（`-10249` 行），
随后交付阶段把删除提交进 PR（`rsshub-never-die#264`，`-10249` 行 / 仅删除 `pnpm-lock.yaml`）。

现行判据（单一事实源 `inspectLockfileArtifact`）：

1. 策略命令成功后先校验**产物**：`pnpm-lock.yaml` 必须存在，且可被 YAML 解析并含 `lockfileVersion`
   （`yaml` 解析对重复 key 严格报错，覆盖 `ERR_PNPM_BROKEN_LOCKFILE` 的 `duplicated mapping key` 形态）。
   产物不可用 → 该策略记失败（`attempt.error` 写明原因）；若原文件已被移出 / 删除，或策略写出了不可解析的
   产物，则先从 `.bak` 恢复到修复前内容，再继续下一策略。
2. frozen 验证通过后**再**校验一次产物：frozen 结果同样会被 up-to-date 快路径短路，不能单独作为结论。
3. 全部策略失败 → 回滚到修复前内容（`$lockfile.bak`），不产出「删除锁文件」的净变更。
4. 交付侧纵深防御（`github/commit-scope.ts`）：白名单只放行白名单文件的**内容改动**；工作树 / 索引区
   出现白名单文件删除（`pnpm-lock.yaml` / `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `.gitignore`）
   时按未声明改动拒绝提交（`UNEXPECTED_CHANGES`），即使上游误产出删除也不会发布。

---

## 4. 核心接口设计

### 4.1 参数与返回值

```typescript
interface RepairLockfileParams {
    /** 工作目录（必须包含 package.json 和 pnpm-lock.yaml） */
    workDir: string
    /** 可选：期望的 pnpm 版本（优先于 packageManager 字段），用于版本冲突场景 */
    toolchain?: {
        pnpmVersion?: string
    }
}

interface LockfileRepairResult {
    /** 修复是否成功（后续 --frozen-lockfile 通过） */
    success: boolean
    /** 失败分类（success=false 时填充） */
    failureCategory?: LockfileFailureCategory
    /** 失败时的详细错误信息 */
    failureDetail?: string
    /** 实际采用的修复策略 */
    strategy?: RepairStrategy
    /** lockfile 变更摘要 */
    diff?: LockfileDiff | null
    /** 修复后 lockfile 内容是否实际改变（已合规，或修复后与备份字节一致时为 false） */
    changed?: boolean
    /** 各策略的尝试历史（含进程级退出码 / 信号） */
    attemptHistory: RepairAttempt[]
    /** 环境性安装失败（诊断步无 stderr 诊断）→ 调用方不归因目标仓库（见 §2.4） */
    environmental?: boolean
}

type LockfileFailureCategory =
    | 'LOCKFILE_NOT_FOUND'
    | 'MANIFEST_MISMATCH'
    | 'LOCKFILE_VERSION_MISMATCH'
    | 'CORRUPTED_LOCKFILE'
    | 'CREDENTIAL_ERROR'
    | 'RESOLVE_ERROR'
    | 'MINIMUM_RELEASE_AGE'
    | 'ENVIRONMENT_ERROR'
    | 'UNKNOWN'

type RepairStrategy =
    | 'REGENERATE'
    | 'FIX_ENTRIES'
    | 'PIN_TOOLCHAIN'
    | 'REINSTALL'
    | 'SKIP'

interface RepairAttempt {
    strategy: RepairStrategy
    command: string
    success: boolean
    error?: string
    durationMs: number
    /** 进程退出码（非零退出时；被信号杀死 / spawn 失败时为 null） */
    exitCode?: number | null
    /** 终止进程的信号（如 `SIGKILL` / `SIGTERM`）；非信号终止时为 null */
    signal?: string | null
}

interface LockfileDiff {
    /** 修复前后 lockfile 行数变化 */
    linesAdded: number
    linesRemoved: number
    /** 修复前后 dependencies 数量变化 */
    packagesChanged: number
    /** 简要文字摘要 */
    summary: string
}
```

> **`changed` 与 noOp 口径（2026-10-18）**：`success && changed === false` 表示 lockfile 已合规，或修复后内容与备份一致（按字节比较）——两种情况都视为**内容未改动**；`tryLockfileRepair` 据此标记 `FixAction.noOp`，交付层（`hasDeliverableFixes`）不会把「无需修复」当成可交付修复，也不会因 side-effect 改动创建零修复 PR。

### 4.2 入口函数

```typescript
export async function repairLockfile(params: RepairLockfileParams): Promise<LockfileRepairResult>
```

### 4.3 内部辅助函数（导出供测试）

```typescript
/** 执行 pnpm i --frozen-lockfile 并解析失败分类（含进程级信号） */
export function classifyLockfileFailure(
    workDir: string
): { ok: boolean; category?: LockfileFailureCategory; stderr?: string; stdout?: string; diagnostics?: string; exitCode: number | null; signal: string | null; timedOut: boolean; errno: string | null; noDiagnostics: boolean; environmental: boolean }

/** 计算 lockfile 变更摘要 */
export function computeLockfileDiff(
    beforePath: string,
    afterPath: string
): LockfileDiff

/** 从 package.json 读取 packageManager 字段解析 pnpm 版本 */
export function resolvePnpmVersion(workDir: string, toolchain?: { pnpmVersion?: string }): string | null
```

### 4.4 与 T105 的接口契约

T105（依赖升级修复器）在执行 `pnpm install --no-frozen-lockfile` 后不验证 frozen-lockfile。T106 的 `repairLockfile()` 负责这一验证步骤。

典型编排流程：
```
T105: upgradeDependency() → 修改 package.json + pnpm install --no-frozen-lockfile
T106: repairLockfile()    → 验证并修复 frozen-lockfile 合规性
T107: validate()          → lint + typecheck + test
```

### 4.5 保留 M0 向后兼容

```typescript
export interface PnpmLockfileFixerDescriptor {
    module: 'pnpm-lockfile-fixer'
    command: 'pnpm i --frozen-lockfile'
}

/**
 * @deprecated 保留用于模块注册兼容
 */
export function createPnpmLockfileFixerDescriptor(): PnpmLockfileFixerDescriptor
```

---

## 5. 工具链版本固定

### 5.1 版本来源优先级

1. `toolchain.pnpmVersion` 参数（显式传入）
2. `package.json` 的 `packageManager` 字段（如 `"pnpm@10.4.1"`）
3. 当前 shell 中 `pnpm --version` 的输出

### 5.2 corepack 策略

当 `packageManager` 字段存在时：

```json
{
    "packageManager": "pnpm@10.4.1"
}
```

corepack 会自动激活对应版本。如果未启用，修复器会：

1. 检测 `packageManager` 字段 → 提取 pnpm 版本
2. 检查 `corepack` 是否可用 → 如不可用，退回到当前环境的 pnpm 版本

**设计决策**：修复器**不自动启用 corepack**。因为 corepack 的状态属于仓库基础设施层面，跨仓库修改风险过高。改为检测到 `packageManager` 声明与实际版本不匹配时，在 `LOCKFILE_VERSION_MISMATCH` 分类中标记，由用户显式处理。

### 5.3 版本冲突修复的具体做法

当检测到 `LOCKFILE_VERSION_MISMATCH`：

1. 尝试用声明的 pnpm 版本执行 `pnpm@version install --lockfile-only`
2. 如果声明的 pnpm 版本不可用，退回到 `REINSTALL` 策略
3. 标记 `attemptHistory` 记录是否使用了 corepack

---

## 6. 回滚策略

### 6.1 机制

修复前备份 `pnpm-lock.yaml` → 执行修复命令 → 失败则还原。

```typescript
// 备份
const lockfilePath = join(workDir, 'pnpm-lock.yaml')
const backupPath = `${lockfilePath}.bak`
copyFileSync(lockfilePath, backupPath)

try {
    // 执行修复命令
} catch {
    // 回滚
    copyFileSync(backupPath, lockfilePath)
    rmSync(backupPath)
}
```

### 6.2 与 T105 回滚的区别

- T105 备份两个文件：`package.json` + `pnpm-lock.yaml`
- T106 仅备份 `pnpm-lock.yaml`（不修改 package.json）

### 6.3 cleanup

无论成功还是失败，修复完成后删除 `.bak` 文件。

---

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [pnpm-lockfile-fixer-records.md](./pnpm-lockfile-fixer-records.md) | §7 - §11 | Lockfile Diff 报告 / 测试策略 / 实现文件清单 / 数据流 / 非目标 |
