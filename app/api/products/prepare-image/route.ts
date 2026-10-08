import { NextRequest, NextResponse } from "next/server";
import { cutoutProductImage } from "@/lib/removeBackground";

// Runs the (native, relatively heavy) background-removal pipeline on a
// photo ONCE, separately from saving any particular product. The Add
// Item page calls this exactly once per Snap photo — including for a
// multi-item shelf photo that will become several products — and reuses
// the result for every item's save, instead of app/api/products/route.ts
// re-running this same pipeline on the identical bytes once per item.
// That redundant repeat invocation was crashing the server outright
// (segfaults in the native ONNX/sharp libraries under back-to-back
// calls), not just wasting time.
//
// Best-effort: cutoutProductImage can fail for an unusual image or a
// transient model issue, and this endpoint still returns 200 with the
// original (unprocessed) bytes in that case — the caller always gets
// something usable back, same "never block saving over this" policy
// lib/storage.ts's uploadProductImage already had.
export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "Provide imageBase64" }, { status: 400 });
  }

  try {
    const original = Buffer.from(imageBase64, "base64");
    const cutout = await cutoutProductImage(original);
    return NextResponse.json({ imageBase64: cutout.toString("base64"), cutout: true });
  } catch (err) {
    console.error("prepare-image cutout failed, returning original photo", err);
    return NextResponse.json({ imageBase64, cutout: false });
  }
}
