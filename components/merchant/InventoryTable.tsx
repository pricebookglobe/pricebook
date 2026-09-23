"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { ImageLightbox } from "@/components/shared/ImageLightbox";
import type { NutritionFacts } from "@/lib/aiVision";

export type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null; size?: number | null; unit?: string | null; nutrition_facts?: NutritionFacts | null };
  report_positive?: number;
  report_negative?: number;
};

// Small colored circle with the report count inside — green when mostly
// correct-price reports, red when mostly wrong-price, amber in between,
// grey when the item has no reports yet. Distinct from TrustDot (a plain
// dot for a whole store) since this needs to show the actual number.
function ReportCountBadge({ positive, negative }: { positive: number; negative: number }) {
  const total = positive + negative;
  if (total === 0) {
    return (
      <span
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ash/30 px-1 font-mono text-[10px] font-medium text-ink"
        title="No price reports yet"
      >
        0
      </span>
    );
  }
  const pct = (positive / total) * 100;
  const color = pct > 90 ? "bg-value" : pct >= 75 ? "bg-flag" : "bg-red-600";
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-medium text-white ${color}`}
      title={`${positive} said correct, ${negative} said wrong`}
    >
      {total}
    </span>
  );
}

export function InventoryTable({
  storeId,
  token,
  rows,
  setRows,
  page,
  onPageChange,
  showReportBadge = false
}: {
  storeId: string;
  token: string;
  rows: InventoryRow[];
  setRows: (updater: (rows: InventoryRow[]) => InventoryRow[]) => void;
  page: number;
  onPageChange: (page: number) => void;
  showReportBadge?: boolean;
}) {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryRow | null>(null);
  const [pendingHide, setPendingHide] = useState<InventoryRow | null>(null);
  const [pendingUnavailable, setPendingUnavailable] = useState<InventoryRow | null>(null);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNutrition, setEditNutrition] = useState<NutritionFacts | null>(null);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [viewingNutrition, setViewingNutrition] = useState<InventoryRow | null>(null);

  const visible = paginate(rows, page);

  async function patchItem(
    row: InventoryRow,
    patch: { price?: number; in_stock?: boolean; is_hidden?: boolean; product_name?: string; nutrition_facts?: NutritionFacts | null }
  ) {
    setBusyId(row.id);
    try {
      await fetch(`/api/stores/${storeId}/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: row.products.id, ...patch })
      });
      const { product_name, nutrition_facts, ...rest } = patch;
      setRows((r) =>
        r.map((x) =>
          x.id === row.id
            ? {
                ...x,
                ...rest,
                products: {
                  ...x.products,
                  ...(product_name ? { canonical_name: product_name } : {}),
                  ...(nutrition_facts !== undefined ? { nutrition_facts } : {})
                }
              }
            : x
        )
      );
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
    setEditName(row.products.canonical_name);
    setEditPrice(String(row.price));
    setEditNutrition(row.products.nutrition_facts ?? null);
  }

  function updateEditNutritionField<K extends keyof NutritionFacts>(key: K, value: NutritionFacts[K]) {
    setEditNutrition((n) =>
      n
        ? { ...n, [key]: value }
        : ({ serving_size: null, calories: null, protein_g: null, fat_g: null, carbs_g: null, sugar_g: null, sodium_mg: null, [key]: value } as NutritionFacts)
    );
  }

  async function lookupNutritionForEdit() {
    if (!editing) return;
    setLoadingNutrition(true);
    try {
      const res = await fetch("/api/products/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: editing.products.canonical_name,
          brand: editing.products.brand,
          size: editing.products.size,
          unit: editing.products.unit,
          category: ""
        })
      });
      if (res.ok) setEditNutrition(await res.json());
    } finally {
      setLoadingNutrition(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const price = parseFloat(editPrice);
    if (Number.isNaN(price) || price < 0) return;
    if (!editName.trim()) return;
    setSavingEdit(true);
    const patch: { price: number; product_name?: string; nutrition_facts?: NutritionFacts | null } = { price };
    if (editName.trim() !== editing.products.canonical_name) patch.product_name = editName.trim();
    if (JSON.stringify(editNutrition) !== JSON.stringify(editing.products.nutrition_facts ?? null)) {
      patch.nutrition_facts = editNutrition;
    }
    await patchItem(editing, patch);
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
            {showReportBadge && <th>{t("Reports")}</th>}
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
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(row.products.image_url)}
                      className="shrink-0"
                      aria-label="View image"
                    >
                      <img src={row.products.image_url} alt="" className="h-9 w-9 rounded object-cover hover:opacity-80" />
                    </button>
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
              {showReportBadge && (
                <td>
                  <ReportCountBadge positive={row.report_positive ?? 0} negative={row.report_negative ?? 0} />
                </td>
              )}
              <td className="num">
                {row.price.toFixed(2)} <span className="text-xs text-ash">{row.currency}</span>
              </td>
              <td className="num">
                <RowActionsMenu
                  disabled={busyId === row.id}
                  actions={[
                    { label: t("Edit item"), onClick: () => openEdit(row) },
                    ...(row.products.nutrition_facts
                      ? [{ label: t("View nutrition facts"), onClick: () => setViewingNutrition(row) }]
                      : []),
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
            {editing.products.brand && (
              <p className="mt-1 text-sm text-ash">{editing.products.brand}</p>
            )}
            <label className="mt-3 block text-sm text-ash">
              {t("Item name")}
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
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

            <div className="mt-4 rounded border border-line bg-field p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{t("Nutrition facts")}</p>
                {!editNutrition && (
                  <button
                    type="button"
                    onClick={lookupNutritionForEdit}
                    disabled={loadingNutrition}
                    className="rounded-sm border border-line bg-field-raised px-2 py-1 font-display text-xs text-ink transition-colors hover:border-value hover:bg-value hover:text-white disabled:opacity-40"
                  >
                    {loadingNutrition ? t("Estimating…") : t("Look up nutrition facts")}
                  </button>
                )}
              </div>
              {editNutrition && (
                <>
                  <p className="mt-1 text-[11px] text-ash">
                    {t("AI estimate based on similar products — please check against the actual package before relying on it.")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs text-ash">
                      {t("Serving size")}
                      <input
                        value={editNutrition.serving_size ?? ""}
                        onChange={(e) => updateEditNutritionField("serving_size", e.target.value || null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Calories")}
                      <input
                        type="number"
                        value={editNutrition.calories ?? ""}
                        onChange={(e) => updateEditNutritionField("calories", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Protein (g)")}
                      <input
                        type="number"
                        value={editNutrition.protein_g ?? ""}
                        onChange={(e) => updateEditNutritionField("protein_g", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Fat (g)")}
                      <input
                        type="number"
                        value={editNutrition.fat_g ?? ""}
                        onChange={(e) => updateEditNutritionField("fat_g", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Carbs (g)")}
                      <input
                        type="number"
                        value={editNutrition.carbs_g ?? ""}
                        onChange={(e) => updateEditNutritionField("carbs_g", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Sugar (g)")}
                      <input
                        type="number"
                        value={editNutrition.sugar_g ?? ""}
                        onChange={(e) => updateEditNutritionField("sugar_g", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                    <label className="text-xs text-ash">
                      {t("Sodium (mg)")}
                      <input
                        type="number"
                        value={editNutrition.sodium_mg ?? ""}
                        onChange={(e) => updateEditNutritionField("sodium_mg", e.target.value ? parseFloat(e.target.value) : null)}
                        className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditNutrition(null)}
                    className="mt-2 text-xs text-ash underline hover:text-ink"
                  >
                    {t("Remove nutrition facts")}
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-value"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit || !editName.trim()}
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

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {viewingNutrition && viewingNutrition.products.nutrition_facts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setViewingNutrition(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">{t("Nutrition facts")}</h2>
            <p className="mt-1 text-sm text-ash">{viewingNutrition.products.canonical_name}</p>
            <p className="mt-2 font-mono text-[11px] text-ash">{t("AI estimate — check the actual package")}</p>
            <div className="mt-3 flex flex-col gap-1.5 text-sm text-ink">
              {viewingNutrition.products.nutrition_facts.serving_size && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Serving size")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.serving_size}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.calories != null && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Calories")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.calories}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.protein_g != null && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Protein (g)")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.protein_g}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.fat_g != null && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Fat (g)")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.fat_g}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.carbs_g != null && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Carbs (g)")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.carbs_g}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.sugar_g != null && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-ash">{t("Sugar (g)")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.sugar_g}</strong>
                </div>
              )}
              {viewingNutrition.products.nutrition_facts.sodium_mg != null && (
                <div className="flex justify-between pb-1.5">
                  <span className="text-ash">{t("Sodium (mg)")}</span>
                  <strong>{viewingNutrition.products.nutrition_facts.sodium_mg}</strong>
                </div>
              )}
            </div>
            <button
              onClick={() => setViewingNutrition(null)}
              className="mt-4 w-full rounded-sm bg-ink px-4 py-2 font-display text-sm text-field transition-colors hover:bg-value hover:text-white"
            >
              {t("Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
