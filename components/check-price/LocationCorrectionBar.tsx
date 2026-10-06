"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Store } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { NearbyStore } from "@/lib/api";

// The prominent orange "which store are you at" ribbon for the Check Price
// tab's GPS auto-detect. Split out of CheckPriceExperience.tsx because it's
// a self-contained, reusable bit of UI/UX (ribbon -> picker -> callback)
// rather than something that needs direct access to that screen's
// search/result state.
//
// Exact text/behavior requested:
// - "Seems you are at [Store Name]" (store name noticeably larger/bolder
//   than the rest of the line) with a bold "Modify Location" button, any
//   time there's nothing pending to confirm.
// - "Seems you have moved to [Store Name]" with a bold "Confirm" button
//   whenever the 20m-buffer logic in CheckPriceExperience has spotted a
//   closer registered store while the shopper is still within the buffer
//   of the current one — tapping Confirm is the ONLY thing that actually
//   switches the anchor in that case; ignoring it leaves the shopper on
//   their current store.
//
// Deliberately uses the `correction` color token ONLY here — see
// tailwind.config.ts's comment on that token for why amber is otherwise
// absent from the whole product.
export function LocationCorrectionBar({
  primaryStore,
  pendingMoveStore,
  alternativeStores,
  onConfirmMove,
  onModifyLocation
}: {
  primaryStore: NearbyStore;
  // Set only while a different registered store has become the closest
  // candidate AND the shopper is still within 20m of primaryStore — the
  // ribbon then asks to Confirm instead of switching outright. Null the
  // rest of the time.
  pendingMoveStore: NearbyStore | null;
  // Every other registered store currently in range, nearest first — the
  // "Modify Location" picker lists these plus primaryStore itself (marked
  // "Current").
  alternativeStores: NearbyStore[];
  onConfirmMove: () => void;
  onModifyLocation: (storeId: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // There's genuinely nothing to switch to — GPS found only this one
  // registered store nearby (the 100m single-store rule). The ribbon still
  // shows "Seems you are at X", just without a "Modify Location" button
  // that would otherwise open onto an empty list.
  const hasAlternatives = alternativeStores.length > 0;

  // Closes the dropdown on an outside tap/click, without needing a
  // full-screen backdrop — the small list sits right under the ribbon
  // instead of as a bottom sheet, so a tap anywhere else on the page
  // should just dismiss it.
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
  // re-check lands while the dropdown happens to be open) avoids it
  // showing a now-stale set of stores.
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryStore.store_id, alternativeStores.length]);

  const allCandidates = [primaryStore, ...alternativeStores];
  const moved = !!pendingMoveStore;

  return (
    <div ref={containerRef} className="sticky top-0 z-30 -mx-6 w-[calc(100%+3rem)] sm:-mx-8 sm:w-[calc(100%+4rem)]">
      {/* The ribbon itself — bleeds edge-to-edge within AppPage's padded
          card (negative margins cancel the card's own p-6/sm:p-8) so it
          reads as a banner pinned to the top of the screen rather than a
          box floating inside the content, the whole time the Check Price
          tab is open. */}
      <div
        className={`flex w-full items-center justify-between gap-3 border-b border-correction-dark/20 px-4 py-3 text-left shadow-sm transition-colors mb-4 ${
          moved ? "correction-flash-bar" : "bg-correction"
        }`}
      >
        <button
          type="button"
          onClick={() => !moved && hasAlternatives && setOpen((o) => !o)}
          disabled={moved || !hasAlternatives}
          className={`flex min-w-0 flex-1 items-start gap-2 text-left ${!moved && hasAlternatives ? "cursor-pointer" : "cursor-default"}`}
        >
          <MapPin size={18} strokeWidth={2.5} className="mt-1 shrink-0 text-white" />
          <span className="flex min-w-0 flex-col">
            {moved ? (
              <>
                <span className="font-display text-sm font-semibold text-white">{t("Seems you have moved to")}</span>
                {/* Store name — significantly larger and bolder than the
                    rest of the ribbon's text, by request. */}
                <span className="truncate font-display text-xl font-extrabold leading-tight text-white">
                  {pendingMoveStore!.store_name}
                </span>
              </>
            ) : (
              <>
                <span className="font-display text-sm font-semibold text-white">{t("Seems you are at")}</span>
                <span className="truncate font-display text-xl font-extrabold leading-tight text-white">
                  {primaryStore.store_name}
                </span>
              </>
            )}
          </span>
        </button>

        {moved ? (
          <button
            type="button"
            onClick={onConfirmMove}
            className="shrink-0 whitespace-nowrap self-center rounded-full bg-blue-900 px-3.5 py-1.5 font-display text-sm font-bold text-white transition-colors active:bg-blue-950"
          >
            {t("Confirm")}
          </button>
        ) : (
          hasAlternatives && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="shrink-0 whitespace-nowrap self-center rounded-full bg-blue-900 px-3.5 py-1.5 font-display text-sm font-bold text-white transition-colors active:bg-blue-950"
            >
              {t("Modify Location")}
            </button>
          )
        )}
      </div>

      {open && !moved && hasAlternatives && (
        // A small dropdown anchored right under the ribbon, not a
        // full-screen bottom sheet — by request, so picking the right
        // store never needs scrolling the page to find it.
        <div className="max-h-64 overflow-y-auto rounded-b-lg border-x border-b border-line bg-field-raised px-2 py-2 shadow-lg">
          <ul className="flex flex-col gap-1">
            {allCandidates.map((s) => {
              const isCurrent = s.store_id === primaryStore.store_id;
              return (
                <li key={s.store_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onModifyLocation(s.store_id);
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
