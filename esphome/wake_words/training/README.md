# Training a wake word

How `hey_ned.tflite` was made: [microWakeWord](https://github.com/kahrendt/microWakeWord)
trained only on synthetic Piper TTS clips, on a Linux box with an NVIDIA GPU (an RTX
3060 12GB here). The scripts follow the project's training notebook, updated for what
has changed since it was written (see `Learnings.md`). To make another word, copy
`gen_hey_ned.sh` and change the phrases and near-misses.

## Needs

- Docker with the NVIDIA runtime, ~40GB of disk for features and negatives, and
  **RAM to hold every feature set in page cache** (~37GB for Hey Ned). Short of that,
  training goes from ~1 hour to ~8.
- Free VRAM: stop anything else on the GPU (Ollama, Whisper) while it runs.

## Layout

`/work` holds scripts, venvs, voices and clips (it can be a network share); `/local`
holds the features and negatives that training reads at random, so keep it on local
disk.

```sh
docker run -d --name mww-train --gpus all \
  -v /path/to/work:/work -v /srv/wakeword:/local python:3.11-slim sleep infinity
docker exec mww-train sh -c 'apt-get update && apt-get install -y git wget unzip'
```

In `/work`:

```sh
git clone https://github.com/kahrendt/microWakeWord mww          # 4665173c
git clone https://github.com/rhasspy/piper-sample-generator     # 2971426a
git -C piper-sample-generator apply ../random-speakers.patch
```

Copy this folder's scripts into `/work`.

## Run

Inside the container (`docker exec -it mww-train sh`, `cd /work`):

1. `sh setup.sh`: two venvs (Piper and microWakeWord) and the voices: the LibriTTS-R
   generator (~900 US speakers) and 9 en_GB Piper voices (131 speakers, mostly VCTK).
2. `sh negatives.sh`: the prebuilt negative features (~25GB unzipped).
3. `venv-mww/bin/python prep_bg.py`: room impulse responses and background noise.
4. `PYTHONUNBUFFERED=1 sh pipeline.sh > pipeline.log 2>&1 &`: clips (~20 min), features
   (~10 min), then 30,000 training steps and a test of the quantised streaming model.

Once training starts, run `warm.sh` **on the host** (`nohup sh warm.sh &`). It finishes
by itself when training does.

## Install

The model ends up in
`/local/trained_models/hey_ned/tflite_stream_state_internal_quant/stream_state_internal_quant.tflite`.
Copy it next to `hey_ned.json`. The end of `logs/train_hey_ned.log` lists, for each
cutoff, the share of test clips missed (`frr`) and the false wakes per hour of
dinner-party audio (`faph`). Choose a `probability_cutoff` from that table.

Add the model to `micro_wake_word.models` in `crowpanel-todo.yaml`, flash, and then
**turn it on in Home Assistant**: the panel's device page has two "Wake word" selects,
and a model that isn't selected in either never fires.
