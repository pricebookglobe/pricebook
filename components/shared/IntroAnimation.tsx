"use client";

import { useEffect, useState } from "react";
import { MapPin, Tag, CheckCircle2 } from "lucide-react";

const TOTAL_MS = 10000;

// A ~10-second animated open for the app — not a rendered video file, but a
// CSS-driven sequence of full-screen "scenes" that plays once per app
// launch: the logo, then "finds the store you're at", then "compares
// prices nearby and flags the cheapest one", then a closing tagline. Built
// this way (no video asset, no native video player) because it's a plain
// web page under the hood, so it works identically in the packaged Android
// app and in a browser, needs no extra native wiring, and is trivial to
// re-time or re-word later.
export function IntroAnimation({ onFinished }: { onFinished: () => void }) {
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    // Respect the OS-level "reduce motion" setting by skipping the
    // animated sequence outright rather than showing it frozen/broken —
    // the CSS itself turns every animation off in that case, which would
    // otherwise leave every scene stuck at its resting opacity: 0.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDismissing(true);
      return;
    }
    const finishTimer = setTimeout(() => setDismissing(true), TOTAL_MS);
    return () => clearTimeout(finishTimer);
  }, []);

  useEffect(() => {
    if (!dismissing) return;
    // A short fade-out after dismissing starts, so the handoff to the real
    // start page underneath isn't an abrupt cut.
    const t = setTimeout(onFinished, 400);
    return () => clearTimeout(t);
  }, [dismissing, onFinished]);

  function skip() {
    setDismissing(true);
  }

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#DCEEE3] transition-opacity duration-500 ${
        dismissing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onClick={skip}
    >
      {/* Faint giant watermark shield, same family as the rest of the app's
          branding, so this reads as "PriceBook" even before the logo scene
          lands. */}
      <img
        src="/pricebook-icon-transparent.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[90vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.08]"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="absolute right-4 top-4 z-10 rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 font-display text-xs font-medium text-ink/70 backdrop-blur-sm"
      >
        Skip
      </button>

      {/* Scene 1 — logo */}
      <div className="intro-scene intro-scene-1 absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <img src="/pricebook-icon-dark.png" alt="PriceBook" className="h-auto w-32 intro-pop" />
        <p className="font-display text-3xl font-bold text-ink">
          Price<span className="text-value">Book</span>
        </p>
        <p className="font-display text-sm font-medium tracking-wide text-ash">Track Best Prices</p>
      </div>

      {/* Scene 2 — finds the store you're at */}
      <div className="intro-scene intro-scene-2 absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="intro-pulse-ring absolute h-24 w-24 rounded-full border-2 border-value" />
          <span className="intro-pulse-ring intro-pulse-ring-delay absolute h-24 w-24 rounded-full border-2 border-value" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-value text-white shadow-lg">
            <MapPin size={28} strokeWidth={2.25} />
          </span>
        </div>
        <p className="font-display text-xl font-bold text-ink">Finds the store you're at</p>
        <p className="rounded-full border border-value/30 bg-value-soft px-4 py-1.5 font-display text-sm text-ink">
          You are at <strong>ABC Store</strong>
        </p>
      </div>

      {/* Scene 3 — compares prices nearby */}
      <div className="intro-scene intro-scene-3 absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Compares prices nearby</p>
        <div className="flex items-end gap-3">
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-field-raised px-3 py-2.5 opacity-80">
            <Tag size={16} strokeWidth={2} className="text-ash" />
            <span className="font-mono text-sm text-ink">4.20</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-field-raised px-3 py-2.5 opacity-80">
            <Tag size={16} strokeWidth={2} className="text-ash" />
            <span className="font-mono text-sm text-ink">3.75</span>
          </div>
          <div className="intro-pop-delay flex flex-col items-center gap-1 rounded-lg border-2 border-value bg-value px-4 py-3 text-white shadow-lg">
            <CheckCircle2 size={18} strokeWidth={2.25} />
            <span className="font-mono text-base font-bold">3.10</span>
          </div>
        </div>
        <p className="font-display text-sm font-medium text-value">Best price nearby ✓</p>
      </div>

      {/* Scene 4 — payoff */}
      <div className="intro-scene intro-scene-4 absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <img src="/pricebook-icon-dark.png" alt="PriceBook" className="h-auto w-16" />
        <p className="mt-2 font-display text-2xl font-bold leading-snug text-ink">
          Check the price.
          <br />
          Find it nearby.
          <br />
          <span className="text-value">Save every time.</span>
        </p>
      </div>

      <div className="absolute bottom-6 left-1/2 h-1 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-ink/10">
        <div className="intro-progress h-full rounded-full bg-value" />
      </div>
    </div>
  );
}
