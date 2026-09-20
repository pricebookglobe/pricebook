"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { StoreDetailsDialog } from "@/components/admin/StoreDetailsDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

type StoreRow = {
  id: string;
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
};

export default function PendingStoresPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [detailsStore, setDetailsStore] = useState<StoreRow | null>(null);
  const [pendingApprove, setPendingApprove] = useState<StoreRow | null>(null);
  const [pendingReject, setPendingReject] = useState<StoreRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoreRow | null>(null);

  async function load(currentToken: string) {
    const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) {
      setStores((await res.json()).filter((s: StoreRow) => s.verification_status === "pending"));
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/pending-stores");
        return;
      }
      const t = data.session.access_token;
      setToken(t);
      await load(t);
      setLoading(false);
    });
  }, [router]);

  async function approve(s: StoreRow) {
    if (!token) return;
    setBusyId(s.id);
    await fetch(`/api/admin/stores/${s.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "approved" })
    });
    // Approved stores leave this page — they now live under Stores and Shops.
    setStores((r) => r.filter((x) => x.id !== s.id));
    setNotice(`${s.name} approved and notified by email.`);
    setBusyId(null);
  }

  async function reject(s: StoreRow) {
    if (!token) return;
    setBusyId(s.id);
    await fetch(`/api/admin/stores/${s.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "rejected" })
    });
    setStores((r) => r.filter((x) => x.id !== s.id));
    setNotice(`${s.name} rejected and notified by email.`);
    setBusyId(null);
  }

  async function deleteStore(s: StoreRow) {
    if (!token) return;
    setBusyId(s.id);
    const res = await fetch(`/api/admin/stores/${s.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setStores((r) => r.filter((x) => x.id !== s.id));
      setNotice(`${s.name} deleted.`);
    } else {
      setNotice((await res.json()).error ?? "Could not delete this request.");
    }
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
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Store requests</h1>
      <p className="mb-6 text-sm text-ash">
        New store signups waiting on approval. A store only appears under Stores and Shops once approved.
      </p>

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

      {filtered.length === 0 ? (
        <p className="text-sm text-ash">No pending requests right now.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>City</th>
              <th>CR #</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(filtered, page).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.city}</td>
                <td className="font-mono text-xs">{s.commercial_registration}</td>
                <td className="num">
                  <RowActionsMenu
                    disabled={busyId === s.id}
                    actions={[
                      { label: "View details", onClick: () => setDetailsStore(s) },
                      { label: "Approve", onClick: () => setPendingApprove(s), tone: "positive" },
                      { label: "Reject", onClick: () => setPendingReject(s), tone: "warning" },
                      { label: "Delete", onClick: () => setPendingDelete(s), danger: true }
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />

      <StoreDetailsDialog store={detailsStore} onClose={() => setDetailsStore(null)} />

      <ConfirmDialog
        open={!!pendingApprove}
        title="Approve this store?"
        message={pendingApprove ? `${pendingApprove.name} will go live under Stores and Shops, and its admin will be emailed that they're approved.` : ""}
        confirmLabel="Approve"
        tone="positive"
        onCancel={() => setPendingApprove(null)}
        onConfirm={() => {
          if (pendingApprove) approve(pendingApprove);
          setPendingApprove(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingReject}
        title="Reject this store?"
        message={pendingReject ? `${pendingReject.name}'s registration will be removed, and its admin will be emailed that it wasn't approved.` : ""}
        confirmLabel="Reject"
        tone="warning"
        onCancel={() => setPendingReject(null)}
        onConfirm={() => {
          if (pendingReject) reject(pendingReject);
          setPendingReject(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this request?"
        message={pendingDelete ? `Permanently delete ${pendingDelete.name}'s registration request. This cannot be undone.` : ""}
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
