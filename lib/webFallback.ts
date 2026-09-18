import type { StructuredProduct } from "./aiVision";

export type WebEstimate = {
  price_estimate: number | null;
  currency: string;
  source_url: string | null;
  note: string;
};

/**
 * Reference pricing when no local store carries a close match.
 * Wire this up to Serper.dev or Bing Web Search once you have a key —
 * this stub keeps the search flow working without one during early dev.
 */
export async function webFallbackSearch(
  structured: StructuredProduct
): Promise<WebEstimate> {
  const apiKey = process.env.WEB_SEARCH_API_KEY;
  if (!apiKey) {
    return {
      price_estimate: null,
      currency: "JOD",
      source_url: null,
      note: "WEB_SEARCH_API_KEY not set — skipping web fallback."
    };
  }

  const query = [structured.brand, structured.product_name, structured.size, structured.unit]
    .filter(Boolean)
    .join(" ");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: `${query} price` })
  });

  if (!res.ok) {
    return { price_estimate: null, currency: "JOD", source_url: null, note: "Web fallback request failed." };
  }

  const data = await res.json();
  const top = data.organic?.[0];

  // Serper doesn't return structured prices — a production version should
  // parse `top.snippet` with a small regex or a follow-up GPT-4o call.
  return {
    price_estimate: null,
    currency: "JOD",
    source_url: top?.link ?? null,
    note: "Reference link only; add price parsing before relying on this."
  };
}
