#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

LLAMA_SERVER="${LLAMA_SERVER:-$HOME/llama.cpp/build/bin/llama-server}"
MODEL_PATH="${MODEL_PATH:-$HOME/models/model.gguf}"
PORT="${PORT:-8080}"
CTX_SIZE="${CTX_SIZE:-4096}"
THREADS="${THREADS:-2}"

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "Не найден llama-server: $LLAMA_SERVER" >&2
  echo "Соберите llama.cpp и при необходимости задайте LLAMA_SERVER." >&2
  exit 1
fi

if [ ! -f "$MODEL_PATH" ]; then
  echo "Не найден GGUF-файл модели: $MODEL_PATH" >&2
  echo "Задайте MODEL_PATH=/полный/путь/к/модели.gguf" >&2
  exit 1
fi

echo "Запуск локальной модели на 127.0.0.1:$PORT"
echo "Модель: $MODEL_PATH"
echo "Контекст: $CTX_SIZE; потоки CPU: $THREADS"
echo "Остановка: Ctrl+C"

exec "$LLAMA_SERVER" \
  --model "$MODEL_PATH" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --ctx-size "$CTX_SIZE" \
  --threads "$THREADS" \
  --n-gpu-layers 0 \
  --cors '*'
