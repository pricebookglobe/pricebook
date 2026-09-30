"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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
  const [pendingDelete, setPendingDelete] = useState<Notification | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);

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

  // A review notification is actually deleted; a price-report notification
  // is only marked dismissed server-side (see the API route) so the report
  // keeps counting toward the Registered Items badge and the Overview
  // summary — it just stops showing up in this list.
  async function dismiss(n: Notification) {
    if (!storeId || !token) return;
    setRows((r) => r.filter((x) => !(x.type === n.type && x.id === n.id)));
    await fetch(`/api/stores/${storeId}/notifications`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_id: n.id, type: n.type })
    });
  }

  async function dismissAll() {
    if (!storeId || !token) return;
    setRows([]);
    setPage(0);
    await fetch(`/api/stores/${storeId}/notifications`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ all: true })
    });
  }

  const visible = paginate(rows, page, pageSize);

  return (
    <AppPage>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Notifications")}</h1>
        {rows.length > 0 && isNativeApp && (
          <button
            onClick={() => setPendingDeleteAll(true)}
            className="rounded-md bg-red-600 px-3 py-1.5 font-mono text-[11px] font-medium text-white shadow-sm active:scale-[0.98]"
          >
            {t("Delete all")}
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-ash">{t("Every review and price report your store has received.")}</p>

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No notifications yet.")}</p>}

      {visible.length > 0 && isNativeApp && (
        <div className="flex flex-col gap-2">
          {visible.map((n) => (
            <div key={`${n.type}-${n.id}`} className="relative rounded-lg border border-line bg-field-raised p-3 pr-9">
              <p className="font-mono text-[11px] text-ash">{new Date(n.created_at).toLocaleDateString()}</p>
              <NotificationSummary n={n} t={t} />
              <button
                onClick={() => setPendingDelete(n)}
                aria-label={t("Delete")}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-red-600 hover:bg-red-50"
              >
                <X size={16} strokeWidth={2.25} />
              </button>
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
                  <button onClick={() => setPendingDelete(n)} className="text-sm text-red-600 underline hover:text-red-700">
                    {t("Delete")}
                  </button>
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
        message={
          pendingDelete?.type === "review"
            ? t("This only removes it from your notifications — the review itself stays visible to customers on your store page.")
            : t("This only removes it from your notifications — the price report still counts on Registered Items and Store overview.")
        }
        confirmLabel={t("Delete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) dismiss(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteAll}
        title={t("Delete all notifications?")}
        message={t("This only removes them from your notifications — reviews and price reports themselves are unaffected.")}
        confirmLabel={t("Delete all")}
        onCancel={() => setPendingDeleteAll(false)}
        onConfirm={() => {
          dismissAll();
          setPendingDeleteAll(false);
        }}
      />
    </AppPage>
  );
}
