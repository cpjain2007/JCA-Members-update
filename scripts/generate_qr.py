"""Generate a QR code PNG that points to the hosted JCA Members web app.

Usage:
    python scripts/generate_qr.py
    python scripts/generate_qr.py --url https://example.com --output custom.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont


DEFAULT_URL = "https://jca-member-portal-9f2k.web.app"
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "JCA_Members_QR.png"


def generate_qr(url: str, output: Path, caption: str | None = None) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    if caption:
        pad_top = 40
        pad_bottom = 60
        new_w = img.width
        new_h = img.height + pad_top + pad_bottom
        canvas = Image.new("RGB", (new_w, new_h), "white")
        canvas.paste(img, (0, pad_top))
        draw = ImageDraw.Draw(canvas)

        try:
            title_font = ImageFont.truetype("arial.ttf", 28)
            url_font = ImageFont.truetype("arial.ttf", 18)
        except OSError:
            title_font = ImageFont.load_default()
            url_font = ImageFont.load_default()

        title_w = draw.textlength(caption, font=title_font)
        draw.text(((new_w - title_w) / 2, 6), caption, fill="black", font=title_font)

        url_w = draw.textlength(url, font=url_font)
        draw.text(
            ((new_w - url_w) / 2, pad_top + img.height + 12),
            url,
            fill="black",
            font=url_font,
        )
        canvas.save(output)
    else:
        img.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a QR code for the web app.")
    parser.add_argument("--url", default=DEFAULT_URL, help="URL to encode in the QR code.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output PNG path.",
    )
    parser.add_argument(
        "--caption",
        default="JCA Members Update",
        help="Title text rendered above the QR code. Use empty string to disable.",
    )
    args = parser.parse_args()

    caption = args.caption if args.caption else None
    generate_qr(args.url, args.output, caption=caption)
    print(f"QR code saved to: {args.output}")
    print(f"Encoded URL:      {args.url}")


if __name__ == "__main__":
    main()
