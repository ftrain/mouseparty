#!/usr/bin/env bash
# Everything a working tree needs, from a clone, in order; then what's ready and
# what isn't. Run it again whenever: each step does nothing if its piece is
# already built at its pinned version.
#
#   scripts/setup.sh          all of it (the first time, the Python takes a while, and ffmpeg on a Mac)
#   scripts/setup.sh --quick  not the Python for Datasette, nor ffmpeg (their tests skip, saying so)
#
# The pieces, each pinned and checked by its own script:
#   the pages' tools and build    scripts/build_web.sh     (Node 24, package-lock.json)
#   MediaMTX and cloudflared      scripts/fetch_tools.sh   -> build/tools
#   pandoc as WebAssembly         scripts/fetch_pandoc.sh  -> build/pandoc
#   Python with Datasette, WASM   scripts/fetch_python.sh  -> build/python/dist (its published build;
#                                 scripts/build_python.sh is the recipe)
#   ffmpeg (the app's own; Mac)   scripts/build_ffmpeg.sh  -> build/ffmpeg/bin
# Then scripts/test.sh tests it all, and scripts/build_mac_app.sh builds the app.
set -euo pipefail
cd "$(dirname "$0")/.."
quick=${1:-}

need() { command -v "$1" >/dev/null || { echo "Needs $1: $2"; exit 1; }; }
need go "https://go.dev/dl (go.mod says which)"
need node "Node 24 or later, https://nodejs.org"
need curl "curl"

echo "== the pages (TypeScript: checked and built)"
scripts/build_web.sh
echo "== MediaMTX and cloudflared"
scripts/fetch_tools.sh
echo "== pandoc"
scripts/fetch_pandoc.sh
if [ "$quick" != --quick ]; then
    echo "== Python with Datasette (downloaded; built, a long while, only if none is published)"
    scripts/fetch_python.sh --or-build
    if [ "$(uname -s)" = Darwin ] && [ ! -x build/ffmpeg/bin/ffmpeg ]; then
        echo "== ffmpeg, the app's own (the first time: about 10 minutes)"
        scripts/build_ffmpeg.sh
    fi
fi

# what's here now
ok() { printf '  %-28s %s\n' "$1" "$2"; }
echo
echo "Ready:"
ok "MediaMTX, cloudflared" "$(cat build/tools/VERSION)"
ok "pandoc" "$(cat build/pandoc/VERSION)"
if [ -f build/python/dist/python.wasm ]; then ok "Python with Datasette" "build/python/dist"; else ok "Python with Datasette" "MISSING: scripts/fetch_python.sh (Datasette's tests skip)"; fi
FF=$(PATH="$PWD/build/ffmpeg/bin:$PATH" command -v ffmpeg || true)
if [ -z "$FF" ]; then
    ok "ffmpeg" "MISSING: scripts/build_ffmpeg.sh on a Mac, or your system's (apt install ffmpeg)"
elif ! grep -q ' drawtext ' <<<"$("$FF" -hide_banner -filters 2>/dev/null)"; then   # read whole: grep -q stops early, and pipefail counts ffmpeg's broken pipe
    ok "ffmpeg" "$FF has no drawtext: the cards fail with it (scripts/build_ffmpeg.sh)"
else
    ok "ffmpeg" "$FF"
fi
if node -e "require.resolve('playwright')" 2>/dev/null; then
    ok "Playwright" "$(node -p "require('playwright/package.json').version") (the pages in a browser)"
else
    ok "Playwright" "MISSING, for the pages in a browser (browser_test.go):"
    ok "" "npm install -g playwright@1.63.0 && npx playwright@1.63.0 install chromium"
fi
echo
echo "Then: scripts/test.sh, and scripts/build_mac_app.sh on a Mac."
