#!/bin/sh
# Run on the host (not in the container) while training: keeps the run's features in
# page cache, which each eval partly evicts. List only the dirs the run reads.
cd /srv/wakeword
while pgrep -f model_train_eval >/dev/null; do
  find negative_datasets features/hey_ned_pos features/hey_ned_nearmiss -name "*.ninja" -print0 |
    xargs -0 -P2 -n4 cat > /dev/null
  sleep 30
done
