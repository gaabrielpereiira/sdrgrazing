import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────
// Grazing Table & Co — brand mark (wheat sprig inside U-bracket)
// Faithfully reconstructed from the official identity guide.
// ──────────────────────────────────────────────────────────────

interface GrazingMarkProps {
  className?: string;
  /** stroke colour — defaults to currentColor so you can drive it with text-* */
  color?: string;
}

export const GrazingMark: React.FC<GrazingMarkProps> = ({ className, color = 'currentColor' }) => (
  <svg
    viewBox="0 0 56 82"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Grazing Table & Co"
  >
    {/* ── U-bracket (fork / vessel) ── */}
    <path
      d="M13 4 L13 48 C13 60 28 67 28 67 C28 67 43 60 43 48 L43 4"
      stroke={color}
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* bottom pin / drop */}
    <line x1="28" y1="67" x2="28" y2="78" stroke={color} strokeWidth="3.4" strokeLinecap="round" />

    {/* ── Stem ── */}
    <line x1="28" y1="60" x2="28" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />

    {/* ── Lower leaf pair ── */}
    <path d="M28 54 C23 47 18 43 18 38" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M28 54 C33 47 38 43 38 38" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

    {/* ── Mid leaf pair ── */}
    <path d="M28 43 C23 36 18 30 19 26" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M28 43 C33 36 38 30 37 26" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

    {/* ── Upper leaf pair ── */}
    <path d="M28 32 C24 25 22 19 23 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M28 32 C32 25 34 19 33 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />

    {/* ── Grain head — centre kernel (tallest) ── */}
    <path
      d="M28 22 C26 17 26 11 28 7 C30 11 30 17 28 22 Z"
      stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none"
    />
    {/* left kernel */}
    <path
      d="M28 22 C24 18 22 12 24 8 C27 12 28 18 28 22 Z"
      stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none"
    />
    {/* right kernel */}
    <path
      d="M28 22 C32 18 34 12 32 8 C29 12 28 18 28 22 Z"
      stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none"
    />
  </svg>
);

// ──────────────────────────────────────────────────────────────
// Full lockup: mark + wordmark
// ──────────────────────────────────────────────────────────────

interface BrandLogoProps {
  /** 'full' = icon + wordmark side by side (sidebar expanded)
   *  'stacked' = icon above wordmark (login screen)
   *  'icon' = mark only (sidebar collapsed) */
  variant?: 'full' | 'stacked' | 'icon';
  /** Size of the mark in pixels */
  size?: number;
  className?: string;
  /** Wrap in a Link to /dashboard? */
  asLink?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  size = 40,
  className,
  asLink = true,
}) => {
  const goldColor = '#B3A369';

  const mark = (
    <GrazingMark
      color={goldColor}
      className="flex-shrink-0"
      style={{ width: size, height: Math.round(size * (82 / 56)) }}
    />
  );

  const wordmark = (
    <div className={cn(
      'flex flex-col leading-none',
      variant === 'stacked' ? 'items-center mt-3' : '',
    )}>
      <span
        className="font-serif font-semibold tracking-tight text-brand-cream"
        style={{ fontSize: size * 0.52, lineHeight: 1 }}
      >
        Grazing
      </span>
      <span
        className="uppercase tracking-[0.18em] text-brand-gold-500 font-sans"
        style={{ fontSize: size * 0.22, lineHeight: 1.4, letterSpacing: '0.16em' }}
      >
        Table &amp; Co
      </span>
    </div>
  );

  const inner =
    variant === 'icon' ? (
      mark
    ) : variant === 'stacked' ? (
      <div className="flex flex-col items-center">
        {mark}
        {wordmark}
      </div>
    ) : (
      /* full — horizontal */
      <div className="flex items-center gap-3">
        {mark}
        {wordmark}
      </div>
    );

  if (!asLink) return <div className={className}>{inner}</div>;

  return (
    <Link to="/dashboard" className={cn('block', className)}>
      {inner}
    </Link>
  );
};

export default BrandLogo;
