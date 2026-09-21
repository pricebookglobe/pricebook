"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

export type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null; size?: number | null; unit?: string | null };
};

export function InventoryTable({
  storeId,
  token,
  rows,
  setRows,
  page,
  onPageChange
}: {
  storeId: string;
  token: string;
  rows: InventoryRow[];
  setRows: (updater: (rows: InventoryRow[]) => InventoryRow[]) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryRow | null>(null);
  const [pendingHide, setPendingHide] = useState<InventoryRow | null>(null);
  const [pendingUnavailable, setPendingUnavailable] = useState<InventoryRow | null>(null);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = paginate(rows, page);

  async function patchItem(row: InventoryRow, patch: { price?: number; in_stock?: boolean; is_hidden?: boolean }) {
    setBusyId(row.id);
    try {
      await fetch(`/api/stores/${storeId}/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: row.products.id, ...patch })
      });
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, ...patch } : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(row: InventoryRow) {
    setRows((r) => r.filter((x) => x.id !== row.id));
    await fetch(`/api/stores/${storeId}/inventory`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: row.products.id })
    });
    setNotice(`${row.products.canonical_name} deleted.`);
  }

  function openEdit(row: InventoryRow) {
    setEditing(row);
    setEditPrice(String(row.price));
  }

  async function saveEdit() {
    if (!editing) return;
    const price = parseFloat(editPrice);
    if (Number.isNaN(price) || price < 0) return;
    setSavingEdit(true);
    await patchItem(editing, { price });
    setSavingEdit(false);
    setEditing(null);
  }

  if (rows.length === 0) return <p className="text-sm text-ash">{t("No items to show.")}</p>;

  return (
    <>
      {notice && <p className="mb-3 text-sm text-ink">{notice}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>{t("Item")}</th>
            <th>{t("Size / Qty")}</th>
            <th>{t("Status")}</th>
            <th className="num">{t("Price")}</th>
            <th className="num">{t("Actions")}</th>
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
                  {row.in_stock ? t("Available") : t("Unavailable")}
                </span>
                {row.is_hidden && <span className="ml-2 text-ash">· {t("Hidden")}</span>}
              </td>
              <td className="num">
                {row.price.toFixed(2)} <span className="text-xs text-ash">{row.currency}</span>
              </td>
              <td className="num">
                <RowActionsMenu
                  disabled={busyId === row.id}
                  actions={[
                    { label: t("Edit item"), onClick: () => openEdit(row) },
                    {
                      label: row.is_hidden ? t("Unhide") : t("Hide"),
                      tone: "warning",
                      onClick: () => (row.is_hidden ? patchItem(row, { is_hidden: false }) : setPendingHide(row))
                    },
                    {
                      label: row.in_stock ? t("Mark unavailable") : t("Mark available"),
                      tone: row.in_stock ? "warning" : "positive",
                      onClick: () => (row.in_stock ? setPendingUnavailable(row) : patchItem(row, { in_stock: true }))
                    },
                    { label: t("Delete"), tone: "danger", onClick: () => setPendingDelete(row) }
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={page} totalItems={rows.length} onPageChange={onPageChange} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-left shadow-2xl">
            <h2 className="font-display text-lg font-semibold text-ink">{t("Edit item")}</h2>
            <p className="mt-1 text-sm text-ash">
              {editing.products.brand ? `${editing.products.brand} ` : ""}
              {editing.products.canonical_name}
            </p>
            <label className="mt-4 block text-sm text-ash">
              {t("Price")} ({editing.currency})
              <input
                type="number"
                step="0.01"
                min="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-value"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white hover:bg-value/90 disabled:opacity-40"
              >
                {savingEdit ? t("Saving…") : t("Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("Delete this item?")}
        message={
          pendingDelete
            ? `Permanently remove ${pendingDelete.products.canonical_name} from your inventory. This cannot be undone.`
            : ""
        }
        confirmLabel={t("Delete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteItem(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingHide}
        title={t("Hide this item?")}
        message={
          pendingHide
            ? `${pendingHide.products.canonical_name} will no longer be visible to customers, even if it's in stock. You can unhide it anytime.`
            : ""
        }
        confirmLabel={t("Hide")}
        tone="warning"
        onCancel={() => setPendingHide(null)}
        onConfirm={() => {
          if (pendingHide) patchItem(pendingHide, { is_hidden: true });
          setPendingHide(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingUnavailable}
        title={t("Mark this item unavailable?")}
        message={
          pendingUnavailable
            ? `${pendingUnavailable.products.canonical_name} will show as out of stock to customers. You can mark it available again anytime.`
            : ""
        }
        confirmLabel={t("Mark unavailable")}
        tone="warning"
        onCancel={() => setPendingUnavailable(null)}
        onConfirm={() => {
          if (pendingUnavailable) patchItem(pendingUnavailable, { in_stock: false });
          setPendingUnavailable(null);
        }}
      />
    </>
  );
}
