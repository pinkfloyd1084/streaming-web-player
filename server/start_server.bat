@echo off
title Radio Anarchy - Audio API Engine
cd /d "C:\RadioAnarchyMusicPlayer\server"

echo ==========================================================
echo   Radio Anarchy - Audio Distribution Backend (FastAPI)
echo   Listening on: http://0.0.0.0:8205
echo ==========================================================
echo.

C:\Python314\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8205 --app-dir C:\RadioAnarchyMusicPlayer\server

echo.
echo Server exited.
pause
