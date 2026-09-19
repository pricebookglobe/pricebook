"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setOpenMenuId(null);
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
    setOpenMenuId(null);
    await fetch(`/api/admin/users/${s.owner_id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${s.admin_email ?? "the store's admin email"}.`);
    setBusyId(null);
  }

  async function deleteStore(s: StoreRow) {
    if (!token) return;
    setOpenMenuId(null);
    if (!confirm(`Permanently delete ${s.name}'s account? This removes the store too and cannot be undone.`)) return;
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
        <ClearableSearch value={search} onChange={setSearch} onClear={() => setSearch("")} placeholder="Search by store name or city…" />
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
          {filtered.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.city}</td>
              <td className="font-mono text-xs">{s.commercial_registration}</td>
              <td className="capitalize">{s.verification_status}</td>
              <td className="relative num">
                <button
                  disabled={busyId === s.id}
                  onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                  className="rounded-sm p-1 text-ash hover:bg-field hover:text-ink"
                  aria-label="Actions"
                >
                  <MoreVertical size={16} />
                </button>
                {openMenuId === s.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-0 top-8 z-20 w-40 rounded border border-line bg-field-raised py-1 text-left shadow-lg">
                      <button onClick={() => toggleFreeze(s, true)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field">
                        Freeze
                      </button>
                      <button onClick={() => toggleFreeze(s, false)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field">
                        Unfreeze
                      </button>
                      <button onClick={() => sendReset(s)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field">
                        Reset password
                      </button>
                      <button onClick={() => deleteStore(s)} className="block w-full px-3 py-2 text-left text-sm text-flag hover:bg-field">
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppPage>
  );
}
