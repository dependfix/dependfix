# Docker 部署

本文说明如何用 Docker / Docker Compose 自部署 dependfix 管理平台（Nuxt 控制面 + 容器内执行工具链），覆盖首次启动、数据库初始化、权限、升级、备份恢复与故障排查。

> 只想快速跑起来？直接看 [快速开始](#快速开始)。CLI / GitHub Action 的用法见[快速开始](./quick-start.md)。

## 前置要求

- Docker 20.10+ 与 Docker Compose v2（`docker compose` 子命令）
- **控制面最低**：1 CPU / 1 GB（仅 UI / API，不执行安装）
- **执行面建议**：≥ 2 CPU / **8 GB**（默认单容器会执行 clone / 依赖安装 / 验证；4 GB 已验证会 OOM）
- 宿主机端口 `3000`（可用 `PORT` 覆盖）
- 建议使用非 root 的容器运行身份（见[数据卷与权限](#数据卷与权限)）

## 资源规格

dependfix 默认把控制面（Nuxt / 队列生产）与执行面（引擎 clone / 安装 / 验证）放在同一容器内，二者内存口径不同：

| 角色 | 最低 | 建议 | 说明 |
|:---|:---|:---|:---|
| 控制面（仅 UI / API） | 1 CPU / 1 GB | 2 CPU / 2 GB | 不执行安装；适用于 worker 已拆到独立主机 |
| 执行面（单容器默认） | 2 CPU / **8 GB** | 4 CPU / 16 GB（大仓） | 单次安装常驻约 1 GB；4 GB 已验证会 OOM |

启动日志会打印检测到的内存上限与队列并发（HTTP / worker 两个进程各一行）：

```text
[resource] role=worker plane=execution memoryLimit=4.0 GiB source=cgroup-v2 hostTotal=16.0 GiB concurrency=1 recommended=8.0 GiB status=low
```

`status=low` 时仅 `warn`，不阻断启动。**例外**：Redis 不可用 / 入队失败时 HTTP 进程会降级为同步执行，此时它也会跑安装 / 验证，必须按执行面 8 GB 准备（启动探测无法预知该运行时降级）。需要资源隔离时，按 compose 内预留的 `worker` 段把 worker 拆到独立容器 / 主机（要求 PostgreSQL 等多写数据库；SQLite 不推荐跨主机）。硬上限请用容器 `mem_limit` / 编排资源限制，不要在命令上注入 Node 堆大小。

运行详情会展示 `memory_max_bytes` / `peak_rss_bytes` / `oom_killed`；不可采集时为 `NULL`，原因记录在 `resource_json.degradedReason`。宿主级 OOM（未设容器内存限制）不保证被 cgroup `oom_kill` 捕获，需结合 `journalctl -k`。

## 快速开始

```bash
cd apps/platform

# 1. （推荐）创建 .env，至少设置强随机 AUTH_SECRET
cp .env.example .env
# 编辑 .env：AUTH_SECRET / NUXT_ENCRYPTION_KEY 使用强随机值
#   openssl rand -base64 32

# 2. 拉取镜像并启动
docker compose pull
docker compose up -d

# 3. 查看日志确认数据库初始化完成
docker compose logs -f platform
```

浏览器访问 `http://<host>:3000`，首个用户可注册为管理员（`REGISTRATION_DISABLED` 默认 `false`；注册完成后建议设为 `true`）。

**首次启动会自动建表**：镜像内置 `DATABASE_MIGRATIONS_RUN=true`（不依赖 compose 是否注入），应用启动时执行 pending migration（全新库由基线迁移创建全部业务表），无需手动初始化。日志中应出现 `[database] 启动期初始化完成`。

> ⚠️ **请使用与本版本匹配的 `apps/platform/docker-compose.yml`**。即使使用旧版 compose（未注入 `DATABASE_MIGRATIONS_RUN`）或直接 `docker run`，镜像也会自动建表；但旧 compose 可能缺少 `PUID`/`PGID`、`NUXT_REDIS_URL` 等其他变量。若你曾用旧 compose 启动过空库导致 `no such table`，升级镜像后重建容器即可自动补建表。

## 镜像与版本

| 项 | 默认 | 说明 |
|:---|:---|:---|
| 镜像 | `caomeiyouren/dependfix:latest` | 用 `DEPENDFIX_IMAGE` 覆盖（如 `ghcr.io/dependfix/dependfix:latest` 或固定版本 tag） |
| 本地构建 | `caomeiyouren/dependfix:local` | 叠加 `docker-compose.build.yml` 覆盖文件 |
| 数据卷 | `dependfix-data` / `dependfix-redis`（逻辑名） | 命名卷；**实际卷名为 `<compose 项目名>_<逻辑名>`**（在 `apps/platform` 下执行 compose 时项目名 = `platform`，即 `platform_dependfix-data`，可用 `docker volume ls` 确认）；删除即清空数据 |

```bash
# 指定镜像 / 版本
DEPENDFIX_IMAGE=caomeiyouren/dependfix:v0.3.0 docker compose up -d

# 本地源码构建
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

> **镜像通道定位**：GHCR / Docker Hub 提供双架构 manifest（amd64 + arm64），是推荐主通道（**GHCR 包为私有，需 `read:packages` 令牌登录；匿名拉取用 Docker Hub**）；**阿里云 ACR 个人版定位为 amd64 备份通道**——按 tag 行为依推送路径而变（0.5.0 在 amd64 主机只取到 amd64；1.0.0 起 registry 回读为双平台 index，但 arm64 主机实际拉取未实测），故不作 arm64 运行证据。口径见[发布管线设计 §4.7](../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5)。

> 本地源码构建会从 Docker Hub 拉取基础镜像（`docker.io/library/node:24.22.1-alpine`，digest 固定）；受限网络需先配置 registry mirror 或代理，否则会卡在 `failed to resolve source metadata`。

> 可用仓库内脚本对任意镜像做「首次启动可用性」自检（验证自动建表 + HTTP 200 + 13 张业务表）：
>
> ```bash
> SMOKE_IMAGE=caomeiyouren/dependfix:latest sh apps/platform/docker/smoke-test.sh
> ```

## 环境变量

Compose 从 `apps/platform/.env` 读取变量并注入容器。核心项：

| 变量 | 必填 | 默认 | 说明 |
|:---|:---:|:---|:---|
| `AUTH_SECRET` | ✅ | `change-me-to-a-random-secret` | better-auth 会话签名密钥；生产必须设为强随机值 |
| `NUXT_ENCRYPTION_KEY` | ✅（用凭据管理时） | 空 | 凭据 AES-256-GCM 加密密钥（32 字节随机值）；留空禁用凭据功能 |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | 建议 | `http://localhost:3000` | 对外访问地址；反向代理 / HTTPS 场景必填 |
| `REGISTRATION_DISABLED` | 建议 | `false` | 首个管理员注册完成后设为 `true` |
| `PORT` | 否 | `3000` | 宿主机映射端口 |
| `PUID` / `PGID` | 否 | `100` / `101` | 容器运行身份（见下节） |
| `DATABASE_MIGRATIONS_RUN` | 否 | `true`（镜像内默认） | 启动时自动执行迁移；设 `false` 改为手动初始化（再用 `docker/init-db.sh`） |
| `DATABASE_PATH` | 否 | `/app/data/dependfix.sqlite` | SQLite 文件路径（在数据卷内） |
| `QUEUE_WORKER` | 否 | `1`（compose 内） | 队列执行进程隔离：`1` 启动独立 worker 进程消费队列、HTTP 进程不消费（HTTP event loop 不再被扫描执行阻塞）；`0` 回退单进程形态 |
| `QUEUE_ENABLED` | 否 | `true`（compose 内） | 扫描队列模式：`auto` 自动判定 / `true` 强制异步 / `false` 强制同步 |
| `IN_PROCESS_WORKER` | 否 | `true`（compose 内） | 单进程形态（`QUEUE_WORKER=0`）下进程内消费扫描队列；见下方说明 |

> ⚠️ **扫描队列的消费者**：异步队列（入队立即返回 + 前端轮询）**必须有消费者**才会真正执行。容器部署默认由入口启动**独立 worker 进程**消费队列（compose `QUEUE_WORKER=1` → 容器 `DEPENDFIX_QUEUE_WORKER=1`）——扫描执行（含引擎同步子进程调用）在 worker 进程，**HTTP 进程 event loop 不被阻塞**，消除 BullMQ 锁续期失败（`could not renew lock` → stalled 重排）。设 `QUEUE_WORKER=0` 回退**单进程形态**，此时由进程内 worker 消费（compose `IN_PROCESS_WORKER` → 容器 `NUXT_IN_PROCESS_WORKER`，默认 `true`）。若自行编排容器（不经入口脚本），务必注入 `NUXT_IN_PROCESS_WORKER=true`（或 `NUXT_QUEUE_ENABLED=false` 走同步），否则异步任务无人消费而挂起；`auto` 模式下未启用进程内 worker 会自动降级同步（日志 `自动模式降级同步`）。入口同时按进程注入角色 `DEPENDFIX_ROLE`（worker 子进程 `worker` / HTTP 主进程 `server`；单进程形态归一化为 `server`），worker 侧据此跳过 HTTP-only 插件（周期清理 / 版本戳）——日志中可见 `跳过 HTTP-only 插件`。**worker 崩溃自愈**：连续快速失败超上限（5 次）后入口转为慢重试（`DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS`，缺省 300s），不再永久停止重启——`stale-cleanup` 只能改 DB，不能消费队列。宿主机重启 / 容器停止后遗留的任务由 `stale-cleanup` 收敛：`running` 在「执行超时 + 5 分钟宽限」后、`pending` 在「创建 + 5 分钟宽限」后（无消费者分支额外要求 job 年龄 ≥ 10 分钟）判 `orphan_run`，并释放 BullMQ 去重键，避免新触发被 `SCAN_PENDING_MERGED` 永久合并；完整口径见 [设计稿 §9](../design/governance/executor-process-isolation.md#_9-队列执行进程隔离-运行时形态) 与 [队列僵尸任务终结与去重键释放设计](../design/governance/queue-stale-recovery.md)。

> ⚠️ **Compose 变量名与容器变量名不同**：`AUTH_SECRET` 经 compose 映射为容器内 `NUXT_AUTH_SECRET`；`REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`；`QUEUE_ENABLED` → `NUXT_QUEUE_ENABLED` 等。Nuxt `runtimeConfig` 运行时覆盖只认 `NUXT_` 前缀。
>
> SMTP、OAuth、OIDC、Redis 队列等完整变量见 `apps/platform/.env.full.example`（完整分节）与[配置说明 → 平台配置](./configuration.md#平台配置-apps-platform)。

## 数据卷与权限

- `dependfix-data:/app/data`：SQLite 数据库 + 启动期自动备份（`/app/data/backups`）
- `dependfix-redis:/data`：BullMQ 队列存储（Redis 仅平台内部访问，不映射宿主机端口）

容器默认以镜像内 `dependfix` 用户（uid 100 / gid 101）**非 root** 运行；入口脚本以 root 启动后修复数据卷与 `$HOME` 归属，再降权执行。NAS / 多用户场景用 `PUID` / `PGID` 对齐宿主用户：

```bash
# .env
PUID=1000
PGID=1000
```

- `PUID=0` / `PGID=0`（或非数字、超范围值）会被入口 **fail-closed 拒绝启动**（保持非 root 基线）。
- 若改用 compose `user:` 字段以非 root 启动，入口无法再 `chown`，需宿主预先授权数据卷与 `$HOME` 写权限。

## pnpm store 与依赖缓存

目标仓库的依赖安装由容器内 pnpm 执行，其 store（content-addressable 缓存）默认落在 `$HOME/.local/share/pnpm/store`——容器重建即丢失，每次运行都要从零下载。入口脚本默认把 store 固定到数据卷：

| 项 | 默认 | 说明 |
|:---|:---|:---|
| store 目录 | `/app/data/pnpm-store` | 入口注入 `PNPM_CONFIG_STORE_DIR`，启动日志输出 `[entrypoint] pnpm store: …` |
| 复用范围 | 跨 run / 容器重建 | 目录位于 `dependfix-data` 卷内；删除卷即清空 |
| 硬链接 | 同卷生效 | `RUN_WORK_ROOT` 默认 `/app/data/runs`，与 store 同卷 → 安装走硬链接（不占双份磁盘）；自定义到其他文件系统会退化为复制 |

核对与清理：

```bash
# 确认 store 落在持久目录（输出形如 /app/data/pnpm-store/v11）
docker compose exec -u 100:101 platform pnpm store path
# 仅删除无引用条目（保留仍在使用的包）
docker compose exec -u 100:101 platform pnpm store prune
# 彻底清空（下一次运行冷安装）
docker compose exec -u 100:101 platform rm -rf /app/data/pnpm-store
```

> `100:101` 为镜像内 `dependfix` 默认身份；自定义 `PUID`/`PGID` 时换成对应值（否则会以 root 身份写入 store）。

- **不可用即回退**：store 目录无法创建、非绝对路径，或运行身份写入探针失败（只读挂载 / 权限不足）时，入口打印 `warn: pnpm store 目录 … 回退 pnpm 默认位置` 并继续启动（每次运行冷安装，不阻断服务）。判定用真实写入探针而非 `test -w`，因此只读卷上已存在的 store 目录也能被识别。
- **自定义路径**：父目录必须对运行身份可进入（挂载点预先 `chown` 到 `PUID:PGID`）；入口**以运行身份**创建 store 目录，不对用户指定的路径做 `chown`（根路径直接拒绝并回退），父目录未授权时目录创建失败即回退。
- **优先级**：pnpm 11+ 的 `storeDir` 只从命令行 / 环境变量 / `pnpm-workspace.yaml` / 全局配置读取（项目 `.npmrc` 只作用于认证与 registry），环境变量优先级最高——平台因此固定缓存位置，目标仓库在 `pnpm-workspace.yaml` 声明的 `storeDir` 不再生效（缓存位置属执行环境基础设施）。`pnpm store path` 的返回值带版本后缀（如 `/app/data/pnpm-store/v11`）。
- **容量建议（经验值）**：store 随目标仓库依赖数量增长，中等规模仓库通常约 0.5-1.5 GB / 个；与数据库 / 备份共用 `dependfix-data` 卷，建议先预留 10 GB 并观察 `docker system df -v`，再按仓库数量调整。定期 `pnpm store prune` 清理无引用条目。
- **备份注意**：卷级备份（下方「备份与恢复」的 tar 示例）会连同 store 一起打包；只需数据库时给 tar 加 `--exclude=./pnpm-store`。
- **提交卫生**：安装产物不会进入交付提交——`fix` / `fix-and-pr`（且非 dry-run）运行开始时，引擎把 `.pnpm-store/` 与 `node_modules/` 写入目标仓库的 `.git/info/exclude`（幂等，不修改目标仓库的 `.gitignore`），交付提交本身按白名单与 fixer 声明路径收集（安装产物不在集合内，见 [pr-delivery-closure §7](../design/governance/pr-delivery-closure.md#_7-m48-4-提交面白名单与-yaml-定点编辑)），排除条目另外保证它们不污染「无变更」判定；写入失败会 warn 但继续运行。

## 日志文件

平台**进程级日志**（启动行、队列模式、执行器 clone / 失败、通知投递）统一写数据卷，容器重建后仍可按日期检索；单次 run 的引擎日志仍存 `ScanRun.logsJson`（运行详情可下载），**不重复写文件**。

| 项 | 默认 | 说明 |
|:---|:---|:---|
| 目录 | `/app/data/logs` | 入口默认 `LOG_DIR=$DATA_DIR/logs` 并导出；自定义 `DATA_DIR` 自动跟随 |
| 主日志 | `YYYY-MM-DD.log` | 级别由 `LOG_LEVEL` 控制（默认 `info`），按日轮转、单文件 20 MB 上限 |
| 错误日志 | `YYYY-MM-DD.errors.log` | 仅 `error` 级（含致命错误），单独留档便于告警 |
| 保留 | 31 天 | 生产构建额外压缩历史文件（`*.gz`） |
| 控制台 | 始终输出 | `docker logs` 行为不变（受同一 `LOG_LEVEL` 过滤；`error` 走 stderr）；文件通道是额外可查面 |

排障命令：

```bash
# 今天的主日志 / 错误日志
docker compose exec -u 100:101 platform sh -c 'tail -n 200 /app/data/logs/$(date +%F).log'
docker compose exec -u 100:101 platform sh -c 'tail -n 100 /app/data/logs/$(date +%F).errors.log'
# 按关键字回溯（当天 / 未压缩；生产 31 天窗口内历史为 .gz）
docker compose exec -u 100:101 platform sh -c 'grep -h "stale-cleanup" /app/data/logs/*.log | tail -n 50'
docker compose exec -u 100:101 platform sh -c 'zcat /app/data/logs/*.log.gz 2>/dev/null | grep "stale-cleanup" | tail -n 50'
# 宿主机直接看（命名卷名 = <compose 项目名>_dependfix-data，默认项目名为 platform）
docker run --rm -v platform_dependfix-data:/data alpine ls -la /data/logs
```

- **进程角色**：容器默认双进程（HTTP + 队列 worker）共享同一日志目录，启动行带 `role=server|worker`（`[logger] files=/app/data/logs level=info role=worker`）；轮转记账文件按角色隔离（`.server-*.json` / `.worker-*.json`），避免两进程共写同一份 audit JSON。
- **自定义目录**：`LOG_DIR=/srv/logs`（建议绝对路径；相对路径按平台进程 cwd `/app` 解析）。入口以运行身份创建目录，不对自定义路径 `chown`——挂载点需预先授权给 `PUID:PGID`。
- **不可写即回退**：目录创建或写探针失败（只读挂载 / 权限不足）时，日志模块 warn 后**只保留控制台输出**，不阻断启动。`LOG_DIR` 不要指向 `/proc` / `/sys`（伪文件系统上递归建目录会阻塞，模块会直接禁用文件通道并 warn）。
- **致命错误**：未捕获异常 / 未处理的 Promise 拒绝会同步写入 `YYYY-MM-DD.errors.log`（`[fatal] …` 行）后退出进程，容器按重启策略恢复；HTTP 与 worker 都装了该钩子。
- **关闭文件日志**：`LOGFILES=false`（仅 `docker logs`）。入口仍会预建空日志目录（不写入内容）；日志量偏大时优先 `LOG_LEVEL=warn`，而不是关闭文件通道——注意启动行本身是 `info`，调到 `warn` 后控制台与文件都看不到启动行。

## 数据库初始化

### 自动（默认，推荐）

`DATABASE_MIGRATIONS_RUN=true` 时，应用启动阶段自动执行 pending migration：

- **全新空库**：基线迁移按实体元数据创建全部业务表 / 索引 / 外键（前缀感知、跨方言）。
- **存量库**：仅补 pending；已记录的迁移不会重跑，基线对已存在的表幂等跳过。

### 手动一键初始化

需要完全手动控制（如先用独立步骤建库）时：

```bash
# 方式 A：关闭自动迁移，再执行一次性初始化容器
#   在 .env 设 DATABASE_MIGRATIONS_RUN=false
cd apps/platform
./docker/init-db.sh
# 本地构建镜像加 DEPENDFIX_USE_LOCAL_BUILD=1

# 方式 B：源码环境（需 pnpm + Node）
pnpm --filter @dependfix/platform db:init
```

`db:init` 幂等：全新库建全表并打印业务表数量；存量库仅补 pending（无待执行时提示「schema 已是最新」）。

### 查看 / 回退 / 自检（源码环境）

```bash
cd apps/platform
pnpm db:migrate:show            # 只读查看 executed / pending（不写库）
pnpm db:migrate                 # 执行全部 pending
pnpm db:migrate:revert -- --yes # 回退最近一次（双门控）
pnpm db:doctor                  # 数据库自检（文件 / PRAGMA / 各表行数 / 结论）
```

> 运行期镜像（`.output`-only）不含 `tsx` 与运维脚本，容器内无法直接跑上述命令；容器场景用 `./docker/init-db.sh` 或 `pnpm db:doctor`（源码环境）。运维脚本详述见 [`server/database/scripts/README.md`](../../apps/platform/server/database/scripts/README.md)。

## schema 漂移恢复清单（`no such column`）

适用现象：页面 / 接口报 `Server Error`，服务端日志出现 `SQLITE_ERROR: no such column: <表>.<列>`（PostgreSQL / MySQL 为对应缺列错误），且缺的列属于近期版本新增列。

根因：运行代码的实体已声明该列，但数据库仍是旧 schema——**pending migration 没有执行**（`DATABASE_MIGRATIONS_RUN` 未开启 / 被部署配置覆盖 / 库从旧备份恢复）。这类漂移是静默累积的：全新库、CI、单测（`synchronize=true`）全部为绿，只有存量库在首次查询到缺列的表时才 500。

可观测信号：启动日志 `[database] schema 漂移：缺 N 张表 / M 列（列：…）`；`GET /api/health` 的 `schema` 字段为 `drift`（`unknown` = 检测未完成 / 被跳过）。

> **先取证再动手**：迁移会写库。禁止在未确认状态时反复重启，也不要手工 `ALTER TABLE` 只补报错的那一列——迁移链通常有多条 pending，补一列只会让下一个缺列继续 500。

- [ ] **1. 确认产物与开关**

    ```bash
    curl -sS https://<host>/api/health           # commit 应对得上本次发布；schema=ok|drift|unknown
    docker compose logs platform | grep -E '\[build\]|\[database\]'
    docker compose exec platform env | grep -E 'DATABASE_(MIGRATIONS_RUN|SYNCHRONIZE|PATH|ENTITY_PREFIX)'
    ```

    判读：`migrationsRun=false` + 缺列 → 本清单场景；`migrationsRun=true` 仍缺列 → 先找 `[database] initialization failed`（迁移执行失败），按日志报错处理，不要直接改库。

- [ ] **2. 只读核对 pending 与缺列**（运行期镜像无 `sqlite3` CLI，用镜像自带的 better-sqlite3）

    ```bash
    docker compose exec -T platform node -e '
    const Database = require("/app/.output/server/node_modules/better-sqlite3");
    const db = new Database(process.env.DATABASE_PATH || "/app/data/dependfix.sqlite", { readonly: true });
    console.log("migrations:", db.prepare("select name from migrations order by id desc limit 8").all());
    console.log("scan_run:", db.prepare("pragma table_info(dependfix_scan_run)").all().map(c => c.name).join(","));
    console.log("repository:", db.prepare("pragma table_info(dependfix_repository)").all().map(c => c.name).join(","));
    '
    ```

    期望看到 `migrations` 中**没有**最近几条（pending），缺列与日志一致。若迁移记录**已存在**但列仍缺失，记下迁移名并走第 4 步异常分支。

    > 容器运行中对 WAL 库只读打开个别环境会报 `SQLITE_BUSY`：先 `docker compose stop platform`，再把上一条查询的 `docker compose exec -T platform` 换成 `docker compose run --rm -T --no-deps -e DEPENDFIX_QUEUE_WORKER=0 platform`（其余参数不变；入口会按 `PUID` / `PGID` 降权，不产生 root 属主文件；关闭 worker 避免一次性容器按双进程形态重复执行）。

- [ ] **3. 停写 → 一次性补迁移 → 启动**

    ```bash
    docker compose stop platform
    cd apps/platform && ./docker/init-db.sh      # 一次性容器：DATABASE_MIGRATIONS_RUN=true + DEPENDFIX_MIGRATIONS_ONLY=true
    docker compose up -d platform
    ```

- [ ] **4. 复核**

    ```bash
    curl -sS https://<host>/api/health           # schema 应为 ok
    docker compose logs platform | grep -E 'schema 漂移|启动期初始化完成'
    ```

    页面复核：运行列表 / 扫描历史汇总 / 仓库详情 / PR Check 恢复正常；`[stale-cleanup] 孤儿清理失败` 不再出现。`schema` 在启动初期可能短暂为 `unknown`（检测随启动异步完成），数秒后重试即可；也可以直接看启动日志有无 `[database] schema 漂移`。

    孤儿运行的收敛时机：`stale-cleanup` 在启动 30 秒后跑首轮、之后每 5 分钟一轮；`pending` 超过 5 分钟即判孤儿，`running` 需超过执行上限 + 宽限（缺省 30m + 5m）才判失败——事故期间卡住的 `running` 记录会在下一个满足阈值的周期收敛，不是重启即清。

    **异常分支（少见）**：迁移记录已存在但列缺失（库从旧备份恢复 / 曾执行 `db:migrate:revert`）。**停写后**先删除对应 `migrations` 记录，再重跑第 3 步让迁移重放；不要只手工补一列。

    ```bash
    # 把 <迁移名> 换成第 2 步查到的 name（如 AddRepositoryExecutionLimits3000000000000）
    # 服务已 stop，用一次性容器执行（docker compose exec 需要运行中的容器）
    docker compose run --rm -T --no-deps -e DEPENDFIX_QUEUE_WORKER=0 platform node -e '
    const Database = require("/app/.output/server/node_modules/better-sqlite3");
    const db = new Database(process.env.DATABASE_PATH || "/app/data/dependfix.sqlite");
    db.prepare("delete from migrations where name = ?").run("<迁移名>");
    '
    ```

    回退依据：`data/backups/` 的启动期备份或自行复制的数据卷副本。

- [ ] **5. 收口**：确认 `DATABASE_MIGRATIONS_RUN=true` 已固化在部署配置（镜像默认已是 true，重点检查 `.env` / 编排 / PaaS 环境变量是否覆盖成 `false`），否则下次新增列会再次漂移。

## 反向代理与 HTTPS

反代场景需透传 `Host` 头，并把对外地址告知 better-auth：

```bash
# .env
NUXT_PUBLIC_BETTER_AUTH_URL=https://dependfix.example.com
```

OAuth 回调地址由 better-auth 按请求 `Host` 自动构造（如 `${NUXT_PUBLIC_BETTER_AUTH_URL}/api/auth/callback/github`），反代须保证回调 URL 与之一致。

## 升级

```bash
cd apps/platform
docker compose pull
docker compose up -d
```

- 启动时自动补 pending migration；迁移前应用会先把当前 SQLite 快照到 `/app/data/backups`。
- 升级前建议额外备份数据卷（见下节）。
- 固定版本可回滚镜像 tag；数据库迁移回退用 `pnpm db:migrate:revert -- --yes`（源码环境）。
- **沙箱镜像升级说明（2026-11-14 起）**：沙箱默认镜像改为独立发布的 `dependfix-sandbox:<平台版本>`（slim，约 320MB），不再回退 `DEPENDFIX_IMAGE`。默认会**跟随平台镜像 registry** 并依次回退 Docker Hub / ghcr / ACR（ACR 置末；逐源 inspect + 限时 pull），全部不可达才报 `sandbox_image_unavailable`；也可用 `SANDBOX_IMAGE_REPO` 固定单源。需要原生模块源码编译的仓库改用 `dependfix-sandbox-full`。

## 备份与恢复

- **自动备份**：每次应用启动前，SQLite 快照写入 `/app/data/backups/`（默认保留最近 5 份，`BACKUP_RETENTION_COUNT` 可覆盖）。快照走 **SQLite 在线备份**（`db.backup`），因此包含 `-wal` 里尚未 checkpoint 的已提交数据——**不要**用「复制主库文件」替代（WAL 模式下主文件可能只有 4KB 头页，拷出来是空库，见下方实测记录 R3 / R7）。容器双进程形态下备份只由 HTTP 主进程执行（worker 侧跳过）。
- **卷级备份**（推荐跨机器迁移 / 灾备）：

```bash
# 确认实际卷名（默认 <compose 项目名>_dependfix-data；在 apps/platform 下执行时为 platform_dependfix-data）
docker volume ls --format '{{.Name}}' | grep '_dependfix-data$'
VOLUME=platform_dependfix-data

# 备份命名卷为 tar
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/dependfix-data-$(date +%Y%m%d).tgz -C /data .

# 恢复：停止平台 → 清空卷 → 解包 → 启动
docker compose stop platform
docker run --rm -v "$VOLUME":/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/dependfix-data-YYYYMMDD.tgz -C /data'
docker compose start platform
```

> 恢复后若数据库出现异常，删除同目录陈旧的 `-wal` / `-shm` 旁文件，再启动（避免陈旧 WAL 被当作崩溃恢复数据回放）。误操作场景优先用 `/app/data/backups/` 内的快照替换。
>
> `pnpm db:restore` 覆盖前会生成一致性快照（`VACUUM INTO`，含 WAL 未 checkpoint 数据）。**目标库已损坏、无法打开时恢复会中止**：先人工移走损坏的主库与 `-wal` / `-shm`，再带 `--skip-auto-backup` 重试（该轮没有 auto 快照可撤销）。

## 运维实测记录（2026-10-31）

> **目的**：把「文档说可用」变成「实测过」——镜像启动 / 备份恢复 / 迁移前后滚 / 队列重启各留一条可复算证据（1.0 门槛 G7）。被测对象是本地构建的镜像（`BUILD_COMMIT` / `BUILD_VERSION` 注入），原始日志不入库（`artifacts/` 在 `.gitignore`），本页只保留命令与关键输出。实测中发现的两处阻断缺陷已在本批修复，见文末 R7。

### R1 镜像启动与健康检查

```bash
# 构建（本机 npm 官方 registry 不可达时用镜像源；CI 走官方 registry，构建产物等效）
docker build -f apps/platform/Dockerfile -t dependfix-m532:local \
  --build-arg BUILD_COMMIT=05719601 --build-arg BUILD_VERSION=0.4.0 .
# 启动（compose 默认双进程形态：QUEUE_WORKER=1 + QUEUE_ENABLED=true）
docker compose -p m532 --env-file env -f apps/platform/docker-compose.yml \
  -f apps/platform/docker-compose.build.yml up -d
curl -s http://127.0.0.1:3999/api/health
```

- 镜像：`sha256:1f49080f5cf2…` / 811 MB（含 git + python3/make/g++ 工具链；早期 `.output`-only 精简档约 239 MB，不含工具链）
- **构建来源**：被测镜像由「含本轮 F1 / F2 修复的工作区」构建（`BUILD_COMMIT=05719601` 为当时 HEAD，修复随后提交为 `9b3b946d` / `eb4bb49e`）；在干净检出的这些提交上按上述命令重建可复现。本机 npm 官方 registry 不可达，构建期改用镜像源（仅 builder 层 ENV，不进 runtime）；CI 走官方 registry
- `/api/health` → `200 {"version":"0.4.0","commit":"05719601","startedAt":"2026-10-31T12:38:45.894Z"}`
- 首次启动自动建表；库快照 `db:doctor` 输出 **17 张表**（15 张业务表 + `migrations` + `sqlite_sequence`）
- 双进程日志：`[entrypoint] 队列 worker 进程 pid=37` + `[queue] 消费者已就绪（IN_PROCESS_WORKER=true，当前进程消费扫描队列）`

### R2 report-only 扫描（默认双进程形态）

```bash
# 注册管理员 → 建凭据 → 建仓库 → 触发扫描（Origin 头必需，better-auth 校验同源）
curl -X POST .../api/auth/sign-up/email -d '{"email":"…","password":"…","name":"…"}'
curl -X POST .../api/credentials -d '{"name":"ops-drill-pat","type":"classic-pat","token":"<PAT>"}'
curl -X POST .../api/repos -d '{"owner":"dependfix","name":"dependfix","defaultBranch":"master","credentialId":"<id>"}'
curl -X POST .../api/repos/<repoId>/scan -d '{"mode":"report-only","severityThreshold":"high"}'
```

- run `68647e2b00824e3b` → `pending → running → completed`，`exitCode=0`，耗时约 1.7 s，`summary.alertsFound=1`
- 引擎日志：`[dependfix] Fetched 1 alerts for dependfix/dependfix` / `Run dependfix-mvwe1b1p-81ll4f completed { exitCode: 0 }`

### R3 自动备份 → 恢复 → 行数比对

```bash
docker compose stop platform          # 触发下一次启动的备份前，先停库
docker compose start platform         # 启动日志：backup created: /app/data/backups/dependfix.sqlite.<ts>.bak
# 取出快照与活库，恢复到一个新路径，再做三方行数比对
pnpm --filter @dependfix/platform db:restore --from=<bak> --to=/tmp/restored.sqlite --yes
pnpm --filter @dependfix/platform db:doctor --path=<file> --json
```

- 备份产物 **323,584 字节 / 79 页**（修复前同一场景是 4,096 字节空库，见 R7）；`integrity_check: ok`
- 恢复：`[RESTORE] 数据库恢复完成` + `integrity_check: ok`；17 张表
- 三方行数（活库 / 备份 / 恢复后）**逐表一致，差异 0**；关键表 `user=1 credential=2 repository=1 scan_run=1`
- 说明：`db:doctor` 的 `schema_version` 在源库（56）与备份 / 恢复库（1）不同——该值是 SQLite 写入侧的 schema cookie，不进入数据面判据；`page_count`（79）/ `journal_mode`（wal）/ 逐表行数 / `integrity_check` 才是判据

### R4 迁移前滚 → 回退 → 再前滚

```bash
export DATABASE_PATH=/tmp/mig.sqlite
pnpm --filter @dependfix/platform db:migrate:show          # 文件不存在 → 全部待执行（不写库）
pnpm --filter @dependfix/platform db:migrate               # 前滚
pnpm --filter @dependfix/platform db:migrate:revert -- --yes
pnpm --filter @dependfix/platform db:migrate               # 再前滚
```

| 阶段 | `db:migrate:show` 读数 |
|:--|:--|
| 空路径（前滚前） | `数据库文件不存在 … 视为全部迁移待执行`（未创建文件） |
| 前滚后 | `合计 19 条，待执行 0 条` |
| 回退后 | `已回退最近一次迁移：AddRepositoryPrFeedback2900000000002` → `待执行 1 条` |
| 再前滚后 | `本次执行 1 条` → `待执行 0 条` |

### R5 队列重启后 pending 收敛

```bash
# 无消费者对照：QUEUE_WORKER=0 + IN_PROCESS_WORKER=false（QUEUE_ENABLED=true 强制异步）
# 触发扫描 → run 一直 pending，Redis 里 job 停在 bull:scan:prioritized
docker exec <redis> redis-cli zcard bull:scan:prioritized   # 1
# 恢复消费者后重启（IN_PROCESS_WORKER=true 或 QUEUE_WORKER=1）
docker compose up -d
```

- 无消费者：run `68647ea408001f68` 连续 30 s `pending`（6 次轮询），`bull:scan:prioritized=1`
- 重启带消费者：启动 1 s 内 job 被接管 → `startedAt 12:42:01.074Z` / `finishedAt 12:42:02.817Z` → `completed`，`exitCode=0`
- **running 态收敛（执行中被杀）**：`fix` 模式 run `68648bbb3f828d3f` 在 `running` 时 `docker kill` 容器 → 重启后 `stale-cleanup` 在 `startedAt + 64 s`（`EXECUTION_TIMEOUT_MS=60000` + `STALE_CLEANUP_RUNNING_GRACE_MS=2000`，演练时为缩短等待显式调小）判 `failed`，`failureCode=orphan_run` / `failureStage=runtime` / `failureKind=transient`，同轮释放孤儿 job（日志 `释放孤儿队列 job：removed=1 skipped=0/1`）
- 口径与 [队列僵尸任务终结与去重键释放](../design/governance/queue-stale-recovery.md) 一致：无消费者时若超过 2 × `STALE_CLEANUP_PENDING_GRACE_MS` 未恢复，stale-cleanup 会把 pending run 判 `failed`（`orphan_run`）并释放去重键

### R6 发布自动化 dry-run

见[发布指南](release.md)「自动发布启用清单」：`pnpm release:plan` + `pnpm release:version --dry-run` 的实际输出与「不执行 publish / tag / push」的边界说明。**未**启用 `schedule` / `push` 触发。

### R7 实测中修复的两处阻断缺陷

| 编号 | 现象（修复前实测） | 根因 | 修复 |
|:--|:--|:--|:--|
| F1 | 默认双进程部署下所有扫描 run 卡 `pending`，job 停在 `bull:scan:prioritized`，Redis 无 `bull:*` worker 连接 | 队列服务是惰性单例，唯一主动初始化者 `stale-cleanup` 插件按角色在 worker 侧被跳过 → worker 进程从不创建消费者 | 新增 `queue-consumer` 插件（`inProcessWorker=true` 时初始化消费者，失败退出交由入口重启）；设计稿 §9 同步 |
| F2 | 启动备份产物 4,096 字节，`db:doctor` 报 `schema_version=0 / 0 张表`（恢复即空库） | 备份直接 `readFileSync` 主库文件，而应用强制 `journal_mode=wal`——数据可能全在 `-wal` | 备份改走 SQLite 在线备份 API（含 WAL 未 checkpoint 数据），先写 `.tmp` 再 fsync + rename；只由 HTTP 主进程执行 |

> **复现边界**：F1 的双进程形态用 `QUEUE_WORKER=1`（compose 默认）；F2 的关键是「备份时刻 WAL 内有未 checkpoint 数据」——优雅停止后 WAL 可能已清零，故单测用「写连接保持打开」构造该状态（`backup.test.ts`）。

## 故障排查

| 现象 | 原因 / 处理 |
|:---|:---|
| 启动日志 `no such table: dependfix_*` | 迁移未执行。新版镜像已默认自动迁移；若仍出现，确认未被 `DATABASE_MIGRATIONS_RUN=false` 覆盖，或执行 `./docker/init-db.sh`，并升级到最新镜像 |
| 启动日志 `数据库为空且未开启迁移` | 空库 + 迁移被显式关闭。设 `DATABASE_MIGRATIONS_RUN=true`，或执行 `./docker/init-db.sh`（源码环境 `pnpm db:init`） |
| 页面 / 接口 `Server Error`，日志 `no such column: <表>.<列>`，`/api/health` 的 `schema=drift` | 存量库缺列（pending migration 未执行）。按「[schema 漂移恢复清单](#schema-漂移恢复清单-no-such-column)」停写 → `./docker/init-db.sh` → 复核；不要手工只补一列 |
| 容器反复重启 / 权限错误 | `PUID` / `PGID` 与数据卷归属不匹配；设为宿主用户 uid:gid，或让入口自动 chown（默认 root 启动路径） |
| 无法注册首个用户 | `REGISTRATION_DISABLED=true` 且库中无用户；开放注册期完成首个管理员注册后再关闭 |
| 凭据保存报密钥错误 | 未设置 `NUXT_ENCRYPTION_KEY`（32 字节随机值） |
| 登录回调 404 / 重定向异常 | `NUXT_PUBLIC_BETTER_AUTH_URL` 与反代对外地址不一致，或反代未透传 `Host` |
| 队列未生效 | Redis 不可达 / 版本 < 5.0 时自动降级同步；查看日志 `version_too_old` 等提示 |
| 扫描任务一直 `pending` / 批量批次约 30 分钟后失败 `orphan_run`，且日志无执行记录 | 异步队列无消费者：容器部署应看到入口日志 `队列 worker 进程 pid=...`，worker 进程日志出现 `IN_PROCESS_WORKER=true，当前进程消费扫描队列`；单进程形态（`QUEUE_WORKER=0`）应确认容器有 `NUXT_IN_PROCESS_WORKER=true`。若自行编排容器漏注入消费者开关，异步任务将无人消费；显式设 `QUEUE_ENABLED=true` 时不会自动降级，需配置消费者或改回 `auto`。worker 连续失败会转慢重试（日志 `转为慢重试`），可查 `stale-cleanup` 的 `consumers=yes|no|unknown` 判断消费者是否存活。注意：托管 Redis 禁用 `CLIENT LIST` 时 BullMQ 可能返回伪 worker → `consumers=yes` 可能假阳性，需结合 `bull:scan:wait` 堆积判断 |
| 重新触发被提示「已有进行中的扫描任务，本次触发已合并」且长时间不执行 | 旧 job 的 dedupe 键被僵尸任务占用。新版 `stale-cleanup` 会在无消费者 / job 归属终态 run 时清理并释放该键；也可在批次页「强制完成」后重试（会同步释放 job）。仍无法恢复时查 Redis：`llen bull:scan:wait`、`zcard bull:scan:active`、`client list \| grep -c 'bull:'`（Worker 未显式命名时连接名是 `bull:<base64(queue)>`，不含 `:w:`） |

数据库自检（源码环境）：`pnpm --filter @dependfix/platform db:doctor`，可输出文件元信息、PRAGMA、各表行数与「数据正常 / 被清空 / schema 从未建立」结论。

## 安全注意

- **不要挂载宿主 `/var/run/docker.sock`**、不要授予容器特权（`privileged`）；执行不可信代码的进程默认非 root。
- `AUTH_SECRET` / `NUXT_ENCRYPTION_KEY` 使用强随机值，勿提交到版本库。
- 公网部署建议置于 HTTPS 反代之后，注册完成后关闭注册。
- 多租户 / owner 模式扫描可使用 rootless sandbox 执行（仅 `report-only` 真实执行；`fix` / `fix-and-pr` 在出站白名单代理接入前降级到平台容器）。需在宿主启动 rootless Docker daemon，并只把其 unix socket（不是宿主 `/var/run/docker.sock`）挂入平台容器，详见[快速开始](./quick-start.md)。
