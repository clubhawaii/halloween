#!/bin/bash
# HALLOWEEN CARD PHOTO BOOTH — Mac 실행 (이 창을 닫으면 종료됩니다)
cd "$(dirname "$0")"
PORT=8731
echo ""
echo " HALLOWEEN CARD PHOTO BOOTH"
echo " 잠시 후 브라우저가 열립니다: http://localhost:$PORT"
echo " 행사 중에는 이 터미널 창을 닫지 마세요."
echo ""
(sleep 1; open "http://localhost:$PORT/") &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1
else
  /usr/bin/ruby -run -e httpd . -p $PORT
fi
