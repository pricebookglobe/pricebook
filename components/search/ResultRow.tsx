"use client";

import Link from "next/link";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [reported, setReported] = useState<"correct_price" | "wrong_price" | null>(null);
  const [busy, setBusy] = useState(false);

  async function requireSession() {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.href = "/login";
      return null;
    }
    return data.session.access_token;
  }

  async function handleReport(type: "correct_price" | "wrong_price") {
    setBusy(true);
    try {
      const accessToken = await requireSession();
      if (!accessToken) return;
      await reportPrice({ store_id: result.store_id, product_id: result.product_id, report_type: type, accessToken });
      setReported(type);
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleMessage() {
    const accessToken = await requireSession();
    if (!accessToken) return;
    const message = prompt("Message to the store:");
    if (!message) return;
    await fetch(`/api/stores/${result.store_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ subject: `About ${result.product_name}`, message })
    });
    setMenuOpen(false);
  }

  return (
    <>
      <tr>
        <td>
          <div className="flex items-center gap-2">
            <span className={"h-2 w-2 shrink-0 rounded-full " + TRUST_COLOR[result.trust_badge]} />
            <div className="min-w-0">
              <Link href={`/store/${result.store_id}`} className="truncate font-medium hover:underline">
                {result.store_name}
              </Link>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
                target="_blank"
                rel="noreferrer"
                className="block font-mono text-[11px] text-ash underline"
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
        <td className="relative num">
          {reported ? (
            <span className="font-mono text-[11px] text-value">
              {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
            </span>
          ) : (
            <>
              <button onClick={() => setMenuOpen((o) => !o)} className="px-2 text-ash hover:text-ink" aria-label="More">
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-6 z-20 w-48 rounded border border-line bg-field-raised py-1 text-left shadow-lg">
                    {result.nutrition_facts && (
                      <button
                        onClick={() => {
                          setShowNutrition((s) => !s);
                          setMenuOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
                      >
                        {showNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={handleMessage}
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
                    >
                      {t("Message store")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleReport("correct_price")}
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
                    >
                      {t("Price is correct")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleReport("wrong_price")}
                      className="block w-full px-3 py-2 text-left text-sm text-flag hover:bg-field"
                    >
                      {t("Price is wrong")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </td>
      </tr>
      {showNutrition && result.nutrition_facts && (
        <tr>
          <td colSpan={4} className="bg-field px-3 py-2">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ash">
              {t("Nutrition facts")} · {t("AI estimate — check the actual package")}
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
          </td>
        </tr>
      )}
    </>
  );
}
