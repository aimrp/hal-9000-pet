#!/usr/bin/env bash
# Assemble a portable Windows build from the already-installed Electron runtime.
# No electron-builder / code-signing tooling needed. Output: dist/win-unpacked/
set -e
cd "$(dirname "$0")/.."

APP="HAL 9000 Pet"
OUT="dist/win-unpacked"

echo "==> cleaning dist/"
rm -rf dist
mkdir -p "$OUT"

echo "==> copying Electron runtime"
cp -r node_modules/electron/dist/* "$OUT"/
# rename the exe: nicer name AND makes app.isPackaged === true
mv "$OUT/electron.exe" "$OUT/$APP.exe"
# default_app.asar is ignored once resources/app exists, but remove it to be tidy
rm -f "$OUT/resources/default_app.asar"

echo "==> copying app"
mkdir -p "$OUT/resources/app"
cp -r src "$OUT/resources/app/"
cp package.json "$OUT/resources/app/"

echo "==> copying hooks (as extra resources)"
cp -r hooks "$OUT/resources/"

echo "==> done: $OUT/$APP.exe"
