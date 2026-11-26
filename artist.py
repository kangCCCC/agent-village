"""마을 그림 공방 — 캐릭터·배경 그림을 앱 밖 자료 폴더(data/art)에 두고, 앱에서 새로 그리거나 갈아끼운다.

자리
  data/art/cast.json            {세션 id: 그림 이름}
  data/art/<그림 이름>/         portrait·idle·work·walkA·walkB·raise.png (+ sheet.json, about.json)
  data/art/background.png       배경 (없으면 앱에 든 기본 배경)
  data/art/raw/<작업 id>/       그리기 원본(out.png)·설명
  data/art/jobs.json            그리는 중인 일

그리는 사람(설정 artist)
  "codex"            이 맥의 codex 명령으로 바로 굽는다 (사장님 맥)
  "session:<id>"     그 클로드 세션에게 그려 달라고 부탁한다 (예: 제미나이 웹으로 그리는 세션). 다 그리면 세션이
                     out.png 를 정해진 자리에 두고 /api/art/done 을 부른다 → 마을이 자르고 붙인다
처음 켤 때 data/art 가 없으면 앱에 든 그림(web/art)을 씨앗으로 복사한다.
"""
import glob, json, os, re, shutil, subprocess, sys, threading, time, uuid
import plat

DATA = None          # server 가 넣어 준다
WEB_ART = None       # 앱에 든 기본 그림 (web/art)
PORT = 8791
TOOLS = os.environ.get("VILLAGE_ART_TOOLS") or next((d for d in (os.path.expanduser("~/Documents/agent-village/art"),
         os.path.join(os.path.dirname(os.path.abspath(__file__)), "art")) if os.path.isdir(d)), os.path.expanduser("~/Documents/agent-village/art"))
LOCK = threading.RLock()
POSES = ["portrait", "idle", "work", "walkA", "walkB", "raise"]

STYLE = ("Style: cute anime-style game illustration, soft cel shading, clean dark-brown outlines, warm pastel palette, "
         "cozy fantasy RPG mood. Original design (do not imitate any existing game or character).")
SHEET = ("Character sheet on a perfectly flat pure green chroma-key background (#00FF00), no shadows on the background, "
         "no text, no labels, no frames, no watermark. Six separate poses of the SAME girl, same outfit and colors, arranged "
         "in a 3x2 grid with wide green gaps so they never touch: top row = (1) head-and-shoulders portrait facing viewer "
         "with a friendly smile, (2) full body standing idle facing viewer, (3) full body working pose using her signature "
         "item; bottom row = (4) full body walking facing right, left foot forward, (5) full body walking facing right, "
         "right foot forward, (6) full body raising one hand high in the air to ask a question, eager expression. "
         "Full-body poses all the same size, chibi proportions about 3 heads tall, feet on the same baseline. Wide 3:2 "
         "image. IMPORTANT: because the background is chroma green, do NOT use bright pure green on the girl (use mint, "
         "sage or olive instead). ")
BG = ("Top-down three-quarter view game map of a cozy, cute fantasy RPG village meadow, wide 16:9 image, NO people, "
      "NO text, NO watermark. A round stone plaza with a small fountain in the exact center, a dirt path crossing "
      "horizontally through the middle, a small pond below the plaza, a red mailbox just right of the plaza, trees "
      "along the edges, flower patches, and plenty of open flat grass for characters to stand. ")


def art_dir():
    d = os.path.join(DATA, "art")
    if not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)
        if WEB_ART and os.path.isdir(WEB_ART):          # 처음: 앱에 든 그림을 씨앗으로
            for name in os.listdir(WEB_ART):
                s = os.path.join(WEB_ART, name)
                t = os.path.join(d, name)
                if os.path.isdir(s):
                    shutil.copytree(s, t, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, t)
    return d


def _jread(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _jwrite(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def cast():
    return _jread(os.path.join(art_dir(), "cast.json"), {})


def set_cast(sid, key):
    with LOCK:
        c = cast()
        if key:
            c[sid] = key
        else:
            c.pop(sid, None)
        _jwrite(os.path.join(art_dir(), "cast.json"), c)


def characters():
    """그려 둔 캐릭터 목록 (다른 세션에 다시 쓸 수 있다)."""
    out = []
    for d in sorted(glob.glob(os.path.join(art_dir(), "*", "idle.png"))):
        key = os.path.basename(os.path.dirname(d))
        about = _jread(os.path.join(os.path.dirname(d), "about.json"), {})
        made = about.get("made")
        sl = os.path.join(os.path.dirname(d), "sleep.png")
        for pz in EXTRA_POSES:        # 덤 포즈가 나중에 생기면 화면이 새로 받아 가게 버전에 섞는다
            pp = os.path.join(os.path.dirname(d), pz + ".png")
            if os.path.exists(pp):
                made = max(made or 0, int(os.path.getmtime(pp)))
        out.append({"key": key, "desc": about.get("desc", ""), "name": about.get("name", ""), "made": made,
                    "sleep": os.path.exists(sl)})
    return out


def jobs():
    return _jread(os.path.join(art_dir(), "jobs.json"), {})


def _job_set(jid, **kw):
    with LOCK:
        j = jobs()
        j.setdefault(jid, {}).update(kw)
        _jwrite(os.path.join(art_dir(), "jobs.json"), j)


PROPORTION = ("BODY PROPORTIONS (most important): match the attached reference image exactly — big chibi head, "
              "about 3 heads tall, short legs, same head size and same height as the girls in the reference. "
              "Use the reference ONLY for body proportions and drawing style; do NOT copy their faces, hair, outfits or items. ")


def proportion_ref():
    p = os.path.join(art_dir(), "proportion-ref.png")
    return p if os.path.exists(p) else None


def character_prompt(desc):
    return SHEET + (PROPORTION if proportion_ref() else "") + "The girl: " + desc.strip() + " " + STYLE


def auto_desc(agent):
    """설명을 안 넣으면: 세션 이름·하는 일에서 역할을 떠올려 그리게 한다."""
    hint = (agent.get("title") or "") + ". " + (agent.get("summary") or "")
    return ("a cute girl whose look, outfit and signature item express this job (imagine it freely from the Korean "
            f"description, keep it original and charming): \"{hint[:300]}\". Give her a distinctive hair color and style.")


def manual_prompt(desc):
    """사람이 직접 제미나이·챗GPT 등에 붙여 넣을 그림 설명 (참고 그림 없이 쓰는 판)."""
    return SHEET + "The girl: " + desc.strip() + " " + STYLE


def manual_character(sid, desc, src, name=""):
    """사람이 그려 온 6칸 시트를 받아 잘라서 주민에게 입힌다. 돌려주는 값: 캐릭터 이름(key)."""
    jid = "j" + uuid.uuid4().hex[:10]
    key = "c_" + uuid.uuid4().hex[:8]
    d = os.path.join(art_dir(), "raw", jid)
    os.makedirs(d, exist_ok=True)
    out = os.path.join(d, "out.png")
    if not plat.reencode_image(src, out, "png"):
        raise ValueError("그림 파일을 못 읽었습니다 (PNG·JPG·WEBP 등 그림 파일인지 확인)")
    _job_set(jid, kind="character", key=key, sid=sid, desc=desc or "직접 올린 그림", name=name, state="cutting",
             started=int(time.time()), artist="manual")
    finish(jid)
    j = jobs().get(jid) or {}
    if j.get("state") != "done":
        raise ValueError(j.get("error") or "자르지 못했습니다 — 초록 배경에 6칸이 서로 떨어져 있는지 확인해 주세요")
    return key


def _python():
    for p in (os.path.join(TOOLS, ".venv", "bin", "python"), os.path.join(TOOLS, ".venv", "Scripts", "python.exe"),
              os.path.join(os.path.dirname(TOOLS), ".venv", "bin", "python"), os.path.join(os.path.dirname(TOOLS), ".venv", "Scripts", "python.exe")):
        if os.path.exists(p):
            return p
    return sys.executable or "python3"


def _cut(jid, src, key):
    outd = os.path.join(art_dir(), key)
    r = subprocess.run([_python(), os.path.join(TOOLS, "cut.py"), key, "2", ",".join(POSES), src, outd],
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0 or not os.path.exists(os.path.join(outd, "idle.png")):
        raise RuntimeError("자르기 실패: " + (r.stderr or r.stdout)[-300:])


def finish(jid):
    """그림이 out.png 로 놓인 뒤: 캐릭터면 자르고 세션에 붙이고, 배경이면 갈아끼운다."""
    j = jobs().get(jid)
    if not j:
        raise ValueError("그런 그리기 일이 없습니다")
    src = os.path.join(art_dir(), "raw", jid, "out.png")
    if not os.path.exists(src):
        raise ValueError(f"그림이 아직 없습니다: {src}")
    _job_set(jid, state="cutting")
    try:
        if j["kind"] == "background":
            old = os.path.join(art_dir(), "background.png")
            if os.path.exists(old):
                shutil.copy2(old, os.path.join(art_dir(), "raw", jid, "previous-background.png"))
            shutil.copy2(src, old)
            try:
                bg_add(src, "코덱스가 그린 배경" if j.get("artist") == "codex" else "새로 그린 배경", use=True)
            except Exception:
                pass
        else:
            key = j["key"]
            _cut(jid, src, key)
            # 카드 이름: 코덱스가 남긴 한국어 별명(name.txt) → 사장님이 쓴 한글 설명 앞부분 → 「세션 이름 캐릭터」
            nm = ""
            nf = os.path.join(art_dir(), "raw", jid, "name.txt")
            if os.path.exists(nf):
                nm = open(nf, encoding="utf-8", errors="ignore").read().strip().splitlines()[0][:20] if open(nf, encoding="utf-8", errors="ignore").read().strip() else ""
            if not nm:
                nm = j.get("name") or ""
            _jwrite(os.path.join(art_dir(), key, "about.json"), {"desc": j.get("desc", ""), "name": nm, "made": int(time.time())})
            if j.get("sid"):
                set_cast(j["sid"], key)
            queue_poses(key)          # 새 주민도 덤 포즈(자는 모습·만세·당황·차·폰·손 흔들기)까지 자동으로
        _job_set(jid, state="done", ended=int(time.time()))
    except Exception as e:
        _job_set(jid, state="failed", error=str(e)[:300])
        raise


def _codex(jid, prompt, ref=None):
    d = os.path.join(art_dir(), "raw", jid)
    args = [plat.find_exe("codex"), "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", d, "-o", os.path.join(d, "last.txt"),
            "이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 out.png 로 저장하세요. 그리고 name.txt 에 이 캐릭터의 겉모습 특징을 담은 "
            "한국어 별명(띄어쓰기 포함 12자 안쪽, 예: 「빨간 두건 장사꾼」)을 한 줄로 저장하세요. 이 두 파일 말고는 만들지 마세요. 그림 설명: " + prompt]
    if ref:
        args += ["-i", ref]
    env = plat.tool_env()
    with open(os.path.join(d, "log.txt"), "w") as log:
        subprocess.run(args, stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env, timeout=900)
    if not os.path.exists(os.path.join(d, "out.png")):
        raise RuntimeError("코덱스가 그림을 못 만들었습니다 (" + d + "/log.txt)")


def start(kind, prompt, artist, send_order, sid=None, desc="", ref=None, name=""):
    """그리기 시작. kind = character | background. 돌려주는 값: 일 id."""
    jid = "j" + uuid.uuid4().hex[:10]
    key = ("c_" + uuid.uuid4().hex[:8]) if kind == "character" else None
    d = os.path.join(art_dir(), "raw", jid)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "prompt.txt"), "w", encoding="utf-8") as f:
        f.write(prompt)
    if ref:
        shutil.copy2(ref, os.path.join(d, "ref.png"))
    _job_set(jid, kind=kind, key=key, sid=sid, desc=desc, name=name, state="drawing", started=int(time.time()), artist=artist)

    if artist == "codex":
        def run():
            _hook("char_start", {"kind": kind})
            try:
                _codex(jid, prompt, os.path.join(d, "ref.png") if ref else None)
                finish(jid)
                _hook("char_end", {"kind": kind, "ok": True})
            except Exception as e:
                _job_set(jid, state="failed", error=str(e)[:300])
                _hook("char_end", {"kind": kind, "ok": False})
        threading.Thread(target=run, daemon=True).start()
    elif artist.startswith("session:"):
        who = artist.split(":", 1)[1]
        out = os.path.join(d, "out.png")
        text = (f"【마을 그림 부탁】 에이전트빌리지의 {'캐릭터' if kind == 'character' else '배경'} 그림을 한 장 그려 주세요.\n"
                f"- 그림 설명(제미나이에 그대로 붙여 넣으세요): {d}/prompt.txt\n"
                + (f"- 참고 그림도 같이 올리세요: {d}/ref.png\n" if ref else "")
                + f"- 다 그리면 이 자리에 PNG 로 저장: {out}\n"
                f"- 저장한 뒤 이 명령으로 마을에 알려 주세요: curl -s -X POST http://127.0.0.1:{PORT}/api/art/done "
                f"-H 'Content-Type: application/json' -d '{{\"job\":\"{jid}\"}}'\n"
                "- 초록 배경·6칸·워터마크 없음 같은 조건은 설명 안에 다 들어 있습니다. 자르기와 붙이기는 마을이 합니다.")
        send_order(who, text)
    else:
        _job_set(jid, state="failed", error="그림 담당이 정해지지 않았습니다 (설정에서 고르세요)")
    return jid


# ---------- 덤 포즈: 주민마다 한 장씩 따로 굽는 그림 (자는 모습·만세·당황·차·폰·손 흔들기) ----------
POSE_BASE = ("One single image on a perfectly flat pure green chroma-key background (#00FF00), no shadows on the "
             "background, no text, no letters, no symbols, no frame, no watermark. Draw the SAME character as in the "
             "attached reference image — same face, hair, outfit, colors, accessories, same art style, same chibi "
             "proportions and same head size — now: ")
POSE_TAIL = (" Full body visible, nothing cropped, one character only. Do NOT use bright pure green on the character. " + STYLE)
EXTRA_POSES = {
    # 이름: (설명, 서 있는 키 대비 높이)
    "sleep": ("SLEEPING: sitting curled up on the ground, hugging the knees, head resting on the knees and tilted to one "
              "side, eyes peacefully CLOSED, relaxed sleepy smile, three-quarter view facing the viewer. Their signature "
              "item may rest on the ground beside them. No 'Z' letters.", 0.62),
    "cheer": ("CELEBRATING a finished job: standing and throwing BOTH arms straight up high in a joyful banzai, big happy "
              "open-mouth smile, eyes squeezed shut with delight, facing the viewer.", 1.04),
    "oops": ("FLUSTERED after a small mistake: standing, one hand scratching the back of the head, awkward embarrassed "
             "smile, eyebrows tilted, one small light-blue sweat drop near the head, facing the viewer.", 1.0),
    "tea": ("TAKING A BREAK: standing relaxed, holding a warm mug of tea with both hands near the chin, sipping, cozy "
            "content expression with eyes half closed, a little white steam rising from the mug, facing the viewer.", 1.0),
    "phone": ("RELAXING: standing, looking down at a smartphone held in both hands, amused little smile, casual pose, "
              "three-quarter view.", 1.0),
    "wave": ("GREETING: standing and waving one hand high toward the viewer, cheerful bright smile, facing the viewer.", 1.0),
}
POSE_KO = {"sleep": "자는 모습", "cheer": "만세", "oops": "당황", "tea": "차 마시기", "phone": "폰 보기", "wave": "손 흔들기"}
HOOK = None              # server 가 넣는다: HOOK(kind, info) — 마을 관리소가 코덱스에게 부탁하고 코덱스가 답하는 장면
_batch = {"done": 0, "total": 0, "poses": set()}


def _hook(kind, info):
    try:
        if HOOK:
            HOOK(kind, info)
    except Exception:
        pass


def busy_info():
    """코덱스 주민이 지금 하는 그림 일: (굽는 중 수, 남은 수, 설명)"""
    with _pose_lock:
        busy, left = list(_pose_busy), len(_pose_q)
    chars = [j for j in jobs().values() if j.get("state") == "drawing" and j.get("artist") == "codex"]
    if not busy and not chars:
        return None
    what = [POSE_KO.get(p, p) for _, p in busy] + (["새 주민 캐릭터"] * len(chars))
    return {"busy": len(busy) + len(chars), "left": left, "what": what}


_pose_q = []
_pose_busy = set()
_pose_lock = threading.Lock()
POSE_WORKERS = 3


def pose_state():
    with _pose_lock:
        return {"queue": ["/".join(x) for x in _pose_q], "busy": sorted("/".join(x) for x in _pose_busy)}


def queue_poses(key, poses=None, force=False):
    """덤 포즈 굽기를 줄 세운다 (이미 있으면 건너뜀). 동시에 3장까지. 돌려주는 값: 새로 줄 세운 수."""
    d = os.path.join(art_dir(), key)
    if not os.path.exists(os.path.join(d, "idle.png")):
        return 0
    n = 0
    for pose in (poses or list(EXTRA_POSES)):
        if pose not in EXTRA_POSES or (os.path.exists(os.path.join(d, pose + ".png")) and not force):
            continue
        item = (key, pose)
        with _pose_lock:
            if item in _pose_q or item in _pose_busy:
                continue
            fresh = not _pose_q and not _pose_busy
            if fresh:
                _batch.update(done=0, total=0, poses=set())
            _pose_q.append(item)
            _batch["total"] += 1
            _batch["poses"].add(pose)
        if fresh:      # 한 묶음의 첫 장: 조금 뒤 묶음 크기가 다 찬 다음 부탁 장면을 남긴다
            threading.Timer(1.5, lambda: _hook("start", {"total": _batch["total"],
                                                         "poses": [POSE_KO.get(p, p) for p in sorted(_batch["poses"])]})).start()
        with _pose_lock:
            n += 1
            if len(_pose_busy) < POSE_WORKERS:
                threading.Thread(target=_pose_worker, daemon=True).start()
    return n


def queue_sleep(key, force=False):          # 예전 이름 (자는 그림만)
    return queue_poses(key, ["sleep"], force) > 0


def _pose_worker():
    while True:
        with _pose_lock:
            if not _pose_q or len(_pose_busy) >= POSE_WORKERS:
                return
            item = _pose_q.pop(0)
            _pose_busy.add(item)
        try:
            _bake_pose(*item)
        except Exception as e:
            _jwrite(os.path.join(art_dir(), "raw", f"{item[1]}_{item[0]}", "error.json"),
                    {"error": str(e)[:300], "at": int(time.time())})
        finally:
            with _pose_lock:
                _pose_busy.discard(item)
                _batch["done"] += 1
                end = not _pose_q and not _pose_busy
            if end:
                _hook("end", {"total": _batch["done"]})


def _bake_pose(key, pose):
    desc, ratio = EXTRA_POSES[pose]
    prompt = POSE_BASE + desc + POSE_TAIL
    cd = os.path.join(art_dir(), key)
    d = os.path.join(art_dir(), "raw", f"{pose}_{key}")
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    ref = os.path.join(d, "ref.png")
    shutil.copy2(os.path.join(cd, "idle.png"), ref)
    with open(os.path.join(d, "prompt.txt"), "w", encoding="utf-8") as f:
        f.write(prompt)
    args = [plat.find_exe("codex"), "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", d, "-o", os.path.join(d, "last.txt"),
            "이미지 생성 도구로 그림 한 장을 만들어 이 폴더에 out.png 로 저장하세요. 다른 파일은 만들지 마세요. "
            "첨부한 참고 그림의 인물을 그대로 그리세요. 그림 설명: " + prompt, "-i", ref]
    env = plat.tool_env()
    with open(os.path.join(d, "log.txt"), "w") as log:
        subprocess.run(args, stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env, timeout=900)
    src = os.path.join(d, "out.png")
    if not os.path.exists(src):
        raise RuntimeError("코덱스가 그림을 못 만들었습니다")
    tmp = os.path.join(d, "cut")
    r = subprocess.run([_python(), os.path.join(TOOLS, "cut.py"), key, "1", pose, src, tmp],
                       capture_output=True, text=True, timeout=300)
    piece = os.path.join(tmp, pose + ".png")
    if r.returncode != 0 or not os.path.exists(piece):
        raise RuntimeError("자르기 실패: " + (r.stderr or r.stdout)[-300:])
    meta = _jread(os.path.join(cd, "sheet.json"), {})
    sm = _jread(os.path.join(tmp, "sheet.json"), {}).get(pose) or {}
    # 따로 그린 그림이라 픽셀 크기가 제각각 → 서 있는 그림 키에 맞춘다 (앉으면 낮게, 팔 들면 조금 높게)
    ih = (meta.get("idle") or {}).get("h")
    if ih and sm.get("h"):
        th = int(ih * ratio)
        plat.reencode_image(piece, piece, "png", height=th)
        sm = {"w": int(round(sm["w"] * th / sm["h"])), "h": th}
    shutil.copy2(piece, os.path.join(cd, pose + ".png"))
    meta[pose] = sm
    _jwrite(os.path.join(cd, "sheet.json"), meta)


# ---------- 배경 모음: 여러 장을 두고 골라 쓴다 (그린 것·올린 것·이웃이 선물한 것) ----------
def _bg_dir():
    d = os.path.join(art_dir(), "backgrounds")
    os.makedirs(d, exist_ok=True)
    return d


def bg_list():
    meta = _jread(os.path.join(_bg_dir(), "list.json"), {})
    cur = os.path.join(art_dir(), "background.png")
    if not meta and os.path.exists(cur):          # 처음: 지금 배경을 첫 장으로
        bid = "b_" + uuid.uuid4().hex[:8]
        shutil.copy2(cur, os.path.join(_bg_dir(), bid + ".png"))
        meta = {bid: {"name": "처음 배경", "at": int(time.time()), "from": ""}}
        _jwrite(os.path.join(_bg_dir(), "list.json"), meta)
    used = _jread(os.path.join(_bg_dir(), "current.json"), {}).get("id")
    return [{"id": k, **v, "current": k == used} for k, v in sorted(meta.items(), key=lambda x: x[1].get("at", 0))]


def bg_add(src, name, frm="", use=False):
    bg_list()
    bid = "b_" + uuid.uuid4().hex[:8]
    out = os.path.join(_bg_dir(), bid + ".png")
    if not plat.reencode_image(src, out, "png"):
        raise ValueError("배경 그림을 못 읽었습니다")
    meta = _jread(os.path.join(_bg_dir(), "list.json"), {})
    meta[bid] = {"name": (name or "배경")[:40], "at": int(time.time()), "from": frm[:40]}
    _jwrite(os.path.join(_bg_dir(), "list.json"), meta)
    if use:
        bg_use(bid)
    return bid


def bg_use(bid):
    p = os.path.join(_bg_dir(), str(bid) + ".png")
    if not re.fullmatch(r"b_[0-9a-f]{8}", str(bid)) or not os.path.exists(p):
        raise ValueError("그 배경이 없습니다")
    shutil.copy2(p, os.path.join(art_dir(), "background.png"))
    _jwrite(os.path.join(_bg_dir(), "current.json"), {"id": bid})


def bg_remove(bid):
    if not re.fullmatch(r"b_[0-9a-f]{8}", str(bid)):
        raise ValueError("그 배경이 없습니다")
    meta = _jread(os.path.join(_bg_dir(), "list.json"), {})
    if bid in meta:
        meta.pop(bid)
        _jwrite(os.path.join(_bg_dir(), "list.json"), meta)
        p = os.path.join(_bg_dir(), bid + ".png")
        if os.path.exists(p):
            os.remove(p)


def bg_path(bid):
    p = os.path.join(_bg_dir(), str(bid) + ".png")
    return p if re.fullmatch(r"b_[0-9a-f]{8}", str(bid)) and os.path.exists(p) else None


# ---------- 캐릭터 꾸러미: 이웃에게 보내기·받기 ----------
def export_character(key):
    d = os.path.join(art_dir(), str(key))
    if not re.fullmatch(r"[\w\-]+", str(key)) or not os.path.exists(os.path.join(d, "idle.png")):
        raise ValueError("그 캐릭터가 없습니다")
    files = []
    for n in os.listdir(d):
        if n.endswith(".png") and n[:-4] in ("portrait", "idle", "work", "walkA", "walkB", "raise",
                                               "sleep", "cheer", "oops", "tea", "phone", "wave"):
            with open(os.path.join(d, n), "rb") as f:
                files.append((n, f.read()))
    name = _jread(os.path.join(d, "about.json"), {}).get("name") or key
    return files, name


def _png_size(p):
    with open(p, "rb") as f:
        h = f.read(24)
    return int.from_bytes(h[16:20], "big"), int.from_bytes(h[20:24], "big")


def install_character(pngs, name):
    """pngs: {포즈: 파일 경로}. 새 캐릭터로 들여놓고 이름(key)을 돌려준다."""
    key = "g_" + uuid.uuid4().hex[:8]
    d = os.path.join(art_dir(), key)
    os.makedirs(d, exist_ok=True)
    meta = {}
    for pose, p in pngs.items():
        shutil.copy2(p, os.path.join(d, pose + ".png"))
        w, h = _png_size(p)
        meta[pose] = {"w": w, "h": h}
    _jwrite(os.path.join(d, "sheet.json"), meta)
    _jwrite(os.path.join(d, "about.json"), {"desc": "이웃 빌리지 선물", "name": name[:30], "made": int(time.time())})
    return key
