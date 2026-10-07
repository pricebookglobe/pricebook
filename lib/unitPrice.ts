// Backs every "best price"/"cheapest"/sort-by-price comparison that can
// span more than one product_id (the fuzzy/embedding search path can
// return a 6-pack and a 24-pack of the same drink, or a 330ml can and a
// 1.5L bottle, under one query — see migration 0037). Comparing those by
// raw listing price is misleading: the bigger pack/size almost always
// "loses" on total price even when it's the better deal per item. This
// file produces a normalized per-base-unit price for RANKING ONLY — the
// price actually shown to the shopper is always the real listing price.
//
// Exact-product_id comparisons (every store selling literally the same
// product row) don't need this: dedup already keys products on
// pack_size/size/unit, so those rows are already apples-to-apples. This
// only matters once results from different product_ids get compared.

export type SizeType = "weight" | "volume" | "length" | "units";

// Converts to a common base unit per size_type so differently-labeled
// sizes (kg vs g, L vs ml, m vs cm) are comparable: weight -> grams,
// volume -> milliliters, length -> centimeters. Units has no sub-unit to
// normalize.
function normalizeToBaseUnit(size: number, unit: string | null | undefined): number {
  const u = (unit ?? "").trim().toLowerCase();
  switch (u) {
    case "kg":
    case "kilogram":
    case "kilograms":
      return size * 1000;
    case "l":
    case "liter":
    case "liters":
    case "litre":
    case "litres":
      return size * 1000;
    case "m":
    case "meter":
    case "meters":
    case "metre":
    case "metres":
      return size * 100;
    default:
      // g, ml, cm, pcs, or anything already in the base unit.
      return size;
  }
}

/**
 * Per-base-unit price for ranking: price per gram/ml/cm across the whole
 * pack, or price per individual item when size_type is "units" or the
 * size is missing/invalid. Falls back to the raw price (as if pack_size
 * 1, size 1) whenever the inputs don't support a real calculation, so a
 * row with incomplete data still sorts somewhere sane instead of as
 * NaN/Infinity.
 */
export function computeUnitPrice(
  price: number,
  packSize: number | null | undefined,
  size: number | null | undefined,
  unit: string | null | undefined,
  sizeType: SizeType | string | null | undefined
): number {
  const pack = packSize && packSize > 0 ? packSize : 1;

  if (sizeType === "units" || size == null || size <= 0) {
    return price / pack;
  }

  const normalizedSize = normalizeToBaseUnit(size, unit);
  if (!normalizedSize || normalizedSize <= 0) return price / pack;

  return price / (pack * normalizedSize);
}

/** Attaches `unit_price` to a search-result row using its own fields. */
export function withUnitPrice<T extends {
  price: number;
  pack_size?: number | null;
  size?: number | null;
  unit?: string | null;
  size_type?: string | null;
}>(row: T): T & { unit_price: number } {
  return {
    ...row,
    unit_price: computeUnitPrice(row.price, row.pack_size, row.size, row.unit, row.size_type)
  };
}
