# Regenerates the header/watermark logo PNGs (public/pricebook-icon-dark.png,
# public/pricebook-icon-transparent.png) from the single app/icon.png
# master, so there's one source of truth instead of hand-exported crops.
#
# Both existing files had been squashed onto a fixed 300x164 canvas at some
# point — the master shield is naturally tall (~0.83 width/height), not
# wide, so forcing it into a short wide box visibly distorted the shield's
# proportions on top of being low-resolution/soft. This re-trims the
# master to its real content box and exports both files at that same
# native aspect ratio, at a resolution that stays sharp at every size
# they're actually displayed at (a ~40px-tall header logo up to a
# ~480px-wide background watermark).
#
# No sharpening filter: the master PNG has soft anti-aliased edges with
# faint compression artifacts already baked in, and running an unsharp
# mask over that amplifies those into a visible dotted/haloed ring around
# the shield instead of actually crisping it up. Plain high-quality
# (LANCZOS) resampling from the trimmed master is the cleanest result this
# source supports.
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

# Exported tall enough (900px) to stay sharp even at the largest on-screen
# use (the ~480px background watermark).
TARGET_HEIGHT = 900
scale = TARGET_HEIGHT / icon.height
target_size = (round(icon.width * scale), TARGET_HEIGHT)
final = icon.resize(target_size, Image.LANCZOS)
print("exported size:", final.size)

for name in ["pricebook-icon-dark.png", "pricebook-icon-transparent.png"]:
    path = f"{ROOT}/public/{name}"
    final.save(path)
    print("wrote", path)
