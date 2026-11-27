#!/bin/bash
# 에이전트빌리지 설치 — 이 폴더를 ~/Documents/agent-village 에 두고 한 번 돌린다.
#   bash install.sh
set -e
cd "$(dirname "$0")"
HERE="$(pwd)"
WANT="$HOME/Documents/agent-village"
if [ "$HERE" != "$WANT" ]; then
  echo "이 폴더를 $WANT 로 옮긴 뒤 다시 돌려 주세요 (지금: $HERE)"; exit 1
fi
echo "① 준비물 확인"
command -v swiftc >/dev/null || { echo "  swiftc 가 없습니다 → 터미널에서: xcode-select --install"; exit 1; }
command -v python3 >/dev/null || { echo "  python3 가 없습니다"; exit 1; }
echo "  swiftc·python3 있음"

echo "①-2 옛 버전 정리 (예전 이름 「에이전트 마을」 앱이 있으면 끄고 휴지통으로 — 자료 폴더 data/ 는 그대로 둔다)"
for OLD in "에이전트 마을" "에이전트마을"; do
  if [ -d "/Applications/$OLD.app" ]; then
    osascript -e "tell application \"$OLD\" to quit" >/dev/null 2>&1 || true
    sleep 2; pkill -f "/Applications/$OLD.app" 2>/dev/null || true
    if command -v trash >/dev/null; then trash "/Applications/$OLD.app"; else mv "/Applications/$OLD.app" "$HOME/.Trash/"; fi
    echo "  옛 앱 「$OLD」 을 휴지통으로 옮김"
  fi
done
osascript -e 'tell application "에이전트빌리지" to quit' >/dev/null 2>&1 || true

echo "② 자료 폴더와 기본 설정"
DATA="$WANT/data"
mkdir -p "$DATA/receipts"
[ -f "$DATA/settings.json" ] || python3 - "$DATA/settings.json" <<'PYEOF'
import json,subprocess,sys
loc=subprocess.run(["defaults","read","-g","AppleLocale"],capture_output=True,text=True).stdout.strip()
ko=loc.startswith("ko")
json.dump({"ownerName":"사장님" if ko else "Boss","usdKrw":1342,"lang":"ko" if ko else "en","relayUrl":"https://agent-village-relay.agentvillage.workers.dev","distributor":{"github": "kangCCCC", "code": "VLG-UTXDN6", "name": "강C"}},open(sys.argv[1],"w"),ensure_ascii=False)
PYEOF

python3 - "$DATA/settings.json" <<'PYEOF'
import json,sys
p=sys.argv[1];c=json.load(open(p))
c.setdefault("distributor",{"github": "kangCCCC", "code": "VLG-UTXDN6", "name": "강C"})
json.dump(c,open(p,"w"),ensure_ascii=False)
PYEOF

echo "③ 그림 자르기 도구 (art/.venv: pillow·numpy·scipy)"
if command -v uv >/dev/null; then
  (cd art && uv venv -q .venv && uv pip install -q --python .venv/bin/python -r requirements.txt)
else
  (cd art && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt)
fi

echo "④ 우체부 모드에 자료 폴더 경로 채우기"
python3 -c 'import sys;p=sys.argv[1];s=open(p,encoding="utf-8").read();open(p,"w",encoding="utf-8").write(s.replace("__VILLAGE_DATA__",sys.argv[2]))' mod/village-mail/hooks/register.ts "$DATA"   # 경로에 # · & 가 있어도 안 깨지게
grep -q "$DATA" mod/village-mail/hooks/register.ts && echo "  우체부 경로: $DATA"

echo "⑤ 주민끼리 말 걸기 기술 (village-talk) 깔기"
mkdir -p "$HOME/.claude/skills/village-talk"
cp skills/village-talk/SKILL.md "$HOME/.claude/skills/village-talk/SKILL.md"
command -v codex >/dev/null || [ -x "$HOME/.local/bin/codex" ] && echo "  코덱스 있음 → 코덱스 주민 가능" || echo "  코덱스 없음 (코덱스 주민은 못 만듦)"
command -v agy >/dev/null || [ -x "$HOME/.local/bin/agy" ] && echo "  안티그래비티 있음 → 제미나이 주민 가능" || echo "  안티그래비티(agy) 없음 (제미나이 주민은 못 만듦)"

echo "⑥ 앱 만들고 설치 (/Applications/에이전트빌리지.app)"
bash build.sh --install
open "/Applications/에이전트빌리지.app"
echo
echo "끝. 다음: HANDOFF.md 의 「4. 우체부 붙이기」를 따라 하세요 (지시 보내기에 필요)."
