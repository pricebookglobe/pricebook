import { createServiceSupabase } from "./supabaseClient";
import { cutoutProductImage } from "./removeBackground";

// TEMPORARILY DISABLED: the native cutout pipeline (@imgly/background-
// removal-node's ONNX runtime, invoked via lib/removeBackground.ts) is
// segfaulting the whole Node process on THIS production host — confirmed
// in Render logs crashing at the exact moment of every recent Add Item
// photo save, single-item or batch, immediately on its first real call
// after a fresh deploy. A segfault kills the process outright; it can't
// be caught by the try/catch below the way an ordinary thrown error can,
// so every photo save was failing (and taking the whole server down with
// it, dropping whoever else was using the app at that moment) until this
// step stopped running entirely. Product photos upload as the plain
// original photo for now — worse-looking (no transparent cutout/
// centering) but working, which matters more right now. Re-enable once
// this native dependency/host incompatibility is actually fixed, ideally
// verified outside of production first.
const BACKGROUND_REMOVAL_ENABLED = false;

/**
 * Uploads a base64 image to the public product-images bucket, returns its
 * public URL. Every photo is run through background removal first — the
 * item alone, transparent background, centered on the same fixed-size
 * canvas every other product uses, so a grid of listing photos reads as
 * one consistent set instead of a mix of whatever backgrounds/framings the
 * original photos happened to have. Best-effort: if the cutout step fails
 * for any reason (an unusual image, a transient model-fetch issue), the
 * plain original photo is uploaded instead rather than losing the image —
 * same "never block saving the product over this" policy this function
 * already had.
 */
export async function uploadProductImage(
  imageBase64: string,
  productId: string,
  options?: {
    // Set when the caller already ran this exact photo through the
    // cutout pipeline once (see app/api/products/prepare-image/route.ts)
    // and is now saving several products from that same photo (a
    // multi-item Snap batch) — skips re-running it here. Re-running the
    // native ONNX/sharp pipeline back-to-back for every item in a batch
    // was not just wasteful, it was crashing the whole server process
    // (segfaults under repeated invocation — confirmed in production
    // logs during a 4-item batch save), so the Add Item page now runs
    // this heavy step ONCE per photo and passes the result through here
    // for every item instead of handing back the raw original each time.
    skipCutout?: boolean;
  }
): Promise<string | null> {
  try {
    const supabase = createServiceSupabase();
    const original = Buffer.from(imageBase64, "base64");

    let bytes: Buffer = original;
    let contentType = "image/jpeg";
    let ext = "jpg";
    if (options?.skipCutout) {
      contentType = "image/png";
      ext = "png";
    } else if (BACKGROUND_REMOVAL_ENABLED) {
      try {
        bytes = await cutoutProductImage(original);
        contentType = "image/png";
        ext = "png";
      } catch (err) {
        console.error("background removal failed, uploading original photo instead", err);
      }
    }
    // When BACKGROUND_REMOVAL_ENABLED is false, bytes/contentType/ext stay at
    // their original-photo defaults set above — the native cutout call is
    // never reached, so it can't crash the process.

    const path = `${productId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("product-images").upload(path, bytes, { contentType, upsert: true });

    if (error) {
      console.error("image upload failed", error);
      return null;
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("image upload error", err);
    return null; // non-fatal — the product still saves without a photo
  }
}
