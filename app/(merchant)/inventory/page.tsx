"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

type InventoryRow = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  products: { id: string; canonical_name: string; brand: string | null; image_url: string | null };
};

export default function InventoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryRow | null>(null);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadInventory(currentStoreId: string) {
    const invRes = await fetch(`/api/stores/${currentStoreId}/inventory`);
    if (invRes.ok) setRows(await invRes.json());
    setLoading(false);
  }

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
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      await loadInventory(store.id);
    });
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = `${row.products.brand ?? ""} ${row.products.canonical_name}`.toLowerCase();
      return name.includes(q);
    });
  }, [rows, search]);

  const visible = paginate(filtered, page);

  async function patchItem(row: InventoryRow, patch: { price?: number; in_stock?: boolean; is_hidden?: boolean }) {
    if (!storeId || !token) return;
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
    if (!storeId || !token) return;
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

  return (
    <AppPage>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Manage inventory")}</h1>
        <Link href="/inventory/add" className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-value/90">
          {t("+ Add item")}
        </Link>
      </header>

      <div className="mb-4 flex gap-2">
        <ClearableSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          onClear={() => {
            setSearch("");
            setPage(0);
          }}
          placeholder={t("Search your items…")}
        />
      </div>

      {notice && <p className="mb-3 text-sm text-ink">{notice}</p>}

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-ash">{t("No items yet.")}</p>}

      {visible.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Item")}</th>
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
                        onClick: () => patchItem(row, { is_hidden: !row.is_hidden })
                      },
                      {
                        label: row.in_stock ? t("Mark unavailable") : t("Mark available"),
                        tone: row.in_stock ? "warning" : "positive",
                        onClick: () => patchItem(row, { in_stock: !row.in_stock })
                      },
                      { label: t("Delete"), tone: "danger", onClick: () => setPendingDelete(row) }
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />

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
    </AppPage>
  );
}
