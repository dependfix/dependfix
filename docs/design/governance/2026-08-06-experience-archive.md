# 经验归档：2026-08 首次 Wisdom 蒸馏

> 本文档保存首次 Session Wisdom 蒸馏（2026-08-06）的**详细前因后果**。
> 规范文档只保留可执行方法论；需要追溯具体案例时查阅本文档。
> 蒸馏机制见 [session-wisdom-distillation.md](./session-wisdom-distillation.md)。

## 一、外部平台限制先探针验证（G2 处置）

- **案例**：GITHUB_TOKEN 访问 Dependabot alerts API 恒 403。T-G2-2 探针实测（HTTP 200/403）确认是 GitHub App-only 权限 + 官方文档缺陷，而非自家代码 bug。
- **处置**：双 token 方案（`alertsToken` + `dependabot-alerts-token` input）+ pnpm audit fallback，不死磕。
- **启示**：外因问题先做最小验证（探针/官方文档/issue），不要在自家代码里找不存在的 bug。

## 二、真实运行复盘驱动产品演进（三次 run）

- **run 30929090403**：docs 目录 vite@5 告警误降级根 vite@8→6 → 引入 P0 防护：根直接依赖 + lockfile 告警整体跳过。
- **run 30933266831**：P0 防护误伤 fast-uri 等间接依赖 → 修正 partition：非根直接依赖仍进 root。
- **run 31021398673**：23 条告警 Skipped=22（vite×11 根直接依赖被 P0 跳过 + lodash×3 测试 fixtures 污染 + fast-uri/js-yaml 不降级保护 + brace-expansion lint 失败回滚）→ 用户指出多版本共存应分别 overrides → 修复链路升级（版本化 overrides）。
- **启示**：每个真实 run 的异常统计（Skipped/Failed 占比异常）都是产品缺口信号，先拆解归因再动代码。

## 三、防护要"精确修复"而非"扩大跳过"

- **案例**："根直接依赖 + lockfile 告警 → 整体跳过"是过度防护：vite×11 全 Skipped，真正问题（多版本共存）被掩盖。
- **处置**：lockfile 多版本共存 → 版本化 overrides（`pkg@version: ^target`）只影响对应实例；单版本维持跳过（P0 语义不变）。
- **启示**：防护降级为"跳过/人工处理"时，应追问"能否精确修复"而不是安心扩大跳过范围。

## 四、pnpm overrides 版本化 key（用户提供的生产惯例）

- **案例**：dependfix 自扫时 lockfile 中 vite@5.4.14 与 vite@8.2.0 共存。用户提供多版本分别覆盖的 overrides 写法：`"path-to-regexp@0.1.12": "^0.1.13"`、`"body-parser@1": "^1.20.6"`、`"ajv@^6.0.0": "^6.14.0"`。
- **实现要点**：只覆盖与 target 同 major 且低于目标的实例（跨 major 会破坏子工作区且根 lint 无法验证）；同包多 GHSA 取 recommendedVersion 最高者；dry-run 必须 guard；单版本根直接依赖维持 sub。
- **启示**：真实项目的 overrides 配置是最佳规格文档，比理论更可靠。

## 五、Review Gate 独立验证"测试声明"

- **案例**：收尾批次交付声明"测试 +2"但审计 grep 无命中（report-only 措辞零覆盖）→ REQUEST_CHANGES，补齐后 APPROVE。
- **启示**：测试声明必须可核查（文件 + 断言内容）；审计独立复验，不采信交付方自报。

## 六、dry-run 纪律（Review Gate P1）

- **案例**：多版本 overrides 分支曾在 dryRun 检查**之前**调用 applyVersionedOverrides（真实写盘 + install）——全链路其他路径（upgradeAlert / tryLockfileRepair / applyCodeScanningFix）都已 guard，此处是唯一例外。
- **启示**：新修复路径 checklist 第一项：dry-run 时是否零写盘、零 install、零 mutation。

## 七、能力交付检查所有暴露层

- **案例**：M3 完成时 CLI flag / env / config 校验全就绪，但 action.yml 无 code-scanning input（用户发现）→ 补接线 + 文档同步（configuration/quick-start/README）。
- **启示**：能力交付前检查四层：CLI flag / env / action input / 文档表，缺一层即不完整。

## 八、改名/迁移全局排查命名残留

- **案例**：auto-fix-github-security → dependfix 改名只迁移了仓库引用，`AUTO_FIX_GITHUB_SECURITY_` env 前缀漏网（用户发现）。
- **处置**：`ENV_PREFIX` 常量 + `readEnv()` 统一读取辅助，所有 env 读取必须走它（防再漏）。
- **启示**：改名后全局搜索旧名（含 env 前缀、错误消息、注释、示例），不只看文件引用；散落硬编码是漏网温床。

## 九、不可行证明比硬实现更有价值（T303 模板移除）

- **案例**：no-trailing-spaces 模板经 3 轮 Review 证明词法歧义无法保证"不改变运行时字符串值" → **移除**而非硬上（A 类白名单只剩 eol-last）。
- **启示**：当需求与模板技术约束冲突时，记录论证过程后放弃是合规决策——不要为了"有修复器"而引入不可验证的修复器。

## 十、Windows 开发环境行尾纪律

- **案例**：PowerShell `Set-Content` 批量替换引入 CRLF（26 行噪音 diff）。
- **处置**：用 .NET `ReadAllText/WriteAllText`（UTF8 no BOM）保持 LF；改后立即 `git diff` 检查行尾；CRLF 噪音单独 chore 提交（`统一行尾为 LF`）。

## 十一、里程碑收口同步所有用户可见文档

- **案例**：M3 完成后 docs/index.md / roadmap.md 仍标"规划中"（Review Gate P2 发现自相矛盾）。
- **启示**：里程碑收口 checklist：todo 归档 + index/roadmap/guide 状态同步 + 设计文档"规划中"→"已落地"修正。

## 十二、工程实现细节（M1 早期经验）

- **间接依赖修复**：`dependencyType` 路由不可靠（API 字段可能为 null）→ try→fallback（upgradeDependency 失败且报 "not found in dependencies" 时回退 overrideTransitiveDependency）。
- **pnpm overrides 写入位置**：pnpm v11 迁移到 pnpm-workspace.yaml → 检测文件存在性决定写入位置。
- **日志双模**：`process.stdout.isTTY` 检测 → TTY 彩色文本、非 TTY JSON。
- **.bak 泄露**：备份机制只用于失败回滚 → 成功/回滚双路径都调 `cleanupBackups()`。
- **报告目录污染 git**：`ensureGitignore()` 幂等追加 `dependfix-reports/`。
- **commit type**：修复现有功能缺陷 → `fix`；新增能力 → `feat`。
- **固定前缀截断**：`runId.slice(0, 8)` 截取 `dependfix-<ts36>-<rand36>` 恒为 `dependfi` → 先去前缀再截断/取尾段；测试用真实形态输入。
- **toErrorMessage**：统一错误消息提取 helper；错误路径 helper 自身不抛异常（try/catch JSON.stringify）+ 单测锚定。
- **lint 门禁**：`--max-warnings N` 存量 warning 变硬门禁；假 async（await 同步函数）；误导性测试名掩盖缺口。
- **证据获取优先级**：官方文档 → 真实项目实证 → 本地实验 → 翻源码（最后手段）。
- **审查按风险分级**：高风险深度审计、低风险快速审查；审计 prompt 携带已查证事实。
- **发布工具链**：npm OIDC 初始版本不可发；pnpm v11 publish 不走 npm CLI；changesets spawn pnpm publish；conventional-changelog 8.x 与旧 preset 不兼容；CHANGELOG 日期用 HEAD UTC；GITHUB_TOKEN push 不触发 workflow。
- **0.x 版本语义**：0.x 即"开发期不稳定"；预览期发 latest + Release 标 pre-release。

## 十三、产物格式先问消费面，再决定（全 ESM 决策）

- **案例**：0.1.0 双格式（cjs+esm）发布后，R4 为 CJS 兼容给业务代码加动态 import；复盘发现消费面（CLI bin / GitHub Action / 仓库内 / 未来平台）**100% ESM**，外部 CJS 编程式消费者为 0 → 两包改单格式 `esm`，兼容代码回退，构建/体积减半。
- **启示**：
  - 产物格式由**实际消费面**决定，不按"惯例"默认双格式；CLI 工具包的编程式消费场景本就罕见。
  - Node 22.12+ 原生 `require(ESM)` 正在消除"CJS 消费者需要 CJS 产物"的需求——为兼容做的产物级工作先问"谁在 require"。
  - 兼容性修复代码（动态 import、interop 分支）会留在业务代码里持续增加复杂度，远贵于一次产物格式决策；pre-1.0 阶段做破坏性格式变更成本最低。

## 十四、跨线修复判定与"不误标"纪律（PR #28 复盘）

- **案例**：run 31063128020 中 lockfile 只有 vite@5.4.14 + vite@8.2.0 实例，GHSA-fx2h（影响 `<= 6.4.2`、first_patched 6.4.3）对 5.x 实例**无同线修复版本**。原链路把 5.4.14 升到 5.4.21 后按包级匹配标 fixed；后续 run 又会被最高实例 8.2.0 掩盖而误判 converged——告警长期滞留且被误标。
- **修复**：① `isCrossMajorFixRequired`（推荐版本 major 不在 lockfile 实例 majors → 跨线）在修复链路剔除（skipped + warn，交用户手动大版本升级/批准）；② fixed/converged 判定改为**逐目标同 major 版本满足**（`isAlertFixedByActions`：目标 >= 推荐 且 major 相同），markdown 报告 / severity 聚合 / PR body 三处同源，杜绝"同包其他线目标掩盖"。
- **启示**：
  - **跨大版本升级默认不做自动决策**（T405 修订，2026-08-07）：线内无修复版本 = 需要人工检查/执行/批准；自动升到跨线版本会破坏依赖语义（版本化覆盖 key 按 major 线语义）。**默认行为不变**；`--allow-major-upgrade`（CLI 专属、无 env 通道、Action 禁用）显式授权后，仅"直接依赖 + lockfile 单版本"的跨线告警自动升级，强制完整验证（install+lint+build），失败回滚——详见 [dependency-fixer.md §12.6](../packages/dependency-fixer.md)。
  - **包级匹配是"快照"不是"真相"**：同包多 GHSA 推荐版本各异时，包级 fixed 标记必须被版本满足判定收敛，否则报告自相矛盾（Summary/明细/PR body 三口径）。
  - **最高实例版本会掩盖低线实例的脆弱**：收敛判定按实例维度而非最高版本一刀切。
  - **真实 GHSA 数据比假设更有价值**：复盘时用 GitHub Advisory API 拉 actual vulnerabilities range（如 `<= 6.4.2` 含 5.x）确认跨线事实，而非猜测。
