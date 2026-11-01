#!/usr/bin/env bash
# The Python Datasette runs on (datasette.go), as WebAssembly: downloaded, not
# built. scripts/build_python.sh is the recipe; the "Python for WebAssembly"
# workflow (.github/workflows/python-wasm.yml) builds it, tests Datasette on it,
# and publishes it as a release of this repo named after exactly what it was
# built from (build_python.sh --tag). Here it's fetched, checked against the
# SHA-256 pinned below, into build/python/dist. WebAssembly runs anywhere, so
# one build serves every machine.
#
#   scripts/fetch_python.sh             the pinned build; fails if there's none, or it's stale
#   scripts/fetch_python.sh --or-build  or, when there's none to fetch, build it here
#
# A release is stale when build_python.sh, its versions or its packages have
# changed since it was built (its tag no longer matches): run the workflow, and
# put its tag and SHA-256 here (it prints both).
set -euo pipefail
cd "$(dirname "$0")/.."

TAG=      # python-wasm-<version>-<what it was built from>, from the workflow
SHA256=   # of <TAG>.tar.gz
REPO=ftrain/mouseparty
OUT=build/python/dist

fallback() { # why there's nothing to fetch: build it instead, if asked to
    if [ "${1:-}" = --or-build ]; then
        echo "$2: building it here (scripts/build_python.sh)"
        exec scripts/build_python.sh
    fi
    echo "$2. Run the \"Python for WebAssembly\" workflow and pin what it prints here, or build it: scripts/build_python.sh (or this with --or-build)"
    exit 1
}

want=$(scripts/build_python.sh --tag)
[ -n "$TAG" ] || fallback "${1:-}" "No Python release is pinned in scripts/fetch_python.sh"
[ "$TAG" = "$want" ] || fallback "${1:-}" "The pinned Python ($TAG) was built from other sources than build_python.sh now says ($want)"
if [ "$(cat "$OUT/RELEASE" 2>/dev/null)" = "$TAG" ] && [ -f "$OUT/python.wasm" ]; then
    exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$TAG.tar.gz" "https://github.com/$REPO/releases/download/$TAG/$TAG.tar.gz"
echo "$SHA256  $TMP/$TAG.tar.gz" | shasum -a 256 -c --quiet || { echo "$TAG.tar.gz isn't the build it should be"; exit 1; }
tar -xzf "$TMP/$TAG.tar.gz" -C "$TMP"   # dist/, checked before it replaces what's there
[ "$(cat "$TMP/dist/VERSION" 2>/dev/null)" = "$(scripts/build_python.sh --stamp)" ] || { echo "$TAG holds a build of other sources"; exit 1; }
echo "$TAG" > "$TMP/dist/RELEASE"
rm -rf "$OUT" && mkdir -p "$(dirname "$OUT")" && mv "$TMP/dist" "$OUT"
echo "Python for Datasette: $TAG in $OUT ($(du -sh "$OUT" | cut -f1))"
