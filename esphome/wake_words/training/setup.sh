#!/bin/sh
# Runs inside mww-train. Everything lives on /work (the NAS), which has no symlinks,
# so venvs are made with --copies and a real lib64 dir.
set -e
cd /work

mkvenv() {
  [ -x "$1/bin/python" ] && return
  mkdir -p "$1/lib64"
  python -m venv --copies "$1"
  "$1/bin/pip" install -q --upgrade pip
}

echo "== piper venv"
mkvenv venv-piper
# webrtcvad needs a compiler; webrtcvad-wheels is the same module prebuilt.
venv-piper/bin/pip install -q --no-deps -e ./piper-sample-generator
venv-piper/bin/pip install -q audiomentations==0.33.0 piper-tts==1.3.0 'numpy>=2,<3' torch torchaudio webrtcvad-wheels
mkdir -p voices
[ -s voices/en_US-libritts_r-medium.pt ] || wget -q -O voices/en_US-libritts_r-medium.pt \
  https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt
cp piper-sample-generator/models/en_US-libritts_r-medium.pt.json voices/
HF=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB
for v in alan/medium/en_GB-alan-medium alba/medium/en_GB-alba-medium \
         cori/medium/en_GB-cori-medium jenny_dioco/medium/en_GB-jenny_dioco-medium \
         northern_english_male/medium/en_GB-northern_english_male-medium \
         southern_english_female/low/en_GB-southern_english_female-low \
         aru/medium/en_GB-aru-medium vctk/medium/en_GB-vctk-medium \
         semaine/medium/en_GB-semaine-medium; do
  f=voices/$(basename $v)
  [ -s $f.onnx ] || wget -q -O $f.onnx "$HF/$v.onnx"
  [ -s $f.onnx.json ] || wget -q -O $f.onnx.json "$HF/$v.onnx.json"
done

echo "== microWakeWord venv"
mkvenv venv-mww
venv-mww/bin/pip install -q 'git+https://github.com/whatsnowplaying/audio-metadata@d4ebb238e6a401bb1a5aaaac60c9e2b3cb30929f'
venv-mww/bin/pip install -q -e ./mww
venv-mww/bin/pip install -q 'tensorflow[and-cuda]' soundfile scipy pyarrow huggingface_hub
# datasets 4 decodes audio through torchcodec; 3.x uses soundfile + librosa.
venv-mww/bin/pip install -q 'datasets<4' librosa
venv-mww/bin/python -c "import tensorflow as tf; print('TF', tf.__version__, tf.config.list_physical_devices('GPU'))"
venv-piper/bin/python -c "import torch; print('torch', torch.__version__, torch.cuda.is_available())"
echo "== setup done"
