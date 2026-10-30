#!/usr/bin/env bash
# Build the two pages from their TypeScript (web/): the viewer page into
# host_web/ and the Mac app's window into frontend/, where the Go app embeds
# them (vite.config.ts). Checks them first: tsc --noEmit, strict, and Prettier.
# Needs Node 24 or later; the tools are pinned in package-lock.json and not
# shipped. What it builds is checked in, so Go alone builds the app from a clone;
# scripts/test.sh and scripts/build_mac_app.sh run this so it's never stale.
set -euo pipefail
cd "$(dirname "$0")/.."

# the tools, again whenever package-lock.json is newer than what's installed
[ node_modules/.package-lock.json -nt package-lock.json ] || npm ci --no-audit --no-fund
npm run -s lint    # tsc --noEmit && prettier --check .
npm run -s build
