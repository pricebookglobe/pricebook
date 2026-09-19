"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "customer" | "merchant" | "admin";
  is_frozen: boolean;
  created_at: string;
};

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

export default function AdminPlatformPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userBusyId, setUserBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeBusyId, setStoreBusyId] = useState<string | null>(null);

  async function loadUsers(currentToken: string, q?: string) {
    const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : "/api/admin/users";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setUsers(await res.json());
  }

  async function loadStores(currentToken: string) {
    const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.ok) setStores(await res.json());
  }

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin");
        return;
      }
      const t = data.session.access_token;
      setToken(t);
      await Promise.all([loadUsers(t), loadStores(t)]);
      setLoading(false);
    });
  }, [router]);

  async function handleUserSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    await loadUsers(token, userSearch);
    setLoading(false);
  }

  async function toggleFreeze(user: UserRow) {
    if (!token) return;
    setUserBusyId(user.id);
    const nextFrozen = !user.is_frozen;
    await fetch(`/api/admin/users/${user.id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ frozen: nextFrozen })
    });
    setUsers((r) => r.map((u) => (u.id === user.id ? { ...u, is_frozen: nextFrozen } : u)));
    setUserBusyId(null);
  }

  async function sendReset(user: UserRow) {
    if (!token) return;
    setUserBusyId(user.id);
    await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${user.email}.`);
    setUserBusyId(null);
  }

  async function deleteUser(user: UserRow) {
    if (!token) return;
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    setUserBusyId(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setUsers((r) => r.filter((u) => u.id !== user.id));
    else setNotice((await res.json()).error ?? "Could not delete this account.");
    setUserBusyId(null);
  }

  async function decideStore(id: string, status: "approved" | "rejected") {
    if (!token) return;
    setStoreBusyId(id);
    setStores((r) => r.map((s) => (s.id === id ? { ...s, verification_status: status } : s)));
    await fetch(`/api/admin/stores/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    setStoreBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">Admin platform</h1>

      {/* Registered users */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-[15px] font-medium text-ink">Registered users</h2>

        <form onSubmit={handleUserSearch} className="mb-4 flex gap-2">
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 rounded border border-line bg-field px-3 py-2 text-sm text-ink outline-none"
          />
          <button type="submit" className="rounded-sm bg-ink px-4 py-2 font-display text-sm text-field">
            Search
          </button>
        </form>

        {notice && <p className="mb-3 text-sm text-value">{notice}</p>}

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="font-mono text-xs">{u.email}</td>
                <td className="font-mono text-xs capitalize">{u.role}</td>
                <td>
                  <span className={u.is_frozen ? "text-flag" : "text-value"}>
                    {u.is_frozen ? "Frozen" : "Active"}
                  </span>
                </td>
                <td className="num">
                  <div className="flex justify-end gap-3 font-mono text-xs">
                    <button disabled={userBusyId === u.id} onClick={() => toggleFreeze(u)} className="text-ash underline hover:text-ink">
                      {u.is_frozen ? "Unfreeze" : "Freeze"}
                    </button>
                    <button disabled={userBusyId === u.id} onClick={() => sendReset(u)} className="text-ash underline hover:text-ink">
                      Reset password
                    </button>
                    <button disabled={userBusyId === u.id} onClick={() => deleteUser(u)} className="text-flag underline hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Registered stores */}
      <section>
        <h2 className="mb-3 font-display text-[15px] font-medium text-ink">Registered stores</h2>

        <table className="data-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>City</th>
              <th>CR #</th>
              <th>Contact</th>
              <th className="num">Status / Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {(s.cr_certificate_url || s.store_photo_url) && (
                    <div className="mt-1 flex gap-2 font-mono text-[11px]">
                      {s.cr_certificate_url && (
                        <a href={s.cr_certificate_url} target="_blank" rel="noreferrer" className="text-ash underline hover:text-ink">
                          CR cert
                        </a>
                      )}
                      {s.store_photo_url && (
                        <a href={s.store_photo_url} target="_blank" rel="noreferrer" className="text-ash underline hover:text-ink">
                          Photo
                        </a>
                      )}
                    </div>
                  )}
                </td>
                <td>{s.city}</td>
                <td className="font-mono text-xs">{s.commercial_registration}</td>
                <td className="font-mono text-xs">{s.contact_person_name ?? "—"}</td>
                <td className="num">
                  {s.verification_status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={storeBusyId === s.id}
                        onClick={() => decideStore(s.id, "approved")}
                        className="rounded-sm bg-value px-2.5 py-1 text-xs font-medium text-white"
                      >
                        Approve
                      </button>
                      <button
                        disabled={storeBusyId === s.id}
                        onClick={() => decideStore(s.id, "rejected")}
                        className="rounded-sm bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className={s.verification_status === "approved" ? "text-value" : "text-flag"}>
                      {s.verification_status}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppPage>
  );
}
