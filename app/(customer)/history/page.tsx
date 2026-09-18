"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";

type HistoryRow = { id: string; query_text: string; category: string | null; searched_at: string };

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/history");
        return;
      }
      setToken(data.session.access_token);
      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) setRows(await res.json());
      setLoading(false);
    });
  }, [router]);

  async function deleteOne(id: string) {
    if (!token) return;
    setRows((r) => r.filter((row) => row.id !== id)); // optimistic
    await fetch(`/api/history/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }

  async function deleteAll() {
    if (!token) return;
    setRows([]); // optimistic
    await fetch("/api/history", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }

  return (
    <PageShell>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Search history</h1>
        {rows.length > 0 && (
          <button onClick={deleteAll} className="font-mono text-xs text-flag underline hover:text-red-600">
            Delete all
          </button>
        )}
      </header>

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">No searches yet.</p>}

      {rows.map((row) => (
        <div key={row.id} className="ledger-row">
          <div>
            <p className="text-[15px] text-ink">{row.query_text}</p>
            <p className="font-mono text-xs text-ash">
              {row.category ? `${row.category} · ` : ""}
              {new Date(row.searched_at).toLocaleDateString()}
            </p>
          </div>
          <button onClick={() => deleteOne(row.id)} className="text-sm text-ash underline hover:text-flag">
            Delete
          </button>
        </div>
      ))}
    </PageShell>
  );
}
