# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。
> 主窗口保留最近 3-5 个已归档阶段摘要；早期阶段归档分片见 [archive/](archive/)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。
- 早期阶段分片：
  - [M0 / M1](archive/todo-archive-phases-m0-m1.md)（2026-08-07 迁出，115 行）
  - [M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5](archive/todo-archive-phases-m2-m55.md)（2026-08-14 迁出，T906 执行，398 行）
  - [M6 / M7.1 / M7.2 / T711 / M8](archive/todo-archive-phases-m6-m7-t711.md)（2026-08-20 neat-freak 归档批次迁出，293 行）
  - **M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次（含 C53-后-A/B/C 衍生子任务）**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（2026-08-20 迁出）
  - **M10 / T912 / C53 / 2026-08-20 平台 UI 增强（C59-C61）**：[archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)（**2026-08-28 M16 归档批次同步迁出**——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略）
  - **M13**：[archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**——M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略）
  - **M14 + M15**：[archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（**2026-08-31 M19 归档批次预防性分片迁出**——M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值；M14 + M15 同源批次同期迁出，符合"主窗口保留 3-5 个阶段"健康策略）
  - **M16 + M17**：[archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)（**2026-08-31 M20 归档批次预防性分片迁出**——M20 段新增前主窗口 638 行 + M20 段预估 100-130 行将超 700 强制分片阈值，预防性迁出与 M19/M18/M17/M16 归档批次预防性迁出 M14/M15/M13/M12/M10 同源策略）
  - **M22**：[archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)（**2026-09-28 M30 归档批次预防性分片迁出**——M30 段新增前主窗口 682 行 + M30 段新增将超 700 强制分片阈值；M22 完整段迁出与 M19-M21 / M14-M15 / M16-M17 归档批次预防性迁出同源策略）

## 主窗口保留范围

- 主文档保留最近 3-5 个完整段的近线归档块（当前 5 个，处 [archive/index.md §2](archive/index.md) 定义区间上界：M32 完整段 + M31 完整段 + M30 完整段 + M29 完整段 + M23 完整段，按时间倒序排列在顶部）+ 早期阶段指针段；各阶段 ahead 状态以各段 commit 列表 + `git rev-list HEAD ^origin/master --count` 实证为准，不写死具体数字。**预防性分片同步记录**：M28.6 归档批次（2026-09-11）已预防性迁出至 [archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)；M26 已于 2026-09-10 M26 归档批次迁出至 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)；M24 / M25 已于 2026-09-08 迁出至 [archive/todo-archive-phases-m24.md](archive/todo-archive-phases-m24.md) + [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)；M19 / M20 / M21 已于 2026-09-10 M26 归档批次预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)；M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)；M18 已于 2026-09-01 M22 归档批次预防性迁出至 [archive/todo-archive-phases-m18.md](archive/todo-archive-phases-m18.md)；M22 已于 2026-09-28 M30 归档批次预防性迁出至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)。
- **2026-09-30 M32 归档批次**：M32 段（5 原子条目 **26 commits** 实证见 [commit 数量](#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档) + 1 merge commit `300e833`）新增至主窗口顶部；阶段启动 2 commits（`6315119` + `f3e6423`）已在 `origin/master`，M32 原子条目 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证）。主窗口保留范围相应调整为 **M32/M31/M30/M29/M23 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）+ M27/M26 指针段；段新增后主窗口 655 行，**未触及 700 强制分片阈值**（位于 [archive/index.md §1](archive/index.md) 定义的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M31` → `M0-M32` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-09-27 M29 归档批次**：M29 段（9 原子条目 35 atomic commits = **35 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M29/M28/M27/M26/M23 共 5 个阶段（M22 完整段于 2026-09-28 M30 归档批次预防性迁出，见下条）。
- **2026-09-28 M30 归档批次**：M30 段（6 原子条目 7 commits + 2 docs 收口 + 6 衍生治理 = **15 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M30/M29/M27/M26/M23 共 5 个阶段；**M22 完整段随 M30 新增预防性迁出**至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)（M30 段新增前主窗口 682 行 + M30 段新增将超 700 强制分片阈值）。
- **2026-09-29 M31 归档批次**：M31 段（6 原子条目 **17 commits** 实证见 [commit 数量](#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档) + 1 启动决策 commit `a05ac3b`）新增至主窗口顶部；其中 M31.1-M31.4（11 commits）已推送 `origin/master`，M31.5-M31.6（6 commits）归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证）。主窗口保留范围相应调整为 **M31/M30/M29/M23 共 4 个完整段** + M27/M26 指针段；段新增后主窗口 607 行，**未触及 700 强制分片阈值**（位于 [archive/index.md §1](archive/index.md) 定义的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M30` → `M0-M31` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md`）。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-08-31 M19 归档批次预防性迁出 M14 + M15 至新分片 `todo-archive-phases-m14-m15.md`）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 当时待推送（后续已推送 origin/master）：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期落地（后续已推送 origin/master；ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

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
> - **M32.4**：宿主 `push.gpgSign=true` 同样污染 `git push --delete`；全仓恰 **4 处**推送调用点；隔离参数收敛为单一常量 `GIT_*_SIGNING_ISOLATION_ARGS`；「不提供 opt-in」策略与重开条件记入 [git.md §3.8](../standards/git.md)
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
> **关联**：[roadmap.md §M32](roadmap.md#m32-能力扩展优先2026-09-29-用户决策方案-b--2026-09-30-已闭环--归档) + [backlog.md](backlog.md)（C93 / C94 / 视觉 CI 转阻断待办等本阶段衍生候选）+ [archive/index.md](archive/index.md)

---

## M31: apps/platform UI 组件库迁移（PrimeVue → caomei-ui）（M31.1~M31.6 全部已闭环 / 2026-09-29 归档）

> **归档日期**：2026-09-29
> **阶段摘要**：承接 M30.6 V1-V3 迁移可行性验证全绿（caomei-ui 0.3.0 关键路径能力由库侧闭环），2026-09-28 用户决策方案 B 启动迁移主线（B0→B3 串行）+ C90 测试补强。按类型平衡原则选取 **6 原子条目（🎨 3 + 🛡️ 2 + 🧪 1**；🚀 / 📚 无独立条目，显式标注缺口）。目标：把 `apps/platform` 从 PrimeVue 栈迁到 caomei-ui 0.3.0（精确锁定），卸载 5 个 PrimeVue 依赖，消除「PrimeVue 4.x 冻结 / 5.x 转商业许可」升级路径风险并与多下游统一组件库。
>
> - **M31.1** [P2 🛡️] B0 迁移基线与双库并存接线（`caomei-ui/nuxt` 注册 + token 映射 + 主色实底 teal-700 对比度实测 5.47:1 + 视觉基线）—— `73945a8` + `bedf23b`
> - **M31.2** [P2 🎨] B1a DataTable 核心页迁移（alerts 行分组 / 折叠 / 多列排序降序优先 + batch-runs 行展开 + e2e 选择器改写）—— `69ecad1` + `a80fbed` + `6715221`
> - **M31.3** [P2 🎨] B1b 其余表页全量迁移（实际范围按用户裁定扩为全部剩余表页与表子组件：13 vue / 11 e2e；含密度 / 对比度 / 列宽三项口径落地）—— `5019c9f` + `1199c07` + `c843953` + `14610c5`
> - **M31.4** [P2 🎨] B2 表单 / 浮层 / 导航组件全量切换 + i18n / Toast / Confirm 接线（49 文件；顺带修复 `pr-checks` 的 `useToast` 无 Toast 根挂载与全选断言失效两处既有缺陷）—— `f9f1a05` + `efa5df7`
> - **M31.5** [P2 🛡️] B3 收尾：卸载 5 个 PrimeVue 依赖 + 代码侧引用归零 + 全量回归 + 包体对比 + 文档同步 + B4 视觉遗留 8 项裁定落定（client gzip −59.8%）—— `406fd1f` + `da4f7af` + `5fcdef5`
> - **M31.6** [P3 🧪] C90 db-restore ESM mock 受限失败分支补测（真实文件系统故障注入 + 自检注入点，`it.skip` 清零）—— `3ebb11d` + `1a62656` + `3c75bb8`
>
> **commit 数量实证**：`git log master --first-parent --oneline` 去重统计 = **17 commits**（6 原子条目）+ 1 启动决策 commit `a05ac3b`（M31 启动决策落地 todo/roadmap/backlog）
>
> **关键决策 D1-D3**（2026-09-28 用户裁定）：
>
> - **D1**：方案 B（迁移主线 5 原子 + C90 测试补强 1 原子）—— 迁移为阶段主线，追加 1 项测试补强平衡类型
> - **D2**：`--caomei-color-primary-solid` 覆盖为 `#0f766e`（teal-700）达 WCAG AA 4.5:1（实测 5.47:1）
> - **D3**：caomei-ui 精确锁定 `0.3.0`，避免 0.x API 漂移
>
> **类型平衡复核**：
>
> - 🎨 用户体验：3 项（M31.2 / M31.3 / M31.4）—— ✅ 满足
> - 🛡️ 技术债 / 治本：2 项（M31.1 / M31.5）—— ✅ 满足
> - 🧪 测试覆盖：1 项（M31.6）—— ✅ 满足
> - 🚀 能力扩展：0 项独立条目 —— ⚠️ 缺口显式标注（C85 / C89 等候选仍存 backlog）
> - 📚 治理 / 文档：0 项独立条目 —— ⚠️ 随 M31.5 收口（platform.md / tech-stack.md / 评估文档同步）
>
> **迁移期关键实证**（细节见 [caomei-ui-migration.md](../design/governance/caomei-ui-migration.md) §15.8-§15.13）：
>
> - 选择器 / 组件差异映射表（§15.8）+ 各批实证（§15.10 DataTable 核心页 / §15.11 其余表页 / §15.12 表单浮层导航 / §15.13 B3 收尾）
> - **包体对比**：client raw 3282.9 → 1219.4 KiB（−62.8%）、gzip 1044.5 → 419.5 KiB（−59.8%）；primeicons 字体与 svg 归零；仅 CSS +59.1 KiB（caomei 静态 theme.css vs PrimeVue CSS-in-JS 按需注入）
> - **B4 视觉遗留 8 项裁定**：1 项修复（`index.vue` spinner 恢复 40px）+ 7 项接受现状（附可回退路径）
> - **容器 e2e 环境要点**：`TMPDIR=/dev/shm`（overlayfs 上的 `/tmp` 会让 Chromium 默认 arg `--disable-dev-shm-usage` 触发 renderer `Page crashed`）
> - **零残留口径**：`rg -ni "primevue|primeicons|primelocale|primeuix" apps/platform/{app,server,tests,nuxt.config.ts}` = 0；样式选择器与运行时 import 同样归零；lockfile 无 prime 条目
>
> **未完成项 / 已知边界**：
>
> - 全仓非 `§` 形式历史编号标记（M31 触及文件内 40 处 / 8 文件）—— 建议独立治理批次处理
> - `.github/dependabot.yml` 的 `@primevue/*` / `primeicons` ignore 规则随卸载成为死配置 —— 建议后续治理批次移除
> - `caomei-ui` 处于 0.x：1.0 前 API 可能调整，升级须回归（依赖精确锁定 + 升级回归安排）
>
> **审计**：A 阶段覆盖全部 6 原子 —— M31.1-M31.3 quick Pass；M31.4（3 分区并行 deep/standard，第 1 轮 Pass + 第 2 轮 R1 Pass / R2 Reject→修复后关闭）；M31.5（2 分区并行：代码区 deep Pass / 文档区 standard Reject→修复后第 2 轮 Pass）；M31.6（standard Pass，含 mutation 实证断言有效性）。
>
> **ahead commits 实证**：M31 的 17 commits 中 M31.1-M31.4（11 commits）已推送 `origin/master`；M31.5-M31.6（6 commits）归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实测），待用户推送确认。
>
> **关联**：[roadmap.md §M31](roadmap.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui2026-09-28-用户决策方案-b--2026-09-29-已闭环--归档) + [backlog.md](backlog.md)（C88 / C90 上收后已移除）+ [archive/index.md](archive/index.md) + [caomei-ui-migration.md](../design/governance/caomei-ui-migration.md)（§15 全部实施期实证）+ [platform.md §7.1 / §7.4](../standards/platform.md)（接线约定）

---

## M30: 治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强（M30.1~M30.6 全部已闭环 / 2026-09-28 归档）

> **归档日期**：2026-09-28
> **阶段摘要**：承接 M29 完整闭环后遗留治理债（退出码 / 文件行数 / 文档对齐）+ UI 组件库迁移可行性验证 + GitHub App 身份接线 + db-restore 测试补强。2026-09-27 决策启动，按类型平衡原则选取 6 原子条目（🛡️ 2 + 🚀 1 + 📚 1 + 🧪 1 + 🔍 1 验证）。
>
> - **M30.1** [P2 🛡️ 治本] C87 跳过类审计条目退出码修正（`computeExitCode` 对跳过类 `category` 豁免，避免有意跳过常态红 CI）—— `41a13ab`
> - **M30.2** [P3 🛡️ 治本] C86 `repo-fix.ts` 行数拆分（抽出多版本 overrides 处理）—— `6923fdc`
> - **M30.3** [P3 📚 治理] C84 AI 质量门文档描述与实际验证链对齐（剔除 `typecheck`，4 文件 8 处）—— `21bf8bb`
> - **M30.4** [P2 🚀 能力扩展] C74 接线 `getCommitAuthor()`（仅 App 路径使用真实 bot 身份）—— `61acfae`
> - **M30.5** [P3 🧪 测试补强] db-restore 审计未采纳项补测（S-1 第 2/3/4 + S-2 第 1）—— `80dff3f`（**部分闭环**：2 分支因 ESM mock 受限 `it.skip`，残留登记 backlog C90）
> - **M30.6** [P3 🔍 可行性验证] 迁移前可行性验证 V1-V3（DataTable 核心交互 / 视觉基线 + 对比度 / E2E 选择器映射）—— `5eedcad` + `7be5b93`
>
> **关键决策 D1-D4**：
>
> - **D1**：M30.6 为前置阻塞项——V1-V3 验证门槛先行（全绿才可启动 M31），M30.1-30.5 并行推进（规划 `e7180c6`）
> - **D2**：M30.4 仅 App 路径接线，PAT 路径保持 M18.0 兼容性零变化（2026-09-27 用户决策）
> - **D3**：M30.5 遇 ESM 模块 mock 受限——两分支 `it.skip` + 显式 TODO 登记，不强行绕过（残留转 backlog C90）
> - **D4**：M30.6 V2 主色实底对比度结论——`--caomei-color-primary-solid` 需实施期覆盖为 `#0f766e`（teal-700）达 AA 4.5:1
>
> **类型平衡复核**：
>
> - 🛡️ 技术债 / 治本：2 项（M30.1 / M30.2）—— ✅ 满足
> - 🚀 能力扩展：1 项（M30.4）—— ✅ 满足
> - 📚 治理 / 文档：1 项（M30.3）—— ✅ 满足
> - 🧪 测试覆盖：1 项（M30.5，**部分闭环**）—— ✅ 满足
> - 🔍 可行性验证：1 项（M30.6）—— ✅ 满足
> - 🎨 用户体验：0 项独立条目 —— ⚠️ 缺口显式标注（M30.6 V2 含视觉 / 对比度内容）
>
> **衍生治理批次**（6 commits，由 M30.6 依赖链暴露的构建 / 安装阻塞驱动，未预登记为原子条目）：
>
> - `124078a` fix(deps) 显式赋值 vue-demi `allowBuilds` 占位串（pnpm 11 `ERR_PNPM_IGNORED_BUILDS` 阻断安装前依赖校验）
> - `644f9f0` fix(engine) 隔离 tsdown dts 共享 chunk 修复入口声明错位（`hash:false` 下 entry 与共享 chunk 争用 `index.d.mts`）
> - `9226ddd` refactor(engine) 抽分配置校验与错误提示模块治理 max-lines
> - `207a806` refactor(platform) 抽分批量扫描 composable 治理 `repos.vue` max-lines
> - `7458973` chore(lint) 清理未使用 slot props 与测试导入顺序告警
> - `32e3a8b` docs(plan) 登记 tsdown `hash:false` 冲突与 `.output` 重建已知边界
>
> **未完成项 / 已知边界**：
>
> - **M30.5 残留 2 分支**（恢复后 `integrity_check` 失败注入 / sidecar `unlinkSync` 部分失败 `removedSidecars` 状态一致性）—— ESM 模块 mock 受限，已登记 backlog C90（后于 2026-09-28 上收 [M31.6](#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)）
> - **M30.6 V1 验证产物保留**：`apps/platform/app/pages/__migration-validation/` 验证页 + `caomei-ui@0.3.0` 依赖保留，供 M31 迁移参考（M31 已于 2026-09-28 启动）
>
> **审计**：本归档批次经 A 阶段 code-auditor standard depth 审计（结论见本批次 commit message）。
>
> **ahead commits 实证**：M30 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。
>
> **关联**：[roadmap.md §M30](roadmap.md#m30-治理债清理--迁移可行性验证--能力扩展--测试补强2026-09-27-启动--2026-09-28-已闭环--归档) + [backlog.md](backlog.md)（C90 已上收 [§M31](#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)；C91 保留于 §规范与治理）+ [archive/index.md §5 批次登记](archive/index.md) + 经验归档（tsdown dts 冲突 / vue-demi allowBuilds / ESM mock 受限）

---

## M29: 修复交付链路正确性 + 能力扩展（M29.1~M29.9 全部已闭环 / 2026-09-27 归档）

> **归档日期**：2026-09-27
> **阶段摘要**：承接 M28 完整闭环后 backlog 候选池 + 2026-09-21 用户实测反馈（rss-impact-server PR #1095 / better-bytes 403）产出 6 个「评估完成待上收」候选（C71 / C72 / C73 / C75 / C77 / C78），用户明确授权方案 M29-B 启动 + vite 漏洞插队项并入。**6 核心候选 + 1 插队 hotfix + 2 衍生小条目**（M29.8 / M29.9 由 M29.1 的 D / A 阶段发现，经用户 2026-09-21 授权从 backlog 上收），覆盖 🛡️ 4 + 🚀 2 + 🎨 1 + 🛠️ 2，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)（UX 1 项低于建议值 2，显式标注缺口）。
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
> - **D3**：ahead commits 不推送 —— 按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 等待用户主动推送
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

---

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（M23.0+M23.1+M23.2+M23.3+M23.4 全部已闭环 / 2026-09-02 归档）

> **归档日期**：2026-09-02
> **阶段摘要**：承接 M22 闭环 + M22.7 hotfix（CI 33525721103 E2E global-setup ECONNRESET）+ M22.8 hotfix（CI 33533376712 未认证 API 测试 cookie 注入）衍生根因治理债 + [backlog.md §C66 告警视图增强](backlog.md)（2026-08-25 用户实测反馈"alerts UI 看不到 GHSA/CVE/rule 关键标识"）+ 测试基建清理。按"类型平衡"原则（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）拆 **5 原子条目独立闭环**：
>
> - **M23.0**（P2，🛡️ 治理）治理批次合并 G1+G2+G3 —— G1 M22 neat-freak 收敛（security.md §2.1 为 SQLite 防护规则权威完整声明，development.md §5.1.18 / platform.md §3.7 收敛为引用 + 仅保留差异化信息）；G2 wisdom 蒸馏阈值核验（实测 WISDOM_OK 17 ≤ 20 阈值已合规，无需新增蒸馏）；G3 wisdom 4 条 pattern 挂 standards（[code-auditor.agent.md 主责边界「构建产物 grep 兜底」必查项](../../.github/agents/code-auditor.agent.md) + [development.md §5.1.20 atomic commit 边界示例](../../docs/standards/development.md) + [ai-collaboration.md §4 PDTFC+ CI 偶发错误三阶段协议](../../docs/standards/ai-collaboration.md) + [testing.md §6.4 e2e 未认证 API 调用标准模式](../../docs/standards/testing.md)）
> - **M23.1**（P1，🛡️ 治理 / 治本）M22.7 ECONNRESET 根因排查 —— 从 backlog §E2E 段 4 候选按 ROI 排查 1 项落地候选 ③ SQLite WAL 模式 + `journal_mode=WAL` + `busy_timeout=5000ms` 治本（commit `2ffaa45` fix(platform)），helper 层 maxRetries 兜底保留不动
> - **M23.2**（P1，🛡️ 治理 / 治本）M22.8 fixture pool cookie 注入根因排查 —— 从 backlog §Playwright 段 3 候选按 ROI 排查 1 项落地候选 ① fixture pool `test.use → browser.newContext` 注入路径源码实证（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯）+ helper 抽取（`apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts`）
> - **M23.3**（P2，🚀 能力扩展 / UX）C66 告警视图增强 A1+A2+C+D 4 子任务 —— C66-A1 ScanResult ghsaId/cveIds 列 + 类级复合索引 + migration 1750000000000（§3b 教训）；C66-A2 NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher extractIdentifiers helper 透传；C66-C alerts.vue 独立 Identifiers 列（GHSA 优先 + 多 CVE 折叠 + fallback CVE + code-scanning 兜底）；C66-D reuseScanRunId + 立即修复入口（**已在 M16.2 闭环，不计入本批验收**——audit suggest 触发的提前抽取）
> - **M23.4**（P3，🧪 测试补强）cron-preview wall-clock 依赖消除 —— 用 `vi.setSystemTime` 写固定-now 用例 + 改写 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)`（cron-parser 实测返回可能值 8 或 160，强制两个分支都被覆盖）
>
> **阶段边界**：M23 严格遵循 [规划规范 §1.1 任务粒度约束](../standards/planning.md)（5 原子条目 ≤ 5-6 硬上限）+ 类型平衡（🛡️ 治理 1 + 🛡️ 治理/治本 2 + 🚀 能力扩展 1 + 🧪 测试补强 1）；不涉及 TypeORM 0.3.x 升级或 PostgreSQL 迁移（M24 候选）；不引入新依赖；不升级 better-auth / Nuxt；不动 M22.7 helper 层 maxRetries 兜底（保留兜底）+ 不动 M22.5/M22.6 双门控体系；C66-D 在 M16.2 已闭环（reuseScanRunId API + scan.post.test.ts 6 用例 + useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts）；C66-B 数据层去重暂缓（应用层去重已实施满足当前需求）。
>
> **非目标**：不重写 Dependabot 详情页；不立即支持自定义 advisory 来源（GitLab Advisory Database 等）；不破坏现有 fixStatus / 修复链路；不修改 better-auth 1.7 库内部逻辑（外部依赖）；不动 M22 hotfix 兜底（保留兜底修复 + 治本修复并存模式）。
>
> **状态**：✅ 全部完成（M23.0 + M23.1 + M23.2 + M23.3 + M23.4 全部 5 原子条目共 **17 atomic commits 全部 ahead=0 已推送至 origin/master**；9 轮独立 Review Gate Pass：M23.3 C66-C standard depth Round 1 Pass（0 blocker / 4 warning / 3 suggest）+ 其余 8 轮 quick depth Pass；含 C66-C standard depth Round 1 W1 typecheck 验证矩阵不完整 git stash 实证非本批引入 + W3 todo.md stale 已本批同步修正 + W4 i18n 9 语言声明错引已本批同步改为双语言现状）

### 阶段闭环清单

#### M23.0 治理批次（合并 G1+G2+G3）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **G1 M22 neat-freak 收敛** | `f8a8640`（docs(standards)） | security.md §2.1 为 SQLite 防护规则权威完整声明（§2.1.1-§2.1.5 五子节），development.md §5.1.18 + platform.md §3.7 第 1/2/3 条收敛为引用 + 仅保留差异化信息 |
| **G2 wisdom 蒸馏核验** | `35b9714`（docs(plan)） | `pnpm distill:wisdom --check` 实测 WISDOM_OK 17 ≤ 20 阈值已合规；wisdom.md header 文本"当前活跃条目 21 条"已 stale 登记 follow-up（本批次仅核验状态合规） |
| **G3 wisdom 4 条 pattern 挂 standards** | `606df17`（docs(standards+agents)） | code-auditor.agent.md 主责边界新增「构建产物 grep 兜底」必查项 + development.md §5.1.20 新增 atomic commit 边界示例 + ai-collaboration.md §4 PDTFC+ 补充 CI 偶发错误三阶段协议 + testing.md 补充 e2e global-setup + 未认证 API 调用标准模式 |
| **G3 commit hash 占位符填入** | `c265205`（docs(plan)） | G3 commit `?` → `606df17` 关联回填 |

#### M23.1 M22.7 根因排查（🛡️ 治理 / 治本）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **SQLite WAL 模式 + busy_timeout 治本** | `2ffaa45`（fix(platform)） | `PRAGMA journal_mode=WAL` + `busy_timeout=5000ms`（SQLite 默认 `journal_mode=delete` 切换为 WAL 模式；hold-tx 时长从 1s 提升到 5s） |
| **经验归档 §五十三 SQLite WAL 教训** | `74d3dd8`（docs(design)） | experience-archive.md §五十三 SQLite WAL 模式 + busy_timeout 治本 M22.7 ECONNRESET 根因候选 ③ 教训完整案例（症状 + 4 候选 ROI 排序 + P0 ③ 治本 + 剩余 3 候选待 CI 复现 + 4 条教训 + 3 项 governance check point） |
| **M23.1 验收闭环** | `9c56fe6`（docs(plan)） | todo.md §M23.1 验收清单全部 [x] + backlog.md §E2E 段部分关闭 + 候选 1/2/4 标注"待 CI 复现确认" |

#### M23.2 M22.8 根因排查（🛡️ 治理 / 治本）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **抽取 unauthenticatedApiContext helper** | `09c3dee`（test(e2e)） | `apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts` 新增（封装 `browser.newContext({ storageState: { cookies: [], origins: [] } })` 标准模式 + JSDoc 记录根因与修复路径）+ 2 处调用方统一重构 |
| **经验归档 §五十四 fixture pool 教训** | `e0f9b29`（docs(design)） | experience-archive.md §五十四 Playwright 1.62 fixture pool 跨 scope 隐式行为源码实证完整案例（workerProcessEntry.js + common/index.js + coreBundle.js 三处源码追溯）+ M23.2 helper 抽取教训（4 项教训 + 3 项 governance check point） |
| **M23.2 验收闭环** | `68b973d` + `aa76ad4`（docs(plan)） | todo.md §M23.2 验收清单全部 [x] + backlog.md §Playwright 段部分关闭 + 验收第 3 项 commit hash 关联 |

#### M23.3 C66 告警视图增强（🚀 能力扩展 / UX）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **C66-A2 NormalizedSecurityAlert 接口 + fetcher 透传** | `b6e7716`（feat(core,engine)） | packages/core/src/alerts/index.ts NormalizedSecurityAlert 接口扩展 `ghsaId?` + `cveIds?[]` + packages/engine/src/github/dependabot-fetcher.ts extractCveIds helper + packages/engine/src/alerts/pnpm-audit-fetcher.ts extractIdentifiers helper + 4 处测试断言新增 |
| **C66-A1 ScanResult ghsaId/cveIds 列 + 类级复合索引** | `f44a527`（feat(platform)） | apps/platform/server/entities/scan-result.ts 新增 2 列（ghsaId varchar(32) + cveIds text 存 JSON 序列化字符串）+ 类级复合索引 `@Index('idx_scan_result_repo_ghsa', ['repositoryId', 'ghsaId'])`（§3b 教训）+ migration 1750000000000 + reconcile INSERT/UPDATE 透传 |
| **C66-C alerts 视图独立 Identifiers 列** | `650a0d2`（feat(platform)） | apps/platform/app/pages/alerts.vue AlertView 接口扩展 ghsaId? + cveIds?[] + 新增独立 Identifiers 列在 ruleId 列前（GHSA 优先 → fallback CVE[0] → 多 CVE 折叠 +N → code-scanning/code-quality 兜底 —）+ 5 个 vitest describe 用例（默认响应含字段 / dependabot 透传 / pnpm-audit 透传 / code-scanning 兜底 / 多 CVE 数组）+ /api/alerts 透传 ghsaId + cveIds（DB JSON 字符串反序列化为数组）+ i18n zh-CN + en-US 加 colIdentifiers 键 |
| **C66-D reuseScanRunId + 立即修复入口** | M16.2 闭环（不计入本批） | reuseScanRunId API + scan.post.test.ts 6 测试用例 + useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts 完整链路 |
| **C66-C 经验归档 §五十五 + 验收闭环** | `9c64ee0`（docs(plan+design)） | experience-archive.md §五十五 M23.3 C66-C 完整案例（实施 + 关键设计 + 验证矩阵 + standard depth 审计 4 warning + 3 suggest + 5 项教训 + 3 项 governance check point）+ todo.md §M23.3 验收清单全部 [x] + W3/W4 stale 修正（C66-D 不计入本批 + i18n 9 语言改双语言现状） |
| **C66-C commit hash 回填** | `6e53616`（docs(plan)） | todo.md §M23.3 C66-C commit `?` → `650a0d2` + `9c64ee0` 关联回填 |

#### M23.4 测试补强（🧪 测试补强 / 治理收口）✅（2026-09-02 闭环）

| 子任务 | 关键 commit | 完成要点 |
|:--|:--|:--|
| **cron-preview.test.ts wall-clock 依赖消除** | `df4ba9b`（test(platform)） | `vi.setSystemTime` 写固定-now 用例断言 diffHours === 8（UTC 周六 14:00 now）+ 对照用例固定到 UTC 周日 18:00（Shanghai 周一 02:00 CST）断言 diffHours === 160（cron-parser 实测返回可能值 8 或 160）+ 改 `cron-preview.test.ts:89` 断言为 `expect(diffHours === 8 || diffHours === 160).toBe(true)` 强制两个分支都被覆盖 |

### 阶段治理记录

- **提交序列**：M23.0 治理批次（`f8a8640` → `35b9714` → `606df17` → `c265205`）→ M23.1 M22.7 根因排查（`2ffaa45` → `74d3dd8` → `9c56fe6`）→ M23.2 M22.8 根因排查（`09c3dee` → `e0f9b29` → `68b973d` + `aa76ad4`）→ M23.3 C66 告警视图增强（`b6e7716` + `f44a527` + `650a0d2` → `9c64ee0` → `6e53616`）→ M23.4 测试补强（`df4ba9b`）共 **17 commits 全部 ahead=0 已推送至 origin/master**
- **审计覆盖**：5 轮独立 Review Gate（M23.3 C66-C standard depth + M23.0 G1 + M23.1 + M23.2 + M23.4 quick depth），全部 Pass；含 C66-C standard depth W1 typecheck 验证矩阵不完整（git stash 实证非本批引入）+ W2 浏览器验证 sandbox chromium 限制（M22.7 同源）+ W3 todo.md stale 已本批同步修正 + W4 i18n 9 语言声明错引已本批同步改为双语言现状
- **关联升级**：M22.0 G1 neat-freak 收敛后 security.md §2.1 为 SQLite 防护规则权威完整声明；M22.1 治本 WAL 模式切到 §3b 类级复合索引支撑 dashboard 按 GHSA 维度查询；M22.8 hotfix 测试层 `storageState: { cookies: [], origins: [] }` 显式隔离保留兜底；M23.3 C66-C standard depth audit W1 monorepo source/dist 不一致教训合并到 wisdom.md 现有 `principle-Nitro-esbuild-process-env-NODE_ENV-静态替换-陷阱` 段（避免重复 pattern）+ 落地 AGENTS.md 提交规范第 6 条「build-before-commit」纪律
- **历史教训**：W1 audit typecheck 验证矩阵不完整——`pnpm exec tsc --noEmit` 通过 ≠ `pnpm run typecheck`（含 nuxt typecheck pipeline）通过；monorepo source-only 改动必须 `pnpm -r build` 重建 dist；W3 todo.md 验收清单 stale——D 阶段开工前 rg 实证依赖项实际状态（git 历史 + i18n locale 目录）避免基于 stale 描述定范围；W4 i18n locale 声明与现状不符——`ls apps/platform/i18n/locales/` 实证实际 locale 数量
- **阶段归档批次衍生治理**（本归档批次落地 3 项 governance check point）：
  1. **AGENTS.md 提交规范新增第 6 条「src/dist 不一致时 build 在先（monorepo 纪律）」**——commit 前实测 `pnpm run typecheck` exit 0；失败则第一动作是 `pnpm -r build` 而非修改源码
  2. **code-auditor.agent.md 主责边界新增「i18n locale 实际状态审计必查项」**——diff 涉及 todo.md / backlog.md / 设计文档声称"X 语言覆盖"时 audit 必须 `ls apps/platform/i18n/locales/` 实证实际 locale 数量
  3. **wisdom.md header 文本 stale 修正 + monorepo rebuild 教训合并到现有 `principle-Nitro-esbuild` 段**——避免与构建产物 / source vs dist 不一致教训重复登记

---

## M27: 用户体验 + 治理优先（M27.1+M27.2 W1+M27.3 W2+M27.4 W4+M27.5 全部已闭环 / 2026-09-10 归档）

> **2026-09-10 M27 归档批次迁出**：M27 段（5 原子条目 8 atomic commits 实施 + 3 docs 收口 commits = **11 commits**）已从 `todo.md` 主窗口迁入 [todo-archive.md §M27](#m27-用户体验--治理优先m271m272-w1m273-w2m274-w4m275-全部已闭环--2026-09-10-归档)。M27 段完整实施记录 / 关键经验 / 待迁移经验均在 git log 中可查。主窗口 [todo-archive.md §M27](#m27-用户体验--治理优先m271m272-w1m273-w2m274-w4m275-全部已闭环--2026-09-10-归档) 仅保留导航指针 + 关键 commit 实证。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M27](roadmap.md#m27-用户体验--治理优先2026-09-10-用户决策修订方案-b-1--2026-09-10-m271-重复评估修正--2026-09-10-已闭环--归档) + Milestone 概述表 M27 行状态更新（active → 已完成 2026-09-10 归档）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M27 行
> - **关键 commit 实证**：
>   - **M27 P 阶段启动**（1 commit）：`0ddd4e2` docs(plan): M27 阶段启动（修订方案 B-1）
>   - **M27.1 重复评估教训**（1 commit）：`596f71e` docs(plan): 更新 M27.1 重复评估教训及阶段启动决策前置交叉核验要求
>   - **M27.2 W1 stylelint**（2 commits）：`7888435` chore(platform): apps/platform 增配 stylelint + lint 系列 scripts + `ea0dbc6` docs(plan): M27.2 W1 apps/platform stylelint 闭环
>   - **M27.3 W2 logger**（1 commit）：`af07189` refactor(logger): 重构日志模块以支持可测性和初始化逻辑
>   - **M27.4 W4 container-executor**（1 commit）：`544e5a7` test(platform): 补齐 container-executor 单测恢复 branches 80% coverage gate
>   - **M27.5 ECONNRESET 候选 ① 诊断**（2 commits）：`b252f93` feat(platform): better-auth transaction trace 日志落地 + `45449314` docs(plan): M27.5 ECONNRESET 候选 ① follow-up 关闭
>   - **M27 启动相关 docs 收口**（3 commits）：`3f4b055` docs(plan): todo.md 清理为最小化骨架 + `4e54afd` docs(plan): backlog.md 清理已闭环条目 + `ed2d0ce` docs(plan): 归档 M26 阶段并预防性分片迁出 M19-M21
> - **ahead commits 实证**：M27 全部 11 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 实测）
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 `git log M27 启动前 ~` 关键 commit 链
>
> **状态**：✅ 全部完成（M27.1 + M27.2 W1 + M27.3 W2 + M27.4 W4 + M27.5 全部 5 原子条目共 **8 atomic commits 实施 + 3 docs 收口 commits = 11 commits**）
>
> **关键决策 D1-D5**：
> - **D1**：按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 5 原子（🚀 0 + 🛡️ 2 + 🧪 2 + 📚 教训治理 1）
> - **D2**（修正）：M27.1 重复评估错误归正 —— todo.md §M27 阶段启动 commit `0ddd4e2` 决策 D2 错误地把 C66-C / C66-D 归类为"未落地"；实际 C66-C 已在 M23.3 commit `650a0d2` 闭环 + C66-D 已在 M16.2 闭环（reuseScanRunId API + use-fix-now composable + alert-run-sidebar 按钮）；M27.1 修订为 1 docs(plan+governance) commit 修正状态（commit `596f71e`）
> - **D3**：W1 / W2 / W4 均为 quick depth（单 commit 模式）；M22.7 根因排查为 P1 优先（剩余 ECONNRESET 偶发根因）
> - **D4**：M22 neat-freak 收敛已 M23.0 G1 闭环（不在 M27 复用）；M22.7 根因 follow-up 中 ② Nitro h3 async generator + ③ Playwright 版本对比 + ④ fixtures API 节流留 backlog 后续批次
> - **D5**（新增）：M27 重复评估教训治理 —— 修订 planning.md §3.4「决策前置交叉核验」硬要求 + ai-collaboration.md §1.7「阶段启动重复评估自检」流程 + backlog.md C66 5 子任务现状明确标注 + experience-archive §六十四 完整教训 + wisdom.md governance check point「阶段启动必须对照 todo-archive.md 最近 3 个阶段表格 + commit history + 实际代码状态三重交叉核验」

---

## M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀（M26.1+M26.2+M26.3+M26.4a+M26.4b+M26.4c+M26.5 全部已闭环 / 2026-09-10 归档）

> **2026-09-10 M26 归档批次迁出**：M26 段（7 原子条目 23 atomic commits + 13 配套 commits = **36 commits 全部 ahead=0 已推送至 origin/master** / ~3240 行净增）已从 `todo.md` 主窗口迁入新分片 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)。M26 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口 [todo-archive.md §M26](#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) 仅保留导航指针 + 关键 commit 实证。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M26](roadmap.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀2026-09-08-用户决策方案-a--m264-拆分--m264c-e2e-适配--2026-09-10-已闭环--归档) + Milestone 概述表 M26 行状态更新（进行中 → 已完成 2026-09-10 归档）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M26 行
> - **关键 commit 实证**：
>   - **M26 P 阶段**：`0ad509c` ahead commits 实证（0 → 31）
>   - **M26.1 应用层**（10 commits）：`80138b1` `d7fb63b` `46ce342` `6ef2e27` `2fe6d1a` `b97babd` `8becb80` `a899a5c` `a461c4c` `4be6e52`
>   - **M26.2 C67 Resource owner 化**（4 commits）：`10af85c` `9ae7c2c` `531c252` `dc48c4a`
>   - **M26.3 C69 文档站 + 包 README 多语言 en-US P0**（7 commits）：`4dfd630` `1b43cf5` `d5e6786` `175c709` `bb61814` `b31f5a8` `a1f4357`
>   - **M26.4a primeicons 降级**（1 commit）：`7ce7803`
>   - **M26.4b lint baseline 治理**（4 commits）：`d02713a` `03e7dad` `7407ed8` `b6b52bb`
>   - **M26.4c e2e 适配**（5 commits）：`c37aac7` `be74d21` `6f26ae3` `79dfc6a` `0be2b2a`
>   - **M26.5 经验归档 + wisdom 蒸馏**（1 commit）：`6b01e35`
>   - **M26 配套治理 + docs 收口**（7 commits）：`a0bb647` `f482708` `dd33fac` `cab3710` `cd79724` `da0ebdf` `db50191`
>   - **CI Coverage 修复**（1 commit）：`a4a5680` fix(ci)
> - **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **0**（M26 全部 36 commits 已推 origin/master / 2026-09-10 实测）
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)
> - **2026-09-10 M26 归档批次预防性分片同步迁出 M19 / M20 / M21 三阶段**（主窗口 ≤ 700 强制分片阈值）—— 详见 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)

---

## M22: SQLite 数据保护防御加固（M22.1+M22.2+M22.3+M22.4+M22.5+M22.6 全部已闭环 / 2026-09-01 归档 → 2026-09-28 M30 归档批次预防性分片迁出）

> **2026-09-28 M30 归档批次预防性分片迁出**：M22 段（M22 沉淀 + 6 原子条目，13 commits，commits 已推送 `origin/master`）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)。M30 完整段新增前主窗口 682 行 + M30 段新增将超 700 强制分片阈值，触发预防性分片（与 M26/M28 归档批次同源策略）。

---
## M19: 治理 + 能力扩展 + 测试补强（M19.1+M19.2+M19.3+M19.4+M19.5 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M19 段（5 子任务 + 配套 7 commits ~12 commits 落地）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M26 完整段迁出主窗口后必须 ≤ 700 强制分片阈值，触发预防性分片。M19 / M20 / M21 三阶段同期迁出，保持主窗口 3-5 个阶段健康策略。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M19](roadmap.md#m19-治理--能力扩展--测试补强) + Milestone 概述表 M19 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M19 行
> - **关键 commit 实证**：`0c536c1` M19.1 / `c998d58` M19.2 / `5839771` M19.3 / `8db2fd4` M19.4 / `a20ea02` M19.5 + `ae33671` M19.x 收口 + `2f9eb38` `bee5c3f` `61b3ddc` `4231ffb` 配套
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环--2026-08-31-归档)

---

## M20: ScanResult 数据模型重构（M20.1+M20.3+M20.5+M20.6+M20.7 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M20 段（5 子阶段 8 commits）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M19 / M20 / M21 三阶段同期迁出，与 M26 完整段迁出同步推进。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M20](roadmap.md#m20-scanresult-数据模型重构) + Milestone 概述表 M20 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M20 行
> - **关键 commit 实证**：`acb2d35` M20.1 / `2e4ab1b` M20.3 / `170fee1` M20.5 / `c7ba014` M20.6 / `a399323` M20.7 + `ca6a1dc` M20.7 脚本精简
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)

---

## M21: 治理收口 + 能力扩展 + 测试补强（M21.1+M21.2+M21.4+M21.5 全部已闭环 / 2026-08-31 归档 → 2026-09-10 M26 归档批次预防性分片迁出）

> **2026-09-10 M26 归档批次预防性分片迁出**：M21 段（4 子阶段 11 atomic commits + 4 docs 收口 = 15 commits 全部 ahead=0 已推送 origin/master）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)。M19 / M20 / M21 三阶段同期迁出。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M21](roadmap.md) + Milestone 概述表 M21 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M21 行
> - **关键 commit 实证**：`0a83c74` `a77e557` M21.1 / `fe7cc0f` `ad376c8` `0903f06` `b6d8539` M21.2 / `f1dd5df` `beea5b9` `c9939cb` M21.4 / `9850e24` `b9e35f7` M21.5 + `a8604c6` `d66b11d` `6516e34` `cbcb15d` 文档收口
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)

---

## M18: 平台 GitHub App BYO App 模式（已归档 → 2026-09-01 M22 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m18.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)。

---


## M17: 安全与可用性收口（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)。

---

## M16: 平台可用性深化（已归档 → 2026-08-31 M20 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)。

---

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已归档 → 2026-08-30 M18 归档批次预防性分片迁出）

> **2026-08-30 M18 归档批次预防性分片迁出**：M13 段（12 子任务 / 26 commits / T1310 同步推进）已迁至新分片 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)。M18 段新增前主窗口 673 行接近 700 分片阈值，预防性迁出与 M16/M15 归档批次同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M18 归档批次新增后主窗口将超 700 强制分片阈值；M13 是 2026-08-26 闭环阶段（距今 4 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M13](roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档) + Milestone 概述表 M13 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M13 行
> - **关键 commit 实证**：T1301 `b57b8d8` / T1302 `f43edf1` / T1303 `c2e3d7b` `7282f65` / T1304 `25b46eb` / T1305 `0f08c40` `5269d0a` `9c79fc9` / T1306 `e3d93b7` `4447ff8` `2ae2a77` / T1309 `6023da8` `e9197c1` `1cb0364` `9b536e1` `56de1a1` / T1307 `792e8c8` `7b1ac01` `3cccce0` / T1308 `b0f6e84` `e63cdb9` / T1401 `2dce01d` / T1402+T1403 `bb3b49a` / T1310 `300b318` `1819b59` `733e198` `7b40a2c` `a74d07d`
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)

## M14: platform release 通道闭环 + UX 反馈跟进（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M14 段（4 子阶段 + M14.y 依赖批量治理，约 115 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M14 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md Milestone 概述表 M14 行](roadmap.md) + roadmap.md §M14 段历史上未单独列出（与 §M18 段缺失说明同模式 —— 2026-08-31 M19 归档批次校正）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M14 行
> - **关键 commit 实证**：T1310 `300b318` / `1819b59` / `733e198` / `7b40a2c` / `a74d07d` / `1fd38c1` / M14.1 收口 / M14.2 `81bd8d2` `581e1a9` `1a9eddf` 收口 + `17b5643` / M14.3 `5ccaaf4` / M14.x `92cc348` `ea0e24f` `84b4e1a` `b45f55e` / M14.y dependabot PR commits
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)

## M15: 扫描历史详情侧栏增强（UX-R2）（已归档 → 2026-08-31 M19 归档批次预防性分片迁出）

> **2026-08-31 M19 归档批次预防性分片迁出**：M15 段（1 子阶段 4 子任务，约 65 行）已从 `todo-archive.md` 主窗口迁至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)。M19 段新增前主窗口 699 行 + M19 段预估 80-100 行 = 779-799 行，超 700 强制分片阈值；M15 是 2026-08-26 闭环阶段（距今 5 天），按"主窗口保留 3-5 个阶段"健康策略迁出。M14 + M15 同源批次同期迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M15](roadmap.md#m15-扫描历史详情侧栏增强-ux-r2已完成-2026-08-26-归档) + Milestone 概述表 M15 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M15 行
> - **关键 commit 实证**：`5c65177` P 阶段 docs + `1112017` UX-R2 实施（5 文件 / +425/-12）+ `0a60e3d` test 覆盖（2 文件 / +251）+ `d517a7f` release.yml CI 修复（不计入 M15 总投入）
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)

---

## M12: 平台 UX 一致性 + i18n 治理（已归档 → 2026-08-28 M17 归档批次预防性分片迁出）

> **2026-08-28 M17 归档批次预防性分片迁出**：M12 段（19 commits / C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2）已迁出至新分片 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)。M17 段 152 行新增后主窗口接近 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略。主窗口不再保留完整实施记录，仅保留导航指针。
>
> **迁出触发**：todo-archive.md M17 归档批次新增 152 行后主窗口 ≈ 738 行 > 700 强制分片阈值；M12 是 2026-08-21 闭环阶段（距今 7 天），按"主窗口保留 3-5 个阶段"健康策略迁出。
>
> **关键导航**：
> - **backlog 历史归档指针段**：详见 [todo-archive.md](todo-archive.md)
> - **roadmap 状态**：[roadmap.md §M12](roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档) + Milestone 概述表 M12 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M12 行
> - **关键 commit 实证**：C65-A1 `1d7c5c8` / C65-A3 `b10e270` / C65-B1 `789ed2f` / C65-C1+C2 `5dff002` / C65-D1 `348502d` / C65-D2 `132b944` / C65-D3 `374a278` / C65-D4 `ad6ce70` / CI 修复 `0c57211` `4043918` / network-audit `2104b9f` `0eb8704`
> - **关键经验沉淀**：`docs/standards/platform.md §7.2` i18n 单点声明条款 + `docs/standards/development.md §3` 同模式扫描 + `docs/standards/git.md §3` F 阶段本地验证口径差异
> - **完整实施记录 / commit 引用 / 验证矩阵 / 关键决策 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)

---

---


## M8: 安全加固与容器执行完备（已归档 → 迁出至分片）

> **2026-08-20 neat-freak 归档批次迁出**：M8 段已迁至 [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8），不再在 todo-archive.md 主窗口保留。本条仅保留导航指针。
>
> **原始背景**：M8 阶段 6 任务（T801-T806）由 C38-C45 治理项驱动，20 个提交当时本地待推送。详见分片文档。

---


## C53 / M10 / T912 / 2026-08-20 平台 UI 增强（C59-C61）/ 2026-08-20 M11 推进批次（已归档 → 迁出至分片）

> **2026-08-28 M16 归档批次预防性迁出**：本节段 5 个早期批次（C53 / M10 / T912 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要）已迁至新分片 [archive/todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md) 与既有分片 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C 衍生子任务）。主窗口不再保留完整实施记录，仅保留导航指针与本批次归档背景说明。
>
> **迁出触发**：M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略。

| 批次 | 关键 commit 数 | 详情 |
|:--|:--:|:--|
| **C53** 平台集成模式 fix 修复结果推送远程 | 3 commits（`83ec736` / `46b7c15` / `3ed8303`） | [分片 §C53](archive/todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档)（含 C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序；衍生子任务 C53-后-A/B/C 在 [archive-phases-m11.md](archive/todo-archive-phases-m11.md) §M11 推进批次） |
| **M10** 独立沙箱容器 C26 实施规划 | 13 commits（T1001 B1+B2 + T1002 + T1003 + T1004） | [分片 §M10](archive/todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档)（含 Docker rootless + 出站白名单代理 + cgroup v2 资源限制 + 文档收口） |
| **T912** SMTP 邮件发送器主体收口 | 3 commits（`edc9c94` / `6f00937` / `6e28207`） | [分片 §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t912-3--c28-联动)（T912-3 合并入 C28） |
| **2026-08-20 平台 UI 增强**（C59-C61） | 10 commits（C59 `9949504` + `03ba3b2` / C60 `a1d5bd9` `532ea78` `6b994b5` `5bba3f4` `5fbad71` / C61 `ffacfca` `5abd914` `402dc03`） | [分片 §2026-08-20 平台 UI 增强](archive/todo-archive-phases-m10-c53-c59c61.md#2026-08-20-平台-ui-增强c59--c60--c61)（C59 mixin 修复 + C60 sortable + C61 dashboard 图表） |
| **2026-08-20 M11 推进批次** | 22 commits（M11 推进批次 12 + M11 启动批次 10） | [分片 §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)（C53-后-A/B/C + T1005-A/B/C/D + C28 + C56/C57 + C58 + C-ENV-CHANGE-ALERT） |

---


## M24: PR Check MVP + 治理债 + 测试补强 + 用户体验（M24.1+M24.2+M24.3+M24.4+M24.5 全部已闭环 / 2026-09-03 归档）

> **2026-09-03 M24 归档批次预防性分片迁出**：M24 段（5 原子条目 12 commits / ~2960 行净增 / 方案 B 能力突破优先）已从 `todo-archive.md` 主窗口迁出至新分片 [archive/todo-archive-phases-m24.md](archive/todo-archive-phases-m24.md)。M24 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口仅保留导航指针（与 M18 / M17 / M16 / M13 同源策略）。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M24](roadmap.md#m24-pr-check-mvp--治理债--测试补强--用户体验) + Milestone 概述表 M24 行
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M24 行
> - **关键 commit 实证**：`36ee026` PRCheck 实体 / `1068d6e` service + scheduler / `89e1344` API + i18n / `e841b82` UI / `19037d5` UI follow-up / `4803372` UI 重构 / `7120533` Phase 5 docs / `bbb8f30` M24.2 根因 / `ad1ab17` CI 修复 / `a0be125` M24.3 cron-preview / `aaf8e7b` M24.4 治理债 / `7c926a9` Wisdom 蒸馏
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m24.md §M24](archive/todo-archive-phases-m24.md)


## M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline 治理 + M24 follow-up 工具化（M25.1+M25.2a+M25.3+M25.4 全部已闭环 / 2026-09-08 归档）

> **2026-09-08 M25 归档批次迁出**：M25 段（4 原子条目 17 commits / ~1821 行净增 / 方案 A 治理优先 + 能力扩展 + 测试补强）已从 `todo.md` 主窗口迁入新分片 [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)。M25 段完整实施记录 / 关键经验 / 待迁移经验均在分片中。主窗口 todo.md 仅保留导航指针（与 M24 归档批次同源策略）。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md](roadmap.md)（Milestone 概述表 M25 行 + §M25 段已新增详细实施状态段）+ 状态更新：M25 行从「进行中」→「**已完成**（2026-09-08 完整闭环 4 原子条目 17 commits / ~1821 行净增；ahead=17（2026-09-08 当时实测，后续已推送 origin/master））」
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M25 行
> - **关键 commit 实证**：`9bf640c` §1.4 规范修正 / `482438d` 方案 A 规划 / `35e4935` PrimeUI License 降级 / `4c51d19` platform.md §3.7 同步 / `1c65582` 数据模型 / `f174cce` Schema+Service / `7250ec1` 三执行器透传 / `49480a6` typecheck 修复 / `782fa27` M25.2a 收口 / `57f3b88` baseline lint 修复 / `4030f3b` packages/cli 修复 / `c88379e` M25.3 收口 / `80912c2` i18n-anchor-check / `65a8ec1` zod-helpers / `66c02ff` M25.4 收口 / `3947279` 锚点修正 + `4818e5d` M25.1 收口
> - **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **17**（2026-09-08 当时实测，后续已推送 origin/master）
> - **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)

---

## M28: 治理债清理 + 能力扩展（M28.1-M28.5 全部已闭环 / 2026-09-11 归档）

> **2026-09-11 M28.6 归档批次迁出**：[archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)（**指针段模式**——M28 完整实施记录承载于 roadmap.md §M28 段，主窗口仅保留导航指针 + ahead commits 关联表 + 关键决策 D6；与 M26/M27 归档批次同源策略）
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M28](roadmap.md#m28-治理债清理--能力扩展2026-09-11-用户决策方案-m28-a--m281-重编号--m286-归档已落地)（Milestone 概述表 M28 行状态已更新：**已完成** + §M28 段已新增 D6 决策增补 + ahead commits 关联表）
> - **archive 索引**：[archive/index.md §4 当前基线](archive/index.md) + §5 近期归档批次登记 M28 行
> - **todo.md 同步**：[todo.md](todo.md)（当前无活跃阶段；M28 已归档，下一阶段启动待用户明确决策）
> - **backlog.md 同步**：M28 候选 C14 / C33 已 M28.6 归档批次同步清理；C15 第二阶段（实际样本采集 + 规则分级修正）保留为未闭环候选（见 [backlog.md §Code Scanning 规则体系](backlog.md#code-scanning-规则体系)）
>
> **ahead commits 实证**：M28 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 实测；按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 未经用户明确要求不得执行 `git push`）
>
> **M28 ahead commits 关联表**（按提交顺序 / 完整闭环 5 候选 + M28 启动批次 + 治理债清理 + §4.4 规则强化）：
>
> | 候选 / 类别 | commit | subject |
> |:---|:---|:---|
> | M28 启动 | `1e68948` | docs(plan): M28 启动决策落地 todo.md + roadmap.md §M28 + §M27 D4 stale 修正 |
> | M28 评估 | `a4abb71` | docs(plan): M28.2-M28.5 P 阶段评估修订 todo.md §M28.4 验收标准 + 类型平衡 + 执行顺序 |
> | backlog 清理 | `608bcac` | docs(plan): backlog.md 治理债清理 + M22.7/M22.8 follow-up stale 同步 |
> | 跨文档同步 | `f5be990` | docs(plan): 跨文档 stale 同步（todo-archive.md §M22.7/§M22.8 + archive/index.md 健康窗口 + planning.md §4.4 第 11 条 C36 引用） |
> | M28.1 | `1a75068` | docs(standards): planning.md §4.4 第 11 条规则强化（§已知边界段部分闭环处理指引） |
> | M28.5 | `d7289df` | docs(platform): better-auth 中间件 Set-Cookie 路径扫描脚本 + 报告 |
> | M28.2 benchmark | `395ee29` | test(engine): verification-runner 多 cs 告警性能基准基线 |
> | M28.2 优化 | `eaaa997` | fix(engine): runCodeScanningFixes 批处理 + 测试覆盖（M28.2 优化） |
> | M28.3 | `99302b5` | feat(engine): Code Scanning 真实仓库样本采集脚本 + 报告模板（M28.3 / C15） |
> | M28.4 tool | `9207481` | feat(mcp): 新增 pnpm_audit 本地回退数据源 tool |
> | M28.4 对齐 | `5cf2d22` | feat(mcp): runScan 返回结构 RunResult 对齐 5 字段 |
>
> **关键决策 D1-D6**（2026-09-11 用户决策 + M28 完整闭环后）：
>
> - **D1**：方案 M28-A 类型平衡原则（5 候选 = 📚 1 + 🛡️ 3 + 🚀 1）—— 按 §1.1 L12 推荐粒度（5-6 原子条目硬上限）；UX / 测试覆盖缺口真实存在显式标注
> - **D2**：M28.1 重编号为 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— **优先治本 §4.4 第 11 条结构性缺陷**，避免 M27.1 教训复发
> - **D3**：backlog.md 治理债清理 D 阶段已落地（6 文件 modified → 4 atomic commits ahead）—— W1 / C9 / C13 / C36 已闭环条目整段/行删除 + §已知边界 M22.7/M22.8 follow-up stale 同步 + session 元数据 ahead=17 → 0 同步
> - **D4**（M28.4 诚实修订）：`packages/mcp/src/tools/errors.ts` 已 M26.x 阶段落地（`ToolError` + `requireToken()` + `toToolError()` 双 helper），本任务不再做错误包装 helper；仅做未落地部分：pnpm-audit 本地 tool + RunResult 5 字段对齐
> - **D5**（§3.4 五步流程完整执行）：M28.2-M28.5 P 阶段 §3.4 五步流程核验全部 0 项重复评估 + M28.4 部分已落地修订 todo.md §M28.4 验收标准 + 执行顺序建议按"用户决策方案"实际推进
> - **D6**（M28 完整闭环）：5 候选共 11 commits（含 M28 启动 2 + 治理债清理 3 + M28 完整闭环 6）—— M28.6 归档批次落地指针模式
>
> **类型平衡复核**：
> - 🛡️ 技术债 / 治本：2 项（M28.2 / M28.5）—— ✅ 满足
> - 🚀 能力扩展：1 项（M28.4 C33 MCP）—— ✅ 满足
> - 🛡️ 技术债：1 项（M28.3 C15）—— ✅ 满足
> - 📚 治理：1 项（M28.1 重编号）—— ✅ 满足
> - 🎨 用户体验：**0 项** —— ❌ 缺口（C36 / C37 均已闭环或前置依赖）
> - 🧪 测试覆盖：**0 项** —— ❌ 缺口（db-restore S-1/S-2 恢复条件不明确）
>
> **关键经验**：
> - **M28.1 §4.4 第 11 条规则强化治本 §4.4 第 11 条结构性缺陷**（粗粒度触发 vs 细粒度触发 + 二元决策 vs 三元决策）——避免 M27.1 教训复发（重复评估）
> - **M28.2 批处理折中方案**（batchSize=10 / 提速 ~10x / 回滚粒度 = batchSize）——比合并验证保守（回滚粒度更细）
> - **M28.3 第一阶段脚本 + fixture + 报告框架就绪**——实际 GitHub API 采集合 CI/staging 环境跑 `GITHUB_TOKEN=xxx node sample-collector.mjs`
> - **M28.4 RunResult 对齐保持向后兼容**（8 字段保留 + 5 字段新增 + 2 可选字段按需）——不破坏现有 MCP 客户端契约
> - **M28.5 治本验证通过**（better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie）——M22.8 follow-up ② 建议关闭
> - **§3.4 五步流程完整执行**（todo-archive + git log + 代码侧 anchor + git log --grep 候选 ID + 关联决策交叉核验）——避免本次踩中的"M27.1 教训复发"
>
> **完整实施记录 / 关键经验 / 待迁移经验**：见 [archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)（2026-09-11 M28.6 归档批次预防性分片迁出——M28 完整记录 5 候选 × 8 要素 + 性能基准数据 + 批处理决策表 + RunResult 对齐前后对照 + better-auth 中间件 Set-Cookie 触发机制分析）
