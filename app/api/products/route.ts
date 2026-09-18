import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { embedProductDescription, type StructuredProduct } from "@/lib/aiVision";

export async function POST(req: NextRequest) {
  const body: StructuredProduct = await req.json();
  if (!body.product_name || !body.category) {
    return NextResponse.json({ error: "product_name and category are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Reuse an existing product if the name/brand/size/unit already match —
  // avoids duplicate catalog entries every time a merchant adds the same item.
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
      size: body.size,
      unit: body.unit,
      category: body.category
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const embedding = await embedProductDescription(body);
  const { error: embedError } = await supabase
    .from("product_embeddings")
    .insert({ product_id: created.id, embedding });

  if (embedError) return NextResponse.json({ error: embedError.message }, { status: 500 });

  return NextResponse.json({ product_id: created.id, created: true });
}
