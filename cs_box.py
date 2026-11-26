"""고객문의 우체통 — 이 마을에는 연결된 쇼핑몰 앱이 없어 꺼져 있다."""
DATA = None


def enabled():
    return False


def view():
    return {"enabled": False, "items": [], "unanswered": 0}


def worker():
    return


def refresh():
    return


def hold(key, on=True):
    return


def send(key, content, confirm_only=False):
    raise ValueError("연결된 쇼핑몰 앱이 없습니다")
