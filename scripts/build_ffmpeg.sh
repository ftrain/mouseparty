#!/usr/bin/env bash
# Build the ffmpeg Mouse Party ships: static, and cut
# down to what the app uses. It still reads anything (every decoder, container
# and parser), but it writes only H.264 (x264) and Opus over RTSP, PNG (a song's
# cover) and WebVTT (subtitles for viewers), plus Matroska and MP4 for the tests;
# and it has only the filters stream.go's commands name, and the ones ffmpeg
# puts in by itself. No ffprobe, no ffplay: the app reads files with ffmpeg alone.
#
#   scripts/build_ffmpeg.sh          -> build/ffmpeg/bin/ffmpeg
#   scripts/build_ffmpeg.sh --fetch  only download and check the sources (into build/ffmpeg/src;
#                                    each release carries them, as ffmpeg's GPL asks)
#
# Sources are pinned releases, checked against their SHA-256. x264 makes the
# result GPL. Needs pkg-config, meson, ninja and cmake.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)-$(uname -m)" in
Darwin-arm64) HOST_TARGET=darwin-arm64 ;;
Linux-x86_64) HOST_TARGET=linux-amd64 ;;
*) HOST_TARGET=none ;;
esac
TARGET=${TARGET:-$HOST_TARGET}
case "$TARGET" in
darwin-arm64 | linux-amd64)
    [ "$TARGET" = "$HOST_TARGET" ] || { echo "ffmpeg for $TARGET is built on $TARGET"; exit 1; }
    ROOT=$PWD/build/ffmpeg EXE= ;;
windows-amd64)
    [ "$HOST_TARGET" = linux-amd64 ] || { echo "ffmpeg for windows-amd64 is cross-built on linux-amd64, with mingw-w64"; exit 1; }
    ROOT=$PWD/build/ffmpeg-windows-amd64 EXE=.exe ;;
*)
    echo "No ffmpeg build for $(uname -s) $(uname -m) (TARGET: darwin-arm64, linux-amd64 or windows-amd64)"; exit 1 ;;
esac
SRC=$PWD/build/ffmpeg/src
PREFIX=$ROOT/prefix
JOBS=$(getconf _NPROCESSORS_ONLN)
# only what's built here: never Homebrew's copies of the same libraries
export PKG_CONFIG_LIBDIR=$PREFIX/lib/pkgconfig PKG_CONFIG_PATH=

X264=b35605ace3ddf7c1a5d67a2eb553f034aef41d55    # the stable branch
SOURCES=(
    "ffmpeg-9.0.2.tar.xz https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz 8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e"
    "x264-b35605ac.tar.bz2 https://code.videolan.org/videolan/x264/-/archive/$X264/x264-$X264.tar.bz2 6eeb82934e69fd51e043bd8c5b0d152839638d1ce7aa4eea65a3fedcf83ff224"
    "opus-1.5.2.tar.gz https://github.com/xiph/opus/releases/download/v1.5.2/opus-1.5.2.tar.gz 65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1"
    "freetype-2.15.0.tar.xz https://download.savannah.gnu.org/releases/freetype/freetype-2.15.0.tar.xz 93cd47eb719c325107f2d3cf087d06299e944c3b48a40b55537302304dea1dd5"
    "fribidi-1.0.17.tar.xz https://github.com/fribidi/fribidi/releases/download/v1.0.17/fribidi-1.0.17.tar.xz 6949dcde27d41cebad1fd741fcafc36d55a1020d2d872d4a6eb3914caabbada2"
    "harfbuzz-15.0.0.tar.xz https://github.com/harfbuzz/harfbuzz/releases/download/15.0.0/harfbuzz-15.0.0.tar.xz 968536e9abd782f07f7954044c0c4020199fcdd39b41d221ec42d2a3be4a44df"
    "libass-0.17.5.tar.xz https://github.com/libass/libass/releases/download/0.17.5/libass-0.17.5.tar.xz 2dca25c0e0c837ddf00b52011b3f82cac1e4ddd3ad018227806b0c2288864acc"
    "zlib-1.3.2.tar.gz https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.gz bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16"
    "bzip2-1.0.8.tar.gz https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269"
    "expat-2.10.0.tar.xz https://github.com/libexpat/libexpat/releases/download/R_2_10_0/expat-2.10.0.tar.xz c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f"
    "fontconfig-2.18.3.tar.xz https://gitlab.freedesktop.org/api/v4/projects/890/packages/generic/fontconfig/2.18.3/fontconfig-2.18.3.tar.xz 4f7b554a38cdf78c033f666c8871f3749e14a094f65a07f630c91ed0b43d35e3"
)
MINGW_W64=13.0.0
LINKED_FROM_THE_TOOLCHAIN=(
    "mingw-w64-v$MINGW_W64.tar.bz2 https://downloads.sourceforge.net/project/mingw-w64/mingw-w64/mingw-w64-release/mingw-w64-v$MINGW_W64.tar.bz2 5afe822af5c4edbf67daaf45eec61d538f49eef6b19524de64897c6b95828caf"
)

sha256_check() {
    if command -v sha256sum >/dev/null; then sha256sum -c --quiet; else shasum -a 256 -c --quiet; fi
}

FETCH=("${SOURCES[@]}")
[ "${1:-}" != --fetch ] || FETCH+=("${LINKED_FROM_THE_TOOLCHAIN[@]}")
mkdir -p "$SRC"
for s in "${FETCH[@]}"; do
    read -r file url sum <<<"$s"
    [ -f "$SRC/$file" ] || curl -fL --progress-bar -o "$SRC/$file" "$url"
    echo "$sum  $SRC/$file" | sha256_check || { echo "$file isn't the release it should be"; exit 1; }
done
[ "${1:-}" = --fetch ] && exit 0

CROSS=
case "$TARGET" in
darwin-arm64) TOOLS=(cc c++ make pkg-config meson ninja cmake) ;;
linux-amd64) TOOLS=(gcc g++ make nasm gperf pkg-config meson ninja cmake readelf) ;;
windows-amd64)
    CROSS=x86_64-w64-mingw32
    TOOLS=(gcc make nasm "$CROSS-gcc" "$CROSS-g++" "$CROSS-objdump" pkg-config meson ninja cmake) ;;
esac
MISSING=()
for t in "${TOOLS[@]}"; do command -v "$t" >/dev/null || MISSING+=("$t"); done
if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Building ffmpeg for $TARGET needs ${MISSING[*]}"
    case "$TARGET" in
    linux-amd64) echo "On Fedora: sudo dnf install gcc gcc-c++ make nasm gperf pkgconf-pkg-config meson ninja-build cmake binutils" ;;
    windows-amd64) echo "On Fedora: sudo dnf install gcc make nasm pkgconf-pkg-config meson ninja-build cmake mingw64-gcc mingw64-gcc-c++ mingw64-winpthreads-static" ;;
    esac
    exit 1
fi
if [ "$TARGET" = windows-amd64 ]; then
    mingw_w64() { echo '#include <_mingw.h>' | "$CROSS-gcc" -E -dM -x c - | sed -n "s/^#define __MINGW64_VERSION_$1 //p"; }
    LINKED=$(mingw_w64 MAJOR).$(mingw_w64 MINOR).$(mingw_w64 BUGFIX)
    if [ "$LINKED" != "$MINGW_W64" ]; then
        echo "This mingw-w64 is $LINKED, but a release carries the sources of mingw-w64 $MINGW_W64, which ffmpeg.exe links in: move MINGW_W64 and its SHA-256"
        exit 1
    fi
fi

CONFIGURE=() CMAKE=() MESON=() X264_CROSS=()
case "$TARGET" in
darwin-arm64)
    export MACOSX_DEPLOYMENT_TARGET=13.0
    export CFLAGS="-O2 -mmacosx-version-min=13.0" CXXFLAGS="-O2 -mmacosx-version-min=13.0" LDFLAGS="-mmacosx-version-min=13.0"
    CMAKE=(-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0) ;;
linux-amd64)
    export CFLAGS="-O2" CXXFLAGS="-O2" LDFLAGS="" ;;
windows-amd64)
    export CFLAGS="-O2" CXXFLAGS="-O2" LDFLAGS="" PKG_CONFIG=pkg-config
    CONFIGURE=(--host="$CROSS")
    X264_CROSS=(--host="$CROSS" --cross-prefix="$CROSS-")
    CMAKE=(-DCMAKE_SYSTEM_NAME=Windows -DCMAKE_SYSTEM_PROCESSOR=AMD64 -DCMAKE_C_COMPILER="$CROSS-gcc"
        -DCMAKE_CXX_COMPILER="$CROSS-g++" -DCMAKE_RC_COMPILER="$CROSS-windres" -DCMAKE_FIND_ROOT_PATH="$PREFIX"
        -DCMAKE_FIND_ROOT_PATH_MODE_PROGRAM=NEVER -DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=ONLY -DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=ONLY)
    mkdir -p "$ROOT"
    cat >"$ROOT/cross.meson" <<EOF
[binaries]
c = '$CROSS-gcc'
cpp = '$CROSS-g++'
ar = '$CROSS-ar'
strip = '$CROSS-strip'
windres = '$CROSS-windres'
pkg-config = 'pkg-config'

[properties]
pkg_config_libdir = ['$PREFIX/lib/pkgconfig']

[host_machine]
system = 'windows'
cpu_family = 'x86_64'
cpu = 'x86_64'
endian = 'little'
EOF
    MESON=(--cross-file "$ROOT/cross.meson") ;;
esac

mkdir -p "$PREFIX"
# unpack: a fresh copy of a source, gone again once installed
unpack() {
    rm -rf "$ROOT/work/$1" && mkdir -p "$ROOT/work/$1"
    tar -xf "$SRC/$2" -C "$ROOT/work/$1" --strip-components 1
    cd "$ROOT/work/$1"
}
done_with() { cd "$ROOT"; rm -rf "$ROOT/work/$1"; }

if [ "$TARGET" != darwin-arm64 ] && [ ! -f "$PREFIX/lib/libz.a" ]; then
    unpack zlib zlib-1.3.2.tar.gz
    CHOST=$CROSS ./configure --prefix="$PREFIX" --static
    make -j"$JOBS" libz.a
    make install
    done_with zlib
fi

if [ "$TARGET" != darwin-arm64 ] && [ ! -f "$PREFIX/lib/libbz2.a" ]; then
    unpack bzip2 bzip2-1.0.8.tar.gz
    BZ_CFLAGS="$CFLAGS -D_FILE_OFFSET_BITS=64"
    [ -n "$CROSS" ] || BZ_CFLAGS="$BZ_CFLAGS -fPIC"
    make -j"$JOBS" libbz2.a CC="${CROSS:+$CROSS-}gcc" AR="${CROSS:+$CROSS-}ar" RANLIB="${CROSS:+$CROSS-}ranlib" CFLAGS="$BZ_CFLAGS"
    mkdir -p "$PREFIX/include" "$PREFIX/lib"
    cp bzlib.h "$PREFIX/include/"
    cp libbz2.a "$PREFIX/lib/"
    done_with bzip2
fi

if [ ! -f "$PREFIX/lib/libx264.a" ]; then
    unpack x264 x264-b35605ac.tar.bz2
    ./configure --prefix="$PREFIX" --enable-static --enable-pic --disable-cli --disable-opencl ${X264_CROSS[@]+"${X264_CROSS[@]}"}
    make -j"$JOBS"
    make install
    done_with x264
fi

if [ ! -f "$PREFIX/lib/libopus.a" ]; then
    unpack opus opus-1.5.2.tar.gz
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-doc --disable-extra-programs ${CONFIGURE[@]+"${CONFIGURE[@]}"}
    make -j"$JOBS"
    make install
    done_with opus
fi

if [ ! -f "$PREFIX/lib/libfreetype.a" ]; then
    unpack freetype freetype-2.15.0.tar.xz
    cmake -S . -B out -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_INSTALL_LIBDIR=lib -DBUILD_SHARED_LIBS=OFF \
        ${CMAKE[@]+"${CMAKE[@]}"} -DFT_DISABLE_ZLIB=ON -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_PNG=ON \
        -DFT_DISABLE_HARFBUZZ=ON -DFT_DISABLE_BROTLI=ON -DFT_DISABLE_HVF=ON   # HVF: Apple's SDK has the header, not the library
    ninja -C out install
    done_with freetype
fi

if [ ! -f "$PREFIX/lib/libfribidi.a" ]; then
    unpack fribidi fribidi-1.0.17.tar.xz
    meson setup out ${MESON[@]+"${MESON[@]}"} --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
        -Ddocs=false -Dbin=false -Dtests=false
    ninja -C out install
    done_with fribidi
fi

if [ ! -f "$PREFIX/lib/libharfbuzz.a" ]; then
    unpack harfbuzz harfbuzz-15.0.0.tar.xz
    meson setup out ${MESON[@]+"${MESON[@]}"} --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
        -Dfreetype=enabled -Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dicu=disabled \
        -Dgraphite2=disabled -Dintrospection=disabled -Dtests=disabled -Ddocs=disabled -Dutilities=disabled -Dbenchmark=disabled
    ninja -C out install
    done_with harfbuzz
fi

if [ "$TARGET" = linux-amd64 ] && [ ! -f "$PREFIX/lib/libexpat.a" ]; then
    unpack expat expat-2.10.0.tar.xz
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --without-docbook --without-examples \
        --without-tests --without-xmlwf
    make -j"$JOBS"
    make install
    done_with expat
fi

if [ "$TARGET" = linux-amd64 ] && [ ! -f "$PREFIX/lib/libfontconfig.a" ]; then
    unpack fontconfig fontconfig-2.18.3.tar.xz
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --sysconfdir=/etc --localstatedir=/var \
        --disable-docs --disable-nls --disable-cache-build
    make -j"$JOBS"
    make install DESTDIR="$ROOT/work/fontconfig/staged"
    cp -R "$ROOT/work/fontconfig/staged$PREFIX/." "$PREFIX/"
    done_with fontconfig
fi

if [ ! -f "$PREFIX/lib/libass.a" ]; then
    unpack libass libass-0.17.5.tar.xz
    case "$TARGET" in
    # fonts through CoreText, macOS's own; no fontconfig
    darwin-arm64) FONTS=(--disable-fontconfig --disable-require-system-font-provider) ;;
    linux-amd64) FONTS=(--enable-fontconfig) ;;
    windows-amd64) FONTS=(--disable-fontconfig --enable-directwrite) ;;
    esac
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-libunibreak "${FONTS[@]}" ${CONFIGURE[@]+"${CONFIGURE[@]}"}
    make -j"$JOBS"
    make install
    done_with libass
fi

ENCODERS=libx264,libopus,png,webvtt,pcm_s16le # pcm_s16le and s16le: the tests hear where a sound falls (TestSoundShift)
MUXERS=rtsp,rtp,webvtt,image2,matroska,mp4,mov,null,pcm_s16le
PROTOCOLS=file,pipe,tcp,udp,rtp
# what stream.go and subtitles.go name; the sources (color, anullsrc; testsrc and
# sine for the tests); and what ffmpeg inserts itself: format and rate conversion,
# trimming for -ss/-t, and turning phone videos the right way up
FILTERS=drawtext,subtitles,ass,scale,pad,setsar,setpts,asetpts,overlay,split,asplit,showcqt,gblur,lagfun,vstack,colorchannelmixer
FILTERS=$FILTERS,color,anullsrc,testsrc,sine
FILTERS=$FILTERS,buffer,buffersink,abuffer,abuffersink,null,anull,copy,acopy,format,aformat,aresample,fps,trim,atrim
FILTERS=$FILTERS,adelay # the sound moved later (Item.Sound)
FILTERS=$FILTERS,transpose,hflip,vflip,crop,setparams

case "$TARGET" in
darwin-arm64)
    PLATFORM=(--extra-cflags="-I$PREFIX/include -mmacosx-version-min=13.0"
        --extra-ldflags="-L$PREFIX/lib -mmacosx-version-min=13.0" --extra-libs=-lc++
        --enable-iconv --enable-videotoolbox --enable-audiotoolbox) ;;
linux-amd64)
    PLATFORM=(--extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib -static-libgcc" --enable-iconv) ;;
windows-amd64)
    PLATFORM=(--target-os=mingw32 --arch=x86_64 --cross-prefix="$CROSS-" --enable-cross-compile --pkg-config=pkg-config
        --extra-cflags="-I$PREFIX/include" --extra-ldflags="-static -L$PREFIX/lib" --disable-iconv) ;;
esac

unpack ffmpeg ffmpeg-9.0.2.tar.xz
./configure --prefix="$PREFIX" --pkg-config-flags=--static "${PLATFORM[@]}" \
    --enable-gpl --enable-static --disable-shared --disable-debug --disable-doc \
    --disable-ffprobe --disable-ffplay --disable-autodetect \
    --enable-zlib --enable-bzlib \
    --enable-libx264 --enable-libopus --enable-libfreetype --enable-libharfbuzz --enable-libfribidi --enable-libass \
    --disable-encoders --enable-encoder="$ENCODERS" \
    --disable-muxers --enable-muxer="$MUXERS" \
    --disable-protocols --enable-protocol="$PROTOCOLS" \
    --disable-filters --enable-filter="$FILTERS" \
    --disable-devices --enable-indev=lavfi
make -j"$JOBS"
mkdir -p "$ROOT/bin"
cp "ffmpeg$EXE" "$ROOT/bin/ffmpeg$EXE"
done_with ffmpeg
FF=$ROOT/bin/ffmpeg$EXE
case "$TARGET" in
darwin-arm64)
    strip "$FF"
    if otool -L "$FF" | tail -n +2 | grep -v -q -E '^\s*/(usr/lib|System)/'; then
        echo "build/ffmpeg/bin/ffmpeg links libraries outside macOS"; otool -L "$FF"; exit 1
    fi ;;
linux-amd64)
    strip "$FF"
    OUTSIDE=$(readelf -d "$FF" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p' | grep -v -x -E 'libc\.so\.6|libm\.so\.6|libmvec\.so\.1|ld-linux-x86-64\.so\.2' || true)
    [ -z "$OUTSIDE" ] || { echo "$FF links libraries beyond glibc: $OUTSIDE"; exit 1; } ;;
windows-amd64)
    "$CROSS-strip" "$FF"
    OUTSIDE=$("$CROSS-objdump" -p "$FF" | sed -n 's/.*DLL Name: *//p' |
        grep -v -i -x -E '(kernel32|msvcrt|advapi32|user32|gdi32|ole32|oleaut32|shell32|shlwapi|ws2_32|bcrypt|secur32|psapi)\.dll|api-ms-win-crt-[a-z0-9-]+\.dll' || true)
    [ -z "$OUTSIDE" ] || { echo "$FF needs DLLs that aren't Windows' own: $OUTSIDE"; exit 1; } ;;
esac
ls -l "$FF"
