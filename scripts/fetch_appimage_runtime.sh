#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

RUNTIME=20251108
SHA256=2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d
OUT=build/appimage

if command -v sha256sum >/dev/null; then CHECK=(sha256sum -c --quiet); else CHECK=(shasum -a 256 -c --quiet); fi
fetch() {
    [ -f "$2" ] || curl -fsSL -o "$2.part" "$1"
    [ ! -f "$2.part" ] || mv "$2.part" "$2"
    echo "$3  $2" | "${CHECK[@]}" || { rm -f "$2"; echo "$(basename "$2") isn't the release it should be"; exit 1; }
}

mkdir -p "$OUT"
if [ "$(cat "$OUT/VERSION" 2>/dev/null)" != "$RUNTIME" ]; then
    rm -f "$OUT/runtime-x86_64"
fi
fetch "https://github.com/AppImage/type2-runtime/releases/download/$RUNTIME/runtime-x86_64" "$OUT/runtime-x86_64" "$SHA256"
echo "$RUNTIME" >"$OUT/VERSION"
if [ "${1:-}" = --fetch ]; then
    mkdir -p "$OUT/src"
    fetch "https://github.com/AppImage/type2-runtime/archive/refs/tags/$RUNTIME.tar.gz" "$OUT/src/type2-runtime-$RUNTIME.tar.gz" \
        4c4f6df4647c9f01f871d7edd3716d8aeeffda9d22ffbebe3fccd95a6ab52c95
    fetch https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz "$OUT/src/fuse-3.15.0.tar.xz" \
        70589cfd5e1cff7ccd6ac91c86c01be340b227285c5e200baa284e401eea2ca0
    fetch https://github.com/vasi/squashfuse/archive/0.5.2.tar.gz "$OUT/src/squashfuse-0.5.2.tar.gz" \
        db0238c5981dabbd80ee09ae15387f390091668ca060a7bc38047912491443d3
fi
echo "AppImage runtime $RUNTIME: $OUT/runtime-x86_64"
