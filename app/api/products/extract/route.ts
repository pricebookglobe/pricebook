import { NextRequest, NextResponse } from "next/server";
import { extractProductsFromImage, parseTextQuery } from "@/lib/aiVision";

// Always responds with { items: [...] } — a photo can show one product or
// several (a shelf, a few items together), and a text query is always
// exactly one. Returning the same shape either way means the Add Item
// page doesn't need two different response formats to handle: one item
// is just the one-element case of "however many were found."
export async function POST(req: NextRequest) {
  const { text, imageBase64 } = await req.json();
  if (!text && !imageBase64) {
    return NextResponse.json({ error: "Provide text or imageBase64" }, { status: 400 });
  }

  try {
    const items = imageBase64 ? await extractProductsFromImage(imageBase64) : [await parseTextQuery(text)];
    if (!items.length) {
      return NextResponse.json({ error: "Couldn't identify any product in that photo, try again." }, { status: 422 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    console.error("extract error", err);
    return NextResponse.json({ error: "Couldn't read that product, try again." }, { status: 500 });
  }
}
