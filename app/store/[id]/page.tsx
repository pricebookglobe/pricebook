"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, X } from "lucide-react";
import { AppPage } from "@/components/shared/AppPage";
import { EmojiRating, EmojiRatingPicker } from "@/components/shared/EmojiRating";
import { Pagination, paginate } from "@/components/admin/Pagination";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

const REVIEWS_PAGE_SIZE = 5;

type StoreInfo = { id: string; name: string; address: string; city: string; lat: number; lng: number };
type Review = { id: string; rating: number; comment: string | null; created_at: string };
type MyReview = { id: string; rating: number; comment: string | null };
type InventoryItem = {
  id: string;
  price: number;
  currency: string;
  in_stock: boolean;
  is_hidden: boolean;
  market_avg_price: number | null;
  // Positive = this store is cheaper than the average of every other store
  // carrying the same product; negative = pricier; null = no other store
  // carries it, so there's nothing to compare against.
  percent_vs_market: number | null;
  products: {
    id: string;
    canonical_name: string;
    brand: string | null;
    size: number | null;
    unit: string | null;
    category: string | null;
    image_url: string | null;
  };
};
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
  // Defaults to the middle (plain/neutral) emoji so the picker never starts
  // on an un-set, ambiguous state — overridden below if the shopper already
  // left a review, so this never clobbers an existing rating.
  const [myRating, setMyRating] = useState(3);
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
  // The reviews section stays collapsed to just the average rating by
  // default — the actual review text is a click away, and closes again via
  // the X rather than staying open forever once expanded.
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [reviewsPage, setReviewsPage] = useState(0);
  // This store's full registered-item list, grouped by category below —
  // fetched once and kept flat here; `itemsByCategory` does the grouping so
  // this never has to be re-sorted on every render.
  const [items, setItems] = useState<InventoryItem[]>([]);
  // Which category accordions are open — every category starts collapsed,
  // so a store with a large catalog doesn't dump every item on screen at
  // once; a shopper opens just the categories they care about.
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/stores/${params.id}`).then((r) => r.ok && r.json()).then((s) => s && setStore(s));
    fetch(`/api/stores/${params.id}/price-reports`)
      .then((r) => r.json())
      .then(setPriceStats);
    fetch(`/api/stores/${params.id}/view`, { method: "POST" }).catch(() => {});
    fetch(`/api/stores/${params.id}/inventory`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: InventoryItem[]) => {
        // Hidden items are a merchant's own "not shown to shoppers" flag —
        // out-of-stock items still belong on this list (with a label), but
        // hidden ones should never appear here at all.
        setItems((rows ?? []).filter((row) => !row.is_hidden));
      })
      .catch(() => {});

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

  // Grouped by category for the collapsible list below — "Uncategorized"
  // catches any item whose product record has no category set, so nothing
  // registered at this store ever silently goes missing from the list.
  const itemsByCategory = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const category = item.products?.category?.trim() || t("Uncategorized");
    const list = itemsByCategory.get(category) ?? [];
    list.push(item);
    itemsByCategory.set(category, list);
  }
  const categories = Array.from(itemsByCategory.keys()).sort((a, b) => a.localeCompare(b));

  function toggleCategory(category: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

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
        className="mt-4 inline-block rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-white hover:bg-ink-soft active:bg-ink-dark"
      >
        {t("Get directions")}
      </a>

      <section className="mt-8">
        <h2 className="font-display text-[15px] font-medium text-ink">{t("Items at this store")}</h2>
        {categories.length === 0 ? (
          <p className="mt-2 text-sm text-ash">{t("No registered items yet.")}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {categories.map((category) => {
              const categoryItems = itemsByCategory.get(category) ?? [];
              const expanded = openCategories.has(category);
              return (
                <div key={category} className="rounded border border-line bg-field">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  >
                    <span className="font-display text-sm font-medium text-ink">{category}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ash">{categoryItems.length}</span>
                      <ChevronDown
                        size={16}
                        strokeWidth={2}
                        className={"text-ash transition-transform " + (expanded ? "rotate-180" : "")}
                      />
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-line">
                      {categoryItems.map((item) => {
                        // Round toward zero so a tiny rounding artifact
                        // (0.0%) never gets shown as a claim either way —
                        // only a genuine, non-zero difference earns a badge.
                        const percent = item.percent_vs_market;
                        const cheaper = percent !== null && percent > 0;
                        const pricier = percent !== null && percent < 0;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {item.products.image_url ? (
                                <img
                                  src={item.products.image_url}
                                  alt=""
                                  className="h-11 w-11 shrink-0 rounded border border-line bg-field-raised object-cover"
                                />
                              ) : (
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-line bg-field-raised font-mono text-[10px] text-ash/60">
                                  {t("No photo")}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm text-ink">
                                  {item.products.brand ? `${item.products.brand} ` : ""}
                                  {item.products.canonical_name}
                                </p>
                                {(item.products.size || item.products.unit) && (
                                  <p className="font-mono text-[11px] text-ash">
                                    {item.products.size ?? ""} {item.products.unit ?? ""}
                                  </p>
                                )}
                                {(cheaper || pricier) && (
                                  <p className={"font-mono text-[11px] font-medium " + (cheaper ? "text-value" : "text-flag")}>
                                    {cheaper
                                      ? t("{n}% cheaper than other stores").replace("{n}", String(Math.abs(percent!)))
                                      : t("{n}% pricier than other stores").replace("{n}", String(Math.abs(percent!)))}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-mono text-sm text-ink">
                                {item.price.toFixed(2)} <span className="text-xs text-ash">{item.currency}</span>
                              </p>
                              {!item.in_stock && (
                                <p className="font-mono text-[10px] uppercase tracking-wide text-flag">{t("Out of stock")}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
          className="mt-2 rounded-sm bg-ink px-4 py-1.5 font-display text-sm text-field transition-colors hover:bg-ink-soft hover:text-white active:bg-ink-dark active:text-white disabled:opacity-40"
        >
          {submitting ? t("Saving…") : myReview ? t("Update review") : t("Submit review")}
        </button>
      </section>

      <section className="mt-8">
        {/* Collapsed by default to just the average rating — the actual
            review text (and who left what) is a click away, not shown up
            front. Clicking it again, or the X once open, closes it. */}
        <button
          type="button"
          onClick={() => {
            if (reviews.length === 0) return;
            setReviewsExpanded((e) => !e);
            setReviewsPage(0);
          }}
          disabled={reviews.length === 0}
          aria-expanded={reviewsExpanded}
          className={
            "flex w-full items-center justify-between gap-2 rounded border border-line bg-field px-4 py-3 text-left transition-colors " +
            (reviewsExpanded ? "rounded-b-none border-b-0" : "") +
            (reviews.length > 0 ? " hover:border-value" : " cursor-default")
          }
        >
          <span className="font-display text-[15px] font-medium text-ink">{t("Reviews")}</span>
          <span className="flex items-center gap-2">
            <EmojiRating rating={reviewStats.count > 0 ? reviewStats.average : null} count={reviewStats.count} size={20} />
            {reviews.length > 0 && (
              <ChevronDown
                size={16}
                strokeWidth={2}
                className={"text-ash transition-transform " + (reviewsExpanded ? "rotate-180" : "")}
              />
            )}
          </span>
        </button>

        {reviews.length === 0 && <p className="mt-2 text-sm text-ash">{t("No reviews yet.")}</p>}

        {reviewsExpanded && reviews.length > 0 && (
          <div className="rounded rounded-t-none border border-t-0 border-line bg-field-raised p-3">
            <div className="mb-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setReviewsExpanded(false)}
                aria-label={t("Close")}
                className="rounded-full p-1 text-ash hover:bg-field hover:text-ink"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            {paginate(reviews, reviewsPage, REVIEWS_PAGE_SIZE).map((r) => (
              <div key={r.id} className="border-b border-line px-1 py-3 last:border-b-0">
                <EmojiRating rating={r.rating} showValue={false} size={18} />
                {r.comment && <p className="mt-1 text-sm text-ink">{r.comment}</p>}
                <p className="mt-1 font-mono text-[11px] text-ash">
                  {/* Reviewer identity is never shown — only ever a generic label. */}
                  {t("Shopper")} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
            <Pagination page={reviewsPage} totalItems={reviews.length} onPageChange={setReviewsPage} pageSize={REVIEWS_PAGE_SIZE} />
          </div>
        )}
      </section>
    </AppPage>
  );
}
