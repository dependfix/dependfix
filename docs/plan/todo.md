# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M58 发布链可信收口**（2026-11-12 规划；5 原子） |
| 下一阶段（未规划） | 用户 2026-11-12 决策「全部纳入、分四期」：M58 发布链 → 沙箱 fix 与执行可靠性 → 平台减法与页面治理 → 文档与 AI 治理；后三期在 M58 归档后逐期规划，候选不预先分配阶段编号 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M57 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M57 已归档；M58 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M58 发布链可信收口

> **目标**：在 1.0.x 维护期把发布链的「门禁同口径、本地不绕过、产物可自证」三件事收口——发布前审计与构建强度对齐 Test、本地备用通道执行同一安全门禁、CHANGELOG 陈旧可被拦截、发布后镜像运行时与历史 tag 有自动结论。
> **来源**：backlog 候选 6 条上收为 5 原子（`release.yml` 审计与构建面 / CHANGELOG 新鲜度 / 本地发布门禁 / 发布后镜像运行时冒烟 / ACR 架构边界）；用户 2026-11-12 决策「全部纳入、分四期」，本阶段执行第一期（发布链方向）。
> **容量基线（逐原子交付物求和，执行角色口径）**：11 commits / 19-21 files / 560-970 行。**类型平衡**：主类型 🛡️2（M58.1 / M58.2）+ 🚀2（M58.4 / M58.5）+ 🛠️1（M58.3）；M58.5 兼 📚 次标签（双标签按主类型计）；🧪 内嵌于 M58.4；🎨 缺口显式标注（本方向无 UX 原子，已在四期序列中由第三期承接）。
> **执行顺序**：M58.1 → M58.2 → M58.3 → M58.4 → M58.5（先收本地与 CI 门禁，再补新鲜度与发布后取证，最后收敛镜像通道口径；M58.4 依赖 M58.2 的 release 工作流结构）。
> **D 阶段决策点**：D1 M58.2 的 platform 构建放在发布 job 内还是独立并行 job（默认并行前置，超预算则降级为 job 内追加）；D2 M58.3 的 `--fresh` 比对粒度（默认按「当前未发布版本段条目集合」，不做整段字节比对）；D3 M58.4 的触发面（默认仅 `release` 与 `workflow_dispatch`，不对 push 运行）；D4 M58.5 的通道方案（默认文档降级为「ACR 个人版 = amd64 备份通道 + digest 指引」，若用户改选按架构 tag 则另案）。
> **§3.4 阶段启动交叉核验（2026-11-12 实测）**：① 归档扫描 `release-security|verify:changelog|release:publish|镜像运行时冒烟|ACR` → 无同题闭环（M57 明确 M57.6 已再平衡移出、M49 边界登记、M54 ACR 残余）；② `git log --oneline -- <四条路径>` + `git log --all --grep="verify:changelog|release-security|镜像冒烟|ACR"` + `git rev-list HEAD ^origin/master --count` → 无同题修复批次（仅台账与发布提交），本地 ahead 0；③ 代码 anchor 实测：`release.yml` 无 `pnpm audit` 步骤、根 `build` 只含 `./packages/*`、`release-publish.mjs` 零安全门禁、`verify-changelog.mjs` 只验版本段存在、`docker.yml` 冒烟仅 amd64；④ 候选前提与 1.0.0 已发布状态一致，6 条候选上收为 5 原子；⑤ backlog 同步移除 6 条（候选 47 → 41）、清理 3 行孤儿 bullet、刷新 2 处前提漂移（`caomei-ui-migration.md` 1073 行 / REFERENCES 2 份受控副本 + 1 份 gitignored 生成物）。

### M58.1 本地发布通道接入安全告警门禁（P1 🛡️）

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

### M58.2 发布工作流依赖审计与构建面同口径（P1 🛡️）

- **目标**：`release.yml` 与 `test.yml` 的依赖审计强度一致（全量信号 + prod 阻断），并在发布前置阶段构建 platform，使「审计红或平台构建坏」不能进入发布。
- **范围**：`.github/workflows/release.yml`（新增全量 `pnpm audit` 信号步 + prod 阻断步，命令同 `.github/workflows/test.yml:41` / `:43`，位置与预检同区、在 Auto version（`release.yml:67`）之前；build 步补 `pnpm --filter @dependfix/platform build`）、`docs/guide/release.md`（发布前门禁清单与时长记录）、`docs/design/governance/release-pipeline.md`（新增发布前门禁清单小节）。
- **验收标准**：
  1. 阻断步无 `|| true`，带 `--ignore-registry-errors` 与显式 `--registry=https://registry.npmjs.org`，日志含审计结果行（判据同 [安全规范 §5.6](../standards/security.md)）。
  2. 负例：注入已知漏洞依赖或 platform 构建错误 → release 前置失败；还原后通过（记录 run 与日志片段）。
  3. platform 构建前置步骤 exit 0（独立 job 或发布 job 内，按 D1 决策取一支），发布时长增量实测 < 2 min（记录起止时间）。
  4. `pnpm run check:verify-chain` 与工作流 YAML 解析通过。
- **不做什么**：不改 Docker 构建链与发布判定；不改审计命令、`audit.ignore` 与豁免口径；不新增第三方扫描器。
- **依赖**：`test.yml:41-43` 现行口径；根 `build` 只含 `./packages/*`（`package.json:59`）；`test.yml:184` / `:227` 已构建 platform。
- **交付物**：2 commits / 3 files / 50-100 行。
- **风险与缓解**：发布 job 时长增加（platform 构建约 1-2 min）→ 默认改为独立并行前置 job，超预算再降级为 job 内追加；记录两次实测时长，避免「体感通过」。

### M58.3 CHANGELOG 新鲜度门禁（P2 🛠️）

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

### M58.4 发布后镜像运行时冒烟与历史 tag 巡检（P2 🚀🧪）

- **目标**：release 后自动拉取 `platform-<版本>` 镜像在 amd64 + arm64 原生 runner 跑 `/api/health`，失败告警不阻断发布；并对历史 tag 产出「已验证 / 未证实」清单。
- **范围**：`.github/workflows/release.yml`（post-release job，`needs` 发布 job、`continue-on-error: true`、`permissions: packages: read`）、新增 `scripts/release/scan-image-tags.mjs` + 测试（历史 tag 报告；`pathToFileURL` / `isDirectExecution` 入口守卫，供单测 import）、`apps/platform/docker/smoke-test.sh`（复用，必要时参数化版本断言）、`docs/guide/release.md`。
- **验收标准**：
  1. amd64 与 arm64（`ubuntu-24.04-arm`，原生，不用 QEMU）各自 `docker pull` 后运行冒烟，`/api/health` 的版本与 commit 与发布锚一致。
  2. 冒烟失败不改变发布 job 结论，但 job summary 与日志有可见告警（含镜像 tag 与失败原因）。
  3. `scan-image-tags.mjs` 对指定窗口输出每个 tag 的 `verified` / `unverified`；缺凭证、缺镜像、网络失败一律写「未证实」，不写通过。
  4. 单测覆盖结论解析、失败分流与无凭证 fail-open；`pnpm run gates:docs` 通过。
- **不做什么**：不改发布判定与镜像构建架构；不引入 QEMU；不对每次 push 运行（仅 release / dispatch）；不重建历史镜像。
- **依赖**：`GH_PAT` 或 `GITHUB_TOKEN` 的 `read:packages`；`docker.yml` 双架构 manifest 回读；1.0.0 已人工复核 health（M54 记录）。
- **交付物**：3 commits / 5 files / 250-400 行。
- **风险与缓解**：GHCR 权限 / 网络失败 → 全部 fail-open 但必须可见（summary + 日志）；arm runner 成本 → 仅 release 触发且各架构只跑一次冒烟。

### M58.5 ACR 多架构边界收口（P2 🚀📚）

- **目标**：消除 ACR「按 tag 只拿 amd64」造成的双架构误读；默认按「amd64 备份通道」在发布说明与部署指南单一口径标注，并保留 digest 取双架构的指引。
- **范围**：`docs/guide/release.md`（ACR 通道定位与 digest 指引）、`docs/guide/release-1.0.md`（1.0 记录口径）、`docs/guide/deployment.md`（镜像来源说明，若涉及）、`docs/design/governance/release-pipeline.md`（新增镜像通道矩阵，含 ACR）。
- **验收标准**：
  1. 文档对 ACR 的表述一致：个人版按 tag 为 amd64、双架构按 OCI digest 或 GHCR 获取；不再称 ACR 为双架构运行证据。
  2. 发布说明模板含该限制一行（`release.md` 或 `release-1.0.md`）。
  3. `rg -n "ACR|registry.cn-hangzhou" docs/guide docs/design` 复核无相反表述；`pnpm run gates:docs` 通过。
- **不做什么**：不迁 ACR 企业版；不改 GHCR / Docker Hub 主通道与 `docker.yml` 推送逻辑；不重建历史 tag。
- **依赖**：2026-11-05 ACR 复核证据（tag 解析单 amd64 / OCI index 仅按 digest）；M54 归档发布记录。
- **交付物**：2 commits / 3-4 files（`docs/guide/release.md`、`docs/guide/release-1.0.md`、`docs/design/governance/release-pipeline.md`，可选 `docs/guide/deployment.md`）/ 80-150 行。
- **风险与缓解**：文档降级可能被读成「放弃 arm64」→ 同段写明 GHCR / docker.io 双架构可用性与 digest 取法；D 阶段若用户改选按架构 tag，按验收① 另案并补 CI 断言。

### 质量门

- 逐原子：`pnpm run lint:check`（涉及样式时另跑 `pnpm run lint:css:check`）+ `pnpm typecheck` + 定向 vitest；改动 `packages/*/src/**` 时先 `pnpm -r build` 再提交。
- 涉及工作流 / 发布脚本：`pnpm run check:verify-chain` + 对应脚本单测；发布链改动记录一次 `release:preflight` 或 dry-run 证据。
- 文档面：`pnpm run gates:docs`（20 项）+ 涉及设计稿时 `check:doc-size` / `check:doc-governance` 无新增 warning。
- 阶段收口：`regression:phase-close` profile（或等价五项组合）+ A 阶段 Review Gate 放行 + 推送后 CI 回执。

### 阶段收口要求

- M58.1-M58.5 全部闭环，验收证据落 `artifacts/`（gitignored）并在归档块引用命令与 run id。
- 发布链改动的负例标定必须留痕（审计命令失败 / platform 构建失败 / changelog 陈旧 / 冒烟失败各一组）。
- 未验证项（如 arm runner 首次运行、GHCR 凭证缺失）写「未证实」并登记 backlog，不得以「设计已覆盖」替代。

---

## 上一阶段

M57（执行面可信与发布验证收口）已于 2026-11-10 归档：执行记录见 [archive/todo-archive-phases-m57.md](archive/todo-archive-phases-m57.md)，路线图详情见 [archive/roadmap-phases-m57.md](archive/roadmap-phases-m57.md)，本批经验沉淀见 [experience-archive §八十六](../design/governance/experience-archive-§79-§85-ops-release.md#八十六、m57-归档批次经验沉淀-并列次键用例区分度-终态条件写-门禁未知态-受管块插入-视觉连带)。
