"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppPage } from "@/components/shared/AppPage";
import { useAccount } from "@/lib/AccountProvider";

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
};

function positionLabel(percentile: number): string {
  // percent_rank: 0 = cheapest in town, 100 = most expensive. Flip it to a
  // "cheaper than X%" framing, which is the number merchants actually want.
  const cheaperThan = Math.round(100 - percentile);
  return `Cheaper than ${cheaperThan}% of town`;
}

export default function StoreOverviewPage() {
  const router = useRouter();
  const { storeId, token, loading: accountLoading } = useAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accountLoading) return;
    if (!token) {
      router.push("/login?next=/overview");
      return;
    }
    if (!storeId) {
      router.push("/dashboard");
      return;
    }
    fetch(`/api/stores/${storeId}/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [accountLoading, token, storeId, router]);

  return (
    <AppPage maxWidth="max-w-3xl">
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">Store overview</h1>

      {(loading || accountLoading) && <p className="text-sm text-ash">…</p>}

      {data && (
        <>
          {data.verification_status === "pending" && (
            <div className="mb-6 rounded border border-flag bg-flag/10 px-4 py-3 text-sm text-ink">
              Your store is pending admin verification. You can preview your dashboard, but customers won't see
              your listings until you're approved.
            </div>
          )}

          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-ink">{data.product_count}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">Products listed</p>
            </div>
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-ink">{data.view_count}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">Store page views</p>
            </div>
            <div className="rounded border border-line bg-field p-4 text-center">
              <p className="font-display text-2xl font-semibold text-value">
                {data.overall_percentile !== null ? `${Math.round(100 - data.overall_percentile)}%` : "—"}
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ash">Avg. cheaper than town</p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-4 rounded border border-line bg-field px-4 py-3 text-sm">
            <span className="text-ink">
              <strong>{data.review_count}</strong> reviews
            </span>
            <span className="text-value">
              <strong>{data.positive_reviews}</strong> positive
            </span>
            <span className="text-red-600">
              <strong>{data.negative_reviews}</strong> negative
            </span>
          </div>

          {data.products.length === 0 && (
            <p className="text-sm text-ash">Add items to your inventory to see how your prices compare in town.</p>
          )}

          {data.products.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Your price</th>
                  <th className="num">Position</th>
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
