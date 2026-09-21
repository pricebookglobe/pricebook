"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";

type Notification = { id: string; review_id: string; rating: number; created_at: string };

// Same split used everywhere else reviews are summarized: 4-5 stars
// positive, 1-2 negative, 3 neutral.
function resultLabel(rating: number): { text: string; className: string } {
  if (rating >= 4) return { text: "Positive", className: "text-value" };
  if (rating <= 2) return { text: "Negative", className: "text-red-600" };
  return { text: "Neutral", className: "text-ash" };
}

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Notification | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/notifications");
        return;
      }
      setToken(data.session.access_token);
      const storeRes = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await storeRes.json();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      const res = await fetch(`/api/stores/${store.id}/notifications`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) setRows(await res.json());
      setLoading(false);
    });
  }, [router]);

  async function dismiss(n: Notification) {
    if (!storeId || !token) return;
    setRows((r) => r.filter((x) => x.id !== n.id));
    await fetch(`/api/stores/${storeId}/notifications`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_id: n.id })
    });
  }

  const visible = paginate(rows, page);

  return (
    <AppPage>
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">{t("Notifications")}</h1>
      <p className="mb-6 text-sm text-ash">{t("Every review your store has received.")}</p>

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No notifications yet.")}</p>}

      {visible.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Date")}</th>
              <th>{t("Result")}</th>
              <th className="num">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const result = resultLabel(n.rating);
              return (
                <tr key={n.id}>
                  <td className="font-mono text-xs text-ash">{new Date(n.created_at).toLocaleDateString()}</td>
                  <td className={`font-medium ${result.className}`}>
                    {"★".repeat(n.rating)}
                    {"☆".repeat(5 - n.rating)} · {t(result.text)}
                  </td>
                  <td className="num">
                    <button onClick={() => setPendingDelete(n)} className="text-sm text-ash underline hover:text-flag">
                      {t("Delete")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={rows.length} onPageChange={setPage} />

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("Delete this notification?")}
        message="This only removes it from your notifications — the review itself stays visible to customers on your store page."
        confirmLabel={t("Delete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) dismiss(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </AppPage>
  );
}
