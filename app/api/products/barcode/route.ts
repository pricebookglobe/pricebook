import { NextRequest, NextResponse } from "next/server";
import type { NutritionFacts } from "@/lib/aiVision";

// Parses Open Food Facts' free-text "quantity" field ("330 ml", "1L",
// "500 g", "2 x 250ml"...) into a single number + unit. Best-effort —
// falls back to nulls (merchant can fill these in manually) rather than
// guessing wrong.
function parseQuantity(quantity: string | undefined): { size: number | null; unit: string | null } {
  if (!quantity) return { size: null, unit: null };
  const match = quantity.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz|lb|pcs?|pieces?)/i);
  if (!match) return { size: null, unit: null };
  const size = parseFloat(match[1].replace(",", "."));
  const unitRaw = match[2].toLowerCase();
  const unit = unitRaw.startsWith("l") ? "L" : unitRaw.startsWith("piece") || unitRaw.startsWith("pc") ? "pcs" : unitRaw;
  return { size, unit };
}

function extractNutrition(product: any): NutritionFacts | null {
  const n = product.nutriments;
  if (!n) return null;

  // Prefer real per-serving values when Open Food Facts has them; fall
  // back to per-100g figures labeled as such, rather than guessing.
  const hasServing = n["energy-kcal_serving"] != null || n["proteins_serving"] != null;
  const suffix = hasServing ? "_serving" : "_100g";
  const servingLabel = hasServing ? product.serving_size ?? null : "100 g";

  const sodiumG = n[`sodium${suffix}`];

  const facts: NutritionFacts = {
    serving_size: servingLabel,
    calories: n[`energy-kcal${suffix}`] ?? null,
    protein_g: n[`proteins${suffix}`] ?? null,
    fat_g: n[`fat${suffix}`] ?? null,
    carbs_g: n[`carbohydrates${suffix}`] ?? null,
    sugar_g: n[`sugars${suffix}`] ?? null,
    sodium_mg: sodiumG != null ? Math.round(sodiumG * 1000) : null
  };

  // Nothing usable at all — treat as no data rather than an empty shell.
  const hasAnyValue = Object.values(facts).some((v) => v !== null);
  return hasAnyValue ? facts : null;
}

export async function POST(req: NextRequest) {
  const { barcode } = await req.json();
  if (!barcode || typeof barcode !== "string") {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { "User-Agent": "PriceBook/1.0 (grocery price comparison app)" }
    });

    // A non-200 response (rate limiting, a service hiccup) was previously
    // treated the same as a genuine "not in the database" result, since
    // res.json() on an error body still parses to *something* without
    // status: 1. That's a false negative for a product that may well be
    // in the database — surface it as a real, distinct error instead.
    // Open Food Facts is documented as always returning 200 with
    // status: 0 for an unknown barcode — but in practice, a barcode it
    // has genuinely never seen at all can 404 at the routing layer
    // before reaching that logic. Treating 404 as a real error was
    // producing a misleading "lookup service failed" message for what's
    // actually just a normal "not in the database" result — the same
    // outcome as status: 0, just via a different HTTP status.
    if (res.status === 404) {
      return NextResponse.json({ found: false, scanned_barcode: barcode });
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Product lookup service returned an error (${res.status}) for barcode "${barcode}". Try again in a moment, or check that this looks like a real barcode number.`,
          scanned_barcode: barcode
        },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return NextResponse.json({ found: false, scanned_barcode: barcode });
    }

    const product = data.product;
    const { size, unit } = parseQuantity(product.quantity);

    return NextResponse.json({
      found: true,
      structured: {
        product_name: product.product_name || product.generic_name || "Unknown product",
        brand: product.brands ? product.brands.split(",")[0].trim() : null,
        manufacturer: null,
        size,
        unit,
        category: product.categories_tags?.[0]?.replace(/^\w+:/, "").replace(/-/g, " ") ?? "grocery"
      },
      image_url: product.image_front_url || product.image_url || null,
      nutrition_facts: extractNutrition(product)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Barcode lookup failed." }, { status: 500 });
  }
}
