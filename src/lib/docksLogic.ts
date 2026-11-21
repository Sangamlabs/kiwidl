export type TabId = 'video' | 'audio' | 'post' | 'song';
export type PlatformId = 'youtube' | 'instagram' | 'pinterest';
export type Phase = 'idle' | 'fetching' | 'ready' | 'working' | 'done' | 'error';

export const ASSETS = {
  P: 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_',
  SHIP:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261031_024714_39df675e-5060-4528-87dc-9d0c274815aa.png&w=1600&q=90',
  CAPT:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261031_024703_a0298b6a-0117-47f1-8462-4be671d0407e.png&w=2048&q=90',
  CHEST_BOX: [1475, 830, 446, 392] as const,
  SHEET_W: 2048,
  SHEET_H: 1360,
  SHIP_ASPECT: 2002 / 1961,
} as const;

export const COPY = {
  emptyLink: 'Paste a link first.',
  unsupportedLink:
    'This link is not supported. Use a YouTube, Instagram or Pinterest link.',
  fetching: 'Reading the link',
  working: 'Preparing your file',
  done: 'Saved. Tap the chest to download again.',
  demoReady: 'Demo mode: sample data',
  emptyTab: 'Nothing to download in this tab for this link. Try another tab.',
  rateLimit: 'Too many requests. Wait a minute and try again.',
  badKey: 'This site is not authorised to use the API.',
  failedJob: 'The file could not be prepared. Check the link and try again.',
  network: 'Cannot reach the server. Check your connection.',
  clipboardDenied: 'Clipboard unavailable. Paste the link into the field.',
  noMatchTitle: 'No match',
  noMatchBody: 'Try a longer clip with clear music and less talking.',
} as const;

export interface WaveLayer {
  dy: number;
  a: number;
  k: number;
  v: number;
  ph: number;
  fill?: string;
  span?: readonly [number, number];
}

export const BACK_WAVES: readonly WaveLayer[] = [
  { dy: -34, a: 14, k: 1.9, v: 1.15, ph: 1.7, fill: 'var(--band)' },
];

export const FRONT_WAVES: readonly WaveLayer[] = [
  { dy: 0, a: 17, k: 1.7, v: 1.3, ph: 3.1, fill: 'var(--band2)' },
  { dy: 22, a: 12, k: 2.4, v: 1, ph: 4.4, span: [0.06, 0.44] },
  { dy: 46, a: 15, k: 1.45, v: 1.4, ph: 0.6, fill: 'var(--paper)' },
];

export const PALM_CURVES: readonly (readonly [number, number, number, number, number])[] = [
  [-10, 26, 38, -8, 8],
  [-8, 46, 58, -2, 5],
  [-10, 62, 74, 6, 4],
  [14, 78, 96, 16, 4],
  [40, 82, 118, 22, 3],
  [78, 80, 140, 34, 5],
  [-12, 74, 22, 56, 6],
];

export function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function seg(p: number, a: number, b: number): number {
  if (b === a) return p >= b ? 1 : 0;
  return clamp((p - a) / (b - a), 0, 1);
}

export function out(k: number): number {
  const c = clamp(k, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

export function back(k: number): number {
  const c = clamp(k, 0, 1);
  return 1 + 2.4 * Math.pow(c - 1, 3) + 1.4 * Math.pow(c - 1, 2);
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function yAt(layer: WaveLayer, x: number, t: number, Hb: number): number {
  const y0 = Hb * 0.5;
  const s = Hb / 190;
  const a = layer.a * s;
  const f = ((2 * Math.PI) / 1100) * layer.k;
  return (
    y0 +
    layer.dy * s +
    a * Math.sin(f * x + t * layer.v + layer.ph) +
    a * 0.45 * Math.sin(f * 2.3 * x - t * layer.v * 0.7 + layer.ph * 1.7)
  );
}

export function buildWavePath(
  layer: WaveLayer,
  W: number,
  Hb: number,
  t: number,
  step = 22
): string {
  if (W <= 0 || Hb <= 0) return '';
  const x0 = layer.span ? W * layer.span[0] : -10;
  const x1 = layer.span ? W * layer.span[1] : W + 10;
  const pts: string[] = [];

  for (let x = x0; x < x1; x += step) {
    const y = yAt(layer, x, t, Hb);
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const yEnd = yAt(layer, x1, t, Hb);
  pts.push(`${pts.length === 0 ? 'M' : 'L'}${x1.toFixed(1)} ${yEnd.toFixed(1)}`);

  if (layer.fill) {
    const bottom = Hb + 20;
    pts.push(`L${x1.toFixed(1)} ${bottom.toFixed(1)}`);
    pts.push(`L${x0.toFixed(1)} ${bottom.toFixed(1)}`);
    pts.push('Z');
  }

  return pts.join(' ');
}

export function getShipTarget(
  phase: Phase,
  phaseElapsedSec: number,
  currentShipP: number
): number {
  const s = Math.max(0, phaseElapsedSec);
  switch (phase) {
    case 'idle':
      return 0;
    case 'fetching':
      return 0.28 * (1 - Math.exp(-s / 1.4));
    case 'ready':
      return 0.28;
    case 'working':
      return 0.28 + 0.62 * (1 - Math.exp(-s / 7));
    case 'done':
      return 1;
    case 'error':
      return currentShipP;
  }
}

export function getChestCropMetrics(width: number) {
  const [x, y, w, h] = ASSETS.CHEST_BOX;
  return {
    width,
    height: (width * h) / w,
    bgSizeX: (ASSETS.SHEET_W / w) * 100,
    bgSizeY: (ASSETS.SHEET_H / h) * 100,
    bgPosX: (x / (ASSETS.SHEET_W - w)) * 100,
    bgPosY: (y / (ASSETS.SHEET_H - h)) * 100,
  };
}

export function getShipDimensions(
  viewportWidth: number,
  bandHeight = 190
): { sw: number; sh: number } {
  const maxByBand = bandHeight > 0 ? bandHeight * 0.85 : 190;
  if (viewportWidth <= 760) {
    const sw = Math.min(110, maxByBand);
    return { sw, sh: sw * ASSETS.SHIP_ASPECT };
  }
  const sw = Math.min(clamp(viewportWidth * 0.14, 110, 190), maxByBand);
  return { sw, sh: sw * ASSETS.SHIP_ASPECT };
}

export function detectPlatform(rawInput: string): PlatformId | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let host = '';
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) {
    return 'youtube';
  }
  if (/(^|\.)instagram\.com$/.test(host)) {
    return 'instagram';
  }
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || /(^|\.)pin\.it$/.test(host)) {
    return 'pinterest';
  }
  return null;
}

export function mapHttpErrorToMessage(status: number | null): string {
  if (status === 401) return COPY.badKey;
  if (status === 429) return COPY.rateLimit;
  if (status === null) return COPY.network;
  return COPY.failedJob;
}
