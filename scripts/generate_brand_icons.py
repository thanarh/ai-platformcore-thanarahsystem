from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/thanarah-icon.png"
PUBLIC = ROOT / "apps/web/public"
APP = ROOT / "apps/web/src/app"

image = Image.open(SOURCE).convert("RGBA")
side = max(image.size)
square = Image.new("RGBA", (side, side), (255, 255, 255, 0))
square.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))

resampling = Image.Resampling.LANCZOS
icon_512 = square.resize((512, 512), resampling)
icon_512.save(APP / "icon.png", optimize=True)
icon_512.save(PUBLIC / "icon-512.png", optimize=True)

apple = square.resize((180, 180), resampling)
apple.save(APP / "apple-icon.png", optimize=True)
apple.save(PUBLIC / "apple-touch-icon.png", optimize=True)

for size in (16, 32, 48, 192):
    square.resize((size, size), resampling).save(PUBLIC / f"favicon-{size}x{size}.png", optimize=True)

square.save(
    PUBLIC / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
)

print("Generated favicon, app icon, and Apple touch icon assets.")
