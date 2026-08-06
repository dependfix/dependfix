# T105 设计稿：依赖升级修复器

> 对应任务: [T105 实现依赖升级修复器](../../plan/todo-archive.md)
>
> **依赖**: T003（工具链模型）已完成，T104（过滤引擎）已完成
>
> **选型结论**: 直接修改 `package.json` 中目标包的版本号 + 执行 `pnpm install --no-frozen-lockfile` 更新 lockfile。不使用 `pnpm update`（它基于当前 range 更新，不适合精确版本定位）。升级前后备份关键文件，失败自动回滚。

---

## 1. 设计目标

- 对已过滤出的可修复告警执行单包精确版本升级
- 输出标准化修复结果（`fromVersion` / `toVersion` / `isMajor` / `success`）
- 升级失败（`pnpm install` 退出码非 0）时自动回滚 `package.json` 和 `pnpm-lock.yaml`
- 不在此层判断升级后的 lint/build/test 是否通过（由 T107 验证执行器负责）
- 纯函数设计（以 `workDir` 为工作目录，不硬编码路径）

---

## 2. 升级策略

### 2.1 选型对比

| 方案 | 描述 | 优点 | 缺点 | M1 采用 |
|------|------|------|------|:---:|
| `pnpm update <pkg>@<version>` | 让 pnpm 处理 | 简单 | 基于现有 range 更新，不会将 `^4.17.20` 精确掰到 `4.17.21` | ❌ |
| 直接改 `package.json` + `pnpm install` | 手动改版本号，再跑安装 | 完全控制目标版本，设为精确值 | 需解析/修改 JSON；需处理不同 save 类型 | ✅ |

### 2.2 执行流程

```
1. 读取 package.json
2. 查找目标包在哪个依赖组（dependencies / devDependencies / optionalDependencies）
3. 记录当前版本（fromVersion）
4. 备份 package.json + pnpm-lock.yaml（写入同一目录的 .bak 后缀）
5. 修改依赖组中的版本号为精确目标版本（如 "4.17.21"）
6. 写入 package.json
7. 执行 pnpm install --no-frozen-lockfile
       ├── 成功（exit code 0）→ 返回 DependencyFixResult { success: true }
       └── 失败（exit code ≠ 0）→ 回滚: 还原备份 → 返回 { success: false, error }
```

### 2.3 为什么使用 `--no-frozen-lockfile`

`pnpm install` 默认行为等同于 `--frozen-lockfile`（如果 lockfile 存在则不允许变更）。修改 `package.json` 后 lockfile 必然变化，必须显式 `--no-frozen-lockfile` 允许 lockfile 重生成。

---

## 3. 核心接口设计

### 3.1 函数签名

```typescript
// packages/cli/src/fixers/dependency/index.ts

export interface UpgradeDependencyParams {
    /** 包名（如 'lodash', '@babel/traverse'） */
    packageName: string
    /** 目标精确版本（如 '4.17.21'） */
    targetVersion: string
    /** 工作目录（包含 package.json 和 pnpm-lock.yaml） */
    workDir: string
}

/**
 * 单包升级结果。
 * 调用方根据 `success` 决定是否继续后续修复或进入验证。
 */
export interface DependencyFixResult {
    /** 包名 */
    packageName: string
    /** 升级前版本（从 package.json 读取，保留原始 range 格式） */
    fromVersion: string
    /** 升级后版本（精确版本号） */
    toVersion: string
    /** 是否为 major 升级（主版本号发生变化） */
    isMajor: boolean
    /** 升级是否成功 */
    success: boolean
    /** 失败原因（仅 success=false 时有值） */
    error?: string
}

/**
 * 升级单个依赖到指定版本。
 *
 * - 在 workDir 中查找 `package.json` 并修改目标包的版本为精确值
 * - 执行 `pnpm install --no-frozen-lockfile` 更新 lockfile
 * - 失败时自动回滚 package.json 和 pnpm-lock.yaml
 * - 不执行任何验证（lint/build/test），由 T107 负责
 *
 * @param params - 包名、目标版本、工作目录
 * @returns 修复结果
 *
 * @example
 * ```typescript
 * const result = await upgradeDependency({
 *     packageName: 'lodash',
 *     targetVersion: '4.17.21',
 *     workDir: '/path/to/repo',
 * })
 * // result = { packageName: 'lodash', fromVersion: '^4.17.20', toVersion: '^4.17.21', isMajor: false, success: true }
 * ```
 */
export async function upgradeDependency(
    params: UpgradeDependencyParams,
): Promise<DependencyFixResult>
```

### 3.2 内部 Helper

```typescript
// ---- 版本查找 ----

/**
 * 在 package.json 的 dependencies/devDependencies/optionalDependencies 中查找包。
 * 返回依赖组名称和当前声明的版本号。
 */
function findDependencyVersion(
    pkg: PackageJson,
    packageName: string,
): { group: 'dependencies' | 'devDependencies' | 'optionalDependencies'; version: string } | null

// ---- 版本解析 ----

/**
 * 从版本字符串提取主版本号。
 * 去除 range 前缀（^ ~ >= <= > < =）后解析。
 *
 * @example
 * parseMajorVersion('^4.17.20')   // → 4
 * parseMajorVersion('~2.0.0')     // → 2
 * parseMajorVersion('>=1.0.0 <2') // → 1
 * parseMajorVersion('3.0.0')      // → 3
 * parseMajorVersion('*')          // → -1
 */
function parseMajorVersion(version: string): number

// ---- 磁盘操作 ----

function readPackageJson(workDir: string): PackageJson
function writePackageJson(workDir: string, pkg: PackageJson): void
function backupFiles(workDir: string, files: string[]): void
function restoreBackups(workDir: string, files: string[]): void
```

### 3.3 与 T104（过滤引擎）的接口约定

T104 过滤引擎输出 `NormalizedSecurityAlert[]`，其中包含：
- `fixable: true` — 确保有可升级版本
- `fixStrategy: 'upgrade'` — 修复策略为升级
- `recommendedVersion: '4.17.21'` — 目标精确版本

T105 消费：
```
NormalizedSecurityAlert.packageName      ──► UpgradeDependencyParams.packageName
NormalizedSecurityAlert.recommendedVersion ─► UpgradeDependencyParams.targetVersion
NormalizedSecurityAlert.manifestPath        ─► 确定 workDir（分包路径）
```

---

## 4. 回滚策略

### 4.1 机制

| 步骤 | 文件 | 备份命名 |
|------|------|---------|
| 升级前 | `{workDir}/package.json` | `{workDir}/package.json.bak` |
| 升级前 | `{workDir}/pnpm-lock.yaml` | `{workDir}/pnpm-lock.yaml.bak` |

备份文件写入 `workDir` 同一目录，失败回滚时以此还原。

### 4.2 回滚触发条件

| 场景 | 行为 |
|------|------|
| `pnpm install` 退出码 ≠ 0 | 还原备份 → 返回 `{ success: false, error: 'pnpm install failed: <stderr>' }` |
| `package.json` 读取失败 | 不备份、不改写 → 返回 `{ success: false, error: 'package.json not found' }` |
| 目标包不在 `package.json` 中 | 不备份、不改写 → 返回 `{ success: false, error: 'package <name> not found in dependencies' }` |
| 备份写入失败 | 中止操作 → 返回 `{ success: false, error: 'failed to backup' }` |
| 回滚还原失败 | 记录严重警告日志 → 返回 `{ success: false, error: 'rollback failed, manual recovery required' }` |

### 4.3 清理

- 成功：删除 `.bak` 文件（可选，M1 不强制清理，后续 run 会自动覆盖）
- 失败：`.bak` 文件保留，供人工排查

### 4.4 为什么不用 git

M1 不在工作目录执行 `git stash` / `git checkout`：
- 依赖修复可能在工作副本（clone 后的临时目录），不一定有 git 历史
- 文件级备份更轻量、更快，不依赖外部工具

---

## 5. 版本号判定逻辑

### 5.1 查找依赖组

按以下顺序搜索，返回第一个匹配的：

```
1. dependencies
2. devDependencies
3. optionalDependencies
```

若 package 同时出现在多个组中（如 dependencies 和 devDependencies），只更新第一个匹配的组。

### 5.2 `fromVersion` 取值

保留 `package.json` 中的原始版本声明：

```json
{ "dependencies": { "lodash": "^4.17.20" } }
```
→ `fromVersion: "^4.17.20"`

**设计理由**: 调用方（T108 报告生成器）需要向用户展示"原来声明了什么"和"改成了什么"，而非显示某种解析后的值。

### 5.3 `isMajor` 判定

```
parseMajorVersion(fromVersion) !== parseMajorVersion(toVersion)  →  isMajor: true
parseMajorVersion(fromVersion) === parseMajorVersion(toVersion)  →  isMajor: false
parseMajorVersion === -1（无法解析）                             →  isMajor: false（保守）
```

解析策略：

```
1. 去除版本前缀正则: /^[\^~]?\s*/
2. 尝试匹配第一个 semver 段: /^(\d+)\.\d+\.\d+/
3. 若匹配到 → 返回 parseInt(组1)
4. 否则返回 -1
```

**不引入 `semver` 包**：二分法的简单正则已满足 M1 需求。M5（AI 研判）若需要完整 semver 比较再引入。

### 5.4 `toVersion` 取值

**保留原始版本声明的前缀策略**，而非强制设为精确版本。

| 原始声明 | 升级后 | 说明 |
|---------|--------|------|
| `^4.17.20` | `^4.17.21` | 保留 caret（允许 4.x 更新） |
| `~4.17.0` | `~4.17.21` | 保留 tilde（允许 4.17.x patch） |
| `4.17.20` | `4.17.21` | 原为精确版本，保留精确 |
| `>=1.0.0 <2.0.0` | `^4.17.21` | 复杂 range → 降级为 caret |
| `*` / `latest` | `^4.17.21` | 无明确策略 → 默认 caret |

**前缀提取算法**：
```
1. 若原始版本以 ^ 开头 → 目标版本 = "^" + targetVersion
2. 若原始版本以 ~ 开头 → 目标版本 = "~" + targetVersion
3. 若原始版本是精确 semver（不含 ^~<>=*） → 目标版本 = targetVersion
4. 其他（复杂 range / * / latest / URL） → 目标版本 = "^" + targetVersion
```

**设计理由**：
- 工具只负责修复漏洞，不应改变用户的版本策略
- `^4.17.21` 范围内的任何 semver 兼容版本都包含安全修复
- 如果用户故意用精确版本（如 `4.17.20`），说明他不想要自动升级，保留精确

---

## 6. 增量修复 vs 批量修复

### 6.1 M1 策略：增量修复

每个包单独调用 `upgradeDependency()` 一次：

```
for (const alert of fixableAlerts) {
    const result = await upgradeDependency({
        packageName: alert.packageName,
        targetVersion: alert.recommendedVersion,
        workDir,
    })
    results.push(result)
    if (!result.success) break // 一个失败则停止（调用方可配置）
}
```

### 6.2 设计理由

| 维度 | 增量修复 | 批量修复 |
|------|---------|---------|
| 失败隔离 | 单个包失败不影响其他包的结果 | 一个失败需全部回滚或跳过 |
| 回滚粒度 | 单包回滚（1 个文件 diff） | 全量回滚成本高 |
| 故障定位 | 直接知道哪个包出问题 | 需要逐一排查 |
| M1 适用性 | ✅ M1 单仓库告警量通常 < 100，逐个处理可接受 | ❌ 复杂度不划算 |

调用方（T109 CLI 编排器）负责策略选择。本模块只提供单次升级能力，不内置循环。

---

## 7. 错误分类

| 错误码常量 | 场景 | 是否可恢复 |
|-----------|------|:---:|
| `PACKAGE_NOT_FOUND` | 目标包不在 `package.json` 的任何依赖组中 | 是（跳过此包） |
| `PNPM_INSTALL_FAILED` | `pnpm install` 退出码 ≠ 0 | 否（回滚后停止） |
| `BACKUP_FAILED` | 备份文件写入失败 | 否（无法回滚，停止） |
| `ROLLBACK_FAILED` | 回滚文件还原失败 | 否（需人工介入） |
| `IO_ERROR` | 读取/写入 `package.json` 失败 | 否 |

所有错误通过 `AppError` 抛出，`code` 使用上述枚举值。

---

## 8. 测试策略

### 8.1 单元测试（`packages/cli/src/fixers/dependency/index.test.ts`）

| # | 场景 | 验证 |
|---|------|------|
| 1 | 正常升级 dependencies 中的包 | `success: true`, `fromVersion` 正确, `toVersion` 为精确值, `package.json` 已更新 |
| 2 | 正常升级 devDependencies 中的包 | `fromVersion` 来自 `devDependencies` |
| 3 | 正常升级 optionalDependencies 中的包 | `fromVersion` 来自 `optionalDependencies` |
| 4 | major 升级检测（`^4.x` → `5.0.0`） | `isMajor: true` |
| 5 | minor 升级检测（`^4.17.0` → `4.19.1`） | `isMajor: false` |
| 6 | 包不在任何依赖组中 | `success: false`, `error` 包含 `PACKAGE_NOT_FOUND` |
| 7 | `pnpm install` 失败 | 回滚 → `package.json` 恢复原值, `success: false` |
| 8 | 工作目录无 `package.json` | `success: false`, `error` 包含路径信息 |
| 9 | scoped 包名正常升级 | `packageName: '@babel/traverse'`, 依赖组查找正确 |
| 10 | 版本号前缀 `~` `>=` `<` 正常解析 | `parseMajorVersion` 覆盖各前缀格式 |

### 8.2 集成测试（临时项目 Fixtures）

在测试中动态创建最小 pnpm 项目：

```
test-tmp/
├── package.json       # { dependencies: { "lodash": "^4.17.20" } }
├── pnpm-lock.yaml     # 正常 lockfile（需预先生成或 mock）
└── .gitignore
```

测试流程：
1. 写入临时 `package.json` + `pnpm-lock.yaml`
2. 调用 `upgradeDependency({ packageName: 'lodash', targetVersion: '4.17.21', workDir })`
3. 验证 `package.json` 中版本变为 `"4.17.21"`
4. 验证 `pnpm-lock.yaml` 已更新（lodash 版本变化）
5. 清理临时目录

> 依赖：需 `pnpm` 在测试环境可执行。若 CI 环境无 pnpm 二进制，集成测试用 `it.skip()` 跳过。

### 8.3 测试依赖

```json
// 无需新增依赖
// - fs-extra: 已在 deps 中（文件读写）
// - zx: 已在 deps 中（执行 pnpm install）
// - vitest: 已在 devDeps 中
```

---

## 9. 实现文件清单

| 文件 | 说明 |
|------|------|
| `packages/cli/src/fixers/dependency/index.ts` | `upgradeDependency()` + 内部 helpers（替换现有 stub） |
| `packages/cli/src/fixers/dependency/index.test.ts` | 10 个单元测试 |
| `packages/cli/src/fixers/dependency/__fixtures__/` | 临时项目 directory（集成测试动态创建，不需静态文件） |

> 不新增 npm 依赖。所有所需工具已在 `packages/cli/package.json` 中。

---

## 10. 数据流

```
T104 (filter) 过滤后的 NormalizedSecurityAlert[]
    │
    │  fixable=true, fixStrategy='upgrade', recommendedVersion='4.17.21'
    ▼
T105 (upgradeDependency)
    │
    ├── 读取 package.json → 查找目标包 → 获取 fromVersion
    ├── 备份 package.json + pnpm-lock.yaml
    ├── 修改 package.json（精确版本）
    ├── 执行 pnpm install --no-frozen-lockfile
    │       │
    │       ├── 成功 → 清理 → 返回 DependencyFixResult { success: true }
    │       └── 失败 → 回滚 → 返回 DependencyFixResult { success: false, error }
    │
    ▼
T107 (验证执行器)
    │
    │  pnpm install --frozen-lockfile → pnpm lint → pnpm build
    ▼
T108 (报告生成器)
```

---

## 11. 非目标 / 已解决

- ~~不处理 transitive（间接）依赖的升级（M5 AI 研判）~~ → **M2 已实现** `overrideTransitiveDependency()`，通过 pnpm overrides 修复间接依赖
- 不处理 workspace 协议（`workspace:*`）的版本替换
- 不处理 git/file 协议的依赖版本
- ~~不支持 pnpm overrides / pnpm.patchedDependencies~~ → **M2 已实现**，支持 `pnpm-workspace.yaml` 和 `package.json#pnpm.overrides` 双路径
- 不在此层判断升级后是否破坏 lint/build/test（T107 负责）
- 不引入 semver 包做完整版本比较
- 不支持跨工作区批量升级（M4 T401）
- 不生成 `pnpm list --json` 做重验证（性能不划算）

---

## 12. 设计演进记录

### 12.1 间接依赖判定：行为反馈优先于 API 字段预判断

- Dependabot API 的 `dependency.relationship` 可能为 `null`，不能作为直接/间接依赖的唯一判定依据
- 做法：try→fallback——先尝试直接升级，失败且错误为"not found in dependencies"时回退 overrides 修复

### 12.2 防护要"精确修复"而非"扩大跳过"

- 根直接依赖 + lockfile 告警的 P0 防护从"整体跳过"演进为：多版本共存 → 版本化 overrides（精确修复）；单版本 → 维持跳过
- 原则：防护降级为"跳过/人工处理"时，应追问"能否精确修复"，而不是扩大跳过范围掩盖真实问题

### 12.3 多版本共存 → 版本化 overrides

- 同一包在 lockfile 共存多个大版本时，单一 `pkg: version` 全局覆盖会误伤根声明
- 做法：对每个脆弱实例生成 `pkg@version: ^target`，只影响对应实例
- 约束：**只覆盖与 target 同 major 且低于目标的实例**（跨 major 会破坏子工作区且根验证无法覆盖）；同包多告警取 recommendedVersion 最高者；单版本根直接依赖维持 sub

### 12.4 单版本根直接依赖：推荐版本 >= 锁定版本时可安全修复（C10）

- 12.2 的"单版本 → 维持跳过"细化为**按版本关系判定**（2026-08-06）：
  - 推荐版本 >= 锁定版本 → root 可修：直接升级保留前缀不降级；override 回退为**精确版本**（`extractPrefix` 从裸 lockfile 版本取 `''`），精确版本 >= 锁定版本，不降级声明
  - 推荐版本 < 锁定版本 → sub（全局 overrides 会降级声明，run 30929090403 教训不变）
  - lockfile 无版本信息 → sub（无法判断降级风险，保守）
- 语义：以"是否降级声明"为唯一判据，而非一刀切跳过

### 12.5 workspace 成员包直接依赖识别（C11）

- 12.2 的"根直接依赖"判定扩展为"根 + 全部 workspace 成员包"（2026-08-06）：
  - pnpm-workspace.yaml `packages` glob 展开（字面路径 / `dir/*` / `dir/**` / `**`，递归收集子目录；`.` 与排除模式除外）
  - 成员包直接依赖 + 单版本 + 推荐 < 锁定 → sub（修复前会错误走全局 override 降级成员声明）
  - 已知限制：`!` 排除模式未处理（多算 sub，保守方向）；`**` 递归不跟随符号链接
