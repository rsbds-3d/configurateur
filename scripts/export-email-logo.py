"""Export the original Illustrator PDF artwork without changing its geometry."""
import argparse
import hashlib
import json
from pathlib import Path

import fitz


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    document = fitz.open(str(args.source))
    page = document[0]
    artwork = page.artbox
    clip = fitz.Rect(artwork.x0 - 2, artwork.y0 - 2, artwork.x1 + 2, artwork.y1 + 2)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=clip, alpha=False)
    pixmap.save(str(args.output))
    info = {
        "source": str(args.source),
        "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "export": args.output.name,
        "exportSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "dimensions": [pixmap.width, pixmap.height],
        "method": "PDF-compatible Illustrator artwork, ArtBox + 2 pt, 4x raster, opaque white background",
        "geometryModified": False,
    }
    args.output.with_suffix(".source.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
