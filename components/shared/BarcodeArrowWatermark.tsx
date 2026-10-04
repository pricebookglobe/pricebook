"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A faint "rain" of small barcode + downward-arrow glyphs (the same mark
// from the PriceBook shield logo, app/icon.png), mixed with falling copies
// of the word "Prices" in the same color/size, drifting down the big white
// content card (AppPage) — many small copies at random horizontal
// positions and starting points, rather than one large centered glyph, so
// it reads as rain and, with the word falling alongside the arrows, as
// "prices going down" at a glance.
// Purely decorative: pointer-events none, sits behind the page's real
// content, and is clipped to its parent by that parent having
// `relative overflow-hidden` (see AppPage.tsx).
//
// Sizing/opacity are tuned by explicit request relative to the original
// single-arrow version: ~80% smaller, a bit darker (still light).
const DROP_COUNT = 16;

// Every drop falls at this same rate (pixels of actual travel per second),
// not a fixed animation-DURATION. A fixed duration animates `top` across a
// PERCENTAGE of the container's height (see the watermark-drift keyframes
// in globals.css), so the same duration covers far more actual pixels on a
// tall card (History's long list) than on a short one (a compact Search
// Items result) — which is exactly why the rain used to look like it fell
// at different speeds on different tabs, even though every tab runs the
// same code. Deriving the duration from the CARD'S OWN measured height
// instead keeps the real on-screen fall rate identical everywhere.
// Slightly slower again, by request (was 90px/s, then 70px/s).
const PX_PER_SECOND = 55;
// Falls a bit over the full 0%-100% of the card (see the -10%/110% start/
// end in the keyframes) so a drop fully clears the top/bottom before
// looping rather than popping at the exact edge.
const TRAVEL_FACTOR = 1.2;
const FALLBACK_DURATION_S = 10;

type Drop = {
  kind: "arrow" | "text";
  left: number; // percent
  size: number; // px, width of the glyph / font-size of the text
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
    delay: -Math.random() * 12,
    opacity: 0.12 + Math.random() * 0.08
  }));
}

export function BarcodeArrowWatermark() {
  const { t } = useLanguage();
  // Generated once per mount, not on every render, so drops don't jump
  // around or restart their fall whenever the parent page re-renders.
  const drops = useMemo(makeDrops, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);

  // Tracks the card's actual rendered height (it varies per screen/tab —
  // Check Price's landing panel, a short Search Items result, History's
  // long list — and can change as content loads in), so the duration
  // below always reflects the real height right now, not whatever it was
  // on first mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setHeightPx(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const durationS = heightPx ? (heightPx * TRAVEL_FACTOR) / PX_PER_SECOND : FALLBACK_DURATION_S;

  return (
    <div ref={containerRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {drops.map((drop, i) => (
        <div
          key={i}
          className="watermark-drift absolute whitespace-nowrap font-display font-bold"
          style={{
            left: `${drop.left}%`,
            // Horizontal centering only — the animation itself drives
            // `top` (see the watermark-drift keyframes), so this transform
            // stays fixed rather than being part of the animated property.
            transform: "translateX(-50%)",
            width: drop.kind === "arrow" ? `${drop.size}px` : "auto",
            fontSize: drop.kind === "text" ? `${drop.size}px` : undefined,
            opacity: drop.opacity,
            // A bit darker than the logo's own `mark` teal (#13BDC4) — kept
            // as a one-off inline shade rather than a new design token,
            // since `mark` itself is pinned to match the logo pixel-for-
            // pixel (see tailwind.config.ts).
            color: "#0C8088",
            animationDuration: `${durationS}s`,
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
