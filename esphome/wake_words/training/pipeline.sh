#!/bin/sh
# Inside mww-train, after setup.sh, negatives.sh and prep_bg.py:
#   generate clips -> augmented features -> train and test.
set -e
cd /work
mkdir -p logs
step() {
  name=$1; shift
  echo "$(date +%T) start $name"
  "$@" > logs/$name.log 2>&1
  echo "$(date +%T) done $name"
}
FEAT="env CUDA_VISIBLE_DEVICES= venv-mww/bin/python features.py"
step gen_hey_ned sh gen_hey_ned.sh
step feat_pos $FEAT samples_hey_ned/pos /local/features/hey_ned_pos 2
step feat_neg $FEAT samples_hey_ned/neg /local/features/hey_ned_nearmiss 1
# train.sh reads the negatives from /local: copy them off the NAS first.
[ -d /local/negative_datasets ] || cp -rT negative_datasets /local/negative_datasets
step train_hey_ned sh train.sh hey_ned features/hey_ned_pos features/hey_ned_nearmiss
echo "== pipeline done"
