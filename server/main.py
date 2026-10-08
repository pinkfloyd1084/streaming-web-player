"""
Radio Anarchy - Commercial Audio Distribution Backend
FastAPI REST API serving royalty-free audio for OBS streaming.
Runs on Little Gumbus (C:\\RadioAnarchyMusicPlayer)
"""

import datetime
import hmac
import hashlib
import json
import os
import random
import re
import secrets
import smtplib
import urllib.parse
from email.message import EmailMessage
from pathlib import Path
from typing import Optional, List, Dict

from fastapi import FastAPI, HTTPException, Request, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# Configuration
BASE_DIR = Path("C:/RadioAnarchyMusicPlayer")
TOKENS_FILE = BASE_DIR / "server" / "tokens.json"
WEB_DIR = BASE_DIR / "web_player"
LANDING_DIR = BASE_DIR / "web_landing"
IGNORED_DIRS = {"a2a_bridge", "server", "web_player", "web_landing", "tunnel", "operations", ".git", "__pycache__"}

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

app = FastAPI(
    title="Radio Anarchy Music Engine",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None
)

# CORS configuration
ALLOWED_ORIGINS = [
    "https://radio.radioanarchy.gg",
    "http://radio.radioanarchy.gg",
    "http://radio.radioanarchy.gg:8205",
    "https://radio.radioanarchy.gg:8205",
    "http://localhost:8205",
    "http://127.0.0.1:8205",
    "http://192.168.0.229:8205",
    "http://192.168.0.46:8205",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://192.168.0.229:8000",
    "http://192.168.0.46:8000",
    "null"  # OBS browser source origin can appear as null
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory music index
MUSIC_INDEX: Dict[str, List[Dict[str, str]]] = {}
CHANNEL_INFO: List[Dict[str, any]] = []


def load_tokens_data() -> dict:
    if not TOKENS_FILE.exists():
        return {"tokens": {}, "ip_whitelist": [], "ip_blacklist": []}
    try:
        with open(TOKENS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to read {TOKENS_FILE}: {e}")
        return {"tokens": {}, "ip_whitelist": [], "ip_blacklist": []}


def save_tokens_data(data: dict):
    with open(TOKENS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def generate_access_token(tier: str = "ad-free", owner: str = "Subscriber", email: str = "") -> str:
    token_str = f"RA-SUB-{secrets.token_hex(8).upper()}"
    data = load_tokens_data()
    data.setdefault("tokens", {})[token_str] = {
        "tier": tier,
        "owner": owner,
        "email": email,
        "status": "active",
        "created_at": datetime.datetime.now().isoformat()
    }
    save_tokens_data(data)
    return token_str


def authenticate_subscriber(request: Request, token: Optional[str] = Query(None)):
    client_ip = request.client.host if request.client else "unknown"
    data = load_tokens_data()

    # IP blacklist check
    if client_ip in data.get("ip_blacklist", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied for IP {client_ip}"
        )

    # Token extraction: Query param takes precedence (for <audio src>), then Authorization header
    auth_token = token
    if not auth_token:
        auth_hdr = request.headers.get("Authorization")
        if auth_hdr and auth_hdr.startswith("Bearer "):
            auth_token = auth_hdr[7:].strip()
        elif auth_hdr:
            auth_token = auth_hdr.strip()

    if not auth_token:
        # Check if client IP is explicitly whitelisted
        if client_ip in data.get("ip_whitelist", []):
            return {"tier": "ip-whitelisted", "owner": client_ip}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing subscriber access token. Pass via ?token=... or Authorization header."
        )

    tokens = data.get("tokens", {})
    if auth_token not in tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired subscriber token."
        )

    token_meta = tokens[auth_token]
    if token_meta.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription token is {token_meta.get('status', 'inactive')}."
        )

    return token_meta


def scan_library():
    """Scans C:\\RadioAnarchyMusicPlayer and indexes all valid genre folders and MP3s."""
    global MUSIC_INDEX, CHANNEL_INFO
    new_index = {}
    new_channel_info = []

    if not BASE_DIR.exists():
        print(f"[WARN] Base directory {BASE_DIR} does not exist.")
        return

    # Clean title regex (e.g. "StreamBeats by Harris Heller - Arcade - 01 Title.mp3")
    title_pattern = re.compile(r"^.*?-\s*(?:\d+\s+)?(.*)\.mp3$", re.IGNORECASE)

    for item in sorted(BASE_DIR.iterdir()):
        if item.is_dir() and item.name not in IGNORED_DIRS:
            genre_name = item.name
            mp3_files = sorted(list(item.glob("*.mp3")))

            tracks = []
            for mp3_path in mp3_files:
                filename = mp3_path.name
                match = title_pattern.match(filename)
                clean_title = match.group(1).strip() if match else mp3_path.stem

                tracks.append({
                    "id": f"{genre_name.lower()}-{len(tracks)+1:03d}",
                    "filename": filename,
                    "title": clean_title,
                    "genre": genre_name,
                    "relative_url": f"/stream/{genre_name}/{urllib.parse.quote(filename)}"
                })

            if tracks:
                new_index[genre_name] = tracks
                has_cover = (item / "cover.jpg").exists() or (item / "cover.png").exists()
                new_channel_info.append({
                    "genre": genre_name,
                    "track_count": len(tracks),
                    "cover_url": f"/cover/{genre_name}" if has_cover else None
                })

    MUSIC_INDEX = new_index
    CHANNEL_INFO = new_channel_info
    print(f"[INDEX] Scanned {len(MUSIC_INDEX)} channels with {sum(len(v) for v in MUSIC_INDEX.values())} total tracks.")


@app.on_event("startup")
def startup_event():
    scan_library()


@app.get("/")
def root_redirect(request: Request):
    """
    If token is in query, launches the OBS player.
    Otherwise serves the public commercial landing & sign-up page.
    """
    token = request.query_params.get("token")
    if token:
        query = request.url.query
        return RedirectResponse(url=f"/player/?{query}")
    landing_index = LANDING_DIR / "index.html"
    if landing_index.exists():
        return FileResponse(path=str(landing_index), media_type="text/html")
    return RedirectResponse(url="/player/")


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "Radio Anarchy Music Engine",
        "total_channels": len(MUSIC_INDEX),
        "total_tracks": sum(len(v) for v in MUSIC_INDEX.values()),
        "base_directory": str(BASE_DIR)
    }


@app.get("/channels")
def get_channels(user=Depends(authenticate_subscriber)):
    """Returns list of active audio channels and metadata."""
    return {
        "channels": CHANNEL_INFO,
        "subscriber": user.get("owner", "Active User")
    }


@app.get("/channel/{genre}")
def get_genre_playlist(genre: str, token: str = Query(...), user=Depends(authenticate_subscriber)):
    """Returns a randomized playlist array for the requested genre."""
    # Case-insensitive lookup
    matched_genre = None
    for g in MUSIC_INDEX.keys():
        if g.lower() == genre.lower():
            matched_genre = g
            break

    if not matched_genre:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Channel '{genre}' not found. Available channels: {list(MUSIC_INDEX.keys())}"
        )

    tracks = MUSIC_INDEX[matched_genre]
    # Randomized playlist copy
    randomized_playlist = tracks.copy()
    random.shuffle(randomized_playlist)

    # Attach the active token to each stream URL for direct player consumption
    formatted_playlist = []
    for t in randomized_playlist:
        t_copy = t.copy()
        t_copy["stream_url"] = f"{t['relative_url']}?token={token}"
        formatted_playlist.append(t_copy)

    return {
        "genre": matched_genre,
        "total_tracks": len(formatted_playlist),
        "playlist": formatted_playlist
    }


@app.get("/stream/{genre}/{filename:path}")
async def stream_audio(genre: str, filename: str, request: Request, user=Depends(authenticate_subscriber)):
    """Streams the requested MP3 asynchronously with partial content (HTTP 206) support."""
    unquoted_filename = urllib.parse.unquote(filename)
    audio_path = BASE_DIR / genre / unquoted_filename

    if not audio_path.exists() or not audio_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file '{unquoted_filename}' not found in channel '{genre}'"
        )

    # FileResponse in Starlette automatically handles Range headers and chunks
    return FileResponse(
        path=str(audio_path),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f'inline; filename="{audio_path.name}"'
        }
    )


@app.get("/cover/{genre}")
def get_cover_art(genre: str):
    """Serves channel cover artwork."""
    for ext in ["cover.jpg", "cover.png", "cover.jpeg"]:
        cover_path = BASE_DIR / genre / ext
        if cover_path.exists():
            media_type = "image/jpeg" if ext.endswith("jpg") or ext.endswith("jpeg") else "image/png"
            return FileResponse(path=str(cover_path), media_type=media_type)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cover artwork found")


@app.post("/api/reindex")
def trigger_reindex(user=Depends(authenticate_subscriber)):
    """Forces a refresh of the library index."""
    scan_library()
    return {
        "status": "reindexed",
        "total_channels": len(MUSIC_INDEX),
        "total_tracks": sum(len(v) for v in MUSIC_INDEX.values())
    }


# Phase 4: Monetization & Subscriber Webhooks
@app.post("/api/webhook/subscription")
async def handle_subscription_webhook(request: Request):
    """
    Webhook handler for Stripe / Lemon Squeezy subscription events.
    When a $10/mo ad-free tier subscription succeeds, generates a token and notifies the subscriber.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = payload.get("type") or payload.get("event_name", "unknown")
    print(f"[BILLING WEBHOOK] Event received: {event_type}")

    if event_type in ["checkout.session.completed", "customer.subscription.created", "subscription_created", "order_created"]:
        obj = payload.get("data", {}).get("object", {}) or payload.get("data", {})
        customer_email = obj.get("customer_email") or obj.get("email") or "streamer@radioanarchy.gg"
        customer_name = obj.get("customer_details", {}).get("name") or obj.get("user_name") or "Radio Anarchy Subscriber"

        new_token = generate_access_token(tier="ad-free", owner=customer_name, email=customer_email)
        obs_player_url = f"https://radio.radioanarchy.gg:8205/?token={new_token}"

        print(f"[SUBSCRIPTION ACTIVATED] Token: {new_token} for {customer_email}")

        if SMTP_HOST and SMTP_USER and SMTP_PASS:
            try:
                msg = EmailMessage()
                msg["Subject"] = "Welcome to Radio Anarchy // Your Commercial OBS Stream Token"
                msg["From"] = f"Radio Anarchy <{SMTP_USER}>"
                msg["To"] = customer_email
                msg.set_content(f"""Greetings, {customer_name}!

Thank you for subscribing to Radio Anarchy Pro ($10/mo Ad-Free Commercial Audio).

Your personal OBS Browser Source URL:
{obs_player_url}

Your Access Token:
{new_token}

QUICK OBS SETUP:
1. Open OBS Studio.
2. In your Sources dock, click '+' and choose 'Browser'.
3. Name it 'Radio Anarchy Music'.
4. Paste the OBS Player URL into the URL field.
5. Set Width: 680, Height: 480 (or your preferred HUD size).
6. Check 'Control audio via OBS' if you want a dedicated fader in your audio mixer.
7. Click OK and rock on!

Need support? Reach out anytime.
-- Gumbus the Cat & The Radio Anarchy Team
""")
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USER, SMTP_PASS)
                    server.send_message(msg)
                print(f"[EMAIL DELIVERED] Welcome letter sent to {customer_email}")
            except Exception as mail_err:
                print(f"[EMAIL ERROR] Failed to send email to {customer_email}: {mail_err}")

        return {
            "status": "success",
            "action": "token_provisioned",
            "token": new_token,
            "obs_url": obs_player_url
        }

    elif event_type in ["customer.subscription.deleted", "subscription_cancelled", "subscription_expired"]:
        obj = payload.get("data", {}).get("object", {}) or payload.get("data", {})
        customer_email = obj.get("customer_email") or obj.get("email")
        if customer_email:
            data = load_tokens_data()
            deactivated = 0
            for t_key, t_val in data.get("tokens", {}).items():
                if t_val.get("email") == customer_email:
                    t_val["status"] = "cancelled"
                    deactivated += 1
            if deactivated > 0:
                save_tokens_data(data)
                print(f"[SUBSCRIPTION REVOKED] Deactivated {deactivated} tokens for {customer_email}")

        return {"status": "success", "action": "tokens_revoked"}

    return {"status": "ignored", "reason": f"Unhandled event type: {event_type}"}


@app.post("/api/token/lookup")
async def lookup_token(request: Request):
    """Allows subscribers to look up their token & personal OBS URL via email."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    data = load_tokens_data()
    for t_key, t_val in data.get("tokens", {}).items():
        if t_val.get("email", "").strip().lower() == email and t_val.get("status") == "active":
            return {
                "found": True,
                "token": t_key,
                "tier": t_val.get("tier", "pro"),
                "obs_url": f"https://radio.radioanarchy.gg:8205/?token={t_key}"
            }

    return {"found": False, "message": "No active subscription found for this email address."}


@app.post("/api/sponsor/redeem")
async def redeem_sponsor_code(request: Request):
    """Allows sponsors to redeem code RAStreamsMusic2026 for a lifetime free Pro pass."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    code = body.get("code", "").strip()
    name = body.get("name", "").strip() or "Sponsor Partner"
    email = body.get("email", "").strip().lower() or "sponsor@radioanarchy.gg"

    if code != "RAStreamsMusic2026":
        raise HTTPException(status_code=400, detail="Invalid sponsor code.")

    # Check if this email or sponsor already has an active token
    data = load_tokens_data()
    for t_key, t_val in data.get("tokens", {}).items():
        if (t_val.get("email", "").strip().lower() == email or t_key == "RAStreamsMusic2026") and t_val.get("status") == "active":
            return {
                "success": True,
                "token": t_key,
                "tier": "pro",
                "owner": t_val.get("owner", name),
                "obs_url": f"https://radio.radioanarchy.gg:8205/?token={t_key}",
                "message": "Sponsor VIP access confirmed!"
            }

    # Generate custom VIP sponsor token
    new_token = f"RA-VIP-{secrets.token_hex(4).upper()}"
    data.setdefault("tokens", {})[new_token] = {
        "tier": "pro",
        "owner": name,
        "email": email,
        "status": "active",
        "sponsor": True,
        "created_at": datetime.now().isoformat(),
        "expires": "never"
    }
    save_tokens_data(data)

    return {
        "success": True,
        "token": new_token,
        "tier": "pro",
        "owner": name,
        "obs_url": f"https://radio.radioanarchy.gg:8205/?token={new_token}",
        "message": "Sponsor VIP access activated!"
    }


@app.post("/api/auth/verify")
async def verify_auth(request: Request):
    """Sign-in verification for subscribers/sponsors using email or token."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    identifier = body.get("identifier", "").strip().lower()
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifier is required")

    data = load_tokens_data()
    # Check by token key directly
    for t_key, t_val in data.get("tokens", {}).items():
        if (t_key.lower() == identifier or t_val.get("email", "").lower() == identifier) and t_val.get("status") == "active":
            return {
                "valid": True,
                "token": t_key,
                "owner": t_val.get("owner", "Subscriber"),
                "email": t_val.get("email", ""),
                "tier": t_val.get("tier", "pro"),
                "obs_url": f"https://radio.radioanarchy.gg:8205/?token={t_key}"
            }

    return {"valid": False, "message": "No active account found for that token or email."}


@app.get("/images/{filename}")
def get_landing_image(filename: str):
    img_path = LANDING_DIR / "images" / filename
    if img_path.exists():
        return FileResponse(path=str(img_path))
    raise HTTPException(status_code=404, detail="Image not found")


@app.get("/style.css")
def get_root_style():
    return FileResponse(path=str(LANDING_DIR / "style.css"), media_type="text/css")

@app.get("/landing.js")
def get_root_script():
    return FileResponse(path=str(LANDING_DIR / "landing.js"), media_type="application/javascript")

# Mount Static OBS Player & Landing Page
if WEB_DIR.exists():
    app.mount("/player", StaticFiles(directory=str(WEB_DIR), html=True), name="player")

if LANDING_DIR.exists():
    app.mount("/landing", StaticFiles(directory=str(LANDING_DIR), html=True), name="landing")
