#!/usr/bin/env bash
# Pandoc (github.com/jgm/pandoc, GPL 2 or later) as WebAssembly: its own
# release build, pinned and checked, into build/pandoc/pandoc.wasm. The app runs
# it in-process under wazero (wasm.go), and documents brought into the viewer
# page (Word, OpenOffice, PowerPoint, EPUB, HTML, LaTeX, ...) are read through it
# (pandoc.go). scripts/build_mac_app.sh copies it into the app.
#
#   scripts/fetch_pandoc.sh            the pinned build (and its licence into licenses/pandoc/)
#   scripts/fetch_pandoc.sh --fetch    and its exact sources, into build/pandoc/src (for a release, as the GPL asks)
set -euo pipefail
cd "$(dirname "$0")/.."

PANDOC=3.13
SHA256=234d2020a7f3a9aab387bd35df3c17ca2ba0078a82490e2b3ede890d648d64fe   # pandoc-3.13-wasm.zip
OUT=build/pandoc

if [ ! -f "$OUT/pandoc.wasm" ] || [ "$(cat "$OUT/VERSION" 2>/dev/null)" != "$PANDOC" ]; then
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    curl -fsSL -o "$TMP/pandoc.zip" "https://github.com/jgm/pandoc/releases/download/$PANDOC/pandoc-$PANDOC-wasm.zip"
    echo "$SHA256  $TMP/pandoc.zip" | shasum -a 256 -c --quiet
    unzip -q "$TMP/pandoc.zip" -d "$TMP"
    mkdir -p "$OUT" licenses/pandoc
    mv "$TMP/pandoc-$PANDOC-wasm/pandoc.wasm" "$OUT/pandoc.wasm"
    cp "$TMP/pandoc-$PANDOC-wasm/COPYING.md" "$TMP/pandoc-$PANDOC-wasm/COPYRIGHT" licenses/pandoc/
    echo "$PANDOC" > "$OUT/VERSION"
fi
if [ "${1:-}" = "--fetch" ]; then
    mkdir -p "$OUT/src"
    curl -fsSL -o "$OUT/src/pandoc-$PANDOC.tar.gz" "https://github.com/jgm/pandoc/archive/refs/tags/$PANDOC.tar.gz"
fi
echo "pandoc $PANDOC: $OUT/pandoc.wasm ($(du -h "$OUT/pandoc.wasm" | cut -f1))"
