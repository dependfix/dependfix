# 路线图阶段详情：M54 1.0.0 发布窗口决策与发布执行

> 本分片由 2026-11-07 M54 阶段归档批次从 [roadmap.md](../roadmap.md) 迁出；M0-M38 见 [roadmap-phases-m0-m38.md](roadmap-phases-m0-m38.md)，M39-M48 见 [roadmap-phases-m39-m48.md](roadmap-phases-m39-m48.md)，M49 见 [roadmap-phases-m49.md](roadmap-phases-m49.md)，M50 见 [roadmap-phases-m50.md](roadmap-phases-m50.md)，M51 见 [roadmap-phases-m51.md](roadmap-phases-m51.md)，M52 见 [roadmap-phases-m52.md](roadmap-phases-m52.md)，M53 见 [roadmap-phases-m53.md](roadmap-phases-m53.md)。

---

## M54: 1.0.0 发布窗口决策与发布执行（2026-11-01 规划 / 2026-11-07 归档）

> **归档结果**：1.0.0 已发布（npm 5 包 + 6 个包 tag + `v1.0.0` + `v1` + GitHub Release）；镜像 `platform-1.0.0` 三仓库双架构、health 实测 `1.0.0` / 15 表。执行记录与证据见 [todo 分片](todo-archive-phases-m54.md)。

M54 承接 2026-11-01 用户发布窗口决策：**先发 `0.7.0`（dependfix 锚版本，按 `release:plan` 推导）验证 M53 修复后的发布链，再在 2026-11-15 目标窗口发布 `1.0.0`**；采用**有条件发布**，G3 实跑 / G4 窗口按已披露豁免降级，G5 关键模块 mutation、G6 发版文档与 `@v1`、G7 发布级回滚演练等可执行项补齐，G8 用真实指标（2026-11-02 复算：30 天窗口 **25/30 绿**、人工介入 0%、误关 0%；1.0 发布当日须复算）并在发布说明引用。

**六个原子**：M54.1 发布窗口决策台账与发版文档骨架 → M54.2 0.7.0 发布与发布后验证 → M54.3 G5 关键模块 mutation 补全 / M54.4 G4 / G8 读数与 flaky 复测 / M54.5 G7 回滚演练与镜像复核（三者可并行）→ M54.6 1.0.0 发布与 `@v1`。

**豁免边界**：1.0.0 不宣称 G3 通过、G4 不写成 20 连绿 / 2 周无红；Google OAuth 未测列入发布说明「已知限制」；G6 设计文档全量英译不在 1.0。**不做**：不启用自动发布、不删除生产 tag / Release、不把豁免写成通过。

---
