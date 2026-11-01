#!/usr/bin/env bash
# Fuzz the command graph (docs/commands.md, docs/testing.md): each fuzzer in
# turn, for a while each, searching past the seeds `go test` runs. What fails
# is kept in testdata/fuzz/<Fuzzer>/ (and apps/testdata/fuzz/), where plain
# `go test` runs it again from then on: commit it with the fix.
#
#   scripts/fuzz.sh            each for 2 minutes
#   FUZZTIME=30m scripts/fuzz.sh
#   scripts/fuzz.sh FuzzApps   just that one
#
# Then the pages in a browser (browser_test.go, web/e2e/browser.cjs), walked
# again with a new seed each time for FUZZBROWSERTIME (FUZZTIME if not set),
# when node has Playwright. A failing seed is printed: BROWSER_SEED=<it> go test
# -run TestBrowser -v . walks it again.
#
# FuzzWindow hosts for real (ffmpeg and MediaMTX, free ports, a temporary HOME,
# never the router): a walk takes seconds, where the others do thousands a
# second, so it runs one walk at a time (they share the clock with ffmpeg) for
# FUZZWINDOWTIME (FUZZTIME if not set).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x build/ffmpeg/bin/ffmpeg ]; then export PATH="$PWD/build/ffmpeg/bin:$PATH"; fi
FUZZTIME="${FUZZTIME:-2m}"

run() { # package, fuzzer, how long, anything more for go test
    echo "== $2 ($3)"
    # -fuzzminimizetime: shrinking a new input replays it thousands of times; without
    # a limit a slow walk holds the search up for minutes
    go test "$1" -run '^$' -fuzz "^$2\$" -fuzztime "$3" -fuzzminimizetime 5s "${@:4}"
}

only="${1:-}"
want() { [ -z "$only" ] || [ "$only" = "$1" ]; }
want FuzzApps && run ./apps FuzzApps "$FUZZTIME"
want FuzzSocket && run . FuzzSocket "$FUZZTIME"
if want FuzzWindow; then
    if command -v mediamtx >/dev/null && command -v ffmpeg >/dev/null; then
        run . FuzzWindow "${FUZZWINDOWTIME:-$FUZZTIME}" -parallel 1
    else
        echo "== FuzzWindow: skipped, needs ffmpeg and mediamtx"
    fi
fi
if want Browser; then
    if node -e "require.resolve('playwright')" 2>/dev/null && command -v mediamtx >/dev/null && command -v ffmpeg >/dev/null; then
        budget="${FUZZBROWSERTIME:-$FUZZTIME}"
        end=$(( $(date +%s) + $(go run ./scripts/seconds "$budget") ))
        walks=0
        while [ "$(date +%s)" -lt "$end" ]; do
            seed=$(( RANDOM * 32768 + RANDOM ))
            echo "== the pages in a browser, seed $seed"
            BROWSER_SEED=$seed go test . -run '^TestBrowser$' -count=1 || { echo "BROWSER_SEED=$seed go test -run TestBrowser -v . walks it again"; exit 1; }
            walks=$((walks + 1))
        done
        echo "== the pages in a browser: $walks walks"
    else
        echo "== the pages in a browser: skipped, needs node with Playwright, ffmpeg and mediamtx"
    fi
fi
