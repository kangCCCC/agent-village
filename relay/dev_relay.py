"""시험용 일촌 우편함 — worker.js 와 같은 주소·같은 규칙을 맥 안에서 돌린다 (클라우드플레어 계정 없이 시험).
    python3 relay/dev_relay.py <저장 폴더> [포트=8790]
"""
import hashlib, json, os, re, sys, time, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "relay-data")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8790
CODE = re.compile(r"^VLG-[A-Z2-9]{6}$")
PAIR = re.compile(r"^[0-9a-f]{40}$")
PATH = re.compile(r"^[\w\-./]{1,200}$")
MAX_MSG, MAX_OBJ = 8000, 2_000_000
INBOX_MAX, INBOX_PER_IP, INBOX_TTL = 50, 3, 7 * 86400_000       # worker.js 와 같은 상한
PAIR_MAX_N, PAIR_MAX_BYTES = 2000, 100_000_000
DAY_NEW_CODES_PER_IP, CODE_MAX_PAIRS, DAY_NEW_PAIRS_PER_CODE = 5, 30, 10
SEND_PER_DAY, SEND_PER_TARGET_DAY = 30, 3
STATS = {}          # 하루 계수기 (worker.js 의 stats/d/<날짜>/…)


def stat(k, add=0):
    k = time.strftime("%Y-%m-%d") + "/" + k
    STATS[k] = STATS.get(k, 0) + add
    return STATS[k]


def p(*a):
    return os.path.join(ROOT, *a)


def rj(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def wj(path, o):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(o, f)


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def out(self, o, code=200):
        b = json.dumps(o).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def body(self):
        n = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(n)

    def ip(self):
        ip = self.headers.get("X-Test-IP") or self.client_address[0]
        return ":".join(ip.split("::")[0].split(":")[:4]) + "::/64" if ":" in ip else ip

    def code_ok(self):
        c, k = self.headers.get("X-Code", ""), self.headers.get("X-Key", "")
        r = rj(p("codes", c + ".json")) if CODE.match(c) else None
        return c if r and r["keyhash"] == sha(k) else None

    def pair_ok(self, pr):
        r = rj(p("pairs", pr + ".json"))
        return bool(r and r["keyhash"] == sha(self.headers.get("X-Pair-Key", "")))

    def route(self, m):
        seg = [s for s in self.path.split("?")[0].split("/") if s]
        if not seg or seg[0] != "v1":
            return self.out({"ok": True, "name": "agent-village relay (dev)"})
        if seg[1] == "register" and m == "POST":
            b = json.loads(self.body() or b"{}")
            if not CODE.match(b.get("code", "")) or not re.fullmatch(r"[0-9a-f]{64}", b.get("keyhash", "")):
                return self.out({"error": "bad"}, 400)
            cur = rj(p("codes", b["code"] + ".json"))
            if cur and cur["keyhash"] != b["keyhash"]:
                return self.out({"error": "taken"}, 409)
            if not cur:
                ipk = sha("ip:" + self.ip())[:12]
                if stat("code-ip-" + ipk) >= DAY_NEW_CODES_PER_IP:
                    return self.out({"error": "too many"}, 429)
                wj(p("codes", b["code"] + ".json"), {"keyhash": b["keyhash"], "at": time.time(), "pairs": 0})
                stat("code-ip-" + ipk, 1)
            return self.out({"ok": True})
        if seg[1] == "inbox":
            if m == "POST" and len(seg) > 2:
                frm = self.code_ok()
                if not frm:
                    return self.out({"error": "auth"}, 401)
                t = self.body()
                if len(t) > MAX_MSG:
                    return self.out({"error": "too big"}, 413)
                b = json.loads(t)
                if b.get("kind") not in ("req", "ans") or not isinstance(b.get("body"), dict):
                    return self.out({"error": "bad"}, 400)
                i = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}-{frm}"
                tgt = seg[2] if CODE.match(seg[2]) else "x"
                if stat("send-" + frm) >= SEND_PER_DAY or stat(f"send-{frm}-{tgt}") >= SEND_PER_TARGET_DAY:
                    return self.out({"error": "too many"}, 429)
                stat("send-" + frm, 1)
                stat(f"send-{frm}-{tgt}", 1)
                if tgt == "x" or not os.path.exists(p("codes", tgt + ".json")):
                    return self.out({"ok": True, "id": i})          # 없는 코드도 똑같은 모양 (코드 찾아내기 막기)
                d = p("inbox", tgt)
                now = time.time() * 1000
                live = sorted(f for f in (os.listdir(d) if os.path.isdir(d) else []) if now - int(f.split("-")[0]) < INBOX_TTL)
                if sum(f.endswith(f"-{frm}.json") for f in live) >= INBOX_PER_IP:
                    return self.out({"ok": True, "id": i})
                for f in live[:max(0, len(live) - INBOX_MAX + 1)]:     # 가득 차면 오래된 것부터 밀어낸다
                    os.remove(os.path.join(d, f))
                wj(p("inbox", tgt, i + ".json"), {"id": i, "kind": b["kind"], "body": b.get("body") or {}, "from": frm, "at": int(now)})
                return self.out({"ok": True, "id": i})
            me = self.code_ok()
            if not me:
                return self.out({"error": "auth"}, 401)
            if m == "GET":
                d = p("inbox", me)
                now = time.time() * 1000
                for f in (os.listdir(d) if os.path.isdir(d) else []):
                    if now - int(f.split("-")[0]) >= INBOX_TTL:
                        os.remove(os.path.join(d, f))
                items = [rj(os.path.join(d, f)) for f in sorted(os.listdir(d))] if os.path.isdir(d) else []
                return self.out({"items": [x for x in items if x]})
            if m == "DELETE" and len(seg) > 2 and re.fullmatch(r"[\w\-]{1,60}", seg[2]):
                f = p("inbox", me, seg[2] + ".json")
                if os.path.exists(f):
                    os.remove(f)
                return self.out({"ok": True})
        if seg[1] == "pair" and len(seg) > 2 and PAIR.match(seg[2]):
            pr = seg[2]
            if len(seg) == 3 and m == "PUT":
                b = json.loads(self.body() or b"{}")
                cur = rj(p("pairs", pr + ".json"))
                if cur and cur["keyhash"] != b.get("keyhash"):
                    return self.out({"error": "taken"}, 409)
                if not cur:
                    owner = self.code_ok()
                    if not owner:
                        return self.out({"error": "auth"}, 401)
                    oc = rj(p("codes", owner + ".json"))
                    if oc.get("pairs", 0) >= CODE_MAX_PAIRS or stat("pairs-" + owner) >= DAY_NEW_PAIRS_PER_CODE:
                        return self.out({"error": "too many"}, 429)
                    wj(p("pairs", pr + ".json"), {"keyhash": b.get("keyhash"), "at": time.time(), "owner": owner})
                    oc["pairs"] = oc.get("pairs", 0) + 1
                    wj(p("codes", owner + ".json"), oc)
                    stat("pairs-" + owner, 1)
                return self.out({"ok": True})
            if not self.pair_ok(pr):
                return self.out({"error": "auth"}, 401)
            base = p("pair", pr)
            if seg[3] == "list" and m == "GET":
                out = []
                for dp, _, fs in os.walk(base):
                    for f in fs:
                        fp = os.path.join(dp, f)
                        with open(fp, "rb") as fh:
                            et = hashlib.md5(fh.read()).hexdigest()
                        out.append({"path": os.path.relpath(fp, base), "etag": et, "size": os.path.getsize(fp)})
                return self.out({"items": out})
            if seg[3] == "o":
                path = "/".join(seg[4:])
                if not PATH.match(path) or ".." in path:
                    return self.out({"error": "bad path"}, 400)
                fp = os.path.join(base, path)
                if m == "GET":
                    if not os.path.isfile(fp):
                        return self.out({"error": "none"}, 404)
                    with open(fp, "rb") as fh:
                        b = fh.read()
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(b)))
                    self.end_headers()
                    self.wfile.write(b)
                    return
                if m == "PUT":
                    b = self.body()
                    if len(b) > MAX_OBJ:
                        return self.out({"error": "too big"}, 413)
                    n = by = 0
                    for dp, _, fs in os.walk(base):
                        for f in fs:
                            q = os.path.join(dp, f)
                            if q != fp:
                                n += 1
                                by += os.path.getsize(q)
                    if n >= PAIR_MAX_N or by + len(b) > PAIR_MAX_BYTES:
                        return self.out({"error": "box full"}, 413)
                    os.makedirs(os.path.dirname(fp), exist_ok=True)
                    with open(fp, "wb") as fh:
                        fh.write(b)
                    return self.out({"ok": True, "etag": hashlib.md5(b).hexdigest()})
                if m == "DELETE":
                    if os.path.exists(fp):
                        os.remove(fp)
                    return self.out({"ok": True})
        return self.out({"error": "not found"}, 404)

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")


if __name__ == "__main__":
    os.makedirs(ROOT, exist_ok=True)
    print(f"dev relay http://127.0.0.1:{PORT}  ({ROOT})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
