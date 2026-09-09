#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/Iniciar Bot WhatsApp.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
SOURCE_FILE="$(mktemp /tmp/lng-whatsapp-launcher.XXXXXX.c)"
LAUNCHER_BIN="$MACOS_DIR/start-whatsapp-bot"
START_SCRIPT="$SCRIPT_DIR/start-whatsapp-bot.sh"
START_SCRIPT_ESCAPED="${START_SCRIPT//\\/\\\\}"
START_SCRIPT_ESCAPED="${START_SCRIPT_ESCAPED//\"/\\\"}"

rm -rf "$APP_DIR"

mkdir -p "$MACOS_DIR"

cat > "$SOURCE_FILE" <<'EOF'
#include <spawn.h>
#include <stdlib.h>
#include <sys/wait.h>

extern char **environ;

int main(void) {
  pid_t pid;
  const char *script_path = "__START_SCRIPT__";
  char *argv[] = {"/bin/zsh", (char *)script_path, NULL};
  int status = posix_spawn(&pid, "/bin/zsh", NULL, NULL, argv, environ);

  if (status != 0) {
    return status;
  }

  waitpid(pid, NULL, 0);
  return 0;
}
EOF

perl -0pi -e "s#__START_SCRIPT__#$START_SCRIPT_ESCAPED#g" "$SOURCE_FILE"
cc -arch arm64 -arch x86_64 "$SOURCE_FILE" -o "$LAUNCHER_BIN" 2>/dev/null || \
  cc "$SOURCE_FILE" -o "$LAUNCHER_BIN"
rm -f "$SOURCE_FILE"

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
  <key>CFBundleDisplayName</key>
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
  <string>2.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
EOF

printf "APPL????" > "$CONTENTS_DIR/PkgInfo"
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR"

echo "Launcher creado en: $APP_DIR"
