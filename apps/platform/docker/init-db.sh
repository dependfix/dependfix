#!/bin/sh
# dependfix 平台数据库一键初始化（一次性容器执行迁移后退出，可安全重复执行）。
#
# 用法（任意位置执行；脚本自动切到 apps/platform 的 compose 目录）：
#   ./docker/init-db.sh
#   DEPENDFIX_USE_LOCAL_BUILD=1 ./docker/init-db.sh   # 使用本地构建镜像（docker-compose.build.yml）
#
# 说明：
# - 常规启动时 compose 默认 `DATABASE_MIGRATIONS_RUN=true` 会自动迁移，通常无需本脚本；
# - 本脚本用于：① 显式关闭了自动迁移的部署；② 想在正式启动前单独完成建库；③ 排查初始化问题；
# - 通过 `DEPENDFIX_MIGRATIONS_ONLY=true` 让应用初始化数据库后立即退出（成功 0 / 失败 1）；
# - `--no-deps`：初始化只依赖数据库卷，不启动 redis。
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$COMPOSE_DIR"

COMPOSE_FILES="-f docker-compose.yml"
if [ "${DEPENDFIX_USE_LOCAL_BUILD:-0}" = "1" ]; then
    COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.build.yml"
fi

echo "[init-db] 使用一次性容器初始化数据库（迁移完成后退出）..."
# COMPOSE_FILES 需要按空格分词传给 docker compose（shellcheck 误报）
# shellcheck disable=SC2086
exec docker compose $COMPOSE_FILES run --rm --no-deps \
    -e DATABASE_MIGRATIONS_RUN=true \
    -e DEPENDFIX_MIGRATIONS_ONLY=true \
    platform
