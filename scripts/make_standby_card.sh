#!/usr/bin/env bash
# Render media/standby_opus.mp4, the card the hosting Mac's MediaMTX loops
# whenever nothing is being sent (alwaysAvailable, set up by host.go). It has to
# match what stream.go sends -- H264 1280x720 30fps, stereo 48kHz Opus -- or
# MediaMTX can't splice between the two. Needs ffmpeg with drawtext and libopus,
# and macOS's Menlo; the output is checked in, so this only runs when the card
# changes.
set -euo pipefail
# The cursor blinks by drawing the line again with '_' in place of the trailing
# space. Both start at a fixed x (11 Menlo characters at 40pt are ~265px wide)
# because tw ignores the trailing space and would centre them differently.
cd "$(dirname "$0")/.."

FONT=/System/Library/Fonts/Menlo.ttc
GREEN=0x00ff00   # host_web/host.css
mkdir -p media
ffmpeg -v error -y \
    -f lavfi -i "color=c=black:s=1280x720:r=30:d=4" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" -t 4 \
    -vf "drawtext=fontfile=$FONT:text='OPEN HOUSE PARTY':fontcolor=$GREEN:fontsize=96:x=(w-tw)/2:y=h/2-110,
         drawtext=fontfile=$FONT:text='> stand by ':fontcolor=$GREEN:fontsize=40:x=(w-265)/2:y=h/2+20,
         drawtext=fontfile=$FONT:text='> stand by_':fontcolor=$GREEN:fontsize=40:x=(w-265)/2:y=h/2+20:enable='lt(mod(t\,1)\,0.5)'" \
    -c:v libx264 -preset slow -pix_fmt yuv420p -profile:v main -level 3.1 -bf 0 -r 30 -g 30 -keyint_min 30 -sc_threshold 0 \
    -b:v 300k -c:a libopus -b:a 64k -ac 2 -ar 48000 -movflags +faststart media/standby_opus.mp4
ffmpeg -hide_banner -nostdin -i media/standby_opus.mp4 2>&1 | grep 'Stream #' || true
