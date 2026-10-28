# TubeYap

Watch movies with friends, hosted from your own Mac, and gone when you quit.

Drag movies (or music, or a PDF) into the window, press Play, and paste the link
into your group chat. Friends open it in a browser: the movie plays, with a chat
beside it. There is no server anywhere but your Mac. Quit, and the session, the
chat and the link are gone.

## Getting it

- **Download:** the app is on this repo's
  [Releases](https://github.com/ftrain/tubeyap/releases) page, for Apple Silicon
  Macs on macOS 13 or later. Every push to `main` is also built, and its zip kept
  under the run's Artifacts in the [Actions](https://github.com/ftrain/tubeyap/actions)
  tab. It isn't signed by Apple yet, so the first time macOS says it can't verify
  it: System Settings > Privacy & Security > **Open Anyway**.
- **Build it:** see [Building](#building) below.

Everything the app needs is inside it: its own ffmpeg, MediaMTX and cloudflared.

## Using it

The window is two big buttons over a list.

- **Add:** drag videos, music or PDFs (or folders of them) from Finder into the
  list. Drag rows up and down to reorder; select one and press Backspace to take
  it out.
- **The link:** adding something starts hosting. The right-hand button says
  "Making link" while it gets one, then becomes a copy button: press it and
  paste the link to your friends. The link itself is never shown. "Wi-Fi only"
  under it means it works only on your own network; "No link – try again"
  means Cloudflare didn't give one (press it to ask again).
- **Play:** select something and press **Play** to start there; with nothing
  selected it carries on down the list. It becomes **Stop** until you press it
  again or the list runs out. Double-click a row to jump to it.
- **The slider** moves around in the movie playing. For a PDF it's the page,
  and so are the arrow keys (past the last page, the list moves on).
- Between movies there's an "up next" countdown. Songs in a row play straight
  through.

### Apps

The **Apps** menu puts something on everyone's page for ten minutes (`app_minutes`)
while the movie carries on: **Graffiti**, where everyone draws on the video, and
**Room**, a floor that fills the screen where everyone in the chat walks around
as a dot and what they say shows over their head. Choose it again to stop it.
Or give a movie its own app: the **+** on its row, just before its running time,
picks one, which then runs for exactly as long as that movie plays.
You join in by opening the link yourself. Viewers can turn an app off for
themselves (its button in the chat header, with the time left). They're
wireframes, there to try the idea; in the browser player's full screen they
don't show.

That's all of it. The few settings are in `~/.tubeyap.json` (below), and the log
goes to stderr: run `/Applications/TubeYap.app/Contents/MacOS/TubeYap` from
Terminal to read it.

### What it plays

- **Movies:** anything ffmpeg reads. Every one is sent at 1280×720 (letterboxed),
  as H.264 video and Opus sound. A movie with several sound tracks plays the one
  in your Mac's language.
- **Music:** each song gets a picture: its cover art, title and artist over a
  quiet moving spectrum of the sound.
- **PDFs, read together:** while a PDF is up, friends' pages show the document
  itself over the video, turned to whatever page you're on.

### Subtitles

The app looks for subtitles when a movie is added: text and picture tracks inside
the file, and files beside it named after it (`Movie.srt`, `Movie.en.srt`,
`Movie.French.forced.srt`). Drop an `.srt`, `.vtt` or `.ass` onto a movie to add
one. Each movie's `subs` setting in `~/.tubeyap.json` is one of:

- `viewers` (the default when there are text subtitles): every text track
  becomes a language in a **CC** menu on the viewer page. Each viewer turns them
  on or off, can nudge the timing, and keeps their language for the next movie.
  For a movie in another language, your Mac's language is on to start with.
- `burn`: one track (`burn` names it), drawn into the video for everyone, in
  perfect sync. The only choice for picture-based tracks (PGS, VobSub).
- `off`.

`offset` (seconds; positive is later) fixes files that are out of step.

### Settings

`~/.tubeyap.json` holds the list and these, none of them in the window:

| Setting | Default | |
|---|---|---|
| `bitrate` | `"1500k"` | video bitrate; each viewer takes about this plus 128k of your upload |
| `preset` | `"veryfast"` | x264's speed/quality trade |
| `countdown` | `10` | seconds of "up next" card before each movie; 0 for none |
| `skip` | `0` | minutes into the first movie played |
| `app_minutes` | `10` | how long an app from the Apps menu runs |
| `open_router_ports` | `true` | ask the router to let friends in; `false` keeps to your own network and the Cloudflare link |

## How hosting works

Your Mac is the whole server. MediaMTX sends the video to each viewer over
WebRTC; the app's own small web server (`web.go`) serves the viewer page, the
WebRTC handshake, an HLS fallback and the chat. Every URL carries a random
session key, and nothing answers without it.

**The link is Cloudflare's.** A Cloudflare quick tunnel (no account needed)
gives an `https://` link that works from anywhere, handed out only once the
tunnel is up. Cloudflare limits how many quick tunnels one address can make, so
when it says no the app asks again, for a minute or so; it never hands out a
plain `http://` link instead. Only the page, the chat and the handshake go
through Cloudflare: both ends use Cloudflare's STUN server to learn their outside
addresses, so the video punches through the routers and comes straight from
your Mac. Where that fails (some mobile networks), those viewers get the HLS
fallback through the tunnel, a few seconds behind.

**Your router.** For the direct path, the app asks the router (NAT-PMP or UPnP)
to forward two ports to this Mac: 8765 TCP for the page and 8189 UDP and TCP for
the video. The forwards are timed (ten minutes, renewed while hosting) and never
permanent. If the router won't, or your ISP's box sits in front of it (CGNAT or
double NAT), the video still punches through with STUN, or falls back to HLS.
A build without cloudflared hands out the direct `http://` link instead
(or a Wi-Fi-only one), and talks to no outside server at all.

Each viewer pulls their own copy from your upload: about 1.6 Mbit/s each at the
default bitrate.

## Nothing outlives the session

Chat is only ever in the app's memory. When you quit, every viewer's page is
wiped (chat, subtitles, video) and says the session ended; if the app crashes
instead, their page wipes itself after 20 seconds without the host. Viewers'
browsers keep nothing: settings last only while the tab is open, and every
response says not to cache or index it. MediaMTX and cloudflared run under a
watchdog that stops them if the app dies; router forwards lapse within ten
minutes; a crashed session's folder is cleared on the next start; and the link
is taken off the clipboard on quit. What the app can't erase: Cloudflare's own
logs, and the dead link in viewers' histories.

On your Mac, `~/.tubeyap.json` keeps the list and settings, and nothing about a
session.

## The viewer page

Laid out like YouTube live: chat in a column beside the video on a desktop,
under it on an upright phone, and floating over the video like subtitles on a
phone turned on its side. Nothing of TubeYap's sits on the picture: that's the
browser's own player, with its volume, picture-in-picture and full-screen
buttons. In full screen, the chat and the subtitles come along as a "Chat"
subtitle track, in every browser and on iPhones and iPads.

The chat header has **CC** (subtitles, when the movie has them) and **GUIDE**: a
cable-TV-style listing of what's on and what's next, with start and end times in
each viewer's own time zone (the Mac sends its own clock, so a viewer's wrong
clock doesn't matter). Viewers can hide the chat; a tab on the video's right edge
brings it back and counts what arrived meanwhile. Browsers only autoplay muted,
so a "sound is off" prompt covers the video until they turn it up.

## Building

Needs a Mac with Apple Silicon, Xcode's command-line tools and Go
(`brew install go`).

```bash
brew install mediamtx cloudflared meson ninja cmake pkg-config
scripts/build_ffmpeg.sh                    # TubeYap's own ffmpeg, once (about 10 minutes)
BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   # -> dist/TubeYap.app and dist/TubeYap-macos-arm64.zip
```

- **The app** is Go with a [Wails](https://wails.io) window. The build runs a
  pinned Wails through `go run`, so there's nothing else to install. The window
  is plain HTML, CSS and JavaScript (`frontend/`) with no build step.
- **ffmpeg:** `scripts/build_ffmpeg.sh` builds a static ffmpeg from pinned,
  checksummed sources (FFmpeg, x264, Opus, FreeType, FriBidi, HarfBuzz, libass),
  cut down to what TubeYap uses. It reads anything (every decoder and container)
  but writes only H.264 and Opus over RTSP, PNG covers and WebVTT subtitles,
  with only the filters the app uses: 20 MB instead of 60-plus. Homebrew's
  ffmpeg works for trying things, but it has no `drawtext`, so the cards fail
  with it. There's no ffprobe: the app reads files with ffmpeg alone.
- **Running from source:** `go run github.com/wailsapp/wails/v2/cmd/wails@v2.17.0 dev -skipbindings`.
  It starts hosting whatever is in your `~/.tubeyap.json` list.
- **Signed builds:** `SIGN_IDENTITY="Developer ID Application: …"
  NOTARY_PROFILE=… BUNDLE_FFMPEG=1 scripts/build_mac_app.sh` signs with the
  hardened runtime and notarizes. See `docs/release-plan.md` for what proper
  releases (and Linux and Windows) still need.

### Tests

```bash
scripts/test.sh
```

Vets everything and runs the tests. They cover:
- a play-through: two short clips through the whole app on free ports, from
  Play to the end of the list, with a seek
- the chat's protocol, the session key check, and Cloudflare saying no
- router port forwarding, against fake NAT-PMP and UPnP routers
- subtitles and languages, and reading files with ffmpeg, checked against ffprobe

Then it runs the app's self-test (`TubeYap --selftest`). That hosts on free
ports, touching neither the router nor a session that's running, checks the
page, the stand-by stream and the WebRTC handshake, and publishes a short
countdown.

### GitHub

`.github/workflows/mac-app.yml` runs on every push to `main` and every pull
request, on an Apple Silicon runner:
1. builds ffmpeg (cached until its script changes)
2. builds the app and runs the tests
3. runs the self-test inside the built app
4. keeps the zip as the run's artifact

A `v*` tag also makes a release:

```bash
git tag v2.0.0 && git push origin v2.0.0
```

The release carries the app and the exact sources of its ffmpeg.

## Project structure

```
main.go             the Wails app: window options, embedded files, --selftest (selftest.go)
app.go              the list, playback, and what the two buttons do
frontend/           the window: index.html, app.css, app.js
stream.go           ffmpeg: a movie, song or card to MediaMTX as H.264 + Opus over RTSP
host.go             hosting: runs MediaMTX and cloudflared, starts and stops a session
web.go              the viewer site: page, WebRTC handshake and HLS proxies, the key check
chat.go             the chat, one websocket per viewer
session.go          what viewers' pages show beside the video: subtitles, guide, PDF page
tunnel.go           the Cloudflare link
apps.go             apps on the viewers' pages: the Activity interface, over the chat socket
graffiti.go, room.go  the two apps (their scripts are host_web/apps/)
portmap.go          asks the router (NAT-PMP / UPnP) to forward ports
subtitles.go        finds a movie's subtitles and turns text ones into timed lines
media.go            what a file holds (from ffmpeg), PDF pages, titles from file names
config.go, tools.go ~/.tubeyap.json; finding the bundled tools
host_web/           the viewer page: viewer.html, host.js, host.css, hls.js, pdf.js
media/              the stand-by card MediaMTX loops between movies
packaging/          the app icon and the Info.plist Wails builds with
scripts/            build_mac_app.sh, build_ffmpeg.sh, test.sh, make_standby_card.sh
licenses/           everything TubeYap is made of, and under what licences
*_test.go           the tests
```

## Licence

TubeYap is under the [MIT licence](LICENSE). The app bundles ffmpeg, which as
built (with x264) is under the GPL, and MediaMTX, cloudflared, hls.js, pdf.js and
some Go libraries under MIT, BSD and Apache licences. [`licenses/`](licenses/README.md)
lists every one, with its licence text, and the built app carries the same
folder. Each release includes the exact sources of its ffmpeg.
