"use client";

import { useState } from "react";
import type { SearchResult } from "@/lib/api";
import { reportPrice } from "@/lib/api";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const TRUST_COLOR: Record<SearchResult["trust_badge"], string> = {
  green: "bg-value",
  orange: "bg-flag",
  red: "bg-red-500",
  unrated: "bg-ash/40"
};

export function ResultRow({ result, isCheapest }: { result: SearchResult; isCheapest: boolean }) {
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
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <span className={"h-2 w-2 shrink-0 rounded-full " + TRUST_COLOR[result.trust_badge]} />
          <div className="min-w-0">
            <p className="truncate font-medium">{result.store_name}</p>
            <a
              href={`https://www.google.com/maps?q=${result.store_lat},${result.store_lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-ash underline"
            >
              {t("view on map")}
            </a>
          </div>
        </div>
      </td>
      <td className="num font-mono text-xs text-ash">{formatDistance(result.distance_m)}</td>
      <td className="num">
        {isCheapest && (
          <span className="mr-2 rounded-sm bg-value-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-value">
            {t("Cheapest")}
          </span>
        )}
        {result.price.toFixed(2)} <span className="text-xs font-normal text-ash">{result.currency}</span>
      </td>
      <td>
        {reported ? (
          <span className="font-mono text-[11px] text-value">
            {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
          </span>
        ) : (
          <div className="flex flex-col gap-0.5 font-mono text-[11px] text-ash">
            <button disabled={busy} onClick={() => handleReport("correct_price")} className="text-left underline hover:text-ink">
              {t("Price is correct")}
            </button>
            <button disabled={busy} onClick={() => handleReport("wrong_price")} className="text-left underline hover:text-flag">
              {t("Price is wrong")}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
