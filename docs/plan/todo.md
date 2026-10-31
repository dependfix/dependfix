# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M53 发布工程（1.0-G 批次）** — 5 原子，2026-10-31 规划，见下方 §M53 |
| 下一阶段（未规划） | **1.0.0 发布窗口决策**（待 M53 收口与 G1-G8 读数；G3 实跑 / G4 窗口 / `@v1` 状态见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M52 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M52 已归档；M53 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M53: 发布工程（1.0-G 批次，2026-10-31 规划）

> **阶段目标**：把 1.0 发布前「能提前做」的工程项做完——对外契约冻结成可机检清单、运维动作从「文档说可用」变成「实测过」、指标与 mutation 证据可复算、发布链在不真发的前提下走通，并给真实环境矩阵留下可回填的执行框架。**不追求本阶段发布 1.0.0**（G3 需真实凭据 / staging / AI 预算，G4 需 20 连绿或 2 周窗口，`@v1` 需 1.0.0 已发布）。
> **来源**：[release-1.0-readiness.md](../design/governance/release-1.0-readiness.md) §3 门槛 G1-G8 + §5 批次表 G 行（2026-10-31 G2 / G3 / G5 / G7 / G8 缺口实测）。
> **用户决策（2026-10-31）**：① 范围 = 可执行四项 + G3 执行框架（5 原子），G3 实跑 / G4 窗口 / `@v1` 登记为待资源 / 待时间；② **0.6.1 只做发布预演不真发**（G3.8 用本地 tarball 与 0.6.0 镜像取证，保持未闭环）；③ M52 残余只并入 zh quick-start CLI 表，`dialog-select-open-dark` 边缘抖动留 backlog 观察。
> **阶段启动交叉核验（§3.4，2026-10-31 实测）**：① 归档扫描 `契约冻结|真实环境矩阵|运维实测|产品指标` → 0 命中（无历史闭环）；② `git log -- docs/guide/release.md` 近 5 次均为 lint / 门禁类改动，无 G2 提交；③ 代码侧 anchor：`release.md` 无冻结章节、`scripts/` 无指标脚本、`git tag` 无 `v1`、`release.yml` 的 `schedule` / `push` 仍为注释、无 Docker / 备份实测工件；zh `quick-start.md` 的 `--ai` **0 命中**（决策③前提成立）；mutation 工件仅 `artifacts/review-gate/2026-10-31-m52-4-mutation.md`（覆盖归因模块）。
> ④ 决策前提无矛盾：`0.6.1` 未被发布（`npm view dependfix version` = 0.6.0），`8fd83fc3`（`--version` 修复）已在 master 且 ahead=0 → 预演可验证修复、真发仍待授权。
> ⑤ backlog 已同步：G8 指标脚本与 zh CLI 表两条候选已从 `### 候选评估中` 删除，实测 55 项。
> **已核契约面（2026-10-31 执行角色实测，量级 + 可复现命令）**：
> - CLI `argsDef` 顶层键 **43**（42 个 flag + 1 个 `positional`）：`rg -c "^    ['\"]?[A-Za-z0-9-]+['\"]?: \{" packages/cli/src/cli/index.ts`
> - Action inputs **31**：`awk '/^inputs:/{f=1;next} /^outputs:/{f=0} f' action.yml | rg -c "^  [a-z][a-z0-9-]*:$"`
> - 运行时配置项 **41**（`RuntimeConfig` 顶层属性）+ `DEPENDFIX_*` 环境变量 **45**（去重）：`sed -n '/export interface RuntimeConfig/,/^}/p' packages/engine/src/config/index.ts | rg -c '^    [a-z][A-Za-z0-9]*\??: '` / `rg -o "DEPENDFIX_[A-Z0-9_]+" packages/engine/src -g '*.ts' | cut -d: -f2 | sort -u | wc -l`
> - DB 实体 **15** 个 `@Entity` 类（目录 17 文件，含 `base-entity.ts` 与 1 个测试）：`rg -c "@Entity\(" apps/platform/server/entities/ | awk -F: '{s+=$2} END {print s}'`
> - 报告契约 `RunResult` / `RepositoryResult`（`packages/core/src/report/`，字段数量级 20-40/接口）
> **容量评估（§1.1）**：阶段 **5 原子 = 台账缺口 4 项映射（G2→M53.1、G7→M53.2、G8+G5 mutation→M53.3、G3 框架→M53.5）+ 非缺口项 M53.4**（G3.8 预演 + M49.5 发布遗留），上限内。类型分布 📚 1 + 🛠️ 1 + 🧪 2 + 🚀 1。预估 **31-44 文件 / 1900-3050 行 / 13-17 commits**（由下方逐原子预估相加得出，不另取整）。
> **§3.1.1 插队再平衡**：本阶段启动时插队 **0 批**，不触发阈值。
> **原子间依赖与交付顺序**：M53.1（契约冻结，发布说明与实测的输入）→ M53.2（运维实测）→ M53.4（发布链预演）→ M53.5（G3 框架回填）；M53.3（指标 + mutation）独立，可并行。

### M53.1 [P0 📚] 1.0 契约冻结清单、迁移指南与 CLI 表补齐

- **目标**：把「1.0 起不再变」的五类对外契约写成清单并机检，给出弃用策略与 0.x→1.0 迁移指南；范围同时含 zh quick-start CLI 表补齐（M52 残余，独立 commit）。
- **优先级**：P0（1.0 契约，发布前置）。
- **范围**：新增 `docs/guide/contract-freeze.md`（五类清单 + 弃用策略 + 0.x→1.0 迁移指南）+ `docs/guide/release.md`（「1.0 契约冻结与迁移」小节：策略摘要 + 指针）+ `docs/guide/quick-start.md`（zh CLI 表补齐 `--ai*` 7 行；en 侧 M52 已齐）+ `docs/i18n/en-US/guide/quick-start.md`（`--ai-api-url` 默认值表述对齐）；新增 `scripts/docs/check-contract-freeze.mjs` + 单测（从 `argsDef` / `action.yml` / `RuntimeConfig` / `DEPENDFIX_*` / 报告接口 / 实体元数据抽取实际键，与清单比对）；`package.json` + `DOC_GATES` + `test.yml` 接线；`docs/standards/documentation.md` §6 记机检口径 + review 检查点矩阵挂接。
  > **范围变更（执行期，2026-10-31）**：原计划把两份清单写进 `docs/guide/release.md` 两章；实测 release.md 317 行，加两份清单后 630+ 行进 guide warning 带（健康窗口 ≤500），改为独立页 `contract-freeze.md`（366 行，健康带）+ release.md 保留策略摘要与指针，`docs:check:fallback` / 侧边栏 / 台账 G2 证据同步更新。核实测 16 文件 / +1400 行，超原预估 8-10 文件 / 600-800 行 → 按「门禁脚本 + 单测 / 契约文档 / 指南与接线」三段提交。
- **验收标准**：① 五类清单（CLI 参数与模式 / Action inputs / 配置项 / 报告 JSON 字段 / DB 表列）逐项列出，脚本比对 0 差异；①′ 弃用策略成文（弃用窗口、提前通告的 minor 数、移除条件、`deprecation` 标注方式），且 1.0 后变更须 2.0 的约束与台账 §G2 一致；② 机检负例：临时新增一个 CLI 参数不登记 → exit 1，跑后还原；③ 迁移指南逐条覆盖已发生的行为变更（`--version` 元数据缺陷、M51.5 交付链导出同步→异步、`--allow-major-upgrade` 无 env 通道、M51.4 交付降级默认 `skip`、`signalsJson` 存收敛后信号）；④ zh / en CLI 表与 `argsDef` 三方键位一致——证据由本原子新增的 `check-contract-freeze.mjs` 给出（`docs:check:guides` 只做 `en ⊇ zh` 平价、不读 `argsDef`，不能单独作为该结论的依据）；⑤ `gates:docs` 全绿。
- **不做什么**：不改运行时行为；不做版本号提升；不翻译设计文档。
- **依赖**：M52 已归档（指南平价脚本与锚点门禁可复用）。
- **交付物**：预估 3-4 commits / 8-10 文件 / 600-800 行；**拆分依据**：清单章节（含机检脚本）、迁移指南章节、zh/en CLI 表补齐三段各自独立提交，文字量为主、单文件改动多为表格行，不构成逻辑耦合；若实测超 10 文件**或超 800 行**即在清单 / 迁移指南之间再拆。**实测（2026-10-31）**：3 commits / 16 文件 / +1400 −10 行——独立成页后按「门禁脚本 + 单测（+`DOC_GATES` / `test.yml` / `documentation.md`）」「契约文档（清单 + 弃用策略 + 迁移指南）」「指南与接线（zh·en 表格 + release 指针 + 侧边栏 + 台账）」三段提交。
- **风险与缓解**：清单与代码漂移 → 键位一律从代码抽取比对（不手抄），并把机检接入 `gates:docs`；迁移指南写成空话 → 每条附「受影响对象 + 迁移动作 + 验证命令」。

### M53.2 [P1 🛠️] G7 运维实测与发布自动化预演

- **目标**：把「文档说可用」变成「实测过并有证据」：镜像启动 / SQLite 备份恢复 / 迁移前滚回滚 / 队列重启收敛各留一条证据；给出自动发布启用前的开关清单与预演。
- **优先级**：P1（发布前运维证据）。
- **范围**：`docs/guide/deployment.md`（新增「实测记录」段与命令）+ `docs/guide/release.md`（自动触发启用清单）；`artifacts/ops/`（证据：命令输出 / 截图 / 校验和）；**不另建演练脚本**——各演练的命令与实际输出直接写入 `deployment.md` 的「实测记录」段，保证文档即证据。
- **验收标准**：① Docker 镜像启动 + `/api/health` + 一次 report-only 扫描 smoke 的证据（run id / 日志片段）；② SQLite 备份 → 恢复到新路径 → 关键表行数比对一致；③ 迁移前滚 → `db:migrate:revert` → 再前滚，三态证据齐全；④ 队列重启后 pending/running 收敛（复用 `queue-stale-recovery` 口径）；⑤ `release.yml` 自动触发（`schedule` / `push`）启用清单 + 本地 dry-run 预演记录；⑥ 文档内链接与证据路径可达。
- **不做什么**：不启用自动发布（只产出启用清单）；不改生产配置；不引入 Postgres / Helm（G7 记为可选）。
- **依赖**：M53.1（发布说明引用冻结清单）。
- **交付物**：预估 3-4 commits / 6-10 文件 / 400-700 行（deployment / release 文档 + 证据工件为主）。
- **风险与缓解**：本地 Docker 与 CI 环境差异 → 证据里记录镜像 digest 与命令；失败项不得静默跳过，登记为残余并写触发条件。

### M53.3 [P1 🧪] G8 产品指标采集脚本 + G5 mutation 扩面

- **目标**：把「近 30 个 PR 的 CI 绿率 / 人工介入率 / 误关率」变成可复算脚本；mutation 从归因模块扩到 `core/report` 与 engine 判定链。
- **优先级**：P1（G5 / G8 证据面）。
- **范围**：新增 `scripts/metrics/pr-health.mjs`（GitHub API 或本地库两条取数路径，输出 Markdown + JSON）+ 单测（固定夹具断言确定值）；`release-1.0-readiness.md` G8 口径（分子 / 分母 / 窗口写死）；mutation 工件覆盖 `packages/core/src/report`（结果契约推导）与 `packages/engine/src/app`（交付判定）各 ≥3 变异。
- **验收标准**：① 脚本对固定夹具输出确定三指标值（分母 = 窗口内 PR 数，写进文档）；② 有 token / 无 token 两路径行为明确（无 token 明确报错或降级，不静默返回 0）；③ mutation 6+ 变异全部击杀并留工件（四要素）；④ G5 / G8 台账按实测回填（G8 读数标注「待 30 天窗口满足」）；⑤ `scripts` 单测全绿。
- **不做什么**：不采集个人隐私字段；不新增第三方依赖（优先复用现有 octokit / fetch 封装）；不动平台 UI。
- **依赖**：无（数据窗口满足后再回填读数）。
- **交付物**：预估 3-4 commits / 8-10 文件 / 500-750 行；**拆分依据**：指标脚本（含夹具单测）与 mutation 工件（含还原核对）两段独立提交；脚本与工件无共享代码，超 10 文件**或超 800 行**即按模块再拆。
- **风险与缓解**：30 天窗口数据不足 → 脚本先落地，台账标「脚本已就绪 / 读数待窗口」；API 字段漂移 → 夹具锁定响应形状 + schema 校验。

### M53.4 [P1 🚀] 发布链预演与安装/升级实测（不发版）

- **目标**：真发前把发布链走通——本地打包产物验证 `--version` 修复、三路安装 smoke、Docker 多架构 tag 复核，并产出 0.6.1 发布清单（不执行）。
- **优先级**：P1（发布前置彩排）。
- **范围**：`docs/guide/release.md`（预演章节 + 0.6.1 发布清单）；新增 `scripts/release/preflight.mjs`（`pnpm pack --pack-destination <tmpdir>` → 临时目录安装 → 版本断言 → 清理）；`artifacts/release-preflight/` 证据。
- **验收标准**：① 5 个包 tarball 安装后 `dependfix --version` 等于包版本（`8fd83fc3` 修复验证）；② npx（本地 tarball）/ 全局安装 / Docker 三路 smoke 各一条证据；③ Docker 0.6.0 多架构 tag / health 复核（M49.5 遗留项）；④ 发布清单（OTP / 门禁 / 回滚 / 校验和）成文；⑤ **未** 执行 `npm publish` / 未打 tag / 未改版本号（工作区无发布痕迹）。
- **不做什么**：不真发、不推送 tag、不改 `package.json` 版本。
- **依赖**：M53.1 / M53.2（清单与运维证据）。
- **交付物**：预估 2-3 commits / 5-8 文件 / 200-400 行（release.md 预演章节 + preflight 脚本 + 证据）。
- **风险与缓解**：本地 registry / 网络不可达 → 记录失败点与重试条件；预演脚本污染工作区 → 全部在临时目录执行并断言 `git status` 干净。

### M53.5 [P2 🧪] G3 真实环境矩阵执行框架（实跑待外部资源）

- **目标**：把 G3.0–G3.9 从「只有 mock」推进到「执行清单 + 证据模板 + 可回填」，M53.4 产出后先行回填 G3.8（证据类型：本地 tarball 安装 / 0.6.0 镜像；发布后 `@latest` 复核另计）。
- **优先级**：P2（依赖外部资源）。
- **范围**：`release-1.0-readiness.md` §G3 矩阵行补「前置资源 / 执行步骤 / 证据字段 / 验收判据」四列语义；新增 `artifacts/real-env/` 证据模板与 `scripts/docs/check-real-env-evidence.mjs`（校验证据文件字段完整性，缺字段即失败）；G3.8 用 M53.4 实测回填。
- **验收标准**：① 9 条路径（G3.0–G3.8）+ G3.9 各含四要素与「最小可执行命令」；② 模板校验脚本对空 / 缺字段样本 exit 1；③ G3.8 有本地预演证据（M53.4 产出，证据类型 = 本地 tarball / 0.6.0 镜像；发布后 `@latest` 复核另计，不据此判 G3.8 通过）；④ 台账列出**需要用户提供**的资源清单（OAuth App / IdP / staging / 测试仓 / AI Key 与预算）与各自影响的路径。
- **不做什么**：不使用真实生产凭据；不代用户创建 OAuth / IdP；不把「模板就绪」写成「G3 通过」。
- **依赖**：M53.4（G3.8 证据）；其余待资源。
- **交付物**：预估 2 commits / 4-6 文件 / 200-400 行。
- **风险与缓解**：模板与实跑脱节 → 每条附最小可执行命令，并要求实跑时回填命令实际输出。

## 阶段收口要求

- **质量门**：逐原子 `pnpm run lint:check` + `pnpm run lint:css:check`（涉样式时）+ `pnpm typecheck` + 定向测试；跨包改动先 `pnpm -r build` 再 typecheck；阶段收口跑 platform 全量 + e2e + 视觉 + `test:coverage` + `gates:docs`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（`standard`；涉及发布链 / 运维实测升 `deep`），Reject 须闭环后复审。
- **台账回填**：G2 / G5 / G7 / G8 按实测回填；G3 标「框架就绪 / 实跑待资源」；G4 记录窗口读数（不宣称达成）；`@v1` 保持未启用。
- **不做**：本阶段不发布 1.0.0、不真发 0.6.1、不启用自动发布、不启用 `@v1`。
- **归档**：按 [规划规范 §4](../standards/planning.md) 迁出为 `archive/todo-archive-phases-m53.md` + 索引行 + roadmap 状态同步。
