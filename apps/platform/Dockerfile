# dependfix 平台容器镜像（控制面 + 容器内执行工具链）
# 参考 momei / caomei-auth Dockerfile 结构：nodejs → deps → builder → docker-minifier → runtime。
# 基础镜像：官方 node:24.22.1-alpine（含 node）；pnpm 在 nodejs 阶段全局安装，runtime 继承。
# 原自建 caomeiyouren/alpine-nodejs 系列依赖 Alpine 仓库的 `apk add nodejs`，安全补丁滞后，
# 2026-10-22 起临时改用官方镜像止血，收敛计划见下方注释与 docs/plan/todo.md「Node 运行时安全基线升级」。
#
# 体积关键结论（2026-10-02 实证）：Nuxt/Nitro `.output` 自带完整运行时依赖
# （`.output/server/node_modules` 由 Nitro trace 产出，含 better-sqlite3 等原生模块的 musl prebuild），
# 且平台内执行走的 DependfixApp（`@dependfix/engine`）已被 Nitro 打包进 `.output/server/chunks`——
# 故 runtime 只需 `.output`，不再复制根 node_modules / workspace dist（后者曾使镜像膨胀至 ~1.1GB）。
# 容器内执行链路（git clone → pnpm install/audit → DependfixApp）仍完整可用：
# git 走 apk、pnpm 由 nodejs 阶段全局安装继承、engine 由 `.output` 载入。
# action.yml 不进容器：它由 GitHub Actions 消费（目标仓库 workflow uses: dependfix/dependfix），
# 平台容器内执行走 DependfixApp 程序化接口，链路见 docs/design/governance/executor-sandbox.md。
# 基础镜像固定 digest（可复现构建，避免 :latest 上游漂移）；digest 为 manifest list，覆盖 amd64 / arm64。
# 走 Docker Hub（docker.io）而非 ECR Public：同一 digest 在 ECR Public 上间歇 429（10 月 23 日起 4 次，
# 均落在推送前构建步骤），而 docker.yml 在构建前已登录 Docker Hub，认证拉取按账号配额计（未认证
# 100 次/6h 按出口 IP，认证 Personal 200 次/6h）；两仓当前指向同一 manifest list（digest 一致，
# 2026-10-24 实测）。发布镜像只在 CI 构建，故不留可切换服务端的构建参数；本地构建路径
# （`docker-compose.build.yml` / `SMOKE_BUILD=1`）需可达 docker.io 或先配 registry mirror。
# FROM 保持字面 image:tag@digest，便于工具解析（Dependabot docker 生态当前未接入，见 backlog 的
# 运行面漏洞检测候选）；抬升基线时同时改 tag 与 digest。
# 安全基线（2026-10-21 Node.js 安全公告）：运行时必须 >= 24.22.1（24.x 线）。
# 暂用官方 node:24.22.1-alpine：自建 caomeiyouren/alpine-nodejs 走 `apk add nodejs`，而 Alpine
# v3.24 与 edge 此刻仍停在 24.18.1（-r0 / -r5），重建自建镜像拿不到补丁。等 docker-builder
# 改为官方 tarball 并发布 alpine3.24-node24.22 后再评估收敛（用户 2026-10-22 决定暂不迁移）；
# 记录见 docs/plan/todo.md「追加临时待办（不占阶段条目编号）：Node 运行时安全基线升级」。
FROM docker.io/library/node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS nodejs

# pnpm 工具链：钉住当前运行时镜像实际携带的版本（11.18.0），切基底不改变目标仓库的安装语义。
# 先移除官方镜像默认启用的 corepack shim：否则 `pnpm` 会按 packageManager 回源下载 11.17.0，
# 与镜像内钉定的版本不一致，且构建期多一次网络依赖（切换前的基础镜像不含 corepack）。
# --ignore-scripts：全局安装不执行包生命周期脚本，缩小构建期执行面。
# 受限网络可用 `--build-arg NPM_REGISTRY=https://registry.npmmirror.com` 覆盖构建期 registry（默认官方）。
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then \
    case "$NPM_REGISTRY" in \
        https://*[!A-Za-z0-9.:/_-]*) echo "NPM_REGISTRY 含非法字符" >&2; exit 1 ;; \
        https://*) ;; \
        *) echo "NPM_REGISTRY 必须以 https:// 开头" >&2; exit 1 ;; \
    esac; \
    export npm_config_registry="$NPM_REGISTRY" pnpm_config_registry="$NPM_REGISTRY"; \
fi \
    && rm -f /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack \
    && rm -rf /usr/local/lib/node_modules/corepack \
    && npm i -g --ignore-scripts pnpm@11.18.0 \
    && npm cache clean --force \
    && pnpm -v

# 官方镜像自带与运行时完全匹配的编译头（/usr/local/include/node）；显式指给 node-gyp，
# 避免原生模块回退编译时回源 nodejs.org 下载 headers（受限网络下 ETIMEDOUT，构建与目标仓库安装都会中招）。
ENV npm_config_nodedir=/usr/local

# 运行时安全基线断言：低于已修复版本直接 fail build，防止基础镜像 digest 静默回退。
COPY apps/platform/docker/check-node-version.mjs /usr/local/bin/dependfix-check-node-version.mjs
RUN node /usr/local/bin/dependfix-check-node-version.mjs

# 运行时基底：同一 Node 版本，去掉 npm / corepack / yarn 缩小体积与攻击面（pnpm 由上一阶段继承）。
FROM nodejs AS runtime
RUN rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack \
        /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && node /usr/local/bin/dependfix-check-node-version.mjs

# 执行工具链基底：容器执行器与沙箱镜像共用（git clone + 原生模块回退编译）。
# 单源定义避免两镜像工具链漂移；unzip / su-exec 仅平台镜像需要，留在平台阶段。
FROM runtime AS executor-base
ARG APK_MIRROR=
RUN if [ -n "$APK_MIRROR" ]; then \
        case "$APK_MIRROR" in \
        https://*[!A-Za-z0-9.:/_-]*) echo "APK_MIRROR 含非法字符" >&2; exit 1 ;; \
        https://*) ;; \
        *) echo "APK_MIRROR 必须以 https:// 开头" >&2; exit 1 ;; \
        esac; \
        sed -i "s#https://dl-cdn.alpinelinux.org#$APK_MIRROR#" /etc/apk/repositories; \
    fi \
    && apk add --no-cache git python3 make g++ && rm -rf /var/cache/apk/*

# 精简工具链基底（沙箱默认镜像）：只保留 git，不含原生模块源码编译链，镜像显著更小。
# 需要编译回退的仓库改用 `sandbox-full` 变体（或仓库级镜像）。
FROM runtime AS executor-base-slim
ARG APK_MIRROR=
RUN if [ -n "$APK_MIRROR" ]; then \
        case "$APK_MIRROR" in \
        https://*[!A-Za-z0-9.:/_-]*) echo "APK_MIRROR 含非法字符" >&2; exit 1 ;; \
        https://*) ;; \
        *) echo "APK_MIRROR 必须以 https:// 开头" >&2; exit 1 ;; \
        esac; \
        sed -i "s#https://dl-cdn.alpinelinux.org#$APK_MIRROR#" /etc/apk/repositories; \
    fi \
    && apk add --no-cache git && rm -rf /var/cache/apk/*

# 阶段一：依赖安装（better-sqlite3 在 alpine 需源码编译；工具链仅 deps 阶段临时安装，
# runtime 阶段另行保留目标仓库原生模块回退所需的最小工具链）
FROM nodejs AS deps
WORKDIR /app
# 官方镜像默认走 dl-cdn.alpinelinux.org；受限网络（如国内）可用 `--build-arg APK_MIRROR=https://mirrors.aliyun.com` 覆盖。
# 该值只允许 https 且不含 sed 分隔符 / 引号 / 空白，避免构建参数被当作 shell 片段注入。
ARG APK_MIRROR=
RUN if [ -n "$APK_MIRROR" ]; then \
        case "$APK_MIRROR" in \
            https://*[!A-Za-z0-9.:/_-]*) echo "APK_MIRROR 含非法字符" >&2; exit 1 ;; \
            https://*) ;; \
            *) echo "APK_MIRROR 必须以 https:// 开头" >&2; exit 1 ;; \
        esac; \
        sed -i "s#https://dl-cdn.alpinelinux.org#$APK_MIRROR#" /etc/apk/repositories; \
    fi \
    && apk add --no-cache python3 make g++ && rm -rf /var/cache/apk/*
# 受限网络可用 `--build-arg NPM_REGISTRY=https://registry.npmmirror.com` 覆盖构建期 registry（默认官方）。
# 仅在本次 RUN 内 export，不写入镜像 ENV——运行期目标仓库安装仍按其自身 .npmrc / registry 配置。
ARG NPM_REGISTRY=
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/skills/package.json packages/skills/package.json
COPY apps/platform/package.json apps/platform/package.json
RUN if [ -n "$NPM_REGISTRY" ]; then \
    case "$NPM_REGISTRY" in \
        https://*[!A-Za-z0-9.:/_-]*) echo "NPM_REGISTRY 含非法字符" >&2; exit 1 ;; \
        https://*) ;; \
        *) echo "NPM_REGISTRY 必须以 https:// 开头" >&2; exit 1 ;; \
    esac; \
    export npm_config_registry="$NPM_REGISTRY" pnpm_config_registry="$NPM_REGISTRY"; \
fi \
    && pnpm install --frozen-lockfile --filter @dependfix/platform... --filter dependfix... --filter @dependfix/core... --filter @dependfix/skills...

# 阶段二：CLI 构建（core → engine → cli 普通产物 + 沙箱自包含 bundle；不跑 Nuxt 构建）
FROM nodejs AS cli-builder
WORKDIR /app
# 复制 deps 阶段完整目录（含各 workspace 项目内的 node_modules 依赖链接，如 apps/platform/node_modules/@dependfix），
# 仅复制根 node_modules 会导致项目内依赖链接缺失（COPY . . 排除 node_modules，见 .dockerignore）
COPY --from=deps /app .
COPY . .
# pnpm 11 默认 verifyDepsBeforeRun=install：pnpm run 前若检测到 workspace 依赖不完整会自动执行 pnpm install，
# 该子进程在 QEMU 模拟 arm64 下偶发 SIGILL（见 run 31305727667），故在 Docker 构建环境（全局配置）禁用自动安装
RUN pnpm config set verify-deps-before-run=false \
    && pnpm --filter @dependfix/core build \
    && pnpm --filter @dependfix/engine build \
    && pnpm --filter dependfix build \
    && pnpm --filter dependfix build:sandbox

# 阶段二·平台：在 CLI 产物基础上构建 Nuxt（沙箱镜像不依赖本阶段）
FROM cli-builder AS builder
RUN pnpm --filter @dependfix/platform build

# 阶段三：缩小（只保留运行时必需的 Nuxt 产物 + 沙箱自包含 CLI）
FROM nodejs AS docker-minifier
WORKDIR /app
# .output 自带完整 node_modules（Nitro trace + 已编译 better-sqlite3），无需额外复制任何依赖树
COPY --from=builder /app/apps/platform/.output ./.output
# 沙箱自包含入口（bundle + skills 静态目录）：runtime 镜像不再随附 workspace node_modules，
# SandboxExecutor 通过 `node /app/sandbox/bin.mjs` 在独立容器内跑 report-only。
COPY --from=builder /app/packages/cli/sandbox ./sandbox

# 阶段四：沙箱执行镜像（slim）（默认 slim：仅自包含 CLI + git；不含 Nuxt / 平台控制面）
#
# 目标：只跑 `node /app/sandbox/bin.mjs` 的 rootless 沙箱镜像，避免外置 daemon 为沙箱拉取
# 平台运行镜像。构建只依赖 cli-builder（不触发 Nuxt 构建），发布为独立镜像名。
FROM executor-base-slim AS sandbox
ARG BUILD_COMMIT=unknown
ARG BUILD_VERSION=unknown
LABEL org.opencontainers.image.title="dependfix-sandbox" \
    org.opencontainers.image.description="dependfix sandbox executor (slim: self-contained CLI + git)" \
    org.opencontainers.image.revision="${BUILD_COMMIT}" \
    org.opencontainers.image.version="${BUILD_VERSION}"
COPY --from=cli-builder /app/packages/cli/sandbox /app/sandbox
ENV NODE_ENV=production \
    HOME=/tmp \
    PNPM_CONFIG_STORE_DIR=/tmp/pnpm-store \
    DEPENDFIX_SKILLS_DIR=/app/sandbox/skills
RUN SANDBOX_VERSION="$(node /app/sandbox/bin.mjs --version)" \
    && [ -n "$SANDBOX_VERSION" ] && [ "$SANDBOX_VERSION" != "0.0.0-unknown" ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/SKILL.md ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/REFERENCES.md ] \
    && DEPENDFIX_SKILLS_DIR=/app/sandbox/skills node /app/sandbox/bin.mjs skills doctor
WORKDIR /tmp
USER 100:100

# 阶段五：沙箱完整变体（含 python3 / make / g++）：目标仓库原生模块无 prebuild 时使用
FROM executor-base AS sandbox-full
ARG BUILD_COMMIT=unknown
ARG BUILD_VERSION=unknown
LABEL org.opencontainers.image.title="dependfix-sandbox-full" \
    org.opencontainers.image.description="dependfix sandbox executor (full: + native build toolchain)" \
    org.opencontainers.image.revision="${BUILD_COMMIT}" \
    org.opencontainers.image.version="${BUILD_VERSION}"
COPY --from=cli-builder /app/packages/cli/sandbox /app/sandbox
ENV NODE_ENV=production \
    HOME=/tmp \
    PNPM_CONFIG_STORE_DIR=/tmp/pnpm-store \
    DEPENDFIX_SKILLS_DIR=/app/sandbox/skills
RUN SANDBOX_VERSION="$(node /app/sandbox/bin.mjs --version)" \
    && [ -n "$SANDBOX_VERSION" ] && [ "$SANDBOX_VERSION" != "0.0.0-unknown" ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/SKILL.md ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/REFERENCES.md ] \
    && DEPENDFIX_SKILLS_DIR=/app/sandbox/skills node /app/sandbox/bin.mjs skills doctor
WORKDIR /tmp
USER 100:100

# 阶段六：生产（平台镜像，文件最后一个 stage = 默认 target）
FROM executor-base
ENV NODE_ENV=production
# 部署产物版本戳：构建期由 CI `--build-arg BUILD_COMMIT/BUILD_VERSION` 注入（commit / 版本），
# 未注入时缺省 unknown（不阻断启动）；运行时经 NUXT_ 前缀覆盖 runtimeConfig.buildVersion/buildCommit，
# 供 GET /api/health 与启动日志核对运行态产物。口径见 docs/standards/platform.md §10.7。
ARG BUILD_COMMIT=unknown
ARG BUILD_VERSION=unknown
ENV NUXT_BUILD_COMMIT=${BUILD_COMMIT} \
    NUXT_BUILD_VERSION=${BUILD_VERSION}
# 首次启动自动执行 pending migration（镜像级默认，不依赖部署侧 compose 是否注入 env）：
# 基线迁移 CreateInitialSchema 建全部业务表，迁移幂等；直接 docker run 或用旧版 compose 也能自建 schema。
# 需完全手动控制时用 -e DATABASE_MIGRATIONS_RUN=false 覆盖（再用 docker/init-db.sh 初始化）。
ENV DATABASE_MIGRATIONS_RUN=true
# pnpm store 持久化由入口脚本派生（默认 $DATA_DIR/pnpm-store，可经 PNPM_CONFIG_STORE_DIR 覆盖），
# 不在此固化 ENV：DATA_DIR 被覆盖时入口能跟着走，而固化值会与自定义数据目录脱节。
# 口径见 docs/standards/platform.md §10.8 与 docs/guide/deployment.md「pnpm store 与依赖缓存」。
# pnpm：继承 nodejs 阶段的全局安装（`npm i -g --ignore-scripts pnpm@11.18.0`），无需再从 docker-minifier 拷贝。
# 与 package.json packageManager 声明（pnpm@11.17.0）的 minor 差异由 toolchainPnpmVersion 验证链处理。
# pnpm 为自包含 npm 全局包结构。
WORKDIR /app
COPY --from=docker-minifier /app /app
# 非 root 降权（安全基线 docs/standards/security.md §5.3 执行环境）：执行不可信代码的进程不得以 root 运行
# 运行用户创建（幂等，避免与基础镜像内置用户冲突）；su-exec 供 entrypoint 降权
RUN set -eux; \
    if ! getent passwd dependfix > /dev/null 2>&1; then \
        addgroup -S dependfix && adduser -S -G dependfix -h /home/dependfix dependfix; \
    fi; \
    # unzip：B mode result fetch（ActionResultFetcher 解压 artifact）；与 su-exec 同层
    apk add --no-cache unzip su-exec && rm -rf /var/cache/apk/*
# 数据目录预建 + 授权：命名卷首次挂载继承目录所有权（entrypoint 再幂等 chown，兼容既有 root 卷）
RUN mkdir -p /app/data && chown -R dependfix:dependfix /app/data
# entrypoint：root 启动 → chown 数据目录 → su-exec 降权执行（恶意脚本仅能在非 root 权限下运行）
COPY apps/platform/docker/entrypoint.sh /usr/local/bin/dependfix-entrypoint.sh
RUN chmod +x /usr/local/bin/dependfix-entrypoint.sh
ENV HOME=/home/dependfix
# 沙箱自包含入口自检（构建期 fail-closed）：无 workspace node_modules 时版本可解析、skills 目录完整
RUN SANDBOX_VERSION="$(node /app/sandbox/bin.mjs --version)" \
    && [ -n "$SANDBOX_VERSION" ] && [ "$SANDBOX_VERSION" != "0.0.0-unknown" ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/SKILL.md ] \
    && [ -s /app/sandbox/skills/dependfix-remediator/REFERENCES.md ] \
    && DEPENDFIX_SKILLS_DIR=/app/sandbox/skills node /app/sandbox/bin.mjs skills doctor
ENTRYPOINT ["/usr/local/bin/dependfix-entrypoint.sh"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

