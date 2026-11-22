import React from 'react';
import { PlatformId } from '../lib/docksLogic';

export function AnchorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 30"
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="13" cy="5.5" r="3.2" />
      <line x1="13" y1="8.7" x2="13" y2="26.5" />
      <line x1="7.5" y1="13" x2="18.5" y2="13" />
      <path d="M4.2 19.5C4.2 24.4 8.2 27.2 13 27.2C17.8 27.2 21.8 24.4 21.8 19.5" />
      <polyline points="2.2 21.3 4.2 18.8 6.8 20.6" />
      <polyline points="19.2 20.6 21.8 18.8 23.8 21.3" />
    </svg>
  );
}

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.2" y="5.5" width="21.6" height="15" rx="4.2" />
      <polygon points="10.8 9.8 17.2 13 10.8 16.2" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="20" height="20" rx="5.5" />
      <circle cx="13" cy="13" r="4.4" />
      <circle cx="18.6" cy="7.4" r="0.8" fill="var(--line)" />
    </svg>
  );
}

export function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="13" cy="13" r="10" />
      <path d="M10.2 21.5L12.1 13.6" />
      <path d="M10.6 15.1C11.4 16.2 12.6 16.7 13.9 16.6C16.2 16.4 17.6 14.5 17.6 12C17.6 9.5 15.7 7.8 13.1 7.8C10.2 7.8 8.4 9.7 8.4 12.1C8.4 13.1 8.8 13.9 9.4 14.4" />
    </svg>
  );
}

export function PlatformIcon({
  platform,
  className,
}: {
  platform: PlatformId | null;
  className?: string;
}) {
  if (platform === 'instagram') return <InstagramIcon className={className} />;
  if (platform === 'pinterest') return <PinterestIcon className={className} />;
  return <YouTubeIcon className={className} />;
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" />
      <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" />
    </svg>
  );
}

export function FallbackShipSvg() {
  return (
    <svg
      viewBox="0 0 200 196"
      fill="none"
      stroke="var(--line)"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    >
      <path d="M102 22 V142" />
      <path d="M102 28 L138 38 L102 48 Z" fill="var(--ink)" />
      <path d="M102 44 C138 56 154 88 144 124 L102 120 Z" fill="var(--card)" />
      <path d="M98 52 C68 64 56 94 64 124 L98 122 Z" fill="var(--paper)" />
      <path d="M36 138 Q100 154 168 134 L152 170 Q100 182 52 168 Z" fill="var(--ink)" />
      <circle cx="84" cy="154" r="4" fill="var(--paper)" stroke="none" />
      <circle cx="104" cy="156" r="4" fill="var(--paper)" stroke="none" />
      <circle cx="124" cy="154" r="4" fill="var(--paper)" stroke="none" />
    </svg>
  );
}

export function FallbackChestSvg() {
  return (
    <svg
      viewBox="0 0 120 106"
      fill="none"
      stroke="var(--line)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    >
      <path d="M16 44 C16 22 34 14 60 14 C86 14 104 22 104 44 Z" fill="var(--card)" />
      <rect x="14" y="44" width="92" height="48" rx="8" fill="var(--band)" />
      <line x1="14" y1="54" x2="106" y2="54" />
      <line x1="36" y1="18" x2="36" y2="92" />
      <line x1="84" y1="18" x2="84" y2="92" />
      <rect x="52" y="47" width="16" height="18" rx="3" fill="var(--ink)" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="4" y1="10" x2="16" y2="10" />
      <polyline points="11 5 16 10 11 15" />
    </svg>
  );
}
