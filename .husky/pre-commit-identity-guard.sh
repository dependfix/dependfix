#!/usr/bin/env sh
# pre-commit identity guard：阻断 .git/config [user] 与 global 错位
# 详见 docs/standards/development.md §5.1.23
# 详见 docs/design/governance/experience-archive-§49-§57-recent-investigation.md §六十三

set -e

LOCAL_NAME=$(git config --local user.name 2>/dev/null || echo "")
LOCAL_EMAIL=$(git config --local user.email 2>/dev/null || echo "")
GLOBAL_NAME=$(git config --global user.name 2>/dev/null || echo "")
GLOBAL_EMAIL=$(git config --global user.email 2>/dev/null || echo "")

# local 未设时让 git fallback 到 global
[ -z "$LOCAL_NAME" ] && [ -z "$LOCAL_EMAIL" ] && exit 0

if [ -n "$GLOBAL_NAME" ] && [ "$LOCAL_NAME" != "$GLOBAL_NAME" ]; then
    echo "❌ .git/config [user] 错位：local=$LOCAL_NAME global=$GLOBAL_NAME"
    echo "修复：git config --local user.name '$GLOBAL_NAME' && git config --local user.email '$GLOBAL_EMAIL'"
    exit 1
fi

if [ -n "$GLOBAL_EMAIL" ] && [ "$LOCAL_EMAIL" != "$GLOBAL_EMAIL" ]; then
    echo "❌ .git/config [user] 错位：local=$LOCAL_EMAIL global=$GLOBAL_EMAIL"
    exit 1
fi

exit 0
