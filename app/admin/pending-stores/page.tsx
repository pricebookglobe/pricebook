"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/pending-stores");
        return;
      }
      const t = data.session.access_token;
      setToken(t);
      const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 403) {
        setForbidden(true);
      } else if (res.ok) {
        setStores((await res.json()).filter((s: StoreRow) => s.verification_status === "pending"));
      }
      setLoading(false);
    });
  }, [router]);

  async function decide(id: string, status: "approved" | "rejected") {
    if (!token) return;
    setBusyId(id);
    await fetch(`/api/admin/stores/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    // Decided stores drop off this list — it's specifically "pending" requests.
    setStores((r) => r.filter((s) => s.id !== id));
    setBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-4xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-4xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  const filtered = stores.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppPage maxWidth="max-w-4xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Store requests</h1>
      <p className="mb-6 text-sm text-ash">New store signups waiting on approval.</p>

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

      {stores.length === 0 && <p className="text-sm text-ash">No pending requests right now.</p>}

      {paginate(filtered, page).map((s) => (
        <div key={s.id} className="mb-3 rounded border border-line bg-field p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-[15px] font-medium text-ink">{s.name}</p>
              <p className="text-sm text-ash">{s.address}, {s.city}</p>
            </div>

            <RowActionsMenu
              disabled={busyId === s.id}
              actions={[
                { label: "View details", onClick: () => setExpandedId(expandedId === s.id ? null : s.id) },
                { label: "Approve", onClick: () => decide(s.id, "approved") },
                { label: "Reject", onClick: () => decide(s.id, "rejected"), danger: true }
              ]}
            />
          </div>

          {expandedId === s.id && (
            <div className="mt-3 border-t border-line pt-3 text-sm">
              <p><span className="text-ash">CR #:</span> {s.commercial_registration}</p>
              <p><span className="text-ash">Contact:</span> {s.contact_person_name ?? "—"}</p>
              <p><span className="text-ash">Admin email:</span> {s.admin_email ?? "—"}</p>
              <div className="mt-2 flex gap-3 font-mono text-[11px]">
                {s.cr_certificate_url && (
                  <a href={s.cr_certificate_url} target="_blank" rel="noreferrer" className="text-ink underline">
                    View CR certificate
                  </a>
                )}
                {s.store_photo_url && (
                  <a href={s.store_photo_url} target="_blank" rel="noreferrer" className="text-ink underline">
                    View store photo
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />
    </AppPage>
  );
}
