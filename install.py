"""에이전트빌리지 설치 — 윈도우·리눅스용 (맥은 install.sh 를 쓴다).

    윈도우: 「설치.bat」 을 두 번 누른다 (또는 명령창에서  py -3 install.py)
    리눅스: python3 install.py

하는 일: ① 준비물 확인 ② 자료 폴더·기본 설정 ③ 마을 전용 파이썬(.venv: 그림 굽기·자르기 도구)
        ④ 우체부 모드에 자료 폴더 경로 채우기 ⑤ 주민끼리 말 걸기 기술 깔기 ⑥ 바탕화면 바로가기
"""
import json, locale, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WIN = sys.platform.startswith("win")
DATA = os.path.join(HERE, "data")


def say(s):
    print(s, flush=True)


def which(n):
    return shutil.which(n) or (os.path.exists(os.path.join(os.path.expanduser("~"), ".local", "bin", n + (".exe" if WIN else "")))
                               and os.path.join(os.path.expanduser("~"), ".local", "bin", n + (".exe" if WIN else "")))


def main():
    if sys.platform == "darwin":
        sys.exit("맥은 install.sh 를 쓰세요:  bash install.sh")
    if sys.version_info < (3, 10):
        sys.exit("파이썬 3.10 이상이 필요합니다 (지금 %d.%d). python.org 에서 새로 까세요." % sys.version_info[:2])

    say("① 준비물 확인")
    say("  파이썬 %d.%d 있음" % sys.version_info[:2])
    say("  깃: " + ("있음" if which("git") else "없음 → 이웃·일촌 기능을 쓰려면 git-scm.com 에서 Git 을 까세요"))
    say("  클로드 명령: " + ("있음" if which("claude") else "없음 → 마을이 새 주민을 직접 만들려면 필요합니다.\n"
        "    데스크톱 앱만 깔려 있으면 기존 세션은 보이지만 「새 주민 만들기」는 안 됩니다.\n"
        "    깔기: npm install -g @anthropic-ai/claude-code  (노드가 없으면 nodejs.org 에서 먼저)"))
    say("  코덱스: " + ("있음" if which("codex") else "없음 (코덱스 주민은 못 만듦)"))

    say("② 자료 폴더와 기본 설정")
    os.makedirs(os.path.join(DATA, "receipts"), exist_ok=True)
    sp = os.path.join(DATA, "settings.json")
    defaults = {}
    dp = os.path.join(HERE, "dist-defaults.json")       # 배포본을 만들 때 넣어 둔 기본값 (배포자·우편함 주소)
    if os.path.exists(dp):
        defaults = json.load(open(dp, encoding="utf-8"))
    if not os.path.exists(sp):
        lang = (locale.getlocale()[0] or "")
        ko = lang.lower().startswith(("ko", "korean"))
        cfg = {"ownerName": defaults.get("ownerName") or ("사장님" if ko else "Boss"), "usdKrw": 1342, "lang": "ko" if ko else "en"}
        for k in ("relayUrl", "distributor"):
            if defaults.get(k):
                cfg[k] = defaults[k]
        json.dump(cfg, open(sp, "w", encoding="utf-8"), ensure_ascii=False)
        say("  설정 만듦")
    elif defaults.get("distributor"):
        cfg = json.load(open(sp, encoding="utf-8"))
        cfg.setdefault("distributor", defaults["distributor"])
        json.dump(cfg, open(sp, "w", encoding="utf-8"), ensure_ascii=False)

    say("③ 마을 전용 파이썬 (.venv: pillow·numpy·scipy) — 몇 분 걸릴 수 있어요")
    venv = os.path.join(HERE, ".venv")
    py = os.path.join(venv, "Scripts", "python.exe") if WIN else os.path.join(venv, "bin", "python")
    if not os.path.exists(py):
        subprocess.run([sys.executable, "-m", "venv", venv], check=True)
    req = os.path.join(HERE, "art", "requirements.txt")
    subprocess.run([py, "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", req], check=True)
    say("  준비됨: " + py)

    say("④ 우체부 모드에 자료 폴더 경로 채우기")
    reg = os.path.join(HERE, "mod", "village-mail", "hooks", "register.ts")
    if os.path.exists(reg):
        t = open(reg, encoding="utf-8").read()
        u = t.replace("__VILLAGE_DATA__", DATA.replace("\\", "/"))
        if u != t:
            open(reg, "w", encoding="utf-8").write(u)
        say("  우체부 경로: " + DATA)

    say("⑤ 주민끼리 말 걸기 기술 (village-talk) 깔기")
    sk = os.path.join(os.path.expanduser("~"), ".claude", "skills", "village-talk")
    os.makedirs(sk, exist_ok=True)
    shutil.copyfile(os.path.join(HERE, "skills", "village-talk", "SKILL.md"), os.path.join(sk, "SKILL.md"))

    say("⑥ 바로가기 만들기")
    if WIN:
        pyw = os.path.join(venv, "Scripts", "pythonw.exe")
        bat = os.path.join(HERE, "에이전트빌리지.bat")
        with open(bat, "w", encoding="ascii", errors="ignore", newline="\r\n") as f:
            f.write('@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0.venv\\Scripts\\pythonw.exe" "%~dp0run.py"\r\n')
        q = lambda v: str(v).replace("'", "''")      # 파워셸 작은따옴표 글에 넣을 때 ' 는 '' 로 (폴더 이름에 ' 가 있어도 안 깨지게)
        pyw, HERE_q, run_q = q(pyw), q(HERE), q(os.path.join(HERE, "run.py"))
        ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\에이전트빌리지.lnk');"
              f"$s.TargetPath='{pyw}';$s.Arguments='\"{run_q}\"';$s.WorkingDirectory='{HERE_q}';")
        ico = os.path.join(HERE, "app", "AppIcon.ico")
        if os.path.exists(ico):
            ps += f"$s.IconLocation='{q(ico)}';"
        ps += "$s.Save()"
        r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
        say("  바탕화면에 「에이전트빌리지」 바로가기를 만들었어요" if r.returncode == 0
            else "  바로가기를 못 만들었어요. 「에이전트빌리지.bat」 을 두 번 눌러 켜세요")
    else:
        sh = os.path.join(HERE, "에이전트빌리지.sh")
        with open(sh, "w", encoding="utf-8") as f:
            f.write(f'#!/bin/sh\ncd "{HERE}" && exec "{py}" run.py "$@"\n')
        os.chmod(sh, 0o755)
        say("  켜기: " + sh)

    say("\n끝. 지금 마을을 켭니다. 다음: HANDOFF.md 의 「우체부 붙이기」를 따라 하세요 (지시 보내기에 필요).")
    subprocess.Popen([os.path.join(venv, "Scripts", "pythonw.exe") if WIN else py, os.path.join(HERE, "run.py")], cwd=HERE)


if __name__ == "__main__":
    main()
