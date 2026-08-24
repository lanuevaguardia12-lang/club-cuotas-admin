#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/Iniciar Bot WhatsApp.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

mkdir -p "$MACOS_DIR"

cat > "$MACOS_DIR/start-whatsapp-bot" <<'EOF'
#!/bin/zsh
BOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$BOT_DIR/start-whatsapp-bot.sh"
EOF

chmod +x "$MACOS_DIR/start-whatsapp-bot"

cat > "$CONTENTS_DIR/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>start-whatsapp-bot</string>
  <key>CFBundleIdentifier</key>
  <string>com.lanuevaguardia.whatsappbot</string>
  <key>CFBundleName</key>
  <string>Iniciar Bot WhatsApp</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.lanuevaguardia.whatsappbot</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>lng-whatsapp-bot</string>
      </array>
    </dict>
  </array>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
EOF

echo "Launcher creado en: $APP_DIR"
