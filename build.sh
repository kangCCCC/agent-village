#!/bin/bash
# 에이전트빌리지 앱 만들기:  bash build.sh            → build/에이전트빌리지.app
#                        bash build.sh --install  → /Applications 에 설치
set -euo pipefail
cd "$(dirname "$0")"
NAME="에이전트빌리지"
APP="build/$NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -o "$APP/Contents/MacOS/AgentVillage" app/main.swift app/recorder.swift -framework AppKit -framework WebKit \
  -framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia
cp server.py plat.py pickle_box.py natives.py tokens.py artist.py cs_box.py neighbor.py ilchon.py relay.py "$APP/Contents/Resources/"
cp -R web "$APP/Contents/Resources/web"
[ -f app/AppIcon.icns ] && cp app/AppIcon.icns "$APP/Contents/Resources/"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>com.agentvillage.share</string>
  <key>CFBundleExecutable</key><string>AgentVillage</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.2</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>마을 화면을 녹화할 때 사장님 목소리를 같이 녹음합니다.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
EOF
# 맥 권한(파일 접근 허락)이 다시 만들 때마다 풀리지 않게: 서명 신원을 cdhash 가 아니라 번들 id 로 고정한다
BID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist")
codesign --force --deep -s - -r="designated => identifier \"$BID\"" "$APP" >/dev/null
echo "만듦: $APP"

if [ "${1:-}" = "--install" ]; then
  pkill -x AgentVillage 2>/dev/null || true
  pkill -f "Contents/Resources/server.py" 2>/dev/null || true
  sleep 1
  rm -rf "/Applications/$NAME.app"
  cp -R "$APP" /Applications/
  echo "설치: /Applications/$NAME.app"
  open "/Applications/$NAME.app"      # 설치하고 다시 켠다 (예전엔 꺼진 채로 남았다)
fi
