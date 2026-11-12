# 1.0.0 发布清单与发布说明骨架

> **状态**：**已执行（2026-11-07，M54.6）**——六个发布包 `1.0.0` 已发布（npm 5 包 + `@dependfix/platform` tag-only + `v1.0.0`），`@v1` 滚动标签已创建，镜像 `platform-1.0.0` 由 dispatch `42376735406` 发布（`42373335914` 为首个通过回读门禁的 run）（原生多架构，三仓库 12/12 tag 回读双架构）；发布链、校验和与复核结果见[发布指南的 1.0.0 发布记录](release.md#_1-0-0-发布记录-m54-6-2026-11-07-已执行)，台账回填见[就绪度台账](../design/governance/release-1.0-readiness.md) §2。
> **口径**：**有条件发布**——G3 实跑 / G4 窗口按已披露豁免降级（见[就绪度台账 §2](../design/governance/release-1.0-readiness.md)），G5 / G6 / G7 可执行项补齐，G8 引用真实读数。**豁免不等于通过**：发布说明必须照实披露，不得写成 G3 / G4 已验收。
> **决策来源**：[就绪度台账 §2.2](../design/governance/release-1.0-readiness.md) + 用户 2026-11-01 四项决策（先中间版本再 `1.0.0` / 有条件发布 / 接受 Google OAuth 未测 / 目标窗口 2026-11-15）+ 当日执行期裁定第 ⑤ 条（中间版本按 `release:plan` 推导，落地为 `0.7.0`）。
> **通用机制**：`release:plan` → `release:version` → `changelog` → CI 发布链见[发布指南](release.md)；本页只列 1.0.0 的差异面与发布说明骨架。

## 1. 版本与锚点

| 项 | 1.0.0 要求 |
|:--|:--|
| 锚版本 | `v1.0.0`（GitHub Release tag + Docker 派发 `--ref v1.0.0`） |
| `dependfix`（CLI） | **必须人工改到 `1.0.0`**：`release:plan` 对 0.x 的 BREAKING 只推导 minor（见发布指南「release:plan 生成规则」），不手动修正 `release-plan.md` 就得不到 1.0.0 |
| 其余 npm 包 | **用户决策（2026-11-05）：`@dependfix/core` / `@dependfix/engine` / `@dependfix/mcp` / `@dependfix/skills` 全部随 1.0.0 发布**，版本统一 `1.0.0`；依赖范围由 `release:version` 的传导闭包更新 |
| `@dependfix/platform` | 版本独立递增（tag-only 通道），**本次同样从 `0.5.0` 抬到 `1.0.0`**（用户决策），镜像 tag 为 `platform-1.0.0` |
| CHANGELOG | **七份**：根级 + 5 个 npm 包 + `apps/platform`（`pnpm verify:changelog` 按 6 个发布包 + 根级校验）；由 `pnpm changelog` 生成并提交 |
| `v1` 滚动标签 | **已创建（2026-11-07，annotated `097723a7` → `83c966fd`）**；Action 引用写作 `@v1`，回退命令未演练 |

## 2. 发布前门禁

1. `pnpm run check:release-security`：Dependabot alerts + Code Scanning 门禁（critical 含 dismissed 一律阻断，high 需台账豁免；token / API 异常 fail-closed）。发布链内已强制；**本地备用通道（`release:publish --otp`）会在发布前自动执行同一门禁**（`--skip-security=<理由>` 显式绕过并留痕），手动执行仍可用于提前核对。
2. `pnpm run gates:docs`：20 项文档与治理门禁，含 `check:contract-freeze`（契约键位比对）与 `docs:check:anchors`。
3. `pnpm run lint:check` + `pnpm run lint:css:check` + `pnpm typecheck` + `pnpm test` + `pnpm run build`。
4. `pnpm verify:changelog --fresh`：七份日志均含当前版本段，且未发布段的条目集合与当前 git 历史一致。
5. `pnpm release:preflight`：真实 tarball 三路安装，断言 `dependfix --version` 等于新版本；**必须在 `build` 之后执行**（`pnpm pack` 打包当前 `dist`）。
6. **豁免读数复核**：G3 保持 `pending`（无 G3.0–G3.9 实跑证据，G3.8 仅 `partial`）；G4 按「最近 10 次 master push 的 Test 0 失败」判据取值——**2026-11-02 冻结读数 9/10（未达成）**，唯一红为测试隔离缺陷（`scripts/release/preflight.test.mjs` 工作区留痕断言），0.6.0 以来 30/38（不含 0.6.0 发布自身 1 次；含则 31/39）。两者的实际读数写入发布说明「已知限制」，**不得**改写成 20 连绿 / 2 周无红。
7. **G8 读数**：`GITHUB_TOKEN=<token> pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30`。**2026-11-02 复算：30 个 PR / CI 绿率 25/30 = 83.3% / 人工介入 0% / 误关 0%**（11-01 为 24/30 = 80%，窗口滚动已变化）。发布说明必须引用**发布当日**复算值与取数命令；缺 token 时脚本直接失败，不得把「没取到数」写成 0% 绿率。
8. **镜像通道限制落发布说明**：发布说明「已知限制」必须含一行镜像通道口径（ACR 个人版 = amd64 备份通道，按 tag 行为依推送路径而变；arm64 用 GHCR / Docker Hub 或 OCI digest）。
9. **非豁免门槛终态核对**：G1 / G5 / G6 / G7 按[就绪度台账 §2](../design/governance/release-1.0-readiness.md)逐项核对终态。其中 **G1 ④ 要求「周回归最近 3 次 `security:audit-deps` 通过」**，当前 **3 次达标**（`40693124400` 10-28 + `41101319146` 10-30 + `42017415845` 11-05 手动触发；末次日志含 `PASS security:audit-deps` 与审计结果行）。G1 其余三项：非豁免 critical / high = 0、code scanning 0、prod 阻断步骤在 `test.yml` 与周回归同一命令——G1 已转 ✅。

## 3. 发布步骤（master，人工触发）

1. **发布计划须手工落盘**：0.7.0 之后若只有 docs / chore 类提交，`pnpm release:plan` 会提示「未发现需要提升版本的变更」且**不生成** `release-plan.md`（2026-11-03 预发布检查实测），`release:version` 因此会直接报缺计划。此时按 §1 手写 `release-plan.md`（frontmatter 逐包给 bump，正文写本轮摘要），例如：

   **已确认的版本方案（用户 2026-11-05）**：六个发布包全部 `major` → `1.0.0`（`dependfix` / `core` / `engine` / `mcp` / `skills` / `platform`；`platform` 走 tag-only + 镜像 `platform-1.0.0`）：

   ```text
   ---
   'dependfix': major
   '@dependfix/core': major
   '@dependfix/engine': major
   '@dependfix/mcp': major
   '@dependfix/skills': major
   '@dependfix/platform': major
   ---
   1.0.0 首个稳定版
   ```
2. `pnpm release:version --dry-run`（预览版本与传导）→ `pnpm release:version`。
3. `pnpm changelog` → 审查七份日志 → 提交（`chore(release): 1.0.0`）→ push master。
4. `pnpm run build` → `pnpm release:preflight`（断言新版本）。
5. **发布通道（用户 2026-11-05 决策）：GitHub Actions → Release → Run workflow（`release.yml` 的 OIDC dispatch）**；本地备用通道仅作应急，需 OTP 且不内置安全门禁、也不会自动派发镜像。
6. 观察 `release:publish` → `release:push-tags` → `release:github` 全绿；`release.yml` 末尾会以 `--ref v1.0.0` 派发 `docker.yml` 并带 `platform_version=1.0.0`，应产出 `platform-1.0.0`（参照 0.7.0 的手动派发 `41439905381`：四标签 + 双架构，build 22m03s）。**若改用本地通道，必须手动补一次同样的派发**，否则没有 `platform-1.0.0`。
7. 创建 `v1` 滚动标签（Action 引用写作 `@v1`）指向 `1.0.0` 的发布提交，并在文档中核验 `uses: dependfix/dependfix@v1` 可用。**已完成（2026-11-07，annotated `097723a7` → `83c966fd`），用户可见示例已切到 `@v1`**。移动已有标签属破坏性操作，只在确认无其它消费者时执行。

## 4. 发布后复核

- 三路安装：`npx --yes dependfix@1.0.0 --version`、全局安装、tarball 安装均等于 `1.0.0`。
- GitHub Release 为 Latest 且非 prerelease（1.0.0 属正式版；仅 alpha / beta / rc 标 prerelease）。
- 远端镜像（**以阿里云 ACR 为 amd64 备份通道（健康复核可用）；双架构主通道是 GHCR / Docker Hub**，用户 2026-11-05 决策）：`registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-<版本>` 匿名可拉 → `docker run --rm` 后 `/api/health` 的 `version` / `commit` 必须与发布提交一致（0.7.0 实测：`0.5.0` / `a049a561`）。**ACR 个人版的按 tag 行为依推送路径而变**：0.5.0（buildx 多平台直推）在 amd64 主机按 tag 只解析出单一 amd64；1.0.0 起（digest 合成）registry API 回读为双平台 index，但 arm64 主机实际拉取未实测——双架构证明须用 GHCR（需 `read:packages`）/ Docker Hub 或按 OCI digest 拉取；缺权限时记 blocked + retry_condition，不得记为通过。
- 发布物审计：`pnpm audit --prod --registry=https://registry.npmjs.org` + Code Scanning 开放告警 0；非 §5.7 豁免的 critical / high 必须为 0。
- G8 复算：发布当日重跑 `GITHUB_TOKEN=<token> pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30`，发布说明引用当日读数（窗口滚动，历史值不得当作当日值）。
- 台账回填：G1 / G2 / G5 / G6 / G7 / G8 终态；G3 / G4 保持豁免记录与 retry_condition（[就绪度台账](../design/governance/release-1.0-readiness.md)）。

## 5. 回滚

> **回滚面清单（固定口径）**：npm / git tag / GitHub Release / `@v1` 滚动标签 / Docker 镜像 / 数据库。逐面状态见 §5.1，**不以面数替代逐面结论**。

| 面 | 动作 | 说明 |
|:--|:--|:--|
| npm | `npm deprecate dependfix@<版本> "<说明>"` → 发修复版 | **不** `npm unpublish`（24 小时限制且破坏已有安装） |
| git tag | `git push origin :refs/tags/<tag>` → 按修复提交重打并推送 | 生产 tag 不作为演练对象（仅本地一次性 tag） |
| GitHub Release | `gh release delete <tag>` → 按修复后的提交重建（notes 重新生成） | 生产 Release 不作为演练对象 |
| `@v1` 滚动标签 | `git tag -f v1 <上一稳定发布提交> && git push -f origin v1`（移动标签属破坏性） | 已创建并指向 1.0.0 发布提交；移动 / 回退属破坏性操作，随 1.0.1 演练 |
| Docker | `docker buildx imagetools create` 把 `latest` / `platform-<版本>` 重指旧 digest → 重跑 docker workflow | 需镜像写权限 |
| 数据库 | 按[部署指南](deployment.md)的备份恢复路径 | 迁移前滚后回退依赖发布前备份 |

### 5.1 演练记录（M54.5，2026-11-02）

> 演练对象为 `0.6.0` / `0.7.0` 的**已有产物**；破坏性步骤（删 tag / 删 Release / `unpublish`）只演练命令与判据，**不在生产执行**。日志见 `artifacts/m54.5/`（gitignored）。

| 面 | 演练命令（实际执行） | 预期 | 实测结果 |
|:--|:--|:--|:--|
| npm | `npm deprecate dependfix@0.6.0 "<说明>" --dry-run` | 只打印计划、不改 registry | `npm notice deprecating dependfix@0.6.0 with message ...`；随后 `npm view dependfix@0.6.0 deprecated` 为空 → **无副作用，通过**（drill）：真实执行后该字段返回说明文案，并在下一个修复版发布说明中指引升级 |
| git tag | `git tag -a drill-rollback-20261102-1 -m ... HEAD` → `git cat-file -t` → `git tag -d` | 本地一次性 tag 可创建、是 tag 对象、删除后无残留；生产 tag 不受影响 | `tag` 类型确认；删除后 `git tag -l 'drill-rollback-*'` 计数 0；六个 0.7.0 tag 仍指向 `a049a561` → **通过（drill）**（远端删除 `git push origin :refs/tags/<tag>` 未执行） |
| GitHub Release | `gh release view v0.7.0`（只读核对）；`gh release delete` **未执行** | 能判定当前 Release 归属与 Latest 状态；删除后可按修复提交重建 | `v0.7.0` 为 Latest、非 prerelease、tag 指向发布提交 → **判据可用**；删除与重建**未演练**（破坏性，保留残余） |
| `@v1` | **已创建（2026-11-07，`097723a7` → `83c966fd`）**；回退命令未演练 | `git tag -f v1 <commit>` 后 `--force` 推送 | 回退属破坏性操作，随 1.0.1 演练 |
| Docker | `docker run --rm registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-0.5.0` + `/api/health` | 版本戳与发布提交一致 | **health 通过**（2026-11-05 ACR 匿名拉取 + 冒烟：`0.5.0` / `a049a561`，15 张表）；**双架构未验证**——ACR tag 在 0.5.0 推送路径下按 tag 解析为单一 amd64 manifest（1.0.0 起回读双平台 index，arm64 主机未实测，见[§4.7](../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5)）、GHCR 缺 `read:packages`，故 Docker 面仍留残余 |
| 数据库 | 本轮无迁移，不触发；路径引用 [deployment.md](deployment.md) 备份恢复 | 迁移前滚后可回退 | 备份 / 恢复路径已在 M53.2 实测（备份 323,584 字节 → `db:restore` → 三方逐表 0 差异、`integrity_check: ok`）→ **通过（引用既有实测）** |

- **逐面状态**：npm / git tag / 数据库 = drill 实测通过；GitHub Release = 仅判据核对（删除 / 重建未执行）；Docker = 标签 / 构建已实测，health 已于 2026-11-05 经 ACR 通过；双架构已回读验证（三 registry × 4 tag = 12/12 `linux/amd64 + linux/arm64`）；**ACR 个人版按 tag 行为依推送路径而变**（0.5.0 单 amd64；1.0.0 起回读双平台 index，arm64 主机未实测）；1.0.0 镜像 `/api/health` 版本戳未复核；`@v1` = 已创建（`097723a7` → `83c966fd`），回退命令未演练。**不得**把本表读成「全部面已演练」。
- **Docker 面 retry_condition**：0.7.0 面（`platform-0.5.0`）剩余 = 双架构 / 客户端 manifest 证明（需 `read:packages` 或 Docker Hub 可达）。**1.0.0 面已推进**：`imagetools inspect` 回读三 registry × 4 tag = **12/12 双架构**（run `42376735406`）；剩余 = **1.0.0 镜像 `/api/health` 版本戳复核**与 **ACR 在 arm64 主机的按 tag 拉取未实测**（口径见[§4.7](../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5)）。
- **残余**：Release 删除 / 重建与远端 tag 删除属破坏性，仅按命令与判据演练；npm 真实 `deprecate` 未对任何已发布版本执行（`0.6.0` 是否弃用属用户决策，见[发布指南](release.md)「0.7.0 发布记录」）。

## 6. 产物校验和

- `npm view dependfix@1.0.0 dist.integrity` 与 `dist.tarball`（**本轮实际发布的每个包**逐个记录；未变更未发布的包不记录）——**最低要求**，手动发布通道也应至少采集这一项。
- 已发布包 tarball 的 `sha256sum` 与镜像 `RepoDigests`（`docker buildx imagetools inspect`）：**有 tarball 归档 / 镜像可复核时**补采，随发布说明归档。
- 校验和清单随 GitHub Release notes 归档，不写进 CHANGELOG。

## 7. 发布说明骨架（GitHub Release `v1.0.0`）

```markdown
## 1.0.0

首个稳定版：semver 承诺生效（1.x 只增不改不删，破坏性变更留到 2.0.0）。

### 入口
- CLI（report-only / fix / fix-and-pr）、GitHub Action、MCP Server、Agent Skill、管理平台

### 契约与迁移
- 契约冻结面与 0.x→1.0 迁移步骤：docs/guide/contract-freeze.md（5 条行为变更，完整清单以该页 §8 为准：`--version` 缺陷 / 引擎导出异步化 / `--allow-major-upgrade` 无 env 通道 / `on-baseline-red` 默认 skip / `signalsJson` 收敛语义）
- 另需披露：`alertOutcome` 回写后「已修复」告警退出未修复明细（docs/design/governance/alert-outcome-writeback.md）、critical 邮件对存量组织新增（docs/design/governance/platform-notification.md）

### 指标（G8）
- 近 30 个 dependfix PR：CI 绿率 25/30 = 83.3%、人工介入 0%、误关 0%（**2026-11-02 示例值，发布时必须替换为当日复算**）
- 取数命令与口径：`pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30`（口径见 docs/design/governance/release-1.0-readiness.md §2.1）

### 已知限制
- 真实环境矩阵（G3）未实跑：缺 OAuth / IdP / staging / 测试仓 / AI Key 资源，矩阵保持 pending；资源到位后补测
- Google OAuth 登录未验证（无可用 Google 账号）
- CI 稳定性（G4）未达 20 连绿 / 2 周无红；降级判据「最近 10 次 master push 的 Test 0 失败」也**未达成**——实测 9/10（唯一红为测试隔离缺陷，0.6.0 以来 30/38），按豁免披露实际读数（retry_condition：最近 10 次 master push 的 Test 全部成功即关闭本豁免）
- 设计文档全量英译不在 1.0（指南平价已完成）
- 镜像通道：阿里云 ACR 个人版定位为 amd64 备份通道（按 tag 行为依推送路径而变：0.5.0 为单 amd64，1.0.0 起 registry 回读为双平台 index，但 arm64 主机实际拉取未实测）；arm64 请用 GHCR（需 `read:packages`）或 Docker Hub，或按 OCI digest 拉取——按 tag 拉取不代表 arm64 可运行

### 已知非目标
- 1.0 后项（运行面漏洞检测 / 独立 installer 容器 / 仓库级 allowMajorUpgrade / PostgreSQL+Helm 等）见就绪度台账 §3.3
```

> **骨架约束**：指标 / 已知限制 / 契约与迁移 / 已知非目标四段任一空缺不得发布；G3 / G4 只能写成「已知限制 + retry_condition」，**不得**写成已验证。
