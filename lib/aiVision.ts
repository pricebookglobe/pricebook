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
  size: number | null;
  unit: string | null;
  category: string;
};

const EXTRACTION_SHAPE =
  '{"product_name":"","brand":"","manufacturer":"","size":0,"unit":"","category":""}';

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
                EXTRACTION_SHAPE
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

/** Free-text query -> the same structured shape (handles typos, synonyms, local phrasing). */
export async function parseTextQuery(text: string): Promise<StructuredProduct> {
  return withRetry(async () => {
    const response = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content:
            `Parse this grocery search into JSON only, no prose: "${text}". ` +
            `Shape: ${EXTRACTION_SHAPE}. If size/unit aren't mentioned, use null.`
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
