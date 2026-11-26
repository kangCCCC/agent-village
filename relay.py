"""일촌 코드 우편함 — 깃허브 없이 일촌 맺기 (11-26).

일촌 코드 : VLG-XXXXXX. 맥마다 하나, 처음 쓸 때 만들어 우편함 서버에 등록한다(열쇠 해시만 보낸다).
신청·수락 : 상대 코드 우편함에 신청서를 넣는다(디피-헬만 공개값 + 비밀 표식). 수락하면 둘만 아는 열쇠가 생긴다.
           수락 답장에는 비밀 표식으로 만든 확인값을 넣어, 남이 가짜 수락을 넣어도 받지 않는다.
둘만의 상자: 열쇠로 만든 상자 번호(pair)에 파일을 **잠가서** 올린다. 서버는 내용을 못 본다.
           맥 안 폴더(data/relay/<pair>/)와 상자를 똑같이 맞춰서, neighbor·ilchon 코드는 깃 저장소처럼 그대로 쓴다.
암호    : 표준 라이브러리만 쓴다. 디피-헬만(RFC 3526 2048비트) → SHA-256 계수기 방식 흐름암호 + HMAC-SHA256 확인.
잠금 VE2 (11-26 보안 검수 9번): 쓴 사람(코드)마다 열쇠를 따로 쓰고, 확인값에 「파일 경로·쓴 사람」을 묶는다.
           → 서버가 잠긴 파일을 다른 경로로 옮기거나, 내가 쓴 걸 상대가 쓴 것처럼 되돌려 넣으면 열리지 않는다.
안전번호 : 두 맥이 같은 열쇠를 가졌는지 화면의 안전번호(8자리)를 서로 맞춰 본다. 다르면 누가 중간에 끼어든 것이다.
알려진 한계: 상대가 쓴 파일의 「옛 버전」으로 되돌리는 것까지는 막지 못한다.
"""
import hashlib, hmac, json, os, re, secrets, threading, time, urllib.error, urllib.request

DATA = None
SETTING = None
P2048 = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
    "15728E5A8AACAA68FFFFFFFFFFFFFFFF", 16)
ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_RE = re.compile(r"^VLG-[A-Z2-9]{6}$")
LOCK = threading.RLock()


def url():
    """우편함 서버 주소. 시험: VILLAGE_RELAY, 평소: 설정 relayUrl."""
    return (os.environ.get("VILLAGE_RELAY") or (SETTING("relayUrl", "") if SETTING else "") or "").rstrip("/")


def enabled():
    return bool(url())


# ---------------------------------------------------------------- 암호 (표준 라이브러리만)
def dh_new():
    a = secrets.randbits(256)
    return a, pow(2, a, P2048)


def dh_master(priv, other_pub_hex):
    B = int(other_pub_hex, 16)
    if not 2 <= B <= P2048 - 2:
        raise ValueError("상대 공개값이 맞지 않습니다")
    s = pow(B, priv, P2048).to_bytes(256, "big")
    return hashlib.sha256(b"agent-village-ilchon" + s).digest()


def derive(master):
    k = lambda tag: hmac.new(master, tag, hashlib.sha256).digest()
    return {"master": master, "auth": k(b"auth").hex(), "pair": k(b"pair").hex()[:40]}


def safety(master_hex):
    """안전번호: 두 맥에서 같아야 한다. 다르면 우편함 서버 쪽에서 누가 끼어든 것."""
    h = hashlib.sha256(b"agent-village-safety" + bytes.fromhex(master_hex)).hexdigest()[:16].upper()   # 64비트: 끼어든 사람이 맞춰 내기 어렵게
    return "-".join(h[i:i + 4] for i in range(0, 16, 4))


def _wk(keys, writer):
    """쓴 사람(일촌 코드)마다 다른 잠금·확인 열쇠."""
    m = keys["master"]
    w = writer.encode()
    return hmac.new(m, b"enc|" + w, hashlib.sha256).digest(), hmac.new(m, b"mac|" + w, hashlib.sha256).digest()


def _stream(key, nonce, n):
    out = bytearray()
    i = 0
    while len(out) < n:
        out += hashlib.sha256(key + nonce + i.to_bytes(8, "big")).digest()
        i += 1
    return bytes(out[:n])


def seal(keys, data, path="", writer=""):
    """VE2 | 쓴 사람(10바이트) | nonce16 | 암호문 | 확인값16. 확인값은 경로·쓴 사람·nonce·암호문을 함께 묶는다."""
    w = writer.encode().ljust(10, b"_")[:10]
    enc, mac = _wk(keys, writer)
    nonce = secrets.token_bytes(16)
    ks = _stream(enc, nonce, len(data))
    ct = (int.from_bytes(data, "big") ^ int.from_bytes(ks, "big")).to_bytes(len(data), "big") if data else b""
    tag = hmac.new(mac, b"VE2|" + path.encode() + b"|" + w + nonce + ct, hashlib.sha256).digest()[:16]
    return b"VE2" + w + nonce + ct + tag


def open_(keys, blob, path="", writers=()):
    """writers: 받아들일 쓴 사람(내 코드·상대 코드). 그 밖의 사람이 쓴 것이나 다른 경로에서 옮겨 온 것은 연다고 하지 않는다."""
    if blob[:3] != b"VE2" or len(blob) < 45:
        raise ValueError("잠긴 상자가 아닙니다")
    w, nonce, ct, tag = blob[3:13], blob[13:29], blob[29:-16], blob[-16:]
    writer = w.rstrip(b"_").decode("ascii", "replace")
    if writers and writer not in writers:
        raise ValueError("모르는 사람이 쓴 상자입니다")
    enc, mac = _wk(keys, writer)
    if not hmac.compare_digest(hmac.new(mac, b"VE2|" + path.encode() + b"|" + w + nonce + ct, hashlib.sha256).digest()[:16], tag):
        raise ValueError("상자가 바뀌었습니다 (확인값 불일치)")
    ks = _stream(enc, nonce, len(ct))
    return (int.from_bytes(ct, "big") ^ int.from_bytes(ks, "big")).to_bytes(len(ct), "big") if ct else b""


# ---------------------------------------------------------------- 서버와 말하기
def _req(method, path, body=None, headers=None, raw=False, timeout=30):
    data = None
    # 클라우드플레어는 파이썬 기본 이름표(Python-urllib)를 봇으로 보고 403 으로 막는다 (11-27 실제 서버에서 실측)
    h = {"User-Agent": "AgentVillage/1.0", **(headers or {})}
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
            h["Content-Type"] = "application/octet-stream"
        else:
            data = json.dumps(body, ensure_ascii=False).encode()
            h["Content-Type"] = "application/json"
    r = urllib.request.Request(url() + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            b = resp.read()
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("error") or str(e)
        except ValueError:
            msg = str(e)
        raise RuntimeError(f"우편함 서버: {msg} ({e.code})")
    except urllib.error.URLError as e:
        raise RuntimeError(f"우편함 서버에 닿지 않습니다: {e.reason}")
    return b if raw else json.loads(b or b"{}")


# ---------------------------------------------------------------- 내 일촌 코드
def _conf_path():
    return os.path.join(DATA, "relay.json")


def conf():
    try:
        with open(_conf_path()) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_conf(c):
    os.makedirs(DATA, exist_ok=True)
    tmp = _conf_path() + ".tmp"
    with open(tmp, "w") as f:
        json.dump(c, f)
    os.chmod(tmp, 0o600)
    os.replace(tmp, _conf_path())


def my_code():
    """내 일촌 코드 (없으면 만들어 등록). 우편함 서버가 없으면 None."""
    if not enabled():
        return None
    with LOCK:
        c = conf()
        if c.get("code") and c.get("registered") == url():
            return c["code"]
        for _ in range(5):
            code = c.get("code") or "VLG-" + "".join(secrets.choice(ALPHA) for _ in range(6))
            key = c.get("key") or secrets.token_hex(32)
            try:
                _req("POST", "/v1/register", {"code": code, "keyhash": hashlib.sha256(key.encode()).hexdigest()})
            except RuntimeError as e:
                if "taken" in str(e):
                    c.pop("code", None)
                    continue
                raise
            c.update(code=code, key=key, registered=url())
            save_conf(c)
            return code
    raise RuntimeError("일촌 코드를 못 만들었습니다")


def _auth():
    c = conf()
    return {"X-Code": c["code"], "X-Key": c["key"]}


def inbox():
    if not my_code():
        return []
    out = []
    for x in _req("GET", "/v1/inbox", headers=_auth()).get("items", []):
        # 보낸 코드는 우편함 서버가 인증해서 적은 값(from)만 믿는다 — 편지 안에 적힌 fromCode 는 누구나 꾸밀 수 있다
        if not isinstance(x, dict) or not isinstance(x.get("body"), dict) or not CODE_RE.match(str(x.get("from") or "")):
            continue
        out.append({**x, "body": {**x["body"], "fromCode": x["from"]}})
    return out


def inbox_delete(iid):
    _req("DELETE", "/v1/inbox/" + re.sub(r"[^\w\-]", "", str(iid)), headers=_auth())


def send_request(target, form):
    """target 코드에 일촌 신청. 돌려주는 값: 내가 기억할 신청 기록 (비밀 표식·내 비밀값 포함)."""
    target = str(target or "").strip().upper()
    if not CODE_RE.match(target):
        raise ValueError("일촌 코드가 맞지 않습니다 (예: VLG-7K3Q2M)")
    me = my_code()
    if target == me:
        raise ValueError("나 자신과는 일촌을 맺을 수 없어요")
    a, A = dh_new()
    nonce = secrets.token_hex(16)
    body = {**form, "fromCode": me, "dh": format(A, "x"), "nonce": nonce}
    _req("POST", "/v1/inbox/" + target, {"kind": "req", "body": body}, headers=_auth())
    return {"target": target, "priv": format(a, "x"), "nonce": nonce, "at": int(time.time())}


def accept_request(item, form):
    """받은 신청 수락: 열쇠를 만들고, 상자를 열고, 답장을 넣는다. 돌려주는 값: 상자 정보(pair·auth·enc/mac 열쇠)."""
    b = item["body"]
    if not CODE_RE.match(str(b.get("fromCode", ""))):
        raise ValueError("신청서가 맞지 않습니다")
    a, A = dh_new()
    master = dh_master(a, b["dh"])
    k = derive(master)
    _req("PUT", "/v1/pair/" + k["pair"], {"keyhash": hashlib.sha256(k["auth"].encode()).hexdigest()}, headers=_auth())
    proof = hmac.new(bytes.fromhex(b["nonce"]), format(A, "x").encode(), hashlib.sha256).hexdigest()
    _req("POST", "/v1/inbox/" + b["fromCode"], {"kind": "ans", "body": {**form, "accepted": True, "fromCode": my_code(),
                                                                            "dh": format(A, "x"), "proof": proof}}, headers=_auth())
    inbox_delete(item["id"])
    return {"pair": k["pair"], "master": master.hex()}


def reject_request(item):
    b = item["body"]
    if CODE_RE.match(str(b.get("fromCode", ""))):
        try:
            # 거절에도 비밀 표식 확인값 — 남이 「거절됨」 가짜 답장을 넣어 내 신청을 망치지 못하게
            no = hmac.new(bytes.fromhex(str(b.get("nonce"))), b"reject", hashlib.sha256).hexdigest() if re.fullmatch(r"[0-9a-f]{32}", str(b.get("nonce") or "")) else ""
            _req("POST", "/v1/inbox/" + b["fromCode"], {"kind": "ans", "body": {"accepted": False, "fromCode": my_code(), "proof": no}}, headers=_auth())
        except RuntimeError:
            pass
    inbox_delete(item["id"])


def check_answer(item, pending):
    """내 신청에 대한 답장인지 확인. 진짜 수락이면 상자 정보, 거절이면 False, 남의 것/가짜면 None."""
    b = item.get("body") or {}
    if str(b.get("fromCode", "")).upper() != pending["target"]:
        return None
    if not b.get("accepted"):
        want_no = hmac.new(bytes.fromhex(pending["nonce"]), b"reject", hashlib.sha256).hexdigest()
        return False if hmac.compare_digest(want_no, str(b.get("proof", ""))) else None
    want = hmac.new(bytes.fromhex(pending["nonce"]), str(b.get("dh", "")).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, str(b.get("proof", ""))):
        return None          # 비밀 표식을 모르는 사람이 넣은 가짜 수락
    master = dh_master(int(pending["priv"], 16), b["dh"])
    return {"pair": derive(master)["pair"], "master": master.hex()}


# ---------------------------------------------------------------- 상자 ↔ 맥 폴더 맞추기
def _keys(L):
    return derive(bytes.fromhex(L["master"]))


def _state_path(L):
    return L["repo"].rstrip("/") + ".state.json"


def _state(L):
    try:
        with open(_state_path(L)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"remote": {}, "local": {}}


def _save_state(L, st):
    tmp = _state_path(L) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f)
    os.replace(tmp, _state_path(L))


def _hash(fp):
    with open(fp, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _ph(L):
    return {"X-Pair-Key": _keys(L)["auth"]}


PULL_MAX_N, PULL_MAX_BYTES = 3000, 300_000_000     # 상대가 상자를 부풀려도 내 맥 디스크를 채우지 못하게


_ASCII = re.compile(r"^[A-Za-z0-9_.\-]{1,120}$")


def _enc(path):
    """폴더 경로 → 상자 경로. 한글·빈칸·괄호가 든 이름은 「x--16진수」 로 바꾼다
    (주소에 그대로 넣으면 올리기가 매번 죽었다 — 11-26 3차 검수 17번)."""
    return "/".join(x if _ASCII.match(x) and not x.startswith("x--") else "x--" + x.encode("utf-8").hex()
                    for x in path.replace(os.sep, "/").split("/"))


def _dec(path):
    out = []
    for x in path.split("/"):
        if x.startswith("x--"):
            try:
                x = bytes.fromhex(x[3:]).decode("utf-8")
            except ValueError:
                return None
            if "/" in x or "\\" in x or x in ("", ".", ".."):
                return None
        out.append(x)
    return "/".join(out)


def _safe_dest(root, path):
    """상자 안 경로 → 맥 폴더 위치. 폴더 밖으로 나가거나 중간에 바로가기(심볼릭 링크)를 거치면 None."""
    parts = path.split("/")
    if not re.fullmatch(r"[\w\-./ ()]{1,200}", path) or path.startswith("/") or any(x.strip() in ("", ".", "..") for x in parts):
        return None
    cur = root
    for x in parts:
        cur = os.path.join(cur, x)
        if os.path.islink(cur):
            return None
    return cur


def pull(L):
    """상자에서 바뀐 것을 받아 폴더에 푼다. 상대가 지운 것은 폴더에서도 지운다(내가 그새 고치지 않았으면)."""
    with LOCK:
        k, st, root = _keys(L), _state(L), L["repo"]
        writers = tuple(x for x in (my_code(), L.get("peerCode")) if x)
        items = _req("GET", f"/v1/pair/{L['pair']}/list", headers=_ph(L)).get("items", [])
        seen = set()
        n = total = 0
        for it in items:
            path = it["path"]
            lp = _dec(str(path)) if re.fullmatch(r"[\w\-./]{1,400}", str(path)) else None
            fp = _safe_dest(root, lp) if lp else None
            if not fp:
                continue
            seen.add(path)
            n += 1
            total += int(it.get("size") or 0)
            if n > PULL_MAX_N or total > PULL_MAX_BYTES:
                continue
            if st["remote"].get(path) == it["etag"]:
                continue
            blob = _req("GET", f"/v1/pair/{L['pair']}/o/{path}", headers=_ph(L), raw=True)
            try:
                data = open_(k, blob, path, writers)
            except ValueError:
                continue
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp, "wb") as f:
                f.write(data)
            st["remote"][path] = it["etag"]
            st["local"][path] = hashlib.sha256(data).hexdigest()
        for path in list(st["remote"]):
            if path not in seen:
                lp = _dec(path)
                fp = _safe_dest(root, lp) if lp else None
                if not fp:
                    st["remote"].pop(path, None)
                    st["local"].pop(path, None)
                    continue
                if os.path.isfile(fp) and _hash(fp) == st["local"].get(path):
                    os.remove(fp)
                st["remote"].pop(path, None)
                st["local"].pop(path, None)
        _save_state(L, st)


def push(L):
    """폴더에서 내가 바꾼 것을 잠가서 올리고, 지운 것은 상자에서도 지운다."""
    with LOCK:
        k, st, root = _keys(L), _state(L), L["repo"]
        now = set()
        for dp, _, fs in os.walk(root):
            for f in fs:
                if f.endswith(".tmp"):
                    continue
                fp = os.path.join(dp, f)
                path = _enc(os.path.relpath(fp, root))
                if not re.fullmatch(r"[\w\-./]{1,200}", path) or not path.isascii():
                    continue
                now.add(path)
                h = _hash(fp)
                if st["local"].get(path) == h:
                    continue
                if os.path.islink(fp):
                    continue
                with open(fp, "rb") as fh:
                    blob = seal(k, fh.read(), path, my_code())
                if len(blob) > 2_000_000:
                    continue          # 너무 큰 건 안 올린다 (사진은 400픽셀이라 걸리지 않는다)
                try:
                    r = _req("PUT", f"/v1/pair/{L['pair']}/o/{path}", blob, headers=_ph(L))
                except RuntimeError:
                    continue            # 하나가 막혀도(상자 가득 등) 나머지는 올린다. 다음 바퀴에 다시
                st["local"][path] = h
                st["remote"][path] = r.get("etag", "")
        for path in list(st["local"]):
            if path not in now:
                try:
                    _req("DELETE", f"/v1/pair/{L['pair']}/o/{path}", headers=_ph(L))
                except RuntimeError:
                    pass
                st["local"].pop(path, None)
                st["remote"].pop(path, None)
        _save_state(L, st)
