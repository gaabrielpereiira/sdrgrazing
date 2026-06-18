import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────
// Grazing Table & Co — brand mark
// SVG reconstruction used until official PNG assets are provided.
// When PNG is available, set LOGO_PNG_SRC / ICON_PNG_SRC below.
// ──────────────────────────────────────────────────────────────

// Set these to the public paths of the official PNG files when available.
// e.g. '/logo-grazing-full.png' and '/logo-grazing-icon.png'
const LOGO_PNG_SRC: string | null = null;   // full horizontal lockup PNG
const ICON_PNG_SRC: string | null = null;   // icon-only PNG

// ──────────────────────────────────────────────────────────────
// SVG mark (wheat sprig inside U-bracket)
// ──────────────────────────────────────────────────────────────
interface GrazingMarkProps {
  size: number;
  color?: string;
  className?: string;
}

export const GrazingMark: React.FC<GrazingMarkProps> = ({ size, color = '#B3A369', className }) => {
  const h = Math.round(size * (82 / 56));
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 56 82"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* U-bracket */}
      <path
        d="M13 4 L13 48 C13 60 28 67 28 67 C28 67 43 60 43 48 L43 4"
        stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
      />
      <line x1="28" y1="67" x2="28" y2="78" stroke={color} strokeWidth="3.4" strokeLinecap="round" />

      {/* Stem */}
      <line x1="28" y1="60" x2="28" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />

      {/* Lower leaves */}
      <path d="M28 54 C23 47 18 43 18 38" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M28 54 C33 47 38 43 38 38" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Mid leaves */}
      <path d="M28 43 C23 36 18 30 19 26" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M28 43 C33 36 38 30 37 26" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Upper leaves */}
      <path d="M28 32 C24 25 22 19 23 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M28 32 C32 25 34 19 33 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Grain head — centre kernel */}
      <path d="M28 22 C26 17 26 11 28 7 C30 11 30 17 28 22 Z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      {/* left kernel */}
      <path d="M28 22 C24 18 22 12 24 8 C27 12 28 18 28 22 Z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      {/* right kernel */}
      <path d="M28 22 C32 18 34 12 32 8 C29 12 28 18 28 22 Z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

// ──────────────────────────────────────────────────────────────
// Full lockup
// ──────────────────────────────────────────────────────────────
interface BrandLogoProps {
  /** 'full'    = icon + wordmark horizontal (sidebar expanded)
   *  'stacked' = icon above wordmark (login screen)
   *  'icon'    = mark only (sidebar collapsed) */
  variant?: 'full' | 'stacked' | 'icon';
  /** Height of the mark in pixels (width is proportional) */
  size?: number;
  className?: string;
  asLink?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  size = 40,
  className,
  asLink = true,
}) => {
  const gold = '#B3A369';

  // ── icon ──────────────────────────────────────────────────
  const icon =
    ICON_PNG_SRC ? (
      <img src={ICON_PNG_SRC} alt="Grazing Table & Co" height={size} style={{ height: size, width: 'auto' }} />
    ) : (
      <GrazingMark size={size} color={gold} className="flex-shrink-0" />
    );

  // ── full PNG lockup (horizontal or stacked) ───────────────
  if (LOGO_PNG_SRC && variant !== 'icon') {
    const logoHeight = variant === 'stacked' ? size * 2 : size;
    const inner = (
      <img src={LOGO_PNG_SRC} alt="Grazing Table & Co" height={logoHeight} style={{ height: logoHeight, width: 'auto' }} />
    );
    if (!asLink) return <div className={className}>{inner}</div>;
    return <Link to="/dashboard" className={cn('block', className)}>{inner}</Link>;
  }

  // ── SVG fallback with text wordmark ──────────────────────
  const wordmark = (
    <div className={cn('flex flex-col leading-none', variant === 'stacked' ? 'items-center mt-2' : '')}>
      <span
        className="font-serif font-semibold tracking-tight text-[#F9F6E7]"
        style={{ fontSize: size * 0.48, lineHeight: 1 }}
      >
        Grazing
      </span>
      <span
        className="font-sans text-brand-gold-500 uppercase"
        style={{ fontSize: size * 0.20, lineHeight: 1.5, letterSpacing: '0.18em' }}
      >
        Table &amp; Co
      </span>
    </div>
  );

  const inner =
    variant === 'icon' ? (
      icon
    ) : variant === 'stacked' ? (
      <div className="flex flex-col items-center">{icon}{wordmark}</div>
    ) : (
      <div className="flex items-center gap-3">{icon}{wordmark}</div>
    );

  if (!asLink) return <div className={className}>{inner}</div>;
  return (
    <Link to="/dashboard" className={cn('block', className)}>
      {inner}
    </Link>
  );
};

export default BrandLogo;
