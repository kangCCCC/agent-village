"""이웃 빌리지 — 다른 맥의 에이전트빌리지와 편지·파일·캐릭터·배경·부탁을 주고받는다.

길: 두 사람이 같이 쓰는 비공개 깃 저장소(예: 깃허브)를 각자 맥에 내려받아 두고, 1분마다 당기고·민다.
    포트를 열지 않고, 집 밖·다른 와이파이에서도 된다.

저장소 모양
  villages/<빌리지id>.json            빌리지 이름·주인 호칭·공개한 주민 명단(이름만)
  mail/<받는 빌리지id>/<편지id>.json   편지 한 통
  mail/<받는 빌리지id>/<편지id>/...    편지에 붙은 파일

여러 저장소 (11-26 일촌)
  - conf["repo"]       = 가까운 이웃(서로 믿는 사이) 저장소. 부탁·캐릭터·배경 선물을 받는다.
  - conf["links"][...] = 일촌 저장소(두 마을만 쓰는 비공개 저장소, 일촌 하나에 하나). trust="ilchon".
    일촌에게서 온 것은 편지·방문·방명록만 받는다: 부탁은 편지로 바뀌어 세션에 들어갈 수 없고,
    캐릭터·배경은 자동 설치하지 않고, 파일은 그림·문서·소리·영상만 받는다.

지킬 것
  - 들어온 편지는 남이 쓴 글이다. 「부탁」은 주인이 「전달」을 눌러야 세션에 들어가고, 그때도 「주인 지시가 아님」 머리말이 붙는다.
  - 캐릭터·배경은 PNG 만 받는다(파일 머리 확인). 파일은 실행하지 않고 보관만 한다. 크기 제한이 있다.
  - 상대에게 보이는 명단은 주인이 「이웃에게 공개」한 주민뿐이다(이름과 id 만).
"""
import base64, json, os, re, shutil, subprocess, threading, time, uuid
import plat

DATA = None          # server 가 넣어 준다
LOCK = threading.RLock()
STATE = {"lastSync": 0, "error": None, "syncing": False}
MAX_FILE = 20_000_000
MAX_LETTER = 60_000_000
PNG = b"\x89PNG\r\n\x1a\n"
CHAR_POSES = ("portrait", "idle", "work", "walkA", "walkB", "raise", "sleep", "cheer", "oops", "tea", "phone", "wave")


def _p(*a):
    return os.path.join(DATA, *a)


def _jread(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _jwrite(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def conf():
    return _jread(_p("neighbor.json"), {})


def save_conf(c):
    _jwrite(_p("neighbor.json"), c)


def links():
    """연결된 저장소들: [{repo, trust: close|ilchon, ...}] — 가까운 이웃이 먼저."""
    c = conf()
    out = []
    if c.get("repo") and os.path.isdir(os.path.join(c["repo"], ".git")):
        out.append({"repo": c["repo"], "trust": "close"})
    for L in c.get("links") or []:
        ok = os.path.isdir(L.get("repo") or "") if L.get("transport") == "relay" else \
            (L.get("repo") and os.path.isdir(os.path.join(L["repo"], ".git")))
        if ok and L["repo"] != c.get("repo"):
            out.append({**L, "trust": "ilchon" if L.get("trust") != "close" else "close"})
    return out


def link_of_repo(repo):
    return next((L for L in links() if L["repo"] == repo), None)


def add_link(L):
    """일촌 저장소를 잇는다 (이미 있으면 내용만 고친다)."""
    c = me()
    ls = [x for x in (c.get("links") or []) if x.get("repo") != L["repo"]]
    ls.append(L)
    c["links"] = ls
    save_conf(c)


def remove_link(repo):
    c = conf()
    c["links"] = [x for x in (c.get("links") or []) if x.get("repo") != repo]
    save_conf(c)


def enabled():
    return bool(links())


def me():
    c = conf()
    if not c.get("vid"):
        c["vid"] = "v_" + uuid.uuid4().hex[:10]
        save_conf(c)
    return c


def git(*args, timeout=90, repo=None):
    repo = repo or conf().get("repo")
    # 그림이 실린 편지는 커서 기본 전송 버퍼로는 HTTP 400 으로 끊긴다 (11-26 실측) → 버퍼를 넉넉히
    # core.symlinks=false: 상대가 저장소에 바로가기(심볼릭 링크)를 올려도 내 맥에선 그냥 글 파일로 풀린다 (11-26 보안 검수 8번)
    r = subprocess.run(["git", "-C", repo, "-c", "http.postBuffer=524288000", "-c", "core.symlinks=false", *args], capture_output=True, text=True, timeout=timeout,
                       env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-300:] or "git 실패")
    return r.stdout


def setup(repo, name, owner):
    """저장소 폴더 정하기. 깃 저장소여야 한다(깃허브 비공개 저장소를 내려받은 폴더)."""
    repo = os.path.expanduser(str(repo or "").strip())
    if not repo or not os.path.isdir(os.path.join(repo, ".git")):
        raise ValueError("그 폴더는 깃 저장소가 아닙니다. 깃허브에서 비공개 저장소를 만들고 맥에 내려받은(clone) 폴더를 넣어 주세요")
    c = me()
    c.update(repo=repo, name=(str(name or "").strip() or f"{owner}의 빌리지")[:30], owner=owner)
    save_conf(c)
    return c


# ---------- 공개 명단 ----------
def shared_ids():
    return set(conf().get("share") or [])


def set_share(sid, on):
    c = conf()
    s = set(c.get("share") or [])
    (s.add if on else s.discard)(sid)
    c["share"] = sorted(s)
    save_conf(c)


def _publish(agents, repo):
    c = me()
    share = shared_ids()
    L = next((x for x in links() if x["repo"] == repo), {})
    res = [a for a in agents if a["id"] in share]
    if L.get("trust") == "ilchon":
        # 일촌(낯선 사람)에게는 세션 이름·id 를 안 보인다 — 「주민 몇 명」만 (11-27 사장님: 세션 이름·작업물은 사생활)
        res = [{"id": f"r{i}", "title": ""} for i, _ in enumerate(res)]
    else:
        res = [{"id": a["id"], "title": a.get("title", "")[:40]} for a in res]
    info = {"id": c["vid"], "name": c.get("name"), "owner": c.get("owner"), "updated": int(time.time()), "residents": res}
    path = os.path.join(repo, "villages", c["vid"] + ".json")
    old = _jread(path, {})
    if {k: v for k, v in old.items() if k != "updated"} == {k: v for k, v in info.items() if k != "updated"} \
            and time.time() - (old.get("updated") or 0) < 6 * 3600:
        return False
    _jwrite(path, info)
    return True


_VID = re.compile(r"^[\w\-]{1,60}$")


def _clean_village(v, fname):
    """저장소의 마을 파일 → 정해진 모양으로 다시 조립 (모양이 틀리면 None).
    남이 올린 파일이라 그대로 화면에 넘기면 안 된다 (11-26 3차 검수: 일촌이 residents 에 스크립트를 심음)."""
    if not isinstance(v, dict) or not isinstance(v.get("id"), str) or not _VID.match(v["id"]) or v["id"] != fname:
        return None
    res = v.get("residents")
    res = [{"id": re.sub(r"[^\w\-]", "", str(r.get("id", "")))[:60], "title": str(r.get("title", ""))[:40]}
           for r in (res if isinstance(res, list) else [])[:200] if isinstance(r, dict)]
    up = v.get("updated")
    return {"id": v["id"], "name": str(v.get("name") or "")[:60], "owner": str(v.get("owner") or "")[:60],
            "updated": int(up) if isinstance(up, (int, float)) and not isinstance(up, bool) else 0, "residents": res}


def _village_files(L):
    """그 연결(저장소)에서 인정하는 마을 파일들 [(vid, 경로)].
    일촌 저장소는 둘만의 것이라 「상대 마을 하나」만 인정한다 — 남의 id 로 파일을 심어 편지를 가로채지 못하게."""
    d = os.path.join(L["repo"], "villages")
    if L.get("trust") == "ilchon":
        pv = str(L.get("peerVid") or "")
        f = os.path.join(d, pv + ".json")
        return [(pv, f)] if pv and _VID.match(pv) and os.path.isfile(f) else []
    return [(f[:-5], os.path.join(d, f)) for f in (sorted(os.listdir(d)) if os.path.isdir(d) else [])
            if f.endswith(".json") and _VID.match(f[:-5])]


def peers():
    """이어진 모든 저장소의 이웃 마을. 각 마을에 trust(close|ilchon)·repo·일촌명이 붙는다."""
    c = conf()
    out, seen = [], set()
    for L in links():
        for vid, fp in _village_files(L):
            if vid == c.get("vid") or vid in seen:
                continue
            v = _clean_village(_jread(fp, None), vid)
            if not v:
                continue
            seen.add(vid)
            try:
                saf = __import__("relay").safety(L["master"]) if L.get("transport") == "relay" and L.get("master") else ""
            except Exception:
                saf = ""
            if L["trust"] == "ilchon":
                v["residents"] = [{"id": f"r{i}", "title": ""} for i, _ in enumerate(v["residents"])]   # 상대가 이름을 실어 보내도 안 보인다
            out.append({**v, "trust": L["trust"], "repo": L["repo"],
                        "callThem": str(L.get("callThem", ""))[:40], "calledByThem": str(L.get("calledByThem", ""))[:40],
                        "peerLogin": str(L.get("peerLogin", ""))[:60], "peerCode": str(L.get("peerCode", ""))[:20],
                        "transport": L.get("transport", "git"),
                        # 일촌 코드로 이은 사이: 두 맥이 같은 열쇠인지 서로 맞춰 볼 안전번호 (열쇠 자체는 화면에 안 보낸다)
                        "safety": saf})
    return out


def repo_of(vid):
    """그 마을과 이어진 저장소 (없으면 None). 일촌 저장소는 그 일촌 마을에만 해당한다."""
    vid = re.sub(r"[^\w\-]", "", str(vid or ""))
    for L in links():
        if any(v == vid and _clean_village(_jread(fp, None), v) for v, fp in _village_files(L)):
            return L
    return None


# ---------- 받은 편지함 ----------
def inbox():
    return _jread(_p("neighbor-inbox.json"), [])


def _save_inbox(items):
    _jwrite(_p("neighbor-inbox.json"), items[-300:])


def _safe_name(n):
    n = os.path.basename(str(n or "file"))
    n = re.sub(r"[^\w.\-가-힣 ()]", "_", n).strip() or "file"
    return n[:80]


def _avatar_from(path, lid, L=None):
    """저장소 편지에 실린 보낸 주민 그림을 받은 편지 폴더로 옮긴다. 돌려주는 값: 포즈 목록 (idle 없으면 [])."""
    if L is None:
        L = _jread(path, None)
    if not isinstance(L, dict):
        return []
    src_dir = path[:-5]
    dst = _p("neighbor", "files", re.sub(r"[^\w\-]", "", str(lid))[:40], "_av")
    av = []
    for pose in (L.get("avatar") or [])[:len(AV_POSES)]:
        if pose not in AV_POSES:
            continue
        sp = os.path.join(src_dir, f"_av_{pose}.png")
        if not os.path.isfile(sp) or not _inside(sp, src_dir) or os.path.getsize(sp) > MAX_FILE:
            continue
        with open(sp, "rb") as f:
            if f.read(8) != PNG:
                continue
        if safe_take(sp, src_dir, dst, f"_av_{pose}.png") is None:
            continue
        os.replace(os.path.join(dst, f"_av_{pose}.png"), os.path.join(dst, pose + ".png"))
        av.append(pose)
    return av if "idle" in av else []


ILCHON_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".pdf", ".txt", ".md", ".srt",
              ".mp3", ".m4a", ".wav", ".mp4", ".mov", ".m4v", ".webm")
# 가까운 이웃은 일촌보다 조금 더: 배포본 압축·표·문서까지. 그래도 SVG·HTML·실행 파일(.app .command .sh …)은 누구에게서도 안 받는다
CLOSE_EXT = ILCHON_EXT + (".zip", ".json", ".csv", ".tsv", ".docx", ".xlsx", ".pptx", ".hwp", ".hwpx")
IMG_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic")
# 파일 머리(첫 바이트) — 이름만 바꾼 가짜를 거른다
MAGIC = {".png": [b"\x89PNG\r\n\x1a\n"], ".jpg": [b"\xff\xd8\xff"], ".jpeg": [b"\xff\xd8\xff"], ".gif": [b"GIF8"],
         ".webp": [b"RIFF"], ".pdf": [b"%PDF"], ".zip": [b"PK\x03\x04", b"PK\x05\x06"], ".docx": [b"PK\x03\x04"],
         ".xlsx": [b"PK\x03\x04"], ".pptx": [b"PK\x03\x04"], ".hwpx": [b"PK\x03\x04"]}


def _inside(path, root):
    """바로가기(심볼릭 링크)가 아니고, 진짜 위치가 root 안인지 — 상대가 저장소에 링크를 올려 내 맥의 다른 파일을 끌어오지 못하게."""
    try:
        if os.path.islink(path):
            return False
        rp, rr = os.path.realpath(path), os.path.realpath(root)
        return os.path.commonpath([rp, rr]) == rr
    except (OSError, ValueError):
        return False


def safe_take(sp, src_root, dst_dir, name, trust="close"):
    """이웃·일촌이 보낸 파일 하나를 네 겹으로 걸러 dst_dir 로 들인다. 들인 파일 이름 (못 들이면 None).
    ① 허용한 종류만 ② 파일 머리가 이름과 맞는지 ③ 그림은 새로 구워(맥 sips·그 밖 Pillow) 숨은 것을 떨군다
    (PNG 는 PNG 로 — 캐릭터 투명 배경을 지키려고, 나머지 그림은 JPG 로) ④ 보여 줄 때는 서버가 안전하게 내보낸다(send_file_range)."""
    n = _safe_name(name)
    if n.startswith(".") or not os.path.splitext(n)[0].strip():   # 「.png」 처럼 이름 없는 파일은 종류 판정을 건너뛴다 → 안 받는다
        return None
    low = n.lower()
    allow = CLOSE_EXT if trust == "close" else ILCHON_EXT
    if not low.endswith(allow) or not _inside(sp, src_root) or not os.path.isfile(sp):
        return None
    ext = os.path.splitext(low)[1]
    if ext in MAGIC:
        with open(sp, "rb") as f:
            head = f.read(16)
        if not any(head.startswith(m) for m in MAGIC[ext]):
            return None
        if ext == ".webp" and head[8:12] != b"WEBP":
            return None
    os.makedirs(dst_dir, exist_ok=True)
    if ext in IMG_EXT:
        out_ext = ".png" if ext == ".png" else ".jpg"
        out = os.path.splitext(n)[0] + out_ext
        dp = os.path.join(dst_dir, out)
        if not plat.reencode_image(sp, dp, "png" if out_ext == ".png" else "jpeg"):
            try:
                os.remove(dp)
            except OSError:
                pass
            return None
        return out
    shutil.copyfile(sp, os.path.join(dst_dir, n))       # copy2 와 달리 권한·실행 표시를 따라오지 않는다
    return n


def plain(x, n=60):
    """남이 적은 이름류: 괄호·따옴표·줄바꿈처럼 지시문 머리말을 닫거나 명령 줄에 끼어들 글자를 뺀다."""
    return re.sub(r"[\s]+", " ", re.sub(r"[【】「」『』\[\]{}<>'\"`$\\|;&]", "", str(x or ""))).strip()[:n]


def ident(x, n=60):
    return re.sub(r"[^\w\-]", "", str(x or ""))[:n]


def _receive(path, on_character, on_background, trust="close", repo=None):
    """저장소의 편지 한 통 → 받은 편지함 (파일은 data/neighbor/files/<편지id>/ 로 복사).
    일촌(trust=ilchon)이 보낸 것은 편지로만 받는다: 부탁은 세션에 못 들어가고, 캐릭터·배경은 설치하지 않고, 파일은 정해진 종류만."""
    L = _jread(path, None)
    if not isinstance(L, dict) or not L.get("id"):
        return None
    lid = re.sub(r"[^\w\-]", "", str(L["id"]))[:40]
    if not lid or lid.strip("-_") == "":     # id 가 「..」 같은 것이면 빈 id 가 되어 파일이 엉뚱한 자리에 놓인다 (11-26 3차 검수)
        return None
    src_dir = path[:-5]
    dst = _p("neighbor", "files", lid)
    files = []
    total = 0
    for n in (L.get("files") or [])[:40]:
        n = _safe_name(n)
        sp = os.path.join(src_dir, n)
        if not os.path.isfile(sp) or not _inside(sp, src_dir):
            continue
        sz = os.path.getsize(sp)
        total += sz
        if sz > MAX_FILE or total > MAX_LETTER:
            continue
        got = safe_take(sp, src_dir, dst, n, trust)   # 종류·파일 머리·그림 새로 굽기 (가까운 이웃도 똑같이)
        if got:
            files.append(got)
    item = {"id": lid, "kind": L.get("kind") if L.get("kind") in ("letter", "request", "character", "background") else "letter",
            "from": {k: (ident if k in ("vid", "session") else plain)((L.get("from") if isinstance(L.get("from"), dict) else {}).get(k, ""))
                     for k in ("vid", "name", "owner", "session", "sessionTitle")},
            "toSession": ident((L.get("to") if isinstance(L.get("to"), dict) else {}).get("session")),
            "subject": str(L.get("subject") or "")[:120], "text": str(L.get("text") or "")[:8000],
            "files": files, "meta": {k: str(v)[:80] for k, v in (L.get("meta") or {}).items()},
            "at": int(L.get("at") or time.time()), "got": int(time.time()), "state": "new",
            "trust": trust, "repo": repo or conf().get("repo")}
    if trust != "close" and item["kind"] != "letter":
        # 일촌의 부탁·선물은 편지로만 둔다 (세션 전달·자동 설치 없음)
        item["subject"] = {"request": "(부탁) ", "character": "(캐릭터 그림) ", "background": "(배경 그림) "}.get(item["kind"], "") + item["subject"]
        item["kind"] = "letter"
        item["toSession"] = ""
    # 보낸 주민 그림 → files/<편지id>/_av/<포즈>.png (받는 마을에 손님으로 걸어 들어온다)
    av = _avatar_from(path, lid, L)
    if av:
        item["avatar"] = av
    who = item["from"]["name"] or "이웃 빌리지"
    if item["kind"] == "character":
        pngs = {n[:-4]: os.path.join(dst, n) for n in files if n.endswith(".png") and n[:-4] in CHAR_POSES}
        if all(k in pngs for k in ("portrait", "idle", "work", "walkA", "walkB", "raise")) and \
                all(open(p, "rb").read(8) == PNG for p in pngs.values()):
            item["installed"] = on_character(pngs, f"{who} 선물 · {item['meta'].get('name') or '캐릭터'}")
            item["state"] = "done"
        else:
            item["error"] = "캐릭터 그림이 빠졌거나 PNG 가 아닙니다"
    elif item["kind"] == "background":
        pngs = [os.path.join(dst, n) for n in files if n.endswith(".png") and open(os.path.join(dst, n), "rb").read(8) == PNG]
        if pngs:
            item["installed"] = on_background(pngs[0], f"{who} 선물 · {item['meta'].get('name') or '배경'}")
            item["state"] = "done"
        else:
            item["error"] = "배경 그림(PNG)이 없습니다"
    return item


MAIL_PER_DAY = 30
ILCHON_MINI = lambda: True        # server.py 가 설정(ilchonMini)과 잇는다
ILCHON_ON = lambda: True          # server.py 가 설정(ilchonOn)과 잇는다
_MAILQ = {}


def sync(agents=None, on_character=None, on_background=None):
    """이어진 저장소마다: 당기기 → 내 편지함 읽기 → 내 명단 올리기 → 밀기. 한 곳이 실패해도 나머지는 돈다."""
    if not enabled():
        return
    with LOCK:
        if STATE["syncing"]:
            return
        STATE["syncing"] = True
    errs, new = [], 0
    try:
        c = me()
        seen = set(_jread(_p("neighbor-seen.json"), []))
        items = inbox()
        for L in links():
            if L["trust"] != "close" and not ILCHON_ON():
                continue            # 일촌 기능을 끄면 일촌 저장소와는 주고받지 않는다
            repo = L["repo"]
            try:
                if L.get("transport") == "relay":
                    import relay as rl          # 일촌 코드 우편함: 상자 → 폴더
                    rl.pull(L)
                else:
                    try:
                        git("pull", "--rebase", "--autostash", "-q", repo=repo)
                    except RuntimeError as e:
                        if "no tracking information" not in str(e) and "couldn't find remote ref" not in str(e) and \
                                "does not appear to be a git repository" not in str(e):
                            raise
                box = os.path.join(repo, "mail", c["vid"])
                if os.path.isdir(box) and on_character and on_background:
                    for f in sorted(os.listdir(box)):
                        if not f.endswith(".json") or f in seen:
                            continue
                        R = _jread(os.path.join(box, f), None)
                        if isinstance(R, dict) and R.get("receipt"):
                            _ack(R)
                            seen.add(f)
                            continue
                        # 저장소 하나가 하루에 들일 수 있는 편지 수 (일촌 하나가 수백 통으로 받은 편지함 300통을 밀어내지 못하게)
                        day = time.strftime("%Y%m%d")
                        if _MAILQ.get("day") != day:
                            _MAILQ.clear()
                            _MAILQ["day"] = day
                        if L["trust"] != "close" and ILCHON_MINI():
                            seen.add(f)         # 일촌 최소판: 일촌 편지는 받지 않는다 (방명록만)
                            continue
                        if L["trust"] != "close" and _MAILQ.get(repo, 0) >= MAIL_PER_DAY:
                            continue            # 안 본 것으로 두고 내일 받는다
                        _MAILQ[repo] = _MAILQ.get(repo, 0) + 1
                        it = _receive(os.path.join(box, f), on_character, on_background, L["trust"], repo)
                        seen.add(f)
                        if it:
                            items.append(it)
                            new += 1
                    # 옛 버전일 때 받은 편지엔 보낸 주민 그림(클론)이 안 붙었다 → 아직 안 읽었으면 지금 붙인다
                    for it in items:
                        if it.get("state") == "new" and "avatar" not in it and (it.get("repo") or c.get("repo")) == repo:
                            it["avatar"] = _avatar_from(os.path.join(box, it["id"] + ".json"), it["id"]) or []
                            new += 1 if it["avatar"] else 0
                changed = _publish(agents or [], repo) if agents is not None else False
                for fn in ON_SYNC:
                    try:
                        changed = bool(fn(L)) or changed
                    except Exception as e:
                        errs.append(f"{os.path.basename(repo)}: 홈 올리기 {e}"[:200])
                if L.get("transport") == "relay":
                    import relay as rl          # 폴더 → 상자 (잠가서)
                    rl.push(L)
                    continue
                if changed or git("status", "--porcelain", repo=repo).strip():
                    git("add", "-A", repo=repo)
                    git("commit", "-q", "-m", f"village {c.get('name')}: 명단·편지", repo=repo)
                _push(repo)
            except Exception as e:
                errs.append(f"{os.path.basename(repo)}: {e}"[:200])
        if new:
            _save_inbox(items)
        _jwrite(_p("neighbor-seen.json"), sorted(seen))
        STATE.update(lastSync=time.time(), error="; ".join(errs)[:400] or None)
        return new
    except Exception as e:
        STATE["error"] = str(e)[:300]
    finally:
        STATE["syncing"] = False


ON_SYNC = []      # 저장소마다 동기화 때 부르는 함수들 (일촌 홈 올리기 등): fn(link) -> 바뀌었으면 True


def _push(repo=None):
    try:
        ahead = git("rev-list", "--count", "@{u}..HEAD", repo=repo).strip()
    except RuntimeError:
        ahead = "1"          # 아직 올린 적 없는 가지
    if ahead != "0":
        try:
            git("push", "-q", repo=repo)
        except RuntimeError as e:
            if "has no upstream" in str(e) or "no upstream" in str(e):
                git("push", "-q", "-u", "origin", "HEAD", repo=repo)
            else:
                git("pull", "--rebase", "--autostash", "-q", repo=repo)
                git("push", "-q", repo=repo)


# ---------- 보내기 ----------
AV_POSES = ("portrait", "idle", "work", "walkA", "walkB", "raise", "sleep", "cheer", "oops", "tea", "phone", "wave")


def send(to_vid, kind, text="", subject="", files=None, to_session="", from_session="", from_title="", meta=None, avatar=None):
    """files: [(이름, bytes)]. avatar: {포즈: PNG bytes} — 보낸 주민 그림(받는 마을에 손님으로 걸어 들어간다). 돌려주는 값: 편지 id"""
    if not enabled():
        raise ValueError("이웃 빌리지 연결이 아직 안 돼 있습니다 (🏘 이웃 빌리지에서 저장소 폴더를 정하세요)")
    c = me()
    to_vid = re.sub(r"[^\w\-]", "", str(to_vid or ""))
    if not to_vid or to_vid == c["vid"]:
        raise ValueError("받을 빌리지를 골라 주세요")
    if kind not in ("letter", "request", "character", "background"):
        raise ValueError("편지 종류가 맞지 않습니다")
    Lk = repo_of(to_vid)
    if not Lk:
        raise ValueError("그 마을과 이어진 저장소가 없습니다")
    if Lk.get("trust") != "close" and ILCHON_MINI():
        raise ValueError("일촌에게는 편지를 보낼 수 없어요. 일촌 홈의 방명록에 남겨 주세요 (편지는 가까운 이웃끼리만)")
    if Lk["trust"] != "close" and kind == "request":
        raise ValueError("일촌에게는 부탁을 보낼 수 없어요 (편지로 보내 주세요). 부탁은 가까운 이웃끼리만 됩니다")
    repo = Lk["repo"]
    lid = time.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]
    box = os.path.join(repo, "mail", to_vid)
    os.makedirs(box, exist_ok=True)
    names, total = [], 0
    for n, b in (files or [])[:40]:
        n = _safe_name(n)
        total += len(b)
        if len(b) > MAX_FILE:
            raise ValueError(f"「{n}」이 너무 큽니다 (파일 하나 {MAX_FILE // 1_000_000}MB 까지)")
        if total > MAX_LETTER:
            raise ValueError(f"한 번에 {MAX_LETTER // 1_000_000}MB 까지만 보낼 수 있습니다")
        os.makedirs(os.path.join(box, lid), exist_ok=True)
        with open(os.path.join(box, lid, n), "wb") as f:
            f.write(b)
        names.append(n)
    av = []
    for pose, b in (avatar or {}).items():
        if pose in AV_POSES and isinstance(b, (bytes, bytearray)) and b[:8] == PNG and len(b) <= MAX_FILE:
            os.makedirs(os.path.join(box, lid), exist_ok=True)
            with open(os.path.join(box, lid, f"_av_{pose}.png"), "wb") as f:
                f.write(b)
            av.append(pose)
    if "idle" not in av:
        av = []
    L = {"id": lid, "kind": kind, "at": int(time.time()), "avatar": av,
         "from": {"vid": c["vid"], "name": c.get("name"), "owner": c.get("owner"), "session": from_session, "sessionTitle": from_title},
         "to": {"vid": to_vid, "session": to_session}, "subject": subject[:120], "text": text[:8000],
         "files": names, "meta": meta or {}}
    _jwrite(os.path.join(box, lid + ".json"), L)
    sent = _jread(_p("neighbor-sent.json"), [])
    sent.append({"id": lid, "to": to_vid, "kind": kind, "subject": subject[:120], "text": text[:300],
                 "files": names, "at": L["at"], "toSession": to_session, "fromSession": from_session,
                 "fromTitle": from_title, "avatar": bool(av)})
    _jwrite(_p("neighbor-sent.json"), sent[-200:])
    threading.Thread(target=lambda: _commit_push(f"편지 {kind} → {to_vid}", repo), daemon=True).start()
    return lid


def _commit_push(msg, repo=None):
    Lr = link_of_repo(repo) if repo else None
    if Lr and Lr.get("transport") == "relay":
        try:
            import relay as rl
            rl.push(Lr)
            STATE["error"] = None
        except Exception as e:
            STATE["error"] = str(e)[:300]
        return
    with LOCK:
        try:
            git("add", "-A", repo=repo)
            if git("status", "--porcelain", repo=repo).strip():
                git("commit", "-q", "-m", msg, repo=repo)
            _push(repo)
            STATE["error"] = None
        except Exception as e:
            STATE["error"] = str(e)[:300]


def mark(lid, state):
    items = inbox()
    hit = None
    for it in items:
        if it["id"] == lid:
            it["state"] = state
            hit = it
    _save_inbox(items)
    if hit and state != "new":
        _send_receipt(hit, state)


def _send_receipt(it, state):
    """받은 편지를 읽었다/전했다/안 전했다 → 보낸 빌리지에 확인 표시를 돌려보낸다 (보낸 주민이 그때 집으로 돌아간다)."""
    fv = re.sub(r"[^\w\-]", "", str((it.get("from") or {}).get("vid") or ""))
    if not fv or not enabled():
        return
    c = me()
    repo = it.get("repo") or c.get("repo")
    if not link_of_repo(repo):
        return
    box = os.path.join(repo, "mail", fv)
    os.makedirs(box, exist_ok=True)
    _jwrite(os.path.join(box, f"r-{it['id']}-{state}.json"),
            {"id": f"r-{it['id']}", "receipt": it["id"], "state": state, "at": int(time.time()),
             "from": {"vid": c["vid"], "name": c.get("name"), "owner": c.get("owner")}})
    threading.Thread(target=lambda: _commit_push(f"확인 {state} → {fv}", repo), daemon=True).start()


def _ack(R):
    """이웃이 돌려보낸 확인 표시 → 내가 보낸 편지 기록에 적는다."""
    sent = _jread(_p("neighbor-sent.json"), [])
    for x in sent:
        if x.get("id") == R.get("receipt") and not x.get("ack"):
            x["ack"] = str(R.get("state") or "read")[:20]
            x["ackAt"] = int(time.time())
    _jwrite(_p("neighbor-sent.json"), sent[-200:])


def away(max_age=3 * 86400):
    """이웃 빌리지에 편지를 들고 가서 아직 확인을 못 받은 주민 {세션 id: 보낸 기록} / 막 확인받고 돌아온 주민."""
    now = time.time()
    out, back = {}, {}
    for x in _jread(_p("neighbor-sent.json"), []):
        sid = x.get("fromSession")
        if not sid or not x.get("avatar") or x.get("kind") not in ("letter", "request"):
            continue
        if not x.get("ack") and now - (x.get("at") or 0) < max_age:
            out[sid] = x
        elif x.get("ack") and now - (x.get("ackAt") or 0) < 1800:
            back[sid] = x
    for sid in out:
        back.pop(sid, None)
    return out, back


def item(lid):
    return next((it for it in inbox() if it["id"] == lid), None)


def file_path(lid, name):
    lid = re.sub(r"[^\w\-]", "", str(lid))
    p = _p("neighbor", "files", lid, _safe_name(name))
    return p if os.path.isfile(p) else None


def view():
    c = conf()
    items = inbox()
    return {"enabled": enabled(), "repo": c.get("repo", ""), "me": {"vid": c.get("vid"), "name": c.get("name"), "owner": c.get("owner")},
            "share": sorted(shared_ids()), "peers": peers(), "inbox": list(reversed(items))[:100],
            "links": [{k: L.get(k) for k in ("repo", "trust", "callThem", "calledByThem", "peerLogin", "remote")} for L in links()],
            "sent": list(reversed(_jread(_p("neighbor-sent.json"), [])))[:30],
            "unread": len([i for i in items if i.get("state") == "new"]),
            "lastSync": STATE["lastSync"], "error": STATE["error"]}


def avatar_dir(lid):
    """받은 편지에 실려 온 보낸 주민 그림 폴더 (없으면 None)."""
    lid = re.sub(r"[^\w\-]", "", str(lid or ""))[:40]
    d = _p("neighbor", "files", lid, "_av")
    return d if lid and os.path.isfile(os.path.join(d, "idle.png")) else None


def guests(max_age=3 * 86400):
    """아직 안 읽은, 주민 그림이 실려 온 편지들 → 마을에 손님으로 들어와 있을 것들."""
    now = time.time()
    return [it for it in inbox() if it.get("avatar") and it.get("state") == "new" and now - (it.get("got") or 0) < max_age]
