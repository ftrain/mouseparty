#!/usr/bin/env bash
# Vet and test everything, then TubeYap's own self-test: it hosts on free ports
# (never the router, never touching a session that's running), checks the viewer
# page, the stand-by stream and the WebRTC handshake, and publishes a countdown.
# The play-through test and the self-test need ffmpeg (with drawtext) and
# mediamtx; the app's own (scripts/build_ffmpeg.sh) is used when it's built.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x build/ffmpeg/bin/ffmpeg ]; then export PATH="$PWD/build/ffmpeg/bin:$PATH"; fi

go vet ./...
go test ./... "$@"
go run . --selftest
