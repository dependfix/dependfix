#!/bin/sh
# 沙箱镜像自包含冒烟（本地与 CI 通用，不依赖宿主目录挂载）。
#
# 目的：验证已发布的 `dependfix-sandbox` / `dependfix-sandbox-full` 镜像在**没有 workspace
# node_modules** 的前提下仍可跑自包含 CLI，并区分 slim / full 的工具链姿态。
# 口径见 docs/design/governance/executor-sandbox.md 与 docs/guide/deployment.md。
#
# 用法：
#   SMOKE_IMAGE=caomeiyouren/dependfix-sandbox:latest sh apps/platform/docker/sandbox-smoke.sh
#   SMOKE_IMAGE=caomeiyouren/dependfix-sandbox-full:latest SMOKE_TOOLCHAIN=full \
#     sh apps/platform/docker/sandbox-smoke.sh
#
# 环境变量：
#   SMOKE_IMAGE      被测沙箱镜像（必填）
#   SMOKE_TOOLCHAIN  工具链姿态：slim（默认，三项必须全缺）/ full（三项必须齐全）
#   SMOKE_ARCH       仅用于日志标识（amd64 / arm64 / local）
#
# 断言：
#   1. `bin.mjs --version` 非空且不是 `0.0.0-unknown`（自包含版本可解析）
#   2. skills 目录完整（SKILL.md / REFERENCES.md）且 `skills doctor` 通过
#   3. 容器以非 root 运行（uid 100）
#   4. 工具链姿态与变体一致（逐项探测，多参数 command -v 不可靠）
#   5. 无宿主 workspace 依赖也能跑：断言镜像内不存在 /app/node_modules
set -eu

IMAGE="${SMOKE_IMAGE:-}"
TOOLCHAIN="${SMOKE_TOOLCHAIN:-slim}"
ARCH="${SMOKE_ARCH:-local}"

log() { printf '[sandbox-smoke] %s\n' "$*"; }
fail() { printf '[sandbox-smoke] FAIL(%s): %s\n' "$ARCH" "$*" >&2; exit 1; }

[ -n "$IMAGE" ] || fail "SMOKE_IMAGE 必填"
case "$TOOLCHAIN" in
    slim|full) ;;
    *) fail "SMOKE_TOOLCHAIN 只接受 slim / full：$TOOLCHAIN" ;;
esac
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "镜像不存在：$IMAGE（请先 docker pull）"

log "镜像 $IMAGE（arch=$ARCH / toolchain=$TOOLCHAIN）"

# 1. 自包含版本
version=$(docker run --rm --user 100:100 --entrypoint node "$IMAGE" /app/sandbox/bin.mjs --version) \
    || fail "bin.mjs --version 执行失败"
[ -n "$version" ] || fail "bin.mjs --version 输出为空"
case "$version" in
    0.0.0-unknown) fail "bin.mjs --version = 0.0.0-unknown（自包含产物未注入版本）" ;;
esac
log "版本：$version"

# 2. skills 完整 + doctor
docker run --rm --user 100:100 --entrypoint sh "$IMAGE" -c '
    set -eu
    [ -s /app/sandbox/skills/dependfix-remediator/SKILL.md ]
    [ -s /app/sandbox/skills/dependfix-remediator/REFERENCES.md ]
' || fail "skills 目录不完整（SKILL.md / REFERENCES.md 缺失）"
doctor_out=$(DEPENDFIX_SKILLS_DIR=/app/sandbox/skills \
    docker run --rm --user 100:100 -e DEPENDFIX_SKILLS_DIR=/app/sandbox/skills --entrypoint node \
    "$IMAGE" /app/sandbox/bin.mjs skills doctor 2>&1) || { printf '%s\n' "$doctor_out"; fail "skills doctor 失败"; }
log "skills doctor：$(printf '%s' "$doctor_out" | tail -n 1)"

# 3. 非 root
uid=$(docker run --rm --entrypoint id "$IMAGE" -u) || fail "无法读取容器 uid"
[ "$uid" = "100" ] || fail "容器默认运行身份应为 uid 100，实际 ${uid}"

# 4. 工具链姿态
present=""
absent=""
for tool in python3 make g++; do
    if docker run --rm --user 100:100 --entrypoint sh "$IMAGE" -c "command -v ${tool} >/dev/null 2>&1"; then
        present="$present $tool"
    else
        absent="$absent $tool"
    fi
done
if [ "$TOOLCHAIN" = "full" ]; then
    [ -z "$absent" ] || fail "full 变体缺编译工具链：${absent}"
    log "工具链：全部存在（full）"
else
    [ -z "$present" ] || fail "slim 变体含编译工具链：${present}"
    log "工具链：全部缺失（slim）"
fi

# 5. 自包含：镜像内不应有 workspace node_modules
if docker run --rm --user 100:100 --entrypoint sh "$IMAGE" -c 'test -d /app/node_modules'; then
    fail "镜像内含 /app/node_modules（说明复制了 workspace 依赖树，与自包含设计冲突）"
fi

log "PASS：$IMAGE 自包含入口与工具链姿态符合预期"
