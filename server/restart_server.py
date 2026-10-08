import os
import subprocess
import time

def free_port(port=8000):
    try:
        out = subprocess.run(f"netstat -ano | findstr :{port}", shell=True, capture_output=True, text=True).stdout
        for line in out.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5 and "LISTENING" in parts:
                pid = int(parts[-1])
                if pid != os.getpid():
                    print(f"Killing PID {pid} on port {port}")
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    free_port(8000)
    free_port(8205)
    time.sleep(1)
    print("Ports 8000 & 8205 are clean!")
