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
  address: string;
  city: string;
  commercial_registration: string;
  contact_person_name: string | null;
  admin_email: string | null;
  cr_certificate_url: string | null;
  store_photo_url: string | null;
  logo_url: string | null;
  verification_status: "pending" | "approved" | "rejected";
  owner_is_frozen: boolean;
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
  const [pendingFreeze, setPendingFreeze] = useState<StoreRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  async function load(currentToken: string) {
    const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) setForbidden(true);
    else if (res.ok) setStores(await res.json());
  }

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/stores");
        return;
      }
      const t = data.session.access_token;
      setToken(t);
      await load(t);
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
    setStores((r) => r.map((x) => (x.id === s.id ? { ...x, owner_is_frozen: frozen } : x)));
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

  // Pending stores live under Store requests only — they don't show here
  // until an admin approves them, per the explicit "don't move it until
  // approved" requirement.
  const notPending = stores.filter((s) => s.verification_status !== "pending");
  const filtered = search
    ? notPending.filter(
        (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.city.toLowerCase().includes(search.toLowerCase())
      )
    : notPending;

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Stores and Shops</h1>
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

      {notice && <p className="mb-3 text-sm text-ink">{notice}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>City</th>
            <th>Verification</th>
            <th>Account</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginate(filtered, page).map((s) => (
            <>
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.city}</td>
                <td className="capitalize">{s.verification_status}</td>
                <td>
                  <span className={s.owner_is_frozen ? "text-flag" : "text-value"}>
                    {s.owner_is_frozen ? "Frozen" : "Active"}
                  </span>
                </td>
                <td className="num">
                  <RowActionsMenu
                    disabled={busyId === s.id}
                    actions={[
                      { label: "View details", onClick: () => setExpandedId(expandedId === s.id ? null : s.id) },
                      {
                        label: s.owner_is_frozen ? "Unfreeze" : "Freeze",
                        onClick: () => (s.owner_is_frozen ? toggleFreeze(s, false) : setPendingFreeze(s))
                      },
                      { label: "Reset password", onClick: () => sendReset(s) },
                      { label: "Delete", onClick: () => setPendingDelete(s), danger: true }
                    ]}
                  />
                </td>
              </tr>
              {expandedId === s.id && (
                <tr>
                  <td colSpan={5} className="bg-field">
                    <div className="py-2 text-sm">
                      <p><span className="text-ash">Address:</span> {s.address}, {s.city}</p>
                      <p><span className="text-ash">Commercial registration #:</span> {s.commercial_registration}</p>
                      <p><span className="text-ash">Contact person:</span> {s.contact_person_name ?? "—"}</p>
                      <p><span className="text-ash">Admin email:</span> {s.admin_email ?? "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-4">
                        {s.logo_url && (
                          <div className="flex items-center gap-2">
                            <img src={s.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                            <span className="font-mono text-[11px] text-ash">Logo</span>
                          </div>
                        )}
                        {s.cr_certificate_url && (
                          <a href={s.cr_certificate_url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-ink underline">
                            View CR certificate
                          </a>
                        )}
                        {s.store_photo_url && (
                          <a href={s.store_photo_url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-ink underline">
                            View store front photo
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingFreeze}
        title="Freeze this store's account?"
        message={pendingFreeze ? `${pendingFreeze.name}'s admin won't be able to log in until you unfreeze the account.` : ""}
        confirmLabel="Freeze"
        onCancel={() => setPendingFreeze(null)}
        onConfirm={() => {
          if (pendingFreeze) toggleFreeze(pendingFreeze, true);
          setPendingFreeze(null);
        }}
      />

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
