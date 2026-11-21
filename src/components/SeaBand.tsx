import React, { useEffect, useState } from 'react';
import { ASSETS, BACK_WAVES, FRONT_WAVES, Phase } from '../lib/docksLogic';
import { FallbackChestSvg, FallbackShipSvg } from './Icons';

export interface SeaBandRefs {
  seaRef: React.RefObject<HTMLDivElement | null>;
  backSvgRef: React.RefObject<SVGSVGElement | null>;
  frontSvgRef: React.RefObject<SVGSVGElement | null>;
  backPathRefs: React.MutableRefObject<(SVGPathElement | null)[]>;
  frontPathRefs: React.MutableRefObject<(SVGPathElement | null)[]>;
  shipRef: React.RefObject<HTMLDivElement | null>;
  chestRef: React.RefObject<HTMLDivElement | null>;
}

interface SeaBandProps {
  refs: SeaBandRefs;
  phase: Phase;
  onChestClick: () => void;
}

export function SeaBand({ refs, phase, onChestClick }: SeaBandProps) {
  const [shipFailed, setShipFailed] = useState(false);
  const [chestFailed, setChestFailed] = useState(false);

  useEffect(() => {
    const shipImg = new Image();
    shipImg.onerror = () => setShipFailed(true);
    shipImg.src = ASSETS.SHIP;

    const chestImg = new Image();
    chestImg.onerror = () => setChestFailed(true);
    chestImg.src = ASSETS.CAPT;
  }, []);

  const isDone = phase === 'done';

  const handleChestKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDone) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChestClick();
    }
  };

  return (
    <div id="sea" ref={refs.seaRef} data-testid="sea-band" data-phase={phase}>
      <svg
        ref={refs.backSvgRef}
        className="sea-svg sea-svg-back"
        aria-hidden="true"
      >
        {BACK_WAVES.map((layer, idx) => (
          <path
            key={idx}
            ref={(el) => {
              refs.backPathRefs.current[idx] = el;
            }}
            fill={layer.fill || 'none'}
            stroke="var(--line)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div
        ref={refs.shipRef}
        className="sea-ship"
        data-testid="sea-ship"
        style={
          shipFailed
            ? undefined
            : { backgroundImage: `url("${ASSETS.SHIP}")` }
        }
        aria-hidden="true"
      >
        {shipFailed && <FallbackShipSvg />}
      </div>

      <svg
        ref={refs.frontSvgRef}
        className="sea-svg sea-svg-front"
        aria-hidden="true"
      >
        {FRONT_WAVES.map((layer, idx) => (
          <path
            key={idx}
            ref={(el) => {
              refs.frontPathRefs.current[idx] = el;
            }}
            fill={layer.fill || 'none'}
            stroke="var(--line)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div
        ref={refs.chestRef}
        className={`sea-chest${isDone ? ' is-ready' : ''}`}
        data-testid="sea-chest"
        role="button"
        aria-label="Download the file again"
        aria-hidden={!isDone}
        tabIndex={isDone ? 0 : -1}
        onClick={isDone ? onChestClick : undefined}
        onKeyDown={handleChestKeyDown}
        style={
          chestFailed
            ? undefined
            : { backgroundImage: `url("${ASSETS.CAPT}")` }
        }
      >
        {chestFailed && <FallbackChestSvg />}
      </div>
    </div>
  );
}
