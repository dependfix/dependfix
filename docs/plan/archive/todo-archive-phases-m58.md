# 待办归档分片：M58 发布链可信收口

> 本分片由 2026-11-12 M58 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划、执行记录与验收证据，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m58.md](roadmap-phases-m58.md)。

---

> **归档摘要**：5 原子全部闭环（本地发布安全门禁 / release 依赖审计与构建面同口径 / CHANGELOG 新鲜度 / 发布后镜像原生双架构冒烟 + 历史 tag 巡检 / ACR 架构边界）。阶段窗口首父链 **18 commits**（M58 17 + Dependabot #236 1）、唯一 diff **25 文件 / +1783 −521**；M58 自身 **17 commits / 23 文件 / +1629 −123**（`git diff --shortstat 0781a037^..9d5fbbcd` 排除 Dependabot 合并的 lockfile 面实测；规划批次 5 文件 / +116 −37）。全部已推送（`origin/master` = `9d5fbbcd`），push CI（Test `43224698056` / CodeQL ×2 / VitePress / TODO）全绿。审计：M58.1 / M58.5 standard，M58.2 / M58.3 / M58.4 deep；五条均 **R1 Reject → 复审 Pass**。未证实项：M58.4 的 arm64 runner 首跑 / 私有 GHCR 拉取 / 巡检真实输出 / 冒烟失败可见性；M58.5 的 ACR arm64 主机拉取（已登记 backlog 已知边界与发布管线设计 §4.6 / §4.7）。

---

## M58：发布链可信收口（2026-11-12 规划 / 2026-11-12 归档）

> **目标**：在 1.0.x 维护期把发布链的「门禁同口径、本地不绕过、产物可自证」三件事收口——发布前审计与构建强度对齐 Test、本地备用通道执行同一安全门禁、CHANGELOG 陈旧可被拦截、发布后镜像运行时与历史 tag 有自动结论。
> **来源**：backlog 候选 6 条上收为 5 原子（`release.yml` 审计与构建面 / CHANGELOG 新鲜度 / 本地发布门禁 / 发布后镜像运行时冒烟 / ACR 架构边界）；用户 2026-11-12 决策「全部纳入、分四期」，本阶段执行第一期（发布链方向）。
> **容量基线（逐原子交付物求和，执行角色口径）**：11 commits / 19-21 files / 560-970 行。**类型平衡**：主类型 🛡️2（M58.1 / M58.2）+ 🚀2（M58.4 / M58.5）+ 🛠️1（M58.3）；M58.5 兼 📚 次标签（双标签按主类型计）；🧪 内嵌于 M58.4；🎨 缺口显式标注（本方向无 UX 原子，已在四期序列中由第三期承接）。
> **执行顺序**：M58.1 → M58.2 → M58.3 → M58.4 → M58.5（先收本地与 CI 门禁，再补新鲜度与发布后取证，最后收敛镜像通道口径；M58.4 依赖 M58.2 的 release 工作流结构）。
> **D 阶段决策点**：D1 M58.2 的 platform 构建放在发布 job 内还是独立并行 job（默认并行前置，超预算则降级为 job 内追加）；D2 M58.3 的 `--fresh` 比对粒度（默认按「当前未发布版本段条目集合」，不做整段字节比对）；D3 M58.4 的触发面（默认仅 `release` 与 `workflow_dispatch`，不对 push 运行）；D4 M58.5 的通道方案（默认文档降级为「ACR 个人版 = amd64 备份通道 + digest 指引」，若用户改选按架构 tag 则另案）。
> **§3.4 阶段启动交叉核验（2026-11-12 实测）**：① 归档扫描 `release-security|verify:changelog|release:publish|镜像运行时冒烟|ACR` → 无同题闭环（M57 明确 M57.6 已再平衡移出、M49 边界登记、M54 ACR 残余）；② `git log --oneline -- <四条路径>` + `git log --all --grep="verify:changelog|release-security|镜像冒烟|ACR"` + `git rev-list HEAD ^origin/master --count` → 无同题修复批次（仅台账与发布提交），本地 ahead 0；③ 代码 anchor 实测：`release.yml` 无 `pnpm audit` 步骤、根 `build` 只含 `./packages/*`、`release-publish.mjs` 零安全门禁、`verify-changelog.mjs` 只验版本段存在、`docker.yml` 冒烟仅 amd64；④ 候选前提与 1.0.0 已发布状态一致，6 条候选上收为 5 原子；⑤ backlog 同步移除 6 条（候选 47 → 41）、清理 3 行孤儿 bullet、刷新 2 处前提漂移（`caomei-ui-migration.md` 1073 行 / REFERENCES 2 份受控副本 + 1 份 gitignored 生成物）。

### M58.1 本地发布通道接入安全告警门禁（P1 🛡️）

- **状态**：✅ 已闭环（2026-11-12；审计 R1 standard Reject → R2 quick Pass）。
- **目标**：`pnpm release:publish` 在本地通道发布前执行与 `release.yml` 同一安全告警门禁；绕过必须显式 `--skip-security=<理由>` 并留痕，使「门禁存在但本地未执行」不再可能。
- **范围**：`scripts/release-publish.mjs`（npm 发布前调用 `node scripts/check-release-security-alerts.mjs`，非零中止；新增 `--skip-security` 解析、理由校验与日志记录）、`scripts/release-publish.test.mjs`（门禁失败 / 跳过 / 理由缺失三支）、`docs/guide/release.md`（本地备用通道步骤、绕过口径与证据要求）、`package.json`（如需门禁命令别名）。
- **验收标准**：
  1. 负例：安全门禁退出非零（mock 或注入缺 token）时 `release:publish` 在 npm 发布前中止；定向用例覆盖且命令可复现。
  2. `--skip-security` 无理由 → 退出非零；有理由 → 日志与终端摘要包含该理由字符串后继续。
  3. CI 通道行为不变：`release.yml` 现有预检与发布前两步（`.github/workflows/release.yml:54` / `:96`）仍为阻断。
  4. 定向 `pnpm exec vitest run scripts/release-publish.test.mjs` + `pnpm run lint:check` + `pnpm typecheck` 通过。
- **不做什么**：不改 `check-release-security-alerts.mjs` 的判定与 fail-closed 语义；不新增 `--json` 模式；不改 npm 发布参数、OTP 透传与 tag 自愈逻辑。
- **依赖**：`scripts/check-release-security-alerts.mjs`（现状无采集时点，另有独立候选）；`release.yml` 门禁两步；本地通道曾在 0.6.0 使用（M49 归档记录）。
- **交付物**：2 commits / 3-4 files（`scripts/release-publish.mjs`、`scripts/release-publish.test.mjs`、`docs/guide/release.md`，可选 `package.json`）/ 80-140 行。
- **风险与缓解**：本地无 `GH_PAT` 或网络不可达会阻断发布 → 与 CI 同口径 fail-closed，文档提供 `--skip-security=<理由>` 显式通道并要求写入发布证据；用例覆盖两条分支，避免「绕过后静默」。
- **执行记录（2026-11-12 闭环）**：`33c3940b` `release:publish` 在 publish / tag 循环前以 `process.execPath` 执行同一门禁脚本（同源同 fail-closed），新增 `runSecurityGate`（dry-run / 无动作轮次跳过，理由未使用时显式提示）与 `planNeedsSecurityGate`（npm 发布 + tag-only + 自愈补 tag 才触发）；`--skip-security=<理由>` 缺 / 空 / 误吞下一个 flag 一律非零退出，理由单行化并限长 200；`c9044cf5` 文档同步（`security.md §5.9` 本地通道同口径与「绕过不构成豁免」、`release.md` 与脚本索引）。**审计 R1 发现的 CI 阻断缺陷已修**：`release.yml` 的 `Release Publish` 步骤补齐 `GH_PAT` + `GITHUB_TOKEN`——否则发布器内第三次同源门禁会 fail-closed 拦死 CI 发布（文件未改 ≠ 行为不变）。
- **验证证据**：定向 `scripts/release-publish.test.mjs` 45 passed；mutation 3/3 击杀（`artifacts/review-gate/2026-11-12-m58-1-mutation.md`，基线 md5 `573b5e73…cfe`）；真实门禁负例（去除全部 token）EXIT=1；`lint:check` 0 error（4 存量 warning）、`typecheck` 7 项目、`gates:docs` 20 项、`check:doc-governance` 阻断 0 / warning 0、`check:verify-chain` OK；`release.yml` YAML 解析通过且 `Release Publish.env` 读回两键。

### M58.2 发布工作流依赖审计与构建面同口径（P1 🛡️）

- **状态**：✅ 已闭环（2026-11-12；审计 R1 deep Reject → R2 deep Pass，残留两项已同批收口）。
- **目标**：`release.yml` 与 `test.yml` 的依赖审计强度一致（全量信号 + prod 阻断），并在发布前置阶段构建 platform，使「审计红或平台构建坏」不能进入发布。
- **范围**：`.github/workflows/release.yml`（新增全量 `pnpm audit` 信号步 + prod 阻断步，命令同 `.github/workflows/test.yml:41` / `:43`，位置与预检同区、在 Auto version（`release.yml:67`）之前；build 步补 `pnpm --filter @dependfix/platform build`）、`docs/guide/release.md`（发布前门禁清单与时长记录）、`docs/design/governance/release-pipeline.md`（新增发布前门禁清单小节）。
- **验收标准**：
  1. 阻断步无 `|| true`，带 `--ignore-registry-errors` 与显式 `--registry=https://registry.npmjs.org`，日志含审计结果行（判据同 [安全规范 §5.6](../../standards/security.md)）。
  2. 负例：注入已知漏洞依赖或 platform 构建错误 → release 前置失败；还原后通过（记录 run 与日志片段）。
  3. platform 构建前置步骤 exit 0（独立 job 或发布 job 内，按 D1 决策取一支），发布时长增量实测 < 2 min（记录起止时间）。
  4. `pnpm run check:verify-chain` 与工作流 YAML 解析通过。
- **不做什么**：不改 Docker 构建链与发布判定；不改审计命令、`audit.ignore` 与豁免口径；不新增第三方扫描器。
- **依赖**：`test.yml:41-43` 现行口径；根 `build` 只含 `./packages/*`（`package.json:59`）；`test.yml:184` / `:227` 已构建 platform。
- **交付物**：2 commits / 3 files / 50-100 行。
- **风险与缓解**：发布 job 时长增加（platform 构建约 1-2 min）→ 默认改为独立并行前置 job，超预算再降级为 job 内追加；记录两次实测时长，避免「体感通过」。
- **执行记录（2026-11-12 闭环）**：`1c31eaaa` `release.yml` 在 install 后新增与 `test.yml` 逐字节同命令的两步审计（全量信号 `|| true` 不阻断 / prod 阻断无 `|| true` + `--ignore-registry-errors` + 显式公共 registry），位置在 `Auto version` 之前；`pnpm run build` 之后补 `Build platform`。`820a0b86` 文档：`release-pipeline` 新增 §4.5（阻断顺序表 + D1 决策 + 时长 + 负例）、`release.md` 同步 CI 行为清单与指针、`security.md §5.6/§5.8` 同批对齐发布链复跑口径；随后补 run `43210761634` 工作流级负例、`checklist §5.6` 第 ⑥ 项与 §4.5 行序。**D1 决策**：取「job 内追加」（实测增量 36-58s，低于 2 分钟预算；拆并行 job 需再切发布 job 并重复 checkout / install / build）。
- **验证证据**：① 工作流级负例 run [`43210761634`](https://github.com/dependfix/dependfix/actions/runs/43210761634)——临时分支注入 `lodash@4.17.15` 后 dispatch，第 7 步 `pnpm audit (prod, moderate+, blocking)` **failure**（日志含 `high | Command Injection in lodash` / `GHSA-35jh-r3h4-6jhm`），其后 20 步全部 `skipped`（含 `Auto version` / `Release Publish` / tag / Release / Docker 派发），无发布副作用；分支已删除、master 未注入。② 时长：Test run `43156533722` 同一命令 E2E job 36s（04:43:02→04:43:38）/ Visual job 38s（04:43:04→04:43:42）；本地 warm 57.6s / 45.1s。③ 平台构建负例：注入语法错误 → exit 1（`[builtin:vite-transform] Unexpected token`），还原后 md5 一致且 exit 0。④ 仓库正例审计 exit 0（`2 vulnerabilities found / 1 low | 1 moderate (1 ignored)`；本地命令层口径——release 侧同命令日志与 `Build platform` 自身起止时刻待首个真实发布 run 回填，见发布管线设计 §4.5）。⑤ `check:verify-chain` OK、YAML 解析 OK、`gates:docs` 20 项、`check:doc-governance` 0/0、`lint:check` 0 error（4 存量 warning）、`typecheck` 7 项目。

### M58.3 CHANGELOG 新鲜度门禁（P2 🛠️）

- **状态**：✅ 已闭环（2026-11-12；审计 R1 deep Reject → R2 deep Pass，S5 同批收口）。
- **目标**：发布前发现「版本段存在但内容陈旧」——changelog 生成后又有新 commit 时门禁非零，而不是只校验版本段存在。
- **范围**：`scripts/changelog.mjs`（抽出可复用的「按当前版本重算段」入口，import 不写盘）、`scripts/verify-changelog.mjs`（新增 `--fresh` 模式：内存重算并比对，差异非零，不写盘）、`scripts/verify-changelog.test.mjs`、`.github/workflows/release.yml`、`docs/guide/release.md`。
- **验收标准**：
  1. 负例：临时 git 仓库生成 changelog 后追加一个 feat commit → `verify:changelog --fresh` 非零并指出文件；还原后退出 0。
  2. 正常发布路径不误报，且运行前后 `git status --porcelain` 一致（无写盘副作用）。
  3. 无网络依赖；浅克隆 / 无 tag 场景 fail-open 并输出显式 warning（判据写文档）。
  4. 定向 vitest + `pnpm run lint:check` + `pnpm typecheck` 通过。
- **不做什么**：不改 `pnpm changelog` 生成算法与发布提交顺序；不引入网络或 registry 探测；不重写历史版本段。
- **依赖**：`changelog.mjs` 增量生成与 HEAD 日期幂等口径（模块头注释）；`verify-changelog.mjs` 现行 `extractSection`。
- **交付物**：2 commits / 5 files（`scripts/changelog.mjs`、`scripts/verify-changelog.mjs`、`scripts/verify-changelog.test.mjs`、`.github/workflows/release.yml`、`docs/guide/release.md`）/ 100-180 行。
- **风险与缓解**：重算与磁盘格式差异导致误报 → 只比对当前未发布版本段的条目集合而非整段字节，正例 / 负例各 2 组；`--fresh` 与默认模式互不影响。
- **执行记录（2026-11-12 闭环）**：
  - `changelog.mjs` 抽出 `computeUnreleasedSection`（增量重算未发布段 + 依赖 / 基线兜底，不写盘）；两处 fallback 同样按 `root` 取数；
    导出 `CHANGELOG_TARGETS`，`main()` 改为调用该函数（行为等价搬迁）。
  - `verify-changelog.mjs` 新增 `--fresh`：条目集合多重集比较、已打 tag 的段跳过、浅克隆 / 无 tag 先校验存在性再 warning 放行、
    全程不写盘、`execFileSync` 数组参数避免 shell 拼接；`main` 改 async 返回退出码。
  - `release.yml` 的 `Verify changelog is up to date` 改跑 `--fresh`；新增临时 git 仓库集成用例（生成 → 追加 feat → 陈旧 → 还原）。
- **验证证据**：
  - ① 临时 `/tmp` 仓库：生成后追加 `feat` → 判定陈旧并点名文件，重算前后文件字节一致。
  - ② 真实仓库发布路径模拟（`packages/skills` 版本 1.0.0→1.0.1 + `pnpm changelog`）→ `--fresh` exit 0；删除该段 1 条条目 →
    exit 1 并点名 `packages/skills/CHANGELOG.md`；还原后 exit 0。
  - ③ 已发布态 `--fresh` exit 0 且 `git status` 前后一致。
  - ④ mutation 7/7 击杀（工件 `artifacts/review-gate/2026-11-12-m58-3-mutation.md`，基线 md5 `a4a249c7…3abf359`）。
  - ⑤ `pnpm exec vitest run scripts` 54 files / 1125 passed；`lint:check` 0 error（4 存量 warning）、`typecheck` 7 项目、
    `gates:docs` 20 项、`check:doc-governance` 0/0、`check:orphan-ids` 0、`check:doc-size` 超阈值 0。
  - **偏差说明**：实际 8 文件 / 约 530 增行，高于预估「5 文件 / 100-180 行」——多出 `release-pipeline` D2 段、`scripts/README` 索引与新增 fresh 集成测试文件。

### M58.4 发布后镜像运行时冒烟与历史 tag 巡检（P2 🚀🧪）

- **状态**：✅ 已闭环（2026-11-12；审计 R1 deep Reject（3B）→ 修复 → R2 deep Pass，W7/S6-S9 同批收口）。
- **目标**：release 后自动拉取 `platform-<版本>` 镜像在 amd64 + arm64 原生 runner 跑 `/api/health`，失败告警不阻断发布；并对历史 tag 产出「已验证 / 未证实」清单。
- **范围**：`.github/workflows/release.yml`（post-release job，`needs` 发布 job、`continue-on-error: true`、`permissions: packages: read`）、新增 `scripts/release/scan-image-tags.mjs` + 测试（历史 tag 报告；`pathToFileURL` / `isDirectExecution` 入口守卫，供单测 import）、`apps/platform/docker/smoke-test.sh`（复用，必要时参数化版本断言）、`docs/guide/release.md`。
- **验收标准**：
  1. amd64 与 arm64（`ubuntu-24.04-arm`，原生，不用 QEMU）各自 `docker pull` 后运行冒烟，`/api/health` 的版本与 commit 与发布锚一致。
  2. 冒烟失败不改变发布 job 结论，但 job summary 与日志有可见告警（含镜像 tag 与失败原因）。
  3. `scan-image-tags.mjs` 对指定窗口输出每个 tag 的 `verified` / `unverified`；缺凭证、缺镜像、网络失败一律写「未证实」，不写通过。
  4. 单测覆盖结论解析、失败分流与无凭证 fail-open；`pnpm run gates:docs` 通过。
- **不做什么**：不改发布判定与镜像构建架构；不引入 QEMU；不对每次 push 运行（仅 release / dispatch）；不重建历史镜像。
- **依赖**：`GH_PAT` 或 `GITHUB_TOKEN` 的 `read:packages`；`docker.yml` 双架构 manifest 回读；1.0.0 已人工复核 health（M54 记录）。
- **交付物**：3 commits / 6 files / 250-450 行（实际 4 commits / 8 文件，含 `todo.md` / `backlog.md` 收口）。
- **风险与缓解**：GHCR 权限 / 网络失败 → 全部 fail-open 但必须可见（summary + 日志）；arm runner 成本 → 仅 release 触发且各架构只跑一次冒烟。
- **执行记录（2026-11-12 闭环）**：
  - `docker.yml` 新增 `post-release-smoke`：`needs: merge`、`platform_version` 门控、job 级 `continue-on-error`、amd64 / arm64 原生矩阵、
    `fetch-depth: 0` + `persist-credentials: false`、`docker pull` 后跑 `smoke-test.sh`（断言 `/api/health` 的版本与 commit）、
    amd64 腿跑历史 tag 巡检写 Job Summary、失败写「未证实」+ `::warning::`。
  - 新增 `scripts/release/scan-image-tags.mjs`（双架构 manifest 判定、fail-open、`--key=value` / `--key value` 两形态）
    + 18 例单测；`release-pipeline §4.6`（位置决策、矩阵、失败语义、GHCR-only 范围、未证实项）、`release.md` 指针、`scripts/README` 索引。
- **验证证据**：
  - ① 巡检两形态实跑（无 GHCR 凭证）：空格 / 等号 argv 均 exit 0，全部 `unverified` + `401 Unauthorized` 原因，绝不写 `verified`。
  - ② `docker.yml` YAML 解析 OK；步骤序 checkout(fetch-depth 0) → setup-node → setup-buildx → login → Pull image →
    Run image smoke test → Scan → Summary；触发面与最小权限（contents/packages read）经解析核对。
  - ③ 参数/进程边界单测 18 passed（含工作流同形 argv、全 unverified 返回 0、`--json` 结构、空窗口文案、参数 fail-closed）。
  - ④ `lint:check` 0 error（4 存量 warning）、`typecheck` 7 项目、`gates:docs` 20 项、`check:doc-governance` 0/0、`check:orphan-ids` 0。
  - **未证实**：arm64 原生 runner 首跑、私有 GHCR `packages: read`、全量历史下巡检真实输出、冒烟失败可见性——已登记 `backlog.md` 已知边界，
    首个发布 run 回填 §4.6；回填前不得记为「已验证」。

### M58.5 ACR 多架构边界收口（P2 🚀📚）

- **状态**：✅ 已闭环（2026-11-12；审计 R1 standard Reject（B1 机制表述与实证相反）→ 修复 → R2 standard Pass，W4/W5/W6 同批收口）。
- **目标**：消除 ACR「按 tag 只拿 amd64」造成的双架构误读；默认按「amd64 备份通道」在发布说明与部署指南单一口径标注，并保留 digest 取双架构的指引。
- **范围**：`docs/guide/release.md`（ACR 通道定位与 digest 指引）、`docs/guide/release-1.0.md`（1.0 记录口径）、`docs/guide/deployment.md`（镜像来源说明，若涉及）、`docs/design/governance/release-pipeline.md`（新增镜像通道矩阵，含 ACR）。
- **验收标准**：
  1. 文档对 ACR 的表述一致：个人版按 tag 行为依推送路径而变（0.5.0 单 amd64；1.0.0 起 registry 回读双平台 index，arm64 主机未实测），双架构按 OCI digest / GHCR / Docker Hub 获取；不再称 ACR 为双架构运行证据。
  2. 发布说明模板含该限制一行（`release.md` 或 `release-1.0.md`）。
  3. `rg -n "ACR|registry.cn-hangzhou" docs/guide docs/design` 复核无相反表述；`pnpm run gates:docs` 通过。
- **不做什么**：不迁 ACR 企业版；不改 GHCR / Docker Hub 主通道与 `docker.yml` 推送逻辑；不重建历史 tag。
- **依赖**：2026-11-05 ACR 复核（0.5.0 客户端按 tag 单 amd64）+ 2026-11-07 run `42381362295`（三 registry × 4 tag 回读双架构，ACR 4/4）；M54 归档发布记录。
- **交付物**：2 commits / 5 files / 80-150 行（`release.md`、`release-1.0.md`、`deployment.md`、`release-pipeline.md`、`release-1.0-readiness.md`）。
- **风险与缓解**：文档降级可能被读成「放弃 arm64」→ 同段写明 GHCR / docker.io 双架构可用性与 digest 取法；D 阶段若用户改选按架构 tag，按验收① 另案并补 CI 断言。
- **执行记录（2026-11-12 闭环）**：
  - `release-pipeline` 新增 §4.7 通道矩阵（GHCR / Docker Hub 双架构主通道；ACR 个人版 = amd64 备份通道）与「按 tag 行为依推送路径」的证据边界；
  - `deployment.md` 通道定位（含 GHCR 私有 / `read:packages` 前提）；`release-1.0.md` 定位句 + 发布说明骨架限制行 + 发布前门禁第 8 条常驻检查项，
    并顺带订正「本地备用通道不内置门禁」的历史漂移；`release.md` ACR 复核小节补定位分层；`release-1.0-readiness.md` 企业版路径表述收口。
- **验证证据**：
  - ① run `42381362295` 日志实测：ACR 4 个 tag（`latest` / `2026-11-07` / `platform-1.0.0` / `sha-5c81058`）均 `linux/amd64 linux/arm64`（digest 合成路径）；
    0.5.0 的单 amd64 样本限定为「amd64 主机按 tag 拉取的客户端行为」，不再写成通道恒定属性。
  - ② `gates:docs` 20 项（179 页 / 855 锚点全命中）；`check:doc-governance` 阻断 0 / warning 0；`check:doc-size` 超阈值 0。
  - ③ `rg -n "ACR|registry.cn-hangzhou" docs/guide docs/design` 复核：无「ACR 双架构运行证据」类表述；arm64 主机实际拉取统一标「未实测」。
  - **未证实**：ACR 在 arm64 主机的按 tag 实际拉取（需 arm 环境一次性取证后回填 §4.7）。

### 质量门

- 逐原子：`pnpm run lint:check`（涉及样式时另跑 `pnpm run lint:css:check`）+ `pnpm typecheck` + 定向 vitest；改动 `packages/*/src/**` 时先 `pnpm -r build` 再提交。
- 涉及工作流 / 发布脚本：`pnpm run check:verify-chain` + 对应脚本单测；发布链改动记录一次 `release:preflight` 或 dry-run 证据。
- 文档面：`pnpm run gates:docs`（20 项）+ 涉及设计稿时 `check:doc-size` / `check:doc-governance` 无新增 warning。
- 阶段收口：`regression:phase-close` profile（或等价五项组合）+ A 阶段 Review Gate 放行 + 推送后 CI 回执。

### 阶段收口要求

- M58.1-M58.5 全部闭环，验收证据落 `artifacts/`（gitignored）并在归档块引用命令与 run id。
- 发布链改动的负例标定必须留痕（审计命令失败 / platform 构建失败 / changelog 陈旧 / 冒烟失败各一组）。
- 未验证项（如 arm runner 首次运行、GHCR 凭证缺失）写「未证实」并登记 backlog，不得以「设计已覆盖」替代。

## 阶段收口（2026-11-12）

- **交付**：5/5 原子闭环；17 commits（规划 1 + M58.1 3 + M58.2 4 + M58.3 3 + M58.4 4 + M58.5 2）；唯一 diff 23 文件 / +1629 −123。
- **插队 / 再平衡**：0 插队批、0 再平衡项（用户 2026-11-12「全部纳入、分四期」在规划阶段吸收）。
- **Review Gate**：M58.1 standard（R1 Reject → R2 Pass）/ M58.2 deep（R1 Reject → R2 Pass → R3 Pass）/ M58.3 deep（R1 Reject → R2 Pass）/ M58.4 deep（R1 3B → R2 Pass）/ M58.5 standard（R1 Reject → R2 Pass）。
- **验证**：`regression:phase-close` 结论见下方「回归记录」；`gates:docs` 20 项、`check:doc-governance` 阻断 0 / warning 0、`check:doc-size` 超阈值 0、`lint:check` 0 error（4 存量 warning）、`typecheck` 7 项目、`scripts` 单测 1143 passed、push Test run `43224698056` success。
- **推送**：全部原子 commit 已推送（`origin/master` = `9d5fbbcd`）；本批归档 / 沉淀 commit 待推送。
- **残余登记**：M58.4 / M58.5 未证实项（[backlog](../backlog.md) 已知边界 + 发布管线设计 §4.6 / §4.7 回填）；`release.md` 499/500 行（后续发布链文档新内容优先落 `release-pipeline.md`）；M58.2 的 release 侧审计日志与 `Build platform` 起止时刻待首个真实发布 run。

---

## 回归记录（2026-11-12 阶段收口）

- **profile**：`pnpm regression:phase-close`（2026-11-12；**Review Gate Pass**，exit 0）。
- **读数**：`test:coverage` **389 files / 5936 passed / 10 skipped**（Statements 89.73% / Branches 84.21% / Functions 90.11% / Lines 89.83%）；`security:audit-deps` 通过（`2 vulnerabilities found / 1 low | 1 moderate (1 ignored)`）。
- **文档与治理**：`check:docs` 八类通过（links 166 / anchor-id 227）、`check:doc-governance` 阻断 0 / warning 0（归档索引 47 行）、`check:doc-size` 超阈值 0；`check:contract-freeze` / `check:verify-chain` / `check:mergify` / `check:orphan-ids` / `check:standards-redundant:strict` / `check:experience-landing` 全 PASS；`docs:build` + `docs:check:anchors` 通过。
- **静态与构建**：`lint:check` / `lint:css:check` / `typecheck` / `build` / `verify:changelog` PASS。
- **执行期修复**：`scripts/docs/check-contract-freeze.test.mjs` 三个重负载用例在 coverage 插桩下超过默认 5s（实测 6.7s），按 M53.3 先例显式放宽到 60s（复用 `SPAWN_TEST_TIMEOUT`）；复跑全绿。属阶段收口回归修复，不改判定语义。
- **证据**：`artifacts/review-gate/2026-11-12-phase-close-regression.md` / `.json`（gitignored）。
