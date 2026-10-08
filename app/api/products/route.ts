import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { embedProductDescription, type StructuredProduct, type NutritionFacts } from "@/lib/aiVision";
import { uploadProductImage } from "@/lib/storage";
import { normalizeUnit } from "@/lib/units";

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (e: any) {
    // A route that throws instead of returning JSON gets a raw platform
    // error response back on the client, often with no body at all — the
    // client's res.json() then fails with "Unexpected end of JSON input",
    // which reads to the merchant as a mysterious crash with no actual
    // explanation. Wrapping the whole handler guarantees a real, readable
    // error comes back no matter what breaks (a bad embedding call, an
    // unexpected database constraint, anything).
    return NextResponse.json({ error: `Unexpected server error: ${e.message ?? String(e)}` }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const body: StructuredProduct & {
    imageBase64?: string;
    imageUrl?: string;
    // Set by the Add Item page when imageBase64 already went through
    // /api/products/prepare-image once for this batch — see
    // lib/storage.ts's uploadProductImage for why re-running that step
    // per item isn't just wasteful but was crashing the server outright.
    imagePreprocessed?: boolean;
    nutrition_facts?: NutritionFacts | null;
    barcode?: string;
  } = await req.json();
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
  const packSize = body.pack_size ?? 1;

  // Same barcode can legitimately label more than one real listing — a
  // single can and a 6-pack of it often print the same code — so a
  // barcode alone is never enough to call two rows "the same product".
  // Checked first (and separately from the name-based dedup below) so
  // that re-scanning the SAME barcode+size+pack a second time updates
  // that exact listing, while scanning it again with a different
  // size/pack creates a new one instead of colliding with the unique
  // index on (barcode, pack_size, size, unit).
  let existing: { id: string } | null = null;
  if (body.barcode) {
    let bcQuery = supabase.from("products").select("id").eq("barcode", body.barcode).eq("pack_size", packSize);
    bcQuery = body.size != null ? bcQuery.eq("size", body.size) : bcQuery.is("size", null);
    bcQuery = body.unit ? bcQuery.eq("unit", body.unit) : bcQuery.is("unit", null);
    const { data } = await bcQuery.maybeSingle();
    existing = data ?? null;
  }

  if (!existing) {
    let query = supabase
      .from("products")
      .select("id")
      .ilike("canonical_name", body.product_name)
      .eq("category", body.category)
      // A 6-pack and a 12-pack of the same item are different listings
      // (different price, different quantity) — same reasoning as size/unit
      // below, so they dedup as distinct products, not merged into one.
      .eq("pack_size", packSize);
    if (body.brand) query = query.eq("brand", body.brand);
    if (body.size) query = query.eq("size", body.size);
    if (body.unit) query = query.eq("unit", body.unit);

    const { data } = await query.maybeSingle();
    existing = data ?? null;
  }
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
      pack_size: packSize,
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
    const imageUrl = await uploadProductImage(body.imageBase64, created.id, { skipCutout: body.imagePreprocessed });
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
