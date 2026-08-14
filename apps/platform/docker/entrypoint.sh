#!/bin/sh
# dependfix 平台容器入口：修复数据目录所有权后降权执行（C38 非 root 降权）
#
# 场景覆盖：
# - 新卷：镜像构建期已 mkdir + chown /app/data，此处幂等无操作
# - 既有 root 所有卷（升级前以 root 运行的存量部署）：此处 chown 修复所有权
# - chown 失败不阻断启动（如只读卷），但必须输出警告便于排障
set -e

RUN_USER="${RUN_USER:-dependfix}"
DATA_DIR="${DATA_DIR:-/app/data}"

if [ -d "$DATA_DIR" ]; then
    chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR" 2>/dev/null \
        || echo "warn: chown $DATA_DIR to $RUN_USER failed (read-only volume?)" >&2
fi

# 降权执行；su-exec 缺失属构建损坏（构建期 apk add 固定安装），fail-closed 拒绝以 root 运行
if command -v su-exec > /dev/null 2>&1; then
    exec su-exec "$RUN_USER" "$@"
fi
echo "error: su-exec not found, refusing to run as root (C38 降权链路损坏)" >&2
exit 1
