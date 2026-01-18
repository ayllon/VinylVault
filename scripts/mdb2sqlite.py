#!/usr/bin/env python3
import csv
import io
import re
import sys
import unicodedata
from argparse import ArgumentParser
from pathlib import Path
from typing import Optional

import tqdm
from PIL import Image

EXPECTED_KEYS = [
    "GRUPO",
    "TITULO",
    "FORMATO",
    "ANIO",
    "ESTILO",
    "PAIS",
    "CANCIONES",
    "CREDITOS",
    "OBSERV",
    "Portada CD",
    "Portada LP",
]


def sanitize_key(text: str) -> str:
    """Sanitize a string to be used as a filesystem-safe key.

    Converts to lowercase, removes diacritics, and replaces any non-alphanumeric
    characters with underscores.
    """
    # Normalize unicode (convert accented characters to their base characters)
    normalized = unicodedata.normalize("NFKD", text)
    # Remove diacritical marks
    without_diacritics = "".join(
        c for c in normalized if unicodedata.category(c) != "Mn"
    )
    # Convert to lowercase
    lower = without_diacritics.lower()
    # Replace any non-alphanumeric character with underscore
    sanitized = re.sub(r"[^a-z0-9]", "_", lower)
    # Remove leading/trailing underscores
    return sanitized.strip("_")


def extract_access_ole_image(ole_data: bytes) -> Image.Image:
    """Extracts a DIB image from an MDB OLE Blob"""
    # Find the DIB header (starts with 0x28000000 - BITMAPINFOHEADER size)
    # Look for the bitmap info header
    dib_start = ole_data.find(b"\x28\x00\x00\x00")

    if dib_start == -1:
        raise ValueError("Could not find DIB header")

    # Extract DIB data (everything from BITMAPINFOHEADER onward)
    dib_data = ole_data[dib_start:]

    # Create BMP file header (14 bytes)
    # BMP format needs: 'BM' + file_size + reserved(4 bytes) + offset_to_pixels
    file_size = len(dib_data) + 14
    pixel_offset = 14 + 40  # Header + BITMAPINFOHEADER (assuming no palette)

    # Check if there's a color palette (for <= 8 bit images)
    import struct

    bit_count = struct.unpack("<H", dib_data[14:16])[0]
    if bit_count <= 8:
        num_colors = struct.unpack("<I", dib_data[32:36])[0]
        if num_colors == 0:
            num_colors = 2**bit_count
        pixel_offset += num_colors * 4

    bmp_header = (
        b"BM"  # Signature
        + file_size.to_bytes(4, "little")  # File size
        + b"\x00\x00\x00\x00"  # Reserved
        + pixel_offset.to_bytes(4, "little")  # Offset to pixel data
    )

    # Combine header + DIB data
    full_bmp = bmp_header + dib_data

    return Image.open(io.BytesIO(full_bmp)).convert("RGB")


def maybe_extract(hex: str, cover_dir: Path, key: str, suffix: str) -> Optional[Path]:
    if not hex:
        return None
    data = bytes.fromhex(hex)
    nested = cover_dir / key[:2]
    nested.mkdir(exist_ok=True)
    cover_path = nested / (key + "_cd.jpeg")
    image = extract_access_ole_image(data)
    image.save(cover_path)
    return cover_path


def main():
    parser = ArgumentParser(
        description="Convert CSV extraced from MDB into a SQLite database, extracting images from OLE fields"
    )
    parser.add_argument("csv", metavar="CSV", type=Path, help="Input csv file")
    parser.add_argument(
        "sqlite", metavar="SQLITE", type=Path, help="Output sqlite file"
    )

    args = parser.parse_args()

    csv.field_size_limit(sys.maxsize)

    output_dir = args.sqlite.parent
    cover_dir = output_dir / "covers"

    print(f"Creating {cover_dir}")
    cover_dir.mkdir(exist_ok=True)

    # Get file size for progress estimation
    file_size = args.csv.stat().st_size
    print(f"CSV file has {file_size} bytes")

    # Process with progress bar based on file position
    with open(args.csv, "rt") as fd:
        reader = csv.DictReader(fd)
        progress = tqdm.tqdm(total=file_size)
        for row in reader:
            key = sanitize_key(row["TITULO"].strip('" '))

            _ = maybe_extract(row["Portada CD"], cover_dir, key, "cd")
            _ = maybe_extract(row["Portada LP"], cover_dir, key, "lp")

            progress.update(len(",".join(row.values())))
