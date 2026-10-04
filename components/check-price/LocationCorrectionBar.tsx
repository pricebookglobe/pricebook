"use client";

import { useState } from "react";
import { MapPin, Store, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { NearbyStore } from "@/lib/api";

// The sticky "you're at X, incorrect?" pill + its bottom-sheet store picker,
// for the Check Price tab's GPS auto-detect. Split out of
// CheckPriceExperience.tsx because it's a self-contained, reusable bit of
// UI/UX (amber pill -> bottom sheet -> onSelect) rather than something that
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
  // Every other active store within range, nearest first — the sheet lists
  // these plus primaryStore itself (marked "Current"), so the full set of
  // candidates is visible in one place rather than splitting "the pick" and
  // "the alternatives" across two UI locations.
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

  if (alternativeStores.length === 0) {
    // Nothing to switch to — showing "Incorrect?" with no way to act on it
    // would just be noise, so the bar only appears once there's a real
    // choice to make.
    return null;
  }

  const allCandidates = [primaryStore, ...alternativeStores];

  return (
    <>
      {/* Sticky pill — bleeds edge-to-edge within AppPage's padded card
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
            onClick={() => setOpen(true)}
            className={`sticky top-0 z-30 -mx-6 mb-4 flex w-[calc(100%+3rem)] items-center justify-between gap-3 border-b border-correction-dark/20 px-4 py-2.5 text-left shadow-sm transition-colors active:bg-correction-dark sm:-mx-8 sm:w-[calc(100%+4rem)] ${
              flashing ? "correction-flash-bar" : "bg-correction"
            }`}
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
                        phrase instead of a separate prompt. */}
                    {!isManualOverride && <span className="font-medium">{t("Incorrect?")}</span>}
                  </>
                )}
              </span>
            </span>
            {/* Deliberately NOT amber/white-on-amber (that read as part of
                the flashing warning color itself, low-contrast against it)
                — the sidebar's dark ink-green, same as the rest of the
                app's primary actions, so it reads as a distinct, tappable
                action sitting on top of the attention-colored bar. */}
            <span className="shrink-0 whitespace-nowrap self-center rounded-full bg-ink px-2.5 py-1 font-display text-xs font-bold text-white transition-colors">
              {flashing ? "→ " : ""}
              {t("Change location")}
            </span>
          </button>
        );
      })()}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-line bg-field-raised shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-field-raised px-5 py-4">
              <h2 className="font-display text-base font-bold text-ink">{t("Select your store")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Close")}
                className="rounded-full p-1.5 text-ash transition-colors hover:bg-field active:bg-line"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <ul className="flex flex-col gap-1.5 p-3">
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
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                        isCurrent
                          ? "border-correction bg-correction-soft"
                          : "border-line bg-field hover:border-value active:bg-value/10"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {s.store_photo_url ? (
                          <img
                            src={s.store_photo_url}
                            alt=""
                            aria-hidden="true"
                            className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-ash">
                            <Store size={16} strokeWidth={2} />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-display text-sm font-semibold text-ink">{s.store_name}</span>
                          {isCurrent && <span className="font-display text-xs font-medium text-correction-dark">{t("Current")}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-field-raised px-2.5 py-1 font-mono text-xs text-ash">
                        {Math.round(s.distance_m)}m
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="px-5 pb-5 pt-1 text-center text-xs text-ash">
              {t("GPS is typically accurate to 5–20 meters, so in tightly packed stores the detected store may not always be exact.")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
