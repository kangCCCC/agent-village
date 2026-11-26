"""세션별 토큰 사용량 — 대화 기록(jsonl)의 응답마다 붙은 usage 를 날짜별로 더한다.

- 최근 7일에 움직인 기록만 본다(처음 한 번은 수 GB 를 읽어 1~2분 걸린다. 그 뒤로는 새로 붙은 부분만).
- 같은 응답이 여러 줄로 나뉘어 같은 usage 가 반복 기록되므로 message.id 로 한 번만 센다.
- 하위 일꾼(subagents/*.jsonl)은 그 부모 세션 몫으로 친다.
- 결과: data/tokens.json  {cli 세션 id: {날짜(한국): {"in":…, "out":…, "cr":…, "cw":…}}}
"""
import glob, json, os, re, threading, time

PROJECTS = os.path.expanduser("~/.claude/projects")
DATA = None
STATE = {"ready": False, "scanning": False, "lastScan": 0}
LOCK = threading.Lock()
_index = {}      # path → {"off": 바이트 위치, "seen": set(message id)}
_usage = {}      # cli id → {date: {...}}
_hourly = {}     # "YYYY-MM-DDTHH"(UTC) → 정가 환산 달러 (모든 세션 합)

RX_ID = re.compile(r'"message":\{"id":"([^"]+)"')
RX_TS = re.compile(r'"timestamp":"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)')
RX_USAGE = re.compile(r'"usage":\{([^{}]*)')
RX_MODEL = re.compile(r'"model":"(claude-[a-z0-9.-]+)"')
# API 정가 (달러 / 100만 토큰): 입력, 출력, 캐시 읽기, 캐시 쓰기(5분 = 입력의 1.25배). claude-api 기술의 2026-11 표 기준
PRICES = {
    "claude-opus-5-5": (4, 20, 0.20, 5),
    "claude-opus-5": (5, 25, 0.50, 6.25),
    "claude-sonnet-5-5": (2, 10, 0.10, 2.5),
    "claude-sonnet-5": (2, 10, 0.20, 2.5),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    "claude-fable-5-2": (8, 40, 0.20, 10),
    "claude-fable-5-1": (10, 50, 0.50, 12.5),
}


def usd_of(model, n):
    p = PRICES.get(model) or next((v for k, v in PRICES.items() if model.startswith(k)), PRICES["claude-opus-5-5"])
    return (n.get("input_tokens", 0) * p[0] + n.get("output_tokens", 0) * p[1]
            + n.get("cache_read_input_tokens", 0) * p[2] + n.get("cache_creation_input_tokens", 0) * p[3]) / 1e6


RX_NUM = re.compile(r'"(input_tokens|output_tokens|cache_read_input_tokens|cache_creation_input_tokens)":(\d+)')


def _owner(path):
    """기록 파일 → 세션(cli) id. 하위 일꾼 파일은 부모 세션 폴더 이름이 주인."""
    parts = path.split(os.sep)
    if "subagents" in parts:
        return parts[parts.index("subagents") - 1]
    return os.path.basename(path)[:-6]


def _kst_date(ts):
    t = time.strptime(ts, "%Y-%m-%dT%H:%M:%S")
    return time.strftime("%Y-%m-%d", time.gmtime(time.mktime(t) - time.timezone + 9 * 3600))


def _scan_file(path):
    st = _index.setdefault(path, {"off": 0, "seen": set()})
    try:
        size = os.path.getsize(path)
    except OSError:
        return
    if size < st["off"]:
        st["off"], st["seen"] = 0, set()
    if size == st["off"]:
        return
    owner = _owner(path)
    with open(path, "rb") as f:
        f.seek(st["off"])
        while True:
            line = f.readline()
            if not line:
                break
            if not line.endswith(b"\n"):
                break                      # 쓰는 중인 마지막 줄은 다음 바퀴에
            st["off"] += len(line)
            if b'"usage"' not in line or b'"type":"assistant"' not in line:
                continue
            s = line.decode("utf-8", "replace")
            m = RX_ID.search(s)
            mid = m.group(1) if m else None
            if mid and mid in st["seen"]:
                continue
            u = RX_USAGE.search(s)
            ts = RX_TS.search(s)
            if not u or not ts:
                continue
            if mid:
                st["seen"].add(mid)
            nums = dict((k, int(v)) for k, v in RX_NUM.findall(u.group(1)))
            day = _kst_date(ts.group(1))
            hour = ts.group(1)[:13]          # UTC 시간 단위 (주간 초기화 시각 이후만 세기용)
            d = _usage.setdefault(owner, {}).setdefault(day, {"in": 0, "out": 0, "cr": 0, "cw": 0, "usd": 0.0})
            mm = RX_MODEL.search(s)
            u_ = usd_of(mm.group(1) if mm else "", nums)
            d["usd"] = d.get("usd", 0.0) + u_
            _hourly[hour] = _hourly.get(hour, 0.0) + u_
            d["in"] += nums.get("input_tokens", 0)
            d["out"] += nums.get("output_tokens", 0)
            d["cr"] += nums.get("cache_read_input_tokens", 0)
            d["cw"] += nums.get("cache_creation_input_tokens", 0)


def scan():
    with LOCK:
        STATE["scanning"] = True
        cutoff = time.time() - 7 * 86400
        files = glob.glob(os.path.join(PROJECTS, "*", "*.jsonl")) + \
            glob.glob(os.path.join(PROJECTS, "*", "*", "subagents", "*.jsonl"))
        for p in files:
            try:
                if os.path.getmtime(p) < cutoff and p not in _index:
                    continue
            except OSError:
                continue
            _scan_file(p)
        # 7일 넘은 날짜는 버린다
        keep = {time.strftime("%Y-%m-%d", time.gmtime(time.time() + 9 * 3600 - k * 86400)) for k in range(8)}
        for o in list(_usage):
            for day in list(_usage[o]):
                if day not in keep:
                    del _usage[o][day]
        STATE.update(scanning=False, ready=True, lastScan=time.time())


def worker():
    while True:
        try:
            scan()
        except Exception as e:      # 한 바퀴 실패해도 다음 바퀴
            STATE["error"] = f"{type(e).__name__}: {e}"[:200]
            STATE["scanning"] = False
        time.sleep(60)


def today():
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 9 * 3600))


def summary_for(cli_ids):
    """세션 하나(여러 cli id 일 수 있음)의 오늘·7일 합계."""
    t = today()
    out = {"today": 0, "todayOut": 0, "week": 0, "weekOut": 0, "todayUsd": 0.0, "weekUsd": 0.0}
    for c in cli_ids:
        for day, d in _usage.get(c, {}).items():
            tot = d["in"] + d["out"] + d["cr"] + d["cw"]
            out["week"] += tot
            out["weekOut"] += d["out"]
            out["weekUsd"] += d.get("usd", 0)
            if day == t:
                out["today"] += tot
                out["todayOut"] += d["out"]
                out["todayUsd"] += d.get("usd", 0)
    return out


def totals():
    t = today()
    tot = {"today": 0, "todayOut": 0, "week": 0, "weekOut": 0, "todayUsd": 0.0, "weekUsd": 0.0, "byDay": {}}
    for o, days in _usage.items():
        for day, d in days.items():
            s = d["in"] + d["out"] + d["cr"] + d["cw"]
            tot["week"] += s
            tot["weekOut"] += d["out"]
            tot["weekUsd"] += d.get("usd", 0)
            tot["byDay"][day] = tot["byDay"].get(day, 0) + s
            tot.setdefault("byDayUsd", {})[day] = tot.setdefault("byDayUsd", {}).get(day, 0) + d.get("usd", 0)
            if day == t:
                tot["today"] += s
                tot["todayOut"] += d["out"]
                tot["todayUsd"] += d.get("usd", 0)
    return tot


def usd_since(iso_utc):
    """그 시각(UTC, 예: 2026-11-21T09:00:00Z) 이후의 정가 환산 달러 합 — 주간 한도 초기화 이후 쓴 양."""
    key = iso_utc[:13]
    return sum(v for k, v in _hourly.items() if k >= key)
