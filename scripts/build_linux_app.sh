#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] || { echo "scripts/build_linux_app.sh builds on Linux x86-64 (Fedora 43 or later)"; exit 1; }

ID=io.github.ftrain.mouseparty
DIST=${DIST:-dist}
VERSION=${VERSION:-dev}
VERSION=${VERSION#v}
APPIMAGE=$DIST/MouseParty-linux-x86_64.AppImage
RPMFILE=$DIST/MouseParty-linux-x86_64.rpm

GO_WANTED=$(sed -n 's/^go //p' go.mod)
MISSING=()
for t in go node npm gcc pkg-config readelf mksquashfs desktop-file-validate appstreamcli; do
    command -v "$t" >/dev/null || MISSING+=("$t")
done
if command -v go >/dev/null && ! go list -m >/dev/null 2>&1; then MISSING+=("Go $GO_WANTED or later (this is $(go env GOVERSION))"); fi
[ -z "${RPM:-}" ] || command -v rpmbuild >/dev/null || MISSING+=(rpmbuild)
if command -v pkg-config >/dev/null && ! pkg-config --exists gtk+-3.0 webkit2gtk-4.1; then
    MISSING+=("GTK 3 and WebKitGTK 4.1's headers")
fi
if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Building the Linux app needs ${MISSING[*]}"
    echo "On Fedora: sudo dnf install golang nodejs npm gcc pkgconf-pkg-config binutils squashfs-tools desktop-file-utils appstream gtk3-devel webkit2gtk4.1-devel rpm-build"
    echo "and Go $GO_WANTED or later, as go.mod says. Fedora 43's golang is older: run GOTOOLCHAIN=auto $0 and it fetches Go $GO_WANTED, or install Go from https://go.dev/dl"
    exit 1
fi

only_glibc() {
    local outside
    outside=$(readelf -d "$1" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p' | grep -v -x -E 'libc\.so\.6|libm\.so\.6|libmvec\.so\.1|ld-linux-x86-64\.so\.2' || true)
    [ -z "$outside" ] || { echo "$1 links libraries beyond glibc ($outside): it can't be copied into the app"; exit 1; }
}

FFMPEG_DIR=${FFMPEG_DIR:-build/ffmpeg/bin}
[ -x "$FFMPEG_DIR/ffmpeg" ] || [ "$FFMPEG_DIR" != build/ffmpeg/bin ] || scripts/build_ffmpeg.sh
ENCODERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -encoders 2>/dev/null)
MUXERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -muxers 2>/dev/null)
FILTERS=$("$FFMPEG_DIR/ffmpeg" -hide_banner -filters 2>/dev/null)
grep -q ' libx264 ' <<<"$ENCODERS" || { echo "$FFMPEG_DIR/ffmpeg has no libx264"; exit 1; }
grep -q ' libopus ' <<<"$ENCODERS" || { echo "$FFMPEG_DIR/ffmpeg has no libopus (hosting needs Opus)"; exit 1; }
grep -q ' rtsp ' <<<"$MUXERS" || { echo "$FFMPEG_DIR/ffmpeg cannot send RTSP"; exit 1; }
grep -q ' drawtext ' <<<"$FILTERS" || { echo "$FFMPEG_DIR/ffmpeg has no drawtext (the cards)"; exit 1; }
grep -q ' showcqt ' <<<"$FILTERS" || { echo "$FFMPEG_DIR/ffmpeg has no showcqt (the picture for music)"; exit 1; }
grep -q ' subtitles ' <<<"$FILTERS" || { echo "$FFMPEG_DIR/ffmpeg has no subtitles filter"; exit 1; }
TOOLS=("$FFMPEG_DIR/ffmpeg")

if [ -z "${MEDIAMTX_BIN:-}" ] || [ -z "${CLOUDFLARED_BIN:-}" ]; then scripts/fetch_tools.sh; fi
MEDIAMTX_BIN=${MEDIAMTX_BIN:-build/tools/mediamtx}
[ -x "$MEDIAMTX_BIN" ] || { echo "No mediamtx at $MEDIAMTX_BIN"; exit 1; }
TOOLS+=("$MEDIAMTX_BIN")
CLOUDFLARED_BIN=${CLOUDFLARED_BIN:-build/tools/cloudflared}
if [ -x "$CLOUDFLARED_BIN" ]; then
    TOOLS+=("$CLOUDFLARED_BIN")
else
    echo "No cloudflared: building without the Cloudflare link"
fi
for bin in "${TOOLS[@]}"; do only_glibc "$bin"; done

scripts/fetch_pandoc.sh
scripts/build_python.sh
scripts/build_web.sh
scripts/fetch_font.sh
scripts/fetch_appimage_runtime.sh

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
CGO_ENABLED=1 go build -buildvcs=false -trimpath -tags desktop,production,webkit2_41 \
    -ldflags "-w -s -X main.version=$VERSION" -o "$WORK/mouseparty" .

TREE=$DIST/linux/mouseparty
rm -rf "$TREE"
mkdir -p "$TREE/resources/bin" "$TREE/resources/wasm" "$TREE/resources/fonts" "$TREE/resources/licenses"
cp "$WORK/mouseparty" "$TREE/mouseparty"
for bin in "${TOOLS[@]}"; do cp "$bin" "$TREE/resources/bin/"; done
cp build/pandoc/pandoc.wasm "$TREE/resources/wasm/"
cp -R build/python/dist "$TREE/resources/python"
cp -R host_web "$TREE/resources/host_web"
cp build/fonts/DejaVuSansMono.ttf "$TREE/resources/fonts/"
cp LICENSE "$TREE/resources/licenses/MouseParty-LICENSE"
cp -R licenses/. "$TREE/resources/licenses/"
chmod -R u+rwX,go+rX,go-w "$TREE"

desktop-file-validate "packaging/linux/$ID.desktop"
appstreamcli validate --no-net --explain "packaging/linux/$ID.metainfo.xml"

APPDIR=$WORK/AppDir
cp -R "$TREE" "$APPDIR"
install -m 755 packaging/linux/AppRun "$APPDIR/AppRun"
cp "packaging/linux/$ID.desktop" "packaging/linux/$ID.png" "$APPDIR/"
ln -s "$ID.png" "$APPDIR/.DirIcon"
mkdir -p "$APPDIR/usr/share/metainfo"
cp "packaging/linux/$ID.metainfo.xml" "$APPDIR/usr/share/metainfo/$ID.appdata.xml"
mksquashfs "$APPDIR" "$WORK/AppDir.squashfs" -root-owned -noappend -comp zstd -quiet -no-progress
mkdir -p "$DIST"
cat build/appimage/runtime-x86_64 "$WORK/AppDir.squashfs" >"$APPIMAGE.part"
chmod 755 "$APPIMAGE.part"
mv "$APPIMAGE.part" "$APPIMAGE"

rm -f "$RPMFILE"
if [ -n "${RPM:-}" ]; then
    RPM_VERSION=$VERSION
    [[ "$RPM_VERSION" =~ ^[0-9]+(\.[0-9]+)*$ ]] || RPM_VERSION=0~dev
    rpmbuild -bb --quiet \
        --define "_topdir $WORK/rpm" \
        --define "mp_version $RPM_VERSION" \
        --define "mp_tree $(realpath "$TREE")" \
        --define "mp_packaging $(realpath packaging/linux)" \
        packaging/linux/mouseparty.spec
    cp "$WORK"/rpm/RPMS/x86_64/mouseparty-*.rpm "$RPMFILE"
fi

echo "Built $TREE"
echo "and $APPIMAGE"
if [ -f "$RPMFILE" ]; then echo "and $RPMFILE"; fi
