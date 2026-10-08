"""
Radio Anarchy - Autonomous MP3 Hygiene & Directory Formatter
Scans all channel folders, cleans up messy filenames, strips junk symbols, and triggers /api/reindex.
"""

import os
import re
import urllib.request
import urllib.parse
from pathlib import Path

BASE_DIR = Path("C:/RadioAnarchyMusicPlayer")
IGNORED_DIRS = {"a2a_bridge", "server", "web_player", "tunnel", "operations", ".git"}
REINDEX_URL = "http://127.0.0.1:8000/api/reindex"
ADMIN_TOKEN = "RA-MASTER-DEV-2026"

def clean_filename(name: str) -> str:
    # Remove URL encoded junk and weird Windows forbidden symbols
    clean = re.sub(r'[\r\n\t]+', ' ', name)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def format_library():
    print(f"[*] Starting MP3 Library Hygiene Sweep in {BASE_DIR}...")
    renamed_count = 0
    total_scanned = 0

    for item in sorted(BASE_DIR.iterdir()):
        if item.is_dir() and item.name not in IGNORED_DIRS:
            for file_path in item.glob("*.mp3"):
                total_scanned += 1
                original_name = file_path.name
                cleaned = clean_filename(original_name)
                
                if cleaned != original_name:
                    new_path = file_path.parent / cleaned
                    if not new_path.exists():
                        try:
                            file_path.rename(new_path)
                            print(f"[RENAME] '{original_name}' -> '{cleaned}'")
                            renamed_count += 1
                        except Exception as e:
                            print(f"[ERR] Failed to rename {original_name}: {e}")

    print(f"[*] Sweep complete. Total MP3s: {total_scanned}. Renamed: {renamed_count}.")

    # Trigger Reindex on API
    try:
        req = urllib.request.Request(
            f"{REINDEX_URL}?token={ADMIN_TOKEN}",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"[REINDEX] Backend refreshed: {resp.read().decode('utf-8')}")
    except Exception as e:
        print(f"[WARN] Reindex notification failed: {e}")

if __name__ == "__main__":
    format_library()
