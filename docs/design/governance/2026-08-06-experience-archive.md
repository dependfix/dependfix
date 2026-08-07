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
  - **跨大版本升级默认不做自动决策**（T405 修订，2026-08-07）：线内无修复版本 = 需要人工检查/执行/批准；自动升到跨线版本会破坏依赖语义（版本化覆盖 key 按 major 线语义）。**默认行为不变**；`--allow-major-upgrade`（CLI 专属、无 env 通道、Action 禁用）显式授权后，仅"根 package.json 直接依赖 + lockfile 单版本"的跨线告警自动升级，升级后实例复核 + 强制完整验证（install+lint+build），失败回滚——详见 [dependency-fixer.md §12.6](../packages/dependency-fixer.md)。
  - **包级匹配是"快照"不是"真相"**：同包多 GHSA 推荐版本各异时，包级 fixed 标记必须被版本满足判定收敛，否则报告自相矛盾（Summary/明细/PR body 三口径）。
  - **最高实例版本会掩盖低线实例的脆弱**：收敛判定按实例维度而非最高版本一刀切。
  - **真实 GHSA 数据比假设更有价值**：复盘时用 GitHub Advisory API 拉 actual vulnerabilities range（如 `<= 6.4.2` 含 5.x）确认跨线事实，而非猜测。

## 十五、跨线升级"单版本必然跟随"假设不成立（T405 Review Gate 首轮 REJECT）

- **案例**：`--allow-major-upgrade` 2.0.2 链路首版设计假设"lockfile 单版本 → 升级根声明后脆弱实例必然跟随，告警真实消除"。Review Gate 指出：root 声明 `vite ^5.4.0` + workspace 成员（如 `docs/`）同 range 声明（共享单实例 5.4.14）时，跨线只改 root 声明 → install 成功（不同 major 共存）→ 验证通过 → 误标 fixed；且下一轮 lockfile 变为 {5.4.14, 6.4.3} → 不再跨线 → 常规链路 no-downgrade 取最高 6.4.3 → **误判 converged**——正是 PR #28"最高实例掩盖低线脆弱"的 pattern，由工具自身制造。
- **修复**（按复查基线）：① 升级后实例复核——`upgradeDependency` 成功后重读 lockfile，仍存在 `< recommended` 实例（workspace 成员同 range / 传递依赖 pin 残留）→ 回滚 + 计 failed + 审计错误，不进入验证阶段；② 准入谓词从 `isWorkspaceDirectDependency` 收窄为 `isRootDirectDependency`（与修复器只改根 manifest 的能力对齐，成员独占声明维持人工）；③ 同包多跨线告警按包聚合取最高 recommendedVersion（镜像 dedupeFixableAlerts）；④ 完整验证动作入 allActions（报告可审计）。
- **启示**：
  - **实现者会相信自己的注释**："单版本必然跟随"写在注释里就成了实现依据；独立审计质疑假设才能暴露多消费方场景的残留。
  - **准入谓词必须与修复器能力对齐**：判定"能处理"（workspace 直接依赖）宽于实际能力（只改根 manifest）时，必然产生"进入链路即失败"的路径。
  - **成功判定 = 漏洞真实消除，而非"流程走完"**：install 成功 + 验证通过 ≠ 告警关闭；跨线升级等高风险路径必须复核最终状态（lockfile 实例）。

## 十六、规范存在 ≠ 被执行：编号标记重复违规（3c714cc1 → T405 回归）

- **案例**：3c714cc1 清理 60 处编号标记并立规（development.md §3：注释与测试名禁规划/任务/审计编号，例外仅真实常量与带文档路径的导航指针）。T405 实现（edfb9e07）又引入 8 处编号标记（`T405`、`P1-1`、`P2-1`、`C10` 等）——用户发现后指出与 3c714cc1 同类。
- **根因**：规范条款没有挂接到执行环节——D 阶段自检清单不含"规范一致性"检查；A 阶段（Review Gate）必查项不含注释/测试名规范。规范写在文档里，但实现与审计两端都没有触发点，成为"纸面规范"。
- **修复**：① 清理本次引入 8 处 + 既有残留 2 处（只删编号、保留解释正文）；② `code-auditor.agent.md` 主责边界新增"**开发流程编号标记检查（必查项）**"（禁止形态正则 + 例外两类 + 孤立编号退回清理）；③ `code-reviewer` code-quality-checklist 新增 `Standards Compliance > Development-Flow ID Markers` 小节；④ full-stack-master D 阶段自检补"规范一致性"检查项。
- **启示**：
  - **治理规则必须挂接触发点**：规范文档条款要映射到至少一个执行检查点（D 阶段自检清单 / A 阶段必查项 / lint 规则），否则必然回归。
  - **新功能注释引用规划编号是"流程心智渗透代码"信号**：开发流程编号（T405/P1-1）属于 `docs/plan/` 的进度概念，代码中无意义且无法反查；实现时注释只写解释正文，编号留在规划文档与审计记录（git blame 可追溯）。
  - **用户视角的规范一致性最有价值**：实现者聚焦新功能容易忽略与既有规范的冲突；交付前主动对照仓库规范（注释/命名/目录约束）可减少此类往返。

## 十七、批量替换的误伤链：正则清理必须限定上下文并验证（3c714cc1 教训）

- **案例**：3c714cc1 用脚本批量清理 43 个文件的 60 处编号标记时，三次误伤：
  1. **行尾整体翻转**：仓库存在混合行尾（helpers.test.ts 36 CRLF + 875 LF）。首版脚本按"文件含 CRLF → 整体按 CRLF 重写"，把 878 行全部转为 CRLF，diff 变成 878+/878- 噪音（`git diff --ignore-space-at-eol` 显示真实改动仅 5 行）。
  2. **URL 空格误伤**：修复"注释丢空格"的正则 `/\/\/(?!\/)/` 把 `https://www.conventionalcommits.org/` 改成了 `https:// /www...`——check-links 只查本地链接，外链被静默破坏，审计 B1 才捕获。
  3. **代码空调用误伤**：`\(C\d+[^)]*\)` 类正则把代码里的空调用 `()` 一并删掉（`.trim()` → `.trim`、`toUpperCase()` → `toUpperCase`、`empty():` → `empty:`），导致 typecheck 报 TS1109/TS1005，77 个测试失败（`TypeError: Invalid URL`）。
- **根因**：批量替换用宽泛正则 + 未限定上下文（注释行 / 字符串 / 代码任意位置都命中）+ 替换后未先跑最小验证（typecheck）就直接提交前验证。
- **修复**（按复查基线）：
  - 行尾处理改为**按行保留原行尾**（`split(/(\r?\n)/)` 保留 EOL 再拼接），不整体转换。
  - 正则限定上下文：注释行（`/^\s*\/\//`）、`it('`/`describe('` 字符串前缀、精确字符串清单（人工核对），不再用可匹配任意位置的 `[^)]*` 通配。
  - 替换后立即 `pnpm -r exec tsc --noEmit` + 全量测试，用 `git diff --ignore-space-at-eol` 检出行尾噪音，用 `rg` 残留扫描收尾。
  - 外链破坏风险：check-links 只覆盖本地链接，涉及外链文本时额外人工核对或全文搜索 `:// /`。
- **启示**：
  - **批量替换先小样验证，再全量**：先在 1 个文件上跑替换 → typecheck + diff 审查 → 确认无误再铺开到全部文件（与修复工作流"先 1 个代表性文件 → 定向 subset → 批量"同构）。
  - **正则默认是危险的**：能用精确字符串就不写正则；必须用正则时限定前缀/上下文，禁止 `[^)]*`、`.*?` 等贪婪通配在注释与代码混合的文件中跨上下文匹配。
  - **混合行尾仓库的读写纪律**：Windows 下 git 不统一行尾（core.autocrlf=false 时 LF/CRLF 并存），任何脚本写文件必须按行保留原行尾，否则制造全文件噪音 diff（见 §十）。
  - **替换类变更的验证矩阵 = typecheck + 定向测试 + diff 噪音检查 + 残留扫描**，四者缺一不可。


## 十八、防护正则/枚举按"全集"核对，修复 Review 发现时做同类扫描（M4.6 T406 两轮 P1/P2）

- **案例**：T406 新增 `isNonSemverDeclaration`（拒绝 `workspace:`/`catalog:` 等协议声明被 `extractPrefix` 误改）。首轮 Review Gate 发现正则漏 `git+ssh`/`git+https`/`https`/`ssh`（P1-1：来源从 fork/私有源静默切回 registry 的不可逆改写）；修复后复审又发现漏 `gitlab`/`bitbucket`/`gist`/`git+http`/`git+file`（P2-2）——**同类遗漏连续两轮**。
- **根因**：防护正则按"已知场景"手写，而非对照协议全集（npm-package-arg 的 gitProtocols：`git+ssh`/`git+https`/`git+http`/`git+file`/`git` + `github`/`gitlab`/`bitbucket`/`gist`）编写测试；修复审计发现时只补了报告的点，未对同类变体全量扫描。
- **修复**：正则扩展为协议全集 + 落地测试矩阵（index.test.ts：正向 18 例 / 反向 7 例，含 whitespace 变体）并经 node 实跑核验。
- **启示**：
  - **防护性正则/枚举必须按"全集"编写测试**：npm-package-arg、semver 规范、语言关键字表等权威清单是测试用例来源，不是"常见写法"。
  - **修复 Review 发现 = 同类扫描时机**：拿到一个 P1/P2 后，先 grep 全库同类 pattern（同正则家族、同字段、同调用模式），再动手修，避免"修一个漏一批"（与 code-auditor 根因分析"扫描同类 bug"一致）。

## 十九、新增维度字段必须检查全部消费点（聚合/指纹/去重/渲染）（M4.6 T406/T407）

- **案例**：T406 给 `FixAction` 引入 `filePath` 维度（成员 manifest 路径）。Review Gate 两轮各发现一个遗漏消费点：① `aggregateUpgradeActions` 按 (repo, package) 聚合，成员 action 与根 action 合并时 filePath 丢失（P2-1）；② `computeFixFingerprint` 的 upgrades 键不含 filePath，根升级与成员升级产生相同指纹 → fix-and-pr 模式下成员变更被旧 PR 错误 skip（复审 P2-1）。
- **根因**：新增维度时只改了"产生方"（app 2.0.3 写入 filePath）与"直接渲染方"（报告），未盘点实体的**全部消费方**：聚合键、指纹键、去重键、fixed 判定、明细表渲染。
- **修复**：聚合键与指纹键均纳入 filePath（缺省 `'root'`），三处消费点统一。
- **启示**：给 action/alert/entity 增加语义字段时，先列出该实体的消费方清单（聚合、指纹、去重、报告渲染、状态判定），逐项确认是否需要纳入新维度；Review 时同样按此清单核对（已加入 code-reviewer checklist）。

## 二十、测试断言要精确到"链路身份"，不笼统断言"未调用"（M4.6 集成测试）

- **案例**：成员实例残留用例最初断言 `mockRunVerification` **未被调用**——但主流程在修复完成后还有整体验证（install+lint），mock 实际被调用 1 次，断言失败。修正为"无 lint-only quickVerify 调用"（按 commands 签名过滤）后通过。
- **根因**：同一 runner（runVerification）被多条链路复用（quickVerifyProject 单命令 lint / verifyProject 完整链），断言"未调用"没有区分链路身份。
- **启示**：mock 被多链路复用时，断言按**调用参数签名**（commands 数组、cwd 等）过滤到目标链路，而不是笼统断言调用次数/未调用；这也让断言对"未来新增验证链路"免疫。

## 二十一、脚本化编辑必须验证文件内容，不能信命令输出（PowerShell 内联脚本陷阱）

- **案例**：用 `node -e` 更新 todo.md 状态行（PowerShell 双引号包裹），脚本内反引号被 PowerShell 当作转义符吞掉 → 替换模式不匹配、静默失败（输出 "updated" 但文件没变）。同批 checkbox 更新（无反引号）成功，状态行更新（含反引号）失败——**同一脚本部分生效**。
- **修复**：改用编辑工具直接改文件；之后用 node 读取文件内容核验。
- **启示**：
  - 脚本化批量编辑后必须**读回文件内容验证**（grep/read 关键行），不能相信命令的"成功"输出——部分匹配/转义失效会静默。
  - PowerShell 中内联 node -e 脚本避免在双引号内嵌反引号（`` ` `` 是 PS 转义符）；复杂替换优先用编辑工具或独立脚本文件。
  - 文档状态类更新（todo.md checkbox/状态行）失败率高且难察觉，更新后必须抽查渲染结果。

## 二十二、CI 链式暴露：修复一项 ≠ 全链通过；本地不可测的陷阱只能靠 CI 端到端裁决（M5 收尾，2026-08-07）

- **案例**：T506 提交后连续三个 CI run 各暴露一个不同的问题，形成"剥洋葱"链：
  1. run 31150894635：`lint:md:check` 失败——`packages/**/*.md` glob 在 CI 穿透 node_modules（p-queue/dotenv/dayjs readme 报 4 errors），本地 Windows 因 pnpm 符号链接结构无法复现。根因深挖：`.lintmdrc` 显式写 `"excludeFiles": []` **覆盖掉了 lint-md 工具默认的 `**/node_modules/**`、`**/.git/**` 排除**——"把默认值显式写空"等于关闭保护。
  2. run 31152560502：`lint:md:check` 修复后，此前被短路跳过的 `check:links` 首次执行——roadmap.md 两个锚点指向 todo.md 的 M4/M4.6 标题，但内容已归档到 todo-archive.md（标题带"已归档"后缀）→ 锚点失效。
  3. run 31152668506（Dependfix Security Scan dogfood workflow）：action.yml 的 `ai-api-key` input **description 文本**内嵌示例 <span v-pre>`${{ secrets.DEEPSEEK_API_KEY }}`</span>——composite action manifest 解析器把 description 字符串中的 <span v-pre>`${{ }}`</span> 当表达式求值，`secrets` 上下文在 action 模板层不可用 → "Unrecognized named-value: 'secrets'" 整个 action 加载失败。本地 husky lint（YAML 语法合法）与构建都无法检测，只有 action 真实运行（dogfood workflow `uses: ./`）暴露。
- **根因**：① 修复只针对暴露点，未让被短路跳过的后续步骤真正跑起来；② 环境差异（Windows 符号链接 vs Linux glob 展开）与模板校验（manifest 解析）存在本地不可测的盲区；③ 配置文件显式写空默认值、纯文本内嵌表达式，均属"表面无害实则破坏契约"的写法。
- **修复**：`.lintmdrc` 恢复默认排除；roadmap 链接改指 todo-archive.md 并同步锚点（带"已归档"）；action.yml description 改纯文本（"在 workflow 中引用 secrets.X 传入"），去表达式。每项修复后本地 `check:links` / `lint:md:check` 验证，端到端确认依赖推送后 CI 复跑。
- **启示**：
  - **CI 修复是剥洋葱**：修复一个失败点后，必须让该 job 此前被短路跳过的全部后续步骤真正执行，确认全链通过才算修复完成；dogfood / 独立 workflow 也会暴露主 CI 不覆盖的层（action manifest、真实 API 调用）。
  - **配置文件"显式写默认值"要谨慎**：`excludeFiles: []`、空 overrides 等会覆盖工具内置保护；修改配置前先读工具源码/文档确认默认值，保留或对齐默认。
  - **composite action 中 <span v-pre>`${{ }}`</span> 只允许出现在合法上下文**（runs 步内、outputs 表达式、with 的表达式值）；description / 纯文本 / 注释内嵌表达式会被 manifest 模板校验求值并可能引用不可用上下文——action.yml 改动后应跑一次真实 action（本仓库 dogfood workflow 即 `uses: ./`）验证。
  - **环境类修复（glob 穿透、manifest 校验、依赖安装差异）本地验证 ≠ 修复完成**：本地做"模拟探针"（构造等价文件/场景）只能提高置信度，最终以 CI 复跑为准（§4.2 CI 最终裁决原则的再印证）。
  - **VitePress 站点内 md 的行内代码中双花括号字面量会触发 Vue 插值编译失败**（2026-08-07 第四层暴露：docs build "Error parsing JavaScript expression"）：`{` `{` 成对是 Vue 插值语法，行内代码（反引号包裹）不豁免；修复用 `<span v-pre>` 包裹行内代码（如 `$` 后接双花括号的表达式示例用 v-pre 包裹），fenced code block 内则天然安全。**文档变更（docs/ 站点内 md）本地验证矩阵必须包含 `pnpm --filter dependfix-docs build`**——lint:md 与 check:links 均不覆盖 Vue 编译层。

## 二十三、统一行尾前必须先检测 HEAD 存储方向；特殊字符脚本一律写临时文件（2026-08-07 强化）

- **案例**：编辑工具向 CRLF 历史文件写入 LF 块 → helpers.ts / helpers.test.ts 混合行尾（审计提示）。修复时未先查 HEAD 存储形式，直接把文件转 LF——helpers.ts 的 HEAD 实际存 CRLF（`core.autocrlf=false`、无 .gitattributes）→ 全文件 1697 行 diff；helpers.test.ts 的 HEAD 存 LF → 转 CRLF 又全文件 diff。两个文件各踩一次反方向，才意识到**每个文件要独立检测**。
- **修复**：`git show HEAD:<file>` 检测 repo 存储行尾，按文件原始行尾对齐（helpers.ts 恢复 CRLF、helpers.test.ts 转回 LF），diff 恢复局部化（37 / 119 行）。
- **启示**：
  - 统一行尾是**按文件**的操作，不是按批次：`git show HEAD:<file> | 检测 CRLF 计数` 确定方向后再转换；转错方向 = 全文件 diff（违反最小改动）。
  - 行尾统一后必须 `git diff --stat` 核验 diff 规模恢复局部化，再跑受影响测试（行尾转换不影响行为，但确认无意外改写）。
  - PowerShell 内联 node 脚本含 <span v-pre>`${{`</span>、`${`、反引号、嵌套引号时反复触发 ParserError（§二十一 再犯 3 次）——**含任何特殊字符的脚本一律写临时 .cjs 文件执行**（`C:\Users\CAOMEI~1\AppData\Local\Temp\opencode\`），不再尝试内联。
