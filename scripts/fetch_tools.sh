#!/usr/bin/env bash
# MediaMTX and cloudflared, the two programs hosting runs beside the app: their
# release builds for this machine, pinned and checked, into build/tools/. Every
# build and test takes them from here (scripts/build_mac_app.sh, test.sh,
# fuzz.sh, the workflows), so a local app and a release carry the same ones,
# whatever Homebrew has (Homebrew's MediaMTX 1.20.1 couldn't read the stand-by
# card). To move a pin: the version, and each file's SHA-256.
#
#   scripts/fetch_tools.sh       -> build/tools/mediamtx, build/tools/cloudflared
#
# MediaMTX's sums are its release's own checksums.sha256. cloudflared publishes
# its in the release notes.
set -euo pipefail
cd "$(dirname "$0")/.."

MEDIAMTX=v1.21.3
CLOUDFLARED=2026.10.3

case "$(uname -s)-$(uname -m)" in
Darwin-arm64) HOST_TARGET=darwin-arm64 ;;
Linux-x86_64) HOST_TARGET=linux-amd64 ;;
MINGW*-x86_64 | MSYS*-x86_64) HOST_TARGET=windows-amd64 ;;
*) HOST_TARGET=none ;;
esac
TARGET=${TARGET:-$HOST_TARGET}
OUT=build/tools
[ "$TARGET" = "$HOST_TARGET" ] || OUT=build/tools/$TARGET
EXE=
case "$TARGET" in
darwin-arm64)
    MTX_FILE=mediamtx_${MEDIAMTX}_darwin_arm64.tar.gz MTX_SUM=bc1a0762fd18ffb413bcd81dcb9a072ac159fbd1f27e79ac6f14598aaac5ed3f
    CF_FILE=cloudflared-darwin-arm64.tgz CF_SUM=1165d14b6f6360a3b8c283d7d1100024d6ec7cd9bc9e32519e96150645f3ec55 ;;
linux-amd64)
    MTX_FILE=mediamtx_${MEDIAMTX}_linux_amd64.tar.gz MTX_SUM=0a2ea7eba96023631efa1bea7804823a9145b043b6646a8a05798d4ac24ed635
    CF_FILE=cloudflared-linux-amd64 CF_SUM=053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0 ;;
windows-amd64)
    MTX_FILE=mediamtx_${MEDIAMTX}_windows_amd64.zip MTX_SUM=b2f5246b07cb72961df03b8d5e8cad43dc657bcf3f49a87bb031bdf22721af74
    CF_FILE=cloudflared-windows-amd64.exe CF_SUM=76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2
    EXE=.exe ;;
*)
    echo "No pinned MediaMTX and cloudflared for $(uname -s) $(uname -m) (TARGET: darwin-arm64, linux-amd64 or windows-amd64)"; exit 1 ;;
esac

STAMP="mediamtx $MEDIAMTX cloudflared $CLOUDFLARED $TARGET"
if [ "$(cat "$OUT/VERSION" 2>/dev/null)" = "$STAMP" ] && [ -x "$OUT/mediamtx$EXE" ] && [ -x "$OUT/cloudflared$EXE" ]; then
    exit 0
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
sha256_check() {
    if command -v shasum >/dev/null; then shasum -a 256 -c --quiet; else sha256sum -c --quiet; fi
}
fetch() { # url, file, sum
    curl -fsSL -o "$TMP/$2" "$1"
    echo "$3  $TMP/$2" | sha256_check || { echo "$2 isn't the release it should be"; exit 1; }
}
fetch "https://github.com/bluenviron/mediamtx/releases/download/$MEDIAMTX/$MTX_FILE" "$MTX_FILE" "$MTX_SUM"
fetch "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED/$CF_FILE" "$CF_FILE" "$CF_SUM"
mkdir -p "$OUT"
case "$MTX_FILE" in
*.zip) unzip -o -q -j "$TMP/$MTX_FILE" "mediamtx$EXE" -d "$OUT" ;;
*) tar -xzf "$TMP/$MTX_FILE" -C "$OUT" mediamtx ;;
esac
case "$CF_FILE" in
*.tgz) tar -xzf "$TMP/$CF_FILE" -C "$OUT" cloudflared ;;
*) cp "$TMP/$CF_FILE" "$OUT/cloudflared$EXE" ;;
esac
chmod +x "$OUT/mediamtx$EXE" "$OUT/cloudflared$EXE"
echo "$STAMP" > "$OUT/VERSION"
echo "MediaMTX $MEDIAMTX and cloudflared $CLOUDFLARED in $OUT"
