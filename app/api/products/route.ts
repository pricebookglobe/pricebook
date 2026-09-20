import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { embedProductDescription, type StructuredProduct } from "@/lib/aiVision";
import { uploadProductImage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const body: StructuredProduct & { imageBase64?: string } = await req.json();
  if (!body.product_name || !body.category) {
    return NextResponse.json({ error: "product_name and category are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  let query = supabase
    .from("products")
    .select("id")
    .ilike("canonical_name", body.product_name)
    .eq("category", body.category);
  if (body.brand) query = query.eq("brand", body.brand);
  if (body.size) query = query.eq("size", body.size);
  if (body.unit) query = query.eq("unit", body.unit);

  const { data: existing } = await query.maybeSingle();
  if (existing) return NextResponse.json({ product_id: existing.id, created: false });

  const { data: created, error: insertError } = await supabase
    .from("products")
    .insert({
      canonical_name: body.product_name,
      brand: body.brand,
      manufacturer: body.manufacturer ?? null,
      size: body.size,
      unit: body.unit,
      category: body.category
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // A photo taken during "Add item" becomes the product's listing photo —
  // best-effort, never blocks saving the product if the upload fails.
  if (body.imageBase64) {
    const imageUrl = await uploadProductImage(body.imageBase64, created.id);
    if (imageUrl) await supabase.from("products").update({ image_url: imageUrl }).eq("id", created.id);
  }

  const embedding = await embedProductDescription(body);
  const { error: embedError } = await supabase
    .from("product_embeddings")
    .insert({ product_id: created.id, embedding });

  if (embedError) return NextResponse.json({ error: embedError.message }, { status: 500 });

  return NextResponse.json({ product_id: created.id, created: true });
}
