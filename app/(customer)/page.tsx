"use client";

import { useState } from "react";
import { GeolocationProvider, useGeolocation } from "@/components/shared/GeolocationProvider";
import { SearchBar } from "@/components/search/SearchBar";
import { ResultRow } from "@/components/search/ResultRow";
import { searchProducts, type SearchResponse } from "@/lib/api";
import { PageShell } from "@/components/shared/PageShell";
import { AccountMenu } from "@/components/shared/AccountMenu";
import { createBrowserSupabase } from "@/lib/supabaseClient";

function CustomerHome() {
  const { coords, status } = useGeolocation();
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(input: { text?: string; imageBase64?: string }) {
    if (!coords) {
      setError("Turn on location so we can find prices near you.");
      return;
    }
    setBusy(true);
    setError(null);
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
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const cheapestId = result?.local_results.length
    ? [...result.local_results].sort((a, b) => a.price - b.price)[0].store_id
    : null;

  return (
    <PageShell>
      <header className="mb-6 flex items-start justify-between">
        <p className="text-sm text-ash">Track best prices, near you first.</p>
        <AccountMenu />
      </header>

      <SearchBar onSearch={handleSearch} busy={busy} />

      {status === "denied" && (
        <p className="mt-3 text-sm text-flag">
          Location is off, so we can't sort by distance. Enable it in your browser to see nearby prices.
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
                {result.tier} zone
              </span>
            )}
          </div>

          {result.local_results.length === 0 && (
            <p className="text-sm text-ash">
              No store nearby carries this yet.
              {result.web_estimate?.source_url && (
                <>
                  {" "}
                  Reference:{" "}
                  <a className="underline" href={result.web_estimate.source_url} target="_blank" rel="noreferrer">
                    see online
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {result.local_results.map((r) => (
            <ResultRow key={r.store_id + r.product_id} result={r} isCheapest={r.store_id === cheapestId} />
          ))}
        </section>
      )}
    </PageShell>
  );
}

export default function Page() {
  return (
    <GeolocationProvider>
      <CustomerHome />
    </GeolocationProvider>
  );
}
