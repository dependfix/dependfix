# 1.0.0 发布清单与发布说明骨架

> **状态**：骨架（2026-11-01 M54.1 建立），**未执行任何发布动作**（无 `npm publish` / 无新 tag / 未改版本号）；执行归 [todo.md](../plan/todo.md) 的 M54.6。
> **口径**：**有条件发布**——G3 实跑 / G4 窗口按已披露豁免降级（见[就绪度台账 §2](../design/governance/release-1.0-readiness.md)），G5 / G6 / G7 可执行项补齐，G8 引用真实读数。**豁免不等于通过**：发布说明必须照实披露，不得写成 G3 / G4 已验收。
> **决策来源**：[就绪度台账 §2.2](../design/governance/release-1.0-readiness.md) + 用户 2026-11-01 四项决策（先 `0.6.1` 再 `1.0.0` / 有条件发布 / 接受 Google OAuth 未测 / 目标窗口 2026-11-15）。
> **通用机制**：`release:plan` → `release:version` → `changelog` → CI 发布链见[发布指南](release.md)；本页只列 1.0.0 的差异面与发布说明骨架。

## 1. 版本与锚点

| 项 | 1.0.0 要求 |
|:--|:--|
| 锚版本 | `v1.0.0`（GitHub Release tag + Docker 派发 `--ref v1.0.0`） |
| `dependfix`（CLI） | **必须人工改到 `1.0.0`**：`release:plan` 对 0.x 的 BREAKING 只推导 minor（见发布指南「release:plan 生成规则」），不手动修正 `release-plan.md` 就得不到 1.0.0 |
| 其余 npm 包 | 按 `release:plan` 推导 + 人工 review（依赖传导闭包自动更新版本范围）；review 时逐个确认 major / minor 语义与[契约冻结清单](contract-freeze.md)一致 |
| `@dependfix/platform` | 版本独立递增（tag-only 通道），镜像 tag 为 `platform-<平台版本>` |
| CHANGELOG | **七份**：根级 + 5 个 npm 包 + `apps/platform`（`pnpm verify:changelog` 按 6 个发布包 + 根级校验）；由 `pnpm changelog` 生成并提交 |
| `v1` 滚动标签 | 发布后创建 `v1`（Action 引用写作 `@v1`）并指向 `1.0.0` 的发布提交；此前 Action 引用保持具体版本 |

## 2. 发布前门禁

1. `pnpm run check:release-security`：Dependabot alerts + Code Scanning 门禁（critical 含 dismissed 一律阻断，high 需台账豁免；token / API 异常 fail-closed）。发布链内已强制；**本地备用通道（`release:publish --otp`）不内置该门禁**，走本地通道前必须手动执行本命令。
2. `pnpm run gates:docs`：20 项文档与治理门禁，含 `check:contract-freeze`（契约键位比对）与 `docs:check:anchors`。
3. `pnpm run lint:check` + `pnpm run lint:css:check` + `pnpm typecheck` + `pnpm test` + `pnpm run build`。
4. `pnpm verify:changelog`：七份日志均含当前版本段。
5. `pnpm release:preflight`：真实 tarball 三路安装，断言 `dependfix --version` 等于新版本；**必须在 `build` 之后执行**（`pnpm pack` 打包当前 `dist`）。
6. **豁免读数复核**：G3 保持 `pending`（无 G3.0–G3.9 实跑证据，G3.8 仅 `partial`）；G4 按「最近 10 次 master push 的 Test 0 失败」判据取值。两者的实际读数写入发布说明「已知限制」，**不得**改写成 20 连绿 / 2 周无红。
7. **G8 读数**：`GITHUB_TOKEN=<token> pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30`。2026-11-01 读数：30 个 PR / CI 绿率 24/30 = 80% / 人工介入 0% / 误关 0%。发布说明必须引用该读数与取数命令；缺 token 时脚本直接失败，不得把「没取到数」写成 0% 绿率。
8. **非豁免门槛终态核对**：G1 / G5 / G6 / G7 按[就绪度台账 §2](../design/governance/release-1.0-readiness.md)逐项核对终态。其中 **G1 ④ 要求「周回归最近 3 次 `security:audit-deps` 通过」**，当前累计 **1 次**（run `40693124400`）；窗口内凑满 3 次前不得声称 G1 达标，提前发布需用户显式裁决并记入豁免。

## 3. 发布步骤（master，人工触发）

1. `pnpm release:plan` → review `release-plan.md`（按 §1 把 `dependfix` 改为 `1.0.0`，确认 breaking 标注完整）。
2. `pnpm release:version --dry-run`（预览版本与传导）→ `pnpm release:version`。
3. `pnpm changelog` → 审查七份日志 → 提交（`chore(release): 1.0.0`）→ push master。
4. `pnpm run build` → `pnpm release:preflight`（断言新版本）。
5. GitHub Actions → Release → Run workflow（OIDC 为默认通道；本地备用通道需 OTP，且两侧都要求工作区干净）。
6. 观察 `release:publish` → `release:push-tags` → `release:github` 全绿；docker 派发运行应带 `platform-<版本>` tag。build job 预算 240 分钟，`0.6.1` 发布的实测时长用于确认余量（见发布指南「Docker 镜像复核」）。
7. 创建 `v1` 滚动标签（Action 引用写作 `@v1`）指向 `1.0.0` 的发布提交，并在文档中核验 `uses: dependfix/dependfix@v1` 可用。移动已有标签属破坏性操作，只在确认无其它消费者时执行。

## 4. 发布后复核

- 三路安装：`npx --yes dependfix@1.0.0 --version`、全局安装、tarball 安装均等于 `1.0.0`。
- GitHub Release 为 Latest 且非 prerelease（1.0.0 属正式版；仅 alpha / beta / rc 标 prerelease）。
- 远端镜像：`docker buildx imagetools inspect ghcr.io/dependfix/dependfix:platform-<版本>` 应含 `linux/amd64` + `linux/arm64`；`docker run` 后 `/api/health` 的 `version` / `commit` 与发布提交一致。缺 `read:packages` 时记 blocked + retry_condition，不得记为通过。
- 发布物审计：`pnpm audit --prod --registry=https://registry.npmjs.org` + Code Scanning 开放告警 0；非 §5.7 豁免的 critical / high 必须为 0。
- 台账回填：G1 / G2 / G5 / G6 / G7 / G8 终态；G3 / G4 保持豁免记录与 retry_condition（[就绪度台账](../design/governance/release-1.0-readiness.md)）。

## 5. 回滚

| 面 | 动作 | 说明 |
|:--|:--|:--|
| npm | `npm deprecate dependfix@1.0.0 "<说明>"` → 发修复版 | **不** `npm unpublish`（24 小时限制且破坏已有安装） |
| git tag / Release | `git push origin :refs/tags/<tag>` → 按修复提交重打 → `gh release delete` 重建 | 生产 Release 不作为演练对象 |
| Docker | `docker buildx imagetools create` 把 `latest` / `platform-<版本>` 重指旧 digest → 重跑 docker workflow | 需镜像写权限 |
| 数据库 | 按[部署指南](deployment.md)的备份恢复路径 | 迁移前滚后回退依赖发布前备份 |

> 破坏性步骤（删 tag / 删 Release / `unpublish`）**只演练命令与判据，不在生产执行**；演练记录归 M54.5。

## 6. 产物校验和

- `npm view dependfix@1.0.0 dist.integrity` 与 `dist.tarball`（五个包逐个记录）。
- 五个 tarball 的 `sha256sum` 与镜像 `RepoDigests`（`docker buildx imagetools inspect`），随发布说明归档。
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
- 近 30 个 dependfix PR：CI 绿率 24/30 = 80%、人工介入 0%、误关 0%
- 取数命令与口径：`pnpm metrics:pr-health --repo=dependfix/dependfix --days=30 --limit=30`（口径见 docs/design/governance/release-1.0-readiness.md §2.1）

### 已知限制
- 真实环境矩阵（G3）未实跑：缺 OAuth / IdP / staging / 测试仓 / AI Key 资源，矩阵保持 pending；资源到位后补测
- Google OAuth 登录未验证（无可用 Google 账号）
- CI 稳定性（G4）未达 20 连绿 / 2 周无红，按「最近 10 次 push」降级判据披露实际读数（retry_condition：最近 10 次 master push 的 Test 全部成功即关闭本豁免）
- 设计文档全量英译不在 1.0（指南平价已完成）

### 已知非目标
- 1.0 后项（运行面漏洞检测 / 独立 installer 容器 / 仓库级 allowMajorUpgrade / PostgreSQL+Helm 等）见就绪度台账 §3.3
```

> **骨架约束**：指标 / 已知限制 / 契约与迁移 / 已知非目标四段任一空缺不得发布；G3 / G4 只能写成「已知限制 + retry_condition」，**不得**写成已验证。
