#!/usr/bin/env python3
"""Mobile-size one GOAT image and write a sidecar JSON next to it.

Rule (confirmed): if the long edge is over 1200 px or the file is over 500 KB,
resize to 1080 px wide and save as JPEG at quality 80. Otherwise keep the
original file unchanged.

Usage:
  python3 scripts/ingest-image.py <input> <output> <sidecar.json> <r2_key> [--source-url URL]
"""
import argparse
import datetime as dt
import json
import os
import shutil

from PIL import Image, ImageOps

MAX_EDGE = 1200
MAX_BYTES = 500_000
TARGET_WIDTH = 1080
QUALITY = 80
RULE = "long edge over 1200 px or file over 500 KB -> 1080 px wide JPEG, quality 80"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("sidecar")
    p.add_argument("key")
    p.add_argument("--source-url", default=None)
    a = p.parse_args()

    src_bytes = os.path.getsize(a.input)

    with Image.open(a.input) as probe:
        im = ImageOps.exif_transpose(probe)
        w, h = im.size
        triggered = max(w, h) > MAX_EDGE or src_bytes > MAX_BYTES

        if not triggered:
            shutil.copyfile(a.input, a.output)
        else:
            if im.mode in ("RGBA", "LA", "P"):
                rgba = im.convert("RGBA")
                flat = Image.new("RGB", rgba.size, (255, 255, 255))
                flat.paste(rgba, mask=rgba.split()[-1])
                im = flat
            else:
                im = im.convert("RGB")
            new_w = min(TARGET_WIDTH, w)
            new_h = round(h * new_w / w)
            im = im.resize((new_w, new_h), Image.LANCZOS)
            im.save(a.output, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    with Image.open(a.output) as out:
        out_w, out_h = out.size

    sidecar = {
        "key": a.key,
        "source_url": a.source_url,
        "original_width": w,
        "original_height": h,
        "original_bytes": src_bytes,
        "width": out_w,
        "height": out_h,
        "bytes": os.path.getsize(a.output),
        "resized": triggered,
        "rule": RULE,
        "ingested_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    with open(a.sidecar, "w") as f:
        json.dump(sidecar, f, indent=2)
        f.write("\n")

    print(json.dumps({k: sidecar[k] for k in ("key", "resized", "width", "height", "bytes")}))


if __name__ == "__main__":
    main()
