#!/usr/bin/env bash
# Build the ffmpeg TubeYap ships: static (nothing outside macOS to link), and cut
# down to what the app uses. It still reads anything (every decoder, container
# and parser), but it writes only H.264 (x264) and Opus over RTSP, PNG (a song's
# cover) and WebVTT (subtitles for viewers), plus Matroska and MP4 for the tests;
# and it has only the filters stream.go's commands name, and the ones ffmpeg
# puts in by itself. No ffprobe, no ffplay: the app reads files with ffmpeg alone.
#
#   scripts/build_ffmpeg.sh          -> build/ffmpeg/bin/ffmpeg (Apple Silicon, macOS 13+)
#   scripts/build_ffmpeg.sh --fetch  only download and check the sources (into build/ffmpeg/src;
#                                    each release carries them, as ffmpeg's GPL asks)
#
# Sources are pinned releases, checked against their SHA-256. x264 makes the
# result GPL. Needs Xcode's command-line tools, pkg-config, meson, ninja and cmake.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD/build/ffmpeg
SRC=$ROOT/src
PREFIX=$ROOT/prefix
JOBS=$(sysctl -n hw.ncpu)
export MACOSX_DEPLOYMENT_TARGET=13.0
export CFLAGS="-O2 -mmacosx-version-min=13.0" CXXFLAGS="-O2 -mmacosx-version-min=13.0" LDFLAGS="-mmacosx-version-min=13.0"
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
)

mkdir -p "$SRC" "$PREFIX"
for s in "${SOURCES[@]}"; do
    read -r file url sum <<<"$s"
    [ -f "$SRC/$file" ] || curl -fL --progress-bar -o "$SRC/$file" "$url"
    echo "$sum  $SRC/$file" | shasum -a 256 -c --quiet || { echo "$file isn't the release it should be"; exit 1; }
done
[ "${1:-}" = --fetch ] && exit 0

# unpack: a fresh copy of a source in build/ffmpeg/work/<name>, gone again once installed
unpack() {
    rm -rf "$ROOT/work/$1" && mkdir -p "$ROOT/work/$1"
    tar -xf "$SRC/$2" -C "$ROOT/work/$1" --strip-components 1
    cd "$ROOT/work/$1"
}
done_with() { cd "$ROOT"; rm -rf "$ROOT/work/$1"; }

if [ ! -f "$PREFIX/lib/libx264.a" ]; then
    unpack x264 x264-b35605ac.tar.bz2
    ./configure --prefix="$PREFIX" --enable-static --enable-pic --disable-cli --disable-opencl
    make -j"$JOBS" && make install
    done_with x264
fi

if [ ! -f "$PREFIX/lib/libopus.a" ]; then
    unpack opus opus-1.5.2.tar.gz
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-doc --disable-extra-programs
    make -j"$JOBS" && make install
    done_with opus
fi

if [ ! -f "$PREFIX/lib/libfreetype.a" ]; then
    unpack freetype freetype-2.15.0.tar.xz
    cmake -S . -B out -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" -DBUILD_SHARED_LIBS=OFF \
        -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 -DFT_DISABLE_ZLIB=ON -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_PNG=ON \
        -DFT_DISABLE_HARFBUZZ=ON -DFT_DISABLE_BROTLI=ON -DFT_DISABLE_HVF=ON   # HVF: Apple's SDK has the header, not the library
    ninja -C out install
    done_with freetype
fi

if [ ! -f "$PREFIX/lib/libfribidi.a" ]; then
    unpack fribidi fribidi-1.0.17.tar.xz
    meson setup out --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
        -Ddocs=false -Dbin=false -Dtests=false
    ninja -C out install
    done_with fribidi
fi

if [ ! -f "$PREFIX/lib/libharfbuzz.a" ]; then
    unpack harfbuzz harfbuzz-15.0.0.tar.xz
    meson setup out --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
        -Dfreetype=enabled -Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dicu=disabled \
        -Dgraphite2=disabled -Dintrospection=disabled -Dtests=disabled -Ddocs=disabled -Dutilities=disabled -Dbenchmark=disabled
    ninja -C out install
    done_with harfbuzz
fi

if [ ! -f "$PREFIX/lib/libass.a" ]; then
    unpack libass libass-0.17.5.tar.xz
    # fonts through CoreText, macOS's own; no fontconfig
    ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-fontconfig --disable-libunibreak \
        --disable-require-system-font-provider
    make -j"$JOBS" && make install
    done_with libass
fi

ENCODERS=libx264,libopus,png,webvtt
MUXERS=rtsp,rtp,webvtt,image2,matroska,mp4,mov,null
PROTOCOLS=file,pipe,tcp,udp,rtp
# what stream.go and subtitles.go name; the sources (color, anullsrc; testsrc and
# sine for the tests); and what ffmpeg inserts itself: format and rate conversion,
# trimming for -ss/-t, and turning phone videos the right way up
FILTERS=drawtext,subtitles,ass,scale,pad,setsar,setpts,asetpts,overlay,split,asplit,showcqt,blend,colorchannelmixer
FILTERS=$FILTERS,color,anullsrc,testsrc,sine
FILTERS=$FILTERS,buffer,buffersink,abuffer,abuffersink,null,anull,copy,acopy,format,aformat,aresample,fps,trim,atrim
FILTERS=$FILTERS,transpose,hflip,vflip,crop,setparams

unpack ffmpeg ffmpeg-9.0.2.tar.xz
./configure --prefix="$PREFIX" --pkg-config-flags=--static \
    --extra-cflags="-I$PREFIX/include -mmacosx-version-min=13.0" \
    --extra-ldflags="-L$PREFIX/lib -mmacosx-version-min=13.0" --extra-libs=-lc++ \
    --enable-gpl --enable-static --disable-shared --disable-debug --disable-doc \
    --disable-ffprobe --disable-ffplay --disable-autodetect \
    --enable-zlib --enable-bzlib --enable-iconv --enable-videotoolbox --enable-audiotoolbox \
    --enable-libx264 --enable-libopus --enable-libfreetype --enable-libharfbuzz --enable-libfribidi --enable-libass \
    --disable-encoders --enable-encoder="$ENCODERS" \
    --disable-muxers --enable-muxer="$MUXERS" \
    --disable-protocols --enable-protocol="$PROTOCOLS" \
    --disable-filters --enable-filter="$FILTERS" \
    --disable-devices --enable-indev=lavfi
make -j"$JOBS"
mkdir -p "$ROOT/bin"
cp ffmpeg "$ROOT/bin/ffmpeg"
done_with ffmpeg
strip "$ROOT/bin/ffmpeg"
if otool -L "$ROOT/bin/ffmpeg" | tail -n +2 | grep -v -q -E '^\s*/(usr/lib|System)/'; then
    echo "build/ffmpeg/bin/ffmpeg links libraries outside macOS"; otool -L "$ROOT/bin/ffmpeg"; exit 1
fi
ls -l "$ROOT/bin/ffmpeg"
