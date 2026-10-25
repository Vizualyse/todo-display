#!/bin/sh
# Pre-computed microWakeWord negative spectrogram features (~5.7GB zipped).
set -e
mkdir -p /work/negative_datasets && cd /work/negative_datasets
for f in dinner_party_eval dinner_party no_speech speech; do
  [ -d $f ] && continue
  wget -q -O $f.zip https://huggingface.co/datasets/kahrendt/microwakeword/resolve/main/$f.zip
  unzip -q $f.zip && rm $f.zip
  echo "got $f"
done
echo "== negatives done"
