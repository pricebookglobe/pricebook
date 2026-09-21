"use client";

import { useEffect, useState } from "react";
import { AppPage } from "@/components/shared/AppPage";
import { createBrowserSupabase } from "@/lib/supabaseClient";

type StoreInfo = { id: string; name: string; address: string; city: string; lat: number; lng: number };
type Review = { id: string; rating: number; comment: string | null; created_at: string };
type PriceReportStats = {
  count: number;
  positive_count: number;
  negative_count: number;
  positive_pct: number | null;
};

// Green above 90% positive, amber from 75% up to 90%, red below 75%. No
// star at all when there aren't any reports yet — there's nothing to
// judge accuracy from. Based on price-accuracy reports (shoppers
// confirming or flagging a price as wrong) rather than the separate
// 1-5 star review system, since that's the signal actually in use and
// it's a more direct measure of "can I trust this store's prices."
function trustStar(positivePct: number | null): { color: string; label: string } | null {
  if (positivePct === null) return null;
  if (positivePct > 90) return { color: "text-value", label: "Highly trusted — over 90% of price reports confirmed correct" };
  if (positivePct >= 75) return { color: "text-flag", label: "Mostly trusted — 75% or more of price reports confirmed correct" };
  return { color: "text-red-600", label: "Below 75% of price reports confirmed correct — check prices carefully" };
}

export default function StoreDetailPage({ params }: { params: { id: string } }) {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [priceStats, setPriceStats] = useState<PriceReportStats | null>(null);
  const [myRating, setMyRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/stores/${params.id}`).then((r) => r.ok && r.json()).then((s) => s && setStore(s));
    fetch(`/api/stores/${params.id}/reviews`)
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews ?? []));
    fetch(`/api/stores/${params.id}/price-reports`)
      .then((r) => r.json())
      .then(setPriceStats);
    fetch(`/api/stores/${params.id}/view`, { method: "POST" }).catch(() => {});
  }, [params.id]);

  async function submitReview() {
    if (!myRating) return;
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.href = "/login";
      return;
    }
    await fetch(`/api/stores/${params.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ rating: myRating, comment: comment || null })
    });
    const refreshed = await fetch(`/api/stores/${params.id}/reviews`).then((r) => r.json());
    setReviews(refreshed.reviews ?? []);
    setSubmitting(false);
  }

  if (!store) return <AppPage><p className="text-sm text-ash">Loading…</p></AppPage>;

  const star = trustStar(priceStats?.positive_pct ?? null);

  return (
    <AppPage>
      <h1 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
        {store.name}
        {star && (
          <span className={star.color} title={star.label} aria-label={star.label}>
            ★
          </span>
        )}
      </h1>
      <p className="mt-1 text-sm text-ash">{store.address}, {store.city}</p>
      <p className="mt-0.5 font-mono text-[10px] text-ash/60">store id: {store.id}</p>

      {priceStats && priceStats.count > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 rounded border border-line bg-field px-4 py-3 text-sm">
          <span className="text-ink">
            <strong>{priceStats.count}</strong> price reports
          </span>
          <span className="text-value">
            <strong>{priceStats.positive_count}</strong> correct ({priceStats.positive_pct}%)
          </span>
          <span className="text-red-600">
            <strong>{priceStats.negative_count}</strong> wrong
          </span>
        </div>
      )}

      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white hover:bg-value/90"
      >
        Get directions
      </a>

      <section className="mt-8">
        <h2 className="font-display text-[15px] font-medium text-ink">Leave a review</h2>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setMyRating(n)}
              className={n <= myRating ? "text-value" : "text-ash/40"}
              aria-label={`${n} stars`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment"
          className="mt-2 w-full rounded border border-line bg-field px-3 py-2 text-sm text-ink outline-none"
          rows={2}
        />
        <button
          onClick={submitReview}
          disabled={!myRating || submitting}
          className="mt-2 rounded-sm bg-ink px-4 py-1.5 font-display text-sm text-field transition-colors hover:bg-value hover:text-white disabled:opacity-40"
        >
          {submitting ? "Saving…" : "Submit review"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 font-display text-[15px] font-medium text-ink">Reviews</h2>
        {reviews.length === 0 && <p className="text-sm text-ash">No reviews yet.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="border-b border-line py-3">
            <p className="font-mono text-sm text-value">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            {r.comment && <p className="mt-1 text-sm text-ink">{r.comment}</p>}
            <p className="mt-1 font-mono text-[11px] text-ash">
              {/* Reviewer identity is never shown — only ever a generic label. */}
              Shopper · {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </section>
    </AppPage>
  );
}
