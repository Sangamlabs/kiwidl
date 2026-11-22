import {
  COPY,
  PlatformId,
  detectPlatform,
  mapHttpErrorToMessage,
} from './docksLogic';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || '';
export const API_KEY: string = (import.meta.env.VITE_API_KEY as string | undefined) || '';

export interface MediaOption {
  label: string;
  size: string;
}

export interface ImageOption {
  label: string;
  size: string;
  url: string;
}

export interface MediaInfo {
  title: string;
  author: string;
  duration: string;
  thumbnail: string;
  platform: PlatformId | null;
  video: MediaOption[];
  audio: MediaOption[];
  images: ImageOption[];
}

export interface SongResult {
  found: boolean;
  artist?: string;
  title?: string;
  cover?: string;
  shazam_url?: string;
  query?: string;
}

export interface AnimeResult {
  found: boolean;
  title?: string;
  romajiTitle?: string;
  nativeTitle?: string;
  episode?: string;
  timestamp?: string;
  fromSeconds?: number;
  toSeconds?: number;
  similarity?: number;
  previewVideo?: string;
  previewImage?: string;
  isAdult?: boolean;
  confidenceWarning?: boolean;
  message?: string;
}

export interface DownloadResult {
  downloadUrl: string;
  filename: string;
  isDemoBlob?: boolean;
  demoContent?: string;
}

export class DocksApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'DocksApiError';
    this.status = status;
  }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

const DEMO_ART = {
  ytThumb: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 192">
      <rect width="340" height="192" fill="#dcd7c7"/>
      <path d="M0 138 Q55 122 110 138 T220 138 T340 132 L340 192 L0 192 Z" fill="#d7d2c2" stroke="#16130e" stroke-width="3"/>
      <path d="M126 124 L170 42 L204 124 Z" fill="#ece7d8" stroke="#16130e" stroke-width="3" stroke-linejoin="round"/>
      <path d="M170 42 L170 124 M110 126 Q170 144 232 126 L218 148 Q170 158 122 148 Z" fill="#201c15" stroke="#16130e" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="268" cy="52" r="20" fill="none" stroke="#16130e" stroke-width="3"/>
      <path d="M24 162 Q90 148 164 162 T318 158" fill="none" stroke="#16130e" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `),
  igThumb: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 192">
      <rect width="340" height="192" fill="#dcd7c7"/>
      <rect x="112" y="28" width="116" height="136" rx="14" fill="#ece7d8" stroke="#16130e" stroke-width="3"/>
      <circle cx="170" cy="86" r="28" fill="#d7d2c2" stroke="#16130e" stroke-width="3"/>
      <path d="M132 138 Q170 120 208 138" fill="none" stroke="#16130e" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 96 L82 96 M258 96 L310 96" stroke="#16130e" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 8"/>
    </svg>
  `),
  post1: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#dcd7c7"/>
      <circle cx="120" cy="96" r="46" fill="#ece7d8" stroke="#16130e" stroke-width="3.5"/>
      <path d="M120 34 V56 M120 136 V158 M58 96 H80 M160 96 H182" stroke="#16130e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M120 68 L132 96 L120 124 L108 96 Z" fill="#201c15"/>
      <path d="M16 186 Q68 166 120 186 T224 186" fill="none" stroke="#16130e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M36 206 Q92 192 148 206 T210 202" fill="none" stroke="#16130e" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `),
  post2: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#d7d2c2"/>
      <path d="M52 178 L112 58 L156 178 Z" fill="#ece7d8" stroke="#16130e" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M128 178 L166 96 L196 178 Z" fill="#dcd7c7" stroke="#16130e" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M22 178 H218" stroke="#16130e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M48 200 Q120 186 192 200" fill="none" stroke="#16130e" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `),
  post3: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#ece7d8"/>
      <path d="M120 44 V186" stroke="#16130e" stroke-width="4" stroke-linecap="round"/>
      <circle cx="120" cy="54" r="12" fill="none" stroke="#16130e" stroke-width="3.5"/>
      <path d="M84 94 H156" stroke="#16130e" stroke-width="4" stroke-linecap="round"/>
      <path d="M64 146 C64 176 92 194 120 194 C148 194 176 176 176 146" fill="none" stroke="#16130e" stroke-width="4" stroke-linecap="round"/>
      <path d="M56 154 L64 142 L74 152 M166 152 L176 142 L184 154" fill="none" stroke="#16130e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `),
  post4: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#dcd7c7"/>
      <rect x="44" y="44" width="152" height="152" rx="18" fill="#ece7d8" stroke="#16130e" stroke-width="3.5"/>
      <path d="M68 152 L102 108 L130 138 L156 96 L176 152 Z" fill="#d7d2c2" stroke="#16130e" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="88" cy="84" r="12" fill="#201c15"/>
    </svg>
  `),
  songCover: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#dcd7c7"/>
      <circle cx="120" cy="120" r="82" fill="#201c15" stroke="#16130e" stroke-width="4"/>
      <circle cx="120" cy="120" r="56" fill="none" stroke="#e6e0cf" stroke-width="2" stroke-dasharray="14 8"/>
      <circle cx="120" cy="120" r="30" fill="#ece7d8" stroke="#16130e" stroke-width="3.5"/>
      <circle cx="120" cy="120" r="7" fill="#16130e"/>
    </svg>
  `),
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  } else {
    headers['X-API-Key'] = '';
  }
  return headers;
}

export function isDemoMode(): boolean {
  return API_BASE.trim() === '';
}

export async function fetchLinkInfo(
  url: string,
  signal?: AbortSignal
): Promise<MediaInfo> {
  const platform = detectPlatform(url);

  if (isDemoMode()) {
    await sleep(700, signal);

    if (platform === 'instagram') {
      return {
        title: 'Harbour Tide Charts — Morning Sketchbook Plates',
        author: '@saltwake.press',
        duration: '0:42',
        thumbnail: DEMO_ART.igThumb,
        platform,
        video: [
          { label: '1080p MP4', size: '18.4 MB' },
          { label: '720p MP4', size: '9.6 MB' },
        ],
        audio: [
          { label: 'MP3 320 kbps', size: '2.1 MB' },
          { label: 'M4A 128 kbps', size: '0.9 MB' },
        ],
        images: [
          { label: 'Plate 01 — Compass', size: '2.4 MB', url: DEMO_ART.post1 },
          { label: 'Plate 02 — Reefs', size: '2.1 MB', url: DEMO_ART.post2 },
          { label: 'Plate 03 — Anchor', size: '1.8 MB', url: DEMO_ART.post3 },
          { label: 'Plate 04 — Horizon', size: '2.6 MB', url: DEMO_ART.post4 },
        ],
      };
    }

    if (platform === 'pinterest') {
      return {
        title: 'Woodcut Nautical Broadsides & Ink Wave Studies',
        author: 'Maritime Archive',
        duration: '3 plates',
        thumbnail: DEMO_ART.post1,
        platform,
        video: [],
        audio: [],
        images: [
          { label: 'Original JPG', size: '3.2 MB', url: DEMO_ART.post1 },
          { label: 'Plate II JPG', size: '2.7 MB', url: DEMO_ART.post2 },
          { label: 'Plate III JPG', size: '2.4 MB', url: DEMO_ART.post3 },
        ],
      };
    }

    return {
      title: 'Rigging the Brigantine — Full Deck Walkthrough & Shanty Session',
      author: 'North Quay Chronicles',
      duration: '08:14',
      thumbnail: DEMO_ART.ytThumb,
      platform: platform ?? 'youtube',
      video: [
        { label: '1080p MP4', size: '84.2 MB' },
        { label: '720p MP4', size: '41.6 MB' },
        { label: '480p MP4', size: '22.9 MB' },
      ],
      audio: [
        { label: 'MP3 320 kbps', size: '18.9 MB' },
        { label: 'M4A 256 kbps', size: '14.7 MB' },
        { label: 'OPUS 160 kbps', size: '9.4 MB' },
      ],
      images: [],
    };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/info`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new DocksApiError(COPY.network, null);
  }

  if (!res.ok) {
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        const detailStr = String(errJson.detail).toLowerCase();
        if (detailStr.includes('login page') || detailStr.includes('rate-limit') || detailStr.includes('redirected to the login')) {
          throw new DocksApiError('Instagram is currently restricting anonymous access. Try another link or try again shortly.', res.status);
        }
      }
    } catch (e) {
      if (e instanceof DocksApiError) throw e;
    }
    throw new DocksApiError(mapHttpErrorToMessage(res.status), res.status);
  }

  const data = (await res.json()) as Partial<MediaInfo>;
  return {
    title: data.title || 'Untitled media',
    author: data.author || 'Unknown',
    duration: data.duration || '',
    thumbnail: data.thumbnail || '',
    platform,
    video: Array.isArray(data.video) ? data.video : [],
    audio: Array.isArray(data.audio) ? data.audio : [],
    images: Array.isArray(data.images) ? data.images : [],
  };
}

export async function recognizeSong(
  payload: { url?: string; file?: File },
  signal?: AbortSignal
): Promise<SongResult> {
  if (isDemoMode()) {
    await sleep(700, signal);
    const probe = `${payload.url || ''} ${payload.file?.name || ''}`.toLowerCase();
    if (probe.includes('nomatch') || probe.includes('silence') || probe.includes('speech')) {
      return { found: false };
    }
    return {
      found: true,
      artist: 'The Saltwake Crew',
      title: 'Low Tide at Kingston Quay',
      cover: DEMO_ART.songCover,
      shazam_url: 'https://www.shazam.com/search?q=Low%20Tide%20at%20Kingston%20Quay',
      query: 'The Saltwake Crew - Low Tide at Kingston Quay',
    };
  }

  const form = new FormData();
  if (payload.file) {
    form.append('file', payload.file);
  } else if (payload.url) {
    form.append('url', payload.url);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/recognize`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new DocksApiError(COPY.network, null);
  }

  if (!res.ok) {
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        const detailStr = String(errJson.detail).toLowerCase();
        if (detailStr.includes('login page') || detailStr.includes('rate-limit') || detailStr.includes('redirected to the login')) {
          throw new DocksApiError('Instagram is currently restricting anonymous access. Try another link or try again shortly.', res.status);
        }
      }
    } catch (e) {
      if (e instanceof DocksApiError) throw e;
    }
    throw new DocksApiError(mapHttpErrorToMessage(res.status), res.status);
  }

  const data = (await res.json()) as SongResult;
  return data;
}

export async function identifyAnime(
  url: string,
  signal?: AbortSignal
): Promise<AnimeResult> {
  if (isDemoMode()) {
    await sleep(2500, signal);
    return {
      found: true,
      title: 'Jujutsu Kaisen Season 2',
      romajiTitle: 'Jujutsu Kaisen 2nd Season',
      nativeTitle: '呪術廻戦',
      episode: 'Episode 17',
      timestamp: '14:28',
      similarity: 96.4,
      previewVideo: 'https://api.trace.moe/video/demo',
      previewImage: 'https://api.trace.moe/image/demo',
      isAdult: false,
      confidenceWarning: false,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/identify-anime`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: url.trim() }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new DocksApiError(COPY.network, null);
  }

  if (!res.ok) {
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        const detailStr = String(errJson.detail).toLowerCase();
        if (detailStr.includes('login page') || detailStr.includes('rate-limit') || detailStr.includes('redirected to the login')) {
          throw new DocksApiError('Instagram is currently restricting anonymous access. Try another link or try again shortly.', res.status);
        }
      }
    } catch (e) {
      if (e instanceof DocksApiError) throw e;
    }
    throw new DocksApiError(mapHttpErrorToMessage(res.status), res.status);
  }

  return (await res.json()) as AnimeResult;
}

async function pollJob(jobId: string, signal?: AbortSignal): Promise<string> {
  while (true) {
    await sleep(1200, signal);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: authHeaders(),
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new DocksApiError(COPY.network, null);
    }

    if (!res.ok) {
      throw new DocksApiError(mapHttpErrorToMessage(res.status), res.status);
    }

    const job = (await res.json()) as { status: string };
    if (job.status === 'done') {
      return `${API_BASE}/v1/files/${encodeURIComponent(jobId)}`;
    }
    if (job.status === 'failed') {
      throw new DocksApiError(COPY.failedJob, 500);
    }
  }
}

export async function runDownloadJob(
  params: {
    url: string;
    type: 'video' | 'audio' | 'image';
    quality: string;
    file?: File | null;
    songDownload?: boolean;
  },
  signal?: AbortSignal
): Promise<DownloadResult> {
  if (isDemoMode()) {
    await sleep(4000, signal);
    const safeName = params.quality.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ext = params.type === 'audio' ? 'txt' : params.type === 'image' ? 'svg' : 'txt';
    const demoContent =
      params.type === 'image'
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#e6e0cf"/><text x="20" y="125" font-family="serif" font-size="18" fill="#201c15">Saltwake Docks Demo — ${params.quality}</text></svg>`
        : `Saltwake Docks Demo File\nSource: ${params.url || params.file?.name || 'Uploaded clip'}\nFormat: ${params.quality}\n`;

    return {
      downloadUrl: '',
      filename: `saltwake-${safeName || 'file'}.${ext}`,
      isDemoBlob: true,
      demoContent,
    };
  }

  let res: Response;
  try {
    if (params.songDownload) {
      const form = new FormData();
      if (params.file) form.append('file', params.file);
      else if (params.url) form.append('url', params.url);
      form.append('download', 'true');
      res = await fetch(`${API_BASE}/v1/recognize`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
        signal,
      });
    } else {
      res = await fetch(`${API_BASE}/v1/download`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          url: params.url,
          type: params.type,
          quality: params.quality,
        }),
        signal,
      });
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new DocksApiError(COPY.network, null);
  }

  if (!res.ok) {
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        const detailStr = String(errJson.detail).toLowerCase();
        if (detailStr.includes('login page') || detailStr.includes('rate-limit') || detailStr.includes('redirected to the login')) {
          throw new DocksApiError('Instagram is currently restricting anonymous access. Try another link or try again shortly.', res.status);
        }
      }
    } catch (e) {
      if (e instanceof DocksApiError) throw e;
    }
    throw new DocksApiError(mapHttpErrorToMessage(res.status), res.status);
  }

  const data = (await res.json()) as { id?: string; job_id?: string };
  const jobId = data.id || data.job_id;
  if (!jobId) {
    throw new DocksApiError(COPY.failedJob, 500);
  }

  const fileUrl = await pollJob(jobId, signal);
  return {
    downloadUrl: fileUrl,
    filename: `saltwake-${jobId}`,
  };
}

export function triggerFileDownload(result: DownloadResult): void {
  if (result.isDemoBlob) {
    const mime = result.filename.endsWith('.svg') ? 'image/svg+xml' : 'text/plain;charset=utf-8';
    const blob = new Blob([result.demoContent || ''], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = result.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return;
  }

  if (result.downloadUrl) {
    window.location.href = result.downloadUrl;
  }
}
