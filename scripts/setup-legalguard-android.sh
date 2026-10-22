#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_DIR="${LLAMA_DIR:-$HOME/llama.cpp}"
MODEL_DIR="${MODEL_DIR:-$HOME/models}"
MODEL_PATH="${MODEL_PATH:-$MODEL_DIR/model.gguf}"
MODEL_URL="https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"

if ! command -v pkg >/dev/null 2>&1; then
  echo "Этот сценарий предназначен для Termux на Android." >&2
  exit 1
fi

echo "Этап 1/5: установка системных зависимостей"
pkg update -y
pkg install -y git cmake clang make nodejs-lts curl

echo "Этап 2/5: получение исходников llama.cpp"
if [ ! -d "$LLAMA_DIR/.git" ]; then
  git clone https://github.com/ggml-org/llama.cpp "$LLAMA_DIR"
else
  echo "Исходники уже есть: $LLAMA_DIR"
fi

echo "Этап 3/5: сборка llama-server (может занять длительное время)"
cmake -S "$LLAMA_DIR" -B "$LLAMA_DIR/build" -DGGML_OPENMP=ON -DGGML_NATIVE=OFF
cmake --build "$LLAMA_DIR/build" --target llama-server -j 2

echo "Этап 4/5: проверка файла модели"
mkdir -p "$MODEL_DIR"
if [ ! -s "$MODEL_PATH" ]; then
  echo "Будет скачана модель Qwen3-1.7B Q4_K_M размером около 1,28 GB."
  echo "Модель нужна для первого теста локального конвейера; юридические выводы обязательно проверять."
  read -r -p "Скачать модель сейчас? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES)
      part="$MODEL_PATH.part"
      if [ -f "$part" ]; then
        curl -L --fail --retry 3 -C - -o "$part" "$MODEL_URL"
      else
        curl -L --fail --retry 3 -o "$part" "$MODEL_URL"
      fi
      mv "$part" "$MODEL_PATH"
      ;;
    *)
      echo "Загрузка модели пропущена. Позже скачайте GGUF в: $MODEL_PATH"
      ;;
  esac
else
  echo "Файл модели уже существует: $MODEL_PATH"
fi

echo "Этап 5/5: установка зависимостей приложения"
cd "$ROOT"
npm install --no-audit --no-fund

echo
echo "Подготовка завершена."
echo "Если файл модели существует, запуск: bash scripts/start-legalguard-android.sh"
echo "Если модели нет, скачайте GGUF в $MODEL_PATH и затем запустите приложение."
echo "Если сборка прервётся из-за нехватки памяти, не увеличивайте число потоков."
