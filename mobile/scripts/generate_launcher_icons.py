# Regenerates every Android launcher icon asset from the single
# app/icon.png master, so there's one source of truth instead of
# density-by-density hand edits (mirrors generate_splash_assets.py's
# trim-to-bbox + fit-with-fraction pattern).
#
#   pip install pillow
#   python3 mobile/scripts/generate_launcher_icons.py
#
# Re-run this whenever app/icon.png changes, then rebuild the Android app.
#
# Writes, per density:
#   - ic_launcher_foreground.png: transparent background, icon fit into the
#     adaptive-icon safe zone (icons only fill ~66% of the full canvas,
#     since the OS can mask/crop the outer edge into a circle, squircle,
#     etc. depending on the launcher)
#   - ic_launcher.png / ic_launcher_round.png: legacy flat icons for
#     launchers that don't support adaptive icons, same content baked onto
#     the solid ic_launcher_background color (#F6F5F1), full square vs.
#     circle-masked
from PIL import Image, ImageDraw
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
RES = f"{ROOT}/mobile/android/app/src/main/res"
BACKGROUND = (246, 245, 241)  # #F6F5F1 - ic_launcher_background / tailwind field

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def load_icon():
    im = Image.open(f"{ROOT}/app/icon.png").convert("RGBA")
    return im.crop(im.getbbox())


def fit_icon(icon, box_size, fraction):
    target = int(box_size * fraction)
    w, h = icon.size
    scale = target / max(w, h)
    new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return icon.resize(new_size, Image.LANCZOS)


def circle_mask(size):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


icon = load_icon()

for folder, size in SIZES.items():
    out_dir = f"{RES}/{folder}"
    os.makedirs(out_dir, exist_ok=True)

    # Adaptive-icon foreground: transparent canvas, icon in the safe zone.
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fitted_fg = fit_icon(icon, size, 0.66)
    pos_fg = ((size - fitted_fg.width) // 2, (size - fitted_fg.height) // 2)
    fg.paste(fitted_fg, pos_fg, fitted_fg)
    fg.save(f"{out_dir}/ic_launcher_foreground.png")

    # Legacy flat square icon on the solid background.
    flat = Image.new("RGBA", (size, size), BACKGROUND + (255,))
    fitted_flat = fit_icon(icon, size, 0.72)
    pos_flat = ((size - fitted_flat.width) // 2, (size - fitted_flat.height) // 2)
    flat.paste(fitted_flat, pos_flat, fitted_flat)
    flat.save(f"{out_dir}/ic_launcher.png")

    # Legacy round icon: same content, circle-masked.
    round_icon = flat.copy()
    round_icon.putalpha(circle_mask(size))
    round_icon.save(f"{out_dir}/ic_launcher_round.png")

    print("wrote", out_dir)

print("done")
