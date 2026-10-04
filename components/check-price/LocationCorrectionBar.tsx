"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Store } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { NearbyStore } from "@/lib/api";

// The sticky "you're at X, incorrect?" pill + its store-picker dropdown, for
// the Check Price tab's GPS auto-detect. Split out of
// CheckPriceExperience.tsx because it's a self-contained, reusable bit of
// UI/UX (amber pill -> dropdown -> onSelect) rather than something that
// needs direct access to that screen's search/result state.
//
// Deliberately uses the `correction` color token ONLY here — see
// tailwind.config.ts's comment on that token for why amber is otherwise
// absent from the whole product.
export function LocationCorrectionBar({
  primaryStore,
  alternativeStores,
  isManualOverride,
  promptRecheck,
  onSelect
}: {
  primaryStore: NearbyStore;
  // Every other active store within range, nearest first — the dropdown
  // lists these plus primaryStore itself (marked "Current"), so the full
  // set of candidates is visible in one place rather than splitting "the
  // pick" and "the alternatives" across two UI locations.
  alternativeStores: NearbyStore[];
  isManualOverride: boolean;
  // True for a few seconds right after a background re-check runs while a
  // manual correction is active (the slow 60s cadence) — swaps the bar's
  // text to "Are you still at X?" and flashes it, as a periodic nudge
  // rather than something that needs dismissing (CheckPriceExperience
  // clears it on its own timer).
  promptRecheck: boolean;
  onSelect: (storeId: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // There's genuinely nothing to switch to — GPS found only this one store
  // nearby. The bar still shows "You are at X" (previously it vanished
  // entirely whenever this list happened to be empty, which — since it's
  // driven by live GPS readings right at the 20m cutoff — made the whole
  // orange ribbon flicker in and out as the count ticked between 0 and 1.
  // Staying visible, just without the "Incorrect?"/"Change location"
  // controls, means the ribbon is always there the moment there's a
  // primary store at all).
  const hasAlternatives = alternativeStores.length > 0;

  // Closes the dropdown on an outside tap/click, without needing a
  // full-screen backdrop — the small list sits right under the bar instead
  // of as a bottom sheet, so a tap anywhere else on the page should just
  // dismiss it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Closing again if the candidate list changes under it (a background
  // re-check lands while the dropdown happens to be open) avoids it showing
  // a now-stale set of stores.
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryStore.store_id, alternativeStores.length]);

  const allCandidates = [primaryStore, ...alternativeStores];

  return (
    <div ref={containerRef} className="sticky top-0 z-30 -mx-6 w-[calc(100%+3rem)] sm:-mx-8 sm:w-[calc(100%+4rem)]">
      {/* The pill itself — bleeds edge-to-edge within AppPage's padded card
          (negative margins cancel the card's own p-6/sm:p-8) so it reads as
          a banner pinned to the top of the screen rather than a box
          floating inside the content, the whole time the Check Price tab
          is open (mirrors how location polling itself stays live across
          the landing panel, Scan/Snap/results — see CheckPriceExperience's
          background poll effect). */}
      {(() => {
        const flashing = isManualOverride && promptRecheck;
        return (
          <button
            type="button"
            onClick={() => hasAlternatives && setOpen((o) => !o)}
            className={`flex w-full items-center justify-between gap-3 border-b border-correction-dark/20 px-4 py-2.5 text-left shadow-sm transition-colors mb-4 ${
              hasAlternatives ? "active:bg-correction-dark" : "cursor-default"
            } ${flashing ? "correction-flash-bar" : "bg-correction"}`}
          >
            <span className="flex min-w-0 items-start gap-2 font-display text-sm font-semibold text-white">
              <MapPin size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                {flashing ? (
                  <span className="truncate">
                    {t("Are you still at")} {primaryStore.store_name}?
                  </span>
                ) : (
                  <>
                    <span className="truncate">
                      {t("You are at")} {primaryStore.store_name}
                    </span>
                    {/* Own line rather than trailing the store name — a
                        short store name left "Incorrect?" crammed right up
                        against it on the same line, reading as one run-on
                        phrase instead of a separate prompt. Only shown when
                        there's actually another store to switch to. */}
                    {!isManualOverride && hasAlternatives && <span className="font-medium">{t("Incorrect?")}</span>}
                  </>
                )}
              </span>
            </span>
            {hasAlternatives && (
              // Deliberately NOT amber/white-on-amber (that read as part of
              // the flashing warning color itself, low-contrast against it)
              // — a dark blue, by request, so it reads as a distinct,
              // tappable action sitting on top of the attention-colored
              // bar. Tailwind's built-in blue-900/950 rather than a new
              // design token: this is a one-off accent for this single
              // button, not a reusable brand color.
              <span className="shrink-0 whitespace-nowrap self-center rounded-full bg-blue-900 px-2.5 py-1 font-display text-xs font-bold text-white transition-colors">
                {flashing ? "→ " : ""}
                {t("Change location")}
              </span>
            )}
          </button>
        );
      })()}

      {open && hasAlternatives && (
        // A small dropdown anchored right under the bar, not a full-screen
        // bottom sheet — by request, so picking the right store never needs
        // scrolling the page to find it. Capped height with its own scroll
        // as a fallback only for the rare case of many nearby stores; with
        // the usual 2-3 it never kicks in.
        <div className="max-h-64 overflow-y-auto rounded-b-lg border-x border-b border-line bg-field-raised px-2 py-2 shadow-lg">
          <ul className="flex flex-col gap-1">
            {allCandidates.map((s) => {
              const isCurrent = s.store_id === primaryStore.store_id;
              return (
                <li key={s.store_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(s.store_id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      isCurrent
                        ? "border-correction bg-correction-soft"
                        : "border-line bg-field hover:border-value active:bg-value/10"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {s.store_photo_url ? (
                        // No border here either, matching the big store
                        // photo on the landing panel — see the comment
                        // there on why (a flashing "frame" while the photo
                        // itself briefly isn't there).
                        <img
                          src={s.store_photo_url}
                          alt=""
                          aria-hidden="true"
                          className="h-8 w-8 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-ash">
                          <Store size={14} strokeWidth={2} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-display text-sm font-semibold text-ink">{s.store_name}</span>
                        {isCurrent && <span className="font-display text-xs font-medium text-correction-dark">{t("Current")}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-field-raised px-2 py-0.5 font-mono text-xs text-ash">
                      {Math.round(s.distance_m)}m
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
