# 待办事项归档分片 — M31

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-05 M36 归档批次预防性分片迁出：M36 段新增后主窗口完整段达 6 个，超 [archive/index.md](../archive/index.md) §2 定义的「3-5 个已归档阶段」上界；M31 是主窗口最早的完整段，按该健康策略迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

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
