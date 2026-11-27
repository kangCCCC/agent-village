#!/usr/bin/env bash
set -euo pipefail
# 어느 폴더에서 불러도 우편함 저장소에서 돌게 (마을 세션들은 다른 폴더에서 부른다)
cd "$(dirname "$0")/.."

if [ $# -lt 2 ]; then
  echo "Usage: $0 \"제목\" \"본문\" [reply_to_path]" >&2
  exit 1
fi

SUBJECT="$1"
BODY="$2"
REPLY_TO="${3:-}"

git pull --rebase --autostash >/dev/null 2>&1 || git pull --rebase >/dev/null 2>&1

TS_FILE=$(TZ=Asia/Seoul date +"%Y%m%dT%H%M%S")
TS_ISO=$(TZ=Asia/Seoul date +"%Y-%m-%dT%H:%M:%S+09:00")
SLUG=$(printf '%s' "$SUBJECT" | tr ' /' '--' | tr -cd '[:alnum:]가-힣_-' | head -c 40)
[ -z "$SLUG" ] && SLUG="message"

OUT="to-pickle/${TS_FILE}-claude-${SLUG}.md"
cat > "$OUT" <<EOF
---
id: ${TS_FILE}-claude
from: claude-code
from_cli: ${CLAUDE_CODE_SESSION_ID:-}
to: pickle
created: ${TS_ISO}
subject: ${SUBJECT}
reply_to: ${REPLY_TO}
---

${BODY}
EOF

git add "$OUT"
git commit -m "claude: ${SUBJECT}" >/dev/null
git push >/dev/null
echo "SENT: $OUT"
