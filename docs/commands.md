# The command graph

Everything that can be done to Mouse Party, as the fuzzers walk it. Drawn from
`graph_test.go` (`windowGraph`, `socketGraph`) and `apps/commands.go` (`apps.Commands`) by
`UPDATE_GRAPH=1 go test -run TestCommandGraphDoc .`; `go test` fails while it's stale. How it's tested: `docs/testing.md`.

## The Mac window

Its states are `App.state`'s; each command acts only in the states it leads from, and changes nothing in any other.

```mermaid
stateDiagram-v2
    empty --> between: Remove, ClearPlayed
    empty --> stopping: Remove, ClearPlayed
    linking --> empty: Remove, ClearPlayed
    linking --> between: Remove, ClearPlayed
    linking --> stopping: Remove, ClearPlayed
    nolink --> empty: Remove, ClearPlayed
    nolink --> linking: LinkClicked
    nolink --> between: Remove, ClearPlayed
    nolink --> stopping: Remove, ClearPlayed
    ready --> empty: Remove, ClearPlayed
    ready --> countdown: PlayClicked, PlayRow
    ready --> movie: PlayClicked, PlayRow
    ready --> doc: PlayClicked, PlayRow
    ready --> between: Remove, ClearPlayed
    ready --> stopping: Remove, ClearPlayed
    countdown --> empty: PlayClicked, Remove, ClearPlayed
    countdown --> linking: PlayClicked
    countdown --> nolink: PlayClicked
    countdown --> ready: PlayClicked
    countdown --> between: PlayRow, Remove, ClearPlayed
    countdown --> stopping: PlayClicked, Remove, ClearPlayed
    movie --> empty: PlayClicked, Remove, ClearPlayed
    movie --> linking: PlayClicked
    movie --> nolink: PlayClicked
    movie --> ready: PlayClicked
    movie --> between: PlayRow, Seek, Remove, ClearPlayed
    movie --> stopping: PlayClicked, Remove, ClearPlayed
    doc --> empty: PlayClicked, Remove, ClearPlayed
    doc --> linking: PlayClicked
    doc --> nolink: PlayClicked
    doc --> ready: PlayClicked, TurnPage
    doc --> between: PlayRow, TurnPage, Remove, ClearPlayed
    doc --> stopping: PlayClicked, TurnPage, Remove, ClearPlayed
    between --> empty: PlayClicked, Remove, ClearPlayed
    between --> linking: PlayClicked
    between --> nolink: PlayClicked
    between --> ready: PlayClicked
    between --> stopping: PlayClicked, Remove, ClearPlayed
    stopping --> empty: Remove, ClearPlayed
    stopping --> between: Remove, ClearPlayed
```

Besides those, the app moves on its own (the link made, a countdown over, a movie ended, a file gone).

| Command | What it is | Acts in |
|---|---|---|
| `PlayClicked` | Play, or Stop | ready, countdown, movie, doc, between |
| `PlayRow` | a row double-clicked: play it, or switch to it; a failed download's, try it again | every state |
| `Seek` | the slider let go | movie |
| `ShowPage` | a PDF's page, from the slider | doc |
| `TurnPage` | the arrow keys; past the last page, on | doc |
| `Select` | a row clicked | every state |
| `Move` | a row dragged | every state |
| `Remove` | Backspace: the selected row | every state |
| `ClearPlayed` | Party > Clear Played Files (⌘R): every row above the one playing, or next to play | every state |
| `LinkClicked` | copy the link, or try again for one | every state |
| `SetSettingsText` | Party > Settings: the settings and the list, as JSON (off the app's goroutine; while playing it says Stop first) | every state |
| `AddPaths` | files dropped (off the app's goroutine: no immediate state) | every state |
| `SetPrefs` | Party > Settings (⌘,): a setting changed in the Settings window, kept at once (off the app's goroutine: no immediate state) | every state |
| `AddURL` | Party > Add Download Link: a row downloading from a link (off the app's goroutine: no immediate state) | every state |

Not walked: `CacheText`, a question: what the download cache holds; `CheckForUpdates`, updates (updates_test.go): looked for, downloaded, checked and put in, from a stand-in GitHub; `ClearCache`, the download cache (download_test.go): every download deleted, the rows kept; `GetView`, a question, not a command: every step reads the view; `LoginFor`, a question: the login the Add Download Link sheet fills in (download_test.go); `Prefs`, a question: SetPrefs is walked; `RemoveAccount`, the Settings window's accounts (prefs_test.go); `RestartToUpdate`, updates (updates_test.go): it quits the app, so it isn't walked; `SaveAccount`, the Settings window's accounts (prefs_test.go); `SetPasscode`, the sealed party (store_test.go); `SettingsText`, a question: SetSettingsText is walked; `StartOver`, the sealed party (store_test.go); `Unlock`, the sealed party (store_test.go): Argon2 is too slow to fuzz.

## A viewer's page, on its socket

| Type | Fields | What it is |
|---|---|---|
| `join` | `name` (str) | take a name (or another) |
| `say` | `text` (str) | a line of chat |
| `app_open` | `name` (app) | open an app for everyone |
| `app_close` | `id` (appid) | close one for everyone |
| `doc_at` | `token` (str), `at` (str), `back` (bool) | a page of the database up |
| `doc_page` | `token` (doctoken), `page` (int) | turning everyone's page of the document up: chat says who |
| `doc_read` | `token` (doctoken), `page` (int) | reading on one's own, resting on a page (0: back to everyone's): chat says so |
| `doc_pages` | `token` (doctoken), `pages` (int) | the document up, laid out as so many pages |
| `doc_pace` | `token` (doctoken), `pace` (int) | everyone's pace: a page every so many seconds |
| `app` | `id` (appid) | a message for an app: its kind and fields are apps.Commands |

## The apps

What a page sends each app, as `{"type": "app", "id", "kind", ...}`.

| App | Kind | Fields |
|---|---|---|
| Graffiti | `line` | `c` (int), `w` (int), `p` (points) |
| Stickies | `add` | `text` (str), `c` (int), `x` (num), `y` (num), `at` (num), `page` (int) |
|  | `move` | `sid` (int), `x` (num), `y` (num) |
|  | `color` | `sid` (int), `c` (int) |
|  | `remove` | `sid` (int) |
| Room | `go` | `x` (num), `y` (num) |
| Call | `join` |  |
|  | `live` |  |
|  | `leave` |  |
|  | `mute` | `muted` (bool) |
| Bingo | `card` |  |
| Word Grid | `word` | `word` (str) |
| Tiles | `play` | `tiles` (tiles) |
|  | `swap` | `letters` (str) |
|  | `pass` |  |
|  | `join` |  |
|  | `leave` |  |
|  | `start` |  |
| Anagrams | `guess` | `guess` (str) |
| Sketch | `line` | `c` (int), `w` (int), `p` (points) |
|  | `clear` |  |
|  | `guess` | `guess` (str) |
|  | `join` |  |
|  | `leave` |  |
|  | `start` |  |
| Blanks | `answer` | `text` (str) |
|  | `vote` | `i` (int) |
| Spies | `pick` | `i` (int) |
|  | `clue` | `word` (str), `n` (int) |
|  | `pass` |  |
|  | `join` |  |
|  | `leave` |  |
|  | `start` |  |
| Werewolf | `kill` | `i` (int) |
|  | `see` | `i` (int) |
|  | `exile` | `i` (int) |
|  | `join` |  |
|  | `leave` |  |
|  | `start` |  |
| Polls | `ask` | `question` (str), `options` (strs) |
|  | `vote` | `i` (int) |
|  | `close` |  |
| Document | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Outline | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Slides | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Sheet | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Diagram | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Drawing | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Pinboard | `edit` | `base` (int), `eid` (str), `ops` (ops) |
|  | `snap` | `seq` (int), `text` (str) |
|  | `seed` | `text` (str) |
|  | `sync` |  |
| Graffiti Reel | (none) | |
