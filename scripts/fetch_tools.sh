#!/usr/bin/env bash
# MediaMTX and cloudflared, the two programs hosting runs beside the app: their
# release builds for this machine, pinned and checked, into build/tools/. Every
# build and test takes them from here (scripts/build_mac_app.sh, test.sh,
# fuzz.sh, the workflows), so a local app and a release carry the same ones,
# whatever Homebrew has (Homebrew's MediaMTX 1.20.1 couldn't read the stand-by
# card). To move a pin: the version, and each file's SHA-256. The Mac only (Apple Silicon).
#
#   scripts/fetch_tools.sh       -> build/tools/mediamtx, build/tools/cloudflared
#
# MediaMTX's sums are its release's own checksums.sha256. cloudflared publishes
# its in the release notes; these are of the files as downloaded on 2026-11-01.
set -euo pipefail
cd "$(dirname "$0")/.."

MEDIAMTX=v1.21.3
CLOUDFLARED=2026.10.3
OUT=build/tools

case "$(uname -s)-$(uname -m)" in
Darwin-arm64)
    MTX_FILE=mediamtx_${MEDIAMTX}_darwin_arm64.tar.gz MTX_SUM=bc1a0762fd18ffb413bcd81dcb9a072ac159fbd1f27e79ac6f14598aaac5ed3f
    CF_FILE=cloudflared-darwin-arm64.tgz CF_SUM=1165d14b6f6360a3b8c283d7d1100024d6ec7cd9bc9e32519e96150645f3ec55 ;;
*)
    echo "No pinned MediaMTX and cloudflared for $(uname -s) $(uname -m)"; exit 1 ;;
esac

STAMP="mediamtx $MEDIAMTX cloudflared $CLOUDFLARED $(uname -s)-$(uname -m)"
if [ "$(cat "$OUT/VERSION" 2>/dev/null)" = "$STAMP" ] && [ -x "$OUT/mediamtx" ] && [ -x "$OUT/cloudflared" ]; then
    exit 0
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fetch() { # url, file, sum
    curl -fsSL -o "$TMP/$2" "$1"
    echo "$3  $TMP/$2" | shasum -a 256 -c --quiet || { echo "$2 isn't the release it should be"; exit 1; }
}
fetch "https://github.com/bluenviron/mediamtx/releases/download/$MEDIAMTX/$MTX_FILE" "$MTX_FILE" "$MTX_SUM"
fetch "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED/$CF_FILE" "$CF_FILE" "$CF_SUM"
mkdir -p "$OUT"
tar -xzf "$TMP/$MTX_FILE" -C "$OUT" mediamtx
case "$CF_FILE" in
*.tgz) tar -xzf "$TMP/$CF_FILE" -C "$OUT" cloudflared ;;
*) cp "$TMP/$CF_FILE" "$OUT/cloudflared" ;;
esac
chmod +x "$OUT/mediamtx" "$OUT/cloudflared"
echo "$STAMP" > "$OUT/VERSION"
echo "MediaMTX $MEDIAMTX and cloudflared $CLOUDFLARED in $OUT"
