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
 */
const NAME_MATCH_STOPWORDS = new Set([
  "the", "and", "with", "for", "pack", "bottle", "bottled", "drinking", "pure", "natural", "fresh", "brand", "new"
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
  if (shorter.length === 1 && longer.length > shorter.length) return false;
  return true;
}
