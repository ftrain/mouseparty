#!/usr/bin/env bash
# Pandoc (github.com/jgm/pandoc, GPL 2 or later) as WebAssembly: its own
# release build, pinned and checked, into build/pandoc/pandoc.wasm. The app runs
# it in-process under wazero (wasm.go), and documents brought into the viewer
# page (Word, OpenOffice, PowerPoint, EPUB, HTML, LaTeX, ...) are read through it
# (pandoc.go). scripts/build_mac_app.sh copies it into the app.
#
#   scripts/fetch_pandoc.sh            the pinned build (and its licence into licenses/pandoc/)
#   scripts/fetch_pandoc.sh --fetch    and its sources, into build/pandoc/src (for a release, as the GPL asks)
set -euo pipefail
cd "$(dirname "$0")/.."

PANDOC=3.13
SHA256=234d2020a7f3a9aab387bd35df3c17ca2ba0078a82490e2b3ede890d648d64fe   # pandoc-3.13-wasm.zip
SOURCE_SHA256=fbf6044766b0c9be5ccbf18ffe657124449e8563a177d85662ecb6f031f9c308
OUT=build/pandoc
if command -v shasum >/dev/null; then CHECK=(shasum -a 256 -c --quiet); else CHECK=(sha256sum -c --quiet); fi
fetch() {
    mkdir -p "$(dirname "$2")"
    [ -f "$2" ] || curl -fsSL -o "$2.part" "$1"
    [ ! -f "$2.part" ] || mv "$2.part" "$2"
    echo "$3  $2" | "${CHECK[@]}" || { rm -f "$2"; echo "$(basename "$2") isn't the source it should be"; exit 1; }
}

if [ ! -f "$OUT/pandoc.wasm" ] || [ "$(cat "$OUT/VERSION" 2>/dev/null)" != "$PANDOC" ]; then
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    curl -fsSL -o "$TMP/pandoc.zip" "https://github.com/jgm/pandoc/releases/download/$PANDOC/pandoc-$PANDOC-wasm.zip"
    echo "$SHA256  $TMP/pandoc.zip" | "${CHECK[@]}"
    unzip -q "$TMP/pandoc.zip" -d "$TMP"
    mkdir -p "$OUT" licenses/pandoc
    mv "$TMP/pandoc-$PANDOC-wasm/pandoc.wasm" "$OUT/pandoc.wasm"
    cp "$TMP/pandoc-$PANDOC-wasm/COPYING.md" "$TMP/pandoc-$PANDOC-wasm/COPYRIGHT" licenses/pandoc/
    echo "$PANDOC" > "$OUT/VERSION"
fi
if [ "${1:-}" = "--fetch" ]; then
    { LC_ALL=C grep -a -o -E '[A-Za-z][A-Za-z0-9-]*-[0-9]+(\.[0-9]+)*-[0-9a-f]{64}' "$OUT/pandoc.wasm" || true; } | sed -E 's/-[0-9a-f]{64}$//' | sort -u |
        while read -r unit; do
            grep -q -F "/$unit.tar.gz " scripts/pandoc-sources.txt ||
                { echo "pandoc.wasm has $unit in it, and scripts/pandoc-sources.txt has no source for it"; exit 1; }
        done
    fetch "https://github.com/jgm/pandoc/archive/refs/tags/$PANDOC.tar.gz" "$OUT/src/pandoc-$PANDOC.tar.gz" "$SOURCE_SHA256"
    while read -r sum file url; do
        fetch "$url" "$OUT/src/$file" "$sum"
    done <scripts/pandoc-sources.txt
fi
echo "pandoc $PANDOC: $OUT/pandoc.wasm ($(du -h "$OUT/pandoc.wasm" | cut -f1))"
