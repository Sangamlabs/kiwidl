import asyncio
import os
import shutil
import subprocess
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

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

app = FastAPI(
    title="KiwiAPI",
    version="1.0.0",
    description="High-performance media metadata, downloader and recognition API.",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if DEV_MODE else ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory Rate Limiting for WEB_KEY (e.g. 60 requests per minute per IP)
ip_request_timestamps: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX = 60

# In-memory Job Store
jobs: Dict[str, dict] = {}


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

    import yt_dlp

    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }

    loop = asyncio.get_running_loop()

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await loop.run_in_executor(None, _extract)
    except Exception as e:
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

    # Check for formats
    formats = info.get("formats", [])
    seen_heights = set()
    for f in formats:
        h = f.get("height")
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        if h and h >= 360 and vcodec != "none" and h not in seen_heights:
            seen_heights.add(h)
            filesize = f.get("filesize") or f.get("filesize_approx")
            size_str = f"{round(filesize / (1024 * 1024), 1)} MB" if filesize else "Direct MP4"
            video_options.append({"label": f"{h}p MP4", "size": size_str})

    if not video_options:
        video_options = [
            {"label": "1080p MP4", "size": "Standard"},
            {"label": "720p MP4", "size": "Fast"},
            {"label": "480p MP4", "size": "Compact"},
        ]
    else:
        video_options.sort(key=lambda x: int(x["label"].split("p")[0]) if "p" in x["label"] else 0, reverse=True)

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
        "video": video_options[:4],
        "audio": audio_options,
        "images": image_options[:12],
    }


def _run_download_task(job_id: str, url: str, media_type: str, quality: str):
    job_dir = TMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    jobs[job_id]["status"] = "running"

    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": str(job_dir / "%(title).50s.%(ext)s"),
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
        target_height = "1080"
        if "720" in quality:
            target_height = "720"
        elif "480" in quality:
            target_height = "480"

        ydl_opts.update({
            "format": f"bestvideo[height<={target_height}]+bestaudio/best[height<={target_height}]/best",
            "merge_output_format": "mp4",
        })
    else:  # image
        ydl_opts.update({
            "format": "best",
        })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Locate downloaded file
        files = list(job_dir.glob("*"))
        if not files:
            jobs[job_id]["status"] = "failed"
            return

        final_file = files[0]
        jobs[job_id]["status"] = "done"
        jobs[job_id]["file_path"] = str(final_file)
        jobs[job_id]["filename"] = final_file.name
    except Exception as e:
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
    return {"status": job["status"]}


@app.get("/v1/files/{job_id}")
@app.head("/v1/files/{job_id}")
async def get_job_file(job_id: str):
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="File not ready or job not found")

    file_path = job.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="Prepared file not found on disk")

    return FileResponse(
        path=file_path,
        filename=job.get("filename", "download"),
        media_type="application/octet-stream",
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
            # Download short 15s audio clip
            cmd = [
                "yt-dlp",
                "--quiet",
                "--no-warnings",
                "--extract-audio",
                "--audio-format", "mp3",
                "--postprocessor-args", "ffmpeg:-t 15",
                "-o", str(rec_dir / "sample.%(ext)s"),
                url.strip(),
            ]
            proc = await asyncio.create_subprocess_exec(*cmd)
            await proc.communicate()

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
