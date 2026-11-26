# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | M68 运行面安全与镜像供应链（5 原子，2026-11-26 规划） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M67 已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M67 已归档，M68 规划完成待启动） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M68 运行面安全与镜像供应链（2026-11-26 规划）

> **目标**：把「运行镜像内置编译链」「运行面漏洞无自动告警源」「沙箱镜像双架构自包含未取证」「镜像构建重复」「发布安全证据无采集时点」五处运行面 / 供应链缺口收敛，使运行镜像攻击面、漏洞发现与发布取证都可判读。
>
> **来源**：用户 2026-11-26 选定主题 A。上收 5 条候选——独立 installer 容器 / runtime 工具链移出（P2 🛡️，2026-10-18 评估）、运行面漏洞检测（P2 🛡️，2026-10-22 评估）、沙箱镜像双架构自包含冒烟与安全姿态（P2 🚀📚，2026-11-13 阶段容量再平衡移出的 sandbox 双架构冒烟候选，未占阶段编号）、镜像构建冗余（P2 🚀，2026-11-07 评估）、`check:release-security` 输出缺少采集时点（P3 🛠️，2026-11-03 预发布检查发现）。
>
> **§3.4 五步交叉核验（2026-11-26 实测；已有实现只列缺口，不重复上收）**：
> ① 归档扫描：`installer|runtime 工具链|沙箱镜像双架构|smoke-test|构建冗余|release-security.*采集|运行面漏洞` 于 `docs/plan/archive/` + `todo-archive.md` → M59/M58 仅有 sandbox 自包含 / post-release smoke 的**部分实现**（双架构冒烟候选已于 2026-11-13 再平衡移出、M58.4 只做镜像 health），installer 拆分 / 运行面告警源 / 构建去重 / 采集时点均无闭环记录；
> ② `git log --all --grep`：installer `b470f88b`（沙箱自包含入口）/ `54e633a8`（安装失败取证）；双架构 `3f4080dd`（发布后镜像冒烟）/ `3f39e371`（沙箱镜像解耦）；release-security `33c3940b`（本地发布通道接入门禁）；`check-node-version` `f176e5e9`——均为前置 / 部分实现，无整项重复；
> ③ 代码 anchor：`apps/platform/Dockerfile:68` / `:78` / `:203`（最终平台 stage 继承含 `python3 make g++` 的 `executor-base`；`executor-base-slim` 仅用于 sandbox）、`:96-109`（deps 阶段临时工具链）、`:161` / `:182`（sandbox slim / full）；`.github/workflows/docker.yml:78`（双架构 build matrix）、`:253` 起（每 registry 各推 digest）、`:744`（post-release-smoke）；`apps/platform/docker/smoke-test.sh` 仅断言平台 health，无 sandbox 入口；`scripts/check-release-security-alerts.mjs:250-282` 输出无采集时点；`apps/platform/docker/check-node-version.mjs` 仅为静态下限闸门；
> ④ 决策前提：用户已选主题 A；D1 installer 形态（独立容器 / stage / slim runtime + full 回退）、D2 运行面数据源与首版范围（仅本仓 Node / Alpine vs 产品化）、D3 构建去重机制（单次多 registry 推送 / digest 复用 / push 腿跳过）、D4 双架构冒烟门控与未证实口径、D5 采集时点格式与输出位置留 D 阶段；
> ⑤ backlog 同步：上收 5 条（候选池 20 → 15、待上收保持 2），删除上收正文；无新增候选、无阶段编号外溢。
>
> **容量基线（逐原子交付物求和，规划轮估算；行 = diff 改动量含删除；测量方 = 规划角色；执行期以 `git diff --shortstat` 校准）**：18-26 commits / 26-42 files / 1,200-2,220 行。**类型（按主类型计数）**：🛡️2（M68.1 / M68.2）+ 🚀2（M68.3 / M68.4）+ 🛠️1（M68.5）；用户可见面无（全部 CI / Docker / 脚本消费，按规划规范 §2.6 API-only ③）；§1.1 类型平衡 UX 建议未满足（用户 2026-11-26 选定安全主题）；测试覆盖随各原子同批交付。
>
> **用户可达性判定（规划规范 §2.6）**：M68.1 为 API-only ③（Docker 构建 / 部署参数消费，部署指南为承载入口）；M68.3 / M68.4 为 API-only ③（CI / Docker 构建与冒烟消费）；M68.2 为 API-only ③（周检 workflow + 脚本，帮助与退出码即交付面）；M68.5 为 API-only ③（发布脚本输出与帮助）。
>
> **执行顺序**：M68.1（installer，先降攻击面）→ M68.2（运行面告警源）→ M68.3（沙箱双架构冒烟）→ M68.4（构建去重）→ M68.5（发布采集时点，小步）。
>
> **D 阶段决策点**：D1（M68.1）独立 installer 容器 vs 多阶段 / full 回退；D2（M68.2）数据源与首版范围（仅本仓 vs 产品化）；D3（M68.4）单次多 registry / digest 复用 / push 腿跳过；D4（M68.3）双架构门控与无 arm 窗口的未证实口径；D5（M68.5）ISO 时点格式与首行位置。
>
> **前置 / 风险**：installer 拆分必须保留原生模块编译回退（slim 默认 + full / 仓库级镜像），失败不得静默降级；运行面检测数据源异常必须 fail-closed / 明确未知，不得报「无漏洞」；双架构冒烟无 arm 窗口时记「未证实」，不得以设计覆盖替代；构建去重不得改变多架构 manifest 与 4 tag 语义；采集时点只增输出，不改门禁判定。

### 进度总览

| 大条目 | 小条目 | 状态 | 提交 | 审计 | 容量 |
|:--|:--|:--|:--|:--|:--|
| M68.1 独立 installer 容器与 runtime 工具链移出 | — | ✅ 已闭环 | 4 commits（`C1`-`C4`，见执行记录） | 分区 A deep R1 Pass（0B/5W）→ R2 Pass；分区 B standard R1 Reject（1B/8W）→ R2 Pass | 实际 4 commits / 18 files / 约 520 行（含新增 497 行文档与脚本） |
| M68.2 运行面漏洞检测最小周检 | 2（M68.2.1-M68.2.2） | ✅ 已闭环 | 5 commits（`C5`-`C9`，见执行记录） | deep R1 Reject（2B/8W）→ R2 Pass（2W 已修） | 实际 5 commits / 10 files / 1,158 行新增（超计划，原因见执行记录） |
| M68.3 沙箱镜像双架构自包含冒烟与安全姿态 | — | ⬜ 待开始 | — | — | 计划 4-6 commits / 6-10 files / 300-550 行 |
| M68.4 镜像构建去重与发布构建复用 | — | ⬜ 待开始 | — | — | 计划 3-4 commits / 3-5 files / 150-300 行 |
| M68.5 发布安全输出采集时点 | — | ✅ 已闭环 | 2 commits（见执行记录） | deep R1 Pass（1W 已修） | 实际 2 commits / 5 files / 123 行新增 |

> 状态 / 提交 / 审计由执行与归档批次回填；`提交` 列填该条目自身 commit 区间与数量，`审计` 列填 Review Gate 轮次结论。

### M68.1 独立 installer 容器与 runtime 工具链移出（P2 🛡️）

- **目标**：平台生产镜像不再内置 `python3` / `make` / `g++` 编译链，依赖安装与原生模块编译在独立 installer 阶段 / 容器完成；运行镜像攻击面与体积下降，同时保留目标仓库原生模块回退能力。
- **优先级**：P2（不可信仓库在容器内获得编译面；审计实测同 digest 基础镜像 content size +约 110MB、disk +约 421MB）。
- **范围**：
  - `apps/platform/Dockerfile`：`runtime` / `executor-base` / `executor-base-slim` 分层重构；生产默认 stage 改 slim，保留平台 full 变体（`executor-base`）供容器执行器回退，`sandbox-full` 编译能力不变；
  - `apps/platform/docker/entrypoint.sh`、`docker-compose*.yml`、`deploy` 参数：构建参数 / 镜像选择 / pnpm store 卷；
  - `apps/platform/server/services/executor/container-executor.ts`：若 D1 选独立 installer 容器，接入安装阶段与失败诊断；
  - 镜像冒烟与体积基线：`apps/platform/docker/smoke-test.sh`、构建期断言、部署文档。
- **验收标准**：
  - AC1：平台默认镜像内 `python3` / `make` / `g++` 不存在（容器内 `command -v` 断言），`sandbox` / `sandbox-full` 既有行为不变；
  - AC2：原生模块仓库仍能完成 fix / verify（fixture 或 gated docker 实测）；container-executor 走平台 full 变体或独立 installer，sandbox 走 `sandbox-full` / 仓库级镜像，两条执行面的回退与诊断均可判读；
  - AC3：镜像 content size 与 disk 体积前后读数落盘（`docker image inspect` / `docker images`），并设构建期体积门禁或显式基线；
  - AC4：compose 三形态 `config --quiet`、`gates:docs` 22 项、deployment / configuration 指南同步；
  - AC5：回滚路径 = 切回 full 变体或恢复旧 Dockerfile，不改变 compose 服务契约。
- **不做什么**：不改 `sandbox-full` 的编译能力；不改基础镜像 tag / digest；不引入 QEMU；不改变目标仓库验证链语义。
- **依赖**：`apps/platform/Dockerfile:68-92`、`:203`；`apps/platform/docker/entrypoint.sh`；M58.4 冒烟脚本；M66 pnpm store 治理口径。
- **交付物**：5-7 commits / 8-12 files / 350-600 行；建议分组——① Dockerfile 分层与构建参数 ② 执行器 / 安装阶段接线 ③ 冒烟 / 体积门禁 ④ compose / 文档同步。
- **风险与缓解**：原生模块无预编译包 → 保留 full / 仓库级镜像，失败错误码可判读；构建缓存失效 → 记录 cold / warm 读数；compose 路径漂移 → 三形态 `config --quiet` 门禁。

#### M68.1 执行记录（2026-11-26 闭环）

- **D1 决策**：slim 默认 + full 变体回退，**不采用**「独立 installer 容器」分支（平台默认镜像不内置 docker CLI，installer 容器会迫使默认部署常驻挂载 rootless socket；编译只是安装期一次性需求）。原「范围」中的 `container-executor.ts` 安装阶段接线随之不适用。
- **交付**：`ARG PLATFORM_VARIANT` 单段 stage 切换（`executor-base-${PLATFORM_VARIANT}` + `executor-base-full` 别名）+ 构建期 `docker/check-toolchain.mjs` 双向断言 + `org.opencontainers.image.dependfix.toolchain` label；`docker/Dockerfile.toolchain` 免重建叠加层；`smoke-test.sh` 场景 0b 变体断言（默认 slim）；`docker.yml` amd64 腿新增别名 stage / 叠加层 / FROM 插值静态守卫；引擎安装失败提示指向 `--build-arg PLATFORM_VARIANT=full` / `sandbox-full`。
- **读数**：slim 408MB（`inspect .Size` 95,811,958 B）/ full 832MB（207,343,202 B）/ 变更前 207,292,005 B；warm 构建 4m42s、3m00s。显式体积基线 + 漂移 >10% 处置见 [platform-image-variants.md](../design/governance/platform-image-variants.md) §5。
- **证据**：slim 内源码编译 `better-sqlite3@13.2.0` 失败于 `gyp ERR! find Python` 且真实日志经 `classifyInstallFailure` 得到含 `PLATFORM_VARIANT=full` 的提示；full 内同命令编译成功并可加载（`SQLITE_OK 3.54.1`）；slim / full 冒烟 PASS、负例（full 按 slim 期望）在 0b 失败；`PATH` 收窄负例在满工具链镜像上 exit 1；compose 三形态 `config --quiet` OK。
- **未证实**：原生模块仓库端到端 `fix` / `verify` 运行未取证（变体只改安装期可执行文件面，`packages/engine` 的 fix / verify 链无代码改动，以等价论证判定）；`retry_condition` = 后续 gated docker 批次以 full 变体跑一次 report-only 运行后回填。
- **残余**：体积为显式基线非门禁；叠加层为单架构（多架构集群用 `PLATFORM_VARIANT=full`）；诊断依赖 pnpm 错误文本正则，裸 `make: not found` 形态不命中。

### M68.2 运行面漏洞检测最小周检（P2 🛡️）

- **目标**：本仓运行面（Node 运行时、Alpine 基底与 apk 包）有可复算的周期告警源，不再只靠人工巡检；数据源异常时明确失败 / 未知，不误报「无漏洞」。
- **优先级**：P2（2026-10-22 / 11-11 两次 Node / Alpine 安全公告均由外部巡检发现；当前 `apps/platform/docker/check-node-version.mjs` 只是静态下限闸门）。
- **范围**：
  - 设计稿：新增或并入治理文档，记录数据源实测（Node CHANGELOG security / Alpine secdb / GitHub Advisory 缺口）、严重级别映射、豁免与误报口径、与 `apps/platform/docker/check-node-version.mjs` 的关系；
  - `scripts/` 检测脚本 + fixture：从镜像或版本清单提取 Node / apk 版本，与数据源比对；网络失败 / 解析失败 fail-closed；
  - `.github/workflows/`：weekly + dispatch 周期 job，输出 Job Summary 与 findings；默认只报告 / 失败，不自动升级；
  - 基线清单：Node / Alpine 版本与已知安全发布的可复算快照。
- **验收标准**：
  - AC1：数据源实证（各至少 1 个真实安全发布 + 失败形态）写入设计稿，结论可复现；
  - AC2：fixture 下「命中已知运行面漏洞」失败并列出包 / 版本 / 数据源；干净基线通过；数据源不可达 / 解析失败 → 非零或 `unknown`，不得 PASS；
  - AC3：周期 workflow 可用 dispatch 复跑，Job Summary 含镜像 digest / Node 版本 / apk 清单与结论；单测不依赖外网；
  - AC4：豁免 / 基线更新路径成文（人工确认后更新清单），不自动改 Dockerfile 或提 PR；
  - AC5：`gates:docs` 22 项、定向 vitest、workflow YAML 可解析。
- **不做什么**：不做被管理仓库的运行面告警产品化（另条候选）；不引入 trivy / syft 全量 SBOM（首版只做 Node / Alpine 最小面）；不自动升级或自动开 PR。
- **依赖**：`apps/platform/docker/check-node-version.mjs`、`apps/platform/Dockerfile` 基底 digest、M58.4 镜像冒烟；数据源快照见 `git show ba726710`（M68.2.1 设计稿须重新实证并内联结论）。
- **交付物**：4-6 commits / 6-10 files / 300-550 行；按 M68.2.1（数据源与设计）/ M68.2.2（脚本 + workflow + fixture）分批。
- **风险与缓解**：数据源不稳定 → adapter + fail-closed + fixture；误报 → 严重级别映射与豁免清单；CI 成本 → weekly + dispatch，单次只拉清单不构建全镜像（或缓存 digest）。

#### M68.2.1 数据源与设计（运行面检测）

- **目标**：确定 Node / Alpine 数据源、严重级别映射、失败与豁免口径，形成可执行设计。
- **验收标准**：至少 1 个真实安全发布 + 1 个失败形态实证；设计含数据源、映射、fail-closed、与静态基线关系；`gates:docs` 通过。
- **交付物**：2-3 commits / 3-5 files / 150-300 行。
- **依赖**：2026-10-22 评估记录；Node CHANGELOG / Alpine secdb 可访问。

#### M68.2.2 脚本与周期 workflow

- **目标**：实现最小检测脚本与 weekly / dispatch workflow，fixture 可判读。
- **验收标准**：AC2 / AC3 / AC4 / AC5 全部满足；单测不依赖外网；数据源失败不 PASS。
- **交付物**：2-3 commits / 3-5 files / 150-250 行。
- **依赖**：M68.2.1 设计结论。

#### M68.2 执行记录（2026-11-26 闭环）

- **数据源与判定**：Node 用 `dist/index.json` 的 `security` 标记（同线最新 security 发布 > 运行版本 → `high`）；Alpine 用 `secdb.alpinelinux.org/<branch>/{main,community}.json` 的 `secfixes`（main + community 合并 3,524 条修复版本记录；数据源不提供 severity，故 finding 级别为 `unknown`）；GitHub Advisory 因跨生态 CVE join 不可靠（CVE-2026-4738 返回 OSGeo 条目）不参与首版。
- **fail-closed**：采集失败 / 空 apk 清单 / 包行或版本无法解析 / Node 版本形态异常 / 数据源不可达或结构变化 / 豁免清单缺 `reason`·`expires` → `UNKNOWN`（exit 2）；版本比较异常产出 unknown finding（exit 1），不静默放过（审计实证 secdb 存在 `opensmtpd 6.6.2p1-r0` / `cacti 1.2.31-0` / `quickjs 2021-03-27-r5` 形态）。
- **交付**：`scripts/check-runtime-surface.mjs`（`pnpm run check:runtime-surface`）+ 豁免基线 JSON + weekly / dispatch workflow（Job Summary：镜像 digest / Node / Alpine / apk 清单 / findings 含数据源 / 结论；dispatch 仅允许 dependfix 发布形态镜像名）。
- **首次实测**：`node v26.13.1` / Alpine 3.24.4 / 33 apk → `apk:zlib 1.3.2-r1 < 1.4-r0`（CVE-2026-4738）exit 1；干净基线 exit 0；不可达数据源 exit 2。首个周检 run 预期为红，待人工抬升基座。
- **证据**：定向 vitest 14 passed；`pnpm run test:coverage` → 全局 branches 84.06%（新脚本 statements 92.25% / branches 83.66%）、6,730 passed；`gates:docs` 22 项；workflow YAML 可解析。
- **容量**：超计划（10 files / 1,158 行新增 vs 计划 6-10 files / 300-550 行）——审计新增要求（AC3 apk 清单、三条 fail-closed 通道、豁免 schema、负例测试）推高交付面；按 5 个 commit 拆分（设计 / 脚本 / workflow / 测试 / 记录），单 commit ≤800 行。
- **残余**：secdb 无 severity；仅检查发布的 `latest` ref（full / sandbox 当前共用基底，变体分叉时需加矩阵）；周检节奏下 0-7 天暴露窗口。

### M68.3 沙箱镜像双架构自包含冒烟与安全姿态（P2 🚀📚）

- **目标**：`sandbox` / `sandbox-full` 镜像在 amd64 / arm64 发布时自动验证自包含入口（`--version` + `skills doctor`），安全姿态单一口径成文。
- **优先级**：P2（2026-11-13 再平衡移出的 sandbox 双架构冒烟候选；当前 `post-release-smoke` 只验平台 health，沙箱入口无双架构证据）。
- **范围**：
  - `apps/platform/docker/smoke-test.sh`：增加 sandbox 入口断言（版本非 unknown + skills doctor）；
  - `.github/workflows/docker.yml` 的 `post-release-smoke`：sandbox / sandbox-full 双镜像 × amd64 / arm64 矩阵，Job Summary；
  - 三篇 sandbox 设计稿状态与安全姿态口径；`deployment.md` 运行面提示。
- **验收标准**：
  - AC1：双架构 × 双镜像冒烟通过；仅当 `ubuntu-24.04-arm` runner 队列不可用时记「未证实」并附排障证据与 run 链接，注入回归证明断言灵敏；
  - AC2：Job Summary 含镜像 / 架构 / 断言结果，失败仅告警不阻断镜像发布；
  - AC3：设计稿无 stale（fix 放行状态 / 安全姿态单点），`gates:docs` 22 项；
  - AC4：不改镜像架构 / QEMU，不重建历史镜像。
- **不做什么**：不引入 rootless 之外的新隔离机制；不改 sandbox 镜像构建链；不把未跑到的 arm 结果写成已验证。
- **依赖**：M58.4 `post-release-smoke`；M59.1 / M59.2 沙箱自包含；`apps/platform/docker/smoke-test.sh`。
- **交付物**：4-6 commits / 6-10 files / 300-550 行；建议分组——① smoke 脚本 + 单镜像断言 ② workflow 矩阵 + Summary ③ 设计稿 / 部署文档。
- **风险与缓解**：arm runner 无窗口 → 记未证实；冒烟失败阻断发布 → job 级 `continue-on-error`；双镜像耗时 → 仅发布 gate 触发。

### M68.4 镜像构建去重与发布构建复用（P2 🚀）

- **目标**：消除每架构 3 镜像 × 3 registry 的重复构建、发布提交被 push 与 dispatch 重复构建的浪费，同时保持多架构 manifest 与 4 tag 语义不变。
- **优先级**：P2（冷缓存最慢 41m32s；发布提交重复构建）。
- **范围**：
  - `.github/workflows/docker.yml`：build matrix / digest 推送 / merge manifest；
  - `.github/workflows/release.yml`：release 派发与 push 触发的跳过条件；
  - 构建耗时与 manifest / tag 正确性证据。
- **验收标准**：
  - AC1：每架构每镜像只构建一次（或显式记录不可去重原因），三 registry 仍得到同一内容的多架构 manifest；
  - AC2：发布提交不再同时触发 push 腿与 release 派发构建（或用明确 skip 条件），`latest` 与版本 tag 不漂移；
  - AC3：cold / warm 构建时长前后读数落盘，4 tag × 3 registry 回读矩阵通过；
  - AC4：单 registry 失败不污染其它 registry；回滚 = revert workflow。
- **不做什么**：不改镜像内容 / tag 命名；不改 ACR / GHCR / Docker Hub 通道定位；不引入第三方 action。
- **依赖**：M58.4 / M58.5 镜像通道口径；`docker.yml:78-400`；`release.yml` 派发步骤。
- **交付物**：3-4 commits / 3-5 files / 150-300 行。
- **风险与缓解**：跨 registry digest 不可复用 → D3 允许保留 per-registry push 但去重 tag / 构建；manifest 错配 → 回读矩阵；缓存 scope 漂移 → 固定 cache scope 并记录读数。

### M68.5 发布安全输出采集时点（P3 🛠️）

- **目标**：`check:release-security` 的汇总 / PASS / FAIL 输出自带 ISO 采集时点，落盘为发布证据时可自证时点。
- **优先级**：P3（2026-11-03 预发布检查发现；当前只能靠文件 mtime 推断）。
- **范围**：`scripts/check-release-security-alerts.mjs` 输出首行加 ISO 时间戳；单测；发布指南证据口径。
- **验收标准**：
  - AC1：PASS / FAIL / token / 台账异常路径均输出采集时点（同一格式）；
  - AC2：单测锁定格式与首行位置；不改告警判定与 fail-closed；
  - AC3：`gates:docs` 22 项，发布指南同步。
- **不做什么**：不新增 `--json`；不改告警级别 / 豁免语义；不改 workflow 顺序。
- **依赖**：`scripts/check-release-security-alerts.mjs:250-282`；M58.1 / M67.3 发布门禁。
- **交付物**：2-3 commits / 3-5 files / 100-220 行。
- **风险与缓解**：时区歧义 → 固定 UTC ISO；测试时钟漂移 → 注入 now 或正则。

#### M68.5 执行记录（2026-11-26 闭环）

- **交付**：`formatCollectionTime()` 让 `check-release-security-alerts.mjs` 的所有路径首行输出 `[release-security] 采集时点 <UTC ISO 8601>`（PASS / FAIL / token 缺失 / 台账不可读或非法 / 拉取异常；参数错误路径经 stderr），判定与退出码不变。
- **证据**：无 token 实跑 → 首行为采集时点、exit 1；单测覆盖 7 条返回路径 + 参数错误路径的首行与格式（可注入时钟）；`gates:docs` 22 项；发布指南与门禁设计稿同步。
- **残余**：`--help` 不输出采集时点（非门禁运行，无证据语义）；时点语义为「输出 / 汇总时刻」，不表示发起时刻；顶层 catch 的首行无单测（v8 ignore 区）。
