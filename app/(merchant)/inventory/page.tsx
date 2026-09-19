"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null };
};

export default function InventoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);

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
        router.push("/store-profile");
        return;
      }
      setStoreId(store.id);
      const invRes = await fetch(`/api/stores/${store.id}/inventory`);
      if (invRes.ok) setRows(await invRes.json());
      setLoading(false);
    });
  }, [router]);

  async function deleteItem(productId: string) {
    if (!storeId || !token) return;
    setRows((r) => r.filter((row) => row.products.id !== productId));
    await fetch(`/api/stores/${storeId}/inventory`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: productId })
    });
  }

  return (
    <PageShell>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Your inventory")}</h1>
        <a href="/inventory/add" className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-value/90">
          {t("+ Add item")}
        </a>
      </header>

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No items yet.")}</p>}

      {rows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Item")}</th>
              <th>{t("Status")}</th>
              <th className="num">{t("Price")}</th>
              <th className="num">{t("Delete")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="flex items-center gap-3">
                    {row.products.image_url ? (
                      <img src={row.products.image_url} alt="" className="h-9 w-9 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-field" />
                    )}
                    <span>
                      {row.products.brand ? `${row.products.brand} ` : ""}
                      {row.products.canonical_name}
                    </span>
                  </div>
                </td>
                <td className="font-mono text-xs text-ash">{row.in_stock ? t("In stock") : t("Out of stock")}</td>
                <td className="num">
                  {row.price.toFixed(2)} <span className="text-xs text-ash">{row.currency}</span>
                </td>
                <td className="num">
                  <button onClick={() => deleteItem(row.products.id)} className="text-sm text-ash underline hover:text-flag">
                    {t("Delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
