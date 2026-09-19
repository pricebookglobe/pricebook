"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";

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
    await fetch(`/api/admin/users/${u.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotice(`Reset link sent to ${u.email}.`);
    setBusyId(null);
  }

  async function deleteUser(u: UserRow) {
    if (!token) return;
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
              <td className="num">
                <RowActionsMenu
                  disabled={busyId === u.id}
                  actions={[
                    { label: u.is_frozen ? "Unfreeze" : "Freeze", onClick: () => toggleFreeze(u) },
                    { label: "Reset password", onClick: () => sendReset(u) },
                    { label: "Delete", onClick: () => deleteUser(u), danger: true }
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppPage>
  );
}
