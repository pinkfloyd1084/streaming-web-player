@echo off
title Radio Anarchy - Audio API Engine
cd /d "C:\RadioAnarchyMusicPlayer\server"

echo ==========================================================
echo   Radio Anarchy - Audio Distribution Backend (FastAPI HTTPS)
echo   Listening on: https://0.0.0.0:8205
echo ==========================================================
echo.

C:\Python314\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8205 --app-dir C:\RadioAnarchyMusicPlayer\server --ssl-keyfile "C:\RadioAnarchyMusicPlayer\ssl\private.key.pem" --ssl-certfile "C:\RadioAnarchyMusicPlayer\ssl\domain.cert.pem"

echo.
echo Server exited.
pause
