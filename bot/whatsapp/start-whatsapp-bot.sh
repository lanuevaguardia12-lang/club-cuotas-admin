#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/whatsapp-bot.log"
LAUNCHER_LOG_FILE="$SCRIPT_DIR/whatsapp-launcher.log"
STATUS_FILE="$SCRIPT_DIR/whatsapp-bot-status.json"
BOT_CLIENT_ID="${WHATSAPP_BOT_CLIENT_ID:-club-cuotas-reminders-v2}"
BOT_PROFILE_PATH="$SCRIPT_DIR/.wwebjs_auth/session-$BOT_CLIENT_ID"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export WHATSAPP_BOT_HEADLESS="${WHATSAPP_BOT_HEADLESS:-false}"
export WHATSAPP_BOT_SEND_DELAY_MS="${WHATSAPP_BOT_SEND_DELAY_MS:-60000}"
export WHATSAPP_BOT_STATUS_FILE="${WHATSAPP_BOT_STATUS_FILE:-$STATUS_FILE}"
export WHATSAPP_BOT_CLIENT_ID="$BOT_CLIENT_ID"

echo "$(date '+%Y-%m-%d %H:%M:%S') launcher iniciado" >> "$LAUNCHER_LOG_FILE"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Bot WhatsApp\"" >/dev/null 2>&1 || true
}

BOT_PIDS="$(pgrep -f "$SCRIPT_DIR/whatsapp-reminder-bot.mjs" 2>/dev/null || true)"

if [ -n "$BOT_PIDS" ]; then
  NOW="$(date +%s)"
  STATUS_MTIME="0"

  if [ -f "$STATUS_FILE" ]; then
    STATUS_MTIME="$(stat -f %m "$STATUS_FILE" 2>/dev/null || echo 0)"
  fi

  STATUS_AGE=$((NOW - STATUS_MTIME))

  if [ "$STATUS_AGE" -le 180 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') bot ya estaba corriendo con status reciente" >> "$LAUNCHER_LOG_FILE"
    notify "El bot ya esta corriendo."
    exit 0
  fi

  echo "$(date '+%Y-%m-%d %H:%M:%S') reiniciando bot sin status reciente: $BOT_PIDS" >> "$LAUNCHER_LOG_FILE"
  kill $BOT_PIDS >/dev/null 2>&1 || true
  sleep 2
fi

if [ -d "$BOT_PROFILE_PATH" ]; then
  pkill -f "$BOT_PROFILE_PATH" >/dev/null 2>&1 || true
fi

NODE_BIN="$(command -v node || true)"

if [ -z "$NODE_BIN" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') node no encontrado" >> "$LAUNCHER_LOG_FILE"
  notify "No encontre Node. Abrime Codex y lo revisamos."
  exit 1
fi

cd "$SCRIPT_DIR"
: > "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') iniciando bot con delay ${WHATSAPP_BOT_SEND_DELAY_MS}ms headless=${WHATSAPP_BOT_HEADLESS}" >> "$LOG_FILE"
nohup "$NODE_BIN" "$SCRIPT_DIR/whatsapp-reminder-bot.mjs" >> "$LOG_FILE" 2>&1 &
echo "$(date '+%Y-%m-%d %H:%M:%S') bot lanzado pid $!" >> "$LAUNCHER_LOG_FILE"
notify "Bot iniciado. Ya esta consultando la cola."
