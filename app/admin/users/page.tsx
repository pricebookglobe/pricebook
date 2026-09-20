"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { ClearableSearch } from "@/components/admin/ClearableSearch";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

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
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);
  const [pendingFreeze, setPendingFreeze] = useState<UserRow | null>(null);
  const [page, setPage] = useState(0);

  async function load(currentToken: string, q?: string) {
    const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : "/api/admin/users";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${currentToken}` } });
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setUsers((await res.json()).filter((u: UserRow) => u.role === "customer"));
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
    setPage(0);
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
      <p className="mb-6 text-sm text-ash">Every registered customer account. Store admins are listed under Stores.</p>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <ClearableSearch
          value={search}
          onChange={setSearch}
          onClear={async () => {
            setSearch("");
            setPage(0);
            if (token) await load(token);
          }}
          placeholder="Search by name or email…"
        />
        <button type="submit" className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm text-white hover:bg-blue-700">
          Search
        </button>
      </form>

      {notice && <p className="mb-3 text-sm text-ink">{notice}</p>}

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
          {paginate(users, page).map((u) => (
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
                    { label: u.is_frozen ? "Unfreeze" : "Freeze", onClick: () => (u.is_frozen ? toggleFreeze(u) : setPendingFreeze(u)), tone: u.is_frozen ? "positive" : "warning" },
                    { label: "Reset password", onClick: () => sendReset(u) },
                    { label: "Delete", onClick: () => setPendingDelete(u), danger: true }
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={page} totalItems={users.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingFreeze}
        title="Freeze this account?"
        message={pendingFreeze ? `${pendingFreeze.full_name || pendingFreeze.email} won't be able to log in until you unfreeze the account.` : ""}
        confirmLabel="Freeze"
        onCancel={() => setPendingFreeze(null)}
        onConfirm={() => {
          if (pendingFreeze) toggleFreeze(pendingFreeze);
          setPendingFreeze(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete user?"
        message={pendingDelete ? `Permanently delete ${pendingDelete.email}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteUser(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </AppPage>
  );
}
