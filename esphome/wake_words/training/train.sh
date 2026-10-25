#!/bin/sh
# train.sh <name> <positive features> <near-miss features>  (notebook cells 9-10)
set -e
cd /local
# TF does not find the pip CUDA libs (libcusolver) on its own, and must not take
# all the VRAM while samples generate on the same GPU.
export TF_FORCE_GPU_ALLOW_GROWTH=true
export LD_LIBRARY_PATH=$(ls -d /work/venv-mww/lib/python3.11/site-packages/nvidia/*/lib | tr '\n' :)
/work/venv-mww/bin/python - <<EOF
import yaml
feat = lambda d, sw, truth, trunc: dict(features_dir=d, sampling_weight=sw, penalty_weight=1.0,
                                        truth=truth, truncation_strategy=trunc, type="mmap")
config = dict(
    window_step_ms=10,
    train_dir="trained_models/$1",
    features=[
        feat("$2", 2.0, True, "truncate_start"),
        feat("$3", 3.0, False, "truncate_start"),
        feat("negative_datasets/speech", 10.0, False, "random"),
        feat("negative_datasets/dinner_party", 10.0, False, "random"),
        feat("negative_datasets/no_speech", 5.0, False, "random"),
        feat("negative_datasets/dinner_party_eval", 0.0, False, "split"),
    ],
    training_steps=[30000],
    positive_class_weight=[1],
    negative_class_weight=[20],
    learning_rates=[0.001],
    batch_size=128,
    time_mask_max_size=[0], time_mask_count=[0], freq_mask_max_size=[0], freq_mask_count=[0],
    eval_step_interval=500,
    clip_duration_ms=1500,
    target_minimization=0.9,
    minimization_metric=None,
    maximization_metric="average_viable_recall",
)
yaml.dump(config, open("training_$1.yaml", "w"))
EOF
/work/venv-mww/bin/python -m microwakeword.model_train_eval \
  --training_config=training_$1.yaml \
  --train 1 --restore_checkpoint 1 \
  --test_tf_nonstreaming 0 --test_tflite_nonstreaming 0 --test_tflite_nonstreaming_quantized 0 \
  --test_tflite_streaming 0 --test_tflite_streaming_quantized 1 \
  --use_weights best_weights \
  mixednet \
  --pointwise_filters "64,64,64,64" --repeat_in_block "1, 1, 1, 1" \
  --mixconv_kernel_sizes '[5], [7,11], [9,15], [23]' --residual_connection "0,0,0,0" \
  --first_conv_filters 32 --first_conv_kernel_size 5 --stride 3
echo "== train $1 done"
