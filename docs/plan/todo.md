# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | [M33 治理债收口 + 测试基建扩展](#m33-治理债收口--测试基建扩展2026-09-30-用户决策方案-a-启动)（2026-09-30 用户决策方案 A 启动，6 原子条目） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M32 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M32 已归档） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

### M33: 治理债收口 + 测试基建扩展（2026-09-30 用户决策方案 A 启动）

> **定位**：承接 M32 完整闭环归档后（[todo-archive.md §M32](todo-archive.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档)）的 backlog 候选池。2026-09-30 用户决策**方案 A（治理 + 测试基建收口）**——从「评估完成待上收」候选与本批评估新登记的可行动已知边界项中上收 6 项；C80 按用户决策采用**方案 C（观察期）**。
>
> **类型平衡复核**：📚 治理 1 项（M33.1）✅ / 🛠️ CI 与 devEx 治理 3 项（M33.2 / M33.3 / M33.6）✅ / 🧪 测试覆盖 2 项（M33.4 / M33.5）✅ / 🎨 用户体验 0 项 —— ⚠️ 缺口显式标注（承接 M28–M32 同型缺口；候选池无 UX 类可上收项，`C37` 语言多设备同步与 alerts 宽表 UX 议题为潜在 UX 项，留后续阶段评估）。
>
> **§3.4 三重交叉核验结论**（M33.1–M33.6 全部实测 **0 项重复评估**）：① todo-archive 表格扫描（§1.7 原文命令 `rg -n "已闭环|不计入本批|不计入 M\d+|ahead=0.*已推" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md` + 补充按候选 id 过滤 `rg`）无候选被标已闭环；② git log 核验（`git log --all --oneline --grep="C91|C93|C94|C80|C83|C15"`）仅命中候选登记 docs commit，无实现 commit；③ 代码侧 anchor 实证（C91 `rg -n "5\.1\.2[4-9]|恒真|视觉回归|中央优先|前缀感知|SIGNING_ISOLATION" .github/agents .github/skills` 仅 1 命中且非检查点；C93 `rg -n prCheck apps/platform/server/api/e2e/` = 0；C94 基线目录仅 7 张无横向补拍；C80 `test.yml:34` 仍 `|| true` + 注释「阻断语义当前未启用」；M31 死配置 `rg -n "primevue|primeuix|primeicons" .github/dependabot.yml` 命中 3 条 ignore；视觉 CI `continue-on-error: true` 仍在）。
>
> **ahead commits 实证**：阶段启动前 `git rev-list HEAD ^origin/master --count` 实测 = 0（M0-M32 全部已推送）；本阶段 commits 按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 等待用户主动推送。

#### M33.1 [P3 📚 治理] C91 新增规范条款的 review 检查点补挂 ✅ 已闭环（commit 4543a54）

- **目标**：把已发布但缺 review 强制点的「必须 / 禁止」级约束挂接到 review 检查点，使其具备强制点而非仅权威文档声明。
- **优先级**：P3（非阻塞；条款已发布于权威文档，仅缺 review 强制点）。
- **范围**：`.github/agents/code-auditor.agent.md` + `.github/skills/code-reviewer/SKILL.md`（落点选择见决策点）；**注记清理**（A 阶段 RG-W1/W2）：`docs/standards/testing.md §6.7`（「review 检查点」bullet 的「补挂登记于 backlog（C91）」注记）+ `docs/standards/platform.md §3.9`（「补挂登记于 backlog.md（C91）」注记）+ `docs/design/governance/experience-archive-§49-§57-recent-investigation.md`（检查点表 7 行「⏳ 待补挂（登记 backlog C91）」→ 挂接后改 ✅ 并回填检查点落点）；覆盖条款：`development.md §5.1.24`–`§5.1.30`、`testing.md §6.1 / §6.5 / §6.6 / §6.7 / §6.8`、`security.md §2`、`platform.md §3.3 / §3.8 / §3.9`、`planning.md §2.3 / §2.5 / §4.4 第 13 条`、`ai-collaboration.md §1.3 分级审计执行协议`、`git.md §3.8`（签名隔离）。
- **验收标准**：
  - [x] 各严格约束均有明确 review 检查点（`code-quality-checklist` 新增「规范条款 review 检查点矩阵」21 行逐条落点；`platform.md §3.8` 委托既有必查项不重复挂接）
  - [x] 检查点按 [documentation.md §4 单点声明](../standards/documentation.md) 引用规范原文，不重复抄写（矩阵只写「review 检查动作」，code-auditor / SKILL.md 仅一行链接引用）
  - [x] **条款落点冒烟复扫**：`rg -n "5\.1\.2[4-9]|5\.1\.30|恒真|量化断言|视觉回归|中央优先|迁移前行为核实|取证工件|防护矩阵|前缀感知|dependfix\.yml|SIGNING_ISOLATION" .github/agents .github/skills` 实测 17 命中（改动前为 1）；**覆盖证据以「矩阵行 ↔ §M33.1 范围条款逐行比对」为准**——部分触发面（`testing.md §6.1` / `§6.6`、`planning.md §2.3` / `§4.4 第 13 条`、`ai-collaboration.md §1.3`、`platform.md §3.8`）不含 pattern 关键字，rg 结构上无法命中
  - [x] **注记清理复扫**：`rg -n "C91|待补挂" docs/standards/testing.md docs/standards/platform.md "docs/design/governance/experience-archive-§49-§57-recent-investigation.md"` 实测 0 命中（§6.6 / §6.7 覆盖边界与 CI 转阻断指针属其它条目范围，不在本条）
  - [x] `pnpm run check:docs` EXIT 0（links 143 / vue-interp 79）；`lint:md:check` / `docs:check:i18n` / `docs:build` 通过；`pnpm lint` + `pnpm run typecheck` EXIT 0
- **不做什么**：不改规范条款正文；不新增规范条款；不改 D 阶段自检规则本身（自检规则已存在于各 skill / agent）。
- **依赖**：关联 M30 归档批次（触发来源）+ M32.4（`git.md §3.8`）+ M32 归档批次 wisdom 蒸馏（`development.md §5.1.27-§5.1.30` 等新增条款）。
- **交付物**：✅ 1 atomic commit（`4543a54` `docs(review)`）；文件 `.github/agents/code-auditor.agent.md` + `.github/skills/code-reviewer/SKILL.md` + `.github/skills/code-reviewer/references/code-quality-checklist.md` + `docs/standards/testing.md` + `docs/standards/platform.md` + `docs/design/governance/experience-archive-§49-§57-recent-investigation.md` + `docs/plan/todo.md`。
- **审计**：第 1 轮 `deep` Pass（0 blocker / 2 warning / 3 suggest）→ 修复 RG-W1（矩阵补 `platform.md §3.8` 行）/ RG-W2（AC3 声明覆盖边界 + 逐行比对证据）/ RG-S1（补锚点）/ RG-S2（补 §12.7 权威来源）→ 第 2 轮 `standard` 复审 Pass（4 项全部关闭）。
- **风险与缓解**：合并为总检查点颗粒度不足可能漏检；缓解：优先逐条落点，至少覆盖高风险项（security.md §2 防护矩阵 / testing.md §6.7 视觉回归 / platform.md §3.9 目标仓库配置）。

#### M33.2 [P3 🛠️ CI 治理] 视觉回归 CI job 转阻断（移除 `continue-on-error`）

- **目标**：按 backlog §已知边界既定**可判定口径**，在 `ubuntu-latest` 出现首个全绿 run 后把视觉回归 job 从非阻断转为阻断——该条件已由 CI run `36602407382`（2026-09-29）达成（Visual Regression job **conclusion = success，14 步全绿**）。
- **优先级**：P3（非阻塞；转正条件已实证达成）。
- **范围**：`.github/workflows/test.yml`（visual job 移除 `continue-on-error: true` + 注释同步）+ `docs/standards/testing.md §6.7`（删除「非阻断」说明 + 「（待办登记 backlog §已知边界）」指针）+ `docs/plan/backlog.md §已知边界`（该条目完全闭环 → 整段删除）+ `docs/plan/archive/index.md §4`（backlog 基线同步的必然派生）+ `docs/plan/todo-archive.md`（M32 归档段该事项的前向注记，避免历史描述 stale）。
- **验收标准**：
  - [x] `test.yml` visual job 无 `continue-on-error`；注释写明转阻断依据（首个全绿 run 编号 + 日期 + job conclusion）
  - [x] `rg -n "continue-on-error" .github/workflows/test.yml` 0 命中（注释亦不含该字面量，保证命令可判定）
  - [x] `testing.md §6.7` 「非阻断」表述与「待办登记 backlog」指针已同步删除；`backlog.md` 该已知边界条目整段删除；`archive/index.md §4` 基线同步
  - [x] `pnpm run check:docs` EXIT 0（links 143 / vue-interp 79）；`lint:md:check` / `docs:check:i18n` / `docs:build` 通过；`pnpm lint` + `pnpm run typecheck` EXIT 0；YAML 解析通过（`continue-on-error` 键不存在）
  - [ ] 用户推送后一次真实 CI run 的 Visual Regression job 结论为 success（最终裁决；本地不可测配置以 CI 为准）
- **不做什么**：不改视觉基线快照与用例；不改 job 触发条件、artifact 上传与 `timeout-minutes`；不回改 M32.5 视觉基线口径；不在本条目内配置 required status checks（合并门禁属独立议题）。
- **依赖**：关联 M32.5（视觉回归落地）+ CI run `36602407382`（转正证据）。
- **交付物**：1 atomic commit（`ci(test)`）；文件 `.github/workflows/test.yml` + `docs/standards/testing.md` + `docs/plan/backlog.md` + `docs/plan/archive/index.md` + `docs/plan/todo-archive.md` + `docs/plan/todo.md`。
- **风险与缓解**：ubuntu-latest 字体 / 渲染环境后续漂移可能导致偶发红，使 Test workflow 变红（**workflow 级阻断信号**；当前未配置 required status checks，不构成硬性合并门禁）；缓解：转阻断基于实证绿 run，若转后连续红则评估回退（回退动作与依据登记 backlog §已知边界）。
- **审计**：第 1 轮 `deep` Pass（0 blocker / 3 warning / 2 suggest）→ 收敛 RG-W1（`archive/index.md` 不提前宣告阶段闭环）/ RG-W2（勾选 AC #1–#4 + 范围/交付物补 `archive/index.md`）/ RG-W3（「阻断语义」口径限定为 workflow 级信号）/ RG-S2（`todo-archive.md` M32 段补前向注记）。AC #5（推送后真实 CI run 裁决）保留待验证。

#### M33.3 [P3 🛠️ 依赖治理] M31 迁移遗留 dependabot 死配置清理

- **目标**：移除 `.github/dependabot.yml` 中已无命中包的 PrimeVue 相关 ignore 条目与 M25 / M26 时期配套注释（M31.5 已卸载 5 个 PrimeVue 依赖）。
- **优先级**：P3（非阻塞；死配置不影响功能，属治理债）。
- **范围**：`.github/dependabot.yml`（`npm` ecosystem 段的 ignore 列表与配套注释）+ `docs/plan/backlog.md §M31 迁移遗留的配置清理项`（完全闭环 → 整段删除）。
- **验收标准**：
  - [ ] `@primeuix/*` / `@primevue/*` / `primeicons` 三条 `ignore` 条目与配套注释移除；`conventional-changelog` 条目保留
  - [ ] `rg -n "primevue|primeuix|primeicons" .github/dependabot.yml` = 0 命中；保留条目仍在（`rg -n "conventional-changelog" .github/dependabot.yml` ≥ 1）
  - [ ] 前置实证：`rg -n "primevue|primeuix|primeicons" package.json apps/*/package.json pnpm-workspace.yaml` = 0（依赖确已卸载）
  - [ ] YAML 可解析（`node -e "require('yaml').parse(require('fs').readFileSync('.github/dependabot.yml','utf8'))"` 或等价命令 EXIT 0）
  - [ ] `docs/plan/backlog.md §M31 迁移遗留的配置清理项` 该条目完全闭环 → 整段删除
- **不做什么**：不改 dependabot 其他配置（`updates` / `schedule` / `github-actions` 段）；不改 `conventional-changelog` ignore 条目；不重开 PrimeVue 依赖治理。
- **依赖**：关联 M31.5 卸载 commit `406fd1f`（卸载 5 个 PrimeVue 依赖与配置收敛）+ M26.4a（primeicons 8.x → 7.x 降级）+ M28.1（该治理候选登记）。
- **交付物**：1 atomic commit（`chore(ci)`）；文件 `.github/dependabot.yml` + `docs/plan/backlog.md`。
- **风险与缓解**：误删仍在用的 ignore 条目导致后续自动升级 PR 噪音；缓解：删除前以验收标准第 3 条实证依赖残留为 0，删除后以第 2 条复扫确认。

#### M33.4 [P3 🧪 测试覆盖] C93 视觉回归 pr-checks 行级覆盖

- **目标**：`fixtures` 端点扩展 `prChecks` 写入路径，使 `pr-checks` 页视觉基线覆盖行级渲染（结论标签 / Alert 状态 / 最近轮询列），让该页的「表格密度例外」在基线中可被对比。
- **优先级**：P3（非阻塞；页面骨架 / 空态 / 表头密度已覆盖，仅缺行级）。
- **范围**：`apps/platform/server/api/e2e/fixtures.post.ts` + `fixtures.delete.ts`（新增可选 `prChecks` 数据集与级联删除）、`apps/platform/tests/e2e/helpers/fixtures.helper.ts`（类型）、`apps/platform/tests/visual/helpers/fixtures.ts`（数据集）、视觉用例与基线快照、`docs/standards/testing.md §6.7`（「覆盖边界（已知）」bullet 的 pr-checks 子句更新为「已由 M33.4 覆盖」；与 M33.5 共用同一 bullet，各更新对应半句，同批落地时合并为一次编辑）。
- **验收标准**：
  - [ ] 视觉基线覆盖 ≥ 3 行 PRCheck（含 firing 与已 ack 两态），时间列确定性可复现
  - [ ] fixtures 级联删除覆盖 prCheck（`pnpm --filter @dependfix/platform test:visual` 连跑两遍基线不漂移）
  - [ ] `pnpm lint` + `pnpm typecheck` + 平台定向测试 + 视觉用例通过
  - [ ] 决策点敲定并记录依据：`lastPolledAt` 由 fixtures 显式传入固定值 vs 基线侧 `data-visual-mask` 遮蔽
- **不做什么**：不改 `PRCheck` 实体与 service 轮询语义；不新增生产 API；不做全量表格矩阵。
- **依赖**：关联 [testing.md §6.7](../standards/testing.md)（视觉回归口径）+ M32.5（触发来源）。
- **交付物**：1-2 atomic commits（`feat(platform)` fixtures 扩展 + `test(platform)` 基线更新）。
- **风险与缓解**：`fixtures` 端点属生产构建内代码（双门控保护）；缓解：仅新增可选字段 + 级联删除，保持向后兼容。

#### M33.5 [P3 🧪 测试覆盖] C94 视觉回归 alerts 宽表右端列盲区

- **目标**：让 alerts 页 `链接` / `详情` 两列进入视觉基线（当前 1440 视口下表格容器横向溢出——ui-validator 2026-09-29 实测 `scrollWidth 1288 > clientWidth 1166`，基线仅覆盖约左侧 90% 宽度，最右两列回归不会被捕获）。
- **优先级**：P3（非阻塞；属覆盖盲区而非缺陷——横向溢出本身是既有宽表设计，非 M32.5 引入）。
- **范围**：`apps/platform/tests/visual/platform-pages.visual.test.ts`（alerts 用例追加横向滚动后补拍或元素级补拍）+ 对应基线快照 + `docs/standards/testing.md §6.7`（「覆盖边界（已知）」bullet 的 alerts 子句更新为「已由 M33.5 覆盖」；与 M33.4 共用同一 bullet，各更新对应半句，同批落地时合并为一次编辑）。
- **验收标准**：
  - [ ] 基线包含最右两列（截图或补拍可证），用例仍 `workers: 1` / `retries: 0` 串行通过
  - [ ] 覆盖方式与固定环境口径的冲突在用例注释与 [testing.md §6.7](../standards/testing.md) 中说明
  - [ ] `pnpm --filter @dependfix/platform test:visual` 通过（连跑两遍不漂移）
- **不做什么**：不在本候选内改造 alerts 表格列宽 / 布局（属 UX 议题，另评估）；不改视觉阈值与重试口径。
- **依赖**：关联 [testing.md §6.7](../standards/testing.md) + M32.5（触发来源；ui-validator V 阶段登记）。
- **交付物**：1 atomic commit（`test(platform)` 用例补拍 + 基线快照）。
- **风险与缓解**：容器内横向滚动后补拍可能与 §6.7 固定环境口径冲突；缓解：优先容器内滚动补拍（不改 viewport），必要时显式开例外并记录依据。

#### M33.6 [P3 🛠️ CI 政策] C80 剩余 devDeps 链漏洞阻断语义（方案 C 观察期）

- **目标**：按用户 2026-09-30 决策**方案 C**，维持 `|| true`（仅信号）但显式标注**可判定的观察期截止条件**与转阻断配套口径，使「是否转阻断」具备可执行的裁决路径而非悬置。
- **优先级**：P3（非阻塞；当前为信号级已可观测，阻断语义属策略选择）。
- **范围**：`.github/workflows/test.yml`（audit 步骤注释）；`docs/standards/ai-collaboration.md §1.5`（「审计门禁缺失：纳入 backlog 候选（当前落点见 backlog C80）」指针 → 更新为 M33.6 决策结果）；如涉规范挂接，追加 `docs/standards/security.md` 或 `development.md` 对应段落（决策点）。
- **验收标准**：
  - [ ] audit 步骤注释写明方案 C 依据 + 可判定观察期条件（可脚本化统计，如「连续 N 次 CI run 的 devDeps 告警数为 0 后转阻断」）+ 转阻断配套（`--ignore-registry-errors` 评估结论）
  - [ ] 维持 `|| true`（**不转阻断**）；`--audit-level` 取值与注释口径一致（当前 `moderate`）
  - [ ] `rg -n "\|\| true" .github/workflows/test.yml` 仍命中 audit 步骤（确认未误转阻断）
  - [ ] `rg -n "backlog C80|backlog\.md#开发工具链" docs/standards/ai-collaboration.md` = 0 命中（C80 backlog 落点指针已更新为 M33.6 决策结果）
  - [ ] 若涉规范链接：`pnpm run check:docs` EXIT 0
- **不做什么**：不引入 Snyk / 第三方 SCA 服务；不改 `pnpm-workspace.yaml` overrides 策略；不在本候选内清理存量告警（当前全量 audit 实测 0 告警）；不重复处理覆盖方式（M29.9 已落地）。
- **依赖**：关联 M29.1（触发实证）+ M29.9（覆盖方式已落地，本条目仅剩阻断语义）+ repo 级 security alerts 设置（`vulnerability-alerts` 已启用）。
- **交付物**：1 atomic commit（`ci(test)` 注释口径 + 观察期条件 + 转阻断配套结论）；文件 `.github/workflows/test.yml` + `docs/standards/ai-collaboration.md`（±`security.md` / `development.md`）。
- **风险与缓解**：观察期条件若不可判定则形同虚设；缓解：条件须可由 CI run 历史脚本化判定并写入注释（含统计命令），使第三方可复现。

#### 阶段决策记录

- **D1**：方案 A（治理 + 测试基建收口）——从「评估完成待上收」候选（C91 / C93 / C94 / C80 剩余）与本批评估新登记的可行动已知边界项（视觉回归 CI 转阻断 / M31 dependabot 死配置）中上收 6 原子条目；类型平衡 📚 1 + 🛠️ 3 + 🧪 2，🎨 UX 缺口显式标注。
- **D2**：C80 采用**方案 C（观察期）**——维持 `|| true` + 标注可判定转阻断条件，避免上游新披露 devDeps 漏洞突然红掉 CI / 阻塞无关 PR（用户 2026-09-30 决策）。
- **D3**：视觉回归 CI 转阻断（M33.2）以 CI run `36602407382` 首个 `ubuntu-latest` 全绿 run 为转正依据（backlog 既定可判定口径），转阻断后以真实 CI run 裁决。
- **D4**：**不纳入** C81（注释孤立编号清理）与 C83（验证链既有失败基线判定）——C81 存量规模（非 docs 孤立规划编号行级扫描 **292 行**；测量方 = M33 启动评估执行角色；可复现命令 `rg -n --glob '!docs/**' --glob '!node_modules/**' --glob '!**/dist/**' --glob '!**/.nuxt/**' --glob '!pnpm-lock.yaml' "\b[MT][0-9]{2,4}(\.[0-9]{1,2})?\b|\b[CRGBD][0-9]{1,3}\b" . | rg -v "docs/|\.md|§|todo" | wc -l`；量级与 C81 条目 300–430 同档）超 §1.1 单批阈值，须 3-6 子批次，会挤压 5-6 项容量，留独立阶段或主线；C83 属能力扩展（P3，方案 B 范围）留后续。
- **D5**：M33 阶段启动 commit 仅改 `docs/plan/*`（P 阶段规划暂停协议），提交后暂停等待用户指令进入 D 阶段。
- **D6**（A 阶段审计收敛）：第 1 轮 `standard` 审计 **Pass**（0 blocker / 4 warning / 6 suggest）。warning 处置——RG-W1/W2（C91 / C80 跨文件陈旧指针，`ai-collaboration.md §1.5` / `platform.md §3.9` / `testing.md §6.7` / experience-archive 检查点表）**落点登记**到对应条目交付物（M33.1 / M33.2 / M33.4 / M33.5 / M33.6），不在本 P 批次内改 `docs/standards/*`（保持 P 阶段仅 `docs/plan/*` 的边界）；RG-W3（M33.5 量化口径）与 RG-W4（M33.3 范围漏列 backlog.md）已在本批修正。suggest 采纳：RG-S1（roadmap §M32 历史段加「已上收 M33.x」注记）/ RG-S2（M33.3 依赖回填 commit `406fd1f`）/ RG-S3（roadmap D4 补测量方）/ RG-S6（banner 对齐 §1.7 原文命令）；RG-S4 于 F 阶段收口（`.session` 同步）；RG-S5 保持现状（归档历史快照）。

---

### 阶段约定

- 每个原子条目闭环前必须通过 `pnpm lint` + `pnpm typecheck` + 定向测试；涉及打包 / 入口 / 导出变更时追加 `pnpm build`。
- 涉及 CI 配置（M33.2 / M33.3 / M33.6）的改动，本地不可测部分以真实 CI run 为最终裁决（见 [AI 协作规范 §4.3](../standards/ai-collaboration.md)）。
- 每条改动进入 A 阶段 `Code Auditor (代码审计员)` Review Gate；放行后方可进入 V / T / F。
- 提交按 [AGENTS.md §提交规范](../../AGENTS.md)（`conventional-committer` skill + 原子粒度）；推送仅限用户明确要求。
