import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type StructuredProduct = {
  product_name: string;
  brand: string | null;
  size: number | null;
  unit: string | null;
  category: string;
};

const EXTRACTION_SHAPE =
  '{"product_name":"","brand":"","size":0,"unit":"","category":""}';

/** Image (base64, no data: prefix) -> structured product JSON via GPT-4o Vision. */
export async function extractProductFromImage(
  imageBase64: string
): Promise<StructuredProduct> {
  const response = await openai.chat.completions.create({
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
}

/** Free-text query -> the same structured shape (handles typos, synonyms, local phrasing). */
export async function parseTextQuery(text: string): Promise<StructuredProduct> {
  const response = await openai.chat.completions.create({
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
}

/** Structured product -> 1536-dim embedding for pgvector matching. */
export async function embedProductDescription(
  structured: StructuredProduct
): Promise<number[]> {
  const text = [structured.brand, structured.product_name, structured.size, structured.unit, structured.category]
    .filter(Boolean)
    .join(" ")
    .trim();

  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });

  return res.data[0].embedding;
}
