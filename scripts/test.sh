#!/usr/bin/env bash
# Check and build the pages (scripts/build_web.sh: tsc, Prettier, Vite), vet and
# test everything, then Mouse Party's own self-test: it hosts on free ports
# (never the router, never touching a session that's running), checks the viewer
# page, the stand-by stream and the WebRTC handshake, and publishes a countdown.
# The play-through test and the self-test need ffmpeg (with drawtext) and
# mediamtx: the pinned MediaMTX (scripts/fetch_tools.sh), and the app's own
# ffmpeg (scripts/build_ffmpeg.sh) when it's built.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x build/ffmpeg/bin/ffmpeg ]; then export PATH="$PWD/build/ffmpeg/bin:$PATH"; fi
scripts/fetch_tools.sh               # MediaMTX and cloudflared, pinned (build/tools)
export PATH="$PWD/build/tools:$PATH"

scripts/build_web.sh                 # the pages, typed and built, before Go embeds them
scripts/fetch_pandoc.sh >/dev/null   # pandoc.wasm, for reading documents (pandoc_test.go)

go vet ./...
# every package as it finishes, the output of what failed, and what skipped and why
# (scripts/testreport): with NO_SKIPS=1, as CI sets, a skip fails it (ALLOW_SKIPS lets some)
go test -json ./... "$@" | go run ./scripts/testreport
go run . --selftest
