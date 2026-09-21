"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { ImageLightbox } from "@/components/shared/ImageLightbox";

type ItemRow = {
  id: string;
  price: number;
  currency: string;
  product_name: string;
  brand: string | null;
  size: number | null;
  unit: string | null;
  image_url: string | null;
  store_id: string;
  store_name: string;
  lat: number | null;
  lng: number | null;
};

export default function AdminItemsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ItemRow | null>(null);
  const [page, setPage] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  async function load(currentToken: string) {
    const res = await fetch("/api/admin/items", { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/items");
        return;
      }
      setToken(data.session.access_token);
      load(data.session.access_token);
    });
  }, [router]);

  async function deleteItem(item: ItemRow) {
    if (!token) return;
    setBusyId(item.id);
    setItems((r) => r.filter((x) => x.id !== item.id));
    await fetch("/api/admin/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: item.id })
    });
    setBusyId(null);
  }

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      i.product_name.toLowerCase().includes(q) ||
      (i.brand ?? "").toLowerCase().includes(q) ||
      i.store_name.toLowerCase().includes(q)
    );
  });

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Registered items</h1>
      <p className="mb-6 text-sm text-ash">Every item listed by any store on PriceBook.</p>

      <form onSubmit={(e) => e.preventDefault()} className="mb-4 flex gap-2">
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
          placeholder="Search by item name or store…"
        />
      </form>

      {filtered.length === 0 && <p className="text-sm text-ash">No items found.</p>}

      {filtered.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Size / Qty</th>
              <th>Store</th>
              <th className="num">Price</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(filtered, page).map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="flex items-center gap-3">
                    {i.image_url ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(i.image_url)}
                        className="shrink-0"
                        aria-label="View image"
                      >
                        <img src={i.image_url} alt="" className="h-9 w-9 rounded object-cover hover:opacity-80" />
                      </button>
                    ) : (
                      <div className="h-9 w-9 rounded bg-field" />
                    )}
                    <span>
                      {i.brand ? `${i.brand} ` : ""}
                      {i.product_name}
                    </span>
                  </div>
                </td>
                <td className="font-mono text-xs text-ash">{i.size ? `${i.size} ${i.unit ?? ""}` : "—"}</td>
                <td>{i.store_name}</td>
                <td className="num">
                  {i.price.toFixed(2)} <span className="text-xs text-ash">{i.currency}</span>
                </td>
                <td className="num">
                  <RowActionsMenu
                    disabled={busyId === i.id}
                    actions={[
                      ...(i.lat != null && i.lng != null
                        ? [{ label: "View store on map", onClick: () => window.open(`https://www.google.com/maps?q=${i.lat},${i.lng}&z=16&t=k`, "_blank") }]
                        : []),
                      { label: "Delete", onClick: () => setPendingDelete(i), danger: true }
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this item?"
        message={
          pendingDelete
            ? `Permanently remove ${pendingDelete.product_name} from ${pendingDelete.store_name}'s listings. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteItem(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </AppPage>
  );
}
