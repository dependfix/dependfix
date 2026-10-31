# M27: 用户体验 + 治理优先（2026-10-15 M44 归档批次迁出）

> 本分片自 [todo-archive.md](../todo-archive.md) 主窗口迁出（2026-10-15 M44 阶段归档批次）；
> 内容与 commits 关联表原样保留；主文档仅留指针段。

## M27: 用户体验 + 治理优先（M27.1+M27.2 W1+M27.3 W2+M27.4 W4+M27.5 全部已闭环 / 2026-09-10 归档）

> **2026-09-10 M27 归档批次迁出**：M27 段（5 原子条目 8 atomic commits 实施 + 3 docs 收口 commits = **11 commits**）已从 `todo.md` 主窗口迁入 [todo-archive.md §M27](#m27-用户体验-治理优先-m27-1-m27-2-w1-m27-3-w2-m27-4-w4-m27-5-全部已闭环-2026-09-10-归档)。M27 段完整实施记录 / 关键经验 / 待迁移经验均在 git log 中可查。主窗口 [todo-archive.md §M27](#m27-用户体验-治理优先-m27-1-m27-2-w1-m27-3-w2-m27-4-w4-m27-5-全部已闭环-2026-09-10-归档) 仅保留导航指针 + 关键 commit 实证。
>
> **关键导航**：
> - **roadmap 状态**：[roadmap.md §M27](roadmap-phases-m0-m38.md#m27-用户体验-治理优先-2026-09-10-用户决策修订方案-b-1-2026-09-10-m27-1-重复评估修正-2026-09-10-已闭环-归档) + Milestone 概述表 M27 行状态更新（active → 已完成 2026-09-10 归档）
> - **archive 索引**：[archive/index.md §4 当前基线](index.md) + §5 近期归档批次登记 M27 行
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
