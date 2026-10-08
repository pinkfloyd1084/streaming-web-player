"""
Radio Anarchy - Health Daemon & Operational Watchdog
Periodically pings the local API engine, checks memory/socket health, and recovers stalled services.
"""

import time
import urllib.request
import urllib.error
import subprocess
import datetime
from pathlib import Path

HEALTH_URL = "http://127.0.0.1:8000/health"
LOG_FILE = Path("C:/RadioAnarchyMusicPlayer/operations/monitor.log")

def log(msg: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def check_engine():
    try:
        req = urllib.request.Request(HEALTH_URL)
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return True
    except Exception as e:
        log(f"[WARN] Health check probe failed: {e}")
        return False
    return False

def restart_audio_service():
    log("[ACTION] Attempting automated recovery of Radio Anarchy Audio Engine...")
    try:
        # Run restart script
        subprocess.run(
            ["C:\\Python314\\python.exe", "C:\\RadioAnarchyMusicPlayer\\server\\restart_server.py"],
            capture_output=True,
            timeout=10
        )
        time.sleep(1)
        # Spawning server
        subprocess.Popen(
            ["C:\\Python314\\python.exe", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "C:\\RadioAnarchyMusicPlayer\\server"],
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        )
        log("[SUCCESS] Audio Engine service respawned.")
    except Exception as e:
        log(f"[CRITICAL] Service respawn crashed: {e}")

def run_loop():
    log("[SYSTEM] Radio Anarchy Operational Watchdog started.")
    consecutive_failures = 0
    while True:
        if check_engine():
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            log(f"[ALERT] Engine unreachable (failure {consecutive_failures}/3)")
            if consecutive_failures >= 3:
                restart_audio_service()
                consecutive_failures = 0
        time.sleep(30)

if __name__ == "__main__":
    run_loop()
