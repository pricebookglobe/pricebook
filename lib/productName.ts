import { normalizeUnit } from "./units";

/**
 * How a product's brand and name should be shown together, without
 * repeating the brand when it's already part of (or the same as) the
 * name — e.g. brand "Snickers" + name "Snickers" should read "Snickers",
 * not "Snickers Snickers"; brand "Oreo" + name "Original Oreo" should
 * read "Original Oreo", not "Oreo Original Oreo".
 *
 * Used anywhere a product's brand and canonical_name/product_name are
 * displayed together: the merchant's inventory tables, and the customer
 * search results heading.
 */
export function displayProductName(brand: string | null | undefined, name: string): string {
  const trimmedName = name.trim();
  if (!brand || !brand.trim()) return trimmedName;
  if (trimmedName.toLowerCase().includes(brand.trim().toLowerCase())) return trimmedName;
  return `${brand.trim()} ${trimmedName}`;
}

/**
 * The item's size/unit shown next to its name as a bracketed tag, e.g.
 * "Snickers [75g]" — "" (nothing to render) when either half is missing,
 * since a size with no unit (or vice versa) isn't meaningful on its own.
 *
 * Always normalizes the unit first (normalizeUnit) so the same physical
 * unit always displays the same way regardless of how it happened to be
 * typed/extracted — "50g" and "50grams" both show as "50g" — instead of
 * looking like two different sizes.
 */
export function formatSizeTag(size: number | null | undefined, unit: string | null | undefined): string {
  const normalizedUnit = normalizeUnit(unit);
  if (size == null || !normalizedUnit) return "";
  // Size values come through as numeric (often a float like 75.0) — show
  // whole numbers cleanly, keep decimals when they're actually meaningful.
  const sizeStr = Number.isInteger(size) ? String(size) : String(Number(size.toFixed(2)));
  return `[${sizeStr}${normalizedUnit}]`;
}

/**
 * Same bracketed tag as formatSizeTag, but folds in pack size too, since
 * a listing's name alone doesn't say whether "[1.5L]" means one bottle or
 * one bottle's worth inside a 6-pack — e.g. "Ultra water [6×1.5L]" for a
 * 6-pack, "Ultra water [1.5L]" for a single bottle (pack size 1 adds
 * nothing worth showing). Falls back to a bare "[6×]" when there's a real
 * pack but no size to go with it (a plain Units item, like a 6-pack of
 * eggs with no weight/volume/length recorded).
 */
export function formatItemSizeTag(
  size: number | null | undefined,
  unit: string | null | undefined,
  packSize: number | null | undefined
): string {
  const sizePart = formatSizeTag(size, unit);
  const pack = packSize ?? 1;
  if (pack <= 1) return sizePart;
  if (!sizePart) return `[${pack}×]`;
  // sizePart is "[1.5L]" — splice the pack count in right after the
  // opening bracket rather than re-deriving the inner text.
  return `[${pack}×${sizePart.slice(1)}`;
}
