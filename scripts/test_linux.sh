#!/usr/bin/env bash
# The focused Linux CI check. Uses checked-in web assets, no window or browser.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $(uname -s) != Linux || $(id -u) == 0 ]]; then
    echo "Run this check as a non-root user on Linux." >&2
    exit 1
fi

pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
bwrap --version
ffmpeg -version | sed -n '1p'
scripts/fetch_tools.sh
export PATH="$PWD/build/tools:$PATH"
mediamtx --version

# WebKitGTK 4.1 on current Linux distributions; the Wails module is pinned in go.mod.
export CGO_ENABLED=1
tags=desktop,production,webkit2_41
go vet -tags "$tags" ./...
go test -json -count=1 -tags "$tags" ./apps | NO_SKIPS=1 ALLOW_SKIPS='' go run ./scripts/testreport

tests=(
    TestLinuxViewerIsolation
    TestLinuxViewerRequiresBubblewrap
    TestLinuxOfflineFFmpegIsolation
    TestLinuxOfflineFFmpegRequiresRegularFile
    TestLinuxOfflineFFmpegNoFallback
    TestLinuxOfflineFFmpegMedia
    TestLinuxToolBoxes
    TestLinuxToolsRequireBubblewrap
    TestLinuxPublishFFmpegIsolation
    TestLinuxPublishFFmpegRequiresRegularFile
    TestLinuxPublishFFmpegNoFallback
    TestLinuxPlayerStopsGracefully
    TestLinuxExtractCover
    TestTheSiteInItsOwnProcess
)
pattern=$(IFS='|'; echo "${tests[*]}")
go test -json -count=1 -timeout=2m -tags "$tags" -run "^($pattern)$" . |
    NO_SKIPS=1 ALLOW_SKIPS='' go run ./scripts/testreport "${tests[@]}"

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/home" "$scratch/tmp"
go build -trimpath -tags "$tags" -o "$scratch/MouseParty" .

# No user settings, display, or optional tools discovered relative to the checkout.
cd "$scratch"
env -i HOME="$scratch/home" TMPDIR="$scratch/tmp" PATH="$PATH" \
    timeout --kill-after=5s 2m "$scratch/MouseParty" --selftest
