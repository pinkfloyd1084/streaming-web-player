"""
Radio Anarchy - Agent-to-Agent (A2A) Bridge Server
Runs locally on Little Gumbus (Windows Server)
Provides authenticated remote execution, process management, and file inspection.
"""

import http.server
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

PORT = 8765
A2A_AUTH_KEY = os.environ.get("A2A_KEY", "RA_A2A_GUMBUS_SECURE_2026_AUDIO")

# Process tracker
RUNNING_PROCESSES = {}
PROCESS_LOCK = threading.Lock()
START_TIME = time.time()


def check_auth(headers):
    auth_header = headers.get("Authorization", "")
    key_header = headers.get("X-A2A-Key", "")
    if key_header == A2A_AUTH_KEY:
        return True
    if auth_header.startswith("Bearer ") and auth_header[7:].strip() == A2A_AUTH_KEY:
        return True
    return False


class A2AHandler(http.server.BaseHTTPRequestHandler):
    server_version = "RadioAnarchy-A2A/1.0"

    def _send_json(self, status_code, data):
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-A2A-Key")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-A2A-Key")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "status": "online",
                "machine": os.environ.get("COMPUTERNAME", "Unknown"),
                "python": sys.version,
                "uptime_seconds": round(time.time() - START_TIME, 2),
                "cwd": os.getcwd()
            })
            return

        if not check_auth(self.headers):
            self._send_json(401, {"error": "Unauthorized: Invalid or missing A2A key"})
            return

        if self.path == "/processes":
            with PROCESS_LOCK:
                proc_list = {}
                for name, p_info in list(RUNNING_PROCESSES.items()):
                    proc = p_info["proc"]
                    poll_res = proc.poll()
                    proc_list[name] = {
                        "pid": proc.pid,
                        "command": p_info["command"],
                        "started_at": p_info["started_at"],
                        "status": "running" if poll_res is None else f"exited (code {poll_res})"
                    }
            self._send_json(200, {"processes": proc_list})
            return

        self._send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        if not check_auth(self.headers):
            self._send_json(401, {"error": "Unauthorized: Invalid or missing A2A key"})
            return

        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_len)
            payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception as e:
            self._send_json(400, {"error": f"Invalid JSON payload: {str(e)}"})
            return

        if self.path == "/exec":
            cmd = payload.get("command")
            if not cmd:
                self._send_json(400, {"error": "Missing 'command' parameter"})
                return

            shell_type = payload.get("shell", "powershell").lower()
            timeout = payload.get("timeout", 60)
            workdir = payload.get("workdir", "C:\\RadioAnarchyMusicPlayer")

            if shell_type == "powershell":
                exec_cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
            elif shell_type == "cmd":
                exec_cmd = ["cmd.exe", "/c", cmd]
            elif shell_type == "python":
                exec_cmd = [sys.executable, "-c", cmd]
            else:
                exec_cmd = cmd

            start_t = time.time()
            try:
                res = subprocess.run(
                    exec_cmd,
                    shell=isinstance(exec_cmd, str),
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=workdir if os.path.exists(workdir) else None
                )
                duration = round(time.time() - start_t, 3)
                self._send_json(200, {
                    "success": res.returncode == 0,
                    "exit_code": res.returncode,
                    "stdout": res.stdout,
                    "stderr": res.stderr,
                    "duration_seconds": duration
                })
            except subprocess.TimeoutExpired:
                self._send_json(408, {"error": f"Command timed out after {timeout} seconds"})
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return

        if self.path == "/spawn":
            name = payload.get("name")
            cmd = payload.get("command")
            if not name or not cmd:
                self._send_json(400, {"error": "Missing 'name' or 'command'"})
                return

            workdir = payload.get("workdir", "C:\\RadioAnarchyMusicPlayer")
            shell_type = payload.get("shell", "powershell").lower()

            with PROCESS_LOCK:
                if name in RUNNING_PROCESSES and RUNNING_PROCESSES[name]["proc"].poll() is None:
                    self._send_json(409, {
                        "error": f"Process '{name}' is already running with PID {RUNNING_PROCESSES[name]['proc'].pid}"
                    })
                    return

                if shell_type == "powershell":
                    spawn_cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
                elif shell_type == "cmd":
                    spawn_cmd = ["cmd.exe", "/c", cmd]
                else:
                    spawn_cmd = cmd

                # Detached background process
                proc = subprocess.Popen(
                    spawn_cmd,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
                    cwd=workdir if os.path.exists(workdir) else None,
                    shell=isinstance(spawn_cmd, str)
                )

                RUNNING_PROCESSES[name] = {
                    "proc": proc,
                    "command": cmd,
                    "started_at": time.time()
                }

                self._send_json(200, {
                    "status": "spawned",
                    "name": name,
                    "pid": proc.pid
                })
            return

        if self.path == "/kill":
            name = payload.get("name")
            pid = payload.get("pid")

            with PROCESS_LOCK:
                target_proc = None
                if name and name in RUNNING_PROCESSES:
                    target_proc = RUNNING_PROCESSES[name]["proc"]
                elif pid:
                    for n, p_info in RUNNING_PROCESSES.items():
                        if p_info["proc"].pid == pid:
                            target_proc = p_info["proc"]
                            name = n
                            break

                if not target_proc:
                    if pid:
                        try:
                            import signal
                            os.kill(int(pid), signal.SIGTERM)
                            self._send_json(200, {"status": "killed_os_pid", "pid": pid})
                            return
                        except Exception as e:
                            self._send_json(500, {"error": f"Failed to kill PID {pid}: {e}"})
                            return
                    self._send_json(404, {"error": "Process not found in managed list"})
                    return

                try:
                    target_proc.terminate()
                    time.sleep(0.5)
                    if target_proc.poll() is None:
                        target_proc.kill()
                    self._send_json(200, {"status": "terminated", "name": name, "pid": target_proc.pid})
                except Exception as e:
                    self._send_json(500, {"error": f"Failed to kill process: {str(e)}"})
            return

        if self.path == "/fs/scan":
            scan_path = payload.get("path", "C:\\RadioAnarchyMusicPlayer")
            p = Path(scan_path)
            if not p.exists():
                self._send_json(404, {"error": f"Path '{scan_path}' does not exist"})
                return

            folders = []
            for item in p.iterdir():
                if item.is_dir():
                    mp3_count = len(list(item.glob("*.mp3")))
                    folders.append({
                        "name": item.name,
                        "path": str(item),
                        "mp3_count": mp3_count
                    })

            self._send_json(200, {
                "base_path": str(p),
                "folder_count": len(folders),
                "folders": sorted(folders, key=lambda x: x["name"])
            })
            return

        self._send_json(404, {"error": "Endpoint not found"})


def run():
    print(f"==================================================")
    print(f"  Radio Anarchy - Agent-to-Agent (A2A) Bridge")
    print(f"  Listening on: http://0.0.0.0:{PORT}")
    print(f"  Auth Key: {A2A_AUTH_KEY}")
    print(f"==================================================")
    server_address = ("0.0.0.0", PORT)
    httpd = http.server.ThreadingHTTPServer(server_address, A2AHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping A2A Bridge.")
        httpd.server_close()


if __name__ == "__main__":
    run()
