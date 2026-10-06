import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

// Every product photo gets normalized onto a square canvas of this size —
// transparent, with the item itself centered and scaled to the same
// relative size regardless of how close/far the original photo was. That
// consistency is the whole point: a shopper scanning a grid of product
// thumbnails sees items that all "sit" the same way, not a mix of
// tightly-cropped and loosely-cropped squares.
const CANVAS_SIZE = 800;
// Leaves an even margin around the item instead of letting it touch the
// canvas edges — 85% of the canvas is the item's own bounding box.
const ITEM_FRACTION = 0.85;

// Cuts the product out of its background and places it on a fixed-size
// transparent canvas, centered and consistently scaled. Used once, at
// product-registration time (see lib/storage.ts's uploadProductImage) —
// not on every page view — so this cost is paid once per product, not
// once per shopper who looks at it.
//
// Runs @imgly/background-removal-node's "small" ONNX model (not the
// default "medium") specifically to keep the download/footprint and
// per-image processing time down on a general-purpose server — this
// trades a little edge-quality for materially faster, lighter requests.
// Throws on failure (an unrecognizable image, a transient model-fetch
// problem) rather than silently returning something broken; the caller
// falls back to uploading the plain, uncut photo instead.
export async function cutoutProductImage(original: Buffer): Promise<Buffer> {
  const cutoutBlob = await removeBackground(original, {
    model: "small",
    output: { format: "image/png", quality: 0.8 }
  });
  const cutout = Buffer.from(await cutoutBlob.arrayBuffer());

  // Crops away the fully-transparent margin background-removal leaves
  // around the item, so the item's own bounding box is what gets scaled
  // to fit the canvas next — without this, a product shot with lots of
  // empty space around it would end up tiny on the final canvas instead
  // of filling its share of it like every other item.
  const trimmed = await sharp(cutout).trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const w = width || CANVAS_SIZE;
  const h = height || CANVAS_SIZE;

  const scale = Math.min((CANVAS_SIZE * ITEM_FRACTION) / w, (CANVAS_SIZE * ITEM_FRACTION) / h);
  const resized = await sharp(trimmed)
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
    .toBuffer();

  return sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}
