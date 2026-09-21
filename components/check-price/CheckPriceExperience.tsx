"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow } from "@/components/search/ResultRow";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { searchProducts, findNearestStore, reportPrice, type SearchResponse, type SearchResult } from "@/lib/api";
import { AppPage } from "@/components/shared/AppPage";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const TIER_LABEL: Record<string, string> = {
  neighborhood: "neighborhood zone",
  town: "town zone",
  city: "city zone"
};

const AT_STORE_METERS = 150;

type Mode = "menu" | "text";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

// One "best price" callout — used for both the nearby-best and city-wide-
// best results. Carries its own map link and price-accuracy report buttons
// so a shopper never has to scroll to the table below to act on either.
function PriceCallout({ label, result }: { label: string; result: SearchResult }) {
  const { t } = useLanguage();
  const [reported, setReported] = useState<"correct_price" | "wrong_price" | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="mb-3 rounded border border-value bg-value-soft px-4 py-3">
      <p className="text-sm text-ink">
        {label}: <strong>{result.price.toFixed(2)} {result.currency}</strong> at{" "}
        <Link href={`/store/${result.store_id}`} className="underline">
          {result.store_name}
        </Link>{" "}
        ({formatDistance(result.distance_m)} away).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
          target="_blank"
          rel="noreferrer"
          className="text-value underline hover:text-value/80"
        >
          {t("Open in Maps")}
        </a>
        {reported ? (
          <span className="font-mono text-[11px] text-value">
            {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
          </span>
        ) : (
          <>
            <span className="text-ash">{t("Is this price accurate?")}</span>
            <button disabled={busy} onClick={() => handleReport("correct_price")} className="text-value underline hover:text-value/80">
              {t("Yes")}
            </button>
            <button disabled={busy} onClick={() => handleReport("wrong_price")} className="text-flag underline hover:text-flag/80">
              {t("No, it was higher in store")}
            </button>
          </>
        )}
      </div>
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
  const { coords, status } = useGeolocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [showWiderResults, setShowWiderResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationCheck, setLocationCheck] = useState<
    { store: { store_id: string; store_name: string; distance_m: number } | null } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFindMyLocation() {
    setLocating(true);
    setLocationCheck(null);
    try {
      if (!coords) {
        setError(t("Turn on location so we can tell where you are."));
        return;
      }
      const store = await findNearestStore(coords.lat, coords.lng);
      setLocationCheck({ store });
    } catch (e: any) {
      setError(e.message ?? "Couldn't check your location.");
    } finally {
      setLocating(false);
    }
  }

  async function runSearch(input: { text?: string; imageBase64?: string; structured?: any }) {
    if (!coords) {
      setError(t("Turn on location so we can find prices near you."));
      return;
    }
    setBusy(true);
    setError(null);
    setShowWiderResults(false);
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

  const sorted = result?.local_results.length
    ? [...result.local_results].sort((a, b) => a.price - b.price)
    : [];
  const cheapestId = sorted[0]?.store_id ?? null;
  const atStore = sorted.find((r) => r.distance_m <= AT_STORE_METERS) ?? null;
  const tableRows = atStore && !showWiderResults ? [] : sorted;

  // Only worth calling out the city-wide best when it's actually a
  // different store than the nearby best — otherwise it's the same
  // information said twice.
  const cityBestDiffersFromNear =
    result?.city_best && (!result.near_best || result.city_best.store_id !== result.near_best.store_id);

  const outlineButton =
    "flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-[15px] text-ink transition-colors hover:border-value hover:bg-value hover:text-white";

  return (
    <AppPage>
      <p className="mb-4 text-sm text-ash">{t("Track best prices, near you first.")}</p>

      <button
        onClick={handleFindMyLocation}
        disabled={locating}
        className="mb-6 w-full rounded bg-value px-4 py-3 font-display text-[15px] font-medium text-white hover:bg-value/90 disabled:opacity-40"
      >
        {locating ? t("Finding your location…") : t("Find My Location")}
      </button>

      {locationCheck && (
        <div className="-mt-3 mb-6">
          {locationCheck.store ? (
            <p className="text-sm text-ink">
              {t("You're at")} <strong>{locationCheck.store.store_name}</strong>{" "}
              <span className="text-ash">({t("matched within 10 meters")})</span>.
            </p>
          ) : coords ? (
            <div className="overflow-hidden rounded border border-line">
              <iframe
                title={t("Your location")}
                width="100%"
                height="220"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&t=k&output=embed`}
              />
              <p className="bg-field-raised px-3 py-2 text-sm text-ink">
                {t("No store is registered on PriceBook at this location.")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink">{t("Couldn't determine your location.")}</p>
          )}
        </div>
      )}

      {mode === "menu" && !busy && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => cameraInputRef.current?.click()} className={outlineButton}>
            {t("Camera")}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className={outlineButton}>
            {t("Upload image")}
          </button>
          <button onClick={() => setMode("text")} className={outlineButton}>
            {t("Enter item details")}
          </button>
        </div>
      )}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {mode === "text" && (
        <GuidedTextEntry
          onSubmit={(structured) => runSearch({ structured })}
          onCancel={() => (initialMode === "menu" ? setMode("menu") : router.push("/check-price"))}
        />
      )}

      {busy && <p className="mt-3 text-sm text-ash">{t("Searching…")}</p>}
      {status === "denied" && (
        <p className="mt-3 text-sm text-flag">
          {t("Location is off, so we can't sort by distance. Enable it in your browser to see nearby prices.")}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-flag">{error}</p>}

      {result && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium text-ink">
              {result.query.brand ? `${result.query.brand} ` : ""}
              {result.query.product_name}
            </h2>
            {result.tier && (
              <span className="font-mono text-xs uppercase tracking-wide text-ash">
                {t(TIER_LABEL[result.tier] ?? result.tier)}
              </span>
            )}
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

          {result.near_best && <PriceCallout label={t("Best price within 5km")} result={result.near_best} />}
          {cityBestDiffersFromNear && result.city_best && (
            <PriceCallout label={t("Best price in the whole city")} result={result.city_best} />
          )}

          {atStore && (
            <div className="mb-4 rounded border border-value bg-value-soft px-4 py-3">
              <p className="text-sm text-ink">
                You are at <strong>{atStore.store_name}</strong> — the price here is{" "}
                <strong>{atStore.price.toFixed(2)} {atStore.currency}</strong>.
              </p>
              {!showWiderResults && sorted.length > 1 && (
                <button onClick={() => setShowWiderResults(true)} className="mt-2 text-sm text-value underline hover:text-value/80">
                  See best prices nearby too
                </button>
              )}
            </div>
          )}

          {tableRows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Store")}</th>
                  <th className="num">{t("Distance")}</th>
                  <th className="num">{t("Price")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <ResultRow key={r.store_id + r.product_id} result={r} isCheapest={r.store_id === cheapestId} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </AppPage>
  );
}
