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
from PIL import Image, ImageFilter, ImageEnhance
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
RES = f"{ROOT}/mobile/android/app/src/main/res"
LIGHT_GREEN = (220, 238, 227)  # #DCEEE3 - tailwind value-soft

def load_sharp_icon():
    im = Image.open(f"{ROOT}/app/icon.png").convert("RGBA")
    # Trim to the actual shield's bounding box (source has some transparent
    # margin) so later scaling is based on real content, not empty padding.
    bbox = im.getbbox()
    im = im.crop(bbox)
    # Upscale 3x with high-quality resampling first, then sharpen, then the
    # per-target resize downsamples from this larger, sharpened version —
    # downsampling a sharpened-and-enlarged image anti-aliases cleaner than
    # sharpening at the final small size would.
    big = im.resize((im.width * 3, im.height * 3), Image.LANCZOS)
    sharpened = big.filter(ImageFilter.UnsharpMask(radius=3, percent=160, threshold=2))
    sharpened = ImageEnhance.Contrast(sharpened).enhance(1.08)
    return sharpened

def fit_icon(icon, box_size, fraction):
    target = int(box_size * fraction)
    w, h = icon.size
    scale = target / max(w, h)
    new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return icon.resize(new_size, Image.LANCZOS)

icon = load_sharp_icon()
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
    fitted = fit_icon(icon, min(w, h), 0.38)
    pos = ((w - fitted.width) // 2, (h - fitted.height) // 2)
    canvas.paste(fitted, pos, fitted)
    path = f"{RES}/{rel}"
    canvas.save(path, quality=95)
    print("wrote", path, canvas.size)

print("done")
