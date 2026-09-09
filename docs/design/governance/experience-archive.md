# 经验归档（Experience Archive）

> 本文档保存跨 Session 经验教训的**详细前因后果**，持续追加、不设结束日期。
> 规范文档只保留可执行方法论；需要追溯具体案例时查阅本文档 + 6 个分片。
> 蒸馏机制见 [session-wisdom-distillation.md](./session-wisdom-distillation.md)。

## 准入标准（新增条目前必读）

不是每条经验都值得写入。满足以下**至少一条**才追加新章节（编号连续，按分片追加）：

1. **教训未落入规范**：可执行方法论尚未迁移到 `docs/standards/` 或 skill/agent 定义（本文件只存案例，规范吸收后案例仍保留作溯源）。
2. **决策需要溯源**：产品/技术方向的关键决策（跨线升级、全 ESM、防护策略等），未来需回答"为什么当时这么做"。
3. **重复违规预警**：同一模式已违规 ≥ 2 次（如编号标记、行尾、脚本化编辑），案例用于证明"必须挂检查点"。
4. **工具/环境陷阱**：本地不可测、跨平台差异、工具默认值覆盖等只有真实运行才能暴露的问题。

**不值得写入**：教训已完全内化且无决策溯源价值的一次性偶发；纯环境噪音（无普适启示）；泛泛而谈无具体案例/硬数据（run ID、commit、文件数）的"心得"。

## 章节编号硬性规则

- 章节编号（§一、§十六 等）跨整个经验归档全局唯一，**不**重新编号，跨文件保持稳定。
- 已删除章节编号不重用（避免外链漂移）。
- 新增章节取当前最大编号 + 1；按内容逻辑写入对应分片。

## 分片索引（按内容逻辑 / 关联性拆分）

| 分片文件 | 章节范围 | 主题 |
|---|---|---|
| [experience-archive-§1-§21-spec-compliance.md](./experience-archive-§1-§21-spec-compliance.md) | §一 - §二十一 | 规范执行与测试断言（编号标记 / 批量替换 / 防护正则 / 测试断言 / 脚本编辑等）|
| [experience-archive-§22-§28-ci-environment.md](./experience-archive-§22-§28-ci-environment.md) | §二十二 - §二十八 | CI 环境与 monorepo 拆包（CI 链式 / 统一行尾 / 单次大 diff / 包清单 / git tag / monorepo CI / CI 修复洋葱）|
| [experience-archive-§29-§35-integration.md](./experience-archive-§29-§35-integration.md) | §二十九 - §三十五 | 集成测试与外部库（e2e 基建 / TypeORM 复合索引 / BullMQ / HTML 标签 / destr / workspace 依赖）|
| [experience-archive-§36-§40-toolchain.md](./experience-archive-§36-§40-toolchain.md) | §三十六 - §四十 | 工具链与编码陷阱（锚点漂移 / git tag committer / PowerShell 文本 / 入口守卫 / 批量替换）|
| [experience-archive-§41-§48-archive-batch.md](./experience-archive-§41-§48-archive-batch.md) | §四十一 - §四十八 | 归档批次与设计取舍（cgroup 集成测试 / Coverage 阈值 / 集成外部库 / Code Scanning / 删过头 / PrimeVue v-model / over-engineering / 断链）|
| [experience-archive-§49-§57-recent-investigation.md](./experience-archive-§49-§57-recent-investigation.md) | §四十九 - §五十七 | 近期根因排查与治理（atomic commit / SQLite 清空 / E2E / Playwright / fixture / M23.3 / M24.1 PR Check / M22.7+M22.8 根因）|
| [experience-archive-§49-§57-recent-investigation.md](./experience-archive-§49-§57-recent-investigation.md) | §五十八 - §六十二 | M25 阶段治理与 M25→当前 25 commits 文档治理批次（PrimeUI License 降级 / 三执行器同步透传 / baseline lint 治理 / i18n-anchor-check 工具化 / 25 commits 文档治理批次）|

**外链引用规范**：所有跨文件 / 跨文档引用按 §编号 命中（如 `#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修`）。锚点 slug 规则见 [documentation.md §2 链接检查](../../standards/documentation.md)。

**新增章节流程**：判断归属分片 → 在对应分片末尾追加新章节（编号 = 主窗口最大 + 1）→ 在主窗口"分片索引"表更新章节范围。