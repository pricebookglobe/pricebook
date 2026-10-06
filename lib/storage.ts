import { createServiceSupabase } from "./supabaseClient";
import { cutoutProductImage } from "./removeBackground";

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
export async function uploadProductImage(imageBase64: string, productId: string): Promise<string | null> {
  try {
    const supabase = createServiceSupabase();
    const original = Buffer.from(imageBase64, "base64");

    let bytes: Buffer = original;
    let contentType = "image/jpeg";
    let ext = "jpg";
    try {
      bytes = await cutoutProductImage(original);
      contentType = "image/png";
      ext = "png";
    } catch (err) {
      console.error("background removal failed, uploading original photo instead", err);
    }

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
