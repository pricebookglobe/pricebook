# Regenerates every Android splash asset (both the Android 12+
# SplashScreen API icon and Capacitor's full-screen splash.png images)
# from the single app/icon.png master, so there's one source of truth
# instead of density-by-density hand edits. Run from anywhere — paths are
# resolved relative to this file, not the working directory:
#
#   pip install pillow
#   python3 mobile/scripts/generate_splash_assets.py
#
# Re-run this whenever app/icon.png changes, then rebuild the Android app.
#
# NOTE on sharpening: an earlier version of this script ran the source
# through ImageFilter.UnsharpMask before resizing, meaning to crisp it up.
# The master PNG already has soft, anti-aliased edges with faint
# compression artifacts baked in (not clean vector edges), and unsharp
# masking amplified those into a visible dotted/haloed ring around the
# whole shield — it made every exported size look noisier, not clearer.
# Plain high-quality (LANCZOS) resampling straight from the trimmed master,
# with no sharpening pass, is the cleanest result this source supports.
from PIL import Image, ImageDraw, ImageFont
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
RES = f"{ROOT}/mobile/android/app/src/main/res"
LIGHT_GREEN = (220, 238, 227)  # #DCEEE3 - tailwind value-soft
INK = (0, 51, 62)  # #00333E - tailwind ink, used for the credit line text

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CREDIT_TEXT = "Product from the Institute of AI"

def draw_credit(canvas, w, h):
    # Plain text near the bottom of the splash — this screen is a static
    # native image shown before the app's own JS has even loaded, so it
    # can't be a tappable link the way the in-app credit is; it's here
    # purely so the Institute of AI is credited from the very first frame.
    draw = ImageDraw.Draw(canvas)
    font_size = max(10, round(min(w, h) * 0.032))
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), CREDIT_TEXT, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (w - text_w) / 2 - bbox[0]
    y = h - text_h - round(h * 0.06) - bbox[1]
    draw.text((x, y), CREDIT_TEXT, font=font, fill=INK)

def load_icon():
    im = Image.open(f"{ROOT}/app/icon.png").convert("RGBA")
    # Trim to the actual shield's bounding box (source has some transparent
    # margin) so later scaling is based on real content, not empty padding.
    return im.crop(im.getbbox())

def fit_icon(icon, box_size, fraction):
    target = int(box_size * fraction)
    w, h = icon.size
    scale = target / max(w, h)
    new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return icon.resize(new_size, Image.LANCZOS)

icon = load_icon()
print("source trimmed icon size:", icon.size)

# --- Android 12+ SplashScreen API icon (windowSplashScreenAnimatedIcon) ---
# Drawn inside a system-provided circular/rounded container, so it needs a
# safe-zone margin (~66% of the canvas) or the system can clip its edges —
# the old versions filled almost the whole square, which is what was
# cropping/garbling the shield's outline on some devices.
icon_sizes = {
    "drawable-mdpi/splash_icon.png": 192,
    "drawable-hdpi/splash_icon.png": 288,
    "drawable-xhdpi/splash_icon.png": 384,
    "drawable-xxhdpi/splash_icon.png": 576,
    "drawable-xxxhdpi/splash_icon.png": 768,
}
for rel, size in icon_sizes.items():
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fitted = fit_icon(icon, size, 0.62)
    pos = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    canvas.paste(fitted, pos, fitted)
    path = f"{RES}/{rel}"
    canvas.save(path)
    print("wrote", path, canvas.size)

# --- Capacitor JS splash (splash.png) — light green background, no card ---
splash_sizes = {
    "drawable/splash.png": (480, 320),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
}
for rel, (w, h) in splash_sizes.items():
    canvas = Image.new("RGB", (w, h), LIGHT_GREEN)
    fitted = fit_icon(icon, min(w, h), 0.46)
    pos = ((w - fitted.width) // 2, (h - fitted.height) // 2)
    canvas.paste(fitted, pos, fitted)
    draw_credit(canvas, w, h)
    path = f"{RES}/{rel}"
    canvas.save(path, quality=95)
    print("wrote", path, canvas.size)

print("done")
