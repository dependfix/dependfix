# 经验归档（Experience Archive）

> 本文档保存跨 Session 经验教训的**详细前因后果**，持续追加、不设结束日期。
> 规范文档只保留可执行方法论；需要追溯具体案例时查阅本文档。
> 蒸馏机制见 [session-wisdom-distillation.md](./session-wisdom-distillation.md)。

## 准入标准（新增条目前必读）

不是每条经验都值得写入。满足以下**至少一条**才追加新章节（编号连续：二十五、二十六……）：

1. **教训未落入规范**：可执行方法论尚未迁移到 `docs/standards/` 或 skill/agent 定义（本文件只存案例，规范吸收后案例仍保留作溯源）。
2. **决策需要溯源**：产品/技术方向的关键决策（跨线升级、全 ESM、防护策略等），未来需回答"为什么当时这么做"。
3. **重复违规预警**：同一模式已违规 ≥ 2 次（如编号标记、行尾、脚本化编辑），案例用于证明"必须挂检查点"。
4. **工具/环境陷阱**：本地不可测、跨平台差异、工具默认值覆盖等只有真实运行才能暴露的问题。

**不值得写入**：教训已完全内化且无决策溯源价值的一次性偶发；纯环境噪音（无普适启示）；泛泛而谈无具体案例/硬数据（run ID、commit、文件数）的"心得"。

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
  - PowerShell 内联 node 脚本含 <span v-pre>`${{`</span>、`${`、反引号、嵌套引号时反复触发 ParserError（§二十一 再犯 3 次）——**含任何特殊字符的脚本一律写临时 .cjs 文件执行**（写入项目根 `temp/`，已被 git 忽略；临时文件位置约定见 [AI 协作规范 §1.2 执行原则第 7 条](../../standards/ai-collaboration.md)），不再尝试内联。

### 二十三补充（2026-08-09）：个人机器绝对路径泄漏 + check-links 正文扫描缺口

- **案例**：§二十三 原文把当时使用的全局临时目录绝对路径直接写入文档（行内代码形式），随仓库迁移/换用户即失效，且成为"写临时文件触发权限审批"的根因之一。`check:links` 未发现该泄漏——它只扫描 Markdown 链接语法（`[text](target)`）中的绝对路径，**正文/行内代码中的纯文本绝对路径不在扫描范围**。后续全库扫描还抓出同类存量泄漏：`backlog.md` 的 pnpm store 自定义路径。
- **修复**：`check-links.mjs` 新增正文路径扫描（跳过 fenced code block，扫描原始行含行内代码），高特征模式（Windows 盘符 + 字母负向断言排除 URL scheme、UNC 前缀）；`documentation.md §2` 新增"正文路径禁令"；存量泄漏改 `<drive>:` / `<repo-root>/` 占位符。
- **启示**：
  - 文档中禁止写入个人机器绝对路径（盘符形式、UNC 等），引用项目内位置一律相对路径或 `<repo-root>/` 占位符；fenced code block 教学示例豁免。
  - 工具检查的覆盖边界要与规范声明一致：规范说"禁止"，工具就得能扫出来，否则约束悬空（本次是用户指出后补的缺口）。

## 二十四、单次大 diff 成本失控：长任务必须分批提交（T601 平台骨架，2026-08-08）

- **案例**：M6 的 T601（平台骨架）把整个新领域一次性实现——Nuxt 4 + better-auth + TypeORM 多后端 + Docker 多阶段 + CI workflow + 根配置，单次提交 48f9c7eb 达 **40 文件 / +8329 行 / -238 行**。后果：
  1. **审计轮次暴涨**：提交② 分平台区与 Docker 区并发审计，仍各 2-3 轮往返（平台区 B1/W1-W4/S1/S3/S5 → 复审 Pass 但残留 W5/W6；Docker 区 W1 修复自身引入重复 YAML 键 blocker → 第 3 轮才 Pass）。
  2. **修复往返 10+ 处**：编号标记 4 处、SMTP 条件颠倒、AUTH_SECRET 生产校验（后补双哨兵）、admin 竞态吞错、banned/banExpires 列类型、密码长度 6→8、正则转义、未用导入、.dockerignore 缺失、docker.yml permissions 重复键、compose AUTH_SECRET→NUXT_ 前缀、全局 skill 失效链接等——错误密度与 diff 规模正相关。
  3. **总耗时数倍放大**：对比同阶段其他提交——提交①（3 文件/381 行）与提交③（2 文件/71 行）均 1-2 轮通过、审查 1-5 分钟；提交② 的审计+修复链持续多轮。
- **根因**：① 规划期未做任务粒度约束，T601 被定义为"一个大原子条目"；② 新领域（从未写过的 Nuxt/better-auth/TypeORM 组合）没有先做水平切片验证技术选型，直接把全部未知叠加在一起实现；③ F 阶段"单次提交"口径鼓励了攒大 diff。
- **修复**：规范层落地四处约束——`planning.md §1.1` 增加任务粒度约束（> 10 文件或 > 800 行必拆子任务）；`git.md §3` 增加分批提交条款（每批 ≤ 10 文件且 ≤ 800 行新增，锁文件随所属批次）；`ai-collaboration.md §2 F` 从"单次提交"改为"分批提交"；full-stack-master skill/agent 的 D/F 阶段同步"批次拆分 + 分批提交"。
- **启示**：
  - **单次提交规模是任务成本的最强杠杆**：规模 × 错误面 × 审计轮次近似平方关系，控住规模即控住成本；批次数值建议 ≤ 10 文件且 ≤ 800 行新增（新领域从严，> 5 文件即考虑拆分）。
  - **新领域大任务先做水平切片**：最小可验证的端到端子集（如：先起一个能登录的最小 Nuxt 应用）验证技术选型成立，再按垂直层（数据库 → 认证 → UI → 部署）分批落地；未知叠加未知 = 错误面爆炸。
  - **"一个原子条目 = 一个提交"不等于"一个任务 = 一个提交"**：原子性约束的是逻辑边界，不是规模；长任务必须在 P 阶段拆成多个原子条目，每个条目独立验收、独立审查、独立提交。
  - **审计者也受规模惩罚**：大 diff 的并发分区审计虽然可行，但跨区问题（如 compose 前缀与 auth 校验互相关联）仍会漏到复审才发现——分区审计不能替代事前拆分。
  - **规范要单点声明，严格约束挂 review 阶段**（2026-08-08 二次修正）：首批治理把"分批提交"完整条款抄进 5 处（planning/git/ai-collaboration/skill/agent）——本身制造了新的维护漂移面。正确模式：**权威声明只留一处**（planning.md §1.1 任务粒度约束），其余文档仅一行链接引用；**严格约束（阈值/禁令）放在 review 阶段检查点**（code-reviewer SKILL.md diff 规模核验必查项 + Code Auditor 主责边界），因为 review 阶段上下文干净（只看 diff 与验证证据），比开发阶段（上下文杂、任务重）更容易强制执行。原则已写入 [documentation.md §4 规范单点声明原则](../../../docs/standards/documentation.md)。

## 二十五、新增发布包会散落多处遗漏：包清单必须单点声明（2026-08-08）

- **案例**：M6 新增 `packages/mcp` 后，用户指出三处遗漏：① 包无 README；② `docs/guide/release.md` 发布包清单未更新；③ `scripts/changelog.mjs` / `scripts/create-changeset.mjs` / `.github/workflows/release.yml` 的包列表硬编码未加 mcp——每加一个包要手动改 4-5 处，漏一处即发布链路残缺。同时发现更深 bug：cli/core 的 0.2.0 已在 npm 发布但 git tag 仅 0.1.0 系列，`changelog.mjs` 的 `isVersionTagged` 只用本地 tag 判断"已发布"，导致 0.2.0 被误判为未发布段——重跑 `pnpm changelog` 会把新提交塞进已发布段并改写日期（08-07 → 08-08），污染已发布 CHANGELOG。
- **根因**：① 包元数据（路径/包名/发布顺序/是否就绪）没有单一权威来源，散落脚本与 CI 的硬编码；② "是否已发布"判定只信本地 git tag，不信 npm registry——手动发布（npm publish 但 tag 未推送/遗漏）与正常 changesets 流程（tag 随发布创建）状态不一致。
- **修复**：
  - 新增 `scripts/packages.config.mjs` 单点声明（4 包 path/pkg/changelog/tags/publishOrder/publishable），changelog.mjs / create-changeset.mjs / release.yml 全部改为引用派生，新增包只改一处；
  - `publishable: false` 未就绪包必须同步 `.changeset/config.json` `ignore` 登记（防 changeset publish 意外发布不可逆 npm 包）+ `changelog: null`（不为未发布包生成包级日志）；
  - `isVersionTagged` 增加 npm registry 兜底（`npm view <pkg>@<version>`），修复 Windows `2>/dev/null` 重定向不兼容（改 stdio 捕获）；tag 短路保留（正常流程零网络开销）；
  - review 阶段新增"新增发布包链路完整性"必查项（code-quality-checklist.md）：单点登记 / changeset ignore / README / release.md / CI 引用 / Docker 影响面。
- **启示**：
  - **包清单是典型的单点声明场景**：路径、包名、发布顺序、就绪状态这些元数据一旦散落多处，必然漂移。收敛到一处配置 + 派生引用，新增包成本从"改 4-5 处"降到"改 1 处 + 补 README"。
  - **"已发布"判定不能只信单一来源**：npm registry 是发布事实的最终权威，git tag 只是 changesets 流程的产物——手动发布路径会打破两者一致性。判定应"任一命中即已发布"（tag 短路 + registry 兜底），且失败方向要保守（宁可漏生成也不改写已发布段）。
  - **脚本的跨平台兼容性要用真实环境验证**：`2>/dev/null` 在 Linux 正常、Windows 直接报"系统找不到指定的路径"——跨平台脚本的 shell 重定向必须用 Node 的 stdio 捕获替代。
  - **生成类脚本的幂等性要"干净状态实测"**：changelog 类脚本必须在干净工作区（git stash 后）重跑验证"已发布段 unchanged"，而不是在污染后的状态上观察输出——上一轮"updated"其实是修复前残留，只有 stash 后重跑才暴露真实行为。
  - **演进注记（2026-08-10）**：本条目描述的 `publishable: false` 与 `.changeset/config.json` `ignore` 联动已随 changeset 移除而消亡（[发布管线自研化](./release-pipeline.md)）——新脚本 release:version/publish 仅消费 `publishable: true` 的包，未就绪包条目由 release:version 的 `KNOWN_PKGS` 硬校验拦截，单点声明收敛为一处。

## 三十二、"已发布"判定不能依赖 npm CLI：Windows 下 execSync 超时必失效（2026-08-10）

- **案例**：发布管线自研化时实测 `isPublishedOnRegistry`（`execSync('npm view <pkg>@<version> version --json', { timeout: 10_000 })`）在 Windows 本地**每次都在 10s 整超时**（ETIMEDOUT，err.stderr 为空、status null），导致判定恒返回 null（保守跳过）——tag:released / release:publish 的"已发布判定"在本地完全失效。而同进程 Node fetch 直连 registry.npmjs.org 实测 1-2s 完成（E404 正确识别）。
- **根因**：npm CLI 在 Windows 是 `.cmd` 包裹（cmd.exe 派生 node 进程），单次启动 + registry 查询实测 >13s（与网络波动叠加），10s 超时必然触发；execSync 的 timeout 对 cmd 包裹进程的终止语义不可靠。**npm 慢不是网络慢**——registry 直连毫秒级响应，瓶颈在 CLI 启动开销。
- **修复**：`isPublishedOnRegistry` 改用 Node 原生 `fetch` 直连 `https://registry.npmjs.org/<pkg>`（abbreviated metadata header），语义保持：404→false / 非 2xx→null / `versions[version]` 命中→true；`AbortSignal.timeout(20_000)` 控超时；首次连接建立可能慢（UND_ERR_CONNECT_TIMEOUT 偶发）→ 网络异常重试一次（连接池复用后稳定），404/非 2xx 不重试；仍失败才保守返回 null。main 异步化并行查询（每包一次 fetch）。
- **启示**：
  - **registry 状态查询优先直连 API，不绕 npm CLI**：fetch 直连 registry.npmjs.org 无 CLI 启动开销、超时可控（AbortSignal）、无跨平台 shell 差异——发布/版本判定的标准实现。
  - **超时类缺陷要用"恰好在超时点失败"的模式识别**：10s 超时、每次都 10.0-10.2s 失败 = 稳定超时而非网络抖动；再对比同进程内其他网络操作耗时，即可定位"CLI 开销"还是"网络慢"。
  - **保守方向语义要保留**：查询失败返回 null（调用方跳过）比误判安全——漏发可重试，误发不可逆；重试逻辑只覆盖网络瞬态，不覆盖确定状态（404）。
## 二十六、git tag 的"创建"与"推送"分离：CI 推送静默失败 + 本地补打不推送（2026-08-08）

- **案例**：发布 0.2.0 后排查发现远程 tag 严重不齐——本地 6 个 tag（v0.1.0 + 0.1.0 三个包 tag + 0.2.0 两个包 tag）与远程（仅 v0.1.0）长期不同步。两条独立路径共同导致：
  1. **0.1.0 包 tag 本地补打后从未推送**：commit 40d3085b 说明"依赖本地补打的 dependfix@0.1.0 / @dependfix/core@0.1.0 / @dependfix/skills@0.1.0 锚点 tag"——为 changelog 判定补打后只留在本地，普通 `git push` 不带 `--tags` 不推送 tag（`push.followTags` 未配置时 git 默认只推分支）。
  2. **0.2.0 tag CI 创建但推送静默失败**：run 31208208621 日志显示 changeset publish 明确创建 annotated tag（`🦋 New tag: dependfix@0.2.0`），但随后 `Push release tags` 步骤 `git push origin --tags` 输出 **`Everything up-to-date`**——tag 实际未推送，远程始终缺失。本地完整模拟（fetch --no-tags + refs/tags 镜像 + annotated tag + push --tags）无法复现，确认是 CI 环境特有行为（`persist-credentials: false` + `git config --global url."...".insteadOf` 组合在 Actions checkout 下不可靠）。
- **根因**：① tag 的"创建"（changeset 在 runner 临时仓库中）与"推送"（显式 push 步骤）是两个独立动作，任何一环静默失败 tag 即丢失，且 runner 销毁后本地无从追溯；② `git push origin --tags` 依赖 insteadOf URL 替换，该机制在 CI 环境下不可靠却**静默返回 up-to-date**；③ 本地补打 tag 无推送纪律（followTags 未配置 + 无核验）。
- **修复**：
  - release.yml `Push release tags` 改为**显式带 token 的 push URL**（`git push https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git --tags`，官方推荐模式），不再依赖 insteadOf 全局替换；
  - 推送后**核验本地/远程 tag 集合一致**（`git ls-remote` 对比，缺失即 `::error::` + exit 1），静默失败从此显式化；
  - changelog 已发布判定加 npm registry 兜底（§二十五），tag 缺失不再影响发布段保护；
  - 经验教训：本地开发建议 `git config --global push.followTags true`（日常 push 自动带 annotated tag，防止补打 tag 滞留本地）。
- **启示**：
  - **发布链路的"创建"与"推送"必须分开核验**：生成类步骤（changeset publish）只保证本地创建，推送是独立职责；任何"静默成功但未生效"的输出（`Everything up-to-date`）都要怀疑——本地/远程集合对比是最低成本的真相核验。
  - **CI 环境行为不能从本地推断**：insteadOf URL 替换、persist-credentials: false 组合下的 push 行为，本地模拟（含 fetch --no-tags + tags 镜像）完全正常、CI 却 up-to-date——CI 特有的交互只能用 CI 实证（真实 run 日志），本地模拟只能排除本地因素。
  - **git 默认不推 tag 是常识级陷阱**：`push.followTags` 未配置时普通 push 只推分支不推 tag；补打 tag 后必须显式 `--tags` 或配置 followTags，否则 tag 永远留在本地。
  - **tag 是 changelog/发布判定的依赖时，tag 生命周期必须有纪律**：创建（changeset/手动补打）→ 推送（显式 + 核验）→ 验证（本地=远程），三环缺一即产生"tag 不同步却无人察觉"的漂移。

## 二十七、monorepo CI 类型解析链：workspace 包未构建 + Nuxt tsconfig 不映射源码 + ESLint 子配置不自动加载（2026-08-08）

- **案例**：M6 平台阶段推送后连续三个 CI run 暴露同一条类型解析链上的多个独立问题：
  1. run 31252254642 / 31252254646（60d9fd6e）：`pnpm run lint` 报大量 `@typescript-eslint/no-unsafe-*`（platform 的 executor/scan-orchestrator 文件）超 `--max-warnings 10`；`pnpm run test:coverage` 报 `Failed to resolve entry for package "dependfix"`。根因：CI 中 `pnpm i --frozen-lockfile` **不构建 workspace 包**，`dependfix`（=packages/cli）、`@dependfix/core` 无 dist → platform 的 Nuxt tsconfig（`.nuxt/tsconfig.json` 由 Nuxt 生成、不映射 workspace 源码）类型解析失败 → type-aware 规则把导入当 error/any → unsafe 警告爆炸；vitest 缺 `dependfix` alias → mcp 测试入口解析失败。
  2. 修复期实证：**Nuxt 的 `typescript.tsConfig.compilerOptions.paths` 不会被合并进 `.nuxt/tsconfig.json`**（实测 paths 仍 38 个、新增不生效）；`alias` 配置虽会写入 tsconfig paths，但基准是 `.nuxt/` 目录且指向 src 会把 cli/core 源码纳入 Nuxt 的 strict 编译上下文（TS2532 等大量错误）——**Nuxt 平台无法通过 paths/alias 把 workspace 包映射到 src，唯一可靠路径是 CI 先构建依赖包的 dist**（与 Dockerfile 的 core → cli → platform 顺序一致）。
  3. **ESLint 9 flat config 从根目录 `eslint .` 不自动加载子目录 eslint.config.js**（实测 cli/core/mcp/platform 的独立配置在根 lint 中均未生效；`--print-config` 与行为级验证都只命中根配置）——子配置只在包目录内 lint（`pnpm --filter X lint`）时生效，monorepo 根 lint 必须把各包规则写进根配置或显式引用。
  4. 移除 `@nuxt/eslint` 后（withNuxt 方案因依赖链 h3 冲突被否）暴露 **platform 直接 `import { H3Event } from 'h3'` 但未显式声明 h3**（此前靠 @nuxt/eslint → devframe → h3@2.x 恰好提供）——pnpm 严格模式不会提升传递依赖，直接 import 的包必须显式声明。
  5. run 31259481235 / 31259481230（fcc161b4 后）：lint/typecheck 已绿，但 **coverage job 6 个 platform 测试 TSCONFIG_ERROR**（coverage job 独立环境缺 `nuxt prepare`，vitest 转换测试文件需读 `.nuxt/tsconfig.json`）；**1 个 nock 测试 flaky**（`times(100)` 在 CI Linux 1 秒超时窗口内请求数超过 100 → 第 101 次 No match，本地 Windows 事件循环较慢恰好未触发）。
- **根因**：① monorepo 中"应用层（Nuxt platform）直接 import workspace 包类型"与"CI 不构建 workspace 包"天然冲突，且 Nuxt 生成的 tsconfig 不感知 workspace 源码；② ESLint 9 flat config 的配置发现机制是"从 cwd 找唯一配置"，与 eslintrc 时代"目录级联"心智不同；③ 引入 `@nuxt/eslint`（withNuxt 的标准路径）时未审查依赖链副作用（config-inspector → devframe → h3@2.x 与 Nuxt 4 的 h3@1.x 是 breaking API）；④ CI 每个 job 是独立环境，test job 的 prepare 不继承给 coverage job；⑤ 固定次数 mock 对执行速度敏感。
- **修复**：
  - test.yml / docker.yml：nuxt prepare 后、lint 前新增 `pnpm --filter @dependfix/core build && pnpm --filter dependfix build`（注释说明"Nuxt tsconfig 不映射 workspace 源码，必须先构建 dist"，顺序与 Dockerfile 一致）；
  - coverage job 补 `nuxt prepare`（与 test job 对齐）；
  - vitest.config.ts 增加 `dependfix` alias → `packages/cli/src`（与既有 `@dependfix/core` alias 对齐）；根 tsconfig.json paths 增加 `dependfix` → `./packages/cli/src`（mcp typecheck/lint 源码级解析，不依赖 dist）；
  - apps/platform 显式声明 `h3@^1.15.11`；
  - apps/platform/eslint.config.js（新增）：参考 momei 以 `eslint-config-cmyr/nuxt` 为基础的手写 flat config；**不用 withNuxt**（避免 @nuxt/eslint → h3@2.x 冲突）；no-unsafe-* 系列关闭（渐进收紧策略）；根 eslint.config.js 平台块同步改为 momei 风格；packages/mcp/eslint.config.js + tsconfig.eslint.json（新增，参考 cli/core）；
  - action-result-fetcher.test.ts 超时测试 `times(100)` → `times(1000)`（注释说明跨平台 flaky）；
  - pnpm-workspace.yaml `unrs-resolver` 占位文本 → `true`（pnpm 11 allowBuilds 白名单，`ERR_PNPM_IGNORED_BUILDS`）。
- **启示**：
  - **monorepo 应用层依赖 workspace 包类型时，CI 必须先构建依赖包**：Nuxt 生成的 tsconfig 不映射 workspace 源码（paths/alias 均不可靠），`pnpm i --frozen-lockfile` 不构建包——lint/typecheck 前的显式 `pnpm --filter <dep> build` 是唯一可靠路径，顺序参考 Dockerfile 的依赖图。
  - **ESLint 9 flat config 的配置发现是"单文件"模型**：根目录 `eslint .` 只用根配置，子目录 eslint.config.js 只在包内 lint 生效；monorepo 根 lint 要么把各包规则写进根配置（单源），要么接受"根 lint 与 IDE/包内 lint 行为漂移"（审计 W3 即此风险）。withNuxt 的 chainable 对象不可迭代，根配置引用需 `await` 展开，且 files 模式基准会错位——直接复用子配置进根配置同样有坑。
  - **引入依赖前审查依赖链的破坏性传递**：`@nuxt/eslint` 是 Nuxt 官方 eslint 集成，但其 config-inspector → devframe → h3@2.x 与 Nuxt 4 的 h3@1.x 是 breaking API 冲突，直接破坏 platform typecheck（双 h3 版本并存时 Nuxt 类型检查报 H3Event 不兼容）。`pnpm why h3` 在引入前/后各跑一次是标准动作。
  - **pnpm 严格模式不提升传递依赖**：代码直接 `import` 的包必须在本包 package.json 显式声明，即使"恰好"能解析（此前靠另一条依赖链间接提供）；移除该链后立即暴露。
  - **CI job 隔离是常识级陷阱**：coverage/test/lint 各自独立环境，任何依赖生成产物（`.nuxt/tsconfig.json`、dist）的步骤都要在该 job 内显式准备，不能假设"别的 job 跑过"。
  - **固定次数 mock 对执行速度敏感（跨平台 flaky）**：`times(100)` 这类"够用就行"的 mock 上限，在更快环境（CI Linux vs 本地 Windows）可能被突破；循环/轮询类测试优先用 `persist()` 或放大 10 倍上限，并注明原因。
  - **PowerShell 管道输出中文乱码 ≠ 文件损坏**：git diff / 文件读取经 PowerShell 管道会按 GBK 转码产生 mojibake 假象；用 Node `execSync`/`TextDecoder` 直接读字节验证编码（本次 HEAD 与工作区均为合法 UTF-8）。

## 二十八、CI 修复是剥洋葱的再印证：lint 绿 ≠ test 绿，coverage 环境独立（2026-08-08）

> 本条目与 §二十二 同主题的第二次实证，合并记忆锚点：**每个 CI job 都是独立环境 + 修复一项后必须让全链真正执行**。

- **案例**：fcc161b4 修复 lint/typecheck 后推送，run 31259481235 / 31259481230 显示 lint ✅ typecheck ✅，但 test 阶段暴露两个此前被短路的新问题（见 §二十七 第 5 点）——coverage job 的 prepare 缺失与 nock 固定次数 flaky。
- **启示**：
  - lint/typecheck 全绿 ≠ CI 全绿：test/coverage/build 各自独立 job，每个 job 的依赖准备（prepare/build）必须独立显式；修复上一轮失败点后，**必须等全链（lint → md → links → typecheck → test → build）真正跑完**才算闭环（§二十二 原则的第二次实证）。
  - 本地全量测试 991/991 通过不能覆盖 CI 特有差异（Linux 更快、job 隔离、无本地 .nuxt 残留）——本地模拟（移走 dist、删 .nuxt）能提高置信度，最终以 CI 复跑为准。

## 二十九、e2e 测试基建：Playwright 落地模式与幂等设计（2026-08-10）

> 平台阶段启用 e2e（参考 momei 项目模式），22 用例覆盖全部页面关键功能点。

- **案例**：platform e2e 基建（playwright.config.ts + global-setup + helpers + 22 用例 + CI e2e job，提交 432c59a1）。过程中两次"二次运行必挂"暴露两个不同根因，均为单次运行无法发现的隐性缺陷。
- **启示**：
  - **e2e 用例必须幂等**：同一 SQLite 库二次运行，固定仓库名（如 e2e-owner/e2e-repo）必撞唯一索引；用例用 `Date.now()` 时间戳唯一名，global-setup 注册容忍已存在（200/201/422 均视为成功），"修改显示名"重复填写同值仍成功。
  - **e2e 服务端用构建产物**：`.output/server/index.mjs`（对齐生产形态），独立端口 + 独立库 + 独立 AUTH_SECRET；生产构建 synchronize 默认关闭，e2e 库必须 `DATABASE_SYNCHRONIZE=true` 显式开启。
  - **storageState 复用会话**：global-setup 注册首用户 admin（首个注册自动 admin）并保存认证状态，管理页用例 `test.use({ storageState })` 复用；viewer 权限用例在测试内注册登录。
  - **CI 单 worker 串行**：共享 SQLite 库下并行写会互相干扰；CI `workers: 1` + retry 2 + blob 报告；本地可并行。
  - **vitest 与 playwright 目录隔离**：e2e 文件命名 `*.e2e.test.ts` 会被 vitest 默认扫描（Playwright Test did not expect...），vitest.config `exclude: ['**/tests/e2e/**']` 必须显式排除。
  - **e2e 驱动发现生产缺陷**：二次运行暴露 TypeORM 复合索引 bug（§三十），说明 e2e"重复运行"本身是回归验证手段。

## 三十、TypeORM 1.x 列级复合索引 bug + better-auth 限流/生产细节（2026-08-10）

- **案例**：e2e 二次运行"添加仓库"用例 500（UNIQUE constraint failed: dependfix_repository.platform）——实体声明 `@Index(['owner','name','platform'], { unique: true })` 在列级，实测 SQLite DDL 生成 `UNIQUE ("platform")`（仅末列！），第二个仓库（platform='github'）插入必 500；单仓库场景永不暴露。修复：复合索引移到类级 `@Entity` 上 + organization.test.ts 回归用例（3 仓库共存 + 同 owner/name 冲突），DDL 实证 `UNIQUE ("owner","name","platform")`。
- **启示**：
  - **TypeORM 1.x 列级复合 `@Index([...])` 会错误生成单列索引**（只取末列），复合唯一索引必须声明在类级；同批检查其他实体（scan-run/scan-result/user/credential 均为单列 @Index，无此问题）。
  - **better-auth 1.6.26 内置限流特殊规则优先于 customRules**：sign-in/sign-up 默认 10s/3 次，`/sign-in/*` customRules 不生效；无代理 IP 头时回退共享桶（并行测试必 429）。豁免：`advanced.ipAddress.disableIpTracking: true` 完全跳过限流（e2e 用 E2E_TEST=true 条件注入）。
  - **better-auth 生产模式细节**：Set-Cookie 带 `__Secure-` 前缀（Secure cookie）；无 Origin 头的 Node fetch 请求被拒（MISSING_OR_NULL_ORIGIN）——手动 API 复现需带 origin 头 + 完整 cookie 名。
  - **手动复现纪律**：复现 500 前先清理测试库残留（同库重复创建必 500 干扰归因），server 日志（stderr）是定位第一手证据。

## 三十一、BullMQ 任务队列集成三坑 + 进程内集成测试方法论（2026-08-10）

> T702 任务队列（BullMQ 6 + ioredis 6 + Redis 7.4.1）真实环境验收暴露的三连坑，以及"后台服务冒烟不可靠 → 进程内集成测试"的方案演进。

- **案例**：T702 扫描队列 async 闭环验收。三轮冒烟均表现为"扫描 completed（同步路径）"或挂起，排查链：
  1. **queue/worker 共享 Redis 连接** → worker BLPOP 阻塞 queue 命令，POST /scan 挂起 120s+。修复：BullMQ 要求 Queue 与 Worker 独立连接（官方硬性要求）。
  2. **仅 ping 探测通过但 Redis 3.0 版本过低**（< BullMQ 6 要求 5.0）→ queue.add 挂起不报错。修复：probeRedis 加 `INFO server` 版本解析，< 5.0 判不可用降级 sync（渐进式降级语义）。
  3. **jobId 含冒号**：`scan:{repoId}` 被 BullMQ 6 拒绝（`Custom Id cannot contain :`，冒号是 Redis key 分隔符）→ add 抛错 → failover 自动降级同步 → **表面 completed 掩盖真实错误**。修复：`scan-` 前缀。此坑被 failover 掩盖，最终靠服务日志 `[scan] 入队失败，降级同步执行：Custom Id cannot contain :` 定位。
- **启示**：
  - **BullMQ 6 集成三铁律**：① 自定义 jobId 禁止冒号（Redis key 分隔符）；② Queue/Worker 必须独立 Redis 连接（BLPOP 阻塞）；③ Redis 版本门槛（>= 5.0）必须探测校验（仅 ping 不够——旧版本 add 挂起不报错）。同类依赖的版本门槛先查依赖源码/文档的 minimumVersion 实锤（BullMQ 6.0.9 `minimumVersion = '5.0.0'`）。
  - **failover 会掩盖真实错误**：自动降级（可用性优先）路径必须打 warn 日志且**冒烟验证必须能取到服务日志**——决定性证据来自日志而非猜测/试错循环。
  - **后台常驻服务冒烟在 Windows shell 工具环境不可靠**：`Start-Process` / `cmd start /b` 起的 node 进程脱离会话运行，占用 `.output` 文件锁（后续 build EPERM）、端口、句柄；且反复"起服务→请求→停服务"循环进展慢、易误判。**改用进程内集成测试**（见下）。
  - **进程内集成测试模式（真实基础设施验证首选）**：vitest 直接驱动基础设施（真实 Redis）——`describe.skipIf(!env)` 门控（CI 无 Redis 自动 skip，本地设 env 启用）、随机 id 幂等（`integration-${Date.now()}`，避免残留冲突）、进程内 worker 消费断言（scan-worker 支持 processor 注入，测试传 mock）、连接显式关闭。跑完即退出，无进程管理负担，可重复、可进 CI。**验证顺序修正**：优先进程内集成测试（确定性），后台服务冒烟仅作最后 HTTP 层补验。
  - **pnpm 11 allowBuilds 审批**：新增依赖带构建脚本（msgpackr-extract）时，pnpm-workspace.yaml `allowBuilds` 未审批 → `pnpm install` 报 ERR_PNPM_IGNORED_BUILDS（且 verifyDepsBeforeRun 自动 install 失败会阻断后续命令）——占位值（`set this to true or false`）必须显式赋值。
  - **ESLint 9 flat config 不读 .gitignore**：Playwright 生成物（playwright-report/ / test-results/ / blob-report/）被全量 lint 报海量错误（生成 JS 被当源码）——必须显式 ignores。e2e 运行后立即检查 lint 回归。
  - **Nuxt runtimeConfig 运行时覆盖只认 NUXT_ 前缀**（再印证 §三十 better-auth 案例）：构建期烘焙默认值，启动时无前缀 env（REDIS_URL 等）不生效——部署/验证环境一律 NUXT_ 前缀。

## 三十三、markdown 裸 HTML 标签破坏 VitePress 构建：lint 绿 ≠ docs build 绿（2026-08-10）

> 本条目与 §二十二 / §二十八 的第三次实证：**"检查全绿"只对"已跑过的检查"成立，未覆盖的环节（docs build）照样挂。**

- **案例**：两个 CI run 同时失败——Test workflow（run 31387884319）lint/lint:md/check:links/typecheck/test 全绿，挂最后的 `pnpm run build`（`pnpm -r build` 含 docs 包）；Pages Deploy workflow（run 31387884214）挂 `docs:build`。同一错误：`guide/release.md (368:55): Element is missing end tag.`。根因：`docs/guide/release.md` 263 行"已知限制与排查"表格中 `<path>` 是**裸 HTML 标签**（缺反引号），markdown-it 按 raw HTML 输出（SVG 元素非自闭合），Vue 编译器解析模板时因缺 `</path>` 报错；转换后 HTML 行号 368 > 源文件 268 行——**报错行号是转换产物行号，不能按源文件行号找**。引入 commit：765af514（发布指南重构）。
- **根因**：markdown 表格单元格内的 `<tag>` 若不用反引号包裹，会被 markdown-it 当作 raw HTML 原样透传，VitePress 的 vue 模板编译把任何非自闭合标签视为需要闭合 → 构建即失败。lint-md（`lint:md`）与 check-links 均**不检查 HTML 标签配对**，本地 `docs:build` 未纳入日常检查，问题被 CI 最后一步拦截前无人察觉。
- **修复**：`<path>` 加反引号转义（与同表 262 行 `<pkg>@<version>` 惯例一致）；本地验证（`pnpm --filter dependfix-docs build` 通过 + markdown-it 渲染断言 `&lt;path&gt;` 且 `html.includes('<path>')` = false）后提交（28ba588b + f724a800）。**配套防复发**：test.yml 将 docs 构建从末尾 `pnpm -r build` 中拆出并**前置**到 `check:links` 之后（`pnpm --filter dependfix-docs build`），末尾 build 排除 docs 包（`pnpm -r --filter=!dependfix-docs build`）避免重复构建。
- **启示**：
  - **表格/正文中的 `<占位符>` 必须反引号包裹**：markdown 中反引号内内容才会被转义为 `&lt;...&gt;`；裸 `<tag>` 会被当 raw HTML 透传进 Vue 模板。代码块（fenced code block）内不受影响（审计核实 133-137 行 `<core-anchor>` 等在 ```bash 块内安全），但若未来移出代码块（如改表格）必须补反引号。
  - **CI 全绿 ≠ 交付就绪**：检查矩阵之外仍有真实失败面（docs build 与 Pages 部署）。docs 变更的本地验证必须包含 `docs:build`，不能只跑 `lint:md` + `check:links`；CI 侧把高频失败面前置（docs build 提前），让失败在 1 分钟内暴露而不是等 test/typecheck 跑完。
  - **裸标签排查方法**：`rg '<[a-z][a-z0-9-]*>' | rg -v '`'` 扫描正文/表格裸标签 + 用 vitepress `createMarkdownRenderer` 渲染断言转义结果，是 docs 变更的可复用验证手段。

## 三十四、NUXT_ 前缀 env 的 destr 布尔陷阱 + 轮询聚合写回必须保护既有终态（2026-08-11）

> 批量扫描 e2e 闭环暴露的两个生产级坑，均被"真实执行"而非单测拦截。与 §三十一（NUXT_ 前缀）互为补充：前缀解决了"读不读得到"，本条解决"读到的值形态"。

- **案例一（destr 布尔陷阱）**：playwright webServer 已设 `NUXT_QUEUE_ENABLED=false`，runtimeConfig 也读到 false（服务日志 `queueEnabled=false`），但队列模式仍走 auto → 本地 Redis 可达 → async 入队无 worker 消费 → ScanRun 永远 pending → 批次永久 running。根因：**Nuxt 的 getEnv 用 destr 解析 env 值**（`NUXT_QUEUE_ENABLED=false` → 布尔 `false` 而非字符串 `'false'`），`parseQueueEnabled` 只认字符串三值（`'true'/'false'/'auto'`），布尔 `false` 掉进默认分支返回 `'auto'`——**运行时覆盖"看似生效实则失效"**。修复：解析函数签名改 `string | boolean | undefined`，布尔 `true/false` 显式映射；补布尔形态单测。排查路径：服务日志同时打印 `config.queueEnabled` 与 `process.env.NUXT_QUEUE_ENABLED` 对照（机制层"已生效" vs 解析层"形态不匹配"立刻现形）。
- **案例二（聚合写回覆盖既有终态）**：`executeBatchRun` async 模式全部入队失败时显式落库 `status='failed'`（无下属 run，聚合无法推导），但详情 API 的轮询聚合写回条件只看 `aggregation.status !== stored.status`——聚合只产出 `completed/running`，首次轮询即把 failed 覆盖成 completed（失败批次被展示为成功）。修复：写回决策抽纯函数 `shouldWriteBackStatus(stored, aggregation)`——**仅 running 态允许 status 流转，executor 显式落库的终态（failed）受保护**；对外 status 取"受保护后的有效值"。配套单测覆盖 running 流转 / failed 保护 / completed 幂等三态。
- **启示**：
  - **runtimeConfig 运行时覆盖值形态不可假设**：NUXT_ 前缀 env 经 destr 解析——`true/false` 变布尔、`123` 变 number、JSON 变对象。消费方（parse/校验）必须声明联合类型并逐形态处理，且**布尔形态必须有单测**（字符串测试全绿 ≠ 运行时形态正确）。
  - **轮询/后台收敛逻辑写回状态时必须尊重显式终态**：凡"推导值"（聚合、心跳、探活）写回"权威值"（executor/worker 显式落库），必须定义写回判定函数（何时允许覆盖），否则推导模型覆盖不了的状态（failed 兜底、人工置终态）会被推导值"修复"成错误终态。判定函数进领域模块 + 单测，比散落在 API 层更易审计。
  - **e2e"真实执行"是运行时形态类 bug 的最后防线**：单测 mock 的是字符串形态（构建期烘焙），运行时 destr 转换只在实际 server 进程 + 真实 env 注入下出现——e2e 必须跑真实 env 注入（NUXT_ 前缀）而不是只靠构建烘焙默认值。

## 三十五、新增 workspace 运行时依赖包必须同步所有构建链入口（2026-08-11）

> 教训形态：**"漏同步"**——新增包 + 既有入口清单未更新，CI/生产首跑才暴露。与 §二十六（依赖版本更新触发端到端验证）同族。

- **案例**：Security Auto Fix workflow（`uses: ./` 复合 action）首跑失败——`ERR_MODULE_NOT_FOUND: Cannot find module '@dependfix/engine/dist/index.mjs' imported from packages/cli/dist/runner.mjs`。根因：cli 运行时依赖 `@dependfix/engine`（tsdown external 不打包，产物 import dist），但 action.yml 构建命令只选 `--filter dependfix --filter @dependfix/core`——engine 包在后续任务中加入后，action 构建链未同步（test.yml 的显式 `core && engine && cli` 链和 apps/platform/Dockerfile 均已含 engine，action.yml 是唯一漏网入口）。tsdown 构建本身成功（external 不校验），失败发生在**构建后立即执行的 smoke check**（`node dist/bin.mjs --help`）——bin 加载即解析 engine dist。
- **修复**：构建命令补齐 `--filter @dependfix/engine`；本地模拟 CI 干净环境（删 engine dist）复跑修复后命令 → Scope 3 of 8、三包构建成功、smoke check 通过。
- **启示**：
  - **新增 workspace 运行时依赖（被 import 的包）后，必须全局搜索并同步所有"显式构建链"入口**：`rg -n "filter.*build|--filter" .github action.yml Dockerfile* package.json`——pnpm install 会按拓扑链接，但 `pnpm --filter X build` 不会自动带依赖构建（test.yml 注释已明示这一点，action.yml 是同类清单里的漏网者）。
  - **tsdown external 依赖的构建缺口要到"运行期加载"才暴露**：lint/typecheck/build 全绿不代表可运行——复合 action 的 smoke check（构建后立即执行 bin --help）是拦截此类问题的关键关卡，应保留。
  - **"新增包"的提交必须连带检查清单**：CI 构建链（test.yml）、部署构建链（Dockerfile）、action 构建链（action.yml）、release 构建链——四者各自维护 filter 清单时容易不同步；至少让新增运行时依赖包出现时逐个核对。

## 三十六、CI 双 run 失败：锚点漂移 + dependfix 验证链缺 nuxt prepare（2026-08-12）

> 两个独立 run 同日失败，各暴露一类"检查通过 ≠ 可运行"的缺口：check:links 的锚点校验规则与文档实际改动不同步；dependfix 默认验证链对 Nuxt 消费仓库不成立且失败信息不可见。

- **案例一（Test run 31518301846）**：`check:links` 失败——`docs/design/governance/architecture.md:369` 锚点 `#t708-国际化-i18n` 指向 `../../plan/backlog.md`，但 T708 已从 backlog 上收为 todo.md 当前任务（backlog.md 无此标题）。修复：锚点改指向 `todo.md#t708-国际化-i18n全平台-ui-双语-zh-cn--en-us`（本地 check:links 15 个 md 全部通过后提交）。
- **案例二（Security Auto Fix run 31552922137）**：dependfix 验证门失败（`pnpm lint` exit 1，60s）→ 回滚 → 整体 exit 2。根因链：eslint.config.js 对 `apps/platform/nuxt.config.ts` 的类型解析使用 `project: ['./apps/platform/.nuxt/tsconfig.json']`（nuxt prepare 生成物）→ dependfix 默认验证链（install + lint + build）无 prepare 步骤 → CI 上 `.nuxt` 缺失 → `Parsing error: TS5012`。本地移走 `.nuxt` 精确复现（1 error）。同日 Test workflow lint 通过是因为 test.yml 有独立 `nuxt prepare` 步骤（§二十七 已登记同款教训），而 Security Auto Fix 的 action 内验证链没有。
- **修复**：① action.yml 新增 `commands` 输入透传 CLI `--commands`（CLI 早已支持自定义验证链，action 未暴露是接口缺口）；② security-auto-fix.yml 默认验证链改为 `pnpm install --frozen-lockfile, pnpm --filter @dependfix/platform exec nuxt prepare, pnpm lint, pnpm build`；③ verifyProject 失败时附 stdout/stderr 摘要（`formatVerificationError`：`exit code N — 摘要`，超长 head/tail 截断）并 logger.error，解决"报告只有 exit code 1 无法定位"的可观测性缺陷。
- **启示**：
  - **锚点指向"当前状态"而非"历史位置"**：任务从 backlog 上收/归档时，引用其锚点的文档必须同步（check:links 校验的是 looseNorm 后的标题存在性，只认当前文件标题）。
  - **CI 每个 job 的验证链要与该 job 的实际执行环境自洽**：dependfix 这类"修完即验"的工具，默认验证链对 Nuxt/VitePress 等需要 prepare/生成物的项目不成立——要么暴露自定义验证命令（action `commands` 输入），要么在默认链中探测 prepare 需求。
  - **验证失败必须携带可定位证据**：验证门只报 `exit code 1` 时，用户无法区分"lint 语法错误 / 缺生成物 / 环境问题"——失败 action 附 stdout/stderr 摘要（脱敏后）是验证门的基本可观测性要求。
  - **工具"吃自己狗粮"的价值**：dependfix 扫描自身仓库即暴露 action 接口缺口（commands 未透传）与验证链盲区，dogfooding 是产品缺陷的第一发现者。

## 三十七、CI git tag 需要显式 committer identity + 发布流程必须可重入自愈（2026-08-12）

> 教训形态：**"环境前提缺失" + "中间态被 skip 逻辑吞掉"**。与 §二十六（tag 创建与推送分离）同属发布链路 CI 教训族。

- **案例（Release run 31561400025，workflow_dispatch 手动发布 0.2.1）**：`pnpm release:publish` 已成功把 `@dependfix/core@0.2.1` 发布到 npm（OIDC），随后 `git tag -a` 失败——`Committer identity unknown`。根因：git identity 配置只存在于 `scripts/auto-version.mjs`（release.yml 的 "Auto version & changelog" 步骤，schedule-only），手动触发时该步骤被跳过，runner 全局 git config 无 user.name/user.email，annotated tag 创建必然失败。连带后果：tag 未创建 → 重跑 CI 时 core@0.2.1 命中 `skip-published` 被跳过 → `<pkg>@<version>` tag、`v<锚版本>` 聚合 tag、GitHub Release 全部永久缺失（原设计只能靠手动 `pnpm tag:released` 恢复）。
- **修复**：① `release.yml` 在 Release Publish 步骤前显式配置 git identity（`github-actions[bot]` / `41898282+github-actions[bot]@users.noreply.github.com`，与 auto-version.mjs 同款，手动/定时触发均生效）；② `release-publish.mjs` 新增幂等自愈：`skip-published` 分支在"npm 已发布但本地无 tag"且 HEAD 锚点校验（HEAD touch 包路径）通过时自动补 annotated tag，并把该包计入 v tag 锚点解析——重跑 CI 全链路恢复（补 tag → v tag → GitHub Release），锚点校验失败则安全跳过（保持 skip 语义）；③ `changelog.mjs` 防重复增强：发布中断遗留的"版本低于当前版本、无 tag、npm 未发布"残留段会在下次版本提升后与新段内容重复（两段覆盖相同 commit 范围），生成时自动清理（`cleanupUnreleasedSections`，fetch 三态保守判定：tag 存在 / npm 已发布 / 查询失败均保留，仅确认未发布才删除；单测 + 注入残留段真实回归验证）。
- **启示**：
  - **CI 脚本依赖 git 写操作（commit/tag）时，identity 必须由 workflow 显式配置**——不能依赖"某个条件步骤顺带配置"（schedule-only 步骤在手动触发时被跳过即中招）；github-actions[bot] 身份是标准选择。
  - **发布/打 tag 是连续副作用，必须可重入**："发布成功、tag 失败"的中间态一旦被 skip 判定吞掉，就变成永久缺口；检测中间态并补完（幂等自愈）优先于"失败后手动补"，重跑即恢复是发布工具的基本要求。

## 三十八、PowerShell 文本管道按 GBK 解码损坏 UTF-8 + tsconfig exclude 掩盖测试类型错误（2026-08-12，T710 归档转接）

> 来源：T710 CI lint 警告清理（10 → 0）附带经验，归档 M7.2 时从 todo.md 转接沉淀。

- **经验一：git show | Set-Content 文本管道按 GBK 解码会损坏 UTF-8（写入侧）**——Windows PowerShell 文本管道默认按系统代码页（GBK）解码，`git show <hash> | Set-Content file` 会把 UTF-8 内容读成乱码再写回。**正确做法**：用 cmd 重定向字节安全导出（`cmd /c "git show <hash> > file"`）或直接 `git show <hash> -o file`（git 原生写文件）。
- **经验二：tsconfig exclude `*.test.ts` 会掩盖测试文件类型错误**——被 exclude 的测试文件不参与 `tsc --noEmit`，其中类型错误（缺失字段/来源错误）静默通过；test-helpers 提取（T710 批次 4）暴露该问题后，已修正来源与缺失字段。**教训**：测试文件必须纳入类型检查范围（可用 `tsconfig.test.json` 单独包含，或依赖 vitest 的转换期类型校验），禁止用 exclude 排除测试文件。

## 三十九、CI 双 run 同时失败：裸标签坑二次复现 + scripts 入口守卫缺失（2026-08-13）

> 教训形态：**"登记 ≠ 防御"**——§三十三 裸标签教训已入档但未落规范/未挂检查点，同坑二次复现；同时暴露 scripts 新增脚本未对齐既有 main 守卫模式。

- **案例**：两个独立 CI run 同日同时失败（run 31657996992 Publish Docker / run 31657996981 VitePress Pages）：
  - **失败一（docs build）**：`experience-archive.md (518:266): Element is missing end tag.`。根因：T710 归档转接新增的 §三十八 条目（406-407 行）含**裸 `<hash>` 标签**（`git show <hash> | Set-Content file` 等三处，缺反引号）+ `**...*.test.ts...**` 加粗内的裸 `*`（破坏强调解析，转换产物 516 行出现 `<em>` 嵌套错乱）——与 §三十三（release.md 的 `<path>`）**完全同款**。518 行号是转换产物行号（§三十三 已登记：不能按源文件行号找）。
  - **失败二（QA test）**：`scripts/distill-wisdom.test.mjs` 报 `process.exit unexpectedly called with "1"`（distill-wisdom.mjs:295）→ Unhandled Rejection。根因：distill-wisdom.mjs 是 scripts/ 下**唯一没有 main 入口守卫**的脚本（其余 8 个均有 `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href` 守卫）。CI 环境 `.session/wisdom.md` 不存在（git 忽略）→ vitest import 模块时 main() 无条件执行 → ENOENT 分支 `process.exit(0)` 被 vitest 拦截 → catch 再 `process.exit(1)` → Unhandled Rejection。**本地因 wisdom.md 存在而侥幸通过**。
- **根因**：
  - 裸标签教训在 §三十三 只有"启示"段落（含排查命令与修复先例），**没有同步为 documentation.md 规范条款、没有挂 A 阶段必查项**——登记入档后无强制检查点，第二次复现是必然。与 §十六"规范存在 ≠ 被执行"同源：规范/教训要生效必须挂接 D 阶段自检或 A 阶段必查项。
  - 新增 scripts 脚本（distill-wisdom 为 Session Wisdom 蒸馏机制配套脚本）时未做"同类脚本模式对齐"检查——8 个既有脚本的守卫形态已经稳定，新脚本复制时漏掉入口守卫。
  - 测试依赖 git 忽略的工作区文件（.session/）存在性：本地有、CI 无 → 行为分叉，再次印证"本地通过 ≠ CI 通过"（§二十七/§二十八 同族）。
- **修复**：
  - §三十八 两行全部命令/占位符补反引号（`<hash>`、`*.test.ts`、`tsc --noEmit`、`tsconfig.test.json`），与 §三十三 `<path>` 先例一致；
  - distill-wisdom.mjs 补与其余 8 脚本逐字一致的 main 守卫（import pathToFileURL + 包裹 main().catch()）。
  - 验证闭环：`pnpm --filter dependfix-docs build` 修复前复现 518:266、修复后 23.18s 通过；模拟 CI（移走 wisdom.md）跑 distill-wisdom 测试修复前必挂、修复后 18 passed；lint/typecheck 全绿；Code Auditor quick Pass。
- **启示**：
  - **教训入档 ≠ 防御生效**：同一模式第二次复现（裸标签）后，必须把教训落成"可执行检查点"（规范条款 + A 阶段必查项），否则归档只是故事。检查点形态见 [documentation.md §2 裸 HTML 标签禁令](../../standards/documentation.md) 与 code-auditor 必查项。
  - **新增 scripts/*.mjs 必须对齐既有 main 守卫模式**：`process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href` 包裹 main()——vitest 单测 import 模块时不执行入口副作用；新脚本复制旧脚本骨架时守卫是最容易被漏掉的一行。
  - **测试不得依赖 git 忽略工作区文件的存在性**：.session/ 下的文件本地存在、CI 不存在，依赖它的测试必须模拟缺失场景（移走文件）验证，或把依赖注入为参数。

## 四十、PowerShell 批量替换三连坑 + 审计字节级扫描价值 + 容器实证三层发现（2026-08-14，M8 安全治理）

> 教训形态：**批量/脚本化编辑误伤族第三次复现（§十七 2026-08-07 JS 正则宽泛 → §二十一 2026-08-08 PowerShell 内联 node -e → §四十 2026-08-14 PowerShell 批量替换）**——其中两次与 PowerShell 转义体系直接相关，本次正式落成规范禁令：**非必要不使用 PowerShell 执行批量替换，优先 JS 脚本**。同时记录"验证工具不覆盖内容语义"与"文档宣称 ≠ 真实运行"两类发现。

### 案例一：PowerShell 批量替换三连坑（同一次 session 内三次踩坑）

- **坑 1（-replace 替换文本转义陷阱）**：`-replace 'pattern\r?\n', '替换文本\r?\n'` ——PowerShell 的 `-replace` **替换文本不做转义解释**（`\r?\n` 按字面量写入）。执行后 backlog.md C40-C45 六处状态行被写入字面 `\r?\n` 文本，列表结构损坏。**lint:md / check:links / docs:build 全部通过**（这些工具不检查文本内容语义），只有审计的字节级扫描（Node 正则匹配"反斜杠 r 反斜杠问号 反斜杠 n"字面序列）抓到。
- **坑 2（单引号字符串字面语义）**：`'...反引号+n...'` ——PowerShell 单引号字符串**完全字面**（"反引号+n"字面序列不会解释为换行），写入字面反引号+n。
- **坑 3（String.Replace 全局替换误伤既有内容，最严重）**：为修复坑 1/2 执行 `$raw.Replace('反引号+n', ...)`——把文件中**所有"反引号+n"字符序列**替换为换行。既有内容中被误伤：`npm_config_registry`（C35 条目，行内代码前的反引号+n 被拆成换行 + "pm_config_registry"）、`nuxt.config.ts`（C29 条目）等——**大范围内容损坏**，且损坏表面"可读"（换行破坏语义）。
- **同族小坑**：`$_ -split ':'` 在 Windows 盘符（`D:` 后接路径）下拆出孤立 'D'；`Select-String -Recurse` 参数名错误；终端 GBK 乱码显示 ≠ 文件损坏（§二十七 已记录）。
- **根因**：PowerShell 的转义体系（反引号）、字符串字面语义（单引号完全字面）、`-replace` 替换文本特殊语义（无转义解释、`$` 引用）与 Node/JS 的正则-字符串模型差异巨大；批量文件内容操作叠加编码/换行处理（GBK 管道 §三十八）后误伤概率显著高于 JS 脚本。
- **修复路径（安全恢复）**：`git checkout -- <file>` 恢复 HEAD 版本（本次恢复的 HEAD 是已提交的干净版本）→ 用**精确 edit 工具**（字符串级替换）重新应用目标修改 → `git diff --stat` 核对 diff 收敛到预期行数 → Node 字节抽查关键内容完整性（如 `npm_config_registry` 存在性）。
- **启示**：
  - **文件内容批量修改（替换/插入/行尾转换）一律优先 JS 脚本**（`node -e` 单行或写临时 .cjs，读取→处理→写回全在 Node 语义内），PowerShell 只承担命令执行（git/docker/pnpm 等工具调用）。**非必要不使用 PowerShell 执行批量替换**。
  - **批量文本操作后必须内容级验证**：lint/check:links/docs:build 均不检测文本语义——必须 Node 字节抽查（字面量残留扫描 + 关键内容存在性）+ `git diff` 审查（既有内容是否被意外改动，diff 应只含预期行）。
  - **审计的字节级扫描是最后防线**：本次字面量 `\r?\n` 损坏由 Review Gate 的 Node 逐文件扫描抓到（验证矩阵三项全绿但内容已损坏），已挂 code-auditor 必查项（见治理记录）。

### 案例二：文档宣称 ≠ 真实运行：容器执行链路三层缺失（T801 实证）

- **案例**：executor-sandbox.md 声称"平台镜像内置 git/node/pnpm 工具链"，实际 runtime 镜像从未安装 git/pnpm（已发布镜像实证 `git/pnpm/corepack` 全部 MISSING）；进一步实证发现 cli/engine/core 的 workspace node_modules 也从未打包进镜像（`ERR_MODULE_NOT_FOUND`）——**ContainerExecutor 容器内执行链路从未真实可用**。T801 补齐后实证又暴露第三层：pnpm-audit legacy `patched_versions` range 前缀导致 `compareSemver` 解析退化 `[0,0,0]`，告警被假跳过（漏洞不修）。
- **根因**：M6 交付以单测 + 本地 dev 验证为主，"容器内真实跑一次 fix"从未发生——文档（"平台镜像内置工具链"）写的是设计意图而非实现事实；ContainerExecutor 的集成测试 mock 了子进程，掩盖了真实环境缺失。
- **修复**：git（apk）+ pnpm 11.18.0（构建链镜像零网络拷贝）+ node_modules 打包（pnpm 符号链接 + 根 .pnpm store，COPY 保留链接）+ engine range 剥离修复（4 测试）。容器内全链路实证：report-only → fix（minimist 0.0.8→0.2.4）→ fix --commit → 报告产物。
- **启示**：
  - **宣称的能力必须有真实运行实证**：容器/部署/集成类能力，验收必须包含"在真实目标环境执行一次完整链路"，单测 mock 会掩盖环境缺失（与 §三十一"真实基础设施验证"同族）。
  - **版本解析函数对 range/前缀输入必须防御**：`compareSemver` 对 `>=x.y.z` 静默退化为 `[0,0,0]`——解析失败应显式失败或归一化，不能静默"已达标"（安全相关路径尤其危险：假跳过 = 漏洞不修）。
  - **实证驱动的发现是排期任务的最大增量价值**：T801 名义是"装两个工具"，实证带出 node_modules 打包 + range bug 两个深层问题（C45 登记时均未预见）。
