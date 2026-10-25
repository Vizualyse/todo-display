"""Augmentation audio for microWakeWord: room impulse responses and background noise,
all as 16kHz mono int16 WAVs. Follows the notebook, but AudioSet is now parquet."""
import io
import os
import subprocess
from math import gcd
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf
from huggingface_hub import hf_hub_download, snapshot_download
from scipy.signal import resample_poly

W = Path("/work")


def write16k(data, sr, out):
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != 16000:
        g = gcd(sr, 16000)
        data = resample_poly(data, 16000 // g, sr // g)
    sf.write(out, np.clip(data, -1, 1), 16000, subtype="PCM_16")


def convert(src, out):
    try:
        data, sr = sf.read(src, dtype="float32", always_2d=False)
        write16k(data, sr, out)
        return True
    except Exception as e:  # a few clips in these sets are corrupt
        print("skip", getattr(src, "name", src), e)
        return False


def rirs():
    out = W / "mit_rirs"
    if out.exists():
        return
    d = snapshot_download("davidscripka/MIT_environmental_impulse_responses",
                          repo_type="dataset", allow_patterns="16khz/*",
                          local_dir=W / "dl/mit_rirs")
    out.mkdir()
    n = sum(convert(p, out / p.name) for p in Path(d, "16khz").glob("*.wav"))
    print("rirs", n)


def audioset():
    out = W / "audioset_16k"
    if out.exists():
        return
    f = hf_hub_download("agkphysics/AudioSet", "data/bal_train/09.parquet",
                        repo_type="dataset", local_dir=W / "dl/audioset")
    t = pq.read_table(f)
    print("audioset columns", t.schema)
    out.mkdir()
    n = 0
    for i, row in enumerate(t.column("audio").to_pylist()):
        n += convert(io.BytesIO(row["bytes"]), out / f"as_{i}.wav")
    print("audioset", n)


def fma():
    out = W / "fma_16k"
    if out.exists():
        return
    dl = W / "dl/fma"
    dl.mkdir(parents=True, exist_ok=True)
    z = dl / "fma_xs.zip"
    if not z.exists():
        subprocess.run(["wget", "-q", "-O", z, "https://huggingface.co/datasets/mchl914/fma_xsmall/resolve/main/fma_xs.zip"], check=True)
        subprocess.run(["unzip", "-q", "-o", z, "-d", dl], check=True)
    out.mkdir()
    n = sum(convert(p, out / (p.stem + ".wav")) for p in dl.glob("**/*.mp3"))
    print("fma", n)


if __name__ == "__main__":
    os.chdir(W)
    rirs()
    audioset()
    fma()
    print("== background done")
