# 路线图阶段详情：M58 发布链可信收口

> 本分片由 2026-11-12 M58 阶段归档批次从 [roadmap.md](../roadmap.md) 迁出；M0-M38 见 [roadmap-phases-m0-m38.md](roadmap-phases-m0-m38.md)，M39-M48 见 [roadmap-phases-m39-m48.md](roadmap-phases-m39-m48.md)，M49 见 [roadmap-phases-m49.md](roadmap-phases-m49.md)，M50 见 [roadmap-phases-m50.md](roadmap-phases-m50.md)，M51 见 [roadmap-phases-m51.md](roadmap-phases-m51.md)，M52 见 [roadmap-phases-m52.md](roadmap-phases-m52.md)，M53 见 [roadmap-phases-m53.md](roadmap-phases-m53.md)，M54 见 [roadmap-phases-m54.md](roadmap-phases-m54.md)，M55 见 [roadmap-phases-m55.md](roadmap-phases-m55.md)，M56 见 [roadmap-phases-m56.md](roadmap-phases-m56.md)，M57 见 [roadmap-phases-m57.md](roadmap-phases-m57.md)。

---

> **归档结果**：5 原子全部闭环，阶段窗口首父链 **18 commits** / 唯一 diff **25 文件 / +1783 −521**（M58 自身 17 commits / 23 文件 / +1629 −123）；全部已推送（`origin/master` = `9d5fbbcd`）。执行记录与验收证据见 [todo 分片](todo-archive-phases-m58.md)。

## M58: 发布链可信收口（2026-11-12 规划 / 2026-11-12 归档）

用户 2026-11-12 决策「全部纳入、分四期」：① 发布链可信收口（本阶段 M58）→ ② 沙箱 fix 与执行可靠性 → ③ 平台减法与页面治理 → ④ 文档与 AI 治理。后三期在 M58 归档后逐期规划，backlog 候选不预先分配阶段编号。

**五个原子**：M58.1 本地发布通道安全门禁 / M58.2 release 依赖审计与构建面同口径 / M58.3 CHANGELOG 新鲜度 / M58.4 发布后镜像原生双架构冒烟 + 历史 tag 巡检 / M58.5 ACR 架构边界。容量基线 11 commits / 19-21 files / 560-970 行（逐原子交付物求和）；实测 M58 自身 17 commits / 23 文件 / +1629 −123，高于预估——新增工作流级负例 run、临时仓库集成用例、`docker.yml` 新 job 与 18 例巡检单测、发布管线 §4.5-§4.7 文档。**执行顺序**：M58.1 → M58.2 → M58.3 → M58.4 → M58.5。「发布后镜像运行时冒烟」为 M57 因插队再平衡移出的候选，本阶段重新上收。

M57（执行面可信与发布验证收口）已于 2026-11-10 归档，详情见 [roadmap-phases-m57.md](roadmap-phases-m57.md)；执行记录见 [todo-archive-phases-m57.md](todo-archive-phases-m57.md)。
