# Regenerates the header/watermark logo PNGs (public/pricebook-icon-dark.png,
# public/pricebook-icon-transparent.png) from the single app/icon.png
# master, so there's one source of truth instead of hand-exported crops.
#
# Both existing files had been squashed onto a fixed 300x164 canvas at some
# point — the master shield is naturally tall (~0.83 width/height), not
# wide, so forcing it into a short wide box visibly distorted the shield's
# proportions on top of being low-resolution/soft. This re-trims the
# master to its real content box and exports both files at their real
# aspect ratio instead.
#
# The master itself (app/icon.png) is only 512x512 — its trimmed shield is
# ~396x477 — so there's a hard resolution ceiling here: upscaling it adds
# no real detail, just softness, and running an unsharp mask on top of
# that (tried previously) amplifies the source's own soft anti-aliased
# edges into a visible dotted/haloed ring instead of actually crisping it
# up. Plain high-quality (LANCZOS) resampling from the trimmed master is
# the cleanest result this source supports.
#
# The two files are sized differently for exactly that reason:
#  - pricebook-icon-dark.png is only ever shown small (a ~40-56px-tall
#    header logo) — exported at native resolution (no upscale at all), so
#    it keeps every real pixel the master has to give at that size instead
#    of blurring from an unnecessary upscale.
#  - pricebook-icon-transparent.png is the big background watermark (up to
#    ~480px wide) — exported larger so it still has enough pixels for a
#    sharp screen, at the cost of some unavoidable softness from
#    upscaling, which its low opacity (~0.08) hides anyway.
#
#   pip install pillow
#   python3 scripts/generate_logo_assets.py
#
# Re-run this whenever app/icon.png changes.
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

im = Image.open(f"{ROOT}/app/icon.png").convert("RGBA")
icon = im.crop(im.getbbox())
print("trimmed source size:", icon.size)

# The master's edges are anti-aliased with a few pixels of PARTIAL alpha
# (not fully opaque, not fully transparent) — normal for any soft-edged
# PNG. On a light page background that fringe is invisible, but on the
# app's very dark "ink" sidebar it alpha-blends into a soft, slightly
# lighter-blue halo traced around the whole shield (worse once the browser
# downscales the image to its small on-screen size, which further softens
# that fringe) — that's the "logo looks hazy/glowing" complaint. Squaring
# off the alpha channel (fully transparent below the threshold, fully
# opaque at/above it) removes the partial-alpha pixels that halo comes
# from, on every background, at the cost of a slightly harder edge that
# isn't visible at this icon's actual on-screen sizes.
px = icon.load()
w, h = icon.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        px[x, y] = (r, g, b, 0 if a < 160 else 255)


def export(name, target_height):
    if target_height == icon.height:
        # Exactly native resolution — nothing to resample.
        final = icon
    else:
        scale = target_height / icon.height
        target_size = (round(icon.width * scale), target_height)
        final = icon.resize(target_size, Image.LANCZOS)
    path = f"{ROOT}/public/{name}"
    final.save(path)
    print("wrote", path, final.size)


# Small header logo: native resolution, no upscaling.
export("pricebook-icon-dark.png", icon.height)
# Large background watermark: upscaled just enough to stay sharp at its
# largest on-screen size, with the softness masked by low opacity.
export("pricebook-icon-transparent.png", 900)
