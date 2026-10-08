/**
 * Fuzzy "is this really the same product" check, shared between the
 * search API (filtering which embedding/text matches count as the actual
 * item vs. just a same-category "similar" item) and the Check Price
 * screen (grouping listings for Save badges / cheapest-nearby).
 *
 * Two listings' names rarely come in typed identically — one merchant's
 * "Ultra water" and another's "Ultra Bottled Drinking Water" are the same
 * product, just entered with extra descriptive words. An exact string
 * match misses that pairing entirely. This matches on exact equality, or —
 * otherwise — the SHORTER name's meaningful words (ignoring short/generic
 * filler like "bottled" or "drinking") being FULLY covered by the other
 * name's words, e.g. "Ultra water" matches "Ultra Bottled Drinking Water"
 * because {ultra, water} ⊆ {ultra, water}.
 *
 * Requiring full coverage (not just a majority) matters: a single shared
 * *category* word is never enough on its own — "Ultra Water" and "San
 * Pellegrino Sparkling Natural Mineral Water" both contain "water", but
 * they're different products, not the same item in different packaging.
 * Same-category-but-different-product pairs like that belong under
 * "Similar items" instead, never merged into a same-item comparison.
 *
 * A single shared word is too weak on its own in the other direction too:
 * when a scan only returns a bare brand with no descriptor ("Snickers",
 * with nothing else), that one word technically satisfies "coverage" against
 * ANY candidate containing it — "Snickers Duo", "Snickers Mini", every
 * multipack and size — wrongly treating genuinely different products as
 * the same item. So a match built on exactly one shared word only counts
 * when neither name brings in any extra, unmentioned descriptor beyond it.
 * (This is also why plain substring containment — "Snickers" literally
 * being a substring of "Snickers Duo" — can't be used as a shortcut to
 * skip the word-coverage check below: it would let that exact bare-brand
 * case right back in through the side door.)
 *
 * That single-shared-word rule has one deliberate exception: a GENERIC
 * product-type word ("water", "tea", "coffee"...) is not a brand, and
 * someone typing just "water" or "tea" into search means "show me every
 * water/tea product," not "treat every water product as literally the
 * same item." Rejecting that bare word the same way a bare brand gets
 * rejected was hiding every real result behind the separate "Similar
 * items" view — "Tea" found zero matches even with actual tea bags sold
 * two km away, and "Water" showed only whichever one product happened to
 * be named the bare single word "Water." So a shared single word only
 * fails the match when it's NOT one of these recognized generic terms —
 * when it is, full coverage (already checked above) is enough on its own.
 */
const NAME_MATCH_STOPWORDS = new Set([
  "the", "and", "with", "for", "pack", "bottle", "bottled", "drinking", "pure", "natural", "fresh", "brand", "new"
]);

// Mirrors the finer "type" keywords in lib/productCategorization.ts
// (kept as a separate, lower-level list here to avoid a cross-module
// dependency) — generic nouns naming a KIND of product, never a brand,
// so a bare search for one of these is a deliberate category-wide
// request rather than an ambiguous single-word product name.
const GENERIC_PRODUCT_WORDS = new Set([
  "water", "tea", "coffee", "soda", "cola", "juice", "milk", "drink", "beverage",
  "chocolate", "chips", "crisps", "cookie", "biscuit", "candy", "sweet", "sweets", "snack", "snacks"
]);

function normalizeName(s: string | null | undefined): string {
  return s == null ? "" : String(s).trim().toLowerCase();
}

function significantWords(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length >= 3 && !NAME_MATCH_STOPWORDS.has(w));
}

export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = significantWords(na);
  const wb = significantWords(nb);
  if (!wa.length || !wb.length) return false;
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (!shorter.every((w) => longer.includes(w))) return false;
  // A single shared word is too weak on its own when the other side
  // brings in MORE words (extra descriptors it never mentioned) — a
  // bare "Snickers" query matching "Snickers Duo" or "Snickers Mini"
  // would wrongly treat genuinely different products as the same item.
  // Unless that one word is a generic product-type term, not a brand —
  // see GENERIC_PRODUCT_WORDS above.
  if (shorter.length === 1 && longer.length > shorter.length && !GENERIC_PRODUCT_WORDS.has(shorter[0])) {
    return false;
  }
  return true;
}
