# 经验归档分片（§36 - §40）：工具链与编码陷阱（§三十六 - §四十）

> 本分片从 [experience-archive.md](./experience-archive.md) §准入标准 分流而出（5 章，~76 行）。章节编号全局唯一，跨文件保持稳定；外链引用按 §编号 命中，与主窗口一致。

---

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
