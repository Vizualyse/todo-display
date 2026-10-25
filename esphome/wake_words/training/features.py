"""Augment the TTS clips and save microWakeWord spectrogram features (notebook cell 5-7)."""
import os
import sys

from mmap_ninja.ragged import RaggedMmap

from microwakeword.audio.augmentation import Augmentation
from microwakeword.audio.clips import Clips
from microwakeword.audio.spectrograms import SpectrogramGeneration

os.chdir("/work")

augmenter = Augmentation(
    augmentation_duration_s=3.2,
    augmentation_probabilities={
        "SevenBandParametricEQ": 0.1,
        "TanhDistortion": 0.1,
        "PitchShift": 0.1,
        "BandStopFilter": 0.1,
        "AddColorNoise": 0.1,
        "AddBackgroundNoise": 0.75,
        "Gain": 1.0,
        "RIR": 0.5,
    },
    impulse_paths=["mit_rirs"],
    background_paths=["fma_16k", "audioset_16k"],
    background_min_snr_db=-5,
    background_max_snr_db=10,
    min_jitter_s=0.195,
    max_jitter_s=0.205,
)


def build(src, out, train_repeat):
    if os.path.exists(os.path.join(out, "done")):
        return
    clips = Clips(input_directory=src, file_pattern="**/*.wav", max_clip_duration_s=None,
                  remove_silence=False, random_split_seed=10, split_count=0.1)
    for split, name, repeat, slide in (("training", "train", train_repeat, 10),
                                       ("validation", "validation", 1, 10),
                                       ("testing", "test", 1, 1)):
        d = os.path.join(out, split)
        os.makedirs(d, exist_ok=True)
        spec = SpectrogramGeneration(clips=clips, augmenter=augmenter, slide_frames=slide, step_ms=10)
        RaggedMmap.from_generator(out_dir=os.path.join(d, "wakeword_mmap"),
                                  sample_generator=spec.spectrogram_generator(split=name, repeat=repeat),
                                  batch_size=100, verbose=True)
        print(out, split, "done", flush=True)
    open(os.path.join(out, "done"), "w").close()


# features.py <samples dir> <features dir> <training repeats>
build(sys.argv[1], sys.argv[2], int(sys.argv[3]))
print("== features", sys.argv[2], "done")
