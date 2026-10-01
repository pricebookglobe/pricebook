# One-time retouch of the app/icon.png master: flattens a bright
# navy-blue bevel/highlight that was painted into the shield's outline at
# FULL OPACITY as part of the original artwork — not a transparency or
# export artifact. It was invisible on a light page but read as a glow
# around the shield once the logo was shown small against the app's dark
# "ink" sidebar. Confirmed by sampling the raw pixels: the edge of the
# shield's outline was a fully-opaque rgb(52,82,121)-ish highlight, while
# the shield's own fill settles to a darker rgb(28,58,93)-ish navy a few
# pixels further in — a deliberate bevel stroke, not noise.
#
# This clamps every opaque "navy-family" pixel (blue channel the largest
# of the three, i.e. part of the shield's navy linework) to no brighter
# than the base fill color plus a small tolerance for natural shading —
# it never touches the white interior, the green "B", or the cart icon,
# which aren't navy-family colors.
#
# This has already been run once and app/icon.png committed with the
# result — this script is kept for anyone who needs to redo it against a
# fresh master, not meant to be re-run against the already-retouched file
# (running it again is harmless/a no-op, since everything is already at
# or below the clamp).
#
#   pip install pillow
#   python3 scripts/retouch_icon_bevel.py
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

BASE_NAVY = (28, 58, 93)  # the shield's own deep-interior fill color
TOLERANCE = 6  # allow a little natural shading above base before clamping

path = f"{ROOT}/app/icon.png"
im = Image.open(path).convert("RGBA")
w, h = im.size
px = im.load()

changed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        is_navy_family = b > g >= r and b > 55 and r < 160
        if not is_navy_family:
            continue
        nr, ng, nb = min(r, BASE_NAVY[0] + TOLERANCE), min(g, BASE_NAVY[1] + TOLERANCE), min(b, BASE_NAVY[2] + TOLERANCE)
        if (nr, ng, nb) != (r, g, b):
            changed += 1
            px[x, y] = (nr, ng, nb, a)

im.save(path)
print(f"retouched {changed} pixels, wrote {path}")
