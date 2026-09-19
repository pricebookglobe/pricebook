"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type HistoryRow = { id: string; query_text: string; category: string | null; searched_at: string };

export default function HistoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
    setRows((r) => r.filter((row) => row.id !== id));
    await fetch(`/api/history/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }

  async function deleteAll() {
    if (!token) return;
    setRows([]);
    await fetch("/api/history", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }

  return (
    <PageShell>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Search history")}</h1>
        {rows.length > 0 && (
          <button onClick={deleteAll} className="font-mono text-xs text-flag underline hover:text-red-600">
            {t("Delete all")}
          </button>
        )}
      </header>

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No searches yet.")}</p>}

      {rows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Search")}</th>
              <th>{t("Category")}</th>
              <th className="num">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.query_text}</td>
                <td className="font-mono text-xs text-ash">
                  {row.category ? `${row.category} · ` : ""}
                  {new Date(row.searched_at).toLocaleDateString()}
                </td>
                <td className="num">
                  <button onClick={() => deleteOne(row.id)} className="text-sm text-ash underline hover:text-flag">
                    {t("Delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
