"""일촌 — 깃허브로 모르는 마을과도 이웃을 맺는다 (싸이월드 일촌 느낌). 2026-11-26.

길
  광장   : 각자 깃허브의 공개 저장소 <아이디>/village-plaza. 「일촌 신청 받기」를 켜면 만들어진다.
           일촌 신청 = 그 광장에 이슈 하나 ("[일촌신청] 마을 이름", 본문에 ```json 신청서```).
  수락   : 광장 주인이 「수락」 → 두 사람만 쓰는 비공개 저장소 <주인>/village-ilchon-xxxx 를 만들고
           신청한 사람을 초대한 뒤, 이슈에 ```json {"accepted":true,"repo":...}``` 댓글을 달고 닫는다.
  신청자 : 자기 신청 이슈를 지켜보다가 **광장 주인이 쓴** 수락 댓글을 보면 초대를 받아들이고 내려받는다.
           (댓글은 아무나 달 수 있으니 반드시 글쓴이 = 광장 주인인지 본다.)
  그 뒤  : 그 비공개 저장소가 neighbor.py 의 일촌 저장소(trust=ilchon)로 붙어 편지·방문·홈이 오간다.

미니홈피 (일촌 저장소마다 똑같이 올린다)
  homes/<마을id>/home.json         마을 이름·주인·대문글·공개한 주민·일촌 목록(일촌명만)
  homes/<마을id>/bg.jpg            마을 배경 (작게 줄인 것)
  homes/<마을id>/r_<n>.png         공개한 주민 그림
  homes/<마을id>/guestbook/<id>.json   방명록 한 줄 (손님이 쓴다)
  homes/<마을id>/visits/<날짜>/<손님마을id>  투데이 (손님이 놀러 온 표시)

지킬 것
  - 이슈·방명록·편지는 남이 쓴 글이다. 화면에 보여 주기만 하고 세션에 넣지 않는다.
  - 깃허브 계정 일(로그인·토큰)은 사람이 직접 한다. 여기서는 이미 로그인된 gh 를 쓸 뿐이다.
  - 시험: VILLAGE_FAKE_GH=<폴더> 이면 깃허브 대신 그 폴더를 광장·저장소로 쓴다(진짜 깃허브에 안 올림).
"""
import glob, hashlib, json, os, re, shutil, subprocess, threading, time, uuid

import neighbor as nb
import plat
import relay as rl

DATA = None
SETTING = None            # server 가 넣어 준다: setting(key, default)
ART_DIR = None            # server 가 넣어 준다: () -> 그림 폴더
CAST = None               # () -> {세션id: 그림 열쇠}
PLAZA_NAME = "village-plaza"
FAKE = os.environ.get("VILLAGE_FAKE_GH")
STATE = {"error": None, "login": None, "loginAt": 0, "incoming": [], "incomingAt": 0, "plaza": None}
LOCK = threading.RLock()
TITLE = "[일촌신청]"
MAX_GB = 300


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
    return _jread(_p("ilchon.json"), {})


def save_conf(c):
    _jwrite(_p("ilchon.json"), c)


def _clean(s, n):
    return re.sub(r"[\x00-\x08\x0b-\x1f]", "", str(s or "")).strip()[:n]


def _login_ok(x):
    return bool(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", str(x or "")))


# ---------------------------------------------------------------- 깃허브 (진짜 gh / 시험용 폴더)
ENV = plat.tool_env(GIT_TERMINAL_PROMPT="0", GH_PROMPT_DISABLED="1", NO_COLOR="1")


def _run(cmd, timeout=60, inp=None):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=ENV, input=inp)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-300:] or "실패")
    return r.stdout


def gh(*args, timeout=60, inp=None):
    return _run(["gh", *args], timeout, inp)


def gh_ready():
    """gh 가 깔려 있고 로그인돼 있으면 아이디, 아니면 None (10분 기억)."""
    if FAKE:
        return os.environ.get("VILLAGE_FAKE_LOGIN") or None
    if STATE["login"] and time.time() - STATE["loginAt"] < 600:
        return STATE["login"]
    try:
        lg = gh("api", "user", "--jq", ".login", timeout=20).strip()
        STATE.update(login=lg if _login_ok(lg) else None, loginAt=time.time())
    except Exception:
        STATE.update(login=None, loginAt=time.time())
    return STATE["login"]


def _fake(*a):
    return os.path.join(FAKE, *a)


def plaza_exists(login):
    if FAKE:
        return os.path.isdir(_fake("plazas", login))
    try:
        gh("api", f"repos/{login}/{PLAZA_NAME}", "--jq", ".full_name", timeout=20)
        return True
    except Exception:
        return False


def plaza_create(login):
    if FAKE:
        os.makedirs(_fake("plazas", login, "issues"), exist_ok=True)
        return
    gh("repo", "create", f"{login}/{PLAZA_NAME}", "--public", "--description",
       "에이전트빌리지 일촌 신청함 — 앱의 「🏠 일촌」에서 이 아이디로 신청하면 여기에 이슈로 쌓입니다", "--add-readme", timeout=60)


def issue_create(plaza_owner, title, body):
    if FAKE:
        d = _fake("plazas", plaza_owner, "issues")
        if not os.path.isdir(d):
            raise RuntimeError("Could not resolve to a Repository")
        n = len(os.listdir(d)) + 1
        _jwrite(os.path.join(d, f"{n}.json"), {"number": n, "title": title, "body": body, "state": "OPEN",
                                                "author": {"login": gh_ready()}, "comments": [], "createdAt": time.time()})
        return n
    out = gh("issue", "create", "-R", f"{plaza_owner}/{PLAZA_NAME}", "--title", title, "--body-file", "-", timeout=60, inp=body)
    m = re.search(r"/issues/(\d+)", out)
    if not m:
        raise RuntimeError("신청 번호를 못 받았습니다: " + out[-200:])
    return int(m.group(1))


def issue_list(plaza_owner):
    if FAKE:
        out = []
        for f in sorted(glob.glob(_fake("plazas", plaza_owner, "issues", "*.json"))):
            i = _jread(f, {})
            if i.get("state") == "OPEN":
                out.append(i)
        return out
    raw = gh("issue", "list", "-R", f"{plaza_owner}/{PLAZA_NAME}", "--state", "open", "--limit", "50",
             "--json", "number,title,body,author,createdAt", timeout=40)
    return json.loads(raw or "[]")


def issue_view(plaza_owner, n):
    if FAKE:
        return _jread(_fake("plazas", plaza_owner, "issues", f"{n}.json"), {})
    raw = gh("issue", "view", str(n), "-R", f"{plaza_owner}/{PLAZA_NAME}", "--json", "state,comments,author", timeout=40)
    return json.loads(raw or "{}")


def issue_answer(plaza_owner, n, body, close=True):
    if FAKE:
        f = _fake("plazas", plaza_owner, "issues", f"{n}.json")
        i = _jread(f, {})
        i.setdefault("comments", []).append({"author": {"login": gh_ready()}, "body": body})
        if close:
            i["state"] = "CLOSED"
        _jwrite(f, i)
        return
    gh("issue", "comment", str(n), "-R", f"{plaza_owner}/{PLAZA_NAME}", "--body-file", "-", timeout=40, inp=body)
    if close:
        gh("issue", "close", str(n), "-R", f"{plaza_owner}/{PLAZA_NAME}", timeout=40)


def pair_repo_create(owner, name, guest):
    """둘만 쓰는 비공개 저장소를 만들고 상대를 초대한다. 돌려주는 값: 내려받을 주소."""
    if FAKE:
        bare = _fake("repos", owner, name + ".git")
        os.makedirs(os.path.dirname(bare), exist_ok=True)
        _run(["git", "init", "-q", "--bare", "-b", "main", bare])
        inv = _jread(_fake("invites", guest + ".json"), [])
        inv.append({"repo": f"{owner}/{name}", "url": bare})
        _jwrite(_fake("invites", guest + ".json"), inv)
        return bare
    gh("repo", "create", f"{owner}/{name}", "--private", "--description", "에이전트빌리지 일촌 우편함", "--add-readme", timeout=60)
    gh("api", "-X", "PUT", f"repos/{owner}/{name}/collaborators/{guest}", "-f", "permission=push", timeout=30)
    return f"https://github.com/{owner}/{name}.git"


def accept_invite(full):
    """신청자 쪽: 그 저장소 초대를 받아들인다. 돌려주는 값: 내려받을 주소."""
    if FAKE:
        me_ = gh_ready()
        inv = _jread(_fake("invites", me_ + ".json"), [])
        hit = next((x for x in inv if x["repo"] == full), None)
        if not hit:
            raise RuntimeError("초대가 아직 안 왔습니다")
        return hit["url"]
    raw = gh("api", "user/repository_invitations", timeout=30)
    for x in json.loads(raw or "[]"):
        if (x.get("repository") or {}).get("full_name", "").lower() == full.lower():
            gh("api", "-X", "PATCH", f"user/repository_invitations/{x['id']}", timeout=30)
            break
    return f"https://github.com/{full}.git"


def clone(url, dest):
    if os.path.isdir(os.path.join(dest, ".git")):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not FAKE:
        try:
            gh("auth", "setup-git", timeout=20)   # git 이 비밀번호를 묻지 않고 gh 열쇠를 쓰게
        except Exception:
            pass
    _run(["git", "clone", "-q", "-c", "core.symlinks=false", url, dest], timeout=120)
    try:
        _run(["git", "-C", dest, "rev-parse", "HEAD"])
    except RuntimeError:     # 빈 저장소: 첫 커밋을 만들어 가지를 세운다
        open(os.path.join(dest, ".keep"), "w").close()
        _run(["git", "-C", dest, "add", "-A"])
        _run(["git", "-C", dest, "-c", "user.name=village", "-c", "user.email=village@localhost", "commit", "-q", "-m", "일촌 우편함 시작"])
        _run(["git", "-C", dest, "push", "-q", "-u", "origin", "HEAD"])


# ---------------------------------------------------------------- 신청서 읽고 쓰기
def _block(d):
    return "```json\n" + json.dumps(d, ensure_ascii=False, indent=1) + "\n```"


def _parse_block(body):
    m = re.search(r"```json\s*(\{.*?\})\s*```", str(body or ""), re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(1))
        return d if isinstance(d, dict) else None
    except ValueError:
        return None


def status():
    c = conf()
    login = gh_ready()
    if login and STATE["plaza"] is None:
        STATE["plaza"] = plaza_exists(login)
    me_ = nb.me()
    dist = SETTING("distributor", None) or {}
    code, cerr = None, None
    if rl.enabled() and feature_on():
        try:
            code = rl.my_code()
        except Exception as e:
            cerr = str(e)[:200]
    return {
        "featureOn": feature_on(), "featureAsked": SETTING("ilchonOn", None) is not None,
        "code": code, "relayOn": rl.enabled(), "relayError": cerr,
        "login": login, "ghReady": bool(login), "plaza": bool(STATE["plaza"]),
        "me": {"vid": me_.get("vid"), "name": me_.get("name") or f"{SETTING('ownerName', '사장님')}의 빌리지",
               "owner": SETTING("ownerName", "사장님")},
        "intro": c.get("intro", ""),
        "incoming": STATE["incoming"] + STATE.get("codeIncoming", []),
        "outgoing": [{k: x.get(k) for k in ("login", "issue", "state", "callThem", "calledByThem", "at", "error")} for x in c.get("out") or []]
                    + [{"login": x["target"], "state": x.get("state"), "at": x.get("at"), "callThem": x.get("callThem"), "error": x.get("error")}
                       for x in c.get("codeOut") or []],
        "ilchons": [p for p in nb.peers() if p.get("trust") == "ilchon"],
        "shareIlchonIds": bool(c.get("shareIlchonIds")),
        # 마을 파일이 망가졌거나 아직 안 올라온 일촌 — 화면에 카드가 안 떠도 끊을 수 있게 (11-26 3차 검수)
        "broken": [{"repo": L["repo"], "callThem": str(L.get("callThem") or "")[:40], "peerCode": str(L.get("peerCode") or "")[:20],
                    "peerLogin": str(L.get("peerLogin") or "")[:60]}
                   for L in nb.links() if L.get("trust") == "ilchon"
                   and L.get("peerVid") not in {p["id"] for p in nb.peers()}],
        "close": [p for p in nb.peers() if p.get("trust") == "close"],
        "distributor": dist if (_login_ok(dist.get("github")) or rl.CODE_RE.match(str(dist.get("code") or ""))) else None,
        "distributorAsked": bool(c.get("distAsked")) or bool(dist.get("code") and (
            any((L.get("peerCode") or "") == dist["code"] for L in nb.links())
            or any(x.get("target") == dist["code"] for x in c.get("codeOut") or []) or code == dist["code"])) or (_login_ok(dist.get("github")) and (
            any((L.get("peerLogin") or "").lower() == dist["github"].lower() for L in nb.links())
            or any((x.get("login") or "").lower() == dist["github"].lower() for x in c.get("out") or [])
            or (login or "").lower() == dist["github"].lower())),
        "news": len(news()) if nb.enabled() else 0,
        "boardNew": len([p for p in _board()["posts"].values() if p.get("at", 0) > _jread(_h("seen.json"), {}).get("board", 0) and p.get("dist", 0) > 0]),
        "error": STATE["error"],
    }


def enable_plaza():
    login = gh_ready()
    if not login:
        raise ValueError("깃허브에 로그인돼 있지 않습니다. 터미널에서 `gh auth login` 을 직접 해 주세요")
    if not plaza_exists(login):
        plaza_create(login)
    STATE["plaza"] = True
    return {"ok": True, "plaza": f"{login}/{PLAZA_NAME}"}


def _form(call_them, called_by_them, message):
    me_ = nb.me()
    return {"vid": me_["vid"], "village": status_name(), "owner": SETTING("ownerName", "사장님"),
            "callThem": _clean(call_them, 20), "calledByThem": _clean(called_by_them, 20), "message": _clean(message, 300)}


def request(target, call_them, called_by_them, message):
    """일촌 신청: 일촌 코드(VLG-…)면 코드 우편함으로, 아니면 깃허브 광장에 이슈로."""
    t = str(target or "").strip().upper()
    if rl.CODE_RE.match(t):
        if not rl.enabled():
            raise ValueError("일촌 코드 우편함이 꺼져 있어요")
        c = conf()
        if any(x.get("target") == t and x.get("state") in ("pending", "done") for x in c.get("codeOut") or []):
            raise ValueError("이미 신청했거나 일촌인 마을입니다")
        _ensure_me()
        rec = rl.send_request(t, _form(call_them, called_by_them, message))
        rec.update(state="pending", callThem=_clean(call_them, 20), calledByThem=_clean(called_by_them, 20))
        c = conf()
        c.setdefault("codeOut", []).append(rec)
        save_conf(c)
        return {"ok": True}
    login = gh_ready()
    if not login:
        raise ValueError("깃허브에 로그인돼 있지 않습니다. 터미널에서 `gh auth login` 을 직접 해 주세요")
    target = str(target or "").strip().lstrip("@")
    if not _login_ok(target):
        raise ValueError("깃허브 아이디가 맞지 않습니다")
    if target.lower() == login.lower():
        raise ValueError("나 자신과는 일촌을 맺을 수 없어요")
    c = conf()
    if any(x.get("login", "").lower() == target.lower() and x.get("state") in ("pending", "done") for x in c.get("out") or []):
        raise ValueError("이미 신청했거나 일촌인 마을입니다")
    me_ = nb.me()
    form = {"vid": me_["vid"], "village": status()["me"]["name"], "owner": SETTING("ownerName", "사장님"), "github": login,
            "callThem": _clean(call_them, 20), "calledByThem": _clean(called_by_them, 20), "message": _clean(message, 300)}
    body = (f"**{form['village']}**({form['owner']})이 일촌을 신청했어요.\n\n> {form['message'] or '일촌 맺어요!'}\n\n"
            f"에이전트빌리지 앱의 「🏠 일촌」에서 수락하면 둘만 쓰는 비공개 우편함이 생깁니다.\n\n" + _block(form))
    try:
        n = issue_create(target, f"{TITLE} {form['village']}", body)
    except RuntimeError as e:
        if "Could not resolve" in str(e) or "not found" in str(e).lower() or "404" in str(e):
            raise ValueError(f"{target} 님은 아직 일촌 신청을 받지 않아요 (광장이 없습니다)")
        raise
    c.setdefault("out", []).append({"login": target, "issue": n, "state": "pending", "at": int(time.time()),
                                    "callThem": form["callThem"], "calledByThem": form["calledByThem"]})
    save_conf(c)
    return {"ok": True, "issue": n}


def poll_incoming():
    """내 광장에 쌓인 신청 (열린 이슈) → 화면용 목록."""
    login = gh_ready()
    if not login or not STATE.get("plaza"):
        STATE["incoming"] = []
        return []
    out = []
    for i in issue_list(login):
        if not str(i.get("title", "")).startswith(TITLE):
            continue
        f = _parse_block(i.get("body"))
        author = ((i.get("author") or {}).get("login") or "")
        if not f or not _login_ok(f.get("github")) or f.get("github", "").lower() != author.lower():
            continue          # 신청서 깃허브 아이디가 실제 글쓴이와 다르면 버린다 (남 이름 사칭 막기)
        out.append({"issue": i.get("number"), "login": author, "vid": _clean(f.get("vid"), 20),
                    "village": _clean(f.get("village"), 30), "owner": _clean(f.get("owner"), 20),
                    "callThem": _clean(f.get("callThem"), 20), "calledByThem": _clean(f.get("calledByThem"), 20),
                    "message": _clean(f.get("message"), 300), "at": i.get("createdAt")})
    STATE.update(incoming=out, incomingAt=time.time())
    return out


def _ensure_me():
    """일촌만 쓰는 마을은 이웃 설정이 비어 있다 → 마을 이름·주인 호칭을 채워 둔다 (상대에게 이름이 None 으로 보이지 않게)."""
    c = nb.me()
    owner = SETTING("ownerName", "사장님")
    if not c.get("name") or not c.get("owner"):
        c["name"] = c.get("name") or f"{owner}의 빌리지"
        c["owner"] = c.get("owner") or owner
        nb.save_conf(c)


def _pair_dir(full):
    return _p("ilchon", re.sub(r"[^\w\-.]", "_", full.replace("/", "__")))


def _vid_free(vid):
    """새 일촌이 내세운 마을 id 가 쓸 만한지. 내 id·이미 있는 일촌/이웃의 id 와 겹치면 거절 —
    남의 id 를 자기 것이라 우겨 그 사람 홈·방명록·게시판 이름을 가로채지 못하게 (11-26 보안 재검수 7번)."""
    vid = re.sub(r"[^\w\-]", "", str(vid or ""))[:20]
    if not vid:
        raise ValueError("상대 마을 id 가 없습니다")
    taken = {nb.me()["vid"]} | {L.get("peerVid") for L in nb.links() if L.get("peerVid")} | {p.get("id") for p in nb.peers()}
    if vid in taken:
        raise ValueError("상대가 내세운 마을 id 가 이미 다른 이웃(또는 내 마을)과 같아요. 사칭일 수 있어 맺지 않았어요")
    return vid


def _relay_link(box, peer_code, peer_vid, call_them, called_by_them):
    peer_vid = _vid_free(peer_vid)
    dest = _p("relay", box["pair"])
    os.makedirs(dest, exist_ok=True)
    _ensure_me()
    nb.add_link({"repo": dest, "transport": "relay", "trust": "ilchon", "pair": box["pair"], "master": box["master"],
                 "peerCode": peer_code, "peerVid": peer_vid, "callThem": call_them, "calledByThem": called_by_them,
                 "since": int(time.time())})


def poll_code():
    """코드 우편함: 받은 신청 목록 갱신 + 내 신청에 온 답장 처리."""
    if not rl.enabled():
        STATE["codeIncoming"] = []
        return
    raw = rl.inbox()
    items = []
    for x in raw:
        # 이상한 편지 한 통이 우편함 전체를 멈추지 못하게: 모양이 틀리면 지우고 넘어간다 (11-26 보안 재검수)
        if not isinstance(x, dict) or not isinstance(x.get("body"), dict) or x.get("kind") not in ("req", "ans"):
            try:
                rl.inbox_delete(str((x or {}).get("id") or "") if isinstance(x, dict) else "")
            except Exception:
                pass
            continue
        x["id"] = re.sub(r"[^\w\-]", "", str(x.get("id") or ""))[:60]   # 화면에 그대로 박히므로
        items.append(x)
    STATE["codeItems"] = {x["id"]: x for x in items if x.get("kind") == "req"}
    STATE["codeIncoming"] = [{"issue": "code:" + x["id"], "login": _clean(x["body"].get("fromCode"), 12), "code": True,
                              "vid": _clean(x["body"].get("vid"), 20), "village": _clean(x["body"].get("village"), 30),
                              "owner": _clean(x["body"].get("owner"), 20), "callThem": _clean(x["body"].get("callThem"), 20),
                              "calledByThem": _clean(x["body"].get("calledByThem"), 20), "message": _clean(x["body"].get("message"), 300),
                              "at": int((x.get("at") or 0) / 1000)} for x in items if x.get("kind") == "req" and rl.CODE_RE.match(str(x["body"].get("fromCode", "")))]
    c = conf()
    changed = False
    for x in items:
        if x.get("kind") != "ans":
            continue
        for p in c.get("codeOut") or []:
            if p.get("state") != "pending":
                continue
            try:
                res = rl.check_answer(x, p)
                if res and res is not False:
                    _vid_free(x["body"].get("vid"))
            except Exception:
                res = None
            if res is None:
                continue
            if res is False:
                p["state"] = "rejected"
            else:
                b = x["body"]
                _relay_link(res, p["target"], _clean(b.get("vid"), 20), p.get("callThem") or _clean(b.get("village"), 30) or p["target"],
                            p.get("calledByThem", ""))
                p["state"] = "done"
            p.pop("priv", None)
            changed = True
            try:
                rl.inbox_delete(x["id"])
            except Exception:
                pass
            break
    if changed:
        save_conf(c)


def accept(issue, call_them=None):
    if str(issue).startswith("code:"):
        it = (STATE.get("codeItems") or {}).get(str(issue)[5:])
        if not it:
            poll_code()
            it = (STATE.get("codeItems") or {}).get(str(issue)[5:])
        if not it:
            raise ValueError("그 신청이 없습니다 (이미 처리됐을 수 있어요)")
        b = it["body"]
        _vid_free(b.get("vid"))          # 수락 답장을 보내기 전에 사칭부터 거른다
        _ensure_me()
        box = rl.accept_request(it, _form(call_them or b.get("calledByThem"), b.get("callThem"), ""))
        _relay_link(box, b["fromCode"], _clean(b.get("vid"), 20), _clean(call_them, 20) or _clean(b.get("calledByThem"), 20) or _clean(b.get("village"), 30),
                    _clean(b.get("callThem"), 20))
        poll_code()
        return {"ok": True, "pair": box["pair"]}
    login = gh_ready()
    req = next((x for x in poll_incoming() if x["issue"] == int(issue)), None)
    if not req:
        raise ValueError("그 신청이 없습니다 (이미 처리됐을 수 있어요)")
    _vid_free(req["vid"])
    name = "village-ilchon-" + hashlib.sha1((login + req["login"]).lower().encode()).hexdigest()[:8]
    url = pair_repo_create(login, name, req["login"])
    full = f"{login}/{name}"
    dest = _pair_dir(full)
    clone(url, dest)
    _ensure_me()
    # 내가 상대를 부르는 이름 = 상대가 정해 준 calledByThem 이 기본 (내가 고치면 그것)
    nb.add_link({"repo": dest, "trust": "ilchon", "remote": full, "peerLogin": req["login"], "peerVid": req["vid"],
                 "callThem": _clean(call_them, 20) or req["calledByThem"] or req["village"],
                 "calledByThem": req["callThem"], "since": int(time.time())})
    issue_answer(login, req["issue"], "일촌 수락! 🎉 둘만 쓰는 우편함이 생겼어요.\n\n" +
                 _block({"accepted": True, "repo": full, "vid": nb.me()["vid"]}))
    poll_incoming()
    return {"ok": True, "repo": full}


def reject(issue):
    if str(issue).startswith("code:"):
        it = (STATE.get("codeItems") or {}).get(str(issue)[5:])
        if it:
            rl.reject_request(it)
        poll_code()
        return {"ok": True}
    login = gh_ready()
    issue_answer(login, int(issue), "이번엔 일촌을 맺지 않기로 했어요. 고맙습니다.\n\n" + _block({"accepted": False}))
    poll_incoming()
    return {"ok": True}


def poll_outgoing():
    """내가 보낸 신청: 광장 주인이 쓴 수락 댓글이 달렸으면 초대를 받고 내려받는다."""
    c = conf()
    changed = False
    for x in c.get("out") or []:
        if x.get("state") != "pending":
            continue
        try:
            i = issue_view(x["login"], x["issue"])
        except Exception as e:
            x["error"] = str(e)[:200]
            changed = True
            continue
        ans = None
        for cm in i.get("comments") or []:
            if ((cm.get("author") or {}).get("login") or "").lower() != x["login"].lower():
                continue      # 광장 주인이 아닌 사람의 댓글은 무시
            d = _parse_block(cm.get("body"))
            if d and "accepted" in d:
                ans = d
        if ans and ans.get("accepted") and re.fullmatch(r"[\w\-]+/village-ilchon-[0-9a-f]{8}", str(ans.get("repo") or "")) \
                and ans["repo"].split("/")[0].lower() == x["login"].lower():
            try:
                _vid_free(ans.get("vid"))
                url = accept_invite(ans["repo"])
                dest = _pair_dir(ans["repo"])
                clone(url, dest)
                _ensure_me()
                nb.add_link({"repo": dest, "trust": "ilchon", "remote": ans["repo"], "peerLogin": x["login"],
                             "peerVid": _clean(ans.get("vid"), 20), "callThem": x.get("callThem") or x["login"],
                             "calledByThem": x.get("calledByThem", ""), "since": int(time.time())})
                x.update(state="done", error=None)
            except Exception as e:
                x["error"] = str(e)[:200]
            changed = True
        elif ans and not ans.get("accepted"):
            x.update(state="rejected")
            changed = True
        elif str(i.get("state", "")).upper() == "CLOSED" and not ans:
            x.update(state="rejected")
            changed = True
    if changed:
        save_conf(c)


def answer_distributor(yes, call_them="", called_by_them="", message=""):
    c = conf()
    c["distAsked"] = True
    save_conf(c)
    if not yes:
        return {"ok": True}
    d = SETTING("distributor", None) or {}
    if rl.CODE_RE.match(str(d.get("code") or "")) and rl.enabled():
        return request(d["code"], call_them or d.get("name") or d["code"], called_by_them, message or "영상 보고 왔어요! 일촌 맺어요 🙌")
    if not _login_ok(d.get("github")):
        raise ValueError("배포자 정보가 없습니다")
    return request(d["github"], call_them or d.get("name") or d["github"], called_by_them, message or "영상 보고 왔어요! 일촌 맺어요 🙌")


def leave(repo):
    """일촌 끊기: 우리 쪽 연결만 지운다 (저장소 자체는 그대로)."""
    L = next((x for x in nb.links() if x["repo"] == repo and x["trust"] == "ilchon"), None)
    if not L:
        raise ValueError("그 일촌이 없습니다")
    nb.remove_link(repo)
    return {"ok": True}


def rename(repo, call_them):
    c = nb.conf()
    for L in c.get("links") or []:
        if L.get("repo") == repo:
            L["callThem"] = _clean(call_them, 20)
    nb.save_conf(c)
    return {"ok": True}


# ---------------------------------------------------------------- 마을 홈피 (싸이월드 미니홈피를 우리 식으로)
# 주인 쪽 원본: data/home/ (profile·diary·photos·replies·seen)
# 저장소마다 올리는 공개본: homes/<내id>/ home.json · posts.json · pub.json · bg.jpg · minime.png · r_N.png · ph_<id>.jpg · bgm.<확장자>
# 손님이 쓰는 것(그 손님과 같이 쓰는 저장소에만): homes/<주인id>/ guestbook/ · pyeong/<손님id>.json · comments/<글id>/ · gifts/ · visits/<날짜>/
MOODS = ["😊", "🥰", "😎", "😴", "🤔", "😢", "😡", "🤒", "🥳", "😐"]
SKINS = {"sky": ("하늘", 0), "peach": ("복숭아", 0), "mint": ("민트", 0), "lavender": ("라벤더", 0),
         "night": ("밤하늘", 5), "check": ("체크무늬", 5), "denim": ("청바지", 8), "gold": ("황금", 15)}
MAX_PHOTOS, MAX_POSTS, MAX_BGM = 40, 200, 9_000_000
BG_LIST = BG_PATH = CHARS = None          # server 가 넣어 준다


def _h(*a):
    return _p("home", *a)


def profile():
    pr = _jread(_h("profile.json"), {})
    pr["skins"] = list(SKINS)                 # 스킨은 전부 공짜 (솔방울 없앰 11-26)
    pr.setdefault("skin", "sky")
    return pr


def save_profile(pr):
    _jwrite(_h("profile.json"), pr)


def _posts():
    return _jread(_h("posts.json"), [])


def _earn(key, n, why):
    """솔방울은 11-26 사장님 판단으로 없앴다 — 부르는 곳이 남아 있어도 아무 일 안 한다."""
    return 0
    pr = profile()
    got = pr.setdefault("earned", {})
    if key in got:
        return 0
    got[key] = int(time.time())
    if len(got) > 2000:
        for k in sorted(got, key=got.get)[:500]:
            got.pop(k)
    pr["pine"] = int(pr.get("pine", 0)) + n
    pr.setdefault("pineLog", []).append({"at": int(time.time()), "n": n, "why": why})
    pr["pineLog"] = pr["pineLog"][-50:]
    save_profile(pr)
    return n


def _spend(n, why):
    pr = profile()
    if int(pr.get("pine", 0)) < n:
        raise ValueError(f"솔방울이 모자라요 (필요 {n}개, 가진 것 {pr.get('pine', 0)}개)")
    pr["pine"] = int(pr["pine"]) - n
    pr.setdefault("pineLog", []).append({"at": int(time.time()), "n": -n, "why": why})
    pr["pineLog"] = pr["pineLog"][-50:]
    save_profile(pr)


def set_profile(req):
    """기분·한마디·대문글·스킨·대표 주민·방 배경 고치기."""
    pr = profile()
    if "mood" in req:
        pr["mood"] = req["mood"] if req["mood"] in MOODS else ""
    if "line" in req:
        pr["line"] = _clean(req["line"], 60)
    if "intro" in req:
        c = conf()
        c["intro"] = _clean(req["intro"], 400)
        save_conf(c)
    if "skin" in req:
        sk = str(req["skin"])
        if sk not in SKINS:
            raise ValueError("없는 스킨입니다")
        pr["skin"] = sk
    if "minime" in req:
        k = str(req["minime"] or "")
        pr["minime"] = k if re.fullmatch(r"[\w\-]{1,40}", k) and os.path.isfile(os.path.join(ART_DIR(), k, "idle.png")) else ""
    if "room" in req:
        r = str(req["room"] or "")
        pr["room"] = r if (r == "" or (BG_PATH and BG_PATH(r))) else pr.get("room", "")
    save_profile(pr)
    return {"ok": True}


YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def yt_id(url):
    """유튜브·유튜브 뮤직 링크에서 영상 id 를 꺼낸다 (아니면 None)."""
    import urllib.parse
    u = urllib.parse.urlparse(str(url or "").strip())
    host = (u.hostname or "").lower()
    if host.endswith("youtu.be"):
        vid = u.path.strip("/").split("/")[0]
    elif host.endswith("youtube.com"):
        q = urllib.parse.parse_qs(u.query)
        vid = (q.get("v") or [""])[0] or (u.path.split("/")[2] if u.path.startswith(("/embed/", "/shorts/")) else "")
    else:
        return None
    return vid if YT_ID.match(vid or "") else None


def set_bgm(url, title=""):
    """배경음악 = 유튜브 뮤직(유튜브) 링크. 음악 파일을 주고받지 않으니 저작권 걱정이 없다 (11-26 사장님 결정)."""
    vid = yt_id(url)
    if not vid:
        raise ValueError("유튜브 뮤직이나 유튜브 노래 링크를 넣어 주세요 (예: https://music.youtube.com/watch?v=…)")
    pr = profile()
    pr["bgm"] = _clean(title, 60) or "배경음악"
    pr["bgmId"] = vid
    pr.pop("bgmExt", None)
    save_profile(pr)
    for f in glob.glob(_h("bgm.*")):
        os.remove(f)
    return {"ok": True}


def clear_bgm():
    for f in glob.glob(_h("bgm.*")):
        os.remove(f)
    pr = profile()
    for k in ("bgm", "bgmExt", "bgmId"):
        pr.pop(k, None)
    save_profile(pr)
    return {"ok": True}


def post_add(kind, title, text, scope="all", mood="", image=None):
    """다이어리(diary)·사진첩(photo) 글 올리기. 사진은 작게 줄여 저장."""
    import base64
    if kind not in ("diary", "photo"):
        raise ValueError("글 종류가 맞지 않습니다")
    title, text = _clean(title, 80), _clean(text, 3000)
    if not (title or text or image):
        raise ValueError("내용을 써 주세요")
    pid = time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4]
    it = {"id": pid, "kind": kind, "at": int(time.time()), "title": title, "text": text,
          "scope": "me" if scope == "me" else "all", "mood": mood if mood in MOODS else ""}
    if kind == "photo":
        if not image:
            raise ValueError("사진을 골라 주세요")
        if len([p for p in _posts() if p["kind"] == "photo"]) >= MAX_PHOTOS:
            raise ValueError(f"사진첩은 {MAX_PHOTOS}장까지예요. 옛 사진을 지워 주세요")
        raw = base64.b64decode(str(image).split(",")[-1])
        if len(raw) > 25_000_000:
            raise ValueError("사진이 너무 커요 (25MB 까지)")
        os.makedirs(_h("photos"), exist_ok=True)
        tmp = _h("photos", pid + ".src")
        with open(tmp, "wb") as f:
            f.write(raw)
        dst = _h("photos", pid + ".jpg")
        try:
            if not plat.reencode_image(tmp, dst, "jpeg", quality=82, max_side=400):
                raise ValueError
        except Exception:
            os.remove(tmp)
            raise ValueError("그림 파일이 아니에요 (jpg·png·heic 등)")
        os.remove(tmp)
        it["img"] = pid + ".jpg"
    ps = _posts()
    ps.append(it)
    _jwrite(_h("posts.json"), ps[-MAX_POSTS:])
    return {"ok": True, "id": pid}


def post_delete(pid):
    pid = re.sub(r"[^\w]", "", str(pid or ""))
    ps = [p for p in _posts() if p["id"] != pid]
    _jwrite(_h("posts.json"), ps)
    f = _h("photos", pid + ".jpg")
    if os.path.isfile(f):
        os.remove(f)
    return {"ok": True}


def _bg_source():
    pr = profile()
    if pr.get("room") and BG_PATH:
        p = BG_PATH(pr["room"])
        if p:
            return p
    bp = os.path.join(ART_DIR(), "background.png")
    return bp if os.path.isfile(bp) else None


def status_name():
    me_ = nb.me()
    return me_.get("name") or f"{SETTING('ownerName', '사장님')}의 빌리지"


def _bg_jpg(src, dst):
    try:
        plat.reencode_image(src, dst, "jpeg", quality=70, max_side=960)
    except Exception:
        pass


# ---- 손님이 쓴 것 모으기 (주인 쪽: 이어진 모든 저장소에서) ----
def _home_dirs(vid):
    """homes/<vid> 를 찾을 저장소들. 남의 홈은 「그 사람과 이어진 저장소」에서만 읽는다 —
    일촌 A 가 자기 저장소에 B 의 홈을 꾸며 올려도 B 의 홈으로 보이지 않게 (11-26 보안 검수 7번)."""
    vid = re.sub(r"[^\w\-]", "", str(vid or ""))
    me_ = nb.me()["vid"]
    out = []
    for L in nb.links():
        if vid != me_ and L.get("trust") == "ilchon" and L.get("peerVid") != vid:
            continue
        d = os.path.join(L["repo"], "homes", vid)
        if os.path.isdir(d) and nb._inside(d, L["repo"]):
            out.append((L, d))
    return out


def _who(fr, L=None):
    """글쓴이. 일촌 저장소에서 온 글이면 「그 저장소의 상대」로 못 박는다 — JSON 에 남의 이름을 적어 사칭하지 못하게."""
    fr = fr or {}
    w = {k: _clean(fr.get(k), 30) for k in ("vid", "name", "owner", "callAs")}
    pv = (L or {}).get("peerVid")
    if L and L.get("trust") == "ilchon" and pv and w["vid"] != pv:
        w = {"vid": pv, "name": "", "owner": "(이름 확인 안 됨)", "callAs": ""}
    return w


def _raw(vid, sub):
    """homes/<vid>/<sub>/*.json 을 저장소들에서 모은다 (같은 파일 이름은 한 번만)."""
    seen, out = set(), []
    for L, d in _home_dirs(vid):
        for f in glob.glob(os.path.join(d, sub, "*.json")):
            n = os.path.basename(f)[:-5]
            if n in seen or not nb._inside(f, L["repo"]):
                continue
            g = _jread(f, None)
            if isinstance(g, dict):
                seen.add(n)
                out.append((n, g, L))
    return out


def _gather_mine():
    me_ = nb.me()["vid"]
    replies = _jread(_h("replies.json"), {})
    gb = [{"id": n, "text": _clean(g.get("text"), MAX_GB), "at": int(g.get("at") or 0), "secret": bool(g.get("secret")),
           "from": _who(g.get("from"), _L), "reply": _clean(replies.get(n), 300)} for n, g, _L in _raw(me_, "guestbook")]
    py = [{"id": n, "text": _clean(g.get("text"), 60), "at": int(g.get("at") or 0), "from": _who(g.get("from"), _L)}
          for n, g, _L in _raw(me_, "pyeong")]
    cm = {}
    for L, d in _home_dirs(me_):
        for f in glob.glob(os.path.join(d, "comments", "*", "*.json")):
            pid = os.path.basename(os.path.dirname(f))
            g = _jread(f, None) if nb._inside(f, L["repo"]) else None
            if isinstance(g, dict):
                lst = cm.setdefault(pid, [])
                cid = os.path.basename(f)[:-5]
                if not any(c["id"] == cid for c in lst):
                    lst.append({"id": cid, "text": _clean(g.get("text"), 300), "at": int(g.get("at") or 0), "from": _who(g.get("from"), L)})
    for v in cm.values():
        v.sort(key=lambda c: c["at"])
    return sorted(gb, key=lambda x: -x["at"])[:200], sorted(py, key=lambda x: -x["at"])[:50], cm


def _collect_gifts():
    """일촌이 보낸 솔방울 선물 → 내 솔방울에 더한다 (한 번만)."""
    me_ = nb.me()["vid"]
    for n, g, _L in _raw(me_, "gifts"):
        k = int(g.get("pine") or 0)
        if 0 < k <= 50:
            _earn("gift:" + n, k, f"{_clean((g.get('from') or {}).get('owner'), 20) or '일촌'}님의 선물")


def _visits(vid):
    today = time.strftime("%Y%m%d")
    t, total = set(), set()
    for L, d in _home_dirs(vid):
        for f in glob.glob(os.path.join(d, "visits", "*", "*")):
            day = os.path.basename(os.path.dirname(f))
            total.add(day + os.path.basename(f))
            if day == today:
                t.add(os.path.basename(f))
    return len(t), len(total)


def _home_payload():
    """올릴 홈 공개본 (공개한 주민만·나만 보기 글 빼고)."""
    me_ = nb.me()
    pr = profile()
    share = nb.shared_ids()
    cast = CAST() or {}
    res, imgs = [], {}
    for i, sid in enumerate(sorted(share)):
        key = cast.get(sid)
        idle = os.path.join(ART_DIR(), str(key or ""), "idle.png") if key and re.fullmatch(r"[\w\-]+", str(key)) else ""
        title = next((a.get("title") for a in (STATE.get("agents") or []) if a.get("id") == sid), "") or "주민"
        item = {"title": _clean(title, 40)}
        if idle and os.path.isfile(idle):
            item["img"] = f"r_{i}.png"
            imgs[item["img"]] = idle
        res.append(item)
    if pr.get("minime"):
        mp = os.path.join(ART_DIR(), pr["minime"], "idle.png")
        if os.path.isfile(mp):
            imgs["minime.png"] = mp
    # 내 일촌 목록은 이름·일촌명만 올린다. 마을 id 는 절대 안 올리고(남의 id 로 편지 가로채기 재료가 됨),
    # 깃허브 아이디·일촌 코드는 주인이 「관리」에서 켰을 때만 (일촌의 일촌이 신청할 수 있게) — 11-26 3차 검수 8번
    share_ids = bool(conf().get("shareIlchonIds"))
    ilchons = [{"name": _clean(p.get("name"), 30), "callThem": _clean(p.get("callThem"), 20),
                "login": p.get("peerLogin", "") if share_ids and p.get("trust") == "ilchon" else "",
                "code": p.get("peerCode", "") if share_ids else ""}
               for p in nb.peers() if p.get("trust") == "ilchon"][:40]
    gb, py, cm = _gather_mine()
    posts = [p for p in _posts() if p.get("scope") != "me"]
    home = {"vid": me_["vid"], "name": status_name(), "owner": SETTING("ownerName", "사장님"),
            "intro": conf().get("intro", ""), "mood": pr.get("mood", ""), "line": pr.get("line", ""),
            "skin": pr.get("skin", "sky"), "bgm": pr.get("bgm", "") if pr.get("bgmId") else "", "bgmId": pr.get("bgmId", ""),
            "minime": "minime.png" if "minime.png" in imgs else "",
            "residents": res, "ilchons": ilchons, "bg": "bg.jpg" if _bg_source() else ""}
    pub = {"guestbook": [g for g in gb if not g["secret"]][:150], "pyeong": py, "comments": cm}
    return home, imgs, posts, pub


def publish_home(L):
    """저장소마다 내 홈 공개본을 올린다 (바뀌었을 때만). neighbor.sync 가 부른다."""
    _collect_gifts()
    me_ = nb.me()
    d = os.path.join(L["repo"], "homes", me_["vid"])
    home, imgs, posts, pub = _home_payload()
    src = _bg_source()
    if _mini_link(L):
        # 일촌에게는 이름·한마디·주민 그림·방명록만
        home = {k: home.get(k) for k in ("vid", "name", "owner", "mood", "line", "residents")}
        home.update(mini=True, ilchons=[], intro="", skin="sky", minime="", bg="", bgm="", bgmId="")
        imgs = {k: v for k, v in imgs.items() if k.startswith("r_")}
        home["residents"] = [{"img": r["img"], "title": ""} if r.get("img") else {"title": ""} for r in home.get("residents") or []]   # 세션 이름은 안 보낸다
        posts, pub, src = [], {"guestbook": pub.get("guestbook", [])}, None
    bgm = None          # 배경음악은 이제 링크라 파일을 올리지 않는다
    stamp = lambda p: str(os.path.getmtime(p)) if p and os.path.exists(p) else "0"
    sig = hashlib.sha1(json.dumps([home, posts, pub], sort_keys=True, ensure_ascii=False).encode()
                       + "".join(stamp(p) for p in imgs.values()).encode() + stamp(src).encode() + stamp(bgm).encode()).hexdigest()
    old = _jread(os.path.join(d, "home.json"), {})
    if old.get("sig") == sig:
        return False
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "r_*.png")) + glob.glob(os.path.join(d, "minime.png")):
        os.remove(f)
    for n, p in imgs.items():
        if _mini_link(L):
            # 일촌 쪽은 200KB·512픽셀 넘는 그림을 버린다 → 맞춰서 줄여 올린다
            for side in (512, 384, 256, 192):
                if plat.reencode_image(p, os.path.join(d, n), "png", max_side=side) and \
                        os.path.getsize(os.path.join(d, n)) <= PNG_MAX_BYTES:
                    break
        else:
            shutil.copy2(p, os.path.join(d, n))
    if src and old.get("bgSig") != stamp(src):
        _bg_jpg(src, os.path.join(d, "bg.jpg"))
    if not src and os.path.isfile(os.path.join(d, "bg.jpg")):
        os.remove(os.path.join(d, "bg.jpg"))
    want = {p["img"] for p in posts if p.get("img")}
    for f in glob.glob(os.path.join(d, "ph_*.jpg")):
        if os.path.basename(f)[3:] not in want:
            os.remove(f)
    for n in want:
        dst = os.path.join(d, "ph_" + n)
        if not os.path.isfile(dst) and os.path.isfile(_h("photos", n)):
            shutil.copy2(_h("photos", n), dst)
    for f in glob.glob(os.path.join(d, "bgm.*")):
        if not bgm or os.path.basename(f) != os.path.basename(bgm):
            os.remove(f)
    if bgm and (old.get("bgmSig") != stamp(bgm) or not os.path.isfile(os.path.join(d, os.path.basename(bgm)))):
        shutil.copy2(bgm, os.path.join(d, os.path.basename(bgm)))
    _jwrite(os.path.join(d, "posts.json"), posts)
    _jwrite(os.path.join(d, "pub.json"), pub)
    home.update(sig=sig, bgSig=stamp(src), bgmSig=stamp(bgm), updated=int(time.time()))
    _jwrite(os.path.join(d, "home.json"), home)
    return True


# ---------------------------------------------------------------- 일촌 최소판 (11-27)
# 낯선 사람(일촌)과는 마을 이름·한마디·주민 캐릭터 그림·방명록 글만 주고받는다. 사진·다이어리·게시판·편지·일촌평·댓글·배경 없음.
# 가까운 이웃(아는 사람)은 그대로. 설정 ilchonMini 로 끄고 켠다 (기본 켬).
def feature_on():
    """일촌 기능(낯선 마을과 맺기)을 사장님이 켰는지. 배포판은 처음에 소개하고 물어본다 — 기본 꺼짐 (11-27)."""
    return SETTING("ilchonOn", None) is True


def mini():
    return bool(SETTING("ilchonMini", True))


def _mini_link(L):
    return bool(L) and L.get("trust") == "ilchon" and mini()


PNG_MAX_BYTES, PNG_MAX_SIDE = 200_000, 512


def safe_png(src, dst):
    """남이 보낸 캐릭터 그림 → 세 겹으로 걸러 dst 에 새로 굽는다. 성공하면 True.
    ① PNG 만 ② 200KB·512픽셀까지 — 가로세로는 해석기에 넘기기 전에 파일 머리에서 먼저 읽는다 ③ 따로 띄운 프로그램으로 새로 굽기"""
    try:
        if os.path.islink(src) or not os.path.isfile(src) or os.path.getsize(src) > PNG_MAX_BYTES:
            return False
        with open(src, "rb") as f:
            head = f.read(24)
        if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
            return False
        w, h = int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")
        if not (0 < w <= PNG_MAX_SIDE and 0 < h <= PNG_MAX_SIDE):
            return False
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        return plat.reencode_image(src, dst, "png")
    except OSError:
        return False


def _baked(vid, name, src):
    """남의 홈 그림을 내 자료 폴더에 구운 사본으로 (원본이 바뀌면 다시 굽는다). 못 구우면 None."""
    dst = _h("ilchon-cache", re.sub(r"[^\w\-]", "", vid), name)
    try:
        if os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            return dst
    except OSError:
        return None
    return dst if safe_png(src, dst) else None


def _url(vid, name):
    return f"/api/ilchon/file?vid={vid}&name={name}"


def home(vid):
    """홈 보기. vid='me' 면 내 홈(원본 + 손님들이 남긴 것 전부, 비밀글 포함)."""
    me_ = nb.me()
    mine = vid in ("me", me_["vid"])
    if mine:
        _collect_gifts()
        pr = profile()
        h, imgs, _posts_pub, _pub = _home_payload()
        h["bgUrl"] = _url("me", "bg") if h["bg"] else ""
        h["minimeUrl"] = f"/art/{pr['minime']}/idle.png" if h["minime"] else ""
        cast = CAST() or {}
        share = sorted(nb.shared_ids())
        for i, r in enumerate(h["residents"]):
            r["url"] = f"/art/{cast.get(share[i])}/idle.png" if r.get("img") else ""
        h["bgmLink"] = f"https://music.youtube.com/watch?v={h['bgmId']}" if h.get("bgmId") else ""
        h["posts"] = [{**p, "url": _url("me", "photo-" + p["img"]) if p.get("img") else ""} for p in reversed(_posts())]
        gb, py, cm = _gather_mine()
        h.update(guestbook=gb, pyeong=py, comments=cm, vid=me_["vid"], pine=pr.get("pine", 0), skins=pr.get("skins"),
                 pineLog=list(reversed(pr.get("pineLog", [])))[:20], room=pr.get("room", ""),
                 rooms=[{"id": b["id"], "name": b.get("name", "")} for b in (BG_LIST() if BG_LIST else [])][:30],
                 chars=[{"key": c.get("key"), "name": c.get("name") or c.get("key")} for c in (CHARS() if CHARS else [])][:60],
                 skinList=[{"id": k, "name": v[0], "cost": v[1]} for k, v in SKINS.items()], moods=MOODS,
                 news=news())
        # 새소식 확인 표시: 내 홈을 열면 손님 글을 본 것으로
        seen = _jread(_h("seen.json"), {})
        seen["mine"] = int(time.time())
        _jwrite(_h("seen.json"), seen)
    else:
        vid = re.sub(r"[^\w\-]", "", str(vid or ""))
        ds = _home_dirs(vid)
        if not ds:
            raise ValueError("그 마을의 홈이 아직 안 올라왔어요 (이어진 뒤 1~2분 걸립니다)")
        L, d = max(ds, key=lambda x: _jread(os.path.join(x[1], "home.json"), {}).get("updated", 0))
        raw = _jread(os.path.join(d, "home.json"), {})
        bid = raw.get("bgmId") if YT_ID.match(str(raw.get("bgmId") or "")) else ""
        h = {"vid": vid, "name": _clean(raw.get("name"), 30), "owner": _clean(raw.get("owner"), 20), "intro": _clean(raw.get("intro"), 400),
             "mood": raw.get("mood") if raw.get("mood") in MOODS else "", "line": _clean(raw.get("line"), 60),
             "skin": raw.get("skin") if raw.get("skin") in SKINS else "sky",
             "bgm": _clean(raw.get("bgm"), 60) if bid else "", "bgmId": bid,
             "bgmLink": f"https://music.youtube.com/watch?v={bid}" if bid else "",
             "minimeUrl": _url(vid, "minime.png") if os.path.isfile(os.path.join(d, "minime.png")) else "",
             "residents": [{"title": _clean(r.get("title"), 40),
                            "url": _url(vid, r["img"]) if re.fullmatch(r"r_\d+\.png", str(r.get("img") or "")) else ""}
                           for r in (raw.get("residents") or [])[:40]],
             "ilchons": [{"name": _clean(x.get("name"), 30), "callThem": _clean(x.get("callThem"), 20),
                          "login": x.get("login") if _login_ok(x.get("login")) else "",
                          "code": x.get("code") if rl.CODE_RE.match(str(x.get("code") or "")) else "",
                          "vid": re.sub(r"[^\w\-]", "", str(x.get("vid") or ""))}
                         for x in (raw.get("ilchons") or [])[:40]],
             "bgUrl": _url(vid, "bg.jpg") if os.path.isfile(os.path.join(d, "bg.jpg")) else ""}
        posts = _jread(os.path.join(d, "posts.json"), [])
        h["posts"] = [{"id": re.sub(r"[^\w]", "", str(p.get("id"))), "kind": p.get("kind") if p.get("kind") in ("diary", "photo") else "diary",
                       "at": int(p.get("at") or 0), "title": _clean(p.get("title"), 80), "text": _clean(p.get("text"), 3000),
                       "mood": p.get("mood") if p.get("mood") in MOODS else "",
                       "url": _url(vid, "ph_" + p["img"]) if re.fullmatch(r"\w+\.jpg", str(p.get("img") or "")) else ""}
                      for p in reversed(posts if isinstance(posts, list) else [])][:MAX_POSTS]
        pub = _jread(os.path.join(d, "pub.json"), {})
        me_v = me_["vid"]
        # 공개본 + 내가 막 쓴 것(아직 주인이 다시 올리기 전) 합치기
        gb = {g.get("id"): {"id": g.get("id"), "text": _clean(g.get("text"), MAX_GB), "at": int(g.get("at") or 0), "secret": False,
                            "from": _who(g.get("from")), "reply": _clean(g.get("reply"), 300)} for g in (pub.get("guestbook") or [])}
        for f in glob.glob(os.path.join(d, "guestbook", "*.json")):
            n = os.path.basename(f)[:-5]
            g = _jread(f, {})
            if n not in gb and (g.get("from") or {}).get("vid") == me_v:
                gb[n] = {"id": n, "text": _clean(g.get("text"), MAX_GB), "at": int(g.get("at") or 0), "secret": bool(g.get("secret")),
                         "from": _who(g.get("from")), "reply": ""}
        py = {x.get("id"): {"id": x.get("id"), "text": _clean(x.get("text"), 60), "at": int(x.get("at") or 0), "from": _who(x.get("from"))}
              for x in (pub.get("pyeong") or [])}
        mine_py = _jread(os.path.join(d, "pyeong", me_v + ".json"), None)
        if isinstance(mine_py, dict):
            py[me_v] = {"id": me_v, "text": _clean(mine_py.get("text"), 60), "at": int(mine_py.get("at") or 0), "from": _who(mine_py.get("from"))}
        cm = {k: [{"id": c.get("id"), "text": _clean(c.get("text"), 300), "at": int(c.get("at") or 0), "from": _who(c.get("from"))} for c in v]
              for k, v in (pub.get("comments") or {}).items() if isinstance(v, list)}
        for f in glob.glob(os.path.join(d, "comments", "*", "*.json")):
            pid, cid = os.path.basename(os.path.dirname(f)), os.path.basename(f)[:-5]
            g = _jread(f, {})
            lst = cm.setdefault(pid, [])
            if not any(c["id"] == cid for c in lst):
                lst.append({"id": cid, "text": _clean(g.get("text"), 300), "at": int(g.get("at") or 0), "from": _who(g.get("from"))})
        h["guestbook"] = sorted(gb.values(), key=lambda x: -x["at"])
        h["pyeong"] = sorted(py.values(), key=lambda x: -x["at"])
        h["comments"] = cm
        if _mini_link(L):
            # 일촌 최소판: 이름·한마디·주민 그림·방명록만 보여 준다
            h.update(mini=True, intro="", bgm="", bgmId="", bgmLink="", minimeUrl="", bgUrl="", ilchons=[], posts=[],
                     pyeong=[], comments={}, skin="sky",
                     residents=[{"title": "", "url": r.get("url", "")} for r in h["residents"]])   # 세션 이름은 안 보인다
        p = next((x for x in nb.peers() if x["id"] == vid), {})
        h.update(trust=p.get("trust"), callThem=p.get("callThem", ""), calledByThem=p.get("calledByThem", ""), pine=profile().get("pine", 0))
        seen = _jread(_h("seen.json"), {})
        seen[vid] = int(time.time())
        _jwrite(_h("seen.json"), seen)
    h["mine"] = mine
    h["today"], h["total"] = _visits(h["vid"])
    return h


def news():
    """일촌 새소식: 일촌 홈의 새 글·사진 + 내 홈에 손님이 남긴 새 글."""
    seen = _jread(_h("seen.json"), {})
    out = []
    for p in nb.peers():
        for _L, d in _home_dirs(p["id"])[:1]:
            if _mini_link(_L):
                continue
            for x in (_jread(os.path.join(d, "posts.json"), []) or [])[-5:]:
                if isinstance(x, dict) and int(x.get("at") or 0) > seen.get(p["id"], 0):
                    out.append({"vid": p["id"], "who": p.get("callThem") or p.get("name"), "kind": x.get("kind"),
                                "title": _clean(x.get("title") or x.get("text"), 40), "at": int(x.get("at") or 0)})
    me_ = nb.me()["vid"]
    for sub, label in (("guestbook", "방명록"), ("pyeong", "일촌평")):
        for n, g, _L in _raw(me_, sub):
            if int(g.get("at") or 0) > seen.get("mine", 0):
                w = _who(g.get("from"), _L)
                out.append({"vid": "me", "who": _clean(w.get("callAs") or w.get("owner"), 20),
                            "kind": sub, "title": label + ": " + _clean(g.get("text"), 30), "at": int(g.get("at") or 0)})
    return sorted(out, key=lambda x: -x["at"])[:30]


def home_file(vid, name):
    name = str(name or "")
    if vid == "board":
        return board_avatar(name)
    if vid == "me":
        if name == "bg":
            return _bg_source()
        if name.startswith("photo-") and re.fullmatch(r"photo-\w+\.jpg", name):
            f = _h("photos", name[6:])
            return f if os.path.isfile(f) else None
        return None
    if not re.fullmatch(r"bg\.jpg|minime\.png|r_\d+\.png|ph_\w+\.jpg", name):
        return None
    for _L, d in _home_dirs(vid):
        f = os.path.join(d, name)
        if os.path.isfile(f):
            if _mini_link(_L):
                # 일촌에게서는 주민 캐릭터 그림만, 그것도 걸러서 새로 구운 사본으로
                return _baked(vid, name, f) if re.fullmatch(r"r_\d+\.png", name) else None
            return f
    return None


def _write_in(vid, sub, fname, obj, overwrite=False):
    """그 마을과 이어진 저장소의 homes/<vid>/<sub>/ 에 쓰고 올린다."""
    L = nb.repo_of(vid)
    if not L:
        raise ValueError("그 마을과 이어져 있지 않아요")
    path = os.path.join(L["repo"], "homes", vid, sub, fname)
    if os.path.exists(path) and not overwrite:
        return False
    _jwrite(path, obj)
    threading.Thread(target=lambda: nb._commit_push(f"홈 {sub.split('/')[0]} → {vid}", L["repo"]), daemon=True).start()
    return True


def _me_from(vid):
    me_ = nb.me()
    p = next((x for x in nb.peers() if x["id"] == vid), {})
    return {"vid": me_["vid"], "name": status_name(), "owner": SETTING("ownerName", "사장님"), "callAs": p.get("calledByThem", "")}


def _target(vid):
    vid = re.sub(r"[^\w\-]", "", str(vid or ""))
    if not vid or vid == nb.me()["vid"]:
        raise ValueError("내 홈에는 손님이 남깁니다")
    return vid


def _not_mini(vid, what):
    """일촌 최소판: 방명록 말고는 일촌 홈에 쓰지 않는다."""
    if _mini_link(nb.repo_of(vid)):
        raise ValueError(f"일촌에게는 방명록만 남길 수 있어요 ({what}은 가까운 이웃끼리만)")


def visit(vid):
    """남의 홈을 열면 투데이에 하루 한 번 표시. 솔방울 +1 (하루 한 집 한 번)."""
    me_ = nb.me()
    vid = re.sub(r"[^\w\-]", "", str(vid or ""))
    if not vid or vid == me_["vid"]:
        return False
    day = time.strftime("%Y%m%d")
    if _write_in(vid, os.path.join("visits", day), me_["vid"], {"at": int(time.time())}):
        _earn(f"visit:{day}:{vid}", 1, "일촌 홈 놀러 가기")
    return True


def guestbook_write(vid, text, secret=False):
    vid = _target(vid)
    text = _clean(text, MAX_GB)
    if not text:
        raise ValueError("방명록에 남길 말을 써 주세요")
    gid = time.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:4]
    _write_in(vid, "guestbook", gid + ".json", {"text": text, "secret": bool(secret), "at": int(time.time()), "from": _me_from(vid)})
    _earn(f"gb:{time.strftime('%Y%m%d')}:{vid}", 1, "방명록 남기기")
    return {"ok": True}


def pyeong_write(vid, text):
    """일촌평: 그 홈 첫 화면에 한 줄. 한 사람당 하나(고쳐 쓰기)."""
    vid = _target(vid)
    _not_mini(vid, "일촌평")
    text = _clean(text, 60)
    if not text:
        raise ValueError("일촌평을 써 주세요")
    me_ = nb.me()["vid"]
    _write_in(vid, "pyeong", me_ + ".json", {"text": text, "at": int(time.time()), "from": _me_from(vid)}, overwrite=True)
    return {"ok": True}


def comment_write(vid, pid, text):
    text = _clean(text, 300)
    pid = re.sub(r"[^\w]", "", str(pid or ""))
    if not text or not pid:
        raise ValueError("댓글을 써 주세요")
    if vid in ("me", nb.me()["vid"]):
        # 내 글에 내가 다는 댓글은 내 원본에 (모든 일촌에게 보인다)
        mine = _jread(_h("mycomments.json"), {})
        mine.setdefault(pid, []).append({"id": "o" + uuid.uuid4().hex[:8], "text": text, "at": int(time.time()),
                                         "from": {"vid": nb.me()["vid"], "name": status_name(), "owner": SETTING("ownerName", "사장님"), "callAs": "주인"}})
        _jwrite(_h("mycomments.json"), mine)
        L0 = (nb.links() or [None])[0]
        if L0:
            d = os.path.join(L0["repo"], "homes", nb.me()["vid"], "comments", pid)
            _jwrite(os.path.join(d, mine[pid][-1]["id"] + ".json"), mine[pid][-1])
            threading.Thread(target=lambda: nb._commit_push("홈 댓글", L0["repo"]), daemon=True).start()
        return {"ok": True}
    vid = _target(vid)
    _not_mini(vid, "댓글")
    cid = time.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:4]
    _write_in(vid, os.path.join("comments", pid), cid + ".json", {"text": text, "at": int(time.time()), "from": _me_from(vid)})
    return {"ok": True}


def reply_write(gid, text):
    """내 홈 방명록에 주인 답글."""
    gid = re.sub(r"[^\w\-]", "", str(gid or ""))
    r = _jread(_h("replies.json"), {})
    t = _clean(text, 300)
    if t:
        r[gid] = t
    else:
        r.pop(gid, None)
    _jwrite(_h("replies.json"), r)
    return {"ok": True}


def gift(vid, n, note=""):
    """솔방울 선물 — 없앴다 (11-26)."""
    raise ValueError("솔방울 선물은 없어졌어요")
    vid = _target(vid)
    n = int(n or 0)
    if not 1 <= n <= 50:
        raise ValueError("선물은 1~50개까지예요")
    _spend(n, "선물")
    gid = time.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:4]
    _write_in(vid, "gifts", gid + ".json", {"pine": n, "note": _clean(note, 100), "at": int(time.time()), "from": _me_from(vid)})
    return {"ok": True}


def guestbook_delete(gid):
    """내 홈 방명록 한 줄 지우기 (주인만)."""
    me_ = nb.me()
    gid = re.sub(r"[^\w\-]", "", str(gid or ""))
    hit = False
    for L, d in _home_dirs(me_["vid"]):
        f = os.path.join(d, "guestbook", gid + ".json")
        if os.path.isfile(f):
            os.remove(f)
            hit = True
            threading.Thread(target=lambda r=L["repo"]: nb._commit_push("방명록 정리", r), daemon=True).start()
    if not hit:
        raise ValueError("그 방명록이 없습니다")
    return {"ok": True}


def share_ids(on):
    c = conf()
    c["shareIlchonIds"] = bool(on)
    save_conf(c)
    return {"ok": True}


def set_intro(text):
    return set_profile({"intro": text})


def surf():
    """파도타기: 일촌·이웃 중 아무 집이나."""
    import random
    ps = [p["id"] for p in nb.peers() if _home_dirs(p["id"])]
    if not ps:
        raise ValueError("놀러 갈 일촌이 아직 없어요")
    return {"vid": random.choice(ps)}


# ---------------------------------------------------------------- 이웃 게시판 (11-26) — 촌수 범위 안에서 일촌들이 바통처럼 건네준다
# 저장소마다 board/<글id>-<건넨 마을id>.json (+ 같은 이름 .png 아바타). dist = 글쓴이에서 이 저장소 건너편 사람까지 몇 촌.
# 받은 마을은 dist < range 이면 자기 다른 저장소들에 dist+1 로 건넨다. 같은 글은 한 번만 보이고, 2주 지나면 건네지 않고 치운다.
BOARD_RANGES = (2, 5, 10)
BOARD_DAYS = 14
BOARD_PER_DAY = 10
BOARD_PER_REPO = 30        # 한 저장소(이웃)에서 하루에 새로 받는 글 상한


def _board():
    return _jread(_h("board.json"), {"posts": {}, "hidden": [], "blocked": [], "mine": []})


def _save_board(b):
    cut = time.time() - BOARD_DAYS * 86400
    b["posts"] = {k: v for k, v in b["posts"].items() if v.get("at", 0) > cut}
    _jwrite(_h("board.json"), b)


def _avatar_png():
    """글에 붙일 내 아바타(대표 주민) — 작게 줄인 PNG bytes."""
    pr = profile()
    k = pr.get("minime")
    src = os.path.join(ART_DIR(), k, "idle.png") if k else ""
    if not src or not os.path.isfile(src):
        return None
    dst = _h("board-avatar.png")
    if not os.path.isfile(dst) or os.path.getmtime(dst) < os.path.getmtime(src) or pr.get("boardAvSrc") != k:
        try:
            if not plat.reencode_image(src, dst, "png", max_side=96):
                raise ValueError
            pr["boardAvSrc"] = k
            save_profile(pr)
        except Exception:
            return None
    with open(dst, "rb") as f:
        b = f.read()
    return b if b[:8] == nb.PNG and len(b) < 120_000 else None


def _place(repo, post, dist, avatar_bytes):
    """그 저장소에 글 한 장을 둔다 (이미 내가 둔 게 있으면 그대로)."""
    me_ = nb.me()["vid"]
    d = os.path.join(repo, "board")
    base = os.path.join(d, f"{post['id']}-{me_}")
    if os.path.exists(base + ".json"):
        return False
    rec = {k: post[k] for k in ("id", "text", "at", "range", "origin")}
    rec.update(dist=dist, relay=me_, av=bool(avatar_bytes))
    _jwrite(base + ".json", rec)
    if avatar_bytes:
        with open(base + ".png", "wb") as f:
            f.write(avatar_bytes)
    return True


def board_post(text, rng):
    text = _clean(text, 500)
    if not text:
        raise ValueError("게시판에 남길 말을 써 주세요")
    rng = int(rng or 2)
    if rng not in BOARD_RANGES:
        raise ValueError("범위는 2·5·10촌 중에서 골라 주세요")
    b = _board()
    today = [x for x in b.get("mine", []) if x.get("at", 0) > time.time() - 86400]
    if len(today) >= BOARD_PER_DAY:
        raise ValueError(f"게시판 글은 하루 {BOARD_PER_DAY}개까지예요")
    links = [L for L in nb.links() if not _mini_link(L)]
    if not links:
        raise ValueError("게시판은 가까운 이웃끼리만 써요 (일촌 최소판에서는 게시판이 없어요)")
    me_ = nb.me()
    login = gh_ready() if STATE.get("plaza") else ""
    mycode = None
    if rl.enabled():
        try:
            mycode = rl.my_code()
        except Exception:
            mycode = None
    post = {"id": "b" + time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:6], "text": text, "at": int(time.time()), "range": rng,
            "origin": {"vid": me_["vid"], "name": status_name(), "owner": SETTING("ownerName", "사장님"), "login": login or "", "code": mycode or ""}}
    av = _avatar_png()
    for L in links:
        _place(L["repo"], post, 1, av)
        threading.Thread(target=lambda r=L["repo"]: nb._commit_push("게시판 글", r), daemon=True).start()
    b["mine"].append({"id": post["id"], "at": post["at"]})
    b["mine"] = b["mine"][-200:]
    if av:
        os.makedirs(_h("board-av"), exist_ok=True)
        with open(_h("board-av", post["id"] + ".png"), "wb") as f:
            f.write(av)
    b["posts"][post["id"]] = {**post, "dist": 0, "av": bool(av)}
    _save_board(b)
    return {"ok": True, "id": post["id"]}


def board_sync(L):
    """저장소 하나의 게시판 글을 받아 두고, 범위가 남은 글은 내 다른 저장소들에 건넨다. neighbor.sync 가 부른다."""
    me_ = nb.me()["vid"]
    d = os.path.join(L["repo"], "board")
    if _mini_link(L) or not os.path.isdir(d):
        return False
    b = _board()
    now = time.time()
    cut = now - BOARD_DAYS * 86400
    changed = False
    # 저장소마다 하루에 새로 받는 글 상한 — 일촌 하나가 글 수천 개로 내 모든 이웃을 도배하지 못하게 (11-26 보안 검수 6번)
    day = time.strftime("%Y%m%d")
    quota = b.setdefault("quota", {})
    if quota.get("day") != day:
        quota.clear()
        quota["day"] = day
    for f in sorted(glob.glob(os.path.join(d, "*.json"))):
        if not nb._inside(f, L["repo"]):
            continue
        r = _jread(f, None)
        if not isinstance(r, dict):
            continue
        pid = re.sub(r"[^\w]", "", str(r.get("id") or ""))[:40]
        org = r.get("origin") or {}
        ovid = re.sub(r"[^\w\-]", "", str(org.get("vid") or ""))
        try:
            r_at = int(r.get("at") or 0)       # 숫자가 아닌 글 한 장이 게시판 받기를 매번 죽이지 않게 (11-26 3차 검수)
        except (TypeError, ValueError, OverflowError):
            continue
        if r.get("relay") == me_:
            # 내가 둔 것: 2주 지난 건 치운다
            if r_at < cut:
                for x in (f, f[:-5] + ".png"):
                    if os.path.exists(x):
                        os.remove(x)
                changed = True
            continue
        if not pid or ovid == me_ or r_at < cut:
            continue
        try:
            dist, rng = int(r.get("dist") or 1), int(r.get("range") or 2)
        except (TypeError, ValueError):
            continue
        if rng not in BOARD_RANGES or not 1 <= dist <= 10:
            continue
        old = b["posts"].get(pid)
        if old and old.get("dist", 99) <= dist:
            continue
        if old:
            # 같은 글이 더 가까운 길로 다시 왔을 때: 촌수만 고치고 글 내용·글쓴이는 처음 받은 그대로 (바꿔치기 막기)
            old["dist"] = dist
            changed = True
            continue
        if quota.get(L["repo"], 0) >= BOARD_PER_REPO:
            continue
        quota[L["repo"]] = quota.get(L["repo"], 0) + 1
        # 글쓴이 확인: 그 사람과 직접 이은 저장소에서 바로(1촌) 온 글만 「확인됨」. 건너 건너 온 글은 이름을 믿을 수 없다
        # 가까운 이웃 저장소는 그 저장소에 마을 파일이 있는 사람만 (밖의 일촌 id 를 사칭해 「확인됨」을 얻지 못하게)
        verified = dist == 1 and ((L.get("trust") == "ilchon" and L.get("peerVid") == ovid) or
                                  (L.get("trust") == "close" and any(v == ovid for v, _ in nb._village_files(L))))
        post = {"id": pid, "text": _clean(r.get("text"), 500), "at": min(r_at, int(now)), "range": rng, "dist": dist,
                "verified": verified,
                "origin": {"vid": ovid, "name": _clean(org.get("name"), 30), "owner": _clean(org.get("owner"), 20),
                           "login": org.get("login") if _login_ok(org.get("login")) else "",
                           "code": org.get("code") if rl.CODE_RE.match(str(org.get("code") or "")) else ""}}
        avf = f[:-5] + ".png"
        av = None
        if r.get("av") and os.path.isfile(avf) and os.path.getsize(avf) < 120_000:
            # 아바타도 다른 받은 그림처럼 거른 뒤 새로 구워서 들인다 (숨은 것 떨구기)
            got = nb.safe_take(avf, d, _h("board-av"), pid + ".png", "ilchon")
            if got:
                with open(_h("board-av", got), "rb") as fh:
                    av = fh.read()
        post["av"] = bool(av)
        b["posts"][pid] = post
        changed = True
        # 바통 넘기기: 범위가 남았고 차단한 사람이 아니면, 이 글이 온 저장소 말고 다른 저장소들에
        if dist < rng and ovid not in b.get("blocked", []):
            for L2 in nb.links():
                if L2["repo"] != L["repo"] and not _mini_link(L2):
                    _place(L2["repo"], post, dist + 1, av)
    if changed:
        _save_board(b)
    return False   # 저장소 변경은 다음 바퀴의 git status 가 잡는다


def board_view():
    b = _board()
    peers = {p["id"]: p for p in nb.peers()}
    me_ = nb.me()["vid"]
    out = []
    for p in sorted(b["posts"].values(), key=lambda x: -x.get("at", 0)):
        o = p.get("origin") or {}
        if o.get("vid") in b.get("blocked", []) or p["id"] in b.get("hidden", []):
            continue
        pr = peers.get(o.get("vid")) if (p.get("verified") or o.get("vid") == me_) else None   # 확인 안 된 글엔 내 일촌 별명을 안 붙인다
        out.append({**p, "mine": o.get("vid") == me_, "avUrl": f"/api/ilchon/file?vid=board&name={p['id']}.png" if p.get("av") else "",
                    "ilchon": bool(pr), "callThem": (pr or {}).get("callThem", "")})
    return {"posts": out[:200], "ranges": BOARD_RANGES, "blocked": len(b.get("blocked", [])), "days": BOARD_DAYS}


def board_act(act, pid="", vid=""):
    b = _board()
    if act == "hide":
        b.setdefault("hidden", []).append(re.sub(r"[^\w]", "", str(pid))[:40])
    elif act == "block":
        v = re.sub(r"[^\w\-]", "", str(vid))
        # 글쓴이가 확인된 글로만 차단한다 — 남의 이름을 단 가짜 글로 진짜 그 사람을 차단하게 만들지 못하게
        p = b["posts"].get(re.sub(r"[^\w]", "", str(pid))[:40]) if pid else None
        if not (p and p.get("verified") and (p.get("origin") or {}).get("vid") == v):
            raise ValueError("글쓴이가 확인된 글만 차단할 수 있어요. 이 글은 「숨기기」를 써 주세요")
        if v and v != nb.me()["vid"]:
            b.setdefault("blocked", []).append(v)
    elif act == "unblock-all":
        b["blocked"] = []
    elif act == "delete":
        pid = re.sub(r"[^\w]", "", str(pid))[:40]
        p = b["posts"].get(pid)
        if not p or (p.get("origin") or {}).get("vid") != nb.me()["vid"]:
            raise ValueError("내 글만 지울 수 있어요")
        b["posts"].pop(pid, None)
        me_ = nb.me()["vid"]
        for L in nb.links():
            for x in glob.glob(os.path.join(L["repo"], "board", f"{pid}-{me_}.*")):
                os.remove(x)
            threading.Thread(target=lambda r=L["repo"]: nb._commit_push("게시판 글 지움", r), daemon=True).start()
    else:
        raise ValueError("없는 동작")
    _save_board(b)
    return {"ok": True}


def board_avatar(name):
    if not re.fullmatch(r"\w+\.png", str(name or "")):
        return None
    f = _h("board-av", name)
    return f if os.path.isfile(f) else None


# ---------------------------------------------------------------- 일꾼
def worker():
    while True:
        if not feature_on():
            time.sleep(15)
            continue
        try:
            if rl.enabled():
                try:
                    poll_code()
                except Exception as e:
                    STATE["error"] = f"우편함: {e}"[:300]
            if gh_ready():
                if STATE["plaza"] is None:
                    STATE["plaza"] = plaza_exists(STATE["login"] or gh_ready())
                poll_incoming()
                poll_outgoing()
        except Exception as e:
            STATE["error"] = f"{type(e).__name__}: {e}"[:300]
        time.sleep(15 if (FAKE or os.environ.get("VILLAGE_RELAY")) else 60)
