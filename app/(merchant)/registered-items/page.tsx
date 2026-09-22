"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { InventoryTable, type InventoryRow } from "@/components/merchant/InventoryTable";

export default function RegisteredItemsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortWorstFirst, setSortWorstFirst] = useState(false);

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

  // Worst-to-best: rank by the share of reports that were negative
  // (wrong_price), so an item with 8 wrong out of 10 sorts above one
  // with 1 wrong out of 10, regardless of total report volume. Items
  // with no reports at all sort last — there's nothing bad to flag.
  const sortedRows = sortWorstFirst
    ? [...rows].sort((a, b) => {
        const totalA = (a.report_positive ?? 0) + (a.report_negative ?? 0);
        const totalB = (b.report_positive ?? 0) + (b.report_negative ?? 0);
        const negPctA = totalA ? (a.report_negative ?? 0) / totalA : -1;
        const negPctB = totalB ? (b.report_negative ?? 0) / totalB : -1;
        return negPctB - negPctA;
      })
    : rows;

  return (
    <AppPage>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Registered items")}</h1>
        <button
          onClick={() => {
            setSortWorstFirst((s) => !s);
            setPage(0);
          }}
          className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90"
        >
          {sortWorstFirst ? t("Sorted: worst → best") : t("Sort: worst → best")}
        </button>
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
