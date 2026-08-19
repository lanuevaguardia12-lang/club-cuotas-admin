#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/whatsapp-bot.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export WHATSAPP_BOT_HEADLESS=false
export WHATSAPP_BOT_SEND_DELAY_MS="${WHATSAPP_BOT_SEND_DELAY_MS:-60000}"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Bot WhatsApp\"" >/dev/null 2>&1 || true
}

if pgrep -f "$SCRIPT_DIR/whatsapp-reminder-bot.mjs" >/dev/null 2>&1; then
  notify "El bot ya esta corriendo."
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  notify "No encontre npm. Abrime Codex y lo revisamos."
  exit 1
fi

cd "$SCRIPT_DIR"
nohup npm start >> "$LOG_FILE" 2>&1 &
notify "Bot iniciado. Se va a abrir Chrome con WhatsApp Web."
