"""개인 비서 우편함 연결 — 공개본에는 없다 (빈 자리)."""
REPO = ""
STATE = {"lastPull": 0, "pullError": None}


def enabled():
    return False


def _off(*a, **k):
    raise RuntimeError("이 마을에는 비서 우편함이 없습니다")


pull = send = ack = publish_roster = _off


def letters(*a, **k):
    return []


def parse(*a, **k):
    return None


def forward_text(*a, **k):
    return ""


def resolve_session(*a, **k):
    return None
