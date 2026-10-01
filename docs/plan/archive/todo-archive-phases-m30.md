# 待办事项归档分片 — M30

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-02 M35 归档批次预防性分片迁出：M35 段新增前主窗口 573 行，新增后完整段将达 6 个，超 [archive/index.md](../archive/index.md) §2 定义的「3-5 个已归档阶段」上界；M30 是主窗口最早的完整段，按该健康策略迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

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
> - **M30.5 残留 2 分支**（恢复后 `integrity_check` 失败注入 / sidecar `unlinkSync` 部分失败 `removedSidecars` 状态一致性）—— ESM 模块 mock 受限，已登记 backlog C90（后于 2026-09-28 上收 [M31.6](../todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)）
> - **M30.6 V1 验证产物保留**：`apps/platform/app/pages/__migration-validation/` 验证页 + `caomei-ui@0.3.0` 依赖保留，供 M31 迁移参考（M31 已于 2026-09-28 启动）
>
> **审计**：本归档批次经 A 阶段 code-auditor standard depth 审计（结论见本批次 commit message）。
>
> **ahead commits 实证**：M30 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）。
>
> **关联**：[roadmap.md §M30](../roadmap.md#m30-治理债清理--迁移可行性验证--能力扩展--测试补强2026-09-27-启动--2026-09-28-已闭环--归档) + [backlog.md](../backlog.md)（C90 已上收 [§M31](../todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)；C91 保留于 §规范与治理）+ [archive/index.md §5 批次登记](index.md) + 经验归档（tsdown dts 冲突 / vue-demi allowBuilds / ESM mock 受限）

---
