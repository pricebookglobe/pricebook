"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow, SaveBadge, ItemName, type StoreRating } from "@/components/search/ResultRow";
import { EmojiRating } from "@/components/shared/EmojiRating";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { FreeTextSearch } from "@/components/check-price/FreeTextSearch";
import { searchProducts, findNearestStore, reportPrice, type SearchResponse, type SearchResult } from "@/lib/api";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { AppPage } from "@/components/shared/AppPage";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { displayProductName, formatSizeTag } from "@/lib/productName";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

const TIER_LABEL: Record<string, string> = {
  neighborhood: "neighborhood zone",
  town: "town zone",
  city: "city zone"
};

// Kept in step with find_nearest_store's own max_meters (see
// supabase/migrations/0030_nearest_store_tighter.sql) so a store counts as
// "you're here" the same way everywhere in the app. Lowered from 100 to 20:
// 100m was wide enough to sweep in an entire row of closely-packed stores
// (reported case: ~10 storefronts, each only ~5m wide, side by side) and
// meant "you're here" was really "you're somewhere along this block,"
// decided by whichever store happened to be cheapest or first in the
// result list rather than which one was actually nearest. 20m is still
// generous next to typical outdoor GPS accuracy (5-15m) while no longer
// spanning several doors down the row.
const AT_STORE_METERS = 20;

// Haversine distance in meters — module-level (not re-declared per effect)
// so both the live "which store am I at" calculation below and the
// background polling effect can share one implementation.
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// This component used to cache its last result in sessionStorage (keyed
// per screen — "menu" for /check-price, "text" for /search-items) and
// restore it on remount, so returning from a store page didn't lose the
// list you were just looking at. Per request, Check Price and Search
// Items now always start clean on every visit instead — this key is kept
// only so a fresh mount can explicitly drop any old cached entry still
// sitting there from before that change.
function searchCacheKey(mode: Mode): string {
  return `pricebook:lastSearchResult:${mode}`;
}

// Snap hands off to Android's own camera app via <input capture="environment">,
// which backgrounds this page for however long the camera is open. Under
// memory pressure Android can kill the WebView's process while it's in the
// background and recreate it from scratch when the user comes back — a full
// reload that looks exactly like the screen "resetting", and loses the photo
// that was mid-capture with no way to recover it. This flag is set only for
// the few seconds Snap's camera is actually open, so a reload in that narrow
// window can be told apart from an ordinary, deliberate navigation to this
// screen (which should still always start clean) and can land the user back
// at the Scan/Snap/Enter-details menu with a note to retry, instead of all
// the way back at the very first "Check Price & Compare" button.
function snapInFlightKey(mode: Mode): string {
  return `pricebook:snapInFlight:${mode}`;
}

// Same idea as snapInFlightKey, for the camera the barcode scanner opens
// (native app) or the live getUserMedia view (website) — either one can
// end with the same kind of forced reload mid-scan.
function scanInFlightKey(mode: Mode): string {
  return `pricebook:scanInFlight:${mode}`;
}

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
  isNativeApp = false,
  savingsAmount
}: {
  label: string;
  result: SearchResult;
  rating?: StoreRating;
  isNativeApp?: boolean;
  /** How much cheaper this result is than what the shopper would otherwise
   *  pay (their current store if detected, else the priciest nearby
   *  match) — undefined/omitted hides the line entirely. */
  savingsAmount?: number;
}) {
  const { t } = useLanguage();
  const [reported, setReported] = useState<"correct_price" | "wrong_price" | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);

  // The [75g]-style size tag, placed right after the name's last word by
  // ItemName (which also hard-wraps the name at three words per line).
  const sizeTag = formatSizeTag(result.size, result.unit);

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
        {/* Item name — wrapped at three words per line, size tag after the
            last word. Nutrition facts now sits beside Open in Maps below,
            not here. */}
        <strong className="mt-1 block text-sm">
          <ItemName name={result.product_name} sizeTag={sizeTag} className="text-field" sizeClassName="text-field/60" />
        </strong>
        {/* Store name — itself the link to the store page — on its own line. */}
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-field/60">
          <Link href={`/store/${result.store_id}`} className="font-medium text-[#7FE0AE] underline">
            {result.store_name}
          </Link>
          · {formatDistance(result.distance_m)}
          {rating && <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={15} showValue={false} />}
        </p>
        {/* Price, on its own line. */}
        <p className="mt-1 font-mono text-2xl text-[#7FE0AE]">
          {t("Price:")} {result.price.toFixed(2)} <span className="text-sm text-field/60">{result.currency}</span>
        </p>
        {savingsAmount != null && <SaveBadge amount={savingsAmount} currency={result.currency} className="mt-1" />}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {reported ? (
            <span className="font-mono text-[11px] text-[#7FE0AE]">
              {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
            </span>
          ) : (
            <>
              <span className="text-field/60">{t("Is this price accurate?")}</span>
              <button
                disabled={busy}
                onClick={() => handleReport("correct_price")}
                className="rounded bg-value px-2 py-1 text-xs font-semibold text-white"
              >
                {t("Yes")}
              </button>
              <button
                disabled={busy}
                onClick={() => handleReport("wrong_price")}
                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
              >
                {t("No")}
              </button>
            </>
          )}
        </div>
        {/* Open in Maps + Nutrition facts, side by side at the bottom of the box. */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#7FE0AE] underline"
          >
            {t("Open in Maps")}
          </a>
          {result.nutrition_facts && (
            <button onClick={() => setShowNutrition((s) => !s)} className="text-sm text-[#7FE0AE] underline">
              {showNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
            </button>
          )}
        </div>
        {!reported && (
          <p className="mt-1 text-[10px] text-field/40">
            {t("Your answer counts toward this store's total price reports and credibility.")}
          </p>
        )}
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
      {/* Item name — wrapped at three words per line, size tag after the
          last word. Nutrition facts now sits beside Open in Maps below,
          not here. */}
      <strong className="block text-sm text-ink">
        <ItemName name={result.product_name} sizeTag={sizeTag} />
      </strong>
      {/* Store name — itself the link to the store page — on its own line. */}
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ash">
        {label}{" "}
        <Link href={`/store/${result.store_id}`} className="font-medium text-ink underline hover:text-ink/80">
          {result.store_name}
        </Link>
        · {formatDistance(result.distance_m)}
        {rating && <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={15} showValue={false} />}
      </p>
      {/* Price, on its own line. */}
      <p className="mt-1 font-mono text-lg text-ink">
        {t("Price:")} <strong>{result.price.toFixed(2)}</strong> <span className="text-xs text-ash">{result.currency}</span>
      </p>
      {savingsAmount != null && <SaveBadge amount={savingsAmount} currency={result.currency} className="mt-1" />}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {reported ? (
          <span className="font-mono text-[11px] text-value">
            {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
          </span>
        ) : (
          <>
            <span className="text-ash">{t("Is this price accurate?")}</span>
            <button
              disabled={busy}
              onClick={() => handleReport("correct_price")}
              className="rounded bg-value px-2 py-1 text-xs font-semibold text-white"
            >
              {t("Yes")}
            </button>
            <button
              disabled={busy}
              onClick={() => handleReport("wrong_price")}
              className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
            >
              {t("No")}
            </button>
          </>
        )}
      </div>
      {/* Open in Maps + Nutrition facts, side by side at the bottom of the box. */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-ink underline hover:text-ink/80"
        >
          {t("Open in Maps")}
        </a>
        {result.nutrition_facts && (
          <button onClick={() => setShowNutrition((s) => !s)} className="text-sm text-ink underline hover:text-ink/80">
            {showNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
          </button>
        )}
      </div>
      {!reported && (
        <p className="mt-1 text-[10px] text-ash/70">
          {t("Your answer counts toward this store's total price reports and credibility.")}
        </p>
      )}
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
  const { coords, accuracy, status } = useGeolocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationCheck, setLocationCheck] = useState<
    {
      store: {
        store_id: string;
        store_name: string;
        store_photo_url: string | null;
        store_lat: number;
        store_lng: number;
        distance_m: number;
      } | null;
    } | null
  >(null);
  const [checkPriceRevealed, setCheckPriceRevealed] = useState(false);

  // Mirror of the latest coords for the background polling effect below to
  // read without being in its dependency array — that effect manages its
  // own timer loop and must NOT restart every time a new GPS fix comes in,
  // or it would tear down and recreate its timer on every single update.
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [useGuidedForm, setUseGuidedForm] = useState(false);
  const [sortMode, setSortMode] = useState<"price" | "distance">("price");
  // This screen's own per-store review summary cache (average emoji rating
  // + count), keyed by store_id — fetched once per result set, in a single
  // batched request for every store on screen, rather than one request per
  // row (a result set can list dozens of different stores at once).
  const [ratings, setRatings] = useState<Record<string, StoreRating>>({});
  const [snapInterrupted, setSnapInterrupted] = useState(false);
  const [scanInterrupted, setScanInterrupted] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Clicking into Check Price or Search Items (both land here fresh on
  // every mount) always starts clean — no previous check or search result
  // left showing, EXCEPT when this mount is actually the Android reload
  // that interrupted an in-flight Snap or barcode scan (see snapInFlightKey
  // / scanInFlightKey above): that case isn't a deliberate revisit, so it
  // skips the clean reset and goes back to the Scan/Snap/Enter-details menu
  // with a note to retry instead.
  useEffect(() => {
    let snapWasInFlight = false;
    let scanWasInFlight = false;
    try {
      snapWasInFlight = localStorage.getItem(snapInFlightKey(initialMode)) === "1";
      scanWasInFlight = localStorage.getItem(scanInFlightKey(initialMode)) === "1";
      localStorage.removeItem(snapInFlightKey(initialMode));
      localStorage.removeItem(scanInFlightKey(initialMode));
      localStorage.removeItem(searchCacheKey(initialMode));
    } catch {
      // storage unavailable — nothing to clear
    }
    if (snapWasInFlight || scanWasInFlight) {
      setCheckPriceRevealed(true);
      setSnapInterrupted(snapWasInFlight);
      setScanInterrupted(scanWasInFlight);
    }
    // Only ever run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const store = await findNearestStore(coords.lat, coords.lng, accuracy);
      setLocationCheck({ store });
    } catch (e: any) {
      if (!silent) setError(e.message ?? "Couldn't check your location.");
    } finally {
      if (!silent) setLocating(false);
    }
  }

  // The background polling effect below only sets up its timer loop once
  // (it must not restart on every coords/locationCheck change — see the
  // comment there), so it can't call handleFindMyLocation directly: that
  // would pin it to the stale coords/accuracy captured on the render the
  // effect first ran. Keeping this ref current on every render lets the
  // long-lived timer always call the latest version instead.
  const handleFindMyLocationRef = useRef(handleFindMyLocation);
  useEffect(() => {
    handleFindMyLocationRef.current = handleFindMyLocation;
  });

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

  // Keeps "you are at [store]" current on its own, on a flat 10-second
  // cadence, the whole time the Check Price tab is open — including while
  // looking at results, not just on the landing panel — so walking from
  // store to store (or out of a store, or into an unregistered spot)
  // updates automatically rather than needing a manual refresh. Previously
  // this slowed to 45s or paused outright once "confidently" at a store and
  // stopped polling at all once results were on screen — for someone
  // testing storefront-by-storefront in a dense row, that read as "I have
  // to tap Check Price again for it to notice I moved." The only thing
  // still skipped is polling while the app is literally not visible
  // (backgrounded/screen locked); that resumes with an immediate check the
  // moment it's visible again.
  useEffect(() => {
    if (initialMode !== "menu") return;

    const POLL_MS = 10000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(tick, POLL_MS);
    }

    async function tick() {
      if (cancelled) return;
      if (document.visibilityState === "visible" && coordsRef.current) {
        await handleFindMyLocationRef.current(true);
      }
      schedule();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") tick();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

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

  // Inside the native app, Snap hands off to @capacitor/camera's own
  // getPhoto() instead of the hidden <input capture> below. That plugin's
  // bridge is DESIGNED to survive the exact scenario that caused the
  // "Snap resets the app" bug (persisting the pending call before handing
  // off to Android's native camera, and resuming it once the WebView
  // reloads) — but real-device testing still shows a full reset with no
  // recovery, so that guarantee isn't holding up in practice (possibly a
  // Capacitor/plugin-version quirk, possibly the process being killed
  // more thoroughly than the bridge expects on some devices). The
  // in-flight flag below is now set on BOTH paths as a result — it's the
  // one mechanism that's actually ours to guarantee, and it has to be in
  // localStorage, not sessionStorage: sessionStorage does not survive a
  // full Android process kill (only disk-backed storage does), so a flag
  // written there was silently gone by the time the app relaunched,
  // which is exactly why the "please try again" recovery banner was
  // never showing — it looked like a clean reset because the one piece of
  // state that would have explained it didn't survive either.
  async function handleSnap() {
    // Clear whatever result is currently on screen the moment Snap is
    // tapped, not just once a new photo comes back — otherwise the old
    // answer keeps showing underneath for the whole time the camera is
    // open (or stays forever if the user backs out without taking a shot).
    setResult(null);
    setError(null);
    setSnapInterrupted(false);
    // The in-flight flag is set here even on the native path: the plugin
    // bridge is supposed to survive an Activity recreation on its own, but
    // a couple of resets have still been seen in practice, so this stays
    // as a safety net either way — it only ever matters if a reload
    // actually happens before the flag is cleared below.
    try {
      localStorage.setItem(snapInFlightKey(initialMode), "1");
    } catch {
      // storage unavailable — the in-flight check is simply skipped
    }
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          quality: 80,
          saveToGallery: false,
          // A modern phone's full-res photo can be 20-50MB raw before
          // base64 even bloats it further — capping the longest edge
          // keeps the capture light on memory right when the app is most
          // likely to get killed for being memory-heavy in the
          // background, and this app only ever needs enough detail to
          // read a price tag or product label, not a full-resolution shot.
          width: 1600
        });
        try {
          localStorage.removeItem(snapInFlightKey(initialMode));
        } catch {
          // storage unavailable — nothing to clear
        }
        if (photo.base64String) runSearch({ imageBase64: photo.base64String });
      } catch (e: any) {
        try {
          localStorage.removeItem(snapInFlightKey(initialMode));
        } catch {
          // storage unavailable — nothing to clear
        }
        // The user backed out of the camera without taking a photo — not
        // an error worth surfacing.
        if (e?.message && !/cancel/i.test(e.message)) {
          setError(t("Couldn't open the camera."));
        }
      }
      return;
    }

    cameraInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    // The camera handed a photo back without this page reloading in
    // between, so the capture completed cleanly — clear the in-flight flag.
    try {
      localStorage.removeItem(snapInFlightKey(initialMode));
    } catch {
      // storage unavailable — nothing to clear
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const imageBase64 = await fileToBase64(file);
    runSearch({ imageBase64 });
    e.target.value = "";
  }

  // Clears the scan-in-flight flag and closes the scanner — used both when
  // a barcode is actually found and when the user backs out without one,
  // so the flag is only ever left set if a reload cuts the scan short.
  function closeScanner() {
    try {
      localStorage.removeItem(scanInFlightKey(initialMode));
    } catch {
      // storage unavailable — nothing to clear
    }
    setShowScanner(false);
  }

  async function handleBarcodeDetected(barcode: string) {
    closeScanner();
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
  // One product image for the whole results screen — not per-row. Every
  // row here is the same searched-for item at a different store, so
  // there's one real photo to show, not several; picks the first one
  // actually set, checking local_results (in whatever order they came
  // back in, not price/distance-sorted) before falling back to the
  // near/city-best callouts, since those can have an image even when
  // local_results is empty.
  const productImageUrl =
    result?.local_results.find((r) => r.image_url)?.image_url ??
    result?.near_best?.image_url ??
    result?.city_best?.image_url ??
    null;
  // The size tag for the top heading — the search query itself usually has
  // no size (a Snap/Scan/typed search rarely specifies one), so this falls
  // back to whichever actual matched listing has one, same priority order
  // as the product image above.
  const topSizeSource =
    result?.query.size != null && result?.query.unit
      ? result.query
      : result?.local_results.find((r) => r.size != null && r.unit) ?? result?.near_best ?? result?.city_best ?? null;
  const topSizeTag = topSizeSource ? formatSizeTag(topSizeSource.size, topSizeSource.unit) : "";
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
  // The store the shopper is actually standing at, picked from LIVE
  // distance to the device's current GPS fix — not r.distance_m, which is
  // a snapshot computed server-side at search time and never updates again
  // on its own, and not sorted's own order (sortMode can be "price", which
  // used to make this silently pick whichever matching store was cheapest
  // across the whole area rather than whichever was actually nearest — in
  // a row of closely-packed stores that meant "You're at" routinely named
  // a store the shopper wasn't standing anywhere near). Recomputing from
  // `coords` on every render means this also updates continuously as the
  // shopper walks, with no polling or manual refresh needed for it at all.
  const atStore = (() => {
    if (!coords || sorted.length === 0) return null;
    let closest: SearchResult | null = null;
    let closestMeters = Infinity;
    for (const r of sorted) {
      const d = distanceMeters(coords, { lat: r.store_lat, lng: r.store_lng });
      if (d <= AT_STORE_METERS && d < closestMeters) {
        closest = r;
        closestMeters = d;
      }
    }
    return closest;
  })();

  // "Save: X" line — compares the cheapest price within 5km of the shopper
  // to the priciest option in that same 5km radius, so the best-price row
  // shows exactly how much choosing it saves versus the worse nearby
  // option. Matching is name-first (never compares two differently-named
  // items — that's the original bug this whole thing started from:
  // "Ultra Bottled Drinking Water" vs "Ultra Multivits & Minerals").
  // Within a name match, size/unit/manufacturer only BLOCK the
  // comparison when both sides actually have a value and it genuinely
  // conflicts — a value present on one side and simply missing on the
  // other does NOT block it. That matters in practice: two merchants
  // independently listing "Snickers" very often won't both have filled
  // in size/manufacturer, and treating "unknown" as a mismatch (an
  // earlier version of this check did, requiring product_id equality,
  // which is per-listing and even stricter) silently blocked the single
  // most common real case — comparing the same well-known item across
  // different stores — rather than just the genuine cross-product bug it
  // was meant to catch. Only shown ("if exist") when there's a real
  // spread between matching items — a single store within 5km, or
  // several at the same price, has nothing meaningful to show.
  function norm(s: string | number | null | undefined): string {
    return s == null ? "" : String(s).trim().toLowerCase();
  }
  function fieldsConflict(a: string, b: string): boolean {
    return a !== "" && b !== "" && a !== b;
  }
  function sameItem(a: SearchResult, b: SearchResult): boolean {
    if (norm(a.product_name) !== norm(b.product_name)) return false;
    if (fieldsConflict(norm(a.size), norm(b.size))) return false;
    if (fieldsConflict(norm(a.unit), norm(b.unit))) return false;
    if (fieldsConflict(norm(a.manufacturer || a.brand), norm(b.manufacturer || b.brand))) return false;
    return true;
  }
  const bestWithin5kmByProduct = (() => {
    // Bucketed by name only — sameItem's size/unit/manufacturer leniency
    // isn't guaranteed transitive (a blank-size listing can match both a
    // 50g one and a 100g one without those two matching each other), so
    // grouping has to go through sameItem() against a chosen "best" row
    // rather than a single shared key standing in for the whole bucket.
    const nameGroups = new Map<string, SearchResult[]>();
    for (const r of sorted) {
      if (r.distance_m > 5000) continue;
      const key = norm(r.product_name);
      const arr = nameGroups.get(key) ?? [];
      arr.push(r);
      nameGroups.set(key, arr);
    }
    const map = new Map<string, { key: string; savings: number }>();
    for (const [name, items] of nameGroups) {
      if (items.length < 2) continue;
      const best = items.reduce((m, r) => (r.price < m.price ? r : m), items[0]);
      const comparable = items.filter((r) => sameItem(r, best));
      if (comparable.length < 2) continue;
      const worst = comparable.reduce((m, r) => (r.price > m.price ? r : m), comparable[0]);
      const savings = worst.price - best.price;
      if (savings > 0) {
        map.set(name, { key: `${best.store_id}::${best.product_id}`, savings });
      }
    }
    return map;
  })();
  function savingsFor(r: SearchResult): number | undefined {
    const entry = bestWithin5kmByProduct.get(norm(r.product_name));
    return entry && entry.key === `${r.store_id}::${r.product_id}` ? entry.savings : undefined;
  }

  // Same "Save: X" idea, for the "Best price within 5km" callout box
  // specifically (result.near_best — the single cheapest match within
  // 5km, independent of the comparison table above). Prefers comparing
  // against what the shopper's currently paying at their detected store
  // (the most meaningful baseline — "you'd save X by going here instead
  // of where you are"); falls back to the priciest match within 5km,
  // same basis as the table's savings line, when there's no detected
  // store to compare against. Every comparison goes through sameItem
  // (same product_id AND same size/unit/manufacturer) — atStore and the
  // 5km list can both contain other, unrelated or differently-sized
  // items from the same search, and comparing across those produced a
  // nonsense "Save" figure.
  const nearBestSavings = (() => {
    const nb = result?.near_best;
    if (!nb) return null;
    const sameProductAtStore = atStore && sameItem(atStore, nb) ? atStore : null;
    if (sameProductAtStore && sameProductAtStore.price > nb.price) {
      return sameProductAtStore.price - nb.price;
    }
    const withinRange = sorted.filter((r) => r.distance_m <= 5000 && sameItem(r, nb));
    if (withinRange.length === 0) return null;
    const worst = withinRange.reduce((m, r) => (r.price > m.price ? r : m), withinRange[0]);
    return worst.price > nb.price ? worst.price - nb.price : null;
  })();
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

  // Scan / Snap / Enter details — on the app, now the same solid shiny-ink
  // treatment as the "Check Price & Compare" button below (rather than a
  // washed-out neutral outline), so every actionable button on this screen
  // reads the same way. The website keeps its own brand-green equivalent.
  const outlineButton = isNativeApp
    ? "btn-shine flex-1 rounded-xl bg-ink px-4 py-3.5 font-display text-[14px] font-medium text-white shadow-md transition active:scale-[0.98] active:bg-ink-dark"
    : "btn-shine flex-1 rounded border border-value bg-value px-4 py-3 font-display text-[15px] text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105";

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
              : "btn-shine mb-6 w-full rounded border border-value bg-value px-4 py-6 font-display text-[20px] font-bold text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105"
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
              {locationCheck.store ? (
                // Registered store: the map is always centered on the
                // SHOPPER's own live GPS position (never the store's saved
                // coordinates — those can be wrong or stale, and showing
                // them here made the map jump to a location the shopper
                // wasn't actually standing at). The store's own front
                // photo sits beside it as the "yes, that's the shop"
                // confirmation instead.
                <div className="grid grid-cols-2 gap-2">
                  <div className="overflow-hidden rounded border border-line">
                    {coords && (
                      <iframe
                        title={t("Your location")}
                        width="100%"
                        height="220"
                        style={{ border: 0 }}
                        loading="lazy"
                        src={`https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&t=k&output=embed`}
                      />
                    )}
                  </div>
                  {locationCheck.store.store_photo_url ? (
                    <div className="overflow-hidden rounded border border-line">
                      <img
                        src={locationCheck.store.store_photo_url}
                        alt={locationCheck.store.store_name}
                        className="h-[220px] w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-[220px] items-center justify-center rounded border border-dashed border-line px-3 text-center text-xs text-ash">
                      {t("This store hasn't added a storefront photo yet.")}
                    </div>
                  )}
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
          {snapInterrupted && (
            <p className="mb-3 rounded border border-flag/30 bg-flag/10 px-3 py-2 text-sm text-flag">
              {t("The camera closed before the photo came back — please try Snap again.")}
            </p>
          )}
          {scanInterrupted && (
            <p className="mb-3 rounded border border-flag/30 bg-flag/10 px-3 py-2 text-sm text-flag">
              {t("The scanner closed before it finished — please try Scan Barcode again.")}
            </p>
          )}
          <div className={isNativeApp ? "mb-3 grid grid-cols-2 gap-2" : "mb-3 flex flex-col gap-2 sm:flex-row"}>
            <button
              onClick={() => {
                // Same reasoning as Snap: clear the old result as soon as
                // the scanner opens, not only once a barcode is found, and
                // set the in-flight flag so a reload mid-scan can be told
                // apart from a deliberate revisit (see scanInFlightKey).
                setResult(null);
                setError(null);
                setScanInterrupted(false);
                try {
                  localStorage.setItem(scanInFlightKey(initialMode), "1");
                } catch {
                  // storage unavailable — the in-flight check is simply skipped
                }
                setShowScanner(true);
              }}
              className={outlineButton}
            >
              {t("Scan Barcode")}
            </button>
            <button onClick={handleSnap} className={outlineButton}>
              {t("Snap")}
            </button>
            <button onClick={() => setMode("text")} className={`${outlineButton}${isNativeApp ? " col-span-2" : ""}`}>
              {t("Enter details")}
            </button>
          </div>
          {/* Back and Start new check share one row — Back on the left,
              Start new check on the right — rather than Start new check
              sitting further down next to the result title, so the two
              "leave this screen" actions read as a pair at a glance. Start
              new check only appears here once a result actually exists. */}
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCheckPriceRevealed(false)}
              className="inline-flex items-center gap-1 rounded border border-flag bg-flag px-3 py-1.5 font-display text-sm text-white transition-colors hover:border-field active:border-ink-dark active:bg-ink-dark"
            >
              {t("Back")}
            </button>
            {result && (
              <button
                type="button"
                onClick={startNewCheck}
                className="btn-shine whitespace-nowrap rounded border border-value bg-value px-3 py-1.5 font-display text-sm text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105"
              >
                {t("Start new check")}
              </button>
            )}
          </div>
        </>
      )}
      {scanningBarcode && <p className="mb-6 text-sm text-ash">{t("Reading barcode…")}</p>}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={closeScanner} />}

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
          {productImageUrl && (
            <img
              src={productImageUrl}
              alt={displayProductName(result.query.brand, result.query.product_name)}
              className="mb-3 h-40 w-40 rounded-lg border border-line bg-field-raised object-cover"
            />
          )}
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">
              <ItemName name={displayProductName(result.query.brand, result.query.product_name)} sizeTag={topSizeTag} />
            </h2>
            <div className="flex items-center gap-2">
              {result.tier && (
                <span className="font-mono text-xs uppercase tracking-wide text-ash">
                  {t(TIER_LABEL[result.tier] ?? result.tier)}
                </span>
              )}
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
                    size={16}
                    showValue={false}
                  />
                )}
              </p>
              <p className="mt-1 font-mono text-xl text-[#7FE0AE]">
                {t("The Price:")} {atStore.price.toFixed(2)} <span className="font-sans text-xs text-field/60">{atStore.currency}</span>
              </p>
              <Link href={`/store/${atStore.store_id}`} className="mt-1 inline-block text-sm text-[#7FE0AE] underline">
                {t("Visit Store Page")}
              </Link>
            </div>
          )}

          {atStore && !isNativeApp && (
            <div className="mb-4 rounded border border-ink/25 bg-ink/[0.07] px-4 py-3">
              <p className="text-xs text-ash">{t("You're at")}</p>
              {/* Store name, beside the review circle/face — no numbers. */}
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-display text-base font-bold text-ink">
                {atStore.store_name}
                {ratings[atStore.store_id] && (
                  <EmojiRating
                    rating={ratings[atStore.store_id].count > 0 ? ratings[atStore.store_id].average_rating : null}
                    size={16}
                    showValue={false}
                  />
                )}
              </p>
              {/* Price, on its own line. */}
              <p className="mt-1 font-mono text-lg text-ink">
                {t("The Price:")} {atStore.price.toFixed(2)} <span className="text-xs text-ash">{atStore.currency}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Link href={`/store/${atStore.store_id}`} className="text-sm text-ink underline hover:text-ink/80">
                  {t("Visit Store Page")}
                </Link>
              </div>
            </div>
          )}

          {result.near_best && (
            <PriceCallout
              label={t("Best price within 5km")}
              result={result.near_best}
              rating={ratings[result.near_best.store_id]}
              isNativeApp={isNativeApp}
              savingsAmount={nearBestSavings ?? undefined}
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
                  sortMode === "price" ? "bg-ink text-white" : "btn-shine border border-value bg-value text-white hover:border-value-soft hover:text-white transition-all duration-200 hover:scale-105"
                }`}
              >
                {t("Best price")}
              </button>
              <button
                onClick={() => setSortMode("distance")}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  sortMode === "distance" ? "bg-ink text-white" : "btn-shine border border-value bg-value text-white hover:border-value-soft hover:text-white transition-all duration-200 hover:scale-105"
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
                  savingsAmount={savingsFor(r)}
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
                  <th>{t("Item")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <ResultRow
                    key={r.store_id + r.product_id}
                    result={r}
                    isCheapest={`${r.store_id}::${r.product_id}` === cheapestKey}
                    savingsAmount={savingsFor(r)}
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
