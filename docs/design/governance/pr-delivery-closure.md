# 对外 PR 交付闭环设计（M48）

> **状态**：✅ 已实施（2026-10-24 P 阶段落地；M48.1-M48.6 六原子于 2026-10-25 全部闭环，归档见 [M48](../../plan/archive/todo-archive-phases-m48.md#m48-对外-pr-交付闭环-2026-10-24-用户决策-d-e-2026-10-25-归档)）；§16（基线红交付降级）为 M51.4 增量（2026-10-30）
> **来源**：2026-10-24 对外 PR 巡检 + [backlog](../../plan/backlog.md) 8 项同源候选
> **定位**：回答「dependfix 发出去的 PR 是否真的能绿、失败后是否还会原样重来、合并后的红 check 该归因给谁」

## 1. 背景与问题

### 1.1 巡检实证

| 现象 | 样本 | 代表 PR |
|:--|:--|:--|
| 本地 4 项验证全绿、CI 仍有红 | 6 个已建 PR | `push-all-in-one#551` / `#556`（`pnpm run coverage` 崩） |
| 同一生态跨大版本混装 | 2 个红 PR | `vitest@^4.1.11` + `@vitest/coverage-v8@^3.2.4` |
| 同一告警反复开 PR | 4 次 / 3 次 | `push-all-in-one#551→#556→#569→#570`；`rss-impact-server#1093/#1095` |
| 提交混入与修复无关的文件 | 7 个可查 PR | `CHANGELOG.md` 空改、`.nuxtrc`、`auto-imports.d.ts` |
| `pnpm-workspace.yaml` 整文件重排 | 3 例 | `picgo-plugin-optimization#151`（+19/−18） |
| 合并后红 check 无法归因 | 21 个已合并 PR | Dependabot updater 10 / ACR manifest 3 / 父提交已红 4 / 取消 1 |
| 合并全部靠人工点击 | 60 个已合并 PR | 中位 48 分钟、p90 5.4 小时、最长 2.5 天 |

**样本口径**：60 = 本轮巡检的已建 / 已合并 PR 样本；66 = 含历史可查 PR；测量时点 2026-10-24。两套分母不互换。

### 1.2 根因链

1. **写入侧不做家族约束**：依赖修复按告警逐包升级，兄弟包可以跨大版本共存 → 工具链内部崩溃。
2. **验证侧只跑固定四语义项**：目标仓库 CI 独有的 `coverage` / `e2e` / `visual` 脚本永不执行 → 本地绿 ≠ CI 绿。
3. **交付侧不记尝试**：去重只看 `state:'open'` 的 PR，关闭后下一次运行原样重来 → 红 PR 循环。
4. **提交面过宽**：`git add .` 把安装 / 构建副产物一起提交 → diff 噪声与合并冲突面。
5. **回环缺失**：CLI / Action 建完 PR 即结束；平台 PR Check 只看 open PR 且只告警。
6. **归因缺失**：合并后的外部作业红与「本次修复改坏」同列 → 质量判断失真。

### 1.3 与既有能力的边界

- [验证链与目标仓库 CI 口径对齐](./verification-ci-alignment.md)（M47.1）已解析 workflow 并披露 `unrecognized`，**明确不执行、不阻断**；本设计在其上增加「可选执行」，并新增结构化命令导出，不复用展示字符串。
- [PR 构建与部署信号采集](./pr-build-deploy-signals.md)（M24.1 / M43.2）只轮询 **open** PR，且「失败即显」与 mergify 决策解耦；本设计不改其解耦原则。
- [PR 自动合并指南](../../guide/auto-merge.md)（M21.4）已提供 mergify 模板与启用说明；本设计只补条件与文档，**不自动在目标仓启用**。
- [依赖分组升级设计](../modules/dependency-grouping.md) 已登记「组内必须锁步的包」遗留项；M48.1 承接该遗留项，但只覆盖精选家族，不扩成通用依赖图。

## 2. 目标与非目标

**目标**：把「一次修复尝试」从生成到合并收口为可观测、可去重、可归因的闭环，使「PR 绿」成为可验证事实而非本地推断。

**非目标**：

- 不做通用依赖图 / 全生态家族推导（仅精选家族 + peer range 校验）。
- 不解析 workflow 的 matrix / secrets / services 完整语义（沿用 M47.1 边界）。
- 不执行 `docker build` / 任意 shell（只执行目标仓库 `package.json` 中可解析的 `pnpm/npm/yarn run <script>` 子集）。
- 不新建平台持久表（尝试计数以 PR 正文标记为权威载体）。
- 不自动在目标仓启用 mergify，不做合并后 check 的新采集链路（登记后续候选）。
- 归因只驱动报告 / 平台 UI / 关闭判定，**不绕过 mergify 的 `check-success` 门禁**。
- 平台侧创建 PR 后的回环（等待 / 评论 / 关闭）不在本阶段；只覆盖 CLI / Action 路径。
- 不改 exit code 语义、不改 `PRE_EXISTING_FAILURE` 既有归因口径。

## 3. 总体模型

```text
alert ──▶ 家族解析（M48.1）──▶ 升级 + 验证（M48.2）──▶ 提交（M48.4）──▶ PR（M48.3 尝试计数）
                                                                  │
                                             ┌────────────────────┘
                                             ▼
                               PR checks 回环（M48.5）──▶ 结果分类（M48.6）
                                             │
                             ┌───────────────┼────────────────┐
                             ▼               ▼                ▼
                         self_caused      pre_existing     external_noise
                             │               │                │
                       关闭判定 / 评论      不归因            不归因
```

**单一事实源**：家族规则、尝试指纹算法、提交路径集合、check 分类规则均为纯函数 / 常量表，报告、CLI、平台共用；禁止三处各写一份。

**实施顺序**：M48.6 的分类纯函数先落地（无副作用、可用夹具与平台现有数据验证），M48.5 的回环再消费它，避免 M48.5 → M48.6 的循环依赖。

## 4. M48.1 家族锁步升级

### 4.1 家族清单

**决策 D1**：精选清单为权威，`peerDependencies` 仅作兼容性校验（不自动扩展成员）。

| 家族 | 锁步成员 | 锁步维度 | 关联校验（不锁步） |
|:--|:--|:--|:--|
| vitest | `vitest` / `@vitest/coverage-v8` / `@vitest/ui` / `@vitest/browser` | 同 major | — |
| typescript-eslint | `@typescript-eslint/parser` / `@typescript-eslint/eslint-plugin` / `typescript-eslint` | 同版本 | `eslint` 按 peer range 校验；`typescript` 兼容性不锁步 |
| jest | `jest` / `@types/jest` | 同 major | `ts-jest` 按 peer range 校验 |
| react | `react` / `react-dom` / `@types/react` / `@types/react-dom` | 同 major | — |

**反例（必须锁定）**：`eslint@9` + `typescript-eslint@8` 是官方支持组合，**不得**判为锁步违规；把 `eslint` 塞进同 major 家族会把合法组合判红。

### 4.2 升级规则

1. **优先级**：显式 `upgradeGroups` > 家族规则 > 单包升级；同一包同时命中时只执行最高优先级一次。
2. 命中家族的告警升级时，解析同家族中**低于目标版本线**的其它成员，统一升到目标线（不要求与触发包同一旧线）。
3. 已在 / 高于目标线的成员保持不动（不降级）；**不在 manifest 中**的成员与协议声明成员记 `familyMemberSkipped` 并继续；`version` 锁步家族中成员高于目标 → 整族放弃（无法在不降级前提下同步）。
4. **版本解析失败**（registry 不可达 / 无法确定目标版本）→ 整族放弃（写盘前失败，无需回滚），`FixAction.error = FAMILY_LOCKSTEP_FAILED`；非环境性失败告警计 failed、影响 exit code，不产生部分升级。
5. 家族升级必须**原子**：任一成员安装 / 验证失败 → 整体回滚（含 lockfile）；非环境性失败告警计 failed，环境性安装失败记 `ENVIRONMENT_ERROR`（不归因、不计 failed）。
6. `--allow-major-upgrade` 语义不变；本规则只保证同一次升级内部不劈叉。
7. `override-protect` 命中任一成员时整族放弃并留痕，不先生成半族 PR。

**实施口径（D 阶段定稿，与 `dependency-fixer-records.md §12.17` 同源）**：

- 触发包按**告警推荐版本**判定（同 major 内补丁升级同样写盘）；其它成员按锁步维度比较，`major` 取该 major 下最高**稳定版**（排除预发布），`version` 要求精确版本已发布。
- `familyMemberSkipped` 覆盖不在 manifest 的成员与协议声明（`workspace:` / `catalog:` 等）成员；只有**同一 manifest** 内的直接依赖会同批写盘，间接依赖仍走 overrides 链。
- 仅当「至少两个成员需要写盘」时走家族写入，否则退回既有单包路径（行为等价）；`dry-run` 不解析 registry、不写盘。
- 显式 `upgradeGroups` 的组内告警目标 / 同批告警目标优先于 registry 解析结果；同版本家族「成员高于目标」→ 整族放弃（不允许降级）；peer range 不可解析 fail-open 并记 `peerCheckSkipped`，可解析且不满足 → 整族放弃。

### 4.3 契约

- `FixAction` 增加可选 `family?: { id: string, members: string[], skipped: string[] }`（`packages/core/src/report/types.ts`）。
- 报告新增一段「家族锁步」摘要（命中家族 / 写盘成员 / 跳过成员；按仓库收敛，`members ∩ skipped = ∅`）：`packages/core/src/report/family.ts` 为报告与 PR 正文的单一摘要源，只消费成功且非 noOp 的动作（回滚动作不渲染为已落地）。
- 审计事件记录 `FAMILY_LOCKSTEP_FAILED`（解析 / peer / 非环境性写入失败；环境性安装失败走 `ENVIRONMENT_ERROR`）与 `OVERRIDE_PROTECTED`（保护名单命中），均登记到既有审计类别口径与平台失败分类映射。

### 4.4 已知边界

- 只覆盖同一 manifest 内的直接依赖；间接依赖走既有 overrides 链，跨 manifest 家族（如根 vitest + 成员 coverage-v8）不做合并。
- 成员版本解析依赖 registry 可达；基地址取 `npm_config_registry` → 目标仓库 `.npmrc` 裸 `registry=` → 官方 registry（**`@scope:registry` 不在覆盖范围**），解析失败整族放弃（未写盘）。目标仓库的 registry 配置按既有 registry-discovery 信任模型视为可信；解析请求不携带凭据（userinfo 剥离）、不跟随重定向、仅接受 http(s)，错误消息只暴露 host。
- 不承诺 TypeScript 编译器与 typescript-eslint 的兼容矩阵，只做 peer range 校验；不兼容时整族放弃并留痕。
- [dependency-grouping](../modules/dependency-grouping.md) 的「组内必须锁步」遗留项由本条承接；分组（同批验证）与家族（版本一致）语义不同，不合并实现。

## 5. M48.2 CI 独有脚本纳入验证链

### 5.1 解析

`parseWorkflowCommands` 的 ok 结果新增 `runFragments`（原始命令 + `recognized|unrecognized` + workflow）：`recognized` 为**与默认链形式等价**的单一形态语义项（lint / build / typecheck / test）与 install（install 无论 flag 均视为已覆盖，不重复执行、不披露）；带 flag / env 赋值 / corepack 钉定的语义项归 `unrecognized`（否则既不执行也不披露）。**不复用**展示用 `unrecognized`（截断 120 字符 / 每文件 5 条）。片段只在镜像计划时收集（口径比对不收集，避免大 workflow 内存占用）；单 workflow 片段超 2000 即整体降级（不拿截断结果执行）。`planCiMirrorCommands(workDir)` 只把**单一形态** `pnpm|npm|yarn [run|run-script] <script>` 且脚本存在于 `package.json#scripts` 的片段列为候选；带 flag（`--filter` / `-r` / `--if-present`）、额外参数、环境变量赋值、corepack 版本钉定、`docker` / `gh` / 任意 shell 记 `unsupported-command`，脚本不存在记 `script-not-found`，超 3 条记 `over-limit`。

### 5.2 执行开关

**决策 D2**：`RuntimeConfig.mirrorCiScripts`（CLI `--mirror-ci-scripts` / Action `mirror-ci-scripts` / env `DEPENDFIX_MIRROR_CI_SCRIPTS`，默认 `false`）。开启后在默认链**之后**经同一 `runVerification` 执行（首失败即停、按 workflow 顺序去重、≤3 条）；**只校验命令形态与脚本存在性，不审计脚本体**（脚本内命令与 `pre`/`post` 钩子照常执行）；显式自定义链（`--commands` / Action `commands` / 平台 `verifyCommands`）整链替换、**不与 mirror 叠加**；平台不新增开关（默认 `false`）。

### 5.3 预算与归因

超时沿用 `DEFAULT_COMMAND_TIMEOUT_MS`（10 分钟；env `DEPENDFIX_VERIFY_TIMEOUT_MS` 可覆盖，10s–30min），不引入第二个计时器；mirror 命令经同一 `resolveVerifyCommands` 进入修复前基线与运行级取消面，基线已红 → `preExisting`（不回滚、不改 exit code），非基线失败经验证门禁归因本次改动。

### 5.4 契约

`CiAlignmentRecord.mirrored` / `mirrorSkipped`（**两者均可选**，兼容历史 JSON；`mirrored` 只含实际执行集）；`FixAction.commandSource`（`default` / `repo-config` / `ci-mirror`）逐条标注报告来源；PR 正文「CI 口径」增加「已镜像执行 N 条 / 跳过 M 条」（开启时 0 条也展示，占固定 ≤5 行预算首位）；同仓库多次验证 `mirrored` 取并集、`mirrorSkipped` 去重。

## 6. M48.3 同告警尝试指纹去重

### 6.1 指纹键

```text
attemptKey = sha256([source, packageName, targetVersion, planStrategy].join('\u0000')).slice(0, 16)
```

- `planStrategy` 是**计划**标签（`direct-upgrade` / `override` / `member-upgrade` / `family-lockstep`），由告警 `dependencyType` + manifest 归属 + 家族清单解析；执行结果策略（`versioned-override` 等）不参与，两类标签不得混用。
- 该键在**创建 PR 前**即可计算，不依赖失败文本；命名空间隐含于仓库作用域（读取按单仓索引，键本身不含 repo）。
- 若 M48.5 开启并观察到 CI 失败，可附带 `failureSignature`（失败命令 + 首 2KB 错误归一化）写入标记；**签名只增强证据，不改变计数口径**。

### 6.2 载体与计数

**决策 D3**：PR 正文 HTML 注释为权威载体（CLI / Action 通用，无需迁移；平台交付链不写标记，见 §6.4）：

```html
<!-- dependfix:attempt key=<key> n=<n> fp=<optional> failed=<0|1|?> -->
```

- 标记写在正文**头部**（正文超 64KB 时从尾部截断，尾部标记会被丢）；一个 PR 可携带多条标记（一次修复覆盖多条告警），同键去重取最大 `n`。
- 创建 PR 时写入 `n` = 同 key 的最近关闭 PR 数 + 1（同日被 supersede 关闭的同键 PR 不计入该次快照，故 `n` 可能小于下一次实际计数；跳过判定按 PR 数而非 `n`，不影响正确性）；`fp` / `failed` 仅在 M48.5 观察到结果后 PATCH 回写。
- 只有**真正执行过**的键才写标记：计划阶段记录但随后因 pristine 安装基线失败 / 验证门禁回滚 / 无交付物而未执行的键不写（否则会白耗一次尝试额度）。
- 读取：按仓库缓存一次最近 50 条 `state:'closed'` PR 索引（运行级缓存，不按告警重复拉取），按 `dependfix/auto-fix-` 前缀 + `key` 匹配；**只计未合并**的关闭 PR（合并即修复落地，不消耗尝试额度）。
- 标记解析失败 / 查询失败按未命中处理（fail-open）：只可能多尝试一次，不会误跳过。

### 6.3 命中行为

**决策 D7**：同 key 已有 2 个关闭 PR（即第 3 次尝试）起跳过并记账；前两次允许尝试。**判定时点**：告警分区完成、**修复前基线采样与任何写盘之前**；命中即跳过，不白跑升级安装与验证链。

- 跳过时：`FixAction.noOp = true`（`strategy: 'repeated-failure'`）；`alertsSkippedByReason['repeated-failure'] += 1`（`SKIP_REASONS` 新增 key，保持 `sum(...) === alertsSkipped`）；不创建 PR、不增 `alertsFailed`。
- 全部告警命中时与零告警仓库同语义：不采样修复前基线（`hasWork = 剩余告警数 > 0`）。
- `--retry-failed`（CLI）/ `retry-failed`（Action input）/ env `DEPENDFIX_RETRY_FAILED` 显式忽略命中，强制再试一次，报告 `Repeated Failure Attempts` 段标注 `forced (manual retry)`。
- 目标版本变化、advisory 撤回 / 关闭 → key 自然失效。

### 6.4 已知边界

- 关闭 PR 不在最近 50 条、或查询失败时可能漏命中（fail-open）。
- 无 CI 判定即被人工关闭的 PR 计为一次尝试；`--retry-failed` 为逃生通道。
- 指纹依赖 PR 正文未被人工改写；被改写后退化为未命中。
- 跳过只覆盖依赖升级链路，且与「无工作」同语义：**全部**告警命中时不采样修复前基线、也不跑 lockfile repair（保持工作区 pristine，否则 `noChanges` 归因豁免前提被打破）；终验在「repair 真改文件或有成功升级动作」时保留，0 写入时按 [dependency-fixer-records.md §12.9](../modules/dependency-fixer-records.md#_12-9-验证链与既有失败基线-默认链-既有失败归因-零告警按需采样) 跳过（`no-write`）；**部分**命中时 repair 与终验照既有语义执行。
- 多仓运行只有 PR 落点仓库（第一个仓库）参与计数，其余仓库不判定（避免在 A 仓计 B 仓的尝试）。
- 平台交付链（容器执行器固定 `fix` 模式 + `platform-delivery` 建 PR）不产出也不读取尝试标记：平台建的 dependfix PR 关闭后**不消耗**尝试额度；跨 runner 混用（平台关 PR、CLI 计数）只会少计（fail-open），不会误跳过。平台侧计数支持为独立候选（backlog），不在本阶段。
- 不在本阶段做「按失败签名跨仓库聚合」；平台侧不建表、不加设置页开关。

## 7. M48.4 提交面白名单与 YAML 定点编辑

### 7.1 提交路径集合

**决策 D4**：提交时执行 `git add -- <paths>`（不再通配暂存），集合 = 固定白名单 ∪ fixer / AI patch 声明路径。

- 固定白名单：任意层级 `package.json`（成员 manifest）+ 仓库根 `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc` / `.gitignore`
- 声明路径：`FixAction.changedPaths`（AI patch 多文件）与 `FixAction.filePath`（code-scanning 单文件），仅取**成功且非 noOp** 的动作（回滚掉的写盘不留声明）
- 生成物黑名单（一律不提交，且不触发未声明告警——构建会重写它们）：`.nuxtrc` / `auto-imports.d.ts` / `components.d.ts` / `.nuxt/**` / `dist/**` / `node_modules/**` / `.pnpm-store/**` / `dependfix-reports/**`
- 路径校验：拒绝绝对路径（含 Windows 盘符）、`..` 段、pathspec magic（`:(` 开头）、控制字符、空路径；`\` 统一归一为 `/`

### 7.2 未声明改动处理

- 未声明的**已跟踪**改动 → `UNEXPECTED_CHANGES`（打印路径，不建 commit / PR）；平台映射 `deliver` + `deterministic`，并计入 `scan-run-state` 的交付失败类别
- 未跟踪文件默认忽略，仅声明集合内的新文件会进入提交
- 提交集合为空（只有生成物 / 未跟踪文件）→ `NO_CHANGES`
- 索引区已有暂存内容同样纳入判定：不在提交集合内的暂存改动 → `UNEXPECTED_CHANGES`（`git commit` 会连带提交索引，故拒绝而不擅自 `git reset` 用户暂存区）
- workDir 为仓库子目录时，仓库根范围内的已暂存改动同样拒绝（`(outside workDir)`）；未合并冲突（`UU` / `AA` / `DD`）直接拒绝（`git add` 会按工作树一侧静默「解决」冲突）
- 已知边界：目标仓库存在运行前未提交改动时按「未声明改动」拒绝（不静默销毁、不混合提交）；`preExistingDirty` 的既有回滚保护面不变

### 7.3 YAML 定点编辑

`overrides` 写入改用 `YAML.parseDocument` + `setIn`（`fixers/dependency/workspace-yaml.ts`）：只改目标键，注释 / 引号风格 / 键序保留，写回保证单个尾随换行并沿用原文件行尾（CRLF / LF）。解析失败（重复键 / 别名 / 顶层非映射 / 非法语法）、`overrides` 非映射、键值非标量 → **不写盘**并返回原因（`precheck` 失败，不降级为整文件重写）；`overrides:` 空值先物化为映射再写入（段注释与键位保留，该行的行内尾注释会随空值节点被替换而丢失——已知边界）。回滚以**备份还原为权威**（字节级），定点删除 / 恢复旧值仅在备份不可用时兜底，且按**实际写入的 key** 回滚（归一化可能命中既有写法）。

### 7.4 验证

- 黄金夹具：单引号 / 无引号 / 含注释三种风格，断言「仅目标键变化」
- 真实临时仓库：预置生成物 + 未声明改动，断言提交集合只含白名单 / 声明路径，未声明改动报 `UNEXPECTED_CHANGES`
- AI patch 路径与 fixer 声明取并集；空集合报 `NO_CHANGES`；mutation 至少 2 处（路径集合 / 未声明检测）

## 8. M48.5 PR 创建后 CI 回环（CLI / Action 侧）

### 8.1 状态机

```text
created ──▶ polling ──▶ passed
                    ├──▶ failed(self_caused | external_noise | pre_existing | unknown)
                    ├──▶ cancelled（记录，不评论）
                    ├──▶ no_ci_detected（宽限期后仍 0 check，不按 passed）
                    └──▶ timeout（评论标注未判定）
```

数据源：`checks.listForRef` + **分页** `listCommitStatusesForRef`（与平台侧既有取舍一致，避免 combined status 明细上限）。

**终态**：所有 check `status === 'completed'` 且**已观测到至少一条 check**（创建后宽限 ≥60s 且至少两轮轮询）；宽限期后仍为 0 → `no_ci_detected`，绝不判 `passed`。

**失败判定 fail-closed**：`unknown` 结论（GitHub 新增 / 未识别）与 `startup_failure`（workflow 无法启动）都按**失败但未判定**处理——绝不当作成功或取消，否则红 PR 会静默挂在「通过 / 已取消」里。

### 8.2 轮询与预算

**决策 D5**：默认关闭，`--wait-pr-checks` / Action input `wait-pr-checks` 开启。

- 间隔 15s 起，指数退避到 60s。
- **per-PR 上限**默认 15 分钟（`DEPENDFIX_PR_CHECK_TIMEOUT_MS`）；**per-run 总预算**默认 20 分钟（`DEPENDFIX_PR_CHECK_RUN_BUDGET_MS`），且不超过剩余 job 预算的 70%。job 预算基线缺省只在 `GITHUB_ACTIONS=true` 时按 25 分钟套用（`DEPENDFIX_JOB_BUDGET_MS` 可显式覆盖；本地 / 平台执行不臆造）。超时报告记录绑定来源（`pr` / `run` / `job`）。
- 预算耗尽时，未完成的 PR 记 `checksTimedOut`，保留 PR，交给后续运行 / 平台 PR Check。
- **per-run 预算跨 PR 累计**：已消耗 = 已记录 attempt 的 `durationMs` 之和；`runBudgetExhausted` 后同轮后续 PR 不再等待（直接记 `timeout`）。
- 每个仓库最多 1 个并发等待；API 429 按退避重试并记录。
- 与平台 PR Check 轮询互不复用：CLI 侧只等待本次创建的 PR，不写平台库。

### 8.3 处置动作

| 动作 | 触发 | 默认 | dry-run |
|:--|:--|:--|:--|
| `report` | 任意终态 | 总是写运行报告 | 写报告 |
| `comment` | failed / timeout | 是（附失败 job 名 + URL + 尝试标记） | 不评论 |
| `close` | failed 且分类 `self_caused` | 否（`--close-failed-pr` 显式开启） | 不关闭 |

- `unknown` **只评论不关闭**；`external_noise` / `pre_existing` 只评论。
- 聚合归因：仅当**所有**失败项一致为 `self_caused` 才关闭；混合归因 → `unknown`（只评论，宁可不关）。
- 关闭时同步删除分支（`--close-failed-pr` 语义包含 cleanup），报告记 `closedByDependfix`。
- `cancelled` 不评论；`no_ci_detected` 只报告。

### 8.4 已知边界

- 只在 PR 创建后的单次运行内等待，不做跨进程续等。
- GitHub Actions job 总时长 25 分钟；per-run 预算必须低于该值。
- **平台侧创建 PR 后的回环不在本阶段**（平台仍沿用 PR Check 轮询 + 告警），登记后续候选。
- 同一 ref 的 check run 若保留被 re-run 覆盖的旧条目，仍会按「存在失败即 `failed`」处理（只评论、不关闭）；按作业名取最新一轮的收敛留待后续。

## 9. M48.6 外部作业归因与自动合并门禁

### 9.1 分类枚举

```ts
type CheckAttribution = 'self_caused' | 'pre_existing' | 'external_noise' | 'cancelled' | 'unknown'
```

规则表（纯函数 `classifyCheckFailure`）：

| 规则 | 判定 | 归属 |
|:--|:--|:--|
| job 名含 `dependabot` / `updater` 且结论为 `security_update_not_possible` / advisory withdrawn | 文本 + 事件 | `external_noise` |
| job 为镜像 / registry 推送且错误含 `unknown manifest class` / `manifest unknown` | 错误签名 | `external_noise` |
| 父提交同 job 已红（任意 job；`Cloudflare Workers Builds` / `Release` 为已知实例） | 父提交比对 | `pre_existing` |
| **硬失败**（`failure`）且父提交同 job 为绿 | 父提交比对 | `self_caused` |
| 结论为 `cancelled` / `skipped` / `stale` | 结论 | `cancelled` |
| 其余失败（含父提交无该 job / 未完成） | 兜底 | `unknown` |

**决策 D6**：未知形态一律 `unknown`，不得默认 `self_caused` 或 `external_noise`。父提交比对**不按作业名白名单**限制（两侧对称：红 → `pre_existing`，绿 → `self_caused`）；`timed_out` / `action_required` 视为基础设施抖动，即使父提交绿也按 `unknown`（只评论不关闭）；同一 PR 多个失败项归因不一致 → 聚合 `unknown`（关闭要求一致归因）。

### 9.2 呈现与关闭

- 运行报告新增「check 归因」小节（按分类计数 + 代表 job）。
- 平台 PR Check 详情使用同一分类标签。
- 归因只驱动报告 / UI / 评论 / 关闭：关闭仅 `self_caused`；`unknown` 评论标注未判定。
- **归因不参与自动合并放行**：mergify 仍以 `check-success` 全绿为唯一条件；`external_noise` / `pre_existing` 只是「解释」，不是「豁免」。

### 9.3 mergify 条件

`.github/mergify.yml` 的两条规则（dependabot / dependfix）统一补齐同批 job：

- `check-success=Test`
- `check-success=Coverage`
- `check-success=E2E`
- `check-success=Visual Regression`

说明：`skipped` 不等于 `success`，目标仓若对某些 job 做路径过滤，需自行裁剪条件；`build` 属 `Publish Docker Image` 独立 workflow（仅 master push 触发），不产生 PR check，不纳入。

**边界**：模板与文档更新仅作用于本仓库；目标仓库是否启用仍由用户按 [auto-merge 指南](../../guide/auto-merge.md) 执行。

### 9.4 采集边界

合并后 check 的**新采集链路**不在本阶段范围（平台 monitor 仍只拉 open PR）。本阶段消费：

- CLI / Action 自带 PR 的 check 结果（M48.5）；
- 平台已轮询到的 open PR check 结果；
- 外部巡检脚本 / 人工提供的合并后快照（只做离线报告与分类）。

## 10. 契约汇总

### 10.1 配置

| 键 | 形态 | 默认 | 作用域 |
|:--|:--|:--|:--|
| `mirrorCiScripts` | boolean | false | engine / CLI / Action（env `DEPENDFIX_MIRROR_CI_SCRIPTS`） |
| （env）`DEPENDFIX_VERIFY_TIMEOUT_MS` | number | 600000 | engine（默认链与 CI 镜像脚本共用的单命令超时；10s–30min，越界回退默认） |
| `waitPrChecks` | boolean | false | engine / CLI / Action |
| `prCheckTimeoutMs` | number | 900000（per PR） | engine |
| `prCheckRunBudgetMs` | number | 1200000（per run） | engine |
| `jobBudgetMs` | number | 未设置（Actions 环境按 25 分钟兜底） | engine（env `DEPENDFIX_JOB_BUDGET_MS`） |
| `closeFailedPr` | boolean | false | engine / CLI / Action |
| `retryFailed` | boolean | false | engine / CLI / Action |
| `onBaselineRed` | `'skip' \| 'issue' \| 'draft'` | `skip` | engine / CLI / Action（env `DEPENDFIX_ON_BASELINE_RED`；Action input `on-baseline-red`；无 CLI flag） |

### 10.2 报告字段

- `FixAction.family`（M48.1）；`SKIP_REASONS` 新增 `'repeated-failure'`（M48.3）。
- `CiAlignmentRecord.mirrored` / `mirrorSkipped`（M48.2；字段可选以兼容历史 JSON）。
- `FixAction.commandSource?: 'default' | 'repo-config' | 'ci-mirror'`（M48.2；仅 verification 动作）。
- core `RunResult.prCheckWatch?: { attempts: Array<{ pr: { number, htmlUrl }, state: 'passed' | 'failed' | 'cancelled' | 'no_ci_detected' | 'timeout', attribution?: CheckAttribution, closed, commented, polls, durationMs, failedChecks?, reason?, commentError?, closeError? }>, runBudgetExhausted }`（M48.5 / M48.6；`failedChecks` 为 `{ name, url?, attribution }` 最多 5 条）；engine 的 `PullRequestResult` 只作内部返回（M48.5 起附带 `headSha` 供精确轮询）。
- 运行摘要：`prsOpened` / `prsSkippedByFingerprint` / `prsClosedAfterFailure` / `checksTimedOut`（事件点累加，`computeSummary` 不重置）。
- `RunResult.deliverySkips?: Array<{ repositories: string[], failingCommands: string[], carrier: { mode: 'skip' | 'issue' | 'draft', issue?: { number, htmlUrl, created, fingerprint }, draftPr?: { number, htmlUrl } } }>`（§16；仅基线红时存在，字段可选以兼容旧 JSON）。
- 运行摘要（§16）：`deliverySkipped`（去重仓库数）/ `deliverySkipIssues`（本次新建 issue 数）/ `deliverySkipDraftPrs`（草稿 PR 数），均由 `computeSummary` 从 `deliverySkips` 幂等派生。

### 10.3 PR 正文标记

- 尝试计数：`<!-- dependfix:attempt key=<k> n=<n> fp=<optional> failed=<0|1|?> -->`
- 家族锁步：Upgraded 表新增 `Family` 列（家族 id），正文 `Family Lockstep` 段按仓库列出 members / skipped（无隐藏标记）
- 分类：在「CI 结果」区块按分类列出，不写隐藏标记

## 11. 降级矩阵

| 失败点 | 行为 | 是否影响 exit code |
|:--|:--|:--|
| registry 不可达 / 家族成员版本解析失败 | 整族放弃（未写盘），告警 failed + `FAMILY_LOCKSTEP_FAILED` | 是（本次修复失败） |
| override-protect 命中家族成员 | 整族放弃并留痕（noOp + 跳过计数），不产生半族 PR | 否（计 skipped） |
| CI 脚本解析失败 / 无 workflow / 超解析上限 | 不镜像，记 `unreadableReason`（缺失 workflow 记 info、解析失败 warn；**不进** `mirrorSkipped`） | 否 |
| 无 package.json / 脚本不存在 / 非单一形态（flag / env 赋值 / 额外参数 / corepack 钉定；install 类命令除外，视为已覆盖）/ 超 3 条 | 跳过该条或整体，记 `mirrorSkipped`（`script-not-found` / `unsupported-command` / `over-limit`） | 否 |
| mirror 命令基线已红 | `preExisting`，不回滚、不改 exit code | 否 |
| mirror 命令基线绿但本次失败 | 按本次改动归因，经验证门禁回滚 | 是（本次修复失败） |
| 最近关闭 PR 索引失败 / 标记解析失败 | fail-open，视为未命中 | 否 |
| `git status` 出现未声明改动 / 路径非法 | 失败 `UNEXPECTED_CHANGES`，不开 PR | 是（本次修复失败） |
| YAML `parseDocument` 失败 | 不写盘 + 留痕，不降级整文件重写 | 是（本次修复失败） |
| PR check 轮询超时 / 429 / 预算耗尽 | 记 `checksTimedOut` / 退避，PR 保留 | 否 |
| 宽限期后 0 check | `no_ci_detected`，不判 passed | 否 |
| comment 权限不足（403） | 记录，不改变 PR 状态 | 否 |
| PR 正文被模板覆盖 | 标记丢失 → fail-open | 否 |
| 分类未知 | `unknown`，不判 passed、不关闭；合并仍由 mergify `check-success` 决定 | 否 |
| 修复后安装仍为既有失败（基线红） | 按 `onBaselineRed` 三档：`skip` 回滚 + 留痕 / `issue` 开 issue（同指纹一次）+ 回滚 / `draft` 不回滚、草稿 PR（`waitPrChecks` 不等待） | 否（`PRE_EXISTING_FAILURE` 在跳过类白名单） |

## 12. 验证矩阵

| 层 | 内容 |
|:--|:--|
| 单元 | 家族解析（含 `eslint@9 + typescript-eslint@8` 合法反例）/ 尝试键 / 分类规则 / YAML 定点编辑 / 路径校验 |
| 契约 | 配置解析、报告字段、PR 正文标记往返、`SKIP_REASONS` 求和 |
| 集成 | 临时 Git 仓库：提交集合 + YAML diff；mock Octokit：轮询 / comment / close / 超时 / 0 check |
| 回归 | 既有 `pr-creator` / `ci-alignment` / `dependency` / 报告测试全绿；mutation 逐条标定 |
| 真实路径 | 目标仓库 dry-run（不推送）+ 本地 fixture 仓；外部仓库只做人工抽检 |

## 13. 决策记录

| 编号 | 决策 | 备选与否决理由 |
|:--|:--|:--|
| D1 | 精选家族清单为权威，peer 仅校验 | 自动推导误报高；`eslint` 与 `@typescript-eslint/*` 不是同 major 关系 |
| D2 | `--mirror-ci-scripts` 可选执行脚本子集 | 默认执行成本不可控；`--strict-ci` 阻断会让存量仓库直接红 |
| D3 | PR 正文**尝试计数**为权威载体，签名可选 | 平台表对 CLI / Action 不可用；运行报告不跨运行；创建时尚无失败文本 |
| D4 | 声明路径 + 固定 glob 白名单 | 黑名单永远漏；整仓 `add` 已实证混入生成物 |
| D5 | opt-in 有界轮询，per-PR + per-run 双预算 | 默认 close 风险高；无界 / 仅 per-PR 会突破 job 预算 |
| D6 | 未知分类兜底 `unknown` | 默认 `self_caused` 会误关，默认 `external_noise` 会洗白回归 |
| D7 | 同 key 第 3 次尝试起跳过 | 零重试放大瞬时失败；无限重试制造红 PR 循环 |
| D8 | 合并后 check 采集不在本阶段 | 需新增平台轮询面，超出 6 原子容量；登记后续候选 |
| D9 | 归因不绕过 mergify 门禁 | mergify 无归因扩展点；按归因放行会合并真实回归 |
| D10 | 平台侧建 PR 后回环不在本阶段 | 平台已有 PR Check 告警；CLI / Action 是巡检红 PR 的主要来源 |

## 14. 已知边界与后续候选

1. 家族清单只覆盖首批 4 个；新增家族需补规则与夹具。
2. 尝试计数依赖 PR 正文；人工改写后退化为未命中。
3. 失败签名去重仅在 M48.5 开启时增强证据；默认按尝试次数。
4. CI mirror 只执行 `pnpm/npm/yarn [run] <script>` 单一形态（`./node_modules/.bin/` 前缀归一化；`corepack pnpm@<v>` 钉定、脚本名含 `.` 等不接受）；带 workspace filter / recursive / `--if-present` / 额外参数 / env 赋值、`docker build` / 复合 shell 均只披露。每仓最多 3 条，脚本需存在于根 `package.json#scripts`；多仓共享 workDir 时按该检出计算；只校验形态与存在性，不审计脚本体。
5. CLI 侧回环不跨进程续等；平台侧建 PR 后回环为后续候选。
6. 合并后 check 新采集、聚合 issue、自动启用 mergify 均不在本阶段；已登记 backlog 候选。

## 15. 关联文档

- [验证链与目标仓库 CI 口径对齐](./verification-ci-alignment.md)
- [PR 构建与部署信号采集](./pr-build-deploy-signals.md)
- [依赖分组升级设计](../modules/dependency-grouping.md)
- [队列僵尸任务终结与去重键释放](./queue-stale-recovery.md)
- [依赖修复执行记录](../modules/dependency-fixer-records.md)
- [自动合并指南](../../guide/auto-merge.md)
- [规划规范](../../standards/planning.md) / [测试规范](../../standards/testing.md)

## 16. M51.4 基线红 / 安装失败的交付降级（2026-10-30）

### 16.1 背景与目标

修复后安装验证仍为既有失败（基线红）时，交付一直被**整段跳过**：改动回滚、报告记一条
`PRE_EXISTING_FAILURE`、退出码中性。使用者只看到日志，没有可跟踪的载体，平台运行也表现为
「有告警、无 PR」。

目标：给这条路径一个**可跟踪载体**（issue / 草稿 PR / 仅报告三档），默认行为不变。

**非目标**：不改 `PRE_EXISTING_FAILURE` 归因语义与跳过类白名单，不改安装失败判据与回滚链。

### 16.2 档位与配置

配置键 `DEPENDFIX_ON_BASELINE_RED`（`RuntimeConfig.onBaselineRed`，默认 `skip`；无 CLI flag）：

| 档位 | 行为 | 改动落地 | 载体 |
|:--|:--|:--|:--|
| `skip`（默认） | 审计记录 + 回滚（与引入前逐字一致） | 否 | 无（仅报告 / 平台标签） |
| `issue` | 按失败指纹开 issue（去重、关闭后不重开），随后仍回滚 | 否 | issue |
| `draft` | 不回滚，照常提交 / 推送，PR 以**草稿**创建 | 是（草稿 PR） | draft PR |

- 仅 `fix-and-pr` 生效；`fix` 模式下（平台执行链）能力主线不在引擎 PR 面，因此**只记录**
  `summary.deliverySkipped*`，由平台展示「交付跳过」（见 §16.5）。
- dry-run 一律按 `skip`：dry-run 无交付面可降级，且必须回滚。
- 配置校验：非法值 fail-fast（`ON_BASELINE_RED must be one of: skip, issue, draft`）。

### 16.3 issue 载体

- **失败指纹**：`sha256(repositories.sort + failingCommands.sort).slice(0, 16)`。
  刻意**不含**错误文本、时间戳与 run id——同一仓库 + 同一失败命令即视为同一失败，
  CI 日志抖动不会造成 issue 重复；而错误文本可能携带路径 / 凭据，不进正文也不进指纹。
- **落点**：`installBlockedRepos[0]`（首先命中的受影响仓库），与失败同源——若沿用运行级
  「第一个仓库」，仓库顺序变化会让同一指纹的去重扫描落到另一个仓库而重复开 issue。
- **去重**：正文首位 HTML marker `<!-- dependfix:delivery-skip fp=<fp> -->`；查询 `state: 'all'`
  最近 100 条 issue/PR 条目并排除 PR 条目。**命中已关闭 issue 也复用**（关闭即人工确认的
  「已知问题」，不自动重开）；查询 / 创建失败只 warn，交付跳过与退出码语义不变。
- **标题 / 正文**：标题 `dependfix 交付跳过：<仓库集> 安装验证仍有既有失败`；正文含运行 id、
  受影响仓库、失败命令、「先修安装链再重跑」的处置步骤与「关闭后不会自动重开」说明。
- **标签**：尝试打 `dependfix`（仓库未建该标签时可能被静默丢弃）。标签只是检索便利，
  去重与幂等**不依赖标签**（靠正文 marker）。
- **权限面**：需要 token 具备 `issues: write`（PAT 一般已含 `repo` 范围；fine-grained token 需显式勾选）。

### 16.4 draft 载体

- `pulls.create` 携带 `draft: true`；正文最前插入警告区块（仓库 + 失败命令 + 「CI 会以同一既有失败
  为红，先修安装链再转正」）。非草稿档正文逐字不变。
- 草稿 PR 计入 `summary.prsOpened`，并额外计入 `summary.deliverySkipDraftPrs`。
- `--wait-pr-checks` 在草稿档**不等待**：CI 必然复现既有失败，等待只会烧掉 job 预算。

### 16.5 报告与平台展示

- `RunResult.deliverySkips?: DeliverySkipRecord[]`（仓库集 / 失败命令 / 载体）→ 报告
  `## Delivery Skipped` 段（无记录不渲染）。
- `RunSummary` 新增 `deliverySkipped`（去重仓库数）、`deliverySkipIssues`（本次新建 issue 数）、
  `deliverySkipDraftPrs`（草稿 PR 数），由 `computeSummary` 按记录幂等派生。
- 平台：运行列表的告警列展示「交付跳过 N 个仓库」标签；运行详情（`repo-history-dialog` 的
  结果行与 `run-detail-dialog` 元信息）另附载体计数（新建 issue / 草稿 PR）——避免把
  「无 PR / 0 修复」误读成「扫描无告警」。旧 `summaryJson` 缺字段时按 0 处理（不渲染）。

### 16.6 退出码中性（不变）

`PRE_EXISTING_FAILURE` 仍在跳过类白名单内：三档都不改变 exit code。`draft` 档虽然创建了 PR，
但该仓库的「本次引入的验证失败」判定不变（既有失败不归因），因此退出码与 `skip` 档一致。

### 16.7 已知边界

1. 平台执行链（`fix + commit`）只记录 summary，不创建 issue / 草稿 PR：平台交付面在
   `platform-delivery`，与引擎 `fix-and-pr` 的载体创建不是同一路径（见 [backlog](../../plan/backlog.md)
   的「平台侧交付载体」候选）。
2. issue 去重只扫最近 100 条 issue；更早的同指纹 issue 不会被命中（fail-open：最多多开一条）。
3. 人工关闭 issue 即视为已确认；后续同指纹运行不再新建（报告仍记 `deliverySkipped`）。
4. 指纹不含错误文本：同一命令的不同根因会落在同一个 issue（人工跟踪粒度取舍，见 §16.3）。
5. 多仓库运行时 issue 落在**首先命中的受影响仓库**（`installBlockedRepos[0]`）；草稿 PR 仍落在
   运行级第一个仓库（与尝试标记同一约定）。
6. **marker 可被伪造**：能写 issue 的账号贴出同 marker 可抑制本次创建（fail-open：少开一条 issue，
   不会误删）。后续可限定 `user.type === 'Bot'`。
7. 失败命令串原样进入 issue 正文（公开）：若 `commands` 里含 `https://user:token@registry` 这类
   内联凭据会外泄——与 PR 正文既有口径一致（不改本批范围），配自定义命令时应走环境变量。
