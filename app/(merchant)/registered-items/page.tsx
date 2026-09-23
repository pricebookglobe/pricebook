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

  return (
    <AppPage>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Registered items")}</h1>

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
      <p className="mb-6 text-sm text-ash">{t("Every item you've listed, with its size, price, and status.")}</p>

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
