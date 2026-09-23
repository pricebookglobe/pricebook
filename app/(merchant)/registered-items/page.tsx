"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { InventoryTable, type InventoryRow } from "@/components/merchant/InventoryTable";

type SortMode = "none" | "alphabetical" | "worst-to-best";

export default function RegisteredItemsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("none");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [fillingNutrition, setFillingNutrition] = useState(false);
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null);
  const [fillNotice, setFillNotice] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/registered-items");
        return;
      }
      setToken(data.session.access_token);
      const storeRes = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await storeRes.json();
      if (!store) {
        router.push("/overview");
        return;
      }
      setStoreId(store.id);
      const invRes = await fetch(`/api/stores/${store.id}/inventory`);
      if (invRes.ok) setRows(await invRes.json());
      setLoading(false);
    });
  }, [router]);

  const sortedRows =
    sortMode === "alphabetical"
      ? [...rows].sort((a, b) =>
          `${a.products.brand ?? ""} ${a.products.canonical_name}`.localeCompare(
            `${b.products.brand ?? ""} ${b.products.canonical_name}`
          )
        )
      : sortMode === "worst-to-best"
      ? // Rank by the share of reports that were negative (wrong_price), so
        // an item with 8 wrong out of 10 sorts above one with 1 wrong out
        // of 10, regardless of total report volume. Items with no reports
        // at all sort last — there's nothing bad to flag.
        [...rows].sort((a, b) => {
          const totalA = (a.report_positive ?? 0) + (a.report_negative ?? 0);
          const totalB = (b.report_positive ?? 0) + (b.report_negative ?? 0);
          const negPctA = totalA ? (a.report_negative ?? 0) / totalA : -1;
          const negPctB = totalB ? (b.report_negative ?? 0) / totalB : -1;
          return negPctB - negPctA;
        })
      : rows;

  const sortLabel =
    sortMode === "alphabetical" ? t("Sorted: A–Z") : sortMode === "worst-to-best" ? t("Sorted: needs attention first") : t("Sort");

  const missingNutrition = rows.filter((r) => !r.products.nutrition_facts);

  async function fillMissingNutrition() {
    if (!storeId || !token || missingNutrition.length === 0) return;
    setFillingNutrition(true);
    setFillNotice(null);
    setFillProgress({ done: 0, total: missingNutrition.length });

    let filled = 0;
    // Sequential, not parallel — this is a batch of real OpenAI calls, and
    // running them one at a time avoids hammering the API with a burst of
    // simultaneous requests for a merchant with a large catalog.
    for (const row of missingNutrition) {
      try {
        const nutritionRes = await fetch("/api/products/nutrition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_name: row.products.canonical_name,
            brand: row.products.brand,
            size: row.products.size,
            unit: row.products.unit,
            category: row.products.category ?? ""
          })
        });
        if (nutritionRes.ok) {
          const facts = await nutritionRes.json();
          await fetch(`/api/stores/${storeId}/inventory`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ product_id: row.products.id, nutrition_facts: facts })
          });
          setRows((r) =>
            r.map((x) => (x.id === row.id ? { ...x, products: { ...x.products, nutrition_facts: facts } } : x))
          );
          filled++;
        }
      } catch {
        // Skip this one and keep going — one failed estimate shouldn't stop the rest.
      }
      setFillProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setFillingNutrition(false);
    setFillProgress(null);
    setFillNotice(t("Filled in nutrition facts for {n} items.").replace("{n}", String(filled)));
  }

  return (
    <AppPage>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Registered items")}</h1>

        <div className="flex items-center gap-2">
          {missingNutrition.length > 0 && (
            <button
              onClick={fillMissingNutrition}
              disabled={fillingNutrition}
              className="rounded-sm border border-line bg-field-raised px-3 py-1.5 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value hover:text-white disabled:opacity-40"
            >
              {fillingNutrition
                ? t("Filling in nutrition facts… ({done} of {total})")
                    .replace("{done}", String(fillProgress?.done ?? 0))
                    .replace("{total}", String(fillProgress?.total ?? 0))
                : t("Fill in missing nutrition facts ({n})").replace("{n}", String(missingNutrition.length))}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setSortMenuOpen((o) => !o)}
              className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90"
            >
              {sortLabel}
            </button>

            {sortMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setSortMode("alphabetical");
                      setSortMenuOpen(false);
                      setPage(0);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
                  >
                    <span className="block font-medium">{t("Alphabetical (A–Z)")}</span>
                    <span className="block text-xs text-ash">{t("Sort items by name")}</span>
                  </button>
                  <button
                    onClick={() => {
                      setSortMode("worst-to-best");
                      setSortMenuOpen(false);
                      setPage(0);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
                  >
                    <span className="block font-medium">{t("Needs attention first")}</span>
                    <span className="block text-xs text-ash">{t("Items with the most price-accuracy complaints, first")}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mb-1 text-sm text-ash">{t("Every item you've listed, with its size, price, and status.")}</p>
      {fillNotice && <p className="mb-4 text-sm text-value">{fillNotice}</p>}
      {!fillNotice && <div className="mb-6" />}

      {loading && <p className="text-sm text-ash">…</p>}

      {!loading && storeId && token && (
        <InventoryTable
          storeId={storeId}
          token={token}
          rows={sortedRows}
          setRows={setRows}
          page={page}
          onPageChange={setPage}
          showReportBadge
        />
      )}
    </AppPage>
  );
}
