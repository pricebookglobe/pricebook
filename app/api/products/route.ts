import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { embedProductDescription, type StructuredProduct, type NutritionFacts } from "@/lib/aiVision";
import { uploadProductImage } from "@/lib/storage";
import { normalizeUnit } from "@/lib/units";

export async function POST(req: NextRequest) {
  const body: StructuredProduct & { imageBase64?: string; imageUrl?: string; nutrition_facts?: NutritionFacts | null; barcode?: string } =
    await req.json();
  // Normalize once, here, before it's used for either the dedup lookup or
  // the insert below — every write path (Add Item, barcode scan, photo
  // extraction) funnels through this one endpoint, so this is the single
  // place that keeps new product rows' unit text consistent regardless of
  // how it was spelled/extracted ("grams" -> "g", "litre" -> "L", etc.).
  if (body.unit) body.unit = normalizeUnit(body.unit) ?? body.unit;
  if (!body.product_name || !body.category) {
    // Names the actual missing field(s) rather than always blaming both —
    // the far more common case is product_name being filled in (it's
    // required earlier in the Add Item flow) while category is the one
    // thing genuinely left blank (a brand name like "Twix" or "Snickers"
    // doesn't match any category keyword, and GPT's own extraction
    // doesn't always return one either), and a message that blames a
    // field the merchant can plainly see is filled in just reads as
    // broken rather than telling them what to actually fix.
    const missing = [!body.product_name && "item name", !body.category && "category"].filter(Boolean).join(" and ");
    return NextResponse.json({ error: `Please fill in the ${missing} before saving.` }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  let query = supabase
    .from("products")
    .select("id")
    .ilike("canonical_name", body.product_name)
    .eq("category", body.category)
    // A 6-pack and a 12-pack of the same item are different listings
    // (different price, different quantity) — same reasoning as size/unit
    // below, so they dedup as distinct products, not merged into one.
    .eq("pack_size", body.pack_size ?? 1);
  if (body.brand) query = query.eq("brand", body.brand);
  if (body.size) query = query.eq("size", body.size);
  if (body.unit) query = query.eq("unit", body.unit);

  const { data: existing } = await query.maybeSingle();
  if (existing) {
    // A product can exist with no embedding if an earlier add attempt
    // created the row but then failed before the embedding was saved (an
    // OpenAI hiccup, a timeout) — without this check, every future "add"
    // of the same product just returns that same broken, unsearchable ID
    // forever, since the dedup match above never looks past the name.
    const { data: hasEmbedding } = await supabase
      .from("product_embeddings")
      .select("product_id")
      .eq("product_id", existing.id)
      .maybeSingle();

    if (!hasEmbedding) {
      const embedding = await embedProductDescription(body);
      const { error: embedError } = await supabase
        .from("product_embeddings")
        .insert({ product_id: existing.id, embedding });
      if (embedError) return NextResponse.json({ error: embedError.message }, { status: 500 });
    }

    if (body.nutrition_facts) {
      await supabase.from("products").update({ nutrition_facts: body.nutrition_facts }).eq("id", existing.id);
    }
    // If this same product is matched again later via barcode scan (by
    // this merchant or another), save the barcode now so that future
    // customer scans of this exact code match it with certainty instead
    // of relying on fuzzy text similarity.
    if (body.barcode) {
      await supabase.from("products").update({ barcode: body.barcode }).eq("id", existing.id);
    }

    return NextResponse.json({ product_id: existing.id, created: false });
  }

  const { data: created, error: insertError } = await supabase
    .from("products")
    .insert({
      canonical_name: body.product_name,
      brand: body.brand,
      manufacturer: body.manufacturer ?? null,
      size: body.size,
      unit: body.unit,
      category: body.category,
      pack_size: body.pack_size ?? 1,
      size_type: body.size_type ?? "units",
      nutrition_facts: body.nutrition_facts ?? null,
      barcode: body.barcode ?? null
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // A photo taken during "Add item" becomes the product's listing photo —
  // best-effort, never blocks saving the product if the upload fails.
  // A barcode lookup instead passes a direct image URL (from the product
  // database) that we can just store as-is, no upload needed.
  if (body.imageBase64) {
    const imageUrl = await uploadProductImage(body.imageBase64, created.id);
    if (imageUrl) await supabase.from("products").update({ image_url: imageUrl }).eq("id", created.id);
  } else if (body.imageUrl) {
    await supabase.from("products").update({ image_url: body.imageUrl }).eq("id", created.id);
  }

  const embedding = await embedProductDescription(body);
  const { error: embedError } = await supabase
    .from("product_embeddings")
    .insert({ product_id: created.id, embedding });

  if (embedError) return NextResponse.json({ error: embedError.message }, { status: 500 });

  return NextResponse.json({ product_id: created.id, created: true });
}
