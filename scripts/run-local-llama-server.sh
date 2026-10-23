#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

LLAMA_SERVER="${LLAMA_SERVER:-$HOME/llama.cpp/build/bin/llama-server}"
MODEL_PATH="${MODEL_PATH:-$HOME/models/model.gguf}"
PORT="${PORT:-8080}"
UI_PORT="${UI_PORT:-5173}"
CTX_SIZE="${CTX_SIZE:-4096}"
THREADS="${THREADS:-2}"
MODEL_ALIAS="${MODEL_ALIAS:-local-model}"

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
echo "Контекст: $CTX_SIZE; потоки CPU: $THREADS; имя API: $MODEL_ALIAS"
echo "Остановка: Ctrl+C"

exec "$LLAMA_SERVER" \
  --model "$MODEL_PATH" \
  --alias "$MODEL_ALIAS" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --ctx-size "$CTX_SIZE" \
  --threads "$THREADS" \
  --n-gpu-layers 0 \
  --cors-origins "localhost"
