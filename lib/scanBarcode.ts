// Shared by the merchant's Add Item screen and the customer's Check
// Price screen. A full-resolution phone camera photo is often 5-10+ MB —
// decoding a barcode from that directly via canvas-based JS processing
// can be slow or memory-heavy enough on a mid-range phone to feel like
// it's hung with no feedback. Downscaling first makes decoding both
// faster and lighter, and the timeout guarantees the person always sees
// some result instead of an indefinite "Reading barcode…".

const MAX_DIMENSION = 1600;
const TIMEOUT_MS = 12000;

async function downscaleImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", 0.85);
}

export class BarcodeTimeoutError extends Error {
  constructor() {
    super("Timed out reading the barcode.");
    this.name = "BarcodeTimeoutError";
  }
}

/** Decodes a barcode from a captured photo. Throws NotFoundException (no
 * readable barcode) or BarcodeTimeoutError (took too long) — both meant
 * to be caught and shown as a friendly retry message, not a raw error. */
export async function scanBarcodeFromFile(file: File): Promise<string> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const dataUrl = await downscaleImage(file);
  const reader = new BrowserMultiFormatReader();

  const decodePromise = reader.decodeFromImageUrl(dataUrl).then((result) => result.getText());
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new BarcodeTimeoutError()), TIMEOUT_MS);
  });

  return Promise.race([decodePromise, timeoutPromise]);
}
