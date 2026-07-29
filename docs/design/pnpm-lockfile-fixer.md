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
捕获 stderr → 按关键词匹配分类
```

### 2.2 分类模型

通过解析 pnpm 错误输出匹配以下分类：

| FailureCategory | 触发特征 | 根因 |
|---|---|---|
| `LOCKFILE_NOT_FOUND` | `"no lockfile"` / `"Cannot find"` + `"pnpm-lock.yaml"` / ENOENT | lockfile 文件不存在 |
| `MANIFEST_MISMATCH` | `"ERR_PNPM_OUTDATED_LOCKFILE"` / `"out of sync"` / `"needs update"` | package.json 已修改但 lockfile 未更新 |
| `LOCKFILE_VERSION_MISMATCH` | `"lockfileVersion"` 不兼容 + pnpm 版本差异 | lockfile 由不同 pnpm 主版本生成 |
| `CORRUPTED_LOCKFILE` | `"broken"` / `"corrupted"` / `"Cannot read"` + lockfile | lockfile 格式损坏或条目不完整 |
| `CREDENTIAL_ERROR` | `"E401"` / `"authentication"` / `"403"` / `"Could not resolve"` + 私有源 | 无法访问 npm registry 或私有源 |
| `RESOLVE_ERROR` | `"ERR_PNPM_NO_MATCHING_VERSION"` / `"resolution"` / lockfile 与 manifest 引用不匹配 | 依赖版本约束无法解析 |
| `UNKNOWN` | 不匹配以上任何特征 | 未分类 |

### 2.3 分类优先级

部分错误可能同时触发的关键词（如 manifest mismatch 可能同时出现 "out of sync" 和 "ERR_PNPM_OUTDATED_LOCKFILE"），此时**取第一个匹配**。匹配顺序同上表。

---

## 3. 修复策略矩阵

| FailureCategory | Strategy | Command | 说明 |
|---|---|---|---|
| `LOCKFILE_NOT_FOUND` | `REGENERATE` | `pnpm install --lockfile-only` | 新建 lockfile |
| `MANIFEST_MISMATCH` | `REGENERATE` | `pnpm install --lockfile-only` | 根据 package.json 重新生成 |
| `CORRUPTED_LOCKFILE` | `FIX_ENTRIES` | `pnpm install --fix-lockfile --lockfile-only` | 修复损坏条目后再验证 |
| `LOCKFILE_VERSION_MISMATCH` | `PIN_TOOLCHAIN` | 固定 pnpm 版本后执行 `REGENERATE` | 对齐 pnpm 版本 |
| `RESOLVE_ERROR` | `REINSTALL` | `pnpm install --no-frozen-lockfile` | 全量重解析 |
| `CREDENTIAL_ERROR` | `SKIP` | (不执行修复) | 非代码问题，无法自动修复 |
| `UNKNOWN` | `REINSTALL` | `pnpm install --no-frozen-lockfile` | 最后手段 |

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
    diff?: LockfileDiff
    /** 各策略的尝试历史 */
    attemptHistory: RepairAttempt[]
}

type LockfileFailureCategory =
    | 'LOCKFILE_NOT_FOUND'
    | 'MANIFEST_MISMATCH'
    | 'LOCKFILE_VERSION_MISMATCH'
    | 'CORRUPTED_LOCKFILE'
    | 'CREDENTIAL_ERROR'
    | 'RESOLVE_ERROR'
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

### 4.2 入口函数

```typescript
export async function repairLockfile(params: RepairLockfileParams): Promise<LockfileRepairResult>
```

### 4.3 内部辅助函数（导出供测试）

```typescript
/** 执行 pnpm i --frozen-lockfile 并解析失败分类 */
export function classifyLockfileFailure(
    workDir: string
): Promise<{ ok: boolean; category?: LockfileFailureCategory; stderr?: string }>

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

## 7. Lockfile Diff 报告

### 7.1 计算方式

```
修复前: 读取备份 .bak → 统计行数 + 解析包数量
修复后: 读取新的 pnpm-lock.yaml → 统计行数 + 解析包数量
diff: 行数差、包数量差
```

### 7.2 简化实现

不实现完整 YAML diff（成本过高）。使用以下方式：

- **行数变化**：`wc -l` 等价
- **包数量变化**：grep YAML 中的包条目键
- **摘要**：生成一句话描述，如 `"lockfile updated: +15/-3 lines, 2 packages changed"`

### 7.3 按策略调整粒度

| Strategy | Diff 期望 |
|---|---|
| `REGENERATE` | 中等变化（根据 manifest 重新生成） |
| `FIX_ENTRIES` | 小变化（仅修复损坏条目） |
| `REINSTALL` | 可能大变化（全量重解析） |

---

## 8. 测试策略

### 8.1 单元测试（Vitest，mock 子进程）

| 场景 | 待测点 |
|---|---|
| classifyLockfileFailure - LOCKFILE_NOT_FOUND | mock stderr 返回 `"Cannot find"` 关键词 |
| classifyLockfileFailure - MANIFEST_MISMATCH | mock stderr 返回 `"ERR_PNPM_OUTDATED_LOCKFILE"` |
| classifyLockfileFailure - VERSION_MISMATCH | mock stderr 返回 lockfileVersion 不兼容信息 |
| classifyLockfileFailure - CORRUPTED | mock stderr 返回 `"broken"` 关键词 |
| classifyLockfileFailure - CREDENTIAL | mock stderr 返回 `"E401"` 关键词 |
| classifyLockfileFailure - UNKNOWN | mock stderr 返回不匹配任何关键词的随机错误 |
| classifyLockfileFailure - ok | mock exitCode=0 |
| repairLockfile - LOCKFILE_NOT_FOUND → REGENERATE | mock chain: 失败 → REGENERATE 成功 → 验证通过 |
| repairLockfile - MANIFEST_MISMATCH → REGENERATE | mock chain: 失败 → REGENERATE 成功 → 验证通过 |
| repairLockfile - CREDENTIAL_ERROR → SKIP | mock 失败，分类为 CREDENTIAL → 直接返回 SKIP |
| repairLockfile - REGENERATE 失败 → REINSTALL | mock REGENERATE 失败 → REINSTALL 成功 |
| repairLockfile - 所有策略都失败 | mock 全部策略失败，验证 attempts 记录完整 |
| repairLockfile - 回滚 | mock REGENERATE 失败 + REINSTALL 失败，确认 .bak 已还原且清理 |
| computeLockfileDiff | 在临时目录创建前后 lockfile，计算 diff |
| resolvePnpmVersion - packageManager | mock package.json 含 `"packageManager": "pnpm@10.5.2"` |
| resolvePnpmVersion - toolchain 优先 | toolchain.pnpmVersion 覆盖 packageManager |
| resolvePnpmVersion - 无声明 | 既无 packageManager 也无 toolchain，返回 null |
| createPnpmLockfileFixerDescriptor | 确认返回 stub descriptor 兼容 app.ts |

### 8.2 集成测试（真实 pnpm，临时目录）

| 场景 | 描述 |
|---|---|
| lockfile 缺失修复 | 删除 `pnpm-lock.yaml` → repairLockfile → 验证生成 |
| manifest 不一致修复 | 修改 package.json 版本 → repairLockfile → 验证一致性 |
| 修复后 frozen-lockfile 通过 | repairLockfile 后 `pnpm i --frozen-lockfile` 成功 |
| 修复后 diff 非空 | 验证 LockfileDiff 有合理变化 |

### 8.3 测试依赖

- `vitest`（已有）
- `node:child_process` mock（`vi.mock`）
- `node:fs` 临时目录操作（`fs.mkdtempSync` / `fs.rmSync`）

---

## 9. 实现文件清单

| 文件 | 说明 |
|---|---|
| `packages/cli/src/fixers/pnpm/index.ts` | 主实现：`repairLockfile`、分类、策略、diff |
| `packages/cli/src/fixers/pnpm/index.test.ts` | 完整测试 |
| `packages/cli/src/fixers/pnpm/types.ts` | 类型定义（按需，可能 inline 在 index.ts） |

现有文件修改（可选）：
- `packages/cli/src/app.ts` — 如果 descriptor 签名变化
- `packages/cli/src/index.ts` — 如果新增导出

---

## 10. 数据流

```
输入: repairLockfile({ workDir, toolchain? })
  │
  ├─ 1. 备份 pnpm-lock.yaml → *.bak
  │
  ├─ 2. 诊断: pnpm i --frozen-lockfile
  │     ├─ 成功 → 返回 { success: true, diff: null }
  │     └─ 失败 → classifyLockfileFailure(stderr) → category
  │
  ├─ 3. 按 category 选择首发策略
  │     ├─ CREDENTIAL_ERROR → SKIP, 直接返回
  │     └─ 其他 → 执行策略命令
  │
  ├─ 4. 逐级尝试 (escalating)
  │     ├─ Strategy N 执行成功 → 记录 attempt
  │     ├─ 验证: pnpm i --frozen-lockfile
  │     │   ├─ 通过 → computeLockfileDiff → 返回 success
  │     │   └─ 失败 → 下一个策略
  │     └─ 所有策略失败 → 回滚, 返回 failure
  │
  └─ 5. cleanup: 删除 .bak
```

---

## 11. 非目标 (Non-Goals)

- **不处理 npm / yarn**：当前仅支持 pnpm
- **不自动启用 corepack**：corepack 开关属于仓库基础设施层面
- **不修改 package.json**：仅修复 lockfile，不改 manifest
- **不实现完整 YAML diff**：仅统计行数和包数量变化
- **不做跨仓库锁版本管理**：不维护全局 pnpm 版本策略
- **不处理 `node_modules`**：优先使用 `--lockfile-only` 避免安装
