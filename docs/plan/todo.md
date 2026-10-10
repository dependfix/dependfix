# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M41 进行中**——规范与经验管理体系重构（2026-10-10 用户决策方案 B / 5 原子条目） |
| 下一阶段（未授权） | 无——M41 闭环后再按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估 backlog 候选池 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M40 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M40 已归档；M41 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M41: 规范与经验管理体系重构（2026-10-10 用户决策方案 B / M41.1~M41.5）

> **阶段定位**：承接 M40 运行时可靠性与可观测性深化归档后的治理体系重构阶段。根因为「**有规则无门禁 → 必 drift**」——规范混入实现与教训、经验体系体量膨胀且无退出路径、阈值声明双事实源且无脚本计量、规则与执行分离（`check:standards-redundant` 仅报告、CI 未接线）。经 2026-10-10 用户决策（方案 B，先出设计先行稿 → 评审通过后按 A-E 分批执行）从 [backlog.md](backlog.md) §候选评估中上收整卡，聚焦「规范方法论层化 / 经验三层收敛 / 规则转可执行 / 导航受众切分 / 阈值事实源唯一化」。
> **设计依据**：[standards-experience-refactor.md](../design/governance/standards-experience-refactor.md)（v2 先行稿，170 行；用户 2026-10-10 决策 D1 推进形式 / D2 导航分层形态 / D3 经验体系目标）。
> **类型平衡**：📚 规范治理 1（M41.1）+ 🛠️ 经验治理 1（M41.2）+ 🧪 测试基建 1（M41.3）+ 🎨 文档体验 1（M41.4）+ 🛡️ 治理同步 1（M41.5）= 5 原子；本阶段以治理主线优先，**🎨 独立条目 1 项低于 [规划规范 §1.1 类型平衡建议](../standards/planning.md#11-硬性约束)（建议 ≥ 2）+ 无能力扩展独立条目**，缺口显式标注。
> **§3.4 三重交叉核验**（2026-10-10 启动批次实测，**0 项重复评估**）：① **todo-archive 扫描**——`rg -n "规范与经验|standards-experience-refactor|规范瘦身|经验重构|导航分层|阈值.*事实源" docs/plan/todo-archive.md docs/plan/archive/*.md docs/plan/roadmap.md` **0 命中**；② **git log**——`git log --all --grep` 对「规范瘦身 / 经验重构 / standards-experience」无 commit，`scripts/check-standards-redundant.mjs` 仅 `3ae84e5`（建脚本）/ `cab3710`（lint-staged）两次历史提交，无后续瘦身 / 接线动作；③ **代码 anchor**——`wc -l docs/standards/*.md` = 3211 行（3 文件超 400：platform 544 / development 512 / ai-collaboration 494）；`wc -l docs/design/governance/experience-archive*.md` = 2409 行（§49-§57 单分片 1540 行）；`pnpm run check:standards-redundant` 实测 **166 处命中 / 9 文件**且默认报告不阻断、`--strict` 未接 `.github/workflows/*.yml`；`docs/standards/documentation.md §3` 阈值表**不含** standards / design 行而 `spec-and-doc-governance.md §2.3` 存**重复完整表**（双事实源）；`docs/.vitepress/config.ts` 侧栏仍挂 6 篇 `design/governance/**` 且 `docs/index.md` 卡片指向 `mcp-server` / `security`。
> **用户决策点**（2026-10-10 裁定）：**D1 推进形式** = 先出治理设计先行稿 → 评审后按 A-E 分批执行；**D2 导航分层形态** = 仍发布，仅不进顶栏 / 侧栏（不挂载范围收敛为 `design/governance/**`（除 `architecture` + `governance/index`）+ `plan/archive/**`）；**D3 经验体系目标** = 三层收敛 + 大幅精简。
> **不做什么（阶段级）**：不做 `srcExclude` 物理隔离 / 不拆双站点（发布策略不变）；不删除历史归档原始信息（`todo-archive.md` 等已闭环正文保持原文）；不改规则的事实权威（单点声明原则保留）；不修改 `AGENTS.md`（实测其「硬阈值」为设计文档必要性阈值、与文档行数阈值表异源；如确需改动须用户明确确认）；不引入新工具链（复用既有 vitest / node 脚本与 `scripts/*.mjs` 约定）。

- **M41.1**（P2，📚 规范治理）规范去实现化瘦身
  - **目标**：`docs/standards/*.md` 只保留「规则 + 通用方法 + 极少数项目个性化偏好 + 一行外链」，剥离实现细节（类名 / SCSS 片段 / 结构化路径清单 / 行号）与长段教训 / 实证 / commit hash；`check:standards-redundant --strict` 归零、每文件落至健康窗口。
  - **优先级**：P2
  - **范围**：`docs/standards/*.md`（14 文件 3211 行；重点 3 超 400 行文件：`platform.md` 544 / `development.md` 512 / `ai-collaboration.md` 494）；被剥离内容的迁移落点 = **代码注释** / **设计文档** / **经验索引 L3**（`docs/design/governance/experience-archive*.md`）。
  - **验收标准**（2026-10-10 全部达成）：
    - [x] `pnpm run check:standards-redundant:strict` exit 0——由 166 处命中 / 9 文件 → **0 处命中**（实测 exit 0）
    - [x] `wc -l docs/standards/*.md` 全部 ≤ 200 行（最大值 200：`git.md` / `ai-collaboration.md`；总行数 3225 → 1644）
    - [x] 剥离后无代码块 / commit hash / 长段叙述（`rg -c '^```'` 各文件为 0 + 人工抽查双向确认）
    - [x] 剥离内容有明确迁移落点（既有设计文档 / 使用指南 / L3 归档 / 检查点矩阵），逐文件按 [规划规范 §4.4 第 9 条](../standards/planning.md#44-大批量归档批次操作规范) 双向核验（A 阶段 deep 审计逐节对照确认无静默丢失）
    - [x] `pnpm run check:docs`（149/85）+ `pnpm run lint:md:check` + `pnpm run check:orphan-ids`（0/656）+ `docs:build` 全部通过；单点声明原则保持
  - **D 阶段决策留痕（待裁定）**：① 分片 vs 纯瘦身（超 200 行是否强制分片）；② 迁移落点归属（哪些进代码注释、哪些进设计文档、哪些进 L3）；③ `docs/standards/index.md` 是否需同步调整。
  - **批次拆分说明**：预估 8-14 文件 / 净瘦 ~1200 行，**超过** [规划规范 §1.1 任务粒度约束](../standards/planning.md#11-硬性约束) 的 > 10 文件 / > 800 行阈值 → 内部拆 **3 个可独立提交批次**：**A1** `platform.md`（544 → ≤ 200）；**A2** `development.md` + `ai-collaboration.md`（512 / 494 → ≤ 200）；**A3** 其余 11 个 standards 文件按需瘦身。每批次独立验收点 + 独立 A 阶段审计。
  - **闭环记录**：A1 `ab55d86`（`platform.md` 544 → 197；deep R1 Pass → 修复 2 warning + 1 suggest → R2 quick Pass）/ A2 `9245ebf`（`development.md` 512 → 148、`ai-collaboration.md` 494 → 200；deep R1 Pass，0 blocker / 0 warning）/ A3 `2362d2f` + `0d69f72`（`planning.md` 284 → 151、`security.md` 276 → 118、`testing.md` 245 → 114、`documentation.md` 214 → 95、`i18n.md` 204 → 184、`git.md` 201 → 200；deep R1 **Reject**（archive 盲区锚点回归）→ 修复 → R2 quick Pass）；A3 因变更越 §1.4 的 10 文件线按规则拆为「标题改名 + 引用同步」与「六文件重写」两个可独立验证提交。
  - **延后登记**（A 阶段审计 suggest，非阻塞）：① 为达成关键词归零而剥离的链接锚点片段（`git.md` / `i18n.md` / `ai-collaboration.md` / `platform.md` 等）→ 留 **M41.3** 收敛门禁关键词精度（跳过链接 URL / 锚点）后回填；② `ai-collaboration.md` 重复编号结构（`## 1.4`/`1.5`/`1.6`/`1.7` 出现在 `## 2.` 之后）为历史遗留，重排牵动多处锚点，另行评估。
  - **不做什么**：不改规则事实权威与单点声明结构；不删除历史归档正文；不修改 `AGENTS.md`；不引入新工具链。
  - **依赖**：设计稿 §3.1（内容边界与判定口径）+ §4 批 A；`check:standards-redundant` 脚本已存在（`3ae84e5`）。
  - **交付物**：3 commits（`docs(standards)` 逐批）；文件 14-18（standards 14 + 迁移落点文档）。
  - **风险与缓解措施**：① 删过头丢信息 → 逐文件「换一个项目是否成立」判定 + 迁移而非删除 + [§4.4 第 9 条](../standards/planning.md#44-大批量归档批次操作规范) 双向核验；② 迁移落点缺失致外链失效 → `check:docs` 实证 + 全仓 `rg` 追踪引用；③ 3 文件体量大导致单批 diff 超限 → 已按批次拆分。

- **M41.2**（P2，🛠️ 经验治理）经验体系三层收敛与精简
  - **目标**：经验体系按 L1 自动门禁 / L2 评审检查点 / L3 精简索引三层收敛并大幅精简；单分片 ≤ 400 行；保留条目均具备「四者之一」准入依据（未落规范 + 需溯源 + 重复 ≥ 2 + 环境陷阱），删除项留决策记录。
  - **优先级**：P2
  - **范围**：`docs/design/governance/experience-archive*.md`（7 文件 2409 行 / 68 节；`§49-§57` 单分片 1540 行）+ `docs/design/governance/session-wisdom-distillation.md` + `.session/wisdom.md`（如涉及）。
  - **验收标准**（2026-10-10 全部达成）：
    - [x] 单分片 ≤ 400 行——实测 166 / 118 / 86 / 80 / 156 / 375（`§49-§57` 分片 1540 → **375**；总 2409 → 1017）
    - [x] 删除 / 收敛决策记录——本轮**未整条删除**；过程叙事剥离 + 逐条「四者之一」复核的结论登记于 [experience-archive.md §4](../design/governance/experience-archive.md)（含留 / 删准则与后续处置口径）
    - [x] 每条保留条目具备 L1 / L2 / L3 落点——`§1-§40` 统一补具体 `落点：` 行（指向脚本 / 检查点 / 规范条款），`§41-§68` 保留「挂接 / 沉淀」并折为单行具体指针；全 68 条无占位符
    - [x] L3 索引可按主题检索——索引重写为「三层体系 + 分片索引 + 六类主题索引（覆盖 68 条）」；蒸馏机制文档新增与三层体系的交叉引用
    - [x] 门禁通过——`check:docs`（149/85）+ `lint:md:check` + `check:orphan-ids`（0/656）+ `docs:build` 全部通过；跨文件外链（锚点型）零变化（`## §NN` 标题未改）
  - **D 阶段决策留痕（待裁定）**：① 再分片 vs 纯精简；② 删除条目的决策记录载体（专项段落 / backlog 决策记录）；③ L3 索引形态（单索引文件 vs 主题分片）。
  - **不做什么**：不删除历史归档原始记录（`todo-archive.md` 等保持原文）；不重写已闭环阶段的规划 / 设计记录；不改规则事实权威。
  - **依赖**：M41.1（迁移目标就位，避免经验内容无处可落）。
  - **交付物**：2-3 commits（`docs(governance)`）；文件 3-5（experience-archive 分片 / 索引 / 蒸馏机制文档）。
  - **风险与缓解措施**：① 信息丢失 → 删除前按「四者之一」复核 + 决策记录 + commit 历史可查；② 段删除导致跨文件外链失效 → 按 [§4.4 第 2/6 条](../standards/planning.md#44-大批量归档批次操作规范) 全仓 `rg` 追踪改指；③ 精简后检索性下降 → L3 索引化作为同步交付物。
  - **D 阶段决策留痕（已裁定）**：① **纯精简（不重分片）**——避免文件名变更牵动全仓引用（`## §NN` 标题与编号全部未改，锚点零变化）；② 决策记录载体 = 索引文件 `experience-archive.md` §4；③ L3 索引形态 = 单索引文件（三层体系 + 分片索引 + 主题索引）。
  - **闭环记录**：`95b20cf`（9 文件 / +132 −1494）；A 阶段 deep R1 **Reject**（`§49-§58`/`§61` 落点被折为占位符 + 6 分片 H1 被误删）→ 修复（落点具体化 / H1 复位 / 宽泛落点收紧 / 索引断言订正 / 蒸馏机制接线 / 范围外畸形链接登记 backlog）→ R2 quick Pass。
  - **延后登记**（R2 判定可接受）：`§49-§57` 分片文件名与内容范围（至 §六十八）不符，属历史遗留，重命名牵动全仓引用 → 另行评估。

- **M41.3**（P2，🧪 测试基建）规范 / 经验门禁落地（CI 阻断）
  - **目标**：把「有规则无门禁」根因结构性消除——规范冗余关键词检查转 CI 阻断（`--strict`）、新增文档行数阈值计量脚本、经验条目「挂接检查点」字段非空校验，使规则与执行不再分离。
  - **优先级**：P2
  - **范围**：`scripts/check-standards-redundant.mjs`（`--strict` 已有，接 CI）；新增 `scripts/check-doc-size.mjs` + `scripts/check-doc-size.test.mjs`（行数阈值计量：超强制分片阈值阻断 / warning 上报）；`.github/workflows/test.yml`（Test job 接线）；经验条目模板「挂接检查点」字段校验（`check-standards-redundant` 扩展或独立脚本）。
  - **验收标准**：
    - [ ] CI Test job 接入 `check:standards-redundant --strict`（**负例标定**：构造违规样本必须 exit 1，实证阻断生效）
    - [ ] `check-doc-size.mjs` 按 [documentation.md §3](../standards/documentation.md) 阈值表计量（超强制分片阈值阻断 / warning 带上报），单测覆盖「健康 / warning / 超阈值 / 分片豁免」四态
    - [ ] 经验条目「挂接检查点」字段非空校验（L1 / L2 二选一），负例标定违规条目被检出
    - [ ] 本地可复现：`pnpm run check:standards-redundant:strict` + `check-doc-size` + `check:orphan-ids` + `check:docs` 全部 exit 0
    - [ ] `pnpm lint` 0 error + `pnpm typecheck` 0 error（实测 `2>&1 | grep -E "error TS"` 无命中，不信「Done」宣称）；门禁接线按 [测试规范 §6.9 三件套自检](../standards/testing.md)（负例标定 / 自指面核对 / 阻断强度声明）
  - **D 阶段决策留痕（待裁定）**：① 行数阈值脚本的阻断强度（warning 仅报告 vs 超强制分片阈值阻断）；② 经验落点校验并入既有脚本 vs 独立脚本；③ 分片豁免白名单形态。
  - **不做什么**：不改门禁脚本的**检测判定口径本身**（仅接线 + 计量）；不引入新工具链；不在 M41.1 / M41.2 达标前接线（避免阻断既有 CI）。
  - **依赖**：M41.1 + M41.2（达标后才接线，先报告模式跑全量确认真业务）；设计稿 §3.6 门禁落地表。
  - **交付物**：2-3 commits（`feat(scripts)` 计量脚本 + `ci` 接线 + 单测）；文件 3-4。
  - **风险与缓解措施**：① 门禁误伤阻断既有 CI → 先报告模式跑全量、确认命中均为真业务后转阻断 + 负例标定；② 脚本与规范二次漂移 → 阈值以 `documentation.md §3` 为单一事实源（M41.5 同步收敛）；③ 阈值阻断强度过严 → 分片豁免白名单 + warning 带保持非阻断。

- **M41.4**（P3，🎨 文档体验）文档站导航分层
  - **目标**：站点按受众切分导航（发布策略不变，文档仍公开）——顶栏 / 侧栏不挂 `design/governance/**`（除 `architecture` + `governance/index`）+ `plan/archive/**`，首页同步仅引导对外可读入口，降低对外读者的信息噪声。
  - **优先级**：P3
  - **范围**：`docs/.vitepress/config.ts`（nav / sidebar，zh + en 双侧）；`docs/index.md`（首页卡片）；`docs/i18n/en-US/index.md`（en 镜像同步）。
  - **验收标准**：
    - [ ] zh + en 侧栏均不挂 `design/governance/**`（`architecture` + `governance/index` 除外）与 `plan/archive/**`（逐条 `rg` 核对 config.ts 挂载项）
    - [ ] `guide/**` / `standards/**` / `plan/**`（roadmap / todo / backlog）/ `design/modules/**` / `research/*` 按需保留（不搞「一刀切」卸载）
    - [ ] 首页（`docs/index.md` + en 镜像）仅引导对外可读入口——移除 / 改写指向非挂载页的卡片（如 `design/governance/security` / `mcp-server`）
    - [ ] 未挂载页仍可直链访问（`ignoreDeadLinks` 语义保持；`check:docs` 0 error 实证外链未失效）
    - [ ] `pnpm --filter dependfix-docs build` 通过（`docs:build`）
  - **D 阶段决策留痕（待裁定）**：① 非挂载页卡片改写方向（改指 overview vs 移除）；② en 侧栏是否与 zh 完全对齐（现状 en 侧栏条目与 zh 不一致）；③ 是否补 `governance/index` 目录页入口。
  - **不做什么**：不做 `srcExclude` 物理隔离 / 不拆双站点；不改变文档公开性；不删除任何页面（仅调整导航挂载与首页引导）。
  - **依赖**：无（可与 M41.1 并行）；设计稿 §3.4 导航分层表。
  - **交付物**：1-2 commits（`docs(governance)` config + 首页 zh / en）；文件 2-3。
  - **风险与缓解措施**：① 导航收敛致读者找不到内容 → 保留 guide / standards / plan / roadmap 入口 + 直链可访问；② config 改动致 `docs:build` 失败 → 本地 `docs:build` 实证；③ zh / en 侧栏不对称 → 双侧逐条核对。

- **M41.5**（P3，🛡️ 治理同步）阈值与事实源唯一化
  - **目标**：`documentation.md §3` 成为**唯一阈值权威**（补齐 standards `≤ 200 / 201-400 / > 400` 与 design `modules ≤ 300 / governance ≤ 400` 行），`spec-and-doc-governance.md §2.3` 的重复完整阈值表收敛为一行引用，消除双事实源漂移。
  - **优先级**：P3
  - **范围**：`docs/standards/documentation.md §3`（阈值表补齐为全量唯一表）；`docs/design/governance/spec-and-doc-governance.md §2.3`（改为一行引用）。
  - **验收标准**：
    - [ ] `documentation.md §3` 覆盖全部文档类型行（README / standards / design modules / design governance / roadmap / todo / todo-archive / backlog / research / guide），为唯一完整阈值表
    - [ ] `spec-and-doc-governance.md §2.3` 无第二处完整阈值表（收敛为一行引用）
    - [ ] `rg -n "201-400|301-500|401-700|801-900" docs/` 复扫确认无第三处阈值表（命中仅允许指向 §3 的引用行）
    - [ ] `pnpm run check:docs` + `pnpm run lint:md` 0 error
  - **D 阶段决策留痕（待裁定）**：① 两表合并口径（以 §3 行序为准）；② 是否同步 `archive/index.md §1` 的阈值段（其为归档治理自有阈值，需判定是否属同源）。
  - **不做什么**：不改阈值**取值**本身（仅统一声明位置）；不修改 `AGENTS.md`（实测其硬阈值异源，无需同步；如确需提及须用户明确确认）；不改规则内容。
  - **依赖**：M41.1（A 批达标后阈值才有计量对象与意义）；设计稿 §3.5 + §4 批 E。
  - **交付物**：1 commit（`docs(standards)` + `docs(governance)`）；文件 2。
  - **风险与缓解措施**：① 阈值取值分歧 → 以 `documentation.md §3` 为准（用户已裁定唯一权威）；② 漏改第三处 → `rg` 复扫 + `check:docs` 兜底；③ `archive/index.md §1` 判定分歧 → D 阶段显式裁定并在条目内留痕。

---

## 阶段收口清单

- [ ] M41.1~M41.5 全部闭环（各条目 8 要素验收标准勾选）
- [ ] M41.1 三个内部提交批次（A1 / A2 / A3）各自独立验收 + 独立 A 阶段审计
- [ ] 每原子条目独立 commit（`conventional-committer`），A 阶段 Review Gate 放行；治理定义改动按 [AGENTS.md §审计触发](../../AGENTS.md) 强制审计
- [ ] `pnpm lint` + `pnpm typecheck` + 定向测试全过；M41.3 / M41.4 补 `docs:build` 或 CI 阻断负例标定实证
- [ ] `check:standards-redundant:strict` / `check-doc-size` / `check:orphan-ids` / `check:docs` 全部 exit 0
- [ ] `todo.md` 状态收口 + `todo-archive.md` 归档段 + `roadmap.md` 状态同步 + `backlog.md` 候选清出 + 设计稿状态回填
- [ ] 阶段归档批次执行 [规划规范 §4.4](../standards/planning.md#44-大批量归档批次操作规范) 12 项必查
