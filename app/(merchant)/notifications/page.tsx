"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

const APP_PAGE_SIZE = 5;

// A review notification (unchanged) or a customer price-accuracy report —
// the same "Is this price accurate?" reports that already drive the report
// badge on Registered Items and the count on Store overview now also show
// up here, which they previously never did.
type ReviewNotification = { type: "review"; id: string; rating: number; created_at: string };
type PriceReportNotification = {
  type: "price_report";
  id: string;
  report_type: "correct_price" | "wrong_price";
  product_name: string;
  created_at: string;
};
type Notification = ReviewNotification | PriceReportNotification;

// Same split used everywhere else reviews are summarized: 4-5 stars
// positive, 1-2 negative, 3 neutral.
function resultLabel(rating: number): { text: string; className: string } {
  if (rating >= 4) return { text: "Positive", className: "text-value" };
  if (rating <= 2) return { text: "Negative", className: "text-red-600" };
  return { text: "Neutral", className: "text-ash" };
}

function NotificationSummary({ n, t }: { n: Notification; t: (s: string) => string }) {
  if (n.type === "review") {
    const result = resultLabel(n.rating);
    return (
      <p className={`text-sm font-medium ${result.className}`}>
        {"★".repeat(n.rating)}
        {"☆".repeat(5 - n.rating)} · {t(result.text)}
      </p>
    );
  }
  const isWrong = n.report_type === "wrong_price";
  return (
    <p className={`text-sm font-medium ${isWrong ? "text-red-600" : "text-value"}`}>
      {isWrong ? t("Price reported wrong") : t("Price confirmed correct")}
      {n.product_name ? ` · ${n.product_name}` : ""}
    </p>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const pageSize = isNativeApp ? APP_PAGE_SIZE : undefined;
  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ReviewNotification | null>(null);

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
        router.push("/overview");
        return;
      }
      setStoreId(store.id);
      const res = await fetch(`/api/stores/${store.id}/notifications`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store"
      });
      if (res.ok) setRows(await res.json());
      setLoading(false);
    });
  }, [router]);

  // Only review notifications can be dismissed here — a price report is the
  // same underlying record that powers the Registered Items report badge
  // and the Overview price-report count, so it isn't something this screen
  // can delete without also erasing that trust signal elsewhere.
  async function dismiss(n: ReviewNotification) {
    if (!storeId || !token) return;
    setRows((r) => r.filter((x) => x.id !== n.id));
    await fetch(`/api/stores/${storeId}/notifications`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_id: n.id })
    });
  }

  const visible = paginate(rows, page, pageSize);

  return (
    <AppPage>
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">{t("Notifications")}</h1>
      <p className="mb-6 text-sm text-ash">{t("Every review and price report your store has received.")}</p>

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No notifications yet.")}</p>}

      {visible.length > 0 && isNativeApp && (
        <div className="flex flex-col gap-2">
          {visible.map((n) => (
            <div key={`${n.type}-${n.id}`} className="rounded-lg border border-line bg-field-raised p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-ash">{new Date(n.created_at).toLocaleDateString()}</p>
                  <NotificationSummary n={n} t={t} />
                </div>
                {n.type === "review" && (
                  <button
                    onClick={() => setPendingDelete(n)}
                    className="shrink-0 text-sm text-ash underline hover:text-flag"
                  >
                    {t("Delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 && !isNativeApp && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Date")}</th>
              <th>{t("Result")}</th>
              <th className="num">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => (
              <tr key={`${n.type}-${n.id}`}>
                <td className="font-mono text-xs text-ash">{new Date(n.created_at).toLocaleDateString()}</td>
                <td>
                  <NotificationSummary n={n} t={t} />
                </td>
                <td className="num">
                  {n.type === "review" && (
                    <button onClick={() => setPendingDelete(n)} className="text-sm text-ash underline hover:text-flag">
                      {t("Delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalItems={rows.length} onPageChange={setPage} pageSize={pageSize} />

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("Delete this notification?")}
        message={t("This only removes it from your notifications — the review itself stays visible to customers on your store page.")}
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
