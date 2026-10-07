// A single source of truth for "what does this unit string actually
// mean," so the same physical unit is always represented the same way
// everywhere in the app — stored, displayed, compared, and ranked.
//
// Without this, the exact same unit entered two different ways (a
// merchant typing "grams" in a CSV upload, GPT's photo extraction
// returning "gram", the Add Item dropdown saving "g") created products
// that LOOK identical to a shopper but fail every exact-match check that
// compares unit text directly — size/pack filter chips splitting one real
// size into several chips, "same item" grouping (Save badges, cheapest-
// nearby) silently missing real matches, etc. unitPrice.ts already solved
// this for price RANKING by converting to a common base unit; this covers
// everywhere else that compares or displays a unit as text.
//
// Canonical forms match the Add Item form's own unit dropdown
// (lib/productCategorization.ts SIZE_TYPE_UNITS) — g/kg, ml/L, cm/m, pcs —
// so normalized data always lines up with what that picker offers.
const UNIT_SYNONYMS: Record<string, string> = {
  // weight
  g: "g",
  gram: "g",
  grams: "g",
  gm: "g",
  gms: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  kgs: "kg",
  // volume
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  // length
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  // units (plain count — no physical measurement)
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  unit: "pcs",
  units: "pcs",
  pack: "pcs"
};

/**
 * Maps any recognized synonym/spelling to its canonical short form (e.g.
 * "grams"/"gram"/"gm" -> "g"). Unrecognized units are returned trimmed but
 * otherwise unchanged — real data (even in a unit this list doesn't know
 * about) is never discarded, just not collapsed with anything else.
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const trimmed = unit.trim();
  if (!trimmed) return null;
  return UNIT_SYNONYMS[trimmed.toLowerCase()] ?? trimmed;
}
