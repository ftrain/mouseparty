#!/usr/bin/env bash
# Render the app's icon, packaging/src/appicon.svg, to packaging/appicon.png
# (1024 square, transparent around the rounded square), which `wails build`
# turns into the app's .icns. Needs Google Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
"$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$TMP/profile" \
    --default-background-color=00000000 --window-size=1024,1024 \
    --screenshot="$TMP/icon.png" "file://$PWD/packaging/src/appicon.svg" 2>/dev/null
cp "$TMP/icon.png" packaging/appicon.png
echo "Made packaging/appicon.png"
