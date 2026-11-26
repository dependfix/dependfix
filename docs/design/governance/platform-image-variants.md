# 平台镜像工具链变体（slim 默认 / full 回退）

> **状态**：✅ 已落地（2026-11-26，M68.1）
> **来源**：M68 主题 A「运行面安全与镜像供应链」首原子；候选来自 2026-10-18 运行镜像审计（同 digest 基础镜像 content size +约 110MB、disk +约 421MB）
> **关联**：`apps/platform/Dockerfile`、`apps/platform/docker/check-toolchain.mjs`、`apps/platform/docker/Dockerfile.toolchain`、`apps/platform/docker/smoke-test.sh`、[部署指南镜像变体](../../guide/deployment.md#镜像变体-默认-slim-与-full-工具链)

## 1. 问题

平台镜像曾长期内置 `python3` / `make` / `g++`。该工具链的唯一用途是**被修复仓库**的原生模块在
没有 prebuild 时回退 `node-gyp` 源码编译；平台自身没有任何运行期编译需求（`better-sqlite3` 的 musl
prebuild 已由 Nitro trace 打进 `.output`）。代价是：运行镜像的攻击面（编译器 / Python 解释器 /
可被不可信仓库调用的构建链）与体积（content size +约 110MB，disk +约 421MB）无条件承担，而
绝大多数仓库并不需要编译。

**目标**：默认平台镜像不含原生编译链；需要编译的仓库仍有一条**可判读、可切换**的 full 路径。
**非目标**：不改变 `sandbox-full` 的编译能力，不改基础镜像 tag / digest，不引入 QEMU，不改变目标仓库验证链语义。

## 2. 决策 D1：slim 默认 + full 回退（不引入独立 installer 容器）

| 方案 | 结论 | 理由 |
|:--|:--|:--|
| A. 独立 installer 容器（安装阶段在旁挂容器执行） | ❌ 不采纳 | 平台默认镜像**不内置 docker CLI**（M60.4 决策 D3）。installer 容器会迫使默认部署挂载 rootless socket，把「编译期一次性需求」变成常态化的 socket 暴露面，与 M60.4 / security §5.3 的默认最小化取向冲突 |
| B. 多阶段 + full 变体回退 | ✅ 采纳 | 同一 Dockerfile 经 `ARG` 切换基底（`executor-base-slim` / `executor-base`），单一 stage 定义不漂移；不与 docker socket 耦合；回滚只需切变体或拉回官方镜像 |
| C. 维持 full 默认 | ❌ 不采纳 | 攻击面与体积长期由「少数需要编译的仓库」决定，与「运行面安全」主题相反 |

方案 B 的代价是**能力默认关闭**，因此必须同时交付三件事：full 变体可获取、变体可判读、失败提示可落地（§3-§4）。

## 3. 交付形态

| 镜像 / 变体 | 基底 stage | 编译链 | 获取方式 |
|:--|:--|:--|:--|
| 平台默认（`dependfix:latest` 等发布 tag） | `executor-base-slim` | 无 | `docker compose pull` |
| 平台 full | `executor-base` | `python3` / `make` / `g++` | ① `--build-arg PLATFORM_VARIANT=full`；② 对已发布镜像叠加 `docker/Dockerfile.toolchain` |
| `dependfix-sandbox`（默认） | `executor-base-slim` | 无 | 发布镜像 |
| `dependfix-sandbox-full` | `executor-base` | 有 | 发布镜像 |

- **单一 stage 定义**：平台阶段写 `FROM executor-base-${PLATFORM_VARIANT} AS platform`，`full` 只是
  `executor-base` 的别名 stage，避免把整段平台阶段复制两份。`PLATFORM_VARIANT` 必须在首个 `FROM`
  之前声明（Docker 只把第一个 `FROM` 之前的 `ARG` 视为可插值进 `FROM`），平台 stage 内再声明一次用于 `RUN` / `LABEL`。
- **叠加层**（`docker/Dockerfile.toolchain`）等价于 full 构建，只多一个 apk 层，用于「已拉取官方镜像 +
  目标仓库需要编译」的场景，不必重跑 Nuxt / CLI 构建。叠加层的 tag **必须与部署用的 `DEPENDFIX_IMAGE` 同名**：
  沙箱镜像解析按平台镜像名推导同 registry 仓库，换成自定义名会让推导失效（解析顺序见
  [executor-sandbox-implementation.md §7.2](./executor-sandbox-implementation.md#_7-2-镜像策略)）。
- **compose 不变**：变体通过 `PLATFORM_VARIANT` 构建参数与镜像 tag 表达，服务契约（端口 / 卷 / env）不变。

## 4. 断言与诊断

| 层 | 机制 | 失败语义 |
|:--|:--|:--|
| 构建期 | `docker/check-toolchain.mjs --variant=${PLATFORM_VARIANT}` | slim 出现任一编译工具 → 构建失败（基底漂移 / 误用 full 基底）；full 缺任一项 → 构建失败 |
| 镜像标签 | `org.opencontainers.image.dependfix.toolchain` | 运维侧 `docker inspect` 判读变体 |
| 冒烟 | `smoke-test.sh` 场景 0b（`SMOKE_EXPECT_TOOLCHAIN`，默认 slim）+ 标签一致性 | CI 推送前拦下变体错配；full 镜像必须显式 `SMOKE_EXPECT_TOOLCHAIN=full` |
| 运行期诊断 | `classifyInstallFailure` 的原生构建提示 | 提示指向 `PLATFORM_VARIANT=full` / `sandbox-full`，而不是只让用户「装工具链」 |

`check-toolchain.mjs` 逐项探测 PATH（busybox `command -v a b c` 只在三项全缺时非零，不能当门禁），
`slim` 与 `full` 两侧都 fail-closed。

## 5. 实测读数（2026-11-26，linux/amd64，本机 Docker 29.7.2）

| 读数组 | 变更前（full 默认） | 变更后（slim 默认） | 差值 |
|:--|:--|:--|:--|
| `docker images` 磁盘占用 | 832 MB | 408 MB | −424 MB（−51%） |
| `docker image inspect .Size` | 207,292,005 B（207 MB） | 95,811,958 B（96 MB） | −111,480,047 B（−54%） |
| `python3` / `make` / `g++` | 三项存在 | 三项不存在 | `[toolchain] variant=slim python3:absent make:absent g++:absent` |
| full 变体（`PLATFORM_VARIANT=full`） | — | 832 MB / 207,343,202 B | 与变更前等价（+51 KB 含断言脚本、label 与层元数据差异） |
| 构建耗时（warm cache，含 Nuxt / CLI 缓存） | 未单独测（历史构建按同日量级） | 4m42s（slim）/ 3m00s（full） | — |

变更前读数取自 2026-11-23 由同一 Dockerfile 构建的本地镜像 `dependfix-smoke:real`（当时的默认 target 即 full）。

**体积基线（显式，代替构建期体积门禁）**：slim 交付基线 = `docker images` 408 MB / `docker image inspect .Size` 95,811,958 B；
full 变体 = 832 MB / 207,343,202 B。基线漂移 > 10%（slim 约 ±40.8 MB / ±9.6 MB；full 约 ±83 MB / ±20.7 MB）时须在本节追加新读数并说明来源（新增 apk 包、
基础镜像抬升、`.output` 体积变化），否则视为未登记的体积回归。读数命令：
<span v-pre>`docker images <镜像> --format '{{.Size}}'`</span> 与 <span v-pre>`docker image inspect <镜像> --format '{{.Size}}'`</span>。

**行为 A/B（同一镜像内 `npm_config_build_from_source=true pnpm add better-sqlite3@13.2.0`，强制走源码编译）**：

| 变体 | 结果 |
|:--|:--|
| slim | `gyp ERR! find Python … Could not find any Python installation to use` → `classifyInstallFailure` 输出含 `PLATFORM_VARIANT=full` 的可读提示 |
| full | `gyp info find Python` → 编译通过 → `node -e 'new Database(":memory:")'` 输出 `SQLITE_OK 3.54.1` |
| 叠加层（`Dockerfile.toolchain` 叠 slim） | `[toolchain] variant=full python3:present make:present g++:present` |

> 12.2.0 及更早的 better-sqlite3 在 Node 26 下**源码编译本身**就失败（V8 移除 `Object::GetPrototype` 等），
> 与镜像变体无关——排查时先区分「缺工具链」与「上游源码不兼容当前 Node」。

## 6. 回退与边界

- **回退路径**：① 部署侧 `docker compose pull` 拉回官方镜像；② 自建镜像改回 `PLATFORM_VARIANT=full`；
  ③ 恢复旧 Dockerfile（最后一次工具链变更 `957bc58f`，2026-10-18；注意该提交早于 Node 26 基线，恢复后仍须满足
  Dockerfile 顶部的 `--min-line=26` / Node 26.13.1 安全基线门禁）。
- **已知边界**：
  - 编译链不是充分条件——node headers / prebuild 源（`nodejs.org`、GitHub Releases、`~/.cache/node-gyp`）
    仍需可达，部分模块另需 `linux-headers`（当前未装）；
  - 叠加层依赖已发布镜像可拉取；离线环境需先 `docker save` / `load` 官方镜像；
  - 变体只影响**平台容器执行器**的安装面；沙箱执行器的镜像选择仍走 `sandbox` / `sandbox-full` 既有解析。
- **不做什么**：不改 `sandbox-full` 编译能力；不改基础镜像 tag / digest；不引入 QEMU；不改目标仓库验证链语义。

## 7. 验证证据

- **构建期断言**：slim / full 两次构建分别在 `check-toolchain` 处产生预期结论；负例（full 镜像按 slim 期望冒烟）在场景 0b 失败并点名 `python3, make, g++`。
- **冒烟**：`smoke-test.sh` 对 `dependfix-smoke:m68-slim`（默认 slim）与 `m68-full`(`SMOKE_EXPECT_TOOLCHAIN=full`) 均 PASS（首次启动自动建表 / HTTP 200 / 17 表）。
- **单元测试**：`apps/platform/docker/check-toolchain.test.mjs`（变体解析 / 双向判定 / PATH 探测 / 退出码）；`packages/engine/src/fixers/dependency/overrides-io.test.ts` 锁定提示含 `PLATFORM_VARIANT=full`。
- **诊断链**：真实 slim 安装失败日志经 `classifyInstallFailure` 得到指向 full 变体的提示（§5 A/B 表）。
- **叠加层**：`Dockerfile.toolchain` 叠加 slim 后 `--variant=full` 断言通过（§5）。
- **构建缓存**：slim 4m42s / full 3m00s（warm cache，linux/amd64）。
- **CI 可持续验证**：`docker.yml` 的 amd64 腿新增 `executor-base-full` 别名 stage 断言 + `Dockerfile.toolchain` 叠加层
  `--variant=full` 断言（不触发 Nuxt / CLI 构建），删除别名或改坏叠加层即红。
- **AC2 的覆盖范围（等价论证）**：本变体只改变**安装阶段的可执行文件面**，`packages/engine` 的 fix / verify 链
  （验证命令采样、基线判定、交付）没有任何代码改动；A/B 表已证明 full 变体具备源码编译能力（模块编译成功并可加载），
  slim 变体在需要编译时以可读诊断终止而不是静默失败。故「原生模块仓库仍能完成 fix / verify」在 full 变体上成立，
  端到端 fixture 运行留作后续 gated docker 批次（不改变本原子的判定）。
- **AC4 的 configuration 指南**：`PLATFORM_VARIANT` 是**构建参数**而非运行时 env，`docs/guide/configuration.md`
  无运行时键变更；镜像变体的用户面只在部署指南承载。
- **文档预算**：部署指南新增变体小节后进入 `check:doc-size` warning 带（>500 行）。细节继续留本设计稿、指南只留
  指针式说明；把该指南的「运维实测记录（2026-10-31）」历史证据迁出属独立文档治理批次，不在本原子扩大范围。
