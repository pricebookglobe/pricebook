import { NextRequest, NextResponse } from "next/server";
import { extractProductFromImage, parseTextQuery } from "@/lib/aiVision";

export async function POST(req: NextRequest) {
  const { text, imageBase64 } = await req.json();
  if (!text && !imageBase64) {
    return NextResponse.json({ error: "Provide text or imageBase64" }, { status: 400 });
  }

  try {
    const structured = imageBase64 ? await extractProductFromImage(imageBase64) : await parseTextQuery(text);
    return NextResponse.json(structured);
  } catch (err) {
    console.error("extract error", err);
    return NextResponse.json({ error: "Couldn't read that product, try again." }, { status: 500 });
  }
}
