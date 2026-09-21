"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppPage } from "@/components/shared/AppPage";
import { useAccount } from "@/lib/AccountProvider";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type ProductPosition = { product_id: string; product_name: string; price: number; currency: string; percentile: number };
type Overview = {
  product_count: number;
  view_count: number;
  verification_status: string | null;
  overall_percentile: number | null;
  products: ProductPosition[];
  review_count: number;
  positive_reviews: number;
  negative_reviews: number;
  price_report_count: number;
  correct_price_reports: number;
  wrong_price_reports: number;
};

export default function StoreOverviewPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, storeId, token, loading: accountLoading } = useAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  function positionLabel(percentile: number): string {
    // percent_rank: 0 = cheapest in town, 100 = most expensive. Flip it to a
    // "cheaper than X%" framing, which is the number merchants actually want.
    const cheaperThan = Math.round(100 - percentile);
    return t("Cheaper than {n}% of town").replace("{n}", String(cheaperThan));
  }

  useEffect(() => {
    if (accountLoading) return;
    if (!token || !profile) {
      router.push("/login?next=/overview");
      return;
    }
    // This page (and every merchant-only page that redirects here when it
    // can't find a store) previously only checked storeId, not role — so a
    // customer or admin who ever landed here saw a scary "couldn't find a
    // store" message instead of being sent to their own home. Only an
    // actual merchant account with no store at all is the real anomaly.
    if (profile.role === "admin") {
      router.replace("/admin");
      return;
    }
    if (profile.role === "customer") {
      router.replace("/check-price");
      return;
    }
    if (!storeId) {
      setLoading(false);
      return;
    }
    fetch(`/api/stores/${storeId}/overview`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [accountLoading, profile, token, storeId, router]);

  if (!accountLoading && profile?.role === "merchant" && !storeId) {
    return (
      <AppPage>
        <p className="text-sm text-flag">
          {t("We couldn't find a store on your account. This shouldn't happen — please contact pricebook@institute-of-ai.org for help.")}
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage maxWidth="max-w-3xl">
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">{t("Store overview")}</h1>

      {(loading || accountLoading) && <p className="text-sm text-ash">…</p>}

      {data && (
        <>
          {data.verification_status === "pending" && (
            <div className="mb-6 rounded border border-flag bg-flag/10 px-4 py-3 text-sm text-ink">
              {t("Your store is pending admin verification. You can preview your dashboard, but customers won't see your listings until you're approved.")}
            </div>
          )}

          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-ink">{data.product_count}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">{t("Products listed")}</p>
            </div>
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-ink">{data.view_count}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">{t("Store page views")}</p>
            </div>
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-value">
                {data.overall_percentile !== null ? `${Math.round(100 - data.overall_percentile)}%` : "—"}
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">{t("Avg. cheaper than town")}</p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-4 rounded border border-line bg-field px-4 py-3 text-sm">
            <span className="text-ink">
              <strong>{data.price_report_count}</strong> {t("price reports")}
            </span>
            <span className="text-value">
              <strong>{data.correct_price_reports}</strong> {t("positive — correct price")}
              {data.price_report_count > 0 &&
                ` (${Math.round((data.correct_price_reports / data.price_report_count) * 1000) / 10}%)`}
            </span>
            <span className="text-red-600">
              <strong>{data.wrong_price_reports}</strong> {t("negative — wrong price")}
            </span>
          </div>

          {data.products.length === 0 && (
            <p className="text-sm text-ash">{t("Add items to your inventory to see how your prices compare in town.")}</p>
          )}

          {data.products.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th className="num">{t("Your price")}</th>
                  <th className="num">{t("Position")}</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.product_name}</td>
                    <td className="num">
                      {p.price.toFixed(2)} <span className="text-xs text-ash">{p.currency}</span>
                    </td>
                    <td className={"num " + (100 - p.percentile >= 50 ? "text-value" : "text-flag")}>
                      {positionLabel(p.percentile)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </AppPage>
  );
}
