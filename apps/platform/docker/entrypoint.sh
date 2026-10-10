#!/bin/sh
# dependfix 平台容器入口：按运行身份修复数据目录 / HOME 所有权后降权执行（非 root 降权）
#
# 权限模型：
# - 默认以镜像内 `dependfix` 用户（uid 100 / gid 101）运行；可用 PUID/PGID 覆盖为宿主机用户，
#   使 /app/data 命名卷或 bind mount 的宿主侧所有权可控（NAS / 多用户场景常用）。
# - 入口以 root 启动 → chown 数据目录 + HOME → su-exec 降权，不写 /etc/passwd，支持任意非 root uid:gid。
# - 非 root 执行基线（安全规范 §5.3）：解析出的 uid/gid 必须落在 1..4294967294（uid_t 有效且非 root），
#   `0` / `00` / 2^32 回绕值等一律 fail-closed 拒绝启动，避免单个环境变量静默关闭降权。
# - chown 作用域收敛：仅允许 /app 与 /home 下的规范化路径，拒绝根路径（含 //、a/../.. 等非规范形态）；
#   特殊挂载点可设 DEPENDFIX_ALLOW_ANY_DIR=1 放开（高级用法，根路径仍硬拒）。
# - 若 compose 直接设置 `user: "uid:gid"`（入口非 root 启动，无法 chown/setuid），则跳过降权直接执行；
#   此时宿主需预先授予卷与 $HOME 写权限。
#
# 场景覆盖：
# - 新卷：镜像构建期已 mkdir + chown /app/data，此处幂等无操作
# - 既有 root 所有卷（升级前以 root 运行的存量部署）：此处 chown 修复所有权
# - chown 失败不阻断启动（如只读卷），但必须输出警告便于排障
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
HOME_DIR="${HOME:-/home/dependfix}"
ALLOW_ANY_DIR="${DEPENDFIX_ALLOW_ANY_DIR:-0}"

# 解析运行身份：PUID/PGID 优先，缺省回退镜像内 dependfix 用户（uid 100 / gid 101）
RUN_USER="${RUN_USER:-dependfix}"
RUN_UID="${PUID:-$(id -u "$RUN_USER" 2>/dev/null || echo 100)}"
RUN_GID="${PGID:-$(id -g "$RUN_USER" 2>/dev/null || echo 101)}"

# 数值 + 范围校验：仅接受 1..4294967294（uid_t 有效且非 root）。
# 用 case 拒绝空串 / 任意非数字字符（含换行、空格、符号）；用 awk 做范围比较（避免 `[ -gt ]` 对超 64 位值报错）；
# 32 位回绕（如 4294967296 → uid 0）在此被拒。
is_valid_id() {
    case "$1" in
        ""|*[!0-9]*) return 1 ;;
    esac
    awk -v n="$1" 'BEGIN { exit !(n >= 1 && n <= 4294967294) }'
}
is_valid_id "$RUN_UID" || { echo "error: invalid PUID '$RUN_UID' (expect integer 1..4294967294, non-root)" >&2; exit 1; }
is_valid_id "$RUN_GID" || { echo "error: invalid PGID '$RUN_GID' (expect integer 1..4294967294, non-root)" >&2; exit 1; }

RUN_IDENTITY="${RUN_UID}:${RUN_GID}"
export HOME="$HOME_DIR"

# 路径校验：拒绝空值 / 字面根；canonicalize 后拒绝等价根（//、/./、a/../..、指向根的符号链接）；
# 父目录不存在时 readlink 返回空亦 fail-closed（叶子缺失时由下方 `[ -d ]` 守卫跳过 chown）。
# 默认 allowlist 仅允许 /app 与 /home 下，收敛 chown -R 作用域。
# 返回规范化路径（canonical），后续 chown 直接使用 canonical，避免符号链接 TOCTOU。
check_dir_path() {
    label="$1"
    dir="$2"
    case "$dir" in
        ""|"/") echo "error: refusing unsafe $label '$dir' (must not be empty or root)" >&2; exit 1 ;;
    esac
    canon="$(readlink -f "$dir" 2>/dev/null || true)"
    # 归一并发斜杠（busybox readlink -f 对 // 可能保留原样），再判根
    canon="$(printf '%s' "$canon" | sed 's#//*#/#g')"
    if [ -z "$canon" ] || [ "$canon" = "/" ]; then
        echo "error: refusing unsafe $label '$dir' (resolves to '$canon'; path must exist)" >&2
        exit 1
    fi
    if [ "$ALLOW_ANY_DIR" != "1" ]; then
        case "$canon" in
            /app/*|/home/*) : ;;
            *) echo "error: refusing chown outside /app or /home: $label '$dir' -> '$canon' (set DEPENDFIX_ALLOW_ANY_DIR=1 to override)" >&2; exit 1 ;;
        esac
    fi
    printf '%s' "$canon"
}

DATA_DIR_CANON="$(check_dir_path DATA_DIR "$DATA_DIR")"
HOME_DIR_CANON="$(check_dir_path HOME "$HOME_DIR")"

# ---- 队列执行进程隔离（独立 worker 进程形态）----
# DEPENDFIX_QUEUE_WORKER=1 时启动双进程形态：
#   worker 进程：NUXT_IN_PROCESS_WORKER=true 消费扫描队列（扫描与引擎同步调用均在此进程）；
#   HTTP 进程：NUXT_IN_PROCESS_WORKER=false 不消费队列，event loop 不再被扫描执行阻塞。
# worker 的 Nitro HTTP 监听收敛到 unix socket（不占端口、不对外暴露），避免与主进程端口冲突；
# 迁移仅由主进程执行（worker 侧 DATABASE_MIGRATIONS_RUN=false），避免两进程迁移竞争。
# worker 由看护循环托管：异常退出后按指数退避自动重启；连续重启超过上限则放弃（HTTP 进程不受影响，
# 队列由 stale-cleanup 兜底）；容器停止（TERM / INT）时终止看护循环与 worker，不再重启。
# 口径见 docs/standards/platform.md §10.6。默认 0 = 单进程形态（行为与既有一致）。
WORKER_ENABLED="${DEPENDFIX_QUEUE_WORKER:-0}"
WORKER_SOCKET="${DEPENDFIX_QUEUE_WORKER_SOCKET:-/tmp/dependfix-queue-worker.sock}"
# worker pid 落文件供父 shell 的信号处理读取（worker 由后台看护子 shell 托管，pid 不跨进程可见）
WORKER_PID_FILE="${WORKER_SOCKET}.pid"
WORKER_BACKOFF_INIT=1     # 首次重启退避（秒），随后指数增长
WORKER_BACKOFF_MAX=30     # 退避上限（秒）；当前上限 5 次下实际最大 16s，保留 30s 上界以便调整上限时仍封顶
WORKER_MAX_RESTARTS=5     # 连续重启上限：超过则停止重启（防重启风暴）
WORKER_STABLE_SECONDS=60  # 运行时长达到该值视为稳定，连续重启计数归零
SUPERVISOR_PID=""
MAIN_PID=""

# 终止看护循环与 worker（幂等，供信号 trap 与主进程退出后清理复用）
# worker pid 来自文件，读取后校验为纯数字再 kill，避免空值 / 多值 / 负数被误解释为信号组
stop_queue_worker() {
    kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
    if [ -f "$WORKER_PID_FILE" ]; then
        worker_pid="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
        case "$worker_pid" in
            ''|*[!0-9]*) : ;;
            *) kill -TERM "$worker_pid" 2>/dev/null || true ;;
        esac
    fi
}

# 队列 worker 看护循环：启动 worker → 等待退出 → 按指数退避重启；连续重启超上限则放弃。
# 运行在后台子 shell，worker 崩溃不影响前台 HTTP 主进程生命周期。
supervise_queue_worker() {
    worker_prefix="$1"; shift
    # 看护自身收 TERM/INT：终止当前 worker 并退出（父 shell 亦经 pid 文件兜底，双保险）
    trap 'kill -TERM "$QUEUE_WORKER_PID" 2>/dev/null || true; exit 0' TERM INT
    restart_count=0
    while :; do
        # shellcheck disable=SC2086
        $worker_prefix env HOME="$HOME_DIR" \
            NUXT_QUEUE_ENABLED=true \
            NUXT_IN_PROCESS_WORKER=true \
            DATABASE_MIGRATIONS_RUN=false \
            NITRO_UNIX_SOCKET="$WORKER_SOCKET" \
            "$@" &
        QUEUE_WORKER_PID=$!
        echo "$QUEUE_WORKER_PID" > "$WORKER_PID_FILE"
        if [ "$restart_count" = "0" ]; then
            echo "[entrypoint] 队列 worker 进程 pid=${QUEUE_WORKER_PID}（socket=${WORKER_SOCKET}）"
        fi

        worker_started="$(date -u +%s)"
        worker_status=0
        # set -e 下 wait 非零会中断子 shell，须用 || 捕获退出码
        wait "$QUEUE_WORKER_PID" || worker_status=$?

        # 运行足够久视为稳定，连续重启计数归零（避免长期运行容器偶发崩溃累积触发上限）
        worker_elapsed=$(( $(date -u +%s) - worker_started ))
        if [ "$worker_elapsed" -ge "$WORKER_STABLE_SECONDS" ]; then
            restart_count=0
        fi
        restart_count=$(( restart_count + 1 ))
        if [ "$restart_count" -gt "$WORKER_MAX_RESTARTS" ]; then
            echo "[entrypoint] 队列 worker 连续重启 ${WORKER_MAX_RESTARTS} 次仍失败（最近退出码 ${worker_status}），停止自动重启；队列由 stale-cleanup 兜底" >&2
            exit 0
        fi

        # 指数退避：INIT * 2^(restart_count-1)，封顶 MAX
        backoff="$WORKER_BACKOFF_INIT"
        step=1
        while [ "$step" -lt "$restart_count" ] && [ "$backoff" -lt "$WORKER_BACKOFF_MAX" ]; do
            backoff=$(( backoff * 2 ))
            step=$(( step + 1 ))
        done
        if [ "$backoff" -gt "$WORKER_BACKOFF_MAX" ]; then
            backoff="$WORKER_BACKOFF_MAX"
        fi
        echo "[entrypoint] 队列 worker 异常退出（exit=${worker_status}），$(date -u +%Y-%m-%dT%H:%M:%SZ) 第 ${restart_count} 次重启，退避 ${backoff}s" >&2
        sleep "$backoff"
    done
}

# 启动平台进程：$1 = 运行前缀（"" 或 "su-exec uid:gid"），其余为命令（容器 CMD）。
run_platform() {
    prefix="$1"; shift

    if [ "$WORKER_ENABLED" = "1" ]; then
        # 冲突判定归一化（容忍大小写与 0/false 变体），避免变体未被识别时静默改为 async
        QUEUE_ENABLED_NORM="$(printf '%s' "${NUXT_QUEUE_ENABLED:-auto}" | tr '[:upper:]' '[:lower:]')"
        case "$QUEUE_ENABLED_NORM" in
            false|0)
                echo "warn: DEPENDFIX_QUEUE_WORKER=1 与 NUXT_QUEUE_ENABLED=$NUXT_QUEUE_ENABLED（强制同步）冲突，跳过独立 worker 进程" >&2
                WORKER_ENABLED=0
                ;;
        esac
    fi

    if [ "$WORKER_ENABLED" != "1" ]; then
        # 单进程形态（向后兼容）：入口替换为平台进程
        # shellcheck disable=SC2086
        exec $prefix "$@"
    fi

    # 双进程形态：worker 由后台看护循环托管（崩溃自动重启），主进程前台托管
    rm -f "$WORKER_SOCKET" "$WORKER_PID_FILE"
    supervise_queue_worker "$prefix" "$@" &
    SUPERVISOR_PID=$!

    # shellcheck disable=SC2086
    $prefix env NUXT_QUEUE_ENABLED=true NUXT_IN_PROCESS_WORKER=false "$@" &
    MAIN_PID=$!

    echo "[entrypoint] HTTP 进程 pid=${MAIN_PID} 不消费队列；队列 worker 看护进程 pid=${SUPERVISOR_PID}（socket=${WORKER_SOCKET}）"

    # 容器停止：PID 1 为本 shell，需把信号转发给主进程与看护循环（看护收到 TERM 即终止，不再重启 worker）
    trap 'kill -TERM "$MAIN_PID" 2>/dev/null || true; stop_queue_worker' TERM INT
    # set -e 下 wait 非零会中断脚本，须用 || 捕获退出码——否则下方 worker 清理成为不可达死代码
    STATUS=0
    wait "$MAIN_PID" || STATUS=$?
    stop_queue_worker
    # 回收看护子 shell（达上限自行退出 / 被终止后转僵尸），避免残留 defunct
    wait "$SUPERVISOR_PID" 2>/dev/null || true
    rm -f "$WORKER_PID_FILE"
    exit "$STATUS"
}

# 非 root 启动（compose user: 已指定身份）：无法 chown / setuid，直接执行
if [ "$(id -u)" != "0" ]; then
    [ -w "$HOME_DIR_CANON" ] || echo "warn: $HOME_DIR_CANON not writable by uid $(id -u); pnpm/npm cache may fail (pre-authorize the volume + HOME)" >&2
    run_platform "" "$@"
fi

for canon in "$DATA_DIR_CANON" "$HOME_DIR_CANON"; do
    if [ -d "$canon" ]; then
        chown -R "$RUN_IDENTITY" "$canon" 2>/dev/null \
            || echo "warn: chown $canon to $RUN_IDENTITY failed (read-only volume?)" >&2
    fi
done

# 降权执行；su-exec 缺失属构建损坏（构建期 apk add 固定安装），fail-closed 拒绝以 root 运行
if command -v su-exec > /dev/null 2>&1; then
    run_platform "su-exec $RUN_IDENTITY" "$@"
fi
echo "error: su-exec not found, refusing to run as root (降权链路损坏)" >&2
exit 1
