#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

DEJAVU=2.37
SHA256=fa9ca4d13871dd122f61258a80d01751d603b4d3ee14095d65453b4e846e17d7
OUT=build/fonts

if [ ! -f "$OUT/DejaVuSansMono.ttf" ] || [ "$(cat "$OUT/VERSION" 2>/dev/null)" != "$DEJAVU" ]; then
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    curl -fsSL -o "$TMP/dejavu.tar.bz2" \
        "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_${DEJAVU//./_}/dejavu-fonts-ttf-$DEJAVU.tar.bz2"
    if command -v shasum >/dev/null; then CHECK=(shasum -a 256 -c --quiet); else CHECK=(sha256sum -c --quiet); fi
    echo "$SHA256  $TMP/dejavu.tar.bz2" | "${CHECK[@]}" || { echo "dejavu-fonts-ttf-$DEJAVU.tar.bz2 isn't the release it should be"; exit 1; }
    tar -xjf "$TMP/dejavu.tar.bz2" -C "$TMP"
    mkdir -p "$OUT" licenses/dejavu
    cp "$TMP/dejavu-fonts-ttf-$DEJAVU/ttf/DejaVuSansMono.ttf" "$OUT/"
    cp "$TMP/dejavu-fonts-ttf-$DEJAVU/LICENSE" licenses/dejavu/
    echo "$DEJAVU" >"$OUT/VERSION"
fi
echo "DejaVu Sans Mono $DEJAVU: $OUT/DejaVuSansMono.ttf"
