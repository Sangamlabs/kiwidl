import React, { useState } from 'react';
import { CloseIcon } from './Icons';

interface ApiDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DocTab = 'quickstart' | 'telegram' | 'web' | 'curl' | 'endpoints';

const PYTHON_BOT_CODE = `import aiohttp
import asyncio

class KiwiDownloader:
    def __init__(self, api_key: str, base_url: str = "https://api.kiwiapi.net"):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "KiwiBot/1.0"
        }

    async def get_info(self, url: str) -> dict:
        """Fetch title, author, thumbnail, and format options"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.base_url}/v1/info", json={"url": url}, headers=self.headers) as resp:
                if resp.status != 200:
                    raise Exception(f"Info error: {await resp.text()}")
                return await resp.json()

    async def download_media(self, url: str, media_type: str = "video", quality: str = "720p") -> str:
        """Starts background download and polls until MP4/MP3 is ready"""
        async with aiohttp.ClientSession() as session:
            # Step 1: Start Job
            payload = {"url": url, "type": media_type, "quality": quality}
            async with session.post(f"{self.base_url}/v1/download", json=payload, headers=self.headers) as resp:
                data = await resp.json()
                job_id = data.get("job_id") or data.get("id")

            # Step 2: Poll status
            for _ in range(30):
                await asyncio.sleep(2)
                async with session.get(f"{self.base_url}/v1/jobs/{job_id}", headers=self.headers) as status_resp:
                    job = await status_resp.json()
                    status = job.get("status")
                    if status == "done":
                        # Returns direct download link
                        return f"{self.base_url}/v1/files/{job_id}"
                    elif status == "failed":
                        raise Exception(job.get("error", "Download failed"))

            raise TimeoutError("Download timed out on server")

# Usage in Telegram Bot (aiogram or python-telegram-bot):
# kiwi = KiwiDownloader("YOUR_API_KEY")
# video_url = await kiwi.download_media("https://www.instagram.com/reel/...")
# await message.reply_video(video=video_url)`;

const JS_WEB_CODE = `const KIWI_API = "https://api.kiwiapi.net";
const API_KEY = "YOUR_API_KEY";

// 1. Fetch info and available formats
async function getMediaInfo(url) {
  const res = await fetch(\`\${KIWI_API}/v1/info\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("Failed to fetch info");
  return await res.json();
}

// 2. Start Download and Poll
async function downloadFile(url, type = "video", quality = "720p") {
  // Step 1: Queue job
  const startRes = await fetch(\`\${KIWI_API}/v1/download\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ url, type, quality }),
  });
  const { job_id } = await startRes.json();

  // Step 2: Poll every 2s
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(\`\${KIWI_API}/v1/jobs/\${job_id}\`, {
      headers: { "X-API-Key": API_KEY },
    });
    const data = await poll.json();
    if (data.status === "done") {
      // Trigger download
      window.location.href = \`\${KIWI_API}/v1/files/\${job_id}\`;
      return;
    } else if (data.status === "failed") {
      throw new Error(data.error || "Download failed");
    }
  }
}`;

const CURL_CODE = `# 1. Fetch Media Info (Title, Thumbnail, Formats)
curl -X POST https://api.kiwiapi.net/v1/info \\
     -H "X-API-Key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"url": "https://www.instagram.com/reel/DgAaOG-PGSH/"}'

# 2. Queue Download Job (type: "video" | "audio", quality: "720p" | "1080p")
curl -X POST https://api.kiwiapi.net/v1/download \\
     -H "X-API-Key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"url": "https://www.instagram.com/reel/DgAaOG-PGSH/", "type": "video", "quality": "720p"}'
# Returns: {"id": "job_123", "job_id": "job_123"}

# 3. Poll Job Status
curl -X GET https://api.kiwiapi.net/v1/jobs/job_123 \\
     -H "X-API-Key: YOUR_API_KEY"
# Returns: {"status": "done", "error": null}

# 4. Download Final File
curl -O -J https://api.kiwiapi.net/v1/files/job_123`;

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<DocTab>('quickstart');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="docs-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="docs-title"
    >
      <div className="docs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="docs-header">
          <div className="docs-header-left">
            <span className="docs-badge">API v1.0</span>
            <h2 id="docs-title" className="docs-title">
              KiwiAPI Integration Docs
            </h2>
          </div>
          <div className="docs-header-actions">
            <a
              href="https://api.kiwiapi.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="pill docs-swagger-btn"
              title="Open Interactive Swagger UI"
            >
              Swagger /docs ↗
            </a>
            <button
              type="button"
              className="docs-close-btn"
              onClick={onClose}
              aria-label="Close API Documentation"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="docs-tabs" role="tablist">
          <button
            type="button"
            className={`docs-tab ${activeTab === 'quickstart' ? 'active' : ''}`}
            onClick={() => setActiveTab('quickstart')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`docs-tab ${activeTab === 'telegram' ? 'active' : ''}`}
            onClick={() => setActiveTab('telegram')}
          >
            Telegram Bot (Python)
          </button>
          <button
            type="button"
            className={`docs-tab ${activeTab === 'web' ? 'active' : ''}`}
            onClick={() => setActiveTab('web')}
          >
            Website / App (JS)
          </button>
          <button
            type="button"
            className={`docs-tab ${activeTab === 'curl' ? 'active' : ''}`}
            onClick={() => setActiveTab('curl')}
          >
            cURL / HTTP
          </button>
          <button
            type="button"
            className={`docs-tab ${activeTab === 'endpoints' ? 'active' : ''}`}
            onClick={() => setActiveTab('endpoints')}
          >
            Endpoints Table
          </button>
        </div>

        {/* Content Body */}
        <div className="docs-body">
          {activeTab === 'quickstart' && (
            <div className="docs-section">
              <h3>Fast, Asynchronous Media Extraction</h3>
              <p>
                KiwiAPI allows any bot, web app, or mobile app to fetch metadata and download
                media from <strong>YouTube, Instagram, TikTok, Pinterest, X/Twitter, and Facebook</strong>.
              </p>

              <div className="docs-callout">
                <strong>Base URL:</strong> <code>https://api.kiwiapi.net</code>
                <br />
                <strong>Auth Header:</strong> <code>X-API-Key: YOUR_API_KEY</code>
              </div>

              <h4>3-Step Asynchronous Flow</h4>
              <ol className="docs-steps">
                <li>
                  <strong>Step 1 (POST /v1/info):</strong> Query media details (title, thumbnail, available resolutions like 1080p, 720p, audio).
                </li>
                <li>
                  <strong>Step 2 (POST /v1/download):</strong> Enqueue background download task. Receives a <code>job_id</code> instantly without blocking.
                </li>
                <li>
                  <strong>Step 3 (GET /v1/jobs/&#123;job_id&#125;):</strong> Poll status until <code>"done"</code>, then download the finished file from <code>/v1/files/&#123;job_id&#125;</code>.
                </li>
              </ol>

              <div className="docs-actions-row">
                <button
                  type="button"
                  className="pill solid"
                  onClick={() => setActiveTab('telegram')}
                >
                  View Telegram Bot Code →
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setActiveTab('web')}
                >
                  View Website Code →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'telegram' && (
            <div className="docs-section">
              <div className="code-header">
                <span>Python Asyncio (Aiogram / python-telegram-bot)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(PYTHON_BOT_CODE)}
                >
                  {copied ? '✓ Copied' : 'Copy Code'}
                </button>
              </div>
              <pre className="code-block">
                <code>{PYTHON_BOT_CODE}</code>
              </pre>
            </div>
          )}

          {activeTab === 'web' && (
            <div className="docs-section">
              <div className="code-header">
                <span>JavaScript / TypeScript (Fetch API)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(JS_WEB_CODE)}
                >
                  {copied ? '✓ Copied' : 'Copy Code'}
                </button>
              </div>
              <pre className="code-block">
                <code>{JS_WEB_CODE}</code>
              </pre>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="docs-section">
              <div className="code-header">
                <span>cURL Terminal Commands</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(CURL_CODE)}
                >
                  {copied ? '✓ Copied' : 'Copy Code'}
                </button>
              </div>
              <pre className="code-block">
                <code>{CURL_CODE}</code>
              </pre>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div className="docs-section">
              <h3>All API Endpoints</h3>
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Description</th>
                    <th>Payload / Query</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>GET</code></td>
                    <td><code>/health</code></td>
                    <td>Health status check</td>
                    <td>None</td>
                  </tr>
                  <tr>
                    <td><code>POST</code></td>
                    <td><code>/v1/info</code></td>
                    <td>Get video/audio metadata</td>
                    <td><code>&#123; "url": "..." &#125;</code></td>
                  </tr>
                  <tr>
                    <td><code>POST</code></td>
                    <td><code>/v1/download</code></td>
                    <td>Start download background job</td>
                    <td><code>&#123; "url": "...", "type": "video", "quality": "720p" &#125;</code></td>
                  </tr>
                  <tr>
                    <td><code>GET</code></td>
                    <td><code>/v1/jobs/&#123;job_id&#125;</code></td>
                    <td>Poll job progress</td>
                    <td>Job ID in path</td>
                  </tr>
                  <tr>
                    <td><code>GET</code></td>
                    <td><code>/v1/files/&#123;job_id&#125;</code></td>
                    <td>Stream completed MP4/MP3 file</td>
                    <td>Job ID in path</td>
                  </tr>
                  <tr>
                    <td><code>POST</code></td>
                    <td><code>/v1/recognize</code></td>
                    <td>Identify music & song (Shazam)</td>
                    <td><code>url</code> or <code>file</code> form-data</td>
                  </tr>
                  <tr>
                    <td><code>POST</code></td>
                    <td><code>/v1/identify-anime</code></td>
                    <td>Anime & Episode finder (Trace.moe)</td>
                    <td><code>&#123; "url": "..." &#125;</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
