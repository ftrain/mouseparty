# Mouse Party

A Mac app for watching movies with friends online. Your Mac hosts the party;
there's no server and no account, and nothing is left behind when you quit.

[Website](https://ftrain.github.io/mouseparty/) ·
[Download](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-macos-arm64.dmg)
(Apple Silicon, macOS 13 or later)

## What it does

- Drag movies into the window, copy the link, send it to friends, press Play.
- Friends watch in any browser. Nothing to install, no sign-up.
- Plays anything ffmpeg can read, plus PDFs, Word files, slides, spreadsheets
  and SQLite databases (through [Datasette](https://datasette.io)). Everyone
  sees the same page, and anyone can turn it.
- Adds movies from a download link or an Internet Archive page.
- Chat beside the movie, never saved.
- Games and tools anyone can open over the movie: Bingo, Tiles, Word Grid,
  Anagrams, Sketch, Blanks, Spies, Werewolf, Polls, Graffiti, Stickies, a voice
  call, and shared documents, slides and sheets.
- Subtitles from the movie or a file beside it, turned on by each viewer.
- Up to ten viewers by default (`max_viewers` in Settings).
- Guest-facing parts run in a macOS sandbox. Only send the link to people you
  trust.
- Keeps one file, `~/Library/Application Support/Mouse Party/party.sqlite`,
  which you can encrypt with a passcode or erase from the Party menu.
- Updates itself.
- Contacts no one but GitHub (to check for updates), Cloudflare (for the link)
  and the sites you add download links from. No analytics, no crash reports.

## Building

```bash
scripts/setup.sh                           # fetch and build what it needs
scripts/test.sh                            # run the tests
BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   # build the app and disk image
```

`CLAUDE.md` describes every file; `docs/` has the design notes.

## License

Mouse Party is under the [MIT license](LICENSE), by Paul Ford. It comes as is,
with no warranty.

It bundles other people's work under their own licenses, listed in
[`licenses/`](licenses/README.md). ffmpeg and pandoc are GPL, so each release
includes their source.
