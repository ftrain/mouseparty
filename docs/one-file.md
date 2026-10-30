# One file: the party's whole state in SQLite, sealed if wanted

*Built on the `office` branch, October 2026 (`store.go`, `party.go`). It began as a thought experiment, and the
parts still only ideas are marked.*

Everything the app keeps is in one file, `~/Library/Application Support/Mouse Party/party.sqlite`, an ordinary
SQLite database. It can be moved, backed up, sent to a co-teacher, and opened on another Mac with everything as it
was. With **Party > Use Encryption…** on, the file is unreadable without a passcode typed when the app starts.

Before, the same things were spread across a folder: `settings.json`, `apps/<name>.json`, `apps/reel.json` and
`pictures/`. The first time Mouse Party makes its party file, it copies in what Open House Party kept that way
(`importOld`) and renames the old folder `Open House Party (copied into Mouse Party)`. The folder is left for its
owner to delete.

**What never goes in:** the videos, songs, PDFs and databases themselves. The list names them by path. Opened on
another Mac, a row whose file isn't there goes grey, as a missing file always has. Also never in it: anything the
app only holds while hosting, such as the session key, viewers' IDs and chat. "Leaving nothing behind" is about the
people.

## The tables

```sql
CREATE TABLE meta     (key TEXT PRIMARY KEY, value TEXT);              -- 'created'
CREATE TABLE settings (key TEXT PRIMARY KEY, value BLOB);              -- 'config': the whole Config, as JSON
CREATE TABLE kept     (name TEXT PRIMARY KEY, value BLOB, saved REAL); -- what apps keep (apps.Shelf), and 'reel'
CREATE TABLE pictures (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, added REAL); -- documents name them asset:<id>
```

- **`kept`** is `apps.Shelf`: a Keeper's `Save()` value as JSON, by the app's name, and the Graffiti Reel's
  pages as `reel`. No app changed. When documents become more than one of each kind, the office's row would split
  into `documents` and `edits`, so a write appends an edit instead of rewriting the document (an idea).
- **`pictures`** holds the bytes themselves. A page still fetches `img/<id>`. As hosting starts, pictures nothing
  kept names are deleted, and the file is vacuumed so their bytes are gone from it too.
- **Settings** are one JSON value: the same text `settings.json` held. They're edited under **Party > Settings…**,
  which works on a sealed party too. Options like the bitrate and each movie's subtitle mode have no other control
  (the window stays almost buttonless).
- **One connection**, its calls one at a time. The journal mode is `DELETE`, not WAL, because WAL leaves `-wal`
  and `-shm` files beside the database, and then it isn't one file. `temp_store` is memory. The tests check that
  the folder holds exactly one file after sealing and unsealing.

**Which SQLite.** [ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3): the real SQLite, built for
WebAssembly and translated to Go (wasm2go), so there's no cgo, and with encrypting file layers (VFSes) in Go. The
database looked through together (`data.go`) uses it too, so the app carries one SQLite.

## Use Encryption

The Party menu (`App.menu`):
- **Settings…**
- **Use Encryption…**, which asks for a passcode twice and says plainly that a forgotten one can't be recovered.
- Once on: **Encryption Is On** (checked), **Change Passcode…** and **Stop Using Encryption…**. Both ask for the
  passcode first.

**At startup**, when the file is sealed (its first bytes aren't SQLite's own), the app is locked:
- The window shows only a passcode field and the app's name (`View.Locked`).
- There's no list, nothing hosts, and nothing can be added until it opens.
- The passcode is typed into the Mac app's window, never into a viewer's page.
- Each wrong passcode makes the next try wait longer: half a second, doubling, up to 30 seconds.
- **Start Over** (behind a confirmation) moves the sealed file aside as `party (locked <date>).sqlite`, never
  deleting it, and starts a new party.

**How the file is sealed.** ncruces's `adiantum` VFS:
- Every 4 KB page is encrypted with Adiantum, a wide-block cipher made for disk encryption, with XChaCha12 and AES.
- The key comes from the passcode through Argon2id, a deliberately slow key derivation (`PRAGMA textkey`, so the
  passcode is never in a file name).
- The whole file, schema included, looks like random bytes; only its size and modification time show. The tests
  check that the words written into it aren't in the sealed file.

Sealing, changing the passcode and unsealing are all one move: `VACUUM INTO` a whole copy beside the file, sealed
with the new key (or plain, through the `os` VFS), synced, then renamed over the old file and opened again.

Two other ways I considered and set aside:
- **SQLCipher**, the usual answer, is C. It would need cgo and an OpenSSL-like library.
- **Encrypting each row in Go** while keeping SQLite plain would leave table names, row counts and sizes readable.
  It would also put encryption code everywhere data is written.

**Its limits**, which its README states plainly and the README here repeats:
- **No tamper detection.** It keeps the file private but doesn't prove it untouched.
- **Deterministic.** Anyone holding two copies of the file, two Time Machine backups for instance, can see which
  pages changed between them, though not what's in them.
- **Old blocks on an SSD.** Turning encryption on after the fact can leave the plaintext file's old blocks behind,
  since an SSD doesn't reliably erase a replaced file. The most protection is turning it on before the first
  party, or FileVault.

**Remember on this Mac**, keeping the passcode in the macOS Keychain so a teacher's own Mac opens without typing,
is an idea, not built.

## What else holds plaintext

| Place | Holds | |
|---|---|---|
| Memory while running | Everything open | Unavoidable; gone when the app quits |
| Pandoc's temporary folder for a document brought in | The uploaded file and its pictures, for about a second | Still on disk (pandoc writes its pictures out). An in-memory filesystem for wazero would remove it |
| `~/Library/Caches/Mouse Party/wasm` | Compiled pandoc | Nothing of the user's (checked: no titles, names or paths in it) |
| macOS swap | Whatever was paged out | Encrypted by macOS on Apple Silicon and T2 Macs |
| The list's paths, inside the file | Film titles, folder names | Sealed with everything else |

## Next, maybe

- **A party you can carry.** The file is the class: the essay, the shot log, the reel, the frames. *File > Save a
  Copy…*, *New Party* and *Open Party…*, with one file per course or friend group.
- **Datasette on its own party.** The party file is a SQLite database, so an open one could be looked through with
  the same tools the app has for databases. The class could query its own reel.
