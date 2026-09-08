# 经验归档分片（§22 - §28）：CI 环境与 monorepo 拆包（§二十二 - §二十八）

> 本分片从 [experience-archive.md](./experience-archive.md) §准入标准 分流而出（7 章，~114 行）。章节编号全局唯一，跨文件保持稳定；外链引用按 §编号 命中，与主窗口一致。

---

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
