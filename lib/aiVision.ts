import OpenAI from "openai";

// Lazy singleton: constructing OpenAI() throws immediately if the key is
// missing, which would otherwise crash Next.js's build-time page-data
// collection (env vars aren't guaranteed loaded at that step). Building
// the client on first real call keeps the build itself env-independent.
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// A single OpenAI call with no retry means any transient hiccup — a rate
// limit, a brief timeout, an occasionally-truncated response — surfaces
// straight to the person as "couldn't read that product," even though
// trying again half a second later usually just works. One retry with a
// short pause covers the common transient case without masking a
// genuinely broken request (a real error on both tries still throws).
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError;
}

export type StructuredProduct = {
  product_name: string;
  brand: string | null;
  manufacturer?: string | null;
  // The size/unit of ONE individual item — a single can, a single bottle,
  // a single piece — never the pack as a whole. How many of those come in
  // one listing is pack_size, below.
  size: number | null;
  unit: string | null;
  category: string;
  // How many individual units this listing actually sells together — a
  // 6-pack of Coca-Cola cans, a 24-pack of water bottles, a bundle/offer
  // pack. 1 for a plain single item, which is why it's a number (not
  // optional/null): "how many are in this pack" always has a real answer.
  pack_size?: number;
  // What size/unit measures for this product: a physical weight, volume,
  // or length, or just a plain unit count (canned drinks sold by the
  // can, electronics, general packaged goods — anything that isn't
  // naturally weighed/measured). Optional on the wire since older
  // callers (the barcode DB path, manual edits) may not always set it;
  // UI and the create-product API both default it to "units" when absent.
  size_type?: "weight" | "volume" | "length" | "units";
};

const EXTRACTION_SHAPE =
  '{"product_name":"","brand":"","manufacturer":"","size":0,"unit":"","category":"","pack_size":1,"size_type":""}';

/** Image (base64, no data: prefix) -> structured product JSON via GPT-4o Vision. */
export async function extractProductFromImage(
  imageBase64: string
): Promise<StructuredProduct> {
  return withRetry(async () => {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify the grocery product in this image. Return ONLY JSON matching this shape, no prose: " +
                EXTRACTION_SHAPE +
                ". size/unit describe ONE individual item (a single can/bottle/piece), never the pack as a " +
                "whole. pack_size is how many of those individual items this listing sells together — 1 for " +
                "a single item, or the real count for a visible multi-pack/bundle (a 6-pack of cans is " +
                'pack_size 6). size_type is one of "weight", "volume", "length", or "units" — weight/volume/' +
                "length for anything with a real physical measurement (use unit g/kg, ml/L, or cm/m to " +
                'match), otherwise "units" with unit "pcs" and size 1 (canned drinks sold by the can, ' +
                "electronics, general packaged goods with no inherent size)."
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content ?? "{}");
  });
}

/**
 * Same idea as extractProductFromImage, but for a photo that may show
 * SEVERAL different products at once — a shelf, a counter, a few items
 * lined up — used by the merchant Add Item flow so one photo can start
 * several listings instead of exactly one. Still works fine for a photo
 * of a single item (returns a one-element array), so callers that want
 * "detect however many products are really in this photo" can use this
 * unconditionally rather than needing to know in advance which case
 * they're in.
 */
export async function extractProductsFromImage(
  imageBase64: string
): Promise<StructuredProduct[]> {
  return withRetry(async () => {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify every DISTINCT grocery product visible in this image — it may show just one " +
                "item, or several different products together (a shelf, a counter, a few items lined up). " +
                'Return ONLY JSON matching this shape, no prose: {"items":[' +
                EXTRACTION_SHAPE +
                ']}. List each distinct product ONCE — if the same product appears more than once (several ' +
                "facings of the same item on a shelf), include it only a single time, not once per copy. " +
                "size/unit describe ONE individual item (a single can/bottle/piece), never the pack as a " +
                "whole. pack_size is how many of those individual items this listing sells together — 1 for " +
                "a single item, or the real count for a visible multi-pack/bundle (a 6-pack of cans is " +
                'pack_size 6). size_type is one of "weight", "volume", "length", or "units" — weight/volume/' +
                "length for anything with a real physical measurement (use unit g/kg, ml/L, or cm/m to " +
                'match), otherwise "units" with unit "pcs" and size 1 (canned drinks sold by the can, ' +
                "electronics, general packaged goods with no inherent size)."
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    return Array.isArray(parsed.items) ? parsed.items : [];
  });
}

/** Free-text query -> the same structured shape (handles typos, synonyms, local phrasing). */
export async function parseTextQuery(text: string): Promise<StructuredProduct> {
  return withRetry(async () => {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content:
            `Parse this grocery search into JSON only, no prose: "${text}". The search may be in ` +
            `any language, but grocery items in this database are registered using their common ` +
            `English/Latin-script name and brand (e.g. "Al Ain", "Snickers", "Pepsi") — so translate ` +
            // Registered products are stored under their common English/Latin
            // name. Without this instruction, a query typed in Arabic (or any
            // other non-Latin script) gets embedded as-is, and its embedding
            // lands too far from the stored English-name embedding to pass
            // the similarity threshold — search finds nothing even though the
            // product is genuinely in the database. Translating/transliterating
            // the parsed name here, before embedding, is what actually makes
            // "any language" search work rather than just accepting any
            // language as input.
            `product_name and brand into their standard English/Latin-script form, even if the ` +
            `input used a different script or language (for example "حليب المراعي" -> product_name ` +
            `"Al Ain milk"; "سنيكرز" -> product_name "Snickers"). ` +
            `Shape: ${EXTRACTION_SHAPE}. If size/unit aren't mentioned, use null. size/unit describe ONE ` +
            `individual item, never a pack as a whole; pack_size is how many of those the query describes ` +
            `(1 unless a multi-pack is explicitly mentioned, e.g. "pack of 6 cola cans" -> pack_size 6). ` +
            `size_type is one of "weight", "volume", "length", or "units" (plain count, for anything with ` +
            `no real physical measurement — default size 1, unit "pcs").`
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content ?? "{}");
  });
}

/** Structured product -> 1536-dim embedding for pgvector matching. */
export async function embedProductDescription(
  structured: StructuredProduct
): Promise<number[]> {
  const text = [structured.brand, structured.manufacturer, structured.product_name, structured.size, structured.unit, structured.category]
    .filter(Boolean)
    .join(" ")
    .trim()
    // Lowercased before embedding — this same function embeds both a
    // product when a merchant lists it AND a customer's search query, so
    // without this, "Coca Cola" and "COCA COLA" could produce slightly
    // different vectors and land on opposite sides of the similarity
    // threshold, making the search look "case sensitive" even though
    // nothing here is a literal string comparison. Normalizing case for
    // every embedding removes that variable entirely.
    .toLowerCase();

  return withRetry(async () => {
    const res = await openai().embeddings.create({
      model: "text-embedding-3-small",
      input: text
    });

    return res.data[0].embedding;
  });
}

export type NutritionFacts = {
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

// GPT-4o has no live web access here — this is its best estimate from
// training knowledge for a product matching this description, not a
// lookup of the actual package. It's usually a reasonable starting point
// for well-known branded products, but should always be shown to the
// merchant as an editable estimate to check against the real label,
// never presented as a verified fact.
export async function estimateNutritionFacts(structured: StructuredProduct): Promise<NutritionFacts> {
  const description = [structured.brand, structured.manufacturer, structured.product_name, structured.size, structured.unit]
    .filter(Boolean)
    .join(" ");

  return withRetry(async () => {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content:
            `Give your best estimate of typical nutrition facts for this grocery product: "${description}" (category: ${structured.category}). ` +
            "Use your general knowledge of this product or similar products — you don't have live internet access, so this is an estimate, not a verified label reading. " +
            "Return ONLY JSON matching this shape, with numbers only (no units in the values) and null for anything you can't reasonably estimate: " +
            '{"serving_size":"","calories":0,"protein_g":0,"fat_g":0,"carbs_g":0,"sugar_g":0,"sodium_mg":0}'
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content ?? "{}");
  });
}
