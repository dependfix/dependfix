# 待办事项归档分片 — M33

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-09 M38 归档批次预防性分片迁出：M38 段新增后主窗口完整段将达 6 个，超 [archive/index.md](../archive/index.md) §2 定义的「3-5 个已归档阶段」上界；M33 是主窗口最早的完整段，按该健康策略预防性迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

---

## M33: 治理债收口 + 测试基建扩展（M33.1~M33.11 全部已闭环 / 2026-09-30 归档）

> **归档日期**：2026-09-30
> **阶段摘要**：承接 M32 完整闭环归档后的 backlog 候选池。2026-09-30 用户决策**方案 A（治理 + 测试基建收口）**，从「评估完成待上收」候选（C91 / C93 / C94 / C80 剩余）与本批评估新登记的可行动已知边界项（视觉回归 CI 转阻断 / M31 dependabot 死配置清理）中上收 6 原子条目；阶段内 M33.7（迁移命令入口）与 M33.8–M33.10（UI 修复批次）经用户直接决策追加，M33.11（devDeps 存量漏洞治理）按插队例外清单第 2 类经用户明确授权追加。**11 原子条目全部闭环**，覆盖 📚 1 + 🛠️ 4 + 🧪 2 + 🎨 3 + 🛡️ 1，类型平衡完整（UX 缺口由用户直接决策批次补齐）。
>
> - **M33.1** [P3 📚 治理] C91 新增规范条款的 review 检查点补挂（「规范条款 review 检查点矩阵」21 行落点）—— `4543a54` + `3ff4595`
> - **M33.2** [P3 🛠️ CI 治理] 视觉回归 CI job 转阻断（移除 `continue-on-error`，依据 run `36602407382` 首个全绿 run）—— `faba8f3` + `921d6a6`
> - **M33.3** [P3 🛠️ 依赖治理] M31 迁移遗留 dependabot 死配置清理（3 条 PrimeVue `ignore` 移除）—— `f8359a8`
> - **M33.4** [P3 🧪 测试覆盖] C93 视觉回归 pr-checks 行级覆盖（fixtures `prChecks` 写入路径 + 5 行行级基线）—— `27d5254` + `8d40230`
> - **M33.5** [P3 🧪 测试覆盖] C94 视觉回归 alerts 宽表右端列盲区（元素级补拍 `alerts-right-*`）—— `1732795` + `a912e34`
> - **M33.6** [P3 🛠️ CI 政策] C80 剩余 devDeps 链漏洞阻断语义（方案 C 观察期 + 可判定转正条件）—— `f841695`
> - **M33.7** [P2 🛠️ devEx 治理] 数据库迁移命令入口补齐（`db:migrate` CLI 复用 `createDataSourceOptions` 并强制双 false 解耦）—— `0fd45ef`
> - **M33.8** [P2 🎨 用户体验] 弹窗表单布局规范统一（label 间距 / actions 右下 / 刷新按钮对齐）—— `2d796f6` + `cd98bfc`
> - **M33.9** [P2 🎨 用户体验] 主按钮视觉与加载态（teal-700 白字 5.47:1 + reduced-motion 脉冲兜底）—— `a03dbf7` + `f5d9c77`
> - **M33.10** [P3 🎨 用户体验] 告警筛选行「显示已解决」对齐（控件区补足控制档高度 + 居中）—— `d3d2802` + `70606fb`
> - **M33.11** [P2 🛡️ 安全插队] devDeps / 运行时链存量漏洞治理（overrides 升级，audit 13 条 → 0）—— `bb88f26` + `77f95c2`
>
> **commit 数量实证**：`git log master --first-parent --oneline` 按 `M33` 去重统计 = **20 commits**（阶段启动 `e6c5502` + 11 原子条目的实现与闭环登记 commits），全部已推送 `origin/master`。
>
> **关键决策 D1-D9**（2026-09-30 用户裁定；完整记录见 [roadmap.md §M33](../roadmap.md#m33-治理债收口--测试基建扩展2026-09-30-用户决策方案-a--2026-09-30-已闭环--归档)）：
>
> - **D1**：方案 A（治理 + 测试基建收口）——6 原子条目，类型平衡 📚 1 + 🛠️ 3 + 🧪 2
> - **D2**：C80 采用**方案 C（观察期）**——维持 `|| true` + 标注可判定转阻断条件（存量清零后连续 3 次 `master` push clean）
> - **D3**：视觉回归 CI 转阻断以 run `36602407382` 首个全绿 run 为转正依据，转阻断后以真实 CI run 裁决（run `36704146211` Visual Regression job = success）
> - **D4**：**不纳入** C81（注释孤立编号清理，须分批）与 C83（验证链既有失败基线判定，方案未定）
> - **D5**：阶段启动 commit 仅改 `docs/plan/*`（P 阶段规划暂停协议）
> - **D6**（P 阶段 A 阶段审计收敛）：第 1 轮 `standard` Pass（0 blocker / 4 warning / 6 suggest）；warning 落点登记到对应条目交付物
> - **D7**：M33.7「现在就补齐迁移入口」经用户直接决策追加（属 [规划规范 §3.1](../../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径，非插队例外 3 类）
> - **D8**：M33.8–M33.10 UI 修复批次经用户直接决策追加；执行顺序 M33.9 → M33.8 → M33.10（先落全局色板以免基线二次改写）
> - **D9**：M33.11 devDeps 存量漏洞治理经用户明确授权按插队例外清单第 2 类追加；执行顺序 M33.11（清存量）→ M33.6（落阻断语义口径，观察期以存量清零为起点）
>
> **类型平衡复核**：📚 治理 1（M33.1）/ 🛠️ CI 与 devEx 治理 4（M33.2 / M33.3 / M33.6 / M33.7）/ 🧪 测试覆盖 2（M33.4 / M33.5）/ 🎨 用户体验 3（M33.8 / M33.9 / M33.10）/ 🛡️ 安全 1（M33.11）。
>
> **关键实证**（细节见各条目闭环记录与相关规范文档）：
>
> - **M33.1**：`code-quality-checklist` 新增「规范条款 review 检查点矩阵」，覆盖 M30 / M32.4 / M32 归档批次蒸馏新增条款（含 `platform.md §3.8` 委托既有必查项不重复挂接）
> - **M33.2**：转阻断后真实 CI run `36704146211`（headSha `8d40230`）Test workflow = success，Visual Regression job = success（阻断语义在真实 CI 成立）
> - **M33.4**：fixtures 端点新增可选 `prChecks` 写入路径（POST 幂等复用 + DELETE 级联删除 + 3 单测）；基线由空态升级为 **5 行**（结论标签四档 danger / success / warning / primary + Alert 状态三态）
> - **M33.5**：`expectLocatorScreenshot` 增加可选 `mask` 参数；反例验证注入两列颜色变更差异 **40948 px ≫ maxDiffPixels 200**，右端两列确被覆盖
> - **M33.6**：`security.md §5.6` 落定方案 C 观察期与转阻断配套（`--ignore-registry-errors`）+ 可复现统计命令；维持 `|| true`
> - **M33.7**：`createMigrateDataSource` 强制 `synchronize` / `migrationsRun` 双 false 解耦；20 单测 + mutation 标定 4/4 被捕获
> - **M33.9**：主按钮 teal-700 `#0f766e` + 白字 = 5.47:1（AA）；loading 根因 = 库内 `prefers-reduced-motion: reduce` 抑制旋转 → 补不依赖旋转的透明度脉冲兜底
> - **M33.11**：overrides 升级 brace-expansion 三条 major 线 + `fast-uri@3` + moment，并移除 stale 通用钉定 `fast-uri: 3.1.6`；`pnpm audit` 13 条（5 moderate / 8 high）→ 0，Dependabot open alerts 8 → 0（推送后 `gh api .../dependabot/alerts?state=open` 实测）
>
> **审计**：A 阶段覆盖全部 11 原子条目 —— M33.1（deep Pass → standard 复审 Pass）/ M33.2（standard Pass）/ M33.3（quick Pass → 复审 Pass）/ M33.4（standard Pass）/ M33.5（quick Pass）/ M33.6（standard Pass）/ M33.7（standard Reject → 复审 Pass）/ M33.8（standard Pass）/ M33.9（standard Reject ×2 → quick Pass）/ M33.10（quick Pass）/ M33.11（standard Pass）。
>
> **未完成项 / 已知边界**（均登记 backlog，不随本阶段闭环）：
>
> - 本地 devEx：运行时 `data/` 产物污染 vitest 与 check-docs（M33.7 验证期登记）
> - 视觉回归容差对「同明度色相 / 灰度替换」不敏感（M33.9 验证期登记）
> - 非弹窗表单 label↔控件间距口径未统一（M33.8 审计登记）
> - PrimeUI 治理遗留设计先行稿与索引状态陈旧（M33.3 审计登记）
>
> **ahead commits 实证**：M33 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0；期间含远端 dependabot bump 与合并 commit）。
>
> **关联**：[roadmap.md §M33](../roadmap.md#m33-治理债收口--测试基建扩展2026-09-30-用户决策方案-a--2026-09-30-已闭环--归档) + [backlog.md](../backlog.md)（M33 衍生候选）+ [archive/index.md](index.md)
