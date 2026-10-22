#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_SERVER="${LLAMA_SERVER:-$HOME/llama.cpp/build/bin/llama-server}"
MODEL_PATH="${MODEL_PATH:-$HOME/models/model.gguf}"
MODEL_ALIAS="${MODEL_ALIAS:-local-model}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
UI_PORT="${UI_PORT:-5173}"
CTX_SIZE="${CTX_SIZE:-4096}"
THREADS="${THREADS:-2}"
LOG_DIR="${LOG_DIR:-$HOME/.legalguard-ai/logs}"
LLAMA_PID=""
VITE_PID=""

cleanup() {
  if [ -n "$VITE_PID" ]; then kill "$VITE_PID" 2>/dev/null || true; fi
  if [ -n "$LLAMA_PID" ]; then kill "$LLAMA_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

for command in node npm curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Не найдена команда $command. В Termux выполните: pkg install nodejs-lts curl" >&2
    exit 1
  fi
done

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "Не найден llama-server: $LLAMA_SERVER" >&2
  echo "Сначала соберите llama.cpp; инструкция: docs/local-model-android.md" >&2
  exit 1
fi
if [ ! -f "$MODEL_PATH" ]; then
  echo "Не найден файл модели: $MODEL_PATH" >&2
  echo "Поместите совместимую GGUF-модель в этот путь или задайте MODEL_PATH." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
cd "$ROOT"
if [ ! -d node_modules ]; then
  echo "Устанавливаю зависимости интерфейса..."
  npm install --no-audit --no-fund
fi

echo "Запускаю локальную модель..."
"$LLAMA_SERVER" \
  --model "$MODEL_PATH" \
  --alias "$MODEL_ALIAS" \
  --host 127.0.0.1 \
  --port "$LLAMA_PORT" \
  --ctx-size "$CTX_SIZE" \
  --threads "$THREADS" \
  --n-gpu-layers 0 \
  --cors '*' >"$LOG_DIR/llama-server.log" 2>&1 &
LLAMA_PID=$!

ready=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:$LLAMA_PORT/v1/models" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$LLAMA_PID" 2>/dev/null; then
    echo "Сервер модели завершился. Последние строки журнала:" >&2
    tail -n 40 "$LOG_DIR/llama-server.log" >&2 || true
    exit 1
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Сервер модели не ответил за 90 секунд. Журнал: $LOG_DIR/llama-server.log" >&2
  exit 1
fi

echo "Локальная модель готова."
echo "Запускаю интерфейс: http://127.0.0.1:$UI_PORT"
echo "Остановка обоих процессов: Ctrl+C"
npm run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort >"$LOG_DIR/vite.log" 2>&1 &
VITE_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$UI_PORT" >/dev/null 2>&1; then
    echo "Откройте в браузере: http://127.0.0.1:$UI_PORT"
    echo "Журнал интерфейса: $LOG_DIR/vite.log"
    wait "$VITE_PID"
    exit $?
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "Интерфейс не запустился. Журнал: $LOG_DIR/vite.log" >&2
    tail -n 40 "$LOG_DIR/vite.log" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "Интерфейс не ответил за 30 секунд. Журнал: $LOG_DIR/vite.log" >&2
exit 1
