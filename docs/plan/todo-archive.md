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
  - **M29**：[archive/todo-archive-phases-m29.md](archive/todo-archive-phases-m29.md)（**2026-10-01 M34 归档批次预防性分片迁出**——M34 段新增前主窗口 648 行 + M34 段新增将超 700 强制分片阈值；M29 是主窗口最早的完整段，按「主窗口保留 3-5 个阶段」健康策略迁出）
  - **M23**：[archive/todo-archive-phases-m23.md](archive/todo-archive-phases-m23.md)（**2026-09-30 M33 归档批次预防性分片迁出**——M33 段新增前主窗口 655 行 + M33 段新增将超 700 强制分片阈值；M23 是主窗口最早的完整段，按「主窗口保留 3-5 个阶段」健康策略迁出）
  - **M30**：[archive/todo-archive-phases-m30.md](archive/todo-archive-phases-m30.md)（**2026-10-02 M35 归档批次预防性分片迁出**——M35 段新增前主窗口 573 行，M35 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M30 是主窗口最早的完整段，按该健康策略迁出；M30 全部 commits 已推送 `origin/master`）
  - **M32**：[archive/todo-archive-phases-m32.md](archive/todo-archive-phases-m32.md)（**2026-10-08 M37 归档批次预防性分片迁出**——M37 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M32 是主窗口最早的完整段，按该健康策略迁出；M32 全部 commits 已推送 `origin/master`）
  - **M33**：[archive/todo-archive-phases-m33.md](archive/todo-archive-phases-m33.md)（**2026-10-09 M38 归档批次预防性分片迁出**——M38 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M33 是主窗口最早的完整段，按该健康策略迁出；M33 全部 commits 已推送 `origin/master`）

## 主窗口保留范围

- 主文档保留最近 3-5 个完整段的近线归档块（当前 5 个，处 [archive/index.md §2](archive/index.md) 定义区间上界：M38 完整段 + M37 完整段 + M36 完整段 + M35 完整段 + M34 完整段，按时间倒序排列在顶部）+ 早期阶段指针段；各阶段 ahead 状态以各段 commit 列表 + `git rev-list HEAD ^origin/master --count` 实证为准，不写死具体数字。**预防性分片同步记录**：M33 已于 2026-10-09 M38 归档批次预防性迁出至 [archive/todo-archive-phases-m33.md](archive/todo-archive-phases-m33.md)（M38 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M33 为主窗口最早完整段）；M31 已于 2026-10-05 M36 归档批次预防性迁出至 [archive/todo-archive-phases-m31.md](archive/todo-archive-phases-m31.md)（M36 段新增后完整段达 6 个，超「3-5 个已归档阶段」上界，M31 为主窗口最早完整段）；M32 已于 2026-10-08 M37 归档批次预防性迁出至 [archive/todo-archive-phases-m32.md](archive/todo-archive-phases-m32.md)（M37 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M32 为主窗口最早完整段）；M30 已于 2026-10-02 M35 归档批次预防性迁出至 [archive/todo-archive-phases-m30.md](archive/todo-archive-phases-m30.md)（M35 段新增前主窗口 573 行，M35 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M30 为主窗口最早完整段）；M29 已于 2026-10-01 M34 归档批次预防性迁出至 [archive/todo-archive-phases-m29.md](archive/todo-archive-phases-m29.md)（M34 段新增前主窗口 648 行 + M34 段新增将超 700 强制分片阈值，M29 为主窗口最早完整段）；M23 已于 2026-09-30 M33 归档批次预防性迁出至 [archive/todo-archive-phases-m23.md](archive/todo-archive-phases-m23.md)；M28.6 归档批次（2026-09-11）已预防性迁出至 [archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)；M26 已于 2026-09-10 M26 归档批次迁出至 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)；M24 / M25 已于 2026-09-08 迁出至 [archive/todo-archive-phases-m24.md](archive/todo-archive-phases-m24.md) + [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)；M19 / M20 / M21 已于 2026-09-10 M26 归档批次预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)；M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)；M18 已于 2026-09-01 M22 归档批次预防性迁出至 [archive/todo-archive-phases-m18.md](archive/todo-archive-phases-m18.md)；M22 已于 2026-09-28 M30 归档批次预防性迁出至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)。
- **2026-10-09 M38 归档批次**：M38 段（6 原子条目 **16 commits**（自 M37 归档末 `5a5c99b` 起 `git log master --first-parent` 去重统计：设计先行稿 1 + 阶段启动规划 1 + M38.1 4 + M38.2 2 + M38.3 2 + M38.4 2 + M38.5 2 + M38.6 2，实证见 [commit 数量](#m38-平台执行模型隔离m381m386-全部已闭环--2026-10-09-归档)））新增至主窗口顶部；主窗口保留范围相应调整为 **M38/M37/M36/M35/M34 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M33 完整段随 M38 新增预防性迁出**至 [archive/todo-archive-phases-m33.md](archive/todo-archive-phases-m33.md)（M38 段新增后完整段将达 6 个，超区间上界，M33 为主窗口最早完整段）；M38 全部 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实测 = 18（含 M37 收尾 2），`origin/master ^HEAD` = 0 双向核验），待用户推送确认。同期同步 `M0-M37` → `M0-M38` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-05 M36 归档批次**：M36 段（10 原子条目 **42 commits** 实证见 [commit 数量](#m36-治理债清仓--可观测性与测试稳定性m361m3610-全部已闭环--2026-10-05-归档)）新增至主窗口顶部；主窗口保留范围相应调整为 **M36/M35/M34/M33/M32 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M31 完整段随 M36 新增预防性迁出**至 [archive/todo-archive-phases-m31.md](archive/todo-archive-phases-m31.md)（M36 段新增后完整段达 6 个，超区间上界，M31 为主窗口最早完整段）；M36 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。同期同步 `M0-M35` → `M0-M36` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-02 M35 归档批次**：M35 段（6 原子条目 **7 commits** 实证见 [commit 数量](#m35-批量运行终态兜底对账--进度可见性修复m351m356-全部已闭环--2026-10-02-归档)）新增至主窗口顶部；主窗口保留范围相应调整为 **M35/M34/M33/M32/M31 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M30 完整段随 M35 新增预防性迁出**至 [archive/todo-archive-phases-m30.md](archive/todo-archive-phases-m30.md)（M35 段新增后完整段将达 6 个，超区间上界，M30 为主窗口最早完整段）；M35 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。同期同步 `M0-M34` → `M0-M35` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-01 M34 归档批次**：M34 段（7 原子条目 **25 commits** 实证见 [commit 数量](#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)）新增至主窗口顶部；M34 段实增 40 行（主窗口 648 → 迁出 M29 后 533 → 新增 M34 段与批次说明后 573 行），**未触及 700 强制分片阈值**；**M29 完整段随 M34 新增预防性迁出**至 [archive/todo-archive-phases-m29.md](archive/todo-archive-phases-m29.md)；同期同步 `M0-M33` → `M0-M34` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。M34 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证，待用户推送）。
- **2026-09-30 M33 归档批次**：M33 段（11 原子条目 **20 commits** 实证见 [commit 数量](archive/todo-archive-phases-m33.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)）新增至主窗口顶部；M33 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。主窗口保留范围相应调整为 **M33/M32/M31/M30/M29 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）+ M23 / M27 / M26 / M22 等指针段；**M23 完整段随 M33 新增预防性迁出**至 [archive/todo-archive-phases-m23.md](archive/todo-archive-phases-m23.md)（M33 段新增前主窗口 655 行 + M33 段新增将超 700 强制分片阈值）；段新增后主窗口 648 行，**未触及 700 强制分片阈值**（位于 [archive/index.md §1](archive/index.md) 定义的 501-700 warning 带）；同期同步 `M0-M32` → `M0-M33` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md`）。
- **2026-09-30 M32 归档批次**：M32 段（5 原子条目 **26 commits** 实证见 [commit 数量](archive/todo-archive-phases-m32.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档) + 1 merge commit `300e833`）新增至主窗口顶部；阶段启动 2 commits（`6315119` + `f3e6423`）已在 `origin/master`，M32 全部 commits 已推送 `origin/master`（本批核验：`git merge-base --is-ancestor 0c79845 origin/master` 成立）。主窗口保留范围相应调整为 **M32/M31/M30/M29/M23 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）+ M27/M26 指针段；段新增后主窗口 655 行，**未触及 700 强制分片阈值**（位于 [archive/index.md §1](archive/index.md) 定义的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M31` → `M0-M32` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-09-27 M29 归档批次**：M29 段（9 原子条目 35 atomic commits = **35 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M29/M28/M27/M26/M23 共 5 个阶段（M22 完整段于 2026-09-28 M30 归档批次预防性迁出，见下条）。
- **2026-09-28 M30 归档批次**：M30 段（6 原子条目 7 commits + 2 docs 收口 + 6 衍生治理 = **15 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M30/M29/M27/M26/M23 共 5 个阶段；**M22 完整段随 M30 新增预防性迁出**至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)（M30 段新增前主窗口 682 行 + M30 段新增将超 700 强制分片阈值）。
- **2026-09-29 M31 归档批次**：M31 段（6 原子条目 **17 commits** 实证见 [commit 数量](archive/todo-archive-phases-m31.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档) + 1 启动决策 commit `a05ac3b`）新增至主窗口顶部；其中 M31.1-M31.4（11 commits）已推送 `origin/master`，M31.5-M31.6（6 commits）归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证）。主窗口保留范围相应调整为 **M31/M30/M29/M23 共 4 个完整段** + M27/M26 指针段；段新增后主窗口 607 行，**未触及 700 强制分片阈值**（位于 [archive/index.md §1](archive/index.md) 定义的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M30` → `M0-M31` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md`）。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-10-09 M38 归档批次预防性迁出 M33 至新分片 `todo-archive-phases-m33.md`，主窗口完整段保持 5 个）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 当时待推送（后续已推送 origin/master）：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期落地（后续已推送 origin/master；ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M38: 平台执行模型隔离（M38.1~M38.6 全部已闭环 / 2026-10-09 归档）

> **归档日期**：2026-10-09
> **阶段摘要**：承接 M37 完整闭环归档后的独立治理阶段。2026-10-06 用户基于生产运行日志根因分析授权开阶段——消除平台 in-process BullMQ Worker 因引擎同步子进程调用阻塞主线程 event loop 导致的 `could not renew lock` / `Missing lock (code -2)`（锁过期 → job 被判 stalled 重排 → 潜在重复执行）。首个交付为方案 ①/②/③ 选型设计先行稿（[executor-process-isolation.md](../design/governance/executor-process-isolation.md)，2026-10-08 定稿）；经用户裁定方案 ① 为主线 + 方案 ③（锁参数与观测）阶段内止血。**M38.1 D 阶段前置实证发现方案 ①（BullMQ sandboxed processor）在本仓库 Nitro 单 bundle 构建体系下无法原样落地**（4 条硬事实：业务代码内联 `chunks/nitro/nitro.mjs` / 产物导入即顶层 listen / Nitro 无额外入口 / `packages/cli/dist` 不自包含；详见 [设计稿 §3.1](../design/governance/executor-process-isolation.md)），经用户再次裁定改用**方案 ①′（独立 worker 进程）**。**6 原子条目全部闭环**，覆盖 🛡️ 2 + 🛠️ 1 + 🧪 1 + 📚 1 + 🎨 1。
>
> - **M38.1** [P1 🛡️] 队列执行进程隔离（方案 ①′ 独立 worker 进程；entrypoint 双进程 + unix socket 收敛 + 迁移唯一执行者 + compose/env 接线）—— `e5412cd` + `374940b` + `f75cb81` + `d436992`
> - **M38.2** [P2 🛠️] Worker 锁参数显式化与锁问题事件观测（`SCAN_WORKER_LOCK_OPTIONS` 引用 `DEFAULT_EXECUTION_TIMEOUT_MS` + `stalled`/`lockRenewalFailed`/`error` 结构化日志 + `ScanQueue.getJob` 注入 + 检查点矩阵挂接）—— `431e8ec` + `074e76d`
> - **M38.3** [P3 🛡️] `scan.post` failover 降级透传 `reuse`（入队成功 / 同步 / 降级三路同源）—— `9f9d067` + `d92a301`
> - **M38.4** [P3 🧪] e2e 全页卡片计数断言解耦（逐卡片标题清单，新增卡片为绿 / 删除替换为红）—— `4b43c29` + `9ce7289`
> - **M38.5** [P3 📚] `scan-queue.ts` 注释口径订正（jobId 连字符口径 + 优先级口径陈旧订正）—— `392f9b0` + `d03122f`
> - **M38.6** [P3 🎨] schedule 表单与 run-view 复用扫描选项口径（+ `batch-runs.modeLabel` 同源点穷举后一并收敛）—— `1b856ac` + `8b9d95d`
>
> **commit 数量实证**：`git log master --first-parent --oneline 5a5c99b..HEAD`（自 M37 归档末 commit 起）去重统计 = **16 commits**（设计先行稿 1 + 阶段启动规划 1 + M38.1 4 + M38.2 2 + M38.3 2 + M38.4 2 + M38.5 2 + M38.6 2，逐项见上方列表；每个 commit 仅归属一条目，无重复计数）。同区间另有 2 个 **M37 收尾** commits（`5ba3bad` 个人设置 e2e 卡片断言同步 + `f48bb74` backlog 候选登记），不计入 M38。
>
> **关键决策**（2026-10-08 用户裁定 + 执行期追加）：
> - **主线方案**：方案 ① + 方案 ③（锁参数与观测）阶段内止血；方案 ②（独立子进程执行引擎）登记 backlog 长期演进。
> - **路径调整决策**（同日追加，独立命名以避免与设计稿 §4 的 D1-D5 编号混淆）：M38.1 实现路径调整为方案 ①′ 独立 worker 进程（方案 ① 经前置实证不可落地）。
> - **条目容量控制**：5-6 项——上收 4 项候选（`scan.post` failover / e2e 卡片计数 / `scan-queue.ts` 注释 / schedule 选项口径），移出 2 项（`distill-wisdom` 假阴性 / `tech-stack` 依赖表）留 backlog。
>
> **类型平衡复核**：🛡️ 技术债与可靠性 2（M38.1 / M38.3）/ 🛠️ 可观测性 1（M38.2）/ 🧪 测试基建 1（M38.4）/ 📚 文档 1（M38.5）/ 🎨 用户体验 1（M38.6）；🎨 独立条目 1 项低于建议值 2，缺口已显式标注。
>
> **关键实证**（细节见各条目闭环记录）：
> - **M38.1**：entrypoint 三分支实测（默认单进程 / 冲突 warn 跳过 / 双进程 env 分离）；docker 拓扑 3 进程 + `Listening on unix socket` 与 `http://[::]:3000` 分离 + HTTP 200；重建 `.output` 后双进程实测 worker 消费队列（注入 scan job 由 worker 处理，failedReason=仓库不存在，证明确经扫描编排；HTTP 进程无扫描痕迹）；SQLite 两进程 `PRAGMA applied` 各一次、全程无 `SQLITE_BUSY`；审计 RG-W01 修复（`set -e` 致 worker 清理成死代码）+ 冲突判定归一化。
> - **M38.2**：BullMQ 6.3.11 源码实证——`lock-manager.js:37-42` 续期失败**同时** emit `lockRenewalFailed` + `error`（同根因双信号，`error` 标 `duplicateOf` 去重）；mutation 3 项全击杀。
> - **M38.3**：三路同源透传；mutation 移除透传 → 2 failed；同根因调用点穷举 0 遗漏。
> - **M38.4**：mutation 双向标定（删除卡片 → 用例失败 / 新增卡片 → 用例通过）；逐卡片标题清单替代全页计数（`5→6→7` 两次复发根因）。
> - **M38.5**：顺带核查发现第 2 处陈旧口径（优先级注释「webhook/定时为预留」实际定时已使用）。
> - **M38.6**：同源点穷举（[development.md §5.1.25](../standards/development.md)）——收敛 3 处 / 保留 3 处（展示策略分歧）/ raw 直通 3 处 / 非同源排除 2 处；非等价项保留 + backlog 候选登记。
>
> **审计**：A 阶段覆盖全部 6 原子条目 —— M38.1（deep 2 分区并发 Pass → 修复 10 点 → quick Pass）；M38.2（standard Reject → 修复 → quick Pass）；M38.3（standard Reject（新增注释孤立编号）→ 修复 → quick Pass）；M38.4（standard Pass）；M38.5（quick Pass）；M38.6（standard Pass → 修复 → quick Reject（同源点 raw 计数少 1）→ 修复 → quick Pass）。全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **18**（`git rev-list origin/master ^HEAD --count` = 0 双向核验；含 M37 收尾 2 + M38 阶段 16），待用户推送确认。
>
> **关联**：[roadmap.md §M38](roadmap.md#m38-平台执行模型隔离2026-10-06-用户授权--2026-10-09-已闭环--归档) + [archive/index.md](archive/index.md) + [executor-process-isolation.md](../design/governance/executor-process-isolation.md) + [platform.md §10.5 / §10.6](../standards/platform.md) + [backlog.md](backlog.md)（M38 衍生候选）

## M37: 运行可观测性与体验记忆（M37.1~M37.6 全部已闭环 / 2026-10-08 归档）

> **归档日期**：2026-10-08
> **阶段摘要**：承接 M36 完整闭环归档后的 backlog 候选池，2026-10-06 用户决策**方案 B（可观测性能力优先）**——从 backlog §候选评估中上收 6 项候选（另 1 项 M36.1 CI 门禁自 archive §4 保留清单上收），收敛为 5 原子条目，以「运行失败分类与筛选」为主线；同日补充授权按 [§3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 可用性插队例外追加 M37.6（目标仓库 git hooks 隔离，生产交付 blocker），并授权开 M38（设计先行，见 [roadmap §M38](roadmap.md)）。**6 原子条目全部闭环**，覆盖 🚀 1 + 🎨 1 + 🛡️ 2 + 📚 1 + 🛠️ 1。
>
> - **M37.6** [P1 🛡️] 目标仓库 git hooks 隔离（`--no-verify` 单一常量 + 回归用例 + 常量契约断言）—— `cb5c146` + `ae0eacf`
> - **M37.1** [P2 🚀] 运行失败分类与筛选 + 落库回填（分类纯函数 + 三列 + 前缀感知迁移 + 回填脚本 + API 三维筛选 + UI 阶段展示）—— `1ea7c27` + `b40db65` + `e14edc8` + `367a286` + `4b48f7c` + `b1f62fc`
> - **M37.2** [P2 🎨] 扫描 / 批量扫描偏好记忆（设备级 localStorage + 显式默认 + 重置 + 设置页卡片）—— `d86e461` + `a012773` + `c77c437`
> - **M37.3** [P3 🛡️] 批量写回与告警源错误信号残余（失败路径条件写回 + 详情响应一致性 + per-source 去重 + 提示链三源合一）—— `5382e67` + `340ca85` + `fb3ff1d`
> - **M37.4** [P3 📚] caomei-ui 版本口径同步（`0.3.0` → `0.5.0` + 结构化复扫账目）—— `fc966c2` + `6ec48f0`
> - **M37.5** [P3 🛠️] 孤立编号检测接入 CI 门禁（Test job 阻断 + 负例标定 + 规范 / 脚本说明）—— `4003e5c`
>
> **commit 数量实证**：`git log master --first-parent --oneline c4d623e..HEAD`（自 M36 归档末 commit 起）去重统计 = **19 commits**（M37.6 2 + 阶段启动 / 授权登记 2 + M37.1 6 + M37.2 3 + M37.3 3 + M37.4 2 + M37.5 1，逐项见上方列表；每个 commit 仅归属一条目，无重复计数）。
>
> **关键决策 D1-D6**（2026-10-06~08 用户裁定 + 执行期收敛）：
>
> - **D1**：组合定型方案 B（可观测性能力优先，5 原子条目）+ 补充授权追加 M37.6；UX 独立条目 1 项（M37.2），M37.1 兼含筛选与阶段展示。
> - **D2**：M37.1 本阶段仅「分类 + 筛选 + 展示」，`failure_code` / `failure_stage` / `failure_kind` 三列均落库；受约束重试入口延后登记 backlog。
> - **D3**：M37.2 载体采用方案 C 混合（localStorage 上次选择 + 可选配置化默认 + 重置，无服务端实体）；服务端跨设备偏好登记 backlog。
> - **D4**：M37.3 复用 M36.3 条件写回模式（乐观锁 = 读取时状态）——本批新增失败通道 helper（只写终态字段）并删除收敛后无调用方的「整份载荷」变体。
> - **D5**：M37.4 仅同步「版本类当前口径」，历史 / 迁移叙述保留原版本号（结构化复扫账目留痕于条目 AC）。
> - **D6**：M37.6 隔离选型为 `--no-verify`（跨平台无路径构造；`post-commit` 不在跳过范围），push 侧隔离登记 backlog。
>
> **类型平衡复核**：🚀 能力扩展 1（M37.1）/ 🎨 用户体验 1（M37.2）/ 🛡️ 技术债与交付可靠性 2（M37.3 + M37.6）/ 📚 文档 1（M37.4）/ 🛠️ CI 防护 1（M37.5）；🎨 独立条目 1 项低于建议值 2，缺口已在条目中显式标注（M37.1 承载筛选与阶段展示）。
>
> **关键实证**（细节见各条目闭环记录与相关规范文档）：
>
> - **M37.6**：隔离参数收敛为单一常量（`--no-verify` 置于 `commit` 子命令后，覆盖 husky `core.hooksPath` 重定向）；回归用例植入非 0 退出 `pre-commit`（写标记 + `exit 1`）+ 同环境裸 commit 反例防恒真。
> - **M37.1**：分类纯函数 + 集中映射表（`unknown` 兜底，未映射码保留 `code` 供审计）；`engine_delivery_failed` 从 message 的类别括号回读细分；落库覆盖全部失败写路径（含复用既有 run 时清空三列）；回填脚本 dry-run 默认 + 幂等 + 无法判定写 `unknown`；e2e 首轮捕获 `SelectItem` 空串 value 的 SSR 500（改哨兵值后两遍全绿）。
> - **M37.2**：`preferences` 构造期不读存储（`onMounted` / 打开弹窗时填充）；存储解析与读写全路径 try/catch（含访问 `localStorage` 即抛错的安全策略场景）；「上次选择」在提交时记录；设置页「未设置」哨兵清除该维度显式默认。
> - **M37.3**：新增 `persistBatchFailedIfRunning`（只写 `status` / `finishedAt` / `updatedAt`，不写计数与 summary），三条失败路径收敛 + 详情 GET 未落库一律重读；新增 `alertsFetchTokenHint` 三源合一 + 报告 catch 去重（消除重复信号与日志汇总 `unknown` 归组）。
> - **M37.4**：三处当前版本口径同步 + 结构化复扫（`0.3.0` 共 34 处 / 10 文件逐处分类，均属历史与 from-version 叙述）；同源复核发现依赖表行级不一致（登记候选）。
> - **M37.5**：负例探针确认退出码非 0（638 文件 / 1 命中 → exit 1，删除后 637 / 0 → exit 0）；步骤置于静态检查簇（`check:readme-i18n` 与 `docs:build` 之间，无兜底改写）；阻断强度口径写入步骤注释。
>
> **审计**：A 阶段覆盖全部 6 原子条目 —— M37.6（standard Pass + quick 复审 Pass）；M37.1（deep 2 分区并发 Pass → quick 复审 Pass）；M37.2（standard 2 分区并发 Pass → quick 复审 Pass）；M37.3（deep 2 分区并发 Pass → quick 复审 Pass + R2 非阻塞项收口）；M37.4（quick Pass → quick 复审 Pass + 收口 commit）；M37.5（standard Pass，3 项 suggest 已应用或判定）。全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **19**（`git rev-list origin/master ^HEAD --count` = 0，双向核验）；本归档 + 蒸馏批次 commits 另计，均待用户推送确认。
>
> **关联**：[roadmap.md §M37](roadmap.md#m37-运行可观测性与体验记忆2026-10-06-用户决策方案-b--2026-10-08-已闭环--归档) + [archive/index.md](archive/index.md) + [run-failure-taxonomy.md](../design/governance/run-failure-taxonomy.md) + [scan-preferences.md](../design/governance/scan-preferences.md) + [backlog.md](backlog.md)（M37 执行期延后项与审计衍生候选）

## M36: 治理债清仓 + 可观测性与测试稳定性（M36.1~M36.10 全部已闭环 / 2026-10-05 归档）

> **归档日期**：2026-10-05
> **阶段摘要**：承接 M35 完整闭环归档后的 backlog 候选池，2026-10-02 用户决策**方案 A（治理债清仓）**——从 backlog 上收可立即启动的 5 项候选（C81 孤立规划编号存量清理 / 设计与索引文档陈旧状态 / BatchRun 写回竞态 / 告警源可审计性判据 / api-i18n e2e 顺序偶发）；同期用户直接指令与用户报告缺陷相继追加 M36.6（镜像体积治理）/ M36.7（pnpm overrides key 归一化）/ M36.8（Docker 首次启动数据库初始化 + 部署文档）/ M36.9（扫描队列孤儿 job 释放）/ M36.10（队列模式消费者维度降级）。**10 原子条目全部闭环**，覆盖 🛡️ 7 + 📚 1 + 🚀 1 + 🧪 1。
> **commit 数量实证**：`git log master --first-parent --oneline` 自 M35 归档末 `9596b14` 起去重统计 = **42 commits**（阶段启动 `dbe2547` + 10 原子条目的实现与闭环登记）；另含非本阶段远端 commit（dependabot bump `5722929` / merge `0980e2f` / CI 豁免 `97c8056` + `be35700`）与独立研判批次（`1b981ee` 运行失败分类设计先行稿 / `52d38dc` 扫描偏好候选登记）。归档时 `git rev-list HEAD ^origin/master --count` 实测 = 0（M36 全部 commits 已推送 `origin/master`）。
> **关键决策 D1-D7**（2026-10-02~04 用户裁定 + 执行期追加）：
> - **D1**：组合定型方案 A（治理债清仓，5 原子条目）；🎨 UX 缺口显式标注。同期追加 M36.6~M36.10——M36.6 / M36.7 属 [规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10)「用户直接决策」路径，M36.8~M36.10 属 [§3.1 插队例外](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)第 3 类「直接影响可用性」。
> - **D2**：M36.1 判定口径「注释块级 + 真常量白名单 + 优先改写为带文档指针的导航指针，无法归指者删编号留正文」；批量替换每子批次 < 10 文件。
> - **D3**：M36.3 条件写回下沉共享层，保持 GET「对非 running 批次仍对齐计数」既有契约；不引入悲观锁。
> - **D4**：M36.4 判据改为「无任何成功源且存在失败源」；明确 `repoResults` / 报告「扫描成功」连锁语义。
> - **D5**：M36.6 对齐 momei / caomei-auth 的 `.output`-only 形态；sandbox 未来独立入口须自包含。
> - **D6**：M36.7 按语义等价类归一化 override key；major-0 caret（`^0.0` ≠ `^0`）保持区分，不引入 `semver`。
> - **D7**：M36.8 基线迁移采用实体元数据运行时生成（`Table.create`，前缀感知 + 跨方言）；compose 部署层默认 `DATABASE_MIGRATIONS_RUN=true`（应用默认仍 false）；保留手动 / 一键初始化脚本 + 补齐 Docker 部署文档。
> **类型平衡复核**：🛡️ 技术债 / 缺陷修复 7（M36.1 / M36.3 / M36.6 / M36.7 / M36.8 / M36.9 / M36.10）/ 📚 文档治理 1（M36.2）/ 🚀 可观测性 1（M36.4）/ 🧪 测试基建 1（M36.5）；🎨 用户体验由 M36.8 承载（Docker 首启即用 + 部署文档）。
> **关键实证**（细节见各条目闭环记录）：
> - **M36.1**：新增 `scripts/check-orphan-ids.mjs` + 22 用例；清理全仓孤立编号（packages/scripts 46 行 + apps/platform 157 行 + engine 2 行）；A 阶段发现检测正则漏裸 `W\d` / `S\d`（RG-B01）→ 扩展 + 回归用例，复扫 0 命中（627 文件）。
> - **M36.2**：索引 23/24 双侧 + `platform-ai-integration` 状态/组件名 + `docs-and-readme-i18n` 状态 + architecture / platform-scheduled-batch 同源项；en 索引补 Run Failure Taxonomy 行恢复 21/21 parity；A 阶段 RG-B1（同文档 §13 状态自相矛盾）修复。
> - **M36.3**：新增共享条件写回 `persistBatchAggregation`（读取时状态乐观锁）；详情 GET / sync 尾部 / 周期对账三处统一；并发用例经反向 mutation 核验非假绿。
> - **M36.4**：判据改 `failedSources.length > 0 && successfulSources === 0`；`platform.md §6.1` 落仓库级失败判据 + 连锁影响。
> - **M36.5**：根因实测=客户端 `@nuxtjs/i18n` 异步回写 `i18n_locale` cookie 竞态（证伪「同名仓库」假设）；`requestCookieHeader` 剥离 `i18n_locale` 结构性解耦；全量 e2e `--workers=1` 连跑两遍 175 passed ×2（0 flaky）。
> - **M36.6**：镜像 1.1GB → 239MB（`.output`-only）；compose 默认拉镜像 + PUID/PGID fail-closed 权限控制。
> - **M36.7**：override key 语义归一化（`@^1` 与 `@1` 只保留一种）；major-0 caret 守卫。
> - **M36.8**：新增基线迁移 `CreateInitialSchema1600000000000` + 8 早期迁移幂等 / 前缀感知 + `db:init` + 部署文档；第二轮镜像级 `ENV DATABASE_MIGRATIONS_RUN=true` + 镜像冒烟门禁。
> - **M36.9**：扫描队列孤儿 job 按 run 归属释放 + pending 排队误杀修正；真实 Redis 集成 6 passed ×3。
> - **M36.10**：`resolveQueueMode` 纳入 `inProcessWorker` 消费者维度，`auto` 无进程内 worker 自动降级同步；文档降级矩阵同步。
> **审计轮次**：A 阶段覆盖全部 10 原子条目（M36.1 2 分区 standard → quick；M36.2 standard Reject → quick；M36.3 standard Pass；M36.4 standard Pass；M36.5 standard Pass；M36.6 多轮 standard → quick；M36.7 standard → quick ×2；M36.8 3 分区 standard + 2 分区 quick；M36.9 standard Reject → quick Pass；M36.10 standard → quick），全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
> **未完成项 / 已知边界**（均登记 backlog §候选评估中，不随本阶段闭环）：① BatchRun 反向竞态（async 全部入队失败 stale save）与 stale-cleanup 无条件 save；② 详情 GET 计数无变化时并发响应瞬时不一致；③ 部分源失败汇总的仓库级错误重复信号；④ caomei-ui 版本陈旧（`tech-stack.md:36` / `platform.md:16` 标 `0.3.0`，实际 `0.5.0`）；⑤ M36.1 检测脚本未接入 CI 门禁；⑥ M36.6 未在新镜像实跑一次 `DependfixApp.run()` 全链路（需真实 GitHub 凭据）；⑦ M36.7 `^0 ↔ 0` 等罕用等价形态保守欠合并。
> **ahead commits 实证**：`git rev-list HEAD ^origin/master --count` 归档时实测 = 0（M36 全部 commits 已推送 `origin/master`）。
> **关联**：[roadmap.md §M36](roadmap.md#m36-治理债清仓--可观测性与测试稳定性2026-10-02-用户决策方案-a--2026-10-05-已闭环--归档) + [backlog.md](backlog.md)（M36 衍生候选）+ [archive/index.md](archive/index.md)

## M35: 批量运行终态兜底对账 + 进度可见性修复（M35.1~M35.6 全部已闭环 / 2026-10-02 归档）

> **归档日期**：2026-10-02
> **阶段摘要**：2026-10-02 用户报告「批量运行页面中卡住（超时）的任务不显示进度，必须手动展开才真正查询」，并要求评估超时补偿机制失效原因与手动展开更新状态原理的合理性。根因排查（生产库 17 条 BatchRun / 94 条 ScanRun 逐条核对）确认：BatchRun 终态与进度计数只由详情接口 `GET /api/batch-runs/[id]` 惰性聚合写回（原设计 §5.2「方案 A 轮询更新」）；`stale-cleanup` 的 BatchRun 分支要求「至少一个 stale 子 ScanRun」，对「子项全部终态但父批次未被查看」与「零子项」两类主失败模式无覆盖 → 父批次永久 `running`、进度停留在 0、`finishedAt` 被污染为首次查看时间。经用户 2026-10-02 明确授权开阶段（[规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径），采用**周期兜底对账 + 详情实时聚合双通道**方案。**6 原子条目全部闭环**，覆盖 🚀 1 + 🛠️ 3 + 🎨 1 + 📚 1。
>
> - **M35.1** [P2 🚀 能力扩展] 周期兜底对账服务 `batch-reconciler.ts`（扫全部 `running` BatchRun 聚合写回终态/进度 + 零子项超阈值 orphan → `failed` + 条件写回防覆盖并发 `force-fail` + `In` 分批）—— `041b4df`
> - **M35.2** [P2 🛠️ 技术债] 写回收敛为共享 `applyBatchAggregation`（详情接口 / 对账 / sync 三处共用）+ 周期插件接线（先清孤儿、后对账，三类任务独立 try/catch）—— `222ca6d`
> - **M35.3** [P2 🛠️ 技术债] `finishedAt` 语义修正为真实完成时间（`max(子项 finishedAt)`，无子项回退当前时刻；真实化部分由 `222ca6d` 一并落地）+ sync 模式串行结束即聚合终结 —— `33d93dd`
> - **M35.4** [P3 🎨 用户体验] 前端 `batch-runs.vue` 轮询注释与口径修正 —— `8ae502c`
> - **M35.5** [P3 🛠️ 数据订正] 存量 `finishedAt` 订正脚本 `backfill-batch-finished-at.ts`（dry-run 默认 + `--apply` 二次确认 + 事务 + 仅非 running）—— `ae4b038`
> - **M35.6** [P3 📚 文档治理] 设计口径同步（`platform-scheduled-batch.md` §4.2 / §5.2 / §9.1 双通道口径）+ 规划索引口径登记 —— `d4ddf1f` + `db66f15`
>
> **commit 数量实证**：`git log master --first-parent --oneline` 自 M34 归档末 `291e4ab` 起按上列条目统计 = **7 commits**（`041b4df` / `222ca6d` / `33d93dd` / `ae4b038` / `8ae502c` / `d4ddf1f` / `db66f15`）；本归档批次另含归档 commits。归档时 `git rev-list HEAD ^origin/master --count` 实测 = 0（M35 全部 commits 已推送 `origin/master`）。
>
> **关键决策 D1-D4**（2026-10-02 用户授权 + 执行期敲定；完整记录见 [roadmap.md §M35](roadmap.md#m35-批量运行终态兜底对账--进度可见性修复2026-10-02-用户授权启动--2026-10-02-已闭环--归档)）：
>
> - **D1**（2026-10-02 用户授权）：新增 M35 阶段修复（[规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径），方案 = 周期兜底对账 + 详情实时聚合双通道
> - **D2**：对账复用既有周期插件 `stale-cleanup.ts`（5 分钟节拍，长驻 Docker 部署可靠），不引入 Worker 回调（保持原设计低耦合）
> - **D3**：`finishedAt` 取 `max(子项 finishedAt)`；无子项批次无真实完成时间，孤儿兜底时取兜底时刻并披露边界
> - **D4**：零子项且超 30 分钟的 `running` 批次视为孤儿 → `failed`（触发进程在建子项前异常 / 子仓库级联删除），与 `stale-cleanup` 孤儿语义对齐；零子项 + running 属「终态未定」，任何通道都不得按 `completed` 收敛
>
> **类型平衡复核**：🚀 能力扩展 1（M35.1）/ 🛠️ 技术债 + 数据订正 3（M35.2 / M35.3 / M35.5）/ 🎨 用户体验 1（M35.4）/ 📚 文档治理 1（M35.6）；**🧪 测试覆盖无独立条目**（测试随各条目内嵌：M35.1 / M35.2 / M35.3 单测 + M35.5 脚本单测），缺口显式标注。
>
> **范围边界（不做什么）**：不改 `BatchRun` 状态集合与既有 `failed` 终态保护口径；不引入 Worker 回调；不改详情接口返回结构；零子项孤儿无真实完成时间，不伪造历史时刻。
>
> **审计轮次**：2 分区并发 deep（P1 服务端 / P2 脚本 + 文档）；P1 第 1 轮 **Reject**（RG-B01：零子项经详情接口被固化 `completed`）→ 修复护栏 + 条件写回 + `In` 分块 + coverage + 编号清理 → 第 2 轮 Pass（残留 RG-W01R 登记 backlog）；P2 Pass（RG-W1 脚本仅终态 / RG-W2 设计 §4.2 / RG-W3「方案 A」歧义 / RG-W4 八要素 / RG-W5 源码注释 均已修复）。记录在 `artifacts/review-gate/`（gitignored）。
>
> **遗留观察项**：① `BatchRun` 写回的非原子竞态（详情 GET / sync 尾部 vs 并发 `force-fail`）已登记 backlog §候选评估中（M35.1 A 阶段 RG-W01R）；② backfill `--apply` 待用户在生产执行（脚本已入库）；③ 设计 §5.2 双通道语义以 M35.6 为现行口径。
>
> **关联**：[roadmap.md §M35](roadmap.md#m35-批量运行终态兜底对账--进度可见性修复2026-10-02-用户授权启动--2026-10-02-已闭环--归档) + [backlog.md §候选评估中](backlog.md)（非原子竞态候选）+ [archive/index.md §5 批次登记](archive/index.md)

---

## M34: 治理与体验收口 + 组件库升级与巡检基建（M34.1~M34.7 全部已闭环 / 2026-10-01 归档）

> **归档日期**：2026-10-01
> **阶段摘要**：承接 M33 完整闭环归档后的 backlog 候选池。2026-09-30 用户决策：以 M33 期评估完成的「方案 A」（4 项 backlog 待上收候选 + C83 能力扩展）为主并作适当能力扩展——追加 caomei-ui `0.3.0 → 0.5.0` 升级（弹窗内 Select 面板层级缺陷）与「视觉回归灵敏度 + 弹窗组件覆盖 + 上游组件问题归因流程」；阶段内 M34.7（表单字段堆叠口径复用化）经用户直接决策追加（[规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10) 承认的「用户直接决策」路径）。**7 原子条目全部闭环**，覆盖 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1 + 🛡️ 1。
>
> - **M34.1** [P3 🛠️ 工具链治理] 本地 devEx：运行时 `data/` 产物污染 vitest 与 check-docs（`test.exclude` 双 root 覆盖 + `check-docs` 遍历下降前剪枝 + 回归用例）—— `d315840` + `1dc1cd1`
> - **M34.2** [P2 📦 依赖升级] caomei-ui `0.3.0 → 0.5.0`（面板层级缺陷修复 + 三版 tarball 语义级比对 + 防复发用例 + 视觉基线重建）—— `56c1290` + `7363a8d` + `a8e28b5` + `2f10eed`
> - **M34.3** [P3 🧪 测试基建] 视觉门禁双轴收紧（色阈值 + 面积预算）+ 弹窗 Select 展开态基线 + 上游归因上报流程 —— `e24b85b` + `b8e8ca1` + `30f9c27` + `8dbd7a1`
> - **M34.4** [P3 🎨 用户体验] 非弹窗表单 label↔控件间距统一（范围判定后实改 4 处 + 基线纯偏移归因）—— `3dcc341` + `4919329`
> - **M34.5** [P3 📚 文档治理] PrimeUI 设计先行稿与索引状态同步（含用户授权的同源陈旧一并同步）—— `64bdb79` + `6d2374f`
> - **M34.6** [P3 🚀 能力扩展] C83 验证链「既有失败基线」判定（命令级归因 + 报告双口径 + 验证链模块拆分）—— `dbf9066` + `4ed008e` + `5a544da` + `b6161a7`
> - **M34.7** [P3 🛡️ 技术债] 表单字段堆叠口径复用化（`field-stack` mixin + 13 处同构字段复用 + 弹窗遗漏补齐）—— `4e62f29` + `c56fb8d` + `3888d29` + `9875967` + `9fc83ed` + `2b7e613`
>
> **commit 数量实证**：`git log master --first-parent --oneline` 自 M33 归档末 `6035313` 起按上列条目去重统计 = **25 commits**（阶段启动 `86283e2` + 7 原子条目的实现与闭环登记）；本归档批次另含 wisdom 蒸馏 `5c84dc2` 与归档 commits。归档时 `git rev-list HEAD ^origin/master --count` 实测 = 28（含本批归档 commits，待用户推送）。
>
> **关键决策 D1-D12**（2026-09-30 用户裁定 + 执行期追加；完整记录见 [roadmap.md §M34](roadmap.md#m34-治理与体验收口--组件库升级与巡检基建2026-09-30-用户决策启动--2026-10-01-已闭环--归档)）：
>
> - **D1**：组合定型（方案 A + 适当能力扩展）——6 原子条目，类型平衡 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1
> - **D2**：M34.2 目标版本 = `0.5.0`（用户指定，npm `latest` 实测一致）
> - **D3**：「视觉回归容差」与「组件巡检 + 上游 issue 流程」合并为 M34.3（受 5-6 项上限约束按「进一出一」）
> - **D4**：弹窗内 Select 缺陷由用户确认为「面板被裁剪 / 层级错误」，D 阶段首步须在 `0.3.0` 下复现——实测推翻「裁剪」假设，缺陷实际轴为**层级 z 序**
> - **D5**（原建议执行顺序）：M34.2 → M34.4 → M34.3（先落组件库与间距，最后动容差与新基线）；M34.1 / M34.5 / M34.6 可并行
> - **D6**：阶段启动 commit 仅改规划与文档指针（P 阶段规划暂停协议）
> - **D7**：P 阶段 `standard` 审计 Pass；RG-W1（代码侧陈旧指针）落点登记 M34.6
> - **D8**（执行期用户拍板）：视觉门禁双轴收紧（色阈值 + 面积预算）；浮层覆盖取弹窗内 Select 展开态 light / dark
> - **D9**（执行期范围判定）：M34.4 排除 `__summary-byconclusion`（横向标签行），实改 4 处
> - **D10**（用户授权）：追加 M34.7（字段堆叠口径复用化），显示型 `label↔值` 堆叠不纳入口径
> - **D11**（用户授权）：M34.5 范围扩展（同源陈旧一并同步；AC 排除项登记候选）
> - **D12**（执行期敲定）：M34.6 三项决策点——修复前一次性采样 / 命令级判定 / `PRE_EXISTING_FAILURE` + `preExisting` 双口径
>
> **类型平衡复核**：🛠️ 工具链治理 1（M34.1）/ 📦 依赖升级 1（M34.2）/ 🧪 测试基建 1（M34.3）/ 🎨 用户体验 1（M34.4，缺口显式标注）/ 📚 文档治理 1（M34.5）/ 🚀 能力扩展 1（M34.6）/ 🛡️ 技术债 1（M34.7）。
>
> **审计轮次**：M34.1（1 + 1 轮）/ M34.2（2 轮）/ M34.3（2 分区 × 2 轮）/ M34.4（1 轮）/ M34.5（3 轮）/ M34.6（2 分区 × 2-3 轮）/ M34.7（2 分区 × 2 轮）——全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **遗留观察项**：① 视觉门禁双轴收紧（M34.3）推送后须观察 1-2 次真实 CI visual run；② `data/` 包级模式排除（M34.1）的残余风险以 `vitest.config.ts` inline 注释登记；③ `verificationBlocking` 未在 MCP / 平台展示层透出（M34.6 已披露边界）；④ backlog §候选评估中 保留「设计与索引文档的同类陈旧状态清理（存量）」待评估候选。

---

## M33: 治理债收口 + 测试基建扩展（M33.1~M33.11 全部已闭环 / 2026-09-30 归档 → 2026-10-09 M38 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m33.md §M33](archive/todo-archive-phases-m33.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)。

---

## M32: 能力扩展优先（M32.1~M32.5 全部已闭环 / 2026-09-30 归档 → 2026-10-08 M37 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m32.md §M32](archive/todo-archive-phases-m32.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档)。

---

## M31: apps/platform UI 组件库迁移（PrimeVue → caomei-ui）（已归档 → 2026-10-05 M36 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m31.md §M31](archive/todo-archive-phases-m31.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)。

---

## M30: 治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强（已归档 → 2026-10-02 M35 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m30.md §M30](archive/todo-archive-phases-m30.md#m30-治理债清理--迁移可行性验证--能力扩展--测试补强m301m306-全部已闭环--2026-09-28-归档)。

---

## M29: 修复交付链路正确性 + 能力扩展（已归档 → 2026-10-01 M34 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m29.md §M29](archive/todo-archive-phases-m29.md#m29-修复交付链路正确性--能力扩展m291m299-全部已闭环--2026-09-27-归档)。

---


## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强（已归档 → 2026-09-30 M33 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)。

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
