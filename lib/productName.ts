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
 */
export function formatSizeTag(size: number | null | undefined, unit: string | null | undefined): string {
  if (size == null || !unit || !unit.trim()) return "";
  const trimmedUnit = unit.trim();
  // Size values come through as numeric (often a float like 75.0) — show
  // whole numbers cleanly, keep decimals when they're actually meaningful.
  const sizeStr = Number.isInteger(size) ? String(size) : String(Number(size.toFixed(2)));
  return `[${sizeStr}${trimmedUnit}]`;
}
