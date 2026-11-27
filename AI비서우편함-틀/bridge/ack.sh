#!/usr/bin/env bash
set -euo pipefail
# 어느 폴더에서 불러도 우편함 저장소에서 돌게 (마을 세션들은 다른 폴더에서 부른다)
cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "Usage: $0 <to-claude/file.md>" >&2
  exit 1
fi

TARGET="$1"
if [ ! -f "$TARGET" ]; then
  echo "Not found: $TARGET" >&2
  exit 1
fi

git pull --rebase --autostash >/dev/null 2>&1 || git pull --rebase >/dev/null 2>&1

mkdir -p archive
DEST="archive/$(basename "$TARGET")"
git mv "$TARGET" "$DEST"
git commit -m "claude: ack $(basename "$TARGET")" >/dev/null
git push >/dev/null
echo "ARCHIVED: $DEST"
