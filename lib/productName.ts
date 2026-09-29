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
