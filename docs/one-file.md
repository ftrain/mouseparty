# One file: the party's whole state in SQLite, optionally sealed

*A thought experiment, October 2026. Nothing here is built yet.*

Today what the app keeps is spread across `~/Library/Application Support/Mouse Party/`:

| Kept now | Where | What it is |
|---|---|---|
| Settings and the list | `settings.json` (`config.go`) | Options, plus every row's file path, subtitle choices, the PDF page, a database's last page |
| What apps keep | `apps/<name>.json` (`apps.Keeper`) | The documents (text plus edits since), Graffiti's wall, the last poll |
| The Graffiti Reel | `apps/reel.json` (`apps/reel.go`) | Its pages: picture, time in the movie, who drew |
| Pictures | `pictures/<id>.<ext>` (`pictures.go`) | Frames grabbed, pictures pasted, pictures from documents brought in, reel pages |

The idea is one file, `party.sqlite`, an ordinary SQLite database (a document type of its own later, so a double-click opens it), holding all of it. It can be moved, backed up, sent to
a co-teacher, and opened on another Mac with everything as it was. With "Use Encryption" on, the file is
unreadable without a passcode typed when the app starts.

**What never goes in:** the videos, songs, PDFs and databases themselves. The list names them by path, as now.
Opened on another Mac, a row whose file isn't there goes grey, as a missing file does today. Also never in it:
anything the app only holds while hosting, such as the session key, viewers' IDs and chat. Chat would only go in if
someday it's deliberately kept, and it would be off by default, since "leaving nothing behind" is about the people.

## The tables

```sql
CREATE TABLE meta     (key TEXT PRIMARY KEY, value TEXT);          -- schema version, created, the app version that last wrote it
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);          -- each Config field as JSON; the list is one row, 'queue'
CREATE TABLE kept     (name TEXT PRIMARY KEY, value BLOB,          -- what a Keeper's Save returns, as now (JSON)
                       saved REAL);
CREATE TABLE pictures (id TEXT PRIMARY KEY,                         -- the 16 hex characters documents name as asset:<id>
                       sha256 BLOB UNIQUE, mime TEXT, w INT, h INT,
                       bytes BLOB, added REAL);
CREATE TABLE reel     (n INTEGER PRIMARY KEY, picture TEXT REFERENCES pictures(id),
                       at REAL, title TEXT, drawn REAL, by TEXT);   -- by: JSON list of names
```

- `kept` keeps the Keeper interface exactly as it is: an app's `Save()` value as JSON. No app changes.
- When documents become more than one of each kind, the office's row splits into `documents(id, app, title, text,
  seq)` and `edits(doc, seq, by, ops)`. Then a write appends an edit instead of rewriting the document.
- Pictures go in as blobs. 400 MB of pictures in a SQLite file is ordinary. A page still fetches `img/<id>`, now
  served from the table.
- The prune at start becomes one `DELETE FROM pictures WHERE id NOT IN (…)`, over the ids every `kept` row and the
  reel name.

**Writing.** One `store` type replaces the four places that write files: `saveConfig`, the apps' Keeper saving
(`apphost.go`), `Reel.Add` and `pictures.put`. It's a single connection with every write on one goroutine, which
fits how the app already works (`run`). The journal mode is `DELETE`, not WAL, because WAL leaves `-wal` and
`-shm` files beside the database, and then it isn't one file. Writes are small and seconds apart, so WAL's speed
isn't needed.

**Which SQLite.** `data.go` uses modernc.org/sqlite to look through a database that's up. For the party file, the
better choice is [ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3):
- It's SQLite compiled to WebAssembly and run under wazero, the runtime pandoc now uses (`wasm.go`).
- It has encrypting file layers (VFSes) written in Go (below).

`data.go` could move to it too, so the app carries one SQLite instead of two.

## "Use Encryption"

A menu item in the app's menu, beside the ones Wails gives it (`App.menu`):

- **Use Encryption…** asks for a passcode twice and says plainly: *If you forget it, nothing in this file can be
  recovered.* It then rewrites the file sealed.
- Once encryption is on, the item reads **Encryption Is On ✓** and has two companions: **Change Passcode…** and
  **Stop Using Encryption…**. Stopping asks for the passcode again.

**At startup**, when the file is sealed, the window shows only a passcode field and the app's name. There's no list,
no Play button and no hosting until it opens. The passcode is typed into the Mac app's own window, never into a
viewer's page. A wrong passcode gets a short wait that doubles each time. *Start Over* (behind a confirmation) moves
the sealed file aside instead of deleting it, and starts a new party.

**How the file is sealed.** I'd use ncruces's `adiantum` VFS:
- Every page of the database is encrypted with Adiantum, Google's wide-block cipher made for disk encryption.
- The key comes from the passcode through Argon2id, a deliberately slow key derivation (the VFS's `textkey`
  parameter).
- The whole file, the schema included, looks like random bytes. Only its size and its modification time show.

Two other ways I considered and set aside:
- **SQLCipher**, the usual answer, is C. It would need cgo and an OpenSSL-like library, where today the app needs
  no cgo for SQLite.
- **Encrypting each row in Go** and keeping SQLite plain would leave table names, row counts and sizes readable.
  It would also put encryption code everywhere data is written.

Adiantum keeps prying eyes out, with two limits its README states plainly:
- **No tamper detection.** Someone with the file could garble pages without being noticed.
- **Deterministic.** Anyone holding two copies of the file, two Time Machine backups for instance, can see which
  4 KB pages changed between them, though not what's in them.

For a class's documents that's the right trade, but the menu text should promise privacy, not integrity.
(ncruces also has an XTS VFS, built only from NIST-approved primitives, with the same two limits.)

Details for building it:
- Set the key with `PRAGMA textkey` on opening, so the passcode never appears in a file name or URI.
- Set `PRAGMA temp_store = memory`, so SQLite's temporary files stay off the disk.

**Turning it on** copies the open database into a new sealed one (SQLite's backup API, page by page), syncs it,
and renames it over the old one. Changing the passcode does the same with the new key. One honest caveat for the
dialog: on an SSD, the plaintext file's old blocks aren't reliably erased when it's replaced. The full protection
is turning encryption on before the party has anything in it, or FileVault, which most Macs already have on. The
dialog can say: *Turn this on before your first party for the most protection.*

**Remember on this Mac** is an option that keeps the passcode in the macOS Keychain, so a teacher's own Mac opens
without typing. The file stays sealed for anywhere else it goes. Off by default.

## What else would hold plaintext

| Place | Holds | What to do |
|---|---|---|
| Memory while running | Everything open | Unavoidable; gone when the app quits |
| Pandoc's folder for a document brought in (`os.MkdirTemp`) | The uploaded file and its pictures, for about a second | Give wazero an in-memory folder instead (its FS config takes any `fs.FS`), so nothing touches disk |
| `~/Library/Caches/Mouse Party/wasm` | Compiled pandoc and Python code | Nothing of the user's (checked: no titles, names or paths in it) |
| macOS swap | Whatever was paged out | Encrypted by macOS on every Mac with a T2 chip or Apple Silicon |
| The list's paths, inside the file | Film titles, folder names | Sealed with everything else |

## Why this is worth it beyond encryption

- **A party you can carry.** The file is the class: the essay, the shot log, the reel, the frames. "Take it home"
  becomes *File > Save a Copy…*. The next class's teacher opens it, and only the movie files are needed alongside.
- **Several parties.** *File > New Party* and *Open Party…*, with one file per course or friend group, instead of
  one Application Support folder for everything.
- **Datasette for free.** The party file is a SQLite database, so a sealed one opened (and only while open) can be
  looked through with the same Datasette the app will carry for databases. The class can query its own reel.
