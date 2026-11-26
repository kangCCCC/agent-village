"""에이전트빌리지 실행기 — 맥 앱 없이 (윈도우·리눅스, 또는 맥에서 브라우저로) 마을을 띄운다.

    python run.py            서버를 띄우고 브라우저 창을 연다. 이 창(또는 작업 표시줄의 파이썬)을 닫으면 마을도 꺼진다.
    python run.py --no-open  브라우저는 열지 않는다

맥 앱(app/main.swift)이 하던 일을 그대로 한다:
 ① 서버가 죽으면 까닭을 로그에 적고 3초 뒤 다시 띄운다 (10분 안에 5번 넘게 죽으면 멈춘다)
 ② 살아 있어도 2분 넘게 대답이 없으면 끄고 다시 띄운다
 ③ 실행기가 꺼지면 서버도 같이 꺼진다 (서버의 표준입력이 닫히는 것으로 안다)
"""
import os, subprocess, sys, time, urllib.request, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plat  # noqa: E402

PORT = int(os.environ.get("VILLAGE_PORT", "8791"))
DATA = os.environ.get("VILLAGE_DATA") or os.path.join(HERE, "data")
URL = f"http://127.0.0.1:{PORT}/"
os.makedirs(plat.log_dir(), exist_ok=True)
LOG = os.path.join(plat.log_dir(), "AgentVillage.log")


def log(msg):
    line = f"[실행기 {time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line)
    try:
        print(line, end="", flush=True)
    except Exception:
        pass


def python_exe():
    """그림 굽기(Pillow)가 든 마을 전용 파이썬이 있으면 그걸 쓴다."""
    for p in (os.path.join(HERE, ".venv", "Scripts", "python.exe"), os.path.join(HERE, ".venv", "bin", "python")):
        if os.path.exists(p):
            return p
    return sys.executable


def start():
    os.makedirs(os.path.join(DATA, "receipts"), exist_ok=True)
    env = dict(os.environ, VILLAGE_PORT=str(PORT), VILLAGE_DATA=DATA, VILLAGE_STDIN_WATCH="1",
               PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    out = open(LOG, "a", encoding="utf-8")
    kw = {}
    if plat.IS_WIN:
        kw["creationflags"] = 0x08000000      # CREATE_NO_WINDOW: 검은 창을 또 띄우지 않는다
    return subprocess.Popen([python_exe(), "-u", os.path.join(HERE, "server.py")], cwd=HERE, env=env,
                            stdin=subprocess.PIPE, stdout=out, stderr=out, **kw)


def alive():
    try:
        with urllib.request.urlopen(URL + "api/agents", timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def open_window():
    """크롬·엣지가 있으면 주소창 없는 앱 창으로, 없으면 기본 브라우저로."""
    cands = []
    if plat.IS_WIN:
        for env in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            v = os.environ.get(env)
            if v:
                cands += [os.path.join(v, "Google", "Chrome", "Application", "chrome.exe"),
                          os.path.join(v, "Microsoft", "Edge", "Application", "msedge.exe")]
    elif plat.IS_MAC:
        cands = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    else:
        cands = [plat.find_exe(n) for n in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge")]
    for c in cands:
        if c and os.path.isfile(c):
            try:
                subprocess.Popen([c, f"--app={URL}", "--window-size=1280,820"])
                return
            except OSError:
                pass
    webbrowser.open(URL)


def main():
    if alive():      # 이미 돌고 있다 (바로가기를 또 누름) → 창만 연다
        if "--no-open" not in sys.argv:
            open_window()
        return 0
    log(f"마을을 띄웁니다 ({sys.platform}, 자료 {DATA})")
    restarts, fails, opened = [], 0, "--no-open" in sys.argv
    p = start()
    t0 = time.time()
    try:
        while True:
            time.sleep(1)
            if p.poll() is not None:
                log(f"마을 서버가 끝났습니다 (끝난 값 {p.returncode})")
                now = time.time()
                restarts = [t for t in restarts if now - t < 600] + [now]
                if len(restarts) > 5:
                    log(f"10분 안에 5번 넘게 죽어서 다시 띄우기를 멈춥니다. 로그: {LOG}")
                    return 1
                time.sleep(3)
                log(f"마을 서버를 다시 띄웁니다 ({len(restarts)}번째)")
                p, t0 = start(), time.time()
                continue
            if not opened and alive():
                opened = True
                open_window()
                log(f"열림: {URL}")
            elif not opened and time.time() - t0 > 15:
                log("서버가 15초 넘게 대답이 없습니다. 로그를 보세요: " + LOG)
                t0 = time.time()
            if opened and int(time.time()) % 30 == 0:
                if alive():
                    fails = 0
                else:
                    fails += 1
                    log(f"마을 서버가 대답이 없습니다 ({fails}/4)")
                    if fails >= 4:
                        log("2분 넘게 대답이 없어 끄고 다시 띄웁니다")
                        fails = 0
                        p.terminate()
                        try:
                            p.wait(5)
                        except subprocess.TimeoutExpired:
                            p.kill()
    except KeyboardInterrupt:
        log("끝냅니다")
    finally:
        if p.poll() is None:
            p.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
