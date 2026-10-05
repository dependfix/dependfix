# Docker 部署

本文说明如何用 Docker / Docker Compose 自部署 dependfix 管理平台（Nuxt 控制面 + 容器内执行工具链），覆盖首次启动、数据库初始化、权限、升级、备份恢复与故障排查。

> 只想快速跑起来？直接看 [快速开始](#快速开始)。CLI / GitHub Action 的用法见[快速开始](./quick-start.md)。

## 前置要求

- Docker 20.10+ 与 Docker Compose v2（`docker compose` 子命令）
- 至少 1 CPU / 1GB 内存（推荐 2GB+；容器内会执行依赖安装与验证）
- 宿主机端口 `3000`（可用 `PORT` 覆盖）
- 建议使用非 root 的容器运行身份（见[数据卷与权限](#数据卷与权限)）

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
| `QUEUE_ENABLED` | 否 | `auto` | 扫描队列模式：`auto` 自动判定 / `true` 强制异步 / `false` 强制同步 |
| `IN_PROCESS_WORKER` | 否 | `true`（compose 内） | 进程内消费扫描队列（当前阶段单容器的唯一消费者）；见下方说明 |

> ⚠️ **扫描队列的消费者**：`auto`（默认）模式下 Redis 可达**且有消费者**时才走异步（入队立即返回 + 前端轮询），但**必须有消费者**才会真正执行。当前阶段唯一消费者是 **进程内 worker**（compose `IN_PROCESS_WORKER` → 容器 `NUXT_IN_PROCESS_WORKER`，默认 `true`）；独立 worker 进程（多容器）尚未实现。`QUEUE_ENABLED=auto`（默认）在**未启用进程内 worker 时会自动降级同步**（日志出现 `自动模式降级同步`），避免任务入队后无人消费而挂起。若自行编排容器，务必注入 `NUXT_IN_PROCESS_WORKER=true`（或 `NUXT_QUEUE_ENABLED=false` 走同步）。

> ⚠️ **Compose 变量名与容器变量名不同**：`AUTH_SECRET` 经 compose 映射为容器内 `NUXT_AUTH_SECRET`；`REGISTRATION_DISABLED` → `NUXT_REGISTRATION_DISABLED`；`QUEUE_ENABLED` → `NUXT_QUEUE_ENABLED` 等。Nuxt `runtimeConfig` 运行时覆盖只认 `NUXT_` 前缀。
>
> SMTP、OAuth、OIDC、Redis 队列等完整变量见 `apps/platform/.env.example` 与[配置说明](./configuration.md)。

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

## 备份与恢复

- **自动备份**：每次应用启动前，SQLite 快照写入 `/app/data/backups/`（默认保留最近 5 份，`BACKUP_RETENTION_COUNT` 可覆盖）。
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

## 故障排查

| 现象 | 原因 / 处理 |
|:---|:---|
| 启动日志 `no such table: dependfix_*` | 迁移未执行。新版镜像已默认自动迁移；若仍出现，确认未被 `DATABASE_MIGRATIONS_RUN=false` 覆盖，或执行 `./docker/init-db.sh`，并升级到最新镜像 |
| 启动日志 `数据库为空且未开启迁移` | 空库 + 迁移被显式关闭。设 `DATABASE_MIGRATIONS_RUN=true`，或执行 `./docker/init-db.sh`（源码环境 `pnpm db:init`） |
| 容器反复重启 / 权限错误 | `PUID` / `PGID` 与数据卷归属不匹配；设为宿主用户 uid:gid，或让入口自动 chown（默认 root 启动路径） |
| 无法注册首个用户 | `REGISTRATION_DISABLED=true` 且库中无用户；开放注册期完成首个管理员注册后再关闭 |
| 凭据保存报密钥错误 | 未设置 `NUXT_ENCRYPTION_KEY`（32 字节随机值） |
| 登录回调 404 / 重定向异常 | `NUXT_PUBLIC_BETTER_AUTH_URL` 与反代对外地址不一致，或反代未透传 `Host` |
| 队列未生效 | Redis 不可达 / 版本 < 5.0 时自动降级同步；查看日志 `version_too_old` 等提示 |
| 扫描任务一直 `pending` / 批量批次约 30 分钟后失败 `orphan_run`，且日志无执行记录 | 异步队列无消费者：确认容器有 `NUXT_IN_PROCESS_WORKER=true`（compose `IN_PROCESS_WORKER` 默认 true），日志应出现 `IN_PROCESS_WORKER=true，当前进程消费扫描队列`。`auto` 模式下未启用进程内 worker 会自动降级同步（日志 `自动模式降级同步`）；若手动编排容器漏注入该变量，异步任务将无人消费。若显式设了 `QUEUE_ENABLED=true` 则不会自动降级，需配置消费者或改回 `auto` |

数据库自检（源码环境）：`pnpm --filter @dependfix/platform db:doctor`，可输出文件元信息、PRAGMA、各表行数与「数据正常 / 被清空 / schema 从未建立」结论。

## 安全注意

- **不要挂载宿主 `/var/run/docker.sock`**、不要授予容器特权（`privileged`）；执行不可信代码的进程默认非 root。
- `AUTH_SECRET` / `NUXT_ENCRYPTION_KEY` 使用强随机值，勿提交到版本库。
- 公网部署建议置于 HTTPS 反代之后，注册完成后关闭注册。
- 多租户 / owner 模式扫描建议启用 rootless sandbox 执行，详见[快速开始](./quick-start.md)。
