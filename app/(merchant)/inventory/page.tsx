"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { InventoryTable, type InventoryRow } from "@/components/merchant/InventoryTable";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

export default function InventoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/inventory");
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
      const invRes = await fetch(`/api/stores/${store.id}/inventory`, { cache: "no-store" });
      if (invRes.ok) setRows(await invRes.json());
      setLoading(false);
    });
  }, [router]);

  // On the app, the main "Add Item" action gets a solid blue treatment so
  // it stands out from the two secondary (light green) actions next to it —
  // the same primary/secondary pattern used on the Check Price screen. The
  // website keeps its original single outline style, unchanged.
  const buttonClass = isNativeApp
    ? "flex-1 rounded-xl border border-value/30 bg-value-soft px-4 py-3.5 text-center font-display text-[14px] font-medium text-ink shadow-sm transition active:scale-[0.98] active:bg-value-soft/70"
    : "flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-[15px] text-ink transition-colors hover:border-value hover:bg-value hover:text-white";
  const primaryButtonClass = isNativeApp
    ? "flex-1 rounded-xl bg-blue-600 px-4 py-3.5 text-center font-display text-[14px] font-semibold text-white shadow-md transition active:scale-[0.98]"
    : buttonClass;

  return (
    <AppPage>
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{t("Manage inventory")}</h1>

      <div className={isNativeApp ? "mb-6 grid grid-cols-2 gap-2" : "mb-6 flex flex-col gap-2 sm:flex-row"}>
        <Link href="/inventory/add" className={`${primaryButtonClass}${isNativeApp ? " col-span-2" : ""}`}>
          {t("Add Item")}
        </Link>
        <Link href="/inventory/search" className={buttonClass}>
          {t("Search Items")}
        </Link>
        <Link href="/inventory/bulk" className={buttonClass}>
          {t("Bulk Upload")}
        </Link>
      </div>

      {loading && <p className="text-sm text-ash">…</p>}

      {!loading && storeId && token && (
        <InventoryTable storeId={storeId} token={token} rows={rows} setRows={setRows} page={page} onPageChange={setPage} />
      )}
    </AppPage>
  );
}
