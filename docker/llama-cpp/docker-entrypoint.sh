#!/bin/sh
set -e

MODEL_PATH="${LLAMA_ARG_MODEL:-/models/model.gguf}"
MODEL_URL="${LLAMA_ARG_MODEL_URL:-}"

if [ ! -f "$MODEL_PATH" ] && [ -n "$MODEL_URL" ]; then
  echo "Model not found at $MODEL_PATH"
  echo "Downloading from $MODEL_URL ..."
  mkdir -p "$(dirname "$MODEL_PATH")"
  curl -# -L -o "$MODEL_PATH" "$MODEL_URL"
  echo "Download complete."
fi

if [ ! -f "$MODEL_PATH" ]; then
  echo "ERROR: Model not found at $MODEL_PATH"
  echo "Set LLAMA_ARG_MODEL to the model path and LLAMA_ARG_MODEL_URL to auto-download."
  exit 1
fi

exec /app/llama-server "$@"
