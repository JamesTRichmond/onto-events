"""Render the Shelf A mark, scaled up to fill the icon (James, 2026-09-29).

Run from the repo root with cairosvg and Inter Medium installed:
  python3 scripts/brand/render-mark.py
Writes to scripts/brand/out/; copy the files into assets/images and
assets/brand by hand after a look. Supersedes generate-brand-assets.mjs,
which still draws the retired ring mark.
"""
import io
import os

import cairosvg
from PIL import Image

NAVY = '#0B1020'
TERRA = '#E15A2D'
WHITE = '#FFFFFF'
OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

# The locked geometry, unchanged, as measured from logo-onto-navy-square.png.
# Its bounding box (head tops to type baseline) is x 394-629, y 327-602.
CX, CY = 511.5, 464.5


def mark(scale, left=WHITE, right=TERRA, ground=WHITE, word_last=TERRA):
    return f'''
  <g transform="translate(512,512) scale({scale}) translate({-CX},{-CY})">
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="{left}" stroke-width="7">
        <circle cx="483" cy="355" r="28" fill="{left}" stroke="none"/>
        <line x1="483" y1="383" x2="483" y2="470"/>
        <line x1="483" y1="408" x2="461" y2="432"/>
        <line x1="483" y1="408" x2="505" y2="432"/>
        <line x1="483" y1="470" x2="463.5" y2="511"/>
        <line x1="483" y1="470" x2="502.5" y2="511"/>
      </g>
      <g stroke="{right}" stroke-width="7">
        <circle cx="540" cy="355" r="28" fill="{right}" stroke="none"/>
        <line x1="540" y1="383" x2="540" y2="470"/>
        <line x1="540" y1="408" x2="518" y2="432"/>
        <line x1="540" y1="408" x2="562" y2="432"/>
        <line x1="540" y1="470" x2="520.5" y2="511"/>
        <line x1="540" y1="470" x2="559.5" y2="511"/>
      </g>
      <line x1="394" y1="512.5" x2="629" y2="512.5" stroke="{ground}" stroke-width="4" stroke-linecap="butt"/>
    </g>
    <!-- Two runs placed by measured Inter Medium advances (onto = 102.7 at
         48px): renderers disagree on text-anchor across tspans. -->
    <text x="460.6" y="602" font-family="Inter, 'SF Pro Text', 'SF Pro', system-ui, sans-serif"
          font-weight="500" font-size="48" fill="{left}">ont</text>
    <text x="534.8" y="602" font-family="Inter, 'SF Pro Text', 'SF Pro', system-ui, sans-serif"
          font-weight="500" font-size="48" fill="{word_last}">o</text>
  </g>'''


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
            f'width="1024" height="1024">{body}</svg>')


# The composition fills ~78% of the icon's height: Apple's icon grid keeps
# artwork inside its outer keyline circle, not in the middle quarter.
ICON_SCALE = 2.9
# Android adaptive foreground must stay inside the central 66% safe zone.
ANDROID_SCALE = 2.2
# The badge (splash, favicon, in-app header mark) has rounded corners to clear.
BADGE_SCALE = 2.75

jobs = {
    'icon.png': (svg(f'<rect width="1024" height="1024" fill="{NAVY}"/>{mark(ICON_SCALE)}'), 1024, True),
    'android-icon-foreground.png': (svg(mark(ANDROID_SCALE)), 1024, False),
    'android-icon-monochrome.png': (svg(mark(ANDROID_SCALE, WHITE, WHITE, WHITE, WHITE)), 1024, False),
    'splash-icon.png': (svg(f'<rect width="1024" height="1024" rx="232" fill="{NAVY}"/>{mark(BADGE_SCALE)}'), 512, False),
    'favicon.png': (svg(f'<rect width="1024" height="1024" rx="232" fill="{NAVY}"/>{mark(BADGE_SCALE)}'), 64, False),
}

for name, (source, size, opaque) in jobs.items():
    png = cairosvg.svg2png(bytestring=source.encode(), output_width=size, output_height=size)
    im = Image.open(io.BytesIO(png))
    # The App Store icon must carry no alpha channel.
    im = im.convert('RGB' if opaque else 'RGBA')
    im.save(os.path.join(OUT, name), optimize=True)
    print(name, im.size, im.mode)

with open(os.path.join(OUT, 'onto-mark.svg'), 'w') as f:
    f.write(svg(f'<rect width="1024" height="1024" fill="{NAVY}"/>{mark(ICON_SCALE)}'))
