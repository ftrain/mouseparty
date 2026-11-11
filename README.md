# Mouse Party

Have friends over online. Watch a movie, chat, play some games. It runs from
your Mac, and it's all gone when you quit.

[Website](https://ftrain.github.io/mouseparty/) ·
[Download](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-macos-arm64.dmg)
(Apple Silicon, macOS 13 or later)

## How to use it

1. Drag movies into the window.
2. Press the copy button and paste the link to your friends.
3. Press Play.

Friends open the link in any browser. They don't install anything or sign up.
The app updates itself.

The window is a list and two buttons.

- Drag rows to reorder them. Backspace removes the selected row. ⌘Z puts it back.
- Double-click a row to play it now.
- A movie you stop partway picks up where it left off.
- The slider moves through the movie, or through a document's pages.
- **Party > Add Download Link…** adds a movie from a link. It can start playing
  before the download finishes. A link to an Internet Archive page works too:
  the app finds the video, or every video if the page has several.

## What it plays

- **Movies and music.** Anything ffmpeg can read.
- **PDFs, Word files, slides and spreadsheets.** Everyone reads the same page,
  and anyone can turn it.
- **SQLite databases.** Everyone looks through them together with
  [Datasette](https://datasette.io).
- **Zips.** Unpacked, and whatever is inside is added.

## What friends get

The movie, with chat beside it. Anyone can press **+** to open a game or a tool
for everyone, in a window over the movie:

| | |
|---|---|
| Bingo | words from the movie's subtitles |
| Tiles | a crossword tile game |
| Word Grid | find words in a grid of letters |
| Anagrams | unscramble the word first |
| Sketch | one person draws, the rest guess |
| Blanks | fill in the blank, vote for the best |
| Spies | two teams and one-word clues |
| Werewolf | wolves hidden in the village |
| Polls | ask a question, everyone votes |
| Graffiti | draw on the picture |
| Stickies | notes pinned to a moment in the movie |
| Room | walk around as a dot |
| Call | talk while you watch |
| Document, Outline, Slides, Sheet, Diagram, Drawing, Pinboard | edit together |

The chat header has **CC** for subtitles and **GUIDE** for what's on next.

## Subtitles

The app finds subtitle tracks inside a movie and subtitle files next to it. You
can also drop an `.srt`, `.vtt` or `.ass` file onto a movie. Friends turn
subtitles on for themselves with **CC**.

To draw one track into the picture for everyone, or to fix the timing, open
**Settings > Security > Edit as Text…** and set the movie's `subs`:

- `mode`: `viewers` (the default), `burn` or `off`
- `burn`: which track to draw in
- `offset`: seconds to shift the subtitles; positive is later

## Settings

**Mouse Party > Settings…** (⌘,) has the usual controls. The same settings as
text:

| Setting | Default | What it does |
|---|---|---|
| `bitrate` | `"2500k"` | Video quality. Each friend uses about this much of your upload. |
| `preset` | `"veryfast"` | How hard the Mac works on the picture. |
| `countdown` | `10` | Seconds of "up next" before each movie. |
| `skip` | `0` | Minutes to skip at the start of the first movie. |
| `cache_gb` | `20` | Most space downloads may use. The oldest are deleted first. |
| `check_updates` | `true` | Look for a new version once a day. |
| `install_updates` | `true` | Install it when you quit. |
| `notify` | `true` | Tell you when a friend arrives or a download finishes. |
| `max_viewers` | `10` | How many people can watch at once. One more is told the party is full. `0` for no limit. |
| `open_router_ports` | `true` | Ask the router to let friends connect directly. |
| `no_sandbox` | `false` | Turn the sandbox off. See Security. |

## How it works

Your Mac is the server. There is no other one.

- ffmpeg turns each movie into a video stream.
- MediaMTX sends that stream to each friend over WebRTC.
- A small web server in the app serves the page, the chat and the games.
- cloudflared gets a free Cloudflare link, so friends can reach the page from
  anywhere. The video itself goes straight from your Mac to each friend when
  their network allows it, and through the link when it doesn't.

Every address includes a random key. Nothing answers without it.

## What it keeps

Chat is never saved. It lives in memory and is gone when you quit. So are the
link and the list of who came.

One file stays on your Mac:
`~/Library/Application Support/Mouse Party/party.sqlite`. It holds your list,
your settings, saved download logins, and what the games keep, such as the
graffiti wall. It never holds your movies.

- **Party > Use Encryption…** locks that file with a passcode. If you forget
  the passcode, nothing in the file can be recovered.
- **Party > Erase All Data…** deletes the file and the downloads.

Mouse Party can't erase Cloudflare's own logs, or the dead link in a friend's
browser history.

## Security

The link is an invitation. Anyone who has it can talk to your Mac, so only send
it to people you know.

In case the link reaches someone else, every part of the app that a guest can
reach runs in a macOS sandbox. Each part can touch only what it needs:

| Part | Files it can touch | Network it can reach |
|---|---|---|
| The page, chat and games | the app's own files and a temporary folder | the page's port, and MediaMTX |
| MediaMTX | a temporary folder | sending video |
| cloudflared | none | Cloudflare, and the page's port |
| ffmpeg | the files it is playing | MediaMTX |

None of them can read your home folder or start another program. When a
document is on screen, the app opens it and hands it over already open, so the
sandboxed part never learns where your files are.

If someone breaks into one of these parts, they get that party: the chat, and
the document on screen. They don't get your Mac.

What this doesn't do:

- It doesn't mean there are no bugs. It limits what a bug can reach.
- It doesn't protect your friends from each other. Everyone with the link is in
  the same room.
- It doesn't hide your home network address from the friends you invite.

## No guarantees

Mouse Party is one person's project. It comes as it is, with no warranty and no
promise of support. You use it at your own risk.

## Building

You need an Apple Silicon Mac with Xcode's command-line tools, Go, Node 24 and
curl. Mouse Party is a Mac app only.

```bash
scripts/setup.sh                           # fetch and build everything it needs
scripts/test.sh                            # run the tests
BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   # build dist/Mouse Party.app and the disk image
```

- Every outside piece is fetched by a script that pins its version and checks
  its SHA-256. There are no git submodules.
- The pages are TypeScript in `web/`. Their built files are checked in, so Go
  alone can build the app.
- To make a release, push a tag: `git tag v3.4.0 && git push origin v3.4.0`.
  GitHub builds, signs and publishes it.

`CLAUDE.md` describes every file. `docs/` has the design notes and
`docs/testing.md` says how it's tested.

## Licence

Mouse Party is under the [MIT licence](LICENSE).

The app includes other people's work under their own licences, among them
ffmpeg and pandoc, which are GPL. [`licenses/`](licenses/README.md) lists every
one. Each release includes the sources of its ffmpeg and pandoc.

By Paul Ford.
