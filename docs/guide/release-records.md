# 发布记录

> 各版本发布执行记录（发布包 / tag / 发布后复核 / 镜像 / 校验和）。发布流程、门禁与回滚口径见 [发布指南](release.md)；1.0 门槛台账见 [就绪度台账](../design/governance/release-1.0-readiness.md)。
>
> 迁出说明（2026-11-15）：本页前两节（0.7.0 / 1.0.0）自 `release.md` 的「后续版本」段按连续尾部章节迁出，避免主指南越过行数健康窗口；正文保序，锚点标题不变。

## 各版本记录

### 0.7.0 发布记录（M54.2，2026-11-02 已执行）

> 目的：补发 `--version` 元数据修复并演练 M53 修正后的发布链；锚版本 `0.7.0` 由 `release:plan` 推导（不人工降级为 patch）。**执行方式 = 本地手动发布**（用户 2026-11-02 执行）：发布 4 个 npm 包 + 六个 tag + GitHub Release；镜像另经 `docker.yml` 派发（`--ref v0.7.0`，`platform_version=0.5.0`，运行 `41439905381` success）补齐 `platform-0.5.0`，GHCR / Docker Hub 客户端复核仍 blocked；ACR health 已通过（见 [发布指南 Docker 镜像复核](release.md#docker-镜像复核-0-6-0-0-7-0)）。1.0.0 的差异清单与发布说明骨架见 [1.0.0 发布清单与发布说明骨架](release-1.0.md)。

**发布前门禁（2026-11-01 实测）**

1. `pnpm run check:release-security` PASS：Code Scanning 开放 **0 条**（M53.4 命中的 high `js/incomplete-multi-character-sanitization` = alert 30 已 `fixed`）；Dependabot 开放 2 条 moderate / low（不阻断）。
2. `pnpm verify:changelog` / `pnpm run gates:docs`（20 项）/ `pnpm run lint:check`（0 error）/ `pnpm typecheck`（7 项目）/ 全量 `pnpm test`（5713 passed）全绿。
3. `pnpm release:preflight --out-dir=artifacts/m54.2/preflight` PASS（2026-11-02 复跑留证）：临时工程安装后 `dependfix --version = 0.7.0`（= cli 包版本，元数据修复在打包产物上成立）；`preflight.json` 中 `version` 为 `0.7.0`。

**发布的版本与 tag（2026-11-02）**

| 通道 | 版本 | tag / 产物 |
|:--|:--|:--|
| `dependfix`（CLI，锚版本） | `0.7.0` | `dependfix@0.7.0` + `v0.7.0` |
| `@dependfix/core` | `0.7.0` | `@dependfix/core@0.7.0` |
| `@dependfix/engine` | `0.6.0` | `@dependfix/engine@0.6.0` |
| `@dependfix/mcp` | `0.3.1`（传导） | `@dependfix/mcp@0.3.1` |
| `@dependfix/platform` | `0.5.0`（tag-only） | `@dependfix/platform@0.5.0`；镜像 `platform-0.5.0` 已由 dispatch `41439905381` 发布（含 `latest` / 日期 / `sha-a049a56`）；health 已由 ACR 验证，双架构未验证 |
| `@dependfix/skills` | 无改动不发布 | — |

六个 tag 均指向发布提交 `a049a561`（`chore(release): 0.7.0`）；GitHub Release `v0.7.0` 为 Latest、非 prerelease（`gh release view` `createdAt` = `2026-11-02T10:33:46Z`）。

**发布后复核（2026-11-02 实测）**

- `npx --yes dependfix@0.7.0 --version` → `0.7.0`，**关闭** 0.6.0 的 `--version` 报 `0.1.0` 缺陷候选（tarball / 全局两路由见 [发布指南](release.md) 的 release:preflight 段与 2026-11-01 预演记录）。
- 发布物审计：`pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=https://registry.npmjs.org` → exit 0（1 low + 1 被忽略的 moderate = `minimatch`，见[安全规范 §5.7](../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05)）；Dependabot 开放 2 条（`minimatch` medium #126 / `deepmerge` low #125）；Code Scanning 开放 **0** 条 → **非豁免 critical / high = 0**。
- 远端镜像：**`platform-0.5.0` 已发布**（dispatch `41439905381`，`--ref v0.7.0` + `platform_version=0.5.0`；四标签、双架构 manifest `sha256:71f6633…a244f1`、build 22m03s）；本环境无法直连 GHCR / Docker Hub（401 / 超时）；`/api/health` 已经 ACR 冒烟验证，**双架构与客户端 manifest 校验未通过**（ACR tag 单架构，见 [发布指南 Docker 镜像复核](release.md#docker-镜像复核-0-6-0-0-7-0)），不记为通过。
- `dependfix@0.6.0` 是否 `npm deprecate`：**未执行**（属用户决策项）。0.7.0 的 Release 正文只含「本轮发布包 + 根 CHANGELOG」，**未包含** 0.6.0 `--version` 缺陷说明与升级指引，也不含指标段。

**产物校验和（`npm view <pkg> dist.integrity`，2026-11-02）**

```text
dependfix@0.7.0          sha512-1yaQaIJ0jr1EeOLS5pXfCN+pHEoYFaWahlQwtIkW87dZOwcD6Yxi4pJnrWrhIFQmroW+SbA/UtelKNCiTHx3OQ==
@dependfix/core@0.7.0    sha512-kDOTkqiz3aae9f/SNyQS6L3Iv1kwpTpA/ZDrnv/Z9U+1DoGarSSPVvZYMREhrhzDLDwKo36cFWG28+wPH9U5jQ==
@dependfix/engine@0.6.0  sha512-stlo8Kg4BheQVTSC54KtKfX4Rgm8TUlPwSbRDmW1hwTKFPCNHPHmG6A2s0yrL/YrkaSwL1LHVHrG+C3lgUH2Gw==
@dependfix/mcp@0.3.1     sha512-9ONe8HKXgFBIUPMoxWTHrlUqH6yUPXq86Uo6Mi8xVmsWfbXVGWBaHCKo4Aq2xeLgv3WBuQAgMiDZyJJAEBRCZA==
```

本轮只采集 `dist.integrity`；tarball `sha256sum` 与 `@dependfix/skills` 预演 tarball **未采集**（手动发布通道未留 tarball 归档），客户端 `RepoDigests` 未取得（manifest list digest 见运行日志 `sha256:71f6633…a244f1`）。三者随 1.0.0 发布一并归档。

**回滚**

- npm：`npm deprecate dependfix@<bad> "<说明>"` 后发修复版；**不要** `npm unpublish`（24 小时限制且破坏已有安装）。
- git tag / Release：删除错 tag（`git push origin :refs/tags/<tag>`）后按修复提交重打；Release 用 `gh release delete` 重建。
- Docker：用 `docker buildx imagetools create` 把 `latest` / `platform-x.y.z` 重指旧 digest，再重跑 docker workflow。
- 数据库：本轮无迁移，不需要备份恢复。

回滚面（npm / git tag / GitHub Release / `@v1` / Docker / 数据库）的逐面演练记录见 [1.0.0 发布清单 §5.1](release-1.0.md#_5-1-演练记录-m54-5-2026-11-02)（M54.5）。

### 1.0.0 发布记录（M54.6，2026-11-07 已执行）

> 目的：发布首个稳定版（semver 承诺生效）。**执行方式 = `release.yml` 的 OIDC dispatch**（用户 2026-11-05 决策），不使用本地手动通道；差异面与发布说明骨架见 [1.0.0 发布清单](release-1.0.md)。

**发布链两次失败与修复（过程记录）**

| run | 失败点 | 归因 | 处置 |
|:--|:--|:--|:--|
| `42332948238` | `Pre-check release security alerts` | 仓库 secret `GH_PAT` 无法读取 Dependabot alerts（HTTP 403 `Resource not accessible by personal access token`，fine-grained 缺 `Dependabot alerts: read`） | 用户重配 `GH_PAT` 后门禁通过 |
| `42350661632` | `Run pnpm run test` | 版本提升后 `scripts/create-release-plan.test.mjs` 的「仓库当前为 0.x」断言失效（用例绑定仓库状态） | `f90c11b7`：`isPreMajor(version?)` 支持显式入参，用例按真实版本推导期望值并显式覆盖 0.x / 1.x |

发布提交链：`86108b60`（`chore(release): 1.0.0`，六包版本 + 七份日志）→ `f90c11b7`（用例修复）→ `83c966fd`（1.0.0 日志补首个稳定版 / 契约与迁移 / G8 / 已知限制，同时满足 `release:publish` 的 HEAD 锚点）。发布 run：`42351775424`（success）。

**版本与 tag（2026-11-07）**

| 通道 | 版本 | tag / 产物 |
|:--|:--|:--|
| `dependfix`（锚版本）+ `@dependfix/core` / `engine` / `skills` / `mcp` | `1.0.0` | 各自的 `<pkg>@1.0.0`；`dependfix@1.0.0` 另打 `v1.0.0` |
| `@dependfix/platform`（tag-only，不发 npm） | `1.0.0` | `@dependfix/platform@1.0.0` + 镜像 `platform-1.0.0` |

六个包 tag + `v1.0.0` 均指向 `83c966fd`；`v1` 滚动标签（annotated `097723a7`）同样解引用到 `83c966fd`，`uses: dependfix/dependfix@v1` 自此可用。GitHub Release `v1.0.0` 为 Latest、非 prerelease（`publishedAt` = `2026-11-07T07:38:22Z`），正文含发布包矩阵 + 根 CHANGELOG 1.0.0 段（首个稳定版 / 入口 / 契约与迁移 / G8 当日复算 / 已知限制 / 已知非目标）。

**发布后复核（2026-11-07）**

- 三路安装：`npx --yes --registry=https://registry.npmjs.org dependfix@1.0.0 --version` → `1.0.0`；全局安装（隔离 prefix）→ `1.0.0`；tarball 路由由 `release:preflight` 覆盖（发布前 `PASS`，`--version = 1.0.0`）。
- 发布物审计：`pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org` → 2 条（1 low + 1 条 §5.7 豁免 moderate = `minimatch`）；`pnpm run check:release-security` → **PASS**（critical 0 / high 0 / moderate 1 / low 1）。口径：该命令审计工作区生产依赖图，不是逐包 tarball 审计；镜像面归 G7 复核。
- 本机 `npm` 默认 registry 为 `registry.npmmirror.com`，发布后短时间内尚未同步 1.0.0（`npm view` 404）；官方 registry 已是最新，复核须显式 `--registry=https://registry.npmjs.org`。

**产物校验和（官方 registry `dist.integrity`，2026-11-07）**

```text
dependfix@1.0.0          sha512-F3KrS2AQjio1kG49zlchTudnr+j8yEq09rcbCfUL804TSt6cUJMUywIWzsYG6x/GP7pyofQWeh90GoHXwYg1GQ==
@dependfix/core@1.0.0    sha512-OBTEZe6MBdoKk54XkhUB2mcLS26sMyii7AMz8iC4Dy7ct+aldiaT/1PhO7TjGpmyqtVHpd/gvmnfAqb6q31z9g==
@dependfix/engine@1.0.0  sha512-Kz9LF1NPzT7lM5OCZtCfFRFL7jEGcu84sk5PZAlkom4ns1TduyhI5oem+LAv/KpG93IYm7PI9ViZz65YiniG9Q==
@dependfix/skills@1.0.0  sha512-dfntb5ntotpnfnR8GBgKDHLhJfgI3nq8g2PERuEFUYLnvZHnIp17FPPOJb6YIbKvMaJf1tPw2yJghVMa6AUwbw==
@dependfix/mcp@1.0.0     sha512-jxwzrIKjuD+kuMn3zWrvreCuNUEWPrcrecsEQU5RHKEM1Lh6Rxp/yzr+dQ69axy3SRUqhvigeDNcMRvmmWiOtA==
```

**归档范围说明**：0.7.0 段承诺「tarball `sha256sum` / `@dependfix/skills` 预演 tarball / 客户端 `RepoDigests` 随 1.0.0 一并归档」，本轮改为以官方 registry 的 5 条 `dist.integrity` 作发布物指纹；tarball `sha256sum` 与 `RepoDigests` 未采集（本地发布通道不产 tarball 归档，镜像客户端 manifest 受 GHCR / ACR 权限限制）。

**镜像（`platform-1.0.0`，2026-11-07 发布）**

- **原 QEMU 方案失败**：`docker.yml` 原在单 job 内用 QEMU 跨架构构建，`42351771958`（push 自动触发）与 `42352117141`（release 派发）同时卡在 Nuxt `Bundling client` 近 4 小时，双双触 240 分钟上限被取消，**未产出任何镜像 tag**。
- **方案改为原生多架构**（参照 caomei-auth，`c13f1714`）：amd64 用 `ubuntu-latest`、arm64 用 `ubuntu-24.04-arm` 原生构建，各自 `push-by-digest`，再由 `merge` job 用 `buildx imagetools create` 合成三个 registry 的 manifest。
- **发布 run 链（镜像流水线三次迭代）**：`42371180834`（三仓库 manifest 均产出，merge 的 README 同步因缺 `actions/checkout` 红）→ `42372575641`（补 checkout 后全绿）→ `42373335914`（新增双架构回读门禁 `f7917cab`，全绿）→ `42375268994`（无 `platform_version` 的验证派发暴露 `imagetools create` 不支持 `--annotation`）→ `42376062304`（改为构建阶段写 OCI 标签后，无版本派发全绿：3 tag × 3 仓库 9/9 双架构、无 `platform-` 标签）→ `42376735406`（全绿，但 OCI `version` 仍取 ref 名 `master`）→ **`42381362295`（最终发布 run，全绿，`version=1.0.0`）**。
- **双架构证据**：`42381362295` 中三个 registry × 4 个 tag（`latest` / `2026-11-07` / `platform-1.0.0` / `sha-5c81058`）经 `imagetools inspect --raw` 回读，**12/12 均为 `linux/amd64 + linux/arm64`**；镜像配置 `org.opencontainers.image.version = 1.0.0`（构建日志实测）。
- 镜像 `BUILD_COMMIT = 5c810587…`（派发时 master HEAD，平台代码即 1.0.0）、`BUILD_VERSION = 1.0.0`；耗时（`42381362295`）：QA 4m09s / arm64 5m09s / amd64 3m38s / merge 1m45s；同流程其他轮次为 `42373335914` 3m30s / 1m10s / 2m21s / 1m50s，`42376735406` amd64 **41m32s**（未命中缓存）——**单架构耗时波动约 1m-42m**，故 `timeout-minutes` 取 90 分钟。
- **已知限制**：ACR 个人版按 tag 行为依推送路径而变（0.5.0 为单一 amd64；1.0.0 起 index 回读为双平台，客户端在 amd64 主机按 tag 只取 amd64，arm64 主机未实测）；provenance 三仓库统一关闭（ACR 拒绝 OCI attestation，`imagetools create` 无法跨 registry 传递），1.0.0 起 GHCR 镜像不带 provenance 证明。

### 1.1.0 发布记录（2026-11-15 已执行）

> 目的：发布 1.0.0 之后的第一个 minor（沙箱执行器可用性、平台页面减法、执行可靠性收口）。**执行方式 = `release.yml` 的 OIDC dispatch**（用户 2026-11-15 授权）。

**版本与 tag（2026-11-15）**

| 通道 | 版本 | tag / 产物 |
|:--|:--|:--|
| `dependfix`（锚版本）+ `@dependfix/core` / `engine` / `mcp` | `1.1.0` | 各自的 `<pkg>@1.1.0`；`dependfix@1.1.0` 另打 `v1.1.0` |
| `@dependfix/platform`（tag-only，不发 npm） | `1.1.0` | `@dependfix/platform@1.1.0` + 镜像 `platform-1.1.0` |
| `@dependfix/skills` | 保持 `1.0.0` | 本轮无代码变更，不进入发布链路 |

五个包 tag + `v1.1.0` 均指向发布提交 `80883880`；GitHub Release `v1.1.0` 为 Latest、非 prerelease（`createdAt` = `2026-11-15T08:47:48Z`），正文含发布包矩阵 + 根 CHANGELOG 1.1.0 段。

**发布链**

- 版本推导：`release:plan` 从 `v1.0.0` 基线推导 5 包 minor（`v1.0.0..HEAD` 内 feat 53 / fix 35，无 breaking）。
- 本地流程：`release:version` → `pnpm changelog` → 提交 `chore(release): 1.1.0` → `release:preflight`（`--version = 1.1.0`）→ 门禁全绿（lint / css lint / gates:docs / typecheck / test / build）→ 推送 → `gh workflow run release.yml`。
- 发布 run `43695710933`（workflow_dispatch）success，run 本身约 6 分钟（`08:41:52Z` → `08:47:58Z`；含全量 test 与平台构建）。

**发布后复核（2026-11-15）**

- npm（**官方 registry**）：`dependfix` / `@dependfix/core` / `@dependfix/engine` / `@dependfix/mcp` = `1.1.0`；`@dependfix/skills` 保持 `1.0.0`。本机默认 registry 为镜像站，复核须显式 `--registry=https://registry.npmjs.org`（skills `1.0.0` 在镜像站仍未同步，与 1.0.0 发布记录同现象）。
- 镜像：dispatch run `43696172095` 全绿（QA / amd64 / arm64 / manifest / smoke），push run `43695701428` 同步产出 `latest` / 日期 / `sha-*`。
- 安全：发布前门禁 PASS（critical 0 / high 0 / moderate 1 / low 1）。

**`post-release-smoke` 首次真实运行（回填 M58.4 未证实项）**

- run `43696172095` 的 `Post-release smoke (amd64)` / `(arm64)` 均 **success**（原生 runner，非 QEMU）。
- `/api/health` = `{"version":"1.1.0","commit":"80883880c7016b093c4721cc5a8b2d51eef102a0","schema":"ok"}`（两架构一致）；业务表 15；迁移专用模式通过。
- `Login to GitHub Container Registry` success → 私有 GHCR `packages: read` 可用；`Scan historical image tags` 在 **amd64 腿** success（工作流条件 `matrix.arch == 'amd64'`，arm64 腿不执行该步；全量历史 checkout）；summary 正文 API 不可读，输出形态已在本地 401 场景实证。
- **仍未证实**：冒烟失败分支（Job Summary / `::warning::` 可见性）本轮无失败样本。

**回滚**：逐面命令与判据见 [1.0.0 发布清单 §5.1](release-1.0.md#_5-1-演练记录-m54-5-2026-11-02)（npm `deprecate` / tag / Release / 镜像 tag 回退）；本轮**未执行**任何回滚演练。

**`@v1` 标签状态（2026-11-15 冻结）**

`v1` 于 2026-11-15 由 `83c966fd`（1.0.0）**补移到 `80883880`（1.1.0）后冻结**（annotated tag 重建为 `a13fe3ac`，force push 推送）。此后 `v1` 不再随发布移动：用户示例改用具体版本 `@v1.1.0`，版本更新由目标仓库的 Dependabot / Renovate bump 引用（决策与理由见 [发布指南 Action 引用策略](release.md#action-引用策略)）。

**产物校验和（官方 registry `dist.integrity`，2026-11-15）**

```text
dependfix@1.1.0          sha512-u1qUwgP3ozU0eqoSK0ZqqElKkCg6yGAEcs+09jzLzhvZuV/N42I02x/E9ZRppTQgKeT3M2CjANrNaIKS7zscLg==
@dependfix/core@1.1.0    sha512-aH9+Hii6Kmay42Jtiw4sQ8xkXA9zBL3PiAfC5QqYQ6CWFCSY2pGE02taNXO8HuevdxCCg9zsDArt/rFGriDTlA==
@dependfix/engine@1.1.0  sha512-3IFpwnWJnLXvbgXwFnYLuq5xbgmw0zbVpPhnQehtBSgdwaCrQKIJ8f0qT1azGHRk22rke6OWvYO1ajMlCqkFWw==
@dependfix/mcp@1.1.0     sha512-oPxBx/TnjW703V5c9RreoACgR84uM2xStXzSWn5/SheK4hghF5TDAI2G+37HdOHXuYYnloxKIxbyvGOeHhkepg==
```
