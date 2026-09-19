"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "customer" | "merchant" | "admin";
  is_frozen: boolean;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(currentToken: string, q?: string) {
    const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : "/api/admin/users";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setUsers((await res.json()).filter((u: UserRow) => u.role !== "admin"));
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
      await load(t);
      setLoading(false);
    });
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    await load(token, search);
    setLoading(false);
  }

  async function toggleFreeze(u: UserRow) {
    if (!token) return;
    setBusyId(u.id);
    setOpenMenuId(null);
    const nextFrozen = !u.is_frozen;
    await fetch(`/api/admin/users/${u.id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ frozen: nextFrozen })
    });
    setUsers((r) => r.map((x) => (x.id === u.id ? { ...x, is_frozen: nextFrozen } : x)));
    setBusyId(null);
  }

  async function sendReset(u: UserRow) {
    if (!token) return;
    setBusyId(u.id);
    setOpenMenuId(null);
    await fetch(`/api/admin/users/${u.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${u.email}.`);
    setBusyId(null);
  }

  async function deleteUser(u: UserRow) {
    if (!token) return;
    setOpenMenuId(null);
    if (!confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setBusyId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setUsers((r) => r.filter((x) => x.id !== u.id));
    else setNotice((await res.json()).error ?? "Could not delete this account.");
    setBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Users</h1>
      <p className="mb-6 text-sm text-ash">Every registered customer and merchant account.</p>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <ClearableSearch
          value={search}
          onChange={setSearch}
          onClear={async () => {
            setSearch("");
            if (token) await load(token);
          }}
          placeholder="Search by name or email…"
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
                <span className={u.is_frozen ? "text-flag" : "text-value"}>{u.is_frozen ? "Frozen" : "Active"}</span>
              </td>
              <td className="relative num">
                <button
                  disabled={busyId === u.id}
                  onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                  className="rounded-sm p-1 text-ash hover:bg-field hover:text-ink"
                  aria-label="Actions"
                >
                  <MoreVertical size={16} />
                </button>
                {openMenuId === u.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-0 top-8 z-20 w-40 rounded border border-line bg-field-raised py-1 text-left shadow-lg">
                      <button onClick={() => toggleFreeze(u)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field">
                        {u.is_frozen ? "Unfreeze" : "Freeze"}
                      </button>
                      <button onClick={() => sendReset(u)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field">
                        Reset password
                      </button>
                      <button onClick={() => deleteUser(u)} className="block w-full px-3 py-2 text-left text-sm text-flag hover:bg-field">
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
