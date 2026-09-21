"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";

type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null; size?: number | null; unit?: string | null };
};

export function StoreInventoryDialog({
  store,
  token,
  onClose
}: {
  store: { id: string; name: string } | null;
  token: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryRow | null>(null);
  const [pendingHide, setPendingHide] = useState<InventoryRow | null>(null);
  const [pendingUnavailable, setPendingUnavailable] = useState<InventoryRow | null>(null);

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

  async function deleteItem(row: InventoryRow) {
    if (!token) return;
    setBusyId(row.id);
    setRows((r) => r.filter((x) => x.id !== row.id));
    await fetch("/api/admin/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: row.id })
    });
    setBusyId(null);
  }

  async function patchItem(row: InventoryRow, patch: { in_stock?: boolean; is_hidden?: boolean }) {
    if (!token) return;
    setBusyId(row.id);
    try {
      await fetch("/api/admin/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: row.id, ...patch })
      });
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, ...patch } : x)));
    } finally {
      setBusyId(null);
    }
  }

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
                <th>Size / Qty</th>
                <th>Status</th>
                <th className="num">Price</th>
                <th className="num">Actions</th>
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
                  <td className="font-mono text-xs text-ash">
                    {row.products.size ? `${row.products.size} ${row.products.unit ?? ""}` : "—"}
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
                  <td className="num">
                    <RowActionsMenu
                      disabled={busyId === row.id}
                      actions={[
                        {
                          label: row.is_hidden ? "Unhide" : "Hide",
                          tone: "warning",
                          onClick: () => (row.is_hidden ? patchItem(row, { is_hidden: false }) : setPendingHide(row))
                        },
                        {
                          label: row.in_stock ? "Mark unavailable" : "Mark available",
                          tone: row.in_stock ? "warning" : "positive",
                          onClick: () => (row.in_stock ? setPendingUnavailable(row) : patchItem(row, { in_stock: true }))
                        },
                        { label: "Delete", tone: "danger", onClick: () => setPendingDelete(row) }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this item?"
        message={
          pendingDelete
            ? `Permanently remove ${pendingDelete.products.canonical_name} from ${store.name}'s listings. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteItem(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingHide}
        title="Hide this item?"
        message={
          pendingHide
            ? `${pendingHide.products.canonical_name} will no longer be visible to customers, even if it's in stock.`
            : ""
        }
        confirmLabel="Hide"
        tone="warning"
        onCancel={() => setPendingHide(null)}
        onConfirm={() => {
          if (pendingHide) patchItem(pendingHide, { is_hidden: true });
          setPendingHide(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingUnavailable}
        title="Mark this item unavailable?"
        message={
          pendingUnavailable ? `${pendingUnavailable.products.canonical_name} will show as out of stock to customers.` : ""
        }
        confirmLabel="Mark unavailable"
        tone="warning"
        onCancel={() => setPendingUnavailable(null)}
        onConfirm={() => {
          if (pendingUnavailable) patchItem(pendingUnavailable, { in_stock: false });
          setPendingUnavailable(null);
        }}
      />
    </div>
  );
}
