#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/whatsapp-bot.log"
LAUNCHER_LOG_FILE="$SCRIPT_DIR/whatsapp-launcher.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export WHATSAPP_BOT_HEADLESS="${WHATSAPP_BOT_HEADLESS:-false}"
export WHATSAPP_BOT_SEND_DELAY_MS="${WHATSAPP_BOT_SEND_DELAY_MS:-60000}"

echo "$(date '+%Y-%m-%d %H:%M:%S') launcher iniciado" >> "$LAUNCHER_LOG_FILE"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Bot WhatsApp\"" >/dev/null 2>&1 || true
}

if pgrep -f "$SCRIPT_DIR/whatsapp-reminder-bot.mjs" >/dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') bot ya estaba corriendo" >> "$LAUNCHER_LOG_FILE"
  notify "El bot ya esta corriendo."
  exit 0
fi

NODE_BIN="$(command -v node || true)"

if [ -z "$NODE_BIN" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') node no encontrado" >> "$LAUNCHER_LOG_FILE"
  notify "No encontre Node. Abrime Codex y lo revisamos."
  exit 1
fi

cd "$SCRIPT_DIR"
if [ "$WHATSAPP_BOT_HEADLESS" != "true" ]; then
  open -a "Google Chrome" "https://web.whatsapp.com/" >/dev/null 2>&1 || true
fi
: > "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') iniciando bot con delay ${WHATSAPP_BOT_SEND_DELAY_MS}ms headless=${WHATSAPP_BOT_HEADLESS}" >> "$LOG_FILE"
nohup "$NODE_BIN" "$SCRIPT_DIR/whatsapp-reminder-bot.mjs" >> "$LOG_FILE" 2>&1 &
echo "$(date '+%Y-%m-%d %H:%M:%S') bot lanzado pid $!" >> "$LAUNCHER_LOG_FILE"
notify "Bot iniciado. Ya esta consultando la cola."
