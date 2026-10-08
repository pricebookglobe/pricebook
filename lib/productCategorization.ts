// Lightweight, local (no API call) heuristics that back the Add Item
// form's "auto-categorize as you type" and "auto-pick a sensible size
// type" behavior. These are deliberately simple keyword rules, not a
// model call — they only need to get a merchant to a reasonable starting
// point fast; the UI always lets them override every field this
// suggests, so an imperfect guess here is cheap to fix and never blocks
// anything.
import { CATEGORY_TREE } from "./categories";

export type SizeType = "weight" | "volume" | "length" | "units";

export const SIZE_TYPES: SizeType[] = ["weight", "volume", "length", "units"];

export const SIZE_TYPE_LABELS: Record<SizeType, string> = {
  weight: "Weight",
  volume: "Volume",
  length: "Length",
  units: "Units"
};

// The unit dropdown's options change based on which of these is active —
// smallest/most common unit first, since that's what gets picked by
// default whenever the size type changes.
export const SIZE_TYPE_UNITS: Record<SizeType, string[]> = {
  weight: ["g", "kg"],
  volume: ["ml", "L"],
  length: ["cm", "m"],
  units: ["pcs"]
};

// Every subcategory in the existing guided-search taxonomy (lib/categories
// .ts), mapped to the size type its items are measured in by default.
// Food/drink/liquid categories lean weight or volume; everything else
// (clothing, electronics, furniture, car parts, home goods...) defaults
// to Units per the "canned drinks, electronics, general packaged goods"
// rule — a plain headcount, not a physical measurement — and is always
// editable from the Size Type dropdown regardless of what's picked here.
const SUBCATEGORY_SIZE_TYPE: Record<string, SizeType> = {
  "Dairy & Eggs": "volume",
  "Bakery": "weight",
  "Fruits & Vegetables": "weight",
  "Meat & Poultry": "weight",
  "Frozen Foods": "weight",
  "Canned & Packaged Goods": "weight",
  "Snacks & Sweets": "weight",
  "Beverages": "volume",
  "Rice, Pasta & Grains": "weight",
  "Cooking Oils & Condiments": "volume",
  "Oils & Fluids": "volume",
  "Cleaning Supplies": "volume",
  "Skincare": "volume",
  "Haircare": "volume"
};

// Product-name keywords checked before falling back to the category's own
// default — these catch the common "the name itself tells you the size
// type" cases (a cable is measured in length no matter which category it
// landed in; a carton of eggs is a headcount even though Dairy & Eggs
// defaults to volume for the milk/yogurt majority of that aisle).
const NAME_SIZE_TYPE_KEYWORDS: { pattern: RegExp; type: SizeType }[] = [
  { pattern: /\b(cable|wire|rope|hose|cord|pipe|fabric|ribbon|string|chain|tape)\b/i, type: "length" },
  { pattern: /\b(egg|eggs|battery|batteries|bulb|bulbs|tissue|tissues|diaper|diapers|napkin|napkins|pad|pads)\b/i, type: "units" },
  { pattern: /\b(milk|juice|water|oil|yogurt|yoghurt|cream|sauce|shampoo|detergent|soda|cola|drink)\b/i, type: "volume" },
  { pattern: /\b(rice|flour|sugar|meat|chicken|beef|fish|cheese|coffee|nuts|beans|lentils)\b/i, type: "weight" }
];

// Flattened { group, subcategory } list the Category dropdown renders as
// <optgroup>s from, plus a parallel keyword table used to guess a
// subcategory from whatever the merchant has typed into the product-name
// field so far.
export type CategoryOption = { group: string; subcategory: string };

export const CATEGORY_OPTIONS: CategoryOption[] = CATEGORY_TREE.flatMap((g) =>
  g.subcategories.map((subcategory) => ({ group: g.name, subcategory }))
);

const NAME_CATEGORY_KEYWORDS: { pattern: RegExp; subcategory: string }[] = [
  { pattern: /\b(milk|cheese|yogurt|yoghurt|butter|cream|egg|eggs)\b/i, subcategory: "Dairy & Eggs" },
  { pattern: /\b(bread|bun|buns|cake|pastry|croissant|bakery)\b/i, subcategory: "Bakery" },
  { pattern: /\b(apple|banana|orange|tomato|potato|onion|vegetable|fruit|lettuce|carrot)\b/i, subcategory: "Fruits & Vegetables" },
  { pattern: /\b(chicken|beef|lamb|meat|turkey|poultry|mince)\b/i, subcategory: "Meat & Poultry" },
  { pattern: /\b(frozen|ice cream)\b/i, subcategory: "Frozen Foods" },
  { pattern: /\b(can|canned|tin|tinned)\b/i, subcategory: "Canned & Packaged Goods" },
  { pattern: /\b(chocolate|candy|sweet|sweets|snack|chips|crisps|cookie|biscuit)\b/i, subcategory: "Snacks & Sweets" },
  // A chocolate/candy brand name on its own ("Twix", "Snickers"...) never
  // matches the generic "chocolate|candy|sweet" rule above — nothing in
  // the name says what kind of product it is unless the brand itself is
  // recognized. Covers the handful of brands actually common enough to
  // name-drop here; anything else still falls through to a blank
  // category, which the Add Item form now flags clearly rather than
  // letting slip through to a confusing save error.
  {
    pattern: /\b(twix|snickers|kitkat|kit kat|mars|bounty|milky way|m&ms?|oreo|galaxy|toblerone|aero|crunch|kinder|lindt|cadbury)\b/i,
    subcategory: "Snacks & Sweets"
  },
  { pattern: /\b(water|juice|soda|cola|drink|beverage|coffee|tea|energy drink)\b/i, subcategory: "Beverages" },
  { pattern: /\b(rice|pasta|spaghetti|noodle|grain|flour|lentil|bean)\b/i, subcategory: "Rice, Pasta & Grains" },
  { pattern: /\b(oil|vinegar|ketchup|mayonnaise|sauce|condiment|spice)\b/i, subcategory: "Cooking Oils & Condiments" },
  { pattern: /\b(shirt|t-shirt|trouser|jeans|dress|jacket|men's|mens)\b/i, subcategory: "Men's Clothing" },
  { pattern: /\b(blouse|skirt|women's|womens|abaya)\b/i, subcategory: "Women's Clothing" },
  { pattern: /\b(kids|children|baby clothes)\b/i, subcategory: "Kids' Clothing" },
  { pattern: /\b(shoe|shoes|sneaker|sandal|boot|boots)\b/i, subcategory: "Shoes" },
  { pattern: /\b(bag|backpack|wallet|belt|accessory)\b/i, subcategory: "Bags & Accessories" },
  { pattern: /\b(phone|iphone|smartphone|samsung galaxy)\b/i, subcategory: "Mobile Phones" },
  { pattern: /\b(laptop|computer|pc|macbook|monitor keyboard)\b/i, subcategory: "Laptops & Computers" },
  { pattern: /\b(tv|television|display screen)\b/i, subcategory: "TVs & Displays" },
  { pattern: /\b(fridge|refrigerator|washing machine|microwave|oven|appliance)\b/i, subcategory: "Home Appliances" },
  { pattern: /\b(headphone|headphones|earbud|earbuds|speaker)\b/i, subcategory: "Audio & Headphones" },
  { pattern: /\b(tire|tyre|wheel)\b/i, subcategory: "Tires & Wheels" },
  { pattern: /\b(battery|batteries)\b/i, subcategory: "Batteries" },
  { pattern: /\b(engine oil|coolant|brake fluid|motor oil)\b/i, subcategory: "Oils & Fluids" },
  { pattern: /\b(filter|air filter|oil filter)\b/i, subcategory: "Filters" },
  { pattern: /\b(dash cam|car stereo|car electronics)\b/i, subcategory: "Car Electronics" },
  { pattern: /\b(bumper|mirror|body kit)\b/i, subcategory: "Exterior & Body" },
  { pattern: /\b(sofa|chair|table|desk|furniture|wardrobe)\b/i, subcategory: "Furniture" },
  { pattern: /\b(pot|pan|cutlery|kitchenware|plate|cup|mug)\b/i, subcategory: "Kitchenware" },
  { pattern: /\b(detergent|bleach|cleaner|cleaning|disinfectant)\b/i, subcategory: "Cleaning Supplies" },
  { pattern: /\b(tool|hammer|screwdriver|drill|hardware)\b/i, subcategory: "Tools & Hardware" },
  { pattern: /\b(garden|hose|plant pot|outdoor furniture)\b/i, subcategory: "Garden & Outdoor" },
  { pattern: /\b(moisturizer|sunscreen|skincare|serum|cleanser)\b/i, subcategory: "Skincare" },
  { pattern: /\b(shampoo|conditioner|hair gel|haircare)\b/i, subcategory: "Haircare" },
  { pattern: /\b(lipstick|mascara|foundation|makeup|eyeliner)\b/i, subcategory: "Makeup" },
  { pattern: /\b(soap|deodorant|toothpaste|razor|personal care)\b/i, subcategory: "Personal Care" },
  { pattern: /\b(vitamin|supplement|protein powder)\b/i, subcategory: "Vitamins & Supplements" }
];

// A finer-grained "what kind of thing is this, really" signal, used ONLY
// for matching "similar" products — never shown to merchants and never
// stored. The Category dropdown (CATEGORY_TREE) is deliberately broad
// ("Beverages", "Snacks & Sweets") so merchants aren't stuck picking from
// a huge list, but that same breadth makes "same category" far too loose
// a bar for "is this a reasonable substitute": bottled water, soda and
// dry tea bags are all "Beverages," but a shopper comparing tea prices
// has no use for water or Coca-Cola showing up as a "similar item." This
// splits the broadest, most heterogeneous categories into tighter buckets
// (tea vs. coffee vs. water vs. soda, chocolate vs. chips vs. cookies...)
// so the Similar Items match can require the SAME type of product, not
// just the same aisle. Returns null when nothing matches — callers treat
// "unknown type" as "don't exclude it," since a missed finer signal
// shouldn't make a real match disappear, it should just fall back to the
// broader category check.
const NAME_TYPE_KEYWORDS: { pattern: RegExp; type: string }[] = [
  // Beverages, split apart — the case that prompted this.
  { pattern: /\b(tea|teabags?|tea bags?)\b/i, type: "tea" },
  { pattern: /\bcoffee\b/i, type: "coffee" },
  { pattern: /\b(energy drink)\b/i, type: "energy_drink" },
  { pattern: /\b(soda|cola|fizzy drink|sparkling drink|carbonated drink)\b/i, type: "soda" },
  { pattern: /\bjuice\b/i, type: "juice" },
  { pattern: /\bwater\b/i, type: "water" },
  { pattern: /\bmilk\b/i, type: "milk" },
  // Snacks & Sweets, same problem — chips and chocolate aren't substitutes
  // just because they're both "Snacks & Sweets."
  {
    pattern: /\b(chocolate|twix|snickers|kitkat|kit kat|mars|bounty|milky way|m&ms?|galaxy|toblerone|aero|crunch|kinder|lindt|cadbury)\b/i,
    type: "chocolate"
  },
  { pattern: /\b(chips|crisps)\b/i, type: "chips" },
  { pattern: /\b(cookie|biscuit)\b/i, type: "cookies" },
  { pattern: /\b(candy|sweet|sweets|gummy|gummies)\b/i, type: "candy" }
];

/**
 * Finer-than-category "type of product" guess, for deciding whether two
 * products in the same broad category are actually reasonable substitutes
 * for each other. Returns null when the name doesn't hint at a known
 * finer type — treat that as "no signal," not "no match."
 */
export function inferProductType(productName: string | null | undefined): string | null {
  const name = (productName ?? "").trim();
  if (!name) return null;
  for (const { pattern, type } of NAME_TYPE_KEYWORDS) {
    if (pattern.test(name)) return type;
  }
  return null;
}

/** Best-effort subcategory guess from whatever's been typed into the product-name field so far. Returns null rather than guessing when nothing matches — the merchant picks manually instead. */
export function inferCategory(productName: string): CategoryOption | null {
  const name = productName.trim();
  if (!name) return null;
  for (const { pattern, subcategory } of NAME_CATEGORY_KEYWORDS) {
    if (pattern.test(name)) {
      const option = CATEGORY_OPTIONS.find((o) => o.subcategory === subcategory);
      if (option) return option;
    }
  }
  return null;
}

/**
 * Picks Weight / Volume / Length / Units for a product, in order: the
 * product name's own keywords (an egg carton is always a headcount, even
 * filed under Dairy & Eggs), then the category's usual size type, then
 * "units" as the safe default for anything that isn't a physical
 * weight/volume/length measurement — multi-packs, electronics, general
 * packaged goods.
 */
export function inferSizeType(productName: string, subcategory: string | null): SizeType {
  const name = productName.trim();
  for (const { pattern, type } of NAME_SIZE_TYPE_KEYWORDS) {
    if (pattern.test(name)) return type;
  }
  if (subcategory && SUBCATEGORY_SIZE_TYPE[subcategory]) return SUBCATEGORY_SIZE_TYPE[subcategory];
  return "units";
}

/** The unit to preselect when a size type is chosen (its first/most common unit), falling back to "pcs" for anything unrecognized. */
export function defaultUnitForSizeType(sizeType: SizeType): string {
  return SIZE_TYPE_UNITS[sizeType]?.[0] ?? "pcs";
}

// Nutrition facts (calories, protein, sugar, etc.) only mean anything for
// something you actually eat or drink — a GPT estimate asked for "typical
// nutrition facts" on a phone case, a car battery, or a bar of soap just
// hallucinates plausible-looking numbers rather than reporting "not
// applicable," which is worse than showing nothing. Vitamins & Supplements
// carry a real Supplement Facts panel too, so it's included alongside the
// whole Groceries & Food group.
const NUTRITION_RELEVANT_SUBCATEGORIES = new Set<string>([
  ...(CATEGORY_TREE.find((g) => g.name === "Groceries & Food")?.subcategories ?? []),
  "Vitamins & Supplements"
]);

/**
 * Whether nutrition facts make sense for this product at all. Checks the
 * product's own category first (when known); otherwise falls back to the
 * same name-keyword guess used for auto-categorization, so a not-yet-
 * categorized item still gets a sensible answer rather than defaulting to
 * "show nutrition facts for everything."
 */
export function isNutritionRelevant(input: { category?: string | null; productName?: string | null }): boolean {
  const category = (input.category ?? "").trim();
  if (category) return NUTRITION_RELEVANT_SUBCATEGORIES.has(category);
  const guessed = input.productName ? inferCategory(input.productName) : null;
  return guessed ? NUTRITION_RELEVANT_SUBCATEGORIES.has(guessed.subcategory) : false;
}
