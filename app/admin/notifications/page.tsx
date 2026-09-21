"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

type ReportRow = {
  id: string;
  report_type: "correct_price" | "wrong_price";
  created_at: string;
  store_id: string;
  store_name: string;
  product_name: string;
  lat: number | null;
  lng: number | null;
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportRow | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/notifications");
        return;
      }
      setToken(data.session.access_token);
      const res = await fetch("/api/admin/price-reports", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (res.ok) setReports(await res.json());
      setLoading(false);
    });
  }, [router]);

  async function deleteReport(report: ReportRow) {
    if (!token) return;
    setBusyId(report.id);
    setReports((r) => r.filter((x) => x.id !== report.id));
    await fetch("/api/admin/price-reports", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: report.id })
    });
    setBusyId(null);
  }

  if (loading) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-5xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  const visible = paginate(reports, page);

  return (
    <AppPage maxWidth="max-w-5xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Notifications</h1>
      <p className="mb-6 text-sm text-ash">Every price-accuracy report shoppers have submitted, across all stores.</p>

      {reports.length === 0 && <p className="text-sm text-ash">No reports yet.</p>}

      {visible.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Item</th>
              <th>Report</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>{r.store_name}</td>
                <td>{r.product_name}</td>
                <td>
                  <span className={r.report_type === "correct_price" ? "text-value" : "text-red-600"}>
                    {r.report_type === "correct_price" ? "+ Price correct" : "− Price wrong"}
                  </span>
                </td>
                <td className="num">
                  <RowActionsMenu
                    disabled={busyId === r.id}
                    actions={[
                      ...(r.lat != null && r.lng != null
                        ? [{ label: "View store on map", onClick: () => window.open(`https://www.google.com/maps?q=${r.lat},${r.lng}&z=16&t=k`, "_blank") }]
                        : []),
                      { label: "Delete", onClick: () => setPendingDelete(r), danger: true }
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={reports.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this report?"
        message={
          pendingDelete
            ? `Permanently remove this price report for ${pendingDelete.product_name} at ${pendingDelete.store_name}.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteReport(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </AppPage>
  );
}
