# 待办归档分片：M53 发布工程（1.0-G 批次）

> 本分片由 2026-11-01 M53 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划与收口口径，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m53.md](roadmap-phases-m53.md)。

---

## M53: 发布工程（1.0-G 批次，2026-10-31 规划 / 2026-11-01 归档）

> **归档摘要**：5 原子（P0 1 + P1 3 + P2 1）+ **1 批追加临时待办**（用户授权、不占阶段条目编号：登录页第三方登录按钮品牌化）+ 3 批执行期收尾提交（契约门禁用例 CI 超时修复 / prerelease 口径补记 / 批量运行失败复盘派生候选登记）。阶段窗口首父链 **40 commits**（规划 2 + M53.1 4 + M53.2 16 + M53.3 3 + M53.4 5 + M53.5 3 + 收尾 3 + 追加 4；`git rev-list --first-parent --count ca5c9f88^..HEAD` 实测 40），唯一 diff **69 文件 / +6168 −550**（`git diff --shortstat ca5c9f88^..HEAD`）。推送后 CI：Test（E2E / Visual / Coverage / Test）/ CodeQL / Docs 全绿；Code Scanning 开放告警 0（alert 30 已 fixed）；Dependabot 开放 2 条（minimatch medium / deepmerge low，不阻断）。
> **证据来源**：阶段终态取自 `.session/runtime-state.json` §`m53_4` / §`m53_5` 与 `.session/current-task.yaml`，分原子数字取自各条目与 `artifacts/review-gate/`；commit / diff 取自 `git log` / `git diff --shortstat`；分原子「证据」段为闭环当期口径（会话文件 gitignored，关键结论已复述于本分片与台账）。
> **阶段目标**：把 1.0 发布前「能提前做」的工程项做完——契约冻结成可机检清单、运维从「文档说可用」变成「实测过」、指标与 mutation 证据可复算、发布链在不真发的前提下走通，并给真实环境矩阵留下可回填的执行框架。来源 = [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md) §3 门槛 G1-G8 + §5 批次表 G 行。
> **用户决策（2026-10-31）**：① 范围 = 可执行四项 + G3 执行框架；② `0.6.1` 只做发布预演不真发；③ M52 残余只并入 zh quick-start CLI 表，`dialog-select-open-dark` 边缘抖动留 backlog 观察。**2026-11-01 追加授权**：登录页第三方登录按钮品牌化（不占编号）；同日说明 Google OAuth 凭据因无可用 Google 账号暂不可测，第三方登录先只测 GitHub。
> **§3.1.1 容量记录**：插队 1 批（登录页品牌化，20 文件 / +234 −44 / 4 commits），累计 1 批 < 3、约 234 行 ≈ 阶段基线 1900-3050 行的 8-12% < 50%、剩余原子 0，三项阈值均未命中，不触发再平衡。
> **§1.1 容量评估（规划口径）**：5 原子 = 台账缺口 4 项映射（G2→M53.1、G7→M53.2、G8+G5 mutation→M53.3、G3 框架→M53.5）+ 非缺口项 M53.4；类型分布 📚 1 + 🛠️ 1 + 🧪 2 + 🚀 1；预估 **31-44 文件 / 1900-3050 行 / 13-17 commits**。实测阶段唯一 diff **69 文件 / +6168 −550 / 40 commits** ≈ 预估 2-3 倍；逐原子单独 diff 为区间口径、**不求和**（合计会大于阶段唯一 diff）。
> **不做什么**：不发布 1.0.0、不真发 0.6.1、不启用自动发布、不启用 `@v1`；不使用真实生产凭据；不把 G3 框架就绪写成 G3 通过。

### 阶段启动记录（原始）

> **阶段启动交叉核验（§3.4，2026-10-31 实测）**：① 归档扫描 `契约冻结|真实环境矩阵|运维实测|产品指标` → 0 命中（无历史闭环）；② `git log -- docs/guide/release.md` 近 5 次均为 lint / 门禁类改动，无 G2 提交；③ 代码侧 anchor：`release.md` 无冻结章节、`scripts/` 无指标脚本、`git tag` 无 `v1`、`release.yml` 的 `schedule` / `push` 仍为注释、无 Docker / 备份实测工件；zh `quick-start.md` 的 `--ai` **0 命中**（决策③前提成立）；mutation 工件仅 `artifacts/review-gate/2026-10-31-m52-4-mutation.md`（覆盖归因模块）。
> ④ 决策前提无矛盾：`0.6.1` 未被发布（`npm view dependfix version` = 0.6.0），`8fd83fc3`（`--version` 修复）已在 master 且 ahead=0 → 预演可验证修复、真发仍待授权。
> ⑤ backlog 已同步：G8 指标脚本与 zh CLI 表两条候选已从 `### 候选评估中` 删除，实测 55 项。
> **已核契约面（2026-10-31 执行角色实测，量级 + 可复现命令）**：
> - CLI `argsDef` 顶层键 **43**（42 个 flag + 1 个 `positional`）：`rg -c "^    ['\"]?[A-Za-z0-9-]+['\"]?: \{" packages/cli/src/cli/index.ts`
> - Action inputs **31**：`awk '/^inputs:/{f=1;next} /^outputs:/{f=0} f' action.yml | rg -c "^  [a-z][a-z0-9-]*:$"`
> - 运行时配置项 **41**（`RuntimeConfig` 顶层属性）+ `DEPENDFIX_*` 环境变量 **45**（去重）：`sed -n '/export interface RuntimeConfig/,/^}/p' packages/engine/src/config/index.ts | rg -c '^    [a-z][A-Za-z0-9]*\??: '` / `rg -o "DEPENDFIX_[A-Z0-9_]+" packages/engine/src -g '*.ts' | cut -d: -f2 | sort -u | wc -l`
> - DB 实体 **15** 个 `@Entity` 类（目录 17 文件，含 `base-entity.ts` 与 1 个测试）：`rg -c "@Entity\(" apps/platform/server/entities/ | awk -F: '{s+=$2} END {print s}'`
> - 报告契约 `RunResult` / `RepositoryResult`（`packages/core/src/report/`，字段数量级 20-40/接口）
> **原子间依赖与交付顺序**：M53.1（契约冻结，发布说明与实测的输入）→ M53.2（运维实测）→ M53.4（发布链预演）→ M53.5（G3 框架回填）；M53.3（指标 + mutation）独立，可并行。

### M53.1 [P0 📚] 1.0 契约冻结清单、迁移指南与 CLI 表补齐（**已闭环** `8133a62e` + `8b6dd9eb` + `a728ae0d` + `05719601`）

- **目标**：把「1.0 起不再变」的五类对外契约写成清单并机检，给出弃用策略与 0.x→1.0 迁移指南；范围同时含 zh quick-start CLI 表补齐（M52 残余，独立 commit）。
- **优先级**：P0（1.0 契约，发布前置）。
- **范围**：新增 `docs/guide/contract-freeze.md`（五类清单 + 弃用策略 + 0.x→1.0 迁移指南）+ `docs/guide/release.md`（「1.0 契约冻结与迁移」小节：策略摘要 + 指针）+ `docs/guide/quick-start.md`（zh CLI 表补齐 `--ai*` 7 行；en 侧 M52 已齐）+ `docs/i18n/en-US/guide/quick-start.md`（`--ai-api-url` 默认值表述对齐）；新增 `scripts/docs/check-contract-freeze.mjs` + 单测（从 `argsDef` / `action.yml` / `RuntimeConfig` / `DEPENDFIX_*` / 报告接口 / 实体元数据抽取实际键，与清单比对）；`package.json` + `DOC_GATES` + `test.yml` 接线；`docs/standards/documentation.md` §6 记机检口径 + review 检查点矩阵挂接。
  > **范围变更（执行期，2026-10-31）**：原计划把两份清单写进 `docs/guide/release.md` 两章；实测 release.md 317 行，加两份清单后 630+ 行进 guide warning 带（健康窗口 ≤500），改为独立页 `contract-freeze.md`（366 行，健康带）+ release.md 保留策略摘要与指针，`docs:check:fallback` / 侧边栏 / 台账 G2 证据同步更新。核实测 16 文件 / +1400 行，超原预估 8-10 文件 / 600-800 行 → 按「门禁脚本 + 单测 / 契约文档 / 指南与接线」三段提交。
- **验收标准**：① 五类清单（CLI 参数与模式 / Action inputs / 配置项 / 报告 JSON 字段 / DB 表列）逐项列出，脚本比对 0 差异；①′ 弃用策略成文（弃用窗口、提前通告的 minor 数、移除条件、`deprecation` 标注方式），且 1.0 后变更须 2.0 的约束与台账 §G2 一致；② 机检负例：临时新增一个 CLI 参数不登记 → exit 1，跑后还原；③ 迁移指南逐条覆盖已发生的行为变更（`--version` 元数据缺陷、M51.5 交付链导出同步→异步、`--allow-major-upgrade` 无 env 通道、M51.4 交付降级默认 `skip`、`signalsJson` 存收敛后信号）；④ zh / en CLI 表与 `argsDef` 三方键位一致——证据由本原子新增的 `check-contract-freeze.mjs` 给出（`docs:check:guides` 只做 `en ⊇ zh` 平价、不读 `argsDef`，不能单独作为该结论的依据）；⑤ `gates:docs` 全绿。
- **不做什么**：不改运行时行为；不做版本号提升；不翻译设计文档。
- **依赖**：M52 已归档（指南平价脚本与锚点门禁可复用）。
- **交付物**：预估 3-4 commits / 8-10 文件 / 600-800 行；**拆分依据**：清单章节（含机检脚本）、迁移指南章节、zh/en CLI 表补齐三段各自独立提交，文字量为主、单文件改动多为表格行，不构成逻辑耦合；若实测超 10 文件**或超 800 行**即在清单 / 迁移指南之间再拆。**实测（2026-10-31）**：3 commits + 收口 / 16 文件 / +1400 −10 行——独立成页后按「门禁脚本 + 单测（+`DOC_GATES` / `test.yml` / `documentation.md`）」「契约文档（清单 + 弃用策略 + 迁移指南）」「指南与接线（zh·en 表格 + release 指针 + 侧边栏 + 台账）」三段提交。
- **风险与缓解**：清单与代码漂移 → 键位一律从代码抽取比对（不手抄），并把机检接入 `gates:docs`；迁移指南写成空话 → 每条附「受影响对象 + 迁移动作 + 验证命令」。

### M53.2 [P1 🛠️] G7 运维实测与发布自动化预演（**已闭环** `9b3b946d` + `eb4bb49e` + `6fa611a3` + `14c815a4` + `0cfc9551` + `4d8e5532` + `8cffc838` + `538cb1ba` + `7d62ddf1` + `a7fb7a79` + `fafb2faa` + `9498a96c` + `bd649e6f` + `ae746fc9` + `51c4a83e` + `1a4d9744`）

- **目标**：把「文档说可用」变成「实测过并有证据」：镜像启动 / SQLite 备份恢复 / 迁移前滚回滚 / 队列重启收敛各留一条证据；给出自动发布启用前的开关清单与预演。
- **优先级**：P1（发布前运维证据）。
- **范围**：`docs/guide/deployment.md` 与 `en-US` 镜像（新增「运维实测记录（2026-10-31）」：R1 镜像启动 / R2 report-only 扫描 / R3 备份恢复 / R4 迁移三态 / R5 队列重启收敛 / R7 缺陷修复）+ `docs/guide/release.md`（自动发布启用清单 + 本地 dry-run）；原始日志留在 `artifacts/ops/`（gitignored，不入库）；**不另建演练脚本**——命令与实际输出直接写入文档，保证文档即证据。
  > **执行期扩展（用户 2026-10-31 授权）**：实测命中两处阻断缺陷并本批修复——**F1** 双进程 worker 从不初始化队列消费者（默认 compose 部署下扫描全挂，job 停在 `bull:scan:prioritized`）→ 新增 `server/plugins/queue-consumer.ts`（启动点 + 配置错误 fail-loud，单测 7 例，`process-role` 分类同步）；**F2** 启动备份在 WAL 下是 4KB 空库（恢复即丢数据）→ `backup.ts` 改 SQLite 在线备份 API + 仅 HTTP 主进程执行（`backup.test.ts` 重写为真实库 + WAL 一致性回归，`index.test.ts` 修正 `PRAGMA busy_timeout` 取值口径）。**审计驱动追加**：`db:restore` 的覆盖前备份同一反模式（裸复制 + 删旁文件）→ 改 `VACUUM INTO` 一致性快照；插件层失败退出补接线单测；`security.md §2.1` / 检查点矩阵 / 多容器拓扑 compose 同步。
- **验收标准**：① Docker 镜像启动 + `/api/health` + 一次 report-only 扫描 smoke 的证据（run id / 日志片段）；② SQLite 备份 → 恢复到新路径 → 关键表行数比对一致；③ 迁移前滚 → `db:migrate:revert` → 再前滚，三态证据齐全；④ 队列重启后 pending/running 收敛（复用 `queue-stale-recovery` 口径）；⑤ `release.yml` 自动触发（`schedule` / `push`）启用清单 + 本地 dry-run 预演记录；⑥ 文档内链接与证据路径可达。
- **不做什么**：不启用自动发布（只产出启用清单）；不改生产配置；不引入 Postgres / Helm（G7 记为可选）。
- **依赖**：M53.1（发布说明引用冻结清单）。
- **交付物**：预估 3-4 commits / 6-10 文件 / 400-700 行（deployment / release 文档 + 证据工件为主）。**实测（2026-10-31）**：**16 commits（含收口）/ 24 文件 / +993 −444**（含四轮审计驱动追加修复），超出预估（3-4 commits / 6-10 文件 / 400-700 行）主因是两处阻断缺陷修复 + 一处同源反模式（`db:restore`）+ 配套回归用例与治理同步；交付物分三段：代码修复 7 commits / 实测与清单文档 3 / 台账·待办·积压·经验 6。
- **风险与缓解**：本地 Docker 与 CI 环境差异 → 证据里记录镜像 digest 与命令；失败项不得静默跳过，登记为残余并写触发条件。

### M53.3 [P1 🧪] G8 产品指标采集脚本 + G5 mutation 扩面（**已闭环** `2b29f920` + `8f00bf6a` + `625fbc1d`）

- **目标**：把「近 30 个 PR 的 CI 绿率 / 人工介入率 / 误关率」变成可复算脚本；mutation 从归因模块扩到 `core/report` 与 engine 判定链。
- **优先级**：P1（G5 / G8 证据面）。
- **范围**：新增 `scripts/metrics/pr-health.mjs`（GitHub API 或本地库两条取数路径，输出 Markdown + JSON）+ 单测（固定夹具断言确定值）；`release-1.0-readiness.md` G8 口径（分子 / 分母 / 窗口写死）；mutation 工件覆盖 `packages/core/src/report`（结果契约推导）与 `packages/engine/src/app`（交付判定）各 ≥3 变异。
- **验收标准**：① 脚本对固定夹具输出确定三指标值（分母 = 窗口内 PR 数，写进文档）；② 有 token / 无 token 两路径行为明确（无 token 明确报错或降级，不静默返回 0）；③ mutation 6+ 变异全部击杀并留工件（四要素）；④ G5 / G8 台账按实测回填（G8 读数标注「待 30 天窗口满足」）；⑤ `scripts` 单测全绿。
- **不做什么**：不采集个人隐私字段；不新增第三方依赖（优先复用现有 octokit / fetch 封装）；不动平台 UI。
- **依赖**：无（数据窗口满足后再回填读数）。
- **交付物**：预估 3-4 commits / 8-10 文件 / 500-750 行；**拆分依据**：指标脚本（含夹具单测）与 mutation 工件（含还原核对）两段独立提交；脚本与工件无共享代码，超 10 文件**或超 800 行**即按模块再拆。**实测（2026-11-01）**：3 commits（含收口）/ 7 文件 / **+1344 −4**（脚本 698 + 单测 478 + 夹具 146 + README 7 + `package.json` 1 + 台账 10 + 收口 4）——超预估行数 +79%，未再拆的理由：单文件纯函数、拆开即死代码；mutation 工件按惯例落 gitignored `artifacts/review-gate/2026-10-31-m53-3-mutation.md`（8 条变异 8/8 击杀，四要素齐全，不入 diff）。
- **风险与缓解**：30 天窗口数据不足 → 脚本先落地，台账标「脚本已就绪 / 读数待窗口」；API 字段漂移 → 夹具锁定响应形状 + schema 校验。
- **实测证据（2026-11-01）**：① 夹具三指标确定值 绿 5/7 · 介入 2/7 · 误关 2/7（28 例单测锁定）；② 取数两路径：`--source=api` 真实跑通（`--limit=3` 时 `window.prCount=3`，读数 绿 1 / 介入 0 / 误关 0；30 天窗口内仅 3 个 PR → 读数仍标待窗口），`--source=file` 夹具与 `--out-dir` 快照回灌读数一致；缺 token 退出码 1、空窗口退出码 1（`--allow-empty` 放行）；③ mutation 8/8 击杀（`core/report` 4 + `engine/app` 4）+ M52.4 归因 3 条 = 台账 11/11；④ 台账 G5 覆盖率按本批重测回填（89.44 / 84.04 / 90.21 / 89.55）、G8 改 ◐ 且注明「真实读数待窗口、发布说明引用前不得标 ✅」。
- **附**：本批另修复 master Test 红（契约门禁子进程用例在 CI 并发 + coverage 下超时），属 M53.1 用例的 CI 修复，不计入本原子交付物计数。
- **审计**：R1 standard **Reject**（2 blocker：`reopened` 在 open / merged 形态恒为 0；`--source=file` 契约不校验 → 静默 0 读数 / 假误关）→ R2 quick **Pass**（4 项 W：`closureRate` 可超 100%、`state` 未校验、`humanAuthored` 表述、时间基准文字）→ R3 quick **Pass**（四项关闭，`--out-dir` 快照回灌实测一致）。

### M53.4 [P1 🚀] 发布链预演与安装/升级实测（不发版）（**已闭环** `40e82b6a` + `ad7299e4` + `99090187` + `937b19cd` + `82db7bb1`）

- **目标**：真发前把发布链走通——本地打包产物验证 `--version` 修复、三路安装 smoke、Docker 多架构 tag 复核，并产出 0.6.1 发布清单（不执行）。
- **优先级**：P1（发布前置彩排）。
- **范围**：`docs/guide/release.md`（预演章节 + 0.6.1 发布清单）；新增 `scripts/release/preflight.mjs`（`pnpm pack --pack-destination <tmpdir>` → 临时目录安装 → 版本断言 → 清理）；`artifacts/release-preflight/` 证据。
- **验收标准**：① 5 个包 tarball 安装后 `dependfix --version` 等于包版本（`8fd83fc3` 修复验证）；② npx（本地 tarball）/ 全局安装 / Docker 三路 smoke 各一条证据；③ Docker 0.6.0 多架构 tag / health 复核（M49.5 遗留项）；④ 发布清单（OTP / 门禁 / 回滚 / 校验和）成文；⑤ **未** 执行 `npm publish` / 未打 tag / 未改版本号（工作区无发布痕迹）。
- **不做什么**：不真发、不推送 tag、不改 `package.json` 版本。
- **依赖**：M53.1 / M53.2（清单与运维证据）。
- **交付物**：预估 2-3 commits / 5-8 文件 / 200-400 行（release.md 预演章节 + preflight 脚本 + 证据）。
- **风险与缓解**：本地 registry / 网络不可达 → 记录失败点与重试条件；预演脚本污染工作区 → 全部在临时目录执行并断言 `git status` 干净。
- **实测（2026-11-01）**：4 commits + 收口 / 16 文件 / **+1046 −29**（预演脚本与单测 772 + 发布链修复 135 + 安全修复 25 + 文档与台账 112）。超预估（2-3 commits / 5-8 文件 / 200-400 行）原因：实测命中 3 处发布链缺陷（Docker 预算 / 派发判据 / 发布前守卫）+ 1 条 code scanning high。
- **实测证据**：① `pnpm release:preflight`（build 后）→ 5 包 tarball / `dependfix --version = 0.6.0`（= 包版本）/ 工作区不变，exit 0；② 三条安装路径各一条证据——tarball 临时工程安装（`file:` 解析经 lockfile 复核）、`npx --yes -p <tarball> dependfix --version`、`npm i -g --prefix <tmp>` → 均为 `0.6.0`；③ 发布链 dry-run 全通：`release:plan` → `release:version --dry-run`（platform 0.4→0.5 / dependfix 0.6→0.7 / engine 0.5→0.6 / core 0.6→0.7 / mcp 传导 0.3.1）、`release:publish --dry-run`（6 包全部本地 tag 已存在、无发布）、`release:github --dry-run`（复现 v0.6.0 notes）、`verify:changelog` 绿；④ Docker：`buildx --check` 无告警；**0.6.0 的 `platform-0.4.0` 镜像 tag 缺失已定位**——build job 触及 120 分钟上限被 kill（run `40745976335`，build step 115.5 分钟），已把预算提到四小时、派发改钉 `v<锚版本>` 且判据为 `git tag --points-at HEAD`；远端镜像复核仍阻断（GHCR 私有 + 本地 token 缺 `read:packages`，Docker Hub 不可达），重试条件写入手册；⑤ 发布前安全门禁实测发现 code scanning high（alert 30，`scripts/docs/vitepress-slug.mjs`）并本批修复。
- **未执行发布动作（AC⑤）**：无 `npm publish` / 无新 tag / 包版本未变——`git diff origin/master..HEAD -- 'packages/*/package.json' 'apps/platform/package.json'` 无版本行，`git tag` 仍止于 0.6.0 批次，工作区干净。
- **审计**：A 分区（预演脚本）R1 standard **Reject**（RG-B1：lockfile 断言命中 importers 的 specifier 回显而非解析结果，overrides 失效时仍判绿）→ R2 **Pass**；B 分区（发布链）R1 **Reject**（0.6.0 归因误判为并发取消，真实为两小时 job 上限）→ R2 **Reject**（anchor 判据用 tag 存在性而非 HEAD 归属）→ R3 **Pass**；C 分区（文档）**Pass**（3 项 warning 已收口：`--ref master` 补发限定 / 清单 preflight 顺序 / 首次发布 prerelease 口径）。
- **残余**：① 安全告警 alert 30 需推送后复扫确认关闭（未关闭则按 §5.9 登记 `false-positive` 台账）；② Docker 远端镜像（`platform-x.y.z` 多架构 + health）待具备 `read:packages` 的环境复核；③ 四小时预算待首个发布实测（>180 分钟须按 backlog 拆分 per-arch job）；④ 0.6.1 发布动作本身未执行（该清单后续演化为 0.7.0 发布记录，见 [release.md](../../guide/release.md#_0-7-0-发布记录-m54-2-2026-11-02-已执行)）。

### M53.5 [P2 🧪] G3 真实环境矩阵执行框架（实跑待外部资源）（**已闭环** `8153bd84` + `2a32287a` + `189c8162`）

- **目标**：把 G3.0–G3.9 从「只有 mock」推进到「执行清单 + 证据模板 + 可回填」，M53.4 产出后先行回填 G3.8（证据类型：本地 tarball 安装 / 0.6.0 镜像；发布后 `@latest` 复核另计）。
- **优先级**：P2（依赖外部资源）。
- **范围**：`release-1.0-readiness.md` §G3 矩阵行补「前置资源 / 执行步骤 / 证据字段 / 验收判据」四列语义；新增 `artifacts/real-env/` 证据模板与 `scripts/docs/check-real-env-evidence.mjs`（校验证据文件字段完整性，缺字段即失败）；G3.8 用 M53.4 实测回填。
- **验收标准**：① 9 条路径（G3.0–G3.8）+ G3.9 各含四要素与「最小可执行命令」；② 模板校验脚本对空 / 缺字段样本 exit 1；③ G3.8 有本地预演证据（M53.4 产出，证据类型 = 本地 tarball / 0.6.0 镜像；发布后 `@latest` 复核另计，不据此判 G3.8 通过）；④ 台账列出**需要用户提供**的资源清单（OAuth App / IdP / staging / 测试仓 / AI Key 与预算）与各自影响的路径。
- **不做什么**：不使用真实生产凭据；不代用户创建 OAuth / IdP；不把「模板就绪」写成「G3 通过」。
- **依赖**：M53.4（G3.8 证据）；其余待资源。
- **交付物**：预估 2 commits / 4-6 文件 / 200-400 行。
- **风险与缓解**：模板与实跑脱节 → 每条附最小可执行命令，并要求实跑时回填命令实际输出。
- **实测（2026-11-01）**：3 commits（含收口）/ 8 文件 / **+1039 −16**（校验脚本 449 + 单测 349 + 指南 201 + 台账 46 + 侧边栏 / 命令 / README 3 + 收口 6）。
- **实测证据**：① `pnpm check:real-env --init` 生成 10 条模板（`artifacts/real-env/`，gitignored）；② 默认校验 exit 0（9 `pending` + **G3.8 `partial`**，证据 `preflight.json` 与安装路径输出均真实存在且经默认存在性校验）；③ 负例：空文件 / 非法 YAML 目录 → exit 1，`--require=` 空值 → exit 2，`--require=G3.8`（partial）→ exit 1，`--dir=<文件> --json` → 可解析 JSON + exit 1；④ 25 例单测（模板与指南 `### G3.x` 集合单测锁定全等；临时目录用系统 tmpdir，移走 `artifacts/` 后仍全绿）；⑤ 全量 `pnpm test` 5709 passed（连续三次复跑全绿；首跑曾出现一次未捕获明细的失败，按既有 flaky 面观察）；`gates:docs` 20 项、lint exit 0、typecheck 7 包。
- **未把框架写成通过**：台账 G3 仍为 ❌，仅把 G3.8 记为 `partial`；指南与脚本都显式声明「`pending` / `partial` 不是 G3 通过」，`--require-all` 明确为 **1.0 发布前**专项检查（0.6.1 不适用）。
- **审计**：A 分区 R1 **Reject**（非法 YAML 二次解析崩栈致 `--json` 空输出 / `--require=` 空值静默放行）→ R2 **Reject**（单测依赖 gitignored `artifacts/` 会让 CI 必红 / `--no-check-files` 静默 / `--json` IO 错误空 stdout）→ R3 **Reject**（`repoRoot` 尾分隔符使所有仓库内相对证据路径被误拒）→ R4 **Pass**；B 分区 R1 **Reject**（4 处执行口径与仓库实际能力不符：G3.4 扫描端点不存在 / G3.6 tool 名错误 / G3.8 命令不可串行 / G3.0 三种登录不可同实例）→ R2 **Pass**（8 项 warning 收口，另 3 项 W 已修）。
- **残余**：① 九条路径实跑待用户资源（OAuth / IdP / staging+Redis / 测试仓 / AI Key × 2，清单见台账 §4）；② G3.8 的 `@latest`、Docker 远端多架构与 0.5.x→1.0 升级未执行；③ G3.9 的限流 / 超时 / 非法 JSON 需 stub 注入通道（已写入指南，未实现 stub）；④ alert 30 复扫（M53.4 遗留）；⑤ **G3.0 的 Google 入口暂不可测**：用户 2026-11-01 说明无可用 Google 账号（无法登录 Google Cloud Console 取凭据），第三方登录先只测 GitHub，Google 与 OIDC 保持未验证。

### 追加临时待办（不占阶段条目编号）：登录页第三方登录按钮品牌化（2026-11-01 用户授权）

- **目标**：登录页第三方登录按钮从「ghost 文本态 + 通用用户图标」改为**目标平台官方标识**（GitHub mark / Google 四色 G / SSO 盾牌）+ 描边按钮基座，避免第三方入口被误读为文本链接、也让 provider 一眼可辨。
- **范围**：`social-providers.ts` 补品牌展示名（`GitHub` / `Google`，不直接回显 provider id）；新增 `social-login-button.vue` 承载品牌图标与按钮形态；`login.vue` 改用新组件与品牌文案；zh 文案改「使用 {provider} 登录」；视觉基线补登录页明暗两态（视觉环境用 `NUXT_PUBLIC_*_AVAILABLE` 模拟凭据已配置）；G3.0 文档记录 Google 暂不可测。
- **不做什么**：不改变第三方登录的显隐条件与服务端 provider 配置；不引入新依赖或品牌色 token；不把 Google 按钮的渲染证据当作 G3.0 登录实测。
- **验收标准**：① 登录页 GitHub / Google 按钮使用官方标识（Google 四色 path 保留），文案为 `使用 GitHub 登录` / `使用 Google 登录`；② 未配置凭据时第三方区仍整体隐藏（既有 e2e 保持绿）；③ 明暗两态视觉基线重建并连续两轮比对通过；④ `lint:check` / `lint:css:check` / `typecheck` / 定向单测通过；⑤ 文档明确 Google OAuth 暂不可测、只测 GitHub。
- **风险与依赖**：Google 品牌图标为静态四色，暗色档需目检对比度；视觉环境以 public 布尔模拟可用性，不接线真实 OAuth（点击路径不在本批验证面）。
- **§3.1.1 容量评估**：阶段基线 1900-3050 行，本批约 200 行 ≈ 7-11%（< 50%）；累计插队 1 批（< 3）；剩余原子 0 → 三项阈值均未命中，不触发再平衡。
- **实测（2026-11-01）**：20 文件 / **+234 −44** / 4 commits（重构 / 实现+基线 / 脚本 / 文档）；视觉 21 例连续两轮全绿（新增 `login-dark`，`login-light` 重建）；auth e2e 9 例全绿；platform 单测 2396 passed（与门禁并发时曾出现 1 次未定位 flake，串行连跑两次全绿）；`lint:check` 0 error（11 存量 warning）/ `lint:css:check` / i18n lint / typecheck 7 包 / `gates:docs` 20 项全绿；**反例标定**：把品牌图标与文案间距由 8px 注入为 16px → `login-light` 失败 1559 px（约为 `maxDiffPixels 100` 的 15.6 倍），还原重建后两例通过。

## 阶段收口（2026-11-01）

- **质量门终态**：`gates:docs` 20 项；platform 单测 2396 passed；视觉 21 例连续两轮全绿；auth e2e 9 例；`lint:check` 0 error（11 存量 warning）/ `lint:css:check` / i18n lint；typecheck 7 包；`check:real-env` exit 0（9 pending + G3.8 partial）。推送后 CI：Test（E2E / Visual / Coverage / Test）/ CodeQL / Docs 全绿；Code Scanning 开放 0（alert 30 fixed）；Dependabot 开放 2 条（minimatch medium / deepmerge low，不阻断）；Docker 镜像发布仍在进行中。
- **Review Gate 汇总**：M53.1 R1 standard **Reject**（3B / 6W）→ R2 quick **Pass**；M53.2 R1 deep **Reject** → R2 **Pass** → R3 **Reject** → R4 quick **Pass**；M53.3 R1 standard **Reject** → R2 / R3 quick **Pass**；M53.4 A（预演）R1 **Reject** → R2 **Pass**、B（发布链）R1 **Reject** → R2 **Reject** → R3 **Pass**、C（文档）**Pass**；M53.5 A R1-R3 **Reject** → R4 **Pass**、B R1 **Reject** → R2 **Pass**；追加批次 A / B R1 → 修复 → R2 → R3 **Pass**。
- **台账联动**：G2 / G5 mutation / G7 / G8 按实测回填；G3 只记「执行框架 + G3.8 partial」，不写成通过；G4 / G8 窗口与 `@v1` 保持观察；`0.6.1` 未真发。
- **残余聚合**：① G3 九条实跑待用户资源（Google 入口因无可用 Google 账号暂不可测，先只测 GitHub）；② G3.8 的 `@latest` / Docker 远端多架构 / 0.5.x→1.0 升级未执行；③ G3.9 stub 通道未实现；④ Docker 远端镜像待 `read:packages`、四小时预算待首个发布实测；⑤ 1.0 是否接受 Google 未测待用户决策；⑥ 发布级回滚未演练。均已登记 backlog / 台账。
