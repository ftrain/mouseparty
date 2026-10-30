#!/usr/bin/env bash
# Build "Open House Party.app": the Go app (Wails, pinned, run through `go run`) with what
# hosting from the Mac needs inside it: MediaMTX and cloudflared, and optionally
# ffmpeg, and pandoc as WebAssembly (scripts/fetch_pandoc.sh). Apple Silicon only (macOS 13+, Go's own minimum).
#
# MediaMTX and cloudflared are single static Go binaries, so they are copied in
# from Homebrew (brew install mediamtx cloudflared), or from MEDIAMTX_BIN /
# CLOUDFLARED_BIN. Without cloudflared the app still hosts, with a direct link only.
#
#   scripts/build_mac_app.sh                   uses this Mac's ffmpeg (Homebrew) at runtime
#   BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   ships Open House Party's own cut-down ffmpeg inside the app
#   SIGN_IDENTITY="Developer ID Application: ..." NOTARY_PROFILE=openhouseparty \
#       BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   for other Macs: signed + notarized
#
# NOTARY_PROFILE is a keychain profile from `xcrun notarytool store-credentials`.
# Output: dist/Open House Party.app and dist/OpenHouseParty-macos-arm64.zip (DIST=<dir> to put them elsewhere)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME='Open House Party'   # the app in Finder and the menu bar
BIN='OpenHouseParty'          # its program inside (wails.json's outputfilename)
WAILS=github.com/wailsapp/wails/v2/cmd/wails@v2.17.0   # the same version as go.mod's
DIST=${DIST:-dist}

TOOLS=()
if [ -n "${BUNDLE_FFMPEG:-}" ]; then
# Open House Party's own ffmpeg: static, and cut down to what the app uses (20 MB, not
# 60+), built from pinned sources by scripts/build_ffmpeg.sh the first time.
# Homebrew's links against ~80 Homebrew dylibs, so it can't be copied into an
# app, and lacks drawtext, which the cards need. The app uses ffmpeg alone, never
# ffprobe. FFMPEG_DIR=<dir with one> uses your own instead.
FFMPEG_DIR=${FFMPEG_DIR:-build/ffmpeg/bin}
[ -x "$FFMPEG_DIR/ffmpeg" ] || [ "$FFMPEG_DIR" != build/ffmpeg/bin ] || scripts/build_ffmpeg.sh
# streaming needs these; a build without them would fail only when streaming
# (read whole first: grep -q stops reading early, and pipefail counts ffmpeg's broken pipe)
ENCODERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -encoders 2>/dev/null)
MUXERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -muxers 2>/dev/null)
FILTERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -filters 2>/dev/null)
grep -q ' libx264 ' <<<"$ENCODERS" || { echo "$FFMPEG_DIR/ffmpeg has no libx264"; exit 1; }
grep -q ' libopus ' <<<"$ENCODERS" || { echo "$FFMPEG_DIR/ffmpeg has no libopus (hosting needs Opus)"; exit 1; }
grep -q ' rtsp ' <<<"$MUXERS" || { echo "$FFMPEG_DIR/ffmpeg cannot send RTSP"; exit 1; }
grep -q ' drawtext ' <<<"$FILTERS" || { echo "$FFMPEG_DIR/ffmpeg has no drawtext (the cards)"; exit 1; }
grep -q ' showcqt ' <<<"$FILTERS" || { echo "$FFMPEG_DIR/ffmpeg has no showcqt (the picture for music)"; exit 1; }
TOOLS+=("$FFMPEG_DIR/ffmpeg")
fi

# Hosting: MediaMTX (required) and cloudflared (optional), both static
MEDIAMTX_BIN=${MEDIAMTX_BIN:-$(command -v mediamtx || true)}
[ -x "$MEDIAMTX_BIN" ] || { echo "No mediamtx: brew install mediamtx, or set MEDIAMTX_BIN"; exit 1; }
TOOLS+=("$(realpath "$MEDIAMTX_BIN")")
CLOUDFLARED_BIN=${CLOUDFLARED_BIN:-$(command -v cloudflared || true)}
if [ -x "$CLOUDFLARED_BIN" ]; then
    TOOLS+=("$(realpath "$CLOUDFLARED_BIN")")
else
    echo "No cloudflared: building without the Cloudflare link"
fi
for bin in "${TOOLS[@]}"; do
    if otool -L "$bin" | tail -n +2 | grep -v -q -E '^\s*/(usr/lib|System)/'; then
        echo "$bin links libraries outside macOS; it can't be copied into the app"; exit 1
    fi
done
[ -f media/standby_opus.mp4 ] || scripts/make_standby_card.sh
scripts/fetch_pandoc.sh   # pandoc as WebAssembly, run in-process (wasm.go): documents brought in

go run "$WAILS" build -platform darwin/arm64 -skipbindings -trimpath -clean
rm -rf "$DIST/$APP_NAME.app"
mkdir -p "$DIST"
ditto "packaging/bin/$BIN.app" "$DIST/$APP_NAME.app"
APP="$DIST/$APP_NAME.app"
mkdir -p "$APP/Contents/Resources/bin"          # main.go's bundledBin looks here
for bin in "${TOOLS[@]}"; do
    cp "$bin" "$APP/Contents/Resources/bin/"
done
mkdir -p "$APP/Contents/Resources/wasm"         # wasm.go's findWasm looks here
cp build/pandoc/pandoc.wasm "$APP/Contents/Resources/wasm/"
# the viewer page, read from here on every page load (it's built in too)
ditto host_web "$APP/Contents/Resources/host_web"
# Open House Party's licence and everything else's, ffmpeg's GPL among them (licenses/README.md)
mkdir -p "$APP/Contents/Resources/Licenses"
cp LICENSE "$APP/Contents/Resources/Licenses/OpenHouseParty-LICENSE"
ditto licenses "$APP/Contents/Resources/Licenses"
[ -n "${BUNDLE_FFMPEG:-}" ] && /usr/libexec/PlistBuddy -c 'Set :NSHumanReadableCopyright "ffmpeg is GPL; see https://ffmpeg.org/legal.html"' "$APP/Contents/Info.plist"

if [ -n "${SIGN_IDENTITY:-}" ]; then
    # Inside out: every tool, then the bundle, all with the hardened runtime
    find "$APP/Contents/Resources/bin" -type f -print0 |
        xargs -0 codesign --force --timestamp --options runtime --sign "$SIGN_IDENTITY"
    codesign --force --timestamp --options runtime --sign "$SIGN_IDENTITY" "$APP"
else
    codesign --force --deep --sign - "$APP"     # ad-hoc: the tools added after Wails signed it
fi
codesign --verify --deep --strict "$APP"

ZIP="$DIST/OpenHouseParty-macos-arm64.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if [ -n "${SIGN_IDENTITY:-}" ] && [ -n "${NOTARY_PROFILE:-}" ]; then
    xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP"
    rm -f "$ZIP" && ditto -c -k --keepParent "$APP" "$ZIP"   # re-zip with the ticket stapled
fi
echo "Built $APP and $ZIP"
