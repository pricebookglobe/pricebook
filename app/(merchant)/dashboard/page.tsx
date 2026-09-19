"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoreRanking, type RankingRow } from "@/lib/api";
import { RankingBadge } from "@/components/merchant/RankingBadge";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { AccountMenu } from "@/components/shared/AccountMenu";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function MerchantDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
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
      const store = await res.json();
      if (!store) {
        router.push("/store-profile");
        return;
      }
      setStoreName(store.name);
      const ranking = await getStoreRanking(store.id);
      setRows(ranking);
      setLoading(false);
    });
  }, [router]);

  return (
    <PageShell>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{storeName ?? t("Your store")}</h1>
          <p className="mt-1 text-sm text-ash">{t("Ranked daily against every store in your 5km zone.")}</p>
        </div>
        <AccountMenu />
      </header>

      <div className="mb-6 flex gap-2">
        <a
          href="/inventory"
          className="rounded-sm border border-line bg-field-raised px-3 py-1.5 font-display text-sm text-ink hover:border-ink/30"
        >
          {t("Manage inventory")}
        </a>
        <a
          href="/inventory/add"
          className="rounded-sm bg-value px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-value/90"
        >
          {t("+ Add item")}
        </a>
      </div>

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
    </PageShell>
  );
}
