"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow, type StoreRating } from "@/components/search/ResultRow";
import { EmojiRating } from "@/components/shared/EmojiRating";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { FreeTextSearch } from "@/components/check-price/FreeTextSearch";
import { searchProducts, findNearestStore, reportPrice, type SearchResponse, type SearchResult } from "@/lib/api";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { AppPage } from "@/components/shared/AppPage";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { displayProductName } from "@/lib/productName";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

const TIER_LABEL: Record<string, string> = {
  neighborhood: "neighborhood zone",
  town: "town zone",
  city: "city zone"
};

const AT_STORE_METERS = 150;

// Next.js unmounts this whole screen on client-side navigation (e.g.
// tapping a store to open /store/[id]), and this component's search
// results only ever lived in local React state — so pressing the back
// button from the store page always returned to a freshly-reset, empty
// menu/search screen instead of the results list the shopper was just
// looking at. Caching the last result in sessionStorage (cleared when the
// app/tab session ends) lets it be restored on remount instead.
//
// Keyed PER SCREEN (by initialMode — "menu" for /check-price, "text" for
// /search-items): this component backs both screens, and a single shared
// key meant a Check Price result was still sitting there when you then
// went to Search items, making that screen look "stuck" showing the other
// screen's result instead of starting fresh. Each screen now only ever
// restores its own last result.
function searchCacheKey(mode: Mode): string {
  return `pricebook:lastSearchResult:${mode}`;
}
const SEARCH_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min — long enough to survive a store detour, short enough prices don't go stale

type Mode = "menu" | "text";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

// One "best price" callout — used for both the nearby-best and city-wide-
// best results. Carries its own map link and price-accuracy report buttons
// so a shopper never has to scroll to the table below to act on either.
function PriceCallout({
  label,
  result,
  rating,
  isNativeApp = false
}: {
  label: string;
  result: SearchResult;
  rating?: StoreRating;
  isNativeApp?: boolean;
}) {
  const { t } = useLanguage();
  const [reported, setReported] = useState<"correct_price" | "wrong_price" | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);

  async function handleReport(type: "correct_price" | "wrong_price") {
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      await reportPrice({
        store_id: result.store_id,
        product_id: result.product_id,
        report_type: type,
        accessToken: data.session.access_token
      });
      setReported(type);
    } finally {
      setBusy(false);
    }
  }

  // Inside the packaged app: a dark card matching the "you are at this
  // store" treatment, with a large mono price front and center. On the
  // website (isNativeApp === false) this renders the original light-green
  // callout box, unchanged from before the app-only redesign.
  if (isNativeApp) {
    return (
      <div className="mb-3 rounded-lg bg-ink px-4 py-3.5 text-field">
        <p className="font-mono text-[10px] uppercase tracking-wide text-field/50">{label}</p>
        <p className="mt-1 text-sm">
          <strong className="text-field">{result.product_name}</strong>
        </p>
        <p className="mt-1 font-mono text-2xl text-[#7FE0AE]">
          {result.price.toFixed(2)} <span className="text-sm text-field/60">{result.currency}</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-field/60">
          <Link href={`/store/${result.store_id}`} className="underline">
            {result.store_name}
          </Link>
          · {formatDistance(result.distance_m)}
          {rating && <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={15} showValue={false} />}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-[#7FE0AE] underline"
          >
            {t("Open in Maps")}
          </a>
          <Link href={`/store/${result.store_id}`} className="text-field underline">
            {t("Visit Store Page")}
          </Link>
          {reported ? (
            <span className="font-mono text-[11px] text-[#7FE0AE]">
              {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
            </span>
          ) : (
            <>
              <span className="text-field/60">{t("Is this price accurate?")}</span>
              <button disabled={busy} onClick={() => handleReport("correct_price")} className="text-[#7FE0AE] underline">
                {t("Yes")}
              </button>
              <button disabled={busy} onClick={() => handleReport("wrong_price")} className="text-red-300 underline">
                {t("No, it was higher in store")}
              </button>
            </>
          )}
          {result.nutrition_facts && (
            <button onClick={() => setShowNutrition((s) => !s)} className="text-field underline">
              {showNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
            </button>
          )}
        </div>
        {showNutrition && result.nutrition_facts && (
          <div className="mt-2 rounded bg-white/10 px-3 py-2">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-field/60">
              {t("AI estimate — check the actual package")}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-field">
              {result.nutrition_facts.serving_size && (
                <span>
                  {t("Serving size")}: <strong>{result.nutrition_facts.serving_size}</strong>
                </span>
              )}
              {result.nutrition_facts.calories != null && (
                <span>
                  {t("Calories")}: <strong>{result.nutrition_facts.calories}</strong>
                </span>
              )}
              {result.nutrition_facts.protein_g != null && (
                <span>
                  {t("Protein (g)")}: <strong>{result.nutrition_facts.protein_g}</strong>
                </span>
              )}
              {result.nutrition_facts.fat_g != null && (
                <span>
                  {t("Fat (g)")}: <strong>{result.nutrition_facts.fat_g}</strong>
                </span>
              )}
              {result.nutrition_facts.carbs_g != null && (
                <span>
                  {t("Carbs (g)")}: <strong>{result.nutrition_facts.carbs_g}</strong>
                </span>
              )}
              {result.nutrition_facts.sugar_g != null && (
                <span>
                  {t("Sugar (g)")}: <strong>{result.nutrition_facts.sugar_g}</strong>
                </span>
              )}
              {result.nutrition_facts.sodium_mg != null && (
                <span>
                  {t("Sodium (mg)")}: <strong>{result.nutrition_facts.sodium_mg}</strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded border border-ink/25 bg-ink/[0.07] px-4 py-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
        <span>
          <strong>{result.product_name}</strong> — {label}: <strong>{result.price.toFixed(2)} {result.currency}</strong> at{" "}
          <Link href={`/store/${result.store_id}`} className="underline">
            {result.store_name}
          </Link>{" "}
          ({formatDistance(result.distance_m)} away).
        </span>
        {rating && <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={16} showValue={false} />}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
          target="_blank"
          rel="noreferrer"
          className="text-ink underline hover:text-ink/80"
        >
          {t("Open in Maps")}
        </a>
        <Link href={`/store/${result.store_id}`} className="text-ink underline hover:text-ink/80">
          {t("Visit Store Page")}
        </Link>
        {reported ? (
          <span className="font-mono text-[11px] text-value">
            {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
          </span>
        ) : (
          <>
            <span className="text-ash">{t("Is this price accurate?")}</span>
            <button disabled={busy} onClick={() => handleReport("correct_price")} className="text-ink underline hover:text-ink/80">
              {t("Yes")}
            </button>
            <button disabled={busy} onClick={() => handleReport("wrong_price")} className="text-value underline hover:text-value/80">
              {t("No")}
            </button>
          </>
        )}
        {result.nutrition_facts && (
          <button onClick={() => setShowNutrition((s) => !s)} className="text-ink underline hover:text-ink/80">
            {showNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
          </button>
        )}
      </div>
      {showNutrition && result.nutrition_facts && (
        <div className="mt-2 rounded border border-ink/20 bg-white/60 px-3 py-2">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ash">
            {t("AI estimate — check the actual package")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
            {result.nutrition_facts.serving_size && (
              <span>
                {t("Serving size")}: <strong>{result.nutrition_facts.serving_size}</strong>
              </span>
            )}
            {result.nutrition_facts.calories != null && (
              <span>
                {t("Calories")}: <strong>{result.nutrition_facts.calories}</strong>
              </span>
            )}
            {result.nutrition_facts.protein_g != null && (
              <span>
                {t("Protein (g)")}: <strong>{result.nutrition_facts.protein_g}</strong>
              </span>
            )}
            {result.nutrition_facts.fat_g != null && (
              <span>
                {t("Fat (g)")}: <strong>{result.nutrition_facts.fat_g}</strong>
              </span>
            )}
            {result.nutrition_facts.carbs_g != null && (
              <span>
                {t("Carbs (g)")}: <strong>{result.nutrition_facts.carbs_g}</strong>
              </span>
            )}
            {result.nutrition_facts.sugar_g != null && (
              <span>
                {t("Sugar (g)")}: <strong>{result.nutrition_facts.sugar_g}</strong>
              </span>
            )}
            {result.nutrition_facts.sodium_mg != null && (
              <span>
                {t("Sodium (mg)")}: <strong>{result.nutrition_facts.sodium_mg}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Shown in place of the search box the moment a search is submitted, so the
// box (and any previous result) disappears immediately rather than sitting
// there looking unresponsive while the request is in flight.
function SearchingIndicator() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-field-raised px-4 py-3 text-sm text-ash">
      <span>{t("Searching…")}</span>
      <span className="flex items-end gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-value" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-value" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-value" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}

// Powers both /check-price (camera, upload, or type it in — starts on the
// three-button menu) and /search-items (starts straight on the type-it-in
// form, since that's the whole point of that tab). Kept as one component so
// the search/results logic — and the "you're at this store" detection —
// only exists in one place.
export function CheckPriceExperience({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const { coords, status } = useGeolocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [showAtStoreNutrition, setShowAtStoreNutrition] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationCheck, setLocationCheck] = useState<
    { store: { store_id: string; store_name: string; store_photo_url: string | null; distance_m: number } | null } | null
  >(null);
  const [checkPriceRevealed, setCheckPriceRevealed] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [useGuidedForm, setUseGuidedForm] = useState(false);
  const [sortMode, setSortMode] = useState<"price" | "distance">("price");
  // This screen's own per-store review summary cache (average emoji rating
  // + count), keyed by store_id — fetched once per result set, in a single
  // batched request for every store on screen, rather than one request per
  // row (a result set can list dozens of different stores at once).
  const [ratings, setRatings] = useState<Record<string, StoreRating>>({});
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Restore this screen's own last results on remount (see the cache
  // comment above initialMode's screen — Check Price vs Search items never
  // read each other's cached result).
  useEffect(() => {
    try {
      const key = searchCacheKey(initialMode);
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const cached = JSON.parse(raw) as { result: SearchResponse; savedAt: number };
      if (Date.now() - cached.savedAt > SEARCH_CACHE_MAX_AGE_MS) {
        sessionStorage.removeItem(key);
        return;
      }
      setResult(cached.result);
      // A restored result implies "Check Price" was already pressed and a
      // method already chosen — without this, the "Check Price" menu
      // button re-appears ABOVE the old result on remount (checkPriceRevealed
      // resets to false on every fresh mount), so it looked like two
      // screens stacked on top of each other rather than one clear result.
      setCheckPriceRevealed(true);
      setMode("menu");
    } catch {
      // corrupt or unavailable storage — just start fresh
    }
    // Only ever run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep this screen's own cache slot in sync with whatever's currently on
  // screen — a null result (new search starting, or "start new check")
  // clears it immediately, so it can never resurface a stale result later.
  useEffect(() => {
    try {
      const key = searchCacheKey(initialMode);
      if (result) {
        sessionStorage.setItem(key, JSON.stringify({ result, savedAt: Date.now() }));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // storage full/unavailable — the list just won't survive a back-navigation this time
    }
  }, [result, initialMode]);

  // `silent` skips the "Finding your location…" flash and the locationCheck
  // reset — used by the 30-second background refresh below, so the panel
  // just quietly swaps to the new answer instead of blanking out and
  // reloading every half minute.
  async function handleFindMyLocation(silent = false) {
    if (!silent) {
      setLocating(true);
      setLocationCheck(null);
    }
    try {
      if (!coords) {
        if (!silent) setError(t("Turn on location so we can tell where you are."));
        return;
      }
      const store = await findNearestStore(coords.lat, coords.lng);
      setLocationCheck({ store });
    } catch (e: any) {
      if (!silent) setError(e.message ?? "Couldn't check your location.");
    } finally {
      if (!silent) setLocating(false);
    }
  }

  // Runs the location check automatically as soon as a fix is available —
  // only on the Check Price tab (the Search items tab has no "what store am
  // I at" concept at all) and only once per result, so it doesn't refire on
  // every subsequent position update from watchPosition.
  useEffect(() => {
    if (initialMode !== "menu") return;
    if (!coords || locationCheck || locating) return;
    handleFindMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, initialMode, locationCheck, locating]);

  // Keeps "you are at [store]" current while the panel is on screen —
  // someone can easily walk from an unregistered spot into a store (or the
  // other way round) over the course of a minute without ever tapping
  // anything, so this re-checks on its own rather than requiring a manual
  // refresh.
  useEffect(() => {
    if (initialMode !== "menu" || checkPriceRevealed) return;
    const id = setInterval(() => {
      if (coords) handleFindMyLocation(true);
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, checkPriceRevealed, coords]);

  // Explicit reset for "Start a new check": clears the result and every bit
  // of state tied to the last one, and drops back to the Check Price menu
  // (scan/snap/enter details) rather than leaving the old answer showing
  // while the shopper decides how to check a different item.
  function startNewCheck() {
    setResult(null);
    setError(null);
    setLocationCheck(null);
    setUseGuidedForm(false);
    setMode(initialMode);
    setCheckPriceRevealed(true);
  }

  async function runSearch(input: { text?: string; imageBase64?: string; structured?: any; barcode?: string }) {
    if (!coords) {
      setError(t("Turn on location so we can find prices near you."));
      return;
    }
    setBusy(true);
    setError(null);
    // Clear the previous result the moment a new search starts, so the old
    // answer can never sit on screen looking like the new search didn't do
    // anything — the searching indicator below takes its place instead.
    setResult(null);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const res = await searchProducts({
        ...input,
        lat: coords.lat,
        lng: coords.lng,
        accessToken: data.session?.access_token
      });
      setResult(res);
      setMode(initialMode);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageBase64 = await fileToBase64(file);
    runSearch({ imageBase64 });
    e.target.value = "";
  }

  async function handleBarcodeDetected(barcode: string) {
    setShowScanner(false);
    setScanningBarcode(true);
    setError(null);
    try {
      const res = await fetch("/api/products/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode })
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setScanningBarcode(false);
        return;
      }
      if (!data.found) {
        setError(
          t("That barcode isn't in the product database — try Camera or Enter details instead.") +
            ` (${t("Scanned")}: ${data.scanned_barcode ?? barcode})`
        );
        setScanningBarcode(false);
        return;
      }

      // Skips the AI guessing step entirely — the barcode already gives
      // an exact product match, so this goes straight into the normal
      // search pipeline with real, confirmed product details.
      await runSearch({ structured: data.structured, barcode });
    } catch (e: any) {
      setError(`Barcode lookup failed: ${e?.message ?? String(e)}`);
    } finally {
      setScanningBarcode(false);
    }
  }

  const sorted = result?.local_results.length
    ? [...result.local_results].sort((a, b) =>
        sortMode === "price" ? a.price - b.price : a.distance_m - b.distance_m
      )
    : [];
  // Identifies the single cheapest row, not just the cheapest store — a
  // store can now show more than one row (different products matching the
  // same partial-name search), so "store_id" alone could mark more than
  // one row as "cheapest" even when only one of them actually is.
  const cheapestKey =
    sorted.length > 0
      ? (() => {
          const min = sorted.reduce((m, r) => (r.price < m.price ? r : m), sorted[0]);
          return `${min.store_id}::${min.product_id}`;
        })()
      : null;
  const atStore = sorted.find((r) => r.distance_m <= AT_STORE_METERS) ?? null;
  // Always show the full list of every store carrying the item — it used
  // to be hidden behind a "See best prices nearby too" link whenever you
  // were detected as standing at a store, but the shopper should be able
  // to see item name, "you are at this store," nearby best, city best, and
  // the full comparison list (with sorting) all at once, not have to ask
  // for the list.
  const tableRows = sorted;

  // Fetch review summaries for every store on screen in one batched
  // request, whenever the result set changes — covers the comparison
  // table, both "best price" callouts, and the "you're at this store"
  // panel, all of which show a store name and can each name a different
  // store.
  useEffect(() => {
    const ids = new Set<string>();
    for (const r of sorted) ids.add(r.store_id);
    if (result?.near_best) ids.add(result.near_best.store_id);
    if (result?.city_best) ids.add(result.city_best.store_id);
    if (ids.size === 0) {
      setRatings({});
      return;
    }
    let cancelled = false;
    fetch("/api/stores/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_ids: Array.from(ids) })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setRatings(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Only worth calling out the city-wide best when it's actually a
  // different store than the nearby best — otherwise it's the same
  // information said twice.
  const cityBestDiffersFromNear =
    result?.city_best && (!result.near_best || result.city_best.store_id !== result.near_best.store_id);

  // Scan / Snap / Enter details are the secondary actions on this screen —
  // neutral at rest (border-line/bg-field-raised), darkening to solid ink on
  // hover/press — matching Manage Inventory's buttons, on both the website
  // and the app.
  const outlineButton = isNativeApp
    ? "flex-1 rounded-xl border border-line bg-field px-4 py-3.5 font-display text-[14px] font-medium text-ink shadow-sm transition active:scale-[0.98] active:border-ink active:bg-ink-dark active:text-white"
    : "flex-1 rounded border border-line bg-field px-4 py-3 font-display text-[15px] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white active:border-ink active:bg-ink-dark active:text-white";

  return (
    <AppPage>
      <p className="mb-4 text-sm font-bold text-ink">{t("Track best prices, near you first.")}</p>

      {mode === "menu" && !checkPriceRevealed && (
        // The main action on this screen — clicking it hides the automatic
        // location panel below and reveals Scan/Snap/Enter details.
        <button
          onClick={() => setCheckPriceRevealed(true)}
          className={
            isNativeApp
              ? "btn-shine mb-6 w-full rounded-xl bg-ink px-4 py-6 font-display text-[20px] font-bold text-white shadow-md transition active:scale-[0.98] active:bg-ink-dark"
              : "btn-shine mb-6 w-full rounded border border-line bg-field px-4 py-6 font-display text-[20px] font-bold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white active:border-ink active:bg-ink-dark active:text-white"
          }
        >
          {t("Check Price & Compare")}
        </button>
      )}

      {/* Automatic location panel — Check Price tab only, and hidden the
          moment "Check Price & Compare" is pressed (checkPriceRevealed). No
          button to trigger this anymore: it runs on its own as soon as a
          location fix is available. */}
      {initialMode === "menu" && !checkPriceRevealed && (
        <div className="-mt-3 mb-6">
          {status === "denied" ? (
            <p className="rounded border border-flag/30 bg-flag/10 px-3 py-2 text-sm text-flag">
              {t("Turn on location services so the app can find the store you are at and help you compare prices")}
            </p>
          ) : locationCheck ? (
            <>
              {locationCheck.store?.store_photo_url ? (
                // The store's own front photo — the more recognizable,
                // "yes, that's the shop I'm standing in front of" signal —
                // takes priority over the map whenever the store has one.
                <div className="overflow-hidden rounded border border-line">
                  <img
                    src={locationCheck.store.store_photo_url}
                    alt={locationCheck.store.store_name}
                    className="h-[220px] w-full object-cover"
                  />
                </div>
              ) : (
                coords && (
                  <div className="overflow-hidden rounded border border-line">
                    <iframe
                      title={t("Your location")}
                      width="100%"
                      height="220"
                      style={{ border: 0 }}
                      loading="lazy"
                      src={`https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&t=k&output=embed`}
                    />
                  </div>
                )
              )}
              <p className={`text-center text-sm text-ink ${coords ? "bg-field-raised px-3 py-2" : ""}`}>
                {locationCheck.store ? (
                  <>
                    {t("You are at")} <strong>{locationCheck.store.store_name}</strong>
                  </>
                ) : coords ? (
                  t("You are at an unregistered location")
                ) : (
                  t("Couldn't determine your location.")
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-ash">{t("Finding your location…")}</p>
          )}
        </div>
      )}

      {mode === "menu" && checkPriceRevealed && !busy && !scanningBarcode && (
        <>
          <div className={isNativeApp ? "mb-3 grid grid-cols-2 gap-2" : "mb-3 flex flex-col gap-2 sm:flex-row"}>
            <button onClick={() => setShowScanner(true)} className={outlineButton}>
              {t("Scan Barcode")}
            </button>
            <button onClick={() => cameraInputRef.current?.click()} className={outlineButton}>
              {t("Snap")}
            </button>
            <button onClick={() => setMode("text")} className={`${outlineButton}${isNativeApp ? " col-span-2" : ""}`}>
              {t("Enter details")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCheckPriceRevealed(false)}
            className="mb-6 inline-flex items-center gap-1 rounded border border-line bg-field px-3 py-1.5 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value-soft active:border-value active:bg-value-soft"
          >
            {t("Back")}
          </button>
        </>
      )}
      {scanningBarcode && <p className="mb-6 text-sm text-ash">{t("Reading barcode…")}</p>}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />}

      {mode === "text" && !useGuidedForm && (
        <div className="flex flex-col gap-2">
          {busy ? (
            <SearchingIndicator />
          ) : (
            <>
              <FreeTextSearch onSubmit={(text) => runSearch({ text })} busy={busy} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUseGuidedForm(true)}
                  className="text-sm text-value underline hover:text-value/80"
                >
                  {t("Or choose from categories instead")}
                </button>
                {initialMode === "menu" && (
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="text-sm text-ash underline hover:text-ink"
                  >
                    {t("Cancel")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {mode === "text" && useGuidedForm && (
        <div className="flex flex-col gap-2">
          {busy ? (
            <SearchingIndicator />
          ) : (
            <>
              <GuidedTextEntry
                onSubmit={(structured) => runSearch({ structured })}
                onCancel={() => (initialMode === "menu" ? setMode("menu") : router.push("/check-price"))}
              />
              <button
                type="button"
                onClick={() => setUseGuidedForm(false)}
                className="self-start text-sm text-value underline hover:text-value/80"
              >
                {t("Back to search bar")}
              </button>
            </>
          )}
        </div>
      )}

      {busy && mode !== "text" && <p className="mt-3 text-sm text-ash">{t("Searching…")}</p>}
      {error && <p className="mt-3 text-sm text-flag">{t(error)}</p>}

      {result && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">
              {displayProductName(result.query.brand, result.query.product_name)}
            </h2>
            <div className="flex items-center gap-2">
              {result.tier && (
                <span className="font-mono text-xs uppercase tracking-wide text-ash">
                  {t(TIER_LABEL[result.tier] ?? result.tier)}
                </span>
              )}
              <button
                type="button"
                onClick={startNewCheck}
                className="whitespace-nowrap rounded border border-line bg-field px-3 py-1.5 font-display text-sm text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white active:border-ink active:bg-ink-dark active:text-white"
              >
                {t("Start new check")}
              </button>
            </div>
          </div>

          {sorted.length === 0 && (
            <p className="text-sm text-ash">
              {t("No store nearby carries this yet.")}
              {result.web_estimate?.source_url && (
                <>
                  {" "}
                  {t("Reference:")}{" "}
                  <a className="underline" href={result.web_estimate.source_url} target="_blank" rel="noreferrer">
                    {t("see online")}
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {atStore && isNativeApp && (
            <div className="mb-4 rounded-lg bg-ink px-4 py-3 text-field">
              <p className="text-xs text-field/60">{t("You're at")}</p>
              <p className="flex flex-wrap items-center gap-1.5 font-display text-[16px] font-bold">
                {atStore.store_name}
                {ratings[atStore.store_id] && (
                  <EmojiRating
                    rating={ratings[atStore.store_id].count > 0 ? ratings[atStore.store_id].average_rating : null}
                    count={ratings[atStore.store_id].count}
                    size={16}
                    showValue={false}
                  />
                )}
              </p>
              <p className="mt-1 font-mono text-xl text-[#7FE0AE]">
                {atStore.price.toFixed(2)} <span className="font-sans text-xs text-field/60">{atStore.currency}</span>
              </p>
              <Link href={`/store/${atStore.store_id}`} className="mt-1 inline-block text-sm text-[#7FE0AE] underline">
                {t("Visit Store Page")}
              </Link>
              {atStore.nutrition_facts && (
                <button
                  onClick={() => setShowAtStoreNutrition((s) => !s)}
                  className="mt-2 text-sm text-field/80 underline hover:text-field"
                >
                  {showAtStoreNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
                </button>
              )}
              {showAtStoreNutrition && atStore.nutrition_facts && (
                <div className="mt-2 rounded bg-white/10 px-3 py-2">
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-field/60">
                    {t("AI estimate — check the actual package")}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-field">
                    {atStore.nutrition_facts.serving_size && (
                      <span>
                        {t("Serving size")}: <strong>{atStore.nutrition_facts.serving_size}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.calories != null && (
                      <span>
                        {t("Calories")}: <strong>{atStore.nutrition_facts.calories}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.protein_g != null && (
                      <span>
                        {t("Protein (g)")}: <strong>{atStore.nutrition_facts.protein_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.fat_g != null && (
                      <span>
                        {t("Fat (g)")}: <strong>{atStore.nutrition_facts.fat_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.carbs_g != null && (
                      <span>
                        {t("Carbs (g)")}: <strong>{atStore.nutrition_facts.carbs_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.sugar_g != null && (
                      <span>
                        {t("Sugar (g)")}: <strong>{atStore.nutrition_facts.sugar_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.sodium_mg != null && (
                      <span>
                        {t("Sodium (mg)")}: <strong>{atStore.nutrition_facts.sodium_mg}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {atStore && !isNativeApp && (
            <div className="mb-4 rounded border border-ink/25 bg-ink/[0.07] px-4 py-3">
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                <span>
                  <strong>{atStore.product_name}</strong> — You are at <strong>{atStore.store_name}</strong> — the price here is{" "}
                  <strong>{atStore.price.toFixed(2)} {atStore.currency}</strong>.
                </span>
                {ratings[atStore.store_id] && (
                  <EmojiRating
                    rating={ratings[atStore.store_id].count > 0 ? ratings[atStore.store_id].average_rating : null}
                    count={ratings[atStore.store_id].count}
                    size={16}
                    showValue={false}
                  />
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Link href={`/store/${atStore.store_id}`} className="text-sm text-ink underline hover:text-ink/80">
                  {t("Visit Store Page")}
                </Link>
                {atStore.nutrition_facts && (
                  <button
                    onClick={() => setShowAtStoreNutrition((s) => !s)}
                    className="text-sm text-ink underline hover:text-ink/80"
                  >
                    {showAtStoreNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
                  </button>
                )}
              </div>
              {showAtStoreNutrition && atStore.nutrition_facts && (
                <div className="mt-2 rounded border border-ink/20 bg-white/60 px-3 py-2">
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ash">
                    {t("AI estimate — check the actual package")}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
                    {atStore.nutrition_facts.serving_size && (
                      <span>
                        {t("Serving size")}: <strong>{atStore.nutrition_facts.serving_size}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.calories != null && (
                      <span>
                        {t("Calories")}: <strong>{atStore.nutrition_facts.calories}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.protein_g != null && (
                      <span>
                        {t("Protein (g)")}: <strong>{atStore.nutrition_facts.protein_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.fat_g != null && (
                      <span>
                        {t("Fat (g)")}: <strong>{atStore.nutrition_facts.fat_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.carbs_g != null && (
                      <span>
                        {t("Carbs (g)")}: <strong>{atStore.nutrition_facts.carbs_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.sugar_g != null && (
                      <span>
                        {t("Sugar (g)")}: <strong>{atStore.nutrition_facts.sugar_g}</strong>
                      </span>
                    )}
                    {atStore.nutrition_facts.sodium_mg != null && (
                      <span>
                        {t("Sodium (mg)")}: <strong>{atStore.nutrition_facts.sodium_mg}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.near_best && (
            <PriceCallout
              label={t("Best price within 5km")}
              result={result.near_best}
              rating={ratings[result.near_best.store_id]}
              isNativeApp={isNativeApp}
            />
          )}
          {cityBestDiffersFromNear && result.city_best && (
            <PriceCallout
              label={t("Best price in the whole city")}
              result={result.city_best}
              rating={ratings[result.city_best.store_id]}
              isNativeApp={isNativeApp}
            />
          )}

          {tableRows.length > 1 && (
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-ash">{t("Sort by")}:</span>
              <button
                onClick={() => setSortMode("price")}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  sortMode === "price" ? "bg-ink text-white" : "border border-line bg-field text-ink hover:bg-ink hover:text-white"
                }`}
              >
                {t("Best price")}
              </button>
              <button
                onClick={() => setSortMode("distance")}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  sortMode === "distance" ? "bg-ink text-white" : "border border-line bg-field text-ink hover:bg-ink hover:text-white"
                }`}
              >
                {t("Nearest")}
              </button>
            </div>
          )}

          {tableRows.length > 0 && isNativeApp && (
            <div className="flex flex-col gap-2">
              {tableRows.map((r) => (
                <ResultRow
                  key={r.store_id + r.product_id}
                  result={r}
                  isCheapest={`${r.store_id}::${r.product_id}` === cheapestKey}
                  rating={ratings[r.store_id]}
                  variant="card"
                />
              ))}
            </div>
          )}

          {tableRows.length > 0 && !isNativeApp && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th>{t("Store")}</th>
                  <th className="num">{t("Distance")}</th>
                  <th className="num">{t("Price")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <ResultRow
                    key={r.store_id + r.product_id}
                    result={r}
                    isCheapest={`${r.store_id}::${r.product_id}` === cheapestKey}
                    rating={ratings[r.store_id]}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </AppPage>
  );
}
