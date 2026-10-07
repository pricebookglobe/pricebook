"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera as CameraIcon, Image as ImageIcon, Tags as CategoryIcon } from "lucide-react";
import { ImageSourceSheet } from "@/components/shared/ImageSourceSheet";
import { StatusDots, StatusDotsCard } from "@/components/shared/StatusDots";
import { useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow, SaveBadge, ItemName, hasRelevantNutrition, type StoreRating } from "@/components/search/ResultRow";
import { EmojiRating } from "@/components/shared/EmojiRating";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { FreeTextSearch } from "@/components/check-price/FreeTextSearch";
import { searchProducts, findNearbyStores, reportPrice, type SearchResponse, type SearchResult, type NearbyStore } from "@/lib/api";
import { LocationCorrectionBar } from "./LocationCorrectionBar";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { InPageCamera } from "@/components/shared/InPageCamera";
import { AppPage } from "@/components/shared/AppPage";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { displayProductName, formatSizeTag } from "@/lib/productName";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { Capacitor } from "@capacitor/core";

const TIER_LABEL: Record<string, string> = {
  neighborhood: "neighborhood zone",
  town: "town zone",
  city: "city zone"
};

// "You're at [store]" (atStore, below) is now always derived from
// primaryStore — the same single "where you are" determination the
// find_nearest_store/find_nearby_stores migrations and the orange banner
// already use — rather than its own independent live-GPS distance scan,
// so there's no longer a separate AT_STORE_METERS radius or haversine
// helper needed here at all; see primaryStore/atStore below.

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
          {hasRelevantNutrition(result) && (
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
        {showNutrition && hasRelevantNutrition(result) && (
          <div className="mt-2 rounded bg-white/10 px-3 py-2">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-field/60">
              {t("AI estimate — check the actual package")}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-field">
              {result.nutrition_facts!.serving_size && (
                <span>
                  {t("Serving size")}: <strong>{result.nutrition_facts!.serving_size}</strong>
                </span>
              )}
              {result.nutrition_facts!.calories != null && (
                <span>
                  {t("Calories")}: <strong>{result.nutrition_facts!.calories}</strong>
                </span>
              )}
              {result.nutrition_facts!.protein_g != null && (
                <span>
                  {t("Protein (g)")}: <strong>{result.nutrition_facts!.protein_g}</strong>
                </span>
              )}
              {result.nutrition_facts!.fat_g != null && (
                <span>
                  {t("Fat (g)")}: <strong>{result.nutrition_facts!.fat_g}</strong>
                </span>
              )}
              {result.nutrition_facts!.carbs_g != null && (
                <span>
                  {t("Carbs (g)")}: <strong>{result.nutrition_facts!.carbs_g}</strong>
                </span>
              )}
              {result.nutrition_facts!.sugar_g != null && (
                <span>
                  {t("Sugar (g)")}: <strong>{result.nutrition_facts!.sugar_g}</strong>
                </span>
              )}
              {result.nutrition_facts!.sodium_mg != null && (
                <span>
                  {t("Sodium (mg)")}: <strong>{result.nutrition_facts!.sodium_mg}</strong>
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
        {hasRelevantNutrition(result) && (
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
      {showNutrition && hasRelevantNutrition(result) && (
        <div className="mt-2 rounded border border-ink/20 bg-white/60 px-3 py-2">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ash">
            {t("AI estimate — check the actual package")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
            {result.nutrition_facts!.serving_size && (
              <span>
                {t("Serving size")}: <strong>{result.nutrition_facts!.serving_size}</strong>
              </span>
            )}
            {result.nutrition_facts!.calories != null && (
              <span>
                {t("Calories")}: <strong>{result.nutrition_facts!.calories}</strong>
              </span>
            )}
            {result.nutrition_facts!.protein_g != null && (
              <span>
                {t("Protein (g)")}: <strong>{result.nutrition_facts!.protein_g}</strong>
              </span>
            )}
            {result.nutrition_facts!.fat_g != null && (
              <span>
                {t("Fat (g)")}: <strong>{result.nutrition_facts!.fat_g}</strong>
              </span>
            )}
            {result.nutrition_facts!.carbs_g != null && (
              <span>
                {t("Carbs (g)")}: <strong>{result.nutrition_facts!.carbs_g}</strong>
              </span>
            )}
            {result.nutrition_facts!.sugar_g != null && (
              <span>
                {t("Sugar (g)")}: <strong>{result.nutrition_facts!.sugar_g}</strong>
              </span>
            )}
            {result.nutrition_facts!.sodium_mg != null && (
              <span>
                {t("Sodium (mg)")}: <strong>{result.nutrition_facts!.sodium_mg}</strong>
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
  return <StatusDotsCard label={t("Searching…")} />;
}

// Powers both /check-price (camera, upload, or type it in — starts on the
// three-button menu) and /search-items (starts straight on the type-it-in
// form, since that's the whole point of that tab). Kept as one component so
// the search/results logic — and the "you're at this store" detection —
// only exists in one place.
export function CheckPriceExperience({ initialMode }: { initialMode: Mode }) {
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const { coords, accuracy, status } = useGeolocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationCheck, setLocationCheck] = useState<{ stores: NearbyStore[] } | null>(null);
  // The store currently "anchored" on screen — the one named by the orange
  // ribbon, the landing panel, and the result screen's "You're at" card.
  // Both the automatic 20m/100m geofencing logic below AND a shopper's own
  // "Modify Location" pick write to this one piece of state, so there's a
  // single source of truth for "the" store rather than two separate ideas
  // (an auto pick vs. a manual override) that could disagree.
  const [anchorStoreId, setAnchorStoreId] = useState<string | null>(null);
  // Set only while the shopper is still within the 20m buffer of the
  // current anchor AND a different registered store has become the
  // closest candidate — the ribbon then asks "Seems you have moved to
  // [this store] — Confirm" instead of switching on its own. Left alone
  // (no tap), the anchor stays exactly where it was; switching only ever
  // happens automatically once the shopper has actually left the 20m
  // buffer (see resolveAnchor below).
  const [pendingMoveStoreId, setPendingMoveStoreId] = useState<string | null>(null);
  const [checkPriceRevealed, setCheckPriceRevealed] = useState(false);

  // Mirror of the latest coords for the background polling effect below to
  // read without being in its dependency array — that effect manages its
  // own timer loop and must NOT restart every time a new GPS fix comes in,
  // or it would tear down and recreate its timer on every single update.
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  // The exact geofencing rules requested:
  //
  // - Always show the registered store that appears closest (unregistered
  //   stores never even reach this list — find_nearby_stores/
  //   find_nearest_store already filter to verification_status =
  //   'approved' only).
  // - The 20m buffer rule: as long as the shopper stays within 20m of the
  //   currently-anchored store, they stay anchored there, even if a
  //   different registered store is now technically closer — that only
  //   surfaces as a "Seems you have moved to X — Confirm" prompt
  //   (pendingMoveStoreId below), and nothing actually switches unless the
  //   shopper taps Confirm.
  // - Beyond 20m from the anchor AND closer to a different registered
  //   store: switches automatically, no confirmation needed.
  // - The 100m single-store rule: when the area has only one registered
  //   store in range at all (nearby-check now fetches a 100m radius — see
  //   that route), that store keeps being shown as long as the shopper is
  //   within 100m of it, rather than the tighter 20m buffer.
  const anchorStoreIdRef = useRef<string | null>(null);
  const BUFFER_M = 20;
  const SINGLE_STORE_RADIUS_M = 100;

  // Sets the anchor directly — used by the automatic rules below AND by a
  // shopper's own "Modify Location" pick, so both write through the same
  // single place.
  function setAnchor(storeId: string | null) {
    anchorStoreIdRef.current = storeId;
    setAnchorStoreId(storeId);
    setPendingMoveStoreId(null);
  }

  // Runs on every location poll (the initial fix and every 10s refresh
  // after it) against that poll's registered-stores-only list, nearest
  // first. Returns the list unchanged — it's only here for the anchoring
  // side effects (setAnchor / setPendingMoveStoreId).
  function resolveAnchor(stores: NearbyStore[]): NearbyStore[] {
    if (stores.length === 0) {
      // No registered store anywhere in the 100m fetch radius at all.
      setAnchor(null);
      return stores;
    }

    const candidate = stores[0];
    const currentAnchorId = anchorStoreIdRef.current;

    if (currentAnchorId === null) {
      // First-ever fix — nothing to hold steady against yet, so resolve
      // immediately to the nearest registered store.
      setAnchor(candidate.store_id);
      return stores;
    }

    if (candidate.store_id === currentAnchorId) {
      // Still the closest (or the only) registered store — stay anchored,
      // and no "moved to" prompt is pending.
      setPendingMoveStoreId(null);
      return stores;
    }

    // The closest candidate is now a different registered store than the
    // current anchor.
    const singleStoreArea = stores.length === 1;
    if (singleStoreArea) {
      // Only one registered store is in range at all, and it isn't the
      // current anchor — the anchor must have moved out of range entirely
      // (fetch radius is 100m), and there's nothing else nearby to ask
      // about, so just follow it directly.
      setAnchor(candidate.store_id);
      return stores;
    }

    const anchorStore = stores.find((s) => s.store_id === currentAnchorId) ?? null;
    const anchorDistance = anchorStore?.distance_m ?? Infinity;

    if (anchorDistance <= BUFFER_M) {
      // Still within the 20m buffer of the current anchor — a different
      // store being technically closer doesn't switch anything on its
      // own; it only raises the "Seems you have moved to X" prompt, and
      // the shopper has to tap Confirm for it to actually take over.
      setPendingMoveStoreId(candidate.store_id);
      return stores;
    }

    // More than 20m from the anchor, and genuinely closer to a different
    // registered store — switch automatically, no confirmation needed.
    setAnchor(candidate.store_id);
    return stores;
  }
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  // "Upload photo" inside Enter details — lets someone identify an item by
  // photo even after they've chosen the type-it-in path, without having to
  // back out to the Scan/Snap/Enter details menu first.
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [useGuidedForm, setUseGuidedForm] = useState(false);
  const [sortMode, setSortMode] = useState<"price" | "distance">("price");
  // Toggles the results table between exact matches (sorted/tableRows
  // below) and "Similar items" — other products in the same category that
  // could differ in size, brand, and/or manufacturer. Independent of
  // sortMode, which still orders whichever list is currently shown.
  const [showSimilar, setShowSimilar] = useState(false);
  // Which pack-size/size "variant" chip is selected above the exact-match
  // table (null = "All"). Lets someone disambiguate AFTER seeing what's
  // actually on offer — a search can genuinely match a 6-pack and a
  // 24-pack of the same drink, or a 330ml can and a 1.5L bottle, under one
  // query, and asking the shopper to know and type the exact pack/size
  // before searching is worse UX than just letting them tap the one they
  // actually want once it's in front of them. Reset on every new search.
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  // This screen's own per-store review summary cache (average emoji rating
  // + count), keyed by store_id — fetched once per result set, in a single
  // batched request for every store on screen, rather than one request per
  // row (a result set can list dozens of different stores at once).
  const [ratings, setRatings] = useState<Record<string, StoreRating>>({});
  const [snapInterrupted, setSnapInterrupted] = useState(false);
  const [scanInterrupted, setScanInterrupted] = useState(false);
  const [showInPageCamera, setShowInPageCamera] = useState(false);
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
      const stores = await findNearbyStores(coords.lat, coords.lng, accuracy);
      resolveAnchor(stores);
      setLocationCheck({ stores });
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

  // Keeps "you are at [store]" current on its own the whole time the Check
  // Price tab is open — including while looking at results, not just on the
  // landing panel — so walking from store to store (or out of a store, or
  // into an unregistered spot) updates automatically rather than needing a
  // manual refresh. Previously this slowed to 45s or paused outright once
  // "confidently" at a store and stopped polling at all once results were on
  // screen — for someone testing storefront-by-storefront in a dense row,
  // that read as "I have to tap Check Price again for it to notice I
  // moved." The only thing still skipped is polling while the app is
  // literally not visible (backgrounded/screen locked); that resumes with
  // an immediate check the moment it's visible again.
  //
  // Cadence: a flat 10s the whole time the Check Price tab is open — the
  // 20m/100m geofencing rules above need a live poll to notice a real move
  // at all, whether or not the anchor was just set automatically or via a
  // shopper's own "Modify Location" pick, so there's no reason to slow this
  // down once a pick is in place the way an earlier version did.
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
    anchorStoreIdRef.current = null;
    setAnchorStoreId(null);
    setPendingMoveStoreId(null);
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
    setShowSimilar(false);
    setSelectedVariant(null);
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

  // Snap and the native "Take Photo"/"Photo" options already cap their
  // capture at width 1600 / quality 80 (via @capacitor/camera), but a photo
  // picked through a plain web <input type="file"> — which is every path
  // on the web, and "Upload File" even inside the native app — comes
  // straight from the camera roll at full resolution. A modern phone photo
  // there can be 10-20MB+, which bloats to even more as base64 and can
  // silently fail (a request too large for the server to accept, or a slow
  // upload a shopper gives up on) with nothing useful on screen to explain
  // why — exactly what "upload/take/choose a photo on Enter details does
  // nothing" looks like from the outside. Downscaling every image file to
  // the same ceiling Snap already uses, right before it's turned into
  // base64, keeps every image-search path the same reliable size.
  function resizeImageFile(file: File, maxDimension = 1600, quality = 0.8): Promise<File> {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve(file);
        return;
      }
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        // Already small enough — skip the canvas round-trip entirely.
        if (scale >= 1) {
          resolve(file);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Couldn't decode it as an image client-side — hand the original
        // file along and let the server's own validation explain why, if
        // it isn't actually a readable image.
        resolve(file);
      };
      img.src = objectUrl;
    });
  }

  // Inside the native app, Snap used to hand off to @capacitor/camera's
  // own getPhoto() — a separate native camera Activity/app launched on
  // top of this one. That hand-off was the actual problem: switching its
  // resultType from Base64 to Uri (an earlier fix here) only changed how
  // much data crossed the native<->JS bridge AFTER a photo was taken; it
  // did nothing about the Activity transition itself, and real-device
  // testing kept showing the same crash/reset either way — Android's
  // low-memory killer reclaiming this app's whole process while the
  // heavier native camera app was in the foreground. Snap now opens
  // InPageCamera instead (see that component) — a getUserMedia video
  // feed shown right in this page, the same approach BarcodeScanner
  // already uses successfully. There's no separate screen for Android to
  // kill the app out from under anymore.
  function handleSnap() {
    // Clear whatever result is currently on screen the moment Snap is
    // tapped, not just once a new photo comes back — otherwise the old
    // answer keeps showing underneath for the whole time the camera is
    // open (or stays forever if the user backs out without taking a shot).
    setResult(null);
    setError(null);
    setSnapInterrupted(false);
    if (Capacitor.isNativePlatform()) {
      setShowInPageCamera(true);
      return;
    }
    cameraInputRef.current?.click();
  }

  async function handleInPageCapture(file: File) {
    setShowInPageCamera(false);
    const imageBase64 = await fileToBase64(file);
    runSearch({ imageBase64 });
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
    e.target.value = "";
    try {
      const resized = await resizeImageFile(file);
      const imageBase64 = await fileToBase64(resized);
      runSearch({ imageBase64 });
    } catch {
      // A failure reading/resizing the photo itself (not the search
      // request, which runSearch already catches on its own) — still
      // needs to land somewhere visible rather than just going quiet.
      setError(t("Couldn't read that photo — please try again."));
    }
  }

  // "Upload photo" inside Enter details (via ImageSourceSheet) — a photo
  // picked any of its three ways (take/choose/upload) always comes back as
  // a plain File, so this is the one place that turns it into the same
  // image-search request Snap already runs.
  async function handleImagePicked(file: File) {
    setError(null);
    try {
      const resized = await resizeImageFile(file);
      const imageBase64 = await fileToBase64(resized);
      runSearch({ imageBase64 });
    } catch {
      setError(t("Couldn't read that photo — please try again."));
    }
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
          t("No information is available in the system for this barcode. Please use Camera or Enter details instead.") +
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

  // "price" sort uses unit_price, not the raw listing price — local_results
  // can span more than one product_id (a fuzzy/embedding match can mix pack
  // sizes and sizes under one search), so ranking by total price alone would
  // unfairly favor the smaller pack every time. See lib/unitPrice.ts.
  const sorted = result?.local_results.length
    ? [...result.local_results].sort((a, b) =>
        sortMode === "price" ? a.unit_price - b.unit_price : a.distance_m - b.distance_m
      )
    : [];
  // Groups the exact-match table by pack size + size, so a search that
  // genuinely spans more than one (a 6-pack and a 24-pack, a 330ml can and
  // a 1.5L bottle) can be disambiguated AFTER seeing what's really on
  // offer, instead of asking the shopper to know and type that detail
  // before searching at all. Only meaningful when there's more than one
  // distinct combination — a single-variant result set shows no chips.
  function variantKey(r: SearchResult): string {
    const pack = r.pack_size ?? 1;
    if (r.size_type === "units" || r.size == null) return `p${pack}`;
    return `p${pack}-${r.size}-${(r.unit ?? "").toLowerCase()}`;
  }
  function variantLabel(r: SearchResult): string {
    const pack = r.pack_size ?? 1;
    const sizePart = r.size_type !== "units" && r.size != null ? formatSizeTag(r.size, r.unit).replace(/[[\]]/g, "") : "";
    if (pack > 1) return sizePart ? `${pack}× ${sizePart}` : `${pack}×`;
    return sizePart || t("Single item");
  }
  const variants = (() => {
    const byKey = new Map<string, { key: string; label: string; count: number }>();
    for (const r of sorted) {
      const key = variantKey(r);
      const existing = byKey.get(key);
      if (existing) existing.count++;
      else byKey.set(key, { key, label: variantLabel(r), count: 1 });
    }
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const sortedFiltered = selectedVariant ? sorted.filter((r) => variantKey(r) === selectedVariant) : sorted;
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
    sortedFiltered.length > 0
      ? (() => {
          const min = sortedFiltered.reduce((m, r) => (r.unit_price < m.unit_price ? r : m), sortedFiltered[0]);
          return `${min.store_id}::${min.product_id}`;
        })()
      : null;
  // The pre-search "You are at" panel's own store list. nearbyStores is
  // every registered store within the 100m fetch radius, nearest first.
  // primaryStore is always the anchored store from the 20m/100m geofencing
  // logic above (resolveAnchor) — set automatically on every poll, or
  // directly by a shopper's own "Modify Location" pick (handleModifyLocation
  // below), so there's one single, always-resolved "the store" rather than
  // a separate ambiguous/ask-the-shopper state. pendingMoveStore is the
  // "Seems you have moved to X" candidate the ribbon offers to Confirm,
  // kept entirely separate from primaryStore so nothing on this screen
  // switches early just because a closer store showed up for a moment.
  const nearbyStores = locationCheck?.stores ?? [];
  const primaryStore = nearbyStores.find((s) => s.store_id === anchorStoreId) ?? null;
  const pendingMoveStore = nearbyStores.find((s) => s.store_id === pendingMoveStoreId) ?? null;
  const alternativeStores = nearbyStores.filter((s) => s.store_id !== primaryStore?.store_id);

  function handleConfirmMove() {
    if (pendingMoveStore) setAnchor(pendingMoveStore.store_id);
  }
  // "Modify Location" — a shopper's own explicit pick always wins outright,
  // the same single setAnchor the automatic rules use.
  function handleModifyLocation(storeId: string) {
    setAnchor(storeId);
  }

  // The "You're at [store], price: X" card below is about THIS search
  // result at the shopper's current/anchored store — so it has to be the
  // exact same store as the orange ribbon and the red "{store} doesn't
  // carry this item" message above, not a separately re-detected one.
  // Deriving atStore from primaryStore keeps the two impossible to
  // disagree, and means this card and the red "doesn't carry" message
  // above are strictly mutually exclusive — exactly one of them shows, for
  // the one store the shopper is actually at.
  const atStore = primaryStore ? sorted.find((r) => r.store_id === primaryStore.store_id) ?? null : null;

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
    // A 6-pack and a 12-pack of the same-named, same-sized item are not the
    // same listing — dedup treats pack_size as part of product identity
    // (see app/api/products/route.ts), so a "Save: X" comparison has to
    // respect that too, or it'd compare a pack's total price against a
    // different pack's total price as if they were interchangeable.
    if (fieldsConflict(norm(a.pack_size ?? 1), norm(b.pack_size ?? 1))) return false;
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
      const best = items.reduce((m, r) => (r.unit_price < m.unit_price ? r : m), items[0]);
      const comparable = items.filter((r) => sameItem(r, best));
      if (comparable.length < 2) continue;
      // sameItem now guarantees matching pack_size/size/unit within
      // `comparable`, so the raw price difference is a real, directly
      // comparable currency saving here — unit_price was only needed to
      // pick out `best` from the wider (possibly mixed-pack-size) group.
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
  // "Similar items" — same category, but deliberately NOT the exact
  // product (could be a different size, brand, and/or manufacturer),
  // sorted by the same price/distance toggle as the exact-match table.
  // Kept entirely separate from `sorted`/cheapestKey/atStore/savingsFor
  // above, which all intentionally stay scoped to exact matches only.
  const similarSorted = result?.similar_results.length
    ? [...result.similar_results].sort((a, b) =>
        sortMode === "price" ? a.unit_price - b.unit_price : a.distance_m - b.distance_m
      )
    : [];
  // Always show the full list of every store carrying the item — it used
  // to be hidden behind a "See best prices nearby too" link whenever you
  // were detected as standing at a store, but the shopper should be able
  // to see item name, "you are at this store," nearby best, city best, and
  // the full comparison list (with sorting) all at once, not have to ask
  // for the list. Swaps to similarSorted while the "Similar items" toggle
  // is on.
  const tableRows = showSimilar ? similarSorted : sortedFiltered;

  // Fetch review summaries for every store on screen in one batched
  // request, whenever the result set changes — covers the comparison
  // table, both "best price" callouts, and the "you're at this store"
  // panel, all of which show a store name and can each name a different
  // store.
  useEffect(() => {
    const ids = new Set<string>();
    for (const r of sorted) ids.add(r.store_id);
    for (const r of similarSorted) ids.add(r.store_id);
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

  // The falling arrow/"Prices" rain is only for each tab's own main/landing
  // screen — Check Price's Scan/Snap/Enter-details menu, or Search Items'
  // plain search box — not any screen navigated into from there (the
  // guided category picker, a result, a search in progress). "Main screen"
  // is mode-specific per tab: for Check Price (initialMode "menu") that's
  // the landing menu itself (mode === "menu", before "Check Price &
  // Compare" reveals it); for Search Items (initialMode "text") there's no
  // separate landing menu — the search box IS its main screen, so that's
  // mode === "text" without the guided-form picker swapped in. Either way,
  // once there's a result on screen or a search is in flight, it's no
  // longer the main screen.
  const isMainScreen =
    (initialMode === "menu" ? mode === "menu" && !checkPriceRevealed : mode === "text" && !useGuidedForm) &&
    !result &&
    !busy;

  return (
    <AppPage showPriceRain={isMainScreen}>
      {/* Sticky GPS-correction bar — persists across the landing panel,
          Scan/Snap/Enter details, and results, same lifetime as the 10s/60s
          background poll above, so a shopper can fix a wrong auto-detected
          store from anywhere on this tab, not just right when a fix first
          comes in. Renders nothing of its own when there's no alternative
          to switch to. */}
      {initialMode === "menu" && primaryStore && (
        <LocationCorrectionBar
          primaryStore={primaryStore}
          pendingMoveStore={pendingMoveStore}
          alternativeStores={alternativeStores}
          onConfirmMove={handleConfirmMove}
          onModifyLocation={handleModifyLocation}
        />
      )}

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
          <span className="text-breathe">{t("Check Price & Compare")}</span>
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
              {primaryStore ? (
                // Registered store: the map is always centered on the
                // SHOPPER's own live GPS position (never the store's saved
                // coordinates — those can be wrong or stale, and showing
                // them here made the map jump to a location the shopper
                // wasn't actually standing at). The store's own front
                // photo sits beside it as the "yes, that's the shop"
                // confirmation instead.
                <div className="grid grid-cols-2 gap-2">
                  {/* No border here — the map iframe's own src was being
                      rebuilt from the RAW coords on every location poll, so
                      even a meter or two of ordinary GPS jitter (same
                      actual spot) counted as "moved" and reloaded the whole
                      embed, blanking it for a moment — and a border around
                      that blank gap read as a "frame" flashing on/off.
                      Rounding the coords used in the URL below (a few
                      decimal places ≈ a few meters) means the src string
                      only actually changes once the shopper has genuinely
                      moved, so the map stops reloading (and flashing) on
                      jitter alone; dropping the border means even a replot
                      that does happen has nothing outlined around it. */}
                  <div className="overflow-hidden rounded">
                    {coords && (
                      <iframe
                        title={t("Your location")}
                        width="100%"
                        height="220"
                        style={{ border: 0 }}
                        loading="lazy"
                        src={`https://www.google.com/maps?q=${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}&z=17&t=k&output=embed`}
                      />
                    )}
                  </div>
                  {primaryStore.store_photo_url ? (
                    // Same reasoning, no border — the store photo swaps
                    // out briefly during an app update or a location
                    // re-check, and a border around an empty gap read as a
                    // visible "frame" flashing on/off; the photo itself
                    // (rounded + clipped, no outline) just fades in and out
                    // cleanly instead.
                    <div className="overflow-hidden rounded">
                      <img
                        src={primaryStore.store_photo_url}
                        alt={primaryStore.store_name}
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
                {primaryStore ? (
                  <>
                    {t("You are at")} <strong>{primaryStore.store_name}</strong>
                  </>
                ) : coords ? (
                  t("You are at an unregistered location")
                ) : (
                  t("Couldn't determine your location.")
                )}
              </p>
              {/* Picking an alternative, and the GPS accuracy disclaimer,
                  both now live in the sticky correction bar's bottom sheet
                  (rendered near the top of the page, below) instead of
                  inline here — that bar stays visible the whole time the
                  Check Price tab is open, not just on this landing panel,
                  so the correction flow is reachable from Scan/Snap/results
                  too, not only right after a fresh GPS fix. */}
            </>
          ) : (
            <p className="text-sm text-ash">{t("Finding your location…")}</p>
          )}
        </div>
      )}


      {/* Scan/Snap/Enter details, Back, and Start new check are primary
          actions on this screen, so by request they're never hidden —
          not while a search is busy, not while scanningBarcode, and not
          once a result is on screen. (An earlier version hid this whole
          block behind !busy && !scanningBarcode && !result, originally to
          fix the Scan/Snap/Enter-details buttons popping back up ABOVE a
          just-arrived result and looking like the scan had reset — see the
          !result on the result section itself, and on the "You're at"/
          price callouts below, which already makes a fresh result read
          clearly as a new answer arriving underneath rather than a reset,
          so hiding these buttons was never actually required to fix that;
          it only meant the shopper couldn't start another scan/snap
          without first tapping Back.) */}
      {mode === "menu" && checkPriceRevealed && (
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
              className={`${outlineButton} flex items-center justify-center`}
              aria-label={t("Scan Barcode")}
            >
              {/* Icon instead of the word, by request — applies the same
                  everywhere this button renders (native app and website
                  both use this one shared component/className). A custom
                  glyph rather than lucide's Barcode icon (too few, too
                  evenly-spaced bars to read as a real barcode) — 18 bars
                  of uneven widths, same irregular look as the barcode in
                  the app's own logo/watermark, well over the "at least 10
                  bars" ask. */}
              <svg width="48" height="28" viewBox="0 0 120 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
              </svg>
            </button>
            <button onClick={handleSnap} className={`${outlineButton} flex items-center justify-center`} aria-label={t("Snap")}>
              {/* Bigger again, by request. */}
              <CameraIcon size={36} strokeWidth={2} aria-hidden="true" />
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
              onClick={() => {
                // Previously this only hid the Scan/Snap/Enter details
                // block (checkPriceRevealed false) — the old result stayed
                // in state and kept rendering below the landing panel,
                // showing a stale product/store until a real new search
                // overwrote it. Back now clears the result/mode too, same
                // as a fresh visit to this tab, while leaving location
                // state (locationCheck/the anchored store) alone — the shopper
                // hasn't moved, so there's no reason to forget a location
                // correction just because they backed out of one item.
                setCheckPriceRevealed(false);
                setResult(null);
                setError(null);
                setMode(initialMode);
                setUseGuidedForm(false);
              }}
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
      {scanningBarcode && <p className="mb-6 text-sm text-ash"><StatusDots label={t("Reading barcode…")} /></p>}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={closeScanner} />}
      {showInPageCamera && (
        <InPageCamera onCapture={handleInPageCapture} onClose={() => setShowInPageCamera(false)} onError={setError} />
      )}

      {mode === "text" && !useGuidedForm && (
        <div className="flex flex-col gap-2">
          {busy ? (
            <SearchingIndicator />
          ) : (
            <>
              <FreeTextSearch onSubmit={(text) => runSearch({ text })} busy={busy} />
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setShowImageUpload(true)}
                  className="btn-shine inline-flex items-center justify-center gap-1.5 rounded border border-value bg-value px-3 py-2 font-display text-sm font-bold tracking-wide text-white transition-all active:bg-value-dark hover:border-value-soft hover:text-white active:border-value-dark active:text-white duration-200 hover:scale-105"
                >
                  <ImageIcon size={16} strokeWidth={2} />
                  {t("Upload")}
                </button>
                <button
                  type="button"
                  onClick={() => setUseGuidedForm(true)}
                  className="btn-shine inline-flex items-center justify-center gap-1.5 rounded border border-value bg-value px-3 py-2 font-display text-sm font-bold tracking-wide text-white transition-all active:bg-value-dark hover:border-value-soft hover:text-white active:border-value-dark active:text-white duration-200 hover:scale-105"
                >
                  <CategoryIcon size={16} strokeWidth={2} />
                  {t("Search by category")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Lands on the Scan/Snap/Enter details menu itself, not
                    // all the way back on the landing "Check Price &
                    // Compare" button + map panel — that's one step further
                    // back than Cancel should go. The other red "Back"
                    // button (above the result) deliberately goes all the
                    // way to that landing screen instead; this one doesn't,
                    // so it keeps checkPriceRevealed true rather than
                    // clearing it.
                    setResult(null);
                    setError(null);
                    setMode(initialMode);
                    setUseGuidedForm(false);
                    if (initialMode === "menu") setCheckPriceRevealed(true);
                  }}
                  className="col-span-2 inline-flex items-center justify-center gap-1 rounded border border-red-600 bg-red-600 px-3 py-2 font-display text-sm font-bold text-white transition-colors hover:border-red-700 hover:bg-red-700 active:border-red-800 active:bg-red-800 sm:col-span-1"
                >
                  {t("Cancel")}
                </button>
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
                onCancel={() => setUseGuidedForm(false)}
              />
            </>
          )}
        </div>
      )}

      <ImageSourceSheet
        open={showImageUpload}
        onClose={() => setShowImageUpload(false)}
        onPicked={handleImagePicked}
        onError={setError}
      />

      {busy && mode !== "text" && <p className="mt-3 text-sm text-ash"><StatusDots label={t("Searching…")} /></p>}
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

          {/* Explains why the Save/comparison figures below aren't measured
              against "where you're standing" — only shown once there's
              something TO compare against elsewhere (sorted.length > 0);
              if literally no store nearby carries this item, the existing
              "No store nearby carries this yet" message below already
              covers that. */}
          {primaryStore && sorted.length > 0 && !sorted.some((r) => r.store_id === primaryStore.store_id) && (
            <p className="mb-3 text-sm font-bold text-red-600">
              {t("{store} doesn't carry this item.").replace("{store}", primaryStore.store_name)}
            </p>
          )}

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

          {/* Pack/size chips — only when this search genuinely turned up
              more than one (a 6-pack and a 24-pack of the same drink, a
              330ml can and a 1.5L bottle). Lets the shopper pick the one
              they actually want after seeing what's really on offer,
              instead of having to know and type it before searching.
              Hidden under "Similar items", which is deliberately a
              different-products view, not a size variant of this one. */}
          {!showSimilar && variants.length > 1 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ash">{t("Pack Size")}:</span>
              <button
                onClick={() => setSelectedVariant(null)}
                className={`rounded-full px-2.5 py-1 text-[13px] transition-colors ${
                  selectedVariant === null
                    ? "bg-ink text-white"
                    : "border border-line bg-field text-ink hover:bg-field-raised"
                }`}
              >
                {t("All")}
              </button>
              {variants.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setSelectedVariant((s) => (s === v.key ? null : v.key))}
                  className={`rounded-full px-2.5 py-1 text-[13px] transition-colors ${
                    selectedVariant === v.key
                      ? "bg-ink text-white"
                      : "border border-line bg-field text-ink hover:bg-field-raised"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {/* Two buttons (Best price/Nearest, no Similar items yet) sit
              right on the "Sort by:" label's own line. Once Similar items
              joins them (three buttons total), the label gets its own
              line and all three buttons move together onto the line below
              it, rather than splitting two-up-top/one-below. */}
          {(() => {
            const bestPriceButton = (
              <button
                key="price"
                onClick={() => setSortMode("price")}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  sortMode === "price" ? "bg-ink text-white" : "btn-shine border border-value bg-value text-white hover:border-value-soft hover:text-white transition-all duration-200 hover:scale-105"
                }`}
              >
                {t("Best price")}
              </button>
            );
            const nearestButton = (
              <button
                key="distance"
                onClick={() => setSortMode("distance")}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  sortMode === "distance" ? "bg-ink text-white" : "btn-shine border border-value bg-value text-white hover:border-value-soft hover:text-white transition-all duration-200 hover:scale-105"
                }`}
              >
                {t("Nearest")}
              </button>
            );
            const similarButton = (
              <button
                key="similar"
                onClick={() => setShowSimilar((v) => !v)}
                className={`rounded-sm px-2 py-1 font-display text-[13px] transition-colors ${
                  showSimilar ? "bg-blue-800 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {t("Similar items")}
              </button>
            );

            const hasSort = sorted.length > 1;
            const hasSimilar = similarSorted.length > 0;
            if (!hasSort && !hasSimilar) return null;

            const allThree = hasSort && hasSimilar;
            return (
              <div className="mb-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ash">{t("Sort by")}:</span>
                  {!allThree && hasSort && (
                    <>
                      {bestPriceButton}
                      {nearestButton}
                    </>
                  )}
                  {!allThree && hasSimilar && similarButton}
                </div>
                {allThree && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {bestPriceButton}
                    {nearestButton}
                    {similarButton}
                  </div>
                )}
              </div>
            );
          })()}

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
