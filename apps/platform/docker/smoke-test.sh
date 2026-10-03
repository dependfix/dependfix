#!/bin/sh
# dependfix 平台镜像可用性冒烟测试（本地与 CI 通用）。
#
# 目的：验证「构建完成的镜像」在**不依赖部署侧 compose 注入 env** 的前提下首次启动即可建表可用，
# 防止「镜像能启动但数据库从未初始化」这类只能靠用户部署才发现的问题。
#
# 用法：
#   # 对已有镜像跑冒烟
#   SMOKE_IMAGE=caomeiyouren/dependfix:latest sh apps/platform/docker/smoke-test.sh
#   # 先本地构建再跑（仓库根执行）
#   SMOKE_BUILD=1 sh apps/platform/docker/smoke-test.sh
#
# 环境变量：
#   SMOKE_IMAGE   被测镜像（默认 dependfix-smoke:local）
#   SMOKE_BUILD   非空且为 1 时先 docker build（默认 0）
#   SMOKE_PORT    宿主探测端口（默认 3999）
#
# 断言：
#   1. 正常启动（不注入 DATABASE_MIGRATIONS_RUN）→ 日志 migrationsRun=true、无 no such table
#   2. GET / = 200 且 GET /api/auth/get-session = 200
#   3. 业务表 = 13（经容器内 better-sqlite3 读取）
#   4. 迁移专用模式（DEPENDFIX_MIGRATIONS_ONLY=true）一次性容器退出码 0 且建表成功
set -eu

IMAGE="${SMOKE_IMAGE:-dependfix-smoke:local}"
PORT="${SMOKE_PORT:-3999}"
BUILD="${SMOKE_BUILD:-0}"
CONTAINER="dependfix-smoke-$$"
DATA_DIR="$(mktemp -d)"
ONESHOT_DIR="$(mktemp -d)"
MIN_TABLES=13

log() { printf '[smoke] %s\n' "$*"; }
fail() { printf '[smoke] FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR" "$ONESHOT_DIR" || true
}
trap cleanup EXIT

count_tables() {
    # $1 = 宿主数据目录；经一次性容器内的 better-sqlite3 读取（与被测镜像同一原生模块）。
    # 以读写方式打开：容器被强杀后可能残留 -wal，需要写权限触发 WAL 恢复才能读到最新 schema。
    docker run --rm -v "$1":/data --entrypoint node "$IMAGE" -e '
const Database = require("/app/.output/server/node_modules/better-sqlite3");
const db = new Database("/data/dependfix.sqlite");
const row = db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type = '"'"'table'"'"' AND name LIKE '"'"'dependfix_%'"'"'").get();
process.stdout.write(String(row.c));
'
}

if [ "$BUILD" = "1" ]; then
    SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
    log "构建镜像 $IMAGE（context=$REPO_ROOT）"
    docker build -f "$REPO_ROOT/apps/platform/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "镜像不存在：$IMAGE（可设 SMOKE_BUILD=1 本地构建）"

# ── 场景 1：正常启动，不注入 DATABASE_MIGRATIONS_RUN（验证镜像级默认）──────────────
log "场景 1：正常启动（不注入 DATABASE_MIGRATIONS_RUN）"
docker run -d --name "$CONTAINER" \
    -e NUXT_AUTH_SECRET=smoke-test-secret \
    -e DATABASE_PATH=/app/data/dependfix.sqlite \
    -v "$DATA_DIR":/app/data \
    -p "127.0.0.1:${PORT}:3000" \
    "$IMAGE" >/dev/null

i=0
until curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { docker logs "$CONTAINER" 2>&1 | tail -40; fail "60s 内未就绪"; }
    if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
        docker logs "$CONTAINER" 2>&1 | tail -40
        fail "容器提前退出"
    fi
    sleep 1
done
log "HTTP 就绪（等待 ${i}s）"

logfile="$(docker logs "$CONTAINER" 2>&1)"
printf '%s\n' "$logfile" | grep -q 'migrationsRun=true' || { printf '%s\n' "$logfile" | tail -40; fail "日志未显示 migrationsRun=true（镜像默认未生效）"; }
if printf '%s\n' "$logfile" | grep -q 'no such table'; then
    printf '%s\n' "$logfile" | tail -40
    fail "日志出现 no such table"
fi

for path in / /api/auth/get-session; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${path}")
    [ "$code" = "200" ] || { docker logs "$CONTAINER" 2>&1 | tail -40; fail "GET ${path} = ${code}（期望 200）"; }
    log "GET ${path} = ${code}"
done

docker rm -f "$CONTAINER" >/dev/null

tables=$(count_tables "$DATA_DIR")
[ "$tables" -ge "$MIN_TABLES" ] || fail "业务表 = ${tables}（期望 ≥ ${MIN_TABLES}）"
log "业务表 = ${tables}"

# ── 场景 2：迁移专用一次性容器 ────────────────────────────────────────────────
log "场景 2：迁移专用模式（DEPENDFIX_MIGRATIONS_ONLY=true）"
docker run --rm \
    -e DEPENDFIX_MIGRATIONS_ONLY=true \
    -e DATABASE_MIGRATIONS_RUN=true \
    -e DATABASE_PATH=/app/data/dependfix.sqlite \
    -v "$ONESHOT_DIR":/app/data \
    "$IMAGE" >/dev/null 2>&1 || fail "迁移专用容器退出码非 0"

oneshot_tables=$(count_tables "$ONESHOT_DIR")
[ "$oneshot_tables" -ge "$MIN_TABLES" ] || fail "迁移专用模式业务表 = ${oneshot_tables}（期望 ≥ ${MIN_TABLES}）"
log "迁移专用模式业务表 = ${oneshot_tables}"

log "PASS：镜像首次启动自动建表可用（$IMAGE）"
