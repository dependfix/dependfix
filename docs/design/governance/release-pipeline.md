# 发布管线自研化设计（移除 changeset）

> 状态：🔶 设计落盘（2026-08-10）——契约与算法落盘，供实现阶段参考。
> 增补：GitHub Release 自动化设计（§4.4，2026-08-10）——每轮发布创建聚合 GitHub Release。
> 背景：changeset 在发布链路中的作用已退化为"遍历发布 + 打 tag"（changelog 生成、changeset 文件生成、tag 补打、发布顺序均已由自定义脚本替代），剩余版本提升执行与依赖传导为最后两块专属逻辑。
> 相关文档：[发布指南](../../guide/release.md)、[发布工具选型调研](../../research/2026-08-02-release-tools-comparison.md)、[经验归档 §二十五/§二十六](./experience-archive.md)

---

## 1. 定位

用自研 release 脚本体系替换 changeset，覆盖发布链路全环节（npm 发布 + GitHub Release），并按"当前手动阶段 → 未来定时阶段"双模式演进（参照 semantic-release 的 commit 驱动 + CI 全自动思路，但保留 0.x 手动阶段的人工闸门）。

**目标**：

1. 支持本地手动发布（A 模式）
2. 支持 GitHub Actions 发布：CI 发布时仅推送 changelog 与 tag 回仓库，**除此之外不得改动任何文件**
3. 通过 git log 自动生成 changelog（根级 + 分包级）
4. 通过 git log 推导版本提升级别，并打对应 `<pkg>@<version>` tag
5. 解决包发布顺序（依赖方后发），避免依赖问题
6. **npm 发包同时创建聚合 GitHub Release**（每轮一个，notes 使用项目 changelog 格式）

**非目标**：

- 不迁移 semantic-release / release-it / Nx Release（调研结论：semantic-release monorepo 多包独立版本是硬伤，Nx 引入整个工具链过重；自研 = 现有自定义体系补齐最后两块，成本最低）
- 不引入 semver 依赖（版本递增手写纯函数）
- 不为每个包单独创建 GitHub Release（多包轮次只建一个聚合 Release，避免噪音）
- 不启用 provenance（0.x 阶段不强制，`--provenance` 需要 OIDC 环境，本地手动发布不适用；留待后续评估）

---

## 2. 双模式架构

### 2.1 A 模式（当前，0.x 手动发布）

版本提升在**本地**完成（保留人工闸门），CI 发布时**零文件写回**（仅 push tags）：

```
本地：git log → release:plan（生成 release-plan.md）
     → 人工 review / 修正 release-plan.md
     → release:version（消费计划 → 依赖传导 → 写回版本号 → 删除计划文件）
     → pnpm changelog（生成/更新根级 + 包级日志）
     → git commit → push master
CI（workflow_dispatch）：质量门（lint/typecheck/test/build）
     → changelog 校验（七份日志已含当前版本段）
     → release:publish（按序发布 + 创建 tag，OIDC 认证）
     → push tags（显式 URL + 本地/远程集合核验）
```

### 2.2 B 模式（未来，1.0.0+ 定时自动发布）

> **启用前置（2026-11-01 M54 决策）**：1.0.0 发布本身**不启用** B 模式；须用户另行授权，并按 [release.md](../../guide/release.md)「自动发布启用清单」逐项确认后再取消注释。

版本提升在 **CI 内**自动完成（semantic-release 式全自动），**唯一写回动作**为 release commit + tags：

```
CI（schedule）：release:plan → release:version → pnpm changelog
     → git commit（chore(release): x.y.z [skip ci] + release notes body）→ push master
     → 质量门 → changelog 校验 → release:publish → push tags
```

> release.yml 双模式骨架已内嵌（workflow_dispatch 零写回 + schedule 分支注释预留），本次只替换命令、不重构 CI 骨架。

---

## 3. 命令模型

| 现有命令 | 新命令 | 职责 | 执行环境 |
|:---|:---|:---|:---|
| `pnpm changeset:generate` | `pnpm release:plan` | git log 推导 → 生成 `release-plan.md`（review 载体） | 本地（A）/ CI（B） |
| `pnpm changeset version` | `pnpm release:version` | 消费计划 → 依赖传导计算 → 写回版本号 → 删除计划 | 本地（A）/ CI（B） |
| `pnpm changeset publish` | `pnpm release:publish` | 按序发布 + 创建 `<pkg>@<version>` tag | CI（OIDC）/ 本地（npm 凭据） |
| `pnpm changeset` | 删除 | — | — |

### 3.1 计划文件 `release-plan.md`

- 位置：仓库根目录；**进 `.gitignore`**（临时产物：生成 → review → 消费删除，同现状 `.changeset/release.md` 生命周期）
- 格式：沿用现有 frontmatter（`'pkg': bump`）+ summary 正文；**可人工编辑修正**（B 模式 CI 无人工步骤，直接消费）
- `release:version` 消费后删除；解析失败（非法 bump / 未知包名 / 语法错误）明确报错退出
- A 模式人工兜底保留：breaking 判定仅识别显式 `!` / `BREAKING CHANGE:` footer，未标注的破坏性变更在 review 时手动修正计划文件

---

## 4. 核心算法

### 4.1 依赖传导（替代 changeset `updateInternalDependencies: patch`）

**关键简化点**：各包依赖范围均为 `workspace:*`，`pnpm publish` 发布时自动替换为实际版本。因此：

- **只要被依赖方先发布（publishOrder 保证），依赖方发布产物自动指向新版本**
- 替代实现**无需改写依赖范围字段**，只需保证"依赖方跟随 bump 并重发"

传导算法（复刻 updateInternalDependencies: patch 语义）：

```
1. 解析 release-plan.md（pkg → bump）
2. 构建依赖图：读各发布包 package.json 的 dependencies，筛出指向发布包的 workspace:* 边
   （仅 dependencies 传导；devDependencies 不传导）
3. 传导闭包：
   while 有版本变化的包:
     所有（直接/间接）依赖"本轮版本变化包"的发布包 → 至少 patch 跟随
4. 每包新版本 = semver 递增（0.x 阶段 preMajor 规则由 release:plan 推导时已定）
5. 写回各包 package.json 的 version 字段（UTF8 无 BOM、LF 行尾）
6. 输出变更摘要（旧版本 → 新版本，含传导说明）；--dry-run 仅预览不写回
```

依赖图（实证）：`core(无依赖) → engine → mcp`、`core → cli`、`engine → cli/mcp`、`skills → cli`。

示例：`@dependfix/core` minor → `@dependfix/engine` / `dependfix` / `@dependfix/mcp` 跟随 patch（skills 不传导）。

### 4.2 发布执行（替代 changeset publish）

```
1. 取 PUBLISHABLE_PACKAGES（publishable: true——天然替代 changeset ignore 机制，
   新脚本只发布就绪包，不再需要 .changeset/config.json ignore 联动）
2. 按 publishOrder 遍历：
   a. 已发布判定：hasLocalTag(prefix+version) 短路 → isPublishedOnRegistry(pkg, version) 兜底
      （复用 tag-released-versions.mjs 导出；多源判定 + 查询失败保守跳过，对齐经验归档 §二十五）
   b. 未发布 → 执行 `pnpm --filter <pkg> publish --no-git-checks`
      （--no-git-checks 与 changeset 内部行为一致：脚本自行管理 tag 与流程；OIDC 直通）
   c. 成功后创建 annotated tag `<pkg>@<version>` 指向 HEAD
      （发布提交即版本提升 + changelog 提交，天然 touch 所有发布包路径，
      满足 changelog 分段锚点约束——经验归档 §二十五/§二十六）
3. 输出 发布/跳过（已发布）/跳过（查询失败）汇总；--dry-run 仅打印计划
4. 任一发布失败 → 非零退出（CI 中止）
```

### 4.3 版本递增

手写纯函数 `incVersion('0.2.0', 'minor') → '0.3.0'`（patch/minor/major 三态），不引入 semver 依赖（pnpm 严格模式无法直接 import 传递依赖）。

**版本口径以 `release:plan` 推导为准（严格约束）**：中间版本若只为验证发布链，仍按脚本的真实 bump 发布（0.6.0 → 0.7.0），不得人工把 0.x 的 feat / 破坏性变更降成 patch——降级会让 CHANGELOG 与语义脱节，并稀释后续 1.0.0 的 major 语义。裁定变更须同时落 todo 决策条与就绪度台账，并全仓改净旧版本号（含脚本提示串与用例注释）。

### 4.4 GitHub Release 自动化（聚合 Release + 项目 changelog notes）

**目标**：`release:publish` 完成 npm 发布后，CI 自动为**本轮发布**创建一个聚合 GitHub Release（每轮一个，非每包一个），notes 使用项目 changelog 格式。解决"多包版本不同步 × GitHub Release 单 tag 锚"的矛盾。

**锚版本选择**（主交付物优先，与根 CHANGELOG 锚 / release commit 版本选择逻辑一致）：

```
1. dependfix 本轮发布 → 锚 = dependfix 版本
2. 否则 @dependfix/core 本轮发布 → 锚 = core 版本
3. 否则依次 @dependfix/engine → @dependfix/skills → @dependfix/mcp
4. 本轮无包发布（重跑全跳过）→ 不创建 GitHub Release
```

**v 聚合 tag**：

- 由 `release:publish` 在**全部包发布成功后**创建（与 `<pkg>@<version>` 包 tag 同批，锚版本 = 本轮发布锚包版本），指向发布提交
- **时机约束**：v tag 必须在 `Push release tags` 步骤**之前**创建，随现有全量推送（`git push --tags`）带出并核验（经验归档 §二十六：创建 → 推送 → 核验三环闭环）——`release:github` 步骤在其后，只做 GitHub Release 创建，**不创建/不推送 tag**
- 与 1.0.0 后规划的 `v1` 滚动 tag 命名空间兼容（固定 tag + 移动 tag 共存）
- 幂等：v tag 已存在 → 跳过打 tag（不覆盖历史 tag），Release 复用该 tag 或跳过

**Notes 生成**（项目 changelog 格式）：

```
1. 优先：根 CHANGELOG.md 最新版本段（复用 release commit 的 awk 提取逻辑，
   与 release commit body 同源，格式一致）
2. 兜底（core-only 等根段为空）：锚包的包级 CHANGELOG 最新段
3. 追加"本轮发布版本矩阵"（本轮实际发布包列表：<pkg>@<version> 每行）
4. 0.x 阶段统一 --prerelease
```

**数据流**（本轮发布列表传递）：

```
release:publish → 全部发布成功后：打 v 聚合 tag + 写 release-publish-result.json
  （gitignore 临时产物：本轮 action=publish 的包列表 + 版本 + 锚版本）
release.yml Push release tags（全量推送，含 v tag，推送后核验）
  → pnpm release:github（scripts/create-github-release.mjs）：
     读 result.json → 提取 changelog 段 + 版本矩阵
     → gh release create v<锚版本>（幂等 + warn 不阻断）
```

**幂等与失败语义**：

| 场景 | 行为 |
|:---|:---|
| v tag 已存在 | 跳过打 tag（不覆盖历史 tag） |
| Release 已存在（重跑） | `gh release view <tag>` 检测 → 跳过 |
| Release 创建失败 | `::warning::` 不退出非零（npm 已发布完成，Release 是展示辅助，可后补） |
| 本轮无发布列表 | 不创建 |

**合规性**：`gh release create` 不修改仓库文件（仅创建 Release 对象 + 关联 tag），满足"CI 发布时不得改动其他部分"；本地 A 模式（首次手动发布）保持手动 `gh release create`（release.md 现有步骤）。

---

### 4.5 发布前门禁清单与实测时长（2026-11-12，M58.2）

`release.yml` 的阻断顺序固定如下，任一步非零即中止，不进入发布：

| 阶段 | 步骤 | 阻断 | 说明 |
|:--|:--|:--:|:--|
| 依赖面 | `pnpm audit --audit-level=moderate --registry=… \|\| true` | 否 | prod + devDeps 全量信号，与 `test.yml` 同命令 |
| 依赖面 | `pnpm audit --prod --audit-level=moderate --ignore-registry-errors --registry=…` | 是 | 判据为 exit 0 **且日志含审计结果行**（`No known vulnerabilities found`，或 `N vulnerabilities found` + `Severity: … (N ignored)` 两行；仅 registry 故障 + exit 0 不计证据，[安全规范 §5.6](../../standards/security.md#_5-6-依赖审计阻断语义-信号级-→-阻断的转正条件-2026-09-30-用户决策方案-c)） |
| 安全（只读预检） | `Pre-check release security alerts` | 是 | 在静态 / 构建之前、`Auto version` 之前；只读，阻断判定在下方 |
| 静态 | `lint:check` / `lint:css:check` / `gates:docs` / `typecheck` / `test` | 是 | 与 Test 的 lint / `gates:docs` 集合一致；compose 校验与 sandbox bundle 冒烟不在发布链内 |
| 构建 | `pnpm run build`（packages）+ `pnpm --filter @dependfix/platform build` | 是 | 根 `build` 只含 `./packages/*`，平台构建必须单独前置 |
| 日志 | `pnpm verify:changelog --fresh` | 是 | 版本段存在，且条目集合与当前 git 历史重算一致；已打 tag 的段（已发布，允许人工编辑）不参与比对；浅克隆 / 无 tag 时 warning 放行、不作为通过证据 |
| 安全 | `pnpm run check:release-security` | 是 | [安全规范 §5.9](../../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 口径 |
| 预演 | `pnpm release:preflight` | 是 | 真实 tarball 安装 + 版本断言 |
| 发布 | `pnpm release:publish` | 是 | 内部再执行一次同源安全门禁（M58.1） |

**D1 决策（2026-11-12）**：平台构建取「发布 job 内追加」，不拆独立并行前置 job。理由：整条发布链目前在单一 job 内共用 checkout / install / 工作区，拆并行 job 需再切一个发布 job 并重复 checkout、install 与 packages 构建；实测增量 36-58s（CI 侧：Test run `43156533722` 中同一命令 E2E job 04:43:02→04:43:38 共 36s、Visual job 04:43:04→04:43:42 共 38s；本地 warm 57.6s / 45.1s，packages 构建 11.7s 对照），低于 2 分钟预算，按 D1 的「超预算降级」分支落地。release job 环境（cache 命中差异）待首个真实发布 run 回填自身起止时刻。

**D2 决策（2026-11-12）**：`--fresh` 的比对粒度取「当前未发布版本段的条目集合」——只取列表条目行（`*` 开头）、归一空白后做多重集比较，不做整段字节比对（标题日期 / compare 链接 / 非条目的说明段落不参与判定；条目行一律参与）。已打 tag 的段视为已发布（允许人工编辑，1.0.0 段即含手写说明）跳过比对；浅克隆 / 无 tag 无法可靠重算 → `::warning::` 后放行，但不作为新鲜度通过证据（版本段存在性仍校验）。`--fresh` 全程不写盘（`git status` 前后一致）。

**负例标定（2026-11-12）**：① 命令层——依赖审计在临时工程注入 `lodash@4.17.15` 后 exit 1（5 条：2 moderate / 3 high）；平台构建在 `app/utils/duration.ts` 注入语法错误后 exit 1（`[builtin:vite-transform] Unexpected token`），还原后 exit 0 且文件 md5 与 HEAD 一致。② 工作流层——见下方「工作流级负例」。

**工作流级负例（2026-11-12，run [`43210761634`](https://github.com/dependfix/dependfix/actions/runs/43210761634)）**：临时分支在根依赖注入 `lodash@4.17.15` 后 `workflow_dispatch` 触发发布工作流 → 第 7 步 `pnpm audit (prod, moderate+, blocking)` 失败（日志含 `high | Command Injection in lodash` / `GHSA-35jh-r3h4-6jhm` 等条目），其后 `Auto version`、质量门、`Release Publish`、tag 推送与 GitHub Release 全部 `skipped`——即「审计红不能进入发布」在 workflow 层成立，且负例本身无发布副作用。验证后临时分支已删除、未合并，`master` 依赖与锁文件未变。

### 4.6 发布后镜像冒烟与历史 tag 巡检（2026-11-12，M58.4）

**位置决策（非 D3；D3 只约束触发面）**：放在 `docker.yml` 的 `merge` 之后（`post-release-smoke`，`needs: merge`），而不是 `release.yml` 的发布 job 之后。理由：`release.yml` 只对 docker 做异步派发，镜像在 docker 工作流内构建；在 release.yml 内做冒烟需长时间轮询等镜像（构建 20-40 分钟）。触发面仍由发布 gate 收口（D3）：`if: inputs.platform_version != ''` → 仅 release 派发 / 手工 dispatch 带版本时运行，`push:master` 的 latest 构建不跑。

**矩阵**：`ubuntu-latest`（amd64）与 `ubuntu-24.04-arm`（arm64）**原生 runner**（不用 QEMU）；`checkout` 取全量历史（`fetch-depth: 0`，历史 tag 巡检需要本地 tag 列表），各架构先 `docker pull ghcr.io/<repo>:platform-<version>`（`smoke-test.sh` 只检查本地镜像、不负责拉取），再跑 `apps/platform/docker/smoke-test.sh`，断言 `/api/health` 的 `version` = 发布版本、`commit` = 发布提交。commit 锚取 `github.sha`：发布路径由 `release.yml` 的 `--ref v<锚版本>` 钉住，因此工作流 HEAD 即发布提交，镜像构建期 `BUILD_COMMIT` 与之同源。

**失败语义**：job 级 `continue-on-error: true`——冒烟失败不改变镜像发布 / 工作流结论，但 Job Summary 写入「失败（未证实）」并输出 `::warning::`，不得当作运行通过。

**历史 tag 巡检**：amd64 腿执行 `scripts/release/scan-image-tags.mjs --window=10`，对近 10 个 `@dependfix/platform@*` 发布 tag 读取 registry manifest（**范围仅 GHCR**；Docker Hub / ACR 不在面内，`verified` 不代表三通道可用）：

- `verified` = manifest 可解析且同时含 `linux/amd64` + `linux/arm64`；
- `unverified` = 缺凭证 / 缺镜像 / 网络失败 / 单架构 / 输出不可解析，报告写「未证实 + 原因」，不写通过。

巡检只读 manifest，不拉取、不运行（运行时证据在冒烟矩阵）。

**未证实项（2026-11-12）**：arm64 原生 runner 首次真实运行与私有 GHCR 包读取（`packages: read`）待首个 release 派发实测；本地无 GHCR 凭证时巡检输出 401 Unauthorized 的「未证实」（已实跑，fail-open 生效）。

### 4.7 镜像通道矩阵与 ACR 架构边界（2026-11-12，M58.5）

| 通道 | 按 tag 获取 | 双架构 | 定位 |
|:--|:--|:--:|:--|
| GHCR `ghcr.io/dependfix/dependfix` | manifest list | ✅（三 registry × 4 tag 回读 12/12，run `42381362295`） | 双架构主通道（需 `read:packages`；包为私有） |
| Docker Hub `caomeiyouren/dependfix` | manifest list | ✅ 同上 | 双架构主通道（可匿名拉取） |
| 阿里云 ACR（个人版） | **依推送路径而变**：0.5.0（buildx 多平台直推）在 amd64 主机按 tag 只解析出 amd64；1.0.0 起（digest 合成）registry API 回读为双平台 index（4/4 tag，run `42381362295`） | ⚠️ arm64 主机实际拉取未实测 | **amd64 备份通道**（健康复核可用）；不得作为 arm64 运行证据 |

- **统一口径**：三篇文档统一写作「amd64 备份通道（健康复核可用）」；arm64 用户用 GHCR / Docker Hub，或按 OCI digest 拉取（digest 是绕开平台选择的确定路径，但 ACR 在 arm64 主机上的实际拉取未实测）。
- **证据边界**：2026-11-05 ACR 匿名拉取 + 冒烟只证明 **amd64 运行时 health**（`0.5.0` / `a049a561`，当时 tag 按平台解析为单一 amd64）；2026-11-07 1.0.0 的 registry API 回读证明 index 含双平台。两者证明面不同；**历史 tag 不可假定双架构**（0.5.0 与 1.0.0 的推送路径不同）。
- **不做什么**：不迁 ACR 企业版、不改主通道与推送逻辑、不重建历史 tag。

## 5. 文件映射

### 新增

| 文件 | 内容 |
|:---|:---|
| `scripts/release-version.mjs` | 计划解析 + 依赖传导 + 版本写回（纯函数导出 + main 守卫，沿用现有脚本风格） |
| `scripts/release-publish.mjs` | 发布列表选择 + 按序 publish + 打 tag |
| `scripts/release-version.test.mjs` | 计划解析 / 传导闭包 / 版本递增（纯函数 + 依赖注入） |
| `scripts/release-publish.test.mjs` | 发布列表选择（注入已发布判定）/ tag 计划 / dry-run |
| `scripts/create-github-release.mjs` | 锚版本选择 + v tag + changelog 段提取 + 版本矩阵 + gh release create（纯函数 + main 守卫，§4.4） |
| `scripts/create-github-release.test.mjs` | 锚包选择 / 段提取 / 幂等判定（注入 gh 调用） |
| `docs/design/governance/release-pipeline.md` | 本文档 |

### 修改

| 文件 | 改动 |
|:---|:---|
| `scripts/create-changeset.mjs` → `scripts/create-release-plan.mjs` | 重命名；main 输出路径 `.changeset/release.md` → `release-plan.md`；纯函数与注释不动 |
| `scripts/create-changeset.test.mjs` → `scripts/create-release-plan.test.mjs` | 重命名 + import 路径（用例零改动） |
| `package.json` | scripts 替换（release:plan/version/publish；删除 changeset 系列）；devDeps 移除 `@changesets/cli` |
| `.github/workflows/release.yml` | schedule 分支 `pnpm changeset version` → `pnpm release:plan && pnpm release:version`（前置防御性 `rm -f release-plan.md`）；`pnpm changeset publish` → `pnpm release:publish`；注释同步 |
| `.gitignore` | 新增 `release-plan.md` |
| `.github/agents/code-auditor.agent.md` | 必查项「新增发布包链路完整性」：changeset ignore 联动条目删除，改为引用 packages.config.mjs 单点 |
| `.github/skills/code-reviewer/references/code-quality-checklist.md` | 同一并更新 |
| `scripts/packages.config.mjs` | `publishable` 字段注释更新（ignore 联动说明 → 新脚本语义） |
| `scripts/release-publish.mjs` | 全部发布成功后：打 `v<锚版本>` 聚合 tag（锚版本 = 主交付物优先）+ 写 `release-publish-result.json`（本轮实际发布列表，gitignore 临时产物） |
| `package.json` | scripts 新增 `release:github`（node scripts/create-github-release.mjs） |
| `.github/workflows/release.yml` | `Push release tags` 后加一步 `pnpm release:github` |
| `.gitignore` | 新增 `release-publish-result.json` |

### 删除

| 路径 | 说明 |
|:---|:---|
| `.changeset/config.json` + `.changeset/` | changeset 配置与目录 |
| `@changesets/cli`（+ 约 13 个传递依赖） | lockfile 随 `pnpm install` 自动清理 |

### 文档同步

| 文件 | 改动 |
|:---|:---|
| `docs/guide/release.md` | 全篇重构为权威文档：双模式流程、三命令、计划文件 review、传导语义、OIDC 不变说明 |
| `docs/guide/tech-stack.md` | 工具表（@changesets/cli 行删除）、发布命令表更新、updateInternalDependencies 段落替换 |
| `docs/design/governance/architecture.md` | 版本发布行更新 |
| `docs/design/governance/experience-archive.md` | §二十五 追加演进注记（ignore 联动消亡）；§二十六 保留（教训已继承） |
| `docs/research/2026-08-02-release-tools-comparison.md` | 文首加注演进说明（历史调研保留） |
| `docs/guide/release.md` | CI 发布行为 + tag 策略 + 已知限制（GitHub Release 自动化步骤） |
| `scripts/README.md` | 命令速查新增 `release:github` |

**不修改**：`docs/standards/ai-collaboration.md`（react-turnstile 为外部项目事实引用）、`docs/plan/todo-archive.md`（历史归档）。

---

## 6. 风险与约束

| 风险 | 等级 | 应对 |
|:---|:---|:---|
| 依赖传导语义偏差 | 高 | 传导闭包单测覆盖三条链：core→engine→mcp、core→cli、engine→cli/mcp；验收用例"core minor → engine/cli/mcp 均 patch" |
| 版本写回不可逆污染 | 中 | `--dry-run` 预览；写回前校验工作区干净；消费后计划文件保留可重跑（幂等） |
| CI 无交互环境残留计划文件 | 低 | 计划文件进 .gitignore；Auto version 步骤前置 `rm -f` 防御 |
| 已发布判定网络依赖 | 低 | 复用现有保守策略（tag 短路 + registry 兜底 + 失败跳过） |
| Trusted Publisher 失效 | 低 | workflow 文件名 `release.yml` 不变（npm 侧 OIDC 配置不受影响）；底层仍 `pnpm publish` |
| 供应链风险（自研发布脚本） | 低 | 保持现状安全基线：OIDC + 最小权限 + A 模式人工闸门（review 计划文件 + changelog 校验）；脚本纯函数化可审计 |
| GitHub Release 创建失败 | 低 | warn 不阻断（Release 为展示辅助，npm 发布已完成，可后补 `gh release create`）；幂等跳过已存在 Release |
| v tag 命名冲突（锚版本与历史 v tag 重复） | 低 | 跳过打 tag + Release 复用已存在 v tag 或跳过；warn 提示 |
| 本地无法端到端验证 gh release create | 低 | 纯函数单测 + dry-run；CI 端到端为最终裁决（同发布链路惯例） |
| 发布提交不是 master tip | 高 | `release:publish` 的 HEAD 锚点要求「HEAD 自身 touch 待发布包路径」，push 后再落任何提交都会让发布中止。顺序刚性：commit → push → 核验 `origin/master` 即发布提交 → 立即 `workflow_dispatch`；发布窗口内冻结 master。tags 推送后若 Release 创建失败，重跑不会补建，需 `gh release create` 手工兜底 |
| 发布物存在性误判 | 中 | 「已手动发布」不等于每类产物都存在：npm 看 `npm view`、tag 看 `git tag --points-at`、Release 看 `gh release view`、镜像看构建 run + digest；缺哪项写「未证实」并给前置条件，不把 401 / 超时误读成「没权限」 |
| 预发布 profile 不覆盖发版专属门禁 | 中 | `regression:pre-release` 只跑测试 / 审计 / 文档 / lint / typecheck / build / changelog，不含 `check:release-security`、`release:preflight`、platform build、platform e2e / 视觉；发版前须补跑四类并分别落盘，不得用 profile 的 Pass 代替发版结论 |

## 7. 执行顺序与提交拆分

| 提交 | 内容 | 验收 |
|:---|:---|:---|
| 1 | `release-version.mjs` + 单测（纯增量，changeset 仍可用） | 单测全过：传导闭包 3 链、版本递增、计划解析、dry-run |
| 2 | `release-publish.mjs` + 单测（纯增量） | 单测全过：发布列表选择（注入判定）、tag 计划、dry-run |
| 3 | **原子切换**：改名 + release.yml 接线 + package.json scripts 切换 + 移除 @changesets/cli + 删除 .changeset/ + .gitignore + 审计清单 | `pnpm install` 后 lockfile 无 @changesets；`pnpm release:plan` 端到端跑通；lint/typecheck/test 全过 |
| 4 | 文档收口（release.md 重构 + tech-stack + architecture + 经验归档注记 + research 加注） | lint:md 通过；文档无 changeset 命令残留（grep 核验） |
| 5 | GitHub Release 自动化（`create-github-release.mjs` + 单测 + release-publish 写 result.json + release.yml 接线 + 文档） | 单测全过：锚包选择 / 段提取 / 幂等判定；`release:github --dry-run` 本地实测；CI 端到端创建 Release 为最终裁决 |

**质量门**：lint / typecheck / test / lint:md 全过；CI 端到端为最终裁决。

## 8. 验收标准

| 需求 | 验收 |
|:---|:---|
| 本地手动发布 | A 模式全流程实测：release:plan → review → release:version → changelog → release:publish --dry-run 预览 → 发布 |
| CI 发布 + 仅推 changelog/tag | A 模式 CI 零文件写回（除 push tags）；B 模式唯一写回 = release commit + tags；changelog 校验步骤放行 |
| changelog 自动/分包 | 复用 changelog.mjs（现状能力），CI 校验步骤确保入库 |
| 推导版本 + 打 tag | release:plan 推导（既有单测）+ release:version 传导写回（新单测）+ release:publish 创建 annotated tag |
| 发布顺序 | publishOrder 遍历 + 传导闭包保证依赖方后发；发布列表按 publishOrder 输出 |
| GitHub Release 自动化 | 每轮发布（含 core-only）自动创建 1 个聚合 Release：锚版本 = 主交付物优先；notes = 根 changelog 段（core-only 取锚包包级段）+ 版本矩阵；0.x 标 prerelease；幂等（已存在跳过）；失败 warn 不阻断 |
