#!/usr/bin/env bash
# Build the Python Mouse Party runs Datasette with (datasette.go): CPython for
# WASI (WebAssembly), run inside the app by wazero (wasm.go), with SQLite and
# zlib compiled in (CPython's own WASI build leaves sqlite3 and zlib out: it has
# neither to link), and Datasette and what it needs, all pure Python.
#
#   scripts/build_python.sh          -> build/python/dist: python.wasm, lib/python3.15 (the standard
#                                       library, compiled), site/ (Datasette and the rest), VERSION
#   scripts/build_python.sh --fetch  only download and check the sources (into build/python/src;
#                                    each release carries them)
#   scripts/build_python.sh --tag    the name of a build from these sources (and --stamp, its whole stamp)
#
# Mostly it isn't run: scripts/fetch_python.sh downloads the build published from it
# (the "Python for WebAssembly" workflow), checked against its pinned SHA-256. This is
# the recipe, run to make a new one when a version here or a package moves.
#
# Sources are pinned releases, checked against their SHA-256: CPython, SQLite's
# amalgamation, zlib, and the WASI SDK (clang for WebAssembly) that builds them, the
# one for this machine. The Python packages are pinned, each with its file's hash,
# in scripts/python-requirements.txt. CPython's Platforms/WASI builds a native
# Python first, which this uses to compile the standard library and to install the
# packages. What it makes is WebAssembly, the same whichever machine built it: an
# Apple Silicon Mac (Xcode's command-line tools) or Linux on x86-64 or ARM (a C
# compiler, make and python3), as the Linux tests' CI does.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD/build/python
SRC=$ROOT/src
OUT=$ROOT/dist

PY=3.15.2
SQLITE=3540100
ZLIB=1.3.2
SDK=33
case "$(uname -s)-$(uname -m)" in   # the WASI SDK runs here, so it's this machine's (WASI SDK publishes no sums: these are the files as downloaded)
Darwin-arm64) SDK_HOST=arm64-macos SDK_SUM=85c997a2665ead91673b5bb88b7d0df3fc8900df3bfa244f720d478187bbdc78 ;;
Linux-x86_64) SDK_HOST=x86_64-linux SDK_SUM=0ba8b5bfaeb2adf3f29bab5841d76cf5318ab8e1642ea195f88baba1abd47bce ;;
Linux-aarch64 | Linux-arm64) SDK_HOST=arm64-linux SDK_SUM=4f98ee738c7abb45c81a94d1461fc53cc569d1cd01498951c8184d841a027844 ;;
*) echo "No WASI SDK pinned for $(uname -s) $(uname -m)"; exit 1 ;;
esac
SOURCES=(
    "Python-$PY.tar.xz https://www.python.org/ftp/python/$PY/Python-$PY.tar.xz 8b5536d280142ecf6cdfe15d12a21ba1c65e300bbf7b28a8d0cdb849575797de"
    "sqlite-amalgamation-$SQLITE.zip https://www.sqlite.org/2026/sqlite-amalgamation-$SQLITE.zip 0a9c8e34352dad46006aa82836d5383bff9dc6bc9ce5a60553c05aa30e6ad1f9"
    "zlib-$ZLIB.tar.gz https://github.com/madler/zlib/releases/download/v$ZLIB/zlib-$ZLIB.tar.gz bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16"
    "wasi-sdk-$SDK.0-$SDK_HOST.tar.gz https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$SDK/wasi-sdk-$SDK.0-$SDK_HOST.tar.gz $SDK_SUM"
)

STAMP="$PY sqlite $SQLITE zlib $ZLIB sdk $SDK $(shasum -a 256 "$0" | cut -c1-12)"   # what CPython is built from
READY="$STAMP $(cat scripts/python-requirements.txt scripts/python-build-requirements.txt | shasum -a 256 | cut -c1-12)"   # and what's installed in it
case "${1:-}" in   # what a build from these sources is called, without building (scripts/fetch_python.sh, the release workflow)
--stamp) echo "$READY"; exit 0 ;;
--tag) echo "python-wasm-$PY-$(printf %s "$READY" | shasum -a 256 | cut -c1-12)"; exit 0 ;;
esac

mkdir -p "$SRC"
for s in "${SOURCES[@]}"; do
    read -r file url sum <<<"$s"
    [ -f "$SRC/$file" ] || curl -fL --progress-bar -o "$SRC/$file" "$url"
    echo "$sum  $SRC/$file" | shasum -a 256 -c --quiet
done
[ "${1:-}" = "--fetch" ] && exit 0

if [ "$(cat "$OUT/VERSION" 2>/dev/null)" = "$READY" ]; then
    echo "Python $PY is built: $OUT"
    exit 0
fi

# the WASI SDK: clang, and a C library for WebAssembly
WASI_SDK=$ROOT/wasi-sdk-$SDK.0-$SDK_HOST
[ -d "$WASI_SDK" ] || tar -xzf "$SRC/wasi-sdk-$SDK.0-$SDK_HOST.tar.gz" -C "$ROOT"
xattr -dr com.apple.quarantine "$WASI_SDK" 2>/dev/null || true
CC="$WASI_SDK/bin/clang --target=wasm32-wasip1 --sysroot=$WASI_SDK/share/wasi-sysroot"

CP=$ROOT/Python-$PY
HOST=$CP/cross-build/wasm32-wasip1
if [ "$(cat "$ROOT/cpython.stamp" 2>/dev/null)" != "$STAMP" ] || [ ! -f "$HOST/python.wasm" ]; then

# SQLite, one file, for WASI (SQLite builds for it as it is: no locking, no WAL, no shared memory there).
# No threads (CPython's WASI has none), no extensions loaded, and the features Datasette uses
SQ=$ROOT/sqlite
rm -rf "$SQ" && mkdir -p "$SQ"
unzip -q -j "$SRC/sqlite-amalgamation-$SQLITE.zip" -d "$SQ"
$CC -O2 -c "$SQ/sqlite3.c" -o "$SQ/sqlite3.o" \
    -DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_OMIT_WAL -DSQLITE_DEFAULT_MEMSTATUS=0 \
    -DSQLITE_ENABLE_FTS5 -DSQLITE_ENABLE_FTS4 -DSQLITE_ENABLE_RTREE -DSQLITE_ENABLE_MATH_FUNCTIONS \
    -DSQLITE_ENABLE_DBSTAT_VTAB -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_PROCESS_CLOCKS
"$WASI_SDK/bin/llvm-ar" rcs "$SQ/libsqlite3.a" "$SQ/sqlite3.o"

# zlib, which Python's gzip and zlib (and so httpx, and so Datasette) need
ZL=$ROOT/zlib
rm -rf "$ZL" "$ROOT/zlib-$ZLIB" && tar -xzf "$SRC/zlib-$ZLIB.tar.gz" -C "$ROOT" && mv "$ROOT/zlib-$ZLIB" "$ZL"
for c in adler32 compress crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil; do
    $CC -O2 -DZ_HAVE_UNISTD_H -c "$ZL/$c.c" -o "$ZL/$c.o"   # what its configure would say
done
"$WASI_SDK/bin/llvm-ar" rcs "$ZL/libz.a" "$ZL"/*.o

# CPython: its own WASI build, told where SQLite and zlib are. The runner it would use to
# check python.wasm (wasmtime) isn't needed: wazero runs it here, below
rm -rf "$CP" && tar -xf "$SRC/Python-$PY.tar.xz" -C "$ROOT"
(
    cd "$CP"
    python3 Platforms/WASI build-python --quiet   # the native Python, first (none of WASI's libraries)
    python3 Platforms/WASI build-host --quiet --wasi-sdk "$WASI_SDK" --host-runner "true" -- \
        "LIBSQLITE3_CFLAGS=-I$SQ" "LIBSQLITE3_LIBS=-L$SQ -lsqlite3 -lwasi-emulated-getpid -lwasi-emulated-process-clocks" \
        "ZLIB_CFLAGS=-I$ZL" "ZLIB_LIBS=-L$ZL -lz"
)
[ -f "$HOST/python.wasm" ] || { echo "no python.wasm"; exit 1; }
for m in _sqlite3 zlib; do
    grep -q "^$m " "$HOST/Modules/Setup.stdlib" || { echo "CPython was built without $m"; exit 1; }
done
echo "$STAMP" > "$ROOT/cpython.stamp"
fi
# the native Python CPython built first: python.exe on a Mac, python on Linux
# (ls fails on the one that isn't there: with pipefail, that would end the script, silently)
BUILD_PY=$(ls "$CP"/cross-build/*/python.exe "$CP"/cross-build/*/python 2>/dev/null | grep -v /wasm32- | head -1 || true)
[ -x "$BUILD_PY" ] || { echo "no native Python in $CP/cross-build"; exit 1; }

# what ships: python.wasm, the standard library (less what can't run here or isn't wanted) compiled, and the packages
rm -rf "$OUT" && mkdir -p "$OUT/lib"
cp "$HOST/python.wasm" "$OUT/"
LIB=$OUT/lib/python3.15
cp -R "$CP/Lib" "$LIB"
rm -rf "$LIB"/{test,idlelib,tkinter,turtledemo,ensurepip,venv,lib2to3,pydoc_data} "$LIB"/__phello__ 2>/dev/null || true
find "$LIB" -name '__pycache__' -prune -exec rm -rf {} +
mkdir -p "$LIB/lib-dynload"
cp "$HOST"/build/lib.wasi-wasm32-*/_sysconfigdata*.py "$LIB/" 2>/dev/null || cp "$HOST"/build/lib.*/_sysconfigdata*.py "$LIB/"
"$BUILD_PY" -m pip --version >/dev/null 2>&1 || "$BUILD_PY" -m ensurepip >/dev/null
# every file checked against its hash; markupsafe's and pyyaml's from their source, with setuptools (hash-checked
# too) already in the native Python, so building them fetches nothing (no build isolation)
"$BUILD_PY" -m pip install --quiet --require-hashes -r scripts/python-build-requirements.txt
"$BUILD_PY" -m pip install --quiet --no-compile --no-deps --require-hashes --no-binary markupsafe,pyyaml \
    --no-build-isolation --target "$OUT/site" -r scripts/python-requirements.txt
find "$OUT/site" \( -name '*.so' -o -name '*.dylib' \) -delete   # native speedups: their pure-Python twins run instead
rm -rf "$OUT/site/bin"
"$BUILD_PY" -m compileall -q -j0 "$LIB" "$OUT/site" >/dev/null
cp "$CP/LICENSE" "$OUT/LICENSE-Python"

# every licence of what's in it, into licenses/python (the app carries that folder): CPython, SQLite, zlib, the
# WASI C library compiled into python.wasm (at the commit wasi-sdk $SDK has), and each package's own
L=licenses/python
rm -rf "$L" && mkdir -p "$L/packages" "$L/wasi-libc"
cp "$CP/LICENSE" "$L/CPython-LICENSE"
cp "$ZL/LICENSE" "$L/zlib-LICENSE"
echo "SQLite is in the public domain: https://www.sqlite.org/copyright.html" > "$L/SQLite-LICENSE"
WASI_LIBC=161b3195fc2558d2b1ba3eb9ffae3b2b47407623
for f in LICENSE LICENSE-APACHE LICENSE-APACHE-LLVM LICENSE-MIT; do
    curl -fsSL -o "$L/wasi-libc/$f" "https://raw.githubusercontent.com/WebAssembly/wasi-libc/$WASI_LIBC/$f"
done
for d in "$OUT"/site/*.dist-info; do
    n=$(basename "$d" .dist-info)
    mkdir -p "$L/packages/$n"
    find "$d" \( -iname '*licen[cs]e*' -o -iname '*copying*' -o -iname '*notice*' -o -iname '*authors*' \) -type f -exec cp {} "$L/packages/$n/" \;
    [ -n "$(ls -A "$L/packages/$n")" ] || grep -i "^License" "$d/METADATA" > "$L/packages/$n/LICENSE-from-METADATA"
done
echo "$READY" > "$OUT/VERSION"
echo "Built $OUT ($(du -sh "$OUT" | cut -f1))"
