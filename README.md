# Mouse Party

An app for watching movies with friends online, for macOS, Linux (Fedora) and
Windows. Your computer hosts the party; there's no server and no account, and
nothing is left behind when you quit.

[Website](https://ftrain.github.io/mouseparty/) · Downloads:

- macOS: [MouseParty-macos-arm64.dmg](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-macos-arm64.dmg)
  (Apple Silicon, macOS 13 or later)
- Linux: [MouseParty-linux-x86_64.AppImage](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-linux-x86_64.AppImage),
  which updates itself, or [MouseParty-linux-x86_64.rpm](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-linux-x86_64.rpm)
  for `sudo dnf install` (x86_64, Fedora 43 or later; the AppImage needs GTK 3,
  WebKitGTK 4.1 and glibc 2.38 or later: on Fedora, `sudo dnf install webkit2gtk4.1`)
- Windows: [MouseParty-windows-x86_64-setup.exe](https://github.com/ftrain/mouseparty/releases/latest/download/MouseParty-windows-x86_64-setup.exe)
  (x86_64, Windows 10 or later; installs for you alone, no administrator needed)

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
- Guest-facing parts run in a sandbox: macOS's own (Seatbelt) on a Mac, which
  keeps them from your files, from starting programs and from all but the
  network they need; Landlock and seccomp on Linux, the same but that their
  ports are held on any address (and with Linux older than 6.12, they can
  signal other programs); and on Windows a job object with a low-integrity
  token, which keeps them from writing your files, starting programs and
  outliving the app, though not from reading files, using the network or
  reaching one another. Settings > Security says which, on this computer.
  Only send the link to people you trust.
- Keeps one file, `party.sqlite` (beside it on Linux and Windows a `window.json`
  with the window's place, and on Windows WebView2's folder), which you can
  encrypt with a passcode or erase from the Party menu: in `~/Library/Application Support/Mouse Party` on
  a Mac, `~/.local/share/Mouse Party` on Linux, and
  `%LOCALAPPDATA%\Mouse Party` on Windows.
- Updates itself (the RPM is updated by installing the next one).
- Contacts no one but GitHub (to check for updates), Cloudflare (for the link)
  and the sites you add download links from, and on a Windows without WebView2,
  Microsoft (to install it). No analytics, no crash reports.

## Building

```bash
scripts/setup.sh                           # fetch and build what it needs
scripts/test.sh                            # run the tests
BUNDLE_FFMPEG=1 scripts/build_mac_app.sh   # on a Mac: the app and disk image
RPM=1 scripts/build_linux_app.sh           # on Fedora: the AppImage (and, with RPM=1, the RPM)
scripts/build_windows_app.sh               # on Fedora: the Windows installer
```

`CLAUDE.md` describes every file; `docs/` has the design notes.

## License

Mouse Party is under the [MIT license](LICENSE), by Paul Ford. It comes as is,
with no warranty.

It bundles other people's work under their own licenses, listed in
[`licenses/`](licenses/README.md). ffmpeg and pandoc are GPL, so each release
includes their source.
