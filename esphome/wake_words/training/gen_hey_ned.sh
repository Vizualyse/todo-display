#!/bin/sh
# "hey ned" TTS clips: positives and near-miss negatives. Needs random-speakers.patch
# applied to the generator, or LibriTTS only ever uses its first few speakers.
set -e
cd /work
PY=venv-piper/bin/python
export PYTHONPATH=/work/piper-sample-generator
LIBRI=voices/en_US-libritts_r-medium.pt
GB=$(for f in voices/en_GB-*.onnx; do printf -- "--model %s " "$f"; done)
SLERP="--slerp-weights 0.0 0.3 0.5 0.7 1.0"
O=samples_hey_ned

libri() {
  [ -d "$3" ] && return
  $PY -m piper_sample_generator "$1" --model $LIBRI --max-samples $2 --batch-size 100 \
    $SLERP --output-dir "$3.part" && mv "$3.part" "$3"
}
gb() {
  [ -d "$3" ] && return
  $PY -m piper_sample_generator "$1" $GB --max-samples $2 --output-dir "$3.part" && mv "$3.part" "$3"
}

libri "hey ned" 4000 $O/pos/libri_a
libri "hey ned!" 1000 $O/pos/libri_b
libri "hey, ned." 500 $O/pos/libri_c
gb "hey ned" 3000 $O/pos/gb_a
gb "hey ned!" 1000 $O/pos/gb_b
gb "hey, ned." 500 $O/pos/gb_c

for p in "hey ted" "hey fred" "hey ed" "hey red" "hey bed" "hey head" "hey net" \
         "hey neil" "hey nick" "hey dad" "hey ken" "hey there" "hey man" "a net" \
         "ned" "hey nat"; do
  d=$(echo "$p" | tr ' ' _)
  libri "$p" 300 $O/neg/libri_$d
  gb "$p" 150 $O/neg/gb_$d
done
echo "== gen hey_ned done"
