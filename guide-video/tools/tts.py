#!/usr/bin/env python3
"""Generate the voice-over, one clip per narration line, with Kokoro TTS.

Usage: python3 tools/tts.py --models /path/to/kokoro-models [--voice af_heart] [--speed 1.0]

The models folder must contain kokoro-v1.0.onnx and voices-v1.0.bin from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Writes build/narration/<id>.wav and build/narration/durations.json.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent


def trim(samples, sr, threshold=0.004, pad=0.06):
    loud = np.where(np.abs(samples) > threshold)[0]
    if loud.size == 0:
        return samples
    start = max(0, loud[0] - int(pad * sr))
    end = min(len(samples), loud[-1] + int(pad * sr))
    return samples[start:end]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--only", nargs="*", help="regenerate only these line ids")
    args = ap.parse_args()

    models = Path(args.models)
    kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    lines = json.loads((ROOT / "narration" / "lines.json").read_text())
    out = ROOT / "build" / "narration"
    out.mkdir(parents=True, exist_ok=True)
    durations_path = out / "durations.json"
    durations = json.loads(durations_path.read_text()) if durations_path.exists() else {}

    for line in lines:
        if args.only and line["id"] not in args.only:
            continue
        samples, sr = kokoro.create(line.get("say", line["text"]), voice=args.voice, speed=args.speed, lang="en-us")
        samples = trim(np.asarray(samples, dtype=np.float32), sr)
        sf.write(out / f"{line['id']}.wav", samples, sr)
        durations[line["id"]] = round(len(samples) / sr, 3)
        print(f"{line['id']:16s} {durations[line['id']]:6.2f}s")

    durations_path.write_text(json.dumps(durations, indent=2))
    print(f"total {sum(durations.values()):.1f}s")


if __name__ == "__main__":
    main()
