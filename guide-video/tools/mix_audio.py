#!/usr/bin/env python3
"""Lay the narration clips on one track at the times the stage scheduled them.

Usage: python3 tools/mix_audio.py build/timeline.json build/narration.wav
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent


def main(timeline_path, out_path):
    info = json.loads(Path(timeline_path).read_text())
    sr = None
    clips = []
    for cue in info["cues"]:
        data, rate = sf.read(ROOT / "build" / "narration" / f"{cue['id']}.wav", dtype="float32")
        sr = sr or rate
        assert rate == sr, "all clips must share one sample rate"
        clips.append((cue["t"], data))
    track = np.zeros(int((info["duration"] + 1) * sr), dtype=np.float32)
    for t, data in clips:
        start = int(round(t * sr))
        end = min(len(track), start + len(data))
        track[start:end] += data[: end - start]
    peak = float(np.max(np.abs(track))) or 1.0
    track *= 0.89 / peak
    sf.write(out_path, track, sr)
    print(f"narration track: {len(track) / sr:.1f}s, {len(clips)} clips")


if __name__ == "__main__":
    main(*sys.argv[1:3])
