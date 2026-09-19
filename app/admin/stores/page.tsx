"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

type StoreRow = {
  id: string;
  owner_id: string;
  name: string;
  city: string;
  commercial_registration: string;
  contact_person_name: string | null;
  admin_email: string | null;
  verification_status: "pending" | "approved" | "rejected";
};

export default function AdminStoresPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoreRow | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/stores");
        return;
      }
      const t = data.session.access_token;
      setToken(t);
      const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 403) setForbidden(true);
      else if (res.ok) setStores(await res.json());
      setLoading(false);
    });
  }, [router]);

  async function toggleFreeze(s: StoreRow, frozen: boolean) {
    if (!token) return;
    setBusyId(s.id);
    await fetch(`/api/admin/users/${s.owner_id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ frozen })
    });
    setNotice(`${s.name}'s account ${frozen ? "frozen" : "unfrozen"}.`);
    setBusyId(null);
  }

  async function sendReset(s: StoreRow) {
    if (!token) return;
    setBusyId(s.id);
    await fetch(`/api/admin/users/${s.owner_id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${s.admin_email ?? "the store's admin email"}.`);
    setBusyId(null);
  }

  async function deleteStore(s: StoreRow) {
    if (!token) return;
    setBusyId(s.id);
    const res = await fetch(`/api/admin/users/${s.owner_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setStores((r) => r.filter((x) => x.id !== s.id));
    else setNotice((await res.json()).error ?? "Could not delete this store's account.");
    setBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  const filtered = search
    ? stores.filter(
        (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.city.toLowerCase().includes(search.toLowerCase())
      )
    : stores;

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Stores</h1>
      <p className="mb-6 text-sm text-ash">Every registered store — actions here manage the store's admin account.</p>

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
          placeholder="Search by store name or city…"
        />
      </div>

      {notice && <p className="mb-3 text-sm text-value">{notice}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>City</th>
            <th>CR #</th>
            <th>Status</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginate(filtered, page).map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.city}</td>
              <td className="font-mono text-xs">{s.commercial_registration}</td>
              <td className="capitalize">{s.verification_status}</td>
              <td className="num">
                <RowActionsMenu
                  disabled={busyId === s.id}
                  actions={[
                    { label: "Freeze", onClick: () => toggleFreeze(s, true) },
                    { label: "Unfreeze", onClick: () => toggleFreeze(s, false) },
                    { label: "Reset password", onClick: () => sendReset(s) },
                    { label: "Delete", onClick: () => setPendingDelete(s), danger: true }
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete store account?"
        message={pendingDelete ? `Permanently delete ${pendingDelete.name}'s account? This removes the store too and cannot be undone.` : ""}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteStore(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </AppPage>
  );
}
