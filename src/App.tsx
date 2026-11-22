import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnchorIcon,
  ArrowRightIcon,
  CloseIcon,
  InstagramIcon,
  PinterestIcon,
  YouTubeIcon,
} from './components/Icons';
import { ResultCard } from './components/ResultCard';
import { SeaBand } from './components/SeaBand';
import {
  AnimeResult,
  DocksApiError,
  DownloadResult,
  MediaInfo,
  SongResult,
  fetchLinkInfo,
  identifyAnime,
  isDemoMode,
  recognizeSong,
  runDownloadJob,
  triggerFileDownload,
} from './lib/docksApi';
import {
  BACK_WAVES,
  COPY,
  FRONT_WAVES,
  PALM_CURVES,
  Phase,
  PlatformId,
  TabId,
  back,
  buildWavePath,
  detectPlatform,
  getChestCropMetrics,
  getShipDimensions,
  getShipTarget,
  mix,
  out,
  yAt,
} from './lib/docksLogic';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'post', label: 'Post' },
  { id: 'song', label: 'Song' },
  { id: 'anime', label: 'Anime' },
];

type StatusTone = 'normal' | 'ok' | 'err';

export default function App() {
  const [tab, setTab] = useState<TabId>('video');
  const [urlInput, setUrlInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusText, setStatusText] = useState('');
  const [statusTone, setStatusTone] = useState<StatusTone>('normal');
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [songResult, setSongResult] = useState<SongResult | null>(null);
  const [animeResult, setAnimeResult] = useState<AnimeResult | null>(null);
  const [isIdentifyingAnime, setIsIdentifyingAnime] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [lastDownload, setLastDownload] = useState<DownloadResult | null>(null);
  const [sheetScrolled, setSheetScrolled] = useState(false);

  const detectedPlatform: PlatformId | null = detectPlatform(urlInput);

  // Refs for DOM elements animated in the single render(now) loop
  const frameRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const shadeRef = useRef<HTMLCanvasElement | null>(null);
  const seaRef = useRef<HTMLDivElement | null>(null);
  const backSvgRef = useRef<SVGSVGElement | null>(null);
  const frontSvgRef = useRef<SVGSVGElement | null>(null);
  const backPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const frontPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const shipRef = useRef<HTMLDivElement | null>(null);
  const chestRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLDivElement | null>(null);
  const pingRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Request cancellation state
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Mutable animation engine state (zero React setState inside rAF)
  const animRef = useRef({
    t: 0,
    busy: 0,
    shipP: 0,
    phase: 'idle' as Phase,
    phaseStartMs: 0,
    chestStartMs: -1,
    cardStartMs: -1,
    cardAnimated: false,
    fine: false,
    px: -100,
    py: -100,
    cx: -100,
    cy: -100,
    cursorScale: 1,
    cursorPressed: false,
    cursorHover: 'default' as 'default' | 'link' | 'input',
    cursorSeen: false,
    pingStartMs: -1,
    pingX: 0,
    pingY: 0,
  });

  const setPhaseWithClock = useCallback((next: Phase) => {
    setPhase(next);
    const now = performance.now();
    animRef.current.phase = next;
    animRef.current.phaseStartMs = now;
    if (next === 'done') {
      animRef.current.chestStartMs = now;
    } else if (next === 'fetching' || next === 'idle' || next === 'working') {
      if (next !== 'working') {
        animRef.current.chestStartMs = -1;
      } else {
        animRef.current.chestStartMs = -1;
      }
    }
  }, []);

  const triggerCardEntrance = useCallback(() => {
    animRef.current.cardStartMs = performance.now();
    animRef.current.cardAnimated = true;
  }, []);

  const beginRequest = useCallback((): { id: number; signal: AbortSignal } => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    reqIdRef.current += 1;
    return { id: reqIdRef.current, signal: controller.signal };
  }, []);

  const runFetch = useCallback(
    async (targetTab: TabId, rawUrl: string, fileOverride?: File | null) => {
      const trimmed = rawUrl.trim();
      const fileToUse = fileOverride !== undefined ? fileOverride : uploadedFile;

      if (targetTab === 'song') {
        if (!trimmed && !fileToUse) {
          setStatusTone('err');
          setStatusText(COPY.emptyLink);
          return;
        }
        const { id, signal } = beginRequest();
        setMediaInfo(null);
        setSongResult(null);
        setAnimeResult(null);
        setLastDownload(null);
        setPhaseWithClock('fetching');
        setStatusTone('normal');
        setStatusText(COPY.fetching);

        try {
          const result = await recognizeSong(
            fileToUse ? { file: fileToUse } : { url: trimmed },
            signal
          );
          if (reqIdRef.current !== id) return;
          setSongResult(result);
          triggerCardEntrance();
          setPhaseWithClock('ready');
          setStatusTone('normal');
          setStatusText(isDemoMode() ? COPY.demoReady : '');
        } catch (err) {
          if ((err as Error).name === 'AbortError' || reqIdRef.current !== id) return;
          setPhaseWithClock('error');
          setStatusTone('err');
          setStatusText(
            err instanceof DocksApiError ? err.message : COPY.network
          );
        }
        return;
      }

      if (targetTab === 'anime') {
        if (!trimmed) {
          setStatusTone('err');
          setStatusText(COPY.emptyLink);
          return;
        }
        const { id, signal } = beginRequest();
        setMediaInfo(null);
        setSongResult(null);
        setAnimeResult(null);
        setLastDownload(null);
        setIsIdentifyingAnime(true);
        setPhaseWithClock('fetching');
        setStatusTone('normal');
        setStatusText(COPY.scanningAnime || 'Scanning video scene for anime...');

        try {
          const result = await identifyAnime(trimmed, signal);
          if (reqIdRef.current !== id) return;
          setAnimeResult(result);
          triggerCardEntrance();
          setPhaseWithClock('ready');
          setStatusTone(result.found ? 'ok' : 'err');
          setStatusText(
            result.found
              ? `Found: ${result.title} (${result.episode})`
              : result.message || 'No anime scene match found.'
          );
        } catch (err) {
          if ((err as Error).name === 'AbortError' || reqIdRef.current !== id) return;
          setPhaseWithClock('error');
          setStatusTone('err');
          setStatusText(
            err instanceof DocksApiError ? err.message : COPY.network
          );
        } finally {
          setIsIdentifyingAnime(false);
        }
        return;
      }

      if (!trimmed) {
        setStatusTone('err');
        setStatusText(COPY.emptyLink);
        return;
      }

      const platform = detectPlatform(trimmed);
      if (!platform) {
        setMediaInfo(null);
        setSongResult(null);
        setAnimeResult(null);
        setStatusTone('err');
        setStatusText(COPY.unsupportedLink);
        return;
      }

      const { id, signal } = beginRequest();
      setMediaInfo(null);
      setSongResult(null);
      setAnimeResult(null);
      setLastDownload(null);
      setPhaseWithClock('fetching');
      setStatusTone('normal');
      setStatusText(COPY.fetching);

      try {
        const info = await fetchLinkInfo(trimmed, signal);
        if (reqIdRef.current !== id) return;
        setMediaInfo(info);
        triggerCardEntrance();
        setPhaseWithClock('ready');
        setStatusTone('normal');
        setStatusText(isDemoMode() ? COPY.demoReady : '');
      } catch (err) {
        if ((err as Error).name === 'AbortError' || reqIdRef.current !== id) return;
        setPhaseWithClock('error');
        setStatusTone('err');
        setStatusText(
          err instanceof DocksApiError ? err.message : COPY.network
        );
      }
    },
    [beginRequest, setPhaseWithClock, triggerCardEntrance, uploadedFile]
  );

  const handleTabSelect = (nextTab: TabId) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setMediaInfo(null);
    setSongResult(null);
    setLastDownload(null);

    if (nextTab !== 'song') {
      setUploadedFile(null);
    }

    const trimmed = urlInput.trim();
    if (trimmed) {
      void runFetch(nextTab, trimmed, null);
    } else {
      abortRef.current?.abort();
      reqIdRef.current += 1;
      setPhaseWithClock('idle');
      setStatusTone('normal');
      setStatusText('');
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === tab);
    const nextIdx =
      e.key === 'ArrowRight'
        ? (idx + 1) % TABS.length
        : (idx - 1 + TABS.length) % TABS.length;
    handleTabSelect(TABS[nextIdx].id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runFetch(tab, urlInput);
  };

  const handlePaste = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setStatusTone('err');
        setStatusText(COPY.clipboardDenied);
        inputRef.current?.focus();
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text);
        setStatusTone('normal');
        setStatusText('');
        inputRef.current?.focus();
      } else {
        setStatusTone('err');
        setStatusText(COPY.emptyLink);
      }
    } catch {
      setStatusTone('err');
      setStatusText(COPY.clipboardDenied);
      inputRef.current?.focus();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setUploadedFile(file);
    void runFetch('song', urlInput, file);
    e.target.value = '';
  };

  const handleDownload = useCallback(
    async (
      type: 'video' | 'audio' | 'image',
      quality: string,
      songDownload = false
    ) => {
      const { id, signal } = beginRequest();
      setLastDownload(null);
      setPhaseWithClock('working');
      setStatusTone('normal');
      setStatusText(COPY.working);

      try {
        const result = await runDownloadJob(
          {
            url: urlInput.trim(),
            type,
            quality,
            file: uploadedFile,
            songDownload,
          },
          signal
        );
        if (reqIdRef.current !== id) return;
        setLastDownload(result);
        setPhaseWithClock('done');
        setStatusTone('ok');
        setStatusText(COPY.done);
        triggerFileDownload(result);
      } catch (err) {
        if ((err as Error).name === 'AbortError' || reqIdRef.current !== id) return;
        setPhaseWithClock('error');
        setStatusTone('err');
        setStatusText(
          err instanceof DocksApiError ? err.message : COPY.failedJob
        );
      }
    },
    [beginRequest, setPhaseWithClock, uploadedFile, urlInput]
  );

  const handleChestClick = useCallback(() => {
    if (lastDownload) {
      triggerFileDownload(lastDownload);
    }
  }, [lastDownload]);

  const handleTermsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const termsEl = document.getElementById('terms');
    if (termsEl && sheetRef.current) {
      termsEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Paint palm-frond shade canvas once at start (Section 8)
  useEffect(() => {
    const canvas = shadeRef.current;
    if (!canvas) return;
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 36);
    ctx.scale(0.5, 0.5);
    ctx.strokeStyle = 'rgba(120, 114, 96, 0.9)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [x0, y0, x1, y1, lw] of PALM_CURVES) {
      ctx.beginPath();
      ctx.lineWidth = lw;
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + 6, (y0 + y1) / 2 + 8, x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  // Custom ring cursor + ping listeners (Section 8)
  useEffect(() => {
    const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const syncFine = () => {
      const isFine = mqFine.matches;
      animRef.current.fine = isFine;
      document.documentElement.classList.toggle('fine', isFine);
    };
    syncFine();
    mqFine.addEventListener('change', syncFine);

    const onPointerMove = (e: PointerEvent) => {
      if (!animRef.current.fine) return;
      animRef.current.px = e.clientX;
      animRef.current.py = e.clientY;
      if (!animRef.current.cursorSeen) {
        animRef.current.cx = e.clientX;
        animRef.current.cy = e.clientY;
        animRef.current.cursorSeen = true;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('input[type="url"], input[type="text"], textarea')) {
        animRef.current.cursorHover = 'input';
      } else if (
        target?.closest('a, button, .pill, [role="button"], label.pill')
      ) {
        animRef.current.cursorHover = 'link';
      } else {
        animRef.current.cursorHover = 'default';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!animRef.current.fine) return;
      animRef.current.cursorPressed = true;
      animRef.current.pingStartMs = performance.now();
      animRef.current.pingX = e.clientX;
      animRef.current.pingY = e.clientY;
    };

    const onPointerUp = () => {
      animRef.current.cursorPressed = false;
    };

    const onPointerLeave = () => {
      animRef.current.cursorSeen = false;
      animRef.current.cursorPressed = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);

    return () => {
      mqFine.removeEventListener('change', syncFine);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.documentElement.classList.remove('fine');
    };
  }, []);

  // Single unified requestAnimationFrame render(now) loop
  useEffect(() => {
    const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;
    let lastNow = performance.now();

    // Cached layout metrics updated only on mount / ResizeObserver (zero per-frame reflow)
    const dims = {
      W: 0,
      Hb: 0,
      sw: 110,
      sh: 110 * (2002 / 1961),
      cw: 120,
      ch: (120 * 392) / 446,
      dirtyWaves: true,
      lastShadeTf: '',
      lastShipTf: '',
      lastChestTf: '',
      lastChestOp: '',
      lastFrameDrawMs: 0,
    };

    const syncDimensions = () => {
      const seaEl = seaRef.current;
      const frameEl = frameRef.current;
      if (!seaEl || !frameEl) return;

      const W = frameEl.clientWidth;
      const Hb = seaEl.clientHeight;
      const vw = window.innerWidth;
      const { sw, sh } = getShipDimensions(vw, Hb);
      const cw = vw <= 760 ? 90 : 120;
      const crop = getChestCropMetrics(cw);

      dims.W = W;
      dims.Hb = Hb;
      dims.sw = sw;
      dims.sh = sh;
      dims.cw = cw;
      dims.ch = crop.height;
      dims.dirtyWaves = true;

      if (backSvgRef.current) {
        backSvgRef.current.setAttribute('width', `${W}`);
        backSvgRef.current.setAttribute('height', `${Hb}`);
      }
      if (frontSvgRef.current) {
        frontSvgRef.current.setAttribute('width', `${W}`);
        frontSvgRef.current.setAttribute('height', `${Hb}`);
      }
      if (shipRef.current) {
        shipRef.current.style.width = `${sw}px`;
        shipRef.current.style.height = `${sh}px`;
      }
      if (chestRef.current) {
        chestRef.current.style.width = `${crop.width}px`;
        chestRef.current.style.height = `${crop.height}px`;
        chestRef.current.style.backgroundSize = `${crop.bgSizeX}% ${crop.bgSizeY}%`;
        chestRef.current.style.backgroundPosition = `${crop.bgPosX}% ${crop.bgPosY}%`;
      }
    };

    syncDimensions();
    const ro = new ResizeObserver(syncDimensions);
    if (frameRef.current) ro.observe(frameRef.current);
    if (seaRef.current) ro.observe(seaRef.current);
    window.addEventListener('resize', syncDimensions);

    const render = (now: number) => {
      const reduced = mqReduced.matches;
      const rawDt = Math.max(0, (now - lastNow) / 1000);
      const dt = Math.min(rawDt, 0.05);
      lastNow = now;

      const st = animRef.current;

      // 1. Wave time & busy easing
      const isBusy = st.phase === 'fetching' || st.phase === 'working';
      const busyTarget = isBusy ? 1 : 0;
      if (reduced) {
        st.busy = busyTarget;
      } else {
        st.busy += (busyTarget - st.busy) * (1 - Math.exp(-dt * 3));
        const spd = mix(1, 2.4, st.busy);
        st.t += dt * spd;
      }

      // Pace heavy SVG path rebuilds cleanly (~30fps) so software compositors stay responsive
      const drawWaves = dims.dirtyWaves || (!reduced && now - dims.lastFrameDrawMs >= 32);

      const { W, Hb, sw, sh, cw, ch } = dims;
      if (W > 0 && Hb > 0) {
        // 2. Rebuild wave paths
        if (drawWaves) {
          dims.lastFrameDrawMs = now;
          BACK_WAVES.forEach((layer, idx) => {
            const path = backPathRefs.current[idx];
            if (path) {
              path.setAttribute('d', buildWavePath(layer, W, Hb, st.t));
            }
          });
          FRONT_WAVES.forEach((layer, idx) => {
            const path = frontPathRefs.current[idx];
            if (path) {
              path.setAttribute('d', buildWavePath(layer, W, Hb, st.t));
            }
          });
          dims.dirtyWaves = false;
        }

        // 3. Ship progress & swell riding (compositor-only translate3d + rotate)
        const phaseElapsedSec = (now - st.phaseStartMs) / 1000;
        const target = getShipTarget(st.phase, phaseElapsedSec, st.shipP);
        if (reduced) {
          st.shipP = target;
        } else {
          st.shipP += (target - st.shipP) * (1 - Math.exp(-dt * 3));
        }

        const shipEl = shipRef.current;
        if (shipEl) {
          const x = W * (0.12 + 0.66 * st.shipP);
          const wy = yAt(FRONT_WAVES[0], x, st.t, Hb);
          const slope =
            (yAt(FRONT_WAVES[0], x + 90, st.t, Hb) -
              yAt(FRONT_WAVES[0], x - 90, st.t, Hb)) /
            180;
          const sx = x - sw / 2;
          const sy = wy + sw * 0.05 - sh;
          const deg = Math.atan(slope) * 57.3 * 0.75;
          const tf = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) rotate(${deg.toFixed(2)}deg)`;
          if (tf !== dims.lastShipTf) {
            dims.lastShipTf = tf;
            shipEl.style.transform = tf;
          }
        }

        // 4. Treasure chest on the right swell (compositor-only translate3d + scale)
        const chestEl = chestRef.current;
        if (chestEl) {
          const cx = W * 0.9;
          const chestLeft = cx - cw / 2;
          const chestTop = yAt(FRONT_WAVES[0], cx, st.t, Hb) + cw * 0.05 - ch;

          let nextOp = '0';
          let nextTf = `translate3d(${chestLeft.toFixed(1)}px, ${chestTop.toFixed(1)}px, 0) scale(0.6)`;

          if (st.phase === 'done' && st.chestStartMs >= 0) {
            if (reduced) {
              nextOp = '1';
              nextTf = `translate3d(${chestLeft.toFixed(1)}px, ${chestTop.toFixed(1)}px, 0) scale(1)`;
            } else {
              const k = Math.min(1, (now - st.chestStartMs) / 450);
              const sc = mix(0.6, 1, back(k));
              nextOp = k.toFixed(3);
              nextTf = `translate3d(${chestLeft.toFixed(1)}px, ${chestTop.toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
            }
          }

          if (nextOp !== dims.lastChestOp) {
            dims.lastChestOp = nextOp;
            chestEl.style.opacity = nextOp;
          }
          if (nextTf !== dims.lastChestTf) {
            dims.lastChestTf = nextTf;
            chestEl.style.transform = nextTf;
          }
        }
      }

      // 5. Palm frond shade drift (quantized to 0.1% / 0.1deg to avoid full-viewport blend thrash)
      const shadeEl = shadeRef.current;
      if (shadeEl) {
        const shadeTf = reduced
          ? 'translate(0%, 0%) rotate(0deg)'
          : `translate(${(Math.sin(st.t * 0.35) * 2.2).toFixed(1)}%, ${(Math.cos(st.t * 0.27) * 1.6).toFixed(1)}%) rotate(${(Math.sin(st.t * 0.22) * 0.8).toFixed(1)}deg)`;
        if (shadeTf !== dims.lastShadeTf) {
          dims.lastShadeTf = shadeTf;
          shadeEl.style.transform = shadeTf;
        }
      }

      // 6. Result card single 600ms out() entrance
      const cardEl = cardRef.current;
      if (cardEl && st.cardAnimated && st.cardStartMs >= 0) {
        if (reduced) {
          cardEl.style.opacity = '1';
          cardEl.style.transform = 'translate3d(0, 0, 0)';
          st.cardAnimated = false;
        } else {
          const k = Math.min(1, (now - st.cardStartMs) / 600);
          const eased = out(k);
          cardEl.style.opacity = `${eased.toFixed(3)}`;
          cardEl.style.transform = `translate3d(0, ${((1 - eased) * 60).toFixed(1)}px, 0)`;
          if (k >= 1) {
            st.cardAnimated = false;
          }
        }
      }

      // 7. Custom ring cursor and click ping
      if (st.fine) {
        const curEl = curRef.current;
        if (curEl) {
          if (!st.cursorSeen) {
            curEl.style.opacity = '0';
          } else {
            const f = reduced ? 1 : 1 - Math.exp(-dt * 22);
            st.cx += (st.px - st.cx) * f;
            st.cy += (st.py - st.cy) * f;
            const targetScale = st.cursorPressed
              ? 0.7
              : st.cursorHover === 'link'
              ? 1.35
              : st.cursorHover === 'input'
              ? 0.55
              : 1;
            st.cursorScale += (targetScale - st.cursorScale) * f;
            curEl.style.opacity = '1';
            curEl.style.transform = `translate3d(${st.cx.toFixed(1)}px, ${st.cy.toFixed(1)}px, 0) scale(${st.cursorScale.toFixed(3)})`;
          }
        }

        const pingEl = pingRef.current;
        if (pingEl && st.pingStartMs >= 0) {
          const pk = (now - st.pingStartMs) / 650;
          if (pk >= 1 || reduced) {
            pingEl.style.opacity = '0';
            st.pingStartMs = -1;
          } else {
            const sc = 1 + out(pk) * 1.9;
            pingEl.style.opacity = `${(1 - pk).toFixed(3)}`;
            pingEl.style.transform = `translate3d(${st.pingX.toFixed(1)}px, ${st.pingY.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
          }
        }
      }

      if (!document.hidden) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    const startLoop = () => {
      if (!rafId && !document.hidden) {
        lastNow = performance.now();
        rafId = window.requestAnimationFrame(render);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    startLoop();

    return () => {
      stopLoop();
      ro.disconnect();
      window.removeEventListener('resize', syncDimensions);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const isWorking = phase === 'working';
  const placeholder =
    tab === 'song'
      ? 'Paste a link to a video or song clip'
      : tab === 'anime'
      ? 'Paste an Anime Reel, Short, TikTok, or YouTube link'
      : 'Paste a YouTube, Instagram or Pinterest link';
  const submitLabel =
    tab === 'song'
      ? 'Find song'
      : tab === 'anime'
      ? 'Find Anime & Episode'
      : 'Get links';

  return (
    <>
      <div className="frame" ref={frameRef}>
        <canvas id="shade" ref={shadeRef} aria-hidden="true" />

        {/* Top chrome solid bar */}
        <header className={`top${sheetScrolled ? ' is-scrolled' : ''}`}>
          <a
            href="#"
            className="brand-logo"
            aria-label="KiwiAPI Home"
          >
            <AnchorIcon />
            <span>KiwiAPI</span>
          </a>

          <nav className="top-nav" aria-label="Primary">
            <a
              href="#"
              className="nav-link"
            >
              <AnchorIcon className="nav-anchor" />
              <span>Home</span>
            </a>
            <a
              href="https://api.kiwiapi.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              <AnchorIcon className="nav-anchor" />
              <span>API</span>
            </a>
            <a
              href="#terms"
              onClick={handleTermsClick}
              className="nav-link nav-terms"
            >
              <AnchorIcon className="nav-anchor" />
              <span>Terms</span>
            </a>
          </nav>
        </header>

        {/* Scrollable sheet zone */}
        <main
          id="sheet"
          ref={sheetRef}
          onScroll={(e) => {
            const scrolled = e.currentTarget.scrollTop > 4;
            setSheetScrolled((prev) => (prev === scrolled ? prev : scrolled));
          }}
        >
          <div className="sheet-inner">
            <div className="eb">The Docks</div>
            <h1 className="hero-title">
              Paste a link.
              <br />
              Get the file.
            </h1>

            <div
              className="tabs"
              role="tablist"
              aria-label="Download mode"
              onKeyDown={handleTabKeyDown}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="pill"
                  aria-selected={tab === t.id}
                  onClick={() => handleTabSelect(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form className="field" onSubmit={handleSubmit} noValidate>
              <div className="field-input-wrap">
                <input
                  ref={inputRef}
                  type="url"
                  className="field-input"
                  value={urlInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    setUrlInput(next);
                    if (statusTone === 'err') {
                      setStatusTone('normal');
                      setStatusText('');
                    }
                  }}
                  placeholder={placeholder}
                  aria-label="Media link"
                  autoComplete="off"
                  spellCheck={false}
                />
                {urlInput.length > 0 && (
                  <button
                    type="button"
                    className="clear-btn"
                    aria-label="Clear link"
                    onClick={() => {
                      setUrlInput('');
                      if (statusTone === 'err') {
                        setStatusTone('normal');
                        setStatusText('');
                      }
                      inputRef.current?.focus();
                    }}
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              <div className="field-actions">
                <button
                  type="button"
                  className="paste-btn"
                  onClick={handlePaste}
                >
                  Paste
                </button>
                {tab !== 'anime' && (
                  <button
                    type="button"
                    className="anime-arrow-btn"
                    disabled={phase === 'fetching' || isIdentifyingAnime}
                    onClick={() => {
                      setTab('anime');
                      runFetch('anime', urlInput);
                    }}
                    title="Find Anime & Episode from this video"
                    aria-label="Find Anime & Episode"
                  >
                    <span className="anime-arrow-emoji">🎌</span>
                    <span className="anime-arrow-text">Anime</span>
                    <ArrowRightIcon className="anime-arrow-icon" />
                  </button>
                )}
                <button
                  type="submit"
                  className="pill solid field-submit"
                  disabled={phase === 'fetching' || isIdentifyingAnime}
                >
                  {isIdentifyingAnime ? 'Scanning...' : submitLabel}
                </button>
              </div>
            </form>

            {tab === 'song' && (
              <div className="upload-row">
                <button
                  type="button"
                  className="pill upload-pill"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload a clip
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  aria-label="Upload audio or video clip"
                />
                {uploadedFile && (
                  <span className="upload-filename">{uploadedFile.name}</span>
                )}
              </div>
            )}

            <div className="marks" aria-label="Supported platforms">
              <div
                className={`mark${detectedPlatform === 'youtube' ? ' active' : ''}`}
                title="YouTube"
                data-testid="mark-youtube"
              >
                <YouTubeIcon className="mark-icon" />
                <svg className="mark-underline" viewBox="0 0 26 4" aria-hidden="true">
                  <line x1="1" y1="2" x2="25" y2="2" />
                </svg>
              </div>
              <div
                className={`mark${detectedPlatform === 'instagram' ? ' active' : ''}`}
                title="Instagram"
                data-testid="mark-instagram"
              >
                <InstagramIcon className="mark-icon" />
                <svg className="mark-underline" viewBox="0 0 26 4" aria-hidden="true">
                  <line x1="1" y1="2" x2="25" y2="2" />
                </svg>
              </div>
              <div
                className={`mark${detectedPlatform === 'pinterest' ? ' active' : ''}`}
                title="Pinterest"
                data-testid="mark-pinterest"
              >
                <PinterestIcon className="mark-icon" />
                <svg className="mark-underline" viewBox="0 0 26 4" aria-hidden="true">
                  <line x1="1" y1="2" x2="25" y2="2" />
                </svg>
              </div>
            </div>

            <div
              id="msg"
              aria-live="polite"
              className={
                statusTone === 'err'
                  ? 'is-err'
                  : statusTone === 'ok'
                  ? 'is-ok'
                  : undefined
              }
            >
              {statusText}
            </div>

            <div id="out">
              <ResultCard
                cardRef={cardRef}
                tab={tab}
                mediaInfo={mediaInfo}
                songResult={songResult}
                animeResult={animeResult}
                isWorking={isWorking}
                onDownload={(type, quality) => void handleDownload(type, quality)}
                onDownloadAllImages={(count) =>
                  void handleDownload('image', `all-${count}-photos`)
                }
                onGetSongMp3={() =>
                  void handleDownload(
                    'audio',
                    songResult?.title ? `${songResult.title} MP3` : 'MP3 320 kbps',
                    true
                  )
                }
              />
            </div>

            <footer id="terms">
              Only download content you own or have permission to use. Private and
              DRM-protected content is not supported. Files are deleted after 30
              minutes.
            </footer>
          </div>
        </main>

        {/* Fixed sea band zone */}
        <SeaBand
          refs={{
            seaRef,
            backSvgRef,
            frontSvgRef,
            backPathRefs,
            frontPathRefs,
            shipRef,
            chestRef,
          }}
          phase={phase}
          onChestClick={handleChestClick}
        />
      </div>

      {/* Black ring cursor & click ping */}
      <div id="cur" ref={curRef} aria-hidden="true" />
      <div id="ping" ref={pingRef} aria-hidden="true" />
    </>
  );
}
