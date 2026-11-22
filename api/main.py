import asyncio
import http.cookiejar
import json
import logging
import os
import re
import shutil
import subprocess
import time
import urllib.request
import uuid
import zipfile

# Crucial: strip PM2 IPC variable so child processes (like Deno JS challenge solver) don't crash
os.environ.pop("NODE_CHANNEL_FD", None)
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("kiwiapi")

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Load environment variables
ENV_FILE = Path("/opt/kiwiapi/.env")
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
else:
    load_dotenv()

API_KEYS_RAW = os.getenv("API_KEYS", "").strip()
API_KEYS = {k.strip() for k in API_KEYS_RAW.split(",") if k.strip()}
WEB_KEY = os.getenv("WEB_KEY", "").strip()
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "https://dl.kiwiapi.net").strip()
ALLOWED_ORIGINS = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]
TMP_DIR = Path(os.getenv("TMP_DIR", "/var/lib/kiwiapi/tmp"))
MAX_SECONDS = int(os.getenv("MAX_SECONDS", "1800"))
DEV_MODE = os.getenv("DEV", "0") == "1"

# Refuse startup if keys are not configured (unless DEV=1)
if not DEV_MODE and not API_KEYS and not WEB_KEY:
    raise RuntimeError("KiwiAPI startup aborted: Both API_KEYS and WEB_KEY are empty in .env")

TMP_DIR.mkdir(parents=True, exist_ok=True)


# In-memory Rate Limiting for WEB_KEY (e.g. 60 requests per minute per IP)
ip_request_timestamps: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX = 60

# In-memory Job Store
jobs: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background periodic cleanup loop (every 5 minutes, removes files > 30 minutes)
    async def cleanup_loop():
        while True:
            await asyncio.sleep(300)
            now = time.time()
            cutoff = now - MAX_SECONDS
            # 1. Clean temporary files/folders from disk
            try:
                for item in TMP_DIR.iterdir():
                    try:
                        mtime = item.stat().st_mtime
                        if mtime < cutoff:
                            if item.is_dir():
                                shutil.rmtree(item, ignore_errors=True)
                            else:
                                item.unlink(missing_ok=True)
                    except Exception:
                        pass
            except Exception:
                pass

            # 2. Clean expired entries from memory job store
            expired = [jid for jid, info in list(jobs.items()) if info.get("created_at", 0) < cutoff]
            for jid in expired:
                jobs.pop(jid, None)

    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


API_DESCRIPTION = """
## 🥝 KiwiAPI Developer Integration Guide

KiwiAPI is a high-speed, asynchronous media metadata, download and recognition API supporting **YouTube, Instagram, TikTok, Pinterest, Twitter/X, Facebook**, and more.

---

### 🔑 Authentication
All requests (except public static assets) require an API key passed via the header:
```http
X-API-Key: <YOUR_API_KEY>
Content-Type: application/json
```

---

### 🚀 Asynchronous Download Architecture (3 Steps)
Media downloads are handled asynchronously so long video encodings (e.g., 1080p, 4K) never time out:

1. **Get Media Information**: `POST /v1/info`
   - Send `{ "url": "..." }`
   - Returns media title, duration, author, thumbnail, and all available video/audio/image qualities.

2. **Queue Download Job**: `POST /v1/download`
   - Send `{ "url": "...", "type": "video", "quality": "720p" }`
   - Returns `{ "id": "<job_id>", "job_id": "<job_id>" }` immediately.

3. **Poll Status & Download**: `GET /v1/jobs/{job_id}`
   - Poll every 1-2 seconds until status changes from `"running"` to `"done"`.
   - When `"done"`, download the direct file stream at `GET /v1/files/{job_id}`.

---

### 🤖 Telegram Bot Integration (Python Example)
```python
import aiohttp
import asyncio

class KiwiDownloader:
    def __init__(self, api_key: str, base_url: str = "https://api.kiwiapi.net"):
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    async def get_info(self, url: str) -> dict:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.base_url}/v1/info", json={"url": url}, headers=self.headers) as resp:
                return await resp.json()

    async def download_media(self, url: str, media_type: str = "video", quality: str = "720p") -> str:
        async with aiohttp.ClientSession() as session:
            # 1. Start Job
            async with session.post(f"{self.base_url}/v1/download", 
                                    json={"url": url, "type": media_type, "quality": quality}, 
                                    headers=self.headers) as resp:
                data = await resp.json()
                job_id = data.get("job_id") or data.get("id")

            # 2. Poll Status
            for _ in range(30):
                await asyncio.sleep(2)
                async with session.get(f"{self.base_url}/v1/jobs/{job_id}", headers=self.headers) as status_resp:
                    job = await status_resp.json()
                    if job.get("status") == "done":
                        return f"{self.base_url}/v1/files/{job_id}"
                    elif job.get("status") == "failed":
                        raise Exception(job.get("error", "Download failed"))

            raise TimeoutError("Download timed out")
```

---

### 🌐 Website / App Integration (JavaScript / Fetch)
```javascript
const KIWI_API = "https://api.kiwiapi.net";
const API_KEY = "YOUR_API_KEY";

// 1. Fetch info and available formats
async function getMediaInfo(url) {
  const res = await fetch(`${KIWI_API}/v1/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ url })
  });
  return await res.json();
}

// 2. Start Download and Poll
async function downloadFile(url, type = "video", quality = "720p") {
  const start = await fetch(`${KIWI_API}/v1/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ url, type, quality })
  });
  const { job_id } = await start.json();

  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(`${KIWI_API}/v1/jobs/${job_id}`, {
      headers: { "X-API-Key": API_KEY }
    });
    const data = await poll.json();
    if (data.status === "done") {
      window.location.href = `${KIWI_API}/v1/files/${job_id}`;
      return;
    } else if (data.status === "failed") {
      throw new Error(data.error);
    }
  }
}
```

---

### ⚡ Quick cURL Test
```bash
# 1. Fetch Info
curl -X POST https://api.kiwiapi.net/v1/info \\
     -H "X-API-Key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"url":"https://www.instagram.com/reel/DgAaOG-PGSH/"}'

# 2. Queue Download
curl -X POST https://api.kiwiapi.net/v1/download \\
     -H "X-API-Key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"url":"https://www.instagram.com/reel/DgAaOG-PGSH/","type":"video","quality":"720p"}'
```
"""

app = FastAPI(
    title="KiwiAPI Documentation & Endpoints",
    version="1.0.0",
    description=API_DESCRIPTION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if DEV_MODE else ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


async def verify_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    if DEV_MODE and not API_KEYS and not WEB_KEY:
        return True

    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    key = x_api_key.strip()
    if key in API_KEYS:
        return True

    if WEB_KEY and key == WEB_KEY:
        # Verify Origin header
        origin = request.headers.get("origin") or request.headers.get("referer")
        if not DEV_MODE:
            if not origin:
                raise HTTPException(status_code=403, detail="Origin header required for Web Key")
            origin_clean = origin.rstrip("/")
            if not any(origin_clean.startswith(allowed.rstrip("/")) for allowed in ALLOWED_ORIGINS):
                raise HTTPException(status_code=403, detail="Unauthorized Origin for Web Key")

        # Rate Limit per client IP
        ip = get_client_ip(request)
        now = time.time()
        timestamps = [t for t in ip_request_timestamps[ip] if now - t < RATE_LIMIT_WINDOW]
        if len(timestamps) >= RATE_LIMIT_MAX:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
        timestamps.append(now)
        ip_request_timestamps[ip] = timestamps
        return True

    raise HTTPException(status_code=401, detail="Invalid API key")


class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    type: str  # "video", "audio", "image"
    quality: str


def format_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return ""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def find_cookies_file() -> Optional[Path]:
    cookie_paths = [
        Path(os.getenv("COOKIES_FILE", "/opt/kiwiapi/cookies.txt")),
        Path("cookies.txt"),
        Path(__file__).resolve().parent / "cookies.txt",
        Path(__file__).resolve().parent.parent / "cookies.txt",
        Path("/opt/kiwiapi/cookies.txt"),
        Path("/opt/kiwiapi/api/cookies.txt"),
    ]
    for cp in cookie_paths:
        if cp.exists():
            return cp
    return None


def id_to_pk(shortcode: str) -> int:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    pk = 0
    for char in shortcode:
        pk = (pk * 64) + alphabet.index(char)
    return pk


def fetch_instagram_media_info_direct(shortcode: str, cookie_file: Optional[Path] = None) -> Optional[dict]:
    try:
        media_id = id_to_pk(shortcode)
    except Exception:
        return None

    url = f"https://www.instagram.com/api/v1/media/{media_id}/info/"
    headers = {
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "Origin": "https://www.instagram.com",
        "Referer": f"https://www.instagram.com/p/{shortcode}/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
    }

    try:
        if cookie_file and cookie_file.exists():
            cj = http.cookiejar.MozillaCookieJar(str(cookie_file))
            cj.load(ignore_discard=True, ignore_expires=True)
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        else:
            opener = urllib.request.build_opener()

        req = urllib.request.Request(url, headers=headers)
        with opener.open(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("items", [])
            if items:
                return items[0]
    except Exception as e:
        logger.warning(f"Direct IG extraction failed for {shortcode}: {e}")
    return None


@app.get("/")
def root():
    return {
        "service": "KiwiAPI",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "time": time.time()}


@app.post("/v1/info")
async def get_media_info(payload: InfoRequest, authenticated: bool = Depends(verify_api_key)):
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    loop = asyncio.get_running_loop()
    cp = find_cookies_file()

    # Check for Instagram shortcode (post, reel, tv)
    ig_shortcode = None
    if "instagram.com" in url.lower() or "instagr.am" in url.lower():
        m = re.search(r"/(?:p|reel|tv|stories)/([A-Za-z0-9_-]+)", url)
        if m:
            ig_shortcode = m.group(1)

    # For Instagram photo/carousel posts, fetch directly from Instagram API
    if ig_shortcode:
        ig_item = await loop.run_in_executor(None, fetch_instagram_media_info_direct, ig_shortcode, cp)
        if ig_item:
            media_type = ig_item.get("media_type")  # 1 = photo, 2 = video, 8 = carousel
            user = ig_item.get("user", {})
            username = user.get("username", "instagram_user")
            caption_obj = ig_item.get("caption") or {}
            caption_text = caption_obj.get("text", "")
            title = caption_text[:60].strip() if caption_text else f"Post by {username}"

            image_options = []
            video_options = []

            if media_type == 1:
                # Single photo post
                candidates = ig_item.get("image_versions2", {}).get("candidates", [])
                best_img = candidates[0].get("url", "") if candidates else ""
                thumbnail = best_img
                if best_img:
                    w = candidates[0].get("width", 1080)
                    h = candidates[0].get("height", 1350)
                    image_options.append({
                        "label": "Original JPG Plate",
                        "size": f"{w}x{h} HD",
                        "url": best_img,
                    })
                return {
                    "title": title,
                    "author": username,
                    "duration": "",
                    "thumbnail": thumbnail,
                    "video": [],
                    "audio": [],
                    "images": image_options,
                }
            elif media_type == 8:
                # Carousel post
                carousel = ig_item.get("carousel_media", [])
                thumbnail = ""
                for idx, c in enumerate(carousel, start=1):
                    c_type = c.get("media_type")
                    if c_type == 1:
                        c_candidates = c.get("image_versions2", {}).get("candidates", [])
                        if c_candidates:
                            c_url = c_candidates[0].get("url", "")
                            if not thumbnail:
                                thumbnail = c_url
                            w = c_candidates[0].get("width", 1080)
                            h = c_candidates[0].get("height", 1350)
                            image_options.append({
                                "label": f"Plate {idx:02d}",
                                "size": f"{w}x{h} HD",
                                "url": c_url,
                            })
                    elif c_type == 2:
                        vids = c.get("video_versions", [])
                        if vids:
                            video_options.append({
                                "label": f"Video Clip {idx:02d} (720p)",
                                "size": "HD MP4",
                            })
                return {
                    "title": title,
                    "author": username,
                    "duration": "",
                    "thumbnail": thumbnail,
                    "video": video_options,
                    "audio": [],
                    "images": image_options,
                }

    import yt_dlp

    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "check_formats": False,
        "format": "all",
        "format_sort": ["res", "fps", "vbr", "tbr", "size"],
        "remote_components": ["ejs:github"],
        "extractor_args": {
            "youtube": {
                "player_client": ["web_embedded", "tv", "mweb"],
            }
        },
    }
    deno_path = shutil.which("deno") or "/usr/local/bin/deno"
    if Path(deno_path).exists():
        ydl_opts["js_runtimes"] = {"deno": {"path": str(deno_path)}}

    if cp:
        ydl_opts["cookiefile"] = str(cp)

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await loop.run_in_executor(None, _extract)
    except Exception as e:
        # Fallback for Instagram if yt-dlp threw 'No video formats found'
        if ig_shortcode:
            ig_item = await loop.run_in_executor(None, fetch_instagram_media_info_direct, ig_shortcode, cp)
            if ig_item:
                user = ig_item.get("user", {})
                username = user.get("username", "instagram_user")
                caption_obj = ig_item.get("caption") or {}
                title = caption_obj.get("text", "")[:60].strip() or f"Post by {username}"
                candidates = ig_item.get("image_versions2", {}).get("candidates", [])
                thumb = candidates[0].get("url", "") if candidates else ""
                return {
                    "title": title,
                    "author": username,
                    "duration": "",
                    "thumbnail": thumb,
                    "video": [],
                    "audio": [],
                    "images": [{"label": "Original JPG Plate", "size": "HD", "url": thumb}] if thumb else [],
                }
        raise HTTPException(status_code=400, detail=f"Could not extract info: {str(e)}")

    if not info:
        raise HTTPException(status_code=404, detail="No media found at URL")

    title = info.get("title") or "Untitled media"
    author = info.get("uploader") or info.get("channel") or "Unknown"
    duration = format_duration(info.get("duration"))
    thumbnail = info.get("thumbnail") or ""

    video_options = []
    audio_options = []
    image_options = []

    # Check for formats - group by true resolution tier and select highest bitrate stream
    formats = info.get("formats", [])
    best_by_res = {}
    for f in formats:
        h = f.get("height")
        w = f.get("width")
        vcodec = f.get("vcodec", "none")
        if vcodec != "none" and (h or w):
            # Short edge represents the resolution tier (720p for 720x1280 or 1280x720)
            res = min(h, w) if (h and w) else (h or w or 0)
            if res >= 360:
                tbr = f.get("tbr") or 0
                vbr = f.get("vbr") or 0
                size = f.get("filesize") or f.get("filesize_approx") or 0
                score = size or ((vbr or tbr) * 1000)
                if res not in best_by_res or score > best_by_res[res]["score"]:
                    best_by_res[res] = {"format": f, "score": score, "size": size, "tbr": tbr, "res": res}

    for res in sorted(best_by_res.keys(), reverse=True):
        entry = best_by_res[res]
        filesize = entry["size"]
        size_str = f"{round(filesize / (1024 * 1024), 1)} MB" if filesize else "High Bitrate"
        if res >= 2160:
            label = "4K (2160p) • Ultra HD"
        elif res >= 1440:
            label = "2K (1440p) • QHD"
        elif res >= 1080:
            label = "1080p • Full HD (Max Quality)"
        elif res >= 720:
            label = "720p • HD"
        elif res >= 480:
            label = "480p • SD"
        else:
            label = f"{res}p MP4"
        video_options.append({"label": label, "size": size_str})

    if not video_options:
        video_options = [
            {"label": "4K (2160p) • Ultra HD", "size": "Ultra HD"},
            {"label": "1080p • Full HD (Max Quality)", "size": "Standard"},
            {"label": "720p • HD", "size": "Fast"},
            {"label": "480p MP4", "size": "Compact"},
        ]

    clean_video_options = video_options[:6]

    audio_options = [
        {"label": "MP3 320 kbps", "size": "Best Audio"},
        {"label": "M4A 256 kbps", "size": "High Quality"},
        {"label": "OPUS 160 kbps", "size": "Compact"},
    ]

    # Gallery or carousel images
    entries = info.get("entries")
    if entries and isinstance(entries, list):
        for idx, entry in enumerate(entries, start=1):
            thumb = entry.get("thumbnail") or entry.get("url") or ""
            image_options.append({
                "label": f"Plate {idx:02d} — {entry.get('title', 'Image')}",
                "size": "Original",
                "url": thumb,
            })
    elif "thumbnails" in info and isinstance(info["thumbnails"], list) and len(info["thumbnails"]) > 0:
        best_thumb = info["thumbnails"][-1].get("url", "")
        if best_thumb:
            image_options.append({
                "label": "Original JPG Plate",
                "size": "High Res",
                "url": best_thumb,
            })

    return {
        "title": title,
        "author": author,
        "duration": duration,
        "thumbnail": thumbnail,
        "video": clean_video_options,
        "audio": audio_options,
        "images": image_options[:12],
    }


def _run_download_task(job_id: str, url: str, media_type: str, quality: str):
    job_dir = TMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    jobs[job_id]["status"] = "running"

    cp = find_cookies_file()

    # Direct Instagram photo/carousel download
    ig_shortcode = None
    if "instagram.com" in url.lower() or "instagr.am" in url.lower():
        m = re.search(r"/(?:p|reel|tv|stories)/([A-Za-z0-9_-]+)", url)
        if m:
            ig_shortcode = m.group(1)

    if ig_shortcode:
        ig_item = fetch_instagram_media_info_direct(ig_shortcode, cp)
        if ig_item:
            ig_type = ig_item.get("media_type")
            # If media_type is photo (1) or carousel (8), or user requested image
            if ig_type in (1, 8) or media_type == "image":
                clean_user = "".join(c for c in (ig_item.get("user", {}).get("username") or "instagram") if c.isalnum() or c in " _-")[:25]
                try:
                    if ig_type == 1:
                        candidates = ig_item.get("image_versions2", {}).get("candidates", [])
                        if candidates:
                            img_url = candidates[0]["url"]
                            out_file = job_dir / f"{clean_user}_{ig_shortcode}.jpg"
                            req_img = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                            with urllib.request.urlopen(req_img, timeout=25) as resp, open(out_file, "wb") as f_out:
                                shutil.copyfileobj(resp, f_out)
                            jobs[job_id]["status"] = "done"
                            jobs[job_id]["file_path"] = str(out_file)
                            jobs[job_id]["filename"] = out_file.name
                            return
                    elif ig_type == 8:
                        carousel = ig_item.get("carousel_media", [])
                        downloaded_files = []
                        for idx, c in enumerate(carousel, start=1):
                            c_candidates = c.get("image_versions2", {}).get("candidates", [])
                            if c_candidates:
                                c_url = c_candidates[0]["url"]
                                plate_file = job_dir / f"{clean_user}_{ig_shortcode}_plate_{idx:02d}.jpg"
                                req_img = urllib.request.Request(c_url, headers={"User-Agent": "Mozilla/5.0"})
                                with urllib.request.urlopen(req_img, timeout=25) as resp, open(plate_file, "wb") as f_out:
                                    shutil.copyfileobj(resp, f_out)
                                downloaded_files.append(plate_file)

                        if downloaded_files:
                            if len(downloaded_files) == 1:
                                final_file = downloaded_files[0]
                            else:
                                zip_file = job_dir / f"{clean_user}_{ig_shortcode}_photos.zip"
                                with zipfile.ZipFile(zip_file, "w", zipfile.ZIP_DEFLATED) as zf:
                                    for df in downloaded_files:
                                        zf.write(df, arcname=df.name)
                                final_file = zip_file
                            jobs[job_id]["status"] = "done"
                            jobs[job_id]["file_path"] = str(final_file)
                            jobs[job_id]["filename"] = final_file.name
                            return
                except Exception as ex:
                    logger.warning(f"Direct IG photo download fallback to yt-dlp: {ex}")

    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": str(job_dir / "%(title).50s.%(ext)s"),
        "remote_components": ["ejs:github"],
        "merge_output_format": "mp4",
        "extractor_args": {
            "youtube": {
                "player_client": ["web_embedded", "tv", "mweb"],
            }
        },
    }
    deno_path = shutil.which("deno") or "/usr/local/bin/deno"
    if Path(deno_path).exists():
        ydl_opts["js_runtimes"] = {"deno": {"path": str(deno_path)}}

    if cp:
        ydl_opts["cookiefile"] = str(cp)

    aria2_path = shutil.which("aria2c")
    if aria2_path and ("youtube" in url.lower() or "youtu.be" in url.lower()):
        ydl_opts["downloader"] = {"default": "aria2c"}
        ydl_opts["downloader_args"] = {
            "aria2c": ["-s", "8", "-x", "8", "-k", "1M", "--min-split-size=1M"]
        }

    if media_type == "audio":
        preferred_codec = "mp3"
        bitrate = "320"
        if "opus" in quality.lower():
            preferred_codec = "opus"
            bitrate = "160"
        elif "m4a" in quality.lower():
            preferred_codec = "m4a"
            bitrate = "256"

        ydl_opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": preferred_codec,
                "preferredquality": bitrate,
            }],
        })
    elif media_type == "video":
        target_res = 1080
        q_lower = quality.lower()
        if "2160" in q_lower or "4k" in q_lower:
            target_res = 2160
        elif "1440" in q_lower or "2k" in q_lower:
            target_res = 1440
        elif "1080" in q_lower:
            target_res = 1080
        elif "720" in q_lower:
            target_res = 720
        elif "480" in q_lower:
            target_res = 480
        elif "360" in q_lower:
            target_res = 360

        ydl_opts.update({
            # Matches landscape (height<=target_res) and vertical (width<=target_res)
            "format": (
                f"bestvideo[height<={target_res}]+bestaudio/"
                f"bestvideo[width<={target_res}]+bestaudio/"
                f"bestvideo+bestaudio/"
                f"best"
            ),
        })
    else:  # image
        ydl_opts.update({
            "format": "best",
        })

    logger.info(f"Starting download for job {job_id} with ydl_opts: {ydl_opts}")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Locate downloaded file (exclude temporary or partial files)
        files = [f for f in job_dir.glob("*") if not f.name.endswith(".part") and not f.name.endswith(".ytdl")]
        if not files:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = "No media files found after download"
            return

        files.sort(key=lambda f: f.stat().st_size, reverse=True)
        final_file = files[0]
        jobs[job_id]["status"] = "done"
        jobs[job_id]["file_path"] = str(final_file)
        jobs[job_id]["filename"] = final_file.name
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Download failed for job {job_id}: {tb}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/v1/download")
@app.post("/v1/jobs")
async def start_download(
    payload: DownloadRequest,
    background_tasks: BackgroundTasks,
    authenticated: bool = Depends(verify_api_key),
):
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {
        "status": "queued",
        "created_at": time.time(),
        "file_path": None,
        "filename": None,
    }

    background_tasks.add_task(_run_download_task, job_id, payload.url, payload.type, payload.quality)
    return {"id": job_id, "job_id": job_id}


@app.get("/v1/jobs/{job_id}")
async def get_job_status(job_id: str, authenticated: bool = Depends(verify_api_key)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": job["status"], "error": job.get("error")}


@app.get("/v1/files/{job_id}")
@app.head("/v1/files/{job_id}")
async def get_job_file(job_id: str):
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="File not ready or job not found")

    file_path = job.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="Prepared file not found on disk")

    ext = Path(file_path).suffix.lower()
    media_type = "video/mp4" if ext == ".mp4" else ("video/webm" if ext == ".webm" else ("audio/mpeg" if ext == ".mp3" else "application/octet-stream"))
    return FileResponse(
        path=file_path,
        filename=job.get("filename", "download"),
        media_type=media_type,
    )


@app.post("/v1/recognize")
async def recognize_song(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    download: Optional[bool] = Form(False),
    authenticated: bool = Depends(verify_api_key),
):
    if not file and not url:
        raise HTTPException(status_code=400, detail="Provide either a file or a url")

    rec_dir = TMP_DIR / f"rec_{uuid.uuid4().hex[:8]}"
    rec_dir.mkdir(parents=True, exist_ok=True)
    audio_path = rec_dir / "sample.mp3"

    try:
        if file:
            content = await file.read()
            with open(audio_path, "wb") as f:
                f.write(content)
        elif url:
            # Download short 25s audio clip using yt-dlp in executor with Deno and cookies
            import yt_dlp

            rec_opts = {
                "quiet": True,
                "no_warnings": True,
                "outtmpl": str(rec_dir / "sample.%(ext)s"),
                "remote_components": ["ejs:github"],
                "extractor_args": {
                    "youtube": {
                        "player_client": ["web_embedded", "tv", "mweb"],
                    }
                },
                "format": "bestaudio/best",
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }],
                "postprocessor_args": {
                    "FFmpegExtractAudio": ["-t", "25"]
                },
            }
            deno_path = shutil.which("deno") or "/usr/local/bin/deno"
            if Path(deno_path).exists():
                rec_opts["js_runtimes"] = {"deno": {"path": str(deno_path)}}
            cookie_file = Path(os.getenv("COOKIES_FILE", "/opt/kiwiapi/cookies.txt"))
            if cookie_file.exists():
                rec_opts["cookiefile"] = str(cookie_file)

            loop = asyncio.get_running_loop()

            def _extract_sample():
                try:
                    with yt_dlp.YoutubeDL(rec_opts) as ydl:
                        ydl.download([url.strip()])
                except Exception as ex:
                    logger.warning(f"Recognize audio download warning: {ex}")

            await loop.run_in_executor(None, _extract_sample)

        if not audio_path.exists():
            candidates = list(rec_dir.glob("sample.*"))
            if candidates:
                audio_path = candidates[0]
            else:
                return {"found": False}

        from shazamio import Shazam

        shazam = Shazam()
        out = await shazam.recognize(str(audio_path))
        track = out.get("track")
        if not track:
            return {"found": False}

        artist = track.get("subtitle", "Unknown Artist")
        title = track.get("title", "Unknown Title")
        cover = track.get("images", {}).get("coverart", "")
        shazam_url = track.get("url", f"https://www.shazam.com/search?q={title} {artist}")

        result = {
            "found": True,
            "artist": artist,
            "title": title,
            "cover": cover,
            "shazam_url": shazam_url,
            "query": f"{artist} - {title}",
        }

        if download:
            job_id = uuid.uuid4().hex[:12]
            jobs[job_id] = {
                "status": "queued",
                "created_at": time.time(),
                "file_path": None,
                "filename": None,
            }
            yt_search_url = f"ytsearch1:{artist} {title}"
            background_tasks.add_task(_run_download_task, job_id, yt_search_url, "audio", "MP3 320 kbps")
            result["id"] = job_id
            result["job_id"] = job_id

        return result
    except Exception as e:
        return {"found": False, "error": str(e)}
    finally:
        # Cleanup sample folder in background
        shutil.rmtree(rec_dir, ignore_errors=True)


class AnimeRequest(BaseModel):
    url: str


@app.post("/v1/identify-anime")
@app.post("/api/identify-anime")
async def identify_anime_endpoint(
    request: Request,
    authenticated: bool = Depends(verify_api_key),
):
    """
    Identify Anime & Episode using fast frame extraction and trace.moe
    """
    url = ""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            url = body.get("url", "").strip()
        except Exception:
            pass
    else:
        form = await request.form()
        url = str(form.get("url", "")).strip()

    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="A valid video URL (http/https) is required for anime identification",
        )

    loop = asyncio.get_running_loop()

    # 1. Fast direct stream URL extraction (worst/best lowest bitrate for speed)
    def _get_stream_url(target_url: str) -> Optional[str]:
        import yt_dlp

        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "format": "worst[ext=mp4]/worst/best",
            "remote_components": ["ejs:github"],
            "extractor_args": {
                "youtube": {
                    "player_client": ["web_embedded", "tv", "mweb"],
                }
            },
        }
        cookie_file = Path(os.getenv("COOKIES_FILE", "/opt/kiwiapi/cookies.txt"))
        if not cookie_file.exists():
            cookie_file = Path("cookies.txt")
        if cookie_file.exists():
            ydl_opts["cookiefile"] = str(cookie_file)
        deno_path = shutil.which("deno") or "/usr/local/bin/deno"
        if Path(deno_path).exists():
            ydl_opts["js_runtimes"] = {"deno": {"path": str(deno_path)}}

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            if not info:
                return None
            stream = info.get("url")
            if not stream:
                for f in info.get("formats", []):
                    if f.get("url") and f.get("vcodec") != "none":
                        stream = f["url"]
                        break
            return stream

    try:
        stream_url = await loop.run_in_executor(None, _get_stream_url, url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not extract video stream: {str(e)}")

    if not stream_url:
        raise HTTPException(status_code=404, detail="No playable video stream found at this URL")

    # 2. Smart Frame Extraction via FFmpeg at 00:00:03 (fallback 00:00:01)
    temp_frame = TMP_DIR / f"anime_frame_{uuid.uuid4().hex[:12]}_{int(time.time() * 1000)}.jpg"

    def _extract_frame(stream: str, out_path: Path):
        cmd = [
            "ffmpeg",
            "-ss", "00:00:03",
            "-i", stream,
            "-vframes", "1",
            "-q:v", "2",
            "-y", str(out_path),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if not out_path.exists() or out_path.stat().st_size < 500:
            cmd_fallback = [
                "ffmpeg",
                "-ss", "00:00:01",
                "-i", stream,
                "-vframes", "1",
                "-q:v", "2",
                "-y", str(out_path),
            ]
            subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

    try:
        await loop.run_in_executor(None, _extract_frame, stream_url, temp_frame)
        if not temp_frame.exists() or temp_frame.stat().st_size < 500:
            raise HTTPException(status_code=500, detail="Failed to capture scene frame from video")

        # 3. Query trace.moe API with cutBorders and anilistInfo
        def _query_trace_moe(frame_file: Path):
            import requests

            with open(frame_file, "rb") as f:
                res = requests.post(
                    "https://api.trace.moe/search?anilistInfo&cutBorders",
                    files={"image": ("frame.jpg", f, "image/jpeg")},
                    timeout=15,
                )
            return res

        res = await loop.run_in_executor(None, _query_trace_moe, temp_frame)
        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Anime recognition service responded with error: {res.text}",
            )

        data = res.json()
        results = data.get("result", [])
        if not results:
            return {
                "found": False,
                "message": "No matching anime scene identified in this video clip.",
            }

        top = results[0]
        similarity_raw = top.get("similarity", 0)
        similarity = round(similarity_raw * 100, 1)

        anilist = top.get("anilist") or {}
        title_obj = anilist.get("title", {}) if isinstance(anilist, dict) else {}

        # English title fallback to Romaji title
        title = (
            title_obj.get("english")
            or title_obj.get("romaji")
            or title_obj.get("native")
            or "Unknown Anime"
        )
        romaji_title = title_obj.get("romaji") or ""
        native_title = title_obj.get("native") or ""

        ep_raw = top.get("episode")
        episode = f"Episode {ep_raw}" if ep_raw is not None else "Movie / Special / OVA"

        from_sec = top.get("from", 0)
        to_sec = top.get("to", 0)
        m, s = divmod(int(from_sec), 60)
        timestamp = f"{m:02d}:{s:02d}"

        preview_video = top.get("video") or ""
        preview_image = top.get("image") or ""
        is_adult = bool(anilist.get("isAdult", False))

        return {
            "found": True,
            "title": title,
            "romajiTitle": romaji_title,
            "nativeTitle": native_title,
            "episode": episode,
            "timestamp": timestamp,
            "fromSeconds": from_sec,
            "toSeconds": to_sec,
            "similarity": similarity,
            "previewVideo": preview_video,
            "previewImage": preview_image,
            "isAdult": is_adult,
            "confidenceWarning": similarity < 85.0,
        }
    finally:
        try:
            if temp_frame.exists():
                temp_frame.unlink()
        except Exception:
            pass

