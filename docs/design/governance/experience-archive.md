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

## 四十一、cgroup 集成测试需"可写探测"门控 + test 文件超 lint:max-lines 必须按被测域拆分（2026-08-20，CI run 32331677198 修复）

> 教训形态：**集成测试环境探测不充分 + 测试文件无主动拆分机制**——两个独立预存隐患被一次 refactor 触发的 CI 重跑同时暴露。

- **案例**：commit `65ee5fc refactor(scripts): 迁移调用方到 check-docs` 只动 `scripts/`、`*.workflow`、规范引用（功能与 CI 配置迁移），自身验证矩阵全过（`pnpm vitest run: 132 files / 1899 tests`）。push master 后 CI run 32331677198 同时报两个独立失败：
  - **失败一（cgroup 集成测试）**：`packages/engine/src/runners/cgroup.test.ts` 第 480 行（修复前；修复后因探针函数插入已偏移至 516 行）断言 `expect(handle.applied).toBe(true)` 失败。根因：`describe.skipIf(!realCgroupV2)` 只检查标记文件 `cgroup.controllers` 存在——GitHub-hosted runner 的 ubuntu-latest 默认用户**有 v2 标记但无 cgroup 写权限**，于是测试进入 describe 块，`applyCgroupLimits` 返回 `{ applied: false, reason: 'permission_denied' }`，断言硬挂（`expected false to be true`）。
  - **失败二（lint:max-lines）**：`packages/engine/src/app/helpers.test.ts` 1031 行超 ESLint `max-lines: 1000`（测试文件专属阈值，生产代码 800/函数 500/测试函数 800）。`pnpm run lint` 直接 exit 1，整 CI 红。
  - **失败三（coverage 级联）**：coverage job 跑同一份 vitest 套件，因失败一同样挂。
- **关键观察**：commit `65ee5fc` 未触碰 `cgroup.test.ts` 与 `helpers.test.ts`——两个都是**预存隐患**。cgroup 集成测试自 PR #241 引入时就在 CI 端挂（只是此前 commit 没触发 master 上的 test.yml），`helpers.test.ts` 早已超 1000 行（积累到 14 个被测域：mergeAiUsage / computeExitCode / buildCommitMessage / buildPrTitle / pullRequestCreationHint / dependabotAlertsTokenHint / codeScanningAlertsTokenHint / autoCleanupMergedBranches / closeSupersededPRs / tryLockfileRepair / resolveAlertRepositories / hasMultipleMajorVersions / buildVersionedOverrides / verifyProject）。本次 refactor 触发 master CI 重跑，两个旧账被一并清算。
- **修复**：
  - **Fix A — cgroup 集成测试可写探测**：`cgroup.test.ts` 加 `isCgroupV2Writable()` 辅助函数（先 `isCgroupV2()` 检查标记，再 mkdir/rm 探针 slice，捕获 EACCES/EPERM 静默返回 false，加 `finally` 兜底二次清理避免空目录残留），`describe.skipIf(!realCgroupV2Writable)`。自托管 runner（含本地 WSL2 v2 + 提权）继续跑真实集成测试，CI runner 优雅 skip。本地 `pnpm vitest run packages/engine/src/runners/cgroup.test.ts` 验证：36 passed + 1 skipped（原 36 + 1 之前硬挂的现在 skip）。
  - **Fix B — helpers.test.ts 按被测域拆分**：1031 行 → 9 个 `<domain>.test.ts`（最大 183 行），按"被测函数域"而非"被测文件"为拆分单位：
    - `merge-ai-usage.test.ts`（46）、`exit-code.test.ts`（172）、`commit-message.test.ts`（129，含 buildCommitMessage + buildPrTitle）、`token-hints.test.ts`（108，含 pullRequestCreationHint + dependabotAlertsTokenHint + codeScanningAlertsTokenHint 三个 hint 函数）、`branch-cleanup.test.ts`（145，含 prCreatorMock）、`lockfile-repair.test.ts`（75，含 pnpmFixerMock）、`resolve-repositories.test.ts`（64，含 configMock）、`versioned-overrides.test.ts`（183）、`verify-project.test.ts`（106，含 verificationRunnerMock）。
    - mocks 按需下沉到各文件（prCreatorMock 只去 branch-cleanup、configMock 只去 resolve-repositories、pnpmFixerMock 只去 lockfile-repair、verificationRunnerMock 只去 verify-project），避免全局共享导致误伤。原文件删除。
    - 验证：`pnpm --filter @dependfix/engine run lint` 0 error、`typecheck` 0 error、`vitest run` 48 files / 898 passed + 1 skipped（cgroup 集成测试 skip，其他全过），总测试数与拆分前一致。
- **启示**：
  - **CI 集成测试的"环境探测"必须落到"能跑通动作"而非"满足前提条件"**：cgroup v2 标记存在 ≠ 可写（GitHub-hosted runner 默认用户只读）、`/sys/fs/cgroup` 存在 ≠ 容器内可操作（cgroup namespace 限制）、`/proc/<pid>` 可读 ≠ 可 attach debugger。门控函数统一规范：`is<X>Runnable()` 双层探针（前提 + 最小副作用动作），失败静默 false → describe.skipIf 优雅跳过，避免在受限环境硬挂。教训登记对象：所有 describe.skipIf / test.skip 都应自审是否探测到了"能跑"而非"有资源"。**挂接治理检查点**：本次入档需挂 code-auditor 必查项 + lint 规则（新增 describe.skipIf 必须配 `is<X>Writable` 探针，禁止纯标记探测），否则下次同类硬挂仍会复现——印证 §三十九"教训入档 ≠ 防御生效"。
  - **测试文件超 lint:max-lines 必须按"被测域"主动拆分**：`max-lines` 是软门禁，超过时不应"扩容阈值"（生产代码 800 是设计意图，测试 1000 是合理上限），应按被测函数域拆分。规则：每个拆出文件对应一个或一组"被测函数域"（业务内聚而非机械切分），mocks 按需下沉避免跨文件依赖，imports 收敛到 `from '../<feature>'` 或 `from './<feature>'`。`helpers.test.ts` 类"中心化测试文件"是拆分高发地——多个 helpers 函数汇聚到一个 super-test 是历史债务，函数域分片化是更可持续的模式。**挂接治理检查点**：建议在 engine 包 vitest 配置加 pre-commit 自检（`find packages -name "*.test.ts" -size +40k` 报警），把"测试文件膨胀"转成主动信号。
  - **refactor 触发的 master CI 重跑会同时暴露多个无关预存隐患**：本次 commit 自身验证全过，但 push master 后 CI 暴露了 refactor 范围之外的两类问题。这印证 §二十二"CI 链式暴露"和 §二十八"CI 修复是剥洋葱"——任何 push master 的 refactor 都必须**显式声明已跑全量 lint/test 验证矩阵**（不仅是改动点），并对覆盖的"全链路"做断言（lint 绿 → typecheck 全绿 → vitest 全绿 → coverage 一绿）。本次 commit message 写了 `pnpm vitest run: 132 files / 1899 tests` 是全量验证，但 `pnpm run lint` 在 refactor commit 里**未明确列出**，导致 lint:max-lines 失败只在 CI 端暴露——验证矩阵描述应包含每个质量门（lint / typecheck / test / build），缺一项就可能漏检。**强化守则**：refactor / fix 类 commit message 的"验证矩阵"段落必须**逐条列出每个质量门的实际命令与结果**（`pnpm run lint` 0 error / `pnpm run typecheck` 0 error / `pnpm vitest run X files / Y passed`），禁止用"全过"等笼统描述。
  - **跨包级 lint 失败定位修复**：CI 报 `File has too many lines (1031). Maximum allowed is 1000` 时，先 `wc -l` + `git log --oneline <file>` 确认历史长度变化（确认是渐进积累 vs 一次性大改动），再决定拆分粒度。本次 14 个被测域 → 9 个文件是经验阈值：单文件 < 200 行（含 mock/header）能保证未来 6-12 个月仍有扩展余量，又避免过度碎片化（> 15 个 test 文件会显著增加 `pnpm vitest run` 启动开销）。

## 四十二、Coverage 阈值对 refactor 顺序敏感：纯 rename commit 可触发无关覆盖债务清算（2026-08-27，CI run #33068271005 修复）

> 教训形态：**覆盖率阈值的"挂账累积 + 一次性清算"**——M16.1 / M16.2 期间引入的新文件与改造既有文件覆盖不充分（部分新文件无对应测试），单次 feature commit 的覆盖下降被后续 commit 的测试增量抵消一部分但未完全恢复，整体 branches 从 80.30% 缓慢滑向 79.79%；M16.2 末尾的纯 rename refactor（commit `acfdc8d8`，组件 PascalCase → kebab-case，零源码逻辑变更）不产生新测试也不消耗覆盖，但作为 push master 的触发器暴露了此前累计的覆盖缺口。

- **案例**：CI run #33068271005（master, run #471，commit `acfdc8d8 refactor(platform): 组件命名统一改为小写连字符风格`）失败于 Coverage job 的 `pnpm run test:coverage` 步骤：
  - 错误：`ERROR: Coverage for branches (79.93%) does not meet global threshold (80%)` —— 全量 2268 tests passed + 5 skipped，lint/typecheck/build/e2e 全部 ✅，唯独 coverage 阈值门禁挂。
  - 失败诊断：`acfdc8d8` commit 自身未修改任何 `.ts` 源码（仅 6 个 `.vue` 文件 git mv + 模板标签 case 改写 + 注释引用更新），按"最小改动 + 零逻辑变更"原则不应改变分支覆盖率。**真凶**是 M16.1 + M16.2 阶段（commit `8c3ee84 → acfdc8d8` 11 个 commit）累积引入的新增/改造源文件覆盖不足：
    - `apps/platform/app/utils/alerts-view.ts`（M16.2 新增 +67 行）→ **0%** 覆盖（同目录其他 util 全部有 `.test.ts`，本文件遗漏）
    - `apps/platform/server/api/scan-history/summary.get.ts`（M16.1 新增 +208 行）→ 72.72% branches（safeParseSummary 防御分支 + aggregateByRepository 孤儿 run + lastRunAt 替换路径未覆盖）
    - `apps/platform/server/api/runs/index.get.ts`（M16.1 organizationId 隔离改造 +12 行）→ 75% branches（toView 防御序列化 + ids query 边界）
    - `apps/platform/server/api/repos/[id]/scan.post.ts`（M16.2 reuseScanRunId 改造 +44 行）→ 90.62% branches（终态冲突 409 分支 + 缺 id 400 分支）
  - 上次成功覆盖 run（#32998951372, commit `8c3ee84`）branches 80.30%，本次 79.79% —— 11 个 M16 commit 累计 -0.51%，刚好跌破 80% 阈值。
- **修复**：单次提交 5 个文件 / +415 行测试（不含 untracked `alerts-view.test.ts`），覆盖 M16 新代码的未触达防御分支：
  - 新增 `apps/platform/app/utils/alerts-view.test.ts`（108 行 / 18 测试 / 4 switch 函数全分支 → 文件覆盖 100%）
  - `summary.get.test.ts` +6 测试：safeParseSummary 防御（null / 非对象 JSON / 非法 JSON）+ aggregateByRepository 孤儿 run（PRAGMA FK OFF 制造孤儿）+ lastRunAt 替换（new→old / old→new 双向）+ readNumber 非有限数字（null / 字符串 / 对象 / 数组）
  - `runs/index.get.test.ts` +4 测试：toView 孤儿 run（PRAGMA FK OFF）/ summaryJson=null / errorJson 非空 / ids query 仅含逗号
  - `scan.post.test.ts` +2 测试：缺 id → 400 / queue.add 抛"已处于终态" → 409
  - `verification-gate.test.ts` +6 测试：enforceVerificationGate 主函数（行 47/52/61/64/71/74 branches）
  - 修复后本地三连跑 branches 80.27% / statements 84.91% / lines 85.01%（buffer +0.27% ≈ 16 branches），lint 0 error / typecheck 0 error / vitest 2305 passed + 5 skipped（159 files）。**M16 加权覆盖率达 98.9% statements / 88.8% branches**（远超整体均值，证明修复聚焦于 M16 引入的覆盖缺口而非广撒网）。
- **启示**：
  - **覆盖率阈值对"commit 顺序"敏感**：refactor 类的零逻辑变更 commit 也会触发全量 CI 重跑（包括 coverage job），因此 refactor commit 实际承担了"清算此前累计覆盖债务"的功能。**守则**：(1) 禁止把"refactor + feature"合并提交——refactor 必须独立、纯改名/纯结构调整，feature 单独提交带测试。(2) 阶段性 feature merge 后（每个 M 阶段收口时）**主动跑一次 `pnpm run test:coverage`** 验证阈值未越线，不要等下次 refactor 才暴露；建议在 `vitest.config.ts` 注释里加"阶段性阈值体检"提醒（或在 release pipeline 加 coverage drift check）。
  - **新文件必须有配套测试是硬纪律**：M16.2 抽出 `alerts-view.ts` 工具函数时仅按"单调用方 utility 由 audit suggest 触发（避免过早抽象）"的设计意图抽出，**未同步补 `.test.ts`**（同目录其他 util 全部有测试，本文件成为唯一例外）。`vitest.config.ts` 的 include 模式包含所有 `apps/platform/app/utils/*.ts`，所以覆盖率数据会即时反映——"未配测试 = 0%"是机械规则，不是设计意图。**挂接治理检查点**：建议在 apps/platform 加 lint 自检（`find apps/platform/app/utils -name "*.ts" ! -name "*.test.ts" | while read f; do test -f "${f%.ts}.test.ts" || echo "MISSING TEST: $f"; done`）或 vitest 配置 `coverage.includeAfter` 显式排除未测文件（让 0% 文件显眼化）。教训登记对象：所有 `apps/platform/app/utils/`、`apps/platform/server/utils/`、`packages/cli/src/skills/` 等"工具/服务/技能"目录新增文件。
  - **阈值守门不是"恢复 80%"就结束**：当前 80.27% 的 buffer（+0.27% / ~16 branches）极薄——任何新代码或测试执行抖动都可能再次跌破 80%（本次也是）。需要分批推到 ~81%（buffer +0.7%）才能有效避免反复触发，但**不建议**一次性跳到 82%（触及 executor/runtime-adapter 等复杂模块，flakiness 风险与工作量不成正比）。渐进阈值（80% → 81% → 82%）配合"阶段性体检"才能形成正循环，而非"跌破 → 紧急修复 → 再跌破"的被动循环。
  - **commit message 验证矩阵要含 coverage**：本次修复 commit 描述应明确列出 `pnpm run test:coverage` 的 branches/statements/lines/functions 四项百分比 + 与阈值的 buffer，避免后续读者误判"仅补测试"→ 实际还顺带做了一次完整 CI 验证矩阵。印证 §四十一末条"refactor / fix 类 commit message 的验证矩阵段落必须逐条列出每个质量门"——本条扩展到"coverage 也要列入"，且需明确 buffer 数字（如 `branches 80.27% (+0.27% / ~16 branches buffer)`）。
  - **教训入档触发条件确认**：本案例符合准入标准第 4 条"工具/环境陷阱（CI/coverage 阈值对 commit 顺序敏感）"，且与 §四十一 / §二十二 / §二十八"refactor 触发 CI 链式暴露"形成连续案例链——证明此模式 ≥ 3 次复现，**挂接治理检查点**：(a) 阶段性 coverage drift check（release pipeline / todo 阶段收口 checklist）；(b) apps/platform/app/utils 等"工具目录"新增文件必须配测试（lint 自检或 coverage 显眼化）；(c) refactor commit 验证矩阵强制含 coverage buffer 数字。

## 四十三、集成外部库必须读 README 标准用法 + e2e 真实路径冒烟测试（2026-08-29，M18.4 audit round 1 Reject 后补修）

### 案例

M18.1 commit 4（`adf370a feat(engine): AppAuthProvider + InstallationTokenCache 完整实施 + 单测补强`）实施 `AppAuthProvider.getOctokit()` 时，按直觉写：

```ts
new Octokit({
    auth: createAppAuth({ appId, privateKey, installationId }),  // ← 错误：auth 字段仅接受字符串 token
    baseUrl: 'https://api.github.com',
})
```

实际 `@octokit/auth-app@8.3.0` README 标准用法是：

```ts
new Octokit({
    authStrategy: createAppAuth,  // 函数本体（未调用）
    auth: { appId, privateKey, installationId },  // 配置对象
})
```

**真实路径测试结果**（M18.4 e2e 实施时）：
- 修复前（`auth: createAppAuth(...)`）：`@octokit/core` 走 `createTokenAuth(options.auth)` 路径 → 抛 `Token passed to createTokenAuth is not a string`
- round 1 修复（`authStrategy: createAppAuth(...)` —— 仍然错误，把 `createAppAuth` 调用结果当作策略传）：`@octokit/core` 走 authStrategy 路径调用 strategy 时 `authOptions.type = undefined`，命中 `default` 分支抛 `Invalid auth type: undefined`
- round 2 修复（`authStrategy: createAppAuth, auth: {...}` —— README 标准）：✅ 真实 JWT signing + installation token 注入 + API 调用全链路通过

**为什么此前所有测试都通过**：
- `app-provider.test.ts` 用 `vi.mock('@octokit/rest')` + `FakeOctokit`——**完全跳过 `@octokit/core` 真实构造路径**
- `app-provider.test.ts` 的 `createAppAuthMock.mockReturnValue({})`——**mock 的 `authCallable` 同步返回空对象，绕开真实 `auth(state, authOptions)` 异步拒绝分支**
- **mock 测试如果不能对齐真实行为，反而会掩盖 bug**

### 教训

1. **集成外部库前必须读 README 标准用法 + 真实路径冒烟**：凭直觉或训练数据写法可能错，README 是最权威的真实契约。`@octokit/auth-app` README §installation authentication 明确给出 `authStrategy: createAppAuth, auth: {...}` 双字段组合——这是契约基线，不是建议。
2. **mock 测试如果不能对齐真实行为，反而会掩盖 bug**：`vi.mock('@octokit/rest')` 让 `new Octokit(...)` 整个被替换，**mock 边界之外的 `@octokit/core` 真实代码路径永远走不到**——任何 `@octokit/core` 与 `@octokit/auth-app` 之间的集成 bug 都被掩盖。**单测 mock 边界必须刻意保持最小**（如 `vi.mock('@octokit/auth-app')` 而不 mock `@octokit/rest`，让 `@octokit/core` 真实代码路径可执行）。
3. **实施完成不算 Done，必须有"真实路径调用 + 断言关键行为"的可执行验证**：M18.1 commit 4 当时 "typecheck 通过 + 单测全过" 就 close 了，但实际生产调用是 `Cannot read properties of undefined (reading 'bind')` / `Invalid auth type: undefined`。**真实 e2e 冒烟测试（nock 拦截 + 真实 Octokit + 真实 RSA privateKey JWT signing）必须在集成外部库时落地**，不能仅依赖 mock 单元测试。
4. **mock 形态对齐声明必须实测，不能信**：即使测试代码注释声称"mock 形态与 README `Object.assign(auth.bind(null, state), { hook: hook.bind(null, state) })` 对齐"，**也必须用一个不 mock 的真实路径测试验证对齐声明是真的**——本次 round 1 注释声称对齐但实际 dispatch 行为完全错位。

### 与既有教训的关联

- **§四十二**（coverage 阈值对 refactor 顺序敏感）：同样是"看似测试通过实际未生效"的反模式——§四十二是 coverage 阈值被 refactor commit 误触发清零；本条是 mock 测试因 mock 边界过宽掩盖集成 bug。两者同源：**测试不能只看"绿"，必须验证"绿"的语义对应真实生产行为**。
- **§三十九 / §四十一**（CI 双 run 失败）：强调"验证工具不覆盖内容语义"——单测/lint/coverage 都是验证工具，但都不覆盖"集成层真实行为"。本条扩展这条 pattern 到"集成外部库"场景。
- **§M17.4**（nuxt typecheck 不实测不能信 Done 输出）：同类教训——"Done 输出"是 LLM 自报，不是真实结果。`typecheck Done` / `test passed` / `lint 0 error` 都是输出，**必须实测 typecheck 0 error + test 真正绿 + lint 真无 error**。本条扩展到"`mock` 声称对齐 README 但实际未对齐"。

### 挂接治理检查点

1. **`docs/standards/development.md` §编码规范**：新增 pattern **"集成外部库前必须读 README 标准用法 + 落地真实路径 e2e 冒烟测试（mock 边界保持最小）"**——避免训练数据 / 直觉写法引入契约偏差。
2. **`docs/standards/testing.md` §测试隔离**：新增 pattern **"集成层测试不 mock 真实被集成库（保留真实代码路径可执行）；mock 仅替换被测单元的边界"**——避免 mock 边界过宽掩盖集成 bug。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"集成外部库时验证 README 标准用法引用 + e2e 真实路径测试存在 + mock 边界刻意保持最小"**——audit reject 案例（M18.4 round 1 B1）作为佐证。
4. **`docs/standards/ai-collaboration.md` §PDTFC+ 修复工作流**：扩展到"集成外部库实施完成不算 Done，必须有真实路径调用 + 断言关键行为"——与 §M17.4 nuxt typecheck 实测必须原则一致。

### 准入标准复核

本案例符合准入标准第 1 条"架构性陷阱（mock 边界过宽掩盖集成 bug）" + 第 3 条"反模式 / 教训重复触发（M18.1 commit 4 实施不完整 → M18.4 audit round 1 Reject → round 2 修复）"。挂接治理检查点 4 项可显著降低未来同类 bug 概率。

## 四十四、Code Scanning 命令注入漏洞修复 — execFileSync 替代 execSync（2026-08-30）

### 案例

GitHub Code Scanning 告警 #26 和 #27（`js/shell-command-constructed-from-input`，Medium 级别）：`packages/engine/src/github/pr-creator.ts` 中 `ensureGitConfig` 和 `gitConfigExists` 函数使用不安全的 `execSync` 和模板字符串拼接构造 shell 命令，存在命令注入风险。

**问题代码**：
```typescript
// 第 687行（告警 #26）
execSync(`git config user.name "${effectiveAuthor.name}"`, { cwd: workDir, stdio: 'pipe' })
// 第 690行（告警 #27）
execSync(`git config user.email "${effectiveAuthor.email}"`, { cwd: workDir, stdio: 'pipe' })
// 第 700行（同类问题）
execSync(`git config --local --get ${key}`, { cwd: workDir, stdio: 'pipe' })
```

**风险**：如果 `effectiveAuthor.name` 或 `effectiveAuthor.email` 包含双引号或其他特殊字符，可能导致命令注入。例如，如果 `name` 是 `"; rm -rf /; echo "`，则执行的命令变成：
```bash
git config user.name ""; rm -rf /; echo ""
```

**修复方案**：使用 `execFileSync` 替代 `execSync`，通过数组传递参数避免 shell 解释：
```typescript
// 修复后（安全）
execFileSync('git', ['config', 'user.name', effectiveAuthor.name], { cwd: workDir, stdio: 'pipe' })
execFileSync('git', ['config', 'user.email', effectiveAuthor.email], { cwd: workDir, stdio: 'pipe' })
execFileSync('git', ['config', '--local', '--get', key], { cwd: workDir, stdio: 'pipe' })
```

**验证**：lint + typecheck + test 全部通过（2492 passed, 5 skipped）

**commit**：`2d3419b fix(engine): 修复 pr-creator 中的命令注入漏洞`

### 教训

1. **execFileSync vs execSync**：涉及用户输入的 shell 命令必须使用 `execFileSync` 替代 `execSync`，避免命令注入。`execSync` 会将字符串传递给 shell 解释，而 `execFileSync` 直接执行文件，参数作为数组传递，不经过 shell 解释。

2. **根因分析 + 搜索优先**：本次修复前，先使用搜索优先模式确认 vite 依赖告警已是误报（8.2.2 已包含修复），避免不必要的升级。对于 Code Scanning 告警，应先分析根因，再制定修复方案。

3. **安全修复审计深度**：安全修复应使用 `deep` 级别审计，确保全面覆盖。本次修复使用 deep depth audit，确认无 blocker、warning 或 suggest。

4. **Code Scanning 告警处理流程**：
   - 使用 `gh api repos/owner/repo/code-scanning/alerts` 获取告警详情
   - 分析告警类型和位置
   - 使用搜索优先模式确认是否为误报
   - 制定修复方案并实施
   - 运行质量门验证
   - 使用 conventional-committer 提交

### 与既有教训的关联

- **§四十三**（集成外部库必须读 README 标准用法）：同样是"看似安全实际存在漏洞"的反模式——§四十三是 mock 测试掩盖集成 bug；本条是字符串拼接导致命令注入。两者同源：**安全不能只看"能跑"，必须验证"能跑"的语义对应真实安全行为**。

### 挂接治理检查点

1. **`docs/standards/security.md` §注入防护**：新增 pattern **"涉及用户输入的 shell 命令必须使用 execFileSync 替代 execSync，参数作为数组传递"**——避免命令注入漏洞。
2. **`docs/standards/development.md` §编码规范**：新增 pattern **"Code Scanning 告警处理流程：gh api 获取详情 → 搜索优先确认误报 → 制定修复方案 → 质量门验证 → conventional-committer 提交"**——标准化安全修复流程。
3. **`.github/agents/code-auditor.agent.md` 审计协议**：新增必查项 **"涉及 shell 命令的代码必须使用 execFileSync 替代 execSync，参数作为数组传递"**——Code Scanning 告警 #26/#27 作为佐证。

### 准入标准复核

本案例符合准入标准第 1 条"安全漏洞（命令注入）" + 第 4 条"工具/环境陷阱（shell 命令构造）"。挂接治理检查点 3 项可显著降低未来同类漏洞概率。

---

## 四十五、归档时区分已归档内容与必要信息（2026-08-30，M18 归档批次）

### 案例

M18 归档批次清理 `backlog.md` / `todo.md` 时两次"删过头"：删除了"维护规则"、待人工验收条目、长期主线任务详细描述、未上收待办项等必要信息。

### 正确做法

| 可删除 | 必须保留 |
|:--|:--|
| `闭环整理` 这类已归档内容（M16/M17/M18 归档批次的详细记录） | `维护规则`（backlog 的治理依据） |
| | `长期主线任务详细描述`（后续阶段理解任务背景） |
| | `未上收待办项`（活跃任务） |
| | `待人工验收条目`（真实环境验证任务） |
| | `周期性回归验证层`（健康检查层） |

### 判断标准

删除前问"这个信息在下一阶段启动时是否需要？"——如果需要，就保留。

### 教训

1. **归档时要区分"已归档内容"和"必要信息"**：`闭环整理`是已归档内容，可以删除；`维护规则`、`长期主线任务详细描述`是必要信息，必须保留；`未上收待办项`是活跃任务，必须保留。

2. **归档前应该先理解文件结构**：`todo.md` 的作用是登记当前阶段活跃待办；`backlog.md` 的作用是维护未进入正式阶段的候选池；两个文件的功能不同，清理策略也应该不同。

3. **归档时要保留足够的上下文**：长期主线任务需要保留详细描述，以便后续阶段理解任务背景；周期性回归验证层需要保留，因为它是健康检查层。

4. **归档后要验证链接**：删除内容后要检查是否有断链；使用 `pnpm run check:docs` 验证。

### 与既有教训的关联

- **§规划规范 §4.4 大批量归档批次操作规范**：本条补充了"区分已归档内容与必要信息"的规范，与已有的"anchor 实证"、"跨文件外链主动追踪"、"死链验证"等规范形成完整的归档操作指南。

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 9 条"区分已归档内容与必要信息"——明确可删除和必须保留的内容类型，以及判断标准。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（归档操作规范中缺少"区分已归档内容与必要信息"的指导）+ 第 3 条"重复违规预警"（两次"删过头"证明需要明确规范）。挂接治理检查点 1 项可显著降低未来同类问题概率。

---

## 四十六、PrimeVue ToggleSwitch v-model 嵌套字段触发 useAsyncData watch 浅监听失效（2026-08-31，M20.6）

### 案例

M20.6 alerts.vue 把 `dedupeOptions` Select 替换为 ToggleSwitch "显示已解决" 开关后，e2e 实证点击开关后 `/api/alerts` 请求数为 0（默认 includeSuperseded=false，过滤正确），但开关切换为 true 后 `/api/alerts?includeSuperseded=true` 请求未触发，表格数据不更新。

调试脚本 `_debug3.spec.ts` 实证：
- `aria-checked` 属性从 `false` 变为 `true`（ToggleSwitch 状态正确）
- 浏览器侧 `/api/alerts` 请求数为 0（refetch 未触发）

### 根因

Vue 3 + Nuxt useAsyncData watch 浅监听对 nested field mutation 不响应：
- `watch: [viewMode, filters]` 中 `filters` 是 `ref<AlertsFilters>`——Vue 3 watch 对 ref 浅比较（reference equality）
- ToggleSwitch v-model 修改 `filters.includeSuperseded = true` 是 reactive 字段修改（不替换 ref.value 整体）
- reactive 字段修改触发 ref.value 的 reactive trigger，但 watch 浅监听不看 ref.value 的字段变化

### 修复路径

```ts
// 错误：ref + watch 浅监听
const filters = ref<AlertsFilters>({...})
watch: [viewMode, filters],

// 正确：reactive + getter + deep watch
const filters = reactive<AlertsFilters>({...})
watch: [viewMode, () => filters, { deep: true }],]

// 显式 watch 兜底（保险）
watch(filters, () => { void refreshAlerts() }, { deep: true })
```

### 教训

1. **v-model 修改嵌套字段需要 `reactive` 而非 `ref`**：`ref` 适合整体替换的对象；`reactive` 适合字段级修改的对象。
2. **useAsyncData watch 默认浅监听**：默认对 source ref 浅比较，不监听 nested field mutation；需要 `deep: true` 或 getter source。
3. **调试 useAsyncData 行为用 `pageon-request`**：浏览器侧请求数可直接判断 refetch 是否触发，比 Vue devtools 更可靠。
4. **依赖 Nuxt useAsyncData 默认 `dedupe: 'cancel'` 抑制双触发**：内置 watch + 显式 watch 都可能触发 refresh，但 abortController 会取消旧 execute；改 dedupe 策略前需重新评估。

### 与既有教训的关联

- **§三十一、PR #26/#27 命令注入漏洞（fix(engine) execFileSync 替代 execSync）**：同模式——外部库/框架的默认行为不可信，必须实测。
- **§三十六、CI 双 run 失败：锚点漂移 + dependfix 验证链缺 nuxt prepare**：同模式——Nuxt 框架在 `pnpm typecheck` 通过但 build 失败，验证矩阵必须含 build。

### 挂接治理检查点

1. **`docs/standards/development.md` §Vue/Nuxt 响应式模式**：新增"V-model 修改嵌套字段 + useAsyncData watch 模式"——明确 v-model 嵌套字段必须用 `reactive` + `deep: true`，禁止 `ref` + 默认 watch。
2. **`.github/agents/code-auditor.agent.md` 必查项**：新增"useAsyncData watch 模式"——A 阶段 audit 检查 useAsyncData 调用点 watch 配置（必须含 deep 或 getter source + reactive fields）。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（Vue/Nuxt 响应式模式规范中缺少 v-model + useAsyncData watch 模式指导）+ 第 3 条"重复违规预警"（PrimeVue 4 + Nuxt SSR hydration rowGroup 已知 bug §三十一 / §三十二 同源根因：框架默认行为不可信）。挂接治理检查点 2 项可显著降低未来同类问题概率。

---

## 四十七、一次性脚本不应 over-engineering：tsx CLI 装饰器依赖 vs Node 22+ strip-types（2026-08-31，M20.7）

### 案例

M20.7 backfill 一次性脚本最初设计为 TypeScript + tsx CLI 入口：
1. 添加 `tsx ^4.23.1` 到 devDependencies
2. 新建 `register-entities.ts` helper 文件集中管理 entity metadata side-effect imports
3. scripts：`<script>` 加 `tsx server/database/scripts/backfill-scan-result.ts --dry-run` + `--apply`

用户质疑"添加 tsx 是为什么？这个脚本为什么要 TypeScript？"——触发反思：
- Node 20 LTS（engines `>=20`）不支持 .ts 直接运行
- Node 22.6+ `--experimental-strip-types` 只剥离类型注解，不处理装饰器
- TypeORM 装饰器依赖 `emitDecoratorMetadata`，是 TS 编译器专属能力

### 根因链

1. **Node 内置 TS 支持能力有限**：`--experimental-strip-types`（22.6+）只剥离 `:` 类型注解语法，不处理 `experimentalDecorators + emitDecoratorMetadata`（TS 编译器专属）
2. **TypeORM 装饰器依赖 TS emitDecoratorMetadata**：`@Entity('table_name')` + `@Column({...})` 装饰器运行后必须 emit 元数据到 `reflect-metadata`，否则 DataSource 构造时找不到 entity metadata → `EntityMetadataNotFoundError`
3. **一次性脚本的工程价值 vs 永久代价**：
   - 价值：迁移一次就完事，没有动态业务逻辑
   - 代价：tsx devDep 永久（每次 install 都下载）+ scripts 目录永久维护

### 诚实分析结果

**保留 tsx 的不可替代技术约束**：
- Node `--experimental-strip-types` 不支持装饰器（实测确认）
- TypeORM entity 装饰器依赖 emitDecoratorMetadata，tsx / ts-node / 自建 build 产物是唯一路径
- engines 升级到 `>=22`（Node 20 EOL 2026-04-30）—— 仍需 tsx（Node 22.6+ strip-types 仍不处理装饰器）

**可简化的工程优化**：
- 删 `register-entities.ts` 单独文件，整合到主脚本顶部 inline `eslint-disable` 块（净 -21 行）
- engines 升级 `>=20` → `>=22`（Node 20 EOL）

### 教训

1. **不要为了"项目完整性"添加不必要的 dev 依赖**：一次性脚本 + 永久 devDep 代价不匹配价值；评估价值 / 成本比。
2. **engines 应该与 Node LTS 实际部署版本对齐**：Node 20 已 EOL（2026-04-30），engines `>=20` 是历史遗留，实际部署是 Node 22+ 或 Node 24+。
3. **技术约束要说清楚"不可替代"vs"工程偏好"**：TypeORM 装饰器需要 emitDecoratorMetadata（技术约束，不可替代） vs 项目惯例（工程偏好，可改）。
4. **CLI 端 entity metadata 必须显式 import 触发装饰器**：tsx / vitest CLI 路径不走 Nitro auto-load，需在脚本入口处显式 import 触发 `@Entity` / `@Column` 装饰器注册。
5. **`--experimental-strip-types` 不支持装饰器**：实测验证——`@Entity('scan_result')` 行报 `SyntaxError: Invalid or unexpected token`；需要 `--experimental-transform-types`（23.6+，24 默认关闭）但仍不处理装饰器。

### 挂接治理检查点

1. **`docs/standards/development.md` §TypeScript 运行时依赖评估**：新增"一次性脚本 TypeScript 价值评估"——明确哪些场景必须 TypeScript（装饰器 / 类型严格安全）vs 哪些可以改 JavaScript（纯 SQL / 简单业务逻辑）。
2. **`apps/platform/package.json` `engines` 字段**：升级到 `>=22`（Node 20 EOL）；注释说明 Node 22.6+ 内置 strip-types 仍不处理装饰器。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（development.md §TypeScript 运行时依赖评估缺失）+ 第 4 条"工具/环境陷阱（Node strip-types 边界）"。挂接治理检查点 2 项可显著降低未来同类 over-engineering 风险。

---

## 四十八、归档批次预防性分片 + cross-reference 断链修复（2026-08-31，M20 归档批次）

### 案例

M20 归档批次执行时：
1. 当前 todo-archive.md 主窗口 638 行 + M20 段预估 100-130 行 ≈ 738-768 行
2. 超 [archive/index.md §1 `todo-archive.md` 健康窗口 700 行强制分片阈值]（[docs/plan/archive/index.md](../../plan/archive/index.md)）
3. 预防性迁出 M16 + M17（306 行）至新分片 `archive/todo-archive-phases-m16-m17.md`
4. 主窗口保留 3 个阶段（M20 / M19 / M18），符合"主窗口保留 3-5 个阶段"健康策略

执行后断链问题：
- `docs/plan/roadmap.md` 4 处 `todo-archive.md#m16-...` / `m17-...` 锚点失效（M16/M17 段已迁出，主窗口无对应标题）
- `docs/plan/backlog.md` 4 处同类锚点失效
- `docs/design/packages/data-model.md` 引用 `todo.md#当前阶段m20-...`（todo.md 已清空 M20 内容）
- `docs/index.md` 引用 `todo-archive.md#m16-...`（已迁出）

### 根因

预防性迁出阶段后，文档 cross-reference 指向已不存在的锚点：
- todo-archive.md 中 §M16 / §M17 段被替换为指针段落（"详见 archive/todo-archive-phases-m16-m17.md"），原锚点失效
- 其他文档（roadmap.md / backlog.md / data-model.md / docs/index.md）引用的是 todo-archive.md 内的锚点

### 修复路径

1. **roadmap.md 锚点转换**：
   ```md
   # 前
   [todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)
   # 后
   [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)
   ```

2. **锚点格式转换**：`--`（双连字符）→ 单词连续（如 `m161m162m163`），由 check-docs.mjs 自动生成

3. **`pnpm run check:docs` 验证**：find link 错误并全部修复（roadmap.md 4 处 + backlog.md 4 处 + data-model.md 1 处 + docs/index.md 1 处 = 10 处断链）

### 教训

1. **预防性迁出阶段后必须 `pnpm run check:docs` 验证所有锚点**：迁出主窗口内的§后，其他文档中引用该§的锚点全部失效。
2. **跨文件 cross-reference 必须统一更新**：roadmap.md / backlog.md / data-model.md / docs/index.md 中所有 M16/M17 引用都要同步更新到分片文件。
3. **锚点格式约定**：`--`（双连字符）在 check-docs.mjs 中转换为单词连续（如 `m161--m162` → `m161m162`），不要手动拼接。
4. **todo.md 状态变化后及时更新 cross-reference**：M20 完成后 todo.md 已清空 M20 内容，但 data-model.md 仍引用 `todo.md#当前阶段m20-...` 锚点。
5. **docs/index.md 状态描述也要同步**：M0-M16 已闭环 → M0-M20 已闭环。

### 挂接治理检查点

1. **`docs/standards/planning.md` §4.4 大批量归档批次操作规范**：新增第 10 条"预防性迁出后 cross-reference 更新"——明确迁出主窗口内的§后，必须更新所有文档中的锚点引用，并 `pnpm run check:docs` 验证。
2. **`scripts/check-docs.mjs`**：新增"跨文件锚点引用"报告——列出所有引用了已迁出§的文档路径和行号，便于预防性迁出后批量修复。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（planning.md §4.4 缺少"预防性迁出后 cross-reference 更新"规范）+ 第 3 条"重复违规预警"（M18 归档批次预防性迁出 M13/M12/M10 / M19 归档批次预防性迁出 M14/M15 均有类似断链风险）。挂接治理检查点 2 项可显著降低未来同类问题概率。

## 五十、SQLite 数据库业务数据被清空：开发环境不可恢复事故（2026-09-01）

### 案例

`apps/platform/data/dependfix.sqlite` 启动后被清空，用户登录管理员账号失败、仓库/凭据/扫描结果全部丢失。事故排查与根因分析：

#### 现场证据（采集自 dependfix.sqlite readonly 模式）

| 指标 | 实际值 | 含义 |
|:--|:--|:--|
| 文件大小 | 233,472 bytes (57 pages × 4096) | 与 page_count 完全吻合，无浪费 |
| `freelist_count` | **0** | **没有任何被删除数据的痕迹**（SQLite DELETE 后页面进 freelist，VACUUM 才回收） |
| `auto_vacuum` | 0 | 默认关闭 |
| `journal_mode` | delete | 默认 rollback journal |
| `schema_version` | **95** | **经历过 95 次 schema 变更**——非"首次启动创建的新库" |
| `sqlite_sequence` | `[{"name":"migrations","seq":1}]` | 只跑过 1 个 migration |
| 各表行数 | 仅 `dependfix_organization` 1 行 | 其他 12 个业务表全部 0 行 |
| schema 完整性 | 14 张表 + 38 索引完整 | TypeORM synchronize 已成功建表 |
| 文件 Birth time | 2026-08-31 14:23:25 +0800 | 文件 inode 创建时刻 |
| 文件 mtime | 2026-09-01 02:57:59 +0800 | 最近访问时刻 |
| organization.created_at | 2026-08-31 18:57:59 UTC = 02:57:59 +0800 | 本次启动时自动初始化 |

#### 启动日志关键点（用户提供的 dev 启动日志）

```
2:57:46 AM  Nuxt 4.5.2 启动
2:57:49 AM  Vite client/server built
2:57:53 AM  Nuxt Nitro server built
2:57:59 AM  [database] create new DataSource (pid=21967, global=false)
2:57:59 AM  WARN [better-auth] Base URL is not set
2:58:06 AM  WARN [Better Auth]: User not found
2:58:18 AM  WARN [Better Auth]: User not found
```

- `[database] create new DataSource (pid=21967, global=false)` 表明**新进程 + globalThis 无残留 DataSource**（每次新进程都是 global=false，正常）
- `[Better Auth]: User not found` 警告证明 better-auth 查询数据库时**找不到用户**——业务表已空

### 根因分析（多角度穷举）

#### 假设 A：TypeORM 1.x synchronize 清空数据 → **排除**

**实测** `repro.cjs` / `repro2.cjs` / `sv-test3.cjs`：
- TypeORM 1.x synchronize 在 SQLite + 已有数据 + 新增 NOT NULL 列无 default 时会抛 `SqliteError: NOT NULL constraint failed`
- `RdbmsSchemaBuilder.build()` 包裹在事务里（`startTransaction → executeSchemaSyncOperationsInProperOrder → commitTransaction / rollbackTransaction`）
- **失败时事务回滚，原表数据保留**
- 复现日志：`after FAILED sync schema_version=3 page_count=7 scan_result_rows=1`（schema_version 与 rows 保持不变）

→ **synchronize 失败不会清空数据**

#### 假设 B：应用代码路径主动 DELETE → **排除**

穷举所有可能的清空路径：
- `cleanupStaleRuns`（`apps/platform/server/services/batch/stale-cleanup.ts`）：只清理 `ScanRun` / `BatchRun` 中 stale 行（status=running/pending 且超 30 分钟），**不会清空** user/repo/credential/session 等
- `e2e/fixtures.delete.ts`：受 `process.env.E2E_TEST !== 'true'` 门控保护，且按精确 owner/name 删除，**不会全表清空**
- `backfill-scan-result.ts`：只处理 ScanResult 表的 per-alert 模型聚合，**不会动**其他表
- `process.exit` 前的 cleanup：所有 `process.exit` 都不带清空逻辑
- `fs.unlinkSync` / `fs.rmSync`：仅清理 workDir/_pending/ 内过期 worktree，**不针对 SQLite 文件**

→ **代码内没有任何清空业务表的路径**

#### 假设 C：TypeORM `dropSchema` 选项触发 → **排除**

`createDataSourceOptions()` 未传 `dropSchema: true`：
```ts
const common: Partial<DataSourceOptions> = {
    entities: [...],
    migrations: [CreateAuditEventTable1700000000000],
    migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false',
    synchronize,
    entityPrefix,
    namingStrategy: new SnakeCaseNamingStrategy(),
    cache: false,
}
```
DataSource.js 第 148-149 行确认：`if (this.options.dropSchema) await this.dropDatabase()`——**dropSchema 未启用，不调用 dropDatabase**

→ **TypeORM dropSchema 路径未触发**

#### 假设 D：外部 shell / 运维脚本清空 → **最可能**

代码内找不到清空路径，结合：
- `freelist_count=0` + `page_count × page_size == file_size`（freelist 全回收 = VACUUM 后或新建后）
- `schema_version=95`（说明文件经历过 schema 演进，不是全新创建）
- organization.created_at = 02:57:59（本次启动才创建，说明之前**没有** organization）
- 用户陈述"数据全被清空" + "数据库创建时间和修改时间一致"

最可能的事故链：
1. 用户在某个时间点（14:23 之前或之后）通过 shell / sqlite 客户端 / CI 脚本执行了 `DELETE FROM` 清空所有业务表 + `VACUUM`（回收 freelist），或直接 `rm` 文件
2. 应用启动时**未自动备份**（**风险 1**），无法回滚
3. 启动后 TypeORM synchronize 检测到 schema 不变（已与 entity 匹配），不重建 schema
4. `ensureDefaultOrganization()` 创建 organization 行（这是本次启动唯一的数据写入）
5. 用户登录 → better-auth 查 user 表为空 → 失败

### 已识别的 5 条设计风险

虽然本次事故根因不在代码，但暴露了**至少 5 条可加固的设计风险**：

#### 风险 1：dev 模式 `synchronize=true` 硬编码开启

`apps/platform/server/database/index.ts:42`：
```ts
const isDev = process.env.NODE_ENV !== 'production'
const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true' || isDev
```

`.nuxt/dev/index.mjs:10482` 烘焙 `isDev=true` → **`pnpm dev` 启动时 synchronize 永远为 true**。任何 schema 升级（如未来再次出现 M20.3 这类 NOT NULL 列无 default 改动）会**同步失败并阻塞启动**。同步失败本身不会清空数据（实测），但启动期错误会让人误以为是"数据库坏了"。

#### 风险 2：`synchronize=true + migrationsRun=true` 同时启用（TypeORM 反模式）

`apps/platform/server/database/index.ts:60`：
```ts
migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false', // 默认 true
```

TypeORM 1.x 文档明确警告 `synchronize` + `migrationsRun` 同开是反模式：
- 启动顺序：buildMetadatas → afterConnect → dropSchema? → runMigrations? → synchronize?
- 两者同时启用可能导致 schema 状态不一致（migration 创建 + synchronize 重建）

#### 风险 3：e2e/fixtures.delete 双重防御缺失

`apps/platform/server/api/e2e/fixtures.delete.ts:39`：
```ts
if (process.env.E2E_TEST !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```

- 只有 `E2E_TEST !== 'true'` 门控
- **缺 `NODE_ENV === 'production' → 404` 兜底**（即使生产环境误设 `E2E_TEST=true` 也会暴露端点）
- 这是 fixtures.post.ts:24-26 已记录的 RG-S3 follow-up，**未落地**

#### 风险 4：缺 SQLite 数据备份机制

- 没有任何 SQLite 备份脚本
- 没有 `.gitignore` 保护下的本地快照
- 一旦发生清空事故**完全无法回滚**
- 本次事故直接暴露

#### 风险 5：缺数据库自检工具

- 启动期没有打印数据库状态（表行数、freelist、schema_version、最近 mtime）
- 用户无法快速判断"数据是被清空"还是"从未注入"
- 故障定位耗时高（本次事故 30 分钟排查）

### 修复方案（待用户决策后落地）

#### 方案 1：SQLite 启动期自动备份（风险 4 兜底）

新增 `apps/platform/server/database/backup.ts`：
- 启动 `ensureDatabaseInitialized()` 前自动备份：`data/dependfix.sqlite → data/backups/dependfix.sqlite.YYYY-MM-DDTHH-mm-ss.bak`
- 仅在文件存在且非空时备份
- 保留最近 10 份（可配置），自动清理老备份
- 提供 `pnpm db:restore --from=<backup-file>` 还原命令
- **未来发生同类事故时**：可立即 `pnpm db:restore --from=data/backups/dependfix.sqlite.2026-09-01.bak` 恢复

#### 方案 2：synchronize 显式 opt-in + 启动日志（风险 1）

修改 `apps/platform/server/database/index.ts:42`：
- 移除 `|| isDev` 自动开启
- 改 `DATABASE_SYNCHRONIZE=true` 才开
- 启动期显式日志：`[database] synchronize=true (DATABASE_SYNCHRONIZE=true, isDev=...)` 便于排查
- **降低意外同步触发的概率**

#### 方案 3：migrationsRun 默认改为 false（风险 2）

修改 `apps/platform/server/database/index.ts:60`：
- `migrationsRun` 默认改为 `false`
- 仅在显式 `DATABASE_MIGRATIONS_RUN=true` 时开启
- 配合 `DATABASE_SYNCHRONIZE=true` 单独使用

#### 方案 4：e2e/fixtures.delete 双重防御（风险 3）

修改 `apps/platform/server/api/e2e/fixtures.delete.ts:39`：
```ts
if (process.env.E2E_TEST !== 'true' || process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```
- 双门控：缺一不可
- 同样应用到 fixtures.post.ts（对称防御）

#### 方案 5：数据库自检脚本（风险 5）

新增 `apps/platform/server/database/scripts/db-doctor.ts`（原方案写 `apps/platform/scripts/`，落地时与既有数据库脚本同目录收敛，见 [todo.md §M22.3](../../plan/todo.md)）：
- 打印各表行数、freelist、page_count、schema_version、journal_mode
- 提供 `pnpm db:doctor` 命令
- 用户可立即判断数据库状态（是被清空 vs 从未注入 vs schema 升级中）
- **降低未来同类故障的定位时间**

### 教训

1. **数据库启动期自动备份是 SQLite 单写者应用的最后防线**：一旦发生清空事故（任何来源），没有备份即无法回滚。better-sqlite3 单文件 SQLite 极简但脆弱，备份机制必须前置（启动期自动 + 用户命令式）。

2. **TypeORM 1.x synchronize 失败不会清空数据**（实测验证 `RdbmsSchemaBuilder` 事务回滚有效），但启动期错误让人误以为"数据库坏了"——区分"schema 同步失败"和"数据被清空"必须看 schema_version + freelist_count + 各表行数。

3. **`synchronize + migrationsRun` 是 TypeORM 反模式**：两者同开会导致 schema 状态不一致，迁移/重建逻辑相互干扰。规范做法是：开发用 synchronize（手动改 entity）+ migrations 准备生产部署；生产用 migrations + `migrationsRun=true`，**关闭 synchronize**。

4. **e2e/测试端点必须叠加 NODE_ENV 防御**：`E2E_TEST=true` 这种环境变量是单点失败防御，生产环境误设即暴露端点。`NODE_ENV === 'production'` 是兜底——任何破坏性端点都应该双门控。

5. **开发环境数据丢失也是事故**：即使不影响生产，但用户投入的种子数据、测试场景会被全部抹除，浪费排查时间 + 重置工作。启动期自动备份是低成本高价值的防御措施。

6. **不要用 `freelist_count=0` 推断"数据库从没数据"**：freelist=0 仅说明没有"删除后未 VACUUM"的页面。如果用户先 DELETE 再 VACUUM 或先 rm 再新建，freelist 也是 0。判断数据库历史需要看 `schema_version`（schema 演进计数）+ `journal_mode` + `user_version` + 各表行数 + `integrity_check` 综合判断。

7. **代码内找不到根因 ≠ 不存在根因**：本次事故穷举代码内所有可能的清空路径（synchronize / cleanupStaleRuns / fixtures.delete / backfill / dropSchema），均未发现清空逻辑。代码层面无法找到根因时，事故根因在代码外部（shell、CI、运维、人工误操作）的概率极高——但仍需通过防御加固（自动备份 + 显式 opt-in + 启动日志）来降低未来同类事故的恢复成本。

### 挂接治理检查点（规范吸收）

1. **`docs/standards/development.md` §5.1.18**：SQLite 数据库启动期自动备份强制项（仅在 production-like 环境下，dev 环境可选但建议开启）
2. **`docs/standards/development.md` §5.1.19**：synchronize 与 migrationsRun 反模式禁止（不能同时启用；开发用 synchronize，生产用 migrations）
3. **`docs/standards/platform.md` §3.6**：e2e 端点双门控规范（`E2E_TEST` + `NODE_ENV` 双重校验）
4. **`docs/standards/security.md` §2.1 SQLite 数据库防护（不可恢复数据事故防线）**：SQLite 数据备份与恢复规范（启动期自动备份 + 命令式恢复 + 自检工具）
5. **`docs/plan/todo.md`**：登记 M22 阶段任务（启动期备份 + synchronize opt-in + 双重防御 + 自检脚本）

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（development.md / platform.md / security.md 均无 SQLite 备份 + synchronize opt-in + e2e 双门控规范）+ 第 4 条"工具/环境陷阱"（SQLite 单文件脆弱性 + TypeORM 1.x 默认反模式 + 启动期 backup 缺失是真实运行才能暴露的陷阱）。挂接治理检查点 5 项可显著降低未来同类事故的恢复成本 + 误操作概率。

---

## 五十一、E2E global-setup 串行多次 setupPage 后首请求 ECONNRESET（2026-09-01，CI run 33525721103）

### 案例

- **CI run**：[33525721103](https://github.com/dependfix/dependfix/actions/runs/33525721103)（`docs(plan): M22 阶段归档 + 预防性迁出 M18 到分片 + 跨文件同步`，2e590f0 / f617b56 之后修复 commit）
- **症状**：Test / Coverage job 均 success，**E2E job 失败**。失败点固定在 global-setup 末尾的 `cleanAlertsRowgroupFixtures` —— `request.delete('/api/e2e/fixtures', { data: { repos: ... } })` 返回 `ECONNRESET`（TCP RST，100ms 内），global-setup 未跑完即失败 → 所有 e2e 用例 0 跑。
- **CI 时序实测**：
  - 15:27:58 playwright test 启动
  - 15:28:01 server up（Better Auth 启动警告 — 全程唯一 server 日志，stdout 数据库 init 等未捕获）
  - 15:28:03-04 setupPage.goto（首次 SSR 触发 `getAuth()` + DB init）
  - 15:28:04-07 admin sign-in（page sign-in via chromium，3s）
  - 15:28:07-10 viewer sign-in（3s）
  - **15:28:10.87 → 15:28:10.98 DELETE /api/e2e/fixtures → ECONNRESET**（106ms）

### 根因排查（穷举）

#### 假设 A：handler 逻辑 bug → **排除**
- 复现脚本 `node /tmp/opencode/repro-e2e-fixtures.mjs`（Playwright API + 本地 `.output/server/index.mjs` + 相同 env）：DELETE 返回 HTTP 200，body `{"deleted":{"repos":0,...}}`，server 进程稳定存活
- vitest 单测 `fixtures.post.test.ts` + `fixtures.delete.test.ts` 6/6 通过
- 构建产物 grep 实证（详见 [五十一根因排查产物]）：`useRuntimeConfig().e2eFixturesAllowed` 正确读取 `NUXT_E2E_FIXTURES_ALLOWED`（runtimeConfig `applyEnv` 走 `NUXT_` altPrefix），未被 esbuild define 折叠

#### 假设 B：服务侧 OOM / 进程崩溃 → **低概率**
- ECONNRESET（TCP RST）确实由 server 主动 close socket 触发，但 server 处理前 5+ 个请求全部成功（含两次 page sign-in 串行 3s × 2 = 6s），未出现 OOM 警告或内存异常
- GH Actions runner 默认 7GB RAM，单纯 fixtures 清理不可能触发 OOM

#### 假设 C：Chromium headless DELETE + body 行为差异 → **可能但无法复现**
- Playwright 1.62.1 `request.delete(url, options)` → `fetch(url, { ...options, method: 'DELETE' })`，与 POST 共用同一底层网络栈
- 本地复现脚本用 Playwright request API（同一路径）DELETE 成功 → 排除 Chromium 通用 DELETE bug
- 但 CI 环境 headless chromium 151.0.7922.34 + Ubuntu 24.04 + chromium 新连接（fixturesCtx 是新建 browser context）组合，未本地稳定复现

#### 假设 D：better-auth session 写入后 SQLite 连接释放时序 → **最可能根因**
- admin / viewer page sign-in 都走 `getAuth()` 初始化 + `dataSource.transaction(...)` 写 session，事务结束后 connection 释放
- 紧接的 fixtures DELETE 经 `ensureDatabaseInitialized()` → `getDataSource()` 走同一 singleton，但 better-auth 内部 session 表操作可能持有 Node.js EventLoop 微任务队列残留
- ECONNRESET 在 TCP 层表现为 server 主动 RST，可能是 Nitro 在 better-auth 异步清理未完全收敛前过早释放请求 socket
- **无法 100% 实证**：better-auth 1.7 内部 transaction 关闭路径不在本仓库，无法加日志；本地复现脚本同时间窗但未触发

### 修复方案（最小变动 + 兜底 + 根因追踪分离）

#### 已落地：e2e/fixtures helper 加 `maxRetries: 2` 兜底（commit f617b56）

- 实证 Playwright 1.62.1 `_sendRequestWithRetries` 源码（`playwright-core@1.62.1/lib/coreBundle.js:25870-25895`）：
  ```js
  if (e.code !== "ECONNRESET")
    throw e; // 其他错误码（ECONNREFUSED / ETIMEDOUT）不重试
  ```
- maxRetries=2 走 250ms → 500ms → 1000ms 指数 backoff，正好覆盖"首次请求 ECONNRESET + 异步资源清理收敛后第二次成功"的窗口
- **不触动 server handler**：本地 / CI 行为等价；handler 单元测试 + 真实路由测试均通过

#### 未落地：根因排查（登记 M23 阶段规划 backlog）

- 候选排查路径（按 ROI 排序）：
  1. **better-auth 1.7 transaction 关闭时序**：在 `getAuth()` 加 `[auth] transaction close trace` 日志 + `ds.transaction` 包装打印 begin/commit 时间戳，CI 复现一次
  2. **Nitro h3 `defineEventHandler` async generator 行为**：检查 fixtures.delete handler 是否被识别为 generator（`async function*`）导致提前 close socket
  3. **SQLite WAL 模式 + `journalMode=delete`**：当前 default rollback journal，并发事务可能短暂持锁；切 WAL + `busy_timeout` 可能消解
  4. **增加 fixtures API 请求间 `await new Promise(r => setTimeout(r, 100))` 节流**：经验性方案，避免作为唯一修复

### 教训

1. **CI 偶发网络错误兜底模式**：test helper 涉及网络调用且 CI 偶发 ECONNRESET / ECONNREFUSED / ETIMEDOUT 时，**优先复用 Playwright `maxRetries` 选项**（内置 250ms 指数 backoff）；handler 不动、本地 / CI 行为等价。
2. **Playwright `maxRetries` 仅重试 `e.code === 'ECONNRESET'`**：JSDoc 注释必须精确描述（不要笼统写"重试网络层错误"），否则后续维护者误判覆盖范围。
3. **ECONNRESET 根因排查边界**：handler 逻辑 / 单元测试 / 本地复现均通过 → 根因必在 CI 独有环境组合（chromium 版本 × OS × 网络栈 × 异步时序窗口），无法本地稳定复现时**接受兜底修复 + 根因 backlog 分离**而非无限深挖。
4. **e2e fixtures helper 是测试代码，但仍是正式代码**：maxRetries 这种运行时行为改动仍需走 lint + typecheck + vitest + A 阶段 audit（quick depth）+ commit 完整流程。

### 挂接治理检查点（待下批次会话处理）

1. **wisdom.md**：新增 1 条 pattern —— `pattern-playwright-maxRetries-econnreset` —— Playwright 1.62 `_sendRequestWithRetries` 仅重试 ECONNRESET 的源码实证 + test helper 兜底模式
2. **ai-collaboration.md §4 PDTFC+**：补充"CI 偶发错误三阶段协议" —— ① handler / 单测 / 本地复现穷举 → ② 兜底修复（helper 层而非 handler 层）→ ③ 根因 backlog 分离 + M 阶段规划时优先排查
3. **testing.md**：补充"e2e global-setup 串行场景网络抗性最佳实践" —— 多 ctx + 多 request 后首请求 ECONNRESET 风险 + maxRetries 兜底推荐值
4. **backlog.md**：登记 M23 阶段候选 — better-auth transaction close 时序 + Nitro h3 async generator + SQLite WAL 模式 + fixtures 节流

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（wisdom.md / ai-collaboration.md / testing.md 均无 Playwright maxRetries 网络兜底模式说明）+ 第 4 条"工具/环境陷阱"（better-auth transaction close + Nitro h3 socket 释放 + chromium headless DELETE 行为是 CI 真实运行才能暴露的陷阱）。挂接治理检查点 4 项可降低未来同类 CI 偶发失败的修复成本 + 避免"无限本地复现"陷阱。

---

## 五十二、Playwright test.use 存储状态传染：导致"未认证"API 测试收到 200（2026-09-02，CI run 33533376712）

### 案例

- **CI run**：[33533376712](https://github.com/dependfix/dependfix/actions/runs/33533376712)（`docs(plan+archive): M22.7 hotfix 登记 + 经验归档 §五十一 + backlog 候选`，51e8c13）
- **症状**：M22.7 hotfix 修复 global-setup ECONNRESET 后，E2E job 跑满 6 分钟（vs 之前 12s 即失败），但 2 个用例失败 —— `Expected: 401, Received: 200`：
  - `tests/e2e/credentials-api.e2e.test.ts:283 › 未认证 GET /api/credentials → 401`
  - `tests/e2e/repos-api.e2e.test.ts:447 › 未认证 GET /api/repos → 401`
  - retry #1 / #2 均复现（CI=2 retries）
- **网络追踪实证**：两个失败用例的 `context-options` 携带**完全相同**的 cookie 值，session token 来自上游（不是 admin.json 的 `aKoIPeL...` / viewer.json 的 `Uev1leUL...`，是新的 `LhAh2mxu4rTjo27Wc8wLyeDpspBq4MnE...`）：
  ```json
  "storageState":{
    "cookies":[
      {"name":"i18n_locale","value":"zh-CN","domain":"127.0.0.1"},
      {"name":"better-auth.session_token","value":"LhAh2mxu...","expires":1790873050.509821}
    ],
    "origins":[{"origin":"http://127.0.0.1:3101","localStorage":[{"name":"dependfix-color-mode","value":"light"}]}]
  }
  ```
  session expires `1790873050` = `2026-09-30T17:24:10Z`（CI run `2026-09-01T16:46:59Z` + 29 天 = better-auth `expiresIn: 60*60*24*30` 一致）
- **CI 时序实测**：global-setup 16:44:11-12（fixtures seeded）→ 171 tests 运行 16:44:12 → 失败 #89（credentials 16:46:59）→ 失败 #140（repos 16:48:32）→ 16:49:57 全局失败

### 根因排查（穷举）

#### 假设 A：handler 逻辑 bug → **排除**
- 本地 curl 复现：fresh built server + 未携带 cookie → HTTP 401 ✓
- 本地 Playwright 复现脚本：fresh context（无 cookies）+ GET → HTTP 401 ✓
- vitest 单测：6/6 fixtures 测试全过（gate 逻辑 + 200 路径）
- handler requireAuth 逻辑（apps/platform/server/utils/guard.ts:23-28）正确抛出 401

#### 假设 B：服务侧 OOM / 进程崩溃 → **排除**
- E2E 跑满 6 分钟（vs 之前 12s global-setup 即崩），其他 80+ 测试正常 200/403
- Better Auth warning + 数据库 init log 正常（webServer stderr 捕获）
- 服务端进程稳定存活

#### 假设 C：Chromium headless request.delete/get 行为差异 → **低概率**
- 本地 Playwright 1.62 + headless chromium 151.0.7922.34 复现空 cookies 请求 → 401 ✓
- 仅 2 个特定用例失败（credentials / repos 未认证测试），其他 viewer GET /api/credentials 等类似测试正常 → 与 HTTP 方法无关

#### 假设 D：`test.use({ storageState })` 注入到 `browser.newContext()` → **最可能根因**
- 网络追踪 `context-options` 显示 options 包含 `baseURL: "http://127.0.0.1:3101"`（来自 playwright.config use.baseURL）+ `storageState: { cookies: [...], origins: [...] }`（非 admin.json / viewer.json 内容，但包含上游测试残留 session）
- 测试代码：
  ```ts
  test.describe('凭据管理 API 鉴权边界', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' })  // describe 块顶层
    test('未认证 GET /api/credentials → 401', async ({ browser }) => {
      const context = await browser.newContext()  // 无 storageState 参数
      ...
    })
  })
  ```
- 假设：Playwright 1.62 fixture pool 在 describe 块 scope 内，`test.use({ storageState })` 配置通过 fixture pool 注入到该 scope 内所有 `browser.newContext()` 调用（包括未显式传 storageState 的手动调用）—— 这与 Playwright 文档关于 fixture 注入的隐式行为一致
- cookie 值 `LhAh2mxu...` 来源：可能是上游 viewer / admin 测试 refresh session 后通过 fixture pool 传递；也可能是 better-auth 中间件对某些请求刷新 session 后通过 fixture pool 传递
- **未做源码实证**（Playwright 1.62 fixture pool 注入路径的源码追踪需进一步）

### 修复方案（最小变动 + 标准化兜底）

#### 已落地：测试显式空 storageState（commit `bdcd900` test(e2e)）
- 2 个测试在 `browser.newContext()` 调用中**显式传** `storageState: { cookies: [], origins: [] }`：
  ```ts
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ```
- Playwright 1.62 文档推荐的"unauthenticated API call"模式，与 `test.use({ storageState })` 完全脱钩，强制清空 cookies/origins
- 不触动 handler：测试期望值不变（仍期望 401）
- 不触动 server / test infrastructure：纯测试代码改动

#### 未落地（根因排查）：登记 M23 阶段规划候选
- 按 ROI 排序：
  1. Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证（`packages/playwright/src/worker/fixtureRunner.ts` 追踪 test.use options 应用链）
  2. better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描（确认 session refresh 不会污染下游 context）
  3. Playwright 1.62 vs 1.61 / 1.60 fixture pool 行为对比（确认是 regression 还是历史行为）

### 教训

1. **Playwright 1.62 `test.use({ storageState })` 隐式传播**：`describe` 块内 `test.use({ storageState })` 配置可能通过 fixture pool 注入到该 scope 内所有 `browser.newContext()` 调用（包括未指定 storageState 的手动创建）—— 这是 Playwright fixture pool 的隐式行为，但**未在 Playwright 官方文档明确说明**
2. **"未认证 API 调用"测试必须显式空 storageState**：任何期望 401/403 的测试都必须传 `storageState: { cookies: [], origins: [] }`，避免上游 cookie 注入导致的认证通过问题
3. **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续测试的真实状态。M22.7 修复 global-setup 后才暴露 M22.8 真问题。**教训**：CI 修复需要走完整链路（global-setup → setup → tests → teardown），单一节点失败掩盖下游问题
4. **网络追踪是诊断关键**：trace.zip 中的 `context-options` + `network` 子文件包含完整 cookie / header / request 序列，是诊断"为什么认证通过"的唯一可靠证据

### 挂接治理检查点（待下批次会话处理）

1. **wisdom.md**：新增 1 条 pattern `pattern-playwright-browser-newContext-cookie-injection` —— Playwright 1.62 fixture pool `test.use` 隐式传播 + "未认证 API 测试"显式空 storageState 标准模式
2. **testing.md**：补充「e2e 未认证 API 调用测试」最佳实践章节 —— 必须显式传 `storageState: { cookies: [], origins: [] }`；新增 helper `tests/e2e/helpers/unauth-request.helper.ts` 抽取重复模式（audit suggest）
3. **backlog.md**：登记 M23 阶段候选 — Playwright 1.62 fixture pool test.use 注入路径源码实证

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（wisdom.md / testing.md 均无 Playwright 1.62 fixture pool 行为说明 + 未认证 API 测试标准模式）+ 第 4 条"工具/环境陷阱"（Playwright fixture pool 隐式行为是真实运行才能暴露的陷阱）。挂接治理检查点 3 项可降低未来同类"未认证 API 测试误通过"问题的修复成本 + 建立显式空 storageState 标准模式。
