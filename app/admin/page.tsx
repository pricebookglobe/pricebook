"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";

type Stats = {
  user_count: number;
  store_count: number;
  item_count: number;
  avg_items_per_store: number;
  pending_store_count: number;
  positive_review_count: number;
  positive_review_pct: number;
  negative_review_count: number;
  negative_review_pct: number;
};

function StatBox({ value, label, valueClassName }: { value: string | number; label: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-6 text-center">
      <p className={`font-display text-4xl font-bold ${valueClassName ?? "text-ink"}`}>{value}</p>
      <p className="mt-2 font-mono text-xs font-medium uppercase tracking-wide text-ash">{label}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin");
        return;
      }
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (res.status === 403) setForbidden(true);
      else if (res.ok) setStats(await res.json());
      setLoading(false);
    });
  }, [router]);

  if (loading) return <AppPage maxWidth="max-w-4xl"><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage maxWidth="max-w-4xl"><p className="text-sm text-flag">Admins only.</p></AppPage>;

  return (
    <AppPage maxWidth="max-w-4xl">
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">Admin platform</h1>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox value={stats.user_count} label="Registered customers" />
          <StatBox value={stats.store_count} label="Registered stores" />
          <StatBox value={stats.pending_store_count} label="Stores pending admin approval" />
          <StatBox value={stats.item_count} label="Registered items" />
          <StatBox value={stats.avg_items_per_store} label="Avg. items / store" />
          <StatBox
            value={`${stats.positive_review_count} (${stats.positive_review_pct}%)`}
            label="Positive reviews"
            valueClassName="text-value"
          />
          <StatBox
            value={`${stats.negative_review_count} (${stats.negative_review_pct}%)`}
            label="Negative reviews"
            valueClassName="text-red-600"
          />
        </div>
      )}
    </AppPage>
  );
}
