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

# ---- pnpm store 持久化（跨 run 复用 content-addressable store）----
# 目标仓库依赖安装由 pnpm 执行。不给 storeDir 时 pnpm 按「一文件系统一份 store」自行选择：安装目录所在
# 文件系统的挂载点根（默认部署下即 $DATA_DIR/.pnpm-store，不是 $HOME）；仅当工作区与 HOME 同文件系统时
# 才用 $HOME/.local/share/pnpm/store——镜像里 HOME 在镜像层，容器重建即冷安装（弱网 / 大仓下单次安装
# 容易撞上安装超时）。
# 默认把 store 固定到数据卷内的 $DATA_DIR/pnpm-store：与 run 工作目录同卷，可硬链接复用、不额外占一份
# 磁盘（跨文件系统只退化为复制，仍能免去重复下载）。
# 显式设置 PNPM_CONFIG_STORE_DIR 时尊重用户值（必须为绝对路径）；目录不可用（只读挂载 / 宿主未授权）
# 时 warn 并回退 pnpm 默认位置（同时清空变量，避免 pnpm 仍读到不可用路径），不阻断启动。
STORE_DIR="${PNPM_CONFIG_STORE_DIR:-${DATA_DIR_CANON}/pnpm-store}"

# 创建 store 目录：一律以**运行身份**创建（root 启动时经 su-exec 降权），避免 root 建目录后运行身份
# 永久写不进去；也不对用户指定的任意路径做 chown（`PNPM_CONFIG_STORE_DIR=/` 这类值会波及根目录）。
# 非绝对路径直接跳过（相对路径会按目标仓库 cwd 解析，把 store 落进仓库工作区）；由 activate 统一告警回退。
prepare_pnpm_store() {
    case "$STORE_DIR" in
        ""|"/") return 0 ;;
        /*) : ;;
        *) return 0 ;;
    esac
    if [ "$(id -u)" = "0" ] && command -v su-exec > /dev/null 2>&1; then
        su-exec "$RUN_IDENTITY" mkdir -p "$STORE_DIR" 2>/dev/null || true
    else
        mkdir -p "$STORE_DIR" 2>/dev/null || true
    fi
}

# 以真实运行身份写探针判定可用性。不用 `test -w`：它只看 DAC 位，不看挂载只读属性——只读卷上
# 「上一次运行留下的 store 目录」会被误判可写，随后安装期 EROFS 硬失败（而本意是回退冷安装）。
# 探针同时覆盖 ENOSPC / ACL 拒绝；root 启动时必须经 su-exec 降权后再判（root 写探针恒真）。
# su-exec 缺失时退回当前身份判定——该形态随后由入口 fail-closed 拒绝启动（构建损坏）。
store_writable() {
    # 探针名带时间戳：容器内 PID 恒为 1，固定名可能与上次运行残留（不同 uid 属主）冲突
    probe="$STORE_DIR/.dependfix-store-probe.$$-$(date -u +%s)"
    if [ "$(id -u)" = "0" ] && command -v su-exec > /dev/null 2>&1; then
        su-exec "$RUN_IDENTITY" sh -c ': > "$1" && rm -f "$1"' dependfix-probe "$probe" 2>/dev/null
    else
        (: > "$probe" && rm -f "$probe") 2>/dev/null
    fi
}

# 启用 store 或回退既有行为（pnpm 默认位置）。回退必须 unset：用户显式注入的 PNPM_CONFIG_STORE_DIR
# 仍在环境中，否则 pnpm 会继续使用不可用路径。
activate_pnpm_store() {
    case "$STORE_DIR" in
        ""|"/")
            echo "warn: pnpm store 目录不能是根路径（当前 '$STORE_DIR'），回退 pnpm 默认位置（pnpm 自选落点，默认部署下为 $DATA_DIR_CANON/.pnpm-store）" >&2
            unset PNPM_CONFIG_STORE_DIR
            return 0
            ;;
        /*) : ;;
        *)
            echo "warn: pnpm store 目录必须是绝对路径（当前 '$STORE_DIR'），回退 pnpm 默认位置（pnpm 自选落点，默认部署下为 $DATA_DIR_CANON/.pnpm-store）" >&2
            unset PNPM_CONFIG_STORE_DIR
            return 0
            ;;
    esac
    if [ ! -d "$STORE_DIR" ]; then
        echo "warn: pnpm store 目录 $STORE_DIR 不存在（创建失败），回退 pnpm 默认位置（pnpm 自选落点，默认部署下为 $DATA_DIR_CANON/.pnpm-store；每次运行冷安装）" >&2
        unset PNPM_CONFIG_STORE_DIR
        return 0
    fi
    if store_writable; then
        export PNPM_CONFIG_STORE_DIR="$STORE_DIR"
        echo "[entrypoint] pnpm store: $STORE_DIR"
        return 0
    fi
    echo "warn: pnpm store 目录 $STORE_DIR 对运行身份不可写（只读挂载或权限不足），回退 pnpm 默认位置（pnpm 自选落点，默认部署下为 $DATA_DIR_CANON/.pnpm-store；每次运行冷安装）" >&2
    unset PNPM_CONFIG_STORE_DIR
    return 0
}

# ---- 遗留 pnpm store 检出（只告警，不删除）----
# 受管 store 上线（2026-10-24）之前，pnpm 按「一文件系统一份 store」把 store 建在数据卷挂载点根；默认部署
# （DATA_DIR 即挂载点根）下即 $DATA_DIR/.pnpm-store。升级时既未迁移也未清理，同一批依赖在受管目录与遗留
# 目录各存一份，数据卷占用可能翻倍（两个目录名只差一个前导点，人工很难发现）。根因 / 判据 / 清理 runbook
# 见 docs/design/governance/pnpm-store-hygiene.md。
# 边界（该文 §3 I2「检出优先于删除」）：入口只读检出并打印一条 warn，不删除、不 prune、不建目录、不写入；
# 以 root 启动时既有的数据卷属主归一化（chown -R $DATA_DIR）仍覆盖整个卷，不排除该目录，属既有行为。
# 探测失败（目录不存在或不可读）按「无遗留」处理，fail-open 不阻断启动。
# 仅在**受管 store 真正生效**时提示——一旦落进回退分支，该目录就是 pnpm 当前落点，属「正在使用」而非遗留，
# 此时由上面的回退 warn 负责说明。
LEGACY_STORE_DIR="$DATA_DIR_CANON/.pnpm-store"
report_legacy_pnpm_store() {
    [ -n "$STORE_DIR" ] || return 0
    [ "${PNPM_CONFIG_STORE_DIR:-}" = "$STORE_DIR" ] || return 0
    [ -d "$LEGACY_STORE_DIR" ] || return 0
    # 精确同路径（含尾斜杠）先快速跳过：readlink 不可用时这里是唯一防线
    case "$STORE_DIR" in
        "$LEGACY_STORE_DIR"|"$LEGACY_STORE_DIR/") return 0 ;;
    esac
    # 等价路径不算双份：./ 段 / 软链都可能让受管 store 落回同一物理目录，此时告警给的删除命令会指向
    # 正在使用的 store。两个目录此时都存在，按解析后的真实路径比较；readlink 失败（返回空）则不比较，
    # 保守方向是多提示一条告警而不是漏报。
    store_real="$(readlink -f "$STORE_DIR" 2>/dev/null || true)"
    legacy_real="$(readlink -f "$LEGACY_STORE_DIR" 2>/dev/null || true)"
    if [ -n "$store_real" ] && [ "$store_real" = "$legacy_real" ]; then
        return 0
    fi
    echo "warn: 检出遗留 pnpm store ${LEGACY_STORE_DIR}（与受管 store ${STORE_DIR} 并存，会重复占用磁盘；pnpm 在受管 store 上线前自行建在数据卷挂载点根）。入口不会自动删除：先核对体积 du -sh \"${LEGACY_STORE_DIR}\"，确认无运行中任务后按单一明确路径删除 rm -rf \"${LEGACY_STORE_DIR}\"（判据与 runbook 见 docs/design/governance/pnpm-store-hygiene.md；清理前用 pnpm store path 确认它不是当前受管 store）" >&2
}

# ---- 进程级日志文件通道（日志落数据卷）----
# 平台进程级日志（启动 / 队列 / 执行 / 通知）由 server/utils/logger.ts 写文件；目录缺省跟随数据卷
# （$DATA_DIR/logs），自定义 DATA_DIR 时自动跟随，容器重建后日志仍在卷内。
# 显式设置 LOG_DIR 时尊重用户值（建议绝对路径）；相对路径由日志模块按进程 cwd（/app）解析，入口不代建。
# 目录以**运行身份**创建（root 启动时经 su-exec 降权），创建失败不阻断启动——日志模块自身有写探针，
# 不可写时回退控制台（stderr/stdout）并 warn。口径见 docs/standards/platform.md §10.9。
LOG_DIR="${LOG_DIR:-${DATA_DIR_CANON}/logs}"
export LOG_DIR

prepare_log_dir() {
    case "$LOG_DIR" in
        ""|"/") return 0 ;;
        /*) : ;;
        *) return 0 ;;
    esac
    if [ "$(id -u)" = "0" ] && command -v su-exec > /dev/null 2>&1; then
        su-exec "$RUN_IDENTITY" mkdir -p "$LOG_DIR" 2>/dev/null || true
    else
        mkdir -p "$LOG_DIR" 2>/dev/null || true
    fi
}

# ---- 队列执行进程隔离（独立 worker 进程形态）----
# DEPENDFIX_QUEUE_WORKER=1 时启动双进程形态：
#   worker 进程：NUXT_IN_PROCESS_WORKER=true 消费扫描队列（扫描与引擎同步调用均在此进程）；
#   HTTP 进程：NUXT_IN_PROCESS_WORKER=false 不消费队列，event loop 不再被扫描执行阻塞。
# worker 的 Nitro HTTP 监听收敛到 unix socket（不占端口、不对外暴露），避免与主进程端口冲突；
# 迁移仅由主进程执行（worker 侧 DATABASE_MIGRATIONS_RUN=false），避免两进程迁移竞争。
# 进程角色：入口向两进程分别注入 DEPENDFIX_ROLE（worker / server）——worker 侧据此跳过 HTTP-only
#   插件（周期清理 stale-cleanup / 版本戳 build-info），避免重复 DB 查询与日志噪声；单进程形态由
#   入口归一化为 server（外部误设 worker 不生效）。判定口径与插件清单见 docs/standards/platform.md §10.6。
# worker 由看护循环托管：异常退出后按指数退避自动重启；连续快速失败超过上限后转为慢重试
# （不永久放弃——HTTP 进程不受影响，但队列必须有消费者；stale-cleanup 只能改 DB 不能消费队列）；
# 容器停止（TERM / INT）时终止看护循环与 worker，不再重启。
# 口径见 docs/standards/platform.md §10.6。默认 0 = 单进程形态（行为与既有一致）。
WORKER_ENABLED="${DEPENDFIX_QUEUE_WORKER:-0}"
WORKER_SOCKET="${DEPENDFIX_QUEUE_WORKER_SOCKET:-/tmp/dependfix-queue-worker.sock}"
# worker pid 落文件供父 shell 的信号处理读取（worker 由后台看护子 shell 托管，pid 不跨进程可见）
WORKER_PID_FILE="${WORKER_SOCKET}.pid"
WORKER_BACKOFF_INIT=1     # 首次重启退避（秒），随后指数增长
WORKER_BACKOFF_MAX=30     # 退避上限（秒）；当前上限 5 次下实际最大 16s，保留 30s 上界以便调整上限时仍封顶
WORKER_MAX_RESTARTS=5     # 连续快速重启上限：超过后转为慢重试（不永久放弃，防重启风暴）
WORKER_STABLE_SECONDS=60  # 运行时长达到该值视为稳定，连续重启计数与慢重试状态归零
WORKER_SLOW_RETRY_SECONDS="${DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS:-300}" # 慢重试间隔（秒）
# env 注入值校验：空 / 非纯数字 / <= 0 / > 3600 一律回退 300
# （`00` / `000` 数值等价 0，不能只靠 case 字面匹配；sleep 0 会形成重启风暴）
case "$WORKER_SLOW_RETRY_SECONDS" in
    ''|*[!0-9]*) WORKER_SLOW_RETRY_SECONDS=300 ;;
    *)
        # 先按长度粗筛（> 4 位必越界）：避免超出 shell 整数范围的值使 `[` 报 Illegal number，
        # 导致比较结果为假而绕过回退（等价于 worker 永不重启）
        if [ "${#WORKER_SLOW_RETRY_SECONDS}" -gt 4 ] \
            || [ "$WORKER_SLOW_RETRY_SECONDS" -le 0 ] \
            || [ "$WORKER_SLOW_RETRY_SECONDS" -gt 3600 ]; then
            WORKER_SLOW_RETRY_SECONDS=300
        fi
        ;;
esac
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

# 队列 worker 看护循环：启动 worker → 等待退出 → 按指数退避重启；连续快速失败超上限后
# 转为慢重试（间隔 WORKER_SLOW_RETRY_SECONDS），不永久放弃——stale-cleanup 只能改 DB，
# 不能消费队列，worker 永久退出会让所有任务无声挂起。
# 运行在后台子 shell，worker 崩溃不影响前台 HTTP 主进程生命周期。
supervise_queue_worker() {
    worker_prefix="$1"; shift
    # 看护自身收 TERM/INT：终止当前 worker 并退出（父 shell 亦经 pid 文件兜底，双保险）
    trap 'kill -TERM "$QUEUE_WORKER_PID" 2>/dev/null || true; exit 0' TERM INT
    restart_count=0
    slow_mode=0
    slow_attempt=0
    while :; do
        # shellcheck disable=SC2086
        $worker_prefix env HOME="$HOME_DIR" \
            NUXT_QUEUE_ENABLED=true \
            NUXT_IN_PROCESS_WORKER=true \
            DEPENDFIX_ROLE=worker \
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

        # 运行足够久视为稳定，连续重启计数与慢重试状态归零
        # （避免长期运行容器偶发崩溃累积触发上限 / 永久停留在慢重试）
        worker_elapsed=$(( $(date -u +%s) - worker_started ))
        if [ "$worker_elapsed" -ge "$WORKER_STABLE_SECONDS" ]; then
            restart_count=0
            slow_mode=0
            slow_attempt=0
        fi
        restart_count=$(( restart_count + 1 ))
        if [ "$slow_mode" = "1" ] || [ "$restart_count" -gt "$WORKER_MAX_RESTARTS" ]; then
            if [ "$slow_mode" = "0" ]; then
                slow_mode=1
                echo "[entrypoint] 队列 worker 连续重启 ${WORKER_MAX_RESTARTS} 次仍失败（最近退出码 ${worker_status}），转为慢重试（每 ${WORKER_SLOW_RETRY_SECONDS}s）；HTTP 进程继续服务" >&2
            fi
            slow_attempt=$(( slow_attempt + 1 ))
            # 慢重试日志降噪：首次与每 12 次记录一条（sleep 桩置零的测试里不会刷屏）
            if [ "$slow_attempt" = "1" ] || [ $(( slow_attempt % 12 )) -eq 0 ]; then
                echo "[entrypoint] 队列 worker 慢重试第 ${slow_attempt} 次（最近退出码 ${worker_status}）" >&2
            fi
            # 必须后台 sleep + wait：前台 sleep 会阻塞 trap（dash / busybox 语义），
            # 容器 TERM 最长要等满慢重试间隔才退出（docker stop 10s 宽限下会被 SIGKILL）
            sleep "$WORKER_SLOW_RETRY_SECONDS" &
            wait $! || true
            continue
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
        # 同慢重试：后台 sleep + wait 保证 TERM / INT 可立即打断退避
        sleep "$backoff" &
        wait $! || true
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
        # 单进程形态（向后兼容）：入口替换为平台进程。
        # 角色归一化：单进程形态没有独立 worker，显式置 server——避免外部误设 DEPENDFIX_ROLE=worker
        # 后周期清理（stale-cleanup）在本进程被跳过而无人承担（fail-safe：宁可多跑一次幂等清理，
        # 也不静默停用孤儿清理）。口径见 docs/standards/platform.md §10.6。
        # shellcheck disable=SC2086
        exec $prefix env DEPENDFIX_ROLE=server "$@"
    fi

    # 双进程形态：worker 由后台看护循环托管（崩溃自动重启），主进程前台托管
    rm -f "$WORKER_SOCKET" "$WORKER_PID_FILE"

    # 容器停止：PID 1 为本 shell，需把信号转发给主进程与看护循环（看护收到 TERM 即终止，不再重启 worker）。
    # 顺序硬约束：本 trap 必须先于「启动子进程」与「输出就绪行」安装——默认处置下的 TERM / INT 会直接终止 PID 1，
    # 使看护循环与 worker 失去父进程（孤儿化），且外部观测方（容器编排 / 健康检查 / 行为测试）读到 signal 终止
    # 而非约定的 143 退出码。主进程尚未启动（MAIN_PID 未赋值）时无主进程可转发，直接退出（看护进程仍由
    # stop_queue_worker 兜底），避免停止信号被吞后照旧启动。
    trap 'kill -TERM "$MAIN_PID" 2>/dev/null || true; stop_queue_worker; if [ -z "$MAIN_PID" ]; then exit 0; fi' TERM INT

    supervise_queue_worker "$prefix" "$@" &
    SUPERVISOR_PID=$!

    # shellcheck disable=SC2086
    $prefix env NUXT_QUEUE_ENABLED=true NUXT_IN_PROCESS_WORKER=false DEPENDFIX_ROLE=server "$@" &
    MAIN_PID=$!

    echo "[entrypoint] HTTP 进程 pid=${MAIN_PID} 不消费队列；队列 worker 看护进程 pid=${SUPERVISOR_PID}（socket=${WORKER_SOCKET}）"

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
    prepare_pnpm_store
    activate_pnpm_store
    report_legacy_pnpm_store
    prepare_log_dir
    run_platform "" "$@"
fi

# 顺序：先修复数据卷 / HOME 归属（默认 store 的父目录由此可写）→ 再以运行身份建 store 目录 →
# 最后按运行身份写探针判定可用性。自定义路径只要求父目录对运行身份可进入，入口不对其做 chown。
for canon in "$DATA_DIR_CANON" "$HOME_DIR_CANON"; do
    if [ -d "$canon" ]; then
        chown -R "$RUN_IDENTITY" "$canon" 2>/dev/null \
            || echo "warn: chown $canon to $RUN_IDENTITY failed (read-only volume?)" >&2
    fi
done

prepare_pnpm_store
activate_pnpm_store
report_legacy_pnpm_store
prepare_log_dir

# 降权执行；su-exec 缺失属构建损坏（构建期 apk add 固定安装），fail-closed 拒绝以 root 运行
if command -v su-exec > /dev/null 2>&1; then
    run_platform "su-exec $RUN_IDENTITY" "$@"
fi
echo "error: su-exec not found, refusing to run as root (降权链路损坏)" >&2
exit 1
