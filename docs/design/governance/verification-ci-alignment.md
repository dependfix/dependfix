# 验证链与目标仓库 CI 口径对齐设计（M47.1）

> **状态**：✅ 已落地（2026-10-23，M47.1；Review Gate R1 Reject → R2 Pass → R3 Pass（2026-10-23，R3 仅复审修复点）；证据见 `artifacts/review-gate/2026-10-23-m47-1-ci-alignment-*.md`，该目录已 gitignored）
> **范围**：`packages/core`（口径模型与文案）+ `packages/engine`（workflow 解析 / 比对 / 默认分支健康预检 / 报告与 PR 正文）。`apps/platform` **本批零代码改动**：平台在 `container-executor` 内进程化执行引擎，仓库与默认分支上下文（`fetchDefaultBranch`）已由引擎提供，`RunResult.ciAlignment` 随结果回到 `platform-delivery.generatePRBody`，无需新增透传面（与 Todo 中「平台只透传」的原始假设相比为范围收窄）。
> **关联**：[依赖修复记录设计](../modules/dependency-fixer-records.md#_12-14-验证链与目标仓库-ci-口径对齐-m47-1-2026-10-23)、[运行失败分类与筛选设计](./run-failure-taxonomy.md)、[验证链与既有失败基线](../modules/dependency-fixer-records.md#_12-9-验证链与既有失败基线-默认链-既有失败归因-零告警按需采样)

## 1. 背景与问题

PR 正文的 `### ✅ Verification` 区块来自 engine 的**本地验证链**（`DEFAULT_VERIFY_COMMANDS` 或仓库级 `verifyCommands`），目标仓库的 CI 则跑它自己的 workflow。二者不是同一口径，于是出现「PR 正文红 / 目标仓库 CI 绿」或反向的判读冲突：用户无法从 PR 判断「这次修复是否真的会过 CI」。

2026-10-18 生产复盘的具体形态：目标仓库 CI 只跑 `lint / build / test`，engine 默认链还跑 `typecheck` 与基线采样，PR 正文把它们平铺为同一组红/绿，读起来像「CI 失败」。本设计补三件事：

1. 把**本次实际执行的命令集**暴露到报告与 PR 正文（可复算，不再只有红绿；首失败短路时如实只含已执行前缀）；
2. 披露「本次验证链 vs 目标仓库 CI 可识别命令类别」的**口径差异**；
3. 目标仓库默认分支上同一 workflow 最近一次已是失败时，标注「非本 PR 引入」。

## 2. 目标与非目标

**目标**

- 目标仓库为单 job `run: pnpm lint / pnpm build / pnpm test` 时，PR 正文出现「CI 口径：一致」，缺 `typecheck` 时明确写「本仓库 CI 未跑 typecheck，本次已验证」。
- 无法解析 CI 配置（无 `.github/workflows` / 非法 YAML / 非 GitHub Actions）时不阻断运行，正文标注「未能读取 CI 配置」。
- 口径依据的 workflow 在默认分支最近一次为 `failure` 时标注「非本 PR 引入」；API 失败 / 限流 / 超时只 warn，不标注失败结论。
- 报告（Markdown + JSON）与 PR 正文共享同一份口径记录与文案。

**非目标**

- 不按目标仓库 workflow 动态替换 `verifyCommands` / `DEFAULT_VERIFY_COMMANDS`；
- 不解析 matrix / `services` / `secrets` 的完整执行语义，不执行 workflow；
- 不覆盖 GitHub Actions 之外的 CI（GitLab / Jenkins / CircleCI 等一律「未能读取」）；
- 不预测、不承诺目标仓库 CI 结果（只描述命令口径）；
- 不改 exit code、交付判定、PR 创建条件；
- 不在平台 run 详情 UI 新增口径面板（D 阶段按成本裁定：报告与 PR 正文已覆盖诊断面，UI 留待有明确需求时再评估）。

## 3. 解析边界

只读**默认分支检出**的 `.github/workflows/*.yml|yaml`：

- 引擎在默认分支检出上修复，修复链不改 workflow，故工作区内容等价于默认分支配置；平台在 clone 后构造 app，命中同一路径。
- 只取 `jobs.*.steps[].run`，`uses:` 步骤忽略；`run` 按换行与 `&&` / `||` / `;` 拆成命令片段。
- 有界读取：最多 20 个文件、单文件 ≤ 512 KB；文件数或字节数超限一律按「未能读取」降级（**不静默截断**——被丢弃的 workflow 可能承载唯一的 `test` 语义项，截断后仍判「一致」会制造假阳）。
- 只读普通文件：用 `lstat`（不跟随软链）判定 `isFile()`，软链 / FIFO / 设备文件直接降级为「未能读取」——仓库内容不可信，软链指向 `/dev/zero` 时 `size` 为 0，会绕过字节上限并同步阻塞事件循环。

**可识别语义项**（与默认验证链同口径，install 等准备类命令不参与比对）：

| 语义项 | 识别形态（示例） |
|:--|:--|
| `lint` | `pnpm lint` / `pnpm run lint` / `npm run lint` / `yarn lint` / `eslint .` / `npx eslint` |
| `build` | `pnpm build` / `pnpm run build` / `yarn build` |
| `typecheck` | `pnpm typecheck` / `pnpm type-check` / `tsc` / `tsc -b` / `npx tsc --noEmit` |
| `test` | `pnpm test` / `npm test` / `yarn test` / `vitest` / `jest` / `npx vitest run` |

兼容 `corepack pnpm@<version>`、`pnpm --filter <pkg> run <script>`、`pnpm -r <script>`、前置环境变量（`CI=1 pnpm test`）与 `./node_modules/.bin/` 前缀。

**未识别命令显式披露**：带包管理器但脚本名不在上表的命令（如 `pnpm test:e2e`、`pnpm format`）记为「未识别」，PR 正文注明「未纳入比对」——不静默丢弃，也不据其宣称一致。每文件最多保留 5 条、正文预览最多 3 条（超出时正文只显示总数），避免正文预算被长列表吃掉。

## 4. 比对口径

判定只依赖两侧的**语义项集合**（本次实际执行 vs CI 可识别并集）：

| 状态 | 判定 | 正文文案 |
|:--|:--|:--|
| `aligned` | CI 的语义项均被本次覆盖 | `CI 口径：一致（依据 …）` |
| `differs` | CI 有本次未执行的语义项 | `CI 口径：不一致（CI 运行、本次未执行：test）` |
| `inconclusive` | CI 无可识别语义项 / 本次为自定义链（无可识别类别） | `CI 口径：无法比对（原因）` |
| `unreadable` | 无 workflow / 非法 YAML / 非 GitHub Actions | `CI 口径：未能读取 CI 配置（原因）` |

- **本次更严格**（本次执行、CI 未跑，典型是默认链的 `typecheck`）→ 仍是 `aligned`，另起一行披露「本仓库 CI 未跑 X，本次已验证」。
- **不得凭「没识别到」宣称一致**：唯一命中「无覆盖」的方向是 `differs`（CI 有、本次无），反之记 `inconclusive`。
- 逐个 workflow 的「未识别命令」不改变状态（保守披露），但在 `aligned` 时同样出现，避免读者把「一致」读成「CI 只跑这些」。

## 5. 默认分支健康预检

- 只读「口径比对所依据的 workflow」（有可识别语义项的文件），最多 3 个；
- 调用 `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs?branch=<default>&per_page=1`（`workflow_id` 直接用文件路径），取最近一次运行结论；
- 单次请求超时 5 秒（`AbortSignal.timeout`；Octokit 限流重试同受该 signal 约束）；
- 结论为 `failure` / `timed_out` / `startup_failure` 时才在正文标注「默认分支同 workflow 最近一次失败（非本 PR 引入）」；`success` / `cancelled` / `skipped` 不标注（`startup_failure` 属 workflow 配置错误，同样非本 PR 引入）；
- API 失败 / 限流 / 超时 / 无凭据 → 只记 `healthUnavailableReason` 与日志 warn，**不标注失败结论**（避免把 API 问题读成仓库问题）。

## 6. 数据模型与契约

`RunResult` 新增可选字段 `ciAlignment?: CiAlignmentRecord[]`（按仓库一项），记录：

| 字段 | 语义 |
|:--|:--|
| `commands` | 本次**实际执行**的命令（已跳过 `package.json` 中不存在的脚本；首失败短路时只含已执行前缀） |
| `status` / `ciCategories` / `extraInExecution` / `missingInExecution` | 比对结论与两侧语义项 |
| `workflows[]` | `{ path, categories, unrecognized }`（解析依据，便于复算） |
| `comparisonNote` / `unreadableReason` | 无法比对 / 未能读取的原因 |
| `defaultBranchHealth[]` / `healthUnavailableReason` / `defaultBranch` | 健康预检结果与降级原因 |

- **向后兼容**：字段可选，缺省不渲染；JSON 报告由 `JSON.stringify` 自动透出，Markdown 报告与 PR 正文共用 `@dependfix/core` 的 `describeCiAlignment` / `formatCiAlignmentSection`（单一文案事实源）。
- **不改既有契约**：`summaryJson` / `errors[]` / exit code / 交付判定 / `DEFAULT_VERIFY_COMMANDS` 顺序均不变。
- 记录时机为修复后 `verifyProject` 完成处。同一次运行内可能多次验证（跨 major 回退 / 单元回滚后重验），每次只跑到首失败位置，故同一仓库**取命令并集**（按首次出现顺序）表示「本次运行实际执行过的命令」；并集未增长时复用既有记录，健康预检也复用首轮结果（workflow 与默认分支在运行期间不变），避免重复调用 API。

## 7. 降级矩阵

| 场景 | 结果 | 运行影响 |
|:--|:--|:--|
| 无 `.github/workflows` / 目录内无 workflow | `unreadable` | 无（本地读目录失败即降级） |
| 非法 YAML / 任一文件解析失败 | `unreadable`（整体降级，不拿半个配置宣称一致） | 无 |
| workflow 文件数 > 20 / 单文件 > 512 KB | `unreadable`（不静默截断） | 无 |
| workflow 是软链 / FIFO / 设备等非普通文件 | `unreadable`（`lstat` 不跟随软链） | 无（防同步无界读取） |
| workflow 缺少 `jobs`（非 GitHub Actions） | `unreadable` | 无 |
| 无 GitHub client（本地 / pnpm-audit） | 保留本地比对，`healthUnavailableReason` | 无网络调用 |
| 健康预检 API 失败 / 限流 / 超时 | 记录保留，不标注失败结论 | 单次调用 5 秒上限，不阻断 |
| 比对自身抛错 | 只 warn，不写记录 | 无 |

## 8. 已知边界

- **多仓共享同一工作目录**：引擎多仓运行时 CI 口径按该工作目录检出的仓库计算（与既有基线 / checkpoint 的共享 workDir 局限同族）；平台单仓模型不受影响。
- **shell 语义**：只做片段切分，不解释变量展开、heredoc、`if/then` 分支、动态脚本名；这类形态落入「未识别」而非误判为已覆盖。
- **matrix / 条件步骤**：不解析 `if:` 与 matrix 组合，按「步骤存在于配置」计入（可能高估 CI 覆盖）。
- **首失败短路**：本次验证链首条失败即停，后续命令未 spawn，单次记录只含已执行前缀；若同一次运行后续重验跑通，则按并集补齐全链（见 §6）。交付前仍只有中间态记录时，比对会把未执行类别列为「CI 运行、本次未执行」（`differs`），属如实披露而非误报。
- **多仓库 PR 正文预算**：多仓运行时正文区块固定 ≤ 5 行，优先展示靠前仓库；未能完整展示的仓库以「其余 N 个仓库的完整 CI 口径见运行报告」收尾（不静默丢弃）。
- **CI 配置时点**：取本次运行检出时的 workflow；运行期间默认分支变更不反映到本次记录。
- **非 GitHub Actions**：GitLab / Jenkins 等一律 `unreadable`（README 已声明不覆盖）。
- **未识别的验证类命令**（如 `pnpm test:e2e`）不改变状态，只在正文披露；读者需据此判断是否还需人工核对。
- **健康预检结论枚举**：除 `failure` / `timed_out` / `startup_failure` 外的非成功结论（如 `cancelled` / `action_required`）不标注为「默认分支失败」，避免把人为取消读成仓库问题。

## 9. 关联文档

- [依赖修复记录设计 §12.14](../modules/dependency-fixer-records.md#_12-14-验证链与目标仓库-ci-口径对齐-m47-1-2026-10-23)（实现落点）
- [依赖修复记录设计 §12.9](../modules/dependency-fixer-records.md#_12-9-验证链与既有失败基线-默认链-既有失败归因-零告警按需采样)（默认链与既有失败归因）
- [对外 PR 交付闭环 §5](./pr-delivery-closure.md) + [依赖修复记录 §12.18](../modules/dependency-fixer-records.md)（M48.2 的 `--mirror-ci-scripts`：只在默认链后**追加** CI 独有脚本，不替换 `verifyCommands`）
- [数据模型](../modules/data-model.md)（`RunResult` 契约）
- [平台规范](../../standards/platform.md)（平台执行链与 verifyCommands）
