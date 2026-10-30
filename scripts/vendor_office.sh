#!/usr/bin/env bash
# Build Tiny Little Office's editors (github.com/aboard-io/tinylittleoffice, MIT)
# from a pinned commit into host_web/office/: the documents on the viewer page
# (apps/office.go, host_web/apps/office.js) are drawn by them. Needs Node 24 or
# later and git. The output is checked in, so this runs only to move the pin:
#
#   scripts/vendor_office.sh               the pinned commit
#   TLO_REF=<commit or branch> scripts/vendor_office.sh
#   TLO_SRC=<a checkout> scripts/vendor_office.sh   one already there (and built
#                                          or not), for working on both at once
#
# What the build bundles (Lit, Lucide, MapLibre, mathjs, Fluent and their own)
# is listed with its licences in licenses/tinylittleoffice/dependencies.md, copied
# from the same commit; the fonts' licence (OFL) travels in office/fonts/.
set -euo pipefail
cd "$(dirname "$0")/.."

TLO_REPO=https://github.com/aboard-io/tinylittleoffice
TLO_REF=${TLO_REF:-d42992307a8b6fe7c0597450fc212a85c314ff7e}   # its office branch: v2 and the Pinboard

if [ -n "${TLO_SRC:-}" ]; then
    SRC=$TLO_SRC
else
    SRC=$(mktemp -d)/tinylittleoffice
    trap 'rm -rf "$(dirname "$SRC")"' EXIT
    git clone --quiet --filter=blob:none "$TLO_REPO" "$SRC"
    git -C "$SRC" checkout --quiet "$TLO_REF"
fi
COMMIT=$(git -C "$SRC" rev-parse HEAD)
( cd "$SRC" && { [ -d node_modules ] || npm ci --no-audit --no-fund --ignore-scripts; } && npm run -s build:lib )

OUT=host_web/office
rm -rf "$OUT"
mkdir -p "$OUT"
# the editors, their stylesheet, what they fetch when asked for, the fonts, and
# the kernel (doc.js: what carries one person's changes over another's, which the
# editors hold but don't export); not the types or the command line
cp "$SRC/packages/doc/dist/editors.js" "$SRC/packages/doc/dist/editors.css" "$SRC/packages/doc/dist/doc.js" "$OUT/"
cp -R "$SRC/packages/doc/dist/editors" "$SRC/packages/doc/dist/fonts" "$OUT/"
echo "$TLO_REPO/commit/$COMMIT" > "$OUT/SOURCE.txt"

mkdir -p licenses/tinylittleoffice
cp "$SRC/LICENSE" licenses/tinylittleoffice/LICENSE
cp "$SRC/docs/dependencies.md" licenses/tinylittleoffice/dependencies.md
echo "Built $OUT from $COMMIT ($(du -sh "$OUT" | cut -f1))"
