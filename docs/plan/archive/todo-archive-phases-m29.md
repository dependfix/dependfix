# 待办事项归档分片 — M29

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-01 M34 归档批次预防性分片迁出：M34 段新增前主窗口 648 行 + M34 段新增将超 700 强制分片阈值；M29 是主窗口最早的完整段，按 [archive/index.md](../archive/index.md) §2「主窗口保留 3-5 个已归档阶段」迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

---

## M29: 修复交付链路正确性 + 能力扩展（M29.1~M29.9 全部已闭环 / 2026-09-27 归档）

> **归档日期**：2026-09-27
> **阶段摘要**：承接 M28 完整闭环后 backlog 候选池 + 2026-09-21 用户实测反馈（rss-impact-server PR #1095 / better-bytes 403）产出 6 个「评估完成待上收」候选（C71 / C72 / C73 / C75 / C77 / C78），用户明确授权方案 M29-B 启动 + vite 漏洞插队项并入。**6 核心候选 + 1 插队 hotfix + 2 衍生小条目**（M29.8 / M29.9 由 M29.1 的 D / A 阶段发现，经用户 2026-09-21 授权从 backlog 上收），覆盖 🛡️ 4 + 🚀 2 + 🎨 1 + 🛠️ 2，符合 [规划规范 §1.1 L12 类型平衡原则](../../standards/planning.md#11-硬性约束)（UX 1 项低于建议值 2，显式标注缺口）。
>
> - **M29.1** [P2 🛡️ 插队 hotfix] docs 依赖链 vite 漏洞治理（1 high + 2 moderate，全部落在 `docs>vitepress>vite`）—— §3.1 例外清单第 2 类
> - **M29.2** [P2 🛡️ 治本] C73 隔离宿主 git 全局配置对自动 commit 的污染（`commit.gpgsign`）
> - **M29.3** [P2 🛡️ 治本] C75 验证命令链纳入 test
> - **M29.4** [P2 🛡️ 治本] C77 override 曾被人工移除的复发防护
> - **M29.5** [P2 🚀 能力扩展] C78 区分 Dependabot alerts「确实未启用」与「获取失败」
> - **M29.6** [P2 🚀 能力扩展] C71 pnpm overrides 路径级覆盖（`parent>child`）支持
> - **M29.7** [P3 🎨 用户体验] C72 批量导入默认过滤 archived/disabled 仓库
> - **M29.8** [P3 🛠️ devEx] C79 ESLint 未忽略 VitePress 生成物（`docs/.vitepress/cache`）—— M29.1 衍生
> - **M29.9** [P3 🛠️ CI 治理] C80-A devDeps 链漏洞可见性（去 `--prod`）+ 失效引用修正 —— M29.1 衍生
>
> **关键决策 D1-D5**（2026-09-21 用户决策 + 2026-09-27 归档收口）：
>
> - **D1**：方案 M29-B（能力扩展加码）—— 6 核心候选 = 🛡️ 3（C73 / C75 / C77）+ 🚀 2（C78 / C71）+ 🎨 1（C72）；相较方案 A（C74 换 C71）保留 C71 作为跨 core + engine + platform 三层能力扩展
> - **D2**：vite 漏洞并入 M29 作 M29.1（§3.1 例外清单第 2 类插队项）—— 体积 1-2 commits，不参与 §1.1「核心任务 5-6 项」容量竞争
> - **D3**：ahead commits 不推送 —— 按 [AGENTS.md §5 推送禁令](../../../AGENTS.md) 等待用户主动推送
> - **D4**：全部 6 候选经 P 阶段 §3.4 三重交叉核验（todo-archive 表格 / git log / 代码侧 anchor）实测 0 命中，**0 项重复评估**（M27.1 教训防护）
> - **D5**：M29.1 衍生项上收 —— M29.8（C79 devEx 配置缺口）+ M29.9（C80-A CI 审计覆盖）经用户「评估影响后直接修复」授权上收；C80 剩余「阻断语义」决策留在 backlog
>
> **类型平衡复核**：
>
> - 🛡️ 技术债 / 治本：3 项（M29.2 / M29.3 / M29.4）+ 插队 1 项（M29.1）+ 衍生 2 项（M29.8 / M29.9）—— ✅ 满足
> - 🚀 能力扩展：2 项（M29.5 C78 / M29.6 C71）—— ✅ 满足
> - 🎨 用户体验：1 项（M29.7 C72）—— ⚠️ 低于建议值 2
> - 🛠️ devEx / CI 治理：2 项（M29.8 / M29.9）—— ✅ 衍生项补充
> - 🧪 测试覆盖：0 项独立条目 —— ❌ 缺口（各条目交付物内含定向测试补强）
>
> **ahead commits 实证**：M29 全部 35 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 实测 = 0）
>
> **状态**：✅ 全部完成（M29.1~M29.9 全部 9 原子条目共 **35 atomic commits 全部 ahead=0 已推送至 origin/master**；9 轮独立 Review Gate Pass）

### 阶段闭环清单

#### M29.1 插队 hotfix：docs 依赖链 vite 漏洞治理 ✅（2026-09-21 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **路径级 override 升至 6.4.3** | `694b85a`（fix(deps)） | `pnpm-workspace.yaml` overrides 段新增 `vitepress>vite: ^6.4.3`，lockfile 中 `vite@5.4.21` 实体消失，单条路径级覆盖同时修复 `@vitejs/plugin-vue` 边 |
| **验收闭环** | `aeb94c5`（docs(plan)） | `pnpm audit` 输出 `No known vulnerabilities found` + `pnpm --filter dependfix-docs build` EXIT 0 + docs dev 冒烟 200 + `pnpm lint`/`typecheck` 0 error |

#### M29.2 C73 隔离宿主 git 全局配置对自动 commit 的污染 ✅（2026-09-21 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **stageAndCommit 显式关闭签名** | `fd2280b`（fix(engine)） | `packages/engine/src/github/pr-creator.ts` `stageAndCommit` 追加 `-c commit.gpgsign=false`，直击根因且不改变其余宿主配置语义 |
| **回归 case 覆盖签名污染场景** | `47dbb61`（test(engine)） | 新增 4 case（`gpg.program` 不可用 / gpg 按 host 默认 / repo local `commit.gpgsign` / `-c` 不落盘 local config），沿用既有 `GIT_CONFIG_GLOBAL` 隔离测试范式 |
| **编号清理 + 闭环登记** | `c53100b` + `b271672`（docs(plan)） | 同文件既有孤立标记（`W1`/`W3`/`M18.2`/`M18.4`/`C22`）清理，保留带文档路径的导航指针；todo.md 勾选与 C82 登记 |

#### M29.3 C75 验证命令链纳入 test ✅（2026-09-21 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **唯一事实源收敛** | `fbed8e7`（refactor(engine)） | `DEFAULT_VERIFY_COMMANDS` 由 `verification-runner.ts` 导出，`helpers.ts` 副本删除改为导入 |
| **默认链纳入 test（install→lint→build→test）** | `b414312`（feat(engine)） | 顺序与超时策略在代码 JSDoc + 设计文档中明确；无 `test` 脚本优雅跳过（`SCRIPT_NOT_FOUND` 审计） |
| **真实端到端复现 ESM-only 破坏 CJS** | `b414312` 同 commit | 临时目录建 `esm-only-tla`（top-level await + export）+ `consumer.cjs`（require）→ `pnpm test` 失败 → verification action 失败 → `enforceVerificationGate` 阻断 + 真实 git 回滚 |
| **公开契约口径同步（14 文件 20 处）** | `e1d5695` + `09ebf46` + `0c66554`（docs） | action.yml / CLI help / README / 指南 / 设计 / standards / 资源包全覆盖；A 阶段第 2 轮 Reject 修复：改用结构化查询补齐措辞变体站点 |
| **闭环登记 + C83/C84 登记** | `8340c5e` + `765d260`（docs(plan)）| 验收清单全部 [x] + 既有失败基线限制登记 C83 + AI 质量门表述剔除 typecheck 登记 C84 |

#### M29.4 C77 override 曾被人工移除的复发防护 ✅（2026-09-22 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **保护名单（方案 B：用户显式维护）** | `4e3a2b5`（feat(engine)） | `overrideProtect` 中央配置 + `isOverrideProtected` 谓词 + `parseOverrideProtectEnv` 解析器（env 回退）；两条 override 路径（间接依赖 / 多版本）各自 case 覆盖 |
| **报告 / PR body 记录判定依据** | `4e3a2b5` 同 commit | `allErrors` 记 `OVERRIDE_PROTECTED`（含命中模式）进报告 Errors 区；FixAction 记 `strategy: override-protected` + `noOp: true` + 判定依据文本 |
| **审计修复（双重计数 / 设计文档失准 / 间接路径补测）** | `1a73abc`（fix(engine)）| A 阶段 1 轮 Reject 后修复：双重计数去重、设计文档口径同步、间接路径零覆盖补测 |
| **设计文档 + 闭环登记 + C85/C86/C87 登记** | `8626758` + `476f026`（docs）| `overrides-io.md` 设计文档 + todo.md 勾选 + repo-fix.ts max-lines warning 登记 C86 + 退出码跳过类条目登记 C87 + 目标仓库专属配置登记 C85 |

#### M29.5 C78 区分 Dependabot alerts 未启用与获取失败 ✅（2026-09-25 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **错误细分：403 + message 判定未启用** | `6fd6aad`（feat(engine)） | `errors.ts` 新增 `ALERTS_DISABLED`；`dependabot-fetcher.ts` 403 message 匹配 `Dependabot alerts are disabled`；`helpers.ts` 三个 hint 函数 + `repo-alerts.ts` 记录与语义区分 |
| **报告单列未启用计数 + 准确文案** | `6fd6aad` 同 commit | `RunSummary.reposWithAlertsDisabled` 单列计数 + `RunResult.alertsDisabled` 明细；日志输出"仓库未启用 Dependabot alerts（非 token 权限问题）" |
| **单测三类覆盖 + 口径同步 + 闭环登记** | `cb241bf` + `b801cef`（docs）| 未启用（403+message）/ 权限不足（401/403 其他）/ 限流（403+ratelimit）3 类 case；platform.md / ai-collaboration.md 口径同步；Code Scanning 同类混同拆独立候选 C89 留 backlog |

#### M29.6 C71 pnpm overrides 路径级覆盖支持 ✅（2026-09-25 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **core: NormalizedSecurityAlert 新增 dependencyPath** | `a2e3669`（feat(core)） | 可选字段 `dependencyPath?: string[]`，既有消费方 typecheck 0 error |
| **engine: pnpm-audit-fetcher 解析 findings[].paths[]** | `8d9315c`（feat(engine)） | 实测 `pnpm audit --json` 格式为准（顶层仅 `advisories` + `metadata`，链路在 `advisories[].findings[].paths[]`），双格式解析 case 通过 |
| **engine: buildVersionedOverrides / overrides-io 路径级写入** | `4e04090`（feat(engine)）| `parent>child` 写入 + 与顶层覆盖协同取 max + 写入回滚 case 通过 |
| **core: 报告 §4 Repositories 渲染 dependencyPath** | `e83347a`（feat(core)） | 报告建议区块展示依赖链 |
| **单测覆盖路径级场景 + 闭环登记** | `bb38f4d` + `ee56de8` + `f9aee76`（test + docs）| 路径级 override 写入回滚 + 顶层协同 case + 多 major 锁定行为 case + todo.md 勾选 |

#### M29.7 C72 批量导入默认过滤 archived/disabled 仓库 ✅（2026-09-26 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **importable.get.ts 后端硬过滤（方案 B）** | `bb6c1b6`（feat(platform)） | `archived === true` || `disabled === true` 剔除；`selectableFilteredRepos` 已剔除；`importable.get.test.ts` 新增 case |
| **i18n 双语键同步 + e2e 适配** | `bb6c1b6` 同 commit | `zh-CN.json` / `en-US.json` 无新增键（复用既有过滤标签）；`batch-import-filters.e2e.test.ts` 注释同步覆盖点说明 |
| **闭环登记** | `97ce433`（docs(plan)） | todo.md 验收标准全部 [x] |

#### M29.8 C79 ESLint 未忽略 VitePress 生成物 ✅（2026-09-21 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **root + docs 双层 ignores 补全** | `3d34132`（chore(lint)） | root `eslint.config.js` 补 `docs/.vitepress/cache/**` + `docs/.vitepress/.temp/**`；`docs/eslint.config.js` 补 `.vitepress/.temp/**` |
| **复现路径实证 + 闭环登记** | `d5558d2`（docs(plan)） | `vitepress dev` 生成缓存后 `pnpm lint` 仍为 0 error / 3 warning baseline；探针双向对照通过 |

#### M29.9 C80-A devDeps 链漏洞可见性（去 `--prod`）+ 失效引用修正 ✅（2026-09-21 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **workflow audit 去 `--prod` 覆盖 prod + devDeps** | `70d31c0`（ci(test)） | `.github/workflows/test.yml` `pnpm audit --audit-level=moderate || true`；注释口径精确化（区分 version updates vs security alerts + 注明阻断语义未启用） |
| **ai-collaboration.md 失效引用修正** | `c214ace`（docs(standards)） | §1.5 引用「C60/C61 RG-B04」改指 backlog C80 |
| **闭环登记** | `d5558d2`（docs(plan)） | YAML 语法校验 + audit 实跑 `No known vulnerabilities found` + `check:docs`/`lint:md:check`/`typecheck` 通过 |

### 阶段治理记录

- **提交序列**：M29.1（`694b85a` → `aeb94c5`）→ M29.2（`fd2280b` → `47dbb61` → `c53100b` → `b271672`）→ M29.3（`fbed8e7` → `b414312` → `e1d5695` → `09ebf46` → `8340c5e` → `0c66554` → `765d260`）→ M29.4（`4e3a2b5` → `73baffa` → `8626758` → `476f026` → `1a73abc`）→ M29.5（`6fd6aad` → `cb241bf` → `b801cef`）→ M29.6（`a2e3669` → `8d9315c` → `4e04090` → `e83347a` → `bb38f4d` → `ee56de8` → `f9aee76`）→ M29.7（`bb6c1b6` → `97ce433`）→ M29.8（`3d34132` → `d5558d2`）→ M29.9（`70d31c0` → `c214ace` → `d5558d2`）共 **35 commits 全部 ahead=0 已推送至 origin/master**
- **审计覆盖**：9 轮独立 Review Gate（M29.3 standard depth + M29.4 standard depth Round 2 + 其余 7 轮 quick depth），全部 Pass；含 M29.3 A 阶段第 2 轮 Reject（口径复扫漏掉逐命令反引号/简写形态）+ M29.4 A 阶段第 1 轮 Reject（双重计数/设计文档失准/间接路径零覆盖）后补修闭环
- **关联升级**：M29.2 同根因 push 侧隔离登记 C82 + 签名 opt-in 登记 C82 与 C74 互引；M29.3 既有失败基线登记 C83 + AI 质量门表述剔除 typecheck 登记 C84；M29.4 repo-fix.ts max-lines 登记 C86 + 退出码跳过类条目登记 C87 + 目标仓库专属配置登记 C85；M29.5 Code Scanning 同类混同拆 C89 留 backlog
- **历史教训**：M29.3 口径同步教训——结构化查询驱动而非措辞驱动；M29.4 审计教训——双重计数/设计文档失准/间接路径零覆盖三类典型缺陷；M27.1 重复评估教训已 M29 前置交叉核验防护
- **本阶段归档批次衍生治理**：planning.md §4.4 第 11 条规则强化（§已知边界段部分闭环处理指引，M28.1 已落地）+ ai-collaboration.md §1.7 阶段启动重复评估自检流程（M27.5 D5 已落地）+ wisdom.md governance check point「阶段启动必须对照 todo-archive.md 最近 3 个阶段表格 + commit history + 实际代码状态三重交叉核验」（M27.5 D5 已落地）
