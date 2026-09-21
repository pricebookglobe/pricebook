"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Pagination, paginate } from "@/components/admin/Pagination";

type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null };
};

export function StoreInventoryDialog({
  store,
  onClose
}: {
  store: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!store) return;
    setLoading(true);
    setPage(0);
    fetch(`/api/stores/${store.id}/inventory`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setRows(d ?? []);
        setLoading(false);
      });
  }, [store]);

  if (!store) return null;

  const visible = paginate(rows, page);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 text-left shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-ash hover:bg-field hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <h2 className="pr-8 font-display text-lg font-semibold text-ink">Registered items — {store.name}</h2>
        <p className="mt-1 text-sm text-ash">Every item this store has listed, with its current price.</p>

        {loading && <p className="mt-4 text-sm text-ash">…</p>}
        {!loading && rows.length === 0 && <p className="mt-4 text-sm text-ash">No items listed yet.</p>}

        {visible.length > 0 && (
          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th className="num">Price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
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
                  <td className="font-mono text-xs">
                    <span className={row.in_stock ? "text-value" : "text-flag"}>
                      {row.in_stock ? "Available" : "Unavailable"}
                    </span>
                    {row.is_hidden && <span className="ml-2 text-ash">· Hidden</span>}
                  </td>
                  <td className="num">
                    {row.price.toFixed(2)} <span className="text-xs text-ash">{row.currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
