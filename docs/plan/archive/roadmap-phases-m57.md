# 路线图阶段详情：M57 执行面可信与发布验证收口

> 本分片由 2026-11-10 M57 阶段归档批次从 [roadmap.md](../roadmap.md) 迁出；M0-M38 见 [roadmap-phases-m0-m38.md](roadmap-phases-m0-m38.md)，M39-M48 见 [roadmap-phases-m39-m48.md](roadmap-phases-m39-m48.md)，M49 见 [roadmap-phases-m49.md](roadmap-phases-m49.md)，M50 见 [roadmap-phases-m50.md](roadmap-phases-m50.md)，M51 见 [roadmap-phases-m51.md](roadmap-phases-m51.md)，M52 见 [roadmap-phases-m52.md](roadmap-phases-m52.md)，M53 见 [roadmap-phases-m53.md](roadmap-phases-m53.md)，M54 见 [roadmap-phases-m54.md](roadmap-phases-m54.md)，M55 见 [roadmap-phases-m55.md](roadmap-phases-m55.md)，M56 见 [roadmap-phases-m56.md](roadmap-phases-m56.md)。

---

## M57: 执行面可信与发布验证收口（2026-11-09 规划 / 2026-11-10 归档）

> **归档结果**：5 原子 + 3 条追加临时待办全部闭环，阶段窗口首父链 **32 commits**、唯一 diff **139 文件 / +4165 −1054**；全部已推送（`origin/master` = `5d6ad40a`），本批归档 / 沉淀 commit 待推送。执行记录与验收证据见 [todo 分片](todo-archive-phases-m57.md)。

M57 把「执行端可信」从平台视图回收到运行时底座：沙箱执行器恢复 report-only 真实执行；队列终态不再被迟到 worker 覆盖；回归与审计门禁不再假绿；平台静态检查与列表顺序可复算。

**用户决策（2026-11-09）**：方向取 A（执行面可信收口）；沙箱执行器「复用 vs 弃用」裁定为复用，本阶段只放行 report-only，fix / fix-and-pr 继续降级 container（等待出站白名单代理接入）。

**五个原子**：M57.1 沙箱执行器复用 report-only 真实执行（deep 审计）/ M57.2 队列终态不被迟到 worker 覆盖（deep）/ M57.3 回归与审计真实性（deep）/ M57.4 平台 typecheck 覆盖 node config / M57.5 列表查询并列次键。

**三条追加临时待办（不占阶段编号）**：① 线上 schema 漂移恢复清单 + 启动期漂移检测（生产事故插队，用户授权）；② 仓库表单错误定位与时长单位友好输入（用户授权，含 core / engine / platform 时长 env 单位写法）；③ 新建仓库「允许跨大版本升级」默认值环境变量（与 ② 同批授权）。

**执行顺序**：M57.4 → M57.5 → M57.2 → M57.3 → M57.1（前 4 项为小步可信度回补，沙箱放最后避免阻塞阶段）。

**容量口径**：预估 5 原子 / 15-22 commits / 35-51 文件 / 1750-2900 行（逐原子求和，M57.6 再平衡移出后）；实测 M57 自身（含规划与追加批）**32 commits / 139 文件 / +4165 −1054**，高于预估——主因是三条追加批（表单时长 ~1213 行、schema 漂移 ~554 行、跨大版本默认值 ~160 行）与 M57.1 全链路（CLI 打包 + 镜像 + 编排 + 文档）。**插队 2 批**（schema 漂移事故 + 同日同批授权两项），累计工作量触发 [规划规范 §3.1.1](../../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 阈值 2，按用户决策移出 M57.6（发布后镜像运行时冒烟）至 [backlog](../backlog.md)。

**边界**：不把 T1002 代理接入夹带进 M57.1；不宣称 fix 模式可用于 sandbox；不为通过门禁放宽阈值；`repos` / `schedules` / `credentials` 等其余列表的排序次键未纳入（api.md 已登记，需另立条目）。

---
