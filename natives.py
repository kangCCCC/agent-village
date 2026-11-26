"""마을이 직접 돌리는 부하 세션 (클로드 앱 목록에는 안 나오고 마을에서만 보고 지시한다).

클로드 앱은 확장 기능이 새 세션을 띄우는 것을 막는다. 그래서 「부하 새로 만들기」로 만든 부하는
마을 서버가 `claude -p` 를 직접 실행해서 돌린다. 지시 하나 = 실행 한 번이고, 같은 세션 id 로 이어 간다.

  처음:   claude -p <지시> --session-id <uuid> ...
  다음:   claude -p <지시> --resume <uuid> ...

대화 기록은 일반 세션처럼 ~/.claude/projects/<폴더>/<uuid>.jsonl 에 쌓이므로 마을이 같은 방식으로 읽는다.
명부: data/natives.json  {native_xxxx: {engine, cli, thread, title, cwd, model, effort, parent, created, archived}}

엔진 (engine)
  claude   claude -p  (기록: ~/.claude/projects/…/<cli>.jsonl)
  codex    codex exec --json / codex exec resume <thread>   (챗GPT 요금제)
  gemini   agy -p --output-format stream-json / --conversation <id>   (안티그래비티, 구글 요금제)
코덱스·제미나이는 기록 형식이 달라서, 마을이 실행 출력을 읽어 클로드 기록과 같은 모양으로
data/native-chat/<id>.jsonl 에 적는다. 그래서 말풍선·채팅 목록은 엔진과 상관없이 같은 코드로 읽는다.
"""
import json, os, subprocess, threading, time, uuid
import plat

HOME = os.path.expanduser("~")
CLAUDE = plat.find_exe("claude")
CODEX = plat.find_exe("codex")
AGY = plat.find_exe("agy")
ENGINES = ("claude", "codex", "gemini")
ENGINE_NAMES = {"claude": "클로드", "codex": "코덱스", "gemini": "제미나이"}
MODELS = {"opus": "claude-opus-5-5", "sonnet": "claude-sonnet-5-5", "haiku": "claude-haiku-5-5", "fable": "claude-fable-5-2"}
EFFORTS = ("low", "medium", "high", "xhigh", "max")

DATA = None          # server 가 넣어 준다
PORT = 8791
LOCK = threading.Lock()
RUNNING = {}         # nid → Popen
QUEUE = {}           # nid → [지시, …]  (일하는 중에 온 지시는 끝난 뒤 차례로)


def _reg_path():
    return os.path.join(DATA, "natives.json")


def load():
    try:
        with open(_reg_path(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(reg):
    os.makedirs(DATA, exist_ok=True)
    tmp = _reg_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=1)
    os.replace(tmp, _reg_path())


def is_native(sid):
    return isinstance(sid, str) and sid.startswith("native_")


def _system_prompt(nid, rec, lead_title):
    lead = rec.get("parent")
    report = ""
    if lead:
        report = (f"\n- 상관: 「{lead_title or lead}」 (id: {lead}). 일을 끝내거나 막히면 상관에게 짧게 보고하세요:\n"
                  f"  curl -s -X POST http://127.0.0.1:{PORT}/api/order -H 'Content-Type: application/json' "
                  f"-d '{{\"to\":\"{lead}\",\"text\":\"[{rec['title']} 보고] …\"}}'")
    return ("당신은 사장님의 「에이전트빌리지」에 사는 주민 세션입니다. 마을 앱이 당신을 직접 실행합니다.\n"
            f"- 내 이름: 「{rec['title']}」, 마을 id: {nid}, 엔진: {ENGINE_NAMES.get(rec.get('engine') or 'claude')}{report}\n"
            + (f"- 맡은 역할과 규칙(꼭 지킬 것): {rec['role']}\n" if rec.get("role") else "")
            + talk_note(nid, rec.get("engine") or "claude") +
            "- 사장님 확인이 필요하면 마지막 답의 첫 줄을 「확인 필요: <무엇을>」으로 시작하세요. 마을에서 손을 들고 기다립니다.\n"
            "- 돈·주문·취소·삭제·외부 발송처럼 되돌리기 어려운 일은 사장님 확인을 받은 뒤에 하세요.\n"
            "- 답은 한국어로 짧고 쉽게 쓰세요.")


def post_dir():
    return os.path.join(DATA, "post")


def outbox(nid):
    d = os.path.join(post_dir(), "out", nid)
    os.makedirs(d, exist_ok=True)
    return d


def talk_note(me, engine="claude"):
    """주민끼리 말 걸기 안내. 제미나이는 자기 칸막이(샌드박스)가 네트워크를 막아서 파일 우편함을 쓴다."""
    if engine == "gemini":
        return (f"- 마을 주민 명단(id·엔진·이름): 파일 {os.path.join(post_dir(), 'roster.txt')} 을 읽으세요.\n"
                f"- 다른 주민에게 말 걸기(묻기·부탁·보고): 파일 쓰기 도구로 {outbox(me)}/ 폴더에 새 .json 파일"
                "(이름은 아무거나, 예: msg-<시각>.json)을 만드세요. 내용: {\"to\":\"<받는 id>\",\"text\":\"<할 말>\"}\n"
                "  마을이 몇 초 안에 배달하고 파일을 치웁니다. curl 로 마을에 연결하지 마세요(막혀 있음).\n"
                "  답은 그 주민이 보내 주면 다음 지시로 들어옵니다. 답을 기다리며 멈춰 있지 말고 할 일을 끝내세요.\n")
    return (f"- 마을 주민 명단(클로드·코덱스·제미나이 세션, id·이름): curl -s http://127.0.0.1:{PORT}/api/roster\n"
            "- 다른 주민에게 말 걸기(묻기·부탁·보고): "
            f"curl -s -X POST http://127.0.0.1:{PORT}/api/order -H 'Content-Type: application/json' "
            f"-d '{{\"to\":\"<받는 id>\",\"from\":\"{me}\",\"text\":\"<할 말>\"}}'\n"
            "  답은 그 주민이 같은 방법으로 당신에게 보내 줍니다(다음 지시로 들어옴). 답을 기다리며 멈춰 있지 말고 할 일을 끝내세요.\n")


def available(engine):
    """이 맥에 그 엔진 명령이 깔려 있는지."""
    exe = {"claude": CLAUDE, "codex": CODEX, "gemini": AGY}.get(engine, "")
    return bool(exe) and os.path.isabs(exe) and os.path.exists(exe)


def chat_path(nid):
    return os.path.join(DATA, "native-chat", nid + ".jsonl")


def _chat(nid, entry):
    os.makedirs(os.path.join(DATA, "native-chat"), exist_ok=True)
    entry.setdefault("timestamp", time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()))
    with open(chat_path(nid), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _say(nid, text, end=False):
    m = {"content": [{"type": "text", "text": text}] if text else []}
    if end:
        m["stop_reason"] = "end_turn"
    _chat(nid, {"type": "assistant", "message": m})


def _tool(nid, name, inp):
    _chat(nid, {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": name, "input": inp}]}})


def _read_codex(nid, stream, log):
    for line in stream:
        log.write(line)
        log.flush()
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        t = ev.get("type")
        if t == "thread.started" and ev.get("thread_id"):
            update(nid, thread=ev["thread_id"])
        it = ev.get("item") or {}
        if t == "item.started" and it.get("type") == "command_execution":
            _tool(nid, "Bash", {"command": str(it.get("command", ""))[:300]})
        elif t == "item.started" and it.get("type") in ("file_change", "web_search", "mcp_tool_call"):
            _tool(nid, {"file_change": "Edit", "web_search": "WebSearch"}.get(it["type"], it.get("tool") or "도구"), {})
        elif t == "item.completed" and it.get("type") == "agent_message" and it.get("text"):
            _say(nid, it["text"])
        elif t in ("turn.failed", "error"):
            _say(nid, "⚠️ 코덱스 오류: " + str(ev.get("error") or ev.get("message") or "")[:300])


def _read_gemini(nid, stream, log):
    buf = {}
    for line in stream:
        log.write(line)
        log.flush()
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        e = ev.get("event")
        if e == "init" and ev.get("conversation_id"):
            update(nid, thread=ev["conversation_id"])
        su = ev.get("step_update") or {}
        if su.get("step_type") == "tool" and su.get("state") == "ACTIVE":
            ti = su.get("tool_info") or {}
            par = ti.get("parameters") or {}
            if su.get("tool_name") == "run_command":
                _tool(nid, "Bash", {"command": str(par.get("CommandLine", ""))[:300]})
            else:
                _tool(nid, su.get("tool_name") or "도구", {})
        elif su.get("step_type") == "agent_response":
            i = su.get("step_index")
            buf[i] = buf.get(i, "") + (su.get("text_delta") or "")
            if su.get("state") == "DONE" and buf.get(i, "").strip():
                _say(nid, buf.pop(i).strip())
        if e == "result":
            r = ev.get("result") or {}
            if r.get("status") not in (None, "SUCCESS"):
                _say(nid, "⚠️ 제미나이 오류: " + str(r.get("error") or r.get("status"))[:300])


def _noopt(t):
    """지시 글이 「-」 로 시작하면 명령 옵션으로 읽힐 수 있다 → 앞에 빈칸 하나 (11-26 3차 검수 14번)."""
    t = str(t or "")
    return " " + t if t.startswith("-") else t


def _args(nid, rec, text, lead_title_of):
    eng = rec.get("engine") or "claude"
    first = not rec.get("started")
    if eng == "codex":
        msg = text if rec.get("thread") else _system_prompt(nid, rec, lead_title_of(rec.get("parent"))) + "\n\n---\n" + text
        a = [CODEX, "exec"] + (["resume", rec["thread"]] if rec.get("thread") else [])
        a += ["--json", "--skip-git-repo-check", "-c", 'sandbox_mode="workspace-write"',
              "-c", "sandbox_workspace_write.network_access=true"]
        if rec.get("effort"):
            a += ["-c", f'model_reasoning_effort="{"xhigh" if rec["effort"] == "max" else rec["effort"]}"']
        return a + [_noopt(msg)]
    if eng == "gemini":
        msg = text if rec.get("thread") else _system_prompt(nid, rec, lead_title_of(rec.get("parent"))) + "\n\n---\n" + text
        a = [AGY, "-p", _noopt(msg), "--output-format", "stream-json", "--add-dir", post_dir()]
        if rec.get("thread"):
            a += ["--conversation", rec["thread"]]
        if rec.get("effort"):
            a += ["--effort", rec["effort"]]
        return a
    a = [CLAUDE, "-p", _noopt(text),
         "--permission-mode", "auto",
         "--output-format", "stream-json", "--verbose",
         "--append-system-prompt", _system_prompt(nid, rec, lead_title_of(rec.get("parent")))]
    a += ["--session-id", rec["cli"]] if first else ["--resume", rec["cli"]]
    if rec.get("model"):
        a += ["--model", rec["model"]]
    if rec.get("effort"):
        a += ["--effort", rec["effort"]]
    return a


def _run(nid, text, lead_title_of):
    reg = load()
    rec = reg.get(nid)
    if not rec:
        return
    first = not rec.get("started")
    eng = rec.get("engine") or "claude"
    args = _args(nid, rec, text, lead_title_of)
    logd = os.path.join(DATA, "native-logs")
    os.makedirs(logd, exist_ok=True)
    log = open(os.path.join(logd, nid + ".log"), "a", encoding="utf-8")
    log.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
    log.flush()
    env = plat.tool_env()
    env.pop("CLAUDECODE", None)
    cwd = rec.get("cwd") if rec.get("cwd") and os.path.isdir(rec["cwd"]) else HOME
    args = plat.launch_prefix(args[0]) + list(args[1:])     # 윈도우 .cmd 를 cmd.exe 로 거치지 않게
    if eng == "claude":
        p = subprocess.Popen(args, cwd=cwd, stdout=log, stderr=log, stdin=subprocess.DEVNULL, env=env)
    else:
        _chat(nid, {"type": "user", "message": {"content": text}})
        p = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=log, stdin=subprocess.DEVNULL, env=env,
                             text=True, encoding="utf-8", errors="replace")
        reader = _read_codex if eng == "codex" else _read_gemini
        threading.Thread(target=reader, args=(nid, p.stdout, log), daemon=True).start()
    with LOCK:
        RUNNING[nid] = p
    if first:
        reg = load()
        if nid in reg:
            reg[nid]["started"] = True
            save(reg)

    def wait():
        p.wait()
        if eng != "claude":
            time.sleep(0.5)            # 읽는 쪽이 마지막 줄까지 적을 틈
            _say(nid, "", end=True)    # 한 턴 끝 표시 (말풍선 쪽에서 '일하는 중' 을 끈다)
        log.close()
        with LOCK:
            RUNNING.pop(nid, None)
            nxt = QUEUE.get(nid, [])
            text2 = nxt.pop(0) if nxt else None
        if text2:
            _run(nid, text2, lead_title_of)
    threading.Thread(target=wait, daemon=True).start()


def send(nid, text, lead_title_of):
    """지시 넣기. 일하는 중이면 줄 세웠다가 끝난 뒤 이어서. 결과: 'started' | 'queued'"""
    with LOCK:
        busy = nid in RUNNING          # 끝난 뒤 정리(턴 끝 표시)까지 마쳐야 RUNNING 에서 빠진다
        if busy:
            QUEUE.setdefault(nid, []).append(text)
            return "queued"
    _run(nid, text, lead_title_of)
    return "started"


def create(title, cwd, parent, model, effort, text, lead_title_of, engine="claude", role=""):
    nid = "native_" + uuid.uuid4().hex[:12]
    engine = engine if engine in ENGINES else "claude"
    reg = load()
    reg[nid] = {"engine": engine, "cli": str(uuid.uuid4()), "title": title, "cwd": cwd, "parent": parent, "role": role,
                "model": (model or MODELS["sonnet"]) if engine == "claude" else engine, "effort": effort or "medium",
                "created": int(time.time() * 1000), "archived": False}
    save(reg)
    send(nid, text, lead_title_of)
    return nid


def update(nid, **kw):
    reg = load()
    if nid not in reg:
        return False
    reg[nid].update({k: v for k, v in kw.items() if v is not None})
    save(reg)
    return True


def remove(nid):
    """명부에서 지운다. 돌고 있으면 멈춘다. 대화 기록 파일은 남긴다(되살릴 일이 있을 수 있어서)."""
    with LOCK:
        p = RUNNING.pop(nid, None)
        QUEUE.pop(nid, None)
    if p and p.poll() is None:
        p.terminate()
    reg = load()
    reg.pop(nid, None)
    save(reg)


def working(nid):
    with LOCK:
        p = RUNNING.get(nid)
        return bool(p and p.poll() is None), len(QUEUE.get(nid, []))


def interrupt(nid):
    """「⚡ 지금 보내기」: 돌고 있는 실행을 멈추고 밀린 지시도 비운다. 대화 기록은 그대로라 다음 실행이 이어 간다."""
    with LOCK:
        p = RUNNING.pop(nid, None)
        QUEUE.pop(nid, None)
    if p and p.poll() is None:
        p.terminate()
