# What Mouse Party is made of, and under what licences

Mouse Party's own code is under the MIT licence (`../LICENSE`). The app also ships,
or is built from, the work below. Each folder here holds that work's licence as
its authors publish it, and the built app carries this whole folder in
`Mouse Party.app/Contents/Resources/Licenses`, and on Linux and Windows in
`resources/licenses` beside the program.

## Programs bundled in the app

| | Version | Licence | Source |
|---|---|---|---|
| **ffmpeg**, Mouse Party's own build for each of macOS, Linux and Windows (`scripts/build_ffmpeg.sh`) | 9.1 | **GPL-2.0-or-later** as built (it includes x264); FFmpeg itself is LGPL-2.1-or-later | see below |
| [MediaMTX](https://github.com/bluenviron/mediamtx) | 1.21.3 | MIT | `mediamtx/` |
| [cloudflared](https://github.com/cloudflare/cloudflared) | 2026.10.3 | Apache-2.0 | `cloudflared/` |
| [pandoc](https://pandoc.org), its own WebAssembly release build (`pandoc.wasm`, `scripts/fetch_pandoc.sh`), run inside the app by wazero: documents brought in (`pandoc.go`) | 3.13 | **GPL-2.0-or-later** (with the parts its `COPYRIGHT` lists under their own) | `pandoc/`; source below |
| [DejaVu Sans Mono](https://dejavu-fonts.github.io), the cards' type in the Linux and Windows apps (`scripts/fetch_font.sh`) | 2.37 | Bitstream Vera and Arev font licenses; DejaVu's own changes are public domain | `dejavu/` |
| The [AppImage runtime](https://github.com/AppImage/type2-runtime), the program at the start of the Linux AppImage (`scripts/fetch_appimage_runtime.sh`) | 20251108 | MIT; linked into it statically: libfuse 3.15.0 (LGPL-2.1), squashfuse 0.5.2 (BSD-2-Clause), zstd 1.5.6 (BSD-3-Clause), zlib (Zlib, its text in `zlib/`), mimalloc 2.1.7 (MIT), musl 1.2.5 (MIT) | `appimage-runtime/`; source below |
| [NSIS](https://nsis.sourceforge.io), the Windows installer and uninstaller (`packaging/windows/installer.nsi`) | 3.11 | zlib/libpng; its LZMA and bzip2 modules as `nsis/COPYING` says | `nsis/` |

The Windows app's window is Microsoft's WebView2, which Windows 10 and 11 have.
Where it's missing, the app offers to download Microsoft's installer for it: none
of it is in the app.

The ffmpeg in the app is built statically from these, each a pinned release
checked against its SHA-256 by `scripts/build_ffmpeg.sh`:

| | Version | Licence | |
|---|---|---|---|
| [FFmpeg](https://ffmpeg.org) | 9.1 | LGPL-2.1+ (GPL-2.0+ with x264) | `ffmpeg/` |
| [x264](https://code.videolan.org/videolan/x264) | stable, b35605ac | GPL-2.0+ | `x264/` |
| [Opus](https://opus-codec.org) | 1.5.2 | BSD-3-Clause | `opus/` |
| [FreeType](https://freetype.org) | 2.15.0 | FreeType License (FTL) | `freetype/` |
| [FriBidi](https://github.com/fribidi/fribidi) | 1.0.17 | LGPL-2.1+ | `fribidi/` |
| [HarfBuzz](https://harfbuzz.github.io) | 15.0.0 | Old MIT | `harfbuzz/` |
| [libass](https://github.com/libass/libass) | 0.17.5 | ISC | `libass/` |
| [zlib](https://zlib.net), on Linux and Windows | 1.3.2 | Zlib | `zlib/` |
| [bzip2](https://sourceware.org/bzip2/), on Linux and Windows | 1.0.8 | bzip2-1.0.6 | `bzip2/` |
| [Expat](https://libexpat.github.io), on Linux, for fontconfig | 2.10.0 | MIT | `expat/` |
| [fontconfig](https://www.freedesktop.org/wiki/Software/fontconfig/), on Linux: libass's fonts | 2.18.3 | MIT-style (`fontconfig/COPYING`) | `fontconfig/` |

It also has in it these, from the compiler that builds it. The Linux ffmpeg uses
the system's glibc.

| | Version | Licence | |
|---|---|---|---|
| [mingw-w64](https://www.mingw-w64.org)'s C runtime and winpthreads, in the Windows ffmpeg (linked with `-static`) | 13.0.0, which `scripts/build_ffmpeg.sh` checks the compiler has | ZPL-2.1, with the parts `mingw-w64/COPYING.MinGW-w64-runtime.txt` lists under their own terms; winpthreads MIT and BSD-3-Clause | `mingw-w64/` |
| GCC's runtime library, libgcc, in the Linux ffmpeg (`-static-libgcc`) and the Windows one | the compiler's | GPL-3.0-or-later WITH GCC-exception-3.1 | `gcc-runtime/` |

**ffmpeg's source.** Every GitHub release of Mouse Party has these exact source
archives attached beside the app, mingw-w64's release among them, and
`scripts/build_ffmpeg.sh`, which rebuilds the same ffmpeg from them: the
configuration it uses is in that script.

**Python, for Datasette** (`scripts/build_python.sh`, run inside the app by wazero: databases looked through
together, `datasette.go`), everything in it permissively licensed, each text in `python/`:

| | Version | Licence | |
|---|---|---|---|
| [CPython](https://www.python.org), built for WASI | 3.15.2 | PSF-2.0 | `python/CPython-LICENSE` |
| [SQLite](https://sqlite.org), compiled into it | 3.54.1 | Public domain | `python/SQLite-LICENSE` |
| [zlib](https://zlib.net), compiled into it | 1.3.2 | zlib | `python/zlib-LICENSE` |
| [wasi-libc](https://github.com/WebAssembly/wasi-libc) (from the WASI SDK 33), its C library | 161b319 | Apache-2.0 WITH LLVM-exception, MIT (musl) | `python/wasi-libc/` |
| [Datasette](https://datasette.io) | 0.65.5 | Apache-2.0 | `python/packages/datasette-0.65.5/` |
| What Datasette needs (`scripts/python-requirements.txt`): aiofiles, anyio, asgi-csrf, asgiref, click, click-default-group, flexcache, flexparser, h11, httpcore, httpx, hupper, idna, itsdangerous, janus, Jinja2, MarkupSafe, mergedeep, platformdirs, pluggy, python-multipart, PyYAML, typing_extensions, uvicorn; and certifi | as pinned | MIT, BSD-3-Clause, Apache-2.0, PSF-2.0; certifi MPL-2.0 | `python/packages/` |

**pandoc's source.** Every release also has the source of the pandoc inside
attached (`scripts/fetch_pandoc.sh --fetch`), as the GPL asks; the build is
pandoc's own, from its release, checked against its SHA-256. With it come the
sources of what that build has compiled into it (`scripts/pandoc-sources.txt`,
each checked against its SHA-256): every Haskell library, in the version
`pandoc.wasm` names or, where it names none, the one Hackage had when it was
built; the six libraries its WebAssembly build takes from git, at the commits
pandoc's `cabal.project` names (its patches to them are in pandoc's source);
and GHC's source for the runtime, base libraries and GMP, from GHC
9.14.1.20260728, the published snapshot nearest the 9.14.1.20260731 that built
it, with the same versions of every base library.

**The AppImage runtime's source.** Every release also has the type2-runtime
source at its release tag, and the libfuse and squashfuse sources it is built
from (`scripts/fetch_appimage_runtime.sh --fetch`), as libfuse's LGPL asks; the
runtime is the AppImage project's own release build, checked against its SHA-256.

## In the viewer page friends load

| | Version | Licence | |
|---|---|---|---|
| [hls.js](https://github.com/video-dev/hls.js) | 1.6.15 | Apache-2.0 | `hls.js/` |
| [pdf.js](https://github.com/mozilla/pdf.js) | 6.3.289 | Apache-2.0 | `pdf.js/` |
| [Tiny Little Office](https://github.com/aboard-io/tinylittleoffice)'s editors and kernel, the documents (`host_web/office/`, `scripts/vendor_office.sh`) | office (v2 and the Pinboard), d429923 | MIT | `tinylittleoffice/` |

Tiny Little Office's build bundles its own dependencies into those files (Lit,
Lucide, MapLibre, mathjs, Fluent, fflate, d3-sankey and what they bring, all
MIT, BSD, ISC or Apache-2.0), each listed with its version and licence in
`tinylittleoffice/dependencies.md`, copied from the same commit. The IBM Plex
fonts it carries are under the SIL Open Font License, whose text travels with
them in `host_web/office/fonts/`.

## In the app itself

| | Version | Licence | |
|---|---|---|---|
| [Lucide](https://lucide.dev) icons, the few the app picker uses (`host_web/apps/icons.js`) and the window's list (`frontend/app.js`) | lucide-static 0.460.0, lucide 1.77.0 | ISC | `lucide/` |
| [ENABLE](https://github.com/dolph/dictionary) word list, for the word games (`apps/enable.txt.gz`) | dolph/dictionary@233d25a | Public domain | `enable/` |

## Go code compiled into the app

Every module in the app's binary (from `go list -deps` with Wails's build tags),
with its licence file in `go/<module path>/`. All are MIT, BSD or Apache-2.0.

| Module | Licence |
|---|---|
| Go itself, its runtime and standard library (`go/LICENSE`) | BSD-3-Clause |
| github.com/wailsapp/wails/v2 | MIT |
| github.com/gorilla/websocket | BSD-2-Clause |
| github.com/huin/goupnp | BSD-2-Clause |
| github.com/jackpal/gateway | BSD-3-Clause |
| github.com/jackpal/go-nat-pmp | Apache-2.0 |
| github.com/pdfcpu/pdfcpu | Apache-2.0 |
| github.com/tetratelabs/wazero, WebAssembly in Go (pandoc: `wasm.go`) | Apache-2.0 |
| github.com/ncruces/go-sqlite3, SQLite for the party file (`store.go`), with ncruces/julianday | MIT |
| github.com/ncruces/go-sqlite3-wasm/v6, SQLite itself as WebAssembly translated to Go (SQLite is public domain) | MIT-0 |
| lukechampine.com/adiantum, the party file's encryption (through go-sqlite3's adiantum VFS) | MIT |
| aead.dev/minisign, checking the release key's signature on an update (`internal/releasesig`) | MIT |
| golang.org/x/text, x/crypto, x/image, x/net, x/sync, x/sys | BSD-3-Clause |
| github.com/clipperhouse/uax29/v2, gabriel-vasile/mimetype, leaanthony/go-ansi-parser, leaanthony/slicer, leaanthony/u, mattn/go-runewidth, rivo/uniseg, samber/lo, go.yaml.in/yaml/v3 | MIT |
| github.com/hhrutter/tiff, pkg/browser, pkg/errors | BSD |
| github.com/tkrajina/go-reflector, xdg-go/stringprep | Apache-2.0 |
| github.com/godbus/dbus/v5, on Linux only | BSD-2-Clause |
| github.com/wailsapp/go-webview2, on Windows only (its webviewloader is ISC) | MIT |
| github.com/go-ole/go-ole, bep/debounce, on Windows only | MIT |
| github.com/google/uuid, on Windows only | BSD-3-Clause |
| git.sr.ht/~jackmordaunt/go-toast/v2, on Windows only | MIT or Unlicense |

When a dependency or a bundled program changes version, update its folder and
these tables (for the Go modules: `GOOS=darwin`, `linux` and `windows` `go list -deps -tags desktop,production`,
with `webkit2_41` added on Linux, name them; their licence files are in Go's module cache).
