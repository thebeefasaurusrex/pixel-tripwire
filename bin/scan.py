"""Screen a sequence of screenshots for three simple, deterministic visual faults."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from statistics import pstdev
import sys

from PIL import Image, ImageDraw


def inspect(paths, flat_cutoff, magenta_cutoff):
    previous = None
    for path in paths:
        with Image.open(path) as source:
            image = source.convert("RGB")
        digest = (image.size, sha256(image.tobytes()).hexdigest())
        sample = image.resize((min(160, image.width), min(160, image.height)), Image.Resampling.NEAREST)
        pixels = list(sample.getdata())
        spread = pstdev(sample.convert("L").getdata())
        magenta = sum(r > 210 and g < 60 and b > 210 for r, g, b in pixels) / len(pixels)
        flags = []
        if spread < flat_cutoff:
            flags.append("flat")
        if magenta > magenta_cutoff:
            flags.append("magenta")
        if digest == previous:
            flags.append("frozen")
        yield {"file": path.name, "flags": flags, "gray_spread": round(spread, 4), "magenta_ratio": round(magenta, 6)}
        previous = digest


def demo(folder):
    folder.mkdir(parents=True, exist_ok=True)
    normal = Image.new("RGB", (160, 90), "#182845")
    draw = ImageDraw.Draw(normal)
    draw.rectangle((20, 20, 115, 74), fill="#6db7a1")
    draw.rectangle((60, 40, 145, 80), fill="#e4b963")
    for name in ("01-normal", "02-repeat"):
        normal.save(folder / (name + ".png"))
    Image.new("RGB", (160, 90)).save(folder / "03-black.png")
    fault = normal.copy()
    ImageDraw.Draw(fault).rectangle((20, 20, 100, 70), fill="#ff00ff")
    fault.save(folder / "04-magenta.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path, help="Directory of PNG frames in filename order")
    parser.add_argument("--demo", action="store_true", help="Create and scan four synthetic frames in a new directory")
    parser.add_argument("--flat-cutoff", type=float, default=2.0)
    parser.add_argument("--magenta-cutoff", type=float, default=0.001)
    parser.add_argument("--fail-on-flag", action="store_true", help="Exit 1 when any frame trips a check")
    args = parser.parse_args()
    if not 0 <= args.flat_cutoff <= 255 or not 0 <= args.magenta_cutoff <= 1:
        parser.error("cutoffs must be in 0–255 and 0–1 respectively")
    if args.demo:
        if args.frames.exists():
            parser.error("--demo requires a new directory")
        demo(args.frames)
    paths = sorted(path for path in args.frames.glob("*.png") if path.is_file())
    if not paths:
        parser.error("no PNG frames found")
    flagged = False
    try:
        for result in inspect(paths, args.flat_cutoff, args.magenta_cutoff):
            flagged |= bool(result["flags"])
            print(json.dumps(result, ensure_ascii=True))
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(f"Could not inspect a frame: {error}", file=sys.stderr)
        return 2
    return int(flagged and args.fail_on_flag)


if __name__ == "__main__":
    raise SystemExit(main())
