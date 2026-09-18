"use client";

import { useState } from "react";
import type { SearchResult } from "@/lib/api";
import { reportPrice } from "@/lib/api";
import { createBrowserSupabase } from "@/lib/supabaseClient";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const TRUST_COLOR: Record<SearchResult["trust_badge"], string> = {
  green: "bg-value",
  orange: "bg-flag",
  red: "bg-red-500",
  unrated: "bg-ash/40"
};

const TRUST_LABEL: Record<SearchResult["trust_badge"], string> = {
  green: "Trusted pricing",
  orange: "Some price disputes",
  red: "Frequently disputed",
  unrated: "Not yet rated"
};

export function ResultRow({ result, isCheapest }: { result: SearchResult; isCheapest: boolean }) {
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
    <div className="ledger-row flex-col items-stretch gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={"h-1.5 w-1.5 rounded-full " + TRUST_COLOR[result.trust_badge]}
              title={TRUST_LABEL[result.trust_badge]}
            />
            <span className="truncate font-display text-[15px] font-medium text-ink">{result.store_name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-ash">
            <span>{formatDistance(result.distance_m)} away</span>
            <a
              href={`https://www.google.com/maps?q=${result.store_lat},${result.store_lng}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              view on map
            </a>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          {isCheapest && (
            <span className="rounded-sm bg-value-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-value">
              Cheapest
            </span>
          )}
          <span className="font-display text-lg font-semibold text-ink">
            {result.price.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-ash">{result.currency}</span>
          </span>
        </div>
      </div>

      <div className="flex gap-3 font-mono text-[11px] text-ash">
        {reported ? (
          <span className="text-value">Thanks — marked as {reported === "correct_price" ? "correct" : "wrong"}.</span>
        ) : (
          <>
            <button disabled={busy} onClick={() => handleReport("correct_price")} className="underline hover:text-ink">
              Price is correct
            </button>
            <button disabled={busy} onClick={() => handleReport("wrong_price")} className="underline hover:text-flag">
              Price is wrong
            </button>
          </>
        )}
      </div>
    </div>
  );
}
