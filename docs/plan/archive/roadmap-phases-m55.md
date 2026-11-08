# 路线图阶段详情：M55 1.0.x 修复有效性与执行边界收口

> 本分片由 2026-11-08 M55 阶段归档批次从 [roadmap.md](../roadmap.md) 迁出；M0-M38 见 [roadmap-phases-m0-m38.md](roadmap-phases-m0-m38.md)，M39-M48 见 [roadmap-phases-m39-m48.md](roadmap-phases-m39-m48.md)，M49 见 [roadmap-phases-m49.md](roadmap-phases-m49.md)，M50 见 [roadmap-phases-m50.md](roadmap-phases-m50.md)，M51 见 [roadmap-phases-m51.md](roadmap-phases-m51.md)，M52 见 [roadmap-phases-m52.md](roadmap-phases-m52.md)，M53 见 [roadmap-phases-m53.md](roadmap-phases-m53.md)，M54 见 [roadmap-phases-m54.md](roadmap-phases-m54.md)。

---

## M55: 1.0.x 修复有效性与执行边界收口（2026-11-08 规划 / 2026-11-08 归档）

> **归档结果**：5 原子全部闭环，阶段首父链 **32 commits**、唯一 diff **83 文件 / +2636 −190**；全部 commit 已推送（`origin/master` = `7e42c891`）。执行记录与证据见 [todo 分片](todo-archive-phases-m55.md)。

M55 承接 1.0.0 发布后真实批量运行暴露的三类引擎缺陷（升级判定失效 / 运行预算失控 / 失败不可归因），并在同阶段落地两项用户明确追加的平台需求（仓库级执行超时配置、仓库级跨 major 开关）。**用户决策（2026-11-08）**：选方案 A（引擎修复有效性优先）。

**五个原子**：M55.1 版本化 override 生效校验与交付展示同源 → M55.2 运行预算夹取与双跑成本收敛 → M55.3 失败路径可观测性（日志持久化 + 导出归因）→ M55.4 仓库级执行预算与超时配置（含 PUT partial 修复；批 0 文档外移 + 4a 四片 + 4b）→ M55.5 仓库级跨大版本升级开关。

**容量口径**：预估 5 原子 / 20-26 commits / 53-60 文件 / 2950-4400 行（逐原子交付物求和，含批 0 文档迁移）；实测唯一 diff 83 文件 / +2636 −190，插队 0 批、未触发 §3.1.1 再平衡。

**边界**：不把「开关默认关闭」写成功能未实现；不宣称 G3 / G4 门槛通过（1.0 已按豁免披露，本阶段不改变该口径）；不改 CLI / Action / MCP 既有语义。**不做**：不放开 24 小时级超时上限、不为 GitHub Action 增加隐式跨线通道、不放宽间接依赖与多版本共存人工口径。

---
