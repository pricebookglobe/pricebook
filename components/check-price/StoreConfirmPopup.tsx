"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Store } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { NearbyStore } from "@/lib/api";

// A centered "You are at [Store]" popup with Confirm/Modify, on top of
// (not instead of) the existing orange LocationCorrectionBar ribbon — by
// request, the ribbon stays exactly as it already behaves, and this adds
// an explicit modal confirmation for every automatic store resolution the
// shopper hasn't already approved (see CheckPriceExperience's
// confirmPopupStoreId / setAnchor's needsConfirmation option for exactly
// when that is: the first fix of a visit, and any later automatic switch
// to a different store — but NOT a manual "Modify Location" pick, and NOT
// the ribbon's own already-explicit "Seems you have moved to X — Confirm"
// tap, both of which are already a decision the shopper just made).
export function StoreConfirmPopup({
  store,
  alternativeStores,
  onConfirm,
  onPick
}: {
  // The store the popup is currently asking about — the component renders
  // nothing when this is null, so the caller doesn't need its own guard.
  store: NearbyStore | null;
  // Every other registered store currently in range, nearest first — the
  // Modify list shows these plus `store` itself (marked "Current").
  alternativeStores: NearbyStore[];
  // Dismisses the popup, keeping the already-applied anchor as-is.
  onConfirm: () => void;
  // Switches the anchor to a different store AND dismisses the popup —
  // a manual pick, so it's already confirmed and won't re-trigger this
  // popup itself (see setAnchor's needsConfirmation option).
  onPick: (storeId: string) => void;
}) {
  const { t } = useLanguage();
  // Starts on the two-button Confirm/Modify view every time a new store
  // comes in to confirm — reset per `store` via the key prop where this
  // is rendered, rather than tracked here, keeps this component simple
  // and stateless-on-reopen.
  const [picking, setPicking] = useState(false);

  if (!store || typeof document === "undefined") return null;

  const candidates = [store, ...alternativeStores];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-6"
      onClick={onConfirm}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-field p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!picking ? (
          <>
            <div className="flex items-start gap-2.5">
              <MapPin size={20} strokeWidth={2.5} className="mt-0.5 shrink-0 text-correction-dark" />
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-ash">{t("You are at")}</p>
                <p className="truncate font-display text-xl font-extrabold leading-tight text-ink">{store.store_name}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={onConfirm}
                className="btn-shine flex-1 rounded-full bg-blue-900 px-3.5 py-2.5 font-display text-sm font-bold text-white transition-colors active:bg-blue-950"
              >
                {t("Confirm")}
              </button>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex-1 rounded-full border border-line px-3.5 py-2.5 text-center font-display text-sm font-medium text-ash transition-colors hover:bg-field-raised"
              >
                {t("Modify")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 font-display text-sm font-semibold text-ink">{t("Which store are you at?")}</p>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {candidates.map((s) => {
                const isCurrent = s.store_id === store.store_id;
                return (
                  <li key={s.store_id}>
                    <button
                      type="button"
                      onClick={() => onPick(s.store_id)}
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
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-center font-display text-sm text-ash transition-colors hover:bg-field-raised"
            >
              {t("Back")}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
