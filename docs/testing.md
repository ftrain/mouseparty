# Testing Mouse Party

Mouse Party is a few programs talking to each other: the Mac window and its one
goroutine, ffmpeg and MediaMTX run as tools, viewers' pages over a socket and
WebRTC, and the apps inside them. Most of what goes wrong goes wrong between
them, in an order nobody thought of: a row removed while a seek is under way, a
page closing as its app opens, a player leaving a game in the middle of a vote.
So the tests are in layers, from quick and exact to slow and real.

## The layers

1. **Rules, one at a time.** Ordinary tests for what has a right answer: the
   apps' rules (`apps/apps_test.go`), titles from release names, subtitles,
   the party file, zips, pandoc. Quick; most of `go test`.
2. **The contracts.** What Go sends and TypeScript reads is typed twice
   (`web/viewer/types.ts`, each app's `View`, `web/window/wails.d.ts`); `tsc`
   checks the pages against those types, and the command graph's tests (below)
   check the commands against both sides.
3. **The command graph, fuzzed.** Every command the system takes, written down
   as data ([`docs/commands.md`](commands.md)), and walked at random by
   fuzzers that check, after every step, what must always hold. This finds the
   orders nobody thought of.
4. **The real thing.** `TestPlayThroughTheList` plays clips through ffmpeg and
   MediaMTX; `--selftest` hosts and publishes; `FuzzWindow` walks the window's
   graph against them. On free ports with a temporary `HOME`, never the router
   (see CLAUDE.md: tests that skip that have stopped a live session).
5. **The pages in a browser.** `TestBrowser` (`browser_test.go`,
   `web/e2e/browser.cjs`): the only test that runs the pages' JavaScript.

## The command graph

Three layers of commands, each a table in the code:

| Layer | Where it's written | What walks it |
|---|---|---|
| The Mac window: `App`'s methods, in each state `App.state` names | `windowGraph`, `graph_test.go` | `FuzzWindow` |
| A viewer's page, on its socket | `socketGraph`, `graph_test.go` | `FuzzSocket` |
| Each app, from a page | `apps.Commands`, `apps/commands.go` | `FuzzApps` (and `FuzzSocket`) |

The graph can't fall behind the code: `TestWindowGraphIsApp` fails for an `App`
method that isn't in it (or in `windowElsewhere`, with where it's tested),
`TestSocketGraphIsTypes` for a message in `types.ts`'s `ToHost` that isn't,
`TestCommandsAreTheScripts` for a message in an app's script (its `Out` type)
that isn't, and `TestCommandGraphDoc` while `docs/commands.md` is stale
(`UPDATE_GRAPH=1 go test -run TestCommandGraphDoc .` writes it).

### What the fuzzers check

The fuzzers are Go's own (`go test -fuzz`): their bytes are read as choices, so
the fuzzer mutates walks, keeps the ones that reach new code, and shrinks a
failing one to the fewest steps.

- **`FuzzApps`** (`apps/fuzz_test.go`), thousands of walks a second: pages come,
  take names (empty, long, the same as another's) and go; apps open and close;
  each page sends each app its commands, mostly well-formed, sometimes not (the
  wrong type, out of range, a field missing, a kind that doesn't exist); time
  jumps past timers. After every step: nothing panics; every viewer's view and
  every event encodes as JSON; private things stay private (a call's secrets,
  the spies' key, who the werewolves are); what an app keeps loads back and
  keeps the same again.
- **`FuzzSocket`** (`graph_test.go`), real websockets to the real chat and app
  host: pages connect and drop, send every message type with good and bad
  fields, frames that aren't JSON, binary frames. After: the host still greets a
  new page; every message a page was sent is a type `types.ts` knows; no name or
  line is longer than the limit; a call's secret went to one page only; never
  more than `appsMax` apps.
- **`FuzzWindow`** (`graph_test.go`), the whole app hosting for real: files
  dropped (clips, a song, a PDF, a file that isn't anything, one that isn't
  there), Play and Stop, rows double-clicked, dragged, selected and removed,
  seeks, pages turned, settings replaced (with JSON good and bad), a drive
  unplugged and back, time passing. Each command runs on the app's goroutine
  between two looks at its state, so each step is exact: a command in a state it
  doesn't act in must change nothing at all, and one that acts must land in a
  state the graph allows. After every step, the view holds together (the big
  button says Stop exactly while playing, one row at most is playing, the rows
  played come first, the selection is a row, the slider is only on for a movie
  or a PDF); at the end, Stop settles it within 20 seconds. `go test -v -run
  FuzzWindow` lists the transitions the walks took.

### Running them

- `go test ./...` (and `scripts/test.sh`) runs each fuzzer's seeds, and
  every input that ever failed (kept in `testdata/fuzz/`, `apps/testdata/fuzz/`).
- A missing piece skips its tests (no MediaMTX, no Datasette Python, no
  Playwright), and a skip passes quietly in plain `go test`. So
  `scripts/test.sh` lists every skip and why (`scripts/testreport`), and with
  `NO_SKIPS=1`, as CI sets, a skip fails the run unless it matches
  `ALLOW_SKIPS`. `scripts/setup.sh` gets every piece.
- `scripts/fuzz.sh` searches further: two minutes each (`FUZZTIME=30m`;
  `FUZZWINDOWTIME` for the window's), or one (`scripts/fuzz.sh FuzzApps`).
- CI, on a Mac: `scripts/test.sh` (with the browser walk) and a minute of each
  fuzzer on every push and pull request (`.github/workflows/mac-app.yml`); a
  quarter of an hour of each, and of browser walks, every night (`fuzz.yml`). A failure keeps its input as the run's artifact: commit it to
  `testdata/fuzz/` with the fix.

`-fuzzminimizetime` matters: shrinking a new input replays it thousands of
times, and without a limit that stalls the search for minutes (the fuzzer reports
0 runs a second meanwhile). `scripts/fuzz.sh` sets it.

## Linux sandbox and desktop smoke test

The [Linux workflow](../.github/workflows/linux.yml) runs on pull requests,
pushes to `main`, and by manual dispatch. Like the Mac job, it runs `go vet` and
the `apps` package tests, including the saved `FuzzApps` inputs. It also requires
all fourteen selected host tests to pass: a skip, missing test, or launch
failure fails the job. The Linux viewer and offline ffmpeg tests exercise the
real bubblewrap policies, including real media inspection, frame grabs and
subtitle conversion. The tool-box tests check the networked roles' file grants,
including MediaMTX's read-only session, cloudflared's CA pool, and publishing
ffmpeg's pinned regular inputs. The player test checks progress on stdout and a
graceful stop over stdin. See [SECURITY.md](../SECURITY.md) for the differences
between the role policies.
`TestTheSiteInItsOwnProcess` checks the boxed viewer
against real MediaMTX, including recovery after the viewer process is killed.

To run the same check on Ubuntu 26.04 (amd64 or arm64), install the Go version
in [`go.mod`](../go.mod) and the distro dependencies:

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends apparmor bubblewrap build-essential \
  ca-certificates curl ffmpeg fonts-dejavu-core libgtk-3-dev libwebkit2gtk-4.1-dev perl pkg-config
```

If `sysctl -n kernel.apparmor_restrict_unprivileged_userns` reports `1`, Ubuntu's
AppArmor `bwrap` profile must be loaded. The workflow loads the distro profile
with `sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict`; ask your
system administrator if it is not already loaded locally. Do not disable
AppArmor or run the tests as root. On another distro use bubblewrap 0.10 or
newer (`--disable-userns` and `--ro-bind-fd`), with working unprivileged user
namespaces and seccomp. A container that blocks namespace creation is not a
substitute for a Linux host or VM with those facilities.

From the checkout, as a normal user:

```sh
scripts/test_linux.sh
```

The script uses the version and checksums from
[`scripts/fetch_tools.sh`](../scripts/fetch_tools.sh) for MediaMTX, and distro
ffmpeg with `drawtext`, `libx264` and `libopus`. It builds a Wails desktop binary
with `desktop,production,webkit2_41` (Ubuntu uses WebKitGTK 4.1), then invokes its
existing `--selftest` headlessly from a scratch directory with a temporary
`HOME`. The host uses free ports, with no tunnel or router mapping. This checks
hosting and publishing, not the desktop UI, browser playback, or packaging.
It uses the checked-in web assets and does not build the optional Datasette
Python; `--selftest` reports that one out-of-scope check as skipped.

## The pages in a browser

`TestBrowser` hosts the real `App` and opens the pages in headless Chromium
(Playwright, with a fake microphone):

- **The window** (`frontend/`), with no Wails: stand-ins for `window.go` and
  `window.runtime` send each call to the test over HTTP, which makes it on the
  real `App` (by reflection, as Wails binds it), and hand the page the `View`
  as Wails's `view` event would. It's walked at random: files dropped, Play,
  the link, rows clicked, double-clicked and dragged, Backspace and the arrows,
  the slider. After each step the page must show the view it was last given:
  the rows, their marks, the selection, the big button, the slider, the hint.
- **Two viewers**, Ann at a desk and Bob on a phone (upright, then turned on its
  side halfway, so each phone layout is drawn): a line of chat from one reaching
  the other; every app in the picker opened by Ann, drawn on both pages (on the
  phone, its tab chosen), and closed; then a call between them, with sound both
  ways (only the call's connections counted, not the movie's).
- **Ann at each app's own controls**, while it's open: its buttons and cells
  clicked, words typed into its fields, strokes drawn on its canvases, at random,
  in whatever state the robots have it in.
- **Four robot viewers** (plain sockets from Node, no page) join each app as
  it opens, start it if it's a game (four is enough for Spies and Werewolf), and
  for three seconds send it its commands from the graph (`apps.Commands`, served
  by the test), mostly well-formed and sometimes not, as fast as the host lets a
  page. The two real pages draw every view and event that comes of it: the apps'
  scripts in states a walk alone wouldn't reach (games under way, a wall of
  strokes, documents edited by others). `BROWSER_SHOTS=<dir>` keeps a picture
  of each app as it stands after.
- **The party file, through the window's own sheets** (the Party menu's asks
  sent as Wails would): Settings refused while playing and as broken JSON, then
  saved and read back; Use Encryption with two passcodes that differ, then the
  same twice; Change Passcode with a wrong one, then the right one; the app
  quit and started again from the same party file, locked, refusing the old
  passcode and opening with the new, with the whole list; then unsealed. Then
  sealed again, restarted, and the passcode "forgotten": Forgot the passcode?,
  Back, Forgot again, Start Over, and a new empty party, the locked one set
  aside beside it (the test checks the file is there).

Any uncaught error on any page fails it. Each run takes a new seed, printed
when it fails: `BROWSER_SEED=<seed> go test -run TestBrowser -v .` walks the
same again. It skips without Node and Playwright, ffmpeg and MediaMTX, and with
`-short`. `scripts/fuzz.sh` walks it again with new seeds for its time
(`FUZZBROWSERTIME`), as CI does nightly.

## What isn't covered yet

- **Wrong passcodes, fuzzed**: Argon2 is slow by design, so the walk tries one
  of each, not many.
- **Safari and Firefox.** The walk is Chromium's. Playwright drives Firefox
  and WebKit (Safari's engine) the same way: installing them is the step
  (`npx playwright install firefox webkit`), then a browser name for the walk.
