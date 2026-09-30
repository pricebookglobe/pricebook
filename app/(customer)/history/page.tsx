"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type HistoryRow = { id: string; query_text: string; category: string | null; searched_at: string };

export default function HistoryPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pendingDeleteOne, setPendingDeleteOne] = useState<HistoryRow | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);

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
    setPage(0);
    await fetch("/api/history", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }

  // If the current page no longer has anything on it (e.g. the last row on
  // the last page was just deleted), step back a page instead of showing
  // a blank table with the pager stuck past the end.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / 10));
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [rows.length, page]);

  const pagedRows = paginate(rows, page);

  return (
    <AppPage>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Search history")}</h1>
        {rows.length > 0 && (
          <button onClick={() => setPendingDeleteAll(true)} className="font-mono text-xs text-flag underline hover:text-red-600">
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
            {pagedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.query_text}</td>
                <td className="font-mono text-xs text-ash">
                  {row.category ? `${row.category} · ` : ""}
                  {new Date(row.searched_at).toLocaleDateString()}
                </td>
                <td className="num">
                  <button onClick={() => setPendingDeleteOne(row)} className="text-sm text-ash underline hover:text-flag">
                    {t("Delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />}

      <ConfirmDialog
        open={!!pendingDeleteOne}
        title={t("Delete this search?")}
        message={t("This removes it from your search history. This cannot be undone.")}
        confirmLabel={t("Delete")}
        onCancel={() => setPendingDeleteOne(null)}
        onConfirm={() => {
          if (pendingDeleteOne) deleteOne(pendingDeleteOne.id);
          setPendingDeleteOne(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteAll}
        title={t("Delete all search history?")}
        message={t("This removes every search from your history. This cannot be undone.")}
        confirmLabel={t("Delete all")}
        onCancel={() => setPendingDeleteAll(false)}
        onConfirm={() => {
          deleteAll();
          setPendingDeleteAll(false);
        }}
      />
    </AppPage>
  );
}
