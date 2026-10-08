@echo off
title Radio Anarchy - A2A Agent Bridge (Little Gumbus)
cd /d "C:\RadioAnarchyMusicPlayer\a2a_bridge"

echo ========================================================
echo   Radio Anarchy - Agent-to-Agent (A2A) Bridge Server
echo   Running on Little Gumbus
echo ========================================================
echo.

:: Ensure Windows Firewall rule exists for port 8765
netsh advfirewall firewall show rule name="RadioAnarchy A2A Bridge" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Adding Windows Firewall rule for inbound port 8765...
    netsh advfirewall firewall add rule name="RadioAnarchy A2A Bridge" dir=in action=allow protocol=TCP localport=8765
)

:: Find Python
set PYTHON_EXE=C:\Python314\python.exe
if not exist "%PYTHON_EXE%" (
    set PYTHON_EXE=python.exe
)

echo Starting A2A Bridge on port 8765 using %PYTHON_EXE%...
"%PYTHON_EXE%" a2a_server.py

echo.
echo Server stopped.
pause
