#!/usr/bin/env bash
# 마을 세션이 피클에게 편지 보내기 (보낸 세션 이름·id 를 머리말에 남긴다)
# 사용: ./bridge/send-from.sh "보내는 세션 이름" "보내는 세션 id(local_…)" "제목" "본문" [reply_to 경로]
set -euo pipefail
if [ $# -lt 4 ]; then
  echo "Usage: $0 \"세션 이름\" \"세션 id\" \"제목\" \"본문\" [reply_to_path]" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
NAME="$1"; SID="$2"; SUBJECT="$3"; BODY="$4"; REPLY_TO="${5:-}"
git pull --rebase --autostash >/dev/null 2>&1 || git pull --rebase >/dev/null 2>&1
TS_FILE=$(TZ=Asia/Seoul date +"%Y%m%dT%H%M%S")
TS_ISO=$(TZ=Asia/Seoul date +"%Y-%m-%dT%H:%M:%S+09:00")
SLUG=$(printf '%s' "$SUBJECT" | tr ' /' '--' | tr -cd '[:alnum:]가-힣_-' | head -c 40)
[ -z "$SLUG" ] && SLUG="message"
OUT="to-pickle/${TS_FILE}-claude-${SLUG}.md"
mkdir -p to-pickle
cat > "$OUT" <<MSG
---
id: ${TS_FILE}-claude
from: claude-code
from_session: ${SID}
from_name: ${NAME}
from_cli: ${CLAUDE_CODE_SESSION_ID:-}
to: pickle
created: ${TS_ISO}
subject: ${SUBJECT}
reply_to: ${REPLY_TO}
---

${BODY}
MSG
git add "$OUT"
git commit -m "claude(${NAME}): ${SUBJECT}" >/dev/null
git push >/dev/null
echo "SENT: $OUT"
