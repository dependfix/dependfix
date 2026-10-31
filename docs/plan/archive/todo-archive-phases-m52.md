# 待办归档分片：M52 文档平价与验证收口（1.0-F2 批次）

> 本分片由 2026-10-31 M52 阶段归档批次从 [todo.md](../todo.md) 迁出；正文按归档口径压缩（目标 / 落地 / 审计 / 证据 / 边界），相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m52.md](roadmap-phases-m52.md)。

---

## M52: 文档平价与验证收口（1.0-F2 批次，2026-10-30 规划 / 2026-10-31 归档）

> **归档摘要**：4 原子（P1 3 + P2 1）+ **4 批追加临时待办**（用户授权、不占阶段条目编号：caomei-ui 1.0.0-rc.1 升级 / lint 门禁 check 通道 / 任务开局 CI 回执检查与 stylelint / 依赖 advisory 修复）。阶段窗口首父链 **47 commits**（规划 1 + caomei 升级 3 + caomei 追加 12 + lint 门禁 8 + CI 规则 4 + 依赖修复 4 + M52.1 5 + M52.2 4 + M52.3 3 + M52.4 3；`git rev-list --first-parent --count 4d604823..HEAD` 实测 47），唯一 diff **185 文件 / +5218 −1262**（`git diff --shortstat 4d604823..HEAD`）；其中四原子单独为 **130 文件 / +3621 −791**（`git diff --shortstat 7c6b2d85..HEAD`）。
> **证据来源**：阶段终态取自 `.session/runtime-state.json` §`m52_progress`，分原子当期数字取自 `.session/current-task.yaml` 各原子条目与 `artifacts/review-gate/2026-10-31-m52-*.md`，commit / diff 取自 `git log` / `git diff --shortstat`；分原子「证据」段为**闭环当期**口径，阶段终态见「阶段收口」。
> **阶段目标**：把 1.0 的「文档与验证」欠账收口——双语指南与设计镜像可判、站内锚点真能跳转、视觉基线与覆盖率证据可复现。来源 = [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) §3.1 F2 六项 + §3 G5 覆盖率复测。
> **用户决策（2026-10-30）**：① `caomei-ui` 升级按「追加临时待办」处理（依赖升级不在插队例外清单内，授权只改「可否进入当前阶段」）；② 设计镜像按「结构映射 + 索引补全」收口，**不重译 60+ 篇 zh 设计文档**。**2026-10-31 追加授权**：锚点迁移范围扩至站点外 md（含 `AGENTS.md`）。
> **§3.1.1 容量记录**：插队 4 批全部为用户直接指示授权，阈值 1「累计插队批次 ≥3」命中；再平衡移出 0 项（风险面为依赖 / CI / 治理文档，未新增业务模块或数据面）。阶段实测远超预估（原子预估 33-49 文件 / 1070-1820 行 / 10-12 commits；四原子单独 130 文件 / +3621 −791，含四批追加后 185 文件 / +5218 −1262，主因是锚点迁移实际缺口为预估的 2 倍、英文指南为整体重写）。

---

### M52.1 [P1 🧪] 归档锚点按产物 id 迁移 + 门禁归一化补强（**已闭环** `60a70415` + `20c4ba3d` + `45ad719e` + `3cc6dbc0` + `626b7c61`）

- **目标**：站内锚点真正可跳转——把 GitHub 口径的 `--` / 数字前缀写法迁移为 VitePress 产物 id，并让门禁能拦住旧形态。
- **落地**：新增 `scripts/docs/vitepress-slug.mjs`（对齐 VitePress 1.6.4 slugify：NFKD 全角归一、`--` 收敛、数字开头 `_` 前缀、`{#custom}`、used-id 自增去重、行内 HTML 标签剥离 / 标签内文本保留）+ `migrate-anchors.mjs`（精确 id → 宽松唯一 → 唯一前缀三级判定，plan 与 apply 共用 `fenceMask`）+ `verify-anchor-dist.mjs`（产物 id 复核 + slug 口径自校验）；`check-docs` 增第 8 条规则 `anchor-id`（锚点逐字符等于产物 id，报错带目标文件与应改成的 id）；`collectTitles` 改为与 VitePress 同源（行内代码内容参与 slug）；`docs:check:anchors` 接入 `gates:docs` 紧随 `docs:build`；`scripts/shared/md-walk.mjs` 排除 `.opencode` 软链镜像。迁移 **696 处 / 97 文件**（预估 306 处）+ 5 处人工改指（2 处同名标题歧义 + 3 处标题文本已变）。规范：[documentation.md](../../standards/documentation.md) 锚点口径改为「以产物 id 为准」。
- **审计**：R1 两分区 **Reject**（A：`applyAnchorRewrites` 会改写 fenced code block 内同形链接；B：4 处治理文档仍写「七类规则」）→ 全收口 → R2 **Pass**（新增 fence 缩进 warning）→ 收口 → R3 **Pass**（8 条新问题全处置：自校验降为 warning、`check-docs` fence 语义统一到 `fenceMask`、`.opencode` 去重下沉到 `MD_EXCLUDED_DIRS`）。
- **证据（闭环当期）**：`gates:docs` **17 项**（本原子只接 `docs:check:anchors`）；`scripts` 单测 **924**；`docs:check:anchors` 157 页 / 783 处全命中 + slug 自校验 157/157；`migrate-anchors` 幂等 0 处；负例（写回 `#2-四条基本原则` → `anchor-id` exit 1，同一输入 `links` 仍绿）。阶段终态为 19 项 / 957（含后两原子的 `docs:check:guides` / `docs:check:mirror`）。
- **边界**：slug 模拟面不覆盖块引用内标题、emoji shortcode、缩进代码块（登记为已知边界，由产物复核兜底）；`—` / `对` 等符号保留属 VitePress 事实，手写须逐字复制。

### M52.2 [P1 📚] en-US 指南平价（配置指南 + quick-start）+ 平价机检（**已闭环** `6cb1e535` + `34d8a173` + `def958ba` + `46f3b87b`）

- **目标**：两篇英文指南与 zh 事实源同源（章节结构 + 配置键 / 参数键位），并加机检防止再次漂移。
- **落地**：新增 `scripts/docs/check-guide-parity.mjs`（env 全量 `UPPER_SNAKE` + 常量 denylist / `--flag` / Action 输入表首列 / H2 逐条标题映射 + H3 数量；`en ⊇ zh`，键位取不到即 fail-closed，豁免需理由且未命中会被点名）+ 17 例单测 + `docs:check:guides` 接入 `gates:docs`。en 侧：`configuration` 补「Environment variables」整节 + 配置项 8 行 + 5 个 H3；`quick-start` 全篇按 zh 结构重写（Action 输入 32 键、CLI 参数 44 行、sandbox 安全、跨版本升级、GitHub App、Exit codes / Next steps）。**旧 en 正文含不存在的能力**（`--keep-last` / `--pr-title` / `--pr-body` / `defineConfig` / `--alerts-source github` / 「fix 模式默认建分支并推送」），随重写删除。中英同改事实错误：CVE-2024-21626 的 GHSA 链接（原 id 404）、`npx dependfix report` → `report-only`、`M4+` / `C52` 过期表述、`pr-creator.ts` 指针漂移；两张参考表按代码与 `action.yml` 补齐。代码侧订正 `--ai-api-key` 优先级（help 与注释原写「env 优先」，实现是 CLI 优先）与 `--max-repos` 负数语义（原注释「负数不限制」，实现拒绝负数）。
- **审计**：R1（A **Pass** 6 warning / B **Reject** 2B：`--ai-api-key` 优先级与实现相反、GHSA 链接 404）→ R2（B **Reject** 1B：`DEPENDFIX_VERIFY_TIMEOUT_MS` 行插错表且少一列）→ R3 **Pass**。
- **证据（闭环当期）**：`gates:docs` **18 项**（本原子接入 `docs:check:guides`）；`scripts` 单测 **941**；`packages/cli` 168；`check:docs` 8 条规则；`lint:md:check` 0 违规。
- **边界**：zh 侧 CLI 表仍缺 `--ai*` 等已实现参数（不改 zh 事实源的既定约束，已登记 backlog）；配置示例文件形态两侧不同（`dependfix.config.*` 未实现，不在比对面内）。

### M52.3 [P1 📚] 设计镜像与台账平价（结构映射 + 索引补全）（**已闭环** `6000e810` + `10826e92` + `559b5ca6`）

- **目标**：zh 设计文档 60+ 篇与 en 4 篇镜像之间「结构可映射、无静默缺口」，1.0 台账入口在 en 侧可达。
- **落地**：新增 `docs/i18n/en-US/design/mirror-manifest.md`（4 篇镜像的 zh→en H2 映射、`English-side sections` 三列登记英文侧小节的 zh 落点、63 篇未镜像分片逐条附理由）+ `docs/design/mirror-manifest.md` 中文入口页（站点要求 en 页有根 locale 对应页）+ `scripts/docs/check-design-mirror.mjs`（zh 分片集 ↔ 清单 ↔ en 页面集三方一致、H2 映射与两侧真实标题逐条比对、`—` 去向 / 理由非空 / 重复登记 / 第三列 zh 落点真实性）+ 16 例单测 + `docs:check:mirror` 接入 `gates:docs`；en 治理索引补 readiness 等 10 行、订正 executor-sandbox / mcp-server / repo-execution-limits 状态。
- **审计**：R1 **Reject**（2B：`English-side` 8/10 行把 zh 已有章节误标为英文独有、未上收的 `repo-execution-limits` 写成已落地）→ 全收口 → R2 **Reject**（1B：两页跨 locale 链接在站点产物里 404，`check:docs` 只查磁盘路径故假绿）→ 改为 zh 页外链 + en 页正确相对深度并在 dist 实测 → R3 **Pass**。
- **证据**：`gates:docs` 19 项；`scripts` 957；`check:design-mirror` 4 篇镜像 / 64 篇未镜像；`docs:build` 后两页互链 href 目标实测存在。
- **边界**：en 侧 4 篇镜像正文仍为历史版本（部分章节与 zh 分片对应、部分未译），不承诺逐字等价；全量翻译登记 1.0 后评估。

### M52.4 [P2 🧪] 视觉确定性与归因证据补强 + G5 覆盖率复测（**已闭环** `4d4b7c83` + `159f70cb` + `b436030f`）

- **目标**：消除 `dialog-select-open-dark` 运行间非确定性；pr-checks 归因标签获得像素守卫；复测四维覆盖率与 mutation，回填 1.0 台账 G5。
- **落地**：① `apps/platform/server/api/e2e/fixtures.post.ts` 补 `attribution` 透传（schema 接受但写入映射丢失，fixture 类型也未声明）；② 归因标签加 `.pr-checks__signal-attribution` 稳定 class，视觉断言收敛为「归因标签 × 色调 class × 文案」（泛化的 `.caomei-tag--*` 会被同行 kind / state 标签满足）；fixtures 两信号分别 `self_caused`（danger）与 `external_noise`（neutral），基线重建 4242 px；③ `waitForVisualStable` 增加「连续两帧截图逐字节相同」（update 路径原本直接落首帧，`=all` 重写后立即比对曾 1218-1313 px 失配 4 例）；④ `pr-check-style` 单测补「五类归因映射互不相同」；⑤ G5 复测回填；⑥ `budget.test.ts` 时间边界连跑 10 次。
- **审计**：R1 **Reject**（2B：确定性取证是伪证——不带值的 `--update-snapshots` 在比较通过时不写盘；mutation 无工件）→ 全收口（改用 `=all` 取证、补 mutation 工件、断言收敛到归因标签、G5 降 ◐）→ R2 **Pass**（3 warning 已收口：验收口径改「部分达成 + 指向 G / backlog」、backlog 补候选、稳定等待耗尽改为告警不静默）。
- **证据**：视觉 20/20 连跑多轮（集合 sha `8970afaa…`，`=all` 3 轮快照集合恒定）；覆盖率 Statements 89.51% / Branches 84.14% / Functions 89.97% / Lines 89.62%；mutation 3/3（工件 `artifacts/review-gate/2026-10-31-m52-4-mutation.md`）；platform 单测 2382 passed / 9 skipped；`typecheck` 7 包；`gates:docs` 19 项。
- **边界**：`dialog-select-open-dark` 仍有 1/10 的 99 px / maxΔ2 边缘窄带（门禁 100 px，仅余 1 px 预算，已登记 backlog）；`pr-checks` 仅亮色基线；归因标签只覆盖 2/5 类（其余由单测锁定映射）。

---

### 追加临时待办（2026-10-30 / 10-31 用户授权，不占阶段条目编号）

> 四条均为用户直接指示，按 [规划规范 §3.1](../../standards/planning.md)「追加临时待办」标记口径处理；详细闭环记录见各条目的原 todo 正文（本分片只保留结论与证据索引）。

| 批次 | commits | 结论 | 证据 |
|:--|:--|:--|:--|
| caomei-ui 1.0.0-rc.1 升级 + 全选语义适配 | 15（`fdbb4e57`……`d18a3a51`） | ✅ 19/20 基线重建、`control-border` 抬档、跨页选择栏 + 刷新重映射 | e2e 211 passed、视觉 20、单测 2381、三个审计轮次 |
| lint 门禁 check 通道 + 平台存量清理 | 8（`5a0da483`……`bf06f45c`） | ✅ 新增 `lint:check`（无 `--fix`）与平台 20 error 清零、告警预算显式化 | `lint:check` exit 0、负例 exit 1、三工作流切换 |
| 任务开局 CI 回执检查 + stylelint 门禁 | 4（`5fd8220c`……`22de14c6`） | ✅ AGENTS 新增 5 条判据、`lint:css:check` 落地三工作流与周期回归 | `lint:css:check` exit 0、回归单测 39、gates:docs 16 |
| 依赖 advisory 修复（Test CI 红） | 4（`e2500acd`……`7c6b2d85`） | ✅ nuxt 4.6.3 / node-forge 1.4.2 / glob 14.0.3 硬修，仅保留 minimatch 豁免 | audit exit 0、全量 e2e 210、视觉 20 |

### 阶段收口

- **质量门（终态）**：根全量 **366 文件 / 5586 passed / 10 skipped**；`typecheck` 7 包；`lint:check` 0 error（11 warning，平台预算 11/11 未超）；`lint:css:check` 0；`gates:docs` **19 项**；`check:docs` 8 条规则；视觉 20/20；`test:coverage` 四维 89.51 / 84.14 / 89.97 / 89.62。
- **Review Gate**：4 原子全部经 Review Gate（M52.1 3 轮 / M52.2 3 轮 / M52.3 3 轮 / M52.4 2 轮）；首个通过前共 **6 轮审计 Reject 记录、7 个分区级 Reject**（M52.1 R1 两分区 / M52.2 R1 B + R2 B / M52.3 R1 + R2 / M52.4 R1；按 `.session/runtime-state.json` → `m52_progress.audit` 计），收口后全部 Pass；无跳过审计的原子。
- **1.0 台账联动**：F2 六项全部闭环（§3.1 F2 标注 + §5 批次表更新），G5 覆盖率复测完成并标 ◐（mutation 关键模块全覆盖与全量 flaky 面顺延 G）。
- **残余（已登记 backlog）**：① `dialog-select-open-dark` 1/10 的 99 px 边缘抖动（P2 🧪）；② zh quick-start CLI 表缺 `--ai*` 等已实现参数（P2 📚）；③ 设计文档全量英译（1.0 后评估）；④ G5 的 mutation 扩面随 G 批次（落点 = 1.0 台账 G5 行）；已知 e2e flaky（scan-config / repos-crud）由 backlog 既有持续观察项承接。
