#!/usr/bin/env bash
set -euo pipefail
# 어느 폴더에서 불러도 우편함 저장소에서 돌게 (마을 세션들은 다른 폴더에서 부른다)
cd "$(dirname "$0")/.."

git pull --rebase --autostash >/dev/null 2>&1 || git pull --rebase >/dev/null 2>&1

shopt -s nullglob
files=(to-claude/*.md)
if [ ${#files[@]} -eq 0 ]; then
  echo "NO_NEW_MESSAGES"
  exit 0
fi

for f in "${files[@]}"; do
  echo "=== $f ==="
  cat "$f"
  echo ""
done
