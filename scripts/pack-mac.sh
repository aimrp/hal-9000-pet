#!/usr/bin/env bash
# Assemble a portable macOS .app from the already-installed Electron runtime.
# No electron-builder / notarization needed. Output: dist/mac/HAL 9000 Pet.app
# Mirrors scripts/pack.sh (the Windows packer) but for macOS.
set -e
cd "$(dirname "$0")/.."

APP="HAL 9000 Pet"
OUT="dist/mac"
APPDIR="$OUT/$APP.app"
SRC="node_modules/electron/dist/Electron.app"
PLIST="$APPDIR/Contents/Info.plist"
PB=/usr/libexec/PlistBuddy

if [ ! -d "$SRC" ]; then
  echo "!! $SRC not found. Run 'npm install' first (on macOS)." >&2
  exit 1
fi

echo "==> cleaning dist/mac"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> copying Electron.app runtime"
cp -R "$SRC" "$APPDIR"

echo "==> renaming inner executable (Electron -> $APP)"
mv "$APPDIR/Contents/MacOS/Electron" "$APPDIR/Contents/MacOS/$APP"

echo "==> patching Info.plist"
$PB -c "Set :CFBundleExecutable $APP"        "$PLIST"
$PB -c "Set :CFBundleName $APP"              "$PLIST"
$PB -c "Set :CFBundleIdentifier com.claude.halpet" "$PLIST"
# CFBundleDisplayName may not exist in the stock plist; Add if Set fails.
$PB -c "Set :CFBundleDisplayName $APP"       "$PLIST" 2>/dev/null || \
  $PB -c "Add :CFBundleDisplayName string $APP" "$PLIST"
# LSUIElement=1 -> pure menu-bar app, no Dock icon (belt-and-suspenders with app.dock.hide()).
$PB -c "Set :LSUIElement 1"                  "$PLIST" 2>/dev/null || \
  $PB -c "Add :LSUIElement bool true"        "$PLIST"

echo "==> installing app code into Contents/Resources"
RES="$APPDIR/Contents/Resources"
# default_app.asar is ignored once resources/app exists (this makes app.isPackaged true), but remove it to be tidy
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
cp -R src "$RES/app/"
cp package.json "$RES/app/"

echo "==> copying hooks (as extra resources)"
cp -R hooks "$RES/"

echo "==> ad-hoc code-signing (lets it run locally without the 'damaged' Gatekeeper error)"
codesign --force --deep --sign - "$APPDIR" 2>/dev/null || echo "   (codesign skipped/failed — app still runs after 'xattr -dr com.apple.quarantine')"

echo "==> zipping"
( cd "$OUT" && ditto -c -k --sequesterRsrc --keepParent "$APP.app" "HAL-9000-Pet-mac.zip" )

echo "==> done: $APPDIR"
echo "    zip:  $OUT/HAL-9000-Pet-mac.zip"
