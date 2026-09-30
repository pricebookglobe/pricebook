"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppPage } from "@/components/shared/AppPage";
import { EmojiRating, EmojiRatingPicker } from "@/components/shared/EmojiRating";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

type StoreInfo = { id: string; name: string; address: string; city: string; lat: number; lng: number };
type Review = { id: string; rating: number; comment: string | null; created_at: string };
type MyReview = { id: string; rating: number; comment: string | null };
type PriceReportStats = {
  count: number;
  positive_count: number;
  negative_count: number;
  positive_pct: number | null;
};
type ReviewStats = { average: number | null; count: number };

// Green above 90% positive, amber from 75% up to 90%, red below 75%, and
// grey when there aren't any price reports yet — the circle always shows,
// so its color is itself the signal, rather than its absence being the
// only clue that there's nothing to judge accuracy from yet. Based on
// price-accuracy reports (shoppers confirming or flagging a price as
// wrong) rather than the separate 1-5 emoji review system below — this is
// a more direct measure of "can I trust this store's prices," kept as a
// plain colored circle (no face) so it never looks like the same kind of
// signal as the review rating next to it.
function trustCircle(positivePct: number | null): { color: string; label: string } {
  if (positivePct === null) return { color: "bg-ash/40", label: "No price reports yet" };
  if (positivePct > 90) return { color: "bg-value", label: "Highly trusted — over 90% of price reports confirmed correct" };
  if (positivePct >= 75) return { color: "bg-flag", label: "Mostly trusted — 75% or more of price reports confirmed correct" };
  return { color: "bg-red-600", label: "Below 75% of price reports confirmed correct — check prices carefully" };
}

export default function StoreDetailPage({ params }: { params: { id: string } }) {
  const { t } = useLanguage();
  const router = useRouter();
  const isNativeApp = useIsNativeApp();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [priceStats, setPriceStats] = useState<PriceReportStats | null>(null);
  const [myRating, setMyRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A shopper gets exactly one review per store, on both the website and
  // the app (same account, same API). This tracks whether they already
  // left one here, so the form pre-fills it and reads as "edit your
  // review" instead of implying a brand new review can be added each visit.
  const [myReview, setMyReview] = useState<MyReview | null>(null);
  // The average emoji rating shown next to the store name — separate from
  // reviews[] (which is just the list rendered further down the page).
  const [reviewStats, setReviewStats] = useState<ReviewStats>({ average: null, count: 0 });

  useEffect(() => {
    fetch(`/api/stores/${params.id}`).then((r) => r.ok && r.json()).then((s) => s && setStore(s));
    fetch(`/api/stores/${params.id}/price-reports`)
      .then((r) => r.json())
      .then(setPriceStats);
    fetch(`/api/stores/${params.id}/view`, { method: "POST" }).catch(() => {});

    (async () => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const headers = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : undefined;
      const refreshed = await fetch(`/api/stores/${params.id}/reviews`, { headers }).then((r) => r.json());
      setReviews(refreshed.reviews ?? []);
      setReviewStats({ average: refreshed.average_rating ?? null, count: refreshed.count ?? 0 });
      if (refreshed.my_review) {
        setMyReview(refreshed.my_review);
        setMyRating(refreshed.my_review.rating);
        setComment(refreshed.my_review.comment ?? "");
      }
    })();
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
    const refreshed = await fetch(`/api/stores/${params.id}/reviews`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` }
    }).then((r) => r.json());
    setReviews(refreshed.reviews ?? []);
    setReviewStats({ average: refreshed.average_rating ?? null, count: refreshed.count ?? 0 });
    if (refreshed.my_review) setMyReview(refreshed.my_review);
    setSubmitting(false);
  }

  // In the app, this page is always arrived at from some list (search
  // results, history, a notification) — a back button gets the shopper
  // there again without relying on the device's own back gesture, which
  // is easy to miss on a full-screen WebView. The website already has
  // its own browser back button, so this stays app-only.
  const backButton = isNativeApp && (
    <button
      onClick={() => router.back()}
      className="mb-4 flex items-center gap-1 font-display text-sm text-ash hover:text-ink"
    >
      <ChevronLeft size={16} strokeWidth={2} /> {t("Back")}
    </button>
  );

  if (!store)
    return (
      <AppPage>
        {backButton}
        <p className="text-sm text-ash">{t("Loading…")}</p>
      </AppPage>
    );

  const circle = trustCircle(priceStats?.positive_pct ?? null);

  return (
    <AppPage>
      {backButton}
      <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold text-ink">
        {store.name}
        {/* Price-report correctness: a plain colored circle, kept visually
            distinct from the star rating right next to it. */}
        <span className={"h-3 w-3 shrink-0 rounded-full " + circle.color} title={circle.label} aria-label={circle.label} />
        {/* Customer emoji rating, averaged across every shopper's review for
            this store — separate signal from the circle above. Rounds the
            average to the nearest whole face (1-5) rather than a star's
            partial fill. */}
        <span className="text-base font-normal">
          <EmojiRating rating={reviewStats.count > 0 ? reviewStats.average : null} count={reviewStats.count} size={22} />
        </span>
      </h1>
      <p className="mt-1 text-sm text-ash">{store.address}, {store.city}</p>
      <p className="mt-0.5 font-mono text-[10px] text-ash/60">store id: {store.id}</p>

      {priceStats && priceStats.count > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 rounded border border-line bg-field px-4 py-3 text-sm">
          <span className="text-ink">
            <strong>{priceStats.count}</strong> {t("price reports")}
          </span>
          <span className="text-value">
            <strong>{priceStats.positive_count}</strong> {t("correct")} ({priceStats.positive_pct}%)
          </span>
          <span className="text-red-600">
            <strong>{priceStats.negative_count}</strong> {t("wrong")}
          </span>
        </div>
      )}

      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white hover:bg-value/90 active:bg-value/90"
      >
        {t("Get directions")}
      </a>

      <section className="mt-8">
        <h2 className="font-display text-[15px] font-medium text-ink">
          {myReview ? t("Your review") : t("Leave a review")}
        </h2>
        {myReview && (
          <p className="mt-0.5 text-xs text-ash">
            {t("One review per store — editing yours below updates it, it won't add a new one.")}
          </p>
        )}
        <div className="mt-2">
          <EmojiRatingPicker value={myRating} onChange={setMyRating} />
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("Optional comment")}
          className="mt-2 w-full rounded border border-line bg-field px-3 py-2 text-sm text-ink outline-none"
          rows={2}
        />
        <button
          onClick={submitReview}
          disabled={!myRating || submitting}
          className="mt-2 rounded-sm bg-ink px-4 py-1.5 font-display text-sm text-field transition-colors hover:bg-value hover:text-white active:bg-value active:text-white disabled:opacity-40"
        >
          {submitting ? t("Saving…") : myReview ? t("Update review") : t("Submit review")}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 font-display text-[15px] font-medium text-ink">{t("Reviews")}</h2>
        {reviews.length === 0 && <p className="text-sm text-ash">{t("No reviews yet.")}</p>}
        {reviews.map((r) => (
          <div key={r.id} className="border-b border-line py-3">
            <EmojiRating rating={r.rating} showValue={false} size={18} />
            {r.comment && <p className="mt-1 text-sm text-ink">{r.comment}</p>}
            <p className="mt-1 font-mono text-[11px] text-ash">
              {/* Reviewer identity is never shown — only ever a generic label. */}
              {t("Shopper")} · {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </section>
    </AppPage>
  );
}
