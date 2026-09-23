import { NextRequest, NextResponse } from "next/server";
import { estimateNutritionFacts } from "@/lib/aiVision";

export async function POST(req: NextRequest) {
  const structured = await req.json();
  if (!structured?.product_name) {
    return NextResponse.json({ error: "product_name is required" }, { status: 400 });
  }

  try {
    const facts = await estimateNutritionFacts(structured);
    return NextResponse.json(facts);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't estimate nutrition facts." }, { status: 500 });
  }
}
