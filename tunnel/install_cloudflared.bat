@echo off
title Radio Anarchy - Cloudflare Tunnel Installer
cd /d "C:\RadioAnarchyMusicPlayer\tunnel"

echo ==========================================================
echo   Downloading Cloudflare Tunnel CLI (cloudflared.exe)...
echo ==========================================================
echo.

if not exist cloudflared.exe (
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
)

if exist cloudflared.exe (
    echo Cloudflared successfully downloaded!
    echo.
    echo STEP 1: Login to Cloudflare
    echo Run: cloudflared.exe tunnel login
    echo.
    echo STEP 2: Create Tunnel
    echo Run: cloudflared.exe tunnel create radio-anarchy
    echo.
    echo STEP 3: Route DNS
    echo Run: cloudflared.exe tunnel route dns radio-anarchy radio.radioanarchy.gg
    echo.
    echo STEP 4: Update config.yml with your Tunnel UUID and run:
    echo cloudflared.exe tunnel --config C:\RadioAnarchyMusicPlayer\tunnel\config.yml run
) else (
    echo Failed to download cloudflared.exe. Please download manually from Cloudflare.
)

pause
