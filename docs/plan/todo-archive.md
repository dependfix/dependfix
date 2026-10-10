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
  - **M34**：[archive/todo-archive-phases-m34.md](archive/todo-archive-phases-m34.md)（**2026-10-10 M39 归档批次预防性分片迁出**——M39 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M34 是主窗口最早的完整段，按该健康策略迁出；M34 全部 commits 已推送 `origin/master`）
  - **M35**：[archive/todo-archive-phases-m35.md](archive/todo-archive-phases-m35.md)（**2026-10-10 M40 归档批次预防性分片迁出**——M40 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M35 是主窗口最早的完整段，按该健康策略迁出；M35 全部 commits 已推送 `origin/master`）
  - **M36**：[archive/todo-archive-phases-m36.md](archive/todo-archive-phases-m36.md)（**2026-10-10 M41 归档批次预防性分片迁出**——M41 段新增后完整段将达 6 个，超 [archive/index.md §2](archive/index.md) 定义的「3-5 个已归档阶段」上界；M36 是主窗口最早的完整段，按该健康策略迁出）

## 主窗口保留范围

- 主文档保留最近 3-5 个完整段的近线归档块（当前 5 个，处 [archive/index.md §2](archive/index.md) 定义区间上界：M41 完整段 + M40 完整段 + M39 完整段 + M38 完整段 + M37 完整段，按时间倒序排列在顶部）+ 早期阶段指针段；各阶段 ahead 状态以各段 commit 列表 + `git rev-list HEAD ^origin/master --count` 实证为准，不写死具体数字。**预防性分片同步记录**：M35 已于 2026-10-10 M40 归档批次预防性迁出至 [archive/todo-archive-phases-m35.md](archive/todo-archive-phases-m35.md)（M40 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M35 为主窗口最早完整段）；M34 已于 2026-10-10 M39 归档批次预防性迁出至 [archive/todo-archive-phases-m34.md](archive/todo-archive-phases-m34.md)（M39 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M34 为主窗口最早完整段）；M33 已于 2026-10-09 M38 归档批次预防性迁出至 [archive/todo-archive-phases-m33.md](archive/todo-archive-phases-m33.md)（M38 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M33 为主窗口最早完整段）；M31 已于 2026-10-05 M36 归档批次预防性迁出至 [archive/todo-archive-phases-m31.md](archive/todo-archive-phases-m31.md)（M36 段新增后完整段达 6 个，超「3-5 个已归档阶段」上界，M31 为主窗口最早完整段）；M32 已于 2026-10-08 M37 归档批次预防性迁出至 [archive/todo-archive-phases-m32.md](archive/todo-archive-phases-m32.md)（M37 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M32 为主窗口最早完整段）；M30 已于 2026-10-02 M35 归档批次预防性迁出至 [archive/todo-archive-phases-m30.md](archive/todo-archive-phases-m30.md)（M35 段新增前主窗口 573 行，M35 段新增后完整段将达 6 个，超「3-5 个已归档阶段」上界，M30 为主窗口最早完整段）；M29 已于 2026-10-01 M34 归档批次预防性迁出至 [archive/todo-archive-phases-m29.md](archive/todo-archive-phases-m29.md)（M34 段新增前主窗口 648 行 + M34 段新增将超 700 强制分片阈值，M29 为主窗口最早完整段）；M23 已于 2026-09-30 M33 归档批次预防性迁出至 [archive/todo-archive-phases-m23.md](archive/todo-archive-phases-m23.md)；M28.6 归档批次（2026-09-11）已预防性迁出至 [archive/todo-archive-phases-m28.md](archive/todo-archive-phases-m28.md)；M26 已于 2026-09-10 M26 归档批次迁出至 [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)；M24 / M25 已于 2026-09-08 迁出至 [archive/todo-archive-phases-m24.md](archive/todo-archive-phases-m24.md) + [archive/todo-archive-phases-m25.md](archive/todo-archive-phases-m25.md)；M19 / M20 / M21 已于 2026-09-10 M26 归档批次预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)；M14 + M15 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)；M16 + M17 已于 2026-08-31 迁出至 [archive/todo-archive-phases-m16-m17.md](archive/todo-archive-phases-m16-m17.md)；M18 已于 2026-09-01 M22 归档批次预防性迁出至 [archive/todo-archive-phases-m18.md](archive/todo-archive-phases-m18.md)；M22 已于 2026-09-28 M30 归档批次预防性迁出至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)。
- **2026-10-10 M41 归档批次**：M41 段（5 原子条目 **15 commits**（阶段启动 1 + M41.1 5 + M41.2 2 + M41.3 3 + M41.4 2 + M41.5 2；`git log master --first-parent --oneline 1681d0a^..HEAD` 去重统计，实证见 [commit 数量](#m41-规范与经验管理体系重构m411m415-全部已闭环--2026-10-10-归档)）；范围内另有 1 commit 属并行 session 的候选登记，不计入本阶段）新增至主窗口顶部；主窗口保留范围相应调整为 **M41/M40/M39/M38/M37 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M36 完整段随 M41 新增预防性迁出**至 [archive/todo-archive-phases-m36.md](archive/todo-archive-phases-m36.md)；M41 全部 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 归档前实测 = 21，`origin/master ^HEAD` = 0 双向核验），待用户推送确认。同期同步 `M0-M40` → `M0-M41` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-10 M40 归档批次**：M40 段（6 原子条目 **20 commits**（阶段启动 1 + M40.6 5 + M40.5 2 + M40.2 2 + M40.3 4 + M40.4 3 + M40.1 3；`git log master --first-parent --oneline origin/master..HEAD` 去重统计，实证见 [commit 数量](#m40-运行时可靠性与可观测性深化m401m406-全部已闭环--2026-10-10-归档)））新增至主窗口顶部；主窗口保留范围相应调整为 **M40/M39/M38/M37/M36 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M35 完整段随 M40 新增预防性迁出**至 [archive/todo-archive-phases-m35.md](archive/todo-archive-phases-m35.md)（M40 段新增后完整段将达 6 个，超区间上界，M35 为主窗口最早完整段）；M40 全部 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实测 = 20，`origin/master ^HEAD` = 0 双向核验），待用户推送确认。同期同步 `M0-M39` → `M0-M40` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-10 M39 归档批次**：M39 段（6 原子条目 **23 commits**（阶段启动 1 + M39.3 3 + M39.1 3 + M39.2 4 + M39.5 4 + M39.4 4 + M39.6 4；`git log master --first-parent --oneline origin/master..HEAD` 去重统计，实证见 [commit 数量](#m39-平台视图体验与可观测补强m391m396-全部已闭环--2026-10-10-归档)））新增至主窗口顶部；主窗口保留范围相应调整为 **M39/M38/M37/M36/M35 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M34 完整段随 M39 新增预防性迁出**至 [archive/todo-archive-phases-m34.md](archive/todo-archive-phases-m34.md)（M39 段新增后完整段将达 6 个，超区间上界，M34 为主窗口最早完整段）；M39 全部 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实测 = 23，`origin/master ^HEAD` = 0 双向核验），待用户推送确认。同期同步 `M0-M38` → `M0-M39` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-09 M38 归档批次**：M38 段（6 原子条目 **16 commits**（自 M37 归档末 `5a5c99b` 起 `git log master --first-parent` 去重统计：设计先行稿 1 + 阶段启动规划 1 + M38.1 4 + M38.2 2 + M38.3 2 + M38.4 2 + M38.5 2 + M38.6 2，实证见 [commit 数量](#m38-平台执行模型隔离m381m386-全部已闭环--2026-10-09-归档)））新增至主窗口顶部；主窗口保留范围相应调整为 **M38/M37/M36/M35/M34 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M33 完整段随 M38 新增预防性迁出**至 [archive/todo-archive-phases-m33.md](archive/todo-archive-phases-m33.md)（M38 段新增后完整段将达 6 个，超区间上界，M33 为主窗口最早完整段）；M38 全部 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实测 = 18（含 M37 收尾 2），`origin/master ^HEAD` = 0 双向核验），待用户推送确认。同期同步 `M0-M37` → `M0-M38` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-05 M36 归档批次**：M36 段（10 原子条目 **42 commits** 实证见 [commit 数量](archive/todo-archive-phases-m36.md#m36-治理债清仓--可观测性与测试稳定性m361m3610-全部已闭环--2026-10-05-归档)）新增至主窗口顶部；主窗口保留范围相应调整为 **M36/M35/M34/M33/M32 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M31 完整段随 M36 新增预防性迁出**至 [archive/todo-archive-phases-m31.md](archive/todo-archive-phases-m31.md)（M36 段新增后完整段达 6 个，超区间上界，M31 为主窗口最早完整段）；M36 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。同期同步 `M0-M35` → `M0-M36` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-02 M35 归档批次**：M35 段（6 原子条目 **7 commits** 实证见 [commit 数量](archive/todo-archive-phases-m35.md#m35-批量运行终态兜底对账--进度可见性修复m351m356-全部已闭环--2026-10-02-归档)）新增至主窗口顶部；主窗口保留范围相应调整为 **M35/M34/M33/M32/M31 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）；**M30 完整段随 M35 新增预防性迁出**至 [archive/todo-archive-phases-m30.md](archive/todo-archive-phases-m30.md)（M35 段新增后完整段将达 6 个，超区间上界，M30 为主窗口最早完整段）；M35 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。同期同步 `M0-M34` → `M0-M35` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-10-01 M34 归档批次**：M34 段（7 原子条目 **25 commits** 实证见 [commit 数量](archive/todo-archive-phases-m34.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)）新增至主窗口顶部；M34 段实增 40 行（主窗口 648 → 迁出 M29 后 533 → 新增 M34 段与批次说明后 573 行），**未触及 700 强制分片阈值**；**M29 完整段随 M34 新增预防性迁出**至 [archive/todo-archive-phases-m29.md](archive/todo-archive-phases-m29.md)；同期同步 `M0-M33` → `M0-M34` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。M34 commits 归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证，待用户推送）。
- **2026-09-30 M33 归档批次**：M33 段（11 原子条目 **20 commits** 实证见 [commit 数量](archive/todo-archive-phases-m33.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)）新增至主窗口顶部；M33 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。主窗口保留范围相应调整为 **M33/M32/M31/M30/M29 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）+ M23 / M27 / M26 / M22 等指针段；**M23 完整段随 M33 新增预防性迁出**至 [archive/todo-archive-phases-m23.md](archive/todo-archive-phases-m23.md)（M33 段新增前主窗口 655 行 + M33 段新增将超 700 强制分片阈值）；段新增后主窗口 648 行，**未触及 700 强制分片阈值**（位于 [文档规范 §3 阈值表](../standards/documentation.md#3-文档行数阈值) 的 501-700 warning 带）；同期同步 `M0-M32` → `M0-M33` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md`）。
- **2026-09-30 M32 归档批次**：M32 段（5 原子条目 **26 commits** 实证见 [commit 数量](archive/todo-archive-phases-m32.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档) + 1 merge commit `300e833`）新增至主窗口顶部；阶段启动 2 commits（`6315119` + `f3e6423`）已在 `origin/master`，M32 全部 commits 已推送 `origin/master`（本批核验：`git merge-base --is-ancestor 0c79845 origin/master` 成立）。主窗口保留范围相应调整为 **M32/M31/M30/M29/M23 共 5 个完整段**（位于 [archive/index.md §2](archive/index.md) 定义的 3-5 个阶段区间上界）+ M27/M26 指针段；段新增后主窗口 655 行，**未触及 700 强制分片阈值**（位于 [文档规范 §3 阈值表](../standards/documentation.md#3-文档行数阈值) 的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M31` → `M0-M32` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md` + `todo.md`）。
- **2026-09-27 M29 归档批次**：M29 段（9 原子条目 35 atomic commits = **35 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M29/M28/M27/M26/M23 共 5 个阶段（M22 完整段于 2026-09-28 M30 归档批次预防性迁出，见下条）。
- **2026-09-28 M30 归档批次**：M30 段（6 原子条目 7 commits + 2 docs 收口 + 6 衍生治理 = **15 commits 全部 ahead=0 已推送至 origin/master**）新增至主窗口顶部；主窗口保留范围相应调整为 M30/M29/M27/M26/M23 共 5 个阶段；**M22 完整段随 M30 新增预防性迁出**至 [archive/todo-archive-phases-m22.md](archive/todo-archive-phases-m22.md)（M30 段新增前主窗口 682 行 + M30 段新增将超 700 强制分片阈值）。
- **2026-09-29 M31 归档批次**：M31 段（6 原子条目 **17 commits** 实证见 [commit 数量](archive/todo-archive-phases-m31.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档) + 1 启动决策 commit `a05ac3b`）新增至主窗口顶部；其中 M31.1-M31.4（11 commits）已推送 `origin/master`，M31.5-M31.6（6 commits）归档时为本地 ahead（`git rev-list HEAD ^origin/master --count` 实证）。主窗口保留范围相应调整为 **M31/M30/M29/M23 共 4 个完整段** + M27/M26 指针段；段新增后主窗口 607 行，**未触及 700 强制分片阈值**（位于 [文档规范 §3 阈值表](../standards/documentation.md#3-文档行数阈值) 的 501-700 warning 带），故本批次无预防性迁出；同期同步 `M0-M30` → `M0-M31` 里程碑口径（`docs/index.md` + `docs/i18n/en-US/index.md` + `backlog.md`）。
- 当 `todo-archive.md` 超过 700 行时，将早期阶段迁入分片归档（最近一次迁出于 2026-10-10 M40 归档批次预防性迁出 M35 至新分片 `todo-archive-phases-m35.md`，主窗口完整段保持 5 个）。
- **2026-10-10 M41 归档批次**预防性迁出 **M36** 至新分片 `todo-archive-phases-m36.md`（主窗口完整段保持 5 个）。
- **2026-08-20 归档批次**：M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次迁入分片 [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)。
- **2026-08-25 归档批次**：M12 9 子任务完整闭环，**所有 19 commits 已推送至 `origin/master`**（ahead=0，git rev-list HEAD ^origin/master --count 核验）。详见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（**2026-08-28 M17 归档批次预防性分片迁出**）。
- **2026-08-26 归档批次（M13）**：M13.1+M13.2+M13.3+M13.4 全部 12 子任务完整闭环，**26 commits 已推送至 `origin/master`**（含 T1310 部分 ahead commit；git rev-list HEAD ^origin/master --count 实证：ahead=3，仅 M13.4 三 commits 当时待推送（后续已推送 origin/master）：T1401 `2dce01d` + T1402+T1403 `bb3b49a` + todo.md 收口 `8762a4b`）。详见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（**2026-08-30 M18 归档批次预防性迁出**）。
- **2026-08-30 归档批次（M18）**：M18.0+M18.1+M18.2+M18.3+M18.4+M18.x 全部 6 子阶段 + 1 治理批次完整闭环，**~24 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-30 实测）。详见下方 §M18 段。
- **2026-08-31 归档批次（M19）**：M19.1+M19.2+M19.3+M19.4+M19.5 全部 5 子任务完整闭环，**5 commits 已全部推送至 `origin/master`**（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-31 实测；M19.1 `0c536c1` + M19.2 `c998d58` + M19.3 `5839771` + M19.4 `8db2fd4` + M19.5 `a20ea02` + M19.x 收口 `ae33671` + 配套 commits `2f9eb38` / `bee5c3f` / `61b3ddc` / `4231ffb` 共 11 commits 落地）。详见下方 §M19 段。
- **2026-08-31 同期动作**：M14 + M15 共 2 个早期批次从 todo-archive.md 主窗口预防性迁出至新分片 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（M19 段新增前主窗口 699 行 + M19 段预估 80-100 行将超 700 强制分片阈值，预防性迁出与 M18/M17/M16 归档批次预防性迁出 M13/M12/M10 同源策略）；主窗口保留范围相应调整为 M19/M18/M17/M16 共 4 个完整段。
- **2026-08-26 同期动作（已迁出）**：M14.1 / M14.2 / M14.3 / M14.x / M14.y + M15.1 详见 [archive/todo-archive-phases-m14-m15.md](archive/todo-archive-phases-m14-m15.md)（2026-08-31 M19 归档批次预防性迁出）。M14.1 / M14.2 / M14.x / M14.y 阶段 commits 已全部推送至 `origin/master`（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-26 实测）；M15.1 3 commits 落地 + release.yml CI 修复 1 commit 同期落地（后续已推送 origin/master；ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) 动态核验）。

---

## M41: 规范与经验管理体系重构（M41.1~M41.5 全部已闭环 / 2026-10-10 归档）

> **归档日期**：2026-10-10
> **阶段摘要**：承接 M40 运行时可靠性与可观测性深化归档后的**治理体系重构**阶段。根因为「**有规则无门禁 → 必 drift**」——规范混入实现与教训、经验体系体量膨胀且无退出路径、阈值声明双事实源、规则与执行分离（关键词检查仅报告、CI 未接线）。设计依据 [standards-experience-refactor.md](../design/governance/standards-experience-refactor.md)（v2 先行稿）；经 2026-10-10 用户决策（方案 B）从 backlog §候选评估整卡上收，A-E 五批对应 M41.1~M41.5。**5 原子条目全部闭环**，覆盖 📚 1 + 🛠️ 1 + 🧪 1 + 🎨 1 + 🛡️ 1（🎨 独立条目 1 项低于类型平衡建议值 2 且无能力扩展独立条目，缺口显式标注）。
>
> - **阶段启动规划**：`1681d0a`
> - **M41.1** [P2 📚 规范治理] 规范去实现化瘦身（A1 `ab55d86` / A2 `9245ebf` / A3a `2362d2f` / A3b `0d69f72` / 闭环 `82c723c`）
> - **M41.2** [P2 🛠️ 经验治理] 经验体系三层收敛与精简（`95b20cf` + 闭环 `a19f9d0`）
> - **M41.3** [P2 🧪 测试基建] 规范 / 经验门禁落地（C1 `062c365` / C2 `3c2cd9c` / 闭环 `30dd819`）
> - **M41.4** [P3 🎨 文档体验] 文档站导航分层（`c748cc8` + 闭环 `7eb888d`）
> - **M41.5** [P3 🛡️ 治理同步] 阈值与事实源唯一化（`f27575b` + 闭环 `181defc`）
>
> **commit 数量实证**：`git log master --first-parent --oneline 1681d0a^..HEAD` 去重统计 = **16 commits**（阶段启动 1 + M41.1 5 + M41.2 2 + M41.3 3 + M41.4 2 + M41.5 2 = 15 属本阶段），另有 **1 commit 属并行 session 的候选登记**（`ee2151d` `ensureGitignore()` 幂等失效候选 → backlog §候选评估中），不计入本阶段原子条目。
> **关键决策**（用户裁定 + 各原子 D 阶段定稿）：① **用户决策方案 B**（先出设计先行稿 → 评审后按 A-E 分批）；② M41.1 剥离方式 = **保留段骨架 + 压缩 + 一行外链**、迁移落点 = **纯文档**（不下沉源码）；因「保留全部标题」与「≤200 行」预算冲突，追加裁定 = **合并无外部引用的叶子标题**为带编号加粗条目（编号文本保留以维持全仓文本引用）；③ M41.2 = **纯精简不重分片**（`## §NN` 标题与编号零变化）、决策记录载体 = 索引文件、L3 = 单索引文件；④ M41.3 阻断强度 = 超强制分片阈值阻断 / warning 仅报告，落点校验 = **独立脚本**，豁免形态 = 脚本内 `{ path, reason }` 显式表；⑤ M41.4 非挂载页卡片 = 改指语义更贴的已挂载页或移除，en 侧栏按**实际译文**裁剪；⑥ M41.5 合并口径 = 以 `documentation.md §3` 行为序（**取值零改动**），归档索引同类阈值段判定同源一并收敛。
> **类型平衡复核**：📚 规范治理 1（M41.1）/ 🛠️ 经验治理 1（M41.2）/ 🧪 测试基建 1（M41.3）/ 🎨 文档体验 1（M41.4）/ 🛡️ 治理同步 1（M41.5）；🎨 独立条目 1 项低于建议值 2 且无能力扩展独立条目，缺口显式标注。
> **关键实证**（细节见各条目闭环记录）：
> - **M41.1**：standards **3225 → 1644 行**（14 文件全部 ≤200，最大 200）；关键词命中 **166 → 0**（`--strict` exit 0）；代码块与 commit hash 清零；A2 将 `§5.1.x` 38 条转为带编号条目以保全全仓约 150 处文本引用；A3 拆分依据 = 变更越 §1.4 的 10 文件线。
> - **M41.2**：经验体系 **2409 → 1017 行**（单分片最大 375 ≤400）；剥离过程叙事保留「结论 + 落点」；**全 68 条落点具体化**（旧条目补 `落点：` 行）；索引重写为「三层体系 + 分片索引 + 六类主题索引（68 条全覆盖）+ 收敛决策记录」。
> - **M41.3**：新增 `check-doc-size.mjs` / `check-experience-landing.mjs`（各含单测，`scripts/` 630 passed）并接入 CI Test job（三步各含负例标定 / 自指面 / 阻断强度三件套）；关键词门禁**精度收敛**（豁免行内代码与链接整体）；**24 处精确锚点回填**；新门禁首跑即命中 2 条真实缺口（经验分片 §四十一 / §四十二 无规范落点标记）。
> - **M41.4**：挂载面收敛为仅 `architecture` + `governance/index`（恰 6 处）与归档目录零挂载；同时收敛 4 类**真实死链**（旧目录名重命名残留 / 调研侧栏 3 项 / en 导航与侧栏 / 首页未挂载页卡片）；产物实证裁剪生效（保留导航项出现于全部 112 页）。
> - **M41.5**：`documentation.md §3` 成为**唯一权威阈值表**（10 类文档，取值逐行一致）；`spec-and-doc-governance §2.3` 与归档索引 §1 收敛为一行引用；`check-doc-size` 实测计量 **74 文档**（健康 60 / warning 13 / 豁免 1 / 超阈值 0）。
> **审计轮次**：A 阶段覆盖全部 5 原子（M41.1 三批次 deep；M41.2 deep **R1 Reject**（落点占位符 + 分片 H1 误删）→ R2 quick Pass；M41.3 deep **R1 Reject**（CI 三件套声明不全）→ **R2 Reject**（锚点前缀贪婪匹配致 2 处误指）→ R3 quick Pass；M41.4 standard R1 Pass → R2 quick Pass；M41.5 standard R1 Pass → R2 quick Pass），记录在 `artifacts/review-gate/`（gitignored）。
> **未完成项 / 已知边界**（均登记 backlog §候选评估中，不随本阶段闭环）：① **链接文本与锚点章节号一致性**缺机检（本次实测命中 2 处）；② `design/packages → modules` 非导航面残留（蒸馏脚本推荐串 / 设计文档现行陈述 / 模块索引 H1）；③ 站点语言切换器对未翻译页指向不存在的 en 页（VitePress 内建映射）；④ 设计文档存量超健康窗口（warning 带 13 + 强制分片线豁免 1）；⑤ `ai-collaboration.md` 跨段重复编号结构（历史遗留）；⑥ `§49-§57` 经验分片文件名与内容范围不符（历史遗留；⑤⑥ 已另行登记 backlog 候选，不含阶段编号）。
> **ahead commits 实证**：归档批次开始前 `git rev-list HEAD ^origin/master --count` 实测 = **21**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），全部为本阶段及此前 M40 归档批次 commits，待用户推送确认。
> **关联**：[roadmap.md §M41](roadmap.md#m41-规范与经验管理体系重构2026-10-10-用户决策方案-b--2026-10-10-已闭环--归档) + [standards-experience-refactor.md](../design/governance/standards-experience-refactor.md) + [backlog.md](backlog.md)（M41 衍生候选）+ [archive/index.md](archive/index.md)

## M40: 运行时可靠性与可观测性深化（M40.1~M40.6 全部已闭环 / 2026-10-10 归档）

> **归档日期**：2026-10-10
> **阶段摘要**：承接 M39 平台视图体验与可观测补强归档后的运行时可靠性阶段。来源为 2026-10-08 定时扫描批量失败排查中暴露、且经 M38/M39 归档后仍保留在 [backlog.md](backlog.md) 的运行时缺口，以及同批次审计 / 复核衍生的门禁工具缺口。经 2026-10-10 用户决策（方案 A）从 backlog §候选评估中上收 6 项候选；同日追加用户决策（D2）：以「平台环境变量文档完整性治理」（用户直接提出）**替换**原 M40.6（门禁脚本排除 Playwright 产物 → 回退 [backlog.md](backlog.md)），维持 6 原子容量。**6 原子条目全部闭环**，覆盖 🚀 1 + 🎨 1 + 🛠️ 1 + 🛡️ 1 + 🐛 1 + 📚 1。
>
> - **阶段启动规划**：`2339c35`
> - **M40.1** [P2 🚀 能力扩展] 部署产物版本戳 / 陈旧校验（构建期 ARG/ENV `NUXT_BUILD_*` + 公开只读 `GET /api/health` + 启动日志 + CI `--build-arg` + 冒烟端到端断言）—— `fb6f3e9` + `ee22e76` + `b41c87b`
> - **M40.2** [P2 🎨 用户体验] 失败 run 落 summary 快照（failed 分支写 `summaryJson`，仅快照不 reconcile；`alertsFixed` 归零）—— `c6fe50d` + `39c5918`
> - **M40.3** [P2 🛠️ 技术债] 执行超时可配置化（`EXECUTION_TIMEOUT_MS` + 队列锁时长同源联动 + 审计衍生 stale-cleanup 孤儿阈值联动）—— `0b7ac45` + `34b905a` + `45a4437` + `75ccf66`
> - **M40.4** [P2 🛡️ 可靠性] 队列 worker 进程崩溃自动重启（entrypoint 后台看护子 shell：指数退避 + 连续上限 + 稳定窗口归零 + TERM 协同 + 脚本级测试）—— `e33da4f` + `eca733b` + `146ab74`
> - **M40.5** [P2 🐛 缺陷修复] sandbox 降级回退路径落执行日志（回退分支消费 `logsJson`）—— `72013c6` + `cf09537`
> - **M40.6** [P2 📚 文档治理] 平台环境变量文档完整性与配置结构治理（`.env.example` 极简 + `.env.full.example` 完整 + `configuration.md` 平台段重构 + `trustedOrigins` 变量兼容）—— `8224291` + `d0e4a49` + `f3f31ba` + `c3a5bbf` + `cd99732`
>
> **commit 数量实证**：`git log master --first-parent --oneline origin/master..HEAD` 去重统计 = **20 commits**（阶段启动 1 + M40.6 5 + M40.5 2 + M40.2 2 + M40.3 4 + M40.4 3 + M40.1 3；每个 commit 仅归属一条目，无重复计数）。
>
> **关键决策**（2026-10-10 用户裁定 + 各原子 D 阶段定稿，完整记录见 [roadmap.md §M40](roadmap.md#m40-运行时可靠性与可观测性深化2026-10-10-用户决策方案-a--2026-10-10-已闭环--归档)）：① M40.1 构建 arg 注入 + 公开无鉴权健康端点 + 不接发布门禁；② M40.2 写 `{ ...result.summary, alertsFixed: 0 }`；③ M40.3 env-only + 保留锁联动；④ M40.4 shell 看护循环 + 指数退避 + 连续重启上限 5 次 + 稳定窗口 60s 归零 + 不影响主进程；⑤ M40.5 回退路径补 `logsJson`；⑥ M40.6 双示例文件 + 修代码兼容 `NUXT_PUBLIC_BETTER_AUTH_URL`。
>
> **类型平衡复核**：🚀 能力扩展 1（M40.1）/ 🎨 用户体验 1（M40.2）/ 🛠️ 技术债 1（M40.3）/ 🛡️ 可靠性 1（M40.4）/ 🐛 缺陷修复 1（M40.5）/ 📚 文档治理 1（M40.6）；🎨 独立条目 1 项低于 [规划规范 §1.1 类型平衡建议](../standards/planning.md#11-硬性约束) 建议值 2，缺口显式标注。
>
> **审计**：A 阶段覆盖全部 6 原子条目——M40.1（standard 2 分区并发 R1 Pass → 收口 2W+2S → R2 quick Pass）/ M40.2（standard Pass）/ M40.3（standard 2 分区并发 R1：P1 Pass + P2 跨分区 W1 blocker → 修复 → R2 quick Pass）/ M40.4（standard 单分区 R1 Pass → 收口 → mutation 全击杀）/ M40.5（quick Pass）/ M40.6（standard 2 分区并发 R1 → 收口 → R2 quick Pass）；记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **20**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），全部为本阶段 commits，待用户推送确认。
>
> **关联**：[roadmap.md §M40](roadmap.md#m40-运行时可靠性与可观测性深化2026-10-10-用户决策方案-a--2026-10-10-已闭环--归档) + [archive/index.md](archive/index.md) + [platform.md §10.5 / §10.6 / §10.7 / §11](../standards/platform.md) + [configuration.md](../guide/configuration.md) + [backlog.md](backlog.md)（M40 衍生候选）

## M39: 平台视图体验与可观测补强（M39.1~M39.6 全部已闭环 / 2026-10-10 归档）

> **归档日期**：2026-10-10
> **阶段摘要**：承接 M38 平台执行模型隔离归档后的平台视图体验与可观测阶段。来源为 2026-10-08 定时扫描批量失败排查中用户在同一批反馈的 8 项平台问题（扫描页按状态筛选与聚合分页 / 扫描历史弹窗关闭按钮与日志区高度 / 告警视图按包聚合 / 运行日志下载 / PR Check 启用 / 环境事件覆盖）——8 项按类型平衡归并为 6 原子（M39.1~M39.6）。同批排查另有「既有基线失败被误判为运行失败（exit code 归因口径）」的引擎口径缺陷 1 项，已按 [§3.1 可用性插队例外](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)先行修复（`e5c59b8`，口径见 [dependency-fixer.md §12.6](../design/modules/dependency-fixer.md)），不计入本阶段；其衍生的 3 项运行时可靠性候选（部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）留 [backlog.md](backlog.md)。**6 原子条目全部闭环**，覆盖 🎨 3 + 🚀 2 + 🛡️ 1。
>
> - **阶段启动规划**：`60575b2`
> - **M39.3** [P2 🎨 用户体验] 告警视图「按包」聚合跨 severity 重复分组修正（组排序键「最高级别 rank × 步长 − 包名序号」保证同包相邻 + 视觉 4 基线重建 + 三处文档口径）—— `b6c5026` + `24708e2` + `de4c3cb`
> - **M39.1** [P2 🎨 用户体验] 扫描页筛选与分页优化（`scan-history/summary` 按 `lastStatus` 过滤 + 两表 CaomeiTabs 分区 + byRepo 客户端分页 + 统计窗口提示）—— `be2af89` + `a41ea33` + `110d691`
> - **M39.2** [P3 🎨 用户体验] 扫描历史弹窗体验（移除冗余 body 关闭按钮 + 日志区 `clamp` 自适应 + `--caomei-dialog-width` 响应式宽度）—— `b97f0f0` + `b241687` + `f9535e1` + `a19d1dc`
> - **M39.5** [P2 🚀 能力扩展] PR Check 监测启用链路打通（`kind` 落库 / 回读 + 表单 `kind` 选择器 + `monitor-status` 只读总开关端点 + env 文档）—— `3b8e322` + `9526fe3` + `9b534fc` + `1d33ec5`
> - **M39.4** [P2 🚀 能力扩展] 运行日志下载与批量下载（`runs-query.ts` 共享筛选层 + 单 run / 批量导出端点 + 413 硬上限 + `download.ts` + 两弹窗入口）—— `70c801e` + `27f7cbe` + `21d1895` + `b4a4af4`
> - **M39.6** [P3 🛡️ 可观测与治理] 环境事件覆盖扩展（`container_unavailable` 事件 + 移除死类型 `docker_daemon_down` + 类型下拉全量对齐 + 通知白名单）—— `e80b7b0` + `723ae5b` + `7bff818` + `e34d157`
>
> **commit 数量实证**：`git log master --first-parent --oneline origin/master..HEAD` 去重统计 = **23 commits**（阶段启动 1 + M39.3 3 + M39.1 3 + M39.2 4 + M39.5 4 + M39.4 4 + M39.6 4；每个 commit 仅归属一条目，无重复计数）。阶段前的 `e5c59b8`（引擎口径插队修复）+ `da148f8`（候选登记）已随 M38 归档末推送 `origin/master`，不计入本阶段。
>
> **关键决策**（2026-10-09 用户决策方案 A + 各原子 D 阶段裁定，完整记录见 [roadmap.md §M39](roadmap.md#m39-平台视图体验与可观测补强2026-10-09-用户决策方案-a--2026-10-10-已闭环--归档)）：6 原子 D 阶段定稿——① M39.1 byRepo 客户端分页 + CaomeiTabs 分区（筛选仅作用于聚合结果，UI 显式标注窗口边界）；② M39.2 视口比例 `clamp` 日志区 + 设计钩子 `--caomei-dialog-width`（inline `:style` 恒胜 `:breakpoints`，既有 breakpoints 为死代码）；③ M39.3「一个包一组」组排序键；④ M39.4 服务端端点导出（单 run txt / 批量合并单 txt / 运行数 100 + 字节 5 MiB 硬上限 413）；⑤ M39.5 env-only 总开关 + 只读状态端点 `monitor-status`（避免构建期烘焙的公开配置漂移）；⑥ M39.6 环境事件 / 运行失败分类边界 + `docker_daemon_down` 移除 + 通知类型白名单。
>
> **类型平衡复核**：🎨 用户体验 3（M39.1 / M39.2 / M39.3）/ 🚀 能力扩展 2（M39.4 / M39.5）/ 🛡️ 可观测与治理 1（M39.6）；🧪 无独立条目（测试随各条目内嵌与 M39.3 视觉基线重建），缺口显式标注，接近 [规划规范 §1.1 类型平衡建议](../standards/planning.md#11-硬性约束)。
>
> **审计**：A 阶段覆盖全部 6 原子条目（M39.3 / M39.1 / M39.2 / M39.5 与 M39.4 / M39.6 均为 `standard` 2 分区并发）—— 全部 R1 Pass → 收口 warning / suggest → R2 quick Pass，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **23**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），全部为本阶段 commits，待用户推送确认。
>
> **关联**：[roadmap.md §M39](roadmap.md#m39-平台视图体验与可观测补强2026-10-09-用户决策方案-a--2026-10-10-已闭环--归档) + [archive/index.md](archive/index.md) + [platform.md §7 / §11](../standards/platform.md) + [backlog.md](backlog.md)（M39 衍生候选）

## M38: 平台执行模型隔离（M38.1~M38.6 全部已闭环 / 2026-10-09 归档）

> **归档日期**：2026-10-09
> **阶段摘要**：承接 M37 完整闭环归档后的独立治理阶段。2026-10-06 用户基于生产运行日志根因分析授权开阶段——消除平台 in-process BullMQ Worker 因引擎同步子进程调用阻塞主线程 event loop 导致的 `could not renew lock` / `Missing lock (code -2)`（锁过期 → job 被判 stalled 重排 → 潜在重复执行）。首个交付为方案 ①/②/③ 选型设计先行稿（[executor-process-isolation.md](../design/governance/executor-process-isolation.md)，2026-10-08 定稿）；经用户裁定方案 ① 为主线 + 方案 ③（锁参数与观测）阶段内止血。**M38.1 D 阶段前置实证发现方案 ①（BullMQ sandboxed processor）在本仓库 Nitro 单 bundle 构建体系下无法原样落地**（4 条硬事实：业务代码内联 `chunks/nitro/nitro.mjs` / 产物导入即顶层 listen / Nitro 无额外入口 / `packages/cli/dist` 不自包含；详见 [设计稿 §3.1](../design/governance/executor-process-isolation.md)），经用户再次裁定改用**方案 ①′（独立 worker 进程）**。**6 原子条目全部闭环**，覆盖 🛡️ 2 + 🛠️ 1 + 🧪 1 + 📚 1 + 🎨 1。
>
> - **设计先行稿 + 阶段启动规划**：`194a558`（executor-process-isolation.md 三方案选型）+ `8c5c71c`（阶段启动登记与上收）
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

## M36: 治理债清仓 + 可观测性与测试稳定性（M36.1~M36.10 全部已闭环 / 2026-10-05 归档 → 2026-10-10 M41 归档批次预防性分片迁出）

> 完整段见 [archive/todo-archive-phases-m36.md](archive/todo-archive-phases-m36.md)。

## M35: 批量运行终态兜底对账 + 进度可见性修复（M35.1~M35.6 全部已闭环 / 2026-10-02 归档 → 2026-10-10 M40 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m35.md](archive/todo-archive-phases-m35.md#m35-批量运行终态兜底对账--进度可见性修复m351m356-全部已闭环--2026-10-02-归档)。

---

## M34: 治理与体验收口 + 组件库升级与巡检基建（M34.1~M34.7 全部已闭环 / 2026-10-01 归档 → 2026-10-10 M39 归档批次预防性分片迁出）

> 详见 [archive/todo-archive-phases-m34.md §M34](archive/todo-archive-phases-m34.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)。

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
