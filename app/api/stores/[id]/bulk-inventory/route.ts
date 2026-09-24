import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { parseCSVToObjects } from "@/lib/csv";
import { embedProductDescription } from "@/lib/aiVision";

// Accepts either a logged-in merchant's Supabase session (the dashboard's
// own bulk-upload page) OR that store's long-lived API key (an external
// POS/inventory system calling this automatically, which can't
// practically do a browser login) — same endpoint, same behavior either
// way, just two ways to prove it's really this store.
async function authenticate(req: NextRequest, storeId: string) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const supabase = createServiceSupabase();

  const { data: byApiKey } = await supabase.from("stores").select("id").eq("id", storeId).eq("api_key", token).maybeSingle();
  if (byApiKey) return { supabase };

  const { data: userData } = await supabase.auth.getUser(token);
  if (userData?.user) {
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (storeError) return { error: NextResponse.json({ error: storeError.message }, { status: 500 }) };
    if (store) return { supabase };
  }

  return { error: NextResponse.json({ error: "Invalid session or API key" }, { status: 401 }) };
}

const REQUIRED_COLUMNS = ["item_name", "category", "price"];
const MAX_ROWS = 1000;

type InputRow = Record<string, string>;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const verified = await authenticate(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const body = await req.json();
  let rows: InputRow[];

  if (typeof body.csv === "string" && body.csv.trim()) {
    rows = parseCSVToObjects(body.csv);
  } else if (Array.isArray(body.items)) {
    // A POS/inventory system's own integration — plain JSON is more
    // natural to generate programmatically than building a CSV string.
    // Each item's keys are lowercased so callers aren't tripped up by
    // case (ItemName vs item_name).
    rows = body.items.map((item: Record<string, unknown>) => {
      const row: InputRow = {};
      for (const [k, v] of Object.entries(item)) row[k.toLowerCase()] = v == null ? "" : String(v);
      return row;
    });
  } else {
    return NextResponse.json({ error: "Provide either csv (string) or items (array of objects)" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found — check the file has a header row and at least one item." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${rows.length}) — split into batches of ${MAX_ROWS} or fewer.` }, { status: 400 });
  }

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !(c in rows[0]));
  if (missingColumns.length) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missingColumns.join(", ")}. See the template or API docs for the exact field names.` },
      { status: 400 }
    );
  }

  let added = 0;
  let updated = 0;
  const failed: { row: number; reason: string }[] = [];

  // Processed one row at a time, not in parallel — a genuinely new
  // product needs a real OpenAI embedding call, and running many of
  // those simultaneously risks hitting rate limits. A row that's just a
  // price update for an existing product skips that step entirely and is
  // fast, so a re-upload of an already-registered catalog (the common
  // "just update my prices" case) completes quickly regardless of size.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing

    try {
      const itemName = row.item_name?.trim();
      const category = row.category?.trim();
      const priceRaw = row.price?.trim();
      const brand = row.brand?.trim() || null;
      const sizeRaw = row.size?.trim();
      const unit = row.unit?.trim() || null;
      const currency = row.currency?.trim() || "JOD";
      const barcode = row.barcode?.trim() || null;

      if (!itemName) throw new Error("item_name is required");
      if (!category) throw new Error("category is required");
      if (!priceRaw) throw new Error("price is required");

      const price = parseFloat(priceRaw);
      if (Number.isNaN(price) || price < 0) throw new Error(`price "${priceRaw}" is not a valid positive number`);

      const size = sizeRaw ? parseFloat(sizeRaw) : null;
      if (sizeRaw && Number.isNaN(size)) throw new Error(`size "${sizeRaw}" is not a valid number`);

      // Match an existing product: by barcode first if given (exact,
      // unambiguous), else by the same name+brand+size+unit+category
      // combination used everywhere else in the app, so a re-upload of
      // the same catalog updates prices instead of creating duplicates.
      let productId: string | null = null;
      if (barcode) {
        const { data } = await supabase.from("products").select("id").eq("barcode", barcode).maybeSingle();
        productId = data?.id ?? null;
      }
      if (!productId) {
        let query = supabase.from("products").select("id").ilike("canonical_name", itemName).eq("category", category);
        if (brand) query = query.eq("brand", brand);
        if (size != null) query = query.eq("size", size);
        if (unit) query = query.eq("unit", unit);
        const { data } = await query.maybeSingle();
        productId = data?.id ?? null;
      }

      if (!productId) {
        const { data: created, error: insertError } = await supabase
          .from("products")
          .insert({ canonical_name: itemName, brand, manufacturer: null, size, unit, category, barcode })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        productId = created.id;

        const embedding = await embedProductDescription({ product_name: itemName, brand, manufacturer: null, size, unit, category });
        const { error: embedError } = await supabase.from("product_embeddings").insert({ product_id: productId, embedding });
        if (embedError) throw new Error(embedError.message);
      } else {
        // Same self-healing as the single-item add flow — a product can
        // exist with no embedding if an earlier attempt (bulk or single)
        // was interrupted before the embedding was saved.
        const { data: hasEmbedding } = await supabase
          .from("product_embeddings")
          .select("product_id")
          .eq("product_id", productId)
          .maybeSingle();
        if (!hasEmbedding) {
          const embedding = await embedProductDescription({ product_name: itemName, brand, manufacturer: null, size, unit, category });
          await supabase.from("product_embeddings").insert({ product_id: productId, embedding });
        }
        if (barcode) {
          await supabase.from("products").update({ barcode }).eq("id", productId).is("barcode", null);
        }
      }

      const { data: existingInventory } = await supabase
        .from("store_inventory")
        .select("id")
        .eq("store_id", params.id)
        .eq("product_id", productId)
        .maybeSingle();

      if (existingInventory) {
        const { error: updateError } = await supabase
          .from("store_inventory")
          .update({ price, currency, updated_at: new Date().toISOString() })
          .eq("id", existingInventory.id);
        if (updateError) throw new Error(updateError.message);
        await supabase.from("price_history").insert({ store_id: params.id, product_id: productId, price });
        updated++;
      } else {
        const { error: insertInvError } = await supabase
          .from("store_inventory")
          .insert({ store_id: params.id, product_id: productId, price, currency, in_stock: true, is_hidden: false });
        if (insertInvError) throw new Error(insertInvError.message);
        added++;
      }
    } catch (e: any) {
      failed.push({ row: rowNum, reason: e.message ?? "Unknown error" });
    }
  }

  return NextResponse.json({ added, updated, failed, total: rows.length });
}
