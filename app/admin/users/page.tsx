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

export default function AdminUsersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(currentToken: string, q?: string) {
    const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : "/api/admin/users";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/users");
        return;
      }
      setToken(data.session.access_token);
      await load(data.session.access_token);
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

  async function toggleFreeze(user: UserRow) {
    if (!token) return;
    setBusyId(user.id);
    const nextFrozen = !user.is_frozen;
    await fetch(`/api/admin/users/${user.id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ frozen: nextFrozen })
    });
    setRows((r) => r.map((u) => (u.id === user.id ? { ...u, is_frozen: nextFrozen } : u)));
    setBusyId(null);
  }

  async function sendReset(user: UserRow) {
    if (!token) return;
    setBusyId(user.id);
    await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${user.email}.`);
    setBusyId(null);
  }

  async function deleteUser(user: UserRow) {
    if (!token) return;
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    setBusyId(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setRows((r) => r.filter((u) => u.id !== user.id));
    else setNotice((await res.json()).error ?? "Could not delete this account.");
    setBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  return (
    <AppPage maxWidth="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Registered users</h1>
        <a href="/admin/verify-stores" className="font-mono text-xs text-ash underline hover:text-ink">
          Store verification →
        </a>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
          {rows.map((u) => (
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
                  <button
                    disabled={busyId === u.id}
                    onClick={() => toggleFreeze(u)}
                    className="text-ash underline hover:text-ink"
                  >
                    {u.is_frozen ? "Unfreeze" : "Freeze"}
                  </button>
                  <button
                    disabled={busyId === u.id}
                    onClick={() => sendReset(u)}
                    className="text-ash underline hover:text-ink"
                  >
                    Reset password
                  </button>
                  <button
                    disabled={busyId === u.id}
                    onClick={() => deleteUser(u)}
                    className="text-flag underline hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppPage>
  );
}
