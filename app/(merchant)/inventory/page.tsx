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

  // On the app, the main "Add Item" action gets a solid ink treatment so
  // it stands out from the two secondary (outline) actions next to it —
  // the same primary/secondary pattern used on the Check Price screen. The
  // website's buttons use the brand's dark green at rest, with the frame
  // lightening on hover/press, so both surfaces read as clearly actionable.
  const buttonClass = isNativeApp
    ? "flex-1 rounded-xl border border-line bg-field px-4 py-3.5 text-center font-display text-[14px] font-medium text-ink shadow-sm transition active:scale-[0.98] active:border-ink active:bg-ink-dark active:text-white"
    : "btn-shine flex-1 rounded border border-value bg-value px-4 py-3 font-display text-[15px] text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105";
  const primaryButtonClass = isNativeApp
    ? "flex-1 rounded-xl bg-field px-4 py-3.5 text-center font-display text-[14px] font-semibold text-ink shadow-md transition active:scale-[0.98] active:bg-ink-dark active:text-white"
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
