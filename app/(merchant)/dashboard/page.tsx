"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoreRanking, type RankingRow } from "@/lib/api";
import { RankingBadge } from "@/components/merchant/RankingBadge";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function MerchantDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [store, setStore] = useState<{ id: string; name: string; view_count?: number; verification_status?: string } | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/dashboard");
        return;
      }
      const res = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const s = await res.json();
      if (!s) {
        router.push("/store-profile");
        return;
      }
      setStore(s);
      const ranking = await getStoreRanking(s.id);
      setRows(ranking);
      const msgRes = await fetch(`/api/stores/${s.id}/messages`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (msgRes.ok) setMessageCount((await msgRes.json()).length);
      setLoading(false);
    });
  }, [router]);

  return (
    <AppPage>
      {store?.verification_status === "pending" && (
        <div className="mb-6 rounded border border-flag bg-flag/10 px-4 py-3 text-sm text-ink">
          Your store is pending admin verification. You can preview the dashboard, but customers won't see your
          listings until you're approved.
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <a href="/inventory" className="rounded-sm border border-line bg-field px-3 py-1.5 font-display text-sm text-ink hover:border-ink/30">
          {t("Manage inventory")}
        </a>
        <a href="/inventory/add" className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-value/90">
          {t("+ Add item")}
        </a>
        <a href="/messages" className="rounded-sm border border-line bg-field px-3 py-1.5 font-display text-sm text-ink hover:border-ink/30">
          Messages {messageCount > 0 && `(${messageCount})`}
        </a>
      </div>

      {store && (
        <p className="mb-6 font-mono text-xs text-ash">
          {store.view_count ?? 0} people have viewed your store page.
        </p>
      )}

      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-ash">{t("No ranking yet — add inventory and check back after the next nightly run.")}</p>
      )}

      {rows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Category")}</th>
              <th className="num">{t("Trust")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RankingBadge key={row.category} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </AppPage>
  );
}
