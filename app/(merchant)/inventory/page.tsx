"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";

type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null };
};

export default function InventoryPage() {
  const router = useRouter();
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
    setRows((r) => r.filter((row) => row.products.id !== productId)); // optimistic
    await fetch(`/api/stores/${storeId}/inventory`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: productId })
    });
  }

  return (
    <PageShell>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Your inventory</h1>
        <a href="/inventory/add" className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-value/90">
          + Add item
        </a>
      </header>

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">No items yet.</p>}

      {rows.map((row) => (
        <div key={row.id} className="ledger-row">
          <div className="flex items-center gap-3">
            {row.products.image_url ? (
              <img src={row.products.image_url} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <div className="h-10 w-10 rounded bg-field" />
            )}
            <div>
              <p className="text-[15px] text-ink">
                {row.products.brand ? `${row.products.brand} ` : ""}
                {row.products.canonical_name}
              </p>
              <p className="font-mono text-xs text-ash">{row.in_stock ? "In stock" : "Out of stock"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-[15px] font-medium text-ink">
              {row.price.toFixed(2)} <span className="text-xs text-ash">{row.currency}</span>
            </span>
            <button
              onClick={() => deleteItem(row.products.id)}
              className="text-sm text-ash underline hover:text-flag"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </PageShell>
  );
}
