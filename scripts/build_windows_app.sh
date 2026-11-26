#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CROSS=x86_64-w64-mingw32
sign() {
    local pass
    pass=$(mktemp)
    printf %s "${WINDOWS_PFX_PASSWORD:-}" >"$pass"
    osslsigncode sign -pkcs12 "$WINDOWS_PFX" -readpass "$pass" -h sha256 -n "Mouse Party" \
        -i https://ftrain.github.io/mouseparty/ ${WINDOWS_TIMESTAMP_URL:+-ts "$WINDOWS_TIMESTAMP_URL"} \
        -in "$1" -out "$1.signed" >/dev/null
    rm -f "$pass"
    mv "$1.signed" "$1"
}
if [ "${1:-}" = --sign ]; then
    sign "$2"
    exit 0
fi

[ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] || { echo "scripts/build_windows_app.sh cross-builds on Linux x86-64 (Fedora 43 or later)"; exit 1; }

DIST=${DIST:-dist}
VERSION=${VERSION:-dev}
VERSION=${VERSION#v}
SETUP=$DIST/MouseParty-windows-x86_64-setup.exe

GO_WANTED=$(sed -n 's/^go //p' go.mod)
MISSING=()
for t in go node npm "$CROSS-windres" "$CROSS-objdump" "$CROSS-objcopy" makensis; do command -v "$t" >/dev/null || MISSING+=("$t"); done
if command -v go >/dev/null && ! go list -m >/dev/null 2>&1; then MISSING+=("Go $GO_WANTED or later (this is $(go env GOVERSION))"); fi
[ -z "${WINDOWS_PFX:-}" ] || command -v osslsigncode >/dev/null || MISSING+=(osslsigncode)
if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Building the Windows app needs ${MISSING[*]}"
    echo "On Fedora: sudo dnf install golang nodejs npm mingw64-gcc mingw64-winpthreads-static mingw32-nsis osslsigncode"
    echo "and Go $GO_WANTED or later, as go.mod says. Fedora 43's golang is older: run GOTOOLCHAIN=auto $0 and it fetches Go $GO_WANTED, or install Go from https://go.dev/dl"
    exit 1
fi

WORK=$(mktemp -d)
SYSO=rsrc_windows_amd64.syso
trap 'rm -rf "$WORK" "$SYSO"' EXIT

only_windows_dlls() {
    local dlls outside
    "$CROSS-objcopy" --strip-debug "$1" "$WORK/imports.exe"
    dlls=$("$CROSS-objdump" -p "$WORK/imports.exe" | sed -n 's/.*DLL Name: *//p')
    rm -f "$WORK/imports.exe"
    [ -n "$dlls" ] || { echo "objdump lists no DLLs for $1, though every Windows program needs kernel32.dll: what it needs can't be checked"; exit 1; }
    outside=$(grep -v -i -x -E '(kernel32|msvcrt|advapi32|user32|gdi32|ole32|oleaut32|shell32|shlwapi|ws2_32|bcrypt|secur32|crypt32|psapi|iphlpapi|winmm|ntdll|userenv|dnsapi|version)\.dll|api-ms-win-[a-z0-9-]+\.dll' <<<"$dlls" || true)
    [ -z "$outside" ] || { echo "$1 needs DLLs that aren't Windows' own ($outside): it can't be copied into the app"; exit 1; }
}

FFMPEG_EXE=${FFMPEG_EXE:-build/ffmpeg-windows-amd64/bin/ffmpeg.exe}
[ -f "$FFMPEG_EXE" ] || [ "$FFMPEG_EXE" != build/ffmpeg-windows-amd64/bin/ffmpeg.exe ] || TARGET=windows-amd64 scripts/build_ffmpeg.sh
[ -f "$FFMPEG_EXE" ] || { echo "No ffmpeg.exe at $FFMPEG_EXE"; exit 1; }
TARGET=windows-amd64 scripts/fetch_tools.sh
TOOLS=("$FFMPEG_EXE" build/tools/windows-amd64/mediamtx.exe build/tools/windows-amd64/cloudflared.exe)
for bin in "${TOOLS[@]}"; do only_windows_dlls "$bin"; done

scripts/fetch_pandoc.sh
scripts/build_python.sh
scripts/build_web.sh
scripts/fetch_font.sh

NUMBERS=0,0,0,0
if [[ "$VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
    NUMBERS=${BASH_REMATCH[1]},${BASH_REMATCH[2]},${BASH_REMATCH[3]},0
fi
"$CROSS-windres" -I packaging/windows -DMP_VERSION="$VERSION" -DMP_VERSION_NUMBERS="$NUMBERS" \
    -i packaging/windows/MouseParty.rc -O coff -o "$SYSO"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -buildvcs=false -trimpath -tags desktop,production,wv2runtime.download \
    -ldflags "-w -s -H windowsgui -X main.version=$VERSION" -o "$WORK/MouseParty.exe" .
rm -f "$SYSO"

TREE="$DIST/windows/Mouse Party"
rm -rf "$TREE"
mkdir -p "$TREE/resources/bin" "$TREE/resources/wasm" "$TREE/resources/fonts" "$TREE/resources/licenses"
cp "$WORK/MouseParty.exe" "$TREE/"
cp "$FFMPEG_EXE" "$TREE/resources/bin/ffmpeg.exe"
cp build/tools/windows-amd64/mediamtx.exe build/tools/windows-amd64/cloudflared.exe "$TREE/resources/bin/"
cp build/pandoc/pandoc.wasm "$TREE/resources/wasm/"
cp -R build/python/dist "$TREE/resources/python"
cp -R host_web "$TREE/resources/host_web"
cp build/fonts/DejaVuSansMono.ttf "$TREE/resources/fonts/"
cp LICENSE "$TREE/resources/licenses/MouseParty-LICENSE"
cp -R licenses/. "$TREE/resources/licenses/"

NSIS=()
if [ -n "${WINDOWS_PFX:-}" ]; then
    sign "$TREE/MouseParty.exe"
    sign "$TREE/resources/bin/ffmpeg.exe"
    sign "$TREE/resources/bin/mediamtx.exe"
    NSIS=(-DSIGN="\"$(realpath "$0")\" --sign")
fi
mkdir -p "$DIST"
rm -f "$SETUP"
makensis -V2 -DTREE="$(realpath "$TREE")" -DOUTFILE="$(realpath "$DIST")/$(basename "$SETUP")" -DVERSION="$VERSION" -DVERSION_NUMBERS="${NUMBERS//,/.}" "${NSIS[@]}" \
    packaging/windows/installer.nsi
[ -f "$SETUP" ] || { echo "makensis made no $SETUP"; exit 1; }

echo "Built $TREE"
echo "and $SETUP"
