"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow } from "@/components/search/ResultRow";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { searchProducts, type SearchResponse } from "@/lib/api";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const outlineButton =
    "flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-[15px] text-ink transition-colors hover:border-value hover:bg-value hover:text-white";

  return (
    <AppPage>
      <p className="mb-6 text-sm text-ash">{t("Track best prices, near you first.")}</p>

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
