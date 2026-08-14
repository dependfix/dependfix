# dependfix 平台容器镜像（控制面 + 容器内执行工具链）
# 参考 momei Dockerfile 四阶段结构：nodejs → builder → minifier → runtime
# - 基础镜像：caomeiyouren/alpine-nodejs（构建，含 node/pnpm/git）+ alpine-nodejs-minimize（运行时，最小化）
# - 缩小阶段：只保留 .output（Nuxt 产物自带完整 node_modules）+ 容器内执行所需的 cli/core dist
# - action.yml 不进容器：它由 GitHub Actions 消费（目标仓库 workflow uses: dependfix/dependfix），
#   平台容器内执行走 DependfixApp 程序化接口（容器内执行器，任务归属见 docs/plan/todo.md §M6）
# 基础镜像固定 digest（可复现构建，避免 :latest 上游漂移）；Node 24.18.1 / pnpm 11.18
FROM caomeiyouren/alpine-nodejs@sha256:6bf6f219ac051adf9b9e66f0e0dbda561649f5828e61d7e205fb2bc09f78e095 AS nodejs

FROM caomeiyouren/alpine-nodejs-minimize@sha256:8e71fdc605788175c649be9da5c27fccb1215f60199aded3827bab376c0060a2 AS runtime

# 阶段一：依赖安装（better-sqlite3 在 alpine 需源码编译，临时装工具链）
FROM nodejs AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ && rm -rf /var/cache/apk/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/skills/package.json packages/skills/package.json
COPY apps/platform/package.json apps/platform/package.json
RUN pnpm install --frozen-lockfile --filter @dependfix/platform... --filter dependfix... --filter @dependfix/core... --filter @dependfix/skills...

# 阶段二：构建（core → engine → cli → platform）
FROM nodejs AS builder
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
    && pnpm --filter @dependfix/platform build

# 阶段三：缩小（只保留运行时必需产物）
FROM nodejs AS docker-minifier
WORKDIR /app
# .output 自带完整 node_modules（含已编译 better-sqlite3），无需复制 node_modules
COPY --from=builder /app/apps/platform/.output ./.output
# 容器内执行器：在容器内运行 DependfixApp 需要 cli/core/engine 构建产物（含 package.json 供依赖解析）
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/core/package.json packages/core/package.json
COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/packages/engine/package.json packages/engine/package.json
COPY --from=builder /app/packages/cli/dist packages/cli/dist
COPY --from=builder /app/packages/cli/package.json packages/cli/package.json

# 阶段四：生产
FROM runtime
ENV NODE_ENV=production
# unzip: B mode result fetch (ActionResultFetcher unzip artifact) needs it
RUN apk add --no-cache unzip && rm -rf /var/cache/apk/*
WORKDIR /app
COPY --from=docker-minifier /app /app
# ── C38 非 root 降权（安全基线 §5.3 执行环境）：执行不可信代码的进程不得以 root 运行 ──
# 运行用户创建（幂等，避免与基础镜像内置用户冲突）；su-exec 供 entrypoint 降权
RUN set -eux; \
    if ! getent passwd dependfix > /dev/null 2>&1; then \
        addgroup -S dependfix && adduser -S -G dependfix -h /home/dependfix dependfix; \
    fi; \
    apk add --no-cache su-exec && rm -rf /var/cache/apk/*
# 数据目录预建 + 授权：命名卷首次挂载继承目录所有权（entrypoint 再幂等 chown，兼容既有 root 卷）
RUN mkdir -p /app/data && chown -R dependfix:dependfix /app/data
# entrypoint：root 启动 → chown 数据目录 → su-exec 降权执行（恶意脚本仅能在非 root 权限下运行）
COPY apps/platform/docker/entrypoint.sh /usr/local/bin/dependfix-entrypoint.sh
RUN chmod +x /usr/local/bin/dependfix-entrypoint.sh
ENV HOME=/home/dependfix
ENTRYPOINT ["/usr/local/bin/dependfix-entrypoint.sh"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
