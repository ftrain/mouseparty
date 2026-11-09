#!/usr/bin/env bash
# Build "Mouse Party.app": the Go app (Wails, pinned, run through `go run`) with what
# hosting from the Mac needs inside it: MediaMTX and cloudflared, and optionally
# ffmpeg, and pandoc and Python as WebAssembly (scripts/fetch_pandoc.sh, build_python.sh). Apple Silicon only (macOS 13+, Go's own minimum).
#
# MediaMTX and cloudflared are single static Go binaries, copied in as their
# pinned, checked releases (scripts/fetch_tools.sh), or from MEDIAMTX_BIN /
# CLOUDFLARED_BIN to try another; CLOUDFLARED_BIN=none builds without it (the app
# still hosts, with a direct link only).
#
#   scripts/build_mac_app.sh                   uses this Mac's ffmpeg (Homebrew) at runtime
#   BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   ships Mouse Party's own cut-down ffmpeg inside the app
#   SIGN_IDENTITY="Developer ID Application: ..." NOTARY_PROFILE=mouseparty \
#       BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   for other Macs: signed + notarized
#
# Notarizing takes NOTARY_PROFILE, a keychain profile from `xcrun notarytool store-credentials`,
# or an App Store Connect API key (as .github/workflows/mac-app.yml does): NOTARY_KEY (the .p8
# file), NOTARY_KEY_ID and NOTARY_ISSUER. Signed, the app has the hardened runtime, with
# packaging/darwin/entitlements.plist.
# Output: dist/Mouse Party.app and dist/MouseParty-macos-arm64.dmg, the one file a release
# has (the app and a link to Applications to drag it to; updates download it too, checked by
# the SHA-256 GitHub gives each file). DIST=<dir> puts them elsewhere; NO_DMG=1 makes no disk image.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME='Mouse Party'   # the app in Finder and the menu bar
BIN='MouseParty'          # its program inside (wails.json's outputfilename)
WAILS=github.com/wailsapp/wails/v2/cmd/wails@v2.17.0   # the same version as go.mod's
DIST=${DIST:-dist}

TOOLS=()
if [ -n "${BUNDLE_FFMPEG:-}" ]; then
# Mouse Party's own ffmpeg: static, and cut down to what the app uses (20 MB, not
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
if [ -z "${MEDIAMTX_BIN:-}" ] || [ -z "${CLOUDFLARED_BIN:-}" ]; then scripts/fetch_tools.sh; fi
MEDIAMTX_BIN=${MEDIAMTX_BIN:-build/tools/mediamtx}
[ -x "$MEDIAMTX_BIN" ] || { echo "No mediamtx at $MEDIAMTX_BIN"; exit 1; }
TOOLS+=("$(realpath "$MEDIAMTX_BIN")")
CLOUDFLARED_BIN=${CLOUDFLARED_BIN:-build/tools/cloudflared}
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
scripts/build_python.sh   # CPython as WebAssembly, with Datasette (datasette.go): nothing to do once it's built
scripts/build_web.sh      # the pages, from their TypeScript, into host_web/ and frontend/ (Node 24)

# its version: VERSION (a release's tag, v3.1.0 or 3.1.0), else "dev", a build that never updates itself (updates.go)
VERSION=${VERSION:-dev}
VERSION=${VERSION#v}
go run "$WAILS" build -platform darwin/arm64 -skipbindings -trimpath -clean -ldflags "-X main.version=$VERSION"
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
ditto build/python/dist "$APP/Contents/Resources/python"   # datasette.go's pythonHome looks here
# the viewer page, read from here on every page load (it's built in too)
ditto host_web "$APP/Contents/Resources/host_web"
# Mouse Party's licence and everything else's, ffmpeg's GPL among them (licenses/README.md)
mkdir -p "$APP/Contents/Resources/Licenses"
cp LICENSE "$APP/Contents/Resources/Licenses/MouseParty-LICENSE"
ditto licenses "$APP/Contents/Resources/Licenses"
if [ "$VERSION" != dev ]; then   # what Finder, About and an update's check (updates.go checkBundle) read
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist"
fi
[ -n "${BUNDLE_FFMPEG:-}" ] && /usr/libexec/PlistBuddy -c 'Set :NSHumanReadableCopyright "ffmpeg is GPL; see https://ffmpeg.org/legal.html"' "$APP/Contents/Info.plist"

# Inside out: every tool, then the bundle, all with the hardened runtime (and the app its
# entitlements), with a Developer ID or ad hoc, so every build runs as a signed release does
# (the self-test, run on it in CI, finds an entitlement missing: without its one, Datasette is killed)
SIGN=(--sign -)
if [ -n "${SIGN_IDENTITY:-}" ]; then SIGN=(--timestamp --sign "$SIGN_IDENTITY"); fi
find "$APP/Contents/Resources/bin" -type f -print0 | xargs -0 codesign --force --options runtime "${SIGN[@]}"
codesign --force --options runtime --entitlements packaging/darwin/entitlements.plist "${SIGN[@]}" "$APP"
codesign --verify --deep --strict "$APP"

NOTARY=()
if [ -n "${NOTARY_PROFILE:-}" ]; then
    NOTARY=(--keychain-profile "$NOTARY_PROFILE")
elif [ -n "${NOTARY_KEY:-}" ]; then
    NOTARY=(--key "$NOTARY_KEY" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER")
fi
# notarize: Apple's notary service looks the file over; accepted, its ticket is stapled to what it holds
notarize() {
    local out
    out=$(xcrun notarytool submit "$1" "${NOTARY[@]}" --wait 2>&1) || { echo "$out"; exit 1; }
    echo "$out"
    grep -q 'status: Accepted' <<<"$out" || { echo "Notarizing $1 wasn't accepted"; exit 1; }
    xcrun stapler staple "$2"
}

rm -f "$DIST/MouseParty-macos-arm64.zip" "$DIST/MouseParty-macos-arm64.zip.sha256"   # what releases had once
if [ -n "${SIGN_IDENTITY:-}" ] && [ ${#NOTARY[@]} -gt 0 ]; then   # the app's own ticket, so it opens wherever it's copied
    ZIP=$(mktemp -d)/MouseParty.zip
    ditto -c -k --keepParent "$APP" "$ZIP"
    notarize "$ZIP" "$APP"
    rm -rf "$(dirname "$ZIP")"
fi

# the disk image people install from: the app, and Applications to drag it to
DMG="$DIST/MouseParty-macos-arm64.dmg"
rm -f "$DMG"
if [ -z "${NO_DMG:-}" ]; then
    STAGE=$(mktemp -d)
    ditto "$APP" "$STAGE/$APP_NAME.app"
    ln -s /Applications "$STAGE/Applications"
    hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
    rm -rf "$STAGE"
    if [ -n "${SIGN_IDENTITY:-}" ]; then
        codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG"
        if [ ${#NOTARY[@]} -gt 0 ]; then notarize "$DMG" "$DMG"; fi
    fi
fi
echo "Built $APP"
if [ -f "$DMG" ]; then echo "and $DMG"; fi
