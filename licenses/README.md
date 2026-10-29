# What TubeYap is made of, and under what licences

TubeYap's own code is under the MIT licence (`../LICENSE`). The app also ships,
or is built from, the work below. Each folder here holds that work's licence as
its authors publish it, and the built app carries this whole folder in
`TubeYap.app/Contents/Resources/Licenses`.

## Programs bundled in the app

| | Version | Licence | Source |
|---|---|---|---|
| **ffmpeg**, TubeYap's own build (`scripts/build_ffmpeg.sh`) | 9.0.2 | **GPL-2.0-or-later** as built (it includes x264); FFmpeg itself is LGPL-2.1-or-later | see below |
| [MediaMTX](https://github.com/bluenviron/mediamtx) | 1.21.3 | MIT | `mediamtx/` |
| [cloudflared](https://github.com/cloudflare/cloudflared) | 2026.10.3 | Apache-2.0 | `cloudflared/` |

The ffmpeg in the app is built statically from these, each a pinned release
checked against its SHA-256 by `scripts/build_ffmpeg.sh`:

| | Version | Licence | |
|---|---|---|---|
| [FFmpeg](https://ffmpeg.org) | 9.0.2 | LGPL-2.1+ (GPL-2.0+ with x264) | `ffmpeg/` |
| [x264](https://code.videolan.org/videolan/x264) | stable, b35605ac | GPL-2.0+ | `x264/` |
| [Opus](https://opus-codec.org) | 1.5.2 | BSD-3-Clause | `opus/` |
| [FreeType](https://freetype.org) | 2.15.0 | FreeType License (FTL) | `freetype/` |
| [FriBidi](https://github.com/fribidi/fribidi) | 1.0.17 | LGPL-2.1+ | `fribidi/` |
| [HarfBuzz](https://harfbuzz.github.io) | 15.0.0 | Old MIT | `harfbuzz/` |
| [libass](https://github.com/libass/libass) | 0.17.5 | ISC | `libass/` |

**ffmpeg's source.** Every GitHub release of TubeYap has these exact source
archives attached beside the app, and `scripts/build_ffmpeg.sh` rebuilds the
same ffmpeg from them: the configuration it uses is in that script.

## In the viewer page friends load

| | Version | Licence | |
|---|---|---|---|
| [hls.js](https://github.com/video-dev/hls.js) | 1.6.15 | Apache-2.0 | `hls.js/` |
| [pdf.js](https://github.com/mozilla/pdf.js) | 6.3.289 | Apache-2.0 | `pdf.js/` |

## In the app itself

| | Version | Licence | |
|---|---|---|---|
| [Lucide](https://lucide.dev) icons, the few the app picker uses (`frontend/icons.js`) | lucide-static 0.460.0 | ISC | `lucide/` |
| [ENABLE](https://github.com/dolph/dictionary) word list, for the word games (`apps/enable.txt.gz`) | dolph/dictionary@233d25a | Public domain | `enable/` |

## Go code compiled into the app

Every module in the app's binary (from `go list -deps` with Wails's build tags),
with its licence file in `go/<module path>/`. All are MIT, BSD or Apache-2.0.

| Module | Licence |
|---|---|
| github.com/wailsapp/wails/v2 | MIT |
| github.com/gorilla/websocket | BSD-2-Clause |
| github.com/huin/goupnp | BSD-2-Clause |
| github.com/jackpal/gateway | BSD-3-Clause |
| github.com/jackpal/go-nat-pmp | Apache-2.0 |
| github.com/pdfcpu/pdfcpu | Apache-2.0 |
| golang.org/x/text, x/crypto, x/image, x/net, x/sync | BSD-3-Clause |
| github.com/clipperhouse/uax29/v2, gabriel-vasile/mimetype, leaanthony/go-ansi-parser, leaanthony/slicer, leaanthony/u, mattn/go-runewidth, rivo/uniseg, samber/lo, go.yaml.in/yaml/v3 | MIT |
| github.com/hhrutter/tiff, pkg/browser, pkg/errors | BSD |
| github.com/tkrajina/go-reflector, xdg-go/stringprep | Apache-2.0 |

When a dependency or a bundled program changes version, update its folder and
these tables (for the Go modules: `go list -deps -tags desktop,production`
names them; their licence files are in Go's module cache).
