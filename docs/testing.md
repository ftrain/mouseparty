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
- `scripts/fuzz.sh` searches further: two minutes each (`FUZZTIME=30m`;
  `FUZZWINDOWTIME` for the window's), or one (`scripts/fuzz.sh FuzzApps`).
- CI (`.github/workflows/test.yml`): `scripts/test.sh` and a minute of each
  fuzzer on every push and pull request; a quarter of an hour of each every
  night. A failure keeps its input as the run's artifact: commit it to
  `testdata/fuzz/` with the fix.

`-fuzzminimizetime` matters: shrinking a new input replays it thousands of
times, and without a limit that stalls the search for minutes (the fuzzer reports
0 runs a second meanwhile). `scripts/fuzz.sh` sets it.

## What isn't covered yet

- **The pages in a browser.** The viewer page and the window are checked by
  `tsc` and built, but not run in the tests. Headless Chromium can (Playwright,
  with fake camera and microphone: `--use-fake-device-for-media-stream`); a
  call between two pages through MediaMTX has been checked that way by hand. A
  next step: the window's page fed random `View`s, and two viewer pages walking
  `socketGraph` from the browser side.
- **The sealed party** (`Unlock`, `SetPasscode`, `StartOver`): tested in
  `store_test.go`, not fuzzed (Argon2 is slow by design).
- **Datasette**: its tests skip without the WebAssembly Python
  (`scripts/build_python.sh`), as they do in CI on Linux.
