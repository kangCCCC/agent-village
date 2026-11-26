@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >/dev/null 2>/dev/null && (py -3 install.py) || (python install.py)
if errorlevel 1 (echo. & echo 파이썬 3.10 이상이 필요합니다: https://www.python.org/downloads/ 에서 받아 깔고 다시 눌러 주세요)
pause
