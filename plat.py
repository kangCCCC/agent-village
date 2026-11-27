"""운영체제마다 다른 것을 한곳에 모은다 (맥·윈도우·리눅스).

마을 몸통(server.py 등)은 이 파일만 부르고, 맥 전용 명령(sips·grep·/opt/homebrew 경로)을 직접 쓰지 않는다.
- 맥: 지금까지와 똑같이 돈다 (sips 로 그림 굽기, 맥 경로)
- 윈도우·리눅스: 그림은 Pillow 로 굽고, 실행 파일은 PATH 와 흔한 설치 자리에서 찾는다
"""
import os, shutil, subprocess, sys

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"
HOME = os.path.expanduser("~")


def _extra_dirs():
    d = [os.path.join(HOME, ".local", "bin")]
    if IS_WIN:
        for env in ("APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"):
            v = os.environ.get(env)
            if not v:
                continue
            if env == "APPDATA":
                d.append(os.path.join(v, "npm"))
            elif env == "LOCALAPPDATA":
                d += [os.path.join(v, "Programs", "claude"), os.path.join(v, "Microsoft", "WindowsApps")]
            else:
                d += [os.path.join(v, "Git", "cmd"), os.path.join(v, "GitHub CLI"), os.path.join(v, "nodejs")]
    else:
        d += ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
    return d


def tool_path():
    """도구를 찾을 PATH: 원래 PATH 앞에 흔한 설치 자리를 붙인다."""
    parts = _extra_dirs() + os.environ.get("PATH", "").split(os.pathsep)
    seen, out = set(), []
    for p in parts:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return os.pathsep.join(out)


def tool_env(**extra):
    return dict(os.environ, PATH=tool_path(), **extra)


def find_exe(name):
    """실행 파일의 온전한 경로. 못 찾으면 이름 그대로 (그러면 실행할 때 '없음' 오류가 난다)."""
    hit = shutil.which(name, path=tool_path())
    if hit or not (IS_WIN and name == "claude"):
        return hit or name
    # 윈도우에 데스크톱 앱만 있으면 claude 명령이 PATH 에 없다 → 앱이 들고 있는 claude.exe 를 찾아 본다
    import glob as _g
    local = os.environ.get("LOCALAPPDATA") or os.path.join(HOME, "AppData", "Local")
    exes = []
    for pat in (os.path.join(local, "Claude-Data", "*", "**", "claude.exe"), os.path.join(local, "AnthropicClaude", "**", "claude.exe"),
                os.path.join(local, "Programs", "claude*", "**", "claude.exe")):
        exes += _g.glob(pat, recursive=True)
    exes = [e for e in exes if os.path.isfile(e) and os.path.getsize(e) > 5_000_000]   # 작은 실행기 말고 본체
    return max(exes, key=os.path.getmtime) if exes else name


def launch_prefix(exe):
    """실행 파일을 부를 때 쓸 앞부분 [실행파일, ...].
    윈도우의 npm 바로가기(.cmd/.bat)에 사용자 글을 인자로 넘기면 cmd.exe 가 그 글을 명령으로 해석할 수 있다
    (따옴표·& 같은 글자로 다른 명령이 실행됨). 그래서 .cmd 는 그 안의 node 스크립트를 찾아 node 로 바로 부르고,
    못 찾으면 부르지 않는다."""
    if not IS_WIN or not exe.lower().endswith((".cmd", ".bat")):
        return [exe]
    import re
    try:
        t = open(exe, encoding="utf-8", errors="ignore").read()
    except OSError:
        raise RuntimeError(f"{exe} 를 읽지 못했습니다")
    m = re.search(r'%(?:~)?dp0%?\\?([^"%]+?\.(?:js|cjs|mjs))', t, re.I)
    node = find_exe("node")
    if m and os.path.isfile(node):
        js = os.path.normpath(os.path.join(os.path.dirname(exe), *m.group(1).strip("\\").split("\\")))
        if os.path.isfile(js):
            return [node, js]
    raise RuntimeError(f"{os.path.basename(exe)} 는 윈도우 배치 파일이라 안전하게 부를 수 없습니다 (node 스크립트를 못 찾음)")


def claude_app_sessions():
    """클로드 데스크톱 앱이 코드 세션 정보를 두는 폴더."""
    if IS_MAC:
        return os.path.join(HOME, "Library", "Application Support", "Claude", "claude-code-sessions")
    if IS_WIN:
        # 윈도우는 설치 방식(스토어판·설치판)에 따라 자리가 다르다 (11-28 실제 윈도우 PC:
        # %LOCALAPPDATA%\Claude-Data\claude_<무작위>\claude-code-sessions). 후보 중 실제로 세션 파일이 있는 곳을 고른다
        import glob as _g
        roam = os.environ.get("APPDATA") or os.path.join(HOME, "AppData", "Roaming")
        local = os.environ.get("LOCALAPPDATA") or os.path.join(HOME, "AppData", "Local")
        cands = [os.path.join(roam, "Claude", "claude-code-sessions")]
        for pat in (os.path.join(local, "Claude-Data", "*", "claude-code-sessions"), os.path.join(local, "Claude*", "claude-code-sessions"),
                    os.path.join(local, "Packages", "*Claude*", "LocalCache", "Roaming", "Claude", "claude-code-sessions"),
                    os.path.join(roam, "Claude*", "claude-code-sessions")):
            cands += _g.glob(pat)
        live = [c for c in cands if os.path.isdir(c) and _g.glob(os.path.join(c, "*", "*", "local_*.json"))]
        if live:
            return max(live, key=lambda c: max(os.path.getmtime(f) for f in _g.glob(os.path.join(c, "*", "*", "local_*.json"))))
        return next((c for c in cands if os.path.isdir(c)), cands[0])
    return os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.join(HOME, ".config"),
                        "Claude", "claude-code-sessions")


def log_dir():
    if IS_MAC:
        return os.path.join(HOME, "Library", "Logs")
    if IS_WIN:
        return os.path.join(os.environ.get("LOCALAPPDATA") or HOME, "AgentVillage")
    return os.path.join(HOME, ".local", "state", "agent-village")


def _pillow():
    try:
        from PIL import Image
        return Image
    except ImportError:
        return None


def has_image_tool():
    return IS_MAC and os.path.exists("/usr/bin/sips") or _pillow() is not None


def reencode_image(src, dst, fmt="jpeg", quality=None, max_side=None, height=None):
    """그림을 새로 굽는다 (남이 보낸 그림 안에 숨은 것을 떨구고, 크기도 줄인다).
    fmt: 'jpeg' 또는 'png'. max_side: 긴 변 최대 픽셀. height: 높이를 이 값으로 (비율 유지).
    성공하면 True. 그림이 아니거나 도구가 없으면 False (받는 쪽은 버린다)."""
    fmt = "png" if fmt == "png" else "jpeg"
    if IS_MAC and os.path.exists("/usr/bin/sips"):
        cmd = ["/usr/bin/sips", "-s", "format", fmt]
        if quality and fmt == "jpeg":
            cmd += ["-s", "formatOptions", str(int(quality))]
        if max_side:
            cmd += ["-Z", str(int(max_side))]
        if height:
            cmd += ["--resampleHeight", str(int(height))]
        cmd += [src, "--out", dst]
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=60)
        except Exception:
            return False
        return r.returncode == 0 and os.path.isfile(dst) and os.path.getsize(dst) > 0
    Image = _pillow()
    if Image is None:
        return False
    try:
        Image.MAX_IMAGE_PIXELS = 80_000_000        # 압축 폭탄 막기
        with Image.open(src) as im:
            im.load()
            im = im.convert("RGBA" if fmt == "png" else "RGB")
            if max_side and max(im.size) > max_side:
                im.thumbnail((int(max_side), int(max_side)))
            if height and im.size[1] != height:
                im = im.resize((max(1, round(im.size[0] * height / im.size[1])), int(height)))
            kw = {"quality": int(quality or 85)} if fmt == "jpeg" else {}
            im.save(dst, "PNG" if fmt == "png" else "JPEG", **kw)   # 메타데이터(exif 등)는 따라가지 않는다
        return os.path.getsize(dst) > 0
    except Exception:
        try:
            os.remove(dst)
        except OSError:
            pass
        return False


def files_containing(needle, files):
    """grep -lF 대신: needle 이 든 파일 목록 (윈도우에는 grep 이 없다)."""
    b = needle.encode("utf-8")
    hits = []
    for f in files:
        try:
            with open(f, "rb") as fh:
                tail = b""
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    if b in tail + chunk:
                        hits.append(f)
                        break
                    tail = chunk[-len(b):]
        except OSError:
            pass
    return hits


def open_path(path):
    """파일·폴더를 그 운영체제의 기본 앱으로 연다."""
    if IS_WIN:
        os.startfile(path)          # noqa  (윈도우 전용)
    elif IS_MAC:
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
