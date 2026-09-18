import { createServiceSupabase } from "./supabaseClient";

/** Uploads a base64 image to the public product-images bucket, returns its public URL. */
export async function uploadProductImage(imageBase64: string, productId: string): Promise<string | null> {
  try {
    const supabase = createServiceSupabase();
    const bytes = Buffer.from(imageBase64, "base64");
    const path = `${productId}-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });

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
