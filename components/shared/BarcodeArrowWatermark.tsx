"use client";

import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A faint "rain" of small barcode + downward-arrow glyphs (the same mark
// from the PriceBook shield logo, app/icon.png), mixed with falling copies
// of the word "Prices" in the same color/size, drifting down the big white
// content card (AppPage) — many small copies at random horizontal
// positions, sizes, speeds and starting points, rather than one large
// centered glyph, so it reads as rain and, with the word falling alongside
// the arrows, as "prices going down" at a glance.
// Purely decorative: pointer-events none, sits behind the page's real
// content, and is clipped to its parent by that parent having
// `relative overflow-hidden` (see AppPage.tsx).
//
// Sizing/opacity/speed are tuned by explicit request relative to the
// original single-arrow version: ~80% smaller, a bit darker (still light),
// and a bit faster than the original 18s drift.
const DROP_COUNT = 16;

type Drop = {
  kind: "arrow" | "text";
  left: number; // percent
  size: number; // px, width of the glyph / font-size of the text
  duration: number; // seconds for one full fall
  delay: number; // negative seconds, so drops start mid-fall, staggered
  opacity: number;
};

function makeDrops(): Drop[] {
  return Array.from({ length: DROP_COUNT }, (_, i) => ({
    // Alternate kinds (with a little shuffle via the random start offset
    // below) so arrows and the word "Prices" both show up throughout the
    // rain rather than clumping.
    kind: i % 2 === 0 ? "arrow" : "text",
    left: Math.random() * 96,
    // Original glyph was rendered at ~96px (w-24). 80% smaller lands
    // around 19px; a little per-drop variance keeps the rain looking
    // natural rather than identical copies. The text uses this same size
    // as its font-size, so both kinds read as the same scale falling.
    size: 15 + Math.random() * 8,
    // Original drift was 18s; noticeably faster, with per-drop variance.
    duration: 6 + Math.random() * 5,
    delay: -Math.random() * 12,
    opacity: 0.12 + Math.random() * 0.08
  }));
}

export function BarcodeArrowWatermark() {
  const { t } = useLanguage();
  // Generated once per mount, not on every render, so drops don't jump
  // around or restart their fall whenever the parent page re-renders.
  const drops = useMemo(makeDrops, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {drops.map((drop, i) => (
        <div
          key={i}
          className="watermark-drift absolute top-0 whitespace-nowrap font-display font-bold"
          style={{
            left: `${drop.left}%`,
            width: drop.kind === "arrow" ? `${drop.size}px` : "auto",
            fontSize: drop.kind === "text" ? `${drop.size}px` : undefined,
            opacity: drop.opacity,
            // A bit darker than the logo's own `mark` teal (#13BDC4) — kept
            // as a one-off inline shade rather than a new design token,
            // since `mark` itself is pinned to match the logo pixel-for-
            // pixel (see tailwind.config.ts).
            color: "#0C8088",
            animationDuration: `${drop.duration}s`,
            animationDelay: `${drop.delay}s`
          }}
        >
          {drop.kind === "arrow" ? (
            <svg viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* The barcode — uneven bar widths, same irregular look as the
                  logo's own mark, not a perfectly even stripe pattern. */}
              <g fill="currentColor">
                <rect x="2" y="0" width="3" height="78" />
                <rect x="8" y="0" width="5" height="78" />
                <rect x="16" y="0" width="2" height="78" />
                <rect x="21" y="0" width="4" height="78" />
                <rect x="28" y="0" width="3" height="78" />
                <rect x="34" y="0" width="6" height="78" />
                <rect x="43" y="0" width="2" height="78" />
                <rect x="48" y="0" width="4" height="78" />
                <rect x="55" y="0" width="3" height="78" />
                <rect x="61" y="0" width="5" height="78" />
                <rect x="69" y="0" width="2" height="78" />
                <rect x="74" y="0" width="4" height="78" />
                <rect x="81" y="0" width="3" height="78" />
                <rect x="87" y="0" width="6" height="78" />
                <rect x="96" y="0" width="2" height="78" />
                <rect x="101" y="0" width="4" height="78" />
                <rect x="108" y="0" width="3" height="78" />
                <rect x="114" y="0" width="4" height="78" />
              </g>
              {/* The downward arrow beneath it, same width as the barcode above. */}
              <path d="M0 90 H120 L60 150 Z" fill="currentColor" />
            </svg>
          ) : (
            t("Prices")
          )}
        </div>
      ))}
    </div>
  );
}
