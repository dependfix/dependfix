# 待办事项归档分片 — M32

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-08 M37 归档批次预防性分片迁出：M37 段新增后主窗口完整段将达 6 个，超 [archive/index.md](../archive/index.md) §2 定义的「3-5 个已归档阶段」上界；M32 是主窗口最早的完整段，按该健康策略预防性迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

---

## M32: 能力扩展优先（M32.1~M32.5 全部已闭环 / 2026-09-30 归档）

> **归档日期**：2026-09-30
> **阶段摘要**：承接 M31 完整闭环归档后的 backlog 候选池，2026-09-29 用户决策方案 B（能力扩展优先）从「评估完成待上收」候选中上收 5 项。按类型平衡原则选取 **5 原子条目（🚀 3 + 🛡️ 1 + 🧪 1**；🎨 纯 UX 无独立条目，缺口显式标注，与 M28-M31 同型）。目标：把「平台侧配置能力 / 目标仓库配置生态 / 告警口径对齐」三类能力补齐，同时收口一处交付链路治本项（git 签名污染）与一处视觉兜底缺口（像素级回归缺失）。
>
> - **M32.1** [P3 🚀] C76 平台侧暴露验证命令配置（每仓库 `verifyCommands` 字段 + 前缀感知 migration + 写入链路审计留痕 + 仓库表单 UI + e2e）—— `0c79845` + `1da2774` + `6e5c86a` + `0e5b21e` + `95935e1` + `3146278`
> - **M32.2** [P3 🚀] C85 目标仓库专属配置 `.github/dependfix.yml`（本地检出读取 + zod 校验 + 中央优先合并 + 降级矩阵）—— `40ac252` + `240704f` + `e68d62d` + `a87994a`
> - **M32.3** [P3 🚀] C89 Code Scanning / Code Quality「未启用」与「获取失败」区分（共用映射层 403 判定 + 源感知文案 + 报告指引源无关）—— `00a11ff` + `c7e5cce` + `0a9516e` + `a74767a`
> - **M32.4** [P3 🛡️] C82 git 签名语义边界（单一事实源常量 + 4 处 push 调用点隔离 + 不提供 opt-in）—— `f6150b0` + `2203f0b` + `06fc361` + `69c858c` + `261ec5e`
> - **M32.5** [P3 🧪] C92 apps/platform 视觉回归最小集（独立 config / 独立库 / 7 张入仓库基线 / 独立 CI job / 基线说明）—— `114611f` + `ec3d236` + `cddeda2` + `1969ad5` + `589db12` + `01aa519` + `35743e0`
>
> **commit 数量实证**：M32 原子条目内容 commits = **26**（M32.1 6 + M32.2 4 + M32.3 4 + M32.4 5 + M32.5 7，逐项见上方列表，`git log master --first-parent --oneline` 去重统计）+ 1 merge commit `300e833`（合并远端 dependabot bump `8176827`，非本阶段内容）；阶段启动 2 commits（`6315119` C92 候选登记 + `f3e6423` M32 阶段启动与候选上收）已推送 `origin/master`。
>
> **关键决策（P 阶段裁定，2026-09-29）**：
>
> - **M32.1**：C76 配置粒度 = 每仓库 `Repository` 字段（需 TypeORM migration）
> - **M32.2**：C85 路径 + 冲突优先级 = `.github/dependfix.yml`、**中央配置优先**（防目标仓库绕过保护策略）
> - **M32.3**：C89 错误码口径 = 复用 `ALERTS_DISABLED` + source 区分（不新增独立码）
> - **M32.4**：C82 = 不提供签名 opt-in（仅 push 隔离 + 记录决策依据）
> - **M32.5**：C92 = 入仓库基线 + 独立 CI job
>
> **类型平衡复核**：🚀 能力扩展 3 项（M32.1 / M32.2 / M32.3）✅ / 🛡️ 技术债 1 项（M32.4）✅ / 🧪 测试基建 1 项（M32.5）✅ / 🎨 用户体验 0 项 —— ⚠️ 缺口显式标注（候选池无 UX 类候选；M32.5 兼作视觉层兜底）
>
> **关键实证**（细节见各条目闭环记录与相关规范文档）：
>
> - **M32.1**：平台侧 `commands` 透传点全仓唯一（`container-executor`）；空数组必须归一为 `undefined`（引擎 `!customCommands` 判定陷阱）；早期 7 个 migration 表名前缀不统一 → 新迁移改**前缀感知**；`repos.vue` 触达 max-lines → 弹窗拆出 `repo-form-dialog.vue`
> - **M32.2**：读取走工作区本地文件（**不走 contents API**：省配额 / 免 base64 / CLI·平台·Action 三路径同一实现）；降级矩阵含非普通文件（**不跟随符号链接**）/ 256 KiB 上限 / 原型链风险键（须在 zod **之前**过滤）/ 未知键 `Object.hasOwn`；构造期单次赋值保持 `readonly` 单一 config 来源
> - **M32.3**：三个 fetcher 共用 `mapGitHubError` → 403 判定集中在该层（不下沉到各 fetcher）；官方文档不给 403 文案 → 「产品名片段 + 状态否定词」双片段容忍匹配 + 匹配失败退 `PERMISSION_DENIED`；未启用分支按源记录与提示（原硬编码 Dependabot 会误导）
> - **M32.4**：宿主 `push.gpgSign=true` 同样污染 `git push --delete`；全仓恰 **4 处**推送调用点；隔离参数收敛为单一常量 `GIT_*_SIGNING_ISOLATION_ARGS`；「不提供 opt-in」策略与重开条件记入 [git.md §3.8](../../standards/git.md)
> - **M32.5**：视觉基线须**独立库 + 冻结时间戳**（e2e 库被用例累积写入 → 基线必然漂移）；绝对像素阈值 200 的**灵敏度边界**（≤200px 面积的颜色改动不触发；改组件库主题 token 命中 5/7 亮色用例）；CI job 初期非阻断 + **可判定转正条件**（首个 ubuntu-latest 全绿 run）
>
> **未完成项 / 已知边界**（均登记 backlog，不随本阶段闭环）：
>
> - C93 视觉回归 `pr-checks` 行级覆盖（fixtures 端点扩展 prChecks）
> - C94 视觉回归 `alerts` 宽表右端列盲区（1440 视口横向溢出）
> - 视觉回归 CI job 初期非阻断（**已 2026-09-30 M33.2 转阻断**：`.github/workflows/test.yml` 移除 `continue-on-error`，依据 run `36602407382` job conclusion = success）
> - 平台早期 migration 表名前缀不统一（已知边界，待治理）
> - `apps/platform/.output` 不随根构建脚本重建（操作提醒）
>
> **审计**：A 阶段覆盖全部 5 原子条目 —— M32.1（deep + standard 第 1 轮两分区均 Reject → 修复 → 第 2 轮 Pass）；M32.2（deep + deep 双 Pass → 修复 → standard 复审 Pass）；M32.3（deep + standard 双 Pass，0 blocker）；M32.4（deep + deep 双 Pass，无 blocker）；M32.5（standard Pass + deep Reject（RG-B1 基线说明缺失）→ 修复 → standard 复审 Pass）。
>
> **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 归档时实测 = **27**（26 原子条目内容 commits + 1 merge commit `300e833`；阶段启动 2 commits 已在 `origin/master`），归档时为本地 ahead，待用户推送确认。
>
> **关联**：[roadmap.md §M32](../roadmap.md#m32-能力扩展优先2026-09-29-用户决策方案-b--2026-09-30-已闭环--归档) + [backlog.md](../backlog.md)（C93 / C94 / 视觉 CI 转阻断待办等本阶段衍生候选）+ [archive/index.md](index.md)
