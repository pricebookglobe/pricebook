"use client";

import Link from "next/link";
import { useState } from "react";
import type { SearchResult } from "@/lib/api";
import { reportPrice } from "@/lib/api";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatSizeTag } from "@/lib/productName";
import { EmojiRating } from "@/components/shared/EmojiRating";
import { isNutritionRelevant } from "@/lib/productCategorization";

export type StoreRating = { average_rating: number | null; count: number };

// An item name, hard-wrapped at three words per line (not left to the
// browser's own reflow) — a name longer than three words breaks after the
// third word onto a second line, with the [size] tag placed right after
// the very last word, whichever line that ends up on.
export function ItemName({
  name,
  sizeTag,
  className,
  sizeClassName = "text-ash"
}: {
  name: string;
  sizeTag: string;
  className?: string;
  sizeClassName?: string;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const firstLine = words.slice(0, 3).join(" ");
  const secondLine = words.length > 3 ? words.slice(3).join(" ") : null;
  return (
    <span className={className}>
      {firstLine}
      {secondLine && (
        <>
          <br />
          {secondLine}
        </>
      )}
      {sizeTag && <span className={`ml-1 font-mono text-[12px] font-normal ${sizeClassName}`}>{sizeTag}</span>}
    </span>
  );
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const TRUST_COLOR: Record<SearchResult["trust_badge"], string> = {
  green: "bg-value",
  orange: "bg-flag",
  red: "bg-red-500",
  unrated: "bg-ash/40"
};

// Nutrition facts only mean anything for something you eat or drink — a
// GPT estimate stored against a non-food product_id (electronics, car
// parts, cleaning supplies, etc.) still shouldn't be surfaced to a
// shopper just because the column happens to be non-null. SearchResult
// rows don't carry the product's category, so this falls back to the
// same name-keyword guess used for auto-categorization.
export function hasRelevantNutrition(result: SearchResult): boolean {
  return !!result.nutrition_facts && isNutritionRelevant({ productName: result.product_name });
}

function NutritionPanel({ result, dark = false }: { result: SearchResult; dark?: boolean }) {
  const { t } = useLanguage();
  const facts = result.nutrition_facts;
  if (!facts || !isNutritionRelevant({ productName: result.product_name })) return null;
  return (
    <div className={dark ? "mt-2 rounded bg-white/10 px-3 py-2" : "bg-field px-3 py-2"}>
      <p className={`mb-1.5 font-mono text-[10px] uppercase tracking-wide ${dark ? "text-field/60" : "text-ash"}`}>
        {t("Nutrition facts")} · {t("AI estimate — check the actual package")}
      </p>
      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${dark ? "text-field" : "text-ink"}`}>
        {facts.serving_size && (
          <span>
            {t("Serving size")}: <strong>{facts.serving_size}</strong>
          </span>
        )}
        {facts.calories != null && (
          <span>
            {t("Calories")}: <strong>{facts.calories}</strong>
          </span>
        )}
        {facts.protein_g != null && (
          <span>
            {t("Protein (g)")}: <strong>{facts.protein_g}</strong>
          </span>
        )}
        {facts.fat_g != null && (
          <span>
            {t("Fat (g)")}: <strong>{facts.fat_g}</strong>
          </span>
        )}
        {facts.carbs_g != null && (
          <span>
            {t("Carbs (g)")}: <strong>{facts.carbs_g}</strong>
          </span>
        )}
        {facts.sugar_g != null && (
          <span>
            {t("Sugar (g)")}: <strong>{facts.sugar_g}</strong>
          </span>
        )}
        {facts.sodium_mg != null && (
          <span>
            {t("Sodium (mg)")}: <strong>{facts.sodium_mg}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// The "⋯" actions menu shared by both the table row (website) and the card
// (app) layouts, so price reporting, messaging and nutrition facts behave
// identically either way — only the container markup around it differs.
function ActionsMenu({
  result,
  dark = false,
  showingNutrition,
  onToggleNutrition
}: {
  result: SearchResult;
  dark?: boolean;
  showingNutrition: boolean;
  onToggleNutrition: () => void;
}) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState<"correct_price" | "wrong_price" | null>(null);
  const [busy, setBusy] = useState(false);

  async function requireSession() {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.href = "/login";
      return null;
    }
    return data.session.access_token;
  }

  async function handleReport(type: "correct_price" | "wrong_price") {
    setBusy(true);
    try {
      const accessToken = await requireSession();
      if (!accessToken) return;
      await reportPrice({ store_id: result.store_id, product_id: result.product_id, report_type: type, accessToken });
      setReported(type);
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleMessage() {
    const accessToken = await requireSession();
    if (!accessToken) return;
    const message = prompt("Message to the store:");
    if (!message) return;
    await fetch(`/api/stores/${result.store_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ subject: `About ${result.product_name}`, message })
    });
    setMenuOpen(false);
  }

  if (reported) {
    return (
      <span className={`font-mono text-[11px] ${dark ? "text-[#7FE0AE]" : "text-value"}`}>
        {reported === "correct_price" ? t("Thanks — marked as correct.") : t("Thanks — marked as wrong.")}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className={dark ? "px-2 text-field/60 hover:text-field" : "px-2 text-ash hover:text-ink"}
        aria-label="More"
      >
        ⋯
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-6 z-20 w-48 rounded border border-line bg-field-raised py-1 text-left shadow-lg">
            {hasRelevantNutrition(result) && (
              <button
                onClick={() => {
                  onToggleNutrition();
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
              >
                {showingNutrition ? t("Hide nutrition facts") : t("Nutrition facts")}
              </button>
            )}
            <button
              disabled={busy}
              onClick={handleMessage}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
            >
              {t("Message store")}
            </button>
            <button
              disabled={busy}
              onClick={() => handleReport("correct_price")}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-field"
            >
              {t("Price is correct")}
            </button>
            <button
              disabled={busy}
              onClick={() => handleReport("wrong_price")}
              className="block w-full px-3 py-2 text-left text-sm text-flag hover:bg-field"
            >
              {t("Price is wrong")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Fluorescent/"phosphoric" green — the "Save: X" line's resting color. Kept
// as a named export since other code still reaches for it by name; the
// badge itself now flashes between this and a gold accent (see
// .save-flash-box in globals.css), rather than sitting on this color alone.
export const SAVE_GREEN = "#39FF14";

// The "Save: X" callout, shared by every spot it appears (table row, app
// card, and the "Best price within 5km" box) so the flashing box, size and
// color stay identical everywhere — a bigger, bolder size than the rest of
// the row's text, set inside a box whose text/border/background all flash
// between green and gold on a loop (.save-flash-box in globals.css). The
// amount/currency span uses currentColor so it flashes along with the label
// rather than freezing at one color.
export function SaveBadge({ amount, currency, className = "mt-1.5" }: { amount: number; currency: string; className?: string }) {
  const { t } = useLanguage();
  return (
    <p className={`save-flash-box inline-block rounded-md border-2 px-2.5 py-1 font-mono text-base font-extrabold ${className}`}>
      {t("Save")}: {amount.toFixed(2)} {currency}
    </p>
  );
}

export function ResultRow({
  result,
  isCheapest,
  savingsAmount,
  rating,
  variant = "row"
}: {
  result: SearchResult;
  isCheapest: boolean;
  /** How much cheaper this row is than the priciest option within 5km of
   *  the shopper, in the same currency as `result.currency` — undefined
   *  (not shown) when this row isn't the best-within-5km match, or when
   *  there's no real spread within 5km to save against. */
  savingsAmount?: number;
  /** This store's review summary (average emoji rating + count), looked up
   *  in a single batched request by the parent screen — undefined while
   *  that request is still in flight. */
  rating?: StoreRating;
  /** "row" (default) renders a <tr> for the website's table. "card" renders
   *  a self-contained rounded card, used only in the packaged app, which
   *  can't use a <table> layout comfortably on a phone-width screen. */
  variant?: "row" | "card";
}) {
  const { t } = useLanguage();
  const [showNutrition, setShowNutrition] = useState(false);

  if (variant === "card") {
    return (
      <div className="rounded-lg border border-line bg-field-raised px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* (1) Item name — wrapped at three words per line, size tag
                after the last word. */}
            <ItemName
              name={result.product_name}
              sizeTag={formatSizeTag(result.size, result.unit)}
              className="block font-display text-[14px] font-semibold leading-tight text-ink"
            />
            {/* (2) Store name, on its own line, with the review circle + face. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + TRUST_COLOR[result.trust_badge]} />
              <Link href={`/store/${result.store_id}`} className="truncate text-xs text-ash hover:underline">
                {result.store_name}
              </Link>
              <span className="text-xs text-ash">· {formatDistance(result.distance_m)}</span>
              {rating && <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={15} showValue={false} />}
            </div>
            {/* (3) Price, on its own line — "cheapest" highlighted on the lowest price. */}
            <p className={"mt-1 font-mono text-sm " + (isCheapest ? "font-semibold text-green-700" : "text-ink")}>
              {isCheapest && (
                <span className="mr-2 rounded-sm bg-green-100 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-green-700">
                  {t("Cheapest")}
                </span>
              )}
              {t("Price")}: {result.price.toFixed(2)} <span className="text-xs font-normal text-ash">{result.currency}</span>
            </p>
            {/* Savings callout, if this row is the best price within 5km —
                its own line, right above Open in Maps. */}
            {savingsAmount != null && <SaveBadge amount={savingsAmount} currency={result.currency} />}
            {/* (4) Open in Maps + Visit Store Page, on their own line. */}
            <div className="mt-1.5 flex items-center gap-3">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-value underline"
              >
                {t("Open in Maps")}
              </a>
              <Link href={`/store/${result.store_id}`} className="font-mono text-[11px] text-ink underline">
                {t("Visit Store Page")}
              </Link>
            </div>
          </div>
          <ActionsMenu result={result} showingNutrition={showNutrition} onToggleNutrition={() => setShowNutrition((s) => !s)} />
        </div>
        {showNutrition && <NutritionPanel result={result} />}
      </div>
    );
  }

  return (
    <>
      <tr>
        {/* (1) Item name — wrapped at three words per line, size tag after
            the last word. */}
        <td className="align-top">
          <ItemName name={result.product_name} sizeTag={formatSizeTag(result.size, result.unit)} className="block font-medium leading-tight text-ink" />
          {/* (2) Store name, on its own line, with the review circle + face. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={"h-2 w-2 shrink-0 rounded-full " + TRUST_COLOR[result.trust_badge]} />
            <Link href={`/store/${result.store_id}`} className="truncate font-medium hover:underline">
              {result.store_name}
            </Link>
            {rating && (
              <EmojiRating rating={rating.count > 0 ? rating.average_rating : null} count={rating.count} size={16} showValue={false} />
            )}
            <span className="font-mono text-[11px] text-ash">· {formatDistance(result.distance_m)}</span>
          </div>
          {/* (3) Price, on its own line — "cheapest" highlighted on the lowest price. */}
          <p className={"mt-1 font-mono text-sm " + (isCheapest ? "font-semibold text-green-700" : "text-ink")}>
            {isCheapest && (
              <span className="mr-2 rounded-sm bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-green-700">
                {t("Cheapest")}
              </span>
            )}
            {t("Price")}: {result.price.toFixed(2)} <span className="text-xs font-normal text-ash">{result.currency}</span>
          </p>
          {/* Savings callout, if this row is the best price within 5km —
              its own line, right above Open in Maps. */}
          {savingsAmount != null && <SaveBadge amount={savingsAmount} currency={result.currency} />}
          {/* (4) Open in Maps + Visit Store Page, on their own line. */}
          <div className="mt-1.5 flex items-center gap-3">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${result.store_lat},${result.store_lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-ink underline"
            >
              {t("Open in Maps")}
            </a>
            <Link href={`/store/${result.store_id}`} className="font-mono text-[11px] text-ink underline">
              {t("Visit Store Page")}
            </Link>
          </div>
        </td>
        <td className="relative num align-top">
          <ActionsMenu result={result} showingNutrition={showNutrition} onToggleNutrition={() => setShowNutrition((s) => !s)} />
        </td>
      </tr>
      {showNutrition && hasRelevantNutrition(result) && (
        <tr>
          <td colSpan={2} className="bg-field px-3 py-2">
            <NutritionPanel result={result} />
          </td>
        </tr>
      )}
    </>
  );
}
